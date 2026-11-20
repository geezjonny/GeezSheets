const EPSILON = 1e-7;
const ANGLE_EPSILON = 1e-7;
const CIRCLE_STEPS = 64;

function finiteSegment(s) {
  return Array.isArray(s) && s.length >= 4 && s.slice(0, 4).every(Number.isFinite) &&
    (s[0] !== s[2] || s[1] !== s[3]);
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function rayHit(ox, oy, dx, dy, s) {
  const [x1, y1, x2, y2] = s;
  const sx = x2 - x1, sy = y2 - y1;
  const cross = dx * sy - dy * sx;
  const qx = x1 - ox, qy = y1 - oy;

  if (Math.abs(cross) < EPSILON) {
    // Collinear rays still need to see the nearest endpoint of a segment.
    if (Math.abs(qx * dy - qy * dx) >= EPSILON) return Infinity;
    const t1 = qx * dx + qy * dy;
    const t2 = (x2 - ox) * dx + (y2 - oy) * dy;
    const t = Math.min(t1, t2);
    return t > EPSILON ? t : (Math.max(t1, t2) > EPSILON ? Math.max(t1, t2) : Infinity);
  }

  const t = (qx * sy - qy * sx) / cross;
  const u = (qx * dy - qy * dx) / cross;
  return t > EPSILON && u >= -EPSILON && u <= 1 + EPSILON ? t : Infinity;
}

function circlePoint(origin, radius, angle) {
  return { x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius };
}

export function visibilityPolygon(origin, radius, segments = []) {
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(radius) || radius <= 0) return [];

  const ox = origin.x, oy = origin.y;
  const nearby = [];
  for (const s of Array.isArray(segments) ? segments : []) {
    if (finiteSegment(s) && distanceToSegment(ox, oy, s[0], s[1], s[2], s[3]) <= radius) nearby.push(s);
  }

  if (!nearby.length) {
    return Array.from({ length: CIRCLE_STEPS }, (_, i) => circlePoint(origin, radius, i * Math.PI * 2 / CIRCLE_STEPS));
  }

  const boundary = [
    [ox - radius, oy - radius, ox + radius, oy - radius],
    [ox + radius, oy - radius, ox + radius, oy + radius],
    [ox + radius, oy + radius, ox - radius, oy + radius],
    [ox - radius, oy + radius, ox - radius, oy - radius],
  ];
  const all = nearby.concat(boundary);
  const angles = [];
  for (const s of all) {
    angles.push(Math.atan2(s[1] - oy, s[0] - ox), Math.atan2(s[3] - oy, s[2] - ox));
  }
  const rays = [];
  for (const angle of angles) rays.push(angle - ANGLE_EPSILON, angle, angle + ANGLE_EPSILON);
  // Fill rays keep the range boundary round between sparse obstacle corners.
  for (let i = 0; i < CIRCLE_STEPS; i++) rays.push(i * Math.PI * 2 / CIRCLE_STEPS);
  rays.sort((a, b) => a - b);

  const polygon = [];
  for (const angle of rays) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let distance = radius;
    for (const s of all) distance = Math.min(distance, rayHit(ox, oy, dx, dy, s));
    polygon.push({ x: ox + dx * Math.min(radius, Math.max(0, distance)), y: oy + dy * Math.min(radius, Math.max(0, distance)) });
  }
  return polygon;
}

export function blockingSegments(walls = {}, doors = [], cut) {
  const result = [];
  for (const wall of Object.values(walls || {})) {
    const pieces = typeof cut === "function" ? cut(wall, doors) : [[wall.x1, wall.y1, wall.x2, wall.y2]];
    for (const piece of pieces || []) if (finiteSegment(piece)) result.push(piece.slice(0, 4));
  }
  for (const door of Array.isArray(doors) ? doors : []) {
    if (!door || door.win || door.state === "open" || !Number.isFinite(door.x) || !Number.isFinite(door.y)) continue;
    result.push(door.dir === "v" ? [door.x, door.y - 20, door.x, door.y + 20] : [door.x - 20, door.y, door.x + 20, door.y]);
  }
  return result;
}

export function polygonPath(poly = []) {
  if (!Array.isArray(poly) || !poly.length) return "";
  const n = value => Number(value).toFixed(1);
  return `M ${n(poly[0].x)} ${n(poly[0].y)}${poly.slice(1).map(p => ` L ${n(p.x)} ${n(p.y)}`).join("")} Z`;
}

export function unionPaths(polys = []) {
  return (Array.isArray(polys) ? polys : []).map(p => polygonPath(p)).filter(Boolean).join(" ");
}
