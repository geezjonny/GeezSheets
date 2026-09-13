// dd2vtt Import -- file reading/parsing and the image utilities that go
// with it. Extracted from mapeditor-layers.html, which had this exact
// read-file -> JSON.parse -> parseDD2VTT -> tagWindowsFromMixedDoors
// sequence duplicated across its two import handlers (full-replace and
// add-section). No canvas drawing, no Firebase writes -- purely getting
// from "a File the user picked" to "usable, window-tagged map data" and
// back down to an image small enough for Firebase RTDB. A caller decides
// what to do with the result (merge into geometry, add a draggable
// pending-import layer, save to Firebase, etc.).

import { parseDD2VTT, tagWindowsFromMixedDoors } from "./geometry.js";

/**
 * Reads and parses one dd2vtt/uvtt File into map data, tagging any
 * window/door ambiguity along the way (see tagWindowsFromMixedDoors in
 * geometry.js). Throws (with the original error) on invalid JSON or
 * anything parseDD2VTT itself rejects -- callers should wrap this in
 * try/catch per file, same as mapeditor-layers.html's own handlers did,
 * so one bad file in a multi-file batch doesn't abort the rest.
 * @param {File} file
 * @returns {Promise<{parsed: Object, windowCount: number}>}
 */
export async function parseDD2VTTFile(file) {
  const json = JSON.parse(await file.text());
  const parsed = parseDD2VTT(json);
  const { windowCount } = tagWindowsFromMixedDoors(parsed.doors);
  return { parsed, windowCount };
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
