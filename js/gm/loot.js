// Loot tab: build a pile (SRD items, new items, random treasure, coins) and push it to characters.
import { updatePCSheet } from '../geez/pc-inventory.js';
import { validateItemEdit, ITEM_STATS } from '../geez/item-modifiers.js';
import { lootItem, generateLoot, LOOT_TIERS } from '../geez/loot-model.js';
import { applyLoot, splitCoins, COINS } from './loot-model.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const emptyPile = () => ({ id: crypto.randomUUID(), entries: [], coins: {} });
const blank = (value) => String(value).trim() === '';

export function mountLoot(ctx) {
  let pile = emptyPile(), busy = false, drawnFor = '';
  const checked = new Set();
  try { const saved = JSON.parse(localStorage.getItem('gm.loot')); if (Array.isArray(saved?.entries)) pile = saved; } catch { /* start empty */ }
  const status = (text) => { $('loot-status').textContent = text; };
  const save = () => { try { localStorage.setItem('gm.loot', JSON.stringify(pile)); } catch { /* the pile just won't survive a reload */ } };
  // Any edit makes it a new delivery, so the "already received" guard applies only to retries of the same pile.
  const changed = () => { pile.id = crypto.randomUUID(); save(); drawPile(); };

  function drawPile() {
    $('loot-pile').innerHTML = pile.entries.map((e, i) => `<li><span>${esc(e.name)}${e.qty > 1 ? ' ×' + e.qty : ''}${e.kind === 'weapon' ? ' <small class="muted">weapon</small>' : ''}</span><button data-remove="${i}" aria-label="Remove ${esc(e.name)}">×</button></li>`).join('') || '<li class="muted">The pile is empty.</li>';
    for (const coin of COINS) if (document.activeElement !== $('loot-' + coin)) $('loot-' + coin).value = pile.coins[coin] || '';
  }
  function drawWho() {
    const pcs = ctx.pcs();
    const key = pcs.map((p) => p.eid + p.name).join('|');
    if (key === drawnFor) return;
    drawnFor = key;
    $('loot-who').innerHTML = pcs.map((p) => `<label class="check"><input type="checkbox" value="${esc(p.eid)}" ${checked.has(p.eid) ? 'checked' : ''}>${esc(p.name)}</label>`).join('') || '<span class="muted">No characters.</span>';
  }
  const add = (entry) => pile.entries.push({ id: crypto.randomUUID(), ...entry });
  const addSrd = (item, qty) => { const { id, name, qty: n, ...record } = lootItem(item, qty); add({ kind: 'item', name, qty: n, record }); };

  $('loot-tier').innerHTML = LOOT_TIERS.map((t, i) => `<option value="${i + 1}">${esc(t.label)}</option>`).join('');
  $('loot-coins').innerHTML = COINS.map((c) => `<label>${c}<input id="loot-${c}" data-coin="${c}" type="number" min="0" step="1" inputmode="numeric"></label>`).join('');
  $('item-stats').innerHTML = ITEM_STATS.map((s) => `<label>${s.toUpperCase()}<input name="stat_${s}" type="number" min="-999" max="999" step="1" value="0"></label>`).join('');
  ctx.reference.then((ref) => { $('loot-names').innerHTML = Object.values(ref).filter((i) => i.url && /equipment|magic-items/.test(i.url)).map((i) => `<option value="${esc(i.name)}">`).join(''); });

  $('loot-srd').addEventListener('submit', async (e) => {
    e.preventDefault();
    const reference = await ctx.reference, item = reference[$('loot-name').value.trim().toLowerCase()];
    if (!item) return status('No item by that name in the rules. Use "New item" for your own.');
    addSrd(item, Math.max(1, Math.trunc(Number($('loot-qty').value)) || 1));
    $('loot-name').value = ''; $('loot-qty').value = 1; status(''); changed();
  });
  $('loot-random').addEventListener('click', async () => {
    try {
      for (const found of generateLoot(Number($('loot-tier').value), await ctx.reference)) {
        if (found.coin) pile.coins[found.coin] = (pile.coins[found.coin] || 0) + found.qty;
        else { const { id, name, qty, ...record } = found; add({ kind: 'item', name, qty, record }); }
      }
      status('Random treasure added. Remove anything you do not want.'); changed();
    } catch (error) { status(error.message); }
  });
  $('item-form').elements.category.addEventListener('change', (e) => { $('item-weapon').hidden = e.target.value !== 'Weapon'; });
  $('item-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target.elements, num = (n) => Number(f[n].value) || 0;
    const name = f.itemName.value.trim(), category = f.category.value, weight = blank(f.weight.value) ? null : Number(f.weight.value);
    try {
      if (category === 'Weapon') {
        const value = { name, description: f.desc.value, to_hit: num('to_hit'), damage: f.damage.value, damage_type: f.damage_type.value.trim(), ability: f.ability.value, weight };
        applyLoot({}, { id: 'check', entries: [{ id: 'check', kind: 'weapon', name, value }] }); // reject bad dice before it reaches the pile
        add({ kind: 'weapon', name, qty: 1, value });
      } else {
        const record = validateItemEdit({ name, category, qty: num('qty') || 1, desc: f.desc.value, weight,
          modifiers: { ac: num('ac'), stats: Object.fromEntries(ITEM_STATS.map((s) => [s, num('stat_' + s)])) },
          ...(category === 'Consumable' && f.dice.value.trim() ? { consumable: { kind: 'healing', dice: f.dice.value.trim() } } : {}) }, { category: 'Adventuring Gear' });
        const { name: n, qty, ...rest } = record;
        add({ kind: 'item', name: n, qty, record: rest });
      }
      e.target.reset(); $('item-weapon').hidden = true; status(`${name} added to the pile.`); changed();
    } catch (error) { status(error.message); }
  });
  $('loot-pile').addEventListener('click', (e) => { const b = e.target.closest('[data-remove]'); if (b) { pile.entries.splice(Number(b.dataset.remove), 1); changed(); } });
  $('loot-coins').addEventListener('change', (e) => { pile.coins[e.target.dataset.coin] = Math.max(0, Math.trunc(Number(e.target.value)) || 0); changed(); });
  $('loot-clear').addEventListener('click', () => { pile = emptyPile(); status(''); changed(); });
  $('loot-who').addEventListener('change', (e) => checked[e.target.checked ? 'add' : 'delete'](e.target.value));
  $('loot-send').addEventListener('click', async () => {
    const who = ctx.pcs().filter((p) => checked.has(p.eid)), coins = Object.values(pile.coins).some(Boolean);
    if (busy) return;
    if (!who.length) return status('Tick who receives it.');
    if (!pile.entries.length && !coins) return status('The pile is empty.');
    const split = $('loot-split').checked;
    if (!split && who.length > 1 && !confirm(`Give everything in the pile to EACH of ${who.length} characters?`)) return;
    busy = true; $('loot-send').disabled = true; status('Sending…');
    const shares = split ? splitCoins(pile.coins, who.length) : who.map(() => pile.coins);
    const done = [], failed = [];
    for (let i = 0; i < who.length; i++) {
      // Splitting shares the coins and hands the items to the first ticked character.
      const entries = split && i > 0 ? [] : pile.entries;
      try { await updatePCSheet({ npcId: `v2:${who[i].eid}` }, (pc) => applyLoot(pc, { id: pile.id, entries, coins: shares[i] })); done.push(who[i].name); }
      catch (error) { failed.push(`${who[i].name}: ${error.message}`); }
    }
    busy = false; $('loot-send').disabled = false;
    if (failed.length) status(`${done.length ? 'Sent to ' + done.join(', ') + '. ' : ''}Not sent — ${failed.join('; ')}. The pile is kept: leave the ticks as they are and press Send again, and nothing that arrived is duplicated. Changing the pile makes it a new delivery.`);
    else { pile = emptyPile(); changed(); status(`Sent to ${done.join(', ')}.`); }
  });
  ctx.onParty(drawWho); drawPile(); drawWho();
}
