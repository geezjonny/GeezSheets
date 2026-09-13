// 3D Tokens -- PCs (3D model if one exists, else a flat lying-down disc)
// and NPCs/monsters (a standing paper-mini-style standee). Extracted from
// viewer.html's rebuildTokens -- rendering portion only. That function also
// did login-session-resolution bookkeeping after rendering; that part is
// app-specific (viewer.html's own player-login concept, meaningless to any
// other 3D tool) and was deliberately left out of this module -- callers
// should run their own post-render logic after calling rebuildTokens here.
//
// REQUIRES THREE as a global (see render3d-materials.js's header). Imports
// setFloorLayer from render3d-core.js directly, same reasoning as the other
// render3d-*.js modules.

import { setFloorLayer } from "./render3d-core.js";
import { sampleElevationUnits } from "./elevation.js";

const DEFAULT_FLOOR_SURFACE_Y = 0.03; // walls/doors/lights/tokens measure from this, matches render3d-geometry.js's default

/**
 * A token's rough center-of-mass position in world space (grid-cell-center,
 * standing height, elevation-adjusted so it sits on whatever terrain
 * height is actually under its center cell) -- used for camera framing/
 * snapping, not for the token mesh's own pivot (which sits at floor level;
 * see rebuildTokens).
 * @param {{x,y,size?,floor?}} tok
 * @param {(floor: number) => number} floorY
 * @param {number} [floorSurfaceY]
 * @param {Object<string, number>} [elevation] - see js/elevation.js. Omit for the pre-elevation behavior (always 0 offset).
 * @returns {THREE.Vector3}
 */
export function tokenWorldPos(tok, floorY, floorSurfaceY = DEFAULT_FLOOR_SURFACE_Y, elevation = {}) {
  const size = tok.size || 1;
  const cx = tok.x + size / 2, cy = tok.y + size / 2;
  const groundUnits = sampleElevationUnits(elevation, tok.floor || 0, cx, cy);
  return new THREE.Vector3(cx, floorSurfaceY + 0.5 + floorY(tok.floor) + groundUnits, cy);
}

/**
 * Rebuilds every token into tokenGroup, tagged per-floor. PC tokens try a
 * real 3D model first (./tokens/<name>.glb via ensureTokenModelLoaded),
 * falling back to a flat lying-down disc sized to tok.size; NPCs/monsters
 * always get the standee (two back-to-back planes, so the art reads
 * right-way-round from both sides instead of one being a mirror image).
 * Elevation (see js/elevation.js): each token samples the ground height at
 * its own center cell and stands on top of it, exactly like a real
 * creature standing on a hill or in a pit rather than floating/sinking
 * relative to the terrain. Omitting the elevation param means every
 * offset is 0, identical to behavior before this existed.
 * @param {Object} opts
 * @param {THREE.Group} opts.tokenGroup
 * @param {Object} opts.latestTokens - keyed by token id; each token may have a .facing (radians, same yaw convention as render3d-camera.js) set by whichever app last moved it.
 * @param {(tok: Object) => THREE.Material} opts.getTokenMaterial - see render3d-materials.js's createTokenMaterialCache.
 * @param {(cacheKey: string, fname: string) => void} opts.ensureTokenModelLoaded - see render3d-materials.js's createTokenModelCache.
 * @param {Object} opts.tokenModelCache - the same cache createTokenModelCache manages; read directly here to check load state.
 * @param {(floor: number) => number} opts.floorY
 * @param {number} [opts.floorSurfaceY]
 * @param {Object<string, number>} [opts.elevation] - painted elevation in feet, keyed "floor,x,y".
 * @returns {number} how many tokens were rendered, in case the caller wants to log/report it.
 */
export function rebuildTokens({ tokenGroup, latestTokens, getTokenMaterial, ensureTokenModelLoaded, tokenModelCache, floorY, floorSurfaceY = DEFAULT_FLOOR_SURFACE_Y, elevation = {} }) {
  while (tokenGroup.children.length) tokenGroup.remove(tokenGroup.children[0]);
  const geo = new THREE.CircleGeometry(0.5, 24);
  for (const id in latestTokens) {
    const tok = latestTokens[id];
    const size = tok.size || 1;
    const cx = tok.x + size / 2, cy = tok.y + size / 2;
    const groundUnits = sampleElevationUnits(elevation, tok.floor || 0, cx, cy);

    const container = new THREE.Group();
    container.position.set(cx, floorSurfaceY + floorY(tok.floor) + groundUnits, cy);
    // Facing: sets which way the token's model/standee/portrait visually
    // points, from the last direction it actually moved (written by
    // index-layers.html's own movement code, using the exact same yaw
    // convention viewer.html's own camera-facing math uses -- x=sin(yaw),
    // z=cos(yaw) -- so no unit conversion is needed here). Tokens that
    // have never moved (or predate this field) simply default to 0,
    // whatever "forward" happens to mean for that art/model.
    container.rotation.y = -(tok.facing || 0);

    if (tok.type === 'pc') {
      // PCs only: try a real 3D model first (./tokens/<name>.glb), falling
      // back to the flat lying-down disc. NPCs/monsters never attempt
      // this -- see the standee branch below.
      const lookupName = tok.lookupName || tok.name || tok.characterId || 'token';
      const cacheKey = tok.characterId === '__npc__' && tok.name ? `__npc__:${tok.name.toLowerCase()}` : (tok.characterId || lookupName);
      const fname = lookupName.toLowerCase().replace(/\s+/g, '_');
      ensureTokenModelLoaded(cacheKey, fname);
      const model = tokenModelCache[cacheKey];

      if (model && model !== 'loading' && model !== 'error') {
        // Same footprint-fit approach as props: scale by the model's own
        // bounding box so it fills a size x size grid area -- "the same
        // token size call" as the 2D disc below (tok.size), not a separate
        // GLB-specific sizing scheme.
        const instance = model.clone();
        const box = new THREE.Box3().setFromObject(instance);
        const dims = box.getSize(new THREE.Vector3());
        const scale = size / (Math.max(dims.x, dims.z) || 1);
        instance.scale.setScalar(scale);
        instance.position.y = -box.min.y * scale; // stand on the floor rather than float/clip through it
        container.add(instance);
      } else {
        const material = getTokenMaterial(tok);
        const disc = new THREE.Mesh(geo, material);
        disc.scale.set(size, size, 1);
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.02; // just above the floor ART (mapLayers/background), not just above y=0 -- avoids being hidden under it
        container.add(disc);
      }
    } else {
      // Everyone else (NPCs, monsters): a standing paper-mini-style standee
      // instead of a GLB -- no model to source/normalize for every monster
      // in the bestiary, just the same 2D art (./tokens/<name>.png) that
      // already exists, applied to a flat card that actually stands up.
      // Two planes (not one double-sided plane) so the front and back both
      // show the art right-way-round instead of one side being a mirror
      // image.
      const material = getTokenMaterial(tok); // same PNG lookup/RTDB-fallback chain as PCs' disc
      const cardGeo = new THREE.PlaneGeometry(size, size);
      const front = new THREE.Mesh(cardGeo, material);
      front.position.y = size / 2; // lift so the card's bottom edge rests on the floor, not its center
      const back = front.clone();
      back.rotation.y = Math.PI; // faces the opposite direction, same (non-mirrored) texture
      container.add(front, back);
    }
    setFloorLayer(container, tok.floor);
    tokenGroup.add(container);
  }
  return Object.keys(latestTokens).length;
}
