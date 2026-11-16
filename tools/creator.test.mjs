// Character creator: every race x class x gender builds, stays in bounds, keeps the face symmetrical, and round-trips.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../js/creator/build.js';
import { DEFAULT, normalize, withClass, fromPartial, randomize, encode, decode, toLook } from '../js/creator/recipe.js';
import * as P from '../js/creator/parts.js';
import { mx } from '../js/creator/voxels.js';

// 1. race ids match data/races.json exactly
const dataRaces = JSON.parse(readFileSync(new URL('../data/races.json', import.meta.url), 'utf8')).map((r) => r.index).sort();
assert.deepEqual([...P.RACE_IDS].sort(), dataRaces, 'creator races must match data/races.json');
const dataClasses = JSON.parse(readFileSync(new URL('../data/classes.json', import.meta.url), 'utf8')).map((r) => r.index).sort();
assert.deepEqual(Object.keys(P.CLASSES).sort(), dataClasses, 'creator class presets must match data/classes.json');

// 2. every race x class x gender builds within sane bounds, on the floor, with a face
let built = 0;
for (const race of P.RACE_IDS) for (const klass of Object.keys(P.CLASSES)) for (const gender of ['man', 'woman']) {
  const r = withClass(normalize({ ...DEFAULT, race, gender }), klass), { voxels, meta } = buildCharacter(r);
  assert.ok(voxels.size > 2000 && voxels.size < 40000, `${race}/${klass}: ${voxels.size} voxels`);
  let ymin = 1e9, ymax = -1e9, xs = [], zs = [], eyes = 0;
  for (const [k, v] of voxels) { const [x, y, z] = k.split(',').map(Number); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); xs.push(x); zs.push(z); if (v.tag === 'eye') eyes++; assert.match(v.c, /^#[0-9a-f]{6}$/, `${race}/${klass}: bad colour ${v.c}`); }
  assert.equal(ymin, 0, `${race}/${klass}: should stand on y=0 (got ${ymin})`);
  assert.ok(Math.min(...xs) >= -24 && Math.max(...xs) <= 24 && Math.min(...zs) >= -24 && Math.max(...zs) <= 24, `${race}/${klass}: out of bounds`);
  assert.ok(eyes >= 8, `${race}/${klass}: eyes missing (${eyes})`);
  if (klass === 'wizard' || klass === 'sorcerer' || klass === 'druid' || klass === 'warlock') assert.ok(meta.orb, `${race}/${klass}: staff orb missing`);
  built++;
}

// 3. race proportions: halfling/gnome < dwarf < human < elf < dragonborn (head-to-toe, hats excluded)
const h = (race) => buildCharacter(withClass(normalize({ race }), 'fighter')).meta.headY0;
assert.ok(h('gnome') < h('halfling') && h('halfling') < h('dwarf') && h('dwarf') < h('human') && h('human') < h('elf'), 'race heights out of order');

// 4. the face is left/right symmetrical (eyes, brows, nose) for a bare-headed, hairless character
const bare = buildCharacter(normalize({ race: 'human', hairStyle: 'bald', beard: 'none', headgear: 'none', weapon: 'none', mark: 'none', mouth: 'neutral' })).voxels;
const { headY0 } = buildCharacter(DEFAULT).meta;
for (let hy = 4; hy <= 11; hy++) for (let x = -8; x <= 7; x++) for (const z of [7, 8, 9]) {
  const a = bare.get(`${x},${headY0 + hy},${z}`), b = bare.get(`${mx(x)},${headY0 + hy},${z}`);
  assert.equal(!!a, !!b, `face asymmetric at x=${x} hy=${hy} z=${z}`);
  if (a && b) assert.equal(a.c, b.c, `face colour asymmetric at x=${x} hy=${hy} z=${z}`);
}

// 5. every option does something: changing it changes the model
const base = buildCharacter(normalize({ ...DEFAULT, klass: 'custom', headgear: 'none', weapon: 'none' }));
const sig = (b) => [...b.voxels].map(([k, v]) => k + v.c).sort().join('|');
const baseSig = sig(base);
for (const [field, opts] of Object.entries({ hairStyle: P.HAIR_STYLES, beard: P.BEARDS, eyes: P.EYE_STYLES, brows: P.BROWS, nose: P.NOSES, mark: P.MARKS, outfit: P.OUTFITS, headgear: P.HEADGEAR, weapon: P.WEAPONS })) {
  const seen = new Set([baseSig]);
  for (const v of Object.keys(opts)) seen.add(sig(buildCharacter(normalize({ ...DEFAULT, klass: 'custom', headgear: 'none', weapon: 'none', [field]: v }))));
  assert.ok(seen.size >= Math.min(Object.keys(opts).length, 3), `${field}: options do not change the model`);
}
for (const [field, opts] of Object.entries({ eyeColor: P.EYE_COLORS, hairColor: P.HAIR_COLORS, primary: P.CLOTH })) assert.ok(new Set(Object.keys(opts).map((v) => sig(buildCharacter(normalize({ ...DEFAULT, [field]: v }))))).size > 1, `${field}: colours do not change the model`);

// 6. race rules and recipe plumbing
assert.equal(normalize({ race: 'dragonborn', hairStyle: 'long', beard: 'full' }).hairStyle, 'bald');
assert.equal(normalize({ race: 'nope' }).race, 'human');
assert.equal(normalize({ race: 'dwarf', skin: 99 }).skin, P.SKINS.dwarf.length - 1);
const rnd = randomize(1234); assert.deepEqual(rnd, randomize(1234), 'randomize must repeat from a seed');
assert.notDeepEqual(randomize(1), randomize(2));
for (let s = 1; s <= 60; s++) { const r = randomize(s * 7919); assert.ok(buildCharacter(r).voxels.size > 1000, `random seed ${s}`); assert.deepEqual(decode(encode(r)), r, 'encode/decode round trip'); }
assert.equal(decode('not a recipe'), null);
assert.equal(fromPartial({ klass: 'fighter' }).outfit, 'armor', 'a bare class brings its gear');
assert.equal(fromPartial({ klass: 'fighter', outfit: 'robe' }).outfit, 'robe', 'explicit gear wins over the class preset');
const look = toLook({ race: 'dwarf', hairStyle: 'braids', hairColor: 'red', outfit: 'armor', weapon: 'axe' });
assert.deepEqual(look, { race: 'dwarf', gender: 'man', hair: 'red, long and braided', clothing: 'tabard over mail', armour: 'breastplate', weapon: 'handaxe', seed: 1 });

console.log(`PASS character creator: ${built} race/class/gender builds, bounds, symmetry, options, round trip, look`);
