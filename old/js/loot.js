// loot.js — shared loot table / random-generation logic.
// Extracted so both the DM's standalone loot panel (mapeditor.html) and the
// player-triggered "open container" flow (index.html) roll from the exact
// same tables, instead of the tables only living inline in one file.

let _equip = [], _magic = [];
let _loaded = false;

/** Call once before generating loot. Safe to call more than once. */
export async function loadLootData() {
  if (_loaded) return;
  const [eq, mg] = await Promise.all([
    fetch("./data/equipment.json").then(r => r.json()),
    fetch("./data/magic_items.json").then(r => r.json()),
  ]);
  _equip = eq; _magic = mg;
  _loaded = true;
}

const COIN_TABLES = {
  0:  () => ({ cp: roll(6,6)*10,  sp: roll(3,6)*10,  gp: 0,               ep: 0 }),
  3:  () => ({ cp: roll(2,6)*100, sp: roll(2,6)*10,  gp: roll(2,6)*10,    ep: roll(1,6)*10 }),
  6:  () => ({ cp: 0, sp: roll(2,6)*100, gp: roll(2,6)*100, ep: roll(2,6)*10, pp: roll(1,6)*10 }),
  11: () => ({ cp: 0, sp: 0, gp: roll(4,6)*100,  pp: roll(1,6)*25 }),
  16: () => ({ cp: 0, sp: 0, gp: roll(12,6)*250, pp: roll(8,6)*250 }),
};
const ITEM_COUNT = {
  body:   { 0:[1,2], 3:[1,3], 6:[2,4], 11:[3,5],  16:[4,6]  },
  chest:  { 0:[2,4], 3:[3,6], 6:[4,8], 11:[5,10], 16:[6,12] },
  random: { 0:[1,3], 3:[1,4], 6:[2,5], 11:[3,6],  16:[4,8]  },
  shop:   { 0:[4,8], 3:[5,10],6:[6,12],11:[6,12], 16:[6,12] },
};
const MAGIC_CHANCE = { 0:0.1, 3:0.2, 6:0.35, 11:0.55, 16:0.75 };
const RARITY_BY_CR = {
  0:  ["Common"],
  3:  ["Common","Uncommon"],
  6:  ["Uncommon","Rare"],
  11: ["Rare","Very Rare"],
  16: ["Very Rare","Legendary"],
};
const EQUIP_CATS_BY_SOURCE = {
  body:   ["weapons","armor","adventuring-gear"],
  chest:  ["weapons","armor","adventuring-gear","tools","mounts-and-vehicles"],
  random: ["weapons","armor","adventuring-gear","tools"],
  shop:   ["weapons","armor","adventuring-gear","tools","mounts-and-vehicles"],
};

export function roll(n, d) { let t = 0; for (let i = 0; i < n; i++) t += 1 + Math.floor(Math.random()*d); return t; }
function pick(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

export function crToTier(crVal) { return [0,3,6,11,16].reduce((t,v) => crVal >= v ? v : t, 0); }

export function rollCoins(cr) {
  const fn = COIN_TABLES[cr] || COIN_TABLES[0];
  return fn();
}

export function rollItems(source, cr, includeMagic) {
  const [min, max] = ITEM_COUNT[source]?.[cr] || ITEM_COUNT.random[0];
  const count = min + Math.floor(Math.random()*(max-min+1));
  const cats = EQUIP_CATS_BY_SOURCE[source] || EQUIP_CATS_BY_SOURCE.random;
  const rarities = RARITY_BY_CR[cr] || RARITY_BY_CR[0];
  const magicChance = MAGIC_CHANCE[cr] || 0.1;
  const items = [];
  for (let i = 0; i < count; i++) {
    const useMagic = includeMagic && Math.random() < magicChance && _magic.length;
    if (useMagic) {
      const eligible = _magic.filter(m => rarities.includes(m.rarity?.name));
      if (eligible.length) { items.push({ ...pick(eligible), _magic: true }); continue; }
    }
    const eligible = _equip.filter(e => cats.includes(e.equipment_category?.index));
    if (eligible.length) items.push(pick(eligible));
  }
  return items;
}

/** Convenience wrapper for containers (chests/crates/etc.) -- fixed "chest"
 *  source, magic items included per the tier's own natural chance. */
export function generateContainerLoot(tier) {
  const cr = crToTier(tier);
  return { coins: rollCoins(cr), items: rollItems("chest", cr, true) };
}

/** Plain-text summary for a chat message, e.g. "12 gp, 3 sp, a longsword, a potion of healing" */
export function summarizeLoot(coins, items) {
  const coinParts = Object.entries(coins).filter(([,v]) => v > 0).map(([k,v]) => `${v} ${k}`);
  const itemParts = items.map(i => i.name);
  const all = [...coinParts, ...itemParts];
  if (!all.length) return "nothing";
  return all.join(", ");
}
