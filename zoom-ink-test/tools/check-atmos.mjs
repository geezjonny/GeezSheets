// Time, night lights and local procedural ambience: node tools/check-atmos.mjs
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

import { chromium } from './browser.mjs';
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
await mkdir(OUT, { recursive: true });
const local = `${process.env.LOCALAPPDATA}/ms-playwright`;
const executablePath = process.env.CHROME || ['chromium-1248', 'chromium-1247'].map(v => `${local}/${v}/chrome-win64/chrome.exe`).find(existsSync);
const srv = await serve(0), URL0 = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ executablePath, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let failed = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failed++; };
const idle = page => page.evaluate(() => Promise.race([window.__VTT.idle(), new Promise(r => setTimeout(r, 20000))])).then(() => page.waitForTimeout(400));
const fly = async (page, x, z, d, t) => { await page.evaluate(([x, z, d, t]) => window.__VTT.flyTo(x, z, d, t), [x, z, d, t ?? null]); await page.waitForTimeout(1500); await idle(page); };
const screenOf = (page, x, z, up = 2) => page.evaluate(([x, z, up]) => { const a = window.__VTT; return a.project(x, a.world.height(x, z) + up, z); }, [x, z, up]);

const labelOf = (page, id) => page.evaluate(id => { const r = window.__VTT.ui.labelEls.get(id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
async function open(opts, fresh = true) {
  const ctx = await browser.newContext(opts), page = await ctx.newPage(), errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  if (fresh) await page.addInitScript(() => { if (!sessionStorage.getItem('x')) { localStorage.clear(); sessionStorage.setItem('x', 1); } });
  await page.goto(URL0); await page.waitForFunction(() => window.__VTT && window.__VTT.card); await idle(page);
  return { ctx, page, errors };
}
console.log('atmosphere');
try {
  const { ctx, page, errors } = await open({ viewport: { width: 1366, height: 768 } });
  const V = f => page.evaluate(f);
  ok(await V(() => !window.__VTT.ambience.context && !window.__VTT.ambience.timer), 'sound off by default: no context or timer');
  const rollover = await V(async () => {
    const { setTime, advance, timeOf, onTime } = await import('/clock.js'), a = window.__VTT;
    let calls = 0; const off = onTime(() => calls++);
    setTime(a, { day: 3, hour: 23 }); advance(a, 8); const forward = timeOf(a.world);
    advance(a, -9); const back = timeOf(a.world); off();
    return { forward, back, calls };
  });
  ok(rollover.forward.day === 4 && rollover.forward.hour === 7 && rollover.back.day === 3 && rollover.back.hour === 22 && rollover.calls === 3, 'clock rolls days forward and backward and notifies subscribers');
  const town = await V(() => { const s = window.__VTT.world.data.settlements.find(s => s.kind === 'town'); window.__VTT.weather.set('clear'); return s; });
  await fly(page, town.x, town.z, 120, .9);
  await page.click('#wxBtn');
  const looks = {};
  for (const [name, hour] of [['day', 12], ['dusk', 19], ['night', 22]]) {
    await page.click(`#wxPop [data-hour="${hour}"]`); await page.waitForTimeout(4800);
    looks[name] = await V(async () => {
      const a = window.__VTT, { MAT } = await import('/style.js'); let panes = 0;
      a.scene.traverse(o => { if (o.material === MAT.window || o.material === MAT.windowCut) panes += o.geometry.attributes.position.count; });
      return { sun: a.weather.sun.intensity, hemi: a.weather.hemi.intensity, exposure: a.renderer.toneMappingExposure, glow: MAT.windowCut.emissiveIntensity, panes, stars: a.weather.skyU.uStars.value, lights: a.scene.children.filter(o => o.isPointLight).length };
    });
    await page.click('#wxBtn');
    await page.screenshot({ path: OUT + `atmos-${name}.png` });
    await page.click('#wxBtn');
  }
  ok(looks.night.sun < looks.day.sun * .2 && looks.night.hemi < looks.day.hemi * .3 && looks.night.exposure < looks.day.exposure, 'night is darker than day (sun, ambient and exposure)');
  ok(looks.day.panes > 0 && looks.day.glow === 0 && looks.dusk.glow > 0 && looks.night.glow > looks.dusk.glow, 'town windows glow at dusk and night, with no emission at noon');
  ok(looks.night.stars > 0 && looks.day.stars === 0 && looks.night.lights === looks.day.lights && looks.night.lights <= 4, 'stars at night and a fixed small light pool');
  await V(() => window.__VTT.weather.set('storm')); await page.waitForTimeout(4800);
  ok(await V(() => window.__VTT.weather.sun.intensity < .1 && window.__VTT.weather.skyU.uStars.value === 0), 'stormy night stays dark and hides stars');
  await V(() => window.__VTT.weather.set('clear'));
  await page.click('#wxBtn'); await page.click('#soundBtn');
  await page.waitForFunction(() => window.__VTT.ambience.context?.state === 'running');
  ok(await V(() => window.__VTT.ambience.enabled && Object.keys(window.__VTT.ambience.layers).length === 6 && window.__VTT.ambience.levels.crickets > 0), 'speaker click starts the context and nighttime ambience');
  await page.locator('#soundPop input').fill('0.2');
  ok(await V(() => window.__VTT.ambience.volume === .2), 'volume slider changes the mix');
  await page.click('#soundBtn');
  await page.waitForFunction(() => window.__VTT.ambience.context.state === 'suspended');
  ok(await V(() => !window.__VTT.ambience.enabled && !window.__VTT.ambience.timer && window.__VTT.ambience.master.gain.value === 0), 'sound off silences and suspends audio, with no mix timer');
  await V(() => { const a = window.__VTT; a.weather.changeTime({ day: 7, hour: 21 }); a.saveNow(); });
  await page.reload(); await page.waitForFunction(() => window.__VTT?.card); await idle(page);
  ok(await V(() => window.__VTT.world.data.time.day === 7 && window.__VTT.world.data.time.hour === 21 && document.querySelector('#worldTime').textContent === 'Day 7, 21:00'), 'time survives save and reload');
  await V(() => window.__VTT.setRole('player'));
  const before = await V(() => JSON.stringify(window.__VTT.world.data.time));
  await V(() => { const w = window.__VTT.weather; w.changeTime({ hour: 12 }); w.renderPop(); });
  ok(await V(() => !document.querySelector('#wxPop [data-hour]')) && !await page.isVisible('#wxBtn') && before === await V(() => JSON.stringify(window.__VTT.world.data.time)) && await page.isVisible('#worldTime'), 'players see time but have no controls and cannot invoke GM time changes');
  await page.click('#soundBtn'); await page.waitForFunction(() => window.__VTT.ambience.context?.state === 'running');
  ok(await V(() => window.__VTT.ambience.enabled), 'players can enable sound');
  await page.click('#soundBtn');
  await page.setViewportSize({ width: 390, height: 844 });
  await V(() => { const a = window.__VTT; a.setRole('gm'); a.setQuality('low'); });
  ok(await V(() => { const e = document.querySelector('#soundBtn').getBoundingClientRect(), t = document.querySelector('#worldTime').getBoundingClientRect(); return e.right <= innerWidth && e.bottom < innerHeight && t.right <= innerWidth; }), 'phone speaker and time fit the viewport');
  await page.click('#soundBtn');
  ok(await page.isVisible('#soundPop input'), 'phone volume is reachable by tap');
  await page.click('#soundBtn');
  await page.click('#wxBtn'); await page.click('#wxPop [data-hour="22"]');
  await fly(page, town.x, town.z, 120, .9); await page.waitForTimeout(4800);
  const perf = await V(() => { const a = window.__VTT; return { ...a.stats(), lightCount: a.scene.children.filter(o => o.isPointLight).length }; });
  console.log(`  note phone viewport on desktop GPU: ${perf.fps} fps, ${perf.calls} calls, ${perf.lightCount} fixed point lights`);
  ok(perf.lightCount === looks.day.lights, 'quality changes preserve the light count');
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
} finally { await browser.close(); srv.close(); }
console.log(failed ? `\n${failed} check(s) failed` : '\nall atmosphere checks passed');
process.exitCode = failed ? 1 : 0;
