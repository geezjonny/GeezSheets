// Moving an item between characters, drinking a potion, throwing something away. Every save re-reads first.
import { updatePCSheet, entitiesURL } from './geez/pc-inventory.js';
import { updateConditionally } from './geez/firebase-update.js';
import { itemEquipped } from './geez/inventory-model.js';

const token = (id) => ({ npcId: `v2:${id}` });
// Another character's record: used only to hand them an item or heal them.
const updateOther = (id, change) => updateConditionally(`${entitiesURL()}/${encodeURIComponent(id)}.json`, (entity) => {
  if (entity?.kind !== 'pc' || !entity.data || entity.data._sheetsDeleted) throw new Error('That character is unavailable.');
  change(entity.data);
  return { result: entity.data };
}, 'Their sheet changed at the same moment. Try again.');

// Removes `qty` of one bag entry and returns what was taken. The last equipped one has to be unequipped first.
export function take(data, key, qty, reference = {}) {
  const item = Object.hasOwn(data.inventory || {}, key) ? data.inventory[key] : null;
  if (!item) throw new Error('That item is no longer in your bag.');
  const have = Number(item.qty ?? 1);
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > have) throw new Error(`You have ${have}.`);
  if (qty === have && itemEquipped(data, item, reference)) throw new Error('Unequip it first.');
  const taken = { ...item, qty };
  if (qty === have) delete data.inventory[key]; else item.qty = have - qty;
  return taken;
}
export function putBack(data, key, taken) {
  const item = data.inventory?.[key];
  if (item) item.qty = Number(item.qty ?? 1) + taken.qty;
  else data.inventory = { ...data.inventory, [key]: taken };
}
export function heal(data, amount) {
  const combat = data.combat || (data.combat = {}), before = Number(combat.hp_current) || 0;
  combat.hp_current = Math.min(Number(combat.hp_max) || before + amount, before + amount);
  if (before === 0 && combat.hp_current > 0) combat.death_saves = { success: 0, fail: 0 };
}

export const removeItem = (from, key, qty, reference) => {
  let taken;
  return updatePCSheet(token(from), (data) => { taken = take(data, key, qty, reference); }).then(() => taken);
};
export const restoreItem = (from, key, taken) => updatePCSheet(token(from), (data) => putBack(data, key, taken));

// The recipient gets it first, then it leaves the sender: a dropped connection can duplicate an item but never lose one.
export async function sendItem({ from, to, key, qty, item, sender, reference = {}, id = crypto.randomUUID() }) {
  const slot = `sent-${id}`;
  await updateOther(to, (data) => {
    if (data.inventory?.[slot]) return;
    data.inventory = { ...data.inventory, [slot]: { ...item, qty } };
    data.lastLoot = { id, at: Date.now(), items: [`${item.name}${qty > 1 ? ` ×${qty}` : ''} from ${sender}`] };
  });
  try { await removeItem(from, key, qty, reference); }
  catch (error) {
    await updateOther(to, (data) => { delete data.inventory?.[slot]; delete data.lastLoot; });
    throw error;
  }
}

export async function drinkHealing({ from, to, key, amount, name, sender, reference = {}, id = crypto.randomUUID() }) {
  if (from === to) return updatePCSheet(token(from), (data) => { take(data, key, 1, reference); heal(data, amount); });
  const taken = await removeItem(from, key, 1, reference);
  try {
    await updateOther(to, (data) => { heal(data, amount); data.lastLoot = { id, at: Date.now(), items: [`${amount} healing from ${sender} (${name})`] }; });
  } catch (error) { await restoreItem(from, key, taken); throw error; }
}
