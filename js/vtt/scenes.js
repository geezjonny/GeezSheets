import { read, put, patch } from "../store.js";
import { S } from "./state.js";
import { floatWindow, addBarButton, dropMenu, menuWindow } from "./ui.js";

const STYLE_ID = "scene-style";
let saveWin = null, toastTimer = null;

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style"); style.id = STYLE_ID;
  style.textContent = `
    #toast.show { display: block; }
    #win-scene-save .scene-form { display: grid; gap: .55rem; min-width: 15rem; }
    #win-scene-save input { box-sizing: border-box; width: 100%; background: #1c1209; color: var(--paper); border: 1px solid var(--brass); border-radius: .3rem; padding: .35rem .45rem; font: inherit; }
    #win-scene-save .scene-actions { display: flex; justify-content: flex-end; gap: .45rem; }
  `;
  document.head.append(style);
}

function toast(message) {
  const el = document.querySelector("#toast"); if (!el) return;
  clearTimeout(toastTimer); el.textContent = message; el.classList.add("show");
  toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
}

function sceneId(name) {
  const id = name.trim().toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return id || "scene";
}

function makeSaveWindow() {
  if (saveWin) return saveWin;
  saveWin = floatWindow({ id: "scene-save", title: "Save Scene", x: 300, y: 160 });
  saveWin.body.innerHTML = `<form class="scene-form"><label>Scene name<input name="name" type="text" maxlength="80" required autocomplete="off"></label><div class="scene-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save</button></div></form>`;
  const form = saveWin.body.querySelector("form"), input = form.elements.name;
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); const name = input.value.trim(); if (!name) return input.focus();
    const id = sceneId(name), [map, objects, tokens, groups, initiative, mapimg, old] = await Promise.all([read("map"), read("objects"), read("tokens"), read("groups"), read("initiative"), read("mapimg"), read(`scenes/${id}`)]);
    const data = { map: map || {}, objects: objects || {}, tokens: tokens || {}, groups: groups || {}, initiative: initiative || null, mapimg: mapimg || null };   // map holds every floor; mapimg is the picture of each floor
    if (old?.data?.atmosphere) data.atmosphere = old.data.atmosphere;
    if (old?.data?.audio) data.audio = old.data.audio;
    await put(`scenes/${id}`, { name, ts: Date.now(), data });
    await put("scene", { id, name });
    saveWin.hide(); input.value = ""; toast(`Saved scene: ${name}`);
  });
  form.querySelector("[data-cancel]").addEventListener("click", () => saveWin.hide());
  return saveWin;
}

function openSave() {
  const win = makeSaveWindow(); win.show(); win.body.querySelector("input").focus();
}

async function loadScene(id, scene) {
  const data = scene?.data || {};
  await Promise.all([
    put("map", data.map || {}), put("objects", data.objects || {}),
    put("tokens", data.tokens || {}), put("groups", data.groups || {}), put("initiative", data.initiative || null), put("mapimg", data.mapimg || null), put("seeded", true),
  ]);
  if (data.atmosphere) await patch({ atmosphere: data.atmosphere });
  if (data.audio) await put("audio", { music: data.audio.music || null, ambience: data.audio.ambience || {}, sfx: {} });
  await put("scene", { id, name: scene.name || id });
  toast(`Loaded scene: ${scene.name || id}`);
}

async function duplicateScene(id, scene) {
  const name = `${scene.name || id} (copy)`, copyId = sceneId(name);
  await put(`scenes/${copyId}`, { ...scene, name, ts: Date.now() });
  toast(`Duplicated scene: ${name}`);
}

function deleteMenu(anchor, id, scene) {
  const name = scene.name || id;
  dropMenu(anchor, [[`Really delete ${name}?`, async () => { await put(`scenes/${id}`, null); toast(`Deleted scene: ${name}`); }], ["Cancel", null]]);
}

async function openLoad(anchor) {
  const scenes = await read("scenes") || {};
  const entries = Object.entries(scenes).filter(([, scene]) => scene && scene.data).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
  const items = [["Load replaces the current map", null], ...entries.map(([id, scene]) => [`Load: ${scene.name || id}`, () => loadScene(id, scene)]), ["Delete…", null], ...entries.map(([id, scene]) => [`Delete: ${scene.name || id}`, () => deleteMenu(anchor, id, scene)])];
  if (entries.length) items.splice(2 + entries.length, 0, ["Duplicate...", null], ...entries.map(([id, scene]) => [`Copy: ${scene.name || id}`, () => duplicateScene(id, scene)]));
  if (!entries.length) items.push(["No saved scenes", null]);
  dropMenu(anchor, items);
}

// New Scene: the current one is kept as "Before new scene <time>" (so Load brings it back), then everything starts empty.
function openNew(anchor) {
  dropMenu(anchor, [["Start a new empty scene?", null], ["Yes, new scene (current one is saved first)", async () => {
    const [map, objects, tokens, groups, initiative, mapimg] = await Promise.all(["map", "objects", "tokens", "groups", "initiative", "mapimg"].map((p) => read(p)));
    if (Object.keys(map?.walls || {}).length || Object.keys(map?.floors || {}).length || Object.keys(objects || {}).length || Object.keys(tokens || {}).length) {
      const name = `Before new scene ${new Date().toLocaleString()}`;
      await put(`scenes/${sceneId(name)}`, { name, ts: Date.now(), data: { map: map || {}, objects: objects || {}, tokens: tokens || {}, groups: groups || {}, initiative: initiative || null, mapimg: mapimg || null } });
    }
    await Promise.all(["map", "objects", "tokens", "groups", "initiative", "mapimg", "scene"].map((p) => put(p, null)));
    await put("seeded", true); toast("New scene");
  }], ["Cancel", null]]);
}

function openClear(anchor) {
  dropMenu(anchor, [["Clear everything?", null], ["Yes, clear", async () => {
    await Promise.all(["map", "objects", "tokens", "groups", "initiative"].map((path) => put(path, null)));
    await put("seeded", true); toast("Cleared everything");
  }], ["Cancel", null]]);
}

export function initScenes() {
  if (!S.isGM) return;
  installStyle();
  addBarButton({ id: "scene", icon: "🗺", label: "Scene", gmOnly: true, onClick: menuWindow("scene", "Scene", () => [
    ["New Scene…", (b) => openNew(b)], ["Save Scene…", openSave], ["Load Scene…", (b) => openLoad(b)], ["Clear", (b) => openClear(b)],
  ]) });
}
