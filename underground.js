// Pocket battle maps with persistent surface entrances. Geometry and camera objects are runtime only.
import * as THREE from 'three';
import { Detail, SQ, encodeTile, squareAt, squareCenter } from './detail.js';
import { Maps } from './maps.js';
import { Builder } from './places.js';
import { buildObject } from './objects.js';
import { DD2VTTImports } from './dd2vtt.js';
import { AtlasShadows } from './shadows.js';
import { PAL, M, CUT } from './style.js';
import { localPoint, worldPoint, itemBounds, pointIn } from './interior-layout.js';
import {cellarBounds,resizePreview,resizeCellar} from './cellar-layout.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const h=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(v!=null)e.setAttribute(k,v);}for(const c of kids.flat())if(c!=null)e.append(c);return e;};
const id=prefix=>prefix+crypto.randomUUID();
export class Underground {
 constructor(app){
  this.app=app;this.active=null;this.armed=null;this.markers=new Map();this.ensure();
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#211a12');this.scene.fog=new THREE.Fog('#211a12',90,300);
  this.scene.add(new THREE.HemisphereLight('#c1c2cc','#51412c',.12));const sun=new THREE.DirectionalLight('#ffffff',0);this.scene.add(sun);this.shadows=new AtlasShadows(app.renderer,sun,this.scene);
  const self=this;
  this.facade={get spaceId(){return self.active?.id;},get campaignData(){return self.app.world.data;},get data(){return self.mapData;},latticeHeight:()=>0,height:()=>0};
  this.mapData={get detail(){return self.active.detail;},get imports(){return self.active.imports;},set imports(value){self.active.imports=value;},get tokens(){return self.app.world.data.tokens.filter(t=>t.space===self.active?.id);},battlemaps:[],settlements:[],roads:[],rivers:[]};
  this.detail=new Detail(this.facade,this.scene);this.maps=new Maps(this.facade,this.scene,{version:0,floorAt:()=>null});
  this.lights=Array.from({length:6},()=>{const l=new THREE.PointLight(PAL.halo,0,24,2);l.castShadow=true;l.shadow.mapSize.set(512,512);l.shadow.camera.near=.1;l.shadow.normalBias=.04;l.shadow.bias=-.0002;this.scene.add(l);return l;});
  const proxy=Object.create(app);Object.defineProperties(proxy,{world:{value:this.facade},scene:{value:this.scene},maps:{value:this.maps},detail:{value:this.detail},props:{value:{invalidateAll(){}}},towns:{value:{freeAll(){}}},microDetail:{value:{invalidate(){}}}});
  // Reuse the proven structure renderer/collision without creating another import dialog.
  this.importer=Object.create(DD2VTTImports.prototype);Object.assign(this.importer,{app:proxy,loaded:new Map(),placing:false,panel:{hidden:true}});
  this.facade.ddImports=this.importer;
  this.importer.edit=(fn)=>{if(this.app.role!=='gm'||!this.active)return;const map=this.active,before=clone(map.imports);fn(map.imports);const after=clone(map.imports),apply=value=>{map.imports=clone(value);if(this.active?.id===map.id)this.importer.refresh(false);this.app.save();this.app.request();};apply(after);this.app.tools.push({undo:()=>apply(before),redo:()=>apply(after)});};
  this.panel=h('div',{id:'undergroundPanel',class:'panel',hidden:''});this.panel.addEventListener('pointerdown',e=>e.stopPropagation());this.panel.addEventListener('wheel',e=>e.stopPropagation(),{passive:true});document.body.append(this.panel);
  this.pins=h('div',{id:'undergroundPins'});document.body.append(this.pins);
  this.renderApp=Object.create(app);Object.defineProperty(this.renderApp,'weather',{value:{night:1}});
 }
 ensure(){const d=this.app.world.data;d.underground||={version:1,maps:[],entrances:[],session:null};d.underground.maps||=[];d.underground.entrances||=[];return d.underground;}
 get currentSpace(){return this.active?.id||null;}
 inSpace(token){return(token.space||null)===this.currentSpace;}
 view(){const a=this.app;return{target:a.controls.target.toArray(),camera:a.camera.position.toArray(),cutaway:a.cutaway,grid:a.showGrid,tool:a.tool,detailLevel:a.detailLevel,min:a.controls.minDistance,max:a.controls.maxDistance,exposure:a.renderer.toneMappingExposure};}
 jump(view){const a=this.app;a.stopFlight();a.controls.target.fromArray(view.target);a.camera.position.fromArray(view.camera);a.controls.update();a.request();}
 visible(e){if(this.app.role==='gm')return true;if(this.covered(e))return false;if(!e.known)return false;if(e.buildingKey){const f=this.app.buildings.find(e.buildingKey);if(f&&!f.S.known)return false;}return true;}
 reset(){if(this.active)this.leave(false);this.armed=null;this.panel.hidden=true;this.clearSurface();this.ensure();}
 resume(){const s=this.ensure().session;if(s&&this.ensure().maps.some(m=>m.id===s.mapId))this.enter(s.mapId,s.entranceId,true);else this.ensure().session=null;}
 edit(fn){if(this.app.role!=='gm')return;const before=clone(this.ensure());fn(this.ensure());const after=clone(this.ensure());const apply=value=>{const activeId=this.active?.id,session=clone(this.ensure().session);if(activeId&&!value.maps.some(m=>m.id===activeId))this.leave(false);this.app.world.data.underground=clone(value);if(this.active){this.active=this.ensure().maps.find(m=>m.id===activeId);this.ensure().session=session;this.detail.reset();this.maps.freeAll();this.importer.refresh(false);}else this.ensure().session=null;this.clearSurface();this.app.save();this.app.request();};if(this.active){this.detail.reset();this.maps.freeAll();}this.clearSurface();this.app.save();this.app.request();this.app.tools.push({undo:()=>apply(before),redo:()=>apply(after)});}
 fillFloor(detail,sx,sz,w,height){const keys=new Set();for(let z=0;z<height;z++)for(let x=0;x<w;x++){const [key,k]=detail.address(0,sx+x,sz+z);detail.tile(key,true).ground[k]=2;keys.add(key);}for(const key of keys)detail.world.data.detail[key]=encodeTile(detail.tile(key));}
 create(name='Underground cellar',w=16,height=12){
  const a=this.app;w=Math.max(6,Math.min(120,Math.round(+w)||16));height=Math.max(6,Math.min(120,Math.round(+height)||12));
  const [cx,cz]=squareAt(0,0),sx=cx-Math.floor(w/2),sz=cz-Math.floor(height/2),data={detail:{}};
  const draft=new Detail({data,latticeHeight:()=>0},new THREE.Scene());
  this.fillFloor(draft,sx,sz,w,height);
  for(let z=0;z<height;z++)draft.setSquare(0,sx,sz+z,{wallW:1});for(let x=0;x<w;x++)draft.setSquare(0,sx+x,sz,{wallN:1});
  for(let z=0;z<height;z++)draft.setSquare(0,sx+w,sz+z,{wallW:1});for(let x=0;x<w;x++)draft.setSquare(0,sx+x,sz+height,{wallN:1});
  const entry={sx:cx,sz:sz+height-2};
  for(const [x,z]of [[sx+2,sz+2],[sx+w-3,sz+2],[sx+2,sz+height-3],[sx+w-3,sz+height-3]])draft.setSquare(0,x,z,{object:{k:'brazier',rot:0}});
  for(const [x,z,k]of [[sx+2,sz+4,'crate'],[sx+w-3,sz+4,'barrel'],[sx+2,sz+height-5,'bookshelf']])draft.setSquare(0,x,z,{object:{k,rot:0}});
  draft.setSquare(0,entry.sx,entry.sz,{object:{k:'stairs-up',rot:0}});
  const m={id:id('ug_'),name:String(name).trim().slice(0,160)||'Underground cellar',w,h:height,origin:{sx,sz},detail:data.detail,imports:[],entry,combat:null};this.edit(d=>d.maps.push(m));return this.ensure().maps.find(v=>v.id===m.id);
 }
 entrance(mapId,at,kind='trapdoor',name=null,buildingKey=null,known=true){
  if(this.app.role!=='gm'||(mapId&&!this.ensure().maps.some(m=>m.id===mapId)))return null;const site=!this.active?this.app.interiors.at(at.x,at.z):null;if(site&&!buildingKey)buildingKey=site.key;const local=site?localPoint(site.house,at.x,at.z):null;const base=(buildingKey?this.app.buildings.building(buildingKey)?.name:null)||'Surface';const e={id:id('entrance_'),mapId,x:at.x,z:at.z,yaw:at.yaw||0,kind,name:this.uniqueName(name||base+' '+kind),buildingKey,known,...(local?{localX:local.x,localZ:local.z}:{})};this.edit(d=>d.entrances.push(e));return e;
 }

 uniqueName(base,except=null){base=String(base).trim().slice(0,140)||'Surface trapdoor';let name=base,n=2;while(this.ensure().entrances.some(e=>e.id!==except&&e.name===name))name=base+' '+n++;return name;}
 exitFor(e){for(const m of this.ensure().maps){const exit=(m.exits||[]).find(v=>v.entranceId===e?.id);if(exit)return{map:m,exit};}return null;}
 covered(e){
  const c=e.cover;if(!c)return false;if(c.ref)return this.app.propInspector?.covers(c.ref,e)||false;if(c.itemId){const layout=this.app.interiors.layout(c.buildingKey),item=layout?.plan.items.find(o=>o.id===c.itemId);if(!item)return false;const p=this.anchor(e);return pointIn(localPoint(layout.house,p.x,p.z),itemBounds(item));}
  return !c.aside&&Math.hypot(c.dx||0,c.dz||0)<.7;
 }
 updateEntrance(eid,patch){this.edit(d=>{const e=d.entrances.find(e=>e.id===eid);if(e)Object.assign(e,patch);});}
 concealUnder(key,itemId){
  if(this.app.role!=='gm')return;const layout=this.app.interiors.layout(key),item=layout?.plan.items.find(o=>o.id===itemId);if(!item)return;
  let e=this.ensure().entrances.find(e=>e.buildingKey===key&&e.cover?.itemId===itemId)||this.ensure().entrances.find(e=>e.buildingKey===key&&!e.cover);
  if(!e)e=this.entrance(null,worldPoint(layout.house,item.x,item.z),'trapdoor',null,key);
  this.updateEntrance(e.id,{localX:item.x,localZ:item.z,cover:{buildingKey:key,itemId}});
  this.app.interiors.close();this.editEntrance(e.id);this.app.ui.toast('Trapdoor hidden beneath '+item.name+'. Move the furnishing to expose it.');
 }
 arm(value){if(this.app.role!=='gm')return;this.app.setTool('look');this.app.ruler.on=false;this.armed=value;this.panel.hidden=true;this.app.ui.toast(value.exit?'Tap a clear cellar square for the linked stairs or ladder.':'Tap the surface to place the entrance.');}
 placeExit(entranceId,g,kind='stairs-up',map=this.active){
  if(!map||this.app.role!=='gm')return false;const [sx,sz]=squareAt(g.x,g.z),detail=new Detail({data:map,latticeHeight:()=>0},new THREE.Scene()),cell=detail.getSquare(0,sx,sz),e=this.ensure().entrances.find(e=>e.id===entranceId),checker=Object.create(DD2VTTImports.prototype);checker.app={world:{data:map}};
  if(!e||cell.ground<=1||cell.ground>=12||detail.objectBlocked(0,sx,sz)||checker.blockedSquare(sx,sz,0)||detail.wallBlocked(0,sx,sz)||(cell.object&&!['stairs-up','ladder'].includes(cell.object.k))){this.app.ui.toast('Choose a clear floor square.');return false;}
  if((map.exits||[]).some(v=>v.sx===sx&&v.sz===sz&&v.entranceId!==entranceId)){this.app.ui.toast('Those stairs already have a link.');return false;}
  const mapId=map.id;
  this.edit(d=>{
   for(const m of d.maps){const old=(m.exits||[]).filter(v=>v.entranceId===entranceId);if(old.length){const draft=new Detail({data:m,latticeHeight:()=>0},new THREE.Scene());for(const v of old){const o=draft.getSquare(0,v.sx,v.sz).object;if(['stairs-up','ladder'].includes(o?.k))draft.setSquare(0,v.sx,v.sz,{object:null});}m.exits=m.exits.filter(v=>v.entranceId!==entranceId);}}
   const m=d.maps.find(m=>m.id===mapId);
   if(!(m.exits||[]).length&&(sx!==m.entry.sx||sz!==m.entry.sz)){const draft=new Detail({data:m,latticeHeight:()=>0},new THREE.Scene());if(draft.getSquare(0,m.entry.sx,m.entry.sz).object?.k==='stairs-up')draft.setSquare(0,m.entry.sx,m.entry.sz,{object:null});}
   m.exits||=[];m.exits.push({id:id('exit_'),entranceId,sx,sz,kind});
   new Detail({data:m,latticeHeight:()=>0},new THREE.Scene()).setSquare(0,sx,sz,{object:{k:kind,rot:0}});
   d.entrances.find(e=>e.id===entranceId).mapId=mapId;
  });return true;
 }
 exitPresent(exit){return ['stairs-up','ladder'].includes(this.detail.getSquare(0,exit.sx,exit.sz).object?.k);}
 useEntrance(e){if(!this.visible(e))return false;if(this.covered(e)){if(this.app.role==='gm'){this.editEntrance(e.id);this.app.ui.toast('Move the cover aside to expose this trapdoor.');}return true;}if(!e.mapId){if(this.app.role==='gm')this.editEntrance(e.id);this.app.ui.toast('This entrance is not linked to cellar stairs yet.');return true;}return this.enter(e.mapId,e.id);}
 exitAt(exit){
  const e=this.ensure().entrances.find(e=>e.id===exit.entranceId);
  if(!e||!this.exitPresent(exit)||!this.visible(e)||this.covered(e)){this.app.ui.toast('The surface exit is hidden or covered.');return false;}
  this.leave(true,e.id);return true;
 }
 removeEntrance(eid){this.edit(d=>{d.entrances=d.entrances.filter(e=>e.id!==eid);for(const m of d.maps){const exits=(m.exits||[]).filter(v=>v.entranceId===eid),draft=new Detail({data:m,latticeHeight:()=>0},new THREE.Scene());for(const v of exits)if(['stairs-up','ladder'].includes(draft.getSquare(0,v.sx,v.sz).object?.k))draft.setSquare(0,v.sx,v.sz,{object:null});m.exits=(m.exits||[]).filter(v=>v.entranceId!==eid);}});}

 anchor(e){const a=this.app;if(e.buildingKey){const f=a.buildings.find(e.buildingKey);if(f){const p=worldPoint(f.h,e.localX??0,e.localZ??0);return{...p,y:f.h.floor+.14,yaw:f.h.yaw};}}return{x:e.x,z:e.z,y:a.maps.ground(e.x,e.z)+.08,yaw:e.yaw||0};}
 linkBuilding(key,mapId=null){
  const a=this.app,b=a.buildings.building(key);if(!b)return;
  if(!mapId){const number=this.ensure().entrances.filter(e=>e.buildingKey?.startsWith(b.settlement.id+':')).length+1;mapId=this.create(b.plain?b.settlement.name+' house cellar '+number:b.name+' - cellar').id;}
  const layout=a.interiors.layout(key),localX=layout.plan.door.x,localZ=Math.max(-b.house.D/2+1.5,b.house.D/2-2.2),p=worldPoint(b.house,localX,localZ);
  const e=this.entrance(mapId,{...p,yaw:b.house.yaw},'trapdoor',b.name+' trapdoor',key);
  if(e){const record=this.ensure().entrances.find(v=>v.id===e.id);Object.assign(record,{localX,localZ});a.save();}
  a.card.close();a.interiors.enter(key);a.interiors.close();this.panel.hidden=true;a.ui.toast('Cellar linked. Click the trapdoor to go below.');return e;
 }
 configureBuilding(key){
  const b=this.app.buildings.building(key);this.heading('Underground entrance: '+b.name);
  for(const e of this.ensure().entrances.filter(e=>e.buildingKey===key))this.panel.append(h('button',{onclick:()=>this.enter(e.mapId,e.id)},'Enter '+(this.ensure().maps.find(m=>m.id===e.mapId)?.name||'cellar')));
  this.panel.append(h('button',{onclick:()=>this.linkBuilding(key)},'Create cellar and link'));
  if(this.ensure().maps.length)this.panel.append(h('button',{onclick:()=>{const layout=this.app.interiors.layout(key),p=worldPoint(layout.house,layout.plan.door.x,layout.house.D/2-2.2),e=this.entrance(null,p,'trapdoor',b.name+' trapdoor',key);if(e)this.editEntrance(e.id,'nearby');}},'Choose existing cellar'));
 }
 linkEntrance(eid,mapId,preserveLegacy=true){
  if(this.app.role!=='gm')return false;const map=this.ensure().maps.find(m=>m.id===mapId),e=this.ensure().entrances.find(e=>e.id===eid);if(!map||!e)return false;
  if(this.exitFor(e)?.map.id===mapId)return true;
  if(preserveLegacy)for(const other of this.ensure().entrances.filter(v=>v.id!==eid&&v.mapId===mapId&&!this.exitFor(v)))if(!this.linkEntrance(other.id,mapId,false))return false;
  const detail=new Detail({data:map,latticeHeight:()=>0},new THREE.Scene()),checker=Object.create(DD2VTTImports.prototype);checker.app={world:{data:map}};
  for(let r=0;r<=Math.max(map.w,map.h);r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
   if(r&&Math.abs(dx)!==r&&Math.abs(dz)!==r)continue;const sx=map.entry.sx+dx,sz=map.entry.sz+dz,cell=detail.getSquare(0,sx,sz);
   if(cell.ground<=1||cell.ground>=12||detail.wallBlocked(0,sx,sz)||detail.objectBlocked(0,sx,sz)||checker.blockedSquare(sx,sz,0)||(cell.object&&!['stairs-up','ladder'].includes(cell.object.k))||(map.exits||[]).some(v=>v.sx===sx&&v.sz===sz))continue;
   const[x,z]=squareCenter(sx,sz);return this.placeExit(eid,{x,z},'stairs-up',map);
  }
  this.app.ui.toast('No clear square for return stairs in that cellar.');return false;
 }
 editEntrance(eid,browse=null){
  if(this.app.role!=='gm')return;const e=this.ensure().entrances.find(e=>e.id===eid);if(!e){this.panel.hidden=true;return;}
  const refresh=()=>this.editEntrance(eid,browse),map=this.ensure().maps.find(m=>m.id===e.mapId),route=this.exitFor(e);this.heading(e.name);
  const name=h('input',{value:e.name,'aria-label':'Entrance name'});
  this.panel.append(name,h('button',{onclick:()=>{this.updateEntrance(eid,{name:this.uniqueName(name.value,eid)});refresh();}},'Rename entrance'),h('p',{},map?'Destination: '+map.name:'This trapdoor has no destination yet.'),h('p',{},this.covered(e)?'Covered. Move the prop to expose this trapdoor.':'Entrance exposed.'),h('button',{onclick:()=>{this.updateEntrance(eid,{known:!e.known});refresh();}},e.known?'Players: revealed':'Players: hidden'));
  if(map)this.panel.append(h('button',{onclick:()=>this.enter(map.id)},'Edit linked cellar'),h('button',{onclick:()=>this.mapMenu(map.id)},'Cellar settings'));
  if(!map){const title=h('input',{value:e.name.replace(/\s*(trapdoor|door)\s*\d*$/i,'')+' cellar','aria-label':'New cellar name'}),w=h('input',{type:'number',min:6,max:120,value:16,'aria-label':'New cellar width'}),height=h('input',{type:'number',min:6,max:120,value:12,'aria-label':'New cellar height'});
   this.panel.append(h('label',{},'New cellar',title),h('label',{},'Width (5-foot squares)',w),h('label',{},'Height (5-foot squares)',height),h('button',{onclick:()=>{const m=this.create(title.value,w.value,height.value);this.linkEntrance(eid,m.id);this.editEntrance(eid);}},'Create cellar for this entrance'));
  }
  if(!browse)this.panel.append(h('button',{onclick:()=>this.editEntrance(eid,'nearby')},map?'Change destination':'Choose existing cellar'));
  else{
   const at=this.anchor(e),near=new Set(this.ensure().entrances.filter(other=>{const p=this.anchor(other);return Math.hypot(p.x-at.x,p.z-at.z)<=120;}).map(other=>other.mapId)),maps=this.ensure().maps.filter(m=>m.id!==map?.id&&(browse==='all'||near.has(m.id)));
   this.panel.append(h('h3',{},browse==='all'?'Choose any cellar':'Nearby cellars'));
   if(maps.length){const select=h('select',{'aria-label':'Destination cellar'},maps.map(m=>h('option',{value:m.id},m.name)));this.panel.append(select,h('button',{onclick:()=>{if(this.linkEntrance(eid,select.value))this.editEntrance(eid);}},'Link selected cellar'));}
   else this.panel.append(h('p',{},'No other nearby cellars.'));
   if(browse!=='all')this.panel.append(h('button',{onclick:()=>this.editEntrance(eid,'all')},'Browse distant cellars'));
  }
  if(e.cover?.ref)this.panel.append(h('button',{onclick:()=>{this.panel.hidden=true;this.app.propInspector.show(e.cover.ref);}},'Inspect covering prop'));
  if(e.cover?.itemId)this.panel.append(h('button',{onclick:()=>{if(this.active)this.leave();this.panel.hidden=true;this.app.interiors.enter(e.cover.buildingKey);this.app.interiors.show(e.cover.buildingKey,e.cover.itemId);}},'Inspect covering furniture'));
  if(e.cover?.kind)this.panel.append(h('button',{onclick:()=>{this.updateEntrance(eid,{cover:{...e.cover,aside:this.covered(e),dx:0,dz:0}});refresh();}},this.covered(e)?'Move cover aside':'Replace cover'));
  if(route)this.panel.append(h('p',{},'Paired return stairs are linked to this entrance.'));
  this.panel.append(h('button',{onclick:()=>{this.removeEntrance(eid);this.panel.hidden=true;}},'Remove entrance'));
 }
 heading(title){this.panel.hidden=false;this.panel.classList.remove('cellar-menu');delete this.panel.dataset.mapMenu;this.panel.replaceChildren(h('div',{class:'chead'},h('strong',{},title),h('button',{onclick:()=>{this.panel.hidden=true;this.armed=null;this.app.request();}},'Close')));}
 saveSettings(mapId,name,w,height){
  if(this.app.role!=='gm')return false;const map=this.ensure().maps.find(m=>m.id===mapId);if(!map)return false;const preview=resizePreview(map,w,height,this.app.world.data.tokens);if(!preview.ok){this.app.ui.toast(preview.message);return false;}
  const next=resizeCellar(map,w,height,this.app.world.data.tokens);next.name=String(name).trim().slice(0,160)||map.name;
  if(JSON.stringify(next)===JSON.stringify(map))return true;
  this.edit(d=>{d.maps[d.maps.findIndex(m=>m.id===mapId)]=next;});if(this.active?.id===mapId)this.active=this.ensure().maps.find(m=>m.id===mapId);this.app.ui.toast('Cellar settings saved.');return true;
 }
 mapMenu(mapId=this.active?.id,allEntrances=false){
  const map=this.ensure().maps.find(m=>m.id===mapId),a=this.app,gm=a.role==='gm',here=this.active?.id===mapId;if(!map||(!gm&&!here))return;
  a.propInspector?.close();this.heading(map.name);this.panel.classList.add('cellar-menu');this.panel.dataset.mapMenu=map.id;
  if(here){this.panel.append(h('div',{class:'cellar-tools'},['look','play',...(gm?['detail']:[])].map(tool=>h('button',{onclick:()=>{a.setTool(tool);this.panel.hidden=true;}},tool[0].toUpperCase()+tool.slice(1))),h('button',{onclick:()=>{a.showGrid=!a.showGrid;a.ui.refresh();this.mapMenu(mapId,allEntrances);}},a.showGrid?'Grid off':'Grid on'),h('button',{onclick:()=>{a.toggleTopDown();this.panel.hidden=true;}},'Top view')));}
  if(gm){
   const name=h('input',{value:map.name,'aria-label':'Cellar name'}),w=h('input',{type:'number',min:6,max:120,value:map.w,'aria-label':'Cellar width squares'}),height=h('input',{type:'number',min:6,max:120,value:map.h,'aria-label':'Cellar height squares'}),preview=h('p',{'aria-live':'polite',class:'dim'}),save=h('button',{onclick:()=>{if(this.saveSettings(mapId,name.value,w.value,height.value))this.mapMenu(mapId,allEntrances);}},'Save cellar settings');
   const update=()=>{const p=resizePreview(map,w.value,height.value,a.world.data.tokens);preview.textContent=p.message;save.disabled=!p.ok;};w.addEventListener('input',update);height.addEventListener('input',update);update();
   this.panel.append(h('label',{},'Name',name),h('label',{},'Width (5-foot squares)',w),h('label',{},'Height (5-foot squares)',height),preview,save);
   if(here){
    const linked=this.ensure().entrances.filter(e=>e.mapId===map.id),anchors=linked.map(e=>this.anchor(e)),nearby=this.ensure().entrances.filter(e=>e.mapId===map.id||(!e.mapId&&anchors.some(p=>{const q=this.anchor(e);return Math.hypot(p.x-q.x,p.z-q.z)<=120;}))),entrances=allEntrances?this.ensure().entrances:nearby;
    this.panel.append(h('h3',{},'Stairs and entrances'));
    for(const e of linked)this.panel.append(h('button',{onclick:()=>this.editEntrance(e.id)},e.name));
    if(entrances.length){const select=h('select',{'aria-label':'Link to surface entrance'},entrances.map(e=>h('option',{value:e.id},e.name))),kind=h('select',{'aria-label':'Stair or ladder'},h('option',{value:'stairs-up'},'Stairs up'),h('option',{value:'ladder'},'Ladder'));this.panel.append(select,kind,h('button',{onclick:()=>this.arm({exit:true,entranceId:select.value,kind:kind.value})},'Place linked stairs / ladder'));}
    if(!allEntrances)this.panel.append(h('button',{onclick:()=>this.mapMenu(mapId,true)},'Browse other entrances'));
    if(this.ensure().session?.entranceId)this.panel.append(h('button',{onclick:()=>{this.bring();this.panel.hidden=true;}},'Bring nearby tokens'));
    this.panel.append(h('button',{onclick:()=>{this.panel.hidden=true;a.ddImports.choose();}},'Import .dd2vtt'));
   }
   this.panel.append(h('div',{class:'cellar-tools'},h('button',{onclick:()=>{a.tools.undo();this.mapMenu(mapId,allEntrances);}},'Undo'),h('button',{onclick:()=>{a.tools.redo();this.mapMenu(mapId,allEntrances);}},'Redo')));
  }
  if(here){for(const exit of map.exits||[]){const e=this.ensure().entrances.find(e=>e.id===exit.entranceId);if(!gm&&(!e||!this.visible(e)))continue;this.panel.append(h('button',{onclick:()=>this.exitAt(exit)},'Climb to '+(e?.name||'surface')));}this.panel.append(h('button',{onclick:()=>this.leave()},'Return to surface'));}
  if(gm)this.panel.append(h('button',{onclick:()=>this.manage()},'All underground maps'));this.panel.scrollTop=0;a.request();
 }
 manage(){
  if(this.app.role!=='gm')return;this.heading(this.active?'Cellar stairs and surface entrances':'Underground maps');
  if(this.active){this.panel.append(h('button',{onclick:()=>this.leave()},'Return to surface'));if(this.ensure().session?.entranceId)this.panel.append(h('button',{onclick:()=>{this.bring();this.panel.hidden=true;}},'Bring nearby tokens'));this.panel.append(h('button',{onclick:()=>{this.panel.hidden=true;this.app.ddImports.choose();}},'Import .dd2vtt'));}
  if(!this.active)this.panel.append(h('button',{onclick:()=>this.arm({mapId:null,kind:'trapdoor'})},'Place surface trapdoor'));
  const name=h('input',{value:'Underground cellar','aria-label':'Underground map name'}),w=h('input',{type:'number',min:6,max:120,value:16,'aria-label':'Underground width squares'}),height=h('input',{type:'number',min:6,max:120,value:12,'aria-label':'Underground height squares'});
  this.panel.append(h('p',{},'Name surface trapdoors, open a cellar, then place stairs or ladders linked to those names. Each square is 5 feet.'),name,h('label',{},'Width (squares)',w),h('label',{},'Height (squares)',height),h('button',{onclick:()=>{this.create(name.value,w.value,height.value);this.manage();}},'Create underground map'));
  for(const m of this.ensure().maps){this.panel.append(h('h3',{},m.name),h('div',{},m.w*5+' x '+m.h*5+' feet'),h('button',{onclick:()=>this.enter(m.id)},'Open '+m.name),h('button',{onclick:()=>this.mapMenu(m.id)},'Settings for '+m.name));
   if(!this.active){const kind=h('select',{'aria-label':'Entrance type for '+m.name},h('option',{value:'trapdoor'},'Trapdoor'),h('option',{value:'door'},'Door'));this.panel.append(kind,h('button',{onclick:()=>this.arm({mapId:m.id,kind:kind.value})},'Place entrance to '+m.name));}
  }
  if(this.active){
   const entrances=this.ensure().entrances;
   if(entrances.length){const select=h('select',{'aria-label':'Link to surface entrance'},entrances.map(e=>h('option',{value:e.id},e.name+(this.exitFor(e)?' (linked)':'')))),kind=h('select',{'aria-label':'Stair or ladder'},h('option',{value:'stairs-up'},'Stairs up'),h('option',{value:'ladder'},'Ladder'));
    this.panel.append(h('h3',{},'Place a linked exit'),select,kind,h('button',{onclick:()=>this.arm({exit:true,entranceId:select.value,kind:kind.value})},'Place linked stairs / ladder'));
   }
   for(const exit of this.active.exits||[]){const e=entrances.find(e=>e.id===exit.entranceId);this.panel.append(h('div',{},(e?.name||'Missing entrance')+(this.exitPresent(exit)?'':' (stairs removed)'),h('button',{onclick:()=>this.exitAt(exit)},'Climb to '+(e?.name||'surface'))));}
  }
  this.panel.append(h('h3',{},'Surface entrances'));
  for(const e of this.ensure().entrances){
   const route=this.exitFor(e),input=h('input',{value:e.name,'aria-label':'Entrance name '+e.name}),cover=h('select',{'aria-label':'Cover for '+e.name},[['','No cover'],['crate','Crate'],['carpet','Carpet'],['bed','Bed']].map(([k,n])=>h('option',{value:k,...(k===(e.cover?.kind||'')?{selected:''}:{})},n)));
   this.panel.append(h('div',{class:'ug-entrance-row'},input,h('button',{onclick:()=>{this.updateEntrance(e.id,{name:this.uniqueName(input.value,e.id)});this.manage();}},'Rename'),
    h('span',{},route?'Linked to '+route.map.name:e.mapId?'Uses default cellar stairs':'Unlinked'),
    h('button',{onclick:()=>this.useEntrance(e)},'Use '+e.name),
    h('button',{onclick:()=>{this.updateEntrance(e.id,{known:!e.known});this.manage();}},e.known?'Players: revealed':'Players: hidden'),
    cover,h('button',{onclick:()=>{this.updateEntrance(e.id,{cover:cover.value?{kind:cover.value,aside:false}:null});this.manage();}},'Set cover'),
    e.cover?.kind?h('button',{onclick:()=>{this.updateEntrance(e.id,{cover:{...e.cover,aside:this.covered(e),dx:0,dz:0}});this.manage();}},this.covered(e)?'Move cover aside':'Replace cover'):null,
    e.cover?.itemId?h('button',{onclick:()=>{this.panel.hidden=true;this.app.interiors.enter(e.cover.buildingKey);this.app.interiors.show(e.cover.buildingKey,e.cover.itemId);}},this.covered(e)?'Move covering furniture':'Cover moved aside'):null,
    e.cover?.ref?h('button',{onclick:()=>{this.panel.hidden=true;this.app.propInspector.show(e.cover.ref);}},'Inspect covering prop'):null,
    h('button',{onclick:()=>{this.removeEntrance(e.id);this.manage();}},'Remove entrance')));
  }
 }
 enter(mapId,entranceId=null,resume=false){
  const d=this.ensure(),m=d.maps.find(m=>m.id===mapId),entrance=d.entrances.find(e=>e.id===entranceId);if(!m)return false;const linked=this.exitFor(entrance);if(!resume&&entrance&&(this.covered(entrance)||(linked&&linked.map.id===m.id&&!['stairs-up','ladder'].includes(new Detail({data:m,latticeHeight:()=>0},new THREE.Scene()).getSquare(0,linked.exit.sx,linked.exit.sz).object?.k)))){this.app.ui.toast('This entrance is covered or its cellar stairs were removed.');return false;}if(this.app.role!=='gm'&&(!entrance||!this.visible(entrance)))return false;
  if(this.active)this.leave();const a=this.app,saved=resume?d.session:null,surface=saved?.surface||this.view();
  a.propInspector?.close();a.tools.cancel();a.ruler.clear();a.ddImports.cancel();a.interiors.close();a.card.close();a.canon.el.hidden=true;a.rolls.hide();this.panel.hidden=true;
  this.active=m;d.session=saved||{mapId,entranceId,surface,travelers:[]};this.detail.reset();this.maps.freeAll();this.importer.refresh(false);
  this.scene.add(a.tools.cursor,a.tools.detailCursor,a.ruler.line);a.controls.minDistance=6;a.controls.maxDistance=400;a.detailLevel=0;a.cutaway=true;a.showGrid=true;a.tool='play';a.tools.toolChanged();
  const arrival=linked?.map.id===m.id?linked.exit:m.entry;d.session.arrival={sx:arrival.sx,sz:arrival.sz};const [x,z]=squareCenter(arrival.sx,arrival.sz);this.jump(saved?.view||{target:[x,.22,z],camera:[x,38,z+15]});
  this.pins.hidden=true;
  this.clearLabels();a.ui.refresh();a.save();return true;
 }
 leave(save=true,exitEntranceId=null){
  if(!this.active)return;const a=this.app,d=this.ensure(),session=d.session,surface=session?.surface;
  const destination=exitEntranceId?d.entrances.find(e=>e.id===exitEntranceId):null;
  const returning=this.app.world.data.tokens.filter(t=>t.space===this.active.id&&t.surfaceReturn).map(t=>t.surfaceReturn);
  for(const t of [...(session?.travelers||[]),...returning]){const token=a.world.data.tokens.find(v=>v.id===t.id);if(token){Object.assign(token,{sx:t.sx,sz:t.sz,level:t.level});if(t.space)token.space=t.space;else delete token.space;delete token.surfaceReturn;}}
  if(this.active.combat?.order){this.active.combat.order=this.active.combat.order.filter(o=>a.world.data.tokens.some(t=>t.id===o.id&&t.space===this.active.id));this.active.combat.turn=Math.min(this.active.combat.turn,Math.max(0,this.active.combat.order.length-1));}
  a.propInspector?.close();a.tools.cancel();a.ruler.clear();for(const id of this.importer.loaded.keys())this.importer.drop(id);this.detail.freeAll();this.maps.freeAll();
  this.active=null;d.session=null;this.panel.hidden=true;this.pins.hidden=false;a.scene.add(a.tools.cursor,a.tools.detailCursor,a.ruler.line);a.detailLevel=surface?.detailLevel||0;a.cutaway=surface?.cutaway||false;a.showGrid=surface?.grid||false;
  a.controls.minDistance=surface?.min||3;a.controls.maxDistance=surface?.max||100000;a.renderer.toneMappingExposure=surface?.exposure||1;
  if(surface)this.jump(surface);
  if(destination&&exitEntranceId!==session?.entranceId){const p=this.anchor(destination),[sx,sz]=squareAt(p.x,p.z);let i=0;const ids=new Set([...(session?.travelers||[]),...returning].map(t=>t.id));for(const token of a.world.data.tokens)if(ids.has(token.id)){token.sx=sx+(i%3)-1;token.sz=sz+Math.floor(i/3)+1;token.level=0;i++;}const delta=new THREE.Vector3(p.x-a.controls.target.x,0,p.z-a.controls.target.z);a.camera.position.add(delta);a.controls.target.add(delta);a.controls.update();}
  a.tool=surface?.tool||'look';a.tools.toolChanged();a.maps.invalidateGrid();this.clearLabels();a.ui.refresh();if(save)a.save();a.request();
 }
 clearLabels(){for(const e of this.app.ui?.labelEls.values()||[])e.remove();this.app.ui?.labelEls.clear();for(const e of this.app.ui?.tokEls?.values()||[])e.remove();this.app.ui?.tokEls?.clear();}
 bring(){
  if(!this.active||this.app.role!=='gm')return;const d=this.ensure(),s=d.session,e=d.entrances.find(e=>e.id===s.entranceId);if(!e)return;
  // Surface anchor uses saved coordinates while the underground ground service is active.
  const anchor=this.anchor(e),[cx,cz]=squareAt(anchor.x,anchor.z),near=this.app.world.data.tokens.filter(t=>!t.space&&Math.hypot(t.sx-cx,t.sz-cz)<=8),old=clone(this.app.world.data.tokens),travelers=clone(s.travelers);
  const arrival=s.arrival||this.active.entry;
  const occupied=new Set(this.facade.data.tokens.map(t=>Math.round(t.sx)+','+Math.round(t.sz)));
  for(const token of near){let at=null;for(let r=0;r<12&&!at;r++)for(let dz=-r;dz<=r&&!at;dz++)for(let dx=-r;dx<=r&&!at;dx++){const sx=arrival.sx+dx,sz=arrival.sz+dz;if(!occupied.has(sx+','+sz)&&this.freeSquare(0,sx,sz))at=[sx,sz];}if(!at)continue;s.travelers.push({id:token.id,sx:token.sx,sz:token.sz,level:token.level||0,space:token.space});[token.sx,token.sz]=at;token.surfaceReturn={...s.travelers[s.travelers.length-1]};token.space=this.active.id;token.level=0;occupied.add(at.join(','));}
  const now=clone(this.app.world.data.tokens),afterTravelers=clone(s.travelers),apply=(tokens,list)=>{this.app.world.data.tokens=clone(tokens);s.travelers=clone(list);this.maps.refreshTokens();this.app.save();this.app.request();};apply(now,afterTravelers);this.app.tools.push({undo:()=>apply(old,travelers),redo:()=>apply(now,afterTravelers)});this.app.ui.toast((s.travelers.length-travelers.length)+' tokens brought below; they return with you.');
 }
 freeSquare(level,sx,sz){const s=this.detail.getSquare(level,sx,sz);return level===0&&s.ground>1&&s.ground<12&&!this.detail.objectBlocked(level,sx,sz)&&!this.importer.blockedSquare(sx,sz,0);}
 tap(g,event=null){
  if(!g)return false;
  if(this.armed){if(this.app.role!=='gm'){this.armed=null;return false;}const r=this.armed;if(r.exit){if(this.placeExit(r.entranceId,g,r.kind)){this.armed=null;this.app.ui.toast('Stairs linked in both directions.');}return true;}this.armed=null;this.entrance(r.mapId,g,r.kind);this.app.ui.toast('Entrance named. Link it to stairs from inside a cellar.');return true;}
  if(this.active){const [sx,sz]=squareAt(g.x,g.z),exit=(this.active.exits||[]).find(v=>v.sx===sx&&v.sz===sz);
   if(exit&&this.exitPresent(exit)){this.exitAt(exit);return true;}const entry=this.active.entry;if(!(this.active.exits||[]).length&&sx===entry.sx&&sz===entry.sz&&this.detail.getSquare(0,sx,sz).object?.k==='stairs-up'){this.leave();return true;}return this.importer.tap(g);}
  if(this.app.camDist()>700)return false;
  if(event){const r=this.app.renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),this.app.camera);const hits=ray.intersectObjects([...this.markers.values()].map(r=>r.group),true);for(const hit of hits){let o=hit.object;while(o&&!o.userData.entranceId)o=o.parent;const e=o&&this.ensure().entrances.find(e=>e.id===o.userData.entranceId);if(e&&this.visible(e)&&!this.covered(e))return this.useEntrance(e);}}
  for(const e of this.ensure().entrances)if(this.visible(e)&&!this.covered(e)){const p=this.anchor(e);if(Math.hypot(g.x-p.x,g.z-p.z)<.95){return this.useEntrance(e);}}return false;
 }
 cancel(){if(this.armed){this.armed=null;return true;}if(!this.panel.hidden){this.panel.hidden=true;return true;}return false;}
 clearSurface(){for(const {group,label,cover}of this.markers.values()){if(cover){cover.parent?.remove(cover);cover.traverse(o=>o.geometry?.dispose());}group.parent?.remove(group);group.traverse(o=>o.geometry?.dispose());label.remove();}this.markers.clear();}
 updateSurface(){
  const a=this.app;if(this.active)return;const keep=new Set();for(const e of this.ensure().entrances){if(!this.visible(e)&&!e.cover?.kind)continue;if(e.buildingKey&&a.role!=='gm'){const f=a.buildings.find(e.buildingKey);if(f&&!f.S.known)continue;}const p=this.anchor(e),distance=Math.hypot(p.x-a.camera.position.x,p.y-a.camera.position.y,p.z-a.camera.position.z);if(distance>1200)continue;keep.add(e.id);let rec=this.markers.get(e.id);
   if(!rec){const b=new Builder(821);if(e.kind==='trapdoor')buildObject(b,'trapdoor',M());else{for(const x of [-.65,.65])b.box(null,x,0,0,.13,2.4,.18,PAL.stoneDark);b.box(null,0,2.25,0,1.4,.18,.18,PAL.stoneDark);b.box(null,0,0,0,1.15,2.2,.1,PAL.woodDark);}const group=b.geometry(false);group.userData.entranceId=e.id;const label=h('button',{class:'ug-pin',onclick:()=>this.useEntrance(e)},e.name);label.addEventListener('pointerdown',ev=>ev.stopPropagation());this.pins.append(label);a.scene.add(group);rec={group,label};this.markers.set(e.id,rec);}
   if(!rec.cover&&e.cover?.kind){const b=new Builder(823);buildObject(b,e.cover.kind,M());rec.cover=b.geometry(false);rec.cover.userData.propRef={type:'cover',id:'cover:'+e.id,entranceId:e.id,kind:e.cover.kind,space:null,level:0};a.scene.add(rec.cover);}
   if(rec.cover){const offset=e.cover.aside?2.25:0;rec.cover.position.set(p.x+Math.cos(p.yaw)*offset+(e.cover.dx||0),p.y+.25,p.z-Math.sin(p.yaw)*offset+(e.cover.dz||0));rec.cover.rotation.y=p.yaw;}
   rec.group.visible=this.visible(e)&&!this.covered(e);rec.label.textContent=e.name+(this.covered(e)?' (covered)':'')+(!e.mapId?' (unlinked)':'');
   rec.group.position.set(p.x,p.y,p.z);rec.group.rotation.y=p.yaw;const screen=a.project(p.x,p.y+.25,p.z);rec.label.hidden=!this.visible(e)||screen.behind||distance>450;rec.label.style.transform=`translate(${screen.x}px,${screen.y-18}px) translate(-50%,-100%)`;
  }
  for(const [key,r]of this.markers)if(!keep.has(key)){if(r.cover){r.cover.parent?.remove(r.cover);r.cover.traverse(o=>o.geometry?.dispose());}a.scene.remove(r.group);r.group.traverse(o=>o.geometry?.dispose());r.label.remove();this.markers.delete(key);}
 }
 manageImports(){
  const ui=this.app.ddImports;ui.heading('Underground imported maps');ui.button('Import .dd2vtt',()=>ui.choose());
  for(const s of this.active.imports){ui.panel.append(h('h3',{},s.name));ui.button('Go to '+s.name,()=>{this.importer.focus(s);ui.panel.hidden=true;});ui.button('Remove '+s.name,()=>{this.importer.edit(list=>list.splice(list.findIndex(q=>q.id===s.id),1),false);this.manageImports();});}
 }
 importStructure(record){
  if(!this.active||this.app.role!=='gm')return;const map=this.active,before=clone({detail:map.detail,imports:map.imports,w:map.w,h:map.h,origin:map.origin||{sx:cellarBounds(map).sx,sz:cellarBounds(map).sz},entry:map.entry,exits:map.exits||[]}),s={...clone(record),id:id('dd_')},[w,height]=this.importer.dims(s);
  const [cx,cz]=squareAt(0,0),startX=cx-Math.floor(w/2),startZ=cz-Math.floor(height/2);[s.x,s.z]=[startX*SQ-20480,startZ*SQ-20480];
  map.detail={};map.imports=[s];this.detail.reset();this.fillFloor(this.detail,startX,startZ,w,height);map.w=w;map.h=height;map.origin={sx:startX,sz:startZ};
  let exit=null;for(let z=height-2;z>=1&&!exit;z--)for(let dx=0;dx<w&&!exit;dx++){const x=(Math.floor(w/2)+dx)%w,sx=startX+x,sz=startZ+z;if(!this.importer.blockedSquare(sx,sz,0))exit={sx,sz};}
  if(exit){map.entry=exit;
   const oldExits=before.exits||[];map.exits=[];const draft=new Detail({data:map,latticeHeight:()=>0},new THREE.Scene());
   for(const route of oldExits){let at=null;for(let dz=0;dz<height&&!at;dz++)for(let dx=0;dx<w&&!at;dx++){const sx=startX+dx,sz=startZ+dz;if(!map.exits.some(v=>v.sx===sx&&v.sz===sz)&&!this.importer.blockedSquare(sx,sz,0))at={sx,sz};}if(at){map.exits.push({...route,...at});draft.setSquare(0,at.sx,at.sz,{object:{k:route.kind||'stairs-up',rot:0}});}}
   this.detail.reset();this.detail.setSquare(0,exit.sx,exit.sz,{object:{k:'stairs-up',rot:0}});}
  const after=clone({detail:map.detail,imports:map.imports,w:map.w,h:map.h,origin:map.origin,entry:map.entry,exits:map.exits||[]}),apply=value=>{Object.assign(map,clone(value));if(this.active?.id===map.id){this.detail.reset();this.importer.refresh(false);this.maps.invalidateGrid();}this.app.save();this.app.request();};apply(after);this.app.tools.push({undo:()=>apply(before),redo:()=>apply(after)});if(s.hearth)this.importer.focus(s);this.app.ui.toast(s.hearth?'Hearth underground map imported with ground artwork and native props. Undo restores the previous layout.':'Underground layout imported. Image skipped; Undo restores the previous layout.');
 }

 frame(now,dt,ink,fps){
  const a=this.app;a.camera.near=.1;a.camera.far=1200;a.camera.updateProjectionMatrix();a.controls.target.y=.22;if(a.camera.position.y<2)a.camera.position.y=2;
  this.detail.update(a.camera,0);this.importer.update();this.maps.update(a.camera,a.role,a.camDist(),a.controls.target,true,a.showGrid);CUT.h.value=2.45;
  const points=[...this.importer.lightsNear(a.controls.target,12),...this.detail.torchesNear(a.controls.target,12)].sort((p,q)=>p.distanceToSquared(a.controls.target)-q.distanceToSquared(a.controls.target)).filter((p,i,all)=>all.slice(0,i).every(q=>p.distanceToSquared(q)>.75*.75));
  this.lights.forEach((l,i)=>{const p=points[i];l.intensity=p?48*(p.ddLight?.intensity??1)*(p.ddLight?.alpha??1):0;l.castShadow=!!p&&(p.ddLight?.shadows??true);if(p){l.position.copy(p);l.distance=p.ddLight?p.ddLight.range*SQ:24;l.color.set(p.ddLight?.color||PAL.halo);}});
  a.tools.frame(now);a.motion.update(this.lights);this.shadows.update(this.renderApp);a.renderer.shadowMap.needsUpdate=true;a.renderer.toneMappingExposure=.85;ink.render(this.scene,a.camera,this.renderApp);a.motion.rendered(now);
  this.ensure().session.view={target:a.controls.target.toArray(),camera:a.camera.position.toArray()};
  a.ui.frame(now,a.camDist(),fps);a.card.frame();a.ruler.frame();
 }
}
