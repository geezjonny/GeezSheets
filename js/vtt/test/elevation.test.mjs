import assert from "node:assert/strict";
import { test } from "node:test";
import { applyElevation } from "../elevation.js";

test("elevation paints an intersecting floor without changing its material or other levels", () => {
  const changes = applyElevation({ a: { x: 0, y: 0, w: 120, h: 40, mat: "stone", lv: 0, elev: 5 }, b: { x: 0, y: 0, w: 40, h: 40, lv: 1 } }, [{ x: 40, y: 0, w: 40, h: 40 }], -10, 0);
  const out = Object.values(Object.fromEntries(Object.entries(changes).map(([k, v]) => [k.split("/").pop(), v])));
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((x) => [x.x, x.w, x.elev || 0]).sort((a, b) => a[0] - b[0]), [[0, 40, 5], [40, 40, -10], [80, 40, 5]]);
  assert.equal(out.find((x) => x.x === 0).mat, "stone");
});
