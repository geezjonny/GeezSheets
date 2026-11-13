// Buildings (WORLD.md phase G). A city can have thousands of houses, but only some are special: the
// town's own buildings (inn, temple, smithy...), a number of shops, workshops, taverns, guardhouses and the
// like scaled by population, and the homes of the place's notable people (its ruler and lore NPCs).
// Special buildings are real: rolled by the building roller, seeded by the settlement and the house's
// grid square, so it is always the same house with the same people, and nothing is stored until the GM
// edits it. Ordinary houses are just houses; the GM can make any of them special (and back).
//   data.buildings["<settlement id>:<sx>,<sz>"] = { special?, seed?, kind?, name?, notes?, marked?, extra?: n, gone?: [k] }
//   data.people["<building key>/<k>"]          = { ...any NPC fields, notes? }
import { makeBuilding, makeNPC } from './rollers.js';
import { housesOf, streetsOf } from './towns.js';
import { squareAt } from './detail.js';
import { KINDS } from './lore.js';
import { mulberry } from './noise.js';
import { lookOf } from './figures.js';
import { canonicalName } from './world-canon.js';

const ROLE_KIND = { inn: 'inn', temple: 'temple', smithy: 'smithy', guildhall: 'guildhall', palace: 'manor', farmhouse: 'farmhouse', barn: 'barn', mill: 'mill' };
// what the extra special buildings of a town or city are
const EXTRA = { shop: 10, workshop: 10, tavern: 6, smithy: 2, baker: 3, tanner: 1, healer: 2, alchemist: 1, bowyer: 1, jeweler: 1, stables: 2, warehouse: 3, manor: 2, den: 2, shrine: 2 };
const CITY_EXTRA = { ...EXTRA, bank: 1, library: 1, bath: 1, jeweler: 2, warehouse: 5, manor: 4 };
const mix = (a, b, c) => (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) >>> 0;
const wpick = (rng, t) => { let s = 0; for (const k in t) s += t[k]; let r = rng() * s; for (const k in t) { r -= t[k]; if (r <= 0) return k; } return Object.keys(t)[0]; };

export class Buildings {
  constructor(app) { this.app = app; this.cache = new Map(); }
  get data() { const d = this.app.world.data; d.buildings ||= {}; d.people ||= {}; return d; }

  // The houses of a settlement (from the loaded town, or computed once and cached by its shape).
  housesOf(S) {
    const rec = this.app.towns.loaded.get(S.id); if (rec?.houses?.length) return rec.houses;
    const sig = `${S.id}|${S.x}|${S.z}|${S.r}|${S.kind}|${S.seed}|${this.app.world.data.roads.length}`;
    let c = this.cache.get(S.id); if (c?.sig === sig) return c.houses;
    const houses = housesOf(this.app.world, S, streetsOf(this.app.world, S)); this.cache.set(S.id, { sig, houses }); return houses;
  }
  // key -> house, for a settlement's current houses
  index(S) {
    const hs = this.housesOf(S); let c = (this.icache ||= new Map()).get(S.id);
    if (c?.hs !== hs) { const m = new Map(); for (const h of hs) m.set(this.keyOf(S, h), h); c = { hs, m }; this.icache.set(S.id, c); }
    return c.m;
  }
  // The house under a ground point (inside its turned footprint, a little margin), or null.
  houseAt(x, z) {
    const role = this.app.role;
    for (const S of this.app.world.data.settlements) {
      if (KINDS[S.kind]?.group !== 'settlement' || !this.app.towns.visible(S, role)) continue;
      if (Math.hypot(S.x - x, S.z - z) > S.r + 140) continue;
      const hs = this.housesOf(S);
      for (const h of hs) {
        const c = Math.cos(h.yaw || 0), s = Math.sin(h.yaw || 0), dx = x - h.x, dz = z - h.z;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if ((Math.abs(lx) < h.L / 2 + .6 && Math.abs(lz) < h.D / 2 + .6) || (Math.abs(lz) < h.L / 2 + .6 && Math.abs(lx) < h.D / 2 + .6)) return { S, h, key: this.keyOf(S, h) };
      }
    }
    return null;
  }
  keyOf(S, h) { const [sx, sz] = squareAt(h.x, h.z); return `${S.id}:${sx},${sz}`; }
  find(key) {
    const [sid, sq] = key.split(':'), S = this.app.world.data.settlements.find(p => p.id === sid); if (!S) return null;
    const h0 = this.index(S).get(key); if (h0) return { S, h: h0, key };
    const [sx, sz] = sq.split(',').map(Number), hs = this.housesOf(S);
    let best = null, bd = 1e9;
    for (const h of hs) { const [hx, hz] = squareAt(h.x, h.z), d = (hx - sx) ** 2 + (hz - sz) ** 2; if (d < bd) { bd = d; best = h; } }
    return best ? { S, h: best, key } : null;
  }

  // Which houses of a settlement are special: key -> { kind, name?, resident? }. Pure (seed, houses, lore).
  specials(S) {
    const hs = this.housesOf(S), L = S.lore || {}, sig = JSON.stringify([S.seed, S.kind, L.pop, (L.buildings || []).map(b => b.kind + b.name), (L.npcs || []).map(n => n.name), L.ruler?.name]);
    let c = (this.scache ||= new Map()).get(S.id); if (c && c.hs === hs && c.sig === sig) return c.map;
    const map = new Map(), rng = mulberry(mix(S.seed, 7, 11)), lore = [...(L.buildings || [])];
    // the town's own buildings claim the houses the town builder gave those roles
    for (const h of hs) if (h.role) {
      const kind = ROLE_KIND[h.role] || h.role, i = lore.findIndex(b => b.kind === kind);
      map.set(this.keyOf(S, h), { kind, name: i >= 0 ? lore.splice(i, 1)[0].name : undefined });
    }
    // everything else goes to ordinary houses, each kind where it would be: shops on the market and the
    // main streets, taverns, stables, smiths and the watch by the gates, tanneries and dens at the edge,
    // manors and homes anywhere. A little randomness so no two towns look planned.
    const R = S.r || 1, streets = streetsOf(this.app.world, S), main = streets.filter(st => !st.lane);
    const gates = main.flatMap(st => [st.pts[0], st.pts.at(-1)]).filter(p => Math.hypot(p[0] - S.x, p[1] - S.z) > R * .8);
    const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
    const free = hs.filter(h => !h.role && !h.suburb).map(h => {
      let dm = 1e9; for (const st of main) for (let q = 1; q < st.pts.length; q++) dm = Math.min(dm, segD(h.x, h.z, st.pts[q - 1], st.pts[q]));
      const dg = gates.length ? Math.min(...gates.map(g => Math.hypot(h.x - g[0], h.z - g[1]))) / R : 1;
      return { h, key: this.keyOf(S, h), c: Math.hypot(h.x - S.x, h.z - S.z) / R, m: Math.min(1, dm / 30), g: Math.min(1, dg), n: rng() };
    });
    const WHERE = {
      centre: f => f.c * .9 + f.m * .6, gate: f => f.g * 1.2 + f.m * .5, edge: f => (1 - f.c) * 1.1 + f.m * .2, any: () => 0,
    };
    const PLACE = { shop: 'centre', store: 'centre', market: 'centre', baker: 'centre', jeweler: 'centre', bank: 'centre', guildhall: 'centre', healer: 'centre', alchemist: 'centre', library: 'centre', bath: 'centre', temple: 'centre', chapel: 'centre', shrine: 'any',
      tavern: 'gate', inn: 'gate', stables: 'gate', smithy: 'gate', armory: 'gate', guard: 'gate', barracks: 'gate', bowyer: 'gate', toll: 'gate',
      tanner: 'edge', den: 'edge', warehouse: 'edge', workshop: 'edge', granary: 'edge', mill: 'edge', manor: 'any', home: 'any' };
    const take = v => {
      const w = WHERE[PLACE[v.kind] || 'any'], kh = [...v.kind].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 1000 / 1000; let best = null, bs = 1e9;
      // per-kind noise (deterministic), so the same lucky house isn't everyone's first pick
      for (const f of free) { if (map.has(f.key)) continue; const sc = w(f) + ((f.n * 9973 + kh * 7919) % 1) * .55; if (sc < bs) { bs = sc; best = f; } }
      if (best) map.set(best.key, v);
    };
    // a house far too big for its street is always someone's (towns.js rolls them, 1 in 25 homes)
    for (const f of free) if (f.h.odd && !map.has(f.key)) map.set(f.key, { kind: wpick(rng, { manor: 4, den: 1, workshop: 1, warehouse: 1, shrine: 1 }), name: `The ${['Big', 'Tall', 'Old', 'Grey', 'Crooked', 'Shuttered'][Math.floor(rng() * 6)]} House` });
    for (const b of lore) take({ kind: b.kind, name: b.name });
    const pop = L.pop || 0, big = S.kind === 'city' || S.kind === 'town';
    if (big) { take({ kind: 'guard', name: 'The guardhouse' }); for (let g = 1; g < Math.floor(pop / 5000); g++) take({ kind: 'guard', name: `The ${['north', 'south', 'east', 'west', 'river', 'market'][g % 6]} watch house` }); }
    if (S.kind === 'city') take({ kind: 'barracks', name: 'The barracks' });
    const n = big ? Math.min(90, Math.round(pop / 250)) : S.kind === 'village' ? Math.min(4, Math.round(pop / 200)) : 0;
    for (let e = 0; e < n; e++) take({ kind: wpick(rng, S.kind === 'city' ? CITY_EXTRA : EXTRA) });
    // homes of the notable people
    const notable = [L.ruler && L.ruler.race !== 'beast' ? { ...L.ruler, ruler: true } : null, ...(L.npcs || [])].filter(Boolean);
    for (const p of notable) {
      const last = p.name.split(' ').slice(1).join(' ');
      take({ kind: p.ruler && big ? 'manor' : 'home', name: p.ruler && big ? `${last || p.name} Hall` : `${p.name}'s house`, resident: p });
    }
    // an armourer: most cities, some towns (its own roll, last, so nothing else in the town moves)
    if (big && mulberry((S.seed | 0) ^ 0x5a17)() < (S.kind === 'city' ? .8 : .35)) take({ kind: 'armory' });
    this.scache.set(S.id, { hs, sig, map }); return map;
  }

  // The building record: an ordinary house, or (if special) rolled, with the GM's edits on top.
  building(key) {
    const f = this.find(key); if (!f) return null;
    const { S, h } = f, [sx, sz] = key.split(':')[1].split(',').map(Number), o = this.data.buildings[key] || {};
    const sp = this.specials(S).get(key), special = o.special ?? !!sp;
    const base = { notes: o.notes || '', settlement: S, house: h, x: h.x, z: h.z, edited: !!this.data.buildings[key], special, marked: o.marked ?? (special || !!o.name) };
    if (!special) return { id: key, kind: 'home', label: 'House', name: o.name || 'An ordinary house', people: [], plain: true, ...base };
    const B = makeBuilding(o.seed ?? mix(S.seed, sx, sz), { kind: o.kind || sp?.kind || undefined, name: o.name || sp?.name, id: key, size: S.kind, conspiracy:S.lore?.conspiracy });
    if(o.rolled){for(const k of ['inside','hook','stock','find'])if(k in o.rolled)B[k]=JSON.parse(JSON.stringify(o.rolled[k]));B.people=(o.rolled.people||[]).map((p,i)=>({...p,id:key+'/'+i}));}
    // a notable person lives here: the first person is them
    if (sp?.resident && o.seed == null && B.people.length) {
      const r = sp.resident, [first, ...rest] = r.name.split(' ');
      B.people[0] = { ...B.people[0], name: r.name, first, last: rest.join(' ') || null, race: r.race || B.people[0].race, role: r.role || B.people[0].role, demeanour: r.trait || B.people[0].demeanour, secret: r.secret || B.people[0].secret };
    }
    // extra people the GM added, and people the GM removed
    for (let k = 0; k < (o.extra || 0); k++) B.people.push(makeNPC(mix(o.seed ?? S.seed, sx * 31 + k, sz * 17 + 7), { id: `${key}/x${k}`,conspiracy:S.lore?.conspiracy }));
    B.people = B.people.filter(p => !(o.gone || []).includes(p.id)).map(p => ({ ...p, ...(this.data.people[p.id] || {}) }));
    return { ...B, ...base };
  }
  person(id) {
    const key = id.slice(0, id.lastIndexOf('/')), B = this.building(key);
    const p = B?.people.find(q => q.id === id); return p ? { ...p, building: B } : null;
  }

  // Markers: special buildings and houses the GM named are marked by default; the GM can mark or unmark
  // any house. Only special and edited houses are looked at, so a 7,000-house city stays cheap.
  markers(S) {
    const pre = S.id + ':', d = this.data.buildings, sp = this.specials(S);
    const own = Object.keys(d).filter(k => k.startsWith(pre));
    const sig = JSON.stringify(own.map(k => [k, d[k]]));
    let c = (this.mcache ||= new Map()).get(S.id);
    if (c && c.sp === sp && c.sig === sig) return c.list;
    const list = [];
    for (const key of new Set([...sp.keys(), ...own])) {
      const B = this.building(key); if (!B || !B.marked) continue;
      const h = B.house; list.push({ id: key, name: B.name, x: h.x, z: h.z, y: (h.floor || 0) + (h.role === 'temple' || h.role === 'palace' ? 14 : 9), known: true });
    }
    this.mcache.set(S.id, { sp, sig, list }); return list;
  }

  // ---------- people on the map ----------
  // just outside a house's door (its +z side)
  doorOf(B) { const h = B.house, d = h.D / 2 + 1.4; return { x: h.x + Math.sin(h.yaw || 0) * d, z: h.z + Math.cos(h.yaw || 0) * d }; }
  // somewhere along one of the town's streets
  townSpot(S) {
    const st = streetsOf(this.app.world, S).filter(q => !q.lane), r = Math.random;
    if (!st.length) { const a = r() * 6.283, d = r() * S.r * .6; return { x: S.x + Math.sin(a) * d, z: S.z + Math.cos(a) * d }; }
    const s = st[Math.floor(r() * st.length)], p = s.pts[Math.floor(r() * s.pts.length)];
    if (Math.hypot(p[0] - S.x, p[1] - S.z) > S.r) return { x: S.x + (p[0] - S.x) * .5, z: S.z + (p[1] - S.z) * .5 };
    return { x: p[0], z: p[1] };
  }
  tokenFields(P) { return { name: P.name, person: P.id, role: P.role, look: lookOf(P) }; }
  // Only named/special building residents and saved campaign people: never invent
  // residents for ordinary plots or turn a settlement's population into tokens.
  existingPeople(settlementId=null) {
    const d=this.data,entities=this.app.canon.entities.filter(e=>e.kind==='person'),out=[],seen=new Set();
    const add=record=>{const identity=record.fields.entity||record.fields.person;if(!identity||seen.has(identity))return;seen.add(identity);out.push(record);};
    for(const S of d.settlements){
      if(settlementId&&S.id!==settlementId)continue;
      const keys=new Set([...this.specials(S).keys(),...Object.keys(d.buildings).filter(k=>k.startsWith(S.id+':'))]);
      for(const key of keys){const B=this.building(key);if(!B)continue;const at=this.doorOf(B);
        for(const P of B.people){
          const e=entities.find(e=>e.source?.key==='person'&&e.source.id===P.id)||entities.find(e=>canonicalName(e.name)===canonicalName(P.name)&&this.app.canon.nearest(e)?.id===S.id);
          add({...at,fields:{...this.tokenFields(P),...(e?{entity:e.id}:{}),npcSettlement:S.id}});
        }
      }
    }
    for(const e of entities){
      if(e.source?.key==='tokens'||seen.has(e.id))continue;
      const P=e.source?.key==='person'?this.person(e.source.id):null,home=this.app.canon.get(e.homeId),B=P?.building||(home?.source?.key==='building'?this.building(home.source.id):null);
      const S=B?.settlement||this.app.canon.nearest(home||e);
      if(settlementId&&S?.id!==settlementId)continue;
      // Underground people are already in an isolated space; don't move them to the surface.
      if(e.space||home?.space)continue;
      const at=B?this.doorOf(B):home||e,profile=P||e.profile||{};
      if(!Number.isFinite(at.x)||!Number.isFinite(at.z))continue;
      add({x:at.x,z:at.z,fields:{name:e.name,role:profile.role,look:lookOf(profile),entity:e.id,...(P?{person:P.id}:{}),...(S?{npcSettlement:S.id}:{})}});
    }
    return out;
  }
  placeExistingPeople(settlementId=null) {
    const a=this.app;if(a.role!=='gm')return [];
    if(a.underground?.active)a.underground.leave();
    a.canon.catalog();
    const represented=new Set(a.world.data.tokens.flatMap(t=>[t.person,t.entity]).filter(Boolean));
    const specs=this.existingPeople(settlementId).filter(({fields:f})=>!represented.has(f.person)&&!represented.has(f.entity));
    const out=a.tools.placeTokens(specs).filter(Boolean);
    a.save();
    a.ui.toast(out.length?`${out.length} existing NPCs placed near their homes and workplaces.`:'Existing NPCs are already placed, or no free squares were available.');
    if(settlementId){const S=a.world.data.settlements.find(s=>s.id===settlementId);if(S)a.flyTo(S.x,S.z,100,.8);}
    return out;
  }
  // a person as a token at their building's door, or somewhere in their town
  placePerson(id, where = 'building') {
    const P = this.person(id); if (!P) return null;
    const old = this.app.world.data.tokens.find(t => t.person === id);
    if (old) { const w = this.app.maps.tokenWorld(old); if (w) this.app.flyTo(w.x, w.z, 60, .8); this.app.ui.toast(`${P.name} is already on the map`); return old; }
    const at = where === 'town' ? this.townSpot(P.building.settlement) : this.doorOf(P.building);
    const tk = this.app.tools.placeTokenAt(at.x, at.z, this.tokenFields(P));
    if (tk) { this.app.flyTo(at.x, at.z, Math.min(this.app.camDist(), 70), .9); this.app.ui.toast(`${P.name} placed`); } else this.app.ui.toast('No free square there');
    return tk;
  }
  // everyone in a building, outside its door
  placeEveryone(key) {
    const B = this.building(key); if (!B?.people.length) return [];
    const have = new Set(this.app.world.data.tokens.map(t => t.person).filter(Boolean)), at = this.doorOf(B);
    const out = this.app.tools.placeTokens(B.people.filter(p => !have.has(p.id)).map(p => ({ ...at, fields: this.tokenFields({ ...p, building: B }) }))).filter(Boolean);
    this.app.flyTo(at.x, at.z, Math.min(this.app.camDist(), 70), .9); this.app.ui.toast(out.length ? `${out.length} placed` : 'Everyone is already on the map');
    return out;
  }
  // tokens linked to a person follow their edits (name and look)
  syncTokens(id) {
    const P = this.person(id), ts = this.app.world.data.tokens.filter(t => t.person === id); if (!P || !ts.length) return;
    for (const t of ts) { t.name = P.name; t.look = lookOf(P); }
    this.app.maps.refreshTokens(); this.app.request();
  }

  // ---------- edits (undoable, as one snapshot of buildings + people) ----------
  edit(fn) {
    const app = this.app, d = this.data, clone = o => JSON.parse(JSON.stringify(o));
    const before = { b: clone(d.buildings), p: clone(d.people) };
    fn(d.buildings, d.people);
    const now = { b: clone(d.buildings), p: clone(d.people) };
    const apply = v => { d.buildings = clone(v.b); d.people = clone(v.p); for (const id of new Set(d.tokens.map(t => t.person).filter(Boolean))) this.syncTokens(id); app.save(); app.card?.render(); };
    app.save(); app.card?.render();
    app.tools.push({ undo: () => apply(before), redo: () => apply(now) });
  }
  patchBuilding(key, patch) { this.edit(b => { b[key] = { ...(b[key] || {}), ...patch }; }); }
  // make an ordinary house special (a fresh roll), or a special one ordinary again
  setSpecial(key, on) { const S = this.find(key)?.S, rolled = S && this.specials(S).has(key); this.edit(b => { b[key] = { ...(b[key] || {}), special: on }; if (on && !rolled) b[key].seed ??= Math.floor(Math.random() * 1e9); }); }
  rerollBuilding(key) { this.edit((b, p) => { b[key] = { ...(b[key] || {}), seed: Math.floor(Math.random() * 1e9) }; delete b[key].name; for (const id of Object.keys(p)) if (id.startsWith(key + '/')) delete p[id]; }); }
  addPerson(key) { this.edit(b => { b[key] = { ...(b[key] || {}), extra: ((b[key] || {}).extra || 0) + 1 }; }); }
  removePerson(id) { const key = id.slice(0, id.lastIndexOf('/')); this.edit((b, p) => { b[key] = { ...(b[key] || {}) }; b[key].gone = [...(b[key].gone || []), id]; delete p[id]; }); }
  patchPerson(id, patch) { this.edit((b, p) => { p[id] = { ...(p[id] || {}), ...patch }; }); this.syncTokens(id); }
  rerollPerson(id, field = null) {
    const P = this.person(id); if (!P) return;
    const fresh = makeNPC(Math.floor(Math.random() * 1e9), { role: field ? undefined : P.role, race: field === 'first' || field === 'last' ? P.race : undefined });
    if (!field) { const { id: _, seed, ...rest } = fresh; this.patchPerson(id, { ...rest, role: P.role, notes: P.notes }); return; }
    const patch = { [field]: fresh[field] };
    if (field === 'first' || field === 'last') { const first = field === 'first' ? fresh.first : P.first, last = field === 'last' ? fresh.last : P.last; patch.name = last ? `${first} ${last}` : first; }
    this.patchPerson(id, patch);
  }
}
