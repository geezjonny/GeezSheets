// Music and sound files the DM can push to every player (index.html → Session → Music & sounds).
// Drop an .mp3 into audio/music/, audio/ambience/ or audio/sfx/ and list it here; players load the same
// file from this site, so it has to be committed next to the page (no Git LFS: Pages won't serve it).
// Any direct link to an audio file works too, pasted into the sound board. Sources and licences: audio/CREDITS.md.
//
//   music:    { id, name, src, loop? }                    a track; loops unless loop: false
//   ambience: { id, name, icon, src, replaces? }          a recorded bed, looped gaplessly from a random point
//             { id, name, icon, chain: [src, …] }         short clips played one after another, in random order
//   sfx:      { id, name, icon, src | srcs: [src, …] }    a one-shot; with srcs the DM's tap picks one at random
// `replaces` hides the synthesized sound (js/sfx.js) of that id from the board, since the recording is better.
// icon = a Font Awesome solid icon name without "fa-".
(() => {
const A = 'audio/ambience/', S = 'audio/sfx/';
window.GEEZ_AUDIO = {
    music: [
        { id: 'avernus', name: 'Avernus', src: 'audio/music/avernus.mp3' },
    ],
    ambience: [
        { id: 'rec_rain_light', name: 'Light rain', icon: 'cloud-rain', src: A + 'rain_light.mp3', replaces: 'rain' },
        { id: 'rec_rain_heavy', name: 'Heavy rain', icon: 'cloud-showers-heavy', src: A + 'rain_heavy.mp3' },
        { id: 'rec_rain_roof', name: 'Rain on the roof', icon: 'house-chimney', src: A + 'rain_roof.mp3' },
        { id: 'rec_wind_light', name: 'Breeze', icon: 'wind', src: A + 'wind_light.mp3', replaces: 'wind' },
        { id: 'rec_wind_strong', name: 'Strong wind', icon: 'wind', src: A + 'wind_strong.mp3' },
        { id: 'rec_wind_howl', name: 'Howling wind', icon: 'wind', src: A + 'wind_howl.mp3' },
        { id: 'rec_firecrackle', name: 'Campfire', icon: 'fire', src: A + 'firecrackle.mp3', replaces: 'fire' },
        { id: 'rec_fire_small', name: 'Torches', icon: 'fire-flame-curved', src: A + 'fire_small.mp3' },
        { id: 'rec_cavewind', name: 'Cave wind', icon: 'mountain', src: A + 'cavewind.mp3', replaces: 'cave' },
        { id: 'rec_cave_tone', name: 'Dungeon tone', icon: 'dungeon', src: A + 'cave_tone.mp3' },
        { id: 'rec_drips', name: 'Dripping', icon: 'droplet', chain: [1, 2, 3, 4, 5, 6].map(n => A + `drip_${n}.mp3`) },
        { id: 'rec_water_lap', name: 'Lapping water', icon: 'water', src: A + 'water_lap.mp3' },
        { id: 'rec_forest_day', name: 'Forest', icon: 'tree', src: A + 'forest_day.mp3', replaces: 'forest' },
        { id: 'rec_night_insects', name: 'Night insects', icon: 'moon', src: A + 'night_insects.mp3', replaces: 'night' },
        { id: 'rec_tavern', name: 'Tavern', icon: 'beer-mug-empty', src: A + 'tavern_murmur.mp3', replaces: 'tavern' },
        { id: 'rec_fire_crackling', name: 'Crackling fire', icon: 'fire', src: A + 'fire_crackling.mp3' },
        { id: 'rec_blizzard', name: 'Blizzard', icon: 'snowflake', src: A + 'blizzard.mp3' },
        { id: 'rec_cemetery_wind', name: 'Graveyard wind', icon: 'cross', src: A + 'cemetery_wind.mp3' },
        { id: 'rec_dry_thunder', name: 'Rolling thunder', icon: 'cloud-bolt', src: A + 'dry_thunder.mp3' },
        { id: 'rec_eerie', name: 'Eerie', icon: 'ghost', src: A + 'eerie.mp3' },
    ],
    sfx: [
        { id: 'rec_thunder', name: 'Thunder', icon: 'cloud-bolt', srcs: [1, 2, 3, 4].map(n => S + `thunder_${n}.mp3`), replaces: 'thunder' },
        { id: 'rec_door_open', name: 'Door opens', icon: 'door-open', src: S + 'door_open.mp3', replaces: 'door' },
        { id: 'rec_door_close', name: 'Door closes', icon: 'door-closed', src: S + 'door_close.mp3' },
        { id: 'rec_wood_creak', name: 'Creak', icon: 'tree', src: S + 'wood_creak.mp3' },
        { id: 'rec_iron_gate', name: 'Iron gate', icon: 'dungeon', src: S + 'iron_gate.mp3', replaces: 'gate' },
        { id: 'rec_portcullis', name: 'Portcullis', icon: 'archway', src: S + 'portcullis.mp3' },
        { id: 'rec_trap', name: 'Trap', icon: 'triangle-exclamation', src: S + 'trap_clank.mp3' },
        { id: 'rec_footsteps', name: 'Footsteps', icon: 'shoe-prints', src: S + 'footsteps.mp3', replaces: 'footsteps' },
        { id: 'rec_dice', name: 'Dice roll', icon: 'dice', src: S + 'dice_roll.mp3' },
        { id: 'rec_arrows', name: 'Volley of arrows', icon: 'location-arrow', src: S + 'arrows.mp3', replaces: 'arrow' },
        { id: 'rec_explosion', name: 'Explosion', icon: 'burst', src: S + 'explosion.mp3', replaces: 'explosion' },
        { id: 'rec_dragon', name: 'Dragon roar', icon: 'dragon', src: S + 'dragon_roar.mp3' },
        { id: 'rec_dinosaur', name: 'Beast roar', icon: 'paw', src: S + 'dinosaur_roar.mp3' },
        { id: 'rec_growl', name: 'Monster growl', icon: 'skull', src: S + 'monster_growl.mp3', replaces: 'roar' },
        { id: 'rec_war_horn', name: 'War horn', icon: 'bullhorn', src: S + 'war_horn.mp3', replaces: 'horn' },
        { id: 'rec_scream', name: 'Creepy scream', icon: 'face-grimace', src: S + 'creepy_scream.mp3', replaces: 'scream' },
        { id: 'rec_zombie_screams', name: 'Zombie screams', icon: 'biohazard', src: S + 'zombie_screams.mp3' },
        { id: 'rec_zombie', name: 'Zombie', icon: 'biohazard', src: S + 'zombie.mp3' },
        { id: 'rec_crying_baby', name: 'Crying baby', icon: 'baby', src: S + 'crying_baby.mp3' },
        { id: 'rec_wind_gust', name: 'Wind gust', icon: 'wind', src: S + 'wind_gust.mp3' },
        { id: 'rec_giant_steps', name: 'Giant steps', icon: 'shoe-prints', src: S + 'giant_steps.mp3' },
        { id: 'rec_robot', name: 'Construct walking', icon: 'robot', src: S + 'robot_walk.mp3' },
    ],
    // played on each screen when a roll is thrown (set to null for silent dice)
    diceSound: S + 'dice_roll.mp3',
};
})();
