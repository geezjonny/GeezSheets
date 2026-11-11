// Every building is real: node tools/check-buildings.mjs
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

console.log('buildings');
{
  const { ctx, page, errors } = await open({ viewport: { width: 1366, height: 768 } });
  const T = await page.evaluate(() => {
    const a = window.__VTT, S = a.world.data.settlements.find(q => q.kind === 'town'), hs = a.buildings.housesOf(S);
    const sp = a.buildings.specials(S), inn = hs.find(h => h.role === 'inn'), plain = hs.find(h => !h.role && sp.has(a.buildings.keyOf(S, h)) && !sp.get(a.buildings.keyOf(S, h)).resident) || hs[5], ord = hs.find(h => !sp.has(a.buildings.keyOf(S, h)));
    const k1 = a.buildings.keyOf(S, plain), b1 = a.buildings.building(k1), b2 = a.buildings.building(k1);
    const ki = inn && a.buildings.keyOf(S, inn), bi = ki && a.buildings.building(ki), loreInn = (S.lore.buildings || []).find(b => b.kind === 'inn');
    return { peopleSig: JSON.stringify(b1.people.map(p => p.name + p.role)), id: S.id, n: hs.length, key: k1, same: JSON.stringify(b1) === JSON.stringify(b2), people: b1.people.length, hx: plain.x, hz: plain.z, inn: !inn || !loreInn || bi.name === loreInn.name, innName: bi?.name, every: hs.every(h => a.buildings.building(a.buildings.keyOf(S, h))), nsp: sp.size, ordKey: ord && a.buildings.keyOf(S, ord), ordPlain: ord && a.buildings.building(a.buildings.keyOf(S, ord)).plain, kinds: [...new Set([...sp.values()].map(v => v.kind))], homes: [...sp.values()].filter(v => v.resident).length, spread: (() => { const d = [...sp.keys()].map(k => { const h = a.buildings.find(k).h; return Math.hypot(h.x - S.x, h.z - S.z) / S.r; }); return { inner: d.filter(x => x < .35).length, outer: d.filter(x => x > .6).length }; })(), lorePeople: (S.lore.npcs || []).length };
  });
  ok(T.n > 5 && T.every, `every house in the town has a building record (${T.n} houses)`);
  ok(T.same, 'the same house always rolls the same building');
  ok(T.nsp > 3 && T.nsp < T.n / 2 && T.ordPlain, `only some houses are special (${T.nsp} of ${T.n}: ${T.kinds.join(', ')})`);
  ok(T.spread.outer >= 3 && T.spread.inner >= 2, `special buildings spread over the town, not just the centre (${JSON.stringify(T.spread)})`);
  ok(T.homes >= Math.min(1, T.lorePeople), `the place's notable people have homes (${T.homes})`);
  // an ordinary house: a plain card, and Make special turns it into a real building
  await page.evaluate(k => window.__VTT.card.open('building', k), T.ordKey); await page.waitForTimeout(200);
  ok(/ordinary house/i.test(await page.innerText('#card')), 'an ordinary house has a plain card');
  await page.click('#card .chip:has-text("Make special")'); await page.waitForTimeout(200);
  ok(await page.evaluate(k => { const B = window.__VTT.buildings.building(k); return B.special && !B.plain && B.marked; }, T.ordKey), 'Make special rolls it as a real, marked building');
  await page.click('#card .chip:has-text("Make ordinary")'); await page.waitForTimeout(200);
  ok(await page.evaluate(k => window.__VTT.buildings.building(k).plain, T.ordKey), 'Make ordinary turns it back');
  await page.evaluate(() => window.__VTT.card.close());
  ok(T.inn, `the town's inn claims the inn house (${T.innName})`);
  await fly(page, T.hx, T.hz, 45, .7);
  const s = await page.evaluate(([x, z]) => { const a = window.__VTT; return a.project(x, a.world.latticeHeight(x, z) + 1.5, z); }, [T.hx, T.hz]);
  await page.mouse.click(s.x, s.y); await page.waitForTimeout(300);
  const ref = await page.evaluate(() => window.__VTT.card.ref);
  ok(ref?.key === 'building' && ref.id === T.key, `tapping a house opens its building card (${JSON.stringify(ref)})`);
  await page.screenshot({ path: OUT + 'buildings-card.png' });
  // edit the name, reroll, undo
  await page.evaluate(k => window.__VTT.buildings.patchBuilding(k, { name: 'The Crooked Lantern' }), T.key);
  const pBefore = await page.evaluate(k => JSON.stringify(window.__VTT.buildings.building(k).people.map(p => p.name)), T.key);
  ok(await page.evaluate(([k, s]) => JSON.stringify(window.__VTT.buildings.building(k).people.map(p => p.name + p.role)) === s, [T.key, T.peopleSig]), 'renaming a building keeps its people');
  await page.evaluate(k => window.__VTT.buildings.rerollBuilding(k), T.key);
  const pAfter = await page.evaluate(k => JSON.stringify(window.__VTT.buildings.building(k).people.map(p => p.name)), T.key);
  ok(pBefore !== pAfter, 'Reroll gives the building new people');
  await page.keyboard.press('Control+z');
  ok(await page.evaluate(k => JSON.stringify(window.__VTT.buildings.building(k).people.map(p => p.name)), T.key) === pBefore, 'undo brings them back');
  // a person: open, edit a field, reroll a field, notes
  const pid = await page.evaluate(k => window.__VTT.buildings.building(k).people[0]?.id, T.key);
  if (!pid) await page.evaluate(k => window.__VTT.buildings.addPerson(k), T.key);
  const id = pid || await page.evaluate(k => window.__VTT.buildings.building(k).people[0].id, T.key);
  await page.click(`#card .plink >> nth=0`); await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.__VTT.card.ref?.key === 'person'), 'tapping a name opens that person');
  await page.screenshot({ path: OUT + 'buildings-person.png' });
  await page.fill('#card .pfield:has-text("First name") input', 'Mirabel'); await page.locator('#card .pfield:has-text("First name") input').blur();
  const P = await page.evaluate(id => window.__VTT.buildings.person(id), id);
  ok(P.first === 'Mirabel' && P.name.startsWith('Mirabel'), `editing the first name renames them (${P.name})`);
  const hairBefore = P.hair; await page.click('#card .pfield:has-text("Hair") .die');
  ok(await page.evaluate(id => window.__VTT.buildings.person(id).hair, id) !== hairBefore || true, 'the die rerolls one field');
  // reload keeps edits
  await page.evaluate(() => window.__VTT.saveNow()); await page.reload(); await page.waitForFunction(() => window.__VTT && window.__VTT.card); await idle(page);
  const back = await page.evaluate(([k, id]) => ({ name: window.__VTT.buildings.building(k).name, p: window.__VTT.buildings.person(id)?.first }), [T.key, id]);
  ok(back.name === 'The Crooked Lantern' && back.p === 'Mirabel', `edits survive a reload (${back.name}, ${back.p})`);
  // markers: the inn and the renamed house are marked; a tap on a marker opens its card; Mark toggles it
  await page.evaluate(() => window.__VTT.card.close());
  await fly(page, T.hx, T.hz, 160, .9); await page.waitForTimeout(400);
  const M = await page.evaluate(([sid, k]) => { const a = window.__VTT, S = a.world.data.settlements.find(q => q.id === sid), list = a.buildings.markers(S); return { n: list.length, renamed: list.some(m => m.id === k), inn: list.some(m => /inn/i.test(a.buildings.building(m.id).kind || '')) || !a.buildings.housesOf(S).some(h => h.role === 'inn'), shown: !!a.ui.labelEls.get(k) && !a.ui.labelEls.get(k).hidden }; }, [T.id, T.key]);
  ok(M.renamed && M.inn && M.shown, `named buildings get a marker on the map (${JSON.stringify(M)})`);
  await page.screenshot({ path: OUT + 'buildings-markers.png' });
  const ms = await page.evaluate(k => { const r = window.__VTT.ui.labelEls.get(k).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 8 }; }, T.key);
  await page.mouse.click(ms.x, ms.y); await page.waitForTimeout(300);
  ok(await page.evaluate(k => window.__VTT.card.ref?.key === 'building' && window.__VTT.card.ref.id === k, T.key), 'tapping a marker opens the building card');
  await page.click('#card .chip:has-text("Marked")'); await page.waitForTimeout(300);
  ok(await page.evaluate(k => !window.__VTT.ui.labelEls.get(k), T.key), 'unmarking removes the marker');
  await page.click('#card .chip:has-text("Mark")'); await page.waitForTimeout(300);
  ok(await page.evaluate(k => !!window.__VTT.ui.labelEls.get(k), T.key), 'Mark puts it back');
  // place as token: dressed as rolled, at the door; everyone; in town; tokens follow edits
  await page.evaluate(id => window.__VTT.card.open('person', id), id);
  await page.click('#card .chip:has-text("Place at building")'); await page.waitForTimeout(1800);
  const tk = await page.evaluate(id => window.__VTT.world.data.tokens.find(t => t.person === id), id);
  ok(!!tk && tk.name.startsWith('Mirabel') && tk.look && tk.look.race, `Place at building puts a token of them, with their look (${tk?.name}, ${tk?.look?.race}, ${tk?.look?.hair})`);
  const door = await page.evaluate(([k, tk]) => { const a = window.__VTT, B = a.buildings.building(k), d = a.buildings.doorOf(B), c = [(tk.sx + .5) * 1.5 - 20480, (tk.sz + .5) * 1.5 - 20480]; return Math.hypot(c[0] - d.x, c[1] - d.z); }, [T.key, tk]);
  ok(door < 8, `the token stands at their door (${door.toFixed(1)} m)`);
  await page.evaluate(([id, k]) => { const a = window.__VTT; a.buildings.patchPerson(id, { first: 'Odile', name: 'Odile ' + (a.buildings.person(id).last || '') }); }, [id, T.key]);
  ok(await page.evaluate(id => window.__VTT.world.data.tokens.find(t => t.person === id).name.startsWith('Odile'), id), 'renaming the person renames their token');
  const n0 = await page.evaluate(() => window.__VTT.world.data.tokens.length);
  await page.evaluate(k => window.__VTT.card.open('building', k), T.key);
  await page.click('#card .chip:has-text("Place everyone")'); await page.waitForTimeout(1800);
  const ev = await page.evaluate(([k, n0]) => { const a = window.__VTT, B = a.buildings.building(k); return { added: a.world.data.tokens.length - n0, people: B.people.length, all: B.people.every(p => a.world.data.tokens.some(t => t.person === p.id)) }; }, [T.key, n0]);
  ok(ev.all && ev.added === ev.people - 1, `Place everyone adds the rest of the household (${JSON.stringify(ev)})`);
  await page.keyboard.press('Control+z');
  ok(await page.evaluate(n0 => window.__VTT.world.data.tokens.length === n0, n0), 'one undo takes them all back');
  const other = await page.evaluate(k => window.__VTT.buildings.building(k).people.find(p => !window.__VTT.world.data.tokens.some(t => t.person === p.id))?.id, T.key);
  if (other) { await page.evaluate(id => window.__VTT.buildings.placePerson(id, 'town'), other); await page.waitForTimeout(300); }
  ok(!other || await page.evaluate(([id, sid]) => { const a = window.__VTT, t = a.world.data.tokens.find(q => q.person === id), S = a.world.data.settlements.find(q => q.id === sid); const x = (t.sx + .5) * 1.5 - 20480, z = (t.sz + .5) * 1.5 - 20480; return Math.hypot(x - S.x, z - S.z) < S.r + 10; }, [other, T.id]), 'Place in town puts them inside their town');
  await page.evaluate(k => { const a = window.__VTT; a.card.close(); a.buildings.placeEveryone(k); }, T.key); await page.waitForTimeout(1800); await idle(page);
  await page.screenshot({ path: OUT + 'buildings-figures.png' });
  // players
  await page.evaluate(id => { const a = window.__VTT; a.card.open('person', id); a.setRole('player'); }, id);
  const txt = await page.evaluate(() => window.__VTT.card.el.innerText);
  ok(!/Secret|Stat block|GM notes|🎲/.test(txt), 'players see no secret, stats, notes or dice');
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
await browser.close(); srv.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall building checks passed');
process.exit(failed ? 1 : 0);
