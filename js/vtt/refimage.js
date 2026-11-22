import { $, S, mapSize } from "./state.js";
import { floatWindow, addBarButton } from "./ui.js";

const NS = "http://www.w3.org/2000/svg";
let dataUrl = null, shown = false, cols = 0, rows = 0, ppg = null, opacity = .45, infoWin = null, controlsWin = null;

const layer = () => $("#refimage");
function render() {
  S.refresh3d?.();
  const g = layer(); if (!g) return;
  g.replaceChildren(); g.hidden = !shown || !dataUrl;
  if (!dataUrl || !shown) return;
  const image = document.createElementNS(NS, "image");
  image.setAttribute("href", dataUrl); image.setAttribute("x", 0); image.setAttribute("y", 0);
  image.setAttribute("width", (cols || mapSize().cols) * 40); image.setAttribute("height", (rows || mapSize().rows) * 40);
  image.setAttribute("preserveAspectRatio", "none"); image.setAttribute("opacity", opacity); image.setAttribute("pointer-events", "none");
  g.append(image);
}
export function setRefImage(url, size = {}) { dataUrl = typeof url === "string" && url ? url : null; cols = Number(size.cols) || 0; rows = Number(size.rows) || 0; ppg = Number(size.ppg) || null; shown = !!dataUrl; render(); }
export function clearRefImage() { dataUrl = null; shown = false; cols = rows = 0; ppg = null; render(); }
export function toggleRefImage() { if (dataUrl) shown = !shown; render(); return shown; }
export function isRefShown() { return shown && !!dataUrl; }
export function setRefOpacity(v) { opacity = Math.max(0, Math.min(1, Number(v) || 0)); render(); }
export function refInfo() {
  const m = /^data:([^;,]+)[^,]*,/.exec(dataUrl || ""), base64 = (dataUrl || "").split(",")[1] || "";
  return { mime: m?.[1] || "unknown", kb: Math.round((base64.replace(/\s/g, "").length * 3 / 4) / 1024), width: cols * 40, height: rows * 40, ppg, dataUrl };
}
function openInfo(ppg) {
  if (!infoWin) infoWin = floatWindow({ id: "ref-info", title: "Reference info", x: 360, y: 180 });
  const i = refInfo(); infoWin.body.innerHTML = `<div class="ref-info"><div>Image: ${i.mime}</div><div>Size: ${i.kb} KB</div><div>Pixels: ${i.width} × ${i.height}</div><div>Pixels per grid: ${ppg ?? "—"}</div><button type="button" data-copy>Copy base64</button></div>`;
  infoWin.body.querySelector("[data-copy]").onclick = async () => { try { await navigator.clipboard.writeText((dataUrl || "").split(",")[1] || ""); } catch { /* clipboard permission */ } };
  infoWin.show();
}
export function openRefControls() {
  if (!controlsWin) controlsWin = floatWindow({ id: "ref-controls", title: "Reference", x: 330, y: 120 });
  controlsWin.body.innerHTML = `<label>Opacity <input data-opacity type="range" min="0" max="1" step="0.05" value="${opacity}"><output>${opacity}</output></label><button type="button" data-info>Reference info</button>`;
  const range = controlsWin.body.querySelector("[data-opacity]"), out = controlsWin.body.querySelector("output");
  range.oninput = () => { out.value = range.value; setRefOpacity(range.value); };
  controlsWin.body.querySelector("[data-info]").onclick = () => openInfo(ppg);
  controlsWin.show();
}
export function initRefImage() {
  if (!document.querySelector("#map")) return;
  const button = addBarButton({ quick: true, id: "reference", icon: "▧", label: "Reference", title: "Show or hide dd2vtt reference picture", gmOnly: true, toggle: true, onClick: (e, b) => { toggleRefImage(); b.classList.toggle("on", isRefShown()); } });
  const ppg = () => refInfo().ppg;
  button.dataset.reference = "1";
  const refresh = () => { button.classList.toggle("on", isRefShown()); render(); };
  window.addEventListener("resize", refresh); document.addEventListener("vttvisibilitychange", refresh);
  document.addEventListener("click", (e) => { if (e.target.closest("[data-reference-info]")) openInfo(ppg()); });
  return { viewItems: () => [[isRefShown() ? "✓ Reference" : "   Reference", () => { toggleRefImage(); refresh(); }], ["Reference opacity…", () => { const v = prompt("Reference opacity (0–1)", String(opacity)); if (v != null) setRefOpacity(v); }], ["Reference info", () => openInfo(ppg())]] };
}

export const getRefImage = () => (shown && dataUrl ? { dataUrl, cols: cols || mapSize().cols, rows: rows || mapSize().rows, opacity } : null);
