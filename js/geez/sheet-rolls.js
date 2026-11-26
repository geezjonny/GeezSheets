import { characterStats } from './equipment-modifiers.js';
import { applyModifiers } from './effects-model.js';
import { equippedName } from './inventory-model.js';
export const ABILITIES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const sign = value => value >= 0 ? `+${value}` : String(value);
const number = (value, fallback) => value == null || value === '' ? fallback : Number(value);

export function sheetRolls(pc, reference = {}) {
  const final = characterStats(pc, reference);
  const score = ability => final.stats[ability];
  const baseMod = ability => Math.floor((number(pc.roll_base_stats?.[ability] ?? pc.stats?.[ability], 10) - 10) / 2);
  const mod = ability => Math.floor((score(ability) - 10) / 2);
  const delta = ability => mod(ability) - baseMod(ability);
  const proficiency = number(pc.combat?.proficiency_bonus, 2 + Math.floor((number(pc.level, 1) - 1) / 4));
  const physical = ability => final.load.physicalDisadvantage && ['str','dex','con'].includes(ability);
  const check = (key, label, bonus, detail = '') => ({ key, label, bonus, detail, disadvantage: physical(key.split(':')[1]), expression: `1d20${sign(bonus)}` });
  const proficientSaves = Object.values(pc.saves?.proficient || {});
  const armorName = equippedName(pc, 'armor');
  const armor = Object.values(pc.inventory || {}).find(item => item?.name?.toLowerCase() === armorName.toLowerCase() && Number(item.qty ?? 1) > 0);
  const stealthDisadvantage = !!armor && (armor.stealth_disadvantage ?? reference[armorName.toLowerCase()]?.stealth_disadvantage) === true;
  return {
    'Ability Checks': Object.entries(ABILITIES).map(([key, label]) => check(`ability:${key}`, label, mod(key), `Score ${score(key)}`)),
    'Saving Throws': Object.entries(ABILITIES).map(([key, label]) => check(`save:${key}`, `${label} save`,
      applyModifiers(number(pc.saves?.[key]?.bonus, baseMod(key) + (proficientSaves.includes(key) ? proficiency : 0)) + delta(key), `save:${key}`, final.modifiers))),
    'Skill Checks': Object.values(reference).filter(item => item.ability_score && item.url?.includes('/skills/')).map(skill => {
      const key = skill.index.replace(/-/g, '_'), data = pc.skills?.[key] || {};
      const ability = skill.ability_score.index;
      const bonus = number(data.bonus, baseMod(ability) + (data.expertise ? 2 : data.proficient ? 1 : 0) * proficiency)
        + delta(ability);
      const disadvantage = key === 'stealth' && stealthDisadvantage || physical(ability);
      return { ...check(`skill:${key}`, `${skill.name}${data.expertise ? ' (expertise)' : data.proficient ? ' (proficient)' : ''}`, applyModifiers(bonus, `skill:${key}`, final.modifiers), disadvantage ? `Disadvantage: ${physical(ability) ? 'heavy encumbrance' : armorName}` : ''), disadvantage };
    }),
    Initiative: [check('initiative', 'Initiative', applyModifiers(number(pc.combat?.initiative_bonus, baseMod('dex')) + delta('dex'), 'initiative', final.modifiers))],
    Weapons: Object.entries(pc.attacks || {}).flatMap(([key, attack]) => {
      if (!attack?.name) return [];
      const weapon = reference[attack.name.toLowerCase()] || {};
      const finesse = Object.values(weapon.properties || {}).some(property => property?.index === 'finesse');
      const ability = Object.hasOwn(ABILITIES, attack.ability) ? attack.ability : weapon.weapon_category ? (weapon.weapon_range === 'Ranged' ? 'dex' : 'str') : null;
      // shortcut: custom attacks need an ability or SRD weapon match to adjust stored attack bonuses.
      const adjustment = finesse ? Math.max(mod('str'), mod('dex')) - Math.max(baseMod('str'), baseMod('dex')) : ability ? delta(ability) : 0;
      const bonus = applyModifiers(number(attack.to_hit ?? attack.attack_bonus, NaN) + adjustment, 'attack_bonus', final.modifiers) ?? NaN;
      const damageBonus = applyModifiers(0, 'damage_bonus', final.modifiers);
      const damageAdjustment = adjustment + damageBonus;
      const damageSource = String(attack.damage || attack.damage_dice || '');
      const suffix = /([+-])\s*(\d+)(?=\s*(?:[a-z]+(?:\s+damage)?)?$)/i;
      let damage = damageSource.replace(suffix,
        (term, sign, value) => damageAdjustment ? (Number(`${sign}${value}`) + damageAdjustment >= 0 ? '+' : '') + (Number(`${sign}${value}`) + damageAdjustment) : term);
      if (damageAdjustment && !suffix.test(damageSource)) damage = damage.replace(/^(\s*\d*d\d+)/i, `$1${sign(damageAdjustment)}`);
      return [
        { ...check(`attack:${key}`, `${attack.name} attack`, bonus), detail: 'To hit', disadvantage: physical(finesse ? (mod('dex') > mod('str') ? 'dex' : 'str') : ability) },
        { key: `damage:${key}`, label: `${attack.name} damage`, expression: damage, detail: attack.damage_type || '' }
      ];
    })
  };
}

export function changeSpellSlot(pc, level, pip) {
  const max = Number(pc.spellcasting?.slots?.[level]);
  if (!Number.isInteger(level) || level < 1 || level > 9 || !Number.isSafeInteger(max) || max < 1 || max > 100 ||
      !Number.isInteger(pip) || pip < 0 || pip >= max) throw new Error('Spell slot unavailable.');
  const used = Number(pc.spellcasting.slots_used?.[level] ?? 0);
  if (!Number.isSafeInteger(used) || used < 0 || used > max) throw new Error('Invalid used spell slot count.');
  pc.spellcasting.slots_used = { ...pc.spellcasting.slots_used, [level]: used + (pip < used ? -1 : 1) };
}
