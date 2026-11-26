import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offerChance, chooseChance, finishChance, validChanceRecord, receiveChanceCard } from '../../geez/chance-model.js';
import { revealBargain } from '../../geez/devils-deck-model.js';
import { changeInventory, equippedItem, fitsEquipment } from '../../geez/inventory-model.js';
import { characterStats } from '../../geez/equipment-modifiers.js';
import { appliedEffects } from '../../geez/effects-model.js';

const offer = (id = 'hand-1') => ({ id, pcId: 'pc-1', name: 'Liora', createdAt: 123456,
  cards: [[1, 1, 1], [8, 6, 13], [50, 50, 50]] });

test('a chosen card reveals its predealt narrative and increments the character counter once', () => {
  const pending = offerChance(null, offer());
  assert.equal(pending.drawCount, 0);
  assert.equal(pending.hand.drawNumber, 1);
  assert.equal(pending.hand.chosen, null);
  assert.equal(validChanceRecord(pending), true);
  const chosen = chooseChance(pending, 'hand-1', 1);
  assert.equal(chosen.drawCount, 1);
  assert.equal(chosen.hand.chosen, 1);
  assert.equal(revealBargain(chosen.hand.cards[chosen.hand.chosen]).name, 'Invisible Bones Giggles');
  assert.equal(chooseChance(chosen, 'hand-1', 1), chosen);
  assert.equal(chooseChance(chosen, 'hand-1', 2), chosen);
  assert.equal(pending.drawCount, 0);
  assert.equal(pending.hand.phase, 'offered');
});

test('the GM must finish a pending result before another offer; draw counts survive handled and cancelled hands', () => {
  const pending = offerChance(null, offer());
  assert.throws(() => offerChance(pending, offer('hand-2')), /Finish the current draw/);
  const revealed = chooseChance(pending, 'hand-1', 0);
  assert.throws(() => offerChance(revealed, offer('hand-2')), /Finish the current draw/);
  const handled = finishChance(revealed, 'hand-1', 'handled');
  const second = offerChance(handled, offer('hand-2'));
  assert.equal(second.hand.drawNumber, 2);
  assert.equal(second.drawCount, 1);
  const cancelled = finishChance(second, 'hand-2', 'cancelled');
  assert.equal(cancelled.drawCount, 1);
  assert.equal(offerChance(cancelled, offer('hand-3')).hand.drawNumber, 2);
  assert.equal(validChanceRecord(cancelled), true);
});

test('offer and finish retries are idempotent and stale or malformed actions cannot reroll a hand', () => {
  const pending = offerChance(null, offer());
  assert.equal(offerChance(pending, offer()), pending);
  assert.throws(() => chooseChance(pending, 'stale', 1), /Draw changed/);
  assert.throws(() => chooseChance(pending, 'hand-1', -1), /three cards/);
  assert.throws(() => chooseChance(pending, 'hand-1', 3), /three cards/);
  assert.throws(() => finishChance(pending, 'hand-1', 'handled'), /Draw changed/);
  const cancelled = finishChance(pending, 'hand-1', 'cancelled');
  assert.equal(finishChance(cancelled, 'hand-1', 'cancelled'), cancelled);
  assert.throws(() => chooseChance(cancelled, 'hand-1', 0), /cancelled/);
  assert.throws(() => offerChance(null, { ...offer(), cards: [[1, 1, 51], [1, 1, 1], [1, 1, 1]] }), /valid cards/);
  assert.equal(validChanceRecord({ ...pending, drawCount: 2 }), false);
  assert.equal(validChanceRecord({ ...pending, hand: { ...pending.hand, cards: Array(3) } }), false);
  assert.throws(() => offerChance({ ...pending, drawCount: -1 }, offer('hand-2')), /Stored deck record/);
});

test('receiving a draw adds and equips a card once, preserving previous items and equipment', () => {
  const world = { entities: { 'pc-1': { kind: 'pc', data: { notes: 'Keep this', inventory: { sword: { name: 'Sword', qty: 1 } }, equipped: { main_hand: 'Sword' } } } },
    vtt: { chance: { 'pc-1': offerChance(null, offer()) }, unrelated: { keep: true } } };
  const received = receiveChanceCard(world, 'pc-1', 'hand-1', 1), pc = world.entities['pc-1'].data;
  assert.equal(received.hand.inventoryKey, 'chance-hand-1');
  assert.equal(pc.inventory['chance-hand-1'].name, 'Invisible Bones Giggles');
  assert.equal(pc.inventory['chance-hand-1'].category, 'Card');
  assert.equal(pc.inventory['chance-hand-1'].weight, 0);
  assert.equal(pc.equipped.card_key, 'chance-hand-1');
  assert.equal(pc.equipped.main_hand, 'Sword');
  assert.equal(pc.notes, 'Keep this');
  assert.match(pc.inventory['chance-hand-1'].desc, /Draw 1/);
  pc.inventory['chance-hand-1'].desc = 'GM interpretation';
  changeInventory(world.entities, 'pc-1', { type: 'equip', slot: 'card', key: '' });
  assert.equal(receiveChanceCard(world, 'pc-1', 'hand-1', 2), received);
  assert.equal(pc.equipped.card_key, null);
  assert.equal(pc.inventory['chance-hand-1'].desc, 'GM interpretation');
  assert.equal(world.vtt.chance['pc-1'].drawCount, 1);
  assert.deepEqual(world.vtt.unrelated, { keep: true });
});

test('same-name draws equip by inventory key and only the equipped card contributes modifiers and effects', () => {
  const world = { entities: { 'pc-1': { kind: 'pc', data: { combat: { ac: 10 } } } }, vtt: { chance: { 'pc-1': offerChance(null, offer()) } } };
  receiveChanceCard(world, 'pc-1', 'hand-1', 0);
  world.entities['pc-1'].data.inventory['chance-hand-1'].modifiers = { ac: 2 };
  const handled = finishChance(world.vtt.chance['pc-1'], 'hand-1', 'handled');
  world.vtt.chance['pc-1'] = offerChance(handled, offer('hand-2'));
  receiveChanceCard(world, 'pc-1', 'hand-2', 0);
  const pc = world.entities['pc-1'].data;
  pc.inventory['chance-hand-2'].modifiers = { ac: 5 };
  pc.effects = { first: { label: 'First card', mode: 'equipped', inventoryKey: 'chance-hand-1', modifiers: [] },
    second: { label: 'Second card', mode: 'equipped', inventoryKey: 'chance-hand-2', modifiers: [] } };
  assert.equal(pc.inventory['chance-hand-1'].name, pc.inventory['chance-hand-2'].name);
  assert.equal(equippedItem(pc, 'card'), pc.inventory['chance-hand-2']);
  assert.equal(characterStats(pc).ac, 15);
  assert.deepEqual(appliedEffects(pc).map(effect => effect.id), ['effects:second']);
  assert.equal(fitsEquipment('main_hand', { name: 'Royal Sword Sings', category: 'Card' }), false);
});

test('an unavailable character or inventory collision cannot partially reveal or equip a draw', () => {
  const world = { entities: { 'pc-1': { kind: 'pc', data: { inventory: { 'chance-hand-1': { name: 'Keep this' } } } } },
    vtt: { chance: { 'pc-1': offerChance(null, offer()) } } };
  const before = structuredClone(world);
  assert.throws(() => receiveChanceCard(world, 'pc-1', 'hand-1', 0), /conflict/);
  assert.deepEqual(world, before);
  delete world.entities['pc-1'];
  assert.throws(() => receiveChanceCard(world, 'pc-1', 'hand-1', 0), /unavailable/);
  assert.equal(world.vtt.chance['pc-1'].hand.phase, 'offered');
});
