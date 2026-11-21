// Automatic roll rules: reads a PC's sheet (equipped gear, conditions) plus the SRD and says what a roll should get
// for free: advantage / disadvantage with the reasons. Pure functions (no Firebase, no DOM) so they can be tested.
//
// Sheet data used:  equipped { armor, helmet, shield, main_hand }  (item names; shield is true/false)
//                   combat.conditions [labels]   stats / abilities (STR for armor)   text_blocks.proficiencies_languages
// SRD data used:    data/equipment.json (armor: armor_category, armor_class, str_minimum, stealth_disadvantage)
import { effectBonuses } from "./effects.js";

const asList = (x) => (Array.isArray(x) ? x : x && typeof x === "object" ? Object.values(x) : []);
const lc = (s) => String(s ?? "").trim().toLowerCase();
const statOf = (c, ab) => c?.stats?.[ab] ?? c?.abilities?.[ab]?.score ?? 10;

let srdItems = null, srdLoading = null;   // lowercase name -> SRD equipment entry
export function loadRulesData() {
  return (srdLoading ||= fetch("data/equipment.json").then((r) => r.json()).catch(() => []).then((list) => {
    srdItems = new Map();
    for (const e of list) if (e.name && !srdItems.has(lc(e.name))) srdItems.set(lc(e.name), e);
    return srdItems;
  }));
}
export const srdItem = (name) => srdItems?.get(lc(name)) || null;

/** The SRD entry for a thing worn/held, or null (custom items and magic items have no armor data). */
export const gearOf = (name, lookup = srdItem) => (name ? lookup(name) : null);

/** The equipped list on a sheet, normalised: { helmet, armor, shield (bool), main_hand }. */
export function equippedOf(sheet) {
  const e = sheet?.equipped || {};
  return { helmet: e.helmet || "", armor: e.armor || "", shield: !!e.shield, main_hand: e.main_hand || e.weapon || "" };
}

const ARMOR_WORDS = { Light: "light armor", Medium: "medium armor", Heavy: "heavy armor", Shield: "shield" };
/** Does the sheet's proficiency text cover this armor category? null when the sheet lists no proficiencies (so we do not guess). */
export function armorProficient(sheet, category) {
  const text = lc(sheet?.text_blocks?.proficiencies_languages);
  if (!text.trim()) return null;
  if (/\ball armor\b/.test(text) && category !== "Shield") return true;
  return text.includes(ARMOR_WORDS[category] || "~~");
}

const STR_DEX = new Set(["str", "dex"]);
/** Which ability does this call use? (skills carry theirs in `abil`.) */
export function abilityOfCall(call, skillAbility) {
  if (call.kind === "init") return "dex";
  if (call.kind === "skill") return skillAbility || "";
  if (call.kind === "save" || call.kind === "ability") return call.key;
  return "";
}

/**
 * What the sheet gives this roll for free.
 * @param sheet      the PC sheet (characters/pcs/<id>) or null
 * @param call       { kind: init|save|skill|ability|custom, key }
 * @param opts       { lookup(name) -> SRD entry, skillAbility, tokenConditions: [keys] }
 * @returns {{ adv: string[], dis: string[], notes: string[], mode: "normal"|"adv"|"dis" }}  reasons are short, player-facing
 */
export function rollContext(sheet, call, opts = {}) {
  const lookup = opts.lookup || srdItem, adv = [], dis = [], notes = [];
  const bonuses = effectBonuses(opts.tokenEffects);
  if (!sheet) return { adv, dis, notes, bonuses, mode: "normal" };
  const ab = abilityOfCall(call, opts.skillAbility), isCheck = call.kind === "skill" || call.kind === "ability" || call.kind === "init" || call.kind === "custom";
  const eq = equippedOf(sheet);

  // --- armor & shield -------------------------------------------------------------------
  const armor = gearOf(eq.armor, lookup);
  if (armor?.stealth_disadvantage && call.kind === "skill" && call.key === "stealth") dis.push(`${eq.armor}: noisy armor`);
  const worn = [[eq.armor, armor], eq.shield ? ["Shield", lookup("Shield")] : null].filter(Boolean);
  for (const [nm, g] of worn) {
    if (!g?.armor_category || !STR_DEX.has(ab) || call.kind === "custom") continue;
    if (armorProficient(sheet, g.armor_category) === false) dis.push(`${nm}: not trained in ${ARMOR_WORDS[g.armor_category]}`);
  }
  if (armor?.str_minimum > statOf(sheet, "str") && (call.kind === "skill" || call.kind === "ability") && ab === "str")
    notes.push(`${eq.armor} needs STR ${armor.str_minimum}: speed −10 (not a roll penalty)`);

  // --- conditions (sheet labels + token rings) -------------------------------------------
  const conds = new Set([...asList(sheet?.combat?.conditions), ...asList(opts.tokenConditions)].map(lc));
  if (conds.has("poisoned") && isCheck) dis.push("Poisoned");
  if (conds.has("frightened") && isCheck) dis.push("Frightened");
  if (conds.has("restrained") && call.kind === "save" && ab === "dex") dis.push("Restrained");
  if (conds.has("prone") && call.kind === "save" && ab === "dex") notes.push("Prone: no effect on this save");
  for (const c of ["paralyzed", "stunned", "unconscious", "petrified"])
    if (conds.has(c) && call.kind === "save" && STR_DEX.has(ab)) notes.push(`${c[0].toUpperCase() + c.slice(1)}: automatically fails STR and DEX saves`);
  if (conds.has("invisible") && call.kind === "init") adv.push("Invisible");

  const mode = adv.length && dis.length ? "normal" : dis.length ? "dis" : adv.length ? "adv" : "normal";   // 5e: both cancel out
  if (bonuses.attack) notes.push(`Effects: attack ${bonuses.attack >= 0 ? "+" : ""}${bonuses.attack}`);
  if (bonuses.save) notes.push(`Effects: saves ${bonuses.save >= 0 ? "+" : ""}${bonuses.save}`);
  return { adv, dis, notes, bonuses, mode };
}

/** One-line-per-fact tooltip for an item in an equipment slot. `sheet` lets it compare against the wearer's STR. */
export function describeGear(slot, name, sheet, lookup = srdItem) {
  if (!name) return ["Nothing equipped."];
  const g = lookup(name), out = [];
  if (!g) { out.push(`${name}: not in the SRD, so no automatic effects.`); return out; }
  if (g.armor_category) {
    const ac = g.armor_class;
    if (g.armor_category === "Shield") out.push(`Shield: +${ac?.base ?? 2} AC.`);
    else out.push(`${g.armor_category} armor: AC ${ac?.base}${ac?.dex_bonus ? ` + DEX${ac.max_bonus != null ? " (max +" + ac.max_bonus + ")" : ""}` : ""}.`);
    if (g.stealth_disadvantage) out.push("Disadvantage on Stealth checks (applied automatically in Roll Call).");
    if (g.str_minimum) out.push(sheet && statOf(sheet, "str") < g.str_minimum ? `Needs STR ${g.str_minimum}; wearer has ${statOf(sheet, "str")}, so speed −10.` : `Needs STR ${g.str_minimum}: met.`);
    const prof = armorProficient(sheet, g.armor_category);
    if (prof === false) out.push(`Wearer's sheet does not list ${ARMOR_WORDS[g.armor_category]}: disadvantage on STR and DEX rolls.`);
  } else if (g.weapon_category) {
    const d = g.damage;
    out.push(`${g.category_range || g.weapon_category}: ${d ? `${d.damage_dice} ${d.damage_type?.name || ""}` : "no damage"}${g.two_handed_damage ? ` (${g.two_handed_damage.damage_dice} two-handed)` : ""}.`);
    const props = asList(g.properties).map((p) => p.name).filter(Boolean); if (props.length) out.push(`Properties: ${props.join(", ")}.`);
    if (g.range?.normal) out.push(`Range ${g.range.normal}${g.range.long ? "/" + g.range.long : ""} ft.`);
  } else out.push(...asList(g.desc).slice(0, 2));
  return out;
}
