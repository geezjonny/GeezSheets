import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from './browser.mjs';
import {serve} from './serve.mjs';
const executablePath=process.env.CHROME||['chromium-1248','chromium-1247'].map(v=>join(process.env.LOCALAPPDATA||'',`ms-playwright/${v}/chrome-win64/chrome.exe`)).find(existsSync);
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true,executablePath,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
 const p=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(`http://127.0.0.1:${server.address().port}/`);await p.waitForFunction(()=>window.__VTT?.underground);
 const fixture=await p.evaluate(()=>{
  const a=__VTT,S=a.world.data.settlements.find(s=>s.kind==='town');a.canon.catalog();
  const B=a.buildings.building([...a.buildings.specials(S).keys()].find(k=>a.buildings.building(k).people.length));
  const P=B.people[0],profile=a.buildings.tokenFields(P),at=a.buildings.doorOf(B);
  // A represented NPC in another space must not be duplicated or moved.
  a.world.data.tokens.push({id:'resident-below',...profile,space:'elsewhere',sx:0,sz:0,hp:17});
  const person=a.canon.add('Existing ledger hermit','person',S,{profile:{name:'Existing ledger hermit',race:'human',role:'hermit',seed:14}});
  const e=a.canon.add(P.name,'person',S,{source:{key:'person',id:P.id},profile:P});
  a.card.open('settlements',S.id);window.npcFixture={settlement:S.id,person:P.id,ledger:person.id,entity:e.id};
  return{...npcFixture,before:a.world.data.tokens.length};
 });
 await p.getByRole('button',{name:'Place town NPCs',exact:true}).click();
 const placed=await p.evaluate(()=>{
  const a=__VTT,f=npcFixture,tokens=a.world.data.tokens,added=tokens.filter(t=>t.npcSettlement===f.settlement);
  const positions=new Set(added.map(t=>t.sx+','+t.sz));
  const ledger=tokens.find(t=>t.entity===f.ledger);
  return{count:added.length,unique:positions.size===added.length,linked:added.every(t=>t.person||t.entity),looks:added.every(t=>t.look),ledger:!!ledger,below:tokens.filter(t=>t.person===f.person).length,hp:tokens.find(t=>t.id==='resident-below').hp,clear:added.every(t=>a.tools.freeSquare(0,t.sx,t.sz))};
 });assert.ok(placed.count>0&&placed.unique&&placed.linked&&placed.looks&&placed.ledger&&placed.clear);assert.equal(placed.below,1);assert.equal(placed.hp,17);
 const history=await p.evaluate(()=>{const a=__VTT,n=a.world.data.tokens.length;a.tools.undo();const count=a.world.data.tokens.length;a.tools.redo();return{count,restored:a.world.data.tokens.length===n};});assert.equal(history.count,fixture.before);assert.ok(history.restored);
 const duplicates=await p.evaluate(()=>{const a=__VTT,n=a.world.data.tokens.length;a.buildings.placeExistingPeople(npcFixture.settlement);return a.world.data.tokens.length-n;});assert.equal(duplicates,0);
 // Profile changes still update the linked token through the existing person system.
 const sync=await p.evaluate(()=>{const a=__VTT,t=a.world.data.tokens.find(t=>t.person&&t.npcSettlement),P=a.buildings.person(t.person);a.buildings.patchPerson(P.id,{name:'Edited resident'});const now=a.world.data.tokens.find(v=>v.id===t.id);return now.name==='Edited resident';});assert.ok(sync);
 const visibility=await p.evaluate(()=>{const a=__VTT,S=a.world.data.settlements.find(s=>s.id===npcFixture.settlement),t=a.world.data.tokens.find(t=>t.npcSettlement===S.id);S.known=false;const hidden=!a.maps.tokenVisible(t,'player'),gm=a.maps.tokenVisible(t,'gm');S.known=true;return hidden&&gm&&a.maps.tokenVisible(t,'player');});assert.ok(visibility);
 await p.evaluate(()=>__VTT.saveNow());await p.reload();await p.waitForFunction(()=>window.__VTT?.underground);
 assert.ok(await p.evaluate(id=>__VTT.world.data.tokens.some(t=>t.entity===id),fixture.ledger));
 const before=await p.evaluate(()=>__VTT.world.data.tokens.length);
 await p.locator('#menuBtn').click();await p.getByRole('button',{name:'Place existing NPCs',exact:true}).click();
 const global=await p.evaluate(()=>{const a=__VTT,n=a.world.data.tokens.length;const added=a.buildings.placeExistingPeople().length;return{n,added};});assert.ok(global.n>=before);assert.equal(global.added,0);
 assert.deepEqual(errors,[]);console.log(`PASS: ${placed.count} existing town NPCs, building/ledger profile links, valid unoccupied squares, cellar deduplication, undo/redo, profile sync, settlement visibility, save/reload, and global menu placement.`);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
