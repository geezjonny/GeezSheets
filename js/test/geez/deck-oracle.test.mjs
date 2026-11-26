import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oracleRequest, parseOracleDraft, ollamaURL } from '../../geez/deck-oracle-model.js';
import { revealBargain } from '../../geez/devils-deck-model.js';

test('oracle asks for a structured, already scaled interpretation with no character records', () => {
  const request = oracleRequest(revealBargain([8, 6, 13]), 3, 'qwen3.5:4b');
  assert.equal(request.model, 'qwen3.5:4b');
  assert.equal(request.stream, false);
  assert.equal(request.think, false);
  assert.equal(JSON.parse(request.prompt).omen, 'Invisible Bones Giggles');
  assert.equal(JSON.parse(request.prompt).drawNumber, 3);
  assert.equal(request.format.type, 'object');
  assert.match(request.system, /DC 12 Wisdom/);
  assert.throws(() => oracleRequest(revealBargain([1, 1, 1]), 0, 'model'), /draw number/);
});

test('only known fields and bounded modifiers survive oracle draft parsing', () => {
  const draft = { kind: 'Feat', name: 'Invisible Bones Giggles', description: 'One minute of invisibility; DC 12 Wisdom or laugh.',
    scaling: 'Three uses per day.', fields: [{ name: 'max', value: '3' }, { name: 'recharge', value: 'daily' },
      { name: 'mode', value: 'activated' }, { name: 'duration_minutes', value: '1' }], modifiers: [] };
  assert.deepEqual(parseOracleDraft(draft), draft);
  assert.throws(() => parseOracleDraft({ ...draft, fields: [{ name: '__proto__', value: 'bad' }] }), /invalid creator field/);
  assert.throws(() => parseOracleDraft({ ...draft, modifiers: [{ target: 'ac', operation: 'multiply', value: 1000 }] }), /invalid modifier/);
  assert.throws(() => parseOracleDraft({ ...draft, fields: [draft.fields[0], draft.fields[0]] }), /duplicate/);
  assert.throws(() => parseOracleDraft({ ...draft, kind: 'ExecuteScript' }), /unknown creation/);
});

test('Ollama requests stay on loopback and reject credentials or remote hosts', () => {
  assert.equal(ollamaURL('http://localhost:11434'), 'http://localhost:11434/api/generate');
  assert.equal(ollamaURL('http://127.0.0.1:11434/'), 'http://127.0.0.1:11434/api/generate');
  for (const url of ['https://example.com', 'http://localhost.evil.test:11434', 'http://user:pass@localhost:11434', 'file:///tmp/a', 'http://localhost:11434/other']) {
    assert.throws(() => ollamaURL(url));
  }
});
