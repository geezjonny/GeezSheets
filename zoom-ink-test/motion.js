import * as THREE from 'three';
import {WORLD_MOTION} from './motion-shader.js';
import {hash} from './noise.js';

export class WorldMotion {
 constructor(app){
  this.app=app;this.enabled=app.prefs.motion!==false;this.time=0;this.lastFrame=-1e9;this.nextFrame=0;
  this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
  this.reduced.addEventListener('change',()=>{this.sync();app.request();});
  document.addEventListener('visibilitychange',()=>{this.sync();app.request();});
  const seeds=[],sources=[],positions=[];
  for(let source=0;source<6;source++)for(let i=0;i<8;i++){seeds.push(hash(source,i,601),hash(source,i,602),hash(source,i,603));sources.push(source);positions.push(0,0,0);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,3));geo.setAttribute('aSource',new THREE.Float32BufferAttribute(sources,1));
  this.uniforms={uT:WORLD_MOTION.time,uOrigins:{value:Array.from({length:6},()=>new THREE.Vector3())},uPx:{value:1},uNight:{value:0}};
  const material=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:`attribute vec3 aSeed;attribute float aSource;uniform vec3 uOrigins[6];uniform float uT,uPx;varying float vAlpha;void main(){
    float age=fract(uT/(2.5+aSeed.z*2.)+aSeed.x);float life=1.-age;
    vec3 p=uOrigins[int(aSource)];p.x+=sin(age*3.+aSeed.y*6.28)*.09+age*age*.18;
    p.z+=cos(age*2.+aSeed.z*6.28)*.07;p.y+=age*(1.1+aSeed.y*1.2);
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
    gl_PointSize=clamp(95./max(1.,-mv.z),1.,2.)*uPx;vAlpha=life*life*smoothstep(0.,.12,age);
   }`,
   fragmentShader:`uniform float uNight;varying float vAlpha;void main(){float r=length(gl_PointCoord-.5);float a=(1.-smoothstep(.12,.5,r))*vAlpha;gl_FragColor=vec4(vec3(.8,.29,.055),a*mix(.14,.35,uNight));}`});
  this.embers=new THREE.Points(geo,material);this.embers.frustumCulled=false;this.embers.renderOrder=5;this.embers.visible=false;app.scene.add(this.embers);this.sync();
 }
 get active(){return this.enabled&&!this.reduced.matches&&!document.hidden;}
 sync(){WORLD_MOTION.amount.value=this.active?1:0;}
 advance(dt){this.sync();if(this.active)this.time+=Math.min(dt,.05);WORLD_MOTION.time.value=this.time;WORLD_MOTION.distance.value=this.app.camDist();}
 wantsFrame(now,dist){return this.active&&now>=this.nextFrame;}
 rendered(now){this.lastFrame=now;const interval=this.app.camDist()>800||this.app.quality.name==='low'?1000/30:1000/60;if(now>=this.nextFrame)this.nextFrame=Math.max(this.nextFrame+interval,now+interval*.05);}
 update(lights){
  const a=this.app;WORLD_MOTION.distance.value=a.camDist();
  const nearby=this.active&&a.camDist()<240?lights.filter(l=>l.intensity>.01&&l.position.distanceTo(a.controls.target)<65).slice(0,a.quality.name==='low'?3:6):[];
  this.embers.visible=nearby.length>0;
  nearby.forEach((l,i)=>this.uniforms.uOrigins.value[i].copy(l.position));
  this.embers.geometry.setDrawRange(0,nearby.length*8);this.uniforms.uPx.value=a.renderer.getPixelRatio();this.uniforms.uNight.value=a.weather.night;
 }
 setEnabled(on){this.enabled=!!on;this.app.prefs.motion=this.enabled;this.sync();this.app.savePrefs();this.app.ui.refresh();this.app.request();}
}
