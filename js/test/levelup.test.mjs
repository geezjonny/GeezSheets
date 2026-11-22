import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planCharacter, profBonus, attacksPerAction } from '../levelup.js';
const j = (f) => JSON.parse(fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8'));
const srd = { classLevels: j('data/class_levels.json'), classes: j('data/classes.json'), spells: j('data/spells.json'), skills: j('data/skills.json') };
const custom = j('data/subclass_features.json');
const snap = j('docs/backup-pcs-2026-11-21.json');
const pc = (n) => Object.values(snap).find((e) => e?.kind === 'pc' && e.name === n);
const T = { daddies: 5, disney: 4 };
const plan = (n) => { const e = pc(n); return planCharacter(e.data, T[e.campaign], srd, custom); };

test('proficiency table', () => { assert.deepEqual([1, 4, 5, 9, 13, 17].map(profBonus), [2, 2, 3, 4, 5, 6]); });
test('attack counts', () => {
  assert.deepEqual([plan('Seris').attacks.normal, plan('Seris').attacks.round1], [2, 2]);
  assert.deepEqual([plan('Liora').attacks.normal, plan('Liora').attacks.round1], [2, 3]);
  assert.equal(attacksPerAction({ class: 'Fighter', level: 11 }).normal, 3);
});
test('level-5 PCs get proficiency +3, spell DC and slots', () => {
  for (const n of ['Ashara', 'Kairon', 'Lark', 'Liora', 'Rurik', 'Seris']) assert.equal(plan(n).data.combat.proficiency_bonus, 3, n);
  assert.equal(plan('Ashara').data.spellcasting.spell_save_dc, 15);
  assert.deepEqual(plan('Ashara').data.spellcasting.slots, [null, 4, 3, 2, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(plan('Kairon').data.spellcasting.slots.slice(1, 4), [4, 3, 2]);
  assert.equal(plan('Kairon').data.level, 5);
});
test('disney PCs go to 4', () => { for (const n of ['Esmeralda', 'Jasmine', 'Kristoff', 'Merlin', 'Mushu', 'Wendy Darling']) assert.equal(plan(n).data.level, 4, n); });
test('Extra Attack and Font of Inspiration cards appear', () => {
  assert.ok(plan('Seris').data.abilities.extra_attack); assert.ok(plan('Liora').data.abilities.extra_attack);
  assert.ok(plan('Lark').data.abilities.font_of_inspiration); assert.ok(plan('Ashara').data.abilities.destroy_undead);
});
test('known and prepared spell counts', () => {
  const lev = (n, f = () => true) => plan(n).data.spellcasting.spells.filter((s) => s.level > 0 && f(s));
  assert.equal(lev('Lark').length, 8); assert.equal(lev('Rurik').length, 8);
  assert.ok(lev('Ashara').some((s) => s.level === 3));
  assert.equal(plan('Ashara').data.spellcasting.spells.filter((s) => s.level === 0).length, 4);
});
test('wrong spell level fixed, duplicate removed', () => {
  assert.equal(plan('Lark').data.spellcasting.spells.find((s) => s.name === 'Hypnotic Pattern').level, 3);
  assert.ok(!plan('Ashara').data.spellcasting.spells.some((s) => /2nd level/.test(s.name)));
});
test('numbers that depend on level', () => {
  assert.match(plan('Ashara').data.abilities.preserve_life.effect_desc, /up to 25 HP/);
  assert.match(plan('Seris').data.abilities.second_wind.effect_desc, /1d10 \+ 5/);
  assert.equal(plan('Liora').data.attacks.find((a) => a.name === 'Longbow').to_hit, '+9');
});
test('running the plan twice changes nothing more', () => {
  for (const e of Object.values(snap).filter((x) => x?.kind === 'pc' && !x.data?._sheetsDeleted)) {
    const once = planCharacter(e.data, T[e.campaign], srd, custom), twice = planCharacter(once.data, T[e.campaign], srd, custom);
    assert.deepEqual(twice.changed, [], `${e.name}: ${twice.log.join(' | ')}`);
  }
});
