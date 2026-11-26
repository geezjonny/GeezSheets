// The companion's turn list, critical dice and "?" explanations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { turnOptions, criticalDice, openSlot, spendable } from '../companion-model.js';
import { HELP, ask } from '../companion-help.js';
import { SKILLS } from '../rollcall.js';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

test('the turn list groups by what each option costs and leaves out unprepared spells and passives', () => {
  const pc = {
    attacks: [{ name: 'Mace' }, { name: 'Sacred Flame (cantrip)' }],
    spellcasting: { spells: [{ name: 'Light', cast_time: '1 action' }, { name: 'Healing Word', cast_time: '1 bonus action' }, { name: 'Shield', cast_time: '1 reaction' }, { name: 'Augury', cast_time: '1 minute' }, { name: 'Bane', prepared: false }] },
    abilities: { a: { label: 'Preserve Life', activation: 'action', kind: 'charge', max: 1 }, b: { label: 'Divinity', activation: 'none', kind: 'charge', max: 2 }, c: { label: 'Disciple of Life', activation: 'none', kind: 'passive', max: 1 } }
  };
  const names = Object.fromEntries(Object.entries(turnOptions(pc, pc)).map(([k, v]) => [k, v.map((x) => x.name)]));
  assert.deepEqual(names, { action: ['Mace', 'Light', 'Preserve Life'], bonus: ['Healing Word'], reaction: ['Shield'], resources: ['Divinity'], longer: ['Augury'] });
});

test('critical hits double dice but not bonuses, slots fall back upwards and passives have no use bubbles', () => {
  assert.equal(criticalDice('1d8+3+d6'), '2d8+3+2d6');
  assert.equal(openSlot({ slots: [0, 2, 1], slots_used: [0, 2, 0] }, 1), 2);
  assert.equal(openSlot({ slots: [0, 2], slots_used: [0, 2] }, 1), 0);
  assert.equal(spendable({ kind: 'passive', max: 1 }), null);
  assert.deepEqual(spendable({ kind: 'charge', max: 3, current: 1 }), { max: 3, current: 1 });
});

test('every "?" in the companion has an explanation', async () => {
  const source = (await Promise.all(['../companion.js', '../companion-extras.js'].map(read))).join('\n');
  const used = [...source.matchAll(/ask\('(\w+)'\)|data-help="([a-zA-Z_]+)"/g)].map((m) => m[1] || m[2]);
  const cardKeys = [...source.matchAll(/, '(slots|death|concentration|action|bonus|reaction|uses|leveled|cantrips|skills|abilities|passive|equipped|consumables|features|effects|card)'\)/g)].map((m) => m[1]);
  const all = [...used, ...cardKeys, ...SKILLS.map((s) => s[0]), 'str', 'dex', 'con', 'int', 'wis', 'cha', 'initiative', 'speed', 'passive'];
  assert.ok(used.length > 15);
  assert.deepEqual([...new Set(all)].filter((key) => !HELP[key]), []);
  for (const key of Object.keys(HELP)) assert.match(ask(key), new RegExp(`data-help="${key}"`));
});
