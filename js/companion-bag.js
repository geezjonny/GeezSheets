// The Bag tab: coins, equipped gear and what makes up AC, packs spelled out, and Equip / Use / Send / Remove.
import { $, esc, T, rules, item, card, ask, sheet, toast } from './companion-ui.js';
import { findItem, worth, statLine, packContents, acBreakdown, healingDice } from './companion-items.js';
import { sendItem, drinkHealing, removeItem, restoreItem, unpack, openPack } from './companion-transfer.js';
import { gearRows, cardDetails } from './companion-extras.js';
import { EQUIPMENT_SLOTS, fitsEquipment, equippedItem, itemEquipped } from './geez/inventory-model.js';
import { effectDefinitions } from './geez/effects-model.js';
import { equipPCItem, updatePCEffects } from './geez/pc-inventory.js';
import { modifierText } from './geez/item-modifiers.js';
import { asList } from './geez/effective.js';

// Whole words only, so a bolt case or a kit is not treated as something you use up.
const CONSUMABLE = /^(?!.*\b(case|kit)\b).*\b(potion|elixir|scroll|rations?|oil|antitoxin|alchemist's fire|bomb|holy water|torch(es)?|arrows?|bolts?|bullets?|darts?|bandages?|vial|flask|poison|acid)\b/i;
let ctx; // { D, GM, state: () => ({ pc, fx, eid }), write, roll, party }

export function initBag(context) { ctx = context; }

const entries = (pc) => Object.entries(pc.inventory || {}).filter(([, x]) => x && typeof x === 'object' && x.name);
const effectFor = (pc, key) => effectDefinitions(pc).find((e) => e.mode === 'activated' && e.consume === true && e.inventoryKey === key);
const consumable = (it) => !!healingDice(it) || /consumable/i.test(it.category || '') || (CONSUMABLE.test(it.name) && !findItem(it.name, ctx.D.ref).damage);
const button = (act, key, label, cls = '', part = null) => `<button class="${cls}" data-act="${act}" data-key="${esc(key)}"${part === null ? '' : ` data-part="${part}"`}>${label}</button>`;

function equipControl(pc, key, it) {
  const slot = Object.keys(EQUIPMENT_SLOTS).find((s) => fitsEquipment(s, it, ctx.D.ref));
  if (!slot) return '';
  const worn = itemEquipped(pc, it, ctx.D.ref);
  if (worn && slot === 'card' && !ctx.GM) return '';
  return button(worn ? 'unequip' : 'equip', key, worn ? 'Unequip' : 'Equip', worn ? 'on' : '');
}

function row(pc, fx, [key, it]) {
  const ref = ctx.D.ref, info = findItem(it.name, ref), qty = Number(it.qty ?? 1) || 1, value = worth(it, ref), stats = statLine(it, ref);
  const bonuses = modifierText(it.modifiers);
  const attack = asList(fx.attacks).find((a) => String(a.name).toLowerCase() === it.name.toLowerCase());
  const use = healingDice(it) || effectFor(pc, key) || consumable(it) ? button('use', key, 'Use', 'primary') : '';
  const equip = equipControl(pc, key, it);
  const text = it.desc || info.desc || info.special;
  const body = `${attack ? `<p class="fact"><b>Your attack</b> ${T([attack.to_hit ? `${attack.to_hit} to hit` : '', attack.damage, attack.damage_type].filter(Boolean).join(' · '))}</p>` : ''}
${stats ? `<p class="fact"><b>Does</b> ${T(stats)}</p>` : ''}${bonuses ? `<p class="fact"><b>While equipped</b> ${T(bonuses)}</p>` : ''}
<p class="fact"><b>Worth</b> ${value ? T(value) + (qty > 1 ? ' each' : '') : 'no listed price'}</p>${rules(text)}${rules(it.notes)}
<div class="buttons">${use ? equip : ''}${button('send', key, 'Send')}${button('remove-item', key, 'Remove')}</div>`;
  return item({ key: `bag:${key}`, title: `${T(it.name)}${qty > 1 ? ` <span class="qty">×${qty}</span>` : ''}`,
    sub: T([stats || it.category || '', value].filter(Boolean).join(' · ')), body, search: it.name, side: use || equip });
}

// A pack becomes its own heading with one line for each thing inside.
function packCard(pc, [key, it]) {
  const ref = ctx.D.ref, value = worth(it, ref), qty = Number(it.qty ?? 1) || 1;
  const lines = packContents(it, ref).map((c, i) => {
    const use = consumable(c) ? button('use', key, 'Use', 'primary', i) : '';
    return item({ key: `pack:${key}:${c.name}`, title: `${T(c.name)}${c.qty > 1 ? ` <span class="qty">×${c.qty}</span>` : ''}`,
      sub: T([c.stats, c.worth ? c.worth + (c.qty > 1 ? ' each' : '') : ''].filter(Boolean).join(' · ')), search: `${c.name} ${it.name}`, side: use,
      body: `${rules(findItem(c.name, ref).desc)}<div class="buttons">${button('send', key, 'Send', '', i)}${button('remove-item', key, 'Remove', '', i)}</div>` });
  }).join('');
  return card(`${T(it.name)}${qty > 1 ? ` ×${qty}` : ''}`, `${lines}<div class="buttons">${button('send', key, 'Send pack')}${button('remove-item', key, 'Remove pack')}</div>`, T(value), 'pack');
}

export function bagTab(pc, fx, search) {
  const ref = ctx.D.ref, all = entries(pc);
  const coins = ['pp', 'gp', 'ep', 'sp', 'cp'].filter((k) => Number(pc.coin_purse?.[k])).map((k) => `<span><b>${esc(pc.coin_purse[k])}</b> ${k}</span>`).join('') || '<span>No coins</span>';
  const packs = all.filter(([, it]) => packContents(it, ref).length), loose = all.filter((e) => !packs.includes(e));
  const used = loose.filter(([, it]) => consumable(it)), other = loose.filter((e) => !used.includes(e));
  const ac = acBreakdown(pc, fx, ref);
  const math = `${ac.lines.map(([label, text]) => `<div class="line"><span>${T(label)}</span><span>${T(text)}</span></div>`).join('')}${ac.note ? `<p class="hint">${T(ac.note)}</p>` : ''}`;
  // Only the GM changes money; players see what they carry.
  const purse = ctx.GM ? `<button class="coins" data-act="coins" aria-label="Change coins">${coins}<em>Edit</em></button>` : `<div class="coins">${coins}</div>`;
  return `<div class="with-help">${purse}${ask('coins')}</div>
${card('Equipped', gearRows(pc, ctx.GM, ref), '', 'equipped')}
${card(`Armor class ${esc(ac.total)}`, math, '', 'ac')}${cardDetails(pc, ref)}
${all.length > 8 ? `<input class="search" type="search" placeholder="Find an item" aria-label="Find an item" value="${esc(search)}">` : ''}
${card('Consumables', used.map((e) => row(pc, fx, e)).join(''), '', 'consumables')}
${card('Items', other.map((e) => row(pc, fx, e)).join(''))}
${packs.map((e) => packCard(pc, e)).join('')}
${all.length ? '' : '<p class="empty">Your bag is empty.</p>'}`;
}

async function sendSheet(key, it) {
  const { eid } = ctx.state(), others = (await ctx.party()).filter((p) => p.eid !== eid);
  if (!others.length) return toast('There is nobody else in your campaign.');
  const have = Number(it.qty ?? 1) || 1;
  const box = sheet(`Send ${T(it.name)}`, `<label class="field">To<select data-to>${others.map((p) => `<option value="${esc(p.eid)}">${esc(p.name)}</option>`).join('')}</select></label>
${have > 1 ? `<label class="field">How many (you have ${have})<input data-qty type="number" inputmode="numeric" min="1" max="${have}" value="1"></label>` : ''}<div class="buttons big"><button class="primary" data-send>Send</button></div>`);
  box.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-send]'); if (!go) return;
    const to = $('[data-to]', box), qty = Math.trunc(Number($('[data-qty]', box)?.value ?? 1));
    go.disabled = true;
    try {
      const { pc } = ctx.state(), name = to.selectedOptions[0].textContent;
      await ctx.write(() => sendItem({ from: eid, to: to.value, key, qty, item: it, sender: pc.name, reference: ctx.D.ref }));
      box.close(); toast(`Sent ${esc(it.name)} to ${esc(name)}.`);
    } catch { go.disabled = false; }
  });
}

async function healSheet(key, it, dice) {
  const { eid } = ctx.state(), people = await ctx.party();
  const box = sheet(`Use ${T(it.name)}`, `<p>Heals <b>${esc(dice)}</b>.</p><label class="field">Who drinks it<select data-to>${people.map((p) => `<option value="${esc(p.eid)}" ${p.eid === eid ? 'selected' : ''}>${esc(p.name)}${p.eid === eid ? ' (you)' : ''}</option>`).join('')}</select></label><div class="buttons big"><button class="primary" data-drink>Roll and use</button></div>`);
  box.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-drink]'); if (!go) return;
    go.disabled = true;
    const to = $('[data-to]', box), name = to.selectedOptions[0].textContent.replace(' (you)', '');
    const result = await ctx.roll(`${it.name} healing`, dice);
    if (!result) { go.disabled = false; return; }
    try {
      await ctx.write(() => drinkHealing({ from: eid, to: to.value, key, amount: result.total, name: it.name, sender: ctx.state().pc.name, reference: ctx.D.ref }));
      box.close(); toast(`${esc(name)} healed <b>${result.total}</b> (${esc(result.detail)}).`);
    } catch { go.disabled = false; }
  });
}

export async function bagAction(act, target) {
  if (!['equip', 'unequip', 'use', 'send', 'remove-item'].includes(act)) return false;
  let { pc, eid } = ctx.state(), key = target.dataset.key, it = pc?.inventory?.[key];
  if (!it) return true;
  const ref = ctx.D.ref, token = { npcId: `v2:${eid}` };
  try {
    if (target.dataset.part !== undefined) {   // something inside a pack: open the pack first, then act on that item
      const contents = packContents(it, ref), i = Number(target.dataset.part), part = contents[i];
      if (!part || !confirm(`Open the ${it.name} to ${act === 'remove-item' ? 'remove' : act} the ${part.name}? Everything in it becomes a separate item in your bag.`)) return true;
      await ctx.write(() => openPack(eid, key, contents, ref));
      pc = structuredClone(pc); unpack(pc, key, contents, ref);   // the live sheet may not have arrived yet
      key = `${key}-${i}`; it = pc.inventory[key];
    }
    if (act === 'equip' || act === 'unequip') {
      const slot = act === 'equip' ? Object.keys(EQUIPMENT_SLOTS).find((s) => fitsEquipment(s, it, ref))
        : Object.keys(EQUIPMENT_SLOTS).find((s) => equippedItem(pc, s, ref)?.name === it.name);
      if (!slot) return true;
      if (slot === 'card' && act === 'equip' && !ctx.GM && !confirm('Equip this card? Only the GM can remove it afterwards.')) return true;
      await ctx.write(() => equipPCItem(token, slot, act === 'equip' ? key : '', ref));
      toast(`${act === 'equip' ? 'Equipped' : 'Unequipped'} ${esc(it.name)}.`);
    } else if (act === 'send') await sendSheet(key, it);
    else if (act === 'remove-item') {
      const qty = Number(it.qty ?? 1) || 1;
      if (!confirm(`Remove ${it.name}${qty > 1 ? ` (all ${qty})` : ''} from your bag?`)) return true;
      const taken = await ctx.write(() => removeItem(eid, key, qty, ref));
      toast(`Removed ${esc(it.name)}.`, () => restoreItem(eid, key, taken));
    } else {
      const dice = healingDice(it), effect = effectFor(pc, key);
      if (dice) await healSheet(key, it, dice);
      else if (effect) { await ctx.write(() => updatePCEffects(token, { type: 'activate', id: effect.id })); toast(`Used ${esc(it.name)}: ${esc(effect.label)} is active.`); }
      else {
        const taken = await ctx.write(() => removeItem(eid, key, 1, ref));
        toast(`Used ${esc(it.name)}.`, () => restoreItem(eid, key, taken));
      }
    }
  } catch { /* write() already showed the reason */ }
  return true;
}
