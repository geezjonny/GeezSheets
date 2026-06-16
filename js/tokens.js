// Tokens — draw, save, delete, condition apply
// Token state lives in RTDB maps/<name>/tokens/

import { db } from "./firebase.js";
import { ref, set, remove, update } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { TILE } from "./config.js";
import { tokenTextures } from "./assets.js";

// Draw a single token onto ctx
export function drawToken(ctx, tok, zoom, pcsData, CONDITIONS, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha;
  const s   = tok.size || 1;
  const px  = tok.x * TILE, py = tok.y * TILE;
  const sw  = s * TILE,     sh = s * TILE;
  const r   = sw * 0.42,    cx = px + sw / 2, cy = py + sh / 2;
  const img = tokenTextures[tok.characterId];

  // Live HP (PCs read from characters/pcs, NPCs use token data)
  let liveHp = tok.hp, liveMaxHp = tok.maxHp;
  if (tok.type === "pc" && pcsData[tok.characterId]) {
    const c = pcsData[tok.characterId];
    liveHp    = c.hp ?? c.combat?.hp_current ?? tok.hp;
    liveMaxHp = c.maxHp ?? c.combat?.hp_max  ?? tok.maxHp;
  }
  const pct = Math.max(0, Math.min(1, (liveHp ?? liveMaxHp) / (liveMaxHp || 1)));

  // Portrait or initial — clipped to circle
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  if (img) {
    ctx.drawImage(img, px, py, sw, sh);
  } else {
    ctx.fillStyle = tok.type === "pc" ? "#3a6aaa" : "#8a2a2a"; ctx.fillRect(px, py, sw, sh);
    ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.round(14 * s / zoom)}px Cinzel,serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText((tok.name || "?")[0].toUpperCase(), cx, cy);
  }

  // HP vignette — black closes in from the edges as HP drops
  // pct=1 -> no vignette. pct=0 -> fully black.
  if (pct < 1) {
    const deathAmount = 1 - pct; // 0..1
    const grad = ctx.createRadialGradient(cx, cy, r * (1 - deathAmount), cx, cy, r);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${0.85 * deathAmount + (deathAmount > 0 ? 0.15 : 0)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, sw, sh);
  }

  // Condition tint — pulsing cycle through active condition colors
  const conds = tok.conditions || [];
  if (conds.length) {
    const cycleMs = 1400; // time per condition color
    const now = Date.now();
    const idx = Math.floor(now / cycleMs) % conds.length;
    const nextIdx = (idx + 1) % conds.length;
    const blend = (now % cycleMs) / cycleMs; // 0..1 fade progress
    const colorA = CONDITIONS[conds[idx]] || "#fff";
    const colorB = CONDITIONS[conds[nextIdx]] || colorA;
    // Simple crossfade between two flat tints using two fillRects with alpha
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = colorA; ctx.globalAlpha = alpha * 0.35 * (1 - blend);
    ctx.fillRect(px, py, sw, sh);
    ctx.fillStyle = colorB; ctx.globalAlpha = alpha * 0.35 * blend;
    ctx.fillRect(px, py, sw, sh);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha;
  }
  ctx.restore(); // end clip

  // Ring border
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = tok.type === "pc" ? "#7ab0e0" : "#e07070"; ctx.lineWidth = 2 / zoom; ctx.stroke();

  // Name label with dark background
  ctx.font = `${Math.round(9 / zoom)}px Cinzel,serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  const nameLabel = tok.name || "";
  const nameW = ctx.measureText(nameLabel).width;
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(cx - nameW / 2 - 3 / zoom, py + sh + 2 / zoom, nameW + 6 / zoom, 10 / zoom);
  ctx.fillStyle = "#fff"; ctx.fillText(nameLabel, cx, py + sh + 2 / zoom);

  // HP bar
  const bw  = sw * 0.85, bh = 5 / zoom;
  const bx  = px + (sw - bw) / 2, by = py + sh + 12 / zoom;
  ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = pct > .5 ? "#4a9a4a" : pct > .25 ? "#aaaa30" : "#aa3030";
  ctx.fillRect(bx, by, bw * pct, bh);

  ctx.restore();
}

// Token at tile (accounts for size)
export function tokenAtTile(tokens, tx, ty) {
  for (const [id, tok] of Object.entries(tokens)) {
    const s = tok.size || 1;
    if (tx >= tok.x && tx < tok.x + s && ty >= tok.y && ty < tok.y + s) return id;
  }
  return null;
}

// RTDB helpers
export async function saveToken(mapName, id, data) {
  await set(ref(db, `maps/${mapName}/tokens/${id}`), data);
}

export async function deleteToken(mapName, id, tokens) {
  await remove(ref(db, `maps/${mapName}/tokens/${id}`));
  delete tokens[id];
}

export async function applyCondition(mapName, tokId, condition, tokens) {
  if (condition === "clear") {
    await update(ref(db, `maps/${mapName}/tokens/${tokId}`), { conditions: [] });
  } else {
    const tok   = tokens[tokId];
    const conds = tok?.conditions || [];
    const next  = conds.includes(condition) ? conds.filter(c => c !== condition) : [...conds, condition];
    await update(ref(db, `maps/${mapName}/tokens/${tokId}`), { conditions: next });
  }
}
