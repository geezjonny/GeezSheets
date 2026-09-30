// town-vtt.js — puts the town sim on GeezVTT's battle map (DM only, local).
//   Step 1: zones, routes, townsfolk.  Step 2: PC tokens join the sim, turn-based action bar for PC turns.
//   Step 3: shopkeepers — shops, trading, NPC shoppers, and the session's rumors (Session menu → Rumors & day).
//   Step 4: players — the DM publishes the town to live/<campaign>/town/state; players see NPCs (within their
//           vision), take their own turns (commands go to live/<campaign>/town/cmd, the DM's sim validates and
//           runs them), and walk their token with WASD outside fights (with wall collision).
//
// Loaded as a plain script after index-fork.html's main script, so it can use the app's
// top-level names directly: db, ui, cam, toContent, sceneGeometry, save, showStatus, PLAYER,
// viewport, mapWrapper, tokensLayer. index-fork.html calls three hooks:
//   TownVTT.onScene(scene, battleId)  every time the battle map renders
//   TownVTT.onLevel(level)            when you switch between board / world / location / battle map
//   TownVTT.resize(w, h)              when the map canvases are resized
//
// Each battle map keeps its own town in db.battles[battleId].town = { zones, routes, npcs }.
// Only the open battle map is simulated; everything else is frozen until you open it again.
(function () {
  const G = window.GeezTown;
  const noop = { onScene() {}, onLevel() {}, resize() {} };
  if (typeof db === 'undefined' || !G || !G.TownSim) { console.warn('[town] app or sim modules missing'); window.TownVTT = noop; return; }
  if (PLAYER) { runPlayer(); return; } // players: see the town and take their own turns (bottom of this file)

  G.srd.load('data/').catch((e) => console.info('[town] SRD not loaded, using built-in stat blocks:', e.message));
  if (G.barks) G.barks.load('data/');
  if (G.shops) G.shops.load('data/');

  // ---------- state ----------
  const S = {
    bid: null, scene: null, sim: null, running: false, geoSig: '',
    tool: null,          // null | 'select' | 'zone' | 'route' | 'npc' | 'erase'
    sel: null,           // { type: 'zone'|'route'|'npc', id }
    drawPts: [], zoneDrag: null, overlay: true, collapsed: false, floaters: [],
    newTags: 'city, guard', newName: 'Market square', // what the Tags / Name boxes hold
    pcSync: {}, targeting: null, log: [], hover: null,
    bubbles: [], lastBark: new Map(), barkT: 0, trade: null,
  };
  S.sim = null;
  // Firebase drops empty objects, so make sure every battle keeps a tokens object (the app assumes one).
  const fixBattles = () => { for (const b of Object.values(db.battles || {})) if (b && typeof b === 'object') b.tokens ||= {}; };
  const townOf = (bid) => { const b = (db.battles[bid] ||= { tokens: {} }); b.tokens ||= {}; return (b.town ||= { zones: [], routes: [], npcs: [] }); };
  const parseTags = (s) => String(s || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- overlay canvas (content pixels, so it pans and zooms with the map) ----------
  const canvas = document.createElement('canvas');
  canvas.id = 'townCanvas';
  canvas.className = 'absolute top-0 left-0 pointer-events-none';
  mapWrapper.insertBefore(canvas, tokensLayer);
  const ctx = canvas.getContext('2d');

  // ---------- world from the open scene ----------
  function worldFor(scene, bid) {
    const { walls, doors } = sceneGeometry(scene, bid); // grid units, your edits and door states included
    const t = townOf(bid);
    return {
      origin: { x: 0, y: 0 }, width: scene.w / scene.ppg, height: scene.h / scene.ppg, pixelsPerGrid: scene.ppg,
      walls: walls.map((w) => ({ id: w.key, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 })),
      doors: doors.map((d) => ({ id: d.id, x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, closed: d.closed })),
      lights: [], zones: t.zones, routes: t.routes,
    };
  }
  const geoSig = (w) => JSON.stringify([w.walls.map((x) => [x.x1, x.y1, x.x2, x.y2]), w.doors.map((d) => [d.x1, d.y1, d.x2, d.y2, d.closed])]);

  const npcsToSave = () => S.sim.serializeEntities().filter((e) => !(e.tags || []).includes('pc')); // PCs live on their tokens

  function persist() {
    if (!S.sim || !S.bid || !db.battles[S.bid]) return;
    townOf(S.bid).npcs = npcsToSave();
    save();
  }

  function onScene(scene, bid) {
    fixBattles();
    if (bid !== S.bid) {
      persist();
      S.bid = bid; S.scene = scene; S.sel = null; S.drawPts = []; S.running = false;
      const w = worldFor(scene, bid);
      S.sim = new G.TownSim(w);
      S.sim.pcDamage = 'report'; // attacks on PCs are rolled and logged; apply them on the character sheet
      S.sim.loadEntities((townOf(bid).npcs || []).filter((e) => !(e.tags || []).includes('pc')));
      S.pcSync = {};
      S.geoSig = geoSig(w);
    } else {
      S.scene = scene;
      const w = worldFor(scene, bid), sig = geoSig(w);
      if (sig !== S.geoSig) { // a wall was drawn/erased or a door opened: repath everyone
        S.sim.world.walls = w.walls; S.sim.world.doors = w.doors; S.sim.world.width = w.width; S.sim.world.height = w.height;
        S.sim.rebuildNav(); S.geoSig = sig;
      }
    }
    resize(scene.w, scene.h);
    renderPanel();
  }

  function onLevel(level) {
    if (level !== 'VTT') { persist(); S.running = false; setTool(null); lastPub = ''; Live.set(livePath('town/state'), null); }
    renderPanel();
  }

  function resize(w, h) { if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } }

  // After zones/routes change: rebuild the route graph and home zones, then save.
  function worldEdited() { if (S.sim) S.sim.rebuild(); save(); renderPanel(); }

  // ---------- panel ----------
  const panel = document.createElement('div');
  panel.id = 'townPanel';
  panel.className = 'absolute left-3 bottom-3 w-72 glass-panel rounded-xl border border-slate-800 shadow-2xl text-xs text-slate-300';
  panel.style.cssText = 'z-index:30;display:none';
  viewport.appendChild(panel);
  const BTN = 'px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200';
  const BTN_ON = 'px-2 py-1 rounded-lg border border-amber-500/60 bg-slate-900 text-amber-400';
  const INPUT = 'w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-100';

  let panelSig = '';
  function renderPanel() {
    panel.style.display = db.view.level === 'VTT' && S.sim && db.view.battleId === S.bid ? '' : 'none';
    if (!S.sim) { panel.innerHTML = ''; panelSig = ''; return; }
    const sim = S.sim, alive = sim.entities.filter((e) => !e.dead).length;
    const selObj = selected();
    const f0 = sim.combats[0];
    const sig = JSON.stringify([S.log.length && S.log[0].text, f0 && [f0.round, f0.turn, f0.order.length, f0.combatants().map((e) => e.stats.hp).join()], S.collapsed, S.running, S.tool, S.overlay, S.sel, alive, sim.entities.length, sim.combats.length,
      sim.world.zones.length, sim.world.routes.length, selObj && (selObj.name + (selObj.tags || []).join() + (selObj.status || '') + (selObj.stats ? selObj.stats.hp : ''))]);
    if (sig === panelSig) return;
    panelSig = sig;
    const focusId = document.activeElement && panel.contains(document.activeElement) ? document.activeElement.id : null;
    if (focusId) return; // don't rebuild under the cursor while you're typing

    const head = `<div class="flex items-center gap-2 px-3 py-2 border-b border-slate-800">
        <i class="fa-solid fa-people-group text-emerald-400"></i><b class="text-slate-100">Town life</b>
        <span class="text-slate-500">${alive} NPCs${sim.combats.length ? ` · ${sim.combats.length} fight${sim.combats.length > 1 ? 's' : ''}` : ''}</span>
        <span class="ml-auto flex gap-1">
          <button data-t="run" class="${S.running ? BTN_ON : BTN}" title="${S.running ? 'Pause' : 'Run'} the town">${S.running ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>'}</button>
          <button data-t="collapse" class="${BTN}" title="${S.collapsed ? 'Expand' : 'Collapse'}"><i class="fa-solid fa-chevron-${S.collapsed ? 'up' : 'down'}"></i></button>
        </span></div>`;
    if (S.collapsed) { panel.innerHTML = head; bindPanel(); return; }

    const tools = [['select', 'fa-arrow-pointer', 'Select town things'], ['zone', 'fa-vector-square', 'Zone: drag a rectangle'], ['route', 'fa-route', 'Route: click points, Enter / double-click to finish'], ['npc', 'fa-user-plus', 'Place an NPC'], ['erase', 'fa-eraser', 'Erase a zone, route or NPC']];
    let html = head + `<div class="p-3 space-y-2">
      <div class="flex gap-1">${tools.map(([id, ic, tip]) => `<button data-tool="${id}" class="${S.tool === id ? BTN_ON : BTN}" title="${tip}"><i class="fa-solid ${ic}"></i></button>`).join('')}
        <button data-t="overlay" class="${S.overlay ? BTN_ON : BTN} ml-auto" title="Show zones and routes"><i class="fa-solid fa-layer-group"></i></button></div>
      <div class="grid grid-cols-2 gap-1">
        <label class="col-span-2 text-slate-500">Tags for new zones, routes and NPCs
          <input id="townTags" class="${INPUT} mt-0.5" value="${esc(S.newTags)}"></label>
        <label class="col-span-2 text-slate-500">Name for new zones and routes
          <input id="townName" class="${INPUT} mt-0.5" value="${esc(S.newName)}"></label>
      </div>
      <p class="text-slate-500 leading-snug">NPC role = first known tag: guard, citizen, shopkeeper, bandit, zombie. Add <span class="text-slate-300">srd:ogre</span> for any SRD stat block.</p>
      <div class="flex gap-1"><button data-t="populate" class="${BTN} flex-1">Populate zones</button><button data-t="clear" class="${BTN} flex-1">Clear NPCs</button></div>`;

    const fight = sim.combats[0];
    if (fight) {
      const cur = fight.current();
      html += `<div class="border-t border-slate-800 pt-2 space-y-1">
        <div class="flex items-center gap-2"><b class="text-slate-100">Fight · round ${fight.round}</b>${sim.combats.length > 1 ? `<span class="text-slate-500">+${sim.combats.length - 1} more</span>` : ''}
          <button data-t="endfight" class="${BTN} ml-auto" title="End this fight">End</button></div>
        <ol class="space-y-0.5">${fight.order.map((o) => { const e = sim.get(o.id); if (!e) return ''; const out = e.dead || o.escaped;
          return `<li class="flex gap-2 ${e === cur ? 'text-amber-300 font-semibold' : out ? 'text-slate-600 line-through' : ''}"><span class="w-5 text-right">${o.roll}</span><span class="flex-1 truncate">${esc(e.name)}</span><span class="text-slate-500">${e.dead ? (G.roleOf(e) === 'pc' ? 'down' : 'dead') : o.escaped ? 'fled' : `${e.stats.hp}/${e.stats.hpMax}`}</span></li>`; }).join('')}</ol>
      </div>`;
    }
    if (S.log.length) html += `<div class="border-t border-slate-800 pt-2 max-h-28 overflow-y-auto space-y-0.5 text-slate-400">${S.log.slice(0, 10).map((l) => `<div class="${l.pc ? 'text-rose-300' : ''}">${esc(l.text)}</div>`).join('')}</div>`;

    if (selObj) {
      const t = S.sel.type;
      html += `<div class="border-t border-slate-800 pt-2 space-y-1">
        <div class="flex items-center gap-2"><b class="text-slate-100">${t === 'npc' ? 'NPC' : t === 'zone' ? 'Zone' : 'Route'}</b>
          ${t === 'npc' ? `<span class="text-slate-500">${esc(G.roles[G.roleOf(selObj)].label)} · ${esc(selObj.stats.name || '')} · HP ${selObj.stats.hp}/${selObj.stats.hpMax} · AC ${selObj.stats.ac}</span>` : ''}
          <button data-t="delsel" class="${BTN} ml-auto" title="Delete"><i class="fa-solid fa-trash"></i></button></div>
        <input id="townSelName" class="${INPUT}" value="${esc(selObj.name)}" placeholder="Name">
        <input id="townSelTags" class="${INPUT}" value="${esc((selObj.tags || []).join(', '))}" placeholder="Tags">
        ${t === 'npc' ? `<div class="text-slate-500">${esc(selObj.status || '')}</div>` : ''}
        ${t === 'npc' && G.roleOf(selObj) === 'shopkeeper' && G.shops && G.shops.ready ? (() => { const sh = shopOf(selObj); return `<div class="text-slate-400">${esc(sh.label)} · ${sh.inventory.length} items · ${G.shops.money(sh.gold)}</div>
          <div class="flex gap-1"><button data-t="trade" class="${BTN} flex-1"><i class="fa-solid fa-scale-balanced"></i> Trade</button><button data-t="talk" class="${BTN} flex-1"><i class="fa-solid fa-comment"></i> Talk</button></div>`; })() : ''}
        ${t === 'npc' && G.roleOf(selObj) !== 'pc' ? (selObj.cardId && db.things[selObj.cardId]
          ? `<div class="text-emerald-300"><i class="fa-solid fa-id-card"></i> Has a pin-board card</div>`
          : `<button data-t="card" class="${BTN} w-full" title="The players got attached: give them a card on the pin board"><i class="fa-solid fa-id-card"></i> Make a card</button>`) : ''}
      </div>`;
    }
    html += `</div>`;
    panel.innerHTML = html;
    bindPanel();
  }

  function bindPanel() {
    panel.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => setTool(S.tool === b.dataset.tool ? null : b.dataset.tool)));
    panel.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => action(b.dataset.t)));
    const tags = panel.querySelector('#townTags'), name = panel.querySelector('#townName');
    if (tags) tags.oninput = () => (S.newTags = tags.value);
    if (name) name.oninput = () => (S.newName = name.value);
    const sn = panel.querySelector('#townSelName'), st = panel.querySelector('#townSelTags');
    if (sn) sn.onchange = () => { const o = selected(); if (o) { o.name = sn.value; S.sel.type === 'npc' ? persist() : save(); } sn.blur(); panelSig = ''; renderPanel(); };
    if (st) st.onchange = () => {
      const o = selected(); if (!o) return;
      if (S.sel.type === 'npc') { S.sim.setTags(o, parseTags(st.value)); persist(); }
      else { o.tags = parseTags(st.value); worldEdited(); }
      st.blur(); panelSig = ''; renderPanel();
    };
    panel.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); }));
  }

  function action(a) {
    const sim = S.sim; if (!sim) return;
    if (a === 'run') { S.running = !S.running; if (!S.running) persist(); showStatus(S.running ? 'Town is running' : 'Town paused'); }
    if (a === 'collapse') S.collapsed = !S.collapsed;
    if (a === 'overlay') S.overlay = !S.overlay;
    if (a === 'clear') { if (!confirm('Remove every NPC from this battle map?')) return; sim.entities = []; sim.combats = []; S.sel = null; persist(); }
    if (a === 'populate') populate();
    if (a === 'delsel') deleteSel();
    if (a === 'endfight' && sim.combats[0]) sim.endCombat(sim.combats[0]);
    if (a === 'trade') { const o = selected(); if (o) openTrade(o); }
    if (a === 'card') { const o = selected(); if (o) makeCard(o); }
    if (a === 'talk') { const o = selected(); if (o) { o._talkN = (o._talkN || 0) + 1; shopOf(o); bark(o, o._talkN); } }
    panelSig = ''; renderPanel();
  }

  function setTool(t) {
    S.tool = t; S.drawPts = []; S.zoneDrag = null;
    viewport.classList.toggle('placing', !!t);
    if (t) showStatus({ select: 'Click a zone, route or NPC to edit it.', zone: 'Drag a rectangle. It snaps to whole squares and uses the tags in the panel.', route: 'Click points along the route. Enter or double-click finishes, Esc cancels.', npc: 'Click to place an NPC with the tags in the panel.', erase: 'Click a zone, route or NPC to remove it.' }[t]);
    panelSig = ''; renderPanel();
  }

  // One NPC per matching role for each zone: guard zones get a guard, city zones citizens, shop zones a shopkeeper.
  function populate() {
    const sim = S.sim; let n = 0;
    for (const z of sim.world.zones) for (const roleKey of ['guard', 'citizen', 'shopkeeper']) {
      if (!G.geom.shareTag(z.tags, G.roles[roleKey].zoneTags)) continue;
      const count = roleKey === 'citizen' ? 3 : 1;
      for (let i = 0; i < count; i++) for (let tries = 0; tries < 20; tries++) {
        const x = z.minX + 0.5 + Math.random() * Math.max(0, z.maxX - z.minX - 1), y = z.minY + 0.5 + Math.random() * Math.max(0, z.maxY - z.minY - 1);
        if (!sim.nav.moveBlocked(x, y, x, y, 0.35)) { sim.spawn({ tags: [roleKey], x, y }); n++; break; }
      }
    }
    persist();
    showStatus(n ? `Added ${n} NPCs` : 'Draw a zone first (tags like city, guard or shop), then populate.');
  }

  // ---------- selection ----------
  function selected() {
    if (!S.sel || !S.sim) return null;
    if (S.sel.type === 'npc') return S.sim.get(S.sel.id) || null;
    const list = S.sel.type === 'zone' ? S.sim.world.zones : S.sim.world.routes;
    return list.find((x) => x.id === S.sel.id) || null;
  }
  function pickAt(g) {
    const sim = S.sim, tol = 10 / (S.scene.ppg * cam().zoom);
    for (let i = sim.entities.length - 1; i >= 0; i--) { const e = sim.entities[i]; if (Math.hypot(g.x - e.x, g.y - e.y) <= e.radius + tol) return { type: 'npc', id: e.id }; }
    if (S.overlay) {
      for (const r of sim.world.routes) for (let i = 0; i < r.points.length - 1; i++) { const a = r.points[i], b = r.points[i + 1]; if (G.geom.distToSegment(g.x, g.y, a.x, a.y, b.x, b.y) < tol) return { type: 'route', id: r.id }; }
      const zs = sim.world.zones.filter((z) => G.geom.inRect(g.x, g.y, z)).sort((a, b) => G.geom.rectArea(a) - G.geom.rectArea(b));
      if (zs.length) return { type: 'zone', id: zs[0].id };
    }
    return null;
  }
  function deleteSel(sel = S.sel) {
    if (!sel || !S.sim) return;
    if (sel.type === 'npc') { S.sim.remove(sel.id); persist(); }
    else {
      const list = sel.type === 'zone' ? S.sim.world.zones : S.sim.world.routes;
      const i = list.findIndex((x) => x.id === sel.id);
      if (i >= 0) list.splice(i, 1);
      worldEdited();
    }
    if (S.sel && S.sel.id === sel.id) S.sel = null;
    panelSig = ''; renderPanel();
  }

  // ---------- input (capture phase, so the app's own tools don't also react) ----------
  const gridAt = (e) => { const p = toContent(e.clientX, e.clientY); return { x: p.x / S.scene.ppg, y: p.y / S.scene.ppg }; };
  const active = () => S.tool && db.view.level === 'VTT' && S.sim && S.scene;

  viewport.addEventListener('pointerdown', (e) => {
    if (!active() || e.button !== 0 || e.target.closest('#townPanel, button, input, label, textarea, select')) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const g = gridAt(e), sim = S.sim, snap = G.geom.snap;
    if (S.tool === 'select') { S.sel = pickAt(g); }
    else if (S.tool === 'erase') { deleteSel(pickAt(g)); }
    else if (S.tool === 'zone') { const a = { x: Math.floor(g.x), y: Math.floor(g.y) }; S.zoneDrag = { a, b: a }; viewport.setPointerCapture(e.pointerId); }
    else if (S.tool === 'route') { S.drawPts.push({ x: snap(g.x, 0.5), y: snap(g.y, 0.5) }); }
    else if (S.tool === 'npc') {
      const tags = parseTags(S.newTags);
      const e2 = sim.spawn({ tags: tags.length ? tags : ['citizen'], x: g.x, y: g.y });
      S.sel = { type: 'npc', id: e2.id }; persist();
    }
    panelSig = ''; renderPanel();
  }, true);

  viewport.addEventListener('pointermove', (e) => {
    if (db.view.level === 'VTT' && S.scene) S.hover = gridAt(e);
    if (!active()) return;
    if (S.zoneDrag) { const g = S.hover; S.zoneDrag.b = { x: Math.floor(g.x), y: Math.floor(g.y) }; e.stopImmediatePropagation(); }
  }, true);

  viewport.addEventListener('pointerup', (e) => {
    if (!active() || !S.zoneDrag) return;
    e.stopImmediatePropagation();
    const { a, b } = S.zoneDrag; S.zoneDrag = null;
    const z = { id: G.geom.uid('z'), name: S.newName.trim() || 'Zone', tags: parseTags(S.newTags), color: '#34d399',
      minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x) + 1, maxY: Math.max(a.y, b.y) + 1 };
    S.sim.world.zones.push(z); S.sel = { type: 'zone', id: z.id };
    worldEdited(); panelSig = ''; renderPanel();
  }, true);

  function finishRoute() {
    if (S.drawPts.length > 1) {
      const r = { id: G.geom.uid('r'), name: S.newName.trim() || 'Route', tags: parseTags(S.newTags), points: S.drawPts };
      S.sim.world.routes.push(r); S.sel = { type: 'route', id: r.id };
      worldEdited();
    }
    S.drawPts = []; panelSig = ''; renderPanel();
  }
  viewport.addEventListener('dblclick', (e) => { if (active() && S.tool === 'route') { e.stopImmediatePropagation(); S.drawPts.pop(); finishRoute(); } }, true);
  window.addEventListener('keydown', (e) => {
    if (!active() || (e.target && e.target.closest && e.target.closest('input, textarea, select'))) return;
    if (e.key === 'Enter' && S.tool === 'route') { e.stopImmediatePropagation(); finishRoute(); }
    else if (e.key === 'Escape') { e.stopImmediatePropagation(); if (S.drawPts.length || S.zoneDrag) { S.drawPts = []; S.zoneDrag = null; } else setTool(null); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { e.stopImmediatePropagation(); deleteSel(); }
  }, true);

  // ---------- PCs: tokens <-> sim ----------
  // PC tokens on this battle map become 'pc' entities. Out of a fight they simply follow their token.
  // In a fight the sim moves them (snap on joining, action-bar moves) and we write that back to the token.
  // HP and AC come from the character sheet; attacks on PCs are only reported (apply them on the sheet).
  const parseBonus = (v) => parseInt(String(v ?? '').replace(/[^0-9-]/g, ''), 10) || 0;
  function statsFromSheet(t) {
    const base = G.makeStats('pc', ['pc']);
    const ch = sheetFor(t);
    if (!ch) { const h = hpOf(t); if (h) { base.hp = +h.hp || base.hp; base.hpMax = +h.max || Math.max(base.hpMax, base.hp); } return base; }
    const st = ch.stats || {}, c = ch.combat || {}, mod = (v) => Math.floor(((+v || 10) - 10) / 2);
    const attacks = (ch.attacks || []).map((a) => {
      const range = String(a.range || ''), rm = range.match(/(\d+)\s*\/\s*(\d+)/);
      const thrown = /dagger|handaxe|javelin|spear|trident|light hammer|dart/i.test(a.name || '');
      const dice = String(a.damage || a.damage_dice || '').match(/\d*d\d+(\s*[+-]\s*\d+)?/i);
      if (!dice) return null;
      return {
        name: a.name || 'Attack', kind: rm ? (thrown ? 'both' : 'ranged') : 'melee',
        bonus: parseBonus(a.to_hit ?? a.attack_bonus), reach: /reach/i.test(range) || /glaive|halberd|pike|whip|lance/i.test(a.name || '') ? 2 : 1,
        range: rm ? { normal: +rm[1] / 5, long: +rm[2] / 5 } : null,
        dmg: [{ dice: dice[0].replace(/\s+/g, ''), type: String(a.damage_type || 'slashing').toLowerCase() }],
      };
    }).filter(Boolean);
    // Class features the sim knows: from the sheet's class and level.
    const cls = String(ch.class || '').toLowerCase(), lvl = parseInt(ch.level, 10) || 1, features = [];
    if (/fighter/.test(cls)) { features.push('second-wind'); if (lvl >= 2) features.push('action-surge'); }
    if (/rogue/.test(cls) && lvl >= 2) features.push('cunning-action');
    const extra = /fighter/.test(cls) ? (lvl >= 20 ? 4 : lvl >= 11 ? 3 : lvl >= 5 ? 2 : 1) : /paladin|ranger|barbarian|monk/.test(cls) && lvl >= 5 ? 2 : 1;
    return {
      ...base, name: t.name, level: lvl, features,
      str: st.str ?? base.str, dex: st.dex ?? base.dex, con: st.con ?? base.con, int: st.int ?? base.int, wis: st.wis ?? base.wis, cha: st.cha ?? base.cha,
      hpMax: +c.hp_max || base.hpMax, hp: c.hp_current != null ? +c.hp_current : (+c.hp_max || base.hp),
      ac: +c.ac || base.ac, speedFt: parseInt(c.speed, 10) || 30,
      initiative: c.initiative_bonus != null ? parseBonus(c.initiative_bonus) : mod(st.dex),
      attacks: attacks.length ? attacks : base.attacks,
      ...(extra > 1 ? (() => { const all = attacks.length ? attacks : base.attacks, m = all.find((a) => a.kind !== 'ranged'), r = all.find((a) => a.kind === 'ranged');
        return { multiattack: m ? [{ name: m.name, count: extra }] : null, multiattackRanged: r ? [{ name: r.name, count: extra }] : null }; })() : { multiattack: null, multiattackRanged: null }),
    };
  }
  const tokG = (tok) => ({ x: tok.x * S.scene.w / S.scene.ppg, y: tok.y * S.scene.h / S.scene.ppg });

  function syncPCs() {
    const sim = S.sim, b = db.battles[S.bid], toks = (b && b.tokens) || {};
    const seen = new Set();
    for (const [id, tok] of Object.entries(toks)) {
      const t = db.things[id];
      if (!t || !t.traits || !t.traits.pc || tok.x == null) continue;
      seen.add(id);
      let e = sim.get(id);
      const g = tokG(tok);
      if (!e) {
        e = sim.spawn({ tags: ['pc'], x: g.x, y: g.y, name: t.name, id });
        e.stats = statsFromSheet(t);
        S.pcSync[id] = { tx: tok.x, ty: tok.y };
      }
      const rec = S.pcSync[id] ||= { tx: tok.x, ty: tok.y };
      if (tok.x !== rec.tx || tok.y !== rec.ty) { e.x = g.x; e.y = g.y; rec.tx = tok.x; rec.ty = tok.y; } // you dragged the token
      else if (!e.combatId) { e.x = g.x; e.y = g.y; }
      // Live HP from the sheet; 0 HP = down (out of the fight), healed = back up.
      const fresh = statsFromSheet(t);
      e.stats = { ...fresh, hp: fresh.hp };
      if (e.stats.hp <= 0 && !e.dead) { e.dead = true; e.status = 'Down'; logLine(`${e.name} is down!`, true); }
      else if (e.stats.hp > 0 && e.dead) { e.dead = false; e.status = 'Up again'; }
    }
    for (const e of sim.entities.slice()) if (G.roleOf(e) === 'pc' && !seen.has(e.id)) { sim.remove(e.id); delete S.pcSync[e.id]; }
  }

  // After a sim step: if the sim moved a PC (snapped into a fight, walked a square), move its token.
  function writeBackPCs() {
    for (const e of S.sim.entities) {
      if (G.roleOf(e) !== 'pc' || !e.combatId) continue;
      const c = S.sim.combatOf(e), job = c && c.queue[0];
      if (job && job.type === 'move' && job.actor === e.id && job.stepping) continue; // mid-square: wait
      const rec = S.pcSync[e.id], tok = db.battles[S.bid].tokens[e.id];
      if (!rec || !tok) continue;
      const g = tokG(tok);
      if (Math.hypot(g.x - e.x, g.y - e.y) < 0.05) continue;
      const pos = { x: +(e.x * S.scene.ppg / S.scene.w).toFixed(5), y: +(e.y * S.scene.ppg / S.scene.h).toFixed(5) };
      rec.tx = pos.x; rec.ty = pos.y;
      moveToken(S.bid, e.id, pos);
    }
  }

  // ---------- fight log ----------
  function logLine(text, pc = false) { S.log.unshift({ text, pc }); if (S.log.length > 40) S.log.pop(); }
  function logEvent(ev) {
    const sim = S.sim, nm = (id) => (sim.get(id) || {}).name || '?';
    const roll = (ev) => `${ev.total} vs AC ${ev.ac}${ev.mode && ev.mode !== 'normal' ? ` (${ev.mode})` : ''}`;
    const how = (ev) => `${ev.attack || 'attack'}${ev.source === 'opportunity' ? ' (opportunity)' : ''}${ev.penalty ? ` (disadvantage: ${ev.penalty})` : ''}`;
    if (ev.type === 'attackPC') logLine(`${nm(ev.by)}'s ${how(ev)} on ${nm(ev.target)}: ${ev.total} to hit${ev.crit ? ' (crit!)' : ''}${ev.miss ? `, likely a miss` : `, ${ev.damage} damage if that hits`} → apply on the sheet`, true);
    else if (ev.type === 'hit') logLine(`${nm(ev.by)}'s ${how(ev)} hits ${nm(ev.id)}: ${roll(ev)}, ${ev.amount}${ev.fortitude ? ' (stays up at 1 HP)' : ''}`);
    else if (ev.type === 'miss') logLine(`${nm(ev.by)}'s ${how(ev)} misses ${nm(ev.id)}: ${roll(ev)}`);
    else if (ev.type === 'death') { logLine(`${nm(ev.id)} falls`); const e = sim.get(ev.id); if (e && e.cardId && db.things[e.cardId]) { db.things[e.cardId].traits.status = 'Dead'; save(); } }
    else if (ev.type === 'reanimated') { logLine(`${nm(ev.id)} rises as a zombie`); const e = sim.get(ev.id); if (e && e.cardId && db.things[e.cardId]) { db.things[e.cardId].traits.status = 'Undead (zombie)'; save(); } }
    else if (ev.type === 'escaped') logLine(`${nm(ev.id)} got away`);
    else if (ev.type === 'joined') logLine(`${nm(ev.id)} joins the fight`);
    else if (ev.type === 'combatStart') logLine(`Fight! ${ev.order.map((o) => o.name).join(', ')}`);
    else if (ev.type === 'combatEnd') logLine('The fight is over');
    else if (ev.type === 'action' && ev.action !== 'attack') logLine(`${nm(ev.id)} uses ${G.actions[ev.action].label}${ev.heal ? ` (regain ${ev.heal} HP${G.roleOf(sim.get(ev.id) || { tags: [] }) === 'pc' ? ' → add on the sheet' : ''})` : ''}`, !!ev.heal);
    else if (ev.type === 'turn') { const e = sim.get(ev.id); if (e && G.roleOf(e) === 'pc') { logLine(`${e.name}'s turn`, true); showStatus(`${e.name}'s turn: click a square to move, click an enemy to attack, Space ends the turn`); } }
  }

  // ---------- PC turn: action bar ----------
  function turnPC() {
    if (!S.sim) return null;
    for (const c of S.sim.combats) { const cur = c.current(); if (cur && c.phase === 'pc' && G.roleOf(cur) === 'pc') return cur; }
    return null;
  }
  const bar = document.createElement('div');
  bar.id = 'townBar';
  bar.className = 'absolute left-1/2 -translate-x-1/2 bottom-16 glass-panel rounded-xl border border-amber-500/40 shadow-2xl px-3 py-2 text-xs text-slate-300 flex flex-col items-center gap-1.5';
  bar.style.cssText = 'z-index:31;display:none';
  viewport.appendChild(bar);
  let barSig = '';
  function renderBar() {
    const pc = turnPC();
    if (!pc || db.view.level !== 'VTT') { bar.style.display = 'none'; S.targeting = null; barSig = ''; return; }
    const c = S.sim.combatOf(pc), st = c.ts(pc), busy = !c.canCommand(pc);
    const btns = G.barFor(c, pc).map((id, i) => {
      const a = G.actions[id];
      const ok = a.needsTarget ? (st[a.cost] > 0 || 'No action left') : a.canUse(c, pc);
      return { id, i, label: a.label, tip: ok === true ? a.describe : `${a.describe} (${ok})`, on: S.targeting === id, dis: ok !== true || busy };
    });
    const sig = JSON.stringify([pc.id, st, busy, S.targeting, S.running, btns.map((b) => b.dis)]);
    bar.style.display = 'flex';
    if (sig === barSig) return;
    barSig = sig;
    const pip = (k, col) => `<span class="inline-block w-2.5 h-2.5 rounded-full ml-1 align-[-1px]" style="background:${st[k] > 0 ? col : '#334155'}"></span>`;
    bar.innerHTML = `<div class="flex gap-3 text-slate-400"><b class="text-amber-300">${esc(pc.name)}'s turn</b>
        <span>Action${pip('action', '#4ade80')}</span><span>Bonus${pip('bonus', '#fbbf24')}</span><span>Reaction${pip('reaction', '#c084fc')}</span>
        <span>Move <b class="text-slate-100">${st.move} ft</b></span>${S.running ? '' : '<span class="text-rose-300">town paused</span>'}</div>
      <div class="flex gap-1">${btns.map((b) => `<button data-a="${b.id}" title="${esc(b.tip)}" class="${b.on ? BTN_ON : BTN} ${b.dis ? 'opacity-40 pointer-events-none' : ''}">${b.label} <span class="text-slate-500">${b.i + 1}</span></button>`).join('')}
        <button data-a="__end" class="${BTN} ${busy ? 'opacity-40 pointer-events-none' : ''}">End turn <span class="text-slate-500">Space</span></button></div>
      <div id="townBarMsg" class="text-amber-300 min-h-[14px]">${S.targeting ? `Click an enemy for ${G.actions[S.targeting].label} (Esc cancels)` : ''}</div>`;
    bar.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => (b.dataset.a === '__end' ? endPCTurn() : useAction(b.dataset.a))));
  }
  const barMsg = (m) => { const el = bar.querySelector('#townBarMsg'); if (el) el.textContent = m; };
  function useAction(id) {
    const pc = turnPC(); if (!pc) return;
    if (G.actions[id].needsTarget) { S.targeting = S.targeting === id ? null : id; barSig = ''; renderBar(); return; }
    const r = S.sim.combatOf(pc).commandAction(pc, id);
    if (r !== true) barMsg(r);
    barSig = ''; renderBar();
  }
  function endPCTurn() {
    const pc = turnPC(); if (!pc) return;
    const c = S.sim.combatOf(pc);
    if (!c.queue.length) { S.targeting = null; c.endTurn(); }
  }
  // Click (not drag) on the map during a PC's turn: attack the enemy under the cursor, or move to that square.
  function turnClick(g) {
    const pc = turnPC(); if (!pc) return false;
    const c = S.sim.combatOf(pc);
    const hit = S.sim.entities.find((e) => e !== pc && !e.dead && Math.hypot(e.x - g.x, e.y - g.y) <= e.radius + 0.25);
    if (hit && S.sim.isEnemy(pc, hit)) {
      const r = c.commandAction(pc, S.targeting || 'attack', hit);
      if (r !== true) barMsg(r); else S.targeting = null;
      barSig = ''; return true;
    }
    if (hit) return false;
    if (S.targeting) { barMsg('Click an enemy'); return true; }
    const cell = S.sim.nav.cellOf(g.x, g.y);
    if (!c.commandMove(pc, cell.cx, cell.cy)) { barMsg(c.canCommand(pc) ? 'Can\'t reach that square' : 'Wait for the current move to finish'); return false; }
    return true;
  }
  let downAt = null;
  viewport.addEventListener('pointerdown', (e) => {
    downAt = null;
    if (S.tool || e.button !== 0 || db.view.level !== 'VTT' || !turnPC() || e.target.closest('#townPanel, #townBar, button, input, label')) return;
    const onToken = e.target.closest('#vttTokensLayer > *');
    if (onToken) return; // dragging a token (e.g. nudging the PC by hand) still works as usual
    downAt = { x: e.clientX, y: e.clientY };
  }, true);
  viewport.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) { downAt = null; return; }
    downAt = null;
    if (turnClick(gridAt(e))) { barSig = ''; renderBar(); } // let the app finish its own pointer handling (pan state etc.)
  }, true);
  window.addEventListener('keydown', (e) => {
    const pc = turnPC();
    if (!pc || db.view.level !== 'VTT' || S.tool || (e.target && e.target.closest && e.target.closest('input, textarea, select'))) return;
    const n = parseInt(e.key, 10);
    if (e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); endPCTurn(); }
    else if (n >= 1 && n <= G.barFor(S.sim.combatOf(pc), pc).length) { e.stopImmediatePropagation(); useAction(G.barFor(S.sim.combatOf(pc), pc)[n - 1]); }
    else if (e.key === 'Escape' && S.targeting) { e.stopImmediatePropagation(); S.targeting = null; barSig = ''; renderBar(); }
  }, true);

  // Reachable squares, the hovered path with its cost, and "!" where leaving a square provokes.
  function drawTurnOverlay(px) {
    const pc = turnPC(); if (!pc) return;
    const c = S.sim.combatOf(pc), nav = S.sim.nav;
    if (!c.canCommand(pc)) return;
    const key = `${c.round}:${c.turn}:${c.ts(pc).move}:${pc.x}:${pc.y}`;
    if (drawTurnOverlay.key !== key) { drawTurnOverlay.key = key; drawTurnOverlay.reach = c.reachable(pc); }
    ctx.fillStyle = 'rgba(99,102,241,0.18)';
    for (const n of drawTurnOverlay.reach.values()) if (n.endable && n.cost > 0) ctx.fillRect(n.cx + 0.05, n.cy + 0.05, 0.9, 0.9);
    const enemiesInReach = c.enemiesOf(pc).filter((o) => c.canAttack(pc, o));
    for (const o of enemiesInReach) { ctx.strokeStyle = S.targeting ? '#ef4444' : 'rgba(239,68,68,0.6)'; ctx.lineWidth = 2.5 * px; ctx.beginPath(); ctx.arc(o.x, o.y, o.radius + 0.14, 0, 7); ctx.stroke(); }
    if (!S.hover || S.targeting) return;
    const hc = nav.cellOf(S.hover.x, S.hover.y);
    const who = S.sim.entities.find((e) => e !== pc && !e.dead && Math.hypot(e.x - S.hover.x, e.y - S.hover.y) <= e.radius + 0.25);
    ctx.font = `bold ${12 * px}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center';
    if (who && S.sim.isEnemy(pc, who)) {
      const mode = c.attackMode(pc, who), seq = mode ? c.attackSequence(pc, mode) : [];
      const pen = mode === 'ranged' && seq.length ? c.rangedPenalty(pc, who, seq[0]) : null;
      ctx.fillStyle = pen ? '#fcd34d' : '#fff'; ctx.textBaseline = 'top';
      ctx.fillText(seq.length ? `${seq.length > 1 ? seq.length + '× ' : ''}${seq[0].name} +${seq[0].bonus} vs AC ${who.stats.ac}${pen ? ` (disadvantage: ${pen})` : ''}` : (c.rangedAttack(pc) ? 'Out of range / no clear shot' : 'Out of reach'), who.x, who.y + who.radius + 0.12);
      return;
    }
    const pv = c.preview(pc, hc.cx, hc.cy);
    if (!pv.ok) return;
    const pts = [{ x: pc.x, y: pc.y }, ...pv.cells.map((q) => nav.center(q.cx, q.cy))];
    ctx.strokeStyle = pv.provokes.length ? '#f59e0b' : '#a5b4fc'; ctx.lineWidth = 3 * px; ctx.setLineDash([6 * px, 4 * px]);
    ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke(); ctx.setLineDash([]);
    for (const pr of pv.provokes) {
      const from = pr.i === 0 ? nav.cellOf(pc.x, pc.y) : pv.cells[pr.i - 1];
      ctx.fillStyle = 'rgba(239,68,68,0.35)'; ctx.fillRect(from.cx, from.cy, 1, 1);
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText('!', from.cx + 0.5, from.cy + 0.5);
    }
    const end = pts[pts.length - 1];
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${pv.cost} ft${pv.provokes.length ? ' · provokes' : ''}`, end.x, end.y - 0.4);
  }

  // ---------- named NPCs: promote a townsperson to a pin-board card ----------
  // The townsperson stays in the town (same routes, same stats); the card is linked to them and to this battle map.
  function makeCard(e) {
    const s = e.stats, role = G.roles[G.roleOf(e)];
    const id = createThing('npc', e.name, { role: role.label, townNpc: e.id });
    const t = db.things[id];
    t.notes = [`${s.name || role.label}${s.cr != null ? ` (CR ${s.cr})` : ''}: AC ${s.ac}, HP ${s.hpMax}, speed ${s.speedFt ?? 30} ft.`,
      (s.attacks || []).map((a) => `${a.name} +${a.bonus} (${a.dmg.map((d) => `${d.dice} ${d.type}`).join(' + ')})`).join('; '),
      e.shop ? `Runs a ${e.shop.label}.` : '', `Met at ${db.things[S.bid] ? db.things[S.bid].name : 'the town'}.`].filter(Boolean).join('\n');
    t.properties = [{ key: 'tags', value: e.tags.join(', ') }, ...(s.monster ? [{ key: 'stat block', value: s.monster }] : [])];
    const lid = uid('link'); db.links[lid] = { id: lid, from: id, to: S.bid, label: 'met at' };
    e.cardId = id;
    persist(); changed({ keepInspector: true });
    logLine(`${e.name} now has a pin-board card`);
    showStatus(`${e.name} is on the pin board now`);
  }

  // ---------- step 3: session, rumors, shops ----------
  const session = () => (db.settings.town ||= { day: 1, rumors: '' }); // settings sync with the campaign
  const shopOf = (e) => (G.shops && G.shops.ready && G.roleOf(e) === 'shopkeeper' ? G.shops.ensure(e, { day: session().day, zone: S.sim.homeZone(e) }) : null);
  const pcsHere = () => S.sim ? S.sim.entities.filter((e) => G.roleOf(e) === 'pc' && !e.dead) : [];

  // What shopkeepers can say: only this session's rumors, plus talk about their own wares.
  function sessionCtx() {
    const rumors = String(session().rumors || '').split('\n').map((l) => l.trim()).filter(Boolean)
      .map((l) => ({ text: l.replace(/^\?\s*/, '').replace(/\.$/, ''), unreliable: l.startsWith('?') }));
    return { homeName: 'town', landmarks: [], people: [], factions: [], events: [], rumors };
  }
  function bark(e, n = 0) {
    if (!G.barks || !G.barks.data || e.dead || !e.chatty) return null;
    const wares = e.shop ? e.shop.inventory.filter((x) => x.qty > 0) : [];
    const ware = wares.length ? wares[Math.floor(Math.random() * wares.length)].name.toLowerCase() : null;
    const r = G.barks.line({ id: e.id, role: G.roleOf(e), name: e.name }, sessionCtx(), { day: session().day, n, extra: { ware } });
    if (!r) return null;
    S.lastBark.set(e.id, S.sim.time);
    S.bubbles = S.bubbles.filter((b) => b.id !== e.id);
    S.bubbles.push({ id: e.id, text: r.text, life: Math.min(7, 2.5 + r.text.length / 18) });
    logLine(`${e.name}: "${r.text}"`);
    return r;
  }
  // A shopkeeper greets a PC who walks up and can see them (30 s cooldown each).
  function greetings() {
    if (S.bubbles.length >= 3) return;
    const pcs = pcsHere().filter((p) => !p.combatId);
    for (const e of S.sim.entities) {
      if (e.dead || e.combatId || !e.chatty || G.roleOf(e) !== 'shopkeeper') continue;
      if (S.sim.time - (S.lastBark.get(e.id) ?? -1e9) < 30) continue;
      if (pcs.some((p) => Math.hypot(p.x - e.x, p.y - e.y) <= 3 && S.sim.nav.hasLOS(p.x, p.y, e.x, e.y))) { shopOf(e); bark(e); return; }
    }
  }
  function drawBubbles(px) {
    if (!S.bubbles.length) return;
    ctx.font = `${12 * px}px Inter, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const maxW = 210 * px, pad = 6 * px, lh = 15 * px;
    for (const b of S.bubbles) {
      const e = S.sim.get(b.id); if (!e) continue;
      const lines = []; let cur = '';
      for (const w of b.text.split(' ')) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
      if (cur) lines.push(cur);
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2, h = lines.length * lh + pad * 2;
      const x = e.x - w / 2, y = e.y - e.radius - 0.45 - h;
      ctx.globalAlpha = Math.min(1, b.life * 2);
      ctx.fillStyle = 'rgba(248,245,235,0.96)'; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = px;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 6 * px); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(e.x - 5 * px, y + h); ctx.lineTo(e.x, y + h + 7 * px); ctx.lineTo(e.x + 5 * px, y + h); ctx.fill();
      ctx.fillStyle = '#1e1b16';
      lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad + i * lh));
      ctx.globalAlpha = 1;
    }
  }
  // Townsfolk who walk up to a shopkeeper buy something with pocket money (5–150 coin).
  function shopEvent(ev) {
    if (ev.type !== 'shopVisit') return;
    const buyer = S.sim.get(ev.id), keeper = S.sim.get(ev.shop), shop = keeper && shopOf(keeper);
    const sale = shop && G.shops.npcPurchase(shop, 5 + Math.floor(Math.random() * 146));
    if (!sale) return;
    shop.ledger.unshift(`${sale.item.name} to ${buyer.name}`);
    S.floaters.push({ x: keeper.x, y: keeper.y, text: `+${G.shops.money(sale.price)}`, color: '#facc15', life: 1.4 });
  }

  // ---- Session menu: Rumors & day ----
  const sessBtn = document.createElement('button');
  sessBtn.className = 'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800 text-left cursor-pointer';
  sessBtn.innerHTML = '<i class="fa-solid fa-comments w-4 text-emerald-400"></i><span>Rumors &amp; day…</span>';
  const lockPing = document.getElementById('lockPingBtn');
  if (lockPing) lockPing.after(sessBtn);
  const modal = (id) => { const m = document.createElement('div'); m.id = id; m.className = 'absolute glass-panel rounded-xl border border-slate-700 shadow-2xl text-xs text-slate-300 flex flex-col'; m.style.cssText = 'z-index:40;display:none'; viewport.appendChild(m); return m; };
  const rumorBox = modal('townRumors');
  rumorBox.style.cssText += ';left:50%;top:12%;transform:translateX(-50%);width:min(520px,90%)';
  function openRumors() {
    const ss = session();
    rumorBox.innerHTML = `<div class="flex items-center gap-2 px-3 py-2 border-b border-slate-800"><i class="fa-solid fa-comments text-emerald-400"></i><b class="text-slate-100">Session rumors</b>
        <span class="text-slate-500">day ${ss.day}</span><button id="townRumClose" class="${BTN} ml-auto">Close</button></div>
      <div class="p-3 space-y-2">
        <p class="text-slate-400">Shopkeepers pass these on, one per line. Start a line with <b class="text-slate-200">?</b> if it might not be true. Nobody else talks.</p>
        <textarea id="townRumText" rows="7" class="${INPUT} font-mono">${esc(ss.rumors)}</textarea>
        <div class="flex gap-2 items-center"><button id="townNextDay" class="${BTN}"><i class="fa-solid fa-sun"></i> Next day</button><span class="text-slate-500">Shops restock and prices change each day.</span></div>
      </div>`;
    rumorBox.style.display = 'flex';
    const ta = rumorBox.querySelector('#townRumText');
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    ta.oninput = () => { session().rumors = ta.value; save(); };
    rumorBox.querySelector('#townRumClose').onclick = () => (rumorBox.style.display = 'none');
    rumorBox.querySelector('#townNextDay').onclick = () => { session().day++; S.lastBark.clear(); save(); logLine(`Day ${session().day}: the shops restock`); openRumors(); if (S.trade) renderTrade(); };
  }
  sessBtn.onclick = openRumors;

  // ---- Trade window ----
  const tradeBox = modal('townTrade');
  tradeBox.style.cssText += ';left:6%;right:6%;top:8%;bottom:14%';
  function walletOf(pcId) {
    const t = db.things[pcId], e = S.sim.get(pcId);
    return { id: pcId, stats: (e && e.stats) || { cha: 10 }, purse: +(t.traits.coin || 0), items: (t.traits.pack || []).map((x) => ({ ...x })) };
  }
  function saveWallet(w) { const t = db.things[w.id]; t.traits.coin = w.purse; t.traits.pack = w.items; save(); }
  function openTrade(keeper) {
    const shop = shopOf(keeper);
    if (!shop) { showStatus('Only shopkeepers trade (and the shop data needs to load from data/).'); return; }
    const pcs = pcsHere();
    if (!pcs.length) { showStatus('Put a PC token on this battle map to trade.'); return; }
    const near = pcs.slice().sort((a, b) => Math.hypot(a.x - keeper.x, a.y - keeper.y) - Math.hypot(b.x - keeper.x, b.y - keeper.y))[0];
    S.trade = { keeper: keeper.id, pc: near.id, msg: '', sig: '' };
    const r = bark(keeper);
    S.trade.greet = r ? r.text : '';
    tradeBox.style.display = 'flex';
    renderTrade(true);
  }
  function closeTrade() { if (S.trade) persist(); S.trade = null; tradeBox.style.display = 'none'; }
  function renderTrade(force = false) {
    const T = S.trade; if (!T) return;
    const keeper = S.sim.get(T.keeper), t = db.things[T.pc];
    if (!keeper || keeper.dead || keeper.combatId || !t) { closeTrade(); return; }
    const shop = shopOf(keeper), w = walletOf(T.pc), M = G.shops.money, pcs = pcsHere();
    const stock = shop.inventory.filter((x) => x.qty > 0).map((x) => { const p = G.shops.buyPrice(shop, x, w.id); return { x, p }; });
    const pack = w.items.map((x) => ({ x, p: G.shops.sellPrice(shop, x, w.id) }));
    const sig = JSON.stringify([T.pc, T.msg, w.purse, shop.gold, stock.map((s) => s.x.key + s.x.qty + s.p), pack.map((s) => s.x.key + s.x.qty + s.p), shop.haggled[w.id], shop.ledger.length]);
    if (!force && sig === T.sig) return;
    T.sig = sig;
    const row = (name, qty, rar, price, btn) => `<div class="grid items-center gap-2 px-2 py-1 border-b border-slate-800/80" style="grid-template-columns:1fr auto auto"><span>${esc(name)}${qty > 1 ? ` <span class="text-slate-500">×${qty}</span>` : ''}${rar ? ` <span class="text-fuchsia-300 text-[10px]">${esc(rar)}</span>` : ''}</span><span class="${price ? 'text-slate-200' : 'text-slate-600'}">${price ? M(price) : 'won\'t buy'}</span>${btn}</div>`;
    tradeBox.innerHTML = `<div class="flex items-center gap-2 px-3 py-2 border-b border-slate-800"><i class="fa-solid fa-scale-balanced text-amber-400"></i>
        <b class="text-slate-100">${esc(keeper.name)} · ${esc(shop.label)}</b><span class="text-slate-500">${M(shop.gold)} on hand · day ${session().day}</span>
        <span class="ml-auto flex gap-1 items-center">
          <select id="townTradePc" class="${INPUT} w-auto">${pcs.map((p) => `<option value="${p.id}" ${p.id === T.pc ? 'selected' : ''}>${esc(p.name)}${Math.hypot(p.x - keeper.x, p.y - keeper.y) <= 3 ? '' : ' (far away)'}</option>`).join('')}</select>
          <button id="townHaggle" class="${BTN} ${shop.haggled[w.id] != null ? 'opacity-40 pointer-events-none' : ''}">Haggle</button>
          <button id="townTradeClose" class="${BTN}">Close</button></span></div>
      ${T.greet ? `<div class="px-3 pt-2 italic text-slate-300">"${esc(T.greet)}"</div>` : ''}
      <div class="flex-1 grid grid-cols-2 gap-3 p-3 min-h-0">
        <div class="flex flex-col min-h-0"><div class="text-slate-400 mb-1 font-semibold">For sale</div>
          <div class="overflow-y-auto border border-slate-800 rounded-lg">${stock.map(({ x, p }) => row(x.name, x.qty, x.rarity, p, `<button data-buy="${esc(x.key)}" class="${BTN} ${p > w.purse ? 'opacity-40 pointer-events-none' : ''}">Buy</button>`)).join('') || '<div class="p-2 text-slate-500">Sold out.</div>'}</div></div>
        <div class="flex flex-col min-h-0"><div class="text-slate-400 mb-1 font-semibold flex items-center gap-2">${esc(t.name)}'s pack
            <span class="ml-auto">Coin <input id="townPurse" type="number" min="0" value="${w.purse}" class="${INPUT} w-24 inline-block"></span></div>
          <div class="overflow-y-auto border border-slate-800 rounded-lg">${pack.map(({ x, p }) => row(x.name, x.qty, x.rarity, p, `<button data-sell="${esc(x.key)}" class="${BTN} ${!p || p > shop.gold ? 'opacity-40 pointer-events-none' : ''}">Sell</button>`)).join('') || '<div class="p-2 text-slate-500">Nothing bought here yet. (Their character sheet inventory isn\'t touched.)</div>'}</div></div>
      </div>
      <div class="px-3 py-2 border-t border-slate-800 flex gap-3 text-slate-400"><span class="text-amber-300">${esc(T.msg)}</span>
        <span class="ml-auto">${shop.ledger.length ? `Sold today: ${esc(shop.ledger.slice(0, 3).join(', '))}${shop.ledger.length > 3 ? '…' : ''}` : ''}</span></div>`;
    const q = (sel) => tradeBox.querySelector(sel);
    q('#townTradeClose').onclick = closeTrade;
    q('#townTradePc').onchange = (e) => { T.pc = e.target.value; T.msg = ''; renderTrade(true); };
    q('#townHaggle').onclick = () => { const w2 = walletOf(T.pc); T.msg = G.shops.haggle(shop, w2).msg; renderTrade(true); };
    const purse = q('#townPurse');
    purse.addEventListener('keydown', (e) => e.stopPropagation());
    purse.onchange = () => { const w2 = walletOf(T.pc); w2.purse = Math.max(0, Math.round(+purse.value || 0)); saveWallet(w2); renderTrade(true); };
    tradeBox.querySelectorAll('[data-buy]').forEach((b) => (b.onclick = () => { const w2 = walletOf(T.pc); T.msg = G.shops.buy(shop, b.dataset.buy, w2).msg; saveWallet(w2); renderTrade(true); }));
    tradeBox.querySelectorAll('[data-sell]').forEach((b) => (b.onclick = () => { const w2 = walletOf(T.pc); T.msg = G.shops.sell(shop, b.dataset.sell, w2).msg; saveWallet(w2); renderTrade(true); }));
  }
  // Double-click a shopkeeper on the map (no town tool active) to trade.
  viewport.addEventListener('dblclick', (e) => {
    if (S.tool || db.view.level !== 'VTT' || !S.sim) return;
    const g = gridAt(e), hit = S.sim.entities.find((x) => !x.dead && G.roleOf(x) === 'shopkeeper' && Math.hypot(x.x - g.x, x.y - g.y) <= x.radius + 0.25);
    if (hit) { e.stopImmediatePropagation(); openTrade(hit); }
  }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (S.trade || rumorBox.style.display !== 'none')) { e.stopImmediatePropagation(); closeTrade(); rumorBox.style.display = 'none'; } }, true);

  // ---------- step 4: share with players ----------
  // Everything players need, in one small object, written only when it changes (max 5×/s).
  let lastPub = '';
  let pubPath = '';
  function publish() {
    const sim = S.sim; if (!sim) return;
    const path = livePath('town/state');
    if (pubPath && pubPath !== path) { Live.set(pubPath, null); lastPub = ''; } // switched campaign
    pubPath = path;
    const r2 = (v) => Math.round(v * 100) / 100;
    const pc = turnPC();
    let turn = null;
    if (pc) {
      const c = sim.combatOf(pc), st = c.ts(pc), busy = !c.canCommand(pc);
      const reach = busy ? [] : [...c.reachable(pc).values()].filter((n) => n.endable && n.cost > 0).map((n) => [n.cx, n.cy, n.cost]);
      const foes = c.enemiesOf(pc).filter((o) => c.ts(o).reaction > 0);
      const threat = [];
      for (const o of foes.filter((f) => c.hasMelee(f))) { const oc = c.cell(o), rr = c.reachSq(o); for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) threat.push([oc.cx + dx, oc.cy + dy]); }
      const acts = G.barFor(c, pc).map((id) => { const a = G.actions[id]; const ok = a.needsTarget ? st[a.cost] > 0 : a.canUse(c, pc) === true; return [id, a.label, ok ? 1 : 0]; });
      turn = { pc: pc.id, busy, acts, res: [st.action, st.bonus, st.reaction, st.move], dis: c.hasEffect(pc, 'disengage') ? 1 : 0,
        reach, threat, foes: c.enemiesOf(pc).filter((o) => c.canAttack(pc, o)).map((o) => o.id), msg: S.cmdMsg || '' };
    }
    const snap = {
      bid: S.bid, running: S.running ? 1 : 0,
      npcs: sim.entities.filter((e) => G.roleOf(e) !== 'pc').map((e) => [e.id, e.name, r2(e.x), r2(e.y), r2(e.facing), G.roles[G.roleOf(e)].color, e.stats.hp, e.stats.hpMax, e.dead ? 1 : 0, e.combatId || 0]),
      fights: sim.combats.map((c) => ({ id: c.id, round: c.round, cur: c.current() ? c.current().id : null,
        order: c.order.map((o) => { const e = sim.get(o.id); return [o.id, o.name, o.roll, !e || e.dead || o.escaped ? 1 : 0]; }) })),
      turn,
      bubbles: S.bubbles.map((b) => [b.id, b.text]),
      log: S.log.filter((l) => !l.pc || /turn|down/.test(l.text)).slice(0, 6).map((l) => l.text),
    };
    const str = JSON.stringify(snap);
    if (str === lastPub) return;
    lastPub = str;
    Live.set(livePath('town/state'), snap);
  }

  // Players' turn commands: { pc, by, kind: 'move'|'action'|'end', cx, cy, action, target }.
  // Only the PC whose turn it is, sent by that PC's player, gets through; everything runs through the same rules.
  // Re-subscribed whenever the app re-subscribes its live channels (campaign switch), so the path always matches.
  let cmdUnsub = null, cmdPath = '';
  function resubscribe() {
    const p = livePath('town/cmd');
    if (p === cmdPath) return;
    if (cmdUnsub) cmdUnsub();
    cmdPath = p; cmdUnsub = Live.on(p, onCmd);
  }
  resubscribe();
  function onCmd(v) {
    if (!v || !S.sim) return;
    for (const [key, cmd] of Object.entries(v)) {
      Live.remove(livePath('town/cmd/' + key));
      const pc = turnPC(), t = pc && db.things[pc.id];
      if (!pc || !cmd || cmd.pc !== pc.id || String(cmd.by || '').trim().toLowerCase() !== String(t.name || '').trim().toLowerCase()) continue;
      const c = S.sim.combatOf(pc);
      let r = true;
      if (cmd.kind === 'move') r = c.commandMove(pc, cmd.cx, cmd.cy) || 'Can\'t reach that square';
      else if (cmd.kind === 'action') r = c.commandAction(pc, cmd.action, cmd.target ? S.sim.get(cmd.target) : null);
      else if (cmd.kind === 'end') endPCTurn();
      S.cmdMsg = r === true ? '' : r;
      barSig = '';
    }
  }

  // While a PC is in a fight, lock token dragging for players (turns move them instead); unlock afterwards.
  function autoLock() {
    const fighting = S.sim.entities.some((e) => G.roleOf(e) === 'pc' && e.combatId && !e.dead);
    if (fighting && !liveSession.lockMove) { S.autoLocked = true; Live.update(livePath('session'), { lockMove: true }); }
    else if (!fighting && S.autoLocked) { S.autoLocked = false; if (liveSession.lockMove) Live.update(livePath('session'), { lockMove: false }); }
  }

  // ---------- loop ----------
  let last = performance.now(), persistT = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const onBattle = db.view.level === 'VTT' && S.sim && S.scene && db.view.battleId === S.bid;
    if (onBattle) {
      syncPCs();
      if (S.running) {
        S.sim.step(dt);
        for (const ev of S.sim.drainEvents()) { floaterFor(ev); logEvent(ev); shopEvent(ev); }
        writeBackPCs();
        if ((persistT += dt) > 20) { persistT = 0; townOf(S.bid).npcs = npcsToSave(); } // kept in memory; saved on pause / leave
      }
      for (const f of S.floaters) f.life -= dt;
      S.floaters = S.floaters.filter((f) => f.life > 0);
      for (const b of S.bubbles) b.life -= dt;
      S.bubbles = S.bubbles.filter((b) => b.life > 0 && S.sim.get(b.id) && !S.sim.get(b.id).dead);
      if ((S.barkT -= dt) <= 0) { S.barkT = 0.5; if (S.running) greetings(); if (S.trade) renderTrade(); }
      draw();
      if (S.running) renderPanel();
      renderBar();
      if ((S.pubT = (S.pubT || 0) - dt) <= 0) { S.pubT = 0.2; publish(); autoLock(); }
    } else { if (canvas.width) ctx.clearRect(0, 0, canvas.width, canvas.height); bar.style.display = 'none'; if (S.trade) closeTrade(); }
    requestAnimationFrame(frame);
  }
  function floaterFor(ev) {
    const put = (text, color, e = S.sim.get(ev.id)) => e && S.floaters.push({ x: e.x, y: e.y, text, color, life: 1.2 });
    if (ev.type === 'hit') put(`-${ev.amount}`, '#f87171');
    else if (ev.type === 'miss') put('miss', '#cbd5e1');
    else if (ev.type === 'death') put('dead', '#ef4444');
    else if (ev.type === 'reanimated') put('rises!', '#4ade80');
    else if (ev.type === 'joined') put('joins!', '#fb923c');
    else if (ev.type === 'save' && ev.success) put('refuses to die!', '#4ade80');
  }

  const COMBAT_COLORS = ['#f97316', '#ec4899', '#14b8a6', '#eab308', '#8b5cf6'];
  function draw() {
    const sim = S.sim, g = S.scene.ppg, px = 1 / (g * cam().zoom);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(g, 0, 0, g, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.font = `${12 * px}px Inter, system-ui, sans-serif`;

    if (S.overlay || S.tool) {
      for (const z of sim.world.zones) {
        const sel = S.sel && S.sel.id === z.id;
        ctx.fillStyle = 'rgba(52,211,153,0.07)'; ctx.fillRect(z.minX, z.minY, z.maxX - z.minX, z.maxY - z.minY);
        ctx.strokeStyle = sel ? '#fbbf24' : 'rgba(52,211,153,0.7)'; ctx.lineWidth = (sel ? 3 : 1.5) * px; ctx.setLineDash([6 * px, 4 * px]);
        ctx.strokeRect(z.minX, z.minY, z.maxX - z.minX, z.maxY - z.minY); ctx.setLineDash([]);
        ctx.fillStyle = '#d1fae5'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(`${z.name} [${z.tags.join(', ')}]`, z.minX + 4 * px, z.minY + 4 * px);
      }
      for (const r of sim.world.routes) {
        const sel = S.sel && S.sel.id === r.id;
        ctx.strokeStyle = sel ? '#fbbf24' : r.tags.includes('guard') ? 'rgba(250,204,21,0.8)' : 'rgba(148,163,184,0.8)';
        ctx.lineWidth = (sel ? 5 : 3) * px;
        ctx.beginPath(); r.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
      }
      if (S.drawPts.length) {
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2 * px; ctx.setLineDash([5 * px, 4 * px]);
        ctx.beginPath(); S.drawPts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        if (S.hover) ctx.lineTo(G.geom.snap(S.hover.x, 0.5), G.geom.snap(S.hover.y, 0.5));
        ctx.stroke(); ctx.setLineDash([]);
      }
      if (S.zoneDrag) {
        const { a, b } = S.zoneDrag;
        ctx.fillStyle = 'rgba(52,211,153,0.25)';
        ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x) + 1, Math.abs(a.y - b.y) + 1);
      }
    }

    drawTurnOverlay(px);

    for (const e of sim.entities) {
      const role = G.roles[G.roleOf(e)], sel = S.sel && S.sel.id === e.id;
      if (role.playerControlled) { // the token is the PC's picture; just add the fight ring
        if (e.combatId) {
          const c = sim.combatOf(e), turn = c && c.current() === e;
          ctx.strokeStyle = turn ? '#fcd34d' : '#f97316'; ctx.lineWidth = (turn ? 4 : 2) * px;
          ctx.beginPath(); ctx.arc(e.x, e.y, 0.55, 0, 7); ctx.stroke();
        }
        continue;
      }
      if (e.dead) { ctx.fillStyle = 'rgba(100,100,100,0.8)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius * 0.8, 0, 7); ctx.fill(); continue; }
      ctx.fillStyle = role.color; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, 7); ctx.fill();
      ctx.strokeStyle = sel ? '#fbbf24' : 'rgba(0,0,0,0.6)'; ctx.lineWidth = (sel ? 3 : 1.5) * px; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.facing) * e.radius, e.y + Math.sin(e.facing) * e.radius); ctx.stroke();
      if (e.combatId) {
        const c = sim.combatOf(e), turn = c && c.current() === e;
        const idx = parseInt(String(e.combatId).replace(/\D/g, ''), 10) || 0;
        ctx.strokeStyle = turn ? '#fcd34d' : COMBAT_COLORS[idx % COMBAT_COLORS.length]; ctx.lineWidth = (turn ? 4 : 2) * px;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 0.1, 0, 7); ctx.stroke();
      }
      const hp = e.stats.hp / e.stats.hpMax;
      if (hp < 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - 0.35, e.y - e.radius - 0.18, 0.7, 0.08);
        ctx.fillStyle = hp > 0.5 ? '#4ade80' : hp > 0.25 ? '#facc15' : '#ef4444'; ctx.fillRect(e.x - 0.35, e.y - e.radius - 0.18, 0.7 * hp, 0.08);
      }
      if (sel || cam().zoom * g > 45) {
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(e.name, e.x, e.y - e.radius - 0.22);
      }
    }
    ctx.font = `bold ${14 * px}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const f of S.floaters) { ctx.globalAlpha = Math.min(1, f.life * 2); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - 0.5 - (1.2 - f.life) * 0.4); }
    ctx.globalAlpha = 1;
    drawBubbles(px);
  }

  window.addEventListener('beforeunload', persist);
  requestAnimationFrame(frame);

  window.TownVTT = { onScene, onLevel, resize, resubscribe, state: S, persist };

  // =====================================================================
  //  Player side: draw what the DM's town publishes, take your own turns, WASD outside fights.
  // =====================================================================
  function runPlayer() {
    const P = { snap: null, pos: {}, nav: null, navSig: '', hover: null, targeting: null, keys: new Set(), lastSend: 0, pending: null };
    const esc2 = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cv = document.createElement('canvas');
    cv.className = 'absolute top-0 left-0 pointer-events-none';
    mapWrapper.insertBefore(cv, tokensLayer);
    const cx2 = cv.getContext('2d');
    const BTN2 = 'px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200';
    const BTN2_ON = 'px-2 py-1 rounded-lg border border-amber-500/60 bg-slate-900 text-amber-400';

    // The player's campaign can change after load (Firebase picks it once the campaign list arrives),
    // so this is re-subscribed whenever the app re-subscribes its own live channels.
    let stUnsub = null, stPath = '';
    function resubscribe() {
      const p = livePath('town/state');
      if (p === stPath) return;
      if (stUnsub) stUnsub();
      stPath = p; P.snap = null; P.pos = {};
      stUnsub = Live.on(p, (v) => {
        P.snap = v;
        for (const n of (v && v.npcs) || []) { const q = P.pos[n[0]] ||= { x: n[2], y: n[3] }; q.tx = n[2]; q.ty = n[3]; }
      });
    }
    resubscribe();

    const onMap = () => db.view.level === 'VTT' && ui.scene && P.snap && P.snap.bid === db.view.battleId;
    const myPc = () => { const b = db.battles[db.view.battleId]; if (!b) return null; for (const id of Object.keys(b.tokens || {})) { const t = db.things[id]; if (t && t.traits && t.traits.pc && playerName && t.name === playerName) return id; } return null; };
    const visible = (x, y) => !ui.vision || ui.vision.some((poly) => inPoly(poly, x, y));
    const myTurn = () => { const t = P.snap && P.snap.turn; return t && t.pc === myPc() ? t : null; };
    const inFight = (id) => P.snap && (P.snap.fights || []).some((f) => f.order.some((o) => o[0] === id && !o[3]));
    const send = (cmd) => { const pc = myPc(); if (pc) Live.push(livePath('town/cmd'), { ...cmd, pc, by: playerName, at: Date.now() }); };

    // --- bar + fight strip ---
    const pbar = document.createElement('div');
    pbar.className = 'absolute left-1/2 -translate-x-1/2 bottom-16 glass-panel rounded-xl border border-amber-500/40 shadow-2xl px-3 py-2 text-xs text-slate-300 flex flex-col items-center gap-1.5';
    pbar.style.cssText = 'z-index:31;display:none';
    viewport.appendChild(pbar);
    const strip = document.createElement('div');
    strip.className = 'absolute left-1/2 -translate-x-1/2 top-3 glass-panel rounded-xl border border-slate-700 px-3 py-1.5 text-xs text-slate-300 flex gap-2 items-center';
    strip.style.cssText = 'z-index:30;display:none';
    viewport.appendChild(strip);
    let pSig = '';
    function renderUi() {
      const t = onMap() && myTurn(), pc = myPc();
      const fight = onMap() && pc && (P.snap.fights || []).find((f) => f.order.some((o) => o[0] === pc));
      strip.style.display = fight ? 'flex' : 'none';
      if (fight) {
        const h = `<b class="text-slate-100">Round ${fight.round}</b>` + fight.order.map((o) => `<span class="${o[0] === fight.cur ? 'text-amber-300 font-semibold' : o[3] ? 'text-slate-600 line-through' : ''}">${esc2(o[1])}</span>`).join('<span class="text-slate-600">›</span>');
        if (strip._h !== h) { strip._h = h; strip.innerHTML = h; }
      }
      if (!t) { pbar.style.display = 'none'; P.targeting = null; pSig = ''; return; }
      pbar.style.display = 'flex';
      const [a, b, r, m] = t.res;
      const sig = JSON.stringify([t.res, t.busy, t.msg, P.targeting, t.dis, t.acts]);
      if (sig === pSig) return;
      pSig = sig;
      const pip = (v, col) => `<span class="inline-block w-2.5 h-2.5 rounded-full ml-1 align-[-1px]" style="background:${v > 0 ? col : '#334155'}"></span>`;
      const acts = (t.acts || [['attack', 'Attack', a > 0], ['dash', 'Dash', a > 0], ['disengage', 'Disengage', a > 0], ['dodge', 'Dodge', a > 0]]).map(([id, label, ok]) => [id, label, !!ok]);
      pbar.innerHTML = `<div class="flex gap-3 text-slate-400"><b class="text-amber-300">Your turn</b><span>Action${pip(a, '#4ade80')}</span><span>Bonus${pip(b, '#fbbf24')}</span><span>Reaction${pip(r, '#c084fc')}</span><span>Move <b class="text-slate-100">${m} ft</b></span></div>
        <div class="flex gap-1">${acts.map(([id, label, ok], i) => `<button data-a="${id}" class="${P.targeting === id ? BTN2_ON : BTN2} ${!ok || t.busy ? 'opacity-40 pointer-events-none' : ''}">${label} <span class="text-slate-500">${i + 1}</span></button>`).join('')}
          <button data-a="__end" class="${BTN2} ${t.busy ? 'opacity-40 pointer-events-none' : ''}">End turn <span class="text-slate-500">Space</span></button></div>
        <div class="text-amber-300 min-h-[14px]">${P.targeting ? 'Click an enemy (Esc cancels)' : esc2(t.msg)}</div>`;
      pbar.querySelectorAll('[data-a]').forEach((bt) => (bt.onclick = () => act(bt.dataset.a)));
    }
    function act(id) {
      if (id === '__end') { P.targeting = null; send({ kind: 'end' }); return; }
      if (id === 'attack') { P.targeting = P.targeting ? null : 'attack'; pSig = ''; renderUi(); return; }
      send({ kind: 'action', action: id });
    }

    // --- clicks on the map during your turn ---
    const gAt = (e) => { const p = toContent(e.clientX, e.clientY); return { x: p.x / ui.scene.ppg, y: p.y / ui.scene.ppg }; };
    let down = null;
    viewport.addEventListener('pointerdown', (e) => { down = myTurn() && e.button === 0 && !e.target.closest('button, input, #vttTokensLayer > *') ? { x: e.clientX, y: e.clientY } : null; }, true);
    viewport.addEventListener('pointerup', (e) => {
      const t = myTurn();
      if (!down || !t || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
      down = null;
      const g = gAt(e);
      const hit = (P.snap.npcs || []).find((n) => !n[8] && Math.hypot(n[2] - g.x, n[3] - g.y) <= 0.55);
      if (hit && t.foes.includes(hit[0])) { send({ kind: 'action', action: 'attack', target: hit[0] }); P.targeting = null; return; }
      if (P.targeting) return;
      const c = { cx: Math.floor(g.x), cy: Math.floor(g.y) };
      if (t.reach.some((q) => q[0] === c.cx && q[1] === c.cy)) send({ kind: 'move', cx: c.cx, cy: c.cy });
    }, true);
    viewport.addEventListener('pointermove', (e) => { if (ui.scene) P.hover = gAt(e); }, true);

    // --- keys: 1–4, Space, Esc on your turn; WASD walks your token outside fights ---
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      if (onMap() && myTurn()) {
        const n = parseInt(k, 10);
        if (e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); act('__end'); return; }
        const ids = (myTurn().acts || []).map((x) => x[0]);
        if (n >= 1 && n <= ids.length) { e.stopImmediatePropagation(); act(ids[n - 1]); return; }
        if (k === 'escape' && P.targeting) { e.stopImmediatePropagation(); P.targeting = null; pSig = ''; renderUi(); return; }
      }
      if (['w', 'a', 's', 'd'].includes(k) && db.view.level === 'VTT' && myPc()) { P.keys.add(k); e.preventDefault(); }
    }, true);
    window.addEventListener('keyup', (e) => { P.keys.delete(e.key.toLowerCase()); if (!P.keys.size) flushMove(); });
    window.addEventListener('blur', () => { P.keys.clear(); flushMove(); });

    // Free walking: your token moves 4 squares/s, sliding along walls and closed doors, sent ~8×/s.
    function navFor() {
      const bid = db.view.battleId, { walls, doors } = sceneGeometry(ui.scene, bid);
      const sig = bid + JSON.stringify([walls.length, doors.map((d) => d.closed)]);
      if (P.navSig !== sig) {
        P.navSig = sig;
        P.nav = new G.NavGrid({ origin: { x: 0, y: 0 }, width: ui.scene.w / ui.scene.ppg, height: ui.scene.h / ui.scene.ppg,
          walls: walls.map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 })), doors: doors.map((d) => ({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, closed: d.closed })) });
      }
      return P.nav;
    }
    function walk(dt) {
      const id = myPc(); if (!id || !P.keys.size || liveSession.lockMove || inFight(id)) return;
      const bid = db.view.battleId, sc = ui.scene;
      const tok = { ...db.battles[bid].tokens[id], ...((live.tokens[bid] || {})[id] || {}) }; // live position wins, like renderTokens
      const vx = (P.keys.has('d') ? 1 : 0) - (P.keys.has('a') ? 1 : 0), vy = (P.keys.has('s') ? 1 : 0) - (P.keys.has('w') ? 1 : 0);
      const len = Math.hypot(vx, vy); if (!len) return;
      const nav = navFor(), step = 4 * dt / len, r = 0.3;
      let x = tok.x * sc.w / sc.ppg, y = tok.y * sc.h / sc.ppg;
      const dx = vx * step, dy = vy * step;
      if (!nav.moveBlocked(x, y, x + dx, y + dy, r)) { x += dx; y += dy; }
      else if (dx && !nav.moveBlocked(x, y, x + dx, y, r)) x += dx;
      else if (dy && !nav.moveBlocked(x, y, x, y + dy, r)) y += dy;
      else return;
      tok.x = x * sc.ppg / sc.w; tok.y = y * sc.ppg / sc.h;
      P.pending = { x: +tok.x.toFixed(5), y: +tok.y.toFixed(5) };
      live.tokens[bid] = { ...(live.tokens[bid] || {}), [id]: P.pending }; // so a re-render doesn't snap it back
      const el = tokensLayer.querySelector(`[data-token-id="${id}"]`);
      if (el) { const sz = el.offsetWidth; el.style.left = (tok.x * sc.w - sz / 2) + 'px'; el.style.top = (tok.y * sc.h - sz / 2) + 'px'; }
      if (performance.now() - P.lastSend > 120) flushMove();
    }
    function flushMove() {
      if (!P.pending) return;
      const id = myPc(); if (!id) return;
      Live.update(livePath('tokens/' + db.view.battleId), { [id]: P.pending });
      live.tokens[db.view.battleId] = { ...(live.tokens[db.view.battleId] || {}), [id]: P.pending };
      P.pending = null; P.lastSend = performance.now();
    }

    // --- drawing ---
    let last2 = performance.now();
    function frame2(now) {
      const dt = Math.min(0.1, (now - last2) / 1000); last2 = now;
      if (db.view.level === 'VTT' && ui.scene) walk(dt);
      if (cv.width !== ui.size.w || cv.height !== ui.size.h) { cv.width = ui.size.w || 0; cv.height = ui.size.h || 0; }
      cx2.setTransform(1, 0, 0, 1, 0, 0); cx2.clearRect(0, 0, cv.width, cv.height);
      if (onMap()) drawPlayer(dt);
      renderUi();
      requestAnimationFrame(frame2);
    }
    function drawPlayer(dt) {
      const g = ui.scene.ppg, px = 1 / (g * cam().zoom), snap = P.snap, t = myTurn();
      cx2.setTransform(g, 0, 0, g, 0, 0); cx2.lineCap = 'round';
      if (t && !t.busy) {
        const threat = new Set(t.dis ? [] : t.threat.map((q) => q[0] + ',' + q[1]));
        for (const [qx, qy] of t.reach) { cx2.fillStyle = threat.has(qx + ',' + qy) ? 'rgba(239,68,68,0.22)' : 'rgba(99,102,241,0.2)'; cx2.fillRect(qx + 0.05, qy + 0.05, 0.9, 0.9); }
        if (P.hover) {
          const q = t.reach.find((c) => c[0] === Math.floor(P.hover.x) && c[1] === Math.floor(P.hover.y));
          if (q) { cx2.font = `bold ${12 * px}px Inter, system-ui, sans-serif`; cx2.textAlign = 'center'; cx2.textBaseline = 'bottom'; cx2.fillStyle = '#fff'; cx2.fillText(`${q[2]} ft`, q[0] + 0.5, q[1] + 0.1); }
        }
      }
      cx2.font = `${12 * px}px Inter, system-ui, sans-serif`;
      const k = Math.min(1, dt * 10);
      for (const n of snap.npcs || []) {
        const p = P.pos[n[0]]; if (!p) continue;
        p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
        if (!visible(p.x, p.y)) continue;
        const [id, name, , , f, color, hp, max, dead, cid] = n;
        if (dead) { cx2.fillStyle = 'rgba(100,100,100,0.8)'; cx2.beginPath(); cx2.arc(p.x, p.y, 0.24, 0, 7); cx2.fill(); continue; }
        cx2.fillStyle = color; cx2.beginPath(); cx2.arc(p.x, p.y, 0.3, 0, 7); cx2.fill();
        cx2.strokeStyle = 'rgba(0,0,0,0.6)'; cx2.lineWidth = 1.5 * px; cx2.stroke();
        cx2.strokeStyle = '#fff'; cx2.lineWidth = 2 * px; cx2.beginPath(); cx2.moveTo(p.x, p.y); cx2.lineTo(p.x + Math.cos(f) * 0.3, p.y + Math.sin(f) * 0.3); cx2.stroke();
        const fight = cid && (snap.fights || []).find((x) => x.id === cid);
        if (fight) { cx2.strokeStyle = fight.cur === id ? '#fcd34d' : '#f97316'; cx2.lineWidth = (fight.cur === id ? 4 : 2) * px; cx2.beginPath(); cx2.arc(p.x, p.y, 0.4, 0, 7); cx2.stroke(); }
        if (t && t.foes.includes(id)) { cx2.strokeStyle = P.targeting ? '#ef4444' : 'rgba(239,68,68,0.6)'; cx2.lineWidth = 2.5 * px; cx2.beginPath(); cx2.arc(p.x, p.y, 0.46, 0, 7); cx2.stroke(); }
        if (hp < max) { cx2.fillStyle = 'rgba(0,0,0,0.6)'; cx2.fillRect(p.x - 0.35, p.y - 0.48, 0.7, 0.08); cx2.fillStyle = hp / max > 0.5 ? '#4ade80' : hp / max > 0.25 ? '#facc15' : '#ef4444'; cx2.fillRect(p.x - 0.35, p.y - 0.48, 0.7 * hp / max, 0.08); }
        if (cam().zoom * g > 45) { cx2.fillStyle = '#fff'; cx2.textAlign = 'center'; cx2.textBaseline = 'bottom'; cx2.fillText(name, p.x, p.y - 0.52); }
      }
      // speech bubbles (only from NPCs you can see)
      cx2.font = `${12 * px}px Inter, system-ui, sans-serif`; cx2.textAlign = 'left'; cx2.textBaseline = 'top';
      for (const [id, text] of snap.bubbles || []) {
        const p = P.pos[id]; if (!p || !visible(p.x, p.y)) continue;
        const maxW = 210 * px, pad = 6 * px, lh = 15 * px, lines = []; let cur = '';
        for (const w of text.split(' ')) { const tt = cur ? cur + ' ' + w : w; if (cx2.measureText(tt).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tt; }
        if (cur) lines.push(cur);
        const w = Math.max(...lines.map((l) => cx2.measureText(l).width)) + pad * 2, h = lines.length * lh + pad * 2, x = p.x - w / 2, y = p.y - 0.75 - h;
        cx2.fillStyle = 'rgba(248,245,235,0.96)'; cx2.strokeStyle = 'rgba(0,0,0,0.45)'; cx2.lineWidth = px;
        cx2.beginPath(); cx2.roundRect(x, y, w, h, 6 * px); cx2.fill(); cx2.stroke();
        cx2.fillStyle = '#1e1b16'; lines.forEach((l, i) => cx2.fillText(l, x + pad, y + pad + i * lh));
      }
    }
    requestAnimationFrame(frame2);
    P.debug = { act, send, myPc, myTurn, onMap };
    P.path = () => stPath;
    window.TownVTT = { onScene() {}, onLevel() {}, resize() {}, resubscribe, player: P };
  }
})();
