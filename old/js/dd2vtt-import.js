// dd2vtt Import -- file reading/parsing and the image utilities that go
// with it. Extracted from mapeditor-layers.html, which had this exact
// read-file -> JSON.parse -> parseDD2VTT sequence duplicated across its
// two import handlers (full-replace and add-section). No canvas drawing,
// no Firebase writes -- purely getting from "a File the user picked" to
// "usable map data" and back down to an image small enough for Firebase
// RTDB. A caller decides what to do with the result (merge into
// geometry, add a draggable pending-import layer, save to Firebase,
// etc.).

import { parseDD2VTT } from "./geometry.js";

/**
 * Reads and parses one dd2vtt/uvtt File into map data. Imported portals
 * keep their raw open/closed state from the file -- NO automatic
 * window/door guessing (see below for why this was removed).
 * Throws (with the original error) on invalid JSON or anything
 * parseDD2VTT itself rejects -- callers should wrap this in try/catch per
 * file, same as mapeditor-layers.html's own handlers did, so one bad file
 * in a multi-file batch doesn't abort the rest.
 *
 * This used to also call geometry.js's tagWindowsFromMixedDoors, which
 * guessed that any "open" (closed:false) portal was actually a window
 * whenever a map ALSO had at least one genuinely closed door -- because
 * dd2vtt has no native window concept, and Dungeondraft sometimes
 * represents a window as an open portal specifically to distinguish it
 * from a solid wall segment. That heuristic is confirmed unreliable: a
 * maze-style map with many legitimate open archways (not windows at all)
 * that happens to also have a few real closed doors elsewhere triggered
 * it wrongly on more than half its portals (44 of 84 in one real test
 * case). There's no signal in the dd2vtt format itself that reliably
 * tells "open archway" apart from "window", so guessing wrong is not a
 * rare edge case for this heuristic, it's a routine one. Better to import
 * everything as a plain door (matching the file's own open/closed state
 * exactly) and let the GM mark specific ones as windows by hand
 * afterward, than to silently mis-tag dozens of doors on import with no
 * easy bulk undo.
 * @param {File} file
 * @returns {Promise<{parsed: Object, windowCount: number}>}
 */
export async function parseDD2VTTFile(file) {
  const json = JSON.parse(await file.text());
  const parsed = parseDD2VTT(json);
  return { parsed, windowCount: 0 }; // windowCount kept in the return shape for callers that still read it (just a toast message) -- always 0 now that nothing is auto-tagged
}

/**
 * Loads an image from a URL/data-URL and resolves once it's ready to draw
 * (or draw FROM, e.g. into a canvas for re-encoding). Rejects on load
 * error. Small helper -- exists because this exact
 * `new Promise((res,rej)=>{img.onload=...})` pattern showed up three
 * separate times in mapeditor-layers.html's import code.
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Firebase RTDB rejects any single value over 10MB. A large dd2vtt export
 * (a 100x100 grid map at typical pixels-per-grid settings can easily be
 * 7000x7000+ pixels) routinely exceeds that as a base64 PNG. This
 * progressively downscales and re-encodes as JPEG (which compresses
 * battlemap art far better than lossless PNG) until the result comfortably
 * fits, leaving real margin below the hard limit rather than cutting it
 * close. Returns the original data URL unchanged if it's already small
 * enough -- this never touches an image that doesn't need it.
 * @param {HTMLImageElement} img
 * @param {string} dataUrl
 * @param {number} [maxBytes]
 * @returns {Promise<string>}
 */
export async function shrinkImageToFitFirebase(img, dataUrl, maxBytes = 9 * 1024 * 1024) {
  if (dataUrl.length <= maxBytes) return dataUrl;
  const off = document.createElement("canvas");
  const octx = off.getContext("2d");
  let scale = 1;
  for (let attempt = 0; attempt < 8; attempt++) {
    scale *= 0.75;
    off.width = Math.max(1, Math.round(img.width * scale));
    off.height = Math.max(1, Math.round(img.height * scale));
    octx.clearRect(0, 0, off.width, off.height);
    octx.drawImage(img, 0, 0, off.width, off.height);
    const jpegUrl = off.toDataURL("image/jpeg", 0.85);
    if (jpegUrl.length <= maxBytes) return jpegUrl;
  }
  // Still too big after 8 halving-ish passes (roughly a 10x linear
  // reduction) -- something unusual is going on. Return the smallest
  // attempt rather than the original; the caller's own save will still
  // fail loudly if this genuinely isn't small enough, rather than silently
  // pretending success.
  return off.toDataURL("image/jpeg", 0.7);
}
