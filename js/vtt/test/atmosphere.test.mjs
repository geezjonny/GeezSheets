import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

// The feature imports Firebase/browser modules, so load the pure helper section
// directly for a Node-only unit test rather than trying to boot the VTT.
const source = readFileSync(new URL("../atmosphere.js", import.meta.url), "utf8");
const pure = source.slice(source.indexOf("const clamp"), source.indexOf("const clock")).replace("export function tintFor", "function tintFor");
const tintFor = new Function(`${pure}; return tintFor;`)();

test("tintFor gives transparent noon and dark midnight", () => {
  assert.deepEqual(tintFor(12), { r: 0, g: 0, b: 0, a: 0 });
  assert.deepEqual(tintFor(0), { r: 13, g: 24, b: 57, a: .45 });
});

test("tintFor gives a warm dawn transition", () => {
  const c = tintFor(7);
  assert.ok(c.r > c.g && c.g > c.b && c.a > 0);
});
