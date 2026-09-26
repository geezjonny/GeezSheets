// Map — RTDB save helpers for tiles, stamps, props, impassable cells, and
// token position updates. Used by both mapeditor.html and index.html.
//
// Elevation persistence lives in elevation.js, not here -- see that file's
// header for why (a save/load split across two files caused a real bug).
//
// Removed 2026: saveWallGroups, saveDoors, savePortals, saveTraps,
// resolvePortal, clearMapSection, subscribeMap, findDoorAtPoint, tileInFog
// -- all confirmed zero references anywhere in the project (a project-wide
// audit found no HTML file importing or calling any of them). These were
// leftovers from before the current geometry.{walls,doors,lights} schema
// existed; mapeditor.html/index.html now read/write map data through their
// own inline Firebase calls and geometry.js instead of this file's older
// subscribeMap/clearMapSection pattern.

import { db } from "./firebase.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

export async function saveTiles(mapName, tiles) {
  await set(ref(db, `maps/${mapName}/tiles`), Object.keys(tiles).length ? tiles : null);
}

export async function saveStamp(mapName, key, emoji) {
  if (emoji) {
    await set(ref(db, `maps/${mapName}/stamps/${key.replace(",","_")}`), emoji);
  } else {
    await set(ref(db, `maps/${mapName}/stamps/${key.replace(",","_")}`), null);
  }
}

export async function savePropsLocal(mapName, props) {
  await set(ref(db, `maps/${mapName}/props`), Object.keys(props).length ? props : null);
}

export async function saveImpassable(mapName, impassable) {
  await set(ref(db, `maps/${mapName}/impassable`), Object.keys(impassable).length ? impassable : null);
}

export async function saveTokenLocal(mapName, id, data) {
  await set(ref(db, `maps/${mapName}/tokens/${id}`), data);
}
