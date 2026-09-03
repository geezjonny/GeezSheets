// block.js — the block palette: registry, texture loading, UI.
// Owns everything about "what block is selected / what does it look like".
// grid.js reads blockRegistry + getSelectedBlockId() to paint voxels;
// geometry.js reads getBlockMaterial() to texture walls/doors with whatever
// block was selected at placement time.

import * as THREE from 'three';
import { TEXTURE_PATH } from '../js/config.js';

export const textureLoader = new THREE.TextureLoader();

export const blockRegistry = {
  1: {
    title: 'default',
    color: '#4f9da6',
    material: new THREE.MeshStandardMaterial({ color: 0x4f9da6, roughness: 0.4 })
  }
};
let nextBlockId = 2;
let selectedBlockId = 1;

export function getSelectedBlockId() { return selectedBlockId; }

function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) color += letters[Math.floor(Math.random() * 16)];
  return color;
}

export function registerNewBlock(title) {
  if (!title) return;
  const cleanTitle = title.trim().toLowerCase();
  const id = nextBlockId++;
  const fallbackColor = getRandomColor();
  const texturePath = `${TEXTURE_PATH}${cleanTitle}.png`;

  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

  textureLoader.load(
    texturePath,
    (texture) => {
      texture.magFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture;
      material.needsUpdate = true;
    },
    undefined,
    () => {
      material.map = null;
      material.color.set(fallbackColor);
      material.needsUpdate = true;
    }
  );

  blockRegistry[id] = { title: cleanTitle, color: fallbackColor, material };
  selectedBlockId = id;
  renderPaletteUI();
}

export function renderPaletteUI() {
  const container = document.getElementById('block-list');
  if (!container) return; // player.html has no palette UI at all
  container.innerHTML = '';
  Object.keys(blockRegistry).forEach(idStr => {
    const id = parseInt(idStr);
    const block = blockRegistry[id];
    const chip = document.createElement('div');
    chip.className = `block-chip ${id === selectedBlockId ? 'selected' : ''}`;
    chip.innerHTML = `<span style="display:inline-block;width:10px;height:10px;background:${block.color};margin-right:4px;border-radius:2px;"></span>${block.title}`;
    chip.addEventListener('click', () => { selectedBlockId = id; renderPaletteUI(); });
    container.appendChild(chip);
  });
}

export function initBlockPalette() {
  document.getElementById('add-block-btn').addEventListener('click', () => {
    const input = document.getElementById('block-title-input');
    if (input.value.trim()) { registerNewBlock(input.value); input.value = ''; }
  });
  renderPaletteUI();
}

// Used by grid.js when loading synced voxel terrain: cells are synced by
// block TITLE (see grid.js), since blockRegistry itself is per-client local
// state. A client that never locally registered a given title (e.g. a
// player who never opened the palette) gets one created on the fly here,
// so its texture still loads and renders correctly. Also used by
// getBlockMaterial() below (walls/doors/stairs), so a wall and a voxel
// block sharing the same title share the exact same registry entry and
// material -- optional fallbackColor lets a caller preserve a SPECIFIC
// saved color (e.g. a wall synced from Firebase) rather than always
// getting a random one when the title is new to this client.
export function getOrCreateBlockId(title, fallbackColor) {
  const existing = Object.entries(blockRegistry).find(([, b]) => b.title === title);
  if (existing) return parseInt(existing[0]);
  const id = nextBlockId++;
  const color = fallbackColor || getRandomColor();
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  textureLoader.load(
    `${TEXTURE_PATH}${title}.png`,
    (texture) => {
      texture.magFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture;
      material.needsUpdate = true;
    },
    undefined,
    () => {
      material.map = null;
      material.color.set(color);
      material.needsUpdate = true;
    }
  );
  blockRegistry[id] = { title, color, material };
  renderPaletteUI(); // no-op safely if there's no palette UI on this page
  return id;
}

// Shared texture/material resolver, used by geometry.js to texture
// walls/doors/stairs with a block's look by title. Reuses the SAME
// blockRegistry entry (and material instance) a voxel block of that title
// uses -- previously this kept its own separate cache, meaning a wall and
// a voxel block with the identical title triggered two independent texture
// loads of the same ./textures/{title}.png (see js/config.js's TEXTURE_PATH) instead of sharing one result.
// Safe to share the instance: geometry.js clones a material before
// mutating it (see the open-door dimming logic), and nothing disposes
// materials, only geometries (see clearGroup).
export function getBlockMaterial(title, fallbackColor) {
  const key = title || 'default';
  const id = getOrCreateBlockId(key, fallbackColor);
  return blockRegistry[id].material;
}
