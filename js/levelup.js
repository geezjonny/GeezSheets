// Level-up and audit engine for GeezSheets PCs. Pure: no DOM, no Firebase, no fetch (data is passed in).
// 2014 rules. Works on the raw entity.data object as stored in Firebase ('%EMPTY' markers are preserved).
export const ABIL = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const mod = (s) => Math.floor((Number(s) - 10) / 2);
export const profBonus = (level) => 2 + Math.floor((level - 1) / 4);
const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const arr = (v) => Array.isArray(v) ? v.slice() : (v && typeof v === 'object' ? Object.entries(v).filter(([k]) => k !== '%EMPTY').map(([, x]) => x) : []);
const upTo = (table, level) => { let best; for (const [k, v] of Object.entries(table || {})) if (+k <= level && (best === undefined || +k > best[0])) best = [+k, v]; return best?.[1]; };
const ASI = (cls) => [4, 8, 12, 16, 19, ...(cls === 'fighter' ? [6, 14] : []), ...(cls === 'rogue' ? [10] : [])];
const MANEUVERS = (l) => l >= 15 ? 9 : l >= 10 ? 7 : l >= 7 ? 5 : l >= 3 ? 3 : 0;

// How many attacks one Attack action gives, and on round 1.
export function attacksPerAction(pc) {
  const cls = norm(pc.class), l = pc.level, sub = norm(pc.subclass);
  let n = 1;
  if (cls === 'fighter') n = l >= 20 ? 4 : l >= 11 ? 3 : l >= 5 ? 2 : 1;
  else if (['ranger', 'paladin', 'barbarian', 'monk'].includes(cls)) n = l >= 5 ? 2 : 1;
  const notes = [];
  let round1 = n;
  if (sub === 'gloomstalker' || sub === 'gloom stalker') { round1 = n + 1; notes.push('Round 1 (Dread Ambusher): one extra attack, +1d8 damage on a hit.'); }
  if (cls === 'fighter' && l >= 2) notes.push('Action Surge: a second Attack action this turn.');
  return { normal: n, round1, notes };
}

export function planCharacter(raw, target, srd, custom) {
  const d = structuredClone(raw), log = [], review = [], choices = [];
  const cls = norm(d.class), subRaw = String(d.subclass || '').toLowerCase().trim();
  const subKey = Object.keys(custom.subclasses).find((k) => norm(k) === norm(subRaw)) || null;
  const sub = subKey ? custom.subclasses[subKey] : null;
  const L0 = Number(d.level) || 1;
  target = Math.max(L0, target || L0);
  const stats = d.stats || {}, M = Object.fromEntries(ABIL.map((a) => [a, mod(stats[a] ?? 10)]));
  const classData = srd.classes.find((c) => c.index === cls);
  const hitDie = classData?.hit_die || 8;
  d.combat ||= {};
  const c = d.combat;

  // ---- level and hit points
  if (target > L0) {
    let gain = 0;
    for (let lv = L0 + 1; lv <= target; lv++) {
      const g = Math.max(1, Math.floor(hitDie / 2) + 1 + M.con); gain += g;
      if (ASI(cls).includes(lv)) choices.push(`Level ${lv}: ability score increase (or a feat). Stats were not changed.`);
    }
    c.hp_max = (Number(c.hp_max) || 0) + gain; c.hp_current = (Number(c.hp_current) || 0) + gain;
    log.push(`Level ${L0} -> ${target}: +${gain} max HP (average d${hitDie} + CON ${M.con} per level)`);
    d.level = target;
  } else if (target >= 4 && ASI(cls).some((l) => l <= target)) review.push('Check ability scores: confirm the level 4 (and later) ability score increases were taken.');
  const want = `${target}d${hitDie}`;
  if (c.hit_dice !== want) { log.push(`Hit dice ${c.hit_dice} -> ${want}`); c.hit_dice = want; }

  // ---- proficiency and everything that follows from it
  const oldProf = Number(c.proficiency_bonus) || 2, newProf = profBonus(target), delta = newProf - oldProf;
  const oldSpellDC = Number(d.spellcasting?.spell_save_dc) || 0, oldSpellAtk = d.spellcasting?.spell_attack_bonus;
  const dcs = new Set([oldSpellDC, 8 + oldProf + M.str, 8 + oldProf + M.dex].filter(Boolean));
  const atks = new Set([oldSpellAtk, ...arr(d.attacks).map((a) => parseInt(a.to_hit, 10))].filter((n) => Number.isFinite(n)));
  const bump = (s) => (typeof s !== 'string' || !delta) ? s
    : s.replace(/\bDC (\d+)/g, (m, n) => dcs.has(+n) ? `DC ${+n + delta}` : m)
       .replace(/(d20 ?\+ ?|attack \+|to hit \+)(\d+)/gi, (m, p, n) => atks.has(+n) ? p + (+n + delta) : m);
  if (delta) {
    log.push(`Proficiency bonus +${oldProf} -> +${newProf}`);
    c.proficiency_bonus = newProf;
    for (const a of arr(d.attacks)) {
      if (/^[+-]?\d+$/.test(String(a.to_hit ?? '').trim())) a.to_hit = (parseInt(a.to_hit, 10) + delta >= 0 ? '+' : '') + (parseInt(a.to_hit, 10) + delta);
      a.notes = bump(a.notes);
    }
    if (Array.isArray(d.attacks)) { /* mutated in place */ }
    for (const ab of Object.values(d.abilities || {})) if (ab && typeof ab === 'object') {
      if (Number(ab.save_dc) > 0) ab.save_dc = Number(ab.save_dc) + delta;
      ab.effect_desc = bump(ab.effect_desc);
    }
  }

  // ---- class-level scaling that the sheets store as text
  for (const [key, ab] of Object.entries(d.abilities || {})) {
    if (!ab || typeof ab !== 'object') continue;
    const was = ab.effect_desc;
    if (/preserve_life/.test(key)) ab.effect_desc = String(ab.effect_desc).replace(/up to \d+ HP/, `up to ${5 * target} HP`);
    if (/second_wind/.test(key)) ab.effect_desc = String(ab.effect_desc).replace(/1d10 \+ \d+/, `1d10 + ${target}`);
    if (/bardic_inspiration/.test(key)) {
      const die = target >= 15 ? 'd12' : target >= 10 ? 'd10' : target >= 5 ? 'd8' : 'd6';
      if (ab.die !== die) { log.push(`Bardic Inspiration die ${ab.die} -> ${die}`); ab.die = die; ab.effect_dice = '1' + die; ab.effect_desc = String(ab.effect_desc).replace(/\bd(6|8|10|12)\b/g, die); }
      const max = Math.max(1, M.cha); if (ab.max !== max) { ab.max = max; ab.current = Math.min(ab.current ?? max, max); }
    }
    if (ab.effect_desc !== was) log.push(`${ab.label}: text updated for level ${target}`);
  }

  // ---- spellcasting
  const castKey = (subKey && sub.caster === 'third') ? subKey : (custom.castingAbility[cls] ? cls : null);
  const spells = arr(d.spellcasting?.spells);
  if (castKey) {
    d.spellcasting ||= {};
    const sc = d.spellcasting, ability = custom.castingAbility[castKey], castMod = M[ability];
    sc.ability = ability;
    const row = castKey === subKey ? null : srd.classLevels[cls]?.[target - 1]?.spellcasting || {};
    const third = castKey === subKey ? custom.thirdCaster : null;
    const cantripsWanted = third ? upTo(third.cantrips, target) || 0 : row.cantrips_known || 0;
    const prepared = custom.preparedCasters.includes(castKey);
    const known = third ? upTo(third.spellsKnown, target) || 0 : prepared ? Math.max(1, castMod + (cls === 'paladin' ? Math.floor(target / 2) : target)) : row.spells_known || 0;
    const slotsNew = [null, ...Array.from({ length: 9 }, (_, i) => third ? (upTo(third.slots, target)?.[i] || 0) : (row[`spell_slots_level_${i + 1}`] || 0))];
    const oldSlots = JSON.stringify(arr(sc.slots).map((x) => x ?? null));
    const padded = Array.from({ length: 10 }, (_, i) => (arr(sc.slots)[i] ?? (i ? 0 : null)));
    if (JSON.stringify(padded) !== JSON.stringify(slotsNew)) log.push(`Spell slots ${padded.slice(1).filter((x) => x).join('/') || 'none'} -> ${slotsNew.slice(1).filter((x) => x).join('/') || 'none'}`);
    sc.slots = slotsNew;
    const used = arr(sc.slots_used); sc.slots_used = Array.from({ length: 10 }, (_, i) => i ? Math.min(Number(used[i]) || 0, slotsNew[i]) : null);
    const newDC = 8 + newProf + castMod, newAtk = newProf + castMod;
    if (sc.spell_save_dc !== newDC || sc.spell_attack_bonus !== newAtk) log.push(`Spell save DC ${sc.spell_save_dc} -> ${newDC}, spell attack ${sc.spell_attack_bonus ?? 'none'} -> +${newAtk}`);
    sc.spell_save_dc = newDC; sc.spell_attack_bonus = newAtk;

    const classKey = castKey === subKey ? 'wizard' : cls;
    const byName = new Map(srd.spells.map((s) => [norm(s.name), s]));
    const onList = (s) => s.classes?.some((x) => x.index === classKey) || (custom.extraOnList?.[classKey] || []).some((n) => norm(n) === norm(s.name));
    const mk = (s, type) => {
      const lvl = s.level, dmg = lvl ? s.damage?.damage_at_slot_level?.[lvl] : s.damage?.damage_at_character_level?.['1'];
      const bits = [s.casting_time, s.range, s.attack_type ? `${s.attack_type} spell attack +${newAtk}` : '', s.dc ? `DC ${newDC} ${s.dc.dc_type?.name} save${s.dc.dc_success === 'half' ? ', half on success' : ''}` : '', s.duration].filter(Boolean);
      return { beginner_tip: '', cast_time: s.casting_time || '', concentration: !!s.concentration, damage: dmg || '', damage_type: s.damage?.damage_type?.name?.toLowerCase() || '', duration: s.duration || '', level: lvl, name: s.name, notes: bits.join('. ') + '.', prepared_type: type, save_stat: s.dc?.dc_type?.index || '', to_hit: s.attack_type ? `+${newAtk}` : '', upcast: (s.higher_level || [])[0] || '' };
    };
    // fix wrong levels, drop upcast duplicates like "Cure Wounds (2nd level)"
    let list = spells.filter((s) => {
      const m = /^(.*) \(\d\w\w level\)$/.exec(s.name || '');
      if (m && spells.some((o) => norm(o.name) === norm(m[1]))) { log.push(`Removed duplicate entry "${s.name}" (cast it with a higher slot instead)`); return false; }
      return true;
    });
    for (const s of list) {
      const ref = byName.get(norm(s.name));
      if (ref && s.level !== ref.level) { log.push(`${s.name}: level ${s.level} -> ${ref.level}`); s.level = ref.level; }
      if (s.to_hit && /^\+\d+$/.test(s.to_hit)) s.to_hit = `+${newAtk}`;
      s.notes = bump(s.notes); s.beginner_tip = bump(s.beginner_tip);
    }
    // always-prepared (domain / circle / archetype) spells
    const always = new Set();
    for (const [lv, names] of Object.entries(sub?.spells || {})) if (+lv <= target) for (const n of names) {
      always.add(norm(n));
      if (list.some((s) => norm(s.name) === norm(n))) continue;
      const ref = byName.get(norm(n));
      if (!ref) { review.push(`Always-prepared spell "${n}" is not in the SRD spell data; add it by hand.`); continue; }
      list.push(mk(ref, 'prepared')); log.push(`Added always-prepared spell ${n}`);
    }
    for (const s of list) { const ref = byName.get(norm(s.name)); if (ref && !onList(ref) && !always.has(norm(s.name))) review.push(`${s.name} is not on the ${classKey} spell list (left in place, not counted).`); }
    const valid = (s) => { const ref = byName.get(norm(s.name)); return !ref || onList(ref) || always.has(norm(s.name)); };
    const cant = list.filter((s) => s.level === 0 && valid(s)), lev = list.filter((s) => s.level > 0 && valid(s) && !always.has(norm(s.name)));
    const picks = custom.picks[castKey] || custom.picks[cls] || {};
    const taken = new Set(list.map((s) => norm(s.name)));
    const take = (lvl) => { for (const n of picks[lvl] || []) { const ref = byName.get(norm(n)); if (ref && !taken.has(norm(n)) && onList(ref)) { taken.add(norm(n)); return ref; } } };
    let needC = cantripsWanted - cant.length; const addedC = [];
    while (needC-- > 0) { const r = take('0'); if (!r) break; list.push(mk(r, 'cantrip')); addedC.push(r.name); }
    let needL = known - lev.length; const addedL = []; const maxLvl = Math.max(...slotsNew.map((n, i) => n ? i : 0), 0);
    for (let guard = 0; needL > 0 && guard < 30; guard++) for (let lv = maxLvl; lv >= 1 && needL > 0; lv--) { const r = take(String(lv)); if (r) { list.push(mk(r, prepared ? 'prepared' : 'known')); addedL.push(`${r.name} (${lv})`); needL--; } }
    if (addedC.length) log.push(`Added cantrips: ${addedC.join(', ')} (${cantripsWanted} known at level ${target})`);
    if (addedL.length) log.push(`Added spells: ${addedL.join(', ')} (${known} ${prepared ? 'prepared' : 'known'} at level ${target}, not counting always-prepared)`);
    if (needL > 0) review.push(`Still ${needL} ${prepared ? 'prepared' : 'known'} spell(s) short; pick them by hand.`);
    list.sort((a, b) => a.level - b.level || String(a.name).localeCompare(b.name));
    sc.spells = list;
  } else if (spells.length) review.push(`Has ${spells.length} spells but ${d.class}${d.subclass ? ' / ' + d.subclass : ''} has no spellcasting. Left unchanged (homebrew, feat or multiclass?).`);

  // ---- features
  const abilities = d.abilities && !Array.isArray(d.abilities) ? d.abilities : (d.abilities = {});
  const have = Object.values(abilities).map((a) => norm(a?.label)).filter(Boolean);
  const wanted = [];
  for (const [lv, fs] of Object.entries(custom.classFeatures[cls] || {})) if (+lv <= target) wanted.push(...fs);
  for (const [lv, fs] of Object.entries(sub?.features || {})) if (+lv <= target) wanted.push(...fs);
  for (const f of wanted) {
    if (have.some((h) => h === norm(f.name) || h.startsWith(norm(f.name)))) continue;
    const key = norm(f.name).replace(/ /g, '_');
    abilities[key] = { activation: f.activation || 'none', current: f.max || 1, die: '', effect_desc: f.desc.replace('{SNEAK}', Math.ceil(target / 2)), effect_dice: '', kind: f.kind || 'passive', label: f.name, max: f.max || 1, recharge: f.recharge || 'none', roll_bonus: '', save_dc: 0, save_stat: '' };
    log.push(`Added feature ${f.name}`);
  }
  if (subKey === 'gloomstalker') {
    if (Number(c.initiative_bonus) === M.dex) { c.initiative_bonus = M.dex + M.wis; log.push(`Initiative +${M.dex} -> +${M.dex + M.wis} (Dread Ambusher adds WIS)`); }
    const da = abilities.dread_ambusher; if (da && !/initiative/i.test(da.effect_desc)) da.effect_desc += ` Also add your WIS modifier (+${M.wis}) to initiative rolls.`;
  }
  const minLv = Object.fromEntries(Object.entries(custom.minLevel).map(([k, v]) => [norm(k), v]));
  for (const ab of Object.values(abilities)) { const min = minLv[norm(ab?.label)]; if (min && target < min) review.push(`${ab.label} is a level ${min} feature but this character is level ${target}.`); }
  const man = Object.values(abilities).filter((a) => /^maneuver/i.test(a?.label || '')).length;
  if (man > MANEUVERS(target)) review.push(`Knows ${man} maneuvers; a Battle Master of level ${target} gets ${MANEUVERS(target)}.`);

  // ---- spell and cantrip cards listed under attacks keep their damage dice in step with the level (cantrips scale at 5/11/17)
  for (const a of arr(d.attacks)) {
    const m = /^(.*?)\s*\((cantrip|spell)\)/i.exec(a.name || ''); if (!m) continue;
    const ref = srd.spells.find((x) => norm(x.name) === norm(m[1])); if (!ref) continue;
    const want = ref.level === 0 ? upTo(ref.damage?.damage_at_character_level, target) : null;
    const old = /\d+d\d+/.exec(a.damage || '')?.[0];
    if (want && old && old !== want) { log.push(`${a.name}: damage ${old} -> ${want}`); a.notes = String(a.notes || '').split(old).join(want); a.damage = a.damage.replace(old, want); }
  }

  // ---- saves, skills and passive scores recomputed from the rules (every change is logged).
  // A skill or save counts as proficient when EITHER the flag OR the stored number says so, so real proficiency is never taken away.
  const resilient = /resilient \((str|dex|con|int|wis|cha)\)/i.exec(String(d.origin_feat || '') + ' ' + String(d.text_blocks?.features_traits || ''));
  if (d.saves) {
    const prof = new Set(arr(d.saves.proficient)); if (resilient && !prof.has(resilient[1].toLowerCase())) { prof.add(resilient[1].toLowerCase()); log.push(`${resilient[1].toUpperCase()} saves proficient (Resilient feat)`); }
    const fixes = [];
    for (const a of ABIL) { if (d.saves[a] === M[a] + oldProf) prof.add(a); const want = M[a] + (prof.has(a) ? newProf : 0); if (d.saves[a] !== want) { fixes.push(`${a.toUpperCase()} ${d.saves[a] ?? 'none'}->${want}`); d.saves[a] = want; } }
    d.saves.proficient = ABIL.filter((a) => prof.has(a));
    if (fixes.length) log.push(`Saving throws corrected: ${fixes.join(', ')}`);
  }
  if (d.skills) {
    const fixes = [], joat = cls === 'bard' && target >= 2 ? Math.floor(newProf / 2) : 0;
    for (const sk of srd.skills || []) {
      const key = sk.index.replace(/-/g, '_'), s = d.skills[key]; if (!s) continue;
      const m = M[sk.ability_score.index], b0 = s.bonus;
      const exp = !!s.expertise, pro = exp || !!s.proficient || b0 === m + oldProf;
      const want = m + (exp ? 2 * newProf : pro ? newProf : joat);
      if (b0 !== want || !!s.proficient !== pro || !!s.expertise !== exp) { fixes.push(`${sk.name} ${b0 ?? 'none'}->${want}`); s.bonus = want; s.proficient = pro; s.expertise = exp; }
    }
    if (fixes.length) log.push(`Skills corrected: ${fixes.join(', ')}`);
    for (const [pk, sk] of [['passive_perception', 'perception'], ['passive_insight', 'insight'], ['passive_investigation', 'investigation']]) if (d.senses?.[pk] != null && d.skills[sk] && d.senses[pk] !== 10 + d.skills[sk].bonus) { log.push(`${pk} ${d.senses[pk]}->${10 + d.skills[sk].bonus}`); d.senses[pk] = 10 + d.skills[sk].bonus; }
  }

  // ---- fighting styles that the attack lines forgot (Archery +2 to hit with ranged weapons, Dueling +2 damage with one hand)
  const flavour = String(d.text_blocks?.features_traits || '');
  const reNote = (a, from, to) => { a.notes = String(a.notes || '').split(from).join(to); };
  if (/archery/i.test(flavour)) for (const a of arr(d.attacks)) if (/bow|crossbow/i.test(a.name) && /^\+\d+$/.test(a.to_hit || '')) {
    const want = M.dex + newProf + 2; if (parseInt(a.to_hit, 10) !== want) { reNote(a, `d20${a.to_hit}`, `d20+${want}`); log.push(`${a.name}: to hit ${a.to_hit} -> +${want} (Archery +2)`); a.to_hit = `+${want}`; }
  }
  if (/dueling/i.test(flavour)) for (const a of arr(d.attacks)) if (/1-hand|one-hand/i.test(a.name)) {
    const m = /^(.*\+)(\d+)$/.exec(a.damage || ''); if (m && +m[2] === M.str) { const nd = `${m[1]}${+m[2] + 2}`; reNote(a, a.damage, nd); log.push(`${a.name}: damage ${a.damage} -> ${nd} (Dueling +2)`); a.damage = nd; }
  }

  const changed = Object.keys(d).filter((k) => JSON.stringify(d[k]) !== JSON.stringify(raw[k]));
  return { data: d, changed, log, review, choices, attacks: attacksPerAction({ ...d, level: target }) };
}
