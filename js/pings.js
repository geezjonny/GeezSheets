// Pings and laser pointers
// Pings: short-lived RTDB entries, auto-deleted after 4s
// Lasers: live cursor positions per player

import { db } from "./firebase.js";
import { ref, set, push, remove } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { TILE } from "./config.js";

export async function sendPing(tx, ty, playerName) {
  const pingRef = push(ref(db, "pings"));
  await set(pingRef, { x: tx, y: ty, name: playerName, t: Date.now() });
  setTimeout(() => remove(pingRef), 4000);
}

export function drawPings(ctx, activePings, toScreen) {
  const now = Date.now();
  for (const [id, ping] of Object.entries(activePings)) {
    const age = (now - ping.startTime) / 1000;
    if (age > 3) { delete activePings[id]; continue; }
    const alpha = 1 - age / 3;
    const [sx, sy] = toScreen(ping.wx, ping.wy);
    for (let i = 0; i < 3; i++) {
      const phase = (age + i * 0.4) % 1.2;
      ctx.beginPath(); ctx.arc(sx, sy, 20 + phase * 60, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,200,50,${alpha * (1 - phase / 1.2) * 0.8})`; ctx.lineWidth = 2.5; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,220,80,${alpha})`; ctx.fill();
    ctx.font = "bold 11px Cinzel,serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillStyle = `rgba(255,220,80,${alpha})`; ctx.fillText(ping.name, sx, sy - 10);
  }
}

export function drawLasers(ctx, activeLasers, toScreen) {
  for (const [name, laser] of Object.entries(activeLasers)) {
    const [sx, sy] = toScreen(laser.wx, laser.wy);
    ctx.save();
    ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.fillStyle = laser.color || "#fff"; ctx.globalAlpha = 0.85; ctx.fill();
    ctx.font = "bold 10px Cinzel,serif"; ctx.fillStyle = "#fff";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText(name.replace(/_/g, " "), sx, sy - 10);
    ctx.restore();
  }
}

export function startLaser(playerName, wx, wy) {
  const safeKey = playerName.replace(/\./g, "_");
  const color = `hsl(${(playerName.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 47) % 360},70%,65%)`;
  const laserRef = ref(db, `lasers/${safeKey}`);
  set(laserRef, { wx, wy, color, name: playerName });
  return laserRef;
}

export function moveLaser(laserRef, wx, wy, playerName) {
  if (!laserRef) return;
  set(laserRef, { wx, wy, name: playerName });
}

export function stopLaser(laserRef) {
  if (laserRef) remove(laserRef);
}
