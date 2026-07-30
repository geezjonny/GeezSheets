// Trigger Nodes — unified relay system replacing the old Portal, Trap, and
// group-based puzzle prototype. One node shape covers all six visual types;
// behavior comes from independent trigger/persistence/condition/effect
// parameters plus DIRECTED links. Because links point at a specific node
// (not a shared symmetric number the way the old Portal did), chains and
// loops fall out naturally: A->B->C->A is just three nodes each linking to
// the next.
//
// Node shape (stored in maps/{map}/triggerNodes, keyed by cell "x,y"):
// {
//   id,                          -- stable unique id, independent of position
//   type: "portal"|"tripwire"|"trap"|"latch"|"lever"|"plate",  -- visual only
//   trigger: "step"|"flip",      -- step = occupancy, flip = click/interact
//   persistence: "latch"|"momentary",
//   conditionLinkTo: id|null,    -- OPTIONAL external gate: another node's id.
//                                   If set, this node's effect only fires when
//                                   ITS OWN trigger is satisfied AND the linked
//                                   node is in conditionState. e.g. a plate
//                                   (trigger=step) with conditionLinkTo=lever1,
//                                   conditionState="active" only opens its
//                                   door while the plate is stepped on AND
//                                   lever1 is flipped on.
//   conditionState: "active"|"inactive",  -- required state of the condition link
//   effect: "move"|"activate"|"damage"|"effect",
//   linkKind: "node"|"door"|null,  -- what linkTo addresses (the EFFECT's target)
//   linkTo: id|null,               -- directed target for move/activate
//   damageAmount,                  -- effect=damage, e.g. "2d6"
//   effectText,                    -- effect=effect, custom narrative message
//   triggered: false,              -- persisted state for trigger=step + persistence=latch
//   active: false, activatedAt: 0, -- persisted state for trigger=flip
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

/** Is this node's OWN trigger currently satisfied, ignoring any condition gate. */
function isOwnTriggerActive(node, key, occupiedKeys) {
  if (node.trigger === "step") {
    if (node.persistence === "momentary") return occupiedKeys.has(key);
    return !!node.triggered;
  }
  // trigger === "flip"
  if (node.persistence === "momentary") {
    return !!node.active && (Date.now() - (node.activatedAt || 0)) < BUTTON_PULSE_MS;
  }
  return !!node.active;
}

/** Is this node currently satisfied, right now -- own trigger AND (if set) its
 *  external condition gate. `nodes` is the full map keyed by "x,y", needed to
 *  resolve the condition link and recurse into it. `_visited` guards against
 *  circular condition chains (A's condition is B, B's condition is A). */
export function isNodeActive(node, key, occupiedKeys, nodes, _visited) {
  if (!isOwnTriggerActive(node, key, occupiedKeys)) return false;
  if (!node.conditionLinkTo || !nodes) return true;
  const visited = _visited || new Set();
  if (visited.has(node.id)) return false; // circular condition chain -- fail closed
  visited.add(node.id);
  let condEntry = null;
  for (const [k, n] of Object.entries(nodes)) if (n.id === node.conditionLinkTo) { condEntry = [k, n]; break; }
  if (!condEntry) return false; // dangling condition link -- fail closed
  const [condKey, condNode] = condEntry;
  const condActive = isNodeActive(condNode, condKey, occupiedKeys, nodes, visited);
  const wantActive = node.conditionState !== "inactive"; // default: require active
  return condActive === wantActive;
}

/** Finds the node a given node's EFFECT links to, if any. */
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
 *  to its own current active state (trigger AND condition gate combined).
 *  Safe to call from every client on every update -- writes are idempotent.
 *  This is what makes momentary activate-effects reverse automatically when
 *  their trigger or condition drops, without any special-casing. */
export async function syncActivateEffects(mapName, nodes, doors, occupiedKeys) {
  let doorsChanged = false;
  const nodeWrites = {};
  for (const [key, node] of Object.entries(nodes)) {
    if (node.effect !== "activate" || !node.linkTo) continue;
    const isActive = isNodeActive(node, key, occupiedKeys, nodes);
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
        if (target.trigger !== "flip") continue; // only flip-trigger nodes can be externally activated
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
