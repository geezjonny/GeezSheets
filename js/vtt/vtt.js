// Map events and wiring: Firebase sync, rule evaluation (GM only), pointer interaction.
import { watch, watchAt, read, readAt, txnAt, put as rawPut, patch as rawPatch } from "../store.js";
import { put, patch } from "./undo.js";
import { play } from "./fx/fx.js";
import { KINDS, statesOf, evaluate, onFired, newObject, demo, demoMap } from "../puzzle/index.js";
import { $, S, cellOf } from "./state.js";
import { stepBlocked } from "./reach.js";
// Players don't drag tokens: they walk their own with WASD / arrow keys, one cell at a time, never through walls or closed doors.
document.addEventListener("keydown", (e) => {
  if (S.isGM || S.paused || S.combat || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  const d = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0], arrowup: [0, -1], arrowleft: [-1, 0], arrowdown: [0, 1], arrowright: [1, 0] }[e.key.toLowerCase()];
  if (!d) return;
  const id = Object.keys(S.tokens).find((k) => canMove(k)); if (!id) return;
  e.preventDefault();
  const t = S.tokens[id], from = cellOf(t), to = { x: from.x + d[0] * 40, y: from.y + d[1] * 40 };
  if (stepBlocked(from, to) || cellOf(to).x !== to.x || cellOf(to).y !== to.y) return;
  patch({ [`tokens/${id}/x`]: to.x, [`tokens/${id}/y`]: to.y });
});
import { initView, applyView } from "./view.js";
import { CONDITIONS } from "./conditions.js";
import { initCmd } from "./cmd.js";
import { initInitiative, addToInitiative, removeFromInitiative, inInitiative, startInitiative } from "./initiative.js";
import { initScenes } from "./scenes.js";
import { initImages, imageAt, imageFields, removeImage } from "./images.js";
import { initMeasure } from "./measure.js";
import { initDice } from "./dice.js";
import { initAudio } from "./audio.js";
import { initHandouts } from "./handouts.js";
import { initRollCall } from "./rollcall.js";
import { initAtmosphere } from "./atmosphere.js";
import { openTokenPicker } from "./tokenpics.js";
import { openInventory } from "./inventory.js";
import { openEquipment } from "./equipment.js";
import { initDD2VTT } from "./dd2vtt.js";
import { initRefImage } from "./refimage.js";
import { initReplace, openReplace } from "./replace.js";
import { addBarButton, dropMenu, orderQuickBar, floatWindow } from "./ui.js";
import { drawObjects, drawTokens, drawTray, drawMap, drawWalls, isPcToken, doorsList, wallPieces } from "./draw.js";
import { initTools, snapFor, toolDown, toolMove, toolUp, roofAt, fogAt, wallAt, floorAt, settingsFor } from "./tools.js";
import { renderPanel, openLogic } from "./panel.js";
import { initAttack, attackOptions, beginAttack, sheetOf } from "./attack.js";
import "./talk.js";
import { initJoin } from "./join.js";
import { initChatDock } from "./chatdock.js";
import { initTable } from "./table.js";
import { initAnnotations } from "./annotations.js";
import { EFFECT_PRESETS, effectsOf, effectRemaining, makeEffect, damageAdjustment } from "./effects.js";
import { initJournal } from "./journal.js";
import { initExplored } from "./explored-vtt.js";
import { visibleToPlayer } from "./visibility.js";

S.refreshLighting = () => drawObjects();

const map = $("#map");
let prevStates = null, objDrag = null;
const loadedAt = Date.now();

// ---- sync -----------------------------------------------------------------
(async () => {
  if (!S.isGM) return;
  if ((await read("seeded")) == null) {   // first run only: demo content. "seeded" stops a cleared scene from being refilled
    if ((await read("objects")) == null) { const d = demo(); await rawPut("objects", d.objects); await rawPut("tokens", d.tokens); }
    if ((await read("map")) == null) await rawPut("map", demoMap());
    await rawPut("seeded", true);
  }
})();
for (const part of ["floors", "walls", "roofs", "props", "labels", "fog"]) watch(`map/${part}`, (v) => { S.map[part] = v || {}; drawMap(); drawObjects(); drawTokens(); document.dispatchEvent(new Event("vttvisibilitychange")); });
watch("map/level", (v) => { S.level = S.map.level = Number(v) || 0; drawMap(); drawObjects(); drawTokens(); drawWalls(); });
watch("map/levelNames", (v) => { S.map.levelNames = v || {}; });
initTools(); initView(); initInitiative(); initScenes(); initImages(); initRefImage(); initReplace(); initMeasure(); initDice(); initDD2VTT(); initAudio(); initHandouts(); initRollCall(); initAtmosphere(); initAttack(); initCmd(); initTable(); initAnnotations(); initExplored();
S.exploredRedraw = () => { drawMap(); drawTokens(); };
if (S.isGM) {
  const floorButton = (delta) => addBarButton({ id: `floor-${delta > 0 ? "up" : "down"}`, icon: delta > 0 ? "↑" : "↓", label: "Floor", gmOnly: true, onClick: () => { const lv = (S.level ?? 0) + delta; S.level = lv; rawPut("map/level", lv); } });
  floorButton(-1); floorButton(1);
}
watch("map/size", (v) => { S.map.size = v || null; applyView(); drawMap(); });
watch("objects", (v) => {
  const before = prevStates; S.objects = v || {};
  if (before) for (const [id, o] of Object.entries(S.objects)) if (o.kind === "door" && before[id] && before[id] !== o.state && (S.isGM || visibleToPlayer(o, Object.values(S.map.fog || {}), false, S.currentVisible, S.map.exploredEnabled !== false))) play(o.state === "open" ? "door-open" : "door-close");
  prevStates = Object.fromEntries(Object.entries(S.objects).map(([id, o]) => [id, o.state]));
  if (S.isGM && before) for (const [id, o] of Object.entries(S.objects))   // an event output just fired
    if (KINDS[o.kind]?.role === "event" && o.state === "fired" && before[id] === "armed") { rawPatch(onFired(id, o).changes); if (o.kind === "initiative") startInitiative(); }
  drawWalls(); drawObjects(); renderPanel(); afterChange();
});
watch("tokens", (v) => { S.tokens = v || {}; drawTokens(); drawTray(); afterChange(); document.dispatchEvent(new Event("tokenschanged")); trackPcs(); });
// Live HP: every PC token follows its sheet (characters/pcs/<id>/combat) and redraws when it changes.
S.pcLive = {}; S.tokPc = {};
const pcWatched = new Set();
let pcTrackBusy = false;
async function trackPcs() {
  if (pcTrackBusy) return; pcTrackBusy = true;
  try {
    for (const [tid, t] of Object.entries(S.tokens)) {
      if (!isPcToken(t) || S.tokPc[tid]) continue;
      const pcId = await pcIdFor(t); if (!pcId) continue;
      S.tokPc[tid] = pcId;
      if (!pcWatched.has(pcId)) { pcWatched.add(pcId); watchAt(`characters/pcs/${pcId}/combat`, (c) => { S.pcLive[pcId] = c || null; drawTokens(); liveMenu(pcId); }); }
    }
  } finally { pcTrackBusy = false; }
}
function liveMenu(pcId) {
  const live = S.pcLive[pcId];
  if (live?.hp_max) for (const [wid, w] of Object.entries(tokWins)) if (!w.el.hidden && S.tokPc[wid] === pcId && w.body.firstChild?.children[1]) w.body.firstChild.children[1].textContent = `HP: ${live.hp_current ?? live.hp_max} / ${live.hp_max}${live.temp_hp ? ` (+${live.temp_hp} temp)` : ""}`;   // open PC windows follow the sheet
  const c = S.pcLive[pcId], tid = tokMenu?.dataset.tid;
  if (c?.hp_max && tid && S.tokPc[tid] === pcId) tokMenu.children[1].textContent = `HP: ${c.hp_current ?? c.hp_max} / ${c.hp_max}${c.temp_hp ? ` (+${c.temp_hp} temp)` : ""}`;
}
watch("groups", (v) => { S.groups = v || {}; renderPanel(); afterChange(); });
watch("events/last", (e) => { if (S.isGM && e && e.t > loadedAt) { const t = $("#toast"); t.textContent = e.text; t.style.display = "block"; setTimeout(() => (t.style.display = "none"), 3500); } });
// Only the GM client runs the rules, so two clients never race.
function afterChange() {
  if (!S.isGM) return;
  const doors = doorsList().filter(d => (d.lv ?? 0) === (S.level ?? 0)), blockers = [...Object.values(S.map.walls || {}).filter(w => (w.lv ?? 0) === (S.level ?? 0)).flatMap((w) => wallPieces(w, doors)), ...doors.filter((d) => !d.win && !["window", "bars", "portcullis", "arch"].includes(d.doorKind || d.kindName) && d.state !== "open").map((d) => d.dir === "v" ? [d.x, d.y - 20, d.x, d.y + 20] : [d.x - 20, d.y, d.x + 20, d.y])];
  const changes = evaluate({ objects: S.objects, groups: S.groups, tokens: S.tokens, blockers });
  if (Object.keys(changes).length) rawPatch(changes);
}

// ---- who am I (players): picks which token you may move ------------------------------
let me = null; try { me = JSON.parse(localStorage.getItem("vtt-me")); } catch { /* none */ }
function canMove(id) {
  const t = S.tokens[id]; if (!t) return false;
  if (S.isGM) return true;
  if (!isPcToken(t)) return false;   // enemies and NPCs belong to the GM
  if (!me) return true;              // nobody chosen yet: any player token
  return t.pc ? t.pc === me.id : String(t.label || "").toLowerCase() === me.name.toLowerCase();
}
if (!S.isGM) addBarButton({ quick: true, id: "me", icon: "🧝", label: "Me", title: "Choose which character you move", onClick: async (e, b) => {
  const list = await loadPcs(), pick = (v) => { me = v; try { localStorage.setItem("vtt-me", JSON.stringify(v)); } catch { /* fine */ } b.querySelector(".lbl").textContent = v ? v.name.slice(0, 8) : "Me"; dispatchEvent(new Event("vtt-me-changed")); };
  dropMenu(b, [["I am…", null], ...list.filter((c) => c.name).map((c) => [c.name, () => pick({ id: c.id, name: c.name })]), ["Anyone (no limit)", () => pick(null)]]);
} });

// ---- map interaction -------------------------------------------------------
function mapPoint(e) {
  const p = map.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(map.getScreenCTM().inverse());
}
document.addEventListener("click", (e) => { if (e.target.closest("button, select, summary")) play("click"); });
map.addEventListener("pointerdown", (e) => {
  if (!S.isGM && S.paused) return;
  const { objects, tokens } = S;
  const p = mapPoint(e), objEl = e.target.closest(".obj"), tokEl = e.target.closest(".token");
  if (!S.pick && toolDown(e, p)) return;   // GM map-building tools
  if (!S.puzzleMode) {   // normal play: switches flip, dials turn
    const o = objEl && objects[objEl.dataset.id];
    if (o?.kind === "switch") { play("click"); return put(`objects/${objEl.dataset.id}/state`, o.state === "on" ? "off" : "on"); }
    if (o?.kind === "dial") { play("click"); const s = statesOf(o); return put(`objects/${objEl.dataset.id}/state`, s[(s.indexOf(o.state) + 1) % s.length]); }
  } else {
    if (S.pick) { const spot = cellOf(p), { zone, id } = S.pick; S.pick = null; map.classList.remove("picking");
      if (zone === "when") S.draft.when.find((c) => c.id === id).at = spot;
      else if (zone === "then") S.draft.then.find((c) => c.id === id).to = spot;
      else if (zone === "prop") put(`objects/${id}/to`, spot);
      return renderPanel(); }
    if (objEl) { objDrag = { id: objEl.dataset.id, el: objEl, x0: p.x, y0: p.y, moved: false }; map.setPointerCapture(e.pointerId); return; }
  }
  if (tokEl && !S.isGM) return;   // only the GM drags tokens; players use the keyboard
  if (tokEl) { S.dragging = tokEl;tokEl.setPointerCapture(e.pointerId); e.preventDefault(); }
});
map.addEventListener("pointermove", (e) => {
  if (toolMove(e, mapPoint(e))) return;
  if (objDrag) {
    const p = mapPoint(e);
    if (Math.hypot(p.x - objDrag.x0, p.y - objDrag.y0) > 6) objDrag.moved = true;
    if (objDrag.moved) { const s = snapFor(S.objects[objDrag.id].kind, p), o = S.objects[objDrag.id];
      objDrag.snap = s; objDrag.el.setAttribute("transform", `translate(${s.x - o.x} ${s.y - o.y})`); }
    return;
  }
  const d = S.dragging;
  if (!d || !d.hasPointerCapture(e.pointerId)) return;
  const c = cellOf(mapPoint(e));
  d.dataset.x = c.x; d.dataset.y = c.y;
  d.setAttribute("transform", `translate(${d.dataset.x} ${d.dataset.y})`);
});
const release = () => {
  if (toolUp()) return;
  if (objDrag) {
    const { id, moved, snap } = objDrag; objDrag = null;
    if (moved && snap) put(`objects/${id}`, { ...S.objects[id], x: snap.x, y: snap.y, sx: snap.x, sy: snap.y, ...(snap.dir ? { dir: snap.dir } : {}) });
    else { S.selected.has(id) ? S.selected.delete(id) : S.selected.add(id); S.lastSel = id; drawObjects(); renderPanel(true); }
    return;
  }
  if (!S.dragging) return;
  const { id, x, y } = S.dragging.dataset; S.dragging = null;
  if (x != null) patch({ [`tokens/${id}/x`]: +x, [`tokens/${id}/y`]: +y }); else drawTokens();
};
// GM right-click: reveal or hide an object (a passed perception roll reveals a trap).
// Right-click a token (anyone): read-only name + HP, and a "View sheet" link for PCs (tokens with no HP / NPC).
let tokMenu = null;
const closeTokMenu = () => { tokMenu?.remove(); tokMenu = null; };
document.addEventListener("pointerdown", (e) => { if (tokMenu && !tokMenu.contains(e.target)) closeTokMenu(); });
const SHEET_URL = "https://geezjonny.github.io/GeezSheets/sheet.html";   // GeezSheets (sheet.html?char=<pc id>); change if hosted elsewhere
let pcs = null;   // player characters from the main app (read only): [{ id, name }]
async function loadPcs() {
  if (pcs) return pcs; pcs = [];
  try { pcs = Object.entries((await readAt("characters/pcs")) || {}).map(([id, c]) => ({ id, name: c?.name || c?.identity?.name || c?.basic?.name || "" })); }
  catch (err) { console.warn("Could not read PCs", err); }
  return pcs;
}
// ---- GeezSheets write-back: a PC token's HP and conditions live on their sheet (same fields the sheet writes) ----
async function pcIdFor(t) {
  if (!t || t.npc) return null;
  if (t.pc) return t.pc;
  const nm = String(t.label || "").toLowerCase();
  return nm ? (await loadPcs()).find((c) => c.name.toLowerCase() === nm)?.id || null : null;
}
async function mirrorConditions(tokenId, key, on) {
  if (!S.isGM) return;
  try {
    const pcId = await pcIdFor(S.tokens[tokenId]); if (!pcId) return;
    const label = CONDITIONS[key][0];
    await txnAt(`characters/pcs/${pcId}/combat/conditions`, (cur) => {
      const list = (Array.isArray(cur) ? cur : Object.values(cur || {})).filter((x) => String(x).toLowerCase() !== key);
      if (on) list.push(label);
      return list.length ? list : null;
    });
  } catch (err) { console.warn("Could not write conditions to the sheet", err); }
}
// Damage / heal exactly as sheet.html does: temp HP soaks damage, death saves reset above 0.
function sheetHpChange(c, delta, heal) {
  if (!c) return c;
  const cur = Number(c.hp_current) || 0, tmp = Math.max(0, Number(c.temp_hp) || 0), n = (v) => Math.max(0, Math.min(3, Number(v) || 0));
  const hp = heal ? Math.min(Number(c.hp_max) || 1, cur + delta) : Math.max(0, cur - Math.max(0, delta - tmp));
  const saves = { success: n(c.death_saves?.success), fail: n(c.death_saves?.fail) };
  if (!heal && cur === 0) saves.fail = n(saves.fail + 1);
  return { ...c, hp_current: hp, temp_hp: heal ? tmp : Math.max(0, tmp - delta), death_saves: hp > 0 ? { success: 0, fail: 0 } : saves };
}
const sheetWins = {};   // floating GeezSheets sheet per PC; the sheet page is live from Firebase itself
function openSheetWindow(pc) {
  let w = sheetWins[pc.id];
  if (!w) {
    w = sheetWins[pc.id] = floatWindow({ id: "sheet-" + pc.id, title: pc.name || "Sheet", x: 120, y: 90 });
    w.body.style.cssText = "width:min(560px,90vw);height:min(680px,80vh);padding:0;resize:both;overflow:hidden";
    w.body.innerHTML = `<iframe src="${SHEET_URL}?char=${encodeURIComponent(pc.id)}" style="width:100%;height:100%;border:0" title="Character sheet"></iframe>`;
  }
  w.show();
}
// Right-click a PC token: a floating, draggable window (stays open, refreshes itself). Other tokens get the quick popup.
const tokWins = {};
function openTokenWindow(e, id) {
  const name = S.tokens[id].label || id;
  let w = tokWins[id];
  if (!w) {
    w = tokWins[id] = floatWindow({ id: "token-" + id, title: name, x: Math.max(0, Math.min(innerWidth - 280, e.clientX + 12)), y: Math.max(40, Math.min(innerHeight - 260, e.clientY + 12)) });
    w.body.classList.add("tokwin");
  }
  w.el.querySelector(".fwin-title").textContent = name;
  w.show(); fillTokenWindow(w, id);
}
function fillTokenWindow(w, id) {
  if (!S.tokens[id] || !visibleToPlayer(S.tokens[id], Object.values(S.map.fog || {}), S.isGM, S.currentVisible, S.map.exploredEnabled !== false)) { w.hide(); return; }
  const box = document.createElement("div"); box.className = "tokwin-box"; w.body.replaceChildren(box);
  w.el.querySelector(".fwin-title").textContent = S.tokens[id].label || id;
  buildTokenMenu(box, id, () => setTimeout(() => fillTokenWindow(w, id), 250), () => w.body.firstChild === box && !w.el.hidden);
}
document.addEventListener("turnchanged", drawTokens);
document.addEventListener("tokenschanged", () => {   // keep open windows current (unless you're typing in one)
  for (const [id, w] of Object.entries(tokWins)) if (!w.el.hidden && !w.body.contains(document.activeElement)) fillTokenWindow(w, id);
});
async function showTokenMenu(e, id) {
  closeTokMenu();
  const t = S.tokens[id]; if (!t || !visibleToPlayer(t, Object.values(S.map.fog || {}), S.isGM, S.currentVisible, S.map.exploredEnabled !== false)) return;
  if (S.isGM || isPcToken(t)) return openTokenWindow(e, id);   // a floating, movable window (GM: every token)
  const x = e.clientX, y = e.clientY, esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const menu = tokMenu = document.createElement("div"); menu.id = "tokmenu"; menu.dataset.tid = id;
  menu.style.left = x + "px"; menu.style.top = y + "px"; document.body.appendChild(menu);
  buildTokenMenu(menu, id, closeTokMenu, () => alive());
}
// Fills a container with a token's info and controls. done() is called after a button action; alive() says whether the container is still showing.
async function buildTokenMenu(menu, id, done, alive) {
  const t = S.tokens[id]; if (!t) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const name = t.label || id;
  menu.innerHTML = `<div><b>${esc(name)}</b></div><div>HP: ${t.hp != null ? `${t.hp} / ${t.max ?? t.hp}` : "—"}</div>`;
  if (S.isGM && t.hp != null) {   // GM: adjust an enemy's HP
    menu.insertAdjacentHTML("beforeend", `<div><button data-d="-1">−</button> <button data-d="1">+</button></div>`);
    menu.addEventListener("click", (ev) => { const b = ev.target.closest("[data-d]"); if (!b) return; const k = S.tokens[id]; if (!k) return;
      const hp = Math.max(0, Math.min(k.max ?? k.hp, k.hp + +b.dataset.d)); put(`tokens/${id}/hp`, hp); menu.children[1].textContent = `HP: ${hp} / ${k.max ?? k.hp}`; });
  }
  if (S.isGM) {
    const hb = document.createElement("button"); hb.textContent = t.hidden ? "Reveal to players" : "Hide from players";
    hb.addEventListener("click", () => { done(); put(`tokens/${id}/hidden`, t.hidden ? null : true); }); menu.append(hb);
  }
  if (S.isGM) {   // hold a torch: lights the area around the token and clears fog as it moves
    const lb = document.createElement("button"); lb.textContent = t.torch ? "Light: put out torch" : "Light: hold torch";
    lb.addEventListener("click", () => { done(); put(`tokens/${id}/torch`, t.torch ? null : true); }); menu.append(lb);
  }
  if (S.isGM) { const pb = document.createElement("button"); pb.textContent = "Picture…"; pb.addEventListener("click", () => { done(); openTokenPicker(id); }); menu.append(pb); }
  if (S.isGM) {
    const ib = document.createElement("button"), inn = inInitiative(id); ib.textContent = inn ? "Remove from initiative" : "Add to initiative";
    ib.addEventListener("click", () => { done(); inn ? removeFromInitiative(id) : addToInitiative(id); }); menu.append(ib);
  }
  if (S.isGM) {   // condition > pick: toggles a coloured ring around the token
    const d = document.createElement("details"); d.innerHTML = `<summary>Condition</summary>` + Object.entries(CONDITIONS).map(([k, [n, c]]) => `<label class="cond"><input type="checkbox" data-c="${k}" ${t.conditions?.[k] ? "checked" : ""}><i style="background:${c}"></i>${n}</label>`).join("");
    d.addEventListener("change", (ev) => { const k = ev.target.dataset.c; if (!k) return; put(`tokens/${id}/conditions/${k}`, ev.target.checked ? true : null); mirrorConditions(id, k, ev.target.checked); });
    menu.append(d);
  }
  if (S.isGM) {
    const d = document.createElement("details"); d.className = "effects-box";
    const choices = Object.entries(EFFECT_PRESETS).map(([k, e]) => `<option value="${k}">${e.name}</option>`).join("");
    d.innerHTML = `<summary>Effects${effectsOf(t).length ? ` (${effectsOf(t).length})` : ""}</summary><div class="effect-add"><select data-effect-preset>${choices}</select><input data-effect-rounds type="number" min="1" placeholder="rounds" title="Blank means until removed"><button data-effect-add type="button">Add</button></div><div class="effect-custom" hidden><input data-effect-name placeholder="Name"><input data-effect-ac type="number" placeholder="AC" title="AC bonus"><input data-effect-attack type="number" placeholder="Attack" title="Attack bonus"><input data-effect-save type="number" placeholder="Save" title="Save bonus"><input data-effect-resist placeholder="Resist types"><input data-effect-vuln placeholder="Vulnerable types"><input data-effect-immune placeholder="Immune types"><input data-effect-note placeholder="Note"></div><div class="effect-list"></div>`;
    const preset = d.querySelector("[data-effect-preset]"), custom = d.querySelector(".effect-custom");
    preset.addEventListener("change", () => { custom.hidden = preset.value !== "custom"; });
    const list = d.querySelector(".effect-list");
    for (const effect of effectsOf(t)) { const row = document.createElement("div"); row.className = "effect-row"; row.textContent = `${effect.name}${effect.rounds == null ? " · ∞" : ` · ${effectRemaining(effect, S.round || 1)} rounds`}`; const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.title = "Remove effect"; remove.addEventListener("click", () => { put(`tokens/${id}/effects`, effectsOf(t).filter((x) => x.id !== effect.id)); done(); }); row.append(remove); list.append(row); }
    d.querySelector("[data-effect-add]").addEventListener("click", () => { const select = d.querySelector("[data-effect-preset]"), rounds = d.querySelector("[data-effect-rounds]").value, csv = (key) => d.querySelector(`[data-effect-${key}]`).value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean), customValue = select.value === "custom" ? { name: d.querySelector("[data-effect-name]").value || "Custom", ac: +d.querySelector("[data-effect-ac]").value || 0, attack: +d.querySelector("[data-effect-attack]").value || 0, save: +d.querySelector("[data-effect-save]").value || 0, damageResist: csv("resist"), damageVuln: csv("vuln"), damageImmune: csv("immune"), note: d.querySelector("[data-effect-note]").value } : {}; const effects = [...effectsOf(t), makeEffect(select.value, rounds === "" ? null : +rounds, S.round || 1, customValue)]; put(`tokens/${id}/effects`, effects); done(); });
    menu.append(d);
  }
  if (S.isGM) addFields(menu, settingsFor("token", id).fields);
  if (S.isGM) {   // Attack > weapon / cantrip / spell, then aim on the map (attack.js)
    const ab = document.createElement("button"); ab.textContent = "⚔ Attack…";
    ab.addEventListener("click", async (ev) => { const opts = await attackOptions(t, await pcIdFor(t)); showAttackMenu(ev, id, opts); }); menu.append(ab);
  }
  if (t.npc) { const nb = document.createElement("button"); nb.textContent = "View stat block"; nb.addEventListener("click", () => openNpcWindow(id)); menu.append(nb); }
  const invBtn = (pcId) => { const b = document.createElement("button"); b.textContent = "Inventory"; b.addEventListener("click", (ev) => { openInventory({ tokenId: id, name, pcId, isGM: S.isGM, x: ev.clientX + 12, y: ev.clientY + 12 }); done(); }); menu.append(b); };
  if (t.npc) { if (S.isGM) invBtn(null); return; }
  const pc = t.pc ? { id: t.pc } : (await loadPcs()).find((c) => c.name.toLowerCase() === String(name).toLowerCase());
  if (pc) try {   // a PC's HP comes live from their sheet, not the token's copy
    const c = (await readAt(`characters/pcs/${pc.id}/combat`)) || {};
    if (c.hp_max && alive()) menu.children[1].textContent = `HP: ${c.hp_current ?? c.hp_max} / ${c.hp_max}${c.temp_hp ? ` (+${c.temp_hp} temp)` : ""}`;
  } catch (err) { console.warn("Could not read PC HP", err); }
  if (pc && S.isGM && alive()) {   // GM: damage / heal the real sheet, live
    const w = document.createElement("div"); w.innerHTML = `<input type="number" min="1" value="1" style="width:3.5rem"> <button data-h="dmg">Damage</button> <button data-h="heal">Heal</button>`;
    w.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-h]"); if (!b) return; const amt = Math.floor(+w.querySelector("input").value);
      if (!(amt > 0)) return;
      try {
        const r = await txnAt(`characters/pcs/${pc.id}/combat`, (c) => sheetHpChange(c, amt, b.dataset.h === "heal"));
        const c = r.snapshot.val(); if (c && alive()) menu.children[1].textContent = `HP: ${c.hp_current ?? c.hp_max} / ${c.hp_max}${c.temp_hp ? ` (+${c.temp_hp} temp)` : ""}`;
      } catch (err) { console.warn("HP not saved", err); if (alive()) menu.children[1].textContent = "HP not saved: " + err.message; }
    });
    menu.append(w);
  }
  if (pc && alive()) invBtn(pc.id);
  if (pc && alive()) { const eb = document.createElement("button"); eb.textContent = "Equipment"; eb.addEventListener("click", (ev) => { openEquipment({ tokenId: id, name, pcId: pc.id, isGM: S.isGM, x: ev.clientX + 12, y: ev.clientY + 12 }); done(); }); menu.append(eb); }
  else if (!pc && S.isGM && alive()) invBtn(null);   // a token that is not a known PC keeps its own list
  if (pc && alive()) { const a = document.createElement("button"); a.textContent = "View sheet"; a.addEventListener("click", () => { openSheetWindow(pc); done(); }); menu.append(a); }
}
map.addEventListener("contextmenu", (e) => {
  const tokEl = e.target.closest(".token");
  if (tokEl) { e.preventDefault(); return showTokenMenu(e, tokEl.dataset.id); }
  closeTokMenu();
  if (!S.isGM) return;
  const objEl = e.target.closest(".obj"), propEl = e.target.closest(".prop"), p = mapPoint(e);
  if (objEl) {
    const id = objEl.dataset.id, o = S.objects[id]; if (!o) return; e.preventDefault();
    return showActionMenu(e, o.label || o.kind, [...(o.kind === "door" ? [[o.state === "open" ? "Close" : "Open", () => put(`objects/${id}/state`, o.state === "open" ? "closed" : "open")]] : []), ...(o.kind !== "door" && o.kind !== "light" ? [["Logic", () => openLogic(id)]] : []), ...(o.kind === "door" ? [["Replace all like this...", () => openReplace({ category: "door", from: o.doorKind || (o.win ? "window" : "wood") })]] : o.kind === "light" ? [["Replace all like this...", () => openReplace({ category: "light", from: o.color })]] : []), [o.hidden ? "Reveal to players" : "Hide from players", () => put(`objects/${id}/hidden`, !o.hidden)], ["Delete", () => put(`objects/${id}`, null)]], settingsFor("object", id).fields);
  }
  if (propEl) {
    const id = propEl.dataset.id, a = S.map.props[id]; if (!a) return; e.preventDefault();
    return showActionMenu(e, a.kind, [["Replace all like this...", () => openReplace({ category: "prop", from: a.kind })], [a.hidden ? "Reveal to players" : "Hide from players", () => put(`map/props/${id}/hidden`, a.hidden ? null : true)], ["Delete", () => put(`map/props/${id}`, null)]], settingsFor("prop", id).fields);
  }
  const labelEl = e.target.closest(".map-label");
  if (labelEl) { const id = labelEl.dataset.id, a = S.map.labels?.[id]; if (!a) return; e.preventDefault(); return showActionMenu(e, a.text || "Label", [["Delete", () => put(`map/labels/${id}`, null)]], settingsFor("label", id).fields); }
  const wl = wallAt(p);
  if (wl) { e.preventDefault(); return showActionMenu(e, "Wall", [["Replace all like this...", () => openReplace({ category: "wall", from: S.map.walls[wl]?.mat || "" })], ["Delete", () => put(`map/walls/${wl}`, null)]], settingsFor("wall", wl).fields); }
  const fg = fogAt(p);
  if (fg) { e.preventDefault(); const f = S.map.fog[fg]; return showActionMenu(e, "Fog", [[f.open ? "Re-fog room" : "Reveal room", () => put(`map/fog/${fg}/open`, !f.open)], ["Delete", () => put(`map/fog/${fg}`, null)]]); }
  const r = roofAt(p);
  if (r) { e.preventDefault(); const rf = S.map.roofs[r]; return showActionMenu(e, "Roof", [["Replace all like this...", () => openReplace({ category: "roof", from: rf.mat || "" })], [rf.open ? "Drop roof" : "Lift roof", () => put(`map/roofs/${r}/open`, !rf.open)], ["Delete", () => put(`map/roofs/${r}`, null)]]); }
  const im = imageAt(p);
  if (im) { e.preventDefault(); return showActionMenu(e, "Image", [["Delete", () => removeImage(im)]], imageFields(im).map((f) => ({ ...f, path: `map/images/${im}/${f.key}`, to: (v) => (f.key === "op" ? Math.max(0, Math.min(1, v)) : Math.max(f.key === "w" || f.key === "h" ? 1 : -99, v) * 40) }))); }
  const fl = floorAt(p);
  if (fl) { e.preventDefault(); showActionMenu(e, "Floor", [["Replace all like this...", () => openReplace({ category: "floor", from: S.map.floors[fl]?.mat || "" })], ["Delete", () => put(`map/floors/${fl}`, null)]], settingsFor("floor", fl).fields); }
});
// Attack picker: one row per weapon / cantrip / spell; picking one starts aiming on the map.
function showAttackMenu(e, id, opts) {
  const hooks = { applyDamage: applyTokenDamage, sheetFor: async (tid) => sheetOf(S.tokens[tid], await pcIdFor(S.tokens[tid])) };
  showActionMenu(e, `${S.tokens[id]?.label || id} attacks`, opts.map((o) => [`${o.group === "Weapons" ? "⚔" : "✦"} ${o.label}${o.group.startsWith("Level") ? ` (L${o.level})` : o.group === "Cantrips" ? " (cantrip)" : ""}${o.dmg ? ` · ${o.dmg}` : ""}`, () => beginAttack(id, o, hooks)]));
}
// Damage from an attack: an enemy token's own HP, or a PC's sheet (temp HP soaks it first).
async function applyTokenDamage(tid, amt, type = "") {
  const t = S.tokens[tid]; if (!t || !(amt > 0)) return;
  const adjusted = damageAdjustment(t, type, amt);
  amt = adjusted.amount;
  if (adjusted.reason !== "normal") { const toast = document.getElementById("toast"); if (toast) { toast.textContent = `${t.label || tid}: ${adjusted.reason} to ${type || "damage"}`; toast.style.display = "block"; setTimeout(() => (toast.style.display = "none"), 2500); } }
  if (!(amt > 0)) return;
  if (t.hp != null) return put(`tokens/${tid}/hp`, Math.max(0, t.hp - amt));
  const pcId = await pcIdFor(t); if (!pcId) return;
  try { await txnAt(`characters/pcs/${pcId}/combat`, (c) => sheetHpChange(c, amt, false)); } catch (err) { console.warn("HP not saved", err); }
}
// NPCs have no GeezSheets page, so their record (characters/npcs/<id>) is shown as a movable stat-block window.
const npcWins = {};
async function openNpcWindow(tid) {
  const t = S.tokens[tid]; if (!t) return;
  const w = npcWins[tid] ||= floatWindow({ id: "npc-" + tid, title: t.label || "NPC", x: 140, y: 100 });
  w.body.style.cssText = "width:min(380px,90vw);max-height:70vh;overflow:auto"; w.body.textContent = "Loading…"; w.show();
  const c = await sheetOf(t, null), esc = (v) => String(v ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  if (!c) { w.body.textContent = "No stat block found for this token."; return; }
  const cb = c.combat || {}, st = c.stats || {}, sp = c.spellcasting;
  w.body.innerHTML = `<div style="font:15px Georgia,serif;line-height:1.45"><b style="font-size:18px">${esc(c.name || t.label)}</b><div>${esc([c.size, c.species || c.race, c.class, c.level ? "Lv " + c.level : ""].filter(Boolean).join(" · "))}</div>
    <div>AC <b>${esc(cb.ac ?? "—")}</b> · HP <b>${esc(t.hp ?? cb.hp_max ?? "—")}${t.max ? " / " + esc(t.max) : ""}</b> · Speed ${esc(cb.speed ?? "—")}</div>
    <div>${Object.entries(st).map(([k, v]) => `${esc(k.toUpperCase())} <b>${esc(v)}</b>`).join(" · ")}</div>
    ${(c.attacks || []).length ? `<hr><b>Attacks</b>` + c.attacks.map((a) => `<div>${esc(a.name)} ${esc(a.to_hit ?? a.attack_bonus ?? "")} · ${esc(a.damage || a.damage_dice || "")} ${esc(a.damage_type || "")}</div>`).join("") : ""}
    ${sp?.spells?.length ? `<hr><b>Spells</b><div>${sp.spells.map((x) => esc(x.name)).join(", ")}</div>` : ""}</div>`;
}
// Generic right-click menu: items are [label, action]; stays open until you pick something or click away.
function showActionMenu(e, title, items, fields = []) {
  const menu = tokMenu = document.createElement("div"); menu.id = "tokmenu";
  const b = document.createElement("b"); b.textContent = title; menu.append(b);
  for (const [label, fn] of items) { const btn = document.createElement("button"); btn.textContent = label; btn.addEventListener("click", () => { closeTokMenu(); fn(); }); menu.append(btn); }
  addFields(menu, fields);
  menu.style.left = e.clientX + "px"; menu.style.top = e.clientY + "px"; document.body.appendChild(menu);
  const r = menu.getBoundingClientRect(); menu.style.left = Math.max(4, Math.min(innerWidth - r.width - 4, e.clientX)) + "px"; menu.style.top = Math.max(4, Math.min(innerHeight - r.height - 4, e.clientY)) + "px";
}
// Settings rows: each change is written straight to the database.
function addFields(menu, fields) {
  for (const f of fields) {
    const row = document.createElement("label"), esc = (v) => String(v).replace(/"/g, "&quot;");
    row.append(f.label + " ");
    row.insertAdjacentHTML("beforeend", f.opts ? `<select>${f.opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(f.value) ? "selected" : ""}>${l}</option>`).join("")}</select>`
      : f.type === "check" ? `<input type="checkbox" ${f.value ? "checked" : ""}>`
      : `<input type="${f.type || "text"}" value="${esc(f.value)}" ${f.min != null ? `min="${f.min}"` : ""} ${f.max != null ? `max="${f.max}"` : ""} ${f.step != null ? `step="${f.step}"` : ""} ${f.type === "number" ? 'style="width:4rem"' : ""}>${f.type === "range" ? `<output data-range-output>${esc(f.value)}</output>` : ""}`);
    row.lastElementChild.addEventListener("change", (ev) => {
      const t = ev.target, v = t.type === "checkbox" ? t.checked : t.type === "number" ? +t.value : t.value;
      put(f.path, f.to ? f.to(v) : v === "" || v === false ? null : v);
    });
    if (f.type === "range") row.lastElementChild.previousElementSibling.addEventListener("input", (ev) => { row.querySelector("[data-range-output]").value = ev.target.value; });
    menu.append(row);
  }
}
map.addEventListener("pointerup", release); map.addEventListener("pointercancel", release);

// 3D view toggle (three.js loads on first use)
let v3d = null;
async function setView(on) {
  if (on === !!S.v3d) return;
  try { v3d ||= await import("./view3d.js"); } catch (err) { console.error(err); return; }
  document.body.classList.toggle("is3d", on);
  if (on) document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));   // 3D is for running the game: drop any active build tool
  S.v3d = on ? v3d : null;   // the bar tools (fit, ruler, ping) check this to act on the 3D scene instead
  on ? v3d.open() : v3d.close();
  v3d.setControls(true); document.dispatchEvent(new Event("view3dchange"));
}
{   // 2D / 3D toggle on the Tools strip (the View menu does the same)
  const v3 = addBarButton({ quick: true, id: "v3d", icon: "🧊", label: "3D", title: "Switch between 2D and 3D", toggle: true, onClick: (e, b) => setView(b.classList.contains("on")) });
  document.addEventListener("view3dchange", () => v3.classList.toggle("on", !!S.v3d));
  orderQuickBar(["select", "ruler", "ping", "dice", "grid", "fit", "v3d", "me"]);
}
$("#view-btn").addEventListener("click", (e) => { e.stopPropagation(); const b = e.currentTarget; b.classList.add("on"); dropMenu(b, [[(S.v3d ? "   " : "✓ ") + "2D", () => setView(false)], [(S.v3d ? "✓ " : "   ") + "3D", () => setView(true)], ...(S.isGM ? [["Reference", () => import("./refimage.js").then((m) => m.toggleRefImage())], ["Reference opacity…", () => import("./refimage.js").then((m) => m.openRefControls())], ["Replace…", () => openReplace()]] : [])]); setTimeout(() => document.addEventListener("pointerdown", () => b.classList.remove("on"), { once: true }), 0); });

// Drag a token in 3D: press on it, drag along the floor, release to snap to the cell (same rules as 2D).
{
  let drag = null;
  document.addEventListener("pointerdown", (e) => {
    drag = null;
    if (!S.v3d || e.button !== 0 || !e.target.closest?.("#view3d") || S.v3d.controlsBlocked()) return;
    const id = S.v3d.pickToken(e.clientX, e.clientY);
    if (!id || !S.isGM) return;
    drag = { id, x0: e.clientX, y0: e.clientY, moved: false, cell: null };
    S.v3d.setControls(false);   // keep the camera still while the token moves
  }, true);
  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    const g = S.v3d?.groundAt(e.clientX, e.clientY); if (!g) return;
    drag.moved = true; drag.cell = cellOf(g); S.v3d.dragToken(drag.id, drag.cell);
  });
  const end = () => {
    if (!drag) return; const d = drag; drag = null;
    S.v3d?.setControls(true);
    if (d.moved && d.cell) patch({ [`tokens/${d.id}/x`]: d.cell.x, [`tokens/${d.id}/y`]: d.cell.y });
    S.select3d && d.moved && (S.v3d.clearSelection?.());
  };
  document.addEventListener("pointerup", end, true);
  document.addEventListener("pointercancel", end, true);
}
// Select tool in 3D: click an element to ring it and open the same menu as right-clicking it in 2D.
{
  let down = null;
  document.addEventListener("pointerdown", (e) => { down = S.select3d && S.v3d && e.target.closest?.("#view3d") && e.button === 0 ? { x: e.clientX, y: e.clientY } : null; }, true);
  document.addEventListener("pointerup", (e) => {
    if (!down) return; const d = down; down = null;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
    closeTokMenu();
    const hit = S.v3d.pickAt(e.clientX, e.clientY); if (!hit) return;
    const { type, id } = hit;
    if (type === "token") return showTokenMenu(e, id);
    if (!S.isGM) return;
    if (type === "object") { const o = S.objects[id]; if (o) showActionMenu(e, o.label || o.kind, [...(o.kind === "door" ? [[o.state === "open" ? "Close" : "Open", () => put(`objects/${id}/state`, o.state === "open" ? "closed" : "open")]] : []), [o.hidden ? "Reveal to players" : "Hide from players", () => put(`objects/${id}/hidden`, !o.hidden)], ["Delete", () => put(`objects/${id}`, null)]], settingsFor("object", id).fields); }
    else if (type === "prop") { const a = S.map.props[id]; if (a) showActionMenu(e, a.kind, [[a.hidden ? "Reveal to players" : "Hide from players", () => put(`map/props/${id}/hidden`, a.hidden ? null : true)], ["Delete", () => put(`map/props/${id}`, null)]], settingsFor("prop", id).fields); }
    else if (type === "wall") showActionMenu(e, "Wall", [["Delete", () => put(`map/walls/${id}`, null)]], settingsFor("wall", id).fields);
  }, true);
  document.addEventListener("view3dchange", () => { if (!S.v3d) { S.select3d = false; document.getElementById("bar-select")?.classList.remove("on"); } });
}

// Page-load "Join the table" card (who you are + camera/mic, then opens the video dock).
const setMe = (v) => { me = v; try { localStorage.setItem("vtt-me", JSON.stringify(v)); } catch { /* fine */ } const l = document.querySelector("#bar-me .lbl"); if (l) l.textContent = v ? v.name.slice(0, 8) : "Me"; dispatchEvent(new Event("vtt-me-changed")); };
initChatDock(); initJournal();
initJoin({ loadPcs, setMe, getMe: () => me });
