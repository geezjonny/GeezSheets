// The dice drawer: the GM's rollers (rollers.js) in one panel. Tap a roller, set its options, Roll.
// Results nest: a place lists its buildings, a building its people; tap one to open it.
// Tap-first, works as a side panel on desktop and a bottom sheet on phones (same CSS as the card).
import { ROLLERS, roll, npcSections, buildingSections } from './rollers.js';
import { registerFactions } from './card.js';
import { encounterTokens } from './encounters.js';
import { nameRelic } from './relics.js';

const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style') e.style.cssText = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) e.append(c); return e; };
const newSeed = () => Math.floor(Math.random() * 1e9);
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

export class RollUI {
  constructor(app) {
    this.app = app; this.cur = 'npc'; this.opts = {}; this.result = null; this.open = new Set(); this.history = [];
    this.el = h('div', { id: 'roller', class: 'panel', hidden: true });
    this.el.addEventListener('pointerdown', e => e.stopPropagation());
    this.el.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
    document.body.append(this.el);
    const top = document.getElementById('top');
    this.btn = h('button', { id: 'rollBtn', title: 'Rollers', 'aria-label': 'Rollers', onclick: () => this.toggle() }, '🎲');
    top.insertBefore(this.btn, top.children[1] || null);
    this.sync();
  }
  sync() { this.btn.hidden = this.app.role !== 'gm'; if (this.app.role !== 'gm') this.hide(); }
  toggle() { this.el.hidden ? this.show() : this.hide(); }
  show() { this.el.hidden = false; this.app.card?.close(); this.render(); }
  hide() { this.el.hidden = true; }

  doRoll(seed = newSeed()) {
    const opts = { ...this.opts[this.cur] };
    for (const k in opts) if (opts[k] === '') delete opts[k];
    const R = ROLLERS.find(r => r.id === this.cur), t = this.app.controls.target;
    const ctx = R.here ? { x: t.x, z: t.z, weather: this.app.weather?.weatherAt(t.x, t.z).kind || 'clear' } : {};
    this.result = this.app.canon.ground(roll(this.cur, seed, opts, this.app.world, ctx), t);
    this.open = new Set();
    this.history.unshift({ id: this.cur, seed, opts, title: this.result.title }); this.history = this.history.slice(0, 12);
    this.render();
    this.el.querySelector('.cbody').scrollTop = 0;
  }

  render() {
    const R = ROLLERS.find(r => r.id === this.cur), o = this.opts[this.cur] ||= {};
    const opt = ([key, label, values]) => values === 'level' || values === 'party'
      ? h('label', { class: 'field' }, label, h('input', { class: 'num', type: 'number', min: 1, max: values === 'party' ? 8 : 20, value: o[key] || (values === 'party' ? 4 : 3), onchange: e => { o[key] = +e.target.value; } }))
      : h('select', { title: label, onchange: e => { o[key] = e.target.value; } }, values.map(v => h('option', { value: v, selected: (o[key] || '') === v }, v ? cap(v) : `${label}: any`)));
    this.el.replaceChildren(
      h('div', { class: 'chead' }, h('div', { class: 'ctitle' }, 'Rollers'), h('button', { class: 'cx', title: 'Close', onclick: () => this.hide() }, '×')),
      h('div', { class: 'cbody' },
        h('div', { class: 'rgrid' }, ROLLERS.map(r => h('button', { class: 'rbtn' + (r.id === this.cur ? ' on' : ''), onclick: () => { this.cur = r.id; this.result = null; this.render(); } }, h('span', { class: 'ri' }, r.icon), h('span', {}, r.name)))),
        h('div', { class: 'crowbtn' }, R.opts.map(opt), h('button', { class: 'chip on', onclick: () => this.doRoll() }, `🎲 Roll ${R.name.toLowerCase()}`)),
        this.result ? this.resultView(this.result) : h('div', { class: 'csub' }, 'Pick a roller and roll.'),
        this.history.length > 1 ? h('details', { class: 'rhist' }, h('summary', {}, 'Recent rolls'), this.history.slice(1).map(x => h('button', { class: 'chip', onclick: () => { this.cur = x.id; this.opts[x.id] = { ...x.opts }; this.doRoll(x.seed); } }, `${ROLLERS.find(r => r.id === x.id).icon} ${x.title}`))) : null,
      ));
  }

  resultView(m) {
    return h('div', { class: 'rres' },
      h('div', { class: 'rtitle' }, m.title), h('div', { class: 'csub' }, m.sub),
      h('div', { class: 'crowbtn' },
        h('button', { class: 'chip', title: 'Roll again with the same options', onclick: () => this.doRoll() }, '🎲 Reroll'),
        h('button', { class: 'chip', title: 'Copy as text', onclick: () => this.copy(m) }, 'Copy'),
        m.place ? h('button', { class: 'chip', title: 'Go to this place in the world', onclick: () => { const e=this.app.canon.get(m.worldEntity); if(e){this.hide();this.app.canon.go(e);this.app.canon.openSource(e);}else this.found(m.place); } }, m.worldEntity ? 'Go to place' : 'Place on map') : null,
        m.encounter ? h('button', { class: 'chip on', title: 'Put them on the map where the camera is looking', onclick: () => this.placeEncounter(m.encounter) }, 'Place on map') : null,
        m.relic ? h('button', { class: 'chip on', title: 'Ask the local model (Ollama) for a name and lore', onclick: e => this.nameIt(m, e.currentTarget) }, m.relic.named ? '✨ Rename' : '✨ Name it') : null,
        m.person ? h('button', { class: 'chip', title: 'A token dressed as rolled: where you are looking if close, else in the nearest town', onclick: () => this.placeNPC(m.person) }, 'Place as token') : null,
        h('span', { class: 'dim' }, `seed ${m.seed}`)),
      this.sections(m.sections, 'r'),
      m.worldRefs?.length ? h('div', {class:'csec'}, h('div', {class:'csh'}, 'In the world'), this.app.canon.links(m.worldRefs)) : null);
  }
  sections(list, path) { return list.map((s, i) => this.section(s, `${path}.${i}`)); }
  section(s, path) {
    const rows = (s.rows || []).filter(([, v]) => v != null && v !== '');
    return h('div', { class: 'csec' + (s.gm ? ' gm' : '') },
      h('div', { class: 'csh' }, h('span', {}, s.t), s.gm ? h('span', { class: 'gmtag' }, 'GM') : null),
      s.text ? h('div', { class: 'cli' }, this.app.canon.text(s.text,this.result?.worldRefs)) : null,
      rows.map(([k, v]) => h('div', { class: 'crow' }, h('span', { class: 'ck' }, k), h('span', { class: 'cv' }, this.app.canon.text(String(v),this.result?.worldRefs)))),
      (s.list || []).filter(Boolean).map(x => h('div', { class: 'cli' }, this.app.canon.text(x,this.result?.worldRefs))),
      (s.people || []).map((p, k) => this.fold(`${path}.p${k}`, h('span', {}, h('b', {}, p.name), ` — ${p.race} ${p.role}, ${p.demeanour || p.trait || ''}`), () => this.sections(npcSections(p), `${path}.p${k}`))),
      (s.buildings || []).map((b, k) => this.fold(`${path}.b${k}`, h('span', {}, h('b', {}, b.name), ` — ${b.label}, ${b.people.length} ${b.people.length === 1 ? 'person' : 'people'}`), () => this.sections(buildingSections(b), `${path}.b${k}`))),
    );
  }
  // a tappable row that opens its nested roll in place
  fold(key, head, body) {
    const on = this.open.has(key);
    return h('div', { class: 'rfold' + (on ? ' on' : '') },
      h('button', { class: 'rhead', onclick: () => { on ? this.open.delete(key) : this.open.add(key); const y = this.el.querySelector('.cbody').scrollTop; this.render(); this.el.querySelector('.cbody').scrollTop = y; } }, h('span', { class: 'rcaret' }, on ? '▾' : '▸'), head),
      on ? h('div', { class: 'rinner' }, body()) : null);
  }

  text(m) {
    const out = [`${m.title} (${m.sub})`];
    const walk = (secs, ind) => { for (const s of secs) { out.push(`${ind}${s.t}${s.gm ? ' [GM]' : ''}`); if (s.text) out.push(`${ind}  ${s.text}`); for (const [k, v] of s.rows || []) if (v != null) out.push(`${ind}  ${k}: ${v}`); for (const x of s.list || []) if (x) out.push(`${ind}  - ${x}`); for (const p of s.people || []) { out.push(`${ind}  * ${p.name}`); walk(npcSections(p), ind + '    '); } for (const b of s.buildings || []) { out.push(`${ind}  # ${b.name} (${b.label})`); walk(buildingSections(b), ind + '    '); } } };
    walk(m.sections, '');
    return out.join('\n');
  }
  async copy(m) { try { await navigator.clipboard.writeText(this.text(m)); this.app.ui.toast('Copied'); } catch { this.app.ui.toast('Copy failed'); } }

  // A homebrew item gets its name and lore from the local model; kept in the world, so it stays.
  async nameIt(m, btn) {
    btn.disabled = true; btn.textContent = '✨ Naming…';
    try {
      this.app.setRelicName(m.relic.key, await nameRelic(m.relic));
      if (this.result === m) { this.result = this.app.canon.ground(roll(m.roller, m.seed, m.opts, this.app.world),this.app.controls.target,{key:'named:'+m.relic.key+':'+this.app.world.data.relics[m.relic.key]?.name}); const hx = this.history.find(x => x.seed === m.seed); if (hx) hx.title = this.result.title; this.render(); }
    } catch (e) { this.app.ui.toast(e.message || 'Naming failed'); btn.disabled = false; btn.textContent = '✨ Name it'; }
  }
  // Found a rolled place on the map where the camera looks, with its lore (and the rolled buildings, for later).
  placeNPC(P) {
    const app = this.app, t = app.controls.target, bs = app.buildings;
    let at = { x: t.x, z: t.z };
    if (app.camDist() > 300) {
      const towns = app.world.data.settlements.filter(S => ['city', 'town', 'village', 'hamlet', 'crossing'].includes(S.kind) && app.towns.visible(S, app.role));
      const S = towns.sort((a, b) => Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z))[0];
      if (S) at = bs.townSpot(S);
    }
    const entity=app.canon.named(P.name),existing=entity&&app.world.data.tokens.find(t=>t.worldEntity===entity.id);
    if(existing){app.card.open('tokens',existing.id);app.ui.toast(P.name+' is already on the map');return;}
    const tk = app.tools.placeTokenAt(at.x, at.z, { name: P.name, look: bs.tokenFields(P).look, ...(entity?{worldEntity:entity.id}:{} ) });
    if(tk&&entity){entity.source={key:'tokens',id:tk.id};entity.x=at.x;entity.z=at.z;app.save();}
    if (tk) { app.flyTo(at.x, at.z, 60, .9); app.ui.toast(`${P.name} placed`); } else app.ui.toast('No free square there');
  }
  // The rolled creatures as tokens around where the camera looks (or where it was rolled, when zoomed out).
  placeEncounter(enc) {
    const app = this.app, t = app.controls.target, at = app.camDist() <= 400 || !enc.at ? { x: t.x, z: t.z } : enc.at;
    const out = app.tools.placeTokens(encounterTokens(enc, at.x, at.z));
    const n = out.filter(Boolean).length;
    if (!n) { app.ui.toast('No free squares there'); return; }
    app.flyTo(at.x, at.z, 45, .95); this.hide(); app.ui.toast(`${n} placed`);
  }
  found(S) {
    const app = this.app, t = app.controls.target, g = { x: +t.x.toFixed(1), z: +t.z.toFixed(1) };
    const p = { id: 'st_' + Math.random().toString(36).slice(2, 9), name: S.name, kind: S.kind, x: g.x, z: g.z, r: S.r, seed: S.seed, lore: S.lore, known: false };
    registerFactions(app.world, S.lore);
    app.tools.edit('settlements', l => l.push(p), (a, b) => app.tools.pinsChanged('settlements', a, b));
    this.hide(); app.card?.open('settlements', p.id); app.ui.toast(`${S.name} founded here`);
  }
}
