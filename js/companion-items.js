// What an item is: its damage or armor, what it is normally worth, what a pack holds, and what makes up your AC.
// Pure helpers; `reference` is the SRD data keyed by lower-case name.
import { equippedItem, equippedName } from './geez/inventory-model.js';

// Names written on the sheets that the rules list differently.
const ALIASES = {
  'studded leather': 'studded leather armor', 'common clothes': 'clothes, common', 'set of common clothes': 'clothes, common',
  "set of traveler's clothes": "clothes, traveler's", 'belt pouch': 'pouch', 'hand crossbow': 'crossbow, hand', 'light crossbow': 'crossbow, light',
  'heavy crossbow': 'crossbow, heavy', tent: 'tent, two-person', parchment: 'parchment (one sheet)', robe: 'robes', 'bolt case': 'case, crossbow bolt',
  'incense sticks': 'block of incense', 'prayer book': 'book'
};
// The potions are listed as one magic item with variants and no price.
export const HEALING = {
  'potion of healing': ['2d4+2', 50], 'potion of greater healing': ['4d4+4'], 'potion of superior healing': ['8d4+8'], 'potion of supreme healing': ['10d4+20']
};
// Dungeon Master's Guide price bands for magic items.
const RARITY = { common: '50–100 gp', uncommon: '101–500 gp', rare: '501–5,000 gp', 'very rare': '5,001–50,000 gp', legendary: 'over 50,000 gp' };

const key = (name) => String(name || '').trim().toLowerCase().replace(/’/g, "'");
const healingName = (name) => key(name).replace(/^potion of healing \((greater|superior|supreme)\)$/, 'potion of $1 healing');
export function findItem(name, reference) {
  const k = key(name);
  return reference[k] || reference[ALIASES[k]] || reference[`${k} armor`] || {};
}
const title = (text) => String(text).replace(/\b\w/g, (c) => c.toUpperCase());
const price = (cost) => (cost?.quantity ? `${Number(cost.quantity).toLocaleString('en-US')} ${cost.unit}` : '');

export function worth(item, reference) {
  const info = findItem(item.name, reference), potion = HEALING[healingName(item.name)];
  if (price(info.cost)) return price(info.cost);
  if (potion?.[1]) return `${potion[1]} gp`;
  const rarity = key(item.rarity?.name || item.rarity || info.rarity?.name);
  return RARITY[rarity] ? `magic, usually ${RARITY[rarity]}` : '';
}

// One line saying what the item does in play, e.g. "1d4 piercing · Finesse, Light, Thrown 20/60 ft".
export function statLine(item, reference) {
  const info = findItem(item.name, reference), parts = [];
  if (info.damage?.damage_dice) {
    parts.push(`${info.damage.damage_dice} ${key(info.damage.damage_type?.name)}`);
    if (info.two_handed_damage?.damage_dice) parts.push(`${info.two_handed_damage.damage_dice} two-handed`);
    const reach = info.weapon_range === 'Ranged' ? info.range : info.throw_range;
    const properties = (info.properties || []).map((p) => (p.name === 'Thrown' && reach ? `Thrown ${reach.normal}/${reach.long} ft` : p.name));
    if (info.weapon_range === 'Ranged' && reach?.long) properties.unshift(`Range ${reach.normal}/${reach.long} ft`);
    if (properties.length) parts.push(properties.join(', '));
  }
  const armor = item.armor_class || info.armor_class;
  if (armor && Number.isFinite(armor.base)) {
    const category = item.armor_category || info.armor_category; // homebrew armor carries its own
    if (category === 'Shield') parts.push(`+${armor.base} AC`);
    else parts.push(`AC ${armor.base}${armor.dex_bonus ? ` + DEX${armor.max_bonus != null ? ` (max ${armor.max_bonus})` : ''}` : ''}`);
    if (category && category !== 'Shield') parts.push(`${category} armor`);
    if (info.stealth_disadvantage) parts.push('Disadvantage on Stealth');
    if (info.str_minimum) parts.push(`Needs STR ${info.str_minimum}`);
  }
  const healing = HEALING[healingName(item.name)]?.[0];
  if (healing) parts.push(`Heals ${healing}`);
  return parts.join(' · ');
}

export function packContents(item, reference) {
  return (findItem(item.name, reference).contents || []).map((c) => {
    const entry = { name: c.item.name, qty: c.quantity };
    return { ...entry, worth: worth(entry, reference), stats: statLine(entry, reference) };
  });
}

// The pieces behind the AC number. The sheet stores a base AC; equipped item bonuses are added on top of it.
export function acBreakdown(pc, fx, reference) {
  const stored = Number(pc.combat?.ac), total = Number(fx.combat?.ac);
  const dex = Math.floor((Number(fx.stats?.dex ?? 10) - 10) / 2), lines = [];
  const armorName = equippedName(pc, 'armor'), armorItem = equippedItem(pc, 'armor', reference);
  const armor = armorName ? (armorItem?.armor_class || findItem(armorName, reference).armor_class) : null;
  let rule = null;
  if (!armorName) { rule = 10 + dex; lines.push(['No armor', `10 + ${dex} DEX = ${rule}`]); }
  else if (armor && Number.isFinite(armor.base)) {
    const added = armor.dex_bonus ? Math.min(dex, armor.max_bonus ?? Infinity) : 0;
    rule = armor.base + added;
    lines.push([armorName, armor.dex_bonus ? `${armor.base} + ${added} DEX = ${rule}` : `${armor.base} (no DEX)`]);
  } else lines.push([armorName, 'no standard armor value']);
  if (equippedName(pc, 'shield')) {
    const shield = findItem(equippedName(pc, 'shield'), reference).armor_class?.base ?? 2;
    if (rule !== null) rule += shield;
    lines.push([equippedName(pc, 'shield'), `+${shield}`]);
  }
  const bonus = Number.isFinite(total - stored) ? total - stored : 0;
  if (bonus) lines.push(['Item and effect bonuses', `${bonus > 0 ? '+' : ''}${bonus}`]);
  let note = '';
  if (rule === null) note = `Your sheet's base AC is ${stored}.`;
  else if (rule + bonus !== total) note = `The rules for this gear give ${rule + bonus}, but your sheet says ${total}. A class feature may explain it; if not, ask your GM.`;
  return { total, lines, note };
}

// Dice healed by drinking or using this item, if the app can apply it.
export function healingDice(item) {
  if (item.consumable?.kind === 'healing') return item.consumable.dice;
  return HEALING[healingName(item.name)]?.[0] || '';
}
