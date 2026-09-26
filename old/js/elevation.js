// Elevation -- color gradient, flood-fill, smooth height sampling, AND
// Firebase persistence for per-tile terrain elevation, all in one place so
// the data model and its storage can't drift apart from each other (the
// save/load split across map.js and this file is exactly what caused a
// real bug earlier: reads and writes need to live together). The DATA is
// still grid-quantized (one numeric height per "floor,x,y" cell, same key
// convention as tiles/impassable/etc.) -- deliberately simpler than a
// dense per-vertex mesh, matching how this app already models everything
// else, and it's what mapeditor-layers.html's swatch-based painting UI
// produces. What's smooth is the SAMPLING: a grid vertex's height blends
// the (up to 4) cells touching it, and any continuous point bilinearly
// interpolates between its surrounding vertices -- so two adjacent cells
// at different heights read as a continuous ramp between them, not a
// stepped cliff, without needing a richer data model or touching the
// painting UI at all. Building geometry (walls, doors, lights) is
// untouched by any of this; elevation is a terrain/land concept only.
//
// No DOM, no THREE -- everything here is pure data, a CSS color string, or
// a Firebase call, so this drops into a 2D canvas editor
// (mapeditor-layers.html), a 3D renderer, or planner.html equally well.

import { db } from "./firebase.js";
import { ref, set, get } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

/**
 * Writes the full elevation map for one map to Firebase, replacing
 * whatever was there. Pass an empty object (or one with all-zero/no
 * entries) to clear it -- same "empty means delete the node" convention
 * every other save function in this app uses.
 * @param {string} mapName
 * @param {Object<string, number>} elevation - keyed "floor,x,y", in feet.
 */
export async function saveElevation(mapName, elevation) {
  await set(ref(db, `maps/${mapName}/elevation`), Object.keys(elevation).length ? elevation : null);
}

/**
 * One-shot read of a map's saved elevation (not a live subscription --
 * callers that want live updates should use onValue themselves). Returns
 * {} if nothing has ever been saved, never null/undefined, so callers can
 * pass the result straight into sampleElevationFeet/vertexHeightFeet
 * without an extra null-check.
 * @param {string} mapName
 * @returns {Promise<Object<string, number>>}
 */
export async function loadElevationOnce(mapName) {
  const snap = await get(ref(db, `maps/${mapName}/elevation`));
  return snap.val() || {};
}

/**
 * Maps an elevation value (feet, positive = up, negative = down) to a CSS
 * color for a heatmap-style overlay: white at 0, shifting warmer (green
 * through to red) as height increases, cooler/darker blue as it decreases.
 * Same gradient shape as the reference 3D prototype's getElevationColor,
 * just emitted as a CSS hsl() string instead of a THREE.Color, since a 2D
 * canvas context accepts hsl() directly.
 * @param {number} height
 * @returns {string} a CSS color, e.g. "hsl(210, 100%, 40%)" or "#ffffff"
 */
export function getElevationColorCss(height) {
  if (Math.abs(height) < 0.01) return '#ffffff';
  if (height > 0) {
    const hue = Math.max(0, 0.35 - (height / 25) * 0.35) * 360;
    return `hsl(${hue}, 100%, 50%)`;
  }
  const intensity = Math.min(0.5, Math.abs(height) / 15);
  const lightness = (0.5 - intensity * 0.3) * 100;
  return `hsl(198, 100%, ${lightness}%)`;
}

/**
 * Flood-fills outward from (startX, startY) across orthogonally-adjacent
 * cells that share the clicked cell's current elevation (untouched cells
 * count as elevation 0, matching how painted-vs-unpainted works
 * everywhere else in this data model), setting them all to `value`.
 * Capped at maxCells so an accidental fill from a huge untouched (all-0)
 * area can't try to flood an effectively unbounded sparse grid forever.
 * No-ops (returns false, doesn't touch `elevation`) if the start cell is
 * already at `value`.
 * @param {Object<string, number>} elevation - mutated in place.
 * @param {(x:number,y:number)=>string} key - floor-scoped tile-key function, e.g. mapeditor-layers.html's own key(x,y).
 * @param {number} startX
 * @param {number} startY
 * @param {number} value
 * @param {number} [maxCells]
 * @returns {boolean} whether anything was actually changed.
 */
export function bucketFillElevation(elevation, key, startX, startY, value, maxCells = 5000) {
  const startVal = elevation[key(startX, startY)] || 0;
  if (startVal === value) return false;

  const visitedKeys = new Set([key(startX, startY)]);
  const queue = [[startX, startY]];
  let head = 0, changed = false;

  while (head < queue.length && visitedKeys.size <= maxCells) {
    const [x, y] = queue[head++];
    elevation[key(x, y)] = value;
    changed = true;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const nk = key(nx, ny);
      if (visitedKeys.has(nk)) continue;
      const nVal = elevation[nk] || 0;
      if (nVal === startVal) { visitedKeys.add(nk); queue.push([nx, ny]); }
    }
  }
  return changed;
}

// Established convention throughout this app: 1 Three.js world unit = 1
// grid tile = 5ft (see e.g. viewer.html's ruler readout). Elevation
// swatches are entered/labeled in feet, so anything adding an elevation
// offset to a world-space Y position needs this conversion.
export const FEET_PER_WORLD_UNIT = 5;

/** Raw painted value for one grid cell, in feet, no averaging or
 *  interpolation -- exactly what was painted for that cell, exactly what
 *  saveElevation wrote. Unpainted = 0, matching the convention used
 *  everywhere else in this data model. Exported for planner.html's own
 *  use (applying saved data back onto its dense mesh) -- unlike
 *  viewer.html's simple per-cell quads, planner's mesh is dense enough to
 *  represent a real sharp edge directly, so re-smoothing it on load would
 *  destroy an intentional cliff/platform edge that was actually painted
 *  and saved accurately. sampleElevationFeet's smoothing is the right
 *  choice for viewer.html specifically; this is the right choice here. */
export function cellHeightFeet(elevation, floor, cellX, cellY) {
  return elevation[`${floor},${cellX},${cellY}`] || 0;
}

/**
 * Height (feet) at a GRID VERTEX -- the corner point shared by up to 4
 * neighboring cells -- computed as the average of whichever of those
 * cells exist. This is the building block for smooth terrain: a vertex
 * shared by a 0ft cell and a 20ft cell blends to 10ft, so the mesh built
 * from these vertices ramps between them instead of stepping. Two cells
 * that share a corner always compute the identical value for it (same
 * inputs, same average), which is what makes neighboring terrain quads
 * line up with no visible seam.
 * @param {Object<string, number>} elevation - keyed "floor,x,y".
 * @param {number} floor
 * @param {number} vx - vertex grid X (the corner shared by cells vx-1 and vx).
 * @param {number} vy - vertex grid Y (the corner shared by cells vy-1 and vy).
 * @returns {number} feet
 */
export function vertexHeightFeet(elevation, floor, vx, vy) {
  return (
    cellHeightFeet(elevation, floor, vx - 1, vy - 1) +
    cellHeightFeet(elevation, floor, vx, vy - 1) +
    cellHeightFeet(elevation, floor, vx - 1, vy) +
    cellHeightFeet(elevation, floor, vx, vy)
  ) / 4;
}

/**
 * Smoothly interpolated elevation (feet) at any continuous world position
 * (x, y) on a given floor -- bilinear interpolation between the 4 grid
 * vertices surrounding that point (see vertexHeightFeet). Replaces a
 * blocky "floor to the containing cell" lookup with a continuous ramp:
 * walking across a cell boundary between different painted heights now
 * passes through every value in between, rather than jumping at the edge.
 * @param {Object<string, number>} elevation - keyed "floor,x,y", straight from Firebase's maps/{name}/elevation.
 * @param {number} floor
 * @param {number} x
 * @param {number} y
 * @returns {number} feet
 */
export function sampleElevationFeet(elevation, floor, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const h00 = vertexHeightFeet(elevation, floor, x0, y0);
  const h10 = vertexHeightFeet(elevation, floor, x0 + 1, y0);
  const h01 = vertexHeightFeet(elevation, floor, x0, y0 + 1);
  const h11 = vertexHeightFeet(elevation, floor, x0 + 1, y0 + 1);
  const hTop = h00 * (1 - fx) + h10 * fx;
  const hBottom = h01 * (1 - fx) + h11 * fx;
  return hTop * (1 - fy) + hBottom * fy;
}

/**
 * Same smooth sampling as sampleElevationFeet, converted to Three.js world
 * units -- add this directly to a mesh's Y position alongside floorY(floor).
 * @returns {number} world units
 */
export function sampleElevationUnits(elevation, floor, x, y) {
  return sampleElevationFeet(elevation, floor, x, y) / FEET_PER_WORLD_UNIT;
}

/**
 * Whether moving between two cells crosses too steep an elevation change
 * to walk normally -- treated like a wall (blocks movement) rather than a
 * slope you just walk up/down. Samples at each cell's CENTER (not its
 * corner), matching where a token/object actually stands within a cell.
 * Defaults to a 10ft step as "too steep" (two 5ft cells' worth of sudden
 * rise/drop, a reasonable cliff/ledge cutoff); pass a different
 * maxStepFeet for a gentler or stricter threshold.
 * @param {Object<string, number>} elevation
 * @param {number} floor
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 * @param {number} [maxStepFeet]
 * @returns {boolean}
 */
export function isElevationStepBlocked(elevation, floor, fromX, fromY, toX, toY, maxStepFeet = 10) {
  // cellHeightFeet, NOT sampleElevationFeet -- this needs the exact
  // painted value of the two cells actually being stepped between, not a
  // smooth/blended sample. sampleElevationFeet bilinearly interpolates
  // using vertexHeightFeet, which averages in up to 4 NEIGHBORING cells at
  // each corner -- so a step's "measured" height depends on unrelated
  // cells nearby, not just the two cells actually involved. That's what
  // made a 20ft raw difference block inconsistently depending on
  // surrounding terrain, while a 30ft difference (harder to blur below
  // the threshold) blocked reliably. Comparing raw values here fixes that
  // -- the blocking threshold now measures exactly what was painted.
  const fromH = cellHeightFeet(elevation, floor, fromX, fromY);
  const toH = cellHeightFeet(elevation, floor, toX, toY);
  return Math.abs(toH - fromH) > maxStepFeet;
}
