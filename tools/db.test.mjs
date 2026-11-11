import {playerScenarios} from './player-scenarios.mjs';
import assert from 'node:assert/strict';
import {mkdtemp, copyFile, readFile, rm, cp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import http from 'node:http';
const {chromium} = await import(pathToFileURL(join(process.env.APPDATA,'npm/node_modules/@playwright/mcp/node_modules/playwright/index.mjs')).href);
const source=resolve('../GeezSuite/data/gaia-v2.json'), original=await readFile(source), dir=await mkdtemp(join(tmpdir(),'sheets-gaia-'));
const patched=process.argv.includes('--patched-server');
let app, browser, web, legacy, api;
try {
  let moduleURL=new URL('../../GeezSuite/core/serve.mjs',import.meta.url);
  const {startServer}=await import(moduleURL.href);
  await copyFile(source,join(dir,'gaia.json'));
  app=await startServer({file:join(dir,'gaia.json'),port:0});api='http://127.0.0.1:'+app.server.address().port;
  const root=resolve('.');
  web=http.createServer(async(req,res)=>{try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname.endsWith('.json')&&legacy&&(pathname==='/.json'||req.headers.accept==='text/event-stream')){
      if(req.method!=='GET'){res.setHeader('Content-Type','application/json');res.end('null');return;}
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write('event: put\ndata: '+JSON.stringify({path:'/',data:legacy})+'\n\n');return;
    }
    if(pathname.endsWith('.json')&&legacy&&req.method!=='GET'){res.setHeader('Content-Type','application/json');res.end('null');return;}
    const file=resolve(root,'.'+pathname);if(!file.startsWith(root+ '/'.replace('/', '\\'))&&!file.startsWith(root+'/'))throw Error('path');const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[extname(file)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404);res.end();}});
  await new Promise(ok=>web.listen(0,'127.0.0.1',ok));
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const context=await browser.newContext();
  const pages=[await context.newPage(),await context.newPage()];
  for(const p of pages){p.on('pageerror',e=>console.error('PAGE',e.stack));p.on('dialog',d=>d.accept());await p.route(/firebaseio\.com|firebasedatabase\.app/,()=>{throw Error('Firebase network forbidden');});await p.goto(`http://127.0.0.1:${web.address().port}/index.html?db=gaia&gaia=${api}&gm=jonny&campaign=world__daddies&test`,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__SHEETS__?.state().data.pcs.ashara,{timeout:30000});}
  await pages[0].waitForFunction(()=>window.__SHEETS__.state().data.initiative?.rows);
  const data=await pages[0].evaluate(()=>window.__SHEETS__.state().data);
  for(const key of ['pcs','things','maps','links'])assert.ok(Object.keys(data[key]).length,key);
  assert.ok(data.initiative?.rows); assert.ok(Object.values(data.things).some(t=>t.traits.dd2vtt));
  console.log('PASS Gaia PCs, things, maps, links, dd2vtt and initiative load through __SHEETS__');
  await pages[0].evaluate(async()=>{await window.__SHEETS__.database().ref('characters/pcs/ashara/combat/hp_current').set(17);});
  await pages[1].waitForFunction(()=>window.__SHEETS__.state().data.pcs.ashara.combat.hp_current===17);
  console.log('PASS HP action reaches a second browser page through SSE');
  const player=await context.newPage();player.on('dialog',d=>d.accept());
  await player.goto(`http://127.0.0.1:${web.address().port}/index.html?db=gaia&gaia=${api}&player&pc=ashara&campaign=world__daddies`,{waitUntil:'domcontentloaded'});
  await player.waitForFunction(()=>window.__SHEETS__?.state().data.pcs.ashara);
  const result=await player.evaluate(async()=>{const db=window.__SHEETS__.database();await db.ref('characters/pcs/ashara/combat/hp_current').set(16);try{await db.ref('characters/pcs/liora/combat/hp_current').set(1);return 'allowed';}catch(e){return e.status;}});
  assert.equal(result,403);
  const entities=Object.values(JSON.parse(original).worlds.gaia.entities);
  const forbidden=await fetch(api+'/v2/actions/hp.set',{method:'POST',headers:{'Content-Type':'application/json','X-Geez-As':'player:'+entities.find(e=>e.name==='Ashara'&&e.kind==='pc').id},body:JSON.stringify({args:{entity:entities.find(e=>e.name==='Liora'&&e.kind==='pc').id,amount:1}})});
  assert.equal(forbidden.status,403);
  console.log('PASS player edits own PC; adapter and server reject another PC');
  {
    const gm=pages[0];
    const paths=[];gm.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/actions/'))paths.push(r.url().split('/actions/')[1]);});
    await gm.evaluate(async()=>{
      const db=window.__SHEETS__.database();
      await db.ref('characters/pcs/ashara').update({'combat/temp_hp':3,'combat/conditions':['prone'],'coin_purse/gp':10,'abilities/channel_divinity/current':0});
      await db.ref('characters/pcs/ashara/inventory/holy_symbol/qty').set(2);
      await db.ref('characters/pcs/ashara/spellcasting/slots_used/1').set(0); await db.ref('characters/pcs/ashara/spellcasting/slots_used/1').set(1);
      const map=Object.keys(window.__SHEETS__.state().data.maps).find(id=>id.startsWith('map_location')&&id.includes('__daddies'));
      await db.ref('geezvtt/campaign/maps/'+map).update({'gridSize':44,'shift':{source:'future',order:[1,2],flips:{a:true}}});
      await db.ref('geezvtt/live/world__daddies/initiative').set({round:2,turn:'test',rows:{test:{name:'Ashara',charId:'ashara',init:14}}});
      await db.ref('geezvtt/party/world__daddies/notes/test').set({note:{text:'Kept'}});
      await db.ref('geezvtt/live/world__daddies/rollcall').set({count:0});
      for(const field of ['pings','audio','presence','dmAt','rolls'])await db.ref('geezvtt/live/world__daddies/'+field).set({test:{future:42}});
    });
    for(const action of ['hp.temp','condition.add','coin.add','ability.spend','item.give','slot.spend','initiative.set'])assert.ok(paths.includes(action),action);
    await pages[1].waitForFunction(()=>window.__SHEETS__.state().data.initiative?.rows?.test?.init===14);
    const roundtrip=await gm.evaluate(async()=>({map:Object.values(window.__SHEETS__.state().data.maps).find(m=>m.gridSize===44),notes:(await window.__SHEETS__.database().ref('geezvtt/party/world__daddies/notes').once('value')).val()}));
    assert.deepEqual(roundtrip.map.shift.order,[1,2]);assert.equal(roundtrip.notes.test.note.text,'Kept');
    await Promise.all(pages.map(p=>p.evaluate(async()=>{const r=window.__SHEETS__.database().ref('geezvtt/live/world__daddies/rollcall/count');await r.transaction(n=>(n||0)+1);})));
    assert.equal(await gm.evaluate(async()=>(await window.__SHEETS__.database().ref('geezvtt/live/world__daddies/rollcall/count').once('value')).val()),2);
    console.log('PASS action routing, maps and party round trips, initiative SSE, concurrent transactions');
    const pcId=entities.find(e=>e.kind==='pc'&&e.name==='Ashara').id;
    await fetch(api+'/v2/entities/'+pcId,{method:'PATCH',headers:{'Content-Type':'application/json','X-Geez-As':'gm'},body:JSON.stringify({'data.future_adapter_test':{nested:{keep:42}}})});
    await gm.evaluate(async()=>{await window.__SHEETS__.database().ref('characters/pcs/ashara/combat/hp_current').set(15);});
    const saved=await (await fetch(api+'/v2/worlds/gaia/entities/'+pcId)).json();
    assert.equal(saved.data.future_adapter_test.nested.keep,42);
    const grouped=Object.entries(JSON.parse(original).campaigns.daddies.state.tokens).find(([,positions])=>positions[pcId]);
    const ids=await player.evaluate(()=>window.__SHEETS__.database().ids());
    await player.evaluate(async({map,id})=>{await window.__SHEETS__.database().ref('geezvtt/live/world__daddies/tokens/'+map+'/'+id).update({x:.42,y:.43});},{map:ids.newToOld[grouped[0]],id:ids.newToOld[pcId]});
    const tokens=await (await fetch(api+'/v2/campaigns/daddies/state/tokens')).json();
    assert.equal(tokens[grouped[0]][pcId].x,.42);
    console.log('PASS unknown entity data survives; player moves own migrated token');
    await gm.evaluate(async id=>{await window.__SHEETS__.database().ref('geezvtt/campaign/maps/'+id+'/shift').remove();},roundtrip.map.id);
    await gm.evaluate(()=>window.__SHEETS__.view('DM_BOARD'));
    await gm.waitForFunction(()=>window.__SHEETS__.state().level==='DM_BOARD');
    const location=Object.values(roundtrip.map).length && roundtrip.map.id;
    await gm.evaluate(id=>window.__SHEETS__.view('LOCATION',id),location);
    await gm.waitForFunction(()=>window.__SHEETS__.state().loaded);
    console.log('PASS pinboard/location render and legacy dd2vtt metadata projection');
    const sheet=await context.newPage();
    await sheet.goto(`http://127.0.0.1:${web.address().port}/sheet.html?db=gaia&gaia=${api}&gm=jonny&char=ashara&live=world__daddies`,{waitUntil:'domcontentloaded'});
    await sheet.waitForFunction(()=>document.querySelector('#cardsWrap')?.textContent.includes('Ashara'));
    console.log('PASS party character sheet renders using Gaia');
    const playerSheet=await context.newPage();
    await playerSheet.goto(`http://127.0.0.1:${web.address().port}/sheet.html?gaia=${api}&char=ashara&live=world__daddies`,{waitUntil:'domcontentloaded'});
    await playerSheet.waitForFunction(()=>document.querySelector('#cardsWrap')?.textContent.includes('Ashara'));
    await playerScenarios(gm,player,playerSheet);
  }
} finally {
  await browser?.close();await app?.close();if(web)await new Promise(ok=>web.close(ok));
  assert.deepEqual(await readFile(source),original,'real Gaia data changed');
  await rm(dir,{recursive:true,force:true});console.log('PASS real Gaia data byte-identical');
}
