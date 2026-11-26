// Companion pieces for feats, effects, the card slot, the Deck of Chance and loot notices.
import { featEntries } from './geez/feats-model.js';
import { spendable, canActivate } from './companion-model.js';
import { esc, T, rules, fold, item, card } from './companion-ui.js';
import { appliedEffects, effectDefinitions, changeEffects } from './geez/effects-model.js';
import { cardConditions } from './geez/equipment-modifiers.js';
import { EQUIPMENT_SLOTS, fitsEquipment, equippedName, equippedItem } from './geez/inventory-model.js';
import { modifierText } from './geez/item-modifiers.js';
import { updatePCEffects, updatePCSheet, equipPCItem } from './geez/pc-inventory.js';
import { setPlayerIdentity } from './geez/session-role.js';
import { watchChance, pickChance } from './geez/chance-sync.js';
import { revealBargain, WORD_LABELS } from './geez/devils-deck-model.js';

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* shown again next time */ } };
let ctx, record, eid, hands = {}, watching = false, picking = false;
const token = () => ({ npcId: `v2:${eid}` });

export function initExtras(context) { ctx = context; }

// Called each time the stored character changes.
export function onCharacter(pc, entityId) {
  record = pc; eid = entityId;
  if (ctx.GM) return;
  setPlayerIdentity({ pcId: eid });
  lootNotice(pc);
  if (!watching) { watching = true; watchChance((value) => { hands = value; drawDeck(); }); }
  else drawDeck();
}

function lootNotice(pc) {
  const loot = pc.lastLoot;
  if (!loot?.id || Date.now() - Number(loot.at) > 15 * 60000 || read('companion.loot.' + pc.id) === loot.id) return;
  keep('companion.loot.' + pc.id, loot.id);
  ctx.toast(`<b>You received</b><br>${(Array.isArray(loot.items) ? loot.items : []).map(esc).join('<br>')}`);
}

// ---------- feats and effects
const groupOf = (id) => id.slice(0, id.indexOf(':'));
const lookup = (pc, id) => pc[groupOf(id)]?.[id.slice(id.indexOf(':') + 1)];
// Use bubbles and an Activate / End button for one ability, feat or effect ("abilities:x", "feats:y", "effects:z").
export function featControls(pc, id) {
  const value = lookup(pc, id); if (!value || typeof value !== 'object') return '';
  const uses = spendable(value), charge = groupOf(id) === 'abilities' && value.kind === 'charge';
  const bubbles = !uses ? '' : `<span class="pips">${Array.from({ length: uses.max }, (_, i) => `<button class="pip ${i < uses.current ? 'on' : ''}" ${charge
    ? `data-act="charge" data-key="${esc(id.slice(10))}" data-n="${i + 1}"`
    : `data-act="fx-use" data-id="${esc(id)}" data-delta="${i < uses.current ? -1 : 1}"`} aria-pressed="${i < uses.current}" aria-label="Use ${i + 1} of ${uses.max}"></button>`).join('')}</span>`;
  const active = canActivate(value) && appliedEffects(pc).some((e) => e.id === id);
  const toggle = canActivate(value) ? `<button class="${active ? 'on' : 'primary'}" data-act="fx-${active ? 'end' : 'activate'}" data-id="${esc(id)}">${active ? 'End' : 'Activate'}</button>` : '';
  return bubbles || toggle ? `<div class="controls">${bubbles}${toggle}</div>` : '';
}
export function featList(pc) {
  return featEntries(pc).map((f) => {
    const kind = f.cardKey ? 'From your card' : f.kind === 'charge' ? 'Limited use' : f.activation && !['none', 'save'].includes(f.activation) ? String(f.activation).replace(/_/g, ' ') : '';
    return item({ key: `me:${f.id}`, title: T(f.name), sub: T(kind), body: rules(f.description || f.effect_desc), side: featControls(pc, f.id) });
  }).join('');
}
export function effectCards(pc, reference) {
  const list = effectDefinitions(pc).filter((e) => e.id.startsWith('effects:') && Array.isArray(e.modifiers));
  const active = new Set(appliedEffects(pc, reference).map((e) => e.id));
  return card('Effects', list.map((e) => item({ key: `fx:${e.id}`, title: T(e.label), sub: T([active.has(e.id) ? 'Active' : '', e.modifiers.map((m) => `${m.target.replace(/[_:]/g, ' ')} ${m.operation === 'multiply' ? '×' : m.operation === 'set' ? '= ' : m.value >= 0 ? '+' : ''}${m.value}`).join(', ')].filter(Boolean).join(' · ')), body: rules(e.description), side: featControls(pc, e.id) })).join(''), '', 'effects');
}

// ---------- equipment and card slots (item bonuses only count while the item is in a slot)
export function gearRows(pc, gm, reference) {
  return Object.entries(EQUIPMENT_SLOTS).map(([slot, label]) => {
    const held = equippedItem(pc, slot, reference), name = equippedName(pc, slot);
    const options = Object.entries(pc.inventory || {}).filter(([, i]) => i?.name && Number(i.qty ?? 1) > 0 && fitsEquipment(slot, i, reference));
    if (!name && !options.length) return '';
    if (slot === 'card' && name && !gm) return `<div class="line"><span>${label}</span><span><b>${esc(name)}</b> <small>GM removes</small></span></div>`;
    return `<label class="line"><span>${label}</span><select data-equip="${slot}"><option value="">None</option>${name && !held ? `<option selected disabled>${esc(name)}</option>` : ''}${options.map(([k, i]) => `<option value="${esc(k)}" ${i === held ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></label>`;
  }).join('');
}
export function cardDetails(pc, reference) {
  const held = equippedItem(pc, 'card', reference), conditions = cardConditions(pc);
  if (!held) return '';
  const bonuses = modifierText(held.modifiers);
  return card('Your card', item({ key: 'bag:card', title: T(held.name), sub: T([bonuses, ...conditions].filter(Boolean).join(' · ')), body: rules(held.desc) }), '', 'card');
}

export async function extraAction(act, button) {
  if (!record || !/^fx-/.test(act)) return false;
  const id = button.dataset.id;
  await ctx.write(async () => {
    if (act === 'fx-use') await updatePCSheet(token(), (pc) => {
      const value = lookup(pc, id), uses = value && spendable(value);
      if (!uses) throw new Error('This has no tracked uses.');
      value.current = Math.max(0, Math.min(uses.max, uses.current + Number(button.dataset.delta)));
    });
    else if (act === 'fx-activate') await updatePCEffects(token(), { type: 'activate', id });
    else if (act === 'fx-end') await updatePCEffects(token(), { type: 'end', id });
  });
  return true;
}
export async function extraChange(target) {
  const slot = target.dataset?.equip;
  if (!slot || !record) return false;
  if (slot === 'card' && !ctx.GM && target.value && !confirm('Equip this card? Only the GM can remove it afterwards.')) { target.value = ''; return true; }
  target.blur();
  await ctx.write(() => equipPCItem(token(), slot, target.value, ctx.D.ref));
  return true;
}

// After the companion's own rest: recharge creator-made abilities and feats, and run down timed effects.
export async function restEffects(pc, long) {
  if (!effectDefinitions(pc).length && !pc.activeEffects) return;
  await updatePCSheet(token(), (data) => changeEffects(data, { type: 'reset', recharge: long ? 'long_rest' : 'short_rest' }));
}

// ---------- Deck of Chance
let deckBox = null;
function drawDeck() {
  const mine = hands[eid], hand = mine?.hand;
  const waiting = hand?.phase === 'offered' || (hand?.phase === 'revealed' && !hand.inventoryKey);
  const show = hand && (waiting || (hand.phase === 'revealed' && read('companion.deck') !== hand.id));
  if (!show) { deckBox?.close(); deckBox = null; return; }
  if (!deckBox?.open) {
    // Locked: a pushed draw stays up until the card is chosen and read.
    deckBox = ctx.sheet('Deck of Chance', '', { locked: true, className: 'tall' });
    deckBox.addEventListener('click', async (e) => {
      const now = hands[eid]?.hand;
      if (e.target.closest('[data-deck-close]')) { keep('companion.deck', now.id); deckBox.close(); deckBox = null; return; }
      const chosen = e.target.closest('[data-card]'); if (!chosen || picking) return;
      picking = true; deckBox.querySelectorAll('[data-card]').forEach((b) => { b.disabled = true; });
      try { const next = await ctx.write(() => pickChance(eid, now.id, Number(chosen.dataset.card))); hands = { ...hands, [eid]: next }; }
      catch { /* write() already showed the reason */ }
      finally { picking = false; drawDeck(); }
    });
  }
  let body;
  if (hand.phase === 'offered') body = `<p>Choose one face-down card. Draw ${esc(hand.drawNumber)}.</p><div class="deck">${[0, 1, 2].map((i) => `<button data-card="${i}" aria-label="Card ${i + 1}">✦</button>`).join('')}</div>`;
  else if (waiting) body = `<p>Your card has not arrived yet.</p><div class="buttons"><button class="primary" data-card="${esc(hand.chosen)}">Take card</button></div>`;
  else {
    const bargain = revealBargain(hand.cards[hand.chosen]);
    body = `<h3>${esc(bargain.name)}</h3><p>${esc(bargain.flavor)}</p>${bargain.words.map(([word, meaning], i) => `<p class="rule"><b>${esc(WORD_LABELS[i])}: ${esc(word)}</b><br>${esc(meaning)}</p>`).join('')}<div class="buttons"><button class="primary" data-deck-close>Done</button></div>`;
  }
  deckBox.querySelector('.sheet-body').innerHTML = body;
}
