import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeCreation, creatorEntries } from '../../geez/character-creator-model.js';
import { characterStats } from '../../geez/equipment-modifiers.js';
import { sheetRolls } from '../../geez/sheet-rolls.js';
import { spellCast } from '../../geez/spell-model.js';
import { changeFeat } from '../../geez/feats-model.js';
import { changeEffects } from '../../geez/effects-model.js';

const character = () => ({ name: 'Test PC', stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  combat: { ac: 12, hp_max: 20, hp_current: 15, speed: 30 }, notes: 'Keep me', inventory: {}, spellcasting: { spell_save_dc: 15, spell_attack_bonus: 6 } });
const effect = { name: 'Bargain', description: 'Custom rule.', mode: 'activated', category: 'Ability', consume: false,
  inventoryKey: '', max: 1, recharge: 'daily', duration_minutes: 1, modifiers: [] };

test('custom spell dice and explicit bonuses override a same-name SRD spell', () => {
  const original = character();
  const pc = changeCreation(original, { kind: 'Spell', key: 'spell', expected: null, value: { name: 'Fire Bolt', description: 'Blue cheese fire.',
    level: 0, prepared: true, concentration: false, cast_time: '1 action', range: '60 feet', duration: 'Instantaneous',
    damage: '1d6+2', healing: '', to_hit: 3, save_stat: 'dex', save_dc: 12 } });
  const cast = spellCast(pc, 'spell', 0, { 'fire bolt': { level: 0, attack_type: 'ranged', damage: { damage_at_character_level: { 1: '9d10' } } } });
  assert.equal(cast.info.description, 'Blue cheese fire.');
  assert.ok(cast.rolls.some(roll => roll.expression === '1d6+2'));
  assert.ok(cast.rolls.some(roll => roll.expression === '1d20+3'));
  assert.match(cast.message, /DC 12/);
  assert.equal(original.spellcasting.spells, undefined);
});

test('a created weapon is both a bag item and a rollable attack; retry does not duplicate it', () => {
  const action = { kind: 'Weapon', key: 'weapon', expected: null, linkedExpected: null,
    value: { name: 'Laughing Dagger', description: 'Giggles on a miss.', to_hit: 3, damage: '1d4+1', damage_type: 'piercing', ability: 'dex', weight: 1 } };
  const pc = changeCreation(character(), action);
  assert.equal(pc.inventory.weapon.name, 'Laughing Dagger');
  assert.equal(pc.attacks.weapon.inventoryKey, 'weapon');
  assert.equal(sheetRolls(pc).Weapons[0].expression, '1d20+3');
  assert.deepEqual(changeCreation(pc, action), pc);
  assert.equal(pc.notes, 'Keep me');
});

test('items retain metadata and equipped numeric modifiers reach calculated stats', () => {
  const action = { kind: 'Item', key: 'ring', expected: null, value: { name: 'Cheese Ring', description: 'Ripens at dusk.', category: 'Adventuring Gear', qty: 1,
    weight: 0, modifiers: { ac: 1, stats: { dex: 2 }, skills: {} }, consumable: null } };
  let pc = changeCreation(character(), action);
  pc.inventory.ring.extra = 'Preserve me';
  // Equipment matches names, including custom helmets/crowns in the helmet slot.
  pc.equipped = { helmet: 'Cheese Ring' };
  assert.equal(characterStats(pc).ac, 13);
  assert.equal(characterStats(pc).stats.dex, 12);
  const edited = changeCreation(pc, { ...action, expected: structuredClone(pc.inventory.ring), value: { ...action.value, description: 'Aged cheese.' } });
  assert.equal(edited.inventory.ring.extra, 'Preserve me');
  assert.equal(edited.inventory.ring.desc, 'Aged cheese.');
  assert.throws(() => changeCreation(pc, { ...action, expected: pc.inventory.ring, value: { ...action.value, name: 'Renamed' } }), /Unequip/);
});

test('narrative feats track activations, descriptions, and daily recharges without fake stat modifiers', () => {
  const pc = changeCreation(character(), { kind: 'Feat', key: 'abilities:invisible', expected: null,
    value: { ...effect, name: 'Invisible Bones Giggles', description: 'Invisible for one minute. DC 12 WIS each turn or laugh and end invisibility.' } });
  assert.equal(creatorEntries(pc, 'Feat')[0].name, 'Invisible Bones Giggles');
  changeFeat(pc, { type: 'use', id: 'abilities:invisible' });
  assert.equal(pc.abilities.invisible.current, 0);
  assert.equal(pc.activeEffects['abilities:invisible'].remainingMinutes, 1);
  assert.match(pc.abilities.invisible.description, /DC 12 WIS/);
  changeEffects(pc, { type: 'reset', recharge: 'daily' });
  assert.equal(pc.abilities.invisible.current, 1);
  assert.equal(pc.activeEffects['abilities:invisible'], undefined);
});

test('permanent stat modifiers and base stats use the shared calculation and validation', () => {
  const pc = character();
  const modified = changeCreation(pc, { kind: 'Stat', key: 'effects:hp', expected: null,
    value: { name: 'Heart of Cheese', description: 'Permanent maximum HP.', target: 'hp_max', operation: 'add', value: 6 } });
  assert.equal(characterStats(modified).hpMax, 26);
  assert.equal(pc.combat.hp_max, 20);
  const base = changeCreation(pc, { kind: 'Stat', expected: 12, value: { target: 'ac', operation: 'base', value: 14 } });
  assert.equal(base.combat.ac, 14);
  assert.throws(() => changeCreation(pc, { kind: 'Stat', expected: 12, value: { target: 'ac', operation: 'base', value: -1 } }), /whole number/);
});

test('stale writes, unsafe keys, invalid formulas, and overweight additions are rejected without changing the input', () => {
  const pc = character(), snapshot = structuredClone(pc);
  pc.feats = { old: { name: 'Existing feat', description: 'Keep this' } };
  assert.throws(() => changeCreation(pc, { kind: 'Feat', key: 'feats:old', expected: null, value: effect }), /changed elsewhere/);
  assert.throws(() => changeCreation(pc, { kind: 'Effect', key: 'effects:__proto__', expected: null, value: effect }), /Invalid record key/);
  assert.throws(() => changeCreation(pc, { kind: 'Weapon', key: 'bad', expected: null,
    value: { name: 'Bad', description: '', ability: 'str', damage: 'javascript:alert(1)', to_hit: 1 } }), /formula|dice|expression/i);
  assert.throws(() => changeCreation(pc, { kind: 'Item', key: 'heavy', expected: null,
    value: { name: 'Anvil', description: '', category: 'Adventuring Gear', qty: 1, weight: 1000, modifiers: {} } }), /carrying capacity/);
  assert.deepEqual({ ...pc, feats: undefined }, { ...snapshot, feats: undefined });
});
