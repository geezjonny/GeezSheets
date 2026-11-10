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
 const report=await p.evaluate(async()=>{
  const R=await import('/rollers.js');let ordinary=0;const bad=[];
  for(let seed=1;seed<=5000;seed++){const p=R.makeNPC(seed);if(!p.occult){ordinary++;if(p.find||/vampir|illithid|cult|undead|zombie|lycanthrop|forbidden god|dragon attack/i.test((p.backstory||'')+' '+(p.secret||'')))bad.push(seed);}}
  let towns=0,example=null;
  for(let seed=1;seed<=250;seed++){const s=R.makePlace(seed,{kind:'village'});if(s.lore.conspiracy){towns++;if(!example)example=s;if([...s.lore.npcs,s.lore.ruler,...s.buildingsRolled.flatMap(b=>b.people)].some(p=>!p.occult||p.conspiracyId!==s.lore.conspiracy.id||!p.secret.includes(s.lore.conspiracy.name)))throw Error('Incoherent shared secret at seed '+seed);}}
  const a=__VTT,m=a.canon.ground(R.rollPlaceCard(example.seed,{kind:'village'}),a.controls.target),entity=a.canon.get(m.worldEntity),s=a.world.data.settlements.find(s=>s.id===entity.source.id);
  if(!s.lore.conspiracy)throw Error('Shared secret lost during placement');
  const hs=a.buildings.housesOf(s),actual=hs.map(h=>a.buildings.building(a.buildings.keyOf(s,h))).filter(b=>b.special).flatMap(b=>b.people);
  if(!actual.length||actual.some(p=>!p.occult||p.conspiracyId!==s.lore.conspiracy.id||!p.secret.includes(s.lore.conspiracy.name)))throw Error('Placed residents do not share conspiracy');
  a.card.open('settlements',s.id);
  return{ordinary,total:5000,ordinaryRatio:ordinary/5000,conspiracyTowns:towns,townSamples:250,bad,actualResidents:actual.length,sourceId:s.id,secret:s.lore.conspiracy.secret};
 });
 assert.ok(report.ordinaryRatio>.50&&report.ordinaryRatio<.60);assert.deepEqual(report.bad,[]);assert.ok(report.conspiracyTowns>5&&report.conspiracyTowns<50);
 assert.match(await p.locator('#card').innerText(),/Shared town secret/i);
 await p.evaluate(id=>{__VTT.setRole('player');__VTT.card.open('settlements',id);},report.sourceId);assert.doesNotMatch(await p.locator('#card').innerText(),/Shared town secret/i);assert.ok(!(await p.locator('#card').innerText()).includes(report.secret));
 assert.deepEqual(errors,[]);
 await writeFile(join(out,'campaign-tone-report.json'),JSON.stringify(report,null,2));console.log('PASS: '+report.ordinary+' / 5000 ordinary NPCs; '+report.conspiracyTowns+' / 250 shared-secret villages; '+report.actualResidents+' placed residents share one secret; GM-only reveal.');

}finally{await browser?.close();await new Promise(r=>server.close(r));}
