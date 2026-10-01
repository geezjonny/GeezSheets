// vtt-draw.js — everything drawn on the map that isn't map geometry: tokens, pings, ruler,
// plus the dice-number animation. Replaces the old tokens.js / pings.js / ruler.js / assets.js.
export const TILE = 64;            // pixels per grid square at zoom 1 (rendering only)
export const FEET_PER_SQUARE = 5;

export const CONDITIONS = {
  blinded: "#9ca3af", charmed: "#f472b6", deafened: "#a3a3a3", frightened: "#a855f7", grappled: "#f59e0b",
  incapacitated: "#64748b", invisible: "#e0f2fe", paralyzed: "#facc15", petrified: "#78716c", poisoned: "#22c55e",
  prone: "#d6d3d1", restrained: "#ea580c", stunned: "#fde047", unconscious: "#1e293b", concentrating: "#38bdf8"
};

// ── token art: the token's avatar path if it has one, else tokens/<Name>.png, then tokens/<name>.png
//    (GitHub Pages is case-sensitive). Missing files just fall back to initials. ──
const imgCache = {};
function loadFirst(srcs) {
  const key = srcs.join("|");
  if (!(key in imgCache)) {
    imgCache[key] = null;
    const tryAt = (i) => {
      if (i >= srcs.length) return;
      const img = new Image();
      img.onload = () => { imgCache[key] = img; };
      img.onerror = () => tryAt(i + 1);
      img.src = srcs[i];
    };
    tryAt(0);
  }
  return imgCache[key];
}
export function tokenImage(name, avatar) {
  const srcs = [];
  if (avatar) srcs.push(avatar);
  if (name) { srcs.push(`tokens/${encodeURIComponent(name)}.png`); if (name !== name.toLowerCase()) srcs.push(`tokens/${encodeURIComponent(name.toLowerCase())}.png`); }
  return srcs.length ? loadFirst(srcs) : null;
}

function hashColor(s) {
  let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(h) % 360} 45% 38%)`;
}

// ── tokens ──
// t: { x, y, size, name, type, characterId, hp, maxHp, hidden, hideName, hideHp, conditions }
// pc: the character record for PCs (live HP from the sheet). gm: show hidden info.
export function drawToken(ctx, t, zoom, { pc = null, gm = false, mine = false, alpha = 1 } = {}) {
  const s = Number(t.size) || 1;
  const cx = (t.x + s / 2) * TILE, cy = (t.y + s / 2) * TILE, r = s * TILE * 0.44;
  const conds = Array.isArray(t.conditions) ? t.conditions.filter(Boolean) : Object.keys(t.conditions || {}).filter(k => t.conditions[k]);
  const name = t.name || pc?.name || "";
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  if (conds.includes("prone")) ctx.rotate(Math.PI / 2);

  // body: portrait if tokens/<Name>.png exists, else a coloured disc with initials
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.closePath();
  const img = tokenImage(t.lookupName || name, t.avatar || pc?.vtt_profile?.avatar);
  if (img) { ctx.save(); ctx.clip(); ctx.drawImage(img, -r, -r, r * 2, r * 2); ctx.restore(); }
  else {
    ctx.fillStyle = t.type === "pc" ? "#2563eb" : hashColor(name || "npc"); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = `700 ${Math.max(10, r * 0.7)}px system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(name.split(/\s+/).map(w => w[0] || "").join("").slice(0, 2).toUpperCase(), 0, 1);
  }
  ctx.lineWidth = Math.max(2, 3 / zoom);
  ctx.strokeStyle = mine ? "#4ade80" : t.type === "pc" ? "#93c5fd" : "#e4e4e7";
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();

  // HP arc (PC HP comes from the sheet)
  const hp = Number(pc ? pc.combat?.hp_current : t.hp), max = Number(pc ? pc.combat?.hp_max : t.maxHp);
  if (max > 0 && (gm || !t.hideHp)) {
    const p = Math.max(0, Math.min(1, hp / max));
    ctx.strokeStyle = p > .5 ? "#22c55e" : p > .25 ? "#eab308" : "#ef4444";
    ctx.lineWidth = Math.max(3, 4 / zoom);
    ctx.beginPath(); ctx.arc(0, 0, r + ctx.lineWidth, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
  }
  // condition dots
  conds.forEach((c, i) => {
    const a = -Math.PI / 4 + i * 0.45, dr = Math.max(3, r * 0.14);
    ctx.fillStyle = CONDITIONS[c] || "#fff";
    ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, dr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1 / zoom; ctx.stroke();
  });
  ctx.restore();

  // name label (screen-sized)
  if (name && (gm || !t.hideName)) {
    const fs = 12 / zoom;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.font = `600 ${fs}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "top";
    const label = t.hideName && gm ? `${name} (hidden name)` : name;
    const w = ctx.measureText(label).width + 8 / zoom;
    ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(cx - w / 2, cy + r + 4 / zoom, w, fs + 4 / zoom);
    ctx.fillStyle = "#fff"; ctx.fillText(label, cx, cy + r + 6 / zoom);
    ctx.restore();
  }
}

// ── pings: { id: { wx, wy, name, startTime } } in world px, drawn in screen space ──
export function drawPings(ctx, pings, toScreen) {
  const now = Date.now();
  for (const [id, p] of Object.entries(pings)) {
    const age = (now - p.startTime) / 2500;
    if (age >= 1) { delete pings[id]; continue; }
    const [x, y] = toScreen(p.wx, p.wy);
    for (let k = 0; k < 2; k++) {
      const a = (age + k * 0.35) % 1;
      ctx.strokeStyle = `rgba(239,68,68,${1 - a})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 6 + a * 40, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.font = "700 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillStyle = `rgba(255,255,255,${1 - age})`; ctx.fillText(p.name || "", x, y - 14);
  }
}

// ── ruler: a, b are [wx, wy] world px. 5e distance: every square, diagonal or not, is 5 ft ──
export function drawRuler(ctx, a, b, toScreen) {
  if (!a || !b) return;
  const [x1, y1] = toScreen(a[0], a[1]), [x2, y2] = toScreen(b[0], b[1]);
  const squares = Math.round(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / TILE);
  ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "#38bdf8";
  for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
  const text = `${squares * FEET_PER_SQUARE} ft (${squares} sq)`;
  ctx.font = "700 13px system-ui, sans-serif";
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = "rgba(15,23,42,.88)"; ctx.fillRect(x2 + 10, y2 - 22, w, 24);
  ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 1; ctx.strokeRect(x2 + 10, y2 - 22, w, 24);
  ctx.fillStyle = "#38bdf8"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(text, x2 + 16, y2 - 10);
}
// Start the ruler from a token's centre if the press lands on one
export function findSnapPoint(tokens, wx, wy) {
  for (const t of Object.values(tokens)) {
    const s = Number(t.size) || 1;
    if (wx >= t.x * TILE && wx < (t.x + s) * TILE && wy >= t.y * TILE && wy < (t.y + s) * TILE) return [(t.x + s / 2) * TILE, (t.y + s / 2) * TILE];
  }
  return null;
}

// ── dice number: a short spin before the real result lands ──
export function animateDiceResult(d, el, done) {
  const end = Date.now() + 500;
  el.classList.add("rolling");
  (function tick() {
    if (Date.now() < end) { el.textContent = 1 + Math.floor(Math.random() * d.sides); setTimeout(tick, 50); return; }
    el.classList.remove("rolling"); el.textContent = d.result; done?.();
  })();
}
