import {executeWrite,equalJSON} from './gaia-core/write.mjs';
import {schema} from './gaia-core/schema-loader.mjs';
import {encodeKey,decodeKey,encodePath,encodeTree,decodeTree} from './gaia-core/firebase-layout.mjs';
const clone=v=>structuredClone(v);
const get=(o,p)=>p.split('/').filter(Boolean).reduce((v,k)=>v?.[k],o)??null;
function set(o,p,v){const ks=p.split('/');for(const k of ks.slice(0,-1))o=o[k]??={};if(v===null)delete o[ks.at(-1)];else o[ks.at(-1)]=clone(v);}
async function sdk(){
 if(window.__GEEZ_FIREBASE__)return window.__GEEZ_FIREBASE__;
 if(!window.firebase?.database){
  for(const name of ['app','database'])await new Promise((ok,no)=>{const s=document.createElement('script');s.src=`https://www.gstatic.com/firebasejs/11.1.0/firebase-${name}-compat.js`;s.onload=ok;s.onerror=no;document.head.append(s);});
 }
 const app=firebase.apps.find(a=>a.name==='gaia')||firebase.initializeApp(window.GEEZ_FIREBASE_CONFIG||{databaseURL:'https://geezsheets-default-rtdb.firebaseio.com',projectId:'geezsheets'},'gaia');
 return app.database();
}
export async function connect(base,onEvent,identity){
 const target=base==='firebase'?'/v2':base.slice('firebase:'.length);
 if(target!=='/v2'&&!/^\/v2-test\/[a-zA-Z0-9_-]+$/.test(target))throw Error('Firebase target must be /v2 or /v2-test/<run-id>');
 const db=await sdk(),root=db.ref(target),cache={worlds:{gaia:{entities:{},links:{}}},campaigns:{},apps:{}},unsubs=[];
 // Files are deliberately outside all initial subscriptions.
 const collections=['worlds/gaia/entities','worlds/gaia/links','campaigns','apps'];
 await Promise.all(collections.map(async path=>{
  const ref=root.child(path);
  for(const event of ['child_added','child_changed','child_removed']){
   const fn=s=>{if(s.key==='%EMPTY')return;const p=path+'/'+decodeKey(s.key),value=event==='child_removed'?null:decodeTree(s.val());set(cache,p,value);onEvent({path:'/v2/'+p,value});};
   ref.on(event,fn);unsubs.push(()=>ref.off(event,fn));
  }
  const s=await ref.once('value');set(cache,path,decodeTree(s.val()||{}));
 }));
 const initialBytes=new TextEncoder().encode(JSON.stringify(cache)).length;
 console.log(`Gaia Firebase initial load: ${initialBytes} bytes (files excluded)`);
 const owner=crypto.randomUUID(),lock=root.child('_writer');let closed=false,serverOffset=0;
 // An abort does not contact the server. Keep acquisition retries informed when
 // another browser releases its lock, even if our cached value still names it.
 const lockFn=()=>{};lock.on('value',lockFn);unsubs.push(()=>lock.off('value',lockFn));
 const offset=db.ref('.info/serverTimeOffset'),offsetFn=s=>{serverOffset=Number(s.val())||0;};
 offset.on('value',offsetFn);unsubs.push(()=>offset.off('value',offsetFn));
 const timestamp=window.firebase?.database?.ServerValue?.TIMESTAMP||{'.sv':'timestamp'};
 async function exclusive(fn){
  // Serialize cooperating clients across all records: actions can span entities and campaigns.
  // The root CAS below fences expired owners, including tabs paused during a write.
  let acquired=false;
  for(let i=0;i<200&&!closed;i++){
   const r=await lock.transaction(v=>v===null||Object.values(v).every(lease=>typeof lease?.at==='number'&&Date.now()+serverOffset-lease.at>10000)?{[owner]:{at:timestamp}}:undefined,undefined,false);
   if(r.committed){acquired=true;break;}
   await new Promise(ok=>setTimeout(ok,30));
  }
  if(!acquired)throw Error('Gaia writer busy; retry');
  const disconnect=lock.child(owner).onDisconnect?.();
  try{await disconnect?.remove();return await fn();}
  // RTDB runs the handler first on the cached value (often null); proposing null lets the server retry with the real value.
  finally{await disconnect?.cancel();await lock.transaction(v=>v===null||v?.[owner]?null:undefined,undefined,false);}
 }
 function evaluate(state,plans,guards){
  for(const guard of guards)if(!equalJSON(get(state,guard.path),guard.value))throw Object.assign(Error('Gaia value changed; retry transaction'),{status:409});
  const id=identity(),auth={role:id==='gm'?'gm':'player',pcs:id==='gm'?[]:id.slice(7).split(',')};
  const written=new Set();let result;
  for(const p of plans){
   const outcome=executeWrite(state,schema,p.path,p.method,p.body,auth);result=outcome.result;
   for(const w of outcome.writes){set(state,w.path,w.value);written.add(w.path);}
  }
  return {result,written};
 }
 async function batch(plans,guards=[]){
  // Previews are pure: neither lock nor refresh the live mirror.
  if(plans.every(p=>p.body?.preview))return evaluate(clone(cache),plans,guards).result;
  const state=clone(cache),trial=evaluate(clone(state),plans,[]),paths=[...trial.written];
  const entity=paths.length&&paths.every(p=>/^worlds\/gaia\/entities\/[^/]+$/.test(p)&&p===paths[0])?paths[0]:null;
  const field=paths.length&&paths.every(p=>/^campaigns\/[^/]+\/state\/[^/]+(?:\/|$)/.test(p))?paths[0].split('/').slice(0,4).join('/'):null;
  const single=paths.length===1&&!/^(worlds\/gaia\/entities|campaigns|apps|worlds\/gaia\/links)$/.test(paths[0])?paths[0]:null;
  const target=entity||(field&&paths.every(p=>p===field||p.startsWith(field+'/'))?field:null)||single;
  if(target){
   let result,error;
   const r=await root.child(encodePath(target)).transaction(value=>{
    const next=clone(state);set(next,target,decodeTree(value));
    try{
     const out=evaluate(next,plans,guards);result=out.result;error=null;
     if([...out.written].some(p=>p!==target&&!p.startsWith(target+'/')))throw Error('Gaia transaction scope changed');
     return encodeTree(get(next,target));
    // Never abort: RTDB runs this first on a possibly stale local cache. Returning the value unchanged
    // makes the server re-run it with the real value; a failure that survives that is raised below.
    }catch(e){error=e;return value;}
   },undefined,false);
   if(error||!r.committed)throw error||Object.assign(Error('Gaia value changed; retry transaction'),{status:409});
   return result;
  }
  if(!paths.length)return trial.result;
  return exclusive(async()=>{
   let result,error;
   // A root CAS fences expired owners and conflicts with node transactions.
   // This keeps multi-record actions atomic alongside the fast path.
   await root.once('value');
   const r=await root.transaction(value=>{
    if(!value?._writer?.[owner]){error=Object.assign(Error('Gaia writer lease expired; retry'),{status:409});return value;}
    const next=decodeTree(value);
    try{const out=evaluate(next,plans,guards);result=out.result;error=null;return encodeTree(next);}
    catch(e){error=e;return value;}
   },undefined,false);
   if(error)throw error;
   if(!r.committed)throw error||Object.assign(Error('Gaia value changed; retry transaction'),{status:409});
   return result;
  });
 }

 return {
  initialBytes,snapshot:()=>clone(cache),batch,
  async refresh(){
   await Promise.all(collections.map(async path=>{
    const s=await root.child(encodePath(path)).once('value');set(cache,path,decodeTree(s.val()||{}));
   }));
  },
  async request(path,method='GET',body){
   if(path.startsWith('apps/sheets/files/')){
    const key=decodeURIComponent(path.slice('apps/sheets/files/'.length)),ref=root.child('files/'+encodeKey(key));
    if(method==='GET')return (await ref.once('value')).val();
    if(identity()!=='gm')throw Object.assign(Error('Files require GM'),{status:403});
    await ref.set(body.value);return body.value;
   }
   if(method==='GET')return path==='entities'?Object.values(cache.worlds.gaia.entities):clone(get(cache,path));
   return batch([{path,method,body}]);
  },
  close(){closed=true;unsubs.forEach(fn=>fn());}
 };
}
