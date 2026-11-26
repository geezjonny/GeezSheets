// Pure helpers behind the companion screens: what a character can do on a turn, uses, and critical dice.
import { asList } from './geez/effective.js';
import { featEntries, featUses } from './geez/feats-model.js';

export const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const isSpellAttack = (attack) => /\((cantrip|spell)\)/i.test(attack?.name || '');
export const isPrepared = (spell) => spell.prepared !== false && !['unprepared', 'not_prepared'].includes(spell.prepared_type);
// Use bubbles belong to things you spend; passive features often carry a meaningless max of 1.
export const spendable = (feat) => (feat?.kind === 'passive' || feat?.mode === 'passive' ? null : featUses(feat || {}));
export const canActivate = (feat) => Array.isArray(feat?.modifiers) && feat.mode === 'activated';

export function timing(castTime) {
  const text = String(castTime || '').toLowerCase();
  if (text.includes('bonus')) return 'bonus';
  if (text.includes('reaction')) return 'reaction';
  return !text || /^(1 )?action/.test(text) ? 'action' : 'longer';
}

// The lowest slot level that can still cast a spell of this level, or 0 if none is left.
export function openSlot(spellcasting, level) {
  for (let l = Math.max(1, level); l <= 9; l++) {
    if (Number(spellcasting?.slots?.[l] || 0) > Number(spellcasting?.slots_used?.[l] || 0)) return l;
  }
  return 0;
}

// Everything usable at the table, grouped by what it costs. `pc` is the stored record, `fx` the copy with bonuses applied.
export function turnOptions(pc, fx, srd = {}) {
  const groups = { action: [], bonus: [], reaction: [], resources: [], longer: [] };
  asList(fx.attacks).forEach((attack, idx) => { if (!isSpellAttack(attack)) groups.action.push({ type: 'weapon', name: attack.name, idx, attack }); });
  for (const spell of asList(fx.spellcasting?.spells)) {
    if (!isPrepared(spell)) continue;
    const data = spell.custom ? {} : srd[norm(spell.name)] || {};
    groups[timing(spell.cast_time || data.casting_time)].push({ type: 'spell', name: spell.name, spell, data });
  }
  for (const feat of featEntries(pc)) {
    const where = { action: 'action', bonus_action: 'bonus', reaction: 'reaction' }[feat.activation]
      || (spendable(feat) || canActivate(feat) ? 'resources' : null);
    if (where) groups[where].push({ type: 'feature', name: feat.name, id: feat.id, feat });
  }
  return groups;
}

// A critical hit rolls every damage die twice; flat bonuses stay as they are.
export const criticalDice = (expression) => String(expression).replace(/(\d*)d(\d+)/g, (_, n, sides) => `${(Number(n) || 1) * 2}d${sides}`);
