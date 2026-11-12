// GeezSheets for Owlbear Rodeo: shared bits for the popover and the background page.
import OBR, { buildLabel } from 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm';
export { OBR, buildLabel };

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

// The live sheet. GM: full edit (same ?gm key as the site). Player: the server lets them change only their own PC.
export function sheetUrl(char, role, mine) {
    const u = new URL('../sheet.html', import.meta.url), q = u.searchParams;
    q.set('char', char); q.set('embed', ''); q.set('db', 'gaia'); q.set('gaia', 'firebase');
    if (role === 'GM') q.set('gm', 'jonny');
    else { q.set('player', ''); if (mine) q.set('pc', mine); }
    return u.href.replace(/=(&|$)/g, '$1');
}
