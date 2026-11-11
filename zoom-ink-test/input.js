import * as THREE from 'three';
// Mouse, touch and pen in one place. Camera moves are left to MapControls; this routes
// taps, double taps, long presses and tool drags, and keeps a second finger for the camera.
export class Input {
  constructor(app) {
    this.app = app; this.pointers = new Map(); this.claim = null; this.lastTap = null; this.hoverAt = null; this.travelKeys = new Set();
    const el = app.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', e => this.down(e), { capture: true });
    addEventListener('pointermove', e => this.move(e));
    addEventListener('pointerup', e => this.up(e));
    addEventListener('pointercancel', e => this.up(e, true));
    el.addEventListener('dblclick', e => { const g = app.pickGround(e.clientX, e.clientY); if (g) app.tools.doubleTap(e, g); });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerleave', () => app.tools.hover(null));
    addEventListener('keyup', e => this.travelKeys.delete(e.code));
    addEventListener('blur', () => this.travelKeys.clear());
    addEventListener('focusin', e => { if(this.typing(e.target))this.travelKeys.clear(); });
    document.addEventListener('visibilitychange', () => { if(document.hidden)this.travelKeys.clear(); });
    addEventListener('keydown', e => {
      if (this.typing(e.target)) return;
      if (!e.ctrlKey && !e.metaKey && !e.altKey && ['KeyW','KeyA','KeyS','KeyD'].includes(e.code)) { e.preventDefault(); this.travelKeys.add(e.code); app.stopFlight(); app.request(); return; }
      if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.code==='KeyG'){e.preventDefault();if(!e.repeat){app.showGrid=!app.showGrid;app.ui.refresh();}return;}
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? app.tools.redo() : app.tools.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); app.tools.redo(); return; }
      if (e.key === 'Tab') { e.preventDefault(); app.toggleTopDown(); return; }
      if (e.key === 'Escape' && !app.card.close() && !app.tools.escape()) app.flyOut();
      app.tools.key(e);
    });
  }
  typing(el) { return !!el?.closest?.('input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'); }
  travel(dt) {
    if (!this.travelKeys.size) return;
    const app=this.app;
    if(this.typing(document.activeElement)||!app.controls.enabled||document.hidden){this.travelKeys.clear();return;}
    const forward=Number(this.travelKeys.has('KeyW'))-Number(this.travelKeys.has('KeyS')),right=Number(this.travelKeys.has('KeyD'))-Number(this.travelKeys.has('KeyA'));
    if(!forward&&!right)return;
    // Camera-right stays meaningful even when looking straight down.
    const side=new THREE.Vector3().setFromMatrixColumn(app.camera.matrix,0);side.y=0;side.normalize();
    const ahead=new THREE.Vector3(side.z,0,-side.x),delta=ahead.multiplyScalar(forward).addScaledVector(side,right).normalize();
    delta.multiplyScalar(Math.max(6,app.camDist()*.65)*Math.min(dt,.05));
    app.controls.target.add(delta);app.camera.position.add(delta);app.request();
  }
  down(e) {
    const app = this.app;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), x0: e.clientX, y0: e.clientY, type: e.pointerType });
    if (this.pointers.size > 1) { // a second finger: the camera takes over, any stroke is undone
      clearTimeout(this.lp); clearTimeout(this.tapTimer);
      if (this.claim) { app.tools.cancel(); this.claim = null; app.controls.enabled = true; }
      this.multi = true;
      return;
    }
    this.multi = false;
    if (e.pointerType === 'mouse' && e.button === 2) { this.rdown = { x: e.clientX, y: e.clientY, t: performance.now() }; return; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const g = app.pickGround(e.clientX, e.clientY);
    // Drawing tools disable the one-pointer action in toolChanged(), while leaving
    // MapControls listening so it can track the first finger of a later pinch.
    if (app.tools.down(e, g)) { this.claim = e.pointerId; app.controls.enabled = !!app.tools.stroke; }
    if (e.pointerType !== 'mouse' && !app.tools.stroke) {
      clearTimeout(this.lp);
      this.lp = setTimeout(() => { const p = this.pointers.get(e.pointerId); if (p && !p.moved && !this.multi) { const g2 = app.pickGround(p.x, p.y); if (g2) { p.longPressed = true; app.tools.longPress(e, g2); } } }, 550);
    }
  }
  move(e) {
    const p = this.pointers.get(e.pointerId), app = this.app;
    if (p) { p.moved ||= Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8; p.x = e.clientX; p.y = e.clientY; if (Math.hypot(p.x - p.x0, p.y - p.y0) > 8) { clearTimeout(this.lp); clearTimeout(this.tapTimer); } }
    if (this.claim === e.pointerId) { const g = app.pickGround(e.clientX, e.clientY); if (p?.moved || app.tools.stroke) app.tools.move(e, g); return; }
    if (!p && e.pointerType === 'mouse' && e.target === app.renderer.domElement && app.tools.wantsHover()) {
      this.hoverAt = [e.clientX, e.clientY];
      if (!this.hoverQueued) { this.hoverQueued = true; requestAnimationFrame(() => { this.hoverQueued = false; const g = this.hoverAt && app.pickGround(...this.hoverAt); app.tools.hover(g); }); }
    }
  }
  up(e, cancelled = false) {
    const p = this.pointers.get(e.pointerId), app = this.app;
    this.pointers.delete(e.pointerId);
    if (e.pointerType === 'mouse' && e.button === 2 && this.rdown) { const r = this.rdown; this.rdown = null; if (!cancelled && performance.now() - r.t < 600 && Math.hypot(e.clientX - r.x, e.clientY - r.y) < 6) app.tools.context(e); return; }
    clearTimeout(this.lp);
    if (this.claim === e.pointerId) { const g = app.pickGround(e.clientX, e.clientY); cancelled ? app.tools.cancel() : app.tools.up(e, g, !p?.moved && !p?.longPressed && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) <= 8); this.claim = null; app.controls.enabled = true; return; }
    if (!p || p.longPressed || cancelled || this.multi) { if (this.pointers.size === 0) this.multi = false; return; }
    const now = performance.now();
    if (!p.moved && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) <= 8) {
      const g = app.pickGround(e.clientX, e.clientY);
      if (e.pointerType !== 'mouse' && this.lastTap && now - this.lastTap.t < 380 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 30) { this.lastTap = null; clearTimeout(this.tapTimer); if (g) app.tools.doubleTap(e, g); return; }
      this.lastTap = { t: now, x: p.x, y: p.y };
      clearTimeout(this.tapTimer);
      // Leave a touch double-tap window before a place card can cover its label.
      if (e.pointerType !== 'mouse' && ['look', 'play'].includes(app.tool) && !app.tools.pingArmed && !app.ruler?.on && app.ui.labelAt(e.clientX, e.clientY, 'settlements')) {
        const tool = app.tool;
        this.tapTimer = setTimeout(() => { if (app.tool === tool) app.tools.tap(e, g); }, 380);
      } else app.tools.tap(e, g);
    }
  }
}
