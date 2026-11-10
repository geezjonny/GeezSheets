// Real framebuffer regression: night must be dark, and fire must illuminate paper.
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
async function pixels(page,withoutFire=false){return page.evaluate(async withoutFire=>{
 const {HalfFloatType,DataUtils}=await import('./vendor/three/three.module.js');
 const a=__VTT,lights=[];a.scene.traverse(o=>{if(o.isPointLight){lights.push([o,o.intensity]);if(withoutFire)o.intensity=0;}});
 try{
  a.ink.render(a.scene,a.camera,a);const w=a.ink.width,h=a.ink.height,half=a.ink.color.texture.type===HalfFloatType,p=half?new Uint16Array(w*h*4):new Uint8Array(w*h*4);a.renderer.readRenderTargetPixels(a.ink.color,0,0,w,h,p);
  const linear=v=>half?DataUtils.fromHalfFloat(v):v/255;
  let r=0,g=0,b=0;for(let i=0;i<p.length;i+=4){r+=linear(p[i]);g+=linear(p[i+1]);b+=linear(p[i+2]);}const n=w*h;
  return{mean:(r*.2126+g*.7152+b*.0722)/n,r:r/n,g:g/n,b:b/n,active:lights.filter(([,i])=>i>0).length};
 }finally{for(const [l,i]of lights)l.intensity=i;}
},withoutFire);}
try{
 browser=await chromium.launch({headless:true,executablePath,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.addInitScript(()=>localStorage.setItem('geeztt-ink-prefs-v1',JSON.stringify({role:'gm',quality:'low',stats:false})));
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.__VTT?.ui);
 await page.evaluate(()=>{const s=__VTT.world.data.settlements.find(s=>s.kind==='camp');__VTT.flyTo(s.x,s.z,65,.7);});
 await page.waitForFunction(()=>__VTT.towns.nearCount>0,null,{timeout:60000});
 await page.evaluate(()=>Promise.race([__VTT.idle(),new Promise(r=>setTimeout(r,10000))]));
 await page.waitForTimeout(500);
 const day=await pixels(page);await page.screenshot({path:join(out,'night-test-day.png')});
 console.log('Day framebuffer:',day.mean.toFixed(4));
 await page.click('#wxBtn');await page.click('#wxPop [data-hour="22"]');await page.click('#wxBtn');
 await page.waitForFunction(()=>__VTT.weather.night>.99&&__VTT.weather.cur.hemi<.055,null,{timeout:60000});
 const fire=await pixels(page),dark=await pixels(page,true);
 await page.evaluate(()=>__VTT.request());await page.waitForTimeout(200);
 await page.screenshot({path:join(out,'night-test-torches.png')});
 assert.ok(fire.mean<day.mean*.35,`night must be much darker: ${fire.mean} vs day ${day.mean}`);
 assert.ok(fire.active>0,'nearby fires have active point lights');
 assert.ok(fire.mean>dark.mean*1.15,`point lights must illuminate surfaces: ${fire.mean} vs unlit ${dark.mean}`);
 assert.ok(fire.r-dark.r>fire.b-dark.b,'firelight is warm');
 assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('is-night')),true);
 assert.deepEqual(errors,[],'no shader or JavaScript errors');
 await writeFile(join(out,'night-report.json'),JSON.stringify({day,fire,dark,errors},null,2));
 console.log('PASS: dark night; warm light pools on paper from real point lights; night UI.');
 console.log(JSON.stringify({day,fire,dark}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
