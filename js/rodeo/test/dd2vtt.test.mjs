import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { parseDD2VTT } from "../dd2vtt.js";

test("parses a minimal Universal VTT map", () => {
  const map = parseDD2VTT({
    resolution: { map_origin: { x: 1, y: 2 }, map_size: { x: 10, y: 12 }, pixels_per_grid: 70 },
    line_of_sight: [[{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }]],
    portals: [{ position: { x: 2.5, y: 2 }, bounds: [{ x: 2, y: 2 }, { x: 3, y: 2 }], closed: false }],
    lights: [{ position: { x: 2, y: 3 }, range: 4, color: "ff8040aa" }, { position: { x: 2, y: 3 }, range: 0 }],
  });
  assert.deepEqual(map.walls, [{ x1: 0, y1: 0, x2: 120, y2: 0 }]);
  assert.equal(map.doors.length, 1);
  assert.deepEqual(map.lights[0], { x: 40, y: 40, radius: 160, color: "#ff8040" });
});

test("sanity-checks available GeezSheets battlemap samples", () => {
  const dir = "C:/Users/jonge/Documents/GitHub/GeezSheets/battlemap";
  const names = ["cavesystem.dd2vtt", "prison_00.dd2vtt"];
  const present = names.filter((name) => existsSync(`${dir}/${name}`));
  if (!present.length) return;
  for (const name of present) {
    const map = parseDD2VTT(JSON.parse(readFileSync(`${dir}/${name}`, "utf8")));
    assert.ok(map.cols >= 1 && map.rows >= 1, name);
    assert.ok(map.walls.length + map.doors.length + map.lights.length > 0, name);
    assert.ok(map.walls.length <= 3000, name);
    console.log(`${name}: walls=${map.walls.length} doors=${map.doors.length} lights=${map.lights.length}`);
  }
});
