// Tools: Look, Paint, Rivers, Roads, Towns, Maps, Play. Every edit is undoable.
import * as THREE from 'three';
import { N, CELL, HALF, TYPES } from './world.js';
import { PAL } from './style.js';
import { MAP, SQ, GRID, PLACE_KINDS } from './places.js';
import { DEFAULT_R, UNIT_KINDS } from './world.js';
import { rollPlace } from './lore.js';
import { registerFactions, ensureLore } from './card.js';
import { squareAt, squareCenter, SQ as DETAIL_SQ, CLEAR, DOOR, WINDOW } from './detail.js';
import { floatSquare } from './combat.js';

export const TOOLS = [
  { id: 'look', name: 'Look', roles: ['gm', 'player'] },
  { id: 'paint', name: 'Paint', roles: ['gm'] },
  { id: 'detail', name: 'Detail', roles: ['gm'] },
  { id: 'river', name: 'Rivers', roles: ['gm'] },
  { id: 'road', name: 'Roads', roles: ['gm'] },
  { id: 'towns', name: 'Towns', roles: ['gm'] },
  { id: 'maps', name: 'Maps', roles: ['gm'] },
  { id: 'play', name: 'Play', roles: ['gm', 'player'] },
];
const PIN_KEY = { towns: 'settlements', maps: 'battlemaps' };
const uid = p => p + Math.random().toString(36).slice(2, 9);
const clone = o => JSON.parse(JSON.stringify(o));

export class Tools {
  constructor(app) {
    this.app = app;
    this.detailBrush = { kind: 'ground', ground: 2, wall: 1, size: 1, object: 'barrel', rot: 0 };
    this.brush = { type: 3, size: 4, smooth: false };
    this.undoStack = []; this.redoStack = [];
    this.draft = null; this.selLine = null; this.sel = null; this.drag = null;
    this.tokenForm = { name: 'Hero', color: PAL.tokens[0] };
    this.pings = [];
    const ring = new THREE.BufferGeometry(); ring.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(65 * 3), 3));
    this.cursor = new THREE.Line(ring, new THREE.LineBasicMaterial({ color: PAL.ping, depthTest: false, transparent: true, opacity: .9 }));
    this.detailCursor = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: PAL.ping, depthTest: false }));
    this.detailCursor.renderOrder=5; this.detailCursor.visible=false; this.detailCursor.frustumCulled=false; app.scene.add(this.detailCursor);
    this.cursor.renderOrder = 5; this.cursor.visible = false; this.cursor.frustumCulled = false; app.scene.add(this.cursor);
  }

  // ---------- history ----------
  push(entry) { this.undoStack.push(entry); if (this.undoStack.length > 200) this.undoStack.shift(); this.redoStack = []; this.app.ui?.refresh(); }
  undo() { const e = this.undoStack.pop(); if (!e) return; e.undo(); this.redoStack.push(e); this.app.ui.refresh(); }
  redo() { const e = this.redoStack.pop(); if (!e) return; e.redo(); this.undoStack.push(e); this.app.ui.refresh(); }
  clearHistory() { this.undoStack = []; this.redoStack = []; }
  // Snapshot edit of one data list (rivers, roads, places, tokens).
  edit(key, fn, after) {
    const d = this.app.world.data, before = clone(d[key]);
    fn(d[key]);
    const now = clone(d[key]);
    const apply = (v, prev) => { d[key] = clone(v); after(prev, v); };
    after(before, now);
    this.push({ undo: () => apply(before, now), redo: () => apply(now, before) });
  }

  toolChanged() {
    this.pingArmed = false;
    const c = this.app.controls, drawing = ['paint', 'detail'].includes(this.app.tool);
    c.mouseButtons.LEFT = drawing ? -1 : THREE.MOUSE.PAN;
    c.mouseButtons.RIGHT = drawing ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    c.touches.ONE = drawing ? -1 : THREE.TOUCH.PAN;
    if (this.app.tool !== 'river' && this.app.tool !== 'road') { this.draft = null; this.app.lines.draft(null); }
    if (this.app.tool !== 'towns' && this.app.tool !== 'maps') this.sel = null;
    this.selLine = null; this.app.lines.selected = null; this.app.lines.showSelected();
    this.cursor.visible = false; this.detailCursor.visible = false;
  }
  wantsHover() { return ['paint', 'detail'].includes(this.app.tool); }

  // ---------- pointer events from Input ----------
  down(e, g) {
    const app = this.app, t = app.tool;
    if (this.pingArmed) return false;
    if (t === 'detail' && g && app.role === 'gm') { this.detailStart(g); return true; }
    if (t === 'paint' && g) { this.strokeStart(e, g); return true; }
    if (t === 'towns' || t === 'maps') { const key = PIN_KEY[t], p = this.pinUnder(e.clientX, e.clientY, key); if (p) { this.sel = { key, id: p.id }; this.drag = { kind: 'pin', key, id: p.id, before: clone(app.world.data[key]), ox: p.x, oz: p.z }; app.ui.refresh(); return true; } }
    if (t === 'play' && g && !app.ruler.on) { const tk = this.tokenAt(g); if (tk) { this.drag = { kind: 'token', id: tk.id, before: clone(app.world.data.tokens), from: [tk.sx, tk.sz] }; return true; } }
    return false;
  }
  move(e, g) {
    if (this.stroke) { if (g) this.strokeTo(g); this.hover(g); return; }
    const d = this.drag; if (!d || !g) return;
    const data = this.app.world.data;
    if (d.kind === 'pin') { const p = data[d.key].find(q => q.id === d.id); p.x = +g.x.toFixed(1); p.z = +g.z.toFixed(1); this.app.request(); }
    if (d.kind === 'token') {
      const tk = data.tokens.find(q => q.id === d.id), combat = this.app.combat.on;
      // in combat tokens snap to squares and can't share one; otherwise they move freely
      let [sx, sz] = combat ? squareAt(g.x, g.z) : floatSquare(g.x, g.z);
      if (!combat) { sx = +sx.toFixed(2); sz = +sz.toFixed(2); }
      const taken = combat && data.tokens.some(q => this.sameSpace(q) && q !== tk && (q.level || 0) === (tk.level || 0) && q.sx === sx && q.sz === sz);
      if ((sx !== tk.sx || sz !== tk.sz) && !taken && this.canMove(tk,sx,sz)) { tk.sx=sx; tk.sz=sz; this.app.maps.refreshTokens(); this.app.request(); }
      this.app.combat.dragShow(tk, d.from, [e.clientX, e.clientY]);
    }
  }
  up(e, g, tapped = false) {
    if (this.stroke) { this.strokeEnd(); return; }
    const d = this.drag; this.drag = null; if (!d) return;
    const app = this.app, data = app.world.data;
    if (tapped) { app.card.open(d.kind === 'pin' ? d.key : 'tokens', d.id); app.ui.refresh(); return; }
    if (d.kind === 'pin') {
      const p = data[d.key].find(q => q.id === d.id);
      if (Math.hypot(p.x - d.ox, p.z - d.oz) < 1) { p.x = d.ox; p.z = d.oz; app.ui.refresh(); return; }
      if (d.key === 'battlemaps') p.rot = app.maps.autoRot(p);
      const now = clone(data[d.key]), before = d.before, key = d.key;
      const apply = (v, prev) => { data[key] = clone(v); this.pinsChanged(key, prev, v); };
      this.pinsChanged(key, before, now);
      this.push({ undo: () => apply(before, now), redo: () => apply(now, before) });
    }
    if (d.kind === 'token') {
      app.combat.dragEnd();
      const before = d.before, now = clone(data.tokens);
      if (JSON.stringify(before) === JSON.stringify(now)) return;
      const apply = v => { data.tokens = clone(v); app.maps.refreshTokens(); app.request(); app.save(); };
      app.save();
      this.push({ undo: () => apply(before), redo: () => apply(now) });
    }
  }
  cancel() { if (this.stroke) this.strokeEnd(true); if (this.drag) { const d = this.drag; this.drag = null; const data = this.app.world.data; if (d.kind === 'pin') { data[d.key] = d.before; this.app.request(); } else { data.tokens = d.before; this.app.maps.refreshTokens(); } } }

  tap(e, g) {
    const app = this.app, t = app.tool;
    if(app.underground?.armed){app.underground.tap(g);return;}
    if(app.ddImports?.placing){app.ddImports.placeAt(g);return;}
    if (app.weather?.arm) { app.weather.placeAt(g); return; }
    if (app.ruler.on && (t === 'look' || t === 'play')) { app.ruler.add(g); return; }
    if (this.pingArmed) { this.pingArmed = false; this.ping(g); app.ui.refresh(); return; }
    if (t === 'look' || t === 'play') { if(app.propInspector?.pick(g,e))return; if(app.underground?.tap(g,e))return; if(app.underground?.active){this.context(e);return;} if(app.ddImports?.tap(g))return; if(app.interiors?.tap(g))return; if (!this.context(e)) app.card.close(); return; }
    app.card.close();
    if ((t === 'river' || t === 'road') && g) {
      if (!this.draft) {
        // Tap a line to select it; tap the selected line again (or just beside a line) to branch from it.
        const hit = app.lines.pick(g.x, g.z, t, Math.max(10, app.camDist() * .02));
        if (hit && hit !== this.selLine) { this.selLine = hit; app.lines.selected = hit; app.lines.showSelected(); app.ui.refresh(); app.request(); return; }
        this.selLine = null; app.lines.selected = null; app.lines.showSelected();
        this.draft = { kind: t, pts: [] };
      }
      const sn = this.snapLine(g.x, g.z, t);
      this.draft.snap = sn.to;
      this.draft.pts.push([+sn.x.toFixed(1), +sn.z.toFixed(1)]);
      app.lines.draft([...this.draft.pts], t); app.ui.refresh(); app.request();
      return;
    }
    if ((t === 'towns' || t === 'maps') && g && !g.water) {
      const key = PIN_KEY[t];
      if (this.pinUnder(e.clientX, e.clientY, key)) return;
      const x = +g.x.toFixed(1), z = +g.z.toFixed(1);
      const p = key === 'settlements'
        ? (() => { const r = rollPlace(app.world, x, z, this.newKind || 'any'); registerFactions(app.world, r.lore); return { id: uid('st_'), ...r, known: false }; })()
        : { id: uid('bm_'), name: 'New bookmark', x, z, rot: app.maps.autoRot({ x, z }), known: false };
      this.edit(key, l => l.push(p), (a, b) => this.pinsChanged(key, a, b));
      this.sel = { key, id: p.id }; app.ui.refresh();
      app.card.open(key, p.id);
      return;
    }
    if (t === 'towns' || t === 'maps') { this.sel = null; app.ui.refresh(); }
  }
  doubleTap(e, g) {
    const t = this.app.tool;
    if ((t === 'river' || t === 'road') && this.draft) { this.finishLine(); return; }
    if (t === 'play' || t === 'look') {
      const hit = this.app.ui.labelAt(e.clientX, e.clientY, 'settlements');
      if (hit) this.flyToPin(hit.key, hit.item); else this.ping(g);
    }
  }
  longPress(e, g) { if (this.context(e)) return; if (this.app.tool === 'play' || this.app.tool === 'look') this.ping(g); }
  // Right-click / long-press: open the card of the token, place or battlemap under the pointer.
  context(e) {
    const app = this.app, x = e.clientX, y = e.clientY, g = app.pickGround(x, y);
    const open = (key, p) => { if(key==='entities')app.canon.show(p.id);else app.card.open(key, p.id); return true; };
    const tk = g && this.tokenAt(g); if (tk) return open('tokens', tk);
    if(app.propInspector?.pick(g,e))return true;
    if(app.underground?.active)return false;
    const lab = app.ui.labelAt(x, y); if (lab?.key === 'fronts') { app.weather.openFront(lab.item.id); return true; } if (lab) return open(lab.key, lab.item);
    const pin = this.pinUnder(x, y, 'settlements') || this.pinUnder(x, y, 'battlemaps');
    if (pin) return open(app.world.data.settlements.includes(pin) ? 'settlements' : 'battlemaps', pin);
    // a house up close: its building card (every building is real)
    if (g && app.camDist() < 700) { const hb = app.buildings.houseAt(g.x, g.z); if (hb) { app.card.open('building', hb.key); return true; } }
    if(app.underground?.active)return false;
    // close in, anywhere inside a place's grounds counts
    const S = g && app.camDist() < 3000 && app.world.data.settlements.find(p => app.towns.visible(p, app.role) && Math.hypot(p.x - g.x, p.z - g.z) < p.r);
    if (S) return open('settlements', S);
    return false;
  }
  escape() {
    if(this.app.propInspector?.close())return true;
    if(this.app.underground?.cancel())return true;
    if(this.app.ddImports?.cancel())return true;
    if(this.app.interiors?.close())return true;
    if (this.draft) { this.draft = null; this.app.lines.draft(null); this.app.ui.refresh(); return true; }
    if (this.selLine || this.sel) { this.selLine = null; this.sel = null; this.app.lines.selected = null; this.app.lines.showSelected(); this.app.ui.refresh(); return true; }
    return false;
  }
  key(e) {
    if (e.key === 'Enter' && this.draft) this.finishLine();
    if (e.key === 'Delete' || e.key === 'Backspace') this.deleteSelected();
  }

  // ---------- paint ----------
  strokeStart(e, g) { this.stroke = { changed: new Map(), last: g, smooth: this.brush.smooth || e.shiftKey, box: [Infinity, Infinity, -Infinity, -Infinity] }; this.stamp(g); }
  strokeTo(g) {
    if (this.stroke.detail) { this.detailTo(g); return; }
    const s = this.stroke, L = Math.hypot(g.x - s.last.x, g.z - s.last.z), step = Math.max(CELL * .5, this.brush.size * CELL * .25);
    const n = Math.ceil(L / step);
    for (let k = 1; k <= n; k++) this.stamp({ x: s.last.x + (g.x - s.last.x) * k / n, z: s.last.z + (g.z - s.last.z) * k / n });
    s.last = g;
  }
  stamp(g) {
    const s = this.stroke, w = this.app.world, ty = w.type, r = this.brush.size / 2;
    const [ci, cj] = w.cellAt(g.x, g.z), R = Math.ceil(r);
    const fx = (g.x + HALF) / CELL - .5, fz = (g.z + HALF) / CELL - .5;
    const src = s.smooth ? ty.slice() : null;
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      if (Math.hypot(i - fx, j - fz) > Math.max(.5, r)) continue;
      const k = j * N + i;
      let v = this.brush.type;
      if (s.smooth) { const c = new Uint16Array(TYPES.length); for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) c[src[Math.min(N - 1, Math.max(0, j + dj)) * N + Math.min(N - 1, Math.max(0, i + di))]]++; v = c.indexOf(Math.max(...c)); }
      if (ty[k] === v) continue;
      if (!s.changed.has(k)) s.changed.set(k, ty[k]);
      ty[k] = v;
      s.box[0] = Math.min(s.box[0], i); s.box[1] = Math.min(s.box[1], j); s.box[2] = Math.max(s.box[2], i); s.box[3] = Math.max(s.box[3], j);
      s.fresh = true;
    }
  }
  flushStroke() {
    if (this.stroke?.detail) { if (this.stroke.fresh) { this.stroke.fresh=false; this.app.detailChanged(this.stroke.box); } return; }
    const s = this.stroke; if (!s || !s.fresh) return;
    s.fresh = false;
    const [i0, j0, i1, j1] = s.box;
    this.app.regionChanged(i0 * CELL - HALF, j0 * CELL - HALF, (i1 + 1) * CELL - HALF, (j1 + 1) * CELL - HALF);
    s.box = [Infinity, Infinity, -Infinity, -Infinity];
    s.total = s.total || [Infinity, Infinity, -Infinity, -Infinity];
    s.total = [Math.min(s.total[0], i0), Math.min(s.total[1], j0), Math.max(s.total[2], i1), Math.max(s.total[3], j1)];
  }
  strokeEnd(cancel = false) {
    if (this.stroke?.detail) { this.detailEnd(cancel); return; }
    const s = this.stroke; if (!s) return;
    this.flushStroke(); this.stroke = null;
    if (!s.changed.size) return;
    const w = this.app.world, before = [...s.changed], after = before.map(([k]) => [k, w.type[k]]);
    const [i0, j0, i1, j1] = s.total;
    const apply = list => { for (const [k, v] of list) w.type[k] = v; this.app.regionChanged(i0 * CELL - HALF, j0 * CELL - HALF, (i1 + 1) * CELL - HALF, (j1 + 1) * CELL - HALF, { lines: true }); };
    if (cancel) { apply(before); return; }
    this.app.lines.rebuild();
    this.push({ undo: () => apply(before), redo: () => apply(after) });
  }
  hover(g) {
    if (this.app.tool === 'detail') { this.detailHover(g); return; }
    this.detailCursor.visible=false;
    if (!g || this.app.tool !== 'paint') { if (this.cursor.visible) { this.cursor.visible = false; this.app.request(); } return; }
    const w = this.app.world, r = Math.max(.5, this.brush.size / 2) * CELL, a = this.cursor.geometry.attributes.position, lift = this.app.camDist() * .004 + 1;
    for (let k = 0; k <= 64; k++) { const t = k / 64 * Math.PI * 2, x = g.x + Math.cos(t) * r, z = g.z + Math.sin(t) * r; a.setXYZ(k, x, Math.max(0, w.height(x, z)) + lift, z); }
    a.needsUpdate = true; this.cursor.visible = true; this.app.request();
  }

  // ---------- rivers and roads ----------
  finishLine() {
    const d = this.draft; this.draft = null; this.app.lines.draft(null);
    if (!d) return;
    const pts = d.pts.filter((p, k) => k === 0 || Math.hypot(p[0] - d.pts[k - 1][0], p[1] - d.pts[k - 1][1]) > 2);
    if (pts.length >= 2) {
      const id = uid(d.kind);
      this.edit(d.kind + 's', l => l.push({ id, pts }), (a, b) => this.app.linesChanged(a, b));
      // Through mountains: keep it selected so the bar offers how it gets through.
      if (this.app.world.crossesMountains(pts)) { this.selLine = id; this.app.lines.selected = id; this.app.lines.showSelected(); }
    }
    this.app.ui.refresh();
  }
  // A drawn point close to a line of the same kind joins it: an end first, else the nearest point along it;
  // a road tapped near a place's middle goes to its middle. Returns { x, z, to: what it joined, or null }.
  snapLine(x, z, kind) {
    const app = this.app, w = app.world, tol = Math.max(14, app.camDist() * .045);
    const own = this.draft && this.draft.pts;
    let best = null, bd = tol * 1.4;
    for (const l of w.data[kind + 's']) for (const p of [l.pts[0], l.pts[l.pts.length - 1]]) {
      const d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; best = { x: p[0], z: p[1], to: `the end of a ${kind}` }; }
    }
    if (best) return best;
    if (kind === 'road') for (const p of w.data.settlements) {
      const d = Math.hypot(p.x - x, p.z - z); if (d < Math.max(tol, (p.r || 60) * .3) && d < bd) { bd = d; best = { x: p.x, z: p.z, to: p.name || 'a place' }; }
    }
    if (best) return best;
    bd = tol;
    for (const l of w.data[kind + 's']) for (let k = 0; k + 1 < l.pts.length; k++) {
      const [ax, az] = l.pts[k], [bx, bz] = l.pts[k + 1], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < bd) { bd = d; best = { x: px, z: pz, to: `a ${kind}` }; }
    }
    if (best && own && own.length && Math.hypot(own[own.length - 1][0] - best.x, own[own.length - 1][1] - best.z) < 2) best = null; // not onto itself
    return best || { x, z, to: null };
  }
  // How the selected line gets through mountains: undefined (carve a pass / valley), 'over', 'tunnel'.
  setThrough(v) {
    const f = this.selLine && this.app.lines.find(this.selLine); if (!f) return;
    const id = f.line.id;
    this.edit(f.kind + 's', l => { const q = l.find(q => q.id === id); if (v) q.through = v; else delete q.through; }, (a, b) => this.app.linesChanged(a, b));
    this.app.lines.showSelected(); this.app.ui.refresh();
  }
  deleteSelected() {
    const app = this.app;
    if (this.selLine) { const id = this.selLine, f = app.lines.find(id); if (f) this.edit(f.kind + 's', l => l.splice(l.findIndex(q => q.id === id), 1), (a, b) => app.linesChanged(a, b)); this.selLine = null; app.lines.selected = null; app.lines.showSelected(); app.ui.refresh(); return; }
    if (this.sel) { const { key, id } = this.sel; this.edit(key, l => l.splice(l.findIndex(q => q.id === id), 1), (a, b) => this.pinsChanged(key, a, b)); this.sel = null; app.ui.refresh(); }
  }

  // ---------- settlements and battlemaps (pins) ----------
  // A list changed from a (before) to b (after): rebuild only what those pins touch.
  pinsChanged(key, a = [], b = []) {
    const app = this.app, w = app.world, sig = p => JSON.stringify(p);
    const ka = new Set(a.map(sig)), kb = new Set(b.map(sig));
    const changed = [...a.filter(p => !kb.has(sig(p))), ...b.filter(p => !ka.has(sig(p)))];
    if (key === 'settlements') {
      app.detail.freeAll();
      ensureLore(w);
      w.updateSettlements();
      for (const p of changed) {
        app.towns.free(p.id);
        const R = (p.r || 90) + 260;
        if (UNIT_KINDS.has(p.kind)) app.terrain.invalidate(p.x - 130, p.z - 130, p.x + 130, p.z + 130);
        app.props.invalidate(p.x - R, p.z - R, p.x + R, p.z + R);
      }
      app.lines.rebuild(); app.maps.freeAll(); app.bridges.rebuild();
    } else for (const p of changed) app.maps.free(p.id);
    app.ui.refresh(); app.request(); app.save();
  }
  updatePin(key, id, patch) { this.edit(key, l => Object.assign(l.find(p => p.id === id), patch), (a, b) => this.pinsChanged(key, a, b)); }
  selected() { if (!this.sel) return null; return this.app.world.data[this.sel.key].find(p => p.id === this.sel.id) || null; }
  flyToPin(key, p) { if (key === 'settlements') this.app.flyTo(p.x, p.z, Math.max(420, p.r * 3), .75); else this.app.flyTo(p.x, p.z, 75, .85); }
  pinUnder(cx, cy, key) {
    const app = this.app, lab = app.ui.labelAt(cx, cy, key); if (lab) return lab.item;
    let best = null, bd = 30;
    for (const p of app.world.data[key]) {
      if (key === 'settlements' ? !app.towns.visible(p, app.role) : !app.maps.visible(p, app.role)) continue;
      const s = app.project(p.x, (p.h ?? app.world.height(p.x, p.z)) + 2, p.z); if (s.behind) continue;
      const d = Math.hypot(s.x - cx, s.y - cy); if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  // Anywhere close enough to play uses the global grid.
  focusMap() { return this.app.camDist() < 300 ? { id: 'world', name: 'World grid' } : null; }
  sameSpace(t){return (t.space||null)===(this.app.underground?.currentSpace||null);}
  tokenAt(g) {
    const [fx,fz]=floatSquare(g.x,g.z); let best=null,bd=.75;
    for (const t of this.app.world.data.tokens) { if (!this.app.maps.tokenVisible(t,this.app.role)||!this.sameSpace(t)||(t.level||0)!==(this.app.detailLevel||0)) continue; const d=Math.hypot(t.sx-fx,t.sz-fz); if (d<bd) { bd=d; best=t; } }
    return best;
  }
  freeSquare(level,sx,sz) {
    sx=Math.round(sx); sz=Math.round(sz);
    if(this.app.underground?.active)return this.app.underground.freeSquare(level||0,sx,sz);
    if(this.app.ddImports?.blockedSquare(sx,sz,level||0)||this.app.interiors?.blockedSquare(sx,sz,level||0))return false;
    const blocker=this.app.props.squareBlocked(level,sx,sz);
    return blocker!=='tree' && blocker!=='rock' && !this.app.detail.objectBlocked(level,sx,sz);
  }
  canMove(t,sx,sz) {
    const start=squareCenter(t.sx,t.sz),end=squareCenter(sx,sz);
    if(this.app.underground?.active&&this.app.underground.importer.blocksMove(start[0],start[1],end[0],end[1],0))return false;
    if(!this.app.underground?.active&&(this.app.ddImports?.blocksMove(start[0],start[1],end[0],end[1],t.level||0)||this.app.interiors?.blocksMove(start[0],start[1],end[0],end[1],t.level||0)))return false;
    // Check intermediate squares too: a fast drag cannot tunnel through a wall/tree.
    const n=Math.max(1,Math.ceil(Math.max(Math.abs(sx-t.sx),Math.abs(sz-t.sz))*2));
    let px=Math.round(t.sx),pz=Math.round(t.sz);
    for(let k=1;k<=n;k++) {
      const qx=Math.round(t.sx+(sx-t.sx)*k/n),qz=Math.round(t.sz+(sz-t.sz)*k/n);
      if(!this.freeSquare(t.level,qx,qz)) return false;
      if((qx!==px || qz!==pz) && this.app.detail.edgeBlocked(t.level||0,px,pz,qx,qz)) return false; // walls are on edges
      px=qx; pz=qz;
    }
    return true;
  }
  // Put tokens on the nearest free squares to ground points (level 0), as one undo step.
  // specs: [{ x, z, fields }]. Returns the tokens placed (null where there was no room).
  placeTokens(specs) {
    const app=this.app,data=app.world.data,level=0,added=[],out=[];
    const taken=(sx,sz)=>[...data.tokens,...added].some(q=>this.sameSpace(q)&&(q.level||0)===level && Math.round(q.sx)===sx && Math.round(q.sz)===sz);
    for (const {x,z,fields} of specs) {
      const [cx,cz]=squareAt(x,z); let sq=null;
      for(let r=0;r<=10 && !sq;r++) for(let dz=-r;dz<=r && !sq;dz++) for(let dx=-r;dx<=r && !sq;dx++) { if(r && Math.abs(dx)!==r && Math.abs(dz)!==r) continue; const sx=cx+dx,sz=cz+dz; if(!taken(sx,sz) && this.freeSquare(level,sx,sz)) sq=[sx,sz]; }
      const tk=sq?{id:uid('tk'),color:'#c9c1ae',kind:'npc',...fields,...(app.underground?.active?{space:app.underground.active.id}:{}),level,sx:sq[0],sz:sq[1]}:null;
      if(tk) added.push(tk); out.push(tk);
    }
    if(added.length) this.edit('tokens',l=>l.push(...added),()=>{app.maps.refreshTokens();app.request();app.save();});
    return out;
  }
  placeTokenAt(x, z, fields) { return this.placeTokens([{ x, z, fields }])[0]; }
  addToken() {
    if(!this.focusMap()) return;
    const app=this.app,t=app.controls.target,data=app.world.data,[cx,cz]=squareAt(t.x,t.z),level=app.detailLevel;
    let sq=null;
    for(let r=0;r<=12 && !sq;r++) for(let z=-r;z<=r && !sq;z++) for(let x=-r;x<=r && !sq;x++) {
      if(r && Math.abs(x)!==r && Math.abs(z)!==r) continue;
      const sx=cx+x,sz=cz+z;
      if(!data.tokens.some(q=>this.sameSpace(q)&&q.level===level && q.sx===sx && q.sz===sz) && this.freeSquare(level,sx,sz)) sq=[sx,sz];
    }
    if(!sq) { app.ui.toast('No free square nearby'); return; }
    const tk={id:uid('tk'),name:this.tokenForm.name||'Token',color:this.tokenForm.color,kind:'npc',...(app.underground?.active?{space:app.underground.active.id}:{}),level,sx:sq[0],sz:sq[1]};
    this.edit('tokens',l=>l.push(tk),()=>{app.maps.refreshTokens();app.request();app.save();});
  }

  // Detail strokes snapshot only the tiles they touch. Edge strokes preview a straight
  // run and write on release; square strokes appear as the finger moves.
  detailStart(g) {
    this.app.card.close();
    const b={...this.detailBrush},edge=['wall','door','window'].includes(b.kind);
    this.stroke={detail:true,b,level:this.app.detailLevel,before:new Map(),last:g,start:this.app.detail.edgeAt(g.x,g.z),edge,box:[Infinity,Infinity,-Infinity,-Infinity]};
    if(!edge && b.kind!=='objects') this.detailStamp(g);
    this.detailHover(g);
  }
  detailWrite(sx,sz,patch) {
    const s=this.stroke,d=this.app.detail,[key]=d.address(s.level,sx,sz),old=d.getSquare(s.level,sx,sz);
    if(Object.entries(patch).every(([f,v])=>old[f]===v)) return;
    if(!s.before.has(key)) s.before.set(key,this.app.detail.world.data.detail[key]?clone(this.app.detail.world.data.detail[key]):null);
    d.setSquare(s.level,sx,sz,patch);
    const [x,z]=squareCenter(sx,sz); s.box=[Math.min(s.box[0],x-DETAIL_SQ),Math.min(s.box[1],z-DETAIL_SQ),Math.max(s.box[2],x+DETAIL_SQ),Math.max(s.box[3],z+DETAIL_SQ)]; s.fresh=true;
  }
  detailStamp(g) {
    const s=this.stroke,b=s.b,[sx,sz]=squareAt(g.x,g.z),off=Math.floor((b.size-1)/2);
    for(let j=0;j<b.size;j++) for(let i=0;i<b.size;i++) {
      const x=sx+i-off,z=sz+j-off;
      if(b.kind==='erase') {
        this.detailWrite(x,z,{ground:0,wallN:0,wallW:0,object:null});
        this.detailWrite(x+1,z,{wallW:0}); this.detailWrite(x,z+1,{wallN:0});
      } else this.detailWrite(x,z,{ground:b.kind==='clear'?CLEAR:b.ground});
    }
  }
  detailTo(g) {
    const s=this.stroke;
    if(!s.edge && s.b.kind!=='objects') {
      const n=Math.ceil(Math.hypot(g.x-s.last.x,g.z-s.last.z)/(DETAIL_SQ*.4));
      for(let k=1;k<=n;k++) this.detailStamp({x:s.last.x+(g.x-s.last.x)*k/n,z:s.last.z+(g.z-s.last.z)*k/n});
    }
    s.last=g; this.app.request();
  }
  detailEnd(cancel=false) {
    const s=this.stroke,d=this.app.detail,data=this.app.underground?.active||d.world.data;
    if(s.b.kind==='objects' && !cancel) {
      const [sx,sz]=squareAt(s.last.x,s.last.z),old=d.getSquare(s.level,sx,sz).object;
      this.detailWrite(sx,sz,{object:old?.k===(s.b.object||'barrel')?{...old,rot:((old.rot||0)+1)%4}:{id:'prop_'+crypto.randomUUID(),k:s.b.object||'barrel',rot:s.b.rot||0}});
    }
    if(s.edge && !cancel) for(const e of d.edgeRun(s.start,s.last,s.b.size)) {
      const old=d.getSquare(s.level,e.sx,e.sz)[e.axis];
      if(s.b.kind==='wall') this.detailWrite(e.sx,e.sz,{[e.axis]:s.b.wall});
      else if(old) this.detailWrite(e.sx,e.sz,{[e.axis]:(old&15)|(s.b.kind==='door'?DOOR:WINDOW)});
    }
    this.flushStroke(); this.stroke=null;
    if(!s.before.size) return;
    const after=new Map([...s.before.keys()].map(k=>[k,data.detail[k]?clone(data.detail[k]):null]));
    const apply=tiles=>{ for(const [key,t] of tiles) { if(t) data.detail[key]=clone(t); else delete data.detail[key]; d.cache.delete(key); d.free(key); } this.app.detailChanged(s.box); };
    if(cancel) { apply(s.before); return; }
    if(JSON.stringify([...s.before])!==JSON.stringify([...after])) this.push({undo:()=>apply(s.before),redo:()=>apply(after)});
    this.app.save();
  }
  detailHover(g) {
    this.cursor.visible=false; this.detailCursor.visible=!!g;
    if(!g) { this.app.request(); return; }
    const d=this.app.detail,brush=this.stroke?.b||this.detailBrush,b=brush.kind==='objects'?{...brush,size:1}:brush,edges=['wall','door','window'].includes(b.kind),v=[];
    const point=(x,z)=>[x,this.app.maps.ground(x,z)+.28,z];
    const line=(x,z,X,Z)=>v.push(...point(x,z),...point(X,Z));
    if(edges) {
      const start=this.stroke?.start||d.edgeAt(g.x,g.z);
      for(const e of d.edgeRun(start,g,b.size)) { const [cx,cz]=squareCenter(e.sx,e.sz),x=cx-DETAIL_SQ/2,z=cz-DETAIL_SQ/2; line(x,z,x+(e.axis==='wallN'?DETAIL_SQ:0),z+(e.axis==='wallW'?DETAIL_SQ:0)); }
    } else {
      const [sx,sz]=squareAt(g.x,g.z),o=Math.floor((b.size-1)/2);
      for(let j=0;j<b.size;j++) for(let i=0;i<b.size;i++) { const [cx,cz]=squareCenter(sx+i-o,sz+j-o),x=cx-DETAIL_SQ/2,z=cz-DETAIL_SQ/2; line(x,z,x+DETAIL_SQ,z);line(x+DETAIL_SQ,z,x+DETAIL_SQ,z+DETAIL_SQ);line(x+DETAIL_SQ,z+DETAIL_SQ,x,z+DETAIL_SQ);line(x,z+DETAIL_SQ,x,z); }
    }
    this.detailCursor.geometry.dispose(); this.detailCursor.geometry=new THREE.BufferGeometry(); this.detailCursor.geometry.setAttribute('position',new THREE.Float32BufferAttribute(v,3)); this.app.request();
  }
  ping(g) {
    if (!g) return;
    const geo = new THREE.RingGeometry(.8, 1, 40).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: PAL.ping, transparent: true, depthTest: false }));
    m.position.set(g.x, g.y + .2, g.z); m.renderOrder = 6; this.app.scene.add(m);
    this.pings.push({ m, t0: performance.now(), s: Math.max(1.5, this.app.camDist() * .03) });
    this.app.request();
  }
  animating(now) { return this.pings.length > 0; }
  frame(now) {
    this.flushStroke();
    for (const p of [...this.pings]) {
      const k = (now - p.t0) / 2000;
      if (k >= 1) { p.m.parent?.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); this.pings.splice(this.pings.indexOf(p), 1); continue; }
      const s = p.s * (1 + (k * 3 % 1) * 2); p.m.scale.set(s, 1, s); p.m.material.opacity = 1 - (k * 3 % 1);
    }
  }
}
export { PLACE_KINDS, MAP };
