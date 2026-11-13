// Wall, door, and floor swatches for battle maps. Painted floor cells are stored per battle map.
// Used by index.html. A drawn wall/door stores its swatch id as `mat`
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
  floor: [
    { id: 'grass', name: 'Mossy grass', color: '#2e3926', texture: 'textures/floor/grass.png' },
    { id: 'dirt', name: 'Packed earth', color: '#483221', texture: 'textures/floor/dirt.png' },
    { id: 'mud', name: 'Mud', color: '#322c24', texture: 'textures/floor/mud.png' },
    { id: 'sand', name: 'Ashen sand', color: '#685f4a', texture: 'textures/floor/sand.png' },
    { id: 'wood', name: 'Dark planks', color: '#352519', texture: 'textures/floor/wood.png' },
    { id: 'stone', name: 'Flagstones', color: '#434540', texture: 'textures/floor/stone.png' },
    { id: 'cobble', name: 'Cobblestone', color: '#3d3f3a', texture: 'textures/floor/cobble.png' },
    { id: 'tile', name: 'Checkered tiles', color: '#341b17', texture: 'textures/floor/tile.png' },
    { id: 'marble', name: 'Dark marble', color: '#2c3033', texture: 'textures/floor/marble.png' },
    { id: 'water', name: 'Deep water', color: '#1b2b2c', texture: 'textures/floor/water.png' },
    { id: 'shallow', name: 'Shallow water', color: '#37453d', texture: 'textures/floor/shallow.png' },
    { id: 'ice', name: 'Cracked ice', color: '#55686f', texture: 'textures/floor/ice.png' },
    { id: 'snow', name: 'Old snow', color: '#8b918e', texture: 'textures/floor/snow.png' },
    { id: 'lava', name: 'Lava crust', color: '#2f231d', texture: 'textures/floor/lava.png' },
    { id: 'swamp', name: 'Swamp', color: '#323522', texture: 'textures/floor/swamp.png' },
    { id: 'carpet', name: 'Faded crimson carpet', color: '#300d0d', texture: 'textures/floor/carpet.png' },
    { id: 'bone', name: 'Crypt bones and ash', color: '#3f3c36', texture: 'textures/floor/bone.png' },
    { id: 'void', name: 'Void mist', color: '#0f0d17', texture: 'textures/floor/void.png' },
    { id: 'gravel', name: 'Gravel', color: '#43403a', texture: 'textures/floor/gravel.png' },
    { id: 'moss', name: 'Mossy ruins', color: '#353c2c', texture: 'textures/floor/moss.png' },
  ],
};
