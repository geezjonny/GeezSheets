import { effectDefinitions, appliedEffects, EFFECT_TARGETS } from './effects-model.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const options = (values, selected) => values.map(value => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(value)}</option>`).join('');
export function modifierRow(modifier = { target: 'ac', operation: 'add', value: 0 }) {
  return `<div class="effect-modifier"><select data-effect-target aria-label="Modifier target">${options(EFFECT_TARGETS, modifier.target)}</select><select data-effect-operation aria-label="Modifier operation">${options(['add', 'multiply', 'set'], modifier.operation)}</select><input data-effect-value type="number" step="any" min="-999" max="999999" required value="${esc(modifier.value)}" aria-label="Modifier value"><button type="button" data-effect-remove aria-label="Remove modifier">×</button></div>`;
}
export function effectsHTML(pc, editable, reference = {}, gm = false) {
  const definitions = effectDefinitions(pc), active = new Set(appliedEffects(pc, reference).map(effect => effect.id));
  let html = definitions.filter(effect => Array.isArray(effect.modifiers)).map(effect => {
    const running = active.has(effect.id), remaining = pc.activeEffects?.[effect.id]?.remainingMinutes;
    const meta = [running ? 'Active' : 'Inactive', effect.max > 0 ? `${effect.current ?? effect.max}/${effect.max} uses` : 'Unlimited',
      running && remaining > 0 ? `${remaining} min left` : effect.duration_minutes ? `${effect.duration_minutes} min` : 'Until ended'];
    return `<article><strong>${esc(effect.label)}</strong><small>${esc(meta.join(' · '))}</small><small>${effect.modifiers.map(mod => esc(`${mod.target} ${mod.operation === 'multiply' ? '×' : mod.operation === 'set' ? '=' : mod.value >= 0 ? '+' : ''}${mod.value}`)).join(' · ')}</small>${effect.description ? `<details><summary>Description</summary><div>${esc(Array.isArray(effect.description)?effect.description.join('\n\n'):effect.description)}</div></details>` : ''}${editable ? `<button type="button" data-effect-action="${running ? 'end' : 'activate'}" data-effect-id="${esc(effect.id)}"${effect.mode === 'passive' || effect.mode === 'equipped' || !running && (effect.spentConsumable === true || effect.max > 0 && (effect.current ?? effect.max) <= 0) ? ' disabled' : ''}>${running ? 'End' : 'Activate'}</button>${effect.id.startsWith('effects:') ? `<button type="button" data-effect-action="delete" data-effect-id="${esc(effect.id)}">Delete</button>` : ''}` : ''}</article>`;
  }).join('') || '<small>No custom effects.</small>';
  if (!editable) return html;
  html += `<details data-effect-builder><summary>Build / edit effect</summary><form class="sheet-inventory-add" data-effect-form>
    <label>Effect<select name="definition"><option value="">New effect</option>${definitions.map(effect => `<option value="${esc(effect.id)}">${esc(effect.label)}</option>`).join('')}</select></label>
    <button type="button" data-effect-preset>Bark Arm preset</button>
    <label>Name<input name="label" maxlength="100" required></label>
    <label>Description<textarea name="description" maxlength="20000" rows="4"></textarea></label>
    <label>Source<select name="category">${options(['Ability', 'Spell', 'Feat', 'Consumable', 'Equipment'], 'Ability')}</select></label>
    <label>Applies<select name="mode">${options(['activated', 'passive', 'equipped'], 'activated')}</select></label>
    <label>Source item<select name="inventoryKey"><option value="">None</option>${Object.entries(pc.inventory || {}).filter(([, item]) => item?.name).map(([key, item]) => `<option value="${esc(key)}">${esc(item.name)}</option>`).join('')}</select></label>
    <label><input name="consume" type="checkbox">Consume one source item on activation</label>
    <label>Uses (0 = unlimited)<input name="max" type="number" min="0" max="999" step="1" value="0" required></label>
    <label>Recharge<select name="recharge">${options(['none', 'daily', 'short_rest', 'long_rest', 'short_or_long_rest'], 'none')}</select></label>
    <label>Duration (game minutes; 0 = until ended)<input name="duration_minutes" type="number" min="0" max="525600" step="1" value="0" required></label>
    <div data-effect-modifiers>${modifierRow()}</div><button type="button" data-effect-add>Add modifier</button><button type="submit">Save effect</button>
  </form></details>`;
  if (gm) html += `<form class="sheet-inventory-add" data-effect-time><label>Advance this character (game minutes)<input name="minutes" type="number" min="1" max="525600" step="1" value="10" required></label><button type="submit">Advance time</button></form>
    <div class="effect-rests"><button type="button" data-effect-reset="daily">New day</button><button type="button" data-effect-reset="short_rest">Short rest</button><button type="button" data-effect-reset="long_rest">Long rest</button></div>`;
  return html;
}
