import { watch, put } from "../store.js";
import { S } from "./state.js";
import { floatWindow, addBarButton } from "./ui.js";

const STYLE_ID = "atmosphere-style";
const TINT_ID = "atmosphere-tint";
const CANVAS_ID = "atmosphere-canvas";
let timeWin, weatherWin, tint, canvas, ctx, raf = 0, state = { time: 12, weather: "clear", color: "#4d86b8" };

const css = () => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style"); style.id = STYLE_ID;
  style.textContent = `
    #${TINT_ID}{position:fixed;inset:0;z-index:6;pointer-events:none;mix-blend-mode:multiply}
    #${CANVAS_ID}{position:fixed;inset:0;width:100%;height:100%;z-index:6;pointer-events:none}
    .atmo-presets,.atmo-weather,.atmo-swatches{display:flex;flex-wrap:wrap;gap:4px}
    .atmo-clock{font-size:1.2rem;text-align:center;color:var(--brass-lt);margin:.25rem 0 .5rem}
    .atmo-time{width:15rem;accent-color:var(--brass)}
    .atmo-presets button,.atmo-weather button{flex:1;min-width:4.4rem}
    .atmo-weather button{font-size:1.05rem;padding:.6rem .35rem}
    .atmo-swatches{margin-top:.6rem;max-width:15rem}.atmo-swatches[hidden]{display:none}
    .atmo-swatch{width:2rem;height:2rem;padding:0;border:2px solid var(--brass);border-radius:4px;cursor:pointer}
    .atmo-custom{width:2.5rem;height:2rem;padding:0;border:1px solid var(--brass);background:var(--leather-dk)}
  `;
  document.head.append(style);
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (v) => v * v * (3 - 2 * v);
const stops = [[0, [13, 24, 57, .45]], [5, [13, 24, 57, .45]], [7, [190, 99, 42, .2]], [9, [0, 0, 0, 0]], [17, [0, 0, 0, 0]], [19, [190, 99, 42, .2]], [21, [13, 24, 57, .45]], [24, [13, 24, 57, .45]]];

export function tintFor(hour) {
  const h = ((Number(hour) || 0) % 24 + 24) % 24;
  for (let i = 1; i < stops.length; i++) if (h <= stops[i][0]) {
    const a = stops[i - 1], b = stops[i], t = smooth((h - a[0]) / (b[0] - a[0]));
    return { r: Math.round(a[1][0] + (b[1][0] - a[1][0]) * t), g: Math.round(a[1][1] + (b[1][1] - a[1][1]) * t), b: Math.round(a[1][2] + (b[1][2] - a[1][2]) * t), a: a[1][3] + (b[1][3] - a[1][3]) * t };
  }
  return { r: 13, g: 24, b: 57, a: .45 };
}

const clock = (h) => { const hh = Math.floor(h) % 24, mm = Math.round((h - Math.floor(h)) * 60) % 60; return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; };
export const darknessFor = (hour) => tintFor(hour).a;
const validColor = (c) => /^#[0-9a-f]{6}$/i.test(c) ? c : "#4d86b8";
const renderTint = () => { const c = tintFor(state.time); tint.style.backgroundColor = `rgba(${c.r},${c.g},${c.b},${c.a})`; S.atmosphere = { ...state }; S.refreshLighting?.(); };

function renderTime() { if (!timeWin) return; const input = timeWin.body.querySelector(".atmo-time"); input.value = state.time; timeWin.body.querySelector(".atmo-clock").textContent = clock(state.time); }
function renderWeather() {
  if (!weatherWin) return;
  weatherWin.body.querySelectorAll("[data-weather]").forEach((b) => b.classList.toggle("on", b.dataset.weather === state.weather));
  weatherWin.body.querySelector(".atmo-swatches").hidden = state.weather === "clear";
  weatherWin.body.querySelectorAll("[data-color]").forEach((b) => b.classList.toggle("on", b.dataset.color.toLowerCase() === state.color.toLowerCase()));
}

function write(patch) { state = { ...state, ...patch }; renderTint(); if (patch.time !== undefined) renderTime(); if (patch.weather !== undefined || patch.color !== undefined) renderWeather(); put("atmosphere", { time: clamp(Number(state.time) || 0, 0, 24), weather: state.weather, color: validColor(state.color) }); }
function makeTimeWindow() {
  timeWin = floatWindow({ id: "atmosphere-time", title: "Time", x: 110, y: 170, hidden: true });
  timeWin.body.innerHTML = `<div class="atmo-clock"></div><input class="atmo-time" type="range" min="0" max="24" step="0.25"><div class="atmo-presets"><button type="button" data-time="6">Dawn</button><button type="button" data-time="12">Noon</button><button type="button" data-time="18">Dusk</button><button type="button" data-time="0">Night</button></div>`;
  const input = timeWin.body.querySelector(".atmo-time"); let timer = 0, pending = null;
  const flush = () => { if (pending !== null) { const value = pending; pending = null; write({ time: value }); } };
  input.oninput = () => { const value = Number(input.value); timeWin.body.querySelector(".atmo-clock").textContent = clock(value); pending = value; if (!timer) timer = setTimeout(() => { timer = 0; flush(); }, 100); };
  input.onchange = () => { clearTimeout(timer); timer = 0; flush(); };
  timeWin.body.querySelectorAll("[data-time]").forEach((b) => b.onclick = () => write({ time: Number(b.dataset.time) }));
  renderTime();
}
function makeWeatherWindow() {
  weatherWin = floatWindow({ id: "atmosphere-weather", title: "Weather", x: 260, y: 170, hidden: true });
  const rain = ["#367bb0", "#6f8fa6", "#707070", "#8b1e2b"], snow = ["#ffffff", "#bfe8ff", "#a6b0b8"];
  weatherWin.body.innerHTML = `<div class="atmo-weather"><button type="button" data-weather="clear">Clear</button><button type="button" data-weather="rain">Rain</button><button type="button" data-weather="snow">Snow</button></div><div class="atmo-swatches"></div>`;
  const swatches = weatherWin.body.querySelector(".atmo-swatches");
  const drawSwatches = () => { swatches.replaceChildren(...(state.weather === "rain" ? rain : snow).map((c) => { const b = document.createElement("button"); b.type = "button"; b.className = "atmo-swatch"; b.dataset.color = c; b.style.background = c; b.title = c; b.onclick = () => write({ color: c }); return b; }), (() => { const i = document.createElement("input"); i.type = "color"; i.className = "atmo-custom"; i.value = validColor(state.color); i.title = "Custom colour"; i.oninput = () => write({ color: i.value }); return i; })()); };
  weatherWin.body.querySelectorAll("[data-weather]").forEach((b) => b.onclick = () => { write({ weather: b.dataset.weather }); drawSwatches(); });
  drawSwatches(); renderWeather();
}

let particles = [];
function resize() { const d = Math.min(devicePixelRatio || 1, 2); canvas.width = innerWidth * d; canvas.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
function seedParticles() { const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches; const n = reduced ? 22 : 180; particles = Array.from({ length: n }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, v: 2 + Math.random() * 5, s: 1 + Math.random() * 3, d: Math.random() * 1.5 })); }
function animate(now) { if (document.hidden || state.weather === "clear") { raf = 0; return; } raf = requestAnimationFrame(animate); const dt = Math.min((now - (animate.last || now)) / 16.67, 3); animate.last = now; ctx.clearRect(0, 0, innerWidth, innerHeight); ctx.strokeStyle = validColor(state.color); ctx.fillStyle = ctx.strokeStyle; ctx.globalAlpha = .55;
  for (const p of particles) { p.y += p.v * dt; p.x += (state.weather === "rain" ? p.d : Math.sin(p.y / 25) * .25) * dt; if (p.y > innerHeight + 10) { p.y = -10; p.x = Math.random() * innerWidth; } if (state.weather === "rain") { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 2, p.y + p.s * 5); ctx.stroke(); } else ctx.beginPath(), ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2), ctx.fill(); }
  ctx.globalAlpha = 1;
}
function renderWeatherCanvas() { if (state.weather === "clear") { ctx?.clearRect(0, 0, innerWidth, innerHeight); particles = []; } else { if (!particles.length) seedParticles(); if (!raf && !document.hidden) raf = requestAnimationFrame(animate); } }

export function initAtmosphere() {
  css(); tint = document.getElementById(TINT_ID) || Object.assign(document.createElement("div"), { id: TINT_ID }); canvas = document.getElementById(CANVAS_ID) || Object.assign(document.createElement("canvas"), { id: CANVAS_ID }); if (!tint.parentNode) document.body.append(tint); if (!canvas.parentNode) document.body.append(canvas); ctx = canvas.getContext("2d"); resize(); renderTint(); addEventListener("resize", resize);
  if (S.isGM) { makeTimeWindow(); makeWeatherWindow(); const time = addBarButton({ id: "time", icon: "🕒", label: "Time", gmOnly: true, toggle: true, onClick: () => timeWin.toggle() }); timeWin.el.addEventListener("fwin-close", () => time.classList.remove("on")); const wbtn = addBarButton({ id: "weather", icon: "☁", label: "Weather", gmOnly: true, toggle: true, onClick: () => weatherWin.toggle() }); time.title = "Time"; weatherWin.el.addEventListener("fwin-close", () => wbtn.classList.remove("on")); }
  document.addEventListener("visibilitychange", renderWeatherCanvas);
  watch("atmosphere", (v) => { if (!v) return; state = { time: clamp(Number.isFinite(Number(v.time)) ? Number(v.time) : 12, 0, 24), weather: ["clear", "rain", "snow"].includes(v.weather) ? v.weather : "clear", color: validColor(v.color) }; renderTint(); renderTime(); renderWeather(); renderWeatherCanvas(); });
  renderWeatherCanvas();
}
