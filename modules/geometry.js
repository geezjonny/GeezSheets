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

const geometry = { walls: [], doors: [], lights: [] };
let geoPendingStart = null; // {gx,gy,layer} while placing a wall/door's first point
let geometryUnsub = null;
let wallGroup, doorGroup, lightGroup;

// Walls/doors default to 2 voxel layers tall.
const WALL_HEIGHT = 2;

function geometryRefPath() { return `maps/${Grid.getMapName()}/geometry`; }

export async function saveGeometry() {
  await set(ref(db, geometryRefPath()), {
    walls:  geometry.walls.length  ? geometry.walls  : null,
    doors:  geometry.doors.length  ? geometry.doors  : null,
    lights: geometry.lights.length ? geometry.lights : null,
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
    if (data.walls)  geometry.walls.push(...Object.values(data.walls));
    if (data.doors)  geometry.doors.push(...Object.values(data.doors));
    if (data.lights) geometry.lights.push(...Object.values(data.lights));
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
  mesh.position.set((a.x + b.x) / 2, (seg.layer ?? 0) + WALL_HEIGHT / 2, (a.z + b.z) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { id: seg.id, kind };
  return mesh;
}

function renderGeometry() {
  clearGroup(wallGroup);
  clearGroup(doorGroup);
  clearGroup(lightGroup);

  for (const w of geometry.walls) wallGroup.add(segmentMesh(w, 'wall', 0.12));

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
    doorGroup.add(mesh);
  }

  for (const l of geometry.lights) {
    const pos = geomToWorld(l.x, l.y);
    const color = hexAARRGGBBtoThreeColor(l.color);
    const y = (l.layer ?? 0) + 0.6;

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 12),
      new THREE.MeshBasicMaterial({ color })
    );
    marker.position.set(pos.x, y, pos.z);
    marker.userData = { id: l.id, kind: 'light' };
    lightGroup.add(marker);

    const pointLight = new THREE.PointLight(color, (l.intensity ?? 1) * 2, (l.range ?? 5) * 2, 2);
    pointLight.position.set(pos.x, y, pos.z);
    if (l.shadows !== false) {
      pointLight.castShadow = true;
      pointLight.shadow.mapSize.set(512, 512);
    }
    lightGroup.add(pointLight);
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
}

// geometry.js's wall/door/light objects are flat 2D (x,y only) with no
// concept of elevation, so a `layer` field is attached here after creation
// -- whichever voxel layer is active when you place something is the layer
// it's tied to. Extra field, harmless to mapeditor.html's flat 2D view.
async function handleGridClick(e) {
  const mode = Grid.getMode();
  if (mode !== 'wall' && mode !== 'door' && mode !== 'light' && mode !== 'delete') return;

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
    }
  }
}

// Door toggling stays a 3D-view action (a "None" mode click on a door),
// since it's play interaction, not GM editing. index.html's shared pointerup
// handler calls this with its own raycastAgainst; returns true if it handled
// a toggle, so the caller knows not to also try token interaction.
export function tryToggleDoorAt3DHit(raycastAgainst) {
  const hit = raycastAgainst(doorGroup.children);
  if (!hit || hit.object.userData?.kind !== 'door') return false;
  toggleDoor(geometry.doors, hit.object.userData.id);
  renderGeometry();
  saveGeometryDoors();
  return true;
}

// Wall/door meshes as raycast targets, for anything (ping, ruler) that
// should hit the actual clicked surface instead of passing through solid
// geometry to whatever voxel/ground is behind it.
export function getSolidMeshes() {
  return [...wallGroup.children, ...doorGroup.children];
}

export function initGeometry(scene) {
  wallGroup = new THREE.Group();
  doorGroup = new THREE.Group();
  lightGroup = new THREE.Group();
  scene.add(wallGroup, doorGroup, lightGroup);

  Grid.registerOverlay(drawOverlay);
  Grid.getCanvas()?.addEventListener('click', handleGridClick);
  Grid.onMapNameChange(() => subscribeGeometry());

  subscribeGeometry();
}
