// .dd2vtt maps as blueprints: node tools/check-blueprints.mjs
// A ship on the open sea (deck, hull, timber walls and doors that block and pass), a forest road laid on our road
// (3D trees and a boulder from the picture, no world trees inside, no picture drawn), and taking them out again.
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

console.log('blueprints');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL0); await page.waitForFunction(() => window.__VTT && window.__VTT.card); await idle(page);
  const r = await page.evaluate(async () => {
    const a = window.__VTT, B = a.blueprints, M = await import('/blueprints.js'), town = a.world.data.settlements.find(s => s.kind === 'town');
    // the ship
    const sj = await B.file('/battlemap/blackpearl1.dd2vtt'), spot = B.seaSpot(town.x, town.z, sj.resolution.map_size.x, sj.resolution.map_size.y);
    const ship = await B.add('/battlemap/blackpearl1.dd2vtt', { ...spot, ship: true, name: 'The Black Pearl' }), [W, H] = B.dims(ship);
    const E = M.edgesOf(sj, ship.rot), wall = E.find(e => !e.door && e.u > 2 && e.v > 2 && e.u < W - 2 && e.v < H - 2), door = E.find(e => e.door);
    const across = e => { const bx = ship.sx + e.u, bz = ship.sz + e.v; return e.axis === 'wallW' ? [[bx - 1, bz], [bx, bz]] : [[bx, bz - 1], [bx, bz]]; };
    const [wa, wb] = across(wall), [da, db] = across(door), tk = { sx: wa[0], sz: wa[1], level: 0 };
    const mid = [(ship.sx + W / 2) * 1.5 - 20480, (ship.sz + H / 2) * 1.5 - 20480];
    const shipR = { deck: a.maps.ground(...mid), sea: spot && a.world.height(spot.x, spot.z) < -6, hull: a.blueprints.meshes.has(ship.id) || (B.update(), B.meshes.has(ship.id)),
      wall: !a.tools.canMove(tk, wb[0], wb[1]), door: a.tools.canMove({ sx: da[0], sz: da[1], level: 0 }, db[0], db[1]), drawn: (a.detail.getSquare(0, ship.sx + wall.u, ship.sz + wall.v)[wall.axis] & 15) === 2 };
    // the forest road
    const fj = await B.file('/battlemap/forestroad.dd2vtt'), rs = B.roadSpot(fj.resolution.map_size.x, fj.resolution.map_size.y, 23.3);
    const fr = await B.add('/battlemap/forestroad.dd2vtt', { sx: rs.sx, sz: rs.sz, rot: rs.rot });
    const [FW, FH] = B.dims(fr), objs = {}; let wild = 0;
    for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) { const o = a.detail.getSquare(0, fr.sx + i, fr.sz + j).object; if (o) objs[o.k] = (objs[o.k] || 0) + 1; if (a.props.squareBlocked(0, fr.sx + i, fr.sz + j)) wild++; }
    const road = { fit: rs.fit, objs, wild, noPicture: !a.scene.children.some(c => c.material?.map && c.geometry?.attributes?.position?.count < 3000 && c.material.map.image?.width > 1000) };
    // out again
    B.remove(fr.id); B.remove(ship.id);
    let left = 0; for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) if (a.detail.getSquare(0, fr.sx + i, fr.sz + j).object) left++;
    return { shipR, road, removed: !left && !a.world.data.blueprints.length && !a.blueprints.floorAt(...mid) };
  });
  console.log('   ', JSON.stringify(r));
  ok(r.shipR.sea && r.shipR.deck > .9 && r.shipR.deck < 1.5, `a ship goes on open sea, tokens stand on its deck (${r.shipR.deck?.toFixed(2)} m)`);
  ok(r.shipR.hull && r.shipR.drawn, 'it has a hull and its walls are drawn in timber');
  ok(r.shipR.wall && r.shipR.door, 'its walls stop a token, its doors let one through');
  ok(r.road.fit.forest > .8 && r.road.fit.angleOff < 20, `the forest road goes on a straight stretch of our road through forest (${JSON.stringify(r.road.fit)})`);
  ok(r.road.objs.pine >= 30 && (r.road.objs.boulder || 0) >= 1, `its trees and boulder come from the picture, in 3D (${JSON.stringify(r.road.objs)})`);
  ok(r.road.wild === 0 && r.road.noPicture, `no world trees or rocks inside it, and no picture drawn (${r.road.wild} wild)`);
  ok(r.removed, 'taking both out leaves nothing behind');
  ok(errors.length === 0, 'no errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
await browser.close(); srv.close();
console.log(failed ? `${failed} blueprint check(s) failed` : 'all blueprint checks passed');
process.exit(failed ? 1 : 0);
