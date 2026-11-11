// node test.mjs          offline: fake Gaia running the real actions on a copy of GeezSuite/data/gaia-v2.json
// node test.mjs --real   same checks on real Firebase in /v2-test/<run> (deleted afterwards)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Companion, chat } from './core.mjs';
import { executeWrite } from '../js/gaia-core/write.mjs';
import { firebaseRequest } from '../js/gaia-core/firebase-store.mjs';
import { firebaseLayout, decodeTree } from '../js/gaia-core/firebase-layout.mjs';

const real = process.argv.includes('--real');
const source = JSON.parse(readFileSync(new URL('../../GeezSuite/data/gaia-v2.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../js/gaia-core/schema/gaia.schema.json', import.meta.url), 'utf8'));
const ID = 'pc_bdjqq6jmqmcq'; // Ashara, daddies
const FB = 'https://geezsheets-default-rtdb.firebaseio.com/';
const fb = async (path, method = 'GET', value) => (await fetch(FB + path + '.json', { method, ...(value === undefined ? {} : { body: JSON.stringify(value) }) })).json();

function fakeGaia(db) {
  const get = p => p.split('/').filter(Boolean).reduce((v, k) => v?.[k], db);
  const set = (p, v) => { const ks = p.split('/'); let o = db; for (const k of ks.slice(0, -1)) o = o[k] ??= {}; if (v === null) delete o[ks.at(-1)]; else o[ks.at(-1)] = structuredClone(v); };
  return async (method, target, body) => {
    const u = new URL(target, 'http://x'), path = u.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/');
    if (method === 'GET') {
      if (path === 'entities') { const q = Object.fromEntries(u.searchParams); return Object.values(db.worlds.gaia.entities).filter(e => (!q.kind || e.kind === q.kind) && (!q.campaign || e.campaign === q.campaign)); }
      return structuredClone(get(path));
    }
    const out = executeWrite(db, schema, path, method, body, { role: 'gm', pcs: [] });
    for (const w of out.writes) set(w.path, w.value);
    return out.result;
  };
}
// Scripted stand-in for Ollama: first turn calls the given tool, second turn answers.
const script = (name, args) => async history => history.at(-1).role === 'tool' ? { role: 'assistant', content: 'Done looking.' } : { role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] };

let run, gaia, hp;
if (real) {
  run = 'v2-test/companion-' + randomUUID();
  await fb(run, 'PUT', firebaseLayout(source));
  gaia = firebaseRequest('firebase:/' + run, 'gm');
  hp = async () => decodeTree(await fb(`${run}/worlds/gaia/entities/${ID}`)).data.combat.hp_current;
} else {
  const db = structuredClone(source); gaia = fakeGaia(db);
  hp = async () => db.worlds.gaia.entities[ID].data.combat.hp_current;
}
const ok = m => console.log('PASS ' + m + (real ? ' (real Firebase)' : ''));
try {
  const s = new Companion(':memory:', gaia), start = await hp();
  const st = await s.state('daddies');
  assert.ok(st.campaigns.includes('daddies')); assert.ok(st.characters.some(c => c.name === 'Ashara')); ok('state lists campaigns and PCs from Gaia');

  const r1 = await chat(s, 'daddies', 'req-00001', 'Ashara takes 4 damage', script('propose_action', { name: 'hp.damage', args: { entity: 'Ashara', amount: 4 } }));
  assert.equal(r1.proposals.length, 1); assert.match(r1.reply, /HP/); assert.equal(await hp(), start, 'nothing written before approval');
  const p = r1.proposals[0];
  assert.equal((await s.review('daddies', p.id, 1, 'approve')).status, 'applied'); assert.equal(await hp(), start - 4);
  await assert.rejects(s.review('daddies', p.id, 1, 'approve')); assert.equal(await hp(), start - 4);
  ok('chat proposes, nothing written until approve, approve writes once');

  const r2 = await chat(s, 'daddies', 'req-00002', 'Ashara heals 2', script('propose_action', { name: 'hp.heal', args: { entity: 'Ashara', amount: 2 } }));
  await s.review('daddies', r2.proposals[0].id, 1, 'reject'); assert.equal(await hp(), start - 4); ok('reject leaves the game unchanged');

  const r3 = await chat(s, 'daddies', 'req-00003', 'Ashara takes 1 damage', script('propose_action', { name: 'hp.damage', args: { entity: 'Ashara', amount: 1 } }));
  await gaia('POST', '/actions/hp.damage', { args: { entity: ID, amount: 5, campaign: 'daddies' } }); // someone else hits Ashara meanwhile
  const stale = await s.review('daddies', r3.proposals[0].id, 1, 'approve');
  assert.equal(stale.status, 'pending_review'); assert.equal(stale.revision, 2); assert.match(stale.conflict, /changed/); assert.equal(await hp(), start - 9);
  await s.review('daddies', stale.id, 2, 'approve'); assert.equal(await hp(), start - 10); ok('stale approval shows the new result first, then applies');

  const r4 = await chat(s, 'daddies', 'req-00004', 'how hurt is Ashara?', script('inspect_record', { target: 'ashara' }));
  const toolOut = JSON.parse(JSON.parse(s.db.prepare('SELECT history FROM chats WHERE id=?').get('req-00004').history).findLast(m => m.role === 'tool').content);
  assert.equal(toolOut.hp, `${start - 10}/${source.worlds.gaia.entities[ID].data.combat.hp_max}`); assert.equal(r4.proposals.length, 0); ok('questions read live records and propose nothing');

  const r5 = await chat(s, 'daddies', 'req-00005', 'make up a spell', script('propose_action', { name: 'world.destroy', args: {} }));
  assert.equal(r5.proposals.length, 0); ok('unknown actions are refused');
  assert.equal((await chat(s, 'daddies', 'req-00001', 'Ashara takes 4 damage', () => { throw Error('model must not run'); })).proposals.length, 1); ok('a repeated request id replays, never re-runs');
  await s.journal('daddies', 'note-00001', 'The bridge troll owes us.'); assert.ok((await s.state('daddies')).messages.some(m => m.role === 'journal')); ok('journal notes stay local');
  s.close();
} finally {
  if (real) { await fb(run, 'DELETE'); assert.equal(await fb(run), null); console.log('PASS test run deleted'); }
}
