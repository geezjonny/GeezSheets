import { campaignPick, campaignList, CAMPAIGN_POOLS, personalInvolvement, ORDINARY_BACKSTORIES, ORDINARY_SECRETS, conspiracySecret } from './campaign-flavor.js';
// The GM's rollers. A few base rollers (NPC, loot, trap, building) and the rest built from them:
//   shopkeeper = NPC + stock/loot;  special site = type -> traps + loot + N NPCs/creatures;
//   place / city = N buildings -> each building has N NPCs;  quest = a minor or major rumour/hook;
//   something strange = an interesting NPC, a town or road event, weather, an item, something fun.
// Every roller is a pure function of (seed, options[, world]) and returns a card model:
//   { roller, seed, opts, title, sub, sections: [{ t, gm, rows, list, text, people, buildings }] }
// gm: true sections are hidden from players.
import { mulberry } from './noise.js';
import { rollEncounter } from './encounters.js';
import { rollRelic, RARITIES, RELIC_KINDS } from './relics.js';
import { stockFor, stockLine, rareFind, findRoll, findText, SELLS_KINDS } from './shops.js';
import { pick, wpick, int, cap, shuffle, fill, faction, FACTIONS, SHOP, HOOKS, RUMOURS, ATMOS, ODD, DANGER, TRAITS, SUR, FIRST, RACES, PRE, SUF, ADJ, NOUN, THREATS, KINDS, rollPlace, governmentOf, FACTION_LABEL, placeName } from './lore.js';

const rngOf = seed => mulberry((seed | 0) || 1);
const sub = (seed, k) => ((seed | 0) + 7919 * k) | 0;            // a child roll's seed
const town = rng => placeName(rng, 'town');
const gp = n => `${Math.round(n).toLocaleString()} gp`;
const lv = o => Math.max(1, Math.min(20, +o.level || 3));
const tierOf = l => l <= 4 ? 0 : l <= 10 ? 1 : l <= 16 ? 2 : 3;
const ctxOf = (rng, extra = {}) => ({ npc: `${pick(rng, FIRST.human)} ${pick(rng, SUR)}`, ruler: `Lord ${pick(rng, SUR)}`, faction: FACTIONS.guild.name(rng), hidden: FACTIONS.thieves.name(rng), near: town(rng), land: pick(rng, ['hills', 'woods', 'marsh', 'fields', 'peaks']), building: 'mill', cultish: FACTIONS.cult.name(rng), name: town(rng), ...extra });

// ================================================================ NPC (base)
const ROLES = ['farmer', 'guard', 'merchant', 'priest', 'smith', 'innkeeper', 'hunter', 'sailor', 'scribe', 'thief', 'soldier', 'noble', 'beggar', 'healer', 'miner', 'bard', 'cook', 'tanner', 'fence', 'mercenary', 'witch', 'gravedigger', 'ratcatcher', 'tax collector', 'courier', 'knight', 'sage', 'pilgrim'];
const STATS = { farmer: 'Commoner', guard: 'Guard', merchant: 'Commoner', priest: 'Priest', acolyte: 'Acolyte', smith: 'Commoner', innkeeper: 'Commoner', hunter: 'Scout', sailor: 'Bandit', scribe: 'Commoner', thief: 'Spy', soldier: 'Veteran', noble: 'Noble', healer: 'Acolyte', bard: 'Commoner', fence: 'Spy', mercenary: 'Thug', thug: 'Thug', witch: 'Cult Fanatic', knight: 'Knight', sage: 'Mage', wizard: 'Mage', pilgrim: 'Acolyte', bandit: 'Bandit', 'bandit captain': 'Bandit Captain', cultist: 'Cultist', 'cult leader': 'Cult Fanatic', 'captain of the watch': 'Veteran', sergeant: 'Veteran', watchman: 'Guard' };
const HAIR = ['black', 'dark brown', 'brown', 'chestnut', 'auburn', 'red', 'copper', 'sandy', 'blond', 'ash blond', 'grey', 'white', 'bald', 'shaved', 'dyed blue', 'streaked with grey'];
const HAIR_STYLE = ['cropped short', 'long and braided', 'tied back', 'wild and unkempt', 'in a topknot', 'greasy and lank', 'curly', 'hidden under a hood'];
const CLOTHES = ['a patched wool tunic', 'a stained leather apron', 'fine but threadbare silks', 'a grey habit', 'a sailor\'s oilskin coat', 'a smock and straw hat', 'a velvet doublet', 'rags tied with twine', 'a travel-worn cloak and boots', 'a tabard over mail', 'a fur-trimmed mantle', 'bright, mismatched motley', 'a blacksmith\'s scorched leathers', 'mourning black'];
const ARMOUR = { none: 50, 'padded armour': 10, 'leather armour': 14, 'studded leather': 6, 'hide armour': 4, 'chain shirt': 7, 'scale mail': 3, 'chain mail': 3, breastplate: 2, 'plate (old, dented)': 1 };
const WEAPON = { none: 30, dagger: 18, club: 8, shortsword: 8, handaxe: 5, spear: 6, quarterstaff: 6, 'light crossbow': 4, shortbow: 4, longsword: 4, mace: 3, warhammer: 2, rapier: 2 };
const DEMEANOUR = ['cheerful', 'gruff', 'nervous', 'suspicious', 'friendly', 'arrogant', 'weary', 'pious', 'greedy', 'kind', 'sly', 'brooding', 'flirtatious', 'blunt', 'shy', 'boastful', 'calm', 'hot-tempered', 'melancholy', 'curious'];
const BACKSTORY = ['Grew up an orphan in the temple and left on bad terms.', 'Fought in the border war; won\'t talk about it.', 'Came here fleeing a debt in the capital.', 'Born here; has never been more than ten miles away.', 'Was an apprentice wizard until an accident.', 'Lost a spouse to the fever two winters ago.', 'Once rode with a bandit gang; reformed, mostly.', 'Inherited the family trade and hates it.', 'Was a sailor until a shipwreck took the whole crew.', 'Raised by a hedge witch in the woods.', 'Arrived last spring with a lot of coin and no past.', 'A noble\'s bastard, sent away to keep things quiet.', 'Survived a dragon attack as a child; still has the burns.', 'Ran away from an arranged marriage.'];
// Additional hand-authored roller entries.
BACKSTORY.push(
  "Served as a lighthouse keeper until the light began answering.",
  "Spent seven years copying a book that vanished on completion.",
  "Bought freedom by guiding soldiers through a flooded mine.",
  "Was the sole witness to a saint refusing a miracle.",
  "Raised a sibling on wages from cleaning the gallows.",
  "Kept bees until the honey began tasting of iron.",
  "Delivered letters across enemy lines under a borrowed name.",
  "Learned medicine in a prison infirmary.",
  "Lost the family orchard to a fraudulent royal survey.",
  "Built coffins during a winter when the ground would not thaw.",
  "Returned from a pilgrimage to find the village abandoned.",
  "Spent a decade maintaining a bridge no map records.",
  "Was adopted by the household of a disgraced executioner.",
  "Worked in a salt mine and bought out three fellow workers.",
  "Once kept the accounts for a travelling menagerie.",
  "Survived a siege by growing mushrooms in the crypts.",
  "Served a noble family erased from the official histories.",
  "Trained as a bell founder but cannot bear their sound.",
  "Smuggled grain into a quarantined town.",
  "Inherited a ferry and the debts of everyone who drowned.",
  "Was dismissed for refusing to burn a forbidden manuscript.",
  "Spent a year searching for a child who returned alone.",
  "Grew up tending the garden of an isolated asylum.",
  "Tracked a stolen horse farther than any army had marched.",
  "Buried an enemy soldier and still writes to their family."
);
const SECRETS = ['is an informant for the thieves\' guild', 'buried a body under the old mill', 'is not who they claim to be', 'owes a dangerous favour to a cult', 'saw what really happened on the night of the fire', 'worships a forbidden god in secret', 'has a stash of stolen silver', 'is a lycanthrope, barely in control', 'forged the deed to their own house', 'knows a hidden way into the keep', 'is a spy for a rival lord', 'is secretly married to two people', 'poisoned their former master', 'is a deserter with a price on their head'];
const ARMED = new Set(['guard', 'soldier', 'mercenary', 'knight', 'hunter', 'thief', 'thug', 'watchman', 'captain of the watch', 'sergeant', 'bandit', 'bandit captain', 'cultist', 'cult leader']);

export function makeNPC(seed, opts = {}) {
  const rng = rngOf(seed), occult = !!opts.conspiracy||/cultist|cult leader|witch|wizard|vampire|illithid|necromancer|oracle|doppelganger|dragon in disguise/i.test(opts.role||'')||personalInvolvement(rngOf(sub(seed, 881))), race = opts.race && FIRST[opts.race] ? opts.race : wpick(rng, RACES), role = opts.role || pick(rng, occult?ROLES:ROLES.filter(r=>r!=='witch'));
  const first = pick(rng, FIRST[race] || FIRST.human), last = race === 'human' || race === 'halfling' || rng() < .55 ? pick(rng, SUR) : null;
  const hair = pick(rng, HAIR);
  let armour = wpick(rng, ARMOUR), weapon = wpick(rng, WEAPON);
  if (ARMED.has(role)) { if (armour === 'none') armour = pick(rng, ['leather armour', 'chain shirt', 'padded armour']); if (weapon === 'none') weapon = pick(rng, ['shortsword', 'spear', 'longsword', 'shortbow']); }
  return {
    id: opts.id || 'p_' + (seed >>> 0).toString(36), seed,
    gender: wpick(rng, { man: 46, woman: 46, 'non-binary': 8 }), first, last, name: last ? `${first} ${last}` : first, race, role,
    age: pick(rng, ['young', 'young', 'adult', 'adult', 'middle-aged', 'middle-aged', 'old', 'venerable']), demeanour: pick(rng, DEMEANOUR),
    hair: hair === 'bald' || hair === 'shaved' ? hair : `${hair}, ${pick(rng, HAIR_STYLE)}`, clothing: pick(rng, CLOTHES),
    armour: armour === 'none' ? null : armour, weapon: weapon === 'none' ? null : weapon,
    occult, conspiracyId:opts.conspiracy?.id||null,
    backstory: rng() < .75 ? (occult?campaignPick(rng, 'BACKSTORY', BACKSTORY):pick(rng,ORDINARY_BACKSTORIES)) : null, secret: opts.conspiracy?conspiracySecret(opts.conspiracy):occult?pick(rng,CAMPAIGN_POOLS.SECRETS):rng()<.55?pick(rng,ORDINARY_SECRETS):null,
    trait: pick(rng, TRAITS), stats: STATS[role] || 'Commoner',
    find: !occult || opts.find === false || !findRoll(seed, 'person') ? null : rareFind(seed, 'person'),
  };
}
export function npcSections(p) {
  return [
    { t: 'Who', rows: [['Gender', p.gender], ['First name', p.first], ['Last name', p.last || '—'], ['Race', p.race], ['Age', p.age], ['Role', p.role], ['Demeanour', p.demeanour]] },
    { t: 'Look', rows: [['Hair', p.hair], ['Clothing', p.clothing], ['Armour', p.armour || '—'], ['Weapon', p.weapon || '—']] },
    p.backstory ? { t: 'Backstory', text: p.backstory } : null,
    { t: 'Secret', gm: true, rows: [['Secret', p.secret ? cap(p.secret) + '.' : 'None'], ['Stat block', p.stats]] },
    p.find ? { t: 'Rare find', gm: true, text: findText(p.find, p.first) } : null,
  ].filter(Boolean);
}
export const npcModel = (p, seed = p.seed, opts = {}) => ({ roller: 'npc', seed, opts, title: p.name, sub: `${cap(p.race)} ${p.role}`, person: p, sections: npcSections(p) });
export const rollNPC = (seed, opts = {}) => npcModel(makeNPC(seed, opts), seed, opts);

// ================================================================ loot (base): SRD rolls + a special item, if any
const SRD = {
  common: ['Potion of Healing', 'Spell Scroll (cantrip)', 'Spell Scroll (1st level)', 'Potion of Climbing'],
  uncommon: ['Bag of Holding', 'Cloak of Protection', 'Weapon, +1', 'Shield, +1', 'Boots of Elvenkind', 'Wand of Magic Missiles', 'Immovable Rod', 'Goggles of Night', 'Ring of Jumping', 'Potion of Greater Healing', 'Decanter of Endless Water', 'Pearl of Power', 'Gloves of Thievery', 'Rope of Climbing', 'Eyes of the Eagle', 'Alchemy Jug', 'Brooch of Shielding', 'Slippers of Spider Climbing', 'Spell Scroll (2nd level)', 'Potion of Fire Breath'],
  rare: ['Weapon, +2', 'Armor, +1', 'Flame Tongue', 'Ring of Protection', 'Cloak of Displacement', 'Wand of Fireballs', 'Boots of Speed', 'Amulet of Health', 'Bracers of Defense', 'Necklace of Fireballs', 'Staff of the Woodlands', 'Belt of Dwarvenkind', 'Ring of Evasion', 'Potion of Superior Healing', 'Spell Scroll (4th level)', 'Bag of Tricks', 'Cape of the Mountebank'],
  'very rare': ['Weapon, +3', 'Armor, +2', 'Frost Brand', 'Carpet of Flying', 'Ring of Regeneration', 'Staff of Fire', 'Manual of Bodily Health', 'Potion of Supreme Healing', 'Cloak of the Bat', 'Spell Scroll (7th level)', 'Rod of Absorption'],
  legendary: ['Vorpal Sword', 'Holy Avenger', 'Cubic Gate', 'Robe of the Archmagi', 'Staff of the Magi', 'Ring of Three Wishes', 'Armor of Invulnerability', 'Luck Blade'],
};
const GEMS = [[10, ['azurite', 'hematite', 'malachite', 'obsidian', 'turquoise']], [50, ['bloodstone', 'carnelian', 'moonstone', 'onyx', 'zircon']], [100, ['amber', 'amethyst', 'garnet', 'jade', 'pearl']], [500, ['alexandrite', 'black pearl', 'topaz', 'aquamarine']], [1000, ['emerald', 'fire opal', 'sapphire']], [5000, ['black sapphire', 'diamond', 'ruby']]];
const ART = [[25, ['a silver ewer', 'a carved bone statuette', 'a gold bracelet', 'an embroidered silk handkerchief']], [250, ['a gold ring set with bloodstones', 'a carved ivory statuette', 'a brass mug with jade inlay', 'a bronze crown']], [750, ['a silver chalice set with moonstones', 'a gold bird cage with electrum filigree', 'a painted gold war mask']], [2500, ['a fine gold chain set with a fire opal', 'an old masterpiece painting', 'an embroidered silk and velvet mantle set with moonstones']]];
const TRINKETS = ['a glass eye', 'a tiny iron key', 'a letter never sent', 'a dried flower in wax', 'a bone die that always rolls 4', 'a map with an X and no names', 'a wooden toy soldier', 'a lock of silver hair', 'a ring too small for any finger', 'a vial of grave dirt', 'a tin whistle only dogs hear', 'a pressed four-leaf clover', 'a dead man\'s IOU for 300 gp'];
// Additional hand-authored roller entries.
TRINKETS.push(
  "a brass moth with one broken wing",
  "a spool of black funeral thread",
  "a clay pilgrim badge",
  "a folded paper boat stained with salt",
  "a tooth wrapped in red silk",
  "a copper token for a demolished bridge",
  "a miniature pewter coffin",
  "a cracked lens in a wooden frame",
  "a petrified apple seed",
  "a silver button bearing a vanished crest",
  "a pocket calendar missing every seventh day",
  "a wax seal showing a chained sun",
  "a lead fishing weight shaped like a saint",
  "a burnt fragment of a wedding veil",
  "a tiny carved ladder",
  "a bootlace threaded through seven beads",
  "a theatre ticket written on bark",
  "a rusted spur tied with blue ribbon",
  "a dried beetle in a matchbox",
  "a list of names stitched into a cuff",
  "a ceramic bird whistle full of sand",
  "a mourning brooch with an empty setting",
  "a fragment of a painted star chart",
  "a wooden coin bearing two tails",
  "a thimble engraved with a warning"
);
// one of a kind: a base thing, a property, a quirk, a history
const SP_BASE = ['dagger', 'longsword', 'shield', 'ring', 'amulet', 'cloak', 'lantern', 'mirror', 'helm', 'gauntlet', 'staff', 'book', 'bell', 'flute', 'compass', 'key', 'cup', 'crown', 'boots', 'skull'];
const SP_OF = ['the Drowned King', 'Ashes', 'the Hollow Moon', 'Last Light', 'the Ninth Bell', 'Whispers', 'the Pale Saint', 'Quiet Thunder', 'Embers', 'the Lost Road', 'the Wolf Mother', 'Salt and Bone'];
const SP_PROP = ['glows faintly near undead', 'once a day, casts Misty Step for its bearer', 'is always warm, even in snow', 'lets its bearer speak with crows', 'grants advantage on one save, once a day', 'stores one spell of up to 2nd level', 'shows the way to the nearest water', 'can\'t be seen by goblins', 'deals +1d4 fire damage (if a weapon) or sheds firelight on command', 'tells its bearer, once a day, whether a statement is a lie', 'makes no sound, ever', 'turns into a raven for an hour at dusk'];
const SP_QUIRK = ['hums when danger is near', 'whispers its old owner\'s name at night', 'is heavier when its bearer lies', 'smells of rain', 'makes its bearer crave salt', 'refuses to be sold (it comes back)', 'gets colder near gold', 'occasionally weeps a single drop of water'];
const SP_HIST = ['forged for a queen who never wore it', 'taken from a dragon\'s hoard', 'buried with a hero who isn\'t dead', 'made by a dwarf as an apology', 'won in a game of dice with a devil', 'carried by every captain of a vanished ship', 'stolen from a temple that wants it back', 'found inside a fish'];
export function makeSpecialItem(seed, level = 3) {
  const rng = rngOf(seed), base = pick(rng, SP_BASE);
  return { name: `The ${cap(base)} of ${campaignPick(rng, 'OF', SP_OF)}`, base, rarity: ['uncommon', 'rare', 'very rare', 'legendary'][Math.min(3, tierOf(level) + (rng() < .2 ? 1 : 0))], property: pick(rng, SP_PROP), quirk: pick(rng, SP_QUIRK), history: campaignPick(rng, 'HIST', SP_HIST), value: gp([100, 800, 5000, 25000][tierOf(level)] * (.6 + rng() * .8)) };
}
const spText = S => `${S.name} (${S.rarity} ${S.base}, about ${S.value}): ${S.property}; ${S.quirk}. It was ${S.history}.`;

export function makeLoot(seed, opts = {}) {
  const rng = rngOf(seed), level = lv(opts), t = tierOf(level), kind = opts.kind || 'hoard';
  const coins = [], valuables = [], items = [];
  if (kind === 'pocket') {
    coins.push(`${int(rng, 1, 6) * [1, 5, 20, 80][t]} ${pick(rng, ['cp', 'sp', 'sp', 'gp'])}`); items.push(campaignPick(rng, 'TRINKETS', TRINKETS));
    if (rng() < .1) items.push(pick(rng, SRD.common));
  } else {
    const mul = kind === 'boss' ? 2 : kind === 'stash' ? .5 : 1;
    coins.push(`${Math.round(int(rng, 2, 12) * [60, 400, 3000, 20000][t] * mul)} cp`, `${Math.round(int(rng, 2, 12) * [30, 200, 1500, 9000][t] * mul)} sp`, `${Math.round(int(rng, 1, 6) * [10, 100, 800, 6000][t] * mul)} gp`);
    if (t >= 2) coins.push(`${Math.round(int(rng, 1, 6) * [0, 0, 50, 400][t] * mul)} pp`);
    const g = GEMS[Math.min(GEMS.length - 1, t + int(rng, 0, 2))]; if (rng() < .7) valuables.push(`${int(rng, 1, 3 + t * 2)} × ${pick(rng, g[1])} (${g[0]} gp each)`);
    const a = ART[t]; if (rng() < .5) valuables.push(`${pick(rng, a[1])} (${a[0]} gp)`);
    const rar = [['common', 'uncommon'], ['uncommon', 'rare'], ['rare', 'very rare'], ['very rare', 'legendary']][t];
    const nm = kind === 'boss' ? int(rng, 2, 4) : int(rng, 0, 2);
    for (let k = 0; k < nm; k++) { const r = rng() < .75 ? rar[0] : rar[1]; items.push(`${pick(rng, SRD[r])} (${r})`); }
    if (rng() < .5) items.push(campaignPick(rng, 'TRINKETS', TRINKETS));
  }
  const pSpecial = { pocket: .04, stash: .1, hoard: .25, boss: .6 }[kind] ?? .2;
  const special = opts.special === 'always' || rng() < pSpecial ? makeSpecialItem(sub(seed, 9), level) : null;
  return { level, kind, coins, valuables, items, special };
}
export const lootSections = L => [{ t: 'Coins', list: L.coins }, L.valuables.length ? { t: 'Gems and art', list: L.valuables } : null, L.items.length ? { t: 'Items (SRD)', list: L.items } : null, L.special ? { t: 'Special item', text: spText(L.special) } : null].filter(Boolean);
export const rollLoot = (seed, opts = {}) => { const L = makeLoot(seed, opts); return { roller: 'loot', seed, opts, title: { pocket: 'Pockets', stash: 'A small stash', hoard: 'Treasure hoard', boss: 'Boss hoard' }[L.kind] || 'Loot', sub: `Level ${L.level}`, loot: L, sections: lootSections(L) }; };

// ================================================================ traps (base)
const TRAPS = [
  ['Pit trap', 'a 10 ft covered pit', 'Perception', 'Dex', '1d6 bludgeoning per 10 ft'], ['Poison needle', 'in a lock or chest', 'Investigation', 'Con', 'piercing + poison (poisoned 1 hour)'],
  ['Falling net', 'drops from the ceiling', 'Perception', 'Dex', 'restrained'], ['Poison darts', 'from holes in the walls', 'Perception', 'Dex', 'piercing + poison'],
  ['Collapsing roof', 'tripwire on a cracked ceiling', 'Perception', 'Dex', 'bludgeoning, half on a save'], ['Fire-breathing statue', 'a pressure plate before a statue', 'Investigation', 'Dex', 'fire in a 15 ft cone'],
  ['Rolling sphere', 'a stone ball down a sloped passage', 'Perception', 'Str or Dex', 'bludgeoning, knocked prone'], ['Scything blade', 'a slot in the wall at waist height', 'Perception', 'Dex', 'slashing'],
  ['Glyph of warding', 'a faint rune on the door', 'Investigation (Arcana)', 'Dex', 'thunder or fire'], ['Flooding room', 'the door locks and water pours in', 'Perception', 'Str (to force the door)', 'drowning in 1d4+2 rounds'],
  ['Spiked portcullis', 'drops behind the party', 'Perception', 'Dex', 'piercing, trapped'], ['Sleep gas', 'vents in the floor', 'Perception', 'Con', 'unconscious 10 minutes'],
];
export function makeTrap(seed, level = 3) {
  const rng = rngOf(seed), t = tierOf(level), [name, how, find, save, effect] = pick(rng, TRAPS), sev = wpick(rng, { setback: 5, dangerous: 4, deadly: 1 });
  const dc = [[10, 12, 15], [12, 15, 18], [15, 18, 21], [18, 21, 24]][t][['setback', 'dangerous', 'deadly'].indexOf(sev)];
  const dice = [['1d10', '2d10', '4d10'], ['2d10', '4d10', '10d10'], ['4d10', '10d10', '18d10'], ['10d10', '18d10', '24d10']][t][['setback', 'dangerous', 'deadly'].indexOf(sev)];
  return { name, how, severity: sev, text: `${name} (${sev}): ${how}. Spot: ${find} DC ${dc}. Save: ${save} DC ${dc}. ${dice}, ${effect}. Disarm: DC ${dc} with thieves' tools.` };
}

// ================================================================ buildings (base): kind -> name + N NPCs
const BKINDS = { home: 40, shop: 10, workshop: 14, tavern: 5, inn: 3, smithy: 3, shrine: 4, den: 4, ruin: 4, manor: 3, warehouse: 4, stables: 2 };
const STAFF = {
  home: [], tavern: ['innkeeper', 'barkeep', 'cook', 'serving hand'], inn: ['innkeeper', 'cook', 'stable hand'], shop: ['shopkeeper', 'apprentice'], smithy: ['smith', 'apprentice'],
  temple: ['priest', 'acolyte', 'acolyte'], chapel: ['priest'], shrine: ['priest'], workshop: ['master', 'apprentice'], den: ['thief', 'thug', 'fence'], manor: ['noble', 'steward', 'servant', 'guard'],
  warehouse: ['watchman', 'clerk'], guard: ['sergeant', 'guard', 'guard'], stables: ['stablemaster', 'stable hand'], mill: ['miller', 'farmhand'], farmhouse: ['farmer', 'farmhand'], barn: ['farmhand'],
  barracks: ['captain of the watch', 'soldier', 'soldier'], library: ['archivist', 'scribe'], wizard: ['wizard', 'apprentice'], market: ['market warden', 'merchant', 'merchant'], store: ['shopkeeper'],
  alchemist: ['alchemist'], healer: ['herbalist'], baker: ['baker', 'apprentice'], bowyer: ['bowyer'], jeweler: ['jeweller'], bank: ['moneylender', 'guard'], armory: ['armourer', 'apprentice'], guildhall: ['guild clerk', 'merchant'],
  tanner: ['tanner'], bath: ['attendant'], arena: ['pit master', 'thug'], granary: ['reeve'], toll: ['toll keeper'], ruin: [],
};
const LABEL = k => SHOP[k]?.label || { home: 'Home', shop: 'Shop', workshop: 'Workshop', den: 'Den', manor: 'Manor', warehouse: 'Warehouse', ruin: 'Abandoned house' }[k] || cap(k);
const WORKSHOPS = ['cooper', 'chandler', 'potter', 'weaver', 'carpenter', 'glassblower', 'cobbler', 'locksmith', 'bookbinder', 'clockmaker', 'butcher', 'dyer'];
const INSIDE = ['a shrine to a forbidden god behind a curtain', 'a cellar door with a brand-new lock', 'a cradle, though no child lives here', 'maps of the sewers on the table', 'a stuffed owlbear head over the hearth', 'a stash of 40 gp under a floorboard', 'a room full of ticking clocks', 'a prisoner in the attic', 'nothing at all: it was emptied in a hurry', 'a half-finished letter confessing to a murder', 'the smell of something burning that isn\'t', 'a loom weaving by itself', 'a very fat, very old cat that everyone defers to', 'a wall of portraits with one face scratched out'];
// Additional hand-authored roller entries.
INSIDE.push(
  "a row of muddy boots belonging to nobody present",
  "a hearth bricked up from the inside",
  "a ledger with every payment entered twice",
  "a cupboard full of wedding gifts still wrapped",
  "a narrow staircase hidden by drying herbs",
  "a child's height marks continuing above the ceiling",
  "a table set for a guest who died last winter",
  "a cracked baptismal font used as a washbasin",
  "a cage containing a perfectly silent raven",
  "a bundle of military coats stripped of insignia",
  "a fresh patch of plaster shaped like a doorway",
  "a wheelbarrow full of church bells",
  "a locked chest humming with bees",
  "a portrait painted over with a map",
  "a doorbell connected to a bell underground",
  "a collection of shoes recovered from the river",
  "a cold oven containing a sealed letter",
  "a floor scrubbed clean except for one dark footprint",
  "a cradle used to store tax notices",
  "a suit of armour holding up a sagging beam",
  "a calendar counting down to an unnamed event",
  "a window facing a wall built inches away",
  "a shrine made from broken tools",
  "a cellar full of carefully labelled rainwater",
  "a guest book signed in the same hand for fifty years"
);

export function makeBuilding(seed, opts = {}) {
  const rng = rngOf(seed), kind = opts.kind && STAFF[opts.kind] ? opts.kind : wpick(rng, BKINDS);
  let name = null;
  {
    if (kind === 'home') name = `The ${pick(rng, SUR)} house`;
    else if (kind === 'workshop') name = `${pick(rng, SUR)}'s ${pick(rng, WORKSHOPS)} shop`;
    else if (kind === 'den') name = cap(pick(rng, ['a gambling den', 'a smugglers\' cellar', 'a fence\'s back room', 'a cult meeting house']));
    else if (kind === 'manor') name = `${pick(rng, SUR)} Hall`;
    else if (kind === 'warehouse') name = `The ${pick(rng, ['Saltroad', 'River', 'Copper', 'Lantern'])} warehouse`;
    else if (kind === 'ruin') name = 'An abandoned house';
    else if (kind === 'shop') name = `${pick(rng, SUR)}'s ${pick(rng, ['Goods', 'Sundries', 'Emporium', 'Wares'])}`;
    else if (SHOP[kind]) name = SHOP[kind].name(rng);
    else name = LABEL(kind);
  }
  if (opts.name) name = opts.name; // a given name never changes the rest of the roll
  const roles = [...(STAFF[kind] || [])], extra = kind === 'ruin' ? (rng() < .3 ? 1 : 0) : kind === 'home' ? int(rng, 1, 5) : int(rng, 0, 3);
  for (let k = 0; k < extra; k++) roles.push(kind === 'home' ? pick(rng, ROLES) : pick(rng, ['regular', 'lodger', 'traveller', 'family member', 'hanger-on', 'beggar']));
  const id = opts.id || 'b_' + (seed >>> 0).toString(36);
  const people = roles.slice(0, opts.maxPeople || 8).map((role, k) => makeNPC(sub(seed, k + 1), { role, id: `${id}/${k}`, conspiracy:opts.conspiracy }));
  const B = { id, seed, kind, label: LABEL(kind), name, people, inside: cap(campaignPick(rng, 'INSIDE', INSIDE)) + '.', hook: rng() < .4 ? fill(campaignPick(rng, 'HOOKS', HOOKS), ctxOf(rng)) : null };
  B.stock = shopStock(kind, seed, opts.size);
  if (B.stock && findRoll(seed, 'shop')) { const F = rareFind(seed, 'shop'); B.find = F; B.stock.push({ n: cap(F.look), gp: F.gp, qty: 1, find: true }); }
  else if (findRoll(seed, 'building')) B.find = rareFind(seed, 'building');
  return B;
}
// What a building sells: SRD goods for shops (shops.js), the house menu for inns, bakers, jewellers...
function shopStock(kind, seed, size) {
  const s = stockFor(kind, seed, size); if (s) return kind === 'tavern' ? [...menu(kind, seed), ...s] : s;
  return STOCK[kind] ? menu(kind, seed) : null;
}
function menu(kind, seed) {
  const rng = rngOf(sub(seed, 41)), mark = .85 + rng() * .4;
  return shuffle(rng, STOCK[kind]).slice(0, int(rng, 4, STOCK[kind].length)).map(([n, v]) => ({ n, gp: v * mark, qty: 1, ask: v === 0 }));
}
export const saleLine = s => s.ask ? `${s.n} — ask` : stockLine(s);
const keeperOf = B => B.people[0]?.first || 'The owner';
export const buildingSections = B => [
  B.people.length ? { t: 'Who is here', people: B.people } : { t: 'Who is here', text: 'No one.' },
  B.stock?.length ? { t: 'For sale', list: B.stock.map(saleLine) } : null,
  { t: 'Inside', gm: true, text: B.inside }, B.hook ? { t: 'Hook', gm: true, text: B.hook } : null,
  B.find ? { t: 'Rare find', gm: true, text: findText(B.find, keeperOf(B)) } : null,
].filter(Boolean);
export const buildingModel = (B, seed = B.seed, opts = {}) => ({ roller: 'building', seed, opts, title: B.name, sub: `${B.label} · ${B.people.length} ${B.people.length === 1 ? 'person' : 'people'}`, building: B, sections: buildingSections(B) });
export const rollBuilding = (seed, opts = {}) => buildingModel(makeBuilding(seed, opts), seed, opts);

// ================================================================ shopkeeper = NPC + stock + loot
const STOCK = {
  smithy: [['longsword', 15], ['shortsword', 10], ['mace', 5], ['spear', 1], ['chain shirt', 50], ['shield', 10], ['horseshoes (4)', 1], ['crowbar', 2], ['iron spikes (10)', 1], ['handaxe', 5], ['battleaxe', 10], ['scale mail', 50]],
  alchemist: [['Potion of Healing', 50], ['antitoxin', 50], ['alchemist\'s fire', 50], ['acid (vial)', 25], ['healer\'s kit', 5], ['perfume', 5], ['Potion of Climbing', 75], ['holy water', 25]],
  store: [['hempen rope (50 ft)', 1], ['torches (10)', 1], ['rations (5 days)', 2.5], ['bedroll', 1], ['hooded lantern', 5], ['oil (flask)', .1], ['backpack', 2], ['tinderbox', .5], ['waterskin', .2], ['chalk', .01], ['caltrops', 1], ['grappling hook', 2]],
  bowyer: [['shortbow', 25], ['longbow', 50], ['arrows (20)', 1], ['light crossbow', 25], ['crossbow bolts (20)', 1], ['quiver', 1]],
  jeweler: [['silver ring', 10], ['gold chain', 50], ['pearl earrings', 100], ['signet ring (blank)', 5], ['amethyst pendant', 120]],
  inn: [['ale (mug)', .04], ['wine (bottle)', .2], ['modest meal', .3], ['room (night)', .5], ['stabling (night)', .5], ['hot bath', .1]],
  tavern: [['ale (mug)', .04], ['spirits (cup)', .2], ['stew', .1], ['meat pie', .1], ['a song from the house bard', .1]],
  temple: [['Cure Wounds (service)', 10], ['holy water', 25], ['a blessing', 1], ['Remove Curse (service)', 90], ['burial', 5], ['candles (5)', .05]],
  wizard: [['Spell Scroll (1st level)', 60], ['Spell Scroll (2nd level)', 150], ['component pouch', 25], ['crystal focus', 10], ['spellbook (blank)', 50], ['Identify (service)', 20]],
  stables: [['riding horse', 75], ['pony', 30], ['mule', 8], ['riding saddle', 10], ['cart', 15], ['feed (day)', .05]],
  market: [['bread', .02], ['cheese', .1], ['live chicken', .02], ['bolt of cloth', 1], ['spices (pinch)', 1], ['knife', .5]],
  healer: [['healing salve', 10], ['herbalism kit', 5], ['antitoxin', 50], ['sleep draught', 5], ['bandages', .1]],
  baker: [['bread', .02], ['honey cake', .05], ['travel biscuit (10)', .2]],
  bank: [['loan (100 gp, 10% a month)', 0], ['safe box (month)', 1], ['letter of credit', 2], ['money changing (5%)', 0]],
};
const HAGGLE = ['haggles hard and enjoys it', 'fixed prices, no exceptions', 'gives discounts to flatterers', 'overcharges strangers by a third', 'sells cheap for a good story', 'coin up front, always', 'generous with locals, cold to outsiders', 'will trade for news instead of coin'];
// Additional hand-authored roller entries.
HAGGLE.push(
  "accepts repairs as part payment",
  "offers a discount for exact change",
  "keeps prices written under the counter",
  "asks buyers to name a fair price first",
  "charges less for visibly mended goods",
  "will barter for lamp oil",
  "reserves the best stock for returning customers",
  "offers credit only with a local witness",
  "reduces the price if the buyer carries a parcel",
  "refuses coins bearing the former ruler",
  "wraps every purchase before discussing payment",
  "lets an apprentice set prices on market day",
  "trades at cost for medicine",
  "adds a small fee for delivery after dark",
  "asks for a useful rumour with every sale",
  "offers a discount for bringing empty jars",
  "insists on weighing all silver",
  "sells damaged stock honestly and cheaply",
  "will accept clean wool instead of coin",
  "matches another local shop's written price",
  "gives mourners a quiet discount",
  "has a strict one-customer-at-a-time rule",
  "allows three days to return unused goods",
  "asks strangers for a reference from the inn",
  "offers instalments secured by a personal keepsake"
);
export function rollShop(seed, opts = {}) {
  const rng = rngOf(seed), kinds = SHOP_KINDS, kind = opts.kind && kinds.includes(opts.kind) ? opts.kind : pick(rng, kinds), s = SHOP[kind], level = lv(opts);
  const keeper = makeNPC(sub(seed, 1), { role: s.role });
  const stock = shopStock(kind, seed, opts.size || 'town');
  const find = findRoll(seed, 'shop') ? rareFind(seed, 'shop') : null;
  if (find) stock.push({ n: cap(find.look), gp: find.gp, qty: 1, find: true });
  const loot = makeLoot(sub(seed, 2), { level, kind: 'stash' });           // what's in the back room / for the right buyer
  return {
    roller: 'shop', seed, opts, shopKind:kind, title: s.name(rng), sub: `${s.label} · ${keeper.name}`, person: keeper,
    sections: [
      { t: 'Shopkeeper', people: [keeper], rows: [['Haggling', campaignPick(rng, 'HAGGLE', HAGGLE)]] },
      { t: 'For sale', list: stock.map(saleLine) },
      find ? { t: 'Rare find', gm: true, text: findText(find, keeper.first) } : null,
      { t: 'Under the counter', gm: true, list: [...loot.items, ...loot.valuables, loot.special ? spText(loot.special) : null].filter(Boolean).concat(loot.items.length + loot.valuables.length ? [] : ['nothing special']) },
      { t: 'Strongbox', gm: true, list: loot.coins },
      { t: 'Rumour', text: `“${fill(campaignPick(rng, 'RUMOURS', RUMOURS), ctxOf(rng))}”` },
    ].filter(Boolean),
  };
}
const SHOP_KINDS = [...new Set([...SELLS_KINDS, ...Object.keys(STOCK)])].filter(k => SHOP[k]);

// ================================================================ special site = type -> traps + loot + N NPCs/creatures
const SITES = {
  barrow: { what: 'a chieftain\'s barrow', word: 'Barrow', foes: ['skeletons', 'zombies', 'a wight', 'giant rats'], leader: null },
  sunken: { what: 'a sunken temple', word: 'Drowned Temple', foes: ['merrow', 'sahuagin', 'giant crabs', 'a water weird'], leader: 'cult leader' },
  lair: { what: 'a monster\'s lair', word: 'Lair', foes: ['an owlbear', 'a manticore', 'a pack of worgs', 'a troll'], leader: null },
  portal: { what: 'a standing portal to elsewhere', word: 'Gate', foes: ['imps', 'quasits', 'a barbed devil', 'cultists'], leader: 'cult leader' },
  battlefield: { what: 'an old battlefield', word: 'Field', foes: ['ghouls', 'skeletons', 'a banshee', 'crows (many)'], leader: null },
  crypt: { what: 'a noble family\'s crypt', word: 'Crypt', foes: ['skeletons', 'a ghost', 'specters', 'a mummy'], leader: null },
  tower: { what: 'a wizard\'s abandoned tower', word: 'Spire', foes: ['animated armour', 'flying swords', 'a gargoyle', 'a homunculus'], leader: 'wizard' },
  mine: { what: 'a collapsed mine', word: 'Delve', foes: ['kobolds', 'a grick', 'duergar', 'a rust monster'], leader: null },
  grove: { what: 'a corrupted sacred grove', word: 'Grove', foes: ['twig blights', 'needle blights', 'a dryad (charmed)', 'giant spiders'], leader: 'witch' },
  wreck: { what: 'a wrecked ship in the marsh', word: 'Wreck', foes: ['ghouls', 'giant crabs', 'a will-o\'-wisp', 'bandits'], leader: 'bandit captain' },
  cave: { what: 'a cave system', word: 'Caves', foes: ['goblins', 'wolves', 'a bugbear', 'a giant spider'], leader: null },
  ruin: { what: 'a ruined keep', word: 'Ruin', foes: ['bandits', 'orcs', 'a ghast', 'stirges'], leader: 'bandit captain' },
  shrine: { what: 'a forgotten shrine', word: 'Shrine', foes: ['cultists', 'shadows', 'a specter'], leader: 'cult leader' },
  camp: { what: 'a raiders\' camp', word: 'Camp', foes: ['bandits', 'thugs', 'mastiffs'], leader: 'bandit captain' },
};
const WAS = ['the tomb of a tyrant', 'a temple to a dead god', 'a dwarven outpost', 'an elven observatory', 'a smugglers\' den', 'a plague hospital', 'a wizard\'s laboratory', 'a prison for something old', 'a royal hunting lodge', 'a monastery'];
// Additional hand-authored roller entries.
WAS.push(
  "a bell foundry closed after a fatal casting",
  "a royal mint abandoned during a rebellion",
  "a hospice for pilgrims who never recovered",
  "a border station on a road that disappeared",
  "a reservoir beneath a vanished city",
  "a retreat for disgraced judges",
  "a storehouse for a famine relief fleet",
  "a monastery devoted to recording dreams",
  "a quarry that supplied royal tombs",
  "a refuge built against a promised flood",
  "a prison for defeated court magicians",
  "a tower used to measure the stars",
  "a sanctuary for wounded messenger birds",
  "a glassworks supplied by volcanic heat",
  "a chapel raised over an execution ground",
  "a bathhouse fed by a sacred spring",
  "an embassy to a kingdom now underwater",
  "a treasury disguised as a granary",
  "a hospital sealed during a plague",
  "a ferry station on a diverted river",
  "a fort built to watch an empty valley",
  "a school for the children of hostages",
  "a shrine where soldiers surrendered their names",
  "a wine cellar beneath a burned palace",
  "an archive containing records of the unburied"
);
const ROOMS = {
  entrance: ['A collapsed doorway, half buried.', 'A rope bridge over a chasm.', 'A flooded stair.', 'A gate with a riddle carved above it.'],
  puzzle: ['Statues that turn to face whoever lies.', 'Tiles that sink unless stepped in order.', 'A locked door that opens to music.', 'A mirror that shows the room as it was.', 'Five levers; three flood the room.'],
  setback: ['The ceiling collapses, splitting the party.', 'A rival party, already looting.', 'An alarm wakes the rest of the site.', 'A false treasure room.', 'The floor gives way into a lower level.'],
  climax: ['A hall of pillars.', 'A ritual circle, half complete.', 'A throne room with a hostage.', 'A cavern around a black pool.'],
  reward: ['The treasure, and a map to somewhere worse.', 'The treasure, but taking it wakes something.', 'A captive who knows a secret.', 'A shrine that grants one boon.'],
};
export function rollSite(seed, opts = {}) {
  const rng = rngOf(seed), kind = SITES[opts.kind] ? opts.kind : (rng()<.7 ? pick(rng, ['barrow','crypt','shrine','sunken','portal']) : pick(rng, Object.keys(SITES))), S = SITES[kind], level = lv(opts);
  const name = pick(rng, [`The ${pick(rng, ADJ)} ${S.word}`, `${pick(rng, PRE)}${pick(rng, SUF)} ${S.word}`, `${S.word} of the ${pick(rng, NOUN)}`]);
  // creatures: a random number of groups, plus named NPCs (a leader, captives, survivors)
  const groups = shuffle(rng, S.foes).slice(0, int(rng, 1, Math.min(3, S.foes.length))).map(f => /^an? |\(/.test(f) ? f : `${int(rng, 2, 4 + tierOf(level) * 3)} ${f}`);
  const named = [];
  if (S.leader) named.push(makeNPC(sub(seed, 1), { role: S.leader }));
  for (let k = 0, n = int(rng, 0, 2); k < n; k++) named.push(makeNPC(sub(seed, 2 + k), { role: pick(rng, ['captive', 'survivor', 'treasure hunter', 'hermit', 'lost child', 'deserter']) }));
  const traps = Array.from({ length: int(rng, 1, 3) }, (_, k) => makeTrap(sub(seed, 20 + k), level).text);
  const rooms = Object.entries(ROOMS).map(([k, l], i) => `${i + 1}. ${cap(k)}: ${pick(rng, l)}`);
  const hoard = makeLoot(sub(seed, 30), { level, kind: S.leader || rng() < .5 ? 'boss' : 'hoard' });
  const stash = makeLoot(sub(seed, 31), { level, kind: 'stash' });
  return {
    roller: 'site', seed, opts, title: name, sub: `${cap(S.what)} · level ${level}`,
    sections: [
      { t: 'What it is', rows: [['Once', campaignPick(rng, 'WAS', WAS)], ['Threat', pick(rng, THREATS)], ['Feel', campaignPick(rng, 'ATMOS', ATMOS)]] },
      { t: 'Creatures', gm: true, list: groups },
      named.length ? { t: 'People inside', gm: true, people: named } : null,
      { t: 'Traps', gm: true, list: traps },
      { t: 'Rooms', gm: true, list: rooms },
      { t: 'Treasure (main)', gm: true, list: [...hoard.coins, ...hoard.valuables, ...hoard.items, hoard.special ? spText(hoard.special) : null].filter(Boolean) },
      { t: 'Treasure (hidden stash)', gm: true, list: [...stash.coins, ...stash.items, stash.special ? spText(stash.special) : null].filter(Boolean) },
      { t: 'Hook', text: fill(campaignPick(rng, 'HOOKS', HOOKS), ctxOf(rng)) },
    ].filter(Boolean),
  };
}

// ================================================================ place / city = N buildings -> N NPCs each
const PLACE_BUILDINGS = { city: [40, 70], town: [14, 26], village: [6, 12], hamlet: [3, 6], farm: [2, 4], crossing: [2, 5] };
function placeTop(S) {
  const L = S.lore;
  return [
    { t: 'Overview', rows: [['Size', `${L.sizeLabel} · ${L.pop.toLocaleString()} people`], ['Known for', L.knownFor?.join(', ')], ['Mood', L.mood ? `${cap(L.mood)} — ${L.moodWhy}` : null]] },
    { t: 'Who rules', rows: [['Government', L.faction ? governmentOf(L) : null], ['Faction', L.faction ? `${L.faction.name} (${FACTION_LABEL(L.faction.type)})` : null]] },
    L.hidden ? { t: 'Hidden power', gm: true, text: `${L.hidden.name} (${FACTION_LABEL(L.hidden.type)}) ${L.hidden.what}.` } : null,
    { t: 'Defences', rows: [['Walls', { wall: 'Stone wall', palisade: 'Palisade', none: 'None' }[L.defense]], ['Towers', L.towers || null], ['Guards', L.guards || null]] },
  ].filter(Boolean);
}
const placeBottom = S => [S.lore.conspiracy?{t:'Shared town secret',gm:true,text:S.lore.conspiracy.name+': '+S.lore.conspiracy.secret}:null,{ t: 'Atmosphere', text: S.lore.atmosphere, rows: [['Oddity', S.lore.oddity], ['Danger', S.lore.danger]] }, { t: 'Rumours', list: S.lore.rumours?.map(r => `“${r}”`) }, { t: 'Hooks', gm: true, list: S.lore.hooks }].filter(Boolean);
export function makePlace(seed, opts = {}, world = null) {
  const rng = rngOf(sub(seed, 3)), kind = opts.kind && KINDS[opts.kind]?.group === 'settlement' ? opts.kind : opts.kind === 'city' ? 'city' : pick(rng, ['village', 'village', 'town', 'hamlet', 'town', 'crossing', 'farm']);
  const S = rollPlace(world, 0, 0, kind, seed), L = S.lore, [lo, hi] = PLACE_BUILDINGS[S.kind] || [1, 3];
  // the place's own lore buildings first (inn, temple, smithy...), then ordinary buildings up to the count
  const list = (L.buildings || []).map(b => ({ kind: STAFF[b.kind] ? b.kind : 'shop', name: b.name }));
  const n = Math.max(list.length, int(rng, lo, hi));
  while (list.length < n) list.push({ kind: wpick(rng, S.kind === 'farm' ? { farmhouse: 3, barn: 2, home: 2 } : BKINDS) });
  S.buildingsRolled = list.map((b, k) => makeBuilding(sub(seed, 100 + k), { ...b, id: `${S.name}/${k}`, size: S.kind, conspiracy:L.conspiracy }));
  return S;
}
export function rollPlaceCard(seed, opts = {}, world = null) {
  const S = makePlace(seed, opts, world), B = S.buildingsRolled, n = B.reduce((a, b) => a + b.people.length, 0);
  return { roller: 'place', seed, opts, title: S.name, sub: `${KINDS[S.kind].label} · ${B.length} buildings · ${n} people`, place: S, sections: [...placeTop(S), { t: `Buildings (${B.length})`, buildings: B }, ...placeBottom(S)] };
}
const DISTRICTS = [['Temple Ward', 'bells, pilgrims, beggars on the steps'], ['the Docks', 'tar, gulls, knives in the dark'], ['the Old Town', 'crooked lanes older than the walls'], ['Lantern Row', 'taverns and gambling dens, music all night'], ['the Tanneries', 'stink, dye vats, cheap rooms'], ['Market Square', 'stalls, criers, cutpurses'], ['the High Quarter', 'walled gardens, guards at every gate'], ['the Warrens', 'rookeries stacked on rookeries'], ['Smithy Lane', 'hammers, sparks, soot'], ['Scholars\' Close', 'libraries, ink sellers, quiet arguments'], ['Gallows Hill', 'the gibbet, the watch house, a chapel for the condemned'], ['the Foreign Quarter', 'strange spices, stranger gods'], ['Castle Hill', 'the citadel and its barracks']];
const LANDMARKS = ['a cathedral whose spire was never finished', 'a bridge lined with shops', 'a statue of a king nobody remembers', 'a bathhouse over a hot spring', 'a tower with a hundred bells', 'an arena in an old quarry', 'a great library with chained books', 'a lighthouse that burns green', 'a fountain that grants small wishes, people say', 'a sealed gate in the old wall'];
// Additional hand-authored roller entries.
LANDMARKS.push(
  "a covered market built from a dismantled warship",
  "a dry canal filled with vegetable gardens",
  "a clock tower whose hands were removed by decree",
  "a public well ringed with iron prayer locks",
  "a theatre built inside a ruined temple",
  "an avenue of petrified trees",
  "a courthouse with its judgement carved outside",
  "a bridge whose middle arch is chained shut",
  "a cemetery stacked in terraces above the roofs",
  "a glasshouse protecting the last royal orchard",
  "a public oven larger than the watch house",
  "a colossal stone hand rising from a square",
  "an aqueduct patched with mismatched tombstones",
  "a hospice with a bell for every occupied bed",
  "a mint with a permanently bricked-up entrance",
  "a ship suspended between two guildhalls",
  "a salt warehouse converted into a courthouse",
  "a shrine maintained by the city's executioners",
  "a bronze door standing alone in a garden",
  "a rain cistern open beneath a grating of silvered iron",
  "a monument with every name chiselled away",
  "an unfinished triumphal arch occupied by swallows",
  "a library reached only by an exterior stair",
  "a ferry dragged across the river by an enormous chain",
  "a public stair descending into a flooded district"
);
const LAWS = ['No blades longer than a hand within the walls.', 'Curfew at the ninth bell.', 'Magic in public needs a licence (5 gp).', 'Foreigners pay a gate toll of 1 sp.', 'Debtors work on the walls.', 'Theft is punished by branding.', 'Duels are legal, at dawn, with the watch watching.'];
const TROUBLE = ['A plague ship sits quarantined in the harbour.', 'The guilds are on the edge of open war.', 'Someone is murdering lamplighters.', 'Bread riots have begun.', 'The ruler is dying and the heirs are circling.', 'Ghouls in the catacombs below the temple.', 'A cult is recruiting among the poor.'];
export function rollCity(seed, opts = {}, world = null) {
  const rng = rngOf(sub(seed, 4)), S = makePlace(seed, { ...opts, kind: 'city', maxBuildings: 70 }, world), B = S.buildingsRolled, n = B.reduce((a, b) => a + b.people.length, 0);
  const powers = [S.lore.faction, ...shuffle(rng, ['guild', 'temple', 'thieves', 'noble', 'arcane']).slice(0, 2).map(t => faction(rng, world, t))].filter(Boolean);
  return {
    roller: 'city', seed, opts, title: S.name, sub: `City · ${B.length} buildings · ${n} people`, place: S,
    sections: [...placeTop(S),
      { t: 'Districts', list: shuffle(rng, DISTRICTS).slice(0, int(rng, 4, 7)).map(([a, b]) => `${a} — ${b}`) }, { t: 'Powers', list: powers.map(f => `${f.name} (${FACTION_LABEL(f.type)})`) },
      { t: 'Landmarks', list: campaignList(rng, 'LANDMARKS', LANDMARKS, 3) }, { t: 'Laws', list: shuffle(rng, LAWS).slice(0, 3) }, { t: 'Trouble', gm: true, list: campaignList(rng, 'TROUBLE', TROUBLE, 2) },
      { t: `Buildings (${B.length})`, buildings: B }, ...placeBottom(S)],
  };
}

// ================================================================ quests: a rumour / hook in the area, minor or major
const HEARD = ['overheard in the tavern', 'a notice nailed to the temple door', 'a drunk swears it\'s true', 'a child tells it for a copper', 'the innkeeper, quietly', 'a dying traveller\'s last words', 'gossip at the well', 'the town crier', 'a letter found on a corpse'];
const MINOR = { fetch: 'Recover {thing} from {where}.', rescue: 'Rescue {who} from {foe} at {where}.', kill: 'Clear out {foe} at {where}.', escort: 'Escort {who} safely to {town}.', investigate: 'Find out who is behind {crime}.', deliver: 'Deliver {thing} to {who2} in {town}, unopened.', protect: 'Hold {where} against {foe} for three nights.', heist: 'Steal {thing} from {who2}\'s strongroom.', explore: 'Map {where} and come back alive.', hunt: 'Track the beast that has been taking {victims}.' };
const THINGS = ['a stolen reliquary', 'the deed to the mill', 'a dead knight\'s sword', 'a merchant\'s ledger', 'a sealed letter', 'a dragon egg (probably)', 'a child\'s music box', 'the bishop\'s ring', 'a crate of black powder', 'the town charter'];
const WHERES = ['the drowned chapel', 'the old watchtower', 'the goblin caves under the ridge', 'the ruined abbey', 'the barrow on the moor', 'the abandoned mine', 'the bandit camp in the woods', 'the haunted manor', 'the island in the lake'];
// Additional hand-authored roller entries.
WHERES.push(
  "the chalk quarry beyond the toll road",
  "the sealed cistern beneath the market",
  "the charcoal burners' abandoned camp",
  "the ossuary behind the hospice",
  "the watch post buried by a landslide",
  "the monastery's winter storehouse",
  "the ferry house on the dead river",
  "the glassworks in the ash fields",
  "the ruined bathhouse above the spring",
  "the border cairn split by lightning",
  "the flooded orchard below the dam",
  "the old customs house",
  "the pilgrimage shelter on the ridge",
  "the plague island's bell tower",
  "the salt warehouse outside the walls",
  "the collapsed charcoal tunnel",
  "the abandoned falconry mews",
  "the forgotten icehouse under the manor",
  "the quarry chapel",
  "the sunken road through the fen",
  "the ruined observatory on the moor",
  "the executioner's deserted cottage",
  "the walled garden behind the asylum",
  "the lighthouse reached only at low tide",
  "the burial vault under the granary"
);
const FOES = ['goblins', 'a bandit gang', 'a necromancer', 'an owlbear', 'cultists', 'ghouls', 'a hag', 'orc raiders', 'giant spiders', 'a wight'];
const CRIMES = ['the poisoned well', 'a string of disappearances', 'the burned granary', 'forged coins', 'the murdered tax collector', 'grave robbing'];
const VICTIMS = ['sheep', 'travellers', 'children', 'hunting dogs', 'the miller\'s cattle'];
const TWISTS = ['The patron is the real villain.', 'The "monster" is protecting its young.', 'The item is cursed and the patron knows it.', 'A rival party wants the same job.', 'The victim doesn\'t want to be rescued.', 'It\'s a trap set by an old enemy.', 'The reward is counterfeit.', 'Two factions hired the party for opposite ends.'];
const SNAGS = ['A storm closes the roads.', 'The local lord forbids it.', 'The guide demands double pay halfway.', 'Someone recognises a party member.', 'The bridge is out.', 'A quarantine blocks the route.'];
const MAJOR = [
  { hook: 'The dead are not staying buried in {town}.', stages: ['Graves are found open; the gravedigger has fled.', 'A necromancer\'s agent is buying corpses.', 'A lich\'s phylactery lies under the old chapel.'], foe: 'a necromancer and her lich master' },
  { hook: '{faction} is raising an army in secret.', stages: ['Smiths work all night; iron prices soar.', 'A courier carries orders to a hidden camp.', 'The plot reaches the ruler\'s own court.'], foe: 'a usurper lord' },
  { hook: 'A dragon has claimed the {land} and demands tribute.', stages: ['Burned farms; the first tribute cart is lost.', 'The dragon\'s cultists live among the townsfolk.', 'The lair, and an old pact with the town\'s founder.'], foe: 'a young red dragon' },
  { hook: 'Children are vanishing from {town}, one every new moon.', stages: ['Strange tracks, and singing in the woods.', 'A hag coven trades children for youth.', 'One of the coven is someone the party trusts.'], foe: 'a hag coven' },
  { hook: 'The river is poisoned and the land is dying.', stages: ['Dead fish, sick cattle, a shrine defiled.', 'A cult corrupts the spring at the source.', 'Something ancient wakes under the water.'], foe: 'an aboleth and its thralls' },
  { hook: 'A plague of nightmares spreads from {town}.', stages: ['Sleepers wake screaming; some don\'t wake.', 'All the dreams lead to the same ruined tower.', 'A night hag feeds on the town.'], foe: 'a night hag' },
];
export function rollQuest(seed, opts = {}) {
  const rng = rngOf(seed), level = lv(opts), scale = opts.scale === 'major' || opts.scale === 'minor' ? opts.scale : (rng() < .75 ? 'minor' : 'major');
  const c = ctxOf(rng, { town: opts.town || town(rng) });
  if (scale === 'major') {
    const M = campaignPick(rng, 'MAJOR', MAJOR), patron = makeNPC(sub(seed, 1), { role: pick(rng, ['noble', 'priest', 'knight', 'sage', 'merchant']) });
    return {
      roller: 'quest', seed, opts, title: fill(M.hook, c), sub: `Major · level ${level}+`,
      sections: [
        { t: 'Rumour', text: `“${fill(M.hook, c)}” — ${pick(rng, HEARD)}.` },
        { t: 'Who asks', people: [patron], rows: [['Reward', `${gp(Math.round((500 + level * level * 150) * (.8 + rng() * .6) / 50) * 50)}, and ${pick(rng, ['a title', 'land', 'a magic item from the vault', 'the ruler\'s favour'])}`]] },
        { t: 'How it unfolds', gm: true, list: M.stages.map((x, i) => `${i + 1}. ${fill(x, c)}`) },
        { t: 'Behind it', gm: true, rows: [['Villain', M.foe], ['Twist', campaignPick(rng, 'TWISTS', TWISTS)]] },
      ],
    };
  }
  const type = MINOR[opts.type] ? opts.type : pick(rng, Object.keys(MINOR));
  const patron = makeNPC(sub(seed, 2), { role: pick(rng, ['merchant', 'priest', 'farmer', 'innkeeper', 'guard', 'miller']) }), who = makeNPC(sub(seed, 3), { role: pick(rng, ['apprentice', 'pilgrim', 'scout', 'heir']) });
  const job = fill(MINOR[type], { thing: campaignPick(rng, 'THINGS', THINGS), where: campaignPick(rng, 'WHERES', WHERES), foe: campaignPick(rng, 'FOES', FOES), who: who.name, who2: `${pick(rng, FIRST.human)} ${pick(rng, SUR)}`, town: c.town, crime: pick(rng, CRIMES), victims: pick(rng, VICTIMS) });
  return {
    roller: 'quest', seed, opts, title: job, sub: `Minor · ${type} · level ${level}`,
    sections: [
      { t: 'Rumour', text: `“${fill(campaignPick(rng, 'RUMOURS', RUMOURS), c)}” — ${pick(rng, HEARD)}.` }, { t: 'The job', text: job },
      { t: 'Who asks', people: [patron], rows: [['Pays', gp(Math.round((25 + level * level * 25) * (.7 + rng() * .8) / 5) * 5)], ['Deadline', pick(rng, ['none', 'three days', 'before the full moon', 'a week'])]] },
      { t: 'Along the way', text: pick(rng, SNAGS) }, { t: 'Twist', gm: true, text: campaignPick(rng, 'TWISTS', TWISTS) },
    ],
  };
}

// ================================================================ something strange
const TOWN_EVENTS = ['A festival where everyone wears masks and no names may be spoken.', 'The lord dies at dinner; everyone at the table is a suspect.', 'A dragon\'s shadow passes over; the next day, tribute is demanded.', 'A plague of sleep: people nod off and dream the same dream.', 'A stranger arrives with a letter for a party member, dated 50 years ago.', 'The town well starts producing wine. Then blood.', 'A hanging is interrupted by a rider with a pardon. It\'s forged.', 'A pig is elected mayor, and won\'t step down.', 'The church bell is stolen overnight. All of it.'];
// Additional hand-authored roller entries.
TOWN_EVENTS.push(
  "A bell tolls from a church whose bells were sold years ago.",
  "The watch seals a well after finding fresh flowers floating up from below.",
  "A funeral procession stops because two families claim the coffin.",
  "Every baker receives an order bearing the dead ruler's seal.",
  "A public auction offers the contents of an abandoned watchtower.",
  "A tax collector is paying citizens back without explanation.",
  "Workers uncover a second street beneath a collapsed cellar.",
  "A wounded messenger refuses to hand a letter to anyone wearing iron.",
  "A guild closes its doors after an apprentice vanishes inside.",
  "The river ferry returns with no passengers and a deck full of mud.",
  "A magistrate asks for witnesses to a trial held in secret.",
  "A child returns a stolen purse containing a stranger's finger bone.",
  "A statue is found wearing a fresh funeral wreath every dawn.",
  "The grain scales disagree only when weighing the town's relief stores.",
  "A travelling surgeon offers free treatment in exchange for old letters.",
  "The night watch has stopped patrolling one perfectly ordinary lane.",
  "A chimney sweep finds a sealed room with a warm meal inside.",
  "A caravan sells tools marked with the names of missing townsfolk.",
  "The local choir refuses to sing a verse discovered in an old hymnal.",
  "Someone posts accurate notices of crimes an hour before they occur.",
  "A widow hires guards for a visitor she expects after midnight.",
  "The slaughterhouse shuts down when every animal faces the same wall.",
  "An old debt ledger appears nailed to the courthouse door.",
  "A bridge keeper charges no toll but records every traveller's shadow.",
  "The burial society asks why a grave contains freshly repaired boots."
);
const ROAD_EVENTS = ['A wedding procession of goblins, very polite, asks for directions.', 'A cart with no driver, its horse calm, carrying a sealed coffin.', 'Two ghosts arguing over a boundary stone.', 'A travelling theatre performing the party\'s own past, badly.', 'A toll bridge run by a troll who only takes riddles.', 'A wounded griffon tangled in a hunter\'s net.', 'A knight in rusted armour challenges the party to a duel of poetry.', 'A crossroads where all the signposts point the same way.', 'A merchant selling maps of places that don\'t exist yet.'];
const WEATHER = ['A fog that carries whispers in a language no one speaks.', 'A hailstorm of tiny frogs.', 'A wind that blows only at night, always from the barrow.', 'Rain that falls upward for an hour.', 'A heat so strange the iron sings.', 'Snow in summer, but only on graves.', 'A red moon that stays three nights.', 'Ball lightning that follows the party, curious.'];
const FUN = ['A goat follows the party everywhere and cannot be shaken off.', 'Every coin the party spends today comes back to them by nightfall.', 'A bard is writing a song about the party. It\'s unflattering.', 'An enchanted broom has escaped and is sweeping the whole town.', 'A child sells "dragon scales" that are clearly painted fish scales. One isn\'t.', 'A bake-off with a cursed pie.', 'The party\'s horses start talking, but only to complain.', 'A noble mistakes a party member for their long-lost heir.'];
const INTERESTING = ['retired adventurer with one last job', 'oracle who is right about the wrong things', 'doppelganger who likes their new life', 'disgraced paladin', 'gnome inventor whose machine just exploded', 'vampire running a perfectly respectable bakery', 'elf who has been waiting 200 years for someone', 'bounty hunter tracking one of the party', 'dragon in disguise, bored'];
export function rollStrange(seed, opts = {}) {
  const rng = rngOf(seed), cats = ['Interesting NPC', 'Event in town', 'Event on the road', 'Weather', 'Interesting item', 'Something fun'], cat = cats.includes(opts.kind) ? opts.kind : pick(rng, cats), level = lv(opts);
  const base = { roller: 'strange', seed, opts, sub: cat };
  if (cat === 'Interesting NPC') { const p = makeNPC(sub(seed, 1), { role: campaignPick(rng, 'INTERESTING', INTERESTING) }); return { ...base, title: p.name, person: p, sections: [{ t: cap(p.role), text: pick(rng, [...ODD, ...BACKSTORY]) }, ...npcSections(p)] }; }
  if (cat === 'Interesting item') { const S = makeSpecialItem(sub(seed, 2), level); return { ...base, title: S.name, sections: [{ t: `${cap(S.rarity)} ${S.base}`, rows: [['Power', S.property], ['Quirk', S.quirk], ['History', `It was ${S.history}.`], ['Worth', S.value]] }] }; }
  const text = campaignPick(rng, { 'Event in town':'TOWN_EVENTS', 'Event on the road':'ROAD_EVENTS', Weather:'WEATHER', 'Something fun':'FUN' }[cat], { 'Event in town': TOWN_EVENTS, 'Event on the road': ROAD_EVENTS, Weather: WEATHER, 'Something fun': FUN }[cat]);
  return { ...base, title: cat, sections: [{ t: cat, text }, { t: 'And a twist', gm: true, text: pick(rng, [...TWISTS, ...DANGER]) }] };
}

// ================================================================ the drawer's list
const LEVEL = ['level', 'Level', 'level'];
export const ROLLERS = [
  { id: 'encounter', name: 'Encounter', icon: '⚔', fn: rollEncounter, here: true, opts: [['level', 'Level', 'level'], ['party', 'Party', 'party'], ['difficulty', 'Difficulty', ['', 'easy', 'medium', 'hard', 'deadly']], ['time', 'Time', ['', 'day', 'night']], ['kind', 'Kind', ['', 'fight', 'peace']], ['habitat', 'Land', ['', 'forest', 'plains', 'hills', 'mountains', 'snow', 'swamp', 'dry', 'coast', 'road', 'ruins', 'town']]] },
  { id: 'npc', name: 'NPC', icon: '🧑', fn: rollNPC, opts: [['role', 'Role', ['', ...ROLES]], ['race', 'Race', ['', ...Object.keys(FIRST)]]] },
  { id: 'place', name: 'Place', icon: '⌂', fn: rollPlaceCard, opts: [['kind', 'Kind', ['', 'hamlet', 'village', 'town', 'crossing', 'farm']]] },
  { id: 'city', name: 'City', icon: '🏰', fn: rollCity, opts: [] },
  { id: 'building', name: 'Building', icon: '🏠', fn: rollBuilding, opts: [['kind', 'Kind', ['', ...Object.keys(STAFF)]]] },
  { id: 'shop', name: 'Shopkeeper', icon: '⚖', fn: rollShop, opts: [['kind', 'Shop', ['', ...SHOP_KINDS]], ['size', 'Place', ['', 'hamlet', 'village', 'town', 'city']], LEVEL] },
  { id: 'quest', name: 'Quest / rumour', icon: '📜', fn: rollQuest, opts: [['scale', 'Scale', ['', 'minor', 'major']], ['type', 'Minor type', ['', ...Object.keys(MINOR)]], LEVEL] },
  { id: 'site', name: 'Special site', icon: '⛰', fn: rollSite, opts: [['kind', 'Type', ['', ...Object.keys(SITES)]], LEVEL] },
  { id: 'relic', name: 'Magic item', icon: '✦', fn: rollRelic, opts: [['rarity', 'Rarity', ['', ...RARITIES]], ['kind', 'Kind', ['', ...RELIC_KINDS]]] },
  { id: 'loot', name: 'Loot', icon: '💰', fn: rollLoot, opts: [['kind', 'Kind', ['hoard', 'pocket', 'stash', 'boss']], ['special', 'Special item', ['', 'always']], LEVEL] },
  { id: 'strange', name: 'Something strange', icon: '✶', fn: rollStrange, opts: [['kind', 'Kind', ['', 'Interesting NPC', 'Event in town', 'Event on the road', 'Weather', 'Interesting item', 'Something fun']], LEVEL] },
];
export const roll = (id, seed, opts = {}, world = null, ctx = {}) => ROLLERS.find(r => r.id === id).fn(seed, opts, world, ctx);
