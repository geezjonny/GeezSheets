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
import { tokenTextures, tokenCacheKey, tryLoadTokenTexture } from '../js/assets.js';
import * as Grid from './grid.js';
import * as Geometry from './geometry.js';

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

// For js/initiative.js's renderTokenStrip(), which reads a live tokens
// object directly and filters non-GM views to `t.type === "pc"`.
export function getTokens() { return tokens; }
const tokensChangeHooks = [];
export function onTokensChange(fn) { tokensChangeHooks.push(fn); }

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
    tokensChangeHooks.forEach(fn => fn());
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

// ── Per-floor Group for token sprites (see grid.js's matching comment for
// the full rationale). A token's Y position is now purely LOCAL (+0.6,
// always) -- its floor is which GROUP it's parented to, not a number baked
// into its own position. Unlike voxels/walls/lights (built fresh from data
// on every change), tokens actually change layers at runtime (stairs), so
// upsertTokenMesh has to REPARENT an existing sprite when that happens,
// not just reposition it.
const tokenLayerGroups = new Map();
function getTokenLayerGroup(layerIndex) {
  if (!tokenLayerGroups.has(layerIndex)) {
    const group = new THREE.Group();
    group.position.y = layerIndex;
    scene.add(group);
    tokenLayerGroups.set(layerIndex, group);
  }
  return tokenLayerGroups.get(layerIndex);
}

function tokenLocalPos(tok) {
  const gx = Math.round(tok.x), gz = Math.round(tok.y);
  return new THREE.Vector3(gx - Grid.GRID_OFFSET, 0.6, gz - Grid.GRID_OFFSET); // LOCAL y -- the layer group handles height
}

function upsertTokenMesh(id, tok) {
  let sprite = tokenMeshes[id];
  const layerGroup = getTokenLayerGroup(tok.layer ?? 0);
  if (!sprite) {
    const material = new THREE.SpriteMaterial({ map: makeTokenTexture(tok, id === selectedTokenId) });
    sprite = new THREE.Sprite(material);
    sprite.scale.set(1, TOKEN_TEX_HEIGHT / TOKEN_TEX_WIDTH, 1); // matches the canvas's own (non-square) aspect ratio
    sprite.userData.tokenId = id;
    layerGroup.add(sprite);
    tokenMeshes[id] = sprite;
  } else {
    sprite.material.map.dispose();
    sprite.material.map = makeTokenTexture(tok, id === selectedTokenId);
    sprite.material.needsUpdate = true;
    if (sprite.parent !== layerGroup) {
      sprite.parent?.remove(sprite); // moved floors (e.g. via a stair) -- reparent to the new layer's group
      layerGroup.add(sprite);
    }
  }
  sprite.position.copy(tokenLocalPos(tok));
}

function removeTokenMesh(id) {
  const sprite = tokenMeshes[id];
  if (!sprite) return;
  sprite.parent?.remove(sprite); // was scene.remove(sprite) -- sprites live in per-layer groups now, not directly on scene
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
    layer, // which floor this token stands on -- see tokenLocalPos()/getTokenLayerGroup()
    hp: 10, maxHp: 10,
    ownerPlayerName: playerName,
    characterId: isGM ? null : characterId,
    isGmToken: isGM,
    // js/initiative.js's renderTokenStrip() filters non-GM views to
    // type==="pc" -- our system has no real PC/NPC distinction beyond the
    // name someone types, so every token is marked visible uniformly
    // rather than hiding things from the player strip that shouldn't be.
    type: 'pc',
  };
  await saveToken(Grid.getMapName(), id, data);
}

// A voxel block blocks movement if it occupies the BODY-height space at the
// token's own layer -- under the current convention, tok.layer IS the
// open-air voxel slot a token's body occupies (see the per-floor-group
// rendering above), not the floor's own index one layer below. Checking
// layer+1 here (the old formula, correct under the OLD convention) now
// looks one level too high -- above the character's head instead of at it.
function isCellBlocked(layer, x, y) {
  const bodyLayer = Math.max(0, Math.min(Grid.MAX_LAYERS - 1, layer));
  return Grid.mapData[bodyLayer]?.[y]?.[x] !== 0;
}

// Is there an actual floor block directly beneath this layer? Without this,
// nothing ever validated that a destination had real ground under it --
// only whether something was blocking above -- so a token could walk
// straight across a gap/hole in the floor with nothing supporting it.
function hasFloorAt(layer, x, y) {
  const floorLayer = Math.max(0, Math.min(Grid.MAX_LAYERS - 1, layer - 1));
  return Grid.mapData[floorLayer]?.[y]?.[x] !== 0;
}

async function moveTokenTo(id, tx, ty, layer) {
  const tok = tokens[id];
  if (!tok || !canControlToken(tok)) return;
  if (isCellBlocked(layer, tx, ty)) return; // can't move onto a solid block
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
  if (hitEntry && clickToMove && canControlToken(hitEntry[1])) { selectToken(hitEntry[0]); return; }

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
    if (clickToMove && canControlToken(tok)) { selectToken(id); return; }
  }

  if (!clickToMove) return;

  const groundHit = raycastAgainst([...Grid.getVoxelMeshes(), Grid.getGroundPlane()]);
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

// Maps a one-cell movement direction to the actual grid-corner edge it
// crosses -- geometry.js's walls/doors are stored as corner-to-corner
// segments (0..GRID_SIZE), not cell coordinates, so "moving from (3,4)
// east" needs translating into "crossing the edge from (4,4) to (4,5)".
function crossedEdge(cx, cy, dx, dy) {
  if (dx === 1)  return [cx + 1, cy,     cx + 1, cy + 1]; // east
  if (dx === -1) return [cx,     cy,     cx,     cy + 1]; // west
  if (dy === 1)  return [cx,     cy + 1, cx + 1, cy + 1]; // south
  if (dy === -1) return [cx,     cy,     cx + 1, cy];     // north
  return null;
}

// Stairs act as a portal: stepping onto one jumps elevation by exactly
// ±1 full layer, depending on which side you're currently on -- standing
// on the base floor sends you up to base+1; standing on base+1 sends you
// back down to base. No half-steps, no general "step over small ledges"
// tolerance -- flat movement never changes elevation on its own; only a
// stair does. getStairAt() already scopes the match to a stair reachable
// from your current elevation (base or base+1), so this only ever sees a
// stair that's actually usable from where you're standing.
//
// Reports usedStair so the caller can skip the floor-support check below --
// stairs are geometry.js decorations, not real voxel data, so there's
// never an actual floor block under one.
function resolveMove(currentElevation, nx, ny) {
  const stair = Geometry.getStairAt(nx, ny, currentElevation);
  if (!stair) return { elevation: currentElevation, usedStair: false }; // flat movement -- elevation unchanged
  const base = stair.layer ?? 0;
  const elevation = currentElevation <= base ? base + 1 : base;
  return { elevation, usedStair: true };
}

let lastArrowMoveAt = 0;
async function moveMyTokenBy(dx, dy) {
  const now = Date.now();
  if (now - lastArrowMoveAt < 150) return; // holding a key shouldn't flood Firebase with writes
  const entry = findMyToken();
  if (!entry) return;
  const [id, tok] = entry;
  const cx = Math.round(tok.x), cy = Math.round(tok.y);
  const nx = Math.min(Grid.GRID_SIZE - 1, Math.max(0, cx + dx));
  const ny = Math.min(Grid.GRID_SIZE - 1, Math.max(0, cy + dy));
  if (nx === cx && ny === cy) return; // pinned against the world edge

  const currentElevation = tok.layer ?? 0;
  const edge = crossedEdge(cx, cy, dx, dy);
  if (edge && Geometry.isEdgeBlocked(currentElevation, ...edge)) return; // a wall or closed door is in the way

  const { elevation: newElevation, usedStair } = resolveMove(currentElevation, nx, ny);
  // No stair involved -- ordinary flat step needs an actual floor block
  // under it, or you'd be walking across a gap with nothing there.
  if (!usedStair && !hasFloorAt(newElevation, nx, ny)) return;

  lastArrowMoveAt = now;
  await moveTokenTo(id, nx, ny, newElevation);
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
