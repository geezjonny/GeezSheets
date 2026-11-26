import { buildExpressionRoll } from './dice-roll.js';
export const ITEM_CATEGORIES = ['Consumable', 'Armor', 'Weapon', 'Card'];
export const ITEM_STATS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ITEM_SKILLS = ['acrobatics', 'animal_handling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleight_of_hand', 'stealth', 'survival'];

export function validateItemEdit(value, original) {
  if (typeof value?.name !== 'string' || !value.name.trim() || value.name.trim().length > 100) throw new Error('Enter an item name of 1–100 characters.');
  if (typeof value.category !== 'string' || (!ITEM_CATEGORIES.includes(value.category) && value.category !== (original.category || ''))) throw new Error('Choose an item category.');
  if (!Number.isSafeInteger(value.qty) || value.qty < 0 || value.qty > 9999) throw new Error('Quantity must be 0–9999.');
  if (typeof value.desc !== 'string' || value.desc.length > 20000) throw new Error('Description must be at most 20000 characters.');
  const modifiers = { ac: value.modifiers?.ac ?? 0, stats: {}, skills: {} };
  for (const [group, keys] of [['stats', ITEM_STATS], ['skills', ITEM_SKILLS]]) {
    const values = value.modifiers?.[group] ?? {};
    if (Object.keys(values).some(key => !keys.includes(key))) throw new Error('Invalid modifier target.');
    for (const key of keys) {
      const bonus = values[key] ?? 0;
      if (!Number.isSafeInteger(bonus) || Math.abs(bonus) > 999) throw new Error('Modifiers must be whole numbers from -999 to 999.');
      if (bonus) modifiers[group][key] = bonus;
    }
  }
  if (!Number.isSafeInteger(modifiers.ac) || Math.abs(modifiers.ac) > 999) throw new Error('AC modifier must be a whole number from -999 to 999.');
  const result = { name: value.name.trim(), category: value.category, qty: value.qty, desc: value.desc, modifiers };
  if (value.weight !== undefined) {
    if (value.weight !== null && (typeof value.weight !== 'number' || !Number.isFinite(value.weight) || value.weight < 0 || value.weight > 999999)) throw new Error('Weight must be 0–999999 lb or blank for reference weight.');
    result.weight = value.weight;
  }
  if (value.armor_class !== undefined) {
    const armor = value.armor_class;
    if (armor !== null && (!Number.isSafeInteger(armor.base) || armor.base < 0 || armor.base > 999 || typeof armor.dex_bonus !== 'boolean' ||
        armor.max_bonus != null && (!Number.isSafeInteger(armor.max_bonus) || armor.max_bonus < 0 || armor.max_bonus > 999))) throw new Error('Invalid armor calculation.');
    result.armor_class = armor === null ? null : { base: armor.base, dex_bonus: armor.dex_bonus, ...(armor.max_bonus != null ? { max_bonus: armor.max_bonus } : {}) };
  }
  if(value.consumable !== undefined) {
    if(value.consumable !== null) {
      if(!['healing','damage'].includes(value.consumable.kind) || typeof value.consumable.dice!=='string') throw new Error('Choose a healing/damage amount.');
      buildExpressionRoll(value.consumable.dice,'normal',()=>1);
    }
    result.consumable=value.consumable;
  }
  return result;
}

export function modifierText(modifiers = {}) {
  const sign = value => Number(value) >= 0 ? `+${value}` : String(value);
  const parts = modifiers.ac ? [`AC ${sign(modifiers.ac)}`] : [];
  for (const [group, keys] of [['stats', ITEM_STATS], ['skills', ITEM_SKILLS]]) {
    for (const key of keys) if (modifiers[group]?.[key]) parts.push(`${key.replace(/_/g, ' ')} ${sign(modifiers[group][key])}`);
  }
  return parts.join(' · ');
}
