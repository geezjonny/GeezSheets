// core/schema.js — the one room-state shape both views render from.
// Nothing here is renderer-specific; this file is documentation-as-code
// (JSDoc typedefs + a default-state factory), not runtime logic.

/**
 * @typedef {Object} TileCell
 * @property {number} layer  - which floor this cell belongs to (0 = ground)
 * @property {number} x
 * @property {number} y
 * @property {string} tile   - name of a texture, e.g. "grass" (file resolved
 *                             via core/textures.js as /assets/<tile>.png,
 *                             flat, no subfolder). 2D: painted as this cell's
 *                             fill. 3D: applied to BOTH the top face and the
 *                             bottom face of the voxel column at (x,y,layer)
 *                             -- the bottom face is the ceiling for whatever
 *                             occupies the layer below. Same name, same
 *                             file, both views and both faces.
 */

/**
 * @typedef {Object} Wall
 * @property {string} id
 * @property {number} layer  - placement layer; occupies `layer` and `layer+1`
 *                             in the 3D view (10ft = 2 layers), absent from
 *                             `layer+2`. 2D draws it only on `layer`.
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {string} texture      - name of a texture (see TileCell/core/textures.js),
 *                                    applied to the wall's two long faces in 3D.
 *                                    2D draws walls as a plain line -- you don't see a
 *                                    wall's face from directly above, so no texture there.
 * @property {boolean} [perimeter] - auto-generated map-bounds wall from dd2vtt import
 */

/**
 * @typedef {Object} Door
 * @property {string} id
 * @property {number} layer
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {boolean} closed
 * @property {boolean} freestanding
 */

/**
 * @typedef {Object} Light
 * @property {string} id
 * @property {number} layer  - which floor the light sits on (raycasting/occlusion
 *                             only considers walls/doors on the same layer)
 * @property {number} x
 * @property {number} y
 * @property {number} range      - grid units
 * @property {number} intensity
 * @property {string} color      - dd2vtt AARRGGBB hex string
 * @property {boolean} shadows
 */

/**
 * @typedef {Object} Token
 * @property {string} id
 * @property {number} layer
 * @property {number} x
 * @property {number} y
 * @property {string} characterId  - null for NPC/monster tokens
 * @property {string} name
 * @property {string} art          - image path
 * @property {number} hp
 * @property {number} maxHp
 */

/**
 * @typedef {Object} RoomState
 * @property {{x:number,y:number}} mapSize     - grid units, per dd2vtt convention
 * @property {number} pixelsPerGrid            - 2D-only: canvas px per tile
 * @property {string} ambientLight             - dd2vtt AARRGGBB hex
 * @property {TileCell[]} tiles
 * @property {Wall[]} walls
 * @property {Door[]} doors
 * @property {Light[]} lights
 * @property {Token[]} tokens
 * @property {Array} initiative
 */

export function emptyRoomState() {
  return {
    mapSize: { x: 0, y: 0 },
    pixelsPerGrid: 70,
    ambientLight: "ffffffff",
    tiles: [],
    walls: [],
    doors: [],
    lights: [],
    tokens: [],
    initiative: [],
  };
}

/** Dropped for this rebuild (present in mapeditor.html, not carried forward):
 *  props, traps/triggers, disguises, mirrors, weather, theater mode. */
export const DROPPED_FEATURES = [
  "props", "triggers", "disguises", "mirrors", "weather", "theater",
];
