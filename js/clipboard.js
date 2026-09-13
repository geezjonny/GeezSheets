// Map Clipboard -- captures a rectangular grid selection's contents into a
// portable, origin-relative object, and applies it back at a new anchor
// point. Extracted from mapeditor-layers.html's captureClipboard/
// commitPaste. Pure data manipulation only -- no Firebase calls, no canvas
// drawing, no THREE dependency. Persisting the result (or rendering it) is
// entirely the caller's job, so this drops into a renderer of any kind
// (2D canvas today, whatever comes next) unchanged.

/**
 * Reads everything within [minX..maxX, minY..maxY] (inclusive) into a
 * clipboard object with coordinates made relative to (minX, minY), so it
 * can be pasted at any anchor point later. Walls/doors are only included
 * if BOTH endpoints fall inside the box, to avoid an ambiguous partial
 * copy of a segment that only partly overlaps the selection.
 * @param {number} minX
 * @param {number} minY
 * @param {number} maxX
 * @param {number} maxY
 * @param {Object} opts
 * @param {(x:number,y:number)=>string} opts.key - floor-scoped tile-key function, e.g. mapeditor-layers.html's own `key(x,y)` (typically `${floor},${x},${y}`).
 * @param {Object<string,any>} opts.tiles
 * @param {Object<string,any>} [opts.stamps]
 * @param {Object<string,any>} [opts.props]
 * @param {Object<string,any>} [opts.triggerNodes]
 * @param {Object<string,any>} [opts.impassable]
 * @param {Object<string,{x,y}>} opts.tokens - keyed by token id.
 * @param {{walls?, doors?, lights?}} opts.geometry
 * @returns {Object} the clipboard -- {w, h, tiles, stamps, props, tokens, triggerNodes, impassable, walls, doors, lights}, all coordinates origin-relative.
 */
export function captureClipboard(minX, minY, maxX, maxY, { key, tiles, stamps = {}, props = {}, triggerNodes = {}, impassable = {}, tokens = {}, geometry }) {
  const clip = { w: maxX - minX + 1, h: maxY - minY + 1, tiles: {}, stamps: {}, props: {}, tokens: [], triggerNodes: {}, impassable: {}, walls: [], doors: [], lights: [] };
  for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
    const k = key(x, y);
    if (tiles[k]) clip.tiles[`${x - minX},${y - minY}`] = { ...tiles[k] };
    if (stamps[k]) clip.stamps[`${x - minX},${y - minY}`] = stamps[k];
    if (props[k]) clip.props[`${x - minX},${y - minY}`] = { ...props[k] };
    if (triggerNodes[k]) clip.triggerNodes[`${x - minX},${y - minY}`] = { ...triggerNodes[k] };
    if (impassable[k]) clip.impassable[`${x - minX},${y - minY}`] = true;
  }
  for (const tok of Object.values(tokens)) {
    if (tok.x >= minX && tok.x <= maxX && tok.y >= minY && tok.y <= maxY) {
      clip.tokens.push({ ...tok, _dx: tok.x - minX, _dy: tok.y - minY });
    }
  }
  const inBox = (x, y) => x >= minX && x <= maxX + 1 && y >= minY && y <= maxY + 1;
  for (const w of geometry.walls || []) {
    if (inBox(w.x1, w.y1) && inBox(w.x2, w.y2)) {
      clip.walls.push({ x1: w.x1 - minX, y1: w.y1 - minY, x2: w.x2 - minX, y2: w.y2 - minY });
    }
  }
  for (const d of geometry.doors || []) {
    if (inBox(d.x1, d.y1) && inBox(d.x2, d.y2)) {
      clip.doors.push({ x1: d.x1 - minX, y1: d.y1 - minY, x2: d.x2 - minX, y2: d.y2 - minY, closed: d.closed, locked: d.locked, isWindow: d.isWindow });
    }
  }
  for (const l of geometry.lights || []) {
    if (l.x >= minX && l.x <= maxX + 1 && l.y >= minY && l.y <= maxY + 1) {
      clip.lights.push({ ...l, x: l.x - minX, y: l.y - minY });
    }
  }
  return clip;
}

/**
 * Mutates tiles/props/triggerNodes/impassable/geometry/tokens in place to
 * apply a captured clipboard at (anchorX, anchorY) -- no Firebase writes,
 * no undo/history push, no toast; the caller does all of that, since
 * persistence and notification are app-specific, not data-shape-specific.
 * Trigger nodes get fresh ids, with internal links (to another node also
 * in this same paste) remapped to the new ids and links to anything
 * outside the copy dropped, since the original target wasn't duplicated;
 * door-links are left as-is, since doors aren't copied/duplicated.
 * @param {Object} clip - from captureClipboard.
 * @param {number} anchorX
 * @param {number} anchorY
 * @param {Object} opts
 * @param {(x:number,y:number)=>string} opts.key
 * @param {Object<string,any>} opts.tiles
 * @param {Object<string,any>} [opts.stamps]
 * @param {Object<string,any>} [opts.props]
 * @param {Object<string,any>} [opts.triggerNodes]
 * @param {Object<string,any>} [opts.impassable]
 * @param {Object<string,any>} opts.tokens - keyed by token id; new tokens are added here.
 * @param {{walls, doors, lights}} opts.geometry
 * @param {number} opts.floor - assigned to every newly-added wall/door/light/token.
 * @param {() => string} opts.genNodeId
 * @param {(doors, x1,y1,x2,y2, opts) => {id}} opts.addDoor - e.g. render3d/geometry.js's or the existing js/geometry.js's addDoor.
 * @param {(walls, x1,y1,x2,y2) => {id}} opts.addWall
 * @param {(lights, x,y, opts) => {id}} opts.addLight
 * @param {() => string} [opts.genTokenId] - defaults to a timestamp+random id, matching mapeditor-layers.html's own convention.
 * @returns {{touchedTiles: boolean, touchedProps: boolean, touchedTriggerNodes: boolean, touchedImpassable: boolean, touchedGeometry: boolean, newTokenIds: string[]}} what changed, so the caller knows which of its own save/sync functions to call.
 */
export function applyClipboardToData(clip, anchorX, anchorY, { key, tiles, stamps, props, triggerNodes, impassable, tokens, geometry, floor, genNodeId, addWall, addDoor, addLight, genTokenId }) {
  const result = { touchedTiles: false, touchedProps: false, touchedTriggerNodes: false, touchedImpassable: false, touchedGeometry: false, newTokenIds: [] };

  for (const [rel, t] of Object.entries(clip.tiles || {})) {
    const [dx, dy] = rel.split(",").map(Number);
    tiles[key(anchorX + dx, anchorY + dy)] = { ...t };
    result.touchedTiles = true;
  }
  for (const [rel, emoji] of Object.entries(clip.stamps || {})) {
    const [dx, dy] = rel.split(",").map(Number);
    stamps[key(anchorX + dx, anchorY + dy)] = emoji;
  }
  for (const [rel, p] of Object.entries(clip.props || {})) {
    const [dx, dy] = rel.split(",").map(Number);
    props[key(anchorX + dx, anchorY + dy)] = { ...p };
    result.touchedProps = true;
  }
  const idRemap = {};
  for (const n of Object.values(clip.triggerNodes || {})) idRemap[n.id] = genNodeId();
  for (const [rel, n] of Object.entries(clip.triggerNodes || {})) {
    const [dx, dy] = rel.split(",").map(Number);
    const newNode = { ...n, id: idRemap[n.id] };
    if (newNode.linkKind === "node") {
      newNode.linkTo = idRemap[newNode.linkTo] || null;
      if (!newNode.linkTo) newNode.linkKind = null;
    }
    triggerNodes[key(anchorX + dx, anchorY + dy)] = newNode;
    result.touchedTriggerNodes = true;
  }
  for (const rel of Object.keys(clip.impassable || {})) {
    const [dx, dy] = rel.split(",").map(Number);
    impassable[key(anchorX + dx, anchorY + dy)] = true;
    result.touchedImpassable = true;
  }
  for (const w of (clip.walls || [])) {
    addWall(geometry.walls, anchorX + w.x1, anchorY + w.y1, anchorX + w.x2, anchorY + w.y2).floor = floor;
    result.touchedGeometry = true;
  }
  for (const d of (clip.doors || [])) {
    addDoor(geometry.doors, anchorX + d.x1, anchorY + d.y1, anchorX + d.x2, anchorY + d.y2, { closed: d.closed, isWindow: d.isWindow }).floor = floor;
    result.touchedGeometry = true;
  }
  for (const l of (clip.lights || [])) {
    addLight(geometry.lights, anchorX + l.x, anchorY + l.y, { range: l.range, intensity: l.intensity, shadows: l.shadows, color: l.color }).floor = floor;
    result.touchedGeometry = true;
  }
  const makeId = genTokenId || (() => "tok_" + Date.now() + "_" + Math.floor(Math.random() * 10000));
  for (const tok of (clip.tokens || [])) {
    const newId = makeId();
    const newTok = { ...tok, x: anchorX + tok._dx, y: anchorY + tok._dy, floor };
    delete newTok._dx; delete newTok._dy;
    tokens[newId] = newTok;
    result.newTokenIds.push(newId);
  }
  return result;
}
