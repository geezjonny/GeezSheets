// Rivers and roads: ribbons along the painted polylines. They never get thinner than ~1.5 px on
// screen and lift a little with camera distance, so they read from the top of the world too.
import * as THREE from 'three';
import {motionUniforms} from './motion-shader.js';
import { PAL, MAT, Geo, box, ico } from './style.js';
import { LINE_W, CHUNK, HALF, NCH, LEVELS } from './world.js';

// Each chunk's shown terrain level, so a line sits on the ground as drawn (coarse far away), not above it.
export const uLod = { value: new Float32Array(NCH * NCH).fill(LEVELS.length - 1) };
const FINE = LEVELS.length - 1;

const uPx = { value: .001 };
const M4 = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

function ribbonMaterial(col, lift, lod = false) {
  const m = new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  m.onBeforeCompile = s => {
    s.uniforms.uPx = uPx; if (lod) s.uniforms.uLod = uLod;
    s.vertexShader = 'attribute float aSide; attribute vec2 aPerp; attribute float aW; uniform float uPx;\n' + (lod ? `attribute vec4 aHc; uniform vec4 uLod[${NCH * NCH / 4}];\n` : '') + s.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);${lod ? `
      ivec2 ch = clamp(ivec2(floor((position.xz + ${HALF.toFixed(1)}) / ${CHUNK.toFixed(1)})), ivec2(0), ivec2(${NCH - 1}));
      int ck = ch.y * ${NCH} + ch.x; int lv = int(uLod[ck / 4][ck % 4] + .5);
      if (lv < ${FINE}) transformed.y = lv == 0 ? aHc.x : lv == 1 ? aHc.y : lv == 2 ? aHc.z : aHc.w;` : ''}
      float cd = distance(cameraPosition, (modelMatrix * vec4(position, 1.0)).xyz);
      transformed.xz += aPerp * aSide * max(aW, cd * uPx);
      transformed.y += cd * ${lift.toFixed(4)};`);
  };
  if(col===PAL.river){
    const ribbonHook=m.onBeforeCompile;m.onBeforeCompile=s=>{
      ribbonHook(s);motionUniforms(s);
      s.vertexShader='varying vec3 vRiverWorld;\n'+s.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvRiverWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
      s.fragmentShader='varying vec3 vRiverWorld;uniform float uAtlasTime,uAtlasMotion;\n'+s.fragmentShader.replace('#include <opaque_fragment>',`float flow=sin(dot(vRiverWorld.xz,vec2(.7,.25))-uAtlasTime*uAtlasMotion*.4);outgoingLight*=1.+flow*.018;\n#include <opaque_fragment>`);
    };
  }
  m.customProgramCacheKey = () => `ribbon-${lod}-${lift}-${col===PAL.river?'water':'land'}`;
  return m;
}

// Shared ribbon materials (towns draw their own streets with the road one).
export const LINE_MATS = { river: ribbonMaterial(PAL.river, .0035), road: ribbonMaterial(PAL.road, .003), sel: ribbonMaterial(PAL.ping, .004), draft: ribbonMaterial(PAL.ping, .004) };
// The same, following the terrain's level of detail (painted lines; towns' streets stay near and fine).
const LOD_MATS = { river: ribbonMaterial(PAL.river, .0035, true), road: ribbonMaterial(PAL.road, .003, true), sel: ribbonMaterial(PAL.ping, .004, true), draft: ribbonMaterial(PAL.ping, .004, true) };

// Ground on a coarser terrain lattice (spacing S), split the way the chunk mesh splits each square.
function gridHeight(world, x, z, S) {
  const u = (x + HALF) / S, v = (z + HALF) / S, i = Math.floor(u), j = Math.floor(v), fx = u - i, fz = v - j, X = i * S - HALF, Z = j * S - HALF, h = (a, b) => world.height(a, b);
  if (fx + fz < 1) { const a = h(X, Z), b = h(X + S, Z), c = h(X, Z + S); return a + (b - a) * fx + (c - a) * fz; }
  const b = h(X + S, Z), c = h(X, Z + S), d = h(X + S, Z + S); return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

export function setPixelScale(camera, height) { uPx.value = 1.3 * 2 * Math.tan(camera.fov * Math.PI / 360) / height; }

// Polyline -> ribbon geometry. pts in world metres; heightFn gives the ground.
// With world, also the ground on each coarser terrain level (aHc), for the LOD materials.
export function ribbon(lines, halfW, heightFn, yOff, skip = null, world = null) {
  const P = [], S = [], R = [], W = [], idx = [], HC = [];
  let base = 0;
  const strip = run => {
    for (let k = 0; k < run.length; k++) {
      const p = run[Math.max(0, k - 1)], q = run[Math.min(run.length - 1, k + 1)];
      let dx = q[0] - p[0], dz = q[1] - p[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const [x, z] = run[k], y = heightFn(x, z) + yOff;
      const hc = world ? LEVELS.slice(0, 4).map(n => gridHeight(world, x, z, CHUNK / n) + yOff) : null;
      for (const side of [-1, 1]) { P.push(x, y, z); S.push(side); R.push(-dz, dx); W.push(halfW); if (hc) HC.push(...hc); }
      if (k > 0) { const a = base + (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    base += run.length * 2;
  };
  for (const pts of lines) {
    if (pts.length < 2) continue;
    const dense = [];
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 12));
      for (let t = 0; t < n; t++) dense.push([ax + (bx - ax) * t / n, az + (bz - az) * t / n]);
    }
    dense.push(pts[pts.length - 1]);
    // split into runs outside places, so a ribbon stops at a battlemap's edge
    let run = [], prev = null, prevIn = false;
    const edge = (a, b) => { let lo = 0, hi = 1; const inA = skip(a[0], a[1]); for (let s = 0; s < 14; s++) { const m = (lo + hi) / 2; if (skip(a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m) === inA) lo = m; else hi = m; } const t = inA ? hi : lo; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
    for (const p of dense) {
      const inside = !!(skip && skip(p[0], p[1]));
      if (prev && inside !== prevIn) { const e = edge(prev, p); if (inside) { run.push(e); if (run.length > 1) strip(run); run = []; } else run.push(e); }
      if (!inside) run.push(p);
      prev = p; prevIn = inside;
    }
    if (run.length > 1) strip(run);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(P.map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(S, 1));
  g.setAttribute('aPerp', new THREE.Float32BufferAttribute(R, 2));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(W, 1));
  if (world) g.setAttribute('aHc', new THREE.Float32BufferAttribute(HC, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export class Lines {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.mats = LOD_MATS; this.skip = null;
    this.meshes = {}; this.selected = null;
    this.portals = new THREE.Group(); scene.add(this.portals);
    this.rebuild();
  }
  setMesh(key, geo, mat) {
    if (this.meshes[key]) { this.scene.remove(this.meshes[key]); this.meshes[key].geometry.dispose(); delete this.meshes[key]; }
    if (!geo) return;
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 1; this.scene.add(m); this.meshes[key] = m;
  }
  rebuild() {
    const w = this.world, skip = (x, z) => w.coveredBySettlement(x, z), hf = (x, z) => w.latticeHeight(x, z);
    this.setMesh('river', ribbon(w.data.rivers.map(l => l.pts), LINE_W.river / 2, hf, .5, null, w), this.mats.river);
    // A tunnelled road is drawn only where it is in the open, with a cave mouth at each end of a tunnel.
    const roads = [], portals = [];
    for (const l of w.data.roads) {
      if (l.through !== 'tunnel') { roads.push(l.pts); continue; }
      const t = w.tunnel(l.pts); roads.push(...t.runs); portals.push(...t.portals);
    }
    this.setMesh('road', ribbon(roads, LINE_W.road / 2, hf, .12, skip, w), this.mats.road);
    this.buildPortals(portals);
    this.showSelected();
  }
  buildPortals(list) {
    for (const m of this.portals.children) m.geometry.dispose();
    this.portals.clear();
    this.portalList = list;
    for (const p of list) {
      const g = new Geo(Math.round(p.x * 7 + p.z));
      // stone face round a dark opening, backed by a rock outcrop so it is always set into a slope
      // (local +z faces out of the tunnel)
      g.add(ico(1, 1), PAL.rock, new THREE.Matrix4().makeTranslation(0, .5, -9.8).multiply(new THREE.Matrix4().makeScale(11, 9.5, 9.5)), { jitter: .12, cj: .1 });
      g.add(box(3.2, 10, 1.6), PAL.stoneDark, M4(-4.6, -1.5, -.4), { jitter: .25 });
      g.add(box(3.2, 10, 1.6), PAL.stoneDark, M4(4.6, -1.5, -.4), { jitter: .25 });
      g.add(box(6.2, 3, 1.6), PAL.stone, M4(0, 5.6, -.4), { jitter: .2 });
      g.add(box(12, 1, 2.2), PAL.stoneDark, M4(0, 8.4, -.6), { jitter: .3 });
      g.add(box(5.9, 7, 1), '#0c0a09', M4(0, -1.5, 0), { cj: 0 });
      const m = g.mesh(MAT.solid); m.position.set(p.x, p.y, p.z); m.rotation.y = p.ry; m.updateMatrix();
      this.portals.add(m);
    }
  }
  showSelected() {
    const s = this.selected && this.find(this.selected);
    this.setMesh('sel', s ? ribbon(s.kind === 'road' && s.line.through === 'tunnel' ? this.world.tunnel(s.line.pts).runs : [s.line.pts], LINE_W[s.kind] / 2 + 1.5, (x, z) => this.world.height(x, z), .8, null, this.world) : null, this.mats.sel);
  }
  draft(pts, kind) { this.setMesh('draft', pts && pts.length > 1 ? ribbon([pts], LINE_W[kind] / 2, (x, z) => this.world.height(x, z), .9, null, this.world) : null, this.mats.draft); }
  find(id) { for (const kind of ['river', 'road']) { const line = this.world.data[kind + 's'].find(l => l.id === id); if (line) return { kind, line }; } return null; }
  // Nearest line of a kind to a ground point, within tol metres.
  pick(x, z, kind, tol) {
    let best = null, bd = tol;
    for (const line of this.world.data[kind + 's']) for (let k = 0; k + 1 < line.pts.length; k++) {
      const [ax, az] = line.pts[k], [bx, bz] = line.pts[k + 1], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < bd) { bd = d; best = line.id; }
    }
    return best;
  }
}
