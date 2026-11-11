import assert from 'node:assert/strict';
import {readFile,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {startServer} from '../../GeezSuite/core/serve.mjs';
import {openStore} from '../../GeezSuite/core/store.mjs';
const {chromium}=await import(pathToFileURL(join(process.env.APPDATA,'npm/node_modules/@playwright/mcp/node_modules/playwright/index.mjs')));
const source=new URL('../../GeezSuite/data/gaia-v2.json',import.meta.url),original=await readFile(source),dir=await mkdtemp(join(tmpdir(),'geez-npc-'));
let app,browser;
try{
 await copyFile(source,join(dir,'gaia.json'));app=await startServer({file:join(dir,'gaia.json'),port:0});const base='http://127.0.0.1:'+app.server.address().port,store=openStore({url:base});
 browser=await chromium.launch({headless:true,channel:'msedge'});const p=await (await browser.newContext()).newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route(/firebaseio\.com|firebasedatabase\.app/,r=>r.abort());
 await p.goto(base+'/sheets/index.html?db=gaia&gaia='+base+'&gm=jonny&campaign=world__daddies&test',{waitUntil:'domcontentloaded'});
 await p.waitForFunction(()=>window.__SHEETS__?.state().data.pcs?.ashara);await p.evaluate(()=>window.__SHEETS__.view('DM_BOARD'));
 await p.locator('#addNpcQuickBtn').click();await p.locator('#npcPopNew').click();await p.locator('#entityTitle').fill('Grimble the Bold');
 const find=async()=>(await store.list?.('entities')??Object.values((await (await fetch(base+'/v2/worlds/gaia/entities')).json())||{})).find?.(e=>e.kind==='npc'&&e.name==='Grimble the Bold');
 const find2=async name=>Object.values((await (await fetch(base+'/v2/worlds/gaia/entities')).json())||{}).find(e=>e.kind==='npc'&&e.name===name);
 let saved;for(let i=0;i<40&&!(saved=await find());i++)await new Promise(r=>setTimeout(r,250));
 assert(saved,'new NPC is saved with its name');assert.deepEqual(saved.data.profile,{});
 assert(!/failed/i.test(await p.locator('#statusMessage').textContent()));assert.deepEqual(errors,[]);
 console.log('PASS board New NPC saves through Gaia and can be named');
 // In the VTT: New NPC opens the sheet pane with an editable, focused name; arming it and clicking the map places a token.
 const scene=JSON.parse(await readFile(new URL('fixtures/prison.geez2vtt',import.meta.url))),place=await store.put({kind:'place',name:'NPC test map',world:'gaia',campaign:'daddies',data:{place_kind:'battlemap'}});
 await store.act('map.publish',{entity:place.id,scene,campaign:'daddies'});
 await p.waitForFunction(id=>window.__SHEETS__.state().data.things[id]?.traits?.scene,place.id);await p.evaluate(id=>window.__SHEETS__.view('VTT',id),place.id);
 await p.waitForFunction(()=>window.__SHEETS__.state().level==='VTT'&&document.querySelector('#vttVectorCanvas'));
 await p.locator('#addNpcQuickBtn').click();await p.locator('#npcPopNew').click();
 await p.waitForFunction(()=>document.activeElement?.matches('#sheetPane [data-npc-name]'));
 await p.keyboard.press('Control+A');await p.keyboard.type('Vexa the Grey');await p.keyboard.press('Enter');
 let vexa;for(let i=0;i<40&&!(vexa=(await find2('Vexa the Grey')));i++)await new Promise(r=>setTimeout(r,250));
 assert(vexa,'VTT New NPC is saved with the name typed in the sheet pane');
 await p.locator('#addNpcQuickBtn').click();await p.locator('#npcPopExisting').selectOption({label:'Vexa the Grey'});
 await p.waitForFunction(()=>/Click the map to place Vexa/.test(document.querySelector('#statusMessage').textContent));
 const pt=await p.evaluate(()=>{const r=document.querySelector('#vttVectorCanvas').getBoundingClientRect();return {x:r.x+r.width*.3,y:r.y+r.height*.3};});
 await p.mouse.click(pt.x,pt.y);await p.waitForFunction(()=>/Placed Vexa/.test(document.querySelector('#statusMessage').textContent));
 console.log('PASS VTT New NPC: name it in the sheet pane, arm it and click the map to place its token');
 // Party to here: one click on the button, one on the map; every campaign PC gets a token on this map and floor.
 await p.locator('#partyHereBtn').click();await p.waitForFunction(()=>/where the party should stand/.test(document.querySelector('#statusMessage').textContent));
 await p.mouse.click(pt.x+60,pt.y+60);await p.waitForFunction(()=>/Party moved here/.test(document.querySelector('#statusMessage').textContent));
 let onMap=[],npcs=[];for(let i=0;i<40;i++){const st=await (await fetch(base+'/v2/campaigns/daddies/state/tokens')).json();onMap=Object.values(st||{}).map(g=>Object.entries(g||{}).filter(([k,t])=>/^pc_/.test(k)&&t?.f===0).map(([,t])=>t)).sort((a,b)=>b.length-a.length)[0]||[];npcs=Object.values(st||{}).flatMap(g=>Object.entries(g||{}).filter(([k])=>/^npc_/.test(k)).map(([,t])=>t.x+','+t.y));if(onMap.length>=2)break;await new Promise(r=>setTimeout(r,250));}
 assert(onMap.length>=2,'party PCs saved on the map: '+onMap.length);
 assert.equal(new Set(onMap.map(t=>t.x+','+t.y)).size,onMap.length,'each PC on its own cell');assert(!onMap.some(t=>npcs.includes(t.x+','+t.y)),'no PC lands on an NPC');assert.deepEqual(errors,[]);
 console.log('PASS Party to here: '+onMap.length+' PCs placed in a cluster and saved');
}finally{await browser?.close();if(app){app.server.closeAllConnections?.();await app.close();}assert.deepEqual(await readFile(source),original,'real Gaia source unchanged');await rm(dir,{recursive:true,force:true});}
