// dd2vtt.js — dd2vtt <-> world. Export stays a valid dd2vtt; zones, routes and
// (optionally) NPCs ride along under a "geez" key that other VTTs ignore.
(function (G) {
  const { uid } = G.geom;

  function importDD2VTT(json) {
    const res = json.resolution || {};
    const origin = res.map_origin || { x: 0, y: 0 };
    const size = res.map_size || { x: 20, y: 20 };
    const world = {
      origin: { x: origin.x, y: origin.y },
      width: size.x, height: size.y,
      pixelsPerGrid: res.pixels_per_grid || 70,
      walls: [], doors: [], lights: [], zones: [], routes: [],
    };

    const addLines = (lines) => (lines || []).forEach((line) => {
      for (let i = 0; i < line.length - 1; i++)
        world.walls.push({ id: uid('w'), x1: line[i].x, y1: line[i].y, x2: line[i + 1].x, y2: line[i + 1].y });
    });
    addLines(json.line_of_sight);
    addLines(json.objects_line_of_sight);

    (json.portals || []).forEach((p) => {
      if (!p.bounds || p.bounds.length < 2) return;
      world.doors.push({ id: uid('d'), x1: p.bounds[0].x, y1: p.bounds[0].y, x2: p.bounds[1].x, y2: p.bounds[1].y, closed: p.closed !== false, freestanding: !!p.freestanding });
    });

    (json.lights || []).forEach((l) => {
      if (!l.position) return;
      world.lights.push({ id: uid('l'), x: l.position.x, y: l.position.y, range: l.range ?? 4, intensity: l.intensity ?? 1, color: l.color || 'ffffffff', shadows: l.shadows !== false });
    });

    const geez = json.geez || {};
    world.zones = (geez.zones || []).map((z) => ({ id: z.id || uid('z'), name: z.name || 'Zone', tags: z.tags || [], color: z.color || '#3b82f6', minX: z.minX, minY: z.minY, maxX: z.maxX, maxY: z.maxY }));
    world.routes = (geez.routes || []).map((r) => ({ id: r.id || uid('r'), name: r.name || 'Route', tags: r.tags || [], points: r.points || [] }));

    const image = json.image ? (json.image.startsWith('data:') ? json.image : 'data:image/png;base64,' + json.image) : null;
    return { world, image, entities: geez.entities || null };
  }

  function exportDD2VTT(original, world, entities) {
    const out = { ...(original || {}) };
    out.resolution = {
      ...(out.resolution || {}),
      map_origin: { ...world.origin },
      map_size: { x: world.width, y: world.height },
      pixels_per_grid: world.pixelsPerGrid,
    };
    out.line_of_sight = world.walls.map((w) => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]);
    out.objects_line_of_sight = []; // merged into walls on import
    out.portals = world.doors.map((d) => ({
      position: { x: (d.x1 + d.x2) / 2, y: (d.y1 + d.y2) / 2 },
      bounds: [{ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }],
      rotation: Math.atan2(d.y2 - d.y1, d.x2 - d.x1),
      closed: !!d.closed, freestanding: !!d.freestanding,
    }));
    out.lights = world.lights.map((l) => ({ position: { x: l.x, y: l.y }, range: l.range, intensity: l.intensity, color: l.color, shadows: l.shadows }));
    out.geez = { version: 1, zones: world.zones, routes: world.routes };
    if (entities) out.geez.entities = entities;
    return out;
  }

  G.dd2vtt = { importDD2VTT, exportDD2VTT };
})(window.GeezTown = window.GeezTown || {});
