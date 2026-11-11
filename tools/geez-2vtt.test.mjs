import assert from 'node:assert/strict';
import {readFile,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {startServer} from '../../GeezSuite/core/serve.mjs';
import {openStore} from '../../GeezSuite/core/store.mjs';
const {chromium}=await import(pathToFileURL(join(process.env.APPDATA,'npm/node_modules/@playwright/mcp/node_modules/playwright/index.mjs')));
const source=new URL('../../GeezSuite/data/gaia-v2.json',import.meta.url),original=await readFile(source),dir=await mkdtemp(join(tmpdir(),'geez2vtt-'));
const fixture=new URL('geez-fixtures/prison.geez2vtt',import.meta.url),twoFile=new URL('geez-fixtures/two-level.geez2vtt',import.meta.url),scene=JSON.parse(await readFile(fixture)),two=JSON.parse(await readFile(twoFile));
let app,browser;
// Built-in app assets (floor/wall/door textures, prop icons) are allowed; any other image or data: URL is a map picture.
const mapPics=list=>list.filter(u=>u.startsWith('data:')||!/(^|\/)(textures|props)\/[\w\/-]+\.(png|webp|jpg)$/.test(u));
try{
 await copyFile(source,join(dir,'gaia.json'));app=await startServer({file:join(dir,'gaia.json'),port:0});const base='http://127.0.0.1:'+app.server.address().port,gm=openStore({url:base});
 const place=await gm.put({kind:'place',name:'Scene browser test',world:'gaia',campaign:'daddies',data:{place_kind:'battlemap'}});
 browser=await chromium.launch({headless:true,channel:'msedge'});
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]),pages=await Promise.all(contexts.map(c=>c.newPage()));
 const errors=[];
 for(const p of pages){p.on('pageerror',e=>errors.push(e.message));await p.route(/firebaseio\.com|firebasedatabase\.app/,r=>r.abort());await p.goto(base+'/sheets/geez-index.html?db=gaia&gaia='+base+'&gm=jonny&campaign=world__daddies&test',{waitUntil:'domcontentloaded'});await p.waitForFunction(id=>window.__SHEETS__?.state().data.things[id],place.id);}
 await pages[0].evaluate(id=>window.__SHEETS__.select(id),place.id);
 await pages[0].locator('#attachGeez2vttBtn').waitFor();
 await pages[0].locator('#dd2vttInput').setInputFiles(fileURLToPath(fixture));
 for(const p of pages)await p.waitForFunction(id=>window.__SHEETS__.state().data.things[id]?.traits.scene?.format==='geez2vtt',place.id);
 const mapId=(await gm.entity(place.id)).data.childMap;assert.deepEqual((await gm.entity(mapId)).data.scene,scene);
 console.log('PASS UI publishes data.scene; independent browser receives scene through SSE');
 const images=[];
 for(const p of pages)await p.evaluate(()=>{window.__imageSources=[];const d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{...d,set(value){window.__imageSources.push(value);d.set.call(this,value);}});});
 for(const p of pages){p.on('request',r=>{if(r.resourceType()==='image'||r.url().startsWith('data:'))images.push(r.url());});await p.evaluate(id=>window.__SHEETS__.view('VTT',id),place.id);await p.waitForFunction(()=>window.__SHEETS__.state().loaded&&window.__SHEETS__.state().meta);}
 const geo=await pages[0].evaluate(()=>window.__SHEETS__.geometry());assert.equal(geo.walls.length,scene.floors[0].walls.length);assert.equal(geo.doors.length,scene.floors[0].portals.length);assert.ok(geo.walls.length&&geo.doors.length);
 // Use exactly the geometry returned by the live renderer in the fog/LOS engine.
 const blocked=await pages[0].evaluate(async()=>{const g=window.__SHEETS__.geometry(),m=await import('./js/geez-geometry.js'),w=g.walls.find(w=>Math.hypot(w.x2-w.x1,w.y2-w.y1)>.1),x=(w.x1+w.x2)/2,y=(w.y1+w.y2)/2,dx=w.y2-w.y1,dy=w.x1-w.x2,n=Math.hypot(dx,dy);return m.pathBlocked(x+dx/n*.1,y+dy/n*.1,x-dx/n*.1,y-dy/n*.1,m.activeOccluders(g.walls,g.doors.filter(d=>d.sight)));});assert.ok(blocked);
 for(const p of pages)assert.deepEqual(mapPics(await p.evaluate(()=>window.__imageSources)),[]);
 assert.deepEqual(mapPics(images),[]);console.log('PASS data renderer draws walls/doors with zero image or data URL requests; LOS is blocked by walls');
 const door=geo.doors.find(d=>d.kind==='wood');
 await pages[0].evaluate(key=>window.__SHEETS__.toggleDoor(key),door.key);
 await pages[1].waitForFunction(({key,closed})=>window.__SHEETS__.geometry().doors.find(d=>d.key===key).closed!==closed,{key:door.key,closed:door.closed});
 console.log('PASS door toggles persist and reach a second browser');
 await gm.act('map.publish',{entity:mapId,scene:two,campaign:'daddies'});
 for(const p of pages)await p.waitForFunction(()=>window.__SHEETS__.state().meta?.floors.includes(-1));
 await pages[0].keyboard.press('PageDown');await pages[0].waitForFunction(()=>window.__SHEETS__.state().floor===-1);
 await pages[0].getByRole('button',{name:'Floor up',exact:true}).click();await pages[0].waitForFunction(()=>window.__SHEETS__.state().floor===0);
 await pages[0].getByRole('button',{name:'Floor down',exact:true}).click();await pages[0].keyboard.press('PageUp');await pages[0].waitForFunction(()=>window.__SHEETS__.state().floor===0);
 assert.deepEqual((await gm.entity(mapId)).data.scene,two);assert.deepEqual(mapPics(images),[]);console.log('PASS action republishes live; floor buttons and PgUp/PgDn step through scene levels');
 // GM steps past the top floor onto an empty floor; attaching a map there ADDS it as that floor.
 await pages[0].evaluate(()=>window.__SHEETS__.view('VTT',window.__SHEETS__.state().bid||undefined)).catch(()=>{});
 assert.ok(await pages[0].locator('#breadcrumbNav [aria-label="Floor up"]').count(),'floor stepper sits in the breadcrumb');
 await pages[0].getByRole('button',{name:'Floor up',exact:true}).click();await pages[0].waitForFunction(()=>window.__SHEETS__.state().floor===1);
 assert.match(await pages[0].locator('#breadcrumbNav').innerText(),/Floor 2 \(empty/);
 const extra={...scene,floors:[{...scene.floors[0],name:'Attic'}]};
 await pages[0].evaluate(text=>{const dt=new DataTransfer();dt.items.add(new File([text],'attic.geez2vtt',{type:'application/json'}));const v=document.querySelector('#vttVectorCanvas').parentElement;v.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));},JSON.stringify(extra));
 for(const p of pages)await p.waitForFunction(()=>window.__SHEETS__.state().meta?.floors.includes(1));
 const grown=(await gm.entity(mapId)).data.scene;assert.deepEqual(grown.floors.map(f=>f.level).sort(),[-1,0,1]);assert.equal(grown.floors.find(f=>f.level===1).name,'Attic');assert.deepEqual(grown.floors.filter(f=>f.level!==1),two.floors);
 const wrong={...extra,grid:{...extra.grid,cols:extra.grid.cols+1}};await pages[0].getByRole('button',{name:'Floor up',exact:true}).click();await pages[0].waitForFunction(()=>window.__SHEETS__.state().floor===2);
 await pages[0].evaluate(text=>{const dt=new DataTransfer();dt.items.add(new File([text],'wrong.geez2vtt'));document.querySelector('#vttVectorCanvas').parentElement.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));},JSON.stringify(wrong));
 await pages[0].waitForFunction(()=>/same size/.test(document.querySelector('#statusMessage').textContent));
 await gm.act('map.publish',{entity:mapId,scene:two,campaign:'daddies'});for(const p of pages)await p.waitForFunction(()=>!window.__SHEETS__.state().meta?.floors.includes(1));
 await pages[0].getByRole('button',{name:'Floor down',exact:true}).click().catch(()=>{});
 console.log('PASS GM steps onto an empty floor from the breadcrumb; attaching there adds a floor; wrong-size map refused');
 await pages[0].evaluate(()=>window.__SHEETS__.select(null));
 const stairPoint=await pages[0].evaluate(({cols,rows})=>{const r=document.querySelector('#vttVectorCanvas').getBoundingClientRect();return {x:r.x+r.width*4/cols,y:r.y+r.height*4/rows};},scene.grid);
 await pages[0].mouse.click(stairPoint.x,stairPoint.y);await pages[0].waitForFunction(()=>window.__SHEETS__.state().floor===-1);
 await pages[0].keyboard.press('PageUp');console.log('PASS clicking stair prop changes view to to_level');
 // Build > Stairs: the GM places a linked pair; clicking them in Select changes floor both ways; clicking again in Stairs removes both.
 const sq=await pages[0].evaluate(({cols,rows})=>{const r=document.querySelector('#vttVectorCanvas').getBoundingClientRect();return {x:r.x+r.width*10.5/cols,y:r.y+r.height*10.5/rows};},scene.grid);
 if(!(await pages[0].locator('#modeStairs').isVisible()))await pages[0].locator('#railBuild').click();
 await pages[0].locator('#modeStairs').click();await pages[0].mouse.click(sq.x,sq.y);
 await pages[0].waitForFunction(()=>/Stairs to/.test(document.querySelector('#statusMessage').textContent));
 await pages[0].locator('#modeStairs').click();await pages[0].mouse.click(sq.x,sq.y);await pages[0].waitForFunction(()=>window.__SHEETS__.state().floor===-1);
 await pages[0].mouse.click(sq.x,sq.y);await pages[0].waitForFunction(()=>window.__SHEETS__.state().floor===0);
 await pages[0].locator('#modeStairs').click();await pages[0].mouse.click(sq.x,sq.y);await pages[0].waitForFunction(()=>/Stairs removed/.test(document.querySelector('#statusMessage').textContent));
 await pages[0].locator('#modeStairs').click();await pages[0].mouse.click(sq.x,sq.y);await new Promise(r=>setTimeout(r,400));assert.equal(await pages[0].evaluate(()=>window.__SHEETS__.state().floor),0);
 console.log('PASS Build > Stairs places a linked pair, Select clicks change floor both ways, removal takes both');
 // Portal policies use the same helper as the bridge, including unknown extensions.
 const policies=await pages[0].evaluate(async s=>{const m=await import('./js/geez2vtt.js');s.floors[0].portals=['door','window','arch'].map((kind,i)=>({a:[i,0],b:[i,1],kind,material:'wood',closed:true,reviewed:true}));return m.sceneGeometry(s).doors;},scene);
 assert.deepEqual(policies.map(d=>[d.sight,d.pass]),[[true,false],[false,false],[false,true]]);console.log('PASS closed doors block sight/movement; windows block movement; arches are open');
 // Drop a valid scene on the actual view.
 await pages[0].evaluate(async s=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(s)],'prison.geez2vtt',{type:'application/json'}));document.querySelector('#viewport').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));},scene);
 await pages[1].waitForFunction(id=>window.__SHEETS__.state().data.things[id].traits.scene.name==='Prison fixture',place.id);console.log('PASS drop publishes through Gaia and syncs');
 const pc=await gm.put({kind:'pc',name:'Scene Token',world:'gaia',campaign:'daddies',data:{combat:{hp_current:10,hp_max:10}}});
 const placed=await gm.act('token.place',{entity:pc.id,map:mapId,x:.3,y:.4,campaign:'daddies'}),tokenId=placed.changes[0].id;
 await pages[1].waitForFunction(id=>window.__SHEETS__.state().tokens.some(t=>t.entity===id),pc.id);
 await pages[0].evaluate(async({map,id})=>{await window.__SHEETS__.database().ref('geezvtt/live/world__daddies/tokens/'+map+'/'+id).update({x:.5,y:.6});},{map:place.id,id:pc.id});
 const token=await gm.get('campaigns/daddies/state/tokens/'+tokenId);assert.equal(token.map,mapId);assert.equal(token.x,.5);
 await pages[1].waitForFunction(id=>window.__SHEETS__.state().tokens.find(t=>t.entity===id)?.x===.5,pc.id);
 console.log('PASS canonical map tokens appear on the place battle view; GM movement preserves canonical identity and syncs');
 assert.deepEqual(errors,[]);
}finally{await browser?.close();await app?.close();assert.deepEqual(await readFile(source),original);await rm(dir,{recursive:true,force:true});console.log('PASS source Gaia file byte-identical');}
