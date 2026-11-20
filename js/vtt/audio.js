import { watch, put } from "../store.js";
import { S } from "./state.js";
import { dropMenu } from "./ui.js";
import { AUDIO_CATALOG } from "./audio-catalog.js";

const STYLE_ID = "audio-style", MUTE_KEY = "vtt-audio-mute", VOL_KEY = "vtt-audio-volume";
let mute = false, master = 1, audioState = {}, ready = false, unlocked = false;
const loops = new Map(), played = new Set(), queued = [];

function css() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style"); s.id = STYLE_ID;
  s.textContent = `.dropmenu.audio-menu{max-height:70vh;overflow:auto}.audio-volume{display:flex;align-items:center;gap:6px;padding:5px 8px;color:var(--paper)}.audio-volume input{width:8em}`;
  document.head.append(s);
}
function local(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(key, value); } catch {} }
function volume() { return mute ? 0 : master; }
function applyVolume() { loops.forEach((a, key) => { a.volume = (audioState[key]?.vol ?? 1) * volume(); }); }
function start(a, loop = false) {
  a.loop = loop; a.volume = 0; a.preload = "auto";
  const p = a.play();
  if (p?.catch) p.catch(() => { if (!unlocked) queued.push(a); });
  return a;
}
function unlock() {
  if (unlocked) return; unlocked = true;
  while (queued.length) queued.shift().play().catch(() => {});
  loops.forEach((a) => a.paused && a.play().catch(() => {}));
}
function playLoop(key, data) {
  if (!data?.src) return;
  const old = loops.get(key);
  if (old && old.src === data.src) { old.volume = data.vol * volume(); if (old.paused) old.play().catch(() => {}); return; }
  old?.pause(); old?.removeAttribute("src"); old?.load();
  const a = start(new Audio(data.src), true); a.volume = data.vol * volume(); loops.set(key, a);
}
function stopLoop(key) { const a = loops.get(key); if (!a) return; a.pause(); a.removeAttribute("src"); a.load(); loops.delete(key); for (let i = queued.length - 1; i >= 0; i--) if (queued[i] === a) queued.splice(i, 1); }
function sync(v) {
  audioState = v || {};
  if (audioState.music) playLoop("music", audioState.music); else stopLoop("music");
  const ambience = audioState.ambience || {};
  for (const [id, data] of Object.entries(ambience)) playLoop(`ambience:${id}`, data);
  for (const key of [...loops.keys()]) if (key.startsWith("ambience:") && !ambience[key.slice(9)]) stopLoop(key);
  for (const [id, data] of Object.entries(audioState.sfx || {})) {
    const key = `${id}:${data.at}`; if (played.has(key) || !data.at || Date.now() - data.at > 5000) continue;
    played.add(key); const a = start(new Audio(data.src)); a.volume = volume(); a.addEventListener("ended", () => a.remove(), { once: true });
  }
  applyVolume();
}
function category(anchor, type) {
  const list = AUDIO_CATALOG[type];
  dropMenu(anchor, [["< Back", () => openMenu(anchor)], ...list.map((x) => {
    const active = type === "music" ? audioState.music?.src === x.src : type === "ambience" ? !!audioState.ambience?.[x.id] : false;
    return [`${active ? "✓ " : ""}${x.name}`, () => S.isGM && toggle(type, x)];
  })]);
}
function toggle(type, x) {
  const now = Date.now();
  if (type === "music") return put("audio/music", audioState.music?.src === x.src ? null : { src: x.src, name: x.name, vol: 1, at: now });
  if (type === "ambience") { const current = audioState.ambience || {}; return put(`audio/ambience/${x.id}`, current[x.id] ? null : { src: x.src, vol: 1, at: now }); }
  return put(`audio/sfx/${x.id}`, { src: x.src, at: now });
}
function setVolume(value) { master = Math.max(0, Math.min(1, Number(value))); save(VOL_KEY, master); applyVolume(); }
function volumeMenu(anchor) {
  const input = document.createElement("input"); input.type = "range"; input.min = 0; input.max = 1; input.step = .05; input.value = master;
  const menu = dropMenu(anchor, [["Volume", null], ["Mute (me)", () => { mute = !mute; save(MUTE_KEY, mute); applyVolume(); }]]);
  const row = document.createElement("div"); row.className = "audio-volume"; row.append("Master", input); input.oninput = () => setVolume(input.value); menu.append(row);
}
function openMenu(anchor) {
  const items = [];
  if (S.isGM) items.push(["Music", () => category(anchor, "music")], ["Ambience", () => category(anchor, "ambience")], ["Sound FX", () => category(anchor, "sfx")], ["Stop all", () => put("audio", { music: null, ambience: {}, sfx: {} })]);
  items.push(["Volume", () => volumeMenu(anchor)], ["Mute (me)", () => { mute = !mute; save(MUTE_KEY, mute); applyVolume(); }]);
  const menu = dropMenu(anchor, items); menu.classList.add("audio-menu");
}
export function initAudio() {
  css(); mute = local(MUTE_KEY, "false") === "true"; master = Number(local(VOL_KEY, "1"));
  const button = document.getElementById("audio-btn"); if (!button) return;
  button.addEventListener("click", (e) => { e.stopPropagation(); unlock(); openMenu(button); });
  document.addEventListener("pointerdown", unlock, { once: true }); document.addEventListener("keydown", unlock, { once: true });
  watch("audio", (v) => { ready = true; sync(v); });
}
