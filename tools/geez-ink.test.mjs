import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,mkdtemp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {dd2vttToScene,validateScene} from '../js/geez2vtt.js';
import {validate} from '../../GeezSuite/core/validate.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const schema=JSON.parse(await readFile(new URL('../../GeezSuite/core/schema/gaia.schema.json',import.meta.url)));
const require=createRequire(import.meta.url),{chromium}=require(join(process.env.APPDATA,'npm/node_modules/@playwright/mcp/node_modules/playwright'));
const output=process.env.GEEZ_INK_SCREENSHOTS||'C:/Users/jonge/AppData/Local/Temp/claude/dff00ab1bfd4b69a/4d09bafe-f12c-417f-857b-e1f03f596548/scratchpad/ink';
await mkdir(output,{recursive:true});
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const fixtures=['converted_prison_01','sanctuary','prison_01','market_district_01','azurite_pointe','cavesystem'];
for(const name of ['prison_01','market_district_01','azurite_pointe','cavesystem']){
    const input=JSON.parse(await readFile(join(root,'GeezSuite/maps/legacy',name+'.dd2vtt'))),before=JSON.stringify(input),scene=dd2vttToScene(input,name);
    check(name+' converts against GeezSuite schema without picture or input mutation',()=>{assert.deepEqual(validate(schema,'geez2vtt',scene),[]);assert.equal(scene.style,'ink');assert(!JSON.stringify(scene).includes('image'));assert.equal(JSON.stringify(input),before);assert.deepEqual(scene,JSON.parse(require('fs').readFileSync(new URL('geez-ink-fixtures/'+name+'.geez2vtt',import.meta.url))));});
}
const origin=dd2vttToScene({image:'DISCARD',resolution:{map_size:{x:8,y:8},map_origin:{x:10,y:20}},line_of_sight:[[{x:11,y:22},{x:12,y:23}]],objects_line_of_sight:[[{x:13,y:24},{x:14,y:25}]],portals:[{bounds:[{x:11,y:22},{x:12,y:22}],closed:false}],lights:[{position:{x:12,y:23},range:4,color:'80ffcc88'}]},'Offset');
check('origin offsets walls, object walls, door bounds and lights',()=>{const f=origin.floors[0];assert.deepEqual(f.walls[0].a,[1,2]);assert.deepEqual(f.walls[1].b,[4,5]);assert(f.walls[1].object);assert.deepEqual(f.portals[0].a,[1,2]);assert(!f.portals[0].closed);assert.equal(f.lights[0].x,2);assert.equal(f.lights[0].y,3);assert.equal(f.lights[0].color,'#ffcc88');});
check('invalid resolution rejected',()=>assert.throws(()=>dd2vttToScene({resolution:{map_size:{x:0,y:5}}})));
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!p.startsWith(root)){res.writeHead(403).end();return;}const b=await readFile(p);res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.geez2vtt':'application/json'})[extname(p)]||'text/plain');res.end(b);}catch{res.writeHead(404).end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;const screenshots=[],timings=[];
try {
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1200},deviceScaleFactor:1});
    const images=[],badUrls=[],errors=[];page.on('request',r=>{if(r.resourceType()==='image')images.push(r.url());if(r.url().startsWith('data:'))badUrls.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{const u=route.request().url();return u.startsWith('http://127.0.0.1:')?route.continue():route.abort();});
    await page.goto(`http://127.0.0.1:${server.address().port}/GeezSheets/tools/geez-ink-fixtures/harness.html`);await page.waitForFunction(()=>window.ready);
    // Also catch data URLs never requested by Chromium (e.g. image src or canvas serialization).
    await page.evaluate(()=>{HTMLCanvasElement.prototype.toDataURL=()=>{throw Error('Map serialized to data URL');};const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{set(v){throw Error('Map attempted image src '+v);},get:descriptor.get});});
    for(const name of fixtures){const s=JSON.parse(await readFile(new URL('geez-ink-fixtures/'+name+'.geez2vtt',import.meta.url)));validateScene(s);assert.deepEqual(validate(schema,'geez2vtt',s),[]);
        await page.evaluate(s=>{loadScene(s);paint();},s);
        for(const mode of ['gm','player','close']){await page.evaluate(mode=>{paint({player:mode==='player',viewers:[{x:scene.name.includes('Gaoler')||scene.name==='prison_01'?12:scene.grid.cols/2,y:scene.name.includes('Gaoler')||scene.name==='prison_01'?10:scene.grid.rows/2,range:12}]});const c=document.querySelector('canvas');c.style.maxWidth=mode==='close'?'none':'calc(100vw - 40px)';c.style.width=mode==='close'?c.width*2+'px':'';c.style.marginLeft=mode==='close'?'-180px':'';},mode);const path=join(output,name+'-'+mode+'.png');await page.screenshot({path});screenshots.push(path);}
        console.log('PASS render '+name+' (GM, player fog, close-up)');passed++;
    }
    const los=await page.evaluate(()=>{
        const s={format:'geez2vtt',version:1,name:'LOS proof',grid:{cols:10,rows:8,cell_ft:5},floors:[{level:0,name:'Ground',elevation:0,cells:{},walls:[{a:[5,0],b:[5,3],material:'stone'},{a:[5,4],b:[5,8],material:'stone'}],portals:[{a:[5,3],b:[5,4],kind:'door',material:'wood',closed:true,reviewed:true}],props:[],lights:[]}]};loadScene(s);const viewers=[{x:2.5,y:3.5}];paint({viewers});const gm=probe(7.5,3.5);paint({player:true,viewers});const closed=probe(7.5,3.5),wall=probe(7.5,1.5);paint({player:true,viewers,states:{'scene-door-0':'open'}});const open=probe(7.5,3.5),stillWall=probe(7.5,1.5);paint({player:true,viewers});const explored=probe(7.5,3.5);paint({viewers,preview:true});const preview=probe(7.5,1.5);paint({viewers});const gmAgain=probe(7.5,1.5);
        const a=ink.geometry(s);s.floors[0].portals[0].kind='window';const w=ink.geometry(s);s.floors[0].portals[0].kind='arch';const arch=ink.geometry(s);
        const blocks=g=>geo.isPathBlocked(2.5,3.5,7.5,3.5,g.walls,g.doors);
        return {gm,closed,open,explored,wall,stillWall,preview,gmAgain,closedBlocks:blocks(a),windowBlocks:blocks(w),windowSight:w.doors[0].sight,archBlocks:blocks(arch)};
    });
    check('LOS wall and closed door hatch; opening door reveals; GM stays clean',()=>{assert.notDeepEqual(los.closed,los.gm);assert.deepEqual(los.open,los.gm);assert.notDeepEqual(los.wall,los.gmAgain);assert.notDeepEqual(los.stillWall,los.gmAgain);assert.notDeepEqual(los.preview,los.gmAgain);});
    check('explored-but-not-visible is lighter than unexplored',()=>{assert(los.explored[0]>los.closed[0]);assert(los.explored[0]<los.gm[0]);});
    check('closed door and window block movement, window passes sight, arch passes both',()=>{assert(los.closedBlocks);assert(los.windowBlocks);assert(!los.windowSight);assert(!los.archBlocks);});
    const blank=await page.evaluate(()=>{const s=convert({image:'must-disappear',resolution:{map_size:{x:8,y:8}}},'Plain parchment');loadScene(s);paint();const a=probe(2.3,2.3);const other=ink.createInkRenderer(s,{ppg:48}),ctx=other.canvas.getContext('2d');const b=Array.from(ctx.getImageData(Math.floor(2.3*other.ppg),Math.floor(2.3*other.ppg),1,1).data);return {a,b,walls:s.floors[0].walls};});
    check('wall-free imports render deterministic plain parchment and grid',()=>{assert.deepEqual(blank.a,blank.b);assert.deepEqual(blank.walls,[]);});
    const bridge=await page.evaluate(async()=>{
        const {createBridge,doorRules}=await import('/GeezSheets/js/geez-table3d-layer.js');const source=structuredClone(scene),callbacks={},db={view:{level:'VTT',battleId:'proof'},battles:{proof:{tokens:{}}},things:{}};
        source.floors[0].portals=[{a:[4,3],b:[4,4],kind:'door',material:'iron',closed:true,reviewed:true}];
        let redraws=0,writes=[];const wrap=document.createElement('div');document.body.append(wrap);
        const b=createBridge({gaia:true,db:()=>db,ui:{},scene:()=>source,camp:()=> 'test',path:p=>p,live:{on:(p,cb)=>{callbacks[p]=cb;return ()=>{};},set:(...a)=>writes.push(a)},player:false,name:()=>'',moves:()=>({}),render:()=>redraws++,wrapper:wrap,viewport:wrap,content:()=>({x:0,y:0}),edits:()=>({}),propDef:()=>null,propImg:()=>{throw Error('PNG path used');},paint:()=>{throw Error('texture path used');},esc:String});
        b.watch('proof');const s=b.scene(),c=document.createElement('canvas');c.width=s.w;c.height=s.h;const x=c.getContext('2d');b.drawBase(x,s);const closed=b.geometry().doors[0];b.setDoor(closed,true);callbacks['table3d/proof/doors']({0:{'scene-door-0':'open'}});const open=b.geometry().doors[0];b.controls();b.setFogPreview(true);const preview=b.fogPreview();b.drawFog(x,s,ink.visionFor(source,[{x:2,y:3.5}]),{gm:true,preview});b.reset();wrap.remove();return {closed,open,writes,preview,redraws,curtain:doorRules('curtain')};
    });
    check('bridge uses ink, keeps live door writes and provides GM fog preview',()=>{assert(bridge.closed.closed);assert(!bridge.open.closed);assert.deepEqual(bridge.writes,[['table3d/proof/doors/0/scene-door-0','open']]);assert(bridge.preview);assert(bridge.redraws>=2);assert(!bridge.curtain.pass);});
    // Apply the review patch only to a temporary HEAD copy; never touch the concurrent working page.
    const repo=join(root,'GeezSheets'),patch=fileURLToPath(new URL('geez-ink-index.patch',import.meta.url));
    const head=execFileSync('git',['-c','safe.directory='+repo.replaceAll('\\','/'),'show','HEAD:geez-index.html'],{cwd:repo,encoding:'utf8'});
    const scratch=await mkdtemp(join(tmpdir(),'geez-ink-patch-proof-'));await writeFile(join(scratch,'geez-index.html'),head);if(!head.includes('async function attachGeez2vtt('))execFileSync('git',['apply',patch],{cwd:scratch}); // already merged into main on 2026-11-10
    const patched=await readFile(join(scratch,'geez-index.html'),'utf8'),handler=patched.slice(patched.indexOf('async function attachGeez2vtt('),patched.indexOf("        viewport.addEventListener('dragover'",patched.indexOf('async function attachGeez2vtt(')));
    const published=await page.evaluate(async handler=>{const PLAYER=false,db={view:{level:'BOARD'}},GH=null,sent=[],rtdb={gaia:true,publishScene:async(...args)=>sent.push(args)},liveCamp=()=> 'daddies',showStatus=()=>{},syncCampaign=()=>{};let saveTimer=null;
        const attach=eval('('+handler.replace("'./js/geez2vtt.js'","'/GeezSheets/js/geez2vtt.js'")+')');
        await attach(new File([JSON.stringify({image:'discard',resolution:{map_size:{x:5,y:6}}})],'Friday.dd2vtt'),{id:'place_friday'});
        await attach(new File([JSON.stringify(scene)],'Friday.geez2vtt'),{id:'place_friday'});return sent;
    },handler);
    check('HEAD patch applies; both browser attach formats publish scenes through existing path',()=>{assert.equal(published.length,2);for(const [id,s,camp] of published){assert.equal(id,'place_friday');assert.equal(camp,'daddies');assert.deepEqual(validate(schema,'geez2vtt',s),[]);assert(!JSON.stringify(s).includes('image'));}assert.equal(published[0][1].style,'ink');assert.equal(published[0][1].name,'Friday');assert(patched.includes('attachGeez2vtt(e.dataTransfer.files[0]'));assert(patched.includes('await attachGeez2vtt(f,t)'));});
    const session=await page.context().newCDPSession(page);await session.send('Emulation.setCPUThrottlingRate',{rate:4});
    const perf=JSON.parse(await readFile(new URL('geez-ink-fixtures/sanctuary.geez2vtt',import.meta.url)));perf.grid={cols:60,rows:60,cell_ft:5};perf.name='60 × 60 performance';
    // Tile real room geometry to exercise LOS, surfaces, doors, lights and props over the whole map.
    const template=structuredClone(perf.floors[0]),f=perf.floors[0];f.cells={};f.walls=[];f.portals=[];f.props=[];f.lights=[];
    for(let oy=0;oy<60;oy+=20)for(let ox=0;ox<60;ox+=24){for(const [key,v] of Object.entries(template.cells)){const [x,y]=key.split(',').map(Number);if(x+ox<60)f.cells[(x+ox)+','+(y+oy)]=v;}for(const w of template.walls)if(w.a[0]+ox<60&&w.b[0]+ox<60)f.walls.push({...w,a:[w.a[0]+ox,w.a[1]+oy],b:[w.b[0]+ox,w.b[1]+oy]});for(const p of template.props)if(p.x+ox<60)f.props.push({...p,x:p.x+ox,y:p.y+oy});}
    const build=await page.evaluate(s=>{const t=performance.now();loadScene(s);return performance.now()-t;},perf);
    const frames=await page.evaluate(async()=>{const overlay=document.createElement('canvas');overlay.width=renderer.canvas.width;overlay.height=renderer.canvas.height;const ctx=overlay.getContext('2d');const samples=[],los=[];for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);let t=performance.now();const vis=ink.visionFor(scene,[{x:8+i*.025,y:8}],0,{});los.push(performance.now()-t);t=performance.now();ctx.clearRect(0,0,overlay.width,overlay.height);renderer.drawFog(ctx,vis);ctx.fillStyle='#eee';ctx.beginPath();ctx.arc((8+i*.025)*renderer.ppg,8*renderer.ppg,renderer.ppg*.3,0,7);ctx.fill();if(i>=15)samples.push(performance.now()-t+los.at(-1));}return samples;});
    frames.sort((a,b)=>a-b);timings.push({map:'60x60',cpuThrottle:4,staticBuildMs:+build.toFixed(2),meanMs:+(frames.reduce((a,b)=>a+b)/frames.length).toFixed(2),p50Ms:+frames[Math.floor(frames.length*.5)].toFixed(2),p95Ms:+frames[Math.floor(frames.length*.95)].toFixed(2),maxMs:+frames.at(-1).toFixed(2)});
    check('60x60 movement p95 under 33ms at 4x CPU',()=>assert(frames[Math.floor(frames.length*.95)]<33,JSON.stringify(timings)));
    check('zero map image requests, data URLs and browser errors',()=>{assert.deepEqual(images,[]);assert.deepEqual(badUrls,[]);assert.deepEqual(errors,[]);});
    const result={passed,timings,screenshots};await writeFile(join(output,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} finally {await browser?.close();await new Promise(ok=>server.close(ok));}
