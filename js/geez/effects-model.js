import { ITEM_STATS, ITEM_SKILLS } from './item-modifiers.js';
import { itemEquipped } from './inventory-model.js';

export const EFFECT_TARGETS = [...ITEM_STATS, 'ac', 'speed', 'hp_max', 'initiative', 'attack_bonus', 'damage_bonus', 'spell_attack', 'spell_dc',
  ...ITEM_STATS.map(key => `save:${key}`), ...ITEM_SKILLS.map(key => `skill:${key}`)];
export const BARK_ARM = {
  label: 'Bark Arm', consume: false, inventoryKey: '', category: 'Ability', mode: 'activated', max: 2, current: 2, recharge: 'daily', duration_minutes: 60,
  modifiers: [{ target: 'ac', operation: 'add', value: 2 }, { target: 'str', operation: 'add', value: 2 },
    { target: 'con', operation: 'add', value: 2 }, { target: 'dex', operation: 'multiply', value: .5 },
    { target: 'speed', operation: 'multiply', value: .5 }]
};
export function effectDefinitions(pc) {
  return ['effects', 'abilities', 'feats'].flatMap(group => Object.entries(pc[group] || {}).filter(([, value]) => value && typeof value === 'object' && typeof value.label === 'string' && value.label.trim())
    .map(([key, value]) => ({ ...value, id: `${group}:${key}` })));
}
function location(id) {
  const match = typeof id === 'string' && /^(effects|abilities|feats):([^.#$\[\]/]{1,200})$/.exec(id);
  if (!match || ['__proto__', 'constructor', 'prototype'].includes(match[2])) throw new Error('Invalid effect.');
  return match.slice(1);
}
// An effect can feed on its user's life force: roll one d{sides} each of their turns and/or every `everyMinutes` game minutes
// while active, never taking them below `floor` HP. e.g. { sides: 4, perTurn: true, everyMinutes: 10, floor: 1 }
function validateDrain(value) {
  const ok = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
  if (!ok(value?.sides, 1, 100) || !ok(value.everyMinutes ?? 0, 0, 1440) || !ok(value.floor ?? 0, 0, 999) || typeof (value.perTurn ?? false) !== 'boolean') throw new Error('Invalid life-drain settings.');
  return { sides: value.sides, perTurn: value.perTurn === true, everyMinutes: value.everyMinutes ?? 0, floor: value.floor ?? 0 };
}
// Applies due drain damage to pc.combat.hp_current. kind: { turn: true } at the start of the user's turn, or { minutes } as game time passes.
// Returns [{ label, rolls, taken, from, to }] for each active draining effect that fired.
export function applyDrain(pc, { turn = false, minutes = 0 }, random = Math.random) {
  const out = [];
  for (const effect of appliedEffects(pc)) {
    const drain = effect.drain, active = pc.activeEffects?.[effect.id];
    if (!drain || !active || effect.mode !== 'activated') continue;
    let count = 0;
    if (turn && drain.perTurn) count = 1;
    if (minutes > 0 && drain.everyMinutes > 0) {
      const elapsed = active.remainingMinutes === -1 ? minutes : Math.min(minutes, active.remainingMinutes), total = (active.drainCarry || 0) + elapsed;
      count = Math.min(200, Math.floor(total / drain.everyMinutes));
      active.drainCarry = total - Math.floor(total / drain.everyMinutes) * drain.everyMinutes;
    }
    if (!count) continue;
    const rolls = Array.from({ length: count }, () => Math.floor(random() * drain.sides) + 1);
    pc.combat ||= {};
    const from = Number(pc.combat.hp_current ?? pc.combat.hp_max ?? 0), to = from <= drain.floor ? from : Math.max(drain.floor, from - rolls.reduce((a, b) => a + b, 0));
    pc.combat.hp_current = to;
    out.push({ label: effect.label, rolls, sides: drain.sides, taken: from - to, from, to });
  }
  return out;
}
export function validateEffect(value) {
  if (typeof value?.label !== 'string' || !value.label.trim() || value.label.length > 100) throw new Error('Enter an effect name of 1–100 characters.');
  if (!['activated', 'passive', 'equipped'].includes(value.mode)) throw new Error('Choose how this effect is applied.');
  if (!['none', 'daily', 'short_rest', 'long_rest', 'short_or_long_rest'].includes(value.recharge)) throw new Error('Choose a recharge.');
  if (!Number.isSafeInteger(value.max) || value.max < 0 || value.max > 999 || !Number.isSafeInteger(value.duration_minutes) || value.duration_minutes < 0 || value.duration_minutes > 525600) throw new Error('Invalid uses or duration.');
  if (!Array.isArray(value.modifiers) || value.modifiers.length > 100) throw new Error('Use at most 100 modifiers.');
  if (value.description != null && (typeof value.description !== 'string' || value.description.length > 20000)) throw new Error('Description must be at most 20000 characters.');
  const modifiers = value.modifiers.map(modifier => {
    if (!EFFECT_TARGETS.includes(modifier?.target) || !['add', 'multiply', 'set'].includes(modifier.operation) ||
        !Number.isFinite(modifier.value) || modifier.value < (modifier.operation === 'add' ? -999 : 0) ||
        modifier.value > (modifier.operation === 'multiply' ? 10 : 999999)) throw new Error('Invalid modifier target, operation, or value.');
    return { target: modifier.target, operation: modifier.operation, value: modifier.value };
  });
  const drain = value.drain == null ? null : validateDrain(value.drain);
  if (typeof (value.inventoryKey ?? '') !== 'string' || typeof value.consume !== 'boolean') throw new Error('Invalid item source.');
  if ((value.mode === 'equipped' || value.consume) && !value.inventoryKey) throw new Error('Choose the source item.');
  if (value.consume && value.mode !== 'activated') throw new Error('Only activated effects can consume an item.');
  return { label: value.label.trim(), category: String(value.category || 'Ability').slice(0, 50), mode: value.mode,
    max: value.max, recharge: value.recharge, duration_minutes: value.duration_minutes, modifiers,
    inventoryKey: value.inventoryKey || '', consume: value.consume, ...(drain ? { drain } : {}), ...(value.description != null ? { description: value.description } : {}) };
}
export function appliedEffects(pc, reference = {}) {
  return effectDefinitions(pc).filter(effect => {
    if (!Array.isArray(effect.modifiers)) return false;
    const item = Object.hasOwn(pc.inventory || {}, effect.inventoryKey) ? pc.inventory[effect.inventoryKey] : null;
    if (effect.mode === 'passive') return true;
    if (effect.mode === 'equipped') return item && Number(item.qty ?? 1) > 0 && itemEquipped(pc, item, reference);
    const active = pc.activeEffects?.[effect.id];
    return active && (active.remainingMinutes === -1 || Number.isFinite(active.remainingMinutes) && active.remainingMinutes > 0);
  });
}
export function applyModifiers(base, target, modifiers) {
  if (base == null || !Number.isFinite(Number(base))) return null;
  const values = modifiers.filter(modifier => modifier.target === target && Number.isFinite(modifier.value));
  const sets = values.filter(modifier => modifier.operation === 'set').map(modifier => modifier.value);
  const start = sets.length ? Math.max(...sets) : Number(base);
  const added = values.filter(modifier => modifier.operation === 'add').reduce((sum, modifier) => sum + modifier.value, 0);
  const factor = values.filter(modifier => modifier.operation === 'multiply').reduce((product, modifier) => product * modifier.value, 1);
  return Math.max(target === 'ac' || target === 'speed' || target === 'hp_max' || ITEM_STATS.includes(target) ? 0 : -999999,
    Math.min(999999, Math.floor((start + added) * factor)));
}
export function changeEffects(pc, action, recipient = pc) {
  if (action.type === 'drain-turn') { action.onDrain?.(applyDrain(pc, { turn: true })); return; }
  if (action.type === 'advance') {
    if (!Number.isSafeInteger(action.minutes) || action.minutes < 1 || action.minutes > 525600) throw new Error('Advance 1–525600 game minutes.');
    const drained = action.noDrain ? [] : applyDrain(pc, { minutes: action.minutes }); // resting doesn't bleed the user (noDrain)
    if (drained.length) action.onDrain?.(drained);
    for (const [id, active] of Object.entries(pc.activeEffects || {})) {
      if (active && Number.isFinite(active.remainingMinutes) && active.remainingMinutes >= 0) {
        active.remainingMinutes -= action.minutes;
        if (active.remainingMinutes <= 0) delete pc.activeEffects[id];
      }
    }
    return;
  }
  if (action.type === 'reset') {
    if (!['daily', 'short_rest', 'long_rest'].includes(action.recharge)) throw new Error('Choose a rest or new day.');
    for (const effect of effectDefinitions(pc)) {
      if (effect.recharge === action.recharge || effect.recharge === 'short_or_long_rest' && action.recharge !== 'daily' || effect.recharge === 'short_rest' && action.recharge === 'long_rest') {
        const [group, key] = location(effect.id);
        if (Number.isSafeInteger(effect.max) && effect.max >= 0) pc[group][key].current = effect.max;
      }
    }
    changeEffects(pc, { type: 'advance', minutes: { daily: 1440, short_rest: 60, long_rest: 480 }[action.recharge], noDrain: true });
    return;
  }
  const [group, key] = location(action.id);
  const existing = Object.hasOwn(pc[group] || {}, key) ? pc[group][key] : null;
  if (action.type === 'save') {
    const effect = validateEffect(action.value);
    if (effect.inventoryKey && !Object.hasOwn(pc.inventory || {}, effect.inventoryKey)) throw new Error('Source item is unavailable.');
    pc[group] ||= {};
    pc[group][key] = { ...existing, ...effect, current: effect.max === 0 ? 0 : Math.max(0, Math.min(effect.max, existing?.max > 0 && Number.isSafeInteger(existing?.current) ? existing.current : effect.max)) };
    return;
  }
  if (!existing) throw new Error('Effect is unavailable.');
  if (action.type === 'end') { if (pc.activeEffects) delete pc.activeEffects[action.id]; return; }
  if (action.type === 'delete') {
    if (group !== 'effects') throw new Error('Existing abilities cannot be deleted here.');
    delete pc[group][key];
    if (pc.activeEffects) delete pc.activeEffects[action.id];
    return;
  }
  if (action.type !== 'activate') throw new Error('Invalid effect action.');
  if (existing.spentConsumable === true) throw new Error('This consumable has already been used.');
  const effect = validateEffect({ ...existing, mode: existing.mode || 'activated', consume: existing.consume === true });
  if (action.inventoryKey != null && (!effect.consume || effect.inventoryKey !== action.inventoryKey)) throw new Error('Item effect changed; reopen the bag menu.');
  if (effect.mode !== 'activated') throw new Error('This effect applies automatically.');
  if (recipient !== pc && (!effect.consume || action.inventoryKey == null)) throw new Error('Only consumable item use can target another PC.');
  if (appliedEffects(recipient).some(active => active.label.trim().toLowerCase() === effect.label.toLowerCase())) throw new Error('Effect is already active on the target.');
  const activeId = recipient === pc ? action.id : action.targetEffectId;
  const targetLocation = recipient === pc ? null : location(activeId);
  if (targetLocation && (targetLocation[0] !== 'effects' || Object.hasOwn(recipient.effects || {}, targetLocation[1]))) throw new Error('Target effect already exists.');
  const current = existing.current ?? effect.max;
  if (effect.max > 0 && (!Number.isSafeInteger(current) || current <= 0 || current > effect.max)) throw new Error('No uses remaining.');
  const item = Object.hasOwn(pc.inventory || {}, effect.inventoryKey) ? pc.inventory[effect.inventoryKey] : null;
  if (effect.consume && (!item || !Number.isSafeInteger(item.qty ?? 1) || (item.qty ?? 1) < 1)) throw new Error('No source items remaining.');
  if (effect.consume && itemEquipped(pc, item)) throw new Error('Unequip the source item before consuming it.');
  if (effect.max > 0) existing.current = current - 1;
  if (effect.consume) item.qty = (item.qty ?? 1) - 1;
  if (targetLocation) {
    recipient.effects ||= {};
    recipient.effects[targetLocation[1]] = { ...effect, consume: false, inventoryKey: '', max: 0, current: 0, recharge: 'none', spentConsumable: true };
  }
  recipient.activeEffects ||= {};
  recipient.activeEffects[activeId] = { remainingMinutes: effect.duration_minutes || -1 };
}
