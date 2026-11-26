// Deck of Chance hands at v2/worlds/gaia/vtt/chance/<entity id>; the chosen card goes into the character's inventory.
import { isGM, playerIdentity, canControlPC } from './session-role.js';
import { encodeKey, decodeTree } from './firebase-codec.js';
import { applyFirebaseEvent } from './firebase-events.js';
import { updateConditionally } from './firebase-update.js';
import { databaseURL, readPC, updatePCSheet } from './pc-inventory.js';
import { offerChance, chooseChance, receiveChanceCard, finishChance, validChanceRecord } from './chance-model.js';

const base = () => `${databaseURL()}/v2/worlds/gaia/vtt/chance`;
// Firebase does not store empty values, so an unpicked hand comes back without its "chosen" field.
const restore = record => {
  if (record?.hand && record.hand.chosen === undefined) record.hand.chosen = null;
  return record;
};
async function change(pcId, edit) {
  if (typeof pcId !== 'string' || !/^[^.#$\[\]/\s]{1,200}$/.test(pcId) || ['__proto__', 'prototype', 'constructor'].includes(pcId)) throw new Error('Choose a linked character.');
  return updateConditionally(`${base()}/${encodeKey(pcId)}.json`, stored => {
    const record = restore(stored);
    if (record && record.pcId !== pcId) throw new Error('Character record does not match.');
    const next = edit(record);
    return { result: next, write: next === record ? null : next };
  }, 'The draw changed elsewhere. Check its result and try again.');
}
export async function pushChance(offer) {
  if (!isGM) throw new Error('Only the GM can push a draw.');
  await readPC({ npcId: `v2:${offer.pcId}` });
  return change(offer.pcId, record => offerChance(record, offer));
}
// Three small saves instead of rewriting the whole world: lock in the pick, give the card, record the receipt.
// Calling it again after a failure finishes whatever is left without giving a second card.
export async function pickChance(pcId, handId, choice) {
  const token = { npcId: `v2:${pcId}` };
  if (isGM || playerIdentity?.pcId !== pcId || !canControlPC(token)) throw new Error('Sign in as this character to choose a card.');
  const chosen = await change(pcId, record => chooseChance(record, handId, choice));
  if (chosen.hand.inventoryKey) return chosen;
  let received;
  await updatePCSheet(token, data => {
    const world = { vtt: { chance: { [pcId]: chosen } }, entities: { [pcId]: { kind: 'pc', data } } };
    received = receiveChanceCard(world, pcId, handId, choice);
    Object.assign(data, world.entities[pcId].data);
  });
  return change(pcId, record => record?.hand.id === handId && !record.hand.inventoryKey ? received : record);
}
export function closeChance(pcId, handId, phase) {
  if (!isGM) throw new Error('Only the GM can finish a draw.');
  return change(pcId, record => finishChance(record, handId, phase));
}
export function watchChance(onValue, onError) {
  const stream = new EventSource(`${base()}.json`);
  let value = null;
  const update = event => {
    try {
      value = applyFirebaseEvent(value, event.type, JSON.parse(event.data));
      const records = decodeTree(value) || {};
      onValue(Object.fromEntries(Object.entries(records).filter(([id, record]) => record?.pcId === id && validChanceRecord(restore(record)))));
    } catch (error) { onError?.(`Sync failed: ${error.message}`); }
  };
  stream.addEventListener('put', update);
  stream.addEventListener('patch', update);
  stream.addEventListener('error', () => onError?.('Deck sync disconnected; reconnecting…'));
  return () => stream.close();
}
