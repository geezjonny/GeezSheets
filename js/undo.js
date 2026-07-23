// Undo/Redo — snapshot-based history for map editing
// Snapshots: tiles only. wallGroups/fogGroups were removed along with the old
// tile-based wall/door system and manual fog painting.

import { saveTiles } from "./map.js";

const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 50;

let _state    = null; // reference to { tiles }
let _mapName  = null; // getter fn → current map name
let _toast    = null; // fn(msg) for feedback

export function initUndo(stateRef, getMapName, toastFn) {
  _state   = stateRef;
  _mapName = getMapName;
  _toast   = toastFn;
}

function snapshot() {
  return JSON.stringify({
    tiles: _state.tiles,
  });
}

function restore(s) {
  const snap = JSON.parse(s);
  for (const k in _state.tiles) delete _state.tiles[k];
  Object.assign(_state.tiles, snap.tiles || {});
}

async function persist() {
  const m = _mapName();
  await saveTiles(m, _state.tiles);
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
