import assert from "node:assert/strict";
import { test } from "node:test";
import { exportGeezMap, sceneId } from "../geezmap-export.js";
import { parseGeezMap } from "../geezmap.js";
import { parseDD2VTT } from "../dd2vtt.js";

const state = {
  name: "Test Tavern",
  map: { size: { cols: 10, rows: 8 }, levelNames: { 0: "Ground", 1: "Loft" },
    floors: { a: { x: 40, y: 40, w: 160, h: 80, mat: "wood", lv: 0 }, b: { x: 40, y: 40, w: 80, h: 40, mat: "stone", lv: 1, elev: 1 } },
    walls: { a: { x1: 40, y1: 40, x2: 200, y2: 40, mat: "brick", lv: 0 }, b: { x1: 40, y1: 120, x2: 200, y2: 120, lv: 0 } },
    roofs: { r: { x: 40, y: 40, w: 80, h: 80, mat: "thatch", lv: 0 } },
    props: { p1: { kind: "table", x: 100, y: 100, lv: 0 }, p2: { kind: "stairs", x: 60, y: 60, w: 40, h: 80, to: 1, lv: 0 }, p3: { kind: "decal_blood_splatter", x: 80, y: 80, lv: 0 } },
    labels: { l: { x: 80, y: 20, text: "Goose", lv: 0 } } },
  objects: { d1: { kind: "door", x: 100, y: 40, dir: "h", state: "closed", doorKind: "wood", lv: 0 }, d2: { kind: "door", x: 120, y: 120, dir: "h", doorKind: "double", lv: 0 }, d3: { kind: "door", x: 40, y: 100, dir: "v", doorKind: "window", lv: 0 },
    l1: { kind: "light", x: 100, y: 80, radius: 160, color: "#ffbb77", lv: 0 } },
  atmosphere: { time: 23, weather: "rain" },
};

test("export is a geezmap and a dd2vtt at once", () => {
  const j = exportGeezMap(state, { imageBase64: "" });
  assert.equal(j.format, "geezmap");
  assert.deepEqual(j.meta.floors, [0, 1]);
  assert.equal(j.meta.time, "night");
  assert.equal(j.meta.weather.kind, "Rain");
  assert.equal(j.resolution.map_size.x, 10);
  assert.equal(j.line_of_sight.length, 2);
  assert.equal(j.portals.length, 3);
  assert.equal(j.lights.length, 1);
  assert.equal(j.lights[0].color, "ffbb77ff");
});

test("GeezSheets parseGeezMap reads it with nothing skipped", () => {
  const p = parseGeezMap(exportGeezMap(state));
  assert.equal(p.cols, 10); assert.equal(p.rows, 8);
  assert.equal(p.skipped.props, 0);
  assert.equal(p.walls.length, 2);
  assert.equal(p.lights.length, 1);
  assert.ok(p.doors.length >= 3);
  assert.ok(p.floors.length >= 1 && p.roofs.length >= 1);
  assert.ok(p.props.some((x) => x.kind === "stairs" && x.to === 1));
  assert.ok(p.props.some((x) => x.kind === "decal_blood_splatter"));
  assert.equal(p.labels.length, 1);
  assert.deepEqual(p.floorKeys, ["0", "1"]);
});

test("GeezSheets parseDD2VTT reads the same file", () => {
  const p = parseDD2VTT(exportGeezMap(state));
  assert.equal(p.cols, 10); assert.equal(p.rows, 8);
  assert.equal(p.walls.length, 2);
  assert.ok(p.doors.length >= 2);
  assert.equal(p.lights.length, 1);
});

test("scene id", () => assert.equal(sceneId("The Gilded Goose!"), "the-gilded-goose"));
