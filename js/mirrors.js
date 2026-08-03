// Token-to-token mirrors — an invisible movement link. When the leader
// token's position changes, every token mirroring it (a follower) moves by
// the exact same delta. No visual indicator (unlike Chain), no distance
// constraint -- purely a movement sync, for cases like an illusion decoy
// that needs to move identically to the real character it's copying.

import { db } from "./firebase.js";
import { ref, set, remove, update } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

// mirrors: { mirrorId: { leader, follower } } — follower moves whenever leader does

export async function saveMirror(mapName, mirrorId, leader, follower) {
  await set(ref(db, `maps/${mapName}/mirrors/${mirrorId}`), { leader, follower });
}

export async function deleteMirror(mapName, mirrorId, mirrors) {
  await remove(ref(db, `maps/${mapName}/mirrors/${mirrorId}`));
  delete mirrors[mirrorId];
}

/** Every mirror entry where this token is the leader. */
export function mirrorsForLeader(mirrors, leaderTokId) {
  return Object.entries(mirrors).filter(([, m]) => m.leader === leaderTokId);
}

/** Every mirror entry where this token is the follower (used to show "this
 *  token mirrors X" status, and to block a token from being picked as its
 *  own follower's leader in a cycle). */
export function mirrorsForFollower(mirrors, followerTokId) {
  return Object.entries(mirrors).filter(([, m]) => m.follower === followerTokId);
}

/** Given a leader token that just moved by (dx,dy), move every follower
 *  mirroring it by the same delta. Mutates `tokens` locally (so callers see
 *  the update immediately) and writes each follower's new position. */
export async function applyMirrorMovement(mapName, mirrors, tokens, leaderTokId, dx, dy) {
  if (!dx && !dy) return;
  const followers = mirrorsForLeader(mirrors, leaderTokId);
  for (const [, m] of followers) {
    const followerTok = tokens[m.follower];
    if (!followerTok) continue;
    followerTok.x += dx;
    followerTok.y += dy;
    await update(ref(db, `maps/${mapName}/tokens/${m.follower}`), { x: followerTok.x, y: followerTok.y });
  }
}
