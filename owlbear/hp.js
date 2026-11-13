// HP bars on character tokens, back from 1.6 (minus the sheet popover / party panel): local items attached to
// each PC token (every client draws its own, nothing is saved in the room), fed by a live Firebase stream.
import OBR, { buildLabel, buildShape, buildText } from 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm';
import { feet } from './move.js';

const KEY = 'com.geezsheets/char';   // tokens linked by 1.x "Link token" still carry this: the sheet id
const ENTITIES = 'https://geezsheets-default-rtdb.firebaseio.com/v2/worlds/gaia/entities.json';
const TAG = 'com.geezsheets/hp', NO = ['ROTATION', 'VISIBLE', 'COPY', 'SCALE'];

// HP bar colour: green, amber at half, red at a quarter, dark red when down
const hpColor = (p) => { const r = p.hp / (p.max || 1); return p.hp <= 0 ? '#7f1d1d' : r <= 0.25 ? '#dc2626' : r <= 0.5 ? '#d97706' : '#16a34a'; };
// Firebase stores [] as {"%EMPTY":"array"}; conditions may come back as an array or an object.
const list = (v) => Array.isArray(v) ? v : Object.entries(v || {}).filter(([k]) => k !== '%EMPTY').map(([, x]) => x);

// { sheetId: {id, name, hp, max, temp, speed, conditions, conc, exhaustion, saves} } for every PC.
function party(all) {
    const out = {};
    for (const e of Object.values(all || {})) {
        if (!e || e.kind !== 'pc' || e.data?._sheetsDeleted) continue;
        const src = [e.source?.id, ...(e.source?.mirrors || [])].find((p) => p?.startsWith('characters/pcs/'));
        const id = src ? src.split('/').pop() : e.id, c = e.data?.combat || {}, d = c.death_saves || {};
        out[id] = {
            id, name: e.name || '?', hp: Number(c.hp_current) || 0, max: Number(c.hp_max) || 0, temp: Number(c.temp_hp) || 0,
            speed: feet(c.speed), conditions: list(c.conditions).filter((x) => typeof x === 'string'),
            conc: c.concentration?.active ? (c.concentration.spell || 'Concentrating') : '',
            exhaustion: Number(c.exhaustion) || 0,
            saves: { ok: Number(d.success ?? c.death_save_successes) || 0, fail: Number(d.fail ?? c.death_save_failures) || 0 },
        };
    }
    return out;
}

// Live copy of one Firebase path (REST event stream: a full copy first, then only the changes).
function stream(url, cb) {
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
        clearTimeout(timer); timer = setTimeout(() => cb(all), 150);
    };
    const es = new EventSource(url);   // reconnects by itself; a reconnect starts with a fresh full copy
    es.addEventListener('put', on(false));
    es.addEventListener('patch', on(true));
}

let pcs = {}, byName = new Map();
const norm = (t) => String(t || '').trim().toLowerCase();
// A token is a PC if it was linked (1.x) or its name / label matches a PC's name or first name.
export const who = (t) => pcs[t.metadata[KEY]] || byName.get(norm(t.text?.plainText)) || byName.get(norm(t.name));
const names = () => {
    const m = new Map(), dup = new Set();
    for (const p of Object.values(pcs)) for (const n of new Set([norm(p.name), norm(p.name).split(/\s+/)[0]])) {
        if (!n) continue;
        if (m.has(n) && m.get(n) !== p) dup.add(n); else m.set(n, p);
    }
    for (const n of dup) m.delete(n);   // "Jon" can't pick between two Jons
    return m;
};
// the token picture's box in scene units (same maths as Stat Bubbles' getImageDimensions)
const box = (t, dpi) => {
    const k = dpi / t.grid.dpi, w = t.image.width * k * t.scale.x, h = t.image.height * k * t.scale.y;
    const x = t.position.x - t.grid.offset.x / t.image.width * w, y = t.position.y - t.grid.offset.y / t.image.height * h;
    return { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) };
};
const status = (p) => [p.hp <= 0 && p.max ? `☠ ${p.saves.ok}✓ ${p.saves.fail}✗` : '', p.conc && '◎ ' + p.conc,
    p.exhaustion && 'Exhaustion ' + p.exhaustion, ...p.conditions].filter(Boolean).join(' · ');
function build(t, p, sig, dpi) {
    const r = box(t, dpi), H = Math.round(dpi * 0.2), pad = Math.round(dpi * 0.04), bw = r.w - pad * 2;
    const at = { x: r.x + pad, y: r.y + r.h - H - pad }, max = p.max || 1;
    const hpW = bw * Math.max(0, Math.min(1, p.hp / max)), tmpW = Math.min(bw - hpW, bw * p.temp / max);
    const common = (it, n) => it.id(`${t.id}-geez-${n}`).attachedTo(t.id).locked(true).disableHit(true)
        .disableAttachmentBehavior(NO).visible(true).metadata({ [TAG]: sig }).build();
    const rect = (n, x, w, color, op) => common(buildShape().shapeType('RECTANGLE').position({ x, y: at.y }).width(w).height(H)
        .fillColor(color).fillOpacity(op).strokeWidth(0).strokeOpacity(0).layer('ATTACHMENT'), n);
    const out = [rect('bg', at.x, bw, '#000000', 0.6)];
    if (hpW > 0) out.push(rect('hp', at.x, hpW, hpColor(p), 0.9));
    if (tmpW > 0) out.push(rect('tmp', at.x + hpW, tmpW, '#38bdf8', 0.9));
    out.push(common(buildText().textType('PLAIN').plainText(`${p.hp}/${p.max}${p.temp ? ' +' + p.temp : ''}`).position(at).width(bw).height(H)
        .fontSize(Math.round(H * 0.8)).fontWeight(700).lineHeight(1).textAlign('CENTER').textAlignVertical('MIDDLE')
        .fillColor('#ffffff').strokeColor('#000000').strokeWidth(2).layer('TEXT'), 'txt'));
    const st = status(p);
    if (st) out.push(common(buildLabel().plainText(st).position({ x: r.x + r.w / 2, y: r.y + r.h }).fontSize(Math.round(H * 0.6))
        .backgroundColor('#1e293b').backgroundOpacity(0.85).pointerDirection('UP').pointerHeight(0).layer('TEXT'), 'st'));
    return out;
}

export function hpBars(role) {
    let busy = false, again = false;
    async function sync() {
        if (busy) { again = true; return; }
        busy = true;
        try {
            if (!(await OBR.scene.isReady())) return;
            const dpi = await OBR.scene.grid.getDpi();
            const tokens = await OBR.scene.items.getItems((i) => (i.layer === 'CHARACTER' || i.layer === 'MOUNT') && i.type === 'IMAGE' && (i.visible || role === 'GM'));
            const want = new Map();
            for (const t of tokens) {
                const p = who(t);
                // rebuild a token's bar only when its numbers or picture size change (moving is handled by the attachment)
                if (p) want.set(t.id, { t, p, sig: JSON.stringify([p.hp, p.max, p.temp, status(p), t.image.width, t.image.height, t.scale, t.grid, dpi]) });
            }
            const have = await OBR.scene.local.getItems((i) => i.metadata[TAG]);
            const old = have.filter((i) => want.get(i.attachedTo)?.sig !== i.metadata[TAG]);
            if (old.length) await OBR.scene.local.deleteItems(old.map((i) => i.id));
            const ok = new Set(have.filter((i) => !old.includes(i)).map((i) => i.attachedTo));
            const add = [...want].filter(([id]) => !ok.has(id)).flatMap(([, w]) => build(w.t, w.p, w.sig, dpi));
            if (add.length) await OBR.scene.local.addItems(add);
        } catch (e) { console.warn('GeezSheets HP bars:', e); }
        finally { busy = false; if (again) { again = false; sync(); } }
    }
    stream(ENTITIES, (all) => { pcs = party(all); byName = names(); sync(); });
    OBR.scene.items.onChange(sync);
    OBR.scene.onReadyChange(sync);
}
