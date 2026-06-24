// Undo/Redo — snapshot-based history for map editing
// Snapshots: tiles, wallGroups, fogGroups (the three painted layers)
// Roofs removed from system per design decision

import { saveFog }                    from "./fog.js";
import { saveWallGroups, saveTiles }  from "./map.js";

const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 50;

let _state    = null; // reference to { tiles, wallGroups, fogGroups }
let _mapName  = null; // getter fn → current map name
let _toast    = null; // fn(msg) for feedback

export function initUndo(stateRef, getMapName, toastFn) {
  _state   = stateRef;
  _mapName = getMapName;
  _toast   = toastFn;
}

function snapshot() {
  return JSON.stringify({
    tiles:      _state.tiles,
    wallGroups: _state.wallGroups,
    fogGroups:  _state.fogGroups,
  });
}

function restore(s) {
  const snap = JSON.parse(s);
  // Clear and repopulate each layer
  for (const k in _state.tiles)      delete _state.tiles[k];
  for (const k in _state.wallGroups) delete _state.wallGroups[k];
  for (const k in _state.fogGroups)  delete _state.fogGroups[k];
  Object.assign(_state.tiles,      snap.tiles      || {});
  Object.assign(_state.wallGroups, snap.wallGroups || {});
  Object.assign(_state.fogGroups,  snap.fogGroups  || {});
}

async function persist() {
  const m = _mapName();
  await Promise.all([
    saveTiles(m, _state.tiles),
    saveWallGroups(m, _state.wallGroups),
    saveFog(m, _state.fogGroups),
  ]);
}

export function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
}

export async function undo() {
  if (!undoStack.length) { _toast?.("Nothing to undo"); return; }
  redoStack.push(snapshot());
  restore(undoStack.pop());
  await persist();
}

export async function redo() {
  if (!redoStack.length) { _toast?.("Nothing to redo"); return; }
  undoStack.push(snapshot());
  restore(redoStack.pop());
  await persist();
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }
