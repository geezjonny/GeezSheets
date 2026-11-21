// Pure seeded dungeon generation. Coordinates are map cells; output coordinates are VTT pixels.
const clampInt = (v, min, max) => Math.max(min, Math.min(max, Math.floor(Number(v) || 0)));

function rng(seed) {
  let h = 2166136261 >>> 0;
  for (const c of String(seed ?? "")) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5; return (h >>> 0) / 4294967296; };
}
const key = (x, y) => `${x},${y}`;
const cellsOf = (r) => { const out = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]); return out; };
const overlap = (a, b, gap = 1) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

function roomList(width, height, count, random) {
  const rooms = [], tries = Math.max(100, count * 80);
  for (let i = 0; i < tries && rooms.length < count; i++) {
    const w = Math.min(width - 2, 3 + Math.floor(random() * Math.max(1, Math.min(6, width - 4))));
    const h = Math.min(height - 2, 3 + Math.floor(random() * Math.max(1, Math.min(5, height - 4))));
    if (w < 3 || h < 3) break;
    const r = { x: 1 + Math.floor(random() * Math.max(1, width - w - 1)), y: 1 + Math.floor(random() * Math.max(1, height - h - 1)), w, h };
    if (!rooms.some((old) => overlap(r, old, 1))) rooms.push(r);
  }
  return rooms;
}

function linePath(a, b, horizontalFirst) {
  const out = [], step = (from, to) => from === to ? [] : [from < to ? 1 : -1];
  let x = a[0], y = a[1], push = () => out.push([x, y]); push();
  const hx = horizontalFirst ? b[0] : x, hy = horizontalFirst ? y : b[1];
  for (const dx of step(x, hx)) while (x !== hx) { x += dx; push(); }
  for (const dy of step(y, hy)) while (y !== hy) { y += dy; push(); }
  const vx = horizontalFirst ? x : b[0], vy = horizontalFirst ? b[1] : y;
  for (const dx of step(x, vx)) while (x !== vx) { x += dx; push(); }
  for (const dy of step(y, vy)) while (y !== vy) { y += dy; push(); }
  return out;
}

function runs(occupied, width, height) {
  const out = {}; let n = 0;
  for (let y = 0; y < height; y++) { let x = 0; while (x < width) {
    if (!occupied.has(key(x, y))) { x++; continue; }
    const start = x; while (x < width && occupied.has(key(x, y))) x++;
    out[`f${n++}`] = { x: start * 40, y: y * 40, w: (x - start) * 40, h: 40 };
  } }
  return out;
}

function boundaries(occupied, width, height) {
  const edges = new Map();
  const add = (x1, y1, x2, y2) => { const vertical = x1 === x2, fixed = vertical ? x1 : y1, start = (vertical ? Math.min(y1, y2) : Math.min(x1, x2)) / 40; const k = `${vertical ? "v" : "h"}:${fixed}:${start}`; edges.set(k, { vertical, fixed, start }); };
  for (const item of occupied) { const [x, y] = item.split(",").map(Number); if (!occupied.has(key(x - 1, y))) add(x * 40, y * 40, x * 40, (y + 1) * 40); if (!occupied.has(key(x + 1, y))) add((x + 1) * 40, y * 40, (x + 1) * 40, (y + 1) * 40); if (!occupied.has(key(x, y - 1))) add(x * 40, y * 40, (x + 1) * 40, y * 40); if (!occupied.has(key(x, y + 1))) add(x * 40, (y + 1) * 40, (x + 1) * 40, (y + 1) * 40); }
  const done = new Set(), out = {}; let n = 0;
  for (const [k, e] of edges) { if (done.has(k)) continue; let end = e.start; while (edges.has(`${e.vertical ? "v" : "h"}:${e.fixed}:${end + 1}`)) { done.add(`${e.vertical ? "v" : "h"}:${e.fixed}:${end}`); end++; } done.add(k); out[`w${n++}`] = e.vertical ? { x1: e.fixed, y1: e.start, x2: e.fixed, y2: (end + 1) * 40 } : { x1: e.start * 40, y1: e.fixed, x2: (end + 1) * 40, y2: e.fixed }; }
  return out;
}

export function generateDungeon(options = {}) {
  const width = clampInt(options.width ?? 20, 8, 200), height = clampInt(options.height ?? 14, 8, 200);
  const random = rng(options.seed ?? 1), requested = clampInt(options.roomCount ?? 6, 1, 100);
  const rooms = roomList(width, height, Math.min(requested, 40), random);
  if (!rooms.length) throw new Error("Dungeon needs a map at least 8 by 8 cells.");
  const occupied = new Set(), roomCells = new Set();
  rooms.forEach((r) => cellsOf(r).forEach(([x, y]) => { occupied.add(key(x, y)); roomCells.add(key(x, y)); }));
  const doors = {};
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i], ac = [a.x + Math.floor(a.w / 2), a.y + Math.floor(a.h / 2)], bc = [b.x + Math.floor(b.w / 2), b.y + Math.floor(b.h / 2)];
    const horizontalFirst = options.corridorStyle === "vertical" ? false : options.corridorStyle === "horizontal" ? true : random() < .5;
    const path = linePath(ac, bc, horizontalFirst);
    path.forEach(([x, y]) => { if (x >= 0 && y >= 0 && x < width && y < height) occupied.add(key(x, y)); });
    for (let p = 1; p < path.length; p++) { const [x, y] = path[p], [px, py] = path[p - 1]; if (roomCells.has(key(px, py)) !== roomCells.has(key(x, y))) { const vertical = x !== px; const dx = vertical ? Math.max(x, px) * 40 : x * 40 + 20, dy = vertical ? y * 40 + 20 : Math.max(y, py) * 40; doors[`d${Object.keys(doors).length}`] = { kind: "door", x: dx, y: dy, dir: vertical ? "v" : "h", doorKind: "wood", state: "closed" }; } }
  }
  return { width, height, rooms, floors: runs(occupied, width, height), walls: boundaries(occupied, width, height), doors };
}

export const dungeonCells = (result) => new Set(Object.values(result.floors).flatMap((f) => { const a = []; for (let y = f.y / 40; y < (f.y + f.h) / 40; y++) for (let x = f.x / 40; x < (f.x + f.w) / 40; x++) a.push(key(x, y)); return a; }));
