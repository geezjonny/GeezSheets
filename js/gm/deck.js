// Deck of Chance, GM side: push three face-down cards, watch the pick, and optionally have a local AI write it up.
import { pushChance, closeChance, watchChance } from '../geez/chance-sync.js';
import { revealBargain, WORD_COUNT, WORD_LABELS } from '../geez/devils-deck-model.js';
import { randomDie } from '../geez/dice-roll.js';
import { oracleRequest, parseOracleDraft, ollamaURL } from '../geez/deck-oracle-model.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PHASE = { offered: 'Choosing…', revealed: 'Revealed', handled: 'Handled', cancelled: 'Cancelled' };

export function mountDeck(ctx) {
  let records = {}, busy = false, pending = null, watching = false;
  const status = (t) => { $('deck-status').textContent = t; };
  function draw() {
    const selected = $('deck-pc').value, pcs = ctx.pcs();
    $('deck-pc').replaceChildren(...pcs.map((p) => new Option(p.name, p.eid)));
    if (pcs.some((p) => p.eid === selected)) $('deck-pc').value = selected;
    const open = new Set([...$('deck-table').querySelectorAll('details[open]')].map((d) => d.dataset.pc));
    const mine = Object.values(records).filter((r) => r.hand.phase !== 'cancelled' && pcs.some((p) => p.eid === r.pcId)).sort((a, b) => b.hand.createdAt - a.hand.createdAt);
    $('deck-table').innerHTML = mine.map((r) => {
      const hand = r.hand, bargain = hand.chosen === null ? null : revealBargain(hand.cards[hand.chosen]);
      return `<details class="card" data-pc="${esc(r.pcId)}" ${open.has(r.pcId) || hand.phase === 'revealed' ? 'open' : ''}><summary><b>${esc(r.name)}</b> · draw ${esc(hand.drawNumber)} · ${bargain ? esc(bargain.name) : PHASE[hand.phase]} <span class="muted">${bargain ? PHASE[hand.phase] : ''}</span></summary>
${bargain ? `<p>${esc(bargain.flavor)}</p>${bargain.words.map(([word, meaning], i) => `<p><b>${esc(WORD_LABELS[i])}: ${esc(word)}</b> — ${esc(meaning)}</p>`).join('')}` : ''}
<div class="row-actions">${hand.phase === 'offered' ? '<button data-deck="cancelled">Cancel draw</button>' : ''}${hand.phase === 'revealed' ? '<button class="primary" data-deck="handled">Mark handled</button>' : ''}${bargain ? '<button data-deck="write">Write it up with AI</button>' : ''}</div></details>`;
    }).join('') || '<p class="muted">No draws yet.</p>';
  }
  $('deck-push').addEventListener('click', async () => {
    const pcId = $('deck-pc').value;
    if (!pcId || busy) return;
    if (pending?.pcId !== pcId) pending = { id: crypto.randomUUID(), pcId, name: $('deck-pc').selectedOptions[0].textContent.slice(0, 80), createdAt: Date.now(),
      cards: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => randomDie(WORD_COUNT))) };
    busy = true; $('deck-push').disabled = true; status('Sending…');
    try { await pushChance(pending); status(`${pending.name} now has three cards on their companion.`); pending = null; }
    catch (error) { status(error.message); }
    finally { busy = false; $('deck-push').disabled = false; }
  });
  async function write(record) {
    const hand = record.hand;
    status('The oracle is writing… this can take a few minutes.');
    const body = oracleRequest(revealBargain(hand.cards[hand.chosen]), hand.drawNumber, $('deck-model').value);
    const response = await fetch(ollamaURL($('deck-url').value), { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(String(result.error || `Ollama returned ${response.status}`).slice(0, 300));
    if (typeof result.response !== 'string' || result.response.length > 40000) throw new Error('The oracle gave no usable answer.');
    sessionStorage.setItem('geezvtt.creator-draft', JSON.stringify(parseOracleDraft(JSON.parse(result.response))));
    status('Draft ready in Create. Review it, then save.');
    ctx.openCreator({ pc: record.pcId, draft: '1' });
  }
  $('deck-table').addEventListener('click', async (e) => {
    const button = e.target.closest('[data-deck]');
    if (!button || busy) return;
    const record = records[button.closest('[data-pc]').dataset.pc];
    busy = true; button.disabled = true;
    try {
      if (button.dataset.deck === 'write') await write(record);
      else { await closeChance(record.pcId, record.hand.id, button.dataset.deck); status(''); }
    } catch (error) {
      status(button.dataset.deck === 'write' ? `${error.message}. Check that Ollama is running and that OLLAMA_ORIGINS allows ${location.origin}.` : error.message);
    } finally { busy = false; button.disabled = false; }
  });
  ctx.onParty(draw);
  return () => { if (!watching) { watching = true; watchChance((value) => { records = value; draw(); }, status); } draw(); };
}
