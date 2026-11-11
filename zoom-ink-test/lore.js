import { campaignPick, campaignList, CAMPAIGN_POOLS, personalInvolvement, ORDINARY_SECRETS, townConspiracy, conspiracySecret } from './campaign-flavor.js';
// A lite location generator (in the spirit of WorldForge): roll a place's type, size, people,
// faction, buildings, NPCs, defences and hooks. Everything is a pure function of a seed and
// the world around the point, and the result is saved on the settlement as S.lore so it can
// be read, rerolled per section and drives what is built on the map (walls, fields, temple...).
import { mulberry, clamp } from './noise.js';
import { T } from './world.js';

// ---------- kinds ----------
// group 'settlement': people live here, streets and houses. group 'site': a walled or wild unit.
// cat: the three categories of the GM's own place generator.
export const KINDS = {
  city: { label: 'City', group: 'settlement', cat: 'settlement' },
  town: { label: 'Town', group: 'settlement', cat: 'settlement' },
  village: { label: 'Village', group: 'settlement', cat: 'settlement' },
  hamlet: { label: 'Hamlet', group: 'settlement', cat: 'settlement' },
  keep: { label: 'Keep', group: 'site', cat: 'settlement' },
  tower: { label: 'Watchtower', group: 'site', cat: 'poi' },
  wizard: { label: "Wizard's tower", group: 'site', cat: 'poi' },
  mine: { label: 'Mine', group: 'site', cat: 'poi' },
  cave: { label: 'Cave', group: 'site', cat: 'poi' },
  shrine: { label: 'Shrine', group: 'site', cat: 'poi' },
  farm: { label: 'Farm', group: 'settlement', cat: 'wild' },
  crossing: { label: 'Crossing', group: 'settlement', cat: 'wild' },
  camp: { label: 'Camp', group: 'site', cat: 'wild' },
  ruin: { label: 'Ruin', group: 'site', cat: 'wild' },
};
export const CATEGORIES = { settlement: 'Settlements', poi: 'Points of interest', wild: 'Rural & wild' };
export const KIND_LIST = Object.keys(KINDS);

// Size tiers: population for settlements, occupants for sites.
const TIERS = {
  city: [['small', 'Small city', 6000, 12000], ['large', 'Large city', 12000, 25000]],
  town: [['small', 'Small town', 1000, 2500], ['large', 'Large town', 2500, 6000]],
  village: [['small', 'Small village', 150, 400], ['large', 'Large village', 400, 1000]],
  hamlet: [['small', 'Thorp', 20, 60], ['large', 'Hamlet', 60, 150]],
  farm: [['small', 'Croft', 4, 10], ['large', 'Steading', 10, 30]],
  crossing: [['small', 'Waystation', 15, 60], ['large', 'Bridge town', 60, 300]],
  keep: [['small', 'Small garrison', 20, 60], ['large', 'Strong garrison', 60, 200]],
  tower: [['small', 'Lookout', 2, 5], ['large', 'Garrisoned tower', 5, 14]],
  wizard: [['small', 'Hermitage', 1, 3], ['large', 'Arcane spire', 3, 10]],
  mine: [['small', 'Prospect', 20, 50], ['large', 'Deep mine', 50, 150]],
  camp: [['small', 'Small band', 6, 20], ['large', 'Large band', 20, 70]],
  cave: [['small', 'Den', 2, 8], ['large', 'Warren', 8, 40]],
  ruin: [['small', 'Haunt', 1, 8], ['large', 'Infested ruin', 8, 30]],
  shrine: [['small', 'Wayside shrine', 0, 2], ['large', 'Holy site', 2, 12]],
};
export const tiersOf = kind => (TIERS[kind] || TIERS.village).map(([id, label, lo, hi]) => ({ id, label, lo, hi }));
const SITE_R = { keep: 110, tower: 60, wizard: 55, mine: 70, camp: 45, cave: 55, ruin: 45, shrine: 45 };
// How far a place reaches on the map, from its kind and population.
// Settlements use medieval densities (people per hectare): packed walled cities ~250, towns ~150,
// villages with gardens and yards ~60, hamlets ~40. A 25,000 city is ~1.1 km across, a 2,500 town ~460 m,
// a 400 village ~290 m. r = sqrt(area / pi).
const DENSITY = { city: 250, town: 150, village: 60, hamlet: 40, crossing: 50 };
export function radiusFor(kind, pop) {
  if (SITE_R[kind]) return SITE_R[kind];
  if (kind === 'farm') return 40;
  return Math.round(clamp(Math.sqrt((pop || 0) * 1e4 / (DENSITY[kind] || 60) / Math.PI), kind === 'crossing' ? 45 : 40, 700));
}
// The old (too small) rule, to recognise radii that were never set by hand.
export const oldRadiusFor = (kind, pop) => SITE_R[kind] ? SITE_R[kind] : kind === 'farm' ? 40 : Math.round(clamp(30 + 2.4 * Math.sqrt(pop), kind === 'crossing' ? 45 : 40, 320));

// ---------- small helpers ----------
const pick = (rng, a) => a[Math.floor(rng() * a.length) % a.length];
const wpick = (rng, table) => { let t = 0; for (const k in table) t += table[k]; let r = rng() * t; for (const k in table) { r -= table[k]; if (r <= 0) return k; } return Object.keys(table)[0]; };
const int = (rng, lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const an = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const shuffle = (rng, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- names ----------
const PRE = ['Brack', 'Ash', 'Thorn', 'Wolf', 'Mor', 'Elder', 'Stone', 'Raven', 'Dun', 'Kel', 'Wester', 'Cold', 'Briar', 'Hag', 'Mire', 'Oak', 'Iron', 'Salt', 'Grim', 'Black', 'Red', 'Willow', 'Fen', 'Crow', 'Hollow', 'Barrow', 'Gall', 'Wyn', 'Hart', 'Ember', 'Frost', 'Moss', 'Bel', 'Shal', 'Tarn', 'Vel', 'Whit', 'Yew', 'Dread', 'Lark'];
const SUF = ['ford', 'water', 'wick', 'stead', 'by', 'ham', 'ton', 'hold', 'moor', 'fell', 'brook', 'mere', 'gate', 'haven', 'crag', 'dale', 'field', 'holt', 'marsh', 'bury', 'well', 'cross', 'thorpe', 'ley', 'den'];
const ADJ = ['Gilded', 'Drowned', 'Sleeping', 'Crooked', 'Laughing', 'Rusty', 'Silver', 'Black', 'Wandering', 'Hanged', 'Prancing', 'Broken', 'Golden', 'Weeping', 'Merry', 'Salted', 'Howling', 'Blind', 'Lucky', 'Red'];
const NOUN = ['Stag', 'Lantern', 'Giant', 'Crow', 'Goose', 'Anvil', 'Boar', 'Kettle', 'Maiden', 'Hound', 'Pony', 'Wheel', 'Dragon', 'Owl', 'Barrel', 'Fiddle', 'Toad', 'Crown', 'Badger', 'Eel'];
const FIRST = {
  human: ['Aric', 'Brin', 'Cass', 'Dalla', 'Edric', 'Fenna', 'Garrick', 'Hilde', 'Ivo', 'Jessa', 'Kort', 'Lena', 'Marta', 'Niall', 'Osric', 'Petra', 'Quill', 'Rosalind', 'Sten', 'Tamsin', 'Ulric', 'Vera', 'Wendel', 'Yara', 'Bram', 'Elsbeth', 'Corin', 'Maud', 'Tobin', 'Agnes'],
  dwarf: ['Thrain', 'Dagna', 'Borin', 'Helga', 'Kildrak', 'Vistra', 'Rurik', 'Amber', 'Torgar', 'Eldeth'],
  elf: ['Aelar', 'Shava', 'Thamior', 'Naivara', 'Erevan', 'Sariel', 'Varis', 'Lia', 'Riardon', 'Keyleth'],
  halfling: ['Milo', 'Rosie', 'Perrin', 'Cora', 'Wellby', 'Lavinia', 'Merric', 'Seraphina', 'Roscoe', 'Kithri'],
  'half-orc': ['Grusk', 'Shautha', 'Dench', 'Volen', 'Krusk', 'Baggi', 'Thokk', 'Ovak'],
  gnome: ['Fonkin', 'Bimpnottin', 'Wrenn', 'Orryn', 'Nissa', 'Zook', 'Carlin', 'Ellyjobell'],
  tiefling: ['Mordai', 'Kallista', 'Damakos', 'Orianna', 'Skamos', 'Nemeia'],
};
const SUR = ['Fenwick', 'Brandt', 'Ashdown', 'Marlow', 'Holt', 'Thorne', 'Varrow', 'Blackwood', 'Greaves', 'Underhill', 'Crane', 'Mossgrove', 'Hale', 'Corbett', 'Ironside', 'Dunmore', 'Pike', 'Wren', 'Galloway', 'Stroud', 'Kettle', 'Merrow'];
const RACES = { human: 60, dwarf: 9, halfling: 9, elf: 6, 'half-orc': 6, gnome: 5, tiefling: 5 };
const TRAITS = ['gruff but fair', 'nervous and talkative', 'cheerful, nosy', 'proud of their family name', 'tired and suspicious of strangers', 'pious to a fault', 'greedy, but keeps their word', 'secretly kind', 'loud and generous', 'sharp-tongued', 'superstitious', 'ambitious', 'grieving a recent loss', 'deeply in debt', 'a retired adventurer', 'always eating', 'soft-spoken and watchful', 'quick to laugh'];
const WANTS = ['wants a missing sibling found', 'wants a rival ruined', 'wants to leave this place for good', 'wants their debts forgiven', 'wants a cure for a sick child', 'wants revenge on bandits who burned their barn', 'wants to marry above their station', 'wants an old map deciphered', 'wants a cursed heirloom gone', 'wants to be left alone'];
const SECRETS = ['is an informant for {hidden}', 'buried something under the old mill', 'is not who they claim to be', 'owes {hidden} a dangerous favour', 'saw what really happened on the night of the fire', 'worships {cultish} in secret', 'has a stash of stolen silver', 'is a lycanthrope, barely in control', 'forged the deed to their own house', 'knows a hidden way into {near}'];

export function placeName(rng, kind) {
  const base = () => { let p = pick(rng, PRE), s = pick(rng, SUF); if (p.toLowerCase().endsWith(s[0])) s = s.slice(1); return p + s; };
  const b = base(), sur = pick(rng, SUR);
  switch (kind) {
    case 'keep': return pick(rng, [`${b} Keep`, `Fort ${b}`, `The ${pick(rng, ['Grey', 'Black', 'Red', 'Old', 'High'])} Keep`, `${b} Castle`]);
    case 'tower': return pick(rng, [`${b} Watch`, `${b} Tower`, `The ${pick(rng, ['Lonely', 'Grey', 'Signal', 'Old'])} Tower`]);
    case 'camp': return pick(rng, [`${b} Camp`, `${pick(rng, ['Redfern', 'Ashpit', 'Cutthroat', 'Mudhollow', 'Smoke'])} Camp`, `The ${pick(rng, ['Wolf', 'Boar', 'Raven'])} Camp`]);
    case 'cave': return pick(rng, [`The ${pick(rng, ['Weeping', 'Black', 'Hungry', 'Whispering', 'Deep'])} ${pick(rng, ['Caves', 'Hollow', 'Maw', 'Den'])}`, `${b} Caves`, `${pick(rng, PRE)}maw`]);
    case 'ruin': return pick(rng, [`${b} Ruins`, `Old ${b}`, `The Fallen ${pick(rng, ['Abbey', 'Hall', 'Tower', 'Chapel'])}`, `Cairn ${pick(rng, ['Hollow', 'Hill', 'Moor'])}`]);
    case 'shrine': return pick(rng, [`Shrine of the ${pick(rng, ['Pale Flame', 'Green Mother', 'Silent Saint', 'Hearth', 'Wayfarer', 'Drowned King'])}`, `${b} Stones`, `The ${pick(rng, ['Nine', 'Grey', 'Whispering'])} Stones`]);
    case 'wizard': return pick(rng, [`${pick(rng, FIRST.elf)}'s Spire`, `The ${pick(rng, ['Eldritch', 'Starlit', 'Crooked', 'Silent', 'Glass'])} Tower`, `${b} Spire`]);
    case 'mine': return pick(rng, [`${b} Mine`, `The ${pick(rng, ['Deep', 'Copper', 'Iron', 'Sunken', 'Old'])} Delve`, `${pick(rng, SUR)}'s Dig`]);
    case 'farm': return pick(rng, [`${sur} Farm`, `${b} Farm`, `Old ${sur}'s Steading`, `${b} Croft`]);
    case 'crossing': return pick(rng, [`${b} Bridge`, `${b} Ford`, `${b} Cross`, `${pick(rng, PRE)}ford Crossing`]);
    default: return b;
  }
}
function personName(rng, race) { return `${pick(rng, FIRST[race] || FIRST.human)} ${race === 'human' || race === 'halfling' || rng() < .5 ? pick(rng, SUR) : ''}`.trim(); }
function npc(rng, role, ctx, race) {
  race ||= wpick(rng, RACES);
  const occult=personalInvolvement(rng,ctx.conspiracy);
  return { occult,conspiracyId:ctx.conspiracy?.id||null,name: personName(rng, race), race, role, trait: pick(rng, TRAITS), want: pick(rng, WANTS), secret: ctx.conspiracy?conspiracySecret(ctx.conspiracy):fill(occult?pick(rng,CAMPAIGN_POOLS.SECRETS):pick(rng,ORDINARY_SECRETS), ctx) };
}
function fill(s, ctx) { return s.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? k); }

// ---------- factions ----------
const FACTIONS = {
  crown: { label: 'Crown', name: rng => `the Crown of ${placeName(rng, 'town')}`, title: 'Reeve' },
  noble: { label: 'Noble house', name: rng => `House ${pick(rng, SUR)}`, title: 'Lord' },
  guild: { label: 'Merchant guild', name: rng => `the ${pick(rng, ['Saltroad', 'Lantern', 'Copper', 'River', 'Wool', 'Ironbridge'])} ${pick(rng, ['Company', 'Guild', 'Consortium'])}`, title: 'Guildmaster' },
  temple: { label: 'Temple', name: rng => `the ${pick(rng, ['Order', 'Church', 'Brotherhood', 'Sisterhood'])} of the ${pick(rng, ['Pale Flame', 'Morning Bell', 'Silent Saint', 'Green Mother', 'Iron Scales'])}`, title: 'High Priest' },
  council: { label: 'Elders\' council', name: rng => pick(rng, ['the Freeholders\' Moot', 'the Council of Elders', 'the Village Wardens', 'the Hearth Council']), title: 'Elder' },
  family: { label: 'Family', name: rng => `the ${pick(rng, SUR)} family`, title: 'Head of the family' },
  thieves: { label: 'Thieves\' guild', name: rng => `the ${pick(rng, ['Quiet', 'Velvet', 'Grey', 'Hollow'])} ${pick(rng, ['Hand', 'Knives', 'Rats', 'Masks'])}`, title: 'Guildmaster' },
  bandits: { label: 'Bandits', name: rng => `the ${pick(rng, ['Red', 'Black', 'Laughing', 'Mud'])} ${pick(rng, ['Wolves', 'Ravens', 'Boars', 'Hoods'])}`, title: 'Captain' },
  orcs: { label: 'Orc warband', name: rng => `the ${pick(rng, ['Broken Tusk', 'Bloodied Axe', 'Seven Skulls', 'Ash Fang'])} warband`, title: 'Warchief' },
  goblins: { label: 'Goblin tribe', name: rng => `the ${pick(rng, ['Gnawbone', 'Rotgut', 'Snaggletooth', 'Mudfoot'])} tribe`, title: 'Boss' },
  cult: { label: 'Cult', name: rng => `the ${pick(rng, ['Drowned Choir', 'Ashen Eye', 'Hollow Crown', 'Children of the Worm'])}`, title: 'the Speaker' },
  druids: { label: 'Druid circle', name: rng => `the Circle of the ${pick(rng, ['Thorn', 'Antler', 'Moss', 'Moon'])}`, title: 'Archdruid' },
  undead: { label: 'Undead', name: rng => `the ${pick(rng, ['Grey', 'Pale', 'Whispering'])} Court`, title: 'Necromancer' },
  dwarves: { label: 'Dwarf clan', name: rng => `Clan ${pick(rng, ['Ironvein', 'Stonebeard', 'Deepdelve', 'Coalbrow'])}`, title: 'Thane' },
  arcane: { label: 'Arcane', name: rng => `the ${pick(rng, ['Conclave', 'College', 'Circle'])} of ${pick(rng, ['Stars', 'Glass', 'Embers', 'Whispers'])}`, title: 'Archmage' },
  beasts: { label: 'Beasts', name: rng => pick(rng, ['an owlbear and its young', 'a nest of giant spiders', 'a hungry wyvern', 'a pack of dire wolves', 'a cave bear', 'a basilisk']), title: 'Beast' },
};
export const FACTION_LABEL = t => FACTIONS[t]?.label || t;
const RULE = {
  city: { crown: 4, noble: 3, guild: 3, temple: 1 },
  town: { noble: 4, guild: 3, crown: 2, temple: 1, council: 1 },
  village: { council: 4, noble: 3, temple: 1 },
  hamlet: { council: 4, noble: 2, family: 2 },
  farm: { family: 1 },
  crossing: { noble: 2, guild: 2, council: 2, crown: 1 },
  keep: { noble: 4, crown: 3, bandits: 1, orcs: 1, undead: .5 },
  tower: { crown: 3, noble: 3, bandits: 1, goblins: 1 },
  wizard: { arcane: 5, cult: 1 },
  mine: { dwarves: 3, guild: 3, noble: 2, goblins: 1 },
  camp: { bandits: 4, orcs: 2, goblins: 2, guild: 1, crown: 1 },
  cave: { goblins: 3, beasts: 3, cult: 1, orcs: 1, undead: 1, dwarves: .5 },
  ruin: { undead: 3, cult: 2, beasts: 2, goblins: 2, bandits: 1 },
  shrine: { temple: 4, druids: 3, cult: 1 },
};
const HIDDEN = { thieves: 3, cult: 2, guild: 1, undead: .5, noble: 1 };
const HIDDEN_WHAT = ['runs the smuggling through the cellars', 'holds the ruler\'s debts', 'is quietly buying up the land', 'meets beneath the temple at new moon', 'has a spy in every tavern', 'is poisoning the well, slowly', 'pays the guards to look away'];
// Reuse a faction the world already has (so places share them), or found a new one.
function faction(rng, world, type) {
  const list = world?.data?.factions || [];
  if (type !== 'beasts' && type !== 'family') { const same = list.filter(f => f.type === type); if (same.length && rng() < .5) return { ...pick(rng, same) }; }
  const f = { id: 'f_' + Math.floor(rng() * 1e9).toString(36), type, name: FACTIONS[type].name(rng) };
  return f;
}

// ---------- surroundings ----------
function surroundings(world, x, z) {
  const out = { type: T.GRASS, coast: false, river: false, road: false, near: [] };
  if (!world?.type) return out;
  out.type = world.typeAt(x, z);
  const [ci, cj] = world.cellAt(x, z);
  for (let dj = -3; dj <= 3 && !out.coast; dj++) for (let di = -3; di <= 3; di++) { const t = world.typeCell(ci + di, cj + dj); if (t === T.DEEP || t === T.SHALLOW) { out.coast = true; break; } }
  out.river = world.lineDist(x, z, 'river') < 120;
  out.road = world.lineDist(x, z, 'road') < 60;
  out.near = (world.data.settlements || []).filter(s => Math.hypot(s.x - x, s.z - z) > 30).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)).slice(0, 3).map(s => s.name);
  return out;
}
const GOODS = {
  [T.GRASS]: ['grain', 'cattle', 'wool', 'cheese', 'horses', 'ale'],
  [T.FOREST]: ['timber', 'furs', 'charcoal', 'game', 'honey', 'bowyers'],
  [T.HILLS]: ['sheep', 'quarried stone', 'copper', 'goats', 'slate'],
  [T.MOUNTAIN]: ['iron', 'silver', 'gems', 'mountain guides'],
  [T.SNOW]: ['furs', 'ice wine', 'guides'],
  [T.MARSH]: ['peat', 'eels', 'reed baskets', 'herbs', 'leeches'],
  [T.DRY]: ['salt', 'goats', 'dyes', 'leather'],
  [T.BEACH]: ['fish', 'salt', 'shipwrights'],
};
const MOODS = [
  ['prosperous', 'a good harvest filled every barn'], ['tense', 'a feud between two families has turned bloody'], ['fearful', 'people have gone missing on the roads'],
  ['festive', 'the harvest feast is a week away'], ['grieving', 'a fever took many last winter'], ['struggling', 'taxes doubled this year'],
  ['bustling', 'a merchant caravan just arrived'], ['wary', 'soldiers passed through, looking for someone'], ['quiet', 'nothing much has happened in years — or so they say'],
];

// From the GM's own place generator: how it feels, what is odd about it, what threatens it.
const ATMOS = [
  'Eerie and quiet, with thick mist clinging to the ground.', 'Bustling and noisy, smelling of woodsmoke and livestock.', 'Tense and watchful; strangers are met with drawn steel or cold stares.',
  'Decaying and neglected, as though on the brink of collapse.', 'Welcoming and cosy, with music drifting from open windows.', 'Smoky and industrious, ringing with hammers and heavy labour.',
  'Damp and grey; every roof drips and every dog barks.', 'Solemn; bells ring for the dead more often than for feasts.',
];
// Additional hand-authored roller entries.
ATMOS.push(
  "Wet slate gleams beneath a low sky.",
  "Peat smoke drifts between tightly shuttered houses.",
  "Distant hammering stops whenever the bells sound.",
  "Rushlights tremble behind horn-paned windows.",
  "Cart wheels grind chalk into the rutted lanes.",
  "Boiling linen scents the air with lye.",
  "A cold draught follows the covered drains.",
  "Blackbirds gather along every roof ridge.",
  "Someone practises a funeral hymn behind a wall.",
  "Sawdust and rain soften every footstep.",
  "Lanterns burn early beneath the overhanging eaves.",
  "The wind carries the dry clatter of prayer tokens.",
  "Fresh mortar stands pale against old soot.",
  "A single cart creaks through otherwise empty streets.",
  "Juniper smoke escapes from a half-open door.",
  "Rainwater rings in a hundred battered buckets.",
  "Every doorway has a neatly swept threshold.",
  "Ash settles lightly on the washing lines.",
  "The smell of warm bread competes with river mud.",
  "Low voices carry surprisingly far in the fog.",
  "Pigeons roost inside the ruined watchtower.",
  "Tallow drips from lamps in the public arcade.",
  "Damp wool steams beside crowded hearths.",
  "The town smells of cut reeds and tar.",
  "A far-off waterwheel turns with an uneven groan."
);
const ODD = [
  'Built over an ancient, faintly glowing rift in the ground.', 'Ringed by petrified trees carved with runes.', 'A broken sword of a forgotten titan juts from the ground nearby.',
  'All livestock here are born with striking purple eyes.', 'The streams flow backwards under a full moon.', 'Part of it is built from the bleached bones of a colossal leviathan.',
  'A small, harmless storm hangs permanently overhead.', 'An old barrier hums faintly around it at midnight.', 'The chapel bell rings by itself once a year.', 'No birds will land within a mile of it.',
];
const DANGER = [
  'Raids by goblins or bandits from the hills.', 'Corruption creeping in from a shadow-tainted wood.', 'Poisonous spore blooms rising from below ground.',
  'Unstable ground, prone to sinkholes and rockslides.', 'Undead stirring in the catacombs nearby.', 'Harsh weather and a dwindling water supply.',
  'Wolves grown bold and many.', 'A feud with the neighbours that is close to bloodshed.',
];
const GOVERN = { crown: 'Royal reeve', noble: 'Feudal lord', guild: 'Merchant oligarchy', temple: 'Theocracy', council: 'Elder council', family: 'Family head', thieves: 'Criminal syndicate', bandits: 'Bandit captain', orcs: 'Tribal chieftain', goblins: 'Tribal boss', cult: 'Secret cult leadership', druids: 'Druid circle', undead: 'Undead master', dwarves: 'Clan thane', arcane: 'Arcane overseer', beasts: 'None (a lair)' };
export const governmentOf = L => L.faction ? (GOVERN[L.faction.type] || 'None') + (L.elected ? ' (elected mayor)' : '') : 'None';

// ---------- buildings ----------
const SHOP = {
  inn: { label: 'Inn', name: rng => `The ${pick(rng, ADJ)} ${pick(rng, NOUN)}`, role: 'innkeeper' },
  tavern: { label: 'Tavern', name: rng => `The ${pick(rng, NOUN)} and ${pick(rng, NOUN)}`, role: 'barkeep' },
  temple: { label: 'Temple', name: rng => `Temple of the ${pick(rng, ['Pale Flame', 'Morning Bell', 'Silent Saint', 'Hearth Mother', 'Harvest Lord'])}`, role: 'priest' },
  chapel: { label: 'Chapel', name: rng => `Chapel of the ${pick(rng, ['Wayfarer', 'Hearth', 'Harvest', 'Silent Saint'])}`, role: 'priest' },
  smithy: { label: 'Smithy', name: rng => pick(rng, ['The Black Anvil', 'The Red Forge', 'Hammer and Tongs', 'The Cold Iron']), role: 'smith' },
  market: { label: 'Market', name: rng => pick(rng, ['Market square', 'The weekly market', 'Cornmarket', 'Fishmarket']), role: 'market warden' },
  mill: { label: 'Mill', name: rng => pick(rng, ['The windmill', 'The old mill', 'The miller\'s mill']), role: 'miller' },
  store: { label: 'General store', name: rng => `${pick(rng, SUR)}'s Goods`, role: 'shopkeeper' },
  stables: { label: 'Stables', name: rng => pick(rng, ['The livery', 'Post stables', 'Horse yard']), role: 'stablemaster' },
  guard: { label: 'Guardhouse', name: () => 'The guardhouse', role: 'sergeant' },
  guildhall: { label: 'Guildhall', name: rng => `${pick(rng, ['Weavers', 'Masons', 'Merchants', 'Brewers'])}' Hall`, role: 'guild clerk' },
  alchemist: { label: 'Alchemist', name: rng => pick(rng, ['The Green Bottle', 'Phials and Philtres', 'The Smoking Retort']), role: 'alchemist' },
  healer: { label: 'Herbalist', name: rng => pick(rng, ['The herb garden', 'Mother\'s remedies', 'The Willow House']), role: 'herbalist' },
  tanner: { label: 'Tannery', name: () => 'The tannery', role: 'tanner' },
  baker: { label: 'Bakery', name: rng => pick(rng, ['The Warm Loaf', 'Oven Lane bakery']), role: 'baker' },
  armory: { label: 'Armourer', name: rng => pick(rng, ['The Iron Coat', 'Plate and Ring', 'The Armourer\'s Yard', 'The Steel Shirt']), role: 'armourer' },
  bowyer: { label: 'Bowyer', name: rng => pick(rng, ['Yew and String', 'The Fletcher']), role: 'bowyer' },
  jeweler: { label: 'Jeweller', name: rng => `${pick(rng, SUR)} & Daughters`, role: 'jeweller' },
  bank: { label: 'Moneylender', name: rng => `The ${pick(rng, ['Iron', 'Copper', 'Golden'])} Counting House`, role: 'moneylender' },
  library: { label: 'Library', name: () => 'The Old Library', role: 'archivist' },
  wizard: { label: 'Wizard\'s tower', name: rng => `${pick(rng, FIRST.elf)}'s tower`, role: 'wizard' },
  barracks: { label: 'Barracks', name: () => 'The barracks', role: 'captain of the watch' },
  bath: { label: 'Bathhouse', name: () => 'The bathhouse', role: 'attendant' },
  arena: { label: 'Fighting pit', name: () => 'The pit', role: 'pit master' },
  farmhouse: { label: 'Farmhouse', name: () => 'The farmhouse', role: 'farmer' },
  barn: { label: 'Barn', name: () => 'The great barn', role: 'farmhand' },
  granary: { label: 'Granary', name: () => 'The granary', role: 'reeve' },
  toll: { label: 'Toll house', name: () => 'The toll house', role: 'toll keeper' },
  shrine: { label: 'Shrine', name: rng => `Shrine of the ${pick(rng, ['Wayfarer', 'Harvest', 'Hearth'])}`, role: 'keeper' },
};
// Which shops a settlement of this kind and size has: [kind, chance] lists, guaranteed first.
function shopList(rng, kind, tier, fields, defense) {
  const big = tier === 'large', out = [];
  const add = (k, p = 1) => { if (rng() < p) out.push(k); };
  if (kind === 'city') { add('inn'); add('inn'); add('tavern'); add('tavern', .7); add('temple'); add('temple', .6); add('market'); add('smithy'); add('guildhall'); add('bank'); add('library', .7); add('alchemist'); add('wizard', .4); add('barracks'); add('bath', .5); add('arena', .3); add('jeweler', .7); add('stables'); add('store'); add('tanner', .6); }
  else if (kind === 'town') { add('inn'); add('tavern', big ? 1 : .6); add('temple'); add('market'); add('smithy'); add('store'); add('stables', .8); add('guildhall', big ? .8 : .4); add('alchemist', .4); add('healer', .5); add('baker', .6); add('bowyer', .3); add('wizard', .1); if (defense !== 'none') add('guard'); }
  else if (kind === 'village') { add('inn', .8); add('chapel', .8); add('smithy', .8); add('store', .7); add('market', big ? .5 : .2); add('healer', .4); add('baker', .3); add('tavern', .3); }
  else if (kind === 'hamlet') { add('shrine', .6); add('smithy', .3); add('inn', big ? .4 : .1); add('granary', .4); }
  else if (kind === 'farm') { add('farmhouse'); add('barn'); add('granary', .5); }
  else if (kind === 'crossing') { add('inn'); add('toll', .8); add('stables', .7); add('smithy', .4); add('shrine', .5); add('store', big ? .6 : .2); }
  if (fields > 3 && kind !== 'farm') add('mill', kind === 'city' ? .9 : .6);
  return out;
}

// ---------- sites: rooms and treasure ----------
const ROOMS = {
  cave: ['Entrance — bones, and a tripwire hung with tin bells', 'Fungus grotto — glowing caps, spores that make you sneeze loudly', 'Underground pool — black, cold, something moves beneath', 'Collapsed passage — a squeeze only a halfling passes easily', 'Echoing gallery — every sound carries to the lair', 'Midden — refuse, and a half-eaten traveller with a sealed letter', 'Lair — the leader sleeps on a pile of stolen furs', 'Narrow ledge over a chasm, with a rope bridge', 'Old shrine — carvings far older than the current occupants'],
  ruin: ['Fallen hall — roof open to the sky, birds everywhere', 'Crypt stair — the air smells of old incense', 'Collapsed tower — a climb up leads to a lookout', 'Courtyard — a dry fountain with coins in it', 'Chapel — a statue whose face has been chiselled off', 'Cellars — wine racks, and a door barred from the inside', 'Library — mouldering books, one still legible', 'Ossuary — skulls arranged in patterns'],
  keep: ['Gatehouse — portcullis, murder holes', 'Great hall — banners, a long table, a cold hearth', 'Barracks — bunks for the garrison', 'Armoury — spears, crossbows, a locked chest', 'Chapel', 'Dungeon — three cells, one occupied', 'Lord\'s solar — maps and letters', 'Stables and smithy'],
  tower: ['Ground floor — stores, firewood, a ladder up', 'Guard room — dice, a cold stew pot', 'Top — the signal fire, always ready to light'],
  camp: ['Palisade gate — two bored guards', 'Leader\'s tent — maps of the trade road', 'Loot pile — crates marked with a merchant\'s seal', 'Cook fire — a pot big enough for twenty', 'Prisoner pen — a captive merchant\'s son'],
  shrine: ['Standing stones — they hum at dusk', 'Altar — offerings of bread and copper', 'Keeper\'s hut', 'Sacred spring'],
  wizard: ['Arcane spire — the stair moves when no one watches', 'Observatory — a brass orrery, still turning', 'Greenhouse — plants that lean toward visitors', "Servants' quarters", 'Library — chained books', 'Summoning circle, scorched'],
  mine: ['Mine shaft entrance — timber frame, a bell to signal below', 'Smelter — choking smoke, glowing slag', 'Bunkhouse — miners sleep in shifts', 'Tool shed', "Foreman's office — ledgers, a strongbox", 'Mess hall', 'Lower galleries — flooded since the collapse', 'The deep seam — miners refuse to go there'],
};
const DWELLERS = {
  goblins: ['goblins', 'goblins and a hobgoblin boss', 'goblins with wolves'], beasts: ['a beast and its young'], cult: ['cultists and a cult fanatic'], orcs: ['orcs and an orog'],
  arcane: ['apprentices, a homunculus and an animated armour'],
  undead: ['skeletons', 'zombies and a ghoul', 'a wight and its skeletons'], dwarves: ['dwarf prospectors, wary of outsiders'], bandits: ['bandits and a bandit captain'], noble: ['soldiers'], crown: ['soldiers'], temple: ['pilgrims and a priest'], druids: ['druids and their animals'], guild: ['caravan guards and merchants'],
};
const ITEMS = ['a potion of healing', 'a scroll of shield', 'a silvered dagger', 'a +1 shield with a forgotten crest', 'a map of the old dwarf roads', 'a bag of 3 fine garnets (50 gp each)', 'a wand of magic missiles (3 charges)', 'boots of elvenkind', 'a holy symbol that glows near undead', 'a locked strongbox (DC 15)', 'a cloak of protection', 'a ring that whispers at night'];
const THREATS = ['low', 'moderate', 'high', 'deadly'];

// ---------- hooks and rumours ----------
const HOOKS = [
  '{npc} will pay 50 gp for news of a caravan that never reached {near}.',
  'Livestock vanish at night; the tracks lead toward {near}.',
  '{hidden} wants {ruler} gone before the next feast day.',
  'A sealed letter must reach {near} within three days, no questions asked.',
  'Strange lights over the {land} at midnight; {npc} swears they are getting closer.',
  'The well water has turned bitter, and {npc} blames {faction}.',
  '{ruler} is hiring swords to clear the road to {near}.',
  'A child found a coin with a dead king\'s face near the old stones.',
  '{npc} needs an escort to {near} and can\'t say why.',
  'Someone is stealing bodies from the graveyard.',
  'A bounty is posted for a beast seen near {near}: 100 gp.',
  '{faction} is arguing with {near} over grazing rights, and both sides want muscle.',
];
const RUMOURS = [
  'They say the old {building} is haunted.', 'A dragon was seen over the {land} last spring.', '{ruler} has not been seen in public for a month.',
  'The bandits pay someone in town for warnings.', 'There is treasure under {near}, if you believe old {npc}.', 'Wolves have been bolder this year.',
  'The priest drinks more than the drunkards.', 'A stranger in a grey cloak asks about the road north every night.', 'The miller found something in the river.',
];
const LAND = { [T.GRASS]: 'fields', [T.FOREST]: 'woods', [T.HILLS]: 'hills', [T.MOUNTAIN]: 'peaks', [T.SNOW]: 'peaks', [T.MARSH]: 'marsh', [T.DRY]: 'plain', [T.BEACH]: 'shore' };

// ---------- the roll ----------
// What kind of place fits here, when the GM asks for "any".
export function kindFor(world, x, z, rng, cat = null) {
  if (cat && CATEGORIES[cat]) {
    for (let n = 0; n < 12; n++) { const k = kindFor(world, x, z, rng); if (KINDS[k].cat === cat) return k; }
    return pick(rng, KIND_LIST.filter(k => KINDS[k].cat === cat));
  }
  const s = surroundings(world, x, z);
  if (s.road && world.lineDist(x, z, 'river') < 50 && rng() < .6) return 'crossing';
  if (s.road) return wpick(rng, { village: 30, hamlet: 20, farm: 20, town: 15, tower: 6, keep: 5, city: 3, crossing: 3 });
  if (s.type === T.MOUNTAIN || s.type === T.SNOW || s.type === T.HILLS) return wpick(rng, { cave: 30, mine: 20, tower: 15, keep: 12, ruin: 12, camp: 8, wizard: 5, shrine: 5 });
  if (s.type === T.FOREST) return wpick(rng, { camp: 30, ruin: 20, shrine: 18, cave: 10, hamlet: 15, farm: 5, wizard: 6 });
  if (s.type === T.MARSH) return wpick(rng, { ruin: 30, shrine: 20, camp: 20, hamlet: 20, cave: 10 });
  return wpick(rng, { farm: 30, hamlet: 20, ruin: 15, tower: 15, shrine: 10, camp: 10 });
}

// The sections a GM can reroll on their own.
export const SECTIONS = ['size', 'faction', 'defense', 'buildings', 'npcs', 'hooks', 'flavour'];

// Roll a whole new place at (x, z). Returns the settlement fields (name, kind, r, seed, lore).
export function rollPlace(world, x, z, kind = 'any', seed = Math.floor(Math.random() * 1e9)) {
  const rng = mulberry(seed);
  if (!KINDS[kind]) kind = kindFor(world, x, z, rng, CATEGORIES[kind] ? kind : null);
  const name = placeName(rng, kind);
  const S = { name, kind, x, z, seed: seed % 1000000 };
  S.lore = rollLore(world, S, seed);
  S.r = radiusFor(kind, S.lore.pop);
  return S;
}

// Roll the lore of an existing settlement (keeps its name, kind and position).
export function rollLore(world, S, seed = S.seed || 1, tier = null) {
  const L = { v: 1, notes: S.lore?.notes || '',conspiracy:['city','town','village','hamlet','crossing','farm'].includes(S.kind)?townConspiracy(mulberry((seed|0)^0x71c092),S.name):null };
  const env = surroundings(world, S.x, S.z);
  rollSection(world, S, L, 'size', seed, env, tier);
  for (const sec of SECTIONS.slice(1)) rollSection(world, S, L, sec, seed, env);
  return L;
}

// Reroll one section in place. seed varies per section so a section reroll leaves the rest alone.
export function rollSection(world, S, L, section, seed = Math.floor(Math.random() * 1e9), env = null, tier = null) {
  env ||= surroundings(world, S.x, S.z);
  const rng = mulberry((seed | 0) + SECTIONS.indexOf(section) * 7919 + 13);
  const kind = S.kind, site = KINDS[kind]?.group === 'site', tiers = tiersOf(kind);
  const ctx = () => ({ conspiracy:L.conspiracy,npc: L.npcs?.[0]?.name || 'the innkeeper', ruler: L.ruler?.name || 'the lord', faction: L.faction?.name || 'the council', hidden: L.hidden?.name || 'someone', near: env.near[0] || 'the next town', land: LAND[env.type] || 'hills', building: L.buildings?.[0]?.label?.toLowerCase() || 'mill', cultish: 'the Drowned Choir', name: S.name });
  if (section === 'size') {
    const t = tiers.find(q => q.id === tier) || (rng() < .55 ? tiers[0] : tiers[1]);
    L.tier = t.id; L.sizeLabel = t.label; L.pop = int(rng, t.lo, t.hi);
    const goods = shuffle(rng, GOODS[env.type] || GOODS[T.GRASS]);
    L.knownFor = [goods[0], ...(env.coast ? ['fishing'] : env.river ? [pick(rng, ['river trade', 'mill wheels', 'fishing'])] : [goods[1]])];
    const [mood, why] = pick(rng, MOODS); L.mood = mood; L.moodWhy = why;
    // the land worked around it: number of field plots, wells
    L.fields = site ? 0 : kind === 'farm' ? int(rng, 4, 7) : kind === 'crossing' ? int(rng, 0, 3) : clamp(Math.round(Math.sqrt(L.pop) * (.35 + rng() * .25)), 2, 34);
    L.wells = site ? 0 : kind === 'farm' ? 1 : clamp(Math.round(L.pop / 900) + 1, 1, 8);
    L.structures = site ? int(rng, 1, kind === 'mine' ? 8 : 4) : Math.max(kind === 'farm' ? 2 : 3, Math.round(L.pop / (4.5 + rng() * 2)));
  }
  if (section === 'faction') {
    const type = wpick(rng, RULE[kind] || RULE.village);
    L.faction = faction(rng, world, type);
    const title = FACTIONS[type].title;
    if (type === 'beasts') L.ruler = { name: cap(L.faction.name), race: 'beast', role: 'lair', trait: pick(rng, ['territorial', 'starving', 'guarding eggs', 'wounded and furious']), want: 'to be left alone', secret: 'something worse drove it here' };
    else { const race = type === 'orcs' ? 'half-orc' : type === 'dwarves' ? 'dwarf' : type === 'goblins' ? 'goblin' : null; L.ruler = npc(rng, title, ctx(), race && FIRST[race] ? race : null); if (type === 'goblins') { L.ruler.name = pick(rng, ['Snikkit', 'Grubnose', 'Wartmother', 'Big Ug', 'Skrag']); L.ruler.race = 'goblin'; } }
    L.elected = (type === 'council' || type === 'guild') && rng() < .35;
    L.hidden = !site && rng() < .35 ? { ...faction(rng, world, wpick(rng, HIDDEN)), what: pick(rng, HIDDEN_WHAT) } : null;
  }
  if (section === 'defense') {
    const big = L.tier === 'large';
    if (kind === 'city') L.defense = 'wall';
    else if (kind === 'town') L.defense = wpick(rng, big ? { wall: 6, palisade: 3, none: 1 } : { wall: 3, palisade: 5, none: 2 });
    else if (kind === 'village') L.defense = rng() < (big ? .35 : .15) ? 'palisade' : 'none';
    else L.defense = 'none';
    L.towers = kind === 'city' ? int(rng, 8, 14) : kind === 'town' ? int(rng, 2, 6) : kind === 'village' ? int(rng, 0, 1) : kind === 'crossing' ? int(rng, 0, 1) : 0;
    L.guards = kind === 'city' ? Math.round(L.pop / int(rng, 60, 120)) : kind === 'town' ? Math.round(L.pop / int(rng, 80, 160)) : kind === 'village' ? int(rng, 0, 6) : kind === 'keep' ? L.pop : kind === 'tower' ? L.pop : 0;
  }
  if (section === 'buildings') {
    const list = site ? [] : shopList(rng, kind, L.tier, L.fields || 0, L.defense || 'none');
    L.buildings = list.map(k => { const s = SHOP[k], o = npc(rng, s.role, ctx()); return { kind: k, label: s.label, name: s.name(rng), owner: `${o.name} (${o.race}), ${o.trait}` }; });
    if (site) {
      const rooms = shuffle(rng, ROOMS[kind] || ROOMS.ruin), n = kind === 'tower' ? 3 : kind === 'shrine' ? int(rng, 2, 4) : int(rng, 3, 6);
      L.rooms = (kind === 'tower' || kind === 'keep' ? (ROOMS[kind]).slice(0, n) : rooms.slice(0, n));
      const dw = DWELLERS[L.faction?.type] || ['travellers'];
      L.dwellers = L.pop ? `${L.pop} × ${pick(rng, dw)}` : 'no one, for now';
      L.threat = kind === 'shrine' ? pick(rng, THREATS.slice(0, 2)) : pick(rng, kind === 'tower' ? THREATS.slice(0, 2) : THREATS);
      const loot = shuffle(rng, ITEMS);
      L.treasure = [`${int(rng, 2, 40) * 10} gp in mixed coin`, ...loot.slice(0, int(rng, 1, 2))];
    } else { delete L.rooms; delete L.dwellers; delete L.threat; delete L.treasure; }
  }
  if (section === 'npcs') {
    const roles = site ? ['captive', 'survivor', 'lieutenant', 'scout', 'hermit'] : ['farmer', 'guard', 'merchant', 'priest', 'child', 'old soldier', 'washerwoman', 'beggar', 'traveller', 'hunter', 'scribe', 'drunkard'];
    const n = site ? int(rng, 1, 2) : clamp(2 + Math.round(Math.log10(Math.max(10, L.pop || 10))), 3, 6);
    L.npcs = shuffle(rng, roles).slice(0, n).map(r => npc(rng, r, ctx()));
  }
  if (section === 'flavour') {
    // any mood fits any place: a cosy bandit camp is a good hook
    L.atmosphere = campaignPick(rng, 'ATMOS', ATMOS);
    L.oddity = rng() < .7 ? campaignPick(rng, 'ODD', ODD) : null;
    L.danger = L.conspiracy?'Residents close ranks when outsiders ask about local customs.':campaignPick(rng, 'DANGER', DANGER);
  }
  if (section === 'hooks') {
    const c = ctx();
    L.hooks = campaignList(rng, 'HOOKS', HOOKS, 3).map(h => fill(h, c));
    if(L.conspiracy)L.hooks[0]='Investigate '+L.conspiracy.name+'. '+L.conspiracy.secret;
    L.rumours = campaignList(rng, 'RUMOURS', RUMOURS, 2).map(h => fill(h, c));
  }
  return L;
}

// One line for a label or a card header.
export function summary(S) {
  const L = S.lore; if (!L) return KINDS[S.kind]?.label || S.kind;
  const site = KINDS[S.kind]?.group === 'site';
  return `${L.sizeLabel}${site ? '' : ` · ${L.pop.toLocaleString()} people`}`;
}
// What the 3D builder needs from the lore.
export function featuresOf(S) {
  const L = S.lore || {}, has = k => (L.buildings || []).some(b => b.kind === k);
  return {
    defense: L.defense || 'none', towers: L.towers || 0, fields: L.fields ?? (S.kind === 'village' ? 6 : S.kind === 'town' ? 12 : 0), wells: L.wells ?? 1,
    temple: has('temple') || has('chapel'), inn: has('inn') || has('tavern'), smithy: has('smithy'), mill: has('mill'), market: has('market'), barn: has('barn'),
  };
}

// Shared with rollers.js (the GM's dice drawer).
export { pick, wpick, int, cap, an, shuffle, npc, personName, fill, faction, FACTIONS, SHOP, ITEMS, ROOMS, DWELLERS, HOOKS, RUMOURS, ATMOS, ODD, DANGER, TRAITS, WANTS, SECRETS, SUR, FIRST, RACES, PRE, SUF, ADJ, NOUN, MOODS, GOODS, THREATS };
