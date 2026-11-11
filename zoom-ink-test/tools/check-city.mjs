import { existsSync } from 'node:fs';
import { serve } from './serve.mjs';
import { chromium } from './browser.mjs';
const local = `${process.env.LOCALAPPDATA}/ms-playwright`;
const executablePath = process.env.CHROME || ['chromium-1248', 'chromium-1247'].map(v => `${local}/${v}/chrome-win64/chrome.exe`).find(existsSync);
const server = await serve(0), browser = await chromium.launch({ executablePath, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__VTT?.ui);
  const result = await page.evaluate(async () => {
    const a = window.__VTT, { rollLore } = await import('/lore.js'), { encodeBytes } = await import('/world.js');
    const { streetsOf, housesOf, defencesOf } = await import('/towns.js');
    const d = a.world.toJSON();
    Object.assign(d, { terrain: encodeBytes(new Uint8Array(256 * 256).fill(3)), settlements: [], battlemaps: [], tokens: [], rivers: [], roads: [
      { id: 'ew', pts: [[-1200,-30],[0,0],[1200,70]] }, { id: 'ns', pts: [[-600,-1100],[0,0],[520,1000]] }, { id: 'chord', pts: [[-900,270],[900,270]] }
    ] });
    a.loadData(d);
    const results = [];
    for (const seed of [3817, 1, 42, 9001]) for (const [kind, r] of [['city',320], ['town',150]]) {
      const S = { id: 'audit', kind, name: 'Audit', x: 0, z: 0, r, seed, known: true };
      S.lore = rollLore(a.world, S, seed); S.lore.defense = 'wall';
      S.lore.buildings = ['inn','temple','smithy','mill'].map(kind => ({kind}));
      const st = streetsOf(a.world,S), houses = housesOf(a.world,S,st), D = defencesOf(a.world,S,st,houses);
      const inside = houses.filter(h => !h.suburb), outside = houses.filter(h => h.suburb);
      const edge = Math.max(...inside.flatMap(h => h.corners.map(([x,z]) => Math.hypot(x,z))));
      const coverage = inside.reduce((n,h) => n + h.L*h.D,0)/(Math.PI*edge*edge);
      const roles = new Set(inside.map(h => h.role));
      const heights = new Set(inside.map(h => h.opts.storeys));
      const good = coverage > (kind === 'city' ? .45 : .35) && Math.abs(D.radius-edge-8)<1e-6 && outside.length<=D.gates.length*2 && outside.every(h => Math.hypot(h.x,h.z)>D.radius && Math.hypot(h.x,h.z)<D.radius+36) && [2,3,4].every(n => heights.has(n)) && ['temple','guildhall','inn','smithy', ...(kind==='city'?['palace']:[])].every(role => roles.has(role)) && JSON.stringify(houses)===JSON.stringify(housesOf(a.world,S,streetsOf(a.world,S)));
      results.push({seed,kind,houses:inside.length,suburbs:outside.length,coverage:+coverage.toFixed(3),radius:+D.radius.toFixed(2),good});
    }
    return results;
  });
  console.log(JSON.stringify(result,null,2));
  if (result.some(r=>!r.good)) process.exitCode=1;
} finally { await browser.close(); server.close(); }

