import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {chromium} from './browser.mjs';
import {serve} from './serve.mjs';
const out=fileURLToPath(new URL('./out/',import.meta.url));await mkdir(out,{recursive:true});
const executablePath=process.env.CHROME||['chromium-1248','chromium-1247'].map(v=>join(process.env.LOCALAPPDATA||'',`ms-playwright/${v}/chrome-win64/chrome.exe`)).find(existsSync);
const server=await serve(),base=`http://127.0.0.1:${server.address().port}/`;
let browser;
const errors=[],requests=[],report=[];
function observe(page){page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)requests.push(`${r.status()} ${r.url()}`);});}
async function ready(page){await page.waitForFunction(()=>window.__VTT?.ink&&window.__VTT?.ui);await page.evaluate(()=>Promise.race([__VTT.idle(),new Promise(r=>setTimeout(r,20000))]));await page.waitForTimeout(250);}
async function fly(page,d,tilt=.8){await page.evaluate(([d,t])=>{const s=__VTT.world.data.settlements[0];__VTT.flyTo(s.x,s.z,d,t);},[d,tilt]);await page.waitForTimeout(1700);await ready(page);}
async function shot(page,name){await page.screenshot({path:join(out,name+'.png')});report.push({view:name,...await page.evaluate(()=>__VTT.stats())});}
try{
 browser=await chromium.launch({headless:true,executablePath,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 const page=await context.newPage();observe(page);
 await page.goto(base);await ready(page);
 assert.match(await page.title(),/Ink Atlas/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('geeztt-world-v1')),null);
 await shot(page,'ink-world');
 await fly(page,650,.65);await shot(page,'ink-town');
 await fly(page,110,.95);await shot(page,'ink-street');
 // Rotate the actual camera control; geometry and surface marks must remain usable.
 const old=await page.evaluate(()=>__VTT.camera.position.toArray());
 await page.click('#turnLeft');await page.waitForTimeout(1700);assert.notDeepEqual(await page.evaluate(()=>__VTT.camera.position.toArray()),old);
 await page.click('[data-tool="play"]');
 await page.getByRole('button',{name:/Roll initiative/}).click();
 assert.ok(await page.evaluate(()=>__VTT.combat.on&&__VTT.combat.state.order.length>0));
 assert.ok(await page.evaluate(()=>__VTT.world.data.tokens.every(t=>Number.isInteger(t.sx)&&Number.isInteger(t.sz))));
 const ft=await page.evaluate(async()=>{const {SQ}=await import('./detail.js');const {fmtDist}=await import('./combat.js');return fmtDist(SQ);});assert.equal(ft,'5 ft');
 await page.getByRole('button',{name:'End combat',exact:true}).click();
 // Cutaway must work in both color and normals passes.
 await page.getByRole('button',{name:'Cutaway',exact:true}).click();assert.equal(await page.evaluate(()=>__VTT.cutaway),true);
 await fly(page,65,.001);await shot(page,'ink-cutaway');
 await page.evaluate(()=>{__VTT.ruler.add({x:0,z:0});__VTT.ruler.add({x:3,z:0});});
 assert.equal(await page.evaluate(()=>__VTT.ruler.text()),'10 ft');
 await page.evaluate(()=>__VTT.ruler.clear());
 // Paint through real pointer input, then undo and redo through the existing tools.
 await page.click('[data-tool="detail"]');
 await page.evaluate(()=>{__VTT.tools.detailBrush={kind:'ground',ground:2,wall:1,size:3};__VTT.ui.refresh();});
 await page.mouse.move(760,470);await page.mouse.down();await page.mouse.move(810,490,{steps:5});await page.mouse.up();
 await ready(page);
 const painted=await page.evaluate(()=>JSON.stringify(__VTT.world.data.detail));assert.notEqual(painted,'{}');
 await page.evaluate(()=>__VTT.tools.undo());assert.equal(await page.evaluate(()=>JSON.stringify(__VTT.world.data.detail)),'{}');
 await page.evaluate(()=>__VTT.tools.redo());assert.equal(await page.evaluate(()=>JSON.stringify(__VTT.world.data.detail)),painted);
 await page.evaluate(()=>__VTT.saveNow());await page.reload();await ready(page);
 assert.equal(await page.evaluate(()=>JSON.stringify(__VTT.world.data.detail)),painted);
 assert.ok(await page.evaluate(()=>localStorage.getItem('geeztt-ink-world-v1')));
 assert.equal(await page.evaluate(()=>localStorage.getItem('geeztt-world-v1')),null);
 const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const phone=await mobile.newPage();observe(phone);await phone.goto(base);await ready(phone);await shot(phone,'ink-phone-world');
 await fly(phone,200,.7);await shot(phone,'ink-phone-town');
 const before=await phone.evaluate(()=>__VTT.camDist()),cdp=await mobile.newCDPSession(phone);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:135,y:380,id:1},{x:255,y:380,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:90,y:380,id:1},{x:300,y:380,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await phone.waitForTimeout(400);
 assert.ok(await phone.evaluate(()=>__VTT.camDist())<before,'pinch zooms in');
 const source=JSON.parse(await readFile(new URL('../source-manifest.json',import.meta.url),'utf8'));
 for(const [name,hash] of Object.entries(source)){const b=await readFile(new URL('../../zoom-test/'+name,import.meta.url));assert.equal(createHash('sha256').update(b).digest('hex'),hash,'source unchanged: '+name);}
 assert.deepEqual(errors,[],'no JavaScript or shader errors');assert.deepEqual(requests,[],'all local assets load');
 await writeFile(join(out,'ink-report.json'),JSON.stringify({checks:'rendering, orbit, cutaway, 5-foot squares, initiative, ruler, detail paint/undo/redo, persistence, mobile pinch, isolated storage, untouched source',report,errors,requests},null,2));
 console.log('PASS: desktop + phone renders, orbit, cutaway, 5 ft squares, initiative, ruler, paint/undo/redo, saving, touch pinch, isolated storage; source files unchanged.');
 console.log('Screenshots and metrics: '+out);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
