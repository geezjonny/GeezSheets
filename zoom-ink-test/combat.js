// WORLD.md phase F: the grid only for combat, and a Ruler that always works.
// Outside combat tokens move freely (float squares); Roll initiative snaps everyone nearby to the grid,
// shows it, rolls a d20 each and runs the turn order. End combat hides the grid again.
import * as THREE from 'three';
import { PAL } from './style.js';
import { HALF } from './world.js';
import { SQ, squareAt } from './detail.js';

export const FT_PER_M = 5 / SQ;                                  // 5 ft per 1.5 m square
export const fmtDist = m => { const ft = m * FT_PER_M; return ft >= 5280 ? `${(ft / 5280).toFixed(ft >= 52800 ? 0 : 1)} miles` : `${Math.round(ft)} ft`; };

// ---------------------------------------------------------------- the ruler
export class Ruler {
  constructor(app) {
    this.app = app; this.on = false; this.pts = [];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 64 * 16), 3));
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: PAL.ping, depthTest: false, transparent: true }));
    this.line.renderOrder = 7; this.line.frustumCulled = false; this.line.visible = false; app.scene.add(this.line);
    this.label = document.createElement('div'); this.label.className = 'rulerlabel'; this.label.hidden = true; document.getElementById('labels').append(this.label);
  }
  toggle() { this.on = !this.on; if (!this.on) this.clear(); this.app.ui.refresh(); }
  clear() { this.pts = []; this.update(); }
  add(g) { if (!g) return; this.pts.push([g.x, g.z]); this.update(); this.app.ui.refresh(); }
  undoPoint() { this.pts.pop(); this.update(); this.app.ui.refresh(); }
  length() { let L = 0; for (let k = 1; k < this.pts.length; k++) L += Math.hypot(this.pts[k][0] - this.pts[k - 1][0], this.pts[k][1] - this.pts[k - 1][1]); return L; }
  text() { return this.pts.length < 2 ? (this.pts.length ? 'Tap the next point' : 'Tap a start point') : fmtDist(this.length()); }
  // the line follows the ground (sampled along each leg), lifted with camera distance so it stays visible
  update() {
    const a = this.line.geometry.attributes.position, w = this.app.underground?.active?this.app.underground.facade:this.app.world, lift = Math.max(.3, this.app.camDist() * .004);
    let n = 0;
    for (let k = 1; k < this.pts.length && n < a.count - 1; k++) {
      const [x0, z0] = this.pts[k - 1], [x1, z1] = this.pts[k], steps = Math.min(64, Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 20)));
      for (let s = k === 1 ? 0 : 1; s <= steps && n < a.count; s++) { const x = x0 + (x1 - x0) * s / steps, z = z0 + (z1 - z0) * s / steps; a.setXYZ(n++, x, Math.max(0, w.height(x, z)) + lift, z); }
    }
    a.needsUpdate = true; this.line.geometry.setDrawRange(0, n); this.line.visible = n > 1;
    this.app.request();
  }
  frame() {
    if (!this.pts.length) { this.label.hidden = true; return; }
    const [x, z] = this.pts[this.pts.length - 1], s = this.app.project(x, Math.max(0, this.app.world.height(x, z)) + 1, z);
    this.label.hidden = s.behind; this.label.textContent = this.text();
    this.label.style.transform = `translate(${s.x.toFixed(0)}px, ${s.y.toFixed(0)}px) translate(-50%, -140%)`;
    if (this.pts.length > 1 && this.lastDist !== Math.round(this.app.camDist())) { this.lastDist = Math.round(this.app.camDist()); this.update(); }
  }
}

// ---------------------------------------------------------------- combat
const d20 = () => 1 + Math.floor(Math.random() * 20);
export class Combat {
  constructor(app) {
    this.app = app;
    this.drag = document.createElement('div'); this.drag.className = 'rulerlabel'; this.drag.hidden = true; document.getElementById('labels').append(this.drag);
  }
  get state() { return this.app.underground?.active ? this.app.underground.active.combat : this.app.world.data.combat || null; }
  get on() { return !!this.state?.on; }
  current() { const c = this.state; return c?.on ? this.app.world.data.tokens.find(t => t.id === c.order[c.turn]?.id && this.app.tools.sameSpace(t)) || null : null; }
  start() {
    const app = this.app, data = app.world.data, t = app.controls.target, [cx, cz] = squareAt(t.x, t.z), level = app.detailLevel || 0, tools = app.tools;
    const near = data.tokens.filter(k => tools.sameSpace(k) && (k.level || 0) === level && Math.hypot(k.sx - cx, k.sz - cz) <= 40);
    if (!near.length) { app.ui.toast('No tokens near the view to fight'); return; }
    // snap everyone to a free, unoccupied square near where they stand
    const taken = new Set();
    for (const k of near) {
      let best = null;
      for (let r = 0; r <= 6 && !best; r++) for (let dz = -r; dz <= r && !best; dz++) for (let dx = -r; dx <= r && !best; dx++) {
        if (r && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const sx = Math.round(k.sx) + dx, sz = Math.round(k.sz) + dz;
        if (!taken.has(sx + ',' + sz) && tools.freeSquare(level, sx, sz)) best = [sx, sz];
      }
      if (best) { [k.sx, k.sz] = best; taken.add(best.join(',')); }
    }
    const order = near.map(k => ({ id: k.id, init: d20() + (+k.initBonus || 0) })).sort((a, b) => b.init - a.init);
    if(app.underground?.active)app.underground.active.combat={on:true,round:1,turn:0,order};else data.combat = { on: true, round: 1, turn: 0, order };
    app.showGrid = true; app.maps.refreshTokens(); app.save(); app.ui.refresh(); app.request();
    app.ui.toast(`Initiative! ${order.map(o => `${data.tokens.find(t => t.id === o.id)?.name} ${o.init}`).join(', ')}`);
  }
  next(step = 1) {
    const c = this.state; if (!c?.on || !c.order.length) return;
    c.order = c.order.filter(o => this.app.world.data.tokens.some(t => t.id === o.id && this.app.tools.sameSpace(t)));
    c.turn += step;
    if (c.turn >= c.order.length) { c.turn = 0; c.round++; }
    if (c.turn < 0) { c.turn = c.order.length - 1; c.round = Math.max(1, c.round - 1); }
    const t = this.current(); if (t) { const w = this.app.maps.tokenWorld(t); if (w) this.app.flyTo(w.x, w.z, Math.min(this.app.camDist(), 90)); }
    this.app.save(); this.app.ui.refresh();
  }
  end() { if (!this.state) return; if(this.app.underground?.active)this.app.underground.active.combat={on:false};else this.app.world.data.combat = { on: false }; this.app.showGrid = false; this.drag.hidden = true; this.app.save(); this.app.ui.refresh(); this.app.request(); }
  // while dragging a token in combat: squares moved (5e: diagonals count as one) as feet
  dragShow(t, from, screen) {
    if (!this.on || !from) { this.drag.hidden = true; return; }
    const sq = Math.max(Math.abs(t.sx - from[0]), Math.abs(t.sz - from[1]));
    this.drag.hidden = false; this.drag.textContent = `${sq * 5} ft`;
    this.drag.style.transform = `translate(${screen[0]}px, ${screen[1]}px) translate(-50%, -180%)`;
  }
  dragEnd() { this.drag.hidden = true; }
}
export const floatSquare = (x, z) => [(x + HALF) / SQ - .5, (z + HALF) / SQ - .5];
