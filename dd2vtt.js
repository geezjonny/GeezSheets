import * as THREE from 'three';
import {parseDD2VTT,wallPieces,rotatePoint,pointSegment,segmentsTouch} from './dd2vtt-format.js';
import {Geo,PAL,M,box} from './style.js';
import {Builder} from './places.js';
import {SQ,squareCenter} from './detail.js';
import {HALF} from './world.js';
import {buildInkScene,disposeInkScene,inkProp,localInkPoint,hitsInkProp} from './ink-creator.js';

const copy=v=>JSON.parse(JSON.stringify(v));
const el=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;return e;};
const finite=n=>typeof n==='number'&&Number.isFinite(n);

export class DD2VTTImports {
 constructor(app){
  this.app=app;app.world.ddImports=this;this.loaded=new Map();this.pending=null;this.placing=false;
  this.panel=el('aside');this.panel.id='ddImportPanel';this.panel.className='panel';this.panel.hidden=true;document.body.append(this.panel);
  this.file=el('input');this.file.type='file';this.file.accept='.dd2vtt,.uvtt';this.file.hidden=true;this.file.id='ddImportFile';document.body.append(this.file);
  this.file.onchange=async()=>{const f=this.file.files[0];this.file.value='';if(!f)return;try{if(f.size>100*1024*1024)throw Error('Choose a map smaller than 100 MB.');const data=parseDD2VTT(await f.text());this.pending={...data,name:f.name.replace(/\.(dd2vtt|uvtt)$/i,''),fileName:f.name,rot:0,material:'stone'};this.showPending();}catch(e){this.app.ui.toast('Import failed: '+e.message);}};
 }
 list(){return this.app.world.data.imports||[];}
 dims(s){return s.rot%2?[s.h,s.w]:[s.w,s.h];}
 point(s,p){const v=rotatePoint(p,s.w,s.h,s.rot);return{x:s.x+v.x*SQ,y:s.z+v.y*SQ};}
 bounds(s){const [w,h]=this.dims(s);return[s.x,s.z,s.x+w*SQ,s.z+h*SQ];}
 contains(s,x,z){const b=this.bounds(s);return x>=b[0]&&z>=b[1]&&x<=b[2]&&z<=b[3];}
 covers(x,z){return this.list().some(s=>this.contains(s,x,z));}
 overlapsHouse(h){const xs=h.corners.map(p=>p[0]),zs=h.corners.map(p=>p[1]);return this.list().some(s=>{const b=this.bounds(s);return Math.max(...xs)>b[0]&&Math.min(...xs)<b[2]&&Math.max(...zs)>b[1]&&Math.min(...zs)<b[3];});}
 geometry(s){const walls=wallPieces(s.walls,s.doors).map(w=>({...w,a:this.point(s,w.a),b:this.point(s,w.b)}));return{walls,doors:s.doors.map(d=>({...d,a:this.point(s,d.a),b:this.point(s,d.b)}))};}
 floorAt(x,z){return this.list().some(s=>s.hearth&&this.contains(s,x,z))?this.app.world.latticeHeight(x,z)+.26:null;}
 prop(ref){return inkProp(this,ref);}
 propPosition(ref){const found=this.prop(ref);if(!found)return null;const p=this.point(found.s,found.p);return{x:p.x,z:p.y};}
 editProp(ref,fn){if(this.app.role!=='gm'||!this.prop(ref))return false;this.edit(list=>{const s=list.find(s=>s.id===ref.importId),p=s.hearth.map.props.find(p=>p.id===ref.propId);fn(p,s);},false);return true;}
 moveProp(ref,dx,dz){const found=this.prop(ref),pos=this.propPosition(ref);if(!found||!pos)return false;const p=localInkPoint(this,found.s,{x:pos.x+dx,z:pos.z+dz});if(p.x<0||p.y<0||p.x>found.s.w||p.y>found.s.h){this.app.ui.toast('Keep this prop inside its imported map.');return false;}if(this.geometry(found.s).walls.some(w=>segmentsTouch({x:pos.x,y:pos.z},{x:pos.x+dx,y:pos.z+dz},w.a,w.b))){this.app.ui.toast('Keep the prop clear of walls.');return false;}return this.editProp(ref,item=>{item.x=p.x;item.y=p.y;});}
 drop(id){const g=this.loaded.get(id);if(!g)return;disposeInkScene(g);this.app.scene.remove(g);g.traverse(o=>o.geometry?.dispose());this.loaded.delete(id);}
 refresh(spatial=true){
  for(const id of this.loaded.keys())this.drop(id);
  const a=this.app;if(spatial){a.props.invalidateAll();a.towns.freeAll();a.detail.freeAll();a.microDetail.invalidate();}
  a.maps.invalidateGrid();a.maps.refreshTokens();a.save();a.request();
 }
 edit(fn,spatial=true){
  if(this.app.role!=='gm')return;
  const before=copy(this.list());fn(this.app.world.data.imports||= []);const after=copy(this.list());
  const apply=value=>{this.app.world.data.imports=copy(value);this.refresh(spatial);};
  this.refresh(spatial);this.app.tools.push({undo:()=>apply(before),redo:()=>apply(after)});
 }
 choose(){if(this.app.role==='gm')this.file.click();}
 cancel(){if(this.placing||!this.panel.hidden){this.placing=false;this.panel.hidden=true;this.pending=null;this.app.ui.toast('Map placement closed.');return true;}return false;}
 heading(title){this.panel.replaceChildren();const row=el('div');row.className='ddHeading';row.append(el('h2',title));const close=el('button','Close');close.onclick=()=>{this.panel.hidden=true;this.placing=false;};row.append(close);this.panel.append(row);this.panel.hidden=false;}
 button(text,fn){const b=el('button',text);b.onclick=fn;this.panel.append(b);return b;}
 field(label,value,kind='text'){const l=el('label',label);const input=el('input');input.type=kind;input.value=value;l.append(input);this.panel.append(l);return input;}
 showPending(){
  const s=this.pending;this.heading(s.hearth?'Import Hearth map':'Import map structure');
  this.panel.append(el('p',`${s.w} × ${s.h} squares · ${s.w*5} × ${s.h*5} ft`),el('p',`${s.walls.length} wall segments · ${s.doors.length} doors · ${s.lights.length} lights`),el('p',s.hearth?'Hearth ground artwork and native objects will be rebuilt in Ink.':'Artwork is skipped. Wall angles, door states, and light settings are retained.'));
  const name=this.field('Name',s.name);
  if(s.hearth){s.name=s.hearth.map.name;name.value=s.name;this.panel.append(el('p',`${s.hearth.map.props.length} native props, ${s.hearth.map.rooms.length} rooms. Painted floors, terrain, labels, tags, and GM notes are retained.`));}
  const mat=el('select');mat.setAttribute('aria-label','Imported wall material');for(const [v,t]of[['stone','Stone'],['timber','Timber']]){const o=el('option',t);o.value=v;mat.append(o);}mat.disabled=!!s.hearth;this.panel.append(el('label',s.hearth?'Wall styles are preserved from Hearth':'Walls'),mat);
  const rot=el('select');rot.setAttribute('aria-label','Imported map rotation');for(let i=0;i<4;i++){const o=el('option',(i*90)+'°');o.value=i;rot.append(o);}this.panel.append(el('label','Rotation'),rot);
  const prepare=()=>{s.name=name.value.trim().slice(0,160)||'Imported map';s.material=mat.value;s.rot=+rot.value;};
  if(this.app.underground?.active){this.panel.append(el('p','Use this as the underground layout. Undo restores the previous layout.'));this.button('Import into underground map',()=>{prepare();this.app.underground.importStructure(copy(s));this.pending=null;this.panel.hidden=true;});return;}
  this.button('Place on map',()=>{prepare();this.placing=true;this.panel.hidden=true;this.app.setTool('look');this.app.ruler.on=false;this.app.weather.arm=null;this.app.ui.toast('Tap open ground to place the map. Escape cancels.');});
  this.button('Import at view center',()=>{prepare();this.placeAt(this.app.controls.target);});
 }
 placeAt(g){
  if(!this.pending||!g||this.app.role!=='gm')return;
  const a=this.app,s={...copy(this.pending),id:'dd_'+crypto.randomUUID()},[w,h]=this.dims(s);
  s.x=Math.round((g.x-w*SQ/2+HALF)/SQ)*SQ-HALF;s.z=Math.round(((g.z??g.y)-h*SQ/2+HALF)/SQ)*SQ-HALF;
  if(s.x<-HALF||s.z<-HALF||s.x+w*SQ>HALF||s.z+h*SQ>HALF){a.ui.toast('The map must fit inside the world.');return;}
  const b=this.bounds(s);if(this.list().some(o=>{const r=this.bounds(o);return r[0]<b[2]&&r[2]>b[0]&&r[1]<b[3]&&r[3]>b[1];})){a.ui.toast('Choose a position outside the other imported maps.');return;}
  this.edit(list=>list.push(s));this.pending=null;this.placing=false;this.panel.hidden=true;a.showGrid=true;this.focus(s);a.ui.toast(s.hearth?'Imported the Hearth map with native props, painted ground, doors, and lights.':'Imported walls, doors, and lights. No image loaded.');
 }
 focus(s){const [w,h]=this.dims(s);this.app.flyTo(s.x+w*SQ/2,s.z+h*SQ/2,Math.max(35,Math.max(w,h)*SQ*1.5),.65);}
 manage(){
  if(this.app.underground?.active){this.app.underground.manageImports();return;}
  this.heading('Imported maps');if(!this.list().length)this.panel.append(el('p','No imported maps yet. Choose a .dd2vtt or .uvtt file.'));
  this.button('Import .dd2vtt',()=>this.choose());
  for(const s of this.list()){
   this.panel.append(el('h3',s.name),el('p',`${s.w*5} × ${s.h*5} ft · ${s.walls.length} walls · ${s.lights.length} lights`));
   this.button('Go to '+s.name,()=>{this.focus(s);this.panel.hidden=true;});
   this.button('Remove '+s.name,()=>{this.edit(list=>list.splice(list.findIndex(v=>v.id===s.id),1));this.manage();});
   for(const d of s.doors)this.button(`${d.closed?'Open':'Close'} ${s.name} ${d.id.replace('_',' ')}`,()=>{this.toggleDoor(s.id,d.id);this.manage();});
  }
  this.panel.append(el('p','Tap a door on the map to open or close it. Imported walls and closed doors block token movement. Undo restores removed maps.'));
 }
 toggleDoor(id,door){this.edit(list=>{const s=list.find(s=>s.id===id),i=s?.doors.findIndex(d=>d.id===door);if(i>=0){s.doors[i].closed=!s.doors[i].closed;if(s.hearth?.map.doors[i])s.hearth.map.doors[i].closed=s.doors[i].closed;}},false);}
 tap(g){
  if(this.placing){this.placeAt(g);return true;}if(!g||this.app.camDist()>350)return false;
  for(const s of this.list())if(this.contains(s,g.x,g.z))for(const d of s.doors){const a=this.point(s,d.a),b=this.point(s,d.b);if(pointSegment({x:g.x,y:g.z},a,b)<.5){if(this.app.role==='gm')this.toggleDoor(s.id,d.id);else this.app.ui.toast('The GM controls imported doors.');return true;}}
  return false;
 }
 blocksMove(ax,az,bx,bz,level=0){
  if(level!==0)return false;const a={x:ax,y:az},b={x:bx,y:bz};
  for(const s of this.list()){
   const r=this.bounds(s);if(Math.max(ax,bx)<r[0]||Math.min(ax,bx)>r[2]||Math.max(az,bz)<r[1]||Math.min(az,bz)>r[3])continue;
   const g=this.geometry(s);if(g.walls.some(w=>segmentsTouch(a,b,w.a,w.b))||g.doors.some(d=>d.closed&&segmentsTouch(a,b,d.a,d.b))||hitsInkProp(this,s,a,b))return true;
  }return false;
 }
 blockedSquare(sx,sz,level=0){if(level!==0)return false;const [x,z]=squareCenter(sx,sz);for(const s of this.list())if(this.contains(s,x,z)){const g=this.geometry(s),p={x,y:z};if(g.walls.some(w=>pointSegment(p,w.a,w.b)<.13)||g.doors.some(d=>d.closed&&pointSegment(p,d.a,d.b)<.13)||hitsInkProp(this,s,p,p))return true;}return false;}
 build(s){
  const a=this.app,b=new Builder(783),col=s.material==='timber'?PAL.wood:PAL.stone,geo=this.geometry(s),height=2.8;
  const ground=p=>a.world.latticeHeight(p.x,p.y)+(s.hearth ? .27 : .03);
  const wall=(p,q,material)=>{
   const wallColor=material==='wall-timber'?PAL.wood:material==='wall-palisade'?PAL.bark:material==='wall-stone'?PAL.stone:col;
   const dx=q.x-p.x,dz=q.y-p.y,L=Math.hypot(dx,dz),nx=-dz/L*.11,nz=dx/L*.11,y0=ground(p),y1=ground(q),v=[];
   const pts=[[p.x+nx,y0,p.y+nz],[q.x+nx,y1,q.y+nz],[q.x-nx,y1,q.y-nz],[p.x-nx,y0,p.y-nz]];
   const top=pts.map(p=>[p[0],p[1]+height,p[2]]);
   const face=(p,q,r,t)=>v.push(...p,...q,...r,...p,...r,...t);
   face(...top);face(pts[3],pts[2],pts[1],pts[0]);for(let i=0;i<4;i++)face(pts[i],pts[(i+1)%4],top[(i+1)%4],top[i]);
   if(material==='wall-palisade'){for(let t=.12;t<L;t+=.28)b.cyl(M(),p.x+dx*t/L,ground({x:p.x+dx*t/L,y:p.y+dz*t/L}),p.y+dz*t/L,.14,height,PAL.bark,5);return;}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));b.g.add(g,wallColor,null,{cj:.045});g.dispose();
  };
  for(const w of geo.walls)wall(w.a,w.b,w.material);
  for(const d of geo.doors){
   const dx=d.b.x-d.a.x,dz=d.b.y-d.a.y,L=Math.hypot(dx,dz),yaw=Math.atan2(-dz,dx),y=Math.max(ground(d.a),ground(d.b));
   for(const p of[d.a,d.b])b.g.add(box(.12,2.35,.27),PAL.woodDark,M(p.x,y,p.y),{cj:.03});
   b.g.add(box(L,Math.max(.15,height-2.3),.25),col,M((d.a.x+d.b.x)/2,y+2.3,(d.a.y+d.b.y)/2,yaw),{cj:.03});
   const angle=yaw+(d.closed?0:Math.PI/2),len=Math.max(.1,L-.18),cx=d.a.x+Math.cos(angle)*len/2,cz=d.a.y-Math.sin(angle)*len/2;
   b.g.add(box(len,2.2,.09),PAL.wood,M(cx,y+.02,cz,angle),{cj:.06});
   b.g.add(box(len,.07,.11),PAL.iron,M(cx,y+.65,cz,angle),{cj:0});
  }
  const lights=[];
  for(const light of s.lights){const p=this.point(s,light.position),y=ground(p);if(light.intensity>0&&light.alpha>0){if(!s.hearth)b.brazier(M(p.x,y,p.y),0,0);const v=new THREE.Vector3(p.x,y+1.65,p.y);v.ddLight=light;lights.push(v);}}
  const group=b.geometry();group.userData.importId=s.id;group.userData.importLights=lights;if(s.hearth)buildInkScene(this,s,group,lights);this.app.scene.add(group);this.loaded.set(s.id,group);return group;
 }
 lightsNear(pt,n){const all=[];for(const group of this.loaded.values())for(const p of group.userData.importLights){if(p.distanceTo(pt)<Math.max(80,p.ddLight.range*SQ))all.push(p);}return all.sort((a,b)=>a.distanceToSquared(pt)-b.distanceToSquared(pt)).slice(0,n);}
 update(){
  const a=this.app,ids=new Set(this.list().map(s=>s.id));for(const id of this.loaded.keys())if(!ids.has(id))this.drop(id);
  for(const s of this.list()){
   if(!finite(s.x)||!finite(s.z)||!Array.isArray(s.walls)||!Array.isArray(s.doors)||!Array.isArray(s.lights))continue;
   const r=this.bounds(s),c=a.camera.position,x=(r[0]+r[2])/2,z=(r[1]+r[3])/2;
   const d=Math.hypot(Math.max(r[0]-c.x,0,c.x-r[2]),Math.max(r[1]-c.z,0,c.z-r[3]),c.y-a.world.latticeHeight(x,z));
   if(a.detailLevel!==0||d>800){this.drop(s.id);continue;}if(d<600&&!this.loaded.has(s.id))this.build(s);
  }
 }
}
