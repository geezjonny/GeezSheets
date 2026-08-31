// token.js — tokens: selection, movement, placement, rendering (both the 2D
// grid panel and 3D billboard sprites), RTDB sync. Data layer (saveToken/
// deleteToken, the maps/<map>/tokens RTDB path) is reused verbatim from
// ../js/tokens.js, same path mapeditor.html uses.
//
// Depends on grid.js for shared coordinate constants/canvas/mode state.
// Identity (playerName/isGM/characterId) and the "please log in" prompt
// live in index.html (login), so they're injected via initTokens()'s opts
// rather than imported directly -- keeps this module ignorant of auth.

import * as THREE from 'three';
import { db } from '../js/firebase.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js';
import { saveToken, deleteToken } from '../js/tokens.js';
import { openCharSheet } from '../js/sheet.js';
import { tokenTextures, tokenCacheKey, tryLoadTokenTexture } from '../js/assets.js';
import * as Grid from './grid.js';

const tokens = {};       // id -> token data from RTDB
const tokenMeshes = {};  // id -> THREE.Sprite
let selectedTokenId = null;
let placingToken = false;
let tokensUnsub = null;
let scene;
let deleteTokenBtn;

let getIdentity = () => ({ playerName: '', isGM: false, characterId: null, characterName: '' });
let requireLogin = () => {};
let clickToMove = true; // player.html sets this false -- see initTokens()
// Naming a new GM token used to call window.prompt() directly -- that's a
// blocking native dialog, and blocking dialogs are documented to cause
// WebGL context loss (the 3D view going permanently blank) in some
// browsers while a canvas is visible. Injected instead, so gm.html can
// supply a proper non-blocking modal. Resolves to { name } or null if
// cancelled. Naming alone is enough: art loads automatically once saved,
// by name, via ensureTokenArt() below -- same tokenCacheKey(characterId,
// lookupName) lookup js/tokens.js's real drawToken() uses against
// js/assets.js's tokenTextures. Default keeps player.html (which never
// hits this path -- players don't get this prompt) working with no wiring.
let promptTokenName = async () => ({ name: 'NPC' });

function tokensRefPath() { return `maps/${Grid.getMapName()}/tokens`; }

export function subscribeTokens() {
  if (tokensUnsub) tokensUnsub();
  tokensUnsub = onValue(ref(db, tokensRefPath()), snap => {
    const data = snap.val() || {};
    for (const id of Object.keys(tokens)) {
      if (!data[id]) { removeTokenMesh(id); delete tokens[id]; }
    }
    for (const [id, tok] of Object.entries(data)) {
      tokens[id] = tok;
      upsertTokenMesh(id, tok);
    }
    Grid.redraw();
  });
}

// ── Real NPC/PC/monster portrait art, from js/assets.js ────────────────────
// tryLoadTokenTexture() fetches from /tokens/{name}.png, falling back to a
// base64 upload in Firebase; tokenTextures[cacheKey] holds the loaded
// Image (or null while still loading/missing). Since that load happens
// async and outside our control, pendingArtKeys tracks which tokens are
// still waiting so their sprite can be rebuilt once art actually arrives.
const pendingArtKeys = new Set();

function ensureTokenArt(tok) {
  const characterId = tok.characterId || '__npc__';
  const lookupName = tok.lookupName || tok.name;
  tryLoadTokenTexture(characterId, lookupName);
  const cacheKey = tokenCacheKey(characterId, lookupName);
  if (!tokenTextures[cacheKey]) pendingArtKeys.add(cacheKey);
  return cacheKey;
}

function checkPendingArt() {
  for (const key of Array.from(pendingArtKeys)) {
    if (!tokenTextures[key]) continue;
    pendingArtKeys.delete(key);
    for (const [id, tok] of Object.entries(tokens)) {
      const characterId = tok.characterId || '__npc__';
      const lookupName = tok.lookupName || tok.name;
      if (tokenCacheKey(characterId, lookupName) === key) upsertTokenMesh(id, tok);
    }
  }
}

// Canvas is TALLER than it is wide -- the name label sits below the HP bar,
// below the portrait, and a square canvas cut it off (its baseline landed
// past the bottom edge, clipping most of the text). The sprite's Y scale is
// set to match this aspect ratio (see upsertTokenMesh) so the portrait
// itself isn't stretched.
const TOKEN_TEX_WIDTH = 128;
const TOKEN_TEX_HEIGHT = 168;

function makeTokenTexture(tok, isSelected) {
  const size = TOKEN_TEX_WIDTH;
  const c = document.createElement('canvas');
  c.width = TOKEN_TEX_WIDTH; c.height = TOKEN_TEX_HEIGHT;
  const tctx = c.getContext('2d');

  const pct = Math.max(0, Math.min(1, (tok.hp ?? tok.maxHp ?? 1) / (tok.maxHp || 1)));
  const r = size * 0.36, cx = size / 2, cy = size * 0.42;

  const cacheKey = ensureTokenArt(tok);
  const art = tokenTextures[cacheKey];

  tctx.save();
  tctx.beginPath(); tctx.arc(cx, cy, r, 0, Math.PI * 2); tctx.closePath();
  tctx.clip();
  if (art) {
    tctx.drawImage(art, cx - r, cy - r, r * 2, r * 2);
  } else {
    tctx.fillStyle = tok.fillColor || (tok.isGmToken ? '#6a4fa6' : '#4f9da6');
    tctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  tctx.restore();

  tctx.beginPath(); tctx.arc(cx, cy, r, 0, Math.PI * 2);
  tctx.lineWidth = 5;
  tctx.strokeStyle = isSelected ? '#ffd700' : (tok.ringColor || '#c8a84b');
  tctx.stroke();

  if (!art) {
    tctx.fillStyle = '#fff';
    tctx.font = 'bold 40px sans-serif';
    tctx.textAlign = 'center'; tctx.textBaseline = 'middle';
    tctx.fillText((tok.name || '?')[0].toUpperCase(), cx, cy);
  }

  const bw = size * 0.7, bh = 8, bx = (size - bw) / 2, by = cy + r + 10;
  tctx.fillStyle = 'rgba(0,0,0,0.6)'; tctx.fillRect(bx, by, bw, bh);
  tctx.fillStyle = pct > 0.5 ? '#4a9a4a' : pct > 0.25 ? '#aaaa30' : '#aa3030';
  tctx.fillRect(bx, by, bw * pct, bh);

  tctx.font = 'bold 16px sans-serif';
  tctx.fillStyle = '#fff';
  tctx.fillText(tok.name || '', cx, by + bh + 14);

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function tokenWorldPos(tok) {
  const gx = Math.round(tok.x), gz = Math.round(tok.y);
  const clampedX = Math.min(Grid.GRID_SIZE - 1, Math.max(0, gx));
  const clampedZ = Math.min(Grid.GRID_SIZE - 1, Math.max(0, gz));
  // Tokens remember which floor they were placed/moved on (captured from
  // the 2D panel's current layer at the time), rather than always snapping
  // to the tallest stack in that column -- otherwise a token placed inside
  // a room under a roof would render on TOP of the roof instead of on the
  // room's own floor. Falls back to the old column-top behavior for tokens
  // saved before this field existed.
  const topY = tok.layer != null ? tok.layer + 1 : Grid.columnTopY(clampedX, clampedZ);
  return new THREE.Vector3(gx - Grid.GRID_OFFSET, topY + 0.6, gz - Grid.GRID_OFFSET);
}

function upsertTokenMesh(id, tok) {
  let sprite = tokenMeshes[id];
  if (!sprite) {
    const material = new THREE.SpriteMaterial({ map: makeTokenTexture(tok, id === selectedTokenId) });
    sprite = new THREE.Sprite(material);
    sprite.scale.set(1, TOKEN_TEX_HEIGHT / TOKEN_TEX_WIDTH, 1); // matches the canvas's own (non-square) aspect ratio
    sprite.userData.tokenId = id;
    scene.add(sprite);
    tokenMeshes[id] = sprite;
  } else {
    sprite.material.map.dispose();
    sprite.material.map = makeTokenTexture(tok, id === selectedTokenId);
    sprite.material.needsUpdate = true;
  }
  sprite.position.copy(tokenWorldPos(tok));
}

function removeTokenMesh(id) {
  const sprite = tokenMeshes[id];
  if (!sprite) return;
  scene.remove(sprite);
  sprite.material.map.dispose();
  sprite.material.dispose();
  delete tokenMeshes[id];
}

function repositionAllTokens() {
  for (const [id, tok] of Object.entries(tokens)) upsertTokenMesh(id, tok);
}

// A token's link to "which player controls it" is its NAME, not
// ownerPlayerName or characterId -- both of those are always the GM's own
// values on every token, since only the GM ever places one (players have
// no "+ Place Token" button). If a token's name matches the character name
// a player logged in as, that player controls it.
function sameCharacterName(a, b) {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

function canControlToken(tok) {
  const { characterName, isGM } = getIdentity();
  if (isGM) return true;
  return sameCharacterName(tok?.name, characterName);
}

// Clicking any token (yours, another player's, or an NPC's) shows its
// character sheet -- openCharSheet() gracefully no-ops if #sheet-panel
// doesn't exist on the page (e.g. gm.html has no sheet UI), so this is safe
// to call unconditionally from both pages.
function maybeOpenSheet(tok) {
  if (tok && tok.characterId && tok.characterId !== '__gm__' && tok.characterId !== '__npc__') {
    openCharSheet(tok.characterId, tok.name, false); // read-only, per sheet.js's own doc comment
  }
}

function selectToken(id) {
  selectedTokenId = id;
  if (deleteTokenBtn) deleteTokenBtn.disabled = !(id && getIdentity().isGM);
  for (const [tid, tok] of Object.entries(tokens)) upsertTokenMesh(tid, tok);
  Grid.redraw();
}

async function placeTokenAt(tx, ty, layer) {
  const { playerName, isGM, characterId, characterName } = getIdentity();
  let name = characterName;
  if (isGM) {
    const result = await promptTokenName();
    if (result === null) return; // cancelled
    name = result.name || 'NPC';
  }
  const id = 'tok_' + Date.now();
  const data = {
    id,
    name,
    x: tx, y: ty,
    layer, // which floor this token stands on -- see tokenWorldPos()
    hp: 10, maxHp: 10,
    ownerPlayerName: playerName,
    characterId: isGM ? null : characterId,
    isGmToken: isGM,
  };
  await saveToken(Grid.getMapName(), id, data);
}

async function moveTokenTo(id, tx, ty, layer) {
  const tok = tokens[id];
  if (!tok || !canControlToken(tok)) return;
  await saveToken(Grid.getMapName(), id, { ...tok, x: tx, y: ty, layer });
}

function drawOverlay(ctx) {
  const CELL_SIZE = Grid.CELL_SIZE;
  const currentLayer = Grid.getCurrentLayer();
  for (const [id, tok] of Object.entries(tokens)) {
    const onLayer = tok.layer == null || tok.layer === currentLayer;
    const cx = (Math.round(tok.x) + 0.5) * CELL_SIZE;
    const cy = (Math.round(tok.y) + 0.5) * CELL_SIZE;
    const r = CELL_SIZE * 0.35;
    ctx.globalAlpha = onLayer ? 1 : 0.25;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = tok.fillColor || (tok.isGmToken ? '#6a4fa6' : '#4f9da6');
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = id === selectedTokenId ? '#ffd700' : '#c8a84b';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(r)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((tok.name || '?')[0].toUpperCase(), cx, cy);
    ctx.globalAlpha = 1;
  }
}

// ── Token select/move via the 2D grid panel -- click math on a flat canvas
// is far more reliable than raycasting small 3D sprites, so this is the
// primary way to move tokens on gm.html; 3D click-to-move (below) works
// there too. Neither exists on player.html when clickToMove is false --
// players there move only via arrow keys, scoped to their own character
// (see moveMyTokenBy). ──────────────────────────────────────────────────
function handleGridClick(e) {
  if (Grid.getMode() !== 'token') return;
  const { playerName } = getIdentity();
  if (!playerName) { requireLogin(); return; }

  const { px, py } = Grid.canvasLocalPoint(e);
  const tx = Math.min(Grid.GRID_SIZE - 1, Math.max(0, Math.floor(px / Grid.CELL_SIZE)));
  const ty = Math.min(Grid.GRID_SIZE - 1, Math.max(0, Math.floor(py / Grid.CELL_SIZE)));

  const hitEntry = Object.entries(tokens).find(
    ([, tok]) => Math.round(tok.x) === tx && Math.round(tok.y) === ty
  );
  if (hitEntry) {
    maybeOpenSheet(hitEntry[1]);
    if (clickToMove && canControlToken(hitEntry[1])) { selectToken(hitEntry[0]); return; }
    return; // sheet already shown above; click-to-move disabled, so stop here
  }

  if (!clickToMove) return;

  if (placingToken && getIdentity().isGM) {
    placingToken = false;
    placeTokenAt(tx, ty, Grid.getCurrentLayer());
    return;
  }

  if (selectedTokenId) {
    moveTokenTo(selectedTokenId, tx, ty, Grid.getCurrentLayer());
    selectToken(null);
  }
}

// Called from index.html's shared 3D pointerup handler, passing its own
// raycastAgainst so this module doesn't need its own raycaster/camera setup.
export function handlePointerUp3D(raycastAgainst) {
  const { playerName, isGM } = getIdentity();
  if (!playerName) { requireLogin(); return; }

  const tokenHit = raycastAgainst(Object.values(tokenMeshes));
  if (tokenHit) {
    const id = tokenHit.object.userData.tokenId;
    const tok = tokens[id];
    maybeOpenSheet(tok);
    if (clickToMove && canControlToken(tok)) { selectToken(id); return; }
    return; // sheet already shown above; click-to-move disabled, so stop here
  }

  if (!clickToMove) return;

  const groundHit = raycastAgainst([...Grid.getVoxelGroup().children, Grid.getGroundPlane()]);
  if (!groundHit) return;
  const tx = Math.round(groundHit.point.x + Grid.GRID_OFFSET);
  const ty = Math.round(groundHit.point.z + Grid.GRID_OFFSET);
  // Derive the floor from the actual surface height clicked, not a layer
  // selector -- this is the only path player.html has (no 2D panel/layer
  // controls at all), and it naturally respects roofs/gaps: clicking into
  // an opening in a roof correctly lands on the floor below, not the roof.
  const layer = Math.max(-1, Math.min(Grid.MAX_LAYERS - 1, Math.round(groundHit.point.y) - 1));

  if (placingToken && isGM) {
    placingToken = false;
    placeTokenAt(tx, ty, layer);
    return;
  }

  if (selectedTokenId) {
    moveTokenTo(selectedTokenId, tx, ty, layer);
    selectToken(null);
  }
}

// ── Arrow-key movement, scoped to the logged-in player's OWN character ────
// Finds the token whose NAME matches the character the player logged in as
// -- see canControlToken()'s comment for why name is the right match, not
// characterId (always null on GM-placed tokens). GM presses do nothing here.
function findMyToken() {
  const { isGM, characterName } = getIdentity();
  if (isGM || !characterName) return null;
  return Object.entries(tokens).find(([, tok]) => sameCharacterName(tok.name, characterName)) || null;
}

let lastArrowMoveAt = 0;
async function moveMyTokenBy(dx, dy) {
  const now = Date.now();
  if (now - lastArrowMoveAt < 150) return; // holding a key shouldn't flood Firebase with writes
  const entry = findMyToken();
  if (!entry) return;
  lastArrowMoveAt = now;
  const [id, tok] = entry;
  const nx = Math.min(Grid.GRID_SIZE - 1, Math.max(0, Math.round(tok.x) + dx));
  const ny = Math.min(Grid.GRID_SIZE - 1, Math.max(0, Math.round(tok.y) + dy));
  await moveTokenTo(id, nx, ny, tok.layer ?? 0); // preserves current floor -- arrow keys move horizontally only
}

const ARROW_DELTAS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

function handleArrowKeydown(e) {
  const delta = ARROW_DELTAS[e.key];
  if (!delta) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; // typing somewhere, not moving
  e.preventDefault();
  moveMyTokenBy(delta[0], delta[1]);
}

// Token sprites as raycast targets, same reasoning as geometry.js's
// getSolidMeshes() -- clicking directly on a token is a valid surface hit.
export function getTokenMeshesArray() {
  return Object.values(tokenMeshes);
}

export function initTokens(threeScene, opts = {}) {
  scene = threeScene;
  getIdentity = opts.getIdentity || getIdentity;
  requireLogin = opts.requireLogin || requireLogin;
  clickToMove = opts.clickToMove !== false; // default true (gm.html); player.html passes false
  promptTokenName = opts.promptTokenName || promptTokenName;

  // Both are GM-only UI that simply doesn't exist on player.html -- there's
  // no "place a token"/"delete this token" button for players at all.
  deleteTokenBtn = document.getElementById('delete-token-btn');
  const addTokenBtn = document.getElementById('add-token-btn');

  addTokenBtn?.addEventListener('click', () => {
    if (!getIdentity().playerName) { requireLogin(); return; }
    placingToken = true;
  });

  deleteTokenBtn?.addEventListener('click', async () => {
    if (!selectedTokenId || !getIdentity().isGM) return;
    await deleteToken(Grid.getMapName(), selectedTokenId, tokens);
    selectToken(null);
  });

  Grid.registerOverlay(drawOverlay);
  Grid.getCanvas()?.addEventListener('click', handleGridClick);
  Grid.onVoxelSceneChange(repositionAllTokens); // column heights may change under existing tokens
  Grid.onMapNameChange(() => subscribeTokens());
  window.addEventListener('keydown', handleArrowKeydown);

  setInterval(checkPendingArt, 500); // real portrait art loads async and outside our control -- see ensureTokenArt()

  subscribeTokens();
}
