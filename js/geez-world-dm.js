// The living world inside index.html — DM only.
//   World map: the simulation drawn over your own map (threats, villages, heroes), plus a "World" tab in the sidebar.
//   City map:  the World tab shows how that town is doing in the simulation.
// Runs in the DM's browser and saves there (localStorage "rolled-world.v3", the same save world.html uses).
// Nothing is written to Firebase. Your campaign is only read.
(() => {
  if (typeof PLAYER === 'undefined' || PLAYER || typeof Sim === 'undefined' || !window.WorldCampaign) return;
  const SAVE = 'rolled-world.v3', PACKS = 'rolled-world.v3.packs';
  const THREAT = { beast: ['Beasts', '#ff7a5c'], raider: ['Raiders', '#f0a04b'], undead: ['Undead', '#9fd36a'], dark: ['Dark things', '#c9a3ef'], great: ['Great beasts', '#ff7aa8'] };
  const HERO = ['#6fb3ff', '#4fd1c5', '#e0ad55', '#ff8fcf', '#a9a4ff', '#d2a679'];
  const st = { W: null, playing: false, speed: 1, show: true, focus: null, busy: '', note: '' };
  const H = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = (t) => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);

  // ---------- the world ----------
  function packs() {
    try { const p = JSON.parse(localStorage.getItem(PACKS) || 'null'); if (Array.isArray(p) && p.length) return p.filter(x => x.on).map(x => ({ name: x.name, text: x.text })); } catch (e) {}
    return DEFAULT_PACKS.filter(p => p.on).map(p => ({ name: p.name, text: p.text }));
  }
  function load() { try { const raw = localStorage.getItem(SAVE); if (raw) st.W = Sim.load(raw); } catch (e) { console.warn('[world] save unreadable', e); st.W = null; } }
  function save() { if (!st.W) return; try { localStorage.setItem(SAVE, Sim.save()); } catch (e) { st.note = 'This browser would not save the world (storage full?).'; } }
  const campId = () => db.view.worldId;
  const mine = () => st.W?.campaigns?.find(c => c.id === campId()) || null;
  const region = () => { const c = mine(); return c ? st.W.regions.find(r => r.id === c.region) : null; };
  function campaignNow() {
    const r = WorldCampaign.Campaign.fromExport({ geezvtt: { campaign: db }, characters: { npcs: typeof npcSheets !== 'undefined' ? npcSheets : {} } });
    return (r.campaigns || []).find(c => c.id === campId()) || null;
  }
  async function start() {
    const c = campaignNow();
    if (!c) { st.note = 'This campaign has no places or NPCs on its board yet.'; render(); return; }
    st.busy = 'Building the living world…'; render();
    const spec = JSON.parse(JSON.stringify(c.spec));
    const m = db.maps[campId()];
    let img = null; try { img = m?.image ? await loadImage(m.image, 'world') : null; } catch (e) {}
    if (img) spec.map = { image: 'world/' + m.image, w: 1500, h: Math.round(1500 * img.height / img.width), land: WorldCampaign.landMask(img) };
    if (!st.W || !st.W.campaigns?.length) Sim.createWorld(packs(), { empty: true });
    const rep = Sim.seed(spec); st.W = Sim.W;
    for (let i = 0; i < 4; i++) Sim.tick();
    st.W.pending.length = 0; st.busy = ''; st.note = `${c.name} is alive: ${rep.towns.length} of your towns, ${rep.wilds.length} wild places and ${rep.people.length} of your NPCs${img ? ', on your world map' : ''}.`;
    save(); render(); draw();
  }
  // your board feeds the world: new cards join, event cards with a "deed" happen, NPCs marked dead die
  function sync() {
    if (!mine()) return;
    const c = campaignNow(); if (!c) return;
    const r = Sim.seed(c.spec, { add: true });
    if (r && r.towns.length + r.wilds.length + r.people.length + r.deeds + r.died.length) { st.W.pending.length = 0; save(); render(); draw(); }
  }
  function tickHours(n) { for (let i = 0; i < n; i++) { Sim.tick(); if (Sim.W.hour === 6) { sync(); save(); } } Sim.W.pending.length = 0; }
  function between(days) {
    let left = days * 24; st.playing = false; st.busy = `${days} days pass…`; render();
    const day0 = Sim.W.day;
    const step = () => { const t0 = performance.now(); while (left > 0 && performance.now() - t0 < 40) { tickHours(1); left--; } if (left > 0) { st.busy = `${days} days pass… ${Math.round(100 - left / (days * 24) * 100)}%`; renderSoon(); return setTimeout(step, 0); }
      const tps = Sim.W.log.filter(e => e.level === 'trigger' && e.day >= day0 && inRegion(e)).slice(0, 8);
      st.busy = ''; st.note = `${days} days later. ${tps.length ? 'Turning points: ' + tps.map(e => e.text).join(' · ') : 'Nothing earth-shaking happened.'}`; save(); render(); draw(); };
    step();
  }
  setInterval(() => { if (!st.W || !st.playing || st.busy) return; tickHours(st.speed); if (db.view.level === 'WORLD') draw(); renderSoon(); }, 1500);
  setInterval(() => { if (st.W && !st.busy) sync(); }, 10000);

  // ---------- helpers over the world ----------
  const inRegion = (e) => { const R = region(); if (!R) return false; if (e.region != null) return e.region === R.id; if (e.town != null) return Sim.W.towns.find(t => t.id === e.town)?.region === R.id; if (e.zone != null) return Sim.W.zones.find(z => z.id === e.zone)?.region === R.id; return false; };
  const toMap = (R, x, y) => ({ x: (x - R.ox) / Sim.RW(R) * ui.size.w, y: (y - R.oy) / Sim.RH(R) * ui.size.h });
  const threatOf = (p) => THREAT[Sim.threatKind(p)] || THREAT.beast;
  const heroCol = (n) => HERO[n.id % HERO.length];
  const cityTown = () => { const m = db.maps[currentMapId?.()]; const tid = m?.parentThing; return tid ? Sim.W?.towns.find(t => t.ext === tid) : null; };

  // ---------- drawing over your world map ----------
  let canvas = null;
  function ensureCanvas() {
    if (canvas) return canvas;
    canvas = document.createElement('canvas'); canvas.id = 'simCanvas';
    canvas.className = 'absolute top-0 left-0 pointer-events-none'; canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    $('markerCanvas').after(canvas); return canvas;
  }
  function draw() {
    st.hits = [];
    const c = ensureCanvas(); c.width = ui.size.w || 1; c.height = ui.size.h || 1;
    const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
    const R = region(); if (!st.show || !R || db.view.level !== 'WORLD' || !ui.loaded) return;
    if (db.view.realmId && db.view.realmId !== campId() && db.maps[db.view.realmId]?.parentMap) return;   // a realm map (the Feywild…), not the main world
    const u = ui.size.w / 1536, W = Sim.W;
    const text = (t, x, y, col, size = 11, bold = true) => { g.font = `${bold ? 700 : 500} ${size * u}px system-ui, sans-serif`; g.textAlign = 'center'; g.lineWidth = 3 * u; g.strokeStyle = 'rgba(15,23,42,.85)'; g.strokeText(t, x, y); g.fillStyle = col; g.fillText(t, x, y); };
    // threats in the wilds
    for (const z of W.zones.filter(z => z.region === R.id)) {
      const ps = W.pops.filter(p => p.zone === z.id && Sim.isHostile(p) && p.count >= 0.5).sort((a, b) => Sim.popPower(b) - Sim.popPower(a));
      if (!ps.length) continue;
      const q = toMap(R, z.x, z.y), r = z.r / Sim.RW(R) * ui.size.w;
      ps.slice(0, 3).forEach((p, i) => {
        const [, col] = threatOf(p), solo = Sim.def(p).solo, n = solo ? 1 : Math.min(8, Math.ceil(p.count / 2));
        g.fillStyle = col; let s = (p.id * 9301) % 233;
        for (let k = 0; k < n; k++) { s = (s * 9301 + 49297) % 233280; const a = s / 233280 * 6.28; s = (s * 9301 + 49297) % 233280; const d = Math.sqrt(s / 233280) * r * 0.5; g.beginPath(); g.arc(q.x + Math.cos(a) * d, q.y + Math.sin(a) * d, (solo ? 6 : 3) * u, 0, 7); g.fill(); }
        text(`${p.chief != null ? '⚑ ' : p.mutation ? '✦ ' : ''}${Sim.popName(p)}${solo ? '' : ' ' + Math.round(p.count)}`, q.x, q.y - r * 0.55 - i * 13 * u, col, 11);
        st.hits.push({ x: q.x, y: q.y, r: Math.max(16 * u, r * 0.6), kind: 'pop', id: p.id });
      });
    }
    // towns: villages the world made up get a small square; yours get a ring that shows how they're doing
    for (const t of W.towns.filter(t => t.region === R.id)) {
      const q = toMap(R, t.x, t.y), alive = t.npcs.length > 0;
      const col = !alive ? '#94a3b8' : t.fear >= 5 ? '#ff7a5c' : Sim.foodDays(t) < 0.8 ? '#e0ad55' : '#7fc29c';
      if (t.yours) { g.strokeStyle = col; g.lineWidth = 3 * u; g.beginPath(); g.arc(q.x, q.y, 14 * u, 0, 7); g.stroke(); text(alive ? `${t.npcs.length}` : 'empty', q.x, q.y + 26 * u, col, 10, false); }
      else { g.fillStyle = alive ? '#e2e8f0' : '#64748b'; g.strokeStyle = 'rgba(15,23,42,.85)'; g.lineWidth = 2 * u; g.fillRect(q.x - 4 * u, q.y - 4 * u, 8 * u, 8 * u); g.strokeRect(q.x - 4 * u, q.y - 4 * u, 8 * u, 8 * u); text(t.name, q.x, q.y + 16 * u, '#e2e8f0', 10); }
      t.npcs.filter(n => n.hero).forEach((n, i) => { const a = -2.4 + i * 0.6; star(g, q.x + Math.cos(a) * 20 * u, q.y + Math.sin(a) * 20 * u, 6 * u, heroCol(n)); });
      st.hits.push({ x: q.x, y: q.y, r: 16 * u, kind: 'town', id: t.id });
    }
    // people on the road
    for (const P of W.parties) {
      const q = toMap(R, P.pos.x, P.pos.y); if (q.x < 0 || q.y < 0 || q.x > ui.size.w || q.y > ui.size.h) continue;
      const hero = P.members.find(n => n.hero);
      if (hero) star(g, q.x, q.y, 6 * u, heroCol(hero)); else { g.fillStyle = '#cbd5e1'; g.beginPath(); g.arc(q.x, q.y, 2.5 * u, 0, 7); g.fill(); }
    }
  }
  function star(g, x, y, r, col) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = 'rgba(15,23,42,.9)'; g.lineWidth = 1.2; g.stroke(); }
  st.hits = [];
  const drawAll = draw;
  function click(x, y) {
    if (!st.show || db.view.level !== 'WORLD' || !region()) return false;
    let best = null, bd = Infinity; for (const h of st.hits) { const d = Math.hypot(h.x - x, h.y - y); if (d < h.r && d < bd) { best = h; bd = d; } }
    if (!best) return false;
    st.focus = { kind: best.kind, id: best.id }; showTab('tabWorldBtn'); render(); return true;
  }

  // ---------- the World tab ----------
  let soon = null;
  const renderSoon = () => { if (!soon) soon = setTimeout(() => { soon = null; render(); }, 400); };
  const row = (a, b, warn) => `<div class="flex justify-between gap-2"><span class="text-slate-400">${a}</span><span class="${warn ? 'text-red-300' : 'text-slate-200'} font-semibold">${b}</span></div>`;
  const box = (title, body) => `<section class="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2"><h4 class="text-[10px] uppercase tracking-wider font-bold text-slate-400">${title}</h4>${body}</section>`;
  const personLine = (n) => { const sc = Sim.scarsOf(n)[0], why = n.arc && !n.arc.done ? `on a path: ${n.arc.name}` : n.desire ? `wants ${n.desire.text}` : sc ? Sim.scarText(n, sc) : ''; return `<button data-wfocus="npc:${n.id}" class="block w-full text-left hover:bg-slate-800/60 rounded px-1 py-0.5"><span class="font-semibold text-slate-100">${H(Sim.titled(n))}</span> <span class="text-slate-500">${H(n.child ? 'child' : n.role || n.job)}</span>${why ? `<span class="block text-slate-400 text-[11px]">${H(why)}</span>` : ''}</button>`; };
  const news = (filter, k = 6) => { const L = Sim.W.log.filter(e => e.level !== 'minor' && filter(e)).slice(0, k); return L.length ? L.map(e => `<div class="text-[11px] text-slate-300"><span class="text-slate-500 font-mono">D${e.day}</span> ${H(e.text)}</div>`).join('') : '<div class="text-[11px] text-slate-500">Quiet.</div>'; };
  function townHTML(t) {
    const fd = Sim.foodDays(t), reg = t.regard || 0, feel = reg >= 3 ? 'fondly' : reg > 0 ? 'kindly' : reg <= -4 ? 'with hatred' : reg < 0 ? 'warily' : 'nothing much';
    const cast = Sim.cast(t.region).filter(n => n.town === t.id).slice(0, 8);
    const threats = Object.keys(t.threats || {}).map(id => Sim.W.pops.find(p => p.id === +id)).filter(Boolean);
    return box(`${H(t.name)}${t.yours ? '' : ' · a village the world made'}`, `<div class="text-xs space-y-1">${row('People', t.npcs.length)}${row('Food', fd.toFixed(1) + ' days', fd < 1)}${row('Fear', t.fear.toFixed(1) + ' / 10', t.fear >= 5)}${row('Treasury', Math.round(t.treasury))}${row(`Thinks of ${H(Sim.partyOf(t.region))}`, feel, reg < 0)}${t.lastCouncil?.length ? row('Council did', H(t.lastCouncil.join('; '))) : ''}</div>`)
      + (threats.length ? box('Troubled by', threats.map(p => `<div class="text-xs" style="color:${threatOf(p)[1]}">${H(Sim.popName(p))} · ${threatOf(p)[0].toLowerCase()}</div>`).join('')) : '')
      + box('People with a story', cast.length ? `<div class="text-xs space-y-0.5">${cast.map(personLine).join('')}</div>` : '<div class="text-[11px] text-slate-500">Nobody stands out yet.</div>')
      + box('Lately', news(e => e.town === t.id, 6));
  }
  function npcHTML(n) {
    const S = Sim.W.towns.find(t => t.id === n.town), A = n.arc, a = A && Sim.D.arcs[A.name];
    return box(H(Sim.titled(n)), `<div class="text-xs text-slate-400">${H(n.race)} · ${n.child ? 'child' : Math.floor(n.age)} · ${H(n.role || n.job)}${S ? ' · ' + H(S.name) : ''}</div>
      ${n.desire ? `<div class="text-sm text-emerald-300">Wants ${H(n.desire.text)}</div>` : ''}
      ${A ? `<div class="text-xs text-fuchsia-300">${A.done ? `Their story ended: ${H(A.done)}` : `On a path: ${H(A.name)} (step ${A.step + 1} of ${a?.steps.length || '?'})`}</div>` : ''}
      ${Sim.scarsOf(n).length ? `<div class="text-xs text-slate-300">${Sim.scarsOf(n).map(x => H(Sim.scarText(n, x))).join(' · ')}</div>` : ''}
      <div class="text-[11px] text-slate-400 space-y-0.5">${(n.life || []).slice(0, 8).map(l => `<div><span class="font-mono text-slate-500">D${l.d}</span> ${H(l.text)}</div>`).join('')}</div>
      <button data-wcopy="${n.id}" class="text-xs py-1 px-2 rounded bg-slate-800 border border-slate-700 hover:border-amber-500">Copy as card text</button>`);
  }
  function popHTML(p) {
    const z = Sim.W.zones.find(z => z.id === p.zone), [lab, col] = threatOf(p), d = Sim.def(p), chief = p.chief != null ? Sim.IDX.get(p.chief) : null;
    return box(`<span style="color:${col}">${H(Sim.popName(p))}</span>`, `<div class="text-xs space-y-1">${row('What', lab)}${row('Where', H(z?.name || '?'))}${d.solo ? '' : row('How many', Math.round(p.count))}${row('Power', Math.round(Sim.popPower(p)))}${row('Killed', p.slew || 0)}${row('Fed', Math.round((p.fedAvg ?? 1) * 100) + '%')}${chief ? row('Led by', `<button data-wfocus="npc:${chief.id}" class="underline">${H(Sim.titled(chief))}</button>`) : ''}</div>`);
  }
  function render() {
    const pane = $('tabWorld'); if (!pane || pane.classList.contains('hidden') && !st.focus) { if (pane) pane.dataset.stale = 1; return; }
    const W = st.W && Sim.W, c = mine(), lvl = db.view.level;
    let h = '';
    h += `<div class="flex items-center justify-between gap-2"><div class="text-xs text-slate-300">${W ? `Day <b>${W.day}</b> · ${cap(Sim.season())}, year ${Sim.year()} · ${String(W.hour).padStart(2, '0')}:00` : 'The living world'}</div>
      <label class="text-[11px] text-slate-400 flex items-center gap-1"><input type="checkbox" id="wShow" ${st.show ? 'checked' : ''} class="accent-emerald-500"> On the map</label></div>`;
    if (c) h += `<div class="flex flex-wrap gap-1.5">
        <button id="wPlay" class="text-xs py-1.5 px-3 rounded ${st.playing ? 'bg-amber-700' : 'bg-emerald-700'} text-white font-semibold">${st.playing ? 'Pause' : 'Play'}</button>
        <button id="wSpeed" class="text-xs py-1.5 px-2 rounded bg-slate-800 border border-slate-700">${st.speed === 1 ? '1 hour / tick' : '1 day / tick'}</button>
        <select id="wDays" class="text-xs rounded bg-slate-900 border border-slate-700 px-1"><option value="3">3 days</option><option value="7" selected>a week</option><option value="14">two weeks</option><option value="30">a month</option></select>
        <button id="wPass" class="text-xs py-1.5 px-2 rounded bg-slate-800 border border-slate-700 hover:border-amber-500">Let it pass</button></div>`;
    if (st.busy) h += `<div class="text-xs text-amber-300">${H(st.busy)}</div>`;
    if (st.note) h += `<div class="text-[11px] text-slate-300 bg-slate-900/60 border border-slate-800 rounded-lg p-2">${H(st.note)} <button id="wNoteX" class="text-slate-500 hover:text-slate-300 ml-1">×</button></div>`;
    if (!c) {
      h += box('Not alive yet', `<p class="text-xs text-slate-300">Bring this campaign's places and NPCs into the living world: your settlements become towns where you pinned them, your NPCs live their lives, and the world fills in the rest: villages, wildlife, monsters, families, troubles. Only you see it.</p>
        <button id="wStart" class="w-full text-xs py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-semibold">${W?.campaigns?.length ? 'Add this campaign to the living world' : 'Start the living world'}</button>`);
    } else if (st.focus) {
      const f = st.focus, o = f.kind === 'town' ? W.towns.find(t => t.id === f.id) : f.kind === 'pop' ? W.pops.find(p => p.id === f.id) : Sim.IDX.get(f.id);
      h += `<button id="wBack" class="text-[11px] text-slate-400 hover:text-slate-200">← back</button>`;
      h += !o ? '<div class="text-xs text-slate-500">Gone from the world.</div>' : f.kind === 'town' ? townHTML(o) : f.kind === 'pop' ? popHTML(o) : npcHTML(o);
    } else if (lvl === 'LOCATION') {
      const t = cityTown();
      h += t ? townHTML(t) : box('This place', '<div class="text-xs text-slate-500">This map\'s settlement isn\'t in the living world. Settlement cards on the world map are; give this one the settlement category, or add it there.</div>');
    } else {
      const R = region(), towns = W.towns.filter(t => t.region === R.id).sort((a, b) => (b.yours ? 1 : 0) - (a.yours ? 1 : 0) || b.npcs.length - a.npcs.length);
      const threats = W.pops.filter(p => Sim.isHostile(p) && W.zones.find(z => z.id === p.zone)?.region === R.id).sort((a, b) => Sim.popPower(b) - Sim.popPower(a)).slice(0, 6);
      h += box('Towns', towns.map(t => `<button data-wfocus="town:${t.id}" class="flex w-full justify-between text-xs hover:bg-slate-800/60 rounded px-1 py-0.5"><span class="${t.yours ? 'text-slate-100 font-semibold' : 'text-slate-400'}">${H(t.name)}</span><span class="text-slate-400">${t.npcs.length ? `${t.npcs.length} · food ${Sim.foodDays(t).toFixed(1)}d${t.fear >= 5 ? ' · <span class="text-red-300">afraid</span>' : ''}` : 'empty'}</span></button>`).join(''));
      h += box('Threats', threats.length ? threats.map(p => `<button data-wfocus="pop:${p.id}" class="block w-full text-left text-xs hover:bg-slate-800/60 rounded px-1 py-0.5" style="color:${threatOf(p)[1]}">${p.chief != null ? '⚑ ' : ''}${H(Sim.popName(p))}${Sim.def(p).solo ? '' : ' · ' + Math.round(p.count)} <span class="text-slate-500">${H(W.zones.find(z => z.id === p.zone)?.name || '')}</span></button>`).join('') : '<div class="text-[11px] text-slate-500">None to speak of.</div>');
      const cast = Sim.cast(R.id).slice(0, 8);
      h += box('People with a story', cast.length ? `<div class="space-y-0.5">${cast.map(personLine).join('')}</div>` : '<div class="text-[11px] text-slate-500">Nobody stands out yet.</div>');
      h += box('Lately', news(inRegion, 8));
    }
    // what the party did, here
    const here = c && (st.focus?.kind === 'town' ? W.towns.find(t => t.id === st.focus.id) : lvl === 'LOCATION' ? cityTown() : null);
    if (here && here.npcs.length && Object.keys(Sim.D.deeds).length) h += box(`What ${H(Sim.partyOf(here.region))} did in ${H(here.name)}`, `<div class="flex gap-1.5"><select id="wDeed" class="flex-1 text-xs rounded bg-slate-950 border border-slate-700 px-1 py-1">${Object.values(Sim.D.deeds).map(d => `<option value="${H(d.name)}">${H(cap(d.title))}</option>`).join('')}</select><button id="wDo" data-town="${here.id}" class="text-xs py-1 px-2 rounded bg-amber-700 hover:bg-amber-600 text-white">Record</button></div>
      <input id="wDeedNote" class="w-full text-xs rounded bg-slate-950 border border-slate-700 px-2 py-1" placeholder="In your words (optional)">`);
    if (c) h += `<a href="world.html?gm=jonny&campaign=${encodeURIComponent(campId())}" target="_blank" class="block text-[11px] text-slate-500 hover:text-slate-300">Open the full living world in its own tab ↗ (use one or the other, not both at once)</a>`;
    pane.innerHTML = `<div class="space-y-3">${h}</div>`;
    pane.dataset.stale = '';
    bind();
  }
  function bind() {
    const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
    on('wStart', start);
    on('wPlay', () => { st.playing = !st.playing; render(); });
    on('wSpeed', () => { st.speed = st.speed === 1 ? 24 : 1; render(); });
    on('wPass', () => between(+$('wDays').value));
    on('wBack', () => { st.focus = null; render(); });
    on('wNoteX', () => { st.note = ''; render(); });
    const sh = $('wShow'); if (sh) sh.onchange = () => { st.show = sh.checked; drawAll(); };
    on('wDo', () => { const r = Sim.deed($('wDeed').value, { town: +$('wDo').dataset.town }, { note: $('wDeedNote').value }); if (r) st.note = `Recorded. ${r.affected} ${r.affected === 1 ? 'person' : 'people'} will remember it${r.wanting ? `, and ${r.wanting} now want something from ${Sim.partyOf(Sim.W.towns.find(t => t.id === +$('wDo').dataset.town)?.region)}` : ''}.`; Sim.W.pending.length = 0; save(); render(); drawAll(); });
    document.querySelectorAll('#tabWorld [data-wfocus]').forEach(b => b.onclick = () => { const [k, id] = b.dataset.wfocus.split(':'); st.focus = { kind: k, id: +id }; render(); });
    document.querySelectorAll('#tabWorld [data-wcopy]').forEach(b => b.onclick = () => { const n = Sim.IDX.get(+b.dataset.wcopy); if (n) navigator.clipboard?.writeText(Sim.card(n)).then(() => { b.textContent = 'Copied'; }, () => {}); });
  }

  // ---------- hook into index.html ----------
  load();
  window.WorldDM = { draw: drawAll, click, render, onLevel() { if (db.view.level !== 'WORLD') st.focus = st.focus?.kind === 'npc' ? st.focus : null; drawAll(); const p = $('tabWorld'); if (p && !p.classList.contains('hidden')) render(); } };
  $('tabWorldBtn')?.classList.remove('hidden');
  if (st.W) sync();
  drawAll();
})();
