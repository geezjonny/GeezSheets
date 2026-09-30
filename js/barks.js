// barks.js — ambient NPC chatter built from the campaign's own data.
//
// Reads GeezVTT's one data set directly:
//   db.things  { id, type:'npc'|'location'|'event'|'note', name, traits, properties:[{key,value}], notes }
//   db.links   { id, from, to, label }
//   db.maps    { pins: { thingId: {x,y} } }  — a location's traits.childMap is the map of that place
//
// Usage:
//   await G.barks.load('data/');                       // data/barks.json (falls back to built-ins)
//   const ctx = G.barks.context(db, homeId, { eventlog, day });
//   const line = G.barks.line({ id, role, name }, ctx, { day, extra: { threat: 'zombie' } });
//
// What an NPC can talk about is found by walking one step out from its home location:
//   landmarks  sites linked to home, pinned on home's map, or listed in a "landmarks" property
//   people     NPC cards linked to home (with the link label as their role, e.g. "mayor of")
//   factions   notes tagged Faction linked to home, or a "faction" property
//   events     event cards linked to home, plus recent world event log entries
//   rumors     any linked thing with a "rumor" property (the GM plants these); "rumor false" = unreliable
(function (G) {
  const prop = (t, key) => {
    const p = (t && t.properties || []).find((p) => String(p.key).trim().toLowerCase() === key);
    return p ? String(p.value || '').trim() : '';
  };
  const list = (s) => String(s || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  // "The Obelisk" -> "obelisk" (reads naturally after "the"); "Tidewatch Lighthouse" stays as-is.
  const bare = (name) => { const n = String(name || '').trim(); return /^the\s+/i.test(n) ? n.replace(/^the\s+/i, '').toLowerCase() : n; };
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  const barks = {
    data: null,
    async load(base = 'data/') {
      try {
        const res = await fetch(base + 'barks.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.data = await res.json();
      } catch (e) {
        console.warn('[barks] data/barks.json not found, using built-in lines:', e.message);
        this.data = BUILTIN;
      }
      return this;
    },

    // Everything an NPC from homeId could plausibly mention.
    context(db, homeId, { eventlog = [], day = null, recentDays = 3 } = {}) {
      const things = db.things || {}, links = Object.values(db.links || {});
      const home = things[homeId] || null;
      const ctx = { home, homeName: home ? home.name : 'this town', landmarks: [], people: [], factions: [], events: [], rumors: [] };
      if (!home) return ctx;

      const neighbours = new Map(); // thingId -> link label
      for (const l of links) {
        if (l.from === homeId && things[l.to]) neighbours.set(l.to, l.label || '');
        if (l.to === homeId && things[l.from]) neighbours.set(l.from, l.label || '');
      }
      const map = home.traits && home.traits.childMap && db.maps ? db.maps[home.traits.childMap] : null;
      if (map) for (const id of Object.keys(map.pins || {})) if (things[id] && !neighbours.has(id)) neighbours.set(id, '');

      for (const [id, label] of neighbours) {
        const t = things[id];
        const tag = String(t.traits && t.traits.tag || '').toLowerCase();
        if (t.type === 'location' && (t.traits || {}).category !== 'battlemap') ctx.landmarks.push({ name: bare(t.name), id });
        else if (t.type === 'npc' && !(t.traits || {}).pc && (t.traits || {}).status !== 'Dead')
          ctx.people.push({ name: t.name, role: (t.traits && t.traits.role) || label.replace(/\s+(of|in|at)$/i, ''), id });
        else if (t.type === 'event') ctx.events.push({ text: t.name, id });
        else if (t.type === 'note' && tag === 'faction') ctx.factions.push({ name: t.name, id });
        const r = prop(t, 'rumor');
        if (r) ctx.rumors.push({ text: r, about: t.name, unreliable: /^(y|yes|true|1)$/i.test(prop(t, 'rumor false')), id });
      }
      for (const n of list(prop(home, 'landmarks') || prop(home, 'landmark') || prop(home, 'features'))) ctx.landmarks.push({ name: bare(n) });
      for (const n of list(prop(home, 'faction') || prop(home, 'factions'))) ctx.factions.push({ name: n });
      const hr = prop(home, 'rumor');
      if (hr) ctx.rumors.push({ text: hr, about: home.name, unreliable: /^(y|yes|true|1)$/i.test(prop(home, 'rumor false')) });

      // Recent world events ("Day 2: Nobility raise taxes.") -> "the nobility raised taxes"-ish text.
      const recent = (eventlog || []).filter((e) => e && e.event && (day == null || e.day > day - recentDays));
      for (const e of recent) ctx.events.push({ text: String(e.text || '').replace(/^Day\s+\d+:\s*/i, '').replace(/\.$/, ''), world: true });
      return ctx;
    },

    // One line for this NPC. Same npc + day (+ n) gives the same line, so talking twice is consistent.
    line(npc, ctx, { day = 0, n = 0, extra = {} } = {}) {
      const D = this.data || BUILTIN, R = rng(hash(`${npc.id}|${day}|${n}`));
      const pick = (a) => a[Math.floor(R() * a.length)];
      const slots = {
        home: ctx.homeName,
        landmark: ctx.landmarks.length ? pick(ctx.landmarks).name : null,
        person: null, person_role: null,
        faction: ctx.factions.length ? pick(ctx.factions).name : null,
        event: ctx.events.length ? pick(ctx.events).text : null,
        rumor: null,
        ...extra,
      };
      if (ctx.people.length) { const p = pick(ctx.people); slots.person = p.name; slots.person_role = String(p.role || 'someone important').toLowerCase(); }
      let unreliable = false;
      if (ctx.rumors.length) { const r = pick(ctx.rumors); slots.rumor = r.text; unreliable = r.unreliable; }

      // Candidate categories, weighted: planted rumors first, then news, then local colour.
      const W = { ...(D.weights || {}), ...((D.roleWeights || {})[npc.role] || {}) }; // e.g. shopkeepers favour rumors
      const cats = [];
      const add = (cat, need) => { if (need.every((k) => slots[k]) && (D.templates[cat] || []).length) cats.push([cat, W[cat] ?? 1]); };
      if (extra.threat) add('danger', ['threat']);
      if (extra.bought) add('shopping', ['bought']);
      add('rumor', ['rumor']);
      add('event', ['event']);
      add('landmark', ['landmark']);
      add('person', ['person']);
      add('faction', ['faction']);
      add('place', ['home']);
      const roleLines = (D.roles || {})[npc.role];
      if (roleLines && roleLines.length) cats.push(['@role', W.role ?? 1.2]);
      if (extra.threat && cats.some(([c]) => c === 'danger')) cats.splice(0, cats.length, ['danger', 1]); // danger drowns out gossip
      else if (extra.bought && cats.some(([c]) => c === 'shopping')) cats.splice(0, cats.length, ['shopping', 1]);
      else if ((D.roleOnly || []).includes(npc.role)) cats.splice(0, cats.length, ...(roleLines ? [['@role', 1]] : [])); // zombies don't gossip
      for (let i = cats.length - 1; i >= 0; i--) if (!(cats[i][1] > 0)) cats.splice(i, 1); // weight 0 = never
      if (!cats.length) return null;

      let total = cats.reduce((s, [, w]) => s + w, 0), r = R() * total, cat = cats[0][0];
      for (const [c, w] of cats) { if ((r -= w) <= 0) { cat = c; break; } }
      // Only templates whose every {slot} can be filled (from context or a fragment list).
      const fillable = (t) => [...t.matchAll(/\{(\w+)\}/g)].every(([, k]) => slots[k] != null || ((D.fragments || {})[k] || []).length);
      const pool = (cat === '@role' ? roleLines : D.templates[cat]).filter(fillable);
      if (!pool.length) return null;
      let tpl = pick(pool);

      const fill = (s, depth = 0) => s.replace(/\{(\w+)\}/g, (m, k) => {
        if (slots[k] != null) return slots[k];
        const frag = (D.fragments || {})[k];
        return frag && depth < 3 ? fill(pick(frag), depth + 1) : m;
      });
      let text = fill(tpl);
      if (cat === 'rumor' && unreliable && D.fragments && D.fragments.doubt) text += ' ' + pick(D.fragments.doubt);
      text = text.replace(/\s+/g, ' ').trim();
      return { text: text.charAt(0).toUpperCase() + text.slice(1), category: cat === '@role' ? 'role' : cat };
    },
  };

  // Used when data/barks.json is missing. The file has the same shape, so copy this out and grow it there.
  const BUILTIN = {
    roleOnly: ['zombie'],
    // Shopkeepers only pass on what the GM fed them this session (rumors), plus their own shop talk.
    roleWeights: { shopkeeper: { rumor: 3, role: 1, event: 0, landmark: 0, person: 0, faction: 0, place: 0 } },
    weights: { rumor: 1.8, event: 1.6, danger: 5, landmark: 1.5, person: 1, faction: 1, place: 0.8, role: 1.2 },
    templates: {
      landmark: ['The {landmark} in town is {odd} today. {hedge}', 'Have you been by the {landmark}? {landmark_talk}', 'My {relative} swears the {landmark} {odd_verb} last night.'],
      event: ['Did you hear? {event}. {reaction}', 'Word is: {event}. {consequence}', 'Big news around {home}: {event}. {reaction}'],
      person: ['Have you seen {person} lately? {person_talk}', '{person}, the {person_role}? {person_talk}'],
      faction: ['The {faction} have been {faction_act}. {hedge}'],
      rumor: ['{rumor_intro} {rumor}.', 'Between you and me, {rumor}.'],
      place: ['{home} {place_mood}.', 'Welcome to {home}, stranger. {place_tip}'],
      shopping: ['Just picked up {bought} from {seller}. {deal}', 'Look what I got at {seller}\'s: {bought}! {deal}'],
      danger: ['{panic} There\'s a {threat} by the {landmark}!', '{panic} {threat}! Run!', 'Stay back from that {threat}!'],
    },
    fragments: {
      odd: ['humming unusually', 'colder than it should be', 'glowing faintly', 'awfully quiet', 'drawing a crowd'],
      odd_verb: ['hummed', 'glowed', 'whispered', 'moved', 'went dark'],
      hedge: ['It could be my imagination.', 'Probably nothing.', 'Don\'t tell anyone I said so.', 'Mark my words.', 'Or maybe I need more sleep.'],
      landmark_talk: ['Gives me the shivers.', 'Folks have been leaving offerings.', 'Something\'s not right about it.'],
      relative: ['cousin', 'neighbour', 'aunt', 'brother', 'old friend'],
      reaction: ['Unbelievable.', 'Can\'t say I\'m surprised.', 'Times are hard.', 'What next?'],
      consequence: ['Nobody can afford a decent meal now.', 'The taverns are half empty.', 'Everyone\'s on edge.', 'My shop\'s barely scraping by.'],
      person_talk: ['Something\'s off with them.', 'Owes me money, that one.', 'Looked worried, they did.', 'Good sort, mostly.'],
      faction_act: ['awfully quiet', 'buying up everything', 'recruiting', 'meeting in secret'],
      rumor_intro: ['I heard', 'People are saying', 'Rumour has it', 'A little bird told me'],
      doubt: ['At least, that\'s what they say.', 'Not that I believe it.', 'Though who knows.'],
      place_mood: ['isn\'t what it used to be', 'has been busy lately', 'is quiet this time of year', 'could use a few more guards'],
      place_tip: ['Mind your purse.', 'Try the stew at the inn.', 'Stay off the docks after dark.'],
      deal: ['A steal!', 'Cost me a fortune.', 'Don\'t tell my spouse.', 'Fair price, I suppose.'],
      silent: ['*nods*', '*ignores you*', 'Hm.', '*shrugs*', '*keeps walking*'],
      panic: ['Help!', 'Gods above!', 'Guards! Guards!', 'Run!'],
    },
    roles: {
      guard: ['Move along.', 'Keep the peace in {home}, and we\'ll get along fine.', 'Seen anything suspicious near the {landmark}?'],
      shopkeeper: ['Best prices in {home}, I promise you.', 'Buying or browsing?', 'Just got some fine {ware} in, if you\'re interested.', 'Take a look — {ware}, going cheap today.'],
      zombie: ['Hnnnghh...', '*groans*', 'Brrrraaaains...'],
      bandit: ['Nice purse you\'ve got there.', 'Keep walking, friend.'],
    },
  };
  barks.BUILTIN = BUILTIN;
  G.barks = barks;
})(window.GeezTown = window.GeezTown || {});
