// Roads and rivers through mountains, and lines on the ground as drawn: node tools/check-lines.mjs
// Carve / go over / tunnel choices, cave mouths, undo, and no line floating over coarse terrain.
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
console.log('lines');
{
  const { ctx, page, errors } = await open({ viewport: { width: 1366, height: 768 } });
  const V = f => page.evaluate(f);
  // a newly drawn road through mountains stays selected and offers how it gets through
  await V(() => { const a = window.__VTT; a.setTool('road'); a.tools.draft = { kind: 'road', pts: [[1363, -889], [1943, -1329], [2416, -1911]] }; a.tools.finishLine(); });
  const fresh = await V(() => { const a = window.__VTT; return { sel: a.tools.selLine, chips: [...document.querySelectorAll('[data-through]')].map(b => b.dataset.through), bar: document.querySelector('#bar')?.textContent || '' }; });
  ok(!!fresh.sel && fresh.chips.join() === 'carve,over,tunnel', 'a new road over mountains is selected with Cut a pass / Go over / Tunnel');
  ok(!/null/.test(fresh.bar), 'no stray text in the bar');
  await V(() => window.__VTT.tools.deleteSelected());
  // road0 crosses a range: carve vs over vs tunnel
  await V(() => { const a = window.__VTT; a.tools.selLine = 'road0'; a.lines.selected = 'road0'; a.lines.showSelected(); a.ui.refresh(); });
  const at = [1956, -1345], hAt = () => page.evaluate(([x, z]) => window.__VTT.world.height(x, z), at);
  const carved = await hAt();
  await page.click('[data-through="over"]'); await page.waitForTimeout(300);
  const over = await hAt();
  ok(over > carved + 300, `Go over leaves the peaks (${over.toFixed(0)} m vs a ${carved.toFixed(0)} m pass)`);
  await page.click('[data-through="tunnel"]'); await page.waitForTimeout(300);
  const T = await V(() => { const a = window.__VTT, l = a.world.data.roads.find(r => r.id === 'road0'), t = a.world.tunnel(l.pts); return { through: l.through, portals: a.lines.portals.children.length, runs: t.runs.length }; });
  ok(T.through === 'tunnel' && T.portals >= 2 && T.portals % 2 === 0 && T.runs >= 2, `Tunnel: ${T.portals} cave mouths, road open in ${T.runs} stretches`);
  ok(Math.abs(await hAt() - over) < 1, 'a tunnel leaves the mountain standing');
  const [px, pz] = await V(() => { const p = window.__VTT.lines.portalList[0]; return [p.x, p.z]; });
  await fly(page, px, pz, 90, 1.2); await page.screenshot({ path: OUT + 'lines-tunnel.png' });
  await page.click('[data-through="carve"]'); await page.waitForTimeout(300);
  ok(Math.abs(await hAt() - carved) < 1 && await V(() => !('through' in window.__VTT.world.data.roads.find(r => r.id === 'road0')) && window.__VTT.lines.portals.children.length === 0), 'Cut a pass carves it again, no cave mouths');
  await V(() => window.__VTT.tools.undo()); await page.waitForTimeout(300);
  ok(await V(() => window.__VTT.world.data.roads.find(r => r.id === 'road0').through === 'tunnel'), 'undo brings the tunnel back');
  // drawing near a line joins it
  const J = await V(() => {
    const a = window.__VTT, w = a.world, r0 = w.data.roads.find(r => r.id === 'road0'), end = r0.pts.at(-1), B = w.data.settlements.find(s => s.kind === 'town' || s.kind === 'village');
    a.setTool('road'); a.tools.selLine = null; a.lines.selected = null;
    const tapAt = (x, z) => a.tools.tap({ clientX: 0, clientY: 0 }, { x, z });
    tapAt(end[0] + 4, end[1] - 3); const selFirst = a.tools.selLine; tapAt(end[0] + 4, end[1] - 3); const p0 = a.tools.draft.pts[0], snap0 = a.tools.draft.snap;
    tapAt(end[0] + 300, end[1] + 260); const free = a.tools.draft.pts[1];
    tapAt(B.x + 5, B.z - 4); const p2 = a.tools.draft.pts[2];
    a.tools.escape();
    // the middle of a segment, from a fresh start beside road0
    const [ax, az] = r0.pts[2], [bx, bz] = r0.pts[3], mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
    tapAt(mx + nx * 6, mz + nz * 6); if (!a.tools.draft) tapAt(mx + nx * 6, mz + nz * 6); const pm = a.tools.draft.pts[0]; a.tools.escape();
    const dm = Math.abs((pm[0] - ax) * nz * -1 + (pm[1] - az) * nx) ;
    a.setTool('river'); tapAt(end[0] + 4, end[1] - 3); const rv = a.tools.draft.pts[0]; a.tools.escape();
    return { selFirst, end0: Math.hypot(p0[0] - end[0], p0[1] - end[1]), snap0, free: Math.hypot(free[0] - end[0] - 300, free[1] - end[1] - 260), town: Math.hypot(p2[0] - B.x, p2[1] - B.z), mid: Math.abs(-(pm[0] - ax) * (bz - az) / L + (pm[1] - az) * (bx - ax) / L), river: Math.hypot(rv[0] - end[0] - 4, rv[1] - end[1] + 3) };
  });
  ok(J.selFirst === 'road0', 'the first tap on a road selects it');
  ok(J.end0 < .1 && /end of a road/.test(J.snap0 || ''), `a road started near another's end joins it (${J.snap0})`);
  ok(J.free < .1, 'a point far from anything stays where it was tapped');
  ok(J.town < .1, "a road tapped near a town's middle goes to it");
  ok(J.mid < .1, 'a road started beside another joins it along its length');
  ok(J.river < .1, 'a river does not snap to a road');
  // lines sit on the ground as drawn, at any zoom (coarse terrain far away)
  for (const [x, z, d, t] of [[-4720, -4720, 5000, .9], [1956, -1345, 2600, .95]]) {
    await fly(page, x, z, d, t);
    const f = await V(async () => {
      const THREE = await import('three'), a = window.__VTT, ray = new THREE.Raycaster(), ground = a.terrain.group.children.filter(m => m.visible);
      let worst = 0;
      for (const kind of ['road', 'river']) {
        const g = a.lines.meshes[kind].geometry, P = g.attributes.position, H = g.attributes.aHc, yOff = kind === 'road' ? .12 : .5;
        for (let i = 0; i < P.count; i += 4) {
          const x = P.getX(i), z = P.getZ(i), c = a.terrain.chunks[Math.floor((z + 20480) / 2560) * 16 + Math.floor((x + 20480) / 2560)];
          if (!c?.visibleNow) continue;
          ray.set(new THREE.Vector3(x, 5000, z), new THREE.Vector3(0, -1, 0)); const hit = ray.intersectObjects(ground, false)[0]; if (!hit) continue;
          const y = c.shown < 4 ? [H.getX(i), H.getY(i), H.getZ(i), H.getW(i)][c.shown] : P.getY(i);
          worst = Math.max(worst, y - yOff - hit.point.y);
        }
      }
      return worst;
    });
    ok(f < 1, `lines follow the drawn ground at ${d} m (worst ${f.toFixed(1)} m above it)`);
  }
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
await browser.close(); srv.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall line checks passed');
process.exit(failed ? 1 : 0);
