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

 const fixture=await p.evaluate(()=>{
  const a=__VTT,u=a.underground,S=a.world.data.settlements.find(s=>s.kind==='town'),house=a.buildings.housesOf(S)[0],key=a.buildings.keyOf(S,house);
  const first=u.entrance(null,{x:house.x,z:house.z}),second=u.entrance(null,{x:house.x,z:house.z});
  const names=first.name!==second.name&&first.name.includes(a.buildings.building(key).name);
  u.updateEntrance(first.id,{name:'Iron Goods trapdoor'});u.updateEntrance(second.id,{name:"Potioneer trapdoor",buildingKey:null,x:house.x+60,z:house.z+60});
  const map=u.create('Shared cellar',22,18);u.enter(map.id);window.linkFixture={mapId:map.id,first:first.id,second:second.id,key};
  return{names,...window.linkFixture};
 });assert.ok(fixture.names);
 assert.equal(await p.locator('#undergroundBar').count(),0);
 await p.locator('#menuBtn').click();await p.getByRole('button',{name:'Underground',exact:true}).click();
 await p.getByLabel('Link to surface entrance',{exact:true}).selectOption(fixture.first);
 await p.getByRole('button',{name:'Place linked stairs / ladder',exact:true}).click();
 assert.equal(await p.evaluate(()=>{const u=__VTT.underground,e=u.active.entry;return u.tap({x:(e.sx+.5)*1.5-20480,z:(e.sz+.5)*1.5-20480});}),true);
 await p.locator('#menuBtn').click();await p.getByRole('button',{name:'Underground',exact:true}).click();
 await p.getByLabel('Link to surface entrance',{exact:true}).selectOption(fixture.second);
 await p.getByLabel('Stair or ladder',{exact:true}).selectOption('ladder');
 await p.getByRole('button',{name:'Place linked stairs / ladder',exact:true}).click();
 const linked=await p.evaluate(()=>{
  const a=__VTT,u=a.underground,e=u.active.entry;u.tap({x:(e.sx+4.5)*1.5-20480,z:(e.sz-3.5)*1.5-20480});
  const exits=structuredClone(u.active.exits);a.tools.undo();const undone=u.active.exits.length===1;a.tools.redo();
  return{exits,undone,redone:u.active.exits.length===2};
 });assert.equal(linked.exits.length,2);assert.ok(linked.undone&&linked.redone);assert.equal(linked.exits[1].kind,'ladder');
 const travel=await p.evaluate(()=>{
  const a=__VTT,u=a.underground,f=linkFixture;u.leave();const first=u.ensure().entrances.find(e=>e.id===f.first),at=u.anchor(first);
  const token={id:'route-hero',name:'Route hero',hp:19,sx:Math.floor((at.x+20480)/1.5),sz:Math.floor((at.z+20480)/1.5),level:0};a.world.data.tokens.push(token);
  u.enter(f.mapId,f.first);const arrival=structuredClone(u.ensure().session.arrival);u.bring();const below=token.space===f.mapId;
  const exit=u.active.exits.find(e=>e.entranceId===f.second);u.tap({x:(exit.sx+.5)*1.5-20480,z:(exit.sz+.5)*1.5-20480});
  const second=u.ensure().entrances.find(e=>e.id===f.second),anchor=u.anchor(second),distance=Math.hypot(a.controls.target.x-anchor.x,a.controls.target.z-anchor.z);
  const returned=a.world.data.tokens.find(t=>t.id===token.id);
  return{below,arrival,returned:!returned.space,hp:returned.hp,distance,tokenDistance:Math.hypot((returned.sx+.5)*1.5-20480-anchor.x,(returned.sz+.5)*1.5-20480-anchor.z)};
 });assert.ok(travel.below&&travel.returned);assert.equal(travel.hp,19);assert.ok(travel.distance<.01&&travel.tokenDistance<6);
 // A cover is real geometry to players; the secret entrance and label are hidden.
 const covers=await p.evaluate(()=>{
  const a=__VTT,u=a.underground,e=u.ensure().entrances.find(e=>e.id===linkFixture.second),results=[];
  u.jump({target:[e.x,0,e.z],camera:[e.x,40,e.z+15]});
  for(const kind of ['crate','carpet','bed']){
   u.updateEntrance(e.id,{cover:{kind,aside:false}});a.role='player';u.updateSurface();const r=u.markers.get(e.id);
   results.push({kind,hidden:!u.visible(e)&&!r.group.visible&&r.label.hidden,cover:!!r.cover,blocked:!u.enter(e.mapId,e.id)});
   a.role='gm';u.updateEntrance(e.id,{cover:{kind,aside:true}});a.role='player';results[results.length-1].exposed=u.visible(e);a.role='gm';
  }
  u.updateEntrance(e.id,{cover:{kind:'crate',aside:false}});a.tools.undo();const undo=!u.covered(u.ensure().entrances.find(v=>v.id===e.id));a.tools.redo();
  return{results,undo,redo:u.covered(u.ensure().entrances.find(v=>v.id===e.id))};
 });assert.ok(covers.results.every(r=>r.hidden&&r.cover&&r.blocked&&r.exposed));assert.ok(covers.undo&&covers.redo);
 const furniture=await p.evaluate(()=>{
  const a=__VTT,u=a.underground,key=linkFixture.key,item=a.interiors.layout(key).plan.items[0];
  u.concealUnder(key,item.id);const e=u.ensure().entrances.find(e=>e.cover?.itemId===item.id&&e.buildingKey===key),hidden=u.covered(e);
  a.interiors.remove(key,item.id);const exposed=!u.covered(e);a.tools.undo();const restored=u.covered(e);
  u.updateEntrance(e.id,{known:false});a.role='player';const secret=!u.visible(e);a.role='gm';return{hidden,exposed,restored,secret};
 });assert.ok(Object.values(furniture).every(Boolean));
 await p.evaluate(()=>{__VTT.underground.panel.hidden=true;__VTT.saveNow();});
 await p.reload();await p.waitForFunction(()=>window.__VTT?.underground);
 assert.equal(await p.evaluate(id=>__VTT.underground.ensure().maps.find(m=>m.id===id).exits.length,fixture.mapId),2);
 // Real keyboard events: travel works, opposite keys cancel, fields and blur stop it.
 await p.evaluate(()=>{const a=__VTT,e=a.underground.ensure().entrances.find(e=>e.name==='Potioneer trapdoor');a.flyTo(e.x,e.z,50,.1);});
 await p.waitForTimeout(1700);
 const before=await p.evaluate(()=>__VTT.controls.target.toArray());
 await p.keyboard.down('w');await p.waitForTimeout(400);await p.keyboard.up('w');
 const after=await p.evaluate(()=>__VTT.controls.target.toArray());assert.ok(Math.hypot(after[0]-before[0],after[2]-before[2])>1);
 await p.evaluate(()=>__VTT.underground.manage());
 const field=p.getByLabel('Underground map name',{exact:true});await field.focus();
 const paused=await p.evaluate(()=>__VTT.controls.target.toArray());await p.keyboard.type('wasd');await p.waitForTimeout(200);
 const still=await p.evaluate(()=>__VTT.controls.target.toArray());assert.ok(Math.hypot(still[0]-paused[0],still[2]-paused[2])<.01);
 await field.blur();await p.keyboard.down('a');await p.evaluate(()=>dispatchEvent(new Event('blur')));
 assert.equal(await p.evaluate(()=>__VTT.input.travelKeys.size),0);await p.keyboard.up('a');
 await p.evaluate(()=>{__VTT.underground.panel.hidden=true;__VTT.showGrid=true;__VTT.ui.refresh();});
 await p.keyboard.press('g');await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>__VTT.maps.grid.visible),false);
 await p.locator('#gridToggle').click();await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>__VTT.maps.grid.visible),true);
 await p.evaluate(id=>{const a=__VTT;a.underground.enter(id);a.setTool('detail');},fixture.mapId);
 await p.keyboard.press('g');await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>__VTT.maps.grid.visible),false);
 await p.keyboard.press('g');await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>__VTT.maps.grid.visible),true);
 const underBefore=await p.evaluate(()=>__VTT.controls.target.toArray());await p.keyboard.down('d');await p.waitForTimeout(250);await p.keyboard.up('d');
 const underAfter=await p.evaluate(()=>__VTT.controls.target.toArray());assert.ok(Math.hypot(underAfter[0]-underBefore[0],underAfter[2]-underBefore[2])>1);
 assert.deepEqual(errors,[]);
 await p.screenshot({path:join(out,'linked-cellar.png')});
 await writeFile(join(out,'trapdoor-links-report.json'),JSON.stringify({fixture,linked,travel,covers,furniture,errors},null,2));
 console.log('PASS: named surface trapdoors, paired stairs/ladder UI, alternate exit token travel, undo/redo, concealment geometry and player visibility, furniture removal/undo, persistence, WASD surface/cellar travel and typing/blur guards, grid toggle including Detail.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
