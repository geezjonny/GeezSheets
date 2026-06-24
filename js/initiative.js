// initiative.js — combined token strip + combat initiative system
//
// Out of combat: shows PC tokens on map as portrait pills with presence rings
// In combat:     same strip, ordered by initiative roll, active turn highlighted
//
// RTDB shape:
//   session/inCombat: bool
//   initiative/order: [{id, name, tokenId, roll, dexMod, total}]
//   initiative/active: tokenId
//   initiative/rolls:  { [safeTokenId]: {tokenId, name, roll, dexMod, total} }

import { db }                       from "./firebase.js";
import { ref, set, update, remove, onValue, push }
                                    from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { tokenTextures, tokenCacheKey } from "./assets.js";
import { sendChat }                 from "./chat.js";
import { TILE }                     from "./config.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
function sFmt(n) { return (n >= 0 ? "+" : "") + n; }
function dexMod(score) { return Math.floor(((score || 10) - 10) / 2); }
function rollD20() { return Math.floor(Math.random() * 20) + 1; }
function safeKey(id) { return (id || "").replace(/[.#$/\[\]]/g, "_"); }

// ── RTDB writers ──────────────────────────────────────────────────────────────

export async function startCombat() {
  await set(ref(db, "session/inCombat"), true);
  await remove(ref(db, "initiative"));
}

export async function endCombat() {
  await set(ref(db, "session/inCombat"), false);
  await remove(ref(db, "initiative"));
}

export async function rollInitiative(tokenId, name, dexModifier, callerName) {
  const r     = rollD20();
  const total = r + dexModifier;
  const safe  = safeKey(tokenId);
  await update(ref(db, `initiative/rolls/${safe}`), {
    tokenId, name, roll: r, dexMod: dexModifier, total, t: Date.now(),
  });
  if (callerName) {
    await push(ref(db, "chat"), {
      sender: callerName, type: "dice",
      text: `rolled initiative: d20(${r}) ${sFmt(dexModifier)} = **${total}** for ${name}`,
      t: Date.now(),
    });
  }
  return total;
}

export async function lockInitiativeOrder(rolls, callerName) {
  const order = Object.values(rolls)
    .sort((a, b) => b.total - a.total || b.dexMod - a.dexMod)
    .map((r, i) => ({
      id:      r.tokenId + "_" + i,
      tokenId: r.tokenId,
      name:    r.name,
      roll:    r.roll,
      dexMod:  r.dexMod,
      total:   r.total,
    }));
  const first = order[0];
  await update(ref(db, "initiative"), { order, active: first?.tokenId || null });
  if (callerName && first) {
    await push(ref(db, "chat"), {
      sender: "System", type: "system",
      text: `⚔ Initiative locked — ${first.name} goes first`,
      t: Date.now(),
    });
  }
}

export async function nextTurn(initiative, callerName) {
  const order = initiative.order || [];
  if (!order.length) return;
  const idx  = order.findIndex(e => e.tokenId === initiative.active);
  const next = order[(idx + 1) % order.length];
  await update(ref(db, "initiative"), { active: next.tokenId });
  if (callerName) {
    await push(ref(db, "chat"), {
      sender: "System", type: "system",
      text: `⚔ It's **${next.name}**'s turn`,
      t: Date.now(),
    });
  }
}

export async function addToInitiative(initiative, name, callerName) {
  const entry = {
    id: "init_" + Date.now(), tokenId: "manual_" + Date.now(),
    name, roll: 0, dexMod: 0, total: 0,
  };
  const order = [...(initiative.order || []), entry];
  await set(ref(db, "initiative"), {
    order, active: initiative.active ?? (order.length === 1 ? entry.tokenId : null),
  });
  if (callerName) {
    await push(ref(db, "chat"), { sender:"System",type:"system",text:`Added **${name}** to initiative`,t:Date.now() });
  }
}

export async function removeFromInitiative(initiative, tokenId, callerName) {
  const order  = (initiative.order || []).filter(e => e.tokenId !== tokenId);
  const active = initiative.active === tokenId ? (order[0]?.tokenId ?? null) : initiative.active;
  await set(ref(db, "initiative"), { order, active });
  if (callerName) {
    await push(ref(db, "chat"), { sender:"System",type:"system",text:`Removed from initiative`,t:Date.now() });
  }
}

export async function clearInitiative() {
  await remove(ref(db, "initiative"));
}

export async function setActiveTurn(tokenId) {
  await update(ref(db, "initiative"), { active: tokenId });
}

export async function reorderInitiative(newOrder) {
  await update(ref(db, "initiative"), { order: newOrder });
}

// ── Strip renderer ────────────────────────────────────────────────────────────
//
// containerEl: the strip container element
// state: { tokens, pcsData, presence, initiative, inCombat, rolls }
// options: { isGM, playerName, myCharacterId, onOpenSheet, onRollInitiative }

export function renderTokenStrip(containerEl, state, options = {}) {
  if (!containerEl) return;
  const { tokens={}, pcsData={}, presence={}, initiative={}, inCombat=false, rolls={} } = state;
  const { isGM=false, playerName="", myCharacterId="", onOpenSheet=null, onRollInitiative=null } = options;

  const hasOrder = (initiative.order || []).length > 0;
  const activeId = initiative.active;
  const stale    = Date.now() - 30000;

  containerEl.innerHTML = "";

  // Which tokens to show
  let tokList = Object.entries(tokens);
  if (!isGM) tokList = tokList.filter(([,t]) => t.type === "pc");
  if (!tokList.length) {
    containerEl.innerHTML = `<span style="font-family:'Cinzel',serif;font-size:9px;color:var(--dim,#6b5a38);padding:0 12px;align-self:center">No tokens on map</span>`;
    return;
  }

  // Sort order
  let ordered;
  if (inCombat && hasOrder) {
    const orderMap = {};
    (initiative.order || []).forEach((e,i) => { orderMap[e.tokenId] = i; });
    ordered = [...tokList].sort(([,a],[,b]) => (orderMap[a.id]??999) - (orderMap[b.id]??999));
  } else {
    ordered = [...tokList].sort(([,a],[,b]) => {
      if (a.type !== b.type) return a.type==="pc" ? -1 : 1;
      return (a.name||"").localeCompare(b.name||"");
    });
  }

  for (const [tokId, tok] of ordered) {
    const charId  = tok.characterId;
    const pc      = charId && pcsData[charId];
    const hp      = pc?.combat?.hp_current ?? pc?.hp_current ?? tok.hp ?? 0;
    const maxHp   = pc?.combat?.hp_max     ?? pc?.hp_max     ?? tok.maxHp ?? 1;
    const hpPct   = Math.max(0, Math.min(1, hp / maxHp));
    const hpColor = hpPct>.5 ? "#4a9a4a" : hpPct>.25 ? "#aaaa30" : "#e04040";
    const isActive = inCombat && hasOrder && tok.id === activeId;

    // Presence
    const presKey  = Object.keys(presence).find(k => k.replace(/_/g," ").toLowerCase() === (tok.name||"").toLowerCase());
    const presData = presKey ? presence[presKey] : null;
    const online   = presData && presData.t > stale;
    const idle     = presData && !online && presData.t > stale - 120000;

    // Portrait
    const cacheKey = tokenCacheKey(charId, tok.lookupName || tok.name);
    const img      = tokenTextures[cacheKey];

    // Initiative roll
    const safe     = safeKey(tok.id || tokId);
    const rollData = rolls[safe];
    const hasRolled = !!rollData;

    // Ring color
    let ringColor = "rgba(122,176,224,0.3)";
    if (isActive) ringColor = "#c8a84b";
    else if (online) ringColor = "#4a9a4a";
    else if (idle) ringColor = "#aaaa30";

    // Pill
    const pill = document.createElement("div");
    pill.dataset.tokId = tokId;
    pill.style.cssText = `flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;padding:4px 5px;border-radius:6px;transition:background .12s;${isActive?"background:rgba(200,168,75,.1)":""}`;
    pill.onmouseenter = () => { pill.style.background = "rgba(255,255,255,.04)"; };
    pill.onmouseleave = () => { pill.style.background = isActive ? "rgba(200,168,75,.1)" : ""; };
    pill.onclick = () => { if (onOpenSheet && charId && charId !== "__npc__") onOpenSheet(charId, tok.name, isGM); };

    // Portrait circle
    const portrait = document.createElement("div");
    portrait.style.cssText = `width:40px;height:40px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2.5px solid ${ringColor};${isActive?"box-shadow:0 0 10px rgba(200,168,75,.5);":""}background:#3a6aaa;position:relative`;
    if (img) {
      const i = document.createElement("img");
      i.src = img.src; i.style.cssText = "width:100%;height:100%;object-fit:cover;display:block";
      portrait.appendChild(i);
    } else {
      portrait.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:'Cinzel',serif;font-size:16px;color:#fff;font-weight:700">${(tok.name||"?")[0].toUpperCase()}</div>`;
    }

    // Active turn dot
    if (isActive) {
      const dot = document.createElement("div");
      dot.style.cssText = "position:absolute;top:-2px;left:-2px;width:10px;height:10px;border-radius:50%;background:#c8a84b;border:1.5px solid #0d0b08";
      portrait.style.overflow = "visible";
      portrait.appendChild(dot);
    }
    pill.appendChild(portrait);

    // Name
    const nameEl = document.createElement("div");
    nameEl.style.cssText = "font-family:'Cinzel',serif;font-size:8px;color:var(--text,#d4c49a);white-space:nowrap;max-width:52px;overflow:hidden;text-overflow:ellipsis;text-align:center";
    nameEl.textContent = tok.name || "?";
    pill.appendChild(nameEl);

    // HP bar (PCs)
    if (tok.type === "pc") {
      const bw = document.createElement("div");
      bw.style.cssText = "width:36px;height:3px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden";
      const b = document.createElement("div");
      b.style.cssText = `height:100%;border-radius:999px;background:${hpColor};width:${Math.round(hpPct*100)}%;transition:width .3s`;
      bw.appendChild(b); pill.appendChild(bw);
    }

    // Initiative info / roll button
    if (inCombat) {
      if (hasOrder) {
        // Show roll total
        const re = document.createElement("div");
        re.style.cssText = "font-family:'JetBrains Mono',monospace;font-size:8px;color:var(--gold,#c8a84b);text-align:center;line-height:1";
        const entry = (initiative.order || []).find(e => e.tokenId === (tok.id||tokId));
        re.textContent = entry ? entry.total : "—";
        pill.appendChild(re);
      } else {
        // Roll phase
        const rb = document.createElement("button");
        rb.style.cssText = `font-family:'Cinzel',serif;font-size:7px;letter-spacing:.04em;border-radius:3px;border:1px solid;padding:2px 5px;cursor:pointer;transition:all .12s;${hasRolled ? "border-color:rgba(74,154,74,.4);background:rgba(74,154,74,.1);color:#4a9a4a" : "border-color:rgba(200,168,75,.3);background:rgba(200,168,75,.06);color:var(--gold,#c8a84b)"}`;
        rb.textContent = hasRolled ? `✓ ${rollData.total}` : "🎲 Roll";
        rb.onclick = async (e) => {
          e.stopPropagation();
          if (onRollInitiative) {
            const dm = pc ? dexMod(pc.stats?.dex ?? 10) : 0;
            await onRollInitiative(tok.id || tokId, tok.name, dm, playerName || "GM");
          }
        };
        pill.appendChild(rb);
      }
    }

    containerEl.appendChild(pill);
  }

  // GM controls
  if (isGM) {
    const sep = document.createElement("div");
    sep.style.cssText = "width:1px;height:36px;background:var(--border,#3d2e1a);flex-shrink:0;margin:0 6px;align-self:center";
    containerEl.appendChild(sep);

    const ctrl = document.createElement("div");
    ctrl.style.cssText = "display:flex;flex-direction:column;gap:3px;flex-shrink:0;align-self:center";

    function gmBtn(label, onclick, color="var(--dim,#6b5a38)") {
      const btn = document.createElement("button");
      btn.style.cssText = `height:20px;padding:0 8px;border:1px solid var(--border,#3d2e1a);border-radius:3px;background:transparent;color:${color};font-family:'Cinzel',serif;font-size:8px;cursor:pointer;white-space:nowrap;transition:all .12s`;
      btn.onmouseenter = () => { btn.style.borderColor="var(--gold-dim,#7a6228)"; btn.style.color="var(--text,#d4c49a)"; };
      btn.onmouseleave = () => { btn.style.borderColor="var(--border,#3d2e1a)"; btn.style.color=color; };
      btn.textContent = label; btn.onclick = onclick; return btn;
    }

    if (!inCombat) {
      ctrl.appendChild(gmBtn("⚔ Combat", async () => await startCombat()));
      ctrl.appendChild(gmBtn("➕ Add", async () => {
        const name = prompt("Name:");
        if (!name?.trim()) return;
        await addToInitiative({ order:[], active:null }, name.trim(), playerName||"GM");
      }));
    } else if (!hasOrder) {
      const allRolled = ordered.every(([,t]) => rolls[safeKey(t.id||"")]);
      ctrl.appendChild(gmBtn("🔒 Lock", async () => {
        await lockInitiativeOrder(rolls, playerName||"GM");
      }, "#c8a84b"));
      ctrl.appendChild(gmBtn("✕ Cancel", async () => await endCombat(), "#fca5a5"));
    } else {
      ctrl.appendChild(gmBtn("▶ Next", async () => {
        await nextTurn({ order: initiative.order, active: activeId }, playerName||"GM");
      }, "#c8a84b"));
      ctrl.appendChild(gmBtn("✕ End", async () => await endCombat(), "#fca5a5"));
    }

    containerEl.appendChild(ctrl);
  }
}

// ── Subscription helper ───────────────────────────────────────────────────────
export function subscribeTokenStrip(containerEl, mapTokensRef, pcsDataRef, options = {}) {
  const stripState = {
    tokens:     mapTokensRef,
    pcsData:    pcsDataRef,
    presence:   {},
    initiative: { order: [], active: null },
    inCombat:   false,
    rolls:      {},
  };

  const render = () => renderTokenStrip(containerEl, stripState, options);
  const unsubs = [];

  unsubs.push(onValue(ref(db, "session/inCombat"), snap => {
    stripState.inCombat = !!snap.val(); render();
  }));
  unsubs.push(onValue(ref(db, "initiative"), snap => {
    const data = snap.val() || {};
    stripState.initiative = { order: data.order||[], active: data.active||null };
    stripState.rolls      = data.rolls || {};
    render();
  }));
  unsubs.push(onValue(ref(db, "presence"), snap => {
    stripState.presence = snap.val() || {}; render();
  }));

  render();
  return () => unsubs.forEach(u => u());
}
