// 3D Props -- same data driving both 2D (mapeditor-layers.html, loads
// ./props/<id>.png) and 3D here: tries a voxel model first
// (./props/<id>.json, made with prop-maker.html -- a uniform grid of
// colored unit cubes, Minecraft-style), falling back to a single box with
// that same PNG applied to all 6 faces if no voxel model exists yet. No
// GLB attempt at all here -- normalizing/sourcing a real model for every
// prop type is real per-asset work, whereas a voxel model or a plain
// textured box already give correct size + visual presence for free, using
// art/tools that already exist. GLB stays reserved for PC tokens
// (render3d-tokens.js).
//
// Extracted from viewer.html's rebuildProps.
//
// REQUIRES THREE as a global (see render3d-materials.js's header). Imports
// parseTileKey and setFloorLayer from render3d-core.js directly, same
// reasoning as the other render3d-*.js modules.

import { parseTileKey, setFloorLayer } from "./render3d-core.js";
import { sampleElevationUnits } from "./elevation.js";

const DEFAULT_FLOOR_SURFACE_Y = 0.03; // walls/doors/lights/tokens measure from this, matches render3d-geometry.js's default

/**
 * Rebuilds every prop into propGroup, tagged per-floor. Props can either
 * sit at a fixed map cell (key is "floor,x,y") or be attached to a moving
 * token (p.attachedTo + offsetX/offsetY, e.g. a familiar or a carried
 * item) -- resolved the same way either way before rendering.
 * Elevation (see js/elevation.js): each prop samples the ground height at
 * its own center cell and sits on top of it, same reasoning as tokens.
 * Omitting the elevation param means every offset is 0, identical to
 * behavior before this existed.
 * @param {Object} opts
 * @param {THREE.Group} opts.propGroup
 * @param {Object} opts.latestProps - keyed by "floor,x,y" or by an attachment key; each value may have {attachedTo, offsetX, offsetY, disguise, propId, w, h, height, rotation}.
 * @param {Object} opts.latestTokens - keyed by token id, needed to resolve attachedTo props.
 * @param {(propId: string) => void} opts.ensurePropVoxelLoaded - see render3d-materials.js's createPropVoxelCache.
 * @param {Object} opts.propVoxelCache - the same cache createPropVoxelCache manages; read directly here to check load state.
 * @param {(propId: string) => THREE.Material} opts.getPropBoxMaterial - see render3d-materials.js's createPropBoxMaterialCache.
 * @param {(floor: number) => number} opts.floorY
 * @param {number} [opts.floorSurfaceY]
 * @param {Object<string, number>} [opts.elevation] - painted elevation in feet, keyed "floor,x,y".
 * @returns {number} how many props were rendered, in case the caller wants to log/report it.
 */
export function rebuildProps({ propGroup, latestProps, latestTokens, ensurePropVoxelLoaded, propVoxelCache, getPropBoxMaterial, floorY, floorSurfaceY = DEFAULT_FLOOR_SURFACE_Y, elevation = {} }) {
  while (propGroup.children.length) propGroup.remove(propGroup.children[0]);
  for (const key in latestProps) {
    const p = latestProps[key];
    let px, py, floor;
    if (p.attachedTo && latestTokens[p.attachedTo]) {
      const tok = latestTokens[p.attachedTo];
      px = tok.x + (p.offsetX || 0); py = tok.y + (p.offsetY || 0); floor = tok.floor || 0;
    } else {
      const parsed = parseTileKey(key);
      px = parsed.x; py = parsed.y; floor = parsed.floor;
    }
    const propId = (p.disguise && p.disguise.propId) || p.propId; // resolvePropId()'s exact logic -- matches what mapeditor's own 2D view shows, disguises included
    if (!propId) continue;
    const w = p.w || 1, h = p.h || 1, propHeight = p.height || 1;
    const cx = px + w / 2, cz = py + h / 2;
    const groundUnits = sampleElevationUnits(elevation, floor, cx, cz);
    const baseY = floorSurfaceY + floorY(floor) + groundUnits;

    ensurePropVoxelLoaded(propId);
    const voxelTemplate = propVoxelCache[propId];

    const container = new THREE.Group();
    container.position.set(cx, baseY, cz);
    container.rotation.y = -((p.rotation || 0) * Math.PI / 180);
    container.userData.propKey = key; // lets a raycast hit trace back to this prop, for container interaction

    if (voxelTemplate && voxelTemplate !== 'loading' && voxelTemplate !== 'error') {
      // Exact fit, per-axis -- these are already unit cubes on a known
      // grid, so (unlike GLB scaling) no bounding-box estimate is needed,
      // and non-uniform scaling here doesn't look distorted the way
      // squashing a real mesh would.
      const instance = voxelTemplate.clone(true);
      const used = voxelTemplate.userData.usedSize;
      instance.scale.set(w / used.x, propHeight / used.y, h / used.z);
      container.add(instance);
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, propHeight, h), getPropBoxMaterial(propId));
      box.position.y = propHeight / 2; // box center up to half its height, so its bottom face sits on the floor
      container.add(box);
    }
    setFloorLayer(container, floor);
    propGroup.add(container);
  }
  return Object.keys(latestProps).length;
}
