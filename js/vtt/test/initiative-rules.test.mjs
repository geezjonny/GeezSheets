import test from "node:test";
import assert from "node:assert/strict";
import { buildInitiative } from "../initiative-rules.js";

const tokens = {
  pc: { label: "Hero", pc: "hero" },
  npc: { label: "Goblin", npc: "goblin", hp: 7 },
  hidden: { label: "Hidden", npc: "hidden", hp: 4, hidden: true, lv: 3 },
};

test("adds every token, including hidden tokens on other levels, and rolls all by default", () => {
  const result = buildInitiative(tokens, {}, "all", (id) => ({ pc: 2, npc: 18, hidden: 9 }[id]));
  assert.deepEqual(Object.keys(result.order), ["pc", "npc", "hidden"]);
  assert.equal(result.order.hidden.init, 9);
  assert.equal(result.first, "npc");
});

test("NPC-only mode leaves PCs waiting for a player roll", () => {
  const result = buildInitiative(tokens, {}, "npcs", () => 14);
  assert.equal(result.order.pc.init, null);
  assert.equal(result.order.npc.init, 14);
  assert.equal(result.first, "npc");
});

test("none mode adds everyone without rolling and preserves existing numbers", () => {
  const result = buildInitiative(tokens, { pc: { init: 20, n: 4 } }, "none", () => 1);
  assert.equal(result.order.pc.init, 20);
  assert.equal(result.order.npc.init, null);
  assert.equal(result.first, "pc");
});
