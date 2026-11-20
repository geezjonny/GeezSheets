// 3D view: extrudes the map (walls, doors, props, tokens) 2 units (10 ft) high with real lights and shadows.
// 1 unit = 1 grid cell = 5 ft = 40 map px. Map (x, y) -> world (x/40, z/40). Loaded lazily the first time it is opened.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { S, $, mapSize } from "./state.js";
import { isPcToken, wallPieces } from "./draw.js";

const U = 40, WALL_H = 2, WALL_T = 0.16, MAX_SHADOW_LIGHTS = 6;
// Wind Waker-style palette: saturated, sunny colours with dark purple-ink outlines.
const INK = 0x2a1a33, PARCHMENT = 0xd49a45, SOLID = 0xd8d2ea, BRASS = 0xe0b13a;
const WALL_COL = { wood: 0xa8602a, stone: 0xa7a0b8, cobble: 0x7d6f8f, iron: 0x5d7488 }, WALL_DEF = 0xc9b48a;
const FLOOR_COL = { wood: 0xe0a24e, stone: 0xd3cfe0, cobble: 0xa99fbf, iron: 0x7e93a8, gravel: 0xc7b48a, sand: 0xf5d778, grass: 0x6fcf4f, water: 0x3fb6e8, mud: 0x9a6a3c, ice: 0xbdf0ff }, FLOOR_DEF = 0xf0e2b8;
const TOKEN_COLS = [0xe0503a, 0x2f8fd8, 0x4fbf4a, 0xb455d6];

let renderer, scene, camera, controls, root, host, raf = 0, dirty = true, fitted = false;
const mats = new Map();
let ramp;   // 4-step light ramp gives the banded cel-shaded look
const toonRamp = () => ramp ??= Object.assign(new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 225, 225, 225, 255, 255, 255, 255, 255]), 4, 1, THREE.RGBAFormat), { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, needsUpdate: true });
const DESAT = .9;   // global saturation multiplier for the whole 3D palette
const desat = (c) => { const col = new THREE.Color(c), hsl = {}; col.getHSL(hsl); return col.setHSL(hsl.h, hsl.s * DESAT, hsl.l); };
const mat = (c, tex) => { const k = c + (tex || ""); if (!mats.has(k)) mats.set(k, new THREE.MeshToonMaterial({ color: desat(c), gradientMap: toonRamp(), map: tex ? texture(tex) : null })); return mats.get(k); };
const seeded = (str) => { let a = 0; for (const ch of String(str)) a = (a * 31 + ch.charCodeAt(0)) | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function carve(geo, amt) { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), q = (v) => Math.round(v * 1e4) / 1e4, h = (k) => { const n = Math.sin(q(x) * 127.1 + q(y) * 311.7 + q(z) * 74.7 + k * 19.3) * 43758.5453; return (n - Math.floor(n)) * 2 - 1; }; p.setXYZ(i, x + h(1) * amt, y + h(2) * amt, z + h(3) * amt); } p.needsUpdate = true; geo.computeVertexNormals(); return geo; }
// Hand-inked procedural textures: near-white with dark linework, so they tint to whatever colour the material has. One tile = one cell (UVs are scaled to world units).
const texs = {};
function texture(key) {
  if (texs[key]) return texs[key];
  const floor = key.startsWith("f:"), name = floor ? key.slice(2) : key;
  const N = 128, c = document.createElement("canvas"); c.width = c.height = N; const g = c.getContext("2d");
  let seed = [...name].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7); const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = "#fff"; g.fillRect(0, 0, N, N); g.lineCap = "round"; g.lineJoin = "round";
  const line = (w, col, f) => { g.lineWidth = w; g.strokeStyle = col; g.beginPath(); f(); g.stroke(); };
  const speck = (n, col, r) => { g.fillStyle = col; for (let i = 0; i < n; i++) { g.beginPath(); g.arc(rnd() * N, rnd() * N, r * (.4 + rnd()), 0, 7); g.fill(); } };
  if (name === "wood") for (let i = 0; i < 2; i++) {   // planks with grain (few, bold lines so they survive minification at shallow angles)
    const y = i * N / 2; line(6, "#7a5a36", () => { g.moveTo(0, y); g.lineTo(N, y); });
    for (let k = 0; k < 2; k++) { const gy = y + 12 + rnd() * (N / 2 - 24), x0 = rnd() * 40; line(3, "#a88660", () => { g.moveTo(x0, gy); g.bezierCurveTo(x0 + 30, gy - 4, x0 + 60, gy + 4, x0 + 50 + rnd() * 50, gy); }); }
    const kx = rnd() * N, ky = y + 16 + rnd() * 28; if (i % 2) line(3, "#8a6a44", () => { g.ellipse(kx, ky, 4, 2.5, 0, 0, 7); });
  }
  else if (name === "stone") { for (let r = 0; r < 4; r++) { const y = r * N / 4, off = r % 2 ? N / 4 : 0; line(3, "#6e6a64", () => { g.moveTo(0, y); g.lineTo(N, y); for (let x = off; x < N + 1; x += N / 2) { g.moveTo(x, y); g.lineTo(x, y + N / 4); } }); } speck(40, "#9a968c", 1.2); }
  else if (name === "cobble") for (let i = 0; i < 14; i++) { const x = (i % 4) * N / 4 + (Math.floor(i / 4) % 2) * 14 + 4, y = Math.floor(i / 4) * N / 4 + 4; line(2.5, "#4f4a45", () => { g.roundRect(x, y, N / 4 - 6 + rnd() * 6, N / 4 - 7, 8); }); }
  else if (name === "iron") { for (const [x, y] of [[8, 8], [N - 8, 8], [8, N - 8], [N - 8, N - 8]]) { g.fillStyle = "#3f4850"; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill(); } line(3, "#3f4850", () => { g.rect(2, 2, N - 4, N - 4); }); line(1.2, "#8e9aa4", () => { g.moveTo(20, 20); g.lineTo(N - 20, 20); g.moveTo(20, N / 2); g.lineTo(N - 20, N / 2); }); }
  else if (name === "gravel" || name === "sand") speck(name === "sand" ? 90 : 60, name === "sand" ? "#c9a85e" : "#7d7565", name === "sand" ? 1 : 2);
  else if (name === "grass") for (let i = 0; i < 22; i++) { const x = rnd() * N, y = rnd() * N; line(1.6, "#4f7a38", () => { g.moveTo(x - 4, y); g.lineTo(x - 2, y - 9); g.moveTo(x, y); g.lineTo(x, y - 12); g.moveTo(x + 4, y); g.lineTo(x + 2, y - 9); }); }
  else if (name === "water") for (let i = 0; i < 4; i++) { const y = 16 + i * 30; line(2, "#2d6a8f", () => { g.moveTo(0, y); for (let x = 0; x < N; x += 32) g.quadraticCurveTo(x + 8, y - 7, x + 16, y), g.quadraticCurveTo(x + 24, y + 7, x + 32, y); }); }
  else if (name === "mud") { speck(18, "#4a3624", 5); speck(40, "#6a4f36", 1.5); }
  else if (name === "ice") { line(1.6, "#8cc4d8", () => { g.moveTo(10, 30); g.lineTo(60, 52); g.lineTo(54, 100); g.moveTo(60, 52); g.lineTo(118, 40); g.moveTo(90, 120); g.lineTo(70, 86); }); }
  else if (name === "paper") speck(120, "#d8cfb4", 1.2);
  if (false) { g.strokeStyle = "#c7bfaa"; g.lineWidth = 2; g.strokeRect(0, 0, N, N); }   // the map's grid line, floors only
  return texs[key] = Object.assign(new THREE.CanvasTexture(c), { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, colorSpace: THREE.SRGBColorSpace, anisotropy: renderer.capabilities.getMaxAnisotropy() });
}
const hullRes = new THREE.Vector2(1, 1), hullPx = { value: 2 };
function ink(mesh) {
  const material = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 8, polygonOffsetUnits: 8 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRes = { value: hullRes }; shader.uniforms.uHull = hullPx;
    shader.vertexShader = "uniform vec2 uRes; uniform float uHull;\n" + shader.vertexShader.replace("#include <project_vertex>", `
      vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      vec2 hd = (projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0)).xy;
      if (length(hd) > 1e-5) gl_Position.xy += normalize(hd) * (uHull * 2.0 / uRes) * gl_Position.w;`);
  };
  material.customProgramCacheKey = () => "geezvtt-ink";
  let geo = new THREE.BufferGeometry(); geo.setAttribute("position", mesh.geometry.getAttribute("position"));
  if (mesh.geometry.index) geo.setIndex(mesh.geometry.index);
  geo = mergeVertices(geo, 1e-4); geo.computeVertexNormals();
  const shell = new THREE.Mesh(geo, material); shell.castShadow = false; shell.receiveShadow = false; shell.raycast = () => {};
  mesh.add(shell); return mesh;
}

function init() {
  host = document.createElement("div"); host.id = "view3d"; host.hidden = true; document.body.append(host);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); host.append(renderer.domElement);
  scene = new THREE.Scene(); scene.background = desat(0x3b4f8c);
  camera = new THREE.PerspectiveCamera(50, 1, .1, 200);
  controls = new OrbitControls(camera, renderer.domElement); controls.maxPolarAngle = Math.PI / 2 - .03; controls.enableDamping = true; controls.enabled = !toolBlock;
  // wheel zooms, middle-drag orbits, Space + middle-drag pans
  const midBtn = (pan) => { controls.mouseButtons = { LEFT: null, MIDDLE: pan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, RIGHT: null }; };
  midBtn(false);
  document.addEventListener("keydown", (e) => { if (e.code === "Space") midBtn(true); });
  document.addEventListener("keyup", (e) => { if (e.code === "Space") midBtn(false); });
  controls.addEventListener("change", () => (dirty = true));
  scene.add(new THREE.AmbientLight(0xaab4e8, .55), new THREE.HemisphereLight(0xcfe6ff, 0xffc98a, .8));
  root = new THREE.Group(); scene.add(root);
  new ResizeObserver(resize).observe(host);
}
function resize() {
  const hb = document.querySelector("header")?.getBoundingClientRect().bottom; if (hb) host.style.top = hb + "px";   // sit right under the menu bar, filling the window
  if (!renderer) return; const w = host.clientWidth || 800, h = host.clientHeight || 560;
  renderer.setSize(w, h); const pr = renderer.getPixelRatio(); hullRes.set(w * pr, h * pr); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
}
function uvScale(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }
function boxGeo(w, h, d) {   // UVs in world units so textures keep one tile per cell on every face
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]); }
  return g;
}
function box(w, h, d, color, x, y, z, parent, tex) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat(color, tex));
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; m.userData.structural = true; parent.add(m); return m;
}
function seg(a, b, h, t, color, y0, parent, tex) {   // a wall slab between two map points
  const dx = (b.x - a.x) / U, dz = (b.y - a.y) / U, len = Math.hypot(dx, dz) + t;
  const m = box(len, h, t, color, (a.x + b.x) / 2 / U, y0 + h / 2, (a.y + b.y) / 2 / U, parent, tex);
  m.rotation.y = -Math.atan2(dz, dx); return m;
}

function build() {
  root.clear(); buildGrid();
  const { floors = {}, walls = {}, props = {} } = S.map, gm = S.isGM;
  let sx = 0, sz = 0, n = 0, minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9;
  for (const [fi, a] of Object.values(floors).entries()) {   // later floors sit a hair higher, like the 2D draw order, so overlapping rects do not z-fight
    const m = new THREE.Mesh(new THREE.PlaneGeometry(a.w / U, a.h / U), mat(FLOOR_COL[a.mat] ?? FLOOR_DEF, "f:" + (a.mat && a.mat in FLOOR_COL ? a.mat : "paper")));
    uvScale(m.geometry, a.w / U, a.h / U);
    m.rotation.x = -Math.PI / 2; m.position.set((a.x + a.w / 2) / U, fi * .003, (a.y + a.h / 2) / U); m.receiveShadow = true; root.add(m);
    minX = Math.min(minX, a.x); minZ = Math.min(minZ, a.y); maxX = Math.max(maxX, a.x + a.w); maxZ = Math.max(maxZ, a.y + a.h);
  }
  {   // ground: the whole map area in paper, under any floors; also frames the camera when a map has no floors (e.g. an import of walls, doors and lights only)
    const { cols, rows } = mapSize(), gw = cols * 40, gh = rows * 40;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(gw / U, gh / U), mat(FLOOR_DEF, "f:paper")); uvScale(g.geometry, gw / U, gh / U);
    g.rotation.x = -Math.PI / 2; g.position.set(gw / 2 / U, -.01, gh / 2 / U); g.receiveShadow = true; root.add(g);
    if (!(maxX > minX)) { minX = 0; minZ = 0; maxX = gw; maxZ = gh; }
  }
  const doors = Object.entries(S.objects).filter(([, o]) => o.kind === "door" && (gm || !o.hidden)).map(([id, o]) => ({ ...o, _id: id }));
  // Walls, with the part under each door cut out (the door fills it, or leaves it open under a lintel).
  for (const [wid, w] of Object.entries(walls)) {
    const col = WALL_COL[w.mat] ?? WALL_DEF;
    for (const [x1, y1, x2, y2] of wallPieces(w, doors)) seg({ x: x1, y: y1 }, { x: x2, y: y2 }, WALL_H, WALL_T, col, 0, root, w.mat in WALL_COL ? w.mat : "stone").userData.pick = { type: "wall", id: wid };
  }
  for (const d of doors) {
    const v = d.dir === "v", a = { x: d.x - (v ? 0 : 20), y: d.y - (v ? 20 : 0) }, b = { x: d.x + (v ? 0 : 20), y: d.y + (v ? 20 : 0) }, col = WALL_COL[d.mat] ?? 0x6b4423;
    if (d.win) {   // window: sill and lintel with a pane of glass between (blocks walking, not sight)
      const sill = seg(a, b, .9, WALL_T, col, 0, root, "wood"), top = seg(a, b, .45, WALL_T, col, WALL_H - .45, root, "wood"), pane = d.state === "open" ? null : seg(a, b, WALL_H - 1.35, .04, 0x9fd4e8, .9, root, "wood");   // an open window has no glass
      if (pane) pane.material = new THREE.MeshBasicMaterial({ color: 0x9fd4e8, transparent: true, opacity: .35, depthWrite: false });
      for (const m of [sill, top, pane].filter(Boolean)) m.userData.pick = { type: "object", id: d._id };
      continue;
    }
    const dm = d.state === "open" ? seg(a, b, .45, WALL_T, col, WALL_H - .45, root, "wood")   // lintel over an open doorway
      : seg(a, b, WALL_H, WALL_T * 1.25, col, 0, root, "wood");
    dm.userData.pick = { type: "object", id: d._id };
  }
  const structural = [];
  root.traverse((n) => { if (n.isMesh && n.userData.structural) structural.push(n); });
  structural.forEach(ink);
  for (const [pid, p] of Object.entries(props)) { if (p.hidden && !gm) continue; prop(p, pid); }
  for (const [i, [tid, t]] of Object.entries(S.tokens).entries()) {
    if (t.hidden && !gm) continue;
    const col = t.color ? new THREE.Color(t.color) : t.hp != null ? new THREE.Color(0x5a2a24) : new THREE.Color(TOKEN_COLS[i % 4]);
    const g = new THREE.Group(); g.position.set(t.x / U, 0, t.y / U); g.userData.pick = { type: "token", id: tid }; root.add(g);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, .08, 24), mat(col.getHex())); base.position.y = .04; g.add(base);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.18, .26, .8, 16), mat(col.getHex())); body.position.y = .48; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 16, 12), mat(0xffd9b0)); head.position.y = 1.05; head.castShadow = true; g.add(head);
    [base, body, head].forEach(ink);
    base.receiveShadow = true;
    if (isPcToken(t)) { const l = new THREE.PointLight(0xffe6b0, .6, 3); l.position.y = 1.2; g.add(l); }   // faint glow around a PC so you can see your own feet
  }
  // Lights: every lit "light" object is a real point light; the first few cast shadows.
  let shadowed = 0;
  for (const [oid, o] of Object.entries(S.objects)) {
    if (o.kind !== "light" || o.state !== "on" || (o.hidden && !gm)) continue;
    const r = (o.radius || 120) / U, l = new THREE.PointLight(new THREE.Color(o.color || "#ffb347"), 14 * r * .6, r * 1.6, 1.4);
    l.position.set(o.x / U, 1.3, o.y / U);
    if (shadowed < MAX_SHADOW_LIGHTS) { l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -.002; l.shadow.radius = 3; shadowed++; }
    root.add(l);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 8), new THREE.MeshBasicMaterial({ color: o.color || "#ffb347" })); bulb.position.copy(l.position); bulb.userData.pick = { type: "object", id: oid }; root.add(bulb);
  }
  if (!fitted && maxX > minX) {   // first time: frame the whole map
    fitted = true; const cx = (minX + maxX) / 2 / U, cz = (minZ + maxZ) / 2 / U, span = Math.max(maxX - minX, maxZ - minZ) / U;
    controls.target.set(cx, 0, cz); camera.position.set(cx, span * .9, cz + span * .8); controls.update();
  }
  void sx; void sz; void n;
  dirty = true; renderer.compile(scene, camera);
}

function prop(p, pid) {   // chunky, outlined Wind Waker-style prop kit
  const K = p.kind, known = ["crate", "barrel", "table", "chest", "pillar", "statue", "bed", "rug", "tree", "pine", "bush", "rock", "stump", "well", "lamp", "fence"];
  if (!known.includes(K)) return;
  const g = new THREE.Group(); g.position.set(p.x / U, p.elevation || 0, p.y / U); g.rotation.y = p.rotation || 0; g.scale.setScalar(p.scale || 1); g.userData.pick = { type: "prop", id: pid }; root.add(g);
  const R = seeded(p.id), pick = (a) => a[Math.floor(R() * a.length)];
  const part = (geo, c, x = 0, y = 0, z = 0, tex, noInk = false) => { const m = new THREE.Mesh(geo, c?.isMaterial ? c : mat(c, tex)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = !noInk; m.userData.noInk = noInk; g.add(m); return m; };
  const b = (w, h, d, c, x, y, z, tex, noInk = false) => part(boxGeo(w, h, d), c, x, y, z, tex, noInk);
  const cyl = (r, h, c, x, y, z, tex, n = 10) => part(new THREE.CylinderGeometry(r, r, h, n), c, x, y + h / 2, z, tex);
  const carved = (geo, amount) => carve(geo, amount);
  if (K === "crate") {
    b(.68, .68, .68, PARCHMENT, 0, .34, 0, "wood"); for (const [x, z] of [[-.3, -.3], [.3, -.3], [-.3, .3], [.3, .3]]) b(.09, .78, .09, 0x7b4b2a, x, .39, z, "wood");
    for (const z of [-.356, .356]) for (const a of [-1, 1]) { const m = b(.58, .065, .035, 0x8c5428, 0, .34, z, "wood"); m.rotation.z = a * .62; }
  } else if (K === "barrel") {
    const profile = [new THREE.Vector2(.22, 0), new THREE.Vector2(.29, .08), new THREE.Vector2(.34, .25), new THREE.Vector2(.35, .52), new THREE.Vector2(.30, .72), new THREE.Vector2(.23, .8)];
    part(carved(new THREE.LatheGeometry(profile, 12), .012), PARCHMENT, 0, .4, 0, "wood");
    for (const [y, color] of [[.18, BRASS], [.62, 0x5d7488]]) { const hoop = part(new THREE.TorusGeometry(.315, .025, 6, 12), color, 0, y, 0); hoop.rotation.x = Math.PI / 2; }
    cyl(.245, .045, 0x8a5a34, 0, .78, 0, "wood", 12);
  } else if (K === "table") {
    b(.86, .14, .58, PARCHMENT, 0, .72, 0, "wood"); for (const [x, z] of [[-.36, -.22], [.36, -.22], [-.36, .22], [.36, .22]]) b(.09, .7, .09, 0x87512a, x, .35, z, "wood");
    cyl(.1, .025, 0xe9d7a0, -.18, .805, .02, undefined, 12); cyl(.055, .08, BRASS, -.18, .82, .02, undefined, 10);
  } else if (K === "chest") {
    b(.76, .38, .5, PARCHMENT, 0, .2, 0, "wood");
    const lid = part(new THREE.CylinderGeometry(.27, .27, .76, 12, 1, false, 0, Math.PI), PARCHMENT, 0, .47, 0, "wood"); lid.rotation.z = Math.PI / 2;
    b(.055, .5, .54, BRASS, 0, .45, 0); b(.13, .16, .035, BRASS, 0, .24, -.275);
    b(.05, .1, .03, INK, 0, .25, -.295);
  } else if (K === "pillar") {
    cyl(.3, .18, SOLID, 0, 0, 0, "stone"); cyl(.22, 1.55, SOLID, 0, .18, 0, "stone"); cyl(.34, .18, SOLID, 0, 1.73, 0, "stone");
  } else if (K === "statue") {
    b(.62, .25, .62, SOLID, 0, .125, 0, "stone"); cyl(.35, .12, SOLID, 0, .25, 0, "stone");
    part(new THREE.CylinderGeometry(.18, .26, .62, 8), SOLID, 0, .68, 0, "stone"); part(new THREE.SphereGeometry(.19, 10, 7), SOLID, 0, 1.12, 0);
    const armL = cyl(.07, .48, SOLID, -.25, .63, 0, "stone", 10); armL.rotation.z = -.48;
    const armR = cyl(.07, .48, SOLID, .25, .63, 0, "stone", 10); armR.rotation.z = .48;
  } else if (K === "bed") {
    b(.72, .28, .92, PARCHMENT, 0, .14, 0, "wood"); b(.64, .14, .8, 0xf0dfc0, 0, .35, .02);
    b(.63, .16, .27, 0xe0445a, 0, .45, .25); b(.42, .1, .2, 0xf5e8ca, 0, .47, -.27);
    for (const [x, z] of [[-.33, -.42], [.33, -.42], [-.33, .42], [.33, .42]]) { cyl(.055, 1.02, 0x87512a, x, 0, z, "wood", 10); part(new THREE.SphereGeometry(.09, 10, 6), BRASS, x, 1.08, z); }
    b(.72, .62, .07, PARCHMENT, 0, .65, .44, "wood");
  } else if (K === "rug") {
    part(new THREE.CylinderGeometry(.64, .64, .035, 8), 0xe0445a, 0, .018, 0, undefined, true); part(new THREE.CylinderGeometry(.5, .5, .04, 8), BRASS, 0, .04, 0, undefined, true);
  } else if (K === "tree") {
    cyl(.11, .9, 0x8a5a2c, 0, 0, 0, "wood", 8); part(carved(new THREE.IcosahedronGeometry(.42, 0), .04), 0x3fbf3a, -.22, 1.0, 0, "leaves"); part(carved(new THREE.IcosahedronGeometry(.46, 0), .04), 0x5fd04a, .2, 1.12, .02, "leaves"); part(carved(new THREE.IcosahedronGeometry(.4, 0), .04), 0x3fbf3a, 0, 1.42, 0, "leaves");
  } else if (K === "pine") {
    cyl(.08, .45, 0x8a5a2c, 0, 0, 0, "wood", 7); for (const [r, h, y] of [[.55, .72, .55], [.43, .65, 1.0], [.3, .58, 1.42]]) part(carved(new THREE.ConeGeometry(r, h, 7), .025), 0x3fbf3a, 0, y, 0, "leaves");
  } else if (K === "bush") {
    for (let i = 0; i < 3; i++) part(carved(new THREE.IcosahedronGeometry(.25 + R() * .1, 0), .03), pick([0x3fbf3a, 0x55cf45, 0x299c38]), (R() - .5) * .45, .23, (R() - .5) * .4, "leaves");
  } else if (K === "rock") {
    const m = part(carved(new THREE.DodecahedronGeometry(.36, 0), .06), pick([0x8b91a6, 0xa7a0b8, 0x747b91]), 0, .25, 0, "stone"); m.scale.y = .7;
  } else if (K === "stump") {
    cyl(.27, .32, 0x8a5a2c, 0, 0, 0, "wood", 8); part(new THREE.CylinderGeometry(.21, .21, .025, 8), 0xc9a878, 0, .33, 0);
  } else if (K === "well") {
    part(carved(new THREE.CylinderGeometry(.55, .6, .45, 9, 1, true), .025), SOLID, 0, .225, 0, "stone"); part(new THREE.CylinderGeometry(.42, .42, .04, 9), 0x386a91, 0, .3, 0); for (const x of [-.5, .5]) b(.08, 1.05, .08, PARCHMENT, x, .78, 0, "wood"); part(new THREE.ConeGeometry(.72, .42, 4), 0xe0445a, 0, 1.42, 0, "wood").rotation.y = Math.PI / 4;
  } else if (K === "lamp") {
    cyl(.06, 1.55, BRASS, 0, 0, 0, undefined, 7); b(.2, .24, .2, new THREE.MeshBasicMaterial({ color: 0xffd28a }), 0, 1.68, 0); part(new THREE.ConeGeometry(.18, .14, 4), BRASS, 0, 1.9, 0).rotation.y = Math.PI / 4;
  } else if (K === "fence") {
    for (const x of [-.45, 0, .45]) b(.08, .62, .08, PARCHMENT, x, .31, 0, "wood"); for (const y of [.22, .45]) b(1, .07, .05, PARCHMENT, 0, y, 0, "wood");
  }
  const meshes = []; g.traverse((n) => { if (n.isMesh && !n.userData.noInk) meshes.push(n); }); meshes.forEach(ink);
}

// ---- tools in 3D: zoom, fit, ground picking, ruler, ping ----
const anims = new Set(), ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
export const isOpen = () => !!host && !host.hidden;
export function zoom(f) { const o = camera.position.clone().sub(controls.target).multiplyScalar(Math.max(.3, Math.min(3, f))); camera.position.copy(controls.target).add(o); controls.update(); dirty = true; }
export function fit() { fitted = false; build(); }
let toolBlock = false;   // an active ruler/ping tool pauses the camera
const applyControls = () => { if (controls) controls.enabled = !toolBlock; };
export function setControls(on) { toolBlock = !on; applyControls(); }
let gridOn = false, gridLines;
export function setGrid(on) { gridOn = on; if (gridLines) gridLines.visible = on; dirty = true; }
function buildGrid() {
  gridOn = document.getElementById("bar-grid")?.classList.contains("on") ?? gridOn;   // follow the Grid button, also right after switching views
  const { cols, rows } = mapSize(), pts = [];
  for (let c = 0; c <= cols; c++) pts.push(c, .02, 0, c, .02, rows);
  for (let r = 0; r <= rows; r++) pts.push(0, .02, r, cols, .02, r);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  gridLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: .45 }));
  gridLines.visible = gridOn; gridLines.raycast = () => {}; root.add(gridLines);
}
export function groundAt(clientX, clientY) {   // screen point -> map px on the floor, or null
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = ray.ray.intersectPlane(ground, new THREE.Vector3()); return hit ? { x: hit.x * U, y: hit.z * U } : null;
}
// Select: what is under the cursor? -> { type: token|prop|object|wall, id } and a brass ring is drawn around it.
let selRing = null;
export function pickAt(clientX, clientY) {
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
  for (const h of ray.intersectObject(root, true)) {
    let o = h.object; while (o && !o.userData.pick) o = o.parent;
    if (!o) continue;
    const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const rad = Math.min(3, Math.max(.45, Math.max(sz.x, sz.z) / 2 + .15));
    if (selRing) scene.remove(selRing);
    selRing = new THREE.Mesh(new THREE.RingGeometry(rad - .07, rad, 40), new THREE.MeshBasicMaterial({ color: BRASS, depthTest: false, side: THREE.DoubleSide }));
    selRing.rotation.x = -Math.PI / 2; selRing.position.set(c.x, .07, c.z); selRing.renderOrder = 10; scene.add(selRing); dirty = true;
    return o.userData.pick;
  }
  clearSelection(); return null;
}
export function clearSelection() { if (selRing) { scene.remove(selRing); selRing = null; dirty = true; } }
export function screenAt(mx, my) { const r = renderer.domElement.getBoundingClientRect(), v = new THREE.Vector3(mx / U, .1, my / U).project(camera); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; }
let rulerObj = null;
export function ruler(a, b) {   // a, b in map px; null clears
  if (rulerObj) { scene.remove(rulerObj); rulerObj = null; }
  if (a && b) {
    rulerObj = new THREE.Group();
    const A = new THREE.Vector3(a.x / U, .08, a.y / U), B = new THREE.Vector3(b.x / U, .08, b.y / U);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([A, B]), new THREE.LineBasicMaterial({ color: BRASS, depthTest: false })); line.renderOrder = 10;
    rulerObj.add(line);
    for (const p of [A, B]) { const d = new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8), new THREE.MeshBasicMaterial({ color: BRASS, depthTest: false })); d.position.copy(p); d.renderOrder = 10; rulerObj.add(d); }
    scene.add(rulerObj);
  }
  dirty = true;
}
export function ping(p) {   // expanding ring + beacon at a map point
  if (!isOpen()) return;
  const g = new THREE.Group(); g.position.set(p.x / U, .06, p.y / U);
  const ringMat = new THREE.MeshBasicMaterial({ color: BRASS, transparent: true, depthTest: false, side: THREE.DoubleSide }), ring = new THREE.Mesh(new THREE.RingGeometry(.85, 1, 40), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 10;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 2.2, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false })); beam.position.y = 1.1; beam.renderOrder = 10;
  g.add(ring, beam); scene.add(g);
  const t0 = performance.now(), a = () => {
    const k = (performance.now() - t0) / 1500; if (k >= 1) { scene.remove(g); anims.delete(a); dirty = true; return; }
    ring.scale.setScalar(.15 + k * 1.1); ringMat.opacity = .95 * (1 - k); beam.material.opacity = k < .65 ? 1 : 1 - (k - .65) / .35;
  };
  anims.add(a);
}

function loop() { raf = requestAnimationFrame(loop); for (const a of anims) a(); if (controls.update() || dirty || anims.size) { dirty = false; renderer.render(scene, camera); } }

export function open() { if (!renderer) init(); host.hidden = false; resize(); build(); S.refresh3d = () => { if (!host.hidden) { clearTimeout(open.t); open.t = setTimeout(build, 30); } }; if (!raf) loop(); }
export function close() { if (!host) return; clearSelection(); host.hidden = true; cancelAnimationFrame(raf); raf = 0; S.refresh3d = null; }
