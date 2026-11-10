// Native reconstruction of the versioned Hearth scene. No sibling checkout is
// needed at runtime; only validated IDs can reach these native builders.
import * as THREE from 'three';
import {Builder} from './places.js';
import {buildObject} from './objects.js';
import {drawItem} from './interiors.js';
import {FURNITURE} from './interior-layout.js';
import {shapes,P} from './props.js';
import {MAT,M} from './style.js';
import {SQ} from './detail.js';
import {rotatePoint,segmentsTouch} from './dd2vtt-format.js';

const C=globalThis.HearthCore;
const vegetation={oak:P.OAK,reeds:P.REED,'dead-tree':P.DEAD,stump:P.STUMP,'dry-bush':P.DRY};
let plantGeometries;
export function localInkPoint(importer,s,p){
 const [w,h]=importer.dims(s),v={x:(p.x-s.x)/SQ,y:((p.z??p.y)-s.z)/SQ};
 return rotatePoint(v,w,h,(4-s.rot)%4);
}
export function inkProp(importer,ref){
 const s=importer.list().find(s=>s.id===ref.importId),p=s?.hearth?.map.props.find(p=>p.id===ref.propId);
 return p?{s,p,asset:s.hearth.catalog.find(a=>a.id===p.asset)}:null;
}
export function inkPolygons(importer,s){
 if(!s.hearth)return[];
 return s.hearth.map.props.filter(p=>p.blocksSight||s.hearth.catalog.find(a=>a.id===p.asset)?.blocksMovement).map(p=>C.propBounds(p,s.hearth.catalog).points.map(p=>importer.point(s,p)));
}
export function insidePolygon(p,points){
 let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }return inside;
}
export function hitsInkProp(importer,s,a,b){
 return inkPolygons(importer,s).some(poly=>insidePolygon(a,poly)||insidePolygon(b,poly)||poly.some((p,i)=>segmentsTouch(a,b,p,poly[(i+1)%poly.length])));
}
export function buildNative(asset,seed){
 const {kind,key}=C.inkNative(asset),b=new Builder(seed);
 if(kind==='object')buildObject(b,key,M());
 else if(kind==='furniture')drawItem(b,{type:key,...FURNITURE[key],x:0,z:0,rot:0});
 else if(kind==='vegetation'){
  plantGeometries||=shapes();const mesh=new THREE.Mesh(plantGeometries[vegetation[key]].clone(),MAT.solid);b.propMeshes=[mesh];
 }else throw Error('Not a native Ink prop: '+asset.id);
 const group=b.geometry(false),bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3());
 // The creator footprint is authoritative; preserve the native vertical form.
 group.scale.set(asset.size[0]*SQ/Math.max(.01,size.x),1,asset.size[1]*SQ/Math.max(.01,size.z));
 group.position.set(-(bounds.min.x+bounds.max.x)/2*group.scale.x,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2*group.scale.z);
 return{group,lights:b.lights};
}
export function buildInkScene(importer,s,parent,lights){
 const a=importer.app,rich=s.hearth,ps=[],uv=[],indices=[],w=s.w,h=s.h;
 // Use the existing world surface on the surface map, and a flat surface below
 // ground. One vertex per square keeps props and token feet aligned.
 for(let y=0;y<=h;y++)for(let x=0;x<=w;x++){
  const p=importer.point(s,{x,y});ps.push(p.x,a.world.latticeHeight(p.x,p.y)+.26,p.y);uv.push(x/w,1-y/h);
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*(w+1)+x;indices.push(i,i+w+1,i+1,i+1,i+w+1,i+w+2);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 const material=new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});material.userData.hearthOwned=true;
 const floor=new THREE.Mesh(geometry,material);floor.userData.noShadow=true;floor.userData.inkSurface=true;floor.receiveShadow=true;parent.add(floor);
 parent.userData.surfaceReady=false;parent.userData.surfaceError=null;
 const texture=a.inkSurfaceCanvas?new THREE.CanvasTexture(a.inkSurfaceCanvas):new THREE.TextureLoader().load('data:image/png;base64,'+rich.surface.png,()=>{
  if(parent.userData.disposed){texture.dispose();return;}
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,a.renderer.capabilities.getMaxAnisotropy());material.map=texture;material.needsUpdate=true;parent.userData.surfaceReady=true;a.request();
 },undefined,()=>{parent.userData.surfaceError='The Ink floor artwork could not be decoded.';a.ui.toast(parent.userData.surfaceError);a.request();});
 // Assign immediately so disposal also covers an in-flight image load.
 material.map=texture;
 if(a.inkSurfaceCanvas){texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,a.renderer.capabilities.getMaxAnisotropy());parent.userData.surfaceReady=true;}
 for(const p of rich.map.props){
  const asset=rich.catalog.find(asset=>asset.id===p.asset),native=buildNative(asset,823+rich.map.props.indexOf(p)),at=importer.point(s,p),holder=new THREE.Group();
  holder.add(native.group);holder.position.set(at.x,a.world.latticeHeight(at.x,at.y)+.27,at.y);
  // Positive canvas rotation sends +X toward +Y. Three's Y rotation uses the
  // opposite sign. Import rotation is a positive turn in the canvas frame.
  holder.rotation.y=-(p.rotation*Math.PI/180+s.rot*Math.PI/2);holder.scale.setScalar(p.scale);
  const ref={type:'imported',id:s.id+':'+p.id,importId:s.id,propId:p.id,kind:asset.key,name:asset.name,space:a.world.spaceId||null,level:0};
  holder.userData.propRef=ref;holder.userData.inkAsset=p.asset;parent.add(holder);
  parent.updateMatrixWorld(true);
  for(const source of native.lights){
   const v=source.clone().applyMatrix4(native.group.matrixWorld);
   if(s.lights.some(l=>{const q=importer.point(s,l.position);return Math.hypot(q.x-v.x,q.y-v.z)<1.5;}))continue;
   v.ddLight={color:'#ff8f40',range:5,intensity:.7,alpha:1,shadows:true};lights.push(v);
  }
 }
 parent.userData.inkPropCount=rich.map.props.length;
 parent.userData.inkRoomCount=rich.map.rooms.length;
}
export function disposeInkScene(group){
 group.userData.disposed=true;const textures=new Set(),materials=new Set();
 group.traverse(o=>{for(const mat of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean))if(mat.userData.hearthOwned){if(mat.map)textures.add(mat.map);materials.add(mat);}});
 for(const texture of textures)texture.dispose();for(const mat of materials)mat.dispose();
}
