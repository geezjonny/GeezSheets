// Local smoke test using installed Edge and the DevTools protocol; no npm dependencies.
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),profile=await mkdtemp(path.join(root,'tools','.draft-browser-'));
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep))throw Error();const content=await readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/plain');res.end(content);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const edge=process.env.GEEZ_BROWSER || process.env.PROGRAMFILES+' (x86)/Microsoft/Edge/Application/msedge.exe';
const browser=spawn(edge,['--headless=new','--no-sandbox','--ignore-certificate-errors','--disable-gpu','--no-first-run','--remote-debugging-port=9323',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try{
    let tabs;for(let i=0;i<100;i++){try{tabs=await(await fetch('http://127.0.0.1:9323/json',{signal:AbortSignal.timeout(500)})).json();if(tabs.length)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    assert.ok(tabs?.length,'Edge DevTools started');
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
    let serial=0;const pending=new Map(),exceptions=[],consoleErrors=[];
    ws.addEventListener('message',e=>{const msg=JSON.parse(e.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(msg.error):p.resolve(msg.result);}else if(msg.method==='Runtime.consoleAPICalled' && msg.params.type==='error'){consoleErrors.push(msg.params.args.map(a=>a.description||a.value).join(' '));}else if(msg.method==='Runtime.exceptionThrown'){exceptions.push(msg.params.exceptionDetails);}});
    const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
    const evaluate=async(expression)=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
    await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
    const fixture={version:'5.0',settings:{},things:{battle:{id:'battle',type:'location',name:'Draft test',campaign:'world',traits:{category:'battlemap',dd2vtt:'blank:20x20'},properties:[{key:'pc-known',value:true},{key:'pc-visited',value:true}],board:{x:0,y:0},notes:''}},links:{},maps:{world:{id:'world',name:'World',pins:{battle:{x:.5,y:.5}},tiles:{},roads:{},gridSize:40}},battles:{battle:{tokens:{}}},view:{level:'VTT',worldId:'world',battleId:'battle',locationMapId:null}};
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('geezvtt.campaigns.v6',${JSON.stringify(JSON.stringify(fixture))});localStorage.setItem('geezvtt.player.world.name','Hero');localStorage.setItem('geezvtt.player.world.view',${JSON.stringify(JSON.stringify(fixture.view))});`});
    async function load(query='gm=jonny') {
        exceptions.length=0;consoleErrors.length=0;await call('Page.navigate',{url:origin+'/old-index.html?local&'+query});
        for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,100));if(await evaluate(`typeof DT !== 'undefined' && (PLAYER || !!DT) && !!ui.scene && ui.loaded`))break;}
        assert.equal(exceptions.length,0,JSON.stringify(exceptions));assert.ok(await evaluate('!!ui.scene && ui.loaded'));
    }
    await load();await evaluate("setMode('draft');fitView()");
    assert.equal(await evaluate("document.querySelector('#draftStyle').value"),'Townhouse');
    async function pointer(x,y,type='mouseMoved',button='left',buttons=1,modifiers=0){
        const p=await evaluate(`(()=>{const r=mapWrapper.getBoundingClientRect(),g=ui.scene.ppg*cam().zoom;return {x:r.left+${x}*g,y:r.top+${y+3}*g}})()`);
        await call('Input.dispatchMouseEvent',{type,...p,button,buttons,clickCount:1,modifiers});
    }
    async function drag(a,b,button='left',modifiers=0){await pointer(...a,'mousePressed',button,button==='right'?2:1,modifiers);await pointer(...b,'mouseMoved',button,button==='right'?2:1,modifiers);await pointer(...b,'mouseReleased',button,0,modifiers);}
    const stored=()=>evaluate("JSON.parse(localStorage.getItem('geezvtt.draft.v1:world:battle:0')||'[]')");
    await drag([1.5,1.5],[4.5,4.5]);assert.equal((await stored())[0].cells.length,16);
    assert.equal(await evaluate("Object.keys(db.battles.battle.edits||{}).length"),0);
    await load();await evaluate("setMode('draft');fitView()");assert.equal((await stored())[0].cells.length,16);
    await evaluate("document.querySelector('#draftType').value='Bedroom';document.querySelector('#draftType').dispatchEvent(new Event('change'))");
    await drag([2.5,2.5],[2.5,2.5]);assert.equal((await stored())[0].type,'Bedroom');
    await drag([5.5,1.5],[6.5,2.5],'left',8);assert.equal((await stored()).length,1);assert.equal((await stored())[0].cells.length,20);
    await drag([6.5,2.5],[6.5,2.5],'right');assert.equal((await stored())[0].cells.length,19);
    await evaluate("document.querySelector('#draftSize').value='3x3';document.querySelector('#draftSize').dispatchEvent(new Event('change'))");
    await drag([10.5,4.5],[10.5,4.5]);assert.equal((await stored())[1].cells.length,9);
    console.log('ok - browser drag, retype, Shift extension, right erase, centered stamp, reload, and local-only sketch');
    await evaluate("resetUndo();document.querySelector('#draftBuild').click()");
    assert.equal(await evaluate("Object.keys(floorEdits('battle').paint).length"),28);assert.ok(await evaluate("Object.keys(floorEdits('battle').props).length>0"));assert.equal((await stored()).length,0);
    assert.equal(await evaluate('undoStack.length'),1);
    await evaluate('undoRedo(false)');assert.equal(await evaluate("Object.keys(floorEdits('battle').paint||{}).length"),0);
    await evaluate('undoRedo(true)');assert.equal(await evaluate("Object.keys(floorEdits('battle').paint).length"),28);
    console.log('ok - Build applies normal edits in one undo/redo step');
    await evaluate("setMode('draft');document.querySelector('#draftSize').value='Drag';document.querySelector('#draftSize').dispatchEvent(new Event('change'))");
    await drag([1.5,1.5],[3.5,3.5]);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});assert.equal((await stored()).length,0);
    await drag([1.5,1.5],[3.5,3.5]);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter'});assert.equal((await stored()).length,0);
    await evaluate("setMode('pan');setBuild(false)");assert.equal(await evaluate("document.querySelector('#modeDraft').style.display"),'none');
    console.log('ok - Enter, Escape, and build-toolbar visibility');
    assert.equal(exceptions.length,0,JSON.stringify(exceptions));assert.equal(consoleErrors.length,0,consoleErrors.join('\n'));
    await load('play=world');assert.equal(await evaluate('PLAYER'),true);assert.equal(await evaluate('DT'),null);assert.equal(await evaluate("document.querySelector('#modeDraft').style.display"),'none');
    console.log('ok - Player has no Draft UI or sketch renderer');
    await call('Browser.close');
} finally {
    ws?.close();browser.kill();server.close();await new Promise(r=>setTimeout(r,500));
    if(path.dirname(path.resolve(profile))!==path.join(root,'tools')||!path.basename(profile).startsWith('.draft-browser-'))throw Error('Unexpected browser profile path');
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
}

