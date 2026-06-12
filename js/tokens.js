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

  // Condition rings
  const conds = tok.conditions || [];
  conds.forEach((c, i) => {
    ctx.beginPath(); ctx.arc(cx, cy, r + 4 * s + i * 4 * s, 0, Math.PI * 2);
    ctx.strokeStyle = CONDITIONS[c] || "#fff"; ctx.lineWidth = 2.5 / zoom; ctx.stroke();
  });

  // Portrait or initial
  if (img) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, px, py, sw, sh); ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = tok.type === "pc" ? "#7ab0e0" : "#e07070"; ctx.lineWidth = 2 / zoom; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = tok.type === "pc" ? "#3a6aaa" : "#8a2a2a"; ctx.fill();
    ctx.strokeStyle = tok.type === "pc" ? "#7ab0e0" : "#e07070"; ctx.lineWidth = 2 / zoom; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.round(14 * s / zoom)}px Cinzel,serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText((tok.name || "?")[0].toUpperCase(), cx, cy);
  }

  // Name label with dark background
  ctx.font = `${Math.round(9 / zoom)}px Cinzel,serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  const nameLabel = tok.name || "";
  const nameW = ctx.measureText(nameLabel).width;
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(cx - nameW / 2 - 3 / zoom, py + sh + 2 / zoom, nameW + 6 / zoom, 10 / zoom);
  ctx.fillStyle = "#fff"; ctx.fillText(nameLabel, cx, py + sh + 2 / zoom);

  // HP bar — use live pcsData for PCs
  let liveHp = tok.hp, liveMaxHp = tok.maxHp;
  if (tok.type === "pc" && pcsData[tok.characterId]) {
    const c = pcsData[tok.characterId];
    liveHp    = c.hp ?? c.combat?.hp_current ?? tok.hp;
    liveMaxHp = c.maxHp ?? c.combat?.hp_max  ?? tok.maxHp;
  }
  const bw  = sw * 0.85, bh = 5 / zoom;
  const bx  = px + (sw - bw) / 2, by = py + sh + 12 / zoom;
  const pct = Math.max(0, Math.min(1, (liveHp ?? liveMaxHp) / (liveMaxHp || 1)));
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
