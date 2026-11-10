import {motionVertex} from './motion-shader.js';
// Procedural paper surfaces. World-space strokes remain attached while orbiting.
export const INK_STYLE={distance:{value:52000},night:{value:0},fineDetail:{value:1},sunDirection:{value:[-.8,1,.55]}};
export function paperShader(s){
 Object.assign(s.uniforms,{uInkDistance:INK_STYLE.distance,uInkNight:INK_STYLE.night,uInkFineDetail:INK_STYLE.fineDetail,uInkSunDir:INK_STYLE.sunDirection,uInkTerrain:{value:0},uInkWater:{value:0}});
 s.vertexShader='attribute float aInkSurface;varying float vInkSurface;varying vec3 vInkWorld;\n'+s.vertexShader.replace('#include <project_vertex>',`
 vInkSurface=aInkSurface;
 vec4 inkP=vec4(transformed,1.);
 #ifdef USE_INSTANCING
 inkP=instanceMatrix*inkP;
 #endif
 vInkWorld=(modelMatrix*inkP).xyz;
 #include <project_vertex>`);
 motionVertex(s);
 s.fragmentShader=s.fragmentShader.replace('#include <shadowmap_pars_fragment>',`#include <shadowmap_pars_fragment>
 // Torch occlusion already belongs to each light's irradiance. Only the sun
 // contributes the extra illustrated cast-shadow wash over the daytime paper.
 float inkSunShadow(){float shadow=1.;
 #ifdef USE_SHADOWMAP
 #if NUM_DIR_LIGHT_SHADOWS > 0
 DirectionalLightShadow inkDirectional;
 #pragma unroll_loop_start
 for(int i=0;i<NUM_DIR_LIGHT_SHADOWS;i++){
  inkDirectional=directionalLightShadows[i];
  shadow*=receiveShadow?getShadow(directionalShadowMap[i],inkDirectional.shadowMapSize,inkDirectional.shadowIntensity,inkDirectional.shadowBias,inkDirectional.shadowRadius,vDirectionalShadowCoord[i]):1.;
 }
 #pragma unroll_loop_end
 #endif
 #endif
 return shadow;}`);
 s.fragmentShader=`varying float vInkSurface;varying vec3 vInkWorld;uniform float uInkDistance,uInkNight,uInkTerrain,uInkWater,uInkFineDetail,uAtlasTime,uAtlasMotion;uniform vec3 uInkSunDir;
 float inkHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float paperNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(inkHash(i),inkHash(i+vec2(1.,0.)),f.x),mix(inkHash(i+vec2(0.,1.)),inkHash(i+vec2(1.,1.)),f.x),f.y);}
 float penStroke(float x){float w=max(fwidth(x),.003);return (1.-smoothstep(.075,.075+w,abs(fract(x)-.5)))*(1.-smoothstep(.25,.8,w));}
 `+s.fragmentShader.replace('#include <opaque_fragment>',`
 // Preserve real irradiance before replacing the material with illustrated paper.
 vec3 inkIncident=outgoingLight/max(diffuseColor.rgb,vec3(.035));
 vec3 inkN=normalize((vec4(normal,0.)*viewMatrix).xyz);
 vec3 an=abs(inkN);vec2 paperUV=an.y>an.x&&an.y>an.z?vInkWorld.xz:an.x>an.z?vInkWorld.zy:vInkWorld.xy;
 float lum=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
 float castShade=1.-inkSunShadow();
 float faceShade=clamp(.76-dot(inkN,normalize(uInkSunDir)),0.,1.);
 if(uInkTerrain>.5)faceShade=max(faceShade,clamp((1.-abs(inkN.y))*1.5,0.,1.));
 faceShade=max(faceShade,castShade*.9);
 faceShade*=1.-uInkNight;
 float pigment=clamp((.62-lum)*.54,0.,.32);
 vec3 page=mix(vec3(.27,.235,.17),vec3(.12,.13,.095),pigment);
 // Restrained pigment over stained paper. Preserve dark material values instead
 // of lifting every roof, leaf and stone into a pastel midtone.
 vec3 painted=pow(max(diffuseColor.rgb,vec3(0.)),vec3(.92))*.76;
 float pooling=.76+.08*paperNoise(paperUV*.13)+.04*paperNoise(paperUV*.65);
 page=mix(page,painted,pooling);
 float grain=paperNoise(paperUV*7.)*.55+paperNoise(paperUV*.75)*.45;
 page*=.925+grain*.095;
 // Close-up marks fade by actual distance and screen footprint, not abrupt zoom steps.
 float detailFade=(1.-smoothstep(65.,180.,distance(cameraPosition,vInkWorld)))*uInkFineDetail;
 if(detailFade>.001&&vInkSurface>.5){
  float marks=0.;float footprint=max(length(dFdx(paperUV)),length(dFdy(paperUV)));
  if(vInkSurface<1.5){
   // Long, gently wavering grain and occasional knot rings. No diagonal hatch.
   float bend=paperNoise(vec2(paperUV.y*.35,paperUV.x*.22));
   float grainLine=penStroke(paperUV.x*8.+bend*.8+sin(paperUV.y*.6)*.25);
   vec2 kp=paperUV/vec2(.7,2.4),ki=floor(kp),kf=fract(kp)-.5;
   float knot=penStroke(length(kf*vec2(2.8,1.2))*4.)*(1.-smoothstep(.1,.3,length(kf)))*step(.84,inkHash(ki));
   marks=(grainLine*.16+knot*.20)*(1.-smoothstep(.08,.22,footprint));
  }else if(vInkSurface<2.5){
   // Worn staggered cobbles: hairline joints and irregular, softly mottled faces.
   vec2 cp=paperUV/vec2(.55,.38);float row=floor(cp.y);cp.x+=mod(row,2.)*.5;
   vec2 ci=floor(cp),cf=fract(cp);float edge=min(min(cf.x,1.-cf.x),min(cf.y,1.-cf.y));
   float aa=max(fwidth(cp.x),fwidth(cp.y));float joint=1.-smoothstep(.025,.025+aa,edge);
   float wear=paperNoise(paperUV*15.);float fissure=penStroke((cf.x+cf.y*.21)*2.5)*step(.92,inkHash(ci))*smoothstep(.2,.5,cf.y);
   marks=(joint*.20+fissure*.12+(wear-.5)*.07)*(1.-smoothstep(.24,.7,aa));
  }else if(vInkSurface<3.5){
   // Sparse leaf tips and veins on the existing canopy, rather than leaf meshes.
   vec2 lp=paperUV*3.5,li=floor(lp),lf=fract(lp)-.5;float seed=inkHash(li);
   float side=seed>.5?1.:-1.;vec2 leaf=vec2(lf.x+lf.y*side*.4,lf.y);
   float oval=length(leaf*vec2(3.,1.8));float rim=1.-smoothstep(.035,.035+max(fwidth(oval),.01),abs(oval-.52));
   float vein=(1.-smoothstep(.015,.015+max(fwidth(lf.x),.01),abs(leaf.x)))*(1.-smoothstep(.2,.35,abs(leaf.y)));
   marks=(rim*.14+vein*.10)*step(.42,seed)*(1.-smoothstep(.10,.28,footprint));
  }else{
   marks=(paperNoise(paperUV*12.)-.45)*.15*(1.-smoothstep(.08,.25,footprint));
  }
  page*=1.-marks*detailFade;
 }
 // Dark palette entries are the actual drawn beams, windows, door hinges and trunks.
 float inkPigment=(1.-smoothstep(.004,.032,lum))*.72;
 // Surface form now comes from smooth face shading and actual cast shadows.
 outgoingLight=mix(page*(1.-faceShade*.35),vec3(.035,.030,.024),inkPigment);
 if(uInkTerrain>.5){
  outgoingLight*=1.-clamp((.78-lum)*.65,0.,.23);
  float atlasFade=smoothstep(1200.,9000.,uInkDistance);
  float contour=penStroke(vInkWorld.y/max(4.,uInkDistance/450.))*smoothstep(.04,.22,1.-abs(inkN.y))*atlasFade;
  float forest=(1.-smoothstep(.40,.61,lum))*(1.-smoothstep(50.,140.,vInkWorld.y));
  vec2 dotUV=vInkWorld.xz/240.;float dotInk=(1.-smoothstep(.10,.20,length(fract(dotUV)-.5)))*step(.35,inkHash(floor(dotUV)));
  outgoingLight=mix(outgoingLight,vec3(.09,.064,.035),clamp(contour*.60+forest*dotInk*atlasFade*.43,0.,.6));
  float coastWidth=max(1.2,fwidth(vInkWorld.y)*2.8);
  float coastInk=(1.-smoothstep(0.,coastWidth,abs(vInkWorld.y)))*step(0.,vInkWorld.y);
  outgoingLight=mix(outgoingLight,vec3(.055,.039,.022),coastInk*.85);
 }
 if(uInkWater>.5){
  vec2 waveUV=vInkWorld.xz/max(2.,uInkDistance/260.);
  float nearWater=1.-smoothstep(150.,2500.,uInkDistance);float waterTime=uAtlasTime*uAtlasMotion;
  float wave=penStroke(waveUV.y*.1-waterTime*mix(.009,.028,nearWater)+sin(waveUV.x*.11-waterTime*.12)*.035);
  wave*=step(.6,inkHash(floor(waveUV/vec2(22.,10.))))*(1.-smoothstep(.12,.35,fwidth(waveUV.y*.1)));
  // Retain the water's blue/teal wash and engraved waves on the same paper grain.
  outgoingLight=mix(page*(1.-faceShade*.18),vec3(.045,.075,.085),wave*.22);
 }
 // The sun casts real occlusion onto the paper surfaces.
 outgoingLight*=1.-castShade*.52*(1.-uInkNight);
 // Night is illuminated by the real scene lights, not a global paper wash.
 // A tiny cool ambient term preserves silhouettes; fire supplies the warm pools.
 vec3 nightLight=vec3(.003,.004,.007)+clamp(inkIncident*1.35,vec3(0.),vec3(2.4));
 outgoingLight*=mix(vec3(1.),nightLight,smoothstep(0.,1.,uInkNight));
 #include <opaque_fragment>`);
}
