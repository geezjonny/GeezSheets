// GeezSheets companion: the player's character sheet at the table (and the GM's party screen).
// Always on screen: name, AC, hit points and status. Tabs: Play (your turn), Spells, Skills, Bag, Me.
import { callTitle, callMod, answerCall, newCall, EXTRAS, passed, sgn, SKILLS, ABIL } from './rollcall.js';
import { db, ref, get, set, update, remove, push, onValue, runTransaction } from './rodeo-firebase.js';
import { recipeFor } from './recipes.js';
import { attacksPerAction, planCharacter, spellCard, mod as abMod } from './levelup.js';
import { effectivePC, asList } from './geez/effective.js';
import { $, esc, T, bon, rules, opened, fold, item, card, ask, sheet, toast } from './companion-ui.js';
import { bagTab, bagAction, initBag } from './companion-bag.js';
import { showDice, shareRoll, watchRolls } from './companion-dice.js';
import { featText } from './companion-help.js';
import { norm, turnOptions, openSlot, isPrepared, criticalDice, timing } from './companion-model.js';
import { initExtras, onCharacter, featList, effectCards, featControls, extraAction, extraChange, restEffects } from './companion-extras.js';

// A phone can keep showing the previous page for a while after an update. Give that old page the current styles.
if (!document.querySelector('link[href^="css/companion.css"]')) {
  document.querySelectorAll('style').forEach((old) => old.remove());
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'css/companion.css' }));
}

const app = $('#app'), params = new URLSearchParams(location.search);
const GM = params.get('gm') === 'jonny';
const ENTITIES = 'https://geezsheets-default-rtdb.firebaseio.com/v2/worlds/gaia/entities';
const AB = ['str', 'dex', 'con', 'int', 'wis', 'cha'], AL = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const ICON = {
  play: '<path d="m6 4 12 16M18 4 6 20M4 8h16M4 16h16"/>',
  spells: '<path d="M12 3 9.8 9.8 3 12l6.8 2.2L12 21l2.2-6.8L21 12l-6.8-2.2z"/>',
  skills: '<path d="m12 2 8.7 5v10L12 22l-8.7-5V7zM12 2v20M3.3 7 12 12l8.7-5"/>',
  bag: '<path d="M4 8h16v12H4zM9 8V5h6v3M4 13h16"/>',
  me: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><g fill="currentColor"><circle cx="8.5" cy="8.5" r="1.3"/><circle cx="15.5" cy="8.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="8.5" cy="15.5" r="1.3"/><circle cx="15.5" cy="15.5" r="1.3"/></g>'
};
const TABS = [['play', 'Play'], ['spells', 'Spells'], ['skills', 'Skills'], ['bag', 'Bag'], ['me', 'Me']];
// Links saved before the redesign still land somewhere sensible.
const OLD_TABS = { char: 'play', actions: 'play', inv: 'bag', feats: 'me' };
const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* not remembered */ } } };
const tabFromHash = () => { const h = location.hash.slice(1), name = OLD_TABS[h] || h; return TABS.some((t) => t[0] === name) ? name : null; };

let pc = null, fx = null, id = null,   // pc = stored record (all writes); fx = with items and effects applied (all display and rolls)
  party = {}, view = GM && !params.get('char') ? 'party' : 'char';
let tab = tabFromHash() || 'play';
let search = '', dirty = false, unsubPc = null;
let liveCall = null, callUnsub = null, callCamp = null, callMode = 'normal', callExtras = {};
let gmCamp = store.get('companion.gmCamp') || '', gmUnsub = [], gmRolls = [];
const D = { spells: {}, spellList: [], conditions: [], tokens: [], equip: {}, magic: {}, ref: {}, custom: { subclasses: {}, extraOnList: {}, castingAbility: {}, preparedCasters: [] } };

// ---------- small helpers
const count = (v) => Math.max(0, Math.min(3, Math.trunc(Number(v) || 0)));
const list = (v) => asList(v).filter((x) => x !== 'array');
const stat = (k) => Number((fx || pc)?.stats?.[k] ?? 10);
const rbtn = (req, label, cls = '', aria = '') => `<button class="${cls}" data-req="${esc(JSON.stringify(req))}" ${aria ? `aria-label="${esc(aria)}"` : ''}>${label}</button>`;
const path = (p) => ref(db, `characters/pcs/${id}/${p}`);
async function write(task) { try { return await task(); } catch (e) { toast('Not saved: ' + esc(e.message)); throw e; } }
const pips = (max, filled, label, attrs) => `<span class="pips">${Array.from({ length: max }, (_, i) => `<button class="pip ${i < filled ? 'on' : ''}" ${attrs(i)} aria-pressed="${i < filled}" aria-label="${esc(label)} ${i + 1} of ${max}"></button>`).join('')}</span>`;
const hpState = (c = pc?.combat || {}) => {
  const hp = Number(c.hp_current ?? 0), max = Math.max(1, Number(c.hp_max ?? 1)), pct = Math.max(0, Math.min(100, hp / max * 100));
  return { hp, max, temp: Number(c.temp_hp || 0), pct, tone: pct > 50 ? 'good' : pct > 25 ? 'warn' : 'low' };
};

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
// What other phones need to draw this roll over the character's head.
const rollRecord = (label, r) => ({ name: pc?.name || '', campaign: pc?.campaign || '', label, total: r.total, nat: r.nat ?? null, detail: r.detail, dice: r.dice, color: pc?.token_color || '', portrait: portrait() });
const toTable = (record) => shareRoll(id, record).catch(() => toast('Your roll did not reach the table board.'));
// Rolls, shows the number to the caller, and shares it with the table (GM roll log and the Owlbear token).
async function roll(label, expr, mode = 'normal') {
  let r; const rolled = mode === 'normal' ? expr : `${expr} ${mode}`;
  try { r = rollExpr(rolled); } catch { toast('Could not roll that'); return null; }
  const shown = rollRecord(label, r);
  toTable(shown);
  if (pc?.campaign) push(ref(db, `geezvtt/live/${pc.campaign}/rolls`), { by: pc.name, char: id, expr: `${label} ${rolled}`, detail: r.detail, total: r.total, nat: r.nat ?? null, dice: r.dice, ts: Date.now() }).catch(() => {});
  navigator.vibrate?.(r.nat === 20 ? [40, 60, 40] : 25);
  await showDice(shown);
  return r;
}
const resultHTML = (label, r) => `<div class="result ${r.nat === 20 ? 'nat20' : r.nat === 1 ? 'nat1' : ''}"><small>${esc(label)}</small><strong>${r.total}</strong><span>${esc(r.detail)}${r.nat === 20 ? ' · Natural 20!' : r.nat === 1 ? ' · Natural 1' : ''}</span></div>`;
const modePicker = (mode) => `<div class="with-help"><div class="segmented" role="group" aria-label="Advantage">${[['dis', 'Disadvantage'], ['normal', 'Normal'], ['adv', 'Advantage']].map(([m, l]) => `<button data-mode="${m}" aria-pressed="${mode === m}">${l}</button>`).join('')}</div>${ask('advantage')}</div>`;

// ---------- data
async function loadData() {
  const get1 = (u) => fetch(u).then((r) => r.json()).catch(() => null);
  const [s, k, e, m, c, t, cu] = await Promise.all(['data/spells.json', 'data/skills.json', 'data/equipment.json', 'data/magic_items.json', 'data/conditions.json', 'tokens/index.json', 'data/subclass_features.json'].map(get1));
  D.spellList = s || []; D.spellList.forEach((x) => (D.spells[norm(x.name)] = x));
  (e || []).forEach((x) => (D.equip[norm(x.name)] = x)); (m || []).forEach((x) => (D.magic[norm(x.name)] = x));
  D.skills = k || []; D.conditions = c || []; D.tokens = t || []; D.custom = cu || D.custom;
  D.ref = Object.fromEntries([s, k, e, m].flatMap((x) => x || []).map((x) => [x.name.toLowerCase(), x]));
}
const itemInfo = (n) => D.equip[norm(n)] || D.magic[norm(n)] || {};

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

// ---------- always on screen
function portrait() {
  const stored = pc?.sheets?.traits?.avatar; if (stored) return stored;
  const f = D.tokens.find((x) => norm(x) === norm(pc?.name).replace(/ /g, '_') + '.png' || norm(x.replace(/\.png$/, '')) === norm(pc?.name));
  return f ? `tokens/${f}` : '';
}
function avatar() {
  const src = portrait();
  return src ? `<img class="avatar" src="${esc(src)}" alt="">` : `<span class="avatar initial" style="background:${esc(pc?.token_color || '#8b6f35')}">${esc((pc?.name || '?')[0])}</span>`;
}
function hpBar(c) {
  const h = hpState(c);
  return `<span class="hpbar ${h.tone}"><i style="width:${h.pct}%"></i><b>${h.hp} / ${h.max} HP${h.temp ? ` <em>+${h.temp}</em>` : ''}</b></span>`;
}
function header() {
  const c = pc.combat || {}, conds = list(c.conditions), conc = c.concentration || {};
  const chips = [
    conc.active ? `<button class="chip conc" data-act="status">Concentrating: ${esc(conc.spell)}</button>` : '',
    ...conds.map((x) => `<button class="chip bad" data-act="status">${esc(x)}</button>`),
    Number(c.exhaustion) ? `<button class="chip bad" data-act="status">Exhaustion ${esc(c.exhaustion)}</button>` : '',
    c.inspiration ? '<button class="chip good" data-act="status">★ Inspired</button>' : ''
  ].join('');
  return `<header class="top">
<div class="top-row">${GM ? '<button class="icon" data-act="party" aria-label="Back to party">‹</button>' : ''}<button class="who" data-act="tab" data-tab="me">${avatar()}<span><b>${esc(pc.name)}</b><small>Level ${esc(pc.level ?? '?')} ${esc(pc.class || '')}</small></span></button>
<button class="ac" data-help="ac" aria-label="Armor class ${esc(fx.combat?.ac ?? 'unknown')}. What is this?"><small>AC ?</small><b>${esc(fx.combat?.ac ?? '—')}</b></button><button class="icon" data-act="dice" aria-label="Roll dice">${svg('dice')}</button></div>
<div class="top-row"><button class="hp-button" data-act="hp" aria-label="Hit points ${hpState(c).hp} of ${hpState(c).max}. Change">${hpBar(c)}</button><button class="chip add" data-act="status">Status</button></div>
${chips ? `<div class="chips">${chips}</div>` : ''}</header>`;
}
const casts = () => !!(castInfo() || list(pc.spellcasting?.spells).length);
const visibleTabs = () => TABS.filter(([k]) => k !== 'spells' || casts());
const tabsBar = () => `<nav class="tabs" style="--tabs:${visibleTabs().length}">${visibleTabs().map(([k, l]) => `<button data-act="tab" data-tab="${k}" ${tab === k ? 'aria-current="page"' : ''}>${svg(k)}<span>${l}</span></button>`).join('')}</nav>`;
// Things that need an answer now come first on every tab.
function urgent() {
  const c = pc.combat || {}, d = c.death_saves || {}, check = c.concentration?.check;
  let out = callBanner();
  if (Number(c.hp_current ?? 0) === 0) out += card('You are down: death saves', `${['success', 'fail'].map((k) => `<div class="line"><span>${k === 'success' ? 'Successes' : 'Failures'}</span>${pips(3, count(d[k]), k, (i) => `data-act="death" data-kind="${k}" data-n="${i + 1}"`)}</div>`).join('')}<div class="buttons">${rbtn({ kind: 'death' }, 'Roll death save', 'primary')}</div>`, '', 'death');
  if (check) out += card('Hold your concentration', `<p>Roll a Constitution save, DC ${esc(check.dc)}, to keep ${esc(c.concentration.spell)}.</p><div class="buttons">${rbtn({ kind: 'save', key: 'con' }, 'Roll save', 'primary')}<button data-act="conc-keep">I made it</button><button data-act="conc-drop">I lost it</button></div>`, '', 'concentration');
  return out;
}

// ---------- shared rows
function slotsCard() {
  const s = fx.spellcasting; if (!s) return '';
  let out = '';
  for (let l = 1; l <= 9; l++) { const max = Number(s.slots?.[l] ?? 0); if (!max) continue; const free = max - Number(s.slots_used?.[l] ?? 0); out += `<div class="line"><span>Level ${l}</span>${pips(max, free, `Level ${l} slot`, (i) => `data-act="slot" data-level="${l}" data-spent="${i >= free}"`)}</div>`; }
  return card('Spell slots', out, s.spell_save_dc ? `DC ${esc(s.spell_save_dc)} · ${esc(bon(s.spell_attack_bonus))} to hit` : '', 'slots');
}
function weaponRow({ idx, attack: a }, where) {
  const hit = a.to_hit !== '' && a.to_hit != null ? `${bon(a.to_hit)} to hit` : '';
  return item({ key: `${where}:w${idx}`, title: T(a.name), sub: T([hit, a.damage, a.damage_type].filter(Boolean).join(' · ')), body: rules(a.notes || a.desc || 'Tap Attack to roll to hit. If the GM says it hits, roll the damage.'), side: rbtn({ kind: 'attack', idx }, 'Attack', 'primary', `Attack with ${a.name}`) });
}
function spellRow(s, where, always) {
  const d = s.custom ? {} : D.spells[norm(s.name)] || {}, lvl = Number(s.level) || 0, when = timing(s.cast_time || d.casting_time);
  const empty = lvl && !openSlot(pc.spellcasting, lvl);
  const sub = [lvl ? `Level ${lvl}` : 'Cantrip', when === 'bonus' ? 'Bonus action' : when === 'reaction' ? 'Reaction' : when === 'longer' ? s.cast_time || d.casting_time : '', s.concentration || d.concentration ? 'Concentration' : '', s.range || d.range || '', always ? 'Always ready' : ''].filter(Boolean).join(' · ');
  const text = s.custom ? s.desc : d.desc?.length ? d.desc : s.notes;
  return item({ key: `${where}:s${norm(s.name)}`, title: T(s.name), sub: T(sub), search: s.name,
    body: rules(text) + (s.beginner_tip ? `<p class="tip">${T(s.beginner_tip)}</p>` : ''),
    side: rbtn({ kind: 'spell', name: s.name }, empty ? 'No slot' : 'Cast', empty ? 'quiet' : 'primary', `Cast ${s.name}`) });
}
function featureRow({ id: featId, feat }, where) {
  const sub = [feat.activation && !['none', 'save'].includes(feat.activation) ? String(feat.activation).replace(/_/g, ' ') : '', feat.recharge && feat.recharge !== 'none' ? `recharges ${String(feat.recharge).replace(/_/g, ' ')}` : ''].filter(Boolean).join(' · ');
  return item({ key: `${where}:f${featId}`, title: T(feat.name), sub: T(sub), body: rules(feat.description || feat.effect_desc), search: feat.name, side: featControls(pc, featId) });
}

// ---------- tabs
function playTab() {
  const g = turnOptions(pc, fx, D.spells), c = fx.combat || {}, attacks = attacksPerAction(pc);
  const row = (option) => (option.type === 'weapon' ? weaponRow(option, 'play') : option.type === 'spell' ? spellRow(option.spell, 'play') : featureRow(option, 'play'));
  const stats = [
    ['initiative', rbtn({ kind: 'initiative' }, `<small>Initiative</small><b>${bon(c.initiative_bonus ?? abMod(stat('dex')))}</b>`, 'stat', 'Roll initiative')],
    ['speed', `<span class="stat"><small>Speed</small><b>${esc(c.speed ?? '—')}</b></span>`],
    ['passive', `<span class="stat"><small>Passive perception</small><b>${esc(fx.senses?.passive_perception ?? 10 + abMod(stat('wis')))}</b></span>`]
  ].map(([help, html]) => `<div class="stat-box">${html}${ask(help)}</div>`).join('');
  const note = attacks.normal > 1 ? `${attacks.normal} attacks` : '';
  // A caster's full list would bury the turn, so spells that cost a slot fold away once there are more than a few.
  const group = (name, options) => {
    const slotted = options.filter((o) => o.type === 'spell' && Number(o.spell.level));
    if (slotted.length <= 3) return options.map(row).join('');
    return options.filter((o) => !slotted.includes(o)).map(row).join('') + fold(`play:slots:${name}`, `Spells that use a slot (${slotted.length})`, slotted.map(row).join(''), 'plain more');
  };
  const empty = !Object.values(g).some((x) => x.length);
  return `<div class="stats">${stats}</div>
${card('Action', group('action', g.action), note, 'action')}
${card('Bonus action', group('bonus', g.bonus), '', 'bonus')}
${card('Reaction', group('reaction', g.reaction), '', 'reaction')}
${card('Limited uses', g.resources.map(row).join(''), '', 'uses')}
${g.longer.length ? fold('play:longer', 'Takes longer than a turn', g.longer.map(row).join(''), 'card') : ''}
${empty ? '<p class="empty">Nothing to do on your turn yet.</p>' : ''}
${g.action.some((x) => x.type === 'spell' && x.spell.level) || g.bonus.some((x) => x.type === 'spell' && x.spell.level) ? slotsCard() : ''}`;
}
function spellsTab() {
  const ci = castInfo(), all = list(fx.spellcasting?.spells).sort((a, b) => (a.level || 0) - (b.level || 0) || String(a.name).localeCompare(b.name));
  if (!ci && !all.length) return '<p class="empty">This character does not cast spells.</p>';
  const always = alwaysSet(), shown = all.filter(isPrepared), levels = [...new Set(shown.map((s) => Number(s.level) || 0))];
  const prepared = shown.filter((s) => s.level && !s.custom && !always.has(norm(s.name))).length;
  return `${slotsCard()}${ci?.prepared ? `<div class="buttons solo with-help"><button data-act="prepare">Prepare spells (${prepared} of ${ci.limit})</button>${ask('prepare')}</div>` : ''}
${shown.length > 8 ? `<input class="search" type="search" placeholder="Find a spell" aria-label="Find a spell" value="${esc(search)}">` : ''}
${levels.map((l) => card(l ? `Level ${l}` : 'Cantrips', shown.filter((s) => (Number(s.level) || 0) === l).map((s) => spellRow(s, 'spells', always.has(norm(s.name)))).join(''), '', l ? 'leveled' : 'cantrips')).join('') || '<p class="empty">No spells ready.</p>'}`;
}
function skillsTab() {
  const proficient = list(fx.saves?.proficient);
  const abilities = AB.map((k) => {
    const check = abMod(stat(k)), save = Number(fx.saves?.[k] ?? check);
    return `<div class="ability"><button class="ability-name" data-help="${k}" aria-label="What is ${ABIL[k]}?"><b>${AL[k]} <i>?</i></b><small>${stat(k)}</small></button>${rbtn({ kind: 'ability', key: k }, `<small>Check</small><b>${bon(check)}</b>`, '', `${ABIL[k]} check ${bon(check)}`)}${rbtn({ kind: 'save', key: k }, `<small>Save${proficient.includes(k) ? ' ●' : ''}</small><b>${bon(save)}</b>`, '', `${ABIL[k]} saving throw ${bon(save)}`)}</div>`;
  }).join('');
  const skills = SKILLS.map(([k, l, a]) => {
    const s = fx.skills?.[k] || {}, value = s.bonus ?? abMod(stat(a));
    return `<div class="skill-row">${rbtn({ kind: 'skill', key: k }, `<span aria-hidden="true">${s.expertise ? '◉' : s.proficient ? '●' : '○'}</span><span>${esc(l)}<small>${AL[a]}${s.expertise ? ' · expertise' : s.proficient ? ' · proficient' : ''}</small></span><b>${bon(value)}</b>`, 'skill', `${l} ${bon(value)}`)}${ask(k)}</div>`;
  }).join('');
  const passive = (k, a) => 10 + Number(fx.skills?.[k]?.bonus ?? abMod(stat(a)));
  return `${card('Skills', skills, '', 'skills')}${card('Abilities and saves', `<div class="abilities">${abilities}</div>`, '', 'abilities')}
${card('Passive', `<div class="line"><span>Perception</span><b>${esc(fx.senses?.passive_perception ?? passive('perception', 'wis'))}</b></div><div class="line"><span>Insight</span><b>${passive('insight', 'wis')}</b></div><div class="line"><span>Investigation</span><b>${passive('investigation', 'int')}</b></div>`, '', 'passive')}`;
}
function meTab() {
  const tb = pc.text_blocks || {};
  const about = [['Class and species notes', tb.features_traits], ['Proficiencies and languages', tb.proficiencies_languages], ['Appearance', tb.appearance], ['Backstory', tb.backstory], ['Notes from your sheet', tb.notes]]
    .filter(([, text]) => text).map(([title, text]) => fold(`me:${title}`, title, `<p class="rule">${T(text)}</p>`, 'plain')).join('');
  return `<div class="hero">${avatar()}<div><h1>${esc(pc.name)}</h1><p>${esc([pc.species, pc.class, pc.subclass].filter(Boolean).join(' · '))}</p></div></div>
<div class="buttons solo with-help"><button data-act="short-rest">Short rest</button>${ask('shortRest')}<button data-act="long-rest">Long rest</button>${ask('longRest')}</div>
${card('Features', featList(pc), '', 'features')}${effectCards(pc, D.ref)}
${card('Feat', pc.origin_feat ? `<h3>${T(pc.origin_feat)}</h3><p class="rule">${T(featText(pc.origin_feat))}</p>` : '')}
${card('About', about)}
${card('My notes', `<textarea id="my-notes" aria-label="My notes" placeholder="Names, clues, debts…">${esc(tb.player_notes || '')}</textarea><p class="hint">Saves when you tap outside the box.</p>`)}
${card('This phone', `<label class="check"><input type="checkbox" id="stay-awake" ${store.get('companion.awake') === '1' ? 'checked' : ''}> Keep the screen on while playing</label><div class="buttons">${GM ? '<button data-act="gm-levelup">Level up</button>' : '<button data-act="picker">Switch character</button>'}</div>`)}`;
}

// ---------- rolling
function rollSheet(req, opts = {}) {
  const build = () => (req.kind === 'attack' ? recipeFor(fx, { kind: 'attack', attack: fx.attacks[req.idx] }, { round1: !!opts.round1 }) : recipeFor(fx, req, { spells: D.spellList, slot: opts.slot }));
  let r = build(), mode = 'normal', critical = false, last = '';
  const ticked = new Set();
  const slotsLeft = () => !!(r.level && openSlot(pc.spellcasting, r.level));
  const html = () => {
    const d20 = r.rolls.some((z) => /\bd20|1d20/.test(z.expr));
    const riders = r.rolls.flatMap((z, i) => (z.riders || []).map((q, j) => `<label class="check"><input type="checkbox" data-rider="${i}:${j}" ${ticked.has(`${i}:${j}`) ? 'checked' : ''}><span>${esc(q.label)} ${q.expr ? `<b>+${esc(q.expr)}</b>` : ''} <small>${esc(q.note || '')}</small></span></label>`)).join('');
    return `<div data-result aria-live="polite">${last}</div>
${r.dc ? `<p class="dc">Target saves against <b>DC ${esc(r.dc)}</b>${ask('dc')}</p>` : ''}
${r.rolls.length ? `<div class="sheet-help">How rolling works${ask('rolling')}${req.kind === 'attack' ? `Critical hits${ask('critical')}` : ''}${r.concentration ? `Concentration${ask('concentration')}` : ''}${req.kind === 'death' ? `Death saves${ask('death')}` : ''}</div>` : ''}
<div class="recipe">${r.rolls.map((z) => `<p><b>${esc(z.name)}</b> ${esc(critical && z.name === 'Damage' ? criticalDice(z.expr) : z.text)}</p>`).join('')}</div>
${r.slotOptions?.length > 1 ? `<label class="field">Spell slot level<select data-slot>${r.slotOptions.map((n) => `<option value="${n}" ${n === r.slot ? 'selected' : ''}>Level ${n}</option>`).join('')}</select></label>` : ''}
${req.kind === 'attack' && r.attacks?.round1 > r.attacks?.normal ? `<label class="check"><input type="checkbox" data-round1 ${opts.round1 ? 'checked' : ''}><span>First turn of combat</span></label>` : ''}
${d20 ? modePicker(mode) : ''}${riders}
${(r.notes || []).length ? fold('roll:notes', 'How this works', r.notes.map((n) => `<p class="rule">${T(n)}</p>`).join(''), 'plain') : ''}
<div class="buttons sticky">${r.rolls.map((z, i) => `<button class="${i === 0 || (critical && z.name === 'Damage') ? 'primary' : ''}" data-roll="${i}">${critical && z.name === 'Damage' ? 'Roll critical damage' : `Roll ${esc(z.name.toLowerCase())}`}</button>`).join('')}
${req.kind === 'spell' && r.level ? `<button class="${r.rolls.length ? '' : 'primary'}" data-cast ${slotsLeft() ? '' : 'disabled'}>${slotsLeft() ? `Use level ${esc(r.slot)} slot` : 'No slot left'}</button>` : ''}</div>`;
  };
  const box = sheet(T(r.label), html());
  const draw = () => { $('.sheet-body', box).innerHTML = html(); };
  box.addEventListener('change', (e) => {
    if (e.target.matches('[data-slot]')) { opts.slot = +e.target.value; r = build(); ticked.clear(); draw(); }
    else if (e.target.matches('[data-round1]')) { opts.round1 = e.target.checked; r = build(); ticked.clear(); draw(); }
    else if (e.target.matches('[data-rider]')) ticked[e.target.checked ? 'add' : 'delete'](e.target.dataset.rider);
  });
  box.addEventListener('click', async (e) => {
    const m = e.target.closest('[data-mode]'); if (m) { mode = m.dataset.mode; draw(); return; }
    const rb = e.target.closest('[data-roll]');
    if (rb) {
      const i = +rb.dataset.roll, z = r.rolls[i];
      const extra = (z.riders || []).filter((_, j) => ticked.has(`${i}:${j}`)).map((q) => q.expr).filter(Boolean);
      let expr = [z.expr, ...extra].join('+');
      const damage = z.name === 'Damage';
      if (damage && critical) expr = criticalDice(expr);
      const d20 = /d20/.test(expr), result = await roll(`${r.label} ${z.name}`, expr, d20 ? mode : 'normal');
      if (!result) return;
      last = resultHTML(damage && critical ? 'Critical damage' : z.name, result);
      if (d20 && /attack/i.test(z.name)) critical = result.nat === 20;
      draw(); box.scrollTop = 0; $('.sheet-body', box).scrollTop = 0;
      if (req.kind === 'death') await applyDeath(result);
      return;
    }
    if (e.target.closest('[data-cast]')) { e.target.closest('[data-cast]').disabled = true; await castSpell(r); box.close(); }
  });
}
async function castSpell(r) {
  const l = Number(r.slot || r.level), used = Number(pc.spellcasting?.slots_used?.[l] || 0);
  await write(() => set(path(`spellcasting/slots_used/${l}`), used + 1));
  if (r.concentration) await write(() => update(path('combat'), { concentration: { active: true, spell: r.label, check: null } }));
  setTimeout(() => toast(`Cast ${esc(r.label)} (level ${l} slot).`, () => set(path(`spellcasting/slots_used/${l}`), used)), 0);
}
function applyDeath(r) { return write(() => runTransaction(path('combat'), (c) => { if (!c || Number(c.hp_current) !== 0) return c; if (r.nat === 20) return { ...c, hp_current: 1, death_saves: { success: 0, fail: 0 } }; const d = { success: count(c.death_saves?.success), fail: count(c.death_saves?.fail) }, k = r.nat >= 10 ? 'success' : 'fail'; d[k] = count(d[k] + (r.nat === 1 ? 2 : 1)); return { ...c, death_saves: d }; })); }
function diceSheet() {
  let mode = 'normal', last = '';
  const html = () => `<div data-result aria-live="polite">${last}</div>${modePicker(mode)}<div class="dice">${[4, 6, 8, 10, 12, 20, 100].map((s) => `<button data-die="${s}">d${s}</button>`).join('')}</div><form class="inline"><input id="dice-expr" placeholder="2d6+3" aria-label="Dice to roll" autocomplete="off"><button class="primary">Roll</button></form>`;
  const box = sheet('Dice', html());
  const show = async (label, expr) => {
    const result = await roll(label, expr, /d20/.test(expr) ? mode : 'normal');
    if (result) { last = resultHTML(label, result); $('[data-result]', box).innerHTML = last; }
  };
  box.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mode]'); if (m) { mode = m.dataset.mode; box.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b === m)); return; }
    const d = e.target.closest('[data-die]'); if (d) show('d' + d.dataset.die, '1d' + d.dataset.die);
  });
  box.addEventListener('submit', (e) => { e.preventDefault(); const v = $('#dice-expr', box).value.trim(); if (v) show(v, v); });
}

// ---------- hit points and status
async function changeHp(kind, amount) {
  const before = pc.combat || {}, undoTo = { hp_current: Number(before.hp_current) || 0, temp_hp: Number(before.temp_hp) || 0 };
  if (kind === 'damage' && db.damage) await write(() => db.damage(id, amount));
  else await write(() => runTransaction(path('combat'), (cc) => {
    if (!cc) return cc;
    const cur = Number(cc.hp_current) || 0, tmp = Math.max(0, Number(cc.temp_hp) || 0), hp = kind === 'heal' ? Math.min(Number(cc.hp_max) || 1, cur + amount) : Math.max(0, cur - Math.max(0, amount - tmp));
    return { ...cc, hp_current: hp, temp_hp: kind === 'heal' ? tmp : Math.max(0, tmp - amount), death_saves: hp > 0 ? { success: 0, fail: 0 } : cc.death_saves || { success: 0, fail: 0 } };
  }));
  toast(kind === 'heal' ? `Healed ${amount}.` : `Took ${amount} damage.`, async () => {
    await update(path('combat'), undoTo);
    // Undoing damage also withdraws the concentration save it asked for.
    const conc = pc.combat?.concentration;
    if (kind === 'damage' && conc?.check && !before.concentration?.check) await update(path('combat'), { concentration: { ...conc, check: null } });
  });
}
function hpSheet() {
  const c = pc.combat || {};
  const box = sheet(`Hit points${ask('hp')}`, `<div class="hp-now">${hpBar(c)}</div>
<label class="field">Amount<input id="hp-amount" type="number" min="1" step="1" inputmode="numeric" autofocus></label>
<div class="steps">${[1, 5, 10].map((n) => `<button data-step="${n}">+${n}</button>`).join('')}<button data-step="0">Clear</button></div>
<div class="buttons big"><button class="danger" data-hp="damage">Damage</button><button class="good" data-hp="heal">Heal</button></div>
<div class="buttons with-help"><button data-hp="temp">Set as temporary HP</button>${ask('temp')}</div>`);
  box.addEventListener('click', async (e) => {
    const input = $('#hp-amount', box);
    const step = e.target.closest('[data-step]');
    if (step) { input.value = +step.dataset.step ? (Number(input.value) || 0) + Number(step.dataset.step) : ''; return; }
    const b = e.target.closest('[data-hp]'); if (!b) return;
    const kind = b.dataset.hp, amount = Math.max(0, Math.trunc(Number(input.value) || 0));
    if (!amount && !(kind === 'temp' && input.value !== '')) { input.focus(); return toast('Enter an amount first.'); }
    box.close();
    try { if (kind === 'temp') { await write(() => set(path('combat/temp_hp'), amount)); toast(`Temporary HP set to ${amount}.`); } else await changeHp(kind, amount); }
    catch { /* write() already showed the reason */ }
  });
}
let statusBox = null;
function statusHTML() {
  const c = pc.combat || {}, have = new Set(list(c.conditions)), conc = c.concentration || {};
  return `${conc.active ? `<div class="line"><span>Concentrating on <b>${esc(conc.spell)}</b>${ask('concentration')}</span><button data-act="conc-drop">Stop</button></div>` : ''}
<div class="line"><span>Inspiration${ask('inspiration')}</span><button data-act="inspiration" aria-pressed="${!!c.inspiration}">${c.inspiration ? '★ Yes' : 'No'}</button></div>
<div class="line"><span>Exhaustion${ask('exhaustion')}</span><span class="stepper"><button data-act="exhaust" data-delta="-1" aria-label="Less exhaustion">−</button><b>${Number(c.exhaustion || 0)}</b><button data-act="exhaust" data-delta="1" aria-label="More exhaustion">+</button></span></div>
<h3>Conditions</h3>${D.conditions.map((x) => `<div class="condition"><label class="check"><input type="checkbox" data-cond="${esc(x.name)}" ${have.has(x.name) ? 'checked' : ''}><span>${esc(x.name)}</span></label>${fold(`cond:${x.name}`, `<span class="help" aria-label="What is ${esc(x.name)}?">?</span>`, rules(x.desc), 'mark')}</div>`).join('')}`;
}
function statusSheet() { statusBox = sheet(`Status${ask('status')}`, statusHTML()); statusBox.addEventListener('close', () => { statusBox = null; }); }
function coinsSheet() {
  const rows = () => ['pp', 'gp', 'ep', 'sp', 'cp'].map((k) => `<div class="line"><span>${{ pp: 'Platinum', gp: 'Gold', ep: 'Electrum', sp: 'Silver', cp: 'Copper' }[k]}</span><span class="stepper"><button data-coin="${k}" data-d="-1" aria-label="Remove one ${k}">−</button><input data-coin-value="${k}" type="number" min="0" step="1" inputmode="numeric" aria-label="${k}" value="${Number(pc.coin_purse?.[k] || 0)}"><button data-coin="${k}" data-d="1" aria-label="Add one ${k}">+</button></span></div>`).join('');
  const box = sheet('Coins', rows());
  const save = async (k, n) => { await write(() => update(path('coin_purse'), { [k]: Math.max(0, Math.trunc(n) || 0) })); $(`[data-coin-value="${k}"]`, box).value = Number(pc.coin_purse?.[k] || 0); };
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-coin]'); if (b) save(b.dataset.coin, Number($(`[data-coin-value="${b.dataset.coin}"]`, box).value) + Number(b.dataset.d)).catch(() => {}); });
  box.addEventListener('change', (e) => { const k = e.target.dataset?.coinValue; if (k) save(k, Number(e.target.value)).catch(() => {}); });
}

// ---------- rests and preparing
async function rest(long) {
  const c = pc.combat || {}, sc = pc.spellcasting, ups = { ...(long ? { hp_current: Number(c.hp_max) || 1, temp_hp: 0, exhaustion: Math.max(0, Number(c.exhaustion || 0) - 1), death_saves: { success: 0, fail: 0 } } : {}) };
  if (!confirm(long ? 'Take a long rest? HP, spell slots and most abilities come back.' : 'Take a short rest? Short-rest abilities come back.')) return;
  await write(async () => {
    if (long) { await update(path('combat'), ups); if (c.concentration?.active) await update(path('combat'), { concentration: { active: false, spell: '', check: null } }); if (sc?.slots_used) await update(path('spellcasting'), { slots_used: Array.from({ length: 10 }, (_, i) => (i ? 0 : null)) }); }
    for (const [k, a] of Object.entries(pc.abilities || {})) if (a?.kind === 'charge' && Number(a.current ?? a.max) < Number(a.max) && (long ? /long|short_or_long|short/.test(a.recharge || '') : /short/.test(a.recharge || ''))) await set(path(`abilities/${k}/current`), Number(a.max));
    await restEffects(pc, long);
  });
  toast(long ? 'Long rest done.' : 'Short rest done.');
  if (long && castInfo()?.prepared) setTimeout(prepareSheet, 300);
}
function prepareSheet() {
  const ci = castInfo(); if (!ci?.prepared) return;
  const always = alwaysSet(), cur = list(pc.spellcasting.spells), have = new Set(cur.filter((s) => s.level && !s.custom && !always.has(norm(s.name))).map((s) => norm(s.name)));
  const book = ci.cls === 'wizard' ? new Set(list(pc.spellcasting.spellbook).map(norm).concat([...have])) : null;
  const cand = D.spellList.filter((s) => s.level >= 1 && s.level <= ci.maxLevel && onList(s, ci.cls) && !always.has(norm(s.name)) && (!book || book.has(norm(s.name))));
  const sel = new Set(have);
  const html = () => `<p class="hint">Choose up to ${ci.limit} (${AL[ci.ability]} ${bon(ci.mc)} + level ${pc.level}). Always-ready spells do not count.${book ? ' Wizards choose from their spellbook.' : ''}</p>
${[...new Set(cand.map((s) => s.level))].sort().map((l) => `<h3>Level ${l}</h3>${cand.filter((s) => s.level === l).map((s) => `<label class="check"><input type="checkbox" data-sp="${esc(s.name)}" ${sel.has(norm(s.name)) ? 'checked' : ''}><span>${esc(s.name)}</span></label>`).join('')}`).join('')}
<div class="buttons sticky"><button class="primary" data-save ${sel.size > ci.limit ? 'disabled' : ''}>Save ${sel.size} of ${ci.limit}</button></div>`;
  const box = sheet('Prepare spells', html(), { className: 'tall' });
  box.addEventListener('change', (e) => {
    const n = e.target.dataset?.sp; if (!n) return;
    sel[e.target.checked ? 'add' : 'delete'](norm(n));
    const button = $('[data-save]', box); button.textContent = `Save ${sel.size} of ${ci.limit}`; button.disabled = sel.size > ci.limit;
  });
  box.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-save]') || sel.size > ci.limit) return;
    const sc = pc.spellcasting, atk = Number(sc.spell_attack_bonus) || 0, dc = Number(sc.spell_save_dc) || 0, keep = cur.filter((s) => !s.level || s.custom || always.has(norm(s.name)));
    const chosen = cand.filter((s) => sel.has(norm(s.name))).map((s) => cur.find((o) => norm(o.name) === norm(s.name)) || spellCard(s, 'prepared', atk, dc));
    const next = [...keep, ...chosen].sort((a, b) => a.level - b.level || String(a.name).localeCompare(String(b.name)));
    await write(() => update(path('spellcasting'), { spells: next })); box.close(); toast('Prepared spells saved.');
  });
}

// ---------- GM roll calls (players answer in their own companion)
const liveApi = () => { const r = (p) => ref(db, `geezvtt/live/${pc.campaign}/${p}`); return { txn: (p, fn) => runTransaction(r(p), fn).then((x) => x.committed), update: (p, o) => update(r(p), o), push: (p, o) => push(r(p), o) }; };
function followCall() {
  if (!pc?.campaign || callCamp === pc.campaign) return; callUnsub?.(); callCamp = pc.campaign;
  callUnsub = onValue(ref(db, `geezvtt/live/${callCamp}/rollcall`), (s) => {
    const c = s.val(), fresh = c?.id !== liveCall?.id;
    if (fresh) { callMode = c?.mode || 'normal'; callExtras = {}; }
    liveCall = c;
    if (fresh && c?.open && Object.hasOwn(c.to || {}, id)) navigator.vibrate?.([60, 80, 60]);
    render();
  });
}
function callBanner() {
  const c = liveCall; if (GM || !c || !c.open || !pc || !Object.hasOwn(c.to || {}, id)) return '';
  const done = c.results?.[id];
  if (done) return card('GM called a roll', `<p><b>${esc(callTitle(c))}</b>: you rolled <b>${esc(done.total)}</b>${c.showDc && c.dc ? (passed(c, done) ? ' · Pass' : ' · Fail') : ''}</p>`);
  const m = callMod(fx, c);
  return `<section class="card call" role="alert"><h2><b>GM called a roll${ask('call')}</b></h2><p class="call-title">${esc(callTitle(c))}${c.showDc && c.dc ? ' · DC ' + esc(c.dc) : ''}</p>
<p class="hint">d20 ${m.parts.map(([k, n]) => `${esc(sgn(n))} ${esc(k)}`).join(' ')}</p>${modePicker(callMode)}
${fold('call:extras', 'Add a bonus die', EXTRAS.map(([k, l, d]) => `<label class="check"><input type="checkbox" data-call-extra="${k}" ${callExtras[k] ? 'checked' : ''}><span>${esc(l)} +1d${d}</span></label>`).join(''), 'plain')}
<div class="buttons big"><button class="primary" data-act="call-roll">Roll ${esc(sgn(m.mod))}</button></div></section>`;
}

// ---------- GM screens
function gmStart() {
  gmUnsub.forEach((f) => f?.()); gmUnsub = [];
  gmUnsub.push(onValue(ref(db, 'characters/pcs'), (s) => { party = Object.fromEntries(Object.entries(s.val() || {}).filter(([i, x]) => x && x.name && i !== '__oracle__' && x.campaign !== '__oracle__' && x.type !== 'npc' && x.record_type !== 'npc').map(([i, x]) => [i, { ...x, id: i }])); const camps = campaigns(); if (!camps.includes(gmCamp)) gmCamp = camps[0] || ''; gmWatch(); render(); }));
}
const campaigns = () => [...new Set(Object.values(party).map((p) => p.campaign).filter(Boolean))].sort();
let gmWatching = '';
function gmWatch() {
  if (!gmCamp || gmWatching === gmCamp) return; gmWatching = gmCamp; gmUnsub.slice(1).forEach((f) => f?.()); gmUnsub = gmUnsub.slice(0, 1);
  gmUnsub.push(onValue(ref(db, `geezvtt/live/${gmCamp}/rollcall`), (s) => { liveCall = s.val(); render(); }));
  gmUnsub.push(onValue(ref(db, `geezvtt/live/${gmCamp}/rolls`), (s) => { gmRolls = Object.values(s.val() || {}).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 12); render(); }));
}
const members = () => Object.values(party).filter((p) => p.campaign === gmCamp).sort((a, b) => a.name.localeCompare(b.name));
function partyView() {
  const c = liveCall && gmCamp ? liveCall : null;
  const rows = members().map((p) => {
    const cc = effectivePC(p, D.ref).combat || {}, sl = p.spellcasting?.slots || [], us = p.spellcasting?.slots_used || [], conds = list(cc.conditions);
    return `<button class="card member" data-act="open-pc" data-id="${esc(p.id)}"><span class="line"><b>${esc(p.name)}</b><small>AC ${esc(cc.ac ?? '—')}</small></span>${hpBar(cc)}<small>${[1, 2, 3, 4, 5].filter((l) => sl[l]).map((l) => `L${l} ${sl[l] - (us[l] || 0)}/${sl[l]}`).join(' · ')}</small>${conds.length || cc.concentration?.active ? `<small>${esc([...conds, ...(cc.concentration?.active ? [`concentrating: ${cc.concentration.spell}`] : [])].join(', '))}</small>` : ''}</button>`;
  }).join('') || '<p class="empty">No characters in this campaign.</p>';
  return `<select id="gm-camp" aria-label="Campaign">${campaigns().map((x) => `<option ${x === gmCamp ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
<div class="buttons solo"><button class="primary" data-act="gm-call">Call a roll</button><button data-act="gm-give">Give item</button></div>
${c ? card(`${esc(callTitle(c))}${c.dc && c.showDc ? ' · DC ' + esc(c.dc) : ''}`, `${Object.values(c.results || {}).map((r) => `<div class="line"><span>${esc(r.name)}</span><span>${c.showDc && passed(c, r) !== null ? `<small>${passed(c, r) ? 'pass' : 'fail'}</small> ` : ''}<b>${esc(r.total)}</b></span></div>`).join('') || '<p class="hint">Waiting for answers…</p>'}<div class="buttons">${c.open ? '<button data-act="gm-close-call">Close the call</button>' : ''}</div>`) : ''}
${rows}
${card('Recent rolls', gmRolls.map((r) => `<div class="line"><span><b>${esc(r.by)}</b> ${esc(r.expr)}</span><b>${esc(r.total)}</b></div>`).join('') || '<p class="hint">No rolls yet.</p>')}`;
}
const whoBoxes = (checked) => members().map((p) => `<label class="check"><input type="checkbox" data-who="${esc(p.id)}" ${checked ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('');
function callSheet() {
  const keyOpts = (k) => k === 'skill' ? SKILLS.map(([a, l]) => `<option value="${a}">${l}</option>`).join('') : k === 'init' ? '' : AB.map((a) => `<option value="${a}">${ABIL[a]}</option>`).join('');
  const box = sheet('Call a roll', `<label class="field">Kind<select id="c-kind"><option value="init">Initiative</option><option value="save">Saving throw</option><option value="skill">Skill check</option><option value="ability">Ability check</option></select></label><label class="field">Which<select id="c-key"></select></label><label class="field">DC<input id="c-dc" type="number" inputmode="numeric" placeholder="optional"></label><label class="check"><input id="c-show" type="checkbox"><span>Show the DC to players</span></label><label class="field">Mode<select id="c-mode"><option value="normal">Normal</option><option value="adv">Advantage</option><option value="dis">Disadvantage</option></select></label><h3>Who</h3>${whoBoxes(true)}<div class="buttons sticky"><button class="primary" data-send>Call it</button></div>`, { className: 'tall' });
  const fill = () => { $('#c-key', box).innerHTML = keyOpts($('#c-kind', box).value); $('#c-key', box).disabled = $('#c-kind', box).value === 'init'; }; fill();
  box.addEventListener('change', (e) => { if (e.target.id === 'c-kind') fill(); });
  box.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-send]')) return;
    const to = {}; box.querySelectorAll('[data-who]').forEach((b) => { if (b.checked) to[b.dataset.who] = party[b.dataset.who].name; });
    if (!Object.keys(to).length) return toast('Pick at least one character.');
    const call = newCall({ kind: $('#c-kind', box).value, key: $('#c-key', box).value, dc: $('#c-dc', box).value, showDc: $('#c-show', box).checked, mode: $('#c-mode', box).value, to });
    await write(() => set(ref(db, `geezvtt/live/${gmCamp}/rollcall`), call)); box.close(); toast('Roll called.');
  });
}
function giveSheet() {
  const box = sheet('Give item', `<label class="field">Item<input id="g-name" list="g-names" autocomplete="off"></label><datalist id="g-names">${[...Object.values(D.equip), ...Object.values(D.magic)].map((i) => `<option value="${esc(i.name)}">`).join('')}</datalist><label class="field">Quantity<input id="g-qty" type="number" min="1" value="1"></label><h3>Who</h3>${whoBoxes(false)}<div class="buttons sticky"><button class="primary" data-send>Give</button></div>`, { className: 'tall' });
  box.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-send]')) return;
    const name = $('#g-name', box).value.trim(), qty = Math.max(1, parseInt($('#g-qty', box).value, 10) || 1), ids = [...box.querySelectorAll('[data-who]')].filter((b) => b.checked).map((b) => b.dataset.who);
    if (!name || !ids.length) return toast('Name an item and pick someone.');
    for (const cid of ids) await write(async () => {
      const invRef = ref(db, `characters/pcs/${cid}/inventory`), cur = Object.entries((await get(invRef)).val() || {}).filter(([, v]) => v && v.name), hit = cur.find(([, v]) => norm(v.name) === norm(name));
      if (hit) await update(ref(db, `characters/pcs/${cid}/inventory/${hit[0]}`), { qty: (Number(hit[1].qty ?? 1) || 1) + qty }); else { const info = itemInfo(name); await push(invRef, { name: info.name || name, qty, given_by: 'GM', given_at: Date.now() }); }
    });
    box.close(); toast(`Gave ${esc(name)} x${qty}.`);
  });
}
async function levelUpSheet() {
  const eid = db.ids?.().oldToNew?.[id]; if (!eid) return toast('Could not find this character in the new database.');
  const [raw, cl, cs] = await Promise.all([fetch(`${ENTITIES}/${eid}.json`).then((r) => r.json()), fetch('data/class_levels.json').then((r) => r.json()), fetch('data/classes.json').then((r) => r.json())]);
  if ((raw.data.level || 1) >= 20) return toast('Already level 20.');
  if (raw.data.spellcasting?.spells) raw.data.spellcasting.spells = asList(raw.data.spellcasting.spells);
  const plan = planCharacter(raw.data, (raw.data.level || 1) + 1, { classLevels: cl, classes: cs, spells: D.spellList, skills: D.skills }, D.custom);
  const lines = (items) => items.map((l) => `<p class="rule">${esc(l)}</p>`).join('');
  const box = sheet(`${esc(raw.name)}: level ${esc(raw.data.level)} → ${esc(plan.data.level)}`, `${lines(plan.log)}${plan.choices.length ? `<h3>You still choose</h3>${lines(plan.choices)}` : ''}${plan.review.length ? `<h3>Check by hand</h3>${lines([...new Set(plan.review)])}` : ''}<div class="buttons sticky"><button class="primary" data-apply>Level up</button></div>`, { className: 'tall' });
  box.addEventListener('click', async (e) => {
    const apply = e.target.closest('[data-apply]'); if (!apply) return; apply.disabled = true;
    await write(async () => {
      const put = async (u, body, method) => { const r = await fetch(u, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw Error(`${method} failed: ${r.status}`); };
      for (const k of plan.changed) { const a = plan.data[k], b = raw.data[k]; if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) await put(`${ENTITIES}/${eid}/data/${k}.json`, Object.fromEntries(Object.entries(a).filter(([kk, v]) => JSON.stringify(v) !== JSON.stringify(b[kk]))), 'PATCH'); else await put(`${ENTITIES}/${eid}/data/${k}.json`, a, 'PUT'); }
      await put(`${ENTITIES}/${eid}/meta.json`, { updated_at: new Date().toISOString(), updated_by: 'companion-gm' }, 'PATCH');
    });
    box.close(); toast('Leveled up.');
  });
}

// ---------- picker and loading a character
// Everyone in this character's campaign, for handing items over and sharing potions.
async function campaignMembers() {
  const all = Object.entries((await get(ref(db, 'characters/pcs'))).val() || {});
  return all.filter(([, x]) => x?.name && x.campaign === pc.campaign && x.type !== 'npc' && x.record_type !== 'npc')
    .map(([sid, x]) => ({ eid: db.ids?.().oldToNew?.[sid] || sid, name: x.name })).sort((a, b) => a.name.localeCompare(b.name));
}
const problem = (message) => { app.innerHTML = `<div class="empty"><p>${esc(message)}</p><div class="buttons"><button class="primary" data-act="reload">Try again</button><button data-act="picker">Choose a character</button></div></div>`; };
function picker() {
  app.innerHTML = '<div class="picker"><h1>Who are you playing?</h1><div id="pick-list">Loading…</div></div>';
  get(ref(db, 'characters/pcs')).then((s) => {
    const all = Object.entries(s.val() || {}).map(([i, x]) => ({ ...x, id: i })).filter((x) => x.name && x.id !== '__oracle__' && x.campaign !== '__oracle__' && x.type !== 'npc' && x.record_type !== 'npc').sort((a, b) => a.name.localeCompare(b.name));
    const slot = $('#pick-list'); if (!slot) return;
    slot.innerHTML = [...new Set(all.map((x) => x.campaign || ''))].sort().map((camp) => `<h2>${esc(camp || 'Other')}</h2>${all.filter((x) => (x.campaign || '') === camp).map((x) => `<button class="card member" data-act="pick" data-id="${esc(x.id)}"><b>${esc(x.name)}</b><small>Level ${esc(x.level ?? '?')} ${esc(x.class || '')}</small></button>`).join('')}`).join('') || '<p>No characters found.</p>';
  }).catch((e) => problem('Could not load characters: ' + e.message));
}
function select(cid) {
  id = cid; store.set('companion.char', id); history.replaceState(null, '', location.pathname + `?char=${encodeURIComponent(id)}` + (GM ? '&gm=jonny' : '') + location.hash);
  if (db.selectPC && !GM) db.selectPC(id); unsubPc?.(); pc = null; view = 'char'; opened.clear(); search = '';
  app.innerHTML = '<p class="empty">Loading your character…</p>';
  unsubPc = onValue(ref(db, 'characters/pcs/' + id), (s) => {
    pc = s.val() ? { ...s.val(), id } : null; fx = effectivePC(pc, D.ref);
    if (!pc) { toast('That character was not found.'); return picker(); }
    document.title = pc.name + ' · Companion'; followCall(); onCharacter(pc, db.ids?.().oldToNew?.[id] || id); render();
    if (statusBox) {   // keep the status sheet current without losing the control in use
      const used = document.activeElement?.dataset, key = used?.cond ? `[data-cond="${used.cond}"]` : used?.act ? `[data-act="${used.act}"][data-delta="${used.delta ?? ''}"], [data-act="${used.act}"]` : '';
      $('.sheet-body', statusBox).innerHTML = statusHTML();
      if (key) $(key, statusBox)?.focus({ preventScroll: true });
    }
  }, (e) => problem('Lost contact with your character: ' + e.message));
}

// ---------- render
const typing = () => { const a = document.activeElement; return !!a && app.contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.type === 'search'); };
// Live updates replace the page, so remember which control had focus and give it back.
const focusKey = (el) => (el && app.contains(el) && el.tagName === 'BUTTON' ? el.outerHTML.replace(/ aria-pressed="\w+"| class="[^"]*"/g, '').slice(0, 300) : '');
function filter() {
  const q = search.trim().toLowerCase();
  app.querySelectorAll('[data-search]').forEach((el) => { el.hidden = !!q && !el.dataset.search.includes(q); });
  app.querySelectorAll('main .card').forEach((c) => { const rows = c.querySelectorAll('[data-search]'); if (rows.length) c.hidden = [...rows].every((r) => r.hidden); });
}
function render() {
  if (typing()) { dirty = true; return; } dirty = false;
  const held = focusKey(document.activeElement);
  if (GM && view === 'party') app.innerHTML = `<header class="top"><div class="top-row"><b class="title">Party</b><small>GM</small></div></header><main>${partyView()}</main>`;
  else if (!pc) return;
  else {
    if (tab === 'spells' && !casts()) tab = 'play';
    const body = { play: playTab, spells: spellsTab, skills: skillsTab, bag: () => bagTab(pc, fx, search), me: meTab }[tab];
    app.innerHTML = `${header()}<main>${urgent()}${body()}</main>${tabsBar()}`;
    filter();
  }
  if (held) [...app.querySelectorAll('button')].find((b) => focusKey(b) === held)?.focus({ preventScroll: true });
}
document.addEventListener('focusout', () => setTimeout(() => { if (dirty && !typing()) render(); }, 60));
function goTab(name) { tab = name; search = ''; history.replaceState(null, '', `#${tab}`); render(); window.scrollTo(0, 0); }

// ---------- keeping the screen on, and saying when the phone is offline
let wake = null;
async function stayAwake() {
  const wanted = store.get('companion.awake') === '1' && document.visibilityState === 'visible';
  try {
    if (wanted && !wake) { wake = await navigator.wakeLock?.request('screen'); wake?.addEventListener('release', () => { wake = null; }); }
    else if (!wanted && wake) await wake.release();
  } catch { /* the phone may refuse, for example in battery saver */ }
}
document.addEventListener('visibilitychange', stayAwake);
// A phone may still hold the previous page for a few minutes after an update, so the banner is optional.
const online = () => { const banner = $('#offline'); if (banner) banner.hidden = navigator.onLine !== false; };
addEventListener('online', online); addEventListener('offline', online);

// ---------- events
document.addEventListener('input', (e) => { if (e.target.matches('.search')) { search = e.target.value; filter(); } });
document.addEventListener('change', async (e) => {
  const target = e.target;
  const k = target.dataset?.callExtra; if (k) callExtras[k] = target.checked;
  try {
    if (await extraChange(target)) return;
    if (target.dataset?.cond) { const n = target.dataset.cond; await write(() => update(path('combat'), { conditions: [...list(pc.combat?.conditions).filter((x) => x !== n), ...(target.checked ? [n] : [])] })); }
    if (target.id === 'stay-awake') { store.set('companion.awake', target.checked ? '1' : '0'); stayAwake(); }
    if (target.id === 'gm-camp') { gmCamp = target.value; store.set('companion.gmCamp', gmCamp); gmWatching = ''; gmWatch(); target.blur(); render(); }
    if (target.id === 'my-notes') { await write(() => set(path('text_blocks/player_notes'), target.value)); toast('Notes saved.'); }
  } catch { /* write() already showed the reason */ }
});
document.addEventListener('click', async (e) => {
  const rq = e.target.closest('[data-req]');
  if (rq) { try { rollSheet(JSON.parse(rq.dataset.req)); } catch (err) { toast(esc(err.message)); } return; }
  const call = e.target.closest('.call [data-mode]'); if (call) { callMode = call.dataset.mode; render(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act, c = pc?.combat || {};
  try {
    if (await extraAction(a, b)) return;
    if (await bagAction(a, b)) return;
    if (a === 'tab') return goTab(b.dataset.tab);
    if (a === 'reload') return location.reload();
    if (a === 'picker') { pc = null; unsubPc?.(); picker(); return; }
    if (a === 'pick' || a === 'open-pc') return select(b.dataset.id);
    if (a === 'party') { view = 'party'; render(); return; }
    if (a === 'dice') return diceSheet();
    if (a === 'hp') return hpSheet();
    if (a === 'status') return statusSheet();
    if (a === 'coins' && GM) return coinsSheet();
    if (a === 'inspiration') return void await write(() => update(path('combat'), { inspiration: !c.inspiration }));
    if (a === 'exhaust') return void await write(() => update(path('combat'), { exhaustion: Math.max(0, Math.min(6, Number(c.exhaustion || 0) + Number(b.dataset.delta))) }));
    if (a === 'slot') { const l = b.dataset.level, u = Number(pc.spellcasting?.slots_used?.[l] || 0), max = Number(pc.spellcasting?.slots?.[l] || 0); return void await write(() => set(path(`spellcasting/slots_used/${l}`), b.dataset.spent === 'true' ? Math.max(0, u - 1) : Math.min(max, u + 1))); }
    if (a === 'charge') { const k = b.dataset.key, ab = pc.abilities?.[k], n = Number(b.dataset.n), cur = Number(ab.current ?? ab.max ?? 0); return void await write(() => set(path(`abilities/${k}/current`), cur >= n ? n - 1 : n)); }
    if (a === 'death') return void await write(() => runTransaction(path('combat'), (cc) => { if (!cc || Number(cc.hp_current) !== 0) return cc; const d = cc.death_saves || {}, k = b.dataset.kind, n = Number(b.dataset.n); return { ...cc, death_saves: { success: count(d.success), fail: count(d.fail), [k]: count(d[k]) >= n ? n - 1 : n } }; }));
    if (a === 'conc-keep') return void await write(() => update(path('combat'), { concentration: { ...c.concentration, check: null } }));
    if (a === 'conc-drop') return void await write(() => update(path('combat'), { concentration: { active: false, spell: '', check: null } }));
    if (a === 'long-rest') return void await rest(true);
    if (a === 'short-rest') return void await rest(false);
    if (a === 'prepare') return prepareSheet();
    if (a === 'call-roll') { b.disabled = true; try { const r = await answerCall(liveApi(), liveCall, id, { name: pc.name, charId: id, c: fx, mode: callMode, extras: callExtras }); if (r) { const shown = rollRecord(callTitle(liveCall), r); toTable(shown); await showDice(shown); } toast(r ? `<b>${esc(callTitle(liveCall))}</b>: ${esc(r.total)} (${esc(r.detail)})` : 'Someone already answered, or the call closed.'); } finally { b.disabled = false; } return; }
    if (a === 'gm-call') return callSheet();
    if (a === 'gm-give') return giveSheet();
    if (a === 'gm-close-call') return void await write(() => update(ref(db, `geezvtt/live/${gmCamp}/rollcall`), { open: false }));
    if (a === 'gm-levelup') return void await levelUpSheet();
  } catch (err) { toast(esc(err.message)); }
});
addEventListener('hashchange', () => { const name = tabFromHash(); if (name && name !== tab) goTab(name); });

// ---------- start
online(); stayAwake(); watchRolls(() => pc?.campaign || (GM ? gmCamp : ''));
try {
  await loadData();
  initExtras({ GM, D, toast, write, sheet });
  initBag({ D, GM, write, roll, party: campaignMembers, state: () => ({ pc, fx, eid: db.ids?.().oldToNew?.[id] || id }) });
  if (GM) gmStart();
  const chosen = params.get('char') || (GM ? null : store.get('companion.char'));
  if (chosen) select(chosen); else if (GM) render(); else picker();
} catch (error) { problem('The companion could not start: ' + error.message); }
