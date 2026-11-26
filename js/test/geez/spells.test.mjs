import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spellInfo, spellCast, useSpell } from '../../geez/spell-model.js';
import { spellsHTML, spellGlossaryHTML } from '../../geez/spell-view.js';
import { sheetHTML } from '../../geez/sheet-view.js';

const reference = Object.fromEntries(JSON.parse(await readFile(new URL('../../../data/spells.json', import.meta.url))).map(spell => [spell.name.toLowerCase(), spell]));
const caster = () => ({ level: 5, stats: { cha: 18 }, spellcasting: { ability: 'cha', spell_attack_bonus: 7, spell_save_dc: 15,
  slots: { 1: 2, 2: 2, 3: 1 }, slots_used: { 1: 1 }, spells: {
    bolt: { name: 'Fire Bolt', level: 0, prepared_type: 'cantrip' },
    hands: { name: 'Burning Hands', level: 1, prepared_type: 'prepared' },
    heal: { name: 'Cure Wounds', level: 1, prepared_type: 'known' },
    mark: { name: "Hunter's Mark", level: 1, damage: '1d6', damage_type: 'extra (per hit)' },
    blast: { name: 'Eldritch Blast', level: 0 }, ray: { name: 'Scorching Ray', level: 2 },
    unknown: { name: 'Custom' }, notPrepared: { name: 'Bless', level: 1, prepared: false }
  } } });

test('casting consumes exactly one shared pip and rejects exhausted slots without a refund', () => {
  const pc = caster();
  useSpell(pc, 'hands', 1, reference);
  assert.equal(pc.spellcasting.slots_used[1], 2);
  const before = structuredClone(pc);
  assert.throws(() => useSpell(pc, 'hands', 1, reference), /No spell slot/);
  assert.deepEqual(pc, before);
  useSpell(pc, 'hands', 2, reference);
  assert.equal(pc.spellcasting.slots_used[2], 1);
  const cast = spellCast(pc, 'hands', 2, reference);
  assert.match(cast.message, /DEX saving throw DC 15/);
  assert.match(cast.message, /half damage/);
  assert.equal(cast.rolls[0].expression, '4d6');
});

test('cantrips are free, scale by character level, and keep attacks separate from damage', () => {
  const pc = caster(), before = structuredClone(pc.spellcasting.slots_used);
  const cast = useSpell(pc, 'bolt', 0, reference);
  assert.deepEqual(cast.rolls.map(roll => roll.expression), ['1d20+7', '2d10']);
  assert.deepEqual(pc.spellcasting.slots_used, before);
  const blast = useSpell(pc, 'blast', 0, reference);
  assert.deepEqual(blast.rolls.map(roll => roll.expression), ['1d20+7', '1d20+7', '1d10']);
  const rays = useSpell(pc, 'ray', 3, reference);
  assert.equal(rays.rolls.filter(roll => roll.expression === '1d20+7').length, 4);
  assert.equal(rays.rolls.at(-1).expression, '2d6');
});

test('healing uses the current casting modifier and conditional per-hit damage is not rolled on casting', () => {
  const pc = caster();
  assert.equal(useSpell(pc, 'heal', 2, reference).rolls[0].expression, '2d8+4');
  const mark = useSpell(pc, 'mark', 1, reference);
  assert.equal(mark.rolls.length, 0);
  assert.match(mark.message, /No automatic roll/);
  assert.equal(mark.info.castingTime, '1 bonus action');
});

test('invalid spells and unprepared spells cannot consume slots; large rolls split safely', () => {
  const pc = caster(), before = structuredClone(pc.spellcasting.slots_used);
  for (const key of ['unknown', 'notPrepared', 'missing']) assert.throws(() => useSpell(pc, key, 1, reference));
  assert.deepEqual(pc.spellcasting.slots_used, before);
  pc.spellcasting.spells.custom = { name: 'Custom burst', level: 1, damage: '14d6', save_stat: 'dex' };
  assert.deepEqual(useSpell(pc, 'custom', 1, reference).rolls.map(roll => roll.expression), ['12d6', '2d6']);
  assert.match(spellCast(pc, 'custom', 2, reference).message, /Add the 2 damage roll totals/);
});

test('spell list exposes shared pips and use/glossary buttons; the glossary escapes custom data', () => {
  const pc = caster();
  const own = spellsHTML(pc, reference, true), other = spellsHTML(pc, reference, false);
  assert.match(own, /<h3>Cantrips<\/h3>/); assert.match(own, /<h3>Spells<\/h3>/);
  assert.match(own, /data-spell-use/); assert.match(own, /data-spell-cast-level/);
  assert.match(own, /data-slot-level="1"/);
  assert.doesNotMatch(other, /data-spell-use(?! disabled)/);
  assert.doesNotMatch(other, /data-slot-pip="\d+" aria-pressed="[^"]+" aria-label="[^"]+">/);
  pc.spellcasting.spells.custom = { name: '<Custom>', level: 2, cast_time: '1 bonus action', range: '60 ft', duration: '1 minute', prepared_type: 'prepared', description: '<script>bad()</script>' };
  const glossary = spellGlossaryHTML(spellInfo(pc, 'custom', reference));
  for (const field of ['&lt;Custom&gt;', 'Prepared status', 'prepared', '1 bonus action', '60 ft', '1 minute', '&lt;script&gt;']) assert.ok(glossary.includes(field));
  assert.doesNotMatch(glossary, /<script>/);
});

test('another character’s six sections have no usable mutation controls', () => {
  const pc = caster(); pc.inventory = { sword: { name: 'Sword', qty: 1 } };
  for (const section of ['Stats', 'Weapons', 'Inventory', 'Feats', 'Spells', 'Effects']) {
    const html = sheetHTML(pc, section, reference, false, false);
    assert.doesNotMatch(html, /data-combat-field|data-base-stat|data-effect-form|data-effect-action|data-bag-menu|data-sheet-roll/);
  }
  assert.match(sheetHTML(pc, 'Inventory', reference), /data-equipment-slot="armor"[^>]* disabled/);
});
