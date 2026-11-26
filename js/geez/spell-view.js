import { characterStats } from './equipment-modifiers.js';
import { spellList, spellSlot, castingLevels } from './spell-model.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const row = (label, value) => `<div class="sheet-row"><span>${esc(label)}</span><strong>${esc(value ?? '—')}</strong></div>`;
export function spellSlotsHTML(pc, editable = false) {
  let html = '';
  for (let level = 1; level <= 9; level++) {
    const { max, used, valid } = spellSlot(pc, level);
    if (!valid || !max) continue;
    html += `<div class="sheet-slots"><span>Level ${level}: ${max-used}/${max}</span><span class="sheet-pips" role="group" aria-label="${max-used} of ${max} spell slots remaining">${Array.from({ length: max }, (_, i) => `<button type="button" class="sheet-pip${i < used ? ' used' : ''}" data-slot-level="${level}" data-slot-pip="${i}" aria-pressed="${i < used}" aria-label="${i < used ? 'Restore' : 'Spend'} level ${level} slot ${i+1}"${editable ? '' : ' disabled'}></button>`).join('')}</span></div>`;
  }
  return html || '<small>No spell slots.</small>';
}
export function spellsHTML(pc, reference = {}, editable = false) {
  const final = characterStats(pc, reference), spells = spellList(pc, reference);
  let html = row('Ability', pc.spellcasting?.ability) + row('Save DC', final.spellDC) + row('Attack bonus', final.spellAttack);
  for (const [label, cantrip] of [['Cantrips', true], ['Spells', false]]) {
    html += `<h3>${label}</h3>`;
    if (!cantrip) html += spellSlotsHTML(pc, editable);
    html += spells.filter(spell => (spell.level === 0) === cantrip).map(spell => {
      const levels = castingLevels(pc, spell.level);
      const unavailable = !editable || !spell.available || spell.level === null || spell.level > 0 && !levels.length;
      return `<article data-spell-key="${esc(spell.key)}"><div class="spell-name"><strong>${esc(spell.name)}</strong><button type="button" data-spell-use${unavailable ? ' disabled' : ''}>Use</button><button type="button" data-spell-glossary aria-label="${esc(spell.name)} glossary">...</button></div>
        <small>${esc([spell.level === 0 ? 'Cantrip' : spell.level === null ? 'Level unavailable' : `Level ${spell.level}`, spell.prepared, spell.castingTime].join(' · '))}</small>
        ${spell.level > 0 && editable ? `<label class="sheet-equipment">Cast at level<select data-spell-cast-level aria-label="${esc(spell.name)} spell slot"${levels.length ? '' : ' disabled'}>${levels.length ? levels.map(level => `<option value="${level}">${level} (${spellSlot(pc,level).remaining} left)</option>`).join('') : '<option>No slots remaining</option>'}</select></label>` : ''}</article>`;
    }).join('') || '';
    if (!spells.some(spell => (spell.level === 0) === cantrip)) html += '<small>None recorded.</small>';
  }
  return html;
}
export function spellGlossaryHTML(info) {
  return `<h3>${esc(info.name)}</h3>${row('Level', info.level === 0 ? 'Cantrip' : info.level ?? 'Not recorded')}${row('Prepared status', info.prepared)}${row('Casting time', info.castingTime)}${row('Range', info.range)}${row('Duration', info.duration)}${row('Concentration', info.concentration ? 'Yes' : 'No')}
    <h3>Description</h3><p>${esc(info.description)}</p>${info.higherLevel ? `<h3>At higher levels</h3><p>${esc(info.higherLevel)}</p>` : ''}`;
}
