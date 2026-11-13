import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from './browser.mjs';
import {serve} from './serve.mjs';
const executablePath=process.env.CHROME||['chromium-1248','chromium-1247'].map(v=>join(process.env.LOCALAPPDATA||'',`ms-playwright/${v}/chrome-win64/chrome.exe`)).find(existsSync);
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true,executablePath,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
 const p=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto(`http://127.0.0.1:${server.address().port}/`);await p.waitForFunction(()=>window.__VTT?.propInspector);
 const fixture=await p.evaluate(()=>{
  const a=__VTT,u=a.underground,S=a.world.data.settlements.find(s=>s.kind==='town'),near=u.create('Neighbor shop cellar'),far=u.create('Distant castle dungeon');
  const existing=u.entrance(near.id,{x:S.x+30,z:S.z+30},'trapdoor','Neighbor stairs'),distant=u.entrance(far.id,{x:S.x+10000,z:S.z+10000},'trapdoor','Castle stairs');
  const key=[...a.buildings.specials(S).keys()][0],layout=a.interiors.layout(key),item=layout.plan.items[0];u.concealUnder(key,item.id);
  const e=u.ensure().entrances.find(e=>e.cover?.itemId===item.id&&e.buildingKey===key);window.localFixture={entrance:e.id,near:near.id,far:far.id,existing:existing.id};return{...localFixture,name:e.name};
 });
 const initial=await p.locator('#undergroundPanel').innerText();assert.ok(initial.includes(fixture.name));assert.ok(!initial.includes('Distant castle dungeon')&&!initial.includes('Neighbor shop cellar')&&!initial.includes('Castle stairs'));
 assert.equal(await p.getByLabel('Destination cellar',{exact:true}).count(),0);
 await p.getByRole('button',{name:'Choose existing cellar',exact:true}).click();
 const nearby=await p.getByLabel('Destination cellar',{exact:true}).textContent();assert.ok(nearby.includes('Neighbor shop cellar'));assert.ok(!nearby.includes('Distant castle dungeon'));
 await p.getByRole('button',{name:'Browse distant cellars',exact:true}).click();assert.ok((await p.getByLabel('Destination cellar',{exact:true}).textContent()).includes('Distant castle dungeon'));
 await p.getByLabel('Destination cellar',{exact:true}).selectOption(fixture.near);await p.getByRole('button',{name:'Link selected cellar',exact:true}).click();
 const linked=await p.evaluate(()=>{const u=__VTT.underground,e=u.ensure().entrances.find(e=>e.id===localFixture.entrance),old=u.ensure().entrances.find(e=>e.id===localFixture.existing);return{map:e.mapId,paired:!!u.exitFor(e),legacy:!!u.exitFor(old),different:u.exitFor(e).exit.id!==u.exitFor(old).exit.id,surface:!u.active,covered:u.covered(e)};});assert.equal(linked.map,fixture.near);assert.ok(linked.paired&&linked.legacy&&linked.different&&linked.surface&&linked.covered);
 assert.ok(!(await p.locator('#undergroundPanel').innerText()).includes('Distant castle dungeon'));
 await p.getByRole('button',{name:'Rename entrance',exact:true}).click();assert.ok(!(await p.locator('#undergroundPanel').innerText()).includes('Distant castle dungeon'));
 // Generated/painted props must use the same focused editor, including revisiting a covered entrance.
 const local=await p.evaluate(()=>{const a=__VTT,u=a.underground,S=a.world.data.settlements.find(s=>s.kind==='town'),sx=Math.floor((S.x+20480)/1.5)+7,sz=Math.floor((S.z+20480)/1.5)+7;a.detail.setSquare(0,sx,sz,{object:{id:'local-crate',k:'crate',rot:0}});const ref={type:'detail',id:'local-crate',kind:'crate',sx,sz,level:0,space:null};a.propInspector.underneath(ref);const e=u.ensure().entrances.find(e=>e.cover?.ref?.id===ref.id);window.crateEntrance=e.id;return{id:e.id,covered:u.covered(e),text:u.panel.textContent};});assert.ok(local.covered);assert.ok(!local.text.includes('Distant castle dungeon')&&!local.text.includes('Neighbor shop cellar'));
 await p.getByRole('button',{name:'Create cellar for this entrance',exact:true}).click();
 const created=await p.evaluate(()=>{const u=__VTT.underground,e=u.ensure().entrances.find(e=>e.id===crateEntrance);return{map:e.mapId,paired:!!u.exitFor(e),surface:!u.active,text:u.panel.textContent};});assert.ok(created.map&&created.paired&&created.surface);assert.ok(!created.text.includes('Distant castle dungeon')&&!created.text.includes('Neighbor shop cellar'));
 await p.evaluate(()=>{const u=__VTT.underground;u.panel.hidden=true;u.useEntrance(u.ensure().entrances.find(e=>e.id===crateEntrance));});assert.ok(!(await p.locator('#undergroundPanel').innerText()).includes('Distant castle dungeon'));
 // The global manager is still an intentional menu action.
 await p.locator('#menuBtn').click();await p.getByRole('button',{name:'Underground',exact:true}).click();assert.ok((await p.locator('#undergroundPanel').innerText()).includes('Distant castle dungeon'));
 assert.deepEqual(errors,[]);console.log('PASS: prop/building entrances open a focused editor, nearby-only destination choices, explicit distant browsing, local cellar creation and paired stairs, preservation of legacy entrances, no unwanted travel, and an intentional global manager.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
