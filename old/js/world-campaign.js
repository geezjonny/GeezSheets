// Rolled World — part of the GeezSheets world sim (world.html). Built file: edit the sources, not this.
window.WorldCampaign = (() => {
  const Campaign = (() => {
    const low = x => String(x ?? '').trim().toLowerCase();
    const props = t => { const o = {}; const ps = t?.properties; (Array.isArray(ps) ? ps : ps && typeof ps === 'object' ? Object.values(ps) : []).forEach(p => { if (p && p.key != null) o[low(p.key)] = String(p.value ?? '').trim(); }); return o; };
    const truthy = v => /^(true|yes|y|1|x)$/i.test(String(v || '').trim());
    const TOWN = /^(settlement|city|town|village|hamlet|capital|port|outpost|camp|fort|stronghold)$/i, SKIP = /^(realm|world|plane|battlemap|scene|map|region|continent)$/i;
    function findDb(obj) {      // the pinboard lives at geezvtt/campaign in the GeezSheets export; take any { things } we can find
      const hits = [];
      (function walk(o, path, depth) { if (!o || typeof o !== 'object' || depth > 5) return; if (o.things && typeof o.things === 'object') hits.push({ db: o, path }); for (const [k, v] of Object.entries(o)) if (k !== 'things') walk(v, path ? path + '/' + k : k, depth + 1); })(obj, '', 0);
      hits.sort((a, b) => (/geezvtt\/campaign$/.test(b.path) ? 1 : 0) - (/geezvtt\/campaign$/.test(a.path) ? 1 : 0) || Object.keys(b.db.things).length - Object.keys(a.db.things).length);
      return hits[0] || null;
    }
    function fromExport(obj) {
      const hit = findDb(obj); if (!hit) return { error: 'No pin-board cards found in that file. It should be a GeezSheets export (or the geezvtt/campaign part of it).' };
      const db = hit.db, things = db.things || {}, links = Object.values(db.links || {}), maps = db.maps || {};
      const sheets = Object.values(obj?.characters?.npcs || {});
      const T = Object.entries(things).map(([id, t]) => ({ id, ...t, p: props(t), cat: low(t?.traits?.category), type: low(t?.type) }));
      const byId = new Map(T.map(t => [t.id, t]));
      // which world map does each map sit under (each world map is tagged with its campaign)
      const rootOf = m => { let k = m, n = 0; while (maps[k]?.parentMap && n++ < 12) k = maps[k].parentMap; return k; };
      const pinnedOn = new Map(); for (const [mid, m] of Object.entries(maps)) for (const id of Object.keys(m?.pins || {})) if (!pinnedOn.has(id)) pinnedOn.set(id, mid);
      const ownerOf = new Map(T.filter(t => t.traits?.childMap).map(t => [t.traits.childMap, t.id]));
      for (const [mid, m] of Object.entries(maps)) if (m?.parentThing && !ownerOf.has(mid)) ownerOf.set(mid, m.parentThing);
      const roots = [...new Set(Object.keys(maps).map(rootOf))];
      const rootName = r => maps[r]?.campaign || maps[r]?.name || byId.get(ownerOf.get(r))?.name || 'Campaign';
      const neighbours = x => { const id = typeof x === 'object' ? x?.id : x; return links.filter(l => l.from === id || l.to === id).map(l => byId.get(l.from === id ? l.to : l.from)).filter(Boolean); };
      const isPlace = t => t.type === 'location' && !SKIP.test(t.cat);
      const isTown = t => isPlace(t) && (TOWN.test(t.cat) || (!t.cat && /town|village|city|burg|haven|port|pointe?$/i.test(t.name || '')));
      // the town a thing belongs to: linked, or pinned on that town's own map, or one step further out
      const townOf = (t, seen = new Set()) => {
        if (!t || seen.has(t.id)) return null; seen.add(t.id);
        if (isTown(t) && t.type === 'location') return t;
        const lv = t.p.lives || t.p.home || t.p.location; if (lv) { const h = T.find(x => isPlace(x) && low(x.name) === low(lv)); if (h) return isTown(h) ? h : townOf(h, seen); }
        const near = neighbours(t); const direct = near.find(isTown); if (direct) return direct;
        const pm = pinnedOn.get(t.id), own = pm && byId.get(ownerOf.get(pm)); if (own && isTown(own)) return own;
        for (const n of near.filter(isPlace)) { const r = townOf(n, seen); if (r) return r; }
        return own ? townOf(own, seen) : null;
      };
      const campOf = t => { const pm = pinnedOn.get(t.id); if (pm) return rootOf(pm); if (t.campaign && maps[t.campaign]) return rootOf(t.campaign); if (t.traits?.childMap && maps[t.traits.childMap]) return rootOf(t.traits.childMap); const tw = townOf(t); if (tw && tw !== t) return campOf(tw); for (const n of neighbours(t)) { const m = pinnedOn.get(n.id); if (m) return rootOf(m); } return null; };
      const camps = new Map();
      const camp = r => { const k = r || '_'; if (!camps.has(k)) camps.set(k, { id: r || null, name: r ? rootName(r) : 'Everything', spec: { id: r || null, name: r ? rootName(r) : 'Your campaign', region: r ? (byId.get(ownerOf.get(r))?.name || maps[r]?.name || null) : null, map: r && maps[r]?.image ? { image: 'world/' + maps[r].image, file: maps[r].image } : null, places: [], people: [], deeds: [], dead: [] } }); return camps.get(k).spec; };
      const pinOn = (t, r) => { const pn = r && maps[r]?.pins?.[t.id]; return pn && isFinite(pn.x) && isFinite(pn.y) ? { x: +pn.x, y: +pn.y } : null; };
      for (const t of T.filter(isPlace)) { const r = campOf(t), sp = camp(r); const tw = isTown(t) ? null : townOf(t); sp.places.push({ key: t.id, ext: t.id, name: t.name, kind: isTown(t) ? 'town' : 'wild', terrain: low(t.p.terrain) || null, near: tw?.id || null, pos: pinOn(t, r) }); }
      const sheetsById = obj?.characters?.npcs || {};
      for (const t of T.filter(t => t.type === 'npc' || t.type === 'person' || t.type === 'character')) {
        if (truthy(t.p.pc) || t.traits?.pc || t.traits?.generic) continue;
        if (truthy(t.p.dead) || /dead|deceased|killed/i.test(t.traits?.status || '')) { camp(campOf(t)).dead.push(t.id); continue; }
        const sh = sheetsById[t.traits?.charId] || t.sheet || sheets.find(c => low(c.name) === low(t.name)) || {};
        const inTown = x => { const pm = pinnedOn.get(x.id), own = pm && byId.get(ownerOf.get(pm)); return own && isTown(own); };
        const lives = t.p.lives || t.p.home || t.p.location;
        const directTown = neighbours(t).find(isTown), directWild = !lives && neighbours(t).find(x => isPlace(x) && !isTown(x) && !inTown(x));
        const tw = directTown || (directWild ? null : townOf(t)), wild = !tw && (directWild || neighbours(t).find(isPlace));
        camp(campOf(t)).people.push({ ext: t.id, name: t.name, place: (tw || wild)?.id || null, job: t.p.job || t.p.role || t.p.profession || t.p.occupation || t.traits?.role || sh.class || '',
          race: t.p.race || sh.race || sh.basic?.race || '', personality: t.p.personality || '', want: t.p.wants || t.p.want || '', fear: t.p.fears || t.p.fear || '',
          story: (t.p.story || '').split(',').map(low).filter(Boolean), who: t.p.lost || '', blame: /party|heroes|players/i.test(t.p.blame || '') ? 'heroes' : '', note: t.p.notes || t.p.description || t.p.desc || (typeof t.notes === 'string' ? t.notes.slice(0, 400) : '') });
      }
      for (const t of T.filter(t => t.type === 'event' && t.p.deed)) {
        const tw = townOf(t), who = neighbours(t).find(n => n.type === 'npc');
        camp(campOf(t)).deeds.push({ ext: t.id, deed: t.p.deed, place: tw?.id || null, person: who?.id || null, note: t.name });
      }
      let list = [...camps.values()].filter(c => c.spec.places.length || c.spec.people.length);
      const loose = camps.get('_'), real = list.filter(c => c !== loose);
      if (loose && real.length === 1) { for (const k of ['places', 'people', 'deeds', 'dead']) real[0].spec[k].push(...loose.spec[k]); list = real; }
      else if (loose && real.length > 1) { loose.name = 'Not tied to a world map'; list = [...real, loose]; }
      return list.length ? { campaigns: list, from: hit.path || 'the file' } : { error: 'Found the pin board, but no location or NPC cards on it.' };
    }
    function fromText(text) {       // campaign.txt: + place / + person / + happened / + party
      const { blocks } = Defs.parse(text, 'campaign.txt');
      const spec = { name: 'Your campaign', places: [], people: [], deeds: [], dead: [] };
      for (const b of blocks) {
        const f = b.f, key = low(f.name);
        if (b.t === 'party') { spec.party = f.name; if (f.campaign) spec.name = f.campaign; if (f.region) spec.region = f.region; }
        else if (b.t === 'place') spec.places.push({ key, name: f.name, kind: /town|city|village|hamlet|settlement/i.test(f.kind || '') ? 'town' : 'wild', terrain: low(f.terrain) || null, near: low(f.near) || null });
        else if (b.t === 'person') spec.people.push({ name: f.name, place: low(f.lives || f.place), job: f.job || f.role || '', race: f.race || '', personality: f.personality || '', want: f.wants || '', fear: f.fears || '', story: (f.story || '').split(',').map(low).filter(Boolean), who: f.lost || '', blame: /party|heroes|players/i.test(f.blame || '') ? 'heroes' : '', note: f.notes || '' });
        else if (b.t === 'happened') spec.deeds.push({ deed: f.deed || f.name, place: low(f.where), person: f.who || null, note: f.notes || f.note || '' });
      }
      return spec.places.length || spec.people.length ? { campaigns: [{ name: spec.name, spec }], from: 'campaign.txt' } : { error: 'No "+ place" or "+ person" blocks found.' };
    }
    function read(text) { const t = String(text).trim(); if (t.startsWith('{')) { try { return fromExport(JSON.parse(t)); } catch (e) { return { error: 'That file is not valid JSON.' }; } } return fromText(t); }
    return { read, fromExport };
  })();
  function landMask(im, cols = 160) {
    const rows = Math.max(8, Math.round(cols * im.naturalHeight / im.naturalWidth));
    const c = document.createElement('canvas'); c.width = cols * 4; c.height = rows * 4; const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0, c.width, c.height); const px = g.getImageData(0, 0, c.width, c.height).data;
    const lum = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) { let t = 0; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const i = ((r * 4 + y) * c.width + q * 4 + x) * 4; t += px[i] * .3 + px[i + 1] * .59 + px[i + 2] * .11; } lum[r * cols + q] = t / 16; }
    const hist = new Array(256).fill(0); lum.forEach(v => hist[Math.min(255, v | 0)]++);
    let sum = 0, sumB = 0, wB = 0, best = 0, th = 128; hist.forEach((h, i) => sum += i * h);
    for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = lum.length - wB; if (!wF) break; sumB += i * hist[i]; const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = i; } }
    let bits = ''; for (const v of lum) bits += v > th ? '1' : '0';
    return { cols, rows, bits };
  }
  return { Campaign, landMask };
})();
