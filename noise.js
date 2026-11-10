// Fixed noise and hashes. Everything in the world is a pure function of the saved data and these.
export function mulberry(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

const perm = new Uint8Array(512);
{
  const rand = mulberry(7);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const GX = [1, -1, 1, -1, 1, -1, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1, -1];

export function simplex(x, y) {
  const F = 0.3660254037844386, Gk = 0.21132486540518713;
  const s = (x + y) * F, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * Gk;
  const x0 = x - (i - t), y0 = y - (j - t), i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + Gk, y1 = y0 - j1 + Gk, x2 = x0 - 1 + 2 * Gk, y2 = y0 - 1 + 2 * Gk;
  const ii = i & 255, jj = j & 255;
  let n = 0, tt, g;
  tt = .5 - x0 * x0 - y0 * y0; if (tt > 0) { g = perm[ii + perm[jj]] & 7; tt *= tt; n += tt * tt * (GX[g] * x0 + GY[g] * y0); }
  tt = .5 - x1 * x1 - y1 * y1; if (tt > 0) { g = perm[ii + i1 + perm[jj + j1]] & 7; tt *= tt; n += tt * tt * (GX[g] * x1 + GY[g] * y1); }
  tt = .5 - x2 * x2 - y2 * y2; if (tt > 0) { g = perm[ii + 1 + perm[jj + 1]] & 7; tt *= tt; n += tt * tt * (GX[g] * x2 + GY[g] * y2); }
  return 70 * n;
}

export function fbm(x, y, o) { let a = 1, f = 1, s = 0, n = 0; for (let k = 0; k < o; k++) { s += a * simplex(x * f, y * f); n += a; a *= .5; f *= 2.03; } return s / n; }
export function ridged(x, y, o) { let a = 1, f = 1, s = 0, n = 0; for (let k = 0; k < o; k++) { const r = 1 - Math.abs(simplex(x * f + 31.7, y * f - 17.3)); s += a * r * r; n += a; a *= .5; f *= 2.1; } return s / n; }
export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
export const lerp = (a, b, t) => a + (b - a) * t;

// Integer hash of up to three ints into [0, 1).
export function hash(i, j = 0, k = 0) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(k | 0, 2246822519);
  h = Math.imul(h ^ h >>> 13, 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
