import { doorRules } from './geez-table3d-layer.js';
// v1 permits extensions; empty paint/geometry collections are omitted by Map Converter.
export function validateScene(s) {
    const fail = message => { throw Error('Invalid geez2vtt: ' + message); };
    const object = v => v && typeof v === 'object' && !Array.isArray(v);
    const number = v => typeof v === 'number' && Number.isFinite(v);
    if (!object(s) || s.format !== 'geez2vtt' || s.version !== 1 || typeof s.name !== 'string') fail('expected geez2vtt v1');
    if (!object(s.grid) || !['cols','rows'].every(k => Number.isInteger(s.grid[k]) && s.grid[k] > 0) || !number(s.grid.cell_ft) || s.grid.cell_ft <= 0) fail('grid');
    if (!Array.isArray(s.floors) || !s.floors.length) fail('floors');
    const levels = new Set();
    for (const f of s.floors) {
        if (!object(f) || !Number.isInteger(f.level) || levels.has(f.level) || typeof f.name !== 'string' || !number(f.elevation)) fail('floor');
        levels.add(f.level);
        if (f.source !== undefined && typeof f.source !== 'string') fail('source');
        if (f.cells !== undefined) {
            if (!object(f.cells)) fail('cells');
            for (const [key,c] of Object.entries(f.cells)) if (!/^-?\d+,-?\d+$/.test(key) || !object(c) || ['floor','terrain'].some(k => c[k] !== undefined && typeof c[k] !== 'string') || c.elevation !== undefined && !number(c.elevation)) fail('cell');
        }
        for (const key of ['walls','portals','lights','props']) {
            if (f[key] === undefined) continue;
            if (!Array.isArray(f[key])) fail(key);
            for (const v of f[key]) {
                if (!object(v)) fail(key);
                if (key === 'walls' || key === 'portals') {
                    if (!['a','b'].every(k => Array.isArray(v[k]) && v[k].length === 2 && v[k].every(number)) || typeof v.material !== 'string') fail(key);
                    if (key === 'walls' && v.object !== undefined && typeof v.object !== 'boolean') fail('wall object');
                    if (key === 'portals' && (!['door','window','arch'].includes(v.kind) || typeof v.closed !== 'boolean' || typeof v.reviewed !== 'boolean')) fail('portal');
                } else if (key === 'lights') {
                    if (!['x','y','range','intensity'].every(k => number(v[k])) || typeof v.color !== 'string') fail('light');
                } else if (!['x','y','rotation','scale'].every(k => number(v[k])) || typeof v.id !== 'string' || v.to_level !== undefined && !Number.isInteger(v.to_level)) fail('prop');
            }
        }
    }
    return s;
}
const material = id => ({ flagstone:'stone',stone_floor:'stone',wood_planks:'wood',cobblestone:'cobble',grassland:'grass',rocks:'gravel',cobble_road:'cobble',dirt_path:'dirt' }[id] || id || 'neutral');
export function toTable3d(scene) {
    validateScene(scene);
    const out = {meta:{size:{x:scene.grid.cols,y:scene.grid.rows},floors:scene.floors.map(f=>f.level),floorNames:{},cell_ft:scene.grid.cell_ft},floors:{},doors:{}};
    for (const f of scene.floors) {
        out.meta.floorNames[f.level] = f.name;
        const layer = out.floors[f.level] = {paint:{},elevation:{},walls:{},doors:{},lights:{},props:{},stairs:{}};
        out.doors[f.level] = {};
        for (const [key,c] of Object.entries(f.cells || {})) { const k=key.replace(',','_');layer.paint[k]=material(c.floor || c.terrain);layer.elevation[k]=c.elevation || 0; }
        const segment = v => ({x1:v.a[0],y1:v.a[1],x2:v.b[0],y2:v.b[1],mat:material(v.material)});
        (f.walls || []).forEach((w,i)=>layer.walls['scene-wall-'+i]=segment(w));
        (f.portals || []).forEach((d,i)=>{
            const key='scene-door-'+i,kind=d.kind==='door'?(['iron','curtain'].includes(d.material)?d.material:'wood'):d.kind;
            layer.doors[key]={...segment(d),kind};out.doors[f.level][key]=d.closed?'closed':'open';
        });
        (f.lights || []).forEach((l,i)=>layer.lights[i]={...l});
        (f.props || []).forEach((p,i)=>{
            layer.props[i]={p:p.id,x:p.x,y:p.y,rot:p.rotation,s:p.scale};
            if(p.to_level !== undefined) layer.stairs[i]={x:p.x-.5,y:p.y-1,w:1,h:2,rot:p.rotation,to:p.to_level,kind:p.id};
        });
    }
    return out;
}
export function sceneGeometry(scene, level=scene.floors[0].level, states={}) {
    const data=toTable3d(scene),f=data.floors[level];
    return {walls:Object.entries(f.walls).map(([key,w])=>({key,src:'table3d',...w})),doors:Object.entries(f.doors).map(([key,d])=>({key,id:key,src:'table3d',...d,...doorRules(d.kind,(states[key] || data.doors[level][key])==='open')}))};
}
