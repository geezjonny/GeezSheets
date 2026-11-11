// Encounters from the land: what lives here (terrain, a road or river nearby, ruins, a town), the
// weather, the time of day and the nearest place's local danger pick who turns up; the party's level,
// size and the wanted difficulty set how many (DMG XP budgets). Creatures follow GeezSheets' wilds
// (wolves hunt deer in forest and hills, goblins raid from the hills, the dead walk in swamp and ruins).
// rollEncounter(seed, opts, world, ctx) -> a roller card model with .encounter = { members, at } to place.
// Stat blocks: data/monsters.js (SRD 5.1).
import { mulberry } from './noise.js';
import { MONSTERS } from './data/monsters.js';
import { TYPES } from './world.js';

const rngOf = seed => mulberry((seed | 0) || 1);
const pick = (rng, a) => a[Math.floor(rng() * a.length) % a.length];
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

// terrain type index -> habitat
const HABITAT = ['sea', 'coast', 'coast', 'plains', 'forest', 'hills', 'mountains', 'snow', 'swamp', 'dry'];
// Encounter table. where: habitat (or road, river, ruins, town) -> weight. m: [monster, min, max] (the first
// row scales with the budget unless fixed: true). peace: no fight expected (no XP budget).
// night/day, wx (weather kind -> weight multiplier), danger (words in a place's local danger that make it likelier).
const E = [
  { id: 'wolves', name: 'A wolf pack', where: { forest: 4, hills: 3, plains: 2, snow: 1 }, m: [['wolf', 2, 8], ['dire-wolf', 0, 1]], night: 2, danger: /wolves/i, att: 'hungry',
    doing: ['circling a wounded elk', 'trailing the party at a distance, waiting for dark', 'feeding on a fresh kill', 'howling to one another across the slope'],
    signs: ['Paw prints the size of a hand in the mud.', 'A half-eaten deer, still warm.', 'Howls, closer each time.'], twist: ['The pack leader is a werewolf in wolf form.', 'They are starving: a cart of salted meat would turn them.', 'A hunter is already up a tree, waiting for help.'] },
  { id: 'werewolf', name: 'Something that is not a wolf', where: { forest: 1, hills: .5 }, m: [['werewolf-wolf', 1, 1, 1], ['wolf', 0, 3]], night: 4, minLevel: 3, att: 'hostile',
    doing: ['stalking the party from the treeline', 'dragging a body off the road'], signs: ['Wolf tracks that turn into bare feet.', 'Torn clothes on a bramble.'], twist: ['By day it is someone the party has met.', 'It is fighting the curse and begs them to run.'] },
  { id: 'spiders', name: 'Giant spiders', where: { forest: 3, swamp: 3, ruins: 1 }, m: [['giant-spider', 1, 4], ['giant-wolf-spider', 0, 3]], night: 1.5, danger: /corruption|shadow/i, att: 'hostile',
    doing: ['waiting above the path in webs', 'wrapping a struggling traveller'], signs: ['Webs strung between the trees like sails.', 'Cocooned deer hanging from the branches.'], twist: ['One cocoon holds a living merchant with a map.', 'The webs are full of old coins.'] },
  { id: 'owlbear', name: 'An owlbear', where: { forest: 2 }, m: [['owlbear', 1, 1, 1]], minLevel: 2, att: 'hostile',
    doing: ['tearing open a hollow log for grubs', 'guarding a nest of two eggs'], signs: ['Huge clawed prints and feathers.', 'A hooting screech that does not sound like an owl.'], twist: ['The eggs would fetch 50 gp each in town.', 'It is wounded by an old crossbow bolt.'] },
  { id: 'bears', name: 'A bear', where: { forest: 2, hills: 1, snow: 2 }, m: [['brown-bear', 1, 2]], att: 'wary', day: 1.3,
    doing: ['fishing at the river', 'digging out a wasps\' nest', 'with a cub nearby'], signs: ['Claw marks high on a tree.', 'Scat full of berries.'], twist: ['A cub is just out of sight; the mother will not back down.', 'Leave it food and it will leave them be.'] },
  { id: 'polar', name: 'A white bear', where: { snow: 3 }, m: [['polar-bear', 1, 1, 1]], att: 'hungry', doing: ['hunting across the snowfield'], signs: ['Huge prints in the fresh snow.'], twist: ['It has been following them since dawn.'] },
  { id: 'boar', name: 'Wild boar', where: { forest: 3, swamp: 1, plains: 1 }, m: [['boar', 1, 4], ['giant-boar', 0, 1]], att: 'wary', peace: false,
    doing: ['rooting in the leaf litter', 'wallowing in a mud hole'], signs: ['Churned earth and broken roots.'], twist: ['A noble\'s hunting party is after the same boar.'] },
  { id: 'deer', name: 'Deer', where: { forest: 4, plains: 2, hills: 2 }, m: [['deer', 2, 9]], peace: true, att: 'shy', day: 1.5,
    doing: ['grazing at the edge of a clearing', 'bolting across the road'], signs: ['Hoof prints and nibbled shoots.'], twist: ['Something has spooked them, and it is coming this way.', 'A white stag stands among them.'] },
  { id: 'elk', name: 'An elk herd', where: { plains: 2, hills: 2, snow: 1 }, m: [['elk', 3, 10]], peace: true, att: 'shy', doing: ['crossing the valley', 'rutting, stags clashing'], signs: ['Antler rubs on the trees.'], twist: ['Wolves are trailing the herd.'] },
  { id: 'goats', name: 'Mountain goats', where: { mountains: 4, hills: 2 }, m: [['goat', 2, 8], ['giant-goat', 0, 2]], peace: true, att: 'shy', doing: ['balancing on a ledge above the path'], signs: ['Droppings on the ledges.'], twist: ['A rockslide starts when they bolt.'] },
  { id: 'bandits', name: 'Bandits', where: { road: 5, forest: 2, hills: 2, plains: 1 }, m: [['bandit', 2, 10], ['bandit-captain', 0, 1], ['scout', 0, 2]], day: 1.5, danger: /bandit/i, att: 'hostile',
    doing: ['blocking the road with a felled tree', 'demanding a toll from a farmer\'s cart', 'camped around a fire, counting loot', 'lying in ambush on both sides of the road'],
    signs: ['A felled tree across the road, cut, not fallen.', 'A cold campfire and gnawed bones.', 'A torn merchant\'s banner in the ditch.'], twist: ['They are deserters, desperate, and would join a better cause.', 'The captain is the reeve\'s missing son.', 'They have a prisoner worth a ransom.'] },
  { id: 'thugs', name: 'Highwaymen', where: { road: 3, town: 2 }, m: [['thug', 2, 5], ['bandit', 0, 3]], night: 1.5, att: 'hostile', doing: ['waiting under the bridge', 'following the party from the last inn'], signs: ['The same three faces at the last inn.'], twist: ['Someone in town paid them.'] },
  { id: 'patrol', name: 'A patrol', where: { road: 4, town: 3, plains: 1 }, m: [['guard', 2, 6], ['veteran', 0, 1, 1]], peace: true, att: 'wary', day: 1.5,
    doing: ['checking travellers\' papers', 'hunting someone who matches a party member', 'escorting a prisoner'], signs: ['Hoofbeats and a banner on the road.'], twist: ['They want the party\'s help: the prisoner\'s friends are coming.', 'They are not real guards.'] },
  { id: 'travellers', name: 'Travellers', where: { road: 5, plains: 1, town: 2 }, m: [['commoner', 2, 6], ['guard', 0, 2]], peace: true, att: 'friendly', day: 2,
    doing: ['a merchant\'s wagon with a broken wheel', 'pilgrims walking to a shrine', 'a family fleeing something behind them', 'a tinker selling odd trinkets'],
    signs: ['Cart tracks and voices ahead.'], twist: ['They are fleeing a raid; the raiders are not far behind.', 'The wagon carries something that should not move.', 'One of them is a noble in disguise.'] },
  { id: 'pilgrims', name: 'Pilgrims and a priest', where: { road: 2, ruins: 1 }, m: [['acolyte', 2, 5], ['priest', 1, 1, 1]], peace: true, att: 'friendly', doing: ['singing on the road', 'praying at a roadside shrine'], signs: ['Hymns carried on the wind.'], twist: ['Their relic is a fake.', 'They walk toward something that will kill them.'] },
  { id: 'cult', name: 'Cultists', where: { ruins: 3, town: 1, swamp: 1, forest: .5 }, m: [['cultist', 3, 8], ['cult-fanatic', 1, 1, 1]], night: 3, danger: /corruption|shadow|undead/i, att: 'hostile',
    doing: ['chanting around a circle of stones', 'leading a bound captive into the dark'], signs: ['Candle stubs and chalk marks.', 'A symbol cut into a tree.'], twist: ['The captive is the one they serve.', 'One cultist is an informant and will flee.'] },
  { id: 'goblins', name: 'Goblin raiders', where: { hills: 4, mountains: 2, swamp: 2, forest: 2 }, m: [['goblin', 3, 12], ['hobgoblin', 0, 2], ['bugbear', 0, 1]], night: 1.5, danger: /goblin|raid/i, att: 'hostile',
    doing: ['dragging stolen sheep up the hill', 'setting snares along a game trail', 'squabbling over a dead pony'], signs: ['Small bare footprints and a broken arrow.', 'A stolen sheep\'s bleating, cut short.'], twist: ['They will trade their loot for safe passage.', 'Their boss is a captive human who learned their tongue.'] },
  { id: 'orcs', name: 'An orc war band', where: { hills: 2, plains: 2, mountains: 1 }, m: [['orc', 3, 10], ['ogre', 0, 1]], minLevel: 2, danger: /raid/i, att: 'hostile', doing: ['marching toward the nearest village', 'burning a farmstead'], signs: ['Smoke on the horizon.', 'Drums, far off.'], twist: ['They are running from something worse.'] },
  { id: 'gnolls', name: 'Gnolls', where: { plains: 3, dry: 4 }, m: [['gnoll', 2, 8], ['giant-hyena', 0, 2], ['hyena', 0, 4]], night: 1.5, att: 'hungry', doing: ['laughing over a carcass', 'running down a horse'], signs: ['High, mad laughter at dusk.'], twist: ['They worship a demon whose idol they carry.'] },
  { id: 'ogre', name: 'An ogre', where: { hills: 3, mountains: 2, swamp: 1 }, m: [['ogre', 1, 2]], minLevel: 2, att: 'hungry', doing: ['roasting a cow on a spit', 'demanding a toll at a bridge'], signs: ['Uprooted trees and a terrible smell.'], twist: ['It can be bargained with: it loves riddles.', 'It wears a lord\'s signet ring.'] },
  { id: 'troll', name: 'A troll', where: { hills: 2, swamp: 2, mountains: 2 }, m: [['troll', 1, 1, 1]], minLevel: 5, night: 2, att: 'hungry', doing: ['under the bridge', 'gnawing bones in a cave mouth'], signs: ['Bones cracked for marrow.'], twist: ['Fire and acid: the village smith has a flask of alchemist\'s fire.'] },
  { id: 'giant', name: 'A hill giant', where: { hills: 2, mountains: 1 }, m: [['hill-giant', 1, 1, 1]], minLevel: 6, att: 'hostile', doing: ['throwing boulders at a herd', 'asleep across the path'], signs: ['Footprints you could bathe in.'], twist: ['It is lost and looking for its clan.'] },
  { id: 'harpies', name: 'Harpies', where: { mountains: 3, coast: 2, hills: 1 }, m: [['harpy', 1, 5]], att: 'hostile', doing: ['singing from the crags'], signs: ['A song that makes the horses walk toward the cliff.'], twist: ['Their nest holds a drowned sailor\'s purse.'] },
  { id: 'griffon', name: 'A griffon', where: { mountains: 3, hills: 1 }, m: [['griffon', 1, 2]], minLevel: 3, day: 1.5, att: 'hungry', doing: ['diving at the pack horses'], signs: ['A shadow crossing the sun.'], twist: ['A griffon egg is worth a fortune.'] },
  { id: 'manticore', name: 'A manticore', where: { mountains: 2, dry: 2, hills: 1 }, m: [['manticore', 1, 1, 1]], minLevel: 3, att: 'hostile', doing: ['perched on a rock, watching'], signs: ['Spikes stuck in a dead horse.'], twist: ['It talks, and it would rather be paid than fight.'] },
  { id: 'wyvern', name: 'A wyvern', where: { mountains: 2, hills: 1 }, m: [['wyvern', 1, 1, 1]], minLevel: 5, att: 'hostile', doing: ['circling overhead'], signs: ['Goats carried off from the high pastures.'], twist: ['Its lair is below a lost mine.'] },
  { id: 'dragon', name: 'A young dragon', where: { mountains: 1 }, m: [['young-red-dragon', 1, 1, 1]], minLevel: 8, att: 'hostile', doing: ['hunting the valley', 'sunning itself on a ledge'], signs: ['Scorched pines and melted snow.'], twist: ['It wants a servant, not a meal.'] },
  { id: 'winter', name: 'Winter wolves', where: { snow: 4 }, m: [['winter-wolf', 1, 3], ['wolf', 0, 3]], minLevel: 3, wx: { snow: 2 }, att: 'hungry', doing: ['running down a sled'], signs: ['Frost on the tracks, though the sun is up.'], twist: ['A frost giant keeps them.'] },
  { id: 'mephits', name: 'Ice mephits', where: { snow: 3, mountains: 1 }, m: [['ice-mephit', 2, 6]], wx: { snow: 2 }, att: 'hostile', doing: ['playing cruel tricks on a stuck traveller'], signs: ['Giggling from the ice.'], twist: ['They are bored, not evil; a game will do.'] },
  { id: 'whitedragon', name: 'A young white dragon', where: { snow: 1 }, m: [['young-white-dragon', 1, 1, 1]], minLevel: 7, att: 'hostile', doing: ['bursting from a frozen lake'], signs: ['Frozen corpses standing upright.'], twist: ['It hoards trophies, not gold.'] },
  { id: 'frogs', name: 'Giant frogs', where: { swamp: 4, river: 2 }, m: [['giant-frog', 2, 6], ['giant-toad', 0, 2]], wx: { rain: 1.5, storm: 1.5 }, att: 'hungry', doing: ['croaking in the reeds'], signs: ['A croak like a cow lowing.'], twist: ['A lost ring glints in one\'s gullet.'] },
  { id: 'croc', name: 'A crocodile', where: { swamp: 3, river: 3 }, m: [['crocodile', 1, 3]], att: 'hungry', doing: ['lying still at the ford'], signs: ['A log that is not a log.'], twist: ['The ford is the only crossing for a day.'] },
  { id: 'lizardfolk', name: 'Lizardfolk hunters', where: { swamp: 4, river: 1 }, m: [['lizardfolk', 2, 8]], att: 'wary', doing: ['spearing fish', 'hauling a canoe'], signs: ['Bone charms on a stake.'], twist: ['They will trade, or hunt the party, depending on the gift.'] },
  { id: 'hag', name: 'A green hag', where: { swamp: 2, forest: .5 }, m: [['green-hag', 1, 1, 1], ['will-o-wisp', 0, 1]], minLevel: 3, night: 2, wx: { fog: 3 }, att: 'cunning', doing: ['disguised as a lost old woman', 'stirring a pot in a hut on stilts'], signs: ['A child\'s voice calling for help in the fog.'], twist: ['She offers a true answer, at a price.'] },
  { id: 'wisp', name: 'Will-o\'-wisps', where: { swamp: 3, ruins: 1 }, m: [['will-o-wisp', 1, 3]], minLevel: 2, night: 3, wx: { fog: 3 }, att: 'cunning', doing: ['bobbing lights that lead off the path'], signs: ['Lights in the marsh, like lanterns.'], twist: ['They lead to a drowned shrine with treasure.'] },
  { id: 'shambler', name: 'A shambling mound', where: { swamp: 2, forest: .5 }, m: [['shambling-mound', 1, 1, 1]], minLevel: 4, wx: { rain: 1.5, storm: 2 }, att: 'hostile', doing: ['lying in wait as a heap of rot'], signs: ['A heap of weeds that breathes.'], twist: ['Lightning makes it stronger.'] },
  { id: 'insects', name: 'A swarm', where: { swamp: 3, dry: 1, forest: 1 }, m: [['swarm-of-insects', 1, 4]], wx: { clear: 1.5 }, att: 'hostile', doing: ['rising from a rotten carcass'], signs: ['A drone like a distant saw.'], twist: ['They nest in a corpse with a purse.'] },
  { id: 'ravens', name: 'Ravens', where: { ruins: 2, plains: 1, forest: 1 }, m: [['swarm-of-ravens', 1, 3]], att: 'wary', doing: ['picking over a battlefield'], signs: ['A black cloud over the trees.'], twist: ['They are a witch\'s eyes.'] },
  { id: 'dead', name: 'The walking dead', where: { swamp: 3, ruins: 4, plains: .5 }, m: [['zombie', 2, 10], ['skeleton', 0, 6], ['ghoul', 0, 2]], night: 3, wx: { fog: 2 }, danger: /undead|catacomb/i, att: 'hostile',
    doing: ['shuffling toward the nearest village', 'digging at a grave', 'standing in a ring, waiting'], signs: ['A smell of grave earth.', 'Open graves, dug from below.'], twist: ['A necromancer\'s apprentice controls them from a hill.', 'They are the village\'s own dead, and someone sent them.'] },
  { id: 'ghouls', name: 'Ghouls', where: { ruins: 3, swamp: 1 }, m: [['ghoul', 1, 6]], night: 3, minLevel: 2, att: 'hungry', doing: ['feeding in a crypt'], signs: ['Gnawed bones, human.'], twist: ['A wight leads them.'] },
  { id: 'wight', name: 'A wight and its dead', where: { ruins: 2, snow: .5 }, m: [['wight', 1, 1, 1], ['zombie', 0, 6]], minLevel: 4, night: 3, att: 'hostile', doing: ['riding out to claim its old lands'], signs: ['Frost in summer, hoofbeats with no horse.'], twist: ['It was the old lord of this place.'] },
  { id: 'spirit', name: 'A restless spirit', where: { ruins: 3, swamp: 1, town: .5 }, m: [['ghost', 1, 1, 1]], minLevel: 3, night: 3, wx: { fog: 2 }, att: 'cunning', doing: ['weeping at a well', 'repeating its death over and over'], signs: ['Cold spots and a smell of lilies.'], twist: ['Bury its bones and it is free.'] },
  { id: 'shadows', name: 'Shadows', where: { ruins: 3, forest: .5, swamp: .5 }, m: [['shadow', 1, 6], ['specter', 0, 1]], minLevel: 2, night: 3, danger: /shadow/i, att: 'hostile', doing: ['moving against the light'], signs: ['Shadows that point the wrong way.'], twist: ['They came from a broken ward-stone nearby.'] },
  { id: 'mummy', name: 'A mummy', where: { dry: 1, ruins: 1 }, m: [['mummy', 1, 2]], minLevel: 4, att: 'hostile', doing: ['guarding a tomb'], signs: ['A sealed door, broken open from inside.'], twist: ['Return what was stolen and it lies down.'] },
  { id: 'scorpion', name: 'A giant scorpion', where: { dry: 3 }, m: [['giant-scorpion', 1, 2]], minLevel: 3, att: 'hostile', doing: ['under the sand'], signs: ['A clicking under the dunes.'], twist: [] },
  { id: 'jackals', name: 'Jackals', where: { dry: 4, plains: 1 }, m: [['jackal', 3, 10]], night: 1.5, att: 'hungry', doing: ['yipping around the camp'], signs: ['Eyes in the dark.'], twist: ['A wererat fled here; they follow it.'] },
  { id: 'crabs', name: 'Giant crabs', where: { coast: 4 }, m: [['giant-crab', 2, 6]], att: 'hostile', doing: ['scuttling out of the surf'], signs: ['Huge claw marks on the sand.'], twist: ['A wreck on the reef.'] },
  { id: 'sahuagin', name: 'Sahuagin raiders', where: { coast: 3 }, m: [['sahuagin', 2, 8]], minLevel: 2, night: 2, att: 'hostile', doing: ['dragging fishermen into the sea'], signs: ['Fish-bone spears on the beach.'], twist: ['A shark god demands a sacrifice.'] },
  { id: 'merrow', name: 'Merrow', where: { coast: 2, river: .5 }, m: [['merrow', 1, 3]], minLevel: 3, att: 'hostile', doing: ['lurking under the pier'], signs: ['Nets cut from below.'], twist: [] },
  { id: 'eagles', name: 'Giant eagles', where: { mountains: 2 }, m: [['giant-eagle', 1, 3]], peace: true, att: 'proud', day: 2, doing: ['watching from a high nest'], signs: ['Wings that block the sun.'], twist: ['They will carry the party, for a favour.'] },
  { id: 'centaurs', name: 'Centaurs', where: { plains: 2, forest: 1 }, m: [['centaur', 2, 5]], peace: true, att: 'wary', doing: ['hunting with bows', 'guarding a sacred grove'], signs: ['Unshod hoof prints, two by two.'], twist: ['They need someone to talk to a stubborn lord.'] },
  { id: 'dryad', name: 'A dryad', where: { forest: 1 }, m: [['dryad', 1, 1, 1]], peace: true, att: 'cunning', doing: ['watching from her oak'], signs: ['Flowers out of season.'], twist: ['Loggers are coming for her tree.'] },
  { id: 'wererats', name: 'Wererats', where: { town: 3, ruins: 1 }, m: [['wererat-human', 1, 4]], night: 2, att: 'hostile', doing: ['in the sewers under the market', 'robbing a drunk in an alley'], signs: ['Rats that watch, and do not run.'], twist: ['The guild pays them.'] },
  { id: 'brawl', name: 'Trouble in the streets', where: { town: 4 }, m: [['thug', 2, 6], ['guard', 0, 2]], night: 1.5, att: 'hostile', doing: ['a tavern brawl spilling outside', 'a shakedown of a stallholder'], signs: ['Shouting and breaking glass.'], twist: ['A guard is on the take.'] },
  { id: 'knight', name: 'A knight errant', where: { road: 2, plains: 1 }, m: [['knight', 1, 1, 1], ['guard', 0, 2]], peace: true, att: 'proud', day: 2, doing: ['challenging all comers at a bridge'], signs: ['A pavilion and a shield on a post.'], twist: ['Beat him and he swears service.'] },
];

// DMG XP thresholds per character (easy, medium, hard, deadly) by level.
// Additional encounters use the existing habitat weights and XP budgets.
E.push(...[
  {
    "id": "ink_1",
    "name": "Toll collectors without a charter",
    "where": {
      "road": 2,
      "town": 2
    },
    "m": [
      [
        "guard",
        2,
        5
      ]
    ],
    "peace": true,
    "att": "wary",
    "doing": [
      "checking every wagon against a water-damaged list"
    ],
    "signs": [
      "A rope barrier and an overturned toll board."
    ],
    "twist": [
      "Their warrant expired yesterday; they have not been paid."
    ]
  },
  {
    "id": "ink_2",
    "name": "Refugees with a locked cart",
    "where": {
      "road": 2,
      "plains": 2
    },
    "m": [
      [
        "commoner",
        3,
        8
      ]
    ],
    "peace": true,
    "att": "wary",
    "doing": [
      "hauling their remaining possessions uphill"
    ],
    "signs": [
      "Small bare footprints beside deep wheel ruts."
    ],
    "twist": [
      "The locked cart holds the village bell, not treasure."
    ]
  },
  {
    "id": "ink_3",
    "name": "Charcoal burners seeking help",
    "where": {
      "forest": 2,
      "hills": 2
    },
    "m": [
      [
        "commoner",
        2,
        5
      ]
    ],
    "peace": true,
    "att": "wary",
    "doing": [
      "trying to pull a companion from a collapsed kiln"
    ],
    "signs": [
      "A column of unusually pale smoke."
    ],
    "twist": [
      "The kiln was built over a forgotten stair."
    ]
  },
  {
    "id": "ink_4",
    "name": "A wounded courier",
    "where": {
      "road": 2,
      "hills": 2
    },
    "m": [
      [
        "scout",
        1,
        1
      ]
    ],
    "peace": true,
    "att": "wary",
    "doing": [
      "hiding beneath a fallen boundary stone"
    ],
    "signs": [
      "A horse wanders with a cut saddle girth."
    ],
    "twist": [
      "The courier carries two contradictory orders."
    ]
  },
  {
    "id": "ink_5",
    "name": "Pilgrims carrying an empty bier",
    "where": {
      "road": 2,
      "ruins": 2
    },
    "m": [
      [
        "acolyte",
        2,
        4
      ]
    ],
    "peace": true,
    "att": "wary",
    "doing": [
      "arguing over which path leads to a lost shrine"
    ],
    "signs": [
      "Bare feet and incense ash on the road."
    ],
    "twist": [
      "They believe the corpse will join them at sunset."
    ]
  },
  {
    "id": "ink_6",
    "name": "A deserter's supper",
    "where": {
      "forest": 2,
      "road": 2
    },
    "m": [
      [
        "bandit",
        2,
        5
      ]
    ],
    "peace": true,
    "att": "wary",
    "doing": [
      "cooking stolen turnips in a dented helmet"
    ],
    "signs": [
      "A cooking fire screened with wet blankets."
    ],
    "twist": [
      "They will surrender to anyone except their former captain."
    ]
  },
  {
    "id": "ink_7",
    "name": "Grave robbers at work",
    "where": {
      "ruins": 2,
      "town": 2
    },
    "m": [
      [
        "bandit",
        2,
        6
      ]
    ],
    "peace": false,
    "att": "hostile",
    "doing": [
      "breaking open a recently sealed burial vault"
    ],
    "signs": [
      "Fresh mortar scattered beside old headstones."
    ],
    "twist": [
      "They were hired to retrieve a document, not a body."
    ]
  },
  {
    "id": "ink_8",
    "name": "Tame wolves defending a fallen master",
    "where": {
      "road": 2,
      "town": 2
    },
    "m": [
      [
        "wolf",
        2,
        5
      ]
    ],
    "peace": false,
    "att": "hostile",
    "doing": [
      "blocking the way to an unconscious traveller"
    ],
    "signs": [
      "A broken walking stick and low growling."
    ],
    "twist": [
      "Food and calm handling may avert the fight."
    ]
  },
  {
    "id": "ink_9",
    "name": "Goblins in the relief grain",
    "where": {
      "town": 2,
      "ruins": 2
    },
    "m": [
      [
        "goblin",
        3,
        8
      ]
    ],
    "peace": false,
    "att": "hostile",
    "doing": [
      "looting a stranded food cart"
    ],
    "signs": [
      "Grain trickles from hastily slashed sacks."
    ],
    "twist": [
      "The driver refuses to abandon the only grain for a nearby hamlet."
    ]
  },
  {
    "id": "ink_10",
    "name": "Goblins carrying a peace banner",
    "where": {
      "forest": 2,
      "hills": 2
    },
    "m": [
      [
        "goblin",
        2,
        6
      ]
    ],
    "peace": true,
    "att": "wary",
    "doing": [
      "debating whether the party can read their flag"
    ],
    "signs": [
      "A bedsheet marked with a careful open hand."
    ],
    "twist": [
      "They need medicine for a fever spreading through their camp."
    ]
  },
  {
    "id": "ink_11",
    "name": "Bandits posing as mourners",
    "where": {
      "road": 2,
      "town": 2
    },
    "m": [
      [
        "bandit",
        3,
        7
      ]
    ],
    "peace": false,
    "att": "hostile",
    "doing": [
      "waiting beside a coffin full of weapons"
    ],
    "signs": [
      "Funeral clothes with brand-new boots."
    ],
    "twist": [
      "Their lookout has mistaken the party for another gang."
    ]
  },
  {
    "id": "ink_12",
    "name": "Skeletons repairing a bridge",
    "where": {
      "ruins": 2,
      "road": 2
    },
    "m": [
      [
        "skeleton",
        2,
        6
      ]
    ],
    "peace": false,
    "att": "hostile",
    "doing": [
      "placing the same stones into a broken span"
    ],
    "signs": [
      "A steady scraping long after the workers should have stopped."
    ],
    "twist": [
      "The dead labourers obey the last foreman's whistle."
    ]
  },
  {
    "id": "ink_13",
    "name": "Zombies in a harvest cart",
    "where": {
      "plains": 2,
      "road": 2
    },
    "m": [
      [
        "zombie",
        2,
        6
      ]
    ],
    "peace": false,
    "att": "hostile",
    "doing": [
      "struggling beneath a tightly tied tarpaulin"
    ],
    "signs": [
      "Flies rise from a cart with no driver."
    ],
    "twist": [
      "A village paid to have its plague dead removed quietly."
    ]
  },
  {
    "id": "ink_14",
    "name": "Wolves at a trapped deer",
    "where": {
      "forest": 2,
      "snow": 2
    },
    "m": [
      [
        "wolf",
        2,
        6
      ]
    ],
    "peace": false,
    "att": "hostile",
    "doing": [
      "circling an animal caught in an iron snare"
    ],
    "signs": [
      "Blood and snapped branches around a game trail."
    ],
    "twist": [
      "The trap bears a nearby noble's mark."
    ]
  },
  {
    "id": "ink_15",
    "name": "Spiders in the signal tower",
    "where": {
      "forest": 2,
      "ruins": 2
    },
    "m": [
      [
        "giant-spider",
        1,
        3
      ]
    ],
    "peace": false,
    "att": "hostile",
    "doing": [
      "wrapping the tower's signal brazier in silk"
    ],
    "signs": [
      "Webbing carries scraps of military pennants."
    ],
    "twist": [
      "A living signal keeper is trapped on the upper platform."
    ]
  },
  {
    "id": "ink_16",
    "name": "An ogre collecting broken carts",
    "where": {
      "hills": 2,
      "road": 2
    },
    "m": [
      [
        "ogre",
        1,
        2
      ]
    ],
    "peace": false,
    "att": "hostile",
    "doing": [
      "dragging a wagon toward a growing heap of wheels"
    ],
    "signs": [
      "A trail of deeply gouged axle ends."
    ],
    "twist": [
      "The ogre thinks a wheelwright promised to build it a house."
    ]
  },
  {
    "id": "ink_17",
    "name": "Guards escorting a witness",
    "where": {
      "town": 2,
      "road": 2
    },
    "m": [
      [
        "guard",
        2,
        6
      ]
    ],
    "peace": true,
    "att": "wary",
    "doing": [
      "shielding a hooded passenger from curious eyes"
    ],
    "signs": [
      "A small escort avoids every public inn."
    ],
    "twist": [
      "The witness recognises one guard as an accomplice."
    ]
  },
  {
    "id": "ink_18",
    "name": "A priest returning stolen offerings",
    "where": {
      "town": 2,
      "ruins": 2
    },
    "m": [
      [
        "priest",
        1,
        1
      ]
    ],
    "peace": true,
    "att": "wary",
    "doing": [
      "sorting coins into labelled cloth bags"
    ],
    "signs": [
      "A handcart rattles with mismatched temple boxes."
    ],
    "twist": [
      "The priest robbed a corrupt superior and needs an escort."
    ]
  },
  {
    "id": "ink_19",
    "name": "A knight with a broken banner",
    "where": {
      "road": 2,
      "plains": 2
    },
    "m": [
      [
        "knight",
        1,
        1
      ]
    ],
    "peace": true,
    "att": "wary",
    "doing": [
      "burying a horse beside the road"
    ],
    "signs": [
      "A banner lies face-down in the ditch."
    ],
    "twist": [
      "The knight wants the animal buried before discussing any business."
    ]
  },
  {
    "id": "ink_20",
    "name": "Crabs inside a stranded boat",
    "where": {
      "coast": 2,
      "swamp": 2
    },
    "m": [
      [
        "giant-crab",
        2,
        6
      ]
    ],
    "peace": false,
    "att": "hostile",
    "doing": [
      "cracking open crates in the hull"
    ],
    "signs": [
      "Wood snaps inside a boat far above the current waterline."
    ],
    "twist": [
      "A trapped deckhand is hiding under the floorboards."
    ]
  },
  {
    "id": "ink_21",
    "name": "Cultists painting boundary stones",
    "where": {
      "hills": 2,
      "ruins": 2
    },
    "m": [
      [
        "cultist",
        3,
        8
      ]
    ],
    "peace": false,
    "att": "hostile",
    "doing": [
      "marking an old procession route with red chalk"
    ],
    "signs": [
      "Fresh symbols appear on the inward faces of stones."
    ],
    "twist": [
      "They claim the markings keep something inside the valley."
    ]
  },
  {
    "id": "ink_22",
    "name": "A ghost at the washed-out ford",
    "where": {
      "swamp": 2,
      "ruins": 2
    },
    "m": [
      [
        "ghost",
        1,
        1
      ]
    ],
    "peace": false,
    "att": "hostile",
    "doing": [
      "beckoning travellers toward submerged stepping stones"
    ],
    "signs": [
      "A wet footprint appears on a dry rock."
    ],
    "twist": [
      "It is repeating a rescue attempt that failed years ago."
    ]
  },
  {
    "id": "ink_23",
    "name": "Thugs guarding a sealed cellar",
    "where": {
      "town": 2,
      "ruins": 2
    },
    "m": [
      [
        "thug",
        2,
        5
      ]
    ],
    "peace": false,
    "att": "hostile",
    "doing": [
      "turning away anyone carrying a lantern"
    ],
    "signs": [
      "The cellar door is warm despite the cold air."
    ],
    "twist": [
      "They fear what their employer stored below."
    ]
  },
  {
    "id": "ink_24",
    "name": "Scouts tracking an absent caravan",
    "where": {
      "hills": 2,
      "road": 2
    },
    "m": [
      [
        "scout",
        2,
        4
      ]
    ],
    "peace": true,
    "att": "wary",
    "doing": [
      "measuring tracks that stop abruptly on firm ground"
    ],
    "signs": [
      "Wheel ruts end without any sign of turning."
    ],
    "twist": [
      "An old military culvert runs under the road."
    ]
  },
  {
    "id": "ink_25",
    "name": "A trader sheltering from dust",
    "where": {
      "dry": 2,
      "road": 2
    },
    "m": [
      [
        "commoner",
        1,
        3
      ]
    ],
    "peace": true,
    "att": "wary",
    "doing": [
      "sharing water beneath a patched awning"
    ],
    "signs": [
      "A little bell rings beneath a dust-covered wagon."
    ],
    "twist": [
      "The trader will trade supplies for help repairing an axle."
    ]
  }
]);

// Campaign encounters retain existing creature rules and encounter budgets.
E.push(...[
  {
    "id": "blood_tithe",
    "name": "A vampire's tithe collectors",
    "where": {
      "town": 2,
      "road": 2
    },
    "m": [
      [
        "cultist",
        2,
        6
      ]
    ],
    "att": "hostile",
    "peace": false,
    "theme": true,
    "doing": [
      "collecting sealed blood flasks under a noble seal"
    ],
    "signs": [
      "An iron-bound donation chest and household lists."
    ],
    "twist": [
      "The mortal collectors believe their vampire patron keeps a worse threat away."
    ]
  },
  {
    "id": "illithid_thralls",
    "name": "Illithid-conditioned couriers",
    "where": {
      "town": 2,
      "road": 2,
      "ruins": 2
    },
    "m": [
      [
        "scout",
        2,
        6
      ]
    ],
    "att": "wary",
    "peace": true,
    "theme": true,
    "doing": [
      "carrying a lead-lined case while reciting the same route"
    ],
    "signs": [
      "Identical gaps in their accounts of the previous night."
    ],
    "twist": [
      "These mortal scouts are controlled by an illithid elsewhere. Breaking that control could make them allies."
    ]
  },
  {
    "id": "occult_vigil",
    "name": "An occult midnight vigil",
    "where": {
      "ruins": 2,
      "forest": 2,
      "swamp": 2
    },
    "m": [
      [
        "cultist",
        2,
        6
      ]
    ],
    "att": "hostile",
    "peace": false,
    "theme": true,
    "doing": [
      "chanting over a coffin chained to a standing stone"
    ],
    "signs": [
      "Black wax, grave salt, and a ring of footprints."
    ],
    "twist": [
      "One participant wants to defect and knows where the captives are held."
    ]
  },
  {
    "id": "plague_cart",
    "name": "The unburied plague dead",
    "where": {
      "town": 2,
      "road": 2,
      "swamp": 2
    },
    "m": [
      [
        "zombie",
        2,
        6
      ]
    ],
    "att": "hostile",
    "peace": false,
    "theme": true,
    "doing": [
      "following the creak of a funeral cart"
    ],
    "signs": [
      "Burial shrouds drag through the mud."
    ],
    "twist": [
      "A cult token hidden in the cart draws the zombies toward the next settlement."
    ]
  },
  {
    "id": "vampire_escapees",
    "name": "Escapees from a vampire's estate",
    "where": {
      "road": 2,
      "forest": 2,
      "hills": 2
    },
    "m": [
      [
        "commoner",
        2,
        6
      ]
    ],
    "att": "wary",
    "peace": true,
    "theme": true,
    "doing": [
      "hiding bite marks and begging to travel before dawn"
    ],
    "signs": [
      "Fine household livery torn into bandages."
    ],
    "twist": [
      "One escapee carries the only copy of the household blood ledger."
    ]
  },
  {
    "id": "memory_lodge",
    "name": "Collectors for the silent colony",
    "where": {
      "town": 2,
      "ruins": 2
    },
    "m": [
      [
        "cultist",
        2,
        6
      ]
    ],
    "att": "hostile",
    "peace": false,
    "theme": true,
    "doing": [
      "questioning a captive about dreams of an illithid city"
    ],
    "signs": [
      "Wax tablets depict faces with their names scraped away."
    ],
    "twist": [
      "The cultists serve an illithid through a relic; the illithid itself is elsewhere."
    ]
  }
]);

const XP = {
  easy: [25, 50, 75, 125, 250, 300, 350, 450, 550, 600, 800, 1000, 1100, 1250, 1400, 1600, 2000, 2100, 2400, 2800],
  medium: [50, 100, 150, 250, 500, 600, 750, 900, 1100, 1200, 1600, 2000, 2200, 2500, 2800, 3200, 3900, 4200, 4900, 5700],
  hard: [75, 150, 225, 375, 750, 900, 1100, 1400, 1600, 1900, 2400, 3000, 3400, 3800, 4300, 4800, 5900, 6300, 7300, 8500],
  deadly: [100, 200, 400, 500, 1100, 1400, 1700, 2100, 2400, 2800, 3600, 4500, 5100, 5700, 6400, 7200, 8800, 9500, 10900, 12700],
};
const mult = n => n <= 1 ? 1 : n === 2 ? 1.5 : n <= 6 ? 2 : n <= 10 ? 2.5 : n <= 14 ? 3 : 4;
const adjXP = rows => { const n = rows.reduce((a, r) => a + r.n, 0); return rows.reduce((a, r) => a + r.n * MONSTERS[r.mon].xp, 0) * mult(n); };
const crText = c => c === .125 ? '1/8' : c === .25 ? '1/4' : c === .5 ? '1/2' : String(c);

// What the land is like at a point.
export function placeContext(world, x, z) {
  const ti = world.typeAt(x, z), hab = HABITAT[ti], why = [TYPES[ti].name.toLowerCase()], tags = { [hab]: 1 };
  const road = world.lineDist(x, z, 'road'), river = world.lineDist(x, z, 'river');
  if (road < 30) { tags.road = 1; why.push('on the road'); }
  if (river < 60) { tags.river = 1; why.push('by the river'); }
  let place = null, pd = Infinity, ruins = null;
  for (const S of world.data.settlements) {
    const d = Math.hypot(S.x - x, S.z - z);
    if (d < (S.r || 60) && ['city', 'town', 'village', 'hamlet', 'crossing'].includes(S.kind)) { tags.town = 1; why.push(`in ${S.name}`); }
    if (['ruin', 'cave', 'mine', 'keep', 'tower', 'wizard', 'shrine'].includes(S.kind) && d < 700 && (!ruins || d < ruins.d)) ruins = { S, d };
    if (d < pd && S.lore) { pd = d; place = S; }
  }
  if (ruins && (ruins.S.kind === 'ruin' || ruins.S.kind === 'cave' || ruins.S.kind === 'mine' || ruins.S.lore?.threat)) { tags.ruins = 1; why.push(`near ${ruins.S.name}`); }
  const danger = place && pd < 4000 ? place.lore?.danger || '' : '';
  return { hab, tags, why, danger, place: pd < 4000 ? place : null };
}

export function rollEncounter(seed, opts = {}, world = null, ctx = {}) {
  const rng = rngOf(seed), level = Math.max(1, Math.min(20, +opts.level || 3)), party = Math.max(1, Math.min(8, +opts.party || 4));
  const diff = XP[opts.difficulty] ? opts.difficulty : 'medium', night = opts.time === 'night', wx = ctx.weather || 'clear';
  const C = world && ctx.x != null ? placeContext(world, ctx.x, ctx.z) : { hab: opts.habitat || 'forest', tags: { [opts.habitat || 'forest']: 1 }, why: [opts.habitat || 'forest'], danger: '', place: null };
  if (opts.habitat) { C.tags = { [opts.habitat]: 1 }; C.hab = opts.habitat; C.why = [opts.habitat]; }
  const budget = XP[diff][level - 1] * party;
  // weigh every entry for this spot
  const scored = [];
  for (const e of E) {
    let w = 0; for (const k in C.tags) w = Math.max(w, e.where[k] || 0);
    if (e.theme || e.m.some(([mon])=>/^(zombie|skeleton|ghoul|ghast|wight|ghost|specter|shadow|mummy|cultist|cult-fanatic)$/.test(mon))) w *= 4;
    if (!w || (e.minLevel || 1) > level + (diff === 'deadly' ? 2 : 0)) continue;
    if (night && e.night) w *= e.night; if (!night && e.day) w *= e.day; if (night && e.day) w /= e.day; if (!night && e.night && e.night >= 3) w /= 2;
    if (e.wx?.[wx]) w *= e.wx[wx];
    if ((wx === 'storm' || wx === 'snow') && C.tags.road && ['travellers', 'pilgrims', 'knight', 'patrol'].includes(e.id)) w *= .3;
    if (e.danger && e.danger.test(C.danger)) w *= 3;
    // too strong even at its smallest for this party (a lone ghost for level 3s): skip
    if (!e.peace && adjXP(e.m.map(([mon, lo], k) => ({ mon, n: k ? lo : Math.max(1, lo) })).filter(q => q.n > 0)) > budget * 1.5) continue;
    if (opts.kind === 'fight' && e.peace) continue;
    if (opts.kind === 'peace' && !e.peace) continue;
    scored.push([e, w]);
  }
  if (!scored.length) return { roller: 'encounter', seed, opts, title: 'Nothing stirs', sub: C.why.join(', '), sections: [{ t: 'Here', text: 'The land is quiet. Roll again, or try somewhere else.' }] };
  let r = rng() * scored.reduce((a, [, w]) => a + w, 0), e = scored[0][0];
  for (const [x, w] of scored) { r -= w; if (r <= 0) { e = x; break; } }
  // numbers: the optional rows roll in, then the main row grows to the budget
  const rows = e.m.map(([mon, lo, hi, fixed], k) => ({ mon, lo, hi, fixed: !!fixed, n: k === 0 ? Math.max(1, lo) : (rng() < .55 ? Math.round(lo + rng() * (hi - lo)) : lo) }));
  const main = rows[0];
  if (!main.fixed && !e.peace) {
    while (main.n < main.hi && adjXP(rows.map((q, k) => k ? q : { ...q, n: main.n + 1 })) <= budget) main.n++;
    while (adjXP(rows) > budget * 1.25) { const q = rows.slice(1).reverse().find(q => q.n > q.lo); if (q) q.n--; else if (main.n > Math.max(1, main.lo)) main.n--; else break; }
  } else if (e.peace) main.n = Math.round(main.lo + rng() * (main.hi - main.lo));
  const members = rows.filter(q => q.n > 0).map(q => ({ mon: q.mon, n: q.n }));
  const xp = adjXP(members), ratio = xp / budget;
  const feel = e.peace ? 'No fight unless someone starts one' : ratio < .6 ? 'Easy' : ratio < 1.1 ? cap(diff) === 'Easy' ? 'Easy' : 'About right' : ratio < 1.6 ? 'Hard' : 'Deadly';
  const names = members.map(q => `${q.n} ${q.n === 1 ? MONSTERS[q.mon].name.toLowerCase() : plural(MONSTERS[q.mon].name.toLowerCase())}`);
  const title = `${e.name}: ${names.join(', ')}`;
  return {
    roller: 'encounter', seed, opts, title, sub: `${feel} · ${C.why.join(', ')}${wx !== 'clear' ? ' · ' + wx : ''}${night ? ' · night' : ''}`,
    encounter: { id: e.id, members, at: ctx.x != null ? { x: ctx.x, z: ctx.z } : null, peace: !!e.peace },
    sections: [
      { t: 'What they are doing', text: cap(pick(rng, e.doing)) + '.' },
      { t: 'Before you see them', text: pick(rng, e.signs) },
      { t: 'Attitude', text: cap(e.att) + (e.peace ? '. They will not attack unless attacked.' : '.') },
      { t: 'Who', gm: true, list: members.map(q => { const M = MONSTERS[q.mon]; return `${q.n} × ${M.name}: CR ${crText(M.cr)}, AC ${M.ac}, HP ${M.hp}, ${M.speed}`; }) },
      e.peace ? null : { t: 'Difficulty', gm: true, rows: [['Party', `${party} at level ${level}`], ['XP', `${Math.round(xp)} adjusted (a ${diff} fight is about ${budget})`], ['Feels', feel]] },
      e.twist?.length ? { t: 'Twist', gm: true, text: pick(rng, e.twist) } : null,
      { t: 'Why here', gm: true, list: [...C.why.map(cap), C.danger && e.danger?.test(C.danger) ? `The local danger: ${C.danger}` : null, night && e.night ? 'More of them come out at night.' : null, e.wx?.[wx] ? `They like this weather (${wx}).` : null] },
    ].filter(Boolean),
  };
}
const plural = s => /wolf$/.test(s) ? s.replace(/wolf$/, 'wolves') : /(deer|elk|sheep|lizardfolk|merrow|sahuagin)$/.test(s) ? s : /(mummy)$/.test(s) ? s.replace(/y$/, 'ies') : /(ss|sh|ch|x)$/.test(s) ? s + 'es' : /^swarm of/.test(s) ? s.replace(/^swarm/, 'swarms') : /(werewolf|wererat)/.test(s) ? s.replace(/(were)(wolf|rat)/, (_, a, b) => a + (b === 'wolf' ? 'wolves' : 'rats')) : s + 's';

// Tokens for a rolled encounter: a cluster around (x, z), numbered, with stat block, HP and a figure.
export function encounterTokens(enc, x, z, rng = Math.random) {
  const specs = [], all = enc.members.flatMap(q => Array.from({ length: q.n }, (_, k) => ({ mon: q.mon, k, n: q.n })));
  const a0 = rng() * Math.PI * 2, R = 2.2 + Math.sqrt(all.length) * 1.4;
  all.forEach((q, i) => {
    const M = MONSTERS[q.mon], a = a0 + i * 2.4, rr = i ? R * Math.sqrt(i / all.length) : 0;
    const fields = { name: q.n > 1 ? `${M.name} ${q.k + 1}` : M.name, kind: enc.peace ? 'npc' : 'monster', mon: q.mon, hp: M.hp, maxHp: M.hp, color: enc.peace ? '#8a8a62' : '#7a2e26' };
    if (M.size !== 'Medium') fields.size = M.size; // the coin's picture comes from tokens/<monster>.png
    specs.push({ x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr, fields });
  });
  return specs;
}

export function statSections(mon) {
  const M = MONSTERS[mon]; if (!M) return [];
  const mod = v => `${v} (${v >= 10 ? '+' : ''}${Math.floor((v - 10) / 2)})`;
  return [
    { t: `${M.name}: ${M.size} ${M.type}, CR ${crText(M.cr)}`, gm: true, rows: [['AC', M.ac], ['HP', `${M.hp} (${M.hd})`], ['Speed', M.speed], ['STR DEX CON', M.ab.slice(0, 3).map(mod).join('  ')], ['INT WIS CHA', M.ab.slice(3).map(mod).join('  ')], ['Senses', M.senses], ['Languages', M.lang]] },
    M.traits.length ? { t: 'Traits', gm: true, list: M.traits.map(([n, d]) => `${n}. ${d}`) } : null,
    { t: 'Actions', gm: true, list: M.actions.map(([n, d]) => `${n}. ${d}`) },
  ].filter(Boolean);
}
