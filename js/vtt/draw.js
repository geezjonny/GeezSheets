// Drawing: map objects, tokens. Reads shared state from state.js.
import { $, S, mapSize } from "./state.js";
import { CONDITIONS, conditionsOf } from "./conditions.js";
import { put } from "./undo.js";
import { drawIcon } from "./icons.js";

const NS = "http://www.w3.org/2000/svg";
const COLORS = ["#a94c3d", "#466c83", "#66774b", "#7a5a8a"];
export const TORCH_CELLS = 3;   // light radius of a held torch, in cells

export function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e); return e;
}
function drawObject(id, o, layer) {
  const g = el("g", { class: `obj ${o.kind} state-${o.state} ${o.kind === "light" ? "light-" + o.state : ""} ${S.selected.has(id) ? "sel" : ""} ${o.hidden ? "hidden-obj" : ""}`, "data-id": id }, layer);
  if (o.kind === "door") {
    const v = o.dir === "v";
    el("line", { x1: o.x - (v ? 0 : 20), x2: o.x + (v ? 0 : 20), y1: o.y - (v ? 20 : 0), y2: o.y + (v ? 20 : 0), class: "doorgap" }, g);
    el("line", { x1: o.x - (v ? 0 : 20), x2: o.x + (v ? 0 : 20), y1: o.y - (v ? 20 : 0), y2: o.y + (v ? 20 : 0), class: o.win ? "windowbar" : `doorbar ${o.mat ? "m-" + o.mat : ""}` }, g);
    if (o.win) el("line", { x1: o.x - (v ? 0 : 20), x2: o.x + (v ? 0 : 20), y1: o.y - (v ? 20 : 0), y2: o.y + (v ? 20 : 0), class: "windowglass" }, g);
  } else drawIcon(o, g);
  el("title", {}, g).textContent = `${o.label}: ${o.state}`;
}
function glowFor(color) {   // one radial gradient per light colour, created on demand
  if (!color || color === "#ffb347") return "url(#glow)";
  const id = "glow" + color.slice(1);
  if (!document.getElementById(id)) {
    const g = el("radialGradient", { id }, $("#map defs"));
    [[0, ".6"], [55, ".25"], [100, "0"]].forEach(([o, a]) => el("stop", { offset: o + "%", "stop-color": color, "stop-opacity": a }, g));
  }
  return `url(#${id})`;
}
export function drawObjects() {
  const layer = $("#objects"); layer.textContent = ""; $("#lights").textContent = "";
  for (const [id, o] of Object.entries(S.objects)) {
    if (o.hidden && !S.isGM) continue;   // players never see hidden objects
    if (o.kind === "light" && o.state === "on") el("circle", { cx: o.x, cy: o.y, r: o.radius || 120, fill: glowFor(o.color), "pointer-events": "none" }, $("#lights"));
    drawObject(id, o, layer);
  }   // players never see hidden objects
  updateFogMask(); S.refresh3d?.();
}
// Fog is carved out by lit lights (each light's own "fog" radius in cells).
function updateFogMask() {
  $("#sightmask")?.remove();
  const holes = [];
  for (const o of Object.values(S.objects)) if (o.kind === "light" && o.state === "on" && o.fog > 0) holes.push([o.x, o.y, o.fog * 40]);
  for (const t of Object.values(S.tokens)) if (t.torch && !t.hidden) holes.push([t.x, t.y, TORCH_CELLS * 40]);   // a held torch clears fog around its carrier
  if (holes.length) {
    const { cols, rows } = mapSize(), m = el("mask", { id: "sightmask", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: cols * 40, height: rows * 40 }, $("#map defs"));
    el("rect", { x: 0, y: 0, width: cols * 40, height: rows * 40, fill: "#fff" }, m);
    for (const [cx, cy, r] of holes) el("circle", { cx, cy, r, fill: "#000" }, m);
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
    if (t.hidden && !S.isGM) return;   // players never see hidden tokens
    const g = el("g", { class: `token ${t.hidden ? "hidden-obj" : ""}`, transform: `translate(${t.x} ${t.y})`, "data-id": id }, layer);
    if (t.torch) el("circle", { r: TORCH_CELLS * 40, fill: glowFor("#ffb347"), "pointer-events": "none" }, g);   // held torch glow
    conditionsOf(t).forEach((c, k) => el("circle", { r: 21 + k * 4, fill: "none", stroke: CONDITIONS[c][1], "stroke-width": 3, class: "cond-ring", "pointer-events": "none" }, g).appendChild(document.createElementNS("http://www.w3.org/2000/svg", "title")).textContent = CONDITIONS[c][0]);
    el("circle", { r: 17, fill: t.color || (t.hp != null ? "#5a2a24" : COLORS[i % COLORS.length]), class: "stamp" }, g);
    if (t.img) el("image", { href: t.img, x: -17, y: -17, width: 34, height: 34, preserveAspectRatio: "xMidYMid slice", "clip-path": "url(#tokclip)", "pointer-events": "none" }, g);
    else { el("circle", { r: 12.5, class: "stamp-ring" }, g); el("text", { y: 1 }, g).textContent = (t.label || id).slice(0, 2); }
    if (t.hp != null) el("text", { y: 28, class: "hp" }, g).textContent = `${t.hp}/${t.max}`;
    else { const c = S.pcLive?.[S.tokPc?.[id]]; if (c?.hp_max) el("text", { y: 28, class: "hp" }, g).textContent = `${c.hp_current ?? c.hp_max}/${c.hp_max}`; }
  });
}
export function drawTray() {}   // HP is adjusted from the token right-click menu now

// ---- static map: floors, walls, props, roofs -------------------------------
export const PROPS = { crate: "Crate", barrel: "Barrel", table: "Table", chest: "Chest", pillar: "Pillar", statue: "Statue", bed: "Bed", rug: "Rug", tree: "Tree", pine: "Pine", bush: "Bush", rock: "Rock", stump: "Stump", well: "Well", lamp: "Lamp post", fence: "Fence" };
function drawProp(kind, x, y, g) {
  const p = (name, a) => el(name, { class: "pr", ...a }, g);
  if (kind === "crate") { p("rect", { x: x - 14, y: y - 14, width: 28, height: 28 }); p("path", { d: `M${x - 14} ${y - 14} L${x + 14} ${y + 14} M${x + 14} ${y - 14} L${x - 14} ${y + 14}`, fill: "none" }); }
  else if (kind === "barrel") { p("circle", { cx: x, cy: y, r: 13 }); p("circle", { cx: x, cy: y, r: 7, fill: "none" }); }
  else if (kind === "table") p("rect", { x: x - 17, y: y - 11, width: 34, height: 22, rx: 3 });
  else if (kind === "chest") { p("rect", { x: x - 15, y: y - 10, width: 30, height: 20, rx: 2 }); p("path", { d: `M${x - 15} ${y - 3} H${x + 15}`, fill: "none" }); p("rect", { x: x - 3, y: y - 6, width: 6, height: 7, class: "pr clasp" }); }
  else if (kind === "pillar") { p("circle", { cx: x, cy: y, r: 11, class: "pr solid" }); p("circle", { cx: x, cy: y, r: 6, fill: "none" }); }
  else if (kind === "statue") { p("circle", { cx: x, cy: y, r: 14 }); p("path", { d: `M${x} ${y - 9} L${x + 7} ${y} L${x} ${y + 9} L${x - 7} ${y} Z`, class: "pr solid" }); }
  else if (kind === "bed") { p("rect", { x: x - 14, y: y - 18, width: 28, height: 36, rx: 3 }); p("rect", { x: x - 11, y: y - 15, width: 22, height: 9, rx: 3, class: "pr clasp" }); }
  else if (kind === "rug") { p("rect", { x: x - 17, y: y - 17, width: 34, height: 34, class: "pr rug" }); p("rect", { x: x - 10, y: y - 10, width: 20, height: 20, fill: "none", "stroke-dasharray": "3 3" }); }
  else if (kind === "tree") { p("circle", { cx: x, cy: y, r: 17, class: "pr leaf" }); p("circle", { cx: x, cy: y, r: 3, class: "pr solid" }); }
  else if (kind === "pine") { p("path", { d: `M${x} ${y - 18} L${x - 13} ${y + 10} H${x + 13} Z`, class: "pr leaf" }); p("path", { d: `M${x} ${y - 10} L${x - 9} ${y + 16} H${x + 9} Z`, class: "pr leaf" }); }
  else if (kind === "bush") { p("circle", { cx: x - 7, cy: y + 3, r: 10, class: "pr leaf" }); p("circle", { cx: x + 7, cy: y + 3, r: 10, class: "pr leaf" }); }
  else if (kind === "rock") { p("path", { d: `M${x - 14} ${y + 7} L${x - 8} ${y - 10} L${x + 8} ${y - 13} L${x + 15} ${y + 5} L${x + 5} ${y + 12} Z`, class: "pr solid" }); }
  else if (kind === "stump") { p("circle", { cx: x, cy: y, r: 12, class: "pr solid" }); p("circle", { cx: x, cy: y, r: 6, fill: "none" }); }
  else if (kind === "well") { p("circle", { cx: x, cy: y + 3, r: 14, class: "pr solid" }); p("path", { d: `M${x - 11} ${y - 10} H${x + 11} M${x} ${y - 10} V${y + 15}`, fill: "none" }); }
  else if (kind === "lamp") { p("path", { d: `M${x} ${y + 16} V${y - 8} M${x - 7} ${y - 8} H${x + 7} L${x} ${y - 17} Z`, class: "pr clasp" }); p("circle", { cx: x, cy: y - 5, r: 5, class: "pr leaf" }); }
  else if (kind === "fence") { p("path", { d: `M${x - 15} ${y - 12} V${y + 14} M${x} ${y - 12} V${y + 14} M${x + 15} ${y - 12} V${y + 14}`, fill: "none" }); p("path", { d: `M${x - 17} ${y - 5} H${x + 17} M${x - 17} ${y + 7} H${x + 17}`, fill: "none" }); }
}
// A wall as the pieces left after doors are cut out of it (a door replaces the wall under it; deleting the door brings the wall back).
export function wallPieces(w, doors) {
  const vert = w.x1 === w.x2, horiz = w.y1 === w.y2, whole = [[w.x1, w.y1, w.x2, w.y2]];
  if (!vert && !horiz) return whole;
  const ax = vert ? "y" : "x", fixed = vert ? w.x1 : w.y1, a0 = Math.min(w[ax + "1"], w[ax + "2"]), a1 = Math.max(w[ax + "1"], w[ax + "2"]);
  const cuts = doors.filter((o) => (o.dir === "v") === vert && (vert ? o.x : o.y) === fixed).map((o) => [o[ax] - 20, o[ax] + 20]).filter(([s, e]) => e > a0 && s < a1).sort((p, q) => p[0] - q[0]);
  if (!cuts.length) return whole;
  const out = [], mk = (s, e) => out.push(vert ? [fixed, s, fixed, e] : [s, fixed, e, fixed]); let at = a0;
  for (const [s, e] of cuts) { if (s > at) mk(at, s); at = Math.max(at, e); }
  if (at < a1) mk(at, a1);
  return out;
}
export const doorsList = () => Object.values(S.objects).filter((o) => o.kind === "door");
export function drawWalls() {
  const w = $("#walls"); w.textContent = ""; const doors = doorsList();
  for (const [id, a] of Object.entries(S.map.walls || {})) for (const [x1, y1, x2, y2] of wallPieces(a, doors)) el("line", { x1, y1, x2, y2, class: `wall ${a.mat ? "m-" + a.mat : ""}`, "data-id": id }, w);
}
export function drawMap() {
  const { floors, roofs, props, fog = {} } = S.map;
  const clear = (id) => { const l = $("#" + id); l.textContent = ""; return l; };
  const f = clear("floors"), r = clear("roofs"), pr = clear("props"), fg = clear("fog");
  for (const [id, a] of Object.entries(floors)) {
    el("rect", { x: a.x, y: a.y, width: a.w, height: a.h, class: `floorrect ${a.mat ? "f-" + a.mat : ""}`, "data-id": id }, f);
    if (a.mat) el("rect", { x: a.x, y: a.y, width: a.w, height: a.h, fill: "url(#gridlines)", "pointer-events": "none" }, f);
  }
  drawWalls();
  for (const [id, a] of Object.entries(props)) {
    if (a.hidden && !S.isGM) continue;   // players never see hidden props
    const g = el("g", { class: `prop ${a.hidden ? "hidden-obj" : ""}`, "data-id": id }, pr);
    el("rect", { x: a.x - 20, y: a.y - 20, width: 40, height: 40, fill: "transparent" }, g);
    drawProp(a.kind, a.x, a.y, g); el("title", {}, g).textContent = PROPS[a.kind] || a.kind;
  }
  for (const [id, a] of Object.entries(fog)) {
    if (a.open && !S.isGM) continue;   // a revealed room shows what is in it
    el("rect", { x: a.x, y: a.y, width: a.w, height: a.h, class: `fog ${S.isGM ? "gm" : ""} ${a.open ? "open" : ""}`, "data-id": id }, fg);
  }
  for (const [id, a] of Object.entries(roofs)) {
    if (a.open && !S.isGM) continue;   // a lifted roof shows the room underneath
    el("rect", { x: a.x, y: a.y, width: a.w, height: a.h, class: `roof ${a.mat ? "r-" + a.mat : ""} ${S.isGM ? "gm" : ""} ${a.open ? "open" : ""}`, "data-id": id }, r);
  }
  S.refresh3d?.();
}
