// dd2vtt (Universal VTT) → Owlbear: read the file, then turn its walls, doors and lights into scene items
// fitted to a map picture. No OBR import here, so Node tests can load it.

export const MAPKEY = 'com.geezsheets/dd2vtt';     // on the map picture: { name } once its walls are placed
export const PART = 'com.geezsheets/dd2vtt-part';  // on every wall, door, handle and light we add: the map picture's id
export const DOOR = 'com.geezsheets/door';         // on a door wall: { closed }; on its handle: { wall, closed }

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

// The scene items for one map picture. b = the SDK builders { buildWall, buildLight, buildShape }.
// lightType: SECONDARY (map lights, seen only where a character can see) or PRIMARY.
export function sceneItems(b, img, sceneDpi, map, { lightType = 'SECONDARY', handles = true } = {}) {
    const { at, cell } = fitter(img, sceneDpi, map);
    const KEEP = ['VISIBLE', 'LOCKED', 'COPY'];   // follow the map when it moves, scales, rotates or is deleted; nothing else
    const tag = (it, extra = {}) => it.attachedTo(img.id).disableAttachmentBehavior(KEEP).metadata({ [PART]: img.id, ...extra });
    const out = [];
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
    all[name] = { w: map.w, h: map.h, walls: map.walls, doors: map.doors, lights: map.lights, opts, at: Date.now() };
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
