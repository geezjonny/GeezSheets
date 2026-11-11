import * as THREE from 'three';
import {CUT,MAT} from './style.js';
import {motionVertex} from './motion-shader.js';

// One local sun map follows the view. World overview and night do not pay for it.
export class AtlasShadows {
 constructor(renderer,sun,scene){
  this.renderer=renderer;this.sun=sun;this.depth=new WeakMap();this.distance=new WeakMap();this.mapSize=0;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;
  sun.shadow.bias=-.00015;sun.shadow.normalBias=.12;sun.shadow.radius=2;
  scene.add(sun.target);
 }
 depthMaterial(src,point=false){
  const cache=point?this.distance:this.depth;if(cache.has(src))return cache.get(src);
  const m=point?new THREE.MeshDistanceMaterial():new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
  m.onBeforeCompile=s=>{
   Object.assign(s.uniforms,{uCutOn:src.userData?.inkCut?CUT.on:{value:0},uCutC:CUT.c,uCutR:CUT.r,uCutH:CUT.h});
   s.vertexShader='varying vec3 vCutDepth;\n'+s.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvCutDepth=(modelMatrix*vec4(transformed,1.)).xyz;');
   s.fragmentShader='varying vec3 vCutDepth;uniform float uCutOn;uniform vec2 uCutC,uCutR;uniform float uCutH;\n'+s.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/,`void main(){if(uCutOn>.5){vec2 d=vCutDepth.xz-uCutC;vec2 l=vec2(d.x*uCutR.x-d.y*uCutR.y,d.x*uCutR.y+d.y*uCutR.x);if(abs(l.x)<30.&&abs(l.y)<30.&&vCutDepth.y>uCutH)discard;}`);
   if(point){
    // The simplified solid basket/bowl is a stand-in for an open iron cage.
    // Let its own fire illuminate the floor instead of projecting a black canopy.
    s.vertexShader='varying float vFireHousing;\n'+s.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvFireHousing=abs(aInkSurface-6.)<.1?1.:0.;');
    s.fragmentShader='varying float vFireHousing;\n'+s.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/,'void main(){if(vFireHousing>.5)discard;');
   }
  };
  const cutHook=m.onBeforeCompile;m.onBeforeCompile=s=>{cutHook(s);motionVertex(s);};
  m.customProgramCacheKey=()=> 'atlas-motion-shadow-v2-'+point+'-'+!!src.userData?.inkCut;cache.set(src,m);
  src.addEventListener('dispose',()=>{m.dispose();cache.delete(src);});return m;
 }
 update(app){
  const dist=app.camDist(),sun=this.sun;
  const enabled=dist<1800&&(app.weather?.night||0)<.95;
  sun.castShadow=enabled;this.enabled=enabled;
  // Local torch shadows still need newly streamed geometry during the night.
  app.scene.traverse(o=>{
   if(!o.isMesh||!o.material)return;
   const m=Array.isArray(o.material)?o.material[0]:o.material;
   const solid=!m.isShaderMaterial&&!m.transparent&&m.depthWrite!==false&&m.depthTest!==false;
   o.receiveShadow=solid;
   o.castShadow=solid&&m!==MAT.terrain&&m!==MAT.glow&&m!==MAT.glowCut&&!o.userData.noShadow;
   if(o.castShadow){o.customDistanceMaterial=this.depthMaterial(m,true);if(m.userData?.inkCut||o.geometry.userData.atlasMotion)o.customDepthMaterial=this.depthMaterial(m);}
  });
  if(!enabled)return;
  const size=app.quality.name==='high'?2048:1024;
  if(this.mapSize!==size){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;this.mapSize=size;}
  const c=app.controls.target,dir=app.weather.skyU.uSunDir.value;
  const radius=THREE.MathUtils.clamp(dist*.68,24,950),span=Math.max(1300,radius*3);
  // Keep shadow pixels stable while panning over the paper.
  const texel=radius*2/size,focus=new THREE.Vector3(Math.round(c.x/texel)*texel,c.y,Math.round(c.z/texel)*texel);
  sun.target.position.copy(focus);sun.position.copy(focus).addScaledVector(dir,span);
  sun.target.updateMatrixWorld();sun.updateMatrixWorld();
  Object.assign(sun.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:1,far:span*2.5});
  sun.shadow.camera.updateProjectionMatrix();
  this.renderer.shadowMap.needsUpdate=true;
 }
}
