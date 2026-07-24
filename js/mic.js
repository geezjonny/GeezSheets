// Mic activity detection — talking indicator
// Listens to the player's own mic, writes talking state to RTDB
// All clients read other players' talking state and shake their tokens

import { db } from "./firebase.js";
import { ref, set, onValue } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

let audioCtx = null;
let analyser = null;
let micStream = null;
let rafId = null;
let lastState = false;
let lastWriteTime = 0;

const THRESHOLD = 18;       // volume level (0-255) above which we consider "talking"
const WRITE_THROTTLE = 200; // ms between RTDB writes to avoid spamming

export const talkingPlayers = {}; // playerName -> true/false, populated by subscribeTalking

// Start listening to the local mic and reporting talking state to RTDB
export async function startMicListener(playerName) {
  if (audioCtx) return; // already running
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.warn("Mic access denied or unavailable:", err.message);
    return false;
  }

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(micStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);
  const safeKey = playerName.replace(/\./g, "_");
  let _lastDebugLog = 0;

  function tick() {
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length;
    const isTalking = avg > THRESHOLD;

    // TEMP DEBUG — remove once shake is confirmed working again
    const now2 = Date.now();
    if (now2 - _lastDebugLog > 500) {
      _lastDebugLog = now2;
      console.log(`[mic debug] avg=${avg.toFixed(1)} threshold=${THRESHOLD} isTalking=${isTalking} writeKey=cursors/${safeKey}/talking`);
    }

    const now = Date.now();
    if (isTalking !== lastState && now - lastWriteTime > WRITE_THROTTLE) {
      lastState = isTalking;
      lastWriteTime = now;
      set(ref(db, `cursors/${safeKey}/talking`), isTalking);
      console.log(`[mic debug] WROTE talking=${isTalking} to cursors/${safeKey}/talking`);
    }
    rafId = requestAnimationFrame(tick);
  }
  tick();
  return true;
}

export function stopMicListener(playerName) {
  if (rafId) cancelAnimationFrame(rafId);
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  if (audioCtx) audioCtx.close();
  audioCtx = null; analyser = null; micStream = null; rafId = null;
  if (playerName) {
    const safeKey = playerName.replace(/\./g, "_");
    set(ref(db, `cursors/${safeKey}/talking`), false);
  }
}

// Subscribe to all players' talking state (for rendering shake on their tokens)
export function subscribeTalking() {
  onValue(ref(db, "cursors"), snap => {
    const data = snap.val() || {};
    for (const k in talkingPlayers) delete talkingPlayers[k];
    for (const [name, info] of Object.entries(data)) {
      if (info && info.talking) talkingPlayers[name.replace(/_/g, " ").toLowerCase()] = true;
    }
    // TEMP DEBUG — remove once shake is confirmed working again
    console.log("[mic debug] talkingPlayers now:", Object.keys(talkingPlayers));
  });
}

// Returns a small shake offset {dx, dy} if this token's owner is talking, else {dx:0,dy:0}
let _lastShakeDebug = 0;
export function getShakeOffset(tokenName) {
  if (!tokenName) return { dx: 0, dy: 0 };
  const key = tokenName.toLowerCase();
  const isTalking = !!talkingPlayers[key];
  // TEMP DEBUG — remove once shake is confirmed working again
  const now = Date.now();
  if (now - _lastShakeDebug > 2000) {
    _lastShakeDebug = now;
    console.log(`[mic debug] getShakeOffset("${tokenName}") -> key="${key}" isTalking=${isTalking} knownKeys=`, Object.keys(talkingPlayers));
  }
  if (!isTalking) return { dx: 0, dy: 0 };
  const t = Date.now() / 50;
  return { dx: Math.sin(t) * 1.5, dy: Math.cos(t * 1.3) * 1.5 };
}
