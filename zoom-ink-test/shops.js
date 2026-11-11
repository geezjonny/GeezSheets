// What a shop sells, from the SRD 5.1 equipment and magic items (data/items.js, from GeezSheets' data):
// each kind of shop sells its own groups of goods; bigger places stock more, and better magic.
// And rare finds: now and then a real magic item turns up where it shouldn't, a vampiric sword in a
// general store's barrel, a holy hammer a farmer uses for fence posts. Mismatches are the point.
// Pure functions of a seed, so a building always has the same stock until it is rerolled.
import { mulberry } from './noise.js';
import { ITEMS, MAGIC } from './data/items.js';
import { makeRelic } from './relics.js';

const rngOf = seed => mulberry((seed | 0) || 1);
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const int = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const wpick = (rng, w) => { let t = 0; for (const k in w) t += w[k]; let r = rng() * t; for (const k in w) if ((r -= w[k]) < 0) return k; return Object.keys(w)[0]; };
const shuffle = (rng, a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// settlement size -> 0 (farm, hamlet, crossing) .. 3 (city)
export const SIZE_TIER = { farm: 0, hamlet: 0, crossing: 0, village: 1, town: 2, city: 3 };
const tierOf = size => typeof size === 'number' ? size : SIZE_TIER[size] ?? 2;

const RARITY = ['common', 'uncommon', 'rare', 'very rare', 'legendary'];
// DMG price ranges by rarity; consumables (potions, scrolls, ammunition) sell for half
const RANGE = { common: [50, 100], uncommon: [101, 500], rare: [501, 5000], 'very rare': [5001, 50000], legendary: [50001, 200000] };
const CONSUMABLE = i => i.c === 'potion' || i.c === 'scroll' || i.c === 'ammunition' || /^(Potion|Oil|Philter|Elixir|Spell Scroll|Dust|Ammunition)/.test(i.n);
const magicPrice = (rng, i) => { const [a, b] = RANGE[i.r] || RANGE.rare; return Math.round(a * Math.pow(b / a, rng()) * (CONSUMABLE(i) ? .5 : 1) / 5) * 5; };

const by = (g, n, not) => i => (!g || g.test(i.g)) && (!n || n.test(i.n)) && !(not && not.test(i.n));
const any = (...fs) => i => fs.some(f => f(i));
const BOATS = /Galley|Warship|Longship|Sailing ship|Keelboat|Rowboat/;
// kind -> { goods: filter on ITEMS, magic: filter on MAGIC, count per size tier, chance of magic per tier }
const SELLS = {
  smithy: { goods: any(by(/^weapon\/(simple|martial)\/melee/), by(/^armor\/(medium|heavy|shield)/), by(/standard-gear/, /^(Chain|Crowbar|Hammer|Piton|Spike|Manacles|Lock|Pot, iron|Shovel|Pick, miner|Grappling|Whetstone|Ball bearings|Caltrops)/), by(/tool/, /Smith's/)),
    magic: i => (i.c === 'weapon' || i.c === 'armor') && !/Bow|Arrow|Javelin|Dragon Scale|Elven|Glamoured/.test(i.n) },
  armory: { goods: any(by(/^armor\//), by(/^weapon\/martial\/melee/, /Halberd|Glaive|Pike|Longsword|Greatsword|Lance|Morningstar|War pick/), by(/standard-gear/, /Clothes, traveler|Whetstone|Signal whistle/)),
    magic: i => i.c === 'armor' || /Shield|Defender/.test(i.n), count: [[3, 5], [4, 7], [6, 11], [9, 14]] },
  bowyer: { goods: any(by(/ranged|ammunition/), by(/standard-gear/, /Quiver|Case, crossbow|Hunting trap/), by(/tool/, /Woodcarver/)),
    magic: i => i.c === 'ammunition' || /Bow|Arrow|Javelin|Ammunition/.test(i.n) },
  store: { goods: any(by(/standard-gear/, null, /Spellbook|Poison|Holy water|Component pouch|Alchemist|Acid|Antitoxin|Ram, portable|Signet|Perfume|Spyglass|Magnifying/), by(/equipment-packs/)),
    magic: i => i.r === 'common' || /Rope of|Bag of Holding|Decanter|Lantern of|Alchemy Jug/.test(i.n), count: [[5, 8], [8, 12], [11, 17], [14, 22]] },
  shop: { goods: any(by(/standard-gear/, null, /Spellbook|Poison|Holy water|Component pouch/), by(/gaming|musical/)),
    magic: () => true, count: [[3, 6], [4, 8], [6, 10], [8, 13]] },
  tanner: { goods: any(by(/^armor\/(light|medium)/, /Leather|Hide|Padded/), by(/standard-gear/, /Backpack|Waterskin|Pouch|Sack|Quiver|Case|Bedroll/), by(/^ride\/tack/, /Saddle|Saddlebags|Bit and/), by(/tool/, /Leatherworker|Cobbler/)),
    magic: i => /Leather|Boots|Gloves|Belt|Bracers|Cloak|Bag/.test(i.n) && i.c !== 'potion' },
  stables: { goods: any(by(/^ride\/(mounts|tack)/, null, /Elephant|Camel/), by(/^ride\//, /Cart|Wagon|Sled|Carriage/)),
    magic: i => /Horseshoes|Figurine|Saddle|Horn of/.test(i.n), count: [[3, 5], [4, 8], [6, 11], [9, 15]] },
  alchemist: { goods: any(by(/standard-gear/, /Acid|Alchemist's fire|Antitoxin|Oil|Perfume|Vial|Bottle|Soap/), by(/tool/, /Alchemist|Herbalism|Poisoner/)),
    magic: i => i.c === 'potion' || /^(Oil|Philter|Elixir|Dust|Potion)/.test(i.n), chance: [.4, .7, .95, 1], many: true },
  healer: { goods: any(by(/kits/, /Healer|Herbalism/), by(/standard-gear/, /Antitoxin|Soap|Blanket|Vial|Pot, iron/)),
    magic: i => /Healing|Antitoxin|Resistance/.test(i.n) && i.c === 'potion' || /Potion of (Greater |Superior |)Healing/.test(i.n), chance: [.25, .5, .8, .95], many: true },
  temple: { goods: any(by(/holy-symbols/), by(/standard-gear/, /Holy water|Candle|Robes|Book|Ink|Parchment|Bell/)),
    magic: i => /Healing|Protection|Disruption|Holy|Sun Blade|Restorative|Periapt|Necklace of Prayer|Scarab|Spell Scroll \(1st|Spell Scroll \(2nd/.test(i.n) },
  chapel: { goods: any(by(/holy-symbols/), by(/standard-gear/, /Holy water|Candle/)), magic: i => /Potion of Healing|Spell Scroll \(1st/.test(i.n), count: [[2, 3], [2, 4], [3, 5], [3, 5]] },
  shrine: { goods: any(by(/holy-symbols/, /amulet|emblem/), by(/standard-gear/, /Candle|Holy water/)), magic: i => /Potion of Healing/.test(i.n), count: [[1, 3], [2, 3], [2, 4], [2, 4]] },
  wizard: { goods: any(by(/arcane-foci/), by(/standard-gear/, /Component pouch|Spellbook|Ink|Parchment|Paper|Magnifying|Hourglass|Vial|Case, map/), by(/tool/, /Calligrapher/)),
    magic: i => ['wand', 'rod', 'staff', 'ring', 'scroll', 'wondrous-items'].includes(i.c) || /Spell Scroll/.test(i.n), chance: [.5, .8, 1, 1], many: true },
  workshop: { goods: any(by(/tool\/(artisans|musical|other|gaming)/), by(/standard-gear/, /Hammer|Barrel|Basket|Bucket|Chest|Ladder|Pole|Jug|Bottle|Lamp|Lantern|Lock|Abacus|Scale/)),
    magic: i => i.c === 'wondrous-items', count: [[2, 4], [3, 5], [4, 7], [5, 9]] },
  den: { goods: any(by(/tool|kits/, /Thieves|Disguise|Forgery|Poisoner|Dice|Playing card/), by(/standard-gear/, /Poison|Caltrops|Ball bearings|Manacles|Lock|Lantern, hooded|Crowbar|Signet|Clothes, (costume|fine)|Perfume/), by(/^weapon\/simple/, /Dagger|Dart|Club|Sling|Light crossbow/)),
    magic: () => true, chance: [.2, .35, .5, .7], cheap: .6 },   // stolen goods: anything, under the price
  market: { goods: any(by(/standard-gear/, /Basket|Blanket|Bucket|Candle|Clothes, common|Jug|Pot|Rations|Sack|Soap|Rope, hempen|Torch|Pouch|Bell|Fishing/), by(/^ride\/mounts/, /Mastiff|Mule|Donkey|Pony/), by(/^ride\/tack/, /Feed/), by(/musical|gaming/)),
    magic: i => i.r === 'common' || i.r === 'uncommon', count: [[3, 6], [6, 10], [9, 15], [12, 20]] },
  tavern: { goods: by(/gaming/), magic: () => false, count: [[1, 2], [1, 2], [1, 2], [1, 2]], chance: [0, 0, 0, 0] },
};
export const SELLS_KINDS = Object.keys(SELLS);
const COUNT = [[3, 5], [5, 9], [8, 14], [12, 20]];
const CHANCE = [.03, .12, .3, .6];              // a little magic on the shelf, by size
const CAP = [1, 1, 2, 2];                       // best rarity (index into RARITY) a place this size stocks
const qtyOf = (rng, gp, g) => g.startsWith('ride/mounts') ? int(rng, 1, 3) : g.startsWith('ride/') ? 1 : gp < 1 ? int(rng, 5, 20) : gp < 10 ? int(rng, 1, 6) : gp < 100 ? int(rng, 1, 3) : 1;

// The stock of a shop of this kind, in a place of this size: [{ n, gp, qty, magic?, r? }], sorted by price,
// or null for kinds that keep their own menu (inns, bakers, jewellers, bankers). The prices carry the
// keeper's markup (and +15% in a hamlet, where nothing comes easily).
export function stockFor(kind, seed, size = 'town') {
  const S = SELLS[kind]; if (!S) return null;
  const rng = rngOf((seed | 0) * 31 + 977), t = tierOf(size), mark = (.9 + rng() * .35) * (t === 0 ? 1.15 : 1) * (S.cheap || 1);
  const pool = ITEMS.filter(i => S.goods(i) && !BOATS.test(i.n) && !(t < 2 && /Barding|Carriage|Plate Armor/.test(i.n)));
  const [lo, hi] = (S.count || COUNT)[t];
  const out = shuffle(rng, pool).slice(0, int(rng, lo, hi)).map(i => ({ n: i.n, gp: round(i.gp * mark), qty: qtyOf(rng, i.gp, i.g) }));
  // magic on the shelf: the best a place this size gets, sometimes one better in a city
  if (rng() < (S.chance || CHANCE)[t]) {
    const cap = Math.min(4, CAP[t] + (t === 3 && rng() < .15 ? 1 : 0));
    const mp = MAGIC.filter(i => S.magic(i) && RARITY.indexOf(i.r) <= cap && RARITY.indexOf(i.r) >= 0);
    for (let k = 0, n = S.many ? int(rng, 1, 1 + t) : 1; k < n && mp.length; k++) {
      const i = pick(rng, mp); if (out.some(o => o.n === i.n)) continue;
      out.push({ n: i.n, gp: round(magicPrice(rng, i) * mark), qty: CONSUMABLE(i) ? int(rng, 1, 3) : 1, magic: true, r: i.r });
    }
  }
  return out.sort((a, b) => a.gp - b.gp);
}
const round = v => v >= 10 ? Math.round(v) : v >= 1 ? Math.round(v * 10) / 10 : Math.max(.01, Math.round(v * 100) / 100);
export const price = v => v >= 1 ? `${(v >= 10 ? Math.round(v) : +v.toFixed(1)).toLocaleString()} gp` : v >= .1 ? `${Math.round(v * 10)} sp` : `${Math.max(1, Math.round(v * 100))} cp`;
export const stockLine = s => `${s.qty > 1 ? s.qty + ' × ' : ''}${s.n}${s.magic ? ` (${s.r})` : ''} — ${price(s.gp)}${s.qty > 1 ? ' each' : ''}`;

// ---------------------------------------------------------------- rare finds
// A real magic item, rare or better, somewhere it doesn't belong. What it looks like to anyone who
// doesn't know (players see this), what it really is (the GM sees this), how it got here, and whether
// its owner knows.
const LOOKS = [
  [/Sword|Blade|Brand|Tongue|Avenger|Vorpal|Defender|Stealer|Slayer|Scimitar|Sharpness|Wounding|Weapon/, ['a rusty old sword', 'a notched sword with a cracked grip', 'a black-bladed sword nobody will touch', 'a sword wrapped in sacking']],
  [/Hammer|Mace/, ['a heavy old hammer', 'a dented iron mace', 'a hammer with a worn holy sign on it']],
  [/Axe/, ['a chipped axe', 'a woodsman\'s axe, far too fine']], [/Dagger/, ['a plain, tarnished dagger', 'a little knife with a green stone']],
  [/Bow/, ['a warped old bow', 'an unstrung bow of pale wood']], [/Trident/, ['a fishing trident']], [/Javelin/, ['a bundle of old spears']],
  [/Shield/, ['a battered shield', 'a shield with the paint flaked off']], [/Armor|Mail|Plate/, ['a dented suit of armour', 'old armour gone green', 'a mail shirt rusted at the seams']],
  [/Ring/, ['a tarnished ring', 'a plain iron ring', 'a ring too big for any finger here']], [/Staff/, ['a walking stick', 'a gnarled old staff']], [/Wand/, ['a carved stick', 'a polished bone rod']], [/Rod/, ['an iron rod', 'a bent poker']],
  [/Cloak|Cape|Robe|Mantle/, ['a moth-eaten cloak', 'a faded old robe']], [/Boots|Slippers/, ['a pair of worn boots', 'mismatched old boots']], [/Gloves|Gauntlets|Bracers/, ['a pair of old gloves', 'scuffed leather bracers']],
  [/Bag|Sack|Haversack/, ['a patched sack', 'an old bag']], [/Belt/, ['a cracked leather belt']], [/Helm|Circlet|Headband|Hat/, ['a dented helm', 'a bent circlet', 'a battered hat']],
  [/Amulet|Necklace|Periapt|Medallion|Brooch|Scarab|Talisman/, ['a cheap-looking pendant', 'a brooch with a cloudy stone', 'a string of dull beads']],
  [/Horn/, ['an old hunting horn']], [/Lantern|Lamp/, ['a sooty lantern']], [/Ball|Orb|Gem|Stone|Pearl/, ['a cloudy glass ball', 'a pretty river stone']], [/Carpet/, ['a threadbare rug']],
  [/Bottle|Decanter|Jug|Flask/, ['a stoppered old bottle', 'a cracked jug']], [/Figurine|Statuette/, ['a little carved figure']], [/Mirror/, ['a tarnished hand mirror']], [/Deck|Cards/, ['a greasy deck of cards']], [/Manual|Tome|Book/, ['a mouldy book nobody can read']],
];
const lookOf = (rng, i) => { for (const [re, l] of LOOKS) if (new RegExp(re.source, 'i').test(i.n)) return pick(rng, l); return pick(rng, ['an odd old thing', 'a curio nobody can name', 'a keepsake in a box']); };
const KNOWS = { none: 6, suspects: 3, hides: 2, hunted: 1 };
const KNOW_TEXT = { none: 'has no idea what it is', suspects: 'suspects it is more than it looks', hides: 'knows exactly what it is and tells no one', hunted: 'knows what it is, and someone is hunting for it' };
const HOW = ['inherited it from a grandparent who never said where it came from', 'found it in a ploughed field', 'took it off a dead man on the road', 'won it at dice from a stranger', 'bought it in a job lot from a house clearance', 'pulled it out of the river', 'was given it by a dying knight', 'dug it up planting turnips', 'found it in the rafters when the roof was mended', 'took it in payment for a debt', 'traded a goat for it', 'found it on the doorstep one winter'];
const USE = {
  weapon: ['uses it to drive in fence posts', 'hangs it over the hearth', 'props the door open with it', 'chops kindling with it', 'keeps it under the bed, just in case'],
  armor: ['keeps it in the barn under a tarp', 'uses it as a scarecrow\'s coat', 'lets the children play knights in it'],
  other: ['keeps it on the mantel', 'uses it every day without thinking', 'keeps it in a locked box', 'wears it for luck', 'gave it to a child as a toy', 'keeps meaning to sell it'],
};
const TWIST = ['It is cursed, a little.', 'Its old owner wants it back, and is close.', 'A cult has been looking for it for years.', 'It chose them; it keeps coming back if sold.', 'It talks, but only to children.', 'A temple would pay well to have it, no questions asked.', 'It is one of a pair. The other is in a dragon\'s hoard.', null, null, null];
const FIND_RARITY = { uncommon: 30, rare: 45, 'very rare': 18, legendary: 7 };

// where: 'shop' (it's on sale, priced by what the keeper thinks it is), 'person' or 'building'.
export function rareFind(seed, where = 'person') {
  const rng = rngOf((seed | 0) * 17 + 4241), r = wpick(rng, FIND_RARITY);
  const pool = MAGIC.filter(i => i.r === r && !CONSUMABLE(i));
  // 2 in 5 are one of a kind (relics.js): rolled base, power and maybe a curse, named by the local model
  const relic = rng() < .4 ? makeRelic((seed | 0) * 3 + 11, { rarity: r }) : null;
  const i = relic ? { n: relic.name, r, c: relic.kind, base: relic.base } : pick(rng, pool.length ? pool : MAGIC);
  const knows = wpick(rng, KNOWS), kind = i.c === 'weapon' ? 'weapon' : i.c === 'armor' ? 'armor' : 'other';
  const F = { n: i.n, r: i.r, c: i.c, relic, look: lookOf(rng, relic ? { n: relic.base } : i), knows, how: pick(rng, HOW), use: pick(rng, USE[kind]), twist: relic?.curse ? null : pick(rng, TWIST), value: relic ? relic.value : magicPrice(rng, i) };
  if (where === 'shop') F.gp = knows === 'none' ? int(rng, 2, 25) : knows === 'suspects' ? int(rng, 40, 200) : round(F.value * (1 + rng() * .3));
  return F;
}
// The GM's line for a find. who: 'The keeper', 'Wenna Holt'...
export const findText = (F, who = 'The owner') => `${F.look[0].toUpperCase() + F.look.slice(1)} is really ${F.relic ? `${F.relic.name}, a one-of-a-kind ${F.r} ${F.relic.base} (worth ~${price(F.value)}): ${F.relic.power}${F.relic.boon ? ' ' + F.relic.boon : ''}${F.relic.curse ? ' Cursed: ' + F.relic.curse : ''}${F.relic.lore ? ' ' + F.relic.lore : ''}` : `${/^[AEIOU]/.test(F.n) ? 'an' : 'a'} ${F.n} (${F.r}, worth ~${price(F.value)}).`} ${who} ${F.how}, ${F.gp == null ? F.use + ', ' : ''}and ${KNOW_TEXT[F.knows]}.${F.twist ? ' ' + F.twist : ''}`;
// How often: a special building, a shop's shelf, any rolled person.
export const FIND_CHANCE = { building: 1 / 25, shop: 1 / 15, person: 1 / 80 };
export const findRoll = (seed, where) => rngOf((seed | 0) * 13 + 7717)() < FIND_CHANCE[where];
