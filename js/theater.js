// theater.js — Theater of Mind mode: a full-screen drifting fog overlay that
// hides the tactical layer (map, tokens, grid, initiative) so players'
// screens stop reading as "game board" during narrative/roleplay scenes.
// DM toggles it from mapeditor.html; it's rendered on players' screens in
// index.html. Deliberately separate from the fog-of-war reveal system
// (js/fog.js) -- same word, unrelated feature.

import { db } from "./firebase.js";
import { ref, set, onValue } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

/** Sets the shared theater-of-mind flag for the whole session. */
export async function setTheaterMode(active) {
  await set(ref(db, "session/theaterMode"), active || null);
}

/** Subscribes to the shared flag; callback(active:boolean) fires on every change. */
export function subscribeTheaterMode(callback) {
  return onValue(ref(db, "session/theaterMode"), snap => callback(!!snap.val()));
}

// ── Fog animation ────────────────────────────────────────────────────────────

let _ctx = null, _canvas = null, _raf = null, _blobs = [], _running = false;

function resize() {
  if (!_canvas) return;
  _canvas.width = _canvas.clientWidth;
  _canvas.height = _canvas.clientHeight;
}

function makeBlobs(n) {
  const blobs = [];
  for (let i = 0; i < n; i++) {
    blobs.push({
      x: Math.random(),
      y: Math.random(),
      r: 0.25 + Math.random() * 0.35,   // radius as a fraction of canvas width
      vx: (Math.random() - 0.5) * 0.006,
      vy: (Math.random() - 0.5) * 0.004,
      a: 0.10 + Math.random() * 0.12,
    });
  }
  return blobs;
}

function tick() {
  if (!_running || !_ctx || !_canvas) return;
  const W = _canvas.width, H = _canvas.height;
  _ctx.clearRect(0, 0, W, H);
  _ctx.fillStyle = "#0d0b08";
  _ctx.fillRect(0, 0, W, H);
  for (const b of _blobs) {
    b.x += b.vx; b.y += b.vy;
    if (b.x < -0.3) b.x = 1.3; if (b.x > 1.3) b.x = -0.3;
    if (b.y < -0.3) b.y = 1.3; if (b.y > 1.3) b.y = -0.3;
    const cx = b.x * W, cy = b.y * H, r = b.r * W;
    const grad = _ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `rgba(60,55,70,${b.a})`);
    grad.addColorStop(1, "rgba(60,55,70,0)");
    _ctx.fillStyle = grad;
    _ctx.beginPath(); _ctx.arc(cx, cy, r, 0, Math.PI * 2); _ctx.fill();
  }
  _raf = requestAnimationFrame(tick);
}

/** Starts the fog animation on the given canvas element (should already be
 *  sized/positioned via CSS to cover the area you want obscured). */
export function startTheaterFog(canvasEl) {
  _canvas = canvasEl;
  _ctx = canvasEl.getContext("2d");
  _blobs = makeBlobs(7);
  resize();
  if (!_canvas._tomResizeBound) {
    window.addEventListener("resize", resize);
    _canvas._tomResizeBound = true;
  }
  _running = true;
  tick();
}

/** Stops the animation loop (call when hiding the overlay, to save CPU). */
export function stopTheaterFog() {
  _running = false;
  if (_raf) cancelAnimationFrame(_raf);
  _raf = null;
}
