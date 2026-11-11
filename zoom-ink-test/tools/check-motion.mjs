import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './browser.mjs';
import {serve} from './serve.mjs';
const out=fileURLToPath(new URL('./out/',import.meta.url));await mkdir(out,{recursive:true});
const executablePath=process.env.CHROME||['chromium-1248','chromium-1247'].map(v=>join(process.env.LOCALAPPDATA||'',`ms-playwright/${v}/chrome-win64/chrome.exe`)).find(existsSync);
const srv=await serve();let browser;
async function ready(p){await p.evaluate(()=>Promise.race([__VTT.idle(),new Promise(r=>setTimeout(r,12000))]));await p.waitForTimeout(350);}
async function compareFrames(p){return p.evaluate(async()=>{
 const a=__VTT,{WORLD_MOTION}=await import('./motion-shader.js');a.motion.enabled=false;a.motion.embers.visible=false;
 const image=(t,amount)=>{WORLD_MOTION.time.value=t;WORLD_MOTION.amount.value=amount;a.shadows.update(a);a.ink.render(a.scene,a.camera,a);const target=a.ink.color,p=new Uint16Array(target.width*target.height*4);a.renderer.readRenderTargetPixels(target,0,0,target.width,target.height,p);return p;};
 const delta=(x,y)=>{let n=0;for(let i=0;i<x.length;i+=4)if(x[i]!==y[i]||x[i+1]!==y[i+1]||x[i+2]!==y[i+2])n++;return n;};
 const moving=delta(image(0,1),image(2,1)),still=delta(image(0,0),image(2,0));
 a.motion.enabled=true;a.motion.sync();a.request();return{movingPixels:moving,stillPixels:still};
});}
async function sample(p,on,pose){
 await p.evaluate(({on,pose})=>{const a=__VTT;a.motion.setEnabled(on);a.camera.position.fromArray(pose.pos);a.controls.target.fromArray(pose.target);a.controls.update();a.request();},{on,pose});await p.waitForTimeout(350);
 return p.evaluate(()=>new Promise(resolve=>{const a=__VTT,original=a.ink.render;let n=0;a.ink.render=function(...v){n++;return original.apply(this,v);};const start=performance.now();const tick=now=>{if(now-start>=2500){a.ink.render=original;resolve({...a.stats(),fps:n*1000/(now-start),seconds:(now-start)/1000});return;}a.orbitCamera(.0015,0,false);requestAnimationFrame(tick);};requestAnimationFrame(tick);}));
}
try{
 browser=await chromium.launch({headless:true,executablePath,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
 await context.addInitScript(()=>localStorage.setItem('geeztt-ink-prefs-v1',JSON.stringify({role:'gm',quality:'high',stats:false})));
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto(`http://127.0.0.1:${srv.address().port}/`);await p.waitForFunction(()=>window.__VTT?.motion);await ready(p);
 const gpu=await p.evaluate(()=>{const g=__VTT.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return g.getParameter(e?e.UNMASKED_RENDERER_WEBGL:g.RENDERER);});
 const tokens=await p.evaluate(()=>JSON.stringify(__VTT.world.data.tokens));
 const water=await compareFrames(p);assert.ok(water.movingPixels>100,'distant water moves');assert.equal(water.stillPixels,0,'Still mode freezes water');
 const samples=[];
 for(const [name,dist,tilt]of[['world',52000,.25],['town',650,.65],['battle',100,.85]]){
  if(name!=='world'){await p.evaluate(([d,t])=>{const s=__VTT.world.data.settlements[0];__VTT.flyTo(s.x,s.z,d,t);},[dist,tilt]);await p.waitForTimeout(1400);await ready(p);}
  const pose=await p.evaluate(()=>({pos:__VTT.camera.position.toArray(),target:__VTT.controls.target.toArray()}));
  const still=await sample(p,false,pose),living=await sample(p,true,pose);samples.push({view:name,still,living});console.log(`${name}: Still ${still.fps.toFixed(1)} / Living ${living.fps.toFixed(1)} fps`);
 }
 await p.evaluate(()=>{const w=__VTT.world,s=w.data.settlements.find(s=>s.kind==='camp');let best=null,dd=Infinity;for(let z=s.z-1500;z<s.z+1500;z+=80)for(let x=s.x-1500;x<s.x+1500;x+=80){const d=Math.hypot(s.x-x,s.z-z);if(d<dd&&w.typeAt(x,z)===4&&w.height(x,z)>1){dd=d;best={x,z};}}__VTT.flyTo(best.x,best.z,45,.8);});
 await p.waitForTimeout(1400);await ready(p);const trees=await compareFrames(p);assert.ok(trees.movingPixels>100,'foliage and matching shadows move');assert.equal(trees.stillPixels,0);
 await p.screenshot({path:join(out,'motion-trees.png')});
 await p.evaluate(()=>{const s=__VTT.world.data.settlements.find(s=>s.kind==='camp');__VTT.flyTo(s.x,s.z,60,.8);});await p.waitForTimeout(1400);await ready(p);
 const fire=await compareFrames(p);assert.ok(fire.movingPixels>10,'flame geometry changes');assert.equal(fire.stillPixels,0);
 await p.waitForTimeout(150);assert.ok(await p.evaluate(()=>__VTT.motion.embers.visible&&__VTT.motion.embers.geometry.drawRange.count>0));
 await p.evaluate(()=>__VTT.weather.changeTime({hour:22}));await p.waitForFunction(()=>__VTT.weather.night>.99&&__VTT.weather.cur.hemi<.055,null,{timeout:60000});await p.screenshot({path:join(out,'motion-night-fire.png')});
 await p.click('#menuBtn');await p.getByRole('button',{name:'Still',exact:true}).click();await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>__VTT.motion.active),false);assert.equal(await p.evaluate(()=>__VTT.motion.embers.visible),false);await p.getByRole('button',{name:'Living',exact:true}).click();await p.click('#menuBtn');
 await p.emulateMedia({reducedMotion:'reduce'});await p.waitForTimeout(150);const t=await p.evaluate(()=>__VTT.motion.time);await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>__VTT.motion.time),t,'reduced motion freezes time');assert.equal(await p.evaluate(()=>__VTT.motion.embers.visible),false);await p.emulateMedia({reducedMotion:'no-preference'});
 assert.equal(await p.evaluate(()=>JSON.stringify(__VTT.world.data.tokens)),tokens,'ambient motion never moves tokens');assert.deepEqual(errors,[]);
 await writeFile(join(out,'motion-report.json'),JSON.stringify({gpu,viewport:'1280x900',quality:'High',method:'2.5 seconds of continuous orbit, restored pose for Still/Living comparisons',samples,water,trees,fire,errors},null,2));
 console.log('PASS: water, foliage/shadow/outline deformation, flames, nearby embers, Still UI, reduced motion, fixed tokens; no shader errors.');
}finally{await browser?.close();await new Promise(r=>srv.close(r));}
