import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateItemEdit } from '../../geez/item-modifiers.js';
import { equippedModifiers, equippedAC } from '../../geez/equipment-modifiers.js';
import { sheetRolls } from '../../geez/sheet-rolls.js';
import { sheetHTML } from '../../geez/sheet-view.js';

const reference = {
  acrobatics: { index: 'acrobatics', name: 'Acrobatics', url: '/api/2014/skills/acrobatics', ability_score: { index: 'dex' } },
  rapier: { weapon_category: 'Martial', weapon_range: 'Melee', properties: [{ index: 'finesse' }] }
};
const character = () => ({
  stats: { dex: 14, str: 10 }, combat: { ac: 15, initiative_bonus: 4 },
  skills: { acrobatics: { bonus: 4 } }, saves: { dex: { bonus: 4 } },
  equipped: { armor: 'Enchanted Coat' },
  inventory: { coat: { name: 'Enchanted Coat', qty: 3, category: 'Armor', modifiers: { ac: 1, stats: { dex: 2 }, skills: { acrobatics: 2 } } } },
  attacks: [{ name: 'Rapier', to_hit: '+4', damage: '1d8+2 piercing' }]
});

test('empty inventory quantities, unequipped gear, duplicate slots and legacy shields do not stack extra copies', () => {
  const pc = character();
  pc.equipped.helmet = pc.equipped.armor;
  assert.equal(equippedModifiers(pc).ac, 1);
  pc.inventory.coat.qty = 0;
  assert.equal(equippedModifiers(pc).ac, 0);
  pc.inventory.shield = { name: 'Shield', modifiers: { ac: 2 } };
  pc.inventory.otherShield = { name: 'Other Shield', modifiers: { ac: 5 } };
  pc.equipped.shield = true;
  assert.equal(equippedModifiers(pc).ac, 2);
});

test('item edit validation accepts signed modifiers, custom descriptions and existing categories', () => {
  const value = { name: ' Coat ', category: 'Armor', qty: 1, desc: 'Custom text', modifiers: { ac: 1, stats: { dex: -2 }, skills: { acrobatics: 3 } } };
  assert.equal(validateItemEdit(value, {}).name, 'Coat');
  assert.deepEqual(validateItemEdit(value, {}).modifiers, value.modifiers);
  assert.equal(validateItemEdit({ ...value, category: '' }, {}).category, '');
  for (const patch of [{ name: '' }, { category: 'Made up' }, { qty: -1 }, { qty: 0.5 }, { desc: 'x'.repeat(20001) }, { modifiers: { ac: Infinity } }, { modifiers: { stats: { dex: '2' } } }, { modifiers: { skills: { unknown: 1 } } }]) {
    assert.throws(() => validateItemEdit({ ...value, ...patch }, {}));
  }
});

test('Inventory displays escaped modifier details and all five GM coin controls, even without a purse', () => {
  const pc = character();
  pc.inventory.coat.desc = '<script>Custom</script>';
  const html = sheetHTML(pc, 'Inventory', reference, false, true);
  assert.match(html, /AC \+1/);
  assert.match(html, /dex \+2/);
  assert.match(html, /acrobatics \+2/);
  assert.match(html, /&lt;script&gt;Custom&lt;\/script&gt;/);
  for (const coin of ['pp', 'gp', 'ep', 'sp', 'cp']) assert.equal((html.match(new RegExp(`data-coin="${coin}"`, 'g')) || []).length, 2);
  assert.doesNotMatch(sheetHTML(pc, 'Inventory'), /data-coin-delta/);
  assert.match(sheetHTML(pc, 'Stats'), /AC<\/span><strong>16/);
  assert.match(sheetHTML(pc, 'Stats', {}, true, true), /AC total<\/span><strong>16/);
});
