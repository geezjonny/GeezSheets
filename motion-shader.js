// Shared by color, ink normals, and shadow depth, so the three passes agree.
export const WORLD_MOTION={time:{value:0},amount:{value:1},distance:{value:52000}};
export function motionUniforms(s){Object.assign(s.uniforms,{uAtlasTime:WORLD_MOTION.time,uAtlasMotion:WORLD_MOTION.amount,uAtlasDistance:WORLD_MOTION.distance});}
export function motionVertex(s){
 motionUniforms(s);
 s.vertexShader=`attribute float aInkMotionBase;uniform float uAtlasTime,uAtlasMotion,uAtlasDistance;\n`+s.vertexShader;
 // Paper already declares the semantic attribute; depth/normal/basic shaders do not.
 if(!s.vertexShader.includes('attribute float aInkSurface;'))s.vertexShader='attribute float aInkSurface;\n'+s.vertexShader;
 s.vertexShader=s.vertexShader.replace('#include <project_vertex>',`
 if(uAtlasMotion>.001&&(abs(aInkSurface-3.)<.1||abs(aInkSurface-5.)<.1)){
  mat3 windBasis=mat3(modelMatrix);
  vec4 rest=vec4(transformed,1.);
  #ifdef USE_INSTANCING
  windBasis=windBasis*mat3(instanceMatrix);rest=instanceMatrix*rest;
  #endif
  vec3 wp=(modelMatrix*rest).xyz;
  float phase=wp.x*.021+wp.z*.017;
  float t=uAtlasTime;vec3 drift=vec3(0.);
  if(aInkSurface<4.){
   float close=1.-smoothstep(180.,2500.,uAtlasDistance);
   float size=clamp(length(windBasis[0]),.7,26.);
   float gust=sin(t*.38+phase)+.18*sin(t*.61+phase*.63);
   drift.x=(.018+.025*close)*size*gust;
   drift.z=(.008+.012*close)*size*sin(t*.31+phase+.8);
   drift.y=0.;
  }else{
   float h=max(0.,transformed.y-aInkMotionBase)*length(windBasis[1]);
   drift.y=h*(.045*sin(t*9.1+phase)+.025*sin(t*16.7+phase*1.3));
   drift.x=h*.025*sin(t*3.8+phase);drift.z=h*.012*cos(t*5.1+phase);
  }
  drift*=uAtlasMotion;
  transformed+=vec3(dot(drift,windBasis[0])/max(dot(windBasis[0],windBasis[0]),.0001),dot(drift,windBasis[1])/max(dot(windBasis[1],windBasis[1]),.0001),dot(drift,windBasis[2])/max(dot(windBasis[2],windBasis[2]),.0001));
 }
 #include <project_vertex>`);
}
