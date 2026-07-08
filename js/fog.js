// Fog — draw, save, delete groups
// Fog state lives in RTDB maps/<name>/fog/
// Each group has: { cells: {key: true}, type: "fog"|"darkness"|"magical" }

import { db, ref, remove, set } from "./firebase.js";
const TILE = 32;


// Colors per type per mode
const FOG_COLORS = {
  fog:      { gm: "rgba(10,20,40,0.55)",   player: "rgba(0,0,0,1)"            },
  darkness: { gm: "rgba(10,5,20,0.72)",    player: "rgba(0,0,0,1)"            },
  magical:  { gm: "rgba(60,10,80,0.65)",   player: "rgba(20,0,30,1)"          },
};

export function drawFog(ctx, fogGroups, zoom, gmMode = false) {
  // Draw each group with its type-appropriate color
  for (const gid in fogGroups) {
    const group = fogGroups[gid];
    const cells = group.cells || {};
    const type  = group.type || "fog";
    const colors = FOG_COLORS[type] || FOG_COLORS.fog;
    ctx.fillStyle = gmMode ? colors.gm : colors.player;
    for (const k in cells) {
      const [x, y] = k.split(",").map(Number);
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
  }

  // GM mode: show × delete buttons per group, colored by type
  if (gmMode) {
    ctx.save();
    ctx.font = `bold 11px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const gid in fogGroups) {
      const group  = fogGroups[gid];
      const cells  = group.cells || {};
      const type   = group.type || "fog";
      const coords = Object.keys(cells).map(k => k.split(",").map(Number));
      if (!coords.length) continue;
      const maxX = Math.max(...coords.map(([x]) => x));
      const minY = Math.min(...coords.map(([, y]) => y));
      const bx = (maxX + 1) * TILE - 14 / zoom, by = minY * TILE, bs = 14 / zoom;
      const btnColor = type === "magical" ? "rgba(120,20,160,0.92)" : type === "darkness" ? "rgba(20,10,40,0.92)" : "rgba(200,50,50,0.92)";
      ctx.fillStyle = btnColor; ctx.fillRect(bx, by, bs, bs);
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
