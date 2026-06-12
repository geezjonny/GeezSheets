// Weather — particle logic, draw, save to RTDB
// State (enabled/intensity) lives in RTDB weather/
// Particles are local per client

import { db } from "./firebase.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

export const weather = {
  rain:  { enabled: false, intensity: 0.5 },
  snow:  { enabled: false, intensity: 0.3 },
  mist:  { enabled: false, intensity: 0.4 },
  storm: { enabled: false, intensity: 0.5 },
};

export const rainDrops  = [];
export const snowFlakes = [];
export const mistClouds = [];
let lastLightning = 0;
let lightningAlpha = 0;

export function initParticles(W, H) {
  rainDrops.length = 0; snowFlakes.length = 0; mistClouds.length = 0;
  for (let i = 0; i < 400; i++) rainDrops.push({ x: Math.random() * W, y: Math.random() * H, len: Math.random() * 14 + 8, speed: Math.random() * 6 + 14 });
  for (let i = 0; i < 300; i++) snowFlakes.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 2 + 1, speed: Math.random() * 1.2 + 0.4, drift: Math.random() * 0.6 - 0.3 });
  for (let i = 0; i < 12;  i++) mistClouds.push({ x: Math.random() * W, y: Math.random() * H, rx: Math.random() * W * 0.3 + 100, ry: Math.random() * 100 + 50, speed: Math.random() * 0.3 + 0.1, phase: Math.random() * Math.PI * 2 });
}

export function applyWeatherData(data) {
  ["rain","snow","mist","storm"].forEach(t => {
    if (data[t]) Object.assign(weather[t], data[t]);
  });
}

export async function saveWeather() {
  await set(ref(db, "weather"), weather);
}

export function drawWeather(ctx, W, H) {
  const any = weather.rain.enabled || weather.snow.enabled || weather.mist.enabled || weather.storm.enabled;
  if (!any) return;
  const now = Date.now();

  if (weather.mist.enabled) {
    const intensity = weather.mist.intensity;
    mistClouds.forEach(c => {
      c.x += c.speed; if (c.x - c.rx > W) c.x = -c.rx;
      const pulse = 0.5 + 0.5 * Math.sin(now / 3000 + c.phase);
      const alpha = intensity * 0.22 * pulse;
      const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.rx);
      grad.addColorStop(0, `rgba(180,190,210,${alpha})`);
      grad.addColorStop(1, "rgba(180,190,210,0)");
      ctx.save(); ctx.scale(1, c.ry / c.rx);
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(c.x, c.y * (c.rx / c.ry), c.rx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }

  if (weather.rain.enabled) {
    const intensity = weather.rain.intensity;
    const count = Math.floor(intensity * rainDrops.length);
    ctx.strokeStyle = `rgba(174,194,220,${0.25 + intensity * 0.35})`; ctx.lineWidth = 1;
    for (let i = 0; i < count; i++) {
      const d = rainDrops[i];
      d.y += d.speed; d.x += d.speed * 0.22;
      if (d.y > H) { d.y = -20; d.x = Math.random() * W; }
      if (d.x > W) d.x = 0;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.len * 0.22, d.y + d.len); ctx.stroke();
    }
  }

  if (weather.snow.enabled) {
    const intensity = weather.snow.intensity;
    const count = Math.floor(intensity * snowFlakes.length);
    ctx.fillStyle = `rgba(220,230,255,${0.5 + intensity * 0.3})`;
    for (let i = 0; i < count; i++) {
      const f = snowFlakes[i];
      f.y += f.speed; f.x += f.drift + Math.sin(now / 1200 + i) * 0.3;
      if (f.y > H) { f.y = -10; f.x = Math.random() * W; }
      if (f.x > W) f.x = 0; if (f.x < 0) f.x = W;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  if (weather.storm.enabled) {
    const interval = 8000 - weather.storm.intensity * 6000;
    if (now - lastLightning > interval && Math.random() < 0.02) {
      lastLightning = now; lightningAlpha = 1;
      ctx.save(); ctx.strokeStyle = "rgba(200,210,255,0.9)"; ctx.lineWidth = 2;
      let bx = W * 0.2 + Math.random() * W * 0.6, by = 0;
      ctx.beginPath(); ctx.moveTo(bx, by);
      while (by < H) { bx += Math.random() * 80 - 40; by += Math.random() * 60 + 30; ctx.lineTo(bx, by); }
      ctx.stroke(); ctx.restore();
    }
    if (lightningAlpha > 0) {
      ctx.fillStyle = `rgba(180,190,255,${lightningAlpha * 0.12})`;
      ctx.fillRect(0, 0, W, H);
      lightningAlpha = Math.max(0, lightningAlpha - 0.06);
    }
  }
}
