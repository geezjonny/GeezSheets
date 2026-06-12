// Ruler — measure distance between two screen points

import { TILE, FEET_PER_TILE } from "./config.js";

export function drawRuler(ctx, startPos, endPos, toWorld) {
  if (!startPos || !endPos) return;
  const [sx, sy] = startPos;
  const [ex, ey] = endPos;
  const [wx,  wy]  = toWorld(sx, sy);
  const [wx2, wy2] = toWorld(ex, ey);
  const dtiles = Math.sqrt((wx2 / TILE - wx / TILE) ** 2 + (wy2 / TILE - wy / TILE) ** 2);
  const dfeet  = Math.round(dtiles * FEET_PER_TILE);

  ctx.save();
  ctx.strokeStyle = "rgba(200,168,75,0.9)"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "rgba(200,168,75,1)";
  ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill();

  const label = `${Math.round(dtiles * 10) / 10} tiles · ${dfeet}ft`;
  const mx = (sx + ex) / 2, my = (sy + ey) / 2;
  ctx.font = "bold 12px Cinzel,serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(13,11,8,0.75)"; ctx.fillRect(mx - tw / 2 - 4, my - 9, tw + 8, 18);
  ctx.fillStyle = "#c8a84b"; ctx.fillText(label, mx, my);
  ctx.restore();
}
