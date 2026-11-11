import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

// Use the Playwright installation bundled with the local MCP package, without dependencies.
const require = createRequire(import.meta.url);
const { chromium } = require(resolve(process.env.APPDATA, 'npm/node_modules/@playwright/mcp/node_modules/playwright'));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const results = [];
const pass = message => { results.push(message); console.log(`PASS ${message}`); };
const scene = () => page.evaluate(() => JSON.parse(toScene()));
const count = () => page.evaluate(() => state.selection.size);

async function open() {
    await page.goto(pathToFileURL(resolve('map-converter.html')).href);
    await page.waitForFunction(() => typeof state !== 'undefined');
}
async function drop(names, added = names.length) {
    const files = await Promise.all(names.map(async name => ({
        name: basename(name), text: await readFile(resolve('../GeezSuite/maps/legacy', name), 'utf8')
    })));
    const before = await page.evaluate(() => state.levels.length);
    await page.evaluate(files => {
        const dataTransfer = new DataTransfer();
        for (const f of files) dataTransfer.items.add(new File([f.text], f.name, { type: 'application/json' }));
        window.dispatchEvent(new DragEvent('dragover', { dataTransfer, bubbles: true, cancelable: true }));
        window.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }));
    }, files);
    await page.waitForFunction(n => state.levels.length === n, before + added);
    if (!added) await page.waitForFunction(() => level().img?.complete);
}
async function gridPoint(x, y) {
    return page.evaluate(([x,y]) => [state.view.x+x*state.view.zoom, state.view.y+y*state.view.zoom], [x,y]);
}
async function clickCell(x,y) { await page.mouse.click(...await gridPoint(x+.5,y+.5)); }
async function drag(a,b) {
    await page.mouse.move(...await gridPoint(...a));
    await page.mouse.down();
    await page.mouse.move(...await gridPoint(...b), { steps: 12 });
    await page.mouse.up();
}
async function keyboard(key) {
    // Return focus to the canvas for tool and selection shortcuts.
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press(key);
}
try {
    await open();
    await drop(['prison_01.dd2vtt']);
    let data = await scene();
    assert.equal(data.format,'geez2vtt'); assert.equal(data.version,1);
    assert.equal(data.floors[0].walls.length,67);
    assert.equal(data.floors[0].portals.length,18);
    assert.equal(data.floors[0].lights.length,3);
    assert.ok(await page.evaluate(() => !!level().img?.complete));
    pass('file:// drop imports prison: 67 walls, 18 portals, 3 lights and tracing picture');

    const initialPrison=await scene();
    await page.click('#tool-floor');
    await drag([17.1,9.1],[19.9,10.9]);
    assert.equal(await count(),6);
    assert.equal(await page.textContent('#selection-count'),'Selected: 6 cells');
    await page.keyboard.down('Shift');await clickCell(20,10);await page.keyboard.up('Shift');assert.equal(await count(),7);
    await page.keyboard.down('Alt');await clickCell(20,10);await page.keyboard.up('Alt');assert.equal(await count(),6);
    const boxKeys=await page.evaluate(()=>[...state.selection]);
    const beforeApply=await scene();
    await page.selectOption('#batch-floor','marble');await page.click('#apply-floor');
    assert.ok(await page.evaluate(keys=>keys.every(k=>level().cells[k].floor==='marble'&&guessState().review[k]&&!guessState().unreviewed[k]),boxKeys));
    await keyboard('Control+z');assert.deepEqual(await scene(),beforeApply);
    await drag([17.1,9.1],[19.9,10.9]);
    await page.locator('#batch-elevation').fill('15');await page.click('#apply-elevation');
    assert.ok(await page.evaluate(keys=>keys.every(k=>level().cells[k].elevation===15),boxKeys));
    await keyboard('Control+z');assert.deepEqual(await scene(),beforeApply);
    await page.selectOption('#current-material','tile');await page.click('#mode-room');await clickCell(9,5);
    assert.ok(await page.evaluate(()=>[...state.selection].every(k=>level().cells[k].floor==='tile')));
    await keyboard('Control+z');assert.deepEqual(await scene(),beforeApply);
    // Select tool + Room mode must only select, allowing two rooms to be batched.
    await page.click('#tool-select');await page.click('#mode-room');
    const points=await page.evaluate(()=>enclosedRooms().slice(0,2).map(r=>roomCenter(r)));
    assert.equal(points.length,2);
    await page.mouse.click(...await gridPoint(...points[0]));
    const firstRoom=await count();
    await page.keyboard.down('Shift');await page.mouse.click(...await gridPoint(...points[1]));await page.keyboard.up('Shift');
    assert.ok(await count()>firstRoom);
    assert.deepEqual(await scene(),beforeApply);
    const twoRooms=await page.evaluate(()=>[...state.selection]);
    await page.selectOption('#batch-terrain','mud');await page.click('#apply-terrain');
    assert.ok(await page.evaluate(keys=>keys.every(k=>level().cells[k].terrain==='mud'&&!guessState().unreviewed[k]),twoRooms));
    await keyboard('Control+z');assert.deepEqual(await scene(),beforeApply);
    await page.click('#tool-floor');await keyboard('Control+a');
    await page.selectOption('#current-material','wood');await keyboard('Enter');
    assert.equal(Object.values((await scene()).floors[0].cells).filter(c=>c.floor==='wood').length,initialPrison.grid.cols*initialPrison.grid.rows);
    await keyboard('Control+z');assert.deepEqual(await scene(),beforeApply);
    await page.evaluate(json=>fromScene(json,true),JSON.stringify(initialPrison));
    pass('real UI: box + Apply, one-click Floor room, Select + Shift two rooms + Apply terrain, Ctrl+A + Enter including empty cells, reviewed marks and undo');

    await page.click('#tool-portal');
    // Empty start; includes the top three doors, excluding the others.
    const bounds = [[8,6],[25,7.5]];
    const selectedIndices = data.floors[0].portals.flatMap((p,i) =>
        [p.a,p.b].every(([x,y]) => x>=8&&x<=25&&y>=6&&y<=7.5) ? [i] : []);
    assert.ok(selectedIndices.length>1 && selectedIndices.length<18);
    await drag(...bounds);
    assert.equal(await count(),selectedIndices.length);
    assert.equal(await page.textContent('#selection-count'),`${selectedIndices.length} doors selected`);
    await page.selectOption('#batch-kind','window');
    data = await scene();
    assert.equal(data.floors[0].portals.filter(p=>p.kind==='window').length,selectedIndices.length);
    for(const i of selectedIndices) assert.equal(data.floors[0].portals[i].kind,'window');
    pass(`box selects ${selectedIndices.length} doors; batch kind changes exactly those doors in export`);

    await keyboard('Control+z');
    assert.ok((await scene()).floors[0].portals.every(p=>p.kind==='door'));
    assert.ok(await page.evaluate(() => !!level().img?.complete));
    await keyboard('Control+Shift+z');
    assert.equal((await scene()).floors[0].portals.filter(p=>p.kind==='window').length,selectedIndices.length);
    await keyboard('Control+z');
    await keyboard('Control+y');
    assert.equal((await scene()).floors[0].portals.filter(p=>p.kind==='window').length,selectedIndices.length);
    pass('one-step batch undo, both redo shortcuts, and tracing picture preservation');

    await keyboard('Escape'); assert.equal(await count(),0);
    const centers = await page.evaluate(() => level().portals.slice(0,2).map(p=>[(p.a[0]+p.b[0])/2,(p.a[1]+p.b[1])/2]));
    await page.mouse.click(...await gridPoint(...centers[0]));
    await page.keyboard.down('Shift'); await page.mouse.click(...await gridPoint(...centers[1])); await page.keyboard.up('Shift');
    assert.equal(await count(),2);
    await page.keyboard.down('Alt'); await page.mouse.click(...await gridPoint(...centers[0])); await page.keyboard.up('Alt');
    assert.equal(await count(),1);
    await keyboard('Control+a'); assert.equal(await count(),18);
    pass('click, Shift-add, Alt-remove, Esc, and Ctrl+A use the active layer');

    await page.click('#tool-floor');
    await page.selectOption('#current-material','tile');
    await page.click('#mode-room');
    // This is inside the northwestern prison cell, bounded by imported angled segments.
    await clickCell(9,5);
    let room = await page.evaluate(() => [...state.selection]);
    assert.ok(room.length>1 && room.length<60,`expected a prison cell, got ${room.length} cells`);
    await page.click('#fill-room');
    data = await scene();
    for(const k of room) assert.equal(data.floors[0].cells[k].floor,'tile');
    pass(`prison-cell flood selects ${room.length} bounded cells; Fill room writes tile to all`);

    await page.click('#fill-all-rooms');
    const found = await page.evaluate(() => rooms.map(r=>r.length));
    assert.ok(found.length>1);
    await page.locator('.room-list button').nth(1).click();
    assert.equal(await count(),found[1]);
    pass(`Fill all rooms discovers ${found.length} numbered regions and supports room navigation`);

    await page.click('#tool-elevation');
    await page.locator('#elevation-value').fill('10');
    await page.click('#mode-brush');
    const beforeBrush = await scene();
    await drag([17.5,9.5],[19.5,9.5]);
    data=await scene();
    for(let x=17;x<=19;x++)assert.equal(data.floors[0].cells[`${x},9`].elevation,10);
    await keyboard('Control+z');assert.deepEqual(await scene(),beforeBrush);
    await keyboard('Control+y');
    await page.locator('#elevation-value').fill('-15');
    await page.click('#mode-room'); await clickCell(9,5);
    room=await page.evaluate(() => [...state.selection]);
    await page.click('#fill-room');
    data=await scene();for(const k of room)assert.equal(data.floors[0].cells[k].elevation,-15);
    await page.click('#mode-rect');await drag([17.2,11.2],[18.8,12.8]);
    data=await scene();for(let x=17;x<=18;x++)for(let y=11;y<=12;y++)assert.equal(data.floors[0].cells[`${x},${y}`].elevation,-15);
    pass('elevation brush, rectangle and room fill write heights; a whole brush stroke undoes once');

    const beforeLayers = await scene();
    await page.click('#tool-wall');await keyboard('Control+a');assert.equal(await count(),67);
    await page.selectOption('#batch-material','marble');
    assert.ok((await scene()).floors[0].walls.every(w=>w.material==='marble'));
    // Undo must also work while the batch dropdown still has focus.
    await page.keyboard.press('Control+z');
    assert.ok((await scene()).floors[0].walls.every(w=>w.material==='stone'));
    await page.click('#tool-light');await keyboard('Control+a');assert.equal(await count(),3);
    await page.selectOption('#batch-preset','magic');
    assert.ok((await scene()).floors[0].lights.every(l=>l.range===8&&l.color==='#aaaaff'));
    await page.click('#tool-prop');await page.click('#mode-draw');
    await clickCell(17,10);await clickCell(19,10);
    await page.click('#mode-select');await keyboard('Control+a');assert.equal(await count(),2);
    await page.selectOption('#batch-id','barrel');
    await page.getByRole('button',{name:'+90°',exact:true}).click();
    await page.locator('#batch-scale').fill('2');await page.locator('#batch-scale').press('Tab');
    assert.ok((await scene()).floors[0].props.every(p=>p.id==='barrel'&&p.rotation===90&&p.scale===2));
    await keyboard('Delete');assert.equal((await scene()).floors[0].props,undefined);
    await keyboard('Control+z');assert.equal((await scene()).floors[0].props.length,2);
    await page.evaluate(json=>fromScene(json,true),JSON.stringify(beforeLayers));
    pass('wall, light and prop batch controls, focused-control undo, deletion and undo');

    // Compare indexed blocking against a brute-force oracle, including arbitrary angles,
    // endpoints and collinear segments, on the requested large-map workload.
    const geometry=await page.evaluate(() => {
        const saved=toScene();
        state.grid={cols:80,rows:80,cell_ft:5};
        const walls=Array.from({length:300},(_,i)=>({a:[(i*17)%80,(i*29)%80],b:[(i*37+3)%80,(i*43+5)%80],material:'stone'}));
        level().walls=walls;level().portals=[];barrierCache=null;
        let mismatches=0;const start=performance.now();
        for(let y=0;y<80;y++)for(let x=0;x<80;x++)for(const [dx,dy] of [[1,0],[0,1]]){
            if(!inMap(x+dx,y+dy))continue;
            const expected=walls.some(w=>intersects([x+.5,y+.5],[x+dx+.5,y+dy+.5],w.a,w.b));
            if(blocked(x,y,x+dx,y+dy)!==expected)mismatches++;
        }
        const oracleMs=performance.now()-start;
        barrierCache=null;const t=performance.now();findRooms();const fillMs=performance.now()-t;
        fromScene(saved,true);return {mismatches,oracleMs,fillMs};
    });
    assert.equal(geometry.mismatches,0);
    assert.ok(geometry.fillMs<3000,`room detection too slow: ${geometry.fillMs}ms`);
    pass(`80×80 / 300 angled walls: indexed intersections match oracle; room scan ${Math.round(geometry.fillMs)} ms`);

    const portalBlocking=await page.evaluate(()=>{
        const saved=toScene();state.grid={cols:8,rows:8,cell_ft:5};
        level().walls=[{a:[4,0],b:[4,3]},{a:[4,4],b:[4,8]}];
        level().portals=[{a:[4,3],b:[4,4]}];barrierCache=null;
        state.toolOptions.doorsClose=true;const closed=flood(1,1).length;
        state.toolOptions.doorsClose=false;const open=flood(1,1).length;
        state.toolOptions.doorsClose=true;fromScene(saved,true);return {closed,open};
    });
    assert.deepEqual(portalBlocking,{closed:32,open:64});
    pass('Doors close rooms toggles portal-segment blocking');

    data=await scene();const exported=JSON.stringify(data);
    assert.ok(!exported.includes('base64')&&!exported.includes('data:image')&&!exported.includes('"img"'));
    assert.deepEqual(Object.keys(data).sort(),['format','version','name','grid','floors'].sort());
    await page.evaluate(json=>{
        const dt=new DataTransfer();dt.items.add(new File([json],'traced.geez2vtt'));
        window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,cancelable:true}));
    },exported);
    await page.waitForFunction(() => document.getElementById('status-bar').textContent.startsWith('Opened'));
    assert.deepEqual(await scene(),data);
    pass('geez2vtt v1 round trip preserves export shape; export contains no pictures/base64');

    await open();
    await page.evaluate(json=>{
        const dt=new DataTransfer();dt.items.add(new File([json],'traced.geez2vtt'));
        window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,cancelable:true}));
    },exported);
    await page.waitForFunction(() => state.levels.length===1);
    assert.equal(await page.evaluate(() => level().img),null);
    await drop(['prison_01.dd2vtt'],0);
    assert.deepEqual(await scene(),data);
    pass('fresh scene reopen reattaches a dropped tracing picture without duplicating the level');

    await open();await drop(['palace_grounds_02.dd2vtt','palace_grounds_00.dd2vtt','palace_grounds_01.dd2vtt']);
    data=await scene();assert.equal(data.floors.length,3);
    assert.deepEqual(data.floors.map(f=>f.source),['palace_grounds_00.dd2vtt','palace_grounds_01.dd2vtt','palace_grounds_02.dd2vtt']);
    assert.ok(await page.evaluate(() => state.levels.every(l=>l.img?.complete)));
    await keyboard('Control+z');assert.equal((await scene()).floors.length,2);
    await keyboard('Control+y');
    assert.ok(await page.evaluate(() => state.levels.length===3&&state.levels.every(l=>l.img?.complete)));
    pass('multi-file drop sorts palace_grounds_00..02 into three levels with pictures');
    const screenshotDir=resolve('tools/out/converter/guess');
    await mkdir(screenshotDir,{recursive:true});
    const tunedMaps=['azurite_pointe.dd2vtt','forestroad.dd2vtt','cavesystem.dd2vtt','market_district_01.dd2vtt','desertedhouse0.dd2vtt','prison_01.dd2vtt'];
    const propDir=resolve(screenshotDir,'../props');await mkdir(propDir,{recursive:true});
    for(const map of tunedMaps){
        await open();await drop([map]);
        const stats=await page.evaluate(()=>{
            const g=guessState(),cells=Object.values(level().cells),counts={};
            for(const c of cells){const m=c.floor||c.terrain;counts[m]=(counts[m]||0)+1;}
            return {cells:cells.length,groups:g.groups.length,rooms:enclosedRooms().length,counts,ms:guessMaterials()};
        });
        assert.ok(stats.cells>20,`${map}: guesses fill cells`);
        assert.ok(stats.groups>=6&&stats.groups<=12);
        assert.ok(stats.ms<2000,`${map}: ${stats.ms}ms`);
        if(map==='azurite_pointe.dd2vtt')assert.ok(stats.counts.water>0,'visible water receives water guesses');
        assert.ok(await page.evaluate(()=>enclosedRooms().flat().filter(k=>guessState().samples[k]).every(k=>!!level().cells[k]?.floor)),'room samples use floor field');
        if(map==='prison_01.dd2vtt')assert.ok(await page.evaluate(()=>Object.values(level().cells).filter(c=>c.floor).length>150),'interior has substantial floor coverage');
        // Capture the actual tracing canvas twice, then place the two captures side by side.
        await page.evaluate(async()=>{
            const wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            const pair=document.createElement('canvas');pair.id='guess-comparison';pair.width=1600;pair.height=850;
            const p=pair.getContext('2d'),v=state.view,w=state.grid.cols*v.zoom,h=state.grid.rows*v.zoom;
            const height=Math.min(800,760),width=Math.min(790,w*height/h),heightFit=width*h/w;
            const saved={hide:v.hideCells,opacity:v.opacity,grid:v.showGrid};v.opacity=1;v.showGrid=false;
            p.fillStyle='#141a20';p.fillRect(0,0,1600,850);p.font='20px system-ui';p.fillStyle='#edf2f4';
            p.fillText(level().source+' | picture',15,30);p.fillText('Guessed floors & terrain',815,30);
            v.hideCells=true;redraw();await wait();p.drawImage(canvas,v.x,v.y,w,h,5,50,width,heightFit);
            v.hideCells=false;redraw();await wait();p.drawImage(canvas,v.x,v.y,w,h,805,50,width,heightFit);
            Object.assign(v,{hideCells:saved.hide,opacity:saved.opacity,showGrid:saved.grid});redraw();
            pair.style.cssText='position:fixed;inset:0;z-index:100;background:#141a20';document.body.append(pair);
        });
        await page.locator('#guess-comparison').screenshot({path:resolve(screenshotDir,map.replace('.dd2vtt','-comparison.png'))});
        await page.locator('#guess-comparison').evaluate(el=>el.remove());
        pass(`${map}: ${stats.cells} cells, ${stats.rooms} rooms, ${stats.groups} groups, ${Math.round(stats.ms)} ms; ${JSON.stringify(stats.counts)}`);
        await page.click('#guess-props');
        const propStats=await page.evaluate(()=>({count:level().props.length,groups:guessState().propGroups.length,labels:level().props.reduce((a,p)=>(a[p.id]=(a[p.id]||0)+1,a),{}),ms:guessProps()}));
        assert.ok(propStats.count>0,`${map}: candidate objects found`);
        assert.ok(propStats.ms<3000,`${map}: props ${propStats.ms} ms`);
        assert.ok(await page.evaluate(()=>level().props.every(p=>p.reviewed===false&&p.bounds.length===4&&p.color.length===3&&Number.isFinite(p.rotation)&&p.scale>0&&(p.id==='unknown'||PROP_IDS.includes(p.id)))));
        assert.ok((await scene()).floors[0].props?.every(p=>Object.keys(p).sort().join(',')==='id,rotation,scale,x,y'&&p.id!=='unknown')??true);
        await page.evaluate(async()=>{
            const v=state.view,saved={...v};v.opacity=1;v.showGrid=false;v.hideCells=true;clearSelection();redraw();
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            const pair=document.createElement('canvas');pair.id='prop-comparison';pair.width=1800;pair.height=1000;
            const c=pair.getContext('2d'),scale=Math.min(860/state.grid.cols,920/state.grid.rows),w=state.grid.cols*scale,h=state.grid.rows*scale;
            c.fillStyle='#141a20';c.fillRect(0,0,1800,1000);c.fillStyle='#fff';c.font='20px system-ui';
            c.fillText(level().source+' | picture',15,30);c.fillText('Detected props with labels ('+level().props.length+')',915,30);
            c.drawImage(level().img,15,55,w,h);
            // Capture the live rendering including imported geometry, prop markers and labels.
            c.drawImage(canvas,v.x,v.y,state.grid.cols*v.zoom,state.grid.rows*v.zoom,915,55,w,h);
            Object.assign(v,saved);redraw();pair.style.cssText='position:fixed;inset:0;z-index:100;width:1600px;height:889px';document.body.append(pair);
        });
        await page.locator('#prop-comparison').screenshot({path:resolve(propDir,map.replace('.dd2vtt','-props.png'))});
        await page.locator('#prop-comparison').evaluate(el=>el.remove());
        pass(`${map}: ${propStats.count} props, ${propStats.groups} groups, ${Math.round(propStats.ms)} ms; ${JSON.stringify(propStats.labels)}`);
    }
    // Exercise group review and object move/delete through the real UI.
    const beforeProps=await scene();
    await page.selectOption('[aria-label="Prop for group 1"]','barrel');
    assert.ok(await page.evaluate(()=>level().props.filter(p=>p.group===0).every(p=>p.id==='barrel'&&p.reviewed)));
    await keyboard('Control+z');assert.deepEqual(await scene(),beforeProps);
    await page.getByLabel('Show prop group 1',{exact:true}).check();
    assert.ok(await page.evaluate(()=>guessState().propGroups[0].show));
    await page.click('#tool-prop');
    const visibleProp=await page.evaluate(()=>{const p=level().props.find(p=>{const x=state.view.x+p.x*state.view.zoom,y=state.view.y+p.y*state.view.zoom;return x>180&&x<1300&&y>260&&y<930;});return [p.x,p.y];});
    await page.mouse.click(...await gridPoint(...visibleProp));assert.equal(await count(),1);
    await drag(visibleProp,[visibleProp[0]+.5,visibleProp[1]+.5]);
    assert.ok(await page.evaluate(()=>[...state.selection][0].reviewed));
    const moved=await page.evaluate(()=>({...[...state.selection][0]}));
    await page.click('#guess-props');
    assert.ok(await page.evaluate(p=>level().props.some(q=>q.x===p.x&&q.y===p.y&&q.reviewed),moved));
    await page.mouse.click(...await gridPoint(moved.x,moved.y));await keyboard('Delete');
    const deleted=await scene();await page.click('#guess-props');
    assert.ok(await page.evaluate(p=>!level().props.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<.3),moved));
    await keyboard('Control+z');assert.deepEqual(await scene(),deleted);
    await keyboard('Control+z');assert.ok(await page.evaluate(p=>level().props.some(q=>q.x===p.x&&q.y===p.y),moved));
    await page.click('#accept-props');assert.ok(await page.evaluate(()=>level().props.every(p=>p.reviewed)));
    const acceptedProps=await scene();await page.click('#guess-props');
    assert.ok(await page.evaluate(()=>level().props.filter(p=>p.reviewed).length>0));
    await page.evaluate(json=>fromScene(json,true),JSON.stringify(acceptedProps));assert.deepEqual(await scene(),acceptedProps);
    pass('prop group dropdown, show, move, deletion tombstones, re-guess protection, Accept all, undo and portable prop shape');
    const synthetic=await page.evaluate(async()=>{
        const saved=toScene(),picture=level().img,source=level().source;
        const test=document.createElement('canvas');test.width=480;test.height=320;
        const c=test.getContext('2d');c.fillStyle='#808080';c.fillRect(0,0,480,320);
        // Isolated compact objects, a long thin line and a huge patch: only compact blobs survive.
        c.fillStyle='#804020';c.beginPath();c.arc(90,90,13,0,Math.PI*2);c.fill();c.fillRect(205,78,25,25);
        c.fillStyle='#306025';c.beginPath();c.arc(330,90,30,0,Math.PI*2);c.fill();
        c.fillStyle='#fff';c.fillRect(10,155,450,1);c.fillRect(10,200,450,110);
        const img=new Image();img.src=test.toDataURL();await img.decode();
        state.grid={cols:12,rows:8,cell_ft:5};Object.assign(level(),{img,cells:{},walls:[],portals:[],lights:[],props:[],converter:undefined});barrierCache=null;
        guessMaterials(false);
        // Explicit flat background isolates the segmentation check from floor classification.
        for(const p of Object.values(guessState().samples)){p.rgb=[128,128,128];p.inside=false;}
        const ms=guessProps(),n=level().props.length,ids=level().props.map(p=>p.id);
        const before=toScene();guessProps();const stable=toScene()===before;
        const portable=JSON.parse(toScene()).floors[0].props||[];
        level().img=picture;pictureCache.set(source,picture);fromScene(saved,true);
        return {ms,n,ids,stable,portable};
    });
    assert.equal(synthetic.n,3);assert.ok(synthetic.ids.includes('tree'));
    assert.ok(synthetic.stable);assert.ok(synthetic.ms<3000);
    assert.ok(synthetic.portable.every(p=>p.id!=='unknown'&&Object.keys(p).length===5));
    pass('synthetic image: 3 compact objects; thin line and huge patch ignored; repeated guessing stable; unknown excluded from portable props');
    const guessChecks=await page.evaluate(()=>{
        const initial=toScene(),g=guessState(),k=g.groups[0].keys[0];
        setTool('floor');state.toolOptions.floor='marble';paintKeys([k]);
        const edited=JSON.stringify(level().cells[k]);guessMaterials();
        const survives=JSON.stringify(level().cells[k])===edited&&!guessState().unreviewed[k];
        guessState().overwrite=true;
        const beforeRun=toScene();guessMaterials();const changed=toScene()!==beforeRun;undo();const undoes=changed&&toScene()===beforeRun;
        const beforeGroup=toScene();assignGroup(0,'terrain:water');
        const groupAll=guessState().groups[0].keys.every(key=>level().cells[key]?.terrain==='water'&&!level().cells[key].floor);
        undo();const groupUndo=toScene()===beforeGroup;
        guessState().overwrite=true;guessMaterials();const overwrites=level().cells[k]?.floor!=='marble';
        acceptGuesses();const accepted=Object.keys(guessState().unreviewed).length===0;
        guessState().groups[0].show=true;guessState().showUnreviewed=false;
        const saved=toScene();fromScene(saved,true);const persisted=toScene()===saved;
        fromScene(initial,true);const first=guessState().groups[0].keys[0];
        state.selection=new Set([first]);setLayer('cell');state.selection=new Set([first]);removeSelected();guessMaterials();
        const clearedSurvives=!level().cells[first];
        const final=JSON.parse(toScene());
        const valid=final.format==='geez2vtt'&&final.version===1&&Object.values(final.floors[0].cells).every(c=>Object.keys(c).every(f=>['floor','terrain','elevation'].includes(f)));
        return {survives,undoes,groupAll,groupUndo,overwrites,accepted,persisted,clearedSurvives,valid};
    });
    for(const [check,ok] of Object.entries(guessChecks)){assert.ok(ok,check);pass('guess review: '+check);}
    await page.selectOption('[aria-label="Material for group 1"]','floor:tile');
    assert.ok(await page.evaluate(()=>guessState().groups[0].keys.every(k=>level().cells[k]?.floor==='tile'&&!level().cells[k]?.terrain)));
    await page.selectOption('[aria-label="Material for group 1"]','');
    assert.ok(await page.evaluate(()=>guessState().groups[0].keys.every(k=>!level().cells[k]?.floor&&!level().cells[k]?.terrain)));
    pass('group dropdown assigns floor and empty choices to every member');
    const largeGuess=await page.evaluate(()=>{
        const saved=toScene();state.grid={cols:50,rows:40,cell_ft:5};barrierCache=null;
        const ms=guessMaterials();fromScene(saved,true);return ms;
    });
    assert.ok(largeGuess<2000);pass(`50×40 guessing under 2 s: ${Math.round(largeGuess)} ms`);
    const voidCheck=await page.evaluate(async()=>{
        const saved=toScene(),source=level().source,picture=level().img;
        const test=document.createElement('canvas');test.width=test.height=80;
        const c=test.getContext('2d');c.fillStyle='#000';c.fillRect(0,0,80,80);
        c.fillStyle='#268dbe';c.fillRect(20,20,40,40);
        const img=new Image();img.src=test.toDataURL();await img.decode();
        state.grid={cols:8,rows:8,cell_ft:5};Object.assign(level(),{img,cells:{},walls:[],portals:[],converter:undefined});barrierCache=null;
        guessMaterials();const cells=Object.entries(level().cells);
        const ok=cells.length===16&&cells.every(([k,v])=>{const [x,y]=k.split(',').map(Number);return x>=2&&x<6&&y>=2&&y<6&&v.terrain==='water';});
        // Restore the real tracing picture before fromScene refreshes its picture cache.
        level().img=picture;pictureCache.set(source,picture);fromScene(saved,true);return ok;
    });
    assert.ok(voidCheck);pass('black void stays empty while a visible water patch is guessed');
    console.log(`Comparison screenshots: ${screenshotDir}`);
    console.log(`Prop comparison screenshots: ${propDir}`);
    console.log('VISUAL ACCURACY (manual estimates, not ground truth): forestroad: 161 candidates versus roughly 55–75 distinct trees/shrubs/logs/boulders; canopies fragment and flowers/ground texture become bushes. desertedhouse0: 9 candidates versus roughly 35–45 obvious crates, rubble objects and furniture; low-contrast wooden objects are mostly missed.');
    console.log('LABEL LIMITS: market furniture is often labelled barrel/bed; prison bloodstains become table/barrel; grey rocks in warm lighting become unknown; autumn foliage may become campfire. These are review candidates, not reliable semantic recognition.');
    assert.deepEqual(errors,[]);pass('no page errors');
    console.log(`\n${results.length} checks passed.`);
} finally {
    await browser.close();
}
