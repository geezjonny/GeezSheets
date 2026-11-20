import { watch, put } from "../store.js";
import { $, S, cellOf } from "./state.js";
import { addBarButton } from "./ui.js";

const NS = "http://www.w3.org/2000/svg";
let map, measure, rulerBtn, pingBtn, mode = null, start = null, line = null, dots = null, text = null;
let seenPing = false, lastPing = null;

function style() {
  if (document.getElementById("measure-style")) return;
  const s = document.createElement("style"); s.id = "measure-style";
  s.textContent = `
    #map.measuring { cursor: crosshair; }
    #measure .measure-line { stroke: var(--brass-lt); stroke-width: 2; stroke-dasharray: 7 5; }
    #measure .measure-dot { fill: var(--brass-lt); stroke: var(--ink); stroke-width: 1; }
    #measure .measure-label { fill: var(--paper); stroke: var(--leather-dk); stroke-width: 5px; paint-order: stroke; font: 16px Georgia, serif; text-anchor: middle; dominant-baseline: middle; }
    #measure .ping-ring { fill: none; stroke: var(--brass-lt); stroke-width: 3; opacity: 0; transform-box: fill-box; transform-origin: center; animation: measure-ping 1.5s ease-out forwards; }
    #measure .ping-dot { fill: #fff; stroke: var(--brass); stroke-width: 2; animation: measure-ping-dot 1.5s ease-out forwards; }
    @keyframes measure-ping { 0% { opacity: .95; transform: scale(.15); } 65% { opacity: .75; } 100% { opacity: 0; transform: scale(1); } }
    @keyframes measure-ping-dot { 0%, 65% { opacity: 1; } 100% { opacity: 0; } }
  `;
  document.head.append(s);
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function point(e) {
  const p = map.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  const ctm = map.getScreenCTM(); return ctm ? p.matrixTransform(ctm.inverse()) : { x: 0, y: 0 };
}

function handled(e) { e.preventDefault(); e.stopPropagation(); }

function setMode(next) {
  mode = mode === next ? null : next;
  start = null;
  if (mode !== "ruler") clearRuler();
  rulerBtn.classList.toggle("on", mode === "ruler");
  pingBtn.classList.toggle("on", mode === "ping");
  map.classList.toggle("measuring", !!mode);
}

function clearRuler() {
  line?.remove(); dots?.remove(); text?.remove();
  line = dots = text = null;
}

function drawRuler(end) {
  const a = start, b = end;
  if (!line) {
    line = svgEl("line", { class: "measure-line" });
    dots = svgEl("g"); text = svgEl("text", { class: "measure-label" });
    dots.append(svgEl("circle", { class: "measure-dot", r: 4 }), svgEl("circle", { class: "measure-dot", r: 4 }));
    measure.append(line, dots, text);
  }
  line.setAttribute("x1", a.x); line.setAttribute("y1", a.y); line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
  const cs = dots.children; cs[0].setAttribute("cx", a.x); cs[0].setAttribute("cy", a.y); cs[1].setAttribute("cx", b.x); cs[1].setAttribute("cy", b.y);
  const ft = Math.round(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / 40 * 5);
  text.setAttribute("x", (a.x + b.x) / 2); text.setAttribute("y", (a.y + b.y) / 2 - 10); text.textContent = `${ft} ft`;
}

function mapDown(e) {
  if (!mode) return;
  handled(e);
  const p = point(e);
  if (mode === "ping") return put("pings/last", { id: unique(), x: p.x, y: p.y, by: "player", ts: Date.now() });
  start = e.shiftKey ? p : cellOf(p); drawRuler(start); map.setPointerCapture?.(e.pointerId);
}

function mapMove(e) {
  if (!mode) return;
  handled(e);
  if (mode === "ruler" && start) drawRuler(e.shiftKey ? point(e) : cellOf(point(e)));
}

function mapUp(e) {
  if (!mode) return;
  handled(e);
  if (mode !== "ruler" || !start) return;
  start = null; const old = [line, dots, text];
  setTimeout(() => old.forEach((el) => el?.remove()), 2000);
  line = dots = text = null;
}

function unique() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

function showPing(p) {
  const g = svgEl("g");
  g.append(svgEl("circle", { class: "ping-ring", cx: p.x, cy: p.y, r: 32 }), svgEl("circle", { class: "ping-dot", cx: p.x, cy: p.y, r: 5 }));
  measure.append(g); setTimeout(() => g.remove(), 1600);
}

export function initMeasure() {
  map = $("#map"); if (!map) return;
  style(); measure = $("#measure") || svgEl("g", { id: "measure" });
  if (!measure.parentNode) map.append(measure); measure.setAttribute("pointer-events", "none");
  rulerBtn = addBarButton({ quick: true, id: "ruler", icon: "📏", label: "Ruler", toggle: true, onClick: () => setMode("ruler") });
  pingBtn = addBarButton({ quick: true, id: "ping", icon: "📍", label: "Ping", toggle: true, onClick: () => setMode("ping") });
  map.addEventListener("pointerdown", mapDown, { capture: true }); map.addEventListener("pointermove", mapMove, { capture: true }); map.addEventListener("pointerup", mapUp, { capture: true });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && mode) { e.preventDefault(); setMode(null); } });
  // Same tools on the 3D view: pick floor points by raycast. Orbit controls are paused while a tool is on.
  let s3 = null;
  const in3d = (e) => S.v3d && e.target.closest?.("#view3d");
  const p3 = (e, snap) => { const p = S.v3d.groundAt(e.clientX, e.clientY); return p && !snap ? p : p && cellOf(p); };
  document.addEventListener("pointerdown", (e) => {
    if (!mode || !in3d(e) || e.button) return; handled(e);
    const p = p3(e, e.shiftKey); if (!p) return;
    if (mode === "ping") { put("pings/last", { id: unique(), x: p.x, y: p.y, by: "player", ts: Date.now() }); return; }
    s3 = p; S.v3d.ruler(p, p); label3(p, p);
  }, true);
  document.addEventListener("pointermove", (e) => { if (!s3 || !in3d(e)) return; handled(e); const p = p3(e, e.shiftKey); if (p) { S.v3d.ruler(s3, p); label3(s3, p); } }, true);
  document.addEventListener("pointerup", (e) => { if (!s3) return; handled(e); s3 = null; setTimeout(() => { if (!s3) { S.v3d?.ruler(null); tip3.hidden = true; } }, 2000); }, true);
  const tip3 = Object.assign(document.createElement("div"), { hidden: true }); tip3.style.cssText = "position:fixed;z-index:8;pointer-events:none;background:var(--leather-dk);color:var(--paper);border:1px solid var(--brass);border-radius:6px;padding:.1rem .5rem;font:16px Georgia,serif;transform:translate(-50%,-140%)"; document.body.append(tip3);
  const label3 = (a, b) => { tip3.hidden = false; tip3.textContent = `${Math.round(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / 40 * 5)} ft`; const c = S.v3d.screenAt((a.x + b.x) / 2, (a.y + b.y) / 2); tip3.style.left = c.x + "px"; tip3.style.top = c.y + "px"; };
  const sync = () => S.v3d?.setControls(!mode); document.addEventListener("view3dchange", sync);
  const setMode0 = setMode; setMode = (n) => { setMode0(n); sync(); };
  watch("pings/last", (p) => {
    if (!seenPing) { seenPing = true; lastPing = p?.id; return; }
    if (!p || p.id === lastPing || Date.now() - (p.ts || 0) > 10000) return;
    lastPing = p.id; showPing(p); S.v3d?.ping(p);
  });
}
