// GeezVTT — 3D d20 roller (three.js r128 + cannon.js 0.6.2), used by the roll-call screen.
//
// Dice roll over a transparent window with only their shadows drawn; invisible walls keep them in view.
// Results are exact without fighting the physics:
//   1. each throw is simulated first in a hidden physics world and recorded frame by frame,
//   2. whatever face lands on top gets the decided number painted on it (and its opposite, so opposites still add to 21),
//   3. the recording plays back, with a slow turn mixed in so each number ends upright.
// Dice already resting on the table stay put and new throws bounce off them.
//
//   const tray = await createDiceTray3D(containerEl);
//   tray.throwGroup([{ dice: [{ v: 14 }, { v: 7, drop: true }], color: "#8b1e2b", label: "Lark", total: 19, sub: "14 + 5", cls: "ok" }]);
//   tray.clear();

const LIBS = [
  "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js",
];
let libsReady = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.async = true;
    s.onload = res; s.onerror = () => rej(new Error(`Couldn't load ${src}`));
    document.head.appendChild(s);
  });
}
function loadLibs() {
  if (window.THREE && window.CANNON) return Promise.resolve();
  return (libsReady ||= Promise.all(LIBS.map(loadScript)).catch((e) => { libsReady = null; throw e; }));
}

const CSS = `
.d3-tag { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); pointer-events: none; text-align: center; opacity: 0;
  transition: opacity .35s ease; white-space: nowrap; z-index: 2; }
.d3-tag.in { opacity: 1; }
.d3-tag .who { font: 600 12px system-ui, sans-serif; color: #e9e3d6; text-shadow: 0 1px 3px #000; }
.d3-tag .num { font: 900 30px/1 Cinzel, Georgia, serif; color: #fff; text-shadow: 0 0 12px rgba(0,0,0,.9), 0 2px 4px #000; }
.d3-tag .num.ok { color: #7fd69a; } .d3-tag .num.bad { color: #e2574c; } .d3-tag .num.crit { color: #ffd86b; }
.d3-tag .how { font: 11px system-ui, sans-serif; color: #b9b2a3; text-shadow: 0 1px 2px #000; }`;

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// THREE.Color can't read every CSS colour (e.g. "hsl(94 55% 45%)"), so let the browser normalise it
const normColor = (() => { const c = document.createElement("canvas").getContext("2d");
  return (col) => { c.fillStyle = "#8b1e2b"; c.fillStyle = col || "#8b1e2b"; return c.fillStyle; }; })();

export async function createDiceTray3D(container) {
  await loadLibs();
  const THREE = window.THREE, CANNON = window.CANNON;
  if (!document.getElementById("d3-css")) { const st = document.createElement("style"); st.id = "d3-css"; st.textContent = CSS; document.head.appendChild(st); }
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── renderer in the container ──────────────────────────
  const R = 0.95, TD = 11;
  let TW = 18, WALLS = [];
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  container.appendChild(canvas);
  const tagLayer = document.createElement("div"); tagLayer.className = "d3-layer"; tagLayer.style.cssText = "position:absolute;inset:0;pointer-events:none";
  container.appendChild(tagLayer);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xfff1e0, 0.55));
  const sun = new THREE.DirectionalLight(0xffe6c4, 1.5);
  sun.position.set(6, 16, 7); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { near: 1, far: 45, left: -16, right: 16, top: 10, bottom: -10 });
  sun.shadow.bias = -0.0006; scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8090ff, 0.3); fill.position.set(-8, 8, -6); scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  let W = 1, H = 1;
  function fit() {
    W = Math.max(1, container.clientWidth); H = Math.max(1, container.clientHeight);
    renderer.setSize(W, H, false); camera.aspect = W / H;
    TW = THREE.MathUtils.clamp(TD * camera.aspect * 0.92, 7, 28);
    WALLS = [[0, -TD / 2 - 0.4, TW + 1.6, 0.8], [0, TD / 2 + 0.4, TW + 1.6, 0.8], [-TW / 2 - 0.4, 0, 0.8, TD], [TW / 2 + 0.4, 0, 0.8, TD]];
    const tilt = 0.32, fovV = THREE.MathUtils.degToRad(camera.fov);
    const dist = Math.max((TD + 2) / 2 / Math.tan(fovV / 2), (TW + 2) / 2 / (Math.tan(fovV / 2) * camera.aspect)) * 1.08;
    camera.position.set(0, Math.cos(tilt) * dist, Math.sin(tilt) * dist + 0.4);
    camera.lookAt(0, 0, 0.4); camera.updateProjectionMatrix();
  }
  fit();
  const ro = new ResizeObserver(() => { if (container.clientWidth) fit(); }); ro.observe(container);

  // ── d20 geometry ────────────────────────────────────────
  // r128's IcosahedronGeometry is non-indexed: 20 triangles in order. Vertex 0 of a face = top of its number.
  const icoGeo = new THREE.IcosahedronGeometry(R, 0);
  const FACES = [];
  {
    const p = icoGeo.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const uv = new Float32Array(p.count * 2);
    for (let f = 0; f < 20; f++) {
      a.fromBufferAttribute(p, f * 3); b.fromBufferAttribute(p, f * 3 + 1); c.fromBufferAttribute(p, f * 3 + 2);
      const centroid = a.clone().add(b).add(c).divideScalar(3);
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (normal.dot(centroid) < 0) normal.negate();
      FACES.push({ normal, up: a.clone().sub(centroid).normalize(), opp: -1 });
      uv.set([0.5, 0.95, 0.05, 0.15, 0.95, 0.15], f * 6);
    }
    icoGeo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    icoGeo.clearGroups();
    for (let f = 0; f < 20; f++) icoGeo.addGroup(f * 3, 3, f);
    for (let f = 0; f < 20; f++) { let best = 1; FACES.forEach((g, i) => { const d = FACES[f].normal.dot(g.normal); if (d < best) { best = d; FACES[f].opp = i; } }); }
  }
  const edgeGeo = new THREE.EdgesGeometry(icoGeo);
  const startingNumbers = () => { const n = new Array(20).fill(0); let next = 1;
    for (let f = 0; f < 20; f++) if (!n[f]) { n[f] = next; n[FACES[f].opp] = 21 - next; next++; } return n; };

  const texCache = new Map();
  function faceTexture(num, color) {
    const key = color + "|" + num;
    if (texCache.has(key)) return texCache.get(key);
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
    const base = new THREE.Color(color), hi = base.clone().lerp(new THREE.Color("#ffffff"), 0.12), lo = base.clone().multiplyScalar(0.45);
    const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, `#${hi.getHexString()}`); grd.addColorStop(1, `#${lo.getHexString()}`);
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    const cx = 128, cy = 256 * (1 - 0.4167) + 4;
    g.font = `700 ${num >= 10 ? 72 : 86}px Cinzel, Georgia, serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 7; g.strokeStyle = "rgba(0,0,0,.65)"; g.strokeText(String(num), cx, cy);
    g.fillStyle = num === 20 ? "#ffe08a" : "#f6ecd4"; g.fillText(String(num), cx, cy);
    if (num === 6 || num === 9) g.fillRect(cx - 18, cy + 42, 36, 6);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    texCache.set(key, t); return t;
  }

  const live = [];    // dice on the table: { mesh, edges, tag, numbers, color, kept, track, rest }
  function makeDie(color) {
    const mats = Array.from({ length: 20 }, () => new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.12, flatShading: true, transparent: true }));
    const mesh = new THREE.Mesh(icoGeo, mats); mesh.castShadow = true;
    const edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xf1dcae, transparent: true, opacity: 0.55 }));
    mesh.add(edges); scene.add(mesh);
    return { mesh, edges, tag: null, numbers: startingNumbers(), color, kept: true, track: null, rest: null };
  }
  const paint = (d) => d.mesh.material.forEach((m, f) => { m.map = faceTexture(d.numbers[f], d.color); m.needsUpdate = true; });

  // ── physics ─────────────────────────────────────────────
  const hull = (() => {      // 12 unique corners, faces wound outward
    const p = icoGeo.attributes.position, verts = [], idx = [], map = new Map(), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); const k = v.toArray().map((x) => x.toFixed(4)).join(",");
      if (!map.has(k)) { map.set(k, verts.length); verts.push(v.clone()); }
      idx.push(map.get(k));
    }
    const faces = [];
    for (let f = 0; f < 20; f++) {
      let [i, j, k] = idx.slice(f * 3, f * 3 + 3);
      const n = verts[j].clone().sub(verts[i]).cross(verts[k].clone().sub(verts[i]));
      if (n.dot(verts[i].clone().add(verts[j]).add(verts[k])) < 0) [j, k] = [k, j];
      faces.push([i, j, k]);
    }
    return { verts, faces };
  })();
  const hullShape = () => new CANNON.ConvexPolyhedron(hull.verts.map((v) => new CANNON.Vec3(v.x, v.y, v.z)), hull.faces);
  function newWorld() {
    const world = new CANNON.World();
    world.gravity.set(0, -30, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 14;
    const diceMat = new CANNON.Material("dice"), tableMat = new CANNON.Material("table");
    world.addContactMaterial(new CANNON.ContactMaterial(tableMat, diceMat, { friction: 0.25, restitution: 0.42 }));
    world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat, { friction: 0.2, restitution: 0.5 }));
    const ground = new CANNON.Body({ mass: 0, material: tableMat }); ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2); world.addBody(ground);
    for (const [x, z, w, d] of WALLS) {
      const wall = new CANNON.Body({ mass: 0, material: tableMat });
      wall.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, 10, d / 2))); wall.position.set(x, 10, z); world.addBody(wall);
    }
    // dice already resting are solid obstacles
    for (const d of live) if (d.rest) {
      const b = new CANNON.Body({ mass: 0, material: diceMat, shape: hullShape() });
      b.position.set(d.rest[0], d.rest[1], d.rest[2]); b.quaternion.set(d.rest[3], d.rest[4], d.rest[5], d.rest[6]); world.addBody(b);
    }
    return { world, diceMat };
  }
  const topFace = (q) => { let best = -2, face = 0; const n = new THREE.Vector3();
    FACES.forEach((F, f) => { n.copy(F.normal).applyQuaternion(q); if (n.y > best) { best = n.y; face = f; } }); return { face, flat: best }; };
  const STEP = 1 / 60;
  function simulate(count) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const { world, diceMat } = newWorld();
      const bodies = [];
      for (let i = 0; i < count; i++) {
        const b = new CANNON.Body({ mass: 1, material: diceMat, linearDamping: 0.12, angularDamping: 0.12, shape: hullShape() });
        const lane = count === 1 ? (Math.random() - 0.5) * (TW - 5) : (i / (count - 1) - 0.5) * (TW - 4);
        b.position.set(lane + (Math.random() - 0.5), 2.5 + Math.random() * 1.5, TD / 2 - 1.3);
        b.quaternion.setFromEuler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
        b.velocity.set((Math.random() - 0.5) * 6 - lane * 0.15, 3 + Math.random() * 3, -(11 + Math.random() * 6));
        b.angularVelocity.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
        world.addBody(b); bodies.push(b);
      }
      const frames = bodies.map(() => []);
      let calm = 0;
      for (let s = 0; s < 60 * 8; s++) {
        world.step(STEP);
        bodies.forEach((b, i) => frames[i].push([b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]));
        calm = bodies.every((b) => b.velocity.length() < 0.08 && b.angularVelocity.length() < 0.08) ? calm + 1 : 0;
        if (calm > 20) break;
      }
      const landed = frames.map((fr) => { const f = fr[fr.length - 1]; return topFace(new THREE.Quaternion(f[3], f[4], f[5], f[6])); });
      if (landed.every((l) => l.flat > 0.93) || attempt === 5) return { frames, landed };
    }
  }
  function forceNumber(d, landedFace, value) {
    const n = d.numbers, at = n.indexOf(value);
    if (at === landedFace || at < 0) return;
    const oL = FACES[landedFace].opp, oA = FACES[at].opp;
    [n[landedFace], n[at]] = [n[at], n[landedFace]];
    if (at !== oL) [n[oL], n[oA]] = [n[oA], n[oL]];
  }
  function uprightYaw(face, q) {
    const up = FACES[face].up.clone().applyQuaternion(q);
    const away = new THREE.Vector3(camera.position.x, 0, camera.position.z).normalize().negate();
    return Math.atan2(away.x, away.z) - Math.atan2(up.x, up.z);
  }
  const smooth = (t) => t * t * (3 - 2 * t);

  // ── public: throw several players' dice together ───────
  // groups: [{ dice: [{ v, drop? }], color, label, total, sub, cls }]  — only d20 faces (v 1–20) are thrown.
  function throwGroup(groups) {
    const flat = [];
    for (const g of groups) {
      const d20s = (g.dice || []).filter((x) => x && x.v >= 1 && x.v <= 20 && (!x.s || x.s === 20));
      if (!d20s.length) d20s.push({ v: Math.max(1, Math.min(20, Number(g.total) || 1)) });
      const group = { g, dice: [], settled: 0, done: null };
      group.promise = new Promise((r) => (group.done = r));
      d20s.forEach((x) => flat.push({ group, x }));
    }
    if (!flat.length) return Promise.resolve();
    const sim = simulate(flat.length);
    const promises = new Set();
    flat.forEach(({ group, x }, i) => {
      const d = makeDie(normColor(group.g.color));
      const fr = sim.frames[i], last = fr[fr.length - 1];
      forceNumber(d, sim.landed[i].face, x.v); paint(d);
      d.kept = !x.drop;
      d.track = { frames: fr, t: 0, yaw: uprightYaw(sim.landed[i].face, new THREE.Quaternion(last[3], last[4], last[5], last[6])), group };
      group.dice.push(d); live.push(d); promises.add(group.promise);
    });
    return Promise.all([...promises]);
  }
  function settle(d) {
    const group = d.track.group;
    if (++group.settled < group.dice.length) return;
    const k = group.dice.find((x) => x.kept) || group.dice[0], g = group.g;
    k.tag = document.createElement("div"); k.tag.className = "d3-tag";
    k.tag.innerHTML = `${g.label ? `<div class="who">${esc(g.label)}</div>` : ""}<div class="num ${esc(g.cls || "")}">${esc(g.total)}</div>${g.sub ? `<div class="how">${esc(g.sub)}</div>` : ""}`;
    tagLayer.appendChild(k.tag); requestAnimationFrame(() => k.tag?.classList.add("in"));
    group.done();
  }
  function clear() {
    for (const d of live) { scene.remove(d.mesh); d.mesh.material.forEach((m) => m.dispose()); d.edges.material.dispose(); d.tag?.remove(); }
    live.length = 0;
  }

  // ── loop ────────────────────────────────────────────────
  const tmp = new THREE.Vector3();
  let last = performance.now(), running = true;
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (container.clientWidth) {                 // skip work while the screen is hidden
      for (const d of live) {
        const T = d.track;
        if (T && !d.rest) {
          T.t += dt * (reduceMotion ? 4 : 1);
          const fr = T.frames, N = fr.length, fi = Math.min(N - 1, T.t / STEP), i0 = Math.floor(fi), i1 = Math.min(N - 1, i0 + 1), k = fi - i0;
          const a = fr[i0], b = fr[i1];
          d.mesh.position.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
          const q = new THREE.Quaternion(a[3], a[4], a[5], a[6]).slerp(new THREE.Quaternion(b[3], b[4], b[5], b[6]), k);
          const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), T.yaw * smooth(Math.min(1, i0 / Math.max(1, N - 1))));
          d.mesh.quaternion.copy(yaw.multiply(q));
          if (i0 >= N - 1) {
            const p = d.mesh.position, r = d.mesh.quaternion;
            d.rest = [p.x, p.y, p.z, r.x, r.y, r.z, r.w];
            settle(d);
          }
        }
        const dim = d.kept ? 1 : 0.35;
        d.mesh.material.forEach((m) => (m.opacity = dim)); d.edges.material.opacity = 0.55 * dim;
        if (d.tag) {
          tmp.copy(d.mesh.position); tmp.y += R * 1.1; tmp.project(camera);
          d.tag.style.left = `${(tmp.x * 0.5 + 0.5) * W}px`; d.tag.style.top = `${(-tmp.y * 0.5 + 0.5) * H}px`;
        }
      }
      renderer.render(scene, camera);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // redraw numbers once the Cinzel font is available (canvas text can't wait for it)
  document.fonts?.load?.("700 80px Cinzel").then(() => { texCache.forEach((t) => t.dispose()); texCache.clear(); live.forEach(paint); }).catch(() => {});

  return {
    throwGroup, clear,
    dispose() { running = false; ro.disconnect(); clear(); renderer.dispose(); canvas.remove(); tagLayer.remove(); },
  };
}
