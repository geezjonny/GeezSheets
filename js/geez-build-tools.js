// Pure grid geometry. Points are { x, y }; segments are { x1, y1, x2, y2 }.
const point = (p) => typeof p === 'string' ? p.split('_').map(Number) : Array.isArray(p) ? p : [p.x, p.y];
const cellKey = (x, y) => `${x}_${y}`;
const round = (n) => Math.sign(n) * Math.floor(Math.abs(n) + 0.5);
const segment = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });
const edgeSeg = (e) => segment(...e.split(',').map(Number));
const clone = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, { ...v }]));
const cellSet = (cells) => new Set((cells instanceof Set || Array.isArray(cells) ? [...cells] : Object.keys(cells)).map((c) => cellKey(...point(c))));
const ground = new Set(['grass', 'dirt', 'mud', 'sand', 'snow', 'cobble', 'gravel', 'moss', 'swamp']);

/** Godot room presets mapped to the available floor and wall materials; ids are slugs. */
export const ROOM_THEMES = [
    ['Crypt', 'stone', 'stone'], ['Tavern', 'wood', 'wood'], ['Common room', 'wood', 'brick'],
    ['Cabin', 'wood', 'wood'], ['Townhouse', 'wood', 'brick'], ['Hovel', 'dirt', 'stone'],
    ['Castle hall', 'stone', 'stone'], ['Throne room', 'carpet', 'stone'], ['Courtyard', 'cobble', 'stone'],
    ['Temple', 'marble', 'stone'], ['Cathedral', 'tile', 'stone'], ['Cave', 'stone', 'earth'],
    ['Barrow', 'dirt', 'stone'], ['Fort', 'dirt', 'wood'], ['Manor', 'wood', 'brick'], ['Desert ruin', 'sand', 'stone']
].map(([name, floor, wall]) => ({ id: name.toLowerCase().replaceAll(' ', '-'), name, floor, wall }));

/** Return the inclusive rectangle of cell keys between two integer cells. */
export function rectCells(a, b) {
    const [ax, ay] = point(a), [bx, by] = point(b), out = [];
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
        for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) out.push(cellKey(x, y));
    }
    return out;
}

/** Return a size 1–5 square brush; even sizes extend toward positive coordinates. */
export function brushCells(cx, cy, size) {
    size = Math.max(1, Math.min(5, Math.round(size) || 1));
    const offset = Math.floor((size - 1) / 2);
    return rectCells([cx - offset, cy - offset], [cx - offset + size - 1, cy - offset + size - 1]);
}

/** Return deduplicated brush footprints along a rounded DDA line, including both endpoints. */
export function strokeCells(a, b, size) {
    const [ax, ay] = point(a), [bx, by] = point(b), steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)), out = new Set();
    for (let i = 0; i <= steps; i++) {
        const t = steps ? i / steps : 0;
        for (const c of brushCells(round(ax + (bx - ax) * t), round(ay + (by - ay) * t), size)) out.add(c);
    }
    return [...out];
}

/** Find a bounded four-connected region of equal floors; return null above max, [] outside bounds. */
export function floodFill(paint, start, bounds, max = 5000) {
    const inside = (x, y) => x >= 0 && y >= 0 && x < bounds.cols && y < bounds.rows;
    const [sx, sy] = point(start);
    if (!inside(sx, sy)) return [];
    const first = cellKey(sx, sy), kind = paint[first] || '', out = [first], seen = new Set(out);
    if (out.length > max) return null;
    for (let i = 0; i < out.length; i++) {
        const [x, y] = point(out[i]);
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
            const k = cellKey(nx, ny);
            if (!inside(nx, ny) || seen.has(k) || (paint[k] || '') !== kind) continue;
            seen.add(k); out.push(k);
            if (out.length > max) return null;
        }
    }
    return out;
}

/** Normalize an integer axis-aligned segment into unit edge strings; other segments return []. */
export function unitEdges(seg) {
    const { x1, y1, x2, y2 } = seg;
    if (![x1, y1, x2, y2].every(Number.isSafeInteger) || (x1 !== x2 && y1 !== y2)) return [];
    const out = [];
    if (y1 === y2) for (let x = Math.min(x1, x2); x < Math.max(x1, x2); x++) out.push(`${x},${y1},${x + 1},${y1}`);
    else for (let y = Math.min(y1, y2); y < Math.max(y1, y2); y++) out.push(`${x1},${y},${x1},${y + 1}`);
    return out;
}

// Group unit edges by their line, then join consecutive intervals.
function merge(edges) {
    const lines = new Map(), out = [];
    for (const e of new Set(edges)) {
        const s = edgeSeg(e), h = s.y1 === s.y2, key = `${h ? 'h' : 'v'}:${h ? s.y1 : s.x1}`;
        if (!lines.has(key)) lines.set(key, []);
        lines.get(key).push(h ? s.x1 : s.y1);
    }
    for (const [key, values] of lines) {
        const [axis, fixed] = key.split(':'), f = Number(fixed), sorted = values.sort((a, b) => a - b);
        for (let i = 0; i < sorted.length; i++) {
            const start = sorted[i];
            while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
            out.push(axis === 'h' ? segment(start, f, sorted[i] + 1, f) : segment(f, start, f, sorted[i] + 1));
        }
    }
    return out;
}

function sides(x, y) {
    return [segment(x, y, x + 1, y), segment(x, y + 1, x + 1, y + 1), segment(x, y, x, y + 1), segment(x + 1, y, x + 1, y + 1)];
}

/** Return the fewest collinear boundary segments of a cell set, including holes. */
export function outline(cells) {
    const edges = new Set();
    for (const c of cellSet(cells)) for (const s of sides(...point(c))) {
        const e = unitEdges(s)[0];
        if (edges.has(e)) edges.delete(e); else edges.add(e);
    }
    return merge(edges);
}

/** Snap grid points and draw along the dominant axis at the starting point (horizontal on ties). */
export function gridWall(a, b) {
    const [ax, ay] = point(a).map(round), [bx, by] = point(b).map(round);
    if (ax === bx && ay === by) return [];
    return Math.abs(bx - ax) >= Math.abs(by - ay)
        ? [segment(Math.min(ax, bx), ay, Math.max(ax, bx), ay)]
        : [segment(ax, Math.min(ay, by), ax, Math.max(ay, by))];
}

/** Return the perimeter between snapped grid points; a collapsed rectangle becomes a line. */
export function rectWalls(a, b) {
    const [ax, ay] = point(a).map(round), [bx, by] = point(b).map(round);
    const x = Math.min(ax, bx), y = Math.min(ay, by), xx = Math.max(ax, bx), yy = Math.max(ay, by);
    return merge([segment(x, y, xx, y), segment(x, yy, xx, yy), segment(x, y, x, yy), segment(xx, y, xx, yy)].flatMap(unitEdges));
}

/** Add uncovered unit edges and merge equal-material walls. added counts new unit edges. */
export function addWalls(walls, segs, mat, newKey) {
    const out = clone(walls), covered = new Set(Object.values(walls).flatMap(unitEdges)), addedEdges = new Set();
    for (const e of segs.flatMap(unitEdges)) if (!covered.has(e)) { covered.add(e); addedEdges.add(e); }
    if (!addedEdges.size) return { walls: out, added: 0 };
    const edges = [...addedEdges], keys = [];
    for (const [key, s] of Object.entries(out)) if (s.mat === mat && unitEdges(s).length) {
        edges.push(...unitEdges(s)); keys.push(key); delete out[key];
    }
    for (const s of merge(edges)) out[keys.shift() ?? newKey()] = { ...s, mat };
    return { walls: out, added: addedEdges.size };
}

/** Remove unit edges, preserving materials and arbitrary segments; removed counts unique edges. */
export function eraseWalls(walls, segs) {
    const cut = new Set(segs.flatMap(unitEdges)), out = {}, removed = new Set();
    for (const [key, s] of Object.entries(walls)) {
        const edges = unitEdges(s), remain = edges.filter((e) => !cut.has(e));
        if (remain.length === edges.length) { out[key] = { ...s }; continue; }
        for (const e of edges) if (cut.has(e)) removed.add(e);
        const pieces = merge(remain);
        pieces.forEach((piece, i) => {
            let id = key;
            if (i) { id = `${key}~${i}`; while (Object.hasOwn(walls, id) || Object.hasOwn(out, id)) id += '~'; }
            out[id] = { ...s, ...piece };
        });
    }
    return { walls: out, removed: removed.size };
}

function distance(p, s) {
    const [x, y] = point(p), dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - s.x1 - t * dx, y - s.y1 - t * dy);
}

/** Cut a width-cell doorway centered on the nearest wall unit within 0.5; clamp it to that wall. */
export function cutDoor(walls, doors, point, mat, newKey, width = 1) {
    let best = null, dist = 0.5;
    for (const s of Object.values(walls)) for (const e of unitEdges(s)) {
        const d = distance(point, edgeSeg(e));
        if (d <= dist && (!best || d < dist)) { best = { s, e }; dist = d; }
    }
    if (!best) return null;
    const edges = unitEdges(best.s), index = edges.indexOf(best.e), count = Math.min(edges.length, Math.max(1, Math.round(width) || 1));
    const start = Math.max(0, Math.min(edges.length - count, index - Math.floor((count - 1) / 2)));
    const door = { ...merge(edges.slice(start, start + count))[0], mat };
    const occupied = new Set(Object.values(doors).flatMap(unitEdges));
    if (unitEdges(door).some((e) => occupied.has(e))) return null;
    const nextDoors = clone(doors);
    nextDoors[newKey()] = { ...door };
    return { walls: eraseWalls(walls, [door]).walls, doors: nextDoors, door };
}

/** Replace the nearest grid door within 0.5 with wall material, merging matching neighbors. */
export function wallUp(walls, doors, point, mat, newKey) {
    let best = null, dist = 0.5;
    for (const [key, s] of Object.entries(doors)) {
        const d = distance(point, s);
        if (unitEdges(s).length && d <= dist && (!best || d < dist)) { best = key; dist = d; }
    }
    if (best === null) return null;
    const nextDoors = clone(doors), s = nextDoors[best];
    delete nextDoors[best];
    return { walls: addWalls(walls, [s], mat, newKey).walls, doors: nextDoors };
}

function adjacent(s) {
    return s.y1 === s.y2 ? [[s.x1, s.y1 - 1], [s.x1, s.y1]] : [[s.x1 - 1, s.y1], [s.x1, s.y1]];
}

/** Paint a bounded room, merge adjacent room interiors, and optionally add one outward door. */
export function buildRoom(cells, { floor, wall, door = true, paint, walls, doors, bounds, newKey }) {
    const selected = new Set([...cellSet(cells)].filter((c) => {
        const [x, y] = point(c);
        return x >= 0 && y >= 0 && x < bounds.cols && y < bounds.rows;
    }));
    const nextPaint = { ...paint }, boundary = outline(selected).flatMap(unitEdges), all = new Set(), remove = [], exterior = [], candidates = [];
    for (const c of selected) {
        nextPaint[c] = floor;
        for (const s of sides(...point(c))) all.add(unitEdges(s)[0]);
    }
    const border = new Set(boundary);
    for (const e of all) {
        const s = edgeSeg(e);
        if (!border.has(e)) { remove.push(s); continue; }
        const outside = adjacent(s).find((c) => !selected.has(cellKey(...c))), kind = paint[cellKey(...outside)] || '';
        if (kind && !ground.has(kind)) { remove.push(s); continue; }
        exterior.push(s);
        candidates.push({ e, s, outside, kind });
    }
    let nextWalls = eraseWalls(walls, remove).walls, nextDoors = eraseWalls(doors, remove).walls;
    const doorEdges = new Set(Object.values(nextDoors).flatMap(unitEdges));
    nextWalls = addWalls(nextWalls, exterior.filter((s) => !doorEdges.has(unitEdges(s)[0])), wall, newKey).walls;
    let placed = null;
    if (door) {
        // Group by outward-facing side as well as line, so concave outlines stay distinct.
        const groups = new Map();
        for (const c of candidates) {
            if (doorEdges.has(c.e)) continue;
            const h = c.s.y1 === c.s.y2, side = h ? (c.outside[1] === c.s.y1 ? 'south' : 'north') : (c.outside[0] === c.s.x1 ? 'east' : 'west');
            const key = `${side}:${ground.has(c.kind)}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(c);
        }
        const runs = [];
        for (const [key, group] of groups) for (const s of merge(group.map((c) => c.e))) {
            const edges = unitEdges(s), priority = key.endsWith('true') ? 1 : 0;
            runs.push({ edges, priority, south: key.startsWith('south') ? 1 : 0 });
        }
        runs.sort((a, b) => b.priority - a.priority || b.edges.length - a.edges.length || b.south - a.south);
        if (runs.length) {
            const s = edgeSeg(runs[0].edges[Math.floor(runs[0].edges.length / 2)]);
            const result = cutDoor(nextWalls, nextDoors, [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2], wall, newKey);
            if (result) { nextWalls = result.walls; nextDoors = result.doors; placed = result.door; }
        }
    }
    return { paint: nextPaint, walls: nextWalls, doors: nextDoors, door: placed };
}

/** Remove selected floors and every grid wall/door bordering or inside those cells. */
export function knockDown(cells, { paint, walls, doors }) {
    const nextPaint = { ...paint }, segs = [];
    for (const c of cellSet(cells)) { delete nextPaint[c]; segs.push(...sides(...point(c))); }
    return { paint: nextPaint, walls: eraseWalls(walls, segs).walls, doors: eraseWalls(doors, segs).walls };
}
