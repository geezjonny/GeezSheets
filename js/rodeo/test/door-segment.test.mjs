import assert from "node:assert/strict";
import { test } from "node:test";
import { segmentDoors } from "../door-segment.js";

test("snaps diagonal input to its dominant axis and computes horizontal doors", () => {
  const s = segmentDoors({ x: 0, y: 0 }, { x: 125, y: 70 });
  assert.equal(s.dir, "h");
  assert.deepEqual([s.x2, s.y2], [125, 0]);
  assert.deepEqual(s.cells, [{ x: 20, y: 0, dir: "h" }, { x: 60, y: 0, dir: "h" }, { x: 100, y: 0, dir: "h" }]);
});

test("vertical segments have one door per cell edge", () => {
  const s = segmentDoors({ x: 80, y: 40 }, { x: 80, y: 160 });
  assert.equal(s.dir, "v");
  assert.deepEqual(s.cells, [{ x: 80, y: 60, dir: "v" }, { x: 80, y: 100, dir: "v" }, { x: 80, y: 140, dir: "v" }]);
});

test("zero length places no doors and reversing preserves the edge count", () => {
  assert.deepEqual(segmentDoors({ x: 40, y: 40 }, { x: 40, y: 40 }).cells, []);
  const s = segmentDoors({ x: 120, y: 0 }, { x: 0, y: 0 });
  assert.equal(s.dir, "h");
  assert.deepEqual(s.cells.map((c) => c.x), [100, 60, 20]);
});
