import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Load the browser ES module without requiring a package.json or Node module flags.
const source = await readFile(new URL('../js/build-tools.js', import.meta.url), 'utf8');
const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { ROOM_THEMES, rectCells, brushCells, strokeCells, floodFill, outline, gridWall, rectWalls,
    unitEdges, addWalls, eraseWalls, cutDoor, wallUp, buildRoom, knockDown } = api;
let checks = 0, serial = 0;
const key = () => `new${++serial}`;
const s = (x1, y1, x2, y2, mat = 'stone') => ({ x1, y1, x2, y2, mat });
const edges = (segs) => new Set(segs.flatMap(unitEdges));
const wallEdges = (walls) => edges(Object.values(walls));
function test(name, fn) {
    fn(); checks++; console.log(`ok ${checks} - ${name}`);
}
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}

test('exact public API and all room themes', () => {
    assert.equal(Object.keys(api).length, 15);
    assert.equal(ROOM_THEMES.length, 16);
    assert.equal(new Set(ROOM_THEMES.map((t) => t.id)).size, 16);
    const floors = 'grass dirt mud sand wood stone cobble tile marble water shallow ice snow lava swamp carpet bone void gravel moss'.split(' ');
    for (const t of ROOM_THEMES) {
        assert.ok(floors.includes(t.floor));
        assert.ok(['stone', 'brick', 'wood', 'hedge', 'earth'].includes(t.wall));
    }
});
test('inclusive rectangles support reverse and negative coordinates', () => {
    assert.deepEqual(rectCells({ x: 1, y: 1 }, { x: 0, y: 0 }), ['0_0', '0_1', '1_0', '1_1']);
    assert.deepEqual(rectCells('-1_2', '-1_2'), ['-1_2']);
});
test('brush sizes match Godot centering and clamp to 1–5', () => {
    assert.deepEqual(brushCells(0, 0, 1), ['0_0']);
    assert.deepEqual(brushCells(0, 0, 2), rectCells([0, 0], [1, 1]));
    assert.deepEqual(brushCells(0, 0, 4), rectCells([-1, -1], [2, 2]));
    assert.equal(brushCells(0, 0, 99).length, 25);
});
test('strokes include endpoints, deduplicate footprints, and round negative ties like Godot', () => {
    assert.deepEqual(strokeCells([0, 0], [2, 1], 1), ['0_0', '1_1', '2_1']);
    assert.deepEqual(strokeCells([0, 0], [-2, -1], 1), ['0_0', '-1_-1', '-2_-1']);
    assert.equal(strokeCells([0, 0], [2, 0], 2).length, 8);
    assert.equal(strokeCells([1, 1], [1, 1], 3).length, 9);
});
test('flood fill respects connectivity, missing floors, bounds, and atomic limits', () => {
    const paint = freeze({ '0_0': 'wood', '1_1': 'wood' }), bounds = { cols: 3, rows: 3 };
    assert.deepEqual(floodFill(paint, [0, 0], bounds), ['0_0']);
    assert.equal(floodFill(paint, [2, 2], bounds).length, 7);
    assert.equal(floodFill({}, [0, 0], bounds, 8), null);
    assert.equal(floodFill({}, [0, 0], bounds, 9).length, 9);
    assert.equal(floodFill({}, [0, 0], bounds, 0), null);
    assert.deepEqual(floodFill({}, [-1, 0], bounds), []);
    assert.equal(floodFill({}, [0, 0], { cols: 71, rows: 71 }), null);
});
test('outlines merge rectangles, L shapes, disconnected cells, and hole boundaries', () => {
    assert.equal(outline(rectCells([0, 0], [2, 1])).length, 4);
    const l = ['0_0', '0_1', '1_1'];
    assert.equal(outline(l).length, 6);
    assert.equal(edges(outline(l)).size, 8);
    const ring = rectCells([0, 0], [2, 2]).filter((c) => c !== '1_1');
    assert.equal(outline(ring).length, 8);
    assert.equal(edges(outline(ring)).size, 16);
    assert.equal(outline(['0_0', '2_2']).length, 8);
    assert.deepEqual(outline([]), []);
});
test('wall lines snap and use the starting dominant axis; rectangles use grid vertices', () => {
    assert.deepEqual(gridWall([0.2, 1.2], [3.2, 2.1]), [{ x1: 0, y1: 1, x2: 3, y2: 1 }]);
    assert.deepEqual(gridWall([2, 4], [1, 0]), [{ x1: 2, y1: 0, x2: 2, y2: 4 }]);
    assert.equal(gridWall([0, 0], [2, 2])[0].y2, 0);
    assert.deepEqual(gridWall([0, 0], [0, 0]), []);
    assert.equal(rectWalls([3, 2], [0, 0]).length, 4);
    assert.equal(edges(rectWalls([3, 2], [0, 0])).size, 10);
    assert.equal(rectWalls([0, 0], [0, 3]).length, 1);
});
test('unit edges normalize reversed segments and reject non-grid geometry', () => {
    assert.deepEqual(unitEdges(s(2, 0, 0, 0)), ['0,0,1,0', '1,0,2,0']);
    assert.deepEqual(unitEdges(s(0, 1, 0, -1)), ['0,-1,0,0', '0,0,0,1']);
    for (const seg of [s(0, 0, 1, 1), s(0.5, 0, 2, 0), s(0, 0, 0, 0)]) assert.deepEqual(unitEdges(seg), []);
});
test('wall addition skips coverage, merges matching materials, and preserves arbitrary walls', () => {
    const walls = freeze({ a: s(0, 0, 2, 0), diagonal: s(0, 0, 3, 3), fractional: s(0.5, 1, 2, 1) });
    const result = addWalls(walls, [s(1, 0, 4, 0), s(3, 0, 4, 0)], 'stone', key);
    assert.equal(result.added, 2);
    assert.deepEqual(result.walls.a, s(0, 0, 4, 0));
    assert.deepEqual(result.walls.diagonal, walls.diagonal);
    assert.notEqual(result.walls.diagonal, walls.diagonal);
    assert.equal(addWalls(walls, [s(0, 0, 2, 0)], 'wood', key).added, 0);
    assert.equal(Object.keys(addWalls(walls, [s(2, 0, 3, 0)], 'wood', key).walls).length, 4);
});
test('erase splits long walls with collision-safe ids and leaves arbitrary walls untouched', () => {
    const walls = freeze({ a: s(0, 0, 6, 0), 'a~1': s(0, 3, 2, 3, 'wood'), d: s(0, 0, 3, 3) });
    const result = eraseWalls(walls, [s(2, 0, 4, 0)]);
    assert.equal(result.removed, 2);
    assert.deepEqual(wallEdges(result.walls), new Set(['0,0,1,0', '1,0,2,0', '4,0,5,0', '5,0,6,0', '0,3,1,3', '1,3,2,3']));
    assert.deepEqual(result.walls['a~1'], walls['a~1']);
    assert.deepEqual(result.walls.d, walls.d);
    assert.equal(eraseWalls(walls, [s(0, 0, 6, 0)]).removed, 6);
});
test('door cutting splits a long wall and walling up merges it again', () => {
    const walls = freeze({ a: s(0, 0, 8, 0) }), doors = freeze({});
    const result = cutDoor(walls, doors, [3.5, 0.4], 'stone', key);
    assert.deepEqual(result.door, s(3, 0, 4, 0));
    assert.equal(wallEdges(result.walls).size, 7);
    assert.equal(Object.keys(result.walls).length, 2);
    const restored = wallUp(result.walls, result.doors, [3.5, 0], 'stone', key);
    assert.deepEqual(Object.values(restored.walls), [s(0, 0, 8, 0)]);
    assert.deepEqual(restored.doors, {});
    assert.equal(cutDoor(walls, doors, [2, 0.51], 'wood', key), null);
    assert.equal(wallUp(walls, doors, [2, 0], 'stone', key), null);
    assert.equal(unitEdges(cutDoor(walls, doors, [0.1, 0], 'wood', key, 3).door).length, 3);
    assert.equal(unitEdges(cutDoor(walls, doors, [7.9, 0], 'wood', key, 20).door).length, 8);
    assert.equal(cutDoor(walls, { d: s(3, 0, 4, 0) }, [3.5, 0], 'wood', key), null);
    assert.ok(cutDoor({ v: s(2, 0, 2, 5) }, {}, [2.5, 2.5], 'wood', key));
});
const bounds = { cols: 20, rows: 20 };
const options = (extra = {}) => ({ floor: 'wood', wall: 'stone', paint: {}, walls: {}, doors: {}, bounds, newKey: key, ...extra });
test('L-shaped rooms and holes paint exactly their cells and enclose their outlines', () => {
    for (const cells of [['0_0', '0_1', '1_1'], rectCells([0, 0], [2, 2]).filter((c) => c !== '1_1')]) {
        const result = buildRoom(cells, options({ door: false }));
        assert.equal(Object.keys(result.paint).length, cells.length);
        assert.deepEqual(wallEdges(result.walls), edges(outline(cells)));
        assert.equal(result.door, null);
    }
});
test('adjacent rooms merge shared walls and doors; internal walls disappear', () => {
    const first = buildRoom(rectCells([1, 1], [2, 2]), options({ door: false }));
    const second = buildRoom(rectCells([3, 1], [4, 2]), options({ ...first, door: false }));
    assert.deepEqual(wallEdges(second.walls), edges(outline(rectCells([1, 1], [4, 2]))));
    const withDoor = cutDoor(first.walls, {}, [3, 1.5], 'stone', key);
    const merged = buildRoom(rectCells([3, 1], [4, 2]), options({ paint: first.paint, walls: withDoor.walls, doors: withDoor.doors, door: false }));
    assert.deepEqual(merged.doors, {});
    const internal = buildRoom(['1_1', '2_1'], options({ walls: { a: s(2, 1, 2, 2) }, door: false }));
    assert.ok(!wallEdges(internal.walls).has('2,1,2,2'));
});
test('room door favors ground, otherwise longest run, and never the shared wall', () => {
    const cells = rectCells([2, 2], [5, 3]);
    const result = buildRoom(cells, options({ paint: { '1_2': 'grass', '1_3': 'grass' } }));
    assert.equal(result.door.x1, 2); assert.equal(result.door.x2, 2);
    const empty = buildRoom(cells, options());
    assert.equal(empty.door.y1, 4);
    const adjacent = buildRoom(['2_2'], options({ paint: { '1_2': 'wood' }, walls: { a: s(2, 2, 2, 3) } }));
    assert.ok(!unitEdges(adjacent.door).includes('2,2,2,3'));
    const clipped = buildRoom(['-1_0', '0_0', '20_0'], options({ door: false }));
    assert.deepEqual(clipped.paint, { '0_0': 'wood' });
});
test('knock down removes bordering and internal grid geometry, preserving distant and arbitrary pieces', () => {
    const result = knockDown(['1_1'], {
        paint: { '1_1': 'wood', '3_3': 'tile' },
        walls: { a: s(0, 1, 4, 1), d: s(0, 0, 4, 4) }, doors: { a: s(1, 2, 2, 2), b: s(8, 8, 9, 8) }
    });
    assert.deepEqual(result.paint, { '3_3': 'tile' });
    assert.equal(wallEdges(result.walls).size, 3);
    assert.deepEqual(result.walls.d, s(0, 0, 4, 4));
    assert.deepEqual(Object.keys(result.doors), ['b']);
});
test('all mutating APIs accept deeply frozen inputs and return detached map records', () => {
    const input = freeze({ paint: { '5_5': 'tile' }, walls: { a: s(9, 9, 10, 9) }, doors: { d: s(8, 8, 9, 8) } });
    const before = JSON.stringify(input), cells = freeze(['1_1', '1_2']);
    const built = buildRoom(cells, options(input));
    const knocked = knockDown(cells, input);
    for (const result of [built, knocked]) {
        assert.notEqual(result.paint, input.paint);
        assert.notEqual(result.walls.a, input.walls.a);
        assert.notEqual(result.doors.d, input.doors.d);
    }
    assert.equal(JSON.stringify(input), before);
});
console.log(`Passed ${checks} build-tools tests.`);
