import { LIGHT_MATS } from "./light-types.js";

export const REPLACE_VALUES = {
  wall: "stone ashlar marble brick fieldstone plaster timber wood palisade cave hedge earth cobble iron".split(" "),
  floor: "stone slab cobble marble tile wood carpet dirt cave sand grass snow water mud shallow ice lava swamp bone void gravel moss iron".split(" "),
  roof: "thatch slate tile flat wood stone".split(" "),
  door: "wood iron double portcullis bars secret arch curtain window".split(" "),
  light: LIGHT_MATS.map((x) => x.color),
  prop: "table chair stool bench bed barrel crate chest bookshelf torch_sconce campfire candelabra light rug statue cauldron coffin altar bone_pile gravestone skull_pillar iron_cage spike_trap chains guild_crest stairs ladder bush tree pine_tree dead_tree stump fallen_log rocks boulder mushrooms hearth_oven kitchen_counter pot_rack pantry_shelf butcher_block bar_counter keg_rack round_table fireplace mug_clutter desk lectern globe scroll_rack armchair alchemy_table crystal_pedestal book_pile summoning_circle_stones forge anvil grindstone workbench market_stall display_shelf pew holy_font brazier banner wardrobe dresser nightstand bunk_bed torture_rack stocks manacles_wall crystal_cluster stalagmite ore_pile mine_cart rope_coil anchor dock_post cannon blackship reeds flowers tall_grass_clump cliff_rock lamp_post standing_torch tall_brazier fountain water_trough hitching_post notice_board hay_bale shop_counter potion_shelf hat_stand hat_display mirror display_case jeweler_bench strongbox bridge fence well cart signpost tent woodpile sacks weapon_rack column pillar rock pine bush lamp fence decal_moss decal_cracks decal_blood_splatter decal_blood_pool decal_scorch decal_puddle decal_rubble decal_leaves decal_stains decal_rune_circle decal_footprints decal_ash".split(" "),
};
const family = (v) => String(v || "").startsWith("decal_") ? "decal" : ["stairs", "ladder"].includes(v) ? "stairs" : "plain";
const levelOf = (v) => Number(v?.lv) || 0;
const selectedIds = (state) => state.selected instanceof Set ? state.selected : new Set(state.selected || []);

export function planReplace(state, { category, from = "", to, scope = "level" } = {}) {
  const c = String(category || "").toLowerCase(), changes = {}, selected = selectedIds(state), level = Number(state.level ?? state.map?.level) || 0;
  const list = c === "wall" ? Object.entries(state.map?.walls || {}).map(([id, v]) => [`map/walls/${id}`, v])
    : c === "floor" ? Object.entries(state.map?.floors || {}).map(([id, v]) => [`map/floors/${id}`, v])
    : c === "roof" ? Object.entries(state.map?.roofs || {}).map(([id, v]) => [`map/roofs/${id}`, v])
    : c === "prop" ? Object.entries(state.map?.props || {}).map(([id, v]) => [`map/props/${id}`, v])
    : Object.entries(state.objects || {}).map(([id, v]) => [`objects/${id}`, v]).filter(([, v]) => v?.kind === (c === "door" ? "door" : "light"));
  const key = c === "door" ? "doorKind" : c === "light" ? "color" : "mat";
  for (const [path, item] of list) {
    if (scope === "selected" && !selected.has(path.split("/").pop())) continue;
    if (scope !== "all" && scope !== "selected" && levelOf(item) !== level) continue;
    const old = c === "door" ? item.doorKind || (item.win ? "window" : "wood") : c === "prop" ? item.kind : item[key] || "";
    if (from !== "*" && old !== from) continue;
    if (old === to || (c === "prop" && family(old) !== family(to))) continue;
    if (c === "door") { changes[`${path}/doorKind`] = to; changes[`${path}/win`] = to === "window"; }
    else changes[`${path}/${c === "prop" ? "kind" : key}`] = to;
  }
  return { changes, count: Object.keys(changes).filter((p) => !p.endsWith("/win")).length };
}

let openWindow = null, eyedrop = false, viewItems = () => [];
const esc = (v) => String(v).replace(/[&<>"']/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[x]));
function toast(s) { const e = document.querySelector("#toast"); if (e) { e.textContent = s; e.classList.add("show"); setTimeout(() => e.classList.remove("show"), 2200); } }
function values(state, c) { const seen = new Map(), fields = c === "prop" ? Object.values(state.map?.props || {}) : c === "wall" ? Object.values(state.map?.walls || {}) : c === "floor" ? Object.values(state.map?.floors || {}) : c === "roof" ? Object.values(state.map?.roofs || {}) : Object.values(state.objects || {}).filter((o) => o.kind === (c === "door" ? "door" : "light")); for (const a of fields) { const v = c === "prop" ? a.kind : c === "door" ? a.doorKind || (a.win ? "window" : "wood") : c === "light" ? a.color : a.mat || ""; seen.set(v, (seen.get(v) || 0) + 1); } return seen; }
export async function openReplace(prefill = {}) { const [{ S }, { floatWindow }, { patch }] = await Promise.all([import("./state.js"), import("./ui.js"), import("./undo.js")]); const c0 = prefill.category || "wall"; if (!openWindow) openWindow = floatWindow({ id: "replace", title: "Replace…", x: 330, y: 150 });
  const render = () => { const c = openWindow.body.querySelector("[name=category]")?.value || c0, present = values(S, c), from = openWindow.body.querySelector("[name=from]"), old = from?.value; openWindow.body.querySelector("[name=from]").innerHTML = `<option value="*">any</option>${[...present].map(([v, n]) => `<option value="${esc(v)}">${esc(v || "default")} (${n})</option>`).join("")}`; if ([...from.options].some((o) => o.value === (prefill.from ?? old))) from.value = prefill.from ?? old; openWindow.body.querySelector("[name=to]").innerHTML = REPLACE_VALUES[c].map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join(""); if (prefill.to) openWindow.body.querySelector("[name=to]").value = prefill.to; update(); };
  const update = () => { const f = openWindow.body.querySelector("[name=from]")?.value, to = openWindow.body.querySelector("[name=to]")?.value, c = openWindow.body.querySelector("[name=category]")?.value, scope = openWindow.body.querySelector("[name=scope]")?.value; const p = planReplace(S, { category: c, from: f, to, scope }); openWindow.body.querySelector("[data-count]").textContent = `Will change ${p.count} items`; };
  openWindow.body.innerHTML = `<div class="replace-form"><label>Category <select name="category">${Object.keys(REPLACE_VALUES).map((x) => `<option value="${x}">${x}</option>`).join("")}</select></label><label>From <select name="from"></select></label><label>To <select name="to"></select></label><label>Scope <select name="scope"><option value="level">Current level</option><option value="all">All levels</option><option value="selected">Selected</option></select></label><div data-count>Will change 0 items</div><div><button type="button" data-eyedropper>Eyedropper</button><button type="button" data-apply>Apply</button></div></div>`;
  openWindow.body.querySelector("[name=category]").value = c0; openWindow.body.querySelector("[name=category]").onchange = render; ["from", "to", "scope"].forEach((n) => openWindow.body.querySelector(`[name=${n}]`).onchange = update); render(); openWindow.body.querySelector("[data-eyedropper]").onclick = () => { eyedrop = true; toast("Click an item on the map"); }; openWindow.body.querySelector("[data-apply]").onclick = async () => { const p = planReplace(S, { category: openWindow.body.querySelector("[name=category]").value, from: openWindow.body.querySelector("[name=from]").value, to: openWindow.body.querySelector("[name=to]").value, scope: openWindow.body.querySelector("[name=scope]").value }); if (p.count) await patch(p.changes); toast(`Replaced ${p.count} ${openWindow.body.querySelector("[name=category]").value}`); openWindow.hide(); }; openWindow.show(); }
export function initReplace() { if (!document.querySelector("#map") || !new URLSearchParams(location.search).has("gm")) return; viewItems = () => [["Replace…", () => openReplace()]]; const map = document.querySelector("#map"); map.addEventListener("click", (e) => { if (!eyedrop) return; const el = e.target.closest("[data-id]"); if (!el) return; const id = el.dataset.id, type = el.closest("#objects") ? "object" : el.closest("#props") ? "prop" : el.closest("#walls") ? "wall" : el.closest("#floors") ? "floor" : el.closest("#roofs") ? "roof" : null; if (!type) return; eyedrop = false; import("./state.js").then(({ S }) => openReplace({ category: type === "object" ? (S.objects[id]?.kind === "door" ? "door" : "light") : type, from: type === "object" ? (S.objects[id]?.doorKind || S.objects[id]?.color) : type === "prop" ? S.map.props[id]?.kind : S.map[type + "s"]?.[id]?.mat || "" })); }); }
export const replaceViewItems = () => viewItems();
