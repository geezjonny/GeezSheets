// Player-side persistence and GM controls for explored memory. Rules are never run here.
import { put as save, watch } from "../store.js";
import { addBarButton, dropMenu } from "./ui.js";
import { S, mapSize } from "./state.js";
import { cellsForHoles, decodeCells, encodeCells, mergeCells } from "./explored.js";

let key = null, cells = new Set(), timer = 0;
const deviceKey = () => {
  try {
    let id = localStorage.getItem("vtt-device-id");
    if (!id) { id = `device-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`; localStorage.setItem("vtt-device-id", id); }
    return id;
  } catch { return "device-session"; }
};
const playerKey = () => { let me = null; try { me = JSON.parse(localStorage.getItem("vtt-me")); } catch { /* ignore */ } return me?.id || deviceKey(); };
const redraw = () => S.exploredRedraw?.();
const flush = () => { timer = 0; if (key && S.map.exploredEnabled !== false) save(`explored/${key}`, encodeCells(cells)); };
const schedule = () => { clearTimeout(timer); timer = setTimeout(flush, 700); };

export function initExplored() {
  S.exploredCells = cells; S.currentVisible = new Set();
  if (S.isGM) {
    const button = addBarButton({ quick: true, id: "explored", icon: "◌", label: "Explore", title: "Toggle explored memory", gmOnly: true, toggle: true, onClick: (e, b) => save("map/exploredEnabled", b.classList.contains("on")) });
    const reset = addBarButton({ quick: true, id: "explored-reset", icon: "↺", label: "Reset explored", title: "Reset explored memory for everyone or one character", gmOnly: true, onClick: (e, b) => dropMenu(b, [["Reset everyone", () => save("explored", null)], ...Object.entries(S.tokens).filter(([, t]) => t.pc).map(([, t]) => ["Reset: " + (t.label || t.pc), () => save(`explored/${t.pc}`, null)])]) });
    button.classList.toggle("on", S.map.exploredEnabled !== false);
    watch("map/exploredEnabled", (v) => { S.map.exploredEnabled = v !== false; button.classList.toggle("on", S.map.exploredEnabled); redraw(); });
    return;
  }
  const start = () => {
    key = playerKey(); cells = new Set(); S.exploredCells = cells;
    watch(`explored/${key}`, (v) => { cells = decodeCells(v); S.exploredCells = cells; redraw(); });
  };
  start();
  addEventListener("vtt-me-changed", start);
}

export function visibilityFromHoles(holes) {
  // Hook: replace this adapter with vision.js polygon coverage when live sight is wired to it.
  return cellsForHoles(holes, mapSize().cols, mapSize().rows);
}

export function recordVisible(holes) {
  const visible = visibilityFromHoles(holes); S.currentVisible = visible;
  if (S.isGM || S.map.exploredEnabled === false) return;
  const next = mergeCells(cells, visible);
  if (next.size === cells.size) return;
  cells = next; S.exploredCells = cells; schedule(); redraw();
}

export const isCurrentlyVisible = (x, y) => S.isGM || S.map.exploredEnabled === false || S.currentVisible?.has(`${Math.floor(x / 40)},${Math.floor(y / 40)}`);
