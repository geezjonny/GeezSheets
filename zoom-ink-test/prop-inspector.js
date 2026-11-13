import * as THREE from 'three';
import {Detail,SQ,squareAt,squareCenter} from './detail.js';
import {OBJECTS} from './objects.js';
import {worldPoint,localPoint,fits} from './interior-layout.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const h=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(v!=null)e.setAttribute(k,v);}for(const c of kids.flat())if(c!=null)e.append(c);return e;};
const TRAPS=['none','armed','triggered','disarmed'];
export class PropInspector {
 constructor(app){this.app=app;this.step=.15;this.el=h('div',{id:'propPanel',class:'panel',hidden:''});for(const name of ['pointerdown','wheel'])this.el.addEventListener(name,e=>e.stopPropagation());document.body.append(this.el);const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.85,0,-.85),new THREE.Vector3(.85,0,-.85),new THREE.Vector3(.85,0,.85),new THREE.Vector3(-.85,0,.85)]);this.outline=new THREE.LineLoop(geometry,new THREE.LineBasicMaterial({color:'#bba771',depthTest:false,transparent:true,opacity:.9}));this.outline.renderOrder=8;this.outline.visible=false;}
 get states(){return this.app.world.data.propState||={};}
 importer(ref){return ref.space?this.app.underground.importer:this.app.ddImports;}
 state(ref){const item=ref.type==='imported'?this.importer(ref)?.prop(ref):null;return{...(item?{name:item.asset.name,creatorNotes:item.p.notes||'',tags:[...new Set([...(item.asset.tags||[]),...(item.s.hearth.map.assetTags[item.p.asset]||[]),...(item.p.tags||[])])]}:{}),...(this.states[ref.id]||{})};}
 data(ref){return ref.space?this.app.underground.ensure().maps.find(m=>m.id===ref.space):this.app.world.data;}
 detail(ref){const data=this.data(ref);return data?new Detail({data,latticeHeight:()=>0},new THREE.Scene()):null;}
 object(ref){const s=this.state(ref),d=this.detail(ref),p=s.pose||ref;return d?.getSquare(ref.level||0,p.sx,p.sz).object;}
 position(ref){
  const s=this.state(ref);if(s.removed)return null;
  if(ref.type==='imported')return this.importer(ref).propPosition(ref);
  if(ref.type==='interior'){const e=this.app.interiors.layout(ref.buildingKey),o=e?.plan.items.find(o=>o.id===ref.itemId);return o?worldPoint(e.house,o.x,o.z):null;}
  if(ref.type==='detail'){const p=s.pose||ref,o=this.object(ref);if(!o||(o.id||`detail:${ref.space||'surface'}:${ref.level||0}:${p.sx},${p.sz}`)!==ref.id)return null;const[x,z]=squareCenter(p.sx,p.sz);return{x:x+(o.ox||0),z:z+(o.oz||0)};}
  if(ref.type==='cover'){const u=this.app.underground,e=u.ensure().entrances.find(e=>e.id===ref.entranceId);if(!e?.cover?.kind)return null;const p=u.anchor(e),offset=e.cover.aside?2.25:0;return{x:p.x+Math.cos(p.yaw)*offset+(e.cover.dx||0),z:p.z-Math.sin(p.yaw)*offset+(e.cover.dz||0)};}
  return{x:ref.x+(s.dx||0),z:ref.z+(s.dz||0)};
 }
 covers(ref,entrance){const p=this.position(ref),at=this.app.underground.anchor(entrance);return !!p&&Math.hypot(p.x-at.x,p.z-at.z)<.7;}
 close(){if(this.el.hidden)return false;this.el.hidden=true;this.outline.visible=false;return true;}
 refresh(){if(this.selected&&!this.el.hidden)this.show(this.selected);}
 invalidate(ref){const a=this.app;if(ref.type==='generated')a.towns.free(ref.settlementId);if(ref.type==='detail'){if((ref.space||null)===(a.underground.currentSpace||null))a.detail.reset();else a.world.detail?.reset();}a.maps.invalidateGrid();a.save();a.request();this.refresh();}
 patch(ref,patch){if(this.app.role!=='gm')return;const before=clone(this.state(ref)),after={...before,...clone(patch)},apply=value=>{this.states[ref.id]=clone(value);this.app.save();this.app.request();this.refresh();};apply(after);this.app.tools.push({undo:()=>apply(before),redo:()=>apply(after)});}
 editDetail(ref,fn){
  if(this.app.role!=='gm')return false;const data=this.data(ref);if(!data)return false;
  const before={detail:clone(data.detail),state:clone(this.state(ref))};fn(this.detail(ref));const after={detail:clone(data.detail),state:clone(this.state(ref))};
  const apply=value=>{const target=this.data(ref);if(!target)return;target.detail=clone(value.detail);this.states[ref.id]=clone(value.state);this.invalidate(ref);};apply(after);this.app.tools.push({undo:()=>apply(before),redo:()=>apply(after)});return true;
 }
 move(ref,dx,dz){
  const a=this.app;if(a.role!=='gm')return false;
  if(ref.type==='imported'){const ok=this.importer(ref).moveProp(ref,dx,dz);this.refresh();return ok;}
  if(ref.type==='interior'){const e=a.interiors.layout(ref.buildingKey),delta=localPoint({...e.house,x:0,z:0},dx,dz),ok=a.interiors.move(ref.buildingKey,ref.itemId,delta.x,delta.z);this.refresh();return ok;}
  if(ref.type==='cover'){const u=a.underground,e=u.ensure().entrances.find(e=>e.id===ref.entranceId);u.updateEntrance(e.id,{cover:{...e.cover,dx:(e.cover.dx||0)+dx,dz:(e.cover.dz||0)+dz}});this.refresh();return true;}
  const p=this.position(ref);if(!p)return false;const target={x:p.x+dx,z:p.z+dz},[sx,sz]=squareAt(target.x,target.z);
  if(ref.type==='detail'){
   if(['stairs-up','ladder'].includes(ref.kind)&&a.underground.active?.exits?.some(e=>{const pose=this.state(ref).pose||ref;return e.sx===pose.sx&&e.sz===pose.sz;})){a.ui.toast('Relocate linked stairs through Menu > Underground.');return false;}
   const d=this.detail(ref),old=this.state(ref).pose||ref,o=this.object(ref);if(!o)return false;
   const crossed=sx!==old.sx||sz!==old.sz;
   if(crossed&&(d.getSquare(ref.level||0,sx,sz).object||d.edgeBlocked(ref.level||0,old.sx,old.sz,sx,sz)||!a.tools.freeSquare(ref.level||0,sx,sz))){a.ui.toast('That square is occupied or blocked.');return false;}
   const [cx,cz]=squareCenter(sx,sz);
   return this.editDetail(ref,draft=>{draft.setSquare(ref.level||0,old.sx,old.sz,{object:null});draft.setSquare(ref.level||0,sx,sz,{object:{...o,id:ref.id,ox:target.x-cx,oz:target.z-cz}});this.states[ref.id]={...this.state(ref),pose:{sx,sz}};});
  }
  if(!a.tools.freeSquare(0,sx,sz)){a.ui.toast('Keep the prop clear of walls and furnishings.');return false;}
  const before=clone(this.state(ref)),after={...before,dx:(before.dx||0)+dx,dz:(before.dz||0)+dz},apply=value=>{this.states[ref.id]=clone(value);this.invalidate(ref);};apply(after);a.tools.push({undo:()=>apply(before),redo:()=>apply(after)});return true;
 }
 rotate(ref){
  const a=this.app;if(a.role!=='gm')return;
  if(ref.type==='imported'){this.importer(ref).editProp(ref,p=>{p.rotation=(p.rotation+90)%360;});this.refresh();return;}
  if(ref.type==='interior'){const e=a.interiors.layout(ref.buildingKey),o=e.plan.items.find(o=>o.id===ref.itemId),rot=(o.rot||0)+Math.PI/2;if(!fits(e.plan,{...o,rot},o.id)){a.ui.toast('Not enough room to turn that furnishing.');return;}a.interiors.edit(e.key,s=>{s.moved||={};s.moved[o.id]={x:o.x,z:o.z,rot};});this.refresh();return;}
  if(ref.type==='detail'){this.editDetail(ref,d=>{const p=this.state(ref).pose||ref,o=this.object(ref);d.setSquare(ref.level||0,p.sx,p.sz,{object:{...o,id:ref.id,rot:((o.rot||0)+1)%4}});});return;}
  if(ref.type==='cover')return;
  const before=clone(this.state(ref)),after={...before,rot:((before.rot||0)+Math.PI/2)%(Math.PI*2)},apply=value=>{this.states[ref.id]=clone(value);this.invalidate(ref);};apply(after);a.tools.push({undo:()=>apply(before),redo:()=>apply(after)});
 }
 remove(ref){
  const a=this.app;if(a.role!=='gm')return;
  if(ref.type==='imported')this.importer(ref).editProp(ref,(p,s)=>{s.hearth.map.props=s.hearth.map.props.filter(v=>v.id!==p.id);});
  else if(ref.type==='interior')a.interiors.remove(ref.buildingKey,ref.itemId);
  else if(ref.type==='detail')this.editDetail(ref,d=>{const p=this.state(ref).pose||ref;d.setSquare(ref.level||0,p.sx,p.sz,{object:null});});
  else if(ref.type==='cover'){const e=a.underground.ensure().entrances.find(e=>e.id===ref.entranceId);a.underground.updateEntrance(e.id,{cover:null});}
  else{const before=clone(this.state(ref)),after={...before,removed:true},apply=value=>{this.states[ref.id]=clone(value);this.invalidate(ref);};apply(after);a.tools.push({undo:()=>apply(before),redo:()=>apply(after)});}
  this.close();
 }
 underneath(ref){
  const a=this.app,u=a.underground;if(a.role!=='gm'||ref.space||(ref.level||0)!==0)return;
  if(ref.type==='cover'){this.close();u.editEntrance(ref.entranceId);return;}
  if(ref.type==='interior'){u.concealUnder(ref.buildingKey,ref.itemId);this.close();return;}
  let e=u.ensure().entrances.find(e=>e.cover?.ref?.id===ref.id);
  if(!e){const p=this.position(ref);if(!p)return;e=u.entrance(null,p,'trapdoor',this.name(ref)+' trapdoor');u.updateEntrance(e.id,{cover:{ref:clone(ref)}});}
  this.close();u.editEntrance(e.id);a.ui.toast('Trapdoor hidden under this prop. Create or choose its cellar here.');
 }
 name(ref){return this.state(ref).name||ref.name||OBJECTS.find(o=>o.k===ref.kind)?.name||ref.kind||'Prop';}
 pick(g,event){
  const a=this.app;if(a.camDist()>240||!g)return false;let ref=null;
  if(event){const nodes=[];(a.underground.active?a.underground.scene:a.scene).traverse(o=>{if(o.userData.propRef&&o.visible)nodes.push(o);});const r=a.renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),a.camera);const hit=ray.intersectObjects(nodes,true)[0];if(hit){let o=hit.object;while(o&&!o.userData.propRef)o=o.parent;ref=o?.userData.propRef;}}
  if(!ref){const [sx,sz]=squareAt(g.x,g.z),level=a.detailLevel||0,o=a.detail.getSquare(level,sx,sz).object;if(o&&!['stairs-up','stairs-down','ladder','trapdoor'].includes(o.k)){const space=a.underground.currentSpace;ref={type:'detail',id:o.id||`detail:${space||'surface'}:${level}:${sx},${sz}`,kind:o.k,sx,sz,level,space};}}
  if(!ref||(ref.type!=='imported'&&['stairs-up','stairs-down','ladder','trapdoor'].includes(ref.kind)))return false;
  this.show(ref);return true;
 }
 show(ref){
  const a=this.app;if((ref.space||null)!==a.underground.currentSpace){if(ref.space){if(!a.underground.enter(ref.space))return;}else a.underground.leave();}
  this.selected=clone(ref);const s=this.state(ref),gm=a.role==='gm';a.interiors.close();a.card.close();this.el.hidden=false;
  const p=this.position(ref);this.outline.visible=!!p;if(p){(a.underground.active?a.underground.scene:a.scene).add(this.outline);this.outline.position.set(p.x,a.maps.ground(p.x,p.z)+.3+(ref.level||0)*3.2,p.z);}a.request();
  const body=h('div',{class:'cbody'});this.el.replaceChildren(h('div',{class:'chead'},h('strong',{},this.name(ref)),h('button',{onclick:()=>this.close()},'Close')),body);
  if(gm){const name=h('input',{'aria-label':'Prop name',value:this.name(ref)}),contents=h('textarea',{'aria-label':'Prop contents',rows:4},s.contents||''),notes=h('textarea',{'aria-label':'Trap details',rows:3},s.trapNotes||''),trap=h('select',{'aria-label':'Trap state'},TRAPS.map(t=>h('option',{value:t,...((s.trap||'none')===t?{selected:''}:{})},t)));
   const contentsVisible=h('input',{type:'checkbox','aria-label':'Reveal contents',...(s.contentsVisible?{checked:''}:{})}),trapVisible=h('input',{type:'checkbox','aria-label':'Reveal trap',...(s.trapVisible?{checked:''}:{})});
   body.append(h('label',{},'Name',name),h('label',{},'Contents (one item per line)',contents),h('label',{},contentsVisible,' Reveal contents to players'),h('label',{},'Trap',trap),h('label',{},'Trap trigger, DC, and effect',notes),h('label',{},trapVisible,' Reveal trap to players'),h('button',{onclick:()=>this.patch(ref,{name:name.value.trim().slice(0,160),contents:contents.value,contentsVisible:contentsVisible.checked,trap:trap.value,trapNotes:notes.value,trapVisible:trapVisible.checked})},'Save prop'));
   if(ref.type==='imported'){
    const creatorNotes=h('textarea',{'aria-label':'Creator notes',rows:3},s.creatorNotes||''),tags=h('input',{'aria-label':'Imported prop tags',value:(s.tags||[]).join(', ')});
    body.append(h('label',{},'Creator notes (GM only)',creatorNotes),h('label',{},'Asset tags',tags),h('button',{onclick:()=>this.patch(ref,{creatorNotes:creatorNotes.value.slice(0,3000),tags:tags.value.split(',').map(t=>t.trim().slice(0,40)).filter(Boolean).slice(0,30)})},'Save imported details'));
   }
   if(s.trap&&s.trap!=='none')body.append(h('button',{onclick:()=>this.patch(ref,{trap:'triggered'})},'Trigger trap'),h('button',{onclick:()=>this.patch(ref,{trap:'disarmed'})},'Disarm trap'));
   const step=h('select',{'aria-label':'Prop nudge distance',onchange:e=>{this.step=Number(e.target.value);}},[[.15,'0.5 feet'],[.3,'1 foot'],[.75,'2.5 feet']].map(([v,n])=>h('option',{value:v,...(v===this.step?{selected:''}:{})},n)));
   body.append(h('label',{},'Nudge',step),h('div',{class:'prop-nudges'},[['West',-1,0],['East',1,0],['North',0,-1],['South',0,1]].map(([n,x,z])=>h('button',{onclick:()=>this.move(ref,x*Number(step.value),z*Number(step.value))},n))),ref.type!=='cover'?h('button',{onclick:()=>this.rotate(ref)},'Rotate 90 degrees'):null);
   if(!ref.space&&!(ref.level||0))body.append(h('button',{onclick:()=>this.underneath(ref)},'Trapdoor underneath'));
   body.append(h('button',{onclick:()=>this.remove(ref)},'Remove prop'));
  }else{
   body.append(h('p',{},s.contentsVisible?(s.contents||'Empty.'):'Contents have not been revealed.'));
   if(s.trapVisible&&s.trap&&s.trap!=='none')body.append(h('p',{},'Trap: '+s.trap),h('p',{},s.trapNotes||''));
  }
 }
}
