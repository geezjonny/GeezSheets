// Quick reference for the whole party: one comparison table, then a card per character with everything else folded away.
import { SKILLS } from '../rollcall.js';
import { asList } from '../geez/effective.js';
import { featEntries, featUses } from '../geez/feats-model.js';
import { appliedEffects } from '../geez/effects-model.js';
import { CONDITIONS } from '../geez/sheet-combat.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const mod = (score) => Math.floor((Number(score ?? 10) - 10) / 2);
const bon = (n) => (n == null || n === '' || !Number.isFinite(Number(n)) ? '—' : (Number(n) >= 0 ? '+' : '') + Number(n));

export function skillBonus(pc, key, ability) {
  const skill = pc.skills?.[key] || {}, prof = Number(pc.combat?.proficiency_bonus) || 2;
  return skill.bonus != null && skill.bonus !== '' ? Number(skill.bonus) : mod(pc.stats?.[ability]) + (skill.expertise ? 2 : skill.proficient ? 1 : 0) * prof;
}
export function saveBonus(pc, key) {
  const stored = pc.saves?.[key];
  return stored != null && stored !== '' && Number.isFinite(Number(stored)) ? Number(stored)
    : mod(pc.stats?.[key]) + (asList(pc.saves?.proficient).includes(key) ? Number(pc.combat?.proficiency_bonus) || 2 : 0);
}
export const passive = (pc, key, ability) => (key === 'perception' && Number.isFinite(Number(pc.senses?.passive_perception ?? NaN))
  ? Number(pc.senses.passive_perception) : 10 + skillBonus(pc, key, ability));

export function summaryTable(pcs) {
  if (!pcs.length) return '';
  return `<div class="table-wrap"><table><thead><tr>${['Name', 'HP', 'AC', 'Perc', 'Insight', 'Invest', 'Spell DC', 'Spell atk', 'Init', 'Speed', 'Conditions'].map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${pcs.map((pc) => {
    const c = pc.combat || {}, conds = asList(c.conditions), conc = c.concentration;
    const hp = Number(c.hp_current) || 0, max = Number(c.hp_max) || 0, temp = Number(c.temp_hp) || 0;
    return `<tr data-id="${esc(pc.id)}"><th scope="row">${esc(pc.name)}</th><td><span class="hp-cell">${esc(hp)}/${esc(max)}${temp ? ` +${esc(temp)}` : ''}<span class="updown"><button data-act="heal" data-amount="1" aria-label="${esc(pc.name)}: HP up 1" ${hp >= max ? 'disabled' : ''}>▲</button><button data-act="damage" data-amount="1" aria-label="${esc(pc.name)}: HP down 1" ${hp <= 0 && !temp ? 'disabled' : ''}>▼</button></span></span></td><td>${esc(c.ac ?? '—')}</td><td>${passive(pc, 'perception', 'wis')}</td><td>${passive(pc, 'insight', 'wis')}</td><td>${passive(pc, 'investigation', 'int')}</td><td>${esc(pc.spellcasting?.spell_save_dc || '—')}</td><td>${pc.spellcasting?.spell_attack_bonus ? bon(pc.spellcasting.spell_attack_bonus) : '—'}</td><td>${bon(c.initiative_bonus ?? mod(pc.stats?.dex))}</td><td>${esc(c.speed ?? '—')}</td><td><span class="conditions">${conds.map((x) => `<button data-act="condition-remove" data-name="${esc(x)}" aria-label="Remove ${esc(x)} from ${esc(pc.name)}">${esc(x)} ×</button>`).join('')}<select data-condition aria-label="Add a condition to ${esc(pc.name)}"><option value="">+ Add</option>${CONDITIONS.filter((x) => !conds.includes(x)).map((x) => `<option>${esc(x)}</option>`).join('')}</select>${conc?.active ? `<small>conc: ${esc(conc.spell)}</small>` : ''}</span></td></tr>`;
  }).join('')}</tbody></table></div><p class="muted">Perc, Insight and Invest are passive scores.</p>`;
}

export function details(pc, open) {
  const row = (label, value) => (value ? `<div class="npc-line"><span class="muted">${label}</span><span>${value}</span></div>` : '');
  const section = (key, title, body) => (body ? `<details data-open="${esc(pc.id + ':' + key)}" ${open.has(pc.id + ':' + key) ? 'open' : ''}><summary>${title}</summary>${body}</details>` : '');
  const tb = pc.text_blocks || {};
  const spells = asList(pc.spellcasting?.spells);
  const byLevel = [...new Set(spells.map((s) => Number(s.level) || 0))].sort((a, b) => a - b)
    .map((l) => row(l ? `Level ${l}` : 'Cantrips', spells.filter((s) => (Number(s.level) || 0) === l).map((s) => esc(s.name)).join(', '))).join('');
  const features = featEntries(pc).map((f) => { const uses = featUses(f); return `<div class="npc-line"><span>${esc(f.name)}</span><span class="muted">${uses ? `${uses.current}/${uses.max}` : ''}</span></div>`; }).join('');
  const bag = Object.values(pc.inventory || {}).filter((i) => i?.name).map((i) => esc(i.name) + (Number(i.qty) > 1 ? ' ×' + esc(i.qty) : '')).join(', ');
  const coins = ['pp', 'gp', 'ep', 'sp', 'cp'].filter((k) => Number(pc.coin_purse?.[k])).map((k) => `${esc(pc.coin_purse[k])} ${k}`).join(', ');
  const active = appliedEffects(pc).map((e) => esc(e.label)).join(', ');
  return `<p class="muted">${esc([pc.player_name, pc.species, pc.class, pc.subclass, pc.level ? 'level ' + pc.level : ''].filter(Boolean).join(' · '))}</p>
<div class="statline">${ABILITIES.map((k) => `<span>${k.toUpperCase()} <b>${bon(mod(pc.stats?.[k]))}</b></span>`).join('')}</div>
<div class="statline"><span class="muted">Saves</span>${ABILITIES.map((k) => `<span>${k.toUpperCase()} <b>${bon(saveBonus(pc, k))}</b></span>`).join('')}</div>
${row('Active effects', active)}
${section('skills', 'Skills', `<div class="skill-grid">${SKILLS.map(([key, label, ability]) => `<span>${pc.skills?.[key]?.expertise ? '◉' : pc.skills?.[key]?.proficient ? '●' : '○'} ${label}</span><b>${bon(skillBonus(pc, key, ability))}</b>`).join('')}</div>`)}
${section('attacks', 'Attacks', asList(pc.attacks).map((a) => row(esc(a.name), esc([a.to_hit != null && a.to_hit !== '' ? `${a.to_hit} to hit` : '', a.damage, a.damage_type].filter(Boolean).join(' · ')))).join(''))}
${section('spells', 'Spells', byLevel)}
${section('features', 'Features and uses', features)}
${section('bag', 'Bag and coin', row('Items', bag) + row('Coin', coins))}
${section('about', 'Languages, senses and notes', row('Proficiencies', esc(tb.proficiencies_languages)) + row('Senses', esc(Object.entries(pc.senses || {}).filter(([, v]) => v).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', '))) + row('Backstory', esc(tb.backstory)) + row('Player notes', esc(tb.player_notes)))}`;
}
