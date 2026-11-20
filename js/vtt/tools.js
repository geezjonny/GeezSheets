// GM map-building tools: the "+" menu, the tool bar, and drag/click handling for each tool.
import { readAt } from "../store.js";
import { put, patch } from "./undo.js";
import { KINDS, newObject } from "../puzzle/index.js";
import { $, S, cellOf, mapSize } from "./state.js";
import { el, PROPS, PROP_CATALOG, drawObjects } from "./draw.js";
import { renderPanel } from "./panel.js";
import { floatWindow } from "./ui.js";

const MENU = [["token", "Token"], ["wall", "Wall"], ["door", "Door"], ["floor", "Floor"], ["roof", "Roof"], ["fog", "Fog"], ["light", "Light"], ["object", "Object ▸"], ["prop", "Prop"], ["erase", "Erase"], ["puzzle", "Puzzle"]];
const HINT = {
  token: "Click a cell to drop a token.", wall: "Drag to draw a wall (snaps to the grid).", floor: "Drag to paint a floor area.",
  fog: "Drag to fog a room (snaps to cells). Right-click fog to reveal it to players.", roof: "Drag to cover an area with a roof. Right-click a roof to lift it.", prop: "Click a cell to place it. Drag props to move them.",
  erase: "Click anything to delete it.", "obj:door": "Click near a cell edge to place a door.", "obj:light": "Click a cell to place a light.",
};
export const WALL_MATS = ["stone", "ashlar", "marble", "brick", "fieldstone", "plaster", "timber", "wood", "palisade", "cave", "hedge", "earth", "cobble", "iron"];
export const FLOOR_MATS = ["stone", "slab", "cobble", "marble", "tile", "wood", "carpet", "dirt", "cave", "sand", "grass", "snow", "water", "mud", "shallow", "ice", "lava", "swamp", "bone", "void", "gravel", "moss", "iron"];
export const LIGHT_COLORS = { "#ffb347": "warm (torch)", "#ffe9a8": "white", "#e05a3c": "red", "#4aa3e8": "blue", "#58c46a": "green", "#a46be0": "purple", "#40d0d0": "cyan", "#e87bc0": "pink" };
const matSel = (list) => `<select data-o="mat"><option value="">default</option>${list.map((m) => `<option value="${m}">${m}</option>`).join("")}</select>`;
let wallsAround = true;   // the Floors window's "Draw walls around it" box
let curMat = "", curMode = "", eraseOnly = "";   // floor flyout choices: material, shape/brush/bucket, floor-only erase
const matOf = () => opt("mat")?.value || curMat;
const FLOOR_ACTS = [["select", "Select"], ["erase", "Erase"], ["shape", "Shape"], ["brush", "Paint brush"], ["bucket", "Paint bucket"]];
export const ROOF_MATS = ["thatch", "slate", "tile", "flat", "wood", "stone"];
const FLOOR_COL = { thatch: "#c9a85c", slate: "#59636e", tile: "#b5532f", flat: "#77736c", wood: "#b88a52", stone: "#b5b2a8", slab: "#aaa69d", cobble: "#8f8a80", marble: "#d7d8d2", carpet: "#9a5364", dirt: "#856a4c", cave: "#635d61", iron: "#6f7882", gravel: "#a39a88", sand: "#e0cb8f", grass: "#8fae6a", snow: "#eef5f5", water: "#6aa3c2", mud: "#7a5f43", shallow: "#83b8c4", ice: "#cfe8f0", lava: "#d64b2f", swamp: "#64734b", bone: "#d8ceb0", void: "#252433", moss: "#718454", ashlar: "#9b9890", brick: "#9c5547", fieldstone: "#817c75", plaster: "#c8bca4", timber: "#80552e", palisade: "#69462c", hedge: "#50713f", earth: "#795b3f" };
const uid = (p) => p + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
const vertex = (p) => { const { cols, rows } = mapSize(); return { x: Math.max(0, Math.min(cols * 40, Math.round(p.x / 40) * 40)), y: Math.max(0, Math.min(rows * 40, Math.round(p.y / 40) * 40)) }; };
const opt = (k) => $(`#toolbar [data-o="${k}"]`) || tokWin?.body.querySelector(`[data-o="${k}"]`);
// Build > Token: a floating window (like the floor/prop palettes) with a PC / NPC dropdown; then click the map to drop it.
let tokWin = null;
function renderTokenWin() {
  if (!tokWin) {
    tokWin = floatWindow({ id: "token-place", title: "Token", x: 20, y: 120, hidden: true });
    tokWin.body.innerHTML = `<div class="tok-win"><select data-o="npc" style="width:100%"></select>
      <div class="tok-row"><label>Name <input data-o="name" size="9" placeholder="auto"></label><label>HP <input data-o="hp" type="number" min="0" placeholder="blank = PC" title="Leave blank for a player token" style="width:5.5rem"></label></div>
      <div class="tok-hint">Click a cell on the map to drop it.</div></div>`;
    tokWin.body.addEventListener("change", (e) => {   // picking a PC / NPC fills in its name and HP
      if (e.target.dataset.o !== "npc") return;
      const [kind, id] = e.target.value.split(":"), n = (kind === "pc" ? pcList || [] : npcs || []).find((x) => x.id === id);
      opt("name").value = n ? n.name : ""; opt("hp").value = n && n.hp > 0 ? n.hp : "";
    });
    tokWin.el.addEventListener("fwin-close", () => { if (S.tool === "token") setTool(null); });
    const s = document.createElement("style"); s.textContent = `.tok-win{display:flex;flex-direction:column;gap:7px;min-width:230px;color:var(--paper);font:14px Georgia,serif}.tok-win select,.tok-win input{background:var(--paper);color:var(--ink);border:1px solid var(--brass);border-radius:3px;font:14px Georgia,serif;padding:2px 4px}.tok-row{display:flex;gap:10px;flex-wrap:wrap}.tok-hint{font-size:12px;opacity:.8}`; document.head.append(s);
  }
  const sel = tokWin.body.querySelector('[data-o="npc"]'), keep = sel.value;
  sel.innerHTML = `<option value="">Blank NPC</option>
    <optgroup label="Our PCs">${(pcList || []).map((n) => `<option value="pc:${n.id}">${n.name}${n.campaign ? ` (${n.campaign})` : ""}</option>`).join("")}</optgroup>
    <optgroup label="NPCs">${(npcs || []).map((n) => `<option value="npc:${n.id}">${n.name}${n.campaign ? ` (${n.campaign})` : ""}</option>`).join("")}</optgroup>`;
  sel.value = keep; if (sel.value !== keep) sel.value = "";
  tokWin.show(); loadNpcs(); loadPcs();
}
let npcs = null;   // NPCs from the main app (read only): [{ id, name, hp, campaign }]
async function loadNpcs() {
  if (npcs) return; npcs = [];
  try {
    const all = (await readAt("characters/npcs")) || {};
    npcs = Object.entries(all).map(([id, n]) => ({ id, name: n.name || id, hp: n.combat?.hp_max || 0, campaign: n.campaign || "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) { console.warn("Could not read NPCs", err); }
  if (S.tool === "token") renderToolbar();
}
let pcList = null;   // player characters from the main app (read only): [{ id, name, campaign }]
async function loadPcs() {
  if (pcList) return; pcList = [];
  try {
    const all = (await readAt("characters/pcs")) || {};
    pcList = Object.entries(all).filter(([, c]) => c && c.campaign !== "__oracle__" && c.type !== "npc" && c.record_type !== "npc")
      .map(([id, c]) => ({ id, name: c.name || c.identity?.name || c.basic?.name || "", campaign: c.campaign || "", hp: c.combat?.hp_max || 0, cur: c.combat?.hp_current })).filter((c) => c.name)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) { console.warn("Could not read PCs", err); }
  if (S.tool === "token") renderToolbar();
}
let drag = null;   // wall / floor / roof being drawn, or a prop being moved

// Doors sit on cell edges; everything else on cell centres.
export function snapFor(kind, p) {
  const c = cellOf(p);
  if (kind !== "door") return { ...c };
  const dx = p.x - c.x, dy = p.y - c.y;
  return Math.abs(dx) > Math.abs(dy) ? { x: c.x + Math.sign(dx) * 20, y: c.y, dir: "v" } : { x: c.x, y: c.y + Math.sign(dy) * 20, dir: "h" };
}

// ---- menu and tool bar ------------------------------------------------------
function showMenu() {
  const m = $("#addmenu");
  m.innerHTML = MENU.map(([k, l]) => `<button data-choose="${["door", "light"].includes(k) ? "obj:" + k : k}">${l.replace(" ▸", "")}</button>`).join("");
  m.hidden = false; placeMenu();
}
// "Object" expands a flyout beside its row, Adobe-style.
function showSub(row) {
  let s = $("#addsub"); if (!s) { s = document.createElement("div"); s.id = "addsub"; document.body.append(s); }
  s.innerHTML = Object.entries(KINDS).filter(([k]) => k !== "door" && k !== "light").map(([k, v]) => `<button data-choose="obj:${k}">${v.label}</button>`).join("");
  s.hidden = false; row.classList.add("open"); const r = row.getBoundingClientRect(), w = s.getBoundingClientRect();
  s.style.left = Math.min(r.right, innerWidth - w.width) + "px"; s.style.top = Math.max(0, Math.min(r.top, innerHeight - w.height)) + "px";
}
// Build Tools: a "Build Tools" window (Select / Erase / Shape / Paint brush / Paint bucket) plus one small window per kind (Floors,
// Walls, Doors, Roofs, Lights, Props): its 5 most recently used swatches as icons, and under them a dropdown with the rest.
// The tool says HOW you act, the window you last touched says WHAT: pick Stone in Floors, Shape, drag a room; touch Walls and the
// same Shape tool draws a wall. Any Build item opens them; they stay until you close them with the x.
const KP = {
  floor: { key: "floor", label: "Floors", mats: FLOOR_MATS, paint: true }, wall: { key: "wall", label: "Walls", mats: WALL_MATS, fixed: "line" },
  door: { key: "obj:door", label: "Doors", mats: WALL_MATS, fixed: "place", door: true }, roof: { key: "roof", label: "Roofs", mats: ROOF_MATS },
  light: { key: "obj:light", label: "Lights", color: true, fixed: "place" }, prop: { key: "prop", label: "Props", props: true, fixed: "place" },
  fog: { key: "fog", label: "Fog", paint: true, noSwatch: true },
};
const MODE_ICONS = {   // line icons, drawn in the button's text colour
  select: "<path d='M6 3l12 9-5.5 1.2L15 19l-2.6 1-2.4-5.6L6 18z'/>",
  erase: "<path d='M15.5 4.5l5 5-9.5 10H6.5l-3-3z'/><path d='M8 11l6 6M10 20h11'/>",
  shape: "<rect x='4' y='6' width='16' height='12' rx='1.5'/>",
  brush: "<path d='M20 3.5c-5.5 3-9 6.5-10.5 10.5l2.5 2.5c4-1.5 7.5-5 10.5-10.5z'/><path d='M9.5 14C6.5 14 5.5 16 5.5 18c0 1.2-.8 2.2-2 2.5 4 .8 8-.3 8-4.5z'/>",
  bucket: "<path d='M4.5 11.5l7-7 7 7-6 6a2.1 2.1 0 01-3 0z'/><path d='M4.5 11.5h14'/><path d='M20.5 14c1.2 1.8 1.8 2.8 1.8 3.8a1.8 1.8 0 01-3.6 0c0-1 .6-2 1.8-3.8z'/>",
};
const MODES = [["select", "Select"], ["erase", "Erase"], ["shape", "Shape"], ["brush", "Paint brush"], ["bucket", "Paint bucket"]];
let palProp = "crate", palColor = "#ffb347", palRot = 0, palScale = 1, palRandomRot = false, palRandomScale = false, palFlip = false;
const bt = { mode: "shape", kind: "floor", any: false, mats: {}, window: false };   // any = the menu's Erase (erases every kind)
const SEED = { floor: ["default", "stone", "wood", "grass", "water"], wall: ["default", "stone", "brick", "wood", "plaster"], door: ["default", "wood", "iron", "stone", "brick"], roof: ["default", "thatch", "slate", "tile", "wood"], light: Object.keys(LIGHT_COLORS).slice(0, 5), prop: ["crate", "table", "chair", "barrel", "chest"] };
let recent = SEED;
try { const r = JSON.parse(localStorage.getItem("vtt-recent-swatches") || "null"); if (r) recent = { ...SEED, ...r }; } catch { /* first run */ }
let btWin = null; const kw = {};
const remember = (kind, v) => { recent[kind] = [v, ...(recent[kind] || []).filter((x) => x !== v)].slice(0, 5); try { localStorage.setItem("vtt-recent-swatches", JSON.stringify(recent)); } catch { /* private mode */ } };
const current = (k) => KP[k].props ? palProp : KP[k].color ? palColor : bt.mats[k] || "default";
const propGlyph = (k) => { const s = PROP_CATALOG[k]?.shape || "mark"; return s === "rect" ? "<rect x='4' y='8' width='24' height='16' rx='3'/><path d='M7 11l18 10'/>" : s === "round" ? "<circle cx='16' cy='16' r='11'/><circle cx='16' cy='16' r='5' fill='none'/>" : s === "leaf" ? "<circle cx='10' cy='17' r='8'/><circle cx='22' cy='13' r='8'/><circle cx='16' cy='16' r='2'/>" : s === "rock" ? "<path d='M3 23l5-15 14-3 7 14-10 5z'/>" : "<circle cx='16' cy='16' r='9'/><path d='M4 16h24M16 4v24'/>"; };
const chipHTML = (k, v) => KP[k].props ? `<button type="button" class="swatch ico" data-v="${v}" title="${PROPS[v] || v}"><svg viewBox="0 0 32 32" aria-label="${PROPS[v] || v}">${propGlyph(v)}</svg></button>`
  : KP[k].color ? `<button type="button" class="swatch ico" data-v="${v}" title="${LIGHT_COLORS[v] || v}"><i style="background:${v}"></i></button>`
  : `<button type="button" class="swatch ico" data-v="${v}" title="${v}"><i style="background:${FLOOR_COL[v] || "#d8d0c0"}"></i></button>`;
function optionsHTML(k) {
  const c = KP[k]; let h = `<option value="" selected disabled>more…</option>`;
  if (c.props) { const g = {}; for (const [id, l] of Object.entries(PROPS)) (g[PROP_CATALOG[id]?.category || "other"] ||= []).push([id, l]); for (const [cat, list] of Object.entries(g)) h += `<optgroup label="${cat}">${list.map(([id, l]) => `<option value="${id}">${l}</option>`).join("")}</optgroup>`; }
  else if (c.color) h += Object.entries(LIGHT_COLORS).map(([col, n]) => `<option value="${col}">${n}</option>`).join("");
  else h += ["default", ...c.mats].map((m) => `<option value="${m}">${m}</option>`).join("");
  return h;
}
const winHTML = (k) => { const c = KP[k]; return `<div class="bt-recent"></div><select data-more aria-label="More ${c.label}">${optionsHTML(k)}</select>`
  + (c.door ? `<button type="button" class="swatch bt-win" data-win title="Windows never open; sight passes">Window</button>` : "")
  + (c.key === "floor" ? `<label class="bt-walls"><input type="checkbox" data-walls ${wallsAround ? "checked" : ""}> Draw walls around it</label>` : "")
  + (c.color ? `<input type="color" class="wheel" data-wheel value="${palColor}" title="Any colour">` : "")
  + (c.props ? `<div class="prop-options"><label>Rotation <input data-pal="rot" type="number" min="0" max="359" value="${palRot}" style="width:4rem"></label><label><input data-pal="rrot" type="checkbox"> random</label><label>Scale <input data-pal="scale" type="range" min="0.5" max="2" step="0.05" value="${palScale}"></label><output data-scale>${palScale}</output><label><input data-pal="rscale" type="checkbox"> random</label><label><input data-pal="flip" type="checkbox"> Mirror</label></div>` : ""); };
function renderRecent(k) { const box = kw[k]?.body.querySelector(".bt-recent"); if (box) box.innerHTML = (recent[k] || []).map((v) => chipHTML(k, v)).join(""); }
function applyPal() {
  const c = KP[bt.kind];
  if (bt.mode === "select") return setTool(null, null, true);
  if (bt.mode === "erase") return setTool("erase", { eraseOnly: bt.any ? "" : c.key }, true);
  const mode = c.fixed || (bt.mode === "brush" || bt.mode === "bucket" ? (c.paint ? bt.mode : "shape") : "shape");
  setTool(c.key, { mode: c.door && bt.window ? "window" : mode, mat: bt.mats[bt.kind] || "" }, true);
}
function syncPalette() {
  if (!btWin) return;
  const shown = S.tool === "token" ? "" : S.tool || S.placing ? bt.mode : "select", paint = KP[bt.kind].paint;
  btWin.body.querySelectorAll("[data-mode]").forEach((b) => { const off = (b.dataset.mode === "brush" || b.dataset.mode === "bucket") && !paint; b.classList.toggle("on", b.dataset.mode === shown); b.disabled = off; b.classList.toggle("off", off); });
  for (const [k, w] of Object.entries(kw)) {
    w.el.classList.toggle("pal-active", k === bt.kind && !bt.any && shown !== "select" && shown !== "");
    w.body.querySelectorAll("[data-v]").forEach((b) => b.classList.toggle("on", b.dataset.v === current(k)));
    w.body.querySelector("[data-win]")?.classList.toggle("on", bt.window);
  }
}
function pick(kind, v) {
  const c = KP[kind];
  if (c.props) palProp = v; else if (c.color) palColor = v; else bt.mats[kind] = v === "default" ? "" : v;
  remember(kind, v); renderRecent(kind);
  bt.kind = kind; bt.any = false; if (bt.mode === "select") bt.mode = "shape"; applyPal();
}
function activate(kind) { if (bt.kind === kind && !bt.any) return; bt.kind = kind; bt.any = false; applyPal(); }
function toolsWin() {
  if (btWin) return btWin;
  btWin = floatWindow({ id: "build-tools", title: "Build Tools", x: 20, y: 90 }); btWin.body.className += " paltools";
  btWin.body.innerHTML = MODES.map(([k, l]) => `<button type="button" data-mode="${k}" title="${l}" aria-label="${l}"><svg viewBox="0 0 24 24" aria-hidden="true">${MODE_ICONS[k]}</svg></button>`).join("");
  btWin.body.addEventListener("click", (e) => { const b = e.target.closest("[data-mode]"); if (!b || b.disabled) return; bt.mode = b.dataset.mode; if (bt.mode !== "erase") bt.any = false; applyPal(); });
  btWin.el.addEventListener("fwin-close", () => { Object.values(kw).forEach((w) => w.hide()); setTool(null, null, true); });
  return btWin;
}
function kindWin(kind) {
  if (kw[kind]) return kw[kind];
  const c = KP[kind], at = { floor: [190, 90], wall: [370, 90], door: [550, 90], roof: [730, 90], light: [910, 90], prop: [190, 260] }[kind] || [190, 90];   // side by side
  const w = kw[kind] = floatWindow({ id: "pal-" + kind, title: c.label, x: at[0], y: at[1], hidden: true }); w.body.className += " palkind";
  w.body.innerHTML = winHTML(kind); renderRecent(kind);
  w.body.addEventListener("click", (e) => {
    if (e.target.closest("[data-win]")) { bt.window = !bt.window; return pick(kind, current(kind)); }
    const chip = e.target.closest("[data-v]"); if (chip) pick(kind, chip.dataset.v);
  });
  w.body.addEventListener("change", (e) => { if (e.target.matches("[data-walls]")) { wallsAround = e.target.checked; return; } if (e.target.matches("[data-more]") && e.target.value) { pick(kind, e.target.value); e.target.value = ""; } else if (e.target.matches("[data-wheel]")) pick(kind, e.target.value); });
  w.body.addEventListener("input", (e) => { const p = e.target.dataset.pal; if (!p) return; if (p === "rot") palRot = +e.target.value || 0; if (p === "scale") { palScale = +e.target.value || 1; w.body.querySelector("[data-scale]").value = palScale; } if (p === "rrot") palRandomRot = e.target.checked; if (p === "rscale") palRandomScale = e.target.checked; if (p === "flip") palFlip = e.target.checked; });
  w.el.addEventListener("pointerdown", () => activate(kind));   // touching a window makes it the one you draw with
  w.el.addEventListener("fwin-close", () => {
    if (bt.kind === kind) { const next = Object.keys(kw).find((k) => k !== kind && kw[k].visible()); if (next) bt.kind = next; }
    applyPal();
  });
  return w;
}
function openKind(kind) { toolsWin().show(); bt.kind = kind; bt.any = false; if (bt.mode === "select") bt.mode = "shape"; if (!KP[kind].noSwatch) kindWin(kind).show(); applyPal(); }
function openErase() { toolsWin().show(); bt.mode = "erase"; bt.any = true; applyPal(); }
const hideSub = () => { const s = $("#addsub"); if (s) s.hidden = true; $("#addmenu").querySelector(".open")?.classList.remove("open"); };
// Drop the menu down from the Build item in the menu bar.
function placeMenu() {
  const m = $("#addmenu"), b = $("#add").getBoundingClientRect(), r = m.getBoundingClientRect();
  m.style.left = Math.max(0, Math.min(innerWidth - r.width, b.left)) + "px"; m.style.top = b.bottom + "px";
}
export function setTool(type, floor, keepPal) {
  S.tool = null; S.placing = null; drag = null; curMat = ""; curMode = ""; eraseOnly = ""; $("#preview").textContent = "";
  if (type?.startsWith("obj:")) S.placing = type.slice(4); else S.tool = type;
  if (floor) { curMat = floor.mat || ""; curMode = floor.mode || ""; eraseOnly = floor.eraseOnly || ""; }
  $("#addmenu").hidden = true; hideSub(); if (type !== "token") tokWin?.hide(); renderToolbar(); renderPanel();
  syncPalette();
}
export function renderToolbar() {   // the top strip is gone: the Build Tools windows say what is active
  const t = S.placing ? "obj:" + S.placing : S.tool;
  $("#add").classList.toggle("on", !!t);
  $("#toolbar").hidden = true;
  if (t === "token") renderTokenWin();   // Token lives in its own floating window
}
export function initTools() {
  if (!S.isGM) return;
  $("#add").hidden = false;
  $("#add").addEventListener("click", (e) => { e.stopPropagation(); const m = $("#addmenu"); if (m.hidden) showMenu(); else { m.hidden = true; hideSub(); } });
  const choose = (e) => {
    e.stopPropagation();
    const c = e.target.closest("[data-choose]"); if (!c) return;
    if (c.dataset.choose === "puzzle") { setTool(null); return $("#mode").click(); }
    const ch = c.dataset.choose;
    if (ch === "object") return showSub(c);
    if (ch === "erase") return openErase();
    if (ch === "token") {   // opens blank each time: no dropdown pick, empty name and HP
      if (tokWin) { tokWin.body.querySelector('[data-o="npc"]').value = ""; tokWin.body.querySelector('[data-o="name"]').value = ""; tokWin.body.querySelector('[data-o="hp"]').value = ""; }
      return setTool("token");
    }
    $("#addmenu").hidden = true; hideSub();
    const pk = ch.startsWith("obj:") ? ch.slice(4) : ch;
    if (KP[pk]) openKind(pk); else setTool(ch);   // other puzzle objects: plain place tool
  };
  $("#addmenu").addEventListener("click", choose);
  document.addEventListener("click", (e) => { if (e.target.closest("#addsub")) choose(e); });
  $("#addmenu").addEventListener("mouseover", (e) => { const c = e.target.closest("[data-choose]"); if (!c) return; if (c.dataset.choose === "object") showSub(c); else hideSub(); });
  document.addEventListener("click", (e) => { if (!e.target.closest("#addmenu, #addsub, #add")) { $("#addmenu").hidden = true; hideSub(); } });
  document.addEventListener("keydown", (e) => { if (e.key.toLowerCase() === "r" && (S.placing || S.tool === "prop")) { palRot = (palRot + 90) % 360; const r=btWin?.body.querySelector('[data-pal="rot"]'); if(r)r.value=palRot; return; } if (e.key === "Escape" && (S.tool || S.placing)) setTool(null); });
  document.addEventListener("toolchange", renderToolbar);
}

// ---- placing ----------------------------------------------------------------
function placeToken(c) {
  const [kind, ref] = (opt("npc")?.value || "").split(":"), cur = (pcList || []).find((x) => x.id === ref)?.cur, npc = kind === "npc" ? ref : "", pc = kind === "pc" ? ref : "", name = opt("name")?.value.trim(), hp = parseInt(opt("hp")?.value, 10), color = opt("color")?.value;
  const used = new Set(Object.entries(S.tokens).map(([id, t]) => t.label || id));
  const label = name || [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].find((l) => !used.has(l)) || "?";
  put(`tokens/${uid("t")}`, { x: c.x, y: c.y, lv: S.level ?? 0, label, ...(npc ? { npc } : {}), ...(pc ? { pc } : {}), ...(color ? { color } : {}), ...(hp > 0 ? { hp: pc && cur != null ? Math.min(cur, hp) : hp, max: hp } : {}) });
}
function placeObject(kind, p) {
  const snap = snapFor(kind, p), n = Object.values(S.objects).filter((o) => o.kind === kind).length + 1;
  const extra = kind === "dial" ? { values: ["N", "E", "S", "W"] } : kind === "gauge" ? { token: Object.keys(S.tokens).find((k) => S.tokens[k].hp != null) }
    : kind === "tripwire" ? { len: 3, dir: "h" } : kind === "spawn" ? { hp: 5 } : kind === "door" ? { dir: snap.dir, doorKind: curMode === "window" ? "window" : "wood", ...(curMode === "window" ? { win: true } : {}), ...(matOf() ? { mat: matOf() } : {}) }
    : kind === "light" ? { radius: Math.max(1, +opt("radius")?.value || 3) * 40, color: opt("color")?.value || palColor, fog: Math.max(0, +(opt("fog")?.value ?? 2)) } : {};
  put(`objects/${kind}${Date.now().toString(36)}`, { ...newObject(kind, snap.x, snap.y, n, extra), lv: S.level ?? 0 });
}
const distToSeg = (p, a) => {
  const dx = a.x2 - a.x1, dy = a.y2 - a.y1, l = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x1) * dx + (p.y - a.y1) * dy) / l));
  return Math.hypot(p.x - (a.x1 + t * dx), p.y - (a.y1 + t * dy));
};
const inRect = (p, a) => p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h;
const onLevel = (a) => (a.lv ?? 0) === (S.level ?? S.map.level ?? 0);
export function fogAt(p) { return Object.entries(S.map.fog || {}).find(([, a]) => onLevel(a) && inRect(p, a))?.[0]; }
export function roofAt(p) { return Object.entries(S.map.roofs).find(([, a]) => onLevel(a) && inRect(p, a))?.[0]; }
function erase(e, p) {
  const hit = (sel) => e.target.closest(sel)?.dataset.id;
  let id;
  if (eraseOnly) {
    const k = eraseOnly, inMap = (m) => Object.entries(S.map[m] || {}).find(([, a]) => inRect(p, a))?.[0];
    if (k === "token" || k === "prop") { if ((id = hit("." + k))) put(`${k === "token" ? "tokens" : "map/props"}/${id}`, null); }
    else if (k.startsWith("obj:")) { if ((id = hit(".obj")) && S.objects[id]?.kind === k.slice(4)) put(`objects/${id}`, null); }
    else if (k === "wall") { const w = Object.entries(S.map.walls).find(([, a]) => distToSeg(p, a) < 9); if (w) put(`map/walls/${w[0]}`, null); }
    else if ((id = inMap(k === "floor" ? "floors" : k === "fog" ? "fog" : "roofs"))) put(`map/${k === "floor" ? "floors" : k === "fog" ? "fog" : "roofs"}/${id}`, null);
    return;
  }
  if ((id = hit(".token"))) return put(`tokens/${id}`, null);
  if ((id = hit(".obj"))) return put(`objects/${id}`, null);
  if ((id = hit(".prop"))) return put(`map/props/${id}`, null);
  const w = Object.entries(S.map.walls).find(([, a]) => distToSeg(p, a) < 9); if (w) return put(`map/walls/${w[0]}`, null);
  if ((id = fogAt(p))) return put(`map/fog/${id}`, null);
  if ((id = roofAt(p))) return put(`map/roofs/${id}`, null);
  const f = Object.entries(S.map.floors).find(([, a]) => inRect(p, a)); if (f) put(`map/floors/${f[0]}`, null);
}

// ---- pointer handling (called from vtt.js; return true when the event was used) ----
export function toolDown(e, p) {
  if (!S.isGM) return false;
  if (S.placing) { placeObject(S.placing, p); return true; }
  const t = S.tool;
  if (!t) {   // no tool: GM can drag props around
    const el_ = e.target.closest(".prop"); if (!el_ || S.puzzleMode && e.target.closest(".obj")) return false;
    drag = { type: "propmove", id: el_.dataset.id, el: el_, x0: p.x, y0: p.y, moved: false };
    $("#map").setPointerCapture(e.pointerId); return true;
  }
  if ((t === "floor" || t === "fog") && curMode === "bucket") bucketFill(t, p);
  else if ((t === "floor" || t === "fog") && curMode === "brush") { const c = cellOf(p); drag = { type: "brush", kind: t, cells: new Map([[c.x + "," + c.y, c]]) }; $("#map").setPointerCapture(e.pointerId); preview(); }
  else if (t === "token") placeToken(cellOf(p));
  else if (t === "prop") { const c = cellOf(p), rot = palRandomRot ? Math.floor(Math.random() * 4) * 90 : palRot, s = palRandomScale ? .5 + Math.random() * 1.5 : palScale; put(`map/props/${uid("p")}`, { kind: opt("prop")?.value || palProp, x: c.x, y: c.y, lv: S.level ?? 0, rot, s, ...(palFlip ? { flip: true } : {}) }); }
  else if (t === "erase") erase(e, p);
  else if (t === "wall") { const v = vertex(p); drag = { type: "wall", a: v, b: v }; $("#map").setPointerCapture(e.pointerId); preview(); }
  else if (t === "floor" || t === "roof" || t === "fog") { const c = cellOf(p); drag = { type: t, a: c, b: c }; $("#map").setPointerCapture(e.pointerId); preview(); }
  return true;
}
// Paint bucket: flood-fill the cells reachable from the click without crossing a wall or door, as row-run rectangles.
function bucketFill(type, p) {
  const { cols: COLS, rows: ROWS } = mapSize(), c0 = cellOf(p), start = [(c0.x - 20) / 40, (c0.y - 20) / 40];
  const walls = Object.values(S.map.walls || {}), doors = Object.values(S.objects).filter((o) => o.kind === "door");
  const vWall = (X, y0) => walls.some((w) => w.x1 === X && w.x2 === X && Math.min(w.y1, w.y2) <= y0 && Math.max(w.y1, w.y2) >= y0 + 40) || doors.some((d) => d.dir === "v" && d.x === X && d.y === y0 + 20);
  const hWall = (Y, x0) => walls.some((w) => w.y1 === Y && w.y2 === Y && Math.min(w.x1, w.x2) <= x0 && Math.max(w.x1, w.x2) >= x0 + 40) || doors.some((d) => d.dir === "h" && d.y === Y && d.x === x0 + 20);
  const seen = new Set([start.join()]), q = [start];
  while (q.length) {
    const [cx, cy] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || seen.has(nx + "," + ny)) continue;
      const blocked = dx ? vWall(40 * (dx > 0 ? cx + 1 : cx), 40 * cy) : hWall(40 * (dy > 0 ? cy + 1 : cy), 40 * cx);
      if (!blocked) { seen.add(nx + "," + ny); q.push([nx, ny]); }
    }
  }
  const changes = {}, base = type === "fog" ? "map/fog" : "map/floors"; let n = 0;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!seen.has(x + "," + y) || (x && seen.has(x - 1 + "," + y))) continue;
    let w = 1; while (seen.has(x + w + "," + y)) w++;
    changes[`${base}/${uid(type[0])}${n++}`] = { x: x * 40, y: y * 40, w: w * 40, h: 40, ...(type === "fog" ? { open: false } : matOf() ? { mat: matOf() } : {}) };
  }
  patch(changes);
}
function rectOf(d) {
  const x0 = Math.min(d.a.x, d.b.x) - 20, y0 = Math.min(d.a.y, d.b.y) - 20, x1 = Math.max(d.a.x, d.b.x) + 20, y1 = Math.max(d.a.y, d.b.y) + 20;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function preview() {
  const l = $("#preview"); l.textContent = ""; if (!drag || drag.type === "propmove") return;
  if (drag.type === "brush") for (const c of drag.cells.values()) el("rect", { x: c.x - 20, y: c.y - 20, width: 40, height: 40, class: `ghost ${drag.kind}ghost` }, l);
  else if (drag.type === "wall") el("line", { x1: drag.a.x, y1: drag.a.y, x2: drag.b.x, y2: drag.b.y, class: "wall ghost" }, l);
  else { const r = rectOf(drag); el("rect", { x: r.x, y: r.y, width: r.w, height: r.h, class: `ghost ${drag.type}ghost` }, l); }
}
export function toolMove(e, p) {
  if (!drag) return false;
  if (drag.type === "propmove") {
    if (Math.hypot(p.x - drag.x0, p.y - drag.y0) > 6) drag.moved = true;
    if (drag.moved) { const c = cellOf(p), a = S.map.props[drag.id]; drag.to = c; drag.el.setAttribute("transform", `translate(${c.x - a.x} ${c.y - a.y})`); }
    return true;
  }
  if (drag.type === "brush") { const c = cellOf(p); drag.cells.set(c.x + "," + c.y, c); preview(); return true; }
  drag.b = drag.type === "wall" ? vertex(p) : cellOf(p); preview(); return true;
}
export function toolUp() {
  if (!drag) return false;
  const d = drag; drag = null; $("#preview").textContent = "";
  if (d.type === "propmove") { if (d.moved && d.to) patch({ [`map/props/${d.id}/x`]: d.to.x, [`map/props/${d.id}/y`]: d.to.y }); return true; }
  if (d.type === "wall") { if (d.a.x !== d.b.x || d.a.y !== d.b.y) put(`map/walls/${uid("w")}`, { x1: d.a.x, y1: d.a.y, x2: d.b.x, y2: d.b.y, ...(matOf() ? { mat: matOf() } : {}) }); return true; }
  if (d.type === "brush") { const fog = d.kind === "fog", base = fog ? "map/fog" : "map/floors", have = new Set(Object.values((fog ? S.map.fog : S.map.floors) || {}).filter((f) => f.w === 40 && f.h === 40 && (fog || (f.mat || "") === matOf())).map((f) => f.x + "," + f.y)); const ch = {}; let n = 0; for (const c of d.cells.values()) if (!have.has(c.x - 20 + "," + (c.y - 20))) ch[`${base}/${uid("f")}${n++}`] = { x: c.x - 20, y: c.y - 20, w: 40, h: 40, ...(fog ? { open: false } : matOf() ? { mat: matOf() } : {}) }; if (n) patch(ch); return true; }
  const r = rectOf(d);
  if (d.type === "roof") put(`map/roofs/${uid("r")}`, { ...r, open: false, lv: S.level ?? 0, ...(matOf() ? { mat: matOf() } : {}) });
  else if (d.type === "fog") put(`map/fog/${uid("g")}`, { ...r, open: false, lv: S.level ?? 0 });
  else {
    put(`map/floors/${uid("f")}`, { ...r, lv: S.level ?? 0, ...(matOf() ? { mat: matOf() } : {}) });
    if (curMode === "shape" && wallsAround) [[r.x, r.y, r.x + r.w, r.y], [r.x + r.w, r.y, r.x + r.w, r.y + r.h], [r.x + r.w, r.y + r.h, r.x, r.y + r.h], [r.x, r.y + r.h, r.x, r.y]]
      .forEach(([x1, y1, x2, y2]) => put(`map/walls/${uid("w")}`, { x1, y1, x2, y2 }));
  }
  return true;
}

// ---- right-click settings -----------------------------------------------------
// Returns { title, fields } for whatever sits at a right-click; each field writes straight to the database.
const matOpts = (list) => [["", "default"], ...list.map((m) => [m, m])];
export function wallAt(p) { return Object.entries(S.map.walls || {}).find(([, a]) => onLevel(a) && distToSeg(p, a) < 9)?.[0]; }
export function floorAt(p) { return Object.entries(S.map.floors || {}).find(([, a]) => onLevel(a) && inRect(p, a))?.[0]; }
export function settingsFor(type, id) {
  const F = (label, path, value, o = {}) => ({ label, path, value, ...o });
  if (type === "wall") return { title: "Wall", fields: [F("Material", `map/walls/${id}/mat`, S.map.walls[id].mat || "", { opts: matOpts(WALL_MATS) })] };
  if (type === "floor") return { title: "Floor", fields: [F("Material", `map/floors/${id}/mat`, S.map.floors[id].mat || "", { opts: matOpts(FLOOR_MATS) }), F("Height", `map/floors/${id}/elev`, S.map.floors[id].elev || 0, { type: "number" })] };
  if (type === "label") { const a = S.map.labels[id]; return { title: "Label", fields: [F("Text", `map/labels/${id}/text`, a.text || "", { type: "text" }), F("Size", `map/labels/${id}/size`, a.size || 1, { type: "number", min: .25, max: 10 }), F("Rotation", `map/labels/${id}/rot`, a.rot || 0, { type: "number" })] }; }
  if (type === "prop") { const p = S.map.props[id]; return { title: "Prop", fields: [F("Kind", `map/props/${id}/kind`, p.kind, { opts: Object.entries(PROPS) }), F("Rotation", `map/props/${id}/rot`, p.rot || 0, { type: "number" }), F("Scale", `map/props/${id}/s`, p.s || 1, { type: "number", min: .1, max: 10 })] }; }
  if (type === "token") { const t = S.tokens[id]; return { title: t.label || id, fields: [F("Name", `tokens/${id}/label`, t.label || "", { type: "text" }),
    F("Colour", `tokens/${id}/color`, t.color || "", { opts: [["", "auto"], ["#a94c3d", "red"], ["#466c83", "blue"], ["#66774b", "green"], ["#7a5a8a", "purple"], ["#c8871c", "gold"]] }),
    F("Picture URL", `tokens/${id}/img`, t.img || "", { type: "text" })] }; }
  const o = S.objects[id], base = `objects/${id}/`, L = F("Name", base + "label", o.label || "", { type: "text" });
  if (o.kind === "light") return { title: o.label || "Light", fields: [L, F("Colour", base + "color", o.color || "#ffb347", { opts: Object.entries(LIGHT_COLORS) }),
    F("Radius (cells)", base + "radius", Math.round((o.radius || 120) / 40), { type: "number", min: 1, max: 12, to: (v) => Math.max(1, v) * 40 }),
    F("Clears fog (cells)", base + "fog", o.fog ?? 2, { type: "number", min: 0, max: 12 })] };
  const f = [L];
  if (o.kind === "door") f.push(F("Kind", base + "doorKind", o.doorKind || (o.win ? "window" : "wood"), { opts: [["wood", "wood"], ["iron", "iron"], ["double", "double"], ["portcullis", "portcullis"], ["bars", "bars"], ["secret", "secret"], ["arch", "arch"], ["curtain", "curtain"], ["window", "window"]] }), F("Material", base + "mat", o.mat || "", { opts: matOpts(WALL_MATS) }), F("Direction", base + "dir", o.dir || "h", { opts: [["h", "horizontal"], ["v", "vertical"]] }));
  if (o.kind === "tripwire") f.push(F("Length", base + "len", o.len || 3, { type: "number", min: 1, max: 10 }), F("Direction", base + "dir", o.dir || "h", { opts: [["h", "across"], ["v", "down"]] }));
  if (o.kind === "plate" || o.kind === "tripwire") f.push(F("Stays down", base + "latch", !!o.latch, { type: "check" }));
  if (o.kind === "sight") f.push(F("Sees", base + "sees", o.sees || "player", { opts: [["player", "players"], ["npc", "NPCs / enemies"]] }), F("Range (cells)", base + "range", o.range || 6, { type: "number", min: 1, max: 30 }), F("Stays triggered", base + "latch", !!o.latch, { type: "check" }));
  if (o.kind === "spawn") f.push(F("Enemy HP", base + "hp", o.hp || 5, { type: "number", min: 1 }));
  return { title: o.label || o.kind, fields: f };
}
