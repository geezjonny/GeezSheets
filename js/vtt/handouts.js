import { watch, put } from "../store.js";
import { S } from "./state.js";
import { floatWindow, addBarButton, dropMenu, menuWindow } from "./ui.js";

const STYLE_ID = "handouts-style";
const SEEN_KEY = "vtt-handouts-seen";
const pageLoaded = Date.now();
let handouts = {}, initialSnapshot = true, postWin = null, uploadWin = null, button = null, stagger = 0;

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style"); style.id = STYLE_ID;
  style.textContent = `
    #win-handout-post .handout-form { display:grid; gap:.5rem; min-width:18rem; }
    #win-handout-post label { display:grid; gap:.2rem; }
    #win-handout-post input { box-sizing:border-box; width:100%; background:var(--leather-dk); color:var(--paper); border:1px solid var(--brass); border-radius:4px; padding:.35rem; font:inherit; }
    #win-handout-post .handout-actions { display:flex; justify-content:flex-end; gap:.4rem; }
    .handout-image { display:block; max-width:70vw; max-height:70vh; width:auto; height:auto; object-fit:contain; background:var(--leather-dk); }
    #win-handout-post [data-status] { color:var(--brass-lt); font-size:12px; min-height:1em; }
  `;
  document.head.append(style);
}

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { return new Set(); }
}
function saveSeen(seen) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-300))); } catch {}
}
const seen = loadSeen();
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const author = () => S.isGM ? "GM" : "Player";

function showHandout(id, handout) {
  const win = floatWindow({ id: `handout-${id}`, title: handout.title || "Handout", x: 80 + (stagger++ % 5) * 35, y: 110 + (stagger % 5) * 30, closable: true });
  const image = document.createElement("img"); image.className = "handout-image"; image.src = handout.url; image.alt = handout.title || "Handout";
  image.addEventListener("error", () => { image.alt = "Unable to load handout image"; });
  win.body.replaceChildren(image); win.show();
}

function markSeen(id) { seen.add(id); saveSeen(seen); }
function publish(url, title) {
  const id = uid(); return put(`handouts/${id}`, { url, title: title.trim() || "Handout", by: author(), ts: Date.now() });
}

function makePostWindow() {
  if (postWin) return postWin;
  postWin = floatWindow({ id: "handout-post", title: "Post Handout", x: 250, y: 150, hidden: true });
  postWin.body.innerHTML = `<form class="handout-form"><label>Image URL<input name="url" type="url" required placeholder="https://..."></label><label>Title (optional)<input name="title" maxlength="80"></label><div data-status></div><div class="handout-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Post</button></div></form>`;
  const form = postWin.body.querySelector("form"), status = form.querySelector("[data-status]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const url = form.elements.url.value.trim(); if (!url) return;
    status.textContent = "Posting…";
    try { await publish(url, form.elements.title.value); form.reset(); postWin.hide(); } catch (error) { status.textContent = "Could not post handout."; console.warn(error); }
  });
  form.querySelector("[data-cancel]").onclick = () => postWin.hide();
  return postWin;
}

function openUrlPrompt() { const win = makePostWindow(); win.show(); win.body.querySelector("input").focus(); }

function imageData(file) {
  return new Promise((resolve, reject) => {
    const image = new Image(), source = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(source); const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      const finish = (quality) => canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Image encoding failed"));
        if (blob.size <= 300000) { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }
        else if (quality <= .35) { canvas.width = Math.max(1, Math.round(canvas.width * .8)); canvas.height = Math.max(1, Math.round(canvas.height * .8)); canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height); finish(.8); }
        else finish(Math.max(.35, quality - .1));
      }, "image/jpeg", quality);
      finish(.8);
    };
    image.onerror = () => { URL.revokeObjectURL(source); reject(new Error("Image could not be read")); };
    image.src = source;
  });
}

function openUpload() {
  if (!uploadWin) uploadWin = floatWindow({ id: "handout-upload", title: "Upload Handout", x: 280, y: 180, hidden: true });
  const win = uploadWin; win.body.innerHTML = `<form class="handout-form"><label>Image file<input name="file" type="file" accept="image/*" required></label><label>Title (optional)<input name="title" maxlength="80"></label><div data-status></div><div class="handout-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Post</button></div></form>`;
  const form = win.body.querySelector("form"), status = form.querySelector("[data-status]");
  form.onsubmit = async (event) => {
    event.preventDefault(); const file = form.elements.file.files[0]; if (!file) return;
    status.textContent = "Preparing image…";
    try { await publish(await imageData(file), form.elements.title.value || file.name.replace(/\.[^.]+$/, "")); win.hide(); } catch (error) { status.textContent = "Could not encode image."; console.warn(error); }
  };
  form.querySelector("[data-cancel]").onclick = () => win.hide(); win.show(); form.elements.file.focus();
}

function openRecent() {
  const recent = Object.entries(handouts).filter(([, h]) => h?.url).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0)).slice(0, 6);
  const items = [["Recent handouts", null]];
  if (!recent.length) items.push(["No handouts posted", null]);
  for (const [id, h] of recent) {
    items.push([`Post again: ${h.title || "Handout"}`, () => publish(h.url, h.title || "Handout")]);
    if (S.isGM) items.push([`Remove: ${h.title || "Handout"}`, () => put(`handouts/${id}`, null)]);
  }
  dropMenu(button, items);
}

export function initHandouts() {
  installStyle();
  if (S.isGM) {
    button = addBarButton({ id: "handouts", icon: "📜", label: "Handouts", gmOnly: true, onClick: menuWindow("handouts", "Handouts", () => [["Paste image URL…", openUrlPrompt], ["Upload image…", openUpload], ["Recent…", openRecent]]) });
  }
  watch("handouts", (value) => {
    handouts = value || {};
    if (initialSnapshot) { Object.keys(handouts).forEach(markSeen); initialSnapshot = false; return; }
    for (const [id, handout] of Object.entries(handouts)) {
      if (!handout || seen.has(id) || !handout.ts || handout.ts < pageLoaded || Date.now() - handout.ts > 15000) continue;
      markSeen(id); showHandout(id, handout);
    }
  });
}
