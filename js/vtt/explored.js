// Persistent explored-map memory. The codec is deliberately independent of the DOM and Firebase.
const CELL = 40;

export const cellId = (x, y) => `${x},${y}`;

// Point in polygon ([{x,y}...]): a token's line-of-sight shape.
function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function visibleCells(holes, cols, rows, cellSize = CELL) {
  const out = new Set();
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const cx = x * cellSize + cellSize / 2, cy = y * cellSize + cellSize / 2;
    if ((holes || []).some(([hx, hy, radius, poly]) => Math.hypot(cx - hx, cy - hy) <= radius && (!poly || inPoly(cx, cy, poly)))) out.add(cellId(x, y));
  }
  return out;
}

export function mergeCells(a, b) {
  return new Set([...(a || []), ...(b || [])].filter((v) => /^\d+,\d+$/.test(String(v))));
}

// v1|row:runs where a run is start-end (inclusive), e.g. v1|0:0-3,7;1:2.
export function encodeCells(cells) {
  const rows = new Map();
  for (const value of cells || []) {
    const [xs, ys] = String(value).split(","), x = Number(xs), y = Number(ys);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) continue;
    (rows.get(y) || rows.set(y, []).get(y)).push(x);
  }
  const out = [];
  for (const y of [...rows.keys()].sort((a, b) => a - b)) {
    const xs = [...new Set(rows.get(y))].sort((a, b) => a - b), runs = [];
    for (let i = 0; i < xs.length;) {
      const start = xs[i]; let end = start; i++;
      while (i < xs.length && xs[i] === end + 1) end = xs[i++];
      runs.push(start === end ? String(start) : `${start}-${end}`);
    }
    out.push(`${y}:${runs.join(",")}`);
  }
  return `v1|${out.join(";")}`;
}

export function decodeCells(value) {
  const out = new Set();
  if (typeof value !== "string" || !value.startsWith("v1|")) return out;
  for (const row of value.slice(3).split(";")) {
    const [ys, runs] = row.split(":"); if (!/^\d+$/.test(ys) || !runs) continue;
    const y = Number(ys);
    for (const run of runs.split(",")) {
      const bits = run.split("-"); if (!bits.every((v) => /^\d+$/.test(v))) continue;
      const a = Number(bits[0]), b = Number(bits[1] ?? bits[0]);
      if (b < a || b - a > 10000) continue;
      for (let x = a; x <= b; x++) out.add(cellId(x, y));
    }
  }
  return out;
}

export const cellsForHoles = (holes, cols, rows) => visibleCells(holes, cols, rows);
