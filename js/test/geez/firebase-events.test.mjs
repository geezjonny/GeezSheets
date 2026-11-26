import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFirebaseEvent } from '../../geez/firebase-events.js';

test('character stream applies snapshots, nested puts, multi-path patches and deletions without fetching', () => {
  let entities = applyFirebaseEvent(null, 'put', { path: '/', data: { pc: { kind: 'pc', data: { combat: { hp_current: 10 }, inventory: {} } } } });
  entities = applyFirebaseEvent(entities, 'put', { path: '/pc/data/inventory/new-item', data: { name: 'Torch', qty: 3 } });
  entities = applyFirebaseEvent(entities, 'patch', { path: '/pc/data', data: { 'combat/hp_current': 8, 'inventory/new-item/qty': 2 } });
  assert.equal(entities.pc.data.combat.hp_current, 8);
  assert.deepEqual(entities.pc.data.inventory['new-item'], { name: 'Torch', qty: 2 });
  entities = applyFirebaseEvent(entities, 'put', { path: '/pc/data/inventory/new-item', data: null });
  assert.deepEqual(entities.pc.data.inventory, {});
  assert.equal(applyFirebaseEvent(entities, 'put', { path: '/', data: null }), null);
});

test('root patches retain other characters and nested array values', () => {
  const entities = { pc: { data: { spellcasting: { slots_used: [null, 0, 0] } } }, other: { name: 'Other' } };
  applyFirebaseEvent(entities, 'patch', { path: '/', data: { 'pc/data/spellcasting/slots_used/1': 2 } });
  assert.deepEqual(entities.pc.data.spellcasting.slots_used, [null, 2, 0]);
  assert.equal(entities.other.name, 'Other');
});

test('rejects invalid or unsafe paths before changing cached data', () => {
  const value = { hp: 10 };
  assert.throws(() => applyFirebaseEvent(value, 'patch', { path: '/', data: { hp: 5, '__proto__/polluted': true } }), /Unsafe/);
  assert.equal(value.hp, 10);
  assert.equal({}.polluted, undefined);
  assert.throws(() => applyFirebaseEvent(value, 'put', { path: null }), /Invalid/);
  assert.throws(() => applyFirebaseEvent(value, 'patch', { path: '/', data: null }), /Invalid/);
});
