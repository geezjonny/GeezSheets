// Cheap NPC figures: a token that follows the person's rolled look (race build and skin, hair colour and
// style, clothing colours, armour, weapon) in about ten low-poly parts, so a town can show its people.
// lookOf(person) keeps only what the figure needs; tokens store it as token.look.
import { PAL } from './style.js';
import { hash } from './noise.js';

const SKIN = { human: ['#c4a487', '#a57f62', '#7a5640', '#dcbc9c', '#8f6a4e', '#b99376'], elf: ['#d8c3a5', '#c9b090'], dwarf: ['#b98c6c', '#a87b5c'], halfling: ['#c9a07c', '#b48a66'], gnome: ['#d0a888', '#c09474'], 'half-orc': ['#7f8f5e', '#6f7d52', '#8a8a62'], tiefling: ['#a5493c', '#8e3f4e', '#9c5a48'] };
const BUILD = { dwarf: [.78, 1.18], halfling: [.62, .9], gnome: [.6, .88], elf: [1.05, .9], 'half-orc': [1.08, 1.14], tiefling: [1, .96], human: [1, 1] };
const HAIR = { black: '#1d1a18', 'dark brown': '#3a2a1e', brown: '#5a3e28', chestnut: '#6b3a22', auburn: '#7d3a1f', red: '#97401f', copper: '#a3562b', sandy: '#b19564', blond: '#c8ad6a', 'ash blond': '#b8ab8a', grey: '#8d8a85', white: '#d9d6cf', 'dyed blue': '#3b5c8f', 'streaked with grey': '#5b5048' };
// clothing roll -> [body, accent]
const CLOTH = [
  [/wool tunic/, '#6b5842', '#4e3f30'], [/leather apron/, '#7a6a55', '#4a3626'], [/silks/, '#6b4a6e', '#a08a5a'], [/grey habit/, '#6f6c66', '#55524d'],
  [/oilskin/, '#6e6a3e', '#3b3a2a'], [/smock/, '#a89a78', '#b8a06a'], [/velvet/, '#5e2430', '#a08a5a'], [/rags/, '#665a48', '#4c4336'],
  [/travel-worn cloak/, '#4a4a36', '#5a412e'], [/tabard over mail/, '#7a2e26', '#7d7f83'], [/fur-trimmed/, '#4e3a2c', '#9c8a70'], [/motley/, '#8a3a2a', '#3a5a7a'],
  [/scorched leathers/, '#3e2e22', '#2a211b'], [/mourning black/, '#1f1d1c', '#2e2b29'],
];
const METAL = /chain|scale|plate|breastplate/, LEATHER = /leather|hide|padded/;
const LONG = /spear|quarterstaff/, BOW = /bow|crossbow/, BLADE = /sword|rapier|dagger|axe|mace|hammer|club/;

export const lookOf = p => p ? { race: p.race, gender: p.gender, hair: p.hair, clothing: p.clothing, armour: p.armour || null, weapon: p.weapon || null, seed: p.seed || 0 } : null;

// Adds the figure to a Geo. shapes: { C10, C8, CONE8, ICO1, B1 } from places.js; base = token colour.
export function addFigure(g, look, base, S, M) {
  const race = BUILD[look.race] ? look.race : 'human', [hk, wk] = BUILD[race];
  const pick = (a, n) => a[Math.floor(hash(look.seed | 0, n, 77) * a.length) % a.length];
  const skin = pick(SKIN[race] || SKIN.human, 1);
  const c = CLOTH.find(([re]) => re.test(look.clothing || '')) || [null, '#6b5842', '#4e3f30'];
  const body = c[1], accent = c[2], woman = look.gender === 'woman', w = wk * (woman ? .94 : 1);
  const hairTxt = look.hair || '', hairCol = Object.entries(HAIR).find(([k]) => hairTxt.startsWith(k))?.[1];
  const hood = /hood/.test(hairTxt), bald = /^(bald|shaved)/.test(hairTxt);
  // base (the token's colour), body, shoulders, head
  g.add(S.C10, PAL.iron, M(0, 0, 0, 0, .62, .12, .62));
  g.add(S.C10, base, M(0, .12, 0, 0, .56, .04, .56), { cj: 0 });
  g.add(S.CONE8, body, M(0, .15, 0, 0, (woman ? .46 : .4) * w, 1.25 * hk, (woman ? .46 : .4) * w), { cj: .06 });
  g.add(S.C8, accent, M(0, .15, 0, 0, (woman ? .47 : .41) * w, .12, (woman ? .47 : .41) * w), { cj: 0 }); // hem
  const sh = 1.02 * hk;
  g.add(S.C8, body, M(0, sh, 0, 0, .3 * w, .22, .3 * w));
  if (look.armour) g.add(S.C8, METAL.test(look.armour) ? '#7d7f83' : LEATHER.test(look.armour) ? '#5a412e' : accent, M(0, sh - .32, 0, 0, .29 * w, .36, .29 * w), { cj: .04 });
  const hy = sh + .47;
  g.add(S.ICO1, skin, M(0, hy, 0, 0, .24, .26, .24));
  if (hood) g.add(S.CONE8, accent, M(0, hy - .2, 0, 0, .3, .62, .3), { cj: .04 });
  else if (!bald && hairCol) {
    g.add(S.ICO1, hairCol, M(0, hy + .09, -.03, 0, .255, .19, .255)); // cap of hair
    if (/long|braided|wild|lank/.test(hairTxt)) g.add(S.B1, hairCol, M(0, hy - .45, -.17, 0, .3, .5, .1));
    if (/topknot/.test(hairTxt)) g.add(S.ICO1, hairCol, M(0, hy + .3, 0, 0, .09, .1, .09));
  } else if (/shaved/.test(hairTxt)) g.add(S.ICO1, skin, M(0, hy + .06, 0, 0, .25, .2, .25));
  // weapon
  const wp = look.weapon || '';
  if (LONG.test(wp)) { g.add(S.C8, PAL.wood, M(.36 * w, .1, 0, 0, .035, 1.95 * hk, .035)); if (/spear/.test(wp)) g.add(S.CONE8, PAL.iron, M(.36 * w, .1 + 1.95 * hk, 0, 0, .06, .2, .06)); }
  else if (BOW.test(wp)) g.add(S.B1, PAL.woodDark, M(0, sh - .55, -.3 * w, .5, .09, .8, .06));
  else if (BLADE.test(wp)) g.add(S.B1, /club|mace|hammer|axe/.test(wp) ? PAL.woodDark : '#8d8f93', M(.38 * w, .45 * hk, .05, 0, .06, /dagger/.test(wp) ? .32 : .62, .06, 0, .2));
}
