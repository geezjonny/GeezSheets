import { toTable3d } from './geez2vtt.js';
import { createInkRenderer, drawDoor as inkDoor, drawProp as inkProp, drawLighting } from './geez-ink.js';
// GeezTabletop bridge: grid-unit helpers and cached canvas rendering. No Firebase dependency.
export const DOOR_KINDS = ['wood', 'iron', 'double', 'portcullis', 'bars', 'secret', 'arch', 'curtain', 'window'];
export function doorRules(kind = 'wood', open = false) {
    const closed = kind === 'arch' ? false : kind === 'window' ? true : !open;
    return { closed, toggle: !['window', 'arch'].includes(kind), sight: closed && !['window', 'bars', 'portcullis'].includes(kind), pass: !closed };
}
export function elevationEdges(elevation = {}) {
    const edges = new Map();
    for (const [k, h] of Object.entries(elevation)) {
        const [x, y] = k.split('_').map(Number);
        for (const [nx, ny, edge] of [[x-1,y,[x,y,x,y+1]], [x+1,y,[x+1,y,x+1,y+1]], [x,y-1,[x,y,x+1,y]], [x,y+1,[x,y+1,x+1,y+1]]]) {
            if (+h !== +(elevation[`${nx}_${ny}`] || 0)) edges.set(edge.join(','), edge);
        }
    }
    return [...edges.values()];
}
export function liftedRoof(roofs = {}, viewers = []) {
    const lifted = new Set(), queue = [];
    for (const p of viewers) {
        const k = `${Math.floor(p.x)}_${Math.floor(p.y)}`;
        if (roofs[k] && !lifted.has(k)) { lifted.add(k); queue.push(k); }
    }
    for (let i = 0; i < queue.length; i++) {
        const [x,y] = queue[i].split('_').map(Number);
        for (const k of [`${x-1}_${y}`,`${x+1}_${y}`,`${x}_${y-1}`,`${x}_${y+1}`]) if (roofs[k] && !lifted.has(k)) { lifted.add(k); queue.push(k); }
    }
    return lifted;
}
// Quadratic midpoint smoothing retains both endpoints and never overshoots its control polygon.
export function smoothPath(points = []) {
    if (points.length < 2) return [];
    const out = [['M', ...points[0]]];
    for (let i=1;i<points.length-1;i++) out.push(['Q', ...points[i], (points[i][0]+points[i+1][0])/2, (points[i][1]+points[i+1][1])/2]);
    out.push(['L', ...points.at(-1)]); return out;
}
export function onStairs(stair, x, y) {
    const w=stair.w||1,h=stair.h||2,angle=-(stair.rot||0)*Math.PI/180;
    const dx=x-stair.x-w/2,dy=y-stair.y-h/2;
    return Math.abs(dx*Math.cos(angle)-dy*Math.sin(angle))<=w/2+1e-9 && Math.abs(dx*Math.sin(angle)+dy*Math.cos(angle))<=h/2+1e-9;
}
export function floorList(meta) { return [...new Set((Array.isArray(meta?.floors) ? meta.floors : Object.values(meta?.floors || {0:0})).map(Number).filter(Number.isFinite))].sort((a,b)=>a-b); }

// Keep guessed tiles until the referenced image has decoded. Failures are cached too.
export function pictureCache(load, changed, warn = (...args) => console.warn(...args)) {
    const entries = new Map();
    return descriptor => {
        if (!descriptor) return null;
        const key = JSON.stringify(descriptor);
        if (!entries.has(key)) {
            entries.set(key, null);
            Promise.resolve().then(async () => {
                const r = descriptor.rect;
                if (!Array.isArray(r) || r.length !== 4 || !r.every(Number.isFinite) || r[2] <= 0 || r[3] <= 0 || !descriptor.dd2vtt) throw Error('Invalid picture descriptor');
                const scene = await load(descriptor.dd2vtt);
                if (!scene?.img) throw Error('Picture unavailable');
                entries.set(key, {img: scene.img, rect: r}); changed();
            }).catch(error => warn('GeezTabletop picture unavailable; using floor tiles', descriptor.dd2vtt, error));
        }
        return entries.get(key);
    };
}

// Path and decal kinds from GeezTabletop's paint layer (and this page's own Road/Stream/Blood/Scorch/Rubble).
export const PATH_COLORS = {road:'#877655', cobble_road:'#7d7a72', dirt_path:'#7a6448', gravel:'#8b857a', mud:'#5b4632', stream:'#497b91', river:'#3f6f8a'};
const DECAL_COLORS = {blood:'#7f1d1d', blood_splatter:'#7f1d1d', blood_pool:'#6b1414', scorch:'#171717', ash:'#3f3f46', rubble:'#78716c',
    moss:'#4d6b2f', cracks:'#2a2622', puddle:'#4a6f86', leaves:'#8a5a2b', stains:'#4b3b2a', rune_circle:'#7c6fd6', footprints:'#3b3127'};
export function createBridge(a) {
    let data = {}, traps = {}, trapSnapshot = '', subKey = '', off = [], floor = 0, revision = 0, weatherFrame = 0, fogPreview = false;
    const cache = new Map(), scenes = new Map();
    const current = () => a.db().view.battleId;
    const redraw = () => { if (a.db().view.level === 'VTT') a.render(); };
    const invalidate = () => { revision++; cache.clear(); redraw(); };
    let sceneText='';
    function watch(bid) {
        if(a.gaia){
            const source=a.scene(bid),text=JSON.stringify(source||null),key=a.camp()+'/'+bid;
            if(key===subKey && text===sceneText)return;
            if(key!==subKey)floor=0;off.forEach(f=>f());off=[];
            subKey=key;sceneText=text;data=source?toTable3d(source):{};cache.clear();scenes.clear();
            if(source) off.push(a.live.on(a.path('table3d/'+bid+'/doors'),v=>{data.doors={...toTable3d(source).doors};for(const [f,states] of Object.entries(v||{}))data.doors[f]={...data.doors[f],...states};redraw();}));
            return;
        }
        const key = `${a.camp()}/${bid}`;
        if (key === subKey) return;
        off.forEach(f=>f()); off=[]; subKey=key; data={}; traps={}; trapSnapshot=''; cache.clear(); scenes.clear(); floor=0;inspectId=null;
        off.push(a.live.on(a.path(`table3d/${bid}`), v=>{
            if (subKey !== key || JSON.stringify(v || {}) === JSON.stringify(data)) return;
            const next = v || {};
            for (const f of new Set([...Object.keys(next.floors||{}),...Object.keys(data.floors||{})])) if (JSON.stringify(next.floors?.[f]) !== JSON.stringify(data.floors?.[f])) { for(const k of cache.keys()) if(k.startsWith(`${f}:`)) cache.delete(k); }
            data=next; redraw();
        }));
        if (!a.player) off.push(a.live.on(`table3d/${a.camp()}/${bid}/traps`, v=>{ const snapshot=JSON.stringify(v||{}); if(subKey!==key || snapshot===trapSnapshot)return; trapSnapshot=snapshot; traps=v||{}; redraw(); }));
    }
    function token(tid, bid=current()) {
        const t=a.db().things[tid], info=bid===current() && data.tokenInfo?.[tid];
        return t || (info ? {id:tid, type:'npc', name:info.name||tid, traits:{...info, avatar:a.avatar(info.name, info.color), stub:true}} : null);
    }
    function tokens(bid=current()) {
        const stored=a.db().battles[bid]?.tokens||{}, moves=a.moves(bid);
        return Object.fromEntries(Object.entries({...stored,...moves}).map(([id,p])=>[id,{...stored[id],...p}]));
    }
    let emptyFloor=null;
    function shownFloor() {
        if (a.player) {
            const own=Object.entries(tokens()).find(([id])=>{const t=token(id);return t?.traits.pc && t.name===a.name();});
            if (own) return Number(own[1].f)||0;
        }
        const list=floorList(data.meta);
        if (!a.player && emptyFloor!==null && floor===emptyFloor && !list.includes(floor)) return floor;
        return data.meta && !list.includes(floor) ? (list.includes(0)?0:list[0]??0) : floor;
    }
    const onFloor = p => (Number(p?.f)||0) === shownFloor();
    const layer = (f=shownFloor()) => data.floors?.[f] || {};
    function scene() {
        if (!data.meta?.size) return null;
        const {x,y}=data.meta.size, key=`${x}:${y}`;
        if (!scenes.has(key)) {
            const img=document.createElement('canvas'),ppg=Math.max(1,Math.floor(Math.min(70,2048/Math.max(+x,+y)))); img.width=Math.max(1,+x)*ppg; img.height=Math.max(1,+y)*ppg;
            const ctx=img.getContext('2d'); ctx.fillStyle='#16181d'; ctx.fillRect(0,0,img.width,img.height);
            scenes.set(key,{img,w:img.width,h:img.height,ppg,walls:[],doors:[],lights:[],blank:true,table3d:true});
        }
        return scenes.get(key);
    }
    function geometry(floor=shownFloor()) {
        const f=layer(floor), state=data.doors?.[floor]||{};
        return {walls:Object.entries(f.walls||{}).map(([key,w])=>({key,src:'table3d',...w})), doors:Object.entries(f.doors||{}).map(([key,d])=>({key,id:key,src:'table3d',...d,...doorRules(d.kind||d.mat,state[key]==='open')}))};
    }
    function lights() {
        const f=layer(), out=Object.values(f.lights||{}).map(l=>({...l,src:'table3d'}));
        if (!Object.keys(f.lights||{}).length) for (const o of Object.values(f.props||{})) { const d=a.propDef(o.p); if(d?.light && !(a.player&&o.hidden)) out.push({x:o.x,y:o.y,range:d.light.range||4}); }
        const s=a.ui.scene;
        if(s) for(const [id,p] of Object.entries(tokens())) if(onFloor(p)&&p.light?.on&&!(a.player&&p.hidden)) out.push({key:`token:${id}`,src:'token',x:p.x*s.w/s.ppg,y:p.y*s.h/s.ppg,range:+p.light.range||4});
        return out;
    }
    function annotations(ctx,f,g) {
        ctx.save(); ctx.lineCap='round';ctx.lineJoin='round';
        for(const p of Object.values(f.paths||{})) {
            ctx.strokeStyle='#211b15';ctx.lineWidth=(+p.width||1)*g;ctx.beginPath();
            for(const [op,...n] of smoothPath(p.points)) ctx[({M:'moveTo',Q:'quadraticCurveTo',L:'lineTo'})[op]](...n.map(v=>v*g));ctx.stroke();
        }
        for(const o of Object.values(f.decals||{})) {
            ctx.save();ctx.translate(o.x*g,o.y*g);ctx.rotate((o.rot||0)*Math.PI/180);ctx.scale((o.s||1)*g,(o.s||1)*g);
            ctx.fillStyle='#211b15';ctx.globalAlpha=o.kind==='rune_circle'||o.kind==='footprints'?.6:.85;
            for(let i=0;i<7;i++){ctx.beginPath();ctx.ellipse(Math.sin(i*13)*.3,Math.cos(i*7)*.25,.09+i*.012,.05+i*.006,i,0,Math.PI*2);ctx.fill();}ctx.restore();
        }
        for(const o of Object.values(f.labels||{})) {
            ctx.save();ctx.translate(o.x*g,o.y*g);ctx.rotate((o.rot||0)*Math.PI/180);ctx.font=`italic ${(o.size||1)*g*.35}px Georgia,serif`;ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#82704f';ctx.fillStyle='#211b15';ctx.strokeText(o.text||'',0,0);ctx.fillText(o.text||'',0,0);ctx.restore();
        }
        ctx.restore();
    }
    function inkScene(ed={},geo=geometry()) {
        const original=a.gaia?a.scene(current()):null, f=layer(), source=original?.floors.find(v=>v.level===shownFloor());
        const cells={...(source?.cells||{})};
        for(const [k,id] of Object.entries(f.paint||{})) if(!cells[k.replace('_',',')]) cells[k.replace('_',',')]={floor:id,elevation:f.elevation?.[k]||0};
        for(const [k,id] of Object.entries(ed.paint||{})) cells[k.replace('_',',')]={...cells[k.replace('_',',')],floor:id};
        const props=Object.values({...f.props,...ed.props}).filter(o=>!(a.player&&o.hidden)).map(o=>({id:o.p,x:o.x,y:o.y,rotation:o.rot||0,scale:o.s||1}));
        for(const [key,o] of Object.entries(f.stairs||{}))if(!f.props?.[key])props.push({id:o.kind||'stairs',x:o.x+(o.w||1)/2,y:o.y+(o.h||2)/2,rotation:o.rot||0,scale:1});
        const walls=geo.walls.filter(w=>!ed.hideWalls?.[w.key]).map(w=>({a:[w.x1,w.y1],b:[w.x2,w.y2],material:w.mat||'stone'}));
        const portals=geo.doors.filter(d=>!ed.hideDoors?.[d.key]).map(d=>({a:[d.x1,d.y1],b:[d.x2,d.y2],material:d.mat||'wood',kind:['window','arch'].includes(d.kind)?d.kind:'door',closed:true}));
        return {format:'geez2vtt',version:1,style:'ink',name:original?.name||current(),grid:{cols:+data.meta.size.x,rows:+data.meta.size.y,cell_ft:data.meta.cell_ft||5},floors:[{level:shownFloor(),name:'Floor',elevation:0,cells,walls,props,lights:[],portals}]};
    }
    let activeInk=null, memoryKey='', memoryReset=null, memoryTimer;
    function drawBase(ctx,s,ed={},geo=geometry()) {
        if(!data.meta)return;
        const source=inkScene(ed,geo),key=JSON.stringify(source);
        let entry=cache.get(key);
        if(!entry){entry=createInkRenderer(source,{ppg:s.ppg});cache.set(key,entry);while(cache.size>4)cache.delete(cache.keys().next().value);}
        if(activeInk&&activeInk!==entry&&activeInk.level===entry.level)entry.restoreExplored(activeInk.exploredCells());
        activeInk=entry;entry.drawBase(ctx,s.w,s.h);
        annotations(ctx,layer(),s.ppg);annotations(ctx,ed,s.ppg);
    }
    function drawDoor(ctx,d,g) { inkDoor(ctx,d,g); }
    function drawProp(ctx,p,g) { if(!(a.player&&p.hidden))inkProp(ctx,p,g); }
    function drawFog(ctx,s,vis,options={}) {
        if(!activeInk)return;
        const key=['geez.ink.explored',a.camp(),current(),shownFloor(),a.name()||'party'].join('.'),reset=options.reset||0;
        if(key!==memoryKey||reset!==memoryReset){clearTimeout(memoryTimer);memoryKey=key;memoryReset=reset;activeInk.resetExplored();try{const old=JSON.parse(localStorage.getItem(key)||'null');if(old?.reset===reset)activeInk.restoreExplored(old.cells);}catch{}}
        activeInk.drawFog(ctx,vis,{...options,width:s.w,height:s.h});
        if(vis&&(!options.gm||options.preview)){clearTimeout(memoryTimer);const ink=activeInk;memoryTimer=setTimeout(()=>{try{localStorage.setItem(key,JSON.stringify({reset,cells:ink.exploredCells()}));}catch{}},1500);}
    }
    let lifted=new Set();
    function roofs(ctx,s,viewers) {
        const f=layer(),g=s.ppg;lifted=liftedRoof(f.roofs,a.player?viewers.filter(v=>v.t?.name===a.name()):viewers);
        ctx.save();ctx.globalAlpha=a.player?1:.22;
        for(const [k,style] of Object.entries(f.roofs||{})) {
            if(a.player&&lifted.has(k)) continue;const [x,y]=k.split('_').map(Number);
            ctx.fillStyle='#61523c';ctx.fillRect(x*g,y*g,g+.6,g+.6);ctx.strokeStyle='#211b15';ctx.lineWidth=1;ctx.strokeRect(x*g,y*g,g,g);for(let i=0;i<g;i+=6){ctx.beginPath();ctx.moveTo(x*g+i,y*g);ctx.lineTo(x*g,y*g+i);ctx.stroke();}
        }ctx.restore();
    }
    const covered = (x,y) => {const k=`${Math.floor(x)}_${Math.floor(y)}`;return !!layer().roofs?.[k]&&!lifted.has(k);};
    function atmosphere(ctx,s,allLights) { drawLighting(ctx,s.w/s.ppg,s.h/s.ppg,allLights,s.ppg); }
    const weather=document.createElement('canvas');weather.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:20';a.wrapper.appendChild(weather);
    let weatherKey='';
    function startWeather() {
        const nextKey=JSON.stringify([a.db().view.level,current(),data.meta?.weather||a.db().battles[current()]?.weather,matchMedia('(prefers-reduced-motion: reduce)').matches]);
        if(nextKey===weatherKey)return;weatherKey=nextKey;
        cancelAnimationFrame(weatherFrame);weatherFrame=0;weather.style.display=a.db().view.level==='VTT'?'block':'none';
        const w=data.meta?.weather||a.db().battles[current()]?.weather||{},kind=w.kind;
        weather.width=700;weather.height=500;const x=weather.getContext('2d');
        if(a.db().view.level!=='VTT'||!kind||kind==='Clear')return;
        const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;let last=0;
        function frame(t){if(t-last>65||reduced){last=t;x.clearRect(0,0,700,500);x.strokeStyle='rgba(33,27,21,.4)';x.fillStyle='#211b15';
            for(let i=0;i<65;i++){const speed=kind==='Rain'?180:25,py=((i*137+(reduced?0:t*.001*speed))%530)-15,px=((i*83+py*(+w.wind||0))%730)-15;x.beginPath();if(kind==='Rain'){x.moveTo(px,py);x.lineTo(px-3-(+w.wind||0)*7,py+12);x.stroke();}else{x.ellipse(px,py,kind==='Leaves'?3:1.5,1.5,i,0,Math.PI*2);x.fill();}}}
            if(!reduced)weatherFrame=requestAnimationFrame(frame);
        }frame(0);
    }
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',startWeather);
    // A compact panel uses existing controls and places annotations with one click or a short path chain.
    const panel=document.createElement('div');panel.className='fixed z-40 bg-slate-950/95 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 flex flex-wrap gap-2 items-center';panel.style.cssText='top:112px;left:78px;max-width:calc(100vw - 100px)';document.body.appendChild(panel);
    panel.addEventListener('pointerdown',e=>e.stopPropagation());let tool='',pathPoints=[],inspectId=null;
    function controls() {
        const v=a.db().view;panel.style.display=v.level==='VTT'?'flex':'none';if(v.level!=='VTT')return;
        const b=a.db().battles[current()]||{},f=shownFloor(),list=floorList(data.meta);
        const select=(id,values,value)=>`<select data-gh="${id}" class="bg-slate-900 border border-slate-700 rounded p-1">${values.map(k=>`<option ${k===value?'selected':''}>${k}</option>`).join('')}</select>`;
        // Floor stepper lives in the breadcrumb (Campaign > Board > ... > map > floor) when the page provides one.
        const isEmpty=!list.includes(f), name=a.esc(data.meta?.floorNames?.[f]||(f<0?`Basement ${-f}`:f===0?'Ground':`Floor ${f+1}`))+(isEmpty?' (empty: attach a map to add it)':'');
        const floorHtml=`<span class="geez-floor-crumb"><span>${name}</span><button data-step="1" aria-label="Floor up" title="Floor up">&#9650;</button><button data-step="-1" aria-label="Floor down" title="Floor down">&#9660;</button></span>`;
        const crumb=document.getElementById('floorCrumb');
        if(crumb){crumb.innerHTML='<span class="text-slate-600 mx-0.5">&rsaquo;</span>'+floorHtml;panel.innerHTML='';}else panel.innerHTML=floorHtml;
        (crumb||panel).querySelectorAll('[data-step]').forEach(btn=>{const step=Number(btn.dataset.step),at=list.indexOf(f);let to=at<0?(step>0?undefined:list.at(-1)):list[at+step];
            // The GM can step one floor past the top or bottom onto an empty floor, to attach a map there.
            if(to===undefined&&!a.player&&data.meta&&at>=0&&list.length)to=step>0?list.at(-1)+1:list[0]-1;
            if(at<0&&step<0)to=f>list.at(-1)?list.at(-1):undefined;if(at<0&&step>0)to=f<list[0]?list[0]:undefined;
            btn.disabled=to===undefined;btn.classList.toggle('opacity-40',btn.disabled);btn.onclick=()=>{
            if(!a.player){floor=to;emptyFloor=list.includes(to)?null:to;redraw();controls();return;}
            if(a.locked())return;const s=a.ui.scene;
            for(const [id,p] of Object.entries(tokens())){const t=token(id);if(!t?.traits.pc||t.name!==a.name()||!onFloor(p))continue;const x=p.x*s.w/s.ppg,y=p.y*s.h/s.ppg;
                const stair=Object.values(layer().stairs||{}).find(o=>+o.to===to&&onStairs(o,x,y));if(stair)a.move(current(),id,{...p,f:to});else a.status('Stand on stairs to change floors');}
        };});
        if(a.player)return;
        if(inspectId && tokens()[inspectId]) {
            const p=tokens()[inspectId];
            panel.insertAdjacentHTML('beforeend',`<span class="border-l border-slate-700 pl-2">${a.esc(token(inspectId)?.name||inspectId)}</span><label><input data-light-on type="checkbox" ${p.light?.on?'checked':''}> Light</label><label><input data-light-range type="number" min="1" max="100" value="${+p.light?.range||4}" class="w-12 bg-slate-900 border border-slate-700 rounded"> cells</label><button data-inspect-close title="Close token">Close</button>`);
            const write=()=>a.move(current(),inspectId,{...p,light:{on:panel.querySelector('[data-light-on]').checked,range:Math.max(1,Number(panel.querySelector('[data-light-range]').value)||4)}});
            panel.querySelector('[data-light-on]').onchange=write;panel.querySelector('[data-light-range]').onchange=write;
            panel.querySelector('[data-inspect-close]').onclick=()=>{inspectId=null;controls();};
        }
        if(!data.meta){panel.insertAdjacentHTML('beforeend',select('time',['day','dawn','dusk','night'],b.time||'day')+select('weather',['Clear','Rain','Snow','Leaves','Ash'],b.weather?.kind||'Clear')+'<label>Wind <input data-gh="wind" type="range" min="0" max="1" step=".1" class="w-12" value="'+(b.weather?.wind||0)+'"></label>');}
        panel.insertAdjacentHTML('beforeend',select('tool',['Details','Label','Blood','Scorch','Rubble','Road','Stream'],tool||'Details')+(pathPoints.length?'<button data-finish>Finish path</button>':''));
        panel.querySelectorAll('[data-gh]').forEach(el=>el.onchange=()=>{const k=el.dataset.gh;if(k==='tool'){tool=el.value==='Details'?'':el.value;pathPoints=[];a.status(tool?'Click the map to place '+tool.toLowerCase():'Ready');return;}const battle=(a.db().battles[current()]||={tokens:{}});if(k==='time')battle.time=el.value;else battle.weather={kind:k==='weather'?el.value:b.weather?.kind||'Clear',wind:k==='wind'?+el.value:b.weather?.wind||0};a.changed();});
        panel.querySelector('[data-finish]')?.addEventListener('click',()=>finishPath());
    }
    function finishPath(){if(pathPoints.length<2){a.status('Pick at least two path points');return;}const ed=a.edits(current());(ed.paths||={})[a.uid('path')]={f:shownFloor(),kind:tool.toLowerCase(),width:2,points:pathPoints};pathPoints=[];tool='';a.changed();}
    a.viewport.addEventListener('pointerdown',e=>{
        if(a.player||!tool||a.db().view.level!=='VTT'||e.button!==0||e.target.closest('button,input,select,label'))return;
        e.stopImmediatePropagation();const p=a.content(e.clientX,e.clientY),g=a.ui.scene.ppg,x=+(p.x/g).toFixed(2),y=+(p.y/g).toFixed(2),ed=a.edits(current());
        if(tool==='Label'){const text=prompt('Label');if(text)(ed.labels||={})[a.uid('label')]={x,y,text,f:shownFloor(),size:1,rot:0};tool='';a.changed();}
        else if(['Road','Stream'].includes(tool)){pathPoints.push([x,y]);controls();a.status('Pick another point, then Finish path');}
        else{(ed.decals||={})[a.uid('decal')]={x,y,kind:tool.toLowerCase(),s:1,rot:0,f:shownFloor()};tool='';a.changed();}
    },true);
    document.addEventListener('keydown',e=>{if(!a.gaia||a.db().view.level!=='VTT'||!['PageUp','PageDown'].includes(e.key)||e.target.closest('input,textarea,select'))return;e.preventDefault();(document.getElementById('floorCrumb')||panel).querySelector('[data-step="'+(e.key==='PageUp'?1:-1)+'"]')?.click();});
    a.viewport.addEventListener('click',e=>{if(!a.gaia||a.player||!a.ui.scene||a.ui.mode!=='pan'||e.target.closest('button,input,select,label'))return;const p=a.content(e.clientX,e.clientY),g=a.ui.scene.ppg;const stair=Object.values(layer().stairs||{}).find(o=>onStairs(o,p.x/g,p.y/g));if(stair&&floorList(data.meta).includes(stair.to)){floor=stair.to;redraw();}});
    return {emptyFloor:()=>!a.player&&emptyFloor!==null&&shownFloor()===emptyFloor?emptyFloor:null,fogPreview:()=>fogPreview,setFogPreview(v){fogPreview=!!v;redraw();},inspectToken(id){inspectId=id;controls();},watch,scene,geometry,lights,token,tokens,onFloor,floor:shownFloor,layer,meta:()=>data.meta,traps:()=>traps,invalidate,drawBase,drawDoor,drawProp,drawFog,annotations,roofs,covered,atmosphere,controls,startWeather,
        setDoor(d,open,f=shownFloor()){if(!doorRules(d.kind||d.mat).toggle)return false;a.live.set(a.path(`table3d/${current()}/doors/${f}/${d.key}`),open?'open':'closed');return true;},
        saveTrap(id,t){a.live.set(`table3d/${a.camp()}/${current()}/traps/${id}`,t);},
        isTrap(id){return Object.hasOwn(traps,id);},
        reset(){off.forEach(f=>f());off=[];subKey='';data={};traps={};cache.clear();}
    };
}
