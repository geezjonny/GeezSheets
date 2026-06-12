// Initiative — order, active turn, rolls
// State lives in RTDB initiative/

import { db } from "./firebase.js";
import { ref, set, update, remove } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { sendChat } from "./chat.js";

export async function rollInitiative(tokens, callerName) {
  const rolls = {};
  for (const [id, tok] of Object.entries(tokens)) {
    if (tok.type === "npc") rolls[id] = Math.ceil(Math.random() * 20);
  }
  await set(ref(db, "initiative"), { rolling: true, order: [], active: null, rolls, requestedAt: Date.now() });
  await sendChat("called for Initiative rolls!", callerName, "system");
}

export async function nextTurn(initiative, tokens, callerName) {
  if (!initiative.order.length) return;
  const idx  = initiative.order.indexOf(initiative.active);
  const next = initiative.order[(idx + 1) % initiative.order.length];
  await update(ref(db, "initiative"), { active: next });
  await sendChat(`It's ${tokens[next]?.name || next}'s turn`, callerName, "system");
}

export async function clearInitiative() {
  await remove(ref(db, "initiative"));
}

export function renderInitTrack(containerEl, initiative, tokens, onCardClick) {
  containerEl.innerHTML = "";
  if (!initiative.order.length) {
    containerEl.innerHTML = `<span style="font-family:'Cinzel',serif;font-size:10px;color:var(--dim)">No initiative set</span>`;
    return;
  }
  initiative.order.forEach(tokId => {
    const tok      = tokens[tokId];
    const isActive = initiative.active === tokId;
    const roll     = initiative.rolls?.[tokId] || "?";
    const hpPct    = tok ? Math.max(0, Math.min(1, (tok.hp ?? tok.maxHp) / (tok.maxHp || 1))) : 1;
    const hpColor  = hpPct > .5 ? "#5a9a5a" : hpPct > .25 ? "#aaaa30" : "#e04040";
    const card     = document.createElement("div");
    card.className = "init-card" + (isActive ? " active-turn" : "");
    card.innerHTML = `
      <div class="init-name">${tok?.name || tokId}</div>
      <div class="init-num">Roll: ${roll}</div>
      ${tok ? `<div class="init-hp" style="color:${hpColor}">${tok.hp ?? "?"}/${tok.maxHp ?? "?"} HP</div>` : ""}
    `;
    card.onclick = () => onCardClick && onCardClick(tokId, tok);
    containerEl.appendChild(card);
  });
}
