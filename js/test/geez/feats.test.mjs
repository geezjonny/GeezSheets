import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeFeat, featEntries, featUses } from '../../geez/feats-model.js';
import { BARK_ARM } from '../../geez/effects-model.js';
import { sheetHTML } from '../../geez/sheet-view.js';

test('feats render collapsed descriptions, Use buttons and charge pips', () => {
  const pc = { abilities: { wind: { label: '<Second Wind>', kind: 'charge', max: 2, current: 1, effect_desc: 'Heal <HP>.' } }, feats: ['Alert'] };
  const html = sheetHTML(pc, 'Feats', {}, false, true);
  assert.match(html, /data-feat-id="abilities:wind"/);
  assert.match(html, /data-feat-use>Use<\/button>/);
  assert.match(html, /data-feat-details aria-expanded="false"/);
  assert.match(html, /data-feat-description hidden/);
  assert.match(html, /&lt;Second Wind&gt;/);
  assert.match(html, /Heal &lt;HP&gt;/);
  assert.equal((html.match(/data-feat-pip=/g) || []).length, 2);
  assert.match(html, /aria-label="Restore &lt;Second Wind&gt; use 1"/);
  assert.match(html, /aria-label="Spend &lt;Second Wind&gt; use 2"/);
  assert.match(sheetHTML(pc, 'Feats'), /data-feat-use disabled/);
  assert.match(sheetHTML(pc, 'Feats'), /data-feat-pip="0"[^>]* disabled/);
  assert.equal(featEntries(pc)[1].name, 'Alert');
});

test('using charges and toggling pips preserve feat metadata and reject invalid changes', () => {
  const pc = { abilities: { wind: { label: 'Second Wind', max: 2, current: 1, effect_desc: 'Heal.' } } };
  changeFeat(pc, { type: 'use', id: 'abilities:wind' });
  assert.equal(pc.abilities.wind.current, 0);
  assert.throws(() => changeFeat(pc, { type: 'use', id: 'abilities:wind' }), /No uses/);
  changeFeat(pc, { type: 'pip', id: 'abilities:wind', pip: 0 });
  assert.equal(pc.abilities.wind.current, 1);
  changeFeat(pc, { type: 'pip', id: 'abilities:wind', pip: 1 });
  assert.equal(pc.abilities.wind.current, 0);
  for (const pip of [-1, 2, 0.5, NaN]) assert.throws(() => changeFeat(pc, { type: 'pip', id: 'abilities:wind', pip }), /Invalid/);
  assert.equal(pc.abilities.wind.effect_desc, 'Heal.');
  assert.equal(featUses({ max: 1000000 }), null);
  assert.throws(() => changeFeat(pc, { type: 'use', id: 'abilities:missing' }), /unavailable/);
});

test('Use activates configured ability effects and consumes a charge exactly once', () => {
  const pc = { abilities: { bark: structuredClone(BARK_ARM) } };
  changeFeat(pc, { type: 'use', id: 'abilities:bark' });
  assert.equal(pc.abilities.bark.current, 1);
  assert.equal(pc.activeEffects['abilities:bark'].remainingMinutes, 60);
  assert.throws(() => changeFeat(pc, { type: 'use', id: 'abilities:bark' }), /already active/);
  assert.equal(pc.abilities.bark.current, 1);
});
