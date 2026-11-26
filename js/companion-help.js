// Plain-language answers behind the companion's "?" buttons, written for someone new to D&D.
// Where the 2014 and 2024 rules differ, both are mentioned; the GM decides which applies.
export const HELP = {
  ac: ['Armor Class (AC)', 'How hard you are to hit. An attack hits you if its total is your AC or higher. The GM compares the numbers, so just say your AC when asked.'],
  hp: ['Hit points', 'How much punishment you can take. Damage lowers it and healing raises it, up to your maximum. At 0 you fall unconscious and start death saves. Type an amount, then tap Damage or Heal. You can Undo straight afterwards.'],
  temp: ['Temporary hit points', 'A shield on top of your hit points. Damage removes it first. It does not stack: if you get more, keep whichever amount is higher. Healing does not restore it.'],
  status: ['Status', 'Everything affecting you right now: concentration, inspiration, exhaustion and conditions. Anything active also shows as a button under your hit points.'],
  initiative: ['Initiative', 'Rolled when a fight starts to decide the turn order. Higher goes first. Tap the number to roll it.'],
  speed: ['Speed', 'How many feet you can move on your turn. On a battle map one square is usually 5 feet. You can split your movement before and after your action.'],
  passive: ['Passive scores', 'What you notice without trying. The GM compares them in secret against hidden things, so you never roll them. Perception spots things, Insight reads people, Investigation catches clues.'],
  action: ['Action', 'The main thing you do on your turn: attack, cast most spells, or use a feature. You get one action each turn. You can also use it to Dash (move again), Dodge, Disengage, Help, Hide or Ready something.'],
  bonus: ['Bonus action', 'A quick extra thing, only if something gives you one. You get at most one per turn, and it is separate from your action.'],
  reaction: ['Reaction', 'Something you do in response to a trigger, often on another creature\'s turn, such as an opportunity attack. You get one, and it comes back at the start of your turn.'],
  uses: ['Limited uses', 'Abilities you can only use a few times. Each filled circle is a use you still have. Tap one to spend it, or tap an empty one to give it back. They refill when you rest.'],
  slots: ['Spell slots', 'The fuel for your levelled spells. Casting one spends a slot of that level or higher. Filled circles are slots you still have. Cantrips never use a slot. Slots come back on a long rest (some classes get them back sooner).'],
  cantrips: ['Cantrips', 'Small spells you know by heart. Cast them as often as you like: they never use a spell slot.'],
  leveled: ['Levelled spells', 'These use a spell slot. Casting with a higher slot often makes the spell stronger; choose the slot level in the casting panel.'],
  prepare: ['Preparing spells', 'Some casters choose which spells are ready each day, usually after a long rest. Only prepared spells appear here. Spells marked Always ready do not count against your limit.'],
  concentration: ['Concentration', 'Some spells last only while you keep your mind on them. You can hold one at a time: casting another ends the first. When you take damage, make a Constitution save (DC 10, or half the damage if that is higher) or the spell ends.'],
  inspiration: ['Inspiration', 'A reward from the GM for great play. 2024 rules: spend it to reroll any die you just rolled. 2014 rules: spend it before a roll to get advantage. You can only hold one.'],
  exhaustion: ['Exhaustion', 'Being worn out, in levels. 2024 rules: each level is −2 to your d20 rolls and −5 feet of speed. 2014 rules use a list of penalties that gets worse. Level 6 is death. A long rest removes one level.'],
  death: ['Death saves', 'At 0 hit points, roll a d20 at the start of your turn. 10 or higher is a success. Three successes: you are stable. Three failures: you die. A 1 counts as two failures. A 20 puts you back on 1 hit point. Taking damage while down adds a failure.'],
  skills: ['Skill checks', 'When the GM asks for a check, find the skill and tap it. Your bonus is already included. A filled circle means you are proficient (you add your proficiency bonus); a ringed circle means expertise (double).'],
  abilities: ['Abilities and saves', 'A Check is you trying something using raw ability. A Save is you resisting something done to you, like dodging a blast or shrugging off poison. The GM says which one to roll.'],
  rolling: ['Rolling', 'The app rolls the dice, adds your bonuses and shares the result with the table. For attacks, roll to hit first; if the GM says it hits, roll damage.'],
  advantage: ['Advantage and disadvantage', 'Advantage: roll two d20s and keep the higher. Disadvantage: keep the lower. If you have both, they cancel out. The GM or a feature tells you when.'],
  dc: ['Difficulty Class (DC)', 'The number to beat. For your spells, each target rolls a save and must reach this number to resist.'],
  critical: ['Critical hit', 'A natural 20 on an attack always hits, and you roll all the damage dice twice. The app offers the critical damage button for you.'],
  coins: ['Coins', '1 platinum = 10 gold. 1 gold = 2 electrum = 10 silver = 100 copper. Your GM changes your coins, so tell them when you spend or earn money.'],
  equipped: ['Equipped', 'What you are wearing or wielding. Bonuses from an item only count while it is equipped. Changing armor does not recalculate your base AC, so tell your GM if that number looks wrong.'],
  card: ['Card slot', 'A magic card you hold. Its powers work while it is in the slot. You can fill an empty slot, but only the GM can take a card out.'],
  consumables: ['Consumables', 'Things that get used up, like potions and ammunition. A healing potion asks who drinks it, rolls and heals them. Other items just remove one when you tap Use.'],
  pack: ['Equipment pack', 'A bundle of starting gear, listed one thing per line with what each is normally worth. Send and Remove move the whole pack.'],
  shortRest: ['Short rest', 'At least an hour of downtime. Brings back short-rest abilities. If you spend hit dice to recover, add those hit points with Heal.'],
  longRest: ['Long rest', 'A full night\'s sleep. Restores hit points, spell slots and most abilities, ends concentration and removes one level of exhaustion.'],
  features: ['Features', 'The special things your class, species and background let you do. Tap the ? on one to read it. Ones you can use on your turn also appear on the Play tab.'],
  effects: ['Effects', 'Temporary or ongoing changes to your numbers. While an effect is active the app includes it in your stats and rolls.'],
  call: ['Roll call', 'The GM is asking you to roll. Choose advantage or add a bonus die if you have one, then tap Roll. Your first answer is the one that counts.'],

  str: ['Strength', 'Muscle: lifting, shoving, climbing and most melee attacks.'],
  dex: ['Dexterity', 'Agility: dodging, sneaking, balance and ranged or finesse attacks.'],
  con: ['Constitution', 'Toughness: hit points, resisting poison and keeping concentration.'],
  int: ['Intelligence', 'Book smarts: memory, reasoning and knowledge.'],
  wis: ['Wisdom', 'Awareness: noticing things, reading people and willpower.'],
  cha: ['Charisma', 'Force of personality: persuading, deceiving and performing.'],

  acrobatics: ['Acrobatics', 'Keeping your balance, tumbling and slipping free.'],
  animal_handling: ['Animal Handling', 'Calming, guiding or understanding animals.'],
  arcana: ['Arcana', 'What you know about magic, spells and other planes.'],
  athletics: ['Athletics', 'Climbing, jumping, swimming and grappling.'],
  deception: ['Deception', 'Lying and misleading convincingly.'],
  history: ['History', 'What you know about past events, people and places.'],
  insight: ['Insight', 'Reading intentions: is this person lying or hiding something?'],
  intimidation: ['Intimidation', 'Getting your way with threats or menace.'],
  investigation: ['Investigation', 'Searching for clues and working out how something works.'],
  medicine: ['Medicine', 'Stabilising the dying and diagnosing illness or wounds.'],
  nature: ['Nature', 'What you know about plants, animals, weather and terrain.'],
  perception: ['Perception', 'Spotting, hearing or smelling what is around you.'],
  performance: ['Performance', 'Entertaining with music, dance, acting or stories.'],
  persuasion: ['Persuasion', 'Winning people over honestly, with tact and charm.'],
  religion: ['Religion', 'What you know about gods, rites and holy orders.'],
  sleight_of_hand: ['Sleight of Hand', 'Picking pockets, palming objects and other quick-finger tricks.'],
  stealth: ['Stealth', 'Moving without being seen or heard.'],
  survival: ['Survival', 'Tracking, foraging, navigating and staying alive outdoors.']
};

// Feats, in our own words. Where the editions differ, both are given; your GM says which applies.
export const FEATS = {
  alert: '2014: +5 to initiative, you cannot be surprised while conscious, and unseen attackers get no advantage against you. 2024: add your proficiency bonus to initiative, and you may swap your place in the order with a willing ally.',
  'dual wielder': '2014: +1 AC while holding a separate melee weapon in each hand, you can fight with two one-handed weapons that are not light, and you can draw or stow both at once. 2024: +1 Strength or Dexterity; after attacking with a Light weapon you can use a bonus action to attack with another one-handed melee weapon; drawing and stowing is faster.',
  'fey touched': '+1 Intelligence, Wisdom or Charisma. You learn Misty Step and one 1st-level divination or enchantment spell. Each can be cast once per long rest without a spell slot, and again using your slots.',
  mobile: 'Your speed goes up by 10 feet. When you Dash, difficult ground does not slow you that turn. After you make a melee attack against a creature, hit or miss, it cannot make opportunity attacks against you for the rest of that turn.',
  resilient: '+1 to one ability of your choice, and you become proficient in saving throws with that ability.',
  sentinel: '2014: a creature you hit with an opportunity attack stops moving for that turn; creatures provoke your opportunity attacks even if they Disengage; and when a creature within 5 feet attacks someone else, you can use your reaction to attack it. 2024: +1 Strength or Dexterity; you can make an opportunity attack when a creature within 5 feet Disengages or hits someone else, and a creature hit by your opportunity attack has speed 0 for the turn.',
  sharpshooter: '2014: long range gives no disadvantage, your ranged attacks ignore half and three-quarters cover, and before attacking with a ranged weapon you are proficient with you can take -5 to hit for +10 damage. 2024: +1 Dexterity; ignore half and three-quarters cover; no disadvantage at long range or with an enemy within 5 feet.',
  tough: 'Your hit point maximum goes up by 2 for every level you have, now and as you level up.',
  'war caster': 'Advantage on Constitution saves to keep concentration. You can perform spell gestures while holding weapons or a shield. When a creature provokes an opportunity attack, you can cast a quick single-target spell at it instead. The 2024 version also gives +1 Intelligence, Wisdom or Charisma.',
  lucky: 'You have a small pool of luck points that refills on a long rest. Spend one to gain advantage on your own d20 roll, or to give disadvantage to an attack against you.',
  'magic initiate': 'You learn two cantrips and one 1st-level spell from the Cleric, Druid or Wizard list. You can cast that spell once per long rest without a slot.',
  'savage attacker': 'Once per turn when you hit with a weapon, roll its damage dice twice and use whichever result you like.',
  skilled: 'You gain proficiency in any three skills or tools.',
  healer: 'With a healer\'s kit you can help an ally recover by spending one of their hit dice, and you may reroll 1s on healing dice.',
  musician: 'Proficiency with three instruments. After a short or long rest you can play to give some allies inspiration.',
  'tavern brawler': 'Your unarmed strikes hit harder, you can reroll 1s on their damage, you can push a creature you hit 5 feet once per turn, and you are good with improvised weapons.',
  crafter: 'Proficiency with three artisan\'s tools, a discount on non-magical items, and the ability to make simple gear during a long rest.'
};
export function featText(name) {
  const key = String(name || '').toLowerCase().replace(/\(.*?\)/g, '').trim(), chosen = /\(([^)]*)\)/.exec(String(name || ''))?.[1];
  return FEATS[key] ? `${FEATS[key]}${chosen ? ` You chose ${chosen}.` : ''}` : 'No description is saved for this feat. Ask your GM what it does.';
}

// A "?" that opens one explanation. It is always its own button, never nested inside another control.
export const ask = (key) => (HELP[key] ? `<button type="button" class="help" data-help="${key}" aria-label="What is ${HELP[key][0]}?">?</button>` : '');
