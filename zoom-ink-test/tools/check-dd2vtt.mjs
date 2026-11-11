import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {chromium} from './browser.mjs';
import {serve} from './serve.mjs';
const out=fileURLToPath(new URL('./out/',import.meta.url));await mkdir(out,{recursive:true});
const executablePath=process.env.CHROME||['chromium-1248','chromium-1247'].map(v=>join(process.env.LOCALAPPDATA||'',`ms-playwright/${v}/chrome-win64/chrome.exe`)).find(existsSync);
const server=await serve(),base=`http://127.0.0.1:${server.address().port}/`;let browser;
async function ready(p){await p.evaluate(()=>Promise.race([__VTT.idle(),new Promise(r=>setTimeout(r,12000))]));await p.waitForTimeout(250);}
try{
 browser=await chromium.launch({headless:true,executablePath,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
 await context.addInitScript(()=>localStorage.setItem('geeztt-ink-prefs-v1',JSON.stringify({role:'gm',quality:'high',stats:false,motion:false})));
 const p=await context.newPage(),errors=[],requests=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)requests.push(r.status()+' '+r.url());});
 await p.goto(base);await p.waitForFunction(()=>window.__VTT?.ddImports);await ready(p);
 const location=await p.evaluate(()=>{const a=__VTT,w=a.world,t=w.data.settlements[0];for(let d=600;d<2500;d+=200)for(let angle=0;angle<6.28;angle+=.5){const x=t.x+Math.cos(angle)*d,z=t.z+Math.sin(angle)*d;if(w.height(x,z)>2&&w.data.settlements.every(s=>Math.hypot(s.x-x,s.z-z)>s.r+150))return{x,z};}throw Error('No open land for test');});
 await p.evaluate(s=>__VTT.flyTo(s.x,s.z,90,.6),location);await ready(p);
 // If the new import calls the legacy picture analyzer, this fails loudly.
 await p.evaluate(()=>{window.ddImageDecodes=0;HTMLImageElement.prototype.decode=function(){window.ddImageDecodes++;throw Error('Image decoding forbidden during structure import');};});
 await p.click('#menuBtn');const chooser=p.waitForEvent('filechooser');await p.getByRole('button',{name:'Import .dd2vtt',exact:true}).click();await(await chooser).setFiles(fileURLToPath(new URL('../test.dd2vtt',import.meta.url)));
 await p.waitForFunction(()=>__VTT.ddImports.pending?.walls.length===15);assert.equal(await p.evaluate(()=>ddImageDecodes),0);
 await p.getByRole('button',{name:'Import at view center',exact:true}).click();
 await p.waitForFunction(()=>__VTT.ddImports.list().length===1&&__VTT.ddImports.loaded.size===1);await ready(p);
 const record=await p.evaluate(()=>JSON.parse(JSON.stringify(__VTT.ddImports.list()[0])));
 assert.equal(record.w,20);assert.equal(record.h,20);assert.equal(record.walls.length,15);assert.equal(record.doors.length,3);assert.equal(record.lights.length,3);
 assert.ok(!('image'in record));assert.ok(JSON.stringify(record).length<10000);assert.equal(await p.evaluate(()=>ddImageDecodes),0);
 const lights=await p.evaluate(()=>{const a=__VTT,ls=[];a.scene.traverse(l=>{if(l.isPointLight&&l.intensity>0)ls.push({color:'#'+l.color.getHexString(),range:l.distance,shadows:l.castShadow});});return ls;});
 assert.equal(lights.filter(l=>l.color==='#eccd8b'&&l.range===7.5&&l.shadows).length,3);
 await p.screenshot({path:join(out,'dd2vtt-import-day.png')});
 // Exact closed/open door crossing, plus a real pointer tap on the door.
 const door=await p.evaluate(()=>{const a=__VTT,s=a.ddImports.list()[0],d=s.doors[0],u=a.ddImports.point(s,d.a),v=a.ddImports.point(s,d.b),L=Math.hypot(v.x-u.x,v.y-u.y),nx=-(v.y-u.y)/L*.6,nz=(v.x-u.x)/L*.6,x=(u.x+v.x)/2,z=(u.y+v.y)/2;return{id:d.id,importId:s.id,x,z,a:[x-nx,z-nz],b:[x+nx,z+nz]};});
 assert.equal(await p.evaluate(d=>__VTT.ddImports.blocksMove(...d.a,...d.b),door),true);
 await p.evaluate(()=>{const a=__VTT,s=a.ddImports.list()[0],[w,h]=a.ddImports.dims(s);a.flyTo(s.x+w*.75,s.z+h*.75,55,.001);});await ready(p);
 const target=await p.evaluate(d=>__VTT.project(d.x,__VTT.world.height(d.x,d.z),d.z),door);await p.mouse.click(target.x,target.y);
 await p.waitForFunction(()=>__VTT.ddImports.list()[0].doors[0].closed===false);
 assert.equal(await p.evaluate(d=>__VTT.ddImports.blocksMove(...d.a,...d.b),door),false);
 await p.evaluate(()=>__VTT.tools.undo());assert.equal(await p.evaluate(()=>__VTT.ddImports.list()[0].doors[0].closed),true);
 await p.evaluate(()=>__VTT.tools.redo());assert.equal(await p.evaluate(()=>__VTT.ddImports.list()[0].doors[0].closed),false);
 const scale=await p.evaluate(async()=>{const {fmtDist}=await import('./combat.js');const {SQ}=await import('./detail.js');return fmtDist(SQ);});assert.equal(scale,'5 ft');
 await p.evaluate(()=>__VTT.saveNow());const persisted=await p.evaluate(()=>JSON.stringify(__VTT.ddImports.list()));
 await p.reload();await p.waitForFunction(()=>window.__VTT?.ddImports);await ready(p);assert.equal(await p.evaluate(()=>JSON.stringify(__VTT.ddImports.list())),persisted);
 await p.evaluate(()=>__VTT.ddImports.focus(__VTT.ddImports.list()[0]));await ready(p);await p.evaluate(()=>__VTT.weather.changeTime({hour:22}));await p.waitForFunction(()=>__VTT.weather.night>.99&&__VTT.weather.cur.hemi<.055,null,{timeout:60000});
 // Rebuild at night: streamed walls must cast shadows even with the sun disabled.
 await p.evaluate(()=>{const a=__VTT,s=a.ddImports.list()[0];a.ddImports.drop(s.id);a.ddImports.build(s);});
 await p.waitForTimeout(500);
 assert.equal(await p.evaluate(async()=>{const {MAT}=await import('./style.js');let count=0,ok=true;for(const g of __VTT.ddImports.loaded.values())g.traverse(o=>{if(o.isMesh&&o.material===MAT.solidCut){count++;ok&&=o.castShadow&&o.receiveShadow;}});return count>0&&ok;}),true);
 await p.screenshot({path:join(out,'dd2vtt-import-night.png')});
 await p.click('#menuBtn');const download=p.waitForEvent('download');await p.getByRole('button',{name:'Save file',exact:true}).click();const d=await download;const exported=JSON.parse(await readFile(await d.path(),'utf8'));assert.equal(exported.imports[0].doors[0].closed,false);assert.ok(JSON.stringify(exported.imports).length<10000);assert.ok(!('image'in exported.imports[0]));
 await p.getByRole('button',{name:'Imported maps',exact:true}).click();await p.getByRole('button',{name:'Remove test',exact:true}).click();assert.equal(await p.evaluate(()=>__VTT.ddImports.list().length),0);
 await p.evaluate(()=>__VTT.tools.undo());assert.equal(await p.evaluate(()=>__VTT.ddImports.list().length),1);assert.equal(await p.evaluate(()=>__VTT.ddImports.list()[0].doors[0].closed),false);
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 await writeFile(join(out,'dd2vtt-report.json'),JSON.stringify({walls:record.walls.length,doors:record.doors.length,lights:record.lights.length,savedImportBytes:JSON.stringify(record).length,lightSettings:lights,checks:'real file chooser, image decoder forbidden, accurate geometry metadata, clickable doors/collision, undo/redo, 5ft grid, reload, export, removal/undo, day/night rendering',errors,requests},null,2));
 console.log('PASS: real 25 MB test.dd2vtt imports walls/doors/lights without decoding or retaining its image; clickable doors/collision, 5 ft scale, light properties/shadows, undo/redo, reload/export, removal/undo, day/night rendering.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
