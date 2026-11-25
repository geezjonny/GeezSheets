// GM dashboard. Uses the same GM mode, party filter and writes as companion.js.
import { db, ref, get, set, update, onValue, runTransaction } from './rodeo-firebase.js';
import { initGmAudio } from './gm-audio.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const GM = new URLSearchParams(location.search).get('gm') === 'jonny';
const path = (id, p) => ref(db, `characters/pcs/${id}/${p}`);
let party = {}, gmCamp = localStorage.getItem('companion.gmCamp') || '', dirty = false;
const amounts = new Map(), busy = new Set();
const campaigns = () => [...new Set(Object.values(party).map((p) => p.campaign).filter(Boolean))].sort();
function toast(message) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = message;
  $('#toasts').append(el); setTimeout(() => el.remove(), 4200);
}
const typing = () => $('#party').contains(document.activeElement) && document.activeElement?.tagName === 'INPUT';

function slots(pc) {
  let html = '';
  // companion.js: slotsView, levels 1–9; filled pips represent free slots.
  for (let l = 1; l <= 9; l++) {
    const max = Number(pc.spellcasting?.slots?.[l] ?? 0); if (!max) continue;
    const free = max - Number(pc.spellcasting?.slots_used?.[l] ?? 0);
    html += `<div class="row"><span class="slot-label">Level ${l}</span><div class="pips">${Array.from({ length: max }, (_, i) => `<button class="pip ${i < free ? 'on' : ''}" data-act="slot" data-level="${l}" data-spent="${i >= free}" aria-pressed="${i < free}" aria-label="Level ${l} slot ${i + 1}: ${i < free ? 'available; use' : 'used; restore'}" ${busy.has(pc.id) ? 'disabled' : ''}></button>`).join('')}</div></div>`;
  }
  return html || '<p class="muted">No spell slots.</p>';
}
function renderParty() {
  if (typing()) { dirty = true; return; } dirty = false;
  const camps = campaigns(), select = $('#gm-camp');
  select.innerHTML = camps.map((c) => `<option value="${esc(c)}" ${c === gmCamp ? 'selected' : ''}>${esc(c)}</option>`).join('') || '<option value="">No campaigns</option>';
  select.disabled = !camps.length;
  const mine = Object.values(party).filter((p) => p.campaign === gmCamp).sort((a, b) => a.name.localeCompare(b.name));
  $('#party').innerHTML = mine.map((pc) => {
    const c = pc.combat || {}, hp = Number(c.hp_current) || 0, max = Number(c.hp_max) || 0, temp = Number(c.temp_hp) || 0;
    const percent = max > 0 ? Math.max(0, Math.min(100, hp / max * 100)) : 0;
    const disabled = busy.has(pc.id) ? 'disabled' : '';
    return `<article class="card" data-id="${esc(pc.id)}" aria-label="${esc(pc.name)}">
      <h3>${esc(pc.name)}</h3><div class="hp-head"><span class="hp-num">${hp} / ${max} HP</span><span class="temp">+${temp} temp</span></div>
      <div class="bar ${percent <= 25 ? 'low' : ''}" role="meter" aria-label="Hit points" aria-valuemin="0" aria-valuemax="${Math.max(1, max)}" aria-valuenow="${Math.max(0, Math.min(hp, max))}"><i style="width:${percent}%"></i></div>
      <div class="quick-chips">${[-5, -1, 1, 5].map((n) => `<button data-act="${n < 0 ? 'damage' : 'heal'}" data-amount="${Math.abs(n)}" aria-label="${n < 0 ? 'Damage' : 'Heal'} ${Math.abs(n)} HP" ${disabled}>${n > 0 ? '+' : ''}${n}</button>`).join('')}</div>
      <div class="hp-controls"><input type="number" min="1" step="1" inputmode="numeric" data-amount-input aria-label="HP amount for ${esc(pc.name)}" placeholder="Amount" value="${esc(amounts.get(pc.id) || '')}"><button class="danger" data-act="damage" ${disabled}>Damage</button><button class="primary" data-act="heal" ${disabled}>Heal</button></div>
      <div class="slots">${slots(pc)}</div>
    </article>`;
  }).join('') || '<div class="card empty">No characters in this campaign.</div>';
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

if (!GM) {
  $('#access').textContent = 'GM access required. Open this page with ?gm=jonny, as with Companion.';
} else {
  $('#access').hidden = true; $('#dashboard').hidden = false;
  $('#gm-camp').addEventListener('change', (e) => {
    gmCamp = e.target.value; localStorage.setItem('companion.gmCamp', gmCamp); renderParty();
  });
  $('#party').addEventListener('input', (e) => {
    if (e.target.matches('[data-amount-input]')) amounts.set(e.target.closest('[data-id]').dataset.id, e.target.value);
  });
  $('#party').addEventListener('focusout', () => setTimeout(() => { if (dirty && !typing()) renderParty(); }, 60));
  $('#party').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const card = b.closest('[data-id]'), id = card.dataset.id, pc = party[id];
    if (!pc || pc.campaign !== gmCamp || busy.has(id)) return;
    busy.add(id); card.querySelectorAll('button').forEach((el) => { el.disabled = true; });
    try {
      if (b.dataset.act === 'slot') {
        const l = b.dataset.level, u = Number(pc.spellcasting?.slots_used?.[l] || 0), max = Number(pc.spellcasting?.slots?.[l] || 0);
        await set(path(id, `spellcasting/slots_used/${l}`), b.dataset.spent === 'true' ? Math.max(0, u - 1) : Math.min(max, u + 1));
      } else {
        const n = Math.max(1, Math.trunc(Number(b.dataset.amount ?? card.querySelector('[data-amount-input]').value) || 0));
        await changeHp(id, b.dataset.act, n);
        if (!b.dataset.amount) amounts.delete(id);
      }
    } catch (err) { toast('Not saved: ' + err.message); }
    finally { busy.delete(id); renderParty(); }
  });
  initGmAudio(toast);
  document.querySelectorAll('[data-weather]').forEach((b) => b.addEventListener('click', () => saveWeather(b.dataset.weather)));
  for (const key of ['intensity', 'wind']) {
    $('#' + key).addEventListener('input', (e) => { $('#' + key + '-value').textContent = e.target.value; });
    $('#' + key).addEventListener('change', () => saveWeather());
  }
  onValue(ref(db, 'characters/pcs'), (s) => {
    party = Object.fromEntries(Object.entries(s.val() || {}).filter(([i, x]) => x && x.name && i !== '__oracle__' && x.campaign !== '__oracle__' && x.type !== 'npc' && x.record_type !== 'npc').map(([i, x]) => [i, { ...x, id: i }]));
    const camps = campaigns(); if (!camps.includes(gmCamp)) gmCamp = camps[0] || '';
    renderParty();
  }, (err) => { $('#party').textContent = 'Could not load party: ' + err.message; });
  fetch(WEATHER).then((r) => r.json()).then(showWeather).catch((err) => {
    $('#weather-controls').disabled = true;
    $('#weather-current').textContent = 'Could not load weather: ' + err.message;
  });

// Token spawner: pushes a request to Firebase gmspawn/gaia; the GeezOBR extension (GM client) places the tokens.
const SPAWN = 'https://geezsheets-default-rtdb.firebaseio.com/gmspawn/gaia.json';
fetch('tokens/index.json').then((r) => r.json()).then((list) => {
  $('#spawn-list').innerHTML = list.map((t) => `<option value="${esc(t.replace(/\.png$/i, ''))}">`).join('');
  window.spawnTokens = new Set(list);
}).catch(() => {});
$('#spawn-go').addEventListener('click', async () => {
  const name = $('#spawn-token').value.trim().toLowerCase().replace(/\s+/g, '_'), token = name + '.png';
  if (!window.spawnTokens?.has(token)) return toast('Unknown token: pick one from the list');
  const count = Math.max(1, Math.min(20, Math.trunc(Number($('#spawn-count').value)) || 1));
  try {
    const r = await fetch(SPAWN, { method: 'POST', body: JSON.stringify({ token, count, at: Date.now() }) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    $('#spawn-status').textContent = `Sent ${count} × ${name.replace(/_/g, ' ')}.`;
  } catch (e) { toast('Spawn failed: ' + e.message); }
});

}
