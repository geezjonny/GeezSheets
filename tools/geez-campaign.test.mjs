import assert from 'node:assert/strict';
import {readFile,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {startServer} from '../../GeezSuite/core/serve.mjs';
import {openStore} from '../../GeezSuite/core/store.mjs';
const {chromium}=await import(pathToFileURL(join(process.env.APPDATA,'npm/node_modules/@playwright/mcp/node_modules/playwright/index.mjs')));
const source=new URL('../../GeezSuite/data/gaia-v2.json',import.meta.url),original=await readFile(source),dir=await mkdtemp(join(tmpdir(),'gaia-campaign-'));
const fixture=fileURLToPath(new URL('geez-fixtures/prison.geez2vtt',import.meta.url)),picture=fileURLToPath(new URL('../textures/door/arch.png',import.meta.url));
let app,browser;
try {
 await copyFile(source,join(dir,'gaia.json'));app=await startServer({file:join(dir,'gaia.json'),port:0});
 const base='http://127.0.0.1:'+app.server.address().port,gm=openStore({url:base});
 browser=await chromium.launch({headless:true,channel:'msedge'});

 let promptName='Test Campaign';
 const errors=[],bad=[];
 browser.on('page',p=>{p.setDefaultTimeout(10000);});
 async function page(campaign='world__daddies') {
  const p=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept(d.type()==='prompt'?promptName:undefined));
  p.on('response',r=>{if(r.url().includes('/v2/')&&r.status()>=400)bad.push(r.status()+' '+r.url());});
  await p.route(/firebaseio\.com|firebasedatabase\.app/,r=>{errors.push('Firebase request');return r.abort();});
  await p.goto(base+'/sheets/geez-index.html?db=gaia&gaia='+base+'&gm=jonny&campaign='+campaign+'&test',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window.__SHEETS__?.state().data.maps.world__daddies);return p;
 }
 const p=await page();
 await p.locator('#campaignSelect').selectOption('__new');
 await p.waitForFunction(()=>window.__SHEETS__.state().campaign!=='world__daddies');
 const world=await p.evaluate(()=>window.__SHEETS__.state().campaign),c=world.replace(/^world__/,'');
 assert.equal((await gm.get('campaigns/'+c)).info.name,'Test Campaign');
 assert.match(c,/^[a-z0-9_-]+$/);
 await p.locator('#mapUploadEmpty').setInputFiles(picture);
 await p.waitForFunction(()=>window.__SHEETS__.state().loaded);
 await p.waitForFunction(id=>window.__SHEETS__.state().data.maps[id]?.image==='arch.png',world);
 console.log('PASS real campaign dropdown creates campaign before live writes; world picture loads');
 const p2=await page(world);
 async function marker(name) {
  const before=await p.evaluate(()=>Object.keys(window.__SHEETS__.state().data.things));
  await p.keyboard.press('Escape');if(await p.locator('#cardPop').isVisible())await p.locator('#cardPopClose').click();await p.locator('#modeMarker').click();
  const box=await p.locator('#mapCanvas').boundingBox();
  await p.mouse.click(box.x+box.width*.8,box.y+box.height*.25); // right side: the open card sits left of centre
  await p.waitForFunction(ids=>Object.keys(window.__SHEETS__.state().data.things).some(id=>!ids.includes(id)),before);
  const id=await p.evaluate(ids=>Object.keys(window.__SHEETS__.state().data.things).find(id=>!ids.includes(id)),before);
  await p.locator('#entityTitle').fill(name);await p.locator('#entityTitle').press('Tab');
  await p.waitForFunction(({id,name})=>window.__SHEETS__.state().data.things[id]?.name===name,{id,name});
  // Wait for the debounced UI save to reach the adapter and server.
  await p.waitForFunction(async ({base,name})=>(await (await fetch(base+'/v2/entities?q='+encodeURIComponent(name))).json()).some(e=>e.name===name),{base,name});
  return id;
 }
 const area=await marker('Test Settlement');
 await p.locator('#childMapInput').setInputFiles(picture);
 await p.locator('#openChildBtn').waitFor();
 const areaMap=await p.evaluate(id=>window.__SHEETS__.state().data.things[id].traits.childMap,area);
 await p.waitForFunction(async ({base})=>(await (await fetch(base+'/v2/entities?kind=map')).json()).some(e=>e.data.image==='arch.png'),{base});
 await p.locator('#openChildBtn').click();
 await p.waitForFunction(()=>window.__SHEETS__.state().level==='LOCATION'&&window.__SHEETS__.state().loaded);
 const battle=await marker('Test Battle');
 const chooser=p.waitForEvent('filechooser');await p.locator('#attachGeez2vttBtn').click();await (await chooser).setFiles(fixture);
 for(const q of [p,p2])await q.waitForFunction(id=>window.__SHEETS__.state().data.things[id]?.traits.scene?.format==='geez2vtt',battle,{timeout:10000});
 const place=(await gm.entities({campaign:c,kind:'place'})).find(e=>e.name==='Test Battle');
 assert.ok(place);const map=await gm.entity(place.data.childMap);assert.equal(map.campaign,c);assert.ok(map.data.scene.floors[0].walls.length);
 await p.locator('#launchVttBtn').click();await p.waitForFunction(()=>window.__SHEETS__.geometry()?.walls.length>0);
 console.log('PASS real area map and battle marker UI; attachment publishes canonical scene; VTT draws walls; second browser receives live');
 await p2.evaluate(id=>window.__SHEETS__.view('WORLD'),world);await p2.waitForFunction(()=>window.__SHEETS__.state().loaded);
 await p2.evaluate(id=>window.__SHEETS__.view('LOCATION',id),areaMap);await p2.waitForFunction(()=>window.__SHEETS__.state().level==='LOCATION'&&window.__SHEETS__.state().loaded);
 console.log('PASS independent browser loads uploaded world and area pictures from Gaia');
 await p.evaluate(id=>window.__SHEETS__.select(id),battle);
 await p.locator('#knownToggle').check();
 await p.waitForFunction(async ({base,c,id})=>(await (await fetch(base+'/v2/campaigns/'+c)).json()).reveals[id]?.known,{base,c,id:place.id});
 await p.evaluate(async ({world,battle})=>{const db=window.__SHEETS__.database();await db.ref('geezvtt/party/'+world+'/board/'+battle).set({x:12,y:34});await db.ref('geezvtt/live/'+world+'/session').set({lockMove:true});},{world,battle});
 const pc=await gm.put({kind:'pc',name:'Campaign Token',world:'gaia',campaign:c,data:{combat:{hp_current:10,hp_max:10}}});
 const placed=await gm.act('token.place',{entity:pc.id,map:map.id,x:.2,y:.3,campaign:c}),tokenId=placed.changes[0].id;
 await p.evaluate(async ({world,battle,id})=>{await window.__SHEETS__.database().ref('geezvtt/live/'+world+'/tokens/'+battle+'/'+id).update({x:.4,y:.5});},{world,battle,id:pc.id});
 assert.equal((await gm.get('campaigns/'+c+'/state/tokens/'+tokenId)).x,.4);
 assert.equal((await gm.get('campaigns/'+c+'/state/session')).lockMove,true);
 assert.equal((await gm.get('campaigns/'+c+'/reveals/'+place.id)).board.x,12);
 await p2.evaluate(id=>window.__SHEETS__.view('VTT',id),battle);
 await p2.waitForFunction(id=>window.__SHEETS__.state().tokens.some(t=>t.entity===id&&t.x===.4),pc.id);
 console.log('PASS new campaign reveals, party board, state and canonical token movement persist and sync');
 promptName='Renamed Campaign';
 await p.locator('#campaignSelect').selectOption('__rename');
 await p.waitForFunction(async ({base,c})=>(await (await fetch(base+'/v2/campaigns/'+c)).json()).info.name==='Renamed Campaign',{base,c});
 await p.reload({waitUntil:'domcontentloaded'});await p.waitForFunction(id=>window.__SHEETS__?.state().campaign===id,world);
 await p.waitForFunction(id=>window.__SHEETS__.state().data.things[id]?.traits.scene,battle);
 assert.ok((await p.evaluate(()=>window.__SHEETS__.state().data.maps))[areaMap]);
 assert.equal((await gm.get('campaigns/'+c)).info.name,'Renamed Campaign');
 console.log('PASS rename and reload preserve campaign identity, world map, area map and scene');
 await p.evaluate(async()=>{
  const db=window.__SHEETS__.database();
  await db.ref('geezvtt/campaign').update({'maps/world__Odd Campaign!':{id:'world__Odd Campaign!',name:'Odd',parentMap:null,pins:{},roads:{},tiles:{}},'things/odd-place':{id:'odd-place',name:'Odd Place',type:'location',campaign:'world__Odd Campaign!',traits:{category:'site'}}});
 });
 assert.equal((await gm.get('campaigns/odd-campaign')).info.name,'Odd');
 assert.equal((await gm.entities({q:'Odd Place'}))[0].campaign,'odd-campaign');
 await p.evaluate(async()=>{await window.__SHEETS__.database().ref('geezvtt/live/world__Odd Campaign!/session').set({lockMove:true});});
 assert.equal((await gm.get('campaigns/odd-campaign/state/session')).lockMove,true);
 console.log('PASS invalid browser IDs slugify once and retain their mapping across subsequent writes');
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
} finally {await browser?.close();app?.server.closeAllConnections();await app?.close();assert.deepEqual(await readFile(source),original);await rm(dir,{recursive:true,force:true});console.log('PASS source Gaia byte-identical');}
