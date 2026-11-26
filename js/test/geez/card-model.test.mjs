import test from 'node:test';
import assert from 'node:assert/strict';
import { addCard } from '../../geez/card-model.js';
import { characterStats } from '../../geez/equipment-modifiers.js';
import { featEntries } from '../../geez/feats-model.js';

test('equipped card applies stats, skills, stat changes, feats and conditions', () => {
  const pc = { stats: { str: 10 }, combat: { ac: 10 }, inventory: {} };
  addCard(pc, { name: 'Ace', stats: { str: 2 }, skills: { stealth: 3 }, statChanges: [{ target: 'ac', operation: 'add', value: 1 }],
    effects: [{ name: 'Lucky' }], feats: [{ name: 'Sharp' }], conditions: ['Prone'] }, 'card-1');
  assert.equal(characterStats(pc).stats.str, 10);
  assert.equal(featEntries(pc).length, 0);
  pc.equipped = { card: 'Ace' };
  const stats = characterStats(pc);
  assert.equal(stats.stats.str, 12);
  assert.equal(stats.ac, 11);
  assert.equal(featEntries(pc)[0].name, 'Sharp');
  assert.throws(() => addCard(pc, { name: 'Ace' }, 'card-1'));
});
