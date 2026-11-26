import { WORD_COUNT, revealBargain } from './devils-deck-model.js';
import { changeInventory } from './inventory-model.js';

const identifier = value => typeof value === 'string' && /^[^.#$\[\]/\s]{1,200}$/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
const rolls = value => Array.isArray(value) && value.length === 3 && Array.from(value).every(roll => Number.isInteger(roll) && roll >= 1 && roll <= WORD_COUNT);
export function validChanceRecord(value) {
  if (!value || !identifier(value.pcId) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 ||
    !Number.isSafeInteger(value.drawCount) || value.drawCount < 0) return false;
  const hand = value.hand;
  if (!hand || !identifier(hand.id) || !['offered', 'revealed', 'handled', 'cancelled'].includes(hand.phase) ||
    !Number.isSafeInteger(hand.drawNumber) || hand.drawNumber < 1 || !Number.isFinite(hand.createdAt) ||
    !Array.isArray(hand.cards) || hand.cards.length !== 3 || !Array.from(hand.cards).every(rolls)) return false;
  return ['offered', 'cancelled'].includes(hand.phase)
    ? hand.chosen === null && hand.drawNumber === value.drawCount + 1
    : Number.isInteger(hand.chosen) && hand.chosen >= 0 && hand.chosen < 3 && hand.drawNumber === value.drawCount;
}

export function offerChance(record, offer) {
  if (record != null && !validChanceRecord(record)) throw new Error('Stored deck record is invalid; no changes saved.');
  if (record && record.pcId !== offer.pcId) throw new Error('Character changed.');
  if (record?.hand.id === offer.id) return record;
  if (record && ['offered', 'revealed'].includes(record.hand.phase)) throw new Error('Finish the current draw before pushing another.');
  const next = { pcId: offer.pcId, name: offer.name, drawCount: record?.drawCount ?? 0,
    hand: { id: offer.id, phase: 'offered', drawNumber: (record?.drawCount ?? 0) + 1, cards: offer.cards, chosen: null, createdAt: offer.createdAt } };
  if (!validChanceRecord(next)) throw new Error('Choose a character and three valid cards.');
  return next;
}

export function chooseChance(record, handId, choice) {
  if (!validChanceRecord(record) || record.hand.id !== handId) throw new Error('Draw changed. Reopen the deck.');
  if (!Number.isInteger(choice) || choice < 0 || choice > 2) throw new Error('Choose one of the three cards.');
  if (['revealed', 'handled'].includes(record.hand.phase)) return record;
  if (record.hand.phase !== 'offered') throw new Error('This draw was cancelled.');
  return { ...record, drawCount: record.hand.drawNumber, hand: { ...record.hand, phase: 'revealed', chosen: choice } };
}

export function finishChance(record, handId, phase) {
  if (!validChanceRecord(record) || record.hand.id !== handId) throw new Error('Draw changed. Reopen the deck.');
  if (!['cancelled', 'handled'].includes(phase)) throw new Error('Invalid draw action.');
  if (record.hand.phase === phase) return record;
  if (record.hand.phase !== (phase === 'cancelled' ? 'offered' : 'revealed')) throw new Error('Draw changed; check its result first.');
  return { ...record, hand: { ...record.hand, phase } };
}

// Commit the chosen card and its receipt together, preserving all earlier cards and other equipment.
export function receiveChanceCard(world, pcId, handId, choice) {
  const record = Object.hasOwn(world?.vtt?.chance || {}, pcId) ? world.vtt.chance[pcId] : null;
  if (record?.pcId !== pcId) throw new Error('Character record does not match.');
  const chosen = chooseChance(record, handId, choice), key = `chance-${chosen.hand.id}`;
  if (chosen.hand.inventoryKey) {
    if (chosen.hand.inventoryKey !== key) throw new Error('Card receipt does not match this draw.');
    return record;
  }
  const entity = Object.hasOwn(world.entities || {}, pcId) ? world.entities[pcId] : null;
  if (entity?.kind !== 'pc' || !entity.data || entity.data._sheetsDeleted) throw new Error('Character is unavailable.');
  const pc = structuredClone(entity.data), bargain = revealBargain(chosen.hand.cards[chosen.hand.chosen]);
  const existing = Object.hasOwn(pc.inventory || {}, key) ? pc.inventory[key] : null;
  if (existing && (existing.chance?.handId !== handId || existing.chance?.drawNumber !== chosen.hand.drawNumber)) throw new Error('Card inventory key conflict.');
  pc.inventory = { ...pc.inventory, [key]: existing || {
    name: bargain.name, category: 'Card', qty: 1, weight: 0,
    desc: `${bargain.flavor}\n\nDraw ${chosen.hand.drawNumber} · ×${chosen.hand.drawNumber}\n\n${bargain.words.map(([word, meaning]) => `${word}: ${meaning}`).join('\n')}`,
    chance: { handId, drawNumber: chosen.hand.drawNumber, rolls: [...bargain.rolls] }
  } };
  changeInventory({ [pcId]: { kind: 'pc', data: pc } }, pcId, { type: 'equip', slot: 'card', key });
  entity.data = pc;
  const result = { ...chosen, hand: { ...chosen.hand, inventoryKey: key } };
  world.vtt.chance[pcId] = result;
  return result;
}
