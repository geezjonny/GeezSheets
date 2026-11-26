import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BARK_ARM, changeEffects, applyModifiers } from '../../geez/effects-model.js';
import { characterStats } from '../../geez/equipment-modifiers.js';
import { sheetRolls } from '../../geez/sheet-rolls.js';
import { sheetHTML } from '../../geez/sheet-view.js';
import { changeCombat } from '../../geez/sheet-combat.js';
import { encodeTree, decodeTree } from '../../geez/firebase-codec.js';

const reference = {
  'leather armor': { armor_class: { base: 11, dex_bonus: true } },
  'half plate': { armor_class: { base: 15, dex_bonus: true, max_bonus: 2 } },
  'plate': { armor_class: { base: 18, dex_bonus: false } },
  acrobatics: { index: 'acrobatics', name: 'Acrobatics', url: '/api/2014/skills/acrobatics', ability_score: { index: 'dex' } },
  longsword: { weapon_category: 'Martial', weapon_range: 'Melee' }
};
const lark = () => ({ name: 'Lark', level: 5, stats: { str: 10, con: 12, dex: 14, int: 12, wis: 12, cha: 18 },
  combat: { ac: 14, speed: 35, hp_current: 25, hp_max: 33, initiative_bonus: 2 },
  saves: { dex: { bonus: 5 }, con: { bonus: 1 } }, skills: { acrobatics: { bonus: 5 } },
  attacks: [{ name: 'Longsword', to_hit: '+3', damage: '1d8' }],
  spellcasting: { ability: 'cha', spell_attack_bonus: 7, spell_save_dc: 15 },
  equipped: { armor: 'Leather Armor' }, inventory: { leather: { name: 'Leather Armor', category: 'Armor', qty: 1 } }
});
function activate(pc, id = 'effects:bark') {
  changeEffects(pc, { type: 'save', id, value: structuredClone(BARK_ARM) });
  changeEffects(pc, { type: 'activate', id });
}

test('sheet.html and right-click Stats render the same final values, separate from editable bases', () => {
  const pc = lark(); activate(pc);
  for (const [editable, gm] of [[false, false], [true, false], [true, true]]) {
    const html = sheetHTML(pc, 'Stats', reference, true, editable, gm);
    for (const [label, value] of [['STR', 12], ['DEX', 7], ['CON', 14], ['INT', 12], ['WIS', 12], ['CHA', 18], ['SPD (ft)', 17]]) {
      assert.ok(html.includes(`${label}</span><strong>${value}</strong>`), label);
    }
    assert.match(html, /AC(?: total)?<\/span><strong>16/);
    assert.match(html, /Bark Arm/);
    if (editable && gm) assert.match(html, /data-base-stat="dex"[^>]*value="14"/);
    else assert.doesNotMatch(html, /data-base-stat/);
    if (editable && gm) {
      assert.match(html, /Maximum HP total<\/span><strong>38/);
      assert.match(html, /data-combat-field="speed"[^>]*value="35"/);
    } else if (editable) {
      assert.match(html, /value="25"> \/ 38/);
      assert.doesNotMatch(html, /data-combat-field="(?:speed|ac|hp_max)"|data-ac-mode/);
    } else assert.match(html, /25 \/ 38/);
  }
  assert.match(sheetHTML(pc, 'Effects', reference, false, true, true), /1\/2 uses/);
  assert.match(sheetHTML(pc, 'Effects', reference, false, true, true), /60 min left/);
});

test('uses, non-stacking, game-time expiration, and recharge survive a Firebase round trip', () => {
  let pc = lark(); activate(pc);
  assert.throws(() => changeEffects(pc, { type: 'activate', id: 'effects:bark' }), /already active/);
  pc = decodeTree(JSON.parse(JSON.stringify(encodeTree(pc))));
  assert.equal(characterStats(pc).speed, 17);
  changeEffects(pc, { type: 'advance', minutes: 59 });
  assert.equal(pc.activeEffects['effects:bark'].remainingMinutes, 1);
  changeEffects(pc, { type: 'advance', minutes: 1 });
  assert.equal(characterStats(pc).speed, 35);
  changeEffects(pc, { type: 'activate', id: 'effects:bark' });
  changeEffects(pc, { type: 'end', id: 'effects:bark' });
  assert.throws(() => changeEffects(pc, { type: 'activate', id: 'effects:bark' }), /No uses/);
  changeEffects(pc, { type: 'reset', recharge: 'long_rest' });
  assert.equal(pc.effects.bark.current, 0);
  changeEffects(pc, { type: 'reset', recharge: 'daily' });
  assert.equal(pc.effects.bark.current, 2);
});

test('armor formulas use final DEX, apply caps, and retain stored AC unless explicitly selected', () => {
  const pc = lark(); activate(pc);
  changeCombat(pc, { type: 'ac-mode', value: 'armor' });
  assert.equal(characterStats(pc, reference).ac, 11);
  pc.equipped.armor = 'Half Plate'; pc.inventory.half = { name: 'Half Plate', qty: 1 };
  assert.equal(characterStats(pc, reference).ac, 15);
  pc.equipped.armor = 'Plate'; pc.inventory.plate = { name: 'Plate', qty: 1 };
  assert.equal(characterStats(pc, reference).ac, 20);
  delete pc.equipped.armor;
  assert.equal(characterStats(pc, reference).ac, 10);
  pc.equipped.armor = 'Custom'; pc.inventory.custom = { name: 'Custom', qty: 1, armor_class: { base: 13, dex_bonus: true, max_bonus: 2 } };
  assert.equal(characterStats(pc).ac, 13);
});

test('equipped effects apply once; consumables spend one item atomically and indefinite effects persist', () => {
  let pc = lark();
  pc.inventory.potion = { name: 'Potion', qty: 2, category: 'Consumable' };
  const effect = { ...BARK_ARM, label: 'Potion', max: 0, duration_minutes: 0, inventoryKey: 'potion', consume: true };
  changeEffects(pc, { type: 'save', id: 'effects:potion', value: effect });
  changeEffects(pc, { type: 'activate', id: 'effects:potion' });
  assert.equal(pc.inventory.potion.qty, 1);
  pc = decodeTree(JSON.parse(JSON.stringify(encodeTree(pc))));
  changeEffects(pc, { type: 'advance', minutes: 120 });
  assert.equal(characterStats(pc).speed, 17);
  changeEffects(pc, { type: 'end', id: 'effects:potion' });
  changeEffects(pc, { type: 'save', id: 'effects:armor', value: { ...BARK_ARM, mode: 'equipped', max: 0, inventoryKey: 'leather' } });
  assert.equal(characterStats(pc).speed, 17);
  delete pc.equipped.armor;
  assert.equal(characterStats(pc).speed, 35);
});

test('base-score edits recalculate stored rolls and spell math, including while effects are active', () => {
  const pc = lark(); activate(pc);
  changeCombat(pc, { type: 'base-stat', field: 'str', value: 14 });
  changeCombat(pc, { type: 'base-stat', field: 'dex', value: 18 });
  changeCombat(pc, { type: 'base-stat', field: 'cha', value: 20 });
  assert.equal(characterStats(pc).stats.str, 16);
  assert.equal(sheetRolls(pc, reference).Weapons[0].bonus, 6);
  assert.equal(sheetRolls(pc, reference)['Saving Throws'][1].bonus, 2);
  assert.equal(characterStats(pc).spellAttack, 8);
  assert.equal(characterStats(pc).spellDC, 16);
});

test('effects reject malformed input and combine set/add/multiply in a predictable order', () => {
  const pc = lark();
  for (const patch of [{ label: '' }, { max: -1 }, { duration_minutes: NaN }, { modifiers: [{ target: '__proto__', operation: 'add', value: 1 }] },
    { modifiers: [{ target: 'str', operation: 'multiply', value: -1 }] }, { inventoryKey: 'missing', consume: true }]) {
    assert.throws(() => changeEffects(pc, { type: 'save', id: 'effects:bad', value: { ...BARK_ARM, ...patch } }));
  }
  assert.throws(() => changeEffects(pc, { type: 'save', id: 'effects:__proto__', value: BARK_ARM }));
  assert.equal(applyModifiers(10, 'str', [{ target: 'str', operation: 'multiply', value: .5 }, { target: 'str', operation: 'add', value: 2 }, { target: 'str', operation: 'set', value: 20 }]), 11);
});

test('set effects retain equipment additions before multipliers, with no double counting', () => {
  const pc = lark();
  pc.inventory.leather.modifiers = { ac: 1, stats: { str: 2 }, skills: { acrobatics: 2 } };
  changeEffects(pc, { type: 'save', id: 'effects:set', value: { ...BARK_ARM, mode: 'passive', modifiers: [
    { target: 'str', operation: 'set', value: 18 }, { target: 'str', operation: 'multiply', value: .5 },
    { target: 'ac', operation: 'set', value: 16 }
  ] } });
  const final = characterStats(pc, reference);
  assert.equal(final.stats.str, 10);
  assert.equal(final.ac, 17);
  assert.equal(sheetRolls(pc, reference)['Skill Checks'][0].bonus, 7);
});


test('consumption preserves equipped items and depleted uses leave inventory unchanged', () => {
  const pc = lark();
  changeEffects(pc, { type: 'save', id: 'effects:consume', value: { ...BARK_ARM, consume: true, inventoryKey: 'leather' } });
  assert.throws(() => changeEffects(pc, { type: 'activate', id: 'effects:consume' }), /Unequip/);
  assert.equal(pc.effects.consume.current, 2);
  assert.equal(pc.inventory.leather.qty, 1);
  delete pc.equipped.armor;
  pc.effects.consume.current = 0;
  assert.throws(() => changeEffects(pc, { type: 'activate', id: 'effects:consume' }), /No uses/);
  assert.equal(pc.inventory.leather.qty, 1);
  assert.equal(pc.activeEffects, undefined);
});

// Life drain: d4 each turn / every 10 game minutes, never below the floor, none for inactive effects.
test('life drain rolls each turn and over game time, never below its floor', async () => {
  const { applyDrain, validateEffect } = await import('../../geez/effects-model.js');
  const make = hp => ({ combat: { hp_current: hp, hp_max: 33 }, effects: { bark: { label: 'Bark Arm', mode: 'activated', max: 2, current: 1, recharge: 'daily', duration_minutes: 60, modifiers: [{ target: 'str', operation: 'add', value: 2 }], drain: { sides: 4, perTurn: true, everyMinutes: 10, floor: 1 } } }, activeEffects: { 'effects:bark': { remainingMinutes: 60 } } });
  const seq = (...v) => { let i = 0; return () => (v[i++] - 1) / 4 + .01; }; // returns the next die value
  let pc = make(25);
  let out = applyDrain(pc, { turn: true }, seq(3));
  assert.equal(pc.combat.hp_current, 22); assert.deepEqual(out[0].rolls, [3]); assert.equal(out[0].taken, 3);
  out = applyDrain(pc, { minutes: 25 }, seq(2, 4)); // two full 10-minute ticks, 5 minutes carried
  assert.equal(pc.combat.hp_current, 16); assert.equal(pc.activeEffects['effects:bark'].drainCarry, 5);
  pc = make(3); applyDrain(pc, { turn: true }, seq(4)); assert.equal(pc.combat.hp_current, 1); // floor
  pc = make(1); assert.equal(applyDrain(pc, { turn: true }, seq(4))[0].taken, 0); assert.equal(pc.combat.hp_current, 1);
  pc = make(25); delete pc.activeEffects['effects:bark']; assert.deepEqual(applyDrain(pc, { turn: true }, seq(4)), []);
  pc = make(25); changeEffects(pc, { type: 'advance', minutes: 60, noDrain: true }); assert.equal(pc.combat.hp_current, 25);
  assert.throws(() => validateEffect({ ...make(1).effects.bark, consume: false, inventoryKey: '', drain: { sides: 0 } }));
  assert.deepEqual(validateEffect({ ...make(1).effects.bark, consume: false, inventoryKey: '' }).drain, { sides: 4, perTurn: true, everyMinutes: 10, floor: 1 });
});
