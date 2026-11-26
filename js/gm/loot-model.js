// Turning the GM's loot pile into changes on one character sheet.
import { changeCreation } from '../geez/character-creator-model.js';

export const COINS = ['pp', 'gp', 'ep', 'sp', 'cp'];
const same = (a, b) => a.name === b.name && (a.category || '') === (b.category || '') && (a.desc || '') === (b.desc || '') &&
  JSON.stringify(a.modifiers || null) === JSON.stringify(b.modifiers || null);

// Each recipient's share of the pile's coins; the first characters take the remainder.
export function splitCoins(coins, count) {
  return Array.from({ length: count }, (_, i) => Object.fromEntries(COINS.map((c) => {
    const total = coins[c] || 0;
    return [c, Math.floor(total / count) + (i < total % count ? 1 : 0)];
  })));
}

// entries: { id, kind:'item', name, qty, record } or { id, kind:'weapon', name, value }. Sending the same id twice changes nothing.
export function applyLoot(pc, { id, entries, coins = {} }, now = Date.now()) {
  if (pc.lastLoot?.id === id) return;
  const received = [];
  for (const entry of entries) {
    if (entry.kind === 'weapon') {
      Object.assign(pc, changeCreation(pc, { kind: 'Weapon', key: entry.id, value: entry.value }));
      received.push(entry.name);
      continue;
    }
    const record = { ...entry.record, name: entry.name, qty: entry.qty };
    const equipped = Object.values(pc.equipped || {});
    // Stack onto an identical item, but never onto one that is being worn or wielded.
    const stack = Object.values(pc.inventory || {}).find((item) => item?.name && same(item, record) && !equipped.includes(item.name));
    if (stack) stack.qty = Number(stack.qty ?? 1) + entry.qty;
    else pc.inventory = { ...pc.inventory, [`gm-${entry.id}`]: record };
    received.push(entry.qty > 1 ? `${entry.name} ×${entry.qty}` : entry.name);
  }
  for (const coin of COINS) {
    const amount = coins[coin] || 0;
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Coins must be whole numbers, 0 or more.');
    if (!amount) continue;
    pc.coin_purse = { ...pc.coin_purse, [coin]: Number(pc.coin_purse?.[coin] || 0) + amount };
    received.push(`${amount} ${coin}`);
  }
  if (received.length) pc.lastLoot = { id, at: now, items: received };
}
