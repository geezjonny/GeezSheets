// navgrid.js — cell passability built from walls + closed doors, A* pathfinding,
// line-of-sight and circle collision. World coordinates are dd2vtt grid units;
// cell (cx,cy) covers [origin.x+cx, origin.x+cx+1) and likewise for y.
(function (G) {
  const { segIntersect, distToSegment } = G.geom;

  class NavGrid {
    constructor(world) {
      this.world = world;
      this.rebuild();
    }

    blockers() {
      const w = this.world;
      const list = w.walls.slice();
      for (const d of w.doors) if (d.closed) list.push(d);
      return list;
    }

    rebuild() {
      const w = this.world;
      this.ox = w.origin.x; this.oy = w.origin.y;
      this.w = Math.max(1, Math.ceil(w.width));
      this.h = Math.max(1, Math.ceil(w.height));
      const n = this.w * this.h;

      // Bucket blockers by the cells their bounding box touches.
      this.buckets = new Array(n);
      this._all = this.blockers();
      for (const b of this._all) {
        const x0 = Math.floor(Math.min(b.x1, b.x2) - this.ox - 0.01);
        const x1 = Math.floor(Math.max(b.x1, b.x2) - this.ox + 0.01);
        const y0 = Math.floor(Math.min(b.y1, b.y2) - this.oy - 0.01);
        const y1 = Math.floor(Math.max(b.y1, b.y2) - this.oy + 0.01);
        for (let cy = Math.max(0, y0); cy <= Math.min(this.h - 1, y1); cy++)
          for (let cx = Math.max(0, x0); cx <= Math.min(this.w - 1, x1); cx++) {
            const i = cy * this.w + cx;
            (this.buckets[i] || (this.buckets[i] = [])).push(b);
          }
      }

      // Precompute blocked steps: east, south, south-east, south-west.
      this.E = new Uint8Array(n); this.S = new Uint8Array(n);
      this.SE = new Uint8Array(n); this.SW = new Uint8Array(n);
      for (let cy = 0; cy < this.h; cy++) for (let cx = 0; cx < this.w; cx++) {
        const i = cy * this.w + cx;
        if (cx + 1 < this.w) this.E[i] = this._stepBlocked(cx, cy, cx + 1, cy);
        if (cy + 1 < this.h) this.S[i] = this._stepBlocked(cx, cy, cx, cy + 1);
        if (cx + 1 < this.w && cy + 1 < this.h) this.SE[i] = this._stepBlocked(cx, cy, cx + 1, cy + 1);
        if (cx - 1 >= 0 && cy + 1 < this.h) this.SW[i] = this._stepBlocked(cx, cy, cx - 1, cy + 1);
      }
    }

    _stepBlocked(ax, ay, bx, by) {
      const x1 = this.ox + ax + 0.5, y1 = this.oy + ay + 0.5;
      const x2 = this.ox + bx + 0.5, y2 = this.oy + by + 0.5;
      const seen = new Set();
      for (const i of [ay * this.w + ax, by * this.w + bx, ay * this.w + bx, by * this.w + ax]) {
        const list = this.buckets[i]; if (!list) continue;
        for (const b of list) {
          if (seen.has(b)) continue; seen.add(b);
          if (segIntersect(x1, y1, x2, y2, b.x1, b.y1, b.x2, b.y2)) return 1;
        }
      }
      return 0;
    }

    inBounds(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.w && cy < this.h; }
    cellOf(x, y) {
      return {
        cx: Math.max(0, Math.min(this.w - 1, Math.floor(x - this.ox))),
        cy: Math.max(0, Math.min(this.h - 1, Math.floor(y - this.oy))),
      };
    }
    center(cx, cy) { return { x: this.ox + cx + 0.5, y: this.oy + cy + 0.5 }; }

    // Can you step from cell a to neighbouring cell b?
    canStep(ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      if (!this.inBounds(bx, by)) return false;
      const W = this.w;
      if (dy === 0) return !this.E[ay * W + Math.min(ax, bx)];
      if (dx === 0) return !this.S[Math.min(ay, by) * W + ax];
      // Diagonal: normalise to the upper cell, then require both orthogonal routes clear (no corner cutting).
      const top = dy > 0 ? { x: ax, y: ay } : { x: bx, y: by };
      const goesRight = (dy > 0 ? dx : -dx) > 0;
      const i = top.y * W + top.x;
      if (goesRight) {
        return !this.SE[i] && !this.E[i] && !this.S[i] && !this.S[i + 1] && !this.E[i + W];
      }
      return !this.SW[i] && !this.E[i - 1] && !this.S[i] && !this.S[i - 1] && !this.E[i + W - 1];
    }

    // A* between world points. Returns array of world-space waypoints (cell centres), or null.
    findPath(sx, sy, tx, ty, maxNodes = 4000) {
      const s = this.cellOf(sx, sy), t = this.cellOf(tx, ty);
      const W = this.w, start = s.cy * W + s.cx, goal = t.cy * W + t.cx;
      if (start === goal) return [this.center(t.cx, t.cy)];
      const g = new Map([[start, 0]]), came = new Map(), closed = new Set();
      const heap = new MinHeap();
      const h = (i) => { const dx = Math.abs(i % W - t.cx), dy = Math.abs(((i / W) | 0) - t.cy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
      heap.push(start, h(start));
      let expanded = 0;
      while (heap.size) {
        const cur = heap.pop();
        if (cur === goal) break;
        if (closed.has(cur)) continue;
        closed.add(cur);
        if (++expanded > maxNodes) return null;
        const cx = cur % W, cy = (cur / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!this.canStep(cx, cy, nx, ny)) continue;
          const ni = ny * W + nx;
          if (closed.has(ni)) continue;
          const ng = g.get(cur) + (dx && dy ? 1.414 : 1);
          if (ng < (g.has(ni) ? g.get(ni) : Infinity)) {
            g.set(ni, ng); came.set(ni, cur); heap.push(ni, ng + h(ni));
          }
        }
      }
      if (!came.has(goal)) return null;
      const path = [];
      for (let c = goal; c !== start; c = came.get(c)) path.push(this.center(c % W, (c / W) | 0));
      path.reverse();
      path[path.length - 1] = { x: tx, y: ty }; // finish on the exact target point
      return path;
    }

    // Line of sight between two world points (walls + closed doors block).
    hasLOS(ax, ay, bx, by) {
      for (const b of this._all) if (segIntersect(ax, ay, bx, by, b.x1, b.y1, b.x2, b.y2)) return false;
      return true;
    }

    // Would a circle of radius r moving from (ax,ay) to (bx,by) hit a blocker?
    moveBlocked(ax, ay, bx, by, r) {
      const c = this.cellOf(bx, by), reach = Math.ceil(r) + 1, seen = new Set();
      for (let cy = c.cy - reach; cy <= c.cy + reach; cy++) for (let cx = c.cx - reach; cx <= c.cx + reach; cx++) {
        if (!this.inBounds(cx, cy)) continue;
        const list = this.buckets[cy * this.w + cx]; if (!list) continue;
        for (const b of list) {
          if (seen.has(b)) continue; seen.add(b);
          if (segIntersect(ax, ay, bx, by, b.x1, b.y1, b.x2, b.y2)) return true;
          if (distToSegment(bx, by, b.x1, b.y1, b.x2, b.y2) < r) return true;
        }
      }
      return false;
    }
  }

  class MinHeap {
    constructor() { this.k = []; this.p = []; }
    get size() { return this.k.length; }
    push(key, pri) {
      const k = this.k, p = this.p; k.push(key); p.push(pri);
      let i = k.length - 1;
      while (i > 0) {
        const up = (i - 1) >> 1; if (p[up] <= p[i]) break;
        [k[up], k[i]] = [k[i], k[up]]; [p[up], p[i]] = [p[i], p[up]]; i = up;
      }
    }
    pop() {
      const k = this.k, p = this.p, top = k[0], lk = k.pop(), lp = p.pop();
      if (k.length) {
        k[0] = lk; p[0] = lp; let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < k.length && p[l] < p[m]) m = l;
          if (r < k.length && p[r] < p[m]) m = r;
          if (m === i) break;
          [k[m], k[i]] = [k[i], k[m]]; [p[m], p[i]] = [p[i], p[m]]; i = m;
        }
      }
      return top;
    }
  }

  G.NavGrid = NavGrid;
})(window.GeezTown = window.GeezTown || {});
