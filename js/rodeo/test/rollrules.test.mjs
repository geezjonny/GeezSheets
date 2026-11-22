import test from "node:test";
import assert from "node:assert/strict";
import { rollContext, describeGear, armorProficient } from "../rollrules.js";

const SRD = {
  "chain mail": { name: "Chain Mail", armor_category: "Heavy", armor_class: { base: 16, dex_bonus: false }, str_minimum: 13, stealth_disadvantage: true },
  "leather armor": { name: "Leather Armor", armor_category: "Light", armor_class: { base: 11, dex_bonus: true }, str_minimum: 0, stealth_disadvantage: false },
  shield: { name: "Shield", armor_category: "Shield", armor_class: { base: 2, dex_bonus: false }, str_minimum: 0, stealth_disadvantage: false },
};
const lookup = (n) => SRD[String(n).toLowerCase()] || null;
const fighter = { stats: { str: 16, dex: 10 }, equipped: { armor: "Chain Mail" }, text_blocks: { proficiencies_languages: "Armor: all armor, shields. Weapons: simple, martial." } };
const stealth = { kind: "skill", key: "stealth" };

test("chain mail gives disadvantage on Stealth only", () => {
  const r = rollContext(fighter, stealth, { lookup, skillAbility: "dex" });
  assert.equal(r.mode, "dis"); assert.match(r.dis[0], /Chain Mail/);
  assert.equal(rollContext(fighter, { kind: "skill", key: "athletics" }, { lookup, skillAbility: "str" }).mode, "normal");
});
test("leather armor has no Stealth penalty", () => {
  assert.equal(rollContext({ ...fighter, equipped: { armor: "Leather Armor" } }, stealth, { lookup, skillAbility: "dex" }).mode, "normal");
});
test("no sheet or nothing equipped is a plain roll", () => {
  assert.equal(rollContext(null, stealth, { lookup }).mode, "normal");
  assert.equal(rollContext({ equipped: {} }, stealth, { lookup }).mode, "normal");
});
test("armor the sheet is not trained in gives disadvantage on STR/DEX rolls", () => {
  const wizard = { stats: { str: 8, dex: 14 }, equipped: { armor: "Chain Mail" }, text_blocks: { proficiencies_languages: "Daggers, quarterstaffs" } };
  const r = rollContext(wizard, { kind: "save", key: "dex" }, { lookup });
  assert.equal(r.mode, "dis");
  assert.equal(rollContext(wizard, { kind: "save", key: "wis" }, { lookup }).mode, "normal");
  assert.equal(armorProficient({}, "Heavy"), null);   // no proficiency text: do not guess
});
test("conditions: poisoned on checks, not saves; restrained on DEX saves", () => {
  const p = { equipped: {}, combat: { conditions: ["Poisoned"] } };
  assert.equal(rollContext(p, { kind: "skill", key: "perception" }, { lookup, skillAbility: "wis" }).mode, "dis");
  assert.equal(rollContext(p, { kind: "save", key: "con" }, { lookup }).mode, "normal");
  assert.equal(rollContext({ equipped: {} }, { kind: "save", key: "dex" }, { lookup, tokenConditions: ["restrained"] }).mode, "dis");
});
test("advantage and disadvantage cancel", () => {
  const r = rollContext({ equipped: {}, combat: { conditions: ["Poisoned", "Invisible"] } }, { kind: "init" }, { lookup });
  assert.equal(r.mode, "normal"); assert.equal(r.adv.length, 1); assert.equal(r.dis.length, 1);
});
test("tooltips describe armor and compare STR", () => {
  const t = describeGear("armor", "Chain Mail", { stats: { str: 10 } }, lookup).join(" ");
  assert.match(t, /AC 16/); assert.match(t, /Stealth/); assert.match(t, /speed −10/);
  assert.match(describeGear("helmet", "", {}, lookup)[0], /Nothing/);
});
