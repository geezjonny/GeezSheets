// Sound FX -- the GM triggers a short sound clip and everyone connected
// hears it. Same proven shape as pings.js's own sendPing: push a
// short-lived RTDB entry, auto-remove it after a timeout so the list
// doesn't grow unbounded, and every listening client plays it once,
// locally, the moment it arrives.
//
// This is deliberately fire-and-forget, not synced background music --
// no current-track/playback-position state to keep new joiners caught up
// on, since these are one-shot clips (a door creak, a roar, a sting), not
// a continuous loop. If looping background music is ever wanted, that's
// a different, bigger feature (needs a "what's playing + where in it"
// state a late joiner can sync into), not an extension of this file.

import { db } from "./firebase.js";
import { ref, push, set, remove, onChildAdded } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

/**
 * Broadcasts a sound-fx trigger to everyone connected. `filename` should
 * match a file actually present in /sounds (see config/soundfx.json for
 * the GM-maintained list of what's available).
 * @param {string} filename
 */
export async function playSoundFx(filename) {
  const soundRef = push(ref(db, "soundfx"));
  await set(soundRef, { file: filename, t: Date.now() });
  // Generous headroom for a longer clip to actually finish playing
  // somewhere before this RTDB entry gets cleaned up -- this timeout only
  // controls when the broadcast record itself gets removed, not playback,
  // which already started locally in every listening browser by then.
  setTimeout(() => remove(soundRef), 15000);
}

/**
 * Subscribes to sound-fx broadcasts and calls onPlay(filename) once for
 * each NEW one, in whatever browser calls this (both mapeditor.html and
 * index.html can subscribe, so the GM hears their own triggered sounds
 * too, not just players). Skips anything already sitting in the list at
 * subscribe time -- onChildAdded's own documented behavior fires once for
 * every existing child immediately on subscribe, which would otherwise
 * replay stale, not-yet-cleaned-up entries to a client that just joined.
 * @param {(filename: string) => void} onPlay
 * @returns {() => void} unsubscribe function
 */
export function subscribeSoundFx(onPlay) {
  const startTime = Date.now();
  return onChildAdded(ref(db, "soundfx"), snap => {
    const data = snap.val();
    if (!data || data.t < startTime) return; // pre-existing entry from before this client connected
    onPlay(data.file);
  });
}
