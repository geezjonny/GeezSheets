import * as THREE from 'three';
import {MapControls} from '../vendor/three/addons/controls/MapControls.js';
import {DD2VTTImports} from '../dd2vtt.js';
import {buildNative} from '../ink-creator.js';
import {InkRenderer} from '../ink.js';
import {AtlasShadows} from '../shadows.js';
import {PAL,CUT} from '../style.js';
import {WORLD_MOTION} from '../motion-shader.js';

const SQ=1.5,C=globalThis.HearthCore;
export class MapmakerStudio {
 constructor(canvas,{catalog,surface,request,toast}){
  this.canvas=canvas;this.catalog=catalog;this.surface=surface;this.request=request;this.map=null;this.state=null;this.topDown=false;this.keys={};this.frame=0;
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#b8a786');
  this.camera=new THREE.PerspectiveCamera(38,1,.1,2000);
  this.controls=new MapControls(this.camera,canvas);this.controls.enableDamping=false;this.controls.mouseButtons.LEFT=-1;this.controls.mouseButtons.MIDDLE=-1;this.controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;this.controls.enableZoom=false;this.controls.minPolarAngle=.005;this.controls.maxPolarAngle=Math.PI*.47;
  this.controls.touches.ONE=-1;this.controls.touches.TWO=THREE.TOUCH.DOLLY_ROTATE;
  this.controls.addEventListener('change',()=>{this.topDown=this.controls.getPolarAngle()<.05;request();});
  this.hemi=new THREE.HemisphereLight('#eee2c5','#61583e',1.6);this.sun=new THREE.DirectionalLight('#fff1cf',2.8);this.scene.add(this.hemi,this.sun);
  this.shadows=new AtlasShadows(this.renderer,this.sun,this.scene);this.ink=new InkRenderer(this.renderer);
  this.ink.uniforms.inkStrength.value=.65;
  this.pointLights=Array.from({length:6},()=>{const l=new THREE.PointLight(PAL.halo,0,20,2);l.shadow.mapSize.set(512,512);l.shadow.camera.near=.1;l.shadow.bias=-.0002;l.shadow.normalBias=.04;this.scene.add(l);return l;});
  this.surfaceCanvas=document.createElement('canvas');this.app={scene:this.scene,renderer:this.renderer,controls:this.controls,world:{data:{imports:[]},latticeHeight:()=>0},inkSurfaceCanvas:this.surfaceCanvas,request,ui:{toast},quality:{name:'high'},camDist:()=>this.camera.position.distanceTo(this.controls.target),weather:{night:0,skyU:{uSunDir:{value:new THREE.Vector3(-.8,1,.55).normalize()}}}};
  this.importer=Object.create(DD2VTTImports.prototype);Object.assign(this.importer,{app:this.app,loaded:new Map()});
  this.helpers=new THREE.Group();this.scene.add(this.helpers);
  this.desk=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshStandardMaterial({color:'#a59675',roughness:1}));this.desk.rotation.x=-Math.PI/2;this.desk.position.y=-.75;this.desk.userData.noShadow=true;this.scene.add(this.desk);
  this.ray=new THREE.Raycaster();this.plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.26);this.pointer=new THREE.Vector2();
  this.loop=now=>{this.frame=requestAnimationFrame(this.loop);if(document.hidden||!this.map)return;if(now-(this.lastFrame||0)<33)return;this.lastFrame=now;WORLD_MOTION.time.value=now/1000;WORLD_MOTION.amount.value=matchMedia('(prefers-reduced-motion: reduce)').matches?0:.5;WORLD_MOTION.distance.value=this.app.camDist();this.render();};
  this.frame=requestAnimationFrame(this.loop);
 }
 resize(){const r=this.canvas.getBoundingClientRect(),dpr=this.renderer.getPixelRatio();if(this.canvas.width!==Math.round(r.width*dpr)||this.canvas.height!==Math.round(r.height*dpr))this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix();}
 fit(map=this.map){if(!map)return;this.resize();const target=new THREE.Vector3(map.width*SQ/2,.3,map.height*SQ/2),span=Math.max(map.width*SQ/this.camera.aspect,map.height*SQ),distance=span/(2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)))*1.35;this.controls.target.copy(target);this.camera.position.copy(target).add(new THREE.Vector3(this.topDown?.0001:.22,this.topDown?1:.86,this.topDown?.0001:.64).normalize().multiplyScalar(distance));this.camera.lookAt(target);this.controls.update();this.request();}
 setTop(value){this.topDown=value;this.fit();}
 zoom(factor){const offset=this.camera.position.clone().sub(this.controls.target);offset.multiplyScalar(1/factor);offset.clampLength(5,600);this.camera.position.copy(this.controls.target).add(offset);this.controls.update();this.request();}
 cast(clientX,clientY){const r=this.canvas.getBoundingClientRect();this.pointer.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);return this.ray;}
 ground(clientX,clientY){const p=this.cast(clientX,clientY).ray.intersectPlane(this.plane,new THREE.Vector3());return p?{x:p.x/SQ,y:p.z/SQ}:{x:-1e4,y:-1e4};}
 project(x,y,height=.26){const p=new THREE.Vector3(x*SQ,height,y*SQ).project(this.camera),r=this.canvas.getBoundingClientRect();return{x:(p.x+1)*r.width/2,y:(1-p.y)*r.height/2};}
 pan(dx,dy){const r=this.canvas.getBoundingClientRect(),a=this.ground(r.left+r.width/2,r.top+r.height/2),b=this.ground(r.left+r.width/2-dx,r.top+r.height/2-dy),delta=new THREE.Vector3((b.x-a.x)*SQ,0,(b.y-a.y)*SQ);this.camera.position.add(delta);this.controls.target.add(delta);this.controls.update();this.request();}
 pick(clientX,clientY,map,visible){if(visible.props===false)return null;const roots=[];this.group?.traverse(o=>{if(o.userData.propRef&&o.visible)roots.push(o);});const hit=this.cast(clientX,clientY).intersectObjects(roots,true)[0];if(!hit)return null;let object=hit.object;while(object&&!object.userData.propRef)object=object.parent;const id=object?.userData.propRef?.propId,item=map.props.find(p=>p.id===id);return item?{kind:'props',item}:null;}
 record(map){return{id:'mapmaker',x:0,z:0,rot:0,w:map.width,h:map.height,material:'stone',walls:map.walls.map(w=>({a:w.a,b:w.b,material:w.material})),doors:map.doors.map(d=>({id:d.id,a:C.doorBounds(d)[0],b:C.doorBounds(d)[1],closed:d.closed})),lights:map.lights.map(l=>({position:{x:l.x,y:l.y},color:l.color,alpha:1,range:l.range,intensity:l.intensity,shadows:true})),hearth:{version:2,map,catalog:this.catalog,surface:{png:'',pixelsPerGrid:32}}};}
 update(map,state){
  this.map=map;this.state=state;this.resize();
  const surfaceKey=JSON.stringify([map.width,map.height,map.base,map.rooms,map.paint,map.labels,state.visible.terrain,state.visible.rooms,state.visible.labels]);
  if(surfaceKey!==this.keys.surface){const source=this.surface(map,state.visible);this.surfaceCanvas.width=source.width;this.surfaceCanvas.height=source.height;this.surfaceCanvas.getContext('2d').drawImage(source,0,0);this.keys.surface=surfaceKey;this.group?.traverse(o=>{if(o.userData.inkSurface)o.material.map.needsUpdate=true;});}
  const key=JSON.stringify([map.width,map.height,map.walls,map.doors,map.lights,map.props.map(p=>[p.id,p.asset,...(this.catalog.find(a=>a.id===p.asset)?.tags.includes('lighting')?[p.x,p.y,p.rotation,p.scale]:[])])]);
  if(key!==this.keys.scene){this.importer.drop('mapmaker');const s=this.record(map);this.app.world.data.imports=[s];this.group=this.importer.build(s);this.keys.scene=key;if(this.slab){this.scene.remove(this.slab);this.slab.geometry.dispose();this.slab.material.dispose();}this.slab=new THREE.Mesh(new THREE.BoxGeometry(map.width*SQ,.65,map.height*SQ),new THREE.MeshStandardMaterial({color:'#76674c',roughness:.95}));this.slab.position.set(map.width*SQ/2,-.12,map.height*SQ/2);this.scene.add(this.slab);this.rebuildGrid(map);}
  const byId=new Map(map.props.map(p=>[p.id,p]));
  for(const o of this.group.children){if(o.userData.propRef){const p=byId.get(o.userData.propRef.propId);if(p){o.position.set(p.x*SQ,.27,p.y*SQ);o.rotation.y=-p.rotation*Math.PI/180;o.scale.setScalar(p.scale);}o.visible=state.visible.props!==false;}else if(o.userData.inkSurface)o.visible=true;else o.visible=state.visible.walls!==false;}
  this.grid.visible=state.grid;this.updateHelpers(map,state);this.setLighting(state.lighting);this.render();
 }
 rebuildGrid(map){if(this.grid){this.scene.remove(this.grid);this.grid.geometry.dispose();this.grid.material.dispose();}const points=[];for(let x=0;x<=map.width;x++)points.push(x*SQ,.295,0,x*SQ,.295,map.height*SQ);for(let y=0;y<=map.height;y++)points.push(0,.295,y*SQ,map.width*SQ,.295,y*SQ);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));this.grid=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:PAL.grid,transparent:true,opacity:.3,depthWrite:false}));this.scene.add(this.grid);}
 setLighting(night){this.app.weather.night=night?1:0;this.hemi.intensity=night?.14:1.6;this.sun.intensity=night?0:2.8;this.renderer.toneMappingExposure=night?1.25:1.15;const candidates=this.group?.userData.importLights||[];const near=[...candidates].sort((a,b)=>a.distanceToSquared(this.controls.target)-b.distanceToSquared(this.controls.target));this.pointLights.forEach((l,i)=>{const p=near[i];l.intensity=p?(night?42:9)*(p.ddLight?.intensity||.7):0;l.castShadow=!!p&&night;if(p){l.position.copy(p);l.color.set(p.ddLight?.color||PAL.halo);l.distance=(p.ddLight?.range||5)*SQ;}});}
 clearHelpers(){for(const object of [...this.helpers.children]){object.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.helpers.remove(object);}}
 outline(points,closed=true,color='#a54d33'){const p=points.map(v=>new THREE.Vector3(v.x*SQ,.36,v.y*SQ));if(closed&&p.length)p.push(p[0]);const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.95}));line.renderOrder=50;this.helpers.add(line);}
 circle(p,r,color='#b9853f'){this.outline(Array.from({length:65},(_,i)=>({x:p.x+Math.cos(i/64*Math.PI*2)*r,y:p.y+Math.sin(i/64*Math.PI*2)*r})),false,color);}
 updateHelpers(map,state){this.clearHelpers();const e=state.entity;
  if(e){const o=e.item;if(e.kind==='props')this.outline(C.propBounds(o,this.catalog).points);else if(e.kind==='rooms')this.outline([{x:o.x,y:o.y},{x:o.x+o.w,y:o.y},{x:o.x+o.w,y:o.y+o.h},{x:o.x,y:o.y+o.h}]);else if(e.kind==='walls')this.outline([o.a,o.b],false);else if(e.kind==='doors')this.outline(C.doorBounds(o),false);else this.circle(o,e.kind==='lights'?o.range:.5);}
  const drag=state.drag;if(drag?.type==='room'){const a=drag.start,b=drag.end;this.outline([a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}],true,'#e7b76b');}else if(drag?.type==='wall')this.outline([drag.start,drag.end],false,'#e7b76b');
  if(state.tool==='light')for(const l of map.lights)this.circle(l,.18,l.color);
  const p=state.hover;if(p&&!drag&&p.x>=0&&p.y>=0&&p.x<=map.width&&p.y<=map.height){if(state.tool==='floor'||state.tool==='terrain')this.circle(p,state.settings.brush);if(state.tool==='prop'){const a=this.catalog.find(a=>a.id===state.settings.prop),w=a.size[0]*state.settings.scale,h=a.size[1]*state.settings.scale;this.outline([{x:p.x-w/2,y:p.y-h/2},{x:p.x+w/2,y:p.y-h/2},{x:p.x+w/2,y:p.y+h/2},{x:p.x-w/2,y:p.y+h/2}],true,'#bd8648');}}
 }
 render(){if(!this.map)return;CUT.on.value=0;this.controls.update();this.shadows.update(this.app);if(this.pointLights.some(l=>l.castShadow))this.renderer.shadowMap.needsUpdate=true;this.ink.render(this.scene,this.camera,this.app);}
 exportMap(ppg,withGrid){
  const w=this.map.width*ppg,h=this.map.height*ppg;if(Math.max(w,h)>this.renderer.capabilities.maxTextureSize)throw Error('Choose a lower export resolution.');
  const oldRatio=this.renderer.getPixelRatio(),oldGrid=this.grid.visible,oldNight=this.app.weather.night,oldHelpers=this.helpers.visible,oldBackground=this.scene.background;
  const mw=this.map.width*SQ,mh=this.map.height*SQ,camera=new THREE.OrthographicCamera(-mw/2,mw/2,mh/2,-mh/2,.1,500);camera.position.set(mw/2,200,mh/2);camera.up.set(0,0,-1);camera.lookAt(mw/2,0,mh/2);
  try{this.helpers.visible=false;this.grid.visible=withGrid;this.setLighting(false);this.renderer.setPixelRatio(1);this.renderer.setSize(w,h,false);this.renderer.shadowMap.needsUpdate=true;this.renderer.render(this.scene,camera);const out=document.createElement('canvas');out.width=w;out.height=h;out.getContext('2d').drawImage(this.canvas,0,0);return out;}
  finally{this.helpers.visible=oldHelpers;this.grid.visible=oldGrid;this.scene.background=oldBackground;this.setLighting(!!oldNight);this.renderer.setPixelRatio(oldRatio);this.resize();this.render();}
 }
 dispose(){cancelAnimationFrame(this.frame);this.controls.dispose();this.ink.dispose();this.importer.drop('mapmaker');this.clearHelpers();this.renderer.dispose();}
}
