// Layers — mapeditor layer palette system
// Manages active layer, sub-modes, and per-layer canvas opacity

// ── Layer definitions ─────────────────────────────────────────────────────────
//
// Layer stack (render order bottom → top):
//   bg       Background image
//   ground   Terrain tiles
//   walls    Wall groups + doors
//   fog      Fog of war / darkness / magical
//   objects  Tokens, props, stamps
//   nav      Navigation tools (ping, ruler — no opacity effect)

export const LAYERS = ["bg", "ground", "walls", "fog", "objects", "nav"];

// Layer display config
export const LAYER_CONFIG = {
  bg:      { label: "Background", icon: "🗺",  palClass: "active-bg"      },
  ground:  { label: "Ground",     icon: "🟫",  palClass: "active-ground"  },
  walls:   { label: "Walls",      icon: "🧱",  palClass: "active-walls"   },
  fog:     { label: "Fog",        icon: "🌫",  palClass: "active-fog"     },
  objects: { label: "Objects",    icon: "⚔",   palClass: "active-objects" },
  nav:     { label: "Nav",        icon: "🧭",  palClass: "active-nav"     },
};

// ── Opacity table ─────────────────────────────────────────────────────────────
// activeLayer → { layerName: alpha }
// objects and nav always show everything at 100%
// Tokens are minimum 0.6 regardless

const OPACITY_TABLE = {
  bg:      { bg: 1.0, ground: 0.7, walls: 0.4, fog: 0.4, tokens: 0.6 },
  ground:  { bg: 1.0, ground: 1.0, walls: 0.7, fog: 0.4, tokens: 0.6 },
  walls:   { bg: 1.0, ground: 0.7, walls: 1.0, fog: 0.7, tokens: 0.6 },
  fog:     { bg: 1.0, ground: 0.4, walls: 0.7, fog: 1.0, tokens: 0.6 },
  objects: { bg: 1.0, ground: 1.0, walls: 1.0, fog: 1.0, tokens: 1.0 },
  nav:     { bg: 1.0, ground: 1.0, walls: 1.0, fog: 1.0, tokens: 1.0 },
};

export function getLayerOpacity(activeLayer, layer) {
  return OPACITY_TABLE[activeLayer]?.[layer] ?? 1.0;
}

// ── State ─────────────────────────────────────────────────────────────────────
let _activeLayer  = "ground";
let _wallSub      = "paint";   // "paint" | "door" | "erase"
let _objSub       = "token";   // "token" | "prop" | "stamp"
let _fogType      = "fog";     // "fog" | "darkness" | "magical"
let _onChangeCallbacks = [];

export function getActiveLayer()  { return _activeLayer; }
export function getWallSub()      { return _wallSub;     }
export function getObjSub()       { return _objSub;      }
export function getFogType()      { return _fogType;      }

export function onLayerChange(fn) { _onChangeCallbacks.push(fn); }

function notify() { _onChangeCallbacks.forEach(fn => fn(_activeLayer)); }

// ── Setters ───────────────────────────────────────────────────────────────────
export function setLayer(layer) {
  if (!LAYERS.includes(layer)) return;
  _activeLayer = layer;
  _updatePaletteUI();
  _updateOptionsUI();
  notify();
}

export function setWallSub(sub) {
  _wallSub = sub;
  ["paint","door","erase"].forEach(s => {
    document.getElementById(`walls-sub-${s}`)?.classList.toggle("active", s===sub);
  });
  document.getElementById("walls-paint-opts").style.display = sub==="paint" ? "" : "none";
  document.getElementById("walls-door-opts").style.display  = sub==="door"  ? "" : "none";
  document.getElementById("walls-erase-opts").style.display = sub==="erase" ? "" : "none";
}

export function setObjSub(sub) {
  _objSub = sub;
  ["token","prop","stamp"].forEach(s => {
    document.getElementById(`obj-sub-${s}`)?.classList.toggle("active", s===sub);
  });
  document.getElementById("obj-token-opts").style.display = sub==="token" ? "" : "none";
  document.getElementById("obj-prop-opts").style.display  = sub==="prop"  ? "" : "none";
  document.getElementById("obj-stamp-opts").style.display = sub==="stamp" ? "" : "none";
}

export function setFogType(type) {
  _fogType = type;
  document.querySelectorAll(".opt-fog-btn").forEach(btn => {
    const t = btn.dataset.fogtype;
    btn.classList.toggle(`active-${t}`, t === type);
  });
}

// ── UI sync ───────────────────────────────────────────────────────────────────
function _updatePaletteUI() {
  LAYERS.forEach(l => {
    const btn = document.getElementById(`pal-${l}`);
    if (!btn) return;
    btn.className = "pal-btn";
    if (l === _activeLayer) btn.classList.add(LAYER_CONFIG[l].palClass);
  });
}

function _updateOptionsUI() {
  LAYERS.forEach(l => {
    const el = document.getElementById(`opt-${l}`);
    if (el) el.style.display = l===_activeLayer ? "" : "none";
  });
  const title = document.getElementById("options-title");
  if (title) title.textContent = LAYER_CONFIG[_activeLayer].label;
}

// ── Init ──────────────────────────────────────────────────────────────────────
// Call once after DOM is ready to set initial state
export function initLayers() {
  _updatePaletteUI();
  _updateOptionsUI();
  setWallSub(_wallSub);
  setObjSub(_objSub);
  setFogType(_fogType);

  // Wire palette buttons (they call setLayer via onclick in HTML,
  // but also expose window.setLayer for safety)
  window.setLayer   = setLayer;
  window.setWallSub = setWallSub;
  window.setObjSub  = setObjSub;
  window.setFogType = setFogType;
}

// ── Interaction routing ───────────────────────────────────────────────────────
// Returns what action a pointer-down should take given the current layer state.
// Used by mapeditor's canvas event handlers.

export function routePointerDown(tx, ty, wx, wy, currentShape, currentTerrain) {
  switch (_activeLayer) {
    case "bg":      return { action: "pan" };
    case "ground":  return currentShape === "select"
                           ? { action: "select" }
                           : { action: "paint-terrain" };
    case "walls":
      if (_wallSub === "paint")  return { action: "paint-wall" };
      if (_wallSub === "door")   return { action: "place-door" };
      if (_wallSub === "erase")  return { action: "erase-wall" };
      break;
    case "fog":     return { action: "paint-fog", fogType: _fogType };
    case "objects":
      if (_objSub === "token") return { action: "place-token" };
      if (_objSub === "prop")  return { action: "place-prop" };
      if (_objSub === "stamp") return { action: "place-stamp" };
      break;
    case "nav":     return { action: "pan" };
  }
  return { action: "pan" };
}

export function routeRightClick(tx, ty) {
  switch (_activeLayer) {
    case "ground":  return { action: "erase-tile" };
    case "walls":   return { action: "erase-wall" };
    case "fog":     return { action: "erase-fog" };
    case "objects": return { action: "ctx-menu" };
    default:        return { action: "ctx-menu" };
  }
}
