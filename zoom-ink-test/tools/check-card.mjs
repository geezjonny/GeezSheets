// Card and lore checks: node tools/check-card.mjs
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

console.log('card, desktop');
{
  const { ctx, page, errors } = await open({ viewport: { width: 1366, height: 768 } });
  const n = await page.evaluate(() => window.__VTT.world.data.settlements.map(s => !!(s.lore && s.lore.pop)));
  ok(n.length && n.every(Boolean), `every starter place has lore (${n.length})`);
  // an old save without lore gains it
  const gained = await page.evaluate(() => { const a = window.__VTT, d = a.world.toJSON(); d.settlements.forEach(s => delete s.lore); a.loadData(d); return a.world.data.settlements.every(s => s.lore && s.lore.npcs); });
  ok(gained, 'an old save without lore gains lore on load');
  const factions = await page.evaluate(() => (window.__VTT.world.data.factions || []).length);
  ok(factions > 0, `factions are shared through data.factions (${factions})`);

  // left-click the town
  const town = await page.evaluate(() => { const p = window.__VTT.world.data.settlements.find(q => q.kind === 'town'); return { x: p.x, z: p.z, id: p.id, name: p.name }; });
  await fly(page, town.x, town.z, 900, .75);
  let s = await labelOf(page, town.id);
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(200);
  let card = await page.evaluate(() => { const c = window.__VTT.card; return { ref: c.ref, hidden: c.el.hidden, text: c.el.innerText }; });
  ok(Math.abs(await page.evaluate(() => window.__VTT.camDist()) - 900) < 5, 'single click opens a card without flying');
  ok(!card.hidden && card.ref?.id === town.id, `left-click on the town opens its card (${card.ref?.id})`);
  ok(/WHO RULES/i.test(card.text) && /PEOPLE/i.test(card.text) && /Hooks/i.test(card.text), 'GM card shows rule, people and hooks');
  await page.screenshot({ path: OUT + 'card-gm.png' });

  // reroll a section changes it and is undoable
  const before = await page.evaluate(() => JSON.stringify(window.__VTT.card.item.lore.npcs));
  await page.click('#card .csec:has-text("People") .die');
  const after = await page.evaluate(() => JSON.stringify(window.__VTT.card.item.lore.npcs));
  ok(before !== after, 'the People die rerolls the people');
  await page.keyboard.press('Control+z');
  const undone = await page.evaluate(() => JSON.stringify(window.__VTT.world.data.settlements.find(q => q.kind === 'town').lore.npcs));
  ok(undone === before, 'undo brings the old people back');

  // notes
  await page.fill('#card textarea', 'The mayor is a doppelganger.'); await page.locator('#card textarea').blur();
  ok(await page.evaluate(() => window.__VTT.card.item.lore.notes) === 'The mayor is a doppelganger.', 'GM notes are saved on the place');

  // player sees no GM parts
  await page.evaluate(() => { const a = window.__VTT, S = a.card.item; a.tools.updatePin('settlements', S.id, { known: true }); a.setRole('player'); });
  card = await page.evaluate(() => window.__VTT.card.el.innerText);
  ok(!/Hooks|Secret:|Hidden power|GM notes|doppelganger|Treasure/i.test(card) && !(await page.$('#card .die')), 'player card hides hooks, secrets, hidden power, notes and dice');
  await page.screenshot({ path: OUT + 'card-player.png' });
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => window.__VTT.card.el.hidden), 'Esc closes the card');
  await page.evaluate(() => window.__VTT.setRole('gm'));

  // a token card on the battlemap
  const tk = await page.evaluate(() => { const a = window.__VTT, m = a.world.data.battlemaps.find(q => q.known) || a.world.data.battlemaps[0]; const sx=Math.floor((m.x+20480)/1.5),sz=Math.floor((m.z+20480)/1.5); a.world.data.tokens.push({ id: 'tk_test', name: 'Brother Aldo', color: a.world.data.tokens[0]?.color || '#c33', level:0,kind:'npc',sx,sz }); a.maps.refreshTokens(); return { mx: m.x, mz: m.z }; });
  await fly(page, tk.mx, tk.mz, 40, .6);
  const tp = await page.evaluate(() => { const a = window.__VTT, w = a.maps.tokenWorld(a.world.data.tokens.find(t => t.id === 'tk_test')); return a.project(w.x, w.y - 1.2, w.z); });
  await page.evaluate(() => window.__VTT.setTool('play'));
  await page.mouse.click(tp.x, tp.y);
  await page.waitForTimeout(200);
  card = await page.evaluate(() => ({ ref: window.__VTT.card.ref, text: window.__VTT.card.el.innerText }));
  ok(card.ref?.key === 'tokens' && card.ref.id === 'tk_test', `tap on a token opens its card (${JSON.stringify(card.ref)})`);
  await page.screenshot({ path: OUT + 'card-token.png' });

  await page.click('#card .cx');
  await page.mouse.move(tp.x, tp.y); await page.mouse.down(); await page.mouse.move(tp.x + 60, tp.y + 15, { steps: 10 }); await page.mouse.up();
  ok(await page.evaluate(() => !window.__VTT.card.ref), 'dragging a token does not open a card');
  await page.evaluate(() => window.__VTT.setTool('look'));
  await fly(page, town.x, town.z, 900, .75);
  s = await labelOf(page, town.id); await page.mouse.click(s.x, s.y);

  // Camera controls and one-shot ping through visible buttons.
  await page.click('#card .cx');
  const heading = () => page.evaluate(() => { const a = window.__VTT; return Math.atan2(a.camera.position.x - a.controls.target.x, a.camera.position.z - a.controls.target.z); });
  const h0 = await heading();
  const cp = await page.locator('#compass').boundingBox();
  await page.mouse.move(cp.x + 22, cp.y + 22); await page.mouse.down();
  await page.mouse.move(cp.x + 62, cp.y + 22, { steps: 8 }); await page.mouse.up();
  ok(Math.abs(await heading() - h0) > .1, 'dragging the compass turns the view');
  const d0 = await page.evaluate(() => window.__VTT.camDist());
  await page.click('#zoomIn'); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => window.__VTT.camDist()) < d0 * .8, '+ zooms toward the centre');
  await page.click('#pingBtn'); await page.mouse.click(100, 150);
  ok(await page.evaluate(() => window.__VTT.tools.pings.length > 0 && !window.__VTT.tools.pingArmed), 'Ping arms a one-shot ping on the next tap');
  await fly(page, town.x, town.z, 900, .75);
  s = await labelOf(page, town.id);
  await page.mouse.click(s.x, s.y, { button: 'right' });
  ok(await page.evaluate(id => window.__VTT.card.ref?.id === id, town.id), 'right-click remains a card shortcut');
  await page.click('#card .cx');
  for (const tool of ['towns', 'maps']) {
    await page.evaluate(t => window.__VTT.setTool(t), tool);
    const pin = await page.evaluate(t => { const a = window.__VTT; return a.world.data[t === 'towns' ? 'settlements' : 'battlemaps'][0]; }, tool);
    await fly(page, pin.x, pin.z, 900, .75);
    const pos = await labelOf(page, pin.id);
    await page.mouse.click(pos.x, pos.y);
    ok(await page.evaluate(id => window.__VTT.card.ref?.id === id && window.__VTT.tools.sel?.id === id, pin.id), `${tool}: tap selects and opens card`);
    await page.click('#card .cx');
    await page.mouse.move(pos.x, pos.y); await page.mouse.down(); await page.mouse.move(pos.x + 70, pos.y + 25, { steps: 10 }); await page.mouse.up();
    ok(await page.evaluate(() => !window.__VTT.card.ref), `${tool}: dragging a pin does not open a card`);
  }
  await page.evaluate(() => window.__VTT.setTool('look'));

  // the Towns tool rolls new places with lore
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__VTT.setTool('towns'));
  await fly(page, town.x + 2500, town.z + 2500, 3000, .001);
  const c = await screenOf(page, town.x + 2500, town.z + 2500, 0);
  const n0 = await page.evaluate(() => window.__VTT.world.data.settlements.length);
  await page.mouse.click(c.x, c.y); await page.waitForTimeout(300); await idle(page);
  const np = await page.evaluate(() => { const l = window.__VTT.world.data.settlements; return { n: l.length, p: l[l.length - 1], open: window.__VTT.card.ref?.id }; });
  ok(np.n === n0 + 1 && np.p.lore?.pop > 0 && np.open === np.p.id, `a new place is rolled with lore and its card opens (${np.p.name}, ${np.p.kind})`);
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

console.log('card, phone');
{
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const town = await page.evaluate(() => { const p = window.__VTT.world.data.settlements.find(q => q.kind === 'town'); return { x: p.x, z: p.z, id: p.id }; });
  await fly(page, town.x, town.z, 900, .75);
  const s = await labelOf(page, town.id);
  await page.touchscreen.tap(s.x, s.y);
  await page.waitForTimeout(450);
  const r = await page.evaluate(() => { const c = window.__VTT.card, b = c.el.getBoundingClientRect(); return { id: c.ref?.id, l: b.left, r: b.right, bt: b.bottom, h: b.height }; });
  ok(r.id === town.id, 'single tap on the town opens its card');
  ok(r.l >= 0 && r.r <= 391 && r.bt < 844 && r.h < 844 * .65, `on a phone the card is a bottom sheet (${r.l.toFixed(0)}..${r.r.toFixed(0)}, h ${r.h.toFixed(0)})`);
  const noOverlap = await page.evaluate(() => {
    const box = id => document.getElementById(id).getBoundingClientRect();
    const n = box('navigation'), c = box('card'), d = box('dock');
    return n.bottom <= c.top && n.bottom <= d.top && n.top >= 0 && c.bottom <= d.top;
  });
  ok(noOverlap, 'phone compass and zoom do not overlap the card or toolbar');
  await page.screenshot({ path: OUT + 'card-phone.png' });
  await page.touchscreen.tap(40, 160);
  ok(await page.evaluate(() => !window.__VTT.card.ref), 'tap on empty ground closes the card');
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: s.x, y: s.y, id: 1 }] });
  await page.waitForTimeout(650);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  ok(await page.evaluate(id => window.__VTT.card.ref?.id === id, town.id), 'long-press remains a card shortcut');
  await page.locator('#card .cx').tap();
  await fly(page, town.x, town.z, 6000, .75);
  const dbl = await labelOf(page, town.id);
  await page.touchscreen.tap(dbl.x, dbl.y); await page.waitForTimeout(70); await page.touchscreen.tap(dbl.x, dbl.y);
  await page.waitForTimeout(1500);
  ok(await page.evaluate(() => window.__VTT.camDist()) < 3000, 'double-tap on a place label flies in');

  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

await browser.close(); srv.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall card checks passed');
process.exit(failed ? 1 : 0);
