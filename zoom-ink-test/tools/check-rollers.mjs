// Roller checks: node tools/check-rollers.mjs
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

console.log('rollers');
{
  const { ctx, page, errors } = await open({ viewport: { width: 1366, height: 768 } });
  const res = await page.evaluate(async () => {
    const R = await import('/rollers.js'), out = { bad: [], counts: {} }, w = window.__VTT.world;
    for (const r of R.ROLLERS) {
      let n = 0;
      for (let s = 1; s <= 40; s++) {
        const opts = {}; for (const [k, , v] of r.opts) if (Array.isArray(v) && s % 3 === 0) opts[k] = v[s % v.length]; else if (v === 'level') opts[k] = 1 + (s * 7) % 20;
        try {
          const a = r.fn(s * 1013, opts, w), b = r.fn(s * 1013, opts, w);
          if (!a.title || !a.sections?.length) out.bad.push(`${r.id} ${s}: empty`);
          if (JSON.stringify(a) !== JSON.stringify(b)) out.bad.push(`${r.id} ${s}: not repeatable`);
          if (JSON.stringify(a).includes('undefined') || /\{\w+\}/.test(JSON.stringify(a))) out.bad.push(`${r.id} ${s}: undefined or unfilled {x}: ${JSON.stringify(a).match(/.{40}(undefined|\{\w+\}).{20}/)?.[0]}`);
          n++;
        } catch (e) { out.bad.push(`${r.id} ${s}: ${e.message}`); }
      }
      out.counts[r.id] = n;
    }
    const p = R.makeNPC(5); out.npc = ['gender', 'first', 'race', 'age', 'demeanour', 'hair', 'clothing'].every(k => p[k]) && 'armour' in p && 'weapon' in p && 'backstory' in p && 'secret' in p;
    const town = R.makePlace(42, { kind: 'town' }); out.town = { b: town.buildingsRolled.length, p: town.buildingsRolled.reduce((a, b) => a + b.people.length, 0), inn: town.buildingsRolled.some(b => b.kind === 'inn') };
    const city = R.rollCity(7); out.city = city.place.buildingsRolled.length;
    const site = R.rollSite(9, { level: 8 }); out.site = ['Traps', 'Creatures', 'Treasure (main)'].every(t => site.sections.some(s => s.t === t && (s.list?.length)));
    const shop = R.rollShop(11); out.shop = !!shop.person && shop.sections.some(s => s.t === 'For sale' && s.list.length >= 4);
    // SRD stock: an armourer sells armour; a city stocks more and better than a hamlet; finds are rare, hidden from players
    const arm = R.makeBuilding(3, { kind: 'armory', size: 'city' }); out.armory = arm.stock.filter(s => / Armor|Mail|Shield|Breastplate/.test(s.n)).length;
    const nS = size => { let n = 0, m = 0; for (let s = 1; s <= 60; s++) { const B = R.makeBuilding(s, { kind: 'store', size }); n += B.stock.length; m += B.stock.filter(x => x.magic).length; } return [n, m]; };
    out.sizes = [nS('hamlet'), nS('city')];
    let bf = 0, pf = 0, gmOnly = true; for (let s = 1; s <= 2000; s++) { const B = R.makeBuilding(s, { size: 'town' }); if (B.find) { bf++; const sec = R.buildingSections(B).find(x => x.t === 'Rare find'); if (!sec?.gm || B.stock?.some(x => x.find && x.n.includes(B.find.n))) gmOnly = false; } if (R.makeNPC(s).find) pf++; }
    out.finds = { bf, pf, gmOnly };
    // homebrew items: rolled rules; a model's name and lore is kept in the world by the item's key
    const X = await import('/relics.js'), r0 = X.makeRelic(77, { rarity: 'legendary', kind: 'weapon' });
    window.__VTT.setRelicName(r0.key, { name: 'Test Blade of Mud', lore: 'Made for a test.' });
    const r1 = X.makeRelic(77, { rarity: 'legendary', kind: 'weapon' }), m1 = R.roll('relic', 77, { rarity: 'legendary', kind: 'weapon' });
    out.relic = { rolled: !!r0.power && r0.attune && /legendary/i.test(X.relicSub(r0)), named: r1.name === 'Test Blade of Mud' && m1.title === r1.name && m1.sections.some(x => x.t === 'Lore' && x.text === 'Made for a test.'), saved: window.__VTT.world.toJSON().relics?.[r0.key]?.name === 'Test Blade of Mud' };
    let rf = 0; for (let s = 1; s <= 3000 && !rf; s++) { const B = R.makeBuilding(s, { size: 'town' }); if (B.find?.relic) rf = /one-of-a-kind/.test(R.buildingSections(B).find(x => x.t === 'Rare find').text); } out.relic.find = !!rf;
    delete window.__VTT.world.data.relics[r0.key];
    let sp = 0; for (let s = 1; s <= 200; s++) if (R.makeLoot(s, { kind: 'boss', level: 9 }).special) sp++; out.special = sp;
    const q = [R.rollQuest(3, { scale: 'minor' }), R.rollQuest(3, { scale: 'major' })]; out.quest = q.every(x => x.sections[0].t === 'Rumour') && q[0].sub.startsWith('Minor') && q[1].sub.startsWith('Major');
    const kinds = new Set(); for (let s = 1; s <= 60; s++) kinds.add(R.rollStrange(s).sub); out.strange = kinds.size;
    return out;
  });
  ok(res.bad.length === 0, `every roller works for 40 seeds, repeatable, no blanks (${JSON.stringify(res.counts)})` + (res.bad.length ? '\n    ' + res.bad.slice(0, 6).join('\n    ') : ''));
  ok(res.npc, 'an NPC has gender, names, race, age, demeanour, hair, clothing, and armour/weapon/backstory/secret slots');
  ok(res.town.b >= 14 && res.town.p > res.town.b, `a town rolls buildings with people inside (${res.town.b} buildings, ${res.town.p} people)`);
  ok(res.city >= 40, `a city rolls 40+ buildings (${res.city})`);
  ok(res.site, 'a special site has creatures, traps and treasure');
  ok(res.shop, 'a shopkeeper is an NPC with stock');
  ok(res.armory >= 4, `an armourer sells armour (${res.armory} kinds)`);
  ok(res.sizes[1][0] > res.sizes[0][0] * 1.8 && res.sizes[1][1] > res.sizes[0][1], `a city store stocks more and more magic than a hamlet's (${JSON.stringify(res.sizes)})`);
  ok(res.finds.bf > 30 && res.finds.bf < 160 && res.finds.pf > 5 && res.finds.pf < 60 && res.finds.gmOnly, `rare finds turn up now and then, GM only, disguised on the shelf (${JSON.stringify(res.finds)} of 2000)`);
  ok(res.relic.rolled && res.relic.named && res.relic.saved && res.relic.find, `homebrew items roll rules, take a saved name and lore, and turn up as finds (${JSON.stringify(res.relic)})`);
  ok(res.special > 60 && res.special < 180, `boss loot sometimes has a special item (${res.special}/200)`);
  ok(res.quest, 'quests start with a rumour, minor and major');
  ok(res.strange === 6, `something strange covers all six kinds (${res.strange})`);

  // the drawer
  await page.click('#rollBtn');
  ok(await page.evaluate(() => !document.getElementById('roller').hidden), 'the 🎲 button opens the rollers');
  await page.click('#roller .rbtn:has-text("Place")');
  await page.click('#roller .chip.on:has-text("Roll")');
  const nb = await page.$$eval('#roller .rfold', l => l.length);
  ok(nb > 2, `a rolled place lists its buildings (${nb})`);
  await page.click('#roller .rfold >> nth=0 >> .rhead');
  const inner = await page.$$eval('#roller .rfold.on .rfold', l => l.length);
  ok(inner >= 1, `opening a building shows its people (${inner})`);
  await page.click('#roller .rfold.on .rfold >> nth=0 >> .rhead');
  ok(/Demeanour/.test(await page.$eval('#roller', e => e.innerText)), 'opening a person shows their NPC roll');
  await page.screenshot({ path: OUT + 'rollers-place.png' });
  const n0 = await page.evaluate(() => window.__VTT.world.data.settlements.length);
  await page.click('#roller .chip:has-text("Go to place")'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => window.__VTT.world.data.settlements.length) === n0, 'Go opens the already-created place without creating a duplicate');
  await page.click('#rollBtn'); await page.click('#roller .rbtn:has-text("Special site")'); await page.click('#roller .chip.on:has-text("Roll")');
  await page.screenshot({ path: OUT + 'rollers-site.png' });
  await page.evaluate(() => window.__VTT.setRole('player'));
  ok(await page.evaluate(() => document.getElementById('rollBtn').hidden && document.getElementById('roller').hidden), 'players do not get the rollers');
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
console.log('rollers, phone');
{
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  await page.tap('#rollBtn'); await page.tap('#roller .rbtn:has-text("NPC")'); await page.tap('#roller .chip.on:has-text("Roll")');
  const b = await page.$eval('#roller', e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top }; });
  ok(b.l >= 0 && b.r <= 391, `on a phone the rollers fit the screen (${b.l.toFixed(0)}..${b.r.toFixed(0)})`);
  await page.screenshot({ path: OUT + 'rollers-phone.png' });
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
await browser.close(); srv.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall roller checks passed');
process.exit(failed ? 1 : 0);
