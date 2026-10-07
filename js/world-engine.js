// Rolled World — part of the GeezSheets world sim (world.html). Built file: edit the sources, not this.
/* ================= ROLLED WORLD ENGINE v3 =================
   Reads a definitions registry (Defs.compile). Never refers to a particular creature, good or job by name.
   People act on needs. Towns hold council around a ledger of what their people have seen and heard.
   Packs remember where they ate. Knowledge travels in heads: reported, withheld, exaggerated, gossiped. */
const Sim = (() => {
  let W = null, D = null;
  const IDX = new Map();
  const rnd = Math.random, ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick = a => a[Math.floor(rnd() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wpick = (rows, key = 'w') => { const tot = rows.reduce((s, r) => s + (+r[key] || 0), 0); if (tot <= 0) return rows[0]; let x = rnd() * tot; for (const r of rows) { x -= (+r[key] || 0); if (x <= 0) return r; } return rows[rows.length - 1]; };
  const title = s => String(s ?? '').replace(/\b[a-z]/g, c => c.toUpperCase());
  const art = w => /^[aeiou]/i.test(w) ? 'an' : 'a';
  const TW = 1000, TH = 640, SEASONS = ['spring', 'summer', 'autumn', 'winter'], SEASON_LEN = 10;
  const season = () => SEASONS[Math.floor((W.day - 1) / SEASON_LEN) % 4];
  const year = () => 1 + Math.floor((W.day - 1) / (SEASON_LEN * 4));
  const FARM_SEASON = { spring: 0.9, summer: 1.1, autumn: 1.5, winter: 0.5 };
  const BREED = { spring: 1.5, summer: 1.1, autumn: 0.7, winter: 0.2 };
  const STAT = { str: 0, dex: 1, con: 2, int: 3, wis: 4, cha: 5 };

  /* ---------------- lookups over definitions ---------------- */
  const prof = n => D.professions[n.job] || D.professions[D.laborer];
  const def = p => D.sources[p.def] || { name: p.def, kind: 'monster', power: 3, eats: [], area: [], tags: [], season: [], hostile: true, cap: 20, per: 0.1, start: [2, 4] };
  const good = g => D.goods[g] || { name: g, price: 2, food: 0, spoils: 0, tags: [] };
  const isFoodGood = g => good(g).food > 0;
  const hasTag = (g, t) => good(g).tags.includes(t);
  const matches = (d, tokens) => tokens.some(t => d.name === t || d.kind === t || d.tags.includes(t));
  const inSeason = d => !d.season.length || d.season.includes(season());
  const isHostile = p => { const d = def(p); return (d.hostile || p.tags.includes('hostile')) && !p.tags.includes('tame'); };
  const solo = p => def(p).solo;
  // what kind of threat a hostile thing is, for colour and the legend: a pack can say "threat:", otherwise it is read from what it does
  const THREATS = ['beast', 'raider', 'undead', 'dark', 'great'];
  function threatKind(p) {
    const d = def(p);
    if (THREATS.includes(d.threat)) return d.threat;
    if (p.tags.includes('dark') || d.dark || d.summoned) return 'dark';
    if (d.rises || d.spreads) return 'undead';
    if (d.raids || d.recruits) return 'raider';
    if (d.solo) return 'great';
    return 'beast';
  }
  const zoneById = id => W.zones.find(z => z.id === id);
  const townById = id => W.towns.find(t => t.id === id);
  const zoneOf = p => zoneById(p.zone);
  const popById = id => W.pops.find(p => p.id === id);
  const fightsJob = n => prof(n).fights;
  const isFoodMaker = n => { const j = prof(n); if (j._food == null) j._food = j.makes.some(m => isFoodGood(m.g)) || (j.kind === 'gatherer' && Object.values(D.sources).some(s => matches(s, j.gathers) && s.food > 0)); return j._food; };

  /* ---------------- people ---------------- */
  function rollNPC(forceJob) {
    const race = wpick(Object.values(D.races));
    const nb = D.names[race.names] || D.names[Object.keys(D.names)[0]] || { first: ['Nameless'], last: [''] };
    const stats = race.stats.map(b => { const d = [ri(1, 6), ri(1, 6), ri(1, 6), ri(1, 6)].sort((a, c) => a - c); return d[1] + d[2] + d[3] + b; });
    const job = forceJob || wpick(Object.values(D.professions).filter(p => p.w > 0)).name;
    const amb = wpick(D.lists.ambitions).v;
    const needs = {}; for (const k of Object.keys(D.needs)) needs[k] = ri(1, 5) * 10;
    const n = { id: W.nextId++, first: pick(nb.first.length ? nb.first : ['Nameless']), last: pick(nb.last.length ? nb.last : ['']), race: race.name, age: ri(race.life[0], race.life[1]), job, stats,
      personality: wpick(D.lists.personality).v, want: wpick(D.lists.wants).v, fear: wpick(D.lists.fears).v, quirk: wpick(D.lists.quirks).v,
      ambition: /^(none|nothing)/i.test(amb) ? null : amb, needs, coin: ri(5, 25), inv: {}, progress: 0, home: null, action: 'idle', where: 0, doing: '', why: '', scores: [],
      starve: 0, rough: 0, unpaid: 0, secret: 0, earned: 0, earnedY: 0, sick: 0, injured: 0, xp: 0, wins: 0, grief: null, history: [], born: W.day, town: null,
      know: [], hidden: {}, seen: {}, gz: null, life: [], scars: [], kin: { spouse: null, kids: [], parents: [] }, grudges: {}, desire: null, arc: null, child: false, infected: null };
    IDX.set(n.id, n);
    return n;
  }
  const nm = n => `${n.first} ${n.last}`.trim();
  const P = s => String(s).toLowerCase();
  const pers = (n, ...list) => list.includes(P(n.personality));
  function hist(n, text) { n.history.unshift(`D${W.day} ${String(W.hour).padStart(2, '0')}:00 ${text}`); if (n.history.length > 12) n.history.length = 12; }
  /* ---------------- life stories: what happens to people, and what it leaves behind ---------------- */
  const aboutPop = p => { if (!p) return null; const n = popName(p, true); return { k: 'pop:' + p.id, def: p.def, name: /^the |'s /.test(n) ? n : `the ${n} of ${zoneOf(p)?.name || 'the wilds'}` }; };
  const aboutTown = S => ({ k: 'town:' + S.id, name: `the council of ${S.name}` });
  // several campaigns can share one world: each lives in its own region, with its own party
  const campOf = r => (W.campaigns || []).find(c => c.region === r) || null;
  const partyOf = r => campOf(r)?.party || W.party || 'the heroes';
  const aboutHeroes = r => { const c = campOf(r); return { k: 'heroes' + (c ? ':' + c.id : ''), name: partyOf(r) }; };
  const isHeroes = k => k === 'heroes' || String(k).startsWith('heroes:');
  const fill = (t, o = {}) => String(t || '').replace(/\{about\}/g, o.ab?.name || 'whoever did it').replace(/\{who\}/g, o.who || 'the one they lost');
  function scarsOf(n) { return (n.scars || []).filter(x => { const sc = D.scars[x.name]; return sc && (!sc.lasts || W.day - x.day < sc.lasts); }); }
  function scar(n, key) { let t = 0; for (const x of scarsOf(n)) t += +D.scars[x.name][key] || 0; return t; }
  function mark(n, tag, text, o = {}) {
    if (!n || n.dead || !W) return;
    n.life ||= []; n.scars ||= []; n.grudges ||= {};
    n.life.unshift({ d: W.day, t: tag, text, ab: o.ab || null, who: o.who || null });
    if (n.life.length > 30) n.life.length = 30;
    const gained = [];
    for (const sc of Object.values(D.scars)) {
      if (!sc.from.includes(tag) || rnd() > sc.chance || (sc.grudge && !o.ab)) continue;
      if (sc.heals.length) n.scars = n.scars.filter(x => !sc.heals.includes(x.name));
      const have = n.scars.find(x => x.name === sc.name);
      if (have) Object.assign(have, { day: W.day, ab: o.ab || have.ab, who: o.who || have.who }); else n.scars.push({ name: sc.name, day: W.day, ab: o.ab || null, who: o.who || null });
      gained.push(sc.name);
      if (sc.grudge && o.ab) { const g = n.grudges[o.ab.k] ||= { name: o.ab.name, def: o.ab.def || null, w: 0 }; g.w++; g.day = W.day; }
      const held = n.desire && D.scars[n.desire.scar]?.grudge && scarsOf(n).some(x => x.name === n.desire.scar);   // a grudge outweighs gratitude
      if (sc.desire && (!held || sc.grudge)) n.desire = { text: fill(sc.desire, o), scar: sc.name, day: W.day, ab: o.ab || null };
    }
    if (n.desire && !scarsOf(n).some(x => x.name === n.desire.scar)) n.desire = null;
    maybeArc(n, [tag, ...gained]);
  }
  const scarText = (n, x) => fill(D.scars[x.name]?.shown || x.name, x);
  // a line in the world's history: the big moments, kept for good
  function chronicle(text, o = {}) { (W.history ||= []).unshift({ day: W.day, year: year(), season: season(), text, town: o.town ?? null, zone: o.zone ?? null, who: o.who || [] }); if (W.history.length > 400) W.history.length = 400; }
  const HISTORIC = new Set(['sacked', 'newtown', 'abandoned', 'hero', 'slain', 'coup', 'dark', 'undead', 'arc', 'renamed', 'brood', 'deed', 'exodus', 'region', 'plague-turn', 'legend']);
  const allPeople = () => [...W.towns.flatMap(t => t.npcs), ...W.parties.flatMap(p => p.members), ...(W.figures || [])];
  const spouseOf = n => n.kin?.spouse ? IDX.get(n.kin.spouse.id) : null;
  const titled = n => n.title ? `${n.first} ${n.title}` : nm(n);
  const needBy = (n, met) => Math.max(0, ...Object.values(D.needs).filter(d => d.met === met).map(d => n.needs[d.name] || 0));
  const setNeed = (n, met, f) => { for (const d of Object.values(D.needs)) if (d.met === met) n.needs[d.name] = clamp(f(n.needs[d.name] || 0), 0, 100); };
  function npcPower(n) {
    const best = Math.max(n.stats[0], n.stats[1]);
    let p = 1 + Math.max(0, (best - 10) / 2) * 0.4 + Math.min(n.xp, 40) * 0.05;
    if (fightsJob(n)) p += 3;
    if (n.inv.weapon) p += 1.5;
    if (n.hero) p += 5 + n.hero.level * 4;
    p += scar(n, 'courage');
    if (n.sick || n.injured) p *= 0.4;
    if (n.child) p *= 0.2;
    return Math.max(0.2, p);
  }

  /* ---------------- log & news ---------------- */
  function log(level, text, ref = {}, o = {}) {
    if (o.key) { if (W.firsts[o.key]) { if (o.repeat === 'skip') return null; level = o.repeat || 'minor'; } else W.firsts[o.key] = 1; }
    const e = { id: W.nextLog++, day: W.day, hour: W.hour, level, text, kind: o.kind || null, data: o.data || null, ...ref };
    if (o.kind) { const t = W.tally ||= {}; t[o.kind] = (t[o.kind] || 0) + 1; }
    if (e.town != null && e.region == null) e.region = townById(e.town)?.region;
    if (e.zone != null && e.region == null) e.region = zoneById(e.zone)?.region;
    W.log.unshift(e); if (W.log.length > 900) W.log.length = 900;
    if (level === 'trigger') W.pending.push(e);
    if (o.history || (level === 'trigger' && HISTORIC.has(o.kind))) chronicle(text, { town: e.town, zone: e.zone, who: o.who });
    // the town where it happened knows; a few people carry it out into the world
    if (level !== 'minor' && e.town != null) {
      const S = townById(e.town);
      if (S) {
        const item = { t: 'news', k: 'news:' + e.id, id: e.id, text, town: S.id, imp: level === 'trigger' ? 3 : 2, day: W.day, conf: 1, hops: 0, kind: e.kind };
        S.ledger[item.k] = { ...item, w: 1, by: 'witness', added: W.day };
        for (let i = 0; i < 3 && S.npcs.length; i++) learn(pick(S.npcs), item);
      }
    }
    return e;
  }

  /* ---------------- knowledge ---------------- */
  // items: res (a wild thing in a zone), danger (a hostile pack), survey (a zone was looked over), market (a town's prices), news
  function keyOf(it) { return it.k || (it.k = it.t === 'res' ? `res:${it.z}:${it.src}` : it.t === 'danger' ? `danger:${it.z}:${it.pop}` : it.t === 'survey' ? `survey:${it.z}` : it.t === 'market' ? `market:${it.town}` : `news:${it.id}`); }
  function learn(n, it) {
    if (!n || n.dead) return;
    keyOf(it);
    const i = n.know.findIndex(x => x.k === it.k);
    if (i >= 0) { if (n.know[i].day > it.day || (n.know[i].day === it.day && n.know[i].conf >= it.conf)) return; n.know.splice(i, 1); }
    n.know.push({ ...it, told: false });
    if (n.know.length > 14) { n.know.sort((a, b) => (b.conf + b.day * 0.05 + (b.t === 'news' ? 0 : 0.2)) - (a.conf + a.day * 0.05 + (a.t === 'news' ? 0 : 0.2))); n.know.length = 14; }
  }
  function observe(n, z) {
    if (!n || n.seen[z.id] === W.day) return; n.seen[z.id] = W.day;
    learn(n, { t: 'survey', z: z.id, day: W.day, conf: 1, hops: 0, by: n.id });
    for (const p of W.pops) {
      if (p.zone !== z.id || p.count < 0.5) continue;
      const d = def(p);
      if (isHostile(p)) learn(n, { t: 'danger', z: z.id, pop: p.id, src: p.def, name: popName(p), amt: Math.round(p.count), power: popPower(p), day: W.day, conf: 1, hops: 0, by: n.id });
      else if (d.gives) learn(n, { t: 'res', z: z.id, src: p.def, amt: Math.round(p.count), day: W.day, conf: 1, hops: 0, by: n.id });
    }
  }
  function observeMarket(n, T) {
    if (!n || !T || T.id === n.town) return;
    const prices = {}; Object.keys(D.goods).forEach(g => { if ((T.market.stock[g] || 0) >= 1) prices[g] = price(T, g); });
    learn(n, { t: 'market', town: T.id, fd: +foodDays(T).toFixed(1), prices, day: W.day, conf: 1, hops: 0, by: n.id });
  }
  const TRUST0 = 1;
  function describe(x) {
    const name = x.name || title(x.src || 'something'), d = D.sources[x.src];
    if (d?.solo) return name.replace(/^The /, 'the ');
    if (/'s /.test(name)) return `${name} (about ${x.amt})`;
    return `${x.amt > 1 ? x.amt + ' ' : ''}${name.toLowerCase()}`;
  }
  function judge(S, reporterId, believed, actual, it) {
    if (typeof reporterId !== 'number') return;
    const r = Math.max(1, believed) / Math.max(1, actual);
    const n = IDX.get(reporterId);
    if ((r > 1.7 || r < 0.55) && Math.abs(believed - actual) >= 4) {
      S.trust[reporterId] = (S.trust[reporterId] ?? TRUST0) * 0.7;
      const thing = (it.t === 'danger' ? (it.name || it.src) : it.src).toLowerCase();
      if (n) log(S.trustNoted?.[reporterId] ? 'minor' : 'notable', `${nm(n)} told ${S.name}'s council of ${Math.round(believed)} ${thing} in ${zoneById(it.z)?.name}. There were ${Math.round(actual)}. The council will weigh their word less.`, { town: S.id }, { kind: 'trust', data: { name: nm(n) } });
      (S.trustNoted ||= {})[reporterId] = 1;
    } else S.trust[reporterId] = Math.min(1.3, (S.trust[reporterId] ?? TRUST0) + 0.05);
  }
  function merge(S, it, by) {
    keyOf(it);
    const trust = typeof by === 'number' ? (S.trust[by] ?? TRUST0) : by === 'rumour' ? 0.7 : 1;
    const w = clamp(it.conf * trust, 0, 1.3);
    const cur = S.ledger[it.k];
    if (cur && it.hops === 0 && typeof cur.by === 'number' && cur.by !== by && cur.day < it.day && it.day - cur.day <= 4 && it.t === 'danger' && !it.fight) judge(S, cur.by, cur.amt, it.amt, cur);
    const fresh = !cur;
    if (!cur || it.day > cur.day || (it.day === cur.day && w > cur.w)) S.ledger[it.k] = { ...it, w, by, added: W.day, told: undefined };
    if (it.t === 'survey') for (const x of Object.values(S.ledger)) if ((x.t === 'res' || x.t === 'danger') && x.z === it.z && x.day < it.day) { x.w *= 0.3; x.amt = Math.round(x.amt * 0.3); }
    return fresh;
  }
  function distortFor(n, it) {
    if (it.t !== 'danger') return it;
    let f = 1;
    if (pers(n, 'cowardly')) f *= 1.6 + rnd();
    if (['monsters', 'the wilderness', 'death'].includes(P(n.fear))) f *= 1.4;
    if (pers(n, 'brave', 'proud', 'hot-tempered')) f *= 0.6;
    if (f === 1) return it;
    return { ...it, amt: Math.max(1, Math.round(it.amt * f)), power: it.power * f };
  }
  // at dawn people tell the council what they know (or don't)
  function council_reports(S) {
    const heard = [];
    for (const n of S.npcs) {
      const fresh = n.know.filter(it => !it.told);
      if (!fresh.length) continue;
      if (n.sick || ((pers(n, 'lazy', 'quiet')) && rnd() < 0.45)) continue;           // skips council
      for (const it of fresh) {
        it.told = true;
        const d = it.src ? D.sources[it.src] : null;
        const valuable = it.t === 'res' && d && (d.food > 0 || hasTag(d.gives, 'luxury')) && it.amt >= 10 && it.hops === 0;
        const greed = pers(n, 'greedy') ? 0.75 : pers(n, 'suspicious') ? 0.4 : pers(n, 'ambitious') ? 0.25 : 0;
        if (valuable && rnd() < greed && !n.hidden[it.k]) { n.hidden[it.k] = true; hist(n, `Keeps quiet about the ${it.src} in ${zoneById(it.z)?.name}`); continue; }
        if (n.hidden[it.k]) continue;
        const rep = distortFor(n, it);
        if (merge(S, rep, it.hops === 0 ? n.id : 'rumour')) heard.push({ n, it: rep });
      }
    }
    // things everybody is saying reach the council even if nobody formally reports them
    const holders = {};
    for (const n of S.npcs) for (const it of n.know) { if (S.ledger[it.k] && S.ledger[it.k].day >= it.day) continue; (holders[it.k] ||= []).push(it); }
    for (const [k, arr] of Object.entries(holders)) if (arr.length >= 3) { const best = arr.sort((a, b) => b.day - a.day)[0]; if (merge(S, { ...best, conf: best.conf * 0.8, hops: best.hops + 1 }, 'rumour')) heard.push({ n: null, it: best, street: true }); }
    // tell the story of the most important new things
    let said = 0;
    for (const { n, it, street } of heard.sort((a, b) => (b.it.t === 'danger' ? b.it.power : (b.it.amt || 0) / 3) - (a.it.t === 'danger' ? a.it.power : (a.it.amt || 0) / 3))) {
      if (said >= 2) break;
      const z = zoneById(it.z);
      if (it.t === 'danger' && it.power >= 6) { log(it.power >= 12 && !S.ledger[it.k]?.seenBefore ? 'notable' : 'minor', `${street ? `Talk in the streets reaches ${S.name}'s council` : `${nm(n)} brings word to ${S.name}'s council`}: ${describe(it)} in ${z?.name}.`, { town: S.id }, { kind: 'report', data: { danger: true } }); if (S.ledger[it.k]) S.ledger[it.k].seenBefore = 1; said++; }
      else if (it.t === 'res' && D.sources[it.src]?.food > 0 && it.amt >= 15) { log('minor', `${street ? 'Gossip tells' : nm(n) + ' tells'} ${S.name}'s council of ${it.src} in ${z?.name}.`, { town: S.id }); said++; }
      else if (it.t === 'market' && townById(it.town)) { log('minor', `${street ? 'Travellers say' : nm(n) + ' reports'} ${townById(it.town).name} has ${it.fd} days of food.`, { town: S.id }); said++; }
    }
    // old knowledge fades
    for (const id of Object.keys(S.trust)) S.trust[id] += (1 - S.trust[id]) * 0.03;
    for (const [k, x] of Object.entries(S.ledger)) { x.w *= 0.97; if (W.day - x.day > (x.t === 'news' ? 25 : 45) || x.w < 0.08) delete S.ledger[k]; }
  }
  function gossip(a, b, drank) {
    if (!a.know.length) return;
    const p = pers(a, 'gossipy') ? 0.75 : pers(a, 'cheerful') ? 0.45 : pers(a, 'kind') ? 0.35 : pers(a, 'quiet') ? 0.08 : pers(a, 'suspicious') ? 0.15 : 0.3;
    if (rnd() > p) return;
    let pool = a.know.filter(it => !a.hidden[it.k]);
    let leak = false;
    if (drank && rnd() < 0.2) { const h = a.know.filter(it => a.hidden[it.k]); if (h.length) { pool = h; leak = true; } }
    if (!pool.length) return;
    const it = pool.sort((x, y) => (y.t === 'news' || y.t === 'danger' ? 1 : 0) - (x.t === 'news' || x.t === 'danger' ? 1 : 0) + (rnd() - 0.5))[0];
    const f = (0.85 + rnd() * 0.35) * (it.t === 'danger' && pers(a, 'cowardly', 'gossipy') ? 1.25 : 1);
    learn(b, { ...it, conf: it.conf * 0.85, hops: it.hops + 1, amt: it.amt != null ? Math.max(0, Math.round(it.amt * f)) : it.amt, power: it.power != null ? it.power * f : it.power, told: false });
    if (leak) { const S = townById(a.town); delete a.hidden[it.k]; log('notable', `Over ale, ${nm(a)} lets slip about the ${it.src} in ${zoneById(it.z)?.name}.`, { town: S?.id }, { kind: 'leak' }); }
  }

  /* ---------------- names ---------------- */
  const PRE = ['Green', 'Iron', 'Dusk', 'Stone', 'Ash', 'Mill', 'Raven', 'Thorn', 'Oak', 'Salt', 'Wolf', 'Brook', 'Copper', 'Frost', 'Amber', 'Hollow', 'Bright', 'Elder', 'Red', 'Wil', 'Black', 'Fair'];
  const SUF = ['vale', 'ford', 'mere', 'haven', 'bridge', 'wick', 'stead', 'holm', 'crest', 'march', 'fall', 'moor', 'by', 'well', 'ton', 'gate'];
  const ZPRE = ['Thorn', 'Grey', 'Raven', 'Hollow', 'Black', 'Elder', 'Wolf', 'Ash', 'Cold', 'Red', 'Mist', 'Iron', 'Bramble', 'Shadow', 'Gold', 'Bitter', 'Whisper', 'Stag', 'Crow', 'Dead', 'Silver', 'Moss'];
  const RNAME = ['The Greyreach', 'Thornmarch', 'The Ashen Downs', 'Saltmere Coast', 'The Vale of Crows', 'Hollowmark', 'The Emberlands', 'Frostmoor', 'The Bramble Wilds', 'Goldfen', 'The Mistlands', 'Wolfreach'];
  const ALPHA = ['Greyfang', 'the Red Maw', 'Old Scar', 'Nightjaw', 'the Hollow King', 'Mother Bone', 'Grimtusk', 'the Pale One', 'Ashhide', 'Gutripper', 'the Widow', 'Blackbriar'];
  const PAPERS = ['Crier', 'Herald', 'Gazette', 'Courier', 'Bugle', 'Chronicle', 'Lantern', 'Post'];
  function uniqueName(make, taken) { for (let i = 0; i < 50; i++) { const n = make(); if (!taken.has(n)) { taken.add(n); return n; } } return make() + ' ' + ri(2, 9); }
  function zoneName(t, taken) {
    const suf = D.terrains[t]?.suffix || [' ' + title(t)];
    return uniqueName(() => { const s = pick(suf); return 'The ' + pick(ZPRE) + (/^[a-z]/.test(s) ? s : ' ' + s.trim()); }, taken);
  }

  /* ---------------- world ---------------- */
  function createWorld(packs, o = {}) {
    if (typeof packs === 'string') packs = [{ name: 'world.txt', text: packs }];
    D = Defs.compile(packs);
    if (!D.ok) throw new Error(D.issues.filter(i => i.level === 'error').map(i => (i.line ? `${i.file} line ${i.line}: ` : '') + i.msg).join('\n'));
    W = { packs: packs.map(p => ({ name: p.name, text: p.text })), day: 1, hour: 6, nextId: 1, nextPid: 1, nextTown: 1, nextZone: 1, nextParty: 1, nextBounty: 1, nextLog: 1,
      regions: [], towns: [], zones: [], roads: [], pops: [], parties: [], bounties: [], log: [], firsts: {}, pending: [], weird: 0, deathsNear: {}, names: [], savedAt: Date.now(),
      figures: [], history: [], deeds: [], party: 'the heroes' };
    IDX.clear();
    if (!o.empty) { addRegion(); log('notable', `The world begins. ${W.towns.length} towns in ${W.regions[0].name}.`); }
    return W;
  }
  // regions have their own size; a region made from your world map also has its picture and a land mask (wild areas and towns stay on land)
  const RW = R => R.w || TW, RH = R => R.h || TH;
  function onLand(R, x, y) {
    const L = R.land; if (!L) return true;
    const c = Math.floor((x - R.ox) / RW(R) * L.cols), r = Math.floor((y - R.oy) / RH(R) * L.rows);
    if (c < 0 || r < 0 || c >= L.cols || r >= L.rows) return false;
    return L.bits[r * L.cols + c] === '1';
  }
  const landShare = (R, p, rad) => { let k = 0; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; if (onLand(R, p.x + Math.cos(a) * rad * 0.7, p.y + Math.sin(a) * rad * 0.7)) k++; } return (k + (onLand(R, p.x, p.y) ? 2 : 0)) / 10; };
  // opts: { name, w, h, land, image, towns: [{ x, y, name, ext, size }], wilds: [{ x, y, name, ext, terrain }], fillers }  (x, y as 0–1 of the map)
  function addRegion(opts = {}) {
    const i = W.regions.length;
    const R = { id: i, name: opts.name || uniqueName(() => pick(RNAME), new Set(W.regions.map(r => r.name))), ox: i * 2000, oy: 0 };
    if (opts.w) { R.w = opts.w; R.h = opts.h; } if (opts.land) R.land = opts.land; if (opts.image) R.image = opts.image; if (opts.imageData) R.imageData = opts.imageData; if (opts.campaign) R.campaign = opts.campaign;
    W.regions.push(R);
    const w = RW(R), h = RH(R), at = p => ({ x: R.ox + p.x * w, y: R.oy + p.y * h });
    const taken = new Set(W.names);
    const terr = Object.values(D.terrains);
    const zones = [], spots = [];
    const fixedT = (opts.towns || []).map(t => ({ ...at(t), name: t.name, ext: t.ext, size: t.size }));
    // your wild places, where you pinned them
    for (const f of opts.wilds || []) {
      const p = at(f), tn = f.terrain && D.terrains[f.terrain] ? D.terrains[f.terrain] : wpick(terr), r = Math.round((tn.size[0] + tn.size[1]) / 2 * 0.8);
      zones.push({ id: W.nextZone++, region: R.id, type: tn.name, terrains: [tn.name], x: p.x, y: p.y, r, tags: tn.name === 'ruins' ? ['ruins'] : [], name: f.name, ext: f.ext ?? null, yours: true });
      taken.add(f.name);
    }
    const want = R.land ? clamp(Math.round(10 * (w * h) / (TW * TH) * (R.land.bits.split('1').length - 1) / R.land.bits.length), 8, 18) : 10;
    for (let tries = 0; zones.length < want + (opts.wilds || []).length && tries < 2500; tries++) {
      const k = zones.length - (opts.wilds || []).length;
      const t = k >= 0 && k < Math.min(3, terr.length) ? terr.slice().sort((a, b) => b.w - a.w)[k] : wpick(terr);
      const r = ri(t.size[0], t.size[1]);
      const p = { x: R.ox + r + 10 + rnd() * (w - 2 * r - 20), y: R.oy + r + 10 + rnd() * (h - 2 * r - 20) };
      if (zones.some(z => dist(z, p) < z.r + r + 30) || fixedT.some(t => dist(t, p) < r + 28)) continue;
      if (R.land && landShare(R, p, r) < (tries > 1800 ? 0.5 : 0.8)) continue;
      const terrains = [t.name, ...t.also.filter(a => rnd() < a.p).map(a => a.t)];
      zones.push({ id: W.nextZone++, region: R.id, type: t.name, terrains, x: p.x, y: p.y, r, tags: [], name: zoneName(t.name, taken) });
    }
    zones.forEach(z => W.zones.push(z));
    zones.forEach(z => z.near = zones.filter(o => o !== z && dist(o, z) < o.r + z.r + 200).map(o => o.id));
    fixedT.forEach(t => spots.push(t));
    const fillers = opts.fillers ?? (fixedT.length ? Math.max(2, 6 - fixedT.length) : 6);
    for (let tries = 0, added = 0; added < fillers && tries < 4000; tries++) {
      const p = { x: R.ox + 60 + rnd() * (w - 120), y: R.oy + 50 + rnd() * (h - 100) };
      if (!onLand(R, p.x, p.y)) continue;
      if (zones.some(z => dist(z, p) < z.r + (tries > 2000 ? 0 : 25))) continue;
      if (spots.some(s => dist(s, p) < (tries > 3000 ? 110 : 160))) continue;
      spots.push(p); added++;
    }
    // wild things first, so founders know their surroundings
    for (const z of zones) for (const d of Object.values(D.sources)) {
      if (d.spawn <= 0 || !d.area.some(a => z.terrains.includes(a))) continue;
      const near = spots.some(s => dist(s, z) - z.r < 120);
      const c = Math.min(0.9, d.spawn * 0.08) * (d.hostile && near ? 0.6 : 1) * (d.solo || d.dark || d.rises ? 0.5 : 1);
      if (rnd() < c) spawnPop(d.name, z, ri(d.start[0], d.start[1]), true);
    }
    const sets = D.settlements.slice().sort((a, b) => b.people[1] - a.people[1]);
    const newTowns = spots.map((p, k) => { const st = k === 0 ? sets[0] : wpick(D.settlements); const S = createTown(R, p, { pop: p.size || ri(st.people[0], st.people[1]), kind: st, name: p.name }); if (p.ext !== undefined) { S.ext = p.ext; S.yours = true; } return S; });
    if (newTowns.length) {
      const inTree = [newTowns[0]], rest = newTowns.slice(1), edges = [];
      while (rest.length) { let best = null; for (const a of inTree) for (const b of rest) { const d = dist(a, b); if (!best || d < best.d) best = { a, b, d }; } edges.push(best); inTree.push(best.b); rest.splice(rest.indexOf(best.b), 1); }
      const extra = []; for (const a of newTowns) for (const b of newTowns) if (a.id < b.id && !edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))) extra.push({ a, b, d: dist(a, b) });
      extra.sort((x, y) => x.d - y.d).slice(0, 2).forEach(e => edges.push(e));
      edges.forEach(e => W.roads.push({ a: e.a.id, b: e.b.id, len: e.d }));
      // a long road to the nearest other region (another map in the same world)
      let best = null; for (const a of W.towns.filter(t => t.region !== R.id && t.npcs.length)) for (const b of newTowns) { const d = dist(a, b); if (!best || d < best.d) best = { a, b, d }; }
      if (best) W.roads.push({ a: best.a.id, b: best.b.id, len: Math.min(best.d, 1400), far: true });
    }
    W.names = [...taken, ...W.names];
    if (i > 0) log('trigger', `A new region is found: ${R.name}, with ${newTowns.length} towns.`, { region: R.id }, { kind: 'region' });
    return R;
  }
  function spawnPop(name, z, count, quiet, separate) {
    const d = D.sources[name]; if (!d || !z) return null;
    const same = !separate && !d.solo && W.pops.find(p => p.zone === z.id && p.def === name && !p.mutation && p.chief == null);
    if (same) { same.count += count; return same; }
    const p = { id: W.nextPid++, def: name, zone: z.id, count, level: 1, xp: 0, hunger: 0, aggro: d.hostile ? 0.1 + rnd() * 0.25 : 0, mult: 1, growthX: 1, tags: [], mutation: null, leader: null, born: W.day, slew: 0, mem: { z: {}, raid: {}, road: 0.5 }, loot: 0 };
    W.pops.push(p);
    if (!quiet) log(d.hostile ? 'notable' : 'minor', `${popName(p)} appear in ${z.name}.`, { zone: z.id }, { kind: 'spawn' });
    return p;
  }
  function popName(p, lower) {
    const k = p.mutation || p.def, d = D.sources[p.def];
    const base = lower ? k.toLowerCase() : title(k);
    if (p.leader) return `${p.leader}'s ${k.toLowerCase()}`;
    return d?.solo ? (lower ? 'the ' : 'The ') + k.toLowerCase() : base;
  }
  const v = (p, many, one) => solo(p) ? one : many;
  function popPower(p) {
    const d = def(p); const frost = p.tags.includes('frost') && season() === 'winter' ? 1.5 : 1;
    return Math.max(0.5, p.count * Math.max(d.power, p.tags.includes('hostile') ? 3 : 0) * p.mult * (1 + 0.15 * (p.level - 1)) * frost);
  }

  /* ---------------- towns ---------------- */
  function createTown(R, pos, o = {}) {
    const pop = o.pop || ri(18, 26);
    const taken = new Set(W.names);
    const S = { id: W.nextTown++, region: R.id, x: pos.x, y: pos.y, name: o.name || uniqueName(() => pick(PRE) + pick(SUF), taken), kind: o.kind?.name || 'village',
      npcs: [], buildings: [], slots: [], market: { stock: {}, coin: 60, sold: {}, consign: {} }, treasury: o.kind?.treasury ?? 140, services: {}, servToday: {}, dials: {},
      founded: pop, lowFoodDays: 0, buildProgress: 0, peak: pop, mods: [], palisade: 0, fear: 0, threat: 0, force: 0, threats: {}, council: {}, cases: {}, pendingOut: [],
      ledger: {}, trust: {}, avoid: {}, focus: {}, alms: 0, earning: 1, deaths: 0, lastDeath: -99, ration: 0, decor: ri(1, 1e6), paper: null };
    W.names.push(S.name);
    W.towns.push(S);
    const zs = W.zones.filter(z => z.region === R.id).map(z => ({ z, d: dist(z, S) - z.r })).sort((a, b) => a.d - b.d);
    S.wilds = zs.filter(o => o.d < 220).map(o => o.z.id); if (!S.wilds.length && zs.length) S.wilds = [zs[0].z.id];
    S.woodsName = zs[0]?.z.name || 'The Wilds';
    S.water = zs.some(o => o.d < 200 && o.z.terrains.some(t => /river|lake|sea|ocean|coast/.test(t)));
    S.paper = { name: `The ${S.name} ${pick(PAPERS)}`, no: 0, issues: [], last: 0 };
    if (o.npcs) o.npcs.forEach(n => { n.home = null; S.npcs.push(n); });
    else {
      for (let i = 0; i < pop; i++) S.npcs.push(rollNPC());
      // founding rule: at least a third of founders work food
      const foodJobs = Object.values(D.professions).filter(p => p.w > 0 && p.kind !== 'gatherer' && p.makes.some(m => isFoodGood(m.g)));
      let fed = S.npcs.filter(isFoodMaker).length;
      for (const n of S.npcs) { if (fed >= Math.ceil(pop * 0.35) || !foodJobs.length) break; if (!isFoodMaker(n)) { n.job = wpick(foodJobs).name; fed++; } }
    }
    S.npcs.forEach(n => n.town = S.id);
    if (!o.npcs) { const adults = S.npcs.slice().sort(() => rnd() - 0.5); for (let i = 0; i + 1 < adults.length && i < adults.length * 0.45; i += 2) { const a = adults[i], b = adults[i + 1]; a.kin.spouse = kinLink(b); b.kin.spouse = kinLink(a); a.last = rnd() < 0.6 ? a.last : b.last; b.last = a.last; } }
    Object.keys(D.goods).forEach(g => S.market.stock[g] = isFoodGood(g) ? 0 : 2);
    const staple = D.foodGoods.slice().sort((a, b) => good(a).price - good(b).price)[0];
    if (staple) S.market.stock[staple] = Math.max(10, S.npcs.length) * 3 * 45 / good(staple).food;
    const mats = Object.keys(D.goods).filter(g => hasTag(g, 'material')); mats.forEach(g => S.market.stock[g] = 10);
    S.npcs.forEach(n => { if (['producer', 'gatherer'].includes(prof(n).kind) && rnd() < 0.4) n.inv.tool = 1; });
    layout(S);
    // the founders know their surroundings, roughly
    for (const id of S.wilds) { const z = zoneById(id); const elder = { id: -1, seen: {}, know: [], dead: false }; observe(elder, z); elder.know.forEach(it => merge(S, { ...it, conf: 0.6, amt: Math.round((it.amt || 0) * (0.6 + rnd() * 0.8)), hops: 1 }, 'elders')); }
    computeDials(S);
    return S;
  }
  function layout(S) {
    const B = S.buildings; B.length = 0;
    const add = (type, name, x, y, w, h, extra = {}) => { const b = { id: B.length, type, name, x, y, w, h, ...extra }; B.push(b); return b; };
    add('market', 'Market Square', 440, 270, 130, 90);
    add('woods', S.woodsName, 0, 0, 92, TH, { zone: true });
    S.slots = [];
    for (let gx = 0; gx < 8; gx++) for (let gy = 0; gy < 6; gy++) {
      const x = 130 + gx * 104, y = 40 + gy * 86;
      if (x > 400 && x < 600 && y > 220 && y < 380) continue;
      if (x < 350 && y > 400) continue;
      if (S.water && y > 500) continue;
      if ((x > 800 && y < 120) || (x < 200 && y < 140)) continue;
      S.slots.push({ x, y, d: Math.hypot(x + 40 - 505, y + 30 - 315) });
    }
    S.slots.sort((a, b) => a.d - b.d);
    S.npcs.forEach(n => ensureWorkplace(S, n, true));
    const houses = Math.ceil(S.npcs.length / (D.buildings[D.house].beds || 4)) + 1;
    for (let i = 0; i < houses; i++) addHouse(S, true);
    for (const n of S.npcs) { if (n.home != null) continue; const sp = spouseOf(n); const h = sp && sp.town === S.id && sp.home != null ? B[sp.home] : null; if (h?.residents && h.residents.length < h.beds + 1) { h.residents.push(n.id); n.home = h.id; } else assignHome(S, n); }
    S.npcs.forEach(n => placeAt(S, n, workplace(S, n) || B[0], true));
  }
  function takeSlot(S, far) { if (!S.slots.length) return null; return far ? S.slots.pop() : S.slots.shift(); }
  function ensureWorkplace(S, n, founding) {
    const j = prof(n); if (!j.building) return null;
    let b = S.buildings.find(b => b.job === j.building); if (b) return b;
    const bd = D.buildings[j.building] || { style: 'work' };
    let s;
    if (bd.style === 'fields') s = { x: 110, y: 430, w: 230, h: 150 };
    else if (bd.style === 'edge') { const edges = [{ x: 880, y: 30 }, { x: 96, y: 60 }, { x: 96, y: 300 }, { x: 880, y: 140 }]; s = edges.find(e => !S.buildings.some(o => Math.abs(o.x - e.x) < 40 && Math.abs(o.y - e.y) < 40)) || takeSlot(S, false); }
    else s = takeSlot(S, false);
    if (!s) s = { x: 120 + rnd() * 760, y: 30 + rnd() * 460 };
    b = { id: S.buildings.length, type: bd.style === 'fields' ? 'fields' : 'work', name: title(j.building), job: j.building, x: s.x, y: s.y, w: s.w || (bd.style === 'edge' ? 100 : 84), h: s.h || (bd.style === 'edge' ? 70 : 62), zone: bd.style === 'fields' };
    S.buildings.push(b);
    if (!founding) log('trigger', `${art(j.building) === 'an' ? 'An' : 'A'} ${j.building} opens in ${S.name}. The town has never had one.`, { town: S.id }, { key: `bld:${S.id}:${j.building}`, repeat: 'skip', kind: 'building' });
    return b;
  }
  function addHouse(S, founding) {
    const s = takeSlot(S, true); if (!s) return null;
    const b = { id: S.buildings.length, type: 'house', name: 'House', x: s.x + 8, y: s.y + 8, w: 66, h: 48, beds: D.buildings[D.house].beds || 4, residents: [] };
    S.buildings.push(b);
    if (!founding) log('minor', `Carpenters finish a new house in ${S.name}.`, { town: S.id });
    return b;
  }
  function assignHome(S, n) { const h = S.buildings.find(b => b.type === 'house' && b.residents.length < b.beds); if (!h) { n.home = null; return; } h.residents.push(n.id); n.home = h.id; if (h.name === 'House') h.name = n.last + ' house'; }
  function freeHome(S, n) { if (n.home != null) { const h = S.buildings[n.home]; if (h?.residents) h.residents = h.residents.filter(id => id !== n.id); } n.home = null; }
  const workplace = (S, n) => { const j = prof(n); return j.building ? S.buildings.find(b => b.job === j.building) : null; };
  const provB = svc => (D._prov ||= {})[svc] ||= new Set(Object.values(D.professions).filter(p => p.provides.includes(svc)).map(p => p.building).filter(Boolean));
  const byProvide = (S, svc) => S.buildings.find(b => b.job && provB(svc).has(b.job));
  const innB = () => D._inn ||= new Set(Object.values(D.professions).filter(p => p.kind === 'inn').map(p => p.building).filter(Boolean));
  const spot = b => ({ x: b.x + 8 + rnd() * (b.w - 16), y: b.y + 8 + rnd() * (b.h - 16) });
  function placeAt(S, n, b, snap) { n.where = b.id; n.dest = spot(b); if (snap || !n.pos) n.pos = { ...n.dest }; }
  function addToTown(S, n, fromEdge) {
    n.town = S.id; if (!S.npcs.includes(n)) S.npcs.push(n);
    if (n.home == null || !S.buildings[n.home]?.residents?.includes(n.id)) { n.home = null; assignHome(S, n); }
    ensureWorkplace(S, n); placeAt(S, n, S.buildings[0], true); if (fromEdge) n.pos = { x: 980, y: 315 };
    n.gz = null;
  }
  function removeFromTown(S, n, keepHome) { const i = S.npcs.indexOf(n); if (i >= 0) S.npcs.splice(i, 1); if (!keepHome) freeHome(S, n); }

  /* ---------------- market ---------------- */
  const mealsRaw = S => D.foodGoods.reduce((s, g) => s + (S.market.stock[g] || 0) * good(g).food / 45, 0);
  const meals = mealsRaw;
  const foodDays = S => meals(S) / Math.max(1, S.npcs.length * 1.6);
  const foodTarget = S => Math.max(4, S.npcs.length * 2);
  function price(S, g) {
    const G = good(g), st = S.market.stock[g] || 0;
    if (G.food > 0) {
      const k1 = clamp(Math.sqrt(foodTarget(S) / Math.max(meals(S), 0.4)), 0.5, 2.5);
      const k2 = clamp(Math.sqrt(foodTarget(S) * 0.35 / Math.max(st * G.food / 45, 0.4)), 0.75, 1.5);
      return +(G.price * k1 * k2).toFixed(2);
    }
    const t = 6 + S.npcs.length * 0.2;
    return +(G.price * clamp(Math.sqrt(t / Math.max(st, 0.4)), 0.5, 2.5)).toFixed(2);
  }
  function pay(id, amt, S) {
    if (typeof id === 'string' && id.startsWith('T')) { const t = townById(+id.slice(1)); if (t) { t.treasury += amt; return true; } return false; }
    const n = IDX.get(id); if (n && !n.dead) { n.coin += amt; n.earned += amt; return true; } return false;
  }
  function buy(S, g, payer) {
    if ((S.market.stock[g] || 0) < 1) return 0;
    const p = price(S, g);
    if (payer === 'treasury') { if (S.treasury < p) return 0; S.treasury -= p; } else { if (payer.coin < p) return 0; payer.coin -= p; }
    S.market.stock[g] -= 1;
    const tax = p * 0.12, fee = p * 0.08; S.treasury += tax;
    if (S.npcs.some(o => prof(o).kind === 'merchant')) S.market.coin += fee; else S.treasury += fee;
    const q = S.market.consign[g] ||= [];
    while (q.length && q[0].qty < 0.5) q.shift();
    if (!(q.length && (q[0].qty -= 1, pay(q[0].id, p - tax - fee, S)))) S.market.coin += p - tax - fee;
    S.market.sold[g] = (S.market.sold[g] || 0) + 1;
    return p;
  }
  function sell(S, sellerId, g, qty) {
    const G = good(g);
    if (G.food > 0) { const cap = foodTarget(S) * ({ spring: 4, summer: 6, autumn: 16, winter: 8 })[season()]; qty = Math.min(qty, Math.max(0, (cap - meals(S)) * 45 / G.food)); }
    else qty = Math.min(qty, Math.max(0, (6 + S.npcs.length * 0.2) * 3.5 - (S.market.stock[g] || 0)));
    if (qty <= 0.01) return 0;
    S.market.stock[g] = (S.market.stock[g] || 0) + qty;
    const q = S.market.consign[g] ||= []; const last = q[q.length - 1];
    if (last && last.id === sellerId) last.qty += qty; else q.push({ id: sellerId, qty });
    if (q.length > 60) q.splice(0, q.length - 60);
    return qty;
  }
  function takeFood(S, mealsWanted) {         // remove food from the shelves (raids, spoilage of a share)
    let left = mealsWanted;
    for (const g of D.foodGoods.slice().sort((a, b) => (S.market.stock[b] || 0) - (S.market.stock[a] || 0))) {
      if (left <= 0) break; const per = good(g).food / 45, have = (S.market.stock[g] || 0) * per, take = Math.min(have, left);
      S.market.stock[g] -= take / per; left -= take;
    }
    return mealsWanted - left;
  }
  function cheapestFood(S, budget) {
    let best = null;
    for (const g of D.foodGoods) { if ((S.market.stock[g] || 0) < 1) continue; const p = price(S, g); if (p > budget) continue; const val = good(g).food / p * (0.85 + rnd() * 0.3); if (!best || val > best.val) best = { g, p, val }; }
    return best;
  }
  const mod = (S, type) => S.mods.filter(m => m.type === type && m.until >= W.day).reduce((x, m) => x * m.x, 1);

  /* ---------------- people decide ---------------- */
  const inHours = (h, [a, b]) => a < b ? h >= a && h < b : h >= a || h < b;
  function decide(S, n) {
    const h = W.hour, j = prof(n), night = h >= 22 || h < 6, ill = n.sick > 0 || n.injured > 0;
    const sc = [], opt = (key, score, why) => sc.push({ key, score: Math.round(score + rnd() * 6), why });
    const tired = needBy(n, 'sleep'), hunger = needBy(n, 'eat'), lonely = needBy(n, 'company'), faith = needBy(n, 'faith');
    opt('sleep', tired * 0.9 + (night ? 45 : h >= 21 ? 20 : 0) - (h >= 7 && h < 20 ? 30 : 0) + (ill ? 40 : 0), ill ? (n.sick ? 'Sick with fever' : 'Injured') : `Tired ${Math.round(tired)}`);
    const cheap = cheapestFood(S, 1e9);
    const canEat = (isFoodMaker(n) && cheap) || (cheap && n.coin >= cheap.p) || (hunger >= 60 && cheap && S.treasury >= cheap.p);
    opt('eat', hunger * (canEat ? 1 : 0.35) + ([7, 12, 19].includes(h) && hunger > 25 ? 25 : 0), `Hunger ${Math.round(hunger)}${canEat ? '' : cheap ? ', no coin for food' : ', no food at market'}`);
    let work = inHours(h, j.hours) ? 55 : 0;
    if (!canEat && hunger > 50) work += 30;
    work += n.coin < 5 ? 25 : n.coin < 15 ? 10 : 0;
    work += pers(n, 'hardworking') ? 15 : pers(n, 'lazy') ? -20 : pers(n, 'greedy') ? 10 : 0;
    if (P(n.want) === 'coin') work += 8;
    if (tired > 80) work -= 30;
    if (ill) work -= 70;
    if (j.kind === 'gatherer' && S.fear > 4 && ['monsters', 'the wilderness', 'death'].includes(P(n.fear))) work -= 25;
    if (!inHours(h, j.hours) && n.coin < 3 && ['producer', 'gatherer'].includes(j.kind)) work = Math.max(work, 40);
    work += scar(n, 'work');
    if (!n.child) opt('work', work, j.kind === 'beggar' ? 'Needs coin' : `Shift ${j.hours[0]}–${j.hours[1]}, ${Math.round(n.coin)} coin`);
    else opt('social', 40 + (h >= 8 && h < 19 ? 15 : 0), 'Plays with the other children');
    let so = lonely * 0.7 + (h >= 18 && h < 23 ? 15 : 0) - (night && h < 5 ? 30 : 0) + (S.fear > 5 ? 8 : 0);
    so += pers(n, 'gossipy', 'cheerful', 'romantic') ? 10 : pers(n, 'quiet', 'suspicious') ? -10 : 0;
    so += scar(n, 'social');
    opt('social', so, `Lonely ${Math.round(lonely)}${S.fear > 5 ? ', the town is afraid' : ''}`);
    const temple = byProvide(S, 'faith');
    const prayS = scar(n, 'pray');
    if (temple && (faith > 0 || prayS > 0 || pers(n, 'pious') || P(n.want) === 'faith' || ['death', 'dark magic'].includes(P(n.fear)) || S.fear > 6))
      opt('pray', ((h >= 6 && h < 8) || (h >= 18 && h < 20) ? 48 : 0) + lonely * 0.2 + faith * 0.6 + (S.fear > 6 ? 10 : 0) + prayS, prayS > 0 ? scarsOf(n).map(x => scarText(n, x))[0] : pers(n, 'pious') ? 'Pious' : S.fear > 6 ? 'Frightened' : `Wants ${n.want}`);
    if (n.ambition && !n.child && (night || h === 21) && tired < 70 && !ill && (W.day * 7 + n.id) % 10 < 3) opt('scheme', 30 + rnd() * 30 + (['power', 'knowledge', 'revenge'].includes(P(n.want)) ? 10 : 0), 'Secret ambition');
    opt('wander', 12, 'Nothing pressing');
    sc.sort((a, b) => b.score - a.score);
    n.scores = sc;
    return sc[0];
  }
  const HINTS = [
    [/magic|dark|worship|immortal|curse/i, ['Strange lights flicker at the edge of {woods}.', 'A farmer finds a ring of dead grass near {woods}.', 'Dogs in {town} howl at nothing past midnight.', 'Someone has been digging at the old graves of {town}.']],
    [/relic/i, ['A stranger in {town} asks about old ruins.', 'Someone in {town} reads maps by lamplight.']],
    [/town/i, ['Talk spreads in {town} of good land somewhere past the wilds.']],
    [/overthrow/i, ['Hushed meetings are held behind {town} market after dark.']],
    [/hero/i, ['Someone in {town} trains with a stick sword before dawn.']],
    [/monster|tame/i, ['Fresh meat is left at the edge of {woods} each night.']],
    [/hoard|wealth/i, ['Someone in {town} has been burying coins under a hedge.']],
    [/revenge/i, ['Bitter words are carved into a table in {town}.']],
    [/end/i, ['Someone preaches in {town} square that the world will end.']],
  ];
  function act(S, n, choice) {
    const j = prof(n), wp = workplace(S, n), market = S.buildings[0];
    const home = n.home != null ? S.buildings[n.home] : null;
    const inn = S.buildings.find(b => b.job && innB().has(b.job));
    const innOpen = !!inn && S.npcs.some(o => prof(o).kind === 'inn' && o.action === 'work');
    const temple = byProvide(S, 'faith');
    let where = market, label = choice.key, text = '';
    n.working = false;
    switch (choice.key) {
      case 'sleep':
        if (n.sick) { where = home || temple || market; text = 'In bed with fever'; label = 'sick'; setNeed(n, 'sleep', x => x - 6); break; }
        if (n.injured) { where = home || market; text = 'Resting a wound'; label = 'sick'; setNeed(n, 'sleep', x => x - 8); break; }
        if (home) { where = home; setNeed(n, 'sleep', x => x - 13); text = 'Sleeping at home'; n.rough = 0; }
        else if (inn && n.coin >= 2) { where = inn; n.coin -= 2; payInn(S, 2); setNeed(n, 'sleep', x => x - 11); text = 'Rents a bed at the inn (2 coin)'; }
        else { setNeed(n, 'sleep', x => x - 7); n.rough++; text = 'Sleeping rough in the square'; }
        break;
      case 'eat': {
        const own = isFoodMaker(n) && needBy(n, 'eat') > 20 && D.foodGoods.filter(g => (S.market.stock[g] || 0) >= 0.6 && (j.makes.some(m => m.g === g) || Object.values(D.sources).some(s => s.gives === g && matches(s, j.gathers))))[0];
        if (own && !(n.coin > 25 && rnd() < 0.5)) { S.market.stock[own] -= 0.6; setNeed(n, 'eat', x => x - good(own).food); where = wp || market; text = `Eats ${own} from their own work`; break; }
        if (innOpen && n.coin >= 6) { const c = cheapestFood(S, 1e9); if (c) { const cost = +(c.p * 1.5 + 1).toFixed(1); if (n.coin >= cost) { n.coin -= cost; buy(S, c.g, { coin: 1e9 }); payInn(S, cost - c.p); setNeed(n, 'eat', x => x - good(c.g).food - 20); setNeed(n, 'company', x => x - 15); where = inn; text = `Hot meal at the inn (${cost} coin)`; break; } } }
        const c = cheapestFood(S, n.coin);
        if (c && buy(S, c.g, n)) { setNeed(n, 'eat', x => x - good(c.g).food); text = `Buys ${c.g} (${c.p.toFixed(1)} coin)`; break; }
        const alms = cheapestFood(S, S.treasury);
        if (needBy(n, 'eat') >= 60 && alms && buy(S, alms.g, 'treasury')) {
          setNeed(n, 'eat', x => x - good(alms.g).food); where = temple || market; text = 'Fed by the town alms'; S.alms++;
          log('trigger', `${S.name} begins feeding its poor from the treasury.`, { town: S.id }, { key: 'alms:' + S.id, repeat: 'skip', kind: 'alms' });
          break;
        }
        label = 'hungry';
        if (!cheapestFood(S, 1e9)) { text = 'The market has no food'; log('trigger', `${S.name}'s market runs out of food.`, { town: S.id }, { key: 'nofood:' + S.id, repeat: 'skip', kind: 'famine' }); }
        else text = 'Cannot afford food';
        break; }
      case 'work': ({ where, text, label } = doWork(S, n, j, wp, market)); n.working = label === 'work'; break;
      case 'social': {
        where = innOpen ? inn : market;
        const company = S.npcs.filter(o => o !== n && o.where === where.id && (o.action === 'social' || o.action === 'eat'));
        setNeed(n, 'company', x => x - 20 - company.length * 4);
        let drank = false;
        const ale = Object.keys(D.goods).find(g => hasTag(g, 'luxury') && !isFoodGood(g) && (S.market.stock[g] || 0) >= 1);
        if (ale && n.coin > 6 && rnd() < 0.5) { buy(S, ale, n); drank = true; setNeed(n, 'company', x => x - 10); }
        text = company.length ? `${drank ? 'Drinks' : 'Chats'} with ${company.length} other${company.length > 1 ? 's' : ''}` : 'Looks for company';
        if (company.length) { const o = pick(company); gossip(n, o, drank); gossip(o, n, drank); }
        break; }
      case 'pray': where = temple; setNeed(n, 'company', x => x - 12); setNeed(n, 'faith', x => x - 30); S.servToday.faith = (S.servToday.faith || 0) + 0.3; text = 'Prays'; break;
      case 'scheme': {
        where = S.buildings.find(b => b.type === 'woods'); n.secret++; text = 'Slips out alone…';
        if (n.secret % 22 === 0) { const set = (HINTS.find(([re]) => re.test(n.ambition)) || [0, ['Someone in {town} is up to something after dark.']])[1]; log('notable', pick(set).replace('{town}', S.name).replace('{woods}', S.woodsName), { town: S.id }, { kind: 'omen' }); }
        if (n.secret === 70) log('trigger', `${nm(n)} of ${S.name} is close to something. (${n.ambition})`, { town: S.id }, { key: 'secret:' + n.id, repeat: 'skip', kind: 'secret' });
        if (n.secret >= 120) { resolveAmbition(S, n); return; }
        break; }
      default: where = rnd() < 0.5 ? market : (home || market); text = 'Wanders about';
    }
    if (where && where.id !== n.where) { n.where = where.id; n.dest = spot(where); } else if (where && rnd() < 0.3) n.dest = spot(where);
    n.action = label; n.why = choice.why; n.doing = text;
    hist(n, text);
  }
  function payInn(S, amt) { const k = S.npcs.filter(o => prof(o).kind === 'inn'); if (k.length) pick(k).coin += amt; else S.treasury += amt; }

  /* gatherers choose where to go from what they (and their town) know */
  function gatherZone(S, n, j) {
    if (n.gz && W.zones.some(z => z.id === n.gz) && !(S.avoid[n.gz] > W.day)) return zoneById(n.gz);
    const want = it => it.t === 'res' && D.sources[it.src] && matches(D.sources[it.src], j.gathers);
    const zoneOk = z => z && z.region === S.region && dist(z, S) < 420 && !(S.avoid[z.id] > W.day);
    // 1. a secret of their own
    const secret = n.know.filter(it => n.hidden[it.k] && want(it)).sort((a, b) => b.amt - a.amt)[0];
    if (secret && zoneOk(zoneById(secret.z)) && secret.amt > 3) { n.gz = secret.z; n.gzWhy = 'their own secret spot'; return zoneById(n.gz); }
    // 2. where the council sent their trade
    if (S.focus[j.name] && zoneOk(zoneById(S.focus[j.name]))) { n.gz = S.focus[j.name]; n.gzWhy = 'the council sent them'; return zoneById(n.gz); }
    // 3. the best the town knows
    const danger = z => Object.values(S.ledger).filter(x => x.t === 'danger' && x.z === z).reduce((s, x) => s + x.power * x.w, 0);
    const opts = [...Object.values(S.ledger).filter(want), ...n.know.filter(want)].map(it => { const z = zoneById(it.z); return zoneOk(z) ? { z, s: it.amt * (it.w ?? it.conf) / (1 + danger(z.id) / 6) - dist(z, S) / 25 } : null; }).filter(Boolean).sort((a, b) => b.s - a.s);
    if (opts.length && opts[0].s > 1) { n.gz = opts[0].z.id; n.gzWhy = 'the town knows it is there'; return opts[0].z; }
    // 4. go and look
    const terr = new Set(Object.values(D.sources).filter(s => matches(s, j.gathers)).flatMap(s => s.area));
    const look = S.wilds.map(zoneById).filter(z => zoneOk(z) && z.terrains.some(t => terr.has(t))).sort((a, b) => dist(a, S) - dist(b, S));
    const z = look.find(z => !n.know.some(it => it.t === 'survey' && it.z === z.id && W.day - it.day < 4)) || look[0] || zoneById(S.wilds[0]);
    n.gz = z?.id ?? null; n.gzWhy = 'looking'; return z;
  }
  function doWork(S, n, j, wp, market) {
    const m = 1 + ((n.stats[STAT[j.stat]] ?? 10) - 10) * 0.025;
    const svc = s => S.servToday[s] = (S.servToday[s] || 0) + 1;
    let where = wp || market, text = '', label = 'work';
    const tool = n.inv.tool ? 1.3 : 1;
    if (n.inv.tool && rnd() < 0.03) { n.inv.tool = 0; hist(n, 'Tool breaks'); }
    if (j.kind === 'gatherer') {
      const z = gatherZone(S, n, j);
      where = wp || S.buildings.find(b => b.type === 'woods');
      if (!z) return { where, text: 'Nowhere to work', label: 'stuck' };
      observe(n, z);
      for (const p of W.pops.filter(p => p.zone === z.id && isHostile(p))) {
        if (rnd() < 0.003 * p.aggro * Math.min(1.5, p.count / 5) * (solo(p) ? 1.5 : 1)) {
          const res = skirmish(n, p, S);
          if (res === 'dead') return { where, text: 'Killed in the wilds', label: 'dead' };
          if (res === 'hurt') return { where: S.buildings[n.home] || market, text: `Mauled by ${popName(p, true)} in ${z.name}`, label: 'sick' };
          return { where, text: `Fights off ${popName(p, true)} in ${z.name}`, label: 'work' };
        }
      }
      const srcs = W.pops.filter(p => p.zone === z.id && !isHostile(p) && matches(def(p), j.gathers) && def(p).gives && p.count >= 0.5);
      if (!srcs.length) {
        n.gz = null; label = 'stuck';
        return { where, text: `Finds no ${j.gathers.join(' or ')} in ${z.name}`, label };
      }
      const made = [];
      for (const p of srcs) {
        const d = def(p);
        const avail = clamp(p.count / Math.max(5, d.cap * 0.5), 0.05, 1.3) * (d.kind === 'animal' && season() === 'winter' ? 0.7 : 1);
        const q = j.yield * m * tool * avail * (d.kind === 'mineral' ? 0.8 : 1.1) / srcs.length * (d.food ? 1 : 1.3) * mod(S, j.building || j.name);
        p.count = Math.max(0, p.count - q * d.per); p._lost = (p._lost || 0) + q * d.per;
        const got = sell(S, n.id, d.gives, q); if (got > 0.05) made.push(`${got.toFixed(1)} ${d.gives}`);
        for (const y of d.yields) sell(S, n.id, y, q * 0.3);
        if (d.danger && rnd() < d.danger) { n.injured = ri(8, 30); hist(n, `Hurt gathering ${d.name}`); return { where, text: `Hurt gathering ${d.name} in ${z.name}`, label: 'sick' }; }
      }
      text = made.length ? `${title(j.name)} in ${z.name}: ${made.join(', ')}` : `${title(j.name)} in ${z.name}, but the shelves are full`;
    } else if (j.kind === 'producer') {
      const bd = D.buildings[j.building];
      let y = m * tool * mod(S, j.building) * (bd?.style === 'fields' ? FARM_SEASON[season()] : 1);
      const made = [];
      for (const mk of j.makes) { const q = good(mk.g).food ? 1.1 * y * mk.q * (45 / good(mk.g).food) : y * mk.q; const got = sell(S, n.id, mk.g, q); if (got > 0.05) made.push(`${got.toFixed(1)} ${mk.g}`); }
      text = made.length ? `Works as ${j.name}: ${made.join(', ')} to market` : `Works as ${j.name}, but the shelves are full`;
    } else if (j.kind === 'crafter') {
      n.progress += 0.5 * m;
      if (n.progress >= 1) {
        const saving = j.uses.find(g => isFoodGood(g)) && foodDays(S) < 3 && !j.makes.some(mk => isFoodGood(mk.g));
        if (saving) { n.progress = 1; return { where, text: `Idle: the ${j.uses.find(g => isFoodGood(g))} is needed for eating`, label: 'stuck' }; }
        const missing = j.uses.find(g => (S.market.stock[g] || 0) < 1);
        const cost = j.uses.reduce((s, g) => s + price(S, g), 0);
        if (missing) { text = `Idle, no ${missing} at market`; label = 'stuck'; log('trigger', `${S.name}'s ${j.name}s have nothing to work with: the market is out of ${missing}.`, { town: S.id }, { key: `stuck:${S.id}:${j.name}`, repeat: 'skip', kind: 'shortage' }); }
        else if (n.coin < cost) { text = `Cannot afford materials (${cost.toFixed(1)})`; label = 'stuck'; }
        else { j.uses.forEach(g => buy(S, g, n)); n.progress -= 1; j.makes.forEach(mk => sell(S, n.id, mk.g, mk.q)); text = `Finishes ${j.makes.map(x => x.g).join(' & ')} for market`; }
      } else text = `Works as ${j.name}`;
    } else if (j.kind === 'merchant') { const c = Math.min(S.market.coin, 1); S.market.coin -= c; n.coin += c; n.earned += c; where = market; text = `Minds a market stall (+${c.toFixed(1)})`; }
    else if (j.kind === 'inn') { text = 'Runs the inn'; j.provides.forEach(svc); }
    else if (j.kind === 'builder') {
      const freeBeds = S.buildings.filter(b => b.type === 'house').reduce((s, b) => s + b.beds - b.residents.length, 0);
      const need = S.npcs.some(o => o.home == null) || freeBeds < 2;
      const mat = j.uses[0];
      if (!need) { text = 'Small repairs around town'; const w = Math.min(S.treasury, 0.6); S.treasury -= w; n.coin += w; n.earned += w; }
      else if (!mat || buy(S, mat, 'treasury')) {
        S.buildProgress += m; const w = Math.min(S.treasury, 1.2); S.treasury -= w; n.coin += w; n.earned += w; text = `Builds a house (${Math.min(12, S.buildProgress).toFixed(0)}/12)`;
        if (S.buildProgress >= 12) { if (!S.slots.length) { S.buildProgress = 12; text = 'No room left to build'; log('trigger', `${S.name} has filled every plot. Where does it grow next?`, { town: S.id }, { key: 'full:' + S.id, repeat: 'skip', kind: 'full' }); } else { S.buildProgress = 0; addHouse(S); S.npcs.filter(o => o.home == null).forEach(o => assignHome(S, o)); } }
      } else { text = `Waiting for ${mat}`; label = 'stuck'; }
    } else if (j.kind === 'thief') {
      const marks = S.npcs.filter(o => o !== n && o.action === 'sleep' && o.coin > 2);
      if (!marks.length) text = 'Prowls the streets';
      else {
        const mk = pick(marks), safety = S.dials.Safety || 1;
        if (rnd() < 0.5 + (n.stats[1] - 10) * 0.03 - safety * 0.08) { const a = Math.min(mk.coin, ri(1, 5)); mk.coin -= a; n.coin += a; n.earned += a; text = `Lifts ${a} coin from ${nm(mk)}`; log('minor', `${nm(mk)} of ${S.name} wakes to find ${a} coin missing.`, { town: S.id }, { kind: 'theft' }); }
        else if (rnd() < safety * 0.15) { const f = Math.min(n.coin, 5); n.coin -= f; S.treasury += f; text = 'Caught by the watch and fined'; }
        else text = 'Botches a theft and flees';
      }
    } else if (j.kind === 'beggar') {
      const givers = S.npcs.filter(o => o !== n && o.where === market.id && o.coin > 5);
      const g = givers.find(o => pers(o, 'kind', 'pious')) || (rnd() < 0.15 ? pick(givers) : null);
      if (g) { g.coin -= 1; n.coin += 1; n.earned += 1; text = `${g.first} gives a coin`; } else text = 'Begs in the square';
      label = 'beg';
    } else if (j.kind === 'hero') { const w = Math.min(S.treasury, 1); S.treasury -= w; n.coin += w; n.earned += w; svc('safety'); svc('safety'); text = `Patrols ${S.name}${n.hero ? ` (${n.hero.cls})` : ''}`; }
    else {
      const wage = j.wage;
      if (j.uses.length && j.uses.every(g => (S.market.stock[g] || 0) >= 1) && rnd() < 0.15) j.uses.forEach(g => buy(S, g, 'treasury'));
      if (S.treasury >= wage) { S.treasury -= wage; n.coin += wage; n.earned += wage; n.unpaid = 0; j.provides.forEach(svc); text = `${title(j.name)} on duty (+${wage})`; }
      else { n.unpaid++; j.provides.forEach(svc); text = `${title(j.name)} on duty, unpaid`; log('trigger', `${S.name}'s treasury is empty. It can no longer pay its ${j.name}s.`, { town: S.id }, { key: 'broke:' + S.id, repeat: 'skip', kind: 'broke' }); }
    }
    if (['producer', 'gatherer'].includes(j.kind) && !n.inv.tool) { const t = Object.keys(D.goods).find(g => hasTag(g, 'tool') && (S.market.stock[g] || 0) >= 1); if (t && n.coin > price(S, t) + 12 && buy(S, t, n)) { n.inv.tool = 1; hist(n, `Buys ${t}`); } }
    return { where, text, label };
  }

  /* ---------------- death, grief, fear, fights ---------------- */
  function kill(n, cause, S, zone, by) {
    if (n.dead) return;
    n.dead = true; IDX.delete(n.id);
    { const t = W.deathsBy ||= {}; const c = /old age/.test(cause) ? 'old age' : /fever|bite/.test(cause) ? 'sickness' : /starved/.test(cause) ? 'starved' : isHeroes(by?.k) ? 'heroes' : by?.k?.startsWith('pop:') && popById(+by.k.slice(4))?.chief != null ? 'led band' : /raided|overran/.test(cause) ? 'raid' : /road/.test(cause) ? 'road' : /fell fighting/.test(cause) ? 'battle' : 'other'; t[c] = (t[c] || 0) + 1; }
    const T = S || townById(n.town);
    // family and friends: they grieve, and remember who did it
    const kin = [];
    const sp = spouseOf(n); if (sp && !sp.dead) kin.push([sp, 'lost spouse']);
    (n.kin?.kids || []).map(k => IDX.get(k.id)).filter(k => k && !k.dead).forEach(k => kin.push([k, 'lost parent']));
    (n.kin?.parents || []).map(k => IDX.get(k.id)).filter(k => k && !k.dead).forEach(k => kin.push([k, 'lost child']));
    const heir = kin.map(k => k[0]).find(k => k.town === n.town) || null;
    if (heir && n.coin > 0) { heir.coin += n.coin; n.coin = 0; }
    for (const [k, tag] of kin) mark(k, tag, `Lost ${nm(n)}, who ${cause}`, { ab: by, who: n.first });
    if (n.figure) { W.figures = (W.figures || []).filter(f => f !== n); for (const p of W.pops.filter(p => p.chief === n.id)) { p.chief = null; if (n.arc && D.arcs[n.arc.name]?.bound) { W.pops.splice(W.pops.indexOf(p), 1); log('trigger', `With ${titled(n)} gone, ${popName(p, true)} of ${zoneOf(p)?.name || 'the wilds'} fall still.`, { zone: p.zone }, { kind: 'legend' }); } } }
    if (n.arc && !n.arc.done) { n.arc.done = 'slain'; n.arc.ended = W.day; }
    if (n.hero && zone && !zone.renamed && zone.townRuin == null && (n.hero.level >= 3 || n.hero.renown >= 40) && W.zones.filter(z => z.region === zone.region && z.renamed).length < 3) { const old = zone.name; zone.renamed = W.day; zone.formerly = old; zone.name = `${n.first}'s Rest`; log('trigger', `Folk begin to call ${old} "${zone.name}", after ${nm(n)} the ${n.hero.cls.toLowerCase()}, who fell there.`, { zone: zone.id }, { kind: 'renamed' }); }
    if (T) {
      const i = T.npcs.indexOf(n); if (i >= 0) T.npcs.splice(i, 1);
      const mates = n.home != null && T.buildings[n.home]?.residents ? T.buildings[n.home].residents.filter(id => id !== n.id).map(id => IDX.get(id)).filter(Boolean) : [];
      freeHome(T, n);
      mates.forEach(h => h.grief = { name: nm(n), cause, day: W.day });
      mates.filter(h => !kin.some(k => k[0] === h)).forEach(h => mark(h, 'lost friend', `Lost ${nm(n)}, who ${cause}`, { ab: by, who: n.first }));
      T.deaths++; T.lastDeath = W.day; T.fear = Math.min(10, T.fear + 1.5);
      const zid = zone?.id ?? T.wilds[0]; if (zid != null) W.deathsNear[zid] = (W.deathsNear[zid] || 0) + 1;
    }
    W.parties.forEach(p => { const i = p.members.indexOf(n); if (i >= 0) p.members.splice(i, 1); });
    log(n.hero || n.figure ? 'trigger' : 'notable', `${titled(n)}${n.hero ? `, the ${n.hero.cls.toLowerCase()} of ${T ? T.name : 'the road'},` : T ? ` of ${T.name}` : ''} ${cause}.`, T ? { town: T.id } : zone ? { zone: zone.id } : {}, { kind: 'death', data: { name: nm(n), cause, hero: !!n.hero } });
  }
  function noteThreat(S, p, kind) {
    if (!S) return;
    const t = S.threats[p.id] ||= { incidents: 0, deaths: 0, last: 0 }; t.incidents++; t.last = W.day; if (kind === 'death') t.deaths++;
    merge(S, { t: 'danger', z: p.zone, pop: p.id, src: p.def, name: popName(p), amt: Math.round(p.count), power: popPower(p), day: W.day, conf: 1, hops: 0 }, 'witness');
  }
  function skirmish(n, p, S) {
    const z = zoneOf(p), d = def(p);
    const foe = d.solo ? popPower(p) : Math.max(d.power * p.mult * 1.6, 2);
    const a = npcPower(n) * (0.5 + rnd()), b = foe * (0.5 + rnd());
    noteThreat(S, p, 'attack'); p.xp += 1;
    if (a > b) { if (!d.solo && (p.count < 3 || rnd() < 0.3)) p.count = Math.max(0, p.count - 1); n.xp += 3; n.wins++; hist(n, `Fights off ${popName(p, true)}`); if (n.wins === 1 || rnd() < 0.2) mark(n, 'won fight', `Fought off ${popName(p, true)} in ${z.name}`, { ab: aboutPop(p) }); maybeVeteranHero(n, S); return 'won'; }
    if (rnd() < 0.55) { kill(n, `was killed by ${popName(p, true)} in ${z.name}`, S, z, aboutPop(p)); p.xp += 2; p.fedPeople = (p.fedPeople || 0) + 1; p.hunger = Math.max(0, p.hunger - 0.5); noteThreat(S, p, 'death'); curseSpread(p, S); rise(p, 1); return 'dead'; }
    n.injured = ri(24, 60); hist(n, `Mauled by ${popName(p, true)}`); log('notable', `${nm(n)} of ${S.name} is ${d.spreads ? 'bitten' : 'mauled'} by ${popName(p, true)} in ${z.name} and limps home.`, { town: S.id }, { kind: 'mauled' });
    mark(n, 'mauled', `Mauled by ${popName(p, true)} in ${z.name}`, { ab: aboutPop(p) }); infect(n, p);
    S.fear = Math.min(10, S.fear + 0.7); return 'hurt';
  }
  // bites: a victim sickens and, unless cured, dies and rises to join what bit them
  function infect(n, p) {
    const d = def(p); if (d.spreads !== 'bite' || n.infected || n.dead) return;
    n.infected = { src: p.def, day: W.day, hour: W.hour, pop: p.id, h: 0 };
    mark(n, 'bitten', `Bitten by ${popName(p, true)}`, { ab: aboutPop(p) });
  }
  function rise(p, k) { if (def(p).spreads === 'bite' && rnd() < 0.4 * k) { p.count += 1; return true; } return false; }
  function curseSpread(p, S) {
    if (!p.tags.includes('curse') || !S || !S.npcs.length || rnd() > 0.35) return;
    const vic = pick(S.npcs); if (vic.ambition && /curse/i.test(vic.ambition)) return;
    vic.ambition = `Cursed by the ${(p.mutation || p.def).toLowerCase()}`; vic.secret = Math.max(vic.secret, 30);
    log('notable', `Someone in ${S.name} was bitten and told no one.`, { town: S.id }, { kind: 'omen' });
  }
  function battle(members, p, where, S) {
    const d = def(p), z = zoneOf(p);
    const pp = members.reduce((s, n) => s + npcPower(n), 0) * (0.6 + rnd() * 0.8), mp = popPower(p) * (0.6 + rnd() * 0.8);
    const win = pp > mp, margin = win ? pp / mp : mp / pp, killed = [];
    let foeLost = 0;
    members.forEach(n => observe(n, z));
    if (win) {
      if (d.solo) { if (margin > 1.25 || rnd() < 0.5) { foeLost = p.count; p.count = 0; } else { p.aggro = 0.2; p.hunger = 0; } }
      else { foeLost = Math.ceil(p.count * clamp(0.35 + (margin - 1) * 0.5, 0.35, 1)); p.count = Math.max(0, p.count - foeLost); }
      members.forEach(n => { if (rnd() < 0.08 / margin) killed.push(n); });
      p.aggro = Math.max(0.1, p.aggro - 0.3);
    } else {
      foeLost = d.solo ? 0 : Math.floor(p.count * 0.12 * rnd()); p.count = Math.max(0, p.count - foeLost);
      members.forEach(n => { if (rnd() < clamp(0.15 * margin, 0.1, 0.45)) killed.push(n); else { n.injured = Math.max(n.injured, ri(12, 48)); if (rnd() < 0.5) infect(n, p); } });
      p.xp += 3 + killed.length * 2; p.hunger = Math.max(0, p.hunger - 1);
    }
    if (killed.length) { p.slew = (p.slew || 0) + killed.length; p.fedPeople = (p.fedPeople || 0) + killed.length; }
    const survivors = members.filter(n => !killed.includes(n));
    if (win && p.count <= 0.5 && (d.solo || p.chief || p.leader)) survivors.forEach(n => mark(n, 'slew a monster', `Helped destroy ${popName(p, true)} in ${z.name}`, { ab: aboutPop(p) }));
    survivors.forEach(n => { n.xp += win ? 4 + p.level * 2 : 1; if (win) n.wins++; if (n.hero) heroXP(n, win ? 6 + p.level * 4 + (d.solo ? 15 : 0) : 2); learn(n, { t: 'danger', z: z.id, pop: p.id, src: p.def, name: popName(p), amt: Math.round(p.count), power: popPower(p), day: W.day, conf: 1, hops: 0, fight: true }); });
    killed.forEach(n => { kill(n, `fell fighting ${popName(p, true)} ${where}`, townById(n.town), z, aboutPop(p)); curseSpread(p, townById(n.town)); rise(p, 1); });
    survivors.forEach(n => maybeVeteranHero(n, townById(n.town)));
    if (p.count <= 0.5) removePop(p, null);
    return { win, killed, foeLost, survivors };
  }
  function removePop(p, text) {
    const i = W.pops.indexOf(p); if (i < 0) return;
    W.pops.splice(i, 1);
    if (p.chief != null) { const c = IDX.get(p.chief); p.chief = null; if (c && !c.dead) kill(c, `died with their band in ${zoneOf(p)?.name || 'the wilds'}`, null, zoneOf(p)); }
    if (text && isHostile(p)) log(p.mutation || p.leader || solo(p) ? 'trigger' : 'notable', text, { zone: p.zone }, { kind: 'gone' });
    W.bounties.filter(b => b.pop === p.id && !b.done).forEach(b => { b.done = true; if (!b.claimed) { const t = townById(b.town); if (t) t.treasury += b.reward; } });
  }

  /* ---------------- heroes ---------------- */
  const CLASSES = ['Fighter', 'Rogue', 'Barbarian', 'Wizard', 'Cleric', 'Paladin'];
  const XPL = [0, 12, 30, 60, 100, 160, 240, 350, 500];
  function makeHero(n, S, why) {
    if (n.hero) return;
    const best = n.stats.indexOf(Math.max(...n.stats));
    let cls = CLASSES[best]; if (best === 1 && n.stats[4] >= 13) cls = 'Ranger'; if (best === 4 && rnd() < 0.35) cls = 'Druid';
    const old = n.job;
    n.hero = { cls, level: 1, xp: 0, renown: 0, since: W.day, origin: why };
    n.job = D.hero; if (n.ambition && /hero/i.test(n.ambition)) n.ambition = null;
    log('trigger', `A hero rises in ${S.name}: ${nm(n)}, ${art(n.race)} ${n.race} ${old}, takes up arms as a ${cls.toLowerCase()} ${why}.`, { town: S.id }, { kind: 'hero', data: { name: nm(n), cls } });
    hist(n, `Becomes a hero (${cls})`); mark(n, 'became hero', `Took up arms as a ${cls.toLowerCase()} ${why}`);
  }
  function heroXP(n, x) { const h = n.hero; h.xp += x; h.renown += x; while (h.level < XPL.length && h.xp >= XPL[h.level]) { h.level++; log(h.level >= 5 ? 'trigger' : 'notable', `${nm(n)} the ${h.cls.toLowerCase()} reaches level ${h.level}.`, { town: n.town }, { kind: 'level', key: h.level >= 5 ? `lvl5:${n.id}` : null }); } }
  function maybeVeteranHero(n, S) { if (S && !n.hero && !n.child && !n.figure && n.wins >= 3 && rnd() < 0.5) makeHero(n, S, 'after surviving one fight too many'); }

  /* ---------------- parties ---------------- */
  const SPEED = 24;
  function roadPath(fromId, toId) {
    const dd = new Map([[fromId, 0]]), prev = new Map(), q = new Set(W.towns.map(t => t.id));
    while (q.size) {
      let u = null, best = Infinity; for (const id of q) { const d = dd.get(id) ?? Infinity; if (d < best) { best = d; u = id; } }
      if (u == null || best === Infinity) break; q.delete(u); if (u === toId) break;
      for (const r of W.roads) { const o = r.a === u ? r.b : r.b === u ? r.a : null; if (o == null || !q.has(o)) continue; const nd = best + r.len; if (nd < (dd.get(o) ?? Infinity)) { dd.set(o, nd); prev.set(o, u); } }
    }
    if (!dd.has(toId)) return null;
    const ids = [toId]; while (ids[0] !== fromId) ids.unshift(prev.get(ids[0]));
    return { pts: ids.map(id => { const t = townById(id); return { x: t.x, y: t.y }; }), len: dd.get(toId) };
  }
  const neighbours = S => W.roads.filter(r => r.a === S.id || r.b === S.id).map(r => townById(r.a === S.id ? r.b : r.a)).filter(t => t && t.npcs.length);
  function reachable(S, max = 900) { return W.towns.filter(t => t !== S && t.npcs.length).map(t => ({ t, r: roadPath(S.id, t.id) })).filter(o => o.r && o.r.len <= max).sort((a, b) => a.r.len - b.r.len); }
  function startParty(S, type, members, dest, extra = {}) {
    members = [...new Set(members.filter(Boolean))];
    if (!members.length) return null;
    let pts;
    if (dest.town != null) { const r = roadPath(S.id, dest.town); if (!r) return null; pts = r.pts; }
    else if (dest.zone != null) { const z = zoneById(dest.zone); pts = [{ x: S.x, y: S.y }, { x: z.x + (rnd() - 0.5) * z.r * 0.6, y: z.y + (rnd() - 0.5) * z.r * 0.6 }]; }
    else pts = [{ x: S.x, y: S.y }, dest.pt];
    members.forEach(n => { removeFromTown(S, n, true); n.action = 'travel'; n.doing = extra.doing || 'Travelling'; hist(n, extra.doing || 'Sets out'); });
    const Pt = { id: W.nextParty++, type, members, home: S.id, dest, pts, seg: 0, pos: { ...pts[0] }, state: 'out', hours: 0, cargo: {}, coin: 0, met: [], ...extra };
    W.parties.push(Pt);
    return Pt;
  }
  function moveParty(Pt) {
    let left = SPEED;
    while (left > 0 && Pt.seg < Pt.pts.length - 1) { const b = Pt.pts[Pt.seg + 1], d = dist(Pt.pos, b); if (d <= left) { Pt.pos = { ...b }; Pt.seg++; left -= d; } else { Pt.pos.x += (b.x - Pt.pos.x) / d * left; Pt.pos.y += (b.y - Pt.pos.y) / d * left; left = 0; } }
    // they see what they pass
    for (const z of W.zones) if (dist(Pt.pos, z) < z.r + 25) Pt.members.forEach(n => observe(n, z));
    if (Pt.seg >= Pt.pts.length - 1) arrive(Pt);
  }
  function roadDanger(Pt) {
    for (const p of W.pops) {
      if (!isHostile(p) || Pt.state === 'done' || !Pt.members.length) continue;
      const z = zoneOf(p); if (!z || dist(Pt.pos, z) > z.r + 30 || Pt.target === p.id) continue;
      let chance = 0.03 * p.aggro * Math.min(1.5, p.count / 5) * (0.6 + p.mem.road);
      if (def(p).recruits && (Pt.type === 'caravan' || Pt.type === 'import')) chance *= 2.5;
      if (solo(p)) chance *= 0.6;
      if (rnd() < chance) ambush(Pt, p, z);
    }
  }
  function ambush(Pt, p, z) {
    const home = townById(Pt.home);
    const res = battle([...Pt.members], p, `on the road near ${z.name}`, home);
    if (home) noteThreat(home, p, res.killed.length ? 'death' : 'attack');
    const trade = Pt.type === 'caravan' || Pt.type === 'import';
    if (!res.win && trade) { if (def(p).raids) { p.loot += Pt.coin + Object.values(Pt.cargo).reduce((s, q) => s + q * 2, 0); p.fedLoot = (p.fedLoot || 0) + Object.values(Pt.cargo).reduce((s, q) => s + q, 0) + 2; if (def(p).recruits && rnd() < 0.3) p.count += 1; } if (p.chief) p.raids = (p.raids || 0) + 1; Pt.coin = 0; Pt.cargo = {}; }
    p.mem.road = clamp(p.mem.road + (res.win ? -0.2 : 0.2 + res.killed.length * 0.1), 0, 1.5);
    const what = trade ? 'caravan' : Pt.type === 'migrants' ? 'band of migrants' : 'party';
    log(res.killed.length || !res.win ? 'notable' : 'minor', res.win ? `A ${what} from ${home?.name || 'the road'} ${p.count <= 0.5 ? 'destroys' : 'beats off'} ${popName(p, true)} near ${z.name}.`
      : `${popName(p)} ${v(p, 'ambush', 'ambushes')} a ${what} from ${home?.name || 'the road'} near ${z.name}${res.killed.length ? `. ${res.killed.length} dead` : ''}${def(p).raids && trade ? ', and the goods are taken' : ''}.`, { zone: z.id, town: home?.id }, { kind: 'ambush', data: { foe: popName(p), zone: z.name } });
    if (!Pt.members.length) { Pt.state = 'done'; closeCase(Pt, 0); return; }
    if (!res.win && Pt.state !== 'back') turnBack(Pt);
  }
  function turnBack(Pt) { const home = townById(Pt.home); if (!home) { Pt.state = 'done'; return; } Pt.state = 'back'; const r = Pt.at != null ? roadPath(Pt.at, home.id) : null; Pt.pts = r ? r.pts : [{ ...Pt.pos }, { x: home.x, y: home.y }]; if (r) Pt.pts[0] = { ...Pt.pos }; Pt.seg = 0; }
  function closeCase(Pt, val) { if (!Pt.case) return; const S = townById(Pt.home); if (S) learnCase(S, Pt.case, val); Pt.case = null; }
  function arrive(Pt) {
    const home = townById(Pt.home);
    if (Pt.state === 'back') {
      if (home && (home.sacked || !home.npcs.length) && Pt.members.length) { cameHomeToRuins(Pt, home); Pt.state = 'done'; return; }
      if (home && home.npcs !== undefined) {
        Pt.members.forEach(n => { addToTown(home, n, true); hist(n, 'Returns home'); });
        for (const [g, q] of Object.entries(Pt.cargo)) if (q > 0.05) sell(home, Pt.type === 'caravan' ? (Pt.members[0]?.id ?? 'T' + home.id) : 'T' + home.id, g, q);
        if (Pt.type === 'import') home.treasury += Pt.coin; else if (Pt.members[0]) Pt.members[0].coin += Pt.coin;
        if (Pt.onReturn) log(Pt.onLevel || 'notable', Pt.onReturn, { town: home.id }, { kind: Pt.type });
        if (Pt.case) {
          let val = 0.5;
          if (Pt.type === 'forage') val = clamp(Pt.gotMeals / Math.max(4, Pt.expect * 0.3), 0, 1);
          else if (Pt.type === 'import') val = Pt.gotMeals > 0 ? 1 : 0.1;
          else if (Pt.type === 'explore') { const fresh = Pt.members.flatMap(n => n.know).filter(it => it.t === 'res' && it.day >= Pt.start && D.sources[it.src]?.food > 0 && !home.ledger[it.k]).length; val = fresh ? 1 : 0.4; }
          closeCase(Pt, val);
        }
      }
      Pt.state = 'done'; return;
    }
    const dest = Pt.dest.town != null ? townById(Pt.dest.town) : null;
    if (dest) {                          // visiting a town: see its market, hear its news
      Pt.at = dest.id;
      Pt.members.forEach(n => { observeMarket(n, dest); Object.values(dest.ledger).filter(x => x.t === 'news' || x.t === 'danger').sort((a, b) => b.day - a.day).slice(0, 4).forEach(x => learn(n, { ...x, conf: x.w * 0.9, hops: (x.hops || 0) + 1 })); });
      const locals = dest.npcs.slice(0, 6); Pt.members.forEach(n => { const o = pick(locals); if (o) { gossip(n, o); } });
    }
    switch (Pt.type) {
      case 'migrants': if (dest) { Pt.members.forEach(n => { addToTown(dest, n, true); hist(n, `Settles in ${dest.name}`); }); log('notable', `${Pt.members.length} ${Pt.members.length > 1 ? 'people' : 'person'} from ${home?.name || 'the road'} settle in ${dest.name}${Pt.why ? `, ${Pt.why}` : ''}.`, { town: dest.id }, { kind: 'migrants' }); } Pt.state = 'done'; break;
      case 'founders': foundTown(Pt); break;
      case 'caravan': if (dest) { for (const [g, q] of Object.entries(Pt.cargo)) sell(dest, Pt.members[0]?.id ?? 'T' + Pt.home, g, q); Pt.cargo = {}; } turnBack(Pt); break;
      case 'import': {
        let got = 0; const purse = { coin: Pt.coin };
        if (dest) while (purse.coin > 0 && foodDays(dest) > 2 && got < 80) { const c = cheapestFood(dest, purse.coin); if (!c || !buy(dest, c.g, purse)) break; Pt.cargo[c.g] = (Pt.cargo[c.g] || 0) + 1; got += good(c.g).food / 45; }
        Pt.coin = purse.coin; Pt.gotMeals = got;
        Pt.onReturn = got ? `A caravan returns to ${home?.name} with ${Math.round(got)} meals of food bought in ${dest?.name}.` : `The food caravan returns to ${home?.name} empty-handed. ${dest?.name} had nothing to spare.`;
        if (dest && !got) home && merge(home, { t: 'market', town: dest.id, fd: +foodDays(dest).toFixed(1), prices: {}, day: W.day, conf: 1, hops: 0 }, 'witness');
        turnBack(Pt); break; }
      case 'scout_town': Pt.onReturn = `Scouts return to ${home?.name} from ${dest?.name} with news of its market.`; Pt.onLevel = 'minor'; turnBack(Pt); break;
      case 'aid': { Pt.type = 'hunt'; Pt.state = 'out'; const p = popById(Pt.target); if (!p) { turnBack(Pt); break; } const z = zoneOf(p); Pt.pts = [{ ...Pt.pos }, { x: z.x, y: z.y }]; Pt.seg = 0; Pt.dest = { zone: z.id }; break; }
      default: Pt.state = Pt.type === 'forage' ? 'forage' : Pt.type === 'explore' ? 'explore' : 'search'; Pt.hours = 0;
    }
  }
  function cameHomeToRuins(Pt, home) {
    const ruin = W.zones.find(z => z.townRuin === home.id);
    const dest = W.towns.filter(t => t.npcs.length && t.region === home.region && !t.sacked).sort((a, b) => dist(a, home) - dist(b, home))[0];
    const names = Pt.members.map(nm), many = names.length > 1;
    log('trigger', `${names.join(', ')} ${many ? 'come' : 'comes'} home to ${home.name} and ${many ? 'find' : 'finds'} it ${home.sacked ? 'burned to the ground' : 'empty'}.`, { town: home.id }, { kind: 'ruin-return', history: true, who: Pt.members.map(n => n.id) });
    for (const n of [...Pt.members]) {
      mark(n, 'came home to ruins', `Came home to find ${home.name} ${home.sacked ? 'burned' : 'empty'}`, { ab: home.sackedBy || null });
      if (n.arc && !n.arc.done) { toFigure(null, n, ruin || zoneById(home.wilds[0])); n.arc.home = home.id; continue; }
      if (dest) { addToTown(dest, n, true); hist(n, `Settles in ${dest.name}`); } else { n.dead = true; IDX.delete(n.id); }
    }
    Pt.members = [];
  }
  function partyHour(Pt) {
    Pt.members = Pt.members.filter(n => !n.dead);
    if (!Pt.members.length && Pt.state !== 'done') { Pt.state = 'done'; closeCase(Pt, 0); return; }
    Pt.members.forEach(n => { setNeed(n, 'eat', x => x + 1); setNeed(n, 'sleep', x => x + (W.hour >= 22 || W.hour < 6 ? -6 : 1)); if (n.injured) n.injured--; if (n.sick) n.sick--; });
    // travellers who meet share what they know
    for (const o of W.parties) if (o !== Pt && o.state !== 'done' && !Pt.met.includes(o.id) && o.members.length && dist(o.pos, Pt.pos) < 30) {
      Pt.met.push(o.id); o.met.push(Pt.id);
      const a = Pt.members[0], b = o.members[0]; for (let i = 0; i < 3; i++) { gossip(a, b); gossip(b, a); }
      log('minor', `Travellers from ${townById(Pt.home)?.name} and ${townById(o.home)?.name} meet on the road and trade news.`, { town: Pt.home });
    }
    if (Pt.state === 'out' || Pt.state === 'back') { moveParty(Pt); if (Pt.state !== 'done') roadDanger(Pt); return; }
    Pt.hours++;
    const home = townById(Pt.home), z = zoneById(Pt.dest.zone);
    if (Pt.state === 'explore') { Pt.members.forEach(n => observe(n, z)); roadDanger(Pt); if (Pt.hours >= 6) { Pt.onReturn = `Scouts return to ${home?.name} from ${z.name}.`; Pt.onLevel = 'minor'; turnBack(Pt); } return; }
    if (Pt.state === 'forage') {
      const srcs = W.pops.filter(p => p.zone === z.id && !isHostile(p) && def(p).food > 0 && p.count >= 0.5);
      for (const p of srcs) {
        const d = def(p), avail = clamp(p.count / Math.max(5, d.cap * 0.5), 0.05, 1.3);
        const q = Pt.members.length * 1.4 * avail / srcs.length * (d.kind === 'animal' && season() === 'winter' ? 0.6 : 1);
        p.count = Math.max(0, p.count - q * d.per); p._lost = (p._lost || 0) + q * d.per; Pt.cargo[d.gives] = (Pt.cargo[d.gives] || 0) + q; Pt.gotMeals = (Pt.gotMeals || 0) + q * d.food / 45;
      }
      Pt.members.forEach(n => observe(n, z));
      roadDanger(Pt);
      if (Pt.hours >= 12) { Pt.onReturn = `Foragers return to ${home?.name} with ${Math.round(Pt.gotMeals || 0)} meals of food from ${z.name}.`; turnBack(Pt); }
      return;
    }
    // hunting a population
    const p = popById(Pt.target);
    if (!p) { Pt.onReturn = `The ${Pt.type === 'bounty' ? 'bounty hunters' : 'hunting party'} return to ${home?.name}: their quarry is gone.`; closeCase(Pt, 0.6); turnBack(Pt); return; }
    if (p.zone !== z.id) {
      Pt.members.forEach(n => observe(n, z));
      const nz = zoneOf(p);
      if (Pt.followed || !nz) { Pt.onReturn = `The hunters return to ${home?.name}. ${popName(p)} slipped away.`; closeCase(Pt, 0.3); turnBack(Pt); return; }
      Pt.followed = true; Pt.state = 'out'; Pt.dest = { zone: nz.id }; Pt.pts = [{ ...Pt.pos }, { x: nz.x, y: nz.y }]; Pt.seg = 0; return;
    }
    if (rnd() < 0.3) {
      const names = Pt.members.map(nm);
      const res = battle([...Pt.members], p, `in ${z.name}`, home);
      if (home) noteThreat(home, p, res.killed.length ? 'death' : 'attack');
      if (res.win) {
        const b = W.bounties.find(b => b.id === Pt.bounty && !b.claimed);
        let reward = '';
        if (b) { b.claimed = true; b.done = true; const share = b.reward / Math.max(1, res.survivors.length); res.survivors.forEach(n => { n.coin += share; if (n.hero) n.hero.renown += 10; }); reward = ` They claim ${b.reward} coin.`; }
        if (p.count <= 0 && p.hoard > 1) { const share = p.hoard / Math.max(1, res.survivors.length); res.survivors.forEach(n => n.coin += share); reward += ` They carry home ${Math.round(p.hoard)} coin from its hoard.`; p.hoard = 0; }
        if (p.count <= 0 && def(p).solo && def(p).power >= 20) { const t = `the ${title(p.def).replace(/\s+/g, '')}slayer`; res.survivors.filter(n => !n.title).forEach(n => n.title = t); }
        const many = names.length > 1;
        log(p.count > 0 ? 'notable' : 'trigger', `${names.join(', ')} ${p.count > 0 ? `${many ? 'beat' : 'beats'} back ${popName(p, true)} in ${z.name}, ${res.foeLost} slain` : `${many ? 'destroy' : 'destroys'} ${popName(p, true)} of ${z.name}`}.${reward}${res.killed.length ? ` ${res.killed.map(nm).join(', ')} did not survive.` : ''}`, { zone: z.id, town: home?.id }, { kind: p.count > 0 ? 'beaten' : 'slain', data: { foe: popName(p), zone: z.name } });
        closeCase(Pt, p.count > 0 ? 0.7 : 1);
        if (p.count > 0 && !b) Pt.hours = Math.max(Pt.hours, 18);
        if (p.count <= 0 || b || Pt.hours >= 18) turnBack(Pt);
      } else {
        log('trigger', `${popName(p)} of ${z.name} ${v(p, 'overwhelm', 'overwhelms')} the ${Pt.type === 'bounty' ? 'bounty hunters' : 'hunting party'} from ${home?.name}.${res.killed.length ? ` ${res.killed.map(nm).join(', ')} ${res.killed.length > 1 ? 'are' : 'is'} dead.` : ''} ${v(p, 'They grow', 'It grows')} bolder.`, { zone: z.id, town: home?.id }, { key: `fail:${p.id}`, repeat: 'notable', kind: 'huntfail', data: { foe: popName(p), zone: z.name } });
        p.aggro = Math.min(3, p.aggro + 0.4); if (home) home.failed = W.day;
        closeCase(Pt, 0); turnBack(Pt);
      }
    } else if (Pt.hours >= 30) { Pt.onReturn = `The hunters return to ${home?.name} without finding ${popName(p, true)}.`; closeCase(Pt, 0.3); turnBack(Pt); }
  }

  /* ---------------- secret ambitions ---------------- */
  function resolveAmbition(S, n) {
    const a = n.ambition || ''; n.secret = 0; n.ambition = null;
    const z = zoneById(S.wilds[0]), ref = { town: S.id };
    const darkDef = Object.values(D.sources).find(s => s.summoned) || Object.values(D.sources).find(s => s.dark);
    if (/forbidden magic|dark power|worship|immortal/i.test(a) && darkDef) {
      removeFromTown(S, n); n.dead = true; IDX.delete(n.id);
      const p = spawnPop(darkDef.name, z, ri(3, 5), true); if (p) { p.leader = n.first; p.aggro = 1; }
      W.weird = Math.min(10, W.weird + 1.5);
      log('trigger', `${nm(n)} walks into ${z.name} and does not come back. Something comes out instead: ${p ? popName(p, true) : 'shadows'}.`, ref, { kind: 'dark', data: { name: nm(n), zone: z.name } });
    } else if (/cursed/i.test(a)) {
      const m = D.mutations.find(m => m.tag === 'curse');
      kill(n, 'turns under the full moon and flees into the wilds', S, z);
      if (m) { let p = W.pops.find(p => p.zone === z.id && p.tags.includes('curse')) || spawnPop(m.of, z, 1, true); if (p) { p.count += 1; if (!p.tags.includes('curse')) { p.tags.push('curse'); p.mutation = m.becomes; p.mult = Math.max(p.mult, m.power); } } }
      S.fear = Math.min(10, S.fear + 4);
      log('trigger', `${S.name} learns there was a monster among them.`, ref, { kind: 'dark' });
    } else if (/hero/i.test(a)) makeHero(n, S, 'after years of dreaming of it');
    else if (/found a new town/i.test(a)) {
      const followers = S.npcs.filter(o => o !== n && !o.hero && !o.child && (o.home == null || o.coin < 10 || ['freedom', 'adventure'].includes(P(o.want)))).slice(0, ri(3, 6));
      const spt = freeSpot(W.regions.find(r => r.id === S.region));
      if (!spt || followers.length < 3) { log('notable', `${nm(n)} talks of founding a new town, but nobody in ${S.name} will follow.`, ref); return; }
      const Pt = startParty(S, 'founders', [n, ...followers], { pt: spt }, { doing: 'Setting out to found a town', leaderName: nm(n) });
      if (Pt) Pt.members.forEach(m => freeHome(S, m));
      log('trigger', `${nm(n)} leads ${followers.length} people out of ${S.name} to found a new town.`, ref, { kind: 'exodus', data: { name: nm(n) } });
    } else if (/overthrow/i.test(a)) {
      const noble = S.npcs.find(o => prof(o).provides.includes('order') && o !== n);
      if (noble) { removeFromTown(S, noble); IDX.delete(noble.id); noble.dead = true; n.job = noble.job; const seized = S.treasury * 0.5; S.treasury -= seized; n.coin += seized; log('trigger', `${nm(n)} overthrows ${nm(noble)} and seizes ${S.name}. Half the treasury goes with them.`, ref, { kind: 'coup', data: { name: nm(n) } }); }
      else { const ord = Object.values(D.professions).find(p => p.provides.includes('order')); if (ord) n.job = ord.name; log('trigger', `${nm(n)} declares themself lord of ${S.name}. Nobody stops them.`, ref, { kind: 'coup', data: { name: nm(n) } }); }
    } else if (/relic/i.test(a)) {
      const ruins = W.zones.find(zz => zz.region === S.region && (zz.terrains.includes('ruins') || zz.tags.includes('ruins')));
      n.coin += 60; n.inv.weapon = 1; n.xp += 20;
      log('trigger', `${nm(n)} of ${S.name} returns from ${ruins ? ruins.name : 'the wilds'} with a relic.`, ref, { kind: 'relic', data: { name: nm(n) } });
      const riser = Object.values(D.sources).find(s => s.rises === 'deaths');
      if (ruins && riser && rnd() < 0.5) { spawnPop(riser.name, ruins, ri(3, 6)); W.weird = Math.min(10, W.weird + 1); log('notable', `Something woke in ${ruins.name} when the relic was taken.`, { zone: ruins.id }, { kind: 'omen' }); }
    } else if (/tame/i.test(a)) {
      const beast = W.pops.find(p => S.wilds.includes(p.zone) && isHostile(p) && def(p).eats.length);
      if (beast) { beast.tags.push('tame'); beast.aggro = 0; log('trigger', `${nm(n)} of ${S.name} has tamed ${popName(beast, true)} of ${zoneOf(beast).name}. They no longer hunt the town.`, ref, { kind: 'tame' }); }
      else log('notable', `${nm(n)} of ${S.name} raises an orphaned wild cub.`, ref);
    } else if (/revenge/i.test(a)) becomeOutlaw(S, n, 'swearing revenge');
    else if (/end/i.test(a)) { S.fear = Math.min(10, S.fear + 3); W.weird = Math.min(10, W.weird + 1); log('trigger', `${nm(n)}'s doom-preaching takes hold in ${S.name}. People are frightened.`, ref, { kind: 'doom' }); }
    else if (/hoard|wealth/i.test(a)) { n.coin += 40; log('notable', `${nm(n)} of ${S.name} is suddenly, quietly rich. Nobody knows how.`, ref, { kind: 'rich' }); }
    else log('trigger', `${nm(n)} of ${S.name} achieves their secret ambition: ${a}. What happens now?`, ref, { kind: 'secret' });
  }
  function freeSpot(R, near) {
    for (let i = 0; i < 400; i++) {
      const p = near ? { x: near.x + (rnd() - 0.5) * (near.r * 2 + 160), y: near.y + (rnd() - 0.5) * (near.r * 2 + 160) } : { x: R.ox + 60 + rnd() * (RW(R) - 120), y: R.oy + 50 + rnd() * (RH(R) - 100) };
      if (p.x < R.ox + 40 || p.x > R.ox + RW(R) - 40 || p.y < R.oy + 40 || p.y > R.oy + RH(R) - 40 || !onLand(R, p.x, p.y)) continue;
      if (W.zones.some(z => !z.townRuin && dist(z, p) < z.r + 15) || W.towns.some(t => t.npcs.length && dist(t, p) < 120)) continue;
      return p;
    }
    return null;
  }
  function foundTown(Pt) {
    const R = W.regions.find(r => Pt.pos.x >= r.ox && Pt.pos.x < r.ox + RW(r) && Pt.pos.y >= r.oy && Pt.pos.y < r.oy + RH(r)) || W.regions[0];
    const from = townById(Pt.home);
    const old = W.towns.find(t => !t.npcs.length && dist(t, Pt.pos) < 90);
    const S = createTown(R, Pt.pos, { npcs: Pt.members, pop: Pt.members.length, kind: D.settlements.slice().sort((a, b) => a.people[0] - b.people[0])[0], name: old ? `New ${old.name}` : undefined });
    S.bornDay = W.day;
    if (old) { const ruin = W.zones.find(z => z.townRuin === old.id); if (ruin && !W.pops.some(q => q.zone === ruin.id && isHostile(q))) { W.zones = W.zones.filter(z => z !== ruin); W.zones.forEach(o => o.near = (o.near || []).filter(id => id !== ruin.id)); } }
    S.treasury = 50; const staple = D.foodGoods.slice().sort((a, b) => good(a).price - good(b).price)[0]; S.market.stock[staple] = Pt.members.length * 8 * 45 / good(staple).food;
    if (from) Object.values(from.ledger).forEach(x => merge(S, { ...x, conf: x.w * 0.8, hops: (x.hops || 0) + 1 }, 'rumour'));
    const near = W.towns.filter(t => t !== S).sort((a, b) => dist(a, S) - dist(b, S))[0];
    if (near) W.roads.push({ a: S.id, b: near.id, len: dist(S, near) });
    Pt.state = 'done'; closeCase(Pt, 1);
    log('trigger', `${Pt.leaderName || 'Settlers from ' + (from?.name || 'the road')} found${Pt.leaderName ? 's' : ''} a new town: ${S.name}${Pt.why ? `, ${Pt.why}` : ''}.`, { town: S.id }, { kind: 'newtown', data: { town: S.name } });
  }
  function becomeOutlaw(S, n, why) {
    const od = Object.values(D.sources).find(s => s.recruits === 'outlaws'); if (!od) return false;
    const zs = S.wilds.map(zoneById).filter(z => z && od.area.some(a => z.terrains.includes(a)));
    const z = zs[0] || zoneById(S.wilds[0]); if (!z) return false;
    removeFromTown(S, n); n.dead = true; IDX.delete(n.id);
    let p = W.pops.find(p => p.def === od.name && p.chief != null && zoneOf(p)?.region === S.region && dist(zoneOf(p), S) < 400 && p.count < 8) || W.pops.find(p => p.def === od.name && zoneOf(p)?.region === S.region && dist(zoneOf(p), S) < 400);
    if (p) p.count += 1; else { p = spawnPop(od.name, z, 1, true); if (p) p.leader = n.first; }
    if (!p) return false;
    log(p.count === 1 ? 'trigger' : 'notable', p.count === 1 ? `${nm(n)} flees ${S.name} ${why} and turns outlaw in ${zoneOf(p).name}.` : `${nm(n)} leaves ${S.name} ${why} and joins the outlaws in ${zoneOf(p).name} (${Math.round(p.count)} strong).`, { town: S.id }, { kind: 'outlaw', data: { name: nm(n) } });
    return true;
  }


  /* ---------------- families: courting, children, growing up, growing old ---------------- */
  const raceOf = n => D.races[n.race] || { life: [16, 80], names: Object.keys(D.names)[0] };
  const kinLink = n => ({ id: n.id, name: nm(n) });
  const related = (a, b) => (a.kin?.parents || []).some(p => (b.kin?.parents || []).some(q => q.id === p.id)) || (a.kin?.parents || []).some(p => p.id === b.id) || (b.kin?.parents || []).some(p => p.id === a.id);
  function marry(S, a, b, quiet) {
    a.kin.spouse = kinLink(b); b.kin.spouse = kinLink(a);
    const ha = a.home != null ? S.buildings[a.home] : null;
    if (ha?.residents && !ha.residents.includes(b.id) && ha.residents.length < ha.beds + 2) { freeHome(S, b); ha.residents.push(b.id); b.home = ha.id; }
    if (quiet) return;
    mark(a, 'married', `Married ${nm(b)} in ${S.name}`, { who: b.first }); mark(b, 'married', `Married ${nm(a)} in ${S.name}`, { who: a.first });
    log(W.firsts['wed:' + S.id] ? 'minor' : 'notable', `${nm(a)} and ${nm(b)} are married in ${S.name}.`, { town: S.id }, { key: 'wed:' + S.id, repeat: 'minor', kind: 'wedding' });
  }
  function bear(S, a, b) {
    const par = rnd() < 0.5 ? a : b, R = raceOf(par);
    const n = rollNPC(D.laborer);
    const nb = D.names[R.names] || D.names[Object.keys(D.names)[0]];
    n.race = par.race; if (nb?.first?.length) n.first = pick(nb.first); n.last = a.last || b.last;
    n.stats = n.stats.map((x, i) => Math.round((a.stats[i] + b.stats[i]) / 2 + ri(-2, 2)));
    if (rnd() < 0.5) n.personality = pick([a, b]).personality;
    n.age = 0; n.child = true; n.ambition = null; n.coin = 0; n.secret = 0;
    n.kin.parents = [kinLink(a), kinLink(b)];
    a.kin.kids.push(kinLink(n)); b.kin.kids.push(kinLink(n));
    const h = a.home != null ? S.buildings[a.home] : b.home != null ? S.buildings[b.home] : null;
    if (h?.residents) { h.residents.push(n.id); n.home = h.id; }
    addToTown(S, n); if (a.pos) n.pos = { ...a.pos };
    mark(a, 'child born', `${n.first} was born`, { who: n.first }); mark(b, 'child born', `${n.first} was born`, { who: n.first });
    n.life.unshift({ d: W.day, t: 'born', text: `Born in ${S.name} to ${nm(a)} and ${nm(b)}` });
    log('minor', `${nm(a)} and ${nm(b)} of ${S.name} have a child: ${n.first}.`, { town: S.id }, { kind: 'birth' });
    return n;
  }
  function growUp(S, n) {
    n.child = false; n.age = raceOf(n).life[0];
    const pj = (n.kin.parents || []).map(p => IDX.get(p.id)).filter(p => p && D.professions[p.job]?.w > 0 && !p.hero)[0];
    n.job = pj && rnd() < 0.5 ? pj.job : wpick(Object.values(D.professions).filter(p => p.w > 0)).name;
    const amb = wpick(D.lists.ambitions).v; n.ambition = /^(none|nothing)/i.test(amb) ? null : amb;
    ensureWorkplace(S, n);
    // what the family carried, the child carries too
    for (const p of (n.kin.parents || []).map(p => IDX.get(p.id)).filter(Boolean)) for (const [k, g] of Object.entries(p.grudges || {})) if (!n.grudges[k]) n.grudges[k] = { ...g, w: g.w * 0.5, inherited: true };
    mark(n, 'came of age', `Came of age in ${S.name} and became ${art(n.job)} ${n.job}`);
    log('minor', `${nm(n)} of ${S.name} comes of age and becomes ${art(n.job)} ${n.job}.`, { town: S.id }, { kind: 'grown' });
  }
  function familyDawn(S) {
    const Wd = D.world, yr = SEASON_LEN * 4;
    for (const n of [...S.npcs]) {
      if (n.dead) continue;
      if (n.child) { n.age = (W.day - n.born) / Math.max(1, Wd.childhood) * raceOf(n).life[0]; if (W.day - n.born >= Wd.childhood) growUp(S, n); continue; }
      n.age += Wd.aging / yr;
      const old = raceOf(n).life[1];
      if (!n.undying && n.age > old * 0.8 && rnd() < 0.01 * Math.pow(n.age / old, 6)) { kill(n, 'died of old age', S); continue; }
      for (const k of (n.kin?.kids || []).map(k => IDX.get(k.id))) if (k && k.child && k.town === S.id && n.coin > 4) { n.coin -= 1.5; k.coin += 1.5; }
    }
    const single = S.npcs.filter(n => !n.child && !n.dead && !n.quarantined && !(spouseOf(n) && !spouseOf(n).dead) && n.age < raceOf(n).life[1] * 0.7);
    if (single.length >= 2 && rnd() < 0.1 * Wd.courting * (S.fear < 6 ? 1 : 0.4)) {
      const a = pick(single), opts = single.filter(b => b !== a && !related(a, b));
      const b = opts.find(b => b.where === a.where) || (pers(a, 'romantic') || rnd() < 0.5 ? pick(opts) : null);
      if (b) marry(S, a, b);
    }
    const fd = foodDays(S), freeBeds = S.buildings.filter(b => b.type === 'house').reduce((t, b) => t + b.beds - b.residents.length, 0);
    const room = freeBeds > 0 ? 1 : S.slots.length ? 0.4 : 0.1;
    for (const a of [...S.npcs]) {
      const b = spouseOf(a);
      if (!b || b.dead || a.id > b.id || b.town !== S.id || a.child || b.child) continue;
      const fertile = [a, b].every(p => p.age < raceOf(p).life[1] * 0.65);
      const kids = (a.kin.kids || []).filter(k => IDX.get(k.id)).length;
      if (fertile && rnd() < 0.035 * Wd.births * (fd > 2 ? 1 : fd > 1 ? 0.4 : 0.1) * (S.fear < 5 ? 1 : 0.4) * room * (kids < 3 ? 1 : 0.25)) bear(S, a, b);
    }
  }

  /* ---------------- story arcs: the paths lives take ---------------- */
  const regionOfP = n => { if (n.town != null) return townById(n.town)?.region; if (n.zone != null) return zoneById(n.zone)?.region; const Pt = W.parties.find(p => p.members.includes(n)); return Pt ? townById(Pt.home)?.region : null; };
  const band = n => W.pops.find(p => p.chief === n.id) || null;
  function toFigure(S, n, z) {
    if (S) removeFromTown(S, n);
    W.parties.forEach(p => { const i = p.members.indexOf(n); if (i >= 0) p.members.splice(i, 1); });
    n.town = null; n.figure = true; n.zone = z?.id ?? n.zone ?? null; n.action = 'away'; n.doing = z ? `In ${z.name}` : 'On the road';
    W.figures ||= []; if (!W.figures.includes(n)) W.figures.push(n);
  }
  function fromFigure(n, S) {
    W.figures = (W.figures || []).filter(f => f !== n); n.figure = false; n.zone = null;
    if (S && S.npcs.length) { addToTown(S, n, true); return S; }
    const T = W.towns.filter(t => t.npcs.length).sort((a, b) => (a.region === n._r ? 0 : 1) - (b.region === n._r ? 0 : 1))[0];
    if (T) { addToTown(T, n, true); return T; }
    n.dead = true; IDX.delete(n.id); return null;
  }
  function maybeArc(n, tags, daily) {
    if (!W || n.arc || n.child || n.hero || n.dead || !Object.keys(D.arcs).length) return;
    const R = regionOfP(n);
    const active = allPeople().filter(p => p.arc && !p.arc.done && regionOfP(p) === R);
    if (active.length >= 2) return;
    const mine = new Set([...tags, ...scarsOf(n).map(x => x.name)]);
    for (const a of Object.values(D.arcs).sort(() => rnd() - 0.5)) {
      if (!a.starts.some(t => mine.has(t)) || active.some(p => p.arc.name === a.name)) continue;
      if (a.steps.some(st => st.verb === 'hunt grudge') && !Object.keys(n.grudges || {}).length) continue;
      if (!daily && !a.starts.some(t => tags.includes(t))) continue;
      let c = a.chance * (daily ? 0.04 : 1);
      if (a.also.some(x => x === P(n.personality) || x === P(n.want))) c *= 2;
      if (rnd() < c) { startArc(n, a, [...mine].find(t => a.starts.includes(t))); return; }
    }
  }
  function startArc(n, a, why) {
    n.arc = { name: a.name, step: 0, began: W.day, at: W.day, count: 0, why, home: n.town ?? W.parties.find(p => p.members.includes(n))?.home ?? null };
    const S = townById(n.town);
    const e = (n.life || []).find(l => l.t === why || D.scars[why]?.from.includes(l.t));
    log('notable', `${nm(n)}${S ? ` of ${S.name}` : ''} broods on it${e ? `: ${e.text.charAt(0).toLowerCase() + e.text.slice(1)}` : ''}.`, S ? { town: S.id } : {}, { kind: 'arc-start', who: [n.id] });
  }
  function endArc(n, A, how, why) {
    if (!A || A.done) return; A.done = how; A.ended = W.day;
    const S = townById(n.town), ref = S ? { town: S.id } : n.zone != null ? { zone: n.zone } : {};
    if (how === 'avenged') {
      mark(n, 'avenged', why ? `Got their vengeance: ${why}` : 'Got their vengeance');
      log('trigger', `${titled(n)} has their vengeance${why ? `: ${why}` : ''}.`, ref, { kind: 'legend', who: [n.id] });
      if (n.figure) fromFigure(n, townById(A.home));
    }
  }
  function discovered(S, n, A) {
    if (rnd() > 0.035) return false;
    const z = S.wilds.map(zoneById).filter(Boolean).sort((x, y) => (y.terrains.some(t => /ruins|swamp/.test(t)) ? 1 : 0) - (x.terrains.some(t => /ruins|swamp/.test(t)) ? 1 : 0))[0];
    S.fear = Math.min(10, S.fear + 3);
    toFigure(S, n, z);
    log('trigger', `${S.name} finds out what ${nm(n)} has been doing at the graves. ${n.first} flees into ${z.name} before anyone can stop them.`, { town: S.id }, { kind: 'dark', who: [n.id] });
    const riser = Object.values(D.sources).find(s => s.rises === 'deaths');
    if (riser) { const p = spawnPop(riser.name, z, 2, true, true); if (p) { p.chief = n.id; p.leader = n.first; } }
    const a = D.arcs[A.name], i = a.steps.findIndex(s => s.verb === 'raise all'); if (i > A.step) { A.step = i; A.count = 0; A.at = W.day; }
    return true;
  }
  function runStep(n, a, A, st) {
    const S = townById(n.town), b = band(n), here = S ? S.name : zoneById(n.zone)?.name || 'the wilds';
    const ref = S ? { town: S.id } : n.zone != null ? { zone: n.zone } : {};
    switch (st.verb) {
      case 'outlaw': {
        const od = Object.values(D.sources).find(s => s.recruits === 'outlaws') || Object.values(D.sources).find(s => s.raids);
        if (!od) { A.done = 'stalled'; return false; }
        let z = n.zone != null ? zoneById(n.zone) : null;
        if (!z && S) z = S.wilds.map(zoneById).find(zz => zz && od.area.some(t => zz.terrains.includes(t))) || zoneById(S.wilds[0]);
        if (!z) return false;
        const followers = S ? S.npcs.filter(o => o !== n && !o.child && !o.hero && !o.arc && (o.starve > 0 || o.home == null || scar(o, 'outlaw') > 0 || pers(o, 'greedy', 'cynical'))).slice(0, ri(0, 2)) : [];
        followers.forEach(o => { removeFromTown(S, o); o.dead = true; IDX.delete(o.id); });
        toFigure(S, n, z);
        const p = spawnPop(od.name, z, 1 + followers.length, true, true); if (!p) return false;
        p.chief = n.id; p.leader = n.first; p.aggro = 1;
        mark(n, 'turned outlaw', `Took to ${z.name} as an outlaw`);
        log('trigger', `${nm(n)}${S ? ` leaves ${S.name} and` : ''} takes to ${z.name} as an outlaw${followers.length ? `. ${followers.map(nm).join(' and ')} ${followers.length > 1 ? 'go' : 'goes'} too` : ''}.`, { zone: z.id, town: S?.id }, { kind: 'arc', who: [n.id] });
        return true; }
      case 'gather': {
        if (!b) return false;
        const desperate = W.towns.filter(t => t.region === zoneOf(b)?.region && t.npcs.some(o => o.starve > 0 || o.home == null)).length;
        b.count += 0.25 * (b.fedAvg ?? 1) * (1 + desperate * 0.3);
        if (b.count >= Math.min(st.n, 8)) { log('notable', `${nm(n)}'s band in ${zoneOf(b).name} has grown to ${Math.floor(b.count)}. Desperate people go looking for them.`, { zone: b.zone }, { kind: 'arc', who: [n.id] }); return true; }
        return false; }
      case 'raid': {
        if (!b) return false;
        if (A.base == null) A.base = b.raids || 0;
        b.aggro = Math.max(b.aggro, 0.9);
        if (W.day - A.at > 12 && !W.towns.some(t => t.npcs.length && dist(t, zoneOf(b)) - zoneOf(b).r < 170)) {
          const T = W.towns.filter(t => t.npcs.length && t.region === zoneOf(b).region).sort((x, y) => dist(x, zoneOf(b)) - dist(y, zoneOf(b)))[0];
          const nz = T && T.wilds.map(zoneById).filter(Boolean)[0]; if (nz) { b.zone = nz.id; b.movedDay = W.day; }
        }
        return (b.raids || 0) - A.base >= st.n; }
      case 'take ruins': {
        if (!b) return false;
        const z0 = zoneOf(b);
        const ruins = W.zones.filter(z => z.region === z0.region && (z.townRuin != null || z.terrains.includes('ruins') || z.tags.includes('ruins')) && !W.pops.some(q => q !== b && q.zone === z.id && isHostile(q))).sort((x, y) => dist(x, z0) - dist(y, z0));
        const z = ruins[0] || z0, old = z.name;
        b.zone = z.id; b.settled = z.id; b.movedDay = W.day; n.zone = z.id;
        if (!z.renamed) { z.formerly = old; z.renamed = W.day; z.name = `${n.last || n.first}'s Hold`; }
        log('trigger', `${nm(n)} makes ${old} a hideout${z.name !== old ? `. People start calling it ${z.name}` : ''}.`, { zone: z.id }, { kind: 'renamed', who: [n.id] });
        return true; }
      case 'crown': case 'become lich': {
        const lich = st.verb === 'become lich';
        n.title = lich ? 'the Lich' : (a.title || 'the Bold');
        if (b) { b.leader = titled(n); b.mult *= lich ? 1.3 : 1.15; if (lich && !b.tags.includes('dark')) { b.tags.push('dark'); W.weird = Math.min(10, W.weird + 2); } }
        if (lich) n.undying = true;
        log('trigger', lich ? `${nm(n)} is no longer quite alive. Around ${here} they call ${n.first} ${n.title} now.` : `${nm(n)} now calls themself ${titled(n)}.${b ? ` ${Math.floor(b.count)} outlaws in ${zoneOf(b).name} answer to the name.` : ''}`, ref, { kind: 'arc', who: [n.id] });
        return true; }
      case 'study': {
        if (!S) return true;
        A.count++;
        if (A.count % 2 === 0) log('notable', pick([`Someone has been digging at the old graves of ${S.name}.`, `A lamp burns all night in a house in ${S.name}.`, `The dogs of ${S.name} will not go near one house.`, `Grave dirt is found on a doorstep in ${S.name}.`]), { town: S.id }, { kind: 'omen' });
        W.weird = Math.min(10, W.weird + 0.1);
        if (discovered(S, n, A)) return false;
        return A.count >= st.n; }
      case 'raise one': {
        const lost = n.desire?.text?.match(/see (.+?) again/)?.[1] || n.life.find(l => /^lost/.test(l.t))?.who || 'the one they lost';
        n.raised = lost; W.weird = Math.min(10, W.weird + 0.5);
        log('trigger', `${lost} has been seen at a window in ${here}, weeks after the burial. ${nm(n)} says it is grief playing tricks.`, ref, { kind: 'dark', who: [n.id] });
        return true; }
      case 'hide': if (S && discovered(S, n, A)) return false; return ++A.count >= st.n;
      case 'raise all': {
        const riser = Object.values(D.sources).find(s => s.rises === 'deaths') || Object.values(D.sources).find(s => s.dark);
        if (!riser) { A.done = 'stalled'; return false; }
        const T = S || townById(A.home);
        if (!A.count) A.deaths0 = T ? T.deaths : 0;
        A.count++;
        const dead = T ? T.deaths - A.deaths0 : 0;
        if (dead < 3 && A.count < 40) return false;
        const z = n.zone != null ? zoneById(n.zone) : zoneById(T?.wilds[0]);
        if (!z) return false;
        const k = clamp(dead + 1, 3, 8);
        if (S) toFigure(S, n, z);
        let p = b; if (!p) { p = spawnPop(riser.name, z, k, true, true); if (!p) return false; p.chief = n.id; p.leader = n.first; } else p.count += k;
        p.aggro = 1.5; W.weird = Math.min(10, W.weird + 2);
        log('trigger', `${nm(n)} could not let them go. The dead of ${T?.name || 'the valley'} claw out of their graves and follow ${n.first} into ${z.name}.`, { zone: z.id, town: T?.npcs.length ? T.id : undefined }, { kind: 'undead', who: [n.id] });
        return true; }
      case 'train': {
        if (S) n.xp += 3; A.count++;
        if (A.count >= st.n && S && !n.hero && rnd() < 0.5) makeHero(n, S, n.desire?.ab ? `to make ${n.desire.ab.name} pay` : 'for vengeance');
        return A.count >= st.n; }
      case 'hunt grudge': {
        const g = Object.entries(n.grudges || {}).sort((x, y) => y[1].w - x[1].w)[0];
        if (!g) { endArc(n, A, 'avenged'); return false; }
        const [k, gr] = g;
        if (isHeroes(k)) {
          if (!A.sworn) { A.sworn = W.day; if (S) toFigure(S, n, zoneById(S.wilds[0])); log('trigger', `${nm(n)} has sworn to find ${gr.name}. ${n.first} sells everything and takes to the road.`, ref, { kind: 'arc', who: [n.id] }); }
          return false;            // the heroes are yours: you decide how this one ends
        }
        if (k.startsWith('town:')) {
          const T = townById(+k.slice(5));
          if (!T || !T.npcs.length) { endArc(n, A, 'avenged', `${gr.name} is no more`); return false; }
          if (S !== T || rnd() > 0.1) return false;
          const v = T.npcs.find(o => o !== n && prof(o).provides.includes('order')) || T.npcs.find(o => o !== n && fightsJob(o));
          if (v) kill(v, `was murdered by ${nm(n)}, in revenge`, T, null, { k: 'npc:' + n.id, name: nm(n) });
          toFigure(T, n, zoneById(T.wilds[0])); T.fear = Math.min(10, T.fear + 3);
          endArc(n, A, 'avenged', v ? `${nm(v)} is dead` : `${T.name} paid in blood`);
          return false;
        }
        const target = k.startsWith('pop:') ? popById(+k.slice(4)) : null;
        if (!target) { endArc(n, A, 'avenged', `${gr.name} ${D.sources[gr.def]?.solo ? 'is' : 'are'} gone`); return false; }
        if (!S || W.day - (A.tried ?? -99) < 4) return false;
        A.tried = W.day;
        const pals = eligible(S, 2, 2, o => o !== n && !o.hero && fighterish(o));
        const Pt = startParty(S, 'hunt', [n, ...pals], { zone: target.zone }, { target: target.id, doing: `Hunting ${popName(target, true)} for revenge` });
        if (Pt) log('notable', `${nm(n)} sets out from ${S.name} after ${popName(target, true)}${pals.length ? `, with ${pals.map(nm).join(' and ')}` : ', alone'}.`, { town: S.id }, { kind: 'quest', who: [n.id] });
        return false; }
      case 'wait': return ++A.count >= st.n;
      case 'found town': {
        const R = W.regions.find(r => r.id === regionOfP(n)) || W.regions[0];
        const zr = zoneById(n.zone), ruin = zr?.townRuin != null ? zr : null;
        const spot = ruin ? { x: ruin.x, y: ruin.y } : freeSpot(R);
        if (!spot) return false;
        const pool = W.towns.filter(t => t.region === R.id && t.npcs.length > 8).flatMap(t => t.npcs.filter(o => !o.child && !o.hero && !o.arc && (o.home == null || o.coin < 6 || o.life?.some(l => ['town sacked', 'fled', 'came home to ruins'].includes(l.t)))).map(o => [t, o])).sort(() => rnd() - 0.5).slice(0, ri(4, 7));
        if (pool.length < 3) { if (++A.count > 30) A.done = 'gave up'; return false; }
        pool.forEach(([t, o]) => { removeFromTown(t, o); hist(o, `Answers ${n.first}'s call`); });
        if (S) removeFromTown(S, n);
        W.figures = (W.figures || []).filter(f => f !== n); n.figure = false; n.zone = null;
        const Pt = { members: [n, ...pool.map(x => x[1])], pos: spot, home: A.home, leaderName: nm(n), why: ruin ? 'on the ashes of the old town' : `answering ${n.first}'s call`, state: 'out' };
        foundTown(Pt);
        n.title = n.title || a.title || null;
        A.done = 'founded'; A.ended = W.day;
        return true; }
    }
    return true;
  }
  function arcEnds(n, a, A) {
    const b = band(n);
    if (a.ends.includes('betrayed') && b && n.figure && A.step >= 2 && (b.count >= 7 || (b.fedAvg ?? 1) < 0.45) && rnd() < 0.015) {
      const z = zoneOf(b); A.done = 'betrayed'; A.ended = W.day;
      b.chief = null; const nb = D.names[raceOf(n).names]; b.leader = pick(nb?.first?.length ? nb.first : ALPHA);
      kill(n, `was knifed in the night by one of their own band`, null, z);
      log('notable', `${b.leader} leads the outlaws of ${z.name} now.`, { zone: z.id }, { kind: 'legend' });
      return true;
    }
    if (a.ends.includes('pardoned') && b && A.step >= 3 && rnd() < 0.025) {
      const T = W.towns.filter(t => t.npcs.length > 6 && t.region === zoneOf(b)?.region && t.threats[b.id] && t.treasury > 40).sort((x, y) => y.treasury - x.treasury)[0];
      if (T) {
        const z = zoneOf(b); A.done = 'pardoned'; A.ended = W.day; T.treasury -= 30;
        b.chief = null; removePop(b, null);
        fromFigure(n, T); changeJob(T, n, D.guard, 'pardoned', true); n.changed = W.day;
        mark(n, 'redeemed', `Pardoned by ${T.name} and given a post in the watch`);
        log('trigger', `${T.name} offers ${titled(n)} a pardon and a post in the watch. ${n.first} takes it, and the band in ${z?.name || 'the wilds'} scatters.`, { town: T.id }, { kind: 'legend', who: [n.id] });
        return true;
      }
    }
    if (a.ends.includes('redeemed') && A.step >= 1 && rnd() < 0.006 * (W.towns.some(t => t.npcs.some(o => prof(o).provides.includes('faith'))) ? 1 : 0.3)) {
      const z = b ? zoneOf(b) : null; A.done = 'redeemed'; A.ended = W.day;
      if (b) { b.chief = null; removePop(b, null); }
      const T = n.figure ? fromFigure(n, townById(A.home)) : townById(n.town);
      if (!T) return true;
      mark(n, 'redeemed', `Laid ${n.raised || 'the dead'} to rest`);
      log('trigger', `${titled(n)} lays ${n.raised || 'the dead'} to rest at last${z ? `, and the dead of ${z.name} sink back into the earth` : ''}. ${n.first} lives quietly in ${T.name} now.`, { town: T.id }, { kind: 'legend', who: [n.id] });
      n.raised = null; return true;
    }
    return false;
  }
  function reign(n, a, A) {
    const b = band(n);
    if (!b) { if (!n.figure) { A.done = A.done || 'lived it'; A.ended = W.day; } return; }
    b.aggro = Math.max(b.aggro, 0.6);
    if ((b.fedAvg ?? 1) > 0.6 && !def(b).rises) b.count += 0.05;
  }
  function arcDawn() {
    for (const n of allPeople()) {
      if (n.dead) continue;
      if (!n.arc) { if (!n.child && rnd() < 0.5 && scarsOf(n).length) maybeArc(n, [], true); continue; }
      const A = n.arc; if (A.done) continue;
      const a = D.arcs[A.name]; if (!a) { A.done = 'forgotten'; continue; }
      if (W.parties.some(p => p.members.includes(n))) continue;
      const b = band(n); if (b) n.zone = b.zone;
      if (arcEnds(n, a, A)) continue;
      const st = a.steps[A.step];
      if (!st) { reign(n, a, A); continue; }
      if (runStep(n, a, A, st) && !A.done) { A.step++; A.at = W.day; A.count = 0; A.base = null; }
    }
  }

  /* ---------------- plague: bites that turn ---------------- */
  function turn(S, n) {
    const I = n.infected, z = zoneById(S.wilds[0]);
    const mates = n.quarantined ? [] : S.npcs.filter(o => o !== n && o.where === n.where && !o.infected);
    kill(n, 'died of the bite', S, z, { k: 'pop:' + I.pop, def: I.src, name: `the ${I.src}` });
    let p = popById(I.pop); if (p && p.def === I.src) p.count += 1; else p = spawnPop(I.src, z, 1, true);
    const bitten = mates.filter(() => rnd() < 0.35).slice(0, 2);
    if (p) bitten.forEach(o => { infect(o, p); o.injured = Math.max(o.injured, 12); });
    S.fear = Math.min(10, S.fear + 2);
    log(W.firsts['turn:' + S.id] ? 'notable' : 'trigger', `${nm(n)} of ${S.name} died of the bite, and got up again${bitten.length ? `. ${bitten.map(nm).join(' and ')} ${bitten.length > 1 ? 'were' : 'was'} bitten before it was driven out` : n.quarantined ? ', locked away where it could hurt no one' : ''}.`, { town: S.id }, { key: 'turn:' + S.id, repeat: 'notable', kind: 'plague-turn' });
  }
  function biteHour(S, n) {
    const I = n.infected, d = D.sources[I.src];
    I.h = (I.h || 0) + 1;
    if (I.h === 18) { n.sick = Math.max(n.sick, 40); log('notable', `${nm(n)} of ${S.name} burns with fever from a bite.`, { town: S.id }, { kind: 'bite' }); }
    const cure = (d?.cured || []).some(svc => S.npcs.some(o => o !== n && prof(o).provides.includes(svc) && o.action === 'work'));
    if (I.h > 18 && cure && rnd() < 0.012) { n.infected = null; n.sick = 0; n.quarantined = false; log('notable', `${nm(n)} of ${S.name} recovers from the bite.`, { town: S.id }, { kind: 'bite' }); return false; }
    if (I.h >= (d?.turns || 2) * 24) { turn(S, n); return true; }
    return false;
  }

  /* ---------------- great beasts: lairs, clutches, young that leave ---------------- */
  function brood(p, d, z) {
    if (p.young) { p.mult = Math.min(1, p.mult + 0.75 / 60); if (p.mult >= 1) { p.young = false; log('notable', `The young ${p.def} of ${z.name} is fully grown.`, { zone: z.id }, { kind: 'brood' }); } return; }
    if (p.eggs != null) {
      if (W.day - p.eggs >= 12) { p.eggs = null; p.lastBrood = W.day; const y = spawnPop(p.def, z, 1, true, true); if (y) { y.young = true; y.mult = 0.25; y.aggro = 0.3; y.parent = p.id; log('trigger', `A young ${p.def} hatches in ${z.name}.`, { zone: z.id }, { kind: 'brood' }); } }
      return;
    }
    if (p.settled === z.id && (p.fedAvg ?? 0) >= 0.5 && W.day - (p.lastBrood ?? p.born) >= d.broods && rnd() < 0.2) { p.eggs = W.day; log('notable', `${popName(p)} has laid a clutch of eggs in ${z.name}.`, { zone: z.id }, { kind: 'brood' }); }
  }

  /* ---------------- your players: what the heroes did, people you add, stories you end ---------------- */
  function deed(name, ref = {}, o = {}) {
    const dd = D.deeds[name]; if (!dd) return null;
    const S0 = townById(ref.town ?? (ref.npc != null ? IDX.get(ref.npc)?.town : null));
    if (o.party && o.party.trim() && S0) { const c = campOf(S0.region); if (c) c.party = o.party.trim(); else W.party = o.party.trim(); }
    const target = ref.npc != null ? IDX.get(ref.npc) : null;
    const S = townById(ref.town ?? target?.town); if (!S || !S.npcs.length) return null;
    const ab = aboutHeroes(S.region), H = ab.name.charAt(0).toUpperCase() + ab.name.slice(1);
    const adults = S.npcs.filter(n => !n.child);
    const one = target && target.town === S.id ? target : pick(adults);
    let hit;
    if (dd.affects === 'everyone') hit = adults;
    else if (dd.affects === 'some') hit = adults.slice().sort(() => rnd() - 0.5).slice(0, Math.max(2, Math.ceil(adults.length * 0.3)));
    else if (dd.affects === 'leaders') { const l = adults.filter(n => n.hero || prof(n).provides.some(x => ['order', 'safety', 'faith'].includes(x))); hit = l.length ? l : adults.slice(0, 3); }
    else hit = one ? [one] : [];
    const text = (dd.text || `{heroes}: ${dd.title}.`).replace('{heroes}', H).replace('{town}', S.name).replace('{one}', one ? nm(one) : 'someone') + (o.note ? ' ' + o.note.trim() : '');
    const victims = dd.kills ? (dd.affects === 'one' ? [one] : hit.slice(0, dd.kills)).filter(Boolean) : [];
    for (const v of victims) kill(v, `was killed by ${ab.name}`, S, null, ab);
    for (const n of hit) if (!n.dead && dd.marks) mark(n, dd.marks, text, { ab });
    if (dd.others) for (const n of adults) if (!n.dead && !hit.includes(n)) mark(n, dd.others, text, { ab });
    if (dd.marks === 'home destroyed') for (const n of hit) { const b = n.home != null ? S.buildings[n.home] : null; if (b?.residents) { b.residents.forEach(id => { const m = IDX.get(id); if (m) m.home = null; }); b.residents = []; b.burned = W.day; b.beds = 0; } }
    S.fear = clamp(S.fear + dd.fear, 0, 10);
    if (dd.food !== 1) takeFood(S, meals(S) * (1 - dd.food));
    if (dd.treasury) S.treasury = Math.max(0, S.treasury + dd.treasury);
    const scs = Object.values(D.scars).filter(sc => sc.from.includes(dd.marks) || sc.from.includes(dd.others));
    S.regard = (S.regard || 0) + (dd.fear < 0 ? 1 : 0) + (scs.some(sc => /repay|\{about\}/.test(sc.desire) && !sc.grudge && /repay/.test(sc.desire)) ? 1 : 0) - (scs.some(sc => sc.grudge) ? 1 : 0) - (dd.fear > 0 ? 1 : 0) - victims.length * 2;
    (W.deeds ||= []).unshift({ day: W.day, name: dd.name, town: S.id, one: one?.id ?? null, note: o.note || '' });
    log('trigger', text, { town: S.id }, { kind: 'deed', history: true, who: one ? [one.id] : [] });
    const touched = S.npcs.filter(n => n.life?.some(l => l.d === W.day && l.ab?.k === ab.k));
    return { affected: touched.length, wanting: touched.filter(n => n.desire?.ab?.k === ab.k).length, killed: victims.length, one: one?.id ?? null };
  }
  function addPerson(townId, o = {}) {
    const S = townById(townId); if (!S) return null;
    const n = rollNPC(o.job && D.professions[o.job] ? o.job : undefined);
    if (o.race && D.races[o.race]) n.race = o.race;
    if (o.first) n.first = o.first.trim(); if (o.last != null && String(o.last).trim()) n.last = String(o.last).trim();
    if (o.personality) n.personality = o.personality;
    n.gm = true; n.note = (o.note || '').trim();
    addToTown(S, n);
    const ab = aboutHeroes(S.region), who = (o.who || '').trim() || null;
    if (who && (o.story || []).includes('lost spouse')) n.kin.spouse = { id: -1, name: who };
    if (o.blame === 'heroes') n.grudges[ab.k] = { name: ab.name, w: 1, day: W.day };
    for (const t of o.story || []) { const by = / by$/.test(t), blame = by || o.blame === 'heroes'; mark(n, t, n.note || `${t.charAt(0).toUpperCase() + t.slice(1)}${by ? ' ' + ab.name : who && /^lost/.test(t) ? ': ' + who : ''}`, { ab: blame ? ab : null, who }); }
    if (!o.quiet) log('notable', `${nm(n)}, ${art(n.race)} ${n.race} ${n.job}, comes to live in ${S.name}.`, { town: S.id }, { kind: 'arrival' });
    return n;
  }
  function resolve(id, how) {
    const n = IDX.get(id); if (!n || n.dead) return false;
    const ab = aboutHeroes(regionOfP(n)), b = band(n);
    if (how === 'slain') { if (n.arc && !n.arc.done) { n.arc.done = 'slain by ' + ab.name; n.arc.ended = W.day; } kill(n, `was slain by ${ab.name}`, townById(n.town), b ? zoneOf(b) : zoneById(n.zone), ab); return true; }
    if (n.arc && !n.arc.done) { n.arc.done = how === 'spared' ? 'spared by ' + ab.name : 'turned by ' + ab.name; n.arc.ended = W.day; }
    if (b) { b.chief = null; removePop(b, `${popName(b)} ${solo(b) ? 'is' : 'are'} gone from ${zoneOf(b)?.name}: their leader has left them.`); }
    mark(n, how === 'spared' ? 'spared by' : 'redeemed', how === 'spared' ? `Spared by ${ab.name}` : `Turned from their path by ${ab.name}`, { ab });
    if (n.figure) fromFigure(n, townById(n.arc?.home));
    log('trigger', `${titled(n)} ${how === 'spared' ? `is spared by ${ab.name}` : `turns from their path, thanks to ${ab.name}`}.`, n.town != null ? { town: n.town } : {}, { kind: 'legend', who: [n.id] });
    return true;
  }
  function card(n) {
    const S = townById(n.town), L = [];
    const kin = [n.kin?.spouse ? `spouse ${n.kin.spouse.name}${IDX.get(n.kin.spouse.id) ? '' : ' (dead)'}` : '', ...(n.kin?.parents || []).map(p => `parent ${p.name}${IDX.get(p.id) ? '' : ' (dead)'}`), ...(n.kin?.kids || []).map(k => `child ${k.name}${IDX.get(k.id) ? '' : ' (dead)'}`)].filter(Boolean);
    L.push(titled(n));
    L.push(`race: ${n.race}`, `job: ${n.child ? 'child' : n.job}${n.hero ? ` (${n.hero.cls}, level ${n.hero.level})` : ''}`, `lives: ${S ? S.name : n.figure ? (zoneById(n.zone)?.name || 'the wilds') : 'on the road'}`, `age: ${Math.floor(n.age)}`);
    L.push(`personality: ${n.personality}`, `wants: ${n.want}`, `fears: ${n.fear}`, `quirk: ${n.quirk}`);
    if (n.desire) L.push(`desire: ${n.desire.text}`);
    const sc = scarsOf(n); if (sc.length) L.push(`marked by: ${sc.map(x => scarText(n, x)).join('; ')}`);
    if (n.arc) L.push(`path: ${n.arc.name}${n.arc.done ? ` (ended: ${n.arc.done})` : ` (step ${n.arc.step + 1} of ${D.arcs[n.arc.name]?.steps.length || '?'}: ${D.arcs[n.arc.name]?.steps[n.arc.step]?.verb || 'reigning'})`}`);
    const g = Object.values(n.grudges || {}).sort((a, b) => b.w - a.w); if (g.length) L.push(`grudges: ${g.map(x => x.name + (x.inherited ? ' (inherited)' : '')).join(', ')}`);
    if (kin.length) L.push(`family: ${kin.join(', ')}`);
    if (n.role) L.push(`role: ${n.role}`);
    if (n.note) L.push(`notes: ${n.note}`);
    if (n.ext != null) L.push(`id: ${n.ext}`);
    L.push('history:'); (n.life || []).slice().reverse().forEach(l => L.push(`- year ${1 + Math.floor((l.d - 1) / (SEASON_LEN * 4))}, day ${l.d}: ${l.text}`));
    return L.join('\n');
  }
  function cast(R) {
    const quiet = new Set(['married', 'child born', 'came of age', 'born', 'won fight', 'lost friend']);
    const score = n => (n.life || []).filter(l => !quiet.has(l.t)).length * 2 + (n.arc ? (n.arc.done ? 6 : 16) : 0) + (n.hero ? 6 + n.hero.renown / 8 : 0) + (n.gm ? 30 : 0) + (n.figure ? 8 : 0) + scarsOf(n).length * 2 + (n.title ? 8 : 0);
    return allPeople().filter(n => !n.dead && (R == null || regionOfP(n) === R)).map(n => ({ n, s: score(n) })).filter(o => o.s >= 8).sort((a, b) => b.s - a.s).slice(0, 14).map(o => o.n);
  }


  /* ---------------- your campaign: real places and people dropped into the world ---------------- */
  // spec: { name, party, region, places: [{ key, name, kind: 'town'|'wild', terrain, near, ext, size }],
  //         people: [{ name, place, job, race, personality, want, fear, story: [], who, blame, note, ext }],
  //         deeds: [{ deed, place, person, note }] }
  const TERRAIN_WORDS = [[/wood|forest|grove|weald|holt|thicket|pines|glade/i, 'forest'], [/hill|downs|tor|crag|ridge|barrow/i, 'hills'], [/marsh|swamp|fen|bog|mire|bayou/i, 'swamp'],
    [/mount|peak|spire|cliff|pass/i, 'mountains'], [/lake|mere|pool|river|sea|ocean|coast|shore|dock|harbou?r|bay|reef|isle|beach/i, 'lake'], [/ruin|tomb|crypt|keep|tower|obelisk|temple|shrine|cave|mine|dungeon|catacomb/i, 'ruins'], [/field|plain|meadow|heath|moor|farm/i, 'plains']];
  const JOB_WORDS = [[/mayor|lord|lady|baron|count|duke|king|queen|prince|noble|governor|steward|reeve/i, 'order'], [/guard|captain|watch|soldier|knight|sheriff|constable|sergeant/i, 'safety'], [/priest|cleric|acolyte|monk|nun|paladin|oracle/i, 'faith'],
    [/healer|doctor|physician|herbal|apothecar|midwife/i, 'health'], [/scholar|sage|wizard|mage|librarian|scribe|teacher/i, 'knowledge'], [/inn|tavern|barkeep|bartender|publican/i, 'inn'], [/merchant|trader|shop|vendor|peddler|seller/i, 'merchant'],
    [/thief|rogue|cutpurse|smuggler|fence/i, 'thief'], [/beggar|urchin|vagrant/i, 'beggar']];
  function jobFor(text) {
    if (!text) return null;
    const t = String(text).toLowerCase(), P = Object.values(D.professions);
    const direct = P.find(p => p.name === t || t.includes(p.name)); if (direct) return direct.name;
    for (const [re, k] of JOB_WORDS) if (re.test(t)) { const p = P.find(p => p.provides.includes(k) || p.kind === k); if (p) return p.name; }
    return null;
  }
  // seed(spec) builds a fresh world around your campaign; seed(spec, { add: true }) later brings in only what's new (new cards, new deeds, deaths)
  function seed(spec, o = {}) {
    W.campaigns ||= [];
    let C = W.campaigns.find(c => c.id === (spec.id ?? null) && c.name === (spec.name || 'Your campaign')) || (spec.id != null ? W.campaigns.find(c => c.id === spec.id) : null);
    if (o.add && !C) return null;
    const add = !!C;
    let R;
    if (C) R = W.regions.find(r => r.id === C.region) || W.regions[0];
    else {
      // each campaign gets its own region. With a world map, the region IS that map: your pinned towns and places go where you pinned them.
      const M = spec.map;
      if (M?.w) R = addRegion({ name: spec.region || spec.name, w: M.w, h: M.h, land: M.land, image: M.image, imageData: M.imageData, campaign: spec.id,
        towns: spec.places.filter(p => p.kind === 'town' && p.pos).map(p => ({ x: p.pos.x, y: p.pos.y, name: p.name, ext: p.ext ?? p.key })),
        wilds: spec.places.filter(p => p.kind !== 'town' && p.pos).map(p => ({ x: p.pos.x, y: p.pos.y, name: p.name, ext: p.ext ?? p.key, terrain: p.terrain || TERRAIN_WORDS.find(([re]) => re.test(p.name))?.[1] })) });
      else R = W.campaigns.length || !W.regions.length ? addRegion() : W.regions[0];
      C = { id: spec.id ?? null, name: spec.name || 'Your campaign', at: W.day, region: R.id, seen: [], party: spec.party || null, partyAt: null, live: true, write: false };
      W.campaigns.push(C); if (spec.region) R.name = spec.region;
    }
    W.campaign = C;
    const rep = { towns: [], wilds: [], people: [], loose: [], deeds: 0, died: [], skipped: [], region: R.id, campaign: C.name };
    const seen = new Set(C.seen || []);
    const ours = add ? [] : W.towns.filter(t => t.region === R.id), placed = {};
    for (const S of W.towns) if (S.ext != null) placed[S.ext] = S;
    for (const z of W.zones) if (z.ext != null) placed[z.ext] = z;
    for (const p of spec.places) if (placed[p.ext ?? p.key]) { const x = placed[p.ext ?? p.key]; placed[p.key] = x; if (add) continue; if (x.npcs) { if (!rep.towns.includes(x.name)) rep.towns.push(x.name); } else if (!rep.wilds.includes(x.name)) rep.wilds.push(x.name); }
    let ti = 0;
    const renameTown = (S, name) => { W.names = W.names.filter(x => x !== S.name); S.name = name; W.names.push(name); S.paper.name = `The ${name} ${S.paper.name.split(' ').pop()}`; };
    // towns
    spec.places.filter(p => p.kind === 'town').forEach(p => {
      if (placed[p.key]) return;
      let S = ours.filter(t => !t.yours)[ti++];
      if (!S) { const pos = freeSpot(R); if (!pos) { rep.skipped.push(p.name); return; } S = createTown(R, pos, { name: p.name, pop: p.size || ri(14, 22) }); const near = W.towns.filter(t => t !== S && t.region === R.id).sort((a, b) => dist(a, S) - dist(b, S))[0]; if (near) W.roads.push({ a: S.id, b: near.id, len: dist(S, near) }); }
      else renameTown(S, p.name);
      S.ext = p.ext ?? null; S.yours = true; placed[p.key] = S; rep.towns.push(S.name);
    });
    // wild places: a zone of the right ground, near the town they belong to
    const taken = new Set();
    for (const p of spec.places.filter(p => p.kind !== 'town')) {
      if (placed[p.key]) continue;
      const t = (p.terrain && D.terrains[p.terrain] ? p.terrain : null) || TERRAIN_WORDS.find(([re]) => re.test(p.name))?.[1];
      const near = placed[p.near];
      const zs = W.zones.filter(z => z.region === R.id && !taken.has(z.id) && !z.yours && z.townRuin == null).sort((a, b) => near ? dist(a, near) - dist(b, near) : 0);
      let z = zs.find(z => t && z.terrains.includes(t)) || zs[0];
      if (!z) { rep.skipped.push(p.name); continue; }
      if (t && D.terrains[t] && !z.terrains.includes(t)) { z.type = t; z.terrains = [t, ...z.terrains.filter(x => x !== z.type)]; }
      W.names = W.names.filter(x => x !== z.name); z.name = p.name; z.ext = p.ext ?? null; z.yours = true; taken.add(z.id); placed[p.key] = z; rep.wilds.push(z.name);
      if (t === 'ruins' && !z.tags.includes('ruins')) z.tags.push('ruins');
    }
    for (const S of W.towns) { const z = zoneById(S.wilds[0]); if (z) { S.woodsName = z.name; const b = S.buildings.find(b => b.type === 'woods'); if (b) b.name = z.name; } }
    // people
    const biggest = () => W.towns.filter(t => t.npcs.length).sort((a, b) => b.npcs.length - a.npcs.length)[0];
    const have = new Set(allPeople().map(n => n.ext).filter(x => x != null));
    for (const p of spec.people) {
      if (p.ext != null && (have.has(p.ext) || seen.has(p.ext))) continue;
      let S = placed[p.place], wild = null;
      if (S && !S.npcs) { wild = S; S = W.towns.filter(t => t.npcs.length && t.region === wild.region).sort((a, b) => dist(a, wild) - dist(b, wild))[0]; }
      if (!S) { S = biggest(); rep.loose.push(p.name); }
      if (!S) continue;
      const words = String(p.name || 'Nameless').trim().split(/\s+/);
      const n = addPerson(S.id, { first: words[0], last: words.slice(1).join(' '), race: p.race && D.races[String(p.race).toLowerCase()] ? String(p.race).toLowerCase() : '', job: jobFor(p.job) || '', story: (p.story || []).filter(Boolean), who: p.who, blame: p.blame, note: p.note, quiet: true });
      if (!n) continue;
      n.last = words.slice(1).join(' ');
      if (p.personality) n.personality = p.personality; if (p.want) n.want = p.want; if (p.fear) n.fear = p.fear;
      if (p.job && !jobFor(p.job)) n.role = p.job;
      n.ext = p.ext ?? null; rep.people.push(nm(n)); if (p.ext != null) seen.add(p.ext);
      if (wild) { toFigure(S, n, wild); n.doing = `Lives out in ${wild.name}`; }
    }
    // what your players already did
    for (const d of spec.deeds || []) {
      if (d.ext != null && seen.has(d.ext)) continue; if (d.ext != null) seen.add(d.ext);
      const S = placed[d.place]; const who = d.person ? allPeople().find(n => n.ext != null && n.ext === d.person || nm(n) === d.person) : null;
      if (D.deeds[String(d.deed).toLowerCase()] && (S?.npcs || who)) { deed(String(d.deed).toLowerCase(), { town: S?.npcs ? S.id : who.town, npc: who?.id }, { note: d.note }); rep.deeds++; }
    }
    // people your campaign says have died
    for (const id of spec.dead || []) { const n = allPeople().find(n => n.ext === id && !n.dead); if (n) { rep.died.push(nm(n)); kill(n, 'died, as your campaign tells it', townById(n.town), zoneById(n.zone)); } }
    C.seen = [...seen];
    if (!add) log('trigger', `${C.name} comes into the world: ${rep.towns.length} towns, ${rep.wilds.length} wild places and ${rep.people.length} people of yours.`, { region: R.id }, { kind: 'campaign', history: true });
    else if (rep.towns.length + rep.wilds.length + rep.people.length) log('notable', `From your campaign: ${[rep.towns.length ? `${rep.towns.join(', ')} added` : '', rep.wilds.length ? `${rep.wilds.join(', ')} named` : '', rep.people.length ? `${rep.people.join(', ')} ${rep.people.length > 1 ? 'arrive' : 'arrives'}` : ''].filter(Boolean).join('; ')}.`, { region: R.id }, { kind: 'campaign' });
    return rep;
  }
  function changes(campId) {
    const C = (W.campaigns || []).find(c => c.id === campId) || null, inR = r => !C || r === C.region;
    const out = { campaign: C?.name || null, campaignId: C?.id ?? null, region: C ? W.regions.find(r => r.id === C.region)?.name : null, party: C ? partyOf(C.region) : W.party, day: W.day, year: year(), season: season(), updated: Date.now(), people: [], places: [] };
    for (const n of allPeople().filter(n => (n.gm || n.ext != null) && inR(regionOfP(n)))) out.people.push({ id: n.ext ?? null, name: titled(n), lives: townById(n.town)?.name || (n.figure ? zoneById(n.zone)?.name : null), job: n.role || n.job, alive: !n.dead, desire: n.desire?.text || null, marked_by: scarsOf(n).map(x => scarText(n, x)), path: n.arc ? `${n.arc.name}${n.arc.done ? ' (ended: ' + n.arc.done + ')' : ''}` : null, grudges: Object.values(n.grudges || {}).map(g => g.name), card: card(n) });
    for (const S of W.towns.filter(t => t.yours && inR(t.region))) out.places.push({ id: S.ext ?? null, name: S.name, people: S.npcs.length, fear: +S.fear.toFixed(1), food_days: +foodDays(S).toFixed(1), thinks_of_party: S.regard || 0, abandoned: !S.npcs.length });
    for (const z of W.zones.filter(z => z.yours && inR(z.region))) out.places.push({ id: z.ext ?? null, name: z.name, wild: true, living_there: W.pops.filter(p => p.zone === z.id && p.count >= 1).map(p => `${popName(p)}${def(p).solo ? '' : ' ' + Math.round(p.count)}`) });
    out.history = (W.history || []).filter(h => !C || (h.town != null ? townById(h.town)?.region === C.region : h.zone != null ? zoneById(h.zone)?.region === C.region : true)).slice(0, 60).map(h => `Year ${h.year}, day ${h.day}: ${h.text}`);
    return out;
  }

  /* ---------------- council: needs, solutions from the ledger, and what has worked ---------------- */
  const CASE_LABEL = {
    gather: k => k.includes(':') ? `foraging in ${zoneById(+k.split(':')[1])?.name || 'the wilds'}` : 'foraging', assign: k => k.includes(':') ? `putting ${k.split(':')[1]}s to work in ${zoneById(+k.split(':')[2])?.name || 'the wilds'}` : 'putting people to work on wild food',
    buy: k => k.includes(':') ? `buying food from ${townById(+k.split(':')[1])?.name || 'a neighbour'}` : 'buying food from neighbours', explore: () => 'sending out scouts', ration: () => 'rationing', settle: () => 'founding a camp nearer to food',
    bounty: () => 'posting bounties', hunt: () => 'sending hunting parties', militia: () => 'raising a militia', palisade: () => 'building a palisade', appeal: () => 'asking neighbours for help', avoid: () => 'keeping away from danger', quarantine: () => 'locking away the bitten', burn: () => 'burning the bitten',
  };
  const caseLabel = key => (CASE_LABEL[key.split(':')[0]] || (() => key))(key);
  function learned(S, key) {
    const c = S.cases[key], vb = S.cases[key.split(':')[0]];
    if (c) return (c.v - 0.5) * 40;
    if (vb && vb !== c) return (vb.v - 0.5) * 20;
    return 6;
  }
  function learnCase(S, key, val) {
    for (const k of new Set([key, key.split(':')[0]])) {
      const c = S.cases[k] ||= { n: 0, v: 0.5, label: caseLabel(k) };
      c.n++; c.v += (val - c.v) * 0.35; c.last = W.day; c.label = caseLabel(k);
      if (k === key && c.n >= 2 && c.v >= 0.72 && !c.won) { c.won = true; log('notable', `${S.name} has learned that ${c.label} works.`, { town: S.id }, { kind: 'learned', data: { what: c.label } }); }
      if (k === key && c.n >= 2 && c.v <= 0.25 && !c.lost) { c.lost = true; log('notable', `${S.name} gives up on ${c.label}. It hasn't worked.`, { town: S.id }, { kind: 'learned', data: { what: c.label, bad: true } }); }
    }
  }
  function townForce(S) { return S.npcs.filter(n => fightsJob(n) || n.hero).reduce((s, n) => s + npcPower(n), 0); }
  function perceived(S) {
    const dangers = Object.values(S.ledger).filter(x => x.t === 'danger' && W.day - x.day <= 12 && x.amt > 0 && x.power > 0).map(x => ({ x, z: zoneById(x.z) })).filter(o => o.z && dist(o.z, S) - o.z.r < 320);
    let total = 0, worst = null;
    for (const o of dangers) { const hurt = S.threats[o.x.pop], s = o.x.power * o.x.w * (0.5 + 0.5 * clamp(1 - (W.day - o.x.day) / 12, 0, 1)) * (hurt?.deaths ? 1.4 : hurt ? 1 : 0.35); total += s; if (!worst || s > worst.s) worst = { ...o, s }; }
    return { total, worst, dangers };
  }
  function townThreat(S) { const p = perceived(S); return { total: p.total, worst: p.worst ? { p: popById(p.worst.x.pop), x: p.worst.x, score: p.worst.s, t: S.threats[p.worst.x.pop] } : null }; }
  function eligible(S, max, minPower = 0, filter) {
    return S.npcs.filter(n => !n.sick && !n.injured && !n.child && !n.quarantined && n.age < 70 && (!filter || filter(n))).filter(n => npcPower(n) >= minPower).sort((a, b) => npcPower(b) - npcPower(a)).slice(0, max);
  }
  const fighterish = n => n.hero || fightsJob(n) || prof(n).kind === 'gatherer' || pers(n, 'brave', 'hot-tempered', 'ambitious', 'proud') || ['adventure', 'fame', 'revenge', 'coin'].includes(P(n.want)) || n.grief;
  function council(S) {
    const fd = foodDays(S), s = season();
    let foodU = clamp((2.5 - fd) / 2.5, 0, 1);
    if (s === 'autumn' && W.day % SEASON_LEN > 4 && fd < 7) foodU += 0.3;
    if (s === 'winter' && fd < 3) foodU += 0.3;
    foodU = clamp(foodU, 0, 1.3);
    const per = perceived(S);
    const force = townForce(S) + S.palisade * 6 + S.npcs.length * 0.25;
    S.threat = per.total; S.force = force;
    const threatU = clamp(per.total / Math.max(4, force) - 0.25, 0, 1.5);
    const bitten = S.npcs.filter(n => n.infected && n.infected.h >= 18 && !n.quarantined);
    S.needs = { food: foodU, safety: threatU, plague: clamp(S.npcs.filter(n => n.infected).length / 4, 0, 1.5) };
    const opts = [], ok = (k, cd) => W.day - (S.council[k] || -99) >= cd;
    const add = (key, group, score, label, why, run) => opts.push({ key, group, score: Math.round(score + learned(S, key) + rnd() * 6), label, why, run });
    add('wait', 'none', 34 - (foodU + threatU) * 12, 'Wait', 'Nothing pressing', () => {});
    const available = S.npcs.filter(n => !n.hero && !n.sick && !n.injured && !fightsJob(n) && !n.child && !n.quarantined);
    // ---- food solutions come out of the ledger
    const foodItems = Object.values(S.ledger).filter(x => x.t === 'res' && D.sources[x.src]?.food > 0 && x.amt > 2 && W.day - x.day < 30);
    const dangerIn = zid => Object.values(S.ledger).filter(x => x.t === 'danger' && x.z === zid && W.day - x.day < 12).reduce((t, x) => t + x.power * x.w, 0);
    const byZone = {};
    for (const x of foodItems) { const z = zoneById(x.z); if (!z || z.region !== S.region || S.avoid[z.id] > W.day) continue; const o = byZone[z.id] ||= { z, meals: 0, srcs: [] }; o.meals += x.amt * x.w * D.sources[x.src].food / 45 * 0.4; o.srcs.push(x.src); }
    const zonesK = Object.values(byZone).map(o => ({ ...o, danger: dangerIn(o.z.id), d: dist(o.z, S) })).sort((a, b) => (b.meals - b.danger * 2 - b.d / 20) - (a.meals - a.danger * 2 - a.d / 20));
    if (foodU > 0.1 || W.day % 9 === S.id % 9) {
      for (const o of zonesK.slice(0, 2)) if (available.length >= 2 && ok('gather', 2)) add(`gather:${o.z.id}`, 'food', 24 + foodU * 42 + Math.min(18, o.meals / 6) - o.danger * 1.2 - o.d / 30, `Forage in ${o.z.name}`, `${[...new Set(o.srcs)].join(', ')} known there${o.danger ? `, danger ${Math.round(o.danger)}` : ''}`, () => {
        const who = available.slice().sort((a, b) => (prof(b).kind === 'gatherer') - (prof(a).kind === 'gatherer') || a.earnedY - b.earnedY).slice(0, ri(2, 4));
        const Pt = startParty(S, 'forage', who, { zone: o.z.id }, { doing: `Foraging in ${o.z.name}`, case: `gather:${o.z.id}`, expect: o.meals, start: W.day });
        if (Pt) log(W.firsts['forage:' + S.id] ? 'minor' : 'notable', `${S.name} sends ${who.length} to forage in ${o.z.name}, where the town knows of ${[...new Set(o.srcs)].join(' and ')}.`, { town: S.id }, { key: 'forage:' + S.id, repeat: 'minor', kind: 'council', data: { action: 'Foraging' } });
      });
      // put people to work on a known source
      const gatherers = Object.values(D.professions).filter(p => p.kind === 'gatherer' && p.w >= 0);
      for (const o of zonesK.slice(0, 2)) {
        const pj = gatherers.find(p => o.srcs.some(src => matches(D.sources[src], p.gathers)) && (!p.building || S.buildings.some(b => b.job === p.building) || p.w > 0));
        if (!pj) continue;
        const spare = S.npcs.filter(n => !isFoodMaker(n) && !n.hero && !n.child && n.earnedY < 4 && !['inn', 'builder'].includes(prof(n).kind) && !fightsJob(n));
        if (spare.length && ok('assign', 4)) add(`assign:${pj.name}:${o.z.id}`, 'food', 20 + foodU * 30 + Math.min(12, o.meals / 5) - o.danger - o.d / 40, `More ${pj.name}s for ${o.z.name}`, `${spare.length} people earning little`, () => {
          const moved = spare.slice(0, 2).filter(n => changeJob(S, n, pj.name, `the council needs ${pj.name}s in ${o.z.name}`, true));
          S.focus[pj.name] = o.z.id; S.npcs.filter(n => n.job === pj.name).forEach(n => n.gz = null);
          if (moved.length) log('notable', `${S.name}'s council puts ${moved.map(nm).join(' and ')} to work as ${pj.name}s in ${o.z.name}.`, { town: S.id }, { kind: 'council', data: { action: 'New work' } });
          S.pendingOut.push({ key: `assign:${pj.name}:${o.z.id}`, day: W.day, u: foodU, need: 'food' });
        });
      }
      // buy from a town the ledger says has food
      const markets = Object.values(S.ledger).filter(x => x.t === 'market' && x.town !== S.id && townById(x.town)?.npcs.length && x.fd > 2.5 && W.day - x.day < 15);
      for (const x of markets.slice(0, 2)) { const T = townById(x.town), r = roadPath(S.id, T.id); if (!r || S.treasury < 20 || !ok('buy', 3)) continue;
        add(`buy:${T.id}`, 'food', 26 + foodU * 46 - r.len / 40, `Buy food in ${T.name}`, `heard ${T.name} has ${x.fd} days of food`, () => {
          const runner = S.npcs.find(n => prof(n).kind === 'merchant') || available.slice().sort((a, b) => a.earnedY - b.earnedY)[0];
          const coin = Math.min(S.treasury * 0.6, 80); S.treasury -= coin;
          const guard = eligible(S, 1, 3, n => fightsJob(n) && n !== runner);
          const Pt = startParty(S, 'import', [runner, ...guard], { town: T.id }, { coin, doing: `Buying food in ${T.name}`, case: `buy:${T.id}`, start: W.day });
          if (Pt) log(W.firsts['import:' + S.id] ? 'minor' : 'notable', `${S.name} sends ${Math.round(coin)} coin to ${T.name} to buy food (${fd.toFixed(1)} days left).`, { town: S.id }, { key: 'import:' + S.id, repeat: 'minor', kind: 'council', data: { action: 'Buying food' } }); else S.treasury += coin;
        }); }
      // explore what nobody knows
      const surveyed = id => Object.values(S.ledger).some(x => x.t === 'survey' && x.z === id && W.day - x.day < 12);
      const unknown = W.zones.filter(z => z.region === S.region && dist(z, S) < 430 && !surveyed(z.id) && !(S.avoid[z.id] > W.day)).sort((a, b) => dist(a, S) - dist(b, S));
      const knowsFood = zonesK.some(o => o.meals > 10);
      if (unknown.length && available.length >= 2 && ok('explore', 2)) add(`explore`, 'food', 16 + foodU * (knowsFood ? 12 : 34), `Scout ${unknown[0].name}`, knowsFood ? 'curiosity' : 'the town knows of no good food', () => {
        const who = available.slice().sort((a, b) => (b.stats[4] + (prof(b).kind === 'gatherer' ? 4 : 0)) - (a.stats[4] + (prof(a).kind === 'gatherer' ? 4 : 0))).slice(0, ri(1, 2));
        const Pt = startParty(S, 'explore', who, { zone: unknown[0].id }, { doing: `Scouting ${unknown[0].name}`, case: 'explore', start: W.day });
        if (Pt) log(W.firsts['explore:' + S.id] ? 'minor' : 'notable', `${S.name} sends ${who.map(nm).join(' and ')} to scout ${unknown[0].name}.`, { town: S.id }, { key: 'explore:' + S.id, repeat: 'minor', kind: 'council', data: { action: 'Scouting' } });
      });
      const unknownTowns = neighbours(S).filter(T => !Object.values(S.ledger).some(x => x.t === 'market' && x.town === T.id && W.day - x.day < 15));
      if (unknownTowns.length && foodU > 0.2 && available.length && ok('explore', 2)) add('explore', 'food', 18 + foodU * 24, `Send word to ${unknownTowns[0].name}`, 'the town does not know who has food to sell', () => {
        const who = available.slice().sort((a, b) => b.stats[5] - a.stats[5]).slice(0, 1);
        startParty(S, 'scout_town', who, { town: unknownTowns[0].id }, { doing: `Carrying word to ${unknownTowns[0].name}`, case: 'explore', start: W.day });
      });
      if (!S.ration && foodU > 0.4 && ok('ration', 6)) add('ration', 'food', 16 + foodU * 26 + (s === 'winter' ? 8 : 0), 'Ration food', `${fd.toFixed(1)} days of food`, () => { S.ration = 5; S.pendingOut.push({ key: 'ration', day: W.day, u: foodU, need: 'food' }); log('notable', `${S.name} begins rationing food.`, { town: S.id }, { kind: 'council', data: { action: 'Rationing' } }); });
      // move closer to food if it's all far away
      const far = zonesK.find(o => o.d > 230 && o.meals > 20);
      if (far && S.lowFoodDays >= 3 && S.npcs.length > 10 && ok('settle', 20)) add('settle', 'food', 12 + S.lowFoodDays * 4 + foodU * 10, `Found a camp by ${far.z.name}`, `the food is ${Math.round(far.d)} away`, () => {
        const spt = freeSpot(W.regions.find(r => r.id === S.region), far.z); if (!spt) return;
        const who = S.npcs.filter(n => !n.hero).sort((a, b) => a.coin - b.coin).slice(0, ri(4, 6));
        const Pt = startParty(S, 'founders', who, { pt: spt }, { doing: `Leaving to found a camp near ${far.z.name}`, why: `to be nearer the food of ${far.z.name}`, case: 'settle' });
        if (Pt) { Pt.members.forEach(m => freeHome(S, m)); log('trigger', `${who.length} people leave ${S.name} to found a camp nearer the food in ${far.z.name}.`, { town: S.id }, { kind: 'exodus' }); }
      });
    }
    // ---- safety solutions come out of the ledger too
    if (threatU > 0.1 && per.worst) {
      const w = per.worst.x, z = per.worst.z, alive = popById(w.pop);
      const ds = D.sources[w.src], nmw = w.name || title(w.src);
      const foe = ds?.solo ? `${nmw.replace(/^The /i, '').toLowerCase()} of ${z.name}` : /'s /.test(nmw) ? `${nmw} of ${z.name}` : `${nmw.toLowerCase()} of ${z.name}`;
      const theFoe = /'s /.test(nmw) ? foe : 'the ' + foe;
      const cause = S.threats[w.pop]?.deaths ? `after ${S.threats[w.pop].deaths} ${S.threats[w.pop].deaths > 1 ? 'deaths' : 'death'}` : S.threats[w.pop] ? `after ${S.threats[w.pop].incidents} ${S.threats[w.pop].incidents > 1 ? 'attacks' : 'attack'}` : `on word of ${describe(w)} in ${z.name}`;
      if (alive && !W.bounties.some(b => b.pop === w.pop && !b.done) && S.treasury >= 20 && ok('bounty', 4)) add('bounty', 'safety', 32 + threatU * 20, `Bounty on ${theFoe}`, `treasury ${Math.round(S.treasury)}`, () => {
        const reward = Math.round(clamp(w.power * 2.2, 15, S.treasury * 0.6)); S.treasury -= reward;
        W.bounties.push({ id: W.nextBounty++, town: S.id, pop: w.pop, reward, day: W.day, done: false, claimed: false });
        log(W.firsts.bounty ? 'notable' : 'trigger', `${S.name} posts a bounty of ${reward} coin on ${theFoe}, ${cause}.`, { town: S.id }, { key: 'bounty', repeat: 'notable', kind: 'bounty', data: { foe: w.name || w.src, reward, zone: z.name } });
        S.pendingOut.push({ key: 'bounty', day: W.day, u: threatU, need: 'safety' });
      });
      const idle = S.npcs.filter(n => !n.child).filter(n => ['beggar', 'thief'].includes(prof(n).kind) || n.job === D.laborer || (['producer', 'gatherer'].includes(prof(n).kind) && n.earnedY < 2));
      if (idle.length && threatU > 0.4 && ok('militia', 5) && S.treasury > 15) add('militia', 'safety', 28 + threatU * 20, 'Raise a militia', `${idle.length} idle hands`, () => {
        const got = idle.sort((a, b) => npcPower(b) - npcPower(a)).slice(0, ri(1, 3)).filter(n => changeJob(S, n, D.guard, 'the town needs fighters', true));
        if (got.length) { ensureWorkplace(S, got[0]); log(W.firsts.militia ? 'notable' : 'trigger', `${S.name} raises a militia ${cause}: ${got.map(nm).join(', ')} ${got.length > 1 ? 'take' : 'takes'} up spears against ${theFoe}.`, { town: S.id }, { key: 'militia', repeat: 'notable', kind: 'militia', data: { foe: w.name || w.src } }); }
        S.pendingOut.push({ key: 'militia', day: W.day, u: threatU, need: 'safety' });
      });
      const wood = Object.keys(D.goods).find(g => hasTag(g, 'material') && (S.market.stock[g] || 0) >= 8);
      if (S.palisade < 3 && threatU > 0.6 && ok('palisade', 6) && wood && S.treasury >= 20) add('palisade', 'safety', 24 + threatU * 16, 'Build a palisade', `${wood} in stock`, () => {
        for (let i = 0; i < 8; i++) buy(S, wood, 'treasury'); S.palisade++;
        log(S.palisade === 1 ? 'trigger' : 'notable', `${S.name} ${S.palisade === 1 ? 'raises a palisade' : 'strengthens its palisade'} against ${theFoe}.`, { town: S.id }, { kind: 'palisade' });
        S.pendingOut.push({ key: 'palisade', day: W.day, u: threatU, need: 'safety' });
      });
      const fighters = eligible(S, 6, 1.5, fighterish), fp = fighters.reduce((t, n) => t + npcPower(n), 0);
      if (alive && fighters.length >= 2 && fp > w.power * 0.9 && ok('hunt', 3)) add('hunt', 'safety', 28 + threatU * 14 + clamp(fp / w.power - 1, 0, 2) * 10, `Hunt ${theFoe}`, `${fighters.length} fighters, power ${Math.round(fp)} against a believed ${Math.round(w.power)}`, () => {
        const Pt = startParty(S, 'hunt', fighters, { zone: z.id }, { target: w.pop, doing: `Hunting ${theFoe}`, case: 'hunt' });
        if (Pt) log('notable', `${S.name} sends ${fighters.length} to hunt ${theFoe}: ${fighters.map(nm).join(', ')}.`, { town: S.id }, { kind: 'council', data: { action: 'Hunting party' } });
      });
      if (threatU > 0.8 && ok('appeal', 6)) { const helper = neighbours(S).filter(t => townForce(t) > 6 && t.threat < t.force * 0.5).sort((a, b) => townForce(b) - townForce(a))[0];
        if (helper && alive) add('appeal', 'safety', 22 + threatU * 12, `Ask ${helper.name} for help`, `${helper.name} has fighters to spare`, () => {
          const help = eligible(helper, 3, 3, n => fightsJob(n) || n.hero); if (!help.length) return;
          const Pt = startParty(helper, 'aid', help, { town: S.id }, { target: w.pop, doing: `Riding to help ${S.name}` });
          if (Pt) { Pt.case = null; S.pendingOut.push({ key: 'appeal', day: W.day, u: threatU, need: 'safety' }); log(W.firsts.aid ? 'notable' : 'trigger', `${S.name} begs ${helper.name} for help against ${theFoe}. ${help.map(nm).join(', ')} ride out.`, { town: S.id }, { key: 'aid', repeat: 'notable', kind: 'aid' }); }
        }); }
      const working = S.npcs.filter(n => n.gz === z.id).length;
      if (working && !(S.avoid[z.id] > W.day) && ok('avoid', 3)) add('avoid', 'safety', 24 + threatU * 16, `Keep away from ${z.name}`, `${working} work there`, () => {
        S.avoid[z.id] = W.day + 10; S.npcs.forEach(n => { if (n.gz === z.id) n.gz = null; }); Object.keys(S.focus).forEach(k => { if (S.focus[k] === z.id) delete S.focus[k]; });
        log('notable', `${S.name} tells its people to keep away from ${z.name}, ${cause}.`, { town: S.id }, { kind: 'council', data: { action: 'Keep away' } });
        S.pendingOut.push({ key: 'avoid', day: W.day, u: threatU, need: 'safety' });
      });
    }
    // ---- the bitten: lock them away, or burn them
    if (bitten.length) {
      const healer = S.npcs.some(o => prof(o).provides.includes('health'));
      add('quarantine', 'plague', 30 + bitten.length * 6 + (healer ? 6 : 0), 'Lock away the bitten', `${bitten.length} bitten and feverish${healer ? ', and a healer to tend them' : ''}`, () => {
        bitten.forEach(n => n.quarantined = true);
        log('notable', `${S.name} locks away ${bitten.length > 1 ? `${bitten.length} of its bitten` : nm(bitten[0])} until the fever breaks one way or the other.`, { town: S.id }, { kind: 'council', data: { action: 'Quarantine' } });
        S.pendingOut.push({ key: 'quarantine', day: W.day, u: S.needs.plague, need: 'plague' });
      });
      add('burn', 'plague', 12 + S.fear * 3 + bitten.length * 4 - (healer ? 14 : 0), 'Burn the bitten', `fear ${Math.round(S.fear)}${healer ? '' : ', no healer'}`, () => {
        const names = bitten.map(nm);
        bitten.forEach(n => kill(n, 'was put to the torch by order of the council', S, null, aboutTown(S)));
        S.fear = Math.max(0, S.fear - 2);
        log('trigger', `${S.name}'s council orders the bitten burned: ${names.join(', ')}. Their families will not forget it.`, { town: S.id }, { kind: 'council', history: true, data: { action: 'Burning the bitten' } });
        S.pendingOut.push({ key: 'burn', day: W.day, u: S.needs.plague, need: 'plague' });
      });
    }
    opts.sort((a, b) => b.score - a.score);
    S.councilScores = opts.slice(0, 8).map(o => ({ key: o.key.split(':')[0], label: o.label, score: o.score, why: o.why + (S.cases[o.key] ? ` · worked ${Math.round(S.cases[o.key].v * 100)}% before` : '') }));
    const done = new Set();
    S.lastCouncil = [];
    for (const o of opts) { if (o.key === 'wait') break; if (done.has(o.group)) continue; done.add(o.group); S.council[o.key.split(':')[0]] = W.day; o.run(); S.lastCouncil.push(o.label); }
    // judge passive decisions after a few days
    S.pendingOut = S.pendingOut.filter(o => { if (W.day - o.day < 5) return true; learnCase(S, o.key, clamp(0.5 + (o.u - (S.needs[o.need] ?? 0)) * 0.8, 0, 1)); return false; });
  }
  function changeJob(S, n, to, why, quiet) {
    const from = n.job; if (from === to || n.hero || n.child || W.day - (n.changed || -9) < 6) return false;
    n.changed = W.day; n.job = to; n.progress = 0; n.gz = null; ensureWorkplace(S, n);
    if (!quiet) log(W.firsts['job:' + S.id] ? 'minor' : 'notable', `${nm(n)} of ${S.name} quits as ${from} and becomes ${art(to)} ${to}: ${why}.`, { town: S.id }, { kind: 'job', key: 'job:' + S.id, repeat: 'minor' });
    hist(n, `Becomes ${art(to)} ${to}`);
    return true;
  }
  function shortestGood(S) {
    let best = null;
    for (const j of Object.values(D.professions)) {
      if (!['producer', 'crafter', 'gatherer'].includes(j.kind) || j.w <= 0) continue;
      if (j.uses.some(g => (S.market.stock[g] || 0) < 2)) continue;
      j._cost = j.uses.reduce((t, g) => t + price(S, g), 0);
      const outs = j.kind === 'gatherer' ? [...new Set(Object.values(D.sources).filter(s => matches(s, j.gathers) && s.gives).map(s => s.gives))] : j.makes.map(m => m.g);
      if (j.kind === 'gatherer' && !Object.values(S.ledger).some(x => x.t === 'res' && D.sources[x.src] && matches(D.sources[x.src], j.gathers) && x.amt > 5)) continue;
      for (const g of outs) { const r = price(S, g) / good(g).price; if (r >= 1.8 && (!best || r > best.r)) best = { r, good: g, job: j }; }
    }
    return best;
  }
  function computeDials(S) {
    const p = Math.max(1, S.npcs.length), sv = S.services, coins = S.npcs.map(n => n.coin).sort((a, b) => a - b);
    const lvl = (x, steps) => 1 + steps.filter(s => x >= s).length;
    S.dials = { Food: lvl(foodDays(S), [0.6, 1.5, 3, 6]), Wealth: lvl(coins[Math.floor(coins.length / 2)] || 0, [5, 12, 25, 50]), Safety: lvl((sv.safety || 0) / p * 10 + S.palisade * 3, [2, 6, 12, 20]),
      Faith: lvl((sv.faith || 0) / p * 10, [1, 4, 8, 14]), Health: lvl((sv.health || 0) / p * 10, [1, 4, 8, 14]), Fear: lvl(S.fear, [1, 3, 5, 8]), Knowledge: lvl(Object.values(S.ledger).filter(x => x.t !== 'news').length, [4, 8, 14, 22]) };
  }
  function dawnTown(S) {
    familyDawn(S);
    if (!S.npcs.length) return;
    S.services = S.servToday; S.servToday = {};
    if (S.market.coin > 80) { S.treasury += S.market.coin - 80; S.market.coin = 80; }
    let levy = 0; S.npcs.forEach(n => { if (n.coin > 30) { const l = (n.coin - 30) * 0.1; n.coin -= l; levy += l; } }); S.treasury += levy;
    let rent = 0; S.npcs.forEach(n => { if (n.home != null && n.coin >= 1) { n.coin -= 1; rent++; } }); S.treasury += rent;
    S.npcs.forEach(n => {
      if (n.coin < 20 || rnd() > 0.7) return;
      const wants = Object.keys(D.goods).filter(g => (hasTag(g, 'luxury') || (hasTag(g, 'weapon') && (P(n.fear) === 'monsters' || fightsJob(n) || S.fear > 4))) && (S.market.stock[g] || 0) >= 1);
      if (!wants.length) return; const g = pick(wants), p = buy(S, g, n);
      if (p) { if (hasTag(g, 'weapon')) n.inv.weapon = 1; hist(n, `Buys ${g} (${p.toFixed(1)})`); }
    });
    const surplus = S.treasury - (100 + S.npcs.length * 4), poor = S.npcs.filter(n => n.coin < 4 && !n.hero);
    if (surplus > 0 && poor.length) { const pot = surplus * 0.35, each = pot / poor.length; S.treasury -= pot; poor.forEach(n => { n.coin += each; n.earned += each; hist(n, `Paid ${each.toFixed(1)} for public works`); }); }
    S.npcs.forEach(n => { n.earnedY = n.earned; n.earned = 0; n.gz = prof(n).kind === 'gatherer' && rnd() < 0.3 ? null : n.gz; });
    S.earning = S.npcs.filter(n => n.earnedY >= 3).length / Math.max(1, S.npcs.length);
    S.fear = Math.max(0, S.fear * 0.88 - 0.1);
    if (S.ration) S.ration--;
    computeDials(S);
    if (S.npcs.some(n => prof(n).provides.includes('order'))) { let t = 0; S.npcs.forEach(n => { if (n.coin >= 10) { n.coin -= 1; t++; } }); S.treasury += t; }
    const short = shortestGood(S);
    if (short) { const idle = S.npcs.filter(n => !n.child && ['producer', 'merchant', 'service', 'beggar', 'gatherer'].includes(prof(n).kind) && !fightsJob(n) && n.earnedY < 3 && n.coin < 20 && n.coin >= (short.job._cost || 0) * 3 && n.job !== short.job.name).sort((a, b) => a.earnedY - b.earnedY)[0];
      if (idle) changeJob(S, idle, short.job.name, `${short.good} ${/s$/.test(short.good) ? 'sell' : 'sells'} for ${price(S, short.good).toFixed(1)} and their old work earned ${idle.earnedY.toFixed(0)} yesterday`); }
    if (D.builder && S.slots.length && S.npcs.filter(n => n.home == null).length >= 2 && !S.npcs.some(n => n.job === D.builder)) { const c = S.npcs.filter(n => prof(n).kind !== 'inn' && !n.hero).sort((a, b) => a.earnedY - b.earnedY)[0]; if (c) changeJob(S, c, D.builder, 'people are sleeping rough and nobody is building'); }
    const fd = foodDays(S);
    S.lowFoodDays = fd < 0.8 ? S.lowFoodDays + 1 : 0;
    if (S.lowFoodDays === 1) log('notable', `Food is running low in ${S.name}: about ${fd.toFixed(1)} days left.`, { town: S.id }, { kind: 'famine' });
    S.npcs.forEach(n => { const j = prof(n);
      if (j.kind === 'service' && n.unpaid >= 16) { n.unpaid = 0; const f = Object.values(D.professions).find(p => p.w > 0 && p.makes.some(m => isFoodGood(m.g))); if (f) changeJob(S, n, f.name, 'the treasury stopped paying'); }
      else if (j.kind === 'beggar' && n.coin >= 25) changeJob(S, n, D.laborer, 'they finally have some coin');
      else if (j.kind === 'crafter' && n.coin < 4 && needBy(n, 'eat') > 70) changeJob(S, n, D.laborer, `${j.name} work no longer pays`); });
    if (S.npcs.length > 0 && S.npcs.length < 4 && W.day - (S.bornDay || 0) > 10) {
      const known = Object.values(S.ledger).filter(x => x.t === 'market' && x.town !== S.id).map(x => townById(x.town)).filter(t => t && t.npcs.length);
      const dest = known[0] || neighbours(S)[0];
      if (dest) { const Pt = startParty(S, 'migrants', [...S.npcs], { town: dest.id }, { doing: `Leaving ${S.name} for good`, why: `giving up on ${S.name}` }); if (Pt) { Pt.members.forEach(m => freeHome(S, m)); log('trigger', `The last ${Pt.members.length} people of ${S.name} give up and leave for ${dest.name}.`, { town: S.id }, { kind: 'abandoned' }); } }
      return;
    }
    // the desperate and the frightened leave, for somewhere they've heard is better
    const leaving = [];
    for (const n of [...S.npcs]) {
      if (n.hero || n.child || n.arc && !n.arc.done) continue;
      if (n.starve >= 24 && !n.life?.some(l => l.t === 'starving' && W.day - l.d < 20)) mark(n, 'starving', `Went hungry in ${S.name}`);
      const desperate = n.starve >= 24 || (n.rough >= 30 && n.coin < 3);
      const afraid = (S.fear >= 8 && ['monsters', 'death', 'the wilderness'].includes(P(n.fear)) && rnd() < 0.06) || (S.fear >= 5 && rnd() < scar(n, 'leave') * 0.01);
      if (!desperate && !afraid) continue;
      if (desperate && (pers(n, 'greedy', 'cynical', 'hot-tempered') || prof(n).kind === 'thief' || scar(n, 'outlaw') > 0) && rnd() < 0.4 + scar(n, 'outlaw') * 0.08 && becomeOutlaw(S, n, n.starve >= 24 ? 'starving' : 'with nothing left to lose')) continue;
      leaving.push({ n, why: afraid ? 'fleeing the danger' : n.starve >= 24 ? 'looking for food' : 'looking for a roof' });
      if (afraid) mark(n, 'fled', `Fled ${S.name}, afraid`);
    }
    for (const l of [...leaving]) for (const k of (l.n.kin?.kids || []).map(k => IDX.get(k.id))) if (k && k.child && k.town === S.id && !leaving.some(x => x.n === k)) leaving.push({ n: k, why: l.why });
    if (leaving.length) {
      const heard = Object.values(S.ledger).filter(x => x.t === 'market' && x.town !== S.id && x.fd > 1.5).map(x => townById(x.town)).filter(t => t && t !== S && t.npcs.length && t.fear < 5);
      const dest = heard[0] || neighbours(S)[0];
      if (dest) { const Pt = startParty(S, 'migrants', leaving.map(l => l.n), { town: dest.id }, { doing: `Leaving for ${dest.name}`, why: leaving[0].why }); if (Pt) { Pt.members.forEach(m => freeHome(S, m)); log('notable', `${leaving.length} leave ${S.name} for ${dest.name}, ${leaving[0].why}${heard[0] ? '' : '. They have heard nothing about it'}.`, { town: S.id }, { kind: 'leave' }); } }
      else { leaving.forEach(l => { removeFromTown(S, l.n); l.n.dead = true; IDX.delete(l.n.id); }); log('notable', `${leaving.length} leave ${S.name} and the region, ${leaving[0].why}.`, { town: S.id }, { kind: 'leave' }); }
    }
    const freeBeds = S.buildings.filter(b => b.type === 'house').reduce((t, b) => t + b.beds - b.residents.length, 0);
    if (fd >= 1.5 && S.fear < 5 && freeBeds > 0 && rnd() < 0.3 * S.earning) { const n = rollNPC(); addToTown(S, n, true); log('minor', `${nm(n)}, ${art(n.race)} ${n.race} ${n.job}, arrives in ${S.name} looking for work.`, { town: S.id }, { kind: 'arrival' }); }
    if (S.npcs.length >= S.founded * 1.5) log('trigger', `${S.name} has grown by half since its founding.`, { town: S.id }, { key: 'grow50:' + S.id, repeat: 'skip', kind: 'growth' });
    if (S.npcs.length <= S.founded * 0.6 && S.npcs.length > 0) log('trigger', `${S.name} has lost ${Math.round((1 - S.npcs.length / S.founded) * 100)}% of its people.`, { town: S.id }, { key: 'shrink:' + S.id, repeat: 'skip', kind: 'decline' });
    for (const g of Object.keys(D.goods)) {
      const G = good(g); const k = 1 - (G.spoils || 0) * (season() === 'winter' || season() === 'autumn' ? 0.5 : 1);
      if (k < 1) { S.market.stock[g] = (S.market.stock[g] || 0) * k; (S.market.consign[g] || []).forEach(c => c.qty *= k); }
    }
    council_reports(S);
    heroicDawn(S);
    council(S);
    S.npcs.filter(n => prof(n).kind === 'merchant' && n.coin >= 15 && rnd() < 0.35).slice(0, 1).forEach(n => planTrade(S, n));
    S.peak = Math.max(S.peak, S.npcs.length);
    if (W.day % 2 === 0) writePaper(S);
  }
  function planTrade(S, n) {
    // trade on what the town believes about other markets; with no belief, go and find out
    let best = null;
    for (const x of Object.values(S.ledger).filter(x => x.t === 'market' && x.town !== S.id && W.day - x.day < 20)) {
      const T = townById(x.town); if (!T || !T.npcs.length) continue; const r = roadPath(S.id, T.id); if (!r || r.len > 700) continue;
      for (const [g, there] of Object.entries(x.prices || {})) {
        const here = price(S, g), stock = (S.market.stock[g] || 0) - (isFoodGood(g) ? foodTarget(S) * 45 / good(g).food * 0.5 : 6);
        if (stock < 3) continue;
        const qty = Math.min(stock, Math.floor(n.coin / here), 15), profit = (there * 0.9 - here) * qty - r.len / 100;
        if (profit > 6 && (!best || profit > best.profit)) best = { T, g, qty, profit };
      }
    }
    if (!best && rnd() < 0.3) { const T = pick(neighbours(S)); const g = Object.keys(D.goods).sort((a, b) => price(S, a) / good(a).price - price(S, b) / good(b).price)[0]; if (T && g && (S.market.stock[g] || 0) > 8) best = { T, g, qty: Math.min(8, Math.floor(n.coin / price(S, g))), profit: 0, guess: true }; }
    if (!best || best.qty < 1) return;
    let got = 0; for (let i = 0; i < best.qty; i++) if (buy(S, best.g, n)) got++;
    if (!got) return;
    const Pt = startParty(S, 'caravan', [n], { town: best.T.id }, { doing: `Carrying ${best.g} to ${best.T.name}${best.guess ? ' on a hunch' : ''}` });
    if (Pt) { Pt.cargo[best.g] = got; log(W.firsts['caravan'] ? 'minor' : 'trigger', `${nm(n)} takes a caravan of ${got} ${best.g} from ${S.name} to ${best.T.name}${best.guess ? ', hoping to find buyers' : ''}.`, { town: S.id }, { key: 'caravan', repeat: 'minor', kind: 'caravan' }); }
  }
  function heroicDawn(S) {
    const { total, worst } = townThreat(S);
    const pressing = total > Math.max(4, townForce(S)) * 0.7 && (W.day - S.lastDeath <= 5 || W.day - (S.failed || -99) <= 5);
    if (pressing && !S.npcs.some(n => n.hero) && rnd() < 0.35) {
      const c = S.npcs.filter(n => !n.sick && !n.injured && n.age < 60 && !n.child && !n.arc).map(n => ({ n, s: n.stats.reduce((a, b) => a + b, 0) / 6 + (pers(n, 'brave') ? 6 : 0) + (n.grief && !/old age|fever/.test(n.grief.cause) ? 8 : 0) + scar(n, 'hero') + (n.ambition && /hero/i.test(n.ambition) ? 10 : 0) + (['fame', 'adventure', 'revenge'].includes(P(n.want)) ? 4 : 0) + rnd() * 4 })).sort((a, b) => b.s - a.s)[0];
      if (c) makeHero(c.n, S, c.n.grief && !/old age|fever/.test(c.n.grief.cause) ? `after ${c.n.grief.name} ${c.n.grief.cause}` : worst?.x ? `as the ${worst.x.name || worst.x.src} close in` : 'when nobody else would');
    }
    for (const h of S.npcs.filter(n => n.hero && !n.injured && !n.sick)) {
      const b = W.bounties.filter(b => !b.done && !b.taken && townById(b.town)?.region === S.region).map(b => ({ b, p: popById(b.pop) })).filter(o => o.p).sort((a, c) => c.b.reward - a.b.reward)[0];
      const target = b?.p || (worst && worst.score > 3 ? worst.p : null);
      if (!target) continue;
      const believed = Object.values(S.ledger).find(x => x.t === 'danger' && x.pop === target.id)?.power ?? popPower(target);
      const pals = eligible(S, 3, 2, n => !n.hero && fighterish(n)).slice(0, npcPower(h) > believed ? 0 : 2);
      const team = [h, ...pals], tp = team.reduce((t, n) => t + npcPower(n), 0);
      if (tp < believed * (0.7 + (target.slew || 0) * 0.25) && rnd() > (believed > 60 ? 0.004 : 0.02)) continue;
      if (b) b.b.taken = true;
      const Pt = startParty(S, b ? 'bounty' : 'hunt', team, { zone: target.zone }, { target: target.id, bounty: b?.b.id, doing: `Hunting ${popName(target, true)}` });
      if (Pt) log('notable', `${nm(h)} the ${h.hero.cls.toLowerCase()} sets out from ${S.name} after ${popName(target, true)} of ${zoneOf(target).name}${b ? ` for a ${b.b.reward} coin bounty` : ''}${pals.length ? `, with ${pals.map(nm).join(' and ')}` : ''}.`, { town: S.id }, { kind: 'quest' });
    }
    for (const b of W.bounties.filter(b => b.town === S.id && !b.done && !b.taken)) {
      const p = popById(b.pop); if (!p) { b.done = true; S.treasury += b.reward; continue; }
      if (W.day - b.day > 20) { b.done = true; S.treasury += b.reward; log('notable', `${S.name}'s bounty on ${popName(p, true)} goes unclaimed and is withdrawn.`, { town: S.id }, { kind: 'bounty' }); continue; }
      const believed = Object.values(S.ledger).find(x => x.t === 'danger' && x.pop === p.id)?.power ?? popPower(p);
      const vol = eligible(S, 5, 1.5, n => !n.hero && fighterish(n) && (n.coin < 25 || n.grief || pers(n, 'brave', 'greedy', 'ambitious')));
      const vp = vol.reduce((t, n) => t + npcPower(n), 0) * (0.7 + rnd() * 0.6);
      if (vol.length >= 2 && vp >= believed * (0.8 + (p.slew || 0) * 0.2)) { b.taken = true; const Pt = startParty(S, 'bounty', vol, { zone: p.zone }, { target: p.id, bounty: b.id, doing: `Claiming the bounty on ${popName(p, true)}` }); if (Pt) log('notable', `${vol.map(nm).join(', ')} ${vol.length > 1 ? 'take' : 'takes'} up ${S.name}'s bounty on ${popName(p, true)}.`, { town: S.id }, { kind: 'quest' }); }
    }
  }

  /* ---------------- the wilds ---------------- */
  function ecology() {
    const s = season(), pops = [...W.pops];
    const eatsFood = d => d.eats.some(e => e !== 'people');
    // 1. FEEDING. In each place, everything that eats shares what is there. Stronger hunters get a bigger share.
    const byZone = new Map();
    for (const p of pops) { if (!byZone.has(p.zone)) byZone.set(p.zone, []); byZone.get(p.zone).push(p); p._got = 0; p._fedFood = null; }
    for (const [zid, list] of byZone) {
      const z = zoneById(zid); if (!z) continue;
      const eaters = list.filter(p => eatsFood(def(p)) && p.count >= 0.5);
      if (!eaters.length) continue;
      const want = new Map(eaters.map(c => { const d = def(c); return [c, c.count * (d.solo ? 2.5 : !isHostile(c) && d.kind === 'animal' ? 0.5 : 0.2)]; }));
      const foods = list.filter(q => !isHostile(q) && q.count >= 0.5 && eaters.some(c => c !== q && def(c).eats.includes(q.def)));
      const avail = new Map(foods.map(q => [q, q.count * (def(q).kind === 'plant' ? 0.6 : 0.25)]));
      for (const q of foods) {
        const claims = eaters.filter(c => c !== q && def(c).eats.includes(q.def)).map(c => {
          const mine = foods.filter(f => def(c).eats.includes(f.def)), tot = mine.reduce((t, f) => t + avail.get(f), 0) || 1;
          const wish = want.get(c) * avail.get(q) / tot, edge = 1 + Math.sqrt(Math.max(0, popPower(c))) * 0.15;
          return { c, wish, w: wish * edge };
        });
        const wishT = claims.reduce((t, x) => t + x.wish, 0); if (!wishT) continue;
        const given = Math.min(avail.get(q), wishT), wT = claims.reduce((t, x) => t + x.w, 0);
        for (const x of claims) x.c._got += Math.min(given * x.w / wT, x.wish * 1.2);
        q.count = Math.max(0, q.count - given); q._lost = (q._lost || 0) + given;
      }
      for (const c of eaters) c._fedFood = want.get(c) > 0 ? Math.min(1, c._got / want.get(c)) : 1;
      // two great beasts of a kind will not share ground: the young leave, the weaker is driven off
      const solos = list.filter(p => def(p).solo && p.count >= 0.5);
      for (let i = 0; i < solos.length; i++) for (let j = i + 1; j < solos.length; j++) {
        const a = solos[i], b = solos[j]; if (a.def !== b.def) continue;
        const [win, lose] = popPower(a) >= popPower(b) ? [a, b] : [b, a];
        lose._evicted = true;
        if (!lose.young && !win.young) log('notable', `Two ${a.def}s fight over ${z.name}. The weaker is driven off.`, { zone: z.id }, { kind: 'rival' });
        else if (lose.young && lose.parent === win.id && !lose.leftNest) { lose.leftNest = true; log('notable', `The young ${lose.def} leaves ${z.name} to find a land of its own.`, { zone: z.id }, { kind: 'brood' }); }
      }
      // hungry hunters of the same food fight over it; the loser is driven out
      const rivals = eaters.filter(c => isHostile(c) && c._fedFood < 0.7);
      for (let i = 0; i < rivals.length; i++) for (let j = i + 1; j < rivals.length; j++) {
        const a = rivals[i], b = rivals[j];
        if (a.def === b.def || !def(a).eats.some(e => e !== 'people' && def(b).eats.includes(e)) || rnd() > 0.4) continue;
        const pa = popPower(a) * (0.6 + rnd() * 0.8), pb = popPower(b) * (0.6 + rnd() * 0.8), [win, lose] = pa >= pb ? [a, b] : [b, a];
        if (!def(lose).solo) lose.count *= 0.7; if (!def(win).solo) win.count *= 0.92;
        lose._evicted = true; win.xp += 3;
        log(W.firsts['rival:' + win.def + ':' + lose.def] ? 'minor' : 'notable', `${popName(win)} ${v(win, 'drive', 'drives')} ${popName(lose, true)} out of ${z.name}. There is not enough food for both.`, { zone: z.id }, { key: 'rival:' + win.def + ':' + lose.def, repeat: 'minor', kind: 'rival', data: { foe: popName(win), zone: z.name } });
      }
    }
    // 2. CONSEQUENCES. Fed things breed if they are safe; hungry, hunted or crowded things move; starving things die back.
    for (const p of pops) {
      if (!W.pops.includes(p)) continue;
      const d = def(p), z = zoneOf(p); if (!z) { removePop(p); continue; }
      const sizeK = z.r / 90;
      if (d.kind === 'plant' && !isHostile(p)) {
        const target = d.cap * sizeK * (inSeason(d) ? 1 : 0.12);
        p.count += (target - p.count) * (inSeason(d) ? d.regrow : 0.25);
        if (p.count < 1 && d.regrow > 0 && inSeason(d)) p.count = 1;
        p._lost = 0;
      } else if (d.kind === 'mineral') p.count = Math.min(d.cap * sizeK, p.count + d.cap * d.regrow);
      else {
        const eatsPeople = d.eats.includes('people'), undying = d.rises || d.dark || d.spreads, foodEater = eatsFood(d), hostile = isHostile(p);
        const fromPeople = eatsPeople ? Math.min(1, (p.fedPeople || 0) * (d.solo ? 0.6 : 0.5) / Math.max(0.5, p.count * 0.3)) : 0;
        const fromLoot = d.raids ? Math.min(1, (p.fedLoot || 0) / Math.max(1, p.count * 2)) : 0;
        p.fedPeople = 0; p.fedLoot = 0;
        let fed = (foodEater || eatsPeople || d.raids) ? Math.min(1, (p._fedFood || 0) + fromPeople + fromLoot) : 1;
        p.fed = fed; p.fedAvg = (p.fedAvg ?? fed) * 0.6 + fed * 0.4;
        p.mem.z[z.id] = p.mem.z[z.id] == null ? fed : p.mem.z[z.id] * 0.5 + fed * 0.5;
        if (fed >= 0.7) p.hunger = Math.max(0, p.hunger - 0.6); else p.hunger = Math.min(8, p.hunger + (1 - fed) * 0.8);
        if (!undying && p.hunger > 3) p.count *= hostile ? 0.88 : 0.93;
        const lostFrac = (p._lost || 0) / Math.max(1, p.count + (p._lost || 0)); p._lost = 0;
        const safety = clamp(1 - lostFrac * 3, 0.1, 1); p.safety = safety;
        const preyHere = W.pops.filter(q => q.zone === z.id && d.eats.includes(q.def) && !isHostile(q)).reduce((t, q) => t + q.count, 0);
        const cap = hostile ? (d.raids ? 22 : Math.max(3, preyHere / 2) * 1.4) : d.cap * sizeK;
        if (!d.solo && !undying && d.growth > 0 && fed >= 0.6) {
          const br = d.season.length ? (inSeason(d) ? 1.3 : 0.2) : hostile ? (s === 'winter' ? 0.3 : 1) : BREED[s];
          p.count += d.growth * p.growthX * br * safety * fed * p.count * (1 - p.count / cap);
        }
        if (!hostile && p.count < 3 && rnd() < 0.15) p.count += 1;
        if (undying) {
          const deaths = W.deathsNear[z.id] || 0;
          if (d.rises === 'deaths' && deaths) { p.count += deaths * 0.5; W.deathsNear[z.id] = 0; }
          p.count += d.growth * p.growthX * p.count * (1 + (d.dark ? W.weird * 0.2 : 0)) * (1 - p.count / 25);
        }
        if (p.chief != null) p.count = Math.min(p.count, undying ? 6 : 8);
        const crowded = !d.solo && !undying && p.count > cap * (hostile ? 1 : 0.95);
        if (hostile) p.aggro = clamp(0.2 + p.hunger * 0.45 + (p.level >= 3 ? 0.4 : 0) + (p.count > 10 ? 0.3 : 0) + (crowded ? 0.5 : 0) + (eatsPeople ? 0.2 : 0) + (d.raids ? 0.4 : 0) + (undying ? 0.5 + (d.dark ? W.weird * 0.1 : 0) : 0), 0, 3);
        // moving on
        const hungry = fed < 0.7, unsafe = !hostile && safety < 0.45, restless = d.solo && !hungry && rnd() < (d.hoards && p.settled === z.id ? 0.03 : 0.25);
        const range = d.roams || (d.solo ? 350 : 0);
        const reach = new Set([...(z.near || []), ...(range ? W.zones.filter(o => o !== z && o.region === z.region && dist(o, z) <= range).map(o => o.id) : [])]);
        const go = p._evicted || ((hungry || crowded || unsafe || restless) && rnd() < (undying ? 0.35 : 0.5));
        if (go && reach.size) {
          const nearestTown = nz => Math.min(...W.towns.filter(t => t.npcs.length && t.region === nz.region).map(t => dist(t, nz) - nz.r), 9999);
          const opts = p._evicted ? [] : [{ z, s: restless ? 0.2 : fed * (hostile ? 1 : safety) }];
          for (const [zid, val] of Object.entries(p.mem.z)) { const nz = zoneById(+zid); if (nz && nz !== z && reach.has(nz.id)) opts.push({ z: nz, s: val * 0.95 - dist(nz, z) / 1500 }); }
          for (const id of reach) { if (p.mem.z[id] != null) continue; const nz = zoneById(id); if (!nz || !(d.area.some(a => nz.terrains.includes(a)) || d.solo || eatsPeople)) continue;
            opts.push({ z: nz, s: 0.45 + rnd() * 0.25 + (eatsPeople ? (1 - clamp(nearestTown(nz) / 500, 0, 1)) * 0.35 : 0) - (hostile ? 0 : W.pops.filter(q => q.zone === nz.id && isHostile(q)).length * 0.1), explore: true }); }
          const choices = opts.filter(o => o.z !== z);
          const best = restless ? choices.sort(() => rnd() - 0.5)[0] : opts.sort((a, b) => b.s - a.s)[0];
          if (best && best.z !== z) {
            if (!hostile) {                                             // part of a herd moves on and settles
              const m = p.count * (unsafe ? 0.4 : 0.3); p.count -= m; const np = spawnPop(p.def, best.z, m, true); if (np) np.mem = JSON.parse(JSON.stringify(p.mem));
              if (m >= 5) log('minor', `${title(p.def)} ${unsafe ? 'flee the hunting in' : 'leave the bare ground of'} ${z.name} for ${best.z.name}.`, { zone: best.z.id }, { kind: 'herd' });
            } else if (crowded && p.count >= 8 && d.pack) {
              const half = Math.floor(p.count / 2); p.count -= half;
              const np = spawnPop(p.def, best.z, half, true); if (np) { np.mutation = p.mutation; np.mult = p.mult; np.tags = [...p.tags]; np.level = Math.max(1, p.level - 1); np.aggro = p.aggro; np.mem = JSON.parse(JSON.stringify(p.mem)); np.movedDay = W.day; }
              log(W.firsts['spread:' + p.def] ? 'notable' : 'trigger', `${popName(p)} have outgrown ${z.name}. ${half} break away into ${best.z.name}${best.explore ? '' : ', where they have fed before'}.`, { zone: best.z.id }, { key: 'spread:' + p.def, repeat: 'notable', kind: 'spread', data: { foe: popName(p), zone: best.z.name } });
            } else {
              const from = z.name; p.zone = best.z.id; p.movedDay = W.day; p.settled = null;
              const nearT = W.towns.filter(t => t.npcs.length && dist(t, best.z) - best.z.r < 200).sort((a, b) => dist(a, best.z) - dist(b, best.z))[0];
              log(restless && !nearT ? 'minor' : 'notable', restless ? `${popName(p)} ${v(p, 'have', 'has')} been seen over ${best.z.name}${nearT ? `, not far from ${nearT.name}` : ''}.`
                : p._evicted ? `Driven out, ${popName(p, true)} ${v(p, 'retreat', 'retreats')} from ${from} to ${best.z.name}.`
                : `${eatsPeople && !foodEater ? `Hungering for the living, ${popName(p, true)}` : `Hungry, ${popName(p, true)}`} ${d.rises ? v(p, 'shamble', 'shambles') : v(p, 'leave', 'leaves')} ${from} ${d.rises ? 'towards' : 'for'} ${best.z.name}${best.explore ? '' : ', where they have fed before'}.`, { zone: best.z.id }, { kind: 'move', data: { foe: popName(p), zone: best.z.name } });
            }
          }
        }
        p._evicted = false;
        if (d.broods && d.solo) brood(p, d, z);
        // a hostile thing that keeps eating well where it moved to settles there
        if (hostile && p.movedDay && W.day - p.movedDay >= 3 && p.fedAvg >= 0.75 && p.settled !== z.id) { p.settled = z.id; log('notable', `${popName(p)} ${v(p, 'have', 'has')} made ${z.name} ${v(p, 'their', 'its')} home.`, { zone: z.id }, { kind: 'settle', data: { foe: popName(p), zone: z.name } }); }
      }
      const lvl = 1 + Math.floor(Math.sqrt(p.xp / 8));
      if (lvl > p.level) {
        p.level = lvl;
        if (lvl === 3 && !p.leader && !d.solo && isHostile(p)) { p.leader = pick(ALPHA); log('trigger', `A leader emerges among the ${(p.mutation || p.def).toLowerCase()} of ${z.name}. They call it ${p.leader}.`, { zone: z.id }, { kind: 'leader', data: { foe: popName(p), zone: z.name } }); }
        if (d.mutates && rnd() < 0.25 + W.weird * 0.03) mutate(p);
      } else if (d.mutates && rnd() < 0.0015 * (1 + W.weird)) mutate(p);
      if (p.tags.includes('dark') || d.dark) W.weird = Math.min(10, W.weird + 0.015);
      if (p.count < 0.6 && d.kind !== 'plant') removePop(p, isHostile(p) ? `${popName(p)} ${p.hunger > 3 ? 'starve and vanish from' : 'vanish from'} ${z.name}.` : null);
    }
    for (const z of W.zones) {                    // empty land is recolonised now and then
      if (rnd() > 0.012) continue;
      const preyN = W.pops.filter(q => q.zone === z.id && !isHostile(q) && D.sources[q.def]?.kind === 'animal').reduce((t, q) => t + q.count, 0);
      const C = Object.values(D.sources).filter(c => c.eats.length && !c.solo && c.spawn > 0 && c.area.some(a => z.terrains.includes(a)));
      if (preyN > 30 && C.length && !W.pops.some(q => q.zone === z.id && isHostile(q) && def(q).eats.length)) { const np = spawnPop(wpick(C, 'spawn').name, z, ri(3, 5), true); if (np) log('notable', `${popName(np)} drift into ${z.name} from beyond the region, drawn by the game.`, { zone: z.id }, { kind: 'arrive-wild' }); }
    }
    const riser = Object.values(D.sources).find(s => s.rises === 'deaths');
    if (riser) for (const [zid, dn] of Object.entries(W.deathsNear)) {
      const z = zoneById(+zid);
      if (z && dn >= 5 && (riser.area.some(a => z.terrains.includes(a)) || W.weird >= 3) && !W.pops.some(p => p.zone === z.id && p.def === riser.name) && rnd() < 0.3) { spawnPop(riser.name, z, Math.ceil(dn / 2), true); W.deathsNear[zid] = 0; log('trigger', `The dead do not rest in ${z.name}. Too many have died there.`, { zone: z.id }, { kind: 'undead', data: { zone: z.name } }); }
    }
    W.weird = Math.max(0, W.weird * 0.985 - 0.03);
  }
  function mutate(p) {
    if (p.mutation) return;
    const opts = D.mutations.filter(m => m.of === p.def); if (!opts.length) return;
    const m = wpick(opts), before = popName(p);
    p.mutation = m.becomes; p.mult *= m.power; p.growthX *= m.growth;
    if (m.tag) p.tags.push(m.tag);
    if (m.tag === 'hostile') p.aggro = Math.max(p.aggro, 0.8);
    if (m.tag === 'dark') W.weird = Math.min(10, W.weird + 1);
    log('trigger', `${before} of ${zoneOf(p).name} ${v(p, 'have', 'has')} changed. ${v(p, 'They are', 'It is')} ${/s$/.test(m.becomes) ? '' : 'a '}${m.becomes.toLowerCase()} now.`, { zone: p.zone }, { kind: 'mutation', data: { foe: before, becomes: m.becomes, zone: zoneOf(p).name } });
  }
  function nightRaids() {
    for (const p of [...W.pops]) {
      if (!isHostile(p) || p.aggro < 0.8) continue;
      const z = zoneOf(p);
      const cand = W.towns.filter(t => t.region === z.region && t.npcs.length && (dist(t, z) - z.r < 170 || ((p.mem.raid[t.id] ?? 0) > 0.6 && dist(t, z) - z.r < 320)));
      for (const S of cand.sort((a, b) => (p.mem.raid[b.id] ?? 0.5) - (p.mem.raid[a.id] ?? 0.5) || dist(a, z) - dist(b, z)).slice(0, 1)) {
        const learnedK = 0.5 + (p.mem.raid[S.id] ?? 0.5);
        if (rnd() < 0.05 * p.aggro * Math.min(1.5, popPower(p) / 10) / (1 + S.palisade * 0.6) * learnedK * (def(p).raids ? 1.3 : 1) * (def(p).eats.includes('people') && p.hunger > 1 ? 1.6 : 1)) raid(p, S);
      }
    }
  }
  function raid(p, S) {
    const z = zoneOf(p), d = def(p);
    const defenders = S.npcs.filter(n => (fightsJob(n) || n.hero) && !n.sick && !n.injured);
    const dfn = (defenders.reduce((t, n) => t + npcPower(n), 0) + S.palisade * 8 + S.npcs.length * 0.5) * (0.6 + rnd() * 0.8);
    const att = popPower(p) * (0.6 + rnd() * 0.8);
    noteThreat(S, p, 'raid');
    const remember = v => p.mem.raid[S.id] = (p.mem.raid[S.id] ?? 0.5) * 0.6 + v * 0.4;
    if (dfn > att) {
      const lost = d.solo ? 0 : Math.ceil(p.count * 0.25);
      p.count -= lost; p.aggro = Math.max(0.2, p.aggro - 0.4); defenders.forEach(n => { n.xp += 3; if (n.hero) heroXP(n, 4); });
      S.fear = Math.min(10, S.fear + 0.5); remember(0);
      log('notable', `${popName(p)} ${v(p, 'come', 'comes')} for ${S.name} in the night and ${v(p, 'are', 'is')} driven off${lost ? `, ${lost} slain` : ''}${defenders.length ? ` by ${defenders.slice(0, 3).map(nm).join(', ')}` : ' by the townsfolk'}.`, { town: S.id }, { kind: 'repelled', data: { foe: popName(p) } });
      if (p.count < 0.6) removePop(p, `${popName(p)} of ${z.name} are wiped out.`);
      return;
    }
    const stolen = takeFood(S, att * (p.chief != null ? 0.35 : 1.2));
    const victims = [], exposed = S.npcs.filter(n => n.home == null || n.action !== 'sleep' || prof(n).kind === 'gatherer');
    const k = p.chief != null ? (rnd() < 0.35 ? 1 : 0) : att / Math.max(1, dfn) > 1.8 ? ri(1, 3) : rnd() < 0.45 ? 1 : 0;
    for (let i = 0; i < k; i++) { const vv = pick(exposed.length ? exposed : S.npcs); if (vv && !victims.includes(vv)) victims.push(vv); }
    if (d.spreads === 'bite') for (const vv of [...victims]) if (rnd() < 0.5) { victims.splice(victims.indexOf(vv), 1); infect(vv, p); vv.injured = Math.max(vv.injured, ri(10, 30)); }
    victims.forEach(vv => kill(vv, `was killed when ${popName(p, true)} raided ${S.name}`, S, z, aboutPop(p)));
    victims.forEach(() => { curseSpread(p, S); rise(p, 1); });
    if (victims.length) S.npcs.filter(n => !n.child && rnd() < 0.25).forEach(n => mark(n, 'survived raid', `Lived through the night ${popName(p, true)} raided ${S.name}`, { ab: aboutPop(p) }));
    if (d.hoards && S.treasury > 0) { const g = S.treasury * 0.4; S.treasury -= g; p.hoard = (p.hoard || 0) + g; }
    if (p.chief) p.raids = (p.raids || 0) + 1;
    p.xp += 3 + victims.length * 2; p.hunger = Math.max(0, p.hunger - 2); if (d.raids) { p.loot += stolen; p.fedLoot = (p.fedLoot || 0) + stolen; } p.fedPeople = (p.fedPeople || 0) + victims.length + stolen / 15;
    remember(1);
    S.fear = Math.min(10, S.fear + 2 + victims.length);
    if (victims.length) { noteThreat(S, p, 'death'); S.threats[p.id].deaths += victims.length - 1; }
    if (p.chief != null && d.raids) { const t = Math.min(S.treasury * 0.1, 10); S.treasury -= t; p.loot += t; }
    if ((d.raids || d.solo || d.rises || d.dark) && p.chief == null && att > dfn * 3 && S.npcs.length <= 30 && rnd() < 0.3) { sackTown(S, p); return; }
    log(W.firsts['raid:' + S.id] ? 'notable' : 'trigger', `${popName(p)} from ${z.name} ${v(p, 'raid', 'raids')} ${S.name} in the night${stolen > 1 ? `, carrying off ${Math.round(stolen)} meals of food` : ''}${victims.length ? `. ${victims.length} dead` : ''}.`, { town: S.id }, { key: 'raid:' + S.id, repeat: 'notable', kind: 'raid', data: { foe: popName(p), dead: victims.length, zone: z.name } });
  }

  // a town overrun: survivors flee to a town they know, and the place becomes ruins the attackers can settle
  function sackTown(S, p) {
    const z = zoneOf(p), survivors = [...S.npcs];
    S.buildings.filter(b => b.type === 'house' && rnd() < 0.6).forEach(b => { b.burned = W.day; b.beds = 0; b.residents = []; });
    S.market.stock = {}; S.treasury = 0; S.sacked = W.day; S.fear = 10;
    const dead = survivors.filter(() => rnd() < 0.25); dead.forEach(n => kill(n, `died when ${popName(p, true)} overran ${S.name}`, S, z, aboutPop(p)));
    const alive = S.npcs.slice();
    S.sackedBy = aboutPop(p);
    alive.forEach(n => mark(n, 'town sacked', `Fled the burning of ${S.name}`, { ab: aboutPop(p) }));
    const known = Object.values(S.ledger).filter(x => x.t === 'market' && x.town !== S.id).map(x => townById(x.town)).filter(t => t && t.npcs.length);
    const dest = known[0] || neighbours(S).filter(t => !t.sacked)[0];
    if (dest && alive.length) { const Pt = startParty(S, 'migrants', alive, { town: dest.id }, { doing: `Fleeing to ${dest.name}`, why: `fleeing the ruin of ${S.name}` }); if (Pt) Pt.members.forEach(m => freeHome(S, m)); }
    else alive.forEach(n => { removeFromTown(S, n); n.dead = true; IDX.delete(n.id); });
    S.npcs.length = 0;
    const ruin = { id: W.nextZone++, region: S.region, type: 'ruins', terrains: ['ruins'], x: S.x, y: S.y, r: 36, tags: ['town-ruins'], name: `The ruins of ${S.name}`, near: [], townRuin: S.id };
    W.zones.forEach(o => { if (o.region === ruin.region && dist(o, ruin) < o.r + ruin.r + 200) { ruin.near.push(o.id); (o.near ||= []).push(ruin.id); } });
    W.zones.push(ruin);
    if (def(p).solo || rnd() < 0.6) { p.zone = ruin.id; p.movedDay = W.day; }
    if (p.chief) p.raids = (p.raids || 0) + 2;
    log('trigger', `${popName(p)} ${v(p, 'overrun', 'overruns')} ${S.name}. The town burns${dest && alive.length ? `, and ${alive.length} survivors flee to ${dest.name}` : ''}.`, { town: S.id }, { kind: 'sacked', data: { foe: popName(p), town: S.name } });
  }

  /* ---------------- events and your hand ---------------- */
  function rollEvents() {
    for (const R of W.regions) {
      if (rnd() > 0.1 * (1 + W.weird * 0.08)) continue;
      const ev = D.events.filter(e => e.w > 0 && (e.season === 'any' || e.season === season()));
      if (ev.length) applyEvent(wpick(ev), { region: R.id });
    }
  }
  function targetFor(scope, ref) {
    const R = W.regions.find(r => r.id === (ref.region ?? (ref.town != null ? townById(ref.town)?.region : zoneById(ref.zone)?.region))) || W.regions[0];
    if (scope === 'town') return { town: ref.town != null ? townById(ref.town) : pick(W.towns.filter(t => t.region === R.id && t.npcs.length)), R };
    if (scope === 'zone') { let z = ref.zone != null ? zoneById(ref.zone) : null; if (!z && ref.town != null) z = zoneById(townById(ref.town).wilds[0]); return { zone: z || pick(W.zones.filter(z => z.region === R.id)), R }; }
    return { R };
  }
  function applyEvent(e, ref = {}, forced) {
    const scope = e.scope || 'region', tg = targetFor(scope, ref);
    if ((scope === 'town' && !tg.town) || (scope === 'zone' && !tg.zone)) return false;
    const eff = String(e.effect || '').trim(), days = +e.days || 0;
    const towns = tg.town ? [tg.town] : W.towns.filter(t => t.region === tg.R.id && t.npcs.length);
    const zones = tg.zone ? [tg.zone] : W.zones.filter(z => z.region === tg.R.id);
    const text = String(e.text || e.name).replace('{region}', tg.R.name).replace('{town}', tg.town?.name || '').replace('{zone}', tg.zone?.name || '');
    const lref = tg.town ? { town: tg.town.id } : tg.zone ? { zone: tg.zone.id } : { region: tg.R.id };
    let m;
    if ((m = eff.match(/^spawn\s+(.+?)\s+(\d+)?\s*$/i)) || (m = eff.match(/^spawn\s+(.+)$/i))) {
      const name = m[1].trim().toLowerCase(), d = D.sources[name]; if (!d) return false;
      const z = tg.zone && d.area.some(a => tg.zone.terrains.includes(a)) ? tg.zone : (zones.find(zz => d.area.some(a => zz.terrains.includes(a))) || tg.zone || pick(zones));
      const p = spawnPop(name, z, +(m[2] || ri(d.start[0], d.start[1])), true); if (p && d.hostile) p.aggro = Math.max(p.aggro, 0.7);
    } else if ((m = eff.match(/^([a-z ]+?)\s*x\s*([\d.]+)$/i))) {
      const what = m[1].trim().toLowerCase(), x = +m[2];
      if (D.buildings[what] || Object.values(D.professions).some(p => p.building === what)) towns.forEach(t => t.mods.push({ type: what, x, until: W.day + (days || 7), name: e.name }));
      else zones.forEach(z => W.pops.filter(p => p.zone === z.id && matches(def(p), [what])).forEach(p => p.count *= x));
    } else if ((m = eff.match(/^weird\s*\+?\s*([\d.]+)/i))) W.weird = Math.min(10, W.weird + +m[1]);
    else if ((m = eff.match(/^refugees\s*(\d+)/i))) towns.forEach(t => { for (let i = 0; i < +m[1]; i++) addToTown(t, rollNPC(), true); });
    else if (/^plague/i.test(eff)) towns.forEach(t => t.npcs.slice(0, Math.max(1, Math.floor(t.npcs.length * 0.15))).forEach(n => n.sick = ri(40, 90)));
    else if (/^fair/i.test(eff)) towns.forEach(t => { t.market.coin += 60; t.npcs.forEach(n => n.coin += 3); });
    else if (/^ruins/i.test(eff)) { const z = tg.zone || pick(zones); if (!z.tags.includes('ruins')) z.tags.push('ruins'); const riser = Object.values(D.sources).find(s => s.rises === 'deaths'); if (riser && rnd() < 0.4) spawnPop(riser.name, z, ri(2, 4), true); }
    else if (/^portal/i.test(eff)) { const z = tg.zone || pick(zones); z.tags.push('rift'); const dd = Object.values(D.sources).find(s => s.dark); const p = dd && spawnPop(dd.name, z, ri(3, 5), true); if (p) { p.tags.push('dark'); p.aggro = 1.2; } W.weird = Math.min(10, W.weird + 2.5); }
    else if (/^stranger/i.test(eff)) { const t = tg.town; const n = rollNPC(); n.ambition = pick(D.lists.ambitions.filter(a => !/^(none|nothing)/i.test(a.v))).v; n.secret = 20; addToTown(t, n, true); }
    else if (/^hero/i.test(eff)) { const t = tg.town; const c = t.npcs.filter(n => !n.hero).sort((a, b) => Math.max(...b.stats) - Math.max(...a.stats))[0]; if (c) makeHero(c, t, 'when the world called on them'); return true; }
    else if (/^fire/i.test(eff)) { const t = tg.town; const b = pick(t.buildings.filter(b => b.type === 'house')); if (b) { b.residents.forEach(id => { const n = IDX.get(id); if (n) { n.home = null; mark(n, 'home destroyed', `Lost their home to fire in ${t.name}`); } }); b.residents = []; b.burned = W.day; b.beds = 0; } takeFood(t, meals(t) * 0.4); t.fear += 2; }
    else if (/^bless/i.test(eff)) towns.forEach(t => { t.fear = 0; t.npcs.forEach(n => { n.sick = 0; n.injured = 0; setNeed(n, 'eat', x => Math.min(x, 20)); }); });
    else if ((m = eff.match(/^rumou?r\s+(plenty|danger)/i))) {
      const t = tg.town, z = zoneById(t.wilds[0]); const plenty = /plenty/i.test(m[1]);
      const src = plenty ? pick(Object.values(D.sources).filter(s => s.food > 0 && !s.hostile)) : pick(Object.values(D.sources).filter(s => s.hostile && !s.dark));
      const it = plenty ? { t: 'res', z: z.id, src: src.name, amt: ri(40, 80), day: W.day, conf: 0.7, hops: 2 } : { t: 'danger', z: z.id, pop: -W.nextPid++, src: src.name, name: title(src.name), amt: src.solo ? 1 : ri(10, 25), power: (src.solo ? 1 : 15) * src.power, day: W.day, conf: 0.7, hops: 2 };
      t.npcs.slice().sort(() => rnd() - 0.5).slice(0, 4).forEach(n => learn(n, it));
    }
    else if (eff) return false;
    log(forced ? 'trigger' : (/spawn|portal|plague|stranger/i.test(eff) ? 'trigger' : 'notable'), (forced ? 'The world intervenes. ' : '') + text, lref, { key: forced ? null : `event:${e.name}`, repeat: 'notable', kind: 'event', data: { event: e.name } });
    return true;
  }
  const INTERVENE = [
    { id: 'release', label: 'Release', scope: 'zone', choose: 'source', run: (ref, name) => applyEvent({ name: 'Release', scope: 'zone', effect: `spawn ${name}`, text: `${title(name)} ${D.sources[name]?.solo ? 'is' : 'are'} loosed upon {zone}.` }, ref, true) },
    { id: 'mutate', label: 'Mutate the wilds', scope: 'zone', run: ref => { const z = targetFor('zone', ref).zone; const ps = W.pops.filter(p => p.zone === z.id && !p.mutation && D.mutations.some(m => m.of === p.def)); if (!ps.length) { log('notable', `Nothing in ${z.name} can change.`, { zone: z.id }); return; } mutate(pick(ps)); } },
    { id: 'plenty', label: 'Abundance', scope: 'zone', run: ref => { const z = targetFor('zone', ref).zone; W.pops.filter(p => p.zone === z.id && !isHostile(p)).forEach(p => p.count *= 2); log('trigger', `The world intervenes. ${z.name} overflows with life.`, { zone: z.id }, { kind: 'event' }); } },
    { id: 'rift', label: 'Open a rift', scope: 'zone', run: ref => applyEvent({ name: 'Rift', scope: 'zone', effect: 'portal', text: 'A rift tears open in {zone}.' }, ref, true) },
    { id: 'drought', label: 'Drought', scope: 'region', run: ref => applyEvent({ name: 'Drought', scope: 'region', effect: 'farm x0.4', days: 12, text: 'A drought settles over {region}.' }, ref, true) },
    { id: 'comet', label: 'Green comet', scope: 'region', run: ref => applyEvent({ name: 'Comet', scope: 'region', effect: 'weird +3', text: 'A green comet hangs over {region}. The world grows strange.' }, ref, true) },
    { id: 'event', label: 'Roll an event', scope: 'region', run: ref => { const e = pick(D.events.filter(e => e.w > 0)); if (e) applyEvent(e, ref, true); } },
    { id: 'blight', label: 'Blight', scope: 'town', run: ref => applyEvent({ name: 'Blight', scope: 'town', effect: 'farm x0.2', days: 10, text: "Blight rots {town}'s crops." }, ref, true) },
    { id: 'plague', label: 'Fever', scope: 'town', run: ref => applyEvent({ name: 'Fever', scope: 'town', effect: 'plague', text: 'Fever breaks out in {town}.' }, ref, true) },
    { id: 'fire', label: 'Fire', scope: 'town', run: ref => applyEvent({ name: 'Fire', scope: 'town', effect: 'fire', text: 'Fire sweeps through part of {town}.' }, ref, true) },
    { id: 'harvest', label: 'Bumper harvest', scope: 'town', run: ref => applyEvent({ name: 'Harvest', scope: 'town', effect: 'farm x2', days: 8, text: '{town} is blessed with a bumper harvest.' }, ref, true) },
    { id: 'refugees', label: 'Refugees', scope: 'town', run: ref => applyEvent({ name: 'Refugees', scope: 'town', effect: 'refugees 6', text: 'Refugees pour into {town}.' }, ref, true) },
    { id: 'stranger', label: 'Stranger with a secret', scope: 'town', run: ref => applyEvent({ name: 'Stranger', scope: 'town', effect: 'stranger', text: 'A stranger with a secret arrives in {town}.' }, ref, true) },
    { id: 'hero', label: 'Raise a hero', scope: 'town', run: ref => applyEvent({ name: 'Hero', scope: 'town', effect: 'hero', text: '' }, ref, true) },
    { id: 'rumour-plenty', label: 'Rumour of plenty', scope: 'town', run: ref => applyEvent({ name: 'Rumour', scope: 'town', effect: 'rumour plenty', text: 'A rumour of easy food spreads in {town}. Nobody knows who started it.' }, ref, true) },
    { id: 'rumour-danger', label: 'Rumour of a monster', scope: 'town', run: ref => applyEvent({ name: 'Rumour', scope: 'town', effect: 'rumour danger', text: 'A rumour of a monster in the wilds spreads in {town}.' }, ref, true) },
    { id: 'bless', label: 'Blessing', scope: 'town', run: ref => applyEvent({ name: 'Blessing', scope: 'town', effect: 'bless', text: 'A blessing falls on {town}. The sick rise and fear lifts.' }, ref, true) },
    { id: 'region', label: 'Discover a new region', scope: 'world', run: () => addRegion() },
  ];

  /* ---------------- the newspaper ---------------- */
  const HEAD = {
    raid: ['{Foe} Raid {Town} in the Night', 'Night Terror in {Town}', '{Town} Attacked'], death: ['Mourning in {Town}', '{Name} Is Lost'], hero: ['A Hero Rises in {Town}', '{Name} Takes Up Arms'],
    bounty: ['Bounty on the {Foe}', '{Reward} Coin for the {Foe}'], slain: ['{Foe} Destroyed!', 'Victory in {Zone}'], beaten: ['{Foe} Driven Back', 'Blood in {Zone}'],
    huntfail: ['Disaster in {Zone}', 'Hunters Fall to the {Foe}'], mutation: ['Something Is Wrong in {Zone}', 'Strange Beasts in {Zone}'], spread: ['{Foe} on the Move', '{Foe} Spill Into {Zone}'],
    move: ['{Foe} on the Move'], famine: ['Shelves Bare in {Town}', 'Hunger in {Town}'], newtown: ['A New Town: {Town2}', 'Settlers Strike Out'], learned: ['{Town} Finds Its Answer', 'A Lesson Learned'],
    militia: ['{Town} Takes Up Spears'], palisade: ['Walls Rise in {Town}'], leader: ['The Pack Has a Leader'], dark: ['Darkness in {Town}', 'Gone Into the Woods'], coup: ['Coup in {Town}!'],
    exodus: ['An Exodus from {Town}'], trust: ['A Scout\'s Tall Tale'], repelled: ['{Town} Holds!', 'Raiders Driven Off'], ambush: ['Ambush on the Road'], undead: ['The Dead Walk'], event: ['{Event}'],
  };
  const QUOTES = {
    danger: { fearful: ["We'll all be eaten in our beds.", "I've barred my door and I'm not opening it."], brave: ['Let them come.', "I've seen worse. Probably."], grumpy: ["And what's the council doing about it? Nothing.", 'Typical.'], pious: ['The gods are testing us.'], other: ['Keep your children close.', "Nobody's going out past dark."] },
    food: { fearful: ["What will we eat come winter?"], brave: ["I'll go out and find food myself if I have to."], grumpy: ['Prices like these are robbery.', 'Somebody is hoarding. Mark my words.'], pious: ['We will be provided for.'], other: ['We will get through. We always do.', 'Tighten your belts.'] },
    good: { fearful: ["I'll believe it when I see it."], brave: ['About time.'], grumpy: ["Won't last."], pious: ['Praise be.'], other: ['A good day for the town.', "Drinks are on me. Well, one."] },
  };
  const tone = n => pers(n, 'cowardly', 'suspicious') ? 'fearful' : pers(n, 'brave', 'proud', 'hot-tempered') ? 'brave' : pers(n, 'grumpy', 'cynical', 'greedy') ? 'grumpy' : pers(n, 'pious') ? 'pious' : 'other';
  const topicOf = kind => ['raid', 'death', 'huntfail', 'mutation', 'spread', 'move', 'leader', 'dark', 'undead', 'ambush', 'bounty', 'militia'].includes(kind) ? 'danger' : ['famine', 'exodus'].includes(kind) ? 'food' : 'good';
  const SMALL = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'to', 'for', 'and', 'or', 'with', 'from', 'at', 'by', 'as', 'is', 'are']);
  const headCase = s => s.split(' ').map((w, i) => i && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  function headline(e, S) {
    const d = e.data || {};
    const opts = HEAD[e.kind];
    if (opts) {
      const h = pick(opts).replace('{Foe}', title(d.foe || 'Beasts')).replace('{Town2}', d.town || S.name).replace('{Town}', S.name).replace('{Name}', d.name || 'One of Our Own').replace('{Zone}', d.zone || 'the Wilds').replace('{Reward}', d.reward || 'Big').replace('{Event}', d.event || 'News');
      if (!/\{/.test(h)) return h;
    }
    const first = e.text.split(/[.:]/)[0].replace(/^The world intervenes\. /, '');
    return headCase(first.length > 60 ? first.slice(0, 57).replace(/\s+\S*$/, '') + '…' : first);
  }
  function quote(S, kind) {
    const n = pick(S.npcs); if (!n) return null;
    const t = topicOf(kind), set = QUOTES[t][tone(n)] || QUOTES[t].other;
    return { text: pick(set), who: `${nm(n)}, ${n.job}` };
  }
  function writePaper(S) {
    const since = S.paper.last || 0, now = W.day;
    const local = W.log.filter(e => e.town === S.id && e.level !== 'minor' && e.day > since && e.day <= now && !(e.kind === 'council'));
    const council = W.log.filter(e => e.town === S.id && e.kind === 'council' && e.day > since).slice(0, 3);
    const foreign = Object.values(S.ledger).filter(x => x.t === 'news' && x.town !== S.id && x.added > since).sort((a, b) => b.imp - a.imp || b.day - a.day);
    const streetNews = []; { const seen = new Set(foreign.map(x => x.k)); for (const n of S.npcs) for (const it of n.know) if (it.t === 'news' && it.town !== S.id && !seen.has(it.k) && it.day > since - 4) { seen.add(it.k); streetNews.push(it); } }
    const imp = e => (e.level === 'trigger' ? 3 : 2) + (['raid', 'hero', 'slain', 'huntfail', 'newtown', 'coup', 'dark', 'mutation', 'death', 'bounty'].includes(e.kind) ? 1 : 0) - (['forage', 'import', 'caravan', 'arrival', 'omen', 'scout_town', 'explore', 'job', 'report'].includes(e.kind) ? 2 : 0);
    const top = local.slice().sort((a, b) => imp(b) - imp(a) || b.id - a.id)[0];
    const issue = { no: ++S.paper.no, day: now, season: season(), year: year() };
    const ftop = foreign[0] && (foreign[0].imp || 2) + 1 > (top ? imp(top) : 0) ? foreign[0] : null;
    if (top && !ftop) { issue.headline = headline(top, S); issue.lead = top.text; issue.quote = quote(S, top.kind); issue.leadKind = top.kind; }
    else if (ftop) { const e = W.log.find(l => l.id === ftop.id) || { text: ftop.text, kind: ftop.kind }; issue.headline = headline(e, townById(ftop.town) || S); issue.lead = `Word reaches ${S.name} from ${townById(ftop.town)?.name || 'the road'}: ${ftop.text}`; issue.quote = quote(S, e.kind); issue.foreignLead = true; }
    else { issue.headline = pick([`A Quiet Few Days in ${S.name}`, `All Calm in ${S.name}`, `Nothing to Report, Says Council`]); issue.lead = `${S.name} goes about its business. ${S.npcs.length} souls, ${foodDays(S).toFixed(1)} days of food in the market.`; }
    issue.local = local.filter(e => issue.foreignLead || e !== top).sort((a, b) => imp(b) - imp(a)).slice(0, 5).map(e => e.text);
    const hedge = it => it.hops === 0 ? 'Travellers report' : it.hops < 2 ? 'Word on the road is' : pick(['Rumour has it', 'It is whispered', 'Some say']);
    issue.road = [...foreign.filter(x => !issue.foreignLead || x !== foreign[0]).slice(0, 4).map(x => ({ from: townById(x.town)?.name, text: x.text, how: x.w >= 0.8 ? 'From' : 'Unconfirmed, from' })),
      ...streetNews.slice(0, 2).map(x => ({ from: townById(x.town)?.name, text: x.text, how: `${hedge(x)}, from` }))].slice(0, 5);
    const rumours = [];
    for (const x of Object.values(S.ledger)) {
      if (x.added <= since - 2) continue;
      const z = zoneById(x.z); if (!z) continue;
      if (x.t === 'danger' && x.amt > 0 && (x.by === 'rumour' || x.hops > 0 || x.w < 0.9)) rumours.push(`${pick(['Some say', 'Rumour has it that', 'It is whispered that'])} ${describe(x)} ${D.sources[x.src]?.solo ? 'prowls' : 'prowl'} ${z.name}.`);
      else if (x.t === 'res' && D.sources[x.src]?.food && x.amt >= 20 && (x.by === 'rumour' || x.hops > 0)) rumours.push(`${pick(['Word is that', 'They say', 'Gossip has it that'])} ${x.src} ${/s$/.test(x.src) ? 'are' : 'is'} plentiful in ${z.name}.`);
    }
    issue.rumours = rumours.slice(0, 4);
    const notices = [];
    for (const b of W.bounties.filter(b => !b.done && (b.town === S.id || Object.values(S.ledger).some(x => x.t === 'news' && x.town === b.town)))) { const p = popById(b.pop); if (p) notices.push(`BOUNTY: ${b.reward} coin for ${popName(p, true)} of ${zoneOf(p).name}. Posted by ${townById(b.town)?.name}.`); }
    const sh = shortestGood(S); if (sh) notices.push(`WANTED: ${title(sh.job.name)}s. ${title(sh.good)} ${/s$/.test(sh.good) ? 'fetch' : 'fetches'} ${price(S, sh.good).toFixed(1)} coin at market.`);
    const staple = D.foodGoods.filter(g => (S.market.stock[g] || 0) >= 1).sort((a, b) => price(S, a) - price(S, b)).slice(0, 3);
    notices.push(staple.length ? `PRICES: ${staple.map(g => `${g} ${price(S, g).toFixed(1)}`).join(' · ')}` : 'PRICES: there is no food for sale.');
    if (S.ration) notices.push('BY ORDER OF THE COUNCIL: food is rationed.');
    Object.entries(S.avoid).filter(([, d]) => d > W.day).forEach(([zid]) => notices.push(`WARNING: the council advises everyone to keep away from ${zoneById(+zid)?.name}.`));
    issue.notices = notices.slice(0, 5);
    issue.council = council.map(e => e.text);
    const learnedNow = W.log.filter(e => e.town === S.id && e.kind === 'learned' && e.day > since);
    issue.council.push(...learnedNow.map(e => e.text));
    issue.obits = W.log.filter(e => e.town === S.id && e.kind === 'death' && e.day > since).map(e => e.text).slice(0, 5);
    const s = season(), left = SEASON_LEN - ((W.day - 1) % SEASON_LEN);
    issue.weather = s === 'autumn' ? `Autumn. Winter is ${left} days off. ${foodDays(S) > 6 ? 'The stores look good.' : 'The stores are thin.'}` : s === 'winter' ? `Deep winter. ${left} days to spring.` : s === 'spring' ? 'Spring. The wilds are waking.' : 'High summer.';
    S.paper.issues.unshift(issue); if (S.paper.issues.length > 8) S.paper.issues.length = 8;
    S.paper.last = now;
  }

  /* ---------------- clock ---------------- */
  function townHour(S) {
    for (const n of [...S.npcs]) {
      if (n.dead) continue;
      if (n.infected && biteHour(S, n)) continue;
      if (n.quarantined) {
        if (!n.infected) n.quarantined = false;
        else { setNeed(n, 'eat', x => x - 2); S.treasury = Math.max(0, S.treasury - 0.05); n.action = 'sick'; n.doing = 'Locked away with the bite'; const h = n.home != null ? S.buildings[n.home] : null; if (h && n.where !== h.id) { n.where = h.id; n.dest = spot(h); } continue; }
      }
      for (const d of Object.values(D.needs)) { if (d.met === 'sleep' && n.action === 'sleep') continue; n.needs[d.name] = clamp((n.needs[d.name] || 0) + d.rises * (d.met === 'eat' && S.ration ? 0.75 : 1), 0, 100); }
      if (n.working) { setNeed(n, 'eat', x => x + 1); setNeed(n, 'sleep', x => x + 1.5); }
      if (n.injured) n.injured--;
      if (n.sick) {
        n.sick--;
        const healer = S.npcs.some(o => prof(o).provides.includes('health') && o.action === 'work');
        if (rnd() < (healer ? 0.0012 : 0.003)) { kill(n, 'died of fever', S); continue; }
        if (rnd() < 0.012) { const o = pick(S.npcs.filter(o => o.where === n.where && !o.sick && o !== n)); if (o) o.sick = ri(30, 80); }
      }
      const hunger = needBy(n, 'eat');
      n.starve = hunger >= 100 ? n.starve + 1 : 0;
      if (hunger >= 100) setNeed(n, 'sleep', x => x + 3);
      if (n.starve >= 72) { kill(n, 'starved to death', S); continue; }
      act(S, n, decide(S, n));
    }
    if (S.npcs.filter(n => n.sick).length >= 3) log('trigger', `Fever spreads through ${S.name}.`, { town: S.id }, { key: 'fever:' + S.id + ':' + Math.floor(W.day / 20), repeat: 'skip', kind: 'fever' });
  }
  function tick() {
    W.hour++;
    if (W.hour >= 24) { W.hour = 0; W.day++; if ((W.day - 1) % SEASON_LEN === 0) log('minor', `${title(season())} comes, year ${year()}.`); }
    for (const S of W.towns) if (S.npcs.length) townHour(S);
    for (const Pt of W.parties) partyHour(Pt);
    W.parties = W.parties.filter(Pt => Pt.state !== 'done');
    if (W.hour === 2) nightRaids();
    if (W.hour === 6) {
      ecology();
      for (const S of W.towns) if (S.npcs.length) dawnTown(S);
      arcDawn();
      rollEvents();
      for (const S of W.towns) if (!S.npcs.length && !S.abandoned) { S.abandoned = W.day; log('trigger', `${S.name} stands empty. The last of its people are gone.`, { town: S.id }, { kind: 'abandoned' }); }
    }
  }
  function save() { W.savedAt = Date.now(); return JSON.stringify(W); }
  function load(json) {
    W = JSON.parse(json); D = Defs.compile(W.packs || W.defsText); IDX.clear();
    W.figures ||= []; W.history ||= []; W.deeds ||= [];
    if (W.campaign && !W.campaigns) W.campaigns = [{ ...W.campaign, party: W.campaign.party || W.party || null, partyAt: W.partyAt || null }];
    W.campaigns ||= []; if (W.campaign) W.campaign = W.campaigns.find(c => c.id === W.campaign.id) || W.campaigns[0] || null;
    W.towns.forEach(t => t.npcs.forEach(n => IDX.set(n.id, n))); W.parties.forEach(Pt => Pt.members.forEach(n => IDX.set(n.id, n))); W.figures.forEach(n => IDX.set(n.id, n));
    for (const n of IDX.values()) { n.life ||= []; n.scars ||= []; n.kin ||= { spouse: null, kids: [], parents: [] }; n.grudges ||= {}; if (n.child == null) n.child = false; }
    W.pending = []; return W;
  }
  return {
    createWorld, tick, save, load, describe, deed, seed, campOf, partyOf, RW, RH, onLand, threatKind, THREATS, changes, jobFor, addPerson, resolve, card, cast, scarsOf, scarText, titled, allPeople, band, regionOfP, addRegion, INTERVENE, applyEvent, foodDays, meals, price, prof, season, year, popName, popPower, isHostile, def, npcPower, townThreat, townForce, perceived, caseLabel, needBy,
    get W() { return W; }, get D() { return D; }, IDX, TW, TH, SEASON_LEN, title,
  };
})();
if (typeof module !== 'undefined') module.exports = Sim;
