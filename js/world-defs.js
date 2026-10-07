// Rolled World — part of the GeezSheets world sim (world.html). Built file: edit the sources, not this.
/* ================= DEFINITIONS =================
   Parses "+ template / key: value" text into a registry the engine reads.
   The engine never looks for a particular name; it reads properties.          */
const Defs = (() => {
  const TEMPLATES = ['race', 'names', 'list', 'need', 'good', 'profession', 'building', 'settlement', 'terrain', 'animal', 'plant', 'mineral', 'monster', 'mutation', 'event', 'scar', 'arc', 'deed', 'world', 'place', 'person', 'happened', 'party'];
  const low = s => String(s ?? '').trim().toLowerCase();
  const list = v => String(v ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const llist = v => list(v).map(low);
  const num = (v, d) => { if (v == null || v === '') return d; const n = parseFloat(String(v).replace(/^x/i, '')); return Number.isFinite(n) ? n : d; };
  const mult = (v, d = 1) => { if (v == null || v === '') return d; const s = String(v).trim(); const n = parseFloat(s.replace(/^x/i, '')); return Number.isFinite(n) ? n : d; };
  const range = (v, d) => { if (v == null || v === '') return d; const m = String(v).match(/(-?[\d.]+)\s*(?:-|to)\s*(-?[\d.]+)/); if (m) return [+m[1], +m[2]]; const n = parseFloat(v); return Number.isFinite(n) ? [n, n] : d; };
  const bool = (v, d = false) => v == null || v === '' ? d : /^(true|yes|1|on)$/i.test(String(v).trim());
  const weighted = v => list(v).map(s => { const m = s.match(/^(.*?)\s+x\s*([\d.]+)$/i); return m ? { v: m[1].trim(), w: +m[2] } : { v: s, w: 1 }; });
  const title = s => String(s).replace(/\b[a-z]/g, c => c.toUpperCase());

  function parse(text, file = '') {
    const blocks = [], issues = [];
    let cur = null;
    String(text).split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const m = line.match(/^\+\s*([a-z][a-z _]*)$/i);
      if (m) {
        const t = low(m[1]);
        cur = { t, line: i + 1, f: {}, at: {}, file };
        blocks.push(cur);
        if (!TEMPLATES.includes(t)) issues.push({ file, line: i + 1, level: 'error', msg: `Unknown template "+ ${t}". Use one of: ${TEMPLATES.join(', ')}.` });
        return;
      }
      const kv = line.match(/^([a-z][a-z _]*?)\s*:\s*(.*)$/i);
      if (!kv) { issues.push({ file, line: i + 1, level: 'error', msg: `Expected "key: value" or "+ template" but found "${line.slice(0, 40)}".` }); return; }
      if (!cur) { issues.push({ file, line: i + 1, level: 'error', msg: `"${kv[1]}" comes before any "+ template" line.` }); return; }
      const key = low(kv[1]).replace(/\s+/g, '_');
      cur.f[key] = key in cur.f ? cur.f[key] + ', ' + kv[2].trim() : kv[2].trim();
      cur.at[key] = i + 1;
    });
    return { blocks, issues };
  }

  const KIND = {
    animal: { growth: 0.06, power: 0, start: [10, 30], cap: 60, regrow: 0, per: 0.1, hostile: false, mutates: true, spawn: 5 },
    plant: { growth: 0, power: 0, start: [15, 35], cap: 50, regrow: 0.15, per: 0.35, hostile: false, mutates: false, spawn: 5 },
    mineral: { growth: 0, power: 0, start: [100, 250], cap: 300, regrow: 0.002, per: 0.3, hostile: false, mutates: false, spawn: 5 },
    monster: { growth: 0.03, power: 3, start: [3, 8], cap: 25, regrow: 0, per: 0.1, hostile: true, mutates: true, spawn: 2 },
  };
  // what the engine itself marks in people's lives (scars and stories can start from these, and from deeds)
  const CAMPAIGN_T = ['place', 'person', 'happened', 'party'];      // campaign.txt only, not world packs
  const LIFE_TAGS = ['lost spouse', 'lost child', 'lost parent', 'lost friend', 'town sacked', 'came home to ruins', 'home destroyed', 'survived raid', 'mauled', 'won fight', 'starving', 'bitten',
    'married', 'child born', 'came of age', 'became hero', 'turned outlaw', 'avenged', 'redeemed', 'fled', 'slew a monster'];
  const EARNS = ['market', 'wage', 'stall', 'inn', 'build', 'steal', 'beg', 'adventure'];
  const MET_BY = ['eat', 'sleep', 'company', 'faith'];

  // packs: a string, or [{ name, text }] read in order. A later block with the same template and name
  // changes the earlier one field by field; "remove: true" deletes it; lists and names add up unless "replace: true".
  const blockKey = b => { const f = b.f; if (b.t === 'names') return 'names:' + low(f.race || f.name); if (b.t === 'mutation') return `mutation:${low(f.of)}:${low(f.becomes)}`; if (['animal', 'plant', 'mineral', 'monster'].includes(b.t)) return 'source:' + low(f.name); if (b.t === 'world') return 'world'; return f.name ? b.t + ':' + low(f.name) : null; };
  function compile(input) {
    const packs = typeof input === 'string' ? [{ name: '', text: input }] : input;
    const issues = [], merged = new Map(), loose = [], gone = new Set();
    let changed = 0, removed = 0;
    for (const pk of packs) {
      const r = parse(pk.text, pk.name); issues.push(...r.issues);
      for (const b of r.blocks) {
        if (!TEMPLATES.includes(b.t)) continue;
        const k = blockKey(b);
        if (!k) { loose.push(b); continue; }
        const prev = merged.get(k);
        if (bool(b.f.remove)) { if (prev) { merged.delete(k); removed++; if (k.startsWith('source:')) gone.add(k.slice(7)); } else issues.push({ file: b.file, line: b.line, level: 'warn', msg: `Nothing called "${b.f.name || b.f.race || b.f.becomes}" exists to remove.` }); continue; }
        if (!prev) { merged.set(k, b); continue; }
        changed++;
        const appendable = ['items', 'first', 'last'];
        for (const [key, val] of Object.entries(b.f)) {
          if (appendable.includes(key) && !bool(b.f.replace) && prev.f[key]) prev.f[key] += ', ' + val; else prev.f[key] = val;
          prev.at[key] = b.at[key]; prev.fileOf = Object.assign(prev.fileOf || {}, { [key]: b.file });
        }
        if (b.t !== prev.t && ['animal', 'plant', 'mineral', 'monster'].includes(b.t)) prev.t = b.t;
        prev.changedBy = [...new Set([...(prev.changedBy || []), b.file])];
      }
    }
    // things that only made sense with a removed creature go with it
    for (const [k, b] of merged) {
      if (b.t === 'mutation' && gone.has(low(b.f.of)) && !merged.has('source:' + low(b.f.of))) merged.delete(k);
      const m = b.t === 'event' && String(b.f.effect || '').match(/^spawn\s+(.+?)(\s+\d+)?\s*$/i);
      if (m && gone.has(low(m[1])) && !merged.has('source:' + low(m[1]))) merged.delete(k);
    }
    const blocks = [...merged.values(), ...loose];
    const D = { races: {}, names: {}, lists: {}, needs: {}, goods: {}, professions: {}, buildings: {}, settlements: [], terrains: {}, sources: {}, mutations: [], events: [], scars: {}, arcs: {}, deeds: {}, world: { aging: 4, childhood: 30, births: 1, courting: 1 }, issues, count: blocks.length, changed, removed };
    const where = (b, key) => ({ file: b.fileOf?.[key] || b.file, line: b.at?.[key] || b.line });
    const warn = (b, key, msg) => issues.push({ ...where(b, key), level: 'warn', msg });
    const err = (b, key, msg) => issues.push({ ...where(b, key), level: 'error', msg });
    const need = (b, key) => { if (!b.f[key]) { err(b, key, `"+ ${b.t}" on line ${b.line} needs a ${key}.`); return false; } return true; };
    const known = new Set(['name', 'weight', 'remove', 'replace']);
    const allow = {
      race: ['lifespan', 'stats', 'names'], names: ['race', 'first', 'last'], list: ['items'], need: ['rises', 'met_by'],
      good: ['price', 'food', 'spoils', 'tags'], profession: ['works_at', 'makes', 'uses', 'gathers', 'key_stat', 'earns', 'provides', 'hours', 'wage', 'fights', 'yield'],
      building: ['beds', 'style', 'outside'], settlement: ['people', 'treasury'], terrain: ['size', 'also', 'suffix', 'color'],
      mutation: ['of', 'becomes', 'power', 'growth', 'tag'], event: ['scope', 'season', 'effect', 'days', 'text'],
      scar: ['from', 'chance', 'lasts', 'work', 'social', 'pray', 'courage', 'hero', 'outlaw', 'leave', 'dark', 'grudge', 'desire', 'heals', 'shown'],
      arc: ['starts', 'also', 'chance', 'steps', 'title', 'ends', 'bound', 'about'],
      deed: ['affects', 'marks', 'kin', 'others', 'fear', 'food', 'treasury', 'kills', 'text'],
      world: ['aging', 'childhood', 'births', 'courting'],
    };
    const srcKeys = ['roams', 'area', 'food', 'gives', 'yields', 'spawn', 'season', 'eats', 'hostile', 'pack', 'solo', 'power', 'growth', 'regrow', 'start', 'cap', 'danger', 'per', 'tags', 'raids', 'rises', 'dark', 'summoned', 'recruits', 'price', 'spoils', 'mutates', 'spreads', 'turns', 'cured_by', 'broods', 'hoards', 'threat'];
    for (const b of blocks) {
      if (!TEMPLATES.includes(b.t) || CAMPAIGN_T.includes(b.t)) continue;
      const ok = [...known, ...(allow[b.t] || srcKeys)];
      for (const k of Object.keys(b.f)) if (!ok.includes(k)) warn(b, k, `"${k}" is not something "+ ${b.t}" uses yet, so it will be ignored.`);
      const f = b.f, name = low(f.name);
      switch (b.t) {
        case 'race': {
          if (!need(b, 'name')) break;
          const stats = [0, 0, 0, 0, 0, 0], S = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
          list(f.stats).forEach(s => { const m = s.match(/^(str|dex|con|int|wis|cha)\s*([+-]?\d+)/i); if (m) stats[S.indexOf(low(m[1]))] = +m[2]; else warn(b, 'stats', `Can't read stat "${s}". Write it like "str +2".`); });
          D.races[name] = { name, title: f.name.trim(), w: num(f.weight, 1), life: range(f.lifespan, [16, 80]), stats, names: low(f.names || name) };
          break; }
        case 'names': {
          const r = low(f.race || f.name); if (!r) { err(b, 'race', 'A "+ names" block needs a race.'); break; }
          const cur = D.names[r] ||= { first: [], last: [] };
          cur.first.push(...list(f.first)); cur.last.push(...list(f.last)); break; }
        case 'list': if (need(b, 'name')) (D.lists[name] ||= []).push(...weighted(f.items)); break;
        case 'need': {
          if (!need(b, 'name')) break;
          const met = low(f.met_by || 'eat'); if (!MET_BY.includes(met)) warn(b, 'met_by', `met by "${met}" isn't a known way to meet a need (${MET_BY.join(', ')}).`);
          D.needs[name] = { name, rises: num(f.rises, 3), met, w: num(f.weight, 1) }; break; }
        case 'good': if (need(b, 'name')) D.goods[name] = { name, price: num(f.price, 2), food: num(f.food, 0), spoils: num(f.spoils, num(f.food, 0) > 0 ? 0.03 : 0), tags: llist(f.tags) }; break;
        case 'building': if (need(b, 'name')) D.buildings[name] = { name, beds: num(f.beds, 0), style: low(f.style || (num(f.beds, 0) ? 'house' : 'work')), outside: bool(f.outside) }; break;
        case 'settlement': if (need(b, 'name')) D.settlements.push({ name, w: num(f.weight, 1), people: range(f.people, [15, 25]), treasury: num(f.treasury, 140) }); break;
        case 'terrain': {
          if (!need(b, 'name')) break;
          const also = list(f.also).map(s => { const m = s.match(/^([a-z ]+?)\s+([\d.]+)$/i); return m ? { t: low(m[1]), p: +m[2] } : { t: low(s), p: 0.3 }; });
          D.terrains[name] = { name, w: num(f.weight, 1), size: range(f.size, [60, 100]), also, suffix: list(f.suffix).length ? list(f.suffix) : [' ' + title(name)], color: f.color || null }; break; }
        case 'profession': {
          if (!need(b, 'name')) break;
          const makes = list(f.makes).map(s => { const m = s.match(/^(.*?)\s+x\s*([\d.]+)$/i); return m ? { g: low(m[1]), q: +m[2] } : { g: low(s), q: 1 }; });
          const earns = low(f.earns || (f.gathers || f.makes ? 'market' : 'wage'));
          if (!EARNS.includes(earns)) warn(b, 'earns', `earns "${earns}" isn't known (${EARNS.join(', ')}). Treating it as wage.`);
          const uses = llist(f.uses), gathers = llist(f.gathers);
          let kind = { stall: 'merchant', inn: 'inn', build: 'builder', steal: 'thief', beg: 'beggar', adventure: 'hero', wage: 'service' }[earns] || 'service';
          if (earns === 'market') kind = gathers.length ? 'gatherer' : uses.length && makes.length ? 'crafter' : makes.length ? 'producer' : 'service';
          const hours = range(f.hours, kind === 'inn' ? [13, 23] : kind === 'thief' ? [22, 4] : [7, 17]);
          D.professions[name] = { name, title: f.name.trim(), w: num(f.weight, 1), building: low(f.works_at || ''), makes, uses, gathers, stat: low(f.key_stat || 'str'), earns, kind,
            provides: llist(f.provides), hours, wage: num(f.wage, 0.7), fights: bool(f.fights), yield: num(f.yield, 1) };
          break; }
        case 'mutation': if (f.of && f.becomes) D.mutations.push({ of: low(f.of), becomes: f.becomes.trim(), w: num(f.weight, 1), power: mult(f.power, 1), growth: mult(f.growth, 1), tag: low(f.tag || '') }); else err(b, 'of', '"+ mutation" needs "of" and "becomes".'); break;
        case 'scar': {
          if (!need(b, 'name')) break;
          D.scars[name] = { name, title: f.name.trim(), from: llist(f.from), chance: num(f.chance, 1), lasts: num(f.lasts, 0), work: num(f.work, 0), social: num(f.social, 0), pray: num(f.pray, 0),
            courage: num(f.courage, 0), hero: num(f.hero, 0), outlaw: num(f.outlaw, 0), leave: num(f.leave, 0), dark: num(f.dark, 0), grudge: bool(f.grudge), desire: f.desire || '', heals: llist(f.heals), shown: f.shown || '' };
          if (!D.scars[name].from.length) warn(b, 'from', `The ${name} scar has no "from", so nothing will ever cause it.`);
          break; }
        case 'arc': {
          if (!need(b, 'name')) break;
          const steps = list(f.steps).map(s => { const m = s.trim().match(/^(.*?)(?:\s+(\d+))?$/); return { verb: low(m[1]), n: m[2] ? +m[2] : 0 }; });
          const VERBS = ['outlaw', 'gather', 'raid', 'take ruins', 'crown', 'study', 'raise one', 'hide', 'raise all', 'become lich', 'train', 'hunt grudge', 'wait', 'found town'];
          for (const st of steps) if (!VERBS.includes(st.verb)) warn(b, 'steps', `"${st.verb}" isn't a step the engine knows (${VERBS.join(', ')}).`);
          D.arcs[name] = { name, title: f.title ? f.title.trim() : '', w: num(f.weight, 1), starts: llist(f.starts), also: llist(f.also), chance: num(f.chance, 0.2), steps, ends: llist(f.ends || 'slain'), bound: bool(f.bound) };
          break; }
        case 'deed': {
          if (!need(b, 'name')) break;
          const aff = low(f.affects || 'everyone'); if (!['everyone', 'some', 'one', 'leaders'].includes(aff)) warn(b, 'affects', `affects "${aff}" isn't known (everyone, some, one, leaders).`);
          D.deeds[name] = { name, title: f.name.trim(), affects: aff, marks: low(f.marks || ''), kin: low(f.kin || ''), others: low(f.others || ''), fear: num(f.fear, 0), food: mult(f.food, 1), treasury: num(f.treasury, 0), kills: num(f.kills, 0), text: f.text || '' };
          break; }
        case 'world': D.world = { aging: num(f.aging, 4), childhood: num(f.childhood, 30), births: num(f.births, 1), courting: num(f.courting, 1) }; break;
        case 'event': if (need(b, 'name')) D.events.push({ name: f.name.trim(), w: num(f.weight, 1), scope: low(f.scope || 'region'), season: low(f.season || 'any'), effect: f.effect || '', days: num(f.days, 0), text: f.text || f.name, line: b.line, file: b.file }); break;
        default: {     // animal, plant, mineral, monster
          if (!need(b, 'name')) break;
          const K = KIND[b.t];
          const food = f.food == null ? 0 : (/^(true|yes)$/i.test(f.food) ? 40 : num(f.food, 0));
          const sp = String(f.spawn ?? '').trim();
          const spawn = sp === '' ? K.spawn : /^x/i.test(sp) ? K.spawn * mult(sp) : num(sp, K.spawn);
          const s = { name, kind: b.t, line: b.line, file: b.file, area: llist(f.area), food, gives: /^(none|nothing)$/i.test(f.gives || '') ? '' : low(f.gives || (food || b.t !== 'monster' ? name : '')), yields: llist(f.yields), spawn,
            season: llist(f.season), eats: llist(f.eats), hostile: bool(f.hostile, K.hostile), pack: bool(f.pack), solo: bool(f.solo), power: num(f.power, K.power),
            growth: num(f.growth, K.growth), regrow: num(f.regrow, K.regrow), start: range(f.start, f.solo ? [1, 1] : K.start), cap: num(f.cap, K.cap), danger: num(f.danger, 0),
            per: num(f.per, K.per), tags: llist(f.tags), raids: bool(f.raids), rises: low(f.rises || ''), dark: bool(f.dark), summoned: bool(f.summoned), recruits: low(f.recruits || ''),
            price: num(f.price, 2), spoils: f.spoils, mutates: bool(f.mutates, K.mutates), roams: num(f.roams, 0),
            spreads: low(f.spreads || ''), turns: num(f.turns, 2), cured: llist(f.cured_by), broods: num(f.broods, 0), hoards: bool(f.hoards), threat: low(f.threat || '') };
          if (!s.area.length) warn(b, 'area', `${name} has no area, so it will never appear on its own.`);
          D.sources[name] = s;
        }
      }
    }
    // goods that wild things become
    for (const s of Object.values(D.sources)) {
      if ((s.hostile && !s.food) || !s.gives) { s.gives = ''; continue; }
      if (s.gives && !D.goods[s.gives]) D.goods[s.gives] = { name: s.gives, price: s.price, food: s.food, spoils: s.spoils != null ? num(s.spoils, 0) : s.food ? 0.04 : 0, tags: [], auto: true };
      for (const y of s.yields) if (!D.goods[y]) D.goods[y] = { name: y, price: 3, food: 0, spoils: 0, tags: [], auto: true };
    }
    // professions: buildings and goods they mention
    for (const p of Object.values(D.professions)) {
      if (p.building && !D.buildings[p.building]) D.buildings[p.building] = { name: p.building, beds: 0, style: 'work', outside: false, auto: true };
      for (const g of [...p.makes.map(m => m.g), ...p.uses]) if (!D.goods[g]) { D.goods[g] = { name: g, price: 3, food: 0, spoils: 0, tags: [], auto: true }; issues.push({ line: 0, level: 'warn', msg: `The ${p.name} profession mentions "${g}", which has no "+ good" block. It was added with a price of 3.` }); }
      for (const tok of p.gathers) if (!Object.values(D.sources).some(s => s.name === tok || s.kind === tok || s.tags.includes(tok))) issues.push({ line: 0, level: 'warn', msg: `${p.name}s gather "${tok}", but no wild thing has that name, kind or tag.` });
    }
    // references
    const terr = new Set([...Object.keys(D.terrains), ...Object.values(D.terrains).flatMap(t => t.also.map(a => a.t))]);
    for (const s of Object.values(D.sources)) {
      for (const a of s.area) if (!terr.has(a)) issues.push({ file: s.file, line: s.line, level: 'warn', msg: `${s.name} lives in "${a}", but no terrain is called that (and none has it in "also").` });
      for (const e of s.eats) if (!D.sources[e] && e !== 'people') issues.push({ file: s.file, line: s.line, level: 'warn', msg: `${s.name} eats "${e}", which isn't defined.` });
    }
    for (const e of D.events) { const m = e.effect.match(/^spawn\s+(.+?)(\s+\d+)?\s*$/i); if (m && !D.sources[low(m[1])]) issues.push({ line: e.line, file: e.file, level: 'warn', msg: `The "${e.name}" event spawns "${m[1]}", which isn't defined.` }); }
    for (const m of D.mutations) if (!D.sources[m.of]) issues.push({ line: 0, level: 'warn', msg: `A mutation is "of ${m.of}", which isn't defined.` });
    const tagsKnown = new Set([...Object.values(D.scars).map(s => s.name), ...LIFE_TAGS, ...Object.values(D.deeds).flatMap(d => [d.marks, d.kin, d.others]).filter(Boolean)]);
    for (const a of Object.values(D.arcs)) for (const t of a.starts) if (!tagsKnown.has(t)) issues.push({ line: 0, level: 'warn', msg: `The ${a.name} story starts from "${t}", which is neither a scar nor something that happens to people.` });
    for (const sc of Object.values(D.scars)) for (const t of sc.from) if (!tagsKnown.has(t)) issues.push({ line: 0, level: 'warn', msg: `The ${sc.name} scar comes from "${t}", which nothing causes.` });
    for (const r of Object.values(D.races)) if (!D.names[r.names]) issues.push({ line: 0, level: 'warn', msg: `The ${r.name} race has no "+ names" block. They will borrow names.` });
    // required pieces, with friendly fallbacks
    if (!Object.keys(D.races).length) { issues.push({ line: 0, level: 'error', msg: 'There are no races, so nobody can be rolled.' }); }
    if (!Object.values(D.professions).some(p => p.w > 0)) issues.push({ line: 0, level: 'error', msg: 'No profession has a weight above 0, so nobody can be given a job.' });
    if (!Object.values(D.needs).some(n => n.met === 'eat')) { D.needs.hunger = { name: 'hunger', rises: 4, met: 'eat', w: 1 }; issues.push({ line: 0, level: 'warn', msg: 'No need is met by eating. Added hunger.' }); }
    if (!Object.values(D.needs).some(n => n.met === 'sleep')) { D.needs.rest = { name: 'rest', rises: 3, met: 'sleep', w: 1 }; issues.push({ line: 0, level: 'warn', msg: 'No need is met by sleeping. Added rest.' }); }
    if (!Object.values(D.buildings).some(b => b.beds > 0)) D.buildings.house = { name: 'house', beds: 4, style: 'house', outside: false, auto: true };
    if (!Object.values(D.goods).some(g => g.food > 0)) issues.push({ line: 0, level: 'error', msg: 'No good has food, so everyone would starve.' });
    if (!D.settlements.length) D.settlements.push({ name: 'village', w: 1, people: [18, 26], treasury: 140 });
    if (!Object.keys(D.terrains).length) issues.push({ line: 0, level: 'error', msg: 'There are no terrains, so there are no wilds.' });
    for (const k of ['personality', 'wants', 'fears', 'quirks', 'ambitions']) if (!D.lists[k]?.length) { D.lists[k] = [{ v: k === 'ambitions' ? 'Nothing hidden' : 'Ordinary', w: 1 }]; issues.push({ line: 0, level: 'warn', msg: `No "${k}" list. Everyone gets a plain one.` }); }
    // roles the engine needs
    const P = Object.values(D.professions);
    D.guard = (P.find(p => p.fights && p.kind === 'service') || P.find(p => p.provides.includes('safety')) || null)?.name;
    if (!D.guard) { D.professions.militia = { name: 'militia', title: 'Militia', w: 0, building: '', makes: [], uses: [], gathers: [], stat: 'str', earns: 'wage', kind: 'service', provides: ['safety'], hours: [7, 17], wage: 0.6, fights: true, yield: 1 }; D.guard = 'militia'; }
    D.hero = (P.find(p => p.kind === 'hero'))?.name;
    if (!D.hero) { D.professions.adventurer = { name: 'adventurer', title: 'Adventurer', w: 0, building: '', makes: [], uses: [], gathers: [], stat: 'str', earns: 'adventure', kind: 'hero', provides: ['safety'], hours: [7, 17], wage: 1, fights: true, yield: 1 }; D.hero = 'adventurer'; }
    D.builder = P.find(p => p.kind === 'builder')?.name || null;
    D.laborer = (P.find(p => p.provides.includes('labor')) || P.find(p => p.kind === 'service' && !p.fights))?.name || D.guard;
    D.foodGoods = Object.values(D.goods).filter(g => g.food > 0).map(g => g.name);
    D.house = Object.values(D.buildings).find(b => b.beds > 0).name;
    D.ok = !issues.some(i => i.level === 'error');
    return D;
  }
  return { parse, compile, title, low, list, LIFE_TAGS };
})();
if (typeof module !== 'undefined') module.exports = Defs;
