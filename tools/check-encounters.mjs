// Encounters from the land: node tools/check-encounters.mjs
// Rolls fit the terrain and budget, place as tokens with figures and stat blocks, players see no GM parts.
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
console.log('encounters');
{
  const { ctx, page, errors } = await open({ viewport: { width: 1366, height: 768 } });
  const V = (f, a) => page.evaluate(f, a);
  // many rolls in each land: everything rolled lives there, and fights stay near the budget
  const R = await V(async () => {
    const { rollEncounter } = await import('./encounters.js'), w = window.__VTT.world, out = {};
    for (const hab of ['forest', 'hills', 'mountains', 'snow', 'swamp', 'dry', 'coast', 'road', 'ruins', 'town', 'plains']) {
      const ids = new Set(); let over = 0, n = 0;
      for (let s = 1; s <= 60; s++) { const m = rollEncounter(s * 7919, { habitat: hab, level: 3, party: 4 }, w, {}); if (!m.encounter) continue; ids.add(m.encounter.id); n++; if (/Deadly/.test(m.sub)) over++; }
      out[hab] = { kinds: ids.size, n, over };
    }
    return out;
  });
  for (const [hab, r] of Object.entries(R)) ok(r.n === 60 && r.kinds >= 2 && r.over <= 6, `${hab}: ${r.kinds} kinds of encounter in 60 rolls, ${r.over} deadly`);
  const lv = await V(async () => { const { rollEncounter } = await import('./encounters.js'), w = window.__VTT.world; const ids = new Set(); for (let s = 1; s <= 80; s++) ids.add(rollEncounter(s, { habitat: 'mountains', level: 1 }, w, {}).encounter?.id); return [...ids]; });
  ok(!lv.includes('dragon') && !lv.includes('wyvern'), 'no dragons for a level 1 party');
  // the roller panel: roll where the camera looks, then place it
  const S = await V(() => { const w = window.__VTT.world; for (let x = -6000; x < 6000; x += 400) for (let z = -6000; z < 6000; z += 400) if (w.typeAt(x, z) === 4 && w.lineDist(x, z, 'road') > 200 && !w.settlementAt(x, z)) return [x, z]; });
  await fly(page, S[0], S[1], 60, 1.0);
  await page.click('#rollBtn'); await page.click('.rbtn:has-text("Encounter")'); await page.click('.crowbtn .chip.on:has-text("Roll")');
  const m = await V(() => ({ title: document.querySelector('#roller .rtitle')?.textContent, sub: document.querySelector('#roller .rres .csub')?.textContent }));
  ok(/forest/i.test(m.sub || ''), `rolled where the camera looks: "${m.title}" (${m.sub})`);
  const n0 = await V(() => window.__VTT.world.data.tokens.length);
  await page.click('#roller .chip:has-text("Place on map")'); await page.waitForTimeout(800); await idle(page);
  const T = await V(n0 => window.__VTT.world.data.tokens.slice(n0), n0);
  ok(T.length > 0 && T.every(t => t.mon && t.maxHp > 0), `${T.length} tokens placed with stat blocks and HP`);
  ok(await V(() => [...window.__VTT.maps.tokenMeshes.values()].some(m => m.children[0]?.material?.map)), 'tokens are picture coins');
  await page.screenshot({ path: OUT + 'encounter-placed.png' });
  // a token's card shows its stat block to the GM only
  await V(id => window.__VTT.card.open('tokens', id), T[0].id); await page.waitForTimeout(300);
  ok(await V(() => /Actions/.test(document.querySelector('#card')?.textContent || '')), 'the token card shows its stat block');
  await V(() => window.__VTT.setRole('player')); await V(id => window.__VTT.card.open('tokens', id), T[0].id); await page.waitForTimeout(300);
  ok(await V(() => !/Actions/.test(document.querySelector('#card')?.textContent || '')), 'players do not see the stat block');
  await V(() => window.__VTT.setRole('gm'));
  await V(() => window.__VTT.tools.undo());
  ok(await V(n0 => window.__VTT.world.data.tokens.length === n0, n0), 'undo takes the encounter off the map');
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
await browser.close(); srv.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall encounter checks passed');
process.exit(failed ? 1 : 0);
