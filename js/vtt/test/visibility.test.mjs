import test from "node:test";
import assert from "node:assert/strict";
import { visibleToPlayer } from "../visibility.js";

const fog = [{ x: 0, y: 0, w: 80, h: 80, open: false }];
test("GM can always see records", () => assert.equal(visibleToPlayer({ x: 20, y: 20, hidden: true }, fog, true), true));
test("hidden records never appear to players", () => assert.equal(visibleToPlayer({ x: 100, y: 100, hidden: true }, [], false), false));
test("fog hides records until their light cell is revealed", () => {
  const record = { x: 20, y: 20 };
  assert.equal(visibleToPlayer(record, fog, false, new Set()), false);
  assert.equal(visibleToPlayer(record, fog, false, new Set(["0,0"])), true);
});
test("open fog does not hide a record", () => assert.equal(visibleToPlayer({ x: 20, y: 20 }, [{ ...fog[0], open: true }], false), true));
