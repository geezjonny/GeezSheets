// Camera — pan, zoom, coordinate transforms
// All state is local per client, never goes to RTDB

export const camera = {
  x: 0,
  y: 0,
  zoom: 1,
};

export function toWorld(sx, sy) {
  return [(sx - camera.x) / camera.zoom, (sy - camera.y) / camera.zoom];
}

export function toScreen(wx, wy) {
  return [wx * camera.zoom + camera.x, wy * camera.zoom + camera.y];
}

export function worldToTile(wx, wy, TILE) {
  return [Math.floor(wx / TILE), Math.floor(wy / TILE)];
}

export function applyZoom(factor, pivotSx, pivotSy) {
  camera.x = pivotSx - (pivotSx - camera.x) * factor;
  camera.y = pivotSy - (pivotSy - camera.y) * factor;
  camera.zoom = Math.min(Math.max(camera.zoom * factor, 0.1), 4);
}

export function fitCamera(tiles, TILE, canvasW, canvasH) {
  const coords = Object.keys(tiles).map(k => k.split(",").map(Number));
  if (!coords.length) return;
  const xs = coords.map(([x]) => x), ys = coords.map(([, y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const mapW = (maxX - minX + 1) * TILE, mapH = (maxY - minY + 1) * TILE;
  camera.zoom = Math.min((canvasW - 80) / mapW, (canvasH - 80) / mapH, 2);
  camera.x = canvasW / 2 - (minX * TILE + mapW / 2) * camera.zoom;
  camera.y = canvasH / 2 - (minY * TILE + mapH / 2) * camera.zoom;
}
