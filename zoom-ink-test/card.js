// The card: what the campaign board used to show, opened in place. Tap
// a place, a battlemap or a token to open its card beside it. GM sees everything and can edit and
// reroll; players see only the public parts (no hidden power, secrets, hooks, treasure or notes).
import { KINDS, KIND_LIST, SECTIONS, tiersOf, rollLore, rollSection, radiusFor, oldRadiusFor, summary, governmentOf, FACTION_LABEL } from './lore.js';
import { PAL } from './style.js';
import { statSections } from './encounters.js';
import { saleLine } from './rollers.js';
import { findText } from './shops.js';
import { nameRelic } from './relics.js';

const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style') e.style.cssText = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) e.append(c); return e; };
const clone = o => JSON.parse(JSON.stringify(o));
const newSeed = () => Math.floor(Math.random() * 1e9);
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

// Factions are shared across the world: a new one rolled into a place is added to data.factions.
export function registerFactions(world, L) {
  const list = world.data.factions ||= [];
  for (const f of [L?.faction, L?.hidden]) if (f?.id && f.type !== 'beasts' && f.type !== 'family' && !list.some(q => q.id === f.id)) list.push({ id: f.id, type: f.type, name: f.name });
}
// Every settlement gets lore once (old saves and the starter world).
export function ensureLore(world) {
  let n = 0;
  for (const S of world.data.settlements) if (!S.lore) { S.lore = rollLore(world, S, S.seed || 1); registerFactions(world, S.lore); n++; }
  // realistic sizes: grow places whose radius still comes from the old rule
  for (const S of world.data.settlements) if (S.lore?.pop != null && S.r === oldRadiusFor(S.kind, S.lore.pop)) S.r = radiusFor(S.kind, S.lore.pop);
  return n;
}

export class Card {
  constructor(app) {
    this.app = app; this.ref = null;
    this.el = h('div', { id: 'card', class: 'panel', hidden: true });
    this.el.addEventListener('pointerdown', e => e.stopPropagation());
    this.el.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
    document.body.append(this.el);
  }
  get item() {
    const r = this.ref; if (!r) return null;
    if (r.key === 'building') return this.app.buildings.building(r.id);
    if (r.key === 'person') { const P = this.app.buildings.person(r.id); return P ? { ...P, x: P.building.x, z: P.building.z } : null; }
    return this.app.world.data[r.key]?.find(p => p.id === r.id) || null;
  }
  open(key, id) { this.ref = { key, id }; this.el.hidden = false; this.render(); this.frame(true); this.app.ui.layoutNavigation(); }
  close() { if (!this.ref) return false; this.ref = null; this.el.hidden = true; this.el.replaceChildren(); this.app.ui.layoutNavigation(); return true; }
  isOpen(key, id) { return !!this.ref && this.ref.key === key && this.ref.id === id; }

  // ---------- editing ----------
  // Changes that rebuild the place in 3D go through updatePin; notes and token fields are light edits.
  patchPin(patch) { const r = this.ref; this.app.tools.updatePin(r.key, r.id, patch); this.render(); }
  patchLight(patch) {
    const r = this.ref, app = this.app;
    app.tools.edit(r.key, l => Object.assign(l.find(p => p.id === r.id), patch), () => { if (r.key === 'tokens') app.maps.refreshTokens(); app.save(); app.request(); if (this.ref) this.render(); });
  }
  reroll(section) {
    const S = this.item, w = this.app.world, L = clone(S.lore || {});
    rollSection(w, S, L, section, newSeed()); registerFactions(w, L);
    this.patchPin(section === 'size' ? { lore: L, r: radiusFor(S.kind, L.pop) } : { lore: L });
  }
  rollAll(kind = this.item.kind, tier = null) {
    const S = { ...this.item, kind }, w = this.app.world, L = rollLore(w, S, newSeed(), tier);
    L.notes = this.item.lore?.notes || ''; registerFactions(w, L);
    this.patchPin({ kind, lore: L, r: radiusFor(kind, L.pop) });
  }
  setTier(tier) {
    const S = this.item, L = clone(S.lore || {});
    rollSection(this.app.world, S, L, 'size', newSeed(), null, tier);
    this.patchPin({ lore: L, r: radiusFor(S.kind, L.pop) });
  }

  // ---------- drawing ----------
  render() {
    const p = this.item; if (!p) { this.close(); return; }
    const gm = this.app.role === 'gm', k = this.ref.key;
    const body = k === 'settlements' ? this.placeBody(p, gm) : k === 'tokens' ? this.tokenBody(p, gm) : k === 'building' ? this.buildingBody(p, gm) : k === 'person' ? this.personBody(p, gm) : this.mapBody(p, gm);
    const worldRefs=gm?this.app.canon?.groundCard(k,p)||[]:[];
    const keep = this.el.querySelector('.cbody')?.scrollTop || 0;
    this.el.replaceChildren(
      h('div', { class: 'chead' },
        k === 'person' ? h('div', { class: 'ctitle' }, p.name)
          : gm ? h('input', { class: 'ctitle', value: p.name, onchange: e => (k === 'tokens' ? this.patchLight({ name: e.target.value }) : k === 'building' ? this.app.buildings.patchBuilding(this.ref.id, { name: e.target.value }) : this.patchPin({ name: e.target.value })) }) : h('div', { class: 'ctitle' }, p.name),
        p.building || k === 'building' ? h('button', { class: 'cx', title: 'Back', onclick: () => k === 'person' ? this.open('building', p.building.id) : this.open('settlements', p.settlement.id) }, '‹') : null,
        h('button', { class: 'cx', title: 'Close (Esc)', onclick: () => this.close() }, '×')),
      h('div', { class: 'cbody' }, body, worldRefs.length?this.section('In the world',null,false,this.app.canon.links(worldRefs)):null));
    this.el.querySelector('.cbody').scrollTop = keep;
  }
  section(title, sec, gm, ...rows) {
    rows = rows.flat().filter(Boolean); if (!rows.length) return null;
    return h('div', { class: 'csec' },
      h('div', { class: 'csh' }, h('span', {}, title), gm && sec ? h('button', { class: 'die', title: `Reroll ${title.toLowerCase()}`, onclick: () => this.reroll(sec) }, '🎲') : null),
      rows);
  }
  row(k, v) { return v == null || v === '' ? null : h('div', { class: 'crow' }, h('span', { class: 'ck' }, k), h('span', { class: 'cv' }, String(v))); }

  placeBody(S, gm) {
    const L = S.lore || {}, site = KINDS[S.kind]?.group === 'site', w = this.app;
    const person = (n, secret) => h('div', { class: 'cnpc' },
      h('b', {}, n.name), ` (${n.race}${n.role ? ', ' + n.role : ''}), ${n.trait}.`,
      n.want ? h('div', { class: 'dim' }, cap(n.want.replace(/^(?!wants )/, 'wants ')) + '.') : null,
      secret && n.secret ? h('div', { class: 'gmonly' }, `Secret: ${cap(n.secret)}.`) : null);
    return [
      h('div', { class: 'csub' }, `${KINDS[S.kind]?.label || S.kind} · ${summary(S)}`),
      h('div', { class: 'crowbtn' },
        gm ? h('button', { class: 'chip' + (S.known ? ' on' : ''), title: 'Players can see it', onclick: () => this.patchPin({ known: !S.known }) }, S.known ? 'Known' : 'Hidden') : null,
        h('button', { class: 'chip', onclick: () => w.tools.flyToPin('settlements', S) }, 'Go'),
        gm ? h('button', { class:'chip', onclick:()=>w.buildings.placeExistingPeople(S.id) }, 'Place town NPCs') : null,
        gm ? h('button', { class: 'chip', title: 'Roll everything again (keeps notes)', onclick: () => this.rollAll() }, '🎲 Roll all') : null),
      gm ? h('div', { class: 'crowbtn' },
        h('select', { title: 'Kind', onchange: e => this.rollAll(e.target.value) }, KIND_LIST.map(q => h('option', { value: q, selected: q === S.kind }, KINDS[q].label))),
        h('select', { title: 'Size', onchange: e => this.setTier(e.target.value) }, tiersOf(S.kind).map(t => h('option', { value: t.id, selected: t.id === L.tier }, t.label)))) : null,
      this.section('Overview', 'size', gm,
        this.row('Known for', (L.knownFor || []).join(', ')),
        this.row('Mood', L.mood ? cap(L.mood) + (L.moodWhy ? ` — ${L.moodWhy}` : '') : null)),
      this.section('Who rules', 'faction', gm,
        this.row('Government', L.faction ? governmentOf(L) : null),
        this.row('Faction', L.faction ? `${L.faction.name} (${FACTION_LABEL(L.faction.type)})` : null),
        L.ruler ? person(L.ruler, gm) : null,
        gm && L.hidden ? h('div', { class: 'gmonly' }, `Hidden power: ${L.hidden.name} (${FACTION_LABEL(L.hidden.type)}) — ${L.hidden.what}`) : null),
      gm&&L.conspiracy?this.section('Shared town secret',null,false,h('div',{class:'gmonly'},L.conspiracy.name+': '+L.conspiracy.secret)):null,
      this.section('Defences', 'defense', gm,
        this.row('Walls', L.defense === 'wall' ? 'Stone wall' : L.defense === 'palisade' ? 'Palisade' : L.defense ? 'None' : null),
        this.row('Towers', L.towers || null), this.row('Guards', L.guards || null)),
      site
        ? this.section('Inside', 'buildings', gm,
          gm ? (L.rooms || []).map(r => h('div', { class: 'cli' }, r)) : null,
          gm ? this.row('Dwellers', L.dwellers) : null, gm ? this.row('Threat', L.threat) : null,
          gm && L.treasure ? h('div', { class: 'gmonly' }, `Treasure: ${L.treasure.join('; ')}`) : null)
        : this.section('Buildings', 'buildings', gm, (L.buildings || []).map(b => h('div', { class: 'cli' }, h('b', {}, b.name), ` — ${b.label}`, h('div', { class: 'dim' }, b.owner)))),
      this.section('People', 'npcs', gm, (L.npcs || []).map(n => person(n, gm))),
      this.section('Atmosphere', 'flavour', gm,
        L.atmosphere ? h('div', { class: 'cli' }, L.atmosphere) : null,
        L.oddity ? this.row('Oddity', L.oddity) : null,
        L.danger ? this.row('Danger', L.danger) : null),
      this.section('Rumours', gm ? 'hooks' : null, gm, (L.rumours || []).map(r => h('div', { class: 'cli' }, `“${r}”`))),
      gm && L.hooks?.length ? h('div', { class: 'chook' }, h('div', { class: 'csh' }, h('span', {}, 'Hooks'), h('button', { class: 'die', title: 'Reroll hooks and rumours', onclick: () => this.reroll('hooks') }, '🎲')), L.hooks.map(x => h('div', { class: 'cli' }, x))) : null,
      gm ? this.notes(L.notes || '', v => this.patchLight({ lore: { ...clone(S.lore || {}), notes: v } })) : null,
    ];
  }
  tokenBody(t, gm) {
    if(gm&&t.entity&&!t.person&&this.app.canon.get(t.entity))return [h('button',{class:'chip',onclick:()=>this.app.canon.show(t.entity)},'Open saved NPC'),...this.tokenBody({...t,entity:null},gm)];
    if (t.person && this.app.buildings.person(t.person)) return [h('button', { class: 'chip', onclick: () => this.open('person', t.person) }, `Open ${t.name}'s card`), ...this.tokenBody({ ...t, person: null }, gm)];
    const pc = t.kind === 'pc', mon = t.kind === 'monster';
    const hpShown = gm || pc;
    return [
      h('div', { class: 'csub' }, `${pc ? 'Player character' : mon ? 'Monster' : 'NPC'} - Square ${t.sx}, ${t.sz}`),
      gm ? h('div', { class: 'crowbtn' },
        h('button', { class: 'chip' + (pc ? ' on' : ''), onclick: () => this.patchLight({ kind: pc ? 'npc' : 'pc' }) }, pc ? 'PC' : 'NPC'),
        h('div', { class: 'colors' }, PAL.tokens.map(c => h('button', { class: 'dot' + (t.color === c ? ' on' : ''), style: `background:${c}`, onclick: () => this.patchLight({ color: c }) })))) : null,
      hpShown ? h('div', { class: 'csec' }, h('div', { class: 'csh' }, h('span', {}, 'Hit points')),
        gm ? h('div', { class: 'crowbtn' },
          h('input', { class: 'num', type: 'number', value: t.hp ?? '', placeholder: 'HP', onchange: e => this.patchLight({ hp: e.target.value === '' ? null : +e.target.value }) }),
          h('span', { class: 'dim' }, '/'),
          h('input', { class: 'num', type: 'number', value: t.maxHp ?? '', placeholder: 'max', onchange: e => this.patchLight({ maxHp: e.target.value === '' ? null : +e.target.value }) }))
          : this.row('HP', t.hp != null ? `${t.hp}${t.maxHp ? ' / ' + t.maxHp : ''}` : '—')) : null,
      ...(gm && t.mon ? statSections(t.mon) : []).map(s => h('div', { class: 'csec gm' }, h('div', { class: 'csh' }, h('span', {}, s.t), h('span', { class: 'gmtag' }, 'GM')),
        (s.rows || []).filter(([, v]) => v !== '' && v != null).map(([k, v]) => this.row(k, String(v))), (s.list || []).map(x => h('div', { class: 'cli' }, x)))),
      gm ? this.notes(t.notes || '', v => this.patchLight({ notes: v })) : null,
    ];
  }
  // ---------- every building is real (phase G) ----------
  buildingBody(B, gm) {
    const bs = this.app.buildings, key = this.ref.id;
    const cellar=gm&&!this.app.underground?.active?h('button',{class:'chip',onclick:()=>this.app.underground.configureBuilding(key)},'Add cellar / link underground'):null;
    const interior=h('button',{class:'chip on',onclick:()=>this.app.interiors.enter(key)},'Look inside');
    if (B.plain) return [
      h('div', { class: 'csub' }, `An ordinary house in ${B.settlement.name}`),
      interior,cellar,
      h('div', { class: 'dim' }, 'Nobody of note lives here.'),
      gm ? h('div', { class: 'crowbtn' },
        h('button', { class: 'chip on', title: 'Roll this house as a real building with people', onclick: () => bs.setSpecial(key, true) }, '✨ Make special'),
        h('button', { class: 'chip' + (B.marked ? ' on' : ''), title: 'Show its name on the map', onclick: () => bs.patchBuilding(key, { marked: !B.marked }) }, B.marked ? '📍 Marked' : '📍 Mark')) : null,
      gm ? this.notes(B.notes, v => bs.patchBuilding(key, { notes: v })) : null,
    ];
    return [
      h('div', { class: 'csub' }, `${B.label} in ${B.settlement.name} · ${B.people.length} ${B.people.length === 1 ? 'person' : 'people'}`),
      interior,cellar,
      gm ? h('div', { class: 'crowbtn' },
        h('button', { class: 'chip', title: 'Roll this building again (new people)', onclick: () => bs.rerollBuilding(key) }, '🎲 Reroll'),
        h('button', { class: 'chip', onclick: () => bs.addPerson(key) }, '+ Person'),
        B.people.length ? h('button', { class: 'chip', title: 'Tokens of everyone here, outside the door', onclick: () => bs.placeEveryone(key) }, 'Place everyone') : null,
        h('button', { class: 'chip' + (B.marked ? ' on' : ''), title: 'Show this building\'s name on the map', onclick: () => bs.patchBuilding(key, { marked: !B.marked }) }, B.marked ? '📍 Marked' : '📍 Mark'),
        h('button', { class: 'chip', title: 'Make this an ordinary house again', onclick: () => bs.setSpecial(key, false) }, 'Make ordinary')) : null,
      h('div', { class: 'csec' }, h('div', { class: 'csh' }, h('span', {}, 'Who is here')),
        B.people.length ? B.people.map(p => h('button', { class: 'plink', onclick: () => this.open('person', p.id) }, h('b', {}, p.name), ` — ${p.race} ${p.role}${p.demeanour ? ', ' + p.demeanour : ''}`)) : h('div', { class: 'dim' }, 'No one.')),
      B.stock?.length ? h('div', { class: 'csec' }, h('div', { class: 'csh' }, h('span', {}, 'For sale')),
        B.stock.map(s => h('div', { class: 'cli' + (s.magic ? ' magic' : '') }, saleLine(s), gm && s.find ? h('span', { class: 'gmtag' }, 'really: ' + B.find.n) : null))) : null,
      gm ? h('div', { class: 'gmonly' }, `Inside: ${B.inside}`) : null,
      gm && B.find ? h('div', { class: 'chook' }, h('div', { class: 'csh' }, h('span', {}, '✦ Rare find'), h('span', { class: 'gmtag' }, 'GM')), h('div', { class: 'cli' }, findText(B.find, B.people[0]?.first || 'The owner')), this.nameBtn(B.find, `in ${B.name}, a ${B.label.toLowerCase()} in ${B.settlement.name}`)) : null,
      gm && B.hook ? h('div', { class: 'chook' }, h('div', { class: 'csh' }, h('span', {}, 'Hook')), h('div', { class: 'cli' }, B.hook)) : null,
      gm ? this.notes(B.notes, v => bs.patchBuilding(key, { notes: v })) : null,
    ];
  }
  // a one-of-a-kind find: ask the local model for its name and lore
  nameBtn(F, where) {
    if (!F.relic) return null;
    return h('div', { class: 'crowbtn' }, h('button', { class: 'chip', title: 'Ask the local model (Ollama) for a name and lore', onclick: async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = '✨ Naming…';
      try { this.app.setRelicName(F.relic.key, await nameRelic(F.relic, where)); this.render(); }
      catch (err) { this.app.ui.toast(err.message || 'Naming failed'); b.disabled = false; b.textContent = '✨ Name it'; }
    } }, F.relic.named ? '✨ Rename' : '✨ Name it'));
  }
  personBody(P, gm) {
    const bs = this.app.buildings, id = this.ref.id;
    const F = [['gender', 'Gender'], ['first', 'First name'], ['last', 'Last name'], ['race', 'Race'], ['age', 'Age'], ['role', 'Role'], ['demeanour', 'Demeanour'], ['hair', 'Hair'], ['clothing', 'Clothing'], ['armour', 'Armour'], ['weapon', 'Weapon'], ['backstory', 'Backstory'], ['secret', 'Secret', true], ['stats', 'Stat block', true]];
    const field = ([k, label, secret]) => {
      if (!gm) return secret ? null : this.row(label, P[k] || '—');
      const set = v => { const patch = { [k]: v || null }; if (k === 'first' || k === 'last') { const f = k === 'first' ? v : P.first, l = k === 'last' ? v : P.last; patch.name = l ? `${f} ${l}` : f; } bs.patchPerson(id, patch); };
      const long = k === 'backstory' || k === 'secret';
      return h('div', { class: 'pfield' + (secret ? ' gmf' : '') }, h('span', { class: 'ck' }, label),
        long ? h('textarea', { rows: 2, onchange: e => set(e.target.value) }, P[k] || '') : h('input', { value: P[k] || '', placeholder: '—', onchange: e => set(e.target.value) }),
        k === 'stats' ? null : h('button', { class: 'die', title: `Reroll ${label.toLowerCase()}`, onclick: () => bs.rerollPerson(id, k) }, '🎲'));
    };
    return [
      h('div', { class: 'csub' }, `${P.role} at ${P.building.name}`),
      gm ? h('div', { class: 'crowbtn' },
        h('button', { class: 'chip', title: 'Roll the whole person again (keeps the role and notes)', onclick: () => bs.rerollPerson(id) }, '🎲 Roll all'),
        h('button', { class: 'chip', title: 'A token of them at the door of their building, dressed as rolled', onclick: () => bs.placePerson(id, 'building') }, 'Place at building'),
        h('button', { class: 'chip', title: 'A token of them somewhere in their town', onclick: () => bs.placePerson(id, 'town') }, 'Place in town'),
        h('button', { class: 'chip danger', onclick: () => { bs.removePerson(id); this.open('building', P.building.id); } }, 'Remove')) : null,
      h('div', { class: 'csec' }, F.map(field)),
      gm && P.find ? h('div', { class: 'chook' }, h('div', { class: 'csh' }, h('span', {}, '✦ Rare find'), h('span', { class: 'gmtag' }, 'GM')), h('div', { class: 'cli' }, findText(P.find, P.first)), this.nameBtn(P.find, `with ${P.name}, a ${P.role} in ${P.building.settlement?.name || 'a small place'}`)) : null,
      gm ? this.notes(P.notes || '', v => bs.patchPerson(id, { notes: v })) : null,
    ];
  }
  placeToken(P) {
    const app = this.app, t = app.tools;
    const old = { ...t.tokenForm }; t.tokenForm = { ...t.tokenForm, name: P.name };
    const n0 = app.world.data.tokens.length;
    if (!t.focusMap()) app.flyTo(P.building.x, P.building.z, 60, .8);
    setTimeout(() => {
      t.addToken(); t.tokenForm = old;
      const tk = app.world.data.tokens[app.world.data.tokens.length - 1];
      if (app.world.data.tokens.length > n0 && tk) { tk.person = P.id; app.save(); app.ui.toast(`${P.name} placed`); }
    }, t.focusMap() ? 0 : 1700);
  }
  mapBody(m, gm) {
    return [
      h('div', { class: 'csub' }, 'Encounter bookmark'),
      h('div', { class: 'crowbtn' },
        gm ? h('button', { class: 'chip' + (m.known ? ' on' : ''), onclick: () => this.patchPin({ known: !m.known }) }, m.known ? 'Known' : 'Hidden') : null,
        h('button', { class: 'chip', onclick: () => this.app.tools.flyToPin('battlemaps', m) }, 'Go')),
      gm ? this.notes(m.notes || '', v => this.patchLight({ notes: v })) : null,
    ];
  }
  notes(v, save) {
    return h('div', { class: 'csec' }, h('div', { class: 'csh' }, h('span', {}, 'GM notes')),
      h('textarea', { rows: 3, placeholder: 'Only you see these', onchange: e => save(e.target.value) }, v));
  }

  // Keep the card beside its thing (desktop); on narrow screens it is a bottom sheet (CSS).
  frame(force = false) {
    const p = this.item; if (!this.ref) return;
    if (!p) { this.close(); return; }
    if (innerWidth < 700) { this.el.style.left = this.el.style.top = ''; return; }
    const app = this.app, k = this.ref.key;
    let x = p.x, z = p.z, y;
    if (k === 'tokens') { const wp = app.maps.tokenWorld?.(p); if (!wp) return; ({ x, y, z } = wp); }
    else y = (p.h ?? app.world.height(x, z)) + 2;
    const s = app.project(x, y, z);
    const W = this.el.offsetWidth || 340, H = this.el.offsetHeight || 400;
    let left = s.x + 28, top = s.y - H * .3;
    if (left + W > innerWidth - 10) left = s.x - W - 28;
    left = Math.max(10, Math.min(innerWidth - W - 10, left)); top = Math.max(64, Math.min(innerHeight - H - 140, top));
    if (s.behind && !force) return;
    this.el.style.left = left.toFixed(0) + 'px'; this.el.style.top = top.toFixed(0) + 'px';
  }
}
