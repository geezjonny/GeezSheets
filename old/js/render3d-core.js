// 3D Core Utilities -- small, pure, stateless helpers shared by every
// render3d-*.js module (materials, tiles, geometry, tokens, props, camera).
// Extracted from viewer.html. No THREE dependency except setFloorLayer,
// which only calls methods on objects passed in -- doesn't construct
// anything itself.

/**
 * Vertical offset for a given floor number. WALL_HEIGHT defaults to 2,
 * matching the existing 10ft-per-floor convention (gm.html/js/geometry.js's
 * own wall height) -- pass a different value only if a renderer is using a
 * different scale.
 * @param {number} [wallHeight]
 * @returns {(floor: number) => number}
 */
export function createFloorY(wallHeight = 2) {
  return function floorY(floor) { return (floor || 0) * wallHeight; };
}

// Three.js supports layers 0-31. Floors are typically small integers
// (basements can go negative), so +16 keeps any realistic floor number in
// range without floors needing to know about this offset at all -- it's
// purely a rendering-visibility mechanism, for showing only one floor at a
// time instead of every floor stacked on top of each other (e.g. a future
// top-down or per-floor camera mode). Layer 0 is intentionally never used
// by any real floor (floor -16 would collide with it) so it stays free for
// anything that should always render regardless of camera.layers.
export function layerForFloor(floor) { return Math.max(1, Math.min(31, (floor || 0) + 16)); }

/**
 * Tags an object AND every descendant with a floor's layer -- layers are
 * NOT inherited from parent to child in Three.js, so a Group with untagged
 * children would still render on layer 0 regardless of what the group
 * itself is set to.
 * @param {THREE.Object3D} object
 * @param {number} floor
 */
export function setFloorLayer(object, floor) {
  const layer = layerForFloor(floor);
  object.traverse(o => o.layers.set(layer));
}

// mapeditor-layers.html writes tile keys as "floor,x,y" (was "x,y") so
// painted terrain can be tagged per-floor -- old keys are still valid
// 2-part strings, implicitly floor 0, so this stays backward compatible
// with any tiles saved before floors existed. Also used for triggerNodes
// keys, which follow the same "floor,x,y" convention.
export function parseTileKey(k) {
  const parts = k.split(',').map(Number);
  return parts.length >= 3 ? { floor: parts[0], x: parts[1], y: parts[2] } : { floor: 0, x: parts[0], y: parts[1] };
}

// True if segment (x1,y1)-(x2,y2) crosses segment (x3,y3)-(x4,y4).
// Standard orientation-based test; used for wall/door collision (movement
// blocking) and the ruler tool.
export function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d1 = (x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3);
  const d2 = (x4 - x3) * (y2 - y3) - (y4 - y3) * (x2 - x3);
  const d3 = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  const d4 = (x2 - x1) * (y4 - y1) - (y2 - y1) * (x4 - x1);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
