import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {chromium} from './browser.mjs';
import {serve} from './serve.mjs';
const out=fileURLToPath(new URL('./out/',import.meta.url));await mkdir(out,{recursive:true});
const executablePath=process.env.CHROME||['chromium-1248','chromium-1247'].map(v=>join(process.env.LOCALAPPDATA||'',`ms-playwright/${v}/chrome-win64/chrome.exe`)).find(existsSync);
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true,executablePath,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto(`http://127.0.0.1:${server.address().port}/`);await p.waitForFunction(()=>window.__VTT?.canon);
 const info=await p.evaluate(()=>{
  const a=__VTT,u=a.underground,m=u.create('Copper Dragon cellar',16,12),at=a.world.data.settlements.find(s=>s.kind==='town');
  const e=u.entrance(m.id,{x:at.x+40,z:at.z+35},'trapdoor','Copper Dragon trapdoor');
  const sx=Math.floor((e.x+20480)/1.5),sz=Math.floor((e.z+20480)/1.5);a.world.data.tokens.push({id:'travel_hero',name:'Travel hero',sx,sz,level:0,hp:23});
  a.flyTo(e.x,e.z,55,.1);window.ugFixture={mapId:m.id,entranceId:e.id};return{mapId:m.id,entranceId:e.id,detailBytes:JSON.stringify(m.detail).length};
 });
 await p.waitForFunction(()=>__VTT.camDist()<60&&__VTT.underground.markers.size>0);await p.waitForTimeout(1400);
 const surface=await p.evaluate(()=>__VTT.underground.view());
 await p.getByRole('button',{name:'Copper Dragon trapdoor',exact:true}).click();
 await p.waitForFunction(()=>__VTT.underground.active?.name==='Copper Dragon cellar');await p.waitForTimeout(1000);
 assert.equal(await p.locator('#undergroundBar').count(),0);
 assert.equal(await p.locator('#backBtn').isVisible(),true);
 assert.equal(await p.locator('#undergroundPins').isVisible(),false);
 const placed=await p.evaluate(()=>{const a=__VTT,u=a.underground,e=u.active.entry,[x,z]=[(e.sx+.5)*1.5-20480,(e.sz+.5)*1.5-20480];const token=a.tools.placeTokenAt(x+3,z-3,{name:'Cellar guard'});a.combat.start();return{id:token.id,space:token.space,mapId:u.active.id,combatCount:a.combat.state.order.length,ground:a.maps.ground(x,z),surfaceCombat:a.world.data.combat||null};});
 assert.equal(placed.space,info.mapId);assert.equal(placed.combatCount,1);assert.ok(placed.ground>.1);assert.equal(placed.surfaceCombat,null);
 await p.screenshot({path:join(out,'underground-cellar.png')});
 const isolation=await p.evaluate(()=>{const a=__VTT,map=a.underground.active,keys=Object.keys(map.detail),surface=JSON.stringify(a.world.data.detail),entry=map.entry;const before=JSON.stringify(map.detail);a.setTool('detail');a.tools.detailBrush={kind:'objects',object:'crate',rot:0,size:1};const x=(entry.sx+3.5)*1.5-20480,z=(entry.sz-3.5)*1.5-20480;a.tools.detailStart({x,z});a.tools.detailEnd();const after=JSON.stringify(map.detail);a.tools.undo();const undone=JSON.stringify(map.detail)===before;a.tools.redo();return{changed:after!==before,undone,surfaceUnchanged:surface===JSON.stringify(a.world.data.detail)};});assert.ok(isolation.changed&&isolation.undone&&isolation.surfaceUnchanged);
 await p.locator('#menuBtn').click();await p.getByRole('button',{name:'Underground',exact:true}).click();await p.getByRole('button',{name:'Bring nearby tokens',exact:true}).click();
 const travel=await p.evaluate(()=>{const a=__VTT,t=a.world.data.tokens.find(t=>t.id==='travel_hero');a.combat.start();return{space:t.space,hp:t.hp,order:a.combat.state.order.length,route:!!t.surfaceReturn};});assert.equal(travel.space,info.mapId);assert.equal(travel.hp,23);assert.equal(travel.order,2);assert.ok(travel.route);
 const saved=await p.evaluate(()=>{__VTT.saveNow();return JSON.stringify(__VTT.underground.active.detail);});
 await p.reload();await p.waitForFunction(()=>window.__VTT?.underground?.active);assert.equal(await p.evaluate(()=>JSON.stringify(__VTT.underground.active.detail)),saved);
 await p.waitForFunction(()=>__VTT.maps.tokenMeshes.size===2);
 await p.locator('#backBtn').click();await p.waitForFunction(()=>!__VTT.underground.active);
 const returned=await p.evaluate(()=>({view:__VTT.underground.view(),undergroundTokenStillSaved:__VTT.world.data.tokens.some(t=>t.name==='Cellar guard'&&t.space),visible:__VTT.maps.tokenMeshes.has(__VTT.world.data.tokens.find(t=>t.name==='Cellar guard').id)}));
 assert.ok(returned.undergroundTokenStillSaved);const hero=await p.evaluate(()=>__VTT.world.data.tokens.find(t=>t.id==='travel_hero'));assert.ok(!hero.space);assert.equal(hero.hp,23);assert.equal(await p.evaluate(id=>__VTT.underground.ensure().maps.find(m=>m.id===id).combat.order.length,info.mapId),1);await p.waitForTimeout(250);assert.equal(await p.evaluate(()=>__VTT.maps.tokenMeshes.has(__VTT.world.data.tokens.find(t=>t.name==='Cellar guard').id)),false);
 for(let i=0;i<3;i++){assert.ok(Math.abs(returned.view.target[i]-surface.target[i])<.1);assert.ok(Math.abs(returned.view.camera[i]-surface.camera[i])<.1);}
 // A second underground map owns a separate scene/detail/token space.
 const second=await p.evaluate(id=>{const a=__VTT,u=a.underground,m=u.create('Second cellar',8,8);u.enter(m.id);const hidden=!u.facade.data.tokens.some(t=>t.name==='Cellar guard');u.leave();u.enter(id);return{hidden,count:u.facade.data.tokens.filter(t=>t.name==='Cellar guard').length};},info.mapId);assert.ok(second.hidden);assert.equal(second.count,1);
 // Reuse the user's DD2VTT importer below ground, retaining no embedded image.
 const fixture=fileURLToPath(new URL('../test.dd2vtt',import.meta.url));
 await p.locator('#menuBtn').click();await p.getByRole('button',{name:'Import .dd2vtt',exact:true}).click();
 // File input is shared with surface import; it must target the active space.
 await p.locator('#ddImportFile').setInputFiles(fixture);await p.getByRole('button',{name:'Import into underground map',exact:true}).click();
 await p.waitForFunction(()=>__VTT.underground.active.imports.length===1);
 assert.equal(await p.evaluate(()=>__VTT.underground.active.imports[0].walls.length),15);assert.equal(await p.evaluate(()=>Object.hasOwn(__VTT.underground.active.imports[0],'image')),false);
 await p.locator('#backBtn').click();
 // Existing buildings gain a direct link-creation action.
 const buildingKey=await p.evaluate(()=>{const a=__VTT,S=a.world.data.settlements.find(s=>s.kind==='town'),h=a.buildings.housesOf(S)[0],key=a.buildings.keyOf(S,h);a.card.open('building',key);return key;});
 await p.getByRole('button',{name:'Add cellar / link underground',exact:true}).click();await p.getByRole('button',{name:'Create cellar and link',exact:true}).click();
 const link=await p.evaluate(key=>{const u=__VTT.underground,e=u.ensure().entrances.find(e=>e.buildingKey===key);return{key,e,exists:u.ensure().maps.some(m=>m.id===e.mapId)};},buildingKey);assert.ok(link.exists&&link.e.buildingKey);
 const backByStairs=await p.evaluate(()=>{const a=__VTT,u=a.underground,e=u.ensure().entrances[u.ensure().entrances.length-1];u.enter(e.mapId,e.id);const p=u.active.entry,x=(p.sx+.5)*1.5-20480,z=(p.sz+.5)*1.5-20480;u.tap({x,z});return !u.active;});assert.ok(backByStairs);
 assert.deepEqual(errors,[]);
 await writeFile(join(out,'underground-report.json'),JSON.stringify({info,placed,isolation,travel,returned,second,link,backByStairs,errors},null,2));console.log('PASS: clickable surface trapdoor, isolated editable 5ft underground map, token/combat isolation, Detail undo/redo, reload resume, exact surface return, separate destinations, DD2VTT structure import, and building cellar link.');

}finally{await browser?.close();await new Promise(r=>server.close(r));}
