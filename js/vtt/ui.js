// Shared UI bits: draggable floating windows (VTT bar, initiative, dice...) and small drop menus.
// Window positions are remembered per id in localStorage.
import { $ } from "./state.js";

const KEY = (id) => `vtt-win-${id}`;
const load = (id) => { try { return JSON.parse(localStorage.getItem(KEY(id))); } catch { return null; } };
const save = (id, v) => { try { localStorage.setItem(KEY(id), JSON.stringify(v)); } catch { /* private mode: fine */ } };

const REG = new Set(), SNAP = 12;
const live = () => [...REG].filter((w) => w.el.isConnected && !w.el.hidden);
// the windows touching this one edge to edge (and the ones touching those, and so on)
function groupOf(self, alone) {
  if (alone) return [self];
  const seen = new Set([self]), q = [self], all = live();
  while (q.length) {
    const ra = q.pop().el.getBoundingClientRect();
    for (const b of all) {
      if (seen.has(b)) continue; const rb = b.el.getBoundingClientRect();
      const v = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top), h = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      if (((Math.abs(ra.right - rb.left) <= 1 || Math.abs(rb.right - ra.left) <= 1) && v > 8) || ((Math.abs(ra.bottom - rb.top) <= 1 || Math.abs(rb.bottom - ra.top) <= 1) && h > 8)) { seen.add(b); q.push(b); }
    }
  }
  return [...seen];
}
// nudge a drag so the group's edges land on another window's edge or the screen edge, when within SNAP px
function snapMove(group, dx, dy) {
  const others = live().filter((w) => !group.includes(w)).map((w) => w.el.getBoundingClientRect());
  others.push({ left: 0, top: 0, right: innerWidth, bottom: innerHeight, screen: true });
  let bx = null, by = null;
  for (const m of group) {
    const L = m.s.left + dx, R = m.s.right + dx, T = m.s.top + dy, B = m.s.bottom + dy;
    for (const o of others) {
      const nearY = T <= o.bottom + SNAP && B >= o.top - SNAP, nearX = L <= o.right + SNAP && R >= o.left - SNAP;
      if (nearY || o.screen) for (const [from, to] of o.screen ? [[L, 0], [R, innerWidth]] : [[L, o.right], [R, o.left], [L, o.left], [R, o.right]]) { const k = to - from; if (Math.abs(k) <= SNAP && (bx === null || Math.abs(k) < Math.abs(bx))) bx = k; }
      if (nearX || o.screen) for (const [from, to] of o.screen ? [[T, 0], [B, innerHeight]] : [[T, o.bottom], [B, o.top], [T, o.top], [B, o.bottom]]) { const k = to - from; if (Math.abs(k) <= SNAP && (by === null || Math.abs(k) < Math.abs(by))) by = k; }
    }
  }
  return { dx: dx + (bx || 0), dy: dy + (by || 0) };
}

// floatWindow({ id, title, x, y, closable }) -> { el, body, show(), hide(), toggle(), visible() }
// Drag it by its title strip. `body` is an empty div for the caller to fill.
export function floatWindow({ id, title, x = 20, y = 80, closable = true, hidden = false }) {
  const el = document.createElement("div"); el.className = "fwin"; el.id = "win-" + id; el.hidden = hidden;
  el.innerHTML = `<div class="fwin-bar"><span class="fwin-title"></span>${closable ? `<button class="fwin-x" title="Hide" aria-label="Hide">×</button>` : ""}</div><div class="fwin-body"></div>`;
  el.querySelector(".fwin-title").textContent = title;
  const body = el.querySelector(".fwin-body"), pos = load(id) || { x, y };
  const place = () => { el.style.left = Math.max(0, Math.min(innerWidth - 60, pos.x)) + "px"; el.style.top = Math.max(0, Math.min(innerHeight - 30, pos.y)) + "px"; };
  document.body.append(el); place();
  const entry = { el, pos, place, save: () => save(id, pos) }; REG.add(entry);
  const bar = el.querySelector(".fwin-bar"); let d = null;
  // Windows snap to each other's edges (and the screen's) while dragging, and windows left flush together move as one.
  // Hold Shift to drag just this window out of its group, Alt to drag without snapping.
  bar.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    d = { x: e.clientX, y: e.clientY, group: groupOf(entry, e.shiftKey) };
    for (const m of d.group) { const r = m.el.getBoundingClientRect(); m.s = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; m.p0 = { x: m.pos.x, y: m.pos.y }; }
    bar.setPointerCapture(e.pointerId); el.classList.add("drag");
  });
  bar.addEventListener("pointermove", (e) => {
    if (!d) return;
    const mv = e.altKey ? { dx: e.clientX - d.x, dy: e.clientY - d.y } : snapMove(d.group, e.clientX - d.x, e.clientY - d.y);
    for (const m of d.group) { m.pos.x = m.p0.x + mv.dx; m.pos.y = m.p0.y + mv.dy; m.place(); }
  });
  bar.addEventListener("pointerup", () => { if (!d) return; for (const m of d.group) m.save(); d = null; el.classList.remove("drag"); });
  el.querySelector(".fwin-x")?.addEventListener("click", () => { el.hidden = true; el.dispatchEvent(new Event("fwin-close")); });
  addEventListener("resize", place);
  return { el, body, show: () => (el.hidden = false), hide: () => (el.hidden = true), toggle: () => (el.hidden = !el.hidden), visible: () => !el.hidden };
}

// Bar buttons: features register them with addBarButton(). A button with quick:true lives in the always-visible
// "Tools" strip (a small floating window); every other button sits in a hidden store and is reached from a menu.
let storeEl = null, quickWin = null;
const barStore = () => { if (!storeEl) { storeEl = document.createElement("div"); storeEl.id = "barstore"; storeEl.hidden = true; document.body.append(storeEl); } return storeEl; };
// The Tools strip floats as a window; its x docks the same buttons (icons only) at the top right of the menu bar, and the
// small float button there brings the window back. The choice is remembered.
let dockEl = null, docked = (() => { try { return localStorage.getItem("vtt-tools-docked") === "1"; } catch { return false; } })();
function quickBar() {
  if (!quickWin) {
    quickWin = floatWindow({ id: "quick", title: "Tools", x: 14, y: 40, closable: true }); quickWin.body.className += " quickbar";
    quickWin.el.addEventListener("fwin-close", () => setDocked(true));
    if (docked) quickWin.hide();
  }
  return quickWin;
}
const quickHost = () => (docked ? toolsDock() : quickBar().body);
function toolsDock() {
  if (dockEl) return dockEl;
  dockEl = document.createElement("div"); dockEl.id = "toolsdock";
  const role = document.getElementById("role"); (role?.parentNode || document.querySelector("header") || document.body).insertBefore(dockEl, role || null);
  return dockEl;
}
function setDocked(on) {
  docked = on; try { localStorage.setItem("vtt-tools-docked", on ? "1" : "0"); } catch { /* private mode */ }
  const win = quickBar(), from = on ? win.body : toolsDock(), to = on ? toolsDock() : win.body;
  for (const b of [...from.querySelectorAll(".barbtn")]) to.append(b);
  dockEl?.querySelector(".undock")?.remove();
  if (on) { const u = document.createElement("button"); u.type = "button"; u.className = "undock"; u.textContent = "⇲"; u.title = "Float the tools"; u.addEventListener("click", () => setDocked(false)); dockEl.prepend(u); win.hide(); }
  else { win.show(); dockEl.hidden = true; }
  if (on) dockEl.hidden = false;
}
// addBarButton({ id, icon, label, title, onClick, gmOnly, toggle, quick }) -> button element. onClick gets (event, button).
export function addBarButton({ id, icon = "", label, title = label, onClick, gmOnly = false, toggle = false, quick = false }) {
  const b = document.createElement("button"); b.id = "bar-" + id; b.className = "barbtn"; b.title = title; b.type = "button";
  b.innerHTML = `<span class="ico">${icon}</span><span class="lbl"></span>`; b.querySelector(".lbl").textContent = label;
  if (gmOnly && !new URLSearchParams(location.search).has("gm")) b.hidden = true;
  b.addEventListener("click", (e) => { e.stopPropagation(); if (toggle) b.classList.toggle("on"); onClick?.(e, b); });
  (quick ? quickHost() : (storeEl || barStore())).append(b); if (quick && docked && !dockEl.querySelector(".undock")) setDocked(true); return b;
}
// Put the Tools strip buttons in a fixed order (features register them in whatever order they load).
export function orderQuickBar(ids) { const body = quickHost(); for (const id of ids) { const b = document.getElementById("bar-" + id); if (b && body.contains(b)) body.append(b); } }

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
