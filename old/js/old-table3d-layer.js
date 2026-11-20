// GeezTabletop bridge: grid-unit helpers and cached canvas rendering. No Firebase dependency.
export const DOOR_KINDS = ['wood', 'iron', 'double', 'portcullis', 'bars', 'secret', 'arch', 'curtain', 'window'];
export function doorRules(kind = 'wood', open = false) {
    const closed = kind === 'arch' ? false : kind === 'window' ? true : !open;
    return { closed, toggle: !['window', 'arch'].includes(kind), sight: closed && !['window', 'bars', 'portcullis'].includes(kind), pass: kind === 'curtain' || !closed };
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

// Path and decal kinds from GeezTabletop's paint layer (and this page's own Road/Stream/Blood/Scorch/Rubble).
const PATH_COLORS = {road:'#877655', cobble_road:'#7d7a72', dirt_path:'#7a6448', gravel:'#8b857a', mud:'#5b4632', stream:'#497b91', river:'#3f6f8a'};
const DECAL_COLORS = {blood:'#7f1d1d', blood_splatter:'#7f1d1d', blood_pool:'#6b1414', scorch:'#171717', ash:'#3f3f46', rubble:'#78716c',
    moss:'#4d6b2f', cracks:'#2a2622', puddle:'#4a6f86', leaves:'#8a5a2b', stains:'#4b3b2a', rune_circle:'#7c6fd6', footprints:'#3b3127'};
export function createBridge(a) {
    let data = {}, traps = {}, trapSnapshot = '', subKey = '', off = [], floor = 0, revision = 0, weatherFrame = 0;
    const cache = new Map(), scenes = new Map();
    const current = () => a.db().view.battleId;
    const redraw = () => { if (a.db().view.level === 'VTT') a.render(); };
    const invalidate = () => { revision++; cache.clear(); redraw(); };
    function watch(bid) {
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
    function shownFloor() {
        if (a.player) {
            const own=Object.entries(tokens()).find(([id])=>{const t=token(id);return t?.traits.pc && t.name===a.name();});
            if (own) return Number(own[1].f)||0;
        }
        const list=floorList(data.meta);
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
    function drawProp(ctx,o,g) {
        if (a.player && o.hidden) return;
        const d=a.propDef(o.p), im=d&&a.propImg(d); if(!im) return;
        ctx.save(); ctx.globalAlpha=o.hidden ? .45 : 1; ctx.translate(o.x*g,o.y*g); ctx.rotate((o.rot||0)*Math.PI/180);
        ctx.drawImage(im,-d.w*g*(o.s||1)/2,-d.h*g*(o.s||1)/2,d.w*g*(o.s||1),d.h*g*(o.s||1));ctx.restore();
    }
    function annotations(ctx,f,g) {
        ctx.save(); ctx.lineCap='round';ctx.lineJoin='round';
        for(const p of Object.values(f.paths||{})) {
            ctx.strokeStyle=PATH_COLORS[p.kind]||'#877655';ctx.lineWidth=(+p.width||1)*g;ctx.beginPath();
            for(const [op,...n] of smoothPath(p.points)) ctx[({M:'moveTo',Q:'quadraticCurveTo',L:'lineTo'})[op]](...n.map(v=>v*g));ctx.stroke();
        }
        for(const o of Object.values(f.decals||{})) {
            ctx.save();ctx.translate(o.x*g,o.y*g);ctx.rotate((o.rot||0)*Math.PI/180);ctx.scale((o.s||1)*g,(o.s||1)*g);
            ctx.fillStyle=DECAL_COLORS[o.kind]||'#7f1d1d';ctx.globalAlpha=o.kind==='rune_circle'||o.kind==='footprints'?.6:.85;
            for(let i=0;i<7;i++){ctx.beginPath();ctx.ellipse(Math.sin(i*13)*.3,Math.cos(i*7)*.25,.09+i*.012,.05+i*.006,i,0,Math.PI*2);ctx.fill();}ctx.restore();
        }
        for(const o of Object.values(f.labels||{})) {
            ctx.save();ctx.translate(o.x*g,o.y*g);ctx.rotate((o.rot||0)*Math.PI/180);ctx.font=`600 ${(o.size||1)*g*.35}px Inter,sans-serif`;ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#111';ctx.fillStyle='#f1e5c9';ctx.strokeText(o.text||'',0,0);ctx.fillText(o.text||'',0,0);ctx.restore();
        }
        ctx.restore();
    }
    function drawBase(ctx,s) {
        if(!data.meta) return;
        const f=layer(), g=s.ppg, key=`${shownFloor()}:${revision}:${s.w}:${s.h}:${JSON.stringify(a.edits(current()).hideWalls||{})}`;
        let c=cache.get(key);
        if(!c) {
            c=document.createElement('canvas');const scale=Math.min(1,2048/Math.max(s.w,s.h));c.width=Math.ceil(s.w*scale);c.height=Math.ceil(s.h*scale);const x=c.getContext('2d');x.scale(scale,scale);
            for(const [k,id] of Object.entries(f.paint||{})){const [cx,cy]=k.split('_').map(Number);x.fillStyle=a.paint('floor',id,g);x.fillRect(cx*g,cy*g,g+.5,g+.5);}
            for(const [k,h] of Object.entries(f.elevation||{})){const [cx,cy]=k.split('_').map(Number);x.fillStyle=`rgba(${h>0?'255,255,255':'0,0,0'},${Math.min(.5,Math.abs(h)*.13)})`;x.fillRect(cx*g,cy*g,g,g);}
            x.strokeStyle='#151515';x.lineWidth=2;x.beginPath();for(const [x1,y1,x2,y2] of elevationEdges(f.elevation)){x.moveTo(x1*g,y1*g);x.lineTo(x2*g,y2*g);}x.stroke();
            annotations(x,{paths:f.paths,decals:f.decals},g);
            for(const o of Object.values(f.props||{})) drawProp(x,o,g);
            for(const o of Object.values(f.stairs||{})) {
                const w=o.w||1,h=o.h||2,d=a.propDef(o.kind==='ladder'?'ladder':'stairs'),im=d&&a.propImg(d);if(im){x.save();x.translate((o.x+w/2)*g,(o.y+h/2)*g);x.rotate((o.rot||0)*Math.PI/180);x.drawImage(im,-w*g/2,-h*g/2,w*g,h*g);x.restore();continue;}x.save();x.translate((o.x+w/2)*g,(o.y+h/2)*g);x.rotate((o.rot||0)*Math.PI/180);x.fillStyle='#655b4e';x.fillRect(-w*g/2,-h*g/2,w*g,h*g);x.strokeStyle='#d1c5ae';x.lineWidth=2;
                for(let i=0;i<8;i++){x.beginPath();x.moveTo(-w*g/2,(-h/2+h*i/8)*g);x.lineTo(w*g/2,(-h/2+h*i/8)*g);x.stroke();}x.restore();
            }
            annotations(x,{labels:f.labels},g);
            for(const w of geometry().walls.filter(w=>!a.edits(current()).hideWalls?.[w.key])){x.strokeStyle=a.paint('wall',w.mat,g);x.lineWidth=g*.25;x.lineCap='square';x.beginPath();x.moveTo(w.x1*g,w.y1*g);x.lineTo(w.x2*g,w.y2*g);x.stroke();}
            cache.set(key,c);
            while(cache.size>4) cache.delete(cache.keys().next().value);
        }
        ctx.drawImage(c,0,0,s.w,s.h);
    }
    function drawDoor(ctx,d,g) {
        const kind=d.kind||d.mat||'wood', sw=a.swatch('door',['wood','iron','secret'].includes(kind)?d.mat||kind:kind), im=sw.texture&&a.swatchImg(sw.texture), len=Math.hypot(d.x2-d.x1,d.y2-d.y1)*g;
        ctx.save();ctx.translate(d.x1*g,d.y1*g);ctx.rotate(Math.atan2(d.y2-d.y1,d.x2-d.x1));ctx.globalAlpha=d.closed?1:.4;
        if(im?.complete&&im.naturalWidth) ctx.drawImage(im,0,-g*.18,len,g*.36);
        else {ctx.fillStyle=sw.color;ctx.fillRect(0,-g*.11,len,g*.22);}ctx.restore();
    }
    let lifted=new Set();
    function roofs(ctx,s,viewers) {
        const f=layer(),g=s.ppg;lifted=liftedRoof(f.roofs,a.player?viewers.filter(v=>v.t?.name===a.name()):viewers);
        ctx.save();ctx.globalAlpha=a.player?1:.22;
        for(const [k,style] of Object.entries(f.roofs||{})) {
            if(a.player&&lifted.has(k)) continue;const [x,y]=k.split('_').map(Number);
            ctx.fillStyle=style==='thatch'?'#756348':'#494954';ctx.fillRect(x*g,y*g,g+.6,g+.6);ctx.strokeStyle='#27272a';ctx.lineWidth=1;ctx.strokeRect(x*g,y*g,g,g);
        }ctx.restore();
    }
    const covered = (x,y) => {const k=`${Math.floor(x)}_${Math.floor(y)}`;return !!layer().roofs?.[k]&&!lifted.has(k);};
    const atmosphereCanvas=document.createElement('canvas');
    function atmosphere(ctx,s,allLights) {
        const b=a.db().battles[current()]||{}, time=data.meta?.time||b.time||'day',color=({dawn:'rgba(223,147,90,.19)',dusk:'rgba(133,80,130,.26)',night:'rgba(17,33,83,.48)'})[time];
        if(!color) return;
        const c=atmosphereCanvas,k=Math.min(1,1024/Math.max(s.w,s.h));c.width=Math.ceil(s.w*k);c.height=Math.ceil(s.h*k);const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,c.width,c.height);x.globalCompositeOperation='destination-out';
        for(const l of allLights){const r=l.range*s.ppg*k;if(!(r>0))continue;const cx=l.x*s.ppg*k,cy=l.y*s.ppg*k,grad=x.createRadialGradient(cx,cy,0,cx,cy,r);grad.addColorStop(0,'#000');grad.addColorStop(.65,'#000');grad.addColorStop(1,'transparent');x.fillStyle=grad;x.fillRect(cx-r,cy-r,r*2,r*2);}ctx.drawImage(c,0,0,s.w,s.h);
    }
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
        function frame(t){if(t-last>65||reduced){last=t;x.clearRect(0,0,700,500);x.strokeStyle='rgba(185,215,235,.3)';x.fillStyle=({Leaves:'#aa7b44',Ash:'#aaa',Snow:'#eee'})[kind]||'#bfd4e4';
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
        panel.innerHTML=`<button data-step="-1">Floor down</button><span>${a.esc(data.meta?.floorNames?.[f]||(f<0?`Basement ${-f}`:f===0?'Ground':`Floor ${f+1}`))}</span><button data-step="1">Floor up</button>`;
        panel.querySelectorAll('[data-step]').forEach(btn=>{const to=list[list.indexOf(f)+Number(btn.dataset.step)];btn.disabled=to===undefined;btn.classList.toggle('opacity-40',btn.disabled);btn.onclick=()=>{
            if(!a.player){floor=to;redraw();return;}
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
    return {inspectToken(id){inspectId=id;controls();},watch,scene,geometry,lights,token,tokens,onFloor,floor:shownFloor,layer,meta:()=>data.meta,traps:()=>traps,invalidate,drawBase,drawDoor,annotations,roofs,covered,atmosphere,controls,startWeather,
        setDoor(d,open,f=shownFloor()){if(!doorRules(d.kind||d.mat).toggle)return false;a.live.set(a.path(`table3d/${current()}/doors/${f}/${d.key}`),open?'open':'closed');return true;},
        saveTrap(id,t){a.live.set(`table3d/${a.camp()}/${current()}/traps/${id}`,t);},
        isTrap(id){return Object.hasOwn(traps,id);},
        reset(){off.forEach(f=>f());off=[];subKey='';data={};traps={};cache.clear();}
    };
}
