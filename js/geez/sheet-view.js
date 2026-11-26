import { EQUIPMENT_SLOTS, COIN_TYPES, fitsEquipment, equippedName, equippedItem, itemEquipped } from './inventory-model.js';
import { modifierText } from './item-modifiers.js';
import { characterStats, baseSpeed, cardConditions } from './equipment-modifiers.js';
import { spellsHTML, spellSlotsHTML } from './spell-view.js';
import { sheetRolls } from './sheet-rolls.js';
import { effectsHTML } from './effects-view.js';
import { CONDITIONS, conditionNames } from './sheet-combat.js';
import { featEntries, featUses } from './feats-model.js';
import { itemWeight, carryingLoad } from './inventory-weight.js';
export const SHEET_SECTIONS = ['Stats', 'Weapons', 'Inventory', 'Feats', 'Spells', 'Effects'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const text = value => Array.isArray(value) ? value.join('\n\n') : value;
const heading = label => `<h3>${esc(label)}</h3>`;
const row = (label, value) => `<div class="sheet-row"><span>${esc(label)}</span><strong>${esc(value ?? '—')}</strong></div>`;
const card = (name, description, meta = '') => `<article><strong>${esc(name)}</strong>${meta ? `<small>${esc(meta)}</small>` : ''}${description ? `<p>${esc(text(description))}</p>` : ''}</article>`;
let referencePromise;
export function loadSheetReference() {
  return referencePromise ||= Promise.all(['spells', 'equipment', 'magic_items', 'skills'].map(async name => {
    const response = await fetch(`data/${name}.json`);
    if (!response.ok) throw new Error('Reference descriptions unavailable.');
    return response.json();
  })).then(groups => Object.fromEntries(groups.flat().map(item => [item.name.toLowerCase(), item]))).catch(error => {
    referencePromise = null;
    throw error;
  });
}

export function sheetHTML(pc, section, reference = {}, rollable = false, editableCombat = false, gm = false) {
  const combat = pc.combat || {};
  const final = characterStats(pc, reference);
  if (section === 'Effects') return effectsHTML(pc, editableCombat, reference, gm);
  const lookup = name => reference[String(name).toLowerCase()] || {};
  const rollRow = (roll, compact = false) => {
    const unavailable = !roll.expression || (roll.bonus !== undefined && !Number.isFinite(roll.bonus));
    const value = unavailable ? 'Unavailable' : roll.bonus === undefined ? roll.expression : roll.bonus >= 0 ? `+${roll.bonus}` : roll.bonus;
    const label = compact && /^(ability|save):/.test(roll.key) ? roll.key.split(':')[1].toUpperCase() : roll.label;
    const content = `<span>${esc(label)}</span><strong>${esc(value)}</strong>${roll.disadvantage ? '<small aria-label="Disadvantage">dis</small>' : ''}`;
    return (rollable ? `<button type="button" class="sheet-row sheet-roll" data-sheet-roll="${esc(roll.key)}"${unavailable ? ' disabled' : ''} aria-label="${esc(roll.label)}" title="${esc([roll.label, roll.detail, roll.expression].filter(Boolean).join(' · '))}">${content}</button>` : `<div class="sheet-row">${content}</div>`)
      + (!compact && roll.detail ? `<small>${esc(roll.detail)}</small>` : '');
  };
  if (section === 'Weapons') {
    const rolls = sheetRolls(pc, reference).Weapons;
    const button = (roll, label) => {
      const unavailable = !roll.expression || (roll.bonus !== undefined && !Number.isFinite(roll.bonus));
      return `<button type="button"${rollable ? ` data-sheet-roll="${esc(roll.key)}"` : ''}${!rollable || unavailable ? ' disabled' : ''} aria-label="${esc(roll.label)}" title="${esc(unavailable ? 'Unavailable' : [roll.expression, roll.detail].filter(Boolean).join(' · '))}">${label}</button>`;
    };
    let html = '';
    for (let i = 0; i < rolls.length; i += 2) {
      const attack = rolls[i], damage = rolls[i + 1];
      html += `<div class="sheet-weapon"><strong>${esc(pc.attacks[attack.key.slice(7)].name)}</strong>${button(attack, 'Attack')}${button(damage, 'Damage')}</div>`;
    }
    return html || '<p>No weapon attacks recorded.</p>';
  }
  if (section === 'Stats') {
    const edit = (label, field, value, max = 999999, min = 0, suffix = '') => `<label class="sheet-row"><span>${esc(label)}</span><span><input type="number" data-combat-field="${field}" aria-label="${esc(label)}" min="${min}" max="${max}" step="1" value="${esc(value ?? '')}">${esc(suffix)}</span></label>`;
    let html = row('HP', `${combat.hp_current ?? 0} / ${final.hpMax ?? '—'}`)
      + row('Temporary HP', combat.temp_hp ?? 0)
      + row('AC', final.ac)
      + row('Exhaustion', combat.exhaustion ?? pc.exhaustion ?? 0);
    if (editableCombat) {
      const exhaustion = Number(combat.exhaustion ?? pc.exhaustion ?? 0);
      html = edit('HP', 'hp_current', combat.hp_current ?? 0, 999999, 0, ` / ${final.hpMax ?? '—'}`)
        + (gm ? edit('Maximum HP (base)', 'hp_max', combat.hp_max, 999999, 1) + row('Maximum HP total', final.hpMax) : '')
        + edit('Temporary HP', 'temp_hp', combat.temp_hp ?? 0)
        + (gm ? edit('AC (base)', 'ac', combat.ac ?? combat.armor_class ?? pc.ac, 999) : '') + row('AC total', final.ac)
        + `<div class="sheet-exhaustion"><button type="button" data-exhaustion-delta="-1" aria-label="Decrease exhaustion"${exhaustion <= 0 ? ' disabled' : ''}>−</button>${edit('Exhaustion', 'exhaustion', exhaustion, 6)}<button type="button" data-exhaustion-delta="1" aria-label="Increase exhaustion"${exhaustion >= 6 ? ' disabled' : ''}>+</button></div>`;
    }
    if (editableCombat && gm) {
      html += `<label>Rules<select data-rules-edition><option value="2024"${String(pc.rules_edition || pc.edition || '2024') === '2014' ? '' : ' selected'}>2024</option><option value="2014"${String(pc.rules_edition || pc.edition) === '2014' ? ' selected' : ''}>2014</option></select></label>`;
      html += `<label class="sheet-equipment">AC calculation<select data-ac-mode>${['stored', 'unarmored', 'armor'].map(mode => `<option value="${mode}"${(combat.ac_mode || 'stored') === mode ? ' selected' : ''}>${{ stored: 'Stored AC + effects', unarmored: '10 + DEX + effects', armor: 'Equipped armor + DEX + effects' }[mode]}</option>`).join('')}</select></label>`;
      html += edit('SPD base (ft)', 'speed', baseSpeed(pc), 1000);
    }
    html = `<div class="sheet-vitals">${html}${row('SPD (ft)', final.speed)}</div>`;
    html += heading('Ability scores');
    html += `<div${editableCombat && gm ? '' : ' class="sheet-abilities"'}>`;
    for (const [key, label] of Object.entries({ str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' })) {
      if (editableCombat && gm) html += `<label class="sheet-row"><span>${label} base</span><input type="number" data-base-stat="${key}" aria-label="${label} base" min="0" max="999" step="1" value="${esc(final.base.stats[key])}"></label>`;
      html += row(label, final.stats[key]);
    }
    html += '</div>';
    if (final.effects.length) html += row('Active effects', final.effects.map(effect => effect.label).join(', '));
    const conditions = conditionNames(combat.conditions);
    html += row('Conditions', conditions.join(', ') || 'None');
    if (cardConditions(pc).length) html += row('Card conditions', [...new Set(cardConditions(pc))].join(', '));
    if (editableCombat) {
      const options = [...new Set([...conditions, ...CONDITIONS])];
      html += `<label class="sheet-equipment">Conditions<select data-condition-toggle aria-label="Add or remove a condition"><option value="">Add / remove condition</option>${options.map(name => `<option value="${esc(name)}" data-enabled="${!conditions.includes(name)}">${conditions.includes(name) ? 'Remove' : 'Add'} ${esc(name)}</option>`).join('')}</select></label>`;
    }
    for (const [label, rolls] of Object.entries(sheetRolls(pc, reference))) {
      if (label === 'Weapons') continue;
      const grid = ['Ability Checks', 'Saving Throws', 'Skill Checks'].includes(label);
      html += heading(label);
      if (grid) html += `<div class="sheet-check-grid${label === 'Skill Checks' ? ' sheet-skill-grid' : ''}">`;
      html += rolls.map(roll => grid ? `<div title="${esc([roll.label, roll.detail, roll.expression].filter(Boolean).join(' · '))}">${rollRow(roll, true)}</div>` : rollRow(roll)).join('');
      if (grid) html += '</div>';
    }
    html += heading('Spell slots');
    html += spellSlotsHTML(pc, editableCombat);
    return html;
  }
  if (section === 'Inventory') {
    const items = Object.entries(pc.inventory || {}).filter(([, item]) => item && typeof item.name === 'string');
    const load = carryingLoad(pc, final.stats.str, reference);
    let html = row('Carried (lb)', `${load.weight}${load.unknown ? ' + unknown' : ''} / ${load.capacity ?? '—'}`)
      + row('Load', `${load.status}${load.unknown ? '; incomplete weights' : ''}`)
      + heading('Equipment') + '<div class="sheet-equip-grid">';
    for (const [slot, label] of Object.entries(EQUIPMENT_SLOTS)) {
      const name = equippedName(pc, slot);
      const options = items.filter(([, item]) => Number(item.qty ?? 1) > 0 && fitsEquipment(slot, item, reference));
      const wornItem = equippedItem(pc, slot, reference);
      const selected = options.find(([, item]) => item === wornItem)?.[0];
      html += `<label class="sheet-equipment">${esc(label)}<select data-equipment-slot="${slot}" data-current-key="${esc(selected ?? '')}"${editableCombat && (gm || slot !== 'card' || !name) ? '' : ' disabled'}><option value="">Unequip</option>${name && selected === undefined ? `<option value="" selected disabled>${esc(name)}</option>` : ''}${options.map(([key, item]) => `<option value="${esc(key)}"${key === selected ? ' selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>`;
      const description = wornItem?.desc ?? lookup(name).desc;
      if (name && description) html += card(name, description, modifierText(wornItem?.modifiers));
    }
    html += '</div>' + heading('Bag');
    html += `<div data-bag>${items.map(([key, item]) => `<div data-bag-key="${esc(key)}"${editableCombat ? ' tabindex="0"' : ''} aria-label="${esc(item.name)}${editableCombat ? ' bag actions' : ''}">${editableCombat ? `<button type="button" data-bag-menu aria-label="${esc(item.name)} actions">\u22ef</button>` : ''}${card(`${item.name} \u00d7${item.qty ?? 1}${itemEquipped(pc, item, reference) ? ' (equipped)' : ''}`, item.desc ?? lookup(item.name).desc,
      [item.category, itemWeight(item, reference) === null ? 'Weight unknown' : `${itemWeight(item, reference)} lb each`, modifierText(item.modifiers), item.notes].filter(Boolean).join(' \u00b7 '))}</div>`).join('') || '<p>Bag is empty.</p>'}</div>`;
    html += heading('Coins') + '<div class="sheet-coins">';
    for (const [coin, label] of Object.entries(COIN_TYPES)) {
      const amount = pc.coin_purse?.[coin] ?? 0;
      html += editableCombat ? `<div class="sheet-coin"><span>${label} (${coin})</span><button type="button" data-coin="${coin}" data-coin-delta="-1" aria-label="Remove one ${label.toLowerCase()} coin"${Number(amount) <= 0 ? ' disabled' : ''}>−</button><strong>${esc(amount)}</strong><button type="button" data-coin="${coin}" data-coin-delta="1" aria-label="Add one ${label.toLowerCase()} coin">+</button></div>` : row(`${label} (${coin})`, amount);
    }
    return html + '</div>';
  }
  if (section === 'Feats') {
    let html = featEntries(pc).map(feat => {
      const uses = featUses(feat), active = final.effects.some(effect => effect.id === feat.id);
      const unavailable = !editableCombat || uses?.current === 0 || ['passive', 'equipped'].includes(feat.mode) || active;
      const meta = [uses ? `${uses.current}/${uses.max} charges` : '', feat.die, feat.recharge].filter(Boolean).join(' · ');
      const description = feat.effect_desc || feat.desc || feat.description || lookup(feat.name).desc || '';
      const pips = uses ? `<span class="sheet-pips" role="group" aria-label="${esc(feat.name)}: ${uses.current} of ${uses.max} uses remaining">${Array.from({ length: uses.max }, (_, i) => {
        const spent = i < uses.max - uses.current;
        return `<button type="button" class="sheet-pip${spent ? ' used' : ''}" data-feat-pip="${i}" aria-pressed="${spent}" aria-label="${spent ? 'Restore' : 'Spend'} ${esc(feat.name)} use ${i + 1}"${editableCombat ? '' : ' disabled'}></button>`;
      }).join('')}</span>` : '';
      return `<article data-feat-id="${esc(feat.id)}"><div class="spell-name"><strong>${esc(feat.name)}</strong><button type="button" data-feat-use${unavailable ? ' disabled' : ''}>Use</button><button type="button" data-feat-details aria-expanded="false" aria-label="${esc(feat.name)} details">...</button></div>${pips}<div data-feat-description hidden>${meta ? `<small>${esc(meta)}</small>` : ''}${description ? `<p>${esc(text(description))}</p>` : ''}</div></article>`;
    }).join('');
    for (const [name, description] of [['Origin feat', pc.origin_feat], ['Features & traits', pc.text_blocks?.features_traits], ['Proficiencies & languages', pc.text_blocks?.proficiencies_languages]]) {
      if (description) html += `<details><summary>${name}</summary><p>${esc(text(description))}</p></details>`;
    }
    return html || '<p>No feats or features recorded.</p>';
  }
  if (section === 'Spells') return spellsHTML(pc, reference, editableCombat);
  return '';
}
