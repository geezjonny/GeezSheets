// Fog — draw, save, delete groups
// Fog state lives in RTDB maps/<name>/fog/
// Each group has: { cells: {key: true}, type: "fog"|"darkness"|"magical" }

import { db } from "./firebase.js";
import { ref, set, remove } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { TILE } from "./config.js";

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
