// Places: battlemaps that exist only when someone is close. Built from kind + seed, so a place
// always looks the same. 40 x 40 squares of 1.5 m; buildings sit on whole squares.
import * as THREE from 'three';
import { mulberry, hash, fbm } from './noise.js';
import { PAL, MAT, Geo, M, color, gable } from './style.js';
import { tokenCoin } from './tokens.js';

export const SQ = 1.5, GRID = 40, MAP = SQ * GRID;
export const sqX = i => (i - GRID / 2 + .5) * SQ; // centre of square i, local metres
const edge = i => (i - GRID / 2) * SQ;            // left edge of square i
const B1 = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0); // unit box standing on y=0
// Weathering (dark fantasy: nothing new, nothing clean). Roofs, thatch and walls vary house to house.
const ROOFS = ['#414b4c', '#3c5446', '#526444', '#2c342d', '#51574b', '#605c46', '#5e6d60', '#4d5147'];
const THATCH = ['#7d7056', '#8b7d51', '#87774b', '#998650', '#756b47'];
const PLASTER = ['#a99b77', '#8b9885', '#a19a7f', '#929780', '#b0a17a', '#8c8d7a'];
const MOSS = ['#4f5a34', '#5a6338', '#47522f'];
const SOOT = '#24211f';
const hk = (m, n) => hash(Math.round(m.elements[12] * 3), Math.round(m.elements[14] * 3), n);
const BC = new THREE.BoxGeometry(1, 1, 1);                     // unit box, centred
const CYL = (seg) => new THREE.CylinderGeometry(1, 1, 1, seg, 1).translate(0, .5, 0);
const C6 = CYL(6), C8 = CYL(8), C10 = CYL(10);
const CONE5 = new THREE.ConeGeometry(1, 1, 5, 1).translate(0, .5, 0), CONE8 = new THREE.ConeGeometry(1, 1, 8, 1).translate(0, .5, 0);
const ICO = new THREE.IcosahedronGeometry(1, 0), ICO1 = new THREE.IcosahedronGeometry(1, 1), DOD = new THREE.DodecahedronGeometry(1, 0);
const PLANE = new THREE.PlaneGeometry(1, 1);

export class Builder {
  constructor(seed) {
    this.rng = mulberry(seed); this.seed = seed;
    this.g = new Geo(seed); this.gl = new Geo(seed + 1); this.ha = new Geo(seed + 2);
    this.windows = new Geo(seed + 3);
    this.lights = []; this.occ = new Uint8Array(GRID * GRID); this.paved = new Uint8Array(GRID * GRID); this.dirt = new Uint8Array(GRID * GRID); this.track = new Uint8Array(GRID * GRID);
    this.entries = [];
  }
  r(a = 0, b = 1) { return a + (b - a) * this.rng(); }
  ri(a, b) { return Math.floor(this.r(a, b + 1)); }
  free(i0, j0, w, d) { if (i0 < 0 || j0 < 0 || i0 + w > GRID || j0 + d > GRID) return false; for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) if (this.occ[j * GRID + i]) return false; return true; }
  mark(i0, j0, w, d, v = 1) { for (let j = Math.max(0, j0); j < Math.min(GRID, j0 + d); j++) for (let i = Math.max(0, i0); i < Math.min(GRID, i0 + w); i++) this.occ[j * GRID + i] = v; }
  // parts (matrix m is the parent frame)
  box(m, x, y, z, w, h, d, col, o = {}) { this.g.add(B1, col, mul(m, M(x, y, z, o.ry || 0, w, h, d, o.rx || 0, o.rz || 0)), { jitter: o.jitter ?? .04, cj: o.cj ?? .05, ao: o.ao, aoDark: o.aoDark }); }
  cbox(m, x, y, z, w, h, d, col, o = {}) { this.g.add(BC, col, mul(m, M(x, y, z, o.ry || 0, w, h, d, o.rx || 0, o.rz || 0)), { jitter: o.jitter ?? .04, cj: o.cj ?? .05 }); }
  cyl(m, x, y, z, r, h, col, seg = 8, o = {}) { this.g.add(seg <= 6 ? C6 : seg <= 8 ? C8 : C10, col, mul(m, M(x, y, z, o.ry || 0, r, h, o.r2 ?? r, o.rx || 0, o.rz || 0)), { jitter: o.jitter ?? .02,inkSurface:o.inkSurface }); }
  rock(m, x, y, z, s, col = PAL.rock) { this.g.add(DOD, col, mul(m, M(x, y, z, this.r(0, 6), s * this.r(.8, 1.3), s * this.r(.5, .9), s * this.r(.8, 1.2))), { jitter: s * .4, cj: .1 }); }
  flame(m, x, y, z, s = 1, halo = 1.2) {
    this.gl.add(CONE5, PAL.flame, mul(m, M(x, y, z, this.r(0, 6), .2 * s, .55 * s, .2 * s)), { jitter: .04 * s, cj: .1 });
    this.gl.add(CONE5, PAL.flameCore, mul(m, M(x, y, z, this.r(0, 6), .11 * s, .32 * s, .11 * s)), { cj: 0 });
    this.ha.add(ICO1, PAL.halo, mul(m, M(x, y + .2 * s, z, 0, halo, halo, halo)), { cj: 0 });
    const v = new THREE.Vector3(x, y + .3 * s, z); if (m) v.applyMatrix4(m); this.lights.push(v);
  }
  torch(m, x, z) { // torch in an iron basket on a wooden pole
    this.cyl(m, x, 0, z, .07, 2.6, PAL.wood, 5, { r2: .09 });
    this.cyl(m, x, 2.45, z, .2, .32, PAL.iron, 6, { r2: .2,inkSurface:6 });
    this.flame(m, x, 2.75, z, 1, 1.1);
  }
  brazier(m, x, z) {
    for (let k = 0; k < 3; k++) { const a = k * 2.094; this.box(m, x + Math.cos(a) * .35, 0, z + Math.sin(a) * .35, .07, .85, .07, PAL.iron, { rx: Math.sin(a) * .25, rz: -Math.cos(a) * .25 }); }
    this.cyl(m, x, .75, z, .58, .32, PAL.iron, 8,{inkSurface:6});
    for (let k = 0; k < 4; k++) this.gl.add(DOD, PAL.ember, mul(m, M(x + this.r(-.25, .25), 1.05, z + this.r(-.25, .25), 0, .16, .1, .16)), { cj: .15 });
    this.flame(m, x, 1.0, z, 1.9, 1.7); this.flame(m, x + .2, 1.0, z - .1, 1.2, .01);
  }
  barrel(m, x, z, y = 0) {
    this.cyl(m, x, y, z, .36, .95, PAL.wood, 8, { jitter: .02 });
    this.cyl(m, x, y + .18, z, .38, .06, PAL.iron, 8); this.cyl(m, x, y + .72, z, .38, .06, PAL.iron, 8);
    this.cyl(m, x, y + .95, z, .31, .02, PAL.woodDark, 8);
  }
  crate(m, x, z, y = 0, s = .85) { const ry = this.r(-.3, .3); this.box(m, x, y, z, s, s, s, PAL.woodLight, { ry, cj: .1 }); this.box(m, x, y + s - .04, z, s + .04, .07, s + .04, PAL.woodDark, { ry }); }
  cart(m, x, z, ry) {
    const c = mul(m, M(x, 0, z, ry));
    this.box(c, 0, .65, 0, 1.5, .18, 2.6, PAL.wood);
    this.box(c, .72, .83, 0, .08, .45, 2.6, PAL.woodLight); this.box(c, -.72, .83, 0, .08, .45, 2.6, PAL.woodLight); this.box(c, 0, .83, -1.26, 1.5, .45, .08, PAL.woodLight);
    for (const s of [-1, 1]) { this.g.add(C10, PAL.woodDark, mul(c, M(s * .86, .55, .3, 0, .55, .12, .55, 0, Math.PI / 2)).premultiply(M(0, 0, 0)), { jitter: .02 }); this.box(c, s * .4, .1, 2.0, .08, .08, 1.9, PAL.wood, { rx: .3 }); }
    this.crate(c, .2, -.6, .83, .6); this.barrel(c, -.3, .5, .83);
  }
  fence(m, x0, z0, x1, z1) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.8)), ry = Math.atan2(x1 - x0, z1 - z0);
    for (let k = 0; k <= n; k++) { const t = k / n; this.box(m, x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, .12, 1.1 + this.r(-.1, .1), .12, PAL.woodDark, { rz: this.r(-.06, .06) }); }
    for (const y of [.45, .9]) this.box(m, (x0 + x1) / 2, y, (z0 + z1) / 2, .07, .08, L, PAL.wood, { ry, jitter: .05 });
  }
  slabs(i, j, cols = [PAL.flag1, PAL.flag2]) { // a paved square: four worn, uneven flagstones
    this.paved[j * GRID + i] = 1;
    const x0 = edge(i), z0 = edge(j), h = .75;
    for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
      const k = hash(i * 2 + a, j * 2 + b, this.seed);
      if (k < .1) continue; // missing stone: dirt shows
      const jit = () => (hash(i * 7 + a, j * 13 + b, Math.floor(this.rng() * 1e6)) - .5) * .14;
      const xa = x0 + a * h + .04, za = z0 + b * h + .04, xb = xa + h - .08, zb = za + h - .08;
      const y = .06 + hash(i + a * 3, j + b * 5, 99) * .03;
      const pts = [[xa + jit(), za + jit()], [xb + jit(), za + jit()], [xb + jit(), zb + jit()], [xa + jit(), zb + jit()]];
      const g = new THREE.BufferGeometry(), v = [];
      const [p, q, r, s] = pts;
      for (const P of [p, q, r, p, r, s]) v.push(P[0], y, P[1]);
      for (let e = 0; e < 4; e++) { const A = pts[e], Bp = pts[(e + 1) % 4]; v.push(A[0], y, A[1], A[0], 0, A[1], Bp[0], 0, Bp[1], A[0], y, A[1], Bp[0], 0, Bp[1], Bp[0], y, Bp[1]); }
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      this.g.add(g, k < .55 ? cols[0] : k < .95 ? cols[1] : PAL.stoneDark, null, { cj: .08 });
    }
  }
  // A house in its own frame: length L along x, depth D along z, door on +z.
  house(i0, j0, wq, dq, face, o = {}) {
    // footprint squares in world grid (rotated by face)
    const rot = face === 0 ? 0 : face === 1 ? Math.PI : face === 2 ? Math.PI / 2 : -Math.PI / 2;
    const fw = face < 2 ? wq : dq, fd = face < 2 ? dq : wq;
    this.mark(i0, j0, fw, fd, 1);
    const cx = edge(i0) + fw * SQ / 2, cz = edge(j0) + fd * SQ / 2;
    return this.houseAt(M(cx, 0, cz, rot), wq * SQ - .3, dq * SQ - .3, o);
  }
  // A house in frame m: length L along x, depth D along z, door on +z.
  // o: storeys, thatch, pitch, timberOnly, lantern, noChimney, footing (m of stone below 0), low (block + roof only)
  hollowHouse(m,L,D,col,dx=0) {
    const t=.22,gap=1.7,left=-L/2,right=L/2,a=dx-gap/2,b=dx+gap/2;
    this.box(m,0,0,-D/2+t/2,L,2.6,t,col);
    for(const side of [-1,1])this.box(m,side*(L/2-t/2),0,0,t,2.6,D,col);
    if(a>left)this.box(m,(left+a)/2,0,D/2-t/2,a-left,2.6,t,col);
    if(b<right)this.box(m,(b+right)/2,0,D/2-t/2,right-b,2.6,t,col);
    this.box(m,dx,2.15,D/2-t/2,gap,.45,t,col);
  }
  houseAt(m, L, D, o = {}) {
    const storeys = o.storeys ?? 2, h1 = 2.6, h2 = 2.4;
    const wallTop = h1 + Math.max(0, storeys - 1) * h2;
    const stone = o.timberOnly ? PAL.plaster2 : PAL.stone;
    if (o.footing > .15) this.box(m, 0, -o.footing, 0, L + .3, o.footing, D + .3, PAL.stoneDark, { jitter: .08 });
    if (o.low) { // far away: a block and a roof
      const uL = o.urban ? L : storeys >= 2 ? L + .4 : L, uD = o.urban ? D : storeys >= 2 ? D + .5 : D, turn = uD > uL * 1.15, rm = turn ? mul(m, M(0, 0, 0, Math.PI / 2)) : m, rL = turn ? uD : uL, rD = turn ? uL : uD, H = rD * (o.pitch ?? .95);
      const wall = o.timberOnly ? stone : storeys >= 2 ? PLASTER[Math.floor(hk(m, 3) * PLASTER.length)] : stone;
      if(o.playable){this.hollowHouse(m,L,D,wall,o.doorX||0);if(wallTop>2.6)this.box(m,0,2.6,0,uL,wallTop-2.6,uD,wall,{cj:.08});}
      else this.box(m, 0, 0, 0, uL, wallTop, uD, wall, { cj: .08, ao: Math.min(.5, 1.6 / wallTop), aoDark: .58 });
      const rc = o.thatch ? THATCH[Math.floor(hk(m, 4) * THATCH.length)] : this.rng() < .5 ? ROOFS[Math.floor(hk(m, 4) * ROOFS.length)] : ROOFS[Math.floor(hk(m, 6) * ROOFS.length)];
      this.g.add(gable(rL + (o.urban ? 0 : .9), rD + (o.urban ? .3 : 1.1), H + .5), rc, mul(rm, M(0, wallTop - .5, 0, 0, 1, 1 + (hk(m, 8) - .5) * .12)), { jitter: o.urban ? .03 : .12, cj: .14 });
      if (o.urban && !o.noChimney && hk(m, 9) < .6) { const xc = (hk(m, 10) < .5 ? -1 : 1) * (rL / 2 - .8); this.box(rm, xc, wallTop, -.3, .7, H + 1.1, .7, PAL.stoneDark, { jitter: .05 }); this.box(rm, xc, wallTop + H + .7, -.3, .74, .45, .74, SOOT); }
      return { m, L, D, dx: o.doorX||0 };
    }
    if(o.playable)this.hollowHouse(m,L,D,stone,o.doorX||0);
    else this.box(m, 0, 0, 0, L, h1, D, stone, { jitter: .07, cj: .08, ao: .5, aoDark: .55 });
    this.box(m, 0, -.2, 0, L + .2, .3, D + .2, PAL.stoneDark, { jitter: .05 }); // plinth
    let uL = L, uD = D;
    if (storeys === 2) {
      uL = L + .4; uD = D + .5;
      this.box(m, 0, h1, 0, uL, h2, uD, (this.rng(), PLASTER[Math.floor(hk(m, 3) * PLASTER.length)]), { jitter: .06, cj: .09, ao: .25, aoDark: .7 });
      // timber frame: posts, rails, braces
      const posts = Math.max(2, Math.round(uL / 1.6));
      for (let k = 0; k <= posts; k++) for (const s of [-1, 1]) this.box(m, -uL / 2 + uL * k / posts, h1, s * (uD / 2 + .02), .2, h2, .08, PAL.woodDark, { jitter: .03 });
      for (const s of [-1, 1]) { this.box(m, s * (uL / 2 + .02), h1, 0, .08, h2, uD, PAL.woodDark, { jitter: 0, cj: 0 }); this.box(m, s * (uL / 2 + .03), h1 + h2 / 2 - .1, 0, .06, .16, uD, PAL.woodDark); }
      for (const y of [h1, h1 + h2 - .18]) for (const s of [-1, 1]) this.box(m, 0, y, s * (uD / 2 + .03), uL + .05, .18, .08, PAL.woodDark, { jitter: .03 });
      for (const s of [-1, 1]) this.box(m, -uL / 2 + uL / posts * .5, h1 + .1, s * (uD / 2 + .04), .12, h2 * 1.05, .06, PAL.woodDark, { rz: s * .6 });
    }
    // gable wall and roof (steep, chunky, deep eaves, a little crooked). A deep house turns its roof:
    // the ridge runs front to back and the gable end faces the street.
    const turn = uD > uL * 1.15, rm = turn ? mul(m, M(0, 0, 0, Math.PI / 2)) : m, rL = turn ? uD : uL, rD = turn ? uL : uD;
    const span = rD, pitch = o.pitch ?? .95, H = span / 2 * pitch * 2;
    this.g.add(gable(rL, rD, H), storeys === 2 ? PAL.plaster2 : stone, mul(rm, M(0, wallTop, 0)), { jitter: .05 });
    const e = .55, a = span / 2 + e, th = o.thatch ? .45 : .26, ang = Math.atan2(H, span / 2), s = a / Math.cos(ang);
    const roofCol = (this.rng(), o.thatch ? THATCH[Math.floor(hk(m, 4) * THATCH.length)] : ROOFS[Math.floor(hk(m, 4) * ROOFS.length)]);
    const sag = this.r(-.04, .04) * 1.8;
    for (const sd of [-1, 1]) {
      const zc = sd * (a / 2 - e / 2 + e / 2) * 1, yc = wallTop + H / 2 - (e * Math.tan(ang)) / 2 + th / 2;
      this.cbox(rm, 0, yc, sd * (a / 2), rL + .9, th, s, roofCol, { rx: sd * ang, rz: sag, jitter: o.thatch ? .2 : .14, cj: .12 });
      // shingle courses: a few thin strips so the roof reads as layered
      if (!o.thatch) for (let k = 1; k < 4; k++) { const t = k / 4, zz = sd * a * (1 - t), yy = wallTop + H * t - e * Math.tan(ang) * (1 - t) + th + .01; this.cbox(rm, 0, yy, zz, rL + .92, .07, .14, PAL.shingle, { rx: sd * ang, jitter: .06 }); }
      void zc;
    }
    this.cbox(rm, 0, wallTop + H + th * .6 - .04, 0, rL + 1.0, .2, .3, PAL.woodDark, { rz: sag * 1.3, jitter: .08 }); // ridge, sagging
    // moss on the shaded lower courses of old roofs
    if (!o.thatch && hk(m, 11) < .45) for (let q = 0; q < 2 + Math.floor(hk(m, 12) * 4); q++) {
      const sd = hk(m, 20 + q) < .5 ? -1 : 1, u = .55 + hk(m, 30 + q) * .35, x = (hk(m, 40 + q) - .5) * (rL - 1);
      this.g.add(ICO1, MOSS[q % MOSS.length], mul(rm, M(x, wallTop + H + th - a * u * Math.tan(ang) + .04, sd * a * u, hk(m, 50 + q) * 3, .9 + hk(m, 60 + q), .16, .7, sd * ang, 0)), { jitter: .1, cj: .1 });
    }
    // chimney
    if (!o.noChimney) { const xc = (this.rng() < .5 ? -1 : 1) * (rL / 2 - .7); this.box(rm, xc, wallTop, -.35, .75, H + 1.3, .75, PAL.stoneDark, { jitter: .06 }); this.box(rm, xc, wallTop + H + .75, -.35, .78, .55, .78, SOOT, { jitter: .03 }); this.box(rm, xc, wallTop + H + 1.25, -.35, .9, .15, .9, PAL.stoneDark); }
    // door, step, lantern
    const rolledDoor=this.r(-L / 2 + .9, L / 2 - .9),dx=o.doorX??rolledDoor;
    if(!o.playable)this.box(m, dx, 0, D / 2, 1.0, 2.05, .12, PAL.woodDark);
    this.box(m, dx, 2.05, D / 2, 1.25, .2, .16, PAL.stoneDark);
    this.box(m, dx, -.05, D / 2 + .35, 1.2, .12, .6, PAL.stoneDark);
    if (o.lantern !== false && this.rng() < .7 && (o.lantern === true || hk(m, 13) < .18)) {
      const lx = dx + (dx > 0 ? -.9 : .9);
      this.box(m, lx, 2.25, D / 2, .05, .05, .5, PAL.iron);
      this.box(m, lx, 1.95, D / 2 + .45, .22, .3, .22, PAL.iron);
      this.gl.add(B1, PAL.window, mul(m, M(lx, 2.0, D / 2 + .45, 0, .16, .2, .16)), { cj: 0 });
      this.ha.add(ICO1, PAL.halo, mul(m, M(lx, 2.1, D / 2 + .45, 0, .9, .9, .9)), { cj: 0 });
      const v = new THREE.Vector3(lx, 2.1, D / 2 + .5).applyMatrix4(m); this.lights.push(v);
    }
    // windows: some lit, some dark, all with shutters
    const win = (x, y, front, faceZ) => {
      const z = faceZ + .03, lit = this.rng() < .65;
      const mm = mul(m, M(x, y, front ? z : -z, front ? 0 : Math.PI));
      (lit ? this.windows : this.g).add(PLANE, lit ? PAL.window : PAL.woodDark, mul(mm, M(0, 0, 0, 0, .6, .75, 1)), { cj: .1 });
      for (const s of [-1, 1]) this.g.add(BC, PAL.wood, mul(mm, M(s * .45, 0, .03, 0, .28, .8, .05)), { cj: .1 });
      this.g.add(BC, PAL.woodDark, mul(mm, M(0, -.42, .04, 0, .8, .08, .1)));
    };
    for (const front of [true, false]) {
      const n1 = Math.max(1, Math.floor(L / 2.2));
      for (let k = 0; k < n1; k++) { const x = -L / 2 + L * (k + .5) / n1; if (front && Math.abs(x - dx) < 1.0) continue; if (this.rng() < .8) win(x, 1.35, front, D / 2); }
      if (storeys === 2) { const n2 = Math.max(1, Math.floor(uL / 1.9)); for (let k = 0; k < n2; k++) if (this.rng() < .85) win(-uL / 2 + uL * (k + .5) / n2, h1 + 1.25, front, uD / 2); }
    }
    return { m, L, D, dx };
  }
  awning(m, L, D, dx) { // torn canvas on two poles in front of a door
    const out = 1.6, x0 = dx;
    for (const s of [-1, 1]) this.cyl(m, x0 + s * 1.1, 0, D / 2 + out, .05, 2.1, PAL.wood, 5);
    for (let k = 0; k < 5; k++) {
      const len = this.r(1.3, 1.85), x = x0 - 1.1 + .22 + k * .44;
      this.cbox(m, x, 2.25 - len * .12, D / 2 + len / 2, .44, .03, len, k % 2 ? PAL.canvas : PAL.canvasDark, { rx: .28, jitter: .03, cj: .1 });
    }
  }
  barrels(m, x, z) { const n = this.ri(1, 3); for (let k = 0; k < n; k++) this.barrel(m, x + (k % 2) * .8, z + Math.floor(k / 2) * .8); if (this.rng() < .5) this.crate(m, x - .9, z); }
  ground(fn) { // flat-shaded ground squares, slightly above the flattened terrain
    const n = GRID + 4, g = new THREE.PlaneGeometry(n * SQ, n * SQ, n, n).rotateX(-Math.PI / 2).translate(0, .03, 0);
    this.g.add(g, (x, y, z) => fn(x, z), null, { cj: .05 });
  }
  geometry(cut = true) {
    const group = new THREE.Group();
    for(const mesh of this.propMeshes||[])group.add(mesh);
    if (!this.g.empty) group.add(this.g.mesh(cut ? MAT.solidCut : MAT.solid));
    if (!this.gl.empty) group.add(this.gl.mesh(cut ? MAT.glowCut : MAT.glow));
    if (!this.windows.empty) group.add(this.windows.mesh(cut ? MAT.windowCut : MAT.window));
    if (!this.ha.empty) { const h = this.ha.mesh(cut ? MAT.haloCut : MAT.halo); h.renderOrder = 2; group.add(h); }
    return group;
  }
}
const mul = (a, b) => a ? a.clone().multiply(b) : b;

// ---------- roads into places ----------
// Where world roads cross this place's map edge, in the place's own (possibly turned) frame.
// side: 'W' (x = -30 m), 'E' (x = +30), 'N' (z = -30), 'S' (z = +30); k: square index along that edge.
export function roadEntries(world, p, theta = 0) {
  const H = MAP / 2, c = Math.cos(theta), s = Math.sin(theta), out = [];
  const loc = ([x, z]) => { const dx = x - p.x, dz = z - p.z; return [dx * c - dz * s, dx * s + dz * c]; };
  const add = (side, along) => { const k = Math.max(1, Math.min(GRID - 2, Math.floor((along + H) / SQ))); if (!out.some(e => e.side === side && Math.abs(e.k - k) < 4)) out.push({ side, k }); };
  for (const road of world.data.roads) for (let n = 0; n + 1 < road.pts.length; n++) {
    const [ax, az] = loc(road.pts[n]), [bx, bz] = loc(road.pts[n + 1]);
    for (const [side, L, onX] of [['W', -H, true], ['E', H, true], ['N', -H, false], ['S', H, false]]) {
      const a0 = onX ? ax : az, b0 = onX ? bx : bz; if (a0 === b0) continue;
      const t = (L - a0) / (b0 - a0); if (t < 0 || t > 1) continue;
      const other = onX ? az + (bz - az) * t : ax + (bx - ax) * t;
      if (Math.abs(other) <= H) add(side, other);
    }
  }
  return out;
}
// Square at step s inward from an entry, and the unit steps inward / along the edge.
function entryFrame(e) {
  switch (e.side) {
    case 'W': return { i: 0, j: e.k, di: 1, dj: 0, ai: 0, aj: 1 };
    case 'E': return { i: GRID - 1, j: e.k, di: -1, dj: 0, ai: 0, aj: 1 };
    case 'N': return { i: e.k, j: 0, di: 0, dj: 1, ai: 1, aj: 0 };
    default: return { i: e.k, j: GRID - 1, di: 0, dj: -1, ai: 1, aj: 0 };
  }
}
const inGrid = (i, j) => i >= 0 && j >= 0 && i < GRID && j < GRID;
// A town street from the map edge straight in until it meets a paved street. Worn earth at the edge, flagstones inside.
function streetIn(b, e, w = 3) {
  const f = entryFrame(e), half = Math.floor(w / 2);
  for (let st = 0; st < GRID; st++) {
    const cells = []; for (let q = -half; q < w - half; q++) cells.push([f.i + f.di * st + f.ai * q, f.j + f.dj * st + f.aj * q]);
    if (st > 0 && cells.some(([i, j]) => inGrid(i, j) && b.occ[j * GRID + i] === 2)) break;
    for (const [i, j] of cells) { if (!inGrid(i, j)) continue; b.mark(i, j, 1, 1, 2); if (st < 3) b.track[j * GRID + i] = 1; else b.slabs(i, j); }
  }
}
// An earth track straight from where the road enters to a target square (a green, a gate). Stops within stop squares.
function trackTo(b, e, ti, tj, w = 2, stop = 0) {
  const f = entryFrame(e), n = Math.max(Math.abs(ti - f.i), Math.abs(tj - f.j));
  for (let s = 0; s <= n; s++) {
    const i = Math.round(f.i + (ti - f.i) * s / n), j = Math.round(f.j + (tj - f.j) * s / n);
    if (Math.max(Math.abs(i - ti), Math.abs(j - tj)) < stop) break;
    for (let q = 0; q < w; q++) for (let r = 0; r < w; r++) { const a = i + q - (w >> 1), c = j + r - (w >> 1); if (inGrid(a, c) && !b.occ[c * GRID + a]) { b.track[c * GRID + a] = 1; b.occ[c * GRID + a] = 3; } }
  }
}

const dirtFn = (b, grassBias = 0) => (cx, cz) => {
  const i = Math.floor(cx / SQ + GRID / 2), j = Math.floor(cz / SQ + GRID / 2), x = (i - GRID / 2 + .5) * SQ, z = (j - GRID / 2 + .5) * SQ;
  const inside = i >= 0 && j >= 0 && i < GRID && j < GRID;
  const n = fbm(x / 9 + b.seed % 100, z / 9, 2) + grassBias + (hash(i, j, 3) - .5) * .25;
  if (inside && b.track[j * GRID + i]) return hash(i, j, 17) < .12 ? PAL.dirt : PAL.road;
  if (inside && b.dirt[j * GRID + i]) return n > .35 ? PAL.grass : PAL.dirt;
  if (inside && b.paved[j * GRID + i]) return PAL.dirt;
  return n < -.2 ? PAL.dirt : PAL.grass;
};

function keep(b) {
  for (const e of b.entries) trackTo(b, e, 20, 37, 3, 0);
  const lo = 5, hi = 35, x0 = edge(lo), x1 = edge(hi), H = 6.2;
  const wall = (ax, az, bx, bz) => { // stone curtain wall with merlons on the outer edge
    const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    b.box(null, mx, 0, mz, 1.6, H, L, PAL.stone, { ry, jitter: .1, cj: .07 });
    b.box(null, mx, H - .1, mz, 1.75, .25, L, PAL.stoneDark, { ry, jitter: .06 });
    const n = Math.floor(L / 1.5), ux = (bx - ax) / L, uz = (bz - az) / L;
    for (let k = 0; k < n; k++) if (k % 2 === 0) { const t = (k + .5) * 1.5; for (const s of [-1, 1]) b.box(null, ax + ux * t + uz * .6 * s, H, az + uz * t - ux * .6 * s, .7, .8, .45, PAL.stone, { ry, jitter: .05 }); }
  };
  const gap = [edge(18), edge(22)];
  wall(x0, x0, x1, x0); wall(x0, x0, x0, x1); wall(x1, x0, x1, x1);
  wall(x0, x1, gap[0], x1); wall(gap[1], x1, x1, x1);
  b.mark(lo - 1, lo - 1, 32, 2); b.mark(lo - 1, hi - 1, 32, 2); b.mark(lo - 1, lo - 1, 2, 32); b.mark(hi - 1, lo - 1, 2, 32);
  const tower = (x, z, r, h) => {
    b.cyl(null, x, 0, z, r, h, PAL.stone, 10, { jitter: .1 });
    b.cyl(null, x, h - .1, z, r + .2, .3, PAL.stoneDark, 10);
    for (let k = 0; k < 8; k++) { const a = k * .785; b.box(null, x + Math.cos(a) * r, h, z + Math.sin(a) * r, .7, .85, .5, PAL.stone, { ry: -a, jitter: .05 }); }
    for (let k = 0; k < 3; k++) { const a = b.r(0, 6.28); b.g.add(PLANE, PAL.woodDark, M(x + Math.cos(a) * (r + .02), b.r(2.5, h - 2), z + Math.sin(a) * (r + .02), Math.PI / 2 - a, .18, .7, 1)); }
  };
  for (const [x, z] of [[x0, x0], [x1, x0], [x0, x1], [x1, x1]]) tower(x, z, 2.9, 9.5);
  for (const x of gap) tower(x + (x < 0 ? -2.1 : 2.1), x1, 2.1, 8.2);
  b.box(null, 0, 4.4, x1, gap[1] - gap[0] + 1, 2.2, 1.9, PAL.stone, { jitter: .08 }); // arch over the gate
  for (const s of [-1, 1]) b.box(null, s * 1.9, 0, x1 + 1.6, 2.1, 3.9, .18, PAL.woodDark, { ry: s * 1.2 }); // gate leaves, open
  b.flame(null, -3.6, 3.0, x1 + 1.2, 1); b.flame(null, 3.6, 3.0, x1 + 1.2, 1);
  for (const s of [-1, 1]) { b.box(null, s * 3.6, 2.6, x1 + 1.0, .08, .08, .5, PAL.iron); }
  // the keep
  const ki = 14, kj = 9, kw = 12, kd = 12, kx = edge(ki) + kw * SQ / 2, kz = edge(kj) + kd * SQ / 2, KH = 15;
  b.mark(ki, kj, kw, kd);
  b.box(null, kx, 0, kz, kw * SQ, KH, kd * SQ, PAL.stone, { jitter: .12, cj: .07 });
  b.box(null, kx, -.2, kz, kw * SQ + .8, 1.2, kd * SQ + .8, PAL.stoneDark, { jitter: .1 });
  b.box(null, kx, KH - .1, kz, kw * SQ + .4, .35, kd * SQ + .4, PAL.stoneDark);
  for (let k = 0; k < kw; k += 2) for (const s of [-1, 1]) { b.box(null, edge(ki + k) + .75, KH, kz + s * (kd * SQ / 2), .8, 1, .5, PAL.stone); b.box(null, kx + s * (kw * SQ / 2), KH, edge(kj + k) + .75, .5, 1, .8, PAL.stone); }
  for (let k = 0; k < 5; k++) { const y = 4 + (k % 3) * 3.5, x = kx + (k - 2) * 3.4; b.gl.add(PLANE, PAL.window, M(x, y, kz + kd * SQ / 2 + .03, 0, .25, .9, 1), { cj: .1 }); }
  b.box(null, kx, 0, kz + kd * SQ / 2, 2.0, 3.0, .2, PAL.woodDark); b.box(null, kx, 3, kz + kd * SQ / 2, 2.6, .35, .3, PAL.stoneDark);
  for (let k = 0; k < 3; k++) b.box(null, kx, k * .2 - .1, kz + kd * SQ / 2 + .5 + k * .45, 3.2 - k * .3, .25, .5, PAL.stoneDark);
  // path from gate to door, braziers, stores
  for (let j = kj + kd; j < hi; j++) for (let i = 18; i < 22; i++) b.slabs(i, j);
  for (const [i, j] of [[16, 24], [23, 24], [16, 31], [23, 31]]) b.brazier(null, sqX(i), sqX(j));
  b.barrels(null, sqX(8), sqX(9)); b.barrels(null, sqX(30), sqX(30)); b.crate(null, sqX(9), sqX(31)); b.crate(null, sqX(9.7), sqX(31.6), 0, .7);
  b.cart(null, sqX(29), sqX(12), .2);
  for (let k = 0; k < 4; k++) b.cyl(null, sqX(8) + k * .35, 0, sqX(20), .03, 2.2, PAL.woodLight, 5, { rz: -.2 }); // spear rack
  b.box(null, sqX(8.5), 1.3, sqX(20), 1.6, .08, .1, PAL.woodDark);
  for (let j = lo; j < hi; j++) for (let i = lo; i < hi; i++) if (!b.paved[j * GRID + i]) b.dirt[j * GRID + i] = fbm(i / 4, j / 4, 2) < .2 ? 1 : 0;
  b.ground(dirtFn(b, -.3));
}

function camp(b) {
  for (const e of b.entries) trackTo(b, e, 20, 37, 2, 0);
  const R = 25, gapA = Math.PI / 2;
  for (let a = 0; a < Math.PI * 2; a += .45 / R) {
    if (Math.abs(((a - gapA + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < .13) continue;
    const x = Math.cos(a) * (R + b.r(-.1, .1)), z = Math.sin(a) * (R + b.r(-.1, .1)), h = b.r(2.7, 3.4);
    b.cyl(null, x, 0, z, .21, h, PAL.wood, 6, { rx: b.r(-.04, .04), jitter: .03 });
    b.g.add(CONE5, PAL.woodLight, M(x, h, z, 0, .21, .5, .21), {});
  }
  const fx = 0, fz = 0;
  for (let k = 0; k < 10; k++) { const a = k * .628; b.rock(null, fx + Math.cos(a) * 1.3, .05, fz + Math.sin(a) * 1.3, .35, PAL.stoneDark); }
  for (let k = 0; k < 4; k++) b.g.add(C6, PAL.woodDark, M(fx, .2, fz, k * .8, .13, 1.8, .13, 0, Math.PI / 2).multiply(M(0, -.5, 0)), {});
  b.flame(null, fx, .2, fz, 3.0, 2.6); b.flame(null, fx + .4, .2, fz + .3, 2.0, .01);
  const n = b.ri(6, 8);
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2 + .3, r = b.r(11, 16), x = Math.cos(a) * r, z = Math.sin(a) * r, ry = -a + Math.PI / 2;
    if (Math.abs(((a - gapA + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < .35) continue;
    if (k % 3 === 2) { b.g.add(CONE8, PAL.canvas, M(x, 0, z, b.r(0, 6), 2.2, 3.2, 2.2), { jitter: .15, cj: .1 }); b.cyl(null, x, 0, z, .05, 3.6, PAL.woodDark, 5); }
    else {
      b.g.add(gable(3.6, 2.7, 2.2), k % 2 ? PAL.canvas : PAL.canvasDark, M(x, 0, z, ry + Math.PI / 2), { jitter: .12, cj: .1 });
      b.box(null, x, 2.15, z, .08, .08, 4.0, PAL.woodDark, { ry: ry + Math.PI / 2 + Math.PI / 2 });
      b.crate(null, x + Math.cos(a) * 2.6, z + Math.sin(a) * 2.6);
    }
  }
  for (let k = 0; k < 4; k++) { const a = k * 1.57 + .7; b.g.add(C8, PAL.wood, M(Math.cos(a) * 3.4, .25, Math.sin(a) * 3.4, a, .26, 2.0, .26, 0, Math.PI / 2).multiply(M(0, -.5, 0)), { jitter: .03 }); }
  b.torch(null, -3.5, R - .5); b.torch(null, 3.5, R - .5);
  b.barrels(null, -8, -4); b.barrels(null, 7, -9);
  b.ground(dirtFn(b, .1));
}

function ruin(b) {
  for (const e of b.entries) trackTo(b, e, 19, 23, 2, 1);
  const wallRun = (i0, j0, i1, j1, maxH) => {
    const n = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0));
    for (let k = 0; k <= n; k++) {
      const i = i0 + Math.sign(i1 - i0) * k, j = j0 + Math.sign(j1 - j0) * k;
      const hk = hash(i, j, b.seed);
      if (hk < .18) { b.rock(null, sqX(i) + b.r(-1, 1), 0, sqX(j) + b.r(-1, 1), b.r(.3, .6), PAL.stone); continue; }
      const h = .4 + hk * hk * maxH;
      b.box(null, sqX(i), 0, sqX(j), 1.55, h, 1.55, PAL.stone, { jitter: .18, cj: .1 });
      if (h > 1.5 && hk > .5) b.box(null, sqX(i) + b.r(-.3, .3), h, sqX(j), .8, b.r(.2, .7), .9, PAL.stoneLight, { jitter: .2 });
      b.mark(i, j, 1, 1);
    }
  };
  wallRun(10, 9, 29, 9, 5.5); wallRun(10, 9, 10, 22, 4.5); wallRun(29, 9, 29, 22, 5); wallRun(10, 22, 16, 22, 3); wallRun(23, 22, 29, 22, 3.5);
  wallRun(23, 27, 32, 27, 2.5); wallRun(32, 27, 32, 34, 2.5);
  for (let k = 0; k < 4; k++) { const x = sqX(14 + k * 4), z = sqX(15.5), h = b.r(.6, 3.5); b.cyl(null, x, 0, z, .45, h, PAL.stoneLight, 8, { jitter: .08 }); }
  for (let k = 0; k < 40; k++) b.rock(null, sqX(b.r(6, 34)), 0, sqX(b.r(6, 34)), b.r(.15, .5), k % 3 ? PAL.stone : PAL.rock);
  const dx = sqX(6), dz = sqX(30);
  b.cyl(null, dx, 0, dz, .2, 4.5, PAL.deadwood, 5, { r2: .25, jitter: .08 });
  b.g.add(C6, PAL.deadwood, M(dx, 2.6, dz, 0, .07, 2, .07, 0, -.9), {}); b.g.add(C6, PAL.deadwood, M(dx, 3.4, dz, 1.4, .06, 1.6, .06, 0, .8), {});
  for (let j = 10; j < 22; j++) for (let i = 11; i < 29; i++) if (hash(i, j, 5) < .45 && !b.occ[j * GRID + i]) b.slabs(i, j, [PAL.stoneDark, PAL.flag2]);
  b.ground(dirtFn(b, .35));
}

// Sites share the unit frame: +z faces the first road; tracks meet every entry.
function siteGround(b, ti = 20, tj = 27) {
  for (const e of b.entries) trackTo(b, e, ti, tj, 3);
  b.ground(dirtFn(b, -.1));
}
function woodpile(b, m, x, z) {
  for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row; k++)
    b.cyl(m, x + (k + row * .5) * .45, .25 + row * .4, z, .23, 2.6, PAL.deadwood, 6, { rx: Math.PI / 2, jitter: .03 });
}
function tower(b) {
  const H = b.r(12, 14);
  b.box(null, 0, 0, 0, 6.5, 1, 6.5, PAL.stoneDark);
  for (const x of [-2.5, 2.5]) for (const z of [-2.5, 2.5]) {
    b.box(null, x, .6, z, .5, H, .5, PAL.woodDark, { rz: b.r(-.015, .015) });
    b.box(null, 0, 2, z, .22, H - 2, .25, PAL.wood, { rz: x > 0 ? .38 : -.38 });
  }
  for (let y = 4; y < H; y += 4) b.box(null, 0, y, 0, 5.6, .24, 5.6, PAL.woodDark);
  b.box(null, 0, H, 0, 7, .3, 7, PAL.wood);
  for (const side of [-1, 1]) {
    b.fence(M(0, H + .3, 0), -3.3, side * 3.3, 3.3, side * 3.3);
    b.fence(M(0, H + .3, 0), side * 3.3, -3.3, side * 3.3, 3.3);
    b.box(null, side * .7, 0, 3, .13, H + .5, .14, PAL.wood, { rx: -.08 });
  }
  for (let y = .4; y < H + .3; y += .4) b.box(null, 0, y, 3 - y * .08, 1.5, .1, .12, PAL.woodLight);
  b.brazier(M(0, H + .3, 0), 0, -1);
  for (const x of [9, 14]) b.box(null, x, 0, -2, .2, 2.8, .2, PAL.woodDark);
  b.box(null, 11.5, 0, -6, 5.4, 3.8, .25, PAL.wood);
  b.cbox(null, 11.5, 3.3, -4, 6, .25, 5.8, PAL.shingle, { rx: .23 });
  woodpile(b, null, 10, -5); b.barrel(null, 14, 0);
  siteGround(b);
}
function wizard(b) {
  for (let k = 0; k < 6; k++) {
    const y = k * 3.2, r = 3.8 - k * .22;
    b.cyl(null, 0, y, -4, r, 3.3, PAL.stone, 10, { jitter: .025 });
    b.cyl(null, 0, y, -4, r + .15, .2, PAL.stoneDark, 10);
    const a = k * .7, m = M(Math.sin(a) * (r + .04), y + 1.5, -4 + Math.cos(a) * (r + .04), a);
    b.g.add(PLANE, PAL.woodDark, m.clone().multiply(M(0, 0, 0, 0, .8, 1.4, 1)));
    b.gl.add(PLANE, PAL.window, m.clone().multiply(M(0, 0, .02, 0, .35, 1.1, 1)));
  }
  b.g.add(CONE8, PAL.slate, M(0, 19.2, -4, .1, 3.8, 6, 3.8), { jitter: .025 });
  b.gl.add(ICO, PAL.crystal, M(0, 25.7, -4, 0, .65, .65, .65));
  b.box(null, 0, 0, -.15, 1.3, 2.6, .2, PAL.woodDark);
  for (const x of [-13, 13]) b.box(null, x, 0, 7, .65, 1.8, 18, PAL.stone, { jitter: .07 });
  b.box(null, 0, 0, -2, 26, 1.8, .6, PAL.stone);
  for (const x of [-8, 8]) b.box(null, x, 0, 16, 10, 1.8, .6, PAL.stone);
  for (const x of [-8, 8]) for (let z = 3; z < 13; z += 3) {
    b.box(null, x, .05, z, 4, .14, 2, PAL.dirt);
    for (let k = 0; k < 4; k++) b.rock(null, x - 1.5 + k, .3, z, .35, PAL.bush);
  }
  for (const x of [-18, 18]) b.g.add(CONE5, PAL.crystal, M(x, 0, 2, .4, 1, b.r(3, 5), 1, .15), { jitter: .12 });
  siteGround(b, 20, 32);
}
// A recessed mouth, open at the front and above its threshold: no solid rock across it.
function rockMouth(b, mine = false) {
  for (const side of [-1, 1]) {
    b.g.add(DOD, PAL.rock, M(side * 8, 4, -6, side * .2, 7, 8, 10), { jitter: .2 });
    b.g.add(DOD, PAL.stoneDark, M(side * 4.3, 2.5, 0, side * .3, 2.4, 4, 5), { jitter: .2 });
  }
  b.g.add(DOD, PAL.rock, M(0, 8.5, -10, .2, 10, 4, 9), { jitter: .2 });
  b.box(null, 0, .05, 1, 6, .08, 12, PAL.void, { jitter: 0 });
  b.box(null, 0, .1, -6, 6, 6, .3, PAL.void, { jitter: 0 });
  if (mine) {
    for (const x of [-3.1, 3.1]) b.box(null, x, 0, 1, .55, 5, .65, PAL.woodDark);
    b.box(null, 0, 4.6, 1, 7.2, .65, .7, PAL.wood);
  }
}
function mine(b) {
  rockMouth(b, true);
  for (const x of [-2.8, 2.8]) for (const z of [3, 7]) b.box(null, x, 0, z, .4, 9, .4, PAL.woodDark, { rz: x * -.02 });
  b.box(null, 0, 8, 5, 7, .5, 5, PAL.wood);
  const wheel = new THREE.TorusGeometry(1.7, .16, 4, 12);
  b.g.add(wheel, PAL.iron, M(0, 9, 5)); wheel.dispose();
  for (let k = 0; k < 6; k++) b.cbox(null, 0, 9, 5, .12, 3.4, .12, PAL.wood, { rz: k * Math.PI / 3 });
  b.box(null, 0, 1, 5, .06, 8, .06, PAL.iron);
  for (const x of [-.8, .8]) b.box(null, x, .18, 12, .12, .12, 30, PAL.iron);
  for (let z = -2; z < 27; z += 1.3) b.box(null, 0, .06, z, 2.3, .15, .25, PAL.woodDark);
  for (const z of [11, 20]) {
    b.box(null, 0, .5, z, 1.5, .18, 2.2, PAL.woodDark);
    for (const x of [-.72, .72]) {
      b.box(null, x, .65, z, .12, .8, 2.2, PAL.iron);
      for (const dz of [-.7, .7]) b.cyl(null, x, .4, z + dz, .3, .15, PAL.iron, 8, { rz: Math.PI / 2 });
    }
    for (const dz of [-1, 1]) b.box(null, 0, .65, z + dz, 1.5, .8, .12, PAL.wood);
    for (let k = 0; k < 6; k++) b.rock(null, b.r(-.5, .5), 1, z + b.r(-.7, .7), .4, PAL.rock);
  }
  for (const [x, z] of [[-19, 5], [18, 10], [-18, 18]]) b.houseAt(M(x, 0, z, x > 0 ? -.5 : .5), 6, 5, { storeys: 1, timberOnly: true, noChimney: true, lantern: false });
  for (let k = 0; k < 12; k++) b.rock(null, 14 + b.r(-4, 4), .2, -12 + b.r(-4, 4), b.r(1, 2.5), PAL.stoneDark);
  b.box(null, 2.5, 2.8, 1.5, .35, .6, .35, PAL.iron);
  b.gl.add(B1, PAL.window, M(2.5, 2.9, 1.5, 0, .25, .35, .25));
  siteGround(b, 20, 36);
}
function cave(b) {
  rockMouth(b);
  for (let k = 0; k < 16; k++) {
    const m = M(b.r(-9, 9), .16, b.r(7, 20), b.r(0, 6));
    b.cbox(m, 0, 0, 0, .12, .12, b.r(.5, 1), PAL.plaster);
    for (const z of [-.4, .4]) b.g.add(ICO, PAL.plaster, m.clone().multiply(M(0, 0, z, 0, .18, .15, .13)));
  }
  for (let k = 0; k < 9; k++) { const a = k * Math.PI * 2 / 9; b.rock(null, Math.cos(a) * 1.5, .1, 15 + Math.sin(a) * 1.5, .3, PAL.stoneDark); }
  b.cyl(null, 0, .06, 15, 1.2, .04, PAL.void, 10);
  for (let k = 0; k < 3; k++) b.cbox(null, 0, .2, 15, .2, .18, 2, PAL.woodDark, { ry: k * 1.1 });
  siteGround(b, 20, 30);
}
function shrine(b) {
  for (let k = 0; k < 11; k++) {
    const a = k * Math.PI * 2 / 12 + .5, h = b.r(3, 5.5), x = Math.sin(a) * 11, z = Math.cos(a) * 11;
    b.box(null, x, 0, z, b.r(1, 1.6), h, b.r(.8, 1.4), k % 3 ? PAL.stone : PAL.stoneDark, { ry: a, rx: b.r(-.12, .12), rz: b.r(-.12, .12), jitter: .1 });
  }
  for (const x of [-1.4, 1.4]) b.box(null, x, 0, 0, .8, 1.2, 1.5, PAL.stoneDark);
  b.box(null, 0, 1.2, 0, 4, .45, 2.2, PAL.stoneLight, { jitter: .06 });
  for (let k = 0; k < 7; k++) {
    const x = b.r(-1.7, 1.7), z = b.r(-.8, .8), h = b.r(.2, .5);
    b.cyl(null, x, 1.65, z, .08, h, PAL.canvas, 6);
    b.flame(null, x, 1.65 + h, z, .25, .05);
  }
  b.houseAt(M(-18, 0, -15, .3), 7, 6, { storeys: 1, noChimney: true, pitch: 1.2 });
  b.box(null, -18, 6, -15, .2, 2, .2, PAL.woodDark);
  b.box(null, -18, 7.2, -15, 1.4, .2, .2, PAL.woodDark);
  for (let j = 21; j < 30; j++) for (let i = 19; i < 22; i++) b.slabs(i, j);
  siteGround(b, 20, 30);
}

// Walled or fenced units that stand at a settlement's centre, in a 60 m frame with the gate on +z.
export const UNITS = { keep, camp, ruin, tower, wizard, mine, cave, shrine };
export const PLACE_KINDS = ['town', 'village', 'keep', 'camp', 'ruin', 'tower', 'wizard', 'mine', 'cave', 'shrine'];

// A token is a picture coin (tokens.js), as in GeezSheets.
export const tokenMesh = t => tokenCoin(t);

