// DraftPlan / BuildEditor / Furnish port. Cells are x_y; edges are x,y,dir (0 top, 1 left).

import { rectCells, unitEdges, addWalls, eraseWalls } from "./old-build-tools.js";

export { rectCells };

export const TYPES = {
    "Street": {"floor": "cobble", "furnish": "Street", "roof": false, "walls": false, "hub": true, "color": [0.48, 0.57, 0.66]},
    "Alley": {"floor": "dirt", "furnish": "Alley", "roof": false, "walls": false, "hub": true, "color": [0.52, 0.43, 0.32]},
    "Market square": {"floor": "cobble", "furnish": "Market square", "roof": false, "walls": false, "hub": true, "color": [0.9, 0.69, 0.37]},
    "Forge yard": {"floor": "slab", "furnish": "Forge yard", "roof": false, "walls": false, "hub": true, "color": [0.68, 0.39, 0.24]},
    "Potion shop": {"floor": "tile", "furnish": "Potion shop", "roof": true, "walls": true, "color": [0.44, 0.8, 0.63]},
    "General store": {"floor": "wood", "furnish": "General store", "roof": true, "walls": true, "color": [0.68, 0.65, 0.36]},
    "Hat shop": {"floor": "wood", "furnish": "Hat shop", "roof": true, "walls": true, "color": [0.78, 0.48, 0.76]},
    "Jeweler": {"floor": "carpet", "furnish": "Jeweler", "roof": true, "walls": true, "color": [0.35, 0.76, 0.88]},
    "Workshop": {"floor": "wood", "furnish": "Workshop", "roof": true, "walls": true, "color": [0.67, 0.53, 0.44]},
    "Guild hall": {"floor": "wood", "furnish": "Guild hall", "roof": true, "walls": true, "hub": true, "color": [0.49, 0.42, 0.77]},
    "Office": {"floor": "carpet", "furnish": "Office", "roof": true, "walls": true, "color": [0.55, 0.65, 0.77]},
    "Hall": {"floor": "slab", "furnish": "", "roof": true, "walls": true, "hub": true, "color": [0.85, 0.75, 0.45]},
    "Corridor": {"floor": "slab", "furnish": "", "roof": true, "walls": true, "hub": true, "color": [0.7, 0.7, 0.65]},
    "Courtyard": {"floor": "cobble", "furnish": "", "roof": false, "walls": false, "hub": true, "color": [0.55, 0.75, 0.45]},
    "Tavern": {"floor": "wood", "furnish": "Tavern", "roof": true, "walls": true, "hub": true, "color": [0.9, 0.55, 0.25]},
    "Bedroom": {"floor": "carpet", "furnish": "Bedroom", "roof": true, "walls": true, "color": [0.75, 0.4, 0.55]},
    "Kitchen": {"floor": "tile", "furnish": "Kitchen", "roof": true, "walls": true, "color": [0.95, 0.8, 0.35]},
    "Library": {"floor": "wood", "furnish": "Library", "roof": true, "walls": true, "color": [0.45, 0.55, 0.85]},
    "Storeroom": {"floor": "stone", "furnish": "Storeroom", "roof": true, "walls": true, "color": [0.6, 0.5, 0.4]},
    "Barracks": {"floor": "wood", "furnish": "Barracks", "roof": true, "walls": true, "color": [0.6, 0.35, 0.3]},
    "Throne room": {"floor": "carpet", "furnish": "Throne room", "roof": true, "walls": true, "hub": true, "color": [0.8, 0.2, 0.25]},
    "Shrine": {"floor": "marble", "furnish": "Shrine", "roof": true, "walls": true, "color": [0.9, 0.9, 0.95]},
    "Temple": {"floor": "marble", "furnish": "Temple", "roof": true, "walls": true, "hub": true, "color": [0.85, 0.85, 1.0]},
    "Smithy": {"floor": "slab", "furnish": "Smithy", "roof": true, "walls": true, "color": [0.5, 0.5, 0.55]},
    "Shop": {"floor": "wood", "furnish": "Shop", "roof": true, "walls": true, "color": [0.4, 0.75, 0.7]},
    "Alchemy lab": {"floor": "tile", "furnish": "Alchemy lab", "roof": true, "walls": true, "color": [0.55, 0.85, 0.5]},
    "Prison": {"floor": "stone", "furnish": "Prison", "roof": true, "walls": true, "color": [0.35, 0.35, 0.4]},
    "Crypt": {"floor": "stone", "furnish": "Crypt", "roof": true, "walls": true, "color": [0.4, 0.3, 0.5]},
    "Cave": {"floor": "cave", "furnish": "Cave", "roof": false, "walls": true, "wall": "cave", "hub": true, "color": [0.45, 0.4, 0.35]}
};

export const THEMES = {
    "Crypt": {"floor": "stone", "wall": "stone"},
    "Tavern": {"floor": "wood", "wall": "timber"},
    "Common room": {"floor": "wood", "wall": "plaster"},
    "Cabin": {"floor": "wood", "wall": "wood"},
    "Townhouse": {"floor": "wood", "wall": "brick"},
    "Hovel": {"floor": "dirt", "wall": "fieldstone"},
    "Castle hall": {"floor": "slab", "wall": "ashlar"},
    "Throne room": {"floor": "carpet", "wall": "ashlar"},
    "Courtyard": {"floor": "cobble", "wall": "ashlar"},
    "Temple": {"floor": "marble", "wall": "marble"},
    "Cathedral": {"floor": "tile", "wall": "stone"},
    "Cave": {"floor": "cave", "wall": "cave"},
    "Barrow": {"floor": "dirt", "wall": "stone"},
    "Fort": {"floor": "dirt", "wall": "palisade"},
    "Manor": {"floor": "wood", "wall": "brick"},
    "Desert ruin": {"floor": "sand", "wall": "fieldstone"}
};

const PALETTES = {
    "Street": ["lamp_post", "bench", "planter", "signpost"],
    "Alley": ["barrel", "crate", "sacks", "woodpile", "standing_torch", "hay_bale"],
    "Market square": ["fountain", "market_stall", "market_canopy", "produce_crates", "notice_board", "lamp_post", "tall_brazier"],
    "Forge yard": ["anvil", "water_trough", "grindstone", "woodpile", "hay_bale", "hitching_post", "coal_pile"],
    "Potion shop": ["shop_counter", "potion_shelf", "cauldron", "alchemy_table", "crystal_pedestal", "candelabra"],
    "General store": ["shop_counter", "display_shelf", "barrel", "crate", "sacks", "rope_coil"],
    "Hat shop": ["shop_counter", "hat_stand", "hat_display", "mirror", "armchair"],
    "Jeweler": ["shop_counter", "display_case", "strongbox", "candelabra", "rug"],
    "Workshop": ["workbench", "jeweler_bench", "crate", "stool", "scroll_rack"],
    "Guild hall": ["long_table", "banner", "notice_board", "fireplace", "armchair", "weapon_rack", "guild_crest"],
    "Office": ["desk", "bookshelf", "chest", "armchair", "strongbox"],
    "Tavern": ["round_table", "bar_counter", "keg_rack", "fireplace", "stool", "barrel"],
    "Bedroom": ["bed", "wardrobe", "dresser", "nightstand", "armchair", "chest"],
    "Library": ["desk", "bookshelf", "lectern", "globe", "scroll_rack", "armchair", "book_pile"],
    "Storeroom": ["crate", "barrel", "sacks", "display_shelf"],
    "Crypt": ["coffin", "bone_pile"],
    "Shrine": ["altar", "statue", "holy_font", "brazier"],
    "Throne room": ["altar", "statue"],
    "Barracks": ["bunk_bed", "weapon_rack", "chest"],
    "Prison": ["torture_rack", "stocks", "manacles_wall", "iron_cage"],
    "Kitchen": ["hearth_oven", "kitchen_counter", "pot_rack", "pantry_shelf", "butcher_block"],
    "Cave": ["stalagmite", "rocks", "mushrooms", "crystal_cluster", "ore_pile"],
    "Camp": ["campfire", "tent", "woodpile"],
    "Graveyard": ["gravestone", "dead_tree", "bone_pile"],
    "Forest": ["tree", "bush", "mushrooms", "rocks", "flowers", "tall_grass_clump"],
    "Smithy": ["forge", "anvil", "grindstone", "workbench", "weapon_rack", "woodpile"],
    "Shop": ["market_stall", "display_shelf", "bar_counter", "sacks", "crate"],
    "Alchemy lab": ["alchemy_table", "crystal_pedestal", "book_pile", "summoning_circle_stones", "scroll_rack"],
    "Temple": ["holy_font", "pew", "brazier", "banner", "altar", "statue"],
    "Mine": ["mine_cart", "ore_pile", "crystal_cluster", "stalagmite", "rocks"],
    "Docks": ["cannon", "dock_post", "rope_coil", "anchor", "barrel", "crate"]
};

const CITY_TYPES = ["Street", "Alley", "Market square", "Forge yard", "Potion shop", "General store", "Hat shop", "Jeweler", "Workshop", "Guild hall", "Office"];

const OPEN_TYPES = ["Street", "Alley", "Market square", "Forge yard"];

const WALL_PROPS = ["potion_shelf", "hat_display", "mirror", "guild_crest", "bookshelf", "bed", "weapon_rack", "torch_sconce", "coffin", "chains", "hearth_oven", "fireplace", "forge", "pot_rack", "pantry_shelf", "scroll_rack", "display_shelf", "wardrobe", "dresser", "nightstand", "bunk_bed", "manacles_wall", "banner"];

const CLUTTER = ["coal_pile", "barrel", "crate", "sacks", "bone_pile", "rocks", "mushrooms", "book_pile", "ore_pile", "rope_coil"];

const CENTERPIECES = ["long_table", "fountain", "table", "round_table", "campfire", "altar", "desk", "alchemy_table", "holy_font", "mine_cart", "cannon", "market_stall", "torture_rack"];


const DIRS = [[0,1],[1,0],[0,-1],[-1,0]];
const key = (x,y) => `${x}_${y}`;
const xy = k => k.split('_').map(Number);
const plus = (c,d,n=1) => [c[0]+d[0]*n,c[1]+d[1]*n];
const ck = c => key(...c);
const edge = (a,b) => a[0] !== b[0] ? `${Math.max(a[0],b[0])},${a[1]},1` : `${a[0]},${Math.max(a[1],b[1])},0`;
const segment = e => { const [x,y,d]=e.split(',').map(Number); return {x1:x,y1:y,x2:x+(d===0?1:0),y2:y+(d===1?1:0)}; };
const segEdge = e => {const [x,y,x2]=e.split(',').map(Number);return `${x},${y},${x===x2?1:0}`;};
const sortedEdges = es => [...es].sort((a,b)=>{const p=a.split(',').map(Number),q=b.split(',').map(Number);return p[0]-q[0]||p[1]-q[1]||p[2]-q[2];});
const clone = v => JSON.parse(JSON.stringify(v));
export function shapeAt(shapes, cell) { return shapes.findIndex(s=>s.cells.includes(typeof cell==='string'?cell:ck(cell))); }
export function addCells(shapes,cells,type='Hall',extend=false) {
    if(!cells.length)return clone(shapes);
    const covered=new Set(cells),out=shapes.map(s=>({...s,cells:s.cells.filter(k=>!covered.has(k))}));
    if(extend&&out.length)out.at(-1).cells.push(...covered);
    else out.push({type:TYPES[type]?type:'Hall',cells:[...covered]});
    return out.filter(s=>s.cells.length);
}
export function removeCells(shapes,cells) {const cut=new Set(cells);return shapes.map(s=>({...s,cells:s.cells.filter(k=>!cut.has(k))})).filter(s=>s.cells.length);}
export function setType(shapes,index,type) {return shapes.map((s,i)=>({...s,type:i===index&&TYPES[type]?type:s.type,cells:[...s.cells]}));}
export const isHub = (shapes,i) => !!TYPES[shapes[i].type].hub;
export const buildOrder = shapes => shapes.map((_,i)=>i).sort((a,b)=>Number(isHub(shapes,b))-Number(isHub(shapes,a))||shapes[b].cells.length-shapes[a].cells.length);
export function adjacency(shapes) {
    const owner=new Map(shapes.flatMap((s,i)=>s.cells.map(k=>[k,i]))),adj=shapes.map(()=>({}));
    for(const [k,a] of owner) for(const d of [[1,0],[0,1]]) {
        const c=xy(k),n=plus(c,d),b=owner.get(ck(n));
        if(b===undefined||b===a)continue;
        const e=edge(c,n);(adj[a][b]||=[]).push(e);(adj[b][a]||=[]).push(e);
    }
    return adj;
}
export function connections(shapes) {
    const adj=adjacency(shapes),reached=new Set(),links=[],entrances=[],components=[];
    for(const start of buildOrder(shapes)) {
        if(reached.has(start))continue;
        const component=[start],frontier=[start];reached.add(start);
        while(frontier.length) {
            frontier.sort((a,b)=>Number(isHub(shapes,b))-Number(isHub(shapes,a)));
            const here=frontier.shift();
            for(const ns of Object.keys(adj[here])) {
                const n=+ns,es=adj[here][n];
                if(!reached.has(n)) {reached.add(n);links.push([here,n,es]);frontier.push(n);component.push(n);}
                else if(isHub(shapes,here)&&isHub(shapes,n)&&!links.some(l=>(l[0]===here&&l[1]===n)||(l[1]===here&&l[0]===n)))links.push([here,n,es]);
            }
        }
        components.push(component);
        if(component.some(i=>TYPES[shapes[i].type].walls))entrances.push(start);
    }
    return {links,entrances,components};
}
function outline(cells) {
    const area=new Set(cells),out=[];
    for(const k of area) {const c=xy(k);for(let dir=0;dir<4;dir++) {const n=plus(c,DIRS[dir]);if(!area.has(ck(n)))out.push({e:edge(c,n),out:ck(n),dir,pos:dir%2?c[1]:c[0]});}}
    return out;
}
const LENGTH2 = new Set('shop_counter long_table market_canopy gallows bed rug coffin cart bar_counter workbench market_stall pew bunk_bed torture_rack cannon'.split(' '));
const length = kind => kind==='blackship'?8:['bridge','stairs','cliff_rock'].includes(kind)?3:LENGTH2.has(kind)?2:1;
export function footprint(kind,c,rot=0) {
    const d=DIRS[rot],across=[d[1],-d[0]],out=[];
    for(let z=0;z<length(kind);z++)for(let x=0;x<(kind==='blackship'?4:1);x++)out.push(ck(plus(plus(c,d,z),across,x)));
    return out;
}
export function canvasProp({kind,cell,rot}) {
    const cells=footprint(kind,cell,rot).map(xy);
    return {p:kind,x:cells.reduce((s,c)=>s+c[0]+.5,0)/cells.length,y:cells.reduce((s,c)=>s+c[1]+.5,0)/cells.length,rot:(360-rot*90)%360,s:1};
}
export function doorClearance(doors) {
    const out=new Set();for(const e of doors) {const [x,y,d]=e.split(',').map(Number);for(const n of [-2,-1,0,1])out.add(ck(plus([x,y],d===0?DIRS[0]:DIRS[1],n)));}return out;
}
// Deterministic shuffle; placement rules match Furnish.plan, without depending on Godot's RNG.
function random(seed) {let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
export function furnish(cells,type,{walls=[],doors=[],occupied=[],extraBlocked=[],seed=1}={}) {
    const cuts=new Set(extraBlocked),area=new Set(cells.filter(k=>!cuts.has(k))),wall=new Set(walls),door=new Set(doors),blocked=new Set(occupied),reserved=doorClearance(doors),out=[];
    if(!area.size)return out;
    const candidates=[...area].map(xy).sort((a,b)=>a[1]-b[1]||a[0]-b[0]),rng=random(seed);
    for(let i=candidates.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
    const center=candidates.reduce((a,c)=>plus(a,c),[0,0]).map(n=>n/candidates.length);
    const central=[...candidates].sort((a,b)=>(a[0]-center[0])**2+(a[1]-center[1])**2-(b[0]-center[0])**2-(b[1]-center[1])**2);
    const budget=Math.max(1,Math.floor(area.size*.35)),palette=PALETTES[type]||PALETTES.Storeroom;
    const used=ps=>ps.reduce((n,p)=>n+length(p.kind),0);
    const isWall=(c,d)=>wall.has(edge(c,plus(c,d)));
    function connected(trial) {
        const start=[...area].find(k=>!trial.has(k));if(!start)return false;
        const seen=new Set([start]),q=[start];
        for(let i=0;i<q.length;i++) {const c=xy(q[i]);for(const d of DIRS){const n=plus(c,d),k=ck(n),e=edge(c,n);if(area.has(k)&&!trial.has(k)&&!seen.has(k)&&!wall.has(e)){seen.add(k);q.push(k);}}}
        return [...area].every(k=>trial.has(k)||seen.has(k));
    }
    function place(kind,c,rot=0,limit=budget,result=out,res=reserved,trial=blocked) {
        const covered=footprint(kind,c,rot);
        if(used(result)+covered.length>limit)return false;
        for(const k of covered) {
            if(!area.has(k)||trial.has(k)||res.has(k))return false;
            if(k!==ck(c)){const e=edge(plus(xy(k),DIRS[rot],-1),xy(k));if(wall.has(e)||door.has(e))return false;}
        }
        covered.forEach(k=>trial.add(k));
        if(!connected(trial)){covered.forEach(k=>trial.delete(k));return false;}
        result.push({kind,cell:[...c],rot});return true;
    }
    const back=(kind,r)=>DIRS[r].map(n=>n*(['bookshelf','weapon_rack'].includes(kind)?1:-1));
    const validBack=(kind,c,r)=>!WALL_PROPS.includes(kind)||isWall(c,back(kind,r));
    function city(limit,result) {
        const edges=candidates.filter(c=>DIRS.some(d=>!area.has(ck(plus(c,d))))),verge=new Set(edges.map(ck)),lane=new Set(reserved);
        const xs=candidates.map(c=>c[0]),ys=candidates.map(c=>c[1]),lo=[Math.min(...xs),Math.min(...ys)],hi=[Math.max(...xs),Math.max(...ys)];
        if(['Street','Alley'].includes(type))for(const c of candidates)if(hi[0]-lo[0]>=hi[1]-lo[1]?c[1]===Math.trunc((lo[1]+hi[1])/2):c[0]===Math.trunc((lo[0]+hi[0])/2))lane.add(ck(c));
        const put=(k,c,r=0)=>place(k,c,r,limit,result,lane);
        if(type==='Market square') {
            for(const c of central)if(put('fountain',c))break;
            const corners=[lo,hi];if(area.size>=40)corners.push([lo[0],hi[1]],[hi[0],lo[1]]);
            corners.forEach((c,i)=>put(i%2?'tall_brazier':'lamp_post',c));
            for(const row of [lo[1],hi[1]])for(let x=lo[0]+1;x<hi[0]-1;x+=3){const r=row===lo[1]?1:3,k=r===1?'market_stall':'market_canopy',c=[r===1?x:x+1,row];if(footprint(k,c,r).every(k=>verge.has(k)))put(k,c,r);}
            for(const k of ['notice_board','produce_crates'])for(const c of edges)if(put(k,c))break;
            return;
        }
        for(const kind of palette) {
            let done=false;
            for(const c of CENTERPIECES.includes(kind)?central:edges){for(let r=0;r<4;r++){
                if(!validBack(kind,c,r))continue;
                if(OPEN_TYPES.includes(type)&&kind!=='fountain'&&!footprint(kind,c,r).every(k=>verge.has(k)))continue;
                if(put(kind,c,r)){done=true;if(['long_table','desk'].includes(kind))for(const side of [1,3])put('chair',plus(c,DIRS[side]),side);break;}
            }if(done)break;}
        }
        if(type==='Street')for(const c of edges)if(!result.some(p=>p.kind==='lamp_post'&&Math.hypot(p.cell[0]-c[0],p.cell[1]-c[1])<4))put('lamp_post',c);
    }
    if(OPEN_TYPES.includes(type)){city(budget,out);return out;}
    if(!['Forest','Graveyard','Camp','Cave'].includes(type))for(let light=0;light<Math.ceil(area.size/25);light++){
        let done=false;for(const c of candidates){for(let r=0;r<4;r++)if(isWall(c,DIRS[r].map(n=>-n))&&place('torch_sconce',c,r)){done=true;break;}if(done)break;}
        if(!done)for(const c of candidates)if(place('candelabra',c))break;
    }
    if(CITY_TYPES.includes(type)){const cityOut=[];city(budget-used(out),cityOut);out.push(...cityOut);return out;}
    const main=palette[0];
    if(CENTERPIECES.includes(main)) {
        if(main==='altar'&&reserved.size){const dist=c=>Math.min(...[...reserved].map(xy).map(d=>Math.abs(c[0]-d[0])+Math.abs(c[1]-d[1])));central.sort((a,b)=>dist(b)-dist(a));}
        for(const c of central)if(place(main,c)){
            if(['table','round_table','desk'].includes(main))for(let r=0;r<4;r++)place('chair',plus(c,DIRS[r]),r);
            if(type==='Throne room')for(let offset=1;offset<4;offset++){
                const pair=[],trial=new Set(blocked),limit=budget-used(out);
                if(place('statue',plus(c,[offset,0]),0,limit,pair,reserved,trial)&&place('statue',plus(c,[-offset,0]),0,limit,pair,reserved,trial)){blocked.clear();trial.forEach(k=>blocked.add(k));out.push(...pair);break;}
            }
            break;
        }
    } else {let done=false;for(const c of candidates){for(let r=0;r<4;r++)if(validBack(main,c,r)&&place(main,c,r)){done=true;break;}if(done)break;}}
    for(let pass=0;pass<2;pass++)for(const c of candidates){
        const kind=palette[Math.floor(rng()*palette.length)];
        if(CENTERPIECES.includes(kind)||(type==='Throne room'&&kind==='statue'))continue;
        if(CLUTTER.includes(kind)&&DIRS.filter(d=>isWall(c,d)).length<(pass===0?2:1))continue;
        for(let r=0;r<4;r++)if(validBack(kind,c,r)&&place(kind,c,r))break;
    }
    return out;
}


/** Return a detached edits record. Existing source geometry is hidden only when changed. */
export function build(shapes,edits={},options={}) {
    const ed=clone(edits),order=buildOrder(shapes),plan=connections(shapes),theme=THEMES[options.style]||THEMES.Townhouse;
    let serial=0;
    const taken=new Set(Object.values(ed).filter(v=>v&&typeof v==='object').flatMap(v=>Object.keys(v)));
    const newKey=prefix=>{let id;do{id=options.newKey?options.newKey(prefix):`draft_${++serial}`;}while(taken.has(id));taken.add(id);return id;};
    let walls=clone(ed.addWalls||{}),doors=clone(ed.addDoors||{});
    const bases=[];
    for(const [kind,list] of [['walls',options.baseWalls||[]],['doors',options.baseDoors||[]]])for(const item of list){
        if(item.src==='add')continue;
        const id=`@${kind}:${item.key}`,record={x1:item.x1,y1:item.y1,x2:item.x2,y2:item.y2,mat:item.mat||'stone'};
        if(kind==='doors')Object.assign(record,{kind:item.kind||'wood'});
        (kind==='walls'?walls:doors)[id]=record;bases.push({kind,id,key:item.key,record});
    }
    const drafted=new Set(shapes.flatMap(s=>s.cells));ed.paint||={};
    const floorAt=k=>ed.paint[k]||options.basePaint?.[k];
    // Remove interior grid edges of each shape, retaining its outline and other rooms' walls.
    const internal=[];
    for(const s of shapes){const area=new Set(s.cells);for(const k of area){const c=xy(k);for(const d of [[1,0],[0,1]])if(area.has(ck(plus(c,d))))internal.push(segment(edge(c,plus(c,d))));}}
    walls=eraseWalls(walls,internal).walls;
    const internalKeys=new Set(internal.flatMap(unitEdges));
    for(const [id,d] of Object.entries(doors))if(unitEdges(d).some(k=>internalKeys.has(k)))delete doors[id];
    for(const i of order){const s=shapes[i],t=TYPES[s.type];s.cells.forEach(k=>ed.paint[k]=t.floor);if(t.walls)walls=addWalls(walls,outline(s.cells).map(o=>segment(o.e)),t.wall||theme.wall,()=>newKey('w')).walls;}
    const wallSet=()=>new Set(Object.values(walls).flatMap(unitEdges).map(segEdge));
    const doorSet=()=>new Set(Object.values(doors).flatMap(unitEdges).map(segEdge));
    // Existing doors survive outline construction; no wall may cover a doorway.
    walls=eraseWalls(walls,Object.values(doors)).walls;
    function putDoor(e){walls=eraseWalls(walls,[segment(e)]).walls;doors[newKey('dr')]={...segment(e),mat:'wood',kind:'wood',f:options.floor||0};}
    for(const link of plan.links){const ws=wallSet(),ds=doorSet();if(link[2].some(e=>ds.has(e)))continue;const es=sortedEdges(link[2]).filter(e=>ws.has(e));if(es.length)putDoor(es[Math.floor(es.length/2)]);}
    const ground=new Set('grass dirt sand snow water cobble mud swamp gravel moss ice shallow lava void'.split(' '));
    for(const start of plan.entrances){
        const component=plan.components.find(c=>c.includes(start));
        for(const i of [start,...order.filter(i=>i!==start&&component.includes(i))]){
            const ws=wallSet(),valid=outline(shapes[i].cells).filter(o=>ws.has(o.e)&&!drafted.has(o.out)&&(!floorAt(o.out)||ground.has(floorAt(o.out))));
            const runs=[];
            for(const dir of [0,1,2,3]){
                const es=valid.filter(o=>o.dir===dir).sort((a,b)=>{const p=segment(a.e),q=segment(b.e);return (dir%2?p.x1-q.x1:p.y1-q.y1)||a.pos-b.pos;});
                let run=[];
                for(const o of es){const prev=run.at(-1),p=prev&&segment(prev.e),q=segment(o.e);if(prev&&(o.pos!==prev.pos+1||(dir%2?p.x1!==q.x1:p.y1!==q.y1))){runs.push(run);run=[];}run.push(o);}if(run.length)runs.push(run);
            }
            runs.sort((a,b)=>Number(b[0].dir===0)-Number(a[0].dir===0)||b.length-a.length); // DIRS[0] is south.
            if(runs.length){const run=runs[0];putDoor(run[Math.floor(run.length/2)].e);break;}
        }
    }
    if(options.furnish){
        const occupied=new Set(options.occupied||[]),extra=new Set(options.extraBlocked||[]),ws=wallSet(),ds=doorSet();
        // Arbitrary-angle source walls block every cell they cross (including both diagonals).
        for(const w of Object.values(walls))if(!unitEdges(w).length){
            const steps=Math.ceil(Math.hypot(w.x2-w.x1,w.y2-w.y1)*16);
            for(let i=0;i<=steps;i++){const t=steps?i/steps:0;extra.add(key(Math.floor(w.x1+(w.x2-w.x1)*t),Math.floor(w.y1+(w.y2-w.y1)*t)));}
        }
        ed.props||={};
        for(const i of order){const s=shapes[i],t=TYPES[s.type];if(!t.furnish)continue;
            const ps=furnish(s.cells,t.furnish,{walls:[...ws],doors:[...ds],occupied:[...occupied],extraBlocked:[...extra],seed:(options.seed||1)+i});
            for(const p of ps){ed.props[newKey('p')]=canvasProp(p);footprint(p.kind,p.cell,p.rot).forEach(k=>occupied.add(k));}
        }
    }
    // Keep source geometry in its existing layer; replacements use ordinary add/hide edits.
    for(const b of bases){const map=b.kind==='walls'?walls:doors;
        if(JSON.stringify(map[b.id])!==JSON.stringify(b.record)){
            (ed[b.kind==='walls'?'hideWalls':'hideDoors']||={})[b.key]=true;
            if(map[b.id])map[newKey(b.kind==='walls'?'w':'dr')]=map[b.id];
        }
        delete map[b.id];
        // eraseWalls can split a source record into suffixed fragments.
        for(const id of Object.keys(map))if(id.startsWith(b.id+'~')){map[newKey('w')]=map[id];delete map[id];}
    }
    ed.addWalls=walls;ed.addDoors=doors;return ed;
}

/** UI adapter: campaign data and sync remain owned by old-index.html. Drafts never enter db. */
export function createDraftTool(a) {
    const canvas=document.createElement('canvas');canvas.className='absolute top-0 left-0 pointer-events-none';canvas.style.zIndex='12';a.wrapper.append(canvas);
    let shapes=[],loadedKey='',gesture=null,type='Hall',style='Townhouse',size='Drag',furnishOn=true,erase=false;
    const context=()=>a.context();
    function load(){const c=context(),k=c.visible?`geezvtt.draft.v1:${c.campaign}:${c.bid}:${c.floor}`:'';if(k!==loadedKey){loadedKey=k;gesture=null;shapes=[];if(k)try{const saved=JSON.parse(localStorage.getItem(k)||'[]');if(Array.isArray(saved))for(const s of saved)if(TYPES[s.type]&&Array.isArray(s.cells))shapes=addCells(shapes,s.cells.filter(k=>/^-?\d+_-?\d+$/.test(k)),s.type);}catch{a.status('Could not restore the local draft');}}return c;}
    function persist(){try{if(loadedKey)localStorage.setItem(loadedKey,JSON.stringify(shapes));}catch{a.status('Draft stays in memory; browser storage is unavailable');}}
    const active=()=>{const c=load();return c.visible&&c.mode==='draft';};
    function cellsFor(g){let cells=rectCells(g.a,g.b);if(g.a[0]===g.b[0]&&g.a[1]===g.b[1]&&size!=='Drag'&&!g.remove){const [w,h]=size.split('x').map(Number),x=g.a[0]-Math.floor((w-1)/2),y=g.a[1]-Math.floor((h-1)/2);cells=rectCells([x,y],[x+w-1,y+h-1]);}const c=context();return cells.filter(k=>{const [x,y]=xy(k);return x>=0&&y>=0&&x<c.cols&&y<c.rows;});}
    function preview(){if(!gesture)return shapes;const cells=cellsFor(gesture);return gesture.remove?removeCells(shapes,cells):addCells(shapes,cells,type,gesture.extend);}
    function draw(){const c=load();canvas.style.display=c.visible?'block':'none';if(!c.visible)return;
        if(canvas.width!==c.w)canvas.width=c.w;if(canvas.height!==c.h)canvas.height=c.h;
        const ctx=canvas.getContext('2d'),g=c.ppg;ctx.clearRect(0,0,c.w,c.h);
        for(const s of preview()){
            const rgb=TYPES[s.type].color.map(n=>Math.round(n*255));ctx.fillStyle=`rgba(${rgb.join(',')},.5)`;
            let x=0,y=0;for(const k of s.cells){const [cx,cy]=xy(k);ctx.fillRect((cx+.03)*g,(cy+.03)*g,g*.94,g*.94);x+=cx+.5;y+=cy+.5;}
            ctx.font=`bold ${Math.max(12,g*.22)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3;ctx.strokeStyle='#171717';ctx.fillStyle='#fff2d8';ctx.strokeText(s.type,x/s.cells.length*g,y/s.cells.length*g);ctx.fillText(s.type,x/s.cells.length*g,y/s.cells.length*g);
        }
    }
    function clear(){shapes=[];gesture=null;persist();draw();renderBar();}
    function buildNow(){if(!active()||!shapes.length)return;const c=context();a.apply(build(shapes,a.edits(),{style,furnish:furnishOn,floor:c.floor,...a.buildOptions()}));const count=shapes.length;clear();a.status(`Built ${count} rooms. Ctrl+Z undoes it.`);}
    function renderBar(){if(!active())return false;const bar=a.bar;bar.style.display='flex';bar.style.flexWrap='wrap';bar.style.gap='8px';bar.style.alignItems='center';
        const select=(id,label,values,current)=>`<label>${label} <select id="${id}" style="background:#0f172a;color:#e2e8f0;padding:4px;border:1px solid #475569;border-radius:6px">${values.map(v=>`<option ${v===current?'selected':''}>${v}</option>`).join('')}</select></label>`;
        bar.innerHTML=select('draftType','Room',Object.keys(TYPES),type)+select('draftStyle','Style',Object.keys(THEMES),style)+select('draftSize','Room size',['Drag','3x3','4x4','5x5','4x6','6x8'],size)+`<label><input id="draftFurnish" type="checkbox" ${furnishOn?'checked':''}> Furnish</label><label><input id="draftErase" type="checkbox" ${erase?'checked':''}> Erase</label><button id="draftBuild" style="background:#b45309;padding:5px 12px;border-radius:6px">Build (Enter)</button><button id="draftClear" style="padding:5px">Clear (Esc)</button><span>${shapes.length} rooms · Shift: extend · Click: retype · Right-drag: erase · DM only</span>`;
        bar.querySelector('#draftType').onchange=e=>type=e.target.value;bar.querySelector('#draftStyle').onchange=e=>style=e.target.value;bar.querySelector('#draftSize').onchange=e=>size=e.target.value;bar.querySelector('#draftFurnish').onchange=e=>furnishOn=e.target.checked;bar.querySelector('#draftErase').onchange=e=>erase=e.target.checked;bar.querySelector('#draftBuild').onclick=buildNow;bar.querySelector('#draftClear').onclick=clear;return true;
    }
    const cell=e=>{const p=a.content(e.clientX,e.clientY),c=context();return [Math.max(0,Math.min(c.cols-1,Math.floor(p.x/c.ppg))),Math.max(0,Math.min(c.rows-1,Math.floor(p.y/c.ppg)))];};
    const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
    a.viewport.addEventListener('pointerdown',e=>{if(!active()||![0,2].includes(e.button)||e.target.closest('button,input,select,label')||!a.wrapper.contains(e.target))return;stop(e);const c=cell(e);gesture={a:c,b:c,remove:e.button===2||erase,extend:e.shiftKey,id:e.pointerId};a.viewport.setPointerCapture(e.pointerId);draw();},true);
    a.viewport.addEventListener('pointermove',e=>{if(!gesture||e.pointerId!==gesture.id)return;stop(e);gesture.b=cell(e);draw();},true);
    a.viewport.addEventListener('pointerup',e=>{if(!gesture||e.pointerId!==gesture.id)return;stop(e);gesture.b=cell(e);const g=gesture,hit=shapeAt(shapes,g.a),clicked=g.a[0]===g.b[0]&&g.a[1]===g.b[1];shapes=clicked&&size==='Drag'&&!g.remove&&hit>=0?setType(shapes,hit,type):preview();gesture=null;if(a.viewport.hasPointerCapture(e.pointerId))a.viewport.releasePointerCapture(e.pointerId);persist();draw();renderBar();},true);
    a.viewport.addEventListener('pointercancel',()=>{gesture=null;draw();},true);
    a.viewport.addEventListener('contextmenu',e=>{if(active())stop(e);},true);
    document.addEventListener('keydown',e=>{if(!active()||e.target.closest('input,textarea,select,[contenteditable="true"]'))return;if(e.key==='Enter'){stop(e);buildNow();}else if(e.key==='Escape'){stop(e);clear();}},true);
    return {draw,renderBar};
}


/** Conservative occupied cells for existing canvas props, including arbitrary rotations. */
export function occupiedProps(props,propDef) {
    const out=new Set();
    for(const p of props){const d=propDef(p.p);if(!d)continue;const r=(p.rot||0)*Math.PI/180,w=d.w*(p.s||1),h=d.h*(p.s||1),hx=(Math.abs(Math.cos(r))*w+Math.abs(Math.sin(r))*h)/2,hy=(Math.abs(Math.sin(r))*w+Math.abs(Math.cos(r))*h)/2;
        for(let x=Math.floor(p.x-hx+1e-8);x<Math.ceil(p.x+hx-1e-8);x++)for(let y=Math.floor(p.y-hy+1e-8);y<Math.ceil(p.y+hy-1e-8);y++)out.add(key(x,y));
    }return [...out];
}

