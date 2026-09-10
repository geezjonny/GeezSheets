// Trigger Nodes -- portal only. The lever/trigger system (type:"trigger"
// nodes, texture swatches, door/light linking, spacebar/click interaction)
// was removed entirely in favor of doors just being manually
// locked/unlocked by the GM -- simpler, no automation to keep in sync
// across three files. This file now exists solely to support portals:
// teleporting whoever triggers one to a linked node. Do not repurpose any
// of this for anything else; index-layers.html's fireNodeOneShotEffect,
// toggleFlipNode, and evaluateAllNodes all depend on this exact shape.
//
// Portal node shape (stored in maps/{map}/triggerNodes, keyed by cell
// "floor,x,y"):
// {
//   id, type: "portal",
//   trigger: "step", persistence: "momentary", effect: "move", -- fixed, not configurable
//   linkKind: "node"|null, linkTo: id|null, -- the other portal it's linked to
//   conditionLinkTo: null, triggered: false, active: false, activatedAt: 0,
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
 *  to its own current active state. Portal nodes have effect="move", not
 *  "activate", so this never touches them -- kept only in case a map still
 *  has an old activate-style node saved from before the lever system was
 *  removed. */
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
