import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js';
import { getDatabase, ref, onValue, set, update, get, runTransaction } from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js';

export { ref, onValue, set, update, get, runTransaction };
export const db = getDatabase(initializeApp(window.GEEZ_FIREBASE_CONFIG, 'dashboard'));
const ENT = 'v2/worlds/gaia/entities';
export const $ = (t, props = {}, ...kids) => { const e = Object.assign(document.createElement(t), props); e.append(...kids); return e; };
export const store = (k, d) => { try { return JSON.parse(localStorage.getItem('geez.dash.' + k)) ?? d; } catch { return d; } };
export const save = (k, v) => { try { localStorage.setItem('geez.dash.' + k, JSON.stringify(v)); } catch {} };
export const encKey = k => String(k).replace(/[%\u0000-\u001f\u007f.#$\[\]\/]|^\d+$/g, c => [...c].map(x => '%' + x.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(''));
export const decKey = k => k.replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const styleCache = new Set();
export const css = text => { if (styleCache.has(text)) return; styleCache.add(text); document.head.append($('style', { textContent: text })); };

let chars = {};
const listeners = new Set();
export const getChars = () => chars;
export const onChars = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const strings = v => Array.isArray(v) ? v.filter(x => typeof x === 'string') : typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.entries(v).filter(([k, x]) => k !== '%EMPTY' && typeof x === 'string').map(([, x]) => x) : [];
onValue(ref(db, ENT), snap => {
  const out = {};
  for (const [rawId, e] of Object.entries(snap.val() || {})) {
    if (!e || !['pc', 'npc'].includes(e.kind) || e.data?._sheetsDeleted) continue;
    const c = e.data?.combat || {}, sp = e.data?.spellcasting || {}, id = decKey(rawId);
    const lv = o => Object.fromEntries(Object.entries(o || {}).filter(([k, v]) => /^[1-9]$/.test(k) && typeof v === 'number'));
    const sources = [e.source?.id, ...(e.source?.mirrors || [])].filter(x => typeof x === 'string');
    out[id] = { id, name: e.name || '?', kind: e.kind, hp: Number(c.hp_current) || 0, max: Number(c.hp_max) || 0, temp: Number(c.temp_hp) || 0,
      hasDeath: !!c.death_saves, slots: lv(sp.slots), used: lv(sp.slots_used), conditions: strings(c.conditions), note: typeof e.data?.dashboard_note === 'string' ? e.data.dashboard_note : '', sources };
  }
  chars = out;
  const status = document.getElementById('status'); if (status) status.textContent = `live · ${Object.keys(out).length} characters`;
  listeners.forEach(fn => fn());
}, err => { const status = document.getElementById('status'); if (status) status.textContent = 'Firebase error: ' + err.message; });

const v2 = c => `${ENT}/${encKey(c.id)}/data`, paths = (c, field, value) => {
  const out = { [`${v2(c)}/${field}`]: value };
  for (const source of c.sources || []) if (source.startsWith('characters/')) out[`${source}/${field}`] = value;
  return out;
};
export const writeHp = (c, value) => { const hp = Math.max(0, Math.min(c.max || value, Math.round(value))), p = paths(c, 'combat/hp_current', hp); if (hp > 0 && c.hp <= 0 && c.hasDeath) Object.assign(p, paths(c, 'combat/death_saves', { success: 0, fail: 0 })); return update(ref(db), p); };
export const damage = (c, n) => update(ref(db), { ...paths(c, 'combat/temp_hp', Math.max(0, c.temp - n)), ...paths(c, 'combat/hp_current', Math.max(0, c.hp - Math.max(0, n - c.temp))) });
export const heal = (c, n) => writeHp(c, Math.min(c.max, c.hp + n));
export const setUsed = (c, lvl, n) => update(ref(db), paths(c, `spellcasting/slots_used/${lvl}`, Math.max(0, Math.min(c.slots[lvl], n))));
export const setConditions = (c, labels) => update(ref(db), paths(c, 'combat/conditions', labels.length ? labels : null));
export const setNote = (c, text) => set(ref(db, `${v2(c)}/dashboard_note`), text || null);
export const hpColor = c => { const r = c.hp / (c.max || 1); return c.hp <= 0 ? '#7f1d1d' : r <= .25 ? '#dc2626' : r <= .5 ? '#d97706' : '#16a34a'; };

const bar = document.getElementById('bar');
export function floatWindow(title, key, def, build) {
  const pos = store(key + '.pos', def), win = $('div', { className: 'win' }), body = $('div', { className: 'body' }), head = $('header', {}, $('span', { textContent: title }));
  Object.assign(win.style, { left: pos.x + 'px', top: pos.y + 'px', width: (pos.w || 300) + 'px', height: pos.h ? pos.h + 'px' : '' });
  let hidden = store(key + '.hidden', false); const tab = $('button', { textContent: title }), show = v => { hidden = !v; win.hidden = hidden; tab.classList.toggle('on', !hidden); save(key + '.hidden', hidden); };
  tab.onclick = () => show(hidden); head.append($('button', { textContent: '×', title: 'Hide', onclick: () => show(false) })); bar.append(tab); win.append(head, body); document.body.append(win); show(!hidden);
  const keep = () => save(key + '.pos', { x: win.offsetLeft, y: win.offsetTop, w: win.offsetWidth, h: win.offsetHeight });
  head.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; const dx = e.clientX - win.offsetLeft, dy = e.clientY - win.offsetTop; head.setPointerCapture(e.pointerId); const move = ev => { win.style.left = Math.max(0, ev.clientX - dx) + 'px'; win.style.top = Math.max(0, ev.clientY - dy) + 'px'; }; const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); keep(); }; head.addEventListener('pointermove', move); head.addEventListener('pointerup', up); });
  new ResizeObserver(keep).observe(win); build({ head, body }); return { win, body, head, show };
}
export const registerModule = m => floatWindow(m.title, m.id, m.pos, m.build);

export const dragSource = (el, payload) => { el.draggable = true; el.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-geez', JSON.stringify(payload)); e.dataTransfer.setData(`application/x-geez-${payload.type}`, ''); }); };
const DND_PREFIX = 'application/x-geez-';
export const dropTarget = (el, accepts, onDrop) => { const ok = e => [...e.dataTransfer.types].some(t => t.startsWith(DND_PREFIX) && accepts.includes(t.slice(DND_PREFIX.length))); const clear = () => el.classList.remove('drop-ok'); el.addEventListener('dragenter', e => { if (ok(e)) { e.preventDefault(); el.classList.add('drop-ok'); } }); el.addEventListener('dragover', e => { if (ok(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; el.classList.add('drop-ok'); } }); el.addEventListener('dragleave', clear); el.addEventListener('drop', e => { clear(); try { const p = JSON.parse(e.dataTransfer.getData('application/x-geez')); if (accepts.includes(p.type)) onDrop(p, e); } catch {} }); };
