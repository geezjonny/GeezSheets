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
 const p=await browser.newPage({viewport:{width:1000,height:800}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto(`http://127.0.0.1:${server.address().port}/`);await p.waitForFunction(()=>window.__VTT?.underground);
 await p.evaluate(async()=>{
  const a=__VTT,u=a.underground,m=u.create('Torch lighting',18,16);u.enter(m.id);a.motion.setEnabled(false);a.showGrid=false;
  for(const[key,t]of Object.entries(m.detail))for(const o of [...t.objects||[]]){const[,ti,tj]=key.split(',').map(Number);u.detail.setSquare(0,ti*40+o.i,tj*40+o.j,{object:null});}
  const sx=m.origin.sx+8,sz=m.origin.sz+8,x=(sx+.5)*1.5-20480,z=(sz+.5)*1.5-20480;
  u.detail.setSquare(0,sx,sz,{object:{k:'torch',rot:0}});u.detail.setSquare(0,sx+3,sz,{object:{k:'crate',rot:0}});u.detail.setSquare(0,sx-3,sz-2,{object:{k:'torch',rot:0}});
  u.jump({target:[x,.22,z],camera:[x,16,z+12]});window.torchAt={x,z};
  const{Builder}=await import('/places.js'),{PAL}=await import('/style.js'),b=new Builder(442);b.box(null,x,2.75,z,5,.12,5,PAL.stone);
  window.hiddenRoof=b.geometry(true);u.scene.add(hiddenRoof);
 });await p.waitForTimeout(1200);
 const material=await p.evaluate(async()=>{const a=__VTT,{MAT}=await import('/style.js');let torch=null;a.scene.traverse(o=>{if(o.userData.propRef?.kind==='torch')torch=o;});return{visibleFlame:torch.children.some(o=>o.material===MAT.glow),shadowMaterials:hiddenRoof.children.every(o=>!o.castShadow||!!o.customDistanceMaterial),lights:a.underground.lights.filter(l=>l.intensity>0).length};});assert.ok(material.visibleFlame&&material.shadowMaterials);assert.equal(material.lights,2);
 const lighting=await p.evaluate(async()=>{
  const a=__VTT,u=a.underground,{DataUtils,HalfFloatType}=await import('/vendor/three/three.module.js');
  const mean=()=>{a.renderer.shadowMap.needsUpdate=true;a.ink.render(a.scene,a.camera,u.renderApp);const t=a.ink.color,half=t.texture.type===HalfFloatType,pixels=half?new Uint16Array(t.width*t.height*4):new Uint8Array(t.width*t.height*4);a.renderer.readRenderTargetPixels(t,0,0,t.width,t.height,pixels);let total=0;const v=n=>half?DataUtils.fromHalfFloat(n):n/255;for(let k=0;k<pixels.length;k+=4)total+=v(pixels[k])*.2126+v(pixels[k+1])*.7152+v(pixels[k+2])*.0722;return total/(t.width*t.height);};
  hiddenRoof.visible=false;const noRoof=mean();hiddenRoof.visible=true;const cutRoof=mean();
  hiddenRoof.visible=false;const active=u.lights.filter(l=>l.intensity>0),power=active[1].intensity;active[1].intensity=0;const oneLight=mean();active[1].intensity=power;const twoLights=mean();
  const torchMeshes=[],crateMeshes=[];a.scene.traverse(o=>{if(o.userData.propRef?.kind==='torch')o.traverse(m=>{if(m.castShadow)torchMeshes.push(m);});if(o.userData.propRef?.kind==='crate')o.traverse(m=>{if(m.castShadow)crateMeshes.push(m);});});
  for(const m of torchMeshes)m.castShadow=false;const noFixtureShadow=mean();for(const m of torchMeshes)m.castShadow=true;
  for(const m of crateMeshes)m.castShadow=false;const noCrateShadow=mean();for(const m of crateMeshes)m.castShadow=true;
  return{noRoof,cutRoof,oneLight,twoLights,noFixtureShadow,noCrateShadow};
 });console.log(JSON.stringify({material,lighting}));assert.ok(Math.abs(lighting.noRoof-lighting.cutRoof)<lighting.noRoof*.02,'cut-away geometry must not cast an invisible point-light shadow');assert.ok(lighting.twoLights>lighting.oneLight*1.1,'each torch adds its own light instead of a global shadow mask');
 await p.screenshot({path:join(out,'torch-lighting-fixed.png')});
 assert.ok(lighting.twoLights>lighting.noFixtureShadow*.93,'a torch fixture must not project a huge black canopy beneath its own flame');
 assert.ok(lighting.noCrateShadow>lighting.twoLights,'nearby props still cast real shadows');
 assert.deepEqual(errors,[]);await writeFile(join(out,'torch-lighting-report.json'),JSON.stringify({material,lighting,errors},null,2));console.log('PASS: pole-torch flames remain visible in cutaway, point shadows use cutaway-aware distance materials, invisible roofs cast no ghost shadows, and multiple torches add light independently.');console.log(JSON.stringify(lighting));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
