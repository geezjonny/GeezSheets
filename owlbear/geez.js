// GeezSheets for Owlbear Rodeo: shared bits for the popover and the background page.
import OBR from 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm';
export { OBR };

export const KEY = 'com.geezsheets/char';           // token metadata: which GeezSheets character it is
export const POPOVER = 'com.geezsheets/sheet';
export const page = (p) => new URL(p, import.meta.url).href;

// The party's PCs, straight from Gaia (/v2 is publicly readable, like the sheet page itself reads it).
const ENTITIES = 'https://geezsheets-default-rtdb.firebaseio.com/v2/worlds/gaia/entities.json';
export async function characters() {
    const all = await (await fetch(ENTITIES)).json();
    return Object.values(all || {})
        .filter((e) => e && e.kind === 'pc' && !e.data?._sheetsDeleted)
        .map((e) => {
            // sheet.html?char= takes the sheet id, which is the end of the PC's characters/pcs/<id> source path
            const src = [e.source?.id, ...(e.source?.mirrors || [])].find((p) => p?.startsWith('characters/pcs/'));
            return { id: src ? src.split('/').pop() : e.id, name: e.name, campaign: e.campaign || '' };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

// The live sheet. GM: full edit (same ?gm key as the site). Player: the server lets them change only their own PC.
export function sheetUrl(char, role, mine) {
    const u = new URL('../sheet.html', import.meta.url), q = u.searchParams;
    q.set('char', char); q.set('embed', ''); q.set('db', 'gaia'); q.set('gaia', 'firebase');
    if (role === 'GM') q.set('gm', 'jonny');
    else { q.set('player', ''); if (mine) q.set('pc', mine); }
    return u.href.replace(/=(&|$)/g, '$1');
}
