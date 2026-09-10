// Trigger Nodes.
//
// Two independent systems share this file and the same triggerNodes storage
// (keyed by cell "x,y" in maps/{map}/triggerNodes), distinguished by
// node.type:
//
// 1. type: "portal" -- unchanged, original system. Teleports whoever
//    triggers it to a linked node. Still uses trigger/persistence/effect/
//    conditionLinkTo/linkKind="node"/damageAmount/effectText -- see
//    isNodeActive, resolveLinkedNode, rollDamage below. Do not repurpose
//    these for anything else; index-layers.html's fireNodeOneShotEffect,
//    toggleFlipNode, and evaluateAllNodes all depend on this exact shape.
//
// 2. type: "trigger" -- a lever: interact with it (spacebar or right-click
//    in viewer.html/index-layers.html) and it toggles, holding its state
//    until flipped again. Replaces the old tripwire/trap/latch/lever/plate
//    node types and the drag-to-wire Connect tool entirely. Shape:
//    {
//      id,
//      type: "trigger",
//      textureId,                 -- swatch name, looks up ./props/<textureId>.png for its icon -- purely cosmetic, no behavior tied to it
//      on: false,                 -- persisted toggle state
//      linkKind: "door"|"light"|null,
//      linkTo: id|null,           -- target's id (a geometry.doors or geometry.lights entry)
//    }

import { db } from "./firebase.js";
import { ref, set, update } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

export const BUTTON_PULSE_MS = 3000;

export async function saveTriggerNodes(mapName, nodes) {
  await set(ref(db, `maps/${mapName}/triggerNodes`), Object.keys(nodes).length ? nodes : null);
}

export function genNodeId() {
  return "node_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
}

// ─────────────────────────────────────────────────────────────────────────
// Portal system -- UNCHANGED from the original file. Kept exactly as-is so
// index-layers.html's existing portal code keeps working untouched.
// ─────────────────────────────────────────────────────────────────────────

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

/** For every effect="activate" PORTAL-system node, keeps its linked door/node
 *  state synced to its own current active state. Unchanged -- only
 *  processes nodes still using the old trigger/persistence/effect shape;
 *  new type:"trigger" nodes are skipped here and handled by
 *  syncTriggerEffects instead. */
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

// ─────────────────────────────────────────────────────────────────────────
// New unified trigger system -- type: "trigger" nodes only. Just one
// behavior for now: a lever you interact with (spacebar or right-click)
// that toggles and holds. Node shape:
//   { id, type: "trigger", textureId, on: false, linkKind, linkTo }
// ─────────────────────────────────────────────────────────────────────────

/** Is this type:"trigger" node currently on? Just its own persisted state --
 *  no occupancy, no timing, no condition-gating. */
export function isTriggerOn(node) {
  return !!node.on;
}

export function resolveLinkedDoor(node, doors) {
  if (node.linkKind !== "door" || !node.linkTo) return null;
  return doors.find(d => d.id === node.linkTo) || null;
}

export function resolveLinkedLight(node, lights) {
  if (node.linkKind !== "light" || !node.linkTo) return null;
  return lights.find(l => l.id === node.linkTo) || null;
}

/** Flip a lever. Call this when a player interacts with it (spacebar or
 *  right-click) -- nothing else fires a trigger in this simplified system. */
export async function fireTrigger(mapName, nodeKey, node) {
  await set(ref(db, `maps/${mapName}/triggerNodes/${nodeKey}/on`), !node.on);
}

/** Keeps every door/light synced to the triggers pointing at it. A target
 *  can have any number of triggers added to it (via the "Add trigger" flow
 *  in the host page) -- when it has more than one, ALL of them must be on
 *  for the target to activate (a plain AND, no other logic). A target with
 *  only one trigger behaves exactly as if this grouping didn't exist.
 *  Safe to call from every client whenever a lever flips -- writes are
 *  idempotent. Portal-system nodes (type:"portal") are untouched -- see
 *  syncActivateEffects for those. */
export async function syncTriggerEffects(mapName, nodes, doors, lights) {
  const groups = new Map(); // "door:<id>" or "light:<id>" -> [{key,node}, ...]
  for (const [key, node] of Object.entries(nodes)) {
    if (node.type !== "trigger" || !node.linkTo) continue;
    const groupKey = `${node.linkKind}:${node.linkTo}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push({ key, node });
  }

  let doorsChanged = false, lightsChanged = false;
  for (const [groupKey, entries] of groups) {
    const [kind, id] = groupKey.split(":");
    const allOn = entries.every(({ node }) => isTriggerOn(node));
    if (kind === "door") {
      const door = doors.find(d => d.id === id);
      if (!door) continue;
      // "opens" and "unlocks" are the same underlying action here -- a
      // locked door unlocking IS it opening, just described from the
      // player's side of an initially-locked door.
      if (door.closed === !allOn && door.locked === !allOn) continue;
      door.closed = !allOn; door.locked = !allOn;
      doorsChanged = true;
    } else if (kind === "light") {
      const light = lights.find(l => l.id === id);
      if (!light) continue;
      if ((light.on !== false) === allOn) continue;
      light.on = allOn;
      lightsChanged = true;
    }
  }
  if (doorsChanged) await set(ref(db, `maps/${mapName}/geometry/doors`), doors);
  if (lightsChanged) await set(ref(db, `maps/${mapName}/geometry/lights`), lights);
}
