// GeezMapper export: the VTT's scene state -> one `.geezmap.json` that is ALSO a Universal VTT (.dd2vtt).
// Pure (no DOM, no Firebase) so it runs in Node tests. The geezmap half is what geezmap.js `parseGeezMap` reads;
// the dd2vtt half (resolution / line_of_sight / portals / lights / image) is what any dd2vtt reader or
// dd2vtt.js `parseDD2VTT` reads. See GeezForge/docs/geezsheets_bridge.md for the geezmap format.
const CELL = 40;
const FLOORS = new Set("stone slab cobble marble tile wood carpet dirt cave sand grass snow water mud shallow ice lava swamp bone void gravel moss iron".split(" "));
const WALLS = new Set("stone ashlar marble brick fieldstone plaster timber wood palisade cave hedge earth cobble iron".split(" "));
const ROOFS = new Set("thatch slate tile flat wood stone".split(" "));
const DOOR_KINDS = new Set("wood iron double portcullis bars secret arch curtain window".split(" "));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const g = (px) => Math.round((num(px) / CELL) * 1000) / 1000;           // pixels -> grid units
const hex6 = (c) => { const s = String(c || "").replace(/^#/, ""); return /^[\da-f]{6,8}$/i.test(s) ? s.slice(0, 6).toLowerCase() : "ffffff"; };
const lvOf = (o) => num(o?.lv, 0);
const entries = (o) => (o && typeof o === "object" ? Object.entries(o) : []);
const timeName = (t) => (t == null ? "day" : typeof t === "string" && Number.isNaN(Number(t)) ? t : ((h) => (h >= 5 && h < 8 ? "dawn" : h >= 8 && h < 17 ? "day" : h >= 17 && h < 21 ? "dusk" : "night"))(num(t, 12)));
const weatherKind = (w) => ({ rain: "Rain", snow: "Snow", leaves: "Leaves", ash: "Ash" })[String(w || "").toLowerCase()] || "Clear";

function cellsOf(rects, lv, valid, fallback, extra) {
  const out = {};
  for (const [, r] of entries(rects)) {
    if (lvOf(r) !== lv) continue;
    const x0 = Math.floor(num(r.x) / CELL), y0 = Math.floor(num(r.y) / CELL), x1 = Math.ceil((num(r.x) + num(r.w)) / CELL), y1 = Math.ceil((num(r.y) + num(r.h)) / CELL);
    if ((x1 - x0) * (y1 - y0) > 20000) continue;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = `${x}_${y}`; out[k] = valid ? (valid.has(r.mat) ? r.mat : fallback) : true; extra?.(k, r); }
  }
  return out;
}

export function floorRecord(state, lv, opts = {}) {
  const { map = {}, objects = {} } = state;
  const rec = {};
  const elevation = {};
  const paint = cellsOf(map.floors, lv, FLOORS, "stone", (k, r) => { if (num(r.elev)) elevation[k] = num(r.elev); });
  if (Object.keys(paint).length) rec.paint = paint;
  if (Object.keys(elevation).length) rec.elevation = elevation;
  const walls = {};
  entries(map.walls).forEach(([id, w], i) => { if (lvOf(w) !== lv) return; const o = { x1: g(w.x1), y1: g(w.y1), x2: g(w.x2), y2: g(w.y2) }; if (WALLS.has(w.mat)) o.mat = w.mat; walls["w" + i] = o; });
  if (Object.keys(walls).length) rec.walls = walls;
  const doors = {}, lights = {};
  entries(objects).forEach(([id, o], i) => {
    if (lvOf(o) !== lv) return;
    if (o.kind === "door") {
      const kind = DOOR_KINDS.has(o.doorKind) ? o.doorKind : o.win ? "window" : "wood", half = kind === "double" ? 1 : 0.5, h = o.dir !== "v";
      const cx = num(o.x) / CELL, cy = num(o.y) / CELL, r = Math.round;
      doors["d" + i] = h ? { x1: r(cx - half), y1: r(cy), x2: r(cx + half), y2: r(cy), mat: WALLS.has(o.mat) ? o.mat : "wood", kind } : { x1: r(cx), y1: r(cy - half), x2: r(cx), y2: r(cy + half), mat: WALLS.has(o.mat) ? o.mat : "wood", kind };
    } else if (o.kind === "light") lights["l" + i] = { x: g(o.x), y: g(o.y), range: Math.max(1, g(o.radius)), color: "#" + hex6(o.color), ...(o.intensity != null ? { intensity: o.intensity } : {}) };
  });
  if (Object.keys(doors).length) rec.doors = doors;
  if (Object.keys(lights).length) rec.lights = lights;
  const props = {}, decals = {}, stairs = {};
  entries(map.props).forEach(([id, p], i) => {
    if (lvOf(p) !== lv) return;
    const kind = String(p.kind || "");
    if (kind.startsWith("decal_")) decals["c" + i] = { kind: kind.slice(6), x: g(p.x), y: g(p.y), rot: num(p.rot), s: num(p.s, 1) };
    else if ((kind === "stairs" || kind === "ladder") && p.to != null) stairs["s" + i] = { x: g(p.x), y: g(p.y), w: g(p.w) || 1, h: g(p.h) || 1, rot: num(p.rot), to: num(p.to), kind };
    else props["p" + i] = { p: kind, x: g(p.x), y: g(p.y), rot: num(p.rot), s: num(p.s, 1), ...(p.flip ? { flip: true } : {}) };
  });
  if (Object.keys(props).length) rec.props = props;
  if (Object.keys(decals).length) rec.decals = decals;
  if (Object.keys(stairs).length) rec.stairs = stairs;
  const roofs = cellsOf(map.roofs, lv, ROOFS, "slate");
  if (Object.keys(roofs).length) rec.roofs = roofs;
  const labels = {};
  entries(map.labels).forEach(([id, l], i) => { if (lvOf(l) === lv && l.text) labels["t" + i] = { x: g(l.x), y: g(l.y), text: String(l.text), size: num(l.size, 1), rot: num(l.rot) }; });
  if (Object.keys(labels).length) rec.labels = labels;
  if (map.light !== "dark") {   // a "dark" map's fog is generated on import, so don't export it back as authored cover
    const fog = cellsOf(Object.fromEntries(entries(map.fog).filter(([, f]) => f && f.open !== true)), lv);
    if (Object.keys(fog).length) rec.fog = fog;
  }
  return rec;
}

export function exportGeezMap(state, opts = {}) {
  const map = state.map || {}, objects = state.objects || {};
  const keys = new Set([0]);
  for (const layer of [map.floors, map.walls, map.roofs, map.props, map.labels, objects]) for (const [, o] of entries(layer)) keys.add(lvOf(o));
  const floorIds = [...keys].sort((a, b) => a - b);
  const cols = Math.max(1, num(map.size?.cols, 20)), rows = Math.max(1, num(map.size?.rows, 14));
  const atmo = state.atmosphere || {};
  const light = map.light === "dark" ? "dark" : "lit";
  const floorNames = {};
  for (const id of floorIds) floorNames[String(id)] = map.levelNames?.[id] || (id === 0 ? "Ground" : `Floor ${id}`);
  const name = state.name || "Mapper map";
  const floors = Object.fromEntries(floorIds.map((id) => [String(id), floorRecord(state, id, opts)]));
  const base = floors[String(floorIds.includes(0) ? 0 : floorIds[0])];
  // --- dd2vtt half, from the ground floor ---
  const pt = (x, y) => ({ x, y });
  const line_of_sight = entries(base.walls).map(([, w]) => [pt(w.x1, w.y1), pt(w.x2, w.y2)]);
  const portals = entries(base.doors).map(([, d]) => ({
    position: pt((d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2), bounds: [pt(d.x1, d.y1), pt(d.x2, d.y2)],
    rotation: d.y1 === d.y2 ? 0 : Math.PI / 2, closed: d.kind !== "arch", freestanding: false,
  }));
  const lights = entries(base.lights).map(([, l]) => ({ position: pt(l.x, l.y), range: l.range, ...(l.intensity != null ? { intensity: l.intensity } : { intensity: 1 }), color: hex6(l.color) + "ff", shadows: true }));
  return {
    format: "geezmap", version: 1, name, generator: "GeezMapper",
    meta: { name, size: { x: cols, y: rows }, origin: { x: 0, y: 0 }, floors: floorIds, floorNames, light, time: timeName(atmo.time), weather: { kind: weatherKind(atmo.weather), wind: 0 } },
    floors,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: cols, y: rows }, pixels_per_grid: 70 },
    line_of_sight, objects_line_of_sight: [], portals, lights,
    environment: { baked_lighting: false, ambient_light: "ffffffff" },
    image: opts.imageBase64 || "",
  };
}

// The scene shape GeezSheets stores under scenes/<id>/data (and map/objects/groups/tokens live).
export const sceneData = (tree) => ({ map: tree.map || {}, objects: tree.objects || {}, tokens: {}, groups: tree.groups || {}, ...(tree.atmosphere ? { atmosphere: tree.atmosphere } : {}) });
export const sceneId = (name) => String(name || "").trim().toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "scene";
