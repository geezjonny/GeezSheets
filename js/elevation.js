// Elevation -- color gradient and flood-fill for per-tile terrain
// elevation. This is grid-quantized (one numeric height per "floor,x,y"
// cell, same key convention as tiles/impassable/etc.) rather than a
// continuous per-vertex height field -- deliberately simpler, matching how
// this app already models everything else. Building geometry (walls,
// doors, lights) is untouched by any of this; elevation is a terrain/land
// concept only.
//
// No DOM, no THREE, no Firebase -- pure data and a CSS color string, so
// this drops into a 2D canvas editor (mapeditor-layers.html) or a 3D
// renderer equally well.

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

/**
 * Looks up the painted elevation (in feet) for whichever grid cell
 * contains world position (x, y) on a given floor -- floors to the
 * containing cell (blocky/stepped terrain, not smoothly interpolated
 * between cells), matching how the terrain itself renders. Untouched
 * cells are 0, matching the "unpainted = 0" convention used everywhere
 * else in this data model. Takes floor/x/y directly (not a caller-
 * supplied key() closure like bucketFillElevation above) because 3D
 * renderers look up arbitrary (floor, x, y) combinations rather than
 * always querying "the current floor" the way the 2D editor does.
 * @param {Object<string, number>} elevation - keyed "floor,x,y", straight from Firebase's maps/{name}/elevation.
 * @param {number} floor
 * @param {number} x
 * @param {number} y
 * @returns {number} feet
 */
export function sampleElevationFeet(elevation, floor, x, y) {
  return elevation[`${floor},${Math.floor(x)},${Math.floor(y)}`] || 0;
}

/**
 * Same lookup as sampleElevationFeet, converted to Three.js world units --
 * add this directly to a mesh's Y position alongside floorY(floor).
 * @returns {number} world units
 */
export function sampleElevationUnits(elevation, floor, x, y) {
  return sampleElevationFeet(elevation, floor, x, y) / FEET_PER_WORLD_UNIT;
}

/**
 * Whether moving between two adjacent cells crosses too steep an
 * elevation change to walk normally -- treated like a wall (blocks
 * movement) rather than a slope you just walk up/down. Defaults to a
 * 10ft step as "too steep" (two 5ft cells' worth of sudden rise/drop, a
 * reasonable cliff/ledge cutoff); pass a different maxStepFeet for a
 * gentler or stricter threshold.
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
  const fromH = sampleElevationFeet(elevation, floor, fromX, fromY);
  const toH = sampleElevationFeet(elevation, floor, toX, toY);
  return Math.abs(toH - fromH) > maxStepFeet;
}
