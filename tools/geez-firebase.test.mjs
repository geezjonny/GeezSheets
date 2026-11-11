import {playerScenarios} from './geez-player-scenarios.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {createFakeRTDB,installFake} from './geez-fake-rtdb.mjs';
import {firebaseLayout,sizes,encodeKey,decodeKey,encodeTree,decodeTree} from '../../GeezSuite/core/firebase-layout.mjs';
import {rest} from '../../GeezSuite/tools/upload-v2.mjs';
import {sha256} from '../../GeezSuite/core/sha256.mjs';
import {stableId} from '../../GeezSuite/core/ids.mjs';
const fake=process.argv.includes('--fake'),run='sheets-'+randomUUID(),target='v2-test/'+run;
const source=new URL('../../GeezSuite/data/gaia-v2.json',import.meta.url),original=await readFile(source),data=JSON.parse(original),layout=firebaseLayout(data);
console.log(fake?'OFFLINE fake RTDB mode':'REAL Firebase isolated test: /'+target);console.log('Bytes:',sizes(layout));
for(const key of ['a.b#c$d[e]f/g','%2E','0','123','a%EMPTY','é/🧙'])assert.equal(decodeKey(encodeKey(key)),key);
assert.deepEqual(decodeTree(encodeTree({'1':{},a:[],nested:{'a.b/#$[]%':42}})),{'1':{},a:[],nested:{'a.b/#$[]%':42}});
const extracted=decodeTree(firebaseLayout({worlds:{gaia:{entities:{m:{data:{image:'data:image/png;base64,AAAA'}}}}},apps:{sheets:{files:{'a.#$[]/%.png':'data:image/png;base64,BBBB'}}}}));
assert.equal(extracted.files[extracted.worlds.gaia.entities.m.data.image],'data:image/png;base64,AAAA');
assert.equal(extracted.files['a.#$[]/%.png'],'data:image/png;base64,BBBB');
const {files,...withoutFiles}=extracted;assert.ok(!JSON.stringify(withoutFiles).includes('data:'));assert.equal(extracted.apps.sheets.files,undefined);
for(const s of ['','abc','🧙'.repeat(100)])assert.equal(sha256(s),createHash('sha256').update(s).digest('hex'));
const bytes=createHash('sha256').update('pc\0Ashara').digest();assert.equal(stableId('pc','Ashara'),'pc_'+Array.from(bytes.subarray(0,12),b=>'abcdefghijklmnopqrstuvwxyz0123456789'[b%36]).join(''));
assert.deepEqual(decodeTree({'%EMPTY':'object',child:{name:'Card'}}),{child:{name:'Card'}});
assert.deepEqual(decodeTree({'%EMPTY':'object','%25EMPTY':'real key'}),{'%EMPTY':'real key'});
console.log('PASS reversible keys, empty containers, numeric object keys and browser SHA-256');
// Exercise every required fake compat operation independently of the adapter.
{
 const f=createFakeRTDB(),a=f.ref('test'),events=[];
 for(const event of ['child_added','child_changed','child_removed','value'])a.on(event,s=>events.push([event,s.key,s.val()]));
 await a.child('one').set({n:1});await a.update({'one/n':2,'two/n':3});
 await a.child('one/n').transaction(n=>n+1);assert.equal((await a.child('one/n').once('value')).val(),3);
 assert.equal((await a.child('one/n').transaction(()=>undefined)).committed,false);
 await a.child('two').remove();await new Promise(ok=>setTimeout(ok,10));
 for(const event of ['child_added','child_changed','child_removed','value'])assert.ok(events.some(([name])=>name===event),event);
 assert.deepEqual(events.find(([name])=>name==='child_removed').slice(1),['two',{n:3}]);
 console.log('PASS fake compat child/value events, multipath update, transactions, abort and remove');
}
// Unknown transaction values are null, even when another connection owns the lock.
{
 const f=createFakeRTDB(),owner=f.client(),cold=f.client();
 await owner.ref('writer').set({owner:'old'});
 const seen=[];
 assert.equal((await cold.ref('writer').transaction(v=>{seen.push(v);return v?.owner==='old'?null:undefined;})).committed,false);
 assert.deepEqual(seen,[null]); // The former release handler aborts here on REAL RTDB.
 assert.equal((await cold.ref('writer').transaction(v=>v===null||v.owner==='old'?null:undefined)).committed,true);
 assert.equal(f.dump().writer,undefined);
 await owner.ref('writer').set({old:{at:Date.now()}});
 await owner.ref('writer/old').onDisconnect().remove();
 await cold.ref('writer').set({successor:{at:Date.now()}});
 owner.disconnect();assert.ok(f.dump().writer.successor,'expired disconnect must not delete successor');
 cold.disconnect();console.log('PASS cold-cache release regression and owner-scoped disconnect');
}
const root=fileURLToPath(new URL('../',import.meta.url));let browser,web,before,uploaded=false;
const db=createFakeRTDB({[target.split('/')[0]]:{[run]:layout}}),errors=[];
try{
 if(!fake){before=await rest('','GET',undefined,'?shallow=true');uploaded=true;await rest(target,'PUT',layout);}
 web=http.createServer(async(req,res)=>{try{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!p.startsWith(root))throw Error('path');const body=await readFile(p);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png'})[extname(p)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end();}});
 await new Promise(ok=>web.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+web.address().port;
 const {chromium}=await import(pathToFileURL(join(process.env.APPDATA,'npm/node_modules/@playwright/mcp/node_modules/playwright/index.mjs')));
 browser=await chromium.launch({headless:true,channel:'msedge'});
 const contexts=[];
 async function page(query='',sheet=false,campaign='world__daddies'){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);if(fake)await installFake(context,db);
  const p=await context.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))console.log('BROWSER:',m.text());});p.on('dialog',d=>d.accept(d.type()==='prompt'?'Firebase Test Campaign':undefined));
  if(fake)await p.route(/https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
  await p.goto(`${base}/${sheet?'geez-sheet':'geez-index'}.html?db=gaia&gaia=firebase:/${target}${campaign?'&campaign='+encodeURIComponent(campaign):''}&test&${query}`,{waitUntil:'domcontentloaded'});
  if(sheet)await p.waitForFunction(()=>document.querySelector('#cardsWrap')?.textContent.includes('Ashara'));else await p.waitForFunction(()=>window.__SHEETS__?.state().data.pcs.ashara);
  return p;
 }
 const gm=await page('gm=jonny'),player=await page('player&pc=ashara',false,null),sheet=await page('char=ashara&live=world__daddies',true,null);
 console.log('PASS independent GM, player and player sheet load');
 await playerScenarios(gm,player,sheet);
 // Direct canonical API uses the exact same browser transport as the adapter.
 await gm.evaluate(async target=>{const m=await import('./js/geez-gaia-firebase.mjs');window.__core=await m.connect('firebase:/'+target,()=>{},()=> 'gm');},target);
 console.log('Measured browser initial load:',await gm.evaluate(()=>window.__core.initialBytes),'bytes; no files subtree');
 const request=(path,method='GET',body)=>gm.evaluate(({path,method,body})=>window.__core.request(path,method,body),{path,method,body});
 const act=(name,args)=>request('actions/'+name,'POST',{args});
 const ash=Object.values(data.worlds.gaia.entities).find(e=>e.kind==='pc'&&e.name==='Ashara');
 await gm.evaluate(()=>window.__SHEETS__.database().ref('characters/pcs/ashara/combat/hp_current').set(17));
 await player.waitForFunction(()=>window.__SHEETS__.state().data.pcs.ashara.combat.hp_current===17);
 await sheet.waitForFunction(()=>document.querySelector('#hpval-ashara')?.textContent.startsWith('17 /'));
 if(fake){
  const hpWrites=()=>db.stats.attempts.filter(p=>p===target+'/worlds/gaia/entities/'+encodeKey(ash.id)).length;
  const count=hpWrites();await new Promise(ok=>setTimeout(ok,1800));
  assert.equal(hpWrites(),count,'remote HP delivery must produce no hp.set echo');
 }
 await sheet.locator('#hpdelta-ashara').fill('1');await sheet.locator('.hp-btn.dmg').first().click();
 await gm.waitForFunction(()=>window.__SHEETS__.state().data.pcs.ashara.combat.hp_current===16);
 console.log('PASS sheet UI HP reaches GM and GM HP reaches player/sheet live without write echoes');
 // The second call edits from 16, not the value after the first queued write.
 // On the former adapter it refreshed to 17 then incorrectly staged hp.set(16).
 await gm.evaluate(async()=>{
  const r=window.__SHEETS__.database().ref('characters/pcs/ashara/combat/hp_current');
  await Promise.all([r.transaction(n=>n+1),r.set(16)]);
 });
 await gm.waitForFunction(()=>window.__SHEETS__.state().data.pcs.ashara.combat.hp_current===17);
 console.log('PASS queued stale-copy save preserves the user edit baseline');
 assert.equal(await player.evaluate(async()=>{try{await window.__SHEETS__.database().ref('characters/pcs/liora/combat/hp_current').set(1);return 200;}catch(e){return e.status;}}),403);
 const grouped=Object.entries(data.campaigns.daddies.state.tokens).find(([,v])=>v[ash.id]),map=grouped[0];
 const ids=await gm.evaluate(()=>window.__SHEETS__.database().ids());
 const tokenPath=`geezvtt/live/world__daddies/tokens/${ids.newToOld[map]||map}/${ids.newToOld[ash.id]||ash.id}`;
 await Promise.all([
  player.evaluate(()=>window.__SHEETS__.database().ref('characters/pcs/ashara/combat/hp_current').set(15)),
  gm.evaluate(path=>window.__SHEETS__.database().ref(path).update({x:.42,y:.43}),tokenPath)
 ]);
 await gm.waitForFunction(()=>window.__SHEETS__.state().data.pcs.ashara.combat.hp_current===15);
 assert.equal((await request(`campaigns/daddies/state/tokens/${map}/${ash.id}`)).x,.42);
 await player.waitForFunction(async path=>(await window.__SHEETS__.database().ref(path).once('value')).val()?.x===.42,tokenPath);
 await player.evaluate(path=>window.__SHEETS__.database().ref(path).update({x:.44,y:.45}),tokenPath);
 await gm.waitForFunction(async path=>(await window.__SHEETS__.database().ref(path).once('value')).val()?.x===.44,tokenPath);
 console.log('PASS ownership, concurrent HP/token writes survive, player token move live');
 if(fake){
  const lockAttempts=()=>db.stats.attempts.filter(p=>p===target+'/_writer').length;
  const count=lockAttempts();
  await gm.evaluate(async({target,id})=>{
   const m=await import('./js/geez-gaia-firebase.mjs');
   const clients=await Promise.all(Array.from({length:6},()=>m.connect('firebase:/'+target,()=>{},()=> 'gm')));
   try{await Promise.all(clients.map(c=>c.request('actions/hp.damage','POST',{args:{entity:id,amount:1}})));}
   finally{clients.forEach(c=>c.close());}
  },{target,id:ash.id});
  assert.equal(decodeTree(db.dump()['v2-test'][run]).worlds.gaia.entities[ash.id].data.combat.hp_current,9);
  assert.equal(lockAttempts(),count,'single-entity actions must not acquire the global lock');
  await act('hp.set',{entity:ash.id,amount:15});
  await db.ref(target+'/_writer').set({crashed:{at:Date.now()-11000}});
  await gm.evaluate(async id=>window.__core.batch([
   {path:'actions/hp.set',method:'POST',body:{args:{entity:id,amount:15}}},
   {path:'campaigns/daddies/state/session',method:'PUT',body:{value:{lockMove:false}}}
  ]),ash.id);
  assert.equal(db.dump()['v2-test'][run]._writer,undefined);
  console.log('PASS six concurrent entity transactions bypass lock; expired multi-record lease recovers');
 }
 // A failing second plan must roll back the first plan and emit no persisted HP change.
 assert.equal(await gm.evaluate(async id=>{try{await window.__core.batch([{path:'actions/hp.set',method:'POST',body:{args:{entity:id,amount:1}}},{path:'entities/'+id,method:'PATCH',body:{kind:'invalid'}}]);return 200;}catch(e){return e.status;}},ash.id),400);
 assert.equal((await request('worlds/gaia/entities/'+ash.id)).data.combat.hp_current,15);
 console.log('PASS invalid atomic batch leaves HP unchanged');
 await Promise.all([gm,player].map(p=>p.evaluate(()=>window.__SHEETS__.database().ref('characters/pcs/ashara/combat/hp_current').transaction(n=>n-1))));
 await gm.waitForFunction(()=>window.__SHEETS__.state().data.pcs.ashara.combat.hp_current===13);
 await player.waitForFunction(()=>window.__SHEETS__.state().data.pcs.ashara.combat.hp_current===13);
 console.log('PASS concurrent sheet HP transactions both survive');
 await act('initiative.set',{campaign:'daddies',list:[{name:'Ashara',init:18},{name:'Liora',init:12}]});
 await act('initiative.next',{campaign:'daddies'});
 await player.waitForFunction(()=>window.__SHEETS__.state().data.initiative?.turn&&Object.values(window.__SHEETS__.state().data.initiative.rows).some(r=>r.name==='Liora')).catch(async e=>{console.log('INIT DEBUG',await player.evaluate(()=>({campaign:window.__SHEETS__.state().campaign,init:window.__SHEETS__.state().data.initiative})),await request('campaigns/daddies/state/initiative'));throw e;});
 assert.equal((await request('campaigns/daddies/state/initiative')).turn,1);
 console.log('PASS initiative next persists and reaches player');
 await gm.locator('#campaignSelect').selectOption('__new');await gm.waitForFunction(()=>window.__SHEETS__.state().campaign!=='world__daddies');
 const world=await gm.evaluate(()=>window.__SHEETS__.state().campaign),campaign=world.replace(/^world__/,'');
 await gm.locator('#mapUploadEmpty').setInputFiles(fileURLToPath(new URL('../textures/door/arch.png',import.meta.url)));
 await gm.waitForFunction(id=>window.__SHEETS__.state().loaded&&window.__SHEETS__.state().data.maps[id]?.image==='arch.png',world);
 assert.equal((await request('apps/sheets/files/arch.png'))?.startsWith('data:image/'),true);
 const other=await page('gm=jonny',false,world);await other.waitForFunction(id=>window.__SHEETS__.state().data.maps[id]?.image==='arch.png',world);await other.locator('#campaignSelect').selectOption(world);await other.evaluate(()=>window.__SHEETS__.view('WORLD'));await other.waitForFunction(id=>window.__SHEETS__.state().campaign===id&&window.__SHEETS__.state().loaded,world);
 await Promise.all([gm,other].map(p=>p.evaluate(async()=>{await window.__SHEETS__.database().ref('geezvtt/live/world__daddies/rollcall/count').transaction(n=>(n||0)+1);})));
 await gm.waitForFunction(async()=>(await window.__SHEETS__.database().ref('geezvtt/live/world__daddies/rollcall/count').once('value')).val()===2);
 assert.equal(fake?db.dump()['v2-test'][run].campaigns.daddies.state.rollcall.count:await rest(target+'/campaigns/daddies/state/rollcall/count'),2);
 await other.waitForFunction(async()=>(await window.__SHEETS__.database().ref('geezvtt/live/world__daddies/rollcall/count').once('value')).val()===2);
 console.log('PASS two browsers increment same state through retrying transactions');
 if(fake){const saved=db.dump()['v2-test'][run];assert.ok(saved.files[encodeKey('arch.png')]);assert.equal(saved.apps.sheets.files,undefined);}
 console.log('PASS world picture stored under files and loaded on demand in second browser');
 await gm.locator('#campaignSelect').selectOption(world);await gm.evaluate(()=>window.__SHEETS__.view('WORLD'));await gm.waitForFunction(()=>window.__SHEETS__.state().loaded);
 await gm.keyboard.press('Escape');await gm.locator('#modeMarker').click();const box=await gm.locator('#mapCanvas').boundingBox();
 const previous=await gm.evaluate(()=>Object.keys(window.__SHEETS__.state().data.things));await gm.mouse.click(box.x+box.width*.25,box.y+box.height*.25);
 await gm.waitForFunction(ids=>Object.keys(window.__SHEETS__.state().data.things).some(id=>!ids.includes(id)),previous);
 const place=await gm.evaluate(ids=>Object.keys(window.__SHEETS__.state().data.things).find(id=>!ids.includes(id)),previous);
 await gm.locator('#locCategory').selectOption('battlemap');
 await gm.locator('#entityTitle').fill('Firebase Battle');await gm.locator('#entityTitle').press('Tab');
 await gm.locator('#dd2vttInput').setInputFiles(fileURLToPath(new URL('geez-fixtures/prison.geez2vtt',import.meta.url)));
 for(const p of [gm,other])await p.waitForFunction(id=>window.__SHEETS__.state().data.things[id]?.traits.scene?.format==='geez2vtt',place);
 await gm.locator('#launchVttBtn').click();await gm.waitForFunction(()=>window.__SHEETS__.geometry()?.walls.length>0);
 await other.evaluate(id=>window.__SHEETS__.view('VTT',id),place);await other.waitForFunction(()=>window.__SHEETS__.geometry()?.walls.length>0);
 assert.equal(await other.evaluate(()=>window.__SHEETS__.geometry().walls.length),await gm.evaluate(()=>window.__SHEETS__.geometry().walls.length));
 console.log('PASS new campaign, Attach .geez2vtt and Open in VTT draw walls in second browser');
 await gm.locator('#campaignSelect').selectOption('__rename');
 await gm.reload({waitUntil:'domcontentloaded'});await gm.waitForFunction(id=>window.__SHEETS__?.state().data.things[id]?.traits.scene,place);
 await player.reload({waitUntil:'domcontentloaded'});await player.waitForFunction(()=>window.__SHEETS__?.state().data.pcs.ashara?.combat.hp_current===13);
 console.log('PASS reload preserves campaign, scene, HP and token state');
 assert.deepEqual(errors,[]);
}finally{
 try{await browser?.close();if(web)await new Promise(ok=>web.close(ok));}
 finally{
  try{
   if(fake){await db.ref(target).remove();assert.equal((await db.ref(target).once('value')).val(),null);console.log('PASS fake run deleted');}
   else if(uploaded){await rest(target,'DELETE');assert.equal(await rest(target),null);const after=await rest('','GET',undefined,'?shallow=true');const keys=v=>Object.keys(v||{}).filter(k=>k!=='v2-test').sort();assert.deepEqual(keys(after),keys(before));console.log('PASS real test run deleted; live top-level keys unchanged');}
  }finally{assert.deepEqual(await readFile(source),original);console.log('PASS Gaia source byte-identical');}
 }
}
