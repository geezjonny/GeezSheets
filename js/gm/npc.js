// NPC tab: roll someone out of thin air, adjust the stat block, save them to the campaign or send a token to Owlbear.
import { entitiesURL } from '../geez/pc-inventory.js';
import { decodeTree } from '../geez/firebase-codec.js';
import { updateConditionally } from '../geez/firebase-update.js';
import { newId } from '../gaia-core/ids.mjs';
import { rollNpc, npcName, npcEntity, STAT_BLOCKS } from './npc-model.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); };
const bonus = (n) => { const m = Math.floor((Number(n) - 10) / 2); return (m >= 0 ? '+' : '') + m; };

export function npcHTML(profile, block, monster) {
  const a = profile.appearance || {}, c = block.combat || {}, s = block.stats || {};
  const line = (label, value) => (value && value !== 'None' ? `<div class="npc-line"><span class="muted">${label}</span><span>${esc(value)}</span></div>` : '');
  return `<p class="muted">${esc([profile.age, profile.height, profile.ancestry, profile.profession].filter(Boolean).join(' · '))}</p>
${line('Manner', profile.demeanor)}${line('Notable', a.distinctive_feature)}${line('Face', a.facial_features)}${line('Hair', a.hair)}${line('Facial hair', a.facial_hair)}${line('Skin', a.skin)}${line('Secret', profile.secret)}${line('Carries', [profile.gear?.weapon, profile.gear?.armor].filter((x) => x && x !== 'None').join(', '))}
<div class="statline"><b>AC ${esc(c.ac)}</b><b>HP ${esc(c.hp_max)}</b><b>Speed ${esc(c.speed)}</b><b>CR ${esc(block.cr)}</b></div>
<div class="statline">${['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => `<span>${k.toUpperCase()} ${esc(s[k])} (${bonus(s[k])})</span>`).join('')}</div>
${(monster?.actions || []).map((x) => `<p><b>${esc(x.name)}.</b> ${esc(x.desc)}</p>`).join('')}`;
}

export function mountNpc(ctx) {
  let tables, monsters, npc = null, savedId = null, saved = [];
  const status = (text) => { $('npc-status').textContent = text; };
  const monster = (name) => monsters.find((m) => m.name === name);

  function draw() {
    $('npc-result').hidden = !npc;
    if (!npc) return;
    const m = monster($('npc-block').value), entity = npcEntity('npc_preview', npc, m, ctx.campaign());
    $('npc-name').textContent = npcName(npc);
    $('npc-detail').innerHTML = npcHTML(npc, entity.data.statblock, m);
    $('npc-save').disabled = !!savedId;
  }
  function drawSaved() {
    const mine = saved.filter((e) => e.campaign === ctx.campaign()).sort((a, b) => String(b.meta?.created_at).localeCompare(String(a.meta?.created_at)));
    $('npc-saved').innerHTML = mine.map((e) => `<details data-npc="${esc(e.id)}"><summary><b>${esc(e.name)}</b> <span class="muted">${esc([e.data.profile?.ancestry, e.data.profile?.profession].filter(Boolean).join(' '))}</span></summary>${monsters ? npcHTML(e.data.profile || {}, e.data.statblock || {}, monster(e.data.stat_block_name)) : ''}<button class="danger" data-remove>Remove</button></details>`).join('') || '<p class="muted">No saved NPCs in this campaign.</p>';
  }
  async function load() {
    if (!tables) {
      [tables, monsters] = await Promise.all([json('data/npc_tables.json'), json('data/monsters.json')]);
      const options = (list, first) => `<option value="">${first}</option>` + [...list].sort().map((v) => `<option>${esc(v)}</option>`).join('');
      $('npc-race').innerHTML = options(tables.tables.Race, 'Any ancestry');
      $('npc-job').innerHTML = options(tables.tables.Profession, 'Any profession');
      $('npc-block').innerHTML = monsters.map((m) => `<option>${esc(m.name)}</option>`).join('');
      $('npc-roll').disabled = false;
    }
    const all = decodeTree(await json(`${entitiesURL()}.json`)) || {};
    saved = Object.values(all).filter((e) => e?.kind === 'npc' && e.source?.system === 'gm-companion' && e.data && !e.data._sheetsDeleted);
    drawSaved();
  }

  $('npc-roll').addEventListener('click', () => {
    npc = rollNpc(tables, { race: $('npc-race').value, profession: $('npc-job').value });
    savedId = null; $('npc-block').value = STAT_BLOCKS[npc.profession] || 'Commoner'; status(''); draw();
  });
  $('npc-block').addEventListener('change', () => { savedId = null; draw(); });
  $('npc-save').addEventListener('click', async () => {
    if (!npc || savedId) return;
    if (!ctx.campaign()) return status('Choose a campaign first.');
    const id = newId('npc'), entity = npcEntity(id, npc, monster($('npc-block').value), ctx.campaign());
    $('npc-save').disabled = true;
    try {
      await updateConditionally(`${entitiesURL()}/${id}.json`, (existing) => { if (existing) throw new Error('That ID already exists. Save again.'); return { result: entity, write: entity }; }, 'Could not save. Try again.');
      savedId = id; saved.push(entity); drawSaved(); status(`Saved ${entity.name}.`);
    } catch (error) { status(error.message); }
    draw();
  });
  $('npc-token').addEventListener('click', () => ctx.spawn($('npc-block').value.toLowerCase().replace(/\s+/g, '_'), 1, status));
  $('npc-saved').addEventListener('click', async (e) => {
    const box = e.target.closest('[data-remove]')?.closest('[data-npc]');
    if (!box) return;
    const entry = saved.find((x) => x.id === box.dataset.npc);
    if (!confirm(`Remove ${entry.name}?`)) return;
    try {
      await updateConditionally(`${entitiesURL()}/${entry.id}.json`, (record) => { if (!record?.data) throw new Error('Already gone.'); record.data._sheetsDeleted = true; return { result: record }; }, 'Could not remove. Try again.');
      saved = saved.filter((x) => x !== entry); drawSaved();
    } catch (error) { status(error.message); }
  });
  ctx.onParty(() => drawSaved());
  return () => load().catch((error) => status(error.message)); // called each time the tab opens
}
