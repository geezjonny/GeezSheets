// 3D Camera -- pure first-person and camera-framing math. Extracted from
// viewer.html's tokenHeadPos/updateFirstPersonCamera/snapCameraToToken.
//
// Deliberately does NOT own first-person mode state (on/off, yaw/pitch,
// drag tracking) or wire up any mouse/keyboard event listeners -- those are
// a few lines of simple state a caller almost certainly already has its
// own login/control-scheme opinions about, and the pure math below doesn't
// need to own that state to be reusable. A caller keeps its own
// firstPersonMode/fpYaw/fpPitch variables (or equivalent) and passes them
// in each frame.
//
// REQUIRES THREE as a global (see render3d-materials.js's header).

import { sampleElevationUnits } from "./elevation.js";

const DEFAULT_FLOOR_SURFACE_Y = 0.03; // matches render3d-geometry.js/render3d-tokens.js's default
const DEFAULT_FP_HEAD_HEIGHT = 1.2; // grid units above the floor surface -- rough eye level for a Medium creature

/**
 * A token's eye-level position in world space, for first-person framing.
 * Elevation-adjusted (see js/elevation.js) so eye height rises/falls with
 * whatever terrain the token is actually standing on.
 * @param {{x,y,size?,floor?}} tok
 * @param {(floor: number) => number} floorY
 * @param {Object} [opts]
 * @param {number} [opts.floorSurfaceY]
 * @param {number} [opts.headHeight]
 * @param {Object<string, number>} [opts.elevation] - see js/elevation.js. Omit for the pre-elevation behavior (always 0 offset).
 * @returns {THREE.Vector3}
 */
export function tokenHeadPos(tok, floorY, { floorSurfaceY = DEFAULT_FLOOR_SURFACE_Y, headHeight = DEFAULT_FP_HEAD_HEIGHT, elevation = {} } = {}) {
  const size = tok.size || 1;
  const cx = tok.x + size / 2, cy = tok.y + size / 2;
  const groundUnits = sampleElevationUnits(elevation, tok.floor || 0, cx, cy);
  return new THREE.Vector3(cx, floorSurfaceY + headHeight + floorY(tok.floor) + groundUnits, cy);
}

/**
 * Moves the camera to a token's eye position and points it in the
 * yaw/pitch direction the caller is currently tracking. Call this every
 * frame while in first-person mode -- re-reads the token's position each
 * time, so the camera follows if the token moves (including up/down
 * whatever elevation it's standing on), with no extra plumbing.
 * @param {Object} opts
 * @param {THREE.Camera} opts.camera
 * @param {{x,y,floor?}} opts.tok
 * @param {number} opts.fpYaw
 * @param {number} opts.fpPitch
 * @param {(floor: number) => number} opts.floorY
 * @param {Object} [opts.headPosOpts] - passed through to tokenHeadPos (including its own elevation option).
 */
export function updateFirstPersonCamera({ camera, tok, fpYaw, fpPitch, floorY, headPosOpts }) {
  const headPos = tokenHeadPos(tok, floorY, headPosOpts);
  camera.position.copy(headPos);
  const dir = new THREE.Vector3(
    Math.cos(fpPitch) * Math.sin(fpYaw),
    Math.sin(fpPitch),
    Math.cos(fpPitch) * Math.cos(fpYaw)
  );
  camera.lookAt(headPos.clone().add(dir));
}

/**
 * Frames an orbit-control camera on a token from a fixed offset angle --
 * used for a GM's or spectator's free-camera "look at this token" action,
 * not first-person. Elevation-adjusted like tokenHeadPos above.
 * @param {Object} opts
 * @param {THREE.Camera} opts.camera
 * @param {{target: THREE.Vector3}} opts.controls - e.g. a THREE.OrbitControls instance.
 * @param {{x,y,floor?}} opts.tok
 * @param {(floor: number) => number} opts.floorY
 * @param {number} [opts.floorSurfaceY]
 * @param {number} [opts.offset] - world units added to each axis from the token's position.
 * @param {Object<string, number>} [opts.elevation] - see js/elevation.js.
 */
export function snapCameraToToken({ camera, controls, tok, floorY, floorSurfaceY = DEFAULT_FLOOR_SURFACE_Y, offset = 4, elevation = {} }) {
  const size = tok.size || 1;
  const cx = tok.x + size / 2, cy = tok.y + size / 2;
  const groundUnits = sampleElevationUnits(elevation, tok.floor || 0, cx, cy);
  const pos = new THREE.Vector3(cx, floorSurfaceY + 0.5 + floorY(tok.floor) + groundUnits, cy);
  controls.target.copy(pos);
  camera.position.set(pos.x + offset, pos.y + offset, pos.z + offset);
}
