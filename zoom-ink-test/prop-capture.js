// Split generated containers from a settlement's baked mesh without changing its RNG.
import * as THREE from 'three';
import {Geo, MAT} from './style.js';

export function captureProps(builder,world,settlement,frame,scope='street') {
 let nested=false;const occurrences=new Map();builder.propMeshes=[];
 for(const kind of ['barrel','crate','cart']){
  const original=builder[kind];
  builder[kind]=function(m,x,z,...rest){
   if(nested)return original.call(this,m,x,z,...rest);
   const starts=Object.fromEntries(['p','c','ink','motionBase'].map(k=>[k,this.g[k].length]));
   nested=true;let result;try{result=original.call(this,m,x,z,...rest);}finally{nested=false;}
   const geometry=new Geo(this.seed);for(const k of Object.keys(starts))geometry[k]=this.g[k].splice(starts[k]);
   const local=new THREE.Vector3(x,rest[0]&&kind!=='cart'?rest[0]:0,z);if(m)local.applyMatrix4(m);
   const at=local.clone().applyMatrix4(frame),key=`${settlement.id}:prop:${scope}:${kind}:${local.x.toFixed(3)},${local.y.toFixed(3)},${local.z.toFixed(3)}`,n=occurrences.get(key)||0,id=n?key+':'+n:key;occurrences.set(key,n+1);
   const state=world.data.propState?.[id]||{};
   if(!state.removed){const mesh=geometry.mesh(MAT.solidCut);mesh.geometry.translate(-local.x,-local.y,-local.z);
    const shift=new THREE.Vector3(state.dx||0,0,state.dz||0).transformDirection(frame.clone().invert());
    // transformDirection normalizes; preserve the requested displacement length.
    shift.multiplyScalar(Math.hypot(state.dx||0,state.dz||0));mesh.position.copy(local).add(shift);mesh.rotation.y=state.rot||0;
    mesh.userData.propRef={type:'generated',id,kind,x:at.x,z:at.z,settlementId:settlement.id,space:null,level:0};builder.propMeshes.push(mesh);
   }
   return result;
  };
 }
}
