// One continuous world, from 40 km up down to a 1.5 m battle grid.
// The trick: almost nothing is "really there". A coarse painted mesh covers the world; a small
// high-resolution patch is regenerated under the camera from the same height function; trees exist
// only in that patch; battle maps are real places stamped flat into the terrain and only built
// when you get close.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';

// ---------- noise ----------
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = mulberry(7);
const perm = new Uint8Array(512);
{ const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
const G = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
function simplex(x, y) {
  const F = 0.3660254037844386, Gk = 0.21132486540518713;
  const s = (x + y) * F, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * Gk;
  const x0 = x - (i - t), y0 = y - (j - t), i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + Gk, y1 = y0 - j1 + Gk, x2 = x0 - 1 + 2 * Gk, y2 = y0 - 1 + 2 * Gk;
  const ii = i & 255, jj = j & 255;
  let n = 0, tt;
  tt = .5 - x0 * x0 - y0 * y0; if (tt > 0) { const g = G[perm[ii + perm[jj]] & 7]; tt *= tt; n += tt * tt * (g[0] * x0 + g[1] * y0); }
  tt = .5 - x1 * x1 - y1 * y1; if (tt > 0) { const g = G[perm[ii + i1 + perm[jj + j1]] & 7]; tt *= tt; n += tt * tt * (g[0] * x1 + g[1] * y1); }
  tt = .5 - x2 * x2 - y2 * y2; if (tt > 0) { const g = G[perm[ii + 1 + perm[jj + 1]] & 7]; tt *= tt; n += tt * tt * (g[0] * x2 + g[1] * y2); }
  return 70 * n;
}
const fbm = (x, y, o) => { let a = 1, f = 1, s = 0, n = 0; for (let k = 0; k < o; k++) { s += a * simplex(x * f, y * f); n += a; a *= .5; f *= 2.03; } return s / n; };
const ridged = (x, y, o) => { let a = 1, f = 1, s = 0, n = 0; for (let k = 0; k < o; k++) { const r = 1 - Math.abs(simplex(x * f + 31.7, y * f - 17.3)); s += a * r * r; n += a; a *= .5; f *= 2.1; } return s / n; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- the world ----------
const WORLD = 40000; // metres, centred on 0
function baseHeight(x, z) {
  const r = Math.hypot(x, z) / (WORLD / 2);
  const e = fbm(x / 9000, z / 9000, 6) * 0.85 + 0.32 - r * r * 0.95;
  if (e < 0) return e * 500;
  const m = ridged(x / 5200, z / 5200, 5) * smooth(0.12, 0.45, e) * smooth(0.25, 0.6, fbm(x / 14000 + 7, z / 14000 - 3, 3) + 0.45);
  return e * 520 + m * m * 2600 + fbm(x / 700, z / 700, 3) * 18 * smooth(0, .1, e);
}
const moisture = (x, z) => fbm(x / 6000 + 100, z / 6000 - 50, 5);

// Battle maps are real places. Each has a flat footprint stamped into the terrain.
const SITES = [
  { name: 'Brackenford', kind: 'town', x: -3200, z: 2600 },
  { name: 'The Grey Keep', kind: 'keep', x: 4300, z: -3600 },
  { name: 'Ashwater Mill', kind: 'village', x: -7600, z: -2100 },
  { name: 'Cairn Pass', kind: 'pass', x: 2600, z: 5200 },
];
const SITE_R = 70; // half-size of the flat footprint
for (const s of SITES) s.h = Math.max(6, baseHeight(s.x, s.z));
// Move a site onto land if the seed put it in the sea.
for (const s of SITES) { let k = 0; while (s.h <= 6 && k++ < 60) { s.x *= .92; s.z *= .92; s.h = baseHeight(s.x, s.z); } s.h = Math.max(6, s.h); }

// ---------- rivers (computed once on a coarse grid) ----------
const RN = 256, RC = WORLD / RN;
const rh = new Float32Array(RN * RN);
for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) rh[j * RN + i] = baseHeight((i + .5) * RC - WORLD / 2, (j + .5) * RC - WORLD / 2);
const down = new Int32Array(RN * RN).fill(-1), acc = new Float32Array(RN * RN).fill(1);
for (let j = 1; j < RN - 1; j++) for (let i = 1; i < RN - 1; i++) {
  let best = -1, bh = rh[j * RN + i];
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const k = (j + dj) * RN + i + di; if (rh[k] < bh) { bh = rh[k]; best = k; } }
  down[j * RN + i] = best;
}
const order = [...Array(RN * RN).keys()].sort((a, b) => rh[b] - rh[a]);
for (const k of order) if (down[k] >= 0 && rh[k] > 0) acc[down[k]] += acc[k] * (0.6 + 0.8 * Math.max(0, moisture((k % RN) * RC - WORLD / 2, Math.floor(k / RN) * RC - WORLD / 2) + .5));
const RIVER_ACC = 90;
const rivers = [];
{
  const isRiver = k => acc[k] > RIVER_ACC && rh[k] > 0;
  const hasUp = new Uint8Array(RN * RN);
  for (let k = 0; k < RN * RN; k++) if (isRiver(k) && down[k] >= 0) hasUp[down[k]] = 1;
  const used = new Uint8Array(RN * RN);
  for (let k = 0; k < RN * RN; k++) {
    if (!isRiver(k) || hasUp[k]) continue;
    const pts = []; let c = k, guard = 0;
    while (c >= 0 && guard++ < 2000) {
      pts.push({ x: (c % RN + .5) * RC - WORLD / 2, z: (Math.floor(c / RN) + .5) * RC - WORLD / 2, w: 5 + Math.sqrt(acc[c]) * 1.1 });
      if (used[c] || rh[c] <= 0) break;
      used[c] = 1; c = down[c];
    }
    if (pts.length > 3) rivers.push(pts);
  }
}
// Smooth the river polylines so they meander instead of following grid steps.
for (const r of rivers) for (let pass = 0; pass < 3; pass++) for (let i = 1; i < r.length - 1; i++) { r[i].x = (r[i - 1].x + r[i].x * 2 + r[i + 1].x) / 4; r[i].z = (r[i - 1].z + r[i].z * 2 + r[i + 1].z) / 4; }
// A distance-to-river grid, used to carve valleys and colour banks.
const DN = 1024, DC = WORLD / DN, rdist = new Float32Array(DN * DN).fill(1e9);
for (const r of rivers) for (let i = 0; i < r.length - 1; i++) {
  const a = r[i], b = r[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(len / (DC * .5));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const ci = Math.floor((x + WORLD / 2) / DC), cj = Math.floor((z + WORLD / 2) / DC);
    for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
      const i2 = ci + di, j2 = cj + dj; if (i2 < 0 || j2 < 0 || i2 >= DN || j2 >= DN) continue;
      const d = Math.hypot((i2 + .5) * DC - WORLD / 2 - x, (j2 + .5) * DC - WORLD / 2 - z), k = j2 * DN + i2;
      if (d < rdist[k]) rdist[k] = d;
    }
  }
}
function riverDist(x, z) {
  const fx = (x + WORLD / 2) / DC - .5, fz = (z + WORLD / 2) / DC - .5, i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= DN - 1 || j >= DN - 1) return 1e9;
  const tx = fx - i, tz = fz - j, k = j * DN + i;
  return (rdist[k] * (1 - tx) + rdist[k + 1] * tx) * (1 - tz) + (rdist[k + DN] * (1 - tx) + rdist[k + DN + 1] * tx) * tz;
}

// The one height function everything samples: base + river valleys + flat battle-map footprints.
function height(x, z) {
  let h = baseHeight(x, z);
  if (h > 0) { const d = riverDist(x, z); h -= 9 * (1 - smooth(0, 160, d)) + 3 * (1 - smooth(0, 25, d)); }
  for (const s of SITES) {
    const d = Math.max(Math.abs(x - s.x), Math.abs(z - s.z));
    if (d < SITE_R * 3) h += (s.h - h) * (1 - smooth(SITE_R * 1.05, SITE_R * 3, d));
  }
  return h;
}

// ---------- colour ----------
const C = {
  deep: new THREE.Color('#1d3c52'), shelf: new THREE.Color('#3b6a78'), sand: new THREE.Color('#b9a57a'),
  grass: new THREE.Color('#6f7d3c'), grass2: new THREE.Color('#8a8a48'), forest: new THREE.Color('#2e4a2c'),
  rock: new THREE.Color('#6e6358'), rock2: new THREE.Color('#4f463f'), snow: new THREE.Color('#eceae4'), bank: new THREE.Color('#5a6a3a'),
};
const tmp = new THREE.Color();
function colourAt(x, z, h, slope, out) {
  if (h < 0) return out.copy(C.shelf).lerp(C.deep, smooth(0, -250, h));
  const m = moisture(x, z), v = fbm(x / 900, z / 900, 2);
  out.copy(C.grass).lerp(C.grass2, smooth(-.4, .4, v));
  if (h < 12) out.lerp(C.sand, 1 - smooth(4, 12, h));
  if (m > .05 && h < 1100 && slope < .5) out.lerp(C.forest, smooth(.05, .18, m));
  const rock = Math.max(smooth(.45, .8, slope), smooth(700, 1300, h));
  if (rock > 0) out.lerp(tmp.copy(C.rock).lerp(C.rock2, smooth(-.3, .5, v)), rock);
  const snow = smooth(1500, 1850, h + v * 120) * (1 - smooth(.7, 1.1, slope));
  if (snow > 0) out.lerp(C.snow, snow);
  if (h > 0 && h < 600) { const d = riverDist(x, z); if (d < 60) out.lerp(C.bank, (1 - smooth(10, 60, d)) * .5); }
  for (const s of SITES) { const d = Math.max(Math.abs(x - s.x), Math.abs(z - s.z)); if (d < SITE_R * 1.2) out.lerp(tmp.set('#7b6f5c'), (1 - smooth(SITE_R * .9, SITE_R * 1.2, d)) * .8); }
  return out;
}
const isForest = (x, z, h, slope) => h > 12 && h < 1100 && slope < .5 && moisture(x, z) > .07 + fbm(x / 300, z / 300, 2) * .06 && riverDist(x, z) > 25;

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = false;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const sky = new THREE.Color('#8fa3b5');
scene.background = sky;
scene.fog = new THREE.FogExp2(sky, 0.00002);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 200000);
const sun = new THREE.DirectionalLight('#ffe2b8', 2.2); sun.position.set(-1, 1.2, .6).multiplyScalar(1000); scene.add(sun);
scene.add(new THREE.HemisphereLight('#c9d6e6', '#3a3226', 1.1));

const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .12;
controls.zoomToCursor = true; controls.screenSpacePanning = false;
controls.minDistance = 12; controls.maxDistance = 52000; controls.maxPolarAngle = 1.32; controls.zoomSpeed = 1.6;
camera.position.set(0, 42000, 16000); controls.target.set(0, 0, 0); controls.update();

// ---------- coarse world mesh (the "painting") ----------
const patchRect = new THREE.Vector4(0, 0, 0, 0); // x0, z0, x1, z1: where the detail patch replaces it
function terrainMaterial(clip) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  if (clip) mat.onBeforeCompile = sh => {
    sh.uniforms.uPatch = { value: patchRect };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;').replace('#include <project_vertex>', '#include <project_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\nuniform vec4 uPatch;').replace('void main() {', 'void main() {\n if (vWorldP.x > uPatch.x && vWorldP.x < uPatch.z && vWorldP.z > uPatch.y && vWorldP.z < uPatch.w) discard;');
  };
  return mat;
}
function buildGrid(cx, cz, size, n) {
  const g = new THREE.PlaneGeometry(size, size, n, n); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), step = size / n;
  const hs = new Float32Array(pos.count);
  for (let k = 0; k < pos.count; k++) { const x = pos.getX(k) + cx, z = pos.getZ(k) + cz; hs[k] = height(x, z); pos.setXYZ(k, x, Math.max(hs[k], -400), z); }
  for (let k = 0; k < pos.count; k++) {
    const i = k % (n + 1), j = Math.floor(k / (n + 1));
    const hx = hs[k + (i < n ? 1 : 0)] - hs[k - (i > 0 ? 1 : 0)], hz = hs[k + (j < n ? n + 1 : 0)] - hs[k - (j > 0 ? n + 1 : 0)];
    const slope = Math.hypot(hx, hz) / (step * ((i > 0 && i < n) ? 2 : 1));
    colourAt(pos.getX(k), pos.getZ(k), hs[k], slope, tmp); col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return { geometry: g, heights: hs };
}
const t0 = performance.now();
const world = new THREE.Mesh(buildGrid(0, 0, WORLD, 400).geometry, terrainMaterial(true));
scene.add(world);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 3, WORLD * 3).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#2a5a70', transparent: true, opacity: .82 }));
sea.position.y = 0.5; scene.add(sea);
const buildMs = performance.now() - t0;

// Rivers: ribbons laid on the carved valley floor.
{
  const pos = [], idx = [];
  for (const r of rivers) {
    const base = pos.length / 3;
    for (let i = 0; i < r.length; i++) {
      const a = r[Math.max(0, i - 1)], b = r[Math.min(r.length - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const p = r[i], w = p.w, y = Math.max(height(p.x, p.z), 0.6) + 1.2;
      pos.push(p.x - dz * w, y, p.z + dx * w, p.x + dz * w, y, p.z - dx * w);
      if (i < r.length - 1) { const q = base + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#3d7088', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide }));
  m.renderOrder = 2; scene.add(m);
}

// ---------- detail patch + trees (only under the camera) ----------
let patch = null, patchKey = '';
const treeGeo = (() => {
  const crown = new THREE.ConeGeometry(.42, 1, 7).translate(0, .62, 0), trunk = new THREE.CylinderGeometry(.06, .08, .3, 5).translate(0, .15, 0);
  const g = new THREE.BufferGeometry(), parts = [crown, trunk], pos = [], col = [], idx = []; let off = 0;
  parts.forEach((p, n) => { const c = new THREE.Color(n ? '#4a3626' : '#ffffff'); const a = p.attributes.position; for (let k = 0; k < a.count; k++) { pos.push(a.getX(k), a.getY(k), a.getZ(k)); col.push(c.r, c.g, c.b); } const ix = p.index.array; for (const v of ix) idx.push(v + off); off += a.count; });
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
})();
const MAX_TREES = 24000;
const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), MAX_TREES);
trees.count = 0; trees.frustumCulled = false; scene.add(trees);
const dummy = new THREE.Object3D(), treeCol = new THREE.Color();
function updatePatch(dist) {
  if (dist > 9000) { if (patch) { scene.remove(patch); patch.geometry.dispose(); patch = null; } patchRect.set(0, 0, 0, 0); trees.count = 0; patchKey = ''; return; }
  const size = Math.min(12000, Math.max(500, dist * 2.6)), n = 160, step = size / n;
  const cx = Math.round(controls.target.x / (size / 8)) * (size / 8), cz = Math.round(controls.target.z / (size / 8)) * (size / 8);
  const key = `${cx}|${cz}|${Math.round(Math.log2(size) * 2)}`;
  if (key === patchKey) return;
  patchKey = key;
  const built = buildGrid(cx, cz, size, n);
  if (patch) { scene.remove(patch); patch.geometry.dispose(); }
  patch = new THREE.Mesh(built.geometry, terrainMaterial(false)); scene.add(patch);
  const m = step * .5; patchRect.set(cx - size / 2 + m, cz - size / 2 + m, cx + size / 2 - m, cz + size / 2 - m);
  // Trees: a jittered grid inside the patch, only where the forest mask says so.
  trees.count = 0;
  if (dist < 3500) {
    const spacing = Math.max(9, size / 150), r2 = mulberry(Math.round(cx * 7 + cz * 13));
    for (let z = cz - size / 2; z < cz + size / 2 && trees.count < MAX_TREES; z += spacing) for (let x = cx - size / 2; x < cx + size / 2 && trees.count < MAX_TREES; x += spacing) {
      const tx = x + (r2() - .5) * spacing, tz = z + (r2() - .5) * spacing, h = height(tx, tz);
      const slope = Math.hypot(height(tx + 6, tz) - h, height(tx, tz + 6) - h) / 6;
      if (!isForest(tx, tz, h, slope)) continue;
      let nearSite = false; for (const s of SITES) if (Math.max(Math.abs(tx - s.x), Math.abs(tz - s.z)) < SITE_R * 1.3) nearSite = true;
      if (nearSite) continue;
      const s = 9 + r2() * 9; dummy.position.set(tx, h - .3, tz); dummy.rotation.y = r2() * 6.28; dummy.scale.set(s * (.7 + r2() * .3), s, s * (.7 + r2() * .3)); dummy.updateMatrix();
      trees.setMatrixAt(trees.count, dummy.matrix); trees.setColorAt(trees.count, treeCol.setHSL(.27 + r2() * .06, .35 + r2() * .15, .18 + r2() * .08)); trees.count++;
    }
    trees.instanceMatrix.needsUpdate = true; if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
  }
}

// ---------- battle maps: built only when you get close ----------
function canvasTex(draw, w = 512, h = 512, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8; return t;
}
const CELL = 1.5, CELLS = 40, MAP = CELL * CELLS; // a 40 x 40 battle grid, 60 m
const cobble = canvasTex((g, w, h) => {
  g.fillStyle = '#4a4239'; g.fillRect(0, 0, w, h); const r = mulberry(3);
  for (let k = 0; k < 900; k++) { const x = r() * w, y = r() * h, s = 6 + r() * 12; g.fillStyle = `hsl(${30 + r() * 15},${8 + r() * 10}%,${26 + r() * 16}%)`; g.beginPath(); g.ellipse(x, y, s, s * (.6 + r() * .4), r() * 3, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(40,52,30,.35)'; for (let k = 0; k < 60; k++) { g.beginPath(); g.arc(r() * w, r() * h, 4 + r() * 14, 0, 7); g.fill(); }
}, 512, 512, 6);
const gridTex = canvasTex((g, w, h) => { g.strokeStyle = 'rgba(20,16,12,.55)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); }, 64, 64, CELLS);
const shingle = canvasTex((g, w, h) => {
  g.fillStyle = '#3a332e'; g.fillRect(0, 0, w, h); const r = mulberry(9);
  for (let row = 0; row < 16; row++) for (let i = 0; i < 12; i++) { const x = i * 44 + (row % 2) * 22 + r() * 6, y = row * 32; g.fillStyle = `hsl(${25 + r() * 10},${10 + r() * 8}%,${20 + r() * 14}%)`; g.fillRect(x, y, 40, 34); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y + 28, 40, 6); }
}, 512, 512, 2);
const stone = canvasTex((g, w, h) => {
  g.fillStyle = '#5b544b'; g.fillRect(0, 0, w, h); const r = mulberry(5);
  for (let row = 0; row < 10; row++) for (let i = 0; i < 7; i++) { const x = i * 80 + (row % 2) * 40 + r() * 8, y = row * 52; g.fillStyle = `hsl(35,${6 + r() * 8}%,${30 + r() * 14}%)`; g.fillRect(x + 3, y + 3, 72 + r() * 8, 46); }
}, 512, 512, 1);
const timber = canvasTex((g, w, h) => { g.fillStyle = '#b9a789'; g.fillRect(0, 0, w, h); g.fillStyle = '#3b2a1e'; g.fillRect(0, 0, w, 26); g.fillRect(0, h - 26, w, 26); g.fillRect(0, 0, 26, h); g.fillRect(w - 26, 0, 26, h); g.fillRect(w / 2 - 13, 0, 26, h); g.save(); g.translate(0, 0); g.lineWidth = 22; g.strokeStyle = '#3b2a1e'; g.beginPath(); g.moveTo(26, h - 26); g.lineTo(w / 2, 26); g.lineTo(w - 26, h - 26); g.stroke(); g.restore(); }, 256, 256, 1);
const glowTex = canvasTex((g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,200,120,.9)'); gr.addColorStop(.3, 'rgba(255,140,50,.35)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, 128, 128, 1);

function house(group, x, z, w, d, storeys, r) {
  const wallH = 3.2 * storeys, base = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, d), new THREE.MeshLambertMaterial({ map: stone }));
  base.position.set(x, 1.6, z); group.add(base);
  if (storeys > 1) { const up = new THREE.Mesh(new THREE.BoxGeometry(w + .5, 3.2 * (storeys - 1), d + .5), new THREE.MeshLambertMaterial({ map: timber })); up.position.set(x, 3.2 + 1.6 * (storeys - 1), z); group.add(up); }
  // Steep roof with deep eaves and a slight sag.
  const rw = w + 1.4, rd = d + 1.4, rh = Math.max(rw, rd) * (.75 + r() * .2);
  const shape = new THREE.Shape([new THREE.Vector2(-rw / 2, 0), new THREE.Vector2(rw / 2, 0), new THREE.Vector2(0, rh)]);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: rd, bevelEnabled: false }).translate(0, 0, -rd / 2), new THREE.MeshLambertMaterial({ map: shingle }));
  roof.position.set(x, wallH, z); if (w > d) roof.rotation.y = Math.PI / 2; group.add(roof);
  if (r() > .4) { const ch = new THREE.Mesh(new THREE.BoxGeometry(.9, rh * .9, .9), new THREE.MeshLambertMaterial({ map: stone })); ch.position.set(x + w * .25, wallH + rh * .5, z - d * .2); group.add(ch); }
  const win = new THREE.Mesh(new THREE.PlaneGeometry(.7, .9), new THREE.MeshBasicMaterial({ color: '#ffb35a' }));
  win.position.set(x, 4.6, z + d / 2 + .27); if (storeys > 1) group.add(win);
}
function torch(group, lights, x, z) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 2.4, 6), new THREE.MeshLambertMaterial({ color: '#2b2622' })); pole.position.set(x, 1.2, z); group.add(pole);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(.22, .12, .3, 8, 1, true), new THREE.MeshLambertMaterial({ color: '#1e1b18', side: THREE.DoubleSide })); basket.position.set(x, 2.5, z); group.add(basket);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffd29a', blending: THREE.AdditiveBlending, depthWrite: false })); flame.position.set(x, 2.75, z); flame.scale.set(1.6, 2, 1); group.add(flame);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false })); pool.position.set(x, .08, z); group.add(pool);
  lights.push(new THREE.Vector3(x, 2.8, z));
}
function token(group, x, z, color, name) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.55, .07, 6, 24).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#e8dcc0' })); ring.position.y = .08; g.add(ring);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.32, .42, 1.3, 12), new THREE.MeshLambertMaterial({ color })); body.position.y = .7; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.3, 12, 8), new THREE.MeshLambertMaterial({ color })); head.position.y = 1.55; g.add(head);
  group.add(g);
}
function buildSite(s) {
  const g = new THREE.Group(); g.position.set(s.x, s.h, s.z); const r = mulberry(s.name.length * 97), lights = [];
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP + 30, MAP + 30).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: cobble })); ground.position.y = .03; g.add(ground);
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(MAP, MAP).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, depthWrite: false })); grid.position.y = .06; g.add(grid); s.grid = grid;
  const spots = s.kind === 'keep' ? [[-14, -14, 14, 14, 3]] : [[-18, -16, 9, 7, 2], [-17, 4, 8, 9, 2], [-2, -20, 10, 7, 2], [14, -12, 8, 8, 1], [16, 8, 9, 10, 2], [3, 18, 8, 7, 1], [-5, 9, 7, 6, 1]];
  for (const [x, z, w, d, st] of spots) house(g, x, z, w, d, st, r);
  if (s.kind === 'keep') { const tower = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.4, 16, 16), new THREE.MeshLambertMaterial({ map: stone })); tower.position.set(14, 8, 14); g.add(tower); const cone = new THREE.Mesh(new THREE.ConeGeometry(5.2, 8, 16), new THREE.MeshLambertMaterial({ map: shingle })); cone.position.set(14, 20, 14); g.add(cone); }
  for (const [x, z] of [[-6, -6], [7, 2], [-9, 16], [10, -22], [22, 20], [-24, -2]]) torch(g, lights, x + (r() - .5) * 2, z + (r() - .5) * 2);
  for (let k = 0; k < 14; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.35, .3, .8, 10), new THREE.MeshLambertMaterial({ color: '#5a3e28' })); b.position.set((r() - .5) * 46, .4, (r() - .5) * 46); g.add(b); }
  token(g, 1.5, 3, '#8b2323', 'Fighter'); token(g, 3, 3, '#cfc8b8', 'Cleric'); token(g, 4.5, -1.5, '#3e5a2c', 'Ghoul');
  // A few real point lights, swapped to the nearest torches; the rest are faked with glow sprites.
  s.lightSpots = lights; s.group = g; g.visible = false; scene.add(g);
}
SITES.forEach(buildSite);
const realLights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight('#ff9a48', 0, 14, 1.6); scene.add(l); return l; });

// ---------- labels ----------
const labels = SITES.map(s => {
  const el = document.createElement('div'); el.className = 'label'; el.innerHTML = `<div class="pin"></div><div class="name">${s.name}</div>`;
  el.onclick = () => flyTo(s, 70); document.body.appendChild(el); return { s, el };
});
const sitesBar = document.getElementById('sites');
const backBtn = document.createElement('button'); backBtn.textContent = 'World'; backBtn.onclick = () => flyTo({ x: 0, z: 0, h: 0 }, 42000); sitesBar.appendChild(backBtn);
for (const s of SITES) { const b = document.createElement('button'); b.textContent = s.name; b.onclick = () => flyTo(s, 70); sitesBar.appendChild(b); }

// ---------- flying ----------
let flight = null;
function flyTo(s, dist) {
  const fromT = controls.target.clone(), fromD = camera.position.distanceTo(controls.target);
  const dir = camera.position.clone().sub(controls.target).normalize();
  const want = dist > 20000 ? new THREE.Vector3(0, .93, .37) : new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(.75).setY(dist < 300 ? .9 : .8).normalize();
  flight = { t: 0, fromT, toT: new THREE.Vector3(s.x, s.h || 0, s.z), fromD, toD: dist, fromDir: dir, toDir: want };
}
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const d = camera.position.distanceTo(controls.target);
  flyTo({ x: controls.target.x, z: controls.target.z, h: controls.target.y }, d < 300 ? 1800 : d < 3000 ? 9000 : 42000);
});

// ---------- loop ----------
const LEVELS = [['Battlemap', 250], ['Area', 1800], ['Region', 9000], ['World', Infinity]];
const hudLevel = document.getElementById('level'), hudAlt = document.getElementById('alt'), hudStats = document.getElementById('stats'), ladder = [...document.querySelectorAll('#ladder span')];
let frames = 0, fps = 0, lastFps = performance.now(), lastPatch = 0;
const v = new THREE.Vector3();
function frame(now) {
  if (flight) {
    flight.t = Math.min(1, flight.t + 1 / 70); const t = flight.t < .5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
    controls.target.lerpVectors(flight.fromT, flight.toT, t);
    const d = Math.exp(Math.log(flight.fromD) + (Math.log(flight.toD) - Math.log(flight.fromD)) * t);
    camera.position.copy(controls.target).addScaledVector(v.copy(flight.fromDir).lerp(flight.toDir, t).normalize(), d);
    if (flight.t >= 1) flight = null;
  }
  controls.update();
  // Keep the target on the ground so zooming in lands on the terrain, not under it.
  const gh = Math.max(height(controls.target.x, controls.target.z), 0);
  if (!flight) controls.target.y += (gh - controls.target.y) * .2;
  const dist = camera.position.distanceTo(controls.target);
  const camGround = Math.max(height(camera.position.x, camera.position.z), 0) + 3;
  if (camera.position.y < camGround) camera.position.y = camGround;
  camera.near = Math.max(.2, dist * .01); camera.far = Math.max(4000, dist * 30 + 20000); camera.updateProjectionMatrix();
  scene.fog.density = 0.35 / (dist * 6 + 3000);
  controls.panSpeed = 1; controls.rotateSpeed = .6;
  if (now - lastPatch > 120) { updatePatch(dist); lastPatch = now; }
  // Battle maps appear when you're close; grids and real lights only at battle scale.
  for (const s of SITES) {
    const near = Math.hypot(controls.target.x - s.x, controls.target.z - s.z) < 6000 && dist < 4000;
    s.group.visible = near; s.grid.material.opacity = 1 - smooth(120, 400, dist);
  }
  const lightOn = dist < 500;
  const spots = SITES.filter(s => s.group.visible).flatMap(s => s.lightSpots.map(p => p.clone().add(s.group.position))).sort((a, b) => a.distanceTo(controls.target) - b.distanceTo(controls.target));
  realLights.forEach((l, i) => { if (lightOn && spots[i]) { l.position.copy(spots[i]); l.intensity = (14 + Math.sin(now * .013 + i * 2) * 2.5) * (1 - smooth(250, 500, dist)); } else l.intensity = 0; });
  // Dusk at battle scale: dim the sun as you come down so the torches read.
  const dusk = 1 - smooth(150, 1500, dist); sun.intensity = 2.2 - dusk * 1.5; renderer.toneMappingExposure = 1.05 - dusk * .25;
  for (const { s, el } of labels) {
    v.set(s.x, s.h + 20, s.z).project(camera);
    const show = v.z < 1 && dist > 160 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
    el.style.display = show ? '' : 'none';
    if (show) { el.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - v.y) / 2 * innerHeight) + 'px'; el.classList.toggle('small', dist > 20000); }
  }
  const lvl = LEVELS.findIndex(([, max]) => dist < max);
  hudLevel.textContent = LEVELS[lvl][0];
  ladder.forEach((el, i) => el.classList.toggle('on', i === 3 - lvl));
  const alt = camera.position.y - gh;
  hudAlt.textContent = alt > 1000 ? `${(alt / 1000).toFixed(1)} km up` : `${alt.toFixed(0)} m up` + (dist < 250 ? ` · ${(dist / CELL).toFixed(0)} squares away` : '');
  renderer.render(scene, camera);
  frames++; if (now - lastFps > 500) { fps = frames * 1000 / (now - lastFps); frames = 0; lastFps = now; }
  hudStats.textContent = `${fps.toFixed(0)} fps · ${renderer.info.render.calls} draws · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris · ${trees.count} trees · world built in ${buildMs.toFixed(0)} ms`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// Test hook for screenshots.
window.__zoom = { flyTo: (name, dist) => { const s = SITES.find(q => q.name === name) || { x: 0, z: 0, h: 0 }; flyTo(s, dist); }, busy: () => !!flight, sites: SITES.map(s => s.name), rivers: rivers.length };
