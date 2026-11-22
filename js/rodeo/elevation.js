// Pure floor rectangle partitioning for the elevation paint tool.
const hit = (x, y, rs) => rs.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

// Return database changes that paint only the parts of existing floors covered by rects.
// The first piece keeps its old id; additional row-run pieces get stable derived ids.
export function applyElevation(floors, rects, elev, lv) {
  const changes = {}, used = new Set(Object.keys(floors || {}));
  for (const [id, f] of Object.entries(floors || {})) {
    if ((f.lv ?? 0) !== lv || !f.w || !f.h) continue;
    const rs = rects.filter((r) => r && r.w > 0 && r.h > 0 && r.x < f.x + f.w && r.x + r.w > f.x && r.y < f.y + f.h && r.y + r.h > f.y);
    if (!rs.length) continue;
    const xs = [...new Set([f.x, f.x + f.w, ...rs.flatMap((r) => [Math.max(f.x, r.x), Math.min(f.x + f.w, r.x + r.w)]).filter((x) => x > f.x && x < f.x + f.w)])].sort((a, b) => a - b);
    const ys = [...new Set([f.y, f.y + f.h, ...rs.flatMap((r) => [Math.max(f.y, r.y), Math.min(f.y + f.h, r.y + r.h)]).filter((y) => y > f.y && y < f.y + f.h)])].sort((a, b) => a - b);
    const rows = [];
    for (let yi = 0; yi < ys.length - 1; yi++) {
      const y = ys[yi], h = ys[yi + 1] - y, row = [];
      for (let xi = 0; xi < xs.length - 1; xi++) {
        const x = xs[xi], w = xs[xi + 1] - x, next = hit(x + w / 2, y + h / 2, rs) ? elev : (f.elev || 0);
        const last = row[row.length - 1];
        if (last && last.elev === next && last.x + last.w === x) last.w += w;
        else row.push({ x, y, w, h, elev: next });
      }
      rows.push(...row);
    }
    const pieces = [];
    for (const p of rows) {
      const last = pieces[pieces.length - 1];
      if (last && last.x === p.x && last.w === p.w && last.elev === p.elev && last.y + last.h === p.y) last.h += p.h;
      else pieces.push(p);
    }
    if (pieces.length === 1 && pieces[0].elev === (f.elev || 0)) continue;
    changes[`map/floors/${id}`] = withElevation({ ...f, x: pieces[0].x, y: pieces[0].y, w: pieces[0].w, h: pieces[0].h }, pieces[0].elev);
    pieces.slice(1).forEach((p, n) => {
      let pid = `${id}~${n}`; while (used.has(pid) || changes[`map/floors/${pid}`]) pid += "~";
      used.add(pid); changes[`map/floors/${pid}`] = withElevation({ ...f, x: p.x, y: p.y, w: p.w, h: p.h }, p.elev);
    });
  }
  return changes;
}

const withElevation = (f, elev) => elev ? { ...f, elev } : (() => { const { elev: _, ...rest } = f; return rest; })();
