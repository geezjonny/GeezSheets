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
async function ready(page){await page.evaluate(()=>Promise.race([__VTT.idle(),new Promise(r=>setTimeout(r,15000))]));await page.waitForTimeout(500);}
async function sample(page,name){
 const result=await page.evaluate(()=>new Promise(resolve=>{
  const a=__VTT,original=a.ink.render;let count=0;a.ink.render=function(...args){count++;return original.apply(this,args);};
  const start=performance.now();const tick=now=>{if(now-start>=2500){a.ink.render=original;resolve({...a.stats(),fps:count*1000/(now-start),seconds:(now-start)/1000,quality:a.quality.name});return;}a.orbitCamera(.0015,0,false);requestAnimationFrame(tick);};requestAnimationFrame(tick);
 }),null);
 // stats() contains an idle-inclusive FPS; the render counter above is the measured value.
 console.log(name,JSON.stringify(result));return{view:name,...result};
}
try{
 browser=await chromium.launch({headless:true,executablePath,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
 await context.addInitScript(()=>localStorage.setItem('geeztt-ink-prefs-v1',JSON.stringify({role:'gm',quality:'high',stats:false})));
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${srv.address().port}/`);await page.waitForFunction(()=>window.__VTT?.shadows);await ready(page);
 const gpu=await page.evaluate(()=>{const gl=__VTT.renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
 console.log('GPU:',gpu);const samples=[await sample(page,'world')];
 for(const [name,dist,tilt]of[['town',650,.65],['battle',100,.85]]){
  await page.evaluate(([d,t])=>{const s=__VTT.world.data.settlements[0];__VTT.flyTo(s.x,s.z,d,t);},[dist,tilt]);
  await page.waitForFunction(()=>__VTT.towns.nearCount>0,null,{timeout:60000});await ready(page);
  samples.push(await sample(page,name));
 }
 assert.equal(await page.evaluate(()=>__VTT.shadows.enabled),true);
 const contrast=await page.evaluate(async()=>{
  const a=__VTT,{DataUtils,HalfFloatType}=await import('./vendor/three/three.module.js');
  const mean=()=>{a.ink.render(a.scene,a.camera,a);const t=a.ink.color,half=t.texture.type===HalfFloatType,p=half?new Uint16Array(t.width*t.height*4):new Uint8Array(t.width*t.height*4);a.renderer.readRenderTargetPixels(t,0,0,t.width,t.height,p);let sum=0;const cv=x=>half?DataUtils.fromHalfFloat(x):x/255;for(let i=0;i<p.length;i+=4)sum+=cv(p[i])*.2126+cv(p[i+1])*.7152+cv(p[i+2])*.0722;return sum/(t.width*t.height);};
  const shadowed=mean();a.shadows.sun.castShadow=false;const unshadowed=mean();a.shadows.update(a);return{shadowed,unshadowed};
 });
 assert.ok(contrast.unshadowed>contrast.shadowed*1.01,'cast shadows must visibly darken receiving surfaces');
 await page.evaluate(()=>__VTT.request());await page.waitForTimeout(150);await page.screenshot({path:join(out,'ink-day-shadows.png')});
 await page.click('[data-tool="play"]');await page.getByRole('button',{name:'Cutaway',exact:true}).click();await page.waitForTimeout(250);await page.screenshot({path:join(out,'ink-day-shadow-cutaway.png')});
 await page.evaluate(()=>__VTT.weather.changeTime({hour:22}));await page.waitForFunction(()=>__VTT.weather.night>.99&&__VTT.weather.cur.hemi<.055,null,{timeout:60000});
 assert.equal(await page.evaluate(()=>__VTT.shadows.enabled),false,'sun shadows switch off at night');
 assert.deepEqual(errors,[]);const report={gpu,viewport:'1280x900',quality:'high',method:'2.5 seconds of continuous orbit per view, actual atlas render calls',samples,contrast,errors};
 await writeFile(join(out,'shadow-fps-report.json'),JSON.stringify(report,null,2));console.log('PASS: daylight cast shadows, cutaway, nighttime shadow disable; no shader errors.');console.log(JSON.stringify(contrast));
}finally{await browser?.close();await new Promise(r=>srv.close(r));}
