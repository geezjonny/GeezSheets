// Loads all config JSONs and exports them as constants
// Also derives lookup maps for fast access

const BASE = "./config/";

async function loadJSON(file) {
  const res = await fetch(BASE + file);
  return res.json();
}

let TERRAINS, CONDITIONS, PROPS, STAMPS, SIZES, DICE, SOUNDFX;

export async function loadConfig() {
  [TERRAINS, CONDITIONS, PROPS, STAMPS, DICE, SIZES, SOUNDFX] = await Promise.all([
    loadJSON("terrains.json"),
    loadJSON("conditions.json"),
    loadJSON("props.json"),
    loadJSON("stamps.json"),
    loadJSON("dice.json"),
    loadJSON("sizes.json"),
    loadJSON("soundfx.json"),
  ]);
}

// Accessors
export const getTERRAINS    = () => TERRAINS;
export const getCONDITIONS  = () => CONDITIONS;
export const getPROPS       = () => PROPS;
export const getSTAMPS      = () => STAMPS;
export const getSIZES       = () => SIZES;
export const getDICE        = () => DICE;
export const getSOUNDFX     = () => SOUNDFX;

// Lookup maps
export const terrainById    = (id) => TERRAINS.find(t => t.id === id);
export const conditionById  = (id) => CONDITIONS.find(c => c.id === id);
export const propById       = (id) => PROPS.find(p => p.id === id);

// Constants
export const TILE            = 32;
export const FEET_PER_TILE   = 5;
export const TEXTURE_PATH    = "./textures/";
export const TOKEN_PATH      = "./tokens/";
export const PROP_PATH       = "./props/";
export const SOUNDS_PATH     = "./sounds/";
export const MATERIAL_PATH   = "./assets/";
export const BG_SCALE        = 32 / 70; // DA map scale factor

// 3D views (planner.html / planner-viewer.html) are disabled until the new
// 3D system replaces them. Flip to true to bring back the GM 3D panel in
// mapeditor.html and the player 3D picture-in-picture in index.html.
export const ENABLE_3D = false;
