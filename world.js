// The world: saved data -> fields -> height and colour -> terrain chunks with LOD.
import * as THREE from 'three';
import { fbm, ridged, simplex, smoothstep, clamp, lerp, hash } from './noise.js';
import { PAL, MAT, color } from './style.js';

export const N = 256;             // cells per side
export const CELL = 160;          // metres per cell
export const HALF = N * CELL / 2; // world spans -HALF..HALF
export const CH = 16;             // cells per chunk side
export const NCH = N / CH;        // chunks per side
export const CHUNK = CH * CELL;   // 2560 m
export const LAT = 20;            // finest terrain lattice (m); props stand on it
export const LEVELS = [8, 16, 32, 64, 128]; // segments per chunk, coarse -> fine (128 => 20 m)
export const SEA = 0;

// Terrain types. h: base height, rough: noise amplitude, mount/snow: peak weights, land: above water.
export const TYPES = [
  { name: 'Deep sea', h: -40, rough: 6, col: PAL.deep, land: false },
  { name: 'Shallows', h: -4, rough: 1.5, col: PAL.shallow, land: false },
  { name: 'Beach', h: 2.5, rough: 1, col: PAL.beach, land: true },
  { name: 'Grass', h: 9, rough: 7, col: PAL.grass, land: true },
  { name: 'Forest', h: 13, rough: 9, col: PAL.forest, land: true },
  { name: 'Hills', h: 70, rough: 45, col: PAL.hills, land: true },
  { name: 'Mountains', h: 260, rough: 60, mount: 1, col: PAL.mountain, land: true },
  { name: 'Snowy peaks', h: 520, rough: 60, mount: 1, snow: 1, col: PAL.snow, land: true },
  { name: 'Marsh', h: 1.6, rough: 1, col: PAL.marsh, land: true },
  { name: 'Dry plain', h: 18, rough: 8, col: PAL.dry, land: true },
];
export const T = { DEEP: 0, SHALLOW: 1, BEACH: 2, GRASS: 3, FOREST: 4, HILLS: 5, MOUNTAIN: 6, SNOW: 7, MARSH: 8, DRY: 9 };
const TCOL = TYPES.map(t => color(t.col));
export const LINE_W = { river: 16, road: 5 };
// How far a line reshapes mountains: rivers carve a valley, roads find a pass (metres from the line's edge).
export const VALLEY = { river: 480, road: 420 };
const GRADE = .22; // steepest climb a tunnelled road takes in the open (22%)
export const UNIT_KINDS = new Set(['keep', 'camp', 'ruin', 'tower', 'wizard', 'mine', 'cave', 'shrine']);
export const DENSE_KINDS = new Set(['city', 'town']);
export const DEFAULT_R = { city: 260, town: 150, village: 90, hamlet: 55, farm: 40, crossing: 60, keep: 110, tower: 60, wizard: 55, mine: 70, camp: 45, cave: 55, ruin: 45, shrine: 45 };

// Version 1 files had "places" (a stamped 60 m map each). Each becomes a settlement plus a battlemap at its centre.
function migrate(d) {
  d.settlements ||= []; d.battlemaps ||= []; d.factions ||= [];
  if (d.places) {
    for (const p of d.places) {
      d.settlements.push({ id: p.id, name: p.name, kind: p.kind, x: p.x, z: p.z, r: DEFAULT_R[p.kind] || 90, seed: p.seed, known: !!p.known });
      d.battlemaps.push({ id: 'bm_' + p.id, name: p.name, x: p.x, z: p.z, rot: null, known: !!p.known });
    }
    for (const t of d.tokens) if (t.place) { t.map = 'bm_' + t.place; delete t.place; }
    delete d.places;
  }
}

// ---------- encoding ----------
export function encodeBytes(u8) { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); }
export function decodeBytes(b64, n) { const s = atob(b64), u = new Uint8Array(n); for (let i = 0; i < n && i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

// Fixed domain warp, so painted borders read organic instead of as 160 m squares.
export function warpX(x, z) { return x + simplex(x / 420, z / 420) * 55; }
export function warpZ(x, z) { return z + simplex(x / 420 + 19.3, z / 420 - 7.1) * 55; }

export class World {
  constructor(data) {
    this.base = new Float32Array(N * N); this.rough = new Float32Array(N * N);
    this.mount = new Float32Array(N * N); this.snow = new Float32Array(N * N);
    this.cr = new Float32Array(N * N); this.cg = new Float32Array(N * N); this.cb = new Float32Array(N * N);
    this.segs = new Map(); // cell index -> line segments touching it
    this.load(data);
  }

  load(data) {
    this.data = data;
    data.rivers ||= []; data.roads ||= []; data.tokens ||= [];
    migrate(data);
    data.entities ||= []; data.worldRolls ||= {}; data.interiors ||= {}; data.underground ||= {version:1,maps:[],entrances:[],session:null};
    data.detail ||= {}; data.relics ||= {};   // relics: names and lore a local model gave homebrew items, by key
    this.detail?.reset();
    // Legacy turned grids become squares on the one axis-aligned world grid.
    for (const t of data.tokens) {
      if (t.sx == null || t.sz == null) {
        const m = data.battlemaps.find(m => m.id === t.map);
        const lx = ((t.i ?? 20) - 19.5) * 1.5, lz = ((t.j ?? 20) - 19.5) * 1.5;
        const c = Math.cos(m?.rot || 0), s = Math.sin(m?.rot || 0);
        t.sx = Math.floor(((m?.x || 0) + lx*c + lz*s + HALF)/1.5);
        t.sz = Math.floor(((m?.z || 0) - lx*s + lz*c + HALF)/1.5);
      }
      t.level ??= 0; t.kind ||= 'npc';
      delete t.map; delete t.i; delete t.j;
    }
    this.type = decodeBytes(data.terrain, N * N);
    this.computeFields(0, 0, N - 1, N - 1);
    this.indexLines();
    this.updateSettlements();
  }

  toJSON() {
    const strip = l => l.map(({ h, theta, ...rest }) => rest);
    return { ...this.data, version: 2, size: N, terrain: encodeBytes(this.type), settlements: strip(this.data.settlements) };
  }

  cellAt(x, z) { return [Math.floor((x + HALF) / CELL), Math.floor((z + HALF) / CELL)]; }
  typeCell(i, j) { return this.type[clamp(j, 0, N - 1) * N + clamp(i, 0, N - 1)]; }
  typeAt(x, z) { const wx = warpX(x, z), wz = warpZ(x, z); return this.typeCell(Math.floor((wx + HALF) / CELL), Math.floor((wz + HALF) / CELL)); }

  // Recompute blurred fields in a cell rectangle (inclusive), plus the margin the blur needs.
  computeFields(i0, j0, i1, j1) {
    const R = 4, ty = this.type;
    i0 = Math.max(0, i0 - R); j0 = Math.max(0, j0 - R); i1 = Math.min(N - 1, i1 + R); j1 = Math.min(N - 1, j1 + R);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      let wb = 0, b = 0, wr = 0, r = 0, m = 0, s = 0, cr = 0, cg = 0, cb = 0, wc = 0;
      for (let dj = -R; dj <= R; dj++) {
        const jj = clamp(j + dj, 0, N - 1), aj = Math.abs(dj);
        for (let di = -R; di <= R; di++) {
          const t = TYPES[ty[jj * N + clamp(i + di, 0, N - 1)]], ai = Math.abs(di);
          const w4 = (R + 1 - ai) * (R + 1 - aj);
          wr += w4; r += t.rough * w4; m += (t.mount || 0) * w4; s += (t.snow || 0) * w4;
          if (ai <= 2 && aj <= 2) { const w2 = (3 - ai) * (3 - aj); wb += w2; b += t.h * w2; }
          if (ai <= 1 && aj <= 1) { const w1 = (2 - ai) * (2 - aj), c = TCOL[ty[jj * N + clamp(i + di, 0, N - 1)]]; wc += w1; cr += c.r * w1; cg += c.g * w1; cb += c.b * w1; }
        }
      }
      const k = j * N + i;
      this.base[k] = b / wb; this.rough[k] = r / wr; this.mount[k] = m / wr; this.snow[k] = s / wr;
      this.cr[k] = cr / wc; this.cg[k] = cg / wc; this.cb[k] = cb / wc;
    }
  }

  sample(f, x, z) {
    const u = (x + HALF) / CELL - .5, v = (z + HALF) / CELL - .5;
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const i0 = clamp(i, 0, N - 1), i1 = clamp(i + 1, 0, N - 1), j0 = clamp(j, 0, N - 1), j1 = clamp(j + 1, 0, N - 1);
    return lerp(lerp(f[j0 * N + i0], f[j0 * N + i1], fu), lerp(f[j1 * N + i0], f[j1 * N + i1], fu), fv);
  }

  // Natural ground, without places.
  rawHeight(x, z) {
    const wx = warpX(x, z), wz = warpZ(x, z);
    const t = TYPES[this.typeCell(Math.floor((wx + HALF) / CELL), Math.floor((wz + HALF) / CELL))];
    let h = this.sample(this.base, wx, wz);
    const r = this.sample(this.rough, wx, wz);
    h += fbm(x / 650, z / 650, 3) * r;
    const m = this.sample(this.mount, wx, wz);
    if (m > .005) {
      const pk = ridged(x / 2400, z / 2400, 4);
      // A river through a range runs down a valley floor; a road crosses it by a saddle, not over the summit.
      const cut = (.04 + .96 * smoothstep(20, VALLEY.river, this.valleyDist(x, z, 'river'))) * (.14 + .86 * smoothstep(10, VALLEY.road, this.valleyDist(x, z, 'road')));
      h += m * (pk * pk * 1300 + fbm(x / 260, z / 260, 2) * 40) * cut;
      const s = this.sample(this.snow, wx, wz);
      if (s > .005) h += s * pk * 900 * cut;
    }
    if (t.land) h = Math.max(h, .8); else h = Math.min(h, -.8);
    if (t === TYPES[T.MARSH]) h = Math.min(h, 2.2);
    // rivers cut a shallow bed
    const rv = this.lineDist(x, z, 'river');
    if (rv < 30) h -= (1 - smoothstep(0, 30, rv)) * 3.2;
    return h;
  }

  // Ground as drawn. Towns and villages sit on the real ground; walled units (keep, camp, ruin) stand on levelled ground.
  height(x, z) {
    let h = this.rawHeight(x, z);
    for (const p of this.data.settlements) {
      if (!UNIT_KINDS.has(p.kind)) continue;
      const dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz;
      if (d2 < 14400) h = lerp(h, p.h, 1 - smoothstep(50, 120, Math.sqrt(d2)));
    }
    return h;
  }

  // Derived per settlement: centre height, and for walled units the way the gate faces (toward the first road).
  updateSettlements() {
    this.layoutVersion = (this.layoutVersion || 0) + 1;
    for (const p of this.data.settlements) {
      p.h = Math.max(1.5, this.rawHeight(p.x, p.z));
      p.theta = UNIT_KINDS.has(p.kind) ? this.roadBearing(p.x, p.z, 30) ?? hash(p.seed | 0, 5) * 6.283 : 0;
    }
  }
  // Bearing (rotation about y that turns +z toward it) of where the first road crosses a circle round a point.
  roadBearing(x, z, R) {
    for (const road of this.data.roads) for (let k = 0; k + 1 < road.pts.length; k++) {
      const [ax, az] = road.pts[k], [bx, bz] = road.pts[k + 1];
      const da = Math.hypot(ax - x, az - z), db = Math.hypot(bx - x, bz - z);
      if ((da < R) === (db < R)) continue;
      let lo = 0, hi = 1; for (let s = 0; s < 20; s++) { const m = (lo + hi) / 2, d = Math.hypot(ax + (bx - ax) * m - x, az + (bz - az) * m - z); if ((d < R) === (da < R)) lo = m; else hi = m; }
      const cx = ax + (bx - ax) * lo - x, cz = az + (bz - az) * lo - z;
      return Math.atan2(cx, cz);
    }
    return null;
  }
  // Trees and rocks keep out of: towns (and inside their walls), and fields. fieldFn is set by the town builder.
  clearOfProps(x, z, p) { const R = p.lore && p.lore.defense && p.lore.defense !== 'none' ? p.r + 14 : p.kind === 'farm' ? p.r + 20 : Math.max(46, p.r * .8); return (x - p.x) ** 2 + (z - p.z) ** 2 < R * R; }
  settlementAt(x, z) { for (const p of this.data.settlements) if ((x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r) return p; return null; }
  // Roads are drawn by the place itself here: flagstones in a town's core, tracks inside a walled unit.
  coveredBySettlement(x, z) {
    for (const p of this.data.settlements) {
      const dx = x - p.x, dz = z - p.z;
      if (DENSE_KINDS.has(p.kind) && dx * dx + dz * dz < (p.r * .6) ** 2) return true;
      if (UNIT_KINDS.has(p.kind)) { const c = Math.cos(p.theta || 0), s = Math.sin(p.theta || 0); if (Math.abs(dx * c - dz * s) < 30 && Math.abs(dx * s + dz * c) < 30) return true; }
    }
    return false;
  }

  // Ground as drawn by the finest terrain lattice (props and tokens stand on this).
  latticeHeight(x, z, cacheFn = (a, b) => this.height(a, b)) {
    const u = (x + HALF) / LAT, v = (z + HALF) / LAT, i = Math.floor(u), j = Math.floor(v), fx = u - i, fz = v - j;
    const X = i * LAT - HALF, Z = j * LAT - HALF;
    if (fx + fz < 1) { const a = cacheFn(X, Z), b = cacheFn(X + LAT, Z), c = cacheFn(X, Z + LAT); return a + (b - a) * fx + (c - a) * fz; }
    const b = cacheFn(X + LAT, Z), c = cacheFn(X, Z + LAT), d = cacheFn(X + LAT, Z + LAT);
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }

  colourAt(x, z, h, slope, out) {
    const wx = warpX(x, z), wz = warpZ(x, z);
    const ti = this.typeCell(Math.floor((wx + HALF) / CELL), Math.floor((wz + HALF) / CELL)), tc = TCOL[ti];
    out.setRGB(this.sample(this.cr, wx, wz), this.sample(this.cg, wx, wz), this.sample(this.cb, wx, wz));
    out.lerp(tc, .5);
    if (h < 0) out.lerp(TCOL[0], clamp(-h / 30, 0, .7));
    const rock = smoothstep(.55, 1.0, slope) * (TYPES[ti].land ? 1 : 0);
    if (rock > 0) out.lerp(_rock, rock * .85);
    const snowLine = 1050 + simplex(x / 900, z / 900) * 120;
    const sn = smoothstep(snowLine, snowLine + 180, h) * (1 - smoothstep(.9, 1.4, slope) * .6);
    if (sn > 0) out.lerp(_snow, sn);
    const j = 1 + (hash(Math.round(x), Math.round(z), 3) - .5) * .07;
    out.r *= j; out.g *= j; out.b *= j;
    return out;
  }

  // ---------- rivers and roads ----------
  indexLines() {
    this.segs.clear(); (this.wide ||= new Map()).clear();
    for (const kind of ['river', 'road']) for (const ln of this.data[kind + 's']) {
      const w = LINE_W[kind], pts = ln.pts;
      for (let k = 0; k + 1 < pts.length; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[k + 1], pad = w + 30;
        const [i0, j0] = this.cellAt(Math.min(ax, bx) - pad, Math.min(az, bz) - pad), [i1, j1] = this.cellAt(Math.max(ax, bx) + pad, Math.max(az, bz) + pad);
        const seg = { ax, az, bx, bz, w, kind, id: ln.id };
        for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) {
          const key = j * N + i; let l = this.segs.get(key); if (!l) this.segs.set(key, l = []); l.push(seg);
        }
        if (ln.through) continue; // 'over' and 'tunnel' leave the mountains as they are
        const wp = w + VALLEY[kind], [u0, v0] = this.cellAt(Math.min(ax, bx) - wp, Math.min(az, bz) - wp), [u1, v1] = this.cellAt(Math.max(ax, bx) + wp, Math.max(az, bz) + wp);
        for (let j = Math.max(0, v0); j <= Math.min(N - 1, v1); j++) for (let i = Math.max(0, u0); i <= Math.min(N - 1, u1); i++) {
          const key = j * N + i; let l = this.wide.get(key); if (!l) this.wide.set(key, l = []); l.push(seg);
        }
      }
    }
  }
  // Distance from (x,z) to the edge of the nearest line of that kind (negative inside). Infinity if none near.
  lineDist(x, z, kind, index = this.segs) {
    const [i, j] = this.cellAt(x, z), l = index.get(j * N + i);
    if (!l) return Infinity;
    let best = Infinity;
    for (const s of l) {
      if (kind && s.kind !== kind) continue;
      const dx = s.bx - s.ax, dz = s.bz - s.az, L = dx * dx + dz * dz || 1;
      const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / L, 0, 1);
      const d = Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) - s.w / 2;
      if (d < best) best = d;
    }
    return best;
  }
  // Does a drawn line run through mountains (so how it gets through is worth asking)?
  crossesMountains(pts) {
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 40));
      for (let s = 0; s <= n; s++) { const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n; if (this.sample(this.mount, warpX(x, z), warpZ(x, z)) > .2) return true; }
    }
    return false;
  }
  // A tunnelled road keeps to a gentle grade (GRADE rise per metre) and goes under wherever the ground
  // rises faster: returns the open stretches and a portal (cave mouth) at each end of every tunnel.
  tunnel(pts) {
    const P = [];
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 8));
      for (let s = 0; s < n; s++) P.push([ax + (bx - ax) * s / n, az + (bz - az) * s / n]);
    }
    P.push(pts[pts.length - 1]);
    const n = P.length, h = P.map(([x, z]) => this.latticeHeight(x, z)), g = h.slice(), d = [0];
    for (let k = 1; k < n; k++) d.push(d[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
    for (let k = 1; k < n; k++) g[k] = Math.min(g[k], g[k - 1] + GRADE * (d[k] - d[k - 1]));
    for (let k = n - 2; k >= 0; k--) g[k] = Math.min(g[k], g[k + 1] + GRADE * (d[k + 1] - d[k]));
    const under = h.map((v, k) => v - g[k] > 15), depth = h.map((v, k) => v - g[k]);
    // a tunnel needs a real mountain over it (40 m of rock somewhere) and is at least 40 m long
    for (let k = 0; k < n;) {
      if (!under[k]) { k++; continue; }
      let e = k; while (e + 1 < n && under[e + 1]) e++;
      if (d[e] - d[k] < 40 || Math.max(...depth.slice(k, e + 1)) < 40) for (let q = k; q <= e; q++) under[q] = false;
      k = e + 1;
    }
    // a short open gap between two tunnels is part of one tunnel (no back-to-back cave mouths)
    for (let k = 1; k < n;) {
      if (under[k] || !under[k - 1]) { k++; continue; }
      let e = k; while (e + 1 < n && !under[e + 1]) e++;
      if (e + 1 < n && d[e + 1] - d[k - 1] < 60) for (let q = k; q <= e; q++) under[q] = true;
      k = e + 1;
    }
    const runs = [], portals = []; let run = [];
    for (let k = 0; k < n; k++) {
      if (!under[k]) { run.push(P[k]); continue; }
      if (run.length) { if (run.length > 1) runs.push(run); run = []; }
      const before = k > 0 && !under[k - 1], after = k + 1 < n && !under[k + 1];
      if (before) portals.push(this.portal(P[k - 1], P[k]));
      if (after) portals.push(this.portal(P[k + 1], P[k]));
    }
    if (run.length > 1) runs.push(run);
    return { runs, portals };
  }
  // A cave mouth at the open point a, facing away from the tunnel point b.
  portal(a, b) { return { x: a[0], z: a[1], y: this.latticeHeight(a[0], a[1]), ry: Math.atan2(a[0] - b[0], a[1] - b[1]) }; }
  // Same, out to VALLEY[kind] (for shaping the land round a line).
  valleyDist(x, z, kind) { return this.wide ? this.lineDist(x, z, kind, this.wide) : Infinity; }
}
const _rock = color(PAL.rock), _snow = color(PAL.snow);

// ---------- terrain chunks ----------
const tmpC = new THREE.Color();

// Builds a chunk mesh a few rows at a time (a generator), so big chunks never stall a frame.
function* chunkBuilder(world, ci, cj, segs) {
  const n = segs, S = CHUNK / n, x0 = ci * CHUNK - HALF, z0 = cj * CHUNK - HALF, V = n + 1;
  const hs = new Float32Array(V * V);
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) hs[j * V + i] = world.height(x0 + i * S, z0 + j * S);
    if (j % 8 === 7) yield;
  }
  const nv = V * V + 4 * V;
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const k = j * V + i, h = hs[k];
      const hx = hs[j * V + Math.min(i + 1, n)] - hs[j * V + Math.max(i - 1, 0)];
      const hz = hs[Math.min(j + 1, n) * V + i] - hs[Math.max(j - 1, 0) * V + i];
      const span = S * ((i > 0 && i < n) ? 2 : 1), spanz = S * ((j > 0 && j < n) ? 2 : 1);
      const slope = Math.hypot(hx / span, hz / spanz);
      const x = x0 + i * S, z = z0 + j * S;
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      world.colourAt(x, z, h, slope, tmpC);
      col[k * 3] = tmpC.r; col[k * 3 + 1] = tmpC.g; col[k * 3 + 2] = tmpC.b;
    }
    if (j % 16 === 15) yield;
  }
  // skirts: copies of the edge vertices pushed down, hiding cracks between detail levels
  const drop = S * .6 + 12;
  const edges = [[], [], [], []];
  for (let t = 0; t < V; t++) { edges[0].push(t); edges[1].push(n * V + t); edges[2].push(t * V); edges[3].push(t * V + n); }
  let w = V * V;
  const skirtIdx = edges.map(e => e.map(k => { pos.set([pos[k * 3], pos[k * 3 + 1] - drop, pos[k * 3 + 2]], w * 3); col.set([col[k * 3] * .8, col[k * 3 + 1] * .8, col[k * 3 + 2] * .8], w * 3); return w++; }));
  const idx = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
    idx.push(a, c, b, b, c, d); // diagonal b-c: matches World.latticeHeight
  }
  edges.forEach((e, ei) => { const s = skirtIdx[ei]; for (let t = 0; t < n; t++) idx.push(e[t], s[t], e[t + 1], e[t + 1], s[t], s[t + 1]); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  let lo = Infinity, hi = -Infinity; for (let k = 0; k < V * V; k++) { lo = Math.min(lo, hs[k]); hi = Math.max(hi, hs[k]); }
  return { geometry: g, lo, hi };
}

export class Terrain {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.chunks = [];
    for (let cj = 0; cj < NCH; cj++) for (let ci = 0; ci < NCH; ci++) this.chunks.push({ ci, cj, meshes: new Map(), shown: -1, want: 0, job: null, used: 0, lo: 0, hi: 100, dist: 0 });
    this.frustum = new THREE.Frustum(); this.pm = new THREE.Matrix4(); this.box = new THREE.Box3();
    this.quality = { k: .035, cap: 70 };
    this.frame = 0;
    for (const c of this.chunks) this.buildNow(c, 0), this.show(c, 0);
  }

  buildNow(c, level) { const gen = chunkBuilder(this.world, c.ci, c.cj, LEVELS[level]); let r; do r = gen.next(); while (!r.done); this.install(c, level, r.value); }

  install(c, level, res) {
    const old = c.meshes.get(level);
    if (old) { this.group.remove(old); old.geometry.dispose(); }
    const m = new THREE.Mesh(res.geometry, MAT.terrain);
    m.matrixAutoUpdate = false; m.visible = false; m.userData = { chunk: c, level };
    this.group.add(m); c.meshes.set(level, m);
    if (level === 0) { c.lo = res.lo; c.hi = res.hi; }
    if (c.shown === level) m.visible = true;
  }

  show(c, level) {
    if (c.shown === level) return;
    const prev = c.meshes.get(c.shown); if (prev) prev.visible = false;
    c.shown = level; c.meshes.get(level).visible = true;
  }

  // Paint or a place changed this rectangle (world metres): throw away cached detail and rebuild what's shown.
  invalidate(x0, z0, x1, z1) {
    const pad = 6 * CELL;
    for (const c of this.chunks) {
      const cx0 = c.ci * CHUNK - HALF, cz0 = c.cj * CHUNK - HALF;
      if (cx0 > x1 + pad || cx0 + CHUNK < x0 - pad || cz0 > z1 + pad || cz0 + CHUNK < z0 - pad) continue;
      const keep = c.shown;
      for (const [lv, m] of c.meshes) if (lv !== keep && lv !== 0) { this.group.remove(m); m.geometry.dispose(); c.meshes.delete(lv); }
      if (keep !== 0) this.buildNow(c, 0);
      if (LEVELS[keep] <= 32 || keep === 0) this.buildNow(c, keep);
      else { c.stale = true; c.job = null; }
    }
  }

  // A zoom can leave a suspended job for an obsolete/invisible LOD. Only work
  // that update() will actually schedule should keep the idle hook waiting.
  get pending() { return this.chunks.some(c => c.stale || (c.want !== c.shown && c.visibleNow)); }

  update(camera, budgetMs = 5) {
    this.frame++;
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.pm);
    const cp = camera.position;
    const todo = [];
    for (const c of this.chunks) {
      const x0 = c.ci * CHUNK - HALF, z0 = c.cj * CHUNK - HALF;
      this.box.min.set(x0, c.lo - 30, z0); this.box.max.set(x0 + CHUNK, c.hi + 1500 * 0 + 30, z0 + CHUNK);
      c.visibleNow = this.frustum.intersectsBox(this.box);
      const dx = Math.max(x0 - cp.x, 0, cp.x - x0 - CHUNK), dz = Math.max(z0 - cp.z, 0, cp.z - z0 - CHUNK);
      const dy = Math.max(c.lo - cp.y, 0, cp.y - c.hi);
      const d = Math.hypot(dx, dy, dz); c.dist = d;
      const lim = Math.max(d, 1) * this.quality.k;
      let want = LEVELS.length - 1;
      for (let lv = 0; lv < LEVELS.length; lv++) if (CHUNK / LEVELS[lv] <= lim) { want = lv; break; }
      // hysteresis: only drop to a coarser level once it is clearly fine enough
      if (c.shown > want && CHUNK / LEVELS[want] > lim * .7) want = c.shown;
      c.want = want;
      if (c.stale) { todo.push(c); continue; }
      if (want === c.shown) continue;
      if (c.meshes.has(want)) { this.show(c, want); c.meshes.get(want).userData.used = this.frame; continue; }
      if (want < c.shown) { // coarser: use the best cached one at or below
        let lv = want; while (!c.meshes.has(lv)) lv--; this.show(c, lv); if (lv === want) continue;
      }
      if (c.visibleNow) todo.push(c);
    }
    // nearest first
    todo.sort((a, b) => a.dist - b.dist);
    const t0 = performance.now();
    for (const c of todo) {
      if (performance.now() - t0 > budgetMs) break;
      const level = c.stale ? c.shown : c.want;
      if (!c.job || c.job.level !== level) c.job = { level, gen: chunkBuilder(this.world, c.ci, c.cj, LEVELS[level]) };
      let r;
      while (performance.now() - t0 < budgetMs) { r = c.job.gen.next(); if (r.done) break; }
      if (r && r.done) { this.install(c, level, r.value); c.job = null; c.stale = false; if (c.want === level || c.shown === level) this.show(c, level); c.meshes.get(level).userData.used = this.frame; }
    }
    for (const c of this.chunks) { const m = c.meshes.get(c.shown); if (m) m.userData.used = this.frame; }
    this.evict();
    return todo.length;
  }

  evict() {
    const extra = [];
    for (const c of this.chunks) for (const [lv, m] of c.meshes) if (lv !== 0 && lv !== c.shown) extra.push(m);
    let fine = 0; for (const c of this.chunks) fine += c.meshes.size - 1;
    if (fine <= this.quality.cap) return;
    extra.sort((a, b) => (a.userData.used || 0) - (b.userData.used || 0));
    for (const m of extra) { if (fine-- <= this.quality.cap) break; const c = m.userData.chunk; this.group.remove(m); m.geometry.dispose(); c.meshes.delete(m.userData.level); }
  }

  stats() { let n = 0; for (const c of this.chunks) n += c.meshes.size; return n; }
}
