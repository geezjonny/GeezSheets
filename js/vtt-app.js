// ─────────────────────────────────────────────────────────────────────────────
//  GeezVTT (stripped-down) — one canvas, one sidebar.
//  index.html            → player view
//  index.html?gm=<key>   → GM view
//
//  Maps are .dd2vtt files in the repo's battlemap/ folder (listed from
//  battlemap/index.json, or the GitHub API if there's no index). Firebase only
//  holds what changes during play, per map, keyed by the file name:
//    maps/<key>/geometry     walls/doors/lights (seeded from the file on first open, then editable)
//    maps/<key>/tokens       { id: { x, y, size, name, type, characterId, npcId, avatar, hp, maxHp, hidden, … } }
//    maps/<key>/nightMode
//    session/currentMap (key), session/currentMapFile, session/locked, session/pingsLocked
//    pings, dice/last, presence, characters/pcs, characters/npcs
//    vtt/initiative          (new, see vtt-initiative.js)
// ─────────────────────────────────────────────────────────────────────────────
import { db, DB_URL, sendPing, rollDie } from "./vtt-firebase.js";
import { ref, set, update, remove, onValue, get, onDisconnect } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { TILE, drawToken, drawPings, drawRuler, findSnapPoint, animateDiceResult } from "./vtt-draw.js";
import { parseDd2vtt } from "./vtt-dd2vtt.js";
import { renderSheet } from "./vtt-sheet.js";
import { createInitiative } from "./vtt-initiative.js";

const GM_KEY = "jonny";   // DM view is index.html?gm=jonny — change this to whatever you use
const GM = new URLSearchParams(location.search).get("gm") === GM_KEY;
const PLAYER = !GM;
document.body.classList.add(GM ? "gm" : "player");

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const safeKey = (s) => String(s).replace(/[.#$\[\]\/]/g, "_");
const toArr = (v) => Array.isArray(v) ? v.filter(Boolean) : Object.values(v || {}).filter(Boolean);

// ── State ───────────────────────────────────────────────────────────────────
let mapName = null, mapFile = null, fileGeometry = null;
const layers = {}, layerImg = {};
let geometry = { walls: [], doors: [], lights: [] };
const tokens = {};
let nightMode = "day";
const pcsData = {}, npcsData = {}, session = {}, activePings = {};
let showGrid = true;
let playerName = GM ? "GM" : (localStorage.getItem("geezvtt.playerName") || "");
let myCharId = GM ? "" : (localStorage.getItem("geezvtt.charId") || "");

// camera: screen = world * zoom + (x, y)   (world px = grid units * TILE)
const camera = { x: 0, y: 0, zoom: 1 };
const toScreen = (wx, wy) => [wx * camera.zoom + camera.x, wy * camera.zoom + camera.y];
const toWorld = (sx, sy) => [(sx - camera.x) / camera.zoom, (sy - camera.y) / camera.zoom];

// ── Canvas ──────────────────────────────────────────────────────────────────
const viewport = $("viewport"), canvas = $("vttCanvas"), ctx = canvas.getContext("2d");
let DPR = 1, W = 1, H = 1;
function resize() {
  DPR = window.devicePixelRatio || 1;
  W = Math.max(1, viewport.clientWidth); H = Math.max(1, viewport.clientHeight);
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
}
new ResizeObserver(resize).observe(viewport);
resize();
const pt = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

function toast(msg) {
  $("toast").textContent = msg; $("toast").classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => $("toast").classList.remove("show"), 2400);
}
const logEl = $("log");
function log(html) {
  const d = document.createElement("div"); d.className = "log-entry"; d.innerHTML = `> ${html}`;
  logEl.appendChild(d);
  while (logEl.children.length > 200) logEl.firstChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
}

// ── Firebase listeners ──────────────────────────────────────────────────────
let unsubs = [], loadSeq = 0;
const mapKey = (file) => safeKey(String(file).split("/").pop().replace(/\.[^.]+$/, ""));
const clone = (o) => JSON.parse(JSON.stringify(o));
async function openMap(file) {
  unsubs.forEach(u => u()); unsubs = [];
  const seq = ++loadSeq;
  mapFile = file || null; mapName = file ? mapKey(file) : null; fileGeometry = null;
  for (const k in layers) delete layers[k];
  for (const k in tokens) delete tokens[k];
  geometry = { walls: [], doors: [], lights: [] }; nightMode = "day";
  selection = null; renderCtx();
  $("mapTitle").textContent = mapName || (PLAYER ? "Waiting for the DM…" : "No map");
  if (GM) {
    const sel = $("mapSelect");
    if (mapFile && ![...sel.options].some(o => o.value === mapFile)) sel.insertAdjacentHTML("beforeend", `<option value="${esc(mapFile)}">${esc(mapName)}</option>`);
    sel.value = mapFile || "";
    if (mapFile) localStorage.setItem("geezvtt.gmMapFile", mapFile);
  }
  if (!mapFile) return;

  // background + original walls come from the file
  $("mapTitle").textContent = `${mapName} (loading…)`;
  try {
    const r = await fetch(mapFile);
    if (!r.ok) throw new Error(r.status);
    const m = parseDd2vtt(await r.json(), rid);
    if (seq !== loadSeq) return;
    fileGeometry = m.geometry;
    layers.base = m.layer;
    const img = new Image();
    img.onload = () => { if (seq === loadSeq) fitMap(); };
    img.src = m.layer.url;
    layerImg.base = { url: mapFile, img };
    $("mapTitle").textContent = mapName;
  } catch (e) {
    if (seq !== loadSeq) return;
    $("mapTitle").textContent = `${mapName} (couldn't load)`;
    log(`Couldn't load <strong>${esc(mapFile)}</strong>. Is it in the battlemap/ folder?`);
    return;
  }

  // live play state from Firebase
  const base = `maps/${mapName}`;
  unsubs.push(onValue(ref(db, `${base}/geometry`), snap => {
    if (!snap.exists()) {
      geometry = clone(fileGeometry);
      if (GM) set(ref(db, `${base}/geometry`), fileGeometry);   // first open: seed walls/doors/lights from the file
    } else {
      const g = snap.val() || {};
      geometry = { ...g, walls: toArr(g.walls), doors: toArr(g.doors), lights: toArr(g.lights) };
    }
    if (document.activeElement !== $("darkRange")) {
      const a = Math.round((geometry.lightingParams?.blackAlpha ?? 1) * 100);
      $("darkRange").value = a; $("darkVal").textContent = a + "%";
    }
    if (selection && selection.kind !== "token") renderCtx();
  }));
  unsubs.push(onValue(ref(db, `${base}/tokens`), snap => {
    for (const k in tokens) delete tokens[k];
    Object.assign(tokens, snap.val() || {});
    if (selection?.kind === "token" && !tokens[selection.id]) selection = null;
    if (selection?.kind === "token" && document.activeElement?.closest?.("#ctxBody") == null) renderCtx();
    initiative.render();
  }));
  unsubs.push(onValue(ref(db, `${base}/nightMode`), snap => {
    nightMode = snap.val() || "day";
    $("nightBtn").textContent = nightMode === "night" ? "🌙 Night" : "☀ Day";
    $("nightBtn").classList.toggle("active", nightMode === "night");
  }));
}

onValue(ref(db, "characters/pcs"), snap => {
  for (const k in pcsData) delete pcsData[k];
  Object.assign(pcsData, snap.val() || {});
  if (PLAYER && !$("login").hidden) renderLogin();
  if (PLAYER) renderPlayerSheet();
  if (GM && (tool === "token" || selection?.kind === "token") && !document.activeElement?.closest?.("#ctxBody")) renderCtx();
});
if (GM) onValue(ref(db, "characters/npcs"), snap => {
  for (const k in npcsData) delete npcsData[k];
  Object.assign(npcsData, snap.val() || {});
  if (tool === "token") renderCtx();
});
onValue(ref(db, "session"), snap => {
  Object.assign(session, { currentMap: null, locked: false, pingsLocked: false }, snap.val() || {});
  $("lockBtn").textContent = session.locked ? "🔒 Locked" : "🔓 Moves";
  $("lockBtn").classList.toggle("active", !!session.locked);
  if (PLAYER && (session.currentMapFile || null) !== mapFile) openMap(session.currentMapFile || null);
});
onValue(ref(db, "pings"), snap => {
  const data = snap.val() || {}, now = Date.now();
  for (const [id, p] of Object.entries(data)) {
    if (!activePings[id] && now - p.t < 4000) {
      activePings[id] = { wx: p.x * TILE + TILE / 2, wy: p.y * TILE + TILE / 2, name: p.name, startTime: now, id };
      log(`<strong>${esc(p.name)}</strong> pinged`);
    }
  }
});

// Dice: rolls go through rollDie (dice/last). The roller then adds a label and modifier to the
// same record so everyone sees "Rapier (+7): 12 + 7 = 19", in the result box and the log.
let pendingKind = null;
let lastDiceT = Date.now();
onValue(ref(db, "dice/last"), snap => {
  const first = snap.val();
  if (!first || first.t <= lastDiceT) return;
  lastDiceT = first.t;
  const kind = first.roller === playerName ? pendingKind : null;
  pendingKind = null;
  // give the roller's label/modifier a moment to land on the record
  setTimeout(async () => {
    let d = first;
    try { const v = (await get(ref(db, "dice/last"))).val(); if (v?.t === first.t) d = v; } catch {}
    const mod = Number(d.mod) || 0, label = d.label || "";
    const total = d.result + mod;
    const sum = mod ? `${d.result} ${mod >= 0 ? "+" : "−"} ${Math.abs(mod)} = ${total}` : `${d.result}`;
    $("diceWho").textContent = `${d.roller}: ${label || "d" + d.sides}`;
    animateDiceResult(d, $("diceNum"), () => {
      if (mod) $("diceNum").textContent = sum;
      showRoll(`${d.roller}: ${label || "d" + d.sides}`, sum);
      log(`<strong>${esc(d.roller)}</strong> rolled ${label ? esc(label) + " " : ""}d${d.sides}: <strong>${sum}</strong>`);
      if (kind === "Initiative" && myCharId && initiative.setInitFor(myCharId, total)) toast(`Initiative set to ${total}`);
    });
  }, 150);
});
function roll(sides, mod = 0, label = "") {
  if (!playerName) { toast("Pick your character first"); showLogin(); return; }
  pendingKind = label;
  rollDie(sides, playerName);
  if (mod || label) update(ref(db, "dice/last"), { mod: mod || 0, label: label + (mod ? ` (${mod >= 0 ? "+" : ""}${mod})` : "") }).catch(() => {});
}

function heartbeat() {
  if (!playerName) return;
  const r = ref(db, `presence/${safeKey(playerName)}`);
  set(r, { name: playerName, page: "vtt", t: Date.now() }).catch(() => {});
  try { onDisconnect(r).remove(); } catch {}
}
setInterval(heartbeat, 30000);

// ── NPCs: characters/npcs plus any characters/pcs record marked record_type "npc" ──
const nameOf = (c, key) => String(c?.name || c?.identity?.name || c?.basic?.name || c?.info?.name || c?.character_name || c?.title || key || "").trim();
const SIZES = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
function npcList() {
  const out = [];
  const add = (key, c, src) => {
    if (!c || typeof c !== "object") return;
    const name = nameOf(c, key);
    if (!name) return;
    const hp = Number(c.combat?.hp_max ?? c.hp_max ?? c.combat?.hp_current ?? c.hp ?? c.stats?.hp) || 10;
    const dex = Number(c.stats?.dex ?? c.abilities?.dex?.score ?? c.abilities?.dex ?? c.dex) || 10;
    const size = Number(c.vtt_profile?.token_size) || SIZES[String(c.size || c.identity?.size || "").toLowerCase()] || 1;
    out.push({ key, src, name, hp, dex, size, avatar: c.vtt_profile?.avatar || c.avatar || "", campaign: c.campaign || "", stats: { dex } });
  };
  for (const [k, c] of Object.entries(npcsData)) add(k, c, "npcs");
  for (const [k, c] of Object.entries(pcsData)) if (c?.record_type === "npc") add(k, c, "pcs");
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Initiative ──────────────────────────────────────────────────────────────
const initiative = createInitiative({
  db, el: $("initBody"), gm: GM,
  ctx: {
    tokens: () => tokens, pcs: () => pcsData, npcs: () => npcList(), myCharId: () => myCharId, log,
    focusToken: (id) => {
      const t = tokens[id]; if (!t) { toast("That token isn't on this map"); return; }
      const s = t.size || 1;
      camera.x = W / 2 - (t.x + s / 2) * TILE * camera.zoom; camera.y = H / 2 - (t.y + s / 2) * TILE * camera.zoom;
      if (GM) { selection = { kind: "token", id }; renderCtx(); }
    },
    rollMine: () => roll(20, Number(pcsData[myCharId]?.combat?.initiative_bonus) || 0, "Initiative"),
  }
});

// ── Map list (GM): battlemap/index.json, else the GitHub API listing of battlemap/ ──
const REPO = (() => {
  const seg = location.pathname.split("/").filter(Boolean)[0];
  if (location.hostname.endsWith(".github.io") && seg && !seg.includes(".")) return { owner: location.hostname.split(".")[0], repo: seg };
  return { owner: "geezjonny", repo: "GeezSheets" };
})();
async function loadMapList() {
  let files = [];
  try {
    const r = await fetch("battlemap/index.json", { cache: "no-store" });
    if (r.ok) files = (await r.json()).map(f => typeof f === "string" ? f : f.file).filter(Boolean);
  } catch {}
  if (!files.length) {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}/contents/battlemap`);
      if (r.ok) files = (await r.json()).filter(x => /\.dd2vtt$/i.test(x.name)).map(x => x.name);
    } catch {}
  }
  files = [...new Set(files.map(f => f.startsWith("battlemap/") ? f : `battlemap/${f}`))].sort((a, b) => a.localeCompare(b));
  $("mapSelect").innerHTML = `<option value="">${files.length ? "Open map…" : "No maps found in battlemap/"}</option>`
    + files.map(f => `<option value="${esc(f)}">${esc(mapKey(f))}</option>`).join("") + `<option value="__refresh">↻ Refresh list</option>`;
  if (mapFile) {
    if (!files.includes(mapFile)) $("mapSelect").insertAdjacentHTML("beforeend", `<option value="${esc(mapFile)}">${esc(mapName)}</option>`);
    $("mapSelect").value = mapFile;
  }
}

// ── Drawing ─────────────────────────────────────────────────────────────────
let darkCanvas = null;
function drawDarkness() {
  if (nightMode !== "night" && geometry.timeOfDay !== "night") return;
  if (!darkCanvas) darkCanvas = document.createElement("canvas");
  if (darkCanvas.width !== canvas.width || darkCanvas.height !== canvas.height) { darkCanvas.width = canvas.width; darkCanvas.height = canvas.height; }
  const d = darkCanvas.getContext("2d");
  d.setTransform(DPR, 0, 0, DPR, 0, 0);
  d.globalCompositeOperation = "source-over";
  d.clearRect(0, 0, W, H);
  const alpha = (geometry.lightingParams?.blackAlpha ?? 1) * (PLAYER ? 0.92 : 0.5);
  d.fillStyle = `rgba(0,0,8,${alpha})`; d.fillRect(0, 0, W, H);
  d.globalCompositeOperation = "destination-out";
  for (const l of geometry.lights) {
    if ((l.floor || 0) !== 0) continue;
    const [sx, sy] = toScreen(l.x * TILE, l.y * TILE);
    const r = Math.max(0.5, Number(l.range) || 4) * TILE * camera.zoom;
    const g = d.createRadialGradient(sx, sy, r * 0.15, sx, sy, r);
    g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
    d.fillStyle = g; d.beginPath(); d.arc(sx, sy, r, 0, Math.PI * 2); d.fill();
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(darkCanvas, 0, 0); ctx.restore();
}

function drawGeometryGM() {
  const lw = 3 / camera.zoom;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(244,63,94,.9)"; ctx.lineWidth = lw;
  ctx.beginPath();
  for (const w of geometry.walls) { if ((w.floor || 0) !== 0) continue; ctx.moveTo(w.x1 * TILE, w.y1 * TILE); ctx.lineTo(w.x2 * TILE, w.y2 * TILE); }
  ctx.stroke();
  for (const d of geometry.doors) {
    if ((d.floor || 0) !== 0) continue;
    const sel = selection?.kind === "door" && selection.id === d.id;
    ctx.strokeStyle = sel ? "#fff" : d.closed === false ? "rgba(74,222,128,.95)" : "rgba(96,165,250,.95)";
    ctx.lineWidth = lw * 2;
    ctx.setLineDash(d.closed === false ? [6 / camera.zoom, 5 / camera.zoom] : []);
    ctx.beginPath(); ctx.moveTo(d.x1 * TILE, d.y1 * TILE); ctx.lineTo(d.x2 * TILE, d.y2 * TILE); ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const l of geometry.lights) {
    if ((l.floor || 0) !== 0) continue;
    const x = l.x * TILE, y = l.y * TILE, sel = selection?.kind === "light" && selection.id === l.id;
    ctx.strokeStyle = sel ? "#fff" : "rgba(255,220,120,.35)"; ctx.lineWidth = 1 / camera.zoom; ctx.setLineDash([4 / camera.zoom, 4 / camera.zoom]);
    ctx.beginPath(); ctx.arc(x, y, (Number(l.range) || 4) * TILE, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#ffd76a"; ctx.beginPath(); ctx.arc(x, y, 7 / camera.zoom, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#000"; ctx.stroke();
  }
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#09090b"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(DPR * camera.zoom, 0, 0, DPR * camera.zoom, DPR * camera.x, DPR * camera.y);

  for (const [id, l] of Object.entries(layers)) {
    if ((l.floor || 0) !== 0) continue;
    const im = layerImg[id]?.img;
    if (im?.complete && im.naturalWidth) ctx.drawImage(im, l.x * TILE, l.y * TILE, l.w * TILE, l.h * TILE);
  }

  if (showGrid) {
    const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(W, H);
    ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1 / camera.zoom;
    ctx.beginPath();
    for (let x = Math.floor(x0 / TILE) * TILE; x <= x1; x += TILE) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = Math.floor(y0 / TILE) * TILE; y <= y1; y += TILE) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
  }
  if (GM) drawGeometryGM();

  // whose turn it is
  const curId = initiative.currentId();
  const visible = (t) => (t.floor || 0) === 0 && !(PLAYER && t.hidden);
  if (curId && tokens[curId] && visible(tokens[curId])) {
    const t = dragTok?.id === curId ? { ...tokens[curId], ...dragTok.pos } : tokens[curId], s = t.size || 1;
    ctx.strokeStyle = "rgba(129,140,248,.95)"; ctx.lineWidth = 4 / camera.zoom;
    ctx.beginPath(); ctx.arc((t.x + s / 2) * TILE, (t.y + s / 2) * TILE, s * TILE * 0.62, 0, Math.PI * 2); ctx.stroke();
  }

  const myTok = PLAYER ? Object.entries(tokens).find(([, t]) => t.characterId === myCharId)?.[0] : undefined;
  const order = Object.entries(tokens).filter(([, t]) => visible(t)).sort((a, b) => (a[1].type === "pc") - (b[1].type === "pc"));
  for (const [id, t] of order) {
    drawToken(ctx, dragTok?.id === id ? { ...t, ...dragTok.pos } : t, camera.zoom, { pc: t.characterId ? pcsData[t.characterId] : null, gm: GM, mine: id === myTok, alpha: t.hidden ? 0.45 : 1 });
  }

  if (selection?.kind === "token" && tokens[selection.id]) {
    const t = tokens[selection.id], s = t.size || 1;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2 / camera.zoom; ctx.setLineDash([5 / camera.zoom, 4 / camera.zoom]);
    ctx.strokeRect(t.x * TILE - 3 / camera.zoom, t.y * TILE - 3 / camera.zoom, s * TILE + 6 / camera.zoom, s * TILE + 6 / camera.zoom);
    ctx.setLineDash([]);
  }
  if (drawing) {
    ctx.strokeStyle = drawing.kind === "door" ? "rgba(96,165,250,.9)" : "rgba(244,63,94,.8)";
    ctx.lineWidth = (drawing.kind === "door" ? 6 : 3) / camera.zoom; ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
    ctx.beginPath(); ctx.moveTo(drawing.a.x * TILE, drawing.a.y * TILE); ctx.lineTo(drawing.b.x * TILE, drawing.b.y * TILE); ctx.stroke(); ctx.setLineDash([]);
  }

  drawDarkness();

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawPings(ctx, activePings, toScreen);
  drawRuler(ctx, rulerStart, rulerEnd, toScreen);
  requestAnimationFrame(draw);
}

function fitMap() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const l of Object.values(layers)) { minX = Math.min(minX, l.x); minY = Math.min(minY, l.y); maxX = Math.max(maxX, l.x + l.w); maxY = Math.max(maxY, l.y + l.h); }
  if (!isFinite(minX)) {
    for (const p of Object.values(tokens)) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x + 1); maxY = Math.max(maxY, p.y + 1); }
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 20; maxY = 15; }
  const w = (maxX - minX) * TILE, h = (maxY - minY) * TILE;
  camera.zoom = clamp(Math.min((W - 40) / w, (H - 40) / h), 0.05, 3);
  camera.x = W / 2 - (minX * TILE + w / 2) * camera.zoom;
  camera.y = H / 2 - (minY * TILE + h / 2) * camera.zoom;
}

// ── Tools & input ───────────────────────────────────────────────────────────
let tool = "select";
let selection = null;          // { kind: 'token'|'light'|'door', id }
let drawing = null;            // wall/door preview { kind, a, b }
let wallChain = null;
let rulerStart = null, rulerEnd = null;
let dragTok = null, dragLight = null, pan = null;
let tokenTemplate = null;
const pointers = new Map();
let pinch = null;

const HINTS = {
  select: GM ? "Drag tokens to move them. Click a door to open or close it, a light to edit it. Right-drag or wheel to pan and zoom. F fits the map." : "Drag your own token. Right-drag or two fingers to pan, wheel or pinch to zoom.",
  ruler: "Drag to measure. Starts from a token's centre if you begin on one.",
  ping: "Click the map to ping everyone.",
  token: "Pick a token below, then click the map to place it.",
  wall: "Click to chain wall points. Double-click, right-click or Esc ends the chain. Points snap to half squares; hold Alt to place freely.",
  door: "Drag from one end of the door to the other.",
  light: "Click to place a light. In Select, drag a bulb to move it.",
  erase: "Click a token, light, door or wall to delete it.",
};

const snapHalf = (v, e) => (e?.altKey ? v : Math.round(v * 2) / 2);
function worldAt(e) { const [sx, sy] = pt(e); const [wx, wy] = toWorld(sx, sy); return { sx, sy, wx, wy, tx: wx / TILE, ty: wy / TILE }; }
function tokenAt(tx, ty) {
  const list = Object.entries(tokens).filter(([, t]) => (t.floor || 0) === 0 && !(PLAYER && t.hidden));
  for (let i = list.length - 1; i >= 0; i--) { const [id, t] = list[i]; const s = t.size || 1; if (tx >= t.x && tx < t.x + s && ty >= t.y && ty < t.y + s) return id; }
  return null;
}
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
const tol = () => 10 / camera.zoom / TILE;
function nearest(list, tx, ty) {
  let best = null, bestD = tol();
  list.forEach((s, i) => { if ((s.floor || 0) !== 0) return; const d = segDist(tx, ty, s.x1, s.y1, s.x2, s.y2); if (d < bestD) { bestD = d; best = i; } });
  return best;
}
function lightAt(tx, ty) {
  let best = null, bestD = Math.max(0.35, tol());
  geometry.lights.forEach((l, i) => { if ((l.floor || 0) !== 0) return; const d = Math.hypot(l.x - tx, l.y - ty); if (d < bestD) { bestD = d; best = i; } });
  return best;
}
const saveGeo = (key) => mapName && set(ref(db, `maps/${mapName}/geometry/${key}`), geometry[key]);
const touchMap = () => mapName && set(ref(db, `maps/${mapName}/updatedAt`), Date.now()).catch(() => {});
const needMap = () => { if (!mapName) { toast("Open a map first"); return true; } return false; };

function setTool(t) {
  tool = t;
  document.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("active", b.dataset.tool === t));
  drawing = null; wallChain = null;
  if (t !== "ruler") rulerStart = rulerEnd = null;
  $("toolHint").textContent = HINTS[t] || "";
  $("toolHint").hidden = t === "select";
  canvas.style.cursor = { select: "default", erase: "not-allowed" }[t] || "crosshair";
  renderCtx();
}
document.querySelectorAll("[data-tool]").forEach(b => b.onclick = () => setTool(b.dataset.tool));

canvas.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const [sx, sy] = pt(e);
  const z = clamp(camera.zoom * Math.exp(-e.deltaY * 0.0015), 0.05, 6);
  const [wx, wy] = toWorld(sx, sy);
  camera.zoom = z; camera.x = sx - wx * z; camera.y = sy - wy * z;
}, { passive: false });

canvas.addEventListener("pointerdown", e => {
  canvas.setPointerCapture(e.pointerId);
  const [px, py] = pt(e);
  pointers.set(e.pointerId, { x: px, y: py });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: camera.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, x: camera.x, y: camera.y };
    pan = null; dragTok = null; return;
  }
  const { sx, sy, wx, wy, tx, ty } = worldAt(e);
  if (e.button === 1 || (e.button === 2 && tool !== "wall")) { pan = { sx, sy, x: camera.x, y: camera.y }; return; }

  if (tool === "ping") {
    if (PLAYER && session.pingsLocked) { toast("The DM has paused pings"); return; }
    if (!playerName) { showLogin(); return; }
    sendPing(Math.floor(tx), Math.floor(ty), playerName); return;
  }
  if (tool === "ruler") { rulerStart = findSnapPoint(tokens, wx, wy) || [wx, wy]; rulerEnd = [wx, wy]; return; }
  if (GM && tool === "wall") {
    if (needMap()) return;
    if (e.button === 2) { wallChain = null; drawing = null; return; }
    const p = { x: snapHalf(tx, e), y: snapHalf(ty, e) };
    if (wallChain && (wallChain.x !== p.x || wallChain.y !== p.y)) {
      geometry.walls.push({ id: rid("g"), floor: 0, x1: wallChain.x, y1: wallChain.y, x2: p.x, y2: p.y });
      saveGeo("walls"); touchMap();
    }
    wallChain = p; drawing = { kind: "wall", a: p, b: p }; return;
  }
  if (GM && tool === "door") { if (needMap()) return; const p = { x: snapHalf(tx, e), y: snapHalf(ty, e) }; drawing = { kind: "door", a: p, b: p }; return; }
  if (GM && tool === "light") {
    if (needMap()) return;
    const l = { id: rid("g"), floor: 0, x: +tx.toFixed(3), y: +ty.toFixed(3), range: 4, color: "ffFFEDCF", intensity: 1, shadows: true };
    geometry.lights.push(l); saveGeo("lights"); touchMap();
    selection = { kind: "light", id: l.id }; renderCtx(); return;
  }
  if (GM && tool === "token") {
    if (needMap()) return;
    if (!tokenTemplate) { toast("Pick a token in the sidebar first"); return; }
    const id = "tok_" + Date.now(), s = tokenTemplate.size || 1;
    const tok = { id, floor: 0, facing: 0, x: Math.floor(tx - (s - 1) / 2), y: Math.floor(ty - (s - 1) / 2), size: s, name: tokenTemplate.name, lookupName: tokenTemplate.name, type: tokenTemplate.type, hp: tokenTemplate.hp ?? 10, maxHp: tokenTemplate.maxHp ?? 10 };
    if (tokenTemplate.characterId) tok.characterId = tokenTemplate.characterId;
    if (tokenTemplate.npcId) tok.npcId = tokenTemplate.npcId;
    if (tokenTemplate.avatar) tok.avatar = tokenTemplate.avatar;
    set(ref(db, `maps/${mapName}/tokens/${id}`), tok); touchMap();
    log(`Placed <strong>${esc(tok.name)}</strong> at (${tok.x}, ${tok.y})`);
    return;
  }
  if (GM && tool === "erase") { eraseAt(tx, ty); return; }

  // select / move
  const tid = tokenAt(tx, ty);
  if (tid) {
    const t = tokens[tid];
    const mine = GM || (t.characterId && t.characterId === myCharId);
    if (GM) { selection = { kind: "token", id: tid }; renderCtx(); }
    if (mine && !(PLAYER && session.locked)) { dragTok = { id: tid, pos: { x: t.x, y: t.y }, offX: tx - t.x, offY: ty - t.y, moved: false }; return; }
    if (PLAYER && mine && session.locked) toast("Token movement is locked by the DM");
  } else if (GM) {
    const di = nearest(geometry.doors, tx, ty);
    if (di !== null) {
      const d = geometry.doors[di]; d.closed = d.closed === false; saveGeo("doors");
      selection = { kind: "door", id: d.id }; renderCtx(); return;
    }
    const li = lightAt(tx, ty);
    if (li !== null) { selection = { kind: "light", id: geometry.lights[li].id }; renderCtx(); dragLight = { i: li }; return; }
    if (selection) { selection = null; renderCtx(); }
  }
  pan = { sx, sy, x: camera.x, y: camera.y };
});

canvas.addEventListener("pointermove", e => {
  const [px, py] = pt(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: px, y: py });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const z = clamp(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, 0.05, 6);
    const wx = (pinch.cx - pinch.x) / pinch.zoom, wy = (pinch.cy - pinch.y) / pinch.zoom;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    camera.zoom = z; camera.x = cx - wx * z; camera.y = cy - wy * z; return;
  }
  const { sx, sy, wx, wy, tx, ty } = worldAt(e);
  if (pan) { camera.x = pan.x + sx - pan.sx; camera.y = pan.y + sy - pan.sy; return; }
  if (rulerStart && e.buttons) { rulerEnd = [wx, wy]; return; }
  if (drawing && tool === "wall") { drawing.b = { x: snapHalf(tx, e), y: snapHalf(ty, e) }; return; }
  if (drawing && tool === "door" && e.buttons) { drawing.b = { x: snapHalf(tx, e), y: snapHalf(ty, e) }; return; }
  if (dragTok) { dragTok.pos = { x: tx - dragTok.offX, y: ty - dragTok.offY }; dragTok.moved = true; return; }
  if (dragLight) { const l = geometry.lights[dragLight.i]; if (l) { l.x = +tx.toFixed(3); l.y = +ty.toFixed(3); dragLight.moved = true; } }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; return; }
  pan = null;
  if (drawing && tool === "door") {
    const { a, b } = drawing;
    if (a.x !== b.x || a.y !== b.y) { geometry.doors.push({ id: rid("g"), floor: 0, closed: true, freestanding: false, x1: a.x, y1: a.y, x2: b.x, y2: b.y }); saveGeo("doors"); touchMap(); }
    drawing = null;
  }
  if (dragTok) {
    const t = tokens[dragTok.id];
    if (t && dragTok.moved) {
      const x = Math.round(dragTok.pos.x), y = Math.round(dragTok.pos.y);
      if (x !== t.x || y !== t.y) {
        t.x = x; t.y = y;
        update(ref(db, `maps/${mapName}/tokens/${dragTok.id}`), { x, y });
        log(`<strong>${esc(t.name)}</strong> moved to (${x}, ${y})`);
      }
    }
    dragTok = null;
  }
  if (dragLight) { if (dragLight.moved) saveGeo("lights"); dragLight = null; }
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("dblclick", () => { if (tool === "wall") { wallChain = null; drawing = null; } });
addEventListener("keydown", e => {
  if (e.target.closest("input, textarea, select")) return;
  if (e.key === "Escape") { $("mapMenu").hidden = true; wallChain = null; drawing = null; rulerStart = rulerEnd = null; if (selection) { selection = null; renderCtx(); } }
  if ((e.key === "Delete" || e.key === "Backspace") && selection && GM) deleteSelection();
  if (e.key === "f") fitMap();
});

function eraseAt(tx, ty) {
  if (needMap()) return;
  const tid = tokenAt(tx, ty);
  if (tid) { remove(ref(db, `maps/${mapName}/tokens/${tid}`)); return; }
  const li = lightAt(tx, ty);
  if (li !== null) { geometry.lights.splice(li, 1); saveGeo("lights"); return; }
  const di = nearest(geometry.doors, tx, ty);
  if (di !== null) { geometry.doors.splice(di, 1); saveGeo("doors"); return; }
  const wi = nearest(geometry.walls, tx, ty);
  if (wi !== null) { geometry.walls.splice(wi, 1); saveGeo("walls"); }
}
function deleteSelection() {
  if (!selection) return;
  if (selection.kind === "token") remove(ref(db, `maps/${mapName}/tokens/${selection.id}`));
  if (selection.kind === "light") { geometry.lights = geometry.lights.filter(l => l.id !== selection.id); saveGeo("lights"); }
  if (selection.kind === "door") { geometry.doors = geometry.doors.filter(d => d.id !== selection.id); saveGeo("doors"); }
  selection = null; renderCtx();
}

// ── Map controls (GM) ───────────────────────────────────────────────────────
$("mapSelect").onchange = (e) => {
  const v = e.target.value;
  if (v === "__refresh") { e.target.value = mapFile || ""; loadMapList(); return; }
  if (v) openMap(v); else e.target.value = mapFile || "";
};
$("showPlayers").onclick = () => { if (needMap()) return; update(ref(db, "session"), { currentMap: mapName, currentMapFile: mapFile }); log(`Players now see <strong>${esc(mapName)}</strong>`); };
$("resetWalls").onclick = () => {
  if (needMap() || !fileGeometry) return;
  if (confirm("Replace this map's walls, doors and lights with the ones in the file? Your edits to them will be lost.")) { set(ref(db, `maps/${mapName}/geometry`), fileGeometry); log("Walls, doors and lights reset from the file"); }
};
$("nightBtn").onclick = () => { if (!needMap()) set(ref(db, `maps/${mapName}/nightMode`), nightMode === "night" ? "day" : "night"); };
$("gridBtn").onclick = () => { showGrid = !showGrid; $("gridBtn").classList.toggle("active", showGrid); };
$("lockBtn").onclick = () => set(ref(db, "session/locked"), !session.locked);
$("darkRange").oninput = (e) => {
  $("darkVal").textContent = e.target.value + "%";
  geometry.lightingParams = { ...(geometry.lightingParams || {}), blackAlpha: e.target.value / 100 };
};
$("darkRange").onchange = (e) => { if (!needMap()) set(ref(db, `maps/${mapName}/geometry/lightingParams/blackAlpha`), e.target.value / 100); };
// ── Floating UI: map menu, side panels, zoom ────────────────────────────────
$("mapBtn").onclick = () => { if (GM) $("mapMenu").hidden = !$("mapMenu").hidden; };
function openPanel(name) {
  document.querySelectorAll(".fpanel").forEach(p => p.hidden = p.id !== `panel-${name}` || !p.hidden);
  document.querySelectorAll("[data-panel]").forEach(b => b.classList.toggle("active", !$(`panel-${b.dataset.panel}`).hidden));
  if (name === "log") logEl.scrollTop = logEl.scrollHeight;
}
document.querySelectorAll("[data-panel]").forEach(b => b.onclick = () => openPanel(b.dataset.panel));
document.querySelectorAll(".fpanel [data-close]").forEach(b => b.onclick = () => { b.closest(".fpanel").hidden = true; document.querySelectorAll("[data-panel]").forEach(x => x.classList.toggle("active", !$(`panel-${x.dataset.panel}`).hidden)); });
canvas.addEventListener("pointerdown", () => { $("mapMenu").hidden = true; }, true);
function zoomBy(f) {
  const z = clamp(camera.zoom * f, 0.05, 6), cx = W / 2, cy = H / 2;
  const [wx, wy] = toWorld(cx, cy);
  camera.zoom = z; camera.x = cx - wx * z; camera.y = cy - wy * z;
}
$("zoomIn").onclick = () => zoomBy(1.25);
$("zoomOut").onclick = () => zoomBy(0.8);
$("zoomFit").onclick = () => fitMap();
function showRoll(who, num) {
  const chip = $("rollChip");
  $("rollWho").textContent = who; $("rollNum").textContent = num;
  chip.hidden = false; requestAnimationFrame(() => chip.classList.remove("fade"));
  clearTimeout(showRoll._t);
  showRoll._t = setTimeout(() => { chip.classList.add("fade"); setTimeout(() => { if (chip.classList.contains("fade")) chip.hidden = true; }, 300); }, 4000);
}

// ── Context panel (GM): token picker or inspector ───────────────────────────
$("ctxClose").onclick = () => { if (tool === "token") setTool("select"); selection = null; renderCtx(); };
let pickerCamp = null, npcSearch = "";
function renderCtx() {
  const panel = $("ctxPanel"), body = $("ctxBody");
  const show = (title) => { panel.hidden = false; $("ctxTitle").textContent = title; };
  if (!GM) { panel.hidden = true; return; }

  if (tool === "token") {
    show("Place a token");
    const camps = [...new Set(Object.values(pcsData).map(c => c?.campaign).filter(c => c && c !== "__oracle__"))].sort();
    const camp = pickerCamp ?? camps[0] ?? "";
    const tpls = [
      ...Object.entries(pcsData).filter(([k, c]) => nameOf(c, "") && c.record_type !== "npc" && (!camp || c.campaign === camp))
        .map(([id, c]) => ({ name: nameOf(c, id), type: "pc", characterId: id, avatar: c.vtt_profile?.avatar || "", size: 1, hp: c.combat?.hp_current, maxHp: c.combat?.hp_max })),
      ...npcList().filter(n => (!camp || !n.campaign || n.campaign === camp) && (!npcSearch || n.name.toLowerCase().includes(npcSearch.toLowerCase())))
        .map(n => ({ name: n.name, type: "npc", npcId: n.key, avatar: n.avatar, size: n.size, hp: n.hp, maxHp: n.hp }))
    ];
    const picked = (t) => tokenTemplate && tokenTemplate.name === t.name && tokenTemplate.type === t.type;
    const btn = (t, i) => `<button class="${picked(t) ? "active" : ""}" data-tpl="${i}" style="text-align:left">${esc(t.name)}</button>`;
    body.innerHTML = `
      <h3>Party</h3>
      ${camps.length ? `<select id="tplCamp">${camps.map(c => `<option ${c === camp ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>` : ""}
      <div class="grid-2">${tpls.map((t, i) => t.type === "pc" ? btn(t, i) : "").join("") || `<span class="muted">No characters</span>`}</div>
      <div class="flex-row"><h3>NPCs</h3><span class="val-badge">${npcList().filter(n => !camp || !n.campaign || n.campaign === camp).length} in this campaign</span></div>
      <input type="text" id="npcSearch" placeholder="Search NPCs…" value="${esc(npcSearch)}">
      <div class="grid-2" style="max-height:220px;overflow-y:auto">${tpls.map((t, i) => t.type === "npc" ? btn(t, i) : "").join("") || `<span class="muted">${npcSearch ? "No match" : "No NPCs found under characters/npcs, or characters/pcs marked as NPC"}</span>`}</div>
      <h3>Custom</h3>
      <div class="row"><input type="text" id="tplName" placeholder="Goblin" style="flex:1"><select id="tplSize" style="width:96px"><option value="1">Medium</option><option value="0.5">Tiny</option><option value="2">Large</option><option value="3">Huge</option><option value="4">Gargantuan</option></select></div>
      <div class="row"><input type="number" id="tplHp" placeholder="HP" style="width:70px"><button id="tplUse" class="primary" style="flex:1">Use this</button></div>
      <div class="hint">${tokenTemplate ? `Click the map to place <b>${esc(tokenTemplate.name)}</b>.` : "Pick a token, then click the map."}</div>`;
    body.querySelectorAll("[data-tpl]").forEach(b => b.onclick = () => { tokenTemplate = tpls[+b.dataset.tpl]; renderCtx(); });
    $("npcSearch").oninput = (e) => {
      npcSearch = e.target.value; const pos = e.target.selectionStart; renderCtx();
      const el = $("npcSearch"); el.focus(); el.setSelectionRange(pos, pos);
    };
    if ($("tplCamp")) $("tplCamp").onchange = (e) => { pickerCamp = e.target.value; renderCtx(); };
    $("tplUse").onclick = () => {
      const n = $("tplName").value.trim(); if (!n) return;
      const hp = +$("tplHp").value || 10;
      tokenTemplate = { name: n, type: "npc", size: +$("tplSize").value, hp, maxHp: hp }; renderCtx();
    };
    return;
  }
  if (selection?.kind === "token") {
    const t = tokens[selection.id]; if (!t) { selection = null; return renderCtx(); }
    show(t.name || "Token");
    const id = selection.id, c = t.characterId ? pcsData[t.characterId] : null;
    body.innerHTML = `
      <label>Name<input type="text" id="tName" value="${esc(t.name)}"></label>
      ${c ? "" : `<div class="grid-2"><label>HP<input type="number" id="tHp" value="${esc(t.hp ?? "")}"></label><label>Max HP<input type="number" id="tMax" value="${esc(t.maxHp ?? "")}"></label></div>`}
      <label>Size<select id="tSize">${[[0.5, "Tiny"], [1, "Small / Medium"], [2, "Large"], [3, "Huge"], [4, "Gargantuan"]].map(([v, l]) => `<option value="${v}" ${(t.size || 1) == v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="row"><input type="checkbox" id="tHidden" ${t.hidden ? "checked" : ""}> Hidden from players</label>
      <label class="row"><input type="checkbox" id="tHideName" ${t.hideName ? "checked" : ""}> Hide name</label>
      <label class="row"><input type="checkbox" id="tHideHp" ${t.hideHp ? "checked" : ""}> Hide HP</label>
      ${c ? `<details><summary class="muted" style="cursor:pointer">Character sheet</summary><div id="insSheet" style="display:flex;flex-direction:column;gap:7px;margin-top:6px"></div></details>` : ""}
      <button class="danger" id="tDel">Delete token</button>`;
    const up = (patch) => update(ref(db, `maps/${mapName}/tokens/${id}`), patch);
    $("tName").onchange = (e) => up({ name: e.target.value, lookupName: e.target.value });
    if ($("tHp")) { $("tHp").onchange = (e) => up({ hp: +e.target.value }); $("tMax").onchange = (e) => up({ maxHp: +e.target.value }); }
    $("tSize").onchange = (e) => up({ size: +e.target.value });
    $("tHidden").onchange = (e) => up({ hidden: e.target.checked });
    $("tHideName").onchange = (e) => up({ hideName: e.target.checked });
    $("tHideHp").onchange = (e) => up({ hideHp: e.target.checked });
    $("tDel").onclick = deleteSelection;
    if (c) renderSheet($("insSheet"), c, {
      onRoll: (s, m, l) => roll(s, m, `${c.name} ${l}`.trim()),
      onHp: (v) => update(ref(db, `characters/pcs/${t.characterId}/combat`), { hp_current: v })
    });
    return;
  }
  if (selection?.kind === "light") {
    const l = geometry.lights.find(x => x.id === selection.id); if (!l) { selection = null; return renderCtx(); }
    show("Light");
    body.innerHTML = `
      <div class="flex-row"><label for="lRange">Range (squares)</label><span class="val-badge" id="lRangeV">${l.range}</span></div>
      <input type="range" id="lRange" min="0.5" max="20" step="0.5" value="${l.range}">
      <label class="flex-row">Colour <input type="color" id="lColor" value="#${String(l.color || "ffFFEDCF").slice(-6)}"></label>
      <div class="hint">Drag the bulb on the map to move it.</div>
      <button class="danger" id="lDel">Delete light</button>`;
    $("lRange").oninput = (e) => { l.range = +e.target.value; $("lRangeV").textContent = l.range; };
    $("lRange").onchange = () => saveGeo("lights");
    $("lColor").onchange = (e) => { l.color = "ff" + e.target.value.slice(1).toUpperCase(); saveGeo("lights"); };
    $("lDel").onclick = deleteSelection;
    return;
  }
  if (selection?.kind === "door") {
    const d = geometry.doors.find(x => x.id === selection.id); if (!d) { selection = null; return renderCtx(); }
    show("Door");
    body.innerHTML = `<div>This door is <b>${d.closed === false ? "open" : "closed"}</b>. Click it on the map to toggle.</div>
      <div class="grid-2"><button id="dToggle">${d.closed === false ? "Close" : "Open"}</button><button class="danger" id="dDel">Delete</button></div>`;
    $("dToggle").onclick = () => { d.closed = d.closed === false; saveGeo("doors"); renderCtx(); };
    $("dDel").onclick = deleteSelection;
    return;
  }
  panel.hidden = true;
}

// ── Player: character sheet + login ─────────────────────────────────────────
function renderPlayerSheet() {
  const body = $("sheetBody"), c = pcsData[myCharId];
  $("sheetTitle").textContent = c?.name || "Character";
  if (!c) { body.innerHTML = `<div class="muted">No character chosen.</div><button class="primary" id="pickChar">Choose character</button>`; $("pickChar").onclick = showLogin; return; }
  if (body.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
  renderSheet(body, c, {
    onRoll: (s, m, l) => roll(s, m, l),
    onHp: (v) => update(ref(db, `characters/pcs/${myCharId}/combat`), { hp_current: v })
  });
}
function showLogin() { if (PLAYER) { $("login").hidden = false; renderLogin(); } }
function renderLogin() {
  const pcs = Object.entries(pcsData).filter(([, c]) => c?.name && c.record_type !== "npc" && c.campaign !== "__oracle__");
  const camps = [...new Set(pcs.map(([, c]) => c.campaign).filter(Boolean))].sort();
  const sel = $("loginCampaign");
  if (sel.options.length !== camps.length) sel.innerHTML = camps.map(c => `<option>${esc(c)}</option>`).join("");
  sel.hidden = camps.length < 2;
  const camp = sel.value || camps[0];
  $("loginList").innerHTML = pcs.filter(([, c]) => !camp || c.campaign === camp).sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([id, c]) => `<button data-char="${esc(id)}">${esc(c.name)}</button>`).join("") || `<div class="muted">No characters found.</div>`;
  $("loginList").querySelectorAll("[data-char]").forEach(b => b.onclick = () => {
    myCharId = b.dataset.char; playerName = pcsData[myCharId].name;
    localStorage.setItem("geezvtt.charId", myCharId); localStorage.setItem("geezvtt.playerName", playerName);
    $("login").hidden = true; $("whoName").textContent = playerName; heartbeat(); renderPlayerSheet(); initiative.render();
  });
}
$("loginCampaign").onchange = renderLogin;
$("who").onclick = showLogin;

// ── Start ───────────────────────────────────────────────────────────────────
(() => {
  const dice = [4, 6, 8, 10, 12, 20, 100];
  $("diceBtns").innerHTML = dice.map(s => `<button data-die="${s}" class="${s === 20 ? "primary" : ""}">d${s}</button>`).join("");
  $("diceBtns").querySelectorAll("[data-die]").forEach(b => b.onclick = () => roll(+b.dataset.die));

  setTool("select");
  if (PLAYER) {
    $("whoName").textContent = playerName || "Choose character";
    renderPlayerSheet();
    if (!myCharId) showLogin();
  } else {
    $("whoName").textContent = "GM";
    loadMapList();
    const last = localStorage.getItem("geezvtt.gmMapFile");
    get(ref(db, "session/currentMapFile")).then(s => openMap(last || s.val() || null));
  }
  heartbeat();
  log(GM ? "GM view ready." : "Player view ready.");
  requestAnimationFrame(draw);
})();

// Debug handle for the browser console
window.__vtt = { get mapFile() { return mapFile; }, toScreen, camera, fitMap, initiative, get mapName() { return mapName; }, get tokens() { return tokens; }, get geometry() { return geometry; }, get activePings() { return activePings; }, get ruler() { return [rulerStart, rulerEnd]; } };
