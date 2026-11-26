import { ITEM_STATS, ITEM_SKILLS, validateItemEdit } from './item-modifiers.js';
import { changeEffects } from './effects-model.js';
import { CONDITIONS } from './sheet-combat.js';

// A card is one 'Card' bag item (ability/skill bonuses, conditions) plus equipped-only effects and feats linked to it.
export function addCard(pc, card, id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid card key.');
  if (Object.hasOwn(pc.inventory || {}, id)) throw new Error('This card was already given.');
  const conditions = [...new Set(card.conditions || [])];
  if (conditions.some(name => !CONDITIONS.includes(name))) throw new Error('Choose valid conditions.');
  const part = list => (list || []).map(entry => ({ name: String(entry?.name ?? '').trim(), description: String(entry?.description ?? '') })).filter(entry => entry.name);
  const effects = part(card.effects), feats = part(card.feats), changes = card.statChanges || [];
  const pick = (values, keys) => Object.fromEntries(Object.entries(values || {}).filter(([key, value]) => keys.includes(key) && value));
  const item = validateItemEdit({ name: card.name, category: 'Card', qty: 1, weight: 0, desc: card.description ?? '',
    modifiers: { ac: 0, stats: pick(card.stats, ITEM_STATS), skills: pick(card.skills, ITEM_SKILLS) } }, { category: 'Card' });
  pc.inventory = { ...pc.inventory, [id]: { ...item, ...(conditions.length ? { conditions } : {}) } };
  const effect = (key, label, description, modifiers) => changeEffects(pc, { type: 'save', id: `effects:${id}-${key}`, value: {
    label, description, category: 'Equipment', mode: 'equipped', max: 0, recharge: 'none', duration_minutes: 0, modifiers, inventoryKey: id, consume: false } });
  if (changes.length) effect('stats', `${item.name}: stat changes`, '', changes);
  effects.forEach((entry, index) => effect(`e${index}`, entry.name, entry.description, []));
  if (feats.length) pc.feats = { ...pc.feats, ...Object.fromEntries(feats.map((entry, index) => [`${id}-f${index}`, { name: entry.name, description: entry.description, cardKey: id }])) };
  if (card.equip) pc.equipped = { ...pc.equipped, card: item.name };
}
