import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createFakeRTDB,installFake} from './geez-fake-rtdb.mjs';
import {firebaseLayout} from '../js/geez-gaia-core/firebase-layout.mjs';
import {executeWrite} from '../js/geez-gaia-core/write.mjs';
import {schema} from '../js/geez-gaia-core/schema-loader.mjs';
const source=new URL('../../GeezSuite/data/gaia-v2.json',import.meta.url),original=await readFile(source),data=JSON.parse(original),root=resolve('.');
const ash=Object.values(data.worlds.gaia.entities).find(e=>e.kind==='pc'&&e.name==='Ashara'),liora=Object.values(data.worlds.gaia.entities).find(e=>e.kind==='pc'&&e.name==='Liora');
const scene=JSON.parse(await readFile(new URL('geez-fixtures/prison.geez2vtt',import.meta.url)));scene.name='VTT core proving ground';scene.grid={cols:20,rows:16,cell_ft:5};
scene.floors=[{...scene.floors[0],walls:[],portals:[],lights:[],props:[],rooms:[]}];
const place='place_vttcore',map='map_vttcore',npc='npc_vttcore',far='npc_vttcore_far';
data.worlds.gaia.entities[place]={id:place,kind:'place',name:'VTT core proving ground',world:'gaia',campaign:'daddies',data:{place_kind:'battlemap',childMap:map}};
data.worlds.gaia.entities[map]={id:map,kind:'map',name:scene.name,world:'gaia',campaign:'daddies',data:{parent_place:place,scene}};
for(const [id,name]of [[npc,'Bloodied goblin'],[far,'Distant ogre']])data.worlds.gaia.entities[id]={id,kind:'npc',name,world:'gaia',campaign:'daddies',data:{profile:{},statblock:{stats:{con:12},combat:{hp_current:20,hp_max:20}}}};
ash.data.combat={...ash.data.combat,hp_current:100,hp_max:100,temp_hp:0};ash.data.stats.con=14;
for(const id of [place,map,npc,far])data.campaigns.daddies.reveals[id]={known:true};
data.campaigns.daddies.state.tokens={[map]:{[ash.id]:{x:5.5/20,y:5.5/16,f:0},[npc]:{x:7.5/20,y:5.5/16,f:0},[far]:{x:18.5/20,y:14.5/16,f:0}}};
data.campaigns.daddies.state.active_map=map;
(data.apps.sheets.campaign??={battles:{}}).battles[place]={tokens:{},vision:false};
// Boundary assertions bypass the UI, including rejected cross-campaign and oversized writes.
const template={map:place,owner:ash.id,shape:'circle',size:20,x:.3,y:.3,angle:0,f:0,color:'#8a6526'};
const auth={role:'player',pcs:[ash.id]};
for(const value of [{...template,size:1001},{...template,x:-1},{...template,owner:liora.id},{...template,map:'unknown'}])assert.throws(()=>executeWrite(data,schema,'campaigns/daddies/player/templates/invalid','PUT',{value},auth));
assert.throws(()=>executeWrite(data,schema,'campaigns/disney/player/templates/foreign','PUT',{value:template},auth));
const db=createFakeRTDB({'v2-test':{vttcore:firebaseLayout(data)}}),errors=[];
let web,browser;
try{
 web=http.createServer(async(req,res)=>{try{const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root+sep))throw Error('path');const body=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end();}});
 await new Promise(ok=>web.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+web.address().port;
 const {chromium}=await import(pathToFileURL(join(process.env.APPDATA,'npm/node_modules/@playwright/mcp/node_modules/playwright/index.mjs')));browser=await chromium.launch({headless:true,channel:'msedge'});
 async function page(query,sheet=false){const ctx=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true});await installFake(ctx,db);const p=await ctx.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});p.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))console.log('BROWSER',m.text());});p.on('dialog',d=>d.accept());await p.route(/https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());await p.goto(`${base}/geez-${sheet?'sheet':'index'}.html?gaia=firebase:/v2-test/vttcore&db=gaia&campaign=world__daddies&test&${query}`,{waitUntil:'domcontentloaded'});await p.waitForFunction(sheet?()=>document.querySelector('#hpval-ashara'):()=>window.__SHEETS__?.state().data.pcs.ashara);return p;}
 const gm=await page('gm=jonny'),player=await page('player&pc=ashara'),sheet=await page('char=ashara&live=world__daddies',true);
 for(const p of [gm,player]){await p.evaluate(id=>window.__SHEETS__.view('VTT',id),place);await p.waitForFunction(()=>window.__SHEETS__.state().loaded&&document.querySelector('[data-token-id]')&&document.querySelector('#geezTemplateTool'));}
 await gm.evaluate(async()=>{window.core=await (await import('./js/geez-gaia-firebase.mjs')).connect('firebase:/v2-test/vttcore',()=>{},()=> 'gm');});
 const act=(name,args)=>gm.evaluate(({name,args})=>window.core.request('actions/'+name,'POST',{args:{campaign:'daddies',...args}}),{name,args});
 const set=(p,path,value)=>p.evaluate(({path,value})=>window.__SHEETS__.database().ref(path).set(value),{path,value});
 const count=async(p,n)=>{try{await p.waitForFunction(n=>Object.keys(window.__SHEETS__.state().templates).length===n,n);}catch(e){await mkdir('tools/out',{recursive:true});await p.screenshot({path:'tools/out/vttcore-debug.png'});console.log('COUNT',n,await p.locator('#geezTemplateTool').textContent(),await p.evaluate(()=>window.__SHEETS__.state().templates));throw e;}};
 async function point(p,x,y){return p.evaluate(({x,y})=>{const r=document.querySelector('#vttVectorCanvas').getBoundingClientRect();return {x:r.x+r.width*x,y:r.y+r.height*y};},{x,y});}
 async function placeShape(p,shape,i){const tool=p.locator('#geezTemplateTool');await tool.locator('summary').click();await tool.locator('select').selectOption(shape);await tool.locator('input').fill('20');await tool.getByRole('button',{name:'Place template',exact:true}).click();await tool.locator('summary').click();const a=await point(p,.20+i*.07,.35),b=await point(p,.23+i*.07,.35);console.log('POINTS',a,b);await p.touchscreen.tap(a.x,a.y);await p.touchscreen.tap(b.x,b.y);}
 let total=0;for(const p of [gm,player])for(const [i,shape]of ['cone','circle','line','square'].entries()){console.log('PLACE',p===gm?'gm':'player',shape);await placeShape(p,shape,i);await count(gm,++total);await count(player,total);}
 console.log('PASS GM and player place all four shapes with primary touch; independent browsers sync');
 const all=await gm.evaluate(()=>window.__SHEETS__.state().templates),gmId=Object.keys(all).find(k=>all[k].owner==='gm'),playerId=Object.keys(all).find(k=>all[k].owner!=='gm');assert(gmId&&playerId);
 await assert.rejects(()=>set(player,'geezvtt/live/world__daddies/templates/'+gmId,null));await count(gm,8);
 await set(gm,'geezvtt/live/world__daddies/templates/'+playerId,null);await count(player,7);
 console.log('PASS player cannot delete GM template; GM can delete player template');
 // Known geometry: origin (5.5,5.5), cone/line/square include Ashara and goblin, not ogre.
 const known={...template,map:place,owner:'gm',x:5.5/20,y:5.5/16};
 for(const shape of ['cone','circle','line','square']){await set(gm,'geezvtt/live/world__daddies/templates/known',{...known,shape});await gm.waitForFunction(shape=>window.__SHEETS__.state().templates.known?.shape===shape,shape);const label=gm.locator('button[data-aoe="known"]');await label.click();assert.match(await gm.locator('[data-template-info]').innerText(),/Ashara/);assert.match(await gm.locator('[data-template-info]').innerText(),/Bloodied goblin/);assert.doesNotMatch(await gm.locator('[data-template-info]').innerText(),/Distant ogre/);}
 await gm.locator('#geezTemplateTool summary').click();
 console.log('PASS caught-token lists for every shape match known near/far layout');
 const goblin=p=>p.locator(`[data-token-id="${npc}"]`);
 await act('hp.damage',{entity:npc,amount:10});await player.waitForFunction(id=>document.querySelector(`[data-token-id="${id}"] [data-hp-status="bloodied"]`),npc);
 assert.match(await goblin(gm).innerText(),/10.*20/);assert.doesNotMatch(await goblin(player).innerText(),/10\/20/);
 await act('hp.damage',{entity:npc,amount:10});await player.waitForFunction(id=>document.querySelector(`[data-token-id="${id}"] [data-hp-status="down"]`),npc);
 await set(gm,`geezvtt/live/world__daddies/tokens/${place}/${npc}/hideHp`,true);await player.waitForFunction(id=>!document.querySelector(`[data-token-id="${id}"] [data-hp-status]`),npc);
 await act('hp.heal',{entity:npc,amount:20});await set(gm,`geezvtt/live/world__daddies/tokens/${place}/${npc}/hideHp`,false);await player.waitForFunction(id=>!document.querySelector(`[data-token-id="${id}"] [data-hp-status]`),npc);
 console.log('PASS GM exact HP; player NPC bloodied/down statuses, hidden flag and unhurt state');
 await sheet.locator('[aria-label="Concentration spell"]').fill('Bless');await sheet.locator('[aria-label="Concentrating"]').check();
 await gm.waitForFunction(()=>window.__SHEETS__.state().data.pcs.ashara.combat.concentration?.active);
 await sheet.locator('#hpdelta-ashara').fill('28');await sheet.locator('.hp-btn.dmg').first().click();
 for(const p of [gm,player,sheet])await p.getByText('Concentration save: CON DC 14',{exact:false}).first().waitFor();
 await sheet.getByRole('button',{name:'Roll CON save',exact:true}).click();
 await sheet.getByRole('button',{name:'Drop',exact:true}).click();await gm.waitForFunction(()=>!window.__SHEETS__.state().data.pcs.ashara.combat.concentration?.active);
 await act('concentration.set',{entity:ash.id,spell:'Spirit guardians'});await act('hp.damage',{entity:ash.id,amount:100});await player.waitForFunction(()=>!window.__SHEETS__.state().data.pcs.ashara.combat.concentration?.active);
 console.log('PASS damage via normal sheet path prompts owner and GM at DC 14; roll, Drop and zero HP clear concentration');
 await act('hp.heal',{entity:ash.id,amount:100});await act('concentration.set',{entity:ash.id,spell:'Bless'});
 await set(player,'characters/pcs/ashara/combat/elevation',30);await gm.waitForFunction(()=>document.querySelector('[data-elevation="30"]'));await gm.waitForFunction(()=>document.querySelector('[data-elevation="30"] .fa-feather-pointed'));await player.waitForFunction(()=>document.querySelector('[data-elevation="30"]'));
 await assert.rejects(()=>set(player,'characters/pcs/liora/combat/elevation',5));await act('elevation.set',{entity:npc,feet:-10});await player.waitForFunction(()=>document.querySelector('[data-elevation="-10"]'));
 await player.evaluate(()=>{const [id]=Object.entries(window.__SHEETS__.state().data.things).find(([,t])=>t.traits?.pc&&t.name==='Ashara');window.__SHEETS__.select(id);});
 await player.locator('[data-vttcore-card]').getByRole('button',{name:'+5 ft',exact:true}).click();await gm.waitForFunction(()=>document.querySelector('[data-elevation="35"]'));
 assert(!await gm.locator('[data-elevation="-10"] .fa-feather-pointed').count());console.log('PASS elevation badges, wing badge only when flying; owner +5 card works; foreign player edits rejected; GM edits NPC');
 // Keep bloodied, concentration, elevation and all template shapes visible in the artifacts.
 await act('hp.damage',{entity:npc,amount:10});
 for(const p of [gm,player]){await p.evaluate(()=>window.__SHEETS__.select(null));await p.locator('#sidebarCollapseBtn').click().catch(()=>{});}
 await mkdir('tools/out',{recursive:true});
 for(const [name,p]of [['gm',gm],['player',player]])for(const width of [1280,360]){await p.setViewportSize({width,height:900});await p.screenshot({path:`tools/out/vttcore-${name}-${width}.png`});}
 assert.deepEqual(errors,[]);console.log('PASS offline browser errors empty; desktop/phone screenshots saved');
}finally{await browser?.close();if(web)await new Promise(ok=>web.close(ok));assert.deepEqual(await readFile(source),original,'real Gaia source unchanged');}
