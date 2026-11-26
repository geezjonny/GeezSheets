import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeTree, decodeTree, decodeEvent } from '../../geez/firebase-codec.js';
import { applyFirebaseEvent } from '../../geez/firebase-events.js';

test('Gaia spell slots, reserved inventory keys and empty containers round trip', () => {
  const pc = { slots: { 1: 2 }, inventory: { 'item.a': { name: 'Torch' } }, empty: {}, conditions: [] };
  const encoded = encodeTree(pc);
  assert.deepEqual(encoded.slots, { '%31': 2 });
  assert.equal(encoded.inventory['item%2Ea'].name, 'Torch');
  assert.deepEqual(decodeTree(encoded), pc);
  assert.deepEqual(decodeTree({ '%EMPTY': 'object', gp: 10 }), { gp: 10 });
});
test('live spell pip changes decode both event paths and patch values', () => {
  let entity = { slots_used: { 1: 0 } };
  entity = applyFirebaseEvent(entity, 'put', decodeEvent('put', { path: '/slots_used/%31', data: 1 }));
  entity = applyFirebaseEvent(entity, 'patch', decodeEvent('patch', { path: '/', data: { 'slots_used/%31': 2 } }));
  assert.equal(entity.slots_used[1], 2);
  assert.equal(entity.slots_used['%31'], undefined);
});
