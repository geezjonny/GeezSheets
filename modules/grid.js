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

export const GRID_SIZE = 32;
export const MAX_LAYERS = 16;
export const CELL_SIZE = 320 / GRID_SIZE;
export const GRID_OFFSET = GRID_SIZE / 2 - 0.5;

export const mapData = Array.from({ length: MAX_LAYERS }, () =>
  Array.from({ length: GRID_SIZE }, () => new Uint8Array(GRID_SIZE))
);

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
        isMouseDown = true;
        activeDrawValue = e.button === 2 ? 0 : 1;
        updateGridCellFromMouse(e);
        return;
      }
      if (mode === 'bucket') {
        e.preventDefault();
        const { px, py } = canvasLocalPoint(e);
        const x = Math.floor(px / CELL_SIZE), z = Math.floor(py / CELL_SIZE);
        const value = e.button === 2 ? 0 : getSelectedBlockId();
        bucketFill(x, z, value);
        redraw(); update3DScene(); scheduleSaveVoxels();
        return;
      }
      if (mode === 'rect' || mode === 'line') {
        e.preventDefault();
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
