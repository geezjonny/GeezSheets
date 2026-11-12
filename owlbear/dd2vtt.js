// dd2vtt (Universal VTT) → Owlbear: read the file, then turn its walls, doors and lights into scene items
// fitted to a map picture. No OBR import here, so Node tests can load it.

export const MAPKEY = 'com.geezsheets/dd2vtt';     // on the map picture: { name } once its walls are placed
export const PART = 'com.geezsheets/dd2vtt-part';  // on every wall, door, handle and light we add: the map picture's id
export const DOOR = 'com.geezsheets/door';         // on a door wall: { closed }; on its handle: { wall, closed }
export const ROOM = 'com.geezsheets/room';         // on a room's fog: { n, outside, area }

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// The picture: base64 in "image". Sniff the type from its first bytes.
function picture(b64) {
    if (typeof b64 !== 'string' || !b64) return null;
    const s = b64.replace(/^data:[^,]*,/, '');
    const head = atob(s.slice(0, 24));
    const mime = head.startsWith('\x89PNG') ? 'image/png' : head.startsWith('\xff\xd8') ? 'image/jpeg'
        : head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP' ? 'image/webp' : 'image/png';
    return { b64: s, mime };
}
export function pictureBlob(pic) {
    const bin = atob(pic.b64), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return new Blob([out], { type: pic.mime });
}

// Everything in map cells, measured from the picture's top-left corner.
export function parse(text) {
    const j = typeof text === 'string' ? JSON.parse(text.replace(/^﻿/, '')) : text;
    const r = j?.resolution;
    if (!r?.map_size) throw Error('This is not a dd2vtt / Universal VTT file (no resolution).');
    const o = r.map_origin || { x: 0, y: 0 }, w = num(r.map_size.x, 0), h = num(r.map_size.y, 0);
    if (!(w > 0 && h > 0)) throw Error('The map has no size.');
    const pt = (p) => ({ x: num(p?.x, 0) - num(o.x, 0), y: num(p?.y, 0) - num(o.y, 0) });
    const doors = (j.portals || []).filter((p) => p?.bounds?.length === 2)
        .map((p) => ({ a: pt(p.bounds[0]), b: pt(p.bounds[1]), closed: p.closed !== false }))
        .filter((d) => Math.hypot(d.a.x - d.b.x, d.a.y - d.b.y) > 0.01);
    const lines = [...(j.line_of_sight || []), ...(j.objects_line_of_sight || [])].filter(Array.isArray).map((l) => l.map(pt));
    const lights = (j.lights || []).map((l) => {
        const c = String(l.color ?? 'ffffffff').replace(/^#/, '');
        return { ...pt(l.position), range: Math.max(0, num(l.range, 5)), intensity: num(l.intensity, 1), color: '#' + c.slice(-6), shadows: l.shadows !== false };
    });
    return { w, h, ppg: num(r.pixels_per_grid, 70), walls: cutDoors(lines, doors), doors, lights, image: picture(j.image) };
}

// Some exporters run a wall straight across a doorway; cut those spans out so the door alone decides.
// Keeps each wall a polyline (fewer items), split only where a door cuts it.
export function cutDoors(lines, doors) {
    const out = [];
    for (const line of lines) {
        let run = [];
        const flush = () => { if (run.length > 1) out.push(run); run = []; };
        for (let i = 1; i < line.length; i++) {
            const a = line[i - 1], b = line[i], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy, len = Math.sqrt(len2);
            if (len < 1e-4) continue;
            let spans = [[0, 1]];
            for (const d of doors) {
                const off = (p) => Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
                if (off(d.a) > 0.035 || off(d.b) > 0.035) continue;   // the door isn't on this wall's line
                const t = (p) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
                const lo = Math.max(0, Math.min(t(d.a), t(d.b))), hi = Math.min(1, Math.max(t(d.a), t(d.b)));
                if (hi <= lo) continue;
                spans = spans.flatMap(([u, v]) => (hi <= u || lo >= v ? [[u, v]] : [[u, Math.max(u, lo)], [Math.min(v, hi), v]].filter(([x, y]) => y - x > 1e-6)));
            }
            if (!spans.length) { flush(); continue; }   // a door covers this whole piece
            const at = (u) => ({ x: a.x + dx * u, y: a.y + dy * u });
            for (const [u, v] of spans) {
                if (u > 1e-6 || !run.length) { flush(); run.push(at(u)); }
                run.push(at(v));
                if (v < 1 - 1e-6) flush();
            }
        }
        flush();
    }
    return out;
}

// Map cell → scene point, from a map picture already in the scene (position, scale, rotation, grid offset).
// Works from the picture's own size, so it still fits if Owlbear resized the upload.
export function fitter(img, sceneDpi, map) {
    const k = sceneDpi / img.grid.dpi, sx = img.scale.x * k, sy = img.scale.y * k;
    const pxX = img.image.width / map.w, pxY = img.image.height / map.h;   // picture pixels per map cell
    const rad = (img.rotation || 0) * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const at = (p) => {
        const x = (p.x * pxX - img.grid.offset.x) * sx, y = (p.y * pxY - img.grid.offset.y) * sy;
        return { x: img.position.x + x * cos - y * sin, y: img.position.y + x * sin + y * cos };
    };
    return { at, cell: Math.abs(pxX * sx) };
}

// The scene items for one map picture. b = the SDK builders { buildWall, buildLight, buildShape, buildPath }.
// roomFog: a fog shape per room (map.rooms, from rooms()), revealed with the Rooms tool.
// walls: walls, doors and lights for dynamic fog. lightType: SECONDARY (map lights, seen only where a
// character can see) or PRIMARY.
const xy = (p) => [p.x, p.y];
export function sceneItems(b, img, sceneDpi, map, { roomFog = false, walls = true, lightType = 'SECONDARY', handles = true } = {}) {
    const { at, cell } = fitter(img, sceneDpi, map);
    const KEEP = ['VISIBLE', 'LOCKED', 'COPY'];   // follow the map when it moves, scales, rotates or is deleted; nothing else
    const tag = (it, extra = {}) => it.attachedTo(img.id).disableAttachmentBehavior(KEEP).metadata({ [PART]: img.id, ...extra });
    const out = [];
    let n = 0;
    if (roomFog) (map.rooms || []).forEach((r) => {
        const i = r.outside ? 0 : ++n;
        const commands = r.loops.flatMap((l) => [[0, ...xy(at(l[0]))], ...l.slice(1).map((p) => [1, ...xy(at(p))]), [5]]);
        out.push(tag(b.buildPath().commands(commands).fillRule('evenodd').fillColor('#222222').fillOpacity(1)
            .strokeColor('#222222').strokeOpacity(1).strokeWidth(cell * 0.15).layer('FOG').locked(true)
            .name(r.outside ? 'Outside' : `Room ${i}`), { [ROOM]: { n: i, outside: r.outside, area: r.area } }).build());
    });
    if (!walls) return out;
    for (const line of map.walls) {
        out.push(tag(b.buildWall().points(line.map(at)).doubleSided(true).blocking(true).name('Wall').locked(true)).build());
    }
    map.doors.forEach((d, i) => {
        const wall = tag(b.buildWall().points([at(d.a), at(d.b)]).doubleSided(true).blocking(d.closed).name(`Door ${i + 1}`).locked(true),
            { [DOOR]: { closed: d.closed } }).build();
        out.push(wall);
        if (!handles) return;
        // GM-only handle in the doorway: right-click it to open or close the door
        const r = cell * 0.3, m = at({ x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 });
        out.push(tag(b.buildShape().shapeType('CIRCLE').width(r * 2).height(r * 2).position(m)
            .fillColor(d.closed ? '#dc2626' : '#16a34a').fillOpacity(0.8).strokeColor('#000000').strokeWidth(2)
            .layer('PROP').visible(false).name(`Door ${i + 1}`), { [DOOR]: { wall: wall.id, closed: d.closed } }).build());
    });
    for (const l of map.lights) {
        out.push(tag(b.buildLight().position(at(l)).attenuationRadius(Math.max(cell * 0.5, l.range * cell))
            .sourceRadius(cell * 0.2).falloff(1).innerAngle(360).outerAngle(360).lightType(lightType).name('Light').locked(true)).build());
    }
    return out;
}

// ---- Rooms: the areas walls and doors close off, for room-by-room fog ----
// Raster method, because exported walls rarely meet exactly:
// 1. draw walls and doors (every door counts as shut) onto a fine grid;
// 2. each open area wide enough to stand in (half a square from any wall) is a room; thin slivers between
//    double walls are not;
// 3. walls and slivers go to the nearest room, so the rooms tile the whole map with no gaps;
// 4. trace each room's outline (holes too, where another room sits inside it) and straighten it.
// Returns [{ loops: [[{x,y}…]…], area, outside }] in map squares; loops go clockwise, holes anticlockwise.
export function rooms(map, maxPixels = 1.5e6) {
    const R = Math.max(2, Math.min(8, Math.floor(Math.sqrt(maxPixels / (map.w * map.h))))), W = Math.ceil(map.w * R), H = Math.ceil(map.h * R), N = W * H;
    const wall = new Uint8Array(N);
    const mark = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) wall[y * W + x] = 1; };
    const segs = [...map.walls.flatMap((l) => l.slice(1).map((b, i) => [l[i], b])), ...map.doors.map((d) => [d.a, d.b])];
    for (const [a, b] of segs) {
        const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * R * 3) + 1;
        for (let i = 0; i <= n; i++) {
            const x = Math.floor((a.x + (b.x - a.x) * i / n) * R), y = Math.floor((a.y + (b.y - a.y) * i / n) * R);
            mark(x, y); mark(x + 1, y); mark(x - 1, y); mark(x, y + 1); mark(x, y - 1);   // ~3 px thick closes hairline gaps
        }
    }
    const nb = (i, f) => { const x = i % W; if (x > 0) f(i - 1); if (x < W - 1) f(i + 1); if (i >= W) f(i - W); if (i < N - W) f(i + W); };
    // distance from the nearest wall
    const dist = new Int32Array(N).fill(-1), q = new Int32Array(N);
    let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) if (wall[i]) { dist[i] = 0; q[qt++] = i; }
    while (qh < qt) { const i = q[qh++]; nb(i, (j) => { if (dist[j] < 0) { dist[j] = dist[i] + 1; q[qt++] = j; } }); }
    if (!qt) dist.fill(R);   // no walls: one room
    // open areas → rooms
    const label = new Int32Array(N).fill(-1), info = [];
    for (let s = 0; s < N; s++) {
        if (wall[s] || label[s] >= 0) continue;
        const id = info.length, cells = [s];
        let deep = 0;
        label[s] = id;
        for (let k = 0; k < cells.length; k++) {
            const i = cells[k]; deep = Math.max(deep, dist[i]);
            nb(i, (j) => { if (!wall[j] && label[j] < 0) { label[j] = id; cells.push(j); } });
        }
        info.push({ cells, room: deep >= R * 0.4 && cells.length >= R * R * 0.5 });
    }
    const keep = new Int32Array(info.length).fill(-1);
    let rc = 0;
    info.forEach((c, i) => { if (c.room) keep[i] = rc++; });
    if (!rc) return [];
    // walls and slivers join the nearest room
    const own = new Int32Array(N).fill(-1);
    qh = qt = 0;
    for (let i = 0; i < N; i++) if (label[i] >= 0 && keep[label[i]] >= 0) { own[i] = keep[label[i]]; q[qt++] = i; }
    while (qh < qt) { const i = q[qh++]; nb(i, (j) => { if (own[j] < 0) { own[j] = own[i]; q[qt++] = j; } }); }
    // outlines: the pixel edges between different rooms, walked with the room on the right
    const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1], V = W + 1;
    const edges = Array.from({ length: rc }, () => new Map());
    const add = (r, x, y, d) => { const m = edges[r], k = y * V + x; (m.get(k) || m.set(k, []).get(k)).push(d); };
    const area = new Float64Array(rc), border = new Uint8Array(rc);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const r = own[y * W + x];
        area[r]++;
        if (y === 0 || own[(y - 1) * W + x] !== r) add(r, x, y, 0);
        if (x === W - 1 || own[y * W + x + 1] !== r) add(r, x + 1, y, 1);
        if (y === H - 1 || own[(y + 1) * W + x] !== r) add(r, x + 1, y + 1, 2);
        if (x === 0 || own[y * W + x - 1] !== r) add(r, x, y + 1, 3);
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) border[r] = 1;
    }
    const out = [];
    for (let r = 0; r < rc; r++) {
        const m = edges[r], loops = [];
        for (const [start, list] of m) {
            while (list.length) {
                let k = start, d = list.pop(), pts = [];
                for (;;) {
                    const x = k % V, y = (k - x) / V;
                    pts.push({ x, y, d });
                    k = (y + DY[d]) * V + x + DX[d];
                    const next = m.get(k);
                    if (!next?.length) break;
                    const pick = [(d + 1) % 4, d, (d + 3) % 4].find((t) => next.includes(t));   // turn right first
                    if (pick === undefined) break;
                    next.splice(next.indexOf(pick), 1);
                    d = pick;
                }
                const corners = pts.filter((p, i) => p.d !== pts[(i + pts.length - 1) % pts.length].d);
                const loop = simplify(corners, 0.75).map((p) => ({ x: p.x / R, y: p.y / R }));
                if (loop.length >= 3) loops.push(loop);
            }
        }
        if (loops.length) out.push({ loops, area: area[r] / (R * R), outside: !!border[r] });
    }
    // the biggest area touching the map's edge is "outside"
    const edgeRooms = out.filter((o) => o.outside).sort((a, b) => b.area - a.area);
    for (const o of out) o.outside = o === edgeRooms[0] && out.length > 1;
    return out;
}

// Douglas-Peucker on a closed loop
function simplify(pts, tol) {
    if (pts.length < 4) return pts;
    let far = 0, best = -1;
    for (let i = 1; i < pts.length; i++) { const d = (pts[i].x - pts[0].x) ** 2 + (pts[i].y - pts[0].y) ** 2; if (d > best) { best = d; far = i; } }
    const dp = (a) => {
        if (a.length < 3) return a;
        const p = a[0], q = a[a.length - 1], dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
        let idx = 0, max = -1;
        for (let i = 1; i < a.length - 1; i++) { const d = Math.abs((a[i].x - p.x) * dy - (a[i].y - p.y) * dx) / len; if (d > max) { max = d; idx = i; } }
        if (max <= tol) return [p, q];
        const l = dp(a.slice(0, idx + 1)), r = dp(a.slice(idx));
        return [...l.slice(0, -1), ...r];
    };
    const one = dp(pts.slice(0, far + 1)), two = dp([...pts.slice(far), pts[0]]);
    return [...one.slice(0, -1), ...two.slice(0, -1)];
}

// Is a scene point inside a room fog item? (even-odd over its loops; follows the item if the map moved)
export function inRoom(item, p) {
    const rad = (item.rotation || 0) * Math.PI / 180, c = Math.cos(-rad), s = Math.sin(-rad);
    const dx = p.x - item.position.x, dy = p.y - item.position.y;
    const x = (dx * c - dy * s) / (item.scale.x || 1), y = (dx * s + dy * c) / (item.scale.y || 1);
    let inside = false, prev = null, first = null;
    const edge = (a, b) => { if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; };
    for (const cmd of item.commands) {
        if (cmd[0] === 0) { if (prev && first) edge(prev, first); first = prev = [cmd[1], cmd[2]]; }
        else if (cmd[0] === 1) { const pt = [cmd[1], cmd[2]]; edge(prev, pt); prev = pt; }
        else if (cmd[0] === 5 && prev && first) { edge(prev, first); prev = first; }
    }
    return inside;
}

// Which picture to fit to: the selected image, else the biggest picture on the map layer.
export function pickMap(images, selection = []) {
    const sel = images.find((i) => selection.includes(i.id));
    if (sel) return sel;
    const maps = images.filter((i) => i.layer === 'MAP');
    return maps.sort((a, b) => b.image.width * b.scale.x * b.image.height * b.scale.y / b.grid.dpi ** 2
        - a.image.width * a.scale.x * a.image.height * a.scale.y / a.grid.dpi ** 2)[0] || null;
}

// "New scene": the picture is uploaded first and Owlbear makes the item, so the walls wait (by map name)
// in this browser until the GM opens that scene; the background page then places them.
export const PENDING = 'geez.obr.dd2vtt.pending';
export function savePending(name, map, opts) {
    const all = loadPending();
    all[name] = { w: map.w, h: map.h, walls: map.walls, doors: map.doors, lights: map.lights, rooms: map.rooms, opts, at: Date.now() };
    localStorage.setItem(PENDING, JSON.stringify(all));
}
export function loadPending() {
    try {
        const all = JSON.parse(localStorage.getItem(PENDING)) || {};
        for (const [k, v] of Object.entries(all)) if (Date.now() - v.at > 7 * 864e5) delete all[k];   // a week is plenty
        return all;
    } catch { return {}; }
}
export function dropPending(name) {
    const all = loadPending();
    delete all[name];
    try { localStorage.setItem(PENDING, JSON.stringify(all)); } catch {}
}
