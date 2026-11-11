import { campaignPick, campaignList } from './campaign-flavor.js';
// Homebrew magic items: roll a base thing (an axe, a wand, a ring...), its power (scaled by rarity),
// then maybe a second gift or a curse. The rules text is rolled here, so it is always playable; a local
// model (Ollama, on the GM's computer) only names it and writes its lore, which is kept in the world
// (world.data.relics, by the item's seed) so it is the same item on every device afterwards.
// Without Ollama the item still has a rolled name and a line of history.
import { mulberry } from './noise.js';
import { ITEMS } from './data/items.js';

const rngOf = seed => mulberry((seed | 0) || 1);
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const wpick = (rng, w) => { let t = 0; for (const k in w) t += w[k]; let r = rng() * t; for (const k in w) if ((r -= w[k]) < 0) return k; return Object.keys(w)[0]; };
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

export const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary'];
const RANGE = { common: [50, 100], uncommon: [101, 500], rare: [501, 5000], 'very rare': [5001, 50000], legendary: [50001, 200000] };

// ---------------------------------------------------------------- what it is
const WEAPONS = ITEMS.filter(i => i.g.startsWith('weapon/') && !/Net|Blowgun/.test(i.n)).map(i => i.n.toLowerCase());
const ARMOURS = ITEMS.filter(i => i.g.startsWith('armor/')).map(i => i.n.toLowerCase().replace(' armor', ' armour'));
const BASES = {
  weapon: { w: 38, list: WEAPONS },
  armor: { w: 12, list: ARMOURS },
  worn: { w: 26, list: ['ring', 'ring', 'amulet', 'cloak', 'boots', 'gloves', 'gauntlets', 'belt', 'helm', 'circlet', 'mask', 'bracers', 'crown', 'earring', 'mantle'] },
  focus: { w: 14, list: ['wand', 'wand', 'staff', 'staff', 'rod', 'orb', 'crystal', 'sceptre'] },
  curio: { w: 10, list: ['lantern', 'book', 'horn', 'bell', 'mirror', 'key', 'skull', 'chalice', 'compass', 'deck of cards', 'flute', 'hourglass', 'box', 'candle', 'figurine'] },
};
export const RELIC_KINDS = Object.keys(BASES);

// ---------------------------------------------------------------- what it does (t: 0 common .. 4 legendary)
const DMG = ['fire', 'cold', 'lightning', 'thunder', 'necrotic', 'radiant', 'poison', 'acid', 'psychic'];
const DICE = ['1d4', '1d4', '1d6', '2d6', '3d6'];
const FOES = ['undead', 'fiends', 'dragons', 'giants', 'beasts', 'fey', 'aberrations', 'lycanthropes', 'oathbreakers', 'the kin of whoever forged it'];
const CONDS = ['frightened', 'poisoned', 'charmed', 'knocked prone', 'blinded'];
const SKILLS = ['Stealth', 'Perception', 'Insight', 'Persuasion', 'Intimidation', 'Survival', 'Athletics', 'Deception', 'Medicine', 'History'];
const SPELLS = [
  ['Light', 'Mage Hand', 'Prestidigitation', 'Guidance', 'Thaumaturgy'],
  ['Feather Fall', 'Disguise Self', 'Jump', 'Charm Person', 'Fog Cloud', 'Detect Magic', 'Sanctuary', 'Cure Wounds'],
  ['Misty Step', 'Invisibility', 'Levitate', 'Spider Climb', 'Hold Person', 'Silence', 'Lesser Restoration', 'Shatter'],
  ['Fly', 'Blink', 'Haste', 'Gaseous Form', 'Fear', 'Counterspell', 'Lightning Bolt', 'Speak with Dead'],
  ['Greater Invisibility', 'Dimension Door', 'Polymorph', 'Freedom of Movement', 'Death Ward', 'Wall of Fire', 'Raise Dead'],
];
const plus = t => Math.max(1, Math.min(3, t));
const dc = t => 11 + t * 2;
const spellOf = (rng, t) => pick(rng, SPELLS[Math.max(0, Math.min(4, t))]);
const POWERS = {
  weapon: [
    [3, (rng, t) => `+${plus(t)} to attack and damage rolls made with it.`, 1],
    [4, (rng, t) => { const d = pick(rng, DMG); return { text: `Deals an extra ${DICE[t]} ${d} damage on a hit.`, dmg: d }; }],
    [2, (rng, t) => ({ text: `On a hit it deals an extra ${DICE[t]} necrotic damage, and you regain hit points equal to that damage (once per turn).`, dmg: 'necrotic' }), 2],
    [3, (rng, t) => `Against ${pick(rng, FOES)}: +${plus(t)} to attack and damage, and an extra ${['1d6', '2d6', '2d6', '3d6', '4d6'][t]} damage.`],
    [3, (rng, t) => `On a hit, the target makes a DC ${dc(t)} Constitution save or is ${pick(rng, ['frightened', 'poisoned', 'slowed (speed halved)', 'knocked prone', 'deafened and dazed (no reactions)'])} until the end of its next turn.`],
    [1, (rng, t) => `When thrown it flies back to your hand. Its range doubles.`, 0, /axe|dagger|javelin|hammer|spear|trident|dart/],
    [2, (rng, t) => ({ text: `Sheds bright light for 20 feet on command. Undead in the light have disadvantage on attack rolls.`, dmg: 'radiant' })],
    [1, (rng, t) => `On a roll of 20 to hit, it deals an extra ${['1d6', '2d6', '2d6', '4d6', '6d6'][t]} damage of its type.`],
    [1, (rng, t) => `Once a day, when you hit, you can teleport up to ${10 + t * 10} feet to a space next to the target.`, 2],
  ],
  armor: [
    [4, (rng, t) => `+${plus(t)} bonus to AC.`, 1],
    [3, (rng, t) => { const d = pick(rng, DMG); return { text: `Resistance to ${d} damage.`, dmg: d }; }, 2],
    [2, (rng, t) => `Advantage on saves against being ${pick(rng, CONDS)}.`],
    [1, (rng, t) => `Once a day, when you are hit, you can use your reaction to turn the hit into a miss.`, 2],
    [2, (rng, t) => `You can't be surprised while wearing it. It tightens when something watches you.`],
    [2, (rng, t) => `It makes no sound, and imposes no disadvantage on Stealth.`],
    [1, (rng, t) => `When a creature hits you in melee, it takes ${DICE[t]} ${pick(rng, ['cold', 'fire', 'piercing', 'necrotic'])} damage.`],
  ],
  worn: [
    [2, (rng, t) => `+${plus(t - 1)} bonus to AC and saving throws.`, 2],
    [3, (rng, t) => `Advantage on ${pick(rng, SKILLS)} checks.`],
    [2, (rng, t) => `Darkvision out to 60 feet (or 60 feet further if you have it).`],
    [2, (rng, t) => pick(rng, [`Your walking speed increases by 10 feet.`, `You have a climbing speed equal to your walking speed.`, `You can breathe water.`, `You fall no faster than a leaf.`])],
    [4, (rng, t) => { const s = spellOf(rng, t); return `Once a day you can cast ${s} from it.`; }],
    [2, (rng, t) => { const d = pick(rng, DMG); return { text: `Resistance to ${d} damage.`, dmg: d }; }, 2],
    [1, (rng, t) => `Once a day, you know whether the last thing said to you was a lie.`],
    [1, (rng, t) => `Your Strength becomes ${[15, 17, 19, 21, 23][t]}, if it isn't already higher.`, 2],
  ],
  focus: [
    [3, (rng, t) => `+${plus(t)} to spell attack rolls and spell save DC.`, 1],
    [4, (rng, t) => { const n = 3 + t * 2, s = spellOf(rng, t); return `${n} charges. Spend 1 to cast ${s} (save DC ${dc(t) + 2}). It regains 1d${n} charges at dawn; if the last is spent, roll a d20, and on a 1 it crumbles.`; }],
    [2, (rng, t) => { const d = pick(rng, DMG); return { text: `Once a day, when you cast a damaging spell through it, you can change its damage type to ${d}.`, dmg: d }; }],
    [1, (rng, t) => `It stores one spell of up to level ${Math.max(1, t + (t > 2 ? 2 : 1))}, cast into it by anyone, until used.`],
    [1, (rng, t) => `Once a day, regain one spent spell slot of level ${Math.max(1, t)} or lower when you hold it and rest for a minute.`, 1],
  ],
  curio: [
    [3, (rng, t) => { const s = spellOf(rng, t); return `Once a day you can cast ${s} from it.`; }],
    [2, (rng, t) => `It points toward ${pick(rng, ['the nearest water', 'the nearest grave', 'whoever last held it', 'the nearest gold', 'home, whatever you call home', 'the nearest door that has never been opened'])}.`],
    [1, (rng, t) => `Once a day, ask it one question. It answers truthfully, in one word.`, 2],
    [2, (rng, t) => `Once a day it calls a ${pick(rng, ['raven', 'grey wolf', 'mastiff', 'owl', 'giant spider', 'black cat'])} that serves you for an hour, then leaves.`],
    [1, (rng, t) => `It can hold ${t + 1} whispered message${t ? 's' : ''}, played back to whoever next holds it.`],
    [1, (rng, t) => `Inside it is a small dry room, ${5 + t * 5} feet across, that only its holder can enter.`, 2],
  ],
};
const BOONS = [
  `It glows faintly when undead are within 60 feet.`, `You can speak with ${'crows'} while you carry it.`, `You never get lost on a road.`, `Four hours of rest is a full night's sleep for you.`,
  `You can't be charmed while you carry it.`, `It can't be stolen: it is back with you at dawn.`, `+2 to initiative.`, `You feel no cold, ever.`, `It hums when someone means you harm, within 60 feet.`, `Animals trust you, at first.`,
  `It is never dirty, never rusts, never dulls.`, `It weighs nothing to you.`, `Once a day, you can make it look like something ordinary.`,
];
const CURSES = [
  `Once attuned, you can't let go of it: it always comes back. Remove Curse ends this.`, `You can't sleep while you carry it; you get the rest, but not the dreams.`, `You have vulnerability to ${'DMG'} damage.`,
  `It whispers. Once a day, when you are angry, make a DC 13 Wisdom save or attack the nearest creature.`, `In sunlight you have disadvantage on attack rolls.`, `Undead can sense you within a mile.`,
  `Each time you use its power you age a year.`, `You can't cross running water while you carry it.`, `It wants blood: if it hasn't drawn any today, you take 1d6 necrotic damage at dusk.`,
  `You cannot lie, even to save your life.`, `Animals flee from you.`, `Your reflection is someone else's.`, `Its last owner's voice sometimes answers for you.`, `Coins you carry turn to lead by morning.`,
];

// The item, from a seed. opts: rarity, kind (weapon, armor, worn, focus, curio), base.
export function makeRelic(seed, opts = {}) {
  const rng = rngOf((seed | 0) * 7 + 3301);
  const r = RARITIES.includes(opts.rarity) ? opts.rarity : wpick(rng, { common: 8, uncommon: 34, rare: 34, 'very rare': 17, legendary: 7 }), t = RARITIES.indexOf(r);
  const kind = BASES[opts.kind] ? opts.kind : wpick(rng, Object.fromEntries(Object.entries(BASES).map(([k, v]) => [k, v.w])));
  const base = opts.base || pick(rng, BASES[kind].list);
  const pool = POWERS[kind].filter(p => (p[2] || 0) <= t && (!p[3] || p[3].test(base)));
  const roll1 = (not = -1) => { const w = Object.fromEntries(pool.map((p, i) => [i, i === not ? 0 : p[0]])), i = +wpick(rng, w), P = pool[i][1](rng, t); return [i, typeof P === 'string' ? { text: P } : P]; };
  const [first, power] = roll1();
  // very rare items sometimes, legendary items always, have a second power
  if ((t === 4 || (t === 3 && rng() < .35)) && pool.length > 1) { const [, p2] = roll1(first); power.text += ' ' + p2.text; power.dmg ||= p2.dmg; }
  const second = wpick(rng, t >= 4 ? { boon: 55, curse: 30, none: 15 } : { none: 45, boon: 33, curse: 22 });
  const avoid = power.dmg && power.dmg !== 'necrotic' ? power.dmg : null;
  const boon = second === 'boon' ? pick(rng, BOONS).replace("'crows'", pick(rng, ['crows', 'rats', 'dogs', 'the drowned'])) : null;
  const curse = second === 'curse' ? pick(rng, CURSES).replace('DMG', pick(rng, DMG.filter(d => d !== avoid))) : null;
  const attune = t >= 2 || !!curse || /cast|charges|Strength|AC and saving/.test(power.text);
  const [a, b] = RANGE[r], value = Math.round(a * Math.pow(b / a, rng()) / 5) * 5;
  const key = 'r' + (seed >>> 0).toString(36) + (opts.rarity ? '.' + r : '') + (opts.kind ? '.' + kind : '') + (opts.base ? '.' + base : '');
  const R = { key, seed, rarity: r, kind, base, power: power.text, dmg: power.dmg || null, boon, curse, attune, value, rolled: fallbackName(rng, base, power.dmg, curse), history: campaignPick(rng, 'HIST', HIST) };
  const ai = names()[key];
  return { ...R, name: ai?.name || R.rolled, lore: ai?.lore || null, named: !!ai };
}

// a rolled name for when there's no model
const WORD = { fire: ['Ember', 'Cinder', 'Ash'], cold: ['Rime', 'Winter', 'Frost'], lightning: ['Storm', 'Thunderhead'], thunder: ['Thunder', 'the Bell'], necrotic: ['Hollow', 'Grave', 'the Pale'], radiant: ['Dawn', 'the Saint', 'Candle'], poison: ['Nightshade', 'the Adder'], acid: ['Gall', 'the Tanner'], psychic: ['Whispers', 'the Dreamer'] };
const OF = ['the Drowned King', 'Ashes', 'the Hollow Moon', 'Last Light', 'the Ninth Bell', 'Whispers', 'the Pale Saint', 'Quiet Thunder', 'the Lost Road', 'the Wolf Mother', 'Salt and Bone', 'the Gallows', 'Seven Winters', 'the Black Ford'];
const ADJ = ['Grey', 'Old', 'Weeping', 'Iron', 'Crooked', 'Silent', 'Hungry', 'Barrow', 'Hollow', 'Bitter', 'Widow\'s', 'Hangman\'s'];
function fallbackName(rng, base, dmg, curse) {
  const B = base.replace(/,.*$/, '').split(' ').map(cap).join(' ');
  if (dmg && WORD[dmg] && rng() < .5) return `${pick(rng, WORD[dmg])}${rng() < .5 ? '' : ','} ${B}`.replace(/^the /, 'The ');
  return rng() < .5 ? `The ${B} of ${campaignPick(rng, 'OF', OF)}` : `The ${curse && rng() < .6 ? pick(rng, ['Hungry', 'Weeping', 'Hangman\'s', 'Widow\'s']) : pick(rng, ADJ)} ${B}`;
}
const HIST = ['Forged for a queen who never wore it.', 'Taken from a dragon\'s hoard.', 'Buried with a hero who isn\'t dead.', 'Made by a dwarf as an apology.', 'Won in a game of dice with a devil.', 'Carried by every captain of a vanished ship.', 'Stolen from a temple that wants it back.', 'Found inside a fish.', 'Made in the war, by the losing side.', 'A wedding gift, from a family that no longer exists.'];
// Additional hand-authored roller entries.
HIST.push(
  "Recovered from the foundation of a demolished chapel.",
  "Carried through three sieges by the same nameless courier.",
  "Cast from the bell of a plague ship.",
  "Hidden in a dowry chest for six generations.",
  "Accepted as payment by an executioner who then resigned.",
  "Unearthed beneath a road paved with grave markers.",
  "Made to seal a treaty that neither side honoured.",
  "Returned to shore tangled in a drowned fisher's net.",
  "Commissioned by a ruler to commemorate a defeat.",
  "Found beside a campfire that had burned for a century.",
  "Carried by the last keeper of a forgotten lighthouse.",
  "Sealed inside a statue during a famine.",
  "Taken as collateral for a debt nobody can now repay.",
  "Presented to a healer who refused a royal pardon.",
  "Recovered from the nest of a bird made of smoke.",
  "Passed between enemy soldiers during an unofficial truce.",
  "Made from ore dug beneath an abandoned asylum.",
  "Listed in an inventory written before its maker was born.",
  "Bought for a copper at the sale of a ruined abbey.",
  "Buried under the threshold of a house with no doors.",
  "Given to a ferryman by a passenger without a face.",
  "Preserved in salt by a family afraid to touch it.",
  "Smuggled out of a burning archive inside a loaf of bread.",
  "Left on a battlefield in place of a missing officer.",
  "Carried by a pilgrim who walked home without a shadow."
);

export const relicSub = R => `${cap(R.rarity)} ${R.base}${R.attune ? ' · requires attunement' : ''}`;
export const relicSections = R => [
  { t: 'What it does', text: R.power },
  R.boon ? { t: 'And', text: R.boon } : null,
  R.curse ? { t: 'Curse', gm: true, text: R.curse + ' (Hidden until attuned.)' } : null,
  { t: 'Lore', text: R.lore || R.history },
  { t: 'Worth', rows: [['Value', `${R.value.toLocaleString()} gp`], ['Rarity', R.rarity], ['Attunement', R.attune ? 'yes' : 'no'], ['Name', R.named ? 'by the local model' : 'rolled']] },
].filter(Boolean);
export const rollRelic = (seed, opts = {}) => { const R = makeRelic(seed, opts); return { roller: 'relic', seed, opts, title: R.name, sub: relicSub(R), relic: R, sections: relicSections(R) }; };

// ---------------------------------------------------------------- names and lore from a local model
// The names live in the world (world.data.relics); main.js binds them here when a world loads.
let names = () => ({});
export const bindRelicNames = get => { names = get; };
export const setRelicName = (key, v) => { names()[key] = v; };

const SYSTEM = 'You name magic items for a grim, low-magic dark fantasy D&D 5e world: mud, candles, old wars, small gods, nothing shiny or modern. ' +
  'Reply with JSON only: {"name": string, "lore": string}. name: 2 to 5 words, evocative, no modern words, no quotation marks. ' +
  'lore: 2 or 3 short sentences: who made or carried it and what became of them, and one concrete detail of how it looks, feels or sounds. ' +
  'If it is cursed, hint at the curse without saying it. Do not repeat the rules text or mention game terms.';
const OLLAMA = [new URL('./ollama', import.meta.url).href, 'http://127.0.0.1:11434'];   // via our server (works from phones on the LAN), else direct
const PREFER = [/^qwen3\.5:4b/, /^qwen3/, /^llama3/, /^gemma/, /^mistral/, /^phi/];
let found = null;
async function ollama() {
  if (found) return found;
  for (const base of OLLAMA) {
    try {
      const r = await fetch(base + '/api/tags', { signal: AbortSignal.timeout(2500) }); if (!r.ok) continue;
      const names = (await r.json()).models.map(m => m.name).filter(n => !/coder|html|embed/.test(n));
      const want = localStorage.getItem('gt.ollamaModel');
      const model = names.includes(want) ? want : PREFER.map(re => names.find(n => re.test(n))).find(Boolean) || names[0];
      if (model) return (found = { base, model });
    } catch { /* not here */ }
  }
  return null;
}
export const ollamaReady = () => ollama().then(Boolean);

// Ask the model for a name and lore. where: optional context ("in a farmer's barn in Brackenford").
export async function nameRelic(R, where = '') {
  const o = await ollama(); if (!o) throw new Error('Ollama is not running');
  const msg = `Base item: ${R.base}. Rarity: ${R.rarity}. Power: ${R.power}` + (R.boon ? ` Also: ${R.boon}` : '') + (R.curse ? ` Curse (secret): ${R.curse}` : '') + (where ? ` It is found ${where}.` : '');
  const r = await fetch(o.base + '/api/chat', {
    method: 'POST', signal: AbortSignal.timeout(90000),
    body: JSON.stringify({ model: o.model, stream: false, think: false, format: 'json', options: { temperature: .95, num_predict: 300 }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: msg }] }),
  });
  if (!r.ok) throw new Error('Ollama said ' + r.status);
  const j = JSON.parse((await r.json()).message.content);
  const name = String(j.name || '').replace(/["“”]/g, '').trim(), lore = String(j.lore || '').trim();
  if (!name || name.split(/\s+/).length > 7 || !lore) throw new Error('The model gave an odd answer; try again');
  return { name, lore, model: o.model };
}
