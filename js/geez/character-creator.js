import { isGM } from './session-role.js';
import { readPC, updatePCCreation } from './pc-inventory.js';
import { decodeTree } from './firebase-codec.js';
import { CREATOR_KINDS, BASE_STATS, creatorEntries, baseStatValue } from './character-creator-model.js';
import { EFFECT_TARGETS } from './effects-model.js';
import { ITEM_STATS } from './item-modifiers.js';
import { modifierRow } from './effects-view.js';
import { loadSheetReference } from './sheet-view.js';
import { spellInfo } from './spell-model.js';
import { parseOracleDraft } from './deck-oracle-model.js';

const $ = id => document.getElementById(id), query = new URLSearchParams(location.search);
const character = $('creator-character'), kind = $('creator-kind'), record = $('creator-record');
const form = $('creator-form'), fields = $('creator-fields'), status = $('creator-status');
const input = (name, label, attributes = '') => `<label>${label}<input name="${name}" ${attributes}></label>`;
const select = (name, label, values) => `<label>${label}<select name="${name}">${values.map(value => `<option value="${value}">${String(value || 'None / sheet default').replaceAll('_', ' ')}</option>`).join('')}</select></label>`;
const number = (name, label, min, max, extra = 'required') => input(name, label, `type="number" min="${min}" max="${max}" step="1" ${extra}`);
const check = (name, label) => `<label class="creator-check"><input type="checkbox" name="${name}">${label}</label>`;
const description = '<label>Description / custom rules<textarea name="description" rows="6" maxlength="20000"></textarea></label>';
let pc, reference = {}, loadedId, expected = null, pendingKey, busy = false, reading = 0;
const field = name => form.elements.namedItem(name);
const token = () => ({ npcId: `v2:${loadedId}` });
const text = value => Array.isArray(value) ? value.join('\n\n') : typeof value === 'string' ? value : '';

const group = (title, body, hint = '', layout = '') => `<section class="creator-group"><h3>${title}</h3>${hint ? `<p class="creator-hint">${hint}</p>` : ''}<div class="${layout}">${body}</div></section>`;
function modifierFields() {
  return group('Stat changes', '<div id="creator-modifiers"></div><button type="button" data-add-modifier>Add stat change</button>',
    'Each row changes one stat while the effect is active: add a number, multiply it, or set it.');
}
function summarize() { // one plain-words line describing the effect being edited
  const out = $('creator-summary');
  if (!out) return; // an older cached creator.html without the summary line
  if (!['Effect', 'Feat'].includes(kind.value) || !field('mode')) { out.hidden = true; return; }
  const n = name => Number(field(name)?.value) || 0;
  const mods = [...fields.querySelectorAll('.effect-modifier')].map(row => {
    const target = row.querySelector('[data-effect-target]').value.replaceAll('_', ' ').replace(':', ' '), op = row.querySelector('[data-effect-operation]').value, v = Number(row.querySelector('[data-effect-value]').value);
    return Number.isFinite(v) ? `${target.toUpperCase()} ${op === 'multiply' ? '×' + v : op === 'set' ? '= ' + v : (v >= 0 ? '+' : '−') + Math.abs(v)}` : '';
  }).filter(Boolean);
  const parts = [(field('name').value || 'This effect') + (mods.length ? ': ' + mods.join(', ') : '')];
  parts.push([field('mode').value === 'activated' ? (n('max') ? n('max') + ' use' + (n('max') > 1 ? 's' : '') + (field('recharge').value !== 'none' ? ', recharges ' + field('recharge').value.replaceAll('_', ' ') : '') : 'unlimited uses') : 'always on', n('duration_minutes') ? 'lasts ' + n('duration_minutes') + ' min' : 'lasts until ended'].join(', '));
  if (n('drain_sides')) parts.push(`Costs 1d${n('drain_sides')} HP${field('drain_turn').checked ? ' each turn' : ''}${n('drain_minutes') ? (field('drain_turn').checked ? ' and' : '') + ' every ' + n('drain_minutes') + ' min' : ''}, never below ${n('drain_floor')} HP`);
  out.textContent = parts.join('. ') + '.'; out.hidden = false;
}
function fill() {
  if (!pc) return;
  const entry = creatorEntries(pc, kind.value).find(entry => entry.key === record.value);
  expected = structuredClone(entry?.value ?? null);
  pendingKey = entry?.key || null;
  const original = entry?.value, value = original && typeof original === 'object' ? original : {};
  let html = input('name', 'Name', 'maxlength="100" required') + description;
  let defaults = { name: value.label || value.name || (typeof original === 'string' ? original : ''), description: text(value.effect_desc || value.desc || value.description), ...value };
  if (kind.value === 'Spell') {
    html += number('level', 'Spell level (0 = cantrip)', 0, 9) + check('prepared', 'Prepared')
      + input('cast_time', 'Casting time', 'maxlength="200"') + input('range', 'Range', 'maxlength="200"')
      + input('duration', 'Duration', 'maxlength="200"') + check('concentration', 'Concentration')
      + input('damage', 'Damage dice', 'placeholder="1d6+2" maxlength="200"') + input('healing', 'Healing dice', 'maxlength="200"')
      + select('save_stat', 'Saving throw', ['', ...ITEM_STATS]) + number('save_dc', 'Save DC (blank = sheet)', 0, 999, '')
      + number('to_hit', 'Spell attack bonus (blank = sheet)', -999, 999, '');
    defaults = { level: 0, prepared: true, cast_time: '1 action', range: 'Self', duration: 'Instantaneous', ...defaults };
    if (entry) {
      const info = spellInfo(pc, entry.key, reference);
      Object.assign(defaults, { level: info.level ?? 0, prepared: info.available, cast_time: info.castingTime, range: info.range,
        duration: info.duration, concentration: info.concentration, description: info.description,
        damage: typeof value.damage === 'string' ? value.damage : value.damage_dice || '', healing: value.healing || value.heal || '',
        save_stat: value.save_stat || info.data.dc?.dc_type?.index || '' });
      if (!defaults.damage && info.data.damage) {
        const table = info.data.damage.damage_at_slot_level || info.data.damage.damage_at_character_level;
        defaults.damage = table?.[info.level || 1] || '';
      }
    }
  } else if (kind.value === 'Weapon') {
    html += number('to_hit', 'Base attack bonus', -999, 999)
      + input('damage', 'Damage dice', 'maxlength="200" placeholder="1d6+2" required')
      + input('damage_type', 'Damage type', 'maxlength="100"') + select('ability', 'Attack ability', ['', ...ITEM_STATS])
      + input('weight', 'Weight (lb; blank = reference)', 'type="number" min="0" max="999999" step="any"');
    defaults = { to_hit: value.to_hit ?? value.attack_bonus ?? 0, damage: value.damage || value.damage_dice || '1d6', damage_type: '', ability: 'str',
      weight: pc.inventory?.[value.inventoryKey]?.weight ?? null, ...defaults };
  } else if (kind.value === 'Item') {
    html += select('category', 'Category', ['Adventuring Gear', 'Consumable', 'Armor', 'Weapon', 'Card'])
      + number('qty', 'Quantity', 0, 9999) + input('weight', 'Weight each (lb; blank = reference)', 'type="number" min="0" max="999999" step="any"')
      + number('item_ac', 'Equipped AC modifier', -999, 999)
      + select('consumable_kind', 'On consumption', ['', 'healing', 'damage']) + input('consumable_dice', 'Consumption dice', 'maxlength="200"')
      + '<div class="creator-row">' + ITEM_STATS.map(target => number(`item_${target}`, `${target.toUpperCase()} when equipped`, -999, 999)).join('') + '</div>';
    defaults = { category: 'Adventuring Gear', qty: 1, weight: null, ...defaults, item_ac: value.modifiers?.ac ?? 0,
      consumable_kind: value.consumable?.kind || '', consumable_dice: value.consumable?.dice || '' };
    for (const target of ITEM_STATS) defaults[`item_${target}`] = value.modifiers?.stats?.[target] ?? 0;
  } else if (kind.value === 'Effect' || kind.value === 'Feat') {
    html += group('Uses and timing', select('mode', 'How it applies', ['activated', 'passive', 'equipped']) + number('max', 'Uses (0 = unlimited)', 0, 999)
        + select('recharge', 'Recharges', ['none', 'daily', 'short_rest', 'long_rest', 'short_or_long_rest'])
        + number('duration_minutes', 'Lasts (game minutes; 0 = until ended)', 0, 525600),
        'Activated effects start when the player presses Use. Passive ones are always on.', 'creator-grid')
      + group('Source item', '<label>Item this comes from<select name="inventoryKey"></select></label>' + check('consume', 'Use up one of this item when activated'),
        'Optional. Link the effect to an item in the character’s bag.')
      // Life drain: while active, lose 1d{sides} HP at the start of each turn and/or every N game minutes, never below the floor.
      + group('Life drain', number('drain_sides', 'Die (0 = none, 4 = d4)', 0, 100) + number('drain_floor', 'Stops at this many HP', 0, 999)
        + check('drain_turn', 'Lose HP at the start of each of their turns') + number('drain_minutes', 'Also lose HP every N game minutes (0 = never)', 0, 1440),
        'Optional. Costs the user HP while the effect is active, never below the stop value.', 'creator-grid')
      + modifierFields();
    const drain = value.drain || {};
    defaults = { mode: 'activated', max: 0, recharge: 'none', duration_minutes: 0, inventoryKey: '', consume: false,
      drain_sides: drain.sides ?? 0, drain_turn: drain.perTurn === true, drain_minutes: drain.everyMinutes ?? 0, drain_floor: drain.floor ?? 1, ...defaults };
  } else {
    html += select('operation', 'Change', ['add', 'multiply', 'set', 'base']) + '<label>Stat<select name="target"></select></label>'
      + input('value', 'Amount / new base value', 'type="number" step="any" required');
    defaults = { name: 'Permanent adjustment', operation: 'add', target: 'ac', value: 1, ...defaults,
      ...(value.modifiers?.[0] || {}) };
  }
  fields.innerHTML = html;
  if (field('inventoryKey')) field('inventoryKey').replaceChildren(new Option('None', ''), ...Object.entries(pc.inventory || {}).filter(([, item]) => item?.name).map(([key, item]) => new Option(item.name, key)));
  if (field('category') && defaults.category && ![...field('category').options].some(option => option.value === defaults.category)) field('category').add(new Option(defaults.category, defaults.category));
  for (const control of fields.querySelectorAll('[name]')) {
    if (control.name === 'target') continue;
    if (control.type === 'checkbox') control.checked = defaults[control.name] === true;
    else control.value = defaults[control.name] ?? '';
  }
  if ($('creator-modifiers')) $('creator-modifiers').innerHTML = (value.modifiers || []).map(modifierRow).join('');
  if (kind.value === 'Stat') syncStat(defaults.target);
  fields.disabled = false; $('creator-save').disabled = false;
  summarize();
  if (!entry && query.get('name')) field('name').value = query.get('name').slice(0, 100);
}

function syncStat(target = field('target')?.value) {
  const base = field('operation').value === 'base';
  const targets = base ? BASE_STATS : EFFECT_TARGETS;
  field('target').replaceChildren(...targets.map(target => new Option(target.replaceAll('_', ' '), target)));
  field('target').value = targets.includes(target) ? target : 'ac';
  field('name').disabled = base; field('name').required = !base;
  if (base) field('value').value = baseStatValue(pc, field('target').value) ?? '';
}
function listRecords(selected = '') {
  record.replaceChildren(new Option('Create new', ''), ...creatorEntries(pc || {}, kind.value).map(entry => new Option(entry.name, entry.key)));
  record.value = selected; fill();
}
async function loadCharacter() {
  const version = ++reading, id = character.value;
  pc = null; loadedId = null; fields.disabled = true; $('creator-save').disabled = true;
  status.textContent = 'Loading character…';
  try {
    const loaded = await readPC({ npcId: `v2:${id}` });
    if (version !== reading) return;
    pc = loaded; loadedId = id; listRecords();
    status.textContent = `Editing ${pc.name || character.selectedOptions[0]?.textContent || id}.`;
    try {
      const draft = sessionStorage.getItem('geezvtt.creator-draft');
      if (query.has('draft') && draft) {
        const data = parseOracleDraft(JSON.parse(draft));
        if (CREATOR_KINDS.includes(data.kind)) { kind.value = data.kind; listRecords(); }
        if (typeof data.name === 'string') field('name').value = data.name.slice(0, 100);
        if (typeof data.description === 'string') field('description').value = data.description.slice(0, 20000);
        for (const entry of data.fields) {
          const control = field(entry.name);
          if (!control || entry.name === 'target') continue;
          if (control.type === 'checkbox') control.checked = entry.value === 'true';
          else control.value = entry.value;
        }
        if (data.kind === 'Stat') {
          syncStat(data.fields.find(entry => entry.name === 'target')?.value);
          const amount = data.fields.find(entry => entry.name === 'value'); if (amount) field('value').value = amount.value;
        }
        if ($('creator-modifiers') && Array.isArray(data.modifiers)) {
          $('creator-modifiers').replaceChildren();
          for (const modifier of data.modifiers.slice(0, 10)) {
            if (EFFECT_TARGETS.includes(modifier.target) && ['add', 'multiply', 'set'].includes(modifier.operation) && Number.isFinite(modifier.value)) $('creator-modifiers').insertAdjacentHTML('beforeend', modifierRow(modifier));
          }
        }
        query.delete('draft');
        status.textContent = 'Oracle draft loaded. Review before saving.';
      }
    } catch { status.textContent = 'Character loaded; oracle draft unavailable.'; }
  } catch (error) { if (version === reading) status.textContent = error.message; }
}

form.addEventListener('input', summarize);
form.addEventListener('click', event => {
  if (event.target.closest('[data-add-modifier]')) $('creator-modifiers').insertAdjacentHTML('beforeend', modifierRow());
  if (event.target.closest('[data-effect-remove]')) { event.target.closest('.effect-modifier').remove(); summarize(); }
});
form.addEventListener('change', event => {
  if (kind.value === 'Stat' && event.target.name === 'operation') syncStat();
  if (kind.value === 'Stat' && event.target.name === 'target' && field('operation').value === 'base') field('value').value = baseStatValue(pc, field('target').value) ?? '';
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !pc || !loadedId || !form.reportValidity()) return;
  const string = name => field(name)?.value ?? '', num = name => Number(string(name));
  const value = { name: string('name'), description: string('description') };
  if (kind.value === 'Spell') {
    for (const name of ['cast_time', 'range', 'duration', 'damage', 'healing', 'save_stat']) value[name] = string(name);
    value.level = num('level'); value.concentration = field('concentration').checked; value.prepared = field('prepared').checked;
    for (const name of ['to_hit', 'save_dc']) value[name] = string(name).trim() === '' ? null : num(name);
  } else if (kind.value === 'Weapon') Object.assign(value, { to_hit: num('to_hit'), damage: string('damage'), damage_type: string('damage_type'), ability: string('ability'), weight: string('weight').trim() === '' ? null : num('weight') });
  else if (kind.value === 'Item') Object.assign(value, { category: string('category'), qty: num('qty'), weight: string('weight').trim() === '' ? null : num('weight'),
    modifiers: { ac: num('item_ac'), stats: Object.fromEntries(ITEM_STATS.map(target => [target, num(`item_${target}`)])), skills: expected?.modifiers?.skills || {} },
    consumable: string('consumable_kind') ? { kind: string('consumable_kind'), dice: string('consumable_dice') } : null });
  else if (kind.value === 'Stat') Object.assign(value, { target: string('target'), operation: string('operation'), value: num('value') });
  else {
    Object.assign(value, { category: 'Ability', mode: string('mode'), inventoryKey: string('inventoryKey'), consume: field('consume').checked,
      max: num('max'), recharge: string('recharge'), duration_minutes: num('duration_minutes'),
      drain_sides: num('drain_sides'), drain_turn: field('drain_turn').checked, drain_minutes: num('drain_minutes'), drain_floor: num('drain_floor'),
      modifiers: [...fields.querySelectorAll('.effect-modifier')].map(row => ({ target: row.querySelector('[data-effect-target]').value,
        operation: row.querySelector('[data-effect-operation]').value, value: Number(row.querySelector('[data-effect-value]').value) })) });
  }
  const base = kind.value === 'Stat' && value.operation === 'base';
  pendingKey ||= `${kind.value === 'Feat' ? 'abilities:' : ['Effect', 'Stat'].includes(kind.value) ? 'effects:' : ''}${crypto.randomUUID()}`;
  const action = { kind: kind.value, key: pendingKey, value, expected: base ? baseStatValue(pc, value.target) : expected,
    linkedExpected: pc.inventory?.[expected?.inventoryKey] ?? null };
  busy = true; fields.disabled = true; $('creator-save').disabled = true;
  character.disabled = kind.disabled = record.disabled = $('creator-reload').disabled = true;
  status.textContent = 'Saving…';
  try {
    pc = await updatePCCreation(token(), action, reference);
    listRecords(base ? '' : pendingKey);
    status.textContent = 'Saved to character.';
  } catch (error) { status.textContent = `${error.message} Your draft is retained. Reload the character if it changed elsewhere.`; }
  finally {
    busy = false; fields.disabled = false; $('creator-save').disabled = false;
    character.disabled = kind.disabled = record.disabled = $('creator-reload').disabled = false;
  }
});
character.addEventListener('change', loadCharacter);
$('creator-reload').addEventListener('click', loadCharacter);
kind.addEventListener('change', () => { if (pc) listRecords(); });
record.addEventListener('change', fill);

if (!isGM) status.textContent = 'Open Character Workshop from a GM session.';
else {
  kind.replaceChildren(...CREATOR_KINDS.map(kind => new Option(kind, kind)));
  if (CREATOR_KINDS.includes(query.get('kind'))) kind.value = query.get('kind');
  try {
    const base = window.GEEZ_FIREBASE_CONFIG.databaseURL.replace(/\/$/, '');
    const [response, loadedReference] = await Promise.all([fetch(`${base}/v2/worlds/gaia/entities.json`, { signal: AbortSignal.timeout(15000) }), loadSheetReference()]);
    if (!response.ok) throw new Error(`Firebase returned ${response.status}`);
    reference = loadedReference;
    const entities = decodeTree(await response.json());
    character.replaceChildren(...Object.entries(entities || {}).filter(([, entity]) => entity?.kind === 'pc' && entity.data && !entity.data._sheetsDeleted)
      .sort((a, b) => String(a[1].name || a[1].data.name || a[0]).localeCompare(String(b[1].name || b[1].data.name || b[0])))
      .map(([id, entity]) => new Option(entity.name || entity.data.name || id, id)));
    if (!character.options.length) throw new Error('No characters available.');
    if ([...character.options].some(option => option.value === query.get('pc'))) character.value = query.get('pc');
    $('creator').hidden = false;
    await loadCharacter();
  } catch (error) { status.textContent = `${error.message} Reload this page to retry.`; }
}
