import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {chromium} from './browser.mjs';
import {serve} from './serve.mjs';
const out=fileURLToPath(new URL('./out/',import.meta.url));await mkdir(out,{recursive:true});
const executablePath=process.env.CHROME||['chromium-1248','chromium-1247'].map(v=>join(process.env.LOCALAPPDATA||'',`ms-playwright/${v}/chrome-win64/chrome.exe`)).find(existsSync);
const server=await serve();let browser;
async function ready(p){await p.evaluate(()=>Promise.race([__VTT.idle(),new Promise(r=>setTimeout(r,12000))]));await p.waitForTimeout(300);}
async function sample(p,on,pose){
 await p.evaluate(({on,pose})=>{const a=__VTT;a.setFineDetail(on);a.camera.position.fromArray(pose.position);a.controls.target.fromArray(pose.target);a.controls.update();a.request();},{on,pose});
 await p.waitForTimeout(400);
 return p.evaluate(()=>new Promise(resolve=>{
  const a=__VTT,original=a.ink.render;let count=0;a.ink.render=function(...args){count++;return original.apply(this,args);};const start=performance.now();
  const tick=now=>{if(now-start>=2500){a.ink.render=original;resolve({...a.stats(),fps:count*1000/(now-start),seconds:(now-start)/1000});return;}a.orbitCamera(.0015,0,false);requestAnimationFrame(tick);};requestAnimationFrame(tick);
 }));
}
try{
 browser=await chromium.launch({headless:true,executablePath,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
 await context.addInitScript(()=>localStorage.setItem('geeztt-ink-prefs-v1',JSON.stringify({role:'gm',quality:'high',stats:false})));
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto(`http://127.0.0.1:${server.address().port}/`);await p.waitForFunction(()=>window.__VTT?.microDetail);await ready(p);
 const gpu=await p.evaluate(()=>{const g=__VTT.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return g.getParameter(e?e.UNMASKED_RENDERER_WEBGL:g.RENDERER);});
 const results=[];
 for(const [name,d,t]of[['world',52000,.25],['town',650,.65],['battle',100,.85],['close',35,.6]]){
  if(name!=='world'){await p.evaluate(([d,t])=>{const s=__VTT.world.data.settlements[0];__VTT.flyTo(s.x,s.z,d,t);},[d,t]);await p.waitForTimeout(1400);await ready(p);}
  const pose=await p.evaluate(()=>({position:__VTT.camera.position.toArray(),target:__VTT.controls.target.toArray()}));
  const simple=await sample(p,false,pose),fine=await sample(p,true,pose);results.push({view:name,simple,fine});
  console.log(`${name}: Simple ${simple.fps.toFixed(1)}, Fine ${fine.fps.toFixed(1)} fps; ${fine.pebbles} small stones`);
  if(name==='world')assert.equal(fine.pebbles,0,'no decorative stones at world scale');
  if(name==='close')await p.screenshot({path:join(out,'fine-detail-cobbles.png')});
 }
 const semantic=await p.evaluate(()=>{const counts={};let valid=true;__VTT.scene.traverse(o=>{const a=o.geometry?.attributes.aInkSurface;if(a){valid&&=a.count===o.geometry.attributes.position.count;for(let i=0;i<a.count;i++)counts[a.array[i]]=(counts[a.array[i]]||0)+1;}});return{counts,valid};});
 assert.ok(semantic.valid&&semantic.counts[1]>0&&semantic.counts[2]>0&&semantic.counts[3]>0,'wood, stone, and foliage tags exist and align with vertices');
 const stones=await p.evaluate(()=>{const m=__VTT.microDetail.mesh;return{count:m.count,cast:m.castShadow,data:Array.from(m.instanceMatrix.array.slice(0,m.count*16))};});
 assert.ok(stones.count>0&&stones.count<=400);assert.equal(stones.cast,false);
 await p.evaluate(()=>{__VTT.microDetail.signature='';__VTT.microDetail.update();});
 const translations=a=>a.filter((_,i)=>i%16>=12&&i%16<15);
 assert.deepEqual(translations(await p.evaluate(()=>Array.from(__VTT.microDetail.mesh.instanceMatrix.array.slice(0,__VTT.microDetail.mesh.count*16)))),translations(stones.data),'stones keep identical world positions while their distance fade changes');
 await p.click('#menuBtn');await p.getByRole('button',{name:'Simple',exact:true}).click();
 await p.waitForFunction(()=>__VTT.microDetail.count===0);assert.equal(await p.evaluate(()=>__VTT.prefs.fineDetail),false);
 await p.getByRole('button',{name:'Fine',exact:true}).click();await p.click('#menuBtn');
 // Capture real forest foliage, not a synthetic material sample.
 await p.evaluate(()=>{const w=__VTT.world,s=w.data.settlements.find(s=>s.kind==='camp');let best=null,dist=Infinity;for(let z=s.z-1500;z<s.z+1500;z+=80)for(let x=s.x-1500;x<s.x+1500;x+=80){const d=Math.hypot(x-s.x,z-s.z);if(w.typeAt(x,z)===4&&w.height(x,z)>1&&d<dist){best={x,z};dist=d;}}__VTT.flyTo(best.x,best.z,45,.8);});
 await p.waitForTimeout(1400);await ready(p);await p.screenshot({path:join(out,'fine-detail-leaves.png')});
 await p.evaluate(()=>__VTT.weather.changeTime({hour:22}));await p.waitForFunction(()=>__VTT.weather.night>.99&&__VTT.weather.cur.hemi<.055,null,{timeout:60000});
 await p.screenshot({path:join(out,'fine-detail-night.png')});assert.equal(await p.evaluate(()=>__VTT.shadows.enabled),false);
 assert.deepEqual(errors,[],'no shader or JavaScript errors');
 await writeFile(join(out,'fine-detail-fps.json'),JSON.stringify({gpu,viewport:'1280x900',quality:'High',method:'2.5s continuous orbit; restore identical camera pose for Fine/Simple comparison',results,semantic,errors},null,2));
 console.log('PASS: semantic surfaces, deterministic nearby stones, distance exclusion, no tiny-object shadows, Fine/Simple UI, forest and night rendering; no shader errors.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
