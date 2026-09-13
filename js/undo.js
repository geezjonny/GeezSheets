// Undo/Redo — snapshot-based history for map editing
// Snapshots whatever keyed data objects the caller passes to initUndo
// (e.g. {tiles, elevation}) -- generic by design, so adding a new
// undo-tracked layer later means updating the initUndo call site, not
// this file, as long as persisting it just means calling one more
// saveX(mapName, data) function below.

import { saveTiles, saveElevation } from "./map.js";

const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 50;

let _state    = null; // reference to an object of tracked data objects, e.g. { tiles, elevation }
let _mapName  = null; // getter fn → current map name
let _toast    = null; // fn(msg) for feedback

export function initUndo(stateRef, getMapName, toastFn) {
  _state   = stateRef;
  _mapName = getMapName;
  _toast   = toastFn;
}

function snapshot() {
  const snap = {};
  for (const k in _state) snap[k] = _state[k];
  return JSON.stringify(snap);
}

function restore(s) {
  const snap = JSON.parse(s);
  for (const k in _state) {
    for (const key in _state[k]) delete _state[k][key];
    Object.assign(_state[k], snap[k] || {});
  }
}

async function persist() {
  const m = _mapName();
  if (_state.tiles) await saveTiles(m, _state.tiles);
  if (_state.elevation) await saveElevation(m, _state.elevation);
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
