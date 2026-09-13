// 3D Geometry -- walls, doors (including windows), and point lights.
// Extracted from viewer.html's rebuildGeometry.
//
// REQUIRES THREE as a global (see render3d-materials.js's header). Imports
// layerForFloor from render3d-core.js directly, same reasoning as
// render3d-tiles.js.

import { layerForFloor } from "./render3d-core.js";
import { sampleElevationUnits } from "./elevation.js";

const DEFAULT_WALL_THICKNESS = 0.12;
const DEFAULT_FLOOR_SURFACE_Y = 0.03; // walls/doors/lights/tokens measure from this
const DEFAULT_WALL_HEIGHT = 2; // matches render3d-core.js's createFloorY default (10ft/floor)
const unitBox = new THREE.BoxGeometry(1, 1, 1); // shared by every call -- addSegment only ever scales/positions copies of it, never mutates the geometry itself

/**
 * Adds one wall or door segment to a group as a row of unit-cube meshes
 * along its run (not one long stretched box -- see inline comment). Tags
 * each mesh with userData.segId (for raycast hit-testing back to which
 * segment it came from) and the floor's render layer.
 * @param {{x1,y1,x2,y2,floor,id}} seg
 * @param {THREE.Group} group
 * @param {THREE.Material} material
 * @param {Object} [opts]
 * @param {(floor:number)=>number} [opts.floorY] - defaults to floor*2 (10ft/floor) if omitted.
 * @param {number} [opts.wallMeshHeight] - defaults to DEFAULT_WALL_HEIGHT - 0.005 (just under a full floor's height, avoiding z-fighting with the floor above).
 * @param {number} [opts.wallThickness]
 * @param {number} [opts.floorSurfaceY]
 * @param {number} [opts.elevationOffsetUnits] - flat vertical shift (world units) applied to the WHOLE segment -- "what elevation it starts on," not per-cell terrain-following. The wall itself stays perfectly rigid/flat; only its base height changes. Defaults to 0 (unaffected by elevation), so any caller that doesn't pass this behaves exactly as before elevation existed.
 */
export function addSegment(seg, group, material, opts = {}) {
  const floorY = opts.floorY || ((floor) => (floor || 0) * DEFAULT_WALL_HEIGHT);
  const wallMeshHeight = opts.wallMeshHeight ?? (DEFAULT_WALL_HEIGHT - 0.005);
  const wallThickness = opts.wallThickness ?? DEFAULT_WALL_THICKNESS;
  const floorSurfaceY = opts.floorSurfaceY ?? DEFAULT_FLOOR_SURFACE_Y;
  const elevationOffsetUnits = opts.elevationOffsetUnits ?? 0;

  const dx = seg.x2 - seg.x1, dz = seg.y2 - seg.y1;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return;
  const angle = -Math.atan2(dz, dx);
  const y = floorSurfaceY + wallMeshHeight / 2 + floorY(seg.floor) + elevationOffsetUnits;

  // One box per ~1-grid-unit cell along the wall's run, instead of a single
  // box with the texture stretched the whole length -- a 10-unit wall reads
  // as 10 separate tiled copies of the texture, not one image squashed 10x.
  // cellLen divides the length evenly (not a fixed 1) so there's no
  // leftover sliver cell at the end.
  const nCells = Math.max(1, Math.round(length));
  const cellLen = length / nCells;
  for (let i = 0; i < nCells; i++) {
    const t = (i + 0.5) / nCells;
    const mesh = new THREE.Mesh(unitBox, material);
    mesh.scale.set(cellLen, wallMeshHeight, wallThickness);
    mesh.position.set(seg.x1 + dx * t, y, seg.y1 + dz * t);
    mesh.rotation.y = angle;
    mesh.castShadow = true;
    mesh.userData.segId = seg.id; // lets a raycast hit trace back to which door (or wall) this came from
    mesh.layers.set(layerForFloor(seg.floor));
    group.add(mesh);
  }
}

/**
 * Rebuilds walls, doors (including windows), and point lights from
 * geometry data. No per-wall/door texture field exists in the actual saved
 * data, so wall/door materials use fixed defaults (via getTerrainMaterial,
 * so an existing stone.png/wood.png texture is picked up for free) rather
 * than a per-instance lookup.
 *
 * Elevation (see js/elevation.js): each wall/door is sampled ONCE, at its
 * (x1,y1) endpoint, and shifted as a whole by that height -- "what
 * elevation it starts on," not per-cell terrain-following. A wall doesn't
 * tilt or step to match ground that rises or falls along its own length;
 * it just sits higher or lower as a rigid unit based on where it begins.
 * Lights are sampled at their own (x,y). Omitting the elevation param
 * (or leaving a map with no painted elevation) means every offset is 0,
 * identical to behavior before this existed.
 * @param {Object} opts
 * @param {THREE.Group} opts.wallGroup
 * @param {THREE.Group} opts.doorGroup
 * @param {THREE.Group} opts.lightGroup
 * @param {{walls?, doors?, lights?}} opts.latestGeometry
 * @param {(terrainId: string) => THREE.Material} opts.getTerrainMaterial
 * @param {(floor: number) => number} opts.floorY
 * @param {number} [opts.wallMeshHeight]
 * @param {number} [opts.wallThickness]
 * @param {number} [opts.floorSurfaceY]
 * @param {Object<string, number>} [opts.elevation] - painted elevation in feet, keyed "floor,x,y" (see js/elevation.js).
 * @returns {{wallCount, doorCount, lightCount, floorsPresent: number[]}}
 */
export function rebuildGeometry({ wallGroup, doorGroup, lightGroup, latestGeometry, getTerrainMaterial, floorY, wallMeshHeight, wallThickness, floorSurfaceY, elevation = {} }) {
  while (wallGroup.children.length) wallGroup.remove(wallGroup.children[0]);
  while (doorGroup.children.length) doorGroup.remove(doorGroup.children[0]);
  while (lightGroup.children.length) lightGroup.remove(lightGroup.children[0]);

  const baseSegOpts = { floorY, wallMeshHeight, wallThickness, floorSurfaceY };
  const wallMat = getTerrainMaterial('stone');
  const doorMat = getTerrainMaterial('wood');
  // Glass-like, not texture-based like the others -- a window is a fixed
  // pane, never opens/closes, so there's no "closed" art to swap to the way
  // a door has. Distinct on sight from both wall and door.
  const windowMat = new THREE.MeshStandardMaterial({ color: 0xaad4e8, roughness: 0.15, transparent: true, opacity: 0.45 });

  for (const w of latestGeometry.walls || []) {
    const segOpts = { ...baseSegOpts, elevationOffsetUnits: sampleElevationUnits(elevation, w.floor || 0, w.x1, w.y1) };
    addSegment(w, wallGroup, wallMat, segOpts);
  }
  // A window is a fixed pane -- always rendered, regardless of
  // closed/open, since it has no opening mechanism at all. Open doors
  // (closed:false, and NOT a window) render as nothing -- an actual gap
  // you can see/walk through -- matching a mover's own "open doors don't
  // block" rule, which lives with movement logic, not here.
  for (const d of latestGeometry.doors || []) {
    const segOpts = { ...baseSegOpts, elevationOffsetUnits: sampleElevationUnits(elevation, d.floor || 0, d.x1, d.y1) };
    if (d.isWindow) { addSegment(d, doorGroup, windowMat, segOpts); continue; }
    if (d.closed !== false) addSegment(d, doorGroup, doorMat, segOpts);
  }

  const fSurfaceY = floorSurfaceY ?? DEFAULT_FLOOR_SURFACE_Y;
  for (const l of latestGeometry.lights || []) {
    if (l.on === false) continue; // l.on!==false -- undefined (pre-existing lights, never touched by a trigger) still means on
    const h = (l.color || 'ffffffff').replace('#', '');
    const colorHex = parseInt(h.length >= 8 ? h.slice(2) : h, 16) || 0xffffff;
    const pointLight = new THREE.PointLight(colorHex, (l.intensity ?? 1) * 0.65, (l.range ?? 5) * 2); // -35% brightness
    const lightElevationUnits = sampleElevationUnits(elevation, l.floor || 0, l.x, l.y);
    pointLight.position.set(l.x, fSurfaceY + 0.8 + floorY(l.floor) + lightElevationUnits, l.y);
    lightGroup.add(pointLight);
    // No visible marker mesh -- just the actual light source.
  }

  const floorsPresent = [...new Set([...(latestGeometry.walls || []), ...(latestGeometry.doors || []), ...(latestGeometry.lights || [])].map(o => o.floor || 0))].sort((a, b) => a - b);
  return {
    wallCount: latestGeometry.walls?.length || 0,
    doorCount: latestGeometry.doors?.length || 0,
    lightCount: latestGeometry.lights?.length || 0,
    floorsPresent,
  };
}

/**
 * Adjusts ambient/sun light intensity for day vs night. Previously a flat
 * 0.6/0.6 for "day" applied uniformly to the whole scene regardless of
 * placed point lights, so removing every light from a hallway made no
 * visible difference (the hallway was never lit by those lights, it was
 * lit by this baseline) -- dropped much closer to night's level: dim
 * enough that placed lights actually matter, not so dark geometry/textures
 * are unreadable for navigation.
 * @param {THREE.AmbientLight} ambientLight
 * @param {THREE.DirectionalLight} sun
 * @param {{timeOfDay?: string}} geometryData
 */
export function updateSceneLighting(ambientLight, sun, geometryData) {
  const isNight = geometryData?.timeOfDay === 'night';
  ambientLight.intensity = isNight ? 0.08 : 0.18;
  sun.intensity = isNight ? 0 : 0.15;
}
