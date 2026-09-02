// geometry.js (module) — walls, doors, lights on the 2D grid panel.
// Data model + addWall/addDoor/addLight/deleteById/toggleDoor and the
// maps/<map>/geometry RTDB path are reused verbatim from ../js/geometry.js
// (the shared mapeditor.html backend), so a map edited here shares its
// geometry with mapeditor.html. Rendering is new -- that module's draw*
// functions are 2D-canvas-only and don't apply to a 3D voxel scene.
//
// Depends on grid.js for the shared canvas/coordinate constants and the
// active-tool-mode state; grid.js has no dependency back on this file.

import * as THREE from 'three';
import { db } from '../js/firebase.js';
import { ref, set, onValue } from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js';
import { addWall, addDoor, addLight, deleteById, toggleDoor, segmentAtPoint, lightAtPoint } from '../js/geometry.js';
import { blockRegistry, getSelectedBlockId, getBlockMaterial } from './block.js';
import * as Grid from './grid.js';

const geometry = { walls: [], doors: [], lights: [], stairs: [] };
let geoPendingStart = null; // {gx,gy,layer} while placing a wall/door's first point
let geometryUnsub = null;
let wallGroup, doorGroup, lightGroup, stairGroup, floorImageGroup;
let stairFacing = 0; // 0=N, 1=E, 2=S, 3=W -- which way a newly-placed stair ascends
let floorImageUnsub = null;

// Walls/doors default to 2 voxel layers tall.
const WALL_HEIGHT = 2;

// ── Per-floor Group architecture (see grid.js's matching comment for the
// full rationale) -- each of walls/doors/lights/stairs gets its own
// Map<layerIndex, THREE.Group>, with the group's Y set exactly once and
// every mesh inside using dead-simple LOCAL coordinates. getSolidMeshes()
// flattens back to a plain array so raycasting callers (ping, ruler, token
// movement) never need to know this nesting exists.
const wallLayerGroups = new Map();
const doorLayerGroups = new Map();
const lightLayerGroups = new Map();
const stairLayerGroups = new Map();

function getLayerSubgroup(container, layerGroupsMap, layerIndex) {
  if (!layerGroupsMap.has(layerIndex)) {
    const group = new THREE.Group();
    group.position.y = layerIndex;
    container.add(group);
    layerGroupsMap.set(layerIndex, group);
  }
  return layerGroupsMap.get(layerIndex);
}

function clearAllLayerSubgroups(layerGroupsMap) {
  for (const g of layerGroupsMap.values()) clearGroup(g);
}

function geometryRefPath() { return `maps/${Grid.getMapName()}/geometry`; }

export async function saveGeometry() {
  await set(ref(db, geometryRefPath()), {
    walls:  geometry.walls.length  ? geometry.walls  : null,
    doors:  geometry.doors.length  ? geometry.doors  : null,
    lights: geometry.lights.length ? geometry.lights : null,
    stairs: geometry.stairs.length ? geometry.stairs : null,
  });
}

// Targeted write for door state only -- same reasoning as mapeditor.html's
// saveGeometryDoors: toggling open/closed happens far more often than
// editing walls/lights, so it shouldn't risk clobbering a concurrent edit.
export async function saveGeometryDoors() {
  await set(ref(db, `${geometryRefPath()}/doors`), geometry.doors.length ? geometry.doors : null);
}

export function subscribeGeometry() {
  if (geometryUnsub) geometryUnsub();
  geometryUnsub = onValue(ref(db, geometryRefPath()), snap => {
    const data = snap.val() || {};
    geometry.walls.length = 0;
    geometry.doors.length = 0;
    geometry.lights.length = 0;
    geometry.stairs.length = 0;
    if (data.walls)  geometry.walls.push(...Object.values(data.walls));
    if (data.doors)  geometry.doors.push(...Object.values(data.doors));
    if (data.lights) geometry.lights.push(...Object.values(data.lights));
    if (data.stairs) geometry.stairs.push(...Object.values(data.stairs));
    renderGeometry();
  });
}

function hexAARRGGBBtoThreeColor(hex) {
  const h = (hex || 'ffffccaa').replace('#', '');
  const rgb = h.length >= 8 ? h.slice(2) : h; // drop leading alpha byte if present
  return new THREE.Color('#' + rgb.slice(0, 6).padEnd(6, 'f'));
}

function hexToRgba(hex, alpha) {
  const h = (hex || '#888888').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function clearGroup(group) {
  while (group.children.length) {
    const obj = group.children[0];
    group.remove(obj);
    obj.geometry?.dispose?.();
  }
}

// A staircase is 4 stacked half-width boxes (not custom wedge geometry --
// this is simple and reliable to get right without live visual testing).
// Built in local space spanning one cell (-0.5..0.5 on each axis), rising
// from z=-0.5 (short step) to z=+0.5 (full height, flush with a normal
// block) -- i.e. it ascends toward local +Z. Facing rotates the whole
// group around Y, same trick segmentMesh-style code uses for walls.
const STAIR_STEP_COUNT = 4;
function buildStairGroup(material) {
  const group = new THREE.Group();
  const stepDepth = 1 / STAIR_STEP_COUNT;
  for (let i = 0; i < STAIR_STEP_COUNT; i++) {
    const stepHeight = (i + 1) / STAIR_STEP_COUNT;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, stepHeight, stepDepth), material);
    mesh.position.set(0, stepHeight / 2 - 0.5, -0.5 + stepDepth * (i + 0.5));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

// A single tilted box forming a smooth 45° incline -- an alternative to
// the stepped staircase above. Same group positioning/facing convention as
// buildStairGroup (see the stairs loop in renderGeometry), so swapping
// between the two is purely which mesh gets built, nothing else changes.
function buildRampGroup(material) {
  const group = new THREE.Group();
  const length = Math.SQRT2; // rises 1 unit over 1 unit of run -> 45 degrees
  const plank = new THREE.Mesh(new THREE.BoxGeometry(1, 0.15, length), material);
  plank.rotation.x = -Math.PI / 4;
  plank.castShadow = true;
  plank.receiveShadow = true;
  group.add(plank);
  return group;
}

const STAIR_FACING_RADIANS = [0, Math.PI / 2, Math.PI, -Math.PI / 2]; // N, E, S, W
export function getStairFacing() { return stairFacing; }
export function cycleStairFacing() {
  stairFacing = (stairFacing + 1) % 4;
  return stairFacing;
}

let stairShape = 'steps'; // 'steps' | 'ramp' -- which mesh newly-placed stairs use
export function getStairShape() { return stairShape; }
export function cycleStairShape() {
  stairShape = stairShape === 'steps' ? 'ramp' : 'steps';
  return stairShape;
}

// geometry.js's corner convention (integer 0..GRID_SIZE) lines up 1:1 with
// the 2D panel's own CELL_SIZE pixel grid. This converts into 3D world space.
function geomToWorld(gx, gy) {
  return { x: gx - Grid.GRID_OFFSET - 0.5, z: gy - Grid.GRID_OFFSET - 0.5 };
}

function segmentMesh(seg, kind, thickness) {
  const a = geomToWorld(seg.x1, seg.y1);
  const b = geomToWorld(seg.x2, seg.y2);
  const dx = b.x - a.x, dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 0.01;
  const material = getBlockMaterial(seg.blockTitle, seg.blockColor);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, WALL_HEIGHT, thickness), material);
  mesh.position.set((a.x + b.x) / 2, WALL_HEIGHT / 2, (a.z + b.z) / 2); // LOCAL y -- the layer group handles height
  mesh.rotation.y = -Math.atan2(dz, dx);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { id: seg.id, kind };
  return mesh;
}

function renderGeometry() {
  clearAllLayerSubgroups(wallLayerGroups);
  clearAllLayerSubgroups(doorLayerGroups);
  clearAllLayerSubgroups(lightLayerGroups);
  clearAllLayerSubgroups(stairLayerGroups);

  for (const w of geometry.walls) {
    getLayerSubgroup(wallGroup, wallLayerGroups, w.layer ?? 0).add(segmentMesh(w, 'wall', 0.12));
  }

  for (const d of geometry.doors) {
    const mesh = segmentMesh(d, 'door', 0.12);
    if (!d.closed) {
      // Open door: shrink to a thin frame outline. Clone the material first
      // so dimming this one door doesn't fade every wall/door sharing the
      // same cached block texture.
      mesh.material = mesh.material.clone();
      mesh.scale.set(1, 0.15, 1);
      mesh.material.transparent = true;
      mesh.material.opacity = 0.5;
    }
    getLayerSubgroup(doorGroup, doorLayerGroups, d.layer ?? 0).add(mesh);
  }

  // WebGL fragment shaders have a fixed texture-unit budget (commonly 16);
  // every shadow-casting point light needs its own depth-cubemap sampler in
  // that budget, shared across every lit material in the scene. A dd2vtt
  // import (or just a lot of hand-placed lights) can easily exceed it,
  // which is a hard shader-compile error, not a soft rendering glitch.
  // Capped here rather than trusting every light's own `shadows` flag --
  // all lights still illuminate, only a limited number cast real shadows.
  const MAX_SHADOW_CASTING_LIGHTS = 4;
  let shadowLightsUsed = 0;
  for (const l of geometry.lights) {
    const pos = geomToWorld(l.x, l.y);
    const color = hexAARRGGBBtoThreeColor(l.color);
    const y = 0.6; // LOCAL -- the layer group handles height

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 12),
      new THREE.MeshBasicMaterial({ color })
    );
    marker.position.set(pos.x, y, pos.z);
    marker.userData = { id: l.id, kind: 'light' };
    const layerGroup = getLayerSubgroup(lightGroup, lightLayerGroups, l.layer ?? 0);
    layerGroup.add(marker);

    const pointLight = new THREE.PointLight(color, (l.intensity ?? 1) * 2, (l.range ?? 5) * 2, 2);
    pointLight.position.set(pos.x, y, pos.z);
    if (l.shadows !== false && shadowLightsUsed < MAX_SHADOW_CASTING_LIGHTS) {
      pointLight.castShadow = true;
      pointLight.shadow.mapSize.set(512, 512);
      shadowLightsUsed++;
    }
    layerGroup.add(pointLight);
  }

  for (const s of geometry.stairs) {
    const material = getBlockMaterial(s.blockTitle, s.blockColor); // same texture system as walls/doors/blocks
    const group = s.shape === 'ramp' ? buildRampGroup(material) : buildStairGroup(material);
    const worldX = Math.round(s.x) - Grid.GRID_OFFSET, worldZ = Math.round(s.y) - Grid.GRID_OFFSET;
    group.position.set(worldX, 0.5, worldZ); // LOCAL y -- the layer group handles height
    group.rotation.y = STAIR_FACING_RADIANS[s.facing ?? 0];
    group.userData = { id: s.id, kind: 'stair' };
    getLayerSubgroup(stairGroup, stairLayerGroups, s.layer ?? 0).add(group);
  }
}

function drawOverlay(ctx) {
  const currentLayer = Grid.getCurrentLayer();
  const CELL_SIZE = Grid.CELL_SIZE;

  ctx.lineWidth = 3;
  for (const w of geometry.walls) {
    const onLayer = (w.layer ?? 0) === currentLayer;
    const base = w.blockColor || '#aaaaaa';
    ctx.strokeStyle = onLayer ? base : hexToRgba(base, 0.25);
    ctx.beginPath();
    ctx.moveTo(w.x1 * CELL_SIZE, w.y1 * CELL_SIZE);
    ctx.lineTo(w.x2 * CELL_SIZE, w.y2 * CELL_SIZE);
    ctx.stroke();
  }
  for (const d of geometry.doors) {
    const onLayer = (d.layer ?? 0) === currentLayer;
    const base = d.blockColor || '#c88a4a';
    const alpha = onLayer ? (d.closed ? 1 : 0.4) : 0.15;
    ctx.strokeStyle = hexToRgba(base, alpha);
    ctx.beginPath();
    ctx.moveTo(d.x1 * CELL_SIZE, d.y1 * CELL_SIZE);
    ctx.lineTo(d.x2 * CELL_SIZE, d.y2 * CELL_SIZE);
    ctx.stroke();
  }
  for (const l of geometry.lights) {
    const onLayer = (l.layer ?? 0) === currentLayer;
    ctx.fillStyle = onLayer ? '#ffcc55' : 'rgba(255,204,85,0.25)';
    ctx.beginPath();
    ctx.arc(l.x * CELL_SIZE, l.y * CELL_SIZE, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (geoPendingStart) {
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(geoPendingStart.gx * CELL_SIZE, geoPendingStart.gy * CELL_SIZE, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stairs: a small triangle pointing the direction they ascend toward
  for (const s of geometry.stairs) {
    const onLayer = (s.layer ?? 0) === currentLayer;
    const cx = (Math.round(s.x) + 0.5) * CELL_SIZE, cy = (Math.round(s.y) + 0.5) * CELL_SIZE;
    const r = CELL_SIZE * 0.3;
    const angle = STAIR_FACING_RADIANS[s.facing ?? 0];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.globalAlpha = onLayer ? 1 : 0.3;
    ctx.fillStyle = s.blockColor || '#c8a84b';
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, r * 0.6); ctx.lineTo(-r * 0.8, r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// geometry.js's wall/door/light objects are flat 2D (x,y only) with no
// concept of elevation, so a `layer` field is attached here after creation
// -- whichever voxel layer is active when you place something is the layer
// it's tied to. Extra field, harmless to mapeditor.html's flat 2D view.
async function handleGridClick(e) {
  const mode = Grid.getMode();
  if (mode !== 'wall' && mode !== 'door' && mode !== 'light' && mode !== 'stairs' && mode !== 'delete') return;

  const { px, py } = Grid.canvasLocalPoint(e);
  const GRID_SIZE = Grid.GRID_SIZE, CELL_SIZE = Grid.CELL_SIZE, currentLayer = Grid.getCurrentLayer();

  if (mode === 'wall' || mode === 'door') {
    const gx = Math.min(GRID_SIZE, Math.max(0, Math.round(px / CELL_SIZE)));
    const gy = Math.min(GRID_SIZE, Math.max(0, Math.round(py / CELL_SIZE)));
    if (!geoPendingStart) { geoPendingStart = { gx, gy, layer: currentLayer }; Grid.redraw(); return; }
    const { gx: sx, gy: sy, layer: startLayer } = geoPendingStart;
    geoPendingStart = null;
    if (sx === gx && sy === gy) { Grid.redraw(); return; }
    if (sx !== gx && sy !== gy) { Grid.redraw(); return; } // not axis-aligned, retry
    const seg = mode === 'wall'
      ? addWall(geometry.walls, sx, sy, gx, gy)
      : addDoor(geometry.doors, sx, sy, gx, gy, { closed: true });
    seg.layer = startLayer; // ties it to the layer it was started on
    const selBlock = blockRegistry[getSelectedBlockId()];
    seg.blockTitle = selBlock.title;
    seg.blockColor = selBlock.color;
    renderGeometry(); Grid.redraw();
    await saveGeometry();
    return;
  }

  if (mode === 'light') {
    const tx = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(px / CELL_SIZE)));
    const ty = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(py / CELL_SIZE)));
    const light = addLight(geometry.lights, tx + 0.5, ty + 0.5, {});
    light.layer = currentLayer;
    renderGeometry(); Grid.redraw();
    await saveGeometry();
    return;
  }

  if (mode === 'stairs') {
    // One stair per cell -- replace any existing one there rather than
    // stacking duplicates.
    const tx = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(px / CELL_SIZE)));
    const ty = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(py / CELL_SIZE)));
    const existingIdx = geometry.stairs.findIndex(
      s => Math.round(s.x) === tx && Math.round(s.y) === ty && (s.layer ?? 0) === currentLayer
    );
    if (existingIdx !== -1) geometry.stairs.splice(existingIdx, 1);
    const selBlock = blockRegistry[getSelectedBlockId()];
    geometry.stairs.push({
      id: 'stair_' + Date.now(),
      x: tx, y: ty, layer: currentLayer,
      facing: stairFacing,
      shape: stairShape,
      blockTitle: selBlock.title,
      blockColor: selBlock.color,
    });
    renderGeometry(); Grid.redraw();
    await saveGeometry();
    return;
  }

  if (mode === 'delete') {
    // Only ever hit-test against the active layer's own geometry.
    const gx = px / CELL_SIZE, gy = py / CELL_SIZE;
    const wallsHere  = geometry.walls.filter(w => (w.layer ?? 0) === currentLayer);
    const doorsHere  = geometry.doors.filter(d => (d.layer ?? 0) === currentLayer);
    const lightsHere = geometry.lights.filter(l => (l.layer ?? 0) === currentLayer);

    const seg = segmentAtPoint(wallsHere, doorsHere, gx, gy, 0.3);
    if (seg) {
      deleteById(seg.kind === 'wall' ? geometry.walls : geometry.doors, seg.id);
      renderGeometry(); Grid.redraw();
      await saveGeometry();
      return;
    }
    const lightId = lightAtPoint(lightsHere, gx, gy, 0.4);
    if (lightId) {
      deleteById(geometry.lights, lightId);
      renderGeometry(); Grid.redraw();
      await saveGeometry();
      return;
    }
    const tx = Math.floor(gx), ty = Math.floor(gy);
    const stairIdx = geometry.stairs.findIndex(
      s => Math.round(s.x) === tx && Math.round(s.y) === ty && (s.layer ?? 0) === currentLayer
    );
    if (stairIdx !== -1) {
      geometry.stairs.splice(stairIdx, 1);
      renderGeometry(); Grid.redraw();
      await saveGeometry();
    }
  }
}

// Door toggling stays a 3D-view action (a "None" mode click on a door),
// since it's play interaction, not GM editing. index.html's shared pointerup
// handler calls this with its own raycastAgainst; returns true if it handled
// a toggle, so the caller knows not to also try token interaction.
export function tryToggleDoorAt3DHit(raycastAgainst) {
  const doorMeshes = [];
  for (const g of doorLayerGroups.values()) doorMeshes.push(...g.children);
  const hit = raycastAgainst(doorMeshes);
  if (!hit || hit.object.userData?.kind !== 'door') return false;
  toggleDoor(geometry.doors, hit.object.userData.id);
  renderGeometry();
  saveGeometryDoors();
  return true;
}

// Wall/door meshes as raycast targets, for anything (ping, ruler) that
// should hit the actual clicked surface instead of passing through solid
// geometry to whatever voxel/ground is behind it.
// Collision check for token movement: does a wall or CLOSED door block
// crossing this specific unit edge (two adjacent grid corners) on this
// layer? Open doors never block. Handles walls/doors longer than one unit
// by checking whether the crossed edge falls within the segment's span,
// not just an exact endpoint match.
export function isEdgeBlocked(layer, ex1, ey1, ex2, ey2) {
  const edgeIsHorizontal = ey1 === ey2; // true: edge runs along X at fixed Y
  const candidates = geometry.doors.filter(d => d.closed).concat(geometry.walls);
  for (const seg of candidates) {
    if ((seg.layer ?? 0) !== layer) continue;
    const segIsHorizontal = seg.y1 === seg.y2;
    if (edgeIsHorizontal && segIsHorizontal && seg.y1 === ey1) {
      const segMinX = Math.min(seg.x1, seg.x2), segMaxX = Math.max(seg.x1, seg.x2);
      const edgeMinX = Math.min(ex1, ex2), edgeMaxX = Math.max(ex1, ex2);
      if (edgeMinX >= segMinX && edgeMaxX <= segMaxX) return true;
    } else if (!edgeIsHorizontal && !segIsHorizontal && seg.x1 === ex1) {
      const segMinY = Math.min(seg.y1, seg.y2), segMaxY = Math.max(seg.y1, seg.y2);
      const edgeMinY = Math.min(ey1, ey2), edgeMaxY = Math.max(ey1, ey2);
      if (edgeMinY >= segMinY && edgeMaxY <= segMaxY) return true;
    }
  }
  return false;
}

// Flattened list of actual wall/door meshes across every layer subgroup,
// for raycasting (ping, ruler, token ground-hit). Keeps the external API
// (a flat array of real meshes) unchanged even though these are now nested
// inside per-layer groups.
export function getSolidMeshes() {
  const meshes = [];
  for (const g of wallLayerGroups.values()) meshes.push(...g.children);
  for (const g of doorLayerGroups.values()) meshes.push(...g.children);
  return meshes;
}

// Is there a stair at this cell that's actually reachable from the token's
// current elevation (the floor directly below it or directly above it)?
// Without this check, a different stair recorded at the same (x,y) but a
// totally different layer would match by coincidence. Portal-style: token.js
// resolves a match to a straight ±1 jump depending on which side you're on.
export function getStairAt(x, y, currentElevation) {
  return geometry.stairs.find(s => {
    if (Math.round(s.x) !== x || Math.round(s.y) !== y) return false;
    const base = s.layer ?? 0;
    return currentElevation === base || currentElevation === base + 1;
  }) || null;
}

// ── dd2vtt import ────────────────────────────────────────────────────────
// dungeondraft's export format: line_of_sight (wall polylines), portals
// (doors), lights, and a base64 rendered image, all in GRID UNITS matching
// resolution.map_size -- so no unit conversion needed, only placement.
//
// Raw dd2vtt coordinates run 0..map_size (top-left origin), NOT centered --
// confirmed against a prior working prototype (uploaded this session) that
// centers by subtracting half the map's width/height from every raw
// coordinate before use. Matched here: offsetX/offsetY (opts) default to 0,
// meaning "centered in the world", not "anchored at world (0,0)".
//
// Walls/doors/lights become real entries in the SAME arrays a GM drawing by
// hand would create -- addWall/addDoor/addLight are the exact same reused
// functions handleGridClick() calls, so an imported wall is indistinguishable
// from a hand-drawn one afterward. The floor is a blank textured plane with
// the dd2vtt image printed on it (not voxelized or material-interpreted),
// extruded up with walls/doors/lights the same way we already do everything
// else.
//
// The image is stored SEPARATELY from the geometry node, under
// assets/uploads/maps/<name>_floors -- same reasoning as js/assets.js's
// token-art uploads: a multi-MB base64 blob has no business living inside a
// node that gets fully rewritten on every wall/door/light edit. Keyed by
// LAYER (plural "_floors", an object of layer -> floor data) rather than a
// single record -- a single record meant importing a second dd2vtt for a
// different floor silently deleted the first one's image, since both
// writes hit the exact same path. Written once per layer at import time;
// every client (including player.html) subscribes to the whole node
// independently and renders every layer's plane itself.
function floorImagesRefPath() { return `assets/uploads/maps/${Grid.getMapName()}_floors`; }

async function saveFloorImage(dataUri, x, y, width, height, layer) {
  await set(ref(db, `${floorImagesRefPath()}/${layer}`), { dataUri, x, y, width, height });
}

// Dungeondraft's exported image is a rectangle; the actual map is usually
// an irregular shape within it, and dd2vtt gives no alpha-mask for that --
// so the area outside the real rooms renders as whatever solid background
// color the export used, which looked like an opaque black slab blocking
// the view of the floor/level underneath instead of "no image there".
// Ported from a prior working prototype (uploaded this session), tested
// against a real Dungeondraft "Roof" level export:
//   1. If the image's four corners ALREADY have real alpha < 250, trust
//      it completely -- some dd2vtt exports (e.g. "Roof" levels) DO embed
//      genuine transparency for unbuilt area, and a naive color-matching
//      pass would incorrectly punch holes in the image's own dark linework
//      (a roof's outline strokes can be the exact same near-black RGB as
//      the "empty" background).
//   2. Otherwise, sample the corners as the presumed background color --
//      only if all four are close enough to each other to be confident
//      they're actually background and not just four different rooms --
//      and set alpha=0 for every pixel close to that color.
// alphaTest (not `transparent: true`) on the material: a hard cutoff
// rather than blending, which avoids transparency sort-order artifacts
// against the parchment floor/other layers underneath.
function loadFloorTextureWithTransparency(dataUri) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const cctx = canvas.getContext('2d');
      cctx.drawImage(img, 0, 0);

      try {
        const imageData = cctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const w = canvas.width, h = canvas.height;
        const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => {
          const i = (y * w + x) * 4;
          return [data[i], data[i + 1], data[i + 2], data[i + 3]];
        });
        const cornersAlreadyHaveTransparency = corners.some(c => c[3] < 250);

        if (!cornersAlreadyHaveTransparency) {
          let maxCornerDist = 0;
          for (let a = 0; a < corners.length; a++) {
            for (let b = a + 1; b < corners.length; b++) {
              const d = Math.max(
                Math.abs(corners[a][0] - corners[b][0]),
                Math.abs(corners[a][1] - corners[b][1]),
                Math.abs(corners[a][2] - corners[b][2])
              );
              if (d > maxCornerDist) maxCornerDist = d;
            }
          }
          const CONSISTENCY_THRESHOLD = 30;
          if (maxCornerDist <= CONSISTENCY_THRESHOLD) {
            const bg = [0, 1, 2].map(c => Math.round(corners.reduce((s, p) => s + p[c], 0) / 4));
            const TOLERANCE = 18;
            for (let i = 0; i < data.length; i += 4) {
              if (Math.abs(data[i] - bg[0]) <= TOLERANCE &&
                  Math.abs(data[i + 1] - bg[1]) <= TOLERANCE &&
                  Math.abs(data[i + 2] - bg[2]) <= TOLERANCE) {
                data[i + 3] = 0;
              }
            }
            cctx.putImageData(imageData, 0, 0);
          }
        }
        resolve(new THREE.Texture(canvas));
      } catch (err) {
        console.warn('[geometry.js] could not read floor image pixel data -- unpopulated areas will render opaque instead of see-through.', err);
        resolve(new THREE.Texture(img));
      }
    };
    img.onerror = () => {
      console.warn('[geometry.js] could not decode floor image.');
      resolve(null);
    };
    img.src = dataUri;
  });
}

async function renderFloorImages(data) {
  while (floorImageGroup.children.length) floorImageGroup.remove(floorImageGroup.children[0]);
  if (!data) return;

  for (const [layerStr, entry] of Object.entries(data)) {
    if (!entry?.dataUri) continue;
    const layer = parseInt(layerStr, 10);
    const texture = await loadFloorTextureWithTransparency(entry.dataUri);
    if (!texture) continue;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.needsUpdate = true;

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(entry.width, entry.height),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, transparent: true, alphaTest: 0.5 })
    );
    mesh.rotation.x = -Math.PI / 2;
    // PlaneGeometry is centered on its own local origin; our own top-left
    // dd2vtt corner is (x,y), so shift by half the size to place it
    // correctly -- same idea as geomToWorld's own -0.5 corner convention.
    const centerX = entry.x + entry.width / 2, centerY = entry.y + entry.height / 2;
    const world = geomToWorld(centerX, centerY);
    mesh.position.set(world.x, 0.02, world.z); // LOCAL y -- the layer group handles height
    mesh.receiveShadow = true;

    const layerGroup = new THREE.Group();
    layerGroup.position.y = layer;
    layerGroup.add(mesh);
    floorImageGroup.add(layerGroup);
  }
}

function subscribeFloorImage() {
  if (floorImageUnsub) floorImageUnsub();
  floorImageUnsub = onValue(
    ref(db, floorImagesRefPath()),
    snap => renderFloorImages(snap.val()),
    err => console.error('[geometry.js] failed to read floor images from', floorImagesRefPath(), err)
  );
}

// opts: offsetX/offsetY (nudge the import away from world-center, default
// 0 = centered), layer (which voxel layer walls/doors/lights/floor attach
// to, default current layer), blockTitle/blockColor (dd2vtt doesn't specify
// a wall material, so imported walls/doors use whatever block is selected
// in the palette at import time -- same as hand-drawn ones).
export async function importDD2VTT(data, opts = {}) {
  const {
    offsetX = 0, offsetY = 0,
    layer = Grid.getCurrentLayer(),
    blockTitle = 'default', blockColor = '#aaaaaa',
  } = opts;

  const mapW = Math.floor(data.resolution?.map_size?.x ?? 0);
  const mapH = Math.floor(data.resolution?.map_size?.y ?? 0);
  // Centers the raw 0..map_size coordinates, then applies the caller's
  // additional nudge -- see the file-header comment on this section.
  const centerX = Math.floor(mapW / 2) - offsetX;
  const centerY = Math.floor(mapH / 2) - offsetY;
  const conv = (x, y) => ({ x: x - centerX, y: y - centerY });

  for (const poly of data.line_of_sight || []) {
    for (let i = 0; i < poly.length - 1; i++) {
      const a = conv(poly[i].x, poly[i].y), b = conv(poly[i + 1].x, poly[i + 1].y);
      const seg = addWall(geometry.walls, a.x, a.y, b.x, b.y);
      seg.layer = layer;
      seg.blockTitle = blockTitle;
      seg.blockColor = blockColor;
    }
  }

  for (const portal of data.portals || []) {
    const [p1, p2] = portal.bounds || [];
    if (!p1 || !p2) continue;
    const a = conv(p1.x, p1.y), b = conv(p2.x, p2.y);
    const seg = addDoor(geometry.doors, a.x, a.y, b.x, b.y, { closed: portal.closed !== false });
    seg.layer = layer;
    seg.blockTitle = blockTitle;
    seg.blockColor = blockColor;
  }

  for (const l of data.lights || []) {
    const p = conv(l.position?.x ?? 0, l.position?.y ?? 0);
    const light = addLight(geometry.lights, p.x, p.y, {
      range: l.range, intensity: l.intensity, color: l.color, shadows: l.shadows,
    });
    light.layer = layer;
  }

  renderGeometry();
  Grid.redraw();
  await saveGeometry();

  if (data.image && mapW && mapH) {
    const dataUri = data.image.startsWith('data:') ? data.image : `data:image/png;base64,${data.image}`;
    const topLeft = conv(0, 0);
    await saveFloorImage(dataUri, topLeft.x, topLeft.y, mapW, mapH, layer);
  }
}

export function initGeometry(scene) {
  wallGroup = new THREE.Group();
  doorGroup = new THREE.Group();
  lightGroup = new THREE.Group();
  stairGroup = new THREE.Group();
  floorImageGroup = new THREE.Group();
  scene.add(wallGroup, doorGroup, lightGroup, stairGroup, floorImageGroup);

  Grid.registerOverlay(drawOverlay);
  Grid.getCanvas()?.addEventListener('click', handleGridClick);
  Grid.onMapNameChange(() => { subscribeGeometry(); subscribeFloorImage(); });

  subscribeGeometry();
  subscribeFloorImage();
}
