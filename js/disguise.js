// Disguise — an alternate visual for a token or prop. The original design was
// a GLOBAL override (same for DM and every player) -- that part is unchanged
// and stays the default. This adds an OPTIONAL per-player scope on top: a
// disguise can now target specific players instead of everyone, for cases
// like a personal curse/hallucination where only one player's screen shows
// something different and everyone else sees the truth. This is NOT the
// per-viewer illusion tried earlier and abandoned (where a token's own
// controlling player saw truth and everyone else saw a lie, meant to fool
// the whole table) -- nobody's being deceived as a group here, so the old
// "shared-map movement gives it away" problem doesn't apply. The DM's own
// view is untouched either way: mapeditor.html never passes a viewer id, so
// it keeps seeing exactly what it always has, regardless of targeting.
//
// A token can carry MULTIPLE disguise rules at once, each with its own
// targeting -- e.g. "looks like an enemy to players 1-3, looks like a
// commoner to players 4-6". This is the same targeted-resolution framework
// as a single disguise, just checked against a list instead of one entry;
// the first rule whose visibleTo matches the viewer wins.
//
// Token disguise rule shape: { lookupName, displayName, mirrorHpFrom, visibleTo }
//   - lookupName/displayName: what's shown on the map instead of the token's
//     own name/portrait. The token's own name/lookupName/characterId are
//     never touched -- they stay intact in the token's own data, visible via
//     the edit modal, for the DM's own bookkeeping.
//   - mirrorHpFrom: optional token id. If set, the HP bar shown also mirrors
//     that OTHER token's current HP instead of this token's own -- for an
//     NPC decoy that should visually track a specific character's health.
//     Leave unset for a PC disguised as something else, since their own
//     stats should keep working normally.
//   - visibleTo: "all" (or unset), "all-active", or an array of token ids --
//     when an array, only those specific players' own tokens resolve to
//     this rule; everyone else falls through to the next rule (or the
//     token's true appearance, if no rule matches).
//
// tok.disguises holds the list of rules. tok.disguise (singular) is the
// older, one-rule shape -- still read and treated as a one-item list, so
// tokens set up before this extension keep working unchanged.
//
// Prop disguise shape (prop.disguise): { propId }
//   - propId: an alternate prop definition to render with (art + footprint).
//     The prop's own propId, and anything else about it (container contents,
//     trigger links, attachment), is untouched. Props only ever have one
//     disguise -- no per-player targeting for props.

import { db } from "./firebase.js";
import { ref, update } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

export async function saveTokenDisguises(mapName, tokId, disguises) {
  await update(ref(db, `maps/${mapName}/tokens/${tokId}`), { disguises, disguise: null });
}

export async function clearTokenDisguises(mapName, tokId) {
  await update(ref(db, `maps/${mapName}/tokens/${tokId}`), { disguises: null, disguise: null });
}

export async function savePropDisguise(mapName, propKey, propId) {
  await update(ref(db, `maps/${mapName}/props/${propKey}`), { disguise: { propId } });
}

export async function clearPropDisguise(mapName, propKey) {
  await update(ref(db, `maps/${mapName}/props/${propKey}`), { disguise: null });
}

/** Every disguise rule on this token, normalized to a list regardless of
 *  whether it's using the newer tok.disguises array or the older, single
 *  tok.disguise field. */
export function tokenDisguiseRules(tok) {
  if (Array.isArray(tok.disguises)) return tok.disguises;
  if (tok.disguise) return [tok.disguise];
  return [];
}

/** Does this rule apply to the given viewer? Mirrors the single-disguise
 *  logic exactly: omit viewerTokId (as the DM's own view always does) to
 *  ignore visibleTo entirely and always match. */
function ruleMatchesViewer(rule, viewerTokId) {
  if (viewerTokId === undefined) return true;
  if (!Array.isArray(rule.visibleTo)) return true; // "all"/"all-active"/unset
  return rule.visibleTo.includes(viewerTokId);
}

/** Resolves what to actually render for a token: name, lookup key for
 *  portrait art, and the HP/maxHp to show on its bar. Checks each disguise
 *  rule in order and resolves using the first one that matches this viewer;
 *  falls back to the token's own real data if none do (or none are set). */
export function resolveTokenDisplay(tok, tokens, viewerTokId) {
  const trueDisplay = { name: tok.name, lookupName: tok.lookupName || tok.name, hp: tok.hp, maxHp: tok.maxHp };
  const rules = tokenDisguiseRules(tok);
  const rule = rules.find(r => ruleMatchesViewer(r, viewerTokId));
  if (!rule) return trueDisplay;
  let hp = tok.hp, maxHp = tok.maxHp;
  if (rule.mirrorHpFrom && tokens?.[rule.mirrorHpFrom]) {
    hp = tokens[rule.mirrorHpFrom].hp;
    maxHp = tokens[rule.mirrorHpFrom].maxHp;
  }
  return { name: rule.displayName || tok.name, lookupName: rule.lookupName || rule.displayName || tok.name, hp, maxHp };
}

/** Resolves the effective propId to render a prop with. */
export function resolvePropId(prop) {
  return prop.disguise?.propId || prop.propId;
}
