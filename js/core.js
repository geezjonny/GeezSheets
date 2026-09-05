import { db } from "./firebase.js";
import {
  ref, onValue, set, update, remove, push, onDisconnect, get
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

/* ---------- PC roster ----------
   Known player-character names, grouped by campaign. Used to add a token
   with an exact, canonical name in one click, so name-based HP sync (see
   resolveHp/setCharacterHp below) can't silently break on a typo or a
   stray capitalization/whitespace difference between two tokens meant to
   be the same character.                                                 */

export const PC_ROSTERS = {
  "Campaign 1": ["Ashara", "Rurik", "Liora", "Lark", "Seris"],
  "Campaign 2": ["Esmeralda", "Jasmine", "Wendy", "Kristoff"],
};

/* ---------- dd2vtt parsing ---------- */

// Firebase Realtime Database rejects any single string value over 10MB.
// Leave real headroom under that for base64 overhead and other room data.
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4096; // sane ceiling before even trying full quality

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode map image"));
    img.src = src;
  });
}

function renderJpeg(img, scale, quality) {
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

// Downscales/recompresses to JPEG until the base64 string fits under the
// Firebase limit. Returns the new data URL and the scale factor actually
// used, so callers can keep grid/wall/door/light coordinates aligned.
async function compressMapImage(dataUrl, onProgress) {
  const img = await loadImageEl(dataUrl);
  let scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  let quality = 0.85;
  let result = renderJpeg(img, scale, quality);
  let attempts = 0;
  while (result.length > MAX_IMAGE_BYTES && attempts < 12) {
    if (onProgress) onProgress(attempts);
    if (quality > 0.5) {
      quality -= 0.1;
    } else {
      scale *= 0.85;
    }
    result = renderJpeg(img, scale, quality);
    attempts++;
  }
  return { dataUrl: result, scale };
}

export async function parseDD2VTT(file, onProgress) {
  const text = await file.text();
  const data = JSON.parse(text);
  const res = data.resolution || {};
  const pxPerGridOriginal = res.pixel_per_grid || 70;
  const cols = res.map_size ? res.map_size.x : 30;
  const rows = res.map_size ? res.map_size.y : 30;
  const originX = res.map_origin ? res.map_origin.x || 0 : 0;
  const originY = res.map_origin ? res.map_origin.y || 0 : 0;

  let imageData = data.image || "";
  if (imageData && !imageData.startsWith("data:")) {
    imageData = "data:image/png;base64," + imageData;
  }

  let pxPerGrid = pxPerGridOriginal;
  let downscaled = false;
  if (imageData && imageData.length > MAX_IMAGE_BYTES) {
    if (onProgress) onProgress("compressing");
    const compressed = await compressMapImage(imageData, () => onProgress && onProgress("compressing"));
    imageData = compressed.dataUrl;
    pxPerGrid = pxPerGridOriginal * compressed.scale;
    downscaled = true;
  }

  // dd2vtt/UVTT stores wall/door/light coordinates in grid units, not pixels.
  // Using the (possibly scaled) pxPerGrid here keeps them aligned to the
  // actual image we ended up storing.
  const toPx = (pt) => ({ x: ((pt.x || 0) - originX) * pxPerGrid, y: ((pt.y || 0) - originY) * pxPerGrid });

  const walls = (data.line_of_sight || []).map((wall) => wall.map(toPx));

  const doors = (data.portals || []).map((p) => {
    const pts = (p.bounds || []).map(toPx);
    const a = pts[0] || { x: 0, y: 0 };
    const b = pts[1] || pts[0] || { x: 0, y: 0 };
    const startsClosed = p.closed !== false;
    // dd2vtt has no distinct "window" object — by convention, a portal that
    // starts open is a window; one that starts closed is a door
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, closed: startsClosed, type: startsClosed ? "door" : "window" };
  });

  const lights = (data.lights || []).map((l) => {
    const p = toPx(l.position || { x: 0, y: 0 });
    const hex = (l.color || "ffd98aff").replace("#", "");
    return {
      x: p.x,
      y: p.y,
      range: (l.range || 0) * pxPerGrid,
      color: "#" + hex.slice(0, 6),
      intensity: l.intensity != null ? l.intensity : 1,
    };
  });

  return {
    image: imageData,
    pxPerGrid,
    cols,
    rows,
    widthPx: cols * pxPerGrid,
    heightPx: rows * pxPerGrid,
    walls,
    doors,
    lights,
    downscaled,
  };
}

/* ---------- geometry ---------- */

export function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function formatDistance(pixelDist, pxPerGrid, feetPerSquare) {
  const squares = pixelDist / pxPerGrid;
  const feet = Math.round(squares * feetPerSquare);
  const squaresRounded = Math.round(squares * 10) / 10;
  return `${squaresRounded} sq \u00b7 ${feet} ft`;
}

/* ---------- per-token personal vision ----------
   Each token can carry a "vision" radius (in grid squares). A player's
   own token temporarily punches through fog within that radius as it
   moves, independent of what the GM has permanently revealed.        */

export const DEFAULT_VISION_SQUARES = 6;

export function tokenVisionPx(token, pxPerGrid) {
  const squares = token && token.vision != null ? token.vision : DEFAULT_VISION_SQUARES;
  return Math.max(0, squares) * pxPerGrid;
}

export function isWithinVision(token, wx, wy, pxPerGrid) {
  if (!token) return false;
  const visionPx = tokenVisionPx(token, pxPerGrid);
  if (visionPx <= 0) return false;
  return dist(token.x, token.y, wx, wy) <= visionPx;
}

/* ---------- wall/door collision ----------
   Used to stop arrow-key movement from crossing a wall or a closed door.
   Closed doors block; open doors don't. Purely geometric (no true line-
   of-sight/vision blocking — see the vision helpers above for that).   */

function segmentsIntersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (denom === 0) return false;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
}

export function movementBlocked(map, fromX, fromY, toX, toY) {
  if (!map) return false;
  const from = { x: fromX, y: fromY };
  const to = { x: toX, y: toY };
  if (map.walls) {
    for (const wall of map.walls) {
      for (let i = 0; i < wall.length - 1; i++) {
        if (segmentsIntersect(from, to, wall[i], wall[i + 1])) return true;
      }
    }
  }
  if (map.doors) {
    for (const d of map.doors) {
      if (!d.closed) continue;
      if (segmentsIntersect(from, to, { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 })) return true;
    }
  }
  return false;
}

export function setMapDoors(roomCode, doors) {
  // patches just the doors array — merges into the map node without
  // touching image/walls/etc, so it never reloads the map image
  return update(roomRef(roomCode, "map"), { doors });
}

export function toggleDoor(roomCode, map, index) {
  if (!map || !map.doors || !map.doors[index]) return;
  const newDoors = map.doors.map((d, i) => (i === index ? { ...d, closed: !d.closed } : d));
  setMapDoors(roomCode, newDoors);
}

export const DOOR_INTERACT_RANGE_SQUARES = 1.5; // generous enough to cover diagonal adjacency

export function doorAt(map, wx, wy) {
  if (!map || !map.doors || !map.doors.length) return null;
  let best = -1, bestDist = Infinity;
  map.doors.forEach((d, i) => {
    const mx = (d.x1 + d.x2) / 2, my = (d.y1 + d.y2) / 2;
    const dd = dist(wx, wy, mx, my);
    if (dd < bestDist) { bestDist = dd; best = i; }
  });
  const threshold = (map.pxPerGrid || 70) * 0.6;
  return bestDist <= threshold ? best : null;
}

export function nearestDoorInRange(map, tokenX, tokenY) {
  if (!map || !map.doors || !map.doors.length) return null;
  let best = -1, bestDist = Infinity;
  map.doors.forEach((d, i) => {
    const mx = (d.x1 + d.x2) / 2, my = (d.y1 + d.y2) / 2;
    const dd = dist(tokenX, tokenY, mx, my);
    if (dd < bestDist) { bestDist = dd; best = i; }
  });
  const range = (map.pxPerGrid || 70) * DOOR_INTERACT_RANGE_SQUARES;
  return bestDist <= range ? best : null;
}

/* ---------- shared door/light icon rendering (canvas-drawn, no image assets) ---------- */

export function drawDoorIcon(ctx, d, scale) {
  const mx = (d.x1 + d.x2) / 2, my = (d.y1 + d.y2) / 2;
  const dx = d.x2 - d.x1, dy = d.y2 - d.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const isWindow = d.type === "window";
  const closedColor = isWindow ? "#5aa9e0" : "#d4a53a";
  const openColor = isWindow ? "#3d7aa8" : "#8a6f2a";
  const markColor = isWindow ? "#1c3a4d" : "#2a2118";

  ctx.save();
  ctx.lineCap = "round";
  if (d.closed) {
    ctx.strokeStyle = closedColor;
    ctx.lineWidth = 6 / scale;
    ctx.beginPath();
    ctx.moveTo(d.x1, d.y1);
    ctx.lineTo(d.x2, d.y2);
    ctx.stroke();
    if (isWindow) {
      // small pane-cross reads as a window rather than a door
      const r = len * 0.12;
      ctx.strokeStyle = markColor;
      ctx.lineWidth = 1.5 / scale;
      ctx.beginPath();
      ctx.moveTo(mx - r, my); ctx.lineTo(mx + r, my);
      ctx.moveTo(mx, my - r); ctx.lineTo(mx, my + r);
      ctx.stroke();
    } else {
      ctx.fillStyle = markColor;
      ctx.beginPath();
      ctx.arc(mx + nx * (len * 0.18), my + ny * (len * 0.18), 3 / scale, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = openColor;
    ctx.lineWidth = 2 / scale;
    ctx.setLineDash([5 / scale, 4 / scale]);
    ctx.beginPath();
    ctx.moveTo(d.x1, d.y1);
    ctx.lineTo(d.x2, d.y2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!isWindow) {
      // hinge-swing arc only makes sense for a door, not a window
      ctx.strokeStyle = "rgba(138,111,42,0.55)";
      ctx.lineWidth = 1.5 / scale;
      ctx.beginPath();
      ctx.arc(d.x1, d.y1, len, Math.atan2(ny, nx), Math.atan2(dy, dx));
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawLightIcon(ctx, l, scale) {
  ctx.save();
  ctx.fillStyle = l.color;
  ctx.beginPath();
  ctx.arc(l.x, l.y, 5 / scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = l.color;
  ctx.lineWidth = 1.5 / scale;
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 3) * i;
    const r1 = 7 / scale, r2 = 11 / scale;
    ctx.beginPath();
    ctx.moveTo(l.x + Math.cos(ang) * r1, l.y + Math.sin(ang) * r1);
    ctx.lineTo(l.x + Math.cos(ang) * r2, l.y + Math.sin(ang) * r2);
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------- GM movement lock (applies to players only) ---------- */

export function watchLocked(roomCode, cb) {
  return onValue(roomRef(roomCode, "locked"), (snap) => cb(!!snap.val()));
}

export function setLocked(roomCode, locked) {
  return set(roomRef(roomCode, "locked"), locked);
}

/* ---------- dice ---------- */

const DIE_TYPES = [4, 6, 8, 10, 12, 20, 100];

export const DIE_SHAPES = {
  4: "polygon(50% 4%, 4% 96%, 96% 96%)",
  6: "none",
  8: "polygon(50% 2%, 98% 50%, 50% 98%, 2% 50%)",
  10: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
  12: "polygon(50% 0%, 90% 18%, 100% 60%, 75% 98%, 25% 98%, 0% 60%, 10% 18%)",
  20: "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)",
  100: "none",
};

export function rollDie(sides) {
  return 1 + Math.floor(Math.random() * sides);
}

export function rollPool(pool) {
  // pool: array of sides, e.g. [20, 6, 6]
  const results = pool.map((sides) => ({ sides, value: rollDie(sides) }));
  const total = results.reduce((sum, r) => sum + r.value, 0);
  return { results, total };
}

export { DIE_TYPES };

/* ---------- room sync ---------- */

export function roomRef(roomCode, path = "") {
  return ref(db, `rooms/${roomCode}${path ? "/" + path : ""}`);
}

export function watchMap(roomCode, cb) {
  return onValue(roomRef(roomCode, "map"), (snap) => cb(snap.val()));
}

export function setMap(roomCode, mapData) {
  return set(roomRef(roomCode, "map"), mapData);
}

export function watchTokens(roomCode, cb) {
  return onValue(roomRef(roomCode, "tokens"), (snap) => cb(snap.val() || {}));
}

export function addToken(roomCode, token) {
  const r = push(roomRef(roomCode, "tokens"));
  set(r, token);
  return r.key;
}

export function moveToken(roomCode, tokenId, x, y) {
  return update(roomRef(roomCode, `tokens/${tokenId}`), { x, y });
}

export function removeToken(roomCode, tokenId) {
  return remove(roomRef(roomCode, `tokens/${tokenId}`));
}

export function updateToken(roomCode, tokenId, fields) {
  return update(roomRef(roomCode, `tokens/${tokenId}`), fields);
}

export function setTokensAll(roomCode, tokensObj) {
  return set(roomRef(roomCode, "tokens"), tokensObj || {});
}

/* ---------- token images ----------
   Convention-based: a token labeled "Goblin" looks for tokens/goblin.png
   (then .jpg/.jpeg/.webp) relative to the page. No listing/API needed —
   drop a matching file in the /tokens folder and it's picked up.        */

const _imgCache = new Map();
const IMG_EXTS = ["png", "jpg", "jpeg", "webp"];

export function slugify(label) {
  return (label || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/* ---------- real PC roster & HP (shared with sheet.html) ----------
   characters/pcs/{charId} is a global (not room-scoped) collection your
   other tools already read/write. A PC record's live combat HP lives at
   characters/pcs/{charId}/combat.{hp_current,hp_max} — same fields
   sheet.html's adjustHp()/watchCharacter() use. classic-vtt has no charId
   of its own, so tokens are matched to a PC record by name (case/space-
   insensitive) via the PC_ROSTERS list. A token whose name doesn't match
   any real PC (e.g. a monster) just keeps using its own hp field.        */

export function watchPcRoster(cb) {
  return onValue(ref(db, "characters/pcs"), (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val)
      .filter(([, c]) => c && c.name && c.campaign !== "__oracle__" && c.type !== "npc" && c.record_type !== "npc")
      .map(([id, c]) => ({ id, ...c }));
    cb(list);
  });
}

function normName(s) {
  return (s || "").trim().toLowerCase();
}

export function findPcByName(pcList, label) {
  const target = normName(label);
  if (!target) return null;
  return (pcList || []).find((c) => normName(c.name) === target) || null;
}

export function pcHp(pc) {
  const combat = pc.combat || {};
  return {
    current: pc.hp ?? combat.hp_current ?? 0,
    max: pc.maxHp ?? combat.hp_max ?? 0,
  };
}

export function setPcHp(charId, hp) {
  const updates = {};
  if (hp.current != null) updates.hp_current = hp.current;
  if (hp.max != null) updates.hp_max = hp.max;
  return update(ref(db, `characters/pcs/${charId}/combat`), updates);
}

// Resolves the HP to display for a token: the real PC record if the
// token's name matches one, otherwise the token's own hp field.
export function resolveHp(token, pcList) {
  const pc = findPcByName(pcList, token.label);
  if (pc) return pcHp(pc);
  return token.hp || { current: 0, max: 0 };
}

// Writes an HP edit to the right place: the real PC record if the token's
// name matches one (so it round-trips to sheet.html and any other tool
// sharing that data), otherwise the token's own hp field as a fallback.
export function setTokenHp(roomCode, tokenId, token, pcList, hp) {
  const pc = findPcByName(pcList, token.label);
  if (pc) return setPcHp(pc.id, hp);
  return updateToken(roomCode, tokenId, { hp });
}

export function resolveTokenImage(label, onResult) {
  const slug = slugify(label);
  if (!slug) return onResult(null);
  const cached = _imgCache.get(slug);
  if (cached !== undefined) return onResult(cached === "notfound" ? null : cached);
  tryExt(0);
  function tryExt(i) {
    if (i >= IMG_EXTS.length) {
      _imgCache.set(slug, "notfound");
      onResult(null);
      return;
    }
    const img = new Image();
    img.onload = () => { _imgCache.set(slug, img); onResult(img); };
    img.onerror = () => tryExt(i + 1);
    img.src = `tokens/${slug}.${IMG_EXTS[i]}`;
  }
}

export function sendPing(roomCode, x, y, color, by) {
  const r = push(roomRef(roomCode, "pings"));
  const payload = { x, y, color, by, ts: Date.now() };
  set(r, payload);
  setTimeout(() => remove(r), 2200);
  return r.key;
}

export function watchPings(roomCode, cb) {
  return onValue(roomRef(roomCode, "pings"), (snap) => cb(snap.val() || {}));
}

export function setRuler(roomCode, uid, rulerData) {
  return set(roomRef(roomCode, `rulers/${uid}`), rulerData);
}

export function clearRuler(roomCode, uid) {
  return remove(roomRef(roomCode, `rulers/${uid}`));
  }

export function watchRulers(roomCode, cb) {
  return onValue(roomRef(roomCode, "rulers"), (snap) => cb(snap.val() || {}));
}

export function rollAndBroadcast(roomCode, pool, by) {
  const { results, total } = rollPool(pool);
  const r = push(roomRef(roomCode, "diceLog"));
  const payload = { results, total, by, ts: Date.now() };
  set(r, payload);
  set(roomRef(roomCode, "diceBroadcast"), { ...payload, id: r.key });
  return { results, total };
}

export function watchDiceBroadcast(roomCode, cb) {
  return onValue(roomRef(roomCode, "diceBroadcast"), (snap) => cb(snap.val()));
}

export function watchDiceLog(roomCode, cb, limit = 30) {
  return onValue(roomRef(roomCode, "diceLog"), (snap) => {
    const val = snap.val() || {};
    const entries = Object.entries(val)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit);
    cb(entries);
  });
}

/* ---------- big dice-roll broadcast overlay ---------- */

let _overlayEl = null;
let _hideTimer = null;

function ensureOverlay() {
  if (_overlayEl) return _overlayEl;
  const el = document.createElement("div");
  el.id = "diceOverlay";
  el.innerHTML = `
    <div class="dice-overlay-backdrop"></div>
    <div class="dice-overlay-content">
      <div class="dice-overlay-by"></div>
      <div class="dice-overlay-dice"></div>
      <div class="dice-overlay-total"></div>
    </div>
  `;
  document.body.appendChild(el);
  el.addEventListener("click", hideOverlay);
  _overlayEl = el;
  return el;
}

function hideOverlay() {
  if (_overlayEl) _overlayEl.classList.remove("show");
  clearTimeout(_hideTimer);
}

export function triggerDiceOverlay(data) {
  const el = ensureOverlay();
  const diceWrap = el.querySelector(".dice-overlay-dice");
  const totalEl = el.querySelector(".dice-overlay-total");
  const byEl = el.querySelector(".dice-overlay-by");

  diceWrap.innerHTML = "";
  totalEl.textContent = "";
  totalEl.className = "dice-overlay-total";
  byEl.textContent = `${data.by} rolled`;

  data.results.forEach((r, i) => {
    const die = document.createElement("div");
    die.className = "dice-overlay-die";
    die.style.clipPath = DIE_SHAPES[r.sides] || "none";
    die.textContent = "?";
    diceWrap.appendChild(die);

    const maxTicks = 10 + i * 2;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
      die.textContent = 1 + Math.floor(Math.random() * r.sides);
      if (ticks >= maxTicks) {
        clearInterval(timer);
        die.textContent = r.value;
        die.classList.add("settled");
        if (r.sides === 20 && r.value === 20) die.classList.add("crit");
        if (r.sides === 20 && r.value === 1) die.classList.add("fumble");
      }
    }, 55);
  });

  const revealDelay = 700 + data.results.length * 110 + 150;
  setTimeout(() => {
    totalEl.textContent = data.total;
    totalEl.classList.add("show");
    const anyCrit = data.results.some((r) => r.sides === 20 && r.value === 20);
    const anyFumble = data.results.some((r) => r.sides === 20 && r.value === 1);
    if (anyCrit) { totalEl.classList.add("crit"); byEl.textContent += " \u2014 CRITICAL!"; }
    else if (anyFumble) { totalEl.classList.add("fumble"); byEl.textContent += " \u2014 fumble"; }
  }, revealDelay);

  el.classList.add("show");
  clearTimeout(_hideTimer);
  _hideTimer = setTimeout(hideOverlay, revealDelay + 2600);
}

/* ---------- snapping ---------- */

export function snapToGrid(x, y, pxPerGrid) {
  return {
    x: (Math.floor(x / pxPerGrid) + 0.5) * pxPerGrid,
    y: (Math.floor(y / pxPerGrid) + 0.5) * pxPerGrid,
  };
}

/* ---------- fog of war ----------
   fog is stored as a single row-major string, one char per cell:
   '1' = hidden, '0' = revealed. Length = cols * rows.            */

export function blankFog(cols, rows, hidden = true) {
  return (hidden ? "1" : "0").repeat(cols * rows);
}

export function cellOf(x, y, pxPerGrid) {
  return { col: Math.floor(x / pxPerGrid), row: Math.floor(y / pxPerGrid) };
}

export function isCellHidden(fog, col, row, cols, rows) {
  if (!fog) return false;
  if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
  return fog[row * cols + col] === "1";
}

export function watchFog(roomCode, cb) {
  return onValue(roomRef(roomCode, "fog"), (snap) => cb(snap.val() || null));
}

export function setFog(roomCode, fogString) {
  return set(roomRef(roomCode, "fog"), fogString);
}

/* ---------- initiative ---------- */

export function watchInitiative(roomCode, cb) {
  return onValue(roomRef(roomCode, "initiative"), (snap) => cb(snap.val() || { list: [], current: 0 }));
}

export function setInitiative(roomCode, data) {
  return set(roomRef(roomCode, "initiative"), data);
}

/* ---------- scenes (GM-only save/recall of map + fog + tokens) ---------- */

export function watchScenes(roomCode, cb) {
  return onValue(roomRef(roomCode, "scenes"), (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));
    cb(list);
  });
}

export function saveScene(roomCode, name, data) {
  const r = push(roomRef(roomCode, "scenes"));
  set(r, { name, ts: Date.now(), ...data });
  return r.key;
}

export function deleteScene(roomCode, sceneId) {
  return remove(roomRef(roomCode, `scenes/${sceneId}`));
}

export function presence(roomCode, uid, name, role) {
  const r = roomRef(roomCode, `presence/${uid}`);
  set(r, { name, role, ts: Date.now() });
  onDisconnect(r).remove();
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function randomColor() {
  const colors = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22", "#1abc9c", "#ecf0f1"];
  return colors[Math.floor(Math.random() * colors.length)];
}
