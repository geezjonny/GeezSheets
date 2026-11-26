import { validPlayer, ownsPC } from './player-session-model.js';

export const isGM = new URLSearchParams(globalThis.location?.search).get('gm') === 'jonny';
export const sessionClient = crypto.randomUUID();
export let playerIdentity = null;
try {
  const saved = JSON.parse(sessionStorage.getItem('geezvtt.player'));
  if (validPlayer(saved)) playerIdentity = saved;
} catch { /* Storage may be disabled. */ }
export const canControlPC = token => isGM || ownsPC(playerIdentity, token);
export function setPlayerIdentity(player) {
  if (!validPlayer(player)) throw new Error('Choose a valid PC.');
  playerIdentity = player;
  try { sessionStorage.setItem('geezvtt.player', JSON.stringify(player)); } catch { /* Keep this page usable without storage. */ }
  window.dispatchEvent(new Event('player-signed-in'));
}

if (globalThis.document) document.documentElement.dataset.role = isGM ? 'gm' : 'player';
