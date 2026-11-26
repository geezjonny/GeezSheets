// Item facts, packs, the AC breakdown, and moving items between characters without losing any.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findItem, worth, statLine, packContents, acBreakdown, healingDice } from '../companion-items.js';
import { take, heal, sendItem, drinkHealing } from '../companion-transfer.js';
import { featText } from '../companion-help.js';
import { setPlayerIdentity } from '../geez/session-role.js';
import { rechargeEffects } from '../geez/effects-model.js';
import { encodeTree, decodeTree } from '../geez/firebase-codec.js';

const json = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));
const reference = Object.fromEntries((await Promise.all(['equipment', 'magic_items'].map((n) => json(`../../data/${n}.json`)))).flat().map((x) => [x.name.toLowerCase(), x]));

test('weapons, armor and potions say what they do and what they cost', () => {
  assert.match(statLine({ name: 'Dagger' }, reference), /^1d4 piercing · .*Finesse.*Thrown 20\/60 ft/);
  assert.match(statLine({ name: 'Rapier' }, reference), /^1d8 piercing · Finesse$/);
  assert.match(statLine({ name: 'Hand Crossbow' }, reference), /Range 30\/120 ft/);
  assert.match(statLine({ name: 'Longsword' }, reference), /1d10 two-handed/);
  assert.match(statLine({ name: 'Chain Mail' }, reference), /AC 16 · Heavy armor · Disadvantage on Stealth/);
  assert.match(statLine({ name: 'Studded Leather' }, reference), /AC 12 \+ DEX/);
  assert.equal(statLine({ name: 'Shield' }, reference), '+2 AC');
  assert.equal(worth({ name: 'Rapier' }, reference), '25 gp');
  assert.equal(worth({ name: 'Potion of Healing' }, reference), '50 gp');
  assert.match(worth({ name: 'Mystery Gem', rarity: 'Uncommon' }, reference), /101–500 gp/);
  assert.equal(worth({ name: 'a single boot, still good' }, reference), '');
  assert.equal(healingDice({ name: 'Potion of Greater Healing' }), '4d4+4');
  assert.ok(findItem('Belt Pouch', reference).name);
});

test("an entertainer's pack lists each thing on its own line", () => {
  const lines = packContents({ name: "Entertainer's Pack" }, reference);
  assert.equal(lines.length, 7);
  assert.ok(lines.every((l) => l.name && l.qty >= 1));
  assert.ok(lines.some((l) => l.name === 'Candle' && l.qty === 5 && l.worth === '1 cp'));
});

test('the armor breakdown explains the number and flags a sheet that disagrees', () => {
  const pc = { combat: { ac: 18 }, stats: { dex: 14 }, equipped: { armor: 'Chain Mail', shield: true }, inventory: {} };
  const right = acBreakdown(pc, pc, reference);
  assert.deepEqual(right.lines, [['Chain Mail', '16 (no DEX)'], ['Shield', '+2']]);
  assert.equal(right.note, '');
  const odd = { combat: { ac: 14 }, stats: { dex: 14 }, equipped: { armor: 'Leather Armor' }, inventory: {} };
  assert.match(acBreakdown(odd, odd, reference).note, /give 13, but your sheet says 14/);
});

test('every feat on the characters is spelled out', () => {
  for (const name of ['Sharpshooter', 'Tough', 'Fey Touched', 'War Caster', 'Resilient (CON)', 'Sentinel', 'Dual Wielder', 'Alert', 'Mobile']) assert.doesNotMatch(featText(name), /No description/, name);
  assert.match(featText('Resilient (CON)'), /You chose CON/);
});

test('taking refuses more than you have or the last equipped one, and healing stops at the maximum', () => {
  const data = { equipped: { main_hand: 'Dagger' }, inventory: { d: { name: 'Dagger', qty: 2 } }, combat: { hp_current: 0, hp_max: 10 } };
  assert.throws(() => take(data, 'd', 3), /You have 2/);
  assert.equal(take(data, 'd', 1).qty, 1);
  assert.throws(() => take(data, 'd', 1), /Unequip/);
  heal(data, 99);
  assert.equal(data.combat.hp_current, 10);
  assert.deepEqual(data.combat.death_saves, { success: 0, fail: 0 });
});

// A tiny Firebase: one record per URL, with an optional URL whose saves fail.
function firebase(records, failing) {
  globalThis.window = { GEEZ_FIREBASE_CONFIG: { databaseURL: 'https://example.test' } };
  globalThis.fetch = async (url, options = {}) => {
    const id = /entities\/(\w+)\.json/.exec(url)[1];
    if (options.method === 'PUT') {
      if (id === failing) return { ok: false, status: 500 };
      records[id] = decodeTree(JSON.parse(options.body)); return { ok: true, status: 200 };
    }
    return { ok: true, headers: { get: () => 'v' }, json: async () => encodeTree(structuredClone(records[id])) };
  };
}
const party = () => ({ me: { kind: 'pc', data: { inventory: { p: { name: 'Potion of Healing', qty: 2 } }, combat: { hp_current: 3, hp_max: 20 } } }, friend: { kind: 'pc', data: { combat: { hp_current: 1, hp_max: 20 } } } });

test('sending moves the item, and a failed save never loses it', async () => {
  globalThis.window = { dispatchEvent() {} };
  setPlayerIdentity({ pcId: 'me' }); // a player may change only their own sheet; handing over is the one exception
  const original = globalThis.fetch, item = { name: 'Potion of Healing', qty: 2 };
  try {
    let db = party(); firebase(db);
    await sendItem({ from: 'me', to: 'friend', key: 'p', qty: 1, item, sender: 'Lark', id: 'a' });
    assert.equal(db.me.data.inventory.p.qty, 1);
    assert.equal(db.friend.data.inventory['sent-a'].qty, 1);
    assert.deepEqual(db.friend.data.lastLoot.items, ['Potion of Healing from Lark']);
    db = party(); firebase(db, 'me');
    await assert.rejects(sendItem({ from: 'me', to: 'friend', key: 'p', qty: 1, item, sender: 'Lark', id: 'b' }));
    assert.equal(db.me.data.inventory.p.qty, 2);
    assert.equal(db.friend.data.inventory?.['sent-b'], undefined);
    db = party(); firebase(db, 'friend');
    await assert.rejects(drinkHealing({ from: 'me', to: 'friend', key: 'p', amount: 5, name: 'Potion of Healing', sender: 'Lark', id: 'c' }));
    assert.equal(db.me.data.inventory.p.qty, 2);
    db = party(); firebase(db);
    await drinkHealing({ from: 'me', to: 'friend', key: 'p', amount: 5, name: 'Potion of Healing', sender: 'Lark', id: 'd' });
    assert.equal(db.friend.data.combat.hp_current, 6);
    assert.equal(db.me.data.inventory.p.qty, 1);
  } finally { globalThis.fetch = original; }
});

test('homebrew armor shows its own category', () => {
  assert.equal(statLine({ name: 'Pube Armor', armor_category: 'Light', armor_class: { base: 15, dex_bonus: true } }, reference), 'AC 15 + DEX · Light armor');
});

test('a long rest refills daily uses such as Bark Arm; a short rest does not', () => {
  const arm = () => ({ effects: { bark_arm: { label: 'Bark Arm', mode: 'activated', max: 2, current: 0, recharge: 'daily', modifiers: [] } } });
  const short = arm(), long = arm();
  rechargeEffects(short, false); rechargeEffects(long, true);
  assert.equal(short.effects.bark_arm.current, 0);
  assert.equal(long.effects.bark_arm.current, 2);
});
