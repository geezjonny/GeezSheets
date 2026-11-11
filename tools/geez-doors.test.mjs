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
const E=data.worlds.gaia.entities,ash=Object.values(E).find(e=>e.kind==='pc'&&e.name==='Ashara');
// The prison fixture as a daddies battle map (place + map), like the other map tests.
const scene=JSON.parse(await readFile(new URL('geez-fixtures/prison.geez2vtt',import.meta.url))),place='place_doortest',mapId='map_doortest';
E[place]={id:place,kind:'place',name:'Door test',world:'gaia',campaign:'daddies',data:{place_kind:'battlemap',childMap:mapId}};
E[mapId]={id:mapId,kind:'map',name:scene.name,world:'gaia',campaign:'daddies',data:{parent_place:place,scene}};data.campaigns.daddies.reveals[place]={known:true};data.campaigns.daddies.reveals[mapId]={known:true};
const map=E[mapId];
const {cols,rows}=map.data.scene.grid,portals=map.data.scene.floors[0].portals,level=map.data.scene.floors[0].level;
const di=portals.findIndex(p=>p.kind==='door'),door=portals[di],mid=[(door.a[0]+door.b[0])/2,(door.a[1]+door.b[1])/2];
const st=data.campaigns.daddies.state;st.tokens||={};(st.tokens[place]||={})[ash.id]={x:mid[0]/cols,y:(mid[1]+.5)/rows,f:level};
const auth={role:'player',pcs:[ash.id]},key='scene-door-'+di,put=(k,v,a=auth)=>executeWrite(data,schema,`campaigns/daddies/player/doors/${place}/${level}/${k}`,'PUT',{value:v},a);
const out=put(key,'open');assert.deepEqual(out.writes.map(w=>w.path),[`apps/sheets/table3d/world__daddies/${place}/doors/${level}/${key}`]);
assert.throws(()=>put(key,'ajar'),/open or closed/);assert.throws(()=>put('scene-door-999','open'),/Unknown door/);
const wi=portals.findIndex(p=>['window','arch'].includes(p.kind));if(wi>=0)assert.throws(()=>put('scene-door-'+wi,'open'),/cannot be opened/);
st.tokens[place][ash.id]={x:(mid[0]+6)/cols,y:(mid[1]+6)/rows,f:level};assert.throws(()=>put(key,'open'),/Stand next to the door/);
st.tokens[place][ash.id]={x:mid[0]/cols,y:(mid[1]+.5)/rows,f:level+1};assert.throws(()=>put(key,'open'),/Stand next to the door/);
assert.throws(()=>put(key,'open',{role:'player',pcs:[]}),/own PC campaign/);
console.log('PASS player door rule: next to a real door on the same floor only; windows, unknown doors, far or other-floor tokens refused');
st.tokens[place][ash.id]={x:mid[0]/cols,y:(mid[1]+.5)/rows,f:level};
const db=createFakeRTDB({'v2-test':{doors:firebaseLayout(data)}}),errors=[];
let web,browser;
try{
 web=http.createServer(async(req,res)=>{try{const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root+sep))throw Error('path');const body=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end();}});
 await new Promise(ok=>web.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+web.address().port;
 const {chromium}=await import(pathToFileURL(join(process.env.APPDATA,'npm/node_modules/@playwright/mcp/node_modules/playwright/index.mjs')));browser=await chromium.launch({headless:true,channel:'msedge'});
 async function page(query,sheet=false){const ctx=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true});await installFake(ctx,db);const p=await ctx.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});p.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))console.log('BROWSER',m.text());});p.on('dialog',d=>d.accept());await p.route(/https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());await p.goto(`${base}/geez-${sheet?'sheet':'index'}.html?gaia=firebase:/v2-test/doors&db=gaia&campaign=world__daddies&test&${query}`,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__SHEETS__?.state().data.pcs.ashara);return p;}
 const player=await page('player&pc=ashara');
 await player.evaluate(id=>window.__SHEETS__.view('VTT',id),place);
 await player.waitForFunction(()=>window.__SHEETS__.geometry()?.doors?.length);
 const before=await player.evaluate(k=>window.__SHEETS__.geometry().doors.find(d=>d.key===k).closed,key);
 await player.evaluate(k=>window.__SHEETS__.toggleDoor(k),key);
 await player.waitForFunction(({k,b})=>window.__SHEETS__.geometry().doors.find(d=>d.key===k).closed!==b,{k:key,b:before});
 console.log('PASS player standing at a door opens/closes it from the map and it syncs');
 assert.deepEqual(errors,[]);
}finally{await browser?.close();if(web)await new Promise(ok=>web.close(ok));assert.deepEqual(await readFile(source),original,'real Gaia source unchanged');}
