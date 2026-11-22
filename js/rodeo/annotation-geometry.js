// Pure annotation geometry and serialization. No DOM, Firebase, or UI dependencies.
const TYPES = new Set(["freehand", "line", "arrow", "rectangle", "circle", "text"]);
const COLORS = new Set(["#a94c3d", "#466c83", "#66774b", "#7a5a8a", "#b4772a", "#2f6f5e"]);

export const annotationTypes = TYPES;
export const annotationColors = COLORS;

export function point(p) {
  return { x: Number.isFinite(Number(p?.x)) ? Number(p.x) : 0, y: Number.isFinite(Number(p?.y)) ? Number(p.y) : 0 };
}

export function pointsOf(value) {
  if (!Array.isArray(value)) return [];
  return value.map(point);
}

export function normalizeAnnotation(value, now = Date.now()) {
  const a = value || {};
  const type = TYPES.has(a.type) ? a.type : "freehand";
  return {
    type,
    pts: pointsOf(a.pts),
    color: COLORS.has(a.color) ? a.color : "#a94c3d",
    by: String(a.by || "Unknown"),
    t: Number.isFinite(Number(a.t)) ? Number(a.t) : now,
    ...(a.text ? { text: String(a.text) } : {}),
    ...(a.pinned ? { pinned: true } : {}),
  };
}

export function serializeAnnotation(value, now = Date.now()) {
  const a = normalizeAnnotation(value, now);
  return JSON.parse(JSON.stringify(a));
}

export function boundsOf(value) {
  const pts = pointsOf(value?.pts);
  if (!pts.length) return null;
  return pts.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }), { minX: pts[0].x, minY: pts[0].y, maxX: pts[0].x, maxY: pts[0].y });
}

export function isExpired(value, now = Date.now(), lifetime = 60000) {
  return !value?.pinned && Number.isFinite(Number(value?.t)) && now - Number(value.t) >= lifetime;
}

export function visibleAnnotations(values, now = Date.now(), lifetime = 60000) {
  return Object.fromEntries(Object.entries(values || {}).filter(([, a]) => !isExpired(a, now, lifetime)));
}

export function canChangeAnnotation(value, by, gm = false) {
  return !!value && (gm || String(value.by || "") === String(by || ""));
}
