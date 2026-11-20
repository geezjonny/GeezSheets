// Universal VTT (.dd2vtt) import/export. The parser is deliberately independent
// of the browser, Firebase, and the rest of the VTT so it can be tested in Node.

const CELL = 40;
const MAX_WALLS = 3000;
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const point = (p, origin) => finite(p?.x) && finite(p?.y) ? {
  x: Math.round((p.x - origin.x) * CELL), y: Math.round((p.y - origin.y) * CELL),
} : null;

function colorOf(value) {
  const s = typeof value === "string" ? value.replace(/^#/, "") : "";
  return /^[\da-f]{6,8}$/i.test(s) ? `#${s.slice(0, 6).toLowerCase()}` : "#ffffff";
}

function addSegment(out, a, b) {
  if (!a || !b || (a.x === b.x && a.y === b.y)) return;
  out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
}

function collinearTouch(a, b) {
  const cross = (b.x1 - a.x1) * (b.y2 - a.y1) - (b.y1 - a.y1) * (b.x2 - a.x1);
  const cross2 = (b.x1 - a.x1) * (a.y2 - a.y1) - (b.y1 - a.y1) * (a.x2 - a.x1);
  if (cross !== 0 || cross2 !== 0) return false;
  const dx = a.x2 - a.x1, dy = a.y2 - a.y1;
  const axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
  const a0 = Math.min(a[axis + "1"], a[axis + "2"]), a1 = Math.max(a[axis + "1"], a[axis + "2"]);
  const b0 = Math.min(b[axis + "1"], b[axis + "2"]), b1 = Math.max(b[axis + "1"], b[axis + "2"]);
  return b0 <= a1 && a0 <= b1;
}

function mergeWalls(walls) {
  const out = walls.slice();
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      if (!collinearTouch(a, b)) continue;
      const dx = a.x2 - a.x1, dy = a.y2 - a.y1;
      const useX = Math.abs(dx) >= Math.abs(dy);
      const key = useX ? "x" : "y";
      const pts = [[a.x1, a.y1], [a.x2, a.y2], [b.x1, b.y1], [b.x2, b.y2]];
      pts.sort((p, q) => p[useX ? 0 : 1] - q[useX ? 0 : 1]);
      out[i] = { x1: pts[0][0], y1: pts[0][1], x2: pts[3][0], y2: pts[3][1] };
      out.splice(j, 1); changed = true; break outer;
    }
  }
  return out;
}

function portalDoor(portal, origin, cols, rows) {
  const pos = point(portal?.position, origin);
  const bounds = Array.isArray(portal?.bounds) ? portal.bounds.map((p) => point(p, origin)) : [];
  if (!pos || bounds.length !== 2 || !bounds[0] || !bounds[1]) return null;
  const dx = bounds[1].x - bounds[0].x, dy = bounds[1].y - bounds[0].y;
  if (dx === 0 && dy === 0) return null;
  let dir = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
  if (Math.abs(dx) === Math.abs(dy) && finite(portal.rotation)) {
    const r = Math.abs(portal.rotation) % Math.PI;
    dir = r > Math.PI / 4 && r < Math.PI * 3 / 4 ? "v" : "h";
  }
  const edge = (v) => Math.round(v / CELL) * CELL;
  const centre = (v) => Math.round((v - CELL / 2) / CELL) * CELL + CELL / 2;
  const x = dir === "h" ? centre(pos.x) : edge(pos.x);
  const y = dir === "h" ? edge(pos.y) : centre(pos.y);
  const snapError = Math.hypot(x - pos.x, y - pos.y);
  if (snapError > CELL * 0.51 || x < 0 || y < 0 || x > cols * CELL || y > rows * CELL) return null;
  return { x, y, dir, state: portal.closed === false ? "open" : "closed" };
}

export function parseDD2VTT(json) {
  if (!json || typeof json !== "object") throw new Error("Invalid DD2VTT JSON.");
  const resolution = json.resolution;
  if (!resolution?.map_size || !finite(resolution.map_size.x) || !finite(resolution.map_size.y)) {
    throw new Error("DD2VTT file is missing resolution.map_size.");
  }
  const origin = { x: finite(resolution.map_origin?.x) ? resolution.map_origin.x : 0, y: finite(resolution.map_origin?.y) ? resolution.map_origin.y : 0 };
  const cols = Math.max(1, Math.round(resolution.map_size.x));
  const rows = Math.max(1, Math.round(resolution.map_size.y));
  const rawWalls = [];
  for (const field of ["line_of_sight", "objects_line_of_sight"]) {
    for (const line of Array.isArray(json[field]) ? json[field] : []) {
      if (!Array.isArray(line)) continue;
      for (let i = 1; i < line.length; i++) addSegment(rawWalls, point(line[i - 1], origin), point(line[i], origin));
    }
  }
  const walls = mergeWalls(rawWalls).slice(0, MAX_WALLS);
  const doors = (Array.isArray(json.portals) ? json.portals : []).map((p) => portalDoor(p, origin, cols, rows)).filter(Boolean);
  const lights = [];
  for (const light of Array.isArray(json.lights) ? json.lights : []) {
    const p = point(light?.position, origin), range = Number(light?.range);
    if (!p || !Number.isFinite(range) || range < 1) continue;
    lights.push({ x: p.x, y: p.y, radius: range * CELL, color: colorOf(light.color) });
  }
  let imageDataUrl = null;
  if (typeof json.image === "string" && json.image) {
    imageDataUrl = json.image.startsWith("data:") ? json.image : `data:${json.geezvtt?.imageMime || "image/png"};base64,${json.image}`;
  }
  const tag = (o) => Object.defineProperty(o, "lv", { value: 0, enumerable: false, writable: true });
  return { cols, rows, walls: walls.map(w => tag({ ...w })), doors: doors.map(d => tag({ ...d })), lights: lights.map(l => tag({ ...l })), floors: [], roofs: [], props: [], labels: [], imageDataUrl, ppg: finite(resolution.pixels_per_grid) ? resolution.pixels_per_grid : 70 };
}

const id = (prefix, n) => `${prefix}${Date.now().toString(36)}${n.toString(36)}`;
export const toast = (message) => {
  const el = document.querySelector("#toast"); if (!el) return;
  el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3000);
};

export async function importDD2VTT(file, mode = "merge") { return applyDD2VTT(parseDD2VTT(JSON.parse(await file.text())), mode); }

// GeezSheets stores maps in Firebase /maps/<name>/geometry as { walls, doors, lights } in grid units (no picture).
// Convert that to the same shape a .dd2vtt file has, so it goes through the same parser.
export function geezGeometryToDD2VTT(g) {
  const pts = [...(g.walls || []), ...(g.doors || [])].flatMap((w) => [[w.x1, w.y1], [w.x2, w.y2]]).concat((g.lights || []).map((l) => [l.x, l.y])).filter(([x, y]) => finite(x) && finite(y));
  if (!pts.length) throw new Error("That map has no geometry.");
  const x0 = Math.floor(Math.min(...pts.map((p) => p[0]))) - 1, y0 = Math.floor(Math.min(...pts.map((p) => p[1]))) - 1;
  const x1 = Math.ceil(Math.max(...pts.map((p) => p[0]))) + 1, y1 = Math.ceil(Math.max(...pts.map((p) => p[1]))) + 1;
  const hex = (c) => { const t = String(c || "").replace(/^#/, ""); return t.length === 8 ? t.slice(2) : t; };   // Geez colours are AARRGGBB
  return {
    resolution: { map_origin: { x: x0, y: y0 }, map_size: { x: x1 - x0, y: y1 - y0 }, pixels_per_grid: 70 },
    line_of_sight: (g.walls || []).map((w) => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]),
    portals: (g.doors || []).map((d) => ({ position: { x: (d.x1 + d.x2) / 2, y: (d.y1 + d.y2) / 2 }, bounds: [{ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }], rotation: 0, closed: d.closed !== false })),
    lights: (g.lights || []).map((l) => ({ position: { x: l.x, y: l.y }, range: Math.max(2, Number(l.range) || 2), color: hex(l.color) })),
  };
}
export async function importGeezMap(name, mode = "merge") {
  const { readAt } = await import("../store.js");
  const m = await readAt(`maps/${name}`);   // read-only: nothing is written to the live GeezSheets data
  if (!m?.geometry) throw new Error(`No geometry at maps/${name}`);
  return applyDD2VTT(parseDD2VTT(geezGeometryToDD2VTT(m.geometry)), mode);
}
export async function listGeezMaps() { const { readAt } = await import("../store.js"); return Object.keys((await readAt("maps")) || {}); }

// mode: "merge" adds the walls, doors and lights to the current scene; "new" starts a fresh scene
// (the current one is saved first as "Before import ...", so nothing is lost). Only walls, doors and lights are imported.
export async function applyDD2VTT(data, mode = "merge") {
  const [{ S, mapSize }, { newObject }, store] = await Promise.all([
    import("./state.js"), import("../puzzle/objects.js"), import("../store.js"),
  ]);
  const cur = mapSize(), changes = {};
  if (mode === "new") {
    const [map, objects, tokens, groups] = await Promise.all(["map", "objects", "tokens", "groups"].map((p) => store.read(p)));
    if (Object.keys(map?.walls || {}).length || Object.keys(map?.floors || {}).length || Object.keys(objects || {}).length) {
      const stamp = new Date().toLocaleString(), key = `before-import-${Date.now().toString(36)}`;
      await store.put(`scenes/${key}`, { name: `Before import ${stamp}`, ts: Date.now(), data: { map: map || {}, objects: objects || {}, tokens: tokens || {}, groups: groups || {} } });
    }
    await Promise.all([store.put("map", null), store.put("objects", null), store.put("tokens", null), store.put("groups", null)]);
    changes["map/size"] = { cols: Math.max(10, Math.min(100, data.cols)), rows: Math.max(10, Math.min(100, data.rows)) };
  } else changes["map/size"] = { cols: Math.max(cur.cols, Math.min(100, data.cols)), rows: Math.max(cur.rows, Math.min(100, data.rows)) };
  let n = 0;
  for (const f of data.floors || []) changes[`map/floors/${id("f", n++)}`] = { lv: 0, ...f };
  for (const w of data.walls) changes[`map/walls/${id("w", n++)}`] = { lv: 0, ...w };
  for (const r of data.roofs || []) changes[`map/roofs/${id("r", n++)}`] = { lv: 0, ...r };
  for (const p of data.props || []) changes[`map/props/${id("p", n++)}`] = { lv: 0, ...p };
  for (const l of data.labels || []) changes[`map/labels/${id("l", n++)}`] = { lv: 0, ...l };
  for (const d of data.doors) if (!data.objects?.[d.id]) changes[`objects/${d.id || id("d", n++)}`] = { ...newObject("door", d.x, d.y, n, { dir: d.dir, state: d.state, mat: d.mat, doorKind: d.kind || (d.win ? "window" : "wood"), ...(d.win ? { win: true } : {}) }), lv: d.lv ?? 0 };
  for (const l of data.lights) if (!data.objects?.[l.id]) changes[`objects/${l.id || id("l", n++)}`] = { ...newObject("light", l.x, l.y, n, { radius: l.radius, color: l.color, fog: 0, state: "on" }), lv: l.lv ?? 0 };
  for (const [oid, o] of Object.entries(data.objects || {})) changes[`objects/${oid}`] = o;
  for (const [gid, g] of Object.entries(data.groups || {})) changes[`groups/${gid}`] = g;
  for (const [fid, f] of Object.entries(data.fog || {})) changes[`map/fog/${id("g", n++)}`] = { open: false, ...f };
  if (data.floorNames) changes["map/levelNames"] = data.floorNames;
  if (data.floorKeys?.length) changes["map/level"] = Number(data.floorKeys[0]) || 0;
  if (data.light) { changes["map/light"] = data.light; if (data.light === "dark") for (let y = 0; y < data.rows; y++) changes[`map/fog/${id("g", n++)}`] = { x: 0, y: y * 40, w: data.cols * 40, h: 40, open: false, lv: 0 }; }
  changes.seeded = true;
  await store.patch(changes);
  if (data.atmosphere?.time != null) await store.put("atmosphere", { time: data.atmosphere.time, weather: data.atmosphere.weather, color: "#4d86b8" });
  return data;
}

// Ask where an import should go. Resolves "merge", "new" or null (cancelled).
export async function askMode(label) {
  const { floatWindow } = await import("./ui.js");
  return new Promise((resolve) => {
    const w = floatWindow({ id: "import-mode", title: "Import map", x: 300, y: 170 });
    const done = (v) => { resolve(v); w.hide(); w.el.remove(); };
    w.body.innerHTML = `<div class="import-mode"><b></b><span>Imports the map and all supported floors.</span><label><input type="checkbox" data-atmo checked> Also set time, weather and light</label><button type="button" data-m="merge">Add to current scene</button><button type="button" data-m="new">New scene (current one is saved first)</button><button type="button" data-m="">Cancel</button></div>`;
    w.body.querySelector("b").textContent = label;
    const st = document.createElement("style"); st.textContent = ".import-mode{display:grid;gap:.4rem;max-width:18rem}.import-mode span{font-size:.8rem;opacity:.8}"; w.body.append(st);
    w.body.addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (b) { askMode.lastAtmo = !!w.body.querySelector("[data-atmo]")?.checked; done(b.dataset.m || null); } });
    w.el.querySelector(".fwin-x")?.addEventListener("click", () => resolve(null));
  });
}
async function importWithChoice(label, load) {
  const mode = await askMode(label); if (!mode) return;
  try { await applyDD2VTT(await load(), mode); toast(`Imported ${label} (${mode === "new" ? "new scene" : "added to scene"})`); } catch (e) { toast(e.message); }
}
async function importGeezChoice(file, button) {
  const { parseGeezMap, applyGeezMap } = await import("./geezmap.js");
  const mode = await askMode(file.name); if (!mode) return;
  try {
    const data = parseGeezMap(JSON.parse(await file.text())); if (!askMode.lastAtmo) data.atmosphere = null; await applyGeezMap(data, mode);
    const skipped = Object.entries(data.skipped).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ") || "none";
    toast(`Imported ${data.name}: ${data.counts?.objects ?? data.doors.length + data.lights.length} objects, ${data.counts?.rules || 0} rules, ${data.counts?.fog || 0} fog cells; skipped ${skipped}`);
  } catch (e) { toast(e.message); }
}
// GeezSheets places that have a battle map file (Gaia places with data.dd2vtt) -> [{ name, file }]
export async function listGeezPlaces() {
  const { readAt } = await import("../store.js");
  const all = (await readAt("v2/worlds/gaia/entities")) || {};
  return Object.values(all).filter((e) => e?.kind === "place" && e.data?.dd2vtt).map((e) => ({ name: e.name || e.id, file: e.data.dd2vtt })).sort((a, b) => a.name.localeCompare(b.name));
}
export const geezMapUrl = (file) => `https://geezjonny.github.io/GeezSheets/battlemap/${encodeURIComponent(file)}`;

export async function exportDD2VTT() {
  const [{ S }, { mapSize }] = await Promise.all([import("./state.js"), import("./state.js")]);
  const { cols, rows } = mapSize();
  const walls = Object.values(S.map.walls || {}).map((w) => [{ x: w.x1 / CELL, y: w.y1 / CELL }, { x: w.x2 / CELL, y: w.y2 / CELL }]);
  const doors = Object.values(S.objects || {}).filter((o) => o?.kind === "door").map((d) => {
    const h = d.dir !== "v", x = d.x / CELL, y = d.y / CELL;
    return { position: { x, y }, bounds: h ? [{ x: x - .5, y }, { x: x + .5, y }] : [{ x, y: y - .5 }, { x, y: y + .5 }], rotation: 0, closed: d.state !== "open" };
  });
  const lights = Object.values(S.objects || {}).filter((o) => o?.kind === "light").map((l) => ({ position: { x: l.x / CELL, y: l.y / CELL }, range: (l.radius || 0) / CELL, color: `${String(l.color || "#ffffff").replace(/^#/, "")}ff` }));
  return new Blob([JSON.stringify({ format: 0.3, resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: cols, y: rows }, pixels_per_grid: 70 }, line_of_sight: walls, objects_line_of_sight: [], portals: doors, lights, image: "" })], { type: "application/json" });
}

// Export the whole scene (every floor, materials, props, roofs, atmosphere) as .geezmap.json, which is also a valid .dd2vtt.
export async function exportGeezMapFile() {
  const [{ S }, { exportGeezMap }, store] = await Promise.all([import("./state.js"), import("./geezmap-export.js"), import("../store.js")]);
  const [light, atmosphere] = await Promise.all([store.read("map/light"), store.read("atmosphere")]);
  const name = S?.sceneName || S?.map?.name || "map";
  const json = exportGeezMap({ name, map: { ...S.map, light }, objects: S.objects, atmosphere });
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json" }));
  a.download = `${name.replace(/[\\/:*?"<>|]+/g, "_")}.geezmap.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Exported ${a.download}`);
}

export function initDD2VTT() {
  if (!new URLSearchParams(location.search).has("gm")) return;
  Promise.all([import("./ui.js"), import("./state.js")]).then(([{ addBarButton, menuWindow }, { S }]) => {
    addBarButton({ id: "dd2vtt", icon: "🗺", label: "Import", gmOnly: true, onClick: menuWindow("import", "Import / Export", () => [
      ["Import .dd2vtt file…", () => { const input = document.createElement("input"); input.type = "file"; input.accept = ".dd2vtt,.json,.uvtt"; input.addEventListener("change", () => { const f = input.files[0]; if (f) importWithChoice(f.name, async () => parseDD2VTT(JSON.parse(await f.text()))); }); input.click(); }],
      ["Import GeezSheets map (.geezmap.json)…", (b) => { const input = document.createElement("input"); input.type = "file"; input.accept = ".json"; input.addEventListener("change", () => { const f = input.files[0]; if (f) importGeezChoice(f, b); }); input.click(); }],
      ["From GeezSheets places…", async (b) => { try { const places = await listGeezPlaces(); const { dropMenu } = await import("./ui.js"); dropMenu(b, [["GeezSheets battle maps (read-only)", null], ...places.map((p) => [p.name, () => importWithChoice(p.name, async () => { const r = await fetch(geezMapUrl(p.file)); if (!r.ok) throw new Error(`Could not load ${p.file}`); return parseDD2VTT(await r.json()); })])]); } catch (e) { toast(e.message); } }],
      ["From GeezSheets maps…", async (b) => { try { const names = await listGeezMaps(); const { dropMenu } = await import("./ui.js"); dropMenu(b, [["GeezSheets raw maps (read-only)", null], ...names.map((n) => [n, async () => { const { readAt } = await import("../store.js"); importWithChoice(n, async () => { const m = await readAt(`maps/${n}`); if (!m?.geometry) throw new Error(`No geometry at maps/${n}`); return parseDD2VTT(geezGeometryToDD2VTT(m.geometry)); }); }])]); } catch (e) { toast(e.message); } }],
      ["Export .geezmap.json (also a dd2vtt)", () => exportGeezMapFile().catch((e) => toast(e.message))],
      ["Export .dd2vtt", async () => { const blob = await exportDD2VTT(); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${(S?.sceneName || S?.map?.name || "map").replace(/[\\/:*?"<>|]+/g, "_")}.dd2vtt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }],
    ]) });
  });
}
