// Triggers — puzzle mechanics: occupancy plates (pressure plate / tripwire)
// and interaction switches (lever / button), grouped into puzzle groups that
// drive a target door's locked/closed state directly. Nothing else in the
// app needs to know a door is puzzle-controlled -- it's just a normal door
// whose fields happen to be written by this system instead of a DM click.
//
// Two independent parameters cover the whole taxonomy:
//   method: "occupancy" (something is standing on it) | "interaction" (clicked)
//   mode:   "latch" (stays triggered once met) | "momentary" (only while true)
//
// occupancy + latch      = Pressure Plate
// occupancy + momentary  = Momentary Pressure Plate / Tripwire
// interaction + latch    = Lever
// interaction + momentary= Button (pulses for BUTTON_PULSE_MS after click)

import { db } from "./firebase.js";
import { ref, set, get } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

export const BUTTON_PULSE_MS = 3000;

// ── Save helpers ──────────────────────────────────────────────────────────────

export async function saveTriggers(mapName, triggers) {
  await set(ref(db, `maps/${mapName}/triggers`), Object.keys(triggers).length ? triggers : null);
}

export async function savePuzzleGroups(mapName, groups) {
  await set(ref(db, `maps/${mapName}/puzzleGroups`), Object.keys(groups).length ? groups : null);
}

// ── Live "is this trigger currently satisfied" checks ─────────────────────────

/** Occupancy trigger (plate) -- true if the mode's condition currently holds.
 *  occupiedKeys: a Set of "x,y" strings for every cell a token currently sits on. */
export function isPlateActive(plateData, key, occupiedKeys) {
  if (plateData.mode === "momentary") return occupiedKeys.has(key);
  return !!plateData.triggered; // latch: persisted, never auto-clears
}

/** Interaction trigger (lever/button prop) -- true if currently satisfied. */
export function isPropTriggerActive(trigger) {
  if (!trigger) return false;
  if (trigger.mode === "momentary") {
    return !!trigger.active && (Date.now() - (trigger.activatedAt || 0)) < BUTTON_PULSE_MS;
  }
  return !!trigger.active; // latch: stays wherever it was last set
}

/** Is every trigger belonging to `groupId` currently active? Pure function --
 *  callers write the result to a door's locked/closed fields themselves. */
export function isGroupSolved(groupId, triggers, props, occupiedKeys) {
  const plateEntries = Object.entries(triggers).filter(([, t]) => t.groupId === groupId);
  const propEntries = Object.entries(props).filter(([, p]) => p.trigger?.groupId === groupId);
  if (!plateEntries.length && !propEntries.length) return false; // empty group, never "solved"
  for (const [key, t] of plateEntries) {
    if (!isPlateActive(t, key, occupiedKeys)) return false;
  }
  for (const [, p] of propEntries) {
    if (!isPropTriggerActive(p.trigger)) return false;
  }
  return true;
}

/** Recomputes a group's solved state and, if it changed, writes the new
 *  open/locked state to its target door. Call this after any trigger change
 *  (movement, lever/button click). Safe to call even if the group has no
 *  target door configured (no-op in that case). */
export async function syncGroupDoor(mapName, groupId, group, triggers, props, doors, occupiedKeys) {
  if (!group?.targetDoorId) return;
  const door = doors.find(d => d.id === group.targetDoorId);
  if (!door) return;
  const solved = isGroupSolved(groupId, triggers, props, occupiedKeys);
  const shouldBeOpen = solved;
  if (door.locked === !shouldBeOpen && door.closed === !shouldBeOpen) return; // already correct
  door.locked = !shouldBeOpen;
  door.closed = !shouldBeOpen;
  await set(ref(db, `maps/${mapName}/geometry/doors`), doors);
}

/** Clears all latch state for every trigger in a group -- the DM's "reset
 *  puzzle" action. Momentary triggers need no reset (they're never persisted
 *  as triggered in the first place). */
export async function resetPuzzleGroup(mapName, groupId, triggers, props) {
  let changed = false;
  for (const [key, t] of Object.entries(triggers)) {
    if (t.groupId === groupId && t.mode === "latch" && t.triggered) { t.triggered = false; changed = true; }
  }
  const propUpdates = {};
  for (const [key, p] of Object.entries(props)) {
    if (p.trigger?.groupId === groupId && p.trigger.mode === "latch" && p.trigger.active) {
      p.trigger.active = false;
      propUpdates[key] = p;
      changed = true;
    }
  }
  if (changed) {
    await saveTriggers(mapName, triggers);
    if (Object.keys(propUpdates).length) await set(ref(db, `maps/${mapName}/props`), Object.keys(props).length ? props : null);
  }
}
