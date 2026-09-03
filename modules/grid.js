// grid.js — the voxel terrain: grid state, 2D panel painting/drawing, 3D
// voxel mesh rendering. World is 32×32×16 -- small enough that the whole
// thing lives in one dense array and syncs as one blob; chunking (tried at
// 128×128×64) turned out to be solving a problem this size doesn't have.
// Also owns two bits of state shared across modules, since painting/
// tool-switching/map-loading all need to agree on them:
//   - the active tool mode (paint vs wall/door/light/erase vs token)
//   - the current map name
// geometry.js and token.js both depend on grid.js (for the canvas, the
// coordinate constants, and these two shared bits of state); grid.js
// depends on neither of them, and reaches them only through the generic
// registerOverlay()/onVoxelSceneChange() hooks below.

import * as THREE from 'three';
import { db } from '../js/firebase.js';
import { ref, set, onValue } from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js';
import { blockRegistry, getSelectedBlockId, getOrCreateBlockId } from './block.js';

export let GRID_SIZE = 32;
export const MAX_LAYERS = 16;
export let CELL_SIZE = 320 / GRID_SIZE;
// FIXED at the ORIGINAL 32-size center -- growing GRID_SIZE later must
// NEVER recompute this. Every world-space conversion (geomToWorld,
// tokenLocalPos, voxel positions) subtracts it; changing it would shift
// everything already placed in the world the moment the grid grows, since
// it'd suddenly be measured from a different center.
export const GRID_OFFSET = GRID_SIZE / 2 - 0.5;
// Sanity cap on dynamic growth (see ensureGridSize) -- without one, a
// malformed or absurdly large dd2vtt import could try to grow the world to
// a size that exhausts memory/cripples performance rather than just
// failing an import.
const MAX_GRID_SIZE = 256;

export const mapData = Array.from({ length: MAX_LAYERS }, () =>
  Array.from({ length: GRID_SIZE }, () => new Uint8Array(GRID_SIZE))
);

// Grows the world to fit content that needs more room than the CURRENT
// GRID_SIZE allows -- e.g. a dd2vtt import larger than 32x32. Growth only
// ever EXTENDS the grid outward (larger indices); it never shifts where
// index 0 sits, so anything already placed keeps its exact world position
// -- see the GRID_OFFSET comment above for why that matters. Existing
// voxel data is preserved at its same [layer][z][x] indices; the new space
// starts empty. Also grows the 2D panel canvas's actual pixel resolution
// (not just its CSS size) proportionally, so cells don't shrink to
// unusably few real pixels as the world gets bigger.
// Returns the new (or unchanged) GRID_SIZE; throws if minSize > MAX_GRID_SIZE.
export function ensureGridSize(minSize) {
  if (minSize <= GRID_SIZE) return GRID_SIZE;
  if (minSize > MAX_GRID_SIZE) {
    throw new Error(`That would need a ${minSize}x${minSize} world, past the ${MAX_GRID_SIZE}x${MAX_GRID_SIZE} cap.`);
  }

  const oldSize = GRID_SIZE;
  const newSize = minSize;
  for (let y = 0; y < MAX_LAYERS; y++) {
    const oldLayer = mapData[y];
    const newLayer = [];
    for (let z = 0; z < newSize; z++) {
      const newRow = new Uint8Array(newSize);
      if (z < oldSize) newRow.set(oldLayer[z]); // copies the old row's data into the start of the new, wider row
      newLayer.push(newRow);
    }
    mapData[y] = newLayer; // mapData itself stays the same const array; only its per-layer contents are replaced
  }

  GRID_SIZE = newSize;

  // Keep roughly the same on-screen pixel density per cell (10px/cell,
  // matching the original 320/32) instead of cramming a bigger grid into
  // the same fixed 320x320 buffer, which would make CELL_SIZE tiny and
  // painting imprecise. gridCanvas's CSS (width:100%, aspect-ratio:1/1;
  // see gm.html) already scales whatever resolution we set here to fit
  // the panel, so this only affects real pixel density, not layout.
  const PIXELS_PER_CELL = 10;
  const newCanvasPx = newSize * PIXELS_PER_CELL;
  if (gridCanvas) {
    gridCanvas.width = newCanvasPx;
    gridCanvas.height = newCanvasPx;
  }
  CELL_SIZE = newCanvasPx / newSize; // == PIXELS_PER_CELL, but derived rather than assumed

  update3DScene();
  redraw();
  return GRID_SIZE;
}

let currentLayer = 0;
export function getCurrentLayer() { return currentLayer; }

// ── Shared active-tool-mode state ─────────────────────────────────────────
// 'none' | 'wall' | 'door' | 'light' | 'delete' | 'token'
let mode = 'none';
export function getMode() { return mode; }
export function setMode(m) {
  mode = m;
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  redraw();
}

// ── Shared current-map-name state ─────────────────────────────────────────
let currentMapName = 'voxel_test';
const mapNameListeners = [];
export function getMapName() { return currentMapName; }
export function onMapNameChange(fn) { mapNameListeners.push(fn); }

// ── Voxel terrain sync ──────────────────────────────────────────────────────
// Cells sync by block TITLE, not numeric id (blockRegistry ids are
// per-client local state, same reasoning as walls/doors' blockTitle -- see
// geometry.js), reconstructed via block.js's getOrCreateBlockId().
function voxelsRefPath() { return `maps/${currentMapName}/voxels`; }

function serializeVoxels() {
  const out = [];
  for (let y = 0; y < MAX_LAYERS; y++) {
    const layer = [];
    for (let z = 0; z < GRID_SIZE; z++) {
      const row = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        const id = mapData[y][z][x];
        row.push(id === 0 ? null : (blockRegistry[id]?.title || 'default'));
      }
      layer.push(row);
    }
    out.push(layer);
  }
  return out;
}

function loadVoxelsFromTitles(titleGrid) {
  for (let y = 0; y < MAX_LAYERS; y++) {
    for (let z = 0; z < GRID_SIZE; z++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const title = titleGrid?.[y]?.[z]?.[x];
        mapData[y][z][x] = title ? getOrCreateBlockId(title) : 0;
      }
    }
  }
  update3DScene();
  redraw();
}

let saveVoxelsTimer = null;
function scheduleSaveVoxels() {
  clearTimeout(saveVoxelsTimer);
  saveVoxelsTimer = setTimeout(() => {
    set(ref(db, voxelsRefPath()), serializeVoxels())
      .catch(err => console.error('[grid.js] failed to save voxel terrain to', voxelsRefPath(), err));
  }, 300);
}

let voxelsUnsub = null;
function subscribeVoxels() {
  if (voxelsUnsub) voxelsUnsub();
  voxelsUnsub = onValue(
    ref(db, voxelsRefPath()),
    snap => loadVoxelsFromTitles(snap.val()),
    err => console.error('[grid.js] failed to read voxel terrain from', voxelsRefPath(), err)
  );
}

// ── Undo support ────────────────────────────────────────────────────────
// gm.html owns the actual undo STACK (it needs to interleave voxel edits
// with geometry.js's wall/door/light/stair edits in one chronological
// order), but only this module knows exactly when a mutation is about to
// happen. onBeforeVoxelEdit() lets gm.html capture a snapshot at that exact
// moment -- called ONCE per paint stroke/rect/line/bucket/clear, not once
// per cell, so a whole drag undoes as a single action.
const beforeVoxelEditHooks = [];
export function onBeforeVoxelEdit(fn) { beforeVoxelEditHooks.push(fn); }
function fireBeforeVoxelEdit() { beforeVoxelEditHooks.forEach(fn => fn()); }

// mapData is MAX_LAYERS*GRID_SIZE Uint8Arrays of GRID_SIZE bytes each
// (16*32*32 = 16KB total at current world size) -- small enough that a full
// deep-copy snapshot per undo entry is trivial, no need for anything
// smarter (diffing, sparse deltas) at this scale.
export function snapshotVoxels() {
  return mapData.map(layer => layer.map(row => Uint8Array.from(row)));
}

export function restoreVoxelsSnapshot(snapshot) {
  for (let y = 0; y < MAX_LAYERS; y++) {
    for (let z = 0; z < GRID_SIZE; z++) mapData[y][z].set(snapshot[y][z]);
  }
  redraw();
  update3DScene();
  scheduleSaveVoxels();
}

export function columnTopY(x, z) {
  // Highest occupied voxel layer at this (x,z), or 0 if the column is empty
  for (let y = MAX_LAYERS - 1; y >= 0; y--) {
    if (mapData[y][z] && mapData[y][z][x] !== 0) return y + 1;
  }
  return 0;
}

// ── 3D voxel rendering ─────────────────────────────────────────────────────
// Per-floor Group architecture, adopted from a reference "Stacked DD2VTT
// Map Renderer" prototype: each layer gets its OWN THREE.Group with
// `group.position.y = layerIndex` set exactly ONCE, and everything in that
// layer positions itself with dead-simple LOCAL coordinates (always the
// same regardless of which floor). Previously, every function that placed
// something (voxels, walls, lights, stairs, tokens) independently computed
// an absolute world Y from a layer number -- which is exactly why so many
// off-by-one bugs kept surfacing between rendering and collision code that
// each derived the relationship separately. Collision/movement logic
// (isCellBlocked, columnTopY, resolveMove, all in token.js) is UNAFFECTED
// by this -- it already worked on raw mapData array indices, never on
// scene positions, so this refactor is scoped purely to rendering.
let scene, voxelGroup, groundPlane;
export function getVoxelGroup() { return voxelGroup; } // top container; children are per-layer subgroups now, not meshes directly
export function getGroundPlane() { return groundPlane; }

const voxelLayerGroups = new Map(); // layerIndex -> THREE.Group
function getVoxelLayerGroup(layerIndex) {
  if (!voxelLayerGroups.has(layerIndex)) {
    const group = new THREE.Group();
    group.position.y = layerIndex;
    voxelGroup.add(group);
    voxelLayerGroups.set(layerIndex, group);
  }
  return voxelLayerGroups.get(layerIndex);
}

// Flattened list of actual voxel meshes across every layer subgroup, for
// raycasting (ping, ruler, token ground-hit). Keeps the external API
// callers use (a flat array of real meshes) unchanged even though the
// internal scene graph now nests them inside per-layer groups.
export function getVoxelMeshes() {
  const meshes = [];
  for (const g of voxelLayerGroups.values()) meshes.push(...g.children);
  return meshes;
}

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
// Thin dark outline on every voxel face-edge -- reads as a grid on the
// blocks themselves rather than flat, featureless cubes.
const boxEdgesGeometry = new THREE.EdgesGeometry(boxGeometry);
const boxEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x2a1f14, transparent: true, opacity: 0.4 });

const voxelChangeHooks = [];
export function onVoxelSceneChange(fn) { voxelChangeHooks.push(fn); } // e.g. tokens repositioning after terrain edits

export function update3DScene() {
  for (const group of voxelLayerGroups.values()) {
    while (group.children.length) group.remove(group.children[0]);
  }
  for (let y = 0; y < MAX_LAYERS; y++) {
    for (let z = 0; z < GRID_SIZE; z++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const blockId = mapData[y][z][x];
        if (blockId !== 0 && blockRegistry[blockId]) {
          const mesh = new THREE.Mesh(boxGeometry, blockRegistry[blockId].material);
          mesh.position.set(x - GRID_OFFSET, 0.5, z - GRID_OFFSET); // LOCAL y -- the layer group handles height
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.add(new THREE.LineSegments(boxEdgesGeometry, boxEdgesMaterial)); // child inherits position
          getVoxelLayerGroup(y).add(mesh);
        }
      }
    }
  }
  voxelChangeHooks.forEach(fn => fn());
}

// ── 2D grid panel: canvas, drawing, painting ───────────────────────────────
let gridCanvas, ctx;
export function getCanvas() { return gridCanvas; }
export function getCtx() { return ctx; }

export function canvasLocalPoint(e) {
  const rect = gridCanvas.getBoundingClientRect();
  const scaleX = gridCanvas.width / rect.width;
  const scaleY = gridCanvas.height / rect.height;
  return { px: (e.clientX - rect.left) * scaleX, py: (e.clientY - rect.top) * scaleY };
}

const overlayDrawers = [];
export function registerOverlay(fn) { overlayDrawers.push(fn); } // geometry.js / token.js draw on top of this

export function redraw() {
  if (!ctx) return; // no 2D panel on this page (e.g. player.html)
  ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);

  // Onion-skin lower layers
  for (let y = 0; y < currentLayer; y++) {
    for (let z = 0; z < GRID_SIZE; z++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const blockId = mapData[y][z][x];
        if (blockId !== 0) {
          ctx.fillStyle = `rgba(100, 100, 100, ${0.15 * (y + 1)})`;
          ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
      }
    }
  }

  // Active layer
  for (let z = 0; z < GRID_SIZE; z++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const blockId = mapData[currentLayer][z][x];
      if (blockId !== 0 && blockRegistry[blockId]) {
        ctx.fillStyle = blockRegistry[blockId].color;
        ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
  }

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID_SIZE; i++) {
    ctx.beginPath(); ctx.moveTo(i * CELL_SIZE, 0); ctx.lineTo(i * CELL_SIZE, gridCanvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * CELL_SIZE); ctx.lineTo(gridCanvas.width, i * CELL_SIZE); ctx.stroke();
  }

  for (const draw of overlayDrawers) draw(ctx);
}

let isMouseDown = false;
let activeDrawValue = 1;

function updateGridCellFromMouse(e) {
  const { px, py } = canvasLocalPoint(e);
  const x = Math.floor(px / CELL_SIZE);
  const z = Math.floor(py / CELL_SIZE);

  if (x >= 0 && x < GRID_SIZE && z >= 0 && z < GRID_SIZE) {
    const targetValue = activeDrawValue === 0 ? 0 : getSelectedBlockId();
    if (mapData[currentLayer][z][x] !== targetValue) {
      mapData[currentLayer][z][x] = targetValue;
      redraw();
      update3DScene();
      scheduleSaveVoxels();
    }
  }
}

// ── Shape/bucket paint tools ────────────────────────────────────────────────
// All three write straight into mapData (same as single-cell painting) and
// share its save/redraw/rebuild path -- they're just different ways of
// picking WHICH cells get touched in one action.
function fillRect(x0, z0, x1, z1, value) {
  const minX = Math.max(0, Math.min(x0, x1)), maxX = Math.min(GRID_SIZE - 1, Math.max(x0, x1));
  const minZ = Math.max(0, Math.min(z0, z1)), maxZ = Math.min(GRID_SIZE - 1, Math.max(z0, z1));
  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) mapData[currentLayer][z][x] = value;
  }
}

function drawLine(x0, z0, x1, z1, value) {
  // Bresenham -- straightforward, no external dependency needed for this.
  let dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
  let sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
  let err = dx - dz, x = x0, z = z0;
  while (true) {
    if (x >= 0 && x < GRID_SIZE && z >= 0 && z < GRID_SIZE) mapData[currentLayer][z][x] = value;
    if (x === x1 && z === z1) break;
    const e2 = 2 * err;
    if (e2 > -dz) { err -= dz; x += sx; }
    if (e2 < dx) { err += dx; z += sz; }
  }
}

function bucketFill(x0, z0, value) {
  if (x0 < 0 || x0 >= GRID_SIZE || z0 < 0 || z0 >= GRID_SIZE) return;
  const target = mapData[currentLayer][z0][x0];
  if (target === value) return; // nothing to do
  const stack = [[x0, z0]];
  const visited = new Set();
  while (stack.length) {
    const [x, z] = stack.pop();
    const key = x + ',' + z;
    if (visited.has(key)) continue;
    visited.add(key);
    if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) continue;
    if (mapData[currentLayer][z][x] !== target) continue;
    mapData[currentLayer][z][x] = value;
    stack.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
  }
}

// {x,z,erase} while dragging out a rect/line -- captured on mousedown,
// resolved on mouseup once the end cell is known.
let shapeStart = null;

function updateLayerDisplay() {
  const el = document.getElementById('layer-display');
  if (el) el.textContent = `Layer: ${currentLayer + 1} / ${MAX_LAYERS}`;
}

// ── Environment: parchment floor + warm dusk skybox + fog ──────────────────
// Procedural (canvas-based), not external image files -- no dependency on
// assets that may or may not exist on whatever server this ends up on.
function createParchmentTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const pctx = c.getContext('2d');

  pctx.fillStyle = '#d8c8a0';
  pctx.fillRect(0, 0, size, size);

  // Mottled blotches -- the "aged paper" look
  for (let i = 0; i < 2500; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const r = Math.random() * 2.5 + 0.4;
    pctx.fillStyle = Math.random() > 0.5
      ? `rgba(120,96,58,${(Math.random() * 0.08).toFixed(3)})`
      : `rgba(240,228,196,${(Math.random() * 0.1).toFixed(3)})`;
    pctx.beginPath(); pctx.arc(x, y, r, 0, Math.PI * 2); pctx.fill();
  }

  // Faint grid, like a map sketched onto the parchment itself
  pctx.strokeStyle = 'rgba(90,70,40,0.08)';
  pctx.lineWidth = 1;
  for (let i = 0; i <= size; i += size / 8) {
    pctx.beginPath(); pctx.moveTo(i, 0); pctx.lineTo(i, size); pctx.stroke();
    pctx.beginPath(); pctx.moveTo(0, i); pctx.lineTo(size, i); pctx.stroke();
  }

  // Darkened, uneven edges
  const grad = pctx.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size * 0.72);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(70,50,25,0.25)');
  pctx.fillStyle = grad;
  pctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(GRID_SIZE / 6, GRID_SIZE / 6);
  return tex;
}

// Simple vertical-gradient "skybox" -- a dark stone-ceiling/night tone up
// top fading to a warm torchlit glow at the horizon. Not a true spherical
// sky, but reads well as an ambient backdrop without needing an HDRI asset.
function createDuskSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 512;
  const sctx = c.getContext('2d');
  const grad = sctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#140d08');
  grad.addColorStop(0.55, '#3a2814');
  grad.addColorStop(1, '#7a5024');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 2, 512);
  return new THREE.CanvasTexture(c);
}

// opts.isModeAllowed(mode) -> bool, opts.onDenied() -- lets index.html apply
// its own GM/player permission rules without grid.js knowing about auth.
// opts.has2DPanel (default true) -- player.html has no paint UI at all, just
// the 3D view, so it passes false to skip grabbing/wiring the 2D-panel-only
// elements (none of which exist on that page).
// Firebase RTDB keys can't contain these characters -- building a ref()
// with one in it throws SYNCHRONOUSLY. Without sanitizing, a rename to a
// name containing one of these would tear down the old subscription
// (voxelsUnsub() runs first) and then throw before the new one ever got
// attached -- leaving nothing subscribed at all, which looks exactly like
// "the renderer goes blank."
function sanitizeMapName(raw) {
  return raw.replace(/[.#$[\]/]/g, '_');
}

export function init(threeScene, opts = {}) {
  const { isModeAllowed = () => true, onDenied, has2DPanel = true } = opts;
  scene = threeScene;

  scene.background = createDuskSkyTexture();
  // Fades the parchment plane's far edge (4x the grid size) into the sky
  // color instead of showing a hard rectangular border.
  scene.fog = new THREE.Fog(0x3a2814, GRID_SIZE * 1.2, GRID_SIZE * 4);

  voxelGroup = new THREE.Group();
  scene.add(voxelGroup);

  groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID_SIZE * 4, GRID_SIZE * 4),
    new THREE.MeshStandardMaterial({ map: createParchmentTexture(), roughness: 0.95 })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.receiveShadow = true;
  scene.add(groundPlane);

  // Warm gold/brown instead of the original red/grey -- and now ABOVE the
  // floor (was -0.01, tucked under an invisible plane) since the parchment
  // plane is opaque and would otherwise hide the grid lines beneath it.
  const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x8b6f3a, 0x4a3820);
  gridHelper.position.y = 0.01;
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.5;
  scene.add(gridHelper);

  if (has2DPanel) {
    gridCanvas = document.getElementById('grid-canvas');
    ctx = gridCanvas.getContext('2d');

    gridCanvas.addEventListener('mousedown', (e) => {
      if (mode === 'none') {
        e.preventDefault();
        fireBeforeVoxelEdit(); // once per drag/stroke, not per cell -- see updateGridCellFromMouse
        isMouseDown = true;
        activeDrawValue = e.button === 2 ? 0 : 1;
        updateGridCellFromMouse(e);
        return;
      }
      if (mode === 'bucket') {
        e.preventDefault();
        fireBeforeVoxelEdit();
        const { px, py } = canvasLocalPoint(e);
        const x = Math.floor(px / CELL_SIZE), z = Math.floor(py / CELL_SIZE);
        const value = e.button === 2 ? 0 : getSelectedBlockId();
        bucketFill(x, z, value);
        redraw(); update3DScene(); scheduleSaveVoxels();
        return;
      }
      if (mode === 'rect' || mode === 'line') {
        e.preventDefault();
        fireBeforeVoxelEdit(); // captured now -- nothing mutates between mousedown and the mouseup that applies it
        const { px, py } = canvasLocalPoint(e);
        const x = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(px / CELL_SIZE)));
        const z = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(py / CELL_SIZE)));
        shapeStart = { x, z, erase: e.button === 2 };
      }
    });
    gridCanvas.addEventListener('mousemove', (e) => { if (mode === 'none' && isMouseDown) updateGridCellFromMouse(e); });
    window.addEventListener('mouseup', () => { isMouseDown = false; });
    gridCanvas.addEventListener('mouseup', (e) => {
      if (!shapeStart || (mode !== 'rect' && mode !== 'line')) return;
      const { px, py } = canvasLocalPoint(e);
      const x = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(px / CELL_SIZE)));
      const z = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(py / CELL_SIZE)));
      const value = shapeStart.erase ? 0 : getSelectedBlockId();
      if (mode === 'rect') fillRect(shapeStart.x, shapeStart.z, x, z, value);
      else drawLine(shapeStart.x, shapeStart.z, x, z, value);
      shapeStart = null;
      redraw(); update3DScene(); scheduleSaveVoxels();
    });
    gridCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Generic mode-button wiring -- works for any button with a data-mode
    // attribute, regardless of which module "owns" that tool.
    document.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = btn.dataset.mode;
        if (!isModeAllowed(m)) { onDenied?.(); return; }
        setMode(m);
      });
    });

    document.getElementById('layer-down')?.addEventListener('click', () => {
      if (currentLayer > 0) { currentLayer--; updateLayerDisplay(); redraw(); }
    });
    document.getElementById('layer-up')?.addEventListener('click', () => {
      if (currentLayer < MAX_LAYERS - 1) { currentLayer++; updateLayerDisplay(); redraw(); }
    });
    document.getElementById('clear-btn')?.addEventListener('click', () => {
      fireBeforeVoxelEdit();
      for (let y = 0; y < MAX_LAYERS; y++) for (let z = 0; z < GRID_SIZE; z++) mapData[y][z].fill(0);
      redraw();
      update3DScene();
      scheduleSaveVoxels();
    });

    updateLayerDisplay();
    redraw();
  }

  const mapNameInput = document.getElementById('map-name-input');
  if (mapNameInput) {
    currentMapName = sanitizeMapName(mapNameInput.value.trim()) || 'voxel_test';
    mapNameInput.value = currentMapName;
    mapNameInput.addEventListener('change', () => {
      const next = sanitizeMapName(mapNameInput.value.trim()) || 'voxel_test';
      mapNameInput.value = next; // reflect exactly what's actually being used
      const previous = currentMapName;
      currentMapName = next;
      try {
        mapNameListeners.forEach(fn => fn(currentMapName));
        subscribeVoxels();
      } catch (err) {
        // Belt-and-suspenders: sanitizeMapName should prevent this, but if
        // anything else in the re-subscribe chain throws, fail loudly and
        // revert instead of silently leaving nothing subscribed.
        console.error('[grid.js] failed to switch to map', next, err);
        alert(`Could not switch to map "${next}": ${err.message}\n\nReverting to "${previous}".`);
        currentMapName = previous;
        mapNameInput.value = previous;
        mapNameListeners.forEach(fn => fn(currentMapName));
        subscribeVoxels();
      }
    });
  }
  // else: no map-name UI on this page (e.g. player.html) -- stays on
  // whatever currentMapName already defaulted to ('voxel_test').

  subscribeVoxels();
  update3DScene();
}
