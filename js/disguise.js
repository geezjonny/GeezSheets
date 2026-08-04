// Disguise — an alternate visual for a token or prop. This is a GLOBAL
// override (same for DM and every player), not a per-viewer illusion --
// per-viewer disguises were tried earlier and abandoned, since a shared map
// makes movement/timing itself a tell regardless of what's drawn. This is a
// simpler, different thing: reskinning an object while its real data stays
// untouched underneath (an NPC's true name/stats, a prop's real container).
//
// Token disguise shape (tok.disguise): { lookupName, displayName, mirrorHpFrom }
//   - lookupName/displayName: what's shown on the map instead of the token's
//     own name/portrait. The token's own name/lookupName/characterId are
//     never touched -- they stay intact in the token's own data, visible via
//     the edit modal, for the DM's own bookkeeping.
//   - mirrorHpFrom: optional token id. If set, the HP bar shown also mirrors
//     that OTHER token's current HP instead of this token's own -- for an
//     NPC decoy that should visually track a specific character's health.
//     Leave unset for a PC disguised as something else, since their own
//     stats should keep working normally.
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
 *  token's own real data wherever no disguise (or no mirror target) applies. */
export function resolveTokenDisplay(tok, tokens) {
  const d = tok.disguise;
  if (!d) return { name: tok.name, lookupName: tok.lookupName || tok.name, hp: tok.hp, maxHp: tok.maxHp };
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
