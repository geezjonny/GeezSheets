import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Stub only the SDK boundary; run the actual helper and background reconciliation.
let serial = 0, dpi = 150, ready = true, maps = [], locals = [], writes = 0, role = 'GM', opened;
const menus = new Map();
const OBR = {
  player: { getRole: async () => role },
  popover: { open: async (p) => { opened = p; } },
  contextMenu: { create: (m) => { menus.set(m.id, m); } },
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
const { WATER, PRESETS, waterSettings, updateWaterSettings, buildWaterEffect } = new Function('OBR', 'buildEffect', source.replace(/^import .*\n/, '').replace(/export /g, '') + '\nreturn { WATER, PRESETS, waterSettings, updateWaterSettings, buildWaterEffect };')(OBR, buildEffect);
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
const menu = menus.get(WATER), settingsMenu = menu;
for (const m of menus.values()) assert.deepEqual(m.icons[0].filter.roles, ['GM']);
assert(!menu.icons[0].filter.every.some((f) => Array.isArray(f.key)), 'Water entry shows on every map, with or without water');
await menu.onClick({ items: maps }, 'context-button');
assert.deepEqual(maps[0].metadata[WATER], { preset: 'sea' });
assert.equal(opened.url, 'water-panel.html?item=map', 'clicking Water also opens the settings');
await syncWater();
assert.equal(locals.length, 1);
const id = locals[0].id, initialWrites = writes;
await syncWater();
assert.equal(writes, initialWrites, 'unrelated scene changes do not rebuild water');
await settingsMenu.onClick({ items: maps }, 'context-button');
assert.equal(opened.url, 'water-panel.html?item=map');
assert.equal(opened.anchorElementId, 'context-button');
await updateWaterSettings('map', { preset: 'lava' });
maps[0].position.x += 100;
await syncWater();
assert.equal(locals.length, 1, 'settings change replaces the effect, never duplicates it');
assert.notEqual(locals[0].id, id, 'effect is rebuilt so OBR re-applies the shader uniforms');
assert.equal(locals[0].metadata[WATER].preset, 'lava');
const uniform = (name) => locals[0].uniforms.find((u) => u.name === name).value;
assert.equal(uniform('seconds'), PRESETS.lava.dur, 'preset change updates uniforms');
assert.equal(uniform('rip'), PRESETS.lava.rip);
assert.deepEqual(uniform('c0'), { x: 90 / 255, y: 21 / 255, z: 8 / 255 });
assert(Math.abs(locals[0].position.x - 50) < 1e-9);
maps[0].metadata.other = { untouched: true };
await updateWaterSettings('map', { speed: 2.25, direction: 135, c0: '#123456', c1: '#abcdef' });
const saved = { preset: 'lava', speed: 2.25, direction: 135, c0: '#123456', c1: '#abcdef' };
assert.deepEqual(maps[0].metadata[WATER], saved);
await syncWater();
assert.deepEqual(locals[0].metadata[WATER], { map: 'map', ...saved });
assert(Math.abs(uniform('flow').x + 2.25 / Math.sqrt(2)) < 1e-9);
assert(Math.abs(uniform('flow').y - 2.25 / Math.sqrt(2)) < 1e-9);
assert.deepEqual(uniform('c0'), { x: 18 / 255, y: 52 / 255, z: 86 / 255 });
assert.deepEqual(uniform('c1'), { x: 171 / 255, y: 205 / 255, z: 239 / 255 });
const customizedUniforms = structuredClone(locals[0].uniforms);
locals = []; // Another client joining or local scene reset.
await syncWater();
assert.equal(locals.length, 1);
assert.deepEqual(locals[0].uniforms, customizedUniforms, 'a joining player renders the saved settings');
role = 'PLAYER';
await assert.rejects(updateWaterSettings('map', { speed: 6 }), /Only the GM/);
await assert.rejects(updateWaterSettings('map', null), /Only the GM/);
opened = undefined;
await settingsMenu.onClick({ items: maps }, 'button');
assert.equal(opened, undefined);
await menu.onClick({ items: maps }, 'button');
assert.deepEqual(maps[0].metadata[WATER], saved);
role = 'GM';
await updateWaterSettings('map', { preset: 'river' });
assert.deepEqual(maps[0].metadata[WATER], waterSettings({ preset: 'river' }), 'preset selection resets overrides');
await syncWater();
assert.equal(uniform('rip'), PRESETS.river.rip);
assert.deepEqual(uniform('flow'), { x: PRESETS.river.speed, y: 0 });
assert.deepEqual(waterSettings({ preset: 'invalid', speed: -10, direction: -90, c0: 'bad' }), { preset: 'sea', speed: 0, direction: 270, c0: PRESETS.sea.c0, c1: PRESETS.sea.c1 });
assert.equal(waterSettings({ speed: Infinity }).speed, PRESETS.sea.speed);
assert.equal(waterSettings({ speed: 100 }).speed, 6);
ready = false; await syncWater(); ready = true;
await updateWaterSettings('map', null);
assert.equal(maps[0].metadata[WATER], undefined);
assert.deepEqual(maps[0].metadata.other, { untouched: true });
await syncWater();
assert.equal(locals.length, 0, 'Remove water deletes the local effect');
await updateWaterSettings('map', { speed: 3 });
assert.equal(maps[0].metadata[WATER], undefined, 'a stale panel cannot resurrect removed water');

// Run the panel's real event handlers with a small DOM/SDK boundary stub.
const elements = new Map();
function element() {
  return { children: [], attributes: {}, value: '', disabled: true, hidden: true,
    add(child) { this.children.push(child); }, append(child) { this.children.push(child); },
    setAttribute(key, value) { this.attributes[key] = value; },
  };
}
const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element };
let panelReady, roleChange, closed;
OBR.onReady = (callback) => { panelReady = callback(); };
OBR.player.onChange = (callback) => { roleChange = callback; };
OBR.popover.close = async (id) => { closed = id; };
maps[0].metadata[WATER] = saved;
const panel = readFileSync(new URL('./water-panel.html', import.meta.url), 'utf8');
const panelCode = panel.split('<script type="module">')[1].split('</script>')[0].replace(/^import .*\r?\n/gm, '');
const { settled: panelSettled } = new Function('OBR', 'WATER', 'PRESETS', 'waterSettings', 'updateWaterSettings', 'document', 'location', 'Option', panelCode + '\nreturn { settled: () => run };')(
  OBR, WATER, PRESETS, waterSettings, updateWaterSettings, document, { search: '?item=map' }, function(text, value) { this.text = text; this.value = value; });
await panelReady;
const el = (id) => document.getElementById(id);
assert.equal(el('settings').disabled, false);
assert.equal(el('settings').hidden, false);
assert.equal(el('preset').children.length, 6);
assert.equal(el('directions').children.length, 8);
assert.equal(el('c0').value, saved.c0, 'reopening loads saved colours');
assert.equal(el('speed').value, saved.speed);
assert.equal(el('directions').children[3].attributes['aria-pressed'], 'true');
el('speed').value = '4.5'; el('speed').oninput();
el('preset').value = 'swamp'; el('preset').onchange();
el('directions').children[6].onclick();
el('c1').value = '#112233'; el('c1').oninput();
await panelSettled();
assert.deepEqual(maps[0].metadata[WATER], { ...waterSettings({ preset: 'swamp' }), direction: 270, c1: '#112233' }, 'queued UI changes preserve their order');
role = 'PLAYER'; await roleChange();
assert.equal(el('settings').hidden, true);
assert.equal(el('settings').disabled, true);
role = 'GM'; await roleChange();
await syncWater();
el('remove').onclick(); await panelSettled(); await syncWater();
assert.equal(closed, WATER + '/panel');
assert.equal(maps[0].metadata[WATER], undefined);
assert.equal(locals.length, 0, 'the panel Remove water button deletes the effect');
console.log('PASS water: presets, transforms, settings uniforms/metadata, GM access, joining clients, panel controls and removal');
