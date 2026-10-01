// vtt-initiative.js — shared initiative tracker.
// Data lives at vtt/initiative (new path, so the old pages' initiative data is untouched):
//   { round, currentId, entries: { <tokenId>: { name, init, type, characterId?, dex? } } }
// Order is sorted on read, so a player only ever writes entries/<theirToken>/init.
import { ref, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

export const INIT_PATH = "vtt/initiative";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const d20 = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return (a[0] % 20) + 1; };
const modOf = (s) => Math.floor((Number(s) - 10) / 2);
const has = (v) => v !== undefined && v !== null && v !== "";

// ctx: { tokens(), pcs(), npcs(), myCharId(), log(html), focusToken(id), rollMine(), changed() }
export function createInitiative({ db, el, gm, ctx }) {
  let state = { round: 0, currentId: null, entries: {} };
  let lastKey = "", pending = false;

  const sorted = () => Object.entries(state.entries)
    .map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => ((has(b.init) ? +b.init : -1e9) - (has(a.init) ? +a.init : -1e9)) || ((b.dex || 0) - (a.dex || 0)) || String(a.name).localeCompare(String(b.name)));

  onValue(ref(db, INIT_PATH), snap => {
    const v = snap.val() || {};
    state = { round: v.round || 0, currentId: v.currentId || null, entries: v.entries || {} };
    const key = `${state.round}:${state.currentId}`;
    const cur = state.entries[state.currentId];
    if (state.round && cur && key !== lastKey) ctx.log(`Round ${state.round}: <strong>${esc(label({ id: state.currentId, ...cur }))}</strong>'s turn`);
    lastKey = key;
    render();
    ctx.changed?.();
  });

  function label(e) {
    const t = ctx.tokens()[e.id];
    return !gm && t?.hideName ? "Unknown" : (t?.name || e.name);
  }

  function addMapTokens() {
    const npcs = Object.values(ctx.npcs() || {}), pcs = ctx.pcs() || {};
    const patch = {};
    for (const [id, t] of Object.entries(ctx.tokens())) {
      if (state.entries[id] || (t.floor || 0) !== 0) continue;
      if (t.type === "pc" || t.characterId) {
        const c = pcs[t.characterId];
        patch[id] = { name: t.name || c?.name || "PC", type: "pc", characterId: t.characterId || "", dex: Number(c?.stats?.dex) || 10 };
      } else {
        const stat = npcs.find(n => (t.npcId && n?.key === t.npcId) || n?.name === (t.lookupName || t.name));
        const dex = Number(stat?.stats?.dex) || 10;
        patch[id] = { name: t.name || "NPC", type: t.type || "npc", dex, init: d20() + modOf(dex) };
      }
    }
    if (!Object.keys(patch).length) { ctx.log("Everyone on this map is already in initiative"); return; }
    update(ref(db, `${INIT_PATH}/entries`), patch);
    ctx.log(`Added ${Object.keys(patch).length} to initiative (NPCs rolled, players roll their own)`);
  }
  function step(dir) {
    const list = sorted();
    if (!list.length) return;
    if (!state.round) { update(ref(db, INIT_PATH), { round: 1, currentId: list[0].id }); return; }
    let i = list.findIndex(e => e.id === state.currentId), round = state.round;
    i += dir;
    if (i >= list.length) { i = 0; round++; }
    if (i < 0) { if (round > 1) { i = list.length - 1; round--; } else i = 0; }
    update(ref(db, INIT_PATH), { round, currentId: list[i].id });
  }
  function rollFor(id) {
    const e = state.entries[id]; if (!e) return;
    const c = ctx.pcs()?.[e.characterId];
    const bonus = c ? Number(c.combat?.initiative_bonus) || 0 : modOf(e.dex || 10);
    set(ref(db, `${INIT_PATH}/entries/${id}/init`), d20() + bonus);
  }

  function render() {
    if (el.contains(document.activeElement) && document.activeElement.tagName === "INPUT") { pending = true; return; }
    pending = false;
    const tokens = ctx.tokens(), me = ctx.myCharId();
    const list = sorted().filter(e => gm || !tokens[e.id]?.hidden);
    const mine = !gm && list.find(e => e.characterId && e.characterId === me);
    el.innerHTML = `
      <div class="flex-row"><span class="muted">${state.round ? `Round ${state.round}` : list.length ? "Not started" : "No one in initiative"}</span>
        ${gm ? `<button data-a="clear" class="x" title="End combat and clear the list" ${list.length ? "" : "disabled"}>Clear</button>` : ""}</div>
      ${gm ? `<div class="grid-3"><button data-a="add" title="Add every token on this map">+ Map</button><button data-a="prev" ${state.round ? "" : "disabled"}>◀ Prev</button><button data-a="next" class="primary" ${list.length ? "" : "disabled"}>${state.round ? "Next ▶" : "Start"}</button></div>` : ""}
      ${mine && !has(mine.init) ? `<button data-a="mine" class="primary">Roll my initiative</button>` : ""}
      ${list.map(e => `<div class="init-row ${e.id === state.currentId && state.round ? "cur" : ""}" data-id="${esc(e.id)}">
          ${gm ? `<input type="number" data-edit value="${has(e.init) ? esc(e.init) : ""}" placeholder="–">` : `<span class="n">${has(e.init) ? esc(e.init) : "–"}</span>`}
          <span class="nm" data-focus title="Show on map">${esc(label(e))}${tokens[e.id]?.hidden ? ' <span class="muted">(hidden)</span>' : ""}</span>
          ${gm && !has(e.init) ? `<button data-roll title="Roll for them">🎲</button>` : ""}
          ${gm ? `<button data-del title="Remove">✕</button>` : ""}
        </div>`).join("")}`;
    el.querySelectorAll("[data-a]").forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === "add") addMapTokens();
      if (a === "next") step(1);
      if (a === "prev") step(-1);
      if (a === "mine") ctx.rollMine();
      if (a === "clear" && confirm("End combat and clear initiative?")) set(ref(db, INIT_PATH), null);
    });
    el.querySelectorAll(".init-row").forEach(row => {
      const id = row.dataset.id;
      row.querySelector("[data-focus]").onclick = () => ctx.focusToken(id);
      const ed = row.querySelector("[data-edit]");
      if (ed) ed.onchange = () => set(ref(db, `${INIT_PATH}/entries/${id}/init`), ed.value === "" ? null : Number(ed.value));
      const rb = row.querySelector("[data-roll]"); if (rb) rb.onclick = () => rollFor(id);
      const del = row.querySelector("[data-del]");
      if (del) del.onclick = () => {
        if (id === state.currentId && state.round) step(1);
        remove(ref(db, `${INIT_PATH}/entries/${id}`));
      };
    });
  }
  el.addEventListener("focusout", () => setTimeout(() => { if (pending) render(); }, 0));

  return {
    render,
    currentId: () => (state.round ? state.currentId : null),
    // Called when a player's own "Initiative" roll lands
    setInitFor(charId, total) {
      const id = Object.keys(state.entries).find(k => state.entries[k].characterId === charId);
      if (id) set(ref(db, `${INIT_PATH}/entries/${id}/init`), total);
      return !!id;
    }
  };
}
