// Shared table annotations. The geometry is kept in annotation-geometry.js so it is testable without a page.
import { watch, put, patch } from "../store.js";
import { addBarButton, floatWindow } from "./ui.js";
import { S } from "./state.js";
import { annotationColors, canChangeAnnotation, normalizeAnnotation, serializeAnnotation, visibleAnnotations } from "./annotation-geometry.js";

const NS = "http://www.w3.org/2000/svg";
const COLORS = [...annotationColors];
let map, layer, win, mode = null, color = COLORS[0], draft = null, annotations = {};
const author = () => S.isGM ? "GM" : (() => { try { return JSON.parse(localStorage.getItem("vtt-me"))?.name || "Player"; } catch { return "Player"; } })();
const uid = () => "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const svgPoint = (e) => { const p = map.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(map.getScreenCTM().inverse()); };
const el = (name, attrs = {}) => { const n = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

function drawOne(id, raw) {
  const a = normalizeAnnotation(raw), p = a.pts, c = a.color, g = el("g", { class: "annotation", "data-id": id, stroke: c, fill: "none" });
  if (a.type === "freehand") g.append(el("polyline", { points: p.map((x) => `${x.x},${x.y}`).join(" ") }));
  else if (a.type === "line" || a.type === "arrow") { const q = p.at(-1) || p[0] || { x: 0, y: 0 }; g.append(el("line", { x1: p[0]?.x || 0, y1: p[0]?.y || 0, x2: q.x, y2: q.y })); if (a.type === "arrow") { const dx = q.x - (p[0]?.x || 0), dy = q.y - (p[0]?.y || 0), n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n, sx = q.x - ux * 12, sy = q.y - uy * 12; g.append(el("path", { d: `M${sx - uy * 6},${sy + ux * 6} L${q.x},${q.y} L${sx + uy * 6},${sy - ux * 6}` })); } }
  else if (a.type === "rectangle") { const q = p.at(-1) || p[0] || { x: 0, y: 0 }, x = Math.min(p[0]?.x || 0, q.x), y = Math.min(p[0]?.y || 0, q.y); g.append(el("rect", { x, y, width: Math.abs(q.x - (p[0]?.x || 0)), height: Math.abs(q.y - (p[0]?.y || 0)) })); }
  else if (a.type === "circle") { const q = p.at(-1) || p[0] || { x: 0, y: 0 }; g.append(el("circle", { cx: p[0]?.x || 0, cy: p[0]?.y || 0, r: Math.hypot(q.x - (p[0]?.x || 0), q.y - (p[0]?.y || 0)) })); }
  else { const t = el("text", { x: p[0]?.x || 0, y: p[0]?.y || 0, fill: c }); t.textContent = a.text || ""; g.append(t); }
  layer.append(g);
}
function render() { if (!layer) return; layer.replaceChildren(); for (const [id, a] of Object.entries(visibleAnnotations(annotations))) drawOne(id, a); }
function end(e) { if (!draft) return; const p = svgPoint(e); if (draft.type !== "text") draft.pts.push({ x: p.x, y: p.y }); if (draft.type === "freehand" && draft.pts.length < 2) return draft = null; put(`annotations/${uid()}`, serializeAnnotation(draft)); draft = null; render(); }
function installWindow() {
  win = floatWindow({ id: "annotations", title: "Annotations", x: 16, y: 64, hidden: true }); win.body.className += " annotation-tools";
  win.body.innerHTML = `<div class="annotation-modes">${[["freehand", "✎"], ["line", "／"], ["arrow", "➜"], ["rectangle", "□"], ["circle", "○"], ["text", "T"], ["erase", "⌫"]].map(([v, l]) => `<button type="button" data-mode="${v}" title="${v}">${l}</button>`).join("")}</div><div class="annotation-colors">${COLORS.map((c) => `<button type="button" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join("")}</div><button type="button" data-pin>Pin my annotations</button>${S.isGM ? `<button type="button" data-clear>Clear all annotations</button>` : ""}`;
  win.body.addEventListener("click", (e) => { const m = e.target.closest("[data-mode]"); if (m) { mode = m.dataset.mode; win.body.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b === m)); map.classList.toggle("annotating", !!mode); } const c = e.target.closest("[data-color]"); if (c) color = c.dataset.color; if (e.target.closest("[data-pin]")) Object.entries(annotations).filter(([, a]) => canChangeAnnotation(a, author(), S.isGM)).forEach(([id, a]) => patch({ [`annotations/${id}/pinned`]: !a.pinned })); if (e.target.closest("[data-clear]") && S.isGM) put("annotations", null); });
  const undo = document.createElement("button"); undo.type = "button"; undo.textContent = "Undo my last"; undo.addEventListener("click", () => { const own = Object.entries(annotations).filter(([, a]) => canChangeAnnotation(a, author(), false)).sort((a, b) => (b[1].t || 0) - (a[1].t || 0))[0]; if (own) put(`annotations/${own[0]}`, null); }); win.body.append(undo);
}
export function initAnnotations() {
  map = document.getElementById("map"); layer = document.getElementById("annotations"); if (!map || !layer) return;
  installWindow(); addBarButton({ quick: true, id: "annotations", icon: "✎", label: "Marks", title: "Draw shared annotations", toggle: true, onClick: () => win.toggle() });
  watch("annotations", (v) => { annotations = v || {}; render(); });
  map.addEventListener("pointerdown", (e) => { if (!mode || S.isGM === false && S.paused) return; if (mode === "erase") { const hit = e.target.closest(".annotation")?.dataset.id, a = hit && annotations[hit]; if (a && canChangeAnnotation(a, author(), S.isGM)) put(`annotations/${hit}`, null); return; } const p = svgPoint(e); if (mode === "text") { const text = prompt("Annotation text:"); if (text?.trim()) put(`annotations/${uid()}`, serializeAnnotation({ type: "text", pts: [p], text: text.trim(), color, by: author(), t: Date.now() })); mode = null; return; } draft = { type: mode, pts: [p], color, by: author(), t: Date.now() }; map.setPointerCapture(e.pointerId); e.stopPropagation(); });
  map.addEventListener("pointerdown", (e) => { if (mode) e.stopPropagation(); });
  map.addEventListener("pointermove", (e) => { if (draft && draft.type === "freehand") { draft.pts.push(svgPoint(e)); render(); drawOne("draft", draft); } });
  map.addEventListener("pointerup", (e) => { if (draft) end(e); }); map.addEventListener("pointercancel", () => { draft = null; render(); });
  setInterval(render, 1000);
}
