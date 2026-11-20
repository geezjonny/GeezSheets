import { watch, read, put, patch } from "../store.js";
import { S } from "./state.js";
import { floatWindow, addBarButton } from "./ui.js";
import { createDiceTray3D } from "./dice3d.js";
import { play } from "./fx/fx.js";

let win, pool = [], modInput, nameInput, chips, history, rollButton, clearButton;
let lastReady = false, seen = new Set(), historyItems = {};

const css = () => {
  if (document.getElementById("dice-style")) return;
  const s = document.createElement("style"); s.id = "dice-style";
  s.textContent = `.dice-controls{display:flex;flex-wrap:wrap;gap:4px}.dice-controls button{min-width:38px}.dice-row{display:flex;align-items:center;gap:5px;margin:5px 0}.dice-row input{width:5em}.dice-pool{min-height:24px;display:flex;flex-wrap:wrap;gap:4px}.dice-chip{padding:2px 5px;border:1px solid var(--brass);border-radius:10px;background:#0003;font-size:12px}.dice-chip button{padding:0 2px!important;border:0!important;background:none!important}.dice-history{border-top:1px solid #b98f4566;margin-top:7px;padding-top:5px;max-height:180px;overflow:auto;font-size:12px}.dice-history div{margin:4px 0}.dice-name{width:7em!important}.dice-total{position:fixed;z-index:7;pointer-events:none;color:var(--brass-lt);font:bold 42px Georgia,serif;text-shadow:3px 3px 0 var(--ink),0 0 12px #000;transform:translate(-50%,-50%);white-space:nowrap}`;
  document.head.append(s);
};

const uid = () => { const a = new Uint32Array(3); crypto.getRandomValues(a); return `${Date.now().toString(36)}-${a[0].toString(36)}${a[1].toString(36)}${a[2].toString(36)}`; };
const safeName = () => nameInput?.value.trim() || (S.isGM ? "GM" : "Player");
const fmt = (r) => {   // "1d20 + 2d6 + 2"
  const by = new Map(); for (const d of r.dice) by.set(d.sides, (by.get(d.sides) || 0) + 1);
  return [...by].map(([s, n]) => `${n}d${s}`).join(" + ") + (r.mod > 0 ? ` + ${r.mod}` : r.mod < 0 ? ` - ${-r.mod}` : "");
};

function renderPool() {
  chips.replaceChildren();
  const groups = []; for (const sides of pool) { const g = groups.find((x) => x.sides === sides); if (g) g.n++; else groups.push({ sides, n: 1 }); }
  for (const g of groups) {
    const c = document.createElement("span"); c.className = "dice-chip"; c.textContent = `${g.n}d${g.sides} `;
    const b = document.createElement("button"); b.type = "button"; b.textContent = "−"; b.title = "Remove one die";
    b.onclick = () => { pool.splice(pool.indexOf(g.sides), 1); renderPool(); }; c.append(b); chips.append(c);
  }
}
function renderHistory() {
  history.replaceChildren();
  Object.values(historyItems).sort((a, b) => b.ts - a.ts).slice(0, 8).forEach((r) => {
    const line = document.createElement("div");
    line.textContent = `${r.by || "Player"} rolled ${r.sub || fmt(r)} = ${r.total}${r.sub ? "" : ` (${r.dice.map((d) => d.result).join(", ")})`}`; history.append(line);
  });
}

async function persistRoll(r) {
  await put("rolls/last", r); await put(`rolls/log/${r.id}`, r);
  const log = (await read("rolls/log")) || {}, rows = Object.values(log).sort((a, b) => b.ts - a.ts);
  const old = rows.slice(20).map((x) => `rolls/log/${x.id}`); if (old.length) await patch(Object.fromEntries(old.map((p) => [p, null])));
}
// `adjust` (optional): fn(diceResults) -> { total, sub, by } overriding the plain sum (advantage, extra dice, sheet modifiers).
export async function rollDice(list, modifier = 0, adjust = null) {
  if (!list?.length) return null;
  const diceResults = [], random = new Uint32Array(list.length);
  crypto.getRandomValues(random);
  list.forEach((sides, i) => diceResults.push({ sides: Number(sides), result: random[i] % Number(sides) + 1 }));
  const mod = Number(modifier) || 0, r = { id: uid(), by: safeName(), dice: diceResults, mod, total: diceResults.reduce((a, d) => a + d.result, 0) + mod, ts: Date.now(), ...(adjust ? adjust(diceResults) : {}) };
  historyItems[r.id] = r; renderHistory(); await persistRoll(r); return r;
}
function rollFromWindow() { const m = Number(modInput.value) || 0; rollDice(pool, m); }

let tray = null, trayHost = null, clearTimer = 0;
const PALETTE = ["#8b1e2b", "#1f5f8b", "#2f7a46", "#7a4a9a", "#a2661c", "#2a7a7a"];
const colorFor = (name) => PALETTE[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];   // each roller gets a steady dice colour
// The physics tray (dice3d.js, from GeezSheets) rolls real dice over a transparent full-screen overlay, so it shows on the 2D map and the 3D view alike.
async function animateRoll(r) {
  try {
    if (!tray) { trayHost = document.createElement("div"); trayHost.style.cssText = "position:fixed;inset:0;z-index:6;pointer-events:none"; document.body.append(trayHost); tray = await createDiceTray3D(trayHost); }
    clearTimeout(clearTimer); tray.clear(); play("dice-roll");
    tray.throwGroup([{ dice: r.dice.map((d) => ({ s: d.sides, v: d.result })), color: colorFor(r.by), label: r.by, total: r.total, sub: r.sub || fmt(r) }]);
    clearTimer = setTimeout(() => { tray?.destroy(); tray = null; trayHost?.remove(); }, 9000);   // free the WebGL context when idle
  } catch (err) { console.warn("Dice tray unavailable", err); tray?.destroy?.(); tray = null; trayHost?.remove(); }
}
function initWindow() {
  win = floatWindow({ id: "dice", title: "Dice", x: 80, y: 200, hidden: true });
  win.body.innerHTML = `<div class="dice-controls">${[4, 6, 8, 10, 12, 20].map((n) => `<button type="button" data-die="${n}">d${n}</button>`).join("")}</div><div class="dice-pool"></div><div class="dice-row"><label>Name <input class="dice-name" maxlength="20"></label><label>Mod <input class="dice-mod" type="number" value="0"></label></div><div class="dice-row"><button class="dice-roll" type="button">Roll</button><button class="dice-clear" type="button">Clear</button></div><div class="dice-history"></div>`;
  chips = win.body.querySelector(".dice-pool"); history = win.body.querySelector(".dice-history"); modInput = win.body.querySelector(".dice-mod"); nameInput = win.body.querySelector(".dice-name"); rollButton = win.body.querySelector(".dice-roll"); clearButton = win.body.querySelector(".dice-clear");
  try { nameInput.value = localStorage.getItem("vtt-name") || ""; } catch {}
  nameInput.onchange = () => { try { localStorage.setItem("vtt-name", nameInput.value.trim()); } catch {} };
  win.body.querySelectorAll("[data-die]").forEach((b) => b.onclick = () => { pool.push(Number(b.dataset.die)); renderPool(); }); rollButton.onclick = rollFromWindow; clearButton.onclick = () => { pool = []; modInput.value = 0; renderPool(); };
}
export function initDice() {
  css(); if (!win) initWindow(); const db = addBarButton({ quick: true, id: "dice", icon: "🎲", label: "Dice", title: "Dice", toggle: true, onClick: () => win.toggle() }); win.el.addEventListener("fwin-close", () => db.classList.remove("on"));
  watch("rolls/log", (v) => { historyItems = v || {}; renderHistory(); });
  watch("rolls/last", (r) => { if (!lastReady) { lastReady = true; return; } if (!r || seen.has(r.id) || Date.now() - r.ts > 15000) return; seen.add(r.id); historyItems[r.id] = r; renderHistory(); animateRoll(r); });
}
