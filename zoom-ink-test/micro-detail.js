// Tiny decorative stones: one instanced draw, deterministic slots, no collision or shadows.
import * as THREE from 'three';
import {Geo,M,PAL,MAT,ico} from './style.js';
import {hash,smoothstep} from './noise.js';
import {squareAt} from './detail.js';

export class MicroDetail {
 constructor(app){
  this.app=app;this.enabled=true;this.cache=new Map();this.signature='';this.data=null;this.count=0;
  const geo=new Geo(721).add(ico(1,0),PAL.rock,M(0,0,0,0,1,.65,.8),{jitter:.24,cj:.13}).geometry();
  this.mesh=new THREE.InstancedMesh(geo,MAT.solid,400);this.mesh.count=0;this.mesh.frustumCulled=false;
  this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.userData.noShadow=true;
  app.scene.add(this.mesh);this.frustum=new THREE.Frustum();this.projection=new THREE.Matrix4();
  this.sphere=new THREE.Sphere(new THREE.Vector3(),.5);this.matrix=new THREE.Matrix4();
 }
 invalidate(){this.cache.clear();this.signature='';}
 candidate(i,j){
  const key=i+','+j;if(this.cache.has(key))return this.cache.get(key);
  const w=this.app.world,r=hash(i,j,407);let p=null;
  if(r<.6){
   const x=(i+.15+hash(i,j,408)*.7)*6,z=(j+.15+hash(i,j,409)*.7)*6;
   const y=w.latticeHeight(x,z);
   if(y>.6&&Math.abs(w.latticeHeight(x+.5,z)-y)<.6&&Math.abs(w.latticeHeight(x,z+.5)-y)<.6)
    p={x,y:y+.025,z,size:.09+hash(i,j,410)**2*.20,angle:hash(i,j,411)*6.283,stretch:.7+hash(i,j,412)*.9};
  }
  this.cache.set(key,p);if(this.cache.size>1800)this.cache.delete(this.cache.keys().next().value);return p;
 }
 update(){
  const a=this.app,c=a.camera,dist=a.camDist();
  if(!this.enabled||dist>450||a.detailLevel!==0){this.mesh.visible=false;this.mesh.count=0;this.count=0;this.signature='';return;}
  if(this.data!==a.world.data){this.invalidate();this.data=a.world.data;}
  this.mesh.visible=true;
  const key=[c.position.x,c.position.y,c.position.z].map(n=>Math.round(n*2)).join(',')+','+c.quaternion.toArray().map(n=>Math.round(n*160)).join(',')+','+a.towns.version+','+a.quality.name;
  if(key===this.signature)return;this.signature=key;
  this.projection.multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.projection);
  const range=a.quality.name==='high'?100:75,cap=a.quality.name==='high'?400:160;
  const t=a.controls.target,ci=Math.floor(t.x/6),cj=Math.floor(t.z/6),n=Math.ceil(range/6);let count=0;
  // Center-out order keeps the nearest stones when the budget is full.
  const slots=[];for(let j=cj-n;j<=cj+n;j++)for(let i=ci-n;i<=ci+n;i++)slots.push([Math.hypot(i-ci,j-cj),i,j]);slots.sort((a,b)=>a[0]-b[0]);
  for(const [,i,j]of slots){
   if(count>=cap)break;const p=this.candidate(i,j);if(!p)continue;
   const d=c.position.distanceTo(this.sphere.center.set(p.x,p.y,p.z));
   const fade=1.-smoothstep(range*.58,range,d);if(fade<.03||!this.frustum.intersectsSphere(this.sphere))continue;
   const [sx,sz]=squareAt(p.x,p.z);
   if(a.ddImports?.covers(p.x,p.z)||a.detail.painted(0,sx,sz)||a.towns.floorAt(p.x,p.z)!=null||a.blueprints.floorAt(p.x,p.z)!=null)continue;
   const s=p.size*fade;this.matrix.makeRotationY(p.angle);this.matrix.scale(new THREE.Vector3(s*p.stretch,s,s));this.matrix.setPosition(p.x,p.y,p.z);
   this.mesh.setMatrixAt(count++,this.matrix);
  }
  this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;this.count=count;
 }
}
