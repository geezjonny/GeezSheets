import test from "node:test";
import assert from "node:assert/strict";
import { planReplace } from "../replace.js";

const state = () => ({ level: 0, selected: new Set(["w1", "p1"]), map: {
  walls: { w1: { mat: "stone", lv: 0 }, w2: { mat: "stone", lv: 1 }, w3: { mat: "brick", lv: 0 } },
  floors: { f1: { mat: "grass", lv: 0 } }, roofs: { r1: { mat: "stone", lv: 0 } },
  props: { p1: { kind: "table", lv: 0 }, p2: { kind: "decal_moss", lv: 0 }, p3: { kind: "stairs", lv: 0 } },
}, objects: { d1: { kind: "door", doorKind: "wood", win: false, lv: 0, dir: "h" }, d2: { kind: "door", doorKind: "window", win: true, lv: 0 }, l1: { kind: "light", color: "#ffb347", lv: 0 } } });

test("plans wall, floor, roof and light replacements", () => {
  const s = state();
  assert.equal(planReplace(s, { category: "wall", from: "stone", to: "brick" }).count, 1);
  assert.deepEqual(planReplace(s, { category: "floor", from: "grass", to: "cobble" }).changes, { "map/floors/f1/mat": "cobble" });
  assert.deepEqual(planReplace(s, { category: "roof", from: "stone", to: "slate" }).changes, { "map/roofs/r1/mat": "slate" });
  assert.deepEqual(planReplace(s, { category: "light", from: "#ffb347", to: "#ffe9a8" }).changes, { "objects/l1/color": "#ffe9a8" });
});
test("supports all levels, skips equal values, and keeps door window flag consistent", () => {
  const s = state();
  assert.equal(planReplace(s, { category: "wall", from: "stone", to: "brick", scope: "all" }).count, 2);
  assert.deepEqual(planReplace(s, { category: "door", from: "wood", to: "window" }).changes, { "objects/d1/doorKind": "window", "objects/d1/win": true });
  assert.deepEqual(planReplace(s, { category: "door", from: "window", to: "iron" }).changes, { "objects/d2/doorKind": "iron", "objects/d2/win": false });
  assert.equal(planReplace(s, { category: "wall", from: "brick", to: "brick" }).count, 0);
});
test("prop replacement stays within the prop family", () => {
  const s = state();
  assert.deepEqual(planReplace(s, { category: "prop", from: "*", to: "bench", scope: "all" }).changes, { "map/props/p1/kind": "bench" });
  assert.deepEqual(planReplace(s, { category: "prop", from: "*", to: "decal_cracks", scope: "all" }).changes, { "map/props/p2/kind": "decal_cracks" });
  assert.deepEqual(planReplace(s, { category: "prop", from: "stairs", to: "ladder" }).changes, { "map/props/p3/kind": "ladder" });
});
test("selected scope only changes selected ids", () => {
  const s = state();
  assert.deepEqual(planReplace(s, { category: "wall", from: "*", to: "marble", scope: "selected" }).changes, { "map/walls/w1/mat": "marble" });
});
