// Light & consumable items
// Handles torches, potions, condition removers
// Used by both index.html (players) and mapeditor.html (GM giving light)

import { db } from "./firebase.js";
import { ref, get, set, update } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

// ── Light source definitions ──────────────────────────────────────────────────
// bright/dim in tiles. Any item name (lowercase) → radius config.
export const LIGHT_SOURCES = {
  "torch":              { bright: 4,  dim: 8  },
  "candle":             { bright: 1,  dim: 2  },
  "hooded lantern":     { bright: 6,  dim: 12 },
  "bullseye lantern":   { bright: 12, dim: 24 },
  "light":              { bright: 4,  dim: 8  },
  "daylight":           { bright: 12, dim: 24 },
  "dancing lights":     { bright: 0,  dim: 4  },
  "continual flame":    { bright: 4,  dim: 8  },
  "sunrod":             { bright: 6,  dim: 12 },
};

// ── Healing item definitions ──────────────────────────────────────────────────
// Value is a function returning hp restored
export const HEAL_ITEMS = {
  "potion of healing":          () => rollExpr("2d4+2"),
  "potion of greater healing":  () => rollExpr("4d4+4"),
  "potion of superior healing": () => rollExpr("8d4+8"),
  "potion of supreme healing":  () => rollExpr("10d4+20"),
  "goodberry":                  () => 1,
};

// ── Condition removers ────────────────────────────────────────────────────────
// Value is array of condition strings to remove
export const CONDITION_REMOVERS = {
  "antitoxin":             ["poisoned"],
  "lesser restoration":    ["blinded", "deafened", "paralyzed", "poisoned"],
  "greater restoration":   ["charmed", "exhaustion", "frightened", "petrified"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
export function itemKey(name) {
  return (name || "").toLowerCase().trim();
}

export function getLightDef(name) {
  return LIGHT_SOURCES[itemKey(name)] || null;
}

export function getHealFn(name) {
  return HEAL_ITEMS[itemKey(name)] || null;
}

export function getCondRemove(name) {
  return CONDITION_REMOVERS[itemKey(name)] || null;
}

export function rollExpr(expr) {
  const m = expr.match(/(\d+)d(\d+)([+-]\d+)?/);
  if (!m) return 0;
  let total = 0;
  for (let i = 0; i < parseInt(m[1]); i++) {
    total += Math.floor(Math.random() * parseInt(m[2])) + 1;
  }
  if (m[3]) total += parseInt(m[3]);
  return total;
}

// ── Use item ─────────────────────────────────────────────────────────────────
// Returns a toast message string, or throws on error
export async function useItem(charId, idx, onToast) {
  const snap = await get(ref(db, `characters/pcs/${charId}`));
  if (!snap.exists()) return;
  const char = { ...snap.val(), id: charId };
  const inv  = Array.isArray(char.inventory)
    ? [...char.inventory]
    : Object.values(char.inventory || {});
  const item = inv[idx];
  if (!item) return;

  const key       = itemKey(item.name);
  const lightDef  = LIGHT_SOURCES[key];
  const healFn    = HEAL_ITEMS[key];
  const condRemov = CONDITION_REMOVERS[key];

  // ── Light source ──
  if (lightDef) {
    const isOn = char.light?.active && char.light?.source === item.name;
    if (isOn) {
      await update(ref(db, `characters/pcs/${charId}`), {
        "light/active": false, "light/source": null,
      });
      onToast?.(`🕯 ${item.name} extinguished`);
    } else {
      const newQty = (item.qty ?? 1) - 1;
      inv[idx] = { ...item, qty: newQty };
      if (newQty <= 0) inv.splice(idx, 1);
      await update(ref(db, `characters/pcs/${charId}`), {
        "light/active": true,
        "light/source": item.name,
        "light/bright": lightDef.bright,
        "light/dim":    lightDef.dim,
        inventory:      inv,
      });
      onToast?.(`🕯 ${item.name} lit — ${lightDef.bright} ft bright, ${lightDef.dim} ft dim`);
    }
    return;
  }

  // ── Healing item ──
  if (healFn) {
    const roll   = healFn();
    const c      = char.combat || {};
    const newHp  = Math.min(c.hp_max ?? 1, (c.hp_current ?? 0) + roll);
    const newQty = (item.qty ?? 1) - 1;
    inv[idx] = { ...item, qty: newQty };
    if (newQty <= 0) inv.splice(idx, 1);
    await update(ref(db, `characters/pcs/${charId}`), {
      inventory: inv,
      "combat/hp_current": newHp,
    });
    onToast?.(`❤️ ${item.name}: +${roll} HP (${newHp}/${c.hp_max ?? 1})`);
    return;
  }

  // ── Condition remover ──
  if (condRemov) {
    const c       = char.combat || {};
    const existing = c.conditions || [];
    const newConds = existing.filter(cd => !condRemov.includes(cd.toLowerCase()));
    const newQty   = (item.qty ?? 1) - 1;
    inv[idx] = { ...item, qty: newQty };
    if (newQty <= 0) inv.splice(idx, 1);
    await update(ref(db, `characters/pcs/${charId}`), {
      inventory: inv,
      "combat/conditions": newConds,
    });
    onToast?.(`✨ ${item.name} used — removed ${condRemov.join(", ")}`);
    return;
  }

  // ── Generic consume ──
  const newQty = (item.qty ?? 1) - 1;
  inv[idx] = { ...item, qty: newQty };
  if (newQty <= 0) inv.splice(idx, 1);
  await update(ref(db, `characters/pcs/${charId}`), { inventory: inv });
  onToast?.(`Used ${item.name}`);
}

// ── Remove item ───────────────────────────────────────────────────────────────
export async function removeItem(charId, idx) {
  const snap = await get(ref(db, `characters/pcs/${charId}/inventory`));
  const inv  = snap.exists()
    ? (Array.isArray(snap.val()) ? [...snap.val()] : Object.values(snap.val()))
    : [];
  inv.splice(idx, 1);
  await set(ref(db, `characters/pcs/${charId}/inventory`), inv);
}

// ── Add item ──────────────────────────────────────────────────────────────────
export async function addItem(charId, name, qty = 1) {
  const snap = await get(ref(db, `characters/pcs/${charId}/inventory`));
  const inv  = snap.exists()
    ? (Array.isArray(snap.val()) ? [...snap.val()] : Object.values(snap.val()))
    : [];
  inv.push({ name: name.trim(), qty });
  await set(ref(db, `characters/pcs/${charId}/inventory`), inv);
}

// ── Give light (GM custom source) ─────────────────────────────────────────────
// consumeItemName: optional — name of inventory item to decrement
export async function giveLight(charId, sourceName, bright, dim, consumeItemName) {
  if (consumeItemName) {
    const snap = await get(ref(db, `characters/pcs/${charId}/inventory`));
    const inv  = snap.exists()
      ? (Array.isArray(snap.val()) ? [...snap.val()] : Object.values(snap.val()))
      : [];
    const idx  = inv.findIndex(i => itemKey(i.name) === itemKey(consumeItemName));
    if (idx >= 0) {
      const newQty = (inv[idx].qty ?? 1) - 1;
      inv[idx] = { ...inv[idx], qty: newQty };
      if (newQty <= 0) inv.splice(idx, 1);
      await set(ref(db, `characters/pcs/${charId}/inventory`), inv);
    }
  }
  await update(ref(db, `characters/pcs/${charId}`), {
    "light/active": true,
    "light/source": sourceName,
    "light/bright": bright,
    "light/dim":    dim,
  });
}

// ── Extinguish light ──────────────────────────────────────────────────────────
export async function extinguishLight(charId) {
  await update(ref(db, `characters/pcs/${charId}`), {
    "light/active": false,
    "light/source": null,
  });
}
