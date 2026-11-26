import { buildExpressionRoll } from './dice-roll.js';
import { validateItemEdit, ITEM_STATS } from './item-modifiers.js';
import { itemEquipped } from './inventory-model.js';
import { validateEffect, changeEffects, EFFECT_TARGETS } from './effects-model.js';
import { changeCombat } from './sheet-combat.js';
import { characterStats, baseSpeed } from './equipment-modifiers.js';

export const CREATOR_KINDS = ['Spell', 'Weapon', 'Item', 'Effect', 'Feat', 'Stat'];
export const BASE_STATS = [...ITEM_STATS, 'hp_current', 'hp_max', 'temp_hp', 'ac', 'speed', 'exhaustion'];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const own = (object, key) => Object.hasOwn(object || {}, key) ? object[key] : null;
const text = (value, max = 20000) => {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Text must be at most ${max} characters.`);
  return value;
};
const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Enter a whole number from ${min} to ${max}.`);
  return value;
};
const formula = value => {
  text(value, 200);
  if (value.trim()) buildExpressionRoll(value, 'normal', () => 1);
  return value.trim();
};
const validKey = key => {
  if (typeof key !== 'string' || !/^[^.#$\[\]/]{1,200}$/.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Invalid record key.');
};

export function creatorEntries(pc, kind) {
  let groups;
  if (kind === 'Spell') groups = [['', pc.spellcasting?.spells]];
  else if (kind === 'Weapon') groups = [['', pc.attacks]];
  else if (kind === 'Item') groups = [['', pc.inventory]];
  else if (kind === 'Feat') groups = [['abilities', pc.abilities], ['feats', pc.feats]];
  else if (kind === 'Effect' || kind === 'Stat') groups = [['effects', pc.effects]];
  else return [];
  return groups.flatMap(([group, records]) => Object.entries(records || {}).flatMap(([key, value]) => {
    const name = typeof value === 'string' ? value : value?.label || value?.name;
    if (!name || kind === 'Stat' && value.creatorKind !== 'Stat') return [];
    return [{ key: group ? `${group}:${key}` : key, name, value }];
  }));
}

export function baseStatValue(pc, target) {
  if (ITEM_STATS.includes(target)) return pc.stats?.[target] ?? 10;
  if (target === 'speed') return baseSpeed(pc);
  if (target === 'ac') return pc.combat?.ac ?? pc.combat?.armor_class ?? pc.ac ?? null;
  if (target === 'exhaustion') return pc.combat?.exhaustion ?? pc.exhaustion ?? 0;
  return pc.combat?.[target] ?? (target === 'hp_max' ? null : 0);
}

// Returns a new sheet so a rejected edit never leaves a partially changed character.
export function changeCreation(pc, action, reference = {}) {
  if (!CREATOR_KINDS.includes(action?.kind) || !action.value || typeof action.value !== 'object') throw new Error('Choose a creation type.');
  const { kind, value } = action, next = structuredClone(pc);
  if (kind === 'Stat' && value.operation === 'base') {
    if (!BASE_STATS.includes(value.target)) throw new Error('Choose a base stat.');
    if (!same(baseStatValue(pc, value.target), action.expected)) {
      if (same(baseStatValue(pc, value.target), value.value)) return next;
      throw new Error('Stat changed elsewhere. Reload before editing.');
    }
    changeCombat(next, { type: ITEM_STATS.includes(value.target) ? 'base-stat' : 'set', field: value.target, value: value.value });
    return next;
  }
  validKey(action.key);
  let records, key = action.key;
  if (kind === 'Spell') { next.spellcasting ||= {}; next.spellcasting.spells ||= {}; records = next.spellcasting.spells; }
  else if (kind === 'Weapon') { next.attacks ||= {}; records = next.attacks; }
  else if (kind === 'Item') { next.inventory ||= {}; records = next.inventory; }
  else {
    const separator = key.indexOf(':'), group = key.slice(0, separator);
    key = key.slice(separator + 1); validKey(key);
    if (!(kind === 'Feat' ? ['abilities', 'feats'].includes(group) : group === 'effects')) throw new Error('Invalid sheet section.');
    next[group] ||= {}; records = next[group];
  }
  // Imported sheets keep spells and attacks as lists. A named property on a list is dropped on save, so new records are appended.
  let slot = key, tag = {};
  if (Array.isArray(records) && !/^\d+$/.test(key)) {
    const found = records.findIndex(record => record?.creatorKey === key);
    slot = String(found < 0 ? records.length : found); tag = { creatorKey: key };
  }
  const existing = own(records, slot);
  const original = existing && typeof existing === 'object' ? existing : {};
  const name = text(value.name, 100).trim();
  if (!name) throw new Error('Enter a name.');
  const description = text(value.description);
  let saved;
  if (kind === 'Spell') {
    const level = integer(value.level, 0, 9);
    if (!['', ...ITEM_STATS].includes(value.save_stat) || typeof value.concentration !== 'boolean' || typeof value.prepared !== 'boolean') throw new Error('Invalid spell settings.');
    saved = { ...original, ...tag, custom: true, name, level, desc: description,
      prepared: value.prepared, prepared_type: level === 0 ? 'cantrip' : value.prepared ? 'prepared' : 'unprepared',
      cast_time: text(value.cast_time, 200), range: text(value.range, 200), duration: text(value.duration, 200),
      concentration: value.concentration, damage: formula(value.damage), healing: formula(value.healing), save_stat: value.save_stat,
      to_hit: value.to_hit == null ? null : integer(value.to_hit, -999, 999),
      save_dc: value.save_dc == null ? null : integer(value.save_dc, 0, 999) };
    delete saved.damage_dice; delete saved.heal; delete saved.heal_at_slot_level;
  } else if (kind === 'Weapon') {
    if (!['', ...ITEM_STATS].includes(value.ability)) throw new Error('Choose a weapon ability.');
    if (value.weight != null && (typeof value.weight !== 'number' || !Number.isFinite(value.weight) || value.weight < 0 || value.weight > 999999)) throw new Error('Weight must be 0–999999 lb.');
    const damage = formula(value.damage);
    if (!damage) throw new Error('Enter weapon damage dice.');
    saved = { ...original, ...tag, name, desc: description, to_hit: integer(value.to_hit, -999, 999), damage,
      ability: value.ability, damage_type: text(value.damage_type, 100) };
    // New weapons get an inventory entry and a rollable attack in the same sheet write.
    const inventoryKey = original.inventoryKey || (!existing ? key : null);
    if (inventoryKey) {
      validKey(inventoryKey);
      const item = own(next.inventory, inventoryKey);
      if (existing && action.expected == null && same(existing, { ...saved, inventoryKey }) && item?.name === name && item?.desc === description && (item?.weight ?? null) === (value.weight ?? null)) return next;
      if (!same(item, action.linkedExpected)) throw new Error('Weapon inventory changed elsewhere. Reload before editing.');
      if (!existing && item) throw new Error('Inventory key conflict.');
      if (item && itemEquipped(next, item, reference) && item.name !== name) throw new Error('Unequip this weapon before renaming it.');
      next.inventory ||= {};
      next.inventory[inventoryKey] = { ...item, name, category: 'Weapon', qty: item?.qty ?? 1, weight: value.weight ?? null, desc: description };
      saved.inventoryKey = inventoryKey;
    }
  } else if (kind === 'Item') {
    if (!['Consumable', 'Armor', 'Weapon', 'Card', 'Adventuring Gear', original.category].includes(value.category)) throw new Error('Choose an item category.');
    const edited = validateItemEdit({ ...value, name, desc: description }, existing ? original : { category: 'Adventuring Gear' });
    if (existing && itemEquipped(next, original, reference) && (name !== original.name || edited.category !== original.category || edited.qty === 0)) throw new Error('Unequip this item before renaming it, changing category, or removing it.');
    saved = { ...original, ...edited };
  } else {
    const definition = kind === 'Stat' ? { label: name, category: 'Ability', mode: 'passive', consume: false, inventoryKey: '', max: 0, recharge: 'none', duration_minutes: 0,
      modifiers: [{ target: value.target, operation: value.operation, value: value.value }], description }
      : { ...value, label: name, category: kind === 'Feat' ? 'Ability' : value.category, description,
        ...(Number(value.drain_sides) > 0 ? { drain: { sides: Number(value.drain_sides), perTurn: value.drain_turn === true, everyMinutes: Number(value.drain_minutes) || 0, floor: Number(value.drain_floor) || 0 } } : { drain: null }) };
    if (kind === 'Stat' && (!EFFECT_TARGETS.includes(value.target) || !['add', 'multiply', 'set'].includes(value.operation))) throw new Error('Choose a stat modifier.');
    const effect = validateEffect(definition);
    if (effect.inventoryKey && !own(next.inventory, effect.inventoryKey)) throw new Error('Choose an existing source item.');
    saved = { ...original, ...effect, current: effect.max === 0 ? 0 : Math.min(effect.max, Math.max(0, Number.isSafeInteger(original.current) ? original.current : effect.max)) };
    if (!effect.drain) delete saved.drain; // clearing the drain fields removes it
    if (kind === 'Feat') { saved.name = name; saved.effect_desc = description; delete saved.desc; } // older readers show effect_desc
    if (kind === 'Stat') saved.creatorKind = 'Stat';
  }
  if (!same(existing, action.expected)) {
    if (same(existing, saved)) return next; // A retry of an already committed save.
    throw new Error('Record changed elsewhere. Reload before editing.');
  }
  records[slot] = saved;
  if (kind === 'Item' || kind === 'Weapon') {
    const before = characterStats(pc, reference).load, after = characterStats(next, reference).load;
    if (after.overCapacity && (!before.overCapacity || after.weight > before.weight)) throw new Error('This would exceed carrying capacity.');
  }
  return next;
}
