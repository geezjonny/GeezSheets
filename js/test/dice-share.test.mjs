// Which shared rolls animate on this phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incoming, showDice, tumblingFace, shareRoll } from '../companion-dice.js';

const roll = { id: 'a', from: 'other-phone', campaign: 'daddies', dice: [{ s: 20, v: 12 }], total: 15 };

test('only new rolls from other phones in the same campaign are shown, once', () => {
  const seen = new Set();
  assert.equal(incoming({ path: '/', data: { lark: roll } }, 'daddies', seen), null); // history on connect
  assert.equal(incoming({ path: '/lark', data: roll }, 'disney', seen), null);
  assert.equal(incoming({ path: '/lark', data: { total: 3 } }, 'daddies', seen), null); // an old-style record
  assert.equal(incoming({ path: '/lark', data: roll }, 'daddies', seen), roll);
  assert.equal(incoming({ path: '/lark', data: roll }, 'daddies', seen), null);
});

// A stand-in page and canvas: enough to run the whole animation and see what it writes.
test('the die rises over the head, shows the total and critical hit, then clears itself', async () => {
  const written = [], boxes = [];
  const ctx = new Proxy({}, { get: (t, k) => (k === 'fillText' ? (text) => written.push(text) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const node = () => {
    const el = { children: [], style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, matches: () => false, showPopover() {}, hidePopover() {}, getContext: () => ctx, isConnected: false,
      append(child) { child.parent = el; child.isConnected = true; el.children.push(child); },
      remove() { el.isConnected = false; const list = el.parent?.children; if (list) list.splice(list.indexOf(el), 1); },
      get firstElementChild() { return el.children[0]; } };
    return el;
  };
  globalThis.document = { hidden: false, createElement: node, body: { append: (box) => boxes.push(box) } };
  globalThis.window = { devicePixelRatio: 2 };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.Image = class { complete = false; };
  const began = performance.now();
  await showDice({ name: 'Lark', label: 'Stealth', total: 23, dice: [{ s: 20, v: 20 }], portrait: 'tokens/lark.png' });
  assert.ok(performance.now() - began >= 1100, 'resolves when the die lands');
  await new Promise((r) => setTimeout(r, 200));
  for (const text of ['Lark', '= 23', 'CRIT!', 'Stealth', '20']) assert.ok(written.includes(text), text);
  await new Promise((r) => setTimeout(r, 4500));
  assert.equal(boxes[0].children.length, 0);
  assert.ok(tumblingFace(0.5, 8, 3) >= 1 && tumblingFace(0.5, 8, 3) <= 8);
});

test('a roll the database refuses is reported, not swallowed', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(shareRoll('lark', {}), /401/);
});
