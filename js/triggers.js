// Trigger Nodes — unified relay system replacing the old Portal, Trap, and
// group-based puzzle prototype. One node shape covers all six visual types;
// behavior comes entirely from independent condition/persistence/effect
// parameters plus a DIRECTED link to another node or a door. Because links
// point at a specific node (not a shared symmetric number the way the old
// Portal did), chains and loops fall out naturally: A->B->C->A is just three
// nodes each linking to the next.
//
// Node shape (stored in maps/{map}/triggerNodes, keyed by cell "x,y"):
// {
//   id,                          -- stable unique id, independent of position
//   type: "portal"|"tripwire"|"trap"|"latch"|"lever"|"plate",  -- visual only
//   condition: "step"|"flip",    -- step = occupancy, flip = click/interact
//   persistence: "latch"|"momentary",
//   effect: "move"|"activate"|"damage"|"effect",
//   linkKind: "node"|"door"|null,  -- what linkTo addresses
//   linkTo: id|null,               -- directed target for move/activate
//   damageAmount,                  -- effect=damage, e.g. "2d6"
//   effectText,                    -- effect=effect, custom narrative message
//   triggered: false,              -- persisted state for condition=step + persistence=latch
//   active: false, activatedAt: 0, -- persisted state for condition=flip
// }

import { db } from "./firebase.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

export const BUTTON_PULSE_MS = 3000;

export async function saveTriggerNodes(mapName, nodes) {
  await set(ref(db, `maps/${mapName}/triggerNodes`), Object.keys(nodes).length ? nodes : null);
}

export function genNodeId() {
  return "node_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
}

/** Is this node currently satisfied, right now? */
export function isNodeActive(node, key, occupiedKeys) {
  if (node.condition === "step") {
    if (node.persistence === "momentary") return occupiedKeys.has(key);
    return !!node.triggered;
  }
  // condition === "flip"
  if (node.persistence === "momentary") {
    return !!node.active && (Date.now() - (node.activatedAt || 0)) < BUTTON_PULSE_MS;
  }
  return !!node.active;
}

/** Finds the node a given node links to, if any. */
export function resolveLinkedNode(node, nodes) {
  if (node.linkKind !== "node" || !node.linkTo) return null;
  for (const n of Object.values(nodes)) if (n.id === node.linkTo) return n;
  return null;
}

export function resolveLinkedDoor(node, doors) {
  if (node.linkKind !== "door" || !node.linkTo) return null;
  return doors.find(d => d.id === node.linkTo) || null;
}

/** Rolls a simple dice string like "2d6" or "1d4+2". Returns {total, text}. */
export function rollDamage(diceStr) {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/i.exec((diceStr || "1d6").trim());
  if (!m) return { total: 0, text: "0" };
  const count = parseInt(m[1], 10), sides = parseInt(m[2], 10), mod = parseInt(m[3] || "0", 10);
  let total = mod;
  const rolls = [];
  for (let i = 0; i < count; i++) { const r = 1 + Math.floor(Math.random() * sides); rolls.push(r); total += r; }
  return { total: Math.max(0, total), text: `${diceStr} (${rolls.join("+")}${mod ? (mod > 0 ? "+" + mod : mod) : ""})` };
}

/** For every effect="activate" node, keeps its linked door/node state synced
 *  to its own current active state. Safe to call from every client on every
 *  update -- writes are idempotent (re-writing the same correct value is a
 *  no-op in effect). This is what makes momentary activate-effects reverse
 *  automatically when their condition drops, without any special-casing. */
export async function syncActivateEffects(mapName, nodes, doors, occupiedKeys) {
  let doorsChanged = false;
  const nodeWrites = {};
  for (const [key, node] of Object.entries(nodes)) {
    if (node.effect !== "activate" || !node.linkTo) continue;
    const isActive = isNodeActive(node, key, occupiedKeys);
    if (node.linkKind === "door") {
      const door = doors.find(d => d.id === node.linkTo);
      if (!door) continue;
      const shouldBeOpen = isActive;
      if (door.locked === !shouldBeOpen && door.closed === !shouldBeOpen) continue;
      door.locked = !shouldBeOpen; door.closed = !shouldBeOpen;
      doorsChanged = true;
    } else if (node.linkKind === "node") {
      for (const [tKey, target] of Object.entries(nodes)) {
        if (target.id !== node.linkTo) continue;
        if (target.condition !== "flip") continue; // only flip-condition nodes can be externally activated
        if (!!target.active === isActive) continue;
        nodeWrites[tKey] = { ...target, active: isActive, activatedAt: isActive ? Date.now() : target.activatedAt };
      }
    }
  }
  if (doorsChanged) await set(ref(db, `maps/${mapName}/geometry/doors`), doors);
  if (Object.keys(nodeWrites).length) {
    Object.assign(nodes, nodeWrites);
    await saveTriggerNodes(mapName, nodes);
  }
}


