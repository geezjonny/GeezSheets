// GM puzzle panel: palette, inspector, chips, group list, and chip dragging.
import { KINDS, statesOf, actionsOf, conditionsOf, resetAll, newObject } from "../puzzle/index.js";
import { put, patch } from "./undo.js";
import { $, S, emptyDraft, cellName, label } from "./state.js";
import { drawObjects } from "./draw.js";
import { floatWindow } from "./ui.js";

const map = $("#map");

if (!S.isGM) { $("#panel")?.remove(); $("#mode")?.remove(); }
if (S.isGM) { $("#mode").hidden = false; $("#role").textContent = "GM"; }
else $("#role").textContent = "WASD / arrows to move";
// Puzzle placement is one small palette; Logic is an on-demand inspector opened from an object's GM context menu.
const pTools = S.isGM ? floatWindow({ id: "puzzle-tools", title: "Puzzle", x: 20, y: 120, hidden: true }) : null;
const pLogic = S.isGM ? floatWindow({ id: "puzzle-logic", title: "Logic", x: 220, y: 120, hidden: true }) : null;
if (S.isGM) { pTools.body.classList.add("puzzletools"); pLogic.body.classList.add("puzzlelogic"); const kids = [...$("#panel").children]; pTools.body.append(...kids.slice(0, 2)); pLogic.body.append(...kids.slice(2)); }
const on = (type, fn) => S.isGM && [pTools.body, pLogic.body].forEach((b) => b.addEventListener(type, fn));
$("#mode")?.addEventListener("click", () => {
  S.puzzleMode = !S.puzzleMode; $("#mode").classList.toggle("on", S.puzzleMode);
  if (S.puzzleMode) { pTools.show(); pLogic.hide(); } else { pTools.hide(); pLogic.hide(); }
  if (!S.puzzleMode) { S.selected.clear(); S.draft = emptyDraft(); S.placing = S.pick = null; drawObjects(); }
  renderPanel(true);
});

const puzzleKinds = Object.entries(KINDS).filter(([k]) => !["door", "light"].includes(k));
const puzzleGlyph = { plate: "▣", tripwire: "⚯", sight: "◉", gauge: "♥", switch: "⏻", dial: "◉", floor: "◇", spawn: "☠", stone: "●", catapult: "➶", initiative: "⚔", lantern: "☼", rune: "✦", event: "!" };
let puzzleRecent = ["plate", "tripwire", "switch", "spawn", "dial"];
try { puzzleRecent = JSON.parse(localStorage.getItem("vtt-recent-puzzle") || "null") || puzzleRecent; } catch { /* first run */ }
function rememberPuzzle(kind) { puzzleRecent = [kind, ...puzzleRecent.filter((x) => x !== kind)].slice(0, 5); try { localStorage.setItem("vtt-recent-puzzle", JSON.stringify(puzzleRecent)); } catch { /* private mode */ } }
function puzzlePalette() {
  const available = puzzleRecent.map((k) => [k, KINDS[k]]).filter(([, v]) => v);
  const rest = puzzleKinds.filter(([k]) => !puzzleRecent.includes(k));
  return `<div class="puzzle-recent">${available.map(([k, v]) => `<button type="button" class="swatch ico ${S.placing === k ? "on" : ""}" data-place="${k}" title="${v.label}">${puzzleGlyph[k] || "?"}</button>`).join("")}</div><select data-puzzle-more aria-label="More puzzle objects"><option value="" selected disabled>more…</option>${rest.map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select>`;
}
export function openLogic(id) {
  if (!S.isGM || !S.objects[id]) return;
  S.puzzleMode = true; $("#mode")?.classList.add("on"); pTools.show(); pLogic.show(); S.selected.add(id); S.lastSel = id; renderPanel(true);
}

function syncDraft() {   // new picks land in "Selected"; you drag them where you want
  const { draft, selected, objects } = S;
  const all = ["when", "then", "pool"].flatMap((k) => draft[k].map((c) => c.id));
  for (const k of ["when", "then", "pool"]) draft[k] = draft[k].filter((c) => selected.has(c.id));
  for (const id of selected) if (!all.includes(id) && objects[id]) draft.pool.push({ id });
}
function chipText(c, zone) {
  if (zone === "when") return c.at ? `at ${cellName(c.at)}` : c.state;
  if (zone === "then") return c.action === "move" ? `move to ${c.to ? cellName(c.to) : "…"}` : c.action || "";
  return "";
}
function chip(c, zone) {
  const t = chipText(c, zone);
  return `<span class="chip" draggable="true" data-id="${c.id}" data-zone="${zone}">${label(c.id)} ${t ? `<em>${t}</em>` : ""}</span>`;
}
function inspector() {
  const { objects, tokens, selected, lastSel } = S;
  const o = objects[lastSel]; if (!o || !selected.has(lastSel)) return "";
  const f = (html) => `<span>${html}</span>`;
  let h = f(`<input data-p="label" value="${o.label.replace(/"/g, "&quot;")}" aria-label="Name">`);
  if (o.kind === "dial") h += f(`values <input data-p="values" value="${(o.values || []).join(",")}">`);
  if (o.kind === "gauge") h += f(`token <select data-p="token">${Object.keys(tokens).filter((k) => tokens[k].hp != null).map((k) => `<option ${k === o.token ? "selected" : ""}>${k}</option>`).join("")}</select>`);
  if (o.kind === "tripwire") h += f(`length <input data-p="len" type="number" min="1" max="10" value="${o.len || 3}" style="width:3.5rem"> `) + f(`<select data-p="dir"><option value="h" ${o.dir !== "v" ? "selected" : ""}>across</option><option value="v" ${o.dir === "v" ? "selected" : ""}>down</option></select>`);
  if (o.kind === "door") h += f(`<select data-p="dir"><option value="h" ${o.dir !== "v" ? "selected" : ""}>horizontal</option><option value="v" ${o.dir === "v" ? "selected" : ""}>vertical</option></select>`);
  if (o.kind === "plate" || o.kind === "tripwire") h += f(`<label><input data-p="latch" type="checkbox" ${o.latch ? "checked" : ""}> stays down</label>`);
  if (o.kind === "sight") h += f(`sees <select data-p="sees"><option value="player" ${o.sees !== "npc" ? "selected" : ""}>players</option><option value="npc" ${o.sees === "npc" ? "selected" : ""}>NPCs / enemies</option></select>`) + f(`range <input data-p="range" type="number" min="1" max="30" value="${o.range || 6}" style="width:3.5rem"> cells`) + f(`<label><input data-p="latch" type="checkbox" ${o.latch ? "checked" : ""}> stays triggered</label>`);
  if (o.kind === "stone") h += f(`<button data-pickprop="${lastSel}">rolls to ${o.to ? cellName(o.to) : "… (click map)"}</button>`);
  if (o.kind === "spawn") h += f(`enemy HP <input data-p="hp" type="number" min="1" value="${o.hp || 5}" style="width:3.5rem">`);
  return h + f(`<button data-delobj="${lastSel}" class="danger">Delete object</button>`);
}
export function renderPanel(fromSelection) {
  if (!S.isGM || !S.puzzleMode) return;
  const { groups, draft, placing, pick } = S;
  if (fromSelection) syncDraft();
  $("#palette").innerHTML = `<button data-place="" class="${placing ? "" : "on"}">Select</button>` + puzzlePalette();
  $("#hint").textContent = pick ? "Click a cell on the map…" : placing ? `Click the map to place a ${KINDS[placing].label.toLowerCase()}` : "Click objects to select, drag them to move. Then drag chips into When and Then.";
  const active = document.activeElement; if (!active?.closest("#inspector")) $("#inspector").innerHTML = inspector();
  const fill = (z, list) => $(`#z-${z}`).innerHTML = `<b>${{ pool: "Selected", when: "When (all true)", then: "Then" }[z]}</b>` + list.map((c) => chip(c, z)).join("");
  fill("pool", draft.pool); fill("when", draft.when); fill("then", draft.then);
  $("#glist").innerHTML = Object.entries(groups).map(([id, g]) =>
    `<li><span class="dot ${g.met ? "met" : ""}"></span>${(g.when || []).map((c) => `${label(c.id)} ${c.at ? "at " + cellName(c.at) : "= " + c.state}`).join(" + ")} → ${(g.then || []).map((a) => `${label(a.id)} ${a.action === "move" ? "→ " + (a.to ? cellName(a.to) : "?") : a.action}`).join(", ")}
     <button data-editg="${id}">edit</button> <button data-delg="${id}">remove</button></li>`).join("");
  $("#glist").querySelectorAll("li").forEach((li, i) => li.classList.toggle("editing", Object.keys(groups)[i] === S.editing));
  $("#save").textContent = S.editing ? "Update group" : "Save group"; $("#cancel-edit").hidden = !S.editing;
}
function cycle(c, zone) {
  const { objects, tokens } = S;
  const o = objects[c.id] || (tokens[c.id] && { kind: "token" });
  if (zone === "when") {
    const opts = o.kind === "token" ? ["at"] : conditionsOf(o), cur = c.at ? "at" : c.state, i = opts.indexOf(cur), nxt = opts[(i + 1) % opts.length];
    if (nxt === "at") { delete c.state; c.at = c.at || { x: o.x ?? tokens[c.id].x, y: o.y ?? tokens[c.id].y }; S.pick = { zone, id: c.id }; map.classList.add("picking"); }
    else { delete c.at; c.state = nxt; }
  } else {
    const opts = o.kind === "token" ? ["move"] : actionsOf(o), i = opts.indexOf(c.action), nxt = opts[(i + 1) % opts.length];
    c.action = nxt;
    if (nxt === "move") { S.pick = { zone, id: c.id }; map.classList.add("picking"); } else delete c.to;
  }
  renderPanel();
}
function defaultChip(zone, id) {
  const { objects, tokens } = S, o = objects[id];
  if (zone === "when") return o ? { id, state: statesOf(o)[0] } : { id, at: { x: tokens[id].x, y: tokens[id].y } };
  if (zone === "then") return o ? { id, action: actionsOf(o)[0] } : { id, action: "move" };
  return { id };
}
on("click", (e) => {
  const c = e.target.closest(".chip");
  if (c) { const { id, zone } = c.dataset, item = S.draft[zone].find((x) => x.id === id); if (item && zone !== "pool") cycle(item, zone); return; }
  const pl = e.target.closest("[data-place]"); if (pl) { S.tool = null; S.placing = pl.dataset.place && S.placing !== pl.dataset.place ? pl.dataset.place : null; document.dispatchEvent(new Event("toolchange")); return renderPanel(); }
  const pp = e.target.closest("[data-pickprop]"); if (pp) { S.pick = { zone: "prop", id: pp.dataset.pickprop }; map.classList.add("picking"); return renderPanel(); }
  const dobj = e.target.closest("[data-delobj]");
  if (dobj) { const id = dobj.dataset.delobj; S.selected.delete(id); put(`objects/${id}`, null); S.draft = emptyDraft(); return; }
  if (e.target.id === "clear" || e.target.id === "cancel-edit") { S.editing = null; S.selected.clear(); S.draft = emptyDraft(); drawObjects(); return renderPanel(true); }
  if (e.target.id === "reset") return patch(resetAll(S.objects, S.groups));
  if (e.target.id === "save") {
    const { draft } = S;
    if (!draft.when.length || !draft.then.length) return;
    if (draft.then.some((a) => a.action === "move" && !a.to) || draft.when.some((c) => !c.at && !c.state)) return;
    put(`groups/${S.editing && S.groups[S.editing] ? S.editing : "g" + Date.now().toString(36)}`, { when: draft.when, then: draft.then, met: false });   // editing replaces that group in place
    S.editing = null; S.selected.clear(); S.draft = emptyDraft(); drawObjects(); return renderPanel(true);
  }
  const ed = e.target.closest("[data-editg]");   // load a saved group back into the When/Then editor
  if (ed) {
    const g = S.groups[ed.dataset.editg]; if (!g) return;
    S.editing = ed.dataset.editg; S.draft = { when: structuredClone(g.when || []), then: structuredClone(g.then || []), pool: [] };
    S.selected = new Set([...(g.when || []), ...(g.then || [])].map((c) => c.id)); S.lastSel = null; S.placing = S.pick = null;
    drawObjects(); return renderPanel();
  }
  const del = e.target.closest("[data-delg]"); if (del) { if (S.editing === del.dataset.delg) S.editing = null; put(`groups/${del.dataset.delg}`, null); }
});
on("change", (e) => {
  if (!e.target.matches("[data-puzzle-more]") || !e.target.value) return;
  const kind = e.target.value; rememberPuzzle(kind); S.tool = null; S.placing = kind; e.target.value = ""; document.dispatchEvent(new Event("toolchange")); renderPanel();
});
on("change", (e) => {
  const p = e.target.dataset.p, { lastSel } = S; if (!p || !S.objects[lastSel]) return;
  let v = e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? +e.target.value : e.target.value;
  if (p === "values") { v = v.split(",").map((s) => s.trim()).filter(Boolean); put(`objects/${lastSel}/state`, v[0]); put(`objects/${lastSel}/start`, v[0]); }
  put(`objects/${lastSel}/${p}`, v);
});
// Drag chips between zones.
let dragChip = null;
on("dragstart", (e) => { dragChip = e.target.closest(".chip")?.dataset; });
on("dragover", (e) => { if (e.target.closest(".zone")) e.preventDefault(); });
on("drop", (e) => {
  const zone = e.target.closest(".zone")?.dataset.z; if (!zone || !dragChip) return;
  e.preventDefault();
  const { id, zone: from } = dragChip; dragChip = null;
  if (from === zone) return;
  S.draft[from] = S.draft[from].filter((x) => x.id !== id);
  S.draft[zone].push(defaultChip(zone, id));
  renderPanel();
});
