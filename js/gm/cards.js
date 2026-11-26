// Cards tab: a card is a bag item with bonuses and conditions, plus effects and feats that work while it is equipped.
import { givePCCard } from '../geez/pc-inventory.js';
import { modifierRow } from '../geez/effects-view.js';
import { ITEM_STATS, ITEM_SKILLS } from '../geez/item-modifiers.js';
import { CONDITIONS } from '../geez/sheet-combat.js';

const $ = (id) => document.getElementById(id);
const options = (values) => values.map((value) => `<option value="${value}">${value.replaceAll('_', ' ')}</option>`).join('');
const remove = '<button type="button" data-card-remove aria-label="Remove">×</button>';
const text = '<input data-card-name maxlength="100" placeholder="Name" aria-label="Name" required><textarea data-card-desc rows="2" maxlength="20000" placeholder="Description" aria-label="Description"></textarea>';
const ROWS = {
  skill: `<select data-card-skill aria-label="Skill">${options(ITEM_SKILLS)}</select><input data-card-value type="number" min="-999" max="999" step="1" value="1" aria-label="Skill modifier">${remove}`,
  change: () => modifierRow(),
  effect: `${text}${remove}`,
  feat: `${text}${remove}`,
  condition: `<select data-card-condition aria-label="Condition">${options(CONDITIONS)}</select>${remove}`
};

export function mountCards(ctx) {
  const form = $('card-form'), status = (t) => { $('card-status').textContent = t; };
  let pending = null;
  $('card-stats').innerHTML = ITEM_STATS.map((key) => `<label>${key.toUpperCase()}<input type="number" name="${key}" min="-999" max="999" step="1" value="0"></label>`).join('');
  ctx.onParty(() => {
    const selected = $('card-pc').value, pcs = ctx.pcs();
    $('card-pc').replaceChildren(...pcs.map((p) => new Option(p.name, p.eid)));
    if (pcs.some((p) => p.eid === selected)) $('card-pc').value = selected;
  });
  form.addEventListener('input', () => { pending = null; });
  form.addEventListener('click', (event) => {
    const add = event.target.closest('[data-card-add]');
    if (add) {
      const row = document.createElement('div'), html = ROWS[add.dataset.cardAdd];
      row.className = 'card-row'; row.innerHTML = typeof html === 'function' ? html() : html;
      $(`card-${add.dataset.cardAdd}-rows`).append(row); pending = null;
    }
    if (event.target.closest('[data-card-remove], [data-effect-remove]')) { event.target.closest('.card-row').remove(); pending = null; }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity() || !$('card-pc').value) return;
    const rows = (kind) => [...$(`card-${kind}-rows`).children];
    const named = (kind) => rows(kind).map((row) => ({ name: row.querySelector('[data-card-name]').value, description: row.querySelector('[data-card-desc]').value }));
    const f = form.elements;
    const card = { name: f.cardName.value, description: f.description.value, equip: f.equip.checked,
      stats: Object.fromEntries(ITEM_STATS.map((key) => [key, Number(f[key].value)])),
      // shortcut: a repeated skill keeps its last value, sum them if stacking is ever wanted.
      skills: Object.fromEntries(rows('skill').map((row) => [row.querySelector('[data-card-skill]').value, Number(row.querySelector('[data-card-value]').value)])),
      statChanges: rows('change').map((row) => ({ target: row.querySelector('[data-effect-target]').value,
        operation: row.querySelector('[data-effect-operation]').value, value: Number(row.querySelector('[data-effect-value]').value) })),
      effects: named('effect'), feats: named('feat'), conditions: rows('condition').map((row) => row.querySelector('[data-card-condition]').value) };
    const target = $('card-pc').value;
    // The same ID on a retry means a save that did arrive is reported instead of given twice.
    if (pending?.target !== target) pending = { target, id: crypto.randomUUID() };
    $('card-submit').disabled = true; status('Giving card…');
    try { await givePCCard({ npcId: `v2:${target}` }, card, pending.id); status(`Gave ${card.name}.`); pending = null; }
    catch (error) { status(error.message); }
    finally { $('card-submit').disabled = false; }
  });
}
