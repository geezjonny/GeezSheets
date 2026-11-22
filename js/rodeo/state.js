// Shared mutable UI state and tiny helpers used by vtt.js, draw.js and panel.js.
export const $ = (s) => document.querySelector(s);
export const emptyDraft = () => ({ when: [], then: [], pool: [] });
export const S = {
  isGM: new URLSearchParams(location.search).has("gm"),
  objects: {}, tokens: {}, groups: {}, map: { floors: {}, walls: {}, roofs: {}, props: {}, labels: {}, fog: {}, level: 0, levelNames: {} }, level: 0, tool: null,
  exploredCells: new Set(), currentVisible: new Set(), exploredRedraw: null,
  puzzleMode: false, paused: false, sceneName: "Current scene", round: 1, turnName: "—", initiative: null, selected: new Set(), draft: emptyDraft(),
  atmosphere: { time: 12, weather: "clear", color: "#4d86b8" }, placing: null, pick: null, lastSel: null, dragging: null,
};
export const mapSize = () => ({ cols: S.map.size?.cols || 20, rows: S.map.size?.rows || 14 });   // grid size in cells; default 20x14
export const cellOf = (p) => { const { cols, rows } = mapSize(); return { x: Math.max(20, Math.min(cols * 40 - 20, Math.floor(p.x / 40) * 40 + 20)), y: Math.max(20, Math.min(rows * 40 - 20, Math.floor(p.y / 40) * 40 + 20)) }; };
export const cellName = (p) => `${(p.x - 20) / 40},${(p.y - 20) / 40}`;
export const label = (id) => S.objects[id]?.label || S.tokens[id]?.label || id;
