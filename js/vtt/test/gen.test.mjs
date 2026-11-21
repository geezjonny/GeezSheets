import test from "node:test";
import assert from "node:assert/strict";
import { generateDungeon, dungeonCells } from "../gen.js";

const connected = (cells) => {
  const start = cells.values().next().value, seen = new Set([start]), q = [start];
  while (q.length) { const [x, y] = q.pop().split(",").map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = `${x + dx},${y + dy}`; if (cells.has(n) && !seen.has(n)) { seen.add(n); q.push(n); } } }
  return seen.size === cells.size;
};

test("dungeon generation is deterministic for a seed", () => {
  assert.deepEqual(generateDungeon({ width: 30, height: 20, roomCount: 8, seed: "amber" }), generateDungeon({ width: 30, height: 20, roomCount: 8, seed: "amber" }));
  assert.notDeepEqual(generateDungeon({ width: 30, height: 20, roomCount: 8, seed: "amber" }), generateDungeon({ width: 30, height: 20, roomCount: 8, seed: "onyx" }));
});

test("rooms do not overlap and the dungeon is reachable", () => {
  const d = generateDungeon({ width: 36, height: 24, roomCount: 10, seed: 42 });
  for (let i = 0; i < d.rooms.length; i++) for (let j = i + 1; j < d.rooms.length; j++) {
    const a = d.rooms[i], b = d.rooms[j];
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }
  assert.ok(connected(dungeonCells(d)));
});
