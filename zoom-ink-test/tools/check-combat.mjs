// Grid only for combat, and the ruler: node tools/check-combat.mjs
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

const drag = async (page, from, to) => { await page.mouse.move(from.x, from.y); await page.mouse.down(); for (let k = 1; k <= 8; k++) await page.mouse.move(from.x + (to.x - from.x) * k / 8, from.y + (to.y - from.y) * k / 8); await page.mouse.up(); await page.waitForTimeout(150); };
const tokScreen = (page, id) => page.evaluate(id => { const a = window.__VTT, t = a.world.data.tokens.find(q => q.id === id), w = a.maps.tokenWorld(t); return a.project(w.x, w.y - 1.6, w.z); }, id);
console.log('combat');
{
  const { ctx, page, errors } = await open({ viewport: { width: 1366, height: 768 } });
  // an open field near the town: two tokens
  const P = await page.evaluate(() => { const a = window.__VTT, S = a.world.data.settlements.find(q => q.kind === 'town'); return { x: S.x + S.r + 120, z: S.z }; });
  await fly(page, P.x, P.z, 45, .001);
  await page.evaluate(() => window.__VTT.setTool('play'));
  ok(await page.evaluate(() => !window.__VTT.maps.grid.visible), 'no grid by default when zoomed in');
  for (const tool of ['look', 'play']) { await page.evaluate(t => window.__VTT.setTool(t), tool); const txt = await page.innerText('#opts'); ok(!/null|undefined/.test(txt), `the ${tool} bar shows no stray text (${txt.replace(/\s+/g, ' ').slice(0, 80)})`); }
  await page.evaluate(() => { const a = window.__VTT; a.tools.tokenForm.name = 'Ash'; a.tools.addToken(); a.tools.tokenForm.name = 'Bram'; a.tools.addToken(); });
  const ids = await page.evaluate(() => window.__VTT.world.data.tokens.slice(-2).map(t => t.id));
  // free movement
  const s0 = await tokScreen(page, ids[0]);
  await drag(page, s0, { x: s0.x + 37, y: s0.y + 23 });
  const t0 = await page.evaluate(id => window.__VTT.world.data.tokens.find(t => t.id === id), ids[0]);
  ok(!Number.isInteger(t0.sx) || !Number.isInteger(t0.sz), `outside combat a token moves freely (sx ${t0.sx}, sz ${t0.sz})`);
  // ruler
  await page.click('#opts .chip:has-text("Ruler")');
  const r = await page.evaluate(() => { const a = window.__VTT, R = a.ruler, t = a.controls.target; R.clear(); R.add({ x: t.x, z: t.z }); R.add({ x: t.x + 15, z: t.z }); const ten = R.text(); R.add({ x: t.x + 15, z: t.z + 3000 }); return { ten, long: R.text(), line: R.line.visible }; });
  ok(r.ten === '50 ft', `the ruler measures 10 squares as 50 ft (${r.ten})`);
  ok(/miles/.test(r.long) && r.line, `long distances read in miles (${r.long})`);
  // a tap with the ruler on adds a point (doesn't open a card or ping)
  const n0 = await page.evaluate(() => window.__VTT.ruler.pts.length);
  await page.mouse.click(400, 300); await page.waitForTimeout(150);
  ok(await page.evaluate(n => window.__VTT.ruler.pts.length === n + 1 && !window.__VTT.card.ref, n0), 'with the ruler on, a tap adds a point');
  await page.screenshot({ path: OUT + 'combat-ruler.png' });
  await page.click('#opts .chip:has-text("Ruler")');
  ok(await page.evaluate(() => !window.__VTT.ruler.line.visible), 'turning the ruler off clears it');
  // combat
  await page.click('#opts .chip:has-text("Roll initiative")'); await page.waitForTimeout(400);
  const c = await page.evaluate(ids => { const a = window.__VTT, ts = a.world.data.tokens.filter(t => ids.includes(t.id)); return { grid: a.maps.grid.visible, snapped: ts.every(t => Number.isInteger(t.sx) && Number.isInteger(t.sz)), order: a.world.data.combat.order.length, apart: ts[0].sx !== ts[1].sx || ts[0].sz !== ts[1].sz }; }, ids);
  ok(c.grid && c.snapped && c.order >= 2 && c.apart, `Roll initiative shows the grid and snaps tokens to separate squares (${JSON.stringify(c)})`);
  const cur0 = await page.evaluate(() => window.__VTT.combat.current()?.id);
  await page.click('#opts .chip:has-text("Next")');
  ok(await page.evaluate(() => window.__VTT.combat.current()?.id) !== cur0, 'Next passes the turn');
  await page.waitForTimeout(1600); await idle(page);
  const s1 = await tokScreen(page, ids[1]);
  await drag(page, s1, { x: s1.x + 41, y: s1.y + 7 });
  const t1 = await page.evaluate(id => window.__VTT.world.data.tokens.find(t => t.id === id), ids[1]);
  ok(Number.isInteger(t1.sx) && Number.isInteger(t1.sz), `in combat a dragged token snaps to a square (${t1.sx}, ${t1.sz})`);
  await page.screenshot({ path: OUT + 'combat-grid.png' });
  await page.click('#opts .chip:has-text("End combat")');
  ok(await page.evaluate(() => !window.__VTT.maps.grid.visible && !window.__VTT.combat.on), 'End combat hides the grid');
  // reload keeps the free positions
  await page.evaluate(() => window.__VTT.saveNow()); await page.reload(); await page.waitForFunction(() => window.__VTT && window.__VTT.card); await idle(page);
  ok(await page.evaluate(id => !!window.__VTT.world.data.tokens.find(t => t.id === id), ids[0]), 'tokens survive a reload');
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
console.log('combat, phone');
{
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  await page.evaluate(() => window.__VTT.setTool('look'));
  await page.tap('#opts .chip:has-text("Ruler")'); await page.tap('#view canvas', { position: { x: 150, y: 300 } }); await page.tap('#view canvas', { position: { x: 250, y: 360 } });
  ok(await page.evaluate(() => window.__VTT.ruler.pts.length === 2 && window.__VTT.ruler.line.visible), 'on a phone the ruler works by tapping');
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
await browser.close(); srv.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall combat checks passed');
process.exit(failed ? 1 : 0);
