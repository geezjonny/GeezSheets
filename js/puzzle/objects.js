// objects.js: what things on the map ARE. Kinds, their states, how a state is derived, and what an
// event object does when it fires. Pure data and functions: no Firebase, no DOM.
//
// object: { kind, label, x, y, sx, sy, state, start, hidden, ...kind props }
//   x,y = pixel centre of its cell (cells are 40px), sx,sy = start position.
// tokens: { id: { x, y, hp?, max? } }

export const KINDS = {
  plate:    { label: "Plate",    role: "sensor", states: ["down", "up"],            start: "up" },
  tripwire: { label: "Tripwire", role: "sensor", states: ["tripped", "clear"],      start: "clear" },
  sight:    { label: "Sight",    role: "sensor", states: ["sees", "clear"],         start: "clear" },
  gauge:    { label: "HP gauge", role: "sensor", states: ["alive", "bloodied", "dead"], start: "alive" },
  switch:   { label: "Switch",   role: "input",  states: ["on", "off"],             start: "off" },
  dial:     { label: "Dial",     role: "input",  states: (o) => o.values || ["N", "E", "S", "W"], start: "N" },
  door:     { label: "Door",     role: "output", states: ["open", "closed"],        start: "closed" },
  light:    { label: "Light",    role: "output", states: ["on", "off"],             start: "on" },
  floor:    { label: "Floor",    role: "output", states: ["solid", "open"],         start: "solid" },
  spawn:    { label: "Spawn",    role: "event",  states: ["armed", "fired"],        start: "armed" },
  stone:    { label: "Rolling stone", role: "event", states: ["armed", "fired"],   start: "armed" },
  catapult: { label: "Catapult", role: "event",  states: ["armed", "fired"],        start: "armed" },
  initiative: { label: "Start initiative", role: "event", states: ["armed", "fired"], start: "armed" },
};
export const statesOf = (o) => { const s = KINDS[o?.kind]?.states; return typeof s === "function" ? s(o) : s || []; };
export const startOf = (o) => (o.kind === "dial" ? statesOf(o)[0] : KINDS[o.kind].start);
export const isSensor = (o) => KINDS[o.kind]?.role === "sensor";

// Actions a "then" chip can cycle through for this object.
export function actionsOf(o) {
  const k = KINDS[o.kind]; if (!k || k.role === "sensor") return [];
  if (k.role === "event") return ["fire", "move"];
  const s = statesOf(o);
  return [...s, ...(s.length === 2 ? ["toggle"] : []), "move"];
}
// Options a "when" chip can cycle through.
export const conditionsOf = (o) => [...statesOf(o), "at"];

export const cellsOf = (o) => {
  const n = o.kind === "tripwire" ? o.len || 3 : 1;
  return Array.from({ length: n }, (_, i) => (o.dir === "v" ? [o.x, o.y + 40 * i] : [o.x + 40 * i, o.y]));
};
const tokenOn = (cells, tokens) => Object.values(tokens || {}).some((t) => cells.some(([x, y]) => t.x === x && t.y === y));

// Sight: can this object see a token? `blockers` are wall segments [x1,y1,x2,y2] (closed doors included, windows not).
const isPlayerToken = (t) => !!t.pc || (!t.npc && t.hp == null);
const cross = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
const segsCross = (a, b) => { const d1 = cross(...b, a[0], a[1]), d2 = cross(...b, a[2], a[3]), d3 = cross(...a, b[0], b[1]), d4 = cross(...a, b[2], b[3]); return d1 * d2 < 0 && d3 * d4 < 0; };
export function sees(o, tokens, blockers = []) {
  const want = o.sees || "player", range = (o.range || 6) * 40;
  return Object.values(tokens || {}).some((t) => {
    if (want === "player" ? !isPlayerToken(t) : want === "npc" ? isPlayerToken(t) : false) return false;
    if (Math.hypot(t.x - o.x, t.y - o.y) > range) return false;
    const ray = [o.x, o.y, t.x, t.y];
    return !blockers.some((b) => segsCross(ray, b));
  });
}

export function derive(o, tokens, blockers) {
  if (o.kind === "sight") return sees(o, tokens, blockers) || (o.latch && o.state === "sees") ? "sees" : "clear";
  if (o.kind === "plate" || o.kind === "tripwire") {
    const [on, off] = statesOf(o);
    return tokenOn(cellsOf(o), tokens) || (o.latch && o.state === on) ? on : off;
  }
  if (o.kind === "gauge") {
    const t = tokens?.[o.token]; if (!t || t.hp == null) return o.state;
    return t.hp <= 0 ? "dead" : t.hp <= (t.max || t.hp) / 2 ? "bloodied" : "alive";
  }
  return o.state;
}

// What an event output does when it fires. Returns { changes, text }.
export function onFired(id, o) {
  const text = { spawn: `${o.label} summons enemies!`, stone: `${o.label} rolls!`, catapult: `${o.label} fires!`, initiative: "Initiative begins!" }[o.kind] || `${o.label} fires`;
  const changes = {};
  if (o.kind === "spawn") changes[`tokens/${id}-${Date.now().toString(36)}`] = { x: o.x, y: o.y, hp: o.hp || 5, max: o.hp || 5 };
  if (o.kind === "stone" && o.to) { changes[`objects/${id}/x`] = o.to.x; changes[`objects/${id}/y`] = o.to.y; }
  changes["events/last"] = { text, t: Date.now() };
  return { changes, text };
}

// Traps start hidden when placed. `hidden` is only about who can see it: rules ignore it.
export const HIDDEN_AT_START = ["tripwire", "spawn", "stone", "catapult", "floor", "sight", "initiative"];
const obj = (kind, label, x, y, extra = {}) => ({ kind, label, x, y, sx: x, sy: y, state: KINDS[kind].start, start: KINDS[kind].start, hidden: false, ...extra });
export const newObject = (kind, x, y, n = 1, extra = {}) => obj(kind, `${KINDS[kind].label} ${n}`, x, y, { hidden: HIDDEN_AT_START.includes(kind), ...extra });

export const demo = () => ({
  objects: {
    plate1: obj("plate", "Plate 1", 100, 300), plate2: obj("plate", "Plate 2", 180, 300), plate3: obj("plate", "Plate 3", 260, 300),
    door1: obj("door", "Vault door", 540, 360, { dir: "h" }),
  },
  tokens: { A: { x: 140, y: 220 }, B: { x: 180, y: 220 }, C: { x: 220, y: 220 }, G: { x: 300, y: 180, hp: 10, max: 10 } },
});

// Starting map: the original demo dungeon as floors, walls, props and two doors.
export const demoMap = () => {
  const walls = [[80,80,320,80],[320,80,320,240],[320,240,400,240],[400,240,400,160],[400,160,680,160],[680,160,680,360],[680,360,520,360],[520,360,520,440],[520,440,280,440],[280,440,280,320],[280,320,80,320],[80,320,80,80]];
  const w = {}; walls.forEach(([x1, y1, x2, y2], i) => (w[`w${i}`] = { x1, y1, x2, y2 }));
  return {
    floors: { f1: { x: 80, y: 80, w: 240, h: 160 }, f2: { x: 80, y: 240, w: 200, h: 80 }, f3: { x: 280, y: 240, w: 240, h: 200 }, f4: { x: 400, y: 160, w: 280, h: 200 } },
    walls: w, roofs: {},
    props: { p1: { kind: "table", x: 140, y: 120 }, p2: { kind: "chest", x: 600, y: 240 }, p3: { kind: "crate", x: 360, y: 380 }, p4: { kind: "pillar", x: 160, y: 140 } },
  };
};
