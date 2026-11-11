// A starter continent so nobody starts from a blank sea.
import { fbm, ridged, mulberry } from './noise.js';
import { N, CELL, HALF, T, TYPES, encodeBytes, DEFAULT_R } from './world.js';

// Corner-cutting smoothing for a polyline, keeping both ends.
function chaikin(p) {
  const o = [p[0]];
  for (let k = 0; k + 1 < p.length; k++) { const [ax, az] = p[k], [bx, bz] = p[k + 1]; o.push([+(ax * .75 + bx * .25).toFixed(1), +(az * .75 + bz * .25).toFixed(1)], [+(ax * .25 + bx * .75).toFixed(1), +(az * .25 + bz * .75).toFixed(1)]); }
  o.push(p[p.length - 1]); return o;
}

export function starterWorld(seed = 3) {
  const t = new Uint8Array(N * N), e = new Float32Array(N * N), so = seed * 17.3;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / N - .5) * 2, z = (j / N - .5) * 2, r = Math.hypot(x * .95, z * 1.12);
    const ev = fbm(i / 55 + so, j / 55 - so, 5) * .85 + .5 - r * r * 1.15;
    const ridge = ridged(i / 38 + so, j / 38 - 3, 4), moist = fbm(i / 30 - 20 + so, j / 30 + 9, 4);
    let ty;
    if (ev < -.12) ty = T.DEEP; else if (ev < 0) ty = T.SHALLOW;
    else if (ev < .035) ty = moist > .18 ? T.MARSH : T.BEACH;
    else if (ev > .3 && ridge > .58) ty = ev > .5 && ridge > .66 ? T.SNOW : T.MOUNTAIN;
    else if (ev > .22 && ridge > .42) ty = T.HILLS;
    else if (moist > .1) ty = T.FOREST;
    else if (moist < -.3) ty = T.DRY;
    else if (ev < .08 && moist > .02) ty = T.MARSH;
    else ty = T.GRASS;
    t[j * N + i] = ty; e[j * N + i] = ev + (ty === T.MOUNTAIN || ty === T.SNOW ? ridge * .4 : ty === T.HILLS ? ridge * .15 : 0);
  }
  const rnd = mulberry(seed * 101);
  const world = (i, j) => [+((i + .5) * CELL - HALF).toFixed(1), +((j + .5) * CELL - HALF).toFixed(1)];
  const land = k => TYPES[t[k]].land;

  // river: start high, walk downhill to the sea
  const rivers = [];
  const starts = [];
  for (let k = 0; k < N * N; k++) if (t[k] === T.MOUNTAIN) starts.push(k);
  starts.sort((a, b) => e[b] - e[a]);
  for (let s = 0, made = 0; s < starts.length && made < 2; s += 37) {
    let k = starts[s]; const pts = [], seen = new Set();
    while (land(k) && !seen.has(k) && pts.length < 400) {
      seen.add(k); const i = k % N, j = (k / N) | 0; pts.push(world(i, j));
      let best = -1, bh = Infinity;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const kk = (j + dj) * N + i + di; if (seen.has(kk)) continue; const h = e[kk] + rnd() * .01; if (h < bh) { bh = h; best = kk; } }
      if (best < 0) break; k = best;
    }
    if (!land(k)) pts.push(world(k % N, (k / N) | 0));
    if (pts.length > 25 && !land(k)) { rivers.push({ id: 'river' + made, pts: chaikin(chaikin(pts.filter((_, n) => n % 3 === 0 || n === pts.length - 1))) }); made++; }
  }

  // places on open ground near chosen spots
  const want = [
    ['Brackenford', 'town', .47, .52, true], ['Ashwater', 'village', .6, .42, true], ['The Grey Keep', 'keep', .38, .38, true],
    ['Redfern Camp', 'camp', .58, .64, true], ['Cairn Hollow', 'ruin', .33, .6, false],
  ];
  // cells within ~3 cells of a river are no place for a battlemap
  const wet = new Uint8Array(N * N);
  for (const r of rivers) for (const [x, z] of r.pts) { const ci = Math.floor((x + HALF) / CELL), cj = Math.floor((z + HALF) / CELL); for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const ii = ci + di, jj = cj + dj; if (ii >= 0 && jj >= 0 && ii < N && jj < N) wet[jj * N + ii] = 1; } }
  const places = [];
  for (const [name, kind, fx, fz, known] of want) {
    let best = -1, bd = Infinity;
    for (let j = 4; j < N - 4; j++) for (let i = 4; i < N - 4; i++) {
      const k = j * N + i; if (t[k] !== T.GRASS && t[k] !== T.DRY && t[k] !== T.HILLS) continue;
      let ok = true; for (let dj = -1; dj <= 1 && ok; dj++) for (let di = -1; di <= 1; di++) if (!TYPES[t[k + dj * N + di]].land) { ok = false; break; }
      if (!ok) continue;
      if (wet[k]) continue;
      const d = Math.hypot(i / N - fx, j / N - fz); if (d < bd && !places.some(p => Math.hypot(p.i - i, p.j - j) < 18)) { bd = d; best = k; }
    }
    if (best < 0) continue;
    const i = best % N, j = (best / N) | 0, [x, z] = world(i, j);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (t[best + dj * N + di] !== T.HILLS || kind !== 'keep') t[best + dj * N + di] = kind === 'ruin' ? T.GRASS : t[best] === T.DRY ? T.DRY : T.GRASS;
    places.push({ id: 'pl_' + kind, name, kind, x, z, seed: 1000 + places.length * 7919, known, i, j });
  }
  // roads between the first four places, with a little wander
  const roads = [];
  const road = (a, b, id) => {
    const pts = [[a.x, a.z]], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.round(L / 700));
    for (let k = 1; k < n; k++) { const f = k / n, nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L, w = (rnd() - .5) * 400; pts.push([+(a.x + (b.x - a.x) * f + nx * w).toFixed(1), +(a.z + (b.z - a.z) * f + nz * w).toFixed(1)]); }
    pts.push([b.x, b.z]); roads.push({ id, pts });
  };
  if (places.length >= 4) { road(places[0], places[1], 'road0'); road(places[0], places[2], 'road1'); road(places[0], places[3], 'road2'); }
  // settlements are areas in the world; battlemaps are points (one in each settlement, one on a forest road)
  const settlements = places.map(({ i, j, ...p }) => ({ ...p, r: DEFAULT_R[p.kind] }));
  const mapName = { town: ' square', village: ' green', keep: ' yard', camp: ' fire', ruin: ' stones' };
  const battlemaps = settlements.map(p => ({ id: 'bm_' + p.id, name: p.name + mapName[p.kind], x: p.x, z: p.z, rot: null, known: p.known }));
  // a roadside battlemap: the flattest dry open spot along the first road, away from the places
  if (roads[0]) {
    const r = roads[0].pts, cellOf = (x, z) => [Math.floor((x + HALF) / CELL), Math.floor((z + HALF) / CELL)];
    let best = null, bs = Infinity;
    for (let n = 0; n < r.length - 1; n++) for (let f = 0; f < 1; f += .1) {
      const x = r[n][0] + (r[n + 1][0] - r[n][0]) * f, z = r[n][1] + (r[n + 1][1] - r[n][1]) * f, [i, j] = cellOf(x, z);
      if (i < 2 || j < 2 || i >= N - 2 || j >= N - 2) continue;
      const k = j * N + i; if (wet[k] || (t[k] !== T.GRASS && t[k] !== T.DRY && t[k] !== T.FOREST)) continue;
      if (places.some(p => Math.hypot(p.x - x, p.z - z) < 400)) continue;
      let slope = 0; for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) slope = Math.max(slope, Math.abs(e[k + dj * N + di] - e[k]));
      if (slope < bs) { bs = slope; best = [+x.toFixed(1), +z.toFixed(1)]; }
    }
    if (best) battlemaps.push({ id: 'bm_road', name: 'Mill road', x: best[0], z: best[1], rot: null, known: true });
  }
  const tokens = settlements.length ? [
    { id: 'tk1', name: 'Aric', color: '#9e3a2e', map: battlemaps[0].id, i: 18, j: 25 },
    { id: 'tk2', name: 'Brin', color: '#3a6a9e', map: battlemaps[0].id, i: 20, j: 25 },
    { id: 'tk3', name: 'Cass', color: '#4c8538', map: battlemaps[0].id, i: 22, j: 26 },
  ] : [];
  return { version: 2, size: N, terrain: encodeBytes(t), rivers, roads, settlements, battlemaps, tokens };
}
