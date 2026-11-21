// Pure grid geometry for multi-cell door placement.
export function segmentDoors(start, end, grid = 40) {
  const dx = end.x - start.x, dy = end.y - start.y;
  if (!dx && !dy) return { x1: start.x, y1: start.y, x2: end.x, y2: end.y, dir: null, cells: [] };
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const x2 = horizontal ? end.x : start.x, y2 = horizontal ? start.y : end.y;
  const distance = horizontal ? Math.abs(x2 - start.x) : Math.abs(y2 - start.y);
  const count = Math.round(distance / grid);
  const sign = (horizontal ? x2 - start.x : y2 - start.y) < 0 ? -1 : 1;
  const cells = Array.from({ length: count }, (_, i) => horizontal
    ? { x: start.x + sign * (i + .5) * grid, y: start.y, dir: "h" }
    : { x: start.x, y: start.y + sign * (i + .5) * grid, dir: "v" });
  return { x1: start.x, y1: start.y, x2, y2, dir: horizontal ? "h" : "v", cells };
}
