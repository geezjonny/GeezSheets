// Wall and door swatches: the materials the DM can draw walls and doors with on a battle map.
// Shared by index.html (2D) and 3d.html (3D). A drawn wall/door stores its swatch id as `mat`
// (battles[id].edits.addWalls[k].mat / addDoors[k].mat); walls from the dd2vtt file have none.
// Textures tile once per grid square. Add a swatch by dropping a PNG in textures/ and listing it here.
window.GEEZ_SWATCHES = {
  wall: [
    { id: 'stone', name: 'Stone', color: '#6b6b68', texture: 'textures/wall/stone.png' },
    { id: 'brick', name: 'Brick', color: '#94473a', texture: 'textures/wall/brick.png' },
    { id: 'wood', name: 'Wood', color: '#7a5230', texture: 'textures/wall/wood.png' },
    { id: 'hedge', name: 'Hedge', color: '#466f35', texture: 'textures/wall/hedge.png' },
    { id: 'earth', name: 'Earth', color: '#6e5238', texture: 'textures/wall/earth.png' },
  ],
  door: [
    { id: 'wood', name: 'Wood', color: '#7a4e2a', texture: 'textures/door/wood.png' },
    { id: 'iron', name: 'Iron', color: '#5f646b', texture: 'textures/door/iron.png' },
    { id: 'secret', name: 'Secret (stone)', color: '#6b6b68', texture: 'textures/wall/stone.png' },
  ],
};
