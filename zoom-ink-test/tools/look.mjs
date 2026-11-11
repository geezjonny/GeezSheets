// Screenshots from fixed views, to compare the look: node tools/look.mjs <tag> [weather]
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { chromium } from './browser.mjs';
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
const local = `${process.env.LOCALAPPDATA}/ms-playwright`;
const executablePath = process.env.CHROME || ['chromium-1248', 'chromium-1247'].map(v => `${local}/${v}/chrome-win64/chrome.exe`).find(existsSync);
const tag = process.argv[2] || 'now', weather = process.argv[3] || null;
const srv = await serve(0), b = await chromium.launch({ executablePath, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1366, height: 768 } }); p.on('pageerror', e => console.log('ERR', e.message));
await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { localStorage.clear(); sessionStorage.setItem('x', 1); } });
await p.goto(`http://127.0.0.1:${srv.address().port}/`); await p.waitForFunction(() => window.__VTT && window.__VTT.card);
const hide = () => p.evaluate(sel => { document.querySelectorAll(sel).forEach(e => e.style.visibility = 'hidden'); document.querySelectorAll('[id*=ompass], .navpad, .nav').forEach(e => (e.closest('div') || e).style.visibility = 'hidden'); }, process.env.LABELS ? '#bar, #opts, #top, #dock, .panel' : '#bar, #opts, #top, #labels, #dock, .panel');
await hide();
if (weather) await p.evaluate(w => window.__VTT.weather?.set(w), weather);
const S = await p.evaluate(() => { const s = window.__VTT.world.data.settlements.find(q => q.kind === 'town'); return { x: s.x, z: s.z, r: s.r }; });
const only = process.argv[4]; let views = [['world', S.x, S.z, 26000, .7], ['region', S.x, S.z, 1800, .95], ['plan', S.x, S.z, 520, .25], ['town', S.x, S.z, 220, 1.0], ['street', S.x, S.z, 34, .8], ['forest', S.x + S.r + 300, S.z + 200, 70, 1.05]];
if (only) views = views.filter(v => only.split(',').includes(v[0]));
for (const [name, x, z, d, t] of views) {
  await p.evaluate(([x, z, d, t]) => window.__VTT.flyTo(x, z, d, t), [x, z, d, t]); await p.waitForTimeout(1600);
  await p.evaluate(() => Promise.race([window.__VTT.idle(), new Promise(r => setTimeout(r, 20000))])); await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}look-${tag}-${name}.png` });
}
console.log('saved', views.map(v => `look-${tag}-${v[0]}.png`).join(' '));
await b.close(); srv.close();
