import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './browser.mjs';
import {serve} from './serve.mjs';
const out=new URL('./out/',import.meta.url);await mkdir(out,{recursive:true});
const executablePath=process.env.CHROME||['chromium-1248','chromium-1247'].map(v=>join(process.env.LOCALAPPDATA||'',`ms-playwright/${v}/chrome-win64/chrome.exe`)).find(existsSync);
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true,executablePath,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
 const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto(`http://127.0.0.1:${server.address().port}/`);await p.waitForFunction(()=>window.__VTT?.underground);
 for(const [name,kind,d,tilt]of [['world',null,52000,.25],['town','town',650,.65],['street','town',100,.85],['camp','camp',65,.7]]){
  if(kind)await p.evaluate(([kind,d,tilt])=>{const a=__VTT,s=a.world.data.settlements.find(s=>s.kind===kind);a.flyTo(s.x,s.z,d,tilt);},[kind,d,tilt]);
  await p.waitForTimeout(1700);await p.evaluate(()=>Promise.race([__VTT.idle(),new Promise(r=>setTimeout(r,12000))]));await p.waitForTimeout(250);
  await p.screenshot({path:fileURLToPath(new URL(`ink-pigment-${name}.png`,out))});
  console.log(`Saved ${name} color preview`);
 }
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
