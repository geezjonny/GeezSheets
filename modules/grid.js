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
let scene, voxelGroup, groundPlane;
export function getVoxelGroup() { return voxelGroup; }
export function getGroundPlane() { return groundPlane; }

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const voxelChangeHooks = [];
export function onVoxelSceneChange(fn) { voxelChangeHooks.push(fn); } // e.g. tokens repositioning after terrain edits

export function update3DScene() {
  while (voxelGroup.children.length > 0) voxelGroup.remove(voxelGroup.children[0]);
  for (let y = 0; y < MAX_LAYERS; y++) {
    for (let z = 0; z < GRID_SIZE; z++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const blockId = mapData[y][z][x];
        if (blockId !== 0 && blockRegistry[blockId]) {
          const mesh = new THREE.Mesh(boxGeometry, blockRegistry[blockId].material);
          mesh.position.set(x - GRID_OFFSET, y + 0.5, z - GRID_OFFSET);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          voxelGroup.add(mesh);
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

function updateLayerDisplay() {
  const el = document.getElementById('layer-display');
  if (el) el.textContent = `Layer: ${currentLayer + 1} / ${MAX_LAYERS}`;
}

// opts.isModeAllowed(mode) -> bool, opts.onDenied() -- lets index.html apply
// its own GM/player permission rules without grid.js knowing about auth.
// opts.has2DPanel (default true) -- player.html has no paint UI at all, just
// the 3D view, so it passes false to skip grabbing/wiring the 2D-panel-only
// elements (none of which exist on that page).
export function init(threeScene, opts = {}) {
  const { isModeAllowed = () => true, onDenied, has2DPanel = true } = opts;
  scene = threeScene;

  voxelGroup = new THREE.Group();
  scene.add(voxelGroup);

  groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID_SIZE * 4, GRID_SIZE * 4),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.receiveShadow = true;
  scene.add(groundPlane);

  const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0xff0000, 0x444444);
  gridHelper.position.y = -0.01;
  scene.add(gridHelper);

  if (has2DPanel) {
    gridCanvas = document.getElementById('grid-canvas');
    ctx = gridCanvas.getContext('2d');

    gridCanvas.addEventListener('mousedown', (e) => {
      if (mode !== 'none') return; // paint only in the free/default mode
      e.preventDefault();
      isMouseDown = true;
      activeDrawValue = e.button === 2 ? 0 : 1;
      updateGridCellFromMouse(e);
    });
    gridCanvas.addEventListener('mousemove', (e) => { if (isMouseDown) updateGridCellFromMouse(e); });
    window.addEventListener('mouseup', () => { isMouseDown = false; });
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

// Firebase RTDB keys can't contain these characters -- building a ref()
// with one in it throws SYNCHRONOUSLY. Without sanitizing, a rename to a
// name containing one of these would tear down the old subscription
// (voxelsUnsub() runs first) and then throw before the new one ever got
// attached -- leaving nothing subscribed at all, which looks exactly like
// "the renderer goes blank."
function sanitizeMapName(raw) {
  return raw.replace(/[.#$[\]/]/g, '_');
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
