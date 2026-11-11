import * as THREE from 'three';
import { HALF, encodeBytes, decodeBytes } from './world.js';
import { PAL, Geo, M, unitBox, slab } from './style.js';
import { Builder } from './places.js';
import { OBJECTS, buildObject } from './objects.js';
import { hash } from './noise.js';

export const SQ = 1.5, TILE = 40, COUNT = TILE * TILE;
// Ground 0 is untouched; 1 is explicit None; 12 is Clear. Wall low nibble is
// 1 stone / 2 timber / 3 palisade; bit 4 is a door, bit 5 a window.
export const CLEAR = 12, DOOR = 16, WINDOW = 32;
export const GROUNDS = [['None',null],['Flagstone',PAL.flag1],['Cobble',PAL.stoneDark],['Dirt',PAL.dirt],['Wood floor',PAL.wood],['Rock floor',PAL.rock],['Sand',PAL.beach],['Grass',PAL.grass],['Mud',PAL.woodDark],['Shallow water',PAL.shallow],['Deep water',PAL.deep]];
export const squareAt = (x,z) => [Math.floor((x+HALF)/SQ),Math.floor((z+HALF)/SQ)];
export const squareCenter = (sx,sz) => [(sx+.5)*SQ-HALF,(sz+.5)*SQ-HALF];
export function decodeTile(t) { return { ground:decodeBytes(t.ground,COUNT), wallN:decodeBytes(t.wallN,COUNT), wallW:decodeBytes(t.wallW,COUNT), objects:(t.objects || []).map(o=>({...o})) }; }
export function encodeTile(t) { return { ground:encodeBytes(t.ground), wallN:encodeBytes(t.wallN), wallW:encodeBytes(t.wallW), objects:t.objects.map(o=>({...o})) }; }
const emptyTile = () => ({ ground:new Uint8Array(COUNT),wallN:new Uint8Array(COUNT),wallW:new Uint8Array(COUNT),objects:[] });

export class Detail {
  constructor(world,scene) { this.world=world; this.scene=scene; this.cache=new Map(); this.loaded=new Map(); this.pending=false; world.detail=this; }
  reset() { this.freeAll(); this.cache.clear(); this.pending=false; }
  address(level,sx,sz) { const ti=Math.floor(sx/TILE),tj=Math.floor(sz/TILE); return [level+','+ti+','+tj,(sz-tj*TILE)*TILE+sx-ti*TILE]; }
  tile(key,create=false) {
    let t=this.cache.get(key);
    if(!t && this.world.data.detail[key]) { t=decodeTile(this.world.data.detail[key]); this.cache.set(key,t); }
    if(!t && create) { t=emptyTile(); this.cache.set(key,t); }
    return t;
  }
  getSquare(level,sx,sz) { const [key,k]=this.address(level,sx,sz),t=this.tile(key); return { ground:t?.ground[k]||0,wallN:t?.wallN[k]||0,wallW:t?.wallW[k]||0, object:t?.objects.find(o=>o.i===k%TILE && o.j===Math.floor(k/TILE))||null }; }
  setSquare(level,sx,sz,patch) {
    const old=this.getSquare(level,sx,sz);
    if(Object.entries(patch).every(([f,v])=>old[f]===v)) return;
    const [key,k]=this.address(level,sx,sz),t=this.tile(key,true);
    for(const f of ['ground','wallN','wallW']) if(patch[f]!=null) t[f][k]=patch[f];
    if('object' in patch) { t.objects=t.objects.filter(o=>o.i!==k%TILE || o.j!==Math.floor(k/TILE)); if(patch.object) t.objects.push({...patch.object,i:k%TILE,j:Math.floor(k/TILE)}); }
    if(!t.objects.length && !t.ground.some(Boolean) && !t.wallN.some(Boolean) && !t.wallW.some(Boolean)) { delete this.world.data.detail[key]; this.cache.delete(key); }
    else this.world.data.detail[key]=encodeTile(t);
    this.free(key);
  }
  painted(level,sx,sz) {
    const [key,k]=this.address(level,sx,sz),t=this.tile(key);
    if(t && (t.ground[k] || t.wallN[k] || t.wallW[k] || t.objects.some(o=>o.i===k%TILE && o.j===Math.floor(k/TILE)))) return true;
    const [ek,ei]=this.address(level,sx+1,sz),[sk,si]=this.address(level,sx,sz+1);
    return !!(this.tile(ek)?.wallW[ei] || this.tile(sk)?.wallN[si]);
  }
  // the ground detail stands on: the land, or a ship's deck (blueprints.js)
  base(x,z) { return this.world.blueprints?.floorAt(x,z) ?? this.world.latticeHeight(x,z); }
  floorAt(x,z) { const [sx,sz]=squareAt(x,z),g=this.getSquare(0,sx,sz).ground; return g>1 && g<CLEAR ? this.base(x,z)+.22 : null; }
  walled(level,sx,sz) { const s=this.getSquare(level,sx,sz); return !!(s.wallN || s.wallW || this.getSquare(level,sx+1,sz).wallW || this.getSquare(level,sx,sz+1).wallN); }
  wallBlocked(level,sx,sz) { const s=this.getSquare(level,sx,sz); return [s.wallN,s.wallW,this.getSquare(level,sx+1,sz).wallW,this.getSquare(level,sx,sz+1).wallN].some(v=>v && !(v&DOOR)); }
  // Walls stand on square edges: a step from one square to the next is blocked by a wall (not a door) on the
  // edge between them; a diagonal step only if both ways round are.
  edgeBlocked(level,ax,az,bx,bz) {
    const wall=v=>!!v && !(v&DOOR);
    const step=(x0,z0,x1,z1)=>x1===x0+1?wall(this.getSquare(level,x1,z0).wallW):x1===x0-1?wall(this.getSquare(level,x0,z0).wallW):z1===z0+1?wall(this.getSquare(level,x0,z1).wallN):z1===z0-1?wall(this.getSquare(level,x0,z0).wallN):false;
    const dx=Math.sign(bx-ax),dz=Math.sign(bz-az);
    if(dx && dz) return (step(ax,az,ax+dx,az)||step(ax+dx,az,bx,bz)) && (step(ax,az,ax,az+dz)||step(ax,az+dz,bx,bz));
    return step(ax,az,bx,bz);
  }
  objectBlocked(level,sx,sz) { return !!OBJECTS.find(o=>o.k===this.getSquare(level,sx,sz).object?.k)?.blocks; }
  torchesNear(pt,n) { return [...this.loaded.values()].flatMap(g=>g.userData.lights||[]).filter(v=>v.distanceToSquared(pt)<6400).sort((a,b)=>a.distanceToSquared(pt)-b.distanceToSquared(pt)).slice(0,n); }
  blocksHouse(corners) {
    const xs=corners.map(p=>p[0]),zs=corners.map(p=>p[1]);
    const [a,b]=squareAt(Math.min(...xs),Math.min(...zs)),[c,d]=squareAt(Math.max(...xs),Math.max(...zs));
    let near=false;
    for(let j=Math.floor((b-1)/TILE);j<=Math.floor((d+1)/TILE);j++) for(let i=Math.floor((a-1)/TILE);i<=Math.floor((c+1)/TILE);i++) if(this.world.data.detail['0,'+i+','+j]) near=true;
    if(!near) return false;
    for(let sz=b;sz<=d;sz++) for(let sx=a;sx<=c;sx++) {
      if(this.getSquare(0,sx,sz).ground!==CLEAR && !this.walled(0,sx,sz)) continue;
      const x=sx*SQ-HALF,z=sz*SQ-HALF,q=[[x,z],[x+SQ,z],[x+SQ,z+SQ],[x,z+SQ]];
      let overlap=true;
      for(const poly of [corners,q]) for(let i=0;i<4;i++) {
        const p=poly[i],r=poly[(i+1)%4],ax=r[1]-p[1],az=p[0]-r[0];
        const u=corners.map(v=>v[0]*ax+v[1]*az),v=q.map(v=>v[0]*ax+v[1]*az);
        if(Math.max(...u)<Math.min(...v) || Math.max(...v)<Math.min(...u)) overlap=false;
      }
      if(overlap) return true;
    }
    return false;
  }
  edgeAt(x,z) {
    const u=(x+HALF)/SQ,v=(z+HALF)/SQ;
    return Math.abs(u-Math.round(u))<Math.abs(v-Math.round(v)) ? { axis:'wallW',sx:Math.round(u),sz:Math.floor(v) } : { axis:'wallN',sx:Math.floor(u),sz:Math.round(v) };
  }
  edgeRun(start,g,size=1) {
    const [sx,sz]=squareAt(g.x,g.z),n=start.axis==='wallN',a=n?start.sx:start.sz,b=n?sx:sz,out=[];
    for(let k=Math.min(a,b);k<=Math.max(a,b)+size-1;k++) out.push({ axis:start.axis,sx:n?k:start.sx,sz:n?start.sz:k });
    return out;
  }
  free(key) { const g=this.loaded.get(key); if(!g) return; this.scene.remove(g); g.traverse(o=>o.geometry?.dispose()); this.loaded.delete(key); }
  freeAll() { for(const key of this.loaded.keys()) this.free(key); }
  build(key) {
    const t=this.tile(key),[level,ti,tj]=key.split(',').map(Number),group=new THREE.Group(),ground=new Geo(ti*31+tj),walls=new Geo(ti*17+tj);
    const h=(x,z)=>this.base(x,z)+level*3.2;
    for(let k=0;k<COUNT;k++) {
      const sx=ti*TILE+k%TILE,sz=tj*TILE+Math.floor(k/TILE),x=sx*SQ-HALF,z=sz*SQ-HALF,col=GROUNDS[t.ground[k]-1]?.[1];
      if(col) {
        const geo=slab([[x+.025,z+.025],[x+SQ-.025,z+.025],[x+SQ-.025,z+SQ-.025],[x+.025,z+SQ-.025]],.22,.08),p=geo.attributes.position;
        for(let v=0;v<p.count;v++) { const px=p.getX(v),pz=p.getZ(v); p.setY(v,p.getY(v)+h(px,pz)+(hash(sx,sz,Math.round(px*100)+Math.round(pz*100))-.5)*.025); }
        ground.add(geo,col,null,{cj:.08}); geo.dispose();
      }
      for(const axis of ['wallN','wallW']) {
        const val=t[axis][k]; if(!val) continue;
        const n=axis==='wallN',cx=x+(n?SQ/2:0),cz=z+(n?0:SQ/2),y=Math.max(h(x,z),h(x+(n?SQ:0),z+(n?0:SQ)))+.05;
        const kind=val&15,col=kind===1?PAL.stone:kind===2?PAL.wood:PAL.bark,H=3+(hash(sx,sz,8)-.5)*.12;
        const part=(along,bottom,length,height,colour=col,thick=.22)=>walls.add(unitBox(),colour,M(cx+(n?along:0),y+bottom,cz+(n?0:along),n?0:Math.PI/2,length,height,thick),{jitter:.025,cj:.08});
        if(val&(DOOR|WINDOW)) {
          part(-.62,0,.26,H); part(.62,0,.26,H); part(0,2.3,.99,H-2.3);
          if(val&WINDOW) { part(0,0,.99,1.15); part(0,1.15,.06,1.15,PAL.iron,.26); }
          else { part(-.46,0,.08,2.3,PAL.woodDark,.3); part(.46,0,.08,2.3,PAL.woodDark,.3); }
        } else if(kind===3) { for(let a=-.6;a<.75;a+=.3) part(a,0,.25,H+(hash(sx,sz,Math.round(a*10))-.5)*.25); }
        else { part(0,0,SQ,H); if(kind===2) { part(0,.15,SQ,.12,PAL.woodDark,.27); part(0,2.6,SQ,.14,PAL.woodDark,.27); } }
      }
    }
    // One solid, one flame and one halo mesh, including ground and walls.
    const b=new Builder(ti*31+tj); b.g=ground;
    for(let i=0;i<walls.p.length;i++) ground.p.push(walls.p[i]);
    for(let i=0;i<walls.c.length;i++) ground.c.push(walls.c[i]);
    for(let i=0;i<walls.ink.length;i++)ground.ink.push(walls.ink[i]);
    for(let i=0;i<walls.motionBase.length;i++)ground.motionBase.push(walls.motionBase[i]);
    ground.hasMotion ||= walls.hasMotion;
    for(const o of t.objects) {
      if(!OBJECTS.some(v=>v.k===o.k)) continue;
      const sx=ti*TILE+o.i,sz=tj*TILE+o.j,[cx,cz]=squareCenter(sx,sz),x=cx+(o.ox||0),z=cz+(o.oz||0),g=t.ground[o.j*TILE+o.i],part=new Builder(b.seed+o.i*31+o.j);
      buildObject(part,o.k,M(x,h(x,z)+(g>1 && g<CLEAR ? .24 : .02),z,(o.rot||0)*Math.PI/2,o.s||1));
      const item=part.geometry(!['torch','wall-torch'].includes(o.k)),space=this.world.spaceId||null;item.userData.propRef={type:'detail',id:o.id||`detail:${space||'surface'}:${level}:${sx},${sz}`,kind:o.k,sx,sz,level,space};group.add(item);b.lights.push(...part.lights);
    }
    const meshes=b.geometry(); while(meshes.children.length) group.add(meshes.children[0]);
    group.userData.lights=b.lights;
    this.scene.add(group); this.loaded.set(key,group);
  }
  update(camera,level=0) {
    let built=false,pending=false;
    const distance=key=>{
      const [l,i,j]=key.split(',').map(Number),x=i*TILE*SQ-HALF,z=j*TILE*SQ-HALF;
      if(l!==level) return Infinity;
      const dx=Math.max(x-camera.position.x,0,camera.position.x-x-TILE*SQ),dz=Math.max(z-camera.position.z,0,camera.position.z-z-TILE*SQ),flat=Math.hypot(dx,dz);
      if(flat>700) return flat;
      return Math.hypot(flat,camera.position.y-this.world.latticeHeight(x+30,z+30)-l*3.2);
    };
    for(const key of this.loaded.keys()) if(!this.world.data.detail[key] || distance(key)>700) this.free(key);
    for(const key of Object.keys(this.world.data.detail)) if(!this.loaded.has(key) && distance(key)<500) { if(!built) { this.build(key); built=true; } else pending=true; }
    this.pending=pending; return pending;
  }
}
