// Undo/redo (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) for user edits. put/patch here mirror store.js but record the
// previous values; writes made in the same tick become one undo step. Rule-driven writes use store.js directly.
import { put as rawPut, patch as rawPatch } from "../store.js";
import { S } from "./state.js";

const past = [], future = [];
let open = null;
const getAt = (path) => {
  let v = S; for (const k of path.split("/")) { v = v?.[k]; if (v === undefined) return null; }
  return v === undefined ? null : JSON.parse(JSON.stringify(v));
};
function record(changes) {
  if (!S.isGM) return;
  if (!open) { open = { before: {}, after: {} }; past.push(open); future.length = 0; queueMicrotask(() => { open = null; }); if (past.length > 100) past.shift(); }
  for (const [p, v] of Object.entries(changes)) { if (!(p in open.before)) open.before[p] = getAt(p); open.after[p] = v === undefined ? null : v; }
}
export const put = (path, value) => { record({ [path]: value }); return rawPut(path, value); };
export const patch = (changes) => { record(changes); return rawPatch(changes); };
export function undo() { const e = past.pop(); if (e) { future.push(e); rawPatch(e.before); } }
export function redo() { const e = future.pop(); if (e) { past.push(e); rawPatch(e.after); } }
document.addEventListener("keydown", (e) => {
  if (!S.isGM || !(e.ctrlKey || e.metaKey) || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  const k = e.key.toLowerCase();
  if (k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (k === "y") { e.preventDefault(); redo(); }
});
