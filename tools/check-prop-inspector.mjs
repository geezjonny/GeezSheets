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
 const p=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto(`http://127.0.0.1:${server.address().port}/`);await p.waitForFunction(()=>window.__VTT?.propInspector);
 const info=await p.evaluate(()=>{
  const a=__VTT,u=a.underground,m=u.create('Prop workshop',18,16);u.enter(m.id);const sx=m.entry.sx+2,sz=m.entry.sz-4,x=(sx+.5)*1.5-20480,z=(sz+.5)*1.5-20480;
  u.detail.setSquare(0,sx,sz,{object:{k:'barrel',rot:0,id:'test-barrel'}});a.setTool('look');u.jump({target:[x,.22,z],camera:[x,22,z+12]});
  window.propFixture={mapId:m.id,ref:{type:'detail',id:'test-barrel',kind:'barrel',sx,sz,space:m.id,level:0}};return propFixture;
 });
 await p.waitForTimeout(500);
 const screen=await p.evaluate(()=>{const a=__VTT,p=a.propInspector.position(propFixture.ref);return a.project(p.x,.7,p.z);});await p.mouse.click(screen.x,screen.y);
 await p.locator('#propPanel').waitFor({state:'visible'});
 await p.getByLabel('Prop name',{exact:true}).fill('Suspicious barrel');await p.getByLabel('Prop contents',{exact:true}).fill('12 silver pieces\nA sealed letter');
 await p.getByLabel('Trap state',{exact:true}).selectOption('armed');await p.getByLabel('Trap details',{exact:true}).fill('Needle beneath the lid; DC 14; poison.');await p.getByRole('button',{name:'Save prop',exact:true}).click();
 const privacy=await p.evaluate(()=>{const a=__VTT;a.setRole('player');const text=a.propInspector.el.textContent,hidden=!text.includes('silver')&&!text.includes('Needle')&&!text.includes('armed'),before=JSON.stringify(a.world.data.propState);a.propInspector.patch(propFixture.ref,{contents:'hacked'});const guarded=before===JSON.stringify(a.world.data.propState);a.setRole('gm');return{hidden,guarded};});assert.ok(privacy.hidden&&privacy.guarded);
 await p.getByLabel('Reveal contents',{exact:true}).check();await p.getByRole('button',{name:'Save prop',exact:true}).click();
 const revealed=await p.evaluate(()=>{__VTT.setRole('player');const t=__VTT.propInspector.el.textContent;__VTT.setRole('gm');return t.includes('12 silver pieces')&&!t.includes('Needle');});assert.ok(revealed);
 await p.getByRole('button',{name:'Trigger trap',exact:true}).click();assert.equal(await p.getByLabel('Trap state',{exact:true}).inputValue(),'triggered');
 await p.evaluate(()=>{__VTT.tools.undo();__VTT.propInspector.refresh();});assert.equal(await p.getByLabel('Trap state',{exact:true}).inputValue(),'armed');
 const movement=await p.evaluate(()=>{const a=__VTT,i=a.propInspector,r=propFixture.ref,before=i.position(r);for(let n=0;n<6;n++)i.move(r,.15,0);const after=i.position(r),pose=i.state(r).pose,o=i.object(r),saved=i.state(r).contents;a.tools.undo();const undone=i.position(r);a.tools.redo();i.rotate(r);return{delta:after.x-before.x,crossed:pose.sx!==r.sx,id:o.id,contents:saved,undoDelta:after.x-undone.x,rot:i.object(r).rot};});assert.ok(Math.abs(movement.delta-.9)<.001&&movement.crossed);assert.equal(movement.id,'test-barrel');assert.match(movement.contents,/silver/);assert.ok(Math.abs(movement.undoDelta-.15)<.001);assert.equal(movement.rot,1);
 const blocked=await p.evaluate(()=>{const a=__VTT,i=a.propInspector,r=propFixture.ref,pose=i.state(r).pose;a.detail.setSquare(0,pose.sx+1,pose.sz,{object:{k:'crate',rot:0}});const before=i.position(r);for(let n=0;n<12;n++)i.move(r,.15,0);return i.state(r).pose.sx===pose.sx&&i.position(r).x-before.x<1.5;});assert.ok(blocked);
 await p.screenshot({path:join(out,'prop-inspector-cellar.png')});
 // A real generated market barrel can be selected, edited, and used as an entrance cover.
 await p.evaluate(()=>{const a=__VTT;a.underground.leave();const S=a.world.data.settlements.find(s=>s.kind==='town');a.flyTo(S.x,S.z,75,.6);});
 await p.waitForFunction(()=>{let found=false;__VTT.scene.traverse(o=>{if(o.userData.propRef?.type==='generated'&&o.userData.propRef.kind==='barrel')found=true;});return found;});await p.waitForTimeout(1700);
 const generated=await p.evaluate(()=>{const a=__VTT,i=a.propInspector;let r=null;a.scene.traverse(o=>{if(!r&&o.userData.propRef?.type==='generated'&&o.userData.propRef.kind==='barrel')r=o.userData.propRef;});window.generatedProp=structuredClone(r);i.show(r);i.patch(r,{contents:'A rusted key',trap:'armed',trapNotes:'Lid bell alarm'});i.underneath(r);const e=a.underground.ensure().entrances.find(e=>e.cover?.ref?.id===r.id);window.coverEntrance=e.id;const hidden=a.underground.covered(e);for(let n=0;n<6;n++)i.move(r,.15,0);return{hidden,exposed:!a.underground.covered(e),position:i.position(r),ref:r,contents:i.state(r).contents};});assert.ok(generated.hidden&&generated.exposed);assert.equal(generated.contents,'A rusted key');
 const removal=await p.evaluate(()=>{const a=__VTT,i=a.propInspector,r=generatedProp;i.remove(r);const removed=!i.position(r);a.tools.undo();return{removed,restored:!!i.position(r)};});assert.ok(removal.removed&&removal.restored);
 const furnishing=await p.evaluate(()=>{const a=__VTT,S=a.world.data.settlements.find(s=>s.kind==='town'),house=a.buildings.housesOf(S)[0],key=a.buildings.keyOf(S,house),e=a.interiors.layout(key),item=e.plan.items[0],r={type:'interior',id:`interior:${key}:${item.id}`,buildingKey:key,itemId:item.id,kind:item.type,space:null,level:0},i=a.propInspector;i.patch(r,{contents:'A hidden coin',trap:'armed'});i.show(r);let moved=false;for(const[dx,dz]of[[.15,0],[-.15,0],[0,.15],[0,-.15]])if(i.move(r,dx,dz)){moved=true;break;}i.underneath(r);const entrance=a.underground.ensure().entrances.find(v=>v.cover?.itemId===item.id&&v.buildingKey===key);const hidden=a.underground.covered(entrance);i.remove(r);const exposed=!a.underground.covered(entrance);a.tools.undo();return{moved,hidden,exposed,restored:a.underground.covered(entrance),contents:i.state(r).contents};});assert.ok(furnishing.moved&&furnishing.hidden&&furnishing.exposed&&furnishing.restored);assert.equal(furnishing.contents,'A hidden coin');
 await p.evaluate(()=>__VTT.saveNow());await p.reload();await p.waitForFunction(()=>window.__VTT?.propInspector);
 const persisted=await p.evaluate(({id,ref,position,mapId})=>{const a=__VTT,i=a.propInspector,r={type:'detail',id:'test-barrel',kind:'barrel',sx:0,sz:0,space:mapId,level:0};return{contents:i.states[id].contents,trap:i.states[id].trap,position:i.position(ref),barrel:i.object(r)?.id,letter:i.state(r).contents};},{id:generated.ref.id,ref:generated.ref,position:generated.position,mapId:info.mapId});assert.equal(persisted.contents,'A rusted key');assert.equal(persisted.trap,'armed');assert.equal(persisted.barrel,'test-barrel');assert.match(persisted.letter,/sealed letter/);assert.deepEqual(persisted.position,generated.position);
 assert.deepEqual(errors,[]);await writeFile(join(out,'prop-inspector-report.json'),JSON.stringify({privacy,movement,generated,removal,furnishing,persisted,errors},null,2));console.log('PASS: real barrel selection, contents and trap editing, player privacy, trigger/undo, half-foot nudges across squares, collision rejection, generated town props, concealed trapdoors, building furniture, removal/undo, and save/reload.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
