// Shared UI bits: draggable floating windows (VTT bar, initiative, dice...) and small drop menus.
// Window positions are remembered per id in localStorage.
import { $ } from "./state.js";

const KEY = (id) => `vtt-win-${id}`;
const load = (id) => { try { return JSON.parse(localStorage.getItem(KEY(id))); } catch { return null; } };
const save = (id, v) => { try { localStorage.setItem(KEY(id), JSON.stringify(v)); } catch { /* private mode: fine */ } };

// floatWindow({ id, title, x, y, closable }) -> { el, body, show(), hide(), toggle(), visible() }
// Drag it by its title strip. `body` is an empty div for the caller to fill.
export function floatWindow({ id, title, x = 20, y = 80, closable = true, hidden = false }) {
  const el = document.createElement("div"); el.className = "fwin"; el.id = "win-" + id; el.hidden = hidden;
  el.innerHTML = `<div class="fwin-bar"><span class="fwin-title"></span>${closable ? `<button class="fwin-x" title="Hide" aria-label="Hide">×</button>` : ""}</div><div class="fwin-body"></div>`;
  el.querySelector(".fwin-title").textContent = title;
  const body = el.querySelector(".fwin-body"), pos = load(id) || { x, y };
  const place = () => { el.style.left = Math.max(0, Math.min(innerWidth - 60, pos.x)) + "px"; el.style.top = Math.max(0, Math.min(innerHeight - 30, pos.y)) + "px"; };
  document.body.append(el); place();
  const bar = el.querySelector(".fwin-bar"); let d = null;
  bar.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; d = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; bar.setPointerCapture(e.pointerId); el.classList.add("drag"); });
  bar.addEventListener("pointermove", (e) => { if (!d) return; pos.x = e.clientX - d.dx; pos.y = e.clientY - d.dy; place(); });
  bar.addEventListener("pointerup", () => { if (!d) return; d = null; el.classList.remove("drag"); save(id, pos); });
  el.querySelector(".fwin-x")?.addEventListener("click", () => { el.hidden = true; el.dispatchEvent(new Event("fwin-close")); });
  addEventListener("resize", place);
  return { el, body, show: () => (el.hidden = false), hide: () => (el.hidden = true), toggle: () => (el.hidden = !el.hidden), visible: () => !el.hidden };
}

// Bar buttons: features register them with addBarButton(). A button with quick:true lives in the always-visible
// "Tools" strip (a small floating window); every other button sits in a hidden store and is reached from a menu.
let storeEl = null, quickWin = null;
const barStore = () => { if (!storeEl) { storeEl = document.createElement("div"); storeEl.id = "barstore"; storeEl.hidden = true; document.body.append(storeEl); } return storeEl; };
function quickBar() {
  if (!quickWin) { quickWin = floatWindow({ id: "quick", title: "Tools", x: 14, y: 40, closable: false }); quickWin.body.className += " quickbar"; }
  return quickWin;
}
// addBarButton({ id, icon, label, title, onClick, gmOnly, toggle, quick }) -> button element. onClick gets (event, button).
export function addBarButton({ id, icon = "", label, title = label, onClick, gmOnly = false, toggle = false, quick = false }) {
  const b = document.createElement("button"); b.id = "bar-" + id; b.className = "barbtn"; b.title = title; b.type = "button";
  b.innerHTML = `<span class="ico">${icon}</span><span class="lbl"></span>`; b.querySelector(".lbl").textContent = label;
  if (gmOnly && !new URLSearchParams(location.search).has("gm")) b.hidden = true;
  b.addEventListener("click", (e) => { e.stopPropagation(); if (toggle) b.classList.toggle("on"); onClick?.(e, b); });
  (quick ? quickBar().body : (storeEl || barStore())).append(b); return b;
}
// Put the Tools strip buttons in a fixed order (features register them in whatever order they load).
export function orderQuickBar(ids) { const body = quickBar().body; for (const id of ids) { const b = document.getElementById("bar-" + id); if (b && body.contains(b)) body.append(b); } }

// menuWindow(id, title, getItems) -> click handler for a bar button: toggles a floating window of buttons instead of a dropdown.
// getItems() returns [[label, fn], ...] (null fn = heading); fn gets the clicked button so it can anchor a sub-menu.
let menuSlot = 0;
export function menuWindow(id, title, getItems) {
  let w = null;
  return () => {
    if (!w) { const n = menuSlot++; w = floatWindow({ id: "menu-" + id, title, x: 240 + 28 * n, y: 130 + 28 * n, hidden: true }); w.body.classList.add("menuwin"); }
    if (w.visible()) return w.hide();
    w.body.textContent = "";
    for (const [label, fn] of getItems()) {
      const b = document.createElement(fn ? "button" : "div"); b.textContent = label; b.type = "button";
      if (fn) b.addEventListener("click", () => fn(b)); else b.className = "dim"; w.body.append(b);
    }
    w.show();
  };
}

// dropMenu(anchorEl, [[label, fn], ...]) pops a small menu under an element; closes on pick or outside click.
// An item whose fn is null renders as a dim heading.
let openMenu = null;
export function dropMenu(anchor, items) {
  openMenu?.remove(); openMenu = null;
  const m = document.createElement("div"); m.className = "dropmenu"; m.dataset.anchor = anchor.id || ""; openMenu = m;
  for (const [label, fn] of items) {
    const b = document.createElement(fn ? "button" : "div"); b.textContent = label; if (fn) b.addEventListener("click", () => { m.remove(); openMenu = null; fn(); }); else b.className = "dim"; m.append(b);
  }
  document.body.append(m); const r = anchor.getBoundingClientRect();
  m.style.left = Math.min(r.left, innerWidth - m.offsetWidth - 8) + "px"; m.style.top = Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8) + "px";
  setTimeout(() => document.addEventListener("pointerdown", function once(e) { if (m.contains(e.target)) return; m.remove(); if (openMenu === m) openMenu = null; document.removeEventListener("pointerdown", once); }), 0);
  return m;
}
export { $ };

// ---- menu bar behaviour: one menu open at a time; once one is open, hovering another item switches to it ----
{
  const bar = document.getElementById("menubar");
  const DROPS = ["file-btn", "table-btn", "atmo-btn", "audio-btn", "view-btn"], MENUS = ["add", ...DROPS];
  const isOpen = (id) => id === "add" ? !document.getElementById("addmenu")?.hidden : openMenu?.dataset.anchor === id;
  const closeMenus = (except) => {
    if (except !== "add") { const m = document.getElementById("addmenu"); if (m) m.hidden = true; const s = document.getElementById("addsub"); if (s) s.hidden = true; }
    if (openMenu && openMenu.dataset.anchor !== except) { openMenu.remove(); openMenu = null; }
    for (const id of DROPS) if (id !== except) document.getElementById(id)?.classList.remove("on");
  };
  bar?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && MENUS.includes(b.id)) closeMenus(b.id); }, true);
  bar?.addEventListener("mouseover", (e) => {
    const b = e.target.closest("button"); if (!b || !MENUS.includes(b.id) || b.hidden || isOpen(b.id)) return;
    if (MENUS.some(isOpen)) b.click();
  });
  // File / Table / Atmosphere: GM menus whose items press the (hidden) bar buttons registered by each feature.
  const gm = new URLSearchParams(location.search).has("gm");
  const press = (label, id, check) => { const b = document.getElementById("bar-" + id); return b && !b.hidden ? [(check ? (b.classList.contains("on") ? "✓ " : "   ") : "") + label, () => b.click()] : null; };
  const toggleWin = (label, winId) => { const w = document.getElementById(winId); return w ? [label, () => { w.hidden = !w.hidden; }] : null; };
  const LAYOUT = {
    "file-btn": () => [press("Scene…", "scene"), press("Import / Export…", "dd2vtt"), ["Undo", () => import("./undo.js").then((m) => m.undo())], ["Redo", () => import("./undo.js").then((m) => m.redo())]],
    "table-btn": () => [toggleWin("Initiative", "win-init"), press("Roll Call", "rollcall"), press("Handouts", "handouts"), press("Images", "image")],
    "atmo-btn": () => [press("Time", "time", true), press("Weather", "weather", true)],
  };
  for (const [id, items] of Object.entries(LAYOUT)) {
    const btn = document.getElementById(id); if (!btn) continue; btn.hidden = !gm;
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); btn.classList.add("on"); dropMenu(btn, items().filter(Boolean));
      setTimeout(() => document.addEventListener("pointerdown", () => btn.classList.remove("on"), { once: true }), 0);
    });
  }
}
