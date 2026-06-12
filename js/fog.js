// Fog — draw, save, delete groups
// Fog state lives in RTDB maps/<name>/fog/

import { db } from "./firebase.js";
import { ref, set, remove } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { TILE } from "./config.js";

export function drawFog(ctx, fogGroups, zoom, gmMode = false) {
  ctx.fillStyle = gmMode ? "rgba(10,20,40,0.6)" : "rgba(0,0,0,1)";
  for (const gid in fogGroups) {
    const cells = fogGroups[gid].cells || {};
    for (const k in cells) {
      const [x, y] = k.split(",").map(Number);
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
  }
  // GM mode: show X delete buttons per fog group
  if (gmMode) {
    ctx.save();
    ctx.font = `bold 11px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const gid in fogGroups) {
      const cells  = fogGroups[gid].cells || {};
      const coords = Object.keys(cells).map(k => k.split(",").map(Number));
      if (!coords.length) continue;
      const maxX = Math.max(...coords.map(([x]) => x));
      const minY = Math.min(...coords.map(([, y]) => y));
      const bx = (maxX + 1) * TILE - 14 / zoom, by = minY * TILE, bs = 14 / zoom;
      ctx.fillStyle = "rgba(200,50,50,0.92)"; ctx.fillRect(bx, by, bs, bs);
      ctx.fillStyle = "#fff"; ctx.fillText("×", bx + bs / 2, by + bs / 2);
    }
    ctx.restore();
  }
}

export function fogGroupXHit(fogGroups, wx, wy, zoom) {
  for (const gid in fogGroups) {
    const cells  = fogGroups[gid].cells || {};
    const coords = Object.keys(cells).map(k => k.split(",").map(Number));
    if (!coords.length) continue;
    const maxX = Math.max(...coords.map(([x]) => x));
    const minY = Math.min(...coords.map(([, y]) => y));
    const bx = (maxX + 1) * TILE - 14 / zoom, by = minY * TILE, bs = 14 / zoom;
    if (wx >= bx && wx <= bx + bs && wy >= by && wy <= by + bs) return gid;
  }
  return null;
}

export function fogGroupAtTile(fogGroups, tx, ty) {
  const k = `${tx},${ty}`;
  for (const gid in fogGroups) {
    if (fogGroups[gid].cells && fogGroups[gid].cells[k]) return gid;
  }
  return null;
}

export async function saveFog(mapName, fogGroups) {
  await set(ref(db, `maps/${mapName}/fog`), Object.keys(fogGroups).length ? fogGroups : null);
}

export async function deleteFogGroup(mapName, id, fogGroups) {
  await remove(ref(db, `maps/${mapName}/fog/${id}`));
  delete fogGroups[id];
}
