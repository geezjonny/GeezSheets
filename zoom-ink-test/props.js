// Trees, bushes, rocks, reeds: real objects, built from code, that only exist near someone.
// Every cell owns a fixed list of prop slots (hash of the cell). A slot is drawn while
// rank < density(kind, distance). Coming closer only adds slots; nothing ever moves.
import * as THREE from 'three';
import { hash, smoothstep, clamp } from './noise.js';
import { PAL, MAT, Geo, M, cyl, cone, ico, dodeca, color } from './style.js';
import { N, CELL, HALF, LAT, T, TYPES } from './world.js';
import { squareAt, squareCenter, SQ } from './detail.js';

export const P = { PINE: 0, OAK: 1, BUSH: 2, ROCK: 3, REED: 4, DEAD: 5, STUMP: 6, DRY: 7 };
const SMALL = [false, false, true, false, true, false, true, true]; // drawn only close
const STEP = 7; // slot grid spacing (m)
const SPC = Math.ceil(CELL / STEP);

export function shapes() {
  const g = [];
  g[P.PINE] = new Geo(1)
    .add(cyl(.22, .34, 2.4, 5), PAL.bark)
    .add(cone(2.3, 4.2, 7), PAL.pine, M(0, 1.6, 0), { jitter: .25 })
    .add(cone(1.75, 3.4, 7), PAL.pine2, M(0, 3.4, 0, .4), { jitter: .2 })
    .add(cone(1.1, 2.7, 6), PAL.pine, M(0, 5.0, 0, .9), { jitter: .15 }).geometry();
  g[P.OAK] = new Geo(2)
    .add(cyl(.28, .45, 3.4, 5), PAL.bark, null, { jitter: .08 })
    .add(dodeca(2.5), PAL.leaf1, M(0, 5.1, 0), { jitter: .5 })
    .add(ico(1.9), PAL.leaf2, M(1.4, 4.3, .7), { jitter: .4 })
    .add(ico(1.7), PAL.leaf3, M(-1.3, 4.6, -.8), { jitter: .4 }).geometry();
  g[P.BUSH] = new Geo(3)
    .add(dodeca(.9), PAL.bush, M(0, .45, 0, 0, 1, .7, 1), { jitter: .2 })
    .add(ico(.6), PAL.leaf2, M(.6, .35, .2), { jitter: .15 }).geometry();
  g[P.DRY] = new Geo(4)
    .add(dodeca(.75), PAL.dryBush, M(0, .35, 0, 0, 1, .6, 1), { jitter: .2 })
    .add(ico(.45), PAL.dry, M(-.5, .25, .3), { jitter: .1 }).geometry();
  g[P.ROCK] = new Geo(5).add(dodeca(1), PAL.rock, M(0, .25, 0, 0, 1.3, .75, 1.05), { jitter: .45, cj: .1 }).geometry();
  const reed = new Geo(6);
  for (let k = 0; k < 6; k++) reed.add(cone(.05, 1.4 + hash(k, 2) * .7, 3), k % 2 ? PAL.reed : PAL.dryBush, M((hash(k, 1) - .5) * .9, 0, (hash(k, 3) - .5) * .9, 0, 1, 1, 1, (hash(k, 4) - .5) * .4, (hash(k, 5) - .5) * .4));
  g[P.REED] = reed.geometry();
  g[P.DEAD] = new Geo(7)
    .add(cyl(.12, .32, 4.6, 5), PAL.deadwood, null, { jitter: .06 })
    .add(cyl(.05, .1, 2.0, 4), PAL.deadwood, M(.1, 2.6, 0, 0, 1, 1, 1, 0, -.9))
    .add(cyl(.04, .09, 1.6, 4), PAL.deadwood, M(-.1, 3.3, .1, 1.2, 1, 1, 1, 0, .8))
    .add(cyl(.03, .07, 1.2, 4), PAL.deadwood, M(0, 3.9, -.1, 2.4, 1, 1, 1, 0, -.7)).geometry();
  g[P.STUMP] = new Geo(8).add(cyl(.38, .5, .55, 6), PAL.bark, null, { jitter: .05 }).add(cyl(.36, .36, .02, 6), PAL.woodLight, M(0, .55, 0)).geometry();
  return g;
}

// What grows on each terrain type: [cumulative probability, prop] lists. r is a fixed hash per slot.
function pick(t, r, h) {
  switch (t) {
    case T.FOREST: if (r < .80) return h > 140 || r < .3 ? P.PINE : P.OAK; if (r < .88) return P.BUSH; if (r < .91) return P.STUMP; if (r < .925) return P.ROCK; if (r < .93) return P.DEAD; return -1;
    case T.GRASS: if (r < .025) return r < .012 ? P.OAK : P.PINE; if (r < .08) return P.BUSH; if (r < .095) return P.ROCK; return -1;
    case T.HILLS: if (r < .07) return P.PINE; if (r < .13) return P.BUSH; if (r < .21) return P.ROCK; return -1;
    case T.MOUNTAIN: if (r < .05 && h < 900) return P.PINE; if (r < .17) return P.ROCK; return -1;
    case T.SNOW: return r < .06 ? P.ROCK : -1;
    case T.MARSH: if (r < .32) return P.REED; if (r < .36) return P.DEAD; if (r < .42) return P.BUSH; return -1;
    case T.DRY: if (r < .06) return P.DRY; if (r < .1) return P.ROCK; if (r < .108) return P.DEAD; return -1;
    case T.BEACH: return r < .02 ? P.ROCK : -1;
    default: return -1;
  }
}

export class Props {
  constructor(world, scene, quality) {
    this.world = world; this.scene = scene;
    this.geos = shapes();
    this.cells = new Map();   // cell index -> slots
    this.canopy = new Map();  // cell index -> Float32Array blob x,y,z,s (or null if no forest)
    this.q = quality;
    this.meshes = this.geos.map((g, k) => {
      const m = new THREE.InstancedMesh(g, MAT.solid, quality.caps[k]);
      m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(m); return m;
    });
    const blob = new Geo(9).add(ico(1, 0), PAL.forest, M(0, 0, 0), { jitter: .35, cj: .12 }).add(ico(.7, 0), PAL.leaf1, M(.5, .25, .3), { jitter: .3 }).geometry();
    this.blobs = new THREE.InstancedMesh(blob, MAT.solid, quality.blobCap);
    this.blobs.count = 0; this.blobs.frustumCulled = false; scene.add(this.blobs);
    this.last = new THREE.Vector3(1e9, 0, 0); this.lastD = 1;
    this.dirty = true; this.drawn = 0; this.building = 0;
  }

  // Occupancy is independent of camera distance, density and quality. Trees occupy
  // trunk squares; rocks and bushes occupy their fixed ground footprint.
  slotRadius(kind, scale) { return (kind === P.ROCK ? 1.5 : kind === P.BUSH || kind === P.DRY ? 1.1 : .48) * scale; }
  slotPainted(x, z, kind, scale) {
    if(this.world.ddImports?.covers(x,z))return true;
    if (!this.world.detail) return false;
    const r = this.slotRadius(kind, scale), [i0,j0] = squareAt(x-r,z-r), [i1,j1] = squareAt(x+r,z+r);
    for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++) if(this.world.detail.painted(0,i,j)) return true;
    return false;
  }
  squareBlocked(level, sx, sz) {
    if(level !== 0 || this.world.detail?.painted(level,sx,sz)) return null;
    const [x,z] = squareCenter(sx,sz), [ci,cj] = this.world.cellAt(x,z);
    if(this.world.ddImports?.covers(x,z))return null;
    let result = null;
    for(let j=Math.max(0,cj-1);j<=Math.min(N-1,cj+1);j++) for(let i=Math.max(0,ci-1);i<=Math.min(N-1,ci+1);i++) {
      const s = this.cells.get(j*N+i) || this.buildCell(i,j); s.used=performance.now();
      for(let k=0;k<s.n;k++) {
        const kind=s.kind[k]; if(kind===P.REED) continue;
        const r=this.slotRadius(kind,s.s[k]);
        if(Math.abs(x-s.x[k])>r+SQ/2 || Math.abs(z-s.z[k])>r+SQ/2) continue;
        const label=kind===P.ROCK?'rock':kind===P.BUSH || kind===P.DRY?'bush':'tree';
        if(label!=='bush') return label;
        result=label;
      }
    }
    return result;
  }

  setQuality(q) {
    this.q = q;
    this.meshes.forEach((m, k) => { if (m.instanceMatrix.count < q.caps[k]) { this.scene.remove(m); const n = new THREE.InstancedMesh(m.geometry, MAT.solid, q.caps[k]); n.count = 0; n.frustumCulled = false; n.setColorAt(0, new THREE.Color(1, 1, 1)); this.scene.add(n); this.meshes[k] = n; m.dispose(); } });
    this.dirty = true;
  }

  invalidate(x0, z0, x1, z1) {
    const pad = 120;
    const [i0, j0] = this.world.cellAt(x0 - pad, z0 - pad), [i1, j1] = this.world.cellAt(x1 + pad, z1 + pad);
    for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) { this.cells.delete(j * N + i); this.canopy.delete(j * N + i); }
    this.dirty = true;
  }
  invalidateAll() { this.cells.clear(); this.canopy.clear(); this.dirty = true; }

  // Fixed slots of one cell, sorted by rank.
  buildCell(i, j) {
    const w = this.world, cx = i * CELL - HALF, cz = j * CELL - HALF, key = j * N + i;
    const L = CELL / LAT + 1, lat = new Float32Array(L * L);
    for (let b = 0; b < L; b++) for (let a = 0; a < L; a++) lat[b * L + a] = w.height(cx + a * LAT, cz + b * LAT);
    const hAt = (x, z) => {
      const u = (x - cx) / LAT, v = (z - cz) / LAT, a = Math.min(L - 2, Math.floor(u)), b = Math.min(L - 2, Math.floor(v)), fx = u - a, fz = v - b;
      const A = lat[b * L + a], B = lat[b * L + a + 1], C = lat[(b + 1) * L + a], D = lat[(b + 1) * L + a + 1];
      return fx + fz < 1 ? A + (B - A) * fx + (C - A) * fz : D + (C - D) * (1 - fx) + (B - D) * (1 - fz);
    };
    const out = [];
    const setts = w.data.settlements.filter(p => Math.abs(p.x - cx - CELL / 2) < p.r + 260 + CELL / 2 && Math.abs(p.z - cz - CELL / 2) < p.r + 260 + CELL / 2);
    for (let b = 0; b < SPC; b++) for (let a = 0; a < SPC; a++) {
      const r = hash(key, a * 64 + b, 11);
      const x = cx + (a + .15 + hash(key, a, b * 3 + 1) * .7) * STEP, z = cz + (b + .15 + hash(key, b, a * 3 + 2) * .7) * STEP;
      if (x >= cx + CELL || z >= cz + CELL) continue;
      const t = w.typeAt(x, z);
      if (!TYPES[t].land) continue;
      const y = hAt(x, z);
      if (y < .6) continue;
      const kind = pick(t, r, y);
      if (kind < 0) continue;
      const slope = Math.hypot(hAt(x + 2, z) - y, hAt(x, z + 2) - y) / 2;
      if (slope > (kind === P.ROCK ? 1.6 : .85)) continue;
      if (w.lineDist(x, z) < (kind === P.REED ? -1 : 2)) continue;
      let inTown = false; for (const p of setts) if (w.clearOfProps(x, z, p)) { inTown = true; break; }
      if (!inTown && setts.length && w.fieldFn && w.fieldFn(x, z, setts)) inTown = true;
      if (inTown) continue;
      const s = kind === P.ROCK ? .5 + hash(key, a, b + 900) ** 2 * 2.6 : .75 + hash(key, a, b + 900) * .65;
      if (this.slotPainted(x, z, kind, s)) continue;
      out.push({ x, y: y - (kind === P.ROCK ? s * .15 : .15), z, kind, s, rot: hash(key, a, b + 77) * 6.283, rank: hash(key, a + 300, b + 500), cj: .88 + hash(key, a, b + 31) * .24 });
    }
    out.sort((p, q) => p.rank - q.rank);
    const n = out.length, slots = { n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), s: new Float32Array(n), rot: new Float32Array(n), rank: new Float32Array(n), cj: new Float32Array(n), kind: new Uint8Array(n), used: 0 };
    out.forEach((p, k) => { slots.x[k] = p.x; slots.y[k] = p.y; slots.z[k] = p.z; slots.s[k] = p.s; slots.rot[k] = p.rot; slots.rank[k] = p.rank; slots.cj[k] = p.cj; slots.kind[k] = p.kind; });
    this.cells.set(key, slots);
    return slots;
  }

  buildCanopy(i, j) {
    const w = this.world, key = j * N + i, cx = i * CELL - HALF, cz = j * CELL - HALF;
    if (w.type[key] !== T.FOREST) { this.canopy.set(key, null); return; }
    const a = new Float32Array(12);
    for (let k = 0; k < 3; k++) {
      const x = cx + (.2 + hash(key, k, 41) * .6) * CELL, z = cz + (.2 + hash(key, k, 42) * .6) * CELL;
      a[k * 4] = x; a[k * 4 + 1] = w.height(x, z); a[k * 4 + 2] = z; a[k * 4 + 3] = 34 + hash(key, k, 43) * 18;
    }
    this.canopy.set(key, a);
  }

  density(kind, d, s) {
    const R = this.range;
    if (SMALL[kind] || (kind === P.ROCK && s < 1.2)) { const Rs = R * .35; return d < Rs * .5 ? 1 : 1 - smoothstep(Rs * .5, Rs, d); }
    if (d >= R) return 0;
    const R0 = R * .2;
    return (d < R0 ? 1 : (R0 / d) ** 1.5) * (1 - smoothstep(R * .85, R, d));
  }

  // Refill instance buffers if the camera moved enough. Returns true while work is pending.
  update(camera, fogFar, budgetMs = 4) {
    const cp = camera.position;
    this.range = Math.min(this.q.range, fogFar);
    const moved = cp.distanceTo(this.last);
    if (!this.dirty && moved < this.lastD * .05) return this.building > 0;
    const t0 = performance.now();
    const w = this.world, R = this.range, CR = Math.min(this.q.canopy, fogFar);
    const [ci, cj] = w.cellAt(cp.x, cp.z);
    let pending = 0;
    // props
    const counts = this.meshes.map(() => 0), caps = this.meshes.map(m => m.instanceMatrix.count);
    const rc = Math.ceil(R / CELL) + 1;
    const groundY = this.groundY ?? 0;
    const order = [];
    for (let j = cj - rc; j <= cj + rc; j++) for (let i = ci - rc; i <= ci + rc; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const x0 = i * CELL - HALF, z0 = j * CELL - HALF;
      const dx = Math.max(x0 - cp.x, 0, cp.x - x0 - CELL), dz = Math.max(z0 - cp.z, 0, cp.z - z0 - CELL), dy = Math.max(0, cp.y - groundY - 40);
      const dmin = Math.hypot(dx, dy, dz);
      if (dmin < R) order.push([dmin, i, j]);
    }
    order.sort((a, b) => a[0] - b[0]);
    for (const [dmin, i, j] of order) {
      const key = j * N + i;
      let s = this.cells.get(key);
      if (!s) { if (performance.now() - t0 > budgetMs) { pending++; continue; } s = this.buildCell(i, j); }
      s.used = performance.now();
      const top = this.density(P.PINE, dmin, 9);
      const topSmall = this.density(P.BUSH, dmin, 1);
      const lim = Math.max(top, topSmall);
      for (let k = 0; k < s.n; k++) {
        const rank = s.rank[k]; if (rank >= lim) break;
        const kind = s.kind[k], x = s.x[k], y = s.y[k], z = s.z[k], sc = s.s[k];
        const d = Math.hypot(x - cp.x, y - cp.y, z - cp.z);
        if (rank >= this.density(kind, d, sc)) continue;
        const m = this.meshes[kind], c = counts[kind];
        if (c >= caps[kind]) continue;
        const e = m.instanceMatrix.array, o = c * 16, cs = Math.cos(s.rot[k]) * sc, sn = Math.sin(s.rot[k]) * sc;
        e[o] = cs; e[o + 1] = 0; e[o + 2] = -sn; e[o + 3] = 0; e[o + 4] = 0; e[o + 5] = sc; e[o + 6] = 0; e[o + 7] = 0;
        e[o + 8] = sn; e[o + 9] = 0; e[o + 10] = cs; e[o + 11] = 0; e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
        const ca = m.instanceColor.array, cjv = s.cj[k]; ca[c * 3] = cjv; ca[c * 3 + 1] = cjv; ca[c * 3 + 2] = cjv * (kind <= 1 ? .97 : 1);
        counts[kind] = c + 1;
      }
    }
    let drawn = 0;
    this.meshes.forEach((m, k) => { m.count = counts[k]; drawn += counts[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.instanceMatrix.clearUpdateRanges?.(); });
    this.drawn = drawn;
    // canopy beyond the tree range
    let nb = 0;
    const cr = Math.ceil(CR / CELL) + 1, be = this.blobs.instanceMatrix.array, cap = this.blobs.instanceMatrix.count;
    if (CR > R * .75) for (let j = cj - cr; j <= cj + cr; j++) for (let i = ci - cr; i <= ci + cr; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const key = j * N + i;
      if (this.world.type[key] !== T.FOREST) continue;
      const x0 = i * CELL - HALF + CELL / 2, z0 = j * CELL - HALF + CELL / 2;
      const d = Math.hypot(x0 - cp.x, cp.y - groundY, z0 - cp.z);
      if (d < R * .75 || d > CR) continue;
      let a = this.canopy.get(key);
      if (a === undefined) { if (performance.now() - t0 > budgetMs * 2) { pending++; continue; } this.buildCanopy(i, j); a = this.canopy.get(key); }
      if (!a) continue;
      for (let k = 0; k < 3 && nb < cap; k++, nb++) {
        const o = nb * 16, s = a[k * 4 + 3];
        be[o] = s; be[o + 1] = 0; be[o + 2] = 0; be[o + 3] = 0; be[o + 4] = 0; be[o + 5] = s * .3; be[o + 6] = 0; be[o + 7] = 0;
        be[o + 8] = 0; be[o + 9] = 0; be[o + 10] = s; be[o + 11] = 0; be[o + 12] = a[k * 4]; be[o + 13] = a[k * 4 + 1] + 2; be[o + 14] = a[k * 4 + 2]; be[o + 15] = 1;
      }
    }
    this.blobs.count = nb; this.blobs.instanceMatrix.needsUpdate = true;
    this.blobCount = nb;
    // forget cells far away
    if (this.cells.size > this.q.cellCap) {
      const old = [...this.cells.entries()].sort((a, b) => a[1].used - b[1].used);
      for (let k = 0; k < old.length - this.q.cellCap; k++) this.cells.delete(old[k][0]);
    }
    if (this.canopy.size > 40000) this.canopy.clear();
    this.last.copy(cp); this.lastD = Math.max(5, this.camDist ?? 100);
    this.dirty = pending > 0;
    this.building = pending;
    return pending > 0;
  }

  // Test hook: world positions of the props currently drawn in one cell.
  drawnInCell(i, j, camera) {
    const s = this.cells.get(j * N + i); if (!s) return [];
    const cp = camera.position, out = [];
    for (let k = 0; k < s.n; k++) { const d = Math.hypot(s.x[k] - cp.x, s.y[k] - cp.y, s.z[k] - cp.z); if (s.rank[k] < this.density(s.kind[k], d, s.s[k])) out.push([s.kind[k], +s.x[k].toFixed(3), +s.y[k].toFixed(3), +s.z[k].toFixed(3)]); }
    return out;
  }
}
