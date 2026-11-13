// Moss, soot, tarnished gold and weathered parchment: a restrained dark-fantasy palette.
import * as THREE from 'three';
import { hash } from './noise.js';
import { paperShader, INK_STYLE } from './paper.js';
import { motionVertex } from './motion-shader.js';
export { INK_STYLE };

export const PAL = {
  // terrain
  deep: '#2c342d', shallow: '#5e6d60', beach: '#bba771', grass: '#73845a', forest: '#526444', hills: '#7d7056',
  mountain: '#5e6d60', snow: '#b7d0b1', marsh: '#3c5446', dry: '#a89048', rock: '#8b9885', dirt: '#7d7056',
  sea: '#3c5446', river: '#547c6a', road: '#a47c54', seabed: '#414b4c',
  // building
  woodDark: '#222413', wood: '#7d7056', woodLight: '#a47c54', plaster: '#bba771', plaster2: '#8b9885',
  stone: '#8b9885', stoneDark: '#414b4c', stoneLight: '#a3ad9a', flag1: '#7d8274', flag2: '#5e6d60',
  shingle: '#414b4c', shingle2: '#526444', thatch: '#a89048', iron: '#161713',
  void: '#161713', crystal: '#82b69c', slate: '#5a7376',
  canvas: '#7d7056', canvasDark: '#526444', hay: '#a89048',
  // growing things
  leaf1: '#526444', leaf2: '#73845a', leaf3: '#8aac64', pine: '#2c342d', pine2: '#3c5446', bark: '#504735',
  deadwood: '#7d7056', bush: '#526444', dryBush: '#7d7056', reed: '#73845a',
  // light
  flame: '#ffa63f', flameCore: '#ffe29a', ember: '#ff6224', window: '#ffb862', halo: '#ff8f40',
  // ui-ish things in the scene
  grid: '#76684c', ping: '#974b35', skin: '#d7c09a', sky: '#e1d2b0', fog: '#e4d5b3',
  tokens: ['#9e3a2e', '#3a6a9e', '#4c8538', '#a0853a', '#74399e', '#c9c1ae'],
};

export const color = c => c instanceof THREE.Color ? c : new THREE.Color(c);

// The whole material set.
export const MAT = {
  solid: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  window: new THREE.MeshLambertMaterial({ vertexColors: true, color: '#43382a', emissive: PAL.window, emissiveIntensity: 0 }),
  halo: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .09, blending: THREE.AdditiveBlending, depthWrite: false }),
};

MAT.glow.onBeforeCompile=motionVertex;MAT.glow.customProgramCacheKey=()=> 'atlas-fire-motion-v1';

// Weather on the world: snow settles on whatever faces up, rain darkens everything a little (wet).
// Set by atmosphere.js. Tokens (a clone without this hook) stay clean.
export const WX = { snow: { value: 0 }, wet: { value: 0 } };
export function wxShader(s) {
  paperShader(s);
  s.uniforms.uSnow = WX.snow; s.uniforms.uWet = WX.wet;
  s.fragmentShader = 'uniform float uSnow; uniform float uWet;\n' + s.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz); float up = smoothstep(.42, .8, abs(nW.y));
    diffuseColor.rgb *= 1.0 - .2 * uWet;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.84, .87, .9), uSnow * up * .9); }`);
}
MAT.solid.onBeforeCompile = wxShader; MAT.solid.customProgramCacheKey = () => 'ink-paper-solid-v1';

MAT.terrain=MAT.solid.clone();MAT.terrain.onBeforeCompile=s=>{wxShader(s);s.uniforms.uInkTerrain.value=1;};MAT.terrain.customProgramCacheKey=()=> 'ink-terrain-v1';

// Figures remain readable under forest canopies, like their name labels.
MAT.token = MAT.solid.clone(); MAT.token.depthTest = false; MAT.token.depthWrite = false;
// NPC figures: drawn with depth (so hair, hoods and armour sit right), plus a faint silhouette wherever
// something hides them (canopies, roofs), so they stay findable.
MAT.figure = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
MAT.figure.onBeforeCompile = paperShader; MAT.figure.customProgramCacheKey = () => 'ink-figure-v1';
MAT.figureGhost = new THREE.MeshBasicMaterial({ color: '#8f8676', depthWrite: false, depthFunc: THREE.GreaterDepth }); // drawn before the figure (renderOrder), so only what the scene hides shows

const _v = new THREE.Vector3(), _c = new THREE.Color(), _w = new THREE.Vector3(), _a = new THREE.Vector3();
const _n1 = new THREE.Vector3(), _n2 = new THREE.Vector3(), _n0 = new THREE.Vector3();
// does the face starting at vertex k point down (after the matrix)?
function _down(pos, k, m) {
  _n0.fromBufferAttribute(pos, k); _n1.fromBufferAttribute(pos, k + 1); _n2.fromBufferAttribute(pos, k + 2);
  if (m) { _n0.applyMatrix4(m); _n1.applyMatrix4(m); _n2.applyMatrix4(m); }
  _n1.sub(_n0); _n2.sub(_n0); _n1.cross(_n2); const l = _n1.length(); return l > 1e-9 && _n1.y / l < -.55;
}
function _cent(pos, k, m) { _a.set(0, 0, 0); for (let q = 0; q < 3; q++) { _w.fromBufferAttribute(pos, k + q); if (m) _w.applyMatrix4(m); _a.add(_w); } return _a.multiplyScalar(1 / 3); }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// Matrix from position, yaw and scale (plus optional pitch/roll).
export function M(x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(x, y, z);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// Stable semantic tags let tiny surface marks stay on their own materials.
// Tag 6 denotes a simplified open fire basket: solid in sun shadows, open to torchlight.
const INK_SURFACE=new Map();
for(const c of [PAL.wood,PAL.woodDark,PAL.woodLight,PAL.bark,PAL.deadwood])INK_SURFACE.set(c,1);
for(const c of [PAL.stone,PAL.stoneDark,PAL.stoneLight,PAL.flag1,PAL.flag2,PAL.road])INK_SURFACE.set(c,2);
for(const c of [PAL.leaf1,PAL.leaf2,PAL.leaf3,PAL.pine,PAL.pine2,PAL.bush,PAL.forest])INK_SURFACE.set(c,3);
INK_SURFACE.set(PAL.rock,4);INK_SURFACE.set(PAL.flame,5);INK_SURFACE.set(PAL.flameCore,5);
// Collects shapes with baked colours and merges them into one non-indexed geometry.
export class Geo {
  constructor(seed = 1) { this.p = []; this.c = []; this.ink = []; this.motionBase=[];this.hasMotion=false; this.seed = seed; this.n = 0; }
  // opts.jitter: metres of fixed vertex jitter (seams kept: offset hashes the local position)
  // opts.cj: per-face lightness jitter (0..1)
  add(g, col, m = null, opts = {}) {
    const ng = g.index ? g.toNonIndexed() : g;
    const pos = ng.attributes.position, n = pos.count;
    const surface=opts.inkSurface ?? INK_SURFACE.get(col) ?? 0;
    if(surface===3||surface===5)this.hasMotion=true;
    const base = typeof col === 'function' ? null : color(col);
    const jit = opts.jitter || 0, cj = opts.cj ?? .06, salt = this.seed * 31 + (this.n++);
    // baked soft shading: faces that look down (eaves, overhangs, canopy undersides) are darker, and
    // with opts.ao (a fraction of the shape's height) the lower part of a wall darkens towards the ground
    const ao = opts.ao || 0, aoDark = opts.aoDark ?? .86;
    let under = 1;
    for (let k = 0; k < n; k++) {
      if (k % 3 === 0) under = _down(pos, k, m) ? .85 : 1;
      _v.fromBufferAttribute(pos, k);
      const ly = _v.y;
      if (jit) {
        const qx = Math.round(_v.x * 100), qy = Math.round(_v.y * 100), qz = Math.round(_v.z * 100);
        _v.x += (hash(qx, qy, qz + salt) - .5) * jit; _v.y += (hash(qy, qz, qx + salt) - .5) * jit; _v.z += (hash(qz, qx, qy + salt) - .5) * jit;
      }
      if (m) _v.applyMatrix4(m);
      this.p.push(_v.x, _v.y, _v.z);
      this.ink.push(surface);
      this.motionBase.push(surface===5?(m?.elements[13]||0):0);
      if (k % 3 === 0) {
        if (base) _c.copy(base);
        else { const a = _cent(pos, k, m); _c.copy(color(col(a.x, a.y, a.z))); }
        const f = 1 + (hash(k / 3 | 0, salt, 7) - .5) * 2 * cj;
        _c.r *= f; _c.g *= f; _c.b *= f;
      }
      const f = under * (ao ? aoDark + (1 - aoDark) * Math.min(1, Math.max(0, ly / ao)) ** .8 : 1);
      this.c.push(_c.r * f, _c.g * f, _c.b * f);
    }
    return this;
  }
  get empty() { return this.p.length === 0; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aInkSurface',new THREE.Uint8BufferAttribute(this.ink,1));
    g.setAttribute('aInkMotionBase',new THREE.Float32BufferAttribute(this.motionBase,1));g.userData.atlasMotion=this.hasMotion;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  mesh(mat = MAT.solid) { return new THREE.Mesh(this.geometry(), mat); }
}

// ---------- shapes (all sit on y = 0 unless noted) ----------
const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
export const unitBox = () => once('box', () => box(1, 1, 1));
export const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg, 1).translate(0, h / 2, 0);
export const cone = (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg, 1).translate(0, h / 2, 0);
export const ico = (r, detail = 0) => new THREE.IcosahedronGeometry(r, detail);
export const dodeca = r => new THREE.DodecahedronGeometry(r, 0);

// Gable roof prism, ridge along x. Length L (x), span D (z), height H.
export function gable(L, D, H) {
  const x = L / 2, z = D / 2;
  const v = [
    // left slope
    -x, 0, z, x, 0, z, x, H, 0, -x, 0, z, x, H, 0, -x, H, 0,
    // right slope
    x, 0, -z, -x, 0, -z, -x, H, 0, x, 0, -z, -x, H, 0, x, H, 0,
    // gable ends
    x, 0, z, x, 0, -z, x, H, 0, -x, 0, -z, -x, 0, z, -x, H, 0,
    // underside
    -x, 0, z, -x, 0, -z, x, 0, -z, -x, 0, z, x, 0, -z, x, 0, z,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

// A flat irregular quad (slab top) from 4 corner points [x,z], at height y, thickness t.
export function slab(pts, y, t = .06) {
  // A positive XZ winding points down in Three.js. Keep slab tops facing up
  // so the geometry's underside shading and point-light shadows stay correct.
  const area=pts.reduce((sum,p,i)=>{const q=pts[(i+1)%pts.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
  if(area>0)pts=[...pts].reverse();
  const v = [];
  const [a, b, c, d] = pts;
  const top = [a, b, c, a, c, d];
  for (const p of top) v.push(p[0], y, p[1]);
  for (let k = 0; k < 4; k++) {
    const p = pts[k], q = pts[(k + 1) % 4];
    v.push(p[0], y, p[1], p[0], y - t, p[1], q[0], y - t, q[1], p[0], y, p[1], q[0], y - t, q[1], q[0], y, q[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

// A flat quad in the XY plane (for windows, canvas), facing +z.
export const quad = (w, h) => new THREE.PlaneGeometry(w, h);

// ---------- cutaway: building materials that can hide everything above the ground floor inside a battlemap ----------
export const CUT = { on: { value: 0 }, c: { value: new THREE.Vector2() }, r: { value: new THREE.Vector2(1, 0) }, h: { value: 0 } };
function cutVariant(base) {
  const m = base.clone();
  m.userData.inkCut = true;
  m.onBeforeCompile = s => {
    if (base === MAT.solid) wxShader(s);
    if (base === MAT.glow) motionVertex(s);
    Object.assign(s.uniforms, { uCutOn: CUT.on, uCutC: CUT.c, uCutR: CUT.r, uCutH: CUT.h });
    s.vertexShader = 'varying vec3 vCutW;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vCutW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = 'varying vec3 vCutW; uniform float uCutOn; uniform vec2 uCutC; uniform vec2 uCutR; uniform float uCutH;\n' + s.fragmentShader.replace('void main() {', `void main() {
  if (uCutOn > .5) { vec2 d = vCutW.xz - uCutC; vec2 l = vec2(d.x * uCutR.x - d.y * uCutR.y, d.x * uCutR.y + d.y * uCutR.x);
    if (abs(l.x) < 30.0 && abs(l.y) < 30.0 && vCutW.y > uCutH) discard; }`);
  };
  m.customProgramCacheKey = () => 'ink-cut-v1-' + base.type + (base.transparent ? 't' : '') + (base === MAT.solid ? 'wx' : '');
  return m;
}
MAT.solidCut = cutVariant(MAT.solid); MAT.glowCut = cutVariant(MAT.glow); MAT.haloCut = cutVariant(MAT.halo);
MAT.windowCut = cutVariant(MAT.window);
