// Turns a recipe into voxels. Pure data in, pure data out (no three.js), so it runs in Node tests and in the page.
// Layout (y up, +z is the front the face looks toward, x mirrored about the line between -1 and 0):
//   boots 0..boot, legs/skirt up to waist, torso waist..top (top = shoulder row), head 16 tall above it.
import { Grid, mx, hash, shade, mix } from './voxels.js';
import * as P from './parts.js';
import { normalize } from './recipe.js';

const LASH = '#2a1b1d', EYE_WHITE = '#f6f6fb', PUPIL = '#0e0e18', LEATHER = '#5b3a22', WOOD = '#7a5636', WOOD_D = '#573b24', TEETH = '#f1ece0';

export function buildCharacter(input) {
  const r = normalize(input), R = P.RACES[r.race];
  const woman = r.gender === 'woman';
  const D = {
    waist: R.legH, hw: Math.max(4, R.hw - (woman ? 1 : 0)), td: R.td, boot: R.boot,
    top: R.legH + R.torsoH - 1, headY0: R.legH + R.torsoH,
  };
  D.sx = D.hw + 1;                                   // outer x of the shoulder yoke, where the arms start
  D.arm = D.waist + 2;                               // bottom of the sleeves: hands hang at the hips, so the arms are a third shorter
  const g = new Grid(), meta = { orb: null, headY0: D.headY0, top: D.top, height: 0 };
  const C = colours(r);
  boots(g, r, D, C);
  if (r.outfit === 'robe') robe(g, D, C); else if (r.outfit === 'tunic') tunic(g, D, C); else armor(g, D, C);
  hands(g, r, D, C);
  head(g, r, D, C);
  hair(g, r, D, C);
  face(g, r, D, C);
  beard(g, r, D, C);
  raceFeatures(g, r, D, C);
  marks(g, r, D, C);
  headgear(g, r, D, C);
  weapon(g, r, D, C, meta);
  for (const k of [...g.m.keys()]) if (+k.split(',')[1] < 0) g.m.delete(k);   // nothing below the floor
  meta.height = Math.max(...[...g.m.keys()].map((k) => +k.split(',')[1])) + 1;
  return { voxels: g.m, meta, recipe: r };
}

function colours(r) {
  const skin = P.SKINS[r.race][r.skin], hairHex = P.HAIR_COLORS[r.hairColor];
  const pri = P.CLOTH[r.primary], sec = P.CLOTH[r.secondary], metal = P.METALS[r.metal], trim = P.METALS[r.trim];
  return {
    skin, skinShade: shade(skin, 0.82), skinLight: shade(skin, 1.1), blush: mix(skin, '#d86a6a', 0.42), lid: shade(skin, 0.72),
    hair: hairHex, beard: r.beardColor === 'same' ? hairHex : P.HAIR_COLORS[r.beardColor],
    pri, priD: shade(pri, 0.62), priL: shade(pri, 1.2), sec, secD: shade(sec, 0.62), secL: shade(sec, 1.2),
    metal, metalD: shade(metal, 0.7), metalL: shade(metal, 1.18), trim, trimD: shade(trim, 0.72),
    pants: shade(mix(sec, '#2a2a34', 0.55), 1), boot: '#4a2e22', bootD: '#2e1c15', bootL: '#6a4636',
    eye: P.EYE_COLORS[r.eyeColor], paint: P.PAINTS[r.paint], magic: P.MAGIC[r.magic],
    lip: r.gender === 'woman' ? '#cc5a6a' : '#b4505a', lip2: r.gender === 'woman' ? '#e07a86' : '#d8707a',
  };
}

// ---------------------------------------------------------------- body
function boots(g, r, D, C) {
  const R = P.RACES[r.race], toe = R.bigFeet ? 7 : 6, mat = r.outfit === 'armor' ? C.metalD : C.boot;
  g.sym(-6, 0, -3, -2, D.boot, toe, (x, y, z) => (y <= 0 ? C.bootD : z >= 4 && y <= 2 ? (r.outfit === 'armor' ? C.metal : C.bootL) : mat));
}

function robe(g, D, C) {
  const { waist, top, hw, td, boot, sx } = D;
  for (let y = boot; y < waist; y++) {
    const t = (y - boot) / Math.max(1, waist - 1 - boot), w = Math.round(hw + 2 - 2 * t), zh = Math.round(td + 1 - t);
    for (let x = -w; x <= w - 1; x++) for (let z = -zh; z <= zh; z++) {
      let c = (x + 16) % 5 === 0 ? C.priD : C.pri;
      if (y <= boot + 1) c = (x + y) % 2 ? C.trim : C.trimD;
      else if (z === zh && (x === -2 || x === 1)) c = C.trim;
      else if (z === zh && (x === -1 || x === 0)) c = C.priD;
      g.set(x, y, z, c);
    }
  }
  for (let y = waist; y <= top; y++) {
    const sh = y >= top - 2, x0 = sh ? -(hw + 1) : -hw, x1 = sh ? hw : hw - 1;
    for (let x = x0; x <= x1; x++) for (let z = -td; z <= td; z++) {
      let c = sh ? C.secL : (x + 16) % 5 === 0 ? C.priD : C.pri;
      if (y <= waist + 1) c = LEATHER;
      if (y <= waist + 1 && z === td && x >= -2 && x <= 1) c = (x === -1 || x === 0) && y === waist ? C.trimD : C.trim;
      else if (y > waist + 1 && z === td && (x === -2 || x === 1)) c = C.trim;
      else if (y > waist + 1 && z === td && (x === -1 || x === 0)) c = C.priD;
      if (y === top && (x === x0 || x === x1 || z === -td || z === td)) c = C.trim;
      g.set(x, y, z, c);
    }
  }
  const ex = -hw + 2;
  for (const [x, y] of [[ex, top - 4], [ex - 1, top - 5], [ex, top - 5], [ex + 1, top - 5], [ex, top - 6]]) g.set(x, y, td, C.trim);   // chest star
  g.sym(sx, D.arm, -2, sx + 3, top - 1, 2, (x, y) => (y >= top - 3 ? C.secL : C.pri));
  g.sym(sx, D.arm, -3, sx + 4, D.arm + 3, 3, (x, y) => (y === D.arm || y === D.arm + 3 ? C.trim : C.secL));
}

function tunic(g, D, C) {
  const { waist, top, hw, td, boot, sx } = D;
  g.sym(1, boot + 1, -3, 5, waist - 1, 3, (x, y, z) => (x === 1 || x === -2 ? C.priD : C.pants));
  for (let y = waist - 4; y <= top; y++) {
    const sh = y >= top - 2, hem = y < waist, x0 = sh ? -(hw + 1) : hem ? -(hw + 1) : -hw, x1 = sh ? hw : hem ? hw : hw - 1;
    for (let x = x0; x <= x1; x++) for (let z = -td; z <= td; z++) {
      let c = sh ? C.priL : (x + 16) % 5 === 0 ? C.priD : C.pri;
      if (y === waist) c = LEATHER;
      if (y === waist && z === td && x >= -1 && x <= 0) c = C.trim;
      if (y === waist - 4 && !sh) c = (x + y) % 2 ? C.sec : C.secD;
      if (y === top && (x === x0 || x === x1 || z === -td || z === td)) c = C.sec;
      g.set(x, y, z, c);
    }
  }
  g.sym(sx, D.arm + 4, -2, sx + 3, top - 1, 2, (x, y) => (y >= top - 3 ? C.priL : C.pri));       // short sleeves
  g.sym(sx, D.arm, -2, sx + 3, D.arm + 3, 2, C.skin);                                              // bare forearms
  g.sym(sx, D.arm + 1, -2, sx + 3, D.arm + 3, 2, (x, y, z) => (y === D.arm + 3 ? C.sec : C.secD)); // bracers
}

function armor(g, D, C) {
  const { waist, top, hw, td, boot, sx } = D;
  g.sym(1, boot + 1, -3, 5, waist - 1, 3, (x, y) => (y <= boot + 8 ? C.metal : C.pants));        // greaves over pants
  for (let y = waist - 4; y <= top; y++) {
    const sh = y >= top - 2, hem = y < waist, x0 = hem || sh ? -(hw + 1) : -hw, x1 = hem || sh ? hw : hw - 1;
    for (let x = x0; x <= x1; x++) for (let z = -td; z <= td + (hem ? 1 : 0); z++) {
      let c = (y + x) % 7 === 0 ? C.metalD : C.metal;
      if (y === waist + 2 || (y === top - 6 && !sh)) c = C.trim;
      if (z === td && (x === -1 || x === 0)) c = C.metalL;
      if (y === waist || y === waist + 1) c = LEATHER;
      if (y === waist && z === td && x >= -1 && x <= 0) c = C.trim;
      if (hem && y < waist) c = (x + y) % 2 ? C.metalD : C.metal;
      if (y === top && (x === x0 || x === x1 || z === -td || z === td)) c = C.trim;
      g.set(x, y, z, c);
    }
  }
  g.sym(sx, D.arm + 4, -2, sx + 3, top - 1, 2, C.pri);                                                // cloth sleeves
  g.sym(sx, D.arm, -2, sx + 3, D.arm + 3, 2, (x, y) => (y === D.arm + 3 ? C.trim : C.metalD));         // vambraces
  g.sym(sx - 1, top - 3, -4, sx + 4, top + 1, 4, (x, y) => (y === top + 1 ? C.trim : (x + y) % 3 === 0 ? C.metalD : C.metal)); // pauldrons
}

function hands(g, r, D, C) {
  const { sx } = D, waist = D.arm, armored = r.outfit === 'armor', c = (y) => (armored ? (y === waist - 1 ? C.metalD : C.metal) : (y === waist - 1 ? C.skinShade : C.skin));
  g.box(sx + 1, waist - 4, 0, sx + 3, waist - 1, 4, (x, y) => c(y));                                  // right hand (grips the weapon)
  g.box(mx(sx + 3), waist - 4, -1, mx(sx + 1), waist - 1, 2, (x, y) => c(y));                         // left hand
}

// ---------------------------------------------------------------- head
function head(g, r, D, C) {
  const Y = (h) => D.headY0 + h, dragon = P.RACES[r.race].head === 'dragon';
  g.box(-8, Y(0), -8, 7, Y(15), 7, (x, y, z) => (y === Y(0) ? C.skinShade : dragon && (x + y + z) % 2 === 0 ? shade(C.skin, 0.94) : C.skin), { skin: true });
}

function hairPredicate(style) {
  const top = (hy) => hy >= 14;
  const base = (hx, hy, hz) => top(hy) || (hy === 13 && ((hx + 8) * 7) % 3 !== 0) || (hz <= -4 && hy >= 5) || ((hx <= -8 || hx >= 7) && hz <= 2 && hy >= 8);
  switch (style) {
    case 'bald': return () => false;
    case 'long': return (hx, hy, hz) => base(hx, hy, hz) || ((hx <= -8 || hx >= 7) && hz <= 4 && hy >= 0) || (hz <= -3 && hy >= 0);
    case 'mohawk': return (hx, hy, hz) => hy >= 12 && Math.abs(hx + 0.5) <= 1.5 && hz <= 5;
    default: return base;
  }
}

function hair(g, r, D, C) {
  if (r.hairStyle === 'bald') return;
  const Y = (h) => D.headY0 + h, test = hairPredicate(r.hairStyle), dark = shade(C.hair, 0.7);
  for (let x = -8; x <= 7; x++) for (let hy = 0; hy <= 15; hy++) for (let z = -8; z <= 7; z++) if (test(x, hy, z)) g.set(x, Y(hy), z, C.hair);
  const s = r.hairStyle;
  if (s === 'long') {
    for (let y = Y(-1); y >= Y(-8); y--) { const w = Math.round(7 - (Y(-1) - y) * 0.15), zb = -5 - (y > Y(-4) ? 1 : 0); for (let x = -w; x <= w - 1; x++) for (let z = -9; z <= zb; z++) g.set(x, y, z, C.hair); }
  }
  if (s === 'ponytail') g.tube([[-0.5, Y(11), -9], [-0.5, Y(9), -12], [-0.5, Y(4), -13], [-0.5, Y(-1), -12]], 2.1, 0.9, C.hair).sym(0, Y(11), -10, 1, Y(12), -9, C.trim);
  if (s === 'topknot') { g.ball(-0.5, Y(17.5), -2, 3.2, C.hair); g.box(-1, Y(15), -3, 0, Y(16), -1, C.trim); }
  if (s === 'mohawk') for (let z = -6; z <= 4; z++) { g.box(-1, Y(16), z, 0, Y(16), z, C.hair); if (z % 2 === 0) g.box(-1, Y(17), z, 0, Y(18), z, C.hair); }
  if (s === 'braids') for (let y = Y(8); y >= Y(-5); y--) g.sym(-8, y, 4, -7, y, 5, ((Y(8) - y) % 4 < 2) ? C.hair : dark);
}

// ---------------------------------------------------------------- face
function face(g, r, D, C) {
  const Y = (h) => D.headY0 + h, R = P.RACES[r.race], dragon = R.head === 'dragon', woman = r.gender === 'woman';
  const glow = r.eyeGlow ? { glow: true, tag: 'eye' } : { tag: 'eye' };
  // eyes: lash row at hy 9, then rows below; the outer columns are white, the inner two are iris, pupils look ahead
  const rows = r.eyes === 'wide' ? [8, 7, 6] : r.eyes === 'narrow' ? [8] : [8, 7];
  for (const e of [{ xs: [-6, -5, -4, -3], pupil: -4 }, { xs: [5, 4, 3, 2], pupil: 3 }]) {
    e.xs.forEach((x, i) => {
      g.set(x, Y(9), 7, LASH);
      for (const hy of rows) {
        if (r.eyes === 'sharp' && i === 0 && hy === rows[rows.length - 1]) { g.set(x, Y(hy), 7, C.skin, { skin: true }); continue; }
        const white = i === 0 || i === 3;
        g.set(x, Y(hy), 7, white ? EYE_WHITE : x === e.pupil ? PUPIL : C.eye, white || x === e.pupil ? { tag: 'eye' } : glow);
      }
    });
    if (r.eyes === 'sharp' || woman) g.set(e.xs[0], Y(10), 7, LASH);
    if (woman && r.eyes !== 'narrow') g.set(e.xs[0] + (e.xs[0] < 0 ? -1 : 1), Y(9), 7, LASH);
  }
  for (const x of [-6, -5, -4, 3, 4, 5]) g.set(x, Y(6), 7, C.lid, { skin: true });                      // under-eye shade
  for (const x of [-7, -6, 6, 5]) for (const hy of [5, 6]) g.set(x, Y(hy), 7, C.blush, { skin: true }); // cheeks
  // brows
  const bc = dragon ? shade(C.skin, 0.7) : r.hairStyle === 'bald' && r.beard === 'none' ? '#3a2a1e' : r.hairColor === 'white' || r.hairColor === 'grey' ? '#dedcec' : shade(C.hair, 1);
  if (r.brows === 'thick' || dragon) { g.sym(-7, Y(10), 7, -3, Y(10), 8, bc); g.sym(-7, Y(11), 7, -5, Y(11), 8, bc); }
  else if (r.brows === 'thin') g.sym(-6, Y(10), 7, -3, Y(10), 7, bc);
  if (dragon) return;
  // nose
  let size = r.nose; if (R.noseBonus && size !== 'big') size = size === 'small' ? 'normal' : 'big';
  const sk = { skin: true };
  if (size === 'small') { g.box(-1, Y(5), 8, 0, Y(6), 8, C.skinLight, sk); }
  else {
    g.box(-1, Y(7), 8, 0, Y(7), 8, C.skinLight, sk);
    const deep = size === 'big' ? 10 : 9;
    for (const hy of [6, 5]) for (const x of [-1, 0]) for (let z = 8; z <= deep; z++) g.set(x, Y(hy), z, z === deep && hy === 5 ? C.skinLight : C.skinLight, sk);
    for (const x of size === 'big' ? [-2, -1, 0, 1] : [-1, 0]) { g.set(x, Y(4), 8, C.skinShade, sk); g.set(x, Y(4), 9, x === -1 || x === 0 ? '#7a4a3a' : C.skinShade, sk); }
  }
  // mouth
  const m = r.mouth;
  if (m === 'grin') { g.box(-3, Y(2), 7, 2, Y(2), 7, TEETH); g.box(-3, Y(1), 7, 2, Y(1), 7, C.lip); }
  else { g.box(-3, Y(2), 7, 2, Y(2), 7, C.lip); g.box(-2, Y(1), 7, 1, Y(1), 7, C.lip2); }
  if (m === 'smile') for (const x of [-4, 3]) g.set(x, Y(3), 7, C.skinShade, sk);
  if (m === 'frown') for (const x of [-4, 3]) g.set(x, Y(1), 7, C.skinShade, sk);
}

function beard(g, r, D, C) {
  if (r.beard === 'none' || P.RACES[r.race].head === 'dragon') return;
  const Y = (h) => D.headY0 + h, b = r.beard, col = (x, y, z) => ((x + 20) % 3 === 0 ? shade(C.beard, 0.86) : C.beard);
  if (b === 'mustache' || b === 'full' || b === 'long') for (let x = -5; x <= 4; x++) { g.set(x, Y(3), 8, C.beard); g.set(x, Y(3), 7, C.beard); }
  if (b === 'goatee') { g.box(-2, Y(-2), 6, 1, Y(0), 8, col); g.box(-1, Y(-3), 7, 0, Y(-3), 8, col); }
  if (b === 'short' || b === 'full' || b === 'long') for (const hy of [1, 2, 3, 4]) for (const x of [-8, -7, -6, -5, 4, 5, 6, 7]) for (const z of [6, 7, 8]) g.set(x, Y(hy), z, C.beard);
  const len = { short: 3, full: 5, long: 8 }[b];
  if (len) for (let y = Y(0); y >= Y(-len); y--) {
    const d = Y(0) - y, hw = Math.max(1, Math.round(7 - d * (b === 'short' ? 0.4 : 0.5))), zt = 9 - Math.floor(d / 5);
    for (let x = -hw; x <= hw - 1; x++) for (let z = 5; z <= Math.max(7, zt); z++) g.set(x, y, z, col(x, y, z));
  }
}

function raceFeatures(g, r, D, C) {
  const Y = (h) => D.headY0 + h, R = P.RACES[r.race], sk = { skin: true };
  const ear = { round: () => g.sym(8, Y(5), -1, 8, Y(7), 2, C.skin, sk), elf: () => { g.sym(8, Y(5), 0, 8, Y(8), 1, C.skin); g.sym(9, Y(7), 0, 9, Y(10), 1, C.skin); g.sym(10, Y(9), 0, 10, Y(11), 1, C.skinLight); },
    half: () => { g.sym(8, Y(5), 0, 8, Y(8), 1, C.skin); g.sym(9, Y(7), 0, 9, Y(9), 1, C.skinLight); },
    gnome: () => { g.sym(8, Y(5), -1, 8, Y(8), 2, C.skin); g.sym(9, Y(7), -1, 9, Y(9), 1, C.skinLight); }, none: () => {} };
  ear[R.ears]();
  if (R.jaw) g.box(-5, Y(-1), 6, 4, Y(0), 8, C.skin, sk);
  if (R.tusks) for (const x of [-3, 2]) g.box(x, Y(1), 8, x, Y(3), 8, TEETH);
  if (R.horns) { const horn = '#e4dcc8'; for (const s of [1, -1]) { const X = (x) => (s === 1 ? x : -1 - x); g.tube([[X(5.5), Y(14), 1], [X(7.5), Y(18), 0], [X(8.5), Y(21), -4], [X(7.5), Y(23), -8]], 2.2, 0.7, horn); } }
  if (R.tail) {
    const w = D.waist, big = R.tail === 'scaled', c = big ? C.skin : C.skinShade;
    g.tube([[-0.5, w - 1.5, -5], [-0.5, w - 3, -9], [-0.5, w - 6, -12], [-0.5, w - 9, -12], [-0.5, Math.max(1, w - 10), -9]], big ? 2.8 : 1.6, big ? 0.9 : 0.8, c, sk);
    if (!big) g.ball(-0.5, Math.max(1, w - 10), -8, 1.8, '#7a2a3a');
  }
  if (R.head === 'dragon') {
    g.box(-4, Y(1), 8, 3, Y(6), 13, (x, y, z) => (y === Y(6) ? shade(C.skin, 0.8) : (x + y) % 2 ? shade(C.skin, 0.94) : C.skin), sk);   // snout
    for (const x of [-3, 2]) { g.set(x, Y(5), 13, '#1a1014'); g.set(x, Y(5), 12, '#1a1014'); }                                           // nostrils
    g.box(-3, Y(2), 13, 2, Y(2), 13, '#7a2a30'); for (const x of [-3, 2]) g.box(x, Y(0), 13, x, Y(1), 13, TEETH);
    for (const x of [-5, -2, 1, 4]) g.tube([[x + 0.5, Y(13), -6], [x + 0.5, Y(17), -9]], 1.4, 0.5, shade(C.skin, 0.8));                  // crest
    g.sym(8, Y(3), -2, 9, Y(8), 3, shade(C.skin, 1.12));                                                                                 // cheek frills
  }
}

function marks(g, r, D, C) {
  if (r.mark === 'none') return;
  const Y = (h) => D.headY0 + h, scar = mix(C.skin, '#f0d0c4', 0.55), paint = (x, hy, c = C.paint) => { const v = g.get(x, Y(hy), 7); if (v && v.skin) g.set(x, Y(hy), 7, c, { skin: true }); };
  const m = r.mark;
  if (m === 'scar-eye') for (const [x, hy] of [[-7, 11], [-7, 10], [-6, 9], [-6, 8], [-5, 7], [-5, 6], [-4, 5], [-3, 4]]) paint(x, hy, scar);
  if (m === 'scar-cheek') for (const [x, hy] of [[5, 6], [4, 5], [3, 4], [2, 3], [5, 4], [3, 6]]) paint(x, hy, scar);
  if (m === 'war-stripes') for (const s of [1, -1]) for (const [x, hy] of [[-7, 6], [-6, 6], [-5, 6], [-4, 6], [-7, 5], [-6, 5], [-5, 5]]) paint(s === 1 ? x : mx(x), hy);
  if (m === 'cheek-lines') for (const s of [1, -1]) for (const x of [-6, -4]) for (const hy of [4, 5, 6]) paint(s === 1 ? x : mx(x), hy);
  if (m === 'forehead-mark') for (const [x, hy] of [[-1, 12], [0, 12], [-2, 13], [-1, 13], [0, 13], [1, 13], [-1, 14], [0, 14]]) paint(x, hy);
}

// ---------------------------------------------------------------- headgear
const perimeter = (x, z) => x === -8 || x === 7 || z === -8 || z === 7;
function headgear(g, r, D, C) {
  const Y = (h) => D.headY0 + h, hg = r.headgear;
  if (hg === 'none') return;
  if (hg === 'wizard-hat') {
    const hat = C.sec, hatD = C.secD, hatL = C.secL;
    g.disc(Y(16), -0.5, -0.5, 13.6, (x, y, z) => (hash(x, y, z) > 0.5 ? hatD : hat));
    g.disc(Y(17), -0.5, -0.5, 11.8, hat);
    for (let i = 0; i <= 25; i++) {
      const t = i / 25, rad = 10 * Math.pow(1 - t, 0.9) + 0.8, cx = -0.5 + 2.5 * t * t, cz = -0.5 - 10 * t * t, y = Y(18) + i;
      g.disc(y, cx, cz, rad, i <= 1 ? (x, yy, z) => ((x + z) % 2 ? C.trim : C.trimD) : (x, yy, z) => (Math.floor(i / 6) % 2 ? hatD : hash(x, yy, z) > 0.8 ? hatL : hat));
      if (i === 1) { const zf = Math.round(cz + rad); for (const x of [-1, 0]) for (const yy of [Y(18), Y(19)]) g.set(x, yy, zf, C.magic, { glow: true }); }
    }
  }
  if (hg === 'hood') {
    const inFront = (x, hy, z) => z >= 6 && !(hy >= 14 || Math.abs(x + 0.5) >= 7.5);
    for (let x = -9; x <= 8; x++) for (let hy = -3; hy <= 17; hy++) for (let z = -9; z <= 8; z++) {
      const insideHead = x >= -8 && x <= 7 && hy >= 0 && hy <= 15 && z >= -8 && z <= 7;
      if (insideHead && !(hy >= 14 || z <= -7 || perimeter(x, z) && false)) continue;
      if (hy < 0 && (z > 3 || Math.abs(x + 0.5) > 8)) continue;
      if (inFront(x, hy, z)) continue;
      if (insideHead && !(hy >= 14 || z <= -7)) continue;
      g.set(x, Y(hy), z, (x + hy) % 3 === 0 ? C.priD : C.pri);
    }
    g.box(-6, Y(-3), 3, 5, Y(-2), 5, C.pri);
  }
  if (hg === 'helm' || hg === 'horned-helm') {
    for (let x = -9; x <= 8; x++) for (let hy = 0; hy <= 16; hy++) for (let z = -9; z <= 8; z++) {
      const top = hy >= 14, back = z <= -7 && hy >= 4, side = (x <= -8 || x >= 7) && z <= 5 && hy >= 4, cheek = (x <= -8 || x >= 7) && z >= 4 && hy <= 9 && hy >= 0;
      const inHead = x >= -8 && x <= 7 && z >= -8 && z <= 7 && hy <= 15;
      if (!(top || back || side || cheek)) continue;
      if (inHead && !top && !(back && z === -8) && !side && !cheek) continue;
      if (top && hy === 14 && z > 4) { g.set(x, Y(hy), z, C.trim); continue; }
      g.set(x, Y(hy), z, (x + hy + z) % 5 === 0 ? C.metalD : C.metal);
    }
    g.box(-1, Y(8), 8, 0, Y(14), 8, C.metalL);                                                         // nose guard
    g.box(-8, Y(13), -8, 7, Y(13), -8, C.trim);
  }
  if (hg === 'horned-helm') for (const s of [1, -1]) { const X = (x) => (s === 1 ? x : -1 - x); g.tube([[X(7.5), Y(13), 0], [X(10.5), Y(16), 0], [X(11.5), Y(21), 0]], 2.1, 0.8, '#e4dcc8'); }
  if (hg === 'circlet') {
    for (let x = -8; x <= 7; x++) for (let z = -8; z <= 7; z++) if (perimeter(x, z)) g.set(x, Y(12), z, C.trim);
    g.box(-1, Y(12), 8, 0, Y(13), 8, C.magic, { glow: true });
  }
  if (hg === 'headband') {
    for (let x = -8; x <= 7; x++) for (let z = -8; z <= 7; z++) if (perimeter(x, z)) { g.set(x, Y(11), z, C.sec); g.set(x, Y(12), z, C.secL); }
    g.sym(1, Y(4), -11, 2, Y(11), -9, C.sec); g.sym(2, Y(5), -12, 3, Y(8), -11, C.secL);
  }
  if (hg === 'leaf-crown') {
    for (let x = -8; x <= 7; x++) for (let z = -8; z <= 7; z++) if (perimeter(x, z)) {
      g.set(x, Y(13), z, '#2f6f3e');
      const h = hash(x, 3, z); if (h > 0.5) g.set(x, Y(14), z, h > 0.82 ? '#6fb85a' : '#3f8f4a');
      if (h > 0.93) g.set(x, Y(15), z, '#6fb85a');
    }
    for (const [x, z] of [[-5, 8], [3, 8], [7, 2]]) g.set(x, Y(14), z, '#c0392b');
  }
  if (hg === 'feather-cap') {
    g.box(-8, Y(14), -8, 7, Y(15), 7, (x, y, z) => (hash(x, y, z) > 0.8 ? C.secL : C.sec));
    g.box(-8, Y(14), 8, 7, Y(14), 9, C.secD);
    g.tube([[4.5, Y(15), -4], [7.5, Y(21), -6], [9.5, Y(26), -9]], 1.5, 0.5, C.pri);
  }
}

// ---------------------------------------------------------------- weapons (right hand, held in front of the fist)
function weapon(g, r, D, C, meta) {
  const w = r.weapon; if (w === 'none') return;
  const { sx, headY0 } = D, waist = D.arm, x0 = sx + 2, x1 = sx + 3, inHand = (x, y, z) => x >= sx + 1 && x <= sx + 3 && y >= waist - 4 && y <= waist - 1 && z >= 0 && z <= 4;
  const shaft = (yA, yB, c = WOOD) => { for (let y = yA; y <= yB; y++) for (let x = x0; x <= x1; x++) for (let z = 3; z <= 4; z++) if (!inHand(x, y, z)) g.set(x, y, z, y % 9 === 8 ? WOOD_D : c); };
  if (w === 'staff') {
    const S = headY0 + 26; shaft(0, S - 1);
    g.box(x0 - 1, S, 2, x1 + 1, S + 1, 5, C.trim);
    g.box(x0 - 1, S + 2, 2, x1 + 1, S + 5, 5, C.magic, { glow: true });
    g.box(x0, S + 3, 3, x1, S + 4, 4, '#f4ffff', { glow: true });
    for (const [x, z] of [[x0 - 1, 2], [x1 + 1, 2], [x0 - 1, 5], [x1 + 1, 5]]) g.box(x, S + 2, z, x, S + 5, z, C.trim);
    g.box(x0 - 1, S + 6, 2, x1 + 1, S + 6, 5, C.trim);
    meta.orb = { x: (x0 + x1) / 2 + 0.5, y: S + 3.5 + 0.5, z: 3.5 + 0.5, color: C.magic };
  }
  if (w === 'sword') {
    shaft(waist - 6, waist - 1, LEATHER); g.box(x0, waist - 7, 3, x1, waist - 7, 4, C.trim);
    g.box(sx, waist, 2, sx + 5, waist + 1, 5, C.trim);
    for (let y = waist + 2; y <= waist + 26; y++) { const tip = y > waist + 23; for (let x = tip ? x0 : x0; x <= (tip ? x0 : x1); x++) g.set(x, y, 4, x === x0 ? C.metalL : C.metal); }
  }
  if (w === 'axe') {
    shaft(waist - 8, waist + 22);
    for (let i = 0; i < 9; i++) { const len = Math.round(5.5 - Math.abs(i - 4) * 0.9), y = waist + 14 + i; for (let k = 0; k < len; k++) for (let z = 3; z <= 4; z++) g.set(x1 + 1 + k, y, z, k === len - 1 ? C.metalL : C.metal); }
    g.box(x0, waist + 13, 2, x1, waist + 14, 5, C.trim);
  }
  if (w === 'mace') {
    shaft(waist - 8, waist + 14); g.ball((x0 + x1) / 2 + 0.5, waist + 17, 3.5, 3.4, (x, y, z) => ((x + y + z) % 3 === 0 ? C.metalL : C.metal));
    for (const [dx, dy, dz] of [[0, 4, 0], [0, -4, 0], [4, 0, 0], [-4, 0, 0], [0, 0, 4], [0, 0, -4]]) g.set(Math.round((x0 + x1) / 2 + 0.5) + dx, waist + 17 + dy, 3 + dz, C.metalL);
  }
  if (w === 'dagger') {
    shaft(waist - 5, waist - 1, LEATHER); g.box(sx + 1, waist, 3, sx + 4, waist, 4, C.trim);
    for (let y = waist + 1; y <= waist + 9; y++) g.set(x0 + (y > waist + 7 ? 0 : 0), y, 4, y > waist + 7 ? C.metalL : C.metal), (y <= waist + 7 && g.set(x1, y, 4, C.metalL));
  }
  if (w === 'bow') {
    const y0 = waist - 12, H = 24;
    for (let i = 0; i <= H; i++) {
      const t = i / H, y = y0 + i, bulge = Math.round(5 * Math.sin(Math.PI * t));
      if (y >= 0) { g.set(x1 + bulge, y, 4, WOOD); if (bulge > 0) g.set(x1 + bulge, y, 3, WOOD_D); g.set(x1, y, 3, i === 0 || i === H ? WOOD : '#e8e4d8'); }
    }
  }
}
