// town-geometry.js — pure math helpers. All inputs are in grid units.
(function (G) {
  // Returns true if segment AB crosses segment CD (touching counts).
  function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const den = (dy - cy) * (bx - ax) - (dx - cx) * (by - ay);
    if (den === 0) return false;
    const ua = ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) / den;
    const ub = ((bx - ax) * (ay - cy) - (by - ay) * (ax - cx)) / den;
    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  }

  // Intersection point of AB and CD, or null.
  function segIntersectPoint(ax, ay, bx, by, cx, cy, dx, dy) {
    const den = (dy - cy) * (bx - ax) - (dx - cx) * (by - ay);
    if (den === 0) return null;
    const ua = ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) / den;
    const ub = ((bx - ax) * (ay - cy) - (by - ay) * (ax - cx)) / den;
    if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null;
    return { x: ax + ua * (bx - ax), y: ay + ua * (by - ay), t: ua };
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
    if (l2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
  }

  function inRect(x, y, r) {
    return x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;
  }

  function rectArea(r) { return (r.maxX - r.minX) * (r.maxY - r.minY); }

  function snap(v, step) { return Math.round(v / step) * step; }

  function shareTag(a, b) {
    if (!a || !b) return false;
    for (const t of a) if (b.includes(t)) return true;
    return false;
  }

  let _id = 0;
  function uid(prefix) {
    _id = (_id + 1) % 1e6;
    return `${prefix}_${Date.now().toString(36)}${_id.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  }

  G.geom = { segIntersect, segIntersectPoint, distToSegment, inRect, rectArea, snap, shareTag, uid };
})(window.GeezTown = window.GeezTown || {});
