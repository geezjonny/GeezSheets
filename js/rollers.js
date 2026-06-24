// rollers.js — all random tables and roll functions
// Used by rollers.html (UI shell) and mapeditor.html (GM Tools panel)
// Pulls real item/spell data from data.js when available

import { getMagicItemsByRarity, getEquipmentByCategory } from "./data.js";

// ── Utils ─────────────────────────────────────────────────────────────────────
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function d(n)      { return Math.floor(Math.random() * n) + 1; }

// ── RAG tables ────────────────────────────────────────────────────────────────
export const RAG_DATA = {
  creature: {
    "Body Shape":    { die:"d20", options:["Serpentine and coiling","Hulking and quadrupedal","Lithe and bipedal","Bloated and amorphous","Skeletal and towering","Compact and squat","Elongated like a worm","Crablike with many legs","Centipede-segmented","Apelike and hunched","Winged and avian","Gelatinous and shifting","Insectoid with six limbs","Stout as a dwarf-bear","Wispy and translucent","Cephalopod-shaped","Chimeric blend of three","Toad-like and swollen","Spindly as a spider","Enormous as a barn"] },
    "Head":          { die:"d20", options:["Skull of a horned stag","Fanged serpent head","Three-eyed toad face","Beaked like a raven","Long goat snout","No head — just a maw","Crustacean mandibles","Flat shark face","Six-eyed spider face","Bull skull wreathed in fire","Elongated horse face","Floating eyeball cluster","Feathered owl face","Tentacled octopus head","Cyclopean giant eye","Human face stretched wrong","Wolf with too many teeth","Dragonborn-like reptile","Leech mouth ringed with teeth","A second creature's detached head"] },
    "Skin / Hide":   { die:"d12", options:["Iron-hard obsidian scales","Rotting necrotic flesh","Luminescent amphibian skin","Bark-like tree hide","Matted coarse black fur","Translucent showing organs","Crystalline chitinous shell","Mud-encrusted hide","Iridescent feather-scales","Stone-grey rocky plates","Oozing pustule-covered skin","Silver mirror-bright scales"] },
    "Limbs":         { die:"d10", options:["Six crab claws","Two massive gorilla arms","Spider legs from its back","Tentacles where legs should be","Stubby vestigial arms","Two arms ending in blade-bone","Hooves and backward knees","Four wings used as arms","Boneless writhing pseudopods","No limbs — it floats"] },
    "Tail":          { die:"d8",  options:["Scorpion stinger tail","Prehensile whip tail","Feathered peacock fan","Tail ending in a second jaw","Bony club tail","No tail — just a stump","Three serpent tails","Spectral ghost tail"] },
    "Special Trait": { die:"d12", options:["Leaves a trail of ice","Eyes glow like embers","Speaks in stolen voices","Bleeds acid instead of blood","Surrounded by a swarm of flies","Phases through walls","Can detach its own limbs","Regenerates before your eyes","Casts no shadow","Immune to all magic","Smells of rot and copper","Has a second creature fused to its back"] },
    "Size":          { die:"d6",  options:["Tiny (cat-sized)","Small (goblin-sized)","Medium (human-sized)","Large (horse-sized)","Huge (elephant-sized)","Gargantuan (fills the room)"] },
    "CR Hint":       { die:"d10", options:["CR 1/4 — an annoyance","CR 1 — real threat to townsfolk","CR 3 — watch out, adventurers","CR 5 — seasoned party challenge","CR 7 — regional menace","CR 9 — legendary local horror","CR 12 — dungeon boss territory","CR 15 — near-mythic terror","CR 18 — demigod-level menace","CR 20+ — end of campaign material"] },
  },
  character: {
    "Race":               { die:"d20", options:["Human","Elf (High)","Elf (Wood)","Elf (Drow)","Dwarf (Hill)","Dwarf (Mountain)","Halfling (Lightfoot)","Halfling (Stout)","Gnome (Rock)","Gnome (Forest)","Half-Elf","Half-Orc","Tiefling","Dragonborn","Aasimar","Tabaxi","Firbolg","Goliath","Kenku","Changeling"] },
    "Class":              { die:"d12", options:["Barbarian","Bard","Cleric","Druid","Fighter","Monk","Paladin","Ranger","Rogue","Sorcerer","Warlock","Wizard"] },
    "Background":         { die:"d12", options:["Acolyte","Charlatan","Criminal","Entertainer","Folk Hero","Guild Artisan","Hermit","Noble","Outlander","Sage","Sailor","Soldier"] },
    "Personality Trait":  { die:"d12", options:["Boisterous and prone to tall tales","Speaks only when it matters — then bluntly","Obsessively keeps a journal","Mistrustful of authority, fiercely loyal to allies","Cheerful to a fault, even in dire straits","Constantly quoting obscure proverbs","Haunted by a past mistake they won't discuss","Flirtatious and disarming with everyone","Deeply superstitious, reads omens in everything","Relentlessly competitive about everything","Overly formal, uncomfortable with casual speech","Empathetic to a fault"] },
    "Flaw":               { die:"d10", options:["Cannot resist a wager","Harbours a secret shame","Deeply cowardly when truly alone","Pathologically dishonest","Holds grudges across decades","Addicted to a substance or vice","Arrogant about their own abilities","Freezes under authority's scrutiny","Paranoid — believes someone is always watching","Greedy, even with friends"] },
    "Motivation":         { die:"d10", options:["Seek redemption for a past wrong","Protect someone they love at all costs","Amass power to never feel vulnerable again","Prove themselves to someone who doubted them","Uncover a buried family secret","Serve their deity faithfully","Escape a life they were born into","Avenge a devastating loss","Simply survive another day","Find a place they truly belong"] },
    "Alignment":          { die:"d9",  options:["Lawful Good","Neutral Good","Chaotic Good","Lawful Neutral","True Neutral","Chaotic Neutral","Lawful Evil","Neutral Evil","Chaotic Evil"] },
    "Distinctive Feature":{ die:"d12", options:["A long scar across the face","Eyes of two different colours","Speaks with an unplaceable accent","Always fidgets with a specific trinket","Missing two fingers on the left hand","Unnaturally still — never fidgets","Hair that shifts colour with mood","Covered in faded tattoos","A nervous laugh that undercuts serious moments","Carries a portrait of someone and never speaks of them","Limps slightly — denies it if asked","Hums constantly, stops only in combat"] },
    "Secret":             { die:"d10", options:["Wanted for a crime in another kingdom","Carries a cursed item they can't discard","Once a member of the enemy faction","Has a family member who is a villain","Doesn't actually have the skills they claimed","Being magically compelled by someone","Owes a life-debt to a powerful figure","Their real name is famous — or infamous","Has already died once — and remembers it","Is not the race they appear to be"] },
  },
};

// ── NPC tables ────────────────────────────────────────────────────────────────
export const NPC = {
  names: ["Aldric","Brina","Calder","Dessa","Emric","Faye","Gorin","Hessa","Ivor","Jarla","Keld","Lira","Marek","Nessa","Orin","Petra","Quen","Rova","Seld","Tava","Ulder","Vessa","Wren","Xara","Yoren","Zola","Bram","Cress","Daven","Elva","Finn","Gilda","Harwin","Isla","Jorin","Kessa","Lorn","Mira","Niall","Oswin"],
  occupations: {
    commoner: ["miller","farmer","thatcher","shepherd","washerwoman","gravedigger","candlemaker","brewer","carter","hedgewitch"],
    merchant: ["cloth merchant","spice trader","moneylender","fence","jeweler","apothecary","weapon dealer","map seller","horse trader","wine merchant"],
    guard:    ["gate guard","city watch","caravan guard","mercenary","bounty hunter","retired soldier","militia captain","dungeon warden","harbor master","bailiff"],
    noble:    ["minor lord","tax collector","court advisor","magistrate","guild master","bishop","military officer","ambassador","landlord","chancellor"],
  },
  wants:       ["find a missing relative","recover a stolen item","warn someone of danger","earn enough coin to leave town","protect a secret","prove their innocence","find a buyer for something strange","avoid a debt collector","deliver a message","earn respect they feel they've lost","get revenge quietly","disappear without a trace"],
  secrets:     ["owes a large debt to dangerous people","witnessed something they shouldn't have","is not who they claim to be","is in love with someone forbidden","is secretly a spy","has contraband hidden nearby","recently escaped from somewhere","knows where something valuable is buried","is being blackmailed","has a second family elsewhere","used to have a very different life","carries something that doesn't belong to them"],
  moods:       ["guarded and watchful","warm but distracted","anxious, keeps looking over their shoulder","boisterous and too friendly","grieving, hollow-eyed","cheerful in a forced way","suspicious of outsiders","drunk or pretending to be","weary beyond their years","righteous and lecture-prone","quietly furious about something","at peace, almost unnervingly so"],
  quirks:      ["taps a ring when nervous","won't make eye contact","laughs at the wrong moments","refers to themselves in third person","hums constantly","corrects everyone's grammar","smells strongly of a specific thing","carries a trinket they touch obsessively","speaks very quietly","overexplains everything","is brutally blunt","finishes others' sentences"],
  appearances: ["weathered hands, kind eyes","scar across the jaw","ink-stained fingers","missing an ear","one milky eye","fine clothes that have seen better days","several rings, none matching","braid laced with small bones","immaculately clean despite everything","moves with old military posture","perpetually damp","too much perfume hiding something"],
};

// ── Location tables ───────────────────────────────────────────────────────────
export const LOC = {
  tavern:     { names:["The Guttered Candle","The Lame Ox","The Drowned Crow","The Copper Flagon","The Salted Heel","The Wanderer's Rest","The Split Log","Two Wolves Inn","The Sunken Barrel","The Empty Net"], details:["sawdust floor, low beams","rushes on the floor, reeks of ale","tapestries of old hunts","mounted beast heads","roaring fire, too hot","dark corners, private booths","card game in the back","bard tuning up, badly","a dog sleeping under every table","cellar door padlocked shut"], atmospheres:["tense — a recent argument","lively but watchful","nearly empty, oddly so","rowdy, a celebration","somber, recent bad news","busy, no one talking to strangers","festive but there's an undercurrent","calm, regulars only","someone is crying quietly","everyone seems to know everyone"] },
  wilderness: { names:["the Ashwood","the Stillmoor","the Broken Fens","Greywolf Pass","the Pale Hills","the Drowned Valley","the Thornback Ridge","the Oldwood","Saltmarsh Flats","the Sunken Road"], details:["ancient stone marker","smell of rain and rot","a stream crossing, rickety bridge","wagon tracks that end abruptly","bones picked clean nearby","fungal bloom over a dead tree","stone ruins barely visible","campfire ashes, recent","a hanging effigy from a branch","shrine to an unnamed god, fresh offerings"], atmospheres:["unnaturally quiet","birdsong stops when you approach","distant smoke on the horizon","fog rolling in from nowhere","something is watching","tracks — something large","a distant horn call","feeling of being followed","a path that wasn't there before","the light feels off"] },
  dungeon:    { names:["the Howling Vault","Thornhold Keep","the Forgotten Warren","the Salt Crypts","the Ember Cells","the Pale Sanctum","the Drowning Halls","the Hollow Spire","the Mourning Gallery","the Cracked Seal"], details:["torches still burning","claw marks on the walls","altar with dried offerings","collapsed section","flood damage, water stains high up","graffiti in multiple languages","chains hanging from the ceiling","a door sealed from the inside","scattered bones, no full skeletons","evidence of a camp, abandoned in haste"], atmospheres:["eerie silence","distant dripping, steady","something was here recently","air is wrong — too warm","faint sound of chanting from below","mold and rot everywhere","the dead here are restless","traps, old but some still live","someone has been mapping this place","you feel watched from the dark"] },
  town:       { names:["Ashford","Millhaven","Greybeck","Coldwater","Irongate","Saltern","the Crossing","Dusthallow","Weybridge","Fenwick"], details:["market day, crowded","gates closed, guards doubled","notice board covered in fresh postings","public stocks, occupied","shrine being rebuilt after fire","a new building going up fast","foreign faces, a caravan in town","a funeral procession blocking the road","children's game that seems too adult","empty shop fronts on one street"], atmospheres:["nervous, something happened recently","welcoming but wary","divided — two factions, obvious tension","busy, everyone has somewhere to be","under a quiet kind of pressure","celebratory — a local holiday","recovering from something bad","prosperous and showing it","looks fine from the outside","something is being kept from outsiders"] },
};

// ── Loot tables ───────────────────────────────────────────────────────────────
export const LOOT = {
  poor:   { coin:()=>`${d(6)} cp, ${d(4)} sp`,      items:["worn leather belt pouch","half a loaf of bread and some hard cheese","a clay pipe, cracked","cheap iron ring with no gem","a wanted poster, folded many times","a single boot, still good","fishing line and three hooks","a well-worn lucky stone","a tin whistle, slightly bent","tallow candle, short"], oddities:["a tooth with a note tied to it","a doll with no face","a pebble wrapped in string","a page torn from a book, partially burned","a button that doesn't match anything"] },
  modest: { coin:()=>`${d(6)} sp, ${d(4)} gp`,      items:["silver ring, minor engraving","a good quality belt knife","sealed letter, unaddressed","a flask of decent whiskey","two vials of common healing salve","a small leather journal, half filled","a fine wool cloak, bloodstained","a brass compass that points slightly wrong","a set of loaded dice","a folded map of a local region"], oddities:["a key with no label","a merchant's ledger with coded margins","a folded cloth with a crude drawing","a locket with a lock of hair, no portrait","a carved wooden token, faction unknown"] },
  rich:   { coin:()=>`${d(10)} gp, ${d(4)} pp`,     items:["a jeweled brooch worth 50 gp","a fine shortsword with an unusual maker's mark","silk clothing tailored for someone specific","a sealed iron chest","a ring with a minor enchantment","a complete set of fine thieves' tools","a deed to a small piece of property","a spyglass with fine lenses","a small painting, valuable and recognizable","a pouch of spell components"], oddities:["a book written in a cipher","a severed finger in a ring box","a contract with terms no sane person would sign","a small idol that radiates faint warmth","a bottle of wine sealed with a noble's sigil"] },
  hoard:  { coin:()=>`${d(6)*10} gp, ${d(6)} pp, gems worth ${d(4)*25} gp`, items:["a +1 weapon suited to the party","a set of armor with an unusual crest","a spellbook with 2d4 spells","a bag of holding, old and patched","an artifact of minor but obvious power","a map to somewhere significant","rare alchemical ingredients","a chest of art objects worth 500 gp","a legendary creature's trophy","a soul coin or other dark currency"], oddities:["a mirror that shows a slightly different reflection","a sealed urn containing ashes and a letter","a weapon that whispers the name of its last owner","a map where one location is marked in blood","something that absolutely should not be here"] },
};

// ── Monster tables ────────────────────────────────────────────────────────────
export const MONSTER = {
  forest:  { creatures:["a pack of wolves (3d4)","a lone dire wolf","a giant spider and her brood","a troll, territorial","a green hag, curious","a pair of displacer beasts","a treant, old and angry","a will-o-wisp leading something worse","a sleeping owlbear","a dryad protecting a dying tree"], behaviors:["feeding on something already dead","following the party from a distance","fighting each other","guarding a den or nest","wounded and desperate","curious, not yet hostile","cornered and panicking","answering a call from deeper in","emerging slowly from the dark","circling, assessing"] },
  road:    { creatures:["a bandit ambush (2d6)","a lone highwayman","a desperate refugee family","a broken-down merchant wagon","a messenger with a sealed letter and a crossbow","a patrol of soldiers, not the friendly kind","a traveling carnival in the wrong place","a monk walking barefoot, going the wrong way","a pair of bounty hunters","a cart of prisoners being transferred"], behaviors:["blocking the road entirely","watching from cover","flagging the party down frantically","pretending to need help","demanding toll","moving suspiciously fast","circling back for a second look","clearly lying about who they are","in worse shape than they're letting on","offering something too good"] },
  dungeon: { creatures:["a gelatinous cube, slow and silent","a swarm of rats, agitated","three skeletons, still armed","a lone ghoul, starving","a gibbering mouther in a collapsed chamber","a mimic on a door","a shadow following the party's light","a cultist survivor, hiding","an animated armor suit, still at post","a carrion crawler in the ceiling"], behaviors:["already alerted to the party's presence","sleeping / dormant","acting strangely, afraid of something deeper in","standing perfectly still","guarding something specific","wounded from a recent fight","not interested in the party","patrolling a very specific route","reacting to light or sound abnormally","already been bound or trapped by something smarter"] },
  urban:   { creatures:["a city watch patrol (1d4+2)","a cutpurse, mid-attempt","a rival adventuring party","a city official with a grudge","a street gang shaking down a merchant","a disguised doppelganger","a spy following someone nearby","a debtor trying to skip town","a fire cult member distributing pamphlets","a shapeshifter caught mid-change"], behaviors:["pretending everything is normal","fleeing from something","looking for a specific person","trying to start something","about to be arrested","watching the party with too much interest","conducting a deal that's going wrong","asking questions the party was just asking","has overheard something they shouldn't","claiming to be someone they're not"] },
};

// ── Oracle tables ─────────────────────────────────────────────────────────────
export const HOOKS  = ["A stranger is asking questions about the party","Something valuable was recently stolen here","An old conflict is about to boil over","There's a job, if you ask the right person","Someone is lying to everyone and doing it well","A rumor is spreading that may or may not be true","Something arrived here that shouldn't have","Someone is about to leave who knows something important","A strange event happened last night","There's a door no one will explain"];
export const TWISTS = ["They aren't here by accident","One of them recognizes the party","Something is driving them from behind","They have something the party needs","They're more intelligent than they appear","They're actually fleeing something worse","This isn't their territory — someone sent them","They're protecting something nearby","They're not the apex predator here","They can be reasoned with, if approached right","They've already sprung a trap","Killing them causes a different problem"];

export const POI_TABLE = [
  {what:"A shrine",        detail:"to a forgotten god, still receiving offerings",  hook:"The offerings are fresh"},
  {what:"A message",       detail:"scratched into the wall in three different hands",hook:"The last line was never finished"},
  {what:"A body",          detail:"that shows no cause of death",                   hook:"Its expression is peaceful"},
  {what:"A locked door",   detail:"with no keyhole — sealed from the inside",       hook:"Something scrapes against it"},
  {what:"A pool",          detail:"that perfectly reflects the wrong sky",           hook:"Something moves in it that isn't here"},
  {what:"A camp",          detail:"recently abandoned in haste",                    hook:"Food still warm. Boot prints in three sizes."},
  {what:"Strange markings",detail:"regular, deliberate, covering one wall entirely", hook:"Part of it is a map. Part of it is a warning."},
  {what:"A child's toy",   detail:"in a place children should never have been",     hook:"It's been here a very long time"},
  {what:"A trail",         detail:"dark and deliberate, leading deeper in",         hook:"It stops at a wall with nothing behind it"},
  {what:"A light source",  detail:"that shouldn't still be burning",                hook:"No fuel source. No explanation."},
];

export const HAZARD = {
  trap: [
    {name:"Pressure Plate",   effect:"Spike trap. DC 14 Dex or 2d10 piercing.",      trigger:"Weight on floor tile",           reset:"Manual"},
    {name:"Arrow Slit",       effect:"Darts from walls. DC 13 Dex or 1d6×3.",        trigger:"Tripwire at shin height",         reset:"Auto in 1 hour"},
    {name:"Pit Trap",         effect:"10ft drop. DC 14 Dex or 1d6 + restrained.",    trigger:"False floor, DC 15 Perception",   reset:"Cover resets in 1 min"},
    {name:"Gas Vent",         effect:"Poison gas. DC 14 Con or poisoned 1 hour.",     trigger:"Disturbing the alcove",           reset:"Exhausts in 3 rounds"},
    {name:"Rolling Boulder",  effect:"DC 15 Dex or 4d10 bludgeoning.",              trigger:"Pressure plate at corridor entry",reset:"Once only"},
    {name:"Alarm Glyph",      effect:"Loud chime — alerts all enemies.",             trigger:"Any creature crosses threshold",   reset:"Resets at dawn"},
  ],
  environmental: [
    {name:"Unstable Ceiling", effect:"1d6 bludgeon each round. DC 12 Dex.",          trigger:"Loud noise or heavy impact",      reset:"Collapses after 3 triggers"},
    {name:"Rising Water",     effect:"1 foot per round. DC 12 Athletics when full.", trigger:"Entering the room",               reset:"Drains if valve reset"},
    {name:"Slick Floor",      effect:"Difficult terrain. DC 12 Acrobatics.",         trigger:"Perpetual — oil seeps from walls", reset:"None"},
    {name:"Darkness Pulse",   effect:"All light out every 1d4 rounds.",              trigger:"Perpetual — magic in the walls",  reset:"Dispel Magic DC 14"},
    {name:"Thin Floor",       effect:"Collapses under 200+ lbs.",                    trigger:"Weight",                          reset:"Once only"},
    {name:"Extreme Cold",     effect:"DC 10 Con each hour or +1 exhaustion.",        trigger:"Perpetual — magical cold",        reset:"None"},
  ],
  magical: [
    {name:"Confusion Rune",   effect:"DC 14 Wis or Confused 1 minute.",              trigger:"Reading the inscription",         reset:"Recharges at dawn"},
    {name:"Fear Ward",        effect:"DC 13 Wis or Frightened, must flee 1 round.",  trigger:"Crossing threshold",              reset:"Always active"},
    {name:"Teleport Trap",    effect:"Teleported to random room. No save.",           trigger:"Stepping on the marked tile",     reset:"Always active"},
    {name:"Polymorph Glyph",  effect:"DC 14 Wis or polymorphed into frog 1 min.",   trigger:"Touching the glyph",              reset:"Recharges at dawn"},
    {name:"Curse Circle",     effect:"Cursed (Bane) for 24 hours.",                  trigger:"Resting inside the circle",       reset:"Always active"},
    {name:"Silence Field",    effect:"No sound in 20ft. Verbal spells fail.",        trigger:"Perpetual zone",                  reset:"Dispel Magic DC 15"},
  ],
};

export const DANGER_TABLE = [
  {threat:"A countdown",          detail:"Something is already in motion. 3 encounters before it completes.", sign:"A ticking sound with no source"},
  {threat:"Reinforcements",       detail:"More enemies are on the way — this group already sent a runner.",   sign:"A horn call, distant but clear"},
  {threat:"A trap already sprung",detail:"Someone came through here before and left it worse.",               sign:"A fresh body near the entrance"},
  {threat:"A hostage",            detail:"Someone is being held deeper in. Killing enemies may doom them.",   sign:"A muffled voice from below"},
  {threat:"Corrupted ground",     detail:"The dungeon itself is wrong. Magic behaves strangely here.",        sign:"Spells that fire the wrong colour"},
  {threat:"A rival party",        detail:"Another group is in here with different goals. They're ahead.",     sign:"Boot prints that aren't yours"},
  {threat:"The door behind you",  detail:"Something sealed the entrance. You're not leaving the same way.",   sign:"A grinding sound as you descended"},
  {threat:"Spreading darkness",   detail:"Each hour, fog of war expands. The dungeon is waking up.",          sign:"Torches dimming without reason"},
];

export const CONTAINER_TABLE = {
  barrel: { poor:["salted pork, rancid","river water, murky","old nails","sawdust and rags","rotgut spirits — barely drinkable"],         rich:["fine ale, still sealed","lamp oil, full","trade spice, wrapped in oilcloth","alchemist's alcohol","a body, preserved in brine"] },
  chest:  { poor:["copper coins (2d6)","old letters, unreadable","a broken lock","moth-eaten clothes","a single candle, burned low"],     rich:["silver coins (3d6)","a sealed envelope addressed to someone important","a set of thieves' tools","a small idol wrapped in cloth","a journal with the last entry torn out"] },
  sack:   { poor:["turnips","dirty laundry","a dead rat","gravel","trail rations, stale"],                                               rich:["grain — more than one person could carry","a hood and some rope","spell components, scattered","stolen silverware","a sleeping animal inside"] },
  crate:  { poor:["straw packing, nothing inside","broken pottery","cheap candles","empty bottles","iron nails"],                         rich:["trade goods (silk, spice)","a disassembled weapon","stolen artwork, wrapped carefully","a locked metal box inside","medical supplies, still sealed"] },
};

export const ENEMY_TABLE = {
  minion:  { behaviors:["guarding the door without thinking","eating something they shouldn't","arguing with another minion","asleep on the job","terrified of whoever is in charge"],          secrets:["doesn't actually want to be here","is being coerced","has information the party needs","has a family somewhere","is the only one who knows the way out"],        tactics:["rush the nearest target","hang back and throw things","scatter when bloodied","call for help immediately","fight defensively around a fixed point"] },
  soldier: { behaviors:["running a patrol route","sharpening weapons, alert","coordinating with others by signal","guarding something specific","waiting in ambush"],                           secrets:["answers to someone the party hasn't met yet","was hired very recently","has orders that conflict with what they're doing","knows there's a traitor in their group","is the traitor"], tactics:["focus fire on the biggest threat","flank while allies distract","use terrain","protect the one who can call reinforcements","fight to disable, not kill"] },
  elite:   { behaviors:["overseeing others from a distance","interrogating someone","inspecting the dungeon like they own it","performing a ritual","waiting — patiently, deliberately"],     secrets:["has a personal grievance with someone in the party","is under orders they privately disagree with","holds a trump card they haven't played","is more powerful than they appear","is protecting someone"], tactics:["let minions absorb the first round","target spellcasters first","use the environment as a weapon","has an escape route already planned","negotiate only to buy time"] },
  boss:    { behaviors:["aware the party is coming — has been for a while","conducting business as if nothing is wrong","at the height of completing their plan","in a moment of rare vulnerability","testing the party before showing full strength"], secrets:["their true goal isn't what it appears","they were once something else entirely","they could be reasoned with","something here is more important to them than victory","they're afraid of something the party hasn't encountered"], tactics:["has already studied the party's weaknesses","opens with overwhelming force","has a contingency for being reduced to half HP","will sacrifice everything else to complete the objective","the real threat is something they trigger"] },
};

export const YES_POOL = ["Yes","Yes","Yes — and","Yes — and","Yes — but","Yes — but"];
export const NO_POOL  = ["No","No","No — and","No — and","No — but","No — but"];
export const TWIST_MAP = {
  "Yes — and": ["...and it's worse than expected","...and someone else sees it happen","...and it creates a new problem","...and it costs something","...and it draws attention"],
  "Yes — but": ["...but only briefly","...but with strings attached","...but someone is watching","...but at a cost","...but it's not what it seems"],
  "No — and":  ["...and now they're suspicious","...and things just got harder","...and something else happens too","...and the party is noticed","...and a door closes permanently"],
  "No — but":  ["...but there's another way","...but they don't act on it yet","...but the party can change that","...but something interesting happens instead","...but information surfaces"],
};

export const TREASURE_SPECIALS = [
  "A gemstone worth 2d10×10 gp, colour of old blood",
  "A minor magic item — roll on DMG table A",
  "A promissory note signed by a noble",
  "A puzzle box that clicks ominously when shaken",
  "A bottle of wine worth more than most weapons",
  "A map with one location circled in charcoal",
  "A deed to something the previous owner shouldn't have owned",
  "A ring with an inscription in a dead language",
];

// ── Roll functions ─────────────────────────────────────────────────────────────

export function rollNPC(type) {
  const t = type || pick(Object.keys(NPC.occupations));
  return {
    name:       pick(NPC.names),
    occupation: pick(NPC.occupations[t] || NPC.occupations.commoner),
    looks:      pick(NPC.appearances),
    mood:       pick(NPC.moods),
    quirk:      pick(NPC.quirks),
    wants:      pick(NPC.wants),
    secret:     pick(NPC.secrets),
    type:       t,
  };
}

export function rollLocation(type) {
  const t    = type || pick(Object.keys(LOC));
  const data = LOC[t] || LOC.town;
  return {
    type, name: pick(data.names),
    detail:     pick(data.details),
    atmosphere: pick(data.atmospheres),
    hook:       pick(HOOKS),
  };
}

export async function rollLoot(tier) {
  const t    = tier || pick(Object.keys(LOOT));
  const data = LOOT[t];
  let item = pick(data.items), itemDesc = "", itemCategory = "gear";

  if ((t === "rich" || t === "hoard")) {
    try {
      const rarity = t === "hoard" ? pick(["rare","very_rare","legendary"]) : "uncommon";
      const pool   = await getMagicItemsByRarity(rarity);
      if (pool.length) {
        const m = pick(pool);
        item = m.name;
        itemDesc = (m.desc || [])[0] || "";
        itemCategory = "magic item";
      }
    } catch {}
  } else if (t === "modest") {
    try {
      const pool = await getEquipmentByCategory("Adventuring Gear");
      if (pool.length && Math.random() > 0.5) {
        const e = pick(pool);
        item = e.name;
        itemCategory = "gear";
      }
    } catch {}
  }

  return {
    tier: t, coin: data.coin(), item, itemDesc, itemCategory,
    oddity: d(6) >= 4 ? pick(data.oddities) : null,
  };
}

export async function rollTreasure(tier) {
  const t    = tier || pick(Object.keys(LOOT));
  const data = LOOT[t];
  let item = pick(data.items), itemDesc = "", itemCategory = "gear";

  try {
    const rarity = t === "hoard" ? pick(["rare","very_rare"]) : t === "rich" ? "uncommon" : "common";
    const pool   = await getMagicItemsByRarity(rarity);
    if (pool.length) { const m = pick(pool); item = m.name; itemDesc = (m.desc||[])[0]||""; itemCategory = "magic item"; }
  } catch {}

  return {
    tier: t, coin: data.coin(), item, itemDesc, itemCategory,
    special: d(6) >= 3 ? pick(TREASURE_SPECIALS) : null,
  };
}

export function rollMonster(env) {
  const e    = env || pick(Object.keys(MONSTER));
  const data = MONSTER[e];
  return {
    environment: e,
    creature:    pick(data.creatures),
    behavior:    pick(data.behaviors),
    twist:       d(6) >= 3 ? pick(TWISTS) : null,
  };
}

export function rollPOI() {
  return pick(POI_TABLE);
}

export function rollHazard(type) {
  const t    = type || pick(Object.keys(HAZARD));
  const data = HAZARD[t];
  return { type: t, ...pick(data) };
}

export function rollDanger() {
  return pick(DANGER_TABLE);
}

export function rollContainer(type) {
  const t    = type || pick(Object.keys(CONTAINER_TABLE));
  const data = CONTAINER_TABLE[t];
  const tier = d(6) >= 4 ? "rich" : "poor";
  return { container: t, tier, contents: pick(data[tier]) };
}

export function rollEnemy(tier) {
  const t    = tier || pick(Object.keys(ENEMY_TABLE));
  const data = ENEMY_TABLE[t];
  return {
    rank:     t,
    behavior: pick(data.behaviors),
    secret:   pick(data.secrets),
    tactics:  pick(data.tactics),
  };
}

export function askOracle(question = "") {
  const r       = d(6);
  const isYes   = r >= 4;
  const answer  = pick(isYes ? YES_POOL : NO_POOL);
  const twist   = TWIST_MAP[answer] ? pick(TWIST_MAP[answer]) : null;
  return { question, roll: r, answer, twist };
}

// ── RAG roll functions ─────────────────────────────────────────────────────────
export function rollRAGPart(mode, key) {
  const opts = RAG_DATA[mode]?.[key]?.options;
  if (!opts) return null;
  return pick(opts);
}

export function rollRAGAll(mode) {
  const result = {};
  for (const key of Object.keys(RAG_DATA[mode] || {})) {
    result[key] = rollRAGPart(mode, key);
  }
  return result;
}

export function buildRAGSummary(mode, state) {
  const s = state;
  if (!Object.keys(s).length) return "";
  if (mode === "creature") {
    const size = s["Size"]?.replace(/\(.*\)/,"").trim().toLowerCase() || "";
    const body = s["Body Shape"]?.toLowerCase() || "";
    let desc   = size && body ? `A ${size}, ${body} creature` : body ? `A ${body} creature` : "A creature";
    if (s["Skin / Hide"])   desc += ` covered in ${s["Skin / Hide"].toLowerCase()}`;
    if (s["Head"])          desc += `, bearing ${s["Head"].toLowerCase()}`;
    if (s["Limbs"])         desc += `. It moves on ${s["Limbs"].toLowerCase()}`;
    if (s["Tail"])          desc += ` and sports ${s["Tail"].toLowerCase()}`;
    if (s["Special Trait"]) desc += `. Notably: ${s["Special Trait"].toLowerCase()}`;
    if (s["CR Hint"])       desc += `. ${s["CR Hint"]}.`;
    return desc;
  }
  if (mode === "character") {
    const race = s["Race"]||"", cls = s["Class"]||"", al = s["Alignment"]||"";
    let desc   = race && cls ? `A ${al?al.toLowerCase()+" ":""}${race} ${cls}` : race ? `A ${race}` : "An adventurer";
    if (s["Background"])         desc += ` with the background of a ${s["Background"].toLowerCase()}`;
    desc += ".";
    if (s["Personality Trait"])  desc += ` ${s["Personality Trait"]}.`;
    if (s["Flaw"])               desc += ` Their flaw: ${s["Flaw"].toLowerCase()}.`;
    if (s["Motivation"])         desc += ` Driven to: ${s["Motivation"].toLowerCase()}.`;
    if (s["Distinctive Feature"])desc += ` ${s["Distinctive Feature"]}.`;
    if (s["Secret"])             desc += ` Secret: ${s["Secret"].toLowerCase()}.`;
    return desc;
  }
  return "";
}
