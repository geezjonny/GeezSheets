// geometry.js — walls, doors, lights, dd2vtt import, and 2D shadowcasting.
// This is new functionality, not an extraction like the other modules.
//
// DATA MODEL (deliberately different from the old tiles[].walls booleans):
// dd2vtt stores walls as closed polygons of continuous {x,y} points in grid
// units, not tile-edge flags — a wall can start/end anywhere, not just at
// tile corners. So here, walls/doors are each a flat list of independent
// line segments, every segment its own editable object:
//   wall:  { id, x1, y1, x2, y2 }
//   door:  { id, x1, y1, x2, y2, closed, freestanding }
//   light: { id, x, y, range, intensity, color, shadows }
// All coordinates are in GRID units (1.0 = one tile), matching dd2vtt's own
// convention. Convert to canvas pixels at render time via `* TILE`, the same
// way `tiles` keys already do — so geometry overlays line up with the
// existing tile grid automatically, regardless of TILE's value.

let _nextId = 1;
function genId() { return "g" + (_nextId++) + "_" + Date.now().toString(36); }

// ── dd2vtt import ────────────────────────────────────────────────────────────

/**
 * Parses a dd2vtt/UVTT JSON file into this module's internal shape.
 * @param {object} json - already-parsed JSON (use JSON.parse(text) first)
 * @returns {{mapSize:{x,y}, pixelsPerGrid:number, imageDataUrl:string|null,
 *            ambientLight:string, walls:object[], doors:object[], lights:object[]}}
 */
export function parseDD2VTT(json) {
  const mapSize = json.resolution?.map_size || { x: 0, y: 0 };
  const pixelsPerGrid = json.resolution?.pixels_per_grid || 70;
  const imageDataUrl = json.image ? `data:image/png;base64,${json.image}` : null;
  const ambientLight = json.environment?.ambient_light || "ffffffff";

  const walls = [];
  // line_of_sight + objects_line_of_sight are both arrays of polygons
  // (arrays of {x,y} points); flatten each polygon's consecutive pairs
  // into independent segments.
  const polygons = [...(json.line_of_sight || []), ...(json.objects_line_of_sight || [])];
  for (const poly of polygons) {
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i], b = poly[i + 1];
      walls.push({ id: genId(), x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }

  const doors = (json.portals || []).map(p => {
    const [a, b] = p.bounds || [p.position, p.position];
    return {
      id: genId(),
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      closed: p.closed !== false,        // dd2vtt default is closed
      freestanding: !!p.freestanding,
    };
  });

  const lights = (json.lights || []).map(l => ({
    id: genId(),
    x: l.position.x, y: l.position.y,
    range: l.range ?? 5,
    intensity: l.intensity ?? 1,
    color: l.color || "ffffffff",
    shadows: l.shadows !== false,
  }));

  // Perimeter wall: a closed box around the whole map's bounds. This is a
  // correctness guarantee, not just tidiness -- once multiple dd2vtt floors
  // share one canvas, this guarantees no ray can ever leave one floor's
  // footprint and pick up another floor's geometry, independent of how far
  // apart they're actually placed.
  const { x: mw, y: mh } = mapSize;
  if (mw > 0 && mh > 0) {
    const corners = [{x:0,y:0},{x:mw,y:0},{x:mw,y:mh},{x:0,y:mh}];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      walls.push({ id: genId(), x1: a.x, y1: a.y, x2: b.x, y2: b.y, perimeter: true });
    }
  }

  return { mapSize, pixelsPerGrid, imageDataUrl, ambientLight, walls, doors, lights };
}

/**
 * Inverse of parseDD2VTT — packages this module's wall/door/light arrays
 * back into a dd2vtt-shaped object (minus the image, which the caller
 * already has separately and should merge back in before saving to disk).
 * Each wall segment is exported as its own 2-point line_of_sight entry —
 * dd2vtt doesn't require closed loops, just point sequences, so this is a
 * valid round-trip even though it doesn't reconstruct the original polygon
 * grouping (which doesn't affect rendering or occlusion either way).
 */
export function toDD2VTT({ mapSize, pixelsPerGrid, ambientLight, walls, doors, lights }) {
  return {
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: mapSize, pixels_per_grid: pixelsPerGrid },
    line_of_sight: walls.map(w => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]),
    objects_line_of_sight: [],
    portals: doors.map(d => ({
      position: { x: (d.x1 + d.x2) / 2, y: (d.y1 + d.y2) / 2 },
      bounds: [{ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }],
      rotation: 0,
      closed: d.closed,
      freestanding: d.freestanding,
    })),
    environment: { baked_lighting: true, ambient_light: ambientLight },
    lights: lights.map(l => ({
      position: { x: l.x, y: l.y },
      range: l.range, intensity: l.intensity, color: l.color, shadows: l.shadows,
    })),
  };
}

// ── Color helper ─────────────────────────────────────────────────────────────

/** dd2vtt colors are 8-hex AARRGGBB strings. Returns an rgba() CSS string
 *  with `alphaMul` multiplied into the alpha channel (for intensity/fade). */
export function dd2vttColorToRgba(hex, alphaMul = 1) {
  const h = (hex || "ffffffff").replace("#", "");
  const a = parseInt(h.slice(0, 2), 16) / 255;
  const r = parseInt(h.slice(2, 4), 16);
  const g = parseInt(h.slice(4, 6), 16);
  const b = parseInt(h.slice(6, 8), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a * alphaMul))})`;
}

// ── Geometry primitives ──────────────────────────────────────────────────────

/** Ray-segment intersection. Ray from (ox,oy) in direction (dx,dy) (need not
 *  be normalized). Segment from (x1,y1) to (x2,y2). Returns the distance
 *  `t` along the ray to the intersection, or Infinity if no hit (or hit is
 *  behind the ray origin). Standard parametric line-line solve. */
function rayIntersectSegment(ox, oy, dx, dy, x1, y1, x2, y2) {
  const sx = x2 - x1, sy = y2 - y1;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-12) return Infinity; // parallel
  const t = ((x1 - ox) * sy - (y1 - oy) * sx) / denom;
  const u = ((x1 - ox) * dy - (y1 - oy) * dx) / denom;
  // A light sitting exactly on (or extremely close to) a wall -- e.g. a
  // wall-mounted torch -- can compute t as a tiny negative number here due
  // to floating-point rounding, even though the ray is genuinely starting
  // right at that wall. Treating that as "no intersection" (the old t<0
  // check) let light leak straight through the very wall it's mounted on.
  // A small epsilon tolerance treats "essentially at the origin" as blocked.
  const T_EPS = 1e-6;
  if (t < -T_EPS || u < 0 || u > 1) return Infinity;
  return Math.max(0, t);
}

/** Distance from point (px,py) to segment (x1,y1)-(x2,y2). Used for
 *  click-to-select hit-testing on walls/doors. */
export function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// ── Shadowcasting / visibility polygon ──────────────────────────────────────

/**
 * Computes a visibility polygon from (ox,oy) given a set of occluding
 * segments, clipped to `range`. Standard radial-sweep algorithm (cast a ray
 * at every unique angle to a segment endpoint, ±a tiny epsilon to handle
 * the corner case where a ray grazes exactly past an endpoint, then sort
 * hits by angle). Good enough for VTT-scale geometry (dozens of segments).
 *
 * @param {number} ox,oy     - origin (light or token position, grid units)
 * @param {Array<{x1,y1,x2,y2}>} segments - occluding walls/closed-doors
 * @param {number} range     - max distance (grid units); polygon is clipped to this radius
 * @returns {Array<{x,y}>} polygon points, in angle order, ready to fill/clip
 */
export function computeVisibilityPolygon(ox, oy, segments, range) {
  // Cull segments that can't possibly matter: if a wall's closest point to
  // the origin is already beyond `range`, no ray at any angle can reach it
  // before the range circle does. This keeps cost tied to nearby geometry
  // (the active floor) rather than every wall on the whole canvas, which
  // matters once multiple dd2vtt floors share one canvas.
  if (segments.length) {
    segments = segments.filter(s => distToSegment(ox, oy, s.x1, s.y1, s.x2, s.y2) <= range);
  }
  if (!segments.length) {
    // No occluders: just return a circle approximation.
    const pts = [];
    const STEPS = 48;
    for (let i = 0; i < STEPS; i++) {
      const a = (i / STEPS) * Math.PI * 2;
      pts.push({ x: ox + Math.cos(a) * range, y: oy + Math.sin(a) * range });
    }
    return pts;
  }

  const EPS = 0.0001;
  const angles = new Set();
  for (const s of segments) {
    angles.add(Math.atan2(s.y1 - oy, s.x1 - ox));
    angles.add(Math.atan2(s.y2 - oy, s.x2 - ox));
  }
  const angleList = [];
  for (const a of angles) { angleList.push(a - EPS, a, a + EPS); }
  // Precise wall-corner rays alone aren't enough: between two unconnected
  // obstacles (e.g. separate rooms), the only sampled angles are each
  // room's corners, so the polygon connects them with a straight chord
  // that cuts across open space instead of following the light's actual
  // range boundary there. Evenly-spaced "fill" rays close that gap — any
  // angle with no nearby occluder correctly lands on the range circle.
  const FILL_STEPS = 96;
  for (let i = 0; i < FILL_STEPS; i++) angleList.push((i / FILL_STEPS) * Math.PI * 2 - Math.PI);
  angleList.sort((a, b) => a - b);

  const points = [];
  for (const angle of angleList) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let nearest = range;
    for (const s of segments) {
      const t = rayIntersectSegment(ox, oy, dx, dy, s.x1, s.y1, s.x2, s.y2);
      if (t < nearest) nearest = t;
    }
    points.push({ x: ox + dx * nearest, y: oy + dy * nearest, angle });
  }
  return points;
}

/** Renders a visibility polygon (from computeVisibilityPolygon) as a filled
 *  canvas path. Caller must pass a fillStyle. Coordinates are grid units;
 *  TILE converts to canvas pixels. For clip-only setup (no actual paint),
 *  use clipToVisibilityPolygon() instead -- this always fills. */
export function fillVisibilityPolygon(ctx, polygon, originGridX, originGridY, TILE, fill) {
  if (!polygon.length) return;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(polygon[0].x * TILE, polygon[0].y * TILE);
  for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x * TILE, polygon[i].y * TILE);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Traces a visibility polygon as the current path and clips to it -- no
 *  paint, unlike fillVisibilityPolygon. This is what drawLight() and the
 *  darkness punch-through actually want: restrict where their own gradient
 *  fill lands, without an extra opaque fill of whatever color happened to
 *  be set on the context beforehand. Caller must wrap in ctx.save()/restore()
 *  since clip state persists until restored. */
export function clipToVisibilityPolygon(ctx, polygon, TILE) {
  if (!polygon.length) return;
  ctx.beginPath();
  ctx.moveTo(polygon[0].x * TILE, polygon[0].y * TILE);
  for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x * TILE, polygon[i].y * TILE);
  ctx.closePath();
  ctx.clip();
}

/** Occluders for a given moment: every wall, plus every door that's
 *  currently closed. Open doors simply don't block light/sight. */
export function activeOccluders(walls, doors) {
  return [...walls, ...doors.filter(d => d.closed)];
}

function cross(ax, ay, bx, by) { return ax * by - ay * bx; }

function segmentsIntersect(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
  const d1 = cross(bx2 - bx1, by2 - by1, ax1 - bx1, ay1 - by1);
  const d2 = cross(bx2 - bx1, by2 - by1, ax2 - bx1, ay2 - by1);
  const d3 = cross(ax2 - ax1, ay2 - ay1, bx1 - ax1, by1 - ay1);
  const d4 = cross(ax2 - ax1, ay2 - ay1, bx2 - ax1, by2 - ay1);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True if a straight move from (x1,y1) to (x2,y2) [grid units] would cross
 *  any occluder (wall or closed door). Used to block movement through walls
 *  for keyboard-driven token movement. */
export function pathBlocked(x1, y1, x2, y2, occluders) {
  for (const seg of occluders) {
    if (segmentsIntersect(x1, y1, x2, y2, seg.x1, seg.y1, seg.x2, seg.y2)) return true;
  }
  return false;
}

/** 4-directional BFS of every tile reachable from (startX,startY) within
 *  maxSteps, blocked by the same wall/door occluders and impassable cells
 *  that movement itself already respects. Returns a Map of "x,y" -> steps
 *  required to reach it (the start tile itself is included at 0 steps). */
export function computeReachableTiles(startX, startY, maxSteps, occluders, blockedCells) {
  const visited = new Map();
  const startKey = `${startX},${startY}`;
  visited.set(startKey, 0);
  if (maxSteps <= 0) return visited;
  const queue = [[startX, startY, 0]];
  while (queue.length) {
    const [x, y, steps] = queue.shift();
    if (steps >= maxSteps) continue;
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const nx = x + dx, ny = y + dy;
      const nkey = `${nx},${ny}`;
      if (visited.has(nkey)) continue;
      if (blockedCells && blockedCells.has(nkey)) continue;
      if (pathBlocked(x + 0.5, y + 0.5, nx + 0.5, ny + 0.5, occluders)) continue;
      visited.set(nkey, steps + 1);
      queue.push([nx, ny, steps + 1]);
    }
  }
  return visited;
}

/** Every cell within `rangeTiles` of (startX,startY) that also has a clear
 *  line of sight from the attacker -- for weapon/spell range, as opposed to
 *  computeReachableTiles which is a wall-aware BFS for movement cost. Range
 *  is a straight-line radius check (Chebyshev distance, matching how most
 *  VTT grids measure range), gated by line of sight rather than pathing --
 *  you can't hit what you can't see, but you don't need a walkable path to
 *  it either. Returns a Set of "x,y" keys, NOT a Map with step-counts, since
 *  range has no notion of "how many steps away" the way movement does. */
export function computeRangeTiles(startX, startY, rangeTiles, occluders) {
  const inRange = new Set();
  if (rangeTiles <= 0) return inRange;
  for (let dx = -rangeTiles; dx <= rangeTiles; dx++) {
    for (let dy = -rangeTiles; dy <= rangeTiles; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > rangeTiles) continue; // outside the radius
      if (dx === 0 && dy === 0) continue; // the attacker's own cell isn't a valid target
      const tx = startX + dx, ty = startY + dy;
      if (pathBlocked(startX + 0.5, startY + 0.5, tx + 0.5, ty + 0.5, occluders)) continue;
      inRange.add(`${tx},${ty}`);
    }
  }
  return inRange;
}


/**
 * Converts hand-painted tile walls (wallGroups) into the same {x1,y1,x2,y2}
 * segment shape as dd2vtt-imported/hand-drawn walls, so a tile-painted map
 * gets real light/vision occlusion too -- not just the red outline it
 * already renders as. Mirrors the exact perimeter-edge logic already used
 * to draw those outlines: an edge blocks light only where the neighboring
 * cell isn't part of the same wall group (i.e. it's a true perimeter, not
 * an interior seam between two painted wall cells).
 *
 * Tile-based doors (keyed by {x,y,edge}, separate from geometry.doors) are
 * respected here too: an open door's edge is skipped entirely, a closed
 * one still blocks like a plain wall -- same behavior as vector doors.
 *
 * Returned segments are ephemeral (recomputed from current state, not
 * stored) -- they never enter `geometry.walls`, so they stay purely
 * tile-driven and can't be selected/deleted via the vector wall editor.
 *
 * @param {object} wallGroups - {groupId: {cells: {"x,y": true, ...}}}
 * @param {object} doors      - tile-based doors, {doorId: {x,y,edge,open,locked}}
 * @returns {Array<{x1,y1,x2,y2}>} segments in GRID units, ready for activeOccluders
 */
export function wallGroupsToSegments(wallGroups, doors = {}) {
  const doorLookup = {};
  for (const did in doors) {
    const d = doors[did];
    doorLookup[`${d.x},${d.y},${d.edge}`] = d;
  }
  const segs = [];
  for (const gid in wallGroups) {
    if (gid === "__current") continue; // in-progress draw, not yet committed
    const cells = wallGroups[gid].cells || {};
    for (const ck in cells) {
      const [x, y] = ck.split(",").map(Number);
      const edges = [
        ["n", 0,-1, x,y,   x+1,y  ],
        ["s", 0, 1, x,y+1, x+1,y+1],
        ["w",-1, 0, x,y,   x,y+1  ],
        ["e", 1, 0, x+1,y, x+1,y+1],
      ];
      for (const [edge, dx, dy, x1, y1, x2, y2] of edges) {
        if (cells[`${x+dx},${y+dy}`]) continue; // interior seam, not a perimeter
        const door = doorLookup[`${x},${y},${edge}`];
        if (door && door.open) continue; // open door: no occlusion here
        segs.push({ x1, y1, x2, y2 });
      }
    }
  }
  return segs;
}

/**
 * Draws one light source with shadows: computes its visibility polygon
 * (clipped to range) against current occluders, then fills it with a
 * radial-gradient glow in the light's color, fading to transparent at range.
 * If `light.shadows` is explicitly false, skips occlusion entirely (a plain
 * glow) -- any other value, including missing/undefined, casts shadows.
 */
export function drawLight(ctx, light, occluders, TILE) {
  const segments = light.shadows !== false ? occluders : [];
  const polygon = computeVisibilityPolygon(light.x, light.y, segments, light.range);
  ctx.save();
  clipToVisibilityPolygon(ctx, polygon, TILE);
  const cx = light.x * TILE, cy = light.y * TILE, r = light.range * TILE;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, dd2vttColorToRgba(light.color, light.intensity));
  grad.addColorStop(1, dd2vttColorToRgba(light.color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

/** Convenience: draws every light in `lights`, each independently occluded
 *  by current walls/closed-doors. Call inside an additive/lighter composite
 *  blend if you want overlapping lights to brighten rather than overwrite. */
export function drawAllLights(ctx, lights, walls, doors, TILE) {
  const occluders = activeOccluders(walls, doors);
  for (const light of lights) drawLight(ctx, light, occluders, TILE);
}

// ── Time of day / ambient darkness ──────────────────────────────────────────
// Separate from per-light glow (drawLight/drawAllLights, untouched below) --
// this is a global darkness layer that sits over the whole scene, with each
// light punching a soft hole in it proportional to its own range/intensity,
// so lights visibly matter more at night than at noon.

export const TIME_OF_DAY_PRESETS = {
  day:   { label: "☀️ Day",   darkness: 0,    tint: "20,20,35" },
  night: { label: "🌙 Night", darkness: 0.85, tint: "10,12,40" },
};

/** Fills `worldRect` (the camera's visible area, in world/grid-px units --
 *  computed by the caller from camX/camY/zoom/canvas, since this module
 *  doesn't know about camera state) with the preset's tinted darkness. */
export function drawAmbientDarkness(ctx, worldRect, preset) {
  if (!preset || preset.darkness <= 0) return;
  ctx.save();
  ctx.fillStyle = `rgba(${preset.tint},${preset.darkness})`;
  ctx.fillRect(worldRect.x, worldRect.y, worldRect.w, worldRect.h);
  ctx.restore();
}

/** Draws every light against a dark scene: each light first punches a soft
 *  radial hole through the darkness (clipped to its own shadow-cast
 *  visibility polygon, same occlusion as drawLight), then its normal
 *  colored glow (drawLight) renders on top. At darknessAmount=0 (day) the
 *  hole-punch is a no-op and lights just show their plain glow, same as
 *  drawAllLights. */
export function drawAmbientLights(ctx, lights, walls, doors, TILE, darknessAmount) {
  const occluders = activeOccluders(walls, doors);
  for (const light of lights) {
    const segments = light.shadows !== false ? occluders : [];
    const polygon = computeVisibilityPolygon(light.x, light.y, segments, light.range);
    if (darknessAmount > 0) {
      ctx.save();
      clipToVisibilityPolygon(ctx, polygon, TILE);
      ctx.globalCompositeOperation = "destination-out";
      const cx = light.x * TILE, cy = light.y * TILE, r = light.range * TILE;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const punch = Math.min(1, light.intensity * darknessAmount);
      grad.addColorStop(0, `rgba(0,0,0,${punch})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    }
    drawLight(ctx, light, occluders, TILE);
  }
}

// ── Editor rendering (walls/doors as editable line art, not lighting) ──────

export function drawWallsGeometry(ctx, walls, TILE, { zoom, selectedId } = {}) {
  ctx.save();
  for (const w of walls) {
    ctx.strokeStyle = w.id === selectedId ? "#ffcc44" : "#c0392b";
    ctx.lineWidth = (w.id === selectedId ? 4 : 2.5) / (zoom || 1);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(w.x1 * TILE, w.y1 * TILE);
    ctx.lineTo(w.x2 * TILE, w.y2 * TILE);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawDoorsGeometry(ctx, doors, TILE, { zoom, selectedId } = {}) {
  ctx.save();
  for (const d of doors) {
    ctx.strokeStyle = d.id === selectedId ? "#ffcc44" : (d.closed ? "#3a8a3a" : "#8aaa3a");
    ctx.lineWidth = (d.id === selectedId ? 4 : 3) / (zoom || 1);
    ctx.setLineDash(d.closed ? [] : [6 / (zoom || 1), 4 / (zoom || 1)]);
    ctx.beginPath();
    ctx.moveTo(d.x1 * TILE, d.y1 * TILE);
    ctx.lineTo(d.x2 * TILE, d.y2 * TILE);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Renders doors using real art (door.png / doorclosed.png from the Props
 * texture set) instead of a plain colored line, oriented to match each
 * door's own segment angle and stretched to its length. Falls back to
 * drawDoorsGeometry's line rendering per-door if the art isn't loaded,
 * so this is safe to call even before/without those textures existing.
 *
 * @param {object} propTextures - the shared propTextures cache from assets.js
 */
export function drawDoorsWithArt(ctx, doors, TILE, propTextures, { zoom, selectedId, showLockIcons=false } = {}) {
  ctx.save();
  for (const d of doors) {
    const img = propTextures[d.closed ? "doorclosed" : "door"];
    if (!img) { drawDoorsGeometry(ctx, [d], TILE, { zoom, selectedId }); continue; }
    const cx = (d.x1 + d.x2) / 2 * TILE, cy = (d.y1 + d.y2) / 2 * TILE;
    const angle = Math.atan2(d.y2 - d.y1, d.x2 - d.x1);
    const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) * TILE;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(img, -len / 2, -TILE * 0.35, len, TILE * 0.7);
    if (d.id === selectedId) {
      ctx.strokeStyle = "#ffcc44"; ctx.lineWidth = 2 / (zoom || 1);
      ctx.strokeRect(-len / 2, -TILE * 0.35, len, TILE * 0.7);
    }
    ctx.restore();
    if (showLockIcons && d.locked) {
      ctx.save();
      ctx.font = `${Math.round(TILE * 0.3)}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 3;
      ctx.strokeText("🔒", cx, cy - TILE * 0.4); ctx.fillText("🔒", cx, cy - TILE * 0.4);
      ctx.restore();
    }
  }
  ctx.restore();
}

export function drawLightsGeometry(ctx, lights, TILE, { zoom, selectedId } = {}) {
  ctx.save();
  for (const l of lights) {
    const cx = l.x * TILE, cy = l.y * TILE;
    const noShadows = l.shadows === false;
    ctx.beginPath();
    ctx.arc(cx, cy, l.range * TILE, 0, Math.PI * 2);
    ctx.strokeStyle = noShadows ? "rgba(255,80,80,0.35)" : "rgba(255,220,120,0.25)";
    ctx.lineWidth = 1 / (zoom || 1);
    ctx.setLineDash([4 / (zoom || 1), 4 / (zoom || 1)]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(cx, cy, 5 / (zoom || 1), 0, Math.PI * 2);
    ctx.fillStyle = l.id === selectedId ? "#ffcc44" : "#ffe09a";
    ctx.fill();
    ctx.strokeStyle = noShadows ? "#ff5050" : "#7a5c20";
    ctx.lineWidth = noShadows ? 2.5 / (zoom || 1) : 1.5 / (zoom || 1);
    ctx.stroke();
    if (noShadows) {
      ctx.font = `${Math.round(12/(zoom||1))}px serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 3/(zoom||1);
      ctx.strokeText("⚠", cx, cy - 10/(zoom||1));
      ctx.fillStyle = "#ff5050";
      ctx.fillText("⚠", cx, cy - 10/(zoom||1));
    }
  }
  ctx.restore();
}

// ── Editing helpers (add/move/delete/hit-test) ──────────────────────────────
// All positions in/out are grid units — convert at the call site using
// worldToTile-style division by TILE before calling these.

export function addWall(walls, x1, y1, x2, y2) {
  const w = { id: genId(), x1, y1, x2, y2 };
  walls.push(w);
  return w;
}

export function addDoor(doors, x1, y1, x2, y2, { closed = true, freestanding = false } = {}) {
  const d = { id: genId(), x1, y1, x2, y2, closed, freestanding };
  doors.push(d);
  return d;
}

export function addLight(lights, x, y, { range = 5, intensity = 1, color = "ffffccaa", shadows = true } = {}) {
  const l = { id: genId(), x, y, range, intensity, color, shadows };
  lights.push(l);
  return l;
}

export function deleteById(list, id) {
  const idx = list.findIndex(item => item.id === id);
  if (idx !== -1) list.splice(idx, 1);
}

export function toggleDoor(doors, id) {
  const d = doors.find(door => door.id === id);
  if (d) d.closed = !d.closed;
}

export function lockDoor(doors, id) {
  const d = doors.find(door => door.id === id);
  if (d) { d.locked = true; d.closed = true; }
}

export function unlockDoor(doors, id) {
  const d = doors.find(door => door.id === id);
  if (d) d.locked = false;
}

/** Finds the nearest wall or door within `tolerance` grid units of (gx,gy).
 *  Returns {id, kind:'wall'|'door'} or null. Used for click-to-select. */
export function segmentAtPoint(walls, doors, gx, gy, tolerance = 0.25) {
  let best = null, bestDist = tolerance;
  for (const w of walls) {
    const d = distToSegment(gx, gy, w.x1, w.y1, w.x2, w.y2);
    if (d < bestDist) { bestDist = d; best = { id: w.id, kind: "wall" }; }
  }
  for (const d2 of doors) {
    const d = distToSegment(gx, gy, d2.x1, d2.y1, d2.x2, d2.y2);
    if (d < bestDist) { bestDist = d; best = { id: d2.id, kind: "door" }; }
  }
  return best;
}

/** Finds a light within `tolerance` grid units of (gx,gy), for click-to-select. */
export function lightAtPoint(lights, gx, gy, tolerance = 0.3) {
  for (const l of lights) {
    if (Math.hypot(l.x - gx, l.y - gy) <= tolerance) return l.id;
  }
  return null;
}

/** Finds which endpoint (if any) of a wall/door is within `tolerance` of
 *  (gx,gy), for drag-to-move-endpoint editing. Returns {id, kind, end:1|2}
 *  or null. */
export function endpointAtPoint(walls, doors, gx, gy, tolerance = 0.2) {
  for (const list of [walls, doors]) {
    for (const item of list) {
      if (Math.hypot(item.x1 - gx, item.y1 - gy) <= tolerance) return { id: item.id, end: 1 };
      if (Math.hypot(item.x2 - gx, item.y2 - gy) <= tolerance) return { id: item.id, end: 2 };
    }
  }
  return null;
}

export function moveEndpoint(walls, doors, id, end, gx, gy) {
  const item = walls.find(w => w.id === id) || doors.find(d => d.id === id);
  if (!item) return;
  if (end === 1) { item.x1 = gx; item.y1 = gy; }
  else { item.x2 = gx; item.y2 = gy; }
}

// ── Per-player darkvision ────────────────────────────────────────────────────
// Darkvision in 5e: within the darkvision range, darkness is treated as dim
// light — the player can see in it, but only in grayscale. Beyond the range,
// true darkness applies. This is per-player: Ashara (Half-Elf, darkvision 60ft)
// sees her token's surroundings in grayscale through the dark, while Esmeralda
// (Human, no darkvision) sees nothing in the same area.
//
// Implementation: after the shared ambient darkness layer renders, we punch a
// visibility hole for the player's own token using `destination-out` (same as
// drawAmbientLights does for light sources). But inside that hole, instead of
// showing the full-color scene, we composite a grayscale version of the
// canvas content — achieved by rendering into an offscreen canvas with
// globalCompositeOperation="luminosity" and drawing it back. The result:
//   - Lit areas: full color (light overrides darkvision)
//   - Darkvision range, dark: grayscale
//   - Beyond darkvision range, dark: black (the ambient darkness stays)

/**
 * Renders per-player darkvision: a grayscale visibility cone from the
 * player's token position, punched through the ambient darkness layer.
 *
 * Must be called AFTER drawAmbientDarkness() and AFTER drawAmbientLights(),
 * so it correctly extends the player's vision beyond what lights cover,
 * while still applying to areas the lights don't reach.
 *
 * @param {CanvasRenderingContext2D} ctx  - main canvas context
 * @param {HTMLCanvasElement} canvas      - main canvas element
 * @param {{x,y}} tokenPos               - player token position in grid units
 * @param {number} rangeGridUnits        - darkvision range (e.g. 60 / 5 = 12 tiles at 5ft/tile)
 * @param {object[]} occluders           - from activeOccluders(walls, doors)
 * @param {number} TILE                  - pixels per tile
 */
export function drawDarkvision(ctx, canvas, tokenPos, rangeGridUnits, occluders, TILE) {
  if (!rangeGridUnits || rangeGridUnits <= 0) return;

  // Compute the visibility polygon from the token's center.
  const ox = tokenPos.x + 0.5, oy = tokenPos.y + 0.5;
  const polygon = computeVisibilityPolygon(ox, oy, occluders, rangeGridUnits);
  if (!polygon.length) return;

  // Punch a hole through the ambient darkness layer inside the visibility
  // polygon, so the underlying scene shows through. destination-out erases
  // pixels from the darkness layer wherever the polygon covers.
  // The scene underneath (tiles, background, tokens) is already drawn;
  // the darkness sits on top. Punching through it reveals those pixels.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.beginPath();
  ctx.moveTo(polygon[0].x * TILE, polygon[0].y * TILE);
  for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x * TILE, polygon[i].y * TILE);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Apply a subtle gray tint inside the darkvision area to suggest
  // "dim, colorless vision" -- much simpler than a true grayscale pass,
  // but still distinguishable from fully-lit areas.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(polygon[0].x * TILE, polygon[0].y * TILE);
  for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x * TILE, polygon[i].y * TILE);
  ctx.closePath();
  ctx.clip();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(50,55,80,0.45)';
  ctx.fillRect(
    (polygon.reduce((m,p)=>Math.min(m,p.x),Infinity)-1)*TILE,
    (polygon.reduce((m,p)=>Math.min(m,p.y),Infinity)-1)*TILE,
    (polygon.reduce((m,p)=>Math.max(m,p.x),-Infinity)+2)*TILE*2,
    (polygon.reduce((m,p)=>Math.max(m,p.y),-Infinity)+2)*TILE*2,
  );
  ctx.restore();
}

// ── Movement collision ───────────────────────────────────────────────────────

/**
 * Returns true if any wall/door segment blocks the straight-line path
 * from grid point (x1,y1) to (x2,y2). Uses tile centers for the check
 * (add 0.5 to integer tile coords before calling). Closed doors block;
 * open doors don't.
 * @param {number} x1,y1  - start in grid units (e.g. tok.x+0.5, tok.y+0.5)
 * @param {number} x2,y2  - end in grid units
 * @param {object[]} walls - geometry.walls
 * @param {object[]} doors - geometry.doors
 */
export function isPathBlocked(x1, y1, x2, y2, walls, doors) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return false;
  const nx = dx / len, ny = dy / len;
  const occluders = [...walls, ...doors.filter(d => d.closed)];
  for (const seg of occluders) {
    const t = rayIntersectSegment(x1, y1, nx, ny, seg.x1, seg.y1, seg.x2, seg.y2);
    if (t > 0 && t < len + 0.01) return true; // +0.01 tolerance for endpoint touching
  }
  return false;
}
