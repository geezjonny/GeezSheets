// A recipe is the whole character as plain data: small, savable, shareable, and enough to rebuild the model.
import * as P from './parts.js';

export const VERSION = 1;
const one = (list, v, d) => (Object.keys(list).includes(v) ? v : d);

export const DEFAULT = {
  v: VERSION, name: 'Wanderer', race: 'human', gender: 'man', skin: 1, klass: 'wizard',
  hairStyle: 'short', hairColor: 'brown', beard: 'none', beardColor: 'same',
  eyes: 'round', eyeColor: 'blue', eyeGlow: false, brows: 'thin', nose: 'dot', mouth: 'neutral',
  mark: 'none', paint: 'red',
  look: 'cozy', outfit: 'robe', headgear: 'wizard-hat', weapon: 'staff', offhand: 'none', primary: 'indigo', secondary: 'violet', trim: 'gold', metal: 'gold', magic: 'cyan',
  seed: 1,
};

/** Fill gaps, clamp every field to a valid option, and apply race rules (e.g. dragonborn have no hair). */
export function normalize(input = {}) {
  const r = { ...DEFAULT, ...input, v: VERSION };
  r.name = String(r.name ?? '').slice(0, 40) || DEFAULT.name;
  r.race = one(P.RACES, r.race, 'human');
  r.gender = r.gender === 'woman' ? 'woman' : 'man';
  r.skin = Math.max(0, Math.min(P.SKINS[r.race].length - 1, Number.isFinite(+r.skin) ? Math.floor(+r.skin) : 0));
  r.klass = one(P.CLASSES, r.klass, 'custom');
  r.hairStyle = one(P.HAIR_STYLES, r.hairStyle, 'short');
  r.hairColor = one(P.HAIR_COLORS, r.hairColor, 'brown');
  r.beard = one(P.BEARDS, r.beard, 'none');
  r.beardColor = r.beardColor === 'same' ? 'same' : one(P.HAIR_COLORS, r.beardColor, 'same');
  r.eyes = one(P.EYE_STYLES, r.eyes, 'round');
  r.eyeColor = one(P.EYE_COLORS, r.eyeColor, 'blue');
  r.eyeGlow = !!r.eyeGlow;
  r.brows = one(P.BROWS, r.brows, 'thin');
  r.nose = one(P.NOSES, r.nose, 'dot');
  r.mouth = one(P.MOUTHS, r.mouth, 'neutral');
  r.mark = one(P.MARKS, r.mark, 'none');
  r.paint = one(P.PAINTS, r.paint, 'red');
  r.look = r.look === 'classic' ? 'classic' : 'cozy';
  r.outfit = one(P.OUTFITS, r.outfit, 'robe');
  r.headgear = one(P.HEADGEAR, r.headgear, 'none');
  r.weapon = one(P.WEAPONS, r.weapon, 'none');
  r.offhand = one(P.OFFHANDS, r.offhand, 'none');
  r.primary = one(P.CLOTH, r.primary, 'indigo');
  r.secondary = one(P.CLOTH, r.secondary, 'violet');
  r.trim = one(P.METALS, r.trim, 'gold');
  r.metal = one(P.METALS, r.metal, 'steel');
  r.magic = one(P.MAGIC, r.magic, 'cyan');
  r.seed = Number.isFinite(+r.seed) ? Math.floor(+r.seed) : 1;
  if (P.RACES[r.race].head === 'dragon') { r.hairStyle = 'bald'; r.beard = 'none'; r.nose = 'none'; }
  return r;
}

/** Apply a class preset's gear (outfit, headgear, weapon, colours). Appearance is left alone. */
export function withClass(r, klass) {
  const c = P.CLASSES[klass];
  if (!c) return normalize({ ...r, klass: 'custom' });
  const { emblem, ...gear } = c;                         // the emblem is looked up from the class when building, not stored
  return normalize({ ...r, ...gear, klass });
}

const GEAR = ['outfit', 'headgear', 'weapon', 'offhand', 'primary', 'secondary', 'trim', 'metal', 'magic'];
/** For callers that hand over a partial recipe: a class with no explicit gear brings the class's gear. */
export function fromPartial(partial = {}) {
  const hasGear = GEAR.some((k) => k in partial);
  return partial.klass && P.CLASSES[partial.klass] && !hasGear ? withClass(partial, partial.klass) : normalize(partial);
}

// Small seeded generator so "Randomize" can be repeated from a seed.
export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

export function randomize(seed = (Math.random() * 1e9) | 0, keep = {}) {
  const rand = rng(seed), pick = (a) => a[Math.floor(rand() * a.length)];
  const race = keep.race || pick(P.RACE_IDS), gender = keep.gender || pick(['man', 'woman']);
  const klass = keep.klass && keep.klass !== 'custom' ? keep.klass : pick(Object.keys(P.CLASSES));
  const r = {
    ...DEFAULT, name: keep.name || DEFAULT.name, race, gender, seed,
    skin: Math.floor(rand() * P.SKINS[race].length),
    hairStyle: pick(Object.keys(P.HAIR_STYLES)), hairColor: pick(Object.keys(P.HAIR_COLORS)),
    beard: gender === 'man' && rand() < 0.5 ? pick(Object.keys(P.BEARDS)) : 'none', beardColor: 'same',
    eyes: pick(Object.keys(P.EYE_STYLES)), eyeColor: pick(Object.keys(P.EYE_COLORS)), eyeGlow: rand() < 0.12,
    brows: pick(Object.keys(P.BROWS).slice(0, 2)), nose: pick(Object.keys(P.NOSES)), mouth: pick(Object.keys(P.MOUTHS)),
    mark: rand() < 0.4 ? pick(Object.keys(P.MARKS).slice(1)) : 'none', paint: pick(Object.keys(P.PAINTS)),
  };
  return withClass(normalize(r), klass);
}

// ---- sharing: a recipe travels as base64url JSON in the URL hash (#c=...) or as pasted text
const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
export const encode = (r) => b64(JSON.stringify(normalize(r)));
export function decode(text) {
  try {
    const t = String(text).trim().replace(/^#?c=/, '');
    return normalize(JSON.parse(t.startsWith('{') ? t : unb64(t)));
  } catch { return null; }
}

// ---- the NPC "look" that zoom-ink-test/figures.js reads (race, gender, hair text, clothing, armour, weapon, seed)
const HAIR_TEXT = { bald: 'bald', short: 'cropped short', long: 'long', ponytail: 'tied back', topknot: 'in a topknot', mohawk: 'wild and unkempt', braids: 'long and braided' };
const WEAPON_TEXT = { staff: 'quarterstaff', branch: 'quarterstaff', bo: 'quarterstaff', orb: null, sword: 'longsword', axe: 'handaxe', mace: 'mace', dagger: 'dagger', bow: 'shortbow' };
export function toLook(input) {
  const r = normalize(input);
  const hair = r.headgear === 'hood' ? 'hidden under a hood' : r.hairStyle === 'bald' ? 'bald' : `${r.hairColor}, ${HAIR_TEXT[r.hairStyle]}`;
  const clothing = r.outfit === 'robe' ? 'velvet robes' : r.outfit === 'armor' ? 'tabard over mail' : 'wool tunic';
  const armour = r.outfit === 'armor' ? (r.metal === 'iron' ? 'chain mail' : 'breastplate') : (r.klass === 'rogue' || r.klass === 'ranger') ? 'studded leather' : null;
  return { race: r.race, gender: r.gender, hair, clothing, armour, weapon: WEAPON_TEXT[r.weapon] || null, seed: r.seed };
}
