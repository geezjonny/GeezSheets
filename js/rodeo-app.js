// GeezVTT — a small self-hosted Owlbear-style VTT on the GeezSheets Firebase.
// GM:      rodeo.html?gm=jonny     Player: rodeo.html
import { db, R, ref, get, onValue, set, update, remove, push, query, limitToLast, onDisconnect } from "./rodeo-firebase.js";

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
// Token art: uploaded image → avatar from the character record → tokens/<Name>.png → tokens/<name>.png
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
  onValue(ref(db, "characters/pcs"), (s) => { pcsData = s.val() || {}; refreshLibrary(); refreshMePicker(); });
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
function refreshLibrary() {
  if (!IS_GM) return;
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
  libEntries = [...P, ...N, ...G];
  let i = 0;
  const block = (arr, el, empty) => { $(el).innerHTML = arr.length ? arr.map((e) => tokenCard(e, i++)).join("") : `<span class="col-span-3 text-[11px] text-slate-500">${empty}</span>`; };
  block(P, "list-pcs", Object.keys(pcsData).length ? "No match" : "No PCs in Firebase");
  block(N, "list-npcs", npcs.length ? "No match" : "No NPCs in Firebase");
  block(G, "list-generic", "No match");
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
  $("radial-btn-give").classList.toggle("hidden", !(IS_GM && prop));
  $("radial-btn-sheet").classList.toggle("hidden", !sheetIdFor(t));
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
    else if (k === "escape") { selectToken(null); cancelAction(); closeSheet(); hideMind(); document.querySelectorAll(".modal:not(#modal-me)").forEach((m) => closeModal(m.id)); }
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
].map(([name, icon]) => ({ name, icon, cat: "scenery", cells: 1 }));
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
  state.tokens[id] = tok; requestRender();
  set(mapRef("tokens/" + id), tok);
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
  $("lbl-me").textContent = m.name; closeModal("modal-me"); requestRender();
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
function rollExpr(expr) {
  const clean = expr.toLowerCase().replace(/\s/g, "");
  if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(clean)) return null;
  const parts = []; let total = 0;
  for (const m of clean.matchAll(/([+-]?)(\d*d\d+|\d+)/g)) {
    const sign = m[1] === "-" ? -1 : 1;
    if (m[2].includes("d")) {
      let [n, sides] = m[2].split("d").map(Number); n = Math.min(n || 1, 100); sides = Math.max(1, Math.min(sides, 1000));
      const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
      total += sign * rolls.reduce((a, b) => a + b, 0);
      parts.push(`${sign < 0 ? "−" : parts.length ? "+" : ""}[${rolls.join(",")}]`);
    } else { total += sign * Number(m[2]); parts.push(`${sign < 0 ? "−" : "+"}${m[2]}`); }
  }
  return { total, detail: parts.join(" ") };
}
function postRoll(entry) {
  showDiceBox(entry.total, entry.expr);
  if (IS_GM && $("chk-dice-private").checked) { privateRolls.push({ ...entry, private: true, t: Date.now(), key: "p" + Date.now() }); renderDiceLog(); return; }
  push(R("dice"), { ...entry, name: me?.name || "?", color: myColor(), t: Date.now() });
}
function roll(expr) {
  const res = rollExpr(expr);
  if (!res) return toast(`Can't roll "${esc(expr)}"`);
  postRoll({ expr, total: res.total, detail: res.detail });
}
function rollAdv(kind, mod) {
  const a = 1 + Math.floor(Math.random() * 20), b = 1 + Math.floor(Math.random() * 20);
  const keep = kind === "adv" ? Math.max(a, b) : Math.min(a, b);
  postRoll({ expr: `d20 ${kind === "adv" ? "adv" : "dis"}${mod ? (mod > 0 ? "+" : "") + mod : ""}`, total: keep + mod, detail: `[${a},${b}] keep ${keep}${mod ? (mod > 0 ? " +" : " −") + Math.abs(mod) : ""}` });
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
    if (diceSeen) for (const d of diceEntries) if (!diceSeen.has(d.key)) toast(`<span style="color:${esc(d.color)}">${esc(d.name)}</span> rolled <b>${esc(d.total)}</b> <span class="text-slate-400">${esc(d.expr)}</span>`);
    diceSeen = new Set(diceEntries.map((d) => d.key));
    renderDiceLog();
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
  watchCharacters(); watchSession(); watchPings(); watchRulers(); watchDice(); watchMind();
  if (IS_GM) { fillMapSelect(); refreshLibrary(); }
  else if (!me) { refreshMePicker(); openModal("modal-me"); }
  window.__rodeo = { state, livePings, spawnToken, spawnProp, showMind, openMap, gmGoTo, pcList, npcList, get me() { return me; } };
}
boot();
