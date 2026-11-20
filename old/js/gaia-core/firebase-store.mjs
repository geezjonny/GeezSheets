// Firebase RTDB transport for openStore in Node (REST + ETags). Same write protocol as the
// browser (GeezSheets/js/gaia-firebase.mjs): single-record writes are compare-and-swap on that
// record; multi-record writes take the shared _writer lease, then compare-and-swap the root.
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { executeWrite } from './write.mjs';
import { encodeKey, encodeTree, decodeTree } from './firebase-layout.mjs';
import { listActions } from './actions.mjs';

export const databaseURL = 'https://geezsheets-default-rtdb.firebaseio.com';
const clone = v => structuredClone(v);
const get = (o, p) => p.split('/').filter(Boolean).reduce((v, k) => v?.[k], o) ?? null;
function set(o, p, v) { const ks = p.split('/'); for (const k of ks.slice(0, -1)) o = o[k] ??= {}; if (v === null) delete o[ks.at(-1)]; else o[ks.at(-1)] = clone(v); }
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
const collections = ['worlds/gaia/entities', 'worlds/gaia/links', 'campaigns', 'apps'];

// url: 'firebase' (live /v2) or 'firebase:/v2-test/<run>'. Returns request(method, target, body) like store.mjs.
export function firebaseRequest(url, identity = 'gm', { fetch = globalThis.fetch } = {}) {
  const root = url === 'firebase' ? 'v2' : url.slice('firebase:'.length).replace(/^\//, '');
  if (root !== 'v2' && !/^v2-test\/[a-zA-Z0-9_-]+$/.test(root)) throw Error('Firebase target must be firebase (= /v2) or firebase:/v2-test/<run-id>');
  if (identity !== 'gm' && !/^player:[^\s]*$/.test(identity)) throw Error('GEEZ_AS must be gm or player:<pc IDs>');
  const auth = identity === 'gm' ? { role: 'gm', pcs: [] } : { role: 'player', pcs: identity.slice(7).split(',').filter(Boolean) };
  const owner = randomUUID();
  let schema;

  async function rest(path, method = 'GET', { value, etag } = {}) {
    // Keys are %XX-escaped by encodeKey; the URL needs that % escaped again.
    const url = `${databaseURL}/${root}${path ? '/' + path.split('/').map(k => encodeURIComponent(encodeKey(k))).join('/') : ''}.json`;
    const r = await fetch(url, { method, signal: AbortSignal.timeout(30000),
      headers: { 'X-Firebase-ETag': 'true', ...(etag ? { 'if-match': etag } : {}), ...(value === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    const text = await r.text();
    if (!r.ok && r.status !== 412) fail(502, `Firebase ${method} /${root}/${path}: ${r.status} ${text.slice(0, 200)}`);
    return { ok: r.ok, value: JSON.parse(text), etag: r.headers.get('etag'), now: Date.parse(r.headers.get('date')) || Date.now() };
  }
  async function load() {
    const state = { worlds: { gaia: { entities: {}, links: {} } }, campaigns: {}, apps: {} };
    await Promise.all(collections.map(async p => set(state, p, decodeTree((await rest(p)).value ?? {}))));
    return state;
  }
  function evaluate(state, plans) {
    const written = new Set(); let result, status;
    for (const p of plans) {
      const out = executeWrite(state, schema, p.path, p.method, p.body, auth); result = out.result; status = out.status;
      for (const w of out.writes) { set(state, w.path, w.value); written.add(w.path); }
    }
    return { result, status, written };
  }
  async function exclusive(fn) {
    let acquired = false;
    for (let i = 0; i < 200 && !acquired; i++) {
      const l = await rest('_writer');
      const free = l.value === null || Object.values(l.value).every(x => typeof x?.at === 'number' && l.now - x.at > 10000);
      if (free) acquired = (await rest('_writer', 'PUT', { value: { [owner]: { at: { '.sv': 'timestamp' } } }, etag: l.etag })).ok;
      if (!acquired) await sleep(30 + Math.random() * 50);
    }
    if (!acquired) fail(409, 'Gaia writer busy; retry');
    try { return await fn(); }
    finally {
      for (let i = 0; i < 20; i++) { const l = await rest('_writer'); if (!l.value?.[owner] || (await rest('_writer', 'PUT', { value: null, etag: l.etag })).ok) break; }
    }
  }
  async function write(plans) {
    schema ??= JSON.parse(await readFile(new URL('./schema/gaia.schema.json', import.meta.url), 'utf8'));
    const state = await load();
    if (plans.every(p => p.body?.preview)) return evaluate(state, plans);
    const paths = [...evaluate(clone(state), plans).written];
    if (!paths.length) return evaluate(state, plans);
    const entity = paths.every(p => /^worlds\/gaia\/entities\/[^/]+$/.test(p) && p === paths[0]) ? paths[0] : null;
    const field = paths.every(p => /^campaigns\/[^/]+\/state\/[^/]+(?:\/|$)/.test(p)) ? paths[0].split('/').slice(0, 4).join('/') : null;
    let single = paths.length === 1 && !/^(worlds\/gaia\/entities|campaigns|apps|worlds\/gaia\/links)$/.test(paths[0]) ? paths[0] : null;
    // A new record gets a fresh random id on every evaluation; guard its parent instead.
    if (single && get(state, single) === null) single = single.split('/').slice(0, -1).join('/');
    const target = entity || (field && paths.every(p => p === field || p.startsWith(field + '/')) ? field : null) || single;
    if (target) {
      for (let i = 0; i < 25; i++) {
        const cur = await rest(target), next = clone(state);
        set(next, target, decodeTree(cur.value));
        const out = evaluate(next, plans);
        if ([...out.written].some(p => p !== target && !p.startsWith(target + '/'))) fail(409, 'Gaia transaction scope changed; retry');
        if ((await rest(target, 'PUT', { value: encodeTree(get(next, target)), etag: cur.etag })).ok) return out;
      }
      fail(409, 'Gaia value changed; retry');
    }
    return exclusive(async () => {
      for (let i = 0; i < 10; i++) {
        const cur = await rest('');
        if (!cur.value?._writer?.[owner]) fail(409, 'Gaia writer lease expired; retry');
        const next = decodeTree(cur.value), out = evaluate(next, plans);
        if ((await rest('', 'PUT', { value: encodeTree(next), etag: cur.etag })).ok) return out;
      }
      fail(409, 'Gaia value changed; retry');
    });
  }

  return async function request(method, target, body) {
    const u = new URL(target, 'http://x');
    const path = u.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/');
    if (path.startsWith('apps/sheets/files') || path === 'events') fail(400, `${path} is not available over the Firebase CLI transport`);
    if (method === 'GET') {
      if (path === 'actions') return listActions();
      const state = await load();
      if (path === 'entities') {
        const { kind, campaign, tag, q } = Object.fromEntries(u.searchParams);
        return Object.values(state.worlds.gaia.entities).filter(e => (!kind || e.kind === kind) && (!campaign || e.campaign === campaign) && (!tag || e.tags?.includes(tag)) && (!q || e.name.toLowerCase().includes(q.toLowerCase())));
      }
      const v = path ? get(state, path) : state;
      if (v === null) fail(404, 'Record not found');
      return v;
    }
    return (await write([{ path, method, body }])).result;
  };
}
