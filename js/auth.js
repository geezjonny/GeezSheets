// Player login — name + session passphrase + character selection
// GM sets passphrase via admin (session/passphrase)
// Players authenticate once, locking their playerName to a character

import { db } from "./firebase.js";
import { ref, get, onValue } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

let cachedPassphrase = null;

export function subscribePassphrase() {
  onValue(ref(db, "session/passphrase"), snap => {
    cachedPassphrase = snap.val() || null;
  });
}

// Returns true if no passphrase is set (open session) or it matches
export function checkPassphrase(entered) {
  if (!cachedPassphrase) return true; // GM hasn't set one — allow all
  return entered === cachedPassphrase;
}

export function hasPassphraseSet() {
  return !!cachedPassphrase;
}

// Fetch the campaign's PC roster for the character picker
export async function fetchCharacterRoster() {
  const snap = await get(ref(db, "characters/pcs"));
  if (!snap.exists()) return [];
  const data = snap.val();
  return Object.entries(data).map(([id, c]) => ({
    id,
    name: c.name || c.charName || id,
  }));
}

// Local session info — stored so refresh doesn't force re-login
const STORAGE_KEY = "vtt_auth";

export function saveAuthSession(playerName, characterId, characterName) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ playerName, characterId, characterName, t: Date.now() }));
}

export function loadAuthSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function clearAuthSession() {
  localStorage.removeItem(STORAGE_KEY);
}
