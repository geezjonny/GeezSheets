import { characterStats } from './equipment-modifiers.js';
import { buildExpressionRoll } from './dice-roll.js';

const text = value => Array.isArray(value) ? value.join('\n\n') : typeof value === 'string' ? value : '';
const levelNumber = value => value === '' || value == null ? null : Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 9 ? Number(value) : null;
export function spellInfo(pc, key, reference = {}) {
  const spell = Object.hasOwn(pc.spellcasting?.spells || {}, key) && pc.spellcasting.spells[key];
  if (!spell || typeof spell.name !== 'string' || !spell.name.trim()) throw new Error('Spell is unavailable.');
  const data = spell.custom ? {} : reference[spell.name.toLowerCase()] || {};
  const level = spell.prepared_type === 'cantrip' ? 0 : levelNumber(spell.level ?? data.level);
  return { key, name: spell.name, level, prepared: spell.prepared_type || (spell.prepared === true ? 'prepared' : spell.prepared === false ? 'unprepared' : 'Not recorded'),
    available: spell.prepared !== false && !['unprepared', 'not_prepared'].includes(spell.prepared_type),
    castingTime: spell.cast_time || spell.casting_time || data.casting_time || 'Not recorded',
    range: spell.range || data.range || 'Not recorded', duration: spell.duration || data.duration || 'Not recorded',
    concentration: spell.concentration ?? data.concentration ?? false,
    description: text(spell.desc || spell.description || data.desc || spell.notes) || 'No description recorded.',
    higherLevel: text(data.higher_level), spell, data };
}
export function spellList(pc, reference = {}) {
  return Object.keys(pc.spellcasting?.spells || {}).flatMap(key => {
    try { return [spellInfo(pc, key, reference)]; } catch { return []; }
  });
}
export function spellSlot(pc, level) {
  const max = Number(pc.spellcasting?.slots?.[level] ?? 0), used = Number(pc.spellcasting?.slots_used?.[level] ?? 0);
  const valid = Number.isSafeInteger(max) && max >= 0 && max <= 100 && Number.isSafeInteger(used) && used >= 0 && used <= max;
  return { max: valid ? max : 0, used: valid ? used : 0, remaining: valid ? max - used : 0, valid };
}
export function castingLevels(pc, minimum) {
  if (minimum === null || minimum === 0) return [];
  return Array.from({ length: 10 - minimum }, (_, index) => minimum + index).filter(level => spellSlot(pc, level).remaining > 0);
}
function atLevel(table, level) {
  if (!table || typeof table !== 'object') return '';
  const eligible = Object.keys(table).map(Number).filter(key => Number.isInteger(key) && key <= level).sort((a,b) => b-a);
  return text(table[eligible[0]]);
}
// The dice tray holds 12 dice; larger spell rolls are presented as numbered parts.
function rollParts(expression) {
  const value = expression.toLowerCase().replace(/\s+/g, '');
  if (value.length > 200 || !/^[+]?(?:\d*d\d+|-?\d+)(?:[+-](?:\d*d\d+|\d+))*$/.test(value)) throw new Error('Spell dice formula is unavailable.');
  const parts = []; let terms = [], count = 0, total = 0, flat = 0;
  for (const term of value.match(/[+-]?[^+-]+/g)) {
    if (!term.includes('d')) { flat += Number(term); continue; }
    if (term.startsWith('-')) throw new Error('Spell dice counts must be positive.');
    const [raw, sides] = term.replace(/^\+/, '').split('d');
    let left = raw === '' ? 1 : Number(raw);
    if (!Number.isSafeInteger(left) || left < 1 || (total += left) > 120) throw new Error('Spell roll exceeds 120 dice.');
    const limit = Number(sides) === 100 ? 6 : 12;
    while (left) {
      if (count >= limit) { parts.push(terms.join('+')); terms = []; count = 0; }
      const take = Math.min(left, limit-count);
      terms.push(`${take}d${sides}`); count += take; left -= take;
    }
  }
  if (terms.length) parts.push(terms.join('+'));
  if (!parts.length) parts.push('0');
  if (flat) parts[0] += flat > 0 ? `+${flat}` : flat;
  for (const part of parts) buildExpressionRoll(part, 'normal', () => 1);
  return parts;
}
export function spellCast(pc, key, slotLevel, reference = {}) {
  const info = spellInfo(pc, key, reference);
  if (!info.available) throw new Error('This spell is not prepared.');
  if (info.level === null) throw new Error('Record the spell level before using it.');
  if (info.level !== 0 && (!Number.isInteger(slotLevel) || slotLevel < info.level || slotLevel > 9 || !spellSlot(pc, slotLevel).remaining)) throw new Error('No spell slot available at that level.');
  const final = characterStats(pc, reference), { spell, data } = info;
  const ability = String(pc.spellcasting?.ability || '').toLowerCase();
  const mod = Object.hasOwn(final.stats, ability) ? Math.floor((final.stats[ability] - 10) / 2) : null;
  const attack = data.attack_type || spell.attack_type || (/\b(?:melee|ranged) spell attack\b/i.test(info.description) ? 'spell' : '') || (spell.to_hit != null && spell.to_hit !== '' ? 'spell' : '');
  const save = spell.save_stat || data.dc?.dc_type?.index || '';
  const structured = data.damage || typeof spell.damage === 'object' && spell.damage || {};
  const healing = atLevel(spell.heal_at_slot_level || data.heal_at_slot_level, slotLevel) || text(spell.healing || spell.heal);
  const explicitDC = spell.save_dc !== '' && spell.save_dc != null && Number.isFinite(Number(spell.save_dc)) ? Number(spell.save_dc) : null;
  const dc = spell.custom && explicitDC !== null ? explicitDC : final.spellDC ?? explicitDC;
  let formula = healing || (info.level === 0 ? atLevel(structured.damage_at_character_level, Number(pc.level) || 1) : atLevel(structured.damage_at_slot_level, slotLevel)) ||
    (!Object.keys(data).length || attack || save ? text(spell.damage || spell.damage_dice) : '');
  const rolls = [], notes = [];
  const table = healing ? spell.heal_at_slot_level || data.heal_at_slot_level : structured.damage_at_slot_level;
  if (info.level > 0 && slotLevel > info.level && table && !table[slotLevel] && data.index !== 'scorching-ray') {
    formula = ''; notes.push('Upcast dice are not recorded at this level; resolve them using the higher-level description.');
  }
  if (save) notes.push(`Target: ${String(save).toUpperCase()} saving throw${dc !== null ? ` DC ${dc}` : ' (DC unavailable)'}${data.dc?.dc_success === 'half' ? '; half damage on success' : data.dc?.dc_success === 'none' ? '; no damage on success' : ''}.`);
  if (attack) {
    const explicitAttack = spell.to_hit !== '' && spell.to_hit != null && Number.isFinite(Number(spell.to_hit)) ? Number(spell.to_hit) : null;
    const bonus = spell.custom && explicitAttack !== null ? explicitAttack : final.spellAttack ?? explicitAttack;
    if (bonus === null) notes.push('Spell attack bonus unavailable; resolve the attack manually.');
    else {
      const attackCount = data.index === 'eldritch-blast' ? [5,11,17].filter(level => Number(pc.level) >= level).length + 1
        : data.index === 'scorching-ray' ? slotLevel + 1 : Number.isSafeInteger(spell.attack_count) && spell.attack_count > 0 && spell.attack_count <= 20 ? spell.attack_count : 1;
      const expression = `1d20${bonus >= 0 ? '+' : ''}${bonus}`;
      try {
        buildExpressionRoll(expression, 'normal', () => 1);
        for (let i = 0; i < attackCount; i++) rolls.push({ label: `${info.name} attack${attackCount > 1 ? ` ${i+1}/${attackCount}` : ''}`, expression });
        if (attackCount > 1) notes.push(`${attackCount} separate attacks; roll damage for each hit.`);
      } catch { notes.push('Resolve the spell attack manually.'); }
    }
  }
  if (formula) {
    const expression = formula.replace(/\bMOD\b/gi, mod === null ? 'MOD' : String(mod)).replace(/\+\s*-/g, '-');
    try {
      const parts = rollParts(expression);
      const kind = healing ? 'healing' : attack ? 'damage on hit' : save || structured.damage_type || spell.damage_type ? 'damage' : 'effect';
      for (const [i, part] of parts.entries()) rolls.push({ label: `${info.name} ${kind}${parts.length > 1 ? ` (${i+1}/${parts.length})` : ''}`, expression: part });
      if (parts.length > 1) notes.push(`Add the ${parts.length} ${healing ? 'healing' : 'damage'} roll totals.`);
    } catch { notes.push(`Resolve ${healing ? 'healing' : 'damage'} manually: ${formula}.`); }
  }
  if (!notes.length && !rolls.length && !save && !attack && !formula) notes.push('No automatic roll. Resolve the effects in the description.');
  // shortcut: conditional and ongoing spell effects remain manual; add structured roll metadata when automating those spells.
  return { key, name: info.name, level: info.level === 0 ? 0 : slotLevel, rolls, message: notes.join(' '), info };
}
export function useSpell(pc, key, slotLevel, reference = {}) {
  const cast = spellCast(pc, key, slotLevel, reference);
  if (cast.level > 0) {
    pc.spellcasting.slots_used = { ...pc.spellcasting.slots_used, [cast.level]: spellSlot(pc, cast.level).used + 1 };
  }
  return cast;
}
