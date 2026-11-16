// Small voxel toolkit: a sparse grid keyed by "x,y,z", plus the shape helpers the builder uses.
// Everything is centred on a mirror line between x = -1 and x = 0, so mx(x) = -1 - x is the mirrored column.
export const key = (x, y, z) => x + ',' + y + ',' + z;
export const mx = (x) => -1 - x;
export const hash = (x, y, z) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
export const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const hex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const shade = (h, f) => hex(rgb(h).map((v) => v * f));
/** Superellipse cross-section test: |a/ha|^p + |b/hb|^p <= 1. High p is a rectangle, p near 2 is an ellipse. */
export const se = (a, ca, ha, b, cb, hb, p) => Math.pow(Math.abs(a - ca) / ha, p) + Math.pow(Math.abs(b - cb) / hb, p) <= 1.001;
/** Rounded-box test in centred coordinates (half extent h, corner radius r). r = 0 is a plain box. */
export const rbox = (x, y, z, h, r) => { const q = [Math.abs(x) - (h - r), Math.abs(y) - (h - r), Math.abs(z) - (h - r)].map((v) => Math.max(v, 0)); return Math.hypot(...q) <= r + 0.01; };
export const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); };

export class Grid {
  constructor() { this.m = new Map(); }
  set(x, y, z, c, o) { this.m.set(key(x, y, z), { c, ...o }); return this; }
  get(x, y, z) { return this.m.get(key(x, y, z)); }
  has(x, y, z) { return this.m.has(key(x, y, z)); }
  del(x, y, z) { this.m.delete(key(x, y, z)); }
  /** Fill an inclusive box. c is a colour or (x,y,z) => colour (return null to skip). */
  box(x0, y0, z0, x1, y1, z1, c, o) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const col = typeof c === 'function' ? c(x, y, z) : c;
      if (col) this.set(x, y, z, col, o);
    }
    return this;
  }
  /** Box plus its mirror image across the centre line. */
  sym(x0, y0, z0, x1, y1, z1, c, o) { this.box(x0, y0, z0, x1, y1, z1, c, o); return this.box(mx(x1), y0, z0, mx(x0), y1, z1, c, o); }
  /** Horizontal disc in the x/z plane at height y. */
  disc(y, cx, cz, r, c, o) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
      if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) { const col = typeof c === 'function' ? c(x, y, z) : c; if (col) this.set(x, y, z, col, o); }
    return this;
  }
  /** Solid sphere. */
  ball(cx, cy, cz, r, c, o) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
      if ((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 <= r * r) { const col = typeof c === 'function' ? c(x, y, z) : c; if (col) this.set(x, y, z, col, o); }
    return this;
  }
  /** Solid ellipsoid; c may be a colour or (x,y,z) => colour (null skips). */
  ell(cx, cy, cz, rx, ry, rz, c, o) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1) { const col = typeof c === 'function' ? c(x, y, z) : c; if (col) this.set(x, y, z, col, o); }
    return this;
  }
  /** Tube along a polyline of [x,y,z] points; radius eases from r0 to r1. */
  tube(pts, r0, r1, c, o) {
    const total = pts.length - 1;
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s], b = pts[s + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 2));
      for (let i = 0; i <= n; i++) {
        const t = i / n, u = (s + t) / total, r = r0 + (r1 - r0) * u;
        this.ball(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, r, c, o);
      }
    }
    return this;
  }
}
