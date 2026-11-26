import { carryingLoad } from './inventory-weight.js';
import { EQUIPMENT_SLOTS, equippedName, equippedItem, itemEquipped } from './inventory-model.js';
import { appliedEffects, applyModifiers, EFFECT_TARGETS } from './effects-model.js';
import { ITEM_STATS, ITEM_SKILLS } from './item-modifiers.js';

export function equippedModifiers(pc, reference = {}) {
  const equipped = new Set();
  for (const slot of Object.keys(EQUIPMENT_SLOTS)) {
    const item = equippedItem(pc, slot, reference);
    if (item) equipped.add(item);
  }
  const result = { ac: 0, stats: {}, skills: {} };
  const bonus = value => Number.isSafeInteger(value) && Math.abs(value) <= 999 ? value : 0;
  for (const item of equipped) {
    result.ac += bonus(item.modifiers?.ac);
    for (const [group, keys] of [['stats', ITEM_STATS], ['skills', ITEM_SKILLS]]) {
      for (const key of keys) result[group][key] = (result[group][key] || 0) + bonus(item.modifiers?.[group]?.[key]);
    }
  }
  return result;
}

export function cardConditions(pc) {
  return Object.values(pc.inventory || {}).filter(item => Array.isArray(item?.conditions) && itemEquipped(pc, item)).flatMap(item => item.conditions);
}

export function baseSpeed(pc) {
  const value = pc.combat?.speed ?? pc.combat?.spd ?? pc.basic?.speed ?? pc.speed ?? pc.spd;
  const speed = typeof value === 'string' && value.trim() ? Number(value.trim().replace(/\s*(ft\.?|feet)\s*$/i, '')) : value;
  return Number.isFinite(speed) && speed >= 0 && speed <= 1000 ? speed : null;
}

export function characterStats(pc, reference = {}) {
  const equipment = equippedModifiers(pc, reference);
  const effects = appliedEffects(pc, reference);
  const modifiers = [
    { target: 'ac', operation: 'add', value: equipment.ac },
    ...Object.entries(equipment.stats).map(([target, value]) => ({ target, operation: 'add', value })),
    ...Object.entries(equipment.skills).map(([key, value]) => ({ target: `skill:${key}`, operation: 'add', value })),
    ...effects.flatMap(effect => effect.modifiers.filter(modifier => EFFECT_TARGETS.includes(modifier?.target) &&
      ['add', 'multiply', 'set'].includes(modifier.operation) && Number.isFinite(modifier.value)))
  ];
  const base = { stats: {}, ac: pc.combat?.ac ?? pc.combat?.armor_class ?? pc.ac ?? null,
    speed: baseSpeed(pc), hpMax: pc.combat?.hp_max ?? null };
  const stats = {};
  for (const key of ITEM_STATS) {
    base.stats[key] = pc.stats?.[key] == null || pc.stats[key] === '' ? 10 : Number(pc.stats[key]);
    stats[key] = applyModifiers(base.stats[key], key, modifiers);
  }
  const dex = Math.floor((stats.dex - 10) / 2);
  let armorAC = base.ac;
  const mode = pc.combat?.ac_mode || 'stored';
  if (mode === 'unarmored') armorAC = 10 + dex;
  if (mode === 'armor') {
    const name = equippedName(pc, 'armor');
    const armor = Object.values(pc.inventory || {}).find(item => item?.name?.toLowerCase() === name.toLowerCase() && Number(item.qty ?? 1) > 0);
    const formula = armor?.armor_class || reference[name.toLowerCase()]?.armor_class;
    armorAC = !name ? 10 + dex : formula && Number.isFinite(formula.base) ? formula.base + (formula.dex_bonus ? Math.min(dex, formula.max_bonus ?? Infinity) : 0) : null;
  }
  if (mode !== 'stored' && armorAC !== null) {
    const name = equippedName(pc, 'shield');
    const shield = Object.values(pc.inventory || {}).find(item => item?.name?.toLowerCase() === name.toLowerCase() && Number(item.qty ?? 1) > 0);
    // Explicit shield modifiers already describe its AC contribution.
    if (shield && !shield.modifiers?.ac) armorAC += shield.armor_class?.base ?? reference[name.toLowerCase()]?.armor_class?.base ?? 2;
  }
  const ac = armorAC == null || armorAC === '' ? null : applyModifiers(Number(armorAC), 'ac', modifiers);
  const delta = ability => Object.hasOwn(stats, ability) ? Math.floor((stats[ability] - 10) / 2) - Math.floor((Number(pc.roll_base_stats?.[ability] ?? base.stats[ability]) - 10) / 2) : 0;
  const casting = pc.spellcasting || {};
  const spell = (value, target) => value == null || value === '' ? null : applyModifiers(Number(value) + delta(casting.ability?.toLowerCase()), target, modifiers);
  const hpDelta = (Number.isSafeInteger(pc.level) && pc.level > 0 ? pc.level : 0) * (Math.floor((stats.con - 10) / 2) - Math.floor((Number(pc.combat?.hp_base_con ?? base.stats.con) - 10) / 2));
  const load = carryingLoad(pc, stats.str, reference);
  const speed = applyModifiers(base.speed, 'speed', modifiers);
  return { base, stats, ac, load, speed: speed === null ? null : load.overCapacity ? 0 : Math.max(0, speed - load.speedPenalty), hpMax: applyModifiers(base.hpMax == null ? null : Number(base.hpMax) + hpDelta, 'hp_max', modifiers),
    equipment, modifiers, effects, spellAttack: spell(casting.spell_attack_bonus, 'spell_attack'), spellDC: spell(casting.spell_save_dc, 'spell_dc') };
}

export function equippedAC(pc, reference = {}) {
  return characterStats(pc, reference).ac;
}
