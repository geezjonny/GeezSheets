// GeezVTT — a small self-hosted Owlbear-style VTT on the GeezSheets Firebase.
// GM:      rodeo.html?gm=jonny     Player: rodeo.html
import { db, R, ref, get, onValue, set, update, remove, push, query, limitToLast, onDisconnect, runTransaction } from "./rodeo-firebase.js";
import { createDiceTray3D } from "./geez-dice3d.js";

// ───────────────────────── Setup ─────────────────────────
const GM_KEY = "jonny";
const REPO = { owner: "geezjonny", name: "GeezSheets", folder: "battlemap" };
const MAP_EXT = /\.(dd2vtt|df2vtt|uvtt|png|jpe?g|webp)$/i;

const params = new URLSearchParams(location.search);
const IS_GM = params.get("gm") === GM_KEY;
document.body.classList.add(IS_GM ? "gm" : "player");

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clientId = sessionStorage.getItem("rodeo.client") || (() => { const v = Math.random().toString(36).slice(2, 10); sessionStorage.setItem("rodeo.client", v); return v; })();
const newId = (p = "t") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const r1 = (n) => Math.round(n * 10) / 10;

function hashColor(s) {
  let h = 0; for (const c of String(s || "?")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 45%)`;
}
const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

let me = IS_GM ? { name: "DM", pcId: null } : JSON.parse(localStorage.getItem("rodeo.me") || "null");
const myColor = () => (IS_GM ? "#f59e0b" : hashColor(me?.name || clientId));

// ───────────────────────── State ─────────────────────────
const GRID_DEFAULT = { show: true, size: 50, scaleText: "5ft", color: "#000000", opacity: 0.3, snap: true, offsetX: 0, offsetY: 0 };
const state = {
  activeTool: "select", drawMode: "brush", fogMode: "reveal-rect", rulerMode: localStorage.getItem("rodeo.ruler") || "5e",
  preview: false,                                   // GM previewing the player view
  panX: 0, panY: 0, zoom: 1, minZoom: 0.05, maxZoom: 6,
  grid: { ...GRID_DEFAULT }, fileGrid: { ...GRID_DEFAULT }, gridOverride: null,
  layers: { tokens: true, drawings: true, walls: false, portals: true, lights: false, map: true },
  mapFile: null, mapKey: null, local: false,
  map: { image: null, width: 1600, height: 1200 },
  walls: [], portals: [], lights: [], doorState: {},
  tokens: {}, drawings: {}, fog: { enabled: false, shapes: {} },
  pings: {}, rulers: {},
  selectedTokenId: null,
};
const isGMView = () => IS_GM && !state.preview;

// interaction
let action = null;           // { kind, ... } current pointer action
let spaceHeld = false;
let localRuler = null;       // { a, b }
let draftShape = null;       // drawing / fog / calibrate in progress
let lastCalibration = null;
const livePings = [];        // { x, y, color, name, start }

let canvas, ctx, container, dpr = 1;

// ───────────────────────── Rendering ─────────────────────────
let renderQueued = false;
function requestRender() { if (!renderQueued) { renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); } }

const imgCache = new Map();
const missingArt = new Set();      // URLs that 404'd, so we stop re-requesting them
function loadFirst(key, srcs) {
  if (imgCache.has(key)) return imgCache.get(key);
  const entry = { img: null, failed: false };
  imgCache.set(key, entry);
  let i = 0;
  const next = () => {
    while (i < srcs.length && missingArt.has(srcs[i])) i++;
    if (i >= srcs.length) { entry.failed = true; return; }
    const im = new Image();
    im.onload = () => { entry.img = im; requestRender(); };
    im.onerror = () => { missingArt.add(srcs[i]); i++; next(); };
    im.src = srcs[i];
  };
  next();
  return entry;
}
// Token art: uploaded image → avatar from the character record → tokens/<Name>.png → tokens/<name>.png → tokens/<name_like_this>.png
const snake = (s) => String(s || "").trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
function tokenSrcs(t) {
  const s = [];
  if (t.img) s.push(t.img);
  if (t.kind === "prop") {
    if (t.name) { s.push(`props/${encodeURIComponent(t.name)}.png`); if (t.name !== t.name.toLowerCase()) s.push(`props/${encodeURIComponent(t.name.toLowerCase())}.png`); }
    return s;
  }
  if (t.avatar) s.push(t.avatar);
  if (t.name) {
    s.push(`tokens/${encodeURIComponent(t.name)}.png`);
    if (t.name !== t.name.toLowerCase()) s.push(`tokens/${encodeURIComponent(t.name.toLowerCase())}.png`);
    const sn = snake(t.name); if (sn && sn !== t.name.toLowerCase()) s.push(`tokens/${sn}.png`);
  }
  return s;
}
const tokenImage = (t) => { const srcs = tokenSrcs(t); return srcs.length ? loadFirst(t.img ? "img:" + t.id : srcs.join("|"), srcs).img : null; };

function resizeCanvas() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(container.clientWidth * dpr);
  canvas.height = Math.round(container.clientHeight * dpr);
  requestRender();
}
const viewW = () => canvas.width / dpr;
const viewH = () => canvas.height / dpr;

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * state.zoom, 0, 0, dpr * state.zoom, dpr * state.panX, dpr * state.panY);

  if (state.layers.map && state.map.image) ctx.drawImage(state.map.image, 0, 0);
  if (state.layers.lights && state.lights.length) drawLights();
  if (state.grid.show) drawGrid();
  if (isGMView() && state.layers.walls) drawWalls();
  if (isGMView() && state.layers.portals) drawPortals();
  if (state.layers.drawings) drawDrawings();
  if (state.layers.tokens) drawTokens();
  if (state.fog.enabled || draftShape?.kind === "fog") drawFog();
  drawRulers();
  drawPings();
  drawDraft();

  const sel = state.tokens[state.selectedTokenId];
  if (sel) positionRadial(sel);
  if (livePings.length) requestRender();
}

function drawLights() {
  for (const l of state.lights) {
    const g = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y, l.range);
    g.addColorStop(0, l.color); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(l.x, l.y, l.range, 0, Math.PI * 2); ctx.fill();
  }
}

function drawGrid() {
  const { size, offsetX, offsetY, color, opacity } = state.grid;
  if (!(size > 4)) return;
  const W = state.map.width, H = state.map.height;
  ctx.save();
  ctx.strokeStyle = color; ctx.globalAlpha = Number(opacity) || 0.3; ctx.lineWidth = 1 / state.zoom;
  ctx.beginPath();
  for (let x = ((offsetX % size) + size) % size; x <= W; x += size) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = ((offsetY % size) + size) % size; y <= H; y += size) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.restore();
}

function drawWalls() {
  ctx.save(); ctx.strokeStyle = "rgba(239,68,68,0.75)"; ctx.lineWidth = 3 / state.zoom;
  for (const poly of state.walls) {
    if (poly.length < 2) continue;
    ctx.beginPath(); ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

const doorClosed = (p) => (p.id in state.doorState ? !!state.doorState[p.id] : p.closed);
function drawPortals() {
  const rad = 10 / Math.min(state.zoom, 1.5) * (state.activeTool === "portals" ? 1.3 : 1);
  for (const p of state.portals) {
    const closed = doorClosed(p);
    ctx.save();
    if (p.line) {
      ctx.strokeStyle = closed ? "#ef4444" : "#22c55e"; ctx.lineWidth = 4 / state.zoom;
      ctx.beginPath(); ctx.moveTo(p.line[0].x, p.line[0].y); ctx.lineTo(p.line[1].x, p.line[1].y); ctx.stroke();
    }
    ctx.fillStyle = closed ? "#991b1b" : "#166534"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5 / state.zoom;
    ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = `bold ${rad}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(closed ? "D" : "O", p.x, p.y + 0.5);
    ctx.restore();
  }
}

function strokeShape(d) {
  ctx.strokeStyle = d.color; ctx.fillStyle = d.color; ctx.lineWidth = d.size; ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (d.type === "brush" && d.points?.length > 1) {
    ctx.beginPath(); ctx.moveTo(d.points[0][0], d.points[0][1]);
    for (let i = 1; i < d.points.length; i++) ctx.lineTo(d.points[i][0], d.points[i][1]);
    ctx.stroke();
  } else if (d.type === "rect") ctx.strokeRect(d.x, d.y, d.w, d.h);
  else if (d.type === "circle") { ctx.beginPath(); ctx.arc(d.x, d.y, Math.max(1, d.r), 0, Math.PI * 2); ctx.stroke(); }
  else if (d.type === "arrow") {
    const ang = Math.atan2(d.y2 - d.y1, d.x2 - d.x1), head = Math.max(12, d.size * 3);
    ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(d.x2, d.y2);
    ctx.lineTo(d.x2 - head * Math.cos(ang - 0.45), d.y2 - head * Math.sin(ang - 0.45));
    ctx.lineTo(d.x2 - head * Math.cos(ang + 0.45), d.y2 - head * Math.sin(ang + 0.45));
    ctx.closePath(); ctx.fill();
  }
}
function drawDrawings() {
  const list = Object.entries(state.drawings).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [, d] of list) { ctx.save(); strokeShape(d); ctx.restore(); }
}

const cellPx = () => state.grid.size || 50;
const tokPx = (t) => (Number(t.cells) || 1) * cellPx();
const visibleTokens = () => Object.values(state.tokens).filter((t) => t && (isGMView() || !t.hidden))
  .sort((a, b) => (a.kind === "prop" ? 0 : 1) - (b.kind === "prop" ? 0 : 1) || (Number(b.cells) || 1) - (Number(a.cells) || 1) || String(a.id).localeCompare(String(b.id)));

const STATUS = ["", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];
const RARITY = { uncommon: "#22c55e", rare: "#3b82f6", "very rare": "#a855f7", legendary: "#f97316", artifact: "#ef4444" };
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function drawProp(t) {
  const s = tokPx(t), cx = t.x + s / 2, cy = t.y + s / 2, pad = s * 0.08;
  ctx.save();
  if (t.hidden) ctx.globalAlpha = 0.45;
  ctx.translate(cx, cy); ctx.rotate(((t.rotation || 0) * Math.PI) / 180); if (t.flipped) ctx.scale(-1, 1);
  const img = tokenImage(t);
  if (img) {
    const k = Math.min((s - pad * 2) / img.width, (s - pad * 2) / img.height);
    ctx.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k);
  } else {
    roundRect(-s / 2 + pad, -s / 2 + pad, s - pad * 2, s - pad * 2, s * 0.18);
    ctx.fillStyle = "rgba(15,23,42,0.82)"; ctx.fill();
    ctx.strokeStyle = RARITY[String(t.rarity || "").toLowerCase()] || "rgba(148,163,184,0.8)"; ctx.lineWidth = Math.max(1.5, s * 0.04); ctx.stroke();
    ctx.font = `${s * 0.52}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(t.icon || "📦", 0, s * 0.04);
  }
  ctx.restore();
  // container badge: item count (players only see it once it's open)
  const n = lootEntries(t).length;
  if (n && (t.open || isGMView())) {
    const r = Math.max(7 / state.zoom, s * 0.16), bx = t.x + s - r * 0.6, by = t.y + r * 0.6;
    ctx.save(); ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fillStyle = t.open ? "#f59e0b" : "#475569"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5 / state.zoom; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = `bold ${r * 1.2}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(n), bx, by + r * 0.05);
    ctx.restore();
  }
  if (t.id === state.selectedTokenId) {
    ctx.save(); ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 2.5 / state.zoom; ctx.setLineDash([6 / state.zoom, 4 / state.zoom]);
    roundRect(t.x - 4 / state.zoom, t.y - 4 / state.zoom, s + 8 / state.zoom, s + 8 / state.zoom, s * 0.2); ctx.stroke(); ctx.restore();
  }
}
function drawTokens() {
  for (const t of visibleTokens()) {
    if (t.kind === "prop") { drawProp(t); continue; }
    const s = tokPx(t), cx = t.x + s / 2, cy = t.y + s / 2;
    ctx.save();
    if (t.hidden) ctx.globalAlpha = 0.45;
    ctx.translate(cx, cy);
    ctx.rotate(((t.rotation || 0) * Math.PI) / 180);
    if (t.flipped) ctx.scale(-1, 1);
    const img = tokenImage(t);
    if (img) {
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.clip();
      const ar = img.width / img.height;
      const w = ar >= 1 ? s * ar : s, h = ar >= 1 ? s : s / ar;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
      ctx.beginPath(); ctx.arc(0, 0, s / 2 - 1, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = Math.max(1.5, s * 0.03); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, s / 2 - 1, 0, Math.PI * 2);
      ctx.fillStyle = t.color || hashColor(t.name); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1.5, s * 0.04); ctx.stroke();
      if (t.flipped) ctx.scale(-1, 1);
      ctx.fillStyle = "#fff"; ctx.font = `bold ${s * 0.36}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(initials(t.name), 0, s * 0.02);
    }
    ctx.restore();

    ctx.save();
    if (t.status) { ctx.beginPath(); ctx.arc(cx, cy, s / 2 + 3 / state.zoom, 0, Math.PI * 2); ctx.strokeStyle = t.status; ctx.lineWidth = 4 / state.zoom; ctx.stroke(); }
    if (t.id === state.selectedTokenId) {
      ctx.beginPath(); ctx.arc(cx, cy, s / 2 + 8 / state.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 2.5 / state.zoom; ctx.setLineDash([6 / state.zoom, 4 / state.zoom]); ctx.stroke(); ctx.setLineDash([]);
    }
    // HP bar: GM and the token's owner
    if (t.maxHp > 0 && (isGMView() || canControl(t))) {
      const frac = Math.max(0, Math.min(1, (Number(t.hp) || 0) / t.maxHp));
      const bw = s * 0.8, bh = Math.max(3, s * 0.08), bx = cx - bw / 2, by = t.y + s - bh * 0.5;
      ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = frac > 0.5 ? "#22c55e" : frac > 0.25 ? "#f59e0b" : "#ef4444"; ctx.fillRect(bx, by, bw * frac, bh);
    }
    // well rested: little moon on the PC's token
    if (t.pcId && restedLeft(t.pcId) > 0) {
      const r = Math.max(6 / state.zoom, s * 0.14), mx = t.x + r * 0.7, my = t.y + r * 0.7;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fillStyle = "#4338ca"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2 / state.zoom; ctx.stroke();
      ctx.font = `${r * 1.25}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🌙", mx, my + r * 0.05);
    }
    // name label
    if (s * state.zoom > 26 && t.name) {
      const fs = 11 / state.zoom; ctx.font = `600 ${fs}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "top";
      const w = ctx.measureText(t.name).width + 8 / state.zoom, ly = t.y + s + 4 / state.zoom;
      ctx.fillStyle = "rgba(15,23,42,0.8)"; ctx.fillRect(cx - w / 2, ly, w, fs + 4 / state.zoom);
      ctx.fillStyle = "#e2e8f0"; ctx.fillText(t.name, cx, ly + 2 / state.zoom);
    }
    ctx.restore();
  }
}

// Fog: rebuilt only when it changes, at a capped resolution
let fogCanvas = null, fogDirty = true;
function shapeList() { return Object.entries(state.fog.shapes || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v); }
function rebuildFog() {
  const W = state.map.width, H = state.map.height;
  const k = Math.min(1, 2048 / Math.max(W, H));
  fogCanvas = fogCanvas || document.createElement("canvas");
  fogCanvas.width = Math.max(1, Math.round(W * k)); fogCanvas.height = Math.max(1, Math.round(H * k));
  const f = fogCanvas.getContext("2d");
  f.setTransform(k, 0, 0, k, 0, 0);
  f.globalCompositeOperation = "source-over";
  f.fillStyle = "#020617"; f.fillRect(0, 0, W, H);
  for (const s of shapeList()) {
    f.globalCompositeOperation = s.mode === "hide" ? "source-over" : "destination-out";
    f.fillStyle = "#020617"; f.beginPath();
    if (s.type === "rect") f.rect(s.x, s.y, s.w, s.h); else f.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    f.fill();
  }
  fogDirty = false;
}
function drawFog() {
  if (!state.fog.enabled) return;
  if (fogDirty || !fogCanvas) rebuildFog();
  ctx.save();
  ctx.globalAlpha = isGMView() ? 0.55 : 1;
  ctx.drawImage(fogCanvas, 0, 0, state.map.width, state.map.height);
  ctx.restore();
}

function feetPerCell() { const m = String(state.grid.scaleText || "5ft").match(/([\d.]+)\s*(.*)/); return { n: m ? Number(m[1]) : 5, unit: m ? (m[2] || "ft") : "ft" }; }
function measure(a, b) {
  const g = cellPx(), dx = Math.abs(b.x - a.x) / g, dy = Math.abs(b.y - a.y) / g, { n, unit } = feetPerCell();
  let cells;
  if (state.rulerMode === "euclid") cells = Math.hypot(dx, dy);
  else {
    const mx = Math.round(Math.max(dx, dy)), mn = Math.round(Math.min(dx, dy));
    cells = state.rulerMode === "5105" ? mx + Math.floor(mn / 2) : mx;
  }
  const v = cells * n;
  return `${state.rulerMode === "euclid" ? v.toFixed(1) : Math.round(v)} ${unit}`;
}
function drawRuler(a, b, color, who) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 3 / state.zoom; ctx.setLineDash([8 / state.zoom, 4 / state.zoom]);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(a.x, a.y, 4 / state.zoom, 0, Math.PI * 2); ctx.fill();
  const label = measure(a, b) + (who ? ` · ${who}` : "");
  const fs = 12 / state.zoom; ctx.font = `bold ${fs}px ui-monospace, monospace`;
  const w = ctx.measureText(label).width + 12 / state.zoom, h = fs + 8 / state.zoom;
  ctx.fillStyle = "rgba(2,132,199,0.95)"; ctx.fillRect(b.x + 10 / state.zoom, b.y - h / 2, w, h);
  ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(label, b.x + 16 / state.zoom, b.y);
  ctx.restore();
}
function drawRulers() {
  for (const [id, rl] of Object.entries(state.rulers)) if (id !== clientId && rl?.mapKey === state.mapKey && rl.a && rl.b) drawRuler(rl.a, rl.b, rl.color || "#38bdf8", rl.name);
  if (localRuler) drawRuler(localRuler.a, localRuler.b, "#38bdf8");
}

function drawPings() {
  const now = performance.now();
  for (let i = livePings.length - 1; i >= 0; i--) {
    const p = livePings[i], t = (now - p.start) / 1600;
    if (t >= 1) { livePings.splice(i, 1); continue; }
    ctx.save();
    for (const lag of [0, 0.25]) {
      const tt = t - lag; if (tt < 0) continue;
      ctx.globalAlpha = 1 - tt; ctx.strokeStyle = p.color; ctx.lineWidth = 4 / state.zoom;
      ctx.beginPath(); ctx.arc(p.x, p.y, (10 + tt * 50) / state.zoom, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = Math.min(1, 2 - 2 * t); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 6 / state.zoom, 0, Math.PI * 2); ctx.fill();
    if (p.name) { ctx.font = `600 ${11 / state.zoom}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(p.name, p.x, p.y - 16 / state.zoom); }
    ctx.restore();
  }
}

function drawDraft() {
  if (!draftShape) return;
  ctx.save();
  if (draftShape.kind === "draw") strokeShape(draftShape.shape);
  if (draftShape.kind === "fog") {
    const s = draftShape.shape;
    ctx.strokeStyle = s.mode === "hide" ? "#94a3b8" : "#34d399"; ctx.lineWidth = 2 / state.zoom; ctx.setLineDash([6 / state.zoom, 4 / state.zoom]);
    ctx.beginPath(); if (s.type === "rect") ctx.rect(s.x, s.y, s.w, s.h); else ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
  }
  if (draftShape.kind === "calibrate") {
    const c = draftShape.shape; ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 2 / state.zoom; ctx.strokeRect(c.x, c.y, c.w, c.h);
  }
  ctx.restore();
  if (lastCalibration && state.activeTool === "calibrate" && !draftShape) {
    ctx.save(); ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 2 / state.zoom; const c = lastCalibration; ctx.strokeRect(c.x, c.y, c.w, c.h); ctx.restore();
  }
}

// ───────────────────────── Coordinates ─────────────────────────
function screenToWorld(clientX, clientY) {
  const rc = canvas.getBoundingClientRect();
  return { x: (clientX - rc.left - state.panX) / state.zoom, y: (clientY - rc.top - state.panY) / state.zoom };
}
function snapPos(v, off) { const g = cellPx(); return Math.round((v - off) / g) * g + off; }
function snapToken(t, x, y) {
  if (!state.grid.snap) return { x, y };
  return { x: snapPos(x, state.grid.offsetX % cellPx()), y: snapPos(y, state.grid.offsetY % cellPx()) };
}
function cellCenter(p) {
  if (!state.grid.snap) return p;
  const g = cellPx(), ox = state.grid.offsetX % g, oy = state.grid.offsetY % g;
  return { x: Math.floor((p.x - ox) / g) * g + ox + g / 2, y: Math.floor((p.y - oy) / g) * g + oy + g / 2 };
}
function zoomAt(factor, sx, sy) {
  const rc = canvas.getBoundingClientRect();
  sx = sx ?? rc.left + viewW() / 2; sy = sy ?? rc.top + viewH() / 2;
  const before = screenToWorld(sx, sy);
  state.zoom = Math.max(state.minZoom, Math.min(state.maxZoom, state.zoom * factor));
  state.panX = sx - rc.left - before.x * state.zoom;
  state.panY = sy - rc.top - before.y * state.zoom;
  $("lbl-zoom-level").textContent = `${Math.round(state.zoom * 100)}%`;
  requestRender();
}
function fitView() {
  const W = state.map.width, H = state.map.height, vh = viewH();
  const left = 72, right = IS_GM && !$("right-sidebar").classList.contains("hidden") ? 304 : 16;   // keep clear of the toolbars
  const vw = Math.max(200, viewW() - left - right);
  state.zoom = Math.max(state.minZoom, Math.min(2, Math.min(vw / W, vh / H) * 0.94));
  state.panX = left + (vw - W * state.zoom) / 2; state.panY = (vh - H * state.zoom) / 2;
  $("lbl-zoom-level").textContent = `${Math.round(state.zoom * 100)}%`;
  requestRender();
}

// ───────────────────────── Permissions ─────────────────────────
function canControl(t) {
  if (!t) return false;
  if (IS_GM) return true;
  if (t.kind === "prop" || !me) return false;
  if (me.pcId && t.pcId === me.pcId) return true;
  return !!me.name && !t.npcId && String(t.name || "").toLowerCase() === me.name.toLowerCase();
}
const canMove = (t) => canControl(t) && !t.locked;

function tokenAt(p) {
  const list = visibleTokens().reverse();
  return list.find((t) => { const s = tokPx(t); return Math.hypot(p.x - (t.x + s / 2), p.y - (t.y + s / 2)) <= s / 2 + 2; });
}
function doorAt(p) {
  if (!isGMView() || !state.layers.portals) return null;
  const rad = 14 / Math.min(state.zoom, 1.5);
  return state.portals.find((d) => Math.hypot(d.x - p.x, d.y - p.y) <= rad);
}

// ───────────────────────── Firebase: map data ─────────────────────────
const keyOf = (file) => String(file).replace(/[.#$\[\]\/]/g, "_");
const mapRef = (path = "") => R(`maps/${state.mapKey}${path ? "/" + path : ""}`);
let mapUnsubs = [];

function subscribeMap() {
  mapUnsubs.forEach((u) => u()); mapUnsubs = [];
  state.tokens = {}; state.drawings = {}; state.fog = { enabled: false, shapes: {} }; state.doorState = {}; fogDirty = true;
  const key = state.mapKey;
  mapUnsubs.push(onValue(mapRef("tokens"), (s) => {
    if (key !== state.mapKey) return;
    const incoming = s.val() || {};
    if (action?.kind === "token" && action.moved && incoming[action.id]) {   // keep our own drag smooth
      const mine = state.tokens[action.id]; if (mine) { incoming[action.id].x = mine.x; incoming[action.id].y = mine.y; }
    }
    state.tokens = incoming;
    if (lootId) renderLoot();
    if (state.selectedTokenId && !incoming[state.selectedTokenId]) selectToken(null);
    else if (state.selectedTokenId) refreshRadial();
    requestRender();
  }));
  mapUnsubs.push(onValue(mapRef("drawings"), (s) => { if (key === state.mapKey) { state.drawings = s.val() || {}; requestRender(); } }));
  mapUnsubs.push(onValue(mapRef("fog"), (s) => {
    if (key !== state.mapKey) return;
    const v = s.val() || {}; state.fog = { enabled: !!v.enabled, shapes: v.shapes || {} }; fogDirty = true; refreshFogButton(); requestRender();
  }));
  mapUnsubs.push(onValue(mapRef("doors"), (s) => { if (key === state.mapKey) { state.doorState = s.val() || {}; requestRender(); } }));
  mapUnsubs.push(onValue(mapRef("grid"), (s) => {
    if (key !== state.mapKey) return;
    state.gridOverride = s.val(); applyGrid(); requestRender();
  }));
}
function applyGrid() {
  state.grid = { ...state.fileGrid, ...(state.gridOverride || {}) };
  $("status-grid-size").textContent = `${Math.round(state.grid.size)}px`;
  $("status-scale").textContent = state.grid.scaleText;
}

// ───────────────────────── Map loading ─────────────────────────
function parseColor(c) {
  const s = String(c || "").replace("#", "");
  if (/^[0-9a-f]{8}$/i.test(s)) {           // dd2vtt colours are AARRGGBB
    const a = parseInt(s.slice(0, 2), 16) / 255, r = parseInt(s.slice(2, 4), 16), g = parseInt(s.slice(4, 6), 16), b = parseInt(s.slice(6, 8), 16);
    return `rgba(${r},${g},${b},${(a * 0.45).toFixed(2)})`;
  }
  if (/^[0-9a-f]{6}$/i.test(s)) return `#${s}73`;
  return "rgba(255,183,3,0.4)";
}
function parseUVTT(text) {
  const data = typeof text === "string" ? JSON.parse(text) : text;
  if (!data.image) throw new Error("No image in this file");
  const res = data.resolution || {};
  const ppg = Number(res.pixels_per_grid) || 50;
  const ox = Number(res.map_origin?.x) || 0, oy = Number(res.map_origin?.y) || 0;
  const P = (pt) => ({ x: (pt.x - ox) * ppg, y: (pt.y - oy) * ppg });
  const walls = [...(data.line_of_sight || []), ...(data.objects_line_of_sight || [])].filter((p) => Array.isArray(p) && p.length > 1).map((p) => p.map(P));
  const portals = (data.portals || []).map((p, i) => {
    const b = (p.bounds || []).map(P);
    const pos = p.position ? P(p.position) : b.length === 2 ? { x: (b[0].x + b[1].x) / 2, y: (b[0].y + b[1].y) / 2 } : { x: 0, y: 0 };
    return { id: "d" + i, x: pos.x, y: pos.y, line: b.length >= 2 ? [b[0], b[1]] : null, closed: p.closed !== false };
  });
  const lights = (data.lights || []).map((l) => ({ ...P(l.position || { x: 0, y: 0 }), range: (Number(l.range) || 4) * ppg, color: parseColor(l.color) }));
  const src = data.image.startsWith("data:") ? data.image : "data:image/png;base64," + data.image;
  const g = { ...GRID_DEFAULT, size: ppg, offsetX: ((-ox * ppg) % ppg + ppg) % ppg, offsetY: ((-oy * ppg) % ppg + ppg) % ppg };
  return { src, grid: g, walls, portals, lights };
}
const loadImage = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("Image failed to load")); im.src = src; });

let loadSeq = 0;
async function openMap(file, opts = {}) {
  const seq = ++loadSeq;
  selectToken(null);
  if (!file) { clearMap(); return; }
  setEmpty("Loading map…");
  try {
    let parsed;
    if (opts.parsed) parsed = opts.parsed;
    else if (/\.(png|jpe?g|webp)$/i.test(file)) parsed = { src: file, grid: { ...GRID_DEFAULT }, walls: [], portals: [], lights: [] };
    else {
      const resp = await fetch(file, { cache: "no-cache" });
      if (!resp.ok) throw new Error(`${file} not found (${resp.status})`);
      parsed = parseUVTT(await resp.text());
    }
    const img = await loadImage(parsed.src);
    if (seq !== loadSeq) return;
    state.mapFile = file; state.mapKey = keyOf(opts.local ? "local/" + file : file); state.local = !!opts.local;
    state.map = { image: img, width: img.naturalWidth, height: img.naturalHeight };
    state.walls = parsed.walls; state.portals = parsed.portals; state.lights = parsed.lights;
    state.fileGrid = parsed.grid; state.gridOverride = null; applyGrid();
    $("txt-portal-count").textContent = `${state.portals.length} door${state.portals.length === 1 ? "" : "s"}`;
    const name = String(file).split("/").pop().replace(MAP_EXT, "");
    $("map-title").textContent = IS_GM ? "" : name;
    document.title = `${name} · GeezVTT`;
    $("badge-local").classList.toggle("hidden", !state.local);
    if (IS_GM && !state.local) $("sel-map").value = file;
    setEmpty(null);
    subscribeMap();
    fitView();
  } catch (e) {
    console.error(e);
    if (seq === loadSeq) { setEmpty(`Couldn't load ${esc(file)}: ${esc(e.message)}`); toast(`Map failed: ${e.message}`, "error"); }
  }
}
function clearMap() {
  mapUnsubs.forEach((u) => u()); mapUnsubs = [];
  Object.assign(state, { mapFile: null, mapKey: null, local: false, walls: [], portals: [], lights: [], tokens: {}, drawings: {}, fog: { enabled: false, shapes: {} }, doorState: {} });
  state.map = { image: null, width: 1600, height: 1200 };
  $("map-title").textContent = ""; $("badge-local").classList.add("hidden"); document.title = "GeezVTT";
  setEmpty(IS_GM ? "Pick a map at the top left — everyone moves to it." : "Waiting for the DM to pick a map…");
  requestRender();
}
function setEmpty(msg) {
  $("empty-msg").classList.toggle("hidden", !msg);
  if (msg) $("empty-msg-text").innerHTML = msg;
}

async function listRepoMaps() {
  try {
    const r = await fetch(`${REPO.folder}/index.json`, { cache: "no-cache" });
    if (r.ok) { const a = await r.json(); if (Array.isArray(a)) return a.map((f) => (f.startsWith(REPO.folder + "/") ? f : `${REPO.folder}/${f}`)); }
  } catch {}
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.name}/contents/${REPO.folder}`);
    if (r.ok) { const a = await r.json(); return a.filter((f) => f.type === "file" && MAP_EXT.test(f.name)).map((f) => `${REPO.folder}/${f.name}`); }
  } catch {}
  return [];
}
async function fillMapSelect() {
  const sel = $("sel-map");
  const maps = await listRepoMaps();
  const cur = state.local ? "" : state.mapFile;
  sel.innerHTML = `<option value="">${maps.length ? "— pick a map —" : "No maps in battlemap/"}</option>` +
    maps.map((f) => `<option value="${esc(f)}">${esc(f.split("/").pop().replace(MAP_EXT, ""))}</option>`).join("");
  if (cur) sel.value = cur;
}

// ───────────────────────── Session (which map everyone is on) ─────────────────────────
let sessionMap = undefined;
function watchSession() {
  onValue(R("session"), (s) => {
    const v = s.val() || {};
    const prev = sessionMap; sessionMap = v.mapFile || null;
    if (IS_GM) {
      if (prev === undefined) { if (sessionMap) openMap(sessionMap); else clearMap(); }
    } else if (sessionMap !== state.mapFile || prev === undefined) {
      sessionMap ? openMap(sessionMap) : clearMap();
    }
  });
}
function gmGoTo(file) {
  if (!IS_GM) return;
  set(R("session"), { mapFile: file || null, t: Date.now() });
  file ? openMap(file) : clearMap();
}

// ───────────────────────── Characters from Firebase (GeezSheets) ─────────────────────────
let pcsData = {}, npcsData = {};
const SIZES = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
const nameOf = (c, key) => String(c?.name || c?.identity?.name || c?.basic?.name || c?.info?.name || c?.character_name || c?.title || key || "").trim();
const hpOf = (c) => Number(c?.combat?.hp_max ?? c?.hp_max ?? c?.combat?.hp_current ?? c?.hp ?? c?.stats?.hp) || null;
const sizeOf = (c) => Number(c?.vtt_profile?.token_size) || SIZES[String(c?.size || c?.identity?.size || "").toLowerCase()] || 1;
const avatarOf = (c) => c?.vtt_profile?.avatar || c?.avatar || c?.token || "";
const campaignOf = (c) => String(c?.campaign || c?.identity?.campaign || "").trim();

function pcList() {
  return Object.entries(pcsData).filter(([, c]) => c && typeof c === "object" && c.record_type !== "npc")
    .map(([k, c]) => ({ kind: "pc", pcId: k, name: nameOf(c, k), hp: hpOf(c), cells: sizeOf(c), avatar: avatarOf(c), campaign: campaignOf(c) }))
    .filter((p) => p.name).sort((a, b) => a.name.localeCompare(b.name));
}
function npcList() {
  const out = [];
  const add = (k, c) => {
    if (!c || typeof c !== "object") return;
    const name = nameOf(c, k); if (!name) return;
    out.push({ kind: "npc", npcId: k, name, hp: hpOf(c), cells: sizeOf(c), avatar: avatarOf(c), campaign: campaignOf(c) });
  };
  for (const [k, c] of Object.entries(npcsData)) add(k, c);
  for (const [k, c] of Object.entries(pcsData)) if (c?.record_type === "npc") add(k, c);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
function watchCharacters() {
  onValue(ref(db, "characters/pcs"), (s) => { pcsData = s.val() || {}; refreshLibrary(); refreshMePicker(); refreshRestedBadge(); requestRender(); if (call) renderCall(); });
  if (IS_GM) onValue(ref(db, "characters/npcs"), (s) => { npcsData = s.val() || {}; refreshLibrary(); });
}

// ───────────────────────── Token library (GM) ─────────────────────────
const GENERIC = [
  { name: "Goblin", color: "#4d7c0f" }, { name: "Skeleton", color: "#475569" }, { name: "Bandit", color: "#92400e" },
  { name: "Wolf", color: "#57534e" }, { name: "Zombie", color: "#3f6212" }, { name: "Ogre", color: "#7c2d12", cells: 2 },
  { name: "Dragon", color: "#7f1d1d", cells: 3 }, { name: "Marker", color: "#0ea5e9", cells: 0.5 },
];
const uploads = [];
let libEntries = [];

function previewSrcs(e) { const s = tokenSrcs(e); return s; }
function tokenCard(e, idx) {
  const srcs = previewSrcs(e);
  const fallback = `<div class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-white/70" style="background:${esc(e.color || hashColor(e.name))}">${esc(initials(e.name))}</div>`;
  const sizeBadge = e.cells && e.cells !== 1 ? `<span class="absolute top-1 right-1 text-[9px] px-1 rounded bg-slate-900/80 text-slate-300">${e.cells}×</span>` : "";
  return `<div class="lib-card relative flex flex-col items-center bg-slate-800/60 border border-slate-700/60 p-2 rounded-xl cursor-pointer hover:border-emerald-500 hover:bg-slate-800 transition" draggable="true" data-idx="${idx}" title="${esc(e.name)}${e.hp ? ` · ${e.hp} HP` : ""}${e.campaign ? ` · ${esc(e.campaign)}` : ""}">
    ${sizeBadge}
    <div class="w-10 h-10 relative">${fallback}${srcs.length ? `<img data-srcs="${esc(JSON.stringify(srcs))}" class="absolute inset-0 w-10 h-10 rounded-full object-cover hidden">` : ""}</div>
    <span class="text-[10px] text-slate-300 font-medium mt-1 truncate w-full text-center">${esc(e.name)}</span>
  </div>`;
}
function hydrateImgs(root) {
  root.querySelectorAll("img[data-srcs]").forEach((im) => {
    const srcs = JSON.parse(im.dataset.srcs).filter((u) => !missingArt.has(u)); let i = 0;
    if (!srcs.length) return;
    im.onload = () => im.classList.remove("hidden");
    im.onerror = () => { missingArt.add(srcs[i]); i++; if (i < srcs.length) im.src = srcs[i]; };
    im.src = srcs[0];
  });
}
// Every picture in the repo's tokens/ folder (tokens/index.json, or GitHub's file list), so any art can become a token
let artFiles = null;
const artName = (f) => f.replace(/^tokens\//, "").replace(/\.(png|jpe?g|webp)$/i, "").replace(/[_-]+/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
async function loadArtList() {
  if (artFiles) return artFiles;
  artFiles = [];
  const ok = (a) => Array.isArray(a) && a.length;
  try { const r = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.name}/contents/tokens`); if (r.ok) { const a = await r.json(); if (ok(a)) artFiles = a.filter((f) => f.type === "file" && /\.(png|jpe?g|webp)$/i.test(f.name)).map((f) => "tokens/" + f.name); } } catch {}
  if (!artFiles.length) try { const r = await fetch("tokens/index.json", { cache: "no-cache" }); if (r.ok) { const a = await r.json(); if (ok(a)) artFiles = a.map((f) => (f.startsWith("tokens/") ? f : "tokens/" + f)); } } catch {}
  refreshLibrary();
  return artFiles;
}
function refreshLibrary() {
  if (!IS_GM) return;
  if (!artFiles) loadArtList();
  const q = $("inp-token-search").value.trim().toLowerCase();
  const camp = $("sel-campaign").value;
  const pcs = pcList(), npcs = npcList();
  // campaign dropdown
  const camps = [...new Set([...pcs, ...npcs].map((x) => x.campaign).filter(Boolean))].sort();
  const sel = $("sel-campaign"), keep = sel.value || localStorage.getItem("rodeo.campaign") || "";
  sel.innerHTML = `<option value="">All campaigns</option>` + camps.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  sel.value = camps.includes(keep) ? keep : "";
  const fit = (x) => (!camp || !x.campaign || x.campaign === camp) && (!q || x.name.toLowerCase().includes(q));
  const P = pcs.filter(fit), N = npcs.filter(fit), G = [...GENERIC.map((g) => ({ ...g, kind: "generic" })), ...uploads].filter((x) => !q || x.name.toLowerCase().includes(q));
  const allArt = (artFiles || []).map((f) => ({ name: artName(f), img: f, kind: "art", cells: /(^| )(adult|ancient) .*dragon|giant|ogre|troll|elemental|horse|owlbear/i.test(artName(f)) ? 2 : 1 }));
  const A = allArt.filter((x) => !q || x.name.toLowerCase().includes(q) || x.img.toLowerCase().includes(q.replace(/\s+/g, "_")));
  const shownA = A.slice(0, q ? 60 : 24);
  libEntries = [...P, ...N, ...G, ...shownA];
  let i = 0;
  const block = (arr, el, empty) => { $(el).innerHTML = arr.length ? arr.map((e) => tokenCard(e, i++)).join("") : `<span class="col-span-3 text-[11px] text-slate-500">${empty}</span>`; };
  block(P, "list-pcs", Object.keys(pcsData).length ? "No match" : "No PCs in Firebase");
  block(N, "list-npcs", npcs.length ? "No match" : "No NPCs in Firebase");
  block(G, "list-generic", "No match");
  block(shownA, "list-art", artFiles === null ? "Loading…" : allArt.length ? "No match" : "Couldn't list tokens/ (add tokens/index.json)");
  $("count-art").textContent = allArt.length ? (A.length > shownA.length ? `${shownA.length} of ${A.length}${q ? "" : " · search to find more"}` : `${A.length}`) : "";
  $("count-pcs").textContent = P.length ? `${P.length}` : "";
  $("count-npcs").textContent = `${N.length}${N.length !== npcs.length ? ` of ${npcs.length}` : ""} in Firebase`;
  hydrateImgs($("tab-content-tokens"));
}

function spawnToken(e, at) {
  if (!state.mapKey) return toast("Open a map first");
  const cells = Number(e.cells) || 1, s = cells * cellPx();
  const c = at || screenToWorld(canvas.getBoundingClientRect().left + viewW() / 2, canvas.getBoundingClientRect().top + viewH() / 2);
  const pos = snapToken({ cells }, c.x - s / 2, c.y - s / 2);
  const id = newId();
  const tok = { id, name: e.name, x: r1(pos.x), y: r1(pos.y), cells, rotation: 0, flipped: false, locked: false, hidden: false, status: "", color: e.color || hashColor(e.name) };
  if (e.hp) { tok.hp = e.hp; tok.maxHp = e.hp; }
  if (e.avatar) tok.avatar = e.avatar;
  if (e.img) tok.img = e.img;
  if (e.pcId) tok.pcId = e.pcId;
  if (e.npcId) tok.npcId = e.npcId;
  state.tokens[id] = tok; requestRender();
  set(mapRef("tokens/" + id), tok);
}

// Uploaded token art is shrunk to 128px so it stays small in Firebase
function shrinkImage(file, max = 128) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => loadImage(fr.result).then((im) => {
      const k = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      res(c.toDataURL("image/webp", 0.85));
    }).catch(rej);
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}

// ───────────────────────── Token radial menu ─────────────────────────
function selectToken(id) {
  state.selectedTokenId = id;
  if (!id) $("radial-menu").classList.add("hidden");
  requestRender();
}
function showRadial() {
  const t = state.tokens[state.selectedTokenId]; if (!t) return;
  $("radial-menu").classList.remove("hidden");
  refreshRadial(); positionRadial(t); requestRender();
}
function refreshRadial() {
  const t = state.tokens[state.selectedTokenId]; if (!t) return;
  $("radial-token-name").textContent = t.name || "";
  $("radial-token-hp").textContent = t.maxHp && (isGMView() || canControl(t)) ? `${t.hp ?? 0}/${t.maxHp}` : "";
  $("radial-lock-icon").className = `fa-solid ${t.locked ? "fa-lock" : "fa-lock-open"} text-xs`;
  $("radial-hide-icon").className = `fa-solid ${t.hidden ? "fa-eye-slash" : "fa-eye"} text-xs`;
  $("radial-size-lbl").textContent = t.cells || 1;
  const own = canControl(t), prop = t.kind === "prop";
  ["radial-btn-rotate", "radial-btn-flip"].forEach((b) => $(b).classList.toggle("hidden", !own));
  ["radial-btn-hp", "radial-btn-status"].forEach((b) => $(b).classList.toggle("hidden", !own || prop));
  $("radial-btn-give").classList.toggle("hidden", !(IS_GM && prop && !t.container));
  $("radial-btn-sheet").classList.toggle("hidden", !sheetIdFor(t));
  const isBox = prop && (t.container || lootEntries(t).length);
  $("radial-btn-loot").classList.toggle("hidden", !(prop && (IS_GM || (isBox && t.open))));
  $("radial-loot-lbl").textContent = IS_GM ? (isBox ? `Contents (${lootEntries(t).length})` : "Add contents") : `Loot (${lootEntries(t).length})`;
  $("radial-desc").textContent = prop ? (t.desc || "") : "";
  $("radial-desc").classList.toggle("hidden", !(prop && t.desc));
}
function positionRadial(t) {
  const m = $("radial-menu"); if (m.classList.contains("hidden")) return;
  const rc = canvas.getBoundingClientRect(), s = tokPx(t);
  m.style.left = `${rc.left + state.panX + (t.x + s / 2) * state.zoom}px`;
  m.style.top = `${rc.top + state.panY + (t.y + s / 2) * state.zoom}px`;
  const scale = Math.max(1, (s * state.zoom + 40) / 160);
  m.style.transform = `translate(-50%,-50%) scale(${scale})`;
}
const selTok = () => state.tokens[state.selectedTokenId];
function patchToken(id, patch) {
  const t = state.tokens[id]; if (!t) return;
  Object.assign(t, patch); requestRender(); refreshRadial();
  const clean = {}; for (const [k, v] of Object.entries(patch)) clean[k] = v === undefined ? null : v;
  update(mapRef("tokens/" + id), clean);
}
function deleteToken(id) { if (!IS_GM || !state.tokens[id]) return; delete state.tokens[id]; selectToken(null); remove(mapRef("tokens/" + id)); }

// Which characters/pcs record a token's sheet lives in (PCs, and NPCs saved through GeezSheets)
function sheetIdFor(t) {
  if (!t || t.kind === "prop") return null;
  if (t.pcId) return t.pcId;
  if (IS_GM && t.npcId && pcsData[t.npcId]) return t.npcId;
  return null;
}
function openSheet(id, name) {
  const url = `sheet.html?char=${encodeURIComponent(id)}${IS_GM ? "&gm=" + GM_KEY : ""}`;
  $("sheet-frame").src = url + "&embed=1";
  $("sheet-panel-tab").href = url;
  $("sheet-panel-title").textContent = name || "Sheet";
  $("sheet-panel").classList.add("open");
}
const closeSheet = () => { $("sheet-panel").classList.remove("open"); };

// Give a prop to a PC: same stacking rules as the sheet's GM "Give item"
async function giveToPc(pcId, prop) {
  const invRef = ref(db, `characters/pcs/${pcId}/inventory`);
  const inv = (await get(invRef)).val() || {};
  const hit = Object.entries(inv).find(([, it]) => it && String(it.name || "").toLowerCase() === String(prop.name).toLowerCase());
  if (hit) await update(ref(db, `characters/pcs/${pcId}/inventory/${hit[0]}`), { qty: (Number(hit[1].qty ?? 1) || 1) + 1 });
  else {
    const item = { name: prop.name, qty: 1, given_by: "GM", given_at: Date.now() };
    if (prop.desc) item.desc = prop.desc;
    await push(invRef, item);
  }
}

function wireRadial() {
  $("radial-btn-loot").onclick = () => { const t = selTok(); if (t) openLoot(t.id); };
  $("radial-btn-sheet").onclick = () => { const t = selTok(), id = sheetIdFor(t); if (id) openSheet(id, t.name); };
  $("radial-btn-give").onclick = async () => {
    const t = selTok(); if (!t || t.kind !== "prop") return;
    const pcs = pcList(); if (!pcs.length) return toast("No PCs in Firebase");
    const ans = prompt(`Give ${t.name} to:\n${pcs.map((p, i) => `${i + 1}. ${p.name}`).join("\n")}\n\nType a number (or several: 1,3)`, "");
    if (!ans) return;
    const picks = [...new Set(ans.split(/[\s,]+/).map((n) => pcs[Number(n) - 1]).filter(Boolean))];
    if (!picks.length) return toast("No one picked");
    try {
      for (const p of picks) await giveToPc(p.pcId, t);
      deleteToken(t.id);
      toast(`🎒 Gave <b>${esc(t.name)}</b> to ${esc(picks.map((p) => p.name).join(", "))}`);
    } catch (e) { toast(`Give failed: ${esc(e.message)}`, "error"); }
  };
  $("radial-btn-delete").onclick = () => deleteToken(state.selectedTokenId);
  $("radial-btn-rotate").onclick = () => { const t = selTok(); if (t) patchToken(t.id, { rotation: ((t.rotation || 0) + 45) % 360 }); };
  $("radial-btn-flip").onclick = () => { const t = selTok(); if (t) patchToken(t.id, { flipped: !t.flipped }); };
  $("radial-btn-lock").onclick = () => { const t = selTok(); if (t) patchToken(t.id, { locked: !t.locked }); };
  $("radial-btn-hide").onclick = () => { const t = selTok(); if (t) patchToken(t.id, { hidden: !t.hidden }); };
  $("radial-btn-status").onclick = () => { const t = selTok(); if (t) patchToken(t.id, { status: STATUS[(STATUS.indexOf(t.status || "") + 1) % STATUS.length] }); };
  $("radial-btn-size").onclick = () => {
    const t = selTok(); if (!t) return;
    const order = [0.5, 1, 2, 3, 4], next = order[(order.indexOf(Number(t.cells) || 1) + 1) % order.length];
    patchToken(t.id, { cells: next });
  };
  $("radial-btn-hp").onclick = () => {
    const t = selTok(); if (!t) return;
    const v = prompt(`HP for ${t.name}${t.maxHp ? ` (now ${t.hp ?? 0}/${t.maxHp})` : ""}\n"-7" damage · "+5" heal · "12" set · "12/30" set current/max`, "");
    if (v == null || !v.trim()) return;
    const s = v.trim().replace(/\s/g, "");
    let hp = Number(t.hp) || 0, max = Number(t.maxHp) || 0;
    const m = s.match(/^(\d+)\/(\d+)$/);
    if (m) { hp = +m[1]; max = +m[2]; }
    else if (/^[+-]\d+$/.test(s)) hp += Number(s);
    else if (/^\d+$/.test(s)) { hp = Number(s); if (!max) max = hp; }
    else return toast("Didn't understand that HP value");
    if (max) hp = Math.max(0, Math.min(max, hp));
    patchToken(t.id, { hp, maxHp: max || null });
  };
}

// ───────────────────────── Pings & shared rulers ─────────────────────────
let pingCounter = 0;
const seenPings = {};
let pingsReady = false;
function sendPing(p) {
  if (!state.mapKey) return;
  livePings.push({ x: p.x, y: p.y, color: myColor(), name: "", start: performance.now() }); requestRender();
  set(R("pings/" + clientId), { x: r1(p.x), y: r1(p.y), mapKey: state.mapKey, color: myColor(), name: me?.name || "", n: ++pingCounter + Date.now() });
}
function watchPings() {
  onValue(R("pings"), (s) => {
    const all = s.val() || {};
    for (const [id, p] of Object.entries(all)) {
      if (!p || seenPings[id] === p.n) continue;
      seenPings[id] = p.n;
      if (pingsReady && id !== clientId && p.mapKey === state.mapKey) { livePings.push({ ...p, start: performance.now() }); requestRender(); }
    }
    pingsReady = true;
  });
  onDisconnect(R("pings/" + clientId)).remove();
}
let rulerSendAt = 0;
function sendRuler(force) {
  const now = Date.now(); if (!force && now - rulerSendAt < 70) return; rulerSendAt = now;
  if (localRuler && state.mapKey) set(R("rulers/" + clientId), { mapKey: state.mapKey, a: localRuler.a, b: localRuler.b, color: myColor(), name: me?.name || "" });
  else remove(R("rulers/" + clientId));
}
function watchRulers() {
  onValue(R("rulers"), (s) => { state.rulers = s.val() || {}; requestRender(); });
  onDisconnect(R("rulers/" + clientId)).remove();
}

// ───────────────────────── Pointer input ─────────────────────────
const pointers = new Map();
let pinch = null;

function onPointerDown(e) {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {               // two fingers: pinch-zoom, cancel whatever one finger started
    cancelAction();
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    return;
  }
  if (pointers.size > 2) return;
  const p = screenToWorld(e.clientX, e.clientY);
  const start = { sx: e.clientX, sy: e.clientY, moved: false };

  if (e.button === 1 || e.button === 2 && !tokenAt(p) || state.activeTool === "pan" || spaceHeld) {
    action = { kind: "pan", ...start, lx: e.clientX, ly: e.clientY }; container.classList.add("panning"); return;
  }
  if (e.button === 2) {                    // right-click a token: open its menu
    const t = tokenAt(p); if (t) { selectToken(t.id); showRadial(); } return;
  }
  if (e.altKey || state.activeTool === "ping") { sendPing(p); return; }

  switch (state.activeTool) {
    case "select":
    case "portals": {
      const d = IS_GM && doorAt(p);
      if (d) { set(mapRef("doors/" + d.id), !doorClosed(d)); return; }
      if (state.activeTool === "select") {
        const t = tokenAt(p);
        if (t) {
          selectToken(t.id); $("radial-menu").classList.add("hidden");
          if (canMove(t)) { action = { kind: "token", id: t.id, ...start, offX: p.x - t.x, offY: p.y - t.y, lastSend: 0 }; return; }
          action = { kind: "tap-token", id: t.id, ...start }; return;
        }
      }
      action = { kind: "pan", ...start, lx: e.clientX, ly: e.clientY, deselect: true }; container.classList.add("panning");
      return;
    }
    case "ruler": { const c = cellCenter(p); localRuler = { a: c, b: c }; action = { kind: "ruler", ...start }; requestRender(); return; }
    case "draw": {
      if (state.drawMode === "erase") { eraseAt(p); action = { kind: "erase", ...start }; return; }
      const color = $("draw-color").value, size = Number($("draw-size").value) || 4;
      const base = { type: state.drawMode, color, size, by: clientId };
      const shape = state.drawMode === "brush" ? { ...base, points: [[r1(p.x), r1(p.y)]] }
        : state.drawMode === "rect" ? { ...base, x: p.x, y: p.y, w: 0, h: 0 }
        : state.drawMode === "circle" ? { ...base, x: p.x, y: p.y, r: 0 }
        : { ...base, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      draftShape = { kind: "draw", shape, origin: p }; action = { kind: "draw", ...start }; return;
    }
    case "fog": {
      if (!IS_GM) return;
      const mode = state.fogMode.startsWith("hide") ? "hide" : "reveal";
      const type = state.fogMode.endsWith("circle") ? "circle" : "rect";
      draftShape = { kind: "fog", shape: type === "rect" ? { type, mode, x: p.x, y: p.y, w: 0, h: 0 } : { type, mode, x: p.x, y: p.y, r: 0 }, origin: p };
      action = { kind: "fog", ...start }; requestRender(); return;
    }
    case "calibrate": {
      if (!IS_GM) return;
      draftShape = { kind: "calibrate", shape: { x: p.x, y: p.y, w: 0, h: 0 }, origin: p }; action = { kind: "calibrate", ...start }; return;
    }
  }
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    state.panX += cx - pinch.cx; state.panY += cy - pinch.cy;
    zoomAt(d / pinch.d, cx, cy);
    pinch = { d, cx, cy }; return;
  }
  if (!action) return;
  if (!action.moved && Math.hypot(e.clientX - action.sx, e.clientY - action.sy) > 4) action.moved = true;
  const p = screenToWorld(e.clientX, e.clientY);
  switch (action.kind) {
    case "pan":
      state.panX += e.clientX - action.lx; state.panY += e.clientY - action.ly; action.lx = e.clientX; action.ly = e.clientY; requestRender(); break;
    case "token": {
      const t = state.tokens[action.id]; if (!t || !action.moved) break;
      t.x = p.x - action.offX; t.y = p.y - action.offY; requestRender();
      const now = Date.now();
      if (now - action.lastSend > 100) { action.lastSend = now; update(mapRef("tokens/" + t.id), { x: r1(t.x), y: r1(t.y) }); }
      break;
    }
    case "ruler": localRuler.b = cellCenter(p); sendRuler(); requestRender(); break;
    case "erase": eraseAt(p); break;
    case "draw": {
      const s = draftShape.shape, o = draftShape.origin;
      if (s.type === "brush") {
        const last = s.points[s.points.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) > 2 / state.zoom) s.points.push([r1(p.x), r1(p.y)]);
      } else if (s.type === "rect") Object.assign(s, { x: Math.min(o.x, p.x), y: Math.min(o.y, p.y), w: Math.abs(p.x - o.x), h: Math.abs(p.y - o.y) });
      else if (s.type === "circle") s.r = Math.hypot(p.x - o.x, p.y - o.y);
      else { s.x2 = p.x; s.y2 = p.y; }
      requestRender(); break;
    }
    case "fog": case "calibrate": {
      const s = draftShape.shape, o = draftShape.origin;
      if (s.type === "circle") s.r = Math.hypot(p.x - o.x, p.y - o.y);
      else Object.assign(s, { x: Math.min(o.x, p.x), y: Math.min(o.y, p.y), w: Math.abs(p.x - o.x), h: Math.abs(p.y - o.y) });
      requestRender(); break;
    }
  }
}

function onPointerUp(e) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; return; }
  if (!action) return;
  const a = action; action = null;
  container.classList.remove("panning");
  switch (a.kind) {
    case "pan": if (a.deselect && !a.moved) selectToken(null); break;
    case "tap-token": showRadial(); break;
    case "token": {
      const t = state.tokens[a.id]; if (!t) break;
      if (!a.moved) { showRadial(); break; }
      const pos = snapToken(t, t.x, t.y);
      t.x = r1(pos.x); t.y = r1(pos.y);
      update(mapRef("tokens/" + t.id), { x: t.x, y: t.y });
      requestRender(); break;
    }
    case "ruler": localRuler = null; sendRuler(true); requestRender(); break;
    case "draw": {
      const s = draftShape.shape; draftShape = null;
      const tiny = s.type === "brush" ? s.points.length < 2 : s.type === "rect" ? s.w < 3 && s.h < 3 : s.type === "circle" ? s.r < 3 : Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 3;
      if (!tiny && state.mapKey) {
        for (const k of ["x", "y", "w", "h", "r", "x1", "y1", "x2", "y2"]) if (k in s) s[k] = r1(s[k]);
        const id = newId("d"); state.drawings[id] = s; set(mapRef("drawings/" + id), s);
      }
      requestRender(); break;
    }
    case "fog": {
      const s = draftShape.shape; draftShape = null;
      if ((s.type === "rect" ? s.w > 3 && s.h > 3 : s.r > 3) && state.mapKey) {
        for (const k of ["x", "y", "w", "h", "r"]) if (k in s) s[k] = r1(s[k]);
        const id = newId("f"); state.fog.shapes[id] = s; fogDirty = true;
        set(mapRef("fog/shapes/" + id), s);
        if (!state.fog.enabled) set(mapRef("fog/enabled"), true);
      }
      requestRender(); break;
    }
    case "calibrate": lastCalibration = draftShape.shape; draftShape = null; requestRender(); break;
  }
}
function cancelAction() {
  if (action?.kind === "ruler") { localRuler = null; sendRuler(true); }
  action = null; draftShape = null; container.classList.remove("panning"); requestRender();
}

function eraseAt(p) {
  const pad = 8 / state.zoom;
  const hit = Object.entries(state.drawings).reverse().find(([, d]) => {
    if (!IS_GM && d.by !== clientId) return false;
    let x0, y0, x1, y1;
    if (d.type === "brush") { const xs = d.points.map((q) => q[0]), ys = d.points.map((q) => q[1]); x0 = Math.min(...xs); x1 = Math.max(...xs); y0 = Math.min(...ys); y1 = Math.max(...ys);
      if (!(p.x >= x0 - pad && p.x <= x1 + pad && p.y >= y0 - pad && p.y <= y1 + pad)) return false;
      return d.points.some((q) => Math.hypot(q[0] - p.x, q[1] - p.y) <= pad + d.size); }
    if (d.type === "rect") { x0 = d.x; y0 = d.y; x1 = d.x + d.w; y1 = d.y + d.h; }
    else if (d.type === "circle") return Math.abs(Math.hypot(p.x - d.x, p.y - d.y) - d.r) <= pad + d.size;
    else { x0 = Math.min(d.x1, d.x2); x1 = Math.max(d.x1, d.x2); y0 = Math.min(d.y1, d.y2); y1 = Math.max(d.y1, d.y2); }
    return p.x >= x0 - pad && p.x <= x1 + pad && p.y >= y0 - pad && p.y <= y1 + pad;
  });
  if (hit) { delete state.drawings[hit[0]]; remove(mapRef("drawings/" + hit[0])); requestRender(); }
}

// ───────────────────────── Tools & UI wiring ─────────────────────────
function setTool(tool) {
  if (!IS_GM && ["fog", "portals", "calibrate"].includes(tool)) return;
  state.activeTool = tool;
  document.querySelectorAll(".tool-btn").forEach((b) => b.classList.toggle("active-tool", b.dataset.tool === tool));
  container.className = container.className.replace(/\btool-\S+/g, "").trim() + " tool-" + tool;
  const panel = { ruler: "subpanel-ruler", draw: "subpanel-draw", fog: "subpanel-fog", calibrate: "subpanel-calibrate", portals: "subpanel-portals" }[tool];
  document.querySelectorAll(".subpanel").forEach((p) => p.classList.add("hidden"));
  $("subpanel-container").classList.toggle("hidden", !panel);
  if (panel) $(panel).classList.remove("hidden");
  if (tool !== "calibrate") lastCalibration = null;
  if (tool !== "select") selectToken(null);
  requestRender();
}
function openModal(id) { const m = $(id); m.classList.remove("hidden"); m.classList.add("flex"); }
function closeModal(id) { const m = $(id); m.classList.add("hidden"); m.classList.remove("flex"); }

function refreshFogButton() {
  $("icon-fog-toggle").className = `fa-solid ${state.fog.enabled ? "fa-toggle-on text-emerald-400" : "fa-toggle-off text-slate-400"}`;
  $("txt-fog-toggle").textContent = state.fog.enabled ? "Fog on" : "Fog off";
}
function toast(msg, kind = "info") {
  const el = document.createElement("div");
  el.className = `toast glass-panel rounded-lg px-3 py-2 text-xs shadow-xl ${kind === "error" ? "text-red-300 border-red-500/40" : "text-slate-100"}`;
  el.innerHTML = msg; $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function wireUI() {
  document.querySelectorAll(".tool-btn").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
  $("btn-zoom-in").onclick = () => zoomAt(1.25);
  $("btn-zoom-out").onclick = () => zoomAt(0.8);
  $("btn-zoom-reset").onclick = fitView;

  $("sel-ruler-mode").value = state.rulerMode;
  $("sel-ruler-mode").onchange = (e) => { state.rulerMode = e.target.value; localStorage.setItem("rodeo.ruler", state.rulerMode); };

  $("draw-size").oninput = (e) => ($("draw-size-val").textContent = e.target.value);
  document.querySelectorAll(".draw-mode-btn").forEach((b) => b.addEventListener("click", () => {
    state.drawMode = b.dataset.drawMode;
    document.querySelectorAll(".draw-mode-btn").forEach((x) => { const on = x === b; x.classList.toggle("bg-slate-700", on); x.classList.toggle("text-emerald-400", on); x.classList.toggle("text-slate-300", !on); });
  }));
  $("btn-clear-drawings").onclick = () => {
    if (!state.mapKey) return;
    if (IS_GM) { if (confirm("Clear every drawing on this map?")) { state.drawings = {}; remove(mapRef("drawings")); requestRender(); } }
    else { for (const [id, d] of Object.entries(state.drawings)) if (d.by === clientId) { delete state.drawings[id]; remove(mapRef("drawings/" + id)); } requestRender(); }
  };

  document.querySelectorAll(".fog-mode-btn").forEach((b) => b.addEventListener("click", () => {
    state.fogMode = b.dataset.fogMode;
    document.querySelectorAll(".fog-mode-btn").forEach((x) => { const on = x === b; x.classList.toggle("bg-slate-700", on); x.classList.toggle("text-emerald-400", on); x.classList.toggle("text-slate-300", !on); });
  }));
  $("btn-fog-toggle").onclick = () => state.mapKey && set(mapRef("fog/enabled"), !state.fog.enabled);
  $("btn-fog-reveal-all").onclick = () => state.mapKey && set(mapRef("fog/shapes"), { [newId("f")]: { type: "rect", mode: "reveal", x: -10, y: -10, w: state.map.width + 20, h: state.map.height + 20 } });
  $("btn-fog-reset-all").onclick = () => { if (state.mapKey) { remove(mapRef("fog/shapes")); set(mapRef("fog/enabled"), true); } };

  $("btn-open-all-doors").onclick = () => state.mapKey && set(mapRef("doors"), Object.fromEntries(state.portals.map((p) => [p.id, false])));
  $("btn-close-all-doors").onclick = () => state.mapKey && set(mapRef("doors"), Object.fromEntries(state.portals.map((p) => [p.id, true])));

  $("btn-apply-calibration").onclick = () => {
    const c = lastCalibration; if (!c || c.w < 5 || c.h < 5) return toast("Drag a box over one grid square first");
    const size = r1((c.w + c.h) / 2);
    set(mapRef("grid"), { ...(state.gridOverride || {}), size, offsetX: r1(c.x % size), offsetY: r1(c.y % size) });
    lastCalibration = null; toast(`Grid set to ${size}px`); setTool("select");
  };
  $("btn-reset-grid").onclick = () => state.mapKey && remove(mapRef("grid"));

  $("btn-settings-toggle").onclick = () => {
    const g = state.grid;
    $("chk-grid-show").checked = g.show !== false; $("inp-grid-size").value = g.size; $("inp-grid-scale").value = g.scaleText;
    $("inp-grid-ox").value = g.offsetX; $("inp-grid-oy").value = g.offsetY; $("inp-grid-color").value = g.color;
    $("inp-grid-opacity").value = g.opacity; $("chk-grid-snap").checked = g.snap !== false;
    openModal("modal-settings");
  };
  $("btn-apply-settings").onclick = () => {
    if (!state.mapKey) { closeModal("modal-settings"); return toast("Open a map first"); }
    set(mapRef("grid"), {
      show: $("chk-grid-show").checked, size: Math.max(10, Number($("inp-grid-size").value) || 50), scaleText: $("inp-grid-scale").value || "5ft",
      offsetX: Number($("inp-grid-ox").value) || 0, offsetY: Number($("inp-grid-oy").value) || 0, color: $("inp-grid-color").value,
      opacity: Number($("inp-grid-opacity").value), snap: $("chk-grid-snap").checked,
    });
    closeModal("modal-settings");
  };
  document.querySelectorAll(".btn-close-modal").forEach((b) => b.addEventListener("click", () => closeModal(b.closest(".modal").id)));
  document.querySelectorAll(".modal").forEach((m) => m.addEventListener("pointerdown", (e) => { if (e.target === m && m.id !== "modal-me") closeModal(m.id); }));

  $("btn-toggle-viewmode").onclick = () => {
    state.preview = !state.preview;
    $("text-viewmode").textContent = state.preview ? "Player View" : "GM View";
    $("icon-viewmode").className = `fa-solid ${state.preview ? "fa-user" : "fa-eye"} text-indigo-400`;
    requestRender();
  };

  // sidebar
  $("btn-sidebar-close").onclick = () => { $("right-sidebar").classList.add("hidden"); $("btn-sidebar").classList.remove("hidden"); };
  $("btn-sidebar").onclick = () => { $("right-sidebar").classList.remove("hidden"); $("btn-sidebar").classList.add("hidden"); };
  const tab = (which) => {
    for (const name of ["tokens", "props", "layers"]) {
      const on = name === which, id = `tab-btn-${name}`;
      $(`tab-content-${name}`).classList.toggle("hidden", !on);
      $(id).classList.toggle("text-emerald-400", on); $(id).classList.toggle("border-emerald-400", on); $(id).classList.toggle("font-bold", on);
      $(id).classList.toggle("text-slate-400", !on); $(id).classList.toggle("border-transparent", !on);
    }
    if (which === "props") loadPropData();
  };
  document.querySelectorAll(".side-tab").forEach((b) => (b.onclick = () => tab(b.dataset.tab)));

  // props
  $("inp-prop-search").oninput = refreshProps;
  $("sel-prop-cat").onchange = refreshProps;
  $("tab-content-props").addEventListener("click", (e) => { const c = e.target.closest(".prop-card"); if (c) spawnProp(propEntries[+c.dataset.idx]); });
  $("tab-content-props").addEventListener("dragstart", (e) => { const c = e.target.closest(".prop-card"); if (c) e.dataTransfer.setData("text/geez-prop", c.dataset.idx); });

  // sheet panel
  $("sheet-panel-close").onclick = closeSheet;

  // mind messages
  $("btn-mind").onclick = openMindModal;
  $("btn-rest").onclick = openRestModal;
  $("btn-rest-grant").onclick = () => grantRest(false);
  $("btn-rest-clear").onclick = () => grantRest(true);
  document.querySelectorAll(".mind-style-btn").forEach((b) => b.addEventListener("click", () => {
    const prevFrom = document.querySelector(".mind-style-btn.on")?.dataset.from;
    document.querySelectorAll(".mind-style-btn").forEach((x) => x.classList.toggle("on", x === b));
    if (!$("inp-mind-from").value.trim() || $("inp-mind-from").value === prevFrom) $("inp-mind-from").value = b.dataset.from;
  }));
  $("btn-mind-preview").onclick = () => { const m = mindDraft(); if (m) showMind(m); };
  $("btn-mind-send").onclick = sendMind;
  $("mind-overlay").addEventListener("click", hideMind);
  document.querySelectorAll("[data-layer]").forEach((c) => { c.checked = state.layers[c.dataset.layer]; c.onchange = () => { state.layers[c.dataset.layer] = c.checked; requestRender(); }; });

  // library
  $("inp-token-search").oninput = refreshLibrary;
  $("sel-campaign").onchange = (e) => { localStorage.setItem("rodeo.campaign", e.target.value); refreshLibrary(); };
  $("tab-content-tokens").addEventListener("click", (e) => { const c = e.target.closest(".lib-card"); if (c) spawnToken(libEntries[+c.dataset.idx]); });
  $("tab-content-tokens").addEventListener("dragstart", (e) => { const c = e.target.closest(".lib-card"); if (c) e.dataTransfer.setData("text/rodeo-token", c.dataset.idx); });
  $("file-upload").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { const img = await shrinkImage(f); uploads.push({ kind: "upload", name: f.name.replace(/\.[^.]+$/, ""), img }); refreshLibrary(); toast("Added to Generic — click it to place"); }
    catch { toast("Couldn't read that image", "error"); }
  };

  // maps
  $("sel-map").onchange = (e) => gmGoTo(e.target.value);
  $("sel-map").addEventListener("focus", fillMapSelect);
  $("file-import-dd2vtt").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) openLocalFile(f); };

  // export / import / reset
  $("btn-export-session").onclick = () => {
    if (!state.mapKey) return toast("Open a map first");
    const out = { mapFile: state.mapFile, grid: state.gridOverride, tokens: state.tokens, drawings: state.drawings, fog: state.fog, doors: state.doorState };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    a.download = `${String(state.mapFile).split("/").pop().replace(MAP_EXT, "")}-state.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("file-import").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (!state.mapKey) return toast("Open a map first");
    try {
      const d = JSON.parse(await f.text());
      if (!confirm(`Replace tokens, drawings, fog and doors on this map with ${f.name}?`)) return;
      set(mapRef(), { tokens: d.tokens || null, drawings: d.drawings || null, fog: d.fog || null, doors: d.doors || null, grid: d.grid || null });
      toast("Imported");
    } catch { toast("That isn't a valid state file", "error"); }
  };
  $("btn-reset-session").onclick = () => {
    if (state.mapKey && confirm("Remove all tokens, drawings and fog from this map?")) set(mapRef(), state.gridOverride ? { grid: state.gridOverride } : null);
  };

  // who am I
  $("btn-me").onclick = () => { if (!IS_GM) openModal("modal-me"); };
  $("me-pc-list").addEventListener("click", (e) => {
    const c = e.target.closest("[data-pc]"); if (!c) return;
    const p = pcList().find((x) => x.pcId === c.dataset.pc); if (p) setMe({ name: p.name, pcId: p.pcId });
  });
  $("btn-me-name").onclick = () => { const n = $("inp-me-name").value.trim(); if (n) setMe({ name: n, pcId: null }); };

  // dice
  $("btn-dice-modal").onclick = () => openModal("modal-dice");
  document.querySelectorAll(".btn-roll-die").forEach((b) => b.addEventListener("click", () => {
    const mod = Number($("inp-dice-mod").value) || 0, d = b.dataset.dice;
    if (d === "adv" || d === "dis") rollAdv(d, mod);
    else roll(`1${d}${mod ? (mod > 0 ? "+" : "") + mod : ""}`);
  }));
  $("btn-roll-expr").onclick = () => { const v = $("inp-dice-expr").value.trim(); if (v) roll(v); };
  $("inp-dice-expr").addEventListener("keydown", (e) => { if (e.key === "Enter") $("btn-roll-expr").click(); });

  // keyboard
  window.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (e.code === "Space") { spaceHeld = true; e.preventDefault(); return; }
    const k = e.key.toLowerCase();
    const MOVE = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
    if (MOVE[k] && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); stepToken(...MOVE[k]); return; }
    const map = { v: "select", h: "pan", r: "ruler", p: "ping", b: "draw", f: "fog" };
    if (map[k] && !e.ctrlKey && !e.metaKey) setTool(map[k]);
    else if (k === "+" || k === "=") zoomAt(1.25);
    else if (k === "-") zoomAt(0.8);
    else if (k === "0") fitView();
    else if (k === "escape") { selectToken(null); cancelAction(); closeSheet(); hideMind(); closeLoot(); document.querySelectorAll(".modal:not(#modal-me)").forEach((m) => closeModal(m.id)); }
    else if ((k === "delete" || k === "backspace") && state.selectedTokenId) deleteToken(state.selectedTokenId);
  });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") spaceHeld = false; });

  // canvas
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); }, { passive: false });
  canvas.addEventListener("dragover", (e) => e.preventDefault());
  canvas.addEventListener("drop", (e) => {
    e.preventDefault();
    const pidx = e.dataTransfer.getData("text/geez-prop");
    if (pidx !== "") { if (IS_GM) spawnProp(propEntries[+pidx], screenToWorld(e.clientX, e.clientY)); return; }
    const idx = e.dataTransfer.getData("text/rodeo-token");
    if (idx !== "") { if (IS_GM) spawnToken(libEntries[+idx], screenToWorld(e.clientX, e.clientY)); return; }
    const f = e.dataTransfer.files[0]; if (f && IS_GM) openLocalFile(f);
  });
}

// WASD / arrow keys: the selected token if you can move it, otherwise (players) your own token
function stepToken(dx, dy) {
  let t = state.tokens[state.selectedTokenId];
  if (!t || !canMove(t)) {
    if (IS_GM) return;
    const mine = Object.values(state.tokens).filter((x) => x && x.kind !== "prop" && canMove(x));
    t = mine.find((x) => me?.pcId && x.pcId === me.pcId) || mine[0];
  }
  if (!t) return;
  const g = cellPx(), s = tokPx(t);
  let x = t.x + dx * g, y = t.y + dy * g;
  if (state.grid.snap) ({ x, y } = snapToken(t, x, y));
  x = Math.max(-s / 2, Math.min(state.map.width - s / 2, x));
  y = Math.max(-s / 2, Math.min(state.map.height - s / 2, y));
  patchToken(t.id, { x: r1(x), y: r1(y) });
}

async function openLocalFile(f) {
  try {
    let parsed;
    if (f.type.startsWith("image/")) {
      const src = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(f); });
      parsed = { src, grid: { ...GRID_DEFAULT }, walls: [], portals: [], lights: [] };
    } else parsed = parseUVTT(await f.text());
    $("sel-map").value = "";
    await openMap(f.name, { parsed, local: true });
    toast(`Opened ${esc(f.name)} on your screen only. Put it in battlemap/ to show players.`);
  } catch (e) { toast(`Couldn't open ${esc(f.name)}: ${esc(e.message)}`, "error"); }
}

// ───────────────────────── Props (items from /data) ─────────────────────────
const SCENERY = [
  ["Chest", "🧰"], ["Barrel", "🛢️"], ["Crate", "📦"], ["Campfire", "🔥"], ["Candle", "🕯️"], ["Trap", "⚠️"], ["Statue", "🗿"], ["Altar", "🛐"],
  ["Bones", "💀"], ["Gold pile", "💰"], ["Lever", "🕹️"], ["Bookshelf", "📚"], ["Tree", "🌲"], ["Boulder", "🪨"], ["Door", "🚪"], ["Ladder", "🪜"],
  ["Portal", "🌀"], ["Web", "🕸️"], ["Mushrooms", "🍄"], ["Corpse", "⚰️"], ["Sign", "🪧"], ["Key", "🗝️"], ["Map", "🗺️"], ["Note", "✉️"],
].map(([name, icon]) => ({ name, icon, cat: "scenery", cells: 1, container: ["Chest", "Barrel", "Crate", "Corpse", "Bookshelf", "Gold pile", "Bones"].includes(name) }));
let propData = null, propEntries = [];
function propIcon(item) {
  const c = String(item.equipment_category?.name || item.gear_category?.name || "").toLowerCase(), n = item.name.toLowerCase(), both = c + " " + n;
  if (/potion|elixir|philter|oil of/.test(n)) return "🧪";
  if (/^ring|ring of/.test(n) || c === "ring") return "💍";
  if (/scroll/.test(both)) return "📜";
  if (/wand/.test(both)) return "🪄";
  if (/staff/.test(both)) return "🦯";
  if (/\brod\b/.test(both)) return "🔱";
  if (/shield/.test(n)) return "🛡️";
  if (/armor|mail|plate|breastplate/.test(both)) return "🥋";
  if (/arrow|bolt|ammunition|\bbow\b|crossbow|longbow|shortbow/.test(both)) return "🏹";
  if (/axe/.test(n)) return "🪓";
  if (/hammer|mace|maul|club|flail/.test(n)) return "🔨";
  if (/dagger|knife/.test(n)) return "🔪";
  if (/weapon|sword|scimitar|rapier|spear|trident|halberd|glaive|pike|lance|whip/.test(both)) return "⚔️";
  if (/amulet|necklace|periapt|medallion|talisman|scarab/.test(n)) return "📿";
  if (/cloak|robe|cape/.test(n)) return "🧥";
  if (/boots|slippers/.test(n)) return "🥾";
  if (/gloves|gauntlet|bracers/.test(n)) return "🧤";
  if (/helm|hat|circlet|crown|headband/.test(n)) return "👑";
  if (/book|tome|manual|spellbook/.test(n)) return "📕";
  if (/gem|stone|crystal|orb/.test(n)) return "💎";
  if (/bag|pack|sack|pouch|haversack/.test(n)) return "👜";
  if (/rope|chain/.test(n)) return "⛓️";
  if (/torch|lamp|lantern|candle/.test(n)) return "🕯️";
  if (/horn|flute|lute|drum|instrument|bagpipes|lyre/.test(both)) return "🎺";
  if (/tool|kit|supplies/.test(both)) return "🔧";
  if (/mount|vehicle|saddle|horse|cart|wagon|boat|ship/.test(both)) return "🐴";
  if (/food|ration|ale|wine/.test(n)) return "🍖";
  if (item.rarity) return "✨";
  return "🎒";
}
function propCat(item) {
  const c = String(item.equipment_category?.name || "").toLowerCase(), n = item.name.toLowerCase();
  if (/potion/.test(n) || c === "potion") return "potion";
  if (item.rarity && String(item.rarity.name || "").toLowerCase() !== "varies" || /wondrous|ring|rod|staff|wand|scroll/.test(c)) return "magic";
  if (/weapon|ammunition/.test(c)) return "weapon";
  if (/armor/.test(c)) return "armor";
  return "gear";
}
function descOf(item) {
  const d = Array.isArray(item.desc) ? item.desc : item.desc ? [item.desc] : [];
  const lines = d.filter((x) => !/^(wondrous item|weapon|armor|ring|rod|staff|wand|potion|scroll)\b.*\)?$/i.test(String(x).trim()) || d.length === 1);
  const txt = lines.join(" ").replace(/\s+/g, " ").trim();
  return txt.length > 280 ? txt.slice(0, 277) + "…" : txt;
}
async function loadPropData() {
  if (propData) return refreshProps();
  propData = [];
  $("props-more").textContent = "Loading items from data/…";
  const grab = (f) => fetch(f, { cache: "force-cache" }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const [equip, magic] = await Promise.all([grab("data/equipment.json"), grab("data/magic_items.json")]);
  const seen = new Set();
  for (const it of [...equip, ...magic]) {
    if (!it?.name || seen.has(it.name.toLowerCase())) continue; seen.add(it.name.toLowerCase());
    propData.push({ name: it.name, icon: propIcon(it), cat: propCat(it), rarity: it.rarity?.name && it.rarity.name !== "Varies" ? it.rarity.name : "", desc: descOf(it), cells: 1 });
  }
  propData.sort((a, b) => a.name.localeCompare(b.name));
  refreshProps();
}
function refreshProps() {
  const q = $("inp-prop-search").value.trim().toLowerCase(), cat = $("sel-prop-cat").value;
  const pool = [...SCENERY, ...(propData || [])].filter((p) => (!cat || p.cat === cat) && (!q || p.name.toLowerCase().includes(q)));
  const LIMIT = 60;
  propEntries = pool.slice(0, LIMIT);
  $("list-props").innerHTML = propEntries.map((p, i) => `<div class="prop-card flex flex-col items-center bg-slate-800/60 border p-2 rounded-xl cursor-pointer hover:border-emerald-500 hover:bg-slate-800 transition" style="border-color:${RARITY[String(p.rarity || "").toLowerCase()] || "rgba(51,65,85,.6)"}" draggable="true" data-idx="${i}" title="${esc(p.name)}${p.rarity ? " · " + esc(p.rarity) : ""}${p.desc ? "\n" + esc(p.desc) : ""}">
      <div class="w-10 h-10 rounded-lg bg-slate-900/80 flex items-center justify-center text-2xl">${p.icon}</div>
      <span class="text-[10px] text-slate-300 font-medium mt-1 truncate w-full text-center">${esc(p.name)}</span></div>`).join("") || `<span class="col-span-3 text-[11px] text-slate-500">No match</span>`;
  $("props-more").textContent = !propData?.length && propData ? "No item files found in data/ — only scenery is listed." : pool.length > LIMIT ? `Showing ${LIMIT} of ${pool.length} — search to narrow it down.` : "";
}
function spawnProp(p, at) {
  if (!p) return;
  if (!state.mapKey) return toast("Open a map first");
  const cells = Number(p.cells) || 1, s = cells * cellPx();
  const rc = canvas.getBoundingClientRect();
  const c = at || screenToWorld(rc.left + viewW() / 2, rc.top + viewH() / 2);
  const pos = snapToken({ cells }, c.x - s / 2, c.y - s / 2);
  const id = newId("p");
  const tok = { id, kind: "prop", name: p.name, icon: p.icon || "📦", x: r1(pos.x), y: r1(pos.y), cells, rotation: 0, flipped: false, locked: false, hidden: false };
  if (p.rarity) tok.rarity = p.rarity;
  if (p.desc) tok.desc = p.desc;
  if (p.container) { tok.container = true; tok.open = false; }
  state.tokens[id] = tok; requestRender();
  set(mapRef("tokens/" + id), tok);
}

// ───────────────────────── Containers & loot ─────────────────────────
// A prop's contents live at tokens/<id>/contents/<key> = {name, qty, icon, rarity, desc}; tokens/<id>/open says if players can loot it.
let lootId = null;
const lootEntries = (t) => Object.entries(t?.contents || {}).filter(([, it]) => it && it.name);
function myTokens() { return Object.values(state.tokens).filter((x) => x && x.kind !== "prop" && me?.pcId && x.pcId === me.pcId); }
function nextTo(a, b) {      // touching, including diagonally (a little slack for unsnapped tokens)
  const sa = tokPx(a), sb = tokPx(b), g = cellPx();
  const gx = Math.max(0, b.x - (a.x + sa), a.x - (b.x + sb)), gy = Math.max(0, b.y - (a.y + sa), a.y - (b.y + sb));
  return Math.max(gx, gy) <= g * 0.3;
}
function lootAccess(t) {
  if (IS_GM) return { ok: true };
  if (!t.open) return { ok: false, why: "It's closed." };
  if (!me?.pcId) return { ok: false, why: "Pick your character (top right) to take items." };
  const mine = myTokens();
  if (!mine.length) return { ok: false, why: "Your token isn't on this map." };
  if (!mine.some((m) => nextTo(m, t))) return { ok: false, why: "Move next to it to take things." };
  return { ok: true };
}
function openLoot(id) { lootId = id; $("loot-panel").classList.remove("hidden"); if (IS_GM) loadPropData().then(fillLootGive); renderLoot(); }
function closeLoot() { lootId = null; $("loot-panel").classList.add("hidden"); }
function fillLootGive() {
  const pcs = pcList(), keep = $("loot-give-to").value;
  $("loot-give-to").innerHTML = pcs.map((p) => `<option value="${esc(p.pcId)}">${esc(p.name)}</option>`).join("") || `<option value="">No PCs</option>`;
  if (pcs.some((p) => p.pcId === keep)) $("loot-give-to").value = keep;
  $("loot-item-names").innerHTML = (propData || []).map((p) => `<option value="${esc(p.name)}">`).join("");
}
function renderLoot() {
  const t = state.tokens[lootId];
  if (!t || (!IS_GM && (t.hidden || !t.open))) { if (t && !IS_GM && !t.open) toast("It was closed."); closeLoot(); return; }
  const items = lootEntries(t), acc = lootAccess(t);
  $("loot-icon").textContent = t.icon || "🧰";
  $("loot-title").textContent = t.name || "Container";
  $("loot-state").textContent = t.open ? "open" : "closed";
  $("loot-state").className = `text-[10px] px-1.5 py-0.5 rounded border ${t.open ? "border-amber-500/50 text-amber-300" : "border-slate-600 text-slate-400"}`;
  $("loot-toggle").textContent = t.open ? "Close" : "Open for players";
  $("loot-hint").textContent = acc.ok ? "" : acc.why;
  $("loot-hint").classList.toggle("hidden", acc.ok);
  $("loot-list").innerHTML = items.length ? items.map(([k, it]) => {
    const q = Number(it.qty ?? 1) || 1, rc = RARITY[String(it.rarity || "").toLowerCase()];
    const btns = IS_GM
      ? `<button data-give="${esc(k)}" class="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-[10px] text-white" title="Give one to the PC picked below">Give</button>
         <button data-remove="${esc(k)}" class="px-1.5 py-1 rounded text-slate-400 hover:text-red-400 text-xs" title="Remove">✕</button>`
      : `<button data-take="${esc(k)}" ${acc.ok ? "" : "disabled"} class="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-[10px] text-white">Take</button>
         ${q > 1 ? `<button data-take-all="${esc(k)}" ${acc.ok ? "" : "disabled"} class="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-[10px]">All</button>` : ""}`;
    return `<div class="flex items-center gap-2 p-1.5 rounded-lg bg-slate-800/70 border" style="border-color:${rc || "rgba(51,65,85,.7)"}" title="${esc(it.desc || "")}">
      <span class="w-8 h-8 rounded-md bg-slate-900 flex items-center justify-center text-lg shrink-0">${it.icon || "🎒"}</span>
      <span class="flex-1 min-w-0"><span class="block text-xs font-semibold truncate">${esc(it.name)}${q > 1 ? ` <span class="text-amber-300 font-mono">×${q}</span>` : ""}</span>
        ${it.desc ? `<span class="block text-[10px] text-slate-400 truncate">${esc(it.desc)}</span>` : ""}</span>${btns}</div>`;
  }).join("") : `<div class="text-xs text-slate-500 text-center py-3">${IS_GM ? "Empty — add items below." : "Empty."}</div>`;
}
// Take items out atomically, so two players can't both grab the last potion
async function takeFromContainer(propId, key, amount) {
  let taken = null;
  const res = await runTransaction(mapRef(`tokens/${propId}/contents/${key}`), (cur) => {
    if (!cur) { taken = null; return; }                 // already gone: abort
    const q = Number(cur.qty ?? 1) || 1, n = amount === "all" ? q : Math.min(q, amount || 1);
    taken = { ...cur, qty: n };
    return q - n > 0 ? { ...cur, qty: q - n } : null;
  });
  return res?.committed && taken ? taken : null;
}
async function addToInventory(pcId, item) {
  const invRef = ref(db, `characters/pcs/${pcId}/inventory`);
  const inv = (await get(invRef)).val() || {};
  const n = Number(item.qty ?? 1) || 1;
  const hit = Object.entries(inv).find(([, it]) => it && String(it.name || "").toLowerCase() === String(item.name).toLowerCase());
  if (hit) return update(ref(db, `characters/pcs/${pcId}/inventory/${hit[0]}`), { qty: (Number(hit[1].qty ?? 1) || 1) + n });
  const out = { name: item.name, qty: n, given_at: Date.now() };
  if (item.desc) out.desc = item.desc;
  return push(invRef, out);
}
function feed(text) { push(R("feed"), { text, by: clientId, t: Date.now() }); }
function watchFeed() {
  let seen = null;
  onValue(query(R("feed"), limitToLast(15)), (snap) => {
    const v = snap.val() || {};
    if (seen) for (const [k, f] of Object.entries(v)) if (!seen.has(k) && f.by !== clientId) toast(f.text);
    seen = new Set(Object.keys(v));
  });
}
function wireLoot() {
  $("loot-close").onclick = closeLoot;
  $("loot-toggle").onclick = () => { const t = state.tokens[lootId]; if (t) patchToken(t.id, { open: !t.open, container: true }); };
  $("loot-list").addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const t = state.tokens[lootId]; if (!t) return;
    if (b.dataset.remove && IS_GM) { remove(mapRef(`tokens/${t.id}/contents/${b.dataset.remove}`)); return; }
    const key = b.dataset.give || b.dataset.take || b.dataset.takeAll; if (!key) return;
    let pcId, who;
    if (b.dataset.give) { pcId = $("loot-give-to").value; who = pcList().find((p) => p.pcId === pcId)?.name; if (!pcId) return toast("No PC to give to"); }
    else { const acc = lootAccess(t); if (!acc.ok) return toast(acc.why); pcId = me.pcId; who = me.name; }
    b.disabled = true;
    try {
      const got = await takeFromContainer(t.id, key, b.dataset.takeAll ? "all" : 1);
      if (!got) { toast("Someone got there first."); return; }
      await addToInventory(pcId, got);
      const msg = `🎒 <b>${esc(who)}</b> took <b>${esc(got.name)}</b>${got.qty > 1 ? ` ×${got.qty}` : ""} from the ${esc(String(t.name || "container").toLowerCase())}`;
      toast(msg); feed(msg);
    } catch (err) { toast(`Couldn't take it: ${esc(err.message)}`, "error"); }
    finally { b.disabled = false; }
  });
  const add = () => {
    const t = state.tokens[lootId]; if (!t || !IS_GM) return;
    const name = $("loot-add-name").value.trim(), qty = Math.max(1, parseInt($("loot-add-qty").value, 10) || 1);
    if (!name) return;
    const known = (propData || []).find((p) => p.name.toLowerCase() === name.toLowerCase());
    const same = lootEntries(t).find(([, it]) => it.name.toLowerCase() === name.toLowerCase());
    if (same) update(mapRef(`tokens/${t.id}/contents/${same[0]}`), { qty: (Number(same[1].qty ?? 1) || 1) + qty });
    else {
      const it = { name: known?.name || name, qty, icon: known?.icon || "🎒" };
      if (known?.rarity) it.rarity = known.rarity;
      if (known?.desc) it.desc = known.desc;
      set(mapRef(`tokens/${t.id}/contents/${newId("i")}`), it);
    }
    if (!t.container) patchToken(t.id, { container: true });
    $("loot-add-name").value = ""; $("loot-add-qty").value = 1; $("loot-add-name").focus();
  };
  $("loot-add").onclick = add;
  $("loot-add-name").addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
}

// ───────────────────────── Mind messages (telepathy overlay) ─────────────────────────
let mindStyle = "psionic", mindQueue = [], mindShowing = false, mindTimer = null;
function openMindModal() {
  const pcs = pcList();
  $("mind-targets").innerHTML = `<label class="flex items-center gap-1 px-2 py-1 rounded-full border border-slate-700 cursor-pointer"><input type="checkbox" id="mind-all" checked class="accent-purple-500"> Everyone</label>` +
    pcs.map((p) => `<label class="flex items-center gap-1 px-2 py-1 rounded-full border border-slate-700 cursor-pointer"><input type="checkbox" class="mind-pc accent-purple-500" value="${esc(p.pcId)}"> ${esc(p.name)}</label>`).join("");
  $("mind-all").onchange = (e) => { if (e.target.checked) document.querySelectorAll(".mind-pc").forEach((c) => (c.checked = false)); };
  document.querySelectorAll(".mind-pc").forEach((c) => (c.onchange = () => { $("mind-all").checked = ![...document.querySelectorAll(".mind-pc")].some((x) => x.checked); }));
  openModal("modal-mind"); setTimeout(() => $("inp-mind-text").focus(), 50);
}
function mindDraft() {
  const text = $("inp-mind-text").value.trim();
  if (!text) { toast("Write the message first"); return null; }
  return { text, from: $("inp-mind-from").value.trim(), style: document.querySelector(".mind-style-btn.on")?.dataset.style || "psionic" };
}
function sendMind() {
  const m = mindDraft(); if (!m) return;
  const picks = [...document.querySelectorAll(".mind-pc:checked")].map((c) => c.value);
  const to = picks.length ? Object.fromEntries(picks.map((id) => [id, true])) : null;
  push(R("messages"), { ...m, to, t: Date.now() });
  const names = picks.length ? pcList().filter((p) => picks.includes(p.pcId)).map((p) => p.name).join(", ") : "everyone";
  toast(`🧠 Sent to ${esc(names)}`);
  $("inp-mind-text").value = ""; closeModal("modal-mind");
}
function showMind(m) {
  if (mindShowing) { mindQueue.push(m); return; }
  mindShowing = true;
  const ov = $("mind-overlay");
  ov.dataset.style = m.style || "psionic";
  $("mind-from").textContent = m.from || "";
  // letters fade in one by one; words stay together so lines wrap cleanly
  const words = String(m.text).split(/(\s+)/); let i = 0;
  $("mind-text").innerHTML = words.map((w) => /^\s+$/.test(w) ? w : `<span style="display:inline-block;opacity:1;filter:none;animation:none">${[...w].map((ch) => `<span style="animation-delay:${(i++ * 0.035).toFixed(3)}s">${esc(ch)}</span>`).join("")}</span>`).join("");
  ov.classList.remove("out"); ov.classList.add("show");
  clearTimeout(mindTimer);
  mindTimer = setTimeout(hideMind, Math.min(25000, 5000 + String(m.text).length * 90));
}
function hideMind() {
  const ov = $("mind-overlay");
  if (!mindShowing) return;
  clearTimeout(mindTimer);
  ov.classList.add("out");
  setTimeout(() => {
    ov.classList.remove("show", "out"); mindShowing = false;
    const next = mindQueue.shift(); if (next) showMind(next);
  }, 650);
}
function watchMind() {
  let seen = null;
  onValue(query(R("messages"), limitToLast(10)), (snap) => {
    const v = snap.val() || {};
    const keys = Object.keys(v).sort();
    if (seen) for (const k of keys) {
      if (seen.has(k)) continue;
      const m = v[k];
      const forMe = IS_GM || !m.to || (me?.pcId && m.to[me.pcId]);
      if (forMe && !IS_GM) showMind(m);
    }
    seen = new Set(keys);
  });
}

// ───────────────────────── Player identity ─────────────────────────
function setMe(m) {
  me = m; localStorage.setItem("rodeo.me", JSON.stringify(m));
  $("lbl-me").textContent = m.name; closeModal("modal-me"); refreshRestedBadge(); requestRender();
}
function refreshRestedBadge() {
  const n = !IS_GM && me?.pcId ? restedLeft(me.pcId) : 0;
  $("badge-rested").classList.toggle("hidden", !n);
  $("badge-rested").textContent = `🌙 ${n}`;
}

// ───────────────────────── Long rest / Well rested (GM) ─────────────────────────
function openRestModal() {
  const pcs = pcList(), camp = localStorage.getItem("rodeo.campaign") || "";
  $("rest-targets").innerHTML = pcs.map((p) => `<label class="flex items-center gap-1 px-2 py-1 rounded-full border border-slate-700 cursor-pointer">
      <input type="checkbox" class="rest-pc accent-indigo-500" value="${esc(p.pcId)}" ${!camp || !p.campaign || p.campaign === camp ? "checked" : ""}> ${esc(p.name)}${restedLeft(p.pcId) ? ` <span class="text-indigo-300">🌙${restedLeft(p.pcId)}</span>` : ""}</label>`).join("") || `<span class="text-slate-500">No PCs in Firebase</span>`;
  openModal("modal-rest");
}
async function grantRest(clear) {
  const ids = [...document.querySelectorAll(".rest-pc:checked")].map((c) => c.value);
  if (!ids.length) return toast("Tick at least one character");
  const rolls = Math.max(1, Math.min(50, parseInt($("inp-rest-rolls").value, 10) || 10));
  const restore = !clear && $("chk-rest-restore").checked;
  const patch = {};
  for (const id of ids) {
    patch[`${id}/buffs/well_rested`] = clear ? null : { rolls_left: rolls, die: "1d4", granted_at: Date.now() };
    if (restore) {
      const c = pcsData[id] || {};
      if (c.combat?.hp_max != null) patch[`${id}/combat/hp_current`] = c.combat.hp_max;
      if (c.spellcasting) patch[`${id}/spellcasting/slots_used`] = null;
    }
  }
  try { await update(ref(db, "characters/pcs"), patch); } catch (e) { return toast(`Failed: ${esc(e.message)}`, "error"); }
  const names = pcList().filter((p) => ids.includes(p.pcId)).map((p) => p.name).join(", ");
  if (!clear) {
    push(R("messages"), { style: "dream", from: "Long rest", text: `You wake well rested.\n+1d4 to your next ${rolls} rolls.`, to: Object.fromEntries(ids.map((i) => [i, true])), t: Date.now() });
    toast(`🌙 ${esc(names)} ${ids.length > 1 ? "are" : "is"} well rested`);
  } else toast(`Removed Well Rested from ${esc(names)}`);
  closeModal("modal-rest");
}
function refreshMePicker() {
  if (IS_GM) return;
  const pcs = pcList();
  $("me-pc-list").innerHTML = pcs.length ? pcs.map((p) => `<div data-pc="${esc(p.pcId)}" class="flex flex-col items-center bg-slate-800/60 border ${me?.pcId === p.pcId ? "border-emerald-500" : "border-slate-700/60"} p-2 rounded-xl cursor-pointer hover:border-emerald-500">
      <div class="w-12 h-12 relative"><div class="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white" style="background:${hashColor(p.name)}">${esc(initials(p.name))}</div>
      <img data-srcs="${esc(JSON.stringify(tokenSrcs(p)))}" class="absolute inset-0 w-12 h-12 rounded-full object-cover hidden"></div>
      <span class="text-[11px] mt-1 truncate w-full text-center">${esc(p.name)}</span>${p.campaign ? `<span class="text-[9px] text-slate-500 truncate w-full text-center">${esc(p.campaign)}</span>` : ""}</div>`).join("")
    : `<span class="col-span-3 text-xs text-slate-500">Loading characters…</span>`;
  hydrateImgs($("me-pc-list"));
}

// ───────────────────────── Dice ─────────────────────────
// Every roll keeps its faces as dice: [{s: sides, v: value, drop?: true, bonus?: true}] so every screen can throw the same dice.
const rnd = (n) => 1 + Math.floor(Math.random() * n);
function rollExpr(expr) {
  const clean = expr.toLowerCase().replace(/\s/g, "");
  if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(clean)) return null;
  const parts = [], dice = []; let total = 0;
  for (const m of clean.matchAll(/([+-]?)(\d*d\d+|\d+)/g)) {
    const sign = m[1] === "-" ? -1 : 1;
    if (m[2].includes("d")) {
      let [n, sides] = m[2].split("d").map(Number); n = Math.min(n || 1, 100); sides = Math.max(1, Math.min(sides, 1000));
      const rolls = Array.from({ length: n }, () => rnd(sides));
      rolls.forEach((v) => dice.push({ s: sides, v }));
      total += sign * rolls.reduce((a, b) => a + b, 0);
      parts.push(`${sign < 0 ? "−" : parts.length ? "+" : ""}[${rolls.join(",")}]`);
    } else { total += sign * Number(m[2]); parts.push(`${sign < 0 ? "−" : "+"}${m[2]}`); }
  }
  return { total, detail: parts.join(" "), dice };
}
const restedLeft = (pcId) => Number(pcsData[pcId]?.buffs?.well_rested?.rolls_left) || 0;
// Well rested: +1d4 on the player's own rolls until the charges run out
async function useWellRested(entry, pcId = me?.pcId) {
  if (IS_GM || !pcId || pcId !== me?.pcId || restedLeft(pcId) <= 0) return entry;
  let used = false;
  try {
    const res = await runTransaction(ref(db, `characters/pcs/${pcId}/buffs/well_rested`), (cur) => {
      if (!cur || !(Number(cur.rolls_left) > 0)) { used = false; return; }
      used = true;
      const left = Number(cur.rolls_left) - 1;
      return left > 0 ? { ...cur, rolls_left: left } : null;
    });
    if (res?.committed && used) {
      const b = rnd(4);
      return { ...entry, total: entry.total + b, detail: `${entry.detail} +🌙${b}`, rested: true, dice: [...(entry.dice || []), { s: 4, v: b, bonus: true }] };
    }
  } catch (e) { console.warn("Well rested not applied", e); }
  return entry;
}
async function postRoll(entry) {
  entry = await useWellRested(entry);
  showDiceBox(entry.total, entry.expr + (entry.rested ? " +1d4 🌙" : ""));
  closeModal("modal-dice");                                   // watch the dice land
  if (IS_GM && $("chk-dice-private").checked) {
    const e = { ...entry, private: true, name: "DM", color: myColor(), t: Date.now(), key: "p" + Date.now() };
    privateRolls.push(e); renderDiceLog(); throwOnTable(e); return;
  }
  push(R("dice"), { ...entry, name: me?.name || "?", color: myColor(), t: Date.now() });
}
function roll(expr) {
  const res = rollExpr(expr);
  if (!res) return toast(`Can't roll "${esc(expr)}"`);
  postRoll({ expr, total: res.total, detail: res.detail, dice: res.dice });
}
function rollAdv(kind, mod) {
  const a = rnd(20), b = rnd(20);
  const keep = kind === "adv" ? Math.max(a, b) : Math.min(a, b);
  const dropA = a !== keep;
  postRoll({ expr: `d20 ${kind === "adv" ? "adv" : "dis"}${mod ? (mod > 0 ? "+" : "") + mod : ""}`, total: keep + mod,
    detail: `[${a},${b}] keep ${keep}${mod ? (mod > 0 ? " +" : " −") + Math.abs(mod) : ""}`,
    dice: [{ s: 20, v: a, ...(dropA ? { drop: true } : {}) }, { s: 20, v: b, ...(!dropA ? { drop: true } : {}) }] });
}
function showDiceBox(total, expr) {
  const box = $("dice-box");
  box.innerHTML = `<span>${total}</span><span class="text-slate-400 text-xs font-normal tracking-normal">${esc(expr)}</span>`;
  box.animate([{ transform: "scale(0.6) rotate(-12deg)", opacity: 0.3 }, { transform: "scale(1.1)", opacity: 1 }, { transform: "scale(1)" }], { duration: 350, easing: "ease-out" });
}
let diceEntries = [], diceSeen = null;
const privateRolls = [];
function renderDiceLog() {
  const all = [...diceEntries, ...privateRolls].sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 40);
  $("dice-log-list").innerHTML = all.length ? all.map((d) => `<div class="flex justify-between gap-2 border-b border-slate-800/80 pb-1">
      <span class="truncate"><span style="color:${esc(d.color || "#94a3b8")}">${esc(d.name || "DM")}</span>${d.private ? ' <span class="text-amber-400">(GM)</span>' : ""} <span class="text-slate-500">${esc(d.expr)}</span> <span class="text-slate-600">${esc(d.detail || "")}</span></span>
      <span class="font-bold text-emerald-300">${esc(d.total)}</span></div>`).join("")
    : `<div class="text-slate-500 italic text-center py-2">No rolls yet.</div>`;
}
function watchDice() {
  onValue(query(R("dice"), limitToLast(30)), (s) => {
    const v = s.val() || {};
    diceEntries = Object.entries(v).map(([key, d]) => ({ ...d, key }));
    if (diceSeen) for (const d of diceEntries) if (!diceSeen.has(d.key) && !d.call) throwOnTable(d);
    diceSeen = new Set(diceEntries.map((d) => d.key));
    renderDiceLog();
  });
}

// ───────────────────────── Dice tray: dice tumble, bounce and settle ─────────────────────────
const DIE_POLY = {
  4: "50,8 94,86 6,86", 6: "14,14 86,14 86,86 14,86", 8: "50,4 94,50 50,96 6,50", 10: "50,4 92,42 50,96 8,42",
  12: "50,5 93,36 77,91 23,91 7,36", 20: "50,4 91,27 91,73 50,96 9,73 9,27",
};
const DIE_FACETS = { 20: `<polyline points="50,4 30,60 70,60 50,4" /><polyline points="9,27 30,60 9,73" /><polyline points="91,27 70,60 91,73" /><polyline points="30,60 50,96 70,60" />`,
  8: `<polyline points="6,50 94,50" />`, 10: `<polyline points="8,42 50,62 92,42" /><polyline points="50,62 50,96" />`, 12: `<polyline points="30,40 70,40 78,66 50,84 22,66 30,40" />` };
function makeDie(d, color, size) {
  const sides = DIE_POLY[d.s] ? d.s : d.s === 100 ? 10 : d.s <= 4 ? 4 : d.s <= 6 ? 6 : d.s <= 8 ? 8 : d.s <= 10 ? 10 : d.s <= 12 ? 12 : 20;
  const el = document.createElement("div");
  el.className = `die d${sides}${d.drop ? " drop" : ""}`;
  el.style.setProperty("--ds", `${d.bonus ? size * 0.8 : size}px`);
  const fill = d.bonus ? "#4338ca" : color;
  el.innerHTML = `<svg viewBox="0 0 100 100"><polygon points="${DIE_POLY[sides]}" fill="${esc(fill)}" stroke="rgba(255,255,255,.9)" stroke-width="4" stroke-linejoin="round"/>
    <g fill="none" stroke="rgba(255,255,255,.28)" stroke-width="2">${DIE_FACETS[sides] || ""}</g></svg><span class="die-num"></span>`;
  return el;
}
// Throw a group of dice into a tray element; resolves when they settle. Returns the group's resting centre.
function throwDice(tray, dice, { color = "#0ea5e9", size = 52, label = "", sub = "", total = "", persist = false, from = null } = {}) {
  dice = asList(dice);
  return new Promise((resolve) => {
    if (!dice.length) return resolve(null);
    const W = tray.clientWidth, H = tray.clientHeight, m = size * 0.7;
    const group = document.createElement("div"); group.style.cssText = "position:absolute;inset:0;pointer-events:none"; tray.appendChild(group);
    // pick a landing area away from earlier groups, throw from an edge toward it
    const spots = tray._spots || (tray._spots = []);
    let tx = W / 2, ty = H / 2;
    for (let tries = 0; tries < 25; tries++) {
      tx = m + size + Math.random() * Math.max(1, W - 2 * (m + size)); ty = m + size + Math.random() * Math.max(1, H - 2 * (m + size) - 30);
      if (spots.every((p) => Math.hypot(p.x - tx, p.y - ty) > size * 2.4)) break;
    }
    spots.push({ x: tx, y: ty });
    const side = from ?? Math.floor(Math.random() * 4);
    const bodies = dice.map((d, i) => {
      const el = makeDie(d, color, size); group.appendChild(el);
      const sx = side === 0 ? -size : side === 1 ? W + size : tx + (Math.random() - 0.5) * W * 0.6;
      const sy = side === 2 ? -size : side === 3 ? H + size : ty + (Math.random() - 0.5) * H * 0.6;
      const ox = tx + (i - (dice.length - 1) / 2) * size * 1.1, oy = ty + (Math.random() - 0.5) * size * 0.6;
      const k = 2.6 + Math.random() * 0.5;                                          // initial speed so it slides to ~(ox,oy)
      return { el, d, x: sx, y: sy, vx: (ox - sx) * k, vy: (oy - sy) * k, a: Math.random() * 360, w: (Math.random() - 0.5) * 1400, flick: 0, done: false };
    });
    let last = performance.now(); const start = last;
    const step = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000); last = now;
      let moving = 0;
      for (const b of bodies) {
        if (b.done) continue;
        b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt;
        const r = size / 2;
        if (b.x < r && b.vx < 0 && b.x > -r * 3 + 1) { b.x = r; b.vx *= -0.55; b.w *= -0.7; }
        if (b.x > W - r && b.vx > 0 && b.x < W + r * 3 - 1) { b.x = W - r; b.vx *= -0.55; b.w *= -0.7; }
        if (b.y < r && b.vy < 0 && b.y > -r * 3 + 1) { b.y = r; b.vy *= -0.55; b.w *= -0.7; }
        if (b.y > H - r && b.vy > 0 && b.y < H + r * 3 - 1) { b.y = H - r; b.vy *= -0.55; b.w *= -0.7; }
        const f = Math.pow(0.05, dt); b.vx *= f; b.vy *= f; b.w *= Math.pow(0.04, dt);
        const sp = Math.hypot(b.vx, b.vy);
        if (now - b.flick > 70) { b.flick = now; b.el.querySelector(".die-num").textContent = rnd(b.d.s === 100 ? 100 : b.d.s); }
        if ((sp < 30 && Math.abs(b.w) < 120) || now - start > 1700) {
          b.done = true;
          b.a = Math.round(b.a / 90) * 90 + (Math.random() - 0.5) * 16;
          b.el.querySelector(".die-num").textContent = b.d.v;
          b.el.classList.add("settled");
          if (b.d.s === 20 && !b.d.drop && b.d.v === 20) b.el.classList.add("crit");
          if (b.d.s === 20 && !b.d.drop && b.d.v === 1) b.el.classList.add("fumble");
        } else moving++;
        b.el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${b.a}deg)`;
        b.el.style.left = "0"; b.el.style.top = "0";
      }
      if (moving) return requestAnimationFrame(step);
      // label under the dice
      const cx = bodies.reduce((a, b) => a + b.x, 0) / bodies.length, cy = Math.max(...bodies.map((b) => b.y));
      if (label || total !== "") {
        const lab = document.createElement("div"); lab.className = "tray-label";
        lab.style.left = `${Math.max(60, Math.min(W - 60, cx))}px`; lab.style.top = `${Math.min(H - 28, cy + size * 0.55)}px`;
        lab.innerHTML = `<span style="color:${esc(color)}">●</span> ${esc(label)}<b>${esc(total)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}`;
        group.appendChild(lab);
      }
      if (!persist) setTimeout(() => { group.classList.add("tray-fade"); setTimeout(() => { group.remove(); const i = spots.findIndex((p) => p.x === tx && p.y === ty); if (i >= 0) spots.splice(i, 1); }, 900); }, 4200);
      resolve({ x: cx, y: cy });
    };
    requestAnimationFrame(step);
  });
}
function throwOnTable(d) {
  if (!asList(d?.dice).length) return;
  throwDice($("free-tray"), d.dice, { color: d.color || "#0ea5e9", size: 46, label: d.name || "", total: d.total, sub: d.expr });
}

// ───────────────────────── Roll calls (initiative, saves, checks) ─────────────────────────
// rodeo/rollcall = {id, kind, key, title, dc, showDc, mode, to:{pcId:true}, open, t, results:{rid:{name,color,pcId,dice,mod,extras,total,t}}}
const ABIL = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const SKILLS = [
  ["acrobatics", "Acrobatics", "dex"], ["animal_handling", "Animal Handling", "wis"], ["arcana", "Arcana", "int"], ["athletics", "Athletics", "str"],
  ["deception", "Deception", "cha"], ["history", "History", "int"], ["insight", "Insight", "wis"], ["intimidation", "Intimidation", "cha"],
  ["investigation", "Investigation", "int"], ["medicine", "Medicine", "wis"], ["nature", "Nature", "int"], ["perception", "Perception", "wis"],
  ["performance", "Performance", "cha"], ["persuasion", "Persuasion", "cha"], ["religion", "Religion", "int"], ["sleight_of_hand", "Sleight of Hand", "dex"],
  ["stealth", "Stealth", "dex"], ["survival", "Survival", "wis"],
];
const asList = (x) => (Array.isArray(x) ? x : x && typeof x === "object" ? Object.values(x) : []);   // Firebase may hand arrays back as objects
const abMod = (score) => Math.floor(((Number(score) || 10) - 10) / 2);
const sgn = (n) => (n >= 0 ? "+" : "−") + Math.abs(n);
function statOf(c, ab) { return c?.stats?.[ab] ?? c?.abilities?.[ab]?.score ?? c?.abilities?.[ab] ?? 10; }
// Modifier from the character sheet, with a breakdown for the roll screen
function callMod(c, call) {
  const prof = Number(c?.combat?.proficiency_bonus) || 2, parts = [];
  if (call.kind === "init") {
    const ib = c?.combat?.initiative_bonus;
    if (ib != null && ib !== "") parts.push(["Initiative", Number(ib) || 0]); else parts.push(["DEX", abMod(statOf(c, "dex"))]);
  } else if (call.kind === "save") {
    parts.push([call.key.toUpperCase(), abMod(statOf(c, call.key))]);
    if (asList(c?.saves?.proficient).includes(call.key)) parts.push(["Proficient", prof]);
  } else if (call.kind === "skill") {
    const sk = SKILLS.find((s) => s[0] === call.key), data = c?.skills?.[call.key] || {};
    if (data.bonus != null && data.bonus !== "") parts.push([sk?.[1] || "Skill", Number(data.bonus) || 0]);
    else {
      parts.push([(sk?.[2] || "dex").toUpperCase(), abMod(statOf(c, sk?.[2] || "dex"))]);
      if (data.proficient) parts.push(["Proficient", prof]);
      if (data.expertise) parts.push(["Expertise", prof]);
    }
  } else if (call.kind === "ability") parts.push([call.key.toUpperCase(), abMod(statOf(c, call.key))]);
  return { mod: parts.reduce((a, p) => a + p[1], 0), parts };
}
function callTitle(c) {
  if (c.title) return c.title;
  if (c.kind === "init") return "Initiative";
  if (c.kind === "save") return `${ABIL[c.key] || c.key} Saving Throw`;
  if (c.kind === "skill") { const sk = SKILLS.find((s) => s[0] === c.key); return `${sk ? `${sk[1]} (${sk[2].toUpperCase()})` : c.key} Check`; }
  if (c.kind === "ability") return `${ABIL[c.key] || c.key} Check`;
  return "Roll";
}

let call = null, callSeen = new Set(), callHidden = false, callExtras = {}, callMode = null;
const EXTRAS = [["bless", "Bless", 4], ["guidance", "Guidance", 4], ["resistance", "Resistance", 4], ["bardic", "Bardic Inspiration", 6]];

// GM: the "Call for a roll" dialog
let callKind = "init";
function setCallKind(kind) {
  callKind = kind;
  document.querySelectorAll("#call-kinds .rc-chip").forEach((b) => b.classList.toggle("on", b.dataset.kind === kind));
  const sel = $("call-key");
  if (kind === "save" || kind === "ability") sel.innerHTML = Object.entries(ABIL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  else if (kind === "skill") sel.innerHTML = SKILLS.map(([k, l, a]) => `<option value="${k}">${l} (${a.toUpperCase()})</option>`).join("");
  sel.classList.toggle("hidden", kind === "init");
}
function openCallModal() {
  const pcs = pcList(), camp = localStorage.getItem("rodeo.campaign") || "";
  $("call-targets").innerHTML = pcs.map((p) => `<label class="flex items-center gap-1 px-2 py-1 rounded-full border border-slate-700 cursor-pointer">
    <input type="checkbox" class="call-pc accent-amber-500" value="${esc(p.pcId)}" ${!camp || !p.campaign || p.campaign === camp ? "checked" : ""}> ${esc(p.name)}</label>`).join("") || `<span class="text-slate-500">No PCs in Firebase</span>`;
  setCallKind(callKind);
  openModal("modal-call");
}
function sendCall() {
  const ids = [...document.querySelectorAll(".call-pc:checked")].map((c) => c.value);
  if (!ids.length) return toast("Tick at least one character");
  const dc = parseInt($("call-dc").value, 10);
  const c = { id: newId("c"), kind: callKind, key: callKind === "init" ? "" : $("call-key").value, title: $("call-custom").value.trim(),
    dc: callKind !== "init" && dc > 0 ? dc : null, showDc: $("call-showdc").checked, mode: $("call-mode").value, to: Object.fromEntries(ids.map((i) => [i, true])), open: true, t: Date.now() };
  set(R("rollcall"), c);
  $("call-custom").value = "";
  closeModal("modal-call");
}

// Initiative order stays on screen (top right) after the roll call closes, until the DM clears it
function renderInitStrip(v) {
  let el = $("init-strip");
  if (!el) {
    el = document.createElement("div"); el.id = "init-strip";
    el.className = "glass-panel rounded-xl p-2 text-xs shadow-xl";
    el.style.cssText = "position:absolute;top:10px;right:10px;z-index:20;min-width:150px;max-width:220px;max-height:60vh;overflow-y:auto;display:none";
    $("canvas-container").appendChild(el);
    el.addEventListener("click", (e) => { if (e.target.closest("#init-clear") && IS_GM) set(R("rollcall"), null); });
  }
  const rows = v && v.kind === "init" ? Object.values(v.results || {}).sort((a, b) => (b.total ?? 0) - (a.total ?? 0)) : [];
  el.style.display = rows.length ? "block" : "none";
  if (!rows.length) return;
  el.innerHTML = `<div class="flex items-center justify-between mb-1"><span class="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">Initiative</span>${IS_GM ? `<button id="init-clear" class="text-slate-500 hover:text-red-400 px-1" title="Clear for everyone">✕</button>` : ""}</div>`
    + rows.map((r) => `<div class="flex items-center gap-2 py-0.5"><span style="color:${esc(r.color || hashColor(r.name))}">●</span><span class="flex-1 truncate">${esc(r.name)}</span><span class="font-bold text-amber-200">${esc(r.total)}</span></div>`).join("");
}
function watchCall() {
  onValue(R("rollcall"), (s) => {
    const v = s.val();
    const fresh = v && (!call || call.id !== v.id);
    renderInitStrip(v);
    call = v && v.open ? v : null;
    if (!call) { hideCall(); return; }
    if (fresh) { callSeen = new Set(); callHidden = false; callExtras = {}; callMode = null; clearCallTray(); }
    renderCall();
  });
}
// Throw results not yet shown into the tray (only while the screen is visible, so the tray has a size)
// The roll screen uses the 3D d20 tray (js/geez-dice3d.js); if three.js/cannon can't load, it falls back to the flat dice.
let tray3d = null, tray3dLoading = null, tray3dFailed = false;
function getTray3d() {
  if (tray3d || tray3dFailed) return Promise.resolve(tray3d);
  return (tray3dLoading ||= createDiceTray3D($("rc-tray")).then((t) => (tray3d = t))
    .catch((e) => { console.warn("3D dice unavailable, using flat dice", e); tray3dFailed = true; return null; }));
}
function clearCallTray() {
  if (tray3d) tray3d.clear();
  $("rc-tray").querySelectorAll(":scope > div:not(.d3-layer)").forEach((el) => el.remove());   // flat-dice leftovers
  $("rc-tray")._spots = [];
}
async function throwNewResults() {
  if (!call || callHidden || !$("rc-tray").clientWidth) return;
  const callId = call.id;
  const fresh = Object.entries(call.results || {}).filter(([rid]) => !callSeen.has(rid)).sort((a, b) => (a[1].t || 0) - (b[1].t || 0));
  if (!fresh.length) return;
  fresh.forEach(([rid]) => callSeen.add(rid));
  const showPass = call.dc && (isGMView() || call.showDc) && call.kind !== "init";
  const groups = fresh.map(([, r]) => {
    const dice = asList(r.dice), kept = dice.find((d) => d.s === 20 && !d.drop)?.v;
    const rest = kept != null ? r.total - kept : 0;
    const cls = kept === 20 ? "crit" : kept === 1 ? "bad" : showPass ? (r.total >= call.dc ? "ok" : "bad") : "";
    return { dice, color: r.color || hashColor(r.name), label: r.name, total: r.total, cls,
      sub: kept != null ? `${kept}${rest ? ` ${sgn(rest)}` : ""}${showPass ? (r.total >= call.dc ? " · success" : " · fail") : ""}` : "" };
  });
  const tray = await getTray3d();
  if (!call || call.id !== callId) return;
  if (tray) tray.throwGroup(groups);
  else for (const g of groups) throwDice($("rc-tray"), g.dice, { color: g.color, size: 58, label: g.label, total: g.total, sub: g.sub, persist: true });
}
function hideCall() { $("rc-overlay").classList.remove("show"); $("rc-pill").classList.add("hidden"); }
function callTargets() {
  return Object.keys(call?.to || {}).map((id) => ({ id, name: nameOf(pcsData[id], id), c: pcsData[id] }));
}
function renderCall() {
  if (!call) return;
  const show = !callHidden;
  $("rc-overlay").classList.toggle("show", show);
  $("rc-pill").classList.toggle("hidden", show);
  const title = callTitle(call);
  $("rc-pill-text").textContent = `${title} — tap to watch`;
  $("rc-title").textContent = title;
  const targets = callTargets(), results = call.results || {};
  $("rc-kicker").textContent = call.kind === "init" ? "Roll for" : "The DM calls for";
  const dcVisible = call.dc && (isGMView() || call.showDc);
  $("rc-dc").classList.toggle("hidden", !dcVisible);
  $("rc-dc").innerHTML = dcVisible ? `<i class="fa-solid fa-shield"></i> DC ${call.dc}${call.showDc ? "" : " <span class='text-slate-400 font-normal'>(hidden)</span>"}` : "";
  const modeTxt = call.mode === "adv" ? " · with advantage" : call.mode === "dis" ? " · with disadvantage" : "";
  $("rc-for").textContent = `${targets.map((t) => t.name).join(", ")}${modeTxt}`;

  // results: everyone in the call (and any NPCs the GM added)
  const rows = [...targets.map((t) => ({ rid: t.id, name: t.name, r: results[t.id] })),
    ...Object.entries(results).filter(([rid]) => !call.to?.[rid]).map(([rid, r]) => ({ rid, name: r.name, r }))];
  rows.sort((a, b) => (b.r ? 1 : 0) - (a.r ? 1 : 0) || (call.kind === "init" ? (b.r?.total ?? 0) - (a.r?.total ?? 0) : 0));
  $("rc-results").innerHTML = rows.map(({ name, r }) => {
    if (!r) return `<div class="rc-row wait"><span>${esc(name)}</span><span class="tot">waiting…</span></div>`;
    const pass = call.dc && call.kind !== "init" && (isGMView() || call.showDc) ? (r.total >= call.dc ? `<span class="text-emerald-400 text-xs">✔</span>` : `<span class="text-red-400 text-xs">✘</span>`) : "";
    const kept = asList(r.dice).filter((d) => d.s === 20 && !d.drop)[0]?.v;
    return `<div class="rc-row"><span style="color:${esc(r.color || "#e2e8f0")}">●</span><span>${esc(name)}</span>
      <span class="text-[10px] text-slate-500">${kept === 20 ? "nat 20!" : kept === 1 ? "nat 1" : ""}</span>${pass}<span class="tot">${esc(r.total)}</span></div>`;
  }).join("") || `<div class="text-xs text-slate-500">No one called.</div>`;

  // my roll panel
  const mine = !IS_GM && me?.pcId && call.to?.[me.pcId];
  const myRes = mine && results[me.pcId];
  if (mine && !myRes) {
    const c = pcsData[me.pcId], { mod, parts } = callMod(c, call);
    const mode = callMode || call.mode || "normal";
    const extrasHtml = EXTRAS.map(([k, label, die]) => `<button data-extra="${k}" class="rc-chip ${callExtras[k] ? "on" : ""}">${label} +1d${k === "bardic" ? (callExtras.bardicDie || die) : die}</button>`).join("");
    $("rc-me").innerHTML = `<div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Your roll</div>
      <div class="flex items-center gap-2 mb-2"><span class="text-3xl">🎲</span><div><div class="font-bold text-lg">${mode === "normal" ? "1d20" : "2d20"} ${sgn(mod)}</div>
        <div class="text-[11px] text-slate-400">${parts.map(([l, v]) => `${esc(l)} ${sgn(v)}`).join(" · ") || "no modifier"}${restedLeft(me.pcId) ? " · 🌙 +1d4" : ""}</div></div></div>
      <div class="flex gap-1 mb-2">${["normal", "adv", "dis"].map((m) => `<button data-mode="${m}" class="rc-chip flex-1 ${mode === m ? "on" : ""}">${m === "normal" ? "Normal" : m === "adv" ? "Advantage" : "Disadvantage"}</button>`).join("")}</div>
      <div class="text-[11px] text-slate-400 mb-1">Extra bonuses</div>
      <div class="flex flex-wrap gap-1 mb-2">${extrasHtml}</div>
      <div class="flex items-center gap-2 mb-3 text-xs">${callExtras.bardic ? `<select id="rc-bardic-die" class="bg-slate-900 border border-slate-700 rounded px-1 py-1">${[6, 8, 10, 12].map((d) => `<option value="${d}" ${Number(callExtras.bardicDie || 6) === d ? "selected" : ""}>Bardic d${d}</option>`).join("")}</select>` : ""}
        <span class="text-slate-400">Other</span><input id="rc-other" type="number" value="${callExtras.other || 0}" class="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-1"></div>
      <button id="rc-roll">ROLL</button>`;
  } else if (myRes) {
    $("rc-me").innerHTML = `<div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Your roll</div><div class="text-3xl font-black text-amber-200">${esc(myRes.total)}</div>
      <div class="text-[11px] text-slate-400">${esc(myRes.detail || "")}</div>`;
  } else {
    $("rc-me").innerHTML = IS_GM ? `<div class="text-xs text-slate-400">Players roll on their own screens. You can roll for anyone below.</div>`
      : `<div class="text-xs text-slate-400">You're watching this one.</div>`;
  }

  // GM controls
  if (IS_GM) {
    const missing = targets.filter((t) => !results[t.id]);
    $("rc-gm").innerHTML = `<div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">DM</div>
      ${missing.length ? `<div class="flex flex-wrap gap-1 mb-2">${missing.map((t) => `<button data-rollfor="${esc(t.id)}" class="rc-chip">Roll for ${esc(t.name)}</button>`).join("")}</div>` : ""}
      ${call.kind === "init" ? `<button id="rc-npcs" class="rc-chip w-full mb-2">Roll initiative for NPCs on this map</button>` : ""}
      <button id="rc-close" class="w-full py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-sm font-semibold">Close for everyone</button>`;
  }
  if (show) requestAnimationFrame(throwNewResults);
}

// Roll one entry for the call. pcId = whose sheet the modifier comes from.
async function rollForCall(rid, { name, color, c, pcId, mode = "normal", extras = {}, other = 0 }) {
  if (!call) return;
  const { mod, parts } = callMod(c, call);
  const dice = [];
  let d20;
  if (mode === "normal") { d20 = rnd(20); dice.push({ s: 20, v: d20 }); }
  else {
    const a = rnd(20), b = rnd(20); d20 = mode === "adv" ? Math.max(a, b) : Math.min(a, b);
    const dropFirst = a !== d20;
    dice.push({ s: 20, v: a, ...(dropFirst ? { drop: true } : {}) }, { s: 20, v: b, ...(!dropFirst && a !== b ? { drop: true } : {}) });
    if (a === b) dice[1].drop = true;
  }
  let total = d20 + mod; const bits = [`[${dice.filter((d) => d.s === 20).map((d) => d.v).join(",")}]${mode !== "normal" ? ` ${mode}` : ""}`, sgn(mod)];
  for (const [k, label, die] of EXTRAS) if (extras[k]) {
    const sides = k === "bardic" ? Number(extras.bardicDie || die) : die, v = rnd(sides);
    total += v; dice.push({ s: sides, v }); bits.push(`+${label} ${v}`);
  }
  if (other) { total += other; bits.push(sgn(other)); }
  let entry = { total, detail: bits.join(" "), dice };
  if (pcId) entry = await useWellRested(entry, pcId);
  const res = { name, color, dice: entry.dice, mod, total: entry.total, detail: entry.detail, t: Date.now() };
  if (pcId) res.pcId = pcId;
  const callId = call.id;
  const tx = await runTransaction(R(`rollcall/results/${rid}`), (cur) => (cur ? undefined : res));
  if (!tx?.committed || call?.id !== callId) return;
  push(R("dice"), { name, color, expr: callTitle(call), total: res.total, detail: res.detail, dice: res.dice, call: callId, t: Date.now() });
}

function wireCall() {
  $("btn-call").onclick = openCallModal;
  document.querySelectorAll("#call-kinds .rc-chip").forEach((b) => (b.onclick = () => setCallKind(b.dataset.kind)));
  $("btn-call-send").onclick = sendCall;
  $("rc-hide").onclick = () => { callHidden = true; renderCall(); };
  $("rc-pill").onclick = () => { callHidden = false; renderCall(); };
  $("rc-overlay").addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b || !call) return;
    if (b.dataset.extra) { callExtras[b.dataset.extra] = !callExtras[b.dataset.extra]; renderCall(); return; }
    if (b.dataset.mode) { callMode = b.dataset.mode; renderCall(); return; }
    if (b.id === "rc-roll") {
      b.disabled = true;
      callExtras.other = parseInt($("rc-other")?.value, 10) || 0;
      if ($("rc-bardic-die")) callExtras.bardicDie = Number($("rc-bardic-die").value);
      await rollForCall(me.pcId, { name: me.name, color: myColor(), c: pcsData[me.pcId], pcId: me.pcId, mode: callMode || call.mode || "normal", extras: callExtras, other: callExtras.other });
      return;
    }
    if (b.dataset.rollfor && IS_GM) {
      const id = b.dataset.rollfor, nm = nameOf(pcsData[id], id);
      await rollForCall(id, { name: nm, color: hashColor(nm), c: pcsData[id], mode: call.mode || "normal" });
      return;
    }
    if (b.id === "rc-npcs" && IS_GM) {
      const npcs = Object.values(state.tokens).filter((t) => t && t.kind !== "prop" && !t.pcId && !t.hidden);
      if (!npcs.length) return toast("No visible NPC tokens on this map");
      const count = {};
      for (const t of npcs) {
        const rec = npcsData[t.npcId] || pcsData[t.npcId] || {};
        count[t.name] = (count[t.name] || 0) + 1;
        const nm = npcs.filter((x) => x.name === t.name).length > 1 ? `${t.name} ${count[t.name]}` : t.name;
        await rollForCall("tok_" + t.id, { name: nm, color: "#b91c1c", c: rec, mode: "normal" });
      }
      return;
    }
    if (b.id === "rc-close" && IS_GM) update(R("rollcall"), { open: false });
  });
  $("rc-overlay").addEventListener("change", (e) => {
    if (e.target.id === "rc-bardic-die") { callExtras.bardicDie = Number(e.target.value); renderCall(); }
    if (e.target.id === "rc-other") callExtras.other = parseInt(e.target.value, 10) || 0;
  });
}

// ───────────────────────── Boot ─────────────────────────
function boot() {
  container = $("canvas-container"); canvas = $("vtt-canvas"); ctx = canvas.getContext("2d");
  resizeCanvas(); window.addEventListener("resize", resizeCanvas);
  wireUI(); wireRadial(); setTool("select");
  if (!IS_GM) { $("subpanel-container").style.left = "5rem"; }
  $("lbl-me").textContent = me?.name || "Pick character";
  onValue(ref(db, ".info/connected"), (s) => {
    const on = !!s.val();
    $("dot-conn").className = `w-2 h-2 rounded-full ${on ? "bg-emerald-400" : "bg-red-500"}`;
    $("dot-conn").title = on ? "Connected" : "Not connected to Firebase";
  });
  watchCharacters(); watchSession(); watchPings(); watchRulers(); watchDice(); watchMind(); watchFeed(); wireLoot(); watchCall(); wireCall();
  if (IS_GM) { fillMapSelect(); refreshLibrary(); }
  // opened from index.html's battle map level: ?map=battlemap/<file> moves everyone to it
  if (IS_GM && params.get("map")) gmGoTo(params.get("map"));
  else if (!me) { refreshMePicker(); openModal("modal-me"); }
  window.__rodeo = { state, livePings, throwOnTable, get call() { return call; }, spawnToken, spawnProp, showMind, openMap, gmGoTo, pcList, npcList, get me() { return me; } };
}
boot();
