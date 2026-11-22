import test from "node:test";
import assert from "node:assert/strict";
import { cellsForHoles, decodeCells, encodeCells, mergeCells } from "../explored.js";

test("explored cells encode as compact row runs and round trip", () => {
  const cells = new Set(["0,0", "1,0", "2,0", "4,0", "2,1"]);
  assert.equal(encodeCells(cells), "v1|0:0-2,4;1:2");
  assert.deepEqual(decodeCells(encodeCells(cells)), cells);
});

test("malformed or negative cells are ignored", () => {
  assert.deepEqual(decodeCells("v1|0:0-2,bad;wat:1;1:3-2"), new Set(["0,0", "1,0", "2,0"]));
  assert.equal(encodeCells(["-1,0", "x,2", "2,3"]).includes("-"), false);
});

test("visibility uses the existing circular light holes", () => {
  assert.deepEqual(cellsForHoles([[20, 20, 1]], 2, 1), new Set(["0,0"]));
  assert.deepEqual(mergeCells(new Set(["0,0"]), new Set(["1,0"])), new Set(["0,0", "1,0"]));
});
