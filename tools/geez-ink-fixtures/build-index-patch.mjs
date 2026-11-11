// Read HEAD, write only the requested patch. Never opens the working page for writing.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../',import.meta.url)),gitArgs=['-c','safe.directory='+repo.replaceAll('\\','/').replace(/\/$/,'')];
const head=execFileSync('git',[...gitArgs,'show','HEAD:geez-index.html'],{cwd:repo,encoding:'utf8'});let s=head;
const replace=(a,b)=>{if(!s.includes(a))throw Error('HEAD changed; missing patch anchor: '+a.slice(0,100));s=s.replace(a,b);};
const section=(a,b,v)=>{const start=s.indexOf(a),end=s.indexOf(b,start);if(start<0||end<0)throw Error('missing section');s=s.slice(0,start)+v+s.slice(end);};
replace("        let GH = null, GH_API = null, DT = null;","        let Ink = null, GH = null, GH_API = null, DT = null;");
replace("        import('./js/geez-table3d-layer.js').then(m => {", "        Promise.all([import('./js/geez-ink.js'), import('./js/geez-table3d-layer.js')]).then(([ink, m]) => {\n            Ink = ink;");
replace("            vttCtx.clearRect(0, 0, vttVectorCanvas.width, vttVectorCanvas.height);\n\n            if (level === 'VTT')", "            if (level !== 'VTT') { vttCtx.clearRect(0, 0, vttVectorCanvas.width, vttVectorCanvas.height); inkDrawKey = ''; }\n\n            if (level === 'VTT')");
replace('                mapCtx.drawImage(scene.img, 0, 0);',"                if (!scene.table3d) mapCtx.drawImage(scene.img, 0, 0);");
replace("Not converted yet: attach a .geez2vtt','Attach a scene from the location card or drop it here.","Attach a battle map','Attach or drop a .dd2vtt or .geez2vtt here.");
section('        function drawScene(s, battleId) {','        // ---- Battle-map editing',`        let inkDrawKey = '';
        function drawScene(s, battleId) {
            const geo = sceneGeometry(s, battleId), ed = floorEdits(battleId), lights = sceneLights(s, battleId);
            const key = JSON.stringify([battleId, GH?.floor(), db.things[battleId]?.traits?.scene, geo, ed, lights, s.w, s.h]);
            if (key === inkDrawKey) return; // Token-only moves redraw fog and tokens, preserving static ink.
            inkDrawKey = key;
            vttCtx.clearRect(0, 0, vttVectorCanvas.width, vttVectorCanvas.height);
            GH?.drawBase(vttCtx, s, ed, geo);
            geo.doors.forEach(d => GH?.drawDoor(vttCtx, d, s.ppg));
            GH?.atmosphere(vttCtx, s, lights);
        }

`);
replace("            if (PLAYER || db.view.level !== 'VTT' || !ui.scene) return;\n            markerCtx.clearRect", "            if (PLAYER || GH?.fogPreview() || db.view.level !== 'VTT' || !ui.scene) return;\n            markerCtx.clearRect");
// Battle editor swatches and prop palettes must not initiate texture/PNG requests either.
section('        const swatchImgs = new Map();','        function renderSwatchPanel()',`        function swatchImg() { return null; }
        function swatchPaint(kind, id, g) {
            if (!Ink) return '#82704f';
            const tile = document.createElement('canvas'); tile.width = tile.height = Math.max(16, Math.ceil(g));
            const x = tile.getContext('2d'); x.fillStyle = Ink.PAPER; x.fillRect(0, 0, tile.width, tile.height);
            Ink.drawCell(x, id, 0, 0, tile.width);
            return vttCtx.createPattern(tile, 'repeat');
        }
`);
replace('${sw.texture ? ` url(\'${esc(sw.texture)}\') center/cover` : \'\'}','');
section('        const propImgs = {};','        ui.prop = kept(',`        function propImg(d) {
            if (!Ink) return null;
            const c = document.createElement('canvas'); c.width = c.height = 80;
            const x = c.getContext('2d'); Ink.drawProp(x, {id:d.id,x:1,y:1,scale:.8},40);
            return c;
        }
`);
replace('<img src="${esc(d.src)}" alt="" style="width:40px;height:40px;object-fit:contain">','<canvas data-ink-prop="${esc(d.id)}" width="80" height="80" style="width:40px;height:40px"></canvas>');
replace("            box.querySelectorAll('[data-tag]').forEach", "            box.querySelectorAll('[data-ink-prop]').forEach(c => Ink.drawProp(c.getContext('2d'), {id:c.dataset.inkProp,x:1,y:1,scale:.8},40));\n            box.querySelectorAll('[data-tag]').forEach");
replace('            if (!GEO || !PLAYER) return null;', '            if (!GEO || (!PLAYER && !GH?.fogPreview())) return null;');
replace('            if (!dark && !walls.length && !doors.length) return null;\n','');
section('        function drawVision(scene, vis, battleId) {','        // =====================================================================\n        //  LIVE:',`        function drawVision(scene, vis, battleId) {
            markerCtx.clearRect(0, 0, markerCanvas.width, markerCanvas.height);
            GH?.drawFog(markerCtx, scene, vis, {gm: !PLAYER, preview: GH?.fogPreview(), reset: liveSession.exploredReset?.[battleId] || 0});
        }

`);
replace("const {validateScene}=await import('./js/geez2vtt.js');\n                const scene=validateScene(JSON.parse(await file.text()));", "const {validateScene,dd2vttToScene}=await import('./js/geez2vtt.js');\n                const json=JSON.parse(await file.text());\n                const scene=json.format==='geez2vtt'?validateScene(json):dd2vttToScene(json,file.name.replace(/\\.[^.]+$/, ''));" );
replace("$('dd2vttInput').accept='.geez2vtt,application/json';", "$('dd2vttInput').accept='.dd2vtt,.geez2vtt,application/json';");
replace('>Attach .geez2vtt</button>', '>Attach .dd2vtt / .geez2vtt</button>');
const dir=await mkdtemp(join(tmpdir(),'geez-ink-index-')),old=join(dir,'head.html'),next=join(dir,'ink.html');
await writeFile(old,head);await writeFile(next,s);
const script=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(v=>v.includes('const SAVE_KEY'));if(!script)throw Error('page script missing');await writeFile(join(dir,'page.cjs'),script);execFileSync(process.execPath,['--check',join(dir,'page.cjs')]);
let diff;try{execFileSync('git',['diff','--no-index','--',old,next],{encoding:'utf8'});}catch(e){if(e.status!==1)throw e;diff=e.stdout;}
diff=diff.replace(/^diff --git .+$/m,'diff --git a/geez-index.html b/geez-index.html').replace(/^--- .+$/m,'--- a/geez-index.html').replace(/^\+\+\+ .+$/m,'+++ b/geez-index.html');
const patch=fileURLToPath(new URL('../geez-ink-index.patch',import.meta.url));await writeFile(patch,diff);await writeFile(join(dir,'geez-index.html'),head);
execFileSync('git',['apply','--check',patch],{cwd:dir});
console.log('PASS patch applies to HEAD; patched page module syntax checked. '+diff.split('\n').length+' lines.');
