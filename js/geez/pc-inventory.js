// Character reads and writes on v2/worlds/gaia/entities, the same records the companions show.
// Every write re-reads first and only saves if nobody else saved in between.
import { changeEffects } from './effects-model.js';
import { changeFeat } from './feats-model.js';
import { changeCreation } from './character-creator-model.js';
import { addCard } from './card-model.js';
import { changeInventory } from './inventory-model.js';
import { isGM, canControlPC } from './session-role.js';
import { decodeTree } from './firebase-codec.js';
import { updateConditionally } from './firebase-update.js';

export const databaseURL = () => globalThis.window.GEEZ_FIREBASE_CONFIG.databaseURL.replace(/\/$/, '');
export const entitiesURL = () => `${databaseURL()}/v2/worlds/gaia/entities`;
const entityURL = token => {
  if (!token?.npcId?.startsWith('v2:')) throw new Error('Select a linked PC.');
  return `${entitiesURL()}/${encodeURIComponent(token.npcId.slice(3))}.json`;
};

export async function readPC(token) {
  const response = await fetch(entityURL(token), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Firebase returned ${response.status}`);
  const entity = decodeTree(await response.json());
  if (entity?.kind !== 'pc' || !entity.data || entity.data._sheetsDeleted) throw new Error('PC unavailable.');
  return entity.data;
}
export async function updatePCSheet(token, change) {
  if (!canControlPC(token)) throw new Error('Sign in as this PC to control it.');
  return updateConditionally(entityURL(token), entity => {
    if (entity?.kind !== 'pc' || !entity.data || entity.data._sheetsDeleted) throw new Error('PC unavailable.');
    change(entity.data);
    return { result: entity.data };
  }, 'Character changed elsewhere. Try again.');
}
export const updatePCEffects = (token, action) => updatePCSheet(token, pc => changeEffects(pc, action));
export const updatePCFeat = (token, action) => updatePCSheet(token, pc => changeFeat(pc, action));
export const equipPCItem = (token, slot, key, reference = {}) => updatePCSheet(token, pc => {
  const id = token.npcId.slice(3);
  // Players may fill an empty card slot; only the GM swaps or removes a card.
  if (slot === 'card' && !isGM && pc.equipped?.card) throw new Error('Only the GM can unequip or swap the card.');
  changeInventory({ [id]: { kind: 'pc', data: pc } }, id, { type: 'equip', slot, key }, reference);
});
export async function updatePCCreation(token, action, reference = {}) {
  if (!isGM) throw new Error('Only the GM can create or edit character content.');
  return updatePCSheet(token, pc => Object.assign(pc, changeCreation(pc, action, reference)));
}
export async function givePCCard(token, card, id) {
  if (!isGM) throw new Error('Only the GM can give cards.');
  return updatePCSheet(token, pc => addCard(pc, card, id));
}
