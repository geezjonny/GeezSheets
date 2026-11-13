// Movement range: the grid squares a token can reach this turn without crossing a blocking wall.
// No OBR import, so Node can test it (owlbear/move.test.mjs).

const side = (o, a, b) => Math.sign((a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x));
// A step p→q is blocked by wall a–b when p and q are on opposite sides of the wall and the wall
// reaches the step's line (touching counts, so a diagonal can't slip through the corner where two walls meet).
export const blocks = (p, q, a, b) => side(a, b, p) * side(a, b, q) < 0 && side(p, q, a) * side(p, q, b) <= 0;

// start = {i, j} cell; steps = squares of movement; segs = [[{x,y},{x,y}], ...] blocking walls in scene units.
// Diagonals cost one square (Owlbear's default Chebyshev measuring). Returns [[i, j], ...] including the start.
export function reach(start, steps, dpi, segs) {
    const mid = (i, j) => ({ x: (i + 0.5) * dpi, y: (j + 0.5) * dpi });
    const lo = mid(start.i - steps - 1, start.j - steps - 1), hi = mid(start.i + steps + 1, start.j + steps + 1);
    const near = segs.filter(([a, b]) => Math.max(a.x, b.x) >= lo.x && Math.min(a.x, b.x) <= hi.x
        && Math.max(a.y, b.y) >= lo.y && Math.min(a.y, b.y) <= hi.y);
    const seen = new Set([start.i + ',' + start.j]), out = [[start.i, start.j]];
    let front = out;
    for (let s = 0; s < steps && front.length; s++) {
        const next = [];
        for (const [i, j] of front) for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
            const k = (i + di) + ',' + (j + dj);
            if (seen.has(k)) continue;
            const p = mid(i, j), q = mid(i + di, j + dj);
            if (near.some(([a, b]) => blocks(p, q, a, b))) continue;
            seen.add(k); next.push([i + di, j + dj]);
        }
        out.push(...next); front = next;
    }
    return out;
}

// Walking speed in feet from a GeezSheets sheet ("30", 30, "30 ft.") or an SRD monster ({walk: "30 ft."}).
export const feet = (v) => parseInt(typeof v === 'object' && v ? v.walk : v) || 0;

// Match an Owlbear token name to a character or monster name: "Goblin 2" / "goblin #2" → "goblin".
export const plain = (s) => String(s || '').toLowerCase().replace(/\s*#?\d+$/, '').trim();
