// GeezSheets companion: the player's character sheet at the table (and the GM's party screen).
// Tabs: Character, Actions, Spells, Inventory, Features, plus a dice button. See docs/companion-spec.md.
import { callTitle, callMod, answerCall, newCall, EXTRAS, passed, sgn, SKILLS, ABIL } from './rollcall.js';
import { db, ref, get, set, update, remove, push, onValue, runTransaction } from './rodeo-firebase.js';
import { recipeFor } from './recipes.js';
import { attacksPerAction, planCharacter, spellCard, mod as abMod } from './levelup.js';

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app'), params = new URLSearchParams(location.search);
const GM = params.get('gm') === 'jonny';
if (params.has('embed')) document.body.classList.add('embed');   // inside the VTT's character window
const ENTITIES = 'https://geezsheets-default-rtdb.firebaseio.com/v2/worlds/gaia/entities';
const AB = ['str', 'dex', 'con', 'int', 'wis', 'cha'], AL = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const TABS = [['char', 'Character'], ['actions', 'Actions'], ['spells', 'Spells'], ['inv', 'Inventory'], ['feats', 'Features']];
const ICON = { char: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0"/>', actions: '<path d="m6 4 12 16M18 4 6 20M4 8h16M4 16h16"/>', spells: '<path d="M12 3 9.8 9.8 3 12l6.8 2.2L12 21l2.2-6.8L21 12l-6.8-2.2z"/>', inv: '<path d="M4 8h16v12H4zM7 8V5h10v3"/><path d="M8 12h8"/>', feats: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>' };

let pc = null, id = null, party = {}, view = GM && !params.get('char') ? 'party' : 'char';
let tab = TABS.some((t) => t[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'char';
let rollMode = 'normal', keepHp = '', invSearch = '', dirty = false, unsubPc = null;
let liveCall = null, callUnsub = null, callCamp = null, callMode = 'normal', callExtras = {};
let gmCamp = localStorage.getItem('companion.gmCamp') || '', gmUnsub = [], gmRolls = [];
const D = { spells: {}, spellList: [], skills: [], equip: {}, magic: {}, conditions: [], tokens: [], custom: { subclasses: {}, extraOnList: {}, castingAbility: {}, preparedCasters: [] } };

// ---------- small helpers
const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const MOJI = [['â€”', '—'], ['â€™', '’'], ['â€œ', '“'], ['â€\u009d', '”'], ['â€“', '–'], ['�', '—']];
const fix = (s) => MOJI.reduce((t, [a, b]) => t.replaceAll(a, b), String(s ?? ''));
const T = (s) => esc(fix(s));
const bon = (n) => (Number(n) >= 0 ? '+' : '') + Number(n || 0);
const count = (v) => Math.max(0, Math.min(3, Math.trunc(Number(v) || 0)));
const list = (v) => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v).filter((x) => x !== 'array') : []);
const stat = (k) => Number(pc?.stats?.[k] ?? 10);
const profB = () => Number(pc?.combat?.proficiency_bonus ?? 2);
const rbtn = (req, label, cls = '') => `<button class="${cls}" data-req="${esc(JSON.stringify(req))}">${esc(label)}</button>`;
const path = (p) => ref(db, `characters/pcs/${id}/${p}`);
function toast(s) { const x = document.createElement('div'); x.className = 'toast'; x.innerHTML = s; $('#toasts').append(x); setTimeout(() => x.remove(), 4200); }
async function write(task) { try { return await task(); } catch (e) { toast('Not saved: ' + esc(e.message)); throw e; } }

// ---------- dice
const rnd = (n) => 1 + Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 * n);
function rollExpr(expr) {
  let e = String(expr || '1d20').toLowerCase().replace(/\s+/g, ''), mode = null;
  if (/(adv|advantage)$/.test(e)) { mode = 'adv'; e = e.replace(/(adv|advantage)$/, ''); } else if (/(dis|disadvantage)$/.test(e)) { mode = 'dis'; e = e.replace(/(dis|disadvantage)$/, ''); }
  if (!e) e = '1d20'; if (/^[+-]\d+$/.test(e)) e = '1d20' + e;
  const terms = e.match(/[+-]?[^+-]+/g); if (!terms) throw Error('bad roll');
  let total = 0, nat = null; const dice = [], parts = [];
  for (const raw of terms) {
    const sign = raw[0] === '-' ? -1 : 1, t = raw.replace(/^[+-]/, ''), m = /^(\d*)d(\d+|%)$/.exec(t), pre = parts.length ? (sign < 0 ? ' − ' : ' + ') : (sign < 0 ? '−' : '');
    if (m) {
      const n = +(m[1] || 1), f = m[2] === '%' ? 100 : +m[2]; if (n < 1 || n > 100 || f < 2 || f > 1000) throw Error('bad roll');
      if (mode && n === 1 && f === 20) { const a = rnd(20), b = rnd(20), k = mode === 'adv' ? Math.max(a, b) : Math.min(a, b); total += sign * k; nat ??= k; dice.push({ s: 20, v: a, drop: a !== k }, { s: 20, v: b, drop: b !== k }); parts.push(`${pre}[${a}, ${b} → ${k}]`); mode = null; }
      else { const rs = Array.from({ length: n }, () => rnd(f)); total += sign * rs.reduce((x, y) => x + y, 0); if (f === 20 && n === 1) nat ??= rs[0]; dice.push(...rs.map((v) => ({ s: f, v }))); parts.push(`${pre}[${rs.join(', ')}]`); }
    } else if (/^\d+$/.test(t)) { total += sign * +t; parts.push(`${pre}${t}`); } else throw Error('bad roll');
  }
  return { total, nat, detail: parts.join(''), dice };
}
async function roll(label, expr) {
  let r; const rolled = rollMode === 'normal' ? expr : `${expr} ${rollMode}`;
  try { r = rollExpr(rolled); } catch { toast('Could not roll that'); return null; }
  const el = document.createElement('div'); el.className = 'toast roll';
  el.innerHTML = `<b>${esc(label)}</b><div class="total ${r.nat === 20 ? 'nat20' : r.nat === 1 ? 'nat1' : ''}">${r.total}</div><div>${esc(r.detail)}${r.nat === 20 ? ' · NAT 20' : r.nat === 1 ? ' · NAT 1' : ''}</div>`;
  $('#toasts').append(el); setTimeout(() => el.remove(), 6000);
  // Also publish the latest roll per character to plain Firebase, so the Owlbear extension can show it on the token.
  if (id) fetch(`https://geezsheets-default-rtdb.firebaseio.com/gmroll/gaia/${encodeURIComponent(id)}.json`, { method: 'PUT',
    body: JSON.stringify({ name: pc?.name || '', label, total: r.total, nat: r.nat ?? null, detail: r.detail, ts: Date.now() }) }).catch(() => {});
  // And in the table VTT's own format (test/rolls), so index.html shows it in its dice tray. Plain REST: the Gaia layer has no such path.
  if (id) { const kept = r.dice.filter((d) => !d.drop), mod = r.total - kept.reduce((a, d) => a + d.v, 0), rid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    vr = { id: rid, by: pc?.name || 'Player', dice: kept.map((d) => ({ sides: d.s, result: d.v })), mod, total: r.total, ts: Date.now(), sub: label };
    const base = 'https://geezsheets-default-rtdb.firebaseio.com/test/rolls';
    fetch(base + '/last.json', { method: 'PUT', body: JSON.stringify(vr) }).catch(() => {}); fetch(base + '/log/' + rid + '.json', { method: 'PUT', body: JSON.stringify(vr) }).catch(() => {}); }
  try { if (pc?.campaign) await push(ref(db, `geezvtt/live/${pc.campaign}/rolls`), { by: pc.name, char: id, expr: `${label} ${rolled}`, detail: r.detail, total: r.total, nat: r.nat ?? null, dice: r.dice, ts: Date.now() }); } catch {}
  return r;
}

// ---------- data
async function loadData() {
  const get1 = (u) => fetch(u).then((r) => r.json()).catch(() => null);
  const [s, k, e, m, c, t, cu] = await Promise.all(['data/spells.json', 'data/skills.json', 'data/equipment.json', 'data/magic_items.json', 'data/conditions.json', 'tokens/index.json', 'data/subclass_features.json'].map(get1));
  D.spellList = s || []; D.spellList.forEach((x) => (D.spells[norm(x.name)] = x));
  D.skills = k || []; (e || []).forEach((x) => (D.equip[norm(x.name)] = x)); (m || []).forEach((x) => (D.magic[norm(x.name)] = x));
  D.conditions = c || []; D.tokens = t || []; D.custom = cu || D.custom;
}
const itemInfo = (n) => D.equip[norm(n)] || D.magic[norm(n)] || {};
const descOf = (x) => { const d = x?.desc ?? x?.special ?? []; return Array.isArray(d) ? d.join(' ') : String(d || ''); };
const rules = (t) => (Array.isArray(t) ? t : [t]).filter(Boolean).map((x) => `<div class="rule">${T(x)}</div>`).join('');

// ---------- spell helpers
const subKey = () => Object.keys(D.custom.subclasses).find((k) => norm(k) === norm(pc?.subclass));
function castInfo() {
  const sc = pc?.spellcasting; if (!sc) return null;
  const cls = norm(pc.class), key = subKey(), third = key && D.custom.subclasses[key].caster === 'third';
  const ability = sc.ability || D.custom.castingAbility[third ? key : cls]; if (!ability) return null;
  const prepared = (D.custom.preparedCasters || []).includes(cls), mc = abMod(stat(ability)), lv = Number(pc.level) || 1;
  const slots = sc.slots || []; const maxLevel = Math.max(0, ...[...Array(10).keys()].filter((l) => (slots[l] || 0) > 0));
  const limit = prepared ? Math.max(1, mc + (cls === 'paladin' ? Math.floor(lv / 2) : lv)) : 0;
  return { sc, cls, ability, prepared, limit, maxLevel, mc };
}
function alwaysSet() { const k = subKey(), out = new Set(); for (const [l, ns] of Object.entries(D.custom.subclasses[k]?.spells || {})) if (+l <= (pc.level || 1)) ns.forEach((n) => out.add(norm(n))); return out; }
const onList = (s, cls) => s.classes?.some((x) => x.index === cls) || (D.custom.extraOnList?.[cls] || []).some((n) => norm(n) === norm(s.name));

// ---------- parts of the page
function avatar() {
  const a = pc?.sheets?.traits?.avatar; if (a) return `<img class="avatar" src="${esc(a)}" alt="">`;
  const f = D.tokens.find((x) => norm(x) === norm(pc?.name).replace(/ /g, '_') + '.png' || norm(x.replace(/\.png$/, '')) === norm(pc?.name));
  return f ? `<img class="avatar" src="tokens/${esc(f)}" alt="">` : `<div class="avatar initial" style="background:${esc(pc?.token_color || '#059669')}">${esc((pc?.name || '?')[0])}</div>`;
}
function miniHp(p = pc) { const c = p?.combat || {}, hp = Number(c.hp_current ?? 0), max = Math.max(1, Number(c.hp_max ?? 1)); return `<span class="mini-hp"><b>${hp}/${max}</b><i style="width:${Math.max(0, Math.min(100, hp / max * 100))}%"></i></span>`; }
function header() { return `<header class="top"><strong>${esc(pc?.name || 'Companion')}</strong><span class="spacer"></span>${pc ? miniHp() : ''}${GM ? '<a href="#" data-act="party">party</a>' : '<a href="#" data-act="picker">switch</a>'}</header>`; }
const tabsBar = () => `<nav class="tabs">${TABS.map(([k, l]) => `<button class="${tab === k ? 'active' : ''}" data-tab="${k}"><span><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg></span>${l}</button>`).join('')}</nav><button class="fab" data-act="dice" aria-label="Dice">🎲</button>`;
const pips = (max, filled, attrs) => Array.from({ length: max }, (_, i) => `<button class="pip ${i < filled ? 'on' : ''}" ${attrs(i)}>${i < filled ? '●' : '○'}</button>`).join('');

function slotsCard(withDc = true) {
  const s = pc.spellcasting; if (!s) return '';
  let out = '<div class="card"><div class="section-title">Spell slots</div>';
  for (let l = 1; l <= 9; l++) { const max = Number(s.slots?.[l] ?? 0); if (!max) continue; const free = max - Number(s.slots_used?.[l] ?? 0); out += `<div class="row"><span class="grow">Level ${l}</span><div class="pips">${pips(max, free, (i) => `data-act="slot" data-level="${l}" data-spent="${i >= free}"`)}</div></div>`; }
  return out + (withDc ? `<div class="muted">Save DC ${esc(s.spell_save_dc ?? '—')} · Spell attack ${esc(bon(s.spell_attack_bonus))}</div>` : '') + '</div>';
}
function chargeRows(filter) {
  return Object.entries(pc.abilities || {}).filter(([, a]) => a && a.kind === 'charge' && filter(a)).map(([k, a]) => { const max = Number(a.max || 0), cur = Number(a.current ?? max); return `<div class="row"><span class="grow">${T(a.label || k)}</span><div class="pips">${pips(max, cur, (i) => `data-act="charge" data-key="${esc(k)}" data-n="${i + 1}"`)}</div></div>`; }).join('');
}

// ---------- Character tab
// Collapsible sections (VTT window): open/closed is remembered per section.
const openKey = (k) => 'companion.open.' + k;
const isOpen = (k, dflt = true) => { try { const v = localStorage.getItem(openKey(k)); return v == null ? dflt : v === '1'; } catch { return dflt; } };
const sec = (k, title, body, dflt = true, cls = '') => `<details class="sec ${cls}" data-k="${k}" ${isOpen(k, dflt) ? 'open' : ''}><summary class="lbl">${title}</summary>${body}</details>`;
document.addEventListener('toggle', (e) => { const k = e.target?.dataset?.k; if (k) try { localStorage.setItem(openKey(k), e.target.open ? '1' : '0'); } catch { /* fine */ } }, true);
// Other tabs, in the VTT window: every card with a heading folds up under it.
function collapsify() {
  if (!document.body.classList.contains('embed')) return;
  document.querySelectorAll('.view > .card').forEach((card, i) => {
    const h = card.firstElementChild; if (!h || !h.classList.contains('section-title') || card.matches('details')) return;
    const key = tab + '.' + (h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || i), d = document.createElement('details');
    d.className = card.className + ' sec'; d.dataset.k = key; d.open = isOpen(key); const s = document.createElement('summary'); s.className = 'section-title'; s.innerHTML = h.innerHTML; h.remove();
    d.append(s, ...card.childNodes); card.replaceWith(d);
  });
}
// Compact Character tab for the VTT window: HP, AC row, inspiration / exhaustion, conditions, abilities, saves, skills, short rest.
function charTabCompact() {
  const c = pc.combat || {}, hp = Number(c.hp_current ?? 0), max = Math.max(1, Number(c.hp_max ?? 1)), pct = Math.max(0, Math.min(100, hp / max * 100)), col = pct > 50 ? 'var(--green)' : pct > 25 ? 'var(--warn)' : 'var(--red)';
  const conds = list(c.conditions), conc = c.concentration || {}, d = c.death_saves || {};
  const req = (r) => esc(JSON.stringify(r));
  const skills = SKILLS.map(([k, l, a]) => { const s = pc.skills?.[k] || {}; return `<button class="mini" data-req='${req({ kind: 'skill', key: k })}'><span>${s.expertise ? '◉' : s.proficient ? '●' : '○'} ${esc(l)}</span><b>${bon(s.bonus ?? abMod(stat(a)))}</b></button>`; }).join('');
  const stats = [['AC', c.ac ?? '—', ''], ['Init', bon(c.initiative_bonus ?? abMod(stat('dex'))), 'init'], ['Spd', c.speed ?? '—', ''], ['Prof', bon(profB()), ''], ['Pass', pc.senses?.passive_perception ?? 10 + abMod(stat('wis')), '']];
  return `<section class="view cmp">
${sec('c.vitals', 'Vitals <span class="muted">' + hp + '/' + max + ' · AC ' + esc(c.ac ?? '—') + '</span>', `<div class="r hpr"><button class="danger" data-act="damage" aria-label="Damage">−</button><div class="hpbar"><i style="width:${pct}%;background:${col}"></i><b>${hp} / ${max}${Number(c.temp_hp || 0) ? ` +${Number(c.temp_hp)}` : ''}</b></div><button class="primary" data-act="heal" aria-label="Heal">+</button><input id="hp-amount" inputmode="numeric" type="number" min="1" placeholder="1" value="${esc(keepHp)}" aria-label="Amount"></div>
${hp === 0 ? `<div class="r">${['success', 'fail'].map((k) => `<span class="muted">${k}</span>${[1, 2, 3].map((n) => `<button class="pip ${count(d[k]) >= n ? 'on' : ''}" data-act="death" data-kind="${k}" data-n="${n}">${count(d[k]) >= n ? '●' : '○'}</button>`).join('')}`).join('')}${rbtn({ kind: 'death' }, 'Roll', 'mini')}</div>` : ''}
<div class="r stats5">${stats.map(([l, v, k]) => `<div class="st"><small>${l}</small>${k ? rbtn({ kind: 'initiative' }, v, 'mini') : `<b>${esc(v)}</b>`}</div>`).join('')}</div>`)}
${sec('c.status', 'Status' + (conds.length ? ' <span class="muted">' + conds.length + ' condition' + (conds.length > 1 ? 's' : '') + '</span>' : ''), `<div class="r"><button class="pip ${c.inspiration ? 'on' : ''}" data-act="inspiration" aria-label="Inspiration">${c.inspiration ? '●' : '○'}</button><span>Inspiration</span><span class="grow"></span><span class="muted">Exhaustion</span><button class="mini sq" data-act="exhaust" data-delta="-1">−</button><b>${Number(c.exhaustion || 0)}</b><button class="mini sq" data-act="exhaust" data-delta="1">+</button></div>
<div class="r wrap">${conds.map((x) => `<button class="pill" data-act="condition-remove" data-name="${esc(x)}">${esc(x)} ×</button>`).join('')}<select data-cond-add aria-label="Add condition"><option value="">Conditions…</option>${D.conditions.filter((x) => !conds.includes(x.name)).map((x) => `<option>${esc(x.name)}</option>`).join('')}</select></div>
${conc.active ? `<div class="r conc"><span class="grow">Concentrating: <b>${esc(conc.spell)}</b></span><button class="mini" data-act="conc-drop">Drop</button></div>` : ''}
${conc.check ? `<div class="r"><span class="grow">Conc. save CON DC ${esc(conc.check.dc)}</span>${rbtn({ kind: 'save', key: 'con' }, 'Roll', 'mini')}<button class="mini" data-act="conc-keep">Keep</button><button class="mini" data-act="conc-drop">Drop</button></div>` : ''}`)}
${sec('c.abilities', 'Abilities', `<div class="six">${AB.map((k) => `<button class="mini ab" data-req='${req({ kind: 'ability', key: k })}'><small>${AL[k]}</small><b>${bon(abMod(stat(k)))}</b><span>${stat(k)}</span></button>`).join('')}</div>`)}
${sec('c.saves', 'Saving throws', `<div class="six">${AB.map((k) => `<button class="mini ab" data-req='${req({ kind: 'save', key: k })}'><small>${AL[k]}${list(pc.saves?.proficient).includes(k) ? ' ●' : ''}</small><b>${bon(pc.saves?.[k] ?? abMod(stat(k)))}</b></button>`).join('')}</div>`)}
${sec('c.skills', 'Skills', `<div class="skl">${skills}</div>`)}
${sec('c.rest', 'Rest', `<div class="r"><button class="mini grow" data-act="short-rest">Short rest</button></div>`, true)}</section>`;
}

function charTab() {
  if (document.body.classList.contains('embed')) return charTabCompact();
  const c = pc.combat || {}, hp = Number(c.hp_current ?? 0), max = Math.max(1, Number(c.hp_max ?? 1)), pct = Math.max(0, Math.min(100, hp / max * 100)), col = pct > 50 ? 'var(--green)' : pct > 25 ? 'var(--warn)' : 'var(--red)';
  const sub = `Lv ${pc.level ?? '?'} ${pc.class || ''}${pc.subclass ? ' (' + pc.subclass + ')' : ''} · ${pc.species || ''}`;
  const conds = list(c.conditions), conc = c.concentration || {}, d = c.death_saves || {};
  const skillBtns = SKILLS.map(([k, l, a]) => { const s = pc.skills?.[k] || {}; return `<button class="skill" data-req='${esc(JSON.stringify({ kind: 'skill', key: k }))}'><span>${s.expertise ? '◉' : s.proficient ? '●' : '○'} ${esc(l)}</span><b>${bon(s.bonus ?? abMod(stat(a)))}</b></button>`; }).join('');
  return `<section class="view"><div class="card hero">${avatar()}<div class="name">${esc(pc.name)}</div><div class="sub">${esc(sub)}</div></div>
<div class="card"><div class="hp-head"><span class="section-title">Hit points</span><span class="hp-num">${hp} / ${max} <span class="temp">+${Number(c.temp_hp || 0)} temp</span></span></div><div class="bar"><i style="width:${pct}%;background:${col}"></i></div>
<div class="hp-controls"><input id="hp-amount" inputmode="numeric" type="number" min="1" placeholder="Amount" value="${esc(keepHp)}"><button class="danger" data-act="damage">Damage</button><button class="primary" data-act="heal">Heal</button></div>
<div class="temp-row"><input id="temp-hp" inputmode="numeric" type="number" min="0" placeholder="Temp HP" value="${Number(c.temp_hp || 0)}"><button data-act="temp">Set temp</button></div></div>
${hp === 0 ? `<div class="card"><div class="section-title">Death saves</div>${['success', 'fail'].map((k) => `<div class="row"><span class="grow">${k}</span>${[1, 2, 3].map((n) => `<button class="pip ${count(d[k]) >= n ? 'on' : ''}" data-act="death" data-kind="${k}" data-n="${n}">${count(d[k]) >= n ? '●' : '○'}</button>`).join('')}</div>`).join('')}<div class="actions">${rbtn({ kind: 'death' }, 'Roll death save')}</div></div>` : ''}
<div class="card"><div class="stats">${[['AC', c.ac ?? '—', ''], ['Initiative', bon(c.initiative_bonus ?? abMod(stat('dex'))), 'init'], ['Speed', (c.speed ?? '—') + (c.speed ? ' ft' : ''), ''], ['Prof', bon(profB()), ''], ['Passive', pc.senses?.passive_perception ?? 10 + abMod(stat('wis')), '']].map(([l, v, k]) => `<div class="stat"><span class="label">${l}</span>${k ? rbtn({ kind: 'initiative' }, v, 'value') : `<span class="value">${esc(v)}</span>`}</div>`).join('')}</div>
<div class="row"><span class="grow">Inspiration</span><button data-act="inspiration">${c.inspiration ? 'On' : 'Off'}</button><span class="muted">Exhaustion</span><button data-act="exhaust" data-delta="-1">−</button><b>${Number(c.exhaustion || 0)}</b><button data-act="exhaust" data-delta="1">+</button></div></div>
<div class="card"><div class="section-title">Conditions</div><div>${conds.map((x) => `<button class="pill" data-act="condition-remove" data-name="${esc(x)}">${esc(x)} ×</button>`).join('') || '<span class="muted">None</span>'}</div><button data-act="condition-sheet">+ Condition</button>
${conc.active ? `<div class="row conc"><span class="grow">Concentrating: <b>${esc(conc.spell)}</b></span><button data-act="conc-drop">Drop</button></div>` : ''}
${conc.check ? `<div class="row"><span class="grow">Concentration save: CON DC ${esc(conc.check.dc)}</span>${rbtn({ kind: 'save', key: 'con' }, 'Roll save')}<button data-act="conc-keep">Keep</button><button data-act="conc-drop">Drop</button></div>` : ''}</div>
<div class="card"><div class="section-title">Abilities</div><div class="ability-grid">${AB.map((k) => `<button class="ability" data-req='${esc(JSON.stringify({ kind: 'ability', key: k }))}'><small>${AL[k]}</small><b>${stat(k)}</b><span>${bon(abMod(stat(k)))}</span></button>`).join('')}</div>
<div class="section-title">Saving throws</div><div class="chips">${AB.map((k) => `<button class="chip" data-req='${esc(JSON.stringify({ kind: 'save', key: k }))}'>${AL[k]} <b>${bon(pc.saves?.[k] ?? abMod(stat(k)))}</b>${list(pc.saves?.proficient).includes(k) ? ' ●' : ''}</button>`).join('')}</div></div>
<details class="card"><summary class="section-title">Skills</summary><div class="skills">${skillBtns}</div></details>
<div class="card"><div class="actions"><button data-act="short-rest">Short rest</button><button class="primary" data-act="long-rest">Long rest</button></div></div></section>`;
}

// ---------- Actions tab
const isSpellCard = (a) => /\((cantrip|spell)\)/i.test(a.name || '');
function actionsTab() {
  const n = attacksPerAction(pc), atks = list(pc.attacks);
  const weapons = atks.map((a, i) => ({ a, i })).filter(({ a }) => !isSpellCard(a));
  const feats = Object.entries(pc.abilities || {}).filter(([, a]) => a && (a.kind === 'charge' || (a.activation && a.activation !== 'none')));
  const cantrips = list(pc.spellcasting?.spells).filter((s) => !s.level || s.prepared_type === 'cantrip');
  return `<section class="view">${weapons.length ? `<div class="card"><div class="section-title">Attack action</div><b>${n.normal} attack${n.normal === 1 ? '' : 's'}</b>${n.round1 > n.normal ? ` <span class="badge">${n.round1} on round 1</span>` : ''}${n.notes.map((x) => `<div class="muted">${esc(x)}</div>`).join('')}</div>` : ''}
${weapons.map(({ a, i }) => `<div class="card"><div class="row"><b class="grow">${T(a.name)}</b>${rbtn({ kind: 'attack', idx: i }, 'Attack')}</div><div class="muted">${T(a.to_hit ? a.to_hit + ' to hit · ' : '')}${T(a.damage)} ${T(a.damage_type)}</div>${a.notes ? `<div class="rule">${T(a.notes)}</div>` : ''}</div>`).join('')}
${cantrips.length ? `<div class="card"><div class="section-title">Cantrips</div>${cantrips.map((s) => `<div class="row"><span class="grow">${T(s.name)} <span class="muted">${T(s.damage || '')}</span></span>${rbtn({ kind: 'spell', name: s.name }, 'Cast')}</div>`).join('')}</div>` : ''}
${feats.length ? `<div class="card"><div class="section-title">Features you can use</div>${feats.map(([k, a]) => `<details><summary><b>${T(a.label || k)}</b> ${a.activation && a.activation !== 'none' ? `<span class="badge">${esc(String(a.activation).replace(/_/g, ' '))}</span>` : ''}</summary>${a.kind === 'charge' ? `<div class="row"><span class="grow">${esc(String(a.recharge || '').replace(/_/g, ' '))}</span><div class="pips">${pips(Number(a.max || 0), Number(a.current ?? a.max ?? 0), (i) => `data-act="charge" data-key="${esc(k)}" data-n="${i + 1}"`)}</div></div>` : ''}${rules(a.effect_desc)}</details>`).join('')}</div>` : ''}
${!weapons.length && !feats.length && !cantrips.length ? '<div class="card muted">Nothing to do on your turn yet.</div>' : ''}</section>`;
}

// ---------- Spells tab
function spellRow(s, always) {
  const d = D.spells[norm(s.name)] || {}, lvl = Number(s.level) || 0;
  return `<details class="card"><summary><b>${T(s.name)}</b> <span class="badge">${lvl ? 'Lv ' + lvl : 'Cantrip'}</span>${always ? ' <span class="badge">always</span>' : ''}${s.concentration ? ' <span class="badge">conc.</span>' : ''}<div class="muted">${T(s.cast_time || d.casting_time || '')}${d.range ? ' · ' + esc(d.range) : ''}</div></summary>${rules(d.desc?.length ? d.desc : s.notes)}${s.beginner_tip ? `<div class="rule">${T(s.beginner_tip)}</div>` : ''}<div class="actions">${rbtn({ kind: 'spell', name: s.name }, lvl ? 'Recipe and cast' : 'Recipe')}</div></details>`;
}
function spellsTab() {
  const ci = castInfo(); if (!ci) return '<section class="view"><div class="card muted">This character does not cast spells.</div></section>';
  const all = [...list(pc.spellcasting.spells)].sort((a, b) => (a.level || 0) - (b.level || 0) || String(a.name).localeCompare(b.name)), always = alwaysSet();
  const cant = all.filter((s) => !s.level), by = {}; all.filter((s) => s.level).forEach((s) => (by[s.level] ||= []).push(s));
  const prepCount = all.filter((s) => s.level && !always.has(norm(s.name))).length;
  return `<section class="view">${slotsCard()}${ci.prepared ? `<div class="card"><div class="row"><span class="grow">Prepared ${prepCount} of ${ci.limit}</span><button class="primary" data-act="prepare">Prepare spells</button></div></div>` : ''}
${cant.length ? `<div class="section-title">Cantrips</div>${cant.map((s) => spellRow(s)).join('')}` : ''}${Object.keys(by).map((l) => `<div class="section-title">Level ${l}</div>${by[l].map((s) => spellRow(s, always.has(norm(s.name)))).join('')}`).join('')}${!all.length ? '<div class="card muted">No spells yet.</div>' : ''}</section>`;
}

// ---------- Inventory tab
const CONS = /potion|elixir|scroll|ration|oil|antitoxin|alchemist|bomb|holy water|torch|arrow|bolt|bullet|dart|bandage|vial|flask|poison|acid/i;
function invEntries() { const inv = pc.inventory; return Object.entries(Array.isArray(inv) ? Object.fromEntries(inv.map((x, i) => [i, x])) : inv || {}).filter(([, x]) => x && typeof x === 'object' && x.name); }
function invRow([k, it]) {
  const info = itemInfo(it.name), q = Number(it.qty ?? 1) || 1, cons = CONS.test(it.name) || /consumable/i.test(it.category || '');
  return `<details class="card"><summary><b>${T(it.name)}</b> <span class="badge">×${q}</span>${it.category ? ` <span class="muted">${T(it.category)}</span>` : ''}</summary>${rules(it.desc || descOf(info))}${it.notes ? `<div class="rule">${T(it.notes)}</div>` : ''}${cons ? `<div class="actions"><button data-act="use-item" data-key="${esc(k)}">Use one</button></div>` : ''}</details>`;
}
function invTab() {
  const eq = pc.equipped || {}, ents = invEntries().filter(([, x]) => norm(x.name).includes(norm(invSearch))), cons = ents.filter(([, x]) => CONS.test(x.name) || /consumable/i.test(x.category || '')), rest = ents.filter((e) => !cons.includes(e));
  const wielded = list(pc.attacks).filter((a) => !isSpellCard(a)), coin = pc.coin_purse || {};
  return `<section class="view"><div class="card"><div class="section-title">Equipment</div><div class="row"><span class="grow">Armor</span><b>${T(eq.armor || 'None')}</b></div><div class="row"><span class="grow">Shield</span><b>${eq.shield ? 'Yes' : 'No'}</b></div>${wielded.map((a) => `<div class="row"><span class="grow">${T(a.name)}</span><span class="muted">${T(a.damage)}</span></div>`).join('')}<div class="row"><span class="grow">Armor class</span><b>${esc(pc.combat?.ac ?? '—')}</b></div></div>
<div class="card"><div class="section-title">Coin</div><div class="coins">${['pp', 'gp', 'ep', 'sp', 'cp'].map((k) => `<div class="coin"><small>${k}</small><div><button data-act="coin" data-k="${k}" data-d="-1">−</button><b>${Number(coin[k] || 0)}</b><button data-act="coin" data-k="${k}" data-d="1">+</button></div></div>`).join('')}</div></div>
<input id="item-search" class="search" placeholder="Search items" value="${esc(invSearch)}">
${cons.length ? `<div class="section-title">Consumables</div>${cons.map(invRow).join('')}` : ''}${rest.length ? `<div class="section-title">Items</div>${rest.map(invRow).join('')}` : ''}${!ents.length ? '<div class="card muted">Nothing carried.</div>' : ''}</section>`;
}

// ---------- Features tab
function featsTab() {
  const tb = pc.text_blocks || {}, ab = Object.entries(pc.abilities || {}).filter(([, a]) => a && a.label);
  return `<section class="view">${ab.map(([k, a]) => `<div class="card"><div class="section-title">${esc(a.kind === 'charge' ? 'Limited use' : a.activation && a.activation !== 'none' ? String(a.activation).replace(/_/g, ' ') : 'Feature')}</div><h3>${T(a.label)}</h3>${a.kind === 'charge' ? `<div class="row"><span class="grow muted">${esc(String(a.recharge || '').replace(/_/g, ' '))}</span><div class="pips">${pips(Number(a.max || 0), Number(a.current ?? a.max ?? 0), (i) => `data-act="charge" data-key="${esc(k)}" data-n="${i + 1}"`)}</div></div>` : ''}${rules(a.effect_desc)}</div>`).join('')}
${pc.origin_feat ? `<div class="card"><div class="section-title">Origin feat</div><h3>${T(pc.origin_feat)}</h3></div>` : ''}
${tb.features_traits ? `<details class="card"><summary class="section-title">Class and species notes</summary><div class="rule pre">${T(tb.features_traits)}</div></details>` : ''}
${tb.proficiencies_languages ? `<details class="card"><summary class="section-title">Proficiencies and languages</summary><div class="rule pre">${T(tb.proficiencies_languages)}</div></details>` : ''}
${(tb.appearance || tb.backstory || tb.notes) ? `<details class="card"><summary class="section-title">About</summary>${['appearance', 'backstory', 'notes'].filter((k) => tb[k]).map((k) => `<h3>${k}</h3><div class="rule pre">${T(tb[k])}</div>`).join('')}</details>` : ''}
<div class="card"><div class="section-title">My notes</div><textarea id="my-notes" placeholder="Write anything here">${esc(tb.player_notes || '')}</textarea><div class="muted">Saved when you tap outside the box.</div></div></section>`;
}

// ---------- roll recipes, dice, rests
const recipeCtx = () => ({ spells: D.spellList });
function openPanel(req, opts = {}) {
  const r = req.kind === 'attack' ? recipeFor(pc, { kind: 'attack', attack: pc.attacks[req.idx] }, { round1: !!opts.round1 }) : recipeFor(pc, req, { ...recipeCtx(), slot: opts.slot });
  const x = document.createElement('div'); x.className = 'overlay';
  const riders = r.rolls.flatMap((z, i) => (z.riders || []).map((q, j) => `<label><input type="checkbox" data-rider="${i}:${j}"> ${esc(q.label)} ${q.expr ? `<b>+${esc(q.expr)}</b>` : ''} <span class="muted">${esc(q.note || '')}</span></label>`));
  x.innerHTML = `<div class="sheet"><button class="close" data-close>Close</button><h2>${T(r.label)}</h2><div class="recipe">${r.rolls.map((z) => `<div><b>${esc(z.name)}:</b> ${esc(z.text)}</div>`).join('')}${r.dc ? `<div><b>Save DC:</b> ${r.dc}</div>` : ''}${(r.notes || []).map((n) => `<div class="muted">${T(n)}</div>`).join('')}
${r.slotOptions?.length ? `<label>Slot level <select data-slot>${r.slotOptions.map((n) => `<option value="${n}" ${n === r.slot ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}${riders.join('')}${req.kind === 'attack' && r.attacks?.round1 > r.attacks?.normal ? `<label><input type="checkbox" data-round1 ${opts.round1 ? 'checked' : ''}> First turn of combat</label>` : ''}</div>
<div class="actions">${r.rolls.map((z, i) => `<button class="primary" data-roll="${i}">Roll ${esc(z.name.toLowerCase())}</button>`).join('')}${req.kind === 'spell' && r.level ? '<button data-cast>Cast (use slot)</button>' : ''}</div></div>`;
  document.body.append(x);
  x.addEventListener('change', (e) => { if (e.target.matches('[data-slot]')) { x.remove(); openPanel(req, { slot: +e.target.value }); } if (e.target.matches('[data-round1]')) { x.remove(); openPanel(req, { round1: e.target.checked }); } });
  x.addEventListener('click', async (e) => {
    if (e.target === x || e.target.closest('[data-close]')) return x.remove();
    const rb = e.target.closest('[data-roll]');
    if (rb) { const i = +rb.dataset.roll, z = r.rolls[i], on = [...x.querySelectorAll('[data-rider]')].filter((q) => q.checked && +q.dataset.rider.split(':')[0] === i).map((q) => z.riders[+q.dataset.rider.split(':')[1]].expr).filter(Boolean); const rr = await roll(`${r.label} ${z.name}`, [z.expr, ...on].join('+')); if (req.kind === 'death' && rr) await applyDeath(rr); return; }
    if (e.target.closest('[data-cast]')) { await castSpell(r); x.remove(); }
  });
}
async function castSpell(r) {
  const l = Number(r.slot || r.level), used = Number(pc.spellcasting?.slots_used?.[l] || 0);
  await write(() => set(path(`spellcasting/slots_used/${l}`), used + 1));
  if (r.concentration) await write(() => update(path('combat'), { concentration: { active: true, spell: r.label, check: null } }));
  toast(`Cast ${esc(r.label)}${l ? ' (level ' + l + ' slot)' : ''}`);
}
function applyDeath(r) { return write(() => runTransaction(path('combat'), (c) => { if (!c || Number(c.hp_current) !== 0) return c; if (r.nat === 20) return { ...c, hp_current: 1, death_saves: { success: 0, fail: 0 } }; const d = { success: count(c.death_saves?.success), fail: count(c.death_saves?.fail) }, k = r.nat >= 10 ? 'success' : 'fail'; d[k] = count(d[k] + (r.nat === 1 ? 2 : 1)); return { ...c, death_saves: d }; })); }
function dicePanel() {
  const x = document.createElement('div'); x.className = 'overlay'; let mode = 'normal';
  x.innerHTML = `<div class="sheet"><button class="close" data-close>Close</button><h2>Dice</h2><div class="actions">${['normal', 'adv', 'dis'].map((m) => `<button data-mode="${m}" aria-pressed="${m === 'normal'}">${m === 'normal' ? 'Normal' : m === 'adv' ? 'Advantage' : 'Disadvantage'}</button>`).join('')}</div><div class="dice">${[4, 6, 8, 10, 12, 20, 100].map((s) => `<button data-die="${s}">d${s}</button>`).join('')}</div><div class="row"><input id="dice-expr" placeholder="2d6+3" aria-label="Dice expression"><button class="primary" data-go>Roll</button></div></div>`;
  document.body.append(x);
  x.addEventListener('click', async (e) => {
    if (e.target === x || e.target.closest('[data-close]')) return x.remove();
    const m = e.target.closest('[data-mode]'); if (m) { mode = m.dataset.mode; rollMode = mode; x.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b === m)); return; }
    const d = e.target.closest('[data-die]'); if (d) { await roll('d' + d.dataset.die, '1d' + d.dataset.die); return; }
    if (e.target.closest('[data-go]')) { const v = $('#dice-expr', x).value.trim(); if (v) await roll(v, v); }
  });
}
async function rest(long) {
  const c = pc.combat || {}, sc = pc.spellcasting, ups = { ...(long ? { hp_current: Number(c.hp_max) || 1, temp_hp: 0, exhaustion: Math.max(0, Number(c.exhaustion || 0) - 1), death_saves: { success: 0, fail: 0 } } : {}) };
  if (!confirm(long ? 'Take a long rest? HP, spell slots and most abilities come back.' : 'Take a short rest? Short-rest abilities come back.')) return;
  await write(async () => {
    if (long) { await update(path('combat'), ups); if (c.concentration?.active) await update(path('combat'), { concentration: { active: false, spell: '', check: null } }); if (sc?.slots_used) await update(path('spellcasting'), { slots_used: sc.slots_used.map((v, i) => (i ? 0 : null)) }); }
    for (const [k, a] of Object.entries(pc.abilities || {})) if (a?.kind === 'charge' && Number(a.current ?? a.max) < Number(a.max) && (long ? /long|short_or_long|short/.test(a.recharge || '') : /short/.test(a.recharge || ''))) await set(path(`abilities/${k}/current`), Number(a.max));
  });
  toast(long ? 'Long rest done.' : 'Short rest done.');
  if (long && castInfo()?.prepared) setTimeout(preparePanel, 300);
}
function preparePanel() {
  const ci = castInfo(); if (!ci?.prepared) return;
  const always = alwaysSet(), cur = list(pc.spellcasting.spells), have = new Set(cur.filter((s) => s.level && !always.has(norm(s.name))).map((s) => norm(s.name)));
  const book = ci.cls === 'wizard' ? new Set(list(pc.spellcasting.spellbook).map(norm).concat([...have])) : null;
  const cand = D.spellList.filter((s) => s.level >= 1 && s.level <= ci.maxLevel && onList(s, ci.cls) && !always.has(norm(s.name)) && (!book || book.has(norm(s.name))));
  const sel = new Set(have); const x = document.createElement('div'); x.className = 'overlay';
  const draw = () => { x.innerHTML = `<div class="sheet tall"><button class="close" data-close>Close</button><h2>Prepare spells</h2><p class="muted">Choose up to ${ci.limit} (${AL[ci.ability]} ${bon(ci.mc)} + level ${pc.level}). Always-prepared spells do not count.${book ? ' Wizards choose from their spellbook.' : ''}</p><div class="section-title ${sel.size > ci.limit ? 'over' : ''}">${sel.size} / ${ci.limit} chosen</div><div class="prep">${[...new Set(cand.map((s) => s.level))].sort().map((l) => `<div class="section-title">Level ${l}</div>${cand.filter((s) => s.level === l).map((s) => `<label class="prep-row"><input type="checkbox" data-sp="${esc(s.name)}" ${sel.has(norm(s.name)) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}`).join('')}</div><div class="actions"><button class="primary" data-save ${sel.size > ci.limit ? 'disabled' : ''}>Save prepared spells</button></div></div>`; };
  draw(); document.body.append(x);
  x.addEventListener('change', (e) => { const n = e.target.dataset?.sp; if (!n) return; if (e.target.checked) sel.add(norm(n)); else sel.delete(norm(n)); const sc = x.scrollTop, p = $('.prep', x)?.scrollTop; draw(); const q = $('.prep', x); if (q) q.scrollTop = p; });
  x.addEventListener('click', async (e) => {
    if (e.target === x || e.target.closest('[data-close]')) return x.remove();
    if (!e.target.closest('[data-save]') || sel.size > ci.limit) return;
    const sc = pc.spellcasting, atk = Number(sc.spell_attack_bonus) || 0, dc = Number(sc.spell_save_dc) || 0, keep = cur.filter((s) => !s.level || always.has(norm(s.name)));
    const chosen = cand.filter((s) => sel.has(norm(s.name))).map((s) => cur.find((o) => norm(o.name) === norm(s.name)) || spellCard(s, 'prepared', atk, dc));
    const next = [...keep, ...chosen].sort((a, b) => a.level - b.level || String(a.name).localeCompare(String(b.name)));
    await write(() => update(path('spellcasting'), { spells: next })); toast('Prepared spells saved.'); x.remove();
  });
}
function conditionPanel() {
  const have = new Set(list(pc.combat?.conditions)); const x = document.createElement('div'); x.className = 'overlay';
  x.innerHTML = `<div class="sheet tall"><button class="close" data-close>Close</button><h2>Conditions</h2>${D.conditions.map((c) => `<details class="card"><summary><label><input type="checkbox" data-cond="${esc(c.name)}" ${have.has(c.name) ? 'checked' : ''}> <b>${esc(c.name)}</b></label></summary>${rules(c.desc)}</details>`).join('')}</div>`;
  document.body.append(x);
  x.addEventListener('click', (e) => { if (e.target === x || e.target.closest('[data-close]')) x.remove(); });
  x.addEventListener('change', async (e) => { const n = e.target.dataset?.cond; if (!n) return; const next = [...list(pc.combat?.conditions).filter((c) => c !== n), ...(e.target.checked ? [n] : [])]; await write(() => update(path('combat'), { conditions: next })); });
}

// ---------- GM roll calls (players answer in their own companion)
const liveApi = () => { const r = (p) => ref(db, `geezvtt/live/${pc.campaign}/${p}`); return { txn: (p, fn) => runTransaction(r(p), fn).then((x) => x.committed), update: (p, o) => update(r(p), o), push: (p, o) => push(r(p), o) }; };
function followCall() { if (!pc?.campaign || callCamp === pc.campaign) return; callUnsub?.(); callCamp = pc.campaign; callUnsub = onValue(ref(db, `geezvtt/live/${callCamp}/rollcall`), (s) => { const c = s.val(); if (c?.id !== liveCall?.id) { callMode = c?.mode || 'normal'; callExtras = {}; } liveCall = c; render(); }); }
function callBanner() {
  const c = liveCall; if (GM || !c || !c.open || !pc || !Object.hasOwn(c.to || {}, id)) return '';
  const done = c.results?.[id]; if (done) return `<section class="card callbox"><div class="section-title">GM called a roll</div><b>${esc(callTitle(c))}</b>: you rolled <b>${esc(done.total)}</b>${c.showDc && c.dc ? (passed(c, done) ? ' · Pass' : ' · Fail') : ''}</section>`;
  const m = callMod(pc, c);
  return `<section class="card callbox"><div class="section-title">GM called a roll</div><h3>${esc(callTitle(c))}${c.showDc && c.dc ? ' · DC ' + esc(c.dc) : ''}</h3><div>Roll 1d20, add ${m.parts.map(([k, n]) => esc(k) + ' ' + esc(sgn(n))).join(', ')} = <b>${esc(sgn(m.mod))}</b></div><div class="actions">${['normal', 'adv', 'dis'].map((x) => `<button data-act="call-mode" data-mode="${x}" aria-pressed="${callMode === x}">${x === 'normal' ? 'Normal' : x === 'adv' ? 'Advantage' : 'Disadvantage'}</button>`).join('')}</div><div>${EXTRAS.map(([k, l, d]) => `<label><input type="checkbox" data-call-extra="${k}" ${callExtras[k] ? 'checked' : ''}> ${esc(l)} +1d${d}</label>`).join(' ')}</div><button class="primary" data-act="call-roll">Roll it</button></section>`;
}

// ---------- GM screens
function gmStart() {
  gmUnsub.forEach((f) => f?.()); gmUnsub = [];
  gmUnsub.push(onValue(ref(db, 'characters/pcs'), (s) => { party = Object.fromEntries(Object.entries(s.val() || {}).filter(([i, x]) => x && x.name && i !== '__oracle__' && x.campaign !== '__oracle__' && x.type !== 'npc' && x.record_type !== 'npc').map(([i, x]) => [i, { ...x, id: i }])); const camps = campaigns(); if (!camps.includes(gmCamp)) gmCamp = camps[0] || ''; gmWatch(); render(); }));
}
const campaigns = () => [...new Set(Object.values(party).map((p) => p.campaign).filter(Boolean))].sort();
let gmWatching = '';
function gmWatch() {
  if (!gmCamp || gmWatching === gmCamp) return; gmWatching = gmCamp; gmUnsub = gmUnsub.slice(0, 1);
  gmUnsub.push(onValue(ref(db, `geezvtt/live/${gmCamp}/rollcall`), (s) => { liveCall = s.val(); render(); }));
  gmUnsub.push(onValue(ref(db, `geezvtt/live/${gmCamp}/rolls`), (s) => { gmRolls = Object.values(s.val() || {}).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 12); render(); }));
}
function partyView() {
  const camps = campaigns(), mine = Object.values(party).filter((p) => p.campaign === gmCamp).sort((a, b) => a.name.localeCompare(b.name));
  const c = liveCall && gmCamp ? liveCall : null;
  return `<section class="view"><div class="card"><div class="row"><select id="gm-camp" class="grow">${camps.map((x) => `<option ${x === gmCamp ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div><div class="actions"><button class="primary" data-act="gm-call">Call roll</button><button data-act="gm-give">Give item</button></div></div>
${c ? `<div class="card callbox"><div class="row"><b class="grow">${esc(callTitle(c))}${c.dc && c.showDc ? ' · DC ' + esc(c.dc) : ''}</b>${c.open ? '<button data-act="gm-close-call">Close</button>' : '<span class="muted">closed</span>'}</div>${Object.values(c.results || {}).map((r) => `<div class="row"><span class="grow">${esc(r.name)}</span><b>${esc(r.total)}</b>${c.showDc && passed(c, r) !== null ? `<span class="badge">${passed(c, r) ? 'pass' : 'fail'}</span>` : ''}</div>`).join('') || '<div class="muted">Waiting for answers</div>'}</div>` : ''}
${mine.map((p) => { const cc = p.combat || {}, sl = p.spellcasting?.slots || [], us = p.spellcasting?.slots_used || [], conds = list(cc.conditions); return `<button class="card partycard" data-act="open-pc" data-id="${esc(p.id)}"><div class="row"><b class="grow">${esc(p.name)}</b><span class="muted">Lv ${esc(p.level)} ${esc(p.class || '')}</span></div>${miniHp(p)}<div class="muted">AC ${esc(cc.ac ?? '—')}${[1, 2, 3, 4, 5].filter((l) => sl[l]).map((l) => ` · L${l} ${sl[l] - (us[l] || 0)}/${sl[l]}`).join('')}</div>${conds.length ? `<div>${conds.map((x) => `<span class="pill">${esc(x)}</span>`).join('')}</div>` : ''}${cc.concentration?.active ? `<div class="muted">Concentrating: ${esc(cc.concentration.spell)}</div>` : ''}</button>`; }).join('') || '<div class="card muted">No characters in this campaign.</div>'}
<div class="card"><div class="section-title">Recent rolls</div>${gmRolls.map((r) => `<div class="row"><span class="grow"><b>${esc(r.by)}</b> ${esc(r.expr)}</span><b>${esc(r.total)}</b></div>`).join('') || '<div class="muted">No rolls yet</div>'}</div></section>`;
}
function gmHeader() { return '<header class="top"><strong>Party</strong><span class="spacer"></span><span class="muted">GM</span></header>'; }
function callPanel() {
  const mine = Object.values(party).filter((p) => p.campaign === gmCamp); const x = document.createElement('div'); x.className = 'overlay';
  const keyOpts = (k) => k === 'skill' ? SKILLS.map(([a, l]) => `<option value="${a}">${l}</option>`).join('') : k === 'init' ? '' : AB.map((a) => `<option value="${a}">${ABIL[a]}</option>`).join('');
  x.innerHTML = `<div class="sheet tall"><button class="close" data-close>Close</button><h2>Call a roll</h2><label>Kind <select id="c-kind"><option value="init">Initiative</option><option value="save">Saving throw</option><option value="skill">Skill check</option><option value="ability">Ability check</option></select></label><label>Which <select id="c-key"></select></label><label>DC <input id="c-dc" type="number" inputmode="numeric" placeholder="optional"></label><label><input id="c-show" type="checkbox"> Show the DC to players</label><label>Mode <select id="c-mode"><option value="normal">Normal</option><option value="adv">Advantage</option><option value="dis">Disadvantage</option></select></label><div class="section-title">Who</div>${mine.map((p) => `<label><input type="checkbox" data-who="${esc(p.id)}" checked> ${esc(p.name)}</label>`).join('')}<div class="actions"><button class="primary" data-send>Call it</button></div></div>`;
  document.body.append(x); const fill = () => { $('#c-key', x).innerHTML = keyOpts($('#c-kind', x).value); $('#c-key', x).disabled = $('#c-kind', x).value === 'init'; }; fill();
  x.addEventListener('change', (e) => { if (e.target.id === 'c-kind') fill(); });
  x.addEventListener('click', async (e) => {
    if (e.target === x || e.target.closest('[data-close]')) return x.remove();
    if (!e.target.closest('[data-send]')) return;
    const to = {}; x.querySelectorAll('[data-who]').forEach((b) => { if (b.checked) to[b.dataset.who] = party[b.dataset.who].name; });
    if (!Object.keys(to).length) return toast('Pick at least one character.');
    const kind = $('#c-kind', x).value, call = newCall({ kind, key: $('#c-key', x).value, dc: $('#c-dc', x).value, showDc: $('#c-show', x).checked, mode: $('#c-mode', x).value, to });
    await write(() => set(ref(db, `geezvtt/live/${gmCamp}/rollcall`), call)); toast('Roll called.'); x.remove();
  });
}
function givePanel() {
  const mine = Object.values(party).filter((p) => p.campaign === gmCamp); const x = document.createElement('div'); x.className = 'overlay';
  x.innerHTML = `<div class="sheet tall"><button class="close" data-close>Close</button><h2>Give item</h2><input id="g-name" list="g-names" placeholder="Item name"><datalist id="g-names">${[...Object.values(D.equip), ...Object.values(D.magic)].map((i) => `<option value="${esc(i.name)}">`).join('')}</datalist><label>Quantity <input id="g-qty" type="number" min="1" value="1"></label><div class="section-title">Who</div>${mine.map((p) => `<label><input type="checkbox" data-who="${esc(p.id)}"> ${esc(p.name)}</label>`).join('')}<div class="actions"><button class="primary" data-send>Give</button></div></div>`;
  document.body.append(x);
  x.addEventListener('click', async (e) => {
    if (e.target === x || e.target.closest('[data-close]')) return x.remove();
    if (!e.target.closest('[data-send]')) return;
    const name = $('#g-name', x).value.trim(), qty = Math.max(1, parseInt($('#g-qty', x).value, 10) || 1), ids = [...x.querySelectorAll('[data-who]')].filter((b) => b.checked).map((b) => b.dataset.who);
    if (!name || !ids.length) return toast('Name an item and pick someone.');
    for (const cid of ids) await write(async () => {
      const invRef = ref(db, `characters/pcs/${cid}/inventory`), cur = Object.entries((await get(invRef)).val() || {}).filter(([, v]) => v && v.name), hit = cur.find(([, v]) => norm(v.name) === norm(name));
      if (hit) await update(ref(db, `characters/pcs/${cid}/inventory/${hit[0]}`), { qty: (Number(hit[1].qty ?? 1) || 1) + qty }); else { const info = itemInfo(name); await push(invRef, { name: info.name || name, qty, given_by: 'GM', given_at: Date.now() }); }
    });
    toast(`Gave ${esc(name)} x${qty}.`); x.remove();
  });
}
async function levelUpPanel() {
  const eid = db.ids?.().oldToNew?.[id]; if (!eid) return toast('Could not find this character in the new database.');
  const [raw, cl, cs] = await Promise.all([fetch(`${ENTITIES}/${eid}.json`).then((r) => r.json()), fetch('data/class_levels.json').then((r) => r.json()), fetch('data/classes.json').then((r) => r.json())]);
  if ((raw.data.level || 1) >= 20) return toast('Already level 20.');
  const plan = planCharacter(raw.data, (raw.data.level || 1) + 1, { classLevels: cl, classes: cs, spells: D.spellList, skills: D.skills }, D.custom);
  const x = document.createElement('div'); x.className = 'overlay';
  x.innerHTML = `<div class="sheet tall"><button class="close" data-close>Close</button><h2>${esc(raw.name)}: level ${raw.data.level} → ${plan.data.level}</h2>${plan.log.map((l) => `<div class="rule">${esc(l)}</div>`).join('')}${plan.choices.length ? `<div class="section-title">You still choose</div>${plan.choices.map((l) => `<div class="rule">${esc(l)}</div>`).join('')}` : ''}${plan.review.length ? `<div class="section-title">Check by hand</div>${[...new Set(plan.review)].map((l) => `<div class="rule">${esc(l)}</div>`).join('')}` : ''}<div class="actions"><button class="primary" data-apply>Level up</button></div></div>`;
  document.body.append(x);
  x.addEventListener('click', async (e) => {
    if (e.target === x || e.target.closest('[data-close]')) return x.remove();
    if (!e.target.closest('[data-apply]')) return;
    await write(async () => {
      const put = async (u, body, method) => { const r = await fetch(u, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw Error(`${method} failed: ${r.status}`); };
      for (const k of plan.changed) { const a = plan.data[k], b = raw.data[k]; if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) await put(`${ENTITIES}/${eid}/data/${k}.json`, Object.fromEntries(Object.entries(a).filter(([kk, v]) => JSON.stringify(v) !== JSON.stringify(b[kk]))), 'PATCH'); else await put(`${ENTITIES}/${eid}/data/${k}.json`, a, 'PUT'); }
      await put(`${ENTITIES}/${eid}/meta.json`, { updated_at: new Date().toISOString(), updated_by: 'companion-gm' }, 'PATCH');
    });
    toast('Leveled up.'); x.remove();
  });
}

// ---------- picker and loading a character
function picker() {
  app.innerHTML = '<section class="picker"><h1>Choose your character</h1><p class="muted">Pick the character you are playing.</p><div id="pick-list">Loading…</div></section>';
  get(ref(db, 'characters/pcs')).then((s) => { const l = Object.entries(s.val() || {}).map(([i, x]) => ({ ...x, id: i })).filter((x) => x.name && x.id !== '__oracle__' && x.campaign !== '__oracle__' && x.type !== 'npc' && x.record_type !== 'npc').sort((a, b) => (a.campaign || '').localeCompare(b.campaign || '') || a.name.localeCompare(b.name)); $('#pick-list').innerHTML = l.map((x) => `<button data-act="pick" data-id="${esc(x.id)}"><b>${esc(x.name)}</b><br><span class="muted">Lv ${esc(x.level ?? '?')} ${esc(x.class || '')} · ${esc(x.campaign || '')}</span></button>`).join('') || '<p class="error">No characters found.</p>'; }).catch((e) => { $('#pick-list').textContent = 'Could not load characters: ' + e.message; });
}
function select(cid) {
  id = cid; localStorage.setItem('companion.char', id); history.replaceState(null, '', location.pathname + `?char=${encodeURIComponent(id)}` + (GM ? '&gm=jonny' : '') + (params.has('embed') ? '&embed=1' : '') + location.hash);
  if (db.selectPC && !GM) db.selectPC(id); unsubPc?.(); pc = null; view = 'char';
  unsubPc = onValue(ref(db, 'characters/pcs/' + id), (s) => { pc = s.val() ? { ...s.val(), id } : null; if (pc) { document.title = pc.name + ' · Companion'; followCall(); render(); } else { toast('That character was not found'); picker(); } });
}

// ---------- render
const typing = () => { const a = document.activeElement; return !!a && a !== document.body && app.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && !['checkbox', 'button', 'radio'].includes(a.type); };
function render() {
  if (typing()) { dirty = true; return; } dirty = false;
  if (GM && view === 'party') { app.innerHTML = gmHeader() + partyView(); return; }
  if (!pc) return picker();
  const body = { char: charTab, actions: actionsTab, spells: spellsTab, inv: invTab, feats: featsTab }[tab] || charTab;
  app.innerHTML = header() + callBanner() + body() + tabsBar();
  collapsify();
  if (keepHp && $('#hp-amount')) $('#hp-amount').value = keepHp;
  if (GM && view === 'char') { const b = document.createElement('div'); b.className = 'card gmbar'; b.innerHTML = '<button data-act="gm-levelup">Level up</button>'; $('.view')?.append(b); }
}
document.addEventListener('focusout', () => setTimeout(() => { if (dirty && !typing()) render(); }, 60));

// ---------- events
document.addEventListener('input', (e) => { if (e.target.id === 'hp-amount') keepHp = e.target.value; if (e.target.id === 'item-search') { invSearch = e.target.value; render(); const q = $('#item-search'); q?.focus(); q?.setSelectionRange(invSearch.length, invSearch.length); } });
document.addEventListener('change', async (e) => {
  const k = e.target.dataset?.callExtra; if (k) callExtras[k] = e.target.checked;
  if (e.target.id === 'gm-camp') { gmCamp = e.target.value; localStorage.setItem('companion.gmCamp', gmCamp); gmWatching = ''; gmWatch(); render(); }
  if (e.target.id === 'my-notes') await write(() => set(path('text_blocks/player_notes'), e.target.value)).then(() => toast('Notes saved.')).catch(() => {});
});
document.addEventListener('click', async (e) => {
  const rq = e.target.closest('[data-req]');
  if (rq && !e.target.closest('.overlay')) { try { openPanel(JSON.parse(rq.dataset.req)); } catch (err) { toast(esc(err.message)); } return; }
  const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; location.hash = tab; render(); window.scrollTo(0, 0); return; }
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act, c = pc?.combat || {};
  try {
    if (a === 'picker') { pc = null; unsubPc?.(); render(); return; }
    if (a === 'pick') { select(b.dataset.id); return; }
    if (a === 'party') { view = 'party'; render(); return; }
    if (a === 'open-pc') { select(b.dataset.id); return; }
    if (a === 'dice') return dicePanel();
    if (a === 'damage' || a === 'heal') { const n = Math.max(1, Math.trunc(Number($('#hp-amount')?.value) || 0)); keepHp = ''; if (a === 'damage' && db.damage) await write(() => db.damage(id, n)); else await write(() => runTransaction(path('combat'), (cc) => { if (!cc) return cc; const cur = Number(cc.hp_current) || 0, tmp = Math.max(0, Number(cc.temp_hp) || 0), hp = a === 'heal' ? Math.min(Number(cc.hp_max) || 1, cur + n) : Math.max(0, cur - Math.max(0, n - tmp)); return { ...cc, hp_current: hp, temp_hp: a === 'heal' ? tmp : Math.max(0, tmp - n), death_saves: hp > 0 ? { success: 0, fail: 0 } : cc.death_saves || { success: 0, fail: 0 } }; })); return; }
    if (a === 'temp') return void await write(() => set(path('combat/temp_hp'), Math.max(0, Math.trunc(Number($('#temp-hp')?.value) || 0))));
    if (a === 'inspiration') return void await write(() => update(path('combat'), { inspiration: !c.inspiration }));
    if (a === 'exhaust') return void await write(() => update(path('combat'), { exhaustion: Math.max(0, Number(c.exhaustion || 0) + Number(b.dataset.delta)) }));
    if (a === 'slot') { const l = b.dataset.level, u = Number(pc.spellcasting?.slots_used?.[l] || 0), max = Number(pc.spellcasting?.slots?.[l] || 0); return void await write(() => set(path(`spellcasting/slots_used/${l}`), b.dataset.spent === 'true' ? Math.max(0, u - 1) : Math.min(max, u + 1))); }
    if (a === 'charge') { const k = b.dataset.key, ab = pc.abilities?.[k], n = Number(b.dataset.n), cur = Number(ab.current ?? ab.max ?? 0); return void await write(() => set(path(`abilities/${k}/current`), cur >= n ? n - 1 : n)); }
    if (a === 'death') return void await write(() => runTransaction(path('combat'), (cc) => { if (!cc || Number(cc.hp_current) !== 0) return cc; const d = cc.death_saves || {}, k = b.dataset.kind, n = Number(b.dataset.n); return { ...cc, death_saves: { success: count(d.success), fail: count(d.fail), [k]: count(d[k]) >= n ? n - 1 : n } }; }));
    if (a === 'condition-sheet') return conditionPanel();
    if (a === 'condition-remove') return void await write(() => update(path('combat'), { conditions: list(c.conditions).filter((x) => x !== b.dataset.name) }));
    if (a === 'conc-keep') return void await write(() => update(path('combat'), { concentration: { ...c.concentration, check: null } }));
    if (a === 'conc-drop') return void await write(() => update(path('combat'), { concentration: { active: false, spell: '', check: null } }));
    if (a === 'coin') { const k = b.dataset.k, n = Math.max(0, Number(pc.coin_purse?.[k] || 0) + Number(b.dataset.d)); return void await write(() => update(path('coin_purse'), { [k]: n })); }
    if (a === 'use-item') { const it = pc.inventory?.[b.dataset.key]; if (!it) return; const q = Number(it.qty ?? 1) || 1; return void await write(async () => { if (q > 1) await update(path(`inventory/${b.dataset.key}`), { qty: q - 1 }); else await remove(path(`inventory/${b.dataset.key}`)); toast(`Used ${esc(it.name)}.`); }); }
    if (a === 'long-rest') return void await rest(true);
    if (a === 'short-rest') return void await rest(false);
    if (a === 'prepare') return preparePanel();
    if (a === 'call-mode') { callMode = b.dataset.mode; return render(); }
    if (a === 'call-roll') { b.disabled = true; try { const r = await answerCall(liveApi(), liveCall, id, { name: pc.name, charId: id, c: pc, mode: callMode, extras: callExtras }); toast(r ? `<b>${esc(callTitle(liveCall))}</b>: ${esc(r.total)} (${esc(r.detail)})` : 'Someone already answered, or the call closed.'); } finally { b.disabled = false; } return; }
    if (a === 'gm-call') return callPanel();
    if (a === 'gm-give') return givePanel();
    if (a === 'gm-close-call') return void await write(() => update(ref(db, `geezvtt/live/${gmCamp}/rollcall`), { open: false }));
    if (a === 'gm-levelup') return void await levelUpPanel();
  } catch (err) { toast(esc(err.message)); }
});
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (TABS.some((x) => x[0] === h)) { tab = h; render(); } });

// ---------- start
await loadData();
if (GM) gmStart();
const chosen = params.get('char') || (GM ? null : localStorage.getItem('companion.char'));
if (chosen) select(chosen); else if (GM) render(); else picker();

document.addEventListener('change', async (e) => {   // compact Character tab: add a condition from the dropdown
  const sel = e.target.closest?.('[data-cond-add]'); if (!sel || !sel.value || !pc) return; const n = sel.value;
  await write(() => update(path('combat'), { conditions: [...list(pc.combat?.conditions).filter((x) => x !== n), n] }));
});
