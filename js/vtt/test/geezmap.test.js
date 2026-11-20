import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGeezMap } from "../geezmap.js";

const fixture = {
  format: "geezmap", version: 1, name: "Bridge", meta: { size: { x: 4, y: 3 }, floors: [0], floorNames: { "0": "Ground" } },
  floors: { "0": {
    paint: { "0_0": "stone", "1_0": "stone", "2_0": "wood", "0_1": "stone" },
    roofs: { "0_0": "thatch", "1_0": "thatch" },
    walls: { a: { x1: 0, y1: 0, x2: 3, y2: 0, mat: "brick" } },
    doors: { a: { x1: 1, y1: 0, x2: 2, y2: 0, mat: "wood", kind: "window" } },
    lights: { a: { x: 1.5, y: 1.5, range: 3, color: "#ffbb77" } },
    props: { a: { p: "barrel", x: 1.5, y: 1.5 }, b: { p: "dragon", x: 2.5, y: 1.5 } },
  } },
};

test("parses GeezSheets map floors and objects in pixels", () => {
  const map = parseGeezMap(fixture);
  assert.deepEqual(map.floors, [
    { x: 0, y: 0, w: 80, h: 40, mat: "stone", lv: 0 },
    { x: 80, y: 0, w: 40, h: 40, mat: "wood", lv: 0 },
    { x: 0, y: 40, w: 40, h: 40, mat: "stone", lv: 0 },
  ]);
  assert.deepEqual(map.roofs, [{ x: 0, y: 0, w: 80, h: 40, mat: "thatch", lv: 0 }]);
  assert.deepEqual(map.walls[0], { x1: 0, y1: 0, x2: 120, y2: 0, mat: "brick", lv: 0 });
  assert.deepEqual(map.doors[0], { id: "d_a", x: 60, y: 0, dir: "h", state: "closed", kind: "window", doorKind: "window", mat: "wood", lv: 0, win: true });
  assert.deepEqual(map.lights[0], { id: "l_a", x: 60, y: 60, radius: 120, color: "#ffbb77", lv: 0 });
  assert.deepEqual(map.props, [{ kind: "barrel", x: 60, y: 60, lv: 0 }]);
  assert.equal(map.skipped.props, 1);
});

test("rejects a non-GeezSheets map", () => {
  assert.throws(() => parseGeezMap({ format: "dd2vtt" }), /Invalid GeezSheets map/);
});

test("imports puzzle bindings and merged hand fog", () => {
  const map = parseGeezMap({ format: "geezmap", version: 1, meta: { size: { x: 5, y: 2 }, floors: [0] }, floors: { "0": {
    doors: { vault: { x1: 2, y1: 0, x2: 3, y2: 0 } },
    fog: { "0_0": true, "1_0": true, "3_0": true },
    puzzle: {
      objects: { p: { kind: "plate", label: "Plate 1", x: 1.5, y: .5, state: "up" }, out: { kind: "door", ref: "vault" } },
      groups: { unlock: { when: [{ id: "p", state: "down" }], then: [{ id: "out", action: "open" }] } },
    },
  } } });
  assert.equal(map.objects.p.x, 60);
  assert.equal(map.objects.d_vault.kind, "door");
  assert.equal(map.groups.unlock.then[0].id, "d_vault");
  assert.deepEqual(map.fog, [{ x: 0, y: 0, w: 80, h: 40, lv: 0 }, { x: 120, y: 0, w: 40, h: 40, lv: 0 }]);
  assert.equal(map.skipped.refs, 0);
});

test("drops puzzle lines for missing refs", () => {
  const map = parseGeezMap({ format: "geezmap", version: 1, meta: { size: { x: 1, y: 1 }, floors: [0] }, floors: { "0": {
    puzzle: { objects: { x: { kind: "door", ref: "missing" } }, groups: { g: { when: [{ id: "x", state: "open" }], then: [{ id: "x", action: "open" }] } } },
  } } });
  assert.equal(map.skipped.refs, 3);
  assert.deepEqual(map.groups.g, { when: [], then: [], met: false });
});
