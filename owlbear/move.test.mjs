// node owlbear/move.test.mjs
import assert from 'node:assert/strict';
import { reach, feet, plain } from './move.js';

const D = 100, at = (i, j) => ({ x: i * D, y: j * D });   // grid corners
// open floor, 2 squares: a 5×5 block
assert.equal(reach({ i: 0, j: 0 }, 2, D, []).length, 25);
// a wall along x = 1 (between columns 0 and 1), long enough to stop everything going right
const wall = [[at(1, -5), at(1, 5)]];
const r = reach({ i: 0, j: 0 }, 2, D, wall);
assert.ok(r.every(([i]) => i <= 0), 'nothing past the wall');
assert.equal(r.length, 15);
// an L corner at (1,1): the diagonal from (0,0) to (1,1) touches the corner and is blocked
const L = [[at(1, 0), at(1, 1)], [at(1, 1), at(2, 1)]];
assert.ok(!reach({ i: 0, j: 0 }, 1, D, L).some(([i, j]) => i === 1 && j === 1));
// speeds and names
assert.equal(feet('30'), 30); assert.equal(feet({ walk: '40 ft.', fly: '80 ft.' }), 40); assert.equal(feet(undefined), 0);
assert.equal(plain('Goblin #2'), 'goblin'); assert.equal(plain('Merlin'), 'merlin');
console.log('move.js ok');
