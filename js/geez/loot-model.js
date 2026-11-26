export const LOOT_TIERS = [
  { label: 'Tier 1 (levels 1–4)', rarity: ['Common', 'Uncommon'], gearLimit: 50, coins: { cp: [20, 100], sp: [10, 60], gp: [5, 25] } },
  { label: 'Tier 2 (levels 5–10)', rarity: ['Rare'], gearLimit: 500, coins: { sp: [50, 250], gp: [50, 250], pp: [1, 10] } },
  { label: 'Tier 3 (levels 11–16)', rarity: ['Very Rare'], gearLimit: 1500, coins: { gp: [250, 1500], pp: [25, 150] } },
  { label: 'Tier 4 (levels 17–20)', rarity: ['Legendary'], gearLimit: 5000, coins: { gp: [1000, 5000], pp: [100, 1000] } }
];
const coinNames = { cp: 'Copper', sp: 'Silver', ep: 'Electrum', gp: 'Gold', pp: 'Platinum' };

export function lootItem(item, qty = 1) {
  return { id: crypto.randomUUID(), name: item.name, qty, category: item.equipment_category?.name || '',
    ...(Number.isFinite(item.weight) && item.weight >= 0 ? { weight: item.weight } : {}),
    ...(item.rarity?.name ? { rarity: item.rarity.name } : {}),
    ...(item.armor_class ? { armor_class: item.armor_class, armor_category: item.armor_category } : {}),
    desc: [...(item.desc || []), ...(item.special || [])].join('\n\n') };
}

export function generateLoot(tier, reference, random = Math.random) {
  const rules = LOOT_TIERS[tier - 1];
  if (!Number.isInteger(tier) || !rules) throw new Error('Choose a loot tier from 1 to 4.');
  const roll = (min, max) => min + Math.floor(random() * (max - min + 1));
  const cost = item => Number(item.cost?.quantity) * ({ cp: .01, sp: .1, ep: .5, gp: 1, pp: 10 }[item.cost?.unit] ?? NaN);
  const equipment = Object.values(reference).filter(item => item?.name && Number.isFinite(item.weight) && item.weight >= 0 &&
    cost(item) > 0 && cost(item) <= rules.gearLimit && !/mount|vehicle|waterborne/i.test(item.equipment_category?.name || ''));
  const magic = Object.values(reference).filter(item => item?.name && rules.rarity.includes(item.rarity?.name) && !item.variants?.length);
  if (!equipment.length || !magic.length) throw new Error('SRD loot is unavailable for this tier.');
  // shortcut: bounded tier loot, not the DMG hoard tables; replace when exact treasure tables are requested.
  const contents = Object.entries(rules.coins).map(([coin, [min, max]]) => ({ id: crypto.randomUUID(), name: `${coinNames[coin]} coins`, coin, qty: roll(min, max), weight: .02 }));
  const count = Math.min(roll(2, 4), equipment.length);
  for (let index = 0; index < count; index++) {
    const [item] = equipment.splice(roll(0, equipment.length - 1), 1);
    contents.push(lootItem(item, roll(1, Math.min(3, Math.floor(rules.gearLimit / cost(item))))));
  }
  contents.push(lootItem(magic[roll(0, magic.length - 1)]));
  return contents;
}
