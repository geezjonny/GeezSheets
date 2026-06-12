// Asset loading — terrain textures, token portraits, prop images
// Tries file path first, falls back to RTDB base64

import { db } from "./firebase.js";
import { get, ref } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { TEXTURE_PATH, TOKEN_PATH, PROP_PATH } from "./config.js";

export const textures      = {}; // terrain id → HTMLImageElement
export const tokenTextures = {}; // characterId → HTMLImageElement | null
export const propTextures  = {}; // propId → HTMLImageElement | null

export async function loadTerrainTextures(terrains) {
  await Promise.all(terrains.map(t => new Promise(resolve => {
    const img = new Image();
    img.onload  = () => { textures[t.id] = img; resolve(); };
    img.onerror = () => resolve();
    img.src = `${TEXTURE_PATH}${t.id}.png`;
  })));
}

export function tryLoadTokenTexture(characterId, name) {
  if (tokenTextures[characterId] !== undefined) return;
  tokenTextures[characterId] = null;
  const img = new Image();
  const fname = (name || characterId).toLowerCase().replace(/\s+/g, "_");
  img.onload  = () => { tokenTextures[characterId] = img; };
  img.onerror = () => {
    get(ref(db, `assets/uploads/tokens/${characterId}`)).then(snap => {
      const b64 = snap.val();
      if (b64) { const i = new Image(); i.onload = () => { tokenTextures[characterId] = i; }; i.src = b64; }
    });
  };
  img.src = `${TOKEN_PATH}${fname}.png`;
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
  img.src = `${PROP_PATH}${id}.png`;
}
