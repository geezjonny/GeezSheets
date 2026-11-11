// Campaign tone for fresh procedural rolls. Existing saved cards remain authoritative.
// A seeded 45% theme preference retains everyday people and mundane explanations.
export const THEME_CHANCE = .45;
export const CAMPAIGN_POOLS = {
  "BACKSTORY": [
    "Worked the night shift at a hospice whose patients never aged.",
    "Survived a zombie outbreak by hiding in a sealed bread oven.",
    "Escaped an illithid prison but still dreams in someone else's language.",
    "Once prepared burial shrouds for a noble family that never buried anyone.",
    "Left a blood cult after recognising a neighbour among its recruits.",
    "Was hired to restore an occult text and quietly burned the final page."
  ],
  "SECRETS": [
    "delivers sealed blood flasks to a vampire's steward",
    "has an illithid command phrase missing from their memory",
    "keeps a dead relative restrained beneath the house",
    "belongs to an occult society investigating the local nobility",
    "feeds information to a cult to keep a sibling alive",
    "carries a bite scar that reopens at the new moon",
    "has been substituting animal blood for a vampire's tribute",
    "knows the burial prayer that stops the town's dead rising"
  ],
  "INSIDE": [
    "a pantry stocked with blood flasks labelled by household",
    "a cellar door reinforced to contain the restless dead",
    "an occult circle hidden beneath a rug of prayer knots",
    "a ledger recording missing hours instead of money",
    "a silver-backed mirror turned firmly toward the wall",
    "a shrine to an illithid patron disguised as a healing altar",
    "a coffin delivered as household furniture",
    "a cabinet of funerary masks, one still warm"
  ],
  "HAGGLE": [
    "accepts grave salt as part payment",
    "closes before sunset without exception",
    "offers a discount for verified news of a missing person",
    "refuses coin taken from the dead",
    "asks customers to speak before entering, checking for a borrowed voice",
    "trades quietly in silver wire and coffin nails"
  ],
  "TRINKETS": [
    "a silver coffin nail wrapped in linen",
    "a cult token showing an eye inside a tooth",
    "a blood-stained invitation to a midnight supper",
    "a broken illithid restraint etched with pulsing lines",
    "a bone rosary missing its final bead",
    "a vial of salt from a vampire's threshold",
    "a death certificate bearing tomorrow's date",
    "a wax earplug marked with an anti-psionic prayer"
  ],
  "ATMOS": [
    "Funeral bells sound while the graveyard gates remain chained.",
    "Garlic and rue hang above doors rubbed with old blood.",
    "Neighbours exchange careful questions to test one another's memories.",
    "Pale servants hurry home before the first light.",
    "The smell of grave salt lingers beneath the incense.",
    "Black curtains conceal windows facing the noble quarter.",
    "People pause when a distant voice speaks inside their heads.",
    "Burial carts pass under the escort of exhausted guards."
  ],
  "ODD": [
    "Every family keeps an empty chair for someone nobody can remember.",
    "The local lord appears in portraits but never in mirrors.",
    "The dead are buried face-down beneath iron grates.",
    "A public notice asks citizens to report dreams of tentacles.",
    "The town's beggars all repeat the same phrase while asleep.",
    "Every chapel mirror has been silvered twice."
  ],
  "DANGER": [
    "Zombies rise from graves whose burial fees were never paid.",
    "A vampire's agents are selecting households for a blood tithe.",
    "An illithid cell replaces troublesome citizens with obedient thralls.",
    "An occult burial society supplies bodies to a necromancer.",
    "A blood cult controls the night watch.",
    "A wight is gathering the unburied soldiers outside town.",
    "Cult recruiters offer miraculous relief from shared nightmares.",
    "Ghouls use the plague tunnels beneath the poor quarter."
  ],
  "HOOKS": [
    "A vampire's steward offers protection in exchange for a stolen genealogy.",
    "Someone must seal a plague crypt before its zombies reach the wells.",
    "An escaped illithid thrall needs help recovering a missing week.",
    "An occult lodge has purchased every copy of one burial register.",
    "A priest needs witnesses to expose a blood cult inside the hospice.",
    "A coffin arrives bearing a living neighbour's name.",
    "A vampire hunter has disappeared while investigating the local ruler.",
    "A funeral bell is the last ward keeping the dead beneath the town."
  ],
  "RUMOURS": [
    "The lord's guests leave at dawn without remembering dinner.",
    "The gravedigger has started chaining coffins from the outside.",
    "Three councillors speak in the same voice when startled.",
    "The hospice cures every fever, but patients develop a thirst for blood.",
    "An illithid relic was sold as a saint's preserved heart.",
    "The burial guild keeps a second ledger for those who return.",
    "The new chapel hymn is an occult command spoken backwards.",
    "Someone pays silver for dreams of a city beneath a black lake."
  ],
  "WHERES": [
    "the vampire's winter crypt beneath the old manor",
    "the hospice cellar sealed after the zombie outbreak",
    "the illithid listening chamber below the cistern",
    "the occult lodge behind the municipal archive",
    "the blood cult's abandoned counting house",
    "the chapel where the dead answer the evening prayer"
  ],
  "THINGS": [
    "a vampire's original burial shroud",
    "a ledger naming the blood cult's donors",
    "an illithid memory crystal wrapped in lead",
    "the bell clapper that keeps the plague dead asleep",
    "a stolen reliquary full of grave salt",
    "an occult key cut from a human finger bone"
  ],
  "FOES": [
    "a vampire's mortal retainers",
    "a burial cult and its zombies",
    "an illithid's conditioned servants",
    "ghouls wearing stolen funeral masks",
    "a necromancer posing as a plague doctor",
    "an occult lodge protecting its patron"
  ],
  "TWISTS": [
    "The vampire is protecting the town from an illithid beneath it.",
    "The cult's leader is dead; a recorded command keeps the rites going.",
    "The rescued captive has lost every memory of who controlled them.",
    "The zombies retain fragments of their former loyalties.",
    "The occult ward is genuine, but maintaining it conceals a crime.",
    "The patron's missing relative willingly joined the blood cult.",
    "Destroying the relic releases memories stolen from an entire district.",
    "The supposed vampire hunter sells survivors to a rival undead lord."
  ],
  "WAS": [
    "a vampire court's discreet feeding house",
    "an illithid laboratory for stolen memories",
    "an occult hospital that promised to reverse death",
    "a blood cult's sanctuary beneath a respectable shrine",
    "a quarantine vault for the walking dead",
    "a monastery that guarded a necromantic bell"
  ],
  "LANDMARKS": [
    "a noble mausoleum patrolled by servants at noon",
    "a public ossuary bound with silver chains",
    "an occult observatory with every lens aimed underground",
    "a memorial listing citizens whose names nobody recognises",
    "a blood donation hospice funded by the ruler",
    "a chapel bell tower ringed with anti-undead wards"
  ],
  "TROUBLE": [
    "A vampire court is quietly buying the town's burial rights.",
    "Zombies emerge from the sewers wearing hospital shrouds.",
    "The councillors share a dream of an illithid beneath the reservoir.",
    "An occult lodge has infiltrated the city watch.",
    "A blood cult offers food to households in exchange for a monthly donor.",
    "The city's oldest dead demand the return of their stolen names."
  ],
  "TOWN_EVENTS": [
    "A vampire's carriage arrives at the hospice with empty blood flasks.",
    "The watch asks for help restraining a corpse that still recognises its family.",
    "Everyone in the market loses the same ten minutes.",
    "An occult procession carries a coffin that knocks from within.",
    "A cult offers a miraculous cure with a private midnight initiation.",
    "A missing citizen returns unable to remember the word for sunlight."
  ],
  "ROAD_EVENTS": [
    "A chained coffin on a broken cart whispers requests for fresh blood.",
    "Refugees carry bells to warn one another when their dead begin moving.",
    "A traveller describes an illithid prison nobody else remembers escaping.",
    "An occult surveyor marks the road with symbols that repel the undead.",
    "Cult couriers escort a sleeping passenger whose thoughts can be heard aloud.",
    "A vampire's servant offers coin for an escort that must end before sunrise."
  ],
  "INTERESTING": [
    "vampire's former steward seeking sanctuary",
    "survivor of an illithid colony with stolen memories",
    "grave keeper who recognises every zombie by name",
    "occult investigator hiding a cult brand",
    "blood cult defector protecting another recruit",
    "undead noble's estranged mortal heir"
  ],
  "WEATHER": [
    "Cold fog gathers around the graveyard while the streets remain clear.",
    "Red dust stains rainwater collected beside the old crypt.",
    "A pressure behind the eyes precedes a soundless storm.",
    "Frost forms occult spirals on windows facing the hill.",
    "An unnatural dusk falls while the cult's bells ring.",
    "Rain beats steadily against the shutters, masking footsteps in the street."
  ],
  "FUN": [
    "A nervous coffin maker asks the party to judge a contest of protective carvings.",
    "An elderly vampire hunter hosts a surprisingly excellent garlic supper.",
    "A tame crow steals only counterfeit occult charms.",
    "Gravediggers run a quiet sweepstake on which ancient epitaph is a lie.",
    "A puppet show ridicules a local cult; its author requests an escort home.",
    "A retired exorcist teaches children how to tell a haunting from bad plumbing."
  ],
  "HIST": [
    "Confiscated from a vampire's private chapel.",
    "Recovered from an illithid vessel buried beneath the salt marsh.",
    "Used to seal the first crypt during the walking plague.",
    "Carried by an occult inquisitor whose name was erased.",
    "Smuggled from a blood cult's treasury inside a funeral urn.",
    "Left behind by a thrall who bought back a single memory."
  ],
  "OF": [
    "the Blood Tithe",
    "the Silent Colony",
    "the Last Burial",
    "the Veiled Congregation",
    "the Empty Coffin",
    "the Stolen Mind",
    "the Crimson Vigil",
    "the Grave Choir"
  ]
};
CAMPAIGN_POOLS.MAJOR = [
  {
    "hook": "The blood tithe in {town} has doubled, and households are vanishing.",
    "stages": [
      "A hospice falsifies death records to conceal the missing.",
      "A vampire court uses the tithe to feed an imprisoned rival.",
      "Free the prisoners or break the pact protecting the town."
    ],
    "foe": "a vampire court and its mortal retainers"
  },
  {
    "hook": "Citizens of {town} share dreams of a city beneath black water.",
    "stages": [
      "People lose hours and wake holding drawings of the same gate.",
      "An illithid cell uses a charitable lodge to identify useful minds.",
      "Sever the listening chamber's connection before the colony receives the town."
    ],
    "foe": "an illithid handler and its conditioned agents"
  },
  {
    "hook": "An occult congregation in {town} can apparently restore the dead.",
    "stages": [
      "The returned cannot recall their final days.",
      "The miracles bind the revived to a blood rite.",
      "Expose the rite while protecting the families from the cult."
    ],
    "foe": "a blood cult serving an undead saint"
  },
  {
    "hook": "The oldest noble family in {town} announces a wedding after a century of seclusion.",
    "stages": [
      "Guests report missing reflections and gaps in their memories.",
      "The marriage transfers an ancient ward to a vampire heir.",
      "Interrupt the blood contract without releasing the dead beneath the estate."
    ],
    "foe": "a vampire dynasty and its occult notary"
  },
  {
    "hook": "A relief caravan arrives at {town} carrying sealed coffins instead of grain.",
    "stages": [
      "The dead inside bear the names of living residents.",
      "Cult agents plan to replace the night watch with obedient corpses.",
      "Find the command reliquary before the gates open from within."
    ],
    "foe": "a cult fanatic directing a zombie host"
  },
  {
    "hook": "The dead of {town} return each night to perform their former trades.",
    "stages": [
      "The burial guild has replaced sacred salts with cheap chalk.",
      "An occult patron collects memories from the risen.",
      "Silence the necromantic bell while preserving evidence of its victims."
    ],
    "foe": "a necromancer protected by a burial cult"
  }
];

export function campaignPick(rng, key, fallback) {
  const themed = CAMPAIGN_POOLS[key];
  const pool = themed?.length && rng() < THEME_CHANCE ? themed : fallback;
  return pool[Math.floor(rng() * pool.length)];
}
export function campaignList(rng, key, fallback, count) {
  const out = [];
  for (let i=0; i<count; i++) {
    const remaining = fallback.filter(x=>!out.includes(x));
    const themed = (CAMPAIGN_POOLS[key] || []).filter(x=>!out.includes(x));
    const pool = themed.length && rng()<THEME_CHANCE ? themed : remaining.length ? remaining : themed;
    if (!pool.length) break;
    out.push(pool[Math.floor(rng()*pool.length)]);
  }
  return out;
}

// One involvement roll per person: mundane people cannot acquire occult details
// independently through their backstory, secret, or rare-find rolls.
export const ORDINARY_BACKSTORIES = [
 'Apprenticed in the family trade and stayed close to home.',
 'Moved here for steadier work and cheaper rent.',
 'Supports an elderly parent on modest wages.',
 'Spent years repairing carts along the trade road.',
 'Inherited a small debt and is slowly paying it off.',
 'Wants to save enough to open a workshop.',
 'Returned home after an unsuccessful season in the city.',
 'Raises a sibling and works whenever the market is busy.',
 'Learned to read from a patient neighbour.',
 'Lost a harvest to bad weather and is rebuilding.'
];
export const ORDINARY_SECRETS = [
 'has been watering down the wine to cover rising costs',
 'is quietly saving to leave an unhappy apprenticeship',
 'owes a neighbour money and is embarrassed to ask for time',
 'writes terrible love poems under a borrowed name',
 'is planning a surprise wedding for a sibling',
 'has hidden a broken tool rather than admit the mistake',
 'can barely read the accounts they are supposed to keep',
 'feeds stray dogs behind the shop despite the landlord forbidding it'
];
export function personalInvolvement(rng, conspiracy=null) {
 return conspiracy ? true : rng() < THEME_CHANCE;
}
export function townConspiracy(rng, name) {
 if(rng()>=.1)return null;
 const plots=[
  ['The Crimson Compact', 'The residents knowingly pay a blood tithe to a vampire who protects their homes.'],
  ['The Burial Covenant', 'The residents conceal their risen dead and cooperate to keep the graveyard wards intact.'],
  ['The Silent Congregation', 'The residents serve an illithid patron, passing instructions through a shared dream.'],
  ['The Ashen Fellowship', 'The residents participate in an occult rite beneath the meeting hall and protect one another from outsiders.'],
  ['The Last Vigil', 'The residents maintain a forbidden pact with an undead guardian and hide the cost from visitors.']
 ];
 const [title,secret]=plots[Math.floor(rng()*plots.length)];
 return {type:'cult',id:'conspiracy_'+name.toLowerCase().replace(/[^a-z0-9]+/g,'_'),name:title+' of '+name,secret};
}
export const conspiracySecret = c => 'belongs to '+c.name+'. '+c.secret;
