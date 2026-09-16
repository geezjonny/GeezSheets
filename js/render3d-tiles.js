// 3D Terrain Tiles -- renders painted terrain cells (and elevation-only
// cells with no terrain painted) as tilted quads whose 4 corners sit at
// smoothly-blended grid-vertex heights, tagged per-floor. Neighboring
// cells share the exact same corner-height calculation, so adjacent quads
// line up with no visible seam -- elevation reads as a continuous ramp
// between different painted heights, not a stepped cliff. Any cell with
// elevation also gets "skirt" walls around its edges, extending down to a
// shared baseline well below any floor's ground level -- without these,
// raised/lowered terrain has nothing underneath it, leaving a visible gap
// you can see straight through wherever it doesn't border more painted
// terrain (most commonly where it meets a flat background image, which
// this app doesn't deform). Extracted from viewer.html's rebuildTiles.
//
// REQUIRES THREE as a global (see render3d-materials.js's header for the
// full explanation). Imports parseTileKey and layerForFloor from
// render3d-core.js directly (both are pure, stateless, and universal to
// every 3D map renderer) rather than taking them as parameters -- anything
// using this module needs render3d-core.js anyway.

import { parseTileKey, layerForFloor } from "./render3d-core.js";
import { vertexHeightFeet, FEET_PER_WORLD_UNIT } from "./elevation.js";

// World units below floorY(floor) that every elevated/lowered cell's
// skirt walls reach down to. Deep enough to sit below a flat background
// image or a neighboring unpainted (elevation-0) cell in any normal case,
// so there's no visible gap looking at the edge of raised/lowered terrain
// from any reasonable camera angle.
const SKIRT_BASELINE_DEPTH = 3;

/**
 * Builds one quad (2 triangles) from 4 world-space corners, given in
 * order around the perimeter (not diagonally) -- e.g. top-left,
 * top-right, bottom-right, bottom-left. Used for both the tilted top
 * surface and the vertical skirt walls below.
 * @param {{x,y,z}} p1
 * @param {{x,y,z}} p2
 * @param {{x,y,z}} p3
 * @param {{x,y,z}} p4
 * @returns {THREE.BufferGeometry}
 */
function quadGeometry(p1, p2, p3, p4) {
  const positions = new Float32Array([
    p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z,
    p1.x, p1.y, p1.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Merges several BufferGeometries (all using position-only attributes, as
 * quadGeometry produces) into one, so a whole cell's top surface + 4
 * skirt walls become a single mesh/draw call instead of 5.
 * @param {THREE.BufferGeometry[]} geometries
 * @returns {THREE.BufferGeometry}
 */
function mergeGeometries(geometries) {
  let totalVerts = 0;
  for (const g of geometries) totalVerts += g.attributes.position.count;
  const merged = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (const g of geometries) {
    merged.set(g.attributes.position.array, offset);
    offset += g.attributes.position.array.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(merged, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Rebuilds every painted terrain tile AND every elevation-only cell (no
 * terrain painted, just a raised/lowered height) into tileGroup, tagged
 * per-floor.
 * @param {Object} opts
 * @param {THREE.Group} opts.tileGroup - cleared and repopulated each call.
 * @param {Object<string, {terrain: string}>} opts.latestTiles - keyed by "floor,x,y" (or legacy "x,y", implicitly floor 0).
 * @param {(terrainId: string) => THREE.Material} opts.getTerrainMaterial - see render3d-materials.js's createTerrainMaterialCache.
 * @param {(floor: number) => number} opts.floorY - see render3d-core.js's createFloorY.
 * @param {number} [opts.terrainTileY] - Y offset above the floor's base, before floorY is added. Defaults to 0.02 (viewer.html's own convention: just above background art, below props/tokens).
 * @param {Object<string, number>} [opts.elevation] - painted elevation in feet, keyed "floor,x,y" (see js/elevation.js). A cell with no elevation at all (or the whole param omitted) gets all 4 corners at 0 -- a flat quad with no skirts, identical to how tiles rendered before elevation existed.
 * @returns {number} how many cells were rendered (terrain, elevation, or both), in case the caller wants to log/report it.
 */
export function rebuildTiles({ tileGroup, latestTiles, getTerrainMaterial, floorY, terrainTileY = 0.02, elevation = {} }) {
  while (tileGroup.children.length) tileGroup.remove(tileGroup.children[0]);

  // Elevation is independent of terrain painting -- a GM whose ground
  // comes from a dd2vtt background image (not painted terrain swatches)
  // still wants to paint elevation directly over it, with no terrain
  // entry ever existing for those cells. Iterating latestTiles alone
  // would silently skip every one of those cells. "_elevation_default" is
  // a deliberately nonexistent terrain id -- getTerrainMaterial has no
  // texture for it and falls back to its own flat gray color, so an
  // elevation-only cell reads as "raised/lowered ground, no terrain
  // assigned" rather than guessing a texture that might be wrong.
  const allKeys = new Set([...Object.keys(latestTiles), ...Object.keys(elevation)]);

  for (const key of allKeys) {
    const { floor, x, y } = parseTileKey(key);
    const cell = latestTiles[key];

    // Corner heights (world units), one per grid vertex touching this
    // cell, blended from the (up to 4) cells sharing each corner -- see
    // vertexHeightFeet in elevation.js. A cell shared with a neighbor at a
    // different height computes the IDENTICAL value for that shared
    // corner on both sides, which is what makes them connect seamlessly.
    const hTL = vertexHeightFeet(elevation, floor, x, y) / FEET_PER_WORLD_UNIT;
    const hTR = vertexHeightFeet(elevation, floor, x + 1, y) / FEET_PER_WORLD_UNIT;
    const hBL = vertexHeightFeet(elevation, floor, x, y + 1) / FEET_PER_WORLD_UNIT;
    const hBR = vertexHeightFeet(elevation, floor, x + 1, y + 1) / FEET_PER_WORLD_UNIT;

    if (!cell && hTL === 0 && hTR === 0 && hBL === 0 && hBR === 0) continue; // nothing painted here at all

    const material = getTerrainMaterial(cell ? cell.terrain : '_elevation_default');
    material.side = THREE.DoubleSide;

    // World-space corners of the top surface (baseY already folds in the
    // floor's own height and the small terrainTileY offset).
    const baseY = terrainTileY + floorY(floor);
    const cTL = { x, y: baseY + hTL, z: y };
    const cTR = { x: x + 1, y: baseY + hTR, z: y };
    const cBL = { x, y: baseY + hBL, z: y + 1 };
    const cBR = { x: x + 1, y: baseY + hBR, z: y + 1 };

    const quads = [quadGeometry(cTL, cTR, cBR, cBL)]; // top surface

    // Skirts: unconditional on all 4 edges whenever this cell has any
    // elevation at all, extending straight down to a shared baseline.
    // Simpler and more robust than checking each neighbor's own height to
    // decide whether a skirt is "needed" there -- a flat (elevation-0)
    // neighbor still needs one (nothing else would fill that gap), and an
    // unconditional skirt against an elevated neighbor is just briefly
    // hidden inside connected geometry, not visibly wrong.
    if (hTL !== 0 || hTR !== 0 || hBL !== 0 || hBR !== 0) {
      const floorBaseline = floorY(floor) - SKIRT_BASELINE_DEPTH;
      const bTL = { x: cTL.x, y: floorBaseline, z: cTL.z };
      const bTR = { x: cTR.x, y: floorBaseline, z: cTR.z };
      const bBL = { x: cBL.x, y: floorBaseline, z: cBL.z };
      const bBR = { x: cBR.x, y: floorBaseline, z: cBR.z };
      quads.push(
        quadGeometry(cTL, bTL, bTR, cTR), // north edge (y constant, top)
        quadGeometry(cBL, cBR, bBR, bBL), // south edge (y constant, bottom)
        quadGeometry(cTL, cBL, bBL, bTL), // west edge (x constant, left)
        quadGeometry(cTR, bTR, bBR, cBR), // east edge (x constant, right)
      );
    }

    const geo = quads.length > 1 ? mergeGeometries(quads) : quads[0];
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.layers.set(layerForFloor(floor));
    tileGroup.add(mesh);
  }
  return allKeys.size;
}
