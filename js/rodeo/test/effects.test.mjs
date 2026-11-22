import test from "node:test";
import assert from "node:assert/strict";
import { activeEffects, damageAdjustment, effectBonuses, effectRemaining, makeEffect, tickEffects } from "../effects.js";

test("duration starts at its initiative round and expires at the next round", () => {
  const e = makeEffect("bless", 1, 3);
  assert.equal(effectRemaining(e, 3), 1);
  assert.equal(effectRemaining(e, 4), 0);
  assert.equal(activeEffects({ effects: [e] }, 4).length, 0);
});
test("bonuses combine and damage uses immunity before vulnerability/resistance", () => {
  const effects = [makeEffect({ name: "A", ac: 2, attack: 1, save: 3 }, null, 1), makeEffect({ name: "Fire", damageResist: ["fire"] }, null, 1)];
  assert.deepEqual(effectBonuses(effects), { ac: 2, attack: 1, save: 3 });
  assert.deepEqual(damageAdjustment(effects, "fire", 9), { amount: 4, reason: "resistant" });
  assert.deepEqual(damageAdjustment([{ damageImmune: ["fire"] }, { damageVuln: ["fire"] }], "fire", 9), { amount: 0, reason: "immune" });
});
test("tickEffects returns only changed tokens and expired names", () => {
  const keep = makeEffect("bless", 2, 1), gone = makeEffect("slow", 1, 1);
  const r = tickEffects({ a: { effects: [keep, gone] }, b: { effects: [makeEffect("haste", null, 1)] } }, 2);
  assert.deepEqual(r.changes.a.map((x) => x.name), ["Bless"]);
  assert.equal(r.changes.b, undefined);
  assert.deepEqual(r.expired.map((x) => x.name), ["Slow"]);
});
