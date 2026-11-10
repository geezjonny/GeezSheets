// The DOM layer: tool bar, option strip, menu, place labels, HUD. Works from phone to desktop.
import { TOOLS } from './tools.js';
import { OBJECTS } from './objects.js';
import { GROUNDS } from './detail.js';
import { TYPES, DEFAULT_R } from './world.js';
import { PAL } from './style.js';
import { PLACE_KINDS } from './places.js';
import { starterWorld } from './starter.js';
import { KINDS, KIND_LIST, CATEGORIES, summary } from './lore.js';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style') e.style.cssText = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null) e.append(c); return e; };
const ICON = { detail: '\u25a7', look: '✋', paint: '🖌', river: '〰', road: '⋯', towns: '⌂', maps: '▦', play: '♟' };

export class UI {
  constructor(app) {
    this.app = app;
    this.bar = $('#bar'); this.opts = $('#opts'); this.menu = $('#menu'); this.labels = $('#labels'); this.hud = $('#hud');
    $('#menuBtn').onclick = () => { this.menu.hidden = !this.menu.hidden; this.refresh(); };
    $('#backBtn').onclick = () => app.flyOut();
    $('#level').onclick = () => {const u=app.underground;if(!u?.active)return;if(!u.panel.hidden&&u.panel.dataset.mapMenu===u.active.id)u.panel.hidden=true;else{this.menu.hidden=true;u.mapMenu(u.active.id);}app.request();};
    this.file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: e => this.openFile(e.target.files[0]) });
    document.body.append(this.file);
    this.labelEls = new Map();
    const button = (id, label, text, action) => h('button', { id, 'aria-label': label, title: label, onclick: action }, text);
    const compass = button('compass', 'Drag to turn and tilt; tap to face north', h('span', { id: 'compassNeedle', style: 'display:inline-block' }, 'N \u2191'), () => {});
    let drag = null;
    compass.addEventListener('pointerdown', e => { if (e.button !== 0) return; compass.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false }; });
    compass.addEventListener('pointermove', e => {
      if (!drag) return;
      drag.moved ||= Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8;
      if (drag.moved) app.orbitCamera((drag.x - e.clientX) * .008, (drag.y - e.clientY) * .008);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    compass.addEventListener('pointerup', () => { if (drag && !drag.moved) app.orbitCamera(0, 0, true, true); drag = null; });
    compass.addEventListener('pointercancel', () => { drag = null; });
    this.navigation = h('div', { id: 'navigation', class: 'panel', 'aria-label': 'Camera controls' },
      button('turnLeft', 'Turn left 15 degrees', '\u21b6', () => app.orbitCamera(Math.PI / 12, 0, true)), compass,
      button('turnRight', 'Turn right 15 degrees', '\u21b7', () => app.orbitCamera(-Math.PI / 12, 0, true)),
      button('zoomOut', 'Zoom out', '-', () => app.zoomCamera(1.5)),
      button('zoomIn', 'Zoom in', '+', () => app.zoomCamera(1 / 1.5)));
    document.body.append(this.navigation);
    const layout = () => {
      const dock = $('#dock').getBoundingClientRect(), card = $('#card');
      document.documentElement.style.setProperty('--dock-height', `${innerHeight - dock.top}px`);
      const top = innerWidth < 700 && card && !card.hidden ? Math.min(dock.top, card.getBoundingClientRect().top) : dock.top;
      this.navigation.style.bottom = `${innerHeight - top + 8}px`;
    };
    this.layoutNavigation = layout;
    new ResizeObserver(layout).observe($('#dock'));
    addEventListener('resize', layout);
    this.refresh();
  }

  refresh() {
    const app = this.app, t = app.tools;
    if(this.lastPropRole!==app.role){this.lastPropRole=app.role;app.propInspector?.refresh();if(app.underground?.panel.dataset.mapMenu&&!app.underground.panel.hidden)app.underground.mapMenu(app.underground.panel.dataset.mapMenu);}
    // tool bar
    this.bar.replaceChildren(
      ...TOOLS.filter(x => x.roles.includes(app.role)&&(!app.underground?.active||['look','play','detail'].includes(x.id))).map(x => h('button', { class: 'tool' + (app.tool === x.id ? ' on' : ''), 'data-tool': x.id, onclick: () => app.setTool(x.id) }, h('span', { class: 'ico' }, ICON[x.id]), h('span', { class: 'lbl' }, x.name))),
      h('span', { class: 'sep' }),
      h('button', { class: 'tool small', title: 'Undo (Ctrl+Z)', disabled: !t.undoStack.length, onclick: () => t.undo() }, h('span', { class: 'ico' }, '↶'), h('span', { class: 'lbl' }, 'Undo')),
      h('button', { class: 'tool small', title: 'Redo (Ctrl+Y)', disabled: !t.redoStack.length, onclick: () => t.redo() }, h('span', { class: 'ico' }, '↷'), h('span', { class: 'lbl' }, 'Redo')),
      h('button', { id:'gridToggle', class:'tool small'+(app.showGrid?' on':''), title:'Toggle grid (G)', 'aria-pressed':String(app.showGrid), onclick:()=>{app.showGrid=!app.showGrid;this.refresh();} }, 'Grid '+(app.showGrid?'on':'off')),
      h('button', { class: 'tool small' + (app.isTopDown() ? ' on' : ''), title: 'Top-down view (Tab)', onclick: () => app.toggleTopDown() }, h('span', { class: 'ico' }, '⊙'), h('span', { class: 'lbl' }, 'Top')),
    );
    this.opts.replaceChildren(...this.options().filter(option => option != null));
    this.opts.hidden = !this.opts.childElementCount;
    // menu
    if (!this.menu.hidden) this.menu.replaceChildren(
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Role'), seg(['gm', 'GM'], ['player', 'Player'], app.role, v => app.setRole(v))),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Quality'), seg(['auto', 'Auto'], ['high', 'High'], ['low', 'Low'], app.prefs.quality, v => app.setQuality(v)), h('span', { class: 'hint' }, app.quality.name)),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Detail'), seg(['on', 'Fine'], ['off', 'Simple'], app.prefs.fineDetail===false?'off':'on', v=>app.setFineDetail(v==='on'))),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Motion'), seg(['on', 'Living'], ['off', 'Still'], app.prefs.motion===false?'off':'on', v=>app.motion.setEnabled(v==='on'))),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Stats'), seg(['on', 'Show'], ['off', 'Hide'], app.prefs.stats ? 'on' : 'off', v => { app.prefs.stats = v === 'on'; app.savePrefs(); this.refresh(); })),
      app.role === 'gm' ? h('div', { class: 'row wrap' },
        h('button', { onclick: () => this.saveFile() }, 'Save file'),
        h('button', { onclick: () => this.file.click() }, 'Open file'),
        h('button', { onclick: () => {window.open('mapmaker.html','ink-mapmaker','noopener');this.menu.hidden=true;} }, 'Mapmaker'),
        h('button', { onclick: () => {this.menu.hidden=true;app.ddImports.choose();} }, 'Import .dd2vtt'),
        h('button', { onclick: () => {this.menu.hidden=true;app.ddImports.manage();} }, 'Imported maps'),
        h('button', { onclick: () => {this.menu.hidden=true;app.canon.show();} }, 'World ledger'),
        h('button', { onclick: () => {this.menu.hidden=true;app.buildings.placeExistingPeople();} }, 'Place existing NPCs'),
        h('button', { onclick: () => {this.menu.hidden=true;app.underground.manage();} }, 'Underground'),
        h('button', { onclick: () => { app.loadData(starterWorld(1 + Math.floor(Math.random() * 999))); this.menu.hidden = true; app.flyTo(0, 0, 52000, .25); this.refresh(); } }, 'New world')) : null,
    );
    this.hud.hidden = !app.prefs.stats;
    app.request();
  }

  options() {
    const app = this.app, t = app.tools, tool = app.tool;
    const ping = () => h('button', { id: 'pingBtn', class: 'chip' + (t.pingArmed ? ' on' : ''), onclick: () => { t.pingArmed = !t.pingArmed; this.refresh(); } }, t.pingArmed ? 'Tap to ping' : 'Ping');
    if (tool === 'look') return [ping(), ...this.rulerChips(), h('button', { class: 'chip' + (app.showGrid ? ' on' : ''), title: 'Show the battle grid', onclick: () => { app.showGrid = !app.showGrid; this.refresh(); } }, 'Grid'), h('span', { class: 'hint' }, 'Tap a place for its card. Go to fly in.')];
    if (tool === 'paint') return [
      h('div', { class: 'swatches' }, TYPES.map((ty, k) => h('button', { class: 'sw' + (t.brush.type === k ? ' on' : ''), title: ty.name, onclick: () => { t.brush.type = k; this.refresh(); } }, h('i', { style: `background:${ty.col}` }), h('span', {}, ty.name)))),
      h('label', { class: 'field' }, 'Size', h('input', { type: 'range', min: 1, max: 12, value: t.brush.size, oninput: e => { t.brush.size = +e.target.value; e.target.nextSibling.textContent = e.target.value; } }), h('b', {}, String(t.brush.size))),
      h('button', { class: 'chip' + (t.brush.smooth ? ' on' : ''), title: 'Smooth brush (or hold Shift)', onclick: () => { t.brush.smooth = !t.brush.smooth; this.refresh(); } }, 'Smooth'),
    ];
    if (tool === 'detail') {
      const b=t.detailBrush;
      return [
        h('label',{class:'field'},'Brush',h('select',{'aria-label':'Detail brush',onchange:e=>{b.kind=e.target.value;this.refresh();}},['ground','wall','door','window','objects','clear','erase'].map(k=>h('option',{value:k,selected:b.kind===k},k[0].toUpperCase()+k.slice(1))))),
        b.kind==='ground' ? h('div',{class:'swatches'},GROUNDS.map(([name,col],i)=>h('button',{class:'sw'+(b.ground===i+1?' on':''),title:name,onclick:()=>{b.ground=i+1;this.refresh();}},h('i',{style:'background:'+(col||PAL.void)}),h('span',{},name)))) : null,
        b.kind==='wall' ? h('label',{class:'field'},'Kind',h('select',{'aria-label':'Wall kind',onchange:e=>{b.wall=+e.target.value;}},['Stone','Timber','Palisade'].map((n,i)=>h('option',{value:i+1,selected:b.wall===i+1},n)))) : null,
        b.kind==='objects' ? h('label',{class:'field'},'Object',h('select',{'aria-label':'Object kind',onchange:e=>{b.object=e.target.value;}},OBJECTS.map(o=>h('option',{value:o.k,selected:(b.object||'barrel')===o.k},o.name)))) : null,
        b.kind==='objects' ? h('button',{class:'chip',onclick:()=>{b.rot=((b.rot||0)+1)%4;this.refresh();}},'Turn '+((b.rot||0)*90)+' degrees') : null,
        b.kind!=='objects' ? h('label',{class:'field'},'Size',h('input',{type:'range',min:1,max:5,value:b.size,oninput:e=>{b.size=+e.target.value;e.target.nextSibling.textContent=e.target.value;}}),h('b',{},String(b.size))) : null,
        h('span',{class:'hint'},['wall','door','window'].includes(b.kind)?'Drag a straight edge run. Doors and windows go in existing walls.':b.kind==='objects'?'Tap to place; tap the same object again to turn. Erase removes it.':b.kind==='clear'?'Clear generated trees and houses.':b.kind==='erase'?'Remove detail to restore generated ground.':'Drag to paint 5 ft squares.'),
      ];
    }
    if (tool === 'river' || tool === 'road') {
      const d = t.draft;
      return [
        h('span', { class: 'hint' }, d ? `${d.pts.length} point${d.pts.length === 1 ? '' : 's'}${d.snap ? ' · joined ' + d.snap : ''} · double-tap or Done to finish` : t.selLine ? (this.selCrosses(t) ? 'Crosses mountains. Through them:' : 'Selected. Through mountains:') : `Tap to start a ${tool}; near another, it joins it. Tap a ${tool} to select it, again to branch from it.`),
        d ? h('button', { class: 'chip on', onclick: () => t.finishLine() }, 'Done') : null,
        d ? h('button', { class: 'chip', onclick: () => t.escape() }, 'Cancel') : null,
        ...this.throughChips(t),
        t.selLine ? h('button', { class: 'chip danger', onclick: () => t.deleteSelected() }, 'Delete') : null,
      ].filter(Boolean);
    }
    if (tool === 'towns') {
      const p = t.selected();
      if (!p) return [
        h('label', { class: 'field' }, 'New', h('select', { onchange: e => { t.newKind = e.target.value; } },
          h('option', { value: 'any', selected: !t.newKind || t.newKind === 'any' }, 'Any (fits the land)'),
          Object.entries(CATEGORIES).map(([c, label]) => h('option', { value: c, selected: t.newKind === c }, `Any ${label.toLowerCase()}`)),
          KIND_LIST.map(k => h('option', { value: k, selected: t.newKind === k }, KINDS[k].label)))),
        h('span', { class: 'hint' }, 'Tap the ground to found a place. Drag a pin to move it. Tap a place for its card.')];
      const up = patch => t.updatePin('settlements', p.id, patch);
      return [
        h('input', { class: 'name', id: 'placeName', value: p.name, onchange: e => up({ name: e.target.value }) }),
        h('span', { class: 'hint' }, `${KINDS[p.kind]?.label || p.kind} · ${summary(p)}`),
        h('label', { class: 'field' }, 'Size', h('input', { type: 'range', min: 40, max: 340, step: 10, value: p.r, onchange: e => up({ r: +e.target.value }) })),
        h('button', { class: 'chip' + (p.known ? ' on' : ''), title: 'Players can see it', onclick: () => up({ known: !p.known }) }, p.known ? 'Known' : 'Hidden'),
        h('button', { class: 'chip', title: 'Open its card', onclick: () => app.card.open('settlements', p.id) }, 'Card'),
        h('button', { class: 'chip', onclick: () => t.flyToPin('settlements', p) }, 'Go'),
        h('button', { class: 'chip danger', onclick: () => t.deleteSelected() }, 'Delete'),
      ];
    }
    if (tool === 'maps') {
      const p = t.selected();
      if (!p) return [h('span', { class: 'hint' }, 'Tap anywhere to bookmark an encounter spot.')];
      const up = patch => t.updatePin('battlemaps', p.id, patch);
      return [
        h('input', { class: 'name', id: 'placeName', value: p.name, onchange: e => up({ name: e.target.value }) }),
        h('button', { class: 'chip' + (p.known ? ' on' : ''), title: 'Players can see it', onclick: () => up({ known: !p.known }) }, p.known ? 'Known' : 'Hidden'),
        h('button', { class: 'chip', onclick: () => app.card.open('battlemaps', p.id) }, 'Notes'),
        h('button', { class: 'chip', onclick: () => t.flyToPin('battlemaps', p) }, 'Go'),
        h('button', { class: 'chip danger', onclick: () => t.deleteSelected() }, 'Delete'),
      ];
    }
    if (tool === 'play') {
      const pl = t.focusMap();
      const C = app.combat || { on: false, state: null, current: () => null }, cs = C.state, cur = C.current();
      const fight = app.role === 'gm' ? (C.on
        ? [h('span', { class: 'hint' }, `Round ${cs.round} · ${cur ? cur.name + "'s turn" : '—'}`),
           h('button', { class: 'chip', title: 'Previous turn', onclick: () => C.next(-1) }, '◀'),
           h('button', { class: 'chip on', title: 'Next turn', onclick: () => C.next(1) }, 'Next ▶'),
           h('button', { class: 'chip danger', onclick: () => C.end() }, 'End combat')]
        : [h('button', { class: 'chip on', title: 'Start combat: the grid appears and tokens snap to it', onclick: () => C.start() }, '⚔ Roll initiative')])
        : C.on ? [h('span', { class: 'hint' }, `Round ${cs.round} · ${cur ? cur.name + "'s turn" : '—'}`)] : [];
      return [ping(), ...this.rulerChips(), ...fight,
        pl ? h('input', { class: 'name short', value: t.tokenForm.name, oninput: e => { t.tokenForm.name = e.target.value; } }) : null,
        pl ? h('div', { class: 'colors' }, PAL.tokens.map(c => h('button', { class: 'dot' + (t.tokenForm.color === c ? ' on' : ''), style: `background:${c}`, onclick: () => { t.tokenForm.color = c; this.refresh(); } }))) : null,
        pl ? h('button', { class: 'chip on', onclick: () => t.addToken() }, 'Add token') : null,
        h('button', { class: 'chip' + (app.showGrid ? ' on' : ''), title: 'Toggle the battle grid', onclick: () => { app.showGrid = !app.showGrid; this.refresh(); } }, 'Grid'),
        pl ? h('button', { class: 'chip' + (app.cutaway ? ' on' : ''), title: 'Hide upper walls and buildings around the camera target', onclick: () => { app.cutaway = !app.cutaway; this.refresh(); } }, 'Cutaway') : null,
        h('span', { class: 'hint' }, pl ? `${pl.name} - Tap tokens for cards; drag to move. Ping then tap ground` : 'Zoom in anywhere to add tokens. Ping then tap the ground.'),
      ];
    }
    return [];
  }

  // Selected road or river: how it gets through mountains.
  selCrosses(t) { const f = t.selLine && this.app.lines.find(t.selLine); return !!f && this.app.world.crossesMountains(f.line.pts); }
  throughChips(t) {
    const f = t.selLine && this.app.lines.find(t.selLine); if (!f) return [];
    const opts = f.kind === 'road' ? [[null, 'Cut a pass'], ['over', 'Go over'], ['tunnel', 'Tunnel']] : [[null, 'Carve a valley'], ['over', 'Go over']];
    const cur = f.line.through || null;
    return opts.map(([v, label]) => h('button', { class: 'chip' + (cur === v ? ' on' : ''), 'data-through': v || 'carve', onclick: () => t.setThrough(v) }, label));
  }
  rulerChips() {
    const R = this.app.ruler; if (!R) return [];
    return [h('button', { class: 'chip' + (R.on ? ' on' : ''), title: 'Measure: tap points on the ground', onclick: () => R.toggle() }, '📏 Ruler'),
      R.on ? h('span', { class: 'hint' }, R.text()) : null,
      R.on && R.pts.length ? h('button', { class: 'chip', onclick: () => { R.undoPoint(); } }, 'Undo point') : null,
      R.on && R.pts.length ? h('button', { class: 'chip', onclick: () => { R.clear(); this.refresh(); } }, 'Clear') : null].filter(Boolean);
  }
  // The pin whose label is under a screen point (labels don't take pointer events themselves).
  // Battlemap labels win over settlement labels; key limits it to one list.
  labelAt(x, y, key = null) {
    let hit = null;
    for (const [id, el] of this.labelEls) {
      if (el.hidden) continue; const k = el.dataset.key; if (key && k !== key) continue;
      const r = el.getBoundingClientRect(); if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const item = k === 'building' ? { id } : this.app.world.data[k].find(p => p.id === id); if (!item) continue;
      if (!hit || k === 'battlemaps') hit = { key: k, item };
    }
    return hit;
  }

  focusPlaceName() { setTimeout(() => { const e = $('#placeName'); if (e) { e.focus(); e.select(); } }, 0); }

  saveFile() {
    const blob = new Blob([JSON.stringify(this.app.world.toJSON())], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'world.json' }); document.body.append(a); a.click(); a.remove();
  }
  async openFile(f) {
    if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!d.terrain) throw new Error('not a world file'); this.app.loadData(d); this.menu.hidden = true; this.refresh(); }
    catch (e) { console.warn('open failed', e); this.toast('That file is not a world file.'); }
    this.file.value = '';
  }
  toast(msg) { const t = h('div', { class: 'toast' }, msg); document.body.append(t); setTimeout(() => t.remove(), 2500); }

  // Per frame: labels, level, stats.
  frame(now, dist, fps) {
    this.layoutNavigation();
    const app = this.app;
    const levelButton=$('#level');levelButton.disabled=!app.underground?.active;levelButton.title=app.underground?.active?'Cellar menu':'';if(app.underground?.active){levelButton.setAttribute('aria-haspopup','dialog');levelButton.setAttribute('aria-expanded',String(!app.underground.panel.hidden&&app.underground.panel.dataset.mapMenu===app.underground.active.id));}else{levelButton.removeAttribute('aria-haspopup');levelButton.removeAttribute('aria-expanded');}
    const off = app.camera.position.clone().sub(app.controls.target);
    $('#compassNeedle').style.transform = `rotate(${-Math.atan2(off.x, off.z)}rad)`;
    if(app.underground?.active){$('#level').textContent=app.underground.active.name;$('#backBtn').hidden=false;this.tokenLabels();if(app.prefs.stats)this.hud.textContent=app.maps.tokenMeshes.size+' tokens';return;}
    const level = dist < 250 ? 'Battlemap' : dist < 1800 ? 'Area' : dist < 9000 ? 'Region' : 'World';
    if (level !== this.level||$('#level').textContent!==level) { this.level = level; app.level = level; $('#level').textContent = level; $('#backBtn').hidden = level === 'World'; if (app.tool === 'play') this.refresh(); }
    if (app.tool === 'play') { const pl = app.tools.focusMap()?.id || null; if (pl !== this.playFocus) { this.playFocus = pl; this.refresh(); } }
    const seen = new Set(), cam = app.camera.position, sel = app.tools.sel;
    const place = (key, p, y, cls, show) => {
      if (!show) return;
      const s = app.project(p.x, y, p.z), dd = Math.hypot(p.x - cam.x, y - cam.y, p.z - cam.z);
      if (s.behind || s.x < -50 || s.y < -50 || s.x > innerWidth + 50 || s.y > innerHeight + 50) return;
      seen.add(p.id);
      let el = this.labelEls.get(p.id);
      if (!el) { el = h('div', { class: 'label ' + cls }, h('div', { class: 'pin' }), h('div', { class: 'name' })); el.dataset.key = key; this.labels.append(el); this.labelEls.set(p.id, el); }
      const nm = el.lastChild; if (nm.textContent !== p.name) nm.textContent = p.name;
      el.classList.toggle('hidden-place', !p.known); el.classList.toggle('sel', !!sel && sel.id === p.id);
      el.classList.toggle('small', dd > 25000);
      el.hidden = key === 'battlemaps' ? dd < 45 && app.maps.active === p : key === 'building' ? dd < 14 : dd < 160;
      // building markers: nearer ones win, a marker that would overlap one is hidden
      if (key === 'building' && !el.hidden) { const w = p.name.length * 6.6 + 18, b = [s.x - w / 2, s.y - 34, s.x + w / 2, s.y]; if (this.bboxes.some(q => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1])) el.hidden = true; else this.bboxes.push(b); }
      el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, ${key === 'battlemaps' ? '-14px' : '-100%'})`;
    };
    for (const p of app.world.data.settlements) if (app.towns.visible(p, app.role)) place('settlements', p, p.h + Math.max(16, dist * .01), 'town', true);
    for (const m of app.world.data.battlemaps) if (app.maps.visible(m, app.role)) { const gy = app.world.height(m.x, m.z); place('battlemaps', m, gy + 1.5, 'map', dist < 2500 || app.tool === 'maps'); }
    // named buildings when close to a town
    if (app.role === 'gm' && app.weather && dist > 1500) for (const f of app.weather.fronts) place('fronts', { id: f.id, name: `${({ rain: '🌧', storm: '⛈', snow: '❄', fog: '🌫', overcast: '☁' })[f.kind] || '☁'} ${f.kind[0].toUpperCase() + f.kind.slice(1)}`, x: f.x, z: f.z, known: true }, Math.max(0, app.world.height(f.x, f.z)) + 700, 'front', true);
    this.bboxes = [];
    if (dist < 900 && app.buildings) { const t = app.controls.target, ms = []; for (const S of app.world.data.settlements) if (app.towns.visible(S, app.role) && Math.hypot(S.x - t.x, S.z - t.z) < S.r + dist * 1.5) ms.push(...app.buildings.markers(S)); ms.sort((a, b) => Math.hypot(a.x - cam.x, a.z - cam.z) - Math.hypot(b.x - cam.x, b.z - cam.z)); for (const m of ms) place('building', m, m.y, 'bld', true); }
    if(app.role==='gm')for(const e of app.canon?.entities||[])if(e.kind==='place'&&e.marked&&dist<2500)place('entities',e,app.world.height(e.x,e.z)+8,'bld',true);
    for (const [id, el] of this.labelEls) if (!seen.has(id)) { el.remove(); this.labelEls.delete(id); }
    // token names when close
    if (dist < 120) this.tokenLabels(); else if (this.tokEls?.size) { for (const el of this.tokEls.values()) el.remove(); this.tokEls.clear(); }
    if (app.prefs.stats && now - (this.statT || 0) > 400) { this.statT = now; const s = app.stats(); this.hud.textContent = `${s.fps} fps · ${s.calls} calls · ${(s.tris / 1000).toFixed(0)}k tris\n${s.chunks} chunks · ${s.props} props · ${s.canopy} canopy · ${s.towns}+${s.townsFar} towns · ${s.maps} maps · ${s.quality}`; }
  }
  tokenLabels() {
    const app = this.app; this.tokEls ||= new Map(); const seen = new Set();
    for (const m of app.maps.tokenMeshes.values()) {
      const t = app.world.data.tokens.find(q => q.id === m.userData.token); if (!t) continue;
      const wp = m.getWorldPosition(m.position.clone().set(0, 0, 0)); const sp = m.userData.sprite, up = sp && sp.visible && sp.material.opacity > .5 ? sp.position.y * m.scale.y + sp.scale.y * m.scale.y / 2 + .15 : .45, s = app.project(wp.x, wp.y + up, wp.z); if (s.behind) continue;
      seen.add(t.id);
      let el = this.tokEls.get(t.id); if (!el) { el = h('div', { class: 'tok' }); this.labels.append(el); this.tokEls.set(t.id, el); }
      el.textContent = t.name; el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (const [id, el] of this.tokEls) if (!seen.has(id)) { el.remove(); this.tokEls.delete(id); }
  }
}

function seg(...args) {
  const onPick = args.pop(), cur = args.pop();
  return h('span', { class: 'seg' }, args.map(([v, label]) => h('button', { class: v === cur ? 'on' : '', onclick: () => onPick(v) }, label)));
}
