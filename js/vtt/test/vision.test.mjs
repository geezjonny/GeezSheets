import test from "node:test";
import assert from "node:assert/strict";
import { blockingSegments, polygonPath, unionPaths, visibilityPolygon } from "../vision.js";

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

test("open room stays within the radius boundary", () => {
  const poly = visibilityPolygon({ x: 0, y: 0 }, 10, [[-20, -20, -20, 20], [20, -20, 20, 20]]);
  assert.ok(poly.length > 0);
  assert.ok(poly.every(p => Math.hypot(p.x, p.y) <= 10 + 1e-8));
});

test("a wall hides the point behind it", () => {
  const poly = visibilityPolygon({ x: 0, y: 0 }, 10, [[4, -10, 4, 10]]);
  assert.equal(inside(poly, 8, 0), false);
  assert.equal(inside(poly, 2, 0), true);
});

test("an open door leaves a gap", () => {
  const walls = { wall: { x1: 4, y1: -10, x2: 4, y2: 10 } };
  const doors = [{ x: 4, y: 0, dir: "v", state: "open" }];
  const poly = visibilityPolygon({ x: 0, y: 0 }, 10, blockingSegments(walls, doors, w => [[w.x1, w.y1, w.x2, -20], [w.x1, 20, w.x2, w.y2]]));
  assert.equal(inside(poly, 8, 0), true);
});

test("door kinds have their sight rules", () => {
  const wall = { wall: { x1: 4, y1: -10, x2: 4, y2: 10 } };
  const open = (kind) => visibilityPolygon({ x: 0, y: 0 }, 10, blockingSegments(wall, [{ x: 4, y: 0, dir: "v", state: "closed", kind }], w => [[w.x1, w.y1, w.x2, -20], [w.x1, 20, w.x2, w.y2]]));
  assert.equal(inside(open("bars"), 8, 0), true);
  assert.equal(inside(open("portcullis"), 8, 0), true);
  assert.equal(inside(open("arch"), 8, 0), true);
  assert.equal(inside(open("window"), 8, 0), true);
  assert.equal(inside(open("curtain"), 8, 0), false);
});

test("radius clamps all points", () => {
  const poly = visibilityPolygon({ x: 5, y: 7 }, 3, [[5, -100, 5, 100]]);
  assert.ok(poly.every(p => Math.hypot(p.x - 5, p.y - 7) <= 3 + 1e-8));
});

test("degenerate inputs and path helpers do not throw", () => {
  assert.deepEqual(visibilityPolygon({ x: 0, y: 0 }, 0, [[0, 0, 0, 0], null]), []);
  assert.doesNotThrow(() => visibilityPolygon({ x: 0, y: 0 }, 5, [[0, 0, 0, 0], [NaN, 0, 1, 1]]));
  assert.equal(polygonPath([]), "");
  assert.equal(unionPaths([[], [{ x: 1, y: 2 }]]), "M 1.0 2.0 Z");
});

test("300 segments are handled quickly", () => {
  const segments = Array.from({ length: 300 }, (_, i) => [20 + i % 30, -100 + i * 0.7, 20 + i % 30, -99 + i * 0.7]);
  const start = performance.now();
  visibilityPolygon({ x: 0, y: 0 }, 100, segments);
  assert.ok(performance.now() - start < 100, "visibility sweep took unexpectedly long");
});
