// A .dd2vtt as a blueprint: its picture is never drawn. What's in it is rebuilt in the world's own style,
// into the detail layer, at the world's scale (one map square is one 1.5 m world square):
//   walls and doors -> detail walls and doors;  lights -> torches;
//   the picture, read square by square -> 3D trees where it shows canopy, boulders where it shows rock;
//   every other square is kept clear (the world adds no trees or rocks of its own there).
// A ship floats: its squares get a wooden deck above the sea, with a hull round it, and tokens stand on it.
// world.data.blueprints: [{ id, name, src, sx, sz, w, h, rot, ship, deck }] — what was placed, to find,
// float and remove it; the result itself is ordinary detail (paintable, editable).
import * as THREE from 'three';
import { HALF, SEA, T } from './world.js';
import { SQ, DOOR, CLEAR } from './detail.js';
import { PAL } from './style.js';
import { mulberry } from './noise.js';

const WOOD_FLOOR = 5, STONE = 1, TIMBER = 2;
// grid (u, v) in the map -> grid after a quarter turn, and back
const turn = (u, v, W, H, rot) => rot ? [H - v, u] : [u, v];
const unturn = (u, v, W, H, rot) => rot ? [v, H - u] : [u, v];
// a ship's hull from above: the map's rectangle with half-round ends
const stadium = (u, v, W, H) => { const r = H / 2 - .05, cu = Math.min(Math.max(u, r + .05), W - r - .05); return Math.hypot(u - cu, v - H / 2) <= r && u >= 0 && u <= W; };

// The edges a .dd2vtt's walls and doors fall on, in the (turned) map's grid: [{ axis, u, v, door }]
export function edgesOf(J, rot = 0) {
  const W = J.resolution.map_size.x, H = J.resolution.map_size.y, o = J.resolution.map_origin, out = new Map();
  const add = (axis, u, v, door) => { const k = `${axis}:${u},${v}`; if (door || !out.has(k)) out.set(k, { axis, u, v, door }); };
  const seg = (a, b, door) => {
    const [x0, y0] = turn(a.x - o.x, a.y - o.y, W, H, rot), [x1, y1] = turn(b.x - o.x, b.y - o.y, W, H, rot);
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(L * 6)), flat = Math.abs(dx) >= Math.abs(dy);
    for (let k = 0; k <= n; k++) {
      const t = (k + .5) / (n + 1), x = x0 + dx * t, y = y0 + dy * t;
      if (flat) add('wallN', Math.floor(x), Math.round(y), door); else add('wallW', Math.round(x), Math.floor(y), door);
    }
  };
  for (const line of J.line_of_sight || []) for (let i = 0; i + 1 < line.length; i++) seg(line[i], line[i + 1], false);
  for (const p of J.portals || []) if (p.bounds?.length === 2) seg(p.bounds[0], p.bounds[1], true);
  return [...out.values()];
}

// Read the picture: each square is 'tree' (canopy), 'rock', or open. Returns a W*H array, in the map's grid.
export async function readPicture(J) {
  const W = J.resolution.map_size.x, H = J.resolution.map_size.y, img = new Image();
  img.src = `data:image/${J.image.startsWith('UklGR') ? 'webp' : 'png'};base64,${J.image}`; await img.decode();
  const cv = document.createElement('canvas'); cv.width = W * 4; cv.height = H * 4;
  const c = cv.getContext('2d', { willReadFrequently: true }); c.imageSmoothingQuality = 'high'; c.drawImage(img, 0, 0, cv.width, cv.height);
  const px = c.getImageData(0, 0, cv.width, cv.height).data, out = new Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let r = 0, g = 0, b = 0;
    for (let y = j * 4 + 1; y < j * 4 + 3; y++) for (let x = i * 4 + 1; x < i * 4 + 3; x++) { const k = (y * cv.width + x) * 4; r += px[k]; g += px[k + 1]; b += px[k + 2]; }
    r /= 4; g /= 4; b /= 4; const lum = (r + g + b) / 3, gg = Math.max(g, 1);
    out[j * W + i] = b / gg > .7 && r / gg > .9 && lum > 55 ? 'rock' : (r / gg < .86 && lum < 110) || lum < 45 ? 'tree' : null;
  }
  return out;
}
// Trees from a canopy mask: the most inside canopy square first, a tree as wide as its patch, repeat.
export function treesOf(mask, W, H) {
  const at = (i, j) => i >= 0 && j >= 0 && i < W && j < H && mask[j * W + i] === 'tree';
  const left = new Set(); for (let k = 0; k < W * H; k++) if (mask[k] === 'tree') left.add(k);
  const score = k => { const i = k % W, j = (k / W) | 0; let n = 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) if (left.has((j + b) * W + i + a) && at(i + a, j + b)) n++; return n; };
  const out = [];
  for (;;) {
    let best = -1, bs = 5; for (const k of left) { const s = score(k); if (s > bs) { bs = s; best = k; } }
    if (best < 0) break;
    const i = best % W, j = (best / W) | 0, r = Math.min(2.6, Math.max(1.1, Math.sqrt(bs / Math.PI) * 1.05));
    out.push({ i, j, r });
    for (let b = -3; b <= 3; b++) for (let a = -3; a <= 3; a++) if (Math.hypot(a, b) <= r * .95) left.delete((j + b) * W + i + a);
  }
  return out;
}
// Boulders: patches of rock squares (one at the middle of each, as big as the patch).
export function rocksOf(mask, W, H) {
  const seen = new Set(), out = [];
  for (let k = 0; k < W * H; k++) {
    if (mask[k] !== 'rock' || seen.has(k)) continue;
    const q = [k], cells = []; seen.add(k);
    while (q.length) { const c = q.pop(), i = c % W, j = (c / W) | 0; cells.push([i, j]); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const n = (j + b) * W + i + a; if (i + a >= 0 && i + a < W && j + b >= 0 && j + b < H && mask[n] === 'rock' && !seen.has(n)) { seen.add(n); q.push(n); } } }
    if (cells.length < 2) continue;
    const ci = Math.round(cells.reduce((s, c) => s + c[0], 0) / cells.length), cj = Math.round(cells.reduce((s, c) => s + c[1], 0) / cells.length);
    out.push({ i: ci, j: cj, n: cells.length });
  }
  return out;
}

export class Blueprints {
  constructor(world, scene, app) { this.world = world; this.scene = scene; this.app = app; this.meshes = new Map(); this.files = new Map(); world.blueprints = this; }
  list() { return this.world.data.blueprints ||= []; }
  dims(s) { return s.rot ? [s.h, s.w] : [s.w, s.h]; }

  // the deck under (x, z), if a ship is there
  floorAt(x, z) {
    for (const s of this.list()) {
      if (!s.ship) continue;
      const [W, H] = this.dims(s), gu = (x + HALF) / SQ - s.sx, gv = (z + HALF) / SQ - s.sz;
      if (gu < 0 || gv < 0 || gu > W || gv > H) continue;
      const [u, v] = unturn(gu, gv, s.w, s.h, s.rot);
      if (stadium(u, v, s.w, s.h)) return s.deck;
    }
    return null;
  }
  async file(src) {
    if (!this.files.has(src)) this.files.set(src, fetch(src).then(r => { if (!r.ok) throw new Error(`${src}: ${r.status}`); return r.json(); }));
    return this.files.get(src);
  }

  // Build a .dd2vtt into the world: square (sx, sz) is its top-left corner after turning.
  async add(src, { sx, sz, rot = 0, ship = false, name, wall } = {}) {
    const J = await this.file(src), w = J.resolution.map_size.x, h = J.resolution.map_size.y;
    const s = { id: 'bp_' + Date.now().toString(36), name: name || src.split('/').pop().replace(/\.\w+$/, ''), src, sx, sz, w, h, rot, ship, deck: ship ? SEA + .9 : null };
    this.list().push(s);
    const d = this.world.detail, rng = mulberry((sx * 73856093) ^ (sz * 19349663)), [W, H] = this.dims(s);
    const put = (u, v, patch) => { const [a, b] = turn(u, v, w, h, rot); d.setSquare(0, sx + a, sz + b, patch); };
    const putAt = (u, v, patch) => put(Math.min(w - 1, Math.max(0, Math.round(u))), Math.min(h - 1, Math.max(0, Math.round(v))), patch);
    // ground: a ship's deck, or kept clear (the picture says where things are)
    for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
      if (ship) { if (stadium(u + .5, v + .5, w, h)) put(u, v, { ground: WOOD_FLOOR }); }
      else put(u, v, { ground: CLEAR });
    }
    // walls and doors (turned already)
    const kind = wall || (ship ? TIMBER : STONE);
    for (const e of edgesOf(J, rot)) d.setSquare(0, sx + e.u, sz + e.v, { [e.axis]: kind | (e.door ? DOOR : 0) });
    // lights -> torches
    for (const L of J.lights || []) putAt(L.position.x - .5, L.position.y - .5, { object: { k: ship ? 'wall-torch' : 'torch', rot: 0 } });
    // the picture's trees and rocks, as 3D (not on a ship: those are cargo)
    if (!ship) {
      const mask = await readPicture(J);
      const rocks = rocksOf(mask, w, h);
      for (const t of treesOf(mask, w, h)) if (!rocks.some(r => Math.hypot(r.i - t.i, r.j - t.j) < Math.sqrt(r.n) * .8 + 1)) put(t.i, t.j, { object: { k: 'pine', rot: Math.floor(rng() * 4), s: +(t.r * 2 * SQ / 4.6 * (.9 + rng() * .25)).toFixed(2) } });
      for (const r of rocks) put(r.i, r.j, { object: { k: r.n >= 4 ? 'boulder' : 'rock', rot: Math.floor(rng() * 4), s: +(Math.max(1, Math.sqrt(r.n) * (r.n >= 4 ? 1.5 : 1.3))).toFixed(2) } });
    }
    const x0 = sx * SQ - HALF, z0 = sz * SQ - HALF;
    this.app.detailChanged?.([x0 - 4, z0 - 4, x0 + W * SQ + 4, z0 + H * SQ + 4]);
    this.app.save(); this.app.request();
    return s;
  }
  // Take a blueprint out: its whole footprint goes back to untouched ground.
  remove(id) {
    const s = this.list().find(q => q.id === id); if (!s) return;
    const [W, H] = this.dims(s), d = this.world.detail;
    for (let b = 0; b <= H; b++) for (let a = 0; a <= W; a++) d.setSquare(0, s.sx + a, s.sz + b, { ground: 0, wallN: 0, wallW: 0, object: null });
    this.world.data.blueprints = this.list().filter(q => q !== s);
    this.drop(id);
    const x0 = s.sx * SQ - HALF, z0 = s.sz * SQ - HALF; this.app.detailChanged?.([x0 - 4, z0 - 4, x0 + W * SQ + 4, z0 + H * SQ + 4]);
    this.app.save(); this.app.request();
  }

  // Ship: open sea, not a pond (deep water with room round the hull), spiralling out from (x, z). Tries both turns.
  seaSpot(x, z, w, h, maxR = 14000) {
    const ok = (sx, sz, W, H) => { for (let j = -8; j <= H + 8; j += 3) for (let i = -8; i <= W + 8; i += 3) { const px = (sx + i) * SQ - HALF, pz = (sz + j) * SQ - HALF; if (Math.abs(px) > HALF - 50 || Math.abs(pz) > HALF - 50 || this.world.height(px, pz) > SEA - 6) return false; } return true; };
    for (let r = 0; r <= maxR; r += Math.max(15, r / 60)) {
      const n = Math.max(1, Math.round(r / 12));
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        for (const rot of [0, 1]) {
          const W = rot ? h : w, H = rot ? w : h, sx = Math.round((px + HALF) / SQ - W / 2), sz = Math.round((pz + HALF) / SQ - H / 2);
          if (ok(sx, sz, W, H)) return { sx, sz, rot, x: (sx + W / 2) * SQ - HALF, z: (sz + H / 2) * SQ - HALF };
        }
      }
    }
    return null;
  }
  // A map with a road down it (along v, centred at u = roadU): the straightest stretch of one of our roads
  // through this kind of land, close to north-south or east-west (the grid is the world's), to lay it on.
  roadSpot(w, h, roadU, type = T.FOREST) {
    const L = h * SQ, best = [];
    for (const road of this.world.data.roads) {
      const P = road.pts, acc = [P[0]];
      for (let k = 1; k < P.length; k++) { const [ax, az] = P[k - 1], [bx, bz] = P[k], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 4); for (let i = 1; i <= n; i++) acc.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]); }
      const span = Math.round(L / 4);
      for (let i = 0; i + span < acc.length; i += 3) {
        const a = acc[i], b = acc[i + span], dx = b[0] - a[0], dz = b[1] - a[1], ang = Math.atan2(dx, dz), m = acc[i + (span >> 1)];
        const rot = Math.abs(Math.sin(ang)) < Math.abs(Math.cos(ang)) ? 0 : 1, off = rot ? Math.abs(Math.cos(ang)) : Math.abs(Math.sin(ang));
        let bend = 0; for (let j = i; j <= i + span; j += 2) { const p = acc[j]; bend = Math.max(bend, Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / Math.hypot(dx, dz)); }
        let wood = 0, n = 0; for (const s of [-.4, -.2, .2, .4]) for (const t of [.2, .5, .8]) { const px = a[0] + dx * t + (rot ? 0 : s * w * SQ), pz = a[1] + dz * t + (rot ? s * w * SQ : 0); n++; if (this.world.typeAt(px, pz) === type) wood++; }
        best.push({ score: off * 3 + bend / 6 - wood / n * 2, rot, m, off, bend, wood: wood / n, road: road.id });
      }
    }
    best.sort((p, q) => p.score - q.score);
    const B = best[0]; if (!B) return null;
    const [cu, cv] = turn(roadU, h / 2, w, h, B.rot);
    return { sx: Math.round((B.m[0] + HALF) / SQ - cu), sz: Math.round((B.m[1] + HALF) / SQ - cv), rot: B.rot, x: B.m[0], z: B.m[1], fit: { angleOff: +(Math.asin(B.off) * 180 / Math.PI).toFixed(1), bend: +B.bend.toFixed(1), forest: B.wood, road: B.road } };
  }

  // meshes: only a ship's hull (the rest is detail)
  drop(id) { const m = this.meshes.get(id); if (!m) return; this.scene.remove(m); m.geometry.dispose(); this.meshes.delete(id); }
  update() {
    const ids = new Set(this.list().map(s => s.id));
    for (const id of [...this.meshes.keys()]) if (!ids.has(id)) this.drop(id);
    for (const s of this.list()) if (s.ship && !this.meshes.has(s.id)) { const m = this.hull(s); this.meshes.set(s.id, m); this.scene.add(m); }
  }
  hull(s) {
    const [W, H] = this.dims(s), x0 = s.sx * SQ - HALF, z0 = s.sz * SQ - HALF, at = (u, v) => { const [gu, gv] = turn(u, v, s.w, s.h, s.rot); return [x0 + gu * SQ, z0 + gv * SQ]; };
    const r = s.h / 2 - .05, pts = [];
    for (let k = 0; k <= 16; k++) { const a = -Math.PI / 2 + k / 16 * Math.PI; pts.push([s.w - r - .05 + Math.cos(a) * r, s.h / 2 + Math.sin(a) * r]); }
    for (let k = 0; k <= 16; k++) { const a = Math.PI / 2 + k / 16 * Math.PI; pts.push([r + .05 + Math.cos(a) * r, s.h / 2 + Math.sin(a) * r]); }
    pts.push(pts[0]);
    const pos = [], idx = [], lo = SEA - 1.2, hi = s.deck + 1.1;
    pts.forEach(([u, v], k) => { const [x, z] = at(u, v); pos.push(x, lo, z, x, hi, z); if (k) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: PAL.woodDark, side: THREE.DoubleSide }));
  }
}
