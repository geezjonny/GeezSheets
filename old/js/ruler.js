// Ruler — measure distance between two points
// Snaps start point to nearest token center if close enough
// Stays visible until the user clicks elsewhere (no auto-clear)

import { TILE, FEET_PER_TILE } from "./config.js";

const SNAP_RADIUS = 24; // world px — how close to a token center counts as a snap

// Find nearest token center to a world point, within SNAP_RADIUS
export function findSnapPoint(tokens, wx, wy) {
  let best = null, bestDist = SNAP_RADIUS;
  for (const tok of Object.values(tokens)) {
    const s = tok.size || 1;
    const cx = tok.x * TILE + (s * TILE) / 2;
    const cy = tok.y * TILE + (s * TILE) / 2;
    const d = Math.hypot(wx - cx, wy - cy);
    if (d < bestDist) { bestDist = d; best = [cx, cy]; }
  }
  return best; // null if nothing close enough
}

export function drawRuler(ctx, startWorld, endWorld, toScreen) {
  if (!startWorld || !endWorld) return;
  const [wx, wy]   = startWorld;
  const [wx2, wy2] = endWorld;
  const [sx, sy]   = toScreen(wx, wy);
  const [ex, ey]   = toScreen(wx2, wy2);

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
