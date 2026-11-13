import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Stub only the SDK boundary; run the actual helper and background reconciliation.
let serial = 0, dpi = 150, ready = true, maps = [], locals = [], writes = 0, menu;
const OBR = {
  contextMenu: { create: (m) => { menu = m; } },
  scene: {
    isReady: async () => ready, onReadyChange() {},
    grid: { getDpi: async () => dpi, onChange() {} },
    items: {
      getItems: async (filter) => maps.filter(filter), onChange() {},
      updateItems: async (ids, update) => update(maps.filter((i) => ids.includes(i.id))),
    },
    local: {
      getItems: async (filter) => locals.filter(filter),
      addItems: async (items) => { writes++; locals.push(...items); },
      updateItems: async (ids, update) => { writes++; update(locals.filter((i) => ids.includes(i.id))); },
      deleteItems: async (ids) => { writes++; locals = locals.filter((i) => !ids.includes(i.id)); },
    },
  },
};
function buildEffect() {
  const item = { id: `effect-${++serial}`, type: 'EFFECT' };
  const builder = new Proxy({}, { get: (_, key) => key === 'build' ? () => item : (value) => { item[key] = value; return builder; } });
  return builder;
}
const source = readFileSync(new URL('./water.js', import.meta.url), 'utf8');
const { WATER, PRESETS, buildWaterEffect } = new Function('OBR', 'buildEffect', source.replace(/^import .*\n/, '').replace(/export /g, '') + '\nreturn { WATER, PRESETS, buildWaterEffect };')(OBR, buildEffect);
const map = { id: 'map', type: 'IMAGE', layer: 'MAP', image: { width: 700, height: 350 }, grid: { dpi: 70, offset: { x: 35, y: 70 } }, position: { x: 100, y: 200 }, scale: { x: 2, y: -1 }, rotation: 90, visible: true, zIndex: 5, metadata: {} };
let effect = await buildWaterEffect(map);
assert.equal(effect.width, 1500);
assert.equal(effect.height, 750);
assert(Math.abs(effect.position.x - -50) < 1e-9);
assert(Math.abs(effect.position.y - 50) < 1e-9);
assert.deepEqual(effect.scale, map.scale);
assert.deepEqual(effect.uniforms.find((u) => u.name === 'tileSize').value, { x: 375, y: 750 });
assert.equal(effect.metadata[WATER].preset, 'sea');
assert.equal(effect.layer, 'MAP');
assert(effect.zIndex > map.zIndex && effect.disableHit && effect.locked);
assert(!effect.uniforms.some((u) => u.name === 'time'));
for (const preset of Object.keys(PRESETS)) {
  effect = await buildWaterEffect(map, preset);
  assert.equal(effect.metadata[WATER].preset, preset);
  assert.equal(effect.uniforms.find((u) => u.name === 'seconds').value, PRESETS[preset].dur);
}
assert.equal((await buildWaterEffect(map, 'toString')).metadata[WATER].preset, 'sea');

const html = readFileSync(new URL('./background.html', import.meta.url), 'utf8');
const code = html.slice(html.indexOf('  OBR.contextMenu.create({'), html.indexOf('  // dd2vtt maps'));
const { syncWater, settled } = new Function('OBR', 'WATER', 'buildWaterEffect', 'page', code + '\nreturn { syncWater, settled: () => waterRun };')(OBR, WATER, buildWaterEffect, (p) => p);
await settled();
maps = [structuredClone(map)];
await menu.onClick({ items: maps });
assert.deepEqual(maps[0].metadata[WATER], { preset: 'sea' });
await syncWater();
assert.equal(locals.length, 1);
const id = locals[0].id, initialWrites = writes;
await syncWater();
assert.equal(writes, initialWrites, 'unrelated scene changes do not rebuild water');
maps[0].metadata[WATER].preset = 'lava';
maps[0].position.x += 100;
await syncWater();
assert.equal(locals[0].id, id);
assert.equal(locals[0].metadata[WATER].preset, 'lava');
assert(Math.abs(locals[0].position.x - 50) < 1e-9);
locals = []; // Another client joining or local scene reset.
await syncWater();
assert.equal(locals.length, 1);
ready = false; await syncWater(); ready = true;
delete maps[0].metadata[WATER];
await syncWater();
assert.equal(locals.length, 0, 'removing metadata cleans up the local effect');
console.log('PASS water: presets, map transforms, grid density, shared metadata, local reconciliation and cleanup');
