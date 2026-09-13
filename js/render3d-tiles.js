// 3D Terrain Tiles -- renders painted terrain cells as flat planes (no
// elevation painted there) or solid stepped boxes (elevation painted),
// tagged per-floor. Extracted from viewer.html's rebuildTiles.
//
// REQUIRES THREE as a global (see render3d-materials.js's header for the
// full explanation). Imports parseTileKey and layerForFloor from
// render3d-core.js directly (both are pure, stateless, and universal to
// every 3D map renderer) rather than taking them as parameters -- anything
// using this module needs render3d-core.js anyway.

import { parseTileKey, layerForFloor } from "./render3d-core.js";
import { sampleElevationUnits } from "./elevation.js";

// World units (10ft) below floorY(floor) that every elevation box's bottom
// face reaches down to. Elevation is grid-quantized (one flat height per
// cell, not a continuous mesh), so without a shared baseline, neighboring
// cells at different heights would look like disconnected floating slabs
// rather than solid stepped terrain -- extending every box down to the
// same depth is what makes adjacent steps read as connected ground.
const ELEVATION_BASELINE_DEPTH = 2;

/**
 * Rebuilds every painted terrain tile AND every elevation-only cell (no
 * terrain painted, just a raised/lowered height) into tileGroup, tagged
 * per-floor.
 * @param {Object} opts
 * @param {THREE.Group} opts.tileGroup - cleared and repopulated each call.
 * @param {Object<string, {terrain: string}>} opts.latestTiles - keyed by "floor,x,y" (or legacy "x,y", implicitly floor 0).
 * @param {(terrainId: string) => THREE.Material} opts.getTerrainMaterial - see render3d-materials.js's createTerrainMaterialCache.
 * @param {(floor: number) => number} opts.floorY - see render3d-core.js's createFloorY.
 * @param {number} [opts.terrainTileY] - Y offset above the floor's base, before floorY is added, for unelevated (flat) cells. Defaults to 0.02 (viewer.html's own convention: just above background art, below props/tokens).
 * @param {Object<string, number>} [opts.elevation] - painted elevation in feet, keyed "floor,x,y" (see js/elevation.js). Cells absent here (or the whole param omitted) render as flat planes exactly as before elevation existed -- or nothing at all, if there's no terrain entry either.
 * @returns {number} how many cells were rendered (terrain, elevation, or both), in case the caller wants to log/report it.
 */
export function rebuildTiles({ tileGroup, latestTiles, getTerrainMaterial, floorY, terrainTileY = 0.02, elevation = {} }) {
  while (tileGroup.children.length) tileGroup.remove(tileGroup.children[0]);
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

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
    const material = getTerrainMaterial(cell ? cell.terrain : '_elevation_default');
    const h = sampleElevationUnits(elevation, floor, x, y); // world units; 0 for any cell with no elevation painted
    const baseY = floorY(floor);

    if (Math.abs(h) < 1e-6) {
      if (!cell) continue; // elevation is 0 here and there's no terrain either -- nothing to draw
      // No elevation painted here -- render exactly as before elevation
      // existed, a flat plane. Every map predating this feature (or any
      // cell simply left at 0) looks completely unchanged.
      material.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(planeGeo, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x + 0.5, terrainTileY + baseY, y + 0.5);
      mesh.receiveShadow = true;
      mesh.layers.set(layerForFloor(floor));
      tileGroup.add(mesh);
    } else {
      // Elevation painted -- a solid box whose TOP face is the walkable
      // surface at the painted height, reaching down to the shared
      // baseline (see ELEVATION_BASELINE_DEPTH above). Renders even with
      // no terrain entry at all (a bare elevation-only cell).
      const topY = baseY + h;
      const bottomY = Math.min(baseY - ELEVATION_BASELINE_DEPTH, topY - 0.2);
      const mesh = new THREE.Mesh(boxGeo, material);
      mesh.scale.set(1, topY - bottomY, 1);
      mesh.position.set(x + 0.5, (topY + bottomY) / 2, y + 0.5);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.layers.set(layerForFloor(floor));
      tileGroup.add(mesh);
    }
  }
  return allKeys.size;
}
