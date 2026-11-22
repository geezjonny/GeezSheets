import { watch } from "../rodeo-store.js";
import { put } from "./undo.js";
import { $, S } from "./state.js";
import { floatWindow, addBarButton, dropMenu, menuWindow } from "./ui.js";

const PX = 40;
let win = null, ready = false;

function css() {
  if (document.getElementById("images-style")) return;
  const s = document.createElement("style"); s.id = "images-style";
  s.textContent = `
    #win-image-add .image-form { display:grid; gap:.55rem; min-width:18rem; }
    #win-image-add .image-form label { display:flex; align-items:center; gap:.45rem; }
    #win-image-add .image-form label span { min-width:5rem; }
    #win-image-add .image-form input { box-sizing:border-box; width:100%; }
    #win-image-add .image-size { display:grid; grid-template-columns:1fr 1fr; gap:.45rem; }
    #win-image-add .image-preview { display:block; width:100%; max-height:12rem; object-fit:contain; background:var(--leather-dk); border:1px solid var(--brass); }
    #win-image-add .image-error { min-height:1.1em; color:#a94c3d; }
    #win-image-add .image-actions { display:flex; justify-content:flex-end; gap:.5rem; }
  `;
  document.head.append(s);
}

function layer() { return $("#images"); }
function mapSvg() { return $("#map"); }
function idFor() { return "img" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function number(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }

function render(v) {
  S.map.images = v || {};
  const g = layer(); if (!g) return;
  g.replaceChildren();
  for (const [id, a] of Object.entries(S.map.images)) {
    if (!a?.url) continue;
    const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
    image.setAttribute("href", a.url); image.setAttribute("preserveAspectRatio", "none");
    image.setAttribute("x", number(a.x)); image.setAttribute("y", number(a.y));
    image.setAttribute("width", Math.max(0, number(a.w))); image.setAttribute("height", Math.max(0, number(a.h)));
    image.setAttribute("opacity", Math.max(0, Math.min(1, number(a.op, 1))));
    image.dataset.id = id; image.style.pointerEvents = "none"; g.append(image);
  }
}

function openForm() {
  if (!win) {
    win = floatWindow({ id: "image-add", title: "Add Image", x: 300, y: 160 });
    win.body.innerHTML = `<form class="image-form">
      <label><span>URL</span><input name="url" type="text" placeholder="images/map.png" autocomplete="off"></label>
      <div class="image-size"><label><span>Width</span><input name="w" type="number" min="1" step="1" value="1"></label>
      <label><span>Height</span><input name="h" type="number" min="1" step="1" value="1"></label></div>
      <img class="image-preview" alt="Image preview" hidden>
      <div class="image-error" aria-live="polite"></div>
      <div class="image-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Add</button></div>
    </form>`;
    const form = win.body.querySelector("form"), url = form.url, w = form.w, h = form.h, preview = form.querySelector(".image-preview"), error = form.querySelector(".image-error");
    const load = () => {
      error.textContent = ""; const img = new Image(); img.onload = () => {
        const cells = Math.min(20, Math.max(1, Math.round(img.naturalWidth / (img.naturalWidth > 1600 ? 80 : 40))));
        w.value = cells; h.value = Math.max(1, Math.round(cells * img.naturalHeight / img.naturalWidth));
      }; img.onerror = () => { error.textContent = "Could not load that image."; }; img.src = url.value.trim();
      preview.src = img.src; preview.hidden = !img.src;
    };
    url.addEventListener("change", load); url.addEventListener("input", () => { preview.src = url.value.trim(); preview.hidden = !url.value.trim(); });
    form.querySelector("[data-cancel]").addEventListener("click", () => win.hide());
    form.addEventListener("submit", (e) => {
      e.preventDefault(); const src = url.value.trim(), ww = number(w.value), hh = number(h.value);
      if (!src || ww <= 0 || hh <= 0 || !preview.naturalWidth) { error.textContent = "Enter a valid image URL and wait for its preview."; return; }
      const svg = mapSvg(), vb = svg?.viewBox?.baseVal || { x: 0, y: 0, width: 800, height: 560 }, pw = ww * PX, ph = hh * PX;
      put(`map/images/${idFor()}`, { url: src, x: vb.x + (vb.width - pw) / 2, y: vb.y + (vb.height - ph) / 2, w: pw, h: ph, op: 1 });
      form.reset(); preview.hidden = true; error.textContent = ""; win.hide();
    });
  }
  win.show(); win.body.querySelector(".image-error").textContent = "";
  win.body.querySelector("[name=url]").focus();
}

export function initImages() {
  if (ready) return; ready = true; css();
  watch("map/images", render);
  if (S.isGM) {
    const b = addBarButton({ id: "image", icon: "🖼", label: "Image", gmOnly: true, onClick: menuWindow("image", "Image", () => [["Add > URL…", openForm]]) });
    b.dataset.imageButton = "1";
  }
}

export function imageAt(p) {
  const entries = Object.entries(S.map.images || {});
  for (let i = entries.length - 1; i >= 0; i--) {
    const [id, a] = entries[i]; if (a && p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h) return id;
  }
  return null;
}

export function imageFields(id) {
  const a = S.map.images?.[id]; if (!a) return [];
  return ["x", "y", "w", "h"].map((key) => ({ label: key.toUpperCase() + " (cells)", key, value: number(a[key]) / PX, type: "number", min: key === "w" || key === "h" ? 1 : undefined, step: 1 }))
    .concat({ label: "Opacity", key: "op", value: number(a.op, 1), type: "number", min: 0, step: 0.05 });
}

export function applyImageField(id, key, value) {
  const a = S.map.images?.[id]; if (!a || !["x", "y", "w", "h", "op"].includes(key)) return;
  let v = number(value, a[key]); if (["x", "y", "w", "h"].includes(key)) v *= PX;
  if (key === "w" || key === "h") v = Math.max(PX, v); if (key === "op") v = Math.max(0, Math.min(1, v));
  put(`map/images/${id}/${key}`, v);
}

export function removeImage(id) { if (S.map.images?.[id]) put(`map/images/${id}`, null); }
