// Asset loading — terrain textures, token portraits, prop images
// Tries file path first, falls back to RTDB base64

import { db } from "./firebase.js";
import { get, ref } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { TEXTURE_PATH, TOKEN_PATH, PROP_PATH } from "./config.js";

// Cache-busting: one value per page load, appended to every asset URL below.
// Without this, browsers can keep serving an old cached copy of a texture
// even after you've replaced the file on the server and reloaded the page --
// the URL has to actually change for the browser to treat it as new.
const _cacheBust = Date.now();

export const textures      = {}; // terrain id → HTMLImageElement
export const tokenTextures = {}; // cacheKey → HTMLImageElement | null
export const propTextures  = {}; // propId → HTMLImageElement | null

// Generic/blank NPCs all share characterId "__npc__" — cache by lookup name instead
// so different NPCs (e.g. "goblin" vs "skeleton") don't collide on one shared texture.
export function tokenCacheKey(characterId, lookupName) {
  return characterId === "__npc__" && lookupName ? `__npc__:${lookupName.toLowerCase()}` : characterId;
}

export async function loadTerrainTextures(terrains) {
  await Promise.all(terrains.map(t => new Promise(resolve => {
    const img = new Image();
    img.onload  = () => { textures[t.id] = img; resolve(); };
    img.onerror = () => resolve();
    img.src = `${TEXTURE_PATH}${t.id}.png?v=${_cacheBust}`;
  })));
}

export function tryLoadTokenTexture(characterId, name) {
  if (!name && !characterId) return; // nothing meaningful to look up -- avoid throwing inside a live subscription callback
  const cacheKey = tokenCacheKey(characterId, name);
  if (tokenTextures[cacheKey] !== undefined) return;
  tokenTextures[cacheKey] = null;
  const img = new Image();
  const fname = (name || characterId).toLowerCase().replace(/\s+/g, "_");
  img.onload  = () => { tokenTextures[cacheKey] = img; };
  img.onerror = () => {
    get(ref(db, `assets/uploads/tokens/${cacheKey}`)).then(snap => {
      const b64 = snap.val();
      if (b64) { const i = new Image(); i.onload = () => { tokenTextures[cacheKey] = i; }; i.src = b64; }
    });
  };
  img.src = `${TOKEN_PATH}${fname}.png?v=${_cacheBust}`;
}

export function tryLoadPropTexture(id) {
  if (propTextures[id] !== undefined) return;
  propTextures[id] = null;
  const img = new Image();
  img.onload  = () => { propTextures[id] = img; };
  img.onerror = () => {
    get(ref(db, `assets/uploads/props/${id}`)).then(snap => {
      const b64 = snap.val();
      if (b64) { const i = new Image(); i.onload = () => { propTextures[i] = i; }; i.src = b64; }
    });
  };
  img.src = `${PROP_PATH}${id}.png?v=${_cacheBust}`;
}
