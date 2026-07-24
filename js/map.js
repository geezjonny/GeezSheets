// Map — RTDB subscription and save helpers
// Manages the live map data: tiles, fog, wallGroups, doors, tokens, stamps, props, chains
// Used by both mapeditor.html and index.html

import { db } from "./firebase.js";
import { ref, set, update, onValue } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { tryLoadTokenTexture, tryLoadPropTexture } from "./assets.js";

// ── Save helpers ──────────────────────────────────────────────────────────────

export async function saveTiles(mapName, tiles) {
  await set(ref(db, `maps/${mapName}/tiles`), Object.keys(tiles).length ? tiles : null);
}

export async function saveWallGroups(mapName, wallGroups) {
  await set(ref(db, `maps/${mapName}/wallGroups`), Object.keys(wallGroups).length ? wallGroups : null);
}

export async function saveDoors(mapName, doors) {
  await set(ref(db, `maps/${mapName}/doors`), Object.keys(doors).length ? doors : null);
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

export async function savePortals(mapName, portals) {
  await set(ref(db, `maps/${mapName}/portals`), Object.keys(portals).length ? portals : null);
}

export async function saveImpassable(mapName, impassable) {
  await set(ref(db, `maps/${mapName}/impassable`), Object.keys(impassable).length ? impassable : null);
}

export async function saveTraps(mapName, traps) {
  await set(ref(db, `maps/${mapName}/traps`), Object.keys(traps).length ? traps : null);
}

/** If (tx,ty) is a portal cell, returns the {x,y} of the other cell sharing
 *  its link value (first match), or null if it's not a portal or has no
 *  linked partner yet. Shared by both the DM editor and the player view so
 *  a token "hits" the same warp logic whoever's dragging it. */
export function resolvePortal(portals, tx, ty) {
  const here = portals[`${tx},${ty}`];
  if (!here || !here.link) return null;
  for (const [k, o] of Object.entries(portals)) {
    if (k === `${tx},${ty}`) continue;
    if (o.link === here.link) {
      const [dx, dy] = k.split(",").map(Number);
      return { x: dx, y: dy };
    }
  }
  return null;
}

export async function saveTokenLocal(mapName, id, data) {
  await set(ref(db, `maps/${mapName}/tokens/${id}`), data);
}

// ── Clear helpers ─────────────────────────────────────────────────────────────

export async function clearMapSection(mapName, section, state) {
  const {tiles, fogGroups, wallGroups, doors, tokens, stamps, props, portals} = state;

  if (section==="bg"||section==="all")    { await set(ref(db,`maps/${mapName}/background`),null); await set(ref(db,`maps/${mapName}/backgroundPpi`),null); }
  if (section==="tiles"||section==="all") { for(const k in tiles)delete tiles[k]; await set(ref(db,`maps/${mapName}/tiles`),null); }
  if (section==="fog"||section==="all")   { for(const k in fogGroups)delete fogGroups[k]; await set(ref(db,`maps/${mapName}/fog`),null); if(section==="all")await set(ref(db,`maps/${mapName}/darknessGroups`),null); }
  if (section==="walls"||section==="all") { for(const k in wallGroups)delete wallGroups[k]; await set(ref(db,`maps/${mapName}/wallGroups`),null); }
  if (section==="doors"||section==="all") { for(const k in doors)delete doors[k]; await set(ref(db,`maps/${mapName}/doors`),null); }
  if (section==="tokens"||section==="all"){ for(const k in tokens)delete tokens[k]; await set(ref(db,`maps/${mapName}/tokens`),null); }
  if (section==="stamps"||section==="all"){ for(const k in stamps)delete stamps[k]; await set(ref(db,`maps/${mapName}/stamps`),null); }
  if (section==="props"||section==="all") { for(const k in props)delete props[k]; await set(ref(db,`maps/${mapName}/props`),null); }
  if (section==="portals"||section==="all") { if(portals)for(const k in portals)delete portals[k]; await set(ref(db,`maps/${mapName}/portals`),null); }
}

// ── Subscribe ─────────────────────────────────────────────────────────────────

/**
 * Subscribe to a map in RTDB and populate the provided state object.
 *
 * state shape:
 *   { tiles, fogGroups, wallGroups, doors, tokens, stamps, props, chains, roofs }
 *   Plus optional scalar refs: bgImage (object with .src), bgUrl, bgPpi, nightMode
 *
 * callbacks:
 *   onFirstLoad()  — called once after data arrives and camera is set
 *   onUpdate()     — called on every subsequent update
 *   onBgChange(url, ppi, nightMode) — called when background image data changes
 *
 * Returns an unsubscribe function.
 */
export function subscribeMap(mapName, state, callbacks = {}) {
  const { onFirstLoad, onUpdate, onBgChange } = callbacks;
  let firstLoad = true;

  const unsub = onValue(ref(db, `maps/${mapName}`), snap => {
    const data = snap.val();

    // Clear all state
    for (const k in state.tiles)      delete state.tiles[k];
    for (const k in state.fogGroups)  delete state.fogGroups[k];
    for (const k in state.wallGroups) delete state.wallGroups[k];
    for (const k in state.doors)      delete state.doors[k];
    for (const k in state.tokens)     delete state.tokens[k];
    for (const k in state.stamps)     delete state.stamps[k];
    for (const k in state.props)      delete state.props[k];
    if (state.portals) for (const k in state.portals) delete state.portals[k];
    if (state.chains) for (const k in state.chains) delete state.chains[k];
    if (state.roofs)  for (const k in state.roofs)  delete state.roofs[k];

    if (data) {
      if (data.tiles)      Object.assign(state.tiles, data.tiles);
      if (data.fog)        Object.assign(state.fogGroups, data.fog);
      if (data.wallGroups) Object.assign(state.wallGroups, data.wallGroups);
      if (data.doors)      Object.assign(state.doors, data.doors);
      if (data.stamps) {
        for (const [k,v] of Object.entries(data.stamps)) {
          state.stamps[k.replace("_",",")] = v;
        }
      }
      if (data.tokens) {
        Object.assign(state.tokens, data.tokens);
        Object.values(data.tokens).forEach(t => tryLoadTokenTexture(t.characterId, t.lookupName || t.name));
      }
      if (data.props) {
        Object.assign(state.props, data.props);
        for (const p of Object.values(data.props)) tryLoadPropTexture(p.propId);
      }
      if (data.portals && state.portals) Object.assign(state.portals, data.portals);
      if (data.chains && state.chains) Object.assign(state.chains, data.chains);
      if (data.roofs  && state.roofs)  Object.assign(state.roofs,  data.roofs);

      // Background
      const newUrl = data.background || "";
      const newPpi = data.backgroundPpi || 70;
      const newNight = !!data.nightMode;
      if (onBgChange && (newUrl !== (state._bgUrl||"") || newPpi !== (state._bgPpi||70) || newNight !== (state._nightMode||false))) {
        state._bgUrl    = newUrl;
        state._bgPpi    = newPpi;
        state._nightMode = newNight;
        onBgChange(newUrl, newPpi, newNight);
      }
    }

    if (firstLoad) {
      firstLoad = false;
      onFirstLoad?.();
    } else {
      onUpdate?.();
    }
  });

  return unsub;
}

// ── Door helpers ──────────────────────────────────────────────────────────────

export function findDoorAtPoint(doors, wx, wy, TILE) {
  for (const did in doors) {
    const d = doors[did];
    const px = d.x * TILE, py = d.y * TILE;
    const edgeMid = {
      n: [px+TILE/2, py],
      s: [px+TILE/2, py+TILE],
      w: [px,        py+TILE/2],
      e: [px+TILE,   py+TILE/2],
    };
    const [mx, my] = edgeMid[d.edge] || edgeMid.n;
    if (Math.hypot(wx-mx, wy-my) < TILE * 0.6) return did;
  }
  return null;
}

// ── Fog tile check ────────────────────────────────────────────────────────────

export function tileInFog(fogGroups, tx, ty) {
  const k = `${tx},${ty}`;
  for (const gid in fogGroups) {
    if (fogGroups[gid]?.cells?.[k]) return true;
  }
  return false;
}
