// Map size, zoom and pan. The grid size lives in Firebase (map/size {cols,rows}, default 20x14);
// zoom/pan are local to each viewer and only change the SVG viewBox.
import { $, S, mapSize } from "./state.js";
import { put } from "./undo.js";
import { addBarButton } from "./ui.js";

const svg = $("#map"), NS = "http://www.w3.org/2000/svg";
let view = null, resizing = false, space = false, panning = null, sizing = null, pinch = null;
const touches = new Map();   // active touch pointers, for pinch-zoom and two-finger pan   // view = {x,y,w,h} in map px; null = whole map
const W = () => mapSize().cols * 40, H = () => mapSize().rows * 40;

export function applyView() {
  const w = W(), h = H(), z = view ? Math.max(1, w / view.w) : 1;
  if (z <= 1.001) view = null;
  if (view) { view.w = w / z; view.h = h / z; view.x = Math.max(0, Math.min(w - view.w, view.x)); view.y = Math.max(0, Math.min(h - view.h, view.y)); }
  const v = view || { x: 0, y: 0, w, h };
  svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
  document.querySelector(".paper")?.style.setProperty("--ar", w / h);   // the page frame takes the map shape and fits the window, so nothing scrolls
  $("#mapbase")?.setAttribute("width", w - 40); $("#mapbase")?.setAttribute("height", h - 40);
  for (const r of svg.querySelectorAll(".fullrect")) { r.setAttribute("width", w); r.setAttribute("height", h); }
  drawHandles();
}
export const zoomBy = (f, cx, cy) => {   // zoom about a map point (default: the middle of what is visible)
  if (S.v3d) return S.v3d.zoom(f);
  const w = W(), h = H(), v = view || { x: 0, y: 0, w, h }, nw = Math.max(w / 8, Math.min(w, v.w * f)), k = nw / v.w;
  cx ??= v.x + v.w / 2; cy ??= v.y + v.h / 2;
  view = { x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, w: nw, h: v.h * k }; applyView();
};
export const fitView = () => { if (S.v3d) return S.v3d.fit(); view = null; applyView(); };
const toMap = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };

// ---- resize handles (GM): drag the right / bottom edge or the corner to grow or shrink the grid ----
function drawHandles() {
  let g = $("#resize"); if (!g) { g = document.createElementNS(NS, "g"); g.id = "resize"; svg.append(g); }
  g.textContent = ""; if (!resizing || !S.isGM) return;
  const w = W(), h = H(), s = (view ? view.w : w) / 800;   // keep handles a constant on-screen size
  const lines = document.createElementNS(NS, "rect"); lines.setAttribute("width", w); lines.setAttribute("height", h); lines.setAttribute("fill", "url(#gridlines)"); lines.setAttribute("pointer-events", "none"); g.append(lines);   // grid lines over the whole map
  const mk = (x, y, ww, hh, mode, cur) => { const r = document.createElementNS(NS, "rect"); r.setAttribute("class", "rhandle"); r.dataset.mode = mode;
    r.setAttribute("x", x - ww / 2); r.setAttribute("y", y - hh / 2); r.setAttribute("width", ww); r.setAttribute("height", hh); r.setAttribute("rx", 4 * s); r.style.cursor = cur; g.append(r); };
  mk(w, h / 2, 14 * s, 60 * s, "x", "ew-resize"); mk(w / 2, h, 60 * s, 14 * s, "y", "ns-resize"); mk(w, h, 22 * s, 22 * s, "xy", "nwse-resize");
  const o = document.createElementNS(NS, "rect"); o.setAttribute("class", "rframe"); o.setAttribute("x", 0); o.setAttribute("y", 0); o.setAttribute("width", w); o.setAttribute("height", h); g.prepend(o);
}
function sizePreview(e) {
  const p = toMap(e), c = sizing.mode.includes("x") ? Math.max(10, Math.min(100, Math.round(p.x / 40))) : mapSize().cols, r = sizing.mode.includes("y") ? Math.max(7, Math.min(100, Math.round(p.y / 40))) : mapSize().rows;
  S.map.size = { cols: c, rows: r }; applyView(); sizing.last = { cols: c, rows: r };
}

export function initView() {
  svg.addEventListener("wheel", (e) => { e.preventDefault(); const p = toMap(e); zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y); }, { passive: false });
  svg.addEventListener("pointerdown", (e) => {   // capture phase: handles and pan win over map tools
    if (e.pointerType === "touch") {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; e.stopPropagation(); e.preventDefault(); return; }
    }
    const hnd = e.target.closest?.(".rhandle");
    if (hnd) { sizing = { mode: hnd.dataset.mode, before: { ...mapSize() } }; svg.setPointerCapture(e.pointerId); e.stopPropagation(); e.preventDefault(); return; }
    if (e.button === 1 || (space && e.button === 0)) { panning = { x: e.clientX, y: e.clientY, v: { ...(view || { x: 0, y: 0, w: W(), h: H() }) } }; svg.setPointerCapture(e.pointerId); svg.classList.add("panning"); e.stopPropagation(); e.preventDefault(); }
  }, true);
  svg.addEventListener("pointermove", (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size >= 2) {   // two fingers: zoom by the spread, pan by the midpoint
      const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const v = view || { x: 0, y: 0, w: W(), h: H() }, k = v.w / svg.clientWidth, p = toMap({ clientX: cx, clientY: cy });
      zoomBy(pinch.d / Math.max(d, 1), p.x, p.y);
      const v2 = view; if (v2) { v2.x -= (cx - pinch.cx) * k; v2.y -= (cy - pinch.cy) * k; applyView(); }
      pinch = { d, cx, cy }; e.stopPropagation(); return;
    }
    if (sizing) { sizePreview(e); e.stopPropagation(); return; }
    if (!panning) return; e.stopPropagation();
    const k = panning.v.w / svg.clientWidth; view = { ...panning.v, x: panning.v.x - (e.clientX - panning.x) * k, y: panning.v.y - (e.clientY - panning.y) * k }; applyView();
  }, true);
  const end = (e) => {
    if (touches.delete(e.pointerId) && pinch) { if (touches.size < 2) pinch = null; e.stopPropagation(); return; }
    if (sizing) { const s = sizing; sizing = null; e.stopPropagation(); if (s.last) put("map/size", s.last); else applyView(); }
    else if (panning) { panning = null; svg.classList.remove("panning"); e.stopPropagation(); }
  };
  svg.addEventListener("pointerup", end, true); svg.addEventListener("pointercancel", end, true);
  document.addEventListener("keydown", (e) => { if (e.code === "Space" && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { space = true; svg.classList.add("pannable"); if (e.target === document.body) e.preventDefault(); } });
  document.addEventListener("keyup", (e) => { if (e.code === "Space") { space = false; svg.classList.remove("pannable"); } });
  let busy = false;
  const off = (...ids) => { busy = true; ids.forEach((i) => { const b = document.getElementById("bar-" + i); if (b?.classList.contains("on")) b.click(); }); busy = false; };
  const sel = addBarButton({ quick: true, id: "select", icon: "👆", label: "Select", title: "Select: click things to select them (3D: opens their menu)", toggle: true, onClick: (e, b) => { S.select3d = b.classList.contains("on"); if (S.select3d) off("ruler", "ping"); S.v3d?.clearSelection(); } });
  setTimeout(() => ["ruler", "ping"].forEach((i) => document.getElementById("bar-" + i)?.addEventListener("click", () => { if (S.select3d && !busy) sel.click(); })), 0);
  addBarButton({ quick: true, id: "fit", icon: "⤢", label: "Fit", title: "Show the whole map", onClick: fitView });
  addBarButton({ quick: true, id: "grid", icon: "▦", label: "Grid", title: "Show the grid; drag the map edge to make it bigger or smaller", gmOnly: true, toggle: true, onClick: (e, b) => {
    if (S.v3d) { S.v3d.setGrid(b.classList.contains("on")); return; }   // 3D: show / hide the grid lines
    resizing = !resizing; drawHandles(); } });
  applyView();
}
