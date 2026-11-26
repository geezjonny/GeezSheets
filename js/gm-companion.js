// GM dashboard: everything for running a session. Party writes go through the same adapter as companion.js;
// loot, cards, NPCs and the deck write the same Firebase records through js/geez/.
import { db, ref, set, update, onValue, runTransaction } from './rodeo-firebase.js';
import { effectivePC, asList } from './geez/effective.js';
import { loadSheetReference } from './geez/sheet-view.js';
import { CONDITIONS } from './geez/sheet-combat.js';
import { summaryTable, details } from './gm/party.js';
import { mountLoot } from './gm/loot.js';
import { mountNpc } from './gm/npc.js';
import { mountCards } from './gm/cards.js';
import { mountDeck } from './gm/deck.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const GM = new URLSearchParams(location.search).get('gm') === 'jonny';
const path = (id, p) => ref(db, `characters/pcs/${id}/${p}`);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* not remembered */ } } };
let party = {}, gmCamp = store.get('companion.gmCamp') || '', dirty = false, reference = {};
const amounts = new Map(), busy = new Set(), open = new Set(), listeners = [];
const campaigns = () => [...new Set(Object.values(party).map((p) => p.campaign).filter(Boolean))].sort();
const members = () => Object.values(party).filter((p) => p.campaign === gmCamp).sort((a, b) => a.name.localeCompare(b.name));
function toast(message) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = message;
  $('#toasts').append(el); setTimeout(() => el.remove(), 4200);
}
const typing = () => $('#panel-party').contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement?.tagName);

function slots(pc) {
  let html = '';
  // companion.js: slotsView, levels 1–9; filled pips represent free slots.
  for (let l = 1; l <= 9; l++) {
    const max = Number(pc.spellcasting?.slots?.[l] ?? 0); if (!max) continue;
    const free = max - Number(pc.spellcasting?.slots_used?.[l] ?? 0);
    html += `<div class="row"><span class="slot-label">Level ${l}</span><div class="pips">${Array.from({ length: max }, (_, i) => `<button class="pip ${i < free ? 'on' : ''}" data-act="slot" data-level="${l}" data-spent="${i >= free}" aria-pressed="${i < free}" aria-label="Level ${l} slot ${i + 1}: ${i < free ? 'available; use' : 'used; restore'}" ${busy.has(pc.id) ? 'disabled' : ''}></button>`).join('')}</div></div>`;
  }
  return html;
}
function renderParty() {
  if (typing()) { dirty = true; return; } dirty = false;
  const mine = members().map((pc) => effectivePC(pc, reference));
  // Keep keyboard focus on the same control, so repeated presses of + or − keep working.
  const held = document.activeElement?.closest?.('#summary [data-act]'), where = held && { id: held.closest('[data-id]').dataset.id, act: held.dataset.act };
  $('#summary').innerHTML = summaryTable(mine);
  if (where) $(`#summary [data-id="${CSS.escape(where.id)}"] [data-act="${where.act}"]`)?.focus({ preventScroll: true });
  $('#party').innerHTML = mine.map((pc) => {
    const c = pc.combat || {}, hp = Number(c.hp_current) || 0, max = Number(c.hp_max) || 0, temp = Number(c.temp_hp) || 0;
    const percent = max > 0 ? Math.max(0, Math.min(100, hp / max * 100)) : 0, conds = asList(c.conditions);
    const disabled = busy.has(pc.id) ? 'disabled' : '';
    return `<article class="card" data-id="${esc(pc.id)}" aria-label="${esc(pc.name)}">
      <h3>${esc(pc.name)}</h3><div class="hp-head"><span class="hp-num">${hp} / ${max} HP</span><span class="temp">+${temp} temp</span></div>
      <div class="bar ${percent <= 25 ? 'low' : ''}" role="meter" aria-label="Hit points" aria-valuemin="0" aria-valuemax="${Math.max(1, max)}" aria-valuenow="${Math.max(0, Math.min(hp, max))}"><i style="width:${percent}%"></i></div>
      <div class="quick-chips">${[-5, -1, 1, 5].map((n) => `<button data-act="${n < 0 ? 'damage' : 'heal'}" data-amount="${Math.abs(n)}" aria-label="${n < 0 ? 'Damage' : 'Heal'} ${Math.abs(n)} HP" ${disabled}>${n > 0 ? '+' : ''}${n}</button>`).join('')}</div>
      <div class="hp-controls"><input type="number" min="1" step="1" inputmode="numeric" data-amount-input aria-label="HP amount for ${esc(pc.name)}" placeholder="Amount" value="${esc(amounts.get(pc.id) || '')}"><button class="danger" data-act="damage" ${disabled}>Damage</button><button class="primary" data-act="heal" ${disabled}>Heal</button></div>
      <div class="status-row">${conds.map((x) => `<button data-act="condition-remove" data-name="${esc(x)}" ${disabled}>${esc(x)} ×</button>`).join('')}<select data-condition aria-label="Add a condition to ${esc(pc.name)}" ${disabled}><option value="">+ Condition</option>${CONDITIONS.filter((x) => !conds.includes(x)).map((x) => `<option>${esc(x)}</option>`).join('')}</select><button data-act="inspiration" aria-pressed="${!!c.inspiration}" ${disabled}>Inspiration ${c.inspiration ? '●' : '○'}</button></div>
      <div class="slots">${slots(pc)}</div>${details(pc, open)}
    </article>`;
  }).join('') || '<div class="card empty">No characters in this campaign.</div>';
}
function partyChanged() {
  const camps = campaigns(), select = $('#gm-camp');
  if (!camps.includes(gmCamp)) gmCamp = camps[0] || '';
  select.innerHTML = camps.map((c) => `<option value="${esc(c)}" ${c === gmCamp ? 'selected' : ''}>${esc(c)}</option>`).join('') || '<option value="">No campaigns</option>';
  select.disabled = !camps.length;
  renderParty(); listeners.forEach((f) => f());
}

// Mirrors companion.js damage/heal, including temporary HP and death saves.
async function changeHp(id, action, n) {
  if (action === 'damage' && db.damage) return db.damage(id, n);
  return runTransaction(path(id, 'combat'), (cc) => {
    if (!cc) return cc;
    const cur = Number(cc.hp_current) || 0, tmp = Math.max(0, Number(cc.temp_hp) || 0);
    const hp = action === 'heal' ? Math.min(Number(cc.hp_max) || 1, cur + n) : Math.max(0, cur - Math.max(0, n - tmp));
    return { ...cc, hp_current: hp, temp_hp: action === 'heal' ? tmp : Math.max(0, tmp - n), death_saves: hp > 0 ? { success: 0, fail: 0 } : cc.death_saves || { success: 0, fail: 0 } };
  });
}
// Quick HP buttons queue up instead of locking the row, so five quick presses count five times.
const queues = new Map();
function step(id, action, amount) {
  if (!party[id] || party[id].campaign !== gmCamp) return;
  const next = (queues.get(id) || Promise.resolve()).then(() => changeHp(id, action, amount)).catch((err) => toast('Not saved: ' + err.message)).then(renderParty);
  queues.set(id, next);
}
async function onPC(card, work) {
  const id = card.dataset.id, pc = party[id];
  if (!pc || pc.campaign !== gmCamp || busy.has(id)) return;
  busy.add(id); card.querySelectorAll('button, select').forEach((el) => { el.disabled = true; }); document.activeElement?.blur();
  try { await work(id, pc); }
  catch (err) { toast('Not saved: ' + err.message); }
  finally { busy.delete(id); renderParty(); }
}

// Weather lives outside the Gaia tree, so it goes straight to the Firebase REST API (the Owlbear extension reads the same URL).
const WEATHER = 'https://geezsheets-default-rtdb.firebaseio.com/gmweather/gaia.json';
const TYPES = ['clear', 'rain', 'snow', 'fog', 'storm'];
const percent = (n) => Math.max(0, Math.min(100, Math.trunc(Number(n) || 0)));
let weather = { type: 'clear', intensity: 0, wind: 0 }, weatherQueue = Promise.resolve();
function showWeather(value) {
  weather = { type: TYPES.includes(value?.type) ? value.type : 'clear', intensity: percent(value?.intensity), wind: percent(value?.wind) };
  document.querySelectorAll('[data-weather]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.weather === weather.type)));
  for (const key of ['intensity', 'wind']) {
    if (document.activeElement !== $('#' + key)) $('#' + key).value = weather[key];
    $('#' + key + '-value').textContent = $('#' + key).value;
  }
  $('#weather-current').textContent = value ? `Current: ${String(value.type ?? 'clear')} · intensity ${weather.intensity}/100 · wind ${weather.wind}/100${Number.isFinite(value.at) ? ' · ' + new Date(value.at).toLocaleString() : ''}` : 'No weather set yet. Choose a type or adjust a slider to send it.';
  $('#weather-controls').disabled = false;
}
function saveWeather(type = weather.type) {
  const value = { type, intensity: percent($('#intensity').value), wind: percent($('#wind').value), at: Date.now() };
  weather.type = type;
  // Serialize local changes so rapid clicks cannot finish out of order.
  weatherQueue = weatherQueue.then(async () => { const r = await fetch(WEATHER, { method: 'PUT', body: JSON.stringify(value) }); if (!r.ok) throw new Error('HTTP ' + r.status); showWeather(value); }).catch((e) => toast('Weather not saved: ' + e.message));
}

// Token spawner: pushes a request to Firebase gmspawn/gaia; the GeezOBR extension (GM client) places the tokens.
const SPAWN = 'https://geezsheets-default-rtdb.firebaseio.com/gmspawn/gaia.json';
const tokens = fetch('tokens/index.json').then((r) => r.json()).catch(() => []);
async function spawn(name, count, report) {
  const token = name.trim().toLowerCase().replace(/\s+/g, '_') + '.png';
  if (!(await tokens).includes(token)) return report(`No token picture called "${name}". Pick one from the Table tab list.`);
  try {
    const r = await fetch(SPAWN, { method: 'POST', body: JSON.stringify({ token, count, at: Date.now() }) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    report(`Sent ${count} × ${name.replace(/_/g, ' ')} to Owlbear.`);
  } catch (e) { report('Spawn failed: ' + e.message); }
}

function start() {
  $('#access').hidden = true; $('#dashboard').hidden = false;
  const ctx = {
    toast, spawn, campaign: () => gmCamp, onParty: (f) => listeners.push(f),
    pcs: () => members().map((p) => ({ ...p, eid: db.ids?.().oldToNew?.[p.id] || p.id })),
    reference: loadSheetReference(),
    openCreator(params) { frame('create', 'creator.html?' + new URLSearchParams({ gm: 'jonny', ...params, t: Date.now() })); show('create'); }
  };
  ctx.reference.then((r) => { reference = r; renderParty(); }).catch((e) => toast(e.message));
  mountLoot(ctx); mountCards(ctx);
  const onShow = { npc: mountNpc(ctx), deck: mountDeck(ctx) };

  // Tabs. The roll-call screen and the creator are their own pages, loaded the first time they are opened.
  const tabs = [...document.querySelectorAll('[role=tab]')];
  function frame(tab, src) { const f = $(`#panel-${tab} iframe`); if (src !== f.getAttribute('src')) f.src = src; }
  function show(name) {
    if (!tabs.some((t) => t.dataset.tab === name)) name = 'party';
    for (const t of tabs) { const on = t.dataset.tab === name; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; $('#panel-' + t.dataset.tab).hidden = !on; }
    store.set('gm.tab', name);
    if (name === 'rolls') frame('rolls', `companion.html?gm=jonny&campaign=${encodeURIComponent(gmCamp)}`);
    if (name === 'create' && !$('#panel-create iframe').getAttribute('src')) frame('create', 'creator.html?gm=jonny');
    onShow[name]?.();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.dataset.tab));
    t.addEventListener('keydown', (e) => { const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!step) return; const next = tabs[(i + step + tabs.length) % tabs.length]; next.focus(); show(next.dataset.tab); });
  });

  $('#gm-camp').addEventListener('change', (e) => {
    gmCamp = e.target.value; store.set('companion.gmCamp', gmCamp); partyChanged();
    if (!$('#panel-rolls').hidden) show('rolls'); else $('#panel-rolls iframe').removeAttribute('src');
  });
  $('#panel-party').addEventListener('input', (e) => {
    if (e.target.matches('[data-amount-input]')) amounts.set(e.target.closest('[data-id]').dataset.id, e.target.value);
  });
  $('#panel-party').addEventListener('toggle', (e) => { const k = e.target.dataset?.open; if (k) open[e.target.open ? 'add' : 'delete'](k); }, true);
  $('#panel-party').addEventListener('focusout', () => setTimeout(() => { if (dirty && !typing()) renderParty(); }, 60));
  $('#panel-party').addEventListener('change', (e) => {
    const name = e.target.matches('[data-condition]') && e.target.value; if (!name) return;
    onPC(e.target.closest('[data-id]'), (id, pc) => update(path(id, 'combat'), { conditions: [...asList(pc.combat?.conditions).filter((x) => x !== name), name] }));
  });
  $('#panel-party').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const card = b.closest('[data-id]');
    if (b.dataset.amount) return step(card.dataset.id, b.dataset.act, Number(b.dataset.amount));
    onPC(card, async (id, pc) => {
      const act = b.dataset.act;
      if (act === 'slot') {
        const l = b.dataset.level, u = Number(pc.spellcasting?.slots_used?.[l] || 0), max = Number(pc.spellcasting?.slots?.[l] || 0);
        await set(path(id, `spellcasting/slots_used/${l}`), b.dataset.spent === 'true' ? Math.max(0, u - 1) : Math.min(max, u + 1));
      } else if (act === 'inspiration') await update(path(id, 'combat'), { inspiration: !pc.combat?.inspiration });
      else if (act === 'condition-remove') await update(path(id, 'combat'), { conditions: asList(pc.combat?.conditions).filter((x) => x !== b.dataset.name) });
      else {
        const n = Math.max(1, Math.trunc(Number(card.querySelector('[data-amount-input]').value) || 0));
        await changeHp(id, act, n);
        amounts.delete(id);
      }
    });
  });
  document.querySelectorAll('[data-weather]').forEach((b) => b.addEventListener('click', () => saveWeather(b.dataset.weather)));
  for (const key of ['intensity', 'wind']) {
    $('#' + key).addEventListener('input', (e) => { $('#' + key + '-value').textContent = e.target.value; });
    $('#' + key).addEventListener('change', () => saveWeather());
  }
  tokens.then((list) => { $('#spawn-list').innerHTML = list.map((t) => `<option value="${esc(t.replace(/\.png$/i, ''))}">`).join(''); });
  $('#spawn-go').addEventListener('click', () => spawn($('#spawn-token').value, Math.max(1, Math.min(20, Math.trunc(Number($('#spawn-count').value)) || 1)), (m) => { $('#spawn-status').textContent = m; }));
  onValue(ref(db, 'characters/pcs'), (s) => {
    party = Object.fromEntries(Object.entries(s.val() || {}).filter(([i, x]) => x && x.name && i !== '__oracle__' && x.campaign !== '__oracle__' && x.type !== 'npc' && x.record_type !== 'npc').map(([i, x]) => [i, { ...x, id: i }]));
    partyChanged();
  }, (err) => { $('#party').textContent = 'Could not load party: ' + err.message; });
  fetch(WEATHER).then((r) => r.json()).then(showWeather).catch((err) => {
    $('#weather-controls').disabled = true;
    $('#weather-current').textContent = 'Could not load weather: ' + err.message;
  });
  show(store.get('gm.tab') || 'party');
}

if (GM) start();
else $('#access').textContent = 'GM access required. Open this page with ?gm=jonny, as with Companion.';
