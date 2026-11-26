import { ITEM_STATS } from './item-modifiers.js';
export const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious', 'Concentrating', 'Bleeding'];

export function conditionNames(value) {
  return [...new Set(Object.entries(value && typeof value === 'object' ? value : {}).flatMap(([key, name]) =>
    key === '%EMPTY' ? [] : typeof name === 'string' && name.trim() ? [name.trim()] : name === true ? [key] : []))];
}

export function changeCombat(pc, action) {
  if(action.type === 'edition') {
    if(!['2014','2024'].includes(action.value)) throw new Error('Choose 2014 or 2024 rules.');
    pc.rules_edition=action.value; return;
  }
  if (action.type === 'base-stat') {
    if (!ITEM_STATS.includes(action.field) || !Number.isSafeInteger(action.value) || action.value < 0 || action.value > 999) throw new Error('Ability scores must be whole numbers from 0 to 999.');
    pc.roll_base_stats ||= Object.fromEntries(ITEM_STATS.map(key => [key, Number(pc.stats?.[key] ?? 10)]));
    pc.combat ||= {};
    pc.combat.hp_base_con ??= Number(pc.stats?.con ?? 10);
    pc.stats ||= {}; pc.stats[action.field] = action.value; return;
  }
  if (action.type === 'ac-mode') {
    if (!['stored', 'unarmored', 'armor'].includes(action.value)) throw new Error('Choose an AC calculation.');
    pc.combat ||= {}; pc.combat.ac_mode = action.value; return;
  }
  if (action.type === 'condition') {
    const current = conditionNames(pc.combat?.conditions);
    if (typeof action.enabled !== 'boolean' || (!CONDITIONS.includes(action.name) && !current.includes(action.name))) throw new Error('Choose a condition.');
    const next = current.filter(name => name !== action.name);
    if (action.enabled) next.push(action.name);
    pc.combat ||= {};
    pc.combat.conditions = next;
    return;
  }
  const limits = { hp_current: [0, 999999], hp_max: [1, 999999], temp_hp: [0, 999999], ac: [0, 999], speed: [0, 1000], exhaustion: [0, 6] };
  let field = action.field, value = action.value;
  if (action.type === 'exhaustion') {
    if (![1, -1].includes(action.delta)) throw new Error('Adjust exhaustion by one level.');
    field = 'exhaustion';
    value = Number(pc.combat?.exhaustion ?? pc.exhaustion ?? 0) + action.delta;
  } else if (action.type !== 'set') throw new Error('Invalid stat change.');
  if (!Object.hasOwn(limits, field)) throw new Error('Invalid stat.');
  const [min, max] = limits[field];
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${field.replace(/_/g, ' ')} must be a whole number from ${min} to ${max}.`);
  pc.combat ||= {};
  pc.combat[field] = value;
  if (field === 'hp_max' && pc.combat.hp_base_con !== undefined) pc.combat.hp_base_con = Number(pc.stats?.con ?? 10);
}
