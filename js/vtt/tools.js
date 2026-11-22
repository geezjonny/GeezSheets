// GM map-building tools: the "+" menu, the tool bar, and drag/click handling for each tool.
import { readAt } from "../store.js";
import { put, patch } from "./undo.js";
import { KINDS, newObject } from "../puzzle/index.js";
import { $, S, cellOf, mapSize } from "./state.js";
import { el, PROPS, PROP_CATALOG, drawObjects } from "./draw.js";
import { renderPanel } from "./panel.js";
import { floatWindow } from "./ui.js";
import { generateDungeon } from "./gen.js";
import { segmentDoors } from "./door-segment.js";
import { LIGHT_MATS, LIGHT_DEFAULT, lightSettings, clampIntensity, lightIntensity } from "./light-types.js";
import { recentTokenRefs, tokenInitials } from "./token-palette.js";

const MENU = [["token", "Token"], ["wall", "Wall"], ["door", "Door"], ["floor", "Floor"], ["roof", "Roof"], ["fog", "Fog"], ["light", "Light"], ["object", "Object"], ["prop", "Prop"], ["label", "Label"], ["generator", "Generate dungeon"], ["puzzle", "Puzzle"]];
const HINT = {
  token: "Click a cell to drop a token.", wall: "Drag to draw a wall (snaps to the grid).", floor: "Drag to paint a floor area.",
  fog: "Drag to fog a room (snaps to cells). Right-click fog to reveal it to players.", roof: "Drag to cover an area with a roof. Right-click a roof to lift it.", prop: "Click a cell to place it. Drag props to move them.",
  erase: "Click anything to delete it.", label: "Click a cell to place a map label.", "obj:door": "Click or drag from one point to another to place doors.", "obj:light": "Click a cell to place a light.",
};
export const WALL_MATS = ["stone", "ashlar", "marble", "brick", "fieldstone", "plaster", "timber", "wood", "palisade", "cave", "hedge", "earth", "cobble", "iron"];
export const FLOOR_MATS = ["stone", "slab", "cobble", "marble", "tile", "wood", "carpet", "dirt", "cave", "sand", "grass", "snow", "water", "mud", "shallow", "ice", "lava", "swamp", "bone", "void", "gravel", "moss", "iron"];
export const LIGHT_COLORS = Object.fromEntries(LIGHT_MATS.map((m) => [m.color, m.label]));
const matSel = (list) => `<select data-o="mat"><option value="">default</option>${list.map((m) => `<option value="${m}">${m}</option>`).join("")}</select>`;
let wallsAround = true;   // the Floors window's "Draw walls around it" box
let curMat = "", curMode = "", eraseOnly = "";   // floor flyout choices: material, shape/brush/bucket, floor-only erase
const matOf = () => opt("mat")?.value || curMat;
const FLOOR_ACTS = [["select", "Select"], ["erase", "Erase"], ["shape", "Shape"], ["brush", "Paint brush"], ["bucket", "Paint bucket"]];
export const ROOF_MATS = ["thatch", "slate", "tile", "flat", "wood", "stone"];
const FLOOR_COL = { thatch: "#c9a85c", slate: "#59636e", tile: "#b5532f", flat: "#77736c", wood: "#b88a52", stone: "#b5b2a8", slab: "#aaa69d", cobble: "#8f8a80", marble: "#d7d8d2", carpet: "#9a5364", dirt: "#856a4c", cave: "#635d61", iron: "#6f7882", gravel: "#a39a88", sand: "#e0cb8f", grass: "#8fae6a", snow: "#eef5f5", water: "#6aa3c2", mud: "#7a5f43", shallow: "#83b8c4", ice: "#cfe8f0", lava: "#d64b2f", swamp: "#64734b", bone: "#d8ceb0", void: "#252433", moss: "#718454", ashlar: "#9b9890", brick: "#9c5547", fieldstone: "#817c75", plaster: "#c8bca4", timber: "#80552e", palisade: "#69462c", hedge: "#50713f", earth: "#795b3f" };
const uid = (p) => p + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
const vertex = (p) => { const { cols, rows } = mapSize(); return { x: Math.max(0, Math.min(cols * 40, Math.round(p.x / 40) * 40)), y: Math.max(0, Math.min(rows * 40, Math.round(p.y / 40) * 40)) }; };
const opt = (k) => $(`#toolbar [data-o="${k}"]`) || tokWin?.body.querySelector(`[data-o="${k}"]`) || kw.light?.body.querySelector(`[data-o="${k}"]`);
// Build > Token: a floating window (like the floor/prop palettes) with a PC / NPC dropdown; then click the map to drop it.
let tokWin = null;
let genWin = null;
function openGenerator() {
  if (!genWin) {
    genWin = floatWindow({ id: "dungeon-generator", title: "Generate dungeon", x: 260, y: 120, hidden: true });
    genWin.body.innerHTML = `<form class="dungeon-gen"><label>Width <input name="width" type="number" min="8" max="200" value="20"></label><label>Height <input name="height" type="number" min="8" max="200" value="14"></label><label>Rooms <input name="roomCount" type="number" min="1" max="40" value="6"></label><label>Seed <input name="seed" value="1"></label><label>Corridors <select name="corridorStyle"><option value="random">Random L turns</option><option value="horizontal">Horizontal first</option><option value="vertical">Vertical first</option></select></label><label><input name="addDoors" type="checkbox" checked> Add doors</label><div class="dungeon-gen-actions"><button type="button" data-gen="add">Add to current map</button><button type="button" data-gen="replace">Replace map</button></div></form>`;
    genWin.body.addEventListener("click", (e) => { const b = e.target.closest("[data-gen]"); if (!b) return; e.preventDefault(); applyDungeon(genWin.body, b.dataset.gen === "replace"); });
  }
  genWin.show();
}
function applyDungeon(body, replace) {
  const form = new FormData(body.querySelector("form")), d = generateDungeon({ width: form.get("width"), height: form.get("height"), roomCount: form.get("roomCount"), seed: form.get("seed"), corridorStyle: form.get("corridorStyle") });
  const occupied = Object.values(S.map.floors || {}).length || Object.values(S.map.walls || {}).length || Object.values(S.objects || {}).some((o) => o.kind === "door");
  if (replace && occupied && !confirm("Replace the existing floors, walls, and doors?")) return;
  const stamp = `gen${Date.now().toString(36)}`, changes = { "map/size": { cols: Math.max(mapSize().cols, d.width), rows: Math.max(mapSize().rows, d.height) } };
  if (replace) { Object.keys(S.map.floors || {}).forEach((id) => { changes[`map/floors/${id}`] = null; }); Object.keys(S.map.walls || {}).forEach((id) => { changes[`map/walls/${id}`] = null; }); Object.entries(S.objects || {}).filter(([, o]) => o.kind === "door").forEach(([id]) => { changes[`objects/${id}`] = null; }); }
  Object.entries(d.floors).forEach(([id, v]) => { changes[`map/floors/${stamp}-${id}`] = { ...v, lv: S.level ?? 0 }; });
  Object.entries(d.walls).forEach(([id, v]) => { changes[`map/walls/${stamp}-${id}`] = { ...v, lv: S.level ?? 0 }; });
  if (form.get("addDoors") === "on") Object.entries(d.doors).forEach(([id, v]) => { changes[`objects/${stamp}-${id}`] = { ...v, lv: S.level ?? 0 }; });
  patch(changes); genWin.hide();
}
function renderTokenWin() {
  if (!tokWin) {
    tokWin = floatWindow({ id: "token-place", title: "Token", x: 20, y: 120, hidden: true });
    tokWin.body.className += " palkind token-palette";
    tokWin.body.innerHTML = `<div class="tok-recent" data-token-recent></div><select data-o="npc" data-token-more aria-label="More tokens"></select>
      <div class="tok-fields"><label>Name <input data-o="name" type="text" placeholder="auto"></label><label>HP <input data-o="hp" type="number" min="0" placeholder="blank = PC" title="Leave blank for a player token"></label>
      <label>Colour <input data-o="color" type="color" value="#c8871c"></label><label>Picture <input data-o="img" type="url" placeholder="image URL"></label></div>
      <div class="tok-hint">Click a cell on the map to drop it.</div></div>`;
    tokWin.body.addEventListener("change", (e) => {   // picking a PC / NPC fills in its name and HP
      if (e.target.dataset.o === "npc") selectToken(e.target.value);
    });
    tokWin.body.addEventListener("click", (e) => { const b = e.target.closest("[data-token-ref]"); if (b) selectToken(b.dataset.tokenRef); });
    tokWin.el.addEventListener("fwin-close", () => { if (S.tool === "token") setTool(null); });
  }
  const sel = tokWin.body.querySelector('[data-o="npc"]'), keep = sel.value;
  const all = [...(pcList || []).map((n) => ({ ...n, kind: "pc" })), ...(npcs || []).map((n) => ({ ...n, kind: n.enemy ? "enemy" : "npc" }))];
  sel.innerHTML = `<option value="">Custom / blank NPC</option>${["pc", "npc", "enemy"].map((kind) => { const list = all.filter((n) => n.kind === kind); return list.length ? `<optgroup label="${kind === "pc" ? "PCs" : kind === "npc" ? "NPCs" : "Enemies"}">${list.map((n) => `<option value="${kind}:${n.id}">${n.name}${n.campaign ? ` (${n.campaign})` : ""}</option>`).join("")}</optgroup>` : ""; }).join("")}`;
  sel.value = keep; if (sel.value !== keep) sel.value = "";
  renderTokenRecents(all);
  tokWin.show(); loadNpcs(); loadPcs();
}
function selectToken(value) {
  const [kind, id] = value.split(":"), n = (kind === "pc" ? pcList || [] : npcs || []).find((x) => x.id === id);
  opt("npc").value = value; opt("name").value = n ? n.name : ""; opt("hp").value = n && n.hp > 0 ? n.hp : "";
  opt("color").value = "#c8871c"; opt("img").value = "";
  if (n) { rememberToken(value); renderTokenRecents([...((pcList || []).map((x) => ({ ...x, kind: "pc" }))), ...((npcs || []).map((x) => ({ ...x, kind: x.enemy ? "enemy" : "npc" })))]); }
}
function renderTokenRecents(all) {
  const box = tokWin?.body.querySelector("[data-token-recent]"); if (!box) return;
  let refs = []; try { refs = recentTokenRefs(JSON.parse(localStorage.getItem("vtt-recent-tokens") || "[]"), all); } catch { /* first run */ }
  box.innerHTML = refs.map((ref) => { const n = all.find((x) => `${x.kind}:${x.id}` === ref); return n ? `<button type="button" class="swatch token-swatch" data-token-ref="${ref}" title="${n.name}">${n.img ? `<img src="${n.img}" alt="">` : tokenInitials(n.name)}</button>` : ""; }).join("");
}
function rememberToken(ref) { try { const old = JSON.parse(localStorage.getItem("vtt-recent-tokens") || "[]"); localStorage.setItem("vtt-recent-tokens", JSON.stringify([ref, ...old.filter((x) => x !== ref)].slice(0, 5))); } catch { /* private mode */ } }
let npcs = null;   // NPCs from the main app (read only): [{ id, name, hp, campaign }]
async function loadNpcs() {
  if (npcs) return; npcs = [];
  try {
    const all = (await readAt("characters/npcs")) || {};
    npcs = Object.entries(all).map(([id, n]) => ({ id, name: n.name || id, hp: n.combat?.hp_max || 0, campaign: n.campaign || "", img: n.img || n.picture || n.portrait || "", enemy: n.enemy || n.kind === "enemy" || n.type === "enemy" }))
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
      .map(([id, c]) => ({ id, name: c.name || c.identity?.name || c.basic?.name || "", campaign: c.campaign || "", hp: c.combat?.hp_max || 0, cur: c.combat?.hp_current, img: c.img || c.picture || c.portrait || c.basic?.picture || "" })).filter((c) => c.name)
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
// Build Tools: a "Build Tools" window (Select / Erase / Shape / Paint brush / Paint bucket) plus one small window per kind (Floors,
// Walls, Doors, Roofs, Lights, Props): its 5 most recently used swatches as icons, and under them a dropdown with the rest.
// The tool says HOW you act, the window you last touched says WHAT: pick Stone in Floors, Shape, drag a room; touch Walls and the
// same Shape tool draws a wall. Any Build item opens them; they stay until you close them with the x.
const KP = {
  floor: { key: "floor", label: "Floors", mats: FLOOR_MATS, paint: true }, wall: { key: "wall", label: "Walls", mats: WALL_MATS, fixed: "line" },
  door: { key: "obj:door", label: "Doors", mats: WALL_MATS, fixed: "place", door: true }, roof: { key: "roof", label: "Roofs", mats: ROOF_MATS },
  light: { key: "obj:light", label: "Lights", mats: LIGHT_MATS, fixed: "place" }, object: { key: "obj:", label: "Objects", fixed: "place", object: true }, prop: { key: "prop", label: "Props", props: true, fixed: "place" },
  fog: { key: "fog", label: "Fog", paint: true }, label: { key: "label", label: "Labels", fixed: "place" },
};
const MODE_ICONS = {   // line icons, drawn in the button's text colour
  select: "<path d='M6 3l12 9-5.5 1.2L15 19l-2.6 1-2.4-5.6L6 18z'/>",
  erase: "<path d='M15.5 4.5l5 5-9.5 10H6.5l-3-3z'/><path d='M8 11l6 6M10 20h11'/>",
  shape: "<rect x='4' y='6' width='16' height='12' rx='1.5'/>",
  brush: "<path d='M20 3.5c-5.5 3-9 6.5-10.5 10.5l2.5 2.5c4-1.5 7.5-5 10.5-10.5z'/><path d='M9.5 14C6.5 14 5.5 16 5.5 18c0 1.2-.8 2.2-2 2.5 4 .8 8-.3 8-4.5z'/>",
  bucket: "<path d='M4.5 11.5l7-7 7 7-6 6a2.1 2.1 0 01-3 0z'/><path d='M4.5 11.5h14'/><path d='M20.5 14c1.2 1.8 1.8 2.8 1.8 3.8a1.8 1.8 0 01-3.6 0c0-1 .6-2 1.8-3.8z'/>",
};
const MODES = [["select", "Select"], ["erase", "Erase"], ["shape", "Shape"], ["brush", "Paint brush"], ["bucket", "Paint bucket"]];
let palObj = "plate", palProp = "crate", palLight = LIGHT_DEFAULT.id, palRot = 0, palScale = 1, palRandomRot = false, palRandomScale = false, palFlip = false;
let fogMode = "cover", labelEdit = null;
const labelSettings = { text: "", size: 1, color: "#3d2632" };
let labelRecent = [];
try { labelRecent = JSON.parse(localStorage.getItem("vtt-recent-labels") || "[]"); } catch { /* first run */ }
const lightValues = Object.fromEntries(LIGHT_MATS.map((m) => [m.id, lightSettings(m)]));
const bt = { mode: "shape", kind: "floor", any: false, mats: {}, window: false };   // any = the menu's Erase (erases every kind)
const SEED = { floor: ["default", "stone", "wood", "grass", "water"], wall: ["default", "stone", "brick", "wood", "plaster"], door: ["default", "wood", "iron", "stone", "brick"], roof: ["default", "thatch", "slate", "tile", "wood"], light: LIGHT_MATS.slice(0, 5).map((m) => m.id), prop: ["crate", "table", "chair", "barrel", "chest"], object: ["plate", "switch", "spawn", "tripwire", "dial"], fog: [] };
const OBJ_KINDS = Object.entries(KINDS).filter(([k]) => k !== "door" && k !== "light");
const OBJ_GLYPH = { plate: "▣", tripwire: "┅", sight: "◉", gauge: "♥", switch: "⏻", dial: "◔", floor: "▦", spawn: "☠", stone: "●", catapult: "➶", initiative: "⚔" };
const keyOf = (k) => (KP[k].object ? "obj:" + palObj : KP[k].key);
let recent = SEED;
try { const r = JSON.parse(localStorage.getItem("vtt-recent-swatches") || "null"); if (r) recent = { ...SEED, ...r }; } catch { /* first run */ }
let btWin = null; const kw = {};
const remember = (kind, v) => { recent[kind] = [v, ...(recent[kind] || []).filter((x) => x !== v)].slice(0, 5); try { localStorage.setItem("vtt-recent-swatches", JSON.stringify(recent)); } catch { /* private mode */ } };
const current = (k) => KP[k].object ? palObj : KP[k].props ? palProp : k === "light" ? palLight : bt.mats[k] || "default";
const propGlyph = (k) => { const s = PROP_CATALOG[k]?.shape || "mark"; return s === "rect" ? "<rect x='4' y='8' width='24' height='16' rx='3'/><path d='M7 11l18 10'/>" : s === "round" ? "<circle cx='16' cy='16' r='11'/><circle cx='16' cy='16' r='5' fill='none'/>" : s === "leaf" ? "<circle cx='10' cy='17' r='8'/><circle cx='22' cy='13' r='8'/><circle cx='16' cy='16' r='2'/>" : s === "rock" ? "<path d='M3 23l5-15 14-3 7 14-10 5z'/>" : "<circle cx='16' cy='16' r='9'/><path d='M4 16h24M16 4v24'/>"; };
const chipHTML = (k, v) => KP[k].object ? `<button type="button" class="swatch ico" data-v="${v}" title="${KINDS[v]?.label || v}">${OBJ_GLYPH[v] || "?"}</button>`
  : KP[k].props ? `<button type="button" class="swatch ico" data-v="${v}" title="${PROPS[v] || v}"><svg viewBox="0 0 32 32" aria-label="${PROPS[v] || v}">${propGlyph(v)}</svg></button>`
  : k === "light" ? (() => { const m = LIGHT_MATS.find((x) => x.id === v) || LIGHT_DEFAULT; return `<button type="button" class="swatch ico" data-v="${v}" title="${m.label}"><svg viewBox="0 0 32 32" aria-label="${m.label}"><path d="M16 27c-6 0-8-4-6-8 1-2 3-3 3-7 4 3 7 6 7 10 0 3-1 5-4 5z" fill="${m.color}" stroke="currentColor"/></svg></button>`; })()
  : `<button type="button" class="swatch ico" data-v="${v}" title="${v}"><i style="background:${FLOOR_COL[v] || "#d8d0c0"}"></i></button>`;
function optionsHTML(k) {
  const c = KP[k]; let h = `<option value="" selected disabled>more…</option>`;
  if (c.object) h += OBJ_KINDS.map(([id, o]) => `<option value="${id}">${o.label}</option>`).join("");
  else if (c.props) { const g = {}; for (const [id, l] of Object.entries(PROPS)) (g[PROP_CATALOG[id]?.category || "other"] ||= []).push([id, l]); for (const [cat, list] of Object.entries(g)) h += `<optgroup label="${cat}">${list.map(([id, l]) => `<option value="${id}">${l}</option>`).join("")}</optgroup>`; }
  else if (k === "light") h += LIGHT_MATS.map((m) => `<option value="${m.id}">${m.label}</option>`).join("");
  else h += ["default", ...(c.mats || [])].map((m) => `<option value="${m}">${m}</option>`).join("");
  return h;
}
const winHTML = (k) => { const c = KP[k]; return `<div class="bt-recent"></div><select data-more aria-label="More ${c.label}">${optionsHTML(k)}</select>`
  + (c.door ? `<button type="button" class="swatch bt-win" data-win title="Windows never open; sight passes">Window</button>` : "")
  + (c.key === "floor" ? `<label class="bt-walls"><input type="checkbox" data-walls ${wallsAround ? "checked" : ""}> Draw walls around it</label>` : "")
  + (k === "light" ? `<div class="light-values"><label>Radius <input data-o="radius" type="number" min="1" max="12" step="1"></label><label>Fog <input data-o="fog" type="number" min="0" max="12" step="1"></label><label>Intensity <input data-o="intensity" type="range" min="0.2" max="1.5" step="0.05"><output data-intensity></output></label></div>` : "")
  + (k === "fog" ? `<div class="fog-modes"><button type="button" data-fog-mode="reveal">Reveal</button><button type="button" data-fog-mode="cover">Cover</button><button type="button" data-fog-mode="clear">Clear</button></div><div class="fog-actions"><button type="button" data-fog-all="reveal">Clear all</button><button type="button" data-fog-all="cover">Cover all</button></div>` : "")
  + (c.props ? `<div class="prop-options"><label>Rotation <input data-pal="rot" type="number" min="0" max="359" value="${palRot}" style="width:4rem"></label><label><input data-pal="rrot" type="checkbox"> random</label><label>Scale <input data-pal="scale" type="range" min="0.5" max="2" step="0.05" value="${palScale}"></label><output data-scale>${palScale}</output><label><input data-pal="rscale" type="checkbox"> random</label><label><input data-pal="flip" type="checkbox"> Mirror</label></div>` : ""); };
function renderRecent(k) { const box = kw[k]?.body.querySelector(".bt-recent"); if (box) box.innerHTML = (recent[k] || []).map((v) => chipHTML(k, v)).join(""); }
function applyPal() {
  const c = KP[bt.kind];
  if (bt.mode === "select") return setTool(null, null, true);
  if (bt.mode === "erase") return setTool("erase", { eraseOnly: bt.any ? "" : keyOf(bt.kind) }, true);
  const mode = c.fixed || (bt.mode === "brush" || bt.mode === "bucket" ? (c.paint ? bt.mode : "shape") : "shape");
  setTool(keyOf(bt.kind), { mode: c.door && bt.window ? "window" : mode, mat: bt.mats[bt.kind] || "" }, true);
}
function syncPalette() {
  tokWin?.el.classList.toggle("pal-active", S.tool === "token");
  if (!btWin) return;
  const shown = S.tool === "token" ? "" : S.tool || S.placing ? bt.mode : "select", paint = KP[bt.kind].paint;
  btWin.body.querySelectorAll("[data-mode]").forEach((b) => { const off = (b.dataset.mode === "brush" || b.dataset.mode === "bucket") && !paint; b.classList.toggle("on", b.dataset.mode === shown); b.disabled = off; b.classList.toggle("off", off); });
  for (const [k, w] of Object.entries(kw)) {
    w.el.classList.toggle("pal-active", k === bt.kind && !bt.any && shown !== "select" && shown !== "");
    w.body.querySelectorAll("[data-v]").forEach((b) => b.classList.toggle("on", b.dataset.v === current(k)));
    w.body.querySelector("[data-win]")?.classList.toggle("on", bt.window);
    w.body.querySelectorAll("[data-fog-mode]").forEach((b) => b.classList.toggle("on", b.dataset.fogMode === fogMode));
  }
}
function renderLightValues() { const w = kw.light?.body, s = lightValues[palLight] || lightSettings(LIGHT_DEFAULT); if (!w) return; w.querySelector('[data-o="radius"]').value = s.radius; w.querySelector('[data-o="fog"]').value = s.fog; w.querySelector('[data-o="intensity"]').value = s.intensity; w.querySelector("[data-intensity]").value = s.intensity.toFixed(2); }
function pick(kind, v) {
  const c = KP[kind];
  if (c.object) palObj = v; else if (c.props) palProp = v; else if (kind === "light") { palLight = v; lightValues[v] ||= lightSettings(LIGHT_MATS.find((m) => m.id === v)); renderLightValues(); } else bt.mats[kind] = v === "default" ? "" : v;
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
  const c = KP[kind], at = { floor: [190, 90], wall: [370, 90], door: [550, 90], roof: [730, 90], light: [910, 90], prop: [190, 260], object: [370, 260] }[kind] || [190, 90];   // side by side
  const w = kw[kind] = floatWindow({ id: "pal-" + kind, title: c.label, x: at[0], y: at[1], hidden: true }); w.body.className += " palkind";
  w.body.innerHTML = winHTML(kind); renderRecent(kind);
  w.body.addEventListener("click", (e) => {
    const fm = e.target.closest("[data-fog-mode]"); if (fm) { fogMode = fm.dataset.fogMode; syncPalette(); return; }
    const fa = e.target.closest("[data-fog-all]"); if (fa) { const changes = {}; for (const [id, a] of Object.entries(S.map.fog || {})) if ((a.lv ?? 0) === (S.level ?? 0)) changes[`map/fog/${id}`] = fa.dataset.fogAll === "cover" ? { ...a, open: false } : null; return patch(changes); }
    if (e.target.closest("[data-win]")) { bt.window = !bt.window; return pick(kind, current(kind)); }
    const chip = e.target.closest("[data-v]"); if (chip) pick(kind, chip.dataset.v);
  });
  w.body.addEventListener("change", (e) => { if (e.target.matches("[data-walls]")) { wallsAround = e.target.checked; return; } if (e.target.matches("[data-more]") && e.target.value) { pick(kind, e.target.value); e.target.value = ""; } });
  w.body.addEventListener("input", (e) => { const p = e.target.dataset.pal; if (kind === "light" && e.target.dataset.o) { const s = lightValues[palLight]; s[e.target.dataset.o] = e.target.dataset.o === "intensity" ? clampIntensity(e.target.value) : Math.max(e.target.dataset.o === "fog" ? 0 : 1, Math.min(12, Number(e.target.value) || 0)); if (e.target.dataset.o === "intensity") e.target.value = s.intensity, w.body.querySelector("[data-intensity]").value = s.intensity.toFixed(2); return; } if (!p) return; if (p === "rot") palRot = +e.target.value || 0; if (p === "scale") { palScale = +e.target.value || 1; w.body.querySelector("[data-scale]").value = palScale; } if (p === "rrot") palRandomRot = e.target.checked; if (p === "rscale") palRandomScale = e.target.checked; if (p === "flip") palFlip = e.target.checked; });
  if (kind === "light") { w.body.querySelector("[data-more]").value = palLight; renderLightValues(); }
  w.el.addEventListener("pointerdown", () => activate(kind));   // touching a window makes it the one you draw with
  w.el.addEventListener("fwin-close", () => {
    if (bt.kind === kind) { const next = Object.keys(kw).find((k) => k !== kind && kw[k].visible()); if (next) bt.kind = next; }
    applyPal();
  });
  return w;
}
function openKind(kind) { toolsWin().show(); bt.kind = kind; bt.any = false; if (bt.mode === "select") bt.mode = "shape"; if (kind === "label") labelWin().show(); else kindWin(kind).show(); applyPal(); }
function rememberLabel(text) {
  labelRecent = [text, ...labelRecent.filter((x) => x !== text)].slice(0, 5);
  try { localStorage.setItem("vtt-recent-labels", JSON.stringify(labelRecent)); } catch { /* private mode */ }
}
function renderLabelWindow() {
  if (!kw.label) return;
  const b = kw.label.body;
  b.querySelector('[data-label-text]').value = labelSettings.text;
  b.querySelector('[data-label-size]').value = labelSettings.size;
  b.querySelector('[data-label-color]').value = labelSettings.color;
  const list = b.querySelector("[data-label-list]");
  list.innerHTML = Object.entries(S.map.labels || {}).filter(([, a]) => (a.lv ?? 0) === (S.level ?? 0)).map(([id, a]) => `<div class="label-entry"><button type="button" data-label-edit="${id}">${(a.text || "Label").replace(/</g, "&lt;")}</button><button type="button" data-label-delete="${id}" aria-label="Delete">×</button></div>`).join("");
  b.querySelector("[data-label-recent]").innerHTML = labelRecent.map((x) => `<button type="button" data-label-recent-value="${x.replace(/"/g, "&quot;")}">${x.replace(/</g, "&lt;")}</button>`).join("");
}
function labelWin() {
  if (kw.label) return kw.label;
  const w = kw.label = floatWindow({ id: "pal-label", title: "Labels", x: 190, y: 260, hidden: true }); w.body.className += " palkind label-palette";
  w.body.innerHTML = `<label>Text <input data-label-text type="text" placeholder="Label"></label><label>Size <input data-label-size type="number" min=".25" max="10" step=".25" value="1"></label><label>Colour <input data-label-color type="color" value="#3d2632"></label><button type="button" data-label-place>Place new label</button><div class="label-recent" data-label-recent></div><div class="label-list" data-label-list></div>`;
  w.body.addEventListener("input", (e) => { if (e.target.matches("[data-label-text]")) labelSettings.text = e.target.value; if (e.target.matches("[data-label-size]")) labelSettings.size = Math.max(.25, Math.min(10, +e.target.value || 1)); if (e.target.matches("[data-label-color]")) labelSettings.color = e.target.value; });
  w.body.addEventListener("click", (e) => {
    const recentButton = e.target.closest("[data-label-recent-value]"); if (recentButton) { labelSettings.text = recentButton.dataset.labelRecentValue; renderLabelWindow(); return; }
    const edit = e.target.closest("[data-label-edit]"); if (edit) { labelEdit = edit.dataset.labelEdit; const a = S.map.labels[labelEdit]; Object.assign(labelSettings, { text: a.text || "", size: a.size || 1, color: a.color || "#3d2632" }); setTool("label"); renderLabelWindow(); return; }
    const del = e.target.closest("[data-label-delete]"); if (del) { put(`map/labels/${del.dataset.labelDelete}`, null); return; }
    if (e.target.closest("[data-label-place]")) { labelEdit = null; setTool("label"); }
  });
  w.el.addEventListener("pointerdown", () => activate("label")); w.el.addEventListener("fwin-close", () => { if (S.tool === "label") setTool(null); });
  document.addEventListener("vttvisibilitychange", renderLabelWindow); renderLabelWindow(); return w;
}
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
    if (c.dataset.choose === "generator") { $("#addmenu").hidden = true; hideSub(); return openGenerator(); }
    const ch = c.dataset.choose;
    if (ch === "object") { $("#addmenu").hidden = true; hideSub(); return openKind("object"); }
    if (ch === "token") {   // opens blank each time: no dropdown pick, empty name and HP
      if (tokWin) { tokWin.body.querySelector('[data-o="npc"]').value = ""; tokWin.body.querySelector('[data-o="name"]').value = ""; tokWin.body.querySelector('[data-o="hp"]').value = ""; tokWin.body.querySelector('[data-o="color"]').value = "#c8871c"; tokWin.body.querySelector('[data-o="img"]').value = ""; }
      return setTool("token");
    }
    $("#addmenu").hidden = true; hideSub();
    const pk = ch.startsWith("obj:") ? ch.slice(4) : ch;
    if (KP[pk]) openKind(pk); else setTool(ch);   // other puzzle objects: plain place tool
  };
  $("#addmenu").addEventListener("click", choose);
  document.addEventListener("click", (e) => { if (e.target.closest("#addsub")) choose(e); });
  document.addEventListener("click", (e) => { if (!e.target.closest("#addmenu, #addsub, #add")) { $("#addmenu").hidden = true; hideSub(); } });
  document.addEventListener("keydown", (e) => { if (e.key.toLowerCase() === "r" && (S.placing || S.tool === "prop")) { palRot = (palRot + 90) % 360; const r=btWin?.body.querySelector('[data-pal="rot"]'); if(r)r.value=palRot; return; } if (e.key === "Escape" && (S.tool || S.placing)) setTool(null); });
  document.addEventListener("toolchange", renderToolbar);
}

// ---- placing ----------------------------------------------------------------
function placeToken(c) {
  const [kind, ref] = (opt("npc")?.value || "").split(":"), cur = (pcList || []).find((x) => x.id === ref)?.cur, npc = kind === "npc" || kind === "enemy" ? ref : "", pc = kind === "pc" ? ref : "", name = opt("name")?.value.trim(), hp = parseInt(opt("hp")?.value, 10), color = opt("color")?.value, img = opt("img")?.value.trim();
  const used = new Set(Object.entries(S.tokens).map(([id, t]) => t.label || id));
  const label = name || [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].find((l) => !used.has(l)) || "?";
  if (kind && ref) rememberToken(`${kind}:${ref}`);
  put(`tokens/${uid("t")}`, { x: c.x, y: c.y, lv: S.level ?? 0, label, ...(npc ? { npc } : {}), ...(pc ? { pc } : {}), ...(color ? { color } : {}), ...(img ? { img } : {}), ...(hp > 0 ? { hp: pc && cur != null ? Math.min(cur, hp) : hp, max: hp } : {}) });
}
function placeObject(kind, p) {
  const snap = snapFor(kind, p), n = Object.values(S.objects).filter((o) => o.kind === kind).length + 1;
  const extra = kind === "dial" ? { values: ["N", "E", "S", "W"] } : kind === "gauge" ? { token: Object.keys(S.tokens).find((k) => S.tokens[k].hp != null) }
    : kind === "tripwire" ? { len: 3, dir: "h" } : kind === "spawn" ? { hp: 5 } : kind === "door" ? { dir: snap.dir, doorKind: curMode === "window" ? "window" : "wood", ...(curMode === "window" ? { win: true } : {}), ...(matOf() ? { mat: matOf() } : {}) }
    : kind === "light" ? (() => { const m = LIGHT_MATS.find((x) => x.id === palLight) || LIGHT_DEFAULT, s = lightValues[palLight] || lightSettings(m); return { lightType: m.id, radius: s.radius * 40, color: m.color, fog: s.fog, intensity: s.intensity }; })() : {};
  put(`objects/${kind}${Date.now().toString(36)}`, { ...newObject(kind, snap.x, snap.y, n, extra), lv: S.level ?? 0 });
}
function segmentEnd(a, p) {
  const v = vertex(p), s = segmentDoors(a, v);
  return { x: s.x2, y: s.y2 };
}
function beginSegment(type, e, p) {
  if (drag?.type === type && drag.pending) {
    drag.pending = false; drag.b = segmentEnd(drag.a, p); drag.moved = drag.a.x !== drag.b.x || drag.a.y !== drag.b.y;
  } else {
    const a = vertex(p); drag = { type, a, b: a, pending: true, moved: false };
  }
  $("#map").setPointerCapture(e.pointerId); preview();
}
function placeDoors(d) {
  const segment = segmentDoors(d.a, d.b), cells = segment.cells;
  if (!cells.length) return;
  const doors = Object.entries(S.objects).filter(([, o]) => o.kind === "door" && (o.lv ?? 0) === (S.level ?? 0));
  const byEdge = new Map(doors.map(([id, o]) => [`${o.x},${o.y},${o.dir}`, [id, o] ]));
  const n = Object.values(S.objects).filter((o) => o.kind === "door").length;
  const extra = curMode === "window" ? { dir: segment.dir, doorKind: "window", win: true, mat: matOf() || "" } : { dir: segment.dir, doorKind: "wood", win: false, mat: matOf() || "" };
  const changes = {};
  cells.forEach((cell, i) => {
    const old = byEdge.get(`${cell.x},${cell.y},${cell.dir}`), id = old?.[0] || `do${Date.now().toString(36)}${i}`;
    changes[`objects/${id}`] = { ...(old?.[1] || newObject("door", cell.x, cell.y, n + i + 1)), x: cell.x, y: cell.y, sx: cell.x, sy: cell.y, ...extra, lv: S.level ?? 0 };
  });
  patch(changes);
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
  if (S.placing) { if (S.placing === "door") beginSegment("door", e, p); else placeObject(S.placing, p); return true; }
  const t = S.tool;
  if (!t) {   // no tool: GM can drag props around
    const el_ = e.target.closest(".prop"); if (!el_ || S.puzzleMode && e.target.closest(".obj")) return false;
    drag = { type: "propmove", id: el_.dataset.id, el: el_, x0: p.x, y0: p.y, moved: false };
    $("#map").setPointerCapture(e.pointerId); return true;
  }
  if ((t === "floor" || t === "fog") && curMode === "bucket") bucketFill(t, p);
  else if ((t === "floor" || t === "fog") && curMode === "brush") { const c = cellOf(p); drag = { type: "brush", kind: t, cells: new Map([[c.x + "," + c.y, c]]) }; $("#map").setPointerCapture(e.pointerId); preview(); }
  else if (t === "token") placeToken(cellOf(p));
  else if (t === "label") {
    const c = cellOf(p), text = labelSettings.text.trim(); if (!text) return true;
    const old = labelEdit && S.map.labels[labelEdit];
    if (old) { put(`map/labels/${labelEdit}`, { ...old, text, size: labelSettings.size, color: labelSettings.color }); labelEdit = null; }
    else put(`map/labels/${uid("l")}`, { x: c.x, y: c.y, text, size: labelSettings.size, color: labelSettings.color, rot: 0, lv: S.level ?? 0 });
    rememberLabel(text); renderLabelWindow();
  }
  else if (t === "prop") { const c = cellOf(p), rot = palRandomRot ? Math.floor(Math.random() * 4) * 90 : palRot, s = palRandomScale ? .5 + Math.random() * 1.5 : palScale; put(`map/props/${uid("p")}`, { kind: opt("prop")?.value || palProp, x: c.x, y: c.y, lv: S.level ?? 0, rot, s, ...(palFlip ? { flip: true } : {}) }); }
  else if (t === "erase") erase(e, p);
  else if (t === "wall") beginSegment("wall", e, p);
  else if (t === "floor" || t === "roof" || t === "fog") { const c = cellOf(p); drag = { type: t, a: c, b: c }; $("#map").setPointerCapture(e.pointerId); preview(); }
  return true;
}
// Paint bucket: flood-fill the cells reachable from the click without crossing a wall or door, as row-run rectangles.
function bucketFill(type, p) {
  const { cols: COLS, rows: ROWS } = mapSize(), c0 = cellOf(p), start = [(c0.x - 20) / 40, (c0.y - 20) / 40];
  // A step between two neighbouring cells is blocked when any wall or door segment crosses the line between their centres.
  // (Works for diagonal / off-grid walls such as imported cave maps, not just walls lying on cell edges.)
  const lv = S.level ?? S.map.level ?? 0, segs = [];
  for (const w of Object.values(S.map.walls || {})) if ((w.lv ?? 0) === lv) segs.push([w.x1, w.y1, w.x2, w.y2]);
  for (const d of Object.values(S.objects)) if (d.kind === "door" && (d.lv ?? 0) === lv) { const n = d.doorKind === "double" ? 40 : 20, v = d.dir === "v"; segs.push([d.x - (v ? 0 : n), d.y - (v ? n : 0), d.x + (v ? 0 : n), d.y + (v ? n : 0)]); }
  const byCell = new Map();   // cell "cx,cy" -> segments whose bounding box touches it
  for (const s of segs) {
    const x0 = Math.max(0, Math.floor(Math.min(s[0], s[2]) / 40)), x1 = Math.min(COLS - 1, Math.floor(Math.max(s[0], s[2]) / 40));
    const y0 = Math.max(0, Math.floor(Math.min(s[1], s[3]) / 40)), y1 = Math.min(ROWS - 1, Math.floor(Math.max(s[1], s[3]) / 40));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = x + "," + y; (byCell.get(k) || byCell.set(k, []).get(k)).push(s); }
  }
  const orient = (ax, ay, bx, by, cx, cy) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  const crosses = (ax, ay, bx, by, [cx, cy, dx, dy]) => orient(ax, ay, bx, by, cx, cy) * orient(ax, ay, bx, by, dx, dy) <= 0 && orient(cx, cy, dx, dy, ax, ay) * orient(cx, cy, dx, dy, bx, by) <= 0
    && !(orient(ax, ay, bx, by, cx, cy) === 0 && orient(ax, ay, bx, by, dx, dy) === 0);   // collinear overlap is not a crossing
  const blockedStep = (cx, cy, nx, ny) => {
    const ax = cx * 40 + 20, ay = cy * 40 + 20, bx = nx * 40 + 20, by = ny * 40 + 20;
    return (byCell.get(cx + "," + cy) || []).some((s) => crosses(ax, ay, bx, by, s)) || (byCell.get(nx + "," + ny) || []).some((s) => crosses(ax, ay, bx, by, s));
  };
  const seen = new Set([start.join()]), q = [start];
  while (q.length) {
    const [cx, cy] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || seen.has(nx + "," + ny)) continue;
      if (!blockedStep(cx, cy, nx, ny)) { seen.add(nx + "," + ny); q.push([nx, ny]); }
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
  else if (drag.type === "door") for (const d of segmentDoors(drag.a, drag.b).cells) el("line", { x1: d.dir === "v" ? d.x : d.x - 20, y1: d.dir === "v" ? d.y - 20 : d.y, x2: d.dir === "v" ? d.x : d.x + 20, y2: d.dir === "v" ? d.y + 20 : d.y, class: "doorbar ghost" }, l);
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
  if (drag.type === "wall" || drag.type === "door") { const b = segmentEnd(drag.a, p); drag.b = b; drag.moved = drag.a.x !== b.x || drag.a.y !== b.y; preview(); return true; }
  drag.b = cellOf(p); preview(); return true;
}
export function toolUp() {
  if (!drag) return false;
  const d = drag;
  if ((d.type === "wall" || d.type === "door") && d.pending && !d.moved) { preview(); return true; }
  drag = null; $("#preview").textContent = "";
  if (d.type === "propmove") { if (d.moved && d.to) patch({ [`map/props/${d.id}/x`]: d.to.x, [`map/props/${d.id}/y`]: d.to.y }); return true; }
  if (d.type === "wall") { if (d.a.x !== d.b.x || d.a.y !== d.b.y) put(`map/walls/${uid("w")}`, { x1: d.a.x, y1: d.a.y, x2: d.b.x, y2: d.b.y, ...(matOf() ? { mat: matOf() } : {}) }); return true; }
  if (d.type === "door") { placeDoors(d); return true; }
  if (d.type === "brush") { const fog = d.kind === "fog", base = fog ? "map/fog" : "map/floors", have = new Set(Object.values((fog ? S.map.fog : S.map.floors) || {}).filter((f) => f.w === 40 && f.h === 40 && (fog || (f.mat || "") === matOf())).map((f) => f.x + "," + f.y)); const ch = {}; let n = 0; for (const c of d.cells.values()) if (!have.has(c.x - 20 + "," + (c.y - 20))) ch[`${base}/${uid("f")}${n++}`] = { x: c.x - 20, y: c.y - 20, w: 40, h: 40, ...(fog ? { open: false } : matOf() ? { mat: matOf() } : {}) }; if (n) patch(ch); return true; }
  const r = rectOf(d);
  if (d.type === "roof") put(`map/roofs/${uid("r")}`, { ...r, open: false, lv: S.level ?? 0, ...(matOf() ? { mat: matOf() } : {}) });
  else if (d.type === "fog") {
    if (fogMode === "clear") Object.entries(S.map.fog || {}).filter(([, a]) => (a.lv ?? 0) === (S.level ?? 0) && inRect({ x: a.x + a.w / 2, y: a.y + a.h / 2 }, r)).forEach(([id]) => put(`map/fog/${id}`, null));
    else put(`map/fog/${uid("g")}`, { ...r, open: fogMode === "reveal", lv: S.level ?? 0 });
  }
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
  if (type === "label") { const a = S.map.labels[id]; return { title: "Label", fields: [F("Text", `map/labels/${id}/text`, a.text || "", { type: "text" }), F("Size", `map/labels/${id}/size`, a.size || 1, { type: "number", min: .25, max: 10 }), F("Colour", `map/labels/${id}/color`, a.color || "#3d2632", { type: "color" }), F("Rotation", `map/labels/${id}/rot`, a.rot || 0, { type: "number" })] }; }
  if (type === "prop") { const p = S.map.props[id]; return { title: "Prop", fields: [F("Kind", `map/props/${id}/kind`, p.kind, { opts: Object.entries(PROPS) }), F("Rotation", `map/props/${id}/rot`, p.rot || 0, { type: "number" }), F("Scale", `map/props/${id}/s`, p.s || 1, { type: "number", min: .1, max: 10 })] }; }
  if (type === "token") { const t = S.tokens[id]; return { title: t.label || id, fields: [F("Name", `tokens/${id}/label`, t.label || "", { type: "text" }),
    F("Colour", `tokens/${id}/color`, t.color || "", { opts: [["", "auto"], ["#a94c3d", "red"], ["#466c83", "blue"], ["#66774b", "green"], ["#7a5a8a", "purple"], ["#c8871c", "gold"]] }),
    F("Picture URL", `tokens/${id}/img`, t.img || "", { type: "text" })] }; }
  const o = S.objects[id], base = `objects/${id}/`, L = F("Name", base + "label", o.label || "", { type: "text" });
  if (o.kind === "light") return { title: o.label || "Light", fields: [L, F("Colour", base + "color", o.color || "#ffb347", { opts: Object.entries(LIGHT_COLORS) }),
    F("Radius (cells)", base + "radius", Math.round((o.radius || 120) / 40), { type: "number", min: 1, max: 12, to: (v) => Math.max(1, v) * 40 }),
    F("Clears fog (cells)", base + "fog", o.fog ?? 2, { type: "number", min: 0, max: 12 }),
    F("Intensity", base + "intensity", lightIntensity(o), { type: "range", min: .2, max: 1.5, step: .05, to: clampIntensity })] };
  const f = [L];
  if (o.kind === "door") f.push(F("Kind", base + "doorKind", o.doorKind || (o.win ? "window" : "wood"), { opts: [["wood", "wood"], ["iron", "iron"], ["double", "double"], ["portcullis", "portcullis"], ["bars", "bars"], ["secret", "secret"], ["arch", "arch"], ["curtain", "curtain"], ["window", "window"]] }), F("Material", base + "mat", o.mat || "", { opts: matOpts(WALL_MATS) }), F("Direction", base + "dir", o.dir || "h", { opts: [["h", "horizontal"], ["v", "vertical"]] }));
  if (o.kind === "tripwire") f.push(F("Length", base + "len", o.len || 3, { type: "number", min: 1, max: 10 }), F("Direction", base + "dir", o.dir || "h", { opts: [["h", "across"], ["v", "down"]] }));
  if (o.kind === "plate" || o.kind === "tripwire") f.push(F("Stays down", base + "latch", !!o.latch, { type: "check" }));
  if (o.kind === "sight") f.push(F("Sees", base + "sees", o.sees || "player", { opts: [["player", "players"], ["npc", "NPCs / enemies"]] }), F("Range (cells)", base + "range", o.range || 6, { type: "number", min: 1, max: 30 }), F("Stays triggered", base + "latch", !!o.latch, { type: "check" }));
  if (o.kind === "spawn") f.push(F("Enemy HP", base + "hp", o.hp || 5, { type: "number", min: 1 }));
  return { title: o.label || o.kind, fields: f };
}
