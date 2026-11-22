import assert from "node:assert/strict";
import test from "node:test";
import { recentTokenRefs, tokenInitials } from "../token-palette.js";

test("token initials are compact and readable", () => {
  assert.equal(tokenInitials("  Red Wizard "), "RW");
  assert.equal(tokenInitials(""), "?");
});

test("recent token refs keep available entries in recent order", () => {
  const available = [{ kind: "pc", id: "a" }, { kind: "npc", id: "b" }];
  assert.deepEqual(recentTokenRefs(["npc:b", "npc:missing", "pc:a", "npc:b"], available), ["npc:b", "pc:a"]);
});
