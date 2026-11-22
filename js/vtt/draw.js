// Drawing: map objects, tokens. Reads shared state from state.js.
import { $, S, mapSize } from "./state.js";
import { CONDITIONS, conditionsOf } from "./conditions.js";
import { put } from "./undo.js";
import { drawIcon } from "./icons.js";
import { activeEffects, effectRemaining } from "./effects.js";
import { recordVisible, isCurrentlyVisible } from "./explored-vtt.js";
import { visibleToPlayer } from "./visibility.js";
import { lightIntensity } from "./light-types.js";
import { visibilityPolygon, blockingSegments, polygonPath } from "./vision.js";
import { darknessFor } from "./atmosphere.js";

const NS = "http://www.w3.org/2000/svg";
const COLORS = ["#a94c3d", "#466c83", "#66774b", "#7a5a8a"];
export const PC_VISION_CELLS = 6;   // how far a PC token sees by default
export const TORCH_CELLS = 3;   // light radius of a held torch, in cells

export function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e); return e;
}
function drawObject(id, o, layer) {
  const g = el("g", { class: `obj ${o.kind} state-${o.state} ${o.kind === "light" ? "light-" + o.state : ""} ${S.selected.has(id) ? "sel" : ""} ${o.hidden ? "hidden-obj" : ""} ${o.locked ? "locked" : ""}`, "data-id": id }, layer);
  if (o.kind === "door") {
    const v = o.dir === "v";
    const dk = o.doorKind || o.kindName || (o.win ? "window" : "wood"), n = dk === "double" ? 40 : 20, x1 = o.x - (v ? 0 : n), x2 = o.x + (v ? 0 : n), y1 = o.y - (v ? n : 0), y2 = o.y + (v ? n : 0), cls = dk === "window" || o.win ? "windowbar" : `doorbar ${o.mat ? "m-" + o.mat : ""}`;
    el("line", { x1, x2, y1, y2, class: "doorgap" }, g);
    if (dk === "portcullis" || dk === "bars") { for (let i = -n + 7; i < n; i += 8) el("line", v ? { x1: o.x - 7, x2: o.x + 7, y1: o.y + i, y2: o.y + i, class: cls } : { x1: o.x + i, x2: o.x + i, y1: o.y - 7, y2: o.y + 7, class: cls }, g); }
    else if (dk === "arch") { el("path", { d: v ? `M${o.x - 12} ${o.y - 20} Q${o.x} ${o.y - 32} ${o.x + 12} ${o.y - 20}` : `M${o.x - 20} ${o.y - 12} Q${o.x} ${o.y} ${o.x + 20} ${o.y - 12}`, class: "doorbar" }, g); }
    else if (dk === "curtain") { el("line", { x1, x2, y1, y2, class: "curtaindoor" }, g); }
    else if (dk === "secret") { el("line", { x1, x2, y1, y2, class: "secretdoor" }, g); }
    else el("line", { x1, x2, y1, y2, class: cls }, g);
    if (o.win || dk === "window") el("line", { x1, x2, y1, y2, class: "windowglass" }, g);
  } else drawIcon(o, g);
  el("title", {}, g).textContent = `${o.label}: ${o.state}`;
}
function glowFor(color, intensity = 1) {   // one radial gradient per light colour and intensity, created on demand
  const power = lightIntensity({ intensity }), key = (!color || color === "#ffb347") ? "warm" : color.slice(1), id = `glow${key}${String(power).replace(".", "_")}`;
  if (key === "warm" && power === 1) return "url(#glow)";
  if (!document.getElementById(id)) {
    const g = el("radialGradient", { id }, $("#map defs"));
    [[0, .6], [55, .25], [100, 0]].forEach(([o, a]) => el("stop", { offset: o + "%", "stop-color": color || "#ffb347", "stop-opacity": Math.min(1, a * power) }, g));
  }
  return `url(#${id})`;
}
export function drawObjects() {
  const layer = $("#objects"); layer.textContent = ""; $("#lights").textContent = "";
  const fog = Object.values(S.map.fog || {});
  for (const [id, o] of Object.entries(S.objects)) {
    if ((o.lv ?? 0) !== (S.level ?? S.map.level ?? 0)) continue;
    if (!visibleToPlayer(o, fog, S.isGM, S.currentVisible, S.map.exploredEnabled !== false)) continue;
    if (o.kind === "light" && o.state === "on") el("circle", { cx: o.x, cy: o.y, r: o.radius || 120, fill: glowFor(o.color, o.intensity), "pointer-events": "none" }, $("#lights"));
    if (!(o.kind === "light" && !S.isGM)) drawObject(id, o, layer);   // players see the glow, not the light icon
  }   // players never see hidden objects
  updateFogMask(); updateLightingMask(); S.refresh3d?.();
}
function updateLightingMask() {
  const defs = $("#map defs"), old = document.getElementById("night-mask"); old?.remove(); document.getElementById("night-shade")?.remove(); defs.querySelectorAll('[id^="night-hole-"]').forEach((e) => e.remove());
  const darkness = darknessFor(S.atmosphere?.time ?? 12); if (!(darkness > 0)) return;
  const { cols, rows } = mapSize(), mask = el("mask", { id: "night-mask", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: cols * 40, height: rows * 40 }, defs);
  el("rect", { x: 0, y: 0, width: cols * 40, height: rows * 40, fill: "white" }, mask);
  for (const o of Object.values(S.objects)) if ((o.lv ?? 0) === (S.level ?? S.map.level ?? 0) && o.kind === "light" && o.state === "on" && !o.hidden) {
    const gid = `night-hole-${o.x}-${o.y}`, g = el("radialGradient", { id: gid }, defs), p = lightIntensity(o) * darkness;
    [[0, 1 - p], [65, 1 - p * .7], [100, 1]].forEach(([offset, opacity]) => el("stop", { offset: `${offset}%`, "stop-color": `rgb(${Math.round(opacity * 255)},${Math.round(opacity * 255)},${Math.round(opacity * 255)})` }, g));
    el("circle", { cx: o.x, cy: o.y, r: o.radius || 120, fill: `url(#${gid})` }, mask);
  }
  el("rect", { id: "night-shade", x: 0, y: 0, width: cols * 40, height: rows * 40, fill: "#10152a", opacity: darkness, mask: "url(#night-mask)", "pointer-events": "none" }, $("#map"));
}
// Fog is carved out by lit lights (each light's own "fog" radius in cells).
function updateFogMask() {
  $("#sightmask")?.remove();
  const holes = [];
  for (const o of Object.values(S.objects)) if ((o.lv ?? 0) === (S.level ?? S.map.level ?? 0) && o.kind === "light" && o.state === "on" && o.fog > 0) holes.push([o.x, o.y, o.fog * 40]);
  for (const t of Object.values(S.tokens)) if ((t.lv ?? 0) === (S.level ?? S.map.level ?? 0) && t.torch && !t.hidden) holes.push([t.x, t.y, TORCH_CELLS * 40]);
  if (!S.isGM) {   // per-token vision: every PC token sees as far as its vision range (cells; token.vision overrides), stopped by walls and closed doors
    const lv = S.level ?? S.map.level ?? 0, doors = doorsList(), segs = blockingSegments(S.map.walls, doors, wallPieces, lv);
    for (const t of Object.values(S.tokens)) {
      if ((t.lv ?? 0) !== lv || t.hidden || !isPcToken(t)) continue;
      const r = (t.vision != null ? Number(t.vision) : PC_VISION_CELLS) * 40; if (!(r > 0)) continue;
      const poly = visibilityPolygon({ x: t.x, y: t.y }, r, segs); if (poly.length) holes.push([t.x, t.y, r, poly]);
    }
  }
  recordVisible(holes);
  if (holes.length) {
    const { cols, rows } = mapSize(), m = el("mask", { id: "sightmask", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: cols * 40, height: rows * 40 }, $("#map defs"));
    el("rect", { x: 0, y: 0, width: cols * 40, height: rows * 40, fill: "#fff" }, m);
    for (const [cx, cy, r, poly] of holes) { if (poly) el("path", { d: polygonPath(poly), fill: "#000" }, m); else el("circle", { cx, cy, r, fill: "#000" }, m); }
  }
  if (holes.length && !S.isGM) $("#fog").setAttribute("mask", "url(#sightmask)"); else $("#fog").removeAttribute("mask");
}
export const isPcToken = (t) => !!t.pc || (!t.npc && t.hp == null);
export function drawTokens() {
  if (S.dragging) return;
  S.refresh3d?.();
  const layer = $("#tokens"); layer.textContent = "";
  updateFogMask();
  Object.entries(S.tokens).forEach(([id, t], i) => {
    if ((t.lv ?? 0) !== (S.level ?? S.map.level ?? 0) || !visibleToPlayer(t, Object.values(S.map.fog || {}), S.isGM, S.currentVisible, S.map.exploredEnabled !== false)) return;
    if (!S.isGM && S.map.exploredEnabled !== false && !isCurrentlyVisible(t.x, t.y)) return;
    const g = el("g", { class: `token ${t.hidden ? "hidden-obj" : ""}${S.talking?.has(id) ? " talking" : ""}`, transform: `translate(${t.x} ${t.y})`, "data-id": id }, layer);
    const b = el("g", { class: "tokbody" }, g);   // the art lives here so a talking token can shake without fighting the position transform
    if (S.turn === id) el("circle", { r: 24, class: "turn-ring" }, b);   // whose turn it is (initiative)
    if (t.torch) el("circle", { r: TORCH_CELLS * 40, fill: glowFor("#ffb347"), "pointer-events": "none" }, b);   // held torch glow
    conditionsOf(t).forEach((c, k) => el("circle", { r: 21 + k * 4, fill: "none", stroke: CONDITIONS[c][1], "stroke-width": 3, class: "cond-ring", "pointer-events": "none" }, b).appendChild(document.createElementNS("http://www.w3.org/2000/svg", "title")).textContent = CONDITIONS[c][0]);
    el("circle", { r: 17, fill: t.color || (t.hp != null ? "#5a2a24" : COLORS[i % COLORS.length]), class: "stamp" }, b);
    if (t.img) el("image", { href: t.img, x: -17, y: -17, width: 34, height: 34, preserveAspectRatio: "xMidYMid slice", "clip-path": "url(#tokclip)", "pointer-events": "none" }, b);
    else { el("circle", { r: 12.5, class: "stamp-ring" }, b); el("text", { y: 1 }, b).textContent = (t.label || id).slice(0, 2); }
    if (t.hp != null) el("text", { y: 28, class: "hp" }, b).textContent = `${t.hp}/${t.max}`;
    else { const c = S.pcLive?.[S.tokPc?.[id]]; if (c?.hp_max) el("text", { y: 28, class: "hp" }, b).textContent = `${c.hp_current ?? c.hp_max}/${c.hp_max}`; }
    const effects = activeEffects(t, S.round || 1), timed = effects.filter((x) => x.rounds != null);
    if (effects.length) { const badge = el("text", { y: -25, class: "effect-badge" }, b); badge.textContent = timed.length ? timed.map((x) => effectRemaining(x, S.round || 1)).join("/") : "✦"; const title = document.createElementNS(NS, "title"); title.textContent = effects.map((x) => `${x.name}${x.rounds == null ? "" : ` (${effectRemaining(x, S.round || 1)})`}`).join(", "); badge.append(title); }
  });
}
export function drawTray() {}   // HP is adjusted from the token right-click menu now

// ---- static map: floors, walls, props, roofs -------------------------------
const PROP_NAMES = `table chair stool bench bed barrel crate chest bookshelf torch_sconce campfire candelabra light rug statue cauldron coffin altar bone_pile gravestone skull_pillar iron_cage spike_trap chains guild_crest stairs ladder bush tree pine_tree dead_tree stump fallen_log rocks boulder mushrooms hearth_oven kitchen_counter pot_rack pantry_shelf butcher_block bar_counter keg_rack round_table fireplace mug_clutter desk lectern globe scroll_rack armchair alchemy_table crystal_pedestal book_pile summoning_circle_stones forge anvil grindstone workbench market_stall display_shelf pew holy_font brazier banner wardrobe dresser nightstand bunk_bed torture_rack stocks manacles_wall crystal_cluster stalagmite ore_pile mine_cart rope_coil anchor dock_post cannon blackship reeds flowers tall_grass_clump cliff_rock lamp_post standing_torch tall_brazier fountain water_trough hitching_post notice_board hay_bale shop_counter potion_shelf hat_stand hat_display mirror display_case jeweler_bench strongbox bridge fence well cart signpost tent woodpile sacks weapon_rack column pillar crate barrel table chest pillar statue bed rug tree pine bush rock stump well lamp fence decal_moss decal_cracks decal_blood_splatter decal_blood_pool decal_scorch decal_puddle decal_rubble decal_leaves decal_stains decal_rune_circle decal_footprints decal_ash obelisk`.split(" ");
const CATS = { Furniture: "table chair stool bench bed bookshelf", Storage: "barrel crate chest", Lighting: "torch_sconce campfire candelabra light lamp", "Crypt & Death": "coffin altar bone_pile gravestone skull_pillar", "Traps & Dungeon": "iron_cage spike_trap chains", Decor: "guild_crest rug statue cauldron", Stairs: "stairs ladder", Nature: "bush tree pine_tree dead_tree stump fallen_log rocks boulder mushrooms", Kitchen: "hearth_oven kitchen_counter pot_rack pantry_shelf butcher_block", Tavern: "bar_counter keg_rack round_table fireplace mug_clutter", "Library & Study": "desk lectern globe scroll_rack armchair", "Alchemy & Wizard": "alchemy_table crystal_pedestal book_pile summoning_circle_stones", "Smithy & Shop": "forge anvil grindstone workbench market_stall display_shelf", Temple: "pew holy_font brazier banner", Bedroom: "wardrobe dresser nightstand bunk_bed", "Dungeon & Prison": "torture_rack stocks manacles_wall", "Mine & Cave": "crystal_cluster stalagmite ore_pile mine_cart", Docks: "rope_coil anchor dock_post cannon blackship", "Wild plants & cliffs": "reeds flowers tall_grass_clump cliff_rock", "Town & Street": "lamp_post standing_torch tall_brazier fountain water_trough hitching_post notice_board hay_bale", Shops: "shop_counter potion_shelf hat_stand hat_display mirror display_case jeweler_bench strongbox", Obelisks: "obelisk", Outdoor: "bridge fence well cart signpost tent woodpile sacks weapon_rack" };
const CAT_BY_PROP = Object.fromEntries(Object.entries(CATS).flatMap(([c, list]) => list.split(" ").map(k => [k, c])));
const category = (k) => k.startsWith("decal_") ? "Decals" : CAT_BY_PROP[k] || "Decor";
const sizeOf = (k) => k === "bed" || k === "bunk_bed" ? [1, 2] : k === "tent" ? [3, 3] : k === "blackship" ? [3, 6] : k === "bridge" ? [3, 1] : k === "table" || k === "round_table" ? [2, 1] : k === "bookshelf" || k === "wardrobe" ? [1, 2] : [1, 1];
export const PROP_CATALOG = Object.fromEntries([...new Set(PROP_NAMES)].map((kind) => [kind, { label: kind.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()), category: category(kind), size: sizeOf(kind), shape: kind.startsWith("decal_") ? "decal" : kind === "obelisk" ? "obelisk" : /tree|bush|flower|mushroom|reed|grass/.test(kind) ? "leaf" : /rock|boulder|ore|stalagmite|crystal/.test(kind) ? "rock" : /table|bed|bench|counter|shelf|desk|altar|bridge|fence|wall|bookshelf/.test(kind) ? "rect" : /barrel|well|pillar|column|stump|cauldron|keg|fountain/.test(kind) ? "round" : "mark" }]));
// Old names remain valid; mapmaker names remain distinct for round-tripping.
export const PROPS = Object.fromEntries(Object.entries(PROP_CATALOG).map(([k, v]) => [k, v.label]));
function drawProp(kind, x, y, g) {
  const spec = PROP_CATALOG[kind] || PROP_CATALOG.rock, p = (name, a) => el(name, { ...a, class: `pr ${a.class || ""}` }, g), c = spec.shape === "obelisk" ? "crystal" : spec.category === "nature" ? "leaf" : spec.category === "decal" ? "decal" : "solid";
  if (spec.shape === "rect") { p("rect", { x: x - 16, y: y - 11, width: 32, height: 22, rx: 3, class: c }); p("line", { x1: x - 13, y1: y - 8, x2: x + 13, y2: y + 8 }); }
  else if (spec.shape === "round") { p("circle", { cx: x, cy: y, r: 14, class: c }); p("circle", { cx: x, cy: y, r: 7, fill: "none" }); }
  else if (spec.shape === "leaf") { p("circle", { cx: x - 7, cy: y + 2, r: 11, class: c }); p("circle", { cx: x + 7, cy: y - 2, r: 11, class: c }); p("circle", { cx: x, cy: y, r: 3, class: "solid" }); }
  else if (spec.shape === "obelisk") { const hex = (r) => Array.from({ length: 6 }, (_, i) => `${x + r * Math.cos(i * Math.PI / 3 + Math.PI / 6)},${y + r * Math.sin(i * Math.PI / 3 + Math.PI / 6)}`).join(" "); p("polygon", { points: hex(18), class: "solid" }); p("polygon", { points: hex(11), class: c }); for (let i = 0; i < 3; i++) p("line", { x1: x, y1: y, x2: x + 11 * Math.cos(i * Math.PI / 3 + Math.PI / 6), y2: y + 11 * Math.sin(i * Math.PI / 3 + Math.PI / 6) }); }
  else if (spec.shape === "rock") p("polygon", { points: `${x - 15},${y + 8} ${x - 8},${y - 11} ${x + 8},${y - 13} ${x + 15},${y + 6} ${x + 4},${y + 13}`, class: c });
  else if (spec.shape === "decal") { p("ellipse", { cx: x, cy: y, rx: 16, ry: 9, class: "decal" }); p("line", { x1: x - 10, y1: y + 5, x2: x + 11, y2: y - 5 }); }
  else { p("circle", { cx: x, cy: y, r: 12, class: c }); p("line", { x1: x - 13, y1: y, x2: x + 13, y2: y }); p("line", { x1: x, y1: y - 13, x2: x, y2: y + 13 }); }
}
// A wall as the pieces left after doors are cut out of it (a door replaces the wall under it; deleting the door brings the wall back).
export function wallPieces(w, doors) {
  const vert = w.x1 === w.x2, horiz = w.y1 === w.y2, whole = [[w.x1, w.y1, w.x2, w.y2]];
  if (!vert && !horiz) return whole;
  const ax = vert ? "y" : "x", fixed = vert ? w.x1 : w.y1, a0 = Math.min(w[ax + "1"], w[ax + "2"]), a1 = Math.max(w[ax + "1"], w[ax + "2"]);
  const cuts = doors.filter((o) => (o.dir === "v") === vert && (vert ? o.x : o.y) === fixed).map((o) => { const n = (o.doorKind || o.kind) === "double" ? 40 : 20; return [o[ax] - n, o[ax] + n]; }).filter(([s, e]) => e > a0 && s < a1).sort((p, q) => p[0] - q[0]);
  if (!cuts.length) return whole;
  const out = [], mk = (s, e) => out.push(vert ? [fixed, s, fixed, e] : [s, fixed, e, fixed]); let at = a0;
  for (const [s, e] of cuts) { if (s > at) mk(at, s); at = Math.max(at, e); }
  if (at < a1) mk(at, a1);
  return out;
}
export const doorsList = () => Object.values(S.objects).filter((o) => o.kind === "door");
export function drawWalls() {
  const w = $("#walls"); w.textContent = ""; const doors = doorsList();
  for (const [id, a] of Object.entries(S.map.walls || {})) if ((a.lv ?? 0) === (S.level ?? S.map.level ?? 0)) for (const [x1, y1, x2, y2] of wallPieces(a, doors.filter(d => (d.lv ?? 0) === (S.level ?? S.map.level ?? 0)))) el("line", { x1, y1, x2, y2, class: `wall ${a.mat ? "m-" + a.mat : ""}`, "data-id": id }, w);
}
export function drawMap() {
  const { floors, roofs, props, fog = {} } = S.map;
  const clear = (id) => { const l = $("#" + id); l.textContent = ""; return l; };
  const f = clear("floors"), r = clear("roofs"), pr = clear("props"), fg = clear("fog"), em = clear("explored-memory");
  for (const [id, a] of Object.entries(floors)) if ((a.lv ?? 0) === (S.level ?? S.map.level ?? 0)) {
    const shade = Math.max(-.28, Math.min(.28, (a.elev || 0) * .08));
    el("rect", { x: a.x, y: a.y, width: a.w, height: a.h, class: `floorrect ${a.mat ? "f-" + a.mat : ""}`, "data-id": id, filter: shade ? `brightness(${1 + shade})` : null }, f);
    if (a.mat) el("rect", { x: a.x, y: a.y, width: a.w, height: a.h, fill: "url(#gridlines)", "pointer-events": "none" }, f);
    if (a.elev) for (let x = a.x; x <= a.x + a.w; x += 40) for (let y = a.y; y <= a.y + a.h; y += 40) el("rect", { x: x - 1, y: y - 1, width: 2, height: 2, class: "elev-edge", "pointer-events": "none" }, f);
  }
  for (const [id, a] of Object.entries(S.map.labels || {})) if ((a.lv ?? 0) === (S.level ?? S.map.level ?? 0)) { const t = el("text", { x: a.x, y: a.y, class: "map-label", fill: a.color || "#3d2632", "font-size": (a.size || 1) * 40, transform: `rotate(${a.rot || 0} ${a.x} ${a.y})`, "data-id": id }, f); t.textContent = a.text || ""; }
  drawWalls();
  for (const [id, a] of Object.entries(props).filter(([, a]) => (a.lv ?? 0) === (S.level ?? S.map.level ?? 0) && !a.kind?.startsWith("decal_"))) {
    if (!visibleToPlayer(a, Object.values(fog), S.isGM, S.currentVisible, S.map.exploredEnabled !== false)) continue;
    const g = el("g", { class: `prop ${a.hidden ? "hidden-obj" : ""}`, "data-id": id, transform: `translate(${a.x} ${a.y}) rotate(${a.rot || 0}) scale(${(a.flip ? -1 : 1) * (a.s || 1)} ${a.s || 1}) translate(${-a.x} ${-a.y})` }, pr);
    el("rect", { x: a.x - 20, y: a.y - 20, width: 40, height: 40, fill: "transparent" }, g);
    drawProp(a.kind, a.x, a.y, g); if (a.color) g.querySelectorAll(".pr.leaf, .pr.crystal, .pr.decal").forEach((e) => e.style.fill = a.color); el("title", {}, g).textContent = PROPS[a.kind] || a.kind;
  }
  for (const [id, a] of Object.entries(props).filter(([, a]) => (a.lv ?? 0) === (S.level ?? S.map.level ?? 0) && a.kind?.startsWith("decal_"))) {
    if (!visibleToPlayer(a, Object.values(fog), S.isGM, S.currentVisible, S.map.exploredEnabled !== false)) continue;
    const g = el("g", { class: "prop decal-prop", "data-id": id, transform: `translate(${a.x} ${a.y}) rotate(${a.rot || 0}) scale(${(a.flip ? -1 : 1) * (a.s || 1)} ${a.s || 1}) translate(${-a.x} ${-a.y})` }, f);
    drawProp(a.kind, a.x, a.y, g); if (a.color) g.querySelectorAll(".pr.leaf, .pr.crystal, .pr.decal").forEach((e) => e.style.fill = a.color);
  }
  for (const [id, a] of Object.entries(fog).filter(([, a]) => (a.lv ?? 0) === (S.level ?? S.map.level ?? 0))) {
    if (a.open && !S.isGM) continue;   // a revealed room shows what is in it
    el("rect", { x: a.x, y: a.y, width: a.w, height: a.h, class: `fog ${S.isGM ? "gm" : ""} ${a.open ? "open" : ""}`, "data-id": id }, fg);
  }
  for (const [id, a] of Object.entries(roofs).filter(([, a]) => (a.lv ?? 0) === (S.level ?? S.map.level ?? 0))) {
    if (a.open && !S.isGM) continue;   // a lifted roof shows the room underneath
    el("rect", { x: a.x, y: a.y, width: a.w, height: a.h, class: `roof ${a.mat ? "r-" + a.mat : ""} ${S.isGM ? "gm" : ""} ${a.open ? "open" : ""}`, "data-id": id }, r);
  }
  if (!S.isGM && S.map.exploredEnabled !== false) {
    const { cols, rows } = mapSize();
    for (const cell of S.exploredCells || []) {
      const [x, y] = cell.split(",").map(Number);
      if (x >= 0 && y >= 0 && x < cols && y < rows && !S.currentVisible?.has(cell)) el("rect", { x: x * 40, y: y * 40, width: 40, height: 40, class: "explored-memory" }, em);
    }
  }
  S.refresh3d?.();
}
