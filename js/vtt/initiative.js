import { watch, read, put, patch } from "../store.js";
import { S } from "./state.js";
import { floatWindow } from "./ui.js";
import { buildInitiative } from "./initiative-rules.js";
import { tickEffects } from "./effects.js";
import { visibleToPlayer } from "./visibility.js";

let current = { turn: null, round: 1, order: {} };
let win = null, strip = null, footer = null, started = false;

const isGM = () => S.isGM;
const css = `
#win-init .fwin-body { padding: 8px 10px 7px; }
#win-init .init-strip { display: flex; align-items: flex-end; gap: 8px; min-height: 68px; white-space: nowrap; }
#win-init .init-portrait { position: relative; width: 52px; height: 52px; flex: 0 0 52px; border: 2px solid var(--brass); border-radius: 50%; background: var(--leather); color: var(--paper); display: grid; place-items: center; font: bold 18px Georgia, serif; cursor: default; transition: transform .12s, box-shadow .12s; }
#win-init .init-portrait.current { transform: scale(1.12); box-shadow: 0 0 0 3px var(--brass-lt), 0 0 12px var(--brass); z-index: 1; }
#win-init .init-badge { position: absolute; right: -5px; bottom: -4px; min-width: 18px; height: 18px; padding: 0 3px; border: 1px solid var(--brass-lt); border-radius: 9px; background: var(--leather-dk); color: var(--paper); font: bold 12px Georgia, serif; line-height: 16px; text-align: center; cursor: pointer; }
#win-init .init-remove { position: absolute; top: -7px; right: -7px; width: 18px; height: 18px; padding: 0; border: 1px solid var(--brass-lt); border-radius: 50%; background: var(--leather-dk); color: var(--paper); display: none; font: bold 14px/15px Georgia, serif; cursor: pointer; }
#win-init .init-portrait:hover .init-remove { display: block; }
#win-init .init-edit { position: absolute; right: -7px; bottom: -5px; width: 28px; height: 20px; padding: 0 2px; border: 1px solid var(--brass); border-radius: 4px; background: var(--paper); color: var(--ink); font: bold 12px Georgia, serif; text-align: center; }
#win-init .init-footer { display: flex; align-items: center; gap: 8px; margin-top: 8px; padding-top: 7px; border-top: 1px solid var(--brass); color: var(--paper); font: 14px Georgia, serif; }
#win-init .init-footer button { padding: 3px 8px; border: 1px solid var(--brass); border-radius: 3px; background: var(--leather-dk); color: var(--paper); font: 14px Georgia, serif; cursor: pointer; }
#win-init .init-footer button:hover, #win-init .init-badge:hover, #win-init .init-remove:hover { background: var(--leather); }
`;

function installCss() {
  if (document.getElementById("initiative-css")) return;
  const style = document.createElement("style"); style.id = "initiative-css"; style.textContent = css; document.head.append(style);
}

function entries() {
  return Object.entries(current.order || {})
    .filter(([id]) => S.tokens[id] && visibleToPlayer(S.tokens[id], Object.values(S.map.fog || {}), S.isGM, S.currentVisible, S.map.exploredEnabled !== false))
    .sort((a, b) => {
      const ai = a[1].init, bi = b[1].init;
      if (ai == null && bi != null) return 1;
      if (ai != null && bi == null) return -1;
      if (ai !== bi) return (bi ?? 0) - (ai ?? 0);
      return (a[1].n ?? 0) - (b[1].n ?? 0);
    });
}

function saveOrder(order) { return patch({ "initiative/order": order }); }

function editInit(id, badge) {
  if (!isGM() || badge.querySelector("input")) return;
  const input = document.createElement("input"); input.className = "init-edit"; input.type = "number"; input.step = "1";
  input.value = current.order[id]?.init ?? ""; badge.replaceChildren(input); input.focus(); input.select();
  let done = false;
  const save = () => {
    if (done) return; done = true;
    const raw = input.value.trim(), value = raw === "" ? null : Number(raw);
    if (raw === "" || Number.isFinite(value)) patch({ [`initiative/order/${id}/init`]: raw === "" ? null : Math.trunc(value) });
    else render();
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") { done = true; render(); } });
  input.addEventListener("blur", save);
}

function render() {
  if (!win) return;
  const list = entries();
  win.el.hidden = !list.length;
  strip.replaceChildren();
  for (const [id, data] of list) {
    const token = S.tokens[id], portrait = document.createElement("div"); portrait.className = "init-portrait";
    if (id === current.turn) portrait.classList.add("current");
    portrait.title = token.label || id;
    if (token.img) portrait.style.background = `center / cover no-repeat url("${String(token.img).replaceAll('"', '%22')}")`;
    else { portrait.style.background = token.color || "#756044"; portrait.textContent = (token.label || id).trim().slice(0, 2).toUpperCase(); }
    const badge = document.createElement("button"); badge.type = "button"; badge.className = "init-badge"; badge.textContent = data.init ?? "—";
    if (isGM()) badge.addEventListener("click", (e) => { e.stopPropagation(); editInit(id, badge); });
    portrait.append(badge);
    if (isGM()) { const remove = document.createElement("button"); remove.type = "button"; remove.className = "init-remove"; remove.textContent = "×"; remove.title = "Remove"; remove.addEventListener("click", (e) => { e.stopPropagation(); removeFromInitiative(id); }); portrait.append(remove); }
    strip.append(portrait);
  }
  footer.querySelector(".init-round").textContent = `Round ${current.round || 1}`;
  footer.querySelector(".init-gm").hidden = !isGM();
}

async function cleanMissing() {
  if (!isGM()) return;
  const order = { ...(current.order || {}) }; let changed = false;
  for (const id of Object.keys(order)) if (!S.tokens[id]) { delete order[id]; changed = true; }
  if (changed) await saveOrder(order);
}

export function inInitiative(tokenId) { return !!current.order?.[tokenId]; }

export async function addToInitiative(tokenId) {
  if (!isGM() || inInitiative(tokenId)) return;
  const fresh = (await read("initiative")) || current, order = { ...(fresh.order || {}) };
  if (order[tokenId]) return;
  const n = Object.values(order).reduce((max, item) => Math.max(max, Number(item?.n) || 0), 0) + 1;
  await patch({ "initiative/order": { ...order, [tokenId]: { init: null, n } }, "initiative/round": fresh.round || 1, "initiative/turn": fresh.turn ?? null });
}

export async function removeFromInitiative(tokenId) {
  if (!isGM() || !inInitiative(tokenId)) return;
  const order = { ...(current.order || {}) }; delete order[tokenId];
  await saveOrder(order);
  if (current.turn === tokenId) await patch({ "initiative/turn": null });
}

export async function nextTurn() {
  if (!isGM()) return;
  const list = entries().map(([id]) => id); if (!list.length) return;
  const index = current.turn == null ? -1 : list.indexOf(current.turn), next = (index + 1) % list.length;
  const round = (current.round || 1) + (index >= 0 && next === 0 ? 1 : 0), changes = { "initiative/turn": list[next], "initiative/round": round };
  if (round !== (current.round || 1)) {
    const tick = tickEffects(S.tokens, round);
    for (const [id, effects] of Object.entries(tick.changes)) changes[`tokens/${id}/effects`] = effects.length ? effects : null;
    if (tick.expired.length) changes["events/last"] = { t: Date.now(), text: `Expired: ${tick.expired.map((x) => `${x.name} (${S.tokens[x.tokenId]?.label || x.tokenId})`).join(", ")}` };
  }
  await patch(changes);
}

// Start combat: everyone on the map joins, each rolls a d20 (unless already numbered), and the highest goes first.
export async function startInitiative(mode = "all") {
  if (!isGM()) return;
  const fresh = (await read("initiative")) || {}, r = new Uint32Array(1);
  const { order, first } = buildInitiative(S.tokens, fresh.order, mode, () => { crypto.getRandomValues(r); return (r[0] % 20) + 1; });
  await patch({ "initiative/order": order, "initiative/round": 1, "initiative/turn": first });
}

export const endInitiative = () => isGM() && put("initiative", null);

export function initInitiative() {
  if (started) return; started = true; installCss();
  win = floatWindow({ id: "init", title: "Initiative", x: 80, y: 62, closable: false, hidden: true });
  strip = document.createElement("div"); strip.className = "init-strip";
  footer = document.createElement("div"); footer.className = "init-footer";
  const gm = document.createElement("span"); gm.className = "init-gm";
  const next = document.createElement("button"); next.type = "button"; next.textContent = "Next ▶"; next.addEventListener("click", nextTurn);
  const end = document.createElement("button"); end.type = "button"; end.textContent = "End"; end.addEventListener("click", () => isGM() && put("initiative", null));
  const start = (label, mode, title) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.title = title; b.addEventListener("click", () => startInitiative(mode)); return b; };
  gm.append(start("Roll for all", "all", "Add every map token and roll a d20 for tokens without a number"), start("Roll for NPCs only", "npcs", "Add every map token; leave PCs without a number for player rolls"), start("No rolls", "none", "Add every map token without rolling"), next, end);
  const round = document.createElement("span"); round.className = "init-round"; footer.append(gm, round);
  win.body.append(strip, footer);
  watch("initiative", (value) => { S.combat = value?.turn != null; current = { turn: value?.turn ?? null, round: value?.round || 1, order: value?.order || {} }; S.round = current.round; if (S.turn !== current.turn) { S.turn = current.turn; document.dispatchEvent(new Event("turnchanged")); } render(); cleanMissing(); });
  watch("tokens", (value) => { if (value) S.tokens = value; render(); cleanMissing(); });
  document.addEventListener("tokenschanged", render);
  document.addEventListener("vttvisibilitychange", render);
}
