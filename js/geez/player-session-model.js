// Who is signed in on this page. companion.html sets it from the character it was opened for.
export const validPlayer = player => typeof player?.pcId === 'string' && /^[^.#$\[\]/\s]{1,200}$/.test(player.pcId) &&
  !['__proto__', 'prototype', 'constructor'].includes(player.pcId);
export const ownsPC = (player, token) => validPlayer(player) && token?.npcId === `v2:${player.pcId}`;
