// New session tools: effective stats, custom spells, creator list saves, loot, NPCs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { effectivePC } from '../geez/effective.js';
import { recipeFor } from '../recipes.js';
import { changeCreation } from '../geez/character-creator-model.js';
import { featEntries } from '../geez/feats-model.js';
import { addCard } from '../geez/card-model.js';
import { applyLoot, splitCoins } from '../gm/loot-model.js';
import { rollNpc, npcEntity } from '../gm/npc-model.js';
import { encodeTree, decodeTree } from '../geez/firebase-codec.js';
import { validate } from '../gaia-core/validate.mjs';

const json = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));
const reference = Object.fromEntries((await Promise.all(['spells', 'skills', 'equipment', 'magic_items'].map((n) => json(`../../data/${n}.json`)))).flat().map((x) => [x.name.toLowerCase(), x]));
const hero = () => ({
  name: 'Test', level: 5, stats: { str: 14, dex: 16, con: 12, int: 10, wis: 16, cha: 8 },
  combat: { ac: 15, speed: 30, hp_current: 30, hp_max: 38, proficiency_bonus: 3, initiative_bonus: 3 },
  saves: { str: 2, dex: 6, con: 1, int: 0, wis: 6, cha: -1, proficient: ['dex', 'wis'] },
  skills: { stealth: { bonus: 6, proficient: true }, perception: { bonus: 6, proficient: true } },
  senses: { passive_perception: 16 }, spellcasting: { ability: 'wis', spell_save_dc: 14, spell_attack_bonus: 6, spells: [{ name: 'Guidance', level: 0 }], slots: [0, 4] },
  attacks: [{ name: 'Longsword', to_hit: '+5', damage: '1d8+2', damage_type: 'slashing' }],
  inventory: { vest: { name: 'Odd Vest', category: 'Armor', qty: 1, modifiers: { ac: 2, stats: { dex: 2 }, skills: { stealth: 1 } } } },
  equipped: {}, abilities: {}
});
const total = (recipe, i = 0) => recipe.rolls[i].parts.reduce((n, p) => n + (p.flat || 0), 0);

test('equipped item bonuses reach the display copy and the rolls, and the stored record is untouched', () => {
  const stored = hero(), before = structuredClone(stored);
  assert.equal(effectivePC(stored, reference).combat.ac, 15);
  stored.equipped.armor = before.equipped.armor = 'Odd Vest';
  const fx = effectivePC(stored, reference);
  assert.deepEqual(stored, before);
  assert.equal(fx.combat.ac, 17);
  assert.equal(fx.stats.dex, 18);
  assert.equal(fx.saves.dex, 7);
  assert.equal(fx.combat.initiative_bonus, 4);
  assert.equal(fx.skills.stealth.bonus, 8);
  assert.equal(total(recipeFor(fx, { kind: 'save', key: 'dex' })), 7);
  assert.equal(total(recipeFor(fx, { kind: 'skill', key: 'stealth' })), 8);
});

test('effects on saves, spell attack, spell DC, attacks and damage are counted once', () => {
  const stored = hero();
  stored.effects = { e: { label: 'Blessing', mode: 'passive', modifiers: [['save:wis', 2], ['spell_attack', 1], ['spell_dc', 1], ['attack_bonus', 1], ['damage_bonus', 2]].map(([target, value]) => ({ target, operation: 'add', value })) } };
  stored.spellcasting.spells.push({ name: 'Homebrew Zap', level: 0, custom: true, damage: '1d10', save_stat: '', to_hit: null });
  const fx = effectivePC(stored, reference);
  assert.equal(fx.saves.wis, 8);
  assert.equal(total(recipeFor(fx, { kind: 'save', key: 'wis' })), 8);
  assert.equal(fx.spellcasting.spell_save_dc, 15);
  assert.equal(fx.attacks[0].to_hit, '+6');
  assert.equal(fx.attacks[0].damage, '1d8+4');
  assert.equal(total(recipeFor(fx, { kind: 'attack', attack: fx.attacks[0] })), 6);
});

test('a custom spell uses its own dice, healing, attack bonus and DC, even with an SRD name', () => {
  const pc = hero();
  pc.spellcasting.spells = [{ name: 'Fire Bolt', level: 0, custom: true, to_hit: 9, damage: '3d4+1', healing: '', save_stat: '' },
    { name: 'Mud Balm', level: 1, custom: true, healing: '2d6', damage: '', save_stat: 'con', save_dc: 17, to_hit: null }];
  const spells = Object.values(reference).filter((x) => x.url?.includes('/spells/'));
  const bolt = recipeFor(pc, { kind: 'spell', name: 'Fire Bolt' }, { spells });
  assert.equal(total(bolt), 9);
  assert.match(bolt.rolls[1].expr, /3d4\+1/);
  const balm = recipeFor(pc, { kind: 'spell', name: 'Mud Balm' }, { spells });
  assert.equal(balm.dc, 17);
  assert.equal(balm.rolls[0].expr, '2d6');
});

test('creator spells and weapons survive saving on characters that store them as lists', () => {
  let pc = hero();
  const spell = { kind: 'Spell', key: 'new-spell', expected: null, value: { name: 'Mud Balm', description: 'Squelch.', level: 1, prepared: true, concentration: false, cast_time: '1 action', range: 'Touch', duration: 'Instantaneous', damage: '', healing: '2d6', save_stat: '', to_hit: null, save_dc: null } };
  pc = changeCreation(pc, spell);
  pc = changeCreation(pc, spell); // a retry must not add it twice
  pc = changeCreation(pc, { kind: 'Weapon', key: 'new-weapon', value: { name: 'Eel Whip', description: '', to_hit: 4, damage: '1d6', damage_type: 'lightning', ability: 'dex', weight: 2 } });
  const stored = decodeTree(encodeTree(JSON.parse(JSON.stringify(pc))));
  assert.deepEqual(stored.spellcasting.spells.map((s) => s.name), ['Guidance', 'Mud Balm']);
  assert.deepEqual(stored.attacks.map((a) => a.name), ['Longsword', 'Eel Whip']);
  assert.equal(stored.inventory['new-weapon'].name, 'Eel Whip');
});

test('card feats and creator feats are both listed, and card feats only while equipped', () => {
  const pc = hero();
  addCard(pc, { name: 'The Eel', feats: [{ name: 'Slippery', description: 'Wriggle.' }], equip: false }, 'card1');
  assert.deepEqual(featEntries(pc).map((f) => f.name), []);
  pc.equipped = { card: 'The Eel', card_key: 'card1' };
  assert.deepEqual(featEntries(pc).map((f) => f.name), ['Slippery']);
});

test('loot arrives once, stacks identical items, splits coins and adds weapons', () => {
  assert.deepEqual(splitCoins({ gp: 10, sp: 1 }, 3).map((c) => [c.gp, c.sp]), [[4, 1], [3, 0], [3, 0]]);
  const pc = hero(); pc.inventory.rope = { name: 'Rope', qty: 1, category: 'Gear', desc: '' }; pc.coin_purse = { gp: 5 };
  const loot = { id: 'send-1', coins: { gp: 7 }, entries: [
    { id: 'a', kind: 'item', name: 'Rope', qty: 2, record: { category: 'Gear', desc: '' } },
    { id: 'b', kind: 'weapon', name: 'Eel Whip', value: { name: 'Eel Whip', description: '', to_hit: 4, damage: '1d6', damage_type: '', ability: 'dex', weight: null } }] };
  applyLoot(pc, loot); applyLoot(pc, loot);
  assert.equal(pc.inventory.rope.qty, 3);
  assert.equal(pc.coin_purse.gp, 12);
  assert.equal(pc.attacks.filter((a) => a.name === 'Eel Whip').length, 1);
  assert.deepEqual(pc.lastLoot.items, ['Rope ×2', 'Eel Whip', '7 gp']);
});

test('every rolled NPC is complete and passes the database rules', async () => {
  const tables = await json('../../data/npc_tables.json'), monsters = await json('../../data/monsters.json');
  const schema = await json('../gaia-core/schema/gaia.schema.json');
  for (let i = 0; i < 300; i++) {
    const npc = rollNpc(tables);
    assert.ok(npc.first_name && npc.surname && npc.demeanor && npc.secret && npc.appearance.hair && npc.gear.weapon, JSON.stringify(npc));
    const entity = npcEntity('npc_abc123', npc, monsters.find((m) => m.name === 'Commoner'), 'daddies');
    assert.deepEqual(validate(schema, 'entity', entity), []);
  }
});
