// Roll recipes: "roll this, add that" for spells, attacks, checks and saves. Pure (no DOM / Firebase).
// recipeFor(pc, {kind, ...}, opts) -> { label, kind, rolls:[{name, expr, text, parts, riders}], notes:[], ...extra }
//   kind 'spell'      {name}                      opts: { spells:<data/spells.json>, slot }
//   kind 'attack'     {attack:<pc.attacks[i]>}    opts: { round1:true }
//   kind 'skill'      {key:'perception'}  kind 'save' {key:'dex'}  kind 'ability' {key:'str'}  kind 'initiative'  kind 'death'
// `expr` is a plain dice expression the roller can evaluate ("1d20+7"); `riders` are optional extras the player may toggle on.
import { mod, profBonus, attacksPerAction } from './levelup.js';

const NAME = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const SKILLS = { acrobatics: 'dex', animal_handling: 'wis', arcana: 'int', athletics: 'str', deception: 'cha', history: 'int', insight: 'wis', intimidation: 'cha', investigation: 'int', medicine: 'wis', nature: 'int', perception: 'wis', performance: 'cha', persuasion: 'cha', religion: 'int', sleight_of_hand: 'dex', stealth: 'dex', survival: 'wis' };
const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sg = (n) => (n >= 0 ? `+${n}` : `${n}`);
const D = (dice, label) => ({ dice, text: label ? `${dice} ${label}` : dice });
const F = (n, label) => ({ flat: n, text: `${sg(n)} ${label}` });
const at = (table, level) => { let b; for (const [k, v] of Object.entries(table || {})) if (+k <= level && (!b || +k > b[0])) b = [+k, v]; return b?.[1]; };

function roll(name, parts, riders = []) {
  const ps = parts.filter((p) => p.dice || p.flat);
  const dice = ps.filter((p) => p.dice).map((p) => p.dice), flat = ps.reduce((a, p) => a + (p.flat || 0), 0);
  const expr = dice.join('+') + (flat ? sg(flat) : '');
  const text = ps.map((p, i) => (p.dice && i ? '+' + p.text : p.text)).join(' ');
  return { name, expr, text, parts: ps, riders };
}
const rider = (label, dice, note) => ({ label, expr: dice, note });
const ctx = (pc) => {
  const stats = pc.stats || {}, M = Object.fromEntries(Object.keys(NAME).map((a) => [a, mod(stats[a] ?? 10)]));
  const level = Number(pc.level) || 1, prof = Number(pc.combat?.proficiency_bonus) || profBonus(level);
  const has = (re) => Object.values(pc.abilities || {}).some((a) => re.test(String(a?.label || '')));
  const sub = norm(pc.subclass), cls = norm(pc.class);
  return { M, level, prof, has, sub, cls, sc: pc.spellcasting || {}, flavour: String(pc.text_blocks?.features_traits || '') };
};
const spellNames = (pc) => (pc.spellcasting?.spells || []).map((s) => norm(s.name));

function spellRecipe(pc, req, opts) {
  const c = ctx(pc), entry = c.sc.spells?.find((s) => norm(s.name) === norm(req.name)) || { name: req.name, level: 0 };
  const srd = (opts.spells || []).find((s) => norm(s.name) === norm(req.name));
  const level = srd ? srd.level : Number(entry.level) || 0;
  const slot = level ? Math.max(level, Number(opts.slot) || level) : 0;
  const ab = c.sc.ability || 'wis', cm = c.M[ab], dc = 8 + c.prof + cm;
  const rolls = [], notes = [], out = { label: req.name, kind: 'spell', level, slot, castTime: srd?.casting_time || entry.cast_time, range: srd?.range, duration: srd?.duration || entry.duration, concentration: srd ? !!srd.concentration : !!entry.concentration, rolls, notes };
  const isAttack = srd ? !!srd.attack_type : /^\+\d+$/.test(entry.to_hit || '');
  if (isAttack) rolls.push(roll('Spell attack', [D('1d20'), F(c.prof, 'proficiency'), F(cm, `${NAME[ab]} (casting ability)`)]));
  const saveAb = srd?.dc?.dc_type?.index || entry.save_stat;
  if (saveAb) { out.dc = dc; notes.push(`Targets make a ${NAME[saveAb] || saveAb.toUpperCase()} save against DC ${dc} (8 + ${c.prof} proficiency ${sg(cm)} ${NAME[ab]})${srd?.dc?.dc_success === 'half' ? '; half damage on a success' : ''}.`); }
  const heal = srd && level ? at(srd.heal_at_slot_level, slot) : undefined;
  if (heal) {
    const dm = /(\d+d\d+)/.exec(heal), parts = dm ? [D(dm[1], 'healing')] : [F(parseInt(heal, 10) || 0, 'healing')];
    if (/MOD/.test(heal)) parts.push(F(cm, NAME[ab]));
    if (c.has(/disciple of life/i) || c.sub === 'life domain') parts.push(F(2 + slot, 'Disciple of Life (2 + spell slot level)'));
    rolls.push(roll('Healing', parts));
  }
  let dmg = srd ? (level ? at(srd.damage?.damage_at_slot_level, slot) : at(srd.damage?.damage_at_character_level, c.level)) : entry.damage;
  if (!heal && dmg) {
    const m = /(\d+d\d+)(?:\s*\+\s*(\d+))?/.exec(dmg);
    if (m) rolls.push(roll('Damage', [D(m[1], (srd?.damage?.damage_type?.name || entry.damage_type || '').toLowerCase() + ' damage'), ...(m[2] ? [F(+m[2], 'bonus')] : [])]));
  }
  const n = norm(req.name);
  if (n === 'guidance') notes.push('The target adds 1d4 to one ability check of its choice before the end of the spell.');
  if (n === 'bless') notes.push('Up to 3 creatures (one more per slot level above 1st) add 1d4 to attack rolls and saving throws.');
  if (n === 'hunter s mark') notes.push('Bonus action. Your weapon hits on the marked creature deal an extra 1d6; the mark moves when the target dies.');
  if (slot > level && level) notes.unshift(`Cast with a level ${slot} slot.`);
  if (level && srd?.higher_level?.length) notes.push(srd.higher_level.join(' '));
  if (out.concentration) notes.push('Needs concentration.');
  const slots = c.sc.slots || [], used = c.sc.slots_used || [];
  out.slotOptions = level ? [...Array(10).keys()].filter((l) => l >= level && (slots[l] || 0) - (used[l] || 0) > 0) : [];
  return out;
}

function attackRecipe(pc, req, opts) {
  const c = ctx(pc), a = req.attack || {}, name = a.name || 'Attack';
  const text = `${a.name} ${a.type} ${a.notes}`, finesse = /finesse/i.test(text), ranged = /ranged|bow|crossbow|thrown|javelin/i.test(`${a.type} ${a.name}`) && !/melee/i.test(a.type || '');
  const ab = finesse ? (c.M.dex >= c.M.str ? 'dex' : 'str') : ranged && !/javelin/i.test(a.name) ? 'dex' : 'str';
  const stored = /^[+-]?\d+$/.test(String(a.to_hit ?? '').trim()) ? parseInt(a.to_hit, 10) : null;
  const archery = /archery/i.test(c.flavour) && ranged && /bow|crossbow/i.test(a.name) ? 2 : 0;
  const calc = c.M[ab] + c.prof + archery;
  const rolls = [], notes = [], out = { label: name, kind: 'attack', rolls, notes, attacks: attacksPerAction({ ...pc, level: c.level }) };
  if (stored !== null) {
    const parts = stored === calc ? [D('1d20'), F(c.M[ab], NAME[ab]), F(c.prof, 'proficiency'), ...(archery ? [F(2, 'Archery fighting style')] : [])] : [D('1d20'), F(stored, 'to hit (as written on the sheet)')];
    const rid = [];
    if (/war/.test(c.sub) && c.has(/guided strike/i)) rid.push(rider('Guided Strike (Channel Divinity)', '', '+10 to this attack roll'));
    rolls.push(roll('Attack', parts, rid));
  }
  const m = /(\d+d\d+)\s*(?:([+-])\s*(\d+))?/.exec(a.damage || '');
  if (m) {
    const parts = [D(m[1], `${(a.damage_type || '').toLowerCase()} damage`.trim())]; if (m[3]) parts.push(F(m[2] === '-' ? -m[3] : +m[3], 'damage bonus (ability modifier and fighting style)'));
    const rid = [];
    if (c.has(/hunter.?s mark/i) || spellNames(pc).includes('hunter s mark')) rid.push(rider("Hunter's Mark", '1d6', 'if the target is marked'));
    if (c.has(/favored foe/i)) rid.push(rider('Favored Foe', '1d4', 'once per turn on your favored foe'));
    if (c.has(/sneak attack/i)) rid.push(rider('Sneak Attack', `${Math.ceil(c.level / 2)}d6`, 'once per turn, with advantage or an ally next to the target'));
    if (opts.round1 && /gloom/.test(c.sub)) rid.push(rider('Dread Ambusher', '1d8', 'on the extra attack you get on round 1'));
    if (c.has(/superiority dice|combat superiority/i)) rid.push(rider('Maneuver', '1d8', `spend a superiority die; save DC ${8 + c.prof + Math.max(c.M.str, c.M.dex)}`));
    if (spellNames(pc).includes('divine favor')) rid.push(rider('Divine Favor', '1d4', 'radiant, while the spell lasts'));
    rolls.push(roll('Damage', parts, rid));
  }
  if (out.attacks.normal > 1) notes.push(`Attack action: ${out.attacks.normal} attacks with the same bonus.`);
  if (opts.round1 && out.attacks.round1 > out.attacks.normal) notes.push(`First turn of combat: ${out.attacks.round1} attacks (Dread Ambusher).`);
  if (c.has(/action surge/i)) notes.push('Action Surge: one more Attack action this turn.');
  if (a.notes) notes.push(a.notes);
  return out;
}

function checkRecipe(pc, req) {
  const c = ctx(pc), kind = req.kind, key = String(req.key || '').toLowerCase();
  const guidance = rider('Guidance', '1d4', 'if a cleric or druid cast it on you'), insp = rider('Bardic Inspiration', '', 'add the die a bard gave you');
  if (kind === 'death') return { label: 'Death saving throw', kind, rolls: [roll('Death save', [D('1d20')])], notes: ['10 or higher: success. 9 or lower: failure. Natural 20: you wake with 1 HP. Natural 1: two failures.'] };
  if (kind === 'initiative') {
    const dex = c.M.dex, wis = /gloom/.test(c.sub) && c.has(/dread ambusher/i) ? c.M.wis : 0, total = Number(pc.combat?.initiative_bonus ?? dex), other = total - dex - wis;
    return { label: 'Initiative', kind, rolls: [roll('Initiative', [D('1d20'), F(dex, 'DEX'), ...(wis ? [F(wis, 'WIS (Dread Ambusher)')] : []), ...(other ? [F(other, 'other bonuses')] : [])])], notes: [] };
  }
  if (kind === 'save') return { label: `${NAME[key]} saving throw`, kind, rolls: [roll('Save', [D('1d20'), F(c.M[key], NAME[key]), ...(pc.saves?.proficient?.includes?.(key) ? [F(c.prof, 'proficiency')] : [])], [guidance === null ? null : rider('Bless', '1d4', 'if blessed'), insp].filter(Boolean))], notes: [] };
  if (kind === 'ability') return { label: `${NAME[key]} check`, kind, rolls: [roll('Check', [D('1d20'), F(c.M[key], NAME[key])], [guidance, insp])], notes: [] };
  const s = pc.skills?.[key] || {}, ab = SKILLS[key], jat = !s.proficient && c.cls === 'bard' && c.level >= 2 ? Math.floor(c.prof / 2) : 0;
  const bonus = s.expertise ? 2 * c.prof : s.proficient ? c.prof : jat;
  const label = key.replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase());
  return { label: `${label} (${NAME[ab]})`, kind: 'skill', rolls: [roll('Check', [D('1d20'), F(c.M[ab], NAME[ab]), ...(bonus ? [F(bonus, s.expertise ? 'expertise (double proficiency)' : s.proficient ? 'proficiency' : 'Jack of All Trades (half proficiency)')] : [])], [guidance, insp])], notes: [] };
}

export function recipeFor(pc, req, opts = {}) {
  if (req.kind === 'spell') return spellRecipe(pc, req, opts);
  if (req.kind === 'attack') return attackRecipe(pc, req, opts);
  return checkRecipe(pc, req);
}
export { attacksPerAction };
