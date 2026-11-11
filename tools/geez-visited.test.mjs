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
const alarus=Object.values(data.worlds.gaia.entities).find(e=>e.name==='Sanctus Alarus'),road=Object.values(data.worlds.gaia.entities).find(e=>e.name==='Sanctus Forest Road');
assert(alarus&&road&&!JSON.stringify(data.campaigns).includes('"visited"'),'fixture: visited only in legacy properties');
const db=createFakeRTDB({'v2-test':{visited:firebaseLayout(data)}}),errors=[];
let web,browser;
try{
 web=http.createServer(async(req,res)=>{try{const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root+sep))throw Error('path');const body=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end();}});
 await new Promise(ok=>web.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+web.address().port;
 const {chromium}=await import(pathToFileURL(join(process.env.APPDATA,'npm/node_modules/@playwright/mcp/node_modules/playwright/index.mjs')));browser=await chromium.launch({headless:true,channel:'msedge'});
 async function page(query,sheet=false){const ctx=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true});await installFake(ctx,db);const p=await ctx.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});p.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))console.log('BROWSER',m.text());});p.on('dialog',d=>d.accept());await p.route(/https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());await p.goto(`${base}/geez-${sheet?'sheet':'index'}.html?gaia=firebase:/v2-test/visited&db=gaia&campaign=world__daddies&test&${query}`,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__SHEETS__?.state().data.pcs.ashara);return p;}
 const gm=await page('gm=jonny'),player=await page('player&pc=ashara');
 const visited=(p,name)=>p.evaluate(name=>{const t=Object.values(window.__SHEETS__.state().data.things).find(t=>t.name===name);return !!t&&(t.properties||[]).some(x=>x.key==='pc-visited'&&x.value==='true');},name);
 assert.equal(await visited(player,'Sanctus Alarus'),true,'legacy visited reaches the player');
 assert.equal(await visited(player,'Sanctus Forest Road'),true);
 console.log('PASS legacy pc-visited flags reach the player view (world fog opens again)');
 // GM unticks visited: stored as reveals.visited=false and the player loses it; ticking again restores it.
 const toggle=(on)=>gm.evaluate(([name,on])=>{const t=Object.values(window.__SHEETS__.state().data.things).find(t=>t.name===name);t.properties=(t.properties||[]).filter(p=>p.key!=='pc-visited');if(on)t.properties.push({key:'pc-visited',value:'true'});return window.__SHEETS__.database().ref('geezvtt/campaign/things/'+Object.keys(window.__SHEETS__.state().data.things).find(k=>window.__SHEETS__.state().data.things[k]===t)).set(t);},['Sanctus Alarus',on]);
 await toggle(false);await player.waitForFunction(()=>{const t=Object.values(window.__SHEETS__.state().data.things).find(t=>t.name==='Sanctus Alarus');return t&&!(t.properties||[]).some(x=>x.key==='pc-visited');});
 assert.equal(db.get?db.get(`v2-test/visited/campaigns/daddies/reveals/${alarus.id}/visited`):false,false);
 await toggle(true);await player.waitForFunction(()=>{const t=Object.values(window.__SHEETS__.state().data.things).find(t=>t.name==='Sanctus Alarus');return t&&(t.properties||[]).some(x=>x.key==='pc-visited');});
 console.log('PASS GM visited toggle saves to the campaign reveal and syncs to the player');
 assert.deepEqual(errors,[]);
}finally{await browser?.close();if(web)await new Promise(ok=>web.close(ok));assert.deepEqual(await readFile(source),original,'real Gaia source unchanged');}
