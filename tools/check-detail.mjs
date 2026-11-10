// Detail and global encounter checks: node tools/check-detail.mjs
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
const screenOf = (page, x, z, up = 2) => page.evaluate(([x, z, up]) => { const a = window.__VTT; return a.project(x, a.world.height(x, z) + up, z); }, [x, z, up]);

const labelOf = (page, id) => page.evaluate(id => { const r = window.__VTT.ui.labelEls.get(id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
async function open(opts, fresh = true) {
  const ctx = await browser.newContext(opts), page = await ctx.newPage(), errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  if (fresh) await page.addInitScript(() => { if (!sessionStorage.getItem('x')) { localStorage.clear(); sessionStorage.setItem('x', 1); } });
  await page.goto(URL0); await page.waitForFunction(() => window.__VTT && window.__VTT.card); await idle(page);
  return { ctx, page, errors };
}

// WORLD.md phase A and random encounters: exercise real pointer routes, then inspect data.
const perf=[];
const metrics=async(page,label)=>{
  const fps=await page.evaluate(()=>new Promise(resolve=>{const a=window.__VTT,t=performance.now();let n=0;const tick=()=>{a.request();if(++n===120)resolve(n*1000/(performance.now()-t));else requestAnimationFrame(tick);};requestAnimationFrame(tick);}));
  const s=await page.evaluate(()=>{const a=window.__VTT;let detailTris=0,maxMeshes=0;for(const g of a.detail.loaded.values()){maxMeshes=Math.max(maxMeshes,g.children.length);g.traverse(m=>{if(m.geometry)detailTris+=m.geometry.attributes.position.count/3;});}return {...a.stats(),detailTris,maxMeshes};});
  perf.push({label,fps,...s,measuredFps:fps});console.log('  '+label+': '+fps.toFixed(1)+' fps, '+s.tris+' triangles; detail '+s.detailTris+' triangles');return s;
};
const sqPoint=(page,sx,sz,dx=.5,dz=.5)=>page.evaluate(([sx,sz,dx,dz])=>{const a=window.__VTT,x=(sx+dx)*1.5-20480,z=(sz+dz)*1.5-20480;return a.project(x,a.world.height(x,z),z);},[sx,sz,dx,dz]);
async function stroke(page,p,q=p){await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps:12});await page.mouse.up();await idle(page);}
console.log('detail, desktop');
{
 const {ctx,page,errors}=await open({viewport:{width:1366,height:768}});
 const spot=await page.evaluate(()=>{const a=window.__VTT,s=a.world.data.settlements.find(p=>p.kind==='town');return {x:s.x,z:s.z,id:s.id,sx:Math.floor((s.x+20480)/1.5),sz:Math.floor((s.z+20480)/1.5)};});
 await fly(page,spot.x,spot.z,55,.001);
 await page.click('[data-tool=detail]');
 // A courtyard, through the actual desktop brush.
 await page.evaluate(()=>{const a=window.__VTT;a.tools.detailBrush={kind:'ground',ground:2,wall:1,size:5};a.ui.refresh();});
 await stroke(page,await sqPoint(page,spot.sx-3,spot.sz),await sqPoint(page,spot.sx+3,spot.sz));
 ok(await page.evaluate(()=>window.__VTT.tools.undoStack.length)===1,'a ground stroke is one undo step');
 const ground=await page.evaluate(()=>JSON.stringify(window.__VTT.world.data.detail));
 await page.evaluate(()=>window.__VTT.tools.undo());
 ok(await page.evaluate(()=>Object.keys(window.__VTT.world.data.detail).length)===0,'undo removes the entire ground stroke and deletes empty tiles');
 await page.evaluate(()=>window.__VTT.tools.redo());
 ok(await page.evaluate(()=>JSON.stringify(window.__VTT.world.data.detail))===ground,'redo restores identical ground bytes');
 await page.evaluate(()=>{const a=window.__VTT;a.tools.detailBrush={kind:'wall',wall:1,ground:2,size:1};a.ui.refresh();});
 await stroke(page,await sqPoint(page,spot.sx-5,spot.sz-3,.5,.01),await sqPoint(page,spot.sx+5,spot.sz-3,.5,.01));
 const run=await page.evaluate(s=>{const a=window.__VTT;return Array.from({length:11},(_,k)=>a.detail.getSquare(0,s.sx-5+k,s.sz-3).wallN);},spot);
 ok(run.every(v=>v===1),'edge drag paints an exact straight 11-wall run');
 await page.evaluate(()=>window.__VTT.tools.undo());
 ok(await page.evaluate(()=>JSON.stringify(window.__VTT.world.data.detail))===ground,'undo removes the wall run as one step');
 await page.evaluate(()=>window.__VTT.tools.redo());
 // Courtyard side walls and an opening in the north wall.
 await stroke(page,await sqPoint(page,spot.sx-5,spot.sz-3,.01,.5),await sqPoint(page,spot.sx-5,spot.sz+2,.01,.5));
 await stroke(page,await sqPoint(page,spot.sx+6,spot.sz-3,.01,.5),await sqPoint(page,spot.sx+6,spot.sz+2,.01,.5));
 await page.selectOption('[aria-label="Detail brush"]','door');
 await stroke(page,await sqPoint(page,spot.sx,spot.sz-3,.5,.01));
 ok(await page.evaluate(s=>window.__VTT.detail.getSquare(0,s.sx,s.sz-3).wallN===17,spot),'door keeps wall kind and is encoded in its edge');
 await page.selectOption('[aria-label="Detail brush"]','window');
 await stroke(page,await sqPoint(page,spot.sx+3,spot.sz-3,.5,.01));
 ok(await page.evaluate(s=>window.__VTT.detail.getSquare(0,s.sx+3,s.sz-3).wallN===33,spot),'window keeps wall kind and is encoded in its edge');
 await page.evaluate(()=>window.__VTT.tools.hover(null));
 const detail=await page.evaluate(()=>{const a=window.__VTT;a.saveNow();return JSON.stringify(a.world.data.detail);});
 await page.reload();await page.waitForFunction(()=>window.__VTT?.ui);await idle(page);
 ok(await page.evaluate(()=>JSON.stringify(window.__VTT.world.data.detail))===detail,'ground, walls, door and window survive reload exactly');
 const bytes=await page.evaluate(()=>Object.values(window.__VTT.world.data.detail).every(t=>Object.keys(t).sort().join()==='ground,objects,wallN,wallW' && ['ground','wallN','wallW'].every(k=>atob(t[k]).length===1600)));
 ok(bytes,'saved tiles have exactly three 1600-byte layers and objects');
 await fly(page,spot.x,spot.z,45,.65);await page.screenshot({path:OUT+'detail-courtyard.png'});
 const courtyard=await metrics(page,'courtyard High');ok(courtyard.maxMeshes<=3,'each detail tile has at most three merged meshes');
 // Generated buildings disappear for intersecting clear squares and return with undo.
 const house=await page.evaluate(id=>{const a=window.__VTT,r=a.towns.loaded.get(id),h=r.houses[0];return {x:h.x,z:h.z,n:r.houses.length};},spot.id);
 await fly(page,house.x,house.z,40,.001);await page.evaluate(()=>{const a=window.__VTT;a.setTool('detail');a.tools.detailBrush.kind='clear';a.tools.detailBrush.size=1;});
 const hp=await screenOf(page,house.x,house.z,0);await stroke(page,hp);
 ok(await page.evaluate(({id,n})=>window.__VTT.towns.loaded.get(id).houses.length<n,{id:spot.id,n:house.n}),'a cleared town block loses its generated house');
 await page.evaluate(()=>window.__VTT.tools.undo());await idle(page);
 ok(await page.evaluate(({id,n})=>window.__VTT.towns.loaded.get(id).houses.length===n,{id:spot.id,n:house.n}),'undo restores the generated house');
 // Pick a real fixed forest tree far from bookmarks.
 const forest=await page.evaluate(()=>{const a=window.__VTT,w=a.world;for(let j=80;j<180;j++)for(let i=80;i<180;i++)if(w.type[j*256+i]===4){const s=a.props.buildCell(i,j);for(let k=0;k<s.n;k++)if(s.kind[k]<2){const sx=Math.floor((s.x[k]+20480)/1.5),sz=Math.floor((s.z[k]+20480)/1.5);if(a.props.squareBlocked(0,sx,sz)==='tree' && !a.maps.at(s.x[k],s.z[k]))return {x:s.x[k],z:s.z[k],sx,sz,i,j};}}throw Error('No forest tree');});
 await page.evaluate(()=>window.__VTT.setTool('look'));await fly(page,forest.x,forest.z,45,.001);
 ok(await page.evaluate(()=>!window.__VTT.maps.grid.visible),'the grid is off by default');
 await page.evaluate(()=>{window.__VTT.showGrid=true;window.__VTT.request();}); await page.waitForTimeout(300);
 ok(await page.evaluate(()=>window.__VTT.maps.grid.visible && !window.__VTT.maps.active),'the global grid appears in a forest without a bookmark');
 await page.evaluate(()=>{const a=window.__VTT;a.setTool('detail');a.tools.detailBrush={kind:'ground',ground:4,wall:1,size:1};a.ui.refresh();});
 await stroke(page,await sqPoint(page,forest.sx,forest.sz));
 ok(await page.evaluate(s=>{const a=window.__VTT,slots=a.props.cells.get(s.j*256+s.i);return a.props.squareBlocked(0,s.sx,s.sz)===null && slots && !Array.from({length:slots.n},(_,k)=>k).some(k=>slots.kind[k]<2 && Math.floor((slots.x[k]+20480)/1.5)===s.sx && Math.floor((slots.z[k]+20480)/1.5)===s.sz);},forest),'a painted square has no generated tree in data or rendered slots');
 await page.evaluate(()=>window.__VTT.tools.undo());await idle(page);
 ok(await page.evaluate(s=>window.__VTT.props.squareBlocked(0,s.sx,s.sz)==='tree',forest),'undo restores the same fixed tree blocker');
 await page.evaluate(()=>{const a=window.__VTT;a.setTool('play');a.tools.tokenForm.name='Forest scout';a.ui.refresh();});
 await page.getByText('Add token',{exact:true}).click();await idle(page);
 const token=await page.evaluate(()=>{const a=window.__VTT,t=a.world.data.tokens.at(-1);return {...t,w:a.maps.tokenWorld(t)};});
 ok(Number.isInteger(token.sx) && !('map' in token) && token.level===0,'Add token works on free global forest squares');
 const from=await sqPoint(page,token.sx,token.sz),to=await sqPoint(page,forest.sx,forest.sz);
 await stroke(page,from,to);
 ok(await page.evaluate(t=>{const k=window.__VTT.world.data.tokens.find(k=>k.id===t.id);return k.sx!==t.treeX || k.sz!==t.treeZ;},{id:token.id,treeX:forest.sx,treeZ:forest.sz}),'dragging a token onto a tree is refused');
 ok(await page.evaluate(t=>{const a=window.__VTT,k=a.world.data.tokens.find(k=>k.id===t.id);return a.tools.freeSquare(k.level,k.sx,k.sz);},token),'refused drag leaves the token on a passable square');
 const destination=await page.evaluate(t=>{const a=window.__VTT,k=a.world.data.tokens.find(k=>k.id===t.id);for(let r=3;r>=1;r--)for(let z=-r;z<=r;z++)for(let x=-r;x<=r;x++)if(Math.abs(x)+Math.abs(z)>=r && a.tools.canMove(k,k.sx+x,k.sz+z))return {sx:k.sx+x,sz:k.sz+z};throw Error('No free move');},token);
 await stroke(page,await sqPoint(page,token.sx,token.sz),await sqPoint(page,destination.sx,destination.sz));
 ok(await page.evaluate(({id,sx,sz})=>{const k=window.__VTT.world.data.tokens.find(k=>k.id===id);return Math.hypot(k.sx-sx,k.sz-sz)<.6;},{id:token.id,...destination}),'a token really drags onto a free forest square (free movement outside combat)');
 const obstacles=await page.evaluate(s=>{const a=window.__VTT,slots=a.props.cells.get(s.j*256+s.i);let rock=false,bush=false;for(let k=0;k<slots.n;k++){const sx=Math.floor((slots.x[k]+20480)/1.5),sz=Math.floor((slots.z[k]+20480)/1.5),kind=a.props.squareBlocked(0,sx,sz);if(kind==='rock')rock ||= !a.tools.freeSquare(0,sx,sz);if(kind==='bush')bush ||= a.tools.freeSquare(0,sx,sz);}return {rock,bush};},forest);
 ok(obstacles.rock && obstacles.bush,'fixed rock squares block movement; bushes allow movement');
 const walls=await page.evaluate(()=>{const a=window.__VTT,d=a.detail,t={level:-1,sx:40,sz:39};d.setSquare(-1,40,40,{wallN:1});const wall=!a.tools.canMove(t,40,41);d.setSquare(-1,40,40,{wallN:17});const door=a.tools.canMove(t,40,41);d.setSquare(-1,40,40,{wallN:33});const windowBlocks=!a.tools.canMove(t,40,41);d.setSquare(-1,40,40,{wallN:0});return wall && door && windowBlocks && !a.world.data.detail['-1,1,1'];});
 ok(walls,'walls and windows stop fast drags; a door permits passage; empty tiles are deleted');
 await page.evaluate(()=>{const a=window.__VTT;a.tools.tokenForm.name='Rook';a.tools.tokenForm.color='#3a6a9e';a.tools.addToken();});await idle(page);
 await fly(page,forest.x,forest.z,45,.65);await page.screenshot({path:OUT+'detail-forest.png'});
 await metrics(page,'forest High');
 await page.evaluate(()=>window.__VTT.setQuality('low'));await idle(page);await metrics(page,'forest Low');
 ok(await page.evaluate(s=>window.__VTT.props.squareBlocked(0,s.sx,s.sz)==='tree',forest),'Low quality keeps the same fixed tree occupancy');
 // Legacy migration includes rotation, world corner offset and token metadata.
 const migration=await page.evaluate(()=>{const a=window.__VTT,d=a.world.toJSON();d.battlemaps.push({id:'legacy',name:'Old',x:123,z:-456,rot:Math.PI/3,known:true});d.tokens=[{id:'old',name:'Veteran',color:'#c33',map:'legacy',i:7,j:31}];const lx=(7-19.5)*1.5,lz=(31-19.5)*1.5,c=Math.cos(Math.PI/3),s=Math.sin(Math.PI/3),expected=[Math.floor((123+lx*c+lz*s+20480)/1.5),Math.floor((-456-lx*s+lz*c+20480)/1.5)];a.loadData(d);const t=a.world.data.tokens[0];return t.sx===expected[0] && t.sz===expected[1] && t.level===0 && t.name==='Veteran' && !('map' in t) && !('i' in t) && !('j' in t);});
 ok(migration,'old map/i/j tokens migrate to the global square under the rotated map');
 await fly(page,0,0,52000,.25);ok(await page.evaluate(()=>window.__VTT.detail.loaded.size===0 && !window.__VTT.maps.grid.visible && window.__VTT.maps.tokenMeshes.size===0),'world zoom frees detail and tokens and hides the grid');
 ok(errors.length===0,'no desktop console errors'+(errors.length?': '+errors.join(' | '):''));await ctx.close();
}
console.log('detail, phone');
{
 const {ctx,page,errors}=await open({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:3});
 await fly(page,0,0,35,.001);await page.locator('[data-tool=detail]').tap();
 const cdp=await ctx.newCDPSession(page),before=await page.evaluate(()=>JSON.stringify(window.__VTT.world.data.detail));
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:140,y:270,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:240,y:300,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await idle(page);
 ok(await page.evaluate(()=>JSON.stringify(window.__VTT.world.data.detail))!==before,'phone: one finger paints detail');
 ok(await page.evaluate(()=>window.__VTT.tools.undoStack.length)===1,'phone: a stroke is one undo step');
 const painted=await page.evaluate(()=>JSON.stringify(window.__VTT.world.data.detail));
 const camBefore=await page.evaluate(()=>window.__VTT.camera.position.toArray());
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:200,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:145,y:210,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:145,y:210,id:1},{x:270,y:340,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:120,y:220,id:1},{x:290,y:350,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await idle(page);
 ok(await page.evaluate(()=>JSON.stringify(window.__VTT.world.data.detail))===painted,'phone: second finger cancels and undoes the current stroke');
 ok(await page.evaluate(p=>window.__VTT.camera.position.toArray().some((v,i)=>Math.abs(v-p[i])>.01),camBefore),'phone: two fingers move the camera in Detail');
 ok(await page.evaluate(()=>window.__VTT.controls.enabled && window.__VTT.tools.undoStack.length===1),'phone: camera resumes and cancelled stroke adds no history');
 await page.screenshot({path:OUT+'detail-phone.png'});
 const fit=await page.evaluate(()=>{const r=document.querySelector('#bar').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth;});ok(fit,'phone toolbar fits');
 await metrics(page,'phone Low');
 ok(errors.length===0,'no phone console errors'+(errors.length?': '+errors.join(' | '):''));await ctx.close();
}
await writeFile(OUT+'detail-performance.json',JSON.stringify(perf,null,2));
await browser.close();srv.close();console.log(failed?'\n'+failed+' detail check(s) failed':'\nall detail checks passed');process.exit(failed?1:0);
