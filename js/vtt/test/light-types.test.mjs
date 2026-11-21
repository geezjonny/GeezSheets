import assert from "node:assert/strict";
import { test } from "node:test";
import { LIGHT_MATS, clampIntensity, lightIntensity, lightSettings } from "../light-types.js";

test("light palette has unique ids, valid colours, and sensible defaults", () => {
  assert.equal(new Set(LIGHT_MATS.map((x) => x.id)).size, LIGHT_MATS.length);
  for (const light of LIGHT_MATS) {
    assert.match(light.color, /^#[0-9a-f]{6}$/i);
    assert.ok(light.radius >= 1 && light.radius <= 12);
    assert.ok(light.fog >= 0 && light.fog <= 12);
  }
});

test("light intensity defaults and clamps", () => {
  assert.equal(clampIntensity(undefined), 1);
  assert.equal(clampIntensity(.1), .2);
  assert.equal(clampIntensity(2), 1.5);
  assert.equal(lightIntensity({}), 1);
  assert.deepEqual(lightSettings({ radius: 99, fog: -1, intensity: 0 }), { radius: 12, fog: 0, intensity: .2 });
});
