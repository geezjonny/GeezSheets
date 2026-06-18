// Initiative — manual, ordered list of names, drag-to-reorder
// State lives in RTDB initiative/ as { order: [{id,name}], active: id|null }
// No auto-rolling, no token binding — just a name list the GM controls directly

import { db } from "./firebase.js";
import { ref, set, update, remove } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { sendChat } from "./chat.js";

export async function addToInitiative(initiative, name, callerName) {
  const entry = { id: "init_" + Date.now() + "_" + Math.floor(Math.random() * 1000), name };
  const order = [...(initiative.order || []), entry];
  await set(ref(db, "initiative"), { order, active: initiative.active ?? (order.length === 1 ? entry.id : null) });
  await sendChat(`Added **${name}** to initiative`, callerName, "system");
}

export async function removeFromInitiative(initiative, id, callerName) {
  const order = (initiative.order || []).filter(e => e.id !== id);
  let active = initiative.active;
  if (active === id) active = order[0]?.id ?? null;
  await set(ref(db, "initiative"), { order, active });
  if (callerName) await sendChat(`Removed from initiative`, callerName, "system");
}

export async function reorderInitiative(initiative, newOrder) {
  await update(ref(db, "initiative"), { order: newOrder });
}

export async function nextTurn(initiative, callerName) {
  const order = initiative.order || [];
  if (!order.length) return;
  const idx  = order.findIndex(e => e.id === initiative.active);
  const next = order[(idx + 1) % order.length];
  await update(ref(db, "initiative"), { active: next.id });
  await sendChat(`It's **${next.name}**'s turn`, callerName, "system");
}

export async function setActiveTurn(id) {
  await update(ref(db, "initiative"), { active: id });
}

export async function clearInitiative() {
  await remove(ref(db, "initiative"));
}

// Renders the initiative track with drag-to-reorder.
// onReorder(newOrderArray) is called locally on drop, then the caller should persist via reorderInitiative.
// onCardClick(id, entry) fires on a plain click (not drag) — used to ping/highlight.
// onRemove(id) fires when the small × on a card is clicked.
export function renderInitTrack(containerEl, initiative, { onCardClick, onRemove, onDropReorder } = {}) {
  containerEl.innerHTML = "";
  const order = initiative.order || [];
  if (!order.length) {
    containerEl.innerHTML = `<span style="font-family:'Cinzel',serif;font-size:10px;color:var(--dim)">No one in initiative — click ➕ Add</span>`;
    return;
  }

  let dragSrcIdx = null;

  order.forEach((entry, idx) => {
    const isActive = initiative.active === entry.id;
    const card = document.createElement("div");
    card.className = "init-card" + (isActive ? " active-turn" : "");
    card.draggable = true;
    card.dataset.idx = idx;
    card.innerHTML = `
      <div class="init-name">${entry.name}</div>
      <div class="init-remove" title="Remove" style="position:absolute;top:2px;right:4px;font-size:9px;color:var(--dim);cursor:pointer;opacity:.6">✕</div>
    `;

    card.querySelector(".init-remove").onclick = (e) => {
      e.stopPropagation();
      onRemove && onRemove(entry.id);
    };

    card.onclick = (e) => {
      if (e.target.classList.contains("init-remove")) return;
      onCardClick && onCardClick(entry.id, entry);
    };

    card.addEventListener("dragstart", (e) => {
      dragSrcIdx = idx;
      card.style.opacity = "0.4";
      e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => { card.style.opacity = "1"; });
    card.addEventListener("dragover", (e) => { e.preventDefault(); });
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dragSrcIdx === null || dragSrcIdx === idx) return;
      const newOrder = [...order];
      const [moved] = newOrder.splice(dragSrcIdx, 1);
      newOrder.splice(idx, 0, moved);
      dragSrcIdx = null;
      onDropReorder && onDropReorder(newOrder);
    });

    containerEl.appendChild(card);
  });
}
