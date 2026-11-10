import * as THREE from 'three';
import { Builder } from './places.js';
import { PAL, M } from './style.js';
import { squareCenter } from './detail.js';
import { makeInterior, doorOffset, localPoint, worldPoint, itemBounds, pointIn, segmentHits, fits, validateInterior, WALL, interiorSeed } from './interior-layout.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const h=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(v!=null)e.setAttribute(k,v);}for(const c of kids.flat())if(c!=null)e.append(c);return e;};

export function drawItem(b,o){
 const m=M(o.x,.13,o.z,o.rot||0),w=o.w,d=o.d;
 const box=(x,y,z,L,H,D,col=PAL.wood)=>b.box(m,x,y,z,L,H,D,col);
 const legs=(height)=>{for(const x of [-1,1])for(const z of [-1,1])box(x*(w/2-.12),0,z*(d/2-.12),.12,height,.12,PAL.woodDark);};
 switch(o.type){
  case 'bed':legs(.25);box(0,.22,0,w,.17,d);box(0,.39,0,w-.08,.16,d-.08,PAL.canvas);box(0,.54,-d*.32,w-.18,.12,.38,PAL.plaster);box(0,.38,-d/2+.06,w,.48,.12,PAL.woodDark);break;
  case 'table':case 'workbench':case 'counter':legs(o.h-.12);box(0,o.h-.12,0,w,.12,d,PAL.woodLight);if(o.type==='counter')box(0,.12,d/2-.06,w,o.h-.24,.12);break;
  case 'chair':legs(.4);box(0,.4,0,w,.1,d);box(0,.45,-d/2+.04,w,.4,.08);break;
  case 'bench':for(const x of [-1,1])box(x*(w/2-.2),0,0,.12,.4,d);box(0,.4,0,w,.1,d,PAL.woodLight);break;
  case 'shelf':
   box(0,0,-d/2+.035,w,o.h,.07,PAL.woodDark);for(const x of [-1,1])box(x*(w/2-.05),0,0,.1,o.h,d);
   for(const y of [.08,.58,1.08,1.6]){box(0,y,0,w,.07,d,PAL.woodLight);if(y<1.5)for(let i=0;i<4;i++)box(-w*.36+i*w*.23,y+.08,0,w*.14,.24+(i%2)*.09,d*.65,i%2?PAL.canvas:PAL.wood);}
   break;
  case 'barrel':b.barrel(m,0,0);break;
  case 'crate':box(0,0,0,w,o.h,d,PAL.woodLight);for(const z of [-1,1]){box(0,.13,z*(d/2+.01),w,.07,.025,PAL.woodDark);box(0,o.h-.2,z*(d/2+.01),w,.07,.025,PAL.woodDark);}break;
  case 'chest':box(0,0,0,w,o.h,d);for(const x of [-1,1])box(x*w*.28,0,0,.06,o.h+.02,d+.02,PAL.iron);box(0,o.h*.55,d/2+.02,.1,.13,.05,PAL.iron);break;
  case 'hearth':case 'forge':
   box(0,0,0,w,.2,d,PAL.stoneDark);for(const x of [-1,1])box(x*(w/2-.12),.2,0,.24,o.h-.2,d,PAL.stone);box(0,o.h-.18,0,w,.18,d,PAL.stoneDark);box(0,.2,0,w-.45,.14,d*.65,PAL.iron);break;
  case 'anvil':box(0,0,0,w*.6,.45,d,PAL.woodDark);box(0,.45,0,w*.4,.25,d*.7,PAL.iron);box(0,.7,0,w,.15,d,PAL.iron);break;
  case 'altar':box(0,0,0,w*.75,.85,d*.8,PAL.stoneDark);box(0,.85,0,w,.2,d,PAL.stoneLight);break;
  case 'rack':for(const x of [-1,1])box(x*(w/2-.06),0,0,.12,o.h,.15);box(0,.4,0,w,.12,.18);box(0,1.1,0,w,.12,.18);for(let i=0;i<4;i++)box(-w*.35+i*w*.23,.1,.06,.05,1.25,.05,PAL.iron);break;
  case 'hay':box(0,0,0,w,o.h,d,PAL.hay);for(const x of [-1,1])box(x*w*.28,0,0,.035,o.h+.01,d+.01,PAL.woodDark);break;
 }
}
export class Interiors{
 constructor(app){this.app=app;this.loaded=new Map();this.cache=new Map();this.ensure();app.world.interiors=this;this.el=h('div',{id:'interiorPanel',class:'panel',hidden:''});this.el.addEventListener('pointerdown',e=>e.stopPropagation());this.el.addEventListener('wheel',e=>e.stopPropagation(),{passive:true});document.body.append(this.el);}
 ensure(){return this.app.world.data.interiors||=( {} );}
 kind(S,house,key){const o=this.app.world.data.buildings?.[key],sp=this.app.buildings.specials(S).get(key);return o?.kind||sp?.kind||(o?.special?this.app.buildings.building(key)?.kind:null)||({palace:'manor',farmhouse:'farmhouse',barn:'barn',temple:'temple',inn:'inn',smithy:'smithy',guildhall:'guildhall'})[house.role]||'home';}
 layout(key,found=null){
  const f=found||this.app.buildings.find(key);if(!f)return null;
  const kind=this.kind(f.S,f.h,key),saved=this.ensure()[key]||{},sig=JSON.stringify([f.h.L,f.h.D,kind,saved]),cached=this.cache.get(key);
  if(cached?.sig===sig){cached.house=f.h;cached.settlement=f.S;return cached;}
  const plan=makeInterior(f.h,kind,key,saved),entry={key,house:f.h,settlement:f.S,kind,plan,sig};
  if(validateInterior(plan).length)throw Error('Invalid interior '+key);
  this.cache.set(key,entry);if(this.cache.size>256)this.cache.delete(this.cache.keys().next().value);return entry;
 }
 free(key){const group=this.loaded.get(key);if(!group)return;this.app.scene.remove(group);group.traverse(o=>o.geometry?.dispose());this.loaded.delete(key);}
 reset(){for(const key of this.loaded.keys())this.free(key);this.cache.clear();this.ensure();this.el.hidden=true;this.focus=null;}
 build(entry){
  this.free(entry.key);const {plan,house}=entry,b=new Builder(interiorSeed(entry.key)),walls=new Builder(interiorSeed(entry.key)+1);
  b.box(null,0,.105,0,plan.width,.025,plan.depth,['warehouse','smithy','temple','shrine','chapel'].includes(entry.kind)?PAL.flag2:PAL.wood);
  const items=[];for(const o of plan.items){const part=new Builder(interiorSeed(entry.key+':'+o.id));drawItem(part,o);const item=part.geometry(false);item.userData.propRef={type:'interior',id:`interior:${entry.key}:${o.id}`,buildingKey:entry.key,itemId:o.id,kind:o.type,name:o.name,space:null,level:0};items.push(item);}
  for(const p of plan.partitions)walls.box(null,p.x,.12,p.z,p.w,2.4,p.d,PAL.plaster2);
  const dx=plan.door.x,L=plan.door.width-.08,z=house.D/2;
  if(plan.door.open){const m=M(dx-L/2,.12,z,Math.PI/2);b.box(m,-L/2,0,0,L,2.03,.075,PAL.woodDark);}
  else b.box(null,dx,.12,z,L,2.03,.075,PAL.woodDark);
  const group=b.geometry(false),shell=walls.geometry(true);for(const o of [...shell.children,...items])group.add(o);
  group.position.set(house.x,house.floor,house.z);group.rotation.y=house.yaw||0;group.userData.interiorKey=entry.key;group.userData.signature=entry.sig;
  this.app.scene.add(group);this.loaded.set(entry.key,group);return group;
 }
 update(){
  const a=this.app,dist=a.camDist();if(dist>300||(a.detailLevel||0)!==0){for(const key of this.loaded.keys())this.free(key);return false;}
  const t=a.controls.target,range=Math.min(150,Math.max(55,dist*1.4+30)),candidates=[];
  for(const [sid,r]of a.towns.loaded)if(r.level==='near'){const S=a.world.data.settlements.find(s=>s.id===sid);if(!S||!a.towns.visible(S,a.role))continue;for(const house of r.houses){const d=Math.hypot(house.x-t.x,house.z-t.z);if(d<range)candidates.push({S,h:house,key:a.buildings.keyOf(S,house),d});}}
  candidates.sort((x,y)=>x.d-y.d);const wanted=candidates.slice(0,a.quality.name==='high'?16:8),keep=new Set(wanted.map(x=>x.key));for(const key of this.loaded.keys())if(!keep.has(key))this.free(key);
  let built=false,pending=false;for(const f of wanted){const e=this.layout(f.key,f),group=this.loaded.get(f.key);if(!group||group.userData.signature!==e.sig){if(!built){this.build(e);built=true;}else pending=true;}else{group.position.set(f.h.x,f.h.floor,f.h.z);group.rotation.y=f.h.yaw||0;}}
  return pending;
 }
 candidates(a,b=a){
  const out=[],app=this.app,minX=Math.min(a.x,b.x)-1,maxX=Math.max(a.x,b.x)+1,minZ=Math.min(a.z,b.z)-1,maxZ=Math.max(a.z,b.z)+1;
  for(const S of app.world.data.settlements){if(!app.towns.visible(S,app.role)||S.x+S.r+160<minX||S.x-S.r-160>maxX||S.z+S.r+160<minZ||S.z-S.r-160>maxZ)continue;
   for(const house of app.buildings.housesOf(S)){const r=Math.hypot(house.L,house.D)/2;if(house.x+r<minX||house.x-r>maxX||house.z+r<minZ||house.z-r>maxZ)continue;const key=app.buildings.keyOf(S,house);out.push(this.layout(key,{S,h:house,key}));}}
  return out;
 }
 at(x,z){const point={x,z};for(const e of this.candidates(point)){const p=localPoint(e.house,x,z);if(Math.abs(p.x)<e.house.L/2&&Math.abs(p.z)<e.house.D/2)return e;}return null;}
 cutHeight(x,z){const e=this.at(x,z);return e?e.house.floor+1.05:null;}
 walls(e){const {house:h,plan:p}=e,dx=p.door.x,gap=p.door.width,left=-h.L/2,right=h.L/2,a=dx-gap/2,b=dx+gap/2;
  const walls=[{x:0,z:-h.D/2+WALL/2,w:h.L,d:WALL},{x:-h.L/2+WALL/2,z:0,w:WALL,d:h.D},{x:h.L/2-WALL/2,z:0,w:WALL,d:h.D},...p.partitions];
  if(a>left)walls.push({x:(left+a)/2,z:h.D/2-WALL/2,w:a-left,d:WALL});if(b<right)walls.push({x:(right+b)/2,z:h.D/2-WALL/2,w:right-b,d:WALL});
  if(!p.door.open)walls.push({x:dx,z:h.D/2,w:gap,d:.1});return walls;
 }
 blockedSquare(sx,sz,level=0){if(level!==0)return false;const [x,z]=squareCenter(sx,sz);for(const e of this.candidates({x,z})){const p=localPoint(e.house,x,z);if(this.walls(e).some(r=>pointIn(p,r,.22))||e.plan.items.some(o=>o.blocks&&pointIn(p,itemBounds(o),.22)))return true;}return false;}
 blocksMove(ax,az,bx,bz,level=0){if(level!==0)return false;for(const e of this.candidates({x:ax,z:az},{x:bx,z:bz})){const a=localPoint(e.house,ax,az),b=localPoint(e.house,bx,bz);if(this.walls(e).some(r=>segmentHits(a,b,r,.22))||e.plan.items.some(o=>o.blocks&&segmentHits(a,b,itemBounds(o),.22)))return true;}return false;}
 edit(key,fn){const data=this.ensure(),before=clone(data[key]||{}),next=clone(before);fn(next);const apply=value=>{if(Object.keys(value).length)data[key]=clone(value);else delete data[key];this.cache.delete(key);this.free(key);this.app.maps.invalidateGrid();this.app.save();this.app.request();if(!this.el.hidden&&this.focus===key)this.show(key,this.selected);};apply(next);this.app.tools.push({undo:()=>apply(before),redo:()=>apply(next)});}
 move(key,id,dx,dz){const e=this.layout(key),o=e?.plan.items.find(o=>o.id===id);if(!o)return false;const moved={...o,x:o.x+dx,z:o.z+dz};if(!fits(e.plan,moved,id)){this.app.ui.toast('Keep furniture inside, with doors and aisles clear');return false;}this.edit(key,s=>{s.moved||={};s.moved[id]={x:moved.x,z:moved.z,rot:moved.rot};});return true;}
 remove(key,id){this.edit(key,s=>{s.removed=[...new Set([...(s.removed||[]),id])];if(s.moved)delete s.moved[id];});}
 toggleDoor(key){const e=this.layout(key);if(e)this.edit(key,s=>{s.doorOpen=!e.plan.door.open;});}
 enter(key){const e=this.layout(key);if(!e)return;const a=this.app;a.cutaway=true;a.showGrid=true;a.setTool('play');a.flyTo(e.house.x,e.house.z,Math.max(24,Math.max(e.house.L,e.house.D)*2.8),.15);a.card.close();this.show(key);a.ui.refresh();a.request();}
 tap(g){if(!g||this.app.camDist()>220)return false;for(const e of this.candidates(g)){const p=localPoint(e.house,g.x,g.z);if(Math.abs(p.z-e.house.D/2)<.7&&Math.abs(p.x-e.plan.door.x)<1.05){if(this.app.role==='gm')this.toggleDoor(e.key);return true;}}
  if(!this.app.cutaway)return false;const e=this.at(g.x,g.z);if(!e)return false;const p=localPoint(e.house,g.x,g.z),o=e.plan.items.find(o=>pointIn(p,itemBounds(o),.08));if(o){this.show(e.key,o.id);return true;}return false;
 }
 close(){if(this.el.hidden)return false;this.el.hidden=true;return true;}
 show(key,selected=null){
  const e=this.layout(key);if(!e)return;this.focus=key;this.selected=selected||this.selected;const a=this.app,gm=a.role==='gm',building=a.buildings.building(key),plan=e.plan,item=plan.items.find(o=>o.id===this.selected)||plan.items[0];this.selected=item?.id;this.el.hidden=false;
  const title=building?.name||'Building interior',feet=n=>(n*5/1.5).toFixed(0);
  this.el.replaceChildren(h('div',{class:'chead'},h('div',{class:'ctitle'},title),h('button',{class:'cx',onclick:()=>this.close()},'Close')),h('div',{class:'cbody'},
   h('div',{class:'csub'},feet(plan.width)+' x '+feet(plan.depth)+' ft usable floor / '+plan.rooms.length+' room'+(plan.rooms.length===1?'':'s')),
   h('div',{class:'dim'},'5 feet per square. Ground floor. Door and central aisle kept clear.'),
   gm?h('button',{class:'chip',onclick:()=>this.toggleDoor(key)},plan.door.open?'Close door':'Open door'):null,
   h('select',{'aria-label':'Furniture',onchange:ev=>this.show(key,ev.target.value)},plan.items.map(o=>h('option',{value:o.id,...(o.id===item?.id?{selected:''}:{})},o.name))),
   item?h('div',{},'Suggested cover: '+item.cover):h('div',{},'This room is empty.'),
   item?h('button',{class:'chip',onclick:()=>a.propInspector.show({type:'interior',id:`interior:${key}:${item.id}`,buildingKey:key,itemId:item.id,kind:item.type,name:item.name,space:null,level:0})},'Inspect prop'):null,
   gm&&item?h('button',{class:'chip',onclick:()=>a.underground.concealUnder(key,item.id)},'Hide trapdoor beneath '+item.name):null,
   gm&&item?h('div',{class:'interior-controls'},h('span',{class:'dim'},'Move 2.5 feet (in building directions)'),[['Left',-.75,0],['Right',.75,0],['Back',0,-.75],['Front',0,.75]].map(([name,x,z])=>h('button',{class:'chip',onclick:()=>this.move(key,item.id,x,z)},name)),h('button',{class:'chip',onclick:()=>this.remove(key,item.id)},'Remove')):null,
   gm?h('button',{class:'chip',onclick:()=>this.edit(key,s=>{delete s.moved;delete s.removed;delete s.seed;})},'Reset furnishings'):null));
 }
}
