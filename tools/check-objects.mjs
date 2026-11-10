// WORLD phase B: node tools/check-objects.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

import { chromium } from './browser.mjs';
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
await mkdir(OUT, { recursive: true });
const local = `${process.env.LOCALAPPDATA}/ms-playwright`;
const executablePath = process.env.CHROME || ['chromium-1248', 'chromium-1247'].map(v => `${local}/${v}/chrome-win64/chrome.exe`).find(existsSync);
const srv = await serve(0), URL0 = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ executablePath, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let failed = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failed++; };
const idle = page => page.evaluate(() => Promise.race([window.__VTT.idle(), new Promise(r => setTimeout(r, 20000))])).then(() => page.waitForTimeout(400));
const fly = async (page, x, z, d, t) => { await page.evaluate(([x, z, d, t]) => window.__VTT.flyTo(x, z, d, t), [x, z, d, t ?? null]); await page.waitForTimeout(1500); await idle(page); };

async function open(opts, fresh = true) {
  const ctx = await browser.newContext(opts), page = await ctx.newPage(), errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  if (fresh) await page.addInitScript(() => { if (!sessionStorage.getItem('x')) { localStorage.clear(); sessionStorage.setItem('x', 1); } });
  await page.goto(URL0); await page.waitForFunction(() => window.__VTT && window.__VTT.card); await idle(page);
  return { ctx, page, errors };
}

const point=async(page,sx,sz)=>page.evaluate(([sx,sz])=>{const a=window.__VTT,x=(sx+.5)*1.5-20480,z=(sz+.5)*1.5-20480;return a.project(x,a.world.height(x,z),z);},[sx,sz]);
const choose=async(page,k)=>{await page.selectOption('[aria-label="Detail brush"]','objects');await page.selectOption('[aria-label="Object kind"]',k);};
for(const phone of [false,true]) {
 const {ctx,page,errors}=await open({viewport:phone?{width:390,height:844}:{width:1366,height:768},hasTouch:phone,isMobile:phone,deviceScaleFactor:phone?3:1});
 console.log(phone?'objects phone':'objects desktop');
 await fly(page,0,0,phone?30:38,.001);await page.locator('[data-tool=detail]').click();await choose(page,'table');
 const sx=13653,sz=13653,p=await point(page,sx,sz);
 const tap=async p=>{if(phone)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);await idle(page);};
 const object=()=>page.evaluate(([x,z])=>window.__VTT.detail.getSquare(0,x,z).object,[sx,sz]);
 await tap(p);ok((await object())?.k==='table','tap places table in snapped square');
 await tap(p);ok((await object())?.rot===1,'repeat tap turns exactly 90 degrees');
 await page.evaluate(()=>window.__VTT.tools.undo());ok((await object())?.rot===0,'undo turn');
 await page.evaluate(()=>window.__VTT.tools.redo());ok((await object())?.rot===1,'redo turn');
 await page.getByRole('button',{name:/^Turn [0-9]/}).click();await page.selectOption('[aria-label="Object kind"]','chair');
 await tap(await point(page,sx+2,sz));
 ok(await page.evaluate(([x,z])=>window.__VTT.detail.getSquare(0,x+2,z).object.rot===1,[sx,sz]),'Turn sets next placement orientation');
 await page.evaluate(()=>window.__VTT.tools.undo());
 await page.selectOption('[aria-label="Object kind"]','table');
 await page.evaluate(()=>{window.__VTT.tools.undo();window.__VTT.tools.undo();});ok(!(await object()),'undo placement deletes object');
 await page.evaluate(()=>{window.__VTT.tools.redo();window.__VTT.tools.redo();});
 const saved=await page.evaluate(()=>{const a=window.__VTT;a.saveNow();return JSON.stringify(a.world.data.detail);});
 await page.reload();await page.waitForFunction(()=>window.__VTT?.ui);await idle(page);
 ok(await page.evaluate(()=>JSON.stringify(window.__VTT.world.data.detail))===saved,'objects survive reload exactly');
 await fly(page,0,0,phone?30:38,.001);await page.locator('[data-tool=detail]').click();
 await page.selectOption('[aria-label="Detail brush"]','erase');await tap(await point(page,sx,sz));ok(!(await object()),'Erase removes object');
 await page.evaluate(()=>window.__VTT.tools.undo());ok((await object())?.k==='table','undo erase restores object');
 await page.evaluate(()=>window.__VTT.tools.undo());ok((await object())?.k==='table','empty undo history leaves restored saved object intact');
 // Exercise every shape and the exact blocking list on an otherwise empty level.
 const checks=await page.evaluate(async()=>{const {OBJECTS}=await import('./objects.js'),a=window.__VTT,d=a.detail;let pass=true;const blocking=new Set(['table','bed','chest','statue','altar','well','cart','boulder','tree','bookshelf','pine']);
   for(let i=0;i<OBJECTS.length;i++){const o=OBJECTS[i];d.setSquare(-1,40+i,40,{object:{k:o.k,rot:i%4}});pass &&=a.tools.freeSquare(-1,40+i,40)===!blocking.has(o.k) && a.tools.canMove({level:-1,sx:40+i,sz:39},40+i,41)===!blocking.has(o.k);}
   d.build('-1,1,1');const g=d.loaded.get('-1,1,1'),n=g.children.length,finite=g.children.every(m=>Array.from(m.geometry.attributes.position.array).every(Number.isFinite));
   const lights=g.userData.lights.length;d.free('-1,1,1');for(let i=0;i<OBJECTS.length;i++)d.setSquare(-1,40+i,40,{object:null});
   return {pass,n,finite,lights,empty:!a.world.data.detail['-1,1,1']};});
 ok(checks.pass,'all eleven big kinds (with the pine) block token squares; small kinds permit movement');ok(checks.n<=3 && checks.finite && checks.lights>=4,'all 25 shapes build finite geometry in at most three meshes with shared lights');ok(checks.empty,'erasing final object deletes empty tile');
 if(!phone){
 await page.evaluate(()=>{const a=window.__VTT,d=a.detail;
   for(let z=13648;z<=13658;z++)for(let x=13646;x<=13660;x++){d.setSquare(0,x,z,{ground:5,object:null});if(z===13648 || z===13658)d.setSquare(0,x,z,{wallN:x===13653 && z===13658?17:2});if(x===13646 || x===13660)d.setSquare(0,x,z,{wallW:2});}
   const put=(k,x,z,rot=0)=>d.setSquare(0,x,z,{object:{k,rot}});
   for(const x of [13649,13654,13657]){put('table',x,13653);put('chair',x,13652);put('chair',x,13654,2);}
   for(let x=13648;x<=13651;x++)put('table',x,13649); // the bar counter
   put('barrel',13648,13650);put('barrel',13650,13650);put('bookshelf',13659,13649);
   put('campfire',13659,13655);put('brazier',13647,13657);put('wall-torch',13652,13648);
   for(const x of [13658,13659])d.setSquare(0,x,13654,{wallN:1});
   d.setSquare(0,13658,13655,{wallW:1});d.setSquare(0,13660,13655,{wallW:1});
   a.detailChanged([-15,-15,15,15]);a.setTool('look');a.tools.hover(null);
 });
 await fly(page,0,-1,36,.5);await page.screenshot({path:OUT+'detail-objects.png'});
 const fps=await page.evaluate(()=>new Promise(resolve=>{const a=window.__VTT,t=performance.now();let n=0;function frame(){a.request();if(++n===120)resolve(n*1000/(performance.now()-t));else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));console.log('  tavern High: '+fps.toFixed(1)+' fps');
 await writeFile(OUT+'objects-performance.json',JSON.stringify({tavernHighFps:fps,...await page.evaluate(()=>window.__VTT.stats())},null,2));
 ok(await page.evaluate(()=>{const a=window.__VTT,ls=a.scene.children.filter(o=>o.isPointLight && o.visible && o.intensity>0);return ls.length>0 && ls.length<=4 && ls.some(l=>a.detail.torchesNear(a.controls.target,4).some(v=>v.distanceToSquared(l.position)<.001));}),'detail flames join the existing nearest four lights');
 ok(await page.evaluate(()=>[...window.__VTT.detail.loaded.values()].every(g=>g.children.length<=3)),'tavern has at most three meshes per tile');
 await page.evaluate(()=>window.__VTT.setQuality('low'));await idle(page);
 ok(await page.evaluate(()=>window.__VTT.scene.children.filter(o=>o.isPointLight && o.visible).length===0),'Low uses zero real point lights');
 await fly(page,0,0,52000,.25);ok(await page.evaluate(()=>window.__VTT.detail.loaded.size===0),'world zoom frees all object meshes');
 }
 ok(errors.length===0,'no console errors'+(errors.length?': '+errors.join(' | '):''));await ctx.close();
}
await browser.close();srv.close();console.log(failed?'\n'+failed+' object check(s) failed':'\nall object checks passed');process.exit(failed?1:0);
