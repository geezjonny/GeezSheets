import * as THREE from 'three';
import { Builder } from './places.js';
import { PAL, M } from './style.js';
import { LINE_W } from './world.js';
import { hash } from './noise.js';

const LOAD = 2000, FREE = 2500;
const cross = (ax, az, bx, bz) => ax * bz - az * bx;

// Derived data only. Shared polyline vertices produce just one crossing.
export function crossings(world) {
  const out = [];
  for (const road of world.data.roads) for (const river of world.data.rivers) {
    for (let i = 0; i + 1 < road.pts.length; i++) for (let j = 0; j + 1 < river.pts.length; j++) {
      const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
      const [cx, cz] = river.pts[j], [dx, dz] = river.pts[j + 1];
      const ux = bx - ax, uz = bz - az, vx = dx - cx, vz = dz - cz;
      const det = cross(ux, uz, vx, vz), ul = Math.hypot(ux, uz), vl = Math.hypot(vx, vz);
      if (!ul || !vl || Math.abs(det) < 1e-8) continue;
      const t = cross(cx - ax, cz - az, vx, vz) / det, q = cross(cx - ax, cz - az, ux, uz) / det;
      if (t < 0 || t > 1 || q < 0 || q > 1) continue;
      const x = ax + ux * t, z = az + uz * t;
      if (out.some(c => Math.hypot(c.x - x, c.z - z) < 2)) continue;
      const sin = Math.abs(det) / (ul * vl), cos = Math.abs((ux * vx + uz * vz) / (ul * vl));
      const seed = Math.floor(hash(Math.round(x * 10), Math.round(z * 10), 817) * 1e8);
      // Include the full road width at oblique crossings, then 3.5 m of bank per end.
      const span = (LINE_W.river + LINE_W.road * cos) / sin + 7;
      out.push({ id: `${road.id}/${river.id}/${Math.round(x * 10)}/${Math.round(z * 10)}`, x, z, ux: ux / ul, uz: uz / ul,
        span, seed, river: river.pts, timber: hash(seed, 19) < .35, y: Math.max(0, world.latticeHeight(x, z)) });
    }
  }
  return out;
}

export function buildBridge(world, c) {
  const b = new Builder(c.seed), w = LINE_W.road, half = c.span / 2;
  const at = (s, side = 0) => [c.x + c.ux * s + c.uz * side, c.z + c.uz * s - c.ux * side];
  const ground = (s, side = 0) => world.latticeHeight(...at(s, side));
  // The deck stops 3.5 m beyond each bank, with its ends at the road surface.
  // Sample both edges too, so a cross-slope cannot leave a deck corner airborne.
  let rise = 1.35;
  const deck = (s, side = 0) => {
    const t = (s + half) / c.span;
    const bank = ground(-half, side) * (1 - t) + ground(half, side) * t;
    return Math.max(ground(s, side), bank + rise * 4 * t * (1 - t)) + .12;
  };
  // Water ribbons sample the centreline every <=12 m and extend that height
  // across their width. On a cross slope this differs from the bed below them.
  for (let k = 1; k < 64; k++) for (const side of [-w / 2, 0, w / 2]) {
    const t = k / 64, s = -half + c.span * t, [x, z] = at(s, side);
    for (let j = 0; j + 1 < (c.river?.length || 0); j++) {
      const [ax, az] = c.river[j], [bx, bz] = c.river[j + 1], dx = bx - ax, dz = bz - az;
      const length = Math.hypot(dx, dz);
      if (!length) continue;
      const q = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length ** 2));
      if (Math.hypot(x - ax - dx * q, z - az - dz * q) > LINE_W.river / 2) continue;
      const n = Math.max(1, Math.ceil(length / 12)), i = Math.min(n - 1, Math.floor(q * n)), u = q * n - i;
      const a = world.latticeHeight(ax + dx * i / n, az + dz * i / n);
      const d = world.latticeHeight(ax + dx * (i + 1) / n, az + dz * (i + 1) / n);
      const water = Math.max(0, a + (d - a) * u + .5) + .65;
      rise += Math.max(0, water - deck(s, side)) / (4 * t * (1 - t));
    }
  }
  const m = M(0, 0, 0, Math.atan2(c.ux, c.uz));
  // A closed prism with independently sampled corners. No vertex jitter at joins.
  const prism = (s0, s1, x0, x1, bottom, surface, col) => {
    const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) < 0 ? x0 : x1, s = p.getZ(i) < 0 ? s0 : s1;
      p.setXYZ(i, x, (p.getY(i) < 0 ? bottom : surface)(s, x), s);
    }
    b.g.add(g, col, m); g.dispose();
  };
  const n = Math.min(100, Math.max(16, Math.ceil(c.span / (c.timber ? .65 : 1)))), step = c.span / n;
  for (let k = 0; k < n; k++) {
    const a = -half + k * step, d = -half + (k + 1) * step;
    prism(a, d, -w / 2, w / 2, (s, x) => deck(s, x) - .35, deck,
      c.timber ? PAL.wood : k % 3 ? PAL.flag1 : PAL.flag2);
    if (!c.timber) {
      // Masonry is deeper at the springings, leaving a shallow open arch below.
      prism(a, d, -w / 2, w / 2,
        (s, x) => deck(s, x) - .7 - 1.5 * (s / half) ** 2,
        (s, x) => deck(s, x) - .3, PAL.stone);
    }
    for (const side of [-1, 1]) {
      const x = side * (w / 2 + (c.timber ? -.08 : .1));
      if (!c.timber) prism(a, d, x - .25, x + .25, deck, (s, x) => deck(s, x) + .9, PAL.stoneDark);
      else {
        if (k % 4 === 0 || k === n - 1) {
          const s = (a + d) / 2;
          b.box(m, x, deck(s, x) - .35, s, .16, 1.45, .16, PAL.woodDark, { jitter: 0 });
        }
        for (const y of [.5, 1]) prism(a, d, x - .06, x + .06,
          (s, x) => deck(s, x) + y, (s, x) => deck(s, x) + y + .12, PAL.wood);
      }
    }
  }
  // Embed foundations below the lowest point in their footprint, including the
  // actual lateral post position rather than the road centre on sloping ground.
  const foundation = (s0, s1, x0, x1, surface, col) => {
    let base = Infinity;
    for (const s of [s0, (s0 + s1) / 2, s1]) for (const x of [x0, (x0 + x1) / 2, x1])
      base = Math.min(base, ground(s, x), surface(s, x));
    prism(s0, s1, x0, x1, () => base - .75, surface, col);
  };
  if (c.timber) {
    const supports = Math.min(32, Math.max(2, Math.ceil(c.span / 5)));
    for (let k = 0; k < supports; k++) {
      const s = -half + (k + .5) * c.span / supports;
      for (const side of [-1, 1]) {
        const x = side * (w / 2 - .3);
        foundation(s - .18, s + .18, x - .18, x + .18, (s, x) => deck(s, x) - .25, PAL.woodDark);
      }
    }
  }
  for (const side of [-1, 1]) {
    const s = side * (half - 1);
    foundation(s - .75, s + .75, -w / 2 - .5, w / 2 + .5,
      (s, x) => deck(s, x) - (c.timber ? .25 : .65), PAL.stoneDark);
  }
  const group = b.geometry(false); group.position.set(c.x, 0, c.z);
  return { group, top: deck(0), width: w, timber: c.timber };
}

export class Bridges {
  constructor(world, scene) { this.world = world; this.scene = scene; this.loaded = new Map(); this.rebuild(); }
  free(id) {
    const r = this.loaded.get(id); if (!r) return;
    this.scene.remove(r.group); r.group.traverse(o => o.geometry?.dispose()); this.loaded.delete(id);
  }
  freeAll() { for (const id of this.loaded.keys()) this.free(id); }
  rebuild() { this.freeAll(); this.crossings = crossings(this.world); }
  update(camera) {
    const p = camera.position; let want = null, nearest = Infinity;
    for (const c of this.crossings) {
      const d = Math.hypot(c.x - p.x, c.z - p.z, c.y - p.y);
      if (d > FREE) this.free(c.id);
      if (d < LOAD && !this.loaded.has(c.id) && d < nearest) { want = c; nearest = d; }
    }
    if (!want) return false;
    const rec = buildBridge(this.world, want); this.scene.add(rec.group); this.loaded.set(want.id, rec);
    return true;
  }
}
