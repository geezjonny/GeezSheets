// The atlas renderer. Surface shaders supply paper and shading; this pass adds
// geometry-aware ink edges. It never changes the world's geometry or saved data.
import * as THREE from 'three';
import { CUT, INK_STYLE } from './style.js';
import {motionVertex} from './motion-shader.js';

const vertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const fragment = `
uniform sampler2D tColor,tDepth,tNormal;
uniform vec2 resolution;
uniform float cameraNear,cameraFar,inkStrength,normalStrength;
varying vec2 vUv;
float zAt(vec2 uv){float d=texture2D(tDepth,uv).r;return (2.*cameraNear*cameraFar)/(cameraFar+cameraNear-(d*2.-1.)*(cameraFar-cameraNear));}
float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec2 texel=1./resolution;
 vec3 c=texture2D(tColor,vUv).rgb;
 vec3 n=texture2D(tNormal,vUv).rgb*2.-1.;
 float z=zAt(vUv),edge=0.;
 // A silhouette is a depth discontinuity; a roof ridge is a normal discontinuity.
 for(int i=0;i<4;i++){
  vec2 dir=i==0?vec2(1.,0.):i==1?vec2(-1.,0.):i==2?vec2(0.,1.):vec2(0.,-1.);
  vec2 uv=vUv+dir*texel;
  float dz=abs(zAt(uv)-z)/max(z,1.);
  float ne=length(texture2D(tNormal,uv).rgb*2.-1.-n);
  float de=smoothstep(.003,.025,dz);
  float ridge=smoothstep(.50,.95,ne)*normalStrength;
  edge=max(edge,max(de,ridge));
 }
 // Film grain and gentle foxing are deliberately quiet and do not hide the map.
 float grain=noise(floor(vUv*resolution))-.5;
 c*=1.+grain*.025;
 vec2 q=vUv-.5;float vignette=smoothstep(.22,.75,length(q*vec2(1.,.85)));
 c*=1.-vignette*.18;
 c=mix(c,min(c,vec3(.025,.018,.012)),clamp(edge*inkStrength,0.,.86));
 gl_FragColor=vec4(c,1.);
 #include <colorspace_fragment>
}`;

export class InkRenderer {
 constructor(renderer){
  this.renderer=renderer;this.width=0;this.height=0;this.cache=new WeakMap();
  this.targets=[];this.last={calls:0,tris:0,totalCalls:0};this.enabled=true;
  // Linear 8-bit buffers visibly band in torchlit darkness; retain dim-light precision.
  const colorType=renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType;
  this.color=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,type:colorType});
  this.color.texture.colorSpace=THREE.LinearSRGBColorSpace;
  this.color.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  this.normal=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
  this.normal.texture.colorSpace=THREE.NoColorSpace;
  this.targets.push(this.color,this.normal);
  this.uniforms={tColor:{value:this.color.texture},tDepth:{value:this.color.depthTexture},tNormal:{value:this.normal.texture},resolution:{value:new THREE.Vector2(1,1)},cameraNear:{value:.1},cameraFar:{value:100000},inkStrength:{value:.85},normalStrength:{value:.66}};
  this.material=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:fragment,depthTest:false,depthWrite:false,toneMapped:false});
  this.scene=new THREE.Scene();this.camera=new THREE.Camera();
  this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.quad.frustumCulled=false;this.scene.add(this.quad);
 }
 normalMaterial(src){
  if(this.cache.has(src))return this.cache.get(src);
  const m=new THREE.MeshNormalMaterial({side:src.side,flatShading:src.flatShading??true,depthTest:src.depthTest,depthWrite:src.depthWrite,depthFunc:src.depthFunc,polygonOffset:src.polygonOffset,polygonOffsetFactor:src.polygonOffsetFactor,polygonOffsetUnits:src.polygonOffsetUnits});
  if(src.customProgramCacheKey().startsWith('ribbon-')){
   // Roads lift and widen in their vertex shader; their normal pass must agree.
   m.onBeforeCompile=src.onBeforeCompile;m.customProgramCacheKey=()=> 'ink-normal-'+src.customProgramCacheKey();
  }
  if(src.userData?.inkCut){
   m.onBeforeCompile=s=>{
    Object.assign(s.uniforms,{uCutOn:CUT.on,uCutC:CUT.c,uCutR:CUT.r,uCutH:CUT.h});
    s.vertexShader='varying vec3 vInkCut;\n'+s.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvInkCut=(modelMatrix*vec4(transformed,1.)).xyz;');
    s.fragmentShader='varying vec3 vInkCut;uniform float uCutOn;uniform vec2 uCutC,uCutR;uniform float uCutH;\n'+s.fragmentShader.replace('void main() {',`void main(){if(uCutOn>.5){vec2 d=vInkCut.xz-uCutC;vec2 l=vec2(d.x*uCutR.x-d.y*uCutR.y,d.x*uCutR.y+d.y*uCutR.x);if(abs(l.x)<30.&&abs(l.y)<30.&&vInkCut.y>uCutH)discard;}`);
   };
   m.customProgramCacheKey=()=> 'ink-normal-cut-v1';
  }
  const baseHook=m.onBeforeCompile;m.onBeforeCompile=s=>{baseHook(s);motionVertex(s);};
  this.cache.set(src,m);
  // Generated towns dispose their source materials when unloaded.
  src.addEventListener('dispose',()=>{m.dispose();this.cache.delete(src);});
  return m;
 }
 resize(){
  const size=this.renderer.getDrawingBufferSize(new THREE.Vector2());
  // Cap atlas buffers to the viewport on high-DPI phones; CSS size stays unchanged.
  const scale=Math.min(1,1800/Math.max(size.x,size.y));
  const w=Math.max(1,Math.round(size.x*scale)),h=Math.max(1,Math.round(size.y*scale));
  if(w===this.width&&h===this.height)return;
  this.width=w;this.height=h;this.targets.forEach(t=>t.setSize(w,h));this.uniforms.resolution.value.set(w,h);
 }
 render(scene,camera,app){
  const r=this.renderer;this.resize();INK_STYLE.distance.value=app.camDist();INK_STYLE.night.value=app.weather?.night||0;
  document.body.classList.toggle('is-night',INK_STYLE.night.value>.5);
  if(app.weather?.skyU)app.weather.skyU.uSunDir.value.toArray(INK_STYLE.sunDirection.value);
  this.uniforms.cameraNear.value=camera.near;this.uniforms.cameraFar.value=camera.far;
  // Avoid outlining every terrain triangle at atlas distance.
  this.uniforms.normalStrength.value=THREE.MathUtils.smoothstep(12000-app.camDist(),0,11000)*.9;
  if(!this.enabled){r.render(scene,camera);return;}
  const changed=[],hidden=[],background=scene.background,fog=scene.fog,oldClear=r.getClearColor(new THREE.Color()),oldAlpha=r.getClearAlpha(),oldTarget=r.getRenderTarget();
  try{
   r.setRenderTarget(this.color);r.clear();r.render(scene,camera);
   this.last.calls=r.info.render.calls;this.last.tris=r.info.render.triangles;
   if(this.uniforms.normalStrength.value>.02){
   scene.traverse(o=>{
    if(!o.visible||!o.material)return;
    if(!o.isMesh||o.material.isShaderMaterial||o.material.depthWrite===false||o.material.depthTest===false){hidden.push([o,o.visible]);o.visible=false;return;}
    changed.push([o,o.material]);o.material=Array.isArray(o.material)?o.material.map(m=>this.normalMaterial(m)):this.normalMaterial(o.material);
   });
   scene.background=null;scene.fog=null;r.setClearColor(0x8080ff,1);r.setRenderTarget(this.normal);r.clear();r.render(scene,camera);
   this.last.totalCalls=this.last.calls+r.info.render.calls+1;
   }else this.last.totalCalls=this.last.calls+1;
  }finally{
   for(const [o,m]of changed)o.material=m;for(const [o,v]of hidden)o.visible=v;
   scene.background=background;scene.fog=fog;r.setClearColor(oldClear,oldAlpha);r.setRenderTarget(oldTarget);
  }
  r.render(this.scene,this.camera);
 }
 dispose(){this.targets.forEach(t=>t.dispose());this.material.dispose();this.quad.geometry.dispose();}
}
