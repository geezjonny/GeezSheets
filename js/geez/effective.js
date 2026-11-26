// A display copy of a character with equipped items and active effects applied. Never save it: writes use the raw record.
import { characterStats } from './equipment-modifiers.js';
import { applyModifiers } from './effects-model.js';
import { sheetRolls } from './sheet-rolls.js';
import { ITEM_STATS } from './item-modifiers.js';

export const asList = value => Array.isArray(value) ? value.filter(Boolean)
  : value && typeof value === 'object' ? Object.values(value).filter(v => v && v !== 'array') : [];
const abilityMod = score => Math.floor((Number(score) - 10) / 2);
const numeric = value => value != null && value !== '' && Number.isFinite(Number(value));
// How much items and effects move a number for one target ('save:con', 'skill:stealth', 'spell_dc', ...).
export const bonusFor = (pc, target, base) => (applyModifiers(base, target, pc?.modifiers || []) ?? base) - base;

export function effectivePC(raw, reference = {}) {
  if (!raw) return raw;
  const pc = structuredClone(raw);
  pc.attacks = asList(pc.attacks);
  if (pc.spellcasting) pc.spellcasting.spells = asList(pc.spellcasting.spells);
  let final;
  try { final = characterStats(raw, reference); } catch { return pc; } // a malformed record still renders with its stored numbers
  const delta = ability => abilityMod(final.stats[ability]) - abilityMod(final.base.stats[ability]);
  const adjust = (value, ability, target) => numeric(value) ? applyModifiers(Number(value) + (ability ? delta(ability) : 0), target, final.modifiers) : value;

  pc.modifiers = final.modifiers;
  pc.stats = { ...pc.stats, ...final.stats };
  pc.combat = { ...pc.combat };
  if (final.ac !== null) pc.combat.ac = final.ac;
  if (numeric(final.base.speed)) pc.combat.speed = applyModifiers(final.base.speed, 'speed', final.modifiers);
  // shortcut: hp_max stays as stored because healing is capped by the stored value; apply it once the heal paths use effective max.
  pc.combat.initiative_bonus = adjust(pc.combat.initiative_bonus, 'dex', 'initiative');
  for (const key of ITEM_STATS) if (numeric(pc.saves?.[key])) pc.saves[key] = adjust(pc.saves[key], key, `save:${key}`);
  const abilities = Object.fromEntries(Object.values(reference).filter(item => item?.ability_score && item.url?.includes('/skills/'))
    .map(item => [item.index.replace(/-/g, '_'), item.ability_score.index]));
  for (const [key, skill] of Object.entries(pc.skills || {})) if (numeric(skill?.bonus)) skill.bonus = adjust(skill.bonus, abilities[key], `skill:${key}`);
  if (numeric(pc.senses?.passive_perception)) pc.senses.passive_perception = Number(pc.senses.passive_perception) +
    delta('wis') + bonusFor(pc, 'skill:perception', Number(raw.skills?.perception?.bonus) || 0);
  const casting = pc.spellcasting;
  if (casting) {
    const ability = String(casting.ability || '').toLowerCase();
    casting.spell_save_dc = adjust(casting.spell_save_dc, ability, 'spell_dc');
    casting.spell_attack_bonus = adjust(casting.spell_attack_bonus, ability, 'spell_attack');
  }
  const weapons = sheetRolls(raw, reference).Weapons;
  for (const [key, source] of Object.entries(raw.attacks || {})) {
    const attack = pc.attacks.find(a => a.name === source?.name && a.damage === source?.damage);
    const hit = weapons.find(r => r.key === `attack:${key}`), damage = weapons.find(r => r.key === `damage:${key}`);
    if (!attack) continue;
    if (hit && Number.isFinite(hit.bonus) && hit.bonus !== Number(source.to_hit ?? source.attack_bonus)) attack.to_hit = `${hit.bonus >= 0 ? '+' : ''}${hit.bonus}`;
    if (damage?.expression) attack.damage = damage.expression;
  }
  return pc;
}
