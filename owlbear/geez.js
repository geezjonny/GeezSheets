// GeezSheets for Owlbear Rodeo: shared bits for the popover and the background page.
import OBR, { buildLabel, buildShape, buildText } from 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm';
export { OBR, buildLabel, buildShape, buildText };

export const KEY = 'com.geezsheets/char';           // token metadata: which GeezSheets character it is
export const POPOVER = 'com.geezsheets/sheet';
export const LABELS = 'geez.obr.labels';          // localStorage: '0' hides the HP labels on tokens
// HP bar colour: green, amber at half, red at a quarter, dark red when down
export const hpColor = (p) => { const r = p.hp / (p.max || 1); return p.hp <= 0 ? '#7f1d1d' : r <= 0.25 ? '#dc2626' : r <= 0.5 ? '#d97706' : '#16a34a'; };
export const page = (p) => new URL(p, import.meta.url).href;

// The party's PCs, straight from Gaia (/v2 is publicly readable, like the sheet page itself reads it).
const ENTITIES = 'https://geezsheets-default-rtdb.firebaseio.com/v2/worlds/gaia/entities.json';
export async function characters() {
    return Object.values(party(await (await fetch(ENTITIES)).json())).sort((a, b) => a.name.localeCompare(b.name));
}

// Firebase stores [] as {"%EMPTY":"array"}; conditions may come back as an array or an object.
const list = (v) => Array.isArray(v) ? v : Object.entries(v || {}).filter(([k]) => k !== '%EMPTY').map(([, x]) => x);

// { sheetId: {id, name, campaign, hp, max, temp, ac, conditions, conc, exhaustion, saves} } for every PC.
export function party(all) {
    const out = {};
    for (const e of Object.values(all || {})) {
        if (!e || e.kind !== 'pc' || e.data?._sheetsDeleted) continue;
        // sheet.html?char= takes the sheet id, which is the end of the PC's characters/pcs/<id> source path
        const src = [e.source?.id, ...(e.source?.mirrors || [])].find((p) => p?.startsWith('characters/pcs/'));
        const id = src ? src.split('/').pop() : e.id, c = e.data?.combat || {}, d = c.death_saves || {};
        out[id] = {
            id, name: e.name || '?', campaign: e.campaign || '',
            hp: Number(c.hp_current) || 0, max: Number(c.hp_max) || 0, temp: Number(c.temp_hp) || 0, ac: c.ac ?? '',
            conditions: list(c.conditions).filter((x) => typeof x === 'string'),
            conc: c.concentration?.active ? (c.concentration.spell || 'Concentrating') : '',
            exhaustion: Number(c.exhaustion) || 0,
            saves: { ok: Number(d.success ?? c.death_save_successes) || 0, fail: Number(d.fail ?? c.death_save_failures) || 0 },
        };
    }
    return out;
}

// Live party: one Firebase event stream (a full copy first, then only the changes). Returns a stop function.
export function watchParty(cb) {
    let all = {}, timer;
    const set = (path, v) => {
        const keys = path.split('/').filter(Boolean);
        if (!keys.length) { all = v || {}; return; }
        let o = all;
        for (const k of keys.slice(0, -1)) o = (o[k] && typeof o[k] === 'object') ? o[k] : (o[k] = {});
        if (v === null) delete o[keys.at(-1)]; else o[keys.at(-1)] = v;
    };
    const on = (patch) => (ev) => {
        const { path, data } = JSON.parse(ev.data);
        if (patch) for (const [k, v] of Object.entries(data || {})) set(path + '/' + k, v);
        else set(path, data);
        clearTimeout(timer); timer = setTimeout(() => cb(party(all)), 150);
    };
    const es = new EventSource(ENTITIES);   // reconnects by itself; a reconnect starts with a fresh full copy
    es.addEventListener('put', on(false));
    es.addEventListener('patch', on(true));
    return () => es.close();
}

// One Firebase stream per tab: each stream holds a connection open and Chrome allows only ~6 per site
// across all tabs, so the background page streams and shares the party with the popover and the float panel.
const CHAN = 'com.geezsheets/party';
export function shareParty(cb) {
    const ch = new BroadcastChannel(CHAN);
    let last = null;
    ch.onmessage = (e) => { if (e.data === 'want' && last) ch.postMessage(last); };
    return watchParty((p) => { last = p; ch.postMessage(p); cb(p); });
}
export function listenParty(cb) {
    const ch = new BroadcastChannel(CHAN);
    const own = setTimeout(() => watchParty(cb), 4000);   // no background page answered: stream it ourselves
    ch.onmessage = (e) => { if (e.data && e.data !== 'want') { clearTimeout(own); cb(e.data); } };
    ch.postMessage('want');
}

// The live sheet. GM: full edit (same ?gm key as the site). Player: the server lets them change only their own PC.
export function sheetUrl(char, role, mine) {
    const u = new URL('../sheet.html', import.meta.url), q = u.searchParams;
    q.set('char', char); q.set('embed', ''); q.set('db', 'gaia'); q.set('gaia', 'firebase');
    if (role === 'GM') q.set('gm', 'jonny');
    else { q.set('player', ''); if (mine) q.set('pc', mine); }
    return u.href.replace(/=(&|$)/g, '$1');
}

export const esc = (t) => String(t).replace(/[<&>"]/g, (m) => `&#${m.charCodeAt(0)};`);

// Party view: everyone's HP bar, AC and status, live. Click a row to open that sheet.
export function partyRows(pcs) {
  const byCamp = {};
  for (const p of Object.values(pcs)) (byCamp[p.campaign] ||= []).push(p);
  const camps = Object.keys(byCamp).sort();
  return camps.map((c) => (camps.length > 1 ? `<h4 class="camp">${esc(c || 'No campaign')}</h4>` : '') + byCamp[c].sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
    const tot = Math.max(p.max, p.hp + p.temp) || 1, pct = (v) => Math.max(0, Math.min(100, v / tot * 100)).toFixed(1);
    const tags = [
      p.hp <= 0 && p.max ? `<b class="down">Down · saves ${p.saves.ok}✓ ${p.saves.fail}✗</b>` : '',
      p.conc ? `<b class="conc">◎ ${esc(p.conc)}</b>` : '',
      p.exhaustion ? `<b>Exhaustion ${p.exhaustion}</b>` : '',
      ...p.conditions.map((x) => `<b>${esc(x)}</b>`),
    ].join('');
    return `<button class="pc" data-id="${esc(p.id)}"><div class="top"><b>${esc(p.name)}</b><span class="ac">AC ${esc(p.ac)}</span></div>
      <div class="bar"><i style="width:${pct(p.hp)}%;background:${hpColor(p)}"></i><i class="temp" style="left:${pct(p.hp)}%;width:${pct(p.temp)}%"></i>
      <span>${p.hp} / ${p.max}${p.temp ? ` +${p.temp}` : ''}</span></div><div class="tags">${tags}</div></button>`;
  }).join('')).join('') || 'No characters.';
}

// Floating party panel: a popover that stays open (no click-away) at a remembered screen spot.
export const FLOAT = 'com.geezsheets/float', FLOAT_ON = 'geez.obr.float.on', FLOAT_POS = 'geez.obr.float.pos';
export function openFloat(pos) {
    if (!pos) try { pos = JSON.parse(localStorage.getItem(FLOAT_POS)); } catch {}
    try { localStorage.setItem(FLOAT_ON, '1'); if (pos) localStorage.setItem(FLOAT_POS, JSON.stringify(pos)); } catch {}
    const corner = { horizontal: 'LEFT', vertical: 'TOP' };
    return OBR.popover.open({
        id: FLOAT, url: page('float.html'), width: 260, height: 300,
        anchorReference: 'POSITION', anchorPosition: pos || { left: 90, top: 90 }, anchorOrigin: corner, transformOrigin: corner,
        disableClickAway: true, marginThreshold: 0,
    });
}
