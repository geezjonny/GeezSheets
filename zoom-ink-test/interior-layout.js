// Local building coordinates: +z is the street/front door; one 5-foot square = 1.5 units.
// Pure deterministic layout, independent of camera, rendering, and town build order.
export const INTERIOR_VERSION=1, AISLE=1.65, WALL=.22;
export function interiorSeed(key){let n=2166136261;for(const c of String(key))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
function random(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function doorOffset(L,key){return (random(interiorSeed(key))()-.5)*Math.max(0,L-2.8);}
export function localPoint(h,x,z){const c=Math.cos(h.yaw||0),s=Math.sin(h.yaw||0),dx=x-h.x,dz=z-h.z;return{x:dx*c-dz*s,z:dx*s+dz*c};}
export function worldPoint(h,x,z){const c=Math.cos(h.yaw||0),s=Math.sin(h.yaw||0);return{x:h.x+x*c+z*s,z:h.z-x*s+z*c};}
export const FURNITURE={
 bed:{w:1.05,d:2.05,h:.65,cover:'None',blocks:true},
 table:{w:1.5,d:1,h:.8,cover:'Half cover',blocks:true},
 chair:{w:.43,d:.48,h:.85,cover:'None',blocks:false},
 shelf:{w:1.6,d:.42,h:1.7,cover:'Three-quarter cover',blocks:true},
 counter:{w:2,d:.65,h:1,cover:'Half cover',blocks:true},
 crate:{w:.82,d:.82,h:.8,cover:'Half cover',blocks:true},
 barrel:{w:.77,d:.77,h:.95,cover:'Half cover',blocks:true},
 hearth:{w:1.25,d:.75,h:1.3,cover:'Half cover',blocks:true},
 chest:{w:1.05,d:.58,h:.6,cover:'Half cover',blocks:true},
 bench:{w:1.8,d:.43,h:.5,cover:'None',blocks:false},
 forge:{w:1.4,d:.9,h:1.1,cover:'Half cover',blocks:true},
 anvil:{w:.85,d:.55,h:.85,cover:'Half cover',blocks:true},
 workbench:{w:1.6,d:.72,h:.85,cover:'Half cover',blocks:true},
 altar:{w:1.8,d:.9,h:1.05,cover:'Half cover',blocks:true},
 rack:{w:1.25,d:.45,h:1.55,cover:'Half cover',blocks:true},
 hay:{w:1.1,d:.9,h:.65,cover:'None',blocks:true}
};
const NAMES={shelf:'Stock shelves',counter:'Shop counter',hearth:'Cold hearth',rack:'Weapon rack',hay:'Hay bale'};
const HOME=['bed','table','hearth','chest','chair','bed'];
const STORE=['counter','shelf','shelf','crate','barrel','table','crate'];
const PLANS={home:HOME,farmhouse:HOME,manor:[...HOME,'bed','shelf','chest'],inn:['counter','table','bed','barrel','bed','chest','bench','table'],tavern:['counter','table','barrel','table','bench','shelf','barrel','bench'],
 shop:STORE,store:STORE,market:STORE,jeweler:['counter','shelf','table','chest'],alchemist:['counter','shelf','workbench','barrel','shelf'],healer:['bed','workbench','shelf','chest','bed'],baker:['hearth','workbench','shelf','barrel','crate'],
 smithy:['forge','anvil','workbench','rack','barrel','crate'],armory:['rack','rack','counter','workbench','crate'],bowyer:['workbench','rack','shelf','crate'],workshop:['workbench','shelf','crate','barrel','table'],tanner:['workbench','barrel','barrel','rack'],
 warehouse:['crate','barrel','crate','crate','barrel','crate','shelf','barrel','crate'],granary:['crate','barrel','crate','barrel','shelf'],barn:['hay','barrel','hay','crate','hay'],stables:['hay','barrel','rack','hay'],
 temple:['altar','bench','bench','shelf','chest'],chapel:['altar','bench','bench','chest'],shrine:['altar','bench','chest'],library:['shelf','table','shelf','shelf','chair'],wizard:['table','shelf','bed','chest'],
 guard:['table','rack','bench','chest'],barracks:['bed','bed','rack','table','bed','chest'],den:['table','chest','barrel','bed'],bank:['counter','chest','shelf','table'],guildhall:['table','shelf','bench','chest'],ruin:['crate','barrel']};
export function itemBounds(o,pad=0){const turn=Math.abs(Math.sin(o.rot||0))>.5;return{x:o.x,z:o.z,w:(turn?o.d:o.w)+pad*2,d:(turn?o.w:o.d)+pad*2};}
export function overlaps(a,b,gap=0){return Math.abs(a.x-b.x)<(a.w+b.w)/2+gap&&Math.abs(a.z-b.z)<(a.d+b.d)/2+gap;}
export function pointIn(p,r,pad=0){return Math.abs(p.x-r.x)<r.w/2+pad&&Math.abs(p.z-r.z)<r.d/2+pad;}
export function segmentHits(a,b,r,pad=0){let lo=0,hi=1;for(const k of ['x','z']){const half=(k==='x'?r.w:r.d)/2+pad,min=r[k]-half,max=r[k]+half,delta=b[k]-a[k];if(Math.abs(delta)<1e-10){if(a[k]<=min||a[k]>=max)return false;}else{let t=(min-a[k])/delta,u=(max-a[k])/delta;if(t>u)[t,u]=[u,t];lo=Math.max(lo,t);hi=Math.min(hi,u);if(lo>=hi)return false;}}return hi>0&&lo<1;}
export function fits(layout,item,ignore=null){
 const r=itemBounds(item),halfW=layout.width/2,halfD=layout.depth/2;
 if(Math.abs(r.x)+r.w/2>halfW-.08||Math.abs(r.z)+r.d/2>halfD-.08)return false;
 if(layout.aisles.some(a=>overlaps(r,a,.07))||layout.partitions.some(a=>overlaps(r,a,.1)))return false;
 return !layout.items.some(o=>o.id!==ignore&&overlaps(r,itemBounds(o),.12));
}
export function makeInterior(h,kind='home',key='',saved={}){
 const rng=random(interiorSeed(key+':'+(saved.seed||0))),width=Math.max(.5,h.L-WALL*2),depth=Math.max(.5,h.D-WALL*2),dx=doorOffset(h.L,key),doorWidth=1.7;
 const layout={version:INTERIOR_VERSION,key,kind,width,depth,door:{x:dx,z:h.D/2,width:doorWidth,open:saved.doorOpen!==false},aisles:[{x:dx,z:0,w:AISLE,d:depth}],partitions:[],rooms:[{name:'Main room',z:0,d:depth}],items:[]};
 if(width>5&&depth>8&&!['warehouse','barn','stables','shrine','temple','chapel','smithy','ruin'].includes(kind)){
  const z=-depth*.12,left=-width/2,right=width/2,a=dx-AISLE/2,b=dx+AISLE/2;
  if(a>left+.3)layout.partitions.push({x:(left+a)/2,z,w:a-left,d:.13});
  if(b<right-.3)layout.partitions.push({x:(b+right)/2,z,w:right-b,d:.13});
  layout.rooms=[{name:['home','farmhouse','manor','inn'].includes(kind)?'Sleeping room':'Back room',z:(-depth/2+z)/2,d:z+depth/2},{name:'Main room',z:(z+depth/2)/2,d:depth/2-z}];
 }
 const base=PLANS[kind]||HOME,area=width*depth,extras=kind==='home'||kind==='farmhouse'||kind==='manor'?['bed','chest','table','chair']:['shop','store','market','warehouse','granary'].includes(kind)?['shelf','crate','barrel','shelf','table']:base.slice(0,5),plan=[...base,...Array.from({length:Math.min(3,Math.floor(area/70))},()=>extras).flat()];
 const removed=new Set(saved.removed||[]);
 plan.forEach((type,index)=>{
  const id=type+'_'+index,prototype=FURNITURE[type];
  const item={id,type,name:NAMES[type]||type[0].toUpperCase()+type.slice(1),...prototype,x:0,z:0,rot:0};
  const candidates=[];
  for(const rot of [0,Math.PI/2]){const w=rot?item.d:item.w,d=rot?item.w:item.d;const xs=[-width/2+w/2+.12,width/2-w/2-.12,-width*.24,width*.24],zs=[-depth/2+d/2+.12,depth/2-d/2-.12,-depth*.25,depth*.25];
   for(const x of xs)for(const z of zs)candidates.push({x,z,rot,score:rng()+(['bed','hearth','shelf','forge','altar'].includes(type)?(z>0?2:0):0)});
  }
  candidates.sort((a,b)=>a.score-b.score);for(const c of candidates){Object.assign(item,c);if(fits(layout,item)){delete item.score;layout.items.push({...item});break;}}
  if(type==='bed'&&!layout.items.some(o=>o.id===id)){item.w=.8;item.d=1.85;item.name='Narrow bed';for(const c of candidates){Object.assign(item,c);if(fits(layout,item)){delete item.score;layout.items.push({...item});break;}}}
 });
 layout.items=layout.items.filter(o=>!removed.has(o.id));
 // Apply saved moves only when still valid for the current footprint/type.
 for(const item of layout.items){const move=saved.moved?.[item.id];if(move){const next={...item,...move};if(fits(layout,next,item.id))Object.assign(item,next);}}
 return layout;
}
export function validateInterior(layout){
 const errors=[];for(const o of layout.items)if(!fits({...layout,items:layout.items.filter(x=>x.id!==o.id)},o))errors.push(o.id+' overlaps furniture, a wall, or the reserved aisle');
 // The reserved full-depth aisle crosses the partition openings and reaches every room.
 const start={x:layout.door.x,z:layout.depth/2-.12},end={x:layout.door.x,z:-layout.depth/2+.12};
 if(layout.items.some(o=>o.blocks&&segmentHits(start,end,itemBounds(o),.3))||layout.partitions.some(r=>segmentHits(start,end,r,.3)))errors.push('Entrance-to-rear route is blocked');
 return errors;
}
