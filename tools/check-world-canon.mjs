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
  const a=__VTT,c=a.canon,town=a.world.data.settlements.find(s=>s.kind==='town'),at={x:town.x,z:town.z};
  const p={id:'fixture_npc',name:'Mira Ashdown',first:'Mira',last:'Ashdown',race:'human',role:'scribe',seed:83001,demeanour:'watchful',backstory:'Keeps the chapel records.',secret:'heard something about \u201cthe copper dragon\u201d and a stolen reliquary'};
  const m=c.ground({roller:'npc',seed:83001,opts:{},title:p.name,person:p,sections:[{t:'Rumour',text:p.secret}]},at);
  const dragon=c.named('The Copper Dragon');if(!dragon)throw Error('Missing Copper Dragon');
  const id=dragon.id,source=dragon.source,entityCount=c.entities.length;
  const repeat=c.ground({roller:'npc',seed:83001,opts:{},title:'should use saved result',sections:[]},at);
  if(c.entities.length!==entityCount)throw Error('Repeat roll duplicated entities');
  const other=c.ground({roller:'quest',seed:83002,opts:{},title:'A missing ledger',sections:[{t:'Rumour',text:'Ask at The Copper Dragon about Mira Ashdown.'}]},at);
  const mentions=c.get(id).mentions.length,backlinks=c.get(id).links.length;
  const sourceExists=source?.key==='building'?!!a.buildings.find(source.id):!!a.world.data.settlements.find(s=>s.id===source?.id);
  // Explicit types are authoritative, and objects get an actual owner/location.
  const item=c.ground({roller:'npc',seed:83003,opts:{},title:'Orin Vale',person:{...p,id:'orin',name:'Orin Vale'},refs:[{name:'The Mourning Key',kind:'thing'}],sections:[{t:'Possession',text:'The Mourning Key opens the sealed crypt.'}]},at);
  const key=c.named('The Mourning Key');
  a.rolls.cur='npc';a.rolls.result=m;a.rolls.show();
  window.canonFixture={id,source,entityCount,mentions,backlinks,sourceExists,repeatTitle:repeat.title,refs:other.worldRefs,keyId:key.id,owned:!!key.ownerId,located:!!key.homeId};
  return window.canonFixture;
 });
 assert.ok(fixture.sourceExists);assert.equal(fixture.repeatTitle,'Mira Ashdown');assert.ok(fixture.mentions>=2);assert.ok(fixture.backlinks>=2);assert.ok(fixture.refs.includes(fixture.id));assert.ok(fixture.located);assert.ok(fixture.owned);
 await p.locator('#roller .world-inline').filter({hasText:/copper dragon/i}).first().click();await p.waitForFunction(()=>!document.querySelector('#worldBook').hidden);
 assert.match(await p.locator('#worldBook').innerText(),/Copper Dragon/i);assert.ok(!(await p.locator('#worldBook').innerText()).includes('[object HTML'));assert.match(await p.locator('#worldBook').innerText(),/Mira Ashdown/);
 await p.screenshot({path:join(out,'world-canon-reference.png')});
 // Automatic real placement for a rolled settlement, followed by idempotent replay.
 const placed=await p.evaluate(()=>{
  const a=__VTT,seed=63001; a.rolls.cur='place';a.rolls.opts.place={kind:'hamlet'};a.rolls.doRoll(seed);
  const m=a.rolls.result,e=a.canon.get(m.worldEntity),s=a.world.data.settlements.find(s=>s.id===e.source.id),count=a.world.data.settlements.length;
  if(!s)throw Error('Rolled place has no settlement');
  a.rolls.doRoll(seed);return {name:s.name,id:s.id,count,after:a.world.data.settlements.length,refs:m.worldRefs.length};
 });assert.equal(placed.count,placed.after);assert.ok(placed.refs>1);
 // Undo rolls back the whole graph and physical placement, redo restores exactly.
 const undo=await p.evaluate(id=>{const a=__VTT;a.tools.undo();const absent=!a.world.data.settlements.some(s=>s.id===id);a.tools.redo();return{absent,restored:a.world.data.settlements.some(s=>s.id===id)};},placed.id);assert.ok(undo.absent&&undo.restored);
 // All eleven roller families commit coherent entities; sites and shops are physical.
 const coverage=await p.evaluate(async()=>{
  const {ROLLERS}=await import('/rollers.js'),a=__VTT,out=[];
  for(const r of ROLLERS){const m=r.fn(912345,{level:3,kind:r.id==='site'?'crypt':r.id==='shop'?'smithy':undefined},a.world),bound=a.canon.ground(m,a.controls.target),root=a.canon.get(bound.worldEntity);
   if(!root||bound.worldRefs.some(id=>!a.canon.get(id)))throw Error(r.id+' has dangling references');
   if((r.id==='site'||r.id==='shop')&&!root.source)throw Error(r.id+' is not physically placed');
   if(r.id==='shop'){if(root.source.key!=='building')throw Error('Shop source is '+JSON.stringify(root.source));const b=a.buildings.building(root.source.id);if(!b||!b.people.some(p=>p.name===bound.person.name))throw Error('Shopkeeper does not occupy actual shop');}
   out.push({id:r.id,refs:bound.worldRefs.length,source:root.source?.key});
  }
  // Source renaming keeps identity and old name as an alias.
  const e=a.canon.named('The Copper Dragon'),id=e.id,key=e.source.id;
  if(e.source.key==='building'){a.world.data.buildings[key].name='The Copper Dragon Inn';a.canon.catalog();if(a.canon.named('The Copper Dragon').id!==id)throw Error('Rename broke identity');}
  return out;
 });assert.equal(coverage.length,11);
 const saved=await p.evaluate(()=>{__VTT.saveNow();return JSON.stringify([__VTT.world.data.entities,__VTT.world.data.worldRolls]);});
 await p.reload();await p.waitForFunction(()=>window.__VTT?.canon);
 assert.equal(await p.evaluate(()=>JSON.stringify([__VTT.world.data.entities,__VTT.world.data.worldRolls])),saved);
 await p.click('#menuBtn');await p.getByRole('button',{name:'World ledger',exact:true}).click();await p.getByRole('searchbox',{name:'Search world ledger'}).fill('copper dragon');assert.equal(await p.locator('#worldBook .world-entry').count(),1);
 await p.locator('#worldBook .world-entry').click();await p.getByRole('button',{name:'Go',exact:true}).click();await p.waitForFunction(id=>{const e=__VTT.canon.get(id),t=__VTT.controls.target;return Math.hypot(t.x-e.x,t.z-e.z)<1;},fixture.id,{timeout:30000});
 const go=await p.evaluate(id=>{const e=__VTT.canon.get(id),t=__VTT.controls.target;return Math.hypot(t.x-e.x,t.z-e.z);},fixture.id);assert.ok(go<1);
 // Player mode cannot see the ledger, its secret references, or its map pins.
 await p.evaluate(()=>{__VTT.setRole('player');__VTT.canon.show();});assert.equal(await p.locator('#worldBook').isVisible(),false);
 assert.deepEqual(errors,[]);
 await writeFile(join(out,'world-canon-report.json'),JSON.stringify({fixture,placed,undo,coverage,errors},null,2));
 console.log('PASS: named reference reuse, real building/settlement placement, linked NPC rumours, explicit references, saved graph, search, Go, atomic undo/redo, reload, and GM-only access.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
