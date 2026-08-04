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
// Token disguise shape (tok.disguise): { lookupName, displayName, mirrorHpFrom, visibleTo }
//   - lookupName/displayName: what's shown on the map instead of the token's
//     own name/portrait. The token's own name/lookupName/characterId are
//     never touched -- they stay intact in the token's own data, visible via
//     the edit modal, for the DM's own bookkeeping.
//   - mirrorHpFrom: optional token id. If set, the HP bar shown also mirrors
//     that OTHER token's current HP instead of this token's own -- for an
//     NPC decoy that should visually track a specific character's health.
//     Leave unset for a PC disguised as something else, since their own
//     stats should keep working normally.
//   - visibleTo: optional. "all" (default if unset) or an array of token ids
//     -- when set to an array, only those specific players' own tokens
//     resolve the disguise; everyone else sees the token's true appearance.
//
// Prop disguise shape (prop.disguise): { propId }
//   - propId: an alternate prop definition to render with (art + footprint).
//     The prop's own propId, and anything else about it (container contents,
//     trigger links, attachment), is untouched.

import { db } from "./firebase.js";
import { ref, update } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

export async function saveTokenDisguise(mapName, tokId, disguise) {
  await update(ref(db, `maps/${mapName}/tokens/${tokId}`), { disguise });
}

export async function clearTokenDisguise(mapName, tokId) {
  await update(ref(db, `maps/${mapName}/tokens/${tokId}`), { disguise: null });
}

export async function savePropDisguise(mapName, propKey, propId) {
  await update(ref(db, `maps/${mapName}/props/${propKey}`), { disguise: { propId } });
}

export async function clearPropDisguise(mapName, propKey) {
  await update(ref(db, `maps/${mapName}/props/${propKey}`), { disguise: null });
}

/** Resolves what to actually render for a token: name, lookup key for
 *  portrait art, and the HP/maxHp to show on its bar. Falls back to the
 *  token's own real data wherever no disguise (or no mirror target) applies.
 *  `viewerTokId` is optional -- omit it (as the DM's own view always does)
 *  to ignore visibleTo entirely and always resolve the disguise if one's
 *  set, matching the original global-disguise behavior exactly. Pass it (as
 *  the player's own token id) to respect per-player targeting instead. */
export function resolveTokenDisplay(tok, tokens, viewerTokId) {
  const d = tok.disguise;
  if (!d) return { name: tok.name, lookupName: tok.lookupName || tok.name, hp: tok.hp, maxHp: tok.maxHp };
  if (viewerTokId !== undefined && Array.isArray(d.visibleTo) && !d.visibleTo.includes(viewerTokId)) {
    return { name: tok.name, lookupName: tok.lookupName || tok.name, hp: tok.hp, maxHp: tok.maxHp };
  }
  let hp = tok.hp, maxHp = tok.maxHp;
  if (d.mirrorHpFrom && tokens?.[d.mirrorHpFrom]) {
    hp = tokens[d.mirrorHpFrom].hp;
    maxHp = tokens[d.mirrorHpFrom].maxHp;
  }
  return { name: d.displayName || tok.name, lookupName: d.lookupName || d.displayName || tok.name, hp, maxHp };
}

/** Resolves the effective propId to render a prop with. */
export function resolvePropId(prop) {
  return prop.disguise?.propId || prop.propId;
}
