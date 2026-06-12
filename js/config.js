// Loads all config JSONs and exports them as constants
// Also derives lookup maps for fast access

const BASE = "./config/";

async function loadJSON(file) {
  const res = await fetch(BASE + file);
  return res.json();
}

let TERRAINS, CONDITIONS, PROPS, STAMPS, SIZES, DICE;

export async function loadConfig() {
  [TERRAINS, CONDITIONS, PROPS, STAMPS, DICE, SIZES] = await Promise.all([
    loadJSON("terrains.json"),
    loadJSON("conditions.json"),
    loadJSON("props.json"),
    loadJSON("stamps.json"),
    loadJSON("dice.json"),
    loadJSON("sizes.json"),
  ]);
}

// Accessors
export const getTERRAINS    = () => TERRAINS;
export const getCONDITIONS  = () => CONDITIONS;
export const getPROPS       = () => PROPS;
export const getSTAMPS      = () => STAMPS;
export const getSIZES       = () => SIZES;
export const getDICE        = () => DICE;

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
export const BG_SCALE        = 32 / 70; // DA map scale factor
