// Weather and atmosphere: node tools/check-weather.mjs
// Every place has lore; tap / left-click opens a card in place; players don't see GM parts.
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
console.log('weather');
{
  const { ctx, page, errors } = await open({ viewport: { width: 1366, height: 768 } });
  ok(await page.evaluate(() => window.__VTT.renderer.toneMapping !== 0 && !!window.__VTT.weather.sky), 'tone mapping and a sky dome are on');
  ok(await page.isVisible('#wxBtn'), 'the GM has a weather button');
  await page.click('#wxBtn'); await page.click('#wxPop .chip[data-k="rain"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__VTT.world.data.weather === 'rain'), 'picking Rain sets the world weather');
  const S = await page.evaluate(() => { const s = window.__VTT.world.data.settlements.find(q => q.kind === 'town'); return [s.x, s.z]; });
  await fly(page, S[0], S[1], 120, .9); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => window.__VTT.weather.rain.visible && window.__VTT.scene.fog.far < 1800), 'close up it rains and the haze closes in');
  await page.screenshot({ path: OUT + 'weather-rain.png' });
  await fly(page, S[0], S[1], 20000, .7);
  ok(await page.evaluate(() => !window.__VTT.weather.rain.visible), 'zoomed out, no rain particles');
  for (const w of ['storm', 'snow', 'fog', 'overcast', 'clear']) await page.evaluate(w => window.__VTT.weather.set(w), w);
  await page.evaluate(() => window.__VTT.weather.set('snow')); await fly(page, S[0], S[1], 120, .9); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => window.__VTT.weather.snow.visible), 'snow falls close up');
  await page.evaluate(() => window.__VTT.saveNow()); await page.reload(); await page.waitForFunction(() => window.__VTT && window.__VTT.card);
  ok(await page.evaluate(() => window.__VTT.world.data.weather === 'snow'), 'the weather survives a reload');
  // regions: Auto takes the weather from the land; fronts are circles of weather on top
  await page.evaluate(() => window.__VTT.weather.set('auto'));
  await fly(page, S[0], S[1], 120, .9); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => window.__VTT.weather.kind === 'clear'), 'Auto: clear over the farmland around the town');
  const snowAt = await page.evaluate(() => { const a = window.__VTT, w = a.world; for (let z = -18000; z < 18000; z += 320) for (let x = -18000; x < 18000; x += 320) { let n = 0; for (const [dx, dz] of [[0, 0], [300, 0], [-300, 0], [0, 300], [0, -300]]) if (w.typeAt(x + dx, z + dz) === 7) n++; if (n === 5) return [x, z]; } return null; });
  if (snowAt) { await fly(page, snowAt[0], snowAt[1], 200, .9); await page.waitForTimeout(3000); }
  ok(!snowAt || await page.evaluate(() => window.__VTT.weather.kind === 'snow'), `Auto: it snows on the snowfields (${snowAt})`);
  await fly(page, S[0], S[1], 1200, .8);
  await page.click('#wxBtn'); await page.click('#wxPop .chip[data-front="storm"]');
  const vp = page.viewportSize(); await page.mouse.click(vp.width / 2, vp.height / 2); await page.waitForTimeout(300);
  const F = await page.evaluate(() => window.__VTT.weather.fronts.at(-1));
  ok(F && F.kind === 'storm' && F.r >= 250, `tapping the map after picking Storm places a storm front (${JSON.stringify(F)})`);
  await fly(page, F.x, F.z, 150, .9); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => window.__VTT.weather.kind === 'storm' && window.__VTT.weather.rain.visible), 'inside the front it storms');
  await page.screenshot({ path: OUT + 'weather-front-in.png' });
  await fly(page, F.x + F.r * 4, F.z, 150, .9); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => window.__VTT.weather.kind !== 'storm'), 'outside the front it does not');
  await fly(page, F.x, F.z, 9000, .8); await page.waitForTimeout(800);
  ok(await page.evaluate(() => window.__VTT.weather.clouds.visible && window.__VTT.weather.clouds.children.length === 1), 'from afar the front shows as a cloud bank');
  await page.screenshot({ path: OUT + 'weather-front-far.png' });
  const lab = await page.evaluate(id => { const e = window.__VTT.ui.labelEls.get(id); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 8 }; }, F.id);
  await page.click('#wxBtn'); // close the panel
  if (lab) { await page.mouse.click(lab.x, lab.y); await page.waitForTimeout(300); }
  ok(lab && await page.evaluate(id => !document.getElementById('wxPop').hidden && window.__VTT.weather.sel === id, F.id), 'tapping the front label opens it in the weather panel');
  await page.click(`#wxPop .wxfront[data-id="${F.id}"] .chip:has-text("✕")`);
  ok(await page.evaluate(() => window.__VTT.weather.fronts.length === 0), 'removing the front');
  await page.evaluate(() => window.__VTT.tools.undo()); await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.__VTT.weather.fronts.length === 1), 'undo brings it back');
  await page.evaluate(() => window.__VTT.setRole('player'));
  ok(!(await page.isVisible('#wxBtn')), 'players have no weather button');
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
await browser.close(); srv.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall weather checks passed');
process.exit(failed ? 1 : 0);
