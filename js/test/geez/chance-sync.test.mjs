import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offerChance } from '../../geez/chance-model.js';
import { encodeTree, decodeTree } from '../../geez/firebase-codec.js';

globalThis.window = { GEEZ_FIREBASE_CONFIG: { databaseURL: 'https://example.test' }, addEventListener() {}, dispatchEvent() {} };
globalThis.location = { search: '' };
const { setPlayerIdentity } = await import('../../geez/session-role.js');
const { pickChance, pushChance, closeChance } = await import('../../geez/chance-sync.js');
setPlayerIdentity({ campaign: 'disney', character: 'Liora', pcId: 'pc-1' });
const offered = () => offerChance(null, { id: 'hand-1', pcId: 'pc-1', name: 'Liora', createdAt: 100,
  cards: [[1, 1, 1], [8, 6, 13], [50, 50, 50]] });

// A tiny Firebase: GET returns a version, PUT succeeds only against the current one.
function fakeFirebase(tree) {
  const versions = {}, writes = [];
  const fetch = async (url, options = {}) => {
    if (options.method === 'PUT') {
      if (options.headers['If-Match'] !== `v${versions[url] || 0}`) return { ok: false, status: 412 };
      versions[url] = (versions[url] || 0) + 1; writes.push(url); tree[url] = decodeTree(JSON.parse(options.body));
      return { ok: true, status: 200 };
    }
    return { ok: true, headers: { get: () => `v${versions[url] || 0}` }, json: async () => encodeTree(structuredClone(tree[url] ?? null)) };
  };
  return { fetch, writes };
}
const root = 'https://example.test/v2/worlds/gaia', hand = `${root}/vtt/chance/pc-1.json`, sheet = `${root}/entities/pc-1.json`;

test('picking gives exactly one card, keeps the rest of the sheet and a second pick changes nothing', async () => {
  const original = globalThis.fetch;
  const tree = { [hand]: offered(), [sheet]: { kind: 'pc', data: { name: 'Liora', notes: 'Keep this' } } };
  const db = fakeFirebase(tree); globalThis.fetch = db.fetch;
  try {
    const result = await pickChance('pc-1', 'hand-1', 0);
    assert.equal(result.hand.chosen, 0);
    assert.equal(result.drawCount, 1);
    assert.equal(tree[sheet].data.notes, 'Keep this');
    assert.equal(tree[sheet].data.inventory['chance-hand-1'].category, 'Card');
    assert.equal(tree[sheet].data.equipped.card_key, 'chance-hand-1');
    assert.deepEqual(db.writes, [hand, sheet, hand]);
    assert.equal((await pickChance('pc-1', 'hand-1', 2)).hand.chosen, 0);
    assert.equal(db.writes.length, 3);
  } finally { globalThis.fetch = original; }
});

test('a pick interrupted before the card arrived finishes on the next try', async () => {
  const original = globalThis.fetch;
  const tree = { [hand]: offered(), [sheet]: { kind: 'pc', data: { name: 'Liora' } } };
  const db = fakeFirebase(tree);
  globalThis.fetch = (url, options) => url === sheet ? Promise.reject(new Error('offline')) : db.fetch(url, options);
  try {
    await assert.rejects(pickChance('pc-1', 'hand-1', 1), /offline/);
    assert.equal(tree[hand].hand.phase, 'revealed');
    globalThis.fetch = db.fetch;
    const result = await pickChance('pc-1', 'hand-1', 1);
    assert.equal(result.hand.inventoryKey, 'chance-hand-1');
    assert.ok(tree[sheet].data.inventory['chance-hand-1']);
  } finally { globalThis.fetch = original; }
});

test('a signed-in player cannot select another character or issue dealer actions', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Unexpected request'); };
  try {
    await assert.rejects(pickChance('pc-2', 'hand-1', 0), /Sign in as this character/);
    await assert.rejects(pushChance({ pcId: 'pc-1' }), /Only the GM/);
    assert.throws(() => closeChance('pc-1', 'hand-1', 'handled'), /Only the GM/);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = original; }
});
