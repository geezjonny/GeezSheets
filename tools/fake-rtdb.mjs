// Offline compat RTDB with asynchronous child/value delivery and atomic shared state.
const copy=v=>v===undefined?null:structuredClone(v);
const parts=p=>p.split('/').filter(Boolean);
const at=(o,p)=>parts(p).reduce((v,k)=>v?.[k],o)??null;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// RTDB removes null object children and empty containers rather than storing them.
function normalize(v){
 if(v===null||v===undefined)return null;
 if(Array.isArray(v)){const a=v.map(normalize);while(a.length&&a.at(-1)===null)a.pop();return a.length?a:null;}
 if(typeof v==='object'){const entries=Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,normalize(x)]).filter(([,x])=>x!==null);return entries.length?Object.fromEntries(entries):null;}
 return v;
}
const snap=(key,value)=>({key,val:()=>copy(value),exists:()=>value!==null});
const delay=()=>40+Math.floor(Math.random()*111);
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
export function createFakeRTDB(initial={}){
 let tree=normalize(copy(initial))||{};const clients=new Set(),stats={commits:0,transactions:[],attempts:[],aborts:0};
 const resolve=v=>Array.isArray(v)?v.map(resolve):v&&typeof v==='object'?(v['.sv']==='timestamp'?Date.now():Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolve(x)]))):v;
 function put(o,p,v){const root=o,ks=parts(p);if(!ks.length)return normalize(v)||{};for(const k of ks.slice(0,-1))o=o[k]??={};if(v==null)delete o[ks.at(-1)];else o[ks.at(-1)]=copy(v);return root;}
 function mutate(writer,values){
  const before=copy(tree);for(const [p,v]of Object.entries(values))tree=normalize(put(tree,p,resolve(v)))||{};stats.commits++;
  // Each connection preserves server event order. Remote events follow writer events.
  writer.enqueue(before,copy(tree),0);const local=writer.pending();
  for(const c of clients)if(c!==writer)c.enqueue(before,copy(tree),delay(),local);
 }
 function client(){
  let cache={},tail=Promise.resolve();const watchers=new Set(),disconnects=new Map();
  const c={
   pending:()=>tail,
   enqueue(before,after,ms,local=Promise.resolve()){
    tail=Promise.all([tail,local]).then(()=>sleep(ms)).then(async()=>{
     for(const w of watchers){
      const a=at(before,w.path),b=at(after,w.path);cache=put(cache,w.path,b);
      if(w.event==='value'){if(!same(a,b))await w.cb(snap(parts(w.path).at(-1)||null,b));continue;}
      for(const k of new Set([...Object.keys(a||{}),...Object.keys(b||{})])){
       const x=a?.[k]??null,y=b?.[k]??null;
       if(w.event==='child_added'&&x===null&&y!==null||w.event==='child_removed'&&x!==null&&y===null||w.event==='child_changed'&&x!==null&&y!==null&&!same(x,y))await w.cb(snap(k,y===null?x:y));
      }
     }
    });
   },
   ref(path=''){
    path=parts(path).join('/');const key=parts(path).at(-1)||null;
    return {key,child:p=>c.ref(path+'/'+p),
     on(event,cb){const w={path,event,cb};watchers.add(w);const initial=copy(at(tree,path));tail=tail.then(()=>sleep(delay())).then(()=>{if(!watchers.has(w))return;cache=put(cache,path,initial);if(event==='value')cb(snap(key,initial));else if(event==='child_added')for(const [k,v]of Object.entries(initial||{}))cb(snap(k,v));});return cb;},
     off(event,cb){for(const w of watchers)if(w.path===path&&(!event||w.event===event)&&(!cb||w.cb===cb))watchers.delete(w);},
     async once(){await tail;await sleep(delay());const v=copy(at(tree,path));cache=put(cache,path,v);return snap(key,v);},
     async set(v){mutate(c,{[path]:v});await tail;await sleep(delay());cache=put(cache,path,at(tree,path));},
     async update(values){mutate(c,Object.fromEntries(Object.entries(values).map(([p,v])=>[path+'/'+p,v])));await tail;await sleep(delay());},
     async remove(){return this.set(null);},
     async transaction(fn){
      stats.transactions.push(path);let before=copy(at(cache,path));
      for(let i=0;i<100;i++){
       const v=fn(copy(before));if(v===undefined){stats.aborts++;return {committed:false,snapshot:snap(key,before)};}
       const r=await c.compare(path,before,v);if(r.committed)return {committed:true,snapshot:snap(key,r.value)};before=r.value;
      }throw Error('Fake transaction retries exhausted');
     },
     onDisconnect:()=>({remove:async()=>{disconnects.set(path,null);await sleep(delay());},cancel:async()=>{disconnects.delete(path);await sleep(delay());}})
    };
   },
   async compare(path,expected,value){stats.attempts.push(path);await sleep(delay());const current=at(tree,path);cache=put(cache,path,current);if(!same(current,normalize(expected)))return {committed:false,value:copy(current)};mutate(c,{[path]:value});const committed=copy(at(tree,path));await tail;await sleep(delay());cache=put(cache,path,committed);return {committed:true,value:committed};},
   disconnect(){if(disconnects.size)mutate(c,Object.fromEntries(disconnects));disconnects.clear();watchers.clear();clients.delete(c);}
  };clients.add(c);return c;
 }
 const admin=client();return {ref:admin.ref,client,dump:()=>copy(tree),stats};
}
// Each document has a separate connection and cache, backed by one shared server.
export async function installFake(context,db){
 const sessions=new Map();
 await context.exposeBinding('__fakeRPC',async({page,frame},op,path,arg={})=>{
  let entry=sessions.get(frame);
  if(entry?.doc!==arg.doc){entry?.client.disconnect();entry={doc:arg.doc,client:db.client()};sessions.set(frame,entry);page.once('close',()=>{entry.client.disconnect();sessions.delete(frame);});}
  const r=entry.client.ref(path);
  if(op==='once')return (await r.once('value')).val();
  if(op==='set'||op==='update')return r[op](arg.value);
  if(op==='compare')return entry.client.compare(path,arg.expected,arg.value);
  if(op==='disconnect.remove')return r.onDisconnect().remove();
  if(op==='disconnect.cancel')return r.onDisconnect().cancel();
  if(op==='on'){
   const callback=s=>frame.evaluate(({doc,id,key,value})=>{if(window.__fakeDocument===doc)window.__fakeEvents?.[id]?.({key,val:()=>value,exists:()=>value!==null});},{doc:arg.doc,id:arg.id,key:s.key,value:s.val()}).catch(()=>{});
   r.on(arg.event,callback);
  }
 });
 await context.addInitScript(()=>{
  window.__fakeEvents={};window.__fakeDocument=crypto.randomUUID();let next=0,cache={};
  const parts=p=>p.split('/').filter(Boolean),at=p=>parts(p).reduce((v,k)=>v?.[k],cache)??null;
  function put(p,v){const ks=parts(p);if(!ks.length){cache=v||{};return;}let o=cache;for(const k of ks.slice(0,-1))o=o[k]??={};if(v==null)delete o[ks.at(-1)];else o[ks.at(-1)]=structuredClone(v);}
  const snapshot=(key,value)=>({key,val:()=>structuredClone(value),exists:()=>value!==null});
  function ref(path=''){
   path=parts(path).join('/');const key=parts(path).at(-1),callbacks=new Map();
   const call=(op,arg={})=>window.__fakeRPC(op,path,{...arg,doc:window.__fakeDocument});
   return {key,child:p=>ref(path+'/'+p),
    on(event,cb){const id=String(++next);callbacks.set(cb,id);window.__fakeEvents[id]=s=>{put(event==='value'?path:path+'/'+s.key,event==='child_removed'?null:s.val());cb(s);};void call('on',{event,id});return cb;},
    off(event,cb){if(cb){delete window.__fakeEvents[callbacks.get(cb)];callbacks.delete(cb);}else for(const id of callbacks.values())delete window.__fakeEvents[id];},
    once:async()=>{const value=await call('once');put(path,value);return snapshot(key,value);},
    set:async value=>{put(path,value);return call('set',{value});},
    update:async value=>{for(const [p,v]of Object.entries(value))put(path+'/'+p,v);return call('update',{value});},remove:()=>call('set',{value:null}),
    async transaction(fn){let before=structuredClone(at(path));for(let i=0;i<100;i++){const value=fn(structuredClone(before));if(value===undefined)return {committed:false,snapshot:snapshot(key,before)};const r=await call('compare',{expected:before,value});put(path,r.value);if(r.committed)return {committed:true,snapshot:snapshot(key,r.value)};before=r.value;}throw Error('Fake transaction retries exhausted');},
    onDisconnect:()=>({remove:()=>call('disconnect.remove'),cancel:()=>call('disconnect.cancel')})
   };
  }
  window.__GEEZ_FIREBASE__={ref};
 });
}
