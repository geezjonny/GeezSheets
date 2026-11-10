// Battlemap pins are bookmarks. Grid and tokens belong to the world.
import * as THREE from 'three';
import { PAL, CUT } from './style.js';
import { tokenMesh } from './places.js';
import { fadeStanding, disposeToken } from './tokens.js';
import { SQ, squareAt, squareCenter } from './detail.js';
import { HALF } from './world.js';
export const sqC = i => (i - 19.5) * SQ;
export class Maps {
  constructor(world,scene,towns) {
    this.world=world; this.scene=scene; this.towns=towns; this.loaded=new Map(); this.tokenMeshes=new Map(); this.active=null; this.townVersion=-1; this.gridKey=null; this.tokensDirty=true;
    const g=new THREE.BufferGeometry();
    this.grid=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:PAL.grid,transparent:true,opacity:0,depthWrite:false}));
    this.grid.renderOrder=3; this.grid.frustumCulled=false; this.grid.visible=false; scene.add(this.grid);
  }
  visible(m,role) { return role==='gm' || m.known; }
  tokenVisible(t,role) { return role==='gm'||!t.npcSettlement||!!(this.world.campaignData||this.world.data).settlements.find(s=>s.id===t.npcSettlement)?.known; }
  toWorld(m,lx,lz) { const c=Math.cos(m.rot||0),s=Math.sin(m.rot||0); return [m.x+lx*c+lz*s,m.z-lx*s+lz*c]; }
  at(x,z,role='gm') { return this.world.data.battlemaps.find(m=>this.visible(m,role) && Math.hypot(x-m.x,z-m.z)<30)||null; }
  autoRot() { return 0; }
  ground(x,z) { return Math.max(this.world.latticeHeight(x,z),this.towns.floorAt(x,z) ?? -Infinity,this.world.detail?.floorAt(x,z) ?? -Infinity,this.world.blueprints?.floorAt(x,z) ?? -Infinity,this.world.ddImports?.floorAt(x,z) ?? -Infinity); }
  free(id) { this.loaded.delete(id); this.invalidateGrid(); }
  freeAll() { this.loaded.clear(); for(const m of this.tokenMeshes.values()) { this.scene.remove(m); disposeToken(m); } this.tokenMeshes.clear(); this.invalidateGrid(); this.tokensDirty=true; }
  invalidateGrid() { this.gridKey=null; this.tokensDirty=true; }
  buildGrid(sx,sz) {
    const v=[], point=(i,j)=>{ const x=i*SQ-HALF,z=j*SQ-HALF; return [x,this.ground(x,z)+.18,z]; };
    for(let k=-30;k<=30;k++) for(let t=-30;t<30;t++) v.push(...point(sx+t,sz+k),...point(sx+t+1,sz+k),...point(sx+k,sz+t),...point(sx+k,sz+t+1));
    this.grid.geometry.dispose(); this.grid.geometry=new THREE.BufferGeometry(); this.grid.geometry.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
  }
  tokenWorld(t) { if((t.space||null)!==(this.world.spaceId||null))return null; if(t.sx==null || t.sz==null) return null; const [x,z]=squareCenter(t.sx,t.sz); return { x,y:this.ground(x,z)+2.1+(t.level||0)*3.2,z }; }
  refreshTokens() { this.tokensDirty=true; }
  buildTokens() { this.refreshTokens(); }
  update(camera,role,camDist,target,cutaway,showGrid=true) {
    if(this.townVersion!==this.towns.version) { this.townVersion=this.towns.version; this.invalidateGrid(); }
    for(const m of this.world.data.battlemaps) {
      const d=Math.hypot(m.x-camera.position.x,this.world.latticeHeight(m.x,m.z)-camera.position.y,m.z-camera.position.z);
      if(this.visible(m,role) && d<500) this.loaded.set(m.id,{id:m.id,map:m});
      else if(d>700 || !this.visible(m,role)) this.loaded.delete(m.id);
    }
    this.active=camDist<400?this.at(target.x,target.z,role):null;
    this.grid.visible=showGrid&&camDist<300;
    this.grid.material.opacity=Math.min(1,Math.max(0,(300-camDist)/150))*.6;
    if(this.grid.visible) {
      const [sx,sz]=squareAt(target.x,target.z),key=sx+','+sz;
      if(this.gridKey!==key) { this.buildGrid(sx,sz); this.gridKey=key; }
    }
    const keep=new Set();
    for(const t of this.world.data.tokens) {
      if(!this.tokenVisible(t,role))continue;
      if((t.level||0)!==0||(t.space||null)!==(this.world.spaceId||null)) continue;
      const w=this.tokenWorld(t); if(!w || Math.hypot(w.x-camera.position.x,w.y-camera.position.y,w.z-camera.position.z)>700) continue;
      keep.add(t.id); let mesh=this.tokenMeshes.get(t.id);
      if(mesh && this.tokensDirty) { this.scene.remove(mesh); disposeToken(mesh); this.tokenMeshes.delete(t.id); mesh=null; }
      if(!mesh) { mesh=tokenMesh(t); this.scene.add(mesh); this.tokenMeshes.set(t.id,mesh); }
      mesh.position.set(w.x,w.y-2.07,w.z); fadeStanding(mesh,camera);
    }
    for(const [id,m] of this.tokenMeshes) if(!keep.has(id)) { this.scene.remove(m); disposeToken(m); this.tokenMeshes.delete(id); }
    this.tokensDirty=false;
    CUT.on.value=cutaway && camDist<220?1:0;
    CUT.c.value.set(target.x,target.z); CUT.r.value.set(1,0); CUT.h.value=(cutaway&&camDist<220?this.world.interiors?.cutHeight(target.x,target.z):null)??this.world.latticeHeight(target.x,target.z)+2.7;
    return false;
  }
}
