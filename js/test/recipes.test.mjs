import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planCharacter } from '../levelup.js';
import { recipeFor } from '../recipes.js';
const j = (f) => JSON.parse(fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8'));
const srd = { classLevels: j('data/class_levels.json'), classes: j('data/classes.json'), spells: j('data/spells.json'), skills: j('data/skills.json') };
const custom = j('data/subclass_features.json'), snap = j('docs/backup-pcs-2026-11-21.json');
const T = { daddies: 5, disney: 4 };
const pc = (n) => { const e = Object.values(snap).find((x) => x?.kind === 'pc' && x.name === n); return planCharacter(e.data, T[e.campaign], srd, custom).data; };
const spell = (n, name, slot) => recipeFor(pc(n), { kind: 'spell', name }, { spells: srd.spells, slot });
const exprs = (r) => Object.fromEntries(r.rolls.map((x) => [x.name, x.expr]));

test('Ashara Cure Wounds: dice + WIS + Disciple of Life (2 + slot level)', () => {
  assert.equal(exprs(spell('Ashara', 'Cure Wounds', 1)).Healing, '1d8+7');
  assert.equal(exprs(spell('Ashara', 'Cure Wounds', 2)).Healing, '2d8+8');
  assert.match(spell('Ashara', 'Cure Wounds', 2).rolls[0].text, /\+4 WIS.*\+4 Disciple of Life/);
});
test('save spells give a DC, attack spells give an attack roll', () => {
  const sf = spell('Ashara', 'Sacred Flame'); assert.equal(sf.dc, 15); assert.equal(exprs(sf).Damage, '2d8'); assert.equal(sf.rolls.length, 1);
  const gb = spell('Ashara', 'Guiding Bolt', 2); assert.equal(exprs(gb)['Spell attack'], '1d20+7'); assert.equal(exprs(gb).Damage, '5d6');
});
test('slot options only list slots with uses left', () => {
  const r = spell('Ashara', 'Cure Wounds'); assert.deepEqual(r.slotOptions, [1, 2, 3]);
});
test('Liora longbow: Archery, riders, round-1 extras', () => {
  const l = pc('Liora'), r = recipeFor(l, { kind: 'attack', attack: l.attacks.find((a) => a.name === 'Longbow') }, { round1: true });
  assert.equal(exprs(r).Attack, '1d20+9'); assert.equal(exprs(r).Damage, '1d8+4');
  const names = r.rolls[1].riders.map((x) => x.label); assert.ok(names.includes("Hunter's Mark") && names.includes('Dread Ambusher'));
  assert.deepEqual([r.attacks.normal, r.attacks.round1], [2, 3]);
});
test('Seris longsword: Dueling damage and maneuver DC', () => {
  const s = pc('Seris'), r = recipeFor(s, { kind: 'attack', attack: s.attacks.find((a) => /1-hand/.test(a.name)) });
  assert.equal(exprs(r).Attack, '1d20+7'); assert.equal(exprs(r).Damage, '1d8+6');
  assert.match(r.rolls[1].riders.find((x) => x.label === 'Maneuver').note, /DC 15/);
});
test('skills, saves, initiative, death save', () => {
  assert.equal(exprs(recipeFor(pc('Ashara'), { kind: 'skill', key: 'perception' })).Check, '1d20+7');
  assert.equal(exprs(recipeFor(pc('Lark'), { kind: 'skill', key: 'performance' })).Check, '1d20+10');
  assert.equal(exprs(recipeFor(pc('Lark'), { kind: 'skill', key: 'athletics' })).Check, '1d20+1');
  assert.equal(exprs(recipeFor(pc('Liora'), { kind: 'initiative' })).Initiative, '1d20+7');
  assert.equal(exprs(recipeFor(pc('Ashara'), { kind: 'save', key: 'wis' })).Save, '1d20+7');
  assert.equal(exprs(recipeFor(pc('Ashara'), { kind: 'death' }))['Death save'], '1d20');
});
test('every PC spell and attack gets a recipe without throwing', () => {
  for (const e of Object.values(snap).filter((x) => x?.kind === 'pc' && !x.data?._sheetsDeleted)) {
    const p = pc(e.name);
    for (const s of p.spellcasting?.spells || []) recipeFor(p, { kind: 'spell', name: s.name }, { spells: srd.spells });
    for (const a of p.attacks || []) recipeFor(p, { kind: 'attack', attack: a }, { round1: true });
  }
});
