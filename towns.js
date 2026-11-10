// Settlements as part of the world. Roads join terraced urban blocks or rural street frontages.
// Two detail levels, both pure functions of the saved data: far (a block and a roof per house)
// and near (the full house). Walled units (keep, camp, ruin) stand at the centre.
import * as THREE from 'three';
import { doorOffset } from './interior-layout.js';
import { mulberry, hash, clamp } from './noise.js';
import { PAL, M } from './style.js';
import { Builder, UNITS, roadEntries } from './places.js';
import { captureProps } from './prop-capture.js';
import { ribbon } from './lines.js';
import { LINE_W, UNIT_KINDS, LAT, HALF } from './world.js';
import { featuresOf } from './lore.js';

const WINDOW_PANE = new THREE.PlaneGeometry(.7, 1);

// Layout budgets are independent of LOD: approaching only adds surface detail.
export const PROFILE = {
  city: { max: 950, density: .98, gap: .7, size: 5.6, depth: 11, width: 6, square: 16, paved: true, lanes: true, arms: 3, ring: true, storeys: .88 },
  town: { max: 340, density: .94, gap: 1.2, size: 5.2, depth: 10, width: 5, square: 14, paved: true, lanes: true, arms: 2, storeys: .8 },
  village: { max: 220, density: .62, gap: 4, size: 4.8, depth: 8.5, width: 4, square: 10, arms: 1, storeys: .25 },
  hamlet: { max: 32, density: .45, gap: 7, size: 4.6, depth: 7.5, width: 3, square: 6, arms: 1, storeys: .1 },
  farm: { max: 2, density: 1, gap: 10, size: 6, depth: 14, width: 3, square: 5, arms: 1, storeys: 0 },
  crossing: { max: 60, density: .6, gap: 8, size: 5.4, depth: 9, width: 5, square: 7, arms: 2, storeys: .5 },
};
const profileOf = S => PROFILE[S.kind] || { max: S.kind === 'keep' ? 25 : 0, density: .4, gap: 5, size: 5, square: 0, storeys: .2 };

const CORE = .6;          // inner part of a town (flagstones, dense houses), as a fraction of r
const NEAR = 1100, NEAR_FREE = 1500, FAR = 9000, FAR_FREE = 11000;
const urban = S => S.kind === 'city' || (S.kind === 'town' && S.r >= 120);
// One shared parcel frame for streets and terraces; independent of camera and LOD.
const parcelFrame = S => ({ step: 38, yaw: hash(S.seed, 17, 3) * .6 - .3 });
function parcelPoint(S, u, v) {
  const { yaw } = parcelFrame(S), c = Math.cos(yaw), s = Math.sin(yaw);
  return [S.x + u * c + v * s, S.z - u * s + v * c];
}
const builtRadius = (S, houses) => houses.reduce((r, h) => h.suburb ? r : Math.max(r, ...h.corners.map(([x, z]) => Math.hypot(x - S.x, z - S.z))), 0);

// ---------- geometry helpers ----------
function dense(pts, step) {
  const out = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let t = 0; t < n; t++) out.push([ax + (bx - ax) * t / n, az + (bz - az) * t / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1);
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}
function lineDist(x, z, pts) { let d = Infinity; for (let k = 0; k + 1 < pts.length; k++) d = Math.min(d, segDist(x, z, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1])); return d; }
// Corners of a rectangle centred at (x,z), length L along its own x, depth D, turned by yaw.
function corners(x, z, yaw, L, D) {
  const c = Math.cos(yaw), s = Math.sin(yaw), out = [];
  for (const [u, v] of [[-L / 2, -D / 2], [L / 2, -D / 2], [L / 2, D / 2], [-L / 2, D / 2]]) out.push([x + u * c + v * s, z - u * s + v * c]);
  return out;
}
function rectsOverlap(a, b) { // separating axis test on two convex quads
  for (const poly of [a, b]) for (let k = 0; k < 4; k++) {
    const [x1, z1] = poly[k], [x2, z2] = poly[(k + 1) % 4], nx = z2 - z1, nz = x1 - x2;
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const [x, z] of a) { const p = x * nx + z * nz; amin = Math.min(amin, p); amax = Math.max(amax, p); }
    for (const [x, z] of b) { const p = x * nx + z * nz; bmin = Math.min(bmin, p); bmax = Math.max(bmax, p); }
    if (amax < bmin || bmax < amin) return false;
  }
  return true;
}
function inRect(x, z, cx, cz, yaw, L, D, pad = 0) {
  const dx = x - cx, dz = z - cz, c = Math.cos(yaw), s = Math.sin(yaw);
  return Math.abs(dx * c - dz * s) < L / 2 + pad && Math.abs(dx * s + dz * c) < D / 2 + pad;
}

// ---------- layout: streets, then houses along them ----------
// Streets of a settlement: the real roads inside it, extra streets where too few roads arrive, and lanes.
export function streetsOf(world, S) {
  const R = S.r + 20, rng = mulberry((S.seed | 0) * 7 + 3), out = [];
  for (const road of world.data.roads) {
    let run = null;
    for (const p of dense(road.pts, 6)) {
      if (Math.hypot(p[0] - S.x, p[1] - S.z) < R) (run ||= []).push(p);
      else if (run) { if (run.length > 1) out.push({ pts: run, w: LINE_W.road, real: true }); run = null; }
    }
    if (run && run.length > 1) out.push({ pts: run, w: LINE_W.road, real: true });
  }
  const P = PROFILE[S.kind];
  if (!P) return out;
  // arms: directions in which streets leave the settlement
  const arms = [];
  for (const st of out) for (const p of [st.pts[0], st.pts[st.pts.length - 1]]) if (Math.hypot(p[0] - S.x, p[1] - S.z) > S.r * .85) arms.push(Math.atan2(p[0] - S.x, p[1] - S.z));
  const street = (ang, len, through = false) => {
    const dx = Math.sin(ang), dz = Math.cos(ang), nx = dz, nz = -dx, bend = (rng() - .5) * 12;
    const a = through ? -len : 0, pts = [];
    for (const t of [a, (a + len) / 2, len]) pts.push([S.x + dx * t + nx * (t === (a + len) / 2 ? bend : 0), S.z + dz * t + nz * (t === (a + len) / 2 ? bend : 0)]);
    out.push({ pts: dense(pts, 6), w: P.width, real: false });
  };
  if (arms.length === 0) { const a = rng() * Math.PI; street(a, R, true); if (P.arms > 1) street(a + Math.PI / 2 + (rng() - .5) * .5, R, true); }
  else if (arms.length === 1) { street(arms[0] + Math.PI + (rng() - .5) * .4, R); if (P.arms > 1) street(arms[0] + Math.PI / 2 + (rng() - .5) * .3, R, true); }
  else if (arms.length === 2 && P.arms > 1) street(arms[0] + Math.PI / 2, R, true);
  if (P.ring || urban(S)) {
    const pts = Array.from({ length: 65 }, (_, k) => { const a = k / 64 * Math.PI * 2, r = S.r * (.67 + .025 * Math.sin(a * 5 + S.seed)); return [S.x + Math.sin(a) * r, S.z + Math.cos(a) * r]; });
    out.push({ pts: dense(pts, 6), w: P.width, real: false, ring: true });
  }
  if (urban(S)) {
    // Continuous back lanes cross the radial and ring streets. Each enclosed parcel
    // has four terrace fronts around a small courtyard, rather than a grass wedge.
    const { step } = parcelFrame(S), limit = S.r - 11;
    for (let u = -Math.ceil(limit / step) * step; u < limit; u += step) {
      if (Math.abs(u) >= limit) continue;
      const extent = Math.sqrt(limit * limit - u * u);
      for (const swap of [false, true]) {
        const pts = dense([-extent, extent].map(v => parcelPoint(S, swap ? v : u, swap ? u : v)), 6);
        out.push({ pts, w: 2.6, real: false, lane: true });
      }
    }
  } else if (P.lanes) { // lanes off the streets in the inner part of town
    const main = out.slice();
    for (const st of main) {
      let side = rng() < .5 ? -1 : 1;
      for (let k = 6; k + 1 < st.pts.length; k += 7 + Math.floor(rng() * 3)) {
        const [x, z] = st.pts[k], dc = Math.hypot(x - S.x, z - S.z);
        if (dc < 20 || dc > S.r * .78) continue;
        const [px, pz] = st.pts[k - 1], [qx, qz] = st.pts[k + 1], tx = qx - px, tz = qz - pz, l = Math.hypot(tx, tz) || 1;
        const ang = Math.atan2(-tz / l * side, tx / l * side) + (rng() - .5) * .5, len = 18 + rng() * 16;
        const end = [x + Math.sin(ang) * len, z + Math.cos(ang) * len];
        if (Math.hypot(end[0] - S.x, end[1] - S.z) > S.r) continue;
        if (main.some(o => o !== st && lineDist(end[0], end[1], o.pts) < 12)) continue;
        out.push({ pts: dense([[x, z], end], 6), w: 3, real: false, lane: true });
        side = -side;
      }
    }
  }
  return out;
}

// Houses along the streets: both sides, facing the street, never on a street, never overlapping.
export function housesOf(world, S, streets) {
  if (urban(S)) return urbanHouses(world, S, streets);
  const P = profileOf(S), rng = mulberry((S.seed | 0) * 13 + 1), houses = [], F = featuresOf(S);
  const roles = S.kind === 'farm' ? ['farmhouse', 'barn'] : [F.inn || S.kind === 'crossing' ? 'inn' : null, F.temple ? 'temple' : null, F.smithy ? 'smithy' : null].filter(Boolean);
  const plazaR = P.square;
  const keepOut = UNIT_KINDS.has(S.kind) ? 46 : 0;
  if (S.kind === 'camp' || S.kind === 'ruin') return houses;
  const houseCap = S.lore?.pop ? Math.min(P.max, Math.max(3, Math.ceil(S.lore.pop / 5))) : P.max;
  streets.forEach((st, si) => {
    const pts = st.pts, cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const total = cum[cum.length - 1];
    const at = s => { let k = 1; while (k < pts.length - 1 && cum[k] < s) k++; const t = (s - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1); const [ax, az] = pts[k - 1], [bx, bz] = pts[k]; const l = Math.hypot(bx - ax, bz - az) || 1; return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / l, tz: (bz - az) / l }; };
    for (const side of [-1, 1]) {
      let s = 2 + rng() * 3;
      while (s < total - 3 && houses.length < houseCap) {
        const role = roles[houses.length], extra = role === 'temple' ? 5 : role === 'inn' ? 2 : 0;
        // homes: narrow to the street and deep behind (cottages ~5 x 9 m, longhouses on farms); now and then a one-room hut
        const hut = !role && P.depth && rng() < .1;
        // and once in a while a house far too big for its street (a hook: whose is it?)
        const odd = !role && !hut && P.depth && rng() < .04, ow = odd ? 1.8 + rng() * .6 : 1, od = odd ? 1.4 + rng() * .4 : 1;
        const L = hut ? 4.2 + rng() * .8 : (P.size + rng() * 1.4 + extra) * ow, D = hut ? 4.5 + rng() : (P.depth || P.size) * (.85 + rng() * .3) * od + extra;
        const p = at(s + L / 2);
        const nx = -p.tz * side, nz = p.tx * side, off = st.w / 2 + (P.paved ? 1.1 : 3 + rng() * 2) + D / 2;
        const cx = p.x + nx * off, cz = p.z + nz * off, dc = Math.hypot(cx - S.x, cz - S.z);
        const keepChance = P.density * (dc < S.r * CORE ? 1 : 1 - (dc / S.r - CORE) * 1.3);
        const yaw = Math.atan2(-nx, -nz); // the house's +z (its door) faces the street
        let ok = dc + Math.max(L, D) * .72 < S.r && dc > Math.max(plazaR + D / 2, keepOut) && rng() < keepChance;
        const cs = ok ? corners(cx, cz, yaw, L, D) : null;
        if (ok) for (const o of streets) { for (const [x, z] of [...cs, [cx, cz]]) if (lineDist(x, z, o.pts) < o.w / 2 + .6) { ok = false; break; } if (!ok) break; }
        if (ok) for (const h of houses) if (Math.hypot(h.x - cx, h.z - cz) < 14 && rectsOverlap(h.corners, corners(cx, cz, yaw, L + .6, D + .6))) { ok = false; break; }
        let lo = Infinity, hi = -Infinity;
        if (ok) for (const [x, z] of cs) { const y = world.latticeHeight(x, z); lo = Math.min(lo, y); hi = Math.max(hi, y); }
        if (ok && (lo < .6 || hi - lo > 3.5)) ok = false;
        if (ok) {
          const r = hash(S.seed | 0, houses.length, 9);
          houses.push({ x: cx, z: cz, yaw, L, D, role, odd: odd || undefined, floor: hi + .05, footing: hi - lo + .35, corners: cs, street: si, side,
            opts: { storeys: (r < P.storeys ? 2 : 1) + (odd ? 1 : 0), thatch: !P.paved && role !== 'temple', pitch: 1.05, timberOnly: role === 'barn' } });
          s += L + P.gap + rng() * P.gap;
        } else s += 2.5;
      }
    }
  });
  return houses;
}

// A spatial hash: items in square cells, so overlap tests look only at neighbours (towns of
// thousands of houses would otherwise test every house against every other).
class Cells {
  constructor(size = 16) { this.s = size; this.m = new Map(); }
  key(i, j) { return i * 73856093 ^ j * 19349663; }
  addBox(item, x0, z0, x1, z1) { const s = this.s; for (let i = Math.floor(x0 / s); i <= Math.floor(x1 / s); i++) for (let j = Math.floor(z0 / s); j <= Math.floor(z1 / s); j++) { const k = this.key(i, j); let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(item); } }
  near(x, z, r, out = new Set()) { out.clear(); const s = this.s; for (let i = Math.floor((x - r) / s); i <= Math.floor((x + r) / s); i++) for (let j = Math.floor((z - r) / s); j <= Math.floor((z + r) / s); j++) { const a = this.m.get(this.key(i, j)); if (a) for (const it of a) out.add(it); } return out; }
}

function urbanHouses(world, S, streets) {
  const rng = mulberry((S.seed | 0) * 13 + 1), houses = [], P = profileOf(S), F = featuresOf(S);
  // Flatten street segments once, with bounds to keep parcel rejection cheap.
  const segments = streets.flatMap(st => st.pts.slice(1).map((p, i) => ({ a: st.pts[i], b: p, pad: st.w / 2 + .65 })));
  const segCells = new Cells(16), houseCells = new Cells(16), near = new Set();
  segments.forEach((g, i) => { g.i = i; segCells.addBox(g, Math.min(g.a[0], g.b[0]) - g.pad, Math.min(g.a[1], g.b[1]) - g.pad, Math.max(g.a[0], g.b[0]) + g.pad, Math.max(g.a[1], g.b[1]) + g.pad); });
  let maxR = 0;
  const add = (x, z, yaw, L, D, role, suburb = false) => {
    const cs = corners(x, z, yaw, L, D), radius = Math.hypot(L, D) / 2;
    if (!suburb && (cs.some(p => Math.hypot(p[0] - S.x, p[1] - S.z) > S.r - 2) || Math.hypot(x - S.x, z - S.z) < P.square + radius)) return;
    // Test the whole footprint against each road corridor, including a road that
    // cuts through the middle without touching any corner.
    // (same segments in the same order as a full scan: sorted by index)
    for (const seg of [...segCells.near(x, z, radius, near)].sort((p, q) => p.i - q.i)) {
      if (segDist(x, z, ...seg.a, ...seg.b) > radius + seg.pad) continue;
      const dx = seg.b[0] - seg.a[0], dz = seg.b[1] - seg.a[1], len = Math.hypot(dx, dz);
      if (rectsOverlap(cs, corners((seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2, Math.atan2(-dz, dx), len, seg.pad * 2))) return;
    }
    for (const h of houseCells.near(x, z, radius + maxR, near)) if (Math.hypot(x - h.x, z - h.z) < radius + Math.hypot(h.L, h.D) / 2 && rectsOverlap(cs, h.corners)) return;
    const heights = cs.map(p => world.latticeHeight(...p)), lo = Math.min(...heights), hi = Math.max(...heights);
    if (lo < .6 || hi - lo > 3.5) return;
    const h = { x, z, yaw, L, D, role, suburb, urban: true, corners: cs, floor: hi + .05, footing: hi - lo + .35,
      opts: { urban: true, storeys: suburb ? 2 : 2 + Math.floor(rng() * 3), pitch: .55, thatch: false } };
    houses.push(h); houseCells.addBox(h, x, z, x, z); maxR = Math.max(maxR, radius);
  };
  // Reserve substantial civic buildings close to the square before packing houses.
  const roles = [F.temple && 'temple', 'guildhall', S.kind === 'city' && 'palace', F.inn && 'inn', F.smithy && 'smithy'].filter(Boolean);
  for (const role of roles) {
    const L = role === 'palace' ? 24 : role === 'temple' ? 21 : 17, D = role === 'temple' ? 14 : 12;
    for (let k = 0; k < 300; k++) {
      const a = k * 2.39996, r = 37 + Math.floor(k / 24) * 5, n = houses.length;
      add(S.x + Math.sin(a) * r, S.z + Math.cos(a) * r, parcelFrame(S).yaw, L, D, role);
      if (houses.length > n) break;
    }
  }
  const { step, yaw } = parcelFrame(S), n = Math.ceil(S.r / step);
  for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) {
    // 38m blocks: two full rows and two short end rows, sharing party walls.
    // A narrow passage in one end row connects the courtyard to its back lane.
    const u = (i + .5) * step, v = (j + .5) * step, half = (step - 4) / 2, depth = 10;
    for (const side of [-1, 1]) {
      const count = 4, L = half * 2 / count;
      for (let k = 0; k < count; k++) {
        const [x, z] = parcelPoint(S, u - half + (k + .5) * L, v + side * (half - depth / 2));
        add(x, z, yaw + (side < 0 ? Math.PI : 0), L - .015, depth, undefined);
      }
      for (let k = 0; k < 2; k++) {
        const L = half - depth, passage = side === 1 && k === 0 ? 2.5 : 0;
        const [x, z] = parcelPoint(S, u + side * (half - depth / 2), v + (k - .5) * L - passage / 2);
        add(x, z, yaw + side * Math.PI / 2, L - passage - .015, depth, undefined);
      }
    }
  }
  // At most two cottages per approach, within 35m of its gate. No chord-road ribbon.
  const edge = builtRadius(S, houses) + 8, approaches = streets.filter(st => !st.lane && !st.ring);
  const used = [];
  for (const st of approaches) for (const [p, q] of [[st.pts[0], st.pts[1]], [st.pts.at(-1), st.pts.at(-2)]]) {
    const dx = p[0] - S.x, dz = p[1] - S.z, r = Math.hypot(dx, dz);
    if (r < S.r * .95 || used.some(a => Math.hypot(a[0] - p[0], a[1] - p[1]) < 25)) continue;
    const tx = p[0] - q[0], tz = p[1] - q[1], len = Math.hypot(tx, tz) || 1;
    // Only radial approaches (a tangential chord is countryside, not a suburb).
    if ((dx * tx + dz * tz) / r / len < .8) continue;
    used.push(p);
    for (const side of [-1, 1]) {
      const x = S.x + dx / r * (edge + 18) - tz / len * side * 10, z = S.z + dz / r * (edge + 18) + tx / len * side * 10;
      add(x, z, Math.atan2(tz * side, -tx * side), 7, 7, undefined, true);
    }
  }
  return houses;
}

// Land footprints exist independently of loaded geometry. Props may ask before a town is visible.
const landCache = new WeakMap();
export function fieldsOf(world, S) {
  if (!PROFILE[S.kind]) return [];
  const count = featuresOf(S).fields, key = `${world.layoutVersion}:${S.x}:${S.z}:${S.r}:${S.seed}:${count}`;
  const old = landCache.get(S); if (old?.key === key) return old.fields;
  const rng = mulberry((S.seed | 0) + 713), fields = [], streets = streetsOf(world, S);
  const paths = [...world.data.roads.map(r => r.pts), ...streets.filter(s => !s.real && !s.lane && !s.ring).map(s => {
    const extend = (p, q) => { const dx = p[0] - q[0], dz = p[1] - q[1], l = Math.hypot(dx, dz) || 1; return [p[0] + dx / l * 200, p[1] + dz / l * 200]; };
    return [extend(s.pts[0], s.pts[1]), ...s.pts, extend(s.pts.at(-1), s.pts.at(-2))];
  })];
  const candidates = paths.flatMap(pts => {
    const p = dense(pts, 36), out = [];
    for (let k = 1; k < p.length; k++) {
      const [x, z] = p[k], d = Math.hypot(x - S.x, z - S.z);
      if (d < S.r + 40 || d > S.r + 195) continue;
      const dx = x - p[k - 1][0], dz = z - p[k - 1][1], yaw = Math.atan2(-dz, dx);
      for (const side of [-1, 1]) for (const offset of [25, 67]) out.push({ x: x + Math.sin(yaw) * offset * side, z: z + Math.cos(yaw) * offset * side, yaw, side, access: [x, z] });
    }
    return out;
  });
  // Shuffle deterministically so plots occupy several approaches instead of filling just one.
  for (let k = candidates.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [candidates[k], candidates[j]] = [candidates[j], candidates[k]]; }
  for (const p of candidates) {
    if (fields.length >= count) break;
    const L = 26 + rng() * 6, D = 30 + rng() * 7, cs = corners(p.x, p.z, p.yaw, L + 5, D + 5);
    const samples = [...cs, [p.x, p.z]];
    if (samples.some(([x, z]) => Math.hypot(x - S.x, z - S.z) > S.r + 240 || world.latticeHeight(x, z) < .7 || world.lineDist(x, z, 'river') < 4 || world.lineDist(x, z, 'road') < 4)) continue;
    if (world.data.settlements.some(t => samples.some(([x, z]) => Math.hypot(x - t.x, z - t.z) < t.r + 20))) continue;
    if (fields.some(f => rectsOverlap(cs, f.corners))) continue;
    fields.push({ ...p, L, D, corners: cs, colour: Math.floor(rng() * 3) });
  }
  landCache.set(S, { key, fields });
  return fields;
}
export function inFields(world, x, z, settlements = world.data.settlements) {
  return settlements.some(S => Math.abs(x - S.x) < S.r + 250 && Math.abs(z - S.z) < S.r + 250 && fieldsOf(world, S).some(f => inRect(x, z, f.x, f.z, f.yaw, f.L, f.D, 3)));
}

// Solve every segment/circle intersection; even a road with both endpoints outside gets two gates.
export function defencesOf(world, S, streets = streetsOf(world, S), houses = null) {
  const F = featuresOf(S), radius = urban(S) ? Math.max(20, builtRadius(S, houses || housesOf(world, S, streets))) + 8 : S.r + 8, gates = [], segments = [], towers = [];
  if (!PROFILE[S.kind]) return { radius, gates, segments, towers };
  const roads = [...world.data.roads.map(r => ({ pts: r.pts, w: LINE_W.road })), ...streets.filter(s => !s.real)];
  const clearance = (x, z, pad) => roads.every(st => lineDist(x, z, st.pts) > st.w / 2 + pad);
  if (F.defense !== 'none') {
    for (const st of roads) for (let k = 1; k < st.pts.length; k++) {
      const [ax, az] = st.pts[k - 1], [bx, bz] = st.pts[k], dx = bx - ax, dz = bz - az, u = ax - S.x, v = az - S.z;
      const a = dx * dx + dz * dz, b = 2 * (u * dx + v * dz), c = u * u + v * v - radius * radius, disc = b * b - 4 * a * c;
      if (!a || disc < 0) continue;
      for (const t of [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)]) {
        if (t < 0 || t > 1) continue;
        const x = ax + dx * t, z = az + dz * t;
        if (!gates.some(g => Math.hypot(g.x - x, g.z - z) < 1)) gates.push({ x, z, yaw: Math.atan2(dx, dz), w: st.w + 8 });
      }
    }
    const n = Math.ceil(Math.PI * 2 * radius / 2.5);
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, b = (k + 1) / n * Math.PI * 2, m = (a + b) / 2;
      const x = S.x + Math.sin(m) * radius, z = S.z + Math.cos(m) * radius, length = 2 * radius * Math.sin((b - a) / 2);
      // A conservative bound includes the entire wall block and its crenels, at every crossing angle.
      if (clearance(x, z, length / 2 + 3.3)) segments.push({ x, z, yaw: m + Math.PI / 2, length, a, b });
    }
  }
  for (let k = 0; k < F.towers; k++) {
    for (let j = 0; j < 64; j++) {
      const a = (k + .35 + j / 64) / Math.max(1, F.towers) * Math.PI * 2;
      const x = S.x + Math.sin(a) * radius, z = S.z + Math.cos(a) * radius;
      if (clearance(x, z, 6) && !towers.some(t => Math.hypot(t.x - x, t.z - z) < 10)) { towers.push({ x, z, yaw: a }); break; }
    }
  }
  return { radius, gates, segments, towers };
}

// ---------- building ----------
function drape(b, world, O, pts, col, lift = .13) {
  const v = [];
  for (const p of [pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]]) v.push(p[0] - O.x, world.latticeHeight(...p) + lift, p[1] - O.z);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); b.g.add(g, col);
}
// Use the terrain's lattice and diagonal, then clip its edge triangles to the wall.
// This keeps paved courts above the terrain without burying roads or flagstones.
function urbanGround(b, world, S, radius) {
  const vertices = [], sides = 64, bound = radius * Math.cos(Math.PI / sides);
  const planes = Array.from({ length: sides }, (_, k) => [Math.sin((k + .5) * Math.PI * 2 / sides), Math.cos((k + .5) * Math.PI * 2 / sides)]);
  const x0 = Math.floor((S.x - radius + HALF) / LAT) * LAT - HALF;
  const z0 = Math.floor((S.z - radius + HALF) / LAT) * LAT - HALF;
  for (let x = x0; x < S.x + radius; x += LAT) for (let z = z0; z < S.z + radius; z += LAT) {
    if (Math.hypot(x + LAT / 2 - S.x, z + LAT / 2 - S.z) > radius + LAT) continue;
    const pts = [[x,z], [x+LAT,z], [x+LAT,z+LAT], [x,z+LAT]];
    for (const indices of [[0,1,3], [1,2,3]]) {
      let poly = indices.map(k => pts[k]);
      if (poly.some(([px,pz]) => Math.hypot(px-S.x,pz-S.z) > bound)) for (const [nx,nz] of planes) {
        const next = [];
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k], c = poly[(k+1)%poly.length];
          const da = (a[0]-S.x)*nx + (a[1]-S.z)*nz - bound, dc = (c[0]-S.x)*nx + (c[1]-S.z)*nz - bound;
          if (da <= 0) next.push(a);
          if ((da < 0) !== (dc < 0)) { const t = da/(da-dc); next.push([a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t]); }
        }
        poly = next; if (poly.length < 3) break;
      }
      for (let k = 1; k + 1 < poly.length; k++) for (const p of [poly[0],poly[k],poly[k+1]]) vertices.push(p[0]-S.x,world.latticeHeight(...p)+.025,p[1]-S.z);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); b.g.add(g,PAL.flag2);
}

function buildFields(b, world, S, fields, low) {
  const cols = [PAL.hay, PAL.dryBush, PAL.leaf3];
  const approaches = streetsOf(world, S).filter(st => !st.lane && !st.ring).flatMap(st => [st.pts[0], st.pts.at(-1)]);
  for (const f of fields) {
    const c = Math.cos(f.yaw), s = Math.sin(f.yaw), at = (u, v) => [f.x + u * c + v * s, f.z - u * s + v * c];
    const strips = low ? 6 : 12, steps = low ? 3 : 8;
    for (let i = 0; i < strips; i++) for (let j = 0; j < steps; j++) {
      const u = -f.L / 2 + j * f.L / steps, v = -f.D / 2 + i * f.D / strips;
      drape(b, world, S, [at(u, v), at(u + f.L / steps, v), at(u + f.L / steps, v + f.D / strips), at(u, v + f.D / strips)], cols[(i + f.colour) % 3]);
    }
    const cs = corners(f.x, f.z, f.yaw, f.L, f.D);
    for (let e = 0; e < 4; e++) {
      const a = cs[e], z = cs[(e + 1) % 4], n = Math.ceil(Math.hypot(a[0] - z[0], a[1] - z[1]) / (low ? 9 : 4));
      for (let j = 0; j < n; j++) {
        if (e === 0 && j === Math.floor(n / 2)) continue;
        const x = a[0] + (z[0] - a[0]) * (j + .5) / n, zz = a[1] + (z[1] - a[1]) * (j + .5) / n;
        b.box(M(x - S.x, world.latticeHeight(x, zz), zz - S.z), 0, 0, 0, 1.4, .9 + hash(j, e, S.seed) * .4, Math.hypot(a[0] - z[0], a[1] - z[1]) / n + .3, PAL.bush, { ry: Math.atan2(z[0] - a[0], z[1] - a[1]), jitter: .35 });
      }
    }
    if (!low) for (let k = 0; k < 3; k++) {
      const [x, z] = at(-f.L * .3 + k * 2, f.D * .3), y = world.latticeHeight(x, z);
      b.g.add(new THREE.ConeGeometry(.7, 1.6, 5).translate(0, .8, 0), PAL.hay, M(x - S.x, y, z - S.z), { jitter: .18 });
      b.cyl(M(x - S.x, y, z - S.z), 0, 1, 0, .35, .1, PAL.woodDark, 6);
    }
    // A narrow access track joins the plot to its approach (including generated streets).
    const near = approaches.reduce((a, p) => !a || Math.hypot(p[0] - f.access[0], p[1] - f.access[1]) < Math.hypot(a[0] - f.access[0], a[1] - f.access[1]) ? p : a, null);
    if (near && world.lineDist(...f.access, 'road') > 5) {
      const pts = dense([near, f.access], 8);
      for (let k = 1; k < pts.length; k++) { const [x, z] = pts[k], [px, pz] = pts[k - 1], l = Math.hypot(x - px, z - pz) || 1, nx = -(z - pz) / l; const nz = (x - px) / l; drape(b, world, S, [[px + nx, pz + nz], [x + nx, z + nz], [x - nx, z - nz], [px - nx, pz - nz]], PAL.road); }
    }
  }
}
function buildDefences(b, world, S, D, low) {
  const F = featuresOf(S), stone = F.defense === 'wall';
  const frame = p => M(p.x - S.x, world.latticeHeight(p.x, p.z), p.z - S.z, p.yaw);
  for (const p of D.segments) {
    const m = frame(p), h = (stone ? 5.5 : 3.7) + hash(Math.round(p.x), Math.round(p.z), S.seed) * .6;
    if (stone) {
      const bottom = Math.min(...[p.a, p.b].map(a => world.latticeHeight(S.x + Math.sin(a) * D.radius, S.z + Math.cos(a) * D.radius)));
      m.elements[13] = Math.min(m.elements[13], bottom);
      b.box(m, 0, -.6, 0, 2, h + .6, p.length + .06, PAL.stoneDark, { jitter: .14 });
      b.box(m, 0, h, 0, 2.2, .85, p.length * .48, PAL.stone, { jitter: .18 });
      if (!low) b.box(m, 1.01, h * .35, 0, .07, .6, p.length * .5, PAL.stoneLight, { jitter: .15 });
    } else {
      const n = low ? 1 : 4;
      for (let k = 0; k < n; k++) {
        const z = (k + .5) / n * p.length - p.length / 2, hh = h + hash(k, Math.round(p.x), S.seed) * .5;
        const pt = new THREE.Vector3(0, 0, z).applyMatrix4(m), gy = world.latticeHeight(pt.x + S.x, pt.z + S.z), lm = M(pt.x, gy, pt.z, p.yaw);
        b.cyl(lm, 0, -.4, 0, low ? .65 : .29, hh + .4, k % 2 ? PAL.wood : PAL.woodDark, 6, { r2: low ? p.length * .55 : .29, jitter: .07 });
        if (!low) b.g.add(new THREE.ConeGeometry(.29, .9, 6).translate(0, .45, 0), PAL.woodLight, lm.clone().multiply(M(0, hh, 0)), { jitter: .05 });
      }
    }
  }
  const tower = (p, gate = false) => {
    const m = frame(p), timber = !stone, h = gate ? 7 : 10;
    if (timber) {
      for (const x of [-1.8, 1.8]) for (const z of [-1.8, 1.8]) b.box(m, x, -.6, z, .35, h + .6, .35, PAL.woodDark, { jitter: .08 });
      b.box(m, 0, h - 1, 0, 4.6, .4, 4.6, PAL.wood);
      for (const z of [-2.1, 2.1]) { b.box(m, 0, h -.7, z, 4.5, .85, .15, PAL.woodDark); if (!low) b.box(m, 0, 1, z, .2, h - 2, .2, PAL.wood, { rz: .4 }); }
      b.g.add(new THREE.ConeGeometry(3.6, 3, 4).rotateY(Math.PI / 4).translate(0, h + 1.5, 0), PAL.shingle, m, { jitter: .12 });
    } else {
      b.box(m, 0, -1, 0, 5.2, h + 1, 5.2, PAL.stoneDark, { jitter: .17 });
      for (const x of [-2, 0, 2]) for (const z of [-2, 2]) b.box(m, x, h, z, 1.1, 1, 1.1, PAL.stone, { jitter: .15 });
      for (const x of [-2, 2]) b.box(m, x, h, 0, 1.1, 1, 1.1, PAL.stone, { jitter: .15 });
      if (!low) for (const z of [-2.63, 2.63]) b.box(m, 0, h - 3, z, .25, 1.5, .08, PAL.iron);
    }
  };
  for (const p of D.towers) tower(p);
  for (const g of D.gates) {
    // Flanking houses keep the full road corridor open; no ground-level lintel or closed gate.
    for (const side of [-1, 1]) {
      const x = g.x + Math.cos(g.yaw) * side * (g.w / 2 + 3), z = g.z - Math.sin(g.yaw) * side * (g.w / 2 + 3);
      if (world.data.roads.some(r => lineDist(x, z, r.pts) < 6) || streetsOf(world, S).some(st => lineDist(x, z, st.pts) < 6)) continue;
      tower({ x, z, yaw: g.yaw }, true);
    }
  }
}
function flagStones(b, world, pts, w, O, inCore) {
  // worn, uneven flagstones along a street, laid across its width
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1], L = Math.hypot(bx - ax, bz - az); if (L < .01) continue;
    const tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz, nz = tx;
    for (let s = 0; s < L; s += 1.05) for (let q = -w / 2 + .55; q < w / 2 - .4; q += 1.05) {
      const x = ax + tx * s + nx * q, z = az + tz * s + nz * q;
      if (!inCore(x, z)) continue;
      const hk = hash(Math.round(x * 3), Math.round(z * 3), 41); if (hk < .13) continue;
      slab(b, world, x, z, tx, tz, .46 + hash(Math.round(x * 7), Math.round(z * 7), 44) * .05, O, hk);
    }
  }
}
function slab(b, world, x, z, tx, tz, hs, O, hk) {
  const sunk = hash(Math.round(x * 5), Math.round(z * 5), 45), y = world.latticeHeight(x, z) + .06 + hk * .03 - (sunk < .2 ? .05 : 0), nx = -tz, nz = tx, v = [], j = n => (hash(Math.round(x * 50), Math.round(z * 50), n) - .5) * .17;
  const P = [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]].map(([u, w], n) => [x + tx * (u + j(n)) + nx * (w + j(n + 4)) - O.x, z + tz * (u + j(n)) + nz * (w + j(n + 4)) - O.z]);
  for (const p of [P[0], P[1], P[2], P[0], P[2], P[3]]) v.push(p[0], y, p[1]);
  for (let e = 0; e < 4; e++) { const A = P[e], B = P[(e + 1) % 4]; v.push(A[0], y, A[1], A[0], y - .12, A[1], B[0], y - .12, B[1], A[0], y, A[1], B[0], y - .12, B[1], B[0], y, B[1]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  b.g.add(g, hk < .45 ? PAL.flag1 : hk < .8 ? PAL.flag2 : hk < .9 ? PAL.stoneDark : hk < .96 ? '#5d5446' : '#4f5536', null, { cj: .12 });
}

function landmarks(b, world, S, houses, streets, fields, low) {
  const F = featuresOf(S);
  let mill = null, signpost = null;
  for (const h of houses) {
    const m = M(h.x - S.x, h.floor, h.z - S.z, h.yaw), D = h.D;
    if (h.role === 'temple') {
      const x = -h.L / 2 + 2, z = -D / 2 + 2;
      b.box(m, x, 0, z, 4.5, 13, 4.5, PAL.stone, { jitter: .1 });
      for (const side of [-1, 1]) b.box(m, x + side * 1.9, 13, z, .5, 3, 4.5, PAL.stoneDark);
      b.box(m, x, 15.5, z, 4.8, .4, 4.8, PAL.woodDark);
      b.g.add(new THREE.ConeGeometry(3.7, 6, 4).rotateY(Math.PI / 4).translate(x, 18.7, z), PAL.shingle, m, { jitter: .12 });
      b.cyl(m, x, 13.3, z, .65, 1.1, PAL.iron, 8);
    }
    if (h.role === 'palace' || h.role === 'guildhall') {
      const top = 2.6 + (h.opts.storeys - 1) * 2.4;
      if (h.role === 'palace') for (const side of [-1, 1]) {
        b.box(m, side * (h.L / 2 - 3), 0, -D / 2 + 3, 6, top + 7, 6, PAL.stone);
        b.g.add(new THREE.ConeGeometry(4.6, 5, 4).rotateY(Math.PI / 4).translate(side * (h.L / 2 - 3), top + 9.5, -D / 2 + 3), PAL.shingle, m);
      }
      else b.box(m, 0, 0, D / 2, 4, 4, 2, PAL.stoneLight);
    }
    if (h.role === 'inn' && !low) {
      b.box(m, h.L / 2 - .5, 3.7, D / 2 + .8, .12, .12, 1.8, PAL.iron);
      b.box(m, h.L / 2 - .5, 2.6, D / 2 + 1.45, 1.3, .9, .12, PAL.woodLight, { rz: .08 });
      b.cyl(m, h.L / 2 - .5, 2.8, D / 2 + 1.54, .22, .1, PAL.hay, 6, { rx: Math.PI / 2 });
    }
    if (h.role === 'smithy') {
      // Open shed within the reserved house footprint, with an ember bed under the deep eave.
      for (const x of [-1.5, 1.5]) b.box(m, x, 0, D / 2 + .6, .18, 2.6, .18, PAL.woodDark);
      b.cbox(m, 0, 2.55, D / 2 + .4, 4, .2, 2.1, PAL.shingle, { rx: .17 });
      b.box(m, 0, 0, D / 2 + .4, 1.7, .85, 1, PAL.stoneDark);
      if (!low) { b.gl.add(new THREE.BoxGeometry(1.3, .12, .7), PAL.ember, m.clone().multiply(M(0, .92, D / 2 + .4))); b.flame(m, 0, .95, D / 2 + .4, .7, .5); b.box(m, 1.1, .4, D / 2 + .5, .7, .4, .35, PAL.iron); }
    }
    if (h.role === 'barn' && !low) {
      b.box(m, 0, 0, D / 2 + .05, 3.4, 2.5, .15, PAL.woodDark);
      for (const side of [-1, 1]) b.box(m, side * .85, .2, D / 2 + .15, .12, 2.2, .08, PAL.woodLight, { rz: side * .5 });
    }
    if (h.role === 'farmhouse') {
      // Yard on the rear of the farmhouse, with a gap at the side for livestock.
      const at = (x, z) => { const v = new THREE.Vector3(x, 0, z).applyMatrix4(m); return [v.x + S.x, v.z + S.z]; };
      const cs = [[-h.L / 2 - 2, -D / 2], [-h.L / 2 - 2, -D / 2 - 10], [h.L / 2 + 2, -D / 2 - 10], [h.L / 2 + 2, -D / 2 - 3]].map(p => at(...p));
      for (let e = 1; e < cs.length; e++) {
        const pts = dense([cs[e - 1], cs[e]], 2);
        for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], c = pts[k], y = world.latticeHeight(...a); b.fence(M(a[0] - S.x, y, a[1] - S.z), 0, 0, c[0] - a[0], c[1] - a[1]); }
      }
      for (let k = 0; k < 3; k++) { const [x, z] = at(-2 + k * 2.7, -D / 2 - 4), y = world.latticeHeight(x, z); b.g.add(new THREE.IcosahedronGeometry(1, 0), PAL.hay, M(x - S.x, y + 1.3, z - S.z, .2 * k, 1.8, 1.5, 2.3), { jitter: .18 }); }
    }
  }
  // Small features occupy free road shoulders; test their footprint against houses and streets.
  const lots = [];
  for (const st of streets) for (let k = 2; k < st.pts.length; k += 2) {
    const [x, z] = st.pts[k], [px, pz] = st.pts[k - 1], l = Math.hypot(x - px, z - pz) || 1;
    for (const side of [-1, 1]) {
      const cx = x - (z - pz) / l * (st.w / 2 + 4) * side, cz = z + (x - px) / l * (st.w / 2 + 4) * side;
      if (Math.hypot(cx - S.x, cz - S.z) > S.r - 9 || world.latticeHeight(cx, cz) < .7) continue;
      if (houses.some(h => inRect(cx, cz, h.x, h.z, h.yaw, h.L, h.D, 3))) continue;
      if (streets.some(o => lineDist(cx, cz, o.pts) < o.w / 2 + 2)) continue;
      if (lots.some(p => Math.hypot(cx - p.x, cz - p.z) < 12)) continue;
      lots.push({ x: cx, z: cz });
    }
  }
  const wellLots = lots.slice().sort((a, b) => Math.hypot(a.x - S.x, a.z - S.z) - Math.hypot(b.x - S.x, b.z - S.z));
  const wells = Array.from({ length: Math.min(F.wells, wellLots.length) }, (_, k) => wellLots[Math.floor(k * wellLots.length / F.wells)]);
  for (const p of wells) {
    const m = M(p.x - S.x, world.latticeHeight(p.x, p.z), p.z - S.z);
    b.cyl(m, 0, 0, 0, 1.1, .85, PAL.stone, 10, { jitter: .06 }); b.cyl(m, 0, .86, 0, .8, .02, PAL.iron, 10);
    if (!low) { for (const s of [-1, 1]) b.box(m, s * .95, 0, 0, .14, 2.3, .14, PAL.woodDark); b.box(m, 0, 2.1, 0, 2.2, .12, .12, PAL.wood); }
  }
  if (F.mill) {
    const f = fields[0], p = lots.at(-1) || (f && { x: f.x, z: f.z });
    if (p) {
      mill = p;
      const m = M(p.x - S.x, world.latticeHeight(p.x, p.z), p.z - S.z, (S.seed % 13) * .2);
      b.g.add(new THREE.CylinderGeometry(2, 3.2, 10, 8).translate(0, 5, 0), PAL.stone, m, { jitter: .12 });
      b.g.add(new THREE.ConeGeometry(3.1, 4, 8).translate(0, 12, 0), PAL.shingle, m, { jitter: .1 });
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + .25; b.cbox(m, Math.sin(a) * 3.6, 8.5 + Math.cos(a) * 3.6, 3.3, .22, 7.2, .2, PAL.woodDark, { rz: -a }); b.cbox(m, Math.sin(a) * 5, 8.5 + Math.cos(a) * 5, 3.4, 1.4, 4, .1, PAL.canvasDark, { rz: -a, jitter: .06 }); }
      b.cyl(m, 0, 8.4, 2.5, .35, 1.2, PAL.wood, 8, { rx: Math.PI / 2 });
    }
  }
  if (S.kind === 'crossing') {
    // The shoulder of the central junction stays clear of the carriageway.
    const p = lots.filter(p => wells.every(w => Math.hypot(w.x - p.x, w.z - p.z) > 4)).reduce((a, p) => !a || Math.hypot(p.x - S.x, p.z - S.z) < Math.hypot(a.x - S.x, a.z - S.z) ? p : a, null);
    if (p) { signpost = p; const m = M(p.x - S.x, world.latticeHeight(p.x, p.z), p.z - S.z); b.cyl(m, 0, 0, 0, .13, 3.5, PAL.woodDark, 6, { jitter: .1 }); b.box(m, .5, 2.5, 0, 2.5, .45, .15, PAL.woodLight, { rz: .08 }); b.box(m, -.4, 3.1, 0, 2.2, .4, .15, PAL.wood, { ry: 1.2, rz: -.06 }); }
  }
  return { wells, mill, signpost };
}

// Build a town in one go (tests, tools); the manager uses buildSteps to spread the work over frames.
export function buildSettlement(world, S, level) { const it = buildSteps(world, S, level); let r; while (!(r = it.next()).done); return r.value; }
export function* buildSteps(world, S, level) {
  const O = { x: S.x, z: S.z }, group = new THREE.Group(), lights = [];
  group.position.set(S.x, 0, S.z);
  const streets = streetsOf(world, S), houses = housesOf(world, S, streets).filter(h => !world.detail?.blocksHouse(h.corners)&&!world.ddImports?.overlapsHouse(h));
  const b = new Builder((S.seed | 0) + 17), low = level === 'far';
  if(!low)captureProps(b,world,S,new THREE.Matrix4().makeTranslation(S.x,0,S.z));
  const P = profileOf(S), fields = fieldsOf(world, S), defences = defencesOf(world, S, streets, houses);
  const inCore = (x, z) => P.paved && Math.hypot(x - S.x, z - S.z) < S.r * CORE;
  if (urban(S)) urbanGround(b, world, S, defences.radius - 3);
  buildFields(b, world, S, fields, low);
  buildDefences(b, world, S, defences, low);
  yield;
  // houses (a pause every 150, so a city builds over several frames)
  let hn = 0;
  for (const h of houses) {
    if (++hn % 150 === 0) yield;
    const m = M(h.x - O.x, h.floor, h.z - O.z, h.yaw);
    const r = b.houseAt(m, h.L, h.D, { ...h.opts, footing: h.footing, low: low || h.urban,playable:!low,doorX:doorOffset(h.L,world.interiors?.app.buildings.keyOf(S,h)||`${S.id}:${Math.floor((h.x+HALF)/1.5)},${Math.floor((h.z+HALF)/1.5)}`) });
    if (h.urban && !low) {
      const top = 2.6 + (h.opts.storeys - 1) * 2.4;
      // The real ground-floor door is supplied by the interior system.
      for (let y = 2.6; y < top; y += 2.4) {
        b.box(m, 0, y, h.D / 2 + .03, h.L, .16, .08, PAL.woodDark);
        for (const x of [-h.L * .27, h.L * .27]) b.windows.add(WINDOW_PANE, PAL.window, m.clone().multiply(M(x, y + 1.2, h.D / 2 + .1)), { cj: .1 });
      }
      if (hash(S.seed, Math.round(h.x), Math.round(h.z)) < .35) b.box(m, h.L * .28, top, 0, .7, h.D * .55 + 1, .7, PAL.stoneDark);
    }
    if (!low && !h.urban) {
      const k = hash(S.seed | 0, Math.round(h.x), Math.round(h.z));
      if (k < .1 && P.paved) b.awning(m, h.L, h.D, r.dx);
      else if (k < .25) b.barrels(m, r.dx + (r.dx > 0 ? -1.7 : 1.7), h.D / 2 + .55);
      if (!P.paved && k > .6) { const yd = -h.D / 2 - 4; b.fence(m, -h.L / 2 - .4, -h.D / 2 - .3, -h.L / 2 - .4, yd); b.fence(m, -h.L / 2 - .4, yd, h.L / 2 + .4, yd); b.fence(m, h.L / 2 + .4, yd, h.L / 2 + .4, -h.D / 2 - .3); }
      if (!P.paved && k > .85) b.g.add(new THREE.IcosahedronGeometry(1, 1), PAL.hay, M(h.x - O.x + Math.sin(h.yaw) * -(h.D / 2 + 2.2), h.floor + .6, h.z - O.z + Math.cos(h.yaw) * -(h.D / 2 + 2.2), 0, 1.2, 1, 1.2), { jitter: .2 });
    }
  }
  // the streets the town added itself (the world's roads draw themselves)
  const own = streets.filter(s => !s.real);
  const skipCore = (x, z) => inCore(x, z);
  const hf = (x, z) => world.latticeHeight(x, z);
  if (own.length) {
    const main = own.filter(s => !s.lane), lanes = own.filter(s => s.lane);
    for (const st of main) b.g.add(ribbon([st.pts], st.w / 2, hf, .12, skipCore), PAL.road, M(-O.x, 0, -O.z));
    if (lanes.length) b.g.add(ribbon(lanes.map(s => s.pts), 1.5, hf, .1), PAL.road, M(-O.x, 0, -O.z));
  }
  if (!low && P.paved) {
    // flagstones in the core, a square at the centre
    for (const st of streets) if (!st.lane) flagStones(b, world, st.pts, st.w, O, inCore);
    for (let x = -P.square; x <= P.square; x += 1.05) for (let z = -P.square; z <= P.square; z += 1.05) {
      if (x * x + z * z > P.square * P.square) continue;
      const hk = hash(Math.round(x * 3) + 999, Math.round(z * 3), 43); if (hk < .07) continue;
      slab(b, world, S.x + x, S.z + z, 1, 0, .48, O, hk);
    }
    // stalls and braziers in the gaps between the streets that meet here
    const arms = streets.filter(s => !s.lane).flatMap(s => [s.pts[0], s.pts[s.pts.length - 1]]).filter(p => Math.hypot(p[0] - S.x, p[1] - S.z) > 20).map(p => Math.atan2(p[0] - S.x, p[1] - S.z)).sort((a, c) => a - c);
    const gaps = arms.length ? arms.map((a, k) => { const nx = k + 1 < arms.length ? arms[k + 1] : arms[0] + Math.PI * 2; return [(a + nx) / 2, nx - a]; }).filter(g => g[1] > .8) : [[0, 6], [2, 6], [4, 6]];
    gaps.forEach(([ang], k) => {
      const x = Math.sin(ang) * 9, z = Math.cos(ang) * 9, y = world.latticeHeight(S.x + x, S.z + z), m = M(x, y, z, ang + Math.PI);
      if (k % 2 === 0) { // a market stall: canvas on four posts, crates under it
        for (const [u, w] of [[-1.2, -.8], [1.2, -.8], [-1.2, .8], [1.2, .8]]) b.box(m, u, 0, w, .1, 2.2 - (w > 0 ? .2 : 0), .1, PAL.woodDark);
        b.cbox(m, 0, 2.1, 0, 2.7, .04, 2.0, k % 4 ? PAL.canvas : PAL.canvasDark, { rx: .12, jitter: .05 });
        b.crate(m, -.6, 0); b.crate(m, .5, .2, 0, .7); b.barrel(m, 1.4, -1.2);
      } else b.brazier(m, 0, 0);
    });
    { const x = 5, z = -7, y = world.latticeHeight(S.x + x, S.z + z); b.cart(M(x, y, z), 0, 0, .7); }
  }
  if (!low) {
    // no street lamps: a torch by the door of each inn and tavern, nothing else
    for (const h of houses) if (h.role === 'inn') {
      const c = Math.cos(h.yaw), sn = Math.sin(h.yaw), lx = h.L / 2 + .9, lz = h.D / 2 + .9;
      const tx = h.x + c * lx + sn * lz, tz = h.z - sn * lx + c * lz;
      if (!houses.some(q => q !== h && inRect(tx, tz, q.x, q.z, q.yaw, q.L, q.D, .3))) b.torch(M(0, world.latticeHeight(tx, tz), 0), tx - O.x, tz - O.z);
    }
  }
  if (!low && S.kind === 'village') { // the green: a fire and logs to sit on
    const y = world.latticeHeight(S.x, S.z), m = M(0, y, 0);
    for (let k = 0; k < 8; k++) { const a = k * .785; b.rock(m, Math.cos(a) * .75, .05, Math.sin(a) * .75, .22, PAL.stoneDark); }
    b.flame(m, 0, .15, 0, 2.0, 1.8);
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + .4; b.g.add(new THREE.CylinderGeometry(1, 1, 1, 8, 1), PAL.wood, M(Math.cos(a) * 2.6, y + .25, Math.sin(a) * 2.6, a, .25, 1.8, .25, 0, Math.PI / 2), { jitter: .03 }); }
  }
  yield;
  const details = landmarks(b, world, S, houses, streets, fields, low);
  yield;
  const main = b.geometry(true);
  for (const c of [...main.children]) group.add(c);
  lights.push(...b.lights.map(v => v.clone().add(group.position)));
  // the walled unit at the centre, turned so its gate faces the road
  if (UNIT_KINDS.has(S.kind) && UNITS[S.kind]) {
    const u = new Builder((S.seed | 0) || 1);
    if(!low)captureProps(u,world,S,M(S.x,S.h,S.z,S.theta||0),'unit');
    u.entries = roadEntries(world, S, S.theta || 0);
    UNITS[S.kind](u);
    const ug = u.geometry(true);
    ug.position.set(0, S.h, 0); ug.rotation.y = S.theta || 0; group.add(ug);
    ug.updateMatrixWorld(true);
    const R = new THREE.Matrix4().makeRotationY(S.theta || 0);
    lights.push(...u.lights.map(v => v.clone().applyMatrix4(R).add(new THREE.Vector3(S.x, S.h, S.z))));
  }
  return { group, lights, houses, fields, defences, details, level };
}

// ---------- the manager: load near, light far, free with hysteresis ----------
export class Towns {
  constructor(world, scene) {
    this.world = world; this.scene = scene; this.loaded = new Map(); this.version = 0;
    world.fieldFn = (x, z, settlements) => inFields(world, x, z, settlements);
  }
  visible(S, role) { return role === 'gm' || S.known; }
  free(id) {
    const r = this.loaded.get(id); if (!r) return;
    this.scene.remove(r.group);
    r.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.loaded.delete(id); this.version++;
  }
  freeAll() { this.job = null; for (const id of [...this.loaded.keys()]) this.free(id); }
  // At most one build per call; nearest first. Returns true while something still needs building.
  update(camera, role) {
    const cp = camera.position, list = this.world.data.settlements;
    let want = null, wantD = Infinity, pending = false;
    for (const S of list) {
      const d = Math.max(0, Math.hypot(S.x - cp.x, S.z - cp.z) - S.r), dd = Math.hypot(d, cp.y - S.h);
      const r = this.loaded.get(S.id), ok = this.visible(S, role);
      const level = !ok ? null : dd < NEAR ? 'near' : dd < FAR ? 'far' : null;
      const keep = r && ok && (r.level === 'near' ? dd < NEAR_FREE : dd < FAR_FREE);
      if (r && !keep) this.free(S.id);
      const cur = this.loaded.get(S.id);
      if (level && (!cur || (level === 'near' && cur.level !== 'near'))) { pending = true; if (dd < wantD) { wantD = dd; want = [S, level]; } }
    }
    for (const id of [...this.loaded.keys()]) if (!list.find(S => S.id === id)) this.free(id);
    // build the nearest wanted town a slice at a time (~8 ms a frame); what is there stays until it's done
    if (want && (!this.job || this.job.S !== want[0] || this.job.level !== want[1])) this.job = { S: want[0], level: want[1], it: buildSteps(this.world, want[0], want[1]) };
    if (this.job) {
      const { S, level, it } = this.job, t0 = performance.now(); let r;
      do r = it.next(); while (!r.done && performance.now() - t0 < 8);
      if (r.done) { this.job = null; if (list.includes(S)) { const rec = r.value; this.free(S.id); this.scene.add(rec.group); this.loaded.set(S.id, { ...rec, id: S.id }); this.version++; } }
      pending = true;
    }
    return pending;
  }
  get nearCount() { let n = 0; for (const r of this.loaded.values()) if (r.level === 'near') n++; return n; }
  torchesNear(pt, n) {
    const all = [];
    for (const r of this.loaded.values()) if (r.level === 'near') for (const v of r.lights) { const d = v.distanceToSquared(pt); if (d < 6400) all.push([d, v]); }
    all.sort((a, b) => a[0] - b[0]);
    return all.slice(0, n).map(a => a[1]);
  }
  // Floor height of a loaded house at a point (tokens and grids stand on floors).
  floorAt(x, z) {
    for (const r of this.loaded.values()) if (r.level === 'near') for (const h of r.houses) if (Math.abs(h.x - x) < Math.hypot(h.L,h.D)/2 && Math.abs(h.z - z) < Math.hypot(h.L,h.D)/2 && inRect(x, z, h.x, h.z, h.yaw, h.L, h.D)) return h.floor;
    return null;
  }
  // Direction of the nearest street (any settlement's, or a world road) within reach, as a grid rotation.
  streetBearing(x, z, reach = 45) {
    let best = null, bd = reach;
    const consider = pts => { for (let k = 0; k + 1 < pts.length; k++) { const d = segDist(x, z, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]); if (d < bd) { bd = d; best = Math.atan2(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]); } } };
    for (const S of this.world.data.settlements) if (Math.hypot(S.x - x, S.z - z) < S.r + reach) for (const st of streetsOf(this.world, S)) if (!st.lane) consider(st.pts);
    for (const r of this.world.data.roads) consider(r.pts);
    return best;
  }
}
