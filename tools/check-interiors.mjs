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
 await p.evaluate(()=>{__VTT.prefs.motion=false;__VTT.motion.setEnabled?.(false);});
 const sample=await p.evaluate(()=>{
  const a=__VTT,s=a.world.data.settlements.find(s=>s.kind==='town'),hs=a.buildings.housesOf(s);
  const h=hs.find(h=>h.L>5&&h.D>8&&!h.urban)||hs.find(h=>h.L>5&&h.D>8)||hs[0],key=a.buildings.keyOf(s,h);
  a.buildings.patchBuilding(key,{special:true,kind:'store',name:'The Copper Dragon Stores'});
  const e=a.interiors.layout(key),shape=JSON.stringify(e.plan);a.card.open('building',key);
  window.interiorSample={key,x:h.x,z:h.z,shape};return{key,L:h.L,D:h.D,plan:e.plan};
 });
 assert.ok(sample.plan.items.some(o=>o.type==='shelf'));assert.ok(sample.plan.items.some(o=>o.type==='counter'));
 await p.getByRole('button',{name:'Look inside',exact:true}).click();
 await p.waitForFunction(()=>__VTT.camDist()<80&&__VTT.interiors.loaded.has(window.interiorSample.key));
 await p.evaluate(()=>Promise.race([__VTT.idle(),new Promise(r=>setTimeout(r,15000))]));
 await p.waitForTimeout(350);
 assert.equal(await p.locator('#interiorPanel').isVisible(),true);
 const geometry=await p.evaluate(async()=>{
  const {CUT}=await import('/style.js'),{localPoint,worldPoint,itemBounds}=await import('/interior-layout.js'),a=__VTT,e=a.interiors.layout(window.interiorSample.key),g=a.interiors.loaded.get(e.key);
  let attributes=true,triangles=0;g.traverse(m=>{if(m.isMesh){const p=m.geometry.getAttribute('position');attributes&&=['color','aInkSurface','aInkMotionBase'].every(k=>m.geometry.getAttribute(k)?.count===p.count);triangles+=p.count/3;}});
  const target={x:e.plan.door.x,z:e.house.D/2},inside=worldPoint(e.house,target.x,target.z-.8),outside=worldPoint(e.house,target.x,target.z+.8),wallA=worldPoint(e.house,-e.house.L/2+.5,0),wallB=worldPoint(e.house,-e.house.L/2-.5,0);
  const openPass=!a.interiors.blocksMove(outside.x,outside.z,inside.x,inside.z),wallBlocks=a.interiors.blocksMove(wallA.x,wallA.z,wallB.x,wallB.z);
  const item=e.plan.items.find(o=>o.blocks),r=itemBounds(item),aa=worldPoint(e.house,item.x-r.w,item.z),bb=worldPoint(e.house,item.x+r.w,item.z),furnitureBlocks=a.interiors.blocksMove(aa.x,aa.z,bb.x,bb.z);
  return{attributes,triangles,cut:CUT.on.value,height:CUT.h.value,expected:e.house.floor+1.05,openPass,wallBlocks,furnitureBlocks,loaded:a.interiors.loaded.size};
 });
 assert.ok(geometry.attributes&&geometry.triangles>0);assert.equal(geometry.cut,1);assert.ok(Math.abs(geometry.height-geometry.expected)<.001);assert.ok(geometry.openPass&&geometry.wallBlocks&&geometry.furnitureBlocks);
 await p.screenshot({path:join(out,'interior-store.png')});
 await p.getByRole('button',{name:'Close door',exact:true}).click();
 const closed=await p.evaluate(async()=>{const {worldPoint}=await import('/interior-layout.js'),a=__VTT,e=a.interiors.layout(window.interiorSample.key),p=e.plan.door,u=worldPoint(e.house,p.x,p.z-.8),v=worldPoint(e.house,p.x,p.z+.8);return a.interiors.blocksMove(u.x,u.z,v.x,v.z);});assert.ok(closed);
 await p.evaluate(()=>__VTT.tools.undo());assert.equal(await p.evaluate(()=>__VTT.interiors.layout(window.interiorSample.key).plan.door.open),true);
 await p.evaluate(()=>__VTT.tools.redo());assert.equal(await p.evaluate(()=>__VTT.interiors.layout(window.interiorSample.key).plan.door.open),false);
 const removed=await p.evaluate(()=>{const a=__VTT,e=a.interiors.layout(window.interiorSample.key),id=e.plan.items[0].id,n=e.plan.items.length;a.interiors.remove(e.key,id);return{id,n,after:a.interiors.layout(e.key).plan.items.length};});assert.equal(removed.after,removed.n-1);
 await p.evaluate(()=>__VTT.tools.undo());assert.equal(await p.evaluate(()=>__VTT.interiors.layout(window.interiorSample.key).plan.items.length),removed.n);
 const moved=await p.evaluate(()=>{const a=__VTT,e=a.interiors.layout(window.interiorSample.key);for(const o of e.plan.items)for(const [dx,dz]of [[.75,0],[-.75,0],[0,.75],[0,-.75]])if(a.interiors.move(e.key,o.id,dx,dz))return{id:o.id};return null;});assert.ok(moved);
 const stored=await p.evaluate(()=>{__VTT.saveNow();return{state:JSON.stringify(__VTT.world.data.interiors),key:window.interiorSample.key,plan:JSON.stringify(__VTT.interiors.layout(window.interiorSample.key).plan)};});
 await p.reload();await p.waitForFunction(()=>window.__VTT?.interiors);
 assert.equal(await p.evaluate(()=>JSON.stringify(__VTT.world.data.interiors)),stored.state);
 assert.equal(await p.evaluate(key=>JSON.stringify(__VTT.interiors.layout(key).plan),stored.key),stored.plan);
 // House type and rotated footprint use the same planner in real world coordinates.
 const house=await p.evaluate(async(key)=>{const a=__VTT,{worldPoint,localPoint}=await import('/interior-layout.js');a.buildings.patchBuilding(key,{kind:'home'});const e=a.interiors.layout(key);const p=worldPoint(e.house,1,-1),back=localPoint(e.house,p.x,p.z);a.interiors.enter(key);return{items:e.plan.items.map(o=>o.type),yaw:e.house.yaw,roundtrip:Math.hypot(back.x-1,back.z+1)};},stored.key);
 assert.ok(house.items.includes('bed'));assert.ok(house.roundtrip<1e-8);
 await p.evaluate(()=>Promise.race([__VTT.idle(),new Promise(r=>setTimeout(r,15000))]));await p.waitForTimeout(300);await p.screenshot({path:join(out,'interior-house.png')});
 const perf=await p.evaluate(()=>new Promise(resolve=>{const dt=[],start=performance.now();let last=start;function frame(now){__VTT.orbitCamera(.003,0);if(now-start>500)dt.push(now-last);last=now;if(now-start<3500)requestAnimationFrame(frame);else{dt.sort((a,b)=>a-b);resolve({fps:Math.round(1000/(dt.reduce((s,x)=>s+x,0)/dt.length)),p95:dt[Math.floor(dt.length*.95)],loaded:__VTT.interiors.loaded.size,calls:__VTT.stats().calls});}}requestAnimationFrame(frame);}));
 await p.evaluate(()=>__VTT.flyTo(0,0,52000,.25));await p.waitForFunction(()=>__VTT.camDist()>5000);await p.waitForFunction(()=>__VTT.interiors.loaded.size===0);
 assert.deepEqual(errors,[]);
 await writeFile(join(out,'interiors-report.json'),JSON.stringify({sample:{key:sample.key,L:sample.L,D:sample.D,types:sample.plan.items.map(o=>o.type)},geometry,removed,moved,house,perf,errors},null,2));
 console.log('PASS: real hollow building interior, shelves/counter/beds, cutaway floor, valid geometry, doors/wall/furniture collision, undo/redo, furniture edits, save/reload, rotation, unloading. FPS '+perf.fps+' (p95 '+perf.p95.toFixed(1)+' ms).');

}finally{await browser?.close();await new Promise(r=>server.close(r));}
