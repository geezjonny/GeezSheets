import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORD_LABELS, WORD_COUNT, WORD_TABLES, revealBargain } from '../../geez/devils-deck-model.js';

test('three complete 50-entry tables produce 125,000 distinct named bargains', () => {
  assert.equal(WORD_COUNT, 50);
  assert.deepEqual(WORD_LABELS, ['Adjective', 'Noun', 'Verb']);
  for (const table of WORD_TABLES) {
    assert.equal(table.length, 50);
    assert.equal(new Set(table.map(entry => entry[0].toLowerCase())).size, 50);
    for (const entry of table) {
      assert.equal(entry.length, 3);
      assert.ok(entry.every(value => typeof value === 'string' && value.trim()));
    }
  }
  const names = new Set();
  for (let modifier = 1; modifier <= 50; modifier++) {
    for (let essence = 1; essence <= 50; essence++) {
      for (let form = 1; form <= 50; form++) {
        const rolls = [modifier, essence, form], result = revealBargain(rolls);
        assert.deepEqual(result.rolls, rolls);
        assert.deepEqual(result.words, rolls.map((roll, index) => WORD_TABLES[index][roll - 1]));
        names.add(result.name);
      }
    }
  }
  assert.equal(names.size, 125000);
  assert.equal(revealBargain([50, 50, 50]).name, WORD_TABLES.map(table => table[49][0]).join(' '));
  assert.equal(revealBargain([1, 1, 1]).name, 'Pungent Cheese Clings');
  assert.equal(revealBargain([20, 20, 20]).name, 'Frozen Door Transforms');
  assert.equal(revealBargain([2, 2, 2]).name, 'Colossal Flesh Awakens');
  assert.equal(revealBargain([4, 4, 4]).name, 'Hollow Shadow Hungers');
});

test('the reveal preserves the rolled adjective, noun, verb order and their flavor', () => {
  const result = revealBargain([19, 19, 13]);
  assert.equal(result.name, 'Royal Goose Giggles');
  assert.equal(result.flavor, result.words.map(word => word[2]).join(' '));
  const rolls = [1, 1, 1], original = revealBargain(rolls);
  rolls[0] = 20;
  assert.deepEqual(original.rolls, [1, 1, 1]);
});

test('invalid dice cannot produce a bargain', () => {
  for (const rolls of [null, [], Array(3), [1, 2], [1, 2, 3, 4], [0, 1, 1], [1, 51, 1], [1, 1, 1.5], ['1', 1, 1], [NaN, 1, 1]]) {
    assert.throws(() => revealBargain(rolls), /three rolls/);
  }
});
