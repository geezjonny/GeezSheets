// Option catalogues for the character creator. Race ids match data/races.json; class ids match data/classes.json.
// Hair colour names, and the words used for hair, clothing, armour and weapons, match zoom-ink-test/figures.js
// so a creator recipe can be turned into the NPC "look" that figures.js already understands (see recipe.js toLook).

// Body proportions per race, in voxels. legH = floor to waist, torsoH = waist to top of shoulders, hw = torso half width.
// Legs and torso are two-thirds of the first version's height; arms follow the torso (see D.arm in build.js).
// The head is always 16 voxels. Dragonborn swaps the head for its own (snout, frills).
export const RACES = {
  human:      { label: 'Human',      legH: 14, torsoH: 9, hw: 6, td: 4, boot: 5, ears: 'round' },
  elf:        { label: 'Elf',        legH: 15, torsoH: 9, hw: 5, td: 4, boot: 5, ears: 'elf' },
  'half-elf': { label: 'Half-Elf',   legH: 14, torsoH: 9, hw: 6, td: 4, boot: 5, ears: 'half' },
  dwarf:      { label: 'Dwarf',      legH: 10, torsoH: 8, hw: 7, td: 5, boot: 4, ears: 'round' },
  halfling:   { label: 'Halfling',   legH: 9, torsoH: 7, hw: 5, td: 4, boot: 4, ears: 'round', bigFeet: true },
  gnome:      { label: 'Gnome',      legH: 8, torsoH: 7, hw: 5, td: 4, boot: 4, ears: 'gnome', noseBonus: 1 },
  'half-orc': { label: 'Half-Orc',   legH: 15, torsoH: 9, hw: 7, td: 5, boot: 5, ears: 'round', tusks: true, jaw: true },
  tiefling:   { label: 'Tiefling',   legH: 14, torsoH: 9, hw: 6, td: 4, boot: 5, ears: 'half', horns: true, tail: 'spade' },
  dragonborn: { label: 'Dragonborn', legH: 15, torsoH: 9, hw: 6, td: 5, boot: 5, ears: 'none', head: 'dragon', tail: 'scaled' },
};
export const RACE_IDS = Object.keys(RACES);

// Skin / scale tones per race, light to dark. Real-world tones reuse the figures.js values.
export const SKINS = {
  human: ['#dcbc9c', '#c4a487', '#b99376', '#a57f62', '#8f6a4e', '#7a5640'],
  elf: ['#e6d3b6', '#d8c3a5', '#c9b090', '#a98f6f'],
  'half-elf': ['#dcbc9c', '#c4a487', '#b99376', '#a57f62'],
  dwarf: ['#c9a07c', '#b98c6c', '#a87b5c', '#8f6a4e'],
  halfling: ['#dcbc9c', '#c9a07c', '#b48a66'],
  gnome: ['#e0b898', '#d0a888', '#c09474'],
  'half-orc': ['#8a8a62', '#7f8f5e', '#6f7d52', '#5f7a52'],
  tiefling: ['#c4a487', '#a5493c', '#8e3f4e', '#6a4a8e', '#4a6a9a'],
  dragonborn: ['#a83a30', '#2f6aa8', '#2f7a4a', '#b08a2a', '#8c9aa8', '#3a3a44'],
};
export const SKIN_NAMES = {
  tiefling: ['Fair', 'Infernal red', 'Wine', 'Violet', 'Blue'],
  dragonborn: ['Red', 'Blue', 'Green', 'Gold', 'Silver', 'Black'],
};

export const HAIR_COLORS = {
  black: '#1d1a18', 'dark brown': '#3a2a1e', brown: '#5a3e28', chestnut: '#6b3a22', auburn: '#7d3a1f', red: '#97401f', copper: '#a3562b',
  sandy: '#b19564', blond: '#c8ad6a', 'ash blond': '#b8ab8a', grey: '#8d8a85', white: '#e4e2ee', 'dyed blue': '#3b5c8f',
};
export const HAIR_STYLES = { bald: 'Bald', short: 'Short', long: 'Long', ponytail: 'Ponytail', topknot: 'Topknot', mohawk: 'Mohawk', braids: 'Braids' };
export const BEARDS = { none: 'None', mustache: 'Mustache', goatee: 'Goatee', short: 'Short beard', full: 'Full beard', long: 'Long beard' };
export const EYE_STYLES = { round: 'Round', wide: 'Wide', sharp: 'Sharp', narrow: 'Narrow', dot: 'Dot' };
export const EYE_COLORS = { blue: '#3ea8ff', green: '#3fcf6a', brown: '#8a5a32', amber: '#e0a020', grey: '#9aa8b8', violet: '#9a5af0', red: '#e0443a', gold: '#ffd23c' };
export const BROWS = { thin: 'Thin', thick: 'Bold', none: 'None' };
export const NOSES = { dot: 'Dot', none: 'None', small: 'Small', normal: 'Normal', big: 'Big' };
export const MOUTHS = { neutral: 'Neutral', smile: 'Smile', open: 'Open', frown: 'Frown', grin: 'Grin' };
export const MARKS = { none: 'None', 'scar-eye': 'Scar over eye', 'scar-cheek': 'Scar on cheek', 'war-stripes': 'War stripes', 'cheek-lines': 'Cheek lines', 'forehead-mark': 'Forehead mark' };
export const PAINTS = { red: '#c0392b', white: '#f0ece4', blue: '#2e6fd0', black: '#14141c', gold: '#e2b43c' };

export const OUTFITS = { robe: 'Robe', tunic: 'Tunic', armor: 'Armor' };
export const HEADGEAR = { none: 'None', 'wizard-hat': 'Wizard hat', hood: 'Hood', helm: 'Helm', 'horned-helm': 'Horned helm', circlet: 'Circlet', headband: 'Headband', 'leaf-crown': 'Leaf crown', 'feather-cap': 'Feather cap' };
export const WEAPONS = { none: 'None', staff: 'Staff', sword: 'Sword', axe: 'Axe', mace: 'Mace', dagger: 'Dagger', bow: 'Bow' };

export const CLOTH = {
  crimson: '#a8323f', rust: '#b5582a', saffron: '#d9962a', olive: '#6f7a2f', forest: '#2f6f3e', teal: '#1f7a7a', azure: '#2f6fb0',
  indigo: '#2f3590', violet: '#6a3fa8', plum: '#7a2f6a', charcoal: '#3a3d4a', bone: '#d8d2c0', brown: '#6b4a30', navy: '#1f2d5a',
};
export const METALS = { steel: '#a8b2c4', iron: '#6c7486', bronze: '#b07a3a', gold: '#e2b43c', silver: '#d6dcea' };
export const MAGIC = { cyan: '#5be7ff', violet: '#b48cff', fire: '#ff9a3c', green: '#6dff9a', red: '#ff5a5a' };

// Class presets: gear only. Appearance (race, face, hair) is never touched by picking a class.
export const CLASSES = {
  barbarian: { outfit: 'tunic', headgear: 'horned-helm', weapon: 'axe',    primary: 'brown',    secondary: 'rust',     trim: 'bronze', metal: 'iron' },
  bard:      { outfit: 'tunic', headgear: 'feather-cap', weapon: 'dagger', primary: 'plum',     secondary: 'saffron',  trim: 'gold',   metal: 'silver' },
  cleric:    { outfit: 'armor', headgear: 'none',        weapon: 'mace',   primary: 'bone',     secondary: 'azure',    trim: 'gold',   metal: 'steel' },
  druid:     { outfit: 'robe',  headgear: 'leaf-crown',  weapon: 'staff',  primary: 'forest',   secondary: 'olive',    trim: 'bronze', metal: 'bronze', magic: 'green' },
  fighter:   { outfit: 'armor', headgear: 'helm',        weapon: 'sword',  primary: 'crimson',  secondary: 'charcoal', trim: 'silver', metal: 'steel' },
  monk:      { outfit: 'tunic', headgear: 'headband',    weapon: 'none',   primary: 'saffron',  secondary: 'rust',     trim: 'bronze', metal: 'bronze' },
  paladin:   { outfit: 'armor', headgear: 'helm',        weapon: 'sword',  primary: 'bone',     secondary: 'azure',    trim: 'gold',   metal: 'silver' },
  ranger:    { outfit: 'tunic', headgear: 'hood',        weapon: 'bow',    primary: 'olive',    secondary: 'brown',    trim: 'bronze', metal: 'iron' },
  rogue:     { outfit: 'tunic', headgear: 'hood',        weapon: 'dagger', primary: 'charcoal', secondary: 'plum',     trim: 'iron',   metal: 'steel' },
  sorcerer:  { outfit: 'robe',  headgear: 'circlet',     weapon: 'staff',  primary: 'crimson',  secondary: 'plum',     trim: 'gold',   metal: 'gold',   magic: 'fire' },
  warlock:   { outfit: 'robe',  headgear: 'hood',        weapon: 'staff',  primary: 'plum',     secondary: 'charcoal', trim: 'iron',   metal: 'iron',   magic: 'violet' },
  wizard:    { outfit: 'robe',  headgear: 'wizard-hat',  weapon: 'staff',  primary: 'indigo',   secondary: 'violet',   trim: 'gold',   metal: 'gold',   magic: 'cyan' },
};
