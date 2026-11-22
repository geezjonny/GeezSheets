// Pure player-visibility rules. Rendering code supplies the current light cells.
const pointOf = (record) => ({
  x: Number(record?.x) + (Number(record?.w) || 0) / 2,
  y: Number(record?.y) + (Number(record?.h) || 0) / 2,
});

const inFog = (p, fog) => p.x >= fog.x && p.x <= fog.x + fog.w && p.y >= fog.y && p.y <= fog.y + fog.h;

export function visibleToPlayer(record, fogShapes = [], isGM = false, lightCells = new Set(), exploredEnabled = true) {
  if (isGM || !record) return true;
  if (record.hidden) return false;
  const p = pointOf(record);
  const cell = `${Math.floor(p.x / 40)},${Math.floor(p.y / 40)}`;
  return !fogShapes.some((fog) => !fog?.open && inFog(p, fog)) || lightCells.has(cell);
}

export const centerOf = pointOf;
