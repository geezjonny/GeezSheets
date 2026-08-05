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

export function drawPings(ctx, activePings, toScreen, isVisible) {
  const now = Date.now();
  for (const [id, ping] of Object.entries(activePings)) {
    const age = (now - ping.startTime) / 1000;
    if (age > 3) { delete activePings[id]; continue; }
    if (isVisible && !isVisible(ping)) continue;
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

// ── Attack targeting ──────────────────────────────────────────────────────────
// A separate, dedicated mechanism from pings above -- same proven shape
// (push a short-lived RTDB entry, auto-remove it, fade it out on render) but
// kept on its own path (attackTargets, not pings) and its own render
// function, so extending this never risks the existing ping behavior.
export async function sendAttackTarget(tx, ty, attackerName, weaponName) {
  const targetRef = push(ref(db, "attackTargets"));
  await set(targetRef, { x: tx, y: ty, attackerName, weaponName, t: Date.now() });
  setTimeout(() => remove(targetRef), 6000);
}

export function drawAttackTargets(ctx, activeTargets, toScreen, isVisible) {
  const now = Date.now();
  for (const [id, tgt] of Object.entries(activeTargets)) {
    const age = (now - tgt.startTime) / 1000;
    if (age > 5) { delete activeTargets[id]; continue; }
    if (isVisible && !isVisible(tgt)) continue;
    const alpha = age > 4 ? 1 - (age - 4) : 1; // hold steady for 4s, then fade over the last second
    const [sx, sy] = toScreen(tgt.wx, tgt.wy);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#e04040"; ctx.lineWidth = 2.5;
    const r = 18;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - r - 8, sy); ctx.lineTo(sx - r + 4, sy); ctx.moveTo(sx + r - 4, sy); ctx.lineTo(sx + r + 8, sy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, sy - r - 8); ctx.lineTo(sx, sy - r + 4); ctx.moveTo(sx, sy + r - 4); ctx.lineTo(sx, sy + r + 8); ctx.stroke();
    ctx.font = "bold 11px Cinzel,serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillStyle = "#e04040";
    // Deliberately doesn't name the target -- naming it would bypass the
    // disguise system entirely (it'd show the token's real name regardless
    // of what it's disguised as to any given viewer), instantly revealing
    // any disguise to everyone watching the crosshair. Attacker + weapon is
    // safe to show, since that's the attacking player's own identity, not
    // the target's.
    ctx.fillText(`${tgt.attackerName} → ${tgt.weaponName}`, sx, sy - r - 12);
    ctx.restore();
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
