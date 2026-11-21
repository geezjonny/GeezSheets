import test from "node:test";
import assert from "node:assert/strict";
import { boundsOf, canChangeAnnotation, isExpired, normalizeAnnotation, serializeAnnotation, visibleAnnotations } from "../annotation-geometry.js";

test("annotation serialization normalizes points and safe defaults", () => {
  const a = serializeAnnotation({ type: "line", pts: [{ x: "10", y: 20 }], color: "bad", by: "Ada", t: 4 });
  assert.deepEqual(a, { type: "line", pts: [{ x: 10, y: 20 }], color: "#a94c3d", by: "Ada", t: 4 });
});

test("bounds and expiry are deterministic", () => {
  assert.deepEqual(boundsOf({ pts: [{ x: 5, y: 8 }, { x: -2, y: 20 }] }), { minX: -2, minY: 8, maxX: 5, maxY: 20 });
  assert.equal(isExpired({ t: 1000 }, 61000), true);
  assert.equal(isExpired({ t: 1000, pinned: true }, 61000), false);
  assert.deepEqual(Object.keys(visibleAnnotations({ a: { t: 0 }, b: { t: 0, pinned: true } }, 60000)), ["b"]);
});

test("creator or GM may change an annotation", () => {
  const a = normalizeAnnotation({ by: "Ada" });
  assert.equal(canChangeAnnotation(a, "Ada"), true);
  assert.equal(canChangeAnnotation(a, "Bob"), false);
  assert.equal(canChangeAnnotation(a, "Bob", true), true);
});
