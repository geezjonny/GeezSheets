// GeezVTT — roll calls ("the DM calls for a roll"), shared by index.html and sheet.html.
//
// Firebase, under geezvtt/live/<campaign>/ :
//   rollcall = { id, kind, key, title, dc, showDc, mode, to: { <charId>: <name> }, open, t,
//                results: { <rid>: { name, charId?, dice: [{ s, v, drop? }], mod, total, detail, nat, t } } }
//     kind: 'init' | 'save' | 'skill' | 'ability' | 'custom'   key: ability ('dex') or skill ('stealth') id
//     mode: 'normal' | 'adv' | 'dis'   rid: the character id for PCs, anything unique for the DM's extras
//   A result is written once (first answer wins, through a transaction). Answering also
//     pushes the roll to rolls/ (the shared dice log) and, for initiative,
//     sets initiative/rows/pc_<charId> = { name, charId, init } so it lands in the tracker.
//
// The pages use different Firebase SDKs, so writes go through a small api with paths
// relative to the campaign's live root:
//   api = { txn(path, fn) -> Promise<boolean committed>, update(path, obj), push(path, obj) }

export const ABIL = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
export const SKILLS = [
    ['acrobatics', 'Acrobatics', 'dex'], ['animal_handling', 'Animal Handling', 'wis'], ['arcana', 'Arcana', 'int'], ['athletics', 'Athletics', 'str'],
    ['deception', 'Deception', 'cha'], ['history', 'History', 'int'], ['insight', 'Insight', 'wis'], ['intimidation', 'Intimidation', 'cha'],
    ['investigation', 'Investigation', 'int'], ['medicine', 'Medicine', 'wis'], ['nature', 'Nature', 'int'], ['perception', 'Perception', 'wis'],
    ['performance', 'Performance', 'cha'], ['persuasion', 'Persuasion', 'cha'], ['religion', 'Religion', 'int'], ['sleight_of_hand', 'Sleight of Hand', 'dex'],
    ['stealth', 'Stealth', 'dex'], ['survival', 'Survival', 'wis']
];
// Extra dice a player can add to their answer
export const EXTRAS = [['bless', 'Bless', 4], ['guidance', 'Guidance', 4], ['resistance', 'Resistance', 4], ['bardic', 'Bardic Inspiration', 6]];

const asList = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);   // Firebase may hand arrays back as objects
const abMod = (score) => Math.floor(((Number(score) || 10) - 10) / 2);
export const sgn = (n) => (n >= 0 ? '+' : '−') + Math.abs(n);
const statOf = (c, ab) => c?.stats?.[ab] ?? c?.abilities?.[ab]?.score ?? 10;
function rnd(n) { const a = new Uint32Array(1); crypto.getRandomValues(a); return 1 + Math.floor(a[0] / 4294967296 * n); }

// Modifier from the character sheet, with a breakdown: { mod, parts: [[label, n]] }
export function callMod(c, call) {
    const prof = Number(c?.combat?.proficiency_bonus) || 2, parts = [];
    if (call.kind === 'init') {
        const ib = c?.combat?.initiative_bonus;
        if (ib != null && ib !== '') parts.push(['Initiative', Number(ib) || 0]); else parts.push(['DEX', abMod(statOf(c, 'dex'))]);
    } else if (call.kind === 'save') {
        parts.push([call.key.toUpperCase(), abMod(statOf(c, call.key))]);
        if (asList(c?.saves?.proficient).includes(call.key)) parts.push(['Proficient', prof]);
    } else if (call.kind === 'skill') {
        const sk = SKILLS.find((s) => s[0] === call.key), data = c?.skills?.[call.key] || {};
        if (data.bonus != null && data.bonus !== '') parts.push([sk?.[1] || 'Skill', Number(data.bonus) || 0]);
        else {
            parts.push([(sk?.[2] || 'dex').toUpperCase(), abMod(statOf(c, sk?.[2] || 'dex'))]);
            if (data.proficient) parts.push(['Proficient', prof]);
            if (data.expertise) parts.push(['Expertise', prof]);
        }
    } else if (call.kind === 'ability') parts.push([call.key.toUpperCase(), abMod(statOf(c, call.key))]);
    return { mod: parts.reduce((a, p) => a + p[1], 0), parts };
}

export function callTitle(call) {
    if (!call) return '';
    if (call.title) return call.title;
    if (call.kind === 'init') return 'Initiative';
    if (call.kind === 'save') return `${ABIL[call.key] || call.key} Saving Throw`;
    if (call.kind === 'skill') { const sk = SKILLS.find((s) => s[0] === call.key); return `${sk ? `${sk[1]} (${sk[2].toUpperCase()})` : call.key} Check`; }
    if (call.kind === 'ability') return `${ABIL[call.key] || call.key} Check`;
    return 'Roll';
}

// A new call, ready to set at rollcall/
export function newCall({ kind = 'init', key = '', title = '', dc = null, showDc = false, mode = 'normal', to = {} }) {
    return {
        id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        kind, key: kind === 'init' || kind === 'custom' ? '' : key, title: String(title || '').trim(),
        dc: kind !== 'init' && Number(dc) > 0 ? Number(dc) : null, showDc: !!showDc, mode, to, open: true, t: Date.now()
    };
}

// Roll an answer: { dice, mod, total, detail, nat }. c = the character sheet (or null for a flat d20).
export function rollAnswer(c, call, { mode = call.mode || 'normal', extras = {}, other = 0 } = {}) {
    const { mod } = callMod(c, call);
    const dice = [];
    let d20;
    if (mode === 'normal') { d20 = rnd(20); dice.push({ s: 20, v: d20 }); }
    else {
        const a = rnd(20), b = rnd(20);
        d20 = mode === 'adv' ? Math.max(a, b) : Math.min(a, b);
        if (a === d20) dice.push({ s: 20, v: a }, { s: 20, v: b, drop: true });
        else dice.push({ s: 20, v: a, drop: true }, { s: 20, v: b });
    }
    let total = d20 + mod;
    const bits = [`[${dice.map((d) => d.v).join(', ')}]${mode !== 'normal' ? ' ' + mode : ''}`, sgn(mod)];
    for (const [k, label, die] of EXTRAS) if (extras[k]) {
        const sides = k === 'bardic' ? Number(extras.bardicDie || die) : die, v = rnd(sides);
        total += v; dice.push({ s: sides, v }); bits.push(`+ ${label} ${v}`);
    }
    if (other) { total += Number(other) || 0; bits.push(sgn(Number(other) || 0)); }
    return { dice, mod, total, detail: bits.join(' '), nat: d20 };
}

// Write an answer for rid. Returns the result, or null if someone already answered or the call changed.
export async function answerCall(api, call, rid, { name, charId = null, c = null, by = name, ...opts }) {
    if (!call?.open) return null;
    const r = rollAnswer(c, call, opts);
    const res = { name, dice: r.dice, mod: r.mod, total: r.total, detail: r.detail, nat: r.nat, t: Date.now() };
    if (charId) res.charId = charId;
    const ok = await api.txn(`rollcall/results/${rid}`, (cur) => (cur ? undefined : res));
    if (!ok) return null;
    api.push('rolls', { by, expr: callTitle(call), detail: r.detail, total: r.total, nat: r.nat, dice: r.dice, ts: res.t, call: call.id, ...(charId ? { char: charId } : {}) });
    if (call.kind === 'init' && charId) api.update('initiative/rows', { ['pc_' + charId]: { name, charId, init: r.total } });
    return res;
}

// Pass/fail against the DC (null when there's no DC or it's initiative)
export const passed = (call, r) => (call?.dc && call.kind !== 'init' && r ? r.total >= call.dc : null);
