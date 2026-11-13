// Acceptance checks (SPEC.md "Checks before calling it done").  node tools/check.mjs
// Uses Playwright from ../GeezTabletopWeb/node_modules; set CHROME=<path> to pick a browser binary.
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

import { chromium } from './browser.mjs';
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
await mkdir(OUT, { recursive: true });
const local = `${process.env.LOCALAPPDATA}/ms-playwright`;
const guess = ['chromium-1248', 'chromium-1247'].map(v => `${local}/${v}/chrome-win64/chrome.exe`).find(existsSync);
const executablePath = process.env.CHROME || guess;

const srv = await serve(0), URL0 = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ executablePath, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failed++; };

async function open(ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL0);
  await page.waitForFunction(() => window.__VTT && window.__VTT.ui);
  await idle(page);
  return { ctx, page, errors };
}
const idle = page => page.evaluate(() => Promise.race([window.__VTT.idle(), new Promise(r => setTimeout(r, 20000))])).then(() => page.waitForTimeout(400));
const stats = page => page.evaluate(() => window.__VTT.stats());
async function measure(page, label, n = 60) {
  // fps over a short continuous orbit, so every frame really renders
  const fps = await page.evaluate(n => new Promise(res => {
    const a = window.__VTT, t0 = performance.now(); let k = 0;
    const step = () => { a.controls.target.x += .001; a.request(); if (++k < n) requestAnimationFrame(step); else res(n * 1000 / (performance.now() - t0)); };
    requestAnimationFrame(step);
  }), n);
  const s = await stats(page);
  console.log(`  ${label.padEnd(22)} ${fps.toFixed(0).padStart(4)} fps  ${String(s.calls).padStart(4)} calls  ${(s.tris / 1000).toFixed(0).padStart(5)}k tris  props ${s.props}  canopy ${s.canopy}  towns ${s.towns}+${s.townsFar}  maps ${s.maps}  chunks ${s.chunks}`);
  return s;
}
const fly = async (page, x, z, d, tilt) => { await page.evaluate(([x, z, d, t]) => window.__VTT.flyTo(x, z, d, t), [x, z, d, tilt ?? null]); await page.waitForTimeout(1500); await idle(page); };
const typeSum = page => page.evaluate(() => { let s = 0; const t = window.__VTT.world.type; for (let k = 0; k < t.length; k++) s = (s * 31 + t[k] * (k % 97 + 1)) >>> 0; return s; });

// ---------------- desktop ----------------
console.log('desktop 1366x768');
{
  const { ctx, page, errors } = await open({ viewport: { width: 1366, height: 768 } });
  await page.evaluate(() => { window.__VTT.showGrid = true; });
  const town = await page.evaluate(() => { const p = window.__VTT.world.data.settlements.find(q => q.kind === 'town'); const m = window.__VTT.world.data.battlemaps.find(q => Math.hypot(q.x - p.x, q.z - p.z) < 60); return { x: p.x, z: p.z, id: p.id, map: m && m.id, mx: m ? m.x : p.x, mz: m ? m.z : p.z }; });

  let s = await measure(page, 'world');
  ok(s.props === 0 && s.towns + s.townsFar === 0 && s.maps === 0, `lazy: nothing small exists at world zoom (props ${s.props}, towns ${s.towns + s.townsFar}, maps ${s.maps})`);
  await page.screenshot({ path: OUT + 'desktop-world.png' });

  // paint a few strokes at region zoom, top-down
  await fly(page, town.x + 3000, town.z + 2000, 9000, .001);
  await page.evaluate(() => { window.__VTT.setTool('paint'); window.__VTT.tools.brush.type = 4; window.__VTT.tools.brush.size = 6; });
  const before = await typeSum(page);
  for (const [y0, y1] of [[300, 340], [420, 400]]) {
    await page.mouse.move(400, y0); await page.mouse.down(); for (let k = 1; k <= 12; k++) await page.mouse.move(400 + k * 40, y0 + (y1 - y0) * k / 12); await page.mouse.up();
  }
  await idle(page);
  const after = await typeSum(page);
  ok(before !== after, 'paint: strokes changed the terrain');
  const undoN = await page.evaluate(() => window.__VTT.tools.undoStack.length);
  ok(undoN === 2, `paint: two strokes on the undo stack (${undoN})`);
  await page.screenshot({ path: OUT + 'desktop-painted.png' });

  // a road
  const roads0 = await page.evaluate(() => window.__VTT.world.data.roads.length);
  await page.evaluate(() => window.__VTT.setTool('road'));
  for (const [x, y] of [[500, 500], [650, 470], [800, 520]]) { await page.mouse.click(x, y); await page.waitForTimeout(120); }
  await page.keyboard.press('Enter');
  ok(await page.evaluate(() => window.__VTT.world.data.roads.length) === roads0 + 1, 'roads: three taps + Enter make a road');

  // a settlement and a battlemap
  const n0 = await page.evaluate(() => [window.__VTT.world.data.settlements.length, window.__VTT.world.data.battlemaps.length]);
  await page.evaluate(() => window.__VTT.setTool('towns'));
  await page.mouse.click(700, 250); await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__VTT.world.data.settlements.length) === n0[0] + 1, 'towns: a tap founds a settlement');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__VTT.setTool('maps'));
  await page.mouse.click(900, 300); await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__VTT.world.data.battlemaps.length) === n0[1] + 1, 'maps: a tap drops a battlemap');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__VTT.tools.undo());
  await page.evaluate(() => window.__VTT.setTool('look'));

  // region / area / battlemap, with fps
  await fly(page, town.x, town.z, 6000, .7); s = await measure(page, 'region (6 km)'); await page.screenshot({ path: OUT + 'desktop-region.png' });
  await fly(page, town.x, town.z, 900, .8); s = await measure(page, 'area (900 m)'); await page.screenshot({ path: OUT + 'desktop-area.png' });
  await fly(page, town.mx, town.mz, 70, .85); s = await measure(page, 'battlemap (70 m)'); await page.screenshot({ path: OUT + 'desktop-battlemap.png' });
  const bm = await page.evaluate(() => ({ near: window.__VTT.towns.nearCount, has: [...window.__VTT.towns.loaded.keys()], active: window.__VTT.maps.active?.id, grid: window.__VTT.maps.grid.visible ? 1 : 0 }));
  ok(bm.near <= 1 && bm.has.includes(town.id), `lazy: at the battlemap only the town is built up close (near ${bm.near})`);
  ok(bm.active === town.map && bm.grid === 1, `global grid: the town bookmark is active (${bm.active}, ${bm.grid} grid)`);
  await page.evaluate(() => { window.__VTT.setTool('play'); window.__VTT.cutaway = true; window.__VTT.request(); });
  await page.waitForTimeout(400); await idle(page);
  ok(await page.evaluate(() => (window.__VTT.cutaway, document.querySelector('#opts')?.textContent || document.body.textContent).includes('Cutaway')), 'play: Cutaway is offered on a battlemap');
  await page.screenshot({ path: OUT + 'desktop-cutaway.png' });
  await page.evaluate(() => { window.__VTT.cutaway = false; window.__VTT.setTool('look'); });

  // fixed props: record a forest cell, zoom out, come back to the exact same camera, compare
  const cell = await page.evaluate(() => {
    const a = window.__VTT, w = a.world; const N = 256;
    for (let r = 0; r < 60; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const [ci, cj] = w.cellAt(a.controls.target.x, a.controls.target.z); const k = (cj + j) * N + ci + i;
      if (w.type[k] === 4) return { i: ci + i, j: cj + j, x: (ci + i + .5) * 160 - 20480, z: (cj + j + .5) * 160 - 20480 };
    }
    return null;
  });
  ok(!!cell, 'fixed props: found a forest cell');
  if (cell) {
    await fly(page, cell.x, cell.z, 250, .8);
    const cam = await page.evaluate(() => { const a = window.__VTT; return { p: a.camera.position.toArray(), t: a.controls.target.toArray() }; });
    const first = await page.evaluate(c => window.__VTT.props.drawnInCell(c.i, c.j, window.__VTT.camera), cell);
    await fly(page, cell.x, cell.z, 15000, .5);
    const far = await page.evaluate(c => window.__VTT.props.drawnInCell(c.i, c.j, window.__VTT.camera), cell);
    await page.evaluate(c => { const a = window.__VTT; a.camera.position.fromArray(c.p); a.controls.target.fromArray(c.t); a.controls.update(); a.request(); }, cam);
    await page.waitForTimeout(800); await idle(page);
    const again = await page.evaluate(c => window.__VTT.props.drawnInCell(c.i, c.j, window.__VTT.camera), cell);
    const key = p => p.join(',');
    const set = new Set(again.map(key));
    ok(first.length > 20, `fixed props: ${first.length} props drawn in the cell up close (${far.length} from far away)`);
    ok(first.every(p => set.has(key(p))), 'fixed props: every prop came back at the identical position');
  }

  // All code-built sites: use the same pin edit path as the Towns tool.
  for (const [index, kind] of ['tower', 'wizard', 'mine', 'cave', 'shrine'].entries()) {
    const site = await page.evaluate(({ kind, index, town }) => {
      const a = window.__VTT, x = town.x + 650 + index * 220, z = town.z + 650;
      const id = 'check_' + kind;
      a.tools.edit('settlements', list => list.push({ id, kind, name: 'Check ' + kind, x, z, r: 60, seed: 177 + index, known: true }),
        (before, after) => a.tools.pinsChanged('settlements', before, after));
      return { id, x, z };
    }, { kind, index, town });
    await fly(page, site.x, site.z, 90, kind === 'cave' ? .001 : .7);
    const unit = await page.evaluate(async id => {
      const a = window.__VTT, s = a.world.data.settlements.find(s => s.id === id);
      const { Builder, UNITS } = await import('./places.js');
      const b = new Builder(s.seed); UNITS[s.kind](b); const g = b.geometry();
      let tris = 0, finite = true;
      g.traverse(o => { if (!o.geometry) return; const p = o.geometry.attributes.position; tris += p.count / 3; finite &&= p.array.every(Number.isFinite); o.geometry.dispose(); });
      return { loaded: a.towns.loaded.get(id)?.level === 'near', tris, finite, flat: Math.abs(a.world.height(s.x + 20, s.z) - s.h) < .001 };
    }, site.id);
    ok(unit.loaded && unit.finite && unit.flat && unit.tris < 15000, `${kind}: loaded on level ground, finite geometry, ${unit.tris} triangles (<15k)`);
    await page.screenshot({ path: OUT + 'desktop-site-' + kind + '.png' });
  }

  // Cross a starter river segment at right angles, then verify rebuild and lazy disposal.
  const crossing = await page.evaluate(() => {
    const a = window.__VTT, river = a.world.data.rivers[0].pts, k = Math.floor((river.length - 1) / 2);
    const [ax, az] = river[k], [bx, bz] = river[k + 1], x = (ax + bx) / 2, z = (az + bz) / 2;
    const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
    a.tools.edit('roads', list => list.push({ id: 'check_bridge', pts: [[x - nx * 100, z - nz * 100], [x + nx * 100, z + nz * 100]] }),
      (before, after) => a.linesChanged(before, after));
    return { x, z };
  });
  await fly(page, crossing.x, crossing.z, 100, .7);
  const bridge = await page.evaluate(() => {
    const a = window.__VTT, c = a.bridges.crossings.find(c => c.id.startsWith('check_bridge/')), r = c && a.bridges.loaded.get(c.id);
    return { count: a.stats().bridges, width: r?.width, above: r && r.top > Math.max(0, a.world.latticeHeight(c.x, c.z) + .5) };
  });
  ok(bridge.count > 0 && bridge.width === 5 && bridge.above, `bridges: starter river crossing built above water, road-width deck (${bridge.count} loaded)`);
  await page.screenshot({ path: OUT + 'desktop-bridge.png' });
  const geometryChecks = await page.evaluate(async () => {
    const { Bridges, crossings, buildBridge } = await import('./bridges.js');
    const THREE = await import('three');
    const w = { data: { roads: [{ id: 'r', pts: [[0, -80], [0, 0], [0, 80]] }], rivers: [{ id: 'v', pts: [[-80, 0], [0, 0], [80, 0]] }] }, latticeHeight: () => 2 };
    const cs = crossings(w), scene = new THREE.Scene(), manager = new Bridges(w, scene);
    const camera = { position: new THREE.Vector3(0, 100, 0) };
    manager.update(camera); const loaded = manager.loaded.size;
    camera.position.set(2200, 2, 0); manager.update(camera); const retained = manager.loaded.size;
    camera.position.set(2501, 2, 0); manager.update(camera); const freed = manager.loaded.size;
    let finite = true, tris = 0;
    for (const timber of [false, true]) {
      const rec = buildBridge(w, { ...cs[0], timber });
      rec.group.traverse(o => { if (!o.geometry) return; const p = o.geometry.attributes.position; finite &&= p.array.every(Number.isFinite); tris = Math.max(tris, p.count / 3); o.geometry.dispose(); });
    }
    return cs.length === 1 && loaded === 1 && retained === 1 && freed === 0 && scene.children.length === 0 && finite && tris < 15000;
  });
  ok(geometryChecks, 'bridges: deduplicate shared vertices, retain through hysteresis, free meshes, both styles have finite modest geometry');
  const groundedBridge = await page.evaluate(async () => {
    const { crossings, buildBridge } = await import('./bridges.js');
    const THREE = await import('three');
    const { LINE_W } = await import('./world.js');
    // Unequal banks, a river bed and a strong cross-slope catch centre-only samples.
    const w = { data: { roads: [{ id: 'r', pts: [[0, -80], [0, 80]] }], rivers: [{ id: 'v', pts: [[-80, 0], [80, 0]] }] },
      latticeHeight: (x, z) => 20 + .8 * x + .1 * z - 3 * Math.max(0, 1 - Math.abs(z) / 8) };
    const c = crossings(w)[0], half = c.span / 2;
    let bounded = Math.abs(c.span - LINE_W.river - 7) < .001, ends = true, foundations = true;
    for (const timber of [false, true]) {
      const { group } = buildBridge(w, { ...c, timber });
      group.updateMatrixWorld(true);
      group.traverse(o => {
        if (!o.geometry) return;
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) bounded &&= Math.abs(p.getZ(i)) <= half + .001;
        for (const z of [-half, half]) for (const x of [-LINE_W.road / 2, LINE_W.road / 2]) {
          let error = Infinity;
          for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i) - x) < .001 && Math.abs(p.getZ(i) - z) < .001)
            error = Math.min(error, Math.abs(p.getY(i) - w.latticeHeight(x, z) - .12));
          ends &&= error < .001;
        }
      });
      // Look upward through the foundations: their lowest face must be buried.
      const points = timber ? [-1, 1].map(side => [side * (LINE_W.road / 2 - .3), 0])
        : [-1, 1].map(side => [0, side * (half - 1)]);
      for (const [x, z] of points) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, -100, z), new THREE.Vector3(0, 1, 0));
        const hits = ray.intersectObject(group, true);
        foundations &&= hits.length > 0 && hits[0].point.y < w.latticeHeight(x, z) - .5;
      }
      group.traverse(o => o.geometry?.dispose());
    }
    return { bounded, ends, foundations };
  });
  ok(groundedBridge.bounded && groundedBridge.ends && groundedBridge.foundations,
    `bridges: short bank overlap, deck ends meet sloping ground, foundations buried (${JSON.stringify(groundedBridge)})`);
  await fly(page, crossing.x, crossing.z, 52000, .25);
  ok((await stats(page)).bridges === 0, 'bridges: freed at world zoom');
  await fly(page, crossing.x, crossing.z, 100, .7);
  ok((await stats(page)).bridges > 0, 'bridges: rebuilt on return');
  await page.evaluate(() => {
    const a = window.__VTT;
    a.tools.edit('roads', list => list.splice(list.findIndex(r => r.id === 'check_bridge'), 1), (before, after) => a.linesChanged(before, after));
  });
  await idle(page);
  ok(await page.evaluate(() => !window.__VTT.bridges.crossings.some(c => c.id.startsWith('check_bridge/')) && ![...window.__VTT.bridges.loaded.keys()].some(id => id.startsWith('check_bridge/'))), 'bridges: removing a road removes its crossing and geometry');

  // reload: the painted world comes back from localStorage exactly
  const saved = await page.evaluate(() => { window.__VTT.saveNow(); return JSON.stringify(window.__VTT.world.toJSON()); });
  await page.reload(); await page.waitForFunction(() => window.__VTT && window.__VTT.ui); await idle(page);
  const back = await page.evaluate(() => JSON.stringify(window.__VTT.world.toJSON()));
  ok(saved === back, 'reload: the world comes back exactly');

  // player role
  await page.evaluate(() => window.__VTT.setRole('player'));
  await fly(page, 0, 0, 52000, .25);
  await page.waitForTimeout(300);
  const ui = await page.evaluate(() => ({ tools: [...document.querySelectorAll('#bar [data-tool]')].map(b => b.dataset.tool), labels: [...document.querySelectorAll('.label .name')].map(e => e.textContent), hidden: [...window.__VTT.world.data.settlements, ...window.__VTT.world.data.battlemaps].filter(p => !p.known).map(p => p.name) }));
  ok(!ui.tools.includes('paint') && ui.tools.join() === 'look,play', `player: only Look and Play offered (${ui.tools.join()})`);
  ok(ui.hidden.length > 0 && ui.hidden.every(n => !ui.labels.includes(n)), `player: unknown pins have no label (${ui.hidden.join(', ')})`);
  await page.screenshot({ path: OUT + 'desktop-player.png' });
  await page.evaluate(() => window.__VTT.setRole('gm'));
  ok(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}

// ---------------- lore-driven settlements ----------------
console.log('lore layouts and road gates');
{
  const { ctx, page, errors } = await open({ viewport: { width: 1366, height: 768 } });
  await page.evaluate(async () => {
    const a = window.__VTT, { rollLore } = await import('/lore.js'), { encodeBytes } = await import('/world.js');
    const d = a.world.toJSON();
    d.terrain = encodeBytes(new Uint8Array(256 * 256).fill(3));
    d.settlements = []; d.battlemaps = []; d.tokens = []; d.rivers = [];
    d.roads = [{ id: 'east-west', pts: [[-1200, -30], [0, 0], [1200, 70]] }, { id: 'angled', pts: [[-600, -1100], [0, 0], [520, 1000]] }, { id: 'chord', pts: [[-900, 270], [900, 270]] }];
    a.loadData(d); a.setQuality('high');
    window.loreFixture = (kind, r) => {
      const S = { id: 'lore-test', name: 'Lore ' + kind, x: 0, z: 0, r, seed: 3817, known: true, kind };
      S.lore = rollLore(a.world, S, S.seed); S.lore.defense = kind === 'city' ? 'wall' : kind === 'town' ? 'palisade' : 'none';
      S.lore.fields = kind === 'city' ? 34 : kind === 'town' ? 12 : kind === 'farm' ? 7 : 5;
      S.lore.wells = kind === 'city' ? 8 : kind === 'town' ? 3 : 1; S.lore.towers = kind === 'city' ? 14 : kind === 'town' ? 5 : 1;
      if (['city', 'town', 'village'].includes(kind)) S.lore.buildings = ['inn', 'temple', 'smithy', 'mill'].map(kind => ({ kind }));
      a.world.data.settlements = [S]; a.world.updateSettlements(); a.towns.freeAll(); a.props.invalidateAll(); a.lines.rebuild(); a.ui.refresh(); a.request();
      return S;
    };
  });
  for (const [kind, r] of [['city', 320], ['town', 150], ['village', 90], ['hamlet', 55], ['farm', 40], ['crossing', 60]]) {
    await page.evaluate(([kind, r]) => window.loreFixture(kind, r), [kind, r]);
    await fly(page, 0, 0, kind === 'city' ? 1050 : kind === 'town' ? 700 : 430, .7);
    const layout = await page.evaluate(async () => {
      const a = window.__VTT, S = a.world.data.settlements[0], t = a.towns.loaded.get(S.id), { streetsOf, buildSettlement, fieldsOf } = await import('/towns.js');
      const far = buildSettlement(a.world, S, 'far'); let nearTris = 0, farTris = 0;
      t.group.traverse(o => { if (o.geometry) nearTris += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; });
      let nearMeshes = 0, farMeshes = 0;
      t.group.traverse(o => { if (o.isMesh) nearMeshes++; });
      far.group.traverse(o => { if (o.geometry) { farMeshes++; farTris += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; o.geometry.dispose(); } });
      const inner = t.houses.filter(h => !h.suburb), edge = Math.max(...inner.flatMap(h => h.corners.map(([x,z]) => Math.hypot(x-S.x,z-S.z))));
      const coverage = inner.reduce((n,h) => n + h.L*h.D, 0) / (Math.PI*edge*edge);
      const suburbs = t.houses.filter(h => h.suburb);
      return { coverage, edge, wallRadius: t.defences.radius, suburbs: suburbs.length,
        suburbExtent: suburbs.every(h => h.corners.every(([x,z]) => Math.hypot(x-S.x,z-S.z) < t.defences.radius + 35)),
        storeys: [...new Set(inner.map(h => h.opts.storeys))], civic: inner.filter(h => ['temple','guildhall','palace'].includes(h.role)).map(h => h.role),
        houses: t.houses.length, fields: t.fields.length, wanted: S.lore.fields, gates: t.defences.gates.length, roles: t.houses.map(h => h.role), nearTris, farTris,
        wells: t.details.wells.length, wantedWells: S.lore.wells, mill: !!t.details.mill, signpost: !!t.details.signpost, detailsMatch: JSON.stringify(t.details) === JSON.stringify(far.details),
        nearMeshes, farMeshes, ring: streetsOf(a.world, S).some(st => st.ring), sameFields: JSON.stringify(t.fields) === JSON.stringify(far.fields),
        deterministic: JSON.stringify(t.houses) === JSON.stringify(far.houses) && JSON.stringify(fieldsOf(a.world, S)) === JSON.stringify(t.fields) };
    });
    console.log(`  ${kind}: ${layout.houses} houses, ${layout.fields}/${layout.wanted} fields, ${layout.gates} gates, geometry ${layout.nearTris} near / ${layout.farTris} far triangles`);
    ok(layout.houses > 0 && layout.fields === layout.wanted, `${kind}: populated and lore field count honoured`);
    ok(layout.sameFields && layout.deterministic && layout.farTris < layout.nearTris, `${kind}: deterministic footprints and lighter far LOD`);
    ok(layout.nearMeshes <= 3 && layout.farMeshes <= 3, `${kind}: at most three merged meshes per LOD`);
    ok(layout.wells === layout.wantedWells && layout.detailsMatch, `${kind}: lore wells and landmarks persist across LOD`);
    if (['city', 'town', 'village'].includes(kind)) ok(['inn', 'temple', 'smithy'].every(role => layout.roles.includes(role)) && layout.mill, `${kind}: inn, temple, smithy and windmill`);
    if (kind === 'city') ok(layout.ring, 'city: ring street exists');
    if (kind === 'city' || kind === 'town') {
      console.log(`  ${kind}: ${(layout.coverage * 100).toFixed(1)}% building coverage, wall ${layout.wallRadius.toFixed(2)}m / built edge ${layout.edge.toFixed(2)}m, ${layout.suburbs} suburb houses`);
      ok(layout.coverage > (kind === 'city' ? .45 : .35) && layout.houses > (kind === 'city' ? 1000 : 180), `${kind}: dense courtyard blocks fill the interior`);
      ok(Math.abs(layout.wallRadius - layout.edge - 8) < .001, `${kind}: wall follows actual built edge + 8m`);
      ok(layout.suburbs <= 12 && layout.suburbExtent, `${kind}: sparse gate suburbs stop within 35m of wall`);
      ok([2,3,4].every(n => layout.storeys.includes(n)) && layout.civic.includes('guildhall'), `${kind}: 2-4 storeys and central civic buildings`);
      if (kind === 'city') ok(layout.civic.includes('palace') && layout.civic.includes('temple'), 'city: palace and temple');
    }
    if (kind === 'farm') ok(layout.roles.includes('farmhouse') && layout.roles.includes('barn') && layout.houses === 2, 'farm: farmhouse and barn');
    if (kind === 'crossing') ok(layout.roles.includes('inn') && layout.signpost, 'crossing: inn and signpost at the junction');
    if (kind === 'city' || kind === 'town') {
      const gates = await page.evaluate(async () => {
        const a = window.__VTT, S = a.world.data.settlements[0], D = a.towns.loaded.get(S.id).defences, { streetsOf } = await import('/towns.js');
        const roads = [...a.world.data.roads, ...streetsOf(a.world, S).filter(s => !s.real)], expected = [];
        // Independent intersection via closest point on a line, then the two circle offsets.
        for (const road of roads) for (let i = 1; i < road.pts.length; i++) {
          const [x, z] = road.pts[i - 1], [bx, bz] = road.pts[i], dx = bx - x, dz = bz - z, len = Math.hypot(dx, dz); if (!len) continue;
          const along = -((x - S.x) * dx + (z - S.z) * dz) / len, px = x + dx / len * along, pz = z + dz / len * along;
          const q = D.radius ** 2 - (px - S.x) ** 2 - (pz - S.z) ** 2; if (q < 0) continue;
          for (const s of [along - Math.sqrt(q), along + Math.sqrt(q)]) if (s >= 0 && s <= len) expected.push([x + dx / len * s, z + dz / len * s]);
        }
        const dist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
        const clear = D.segments.every(s => roads.every(road => road.pts.slice(1).every((p, i) => dist(s.x, s.z, road.pts[i], p) > 2.5 + s.length / 2 + 3)));
        return { expected: expected.length, covered: expected.every(([x, z]) => D.gates.some(g => Math.hypot(g.x - x, g.z - z) < .01)), clear };
      });
      ok(gates.expected >= 4 && gates.covered && gates.clear, `${kind}: every road/street crossing has a gate; wall blocks clear the full road corridor (${gates.expected})`);
    }
    const s = await measure(page, kind + ' area');
    if (kind === 'city') ok(s.tris < 1500000, `maximum-radius city: area triangle budget (${s.tris})`);
    await page.screenshot({ path: OUT + `lore-${kind}.png` });
    await fly(page, 0, 0, kind === 'city' ? 230 : 150, .95);
    await page.screenshot({ path: OUT + `lore-${kind}-detail.png` });
    if (kind === 'city') { await fly(page, 0, 0, 70, .85); await measure(page, 'city battlemap'); }
  }
  // Force dense tree slots across fields and walls, before any town geometry is loaded.
  const clearing = await page.evaluate(async () => {
    const a = window.__VTT, { fieldsOf } = await import('/towns.js'), S = window.loreFixture('city', 320);
    a.world.type.fill(4); a.world.computeFields(0, 0, 255, 255); a.world.updateSettlements(); a.towns.freeAll(); a.props.invalidateAll();
    const fields = fieldsOf(a.world, S), [ci, cj] = a.world.cellAt(0, 0); let trees = 0, bad = 0, samples = 0;
    for (let j = cj - 4; j <= cj + 4; j++) for (let i = ci - 4; i <= ci + 4; i++) {
      const slots = a.props.buildCell(i, j);
      for (let k = 0; k < slots.n; k++) if ([0, 1, 5].includes(slots.kind[k])) {
        trees++; const x = slots.x[k], z = slots.z[k];
        const inPlot = fields.some(f => { const dx = x - f.x, dz = z - f.z, c = Math.cos(f.yaw), s = Math.sin(f.yaw); return Math.abs(dx * c - dz * s) < f.L / 2 && Math.abs(dx * s + dz * c) < f.D / 2; });
        if (Math.hypot(x - S.x, z - S.z) < S.r + 8 || inPlot) bad++;
      }
    }
    for (const f of fields) if (a.world.fieldFn(f.x, f.z)) samples++;
    return { trees, bad, samples, fields: fields.length, loaded: a.towns.loaded.size };
  });
  ok(clearing.trees > 100 && clearing.bad === 0 && clearing.samples > 0 && clearing.samples === clearing.fields && clearing.loaded === 0, `props: no trees inside fields or walls before town load (${clearing.trees} surrounding trees, ${clearing.fields} plots)`);
  const generated = await page.evaluate(async () => {
    const a = window.__VTT, { fieldsOf, streetsOf, defencesOf } = await import('/towns.js'), S = a.world.data.settlements[0];
    const before = a.world.data.roads; a.world.data.roads = []; a.linesChanged(before, []);
    const streets = streetsOf(a.world, S), D = defencesOf(a.world, S, streets);
    return { gates: D.gates.length, fields: fieldsOf(a.world, S).length, invalidated: a.props.cells.size === 0 };
  });
  ok(generated.gates === 4 && generated.fields === 34 && generated.invalidated, 'generated approaches get gates and fields; road removal invalidates surrounding prop cells');
  ok(errors.length === 0, `lore layouts: no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// ---------------- phone ----------------
console.log('phone 390x844, touch, DPR 3');
{
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const town = await page.evaluate(() => { const p = window.__VTT.world.data.settlements.find(q => q.kind === 'town'); return { x: p.x, z: p.z }; });
  ok(await page.evaluate(() => window.__VTT.quality.name) === 'low', 'phone: Auto quality picks Low on a touch screen');
  await measure(page, 'world');
  await page.screenshot({ path: OUT + 'phone-world.png' });

  // pinch zoom in
  await fly(page, town.x, town.z, 8000, .6);
  const d0 = await page.evaluate(() => window.__VTT.camDist());
  await touch('touchStart', [[170, 420]]); await touch('touchStart', [[170, 420], [220, 420]]);
  for (let k = 1; k <= 10; k++) { await touch('touchMove', [[170 - k * 10, 420], [220 + k * 10, 420]]); await page.waitForTimeout(16); }
  await touch('touchEnd', []); await page.waitForTimeout(600);
  const d1 = await page.evaluate(() => window.__VTT.camDist());
  ok(d1 < d0 * .8, `touch: pinch zooms in (${d0.toFixed(0)} -> ${d1.toFixed(0)} m)`);

  // one finger paints in Paint mode
  await page.evaluate(() => { window.__VTT.setTool('paint'); window.__VTT.tools.brush.type = 9; window.__VTT.tools.brush.size = 4; });
  const before = await typeSum(page);
  await touch('touchStart', [[100, 300]]);
  for (let k = 1; k <= 10; k++) { await touch('touchMove', [[100 + k * 18, 300 + k * 6]]); await page.waitForTimeout(16); }
  await touch('touchEnd', []); await idle(page);
  ok(before !== await typeSum(page), 'touch: one-finger drag in Paint paints');
  await page.screenshot({ path: OUT + 'phone-paint.png' });
  await page.evaluate(() => window.__VTT.setTool('look'));

  await fly(page, town.x, town.z, 900, .8); await measure(page, 'area (900 m)'); await page.screenshot({ path: OUT + 'phone-area.png' });
  await fly(page, town.x, town.z, 70, .85); await measure(page, 'battlemap (70 m)'); await page.screenshot({ path: OUT + 'phone-battlemap.png' });
  const fit = await page.evaluate(() => { const r = document.querySelector('#bar').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
  ok(fit, 'phone: the tool bar fits on screen');
  ok(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}

await browser.close(); srv.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
