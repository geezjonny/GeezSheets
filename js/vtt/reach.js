// Movement limits for players: tokens can't cross walls or closed doors/windows.
// Cells are 40px, tokens sit on cell centres; a step is blocked if the line between two cell centres touches a wall.
import { S, mapSize } from "./state.js";

const ccw = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
const onSeg = (ax, ay, bx, by, px, py) => Math.min(ax, bx) <= px && px <= Math.max(ax, bx) && Math.min(ay, by) <= py && py <= Math.max(ay, by);
function touches(a, b) {   // segments a=[x1,y1,x2,y2], b: do they intersect (touching counts)?
  const d1 = ccw(b[0], b[1], b[2], b[3], a[0], a[1]), d2 = ccw(b[0], b[1], b[2], b[3], a[2], a[3]);
  const d3 = ccw(a[0], a[1], a[2], a[3], b[0], b[1]), d4 = ccw(a[0], a[1], a[2], a[3], b[2], b[3]);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (d1 === 0 && onSeg(b[0], b[1], b[2], b[3], a[0], a[1])) || (d2 === 0 && onSeg(b[0], b[1], b[2], b[3], a[2], a[3]))
    || (d3 === 0 && onSeg(a[0], a[1], a[2], a[3], b[0], b[1])) || (d4 === 0 && onSeg(a[0], a[1], a[2], a[3], b[2], b[3]));
}

// Everything solid: walls, plus doors that are closed and windows (open or not).
export function solidSegments() {
  const segs = Object.values(S.map.walls || {}).filter((w) => [w.x1, w.y1, w.x2, w.y2].every(Number.isFinite)).map((w) => [w.x1, w.y1, w.x2, w.y2]);
  for (const o of Object.values(S.objects || {})) {
    if (o.kind !== "door" || !Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
    if (o.state === "open" && !o.win) continue;
    segs.push(o.dir === "v" ? [o.x, o.y - 20, o.x, o.y + 20] : [o.x - 20, o.y, o.x + 20, o.y]);
  }
  return segs;
}

// Is a one-cell step between two cell-centre points blocked (wall, closed door, window, or off the map)?
export function stepBlocked(from, to) {
  const { cols, rows } = mapSize();
  if (to.x < 20 || to.y < 20 || to.x > cols * 40 - 20 || to.y > rows * 40 - 20) return true;
  const seg = [from.x, from.y, to.x, to.y];
  return solidSegments().some((s) => touches(seg, s));
}
