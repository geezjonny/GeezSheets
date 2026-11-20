// triggers.js: the if/then rules. Evaluates groups against object and token state and returns the
// Firebase changes to make. Pure: no Firebase, no DOM.
//
// groups: { id: { when: [cond], then: [act], met: bool } }
//   cond: { id, state }  object is in that state (a Sight object is "sees" while it has a player/NPC in view)      |  { id, at: {x,y} }  object/token is at that spot
//   act:  { id, action: "<state name>" }   level-based: while met -> that state, else back to start
//         { id, action: "toggle" }         edge-based: flips each time `when` becomes met
//         { id, action: "move", to:{x,y} } level-based for objects (back to start when unmet), once for tokens
//         { id, action: "fire" }           edge-based, latches "fired" until a GM reset (event kinds)

import { statesOf, startOf, derive } from "./objects.js";

// Returns { "objects/door1/state": "open", ... } paths relative to /test. Empty when nothing changes.
export function evaluate({ objects = {}, groups = {}, tokens = {}, blockers = [] }) {
  const changes = {}, states = {};
  for (const [id, o] of Object.entries(objects)) {
    states[id] = derive(o, tokens, blockers);
    if (states[id] !== o.state) changes[`objects/${id}/state`] = states[id];
  }
  const spot = (id) => objects[id] || tokens[id];
  for (const [gid, g] of Object.entries(groups)) {
    const when = g.when || [];
    const met = when.length > 0 && when.every((c) => {
      if (c.at) { const p = spot(c.id); return !!p && p.x === c.at.x && p.y === c.at.y; }
      return states[c.id] === c.state;
    });
    const rising = met && !g.met;
    for (const a of g.then || []) {
      const t = objects[a.id], tok = tokens[a.id];
      if (a.action === "move" && a.to) {
        if (t) { const w = met ? a.to : { x: t.sx ?? t.x, y: t.sy ?? t.y }; if (t.x !== w.x || t.y !== w.y) { changes[`objects/${a.id}/x`] = w.x; changes[`objects/${a.id}/y`] = w.y; } }
        else if (tok && rising) { changes[`tokens/${a.id}/x`] = a.to.x; changes[`tokens/${a.id}/y`] = a.to.y; }
        continue;
      }
      if (!t) continue;
      let want;
      if (a.action === "toggle") { if (!rising) continue; const [s0, s1] = statesOf(t); want = states[a.id] === s0 ? s1 : s0; }
      else if (a.action === "fire") { if (!rising) continue; want = "fired"; }
      else want = met ? a.action : t.start;
      if (want !== states[a.id]) { states[a.id] = want; changes[`objects/${a.id}/state`] = want; }
    }
    if (met !== !!g.met) changes[`groups/${gid}/met`] = met;
  }
  return changes;
}

// Put everything back to its start state and start position.
export function resetAll(objects = {}, groups = {}) {
  const c = {};
  for (const [id, o] of Object.entries(objects)) {
    c[`objects/${id}/state`] = o.start ?? startOf(o);
    if (o.sx != null) { c[`objects/${id}/x`] = o.sx; c[`objects/${id}/y`] = o.sy; }
  }
  for (const id of Object.keys(groups)) c[`groups/${id}/met`] = false;
  return c;
}
