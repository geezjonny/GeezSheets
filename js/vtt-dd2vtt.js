// vtt-dd2vtt.js — reads a Dungeondraft .dd2vtt (loaded from the repo's battlemap/ folder) into
// a background layer plus walls/doors/lights in grid units, the shape the VTT draws and saves.
export function parseDd2vtt(j, rid) {
  if (!j || !j.resolution || !j.image) throw new Error("not a dd2vtt file");
  const o = j.resolution.map_origin || { x: 0, y: 0 };
  const P = (p) => ({ x: +(p.x - o.x).toFixed(4), y: +(p.y - o.y).toFixed(4) });
  const img = String(j.image);
  const mime = img.startsWith("/9j/") ? "image/jpeg" : img.startsWith("UklGR") ? "image/webp" : "image/png";

  const walls = [];
  for (const line of (j.line_of_sight || []).concat(j.objects_line_of_sight || [])) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = P(line[i]), b = P(line[i + 1]);
      walls.push({ id: rid("g"), floor: 0, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  const doors = (j.portals || []).filter(p => p.bounds?.length >= 2).map(p => {
    const a = P(p.bounds[0]), b = P(p.bounds[1]);
    return { id: rid("g"), floor: 0, closed: p.closed !== false, freestanding: !!p.freestanding, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
  const lights = (j.lights || []).map(l => ({
    id: rid("g"), floor: 0, ...P(l.position),
    range: l.range ?? 4, color: l.color || "ffFFEDCF", intensity: l.intensity ?? 1, shadows: l.shadows !== false
  }));
  return {
    layer: { floor: 0, x: 0, y: 0, w: j.resolution.map_size.x, h: j.resolution.map_size.y, url: `data:${mime};base64,${img}` },
    geometry: { walls, doors, lights, lightingParams: { blackAlpha: 1 } }
  };
}
