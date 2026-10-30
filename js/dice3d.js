// GeezVTT — transparent dice tray, three.js r128 + cannon.js 0.6.2.
// Simulate first, paint the decided result on the upper face, then replay.
// Each solid uses the same convex hull for its rendering and collisions.
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js'
];
let libsReady;
function loadLibs() {
  if (!libsReady) libsReady = Promise.all(LIBS.map((src, i) => {
    if (window[i ? 'CANNON' : 'THREE']) return;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error(`Couldn't load ${src}`)); };
      document.head.appendChild(script);
    });
  })).then(() => {
    if (!window.THREE || !window.CANNON) throw new Error('Dice libraries unavailable');
  }).catch((error) => { libsReady = null; throw error; });
  return libsReady;
}

export async function createDiceTray3D(container) {
  await loadLibs();
  const THREE = window.THREE, CANNON = window.CANNON;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  // Construct before attaching, so WebGL failure leaves no overlay behind.
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0, 0);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  const style = document.createElement('style');
  style.textContent = `.d3-tag{position:absolute;transform:translate(-50%,-100%);text-align:center;pointer-events:none;white-space:nowrap;z-index:2;color:#fff;text-shadow:0 2px 4px #000}
.d3-tag .who{font:600 12px system-ui}.d3-tag .num{font:900 30px/1 Georgia,serif}.d3-tag .how{font:11px system-ui;color:#d2cbbf}
.d3-tag .num.ok{color:#7fd69a}.d3-tag .num.bad{color:#e2574c}.d3-tag .num.crit{color:#ffd86b}`;
  layer.appendChild(style);
  container.append(canvas, layer);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 150);
  scene.add(new THREE.AmbientLight(0xfff1e0, 0.8));
  const sun = new THREE.DirectionalLight(0xffe6c4, 1.2);
  sun.position.set(6, 16, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 16, bottom: -16, near: 1, far: 60 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.ShadowMaterial({ opacity: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const Y = new THREE.Vector3(0, 1, 0), live = [], tags = [], textures = new Map(), solids = new Map();
  let width, height, trayWidth, destroyed = false, generation = 0, queue = Promise.resolve();
  const depth = 11, step = 1 / 60;

  function fit() {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    trayWidth = Math.max(5, Math.min(28, depth * camera.aspect * 0.92));
    const distance = Math.max((depth + 3) / 2, (trayWidth + 3) / (2 * camera.aspect)) / Math.tan(THREE.MathUtils.degToRad(19));
    camera.position.set(0, distance * 0.96, distance * 0.28);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    // Preserve resting obstacles, but bring them inside the resized walls.
    live.forEach((d) => {
      if (d.rest) {
        d.mesh.position.x = THREE.MathUtils.clamp(d.mesh.position.x, -trayWidth / 2 + 1, trayWidth / 2 - 1);
        d.rest[0] = d.mesh.position.x;
      }
    });
  }
  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(container);

  // Find supporting planes, merge coplanar triangles, and wind each polygon outward.
  function hull(vertices) {
    const faces = [], planes = new Set(), epsilon = 0.00001;
    for (let a = 0; a < vertices.length; a++) for (let b = a + 1; b < vertices.length; b++) for (let c = b + 1; c < vertices.length; c++) {
      const normal = vertices[b].clone().sub(vertices[a]).cross(vertices[c].clone().sub(vertices[a]));
      if (normal.length() < epsilon) continue;
      normal.normalize();
      let distance = normal.dot(vertices[a]);
      const sides = vertices.map((v) => normal.dot(v) - distance);
      if (sides.some((s) => s > epsilon) && sides.some((s) => s < -epsilon)) continue;
      if (distance < 0) { normal.negate(); distance = -distance; }
      const indices = vertices.map((v, i) => Math.abs(normal.dot(v) - distance) < epsilon ? i : -1).filter((i) => i >= 0);
      const key = indices.join(',');
      if (planes.has(key)) continue;
      planes.add(key);
      const center = normal.clone().multiplyScalar(distance);
      const up = vertices[indices[0]].clone().sub(center).normalize();
      const right = up.clone().cross(normal).normalize();
      indices.sort((i, j) => Math.atan2(vertices[i].clone().sub(center).dot(up), vertices[i].clone().sub(center).dot(right)) - Math.atan2(vertices[j].clone().sub(center).dot(up), vertices[j].clone().sub(center).dot(right)));
      faces.push({ indices, normal, center, up, right, distance });
    }
    return { vertices, faces };
  }
  function solid(s) {
    if (solids.has(s)) return solids.get(s);
    let vertices = [];
    if (s === 10) {
      // The dual of a regular pentagonal antiprism is a pentagonal trapezohedron.
      const anti = [];
      const h = Math.sqrt((Math.cos(Math.PI / 5) - Math.cos(2 * Math.PI / 5)) / 2);
      for (let i = 0; i < 10; i++) anti.push(new THREE.Vector3(Math.cos(i * Math.PI / 5), i % 2 ? h : -h, Math.sin(i * Math.PI / 5)));
      vertices = hull(anti).faces.map((f) => f.normal.clone().divideScalar(f.distance));
      const radius = Math.max(...vertices.map((v) => v.length()));
      vertices.forEach((v) => v.multiplyScalar(0.95 / radius));
    } else {
      const constructors = { 4: 'TetrahedronGeometry', 6: 'BoxGeometry', 8: 'OctahedronGeometry', 12: 'DodecahedronGeometry', 20: 'IcosahedronGeometry' };
      const source = s === 6 ? new THREE.BoxGeometry(1.35, 1.35, 1.35) : new THREE[constructors[s]](0.95, 0);
      const p = source.attributes.position, seen = new Set();
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        const key = v.toArray().map((x) => x.toFixed(5)).join(',');
        if (!seen.has(key)) { vertices.push(v); seen.add(key); }
      }
      source.dispose();
    }
    const data = hull(vertices), positions = [], uvs = [];
    const geometry = new THREE.BufferGeometry();
    data.faces.forEach((face, index) => {
      const extent = Math.max(...face.indices.map((i) => vertices[i].distanceTo(face.center)));
      const start = positions.length / 3;
      for (let j = 1; j < face.indices.length - 1; j++) for (const i of [face.indices[0], face.indices[j], face.indices[j + 1]]) {
        const v = vertices[i], offset = v.clone().sub(face.center);
        positions.push(v.x, v.y, v.z);
        uvs.push(0.5 + offset.dot(face.right) / (extent * 2.1), 0.5 + offset.dot(face.up) / (extent * 2.1));
      }
      geometry.addGroup(start, positions.length / 3 - start, index);
      face.opp = data.faces.findIndex((other) => other.normal.dot(face.normal) < -0.9999);
    });
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    data.geometry = geometry;
    data.edges = new THREE.EdgesGeometry(geometry);
    solids.set(s, data);
    return data;
  }
  function shape(data) {
    return new CANNON.ConvexPolyhedron(data.vertices.map((v) => new CANNON.Vec3(v.x, v.y, v.z)), data.faces.map((f) => f.indices.slice()));
  }
  function texture(value, color) {
    const key = `${value}|${color}`;
    if (textures.has(key)) return textures.get(key);
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#8b1e2b';
    ctx.fillStyle = color || '#8b1e2b';
    ctx.fillRect(0, 0, 256, 256);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 76px Georgia, serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#251b18';
    ctx.strokeText(String(value), 128, 132);
    ctx.fillStyle = '#fff1d4';
    ctx.fillText(String(value), 128, 132);
    if (value === 6 || value === 9) ctx.fillRect(110, 174, 36, 5);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    textures.set(key, tex);
    return tex;
  }
  function world() {
    const w = new CANNON.World();
    w.gravity.set(0, -30, 0);
    w.broadphase = new CANNON.NaiveBroadphase();
    w.solver.iterations = 12;
    w.defaultContactMaterial.friction = 0.32;
    w.defaultContactMaterial.restitution = 0.35;
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    w.addBody(ground);
    for (const [x, z, a, b] of [[0, -6, trayWidth + 2, 1], [0, 6, trayWidth + 2, 1], [-trayWidth / 2 - 0.5, 0, 1, 11], [trayWidth / 2 + 0.5, 0, 1, 11]]) {
      const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(a / 2, 12, b / 2)) });
      wall.position.set(x, 12, z);
      w.addBody(wall);
    }
    live.forEach((d) => {
      const body = new CANNON.Body({ mass: 0, shape: shape(d.data) });
      body.position.copy(d.mesh.position);
      body.quaternion.copy(d.mesh.quaternion);
      w.addBody(body);
    });
    return w;
  }
  function simulate(specs) {
    const w = world();
    const bodies = specs.map((spec, i) => {
      const body = new CANNON.Body({ mass: 1, shape: shape(spec.data), linearDamping: 0.25, angularDamping: 0.3 });
      body.position.set((Math.random() - 0.5) * (trayWidth - 2), 3 + i * 0.22, (Math.random() - 0.5) * 7);
      body.quaternion.setFromEuler(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      body.velocity.set((Math.random() - 0.5) * 7, 2, (Math.random() - 0.5) * 10);
      body.angularVelocity.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
      w.addBody(body);
      return body;
    });
    const frames = bodies.map(() => []);
    let calm = 0;
    for (let i = 0; i < 480; i++) {
      w.step(step);
      bodies.forEach((b, j) => frames[j].push([b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]));
      calm = bodies.every((b) => b.velocity.length() < 0.08 && b.angularVelocity.length() < 0.08) ? calm + 1 : 0;
      if (calm > 20) break;
    }
    return frames;
  }
  function launch(groups) {
    const specs = [], records = [];
    for (const g of groups) {
      const record = { g, dice: [] };
      records.push(record);
      for (const x of g.dice || []) {
        if (!x || specs.length >= 12) continue;
        const s = Number(x.s ?? 20), v = Number(x.v);
        if (![4, 6, 8, 10, 12, 20, 100].includes(s) || !Number.isInteger(v) || v < 1 || v > s) continue;
        // Percentiles use two d10s; 00 + 0 is the conventional representation of 100.
        const values = s === 100 ? [{ v: Math.floor((v % 100) / 10), tens: true }, { v: v % 10 }] : [{ v }];
        if (specs.length + values.length > 12) continue;
        values.forEach((value) => specs.push({ ...value, s: s === 100 ? 10 : s, zero: s === 100, drop: x.drop, record, data: solid(s === 100 ? 10 : s) }));
      }
    }
    const tracks = simulate(specs);
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    const batch = { remaining: specs.length, resolve, records };
    specs.forEach((spec, i) => {
      const frames = tracks[i], end = frames[frames.length - 1];
      const q = new THREE.Quaternion(...end.slice(3));
      const faces = spec.data.faces;
      let top = 0;
      faces.forEach((f, j) => { if (f.normal.clone().applyQuaternion(q).y > faces[top].normal.clone().applyQuaternion(q).y) top = j; });
      // A tetrahedron rests vertex-up: label all visible faces with the result.
      // Other dice keep opposite face sums wherever a parallel opposite exists.
      const numbers = new Array(faces.length).fill(null);
      let next = spec.zero ? 0 : 1;
      faces.forEach((f, j) => {
        if (numbers[j] !== null) return;
        numbers[j] = next++;
        if (f.opp >= 0) numbers[f.opp] = (spec.zero ? 9 : spec.s + 1) - numbers[j];
      });
      const at = numbers.indexOf(spec.v);
      if (at >= 0) {
        [numbers[top], numbers[at]] = [numbers[at], numbers[top]];
        const a = faces[top].opp, b = faces[at].opp;
        if (a >= 0 && b >= 0 && at !== a) [numbers[a], numbers[b]] = [numbers[b], numbers[a]];
      }
      if (spec.s === 4) numbers.fill(spec.v);
      const materials = numbers.map((n) => new THREE.MeshStandardMaterial({ map: texture(spec.tens ? String(n * 10).padStart(2, '0') : n, spec.drop ? '#60636b' : spec.record.g.color), roughness: 0.4, metalness: 0.08, transparent: true, opacity: spec.drop ? 0.5 : 1 }));
      const mesh = new THREE.Mesh(spec.data.geometry, materials);
      mesh.castShadow = true;
      const edges = new THREE.LineSegments(spec.data.edges, new THREE.LineBasicMaterial({ color: 0xe2cfa8, transparent: true, opacity: spec.drop ? 0.2 : 0.45 }));
      mesh.add(edges);
      scene.add(mesh);
      // Correct a rare cocked landing and turn the upper inscription toward the reader.
      const finalQ = q.clone();
      if (spec.s !== 4) finalQ.premultiply(new THREE.Quaternion().setFromUnitVectors(faces[top].normal.clone().applyQuaternion(q), Y));
      const up = faces[top].up.clone().applyQuaternion(finalQ);
      finalQ.premultiply(new THREE.Quaternion().setFromAxisAngle(Y, Math.PI - Math.atan2(up.x, up.z)));
      const minY = Math.min(...spec.data.vertices.map((v) => v.clone().applyQuaternion(finalQ).y));
      const d = { mesh, edges, data: spec.data, frames, finalQ, end: [end[0], Math.max(-minY, end[1]), end[2]], elapsed: 0, rest: null, batch };
      live.push(d);
      spec.record.dice.push(d);
      applyFrame(d, 0);
    });
    if (!specs.length) { showTags(batch); resolve(); }
    return promise;
  }
  function showTags(batch) {
    batch.records.forEach(({ g, dice }) => {
      const tag = document.createElement('div');
      tag.className = 'd3-tag in';
      for (const [className, value] of [['who', g.label], ['num', g.total], ['how', g.sub]]) {
        if (value == null || value === '') continue;
        const line = document.createElement('div');
        line.className = className + (className === 'num' && ['ok', 'bad', 'crit'].includes(g.cls) ? ` ${g.cls}` : '');
        line.textContent = String(value);
        tag.appendChild(line);
      }
      layer.appendChild(tag);
      tags.push({ tag, dice });
    });
  }
  function applyFrame(d, time) {
    const frames = d.frames, fi = Math.min(frames.length - 1, time / step), a = frames[Math.floor(fi)], b = frames[Math.min(frames.length - 1, Math.floor(fi) + 1)];
    const t = fi % 1;
    d.mesh.position.set(a[0], a[1], a[2]).lerp(new THREE.Vector3(...b.slice(0, 3)), t);
    d.mesh.quaternion.set(...a.slice(3)).slerp(new THREE.Quaternion(...b.slice(3)), t);
    const finish = Math.max(0, Math.min(1, (time - (frames.length - 1) * step + 0.45) / 0.45));
    const ease = finish * finish * (3 - 2 * finish);
    d.mesh.quaternion.slerp(d.finalQ, ease);
    d.mesh.position.lerp(new THREE.Vector3(...d.end), ease);
  }
  function throwGroup(groups) {
    const token = generation;
    const task = queue.then(() => {
      if (destroyed || token !== generation) return;
      return launch(Array.isArray(groups) ? groups : []);
    });
    queue = task.catch(() => {});
    return task;
  }
  function clear() {
    generation++;
    const batches = new Set(live.map((d) => d.batch));
    live.forEach((d) => {
      scene.remove(d.mesh);
      d.mesh.material.forEach((m) => m.dispose());
      d.edges.material.dispose();
    });
    live.length = 0;
    tags.forEach(({ tag }) => tag.remove());
    tags.length = 0;
    batches.forEach((batch) => batch.resolve());
    textures.forEach((t) => t.dispose());
    textures.clear();
  }
  let previous = performance.now(), raf;
  const projected = new THREE.Vector3();
  function loop(now) {
    if (destroyed) return;
    const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000));
    previous = now;
    live.forEach((d) => {
      if (d.rest) return;
      d.elapsed = motion.matches ? d.frames.length * step : d.elapsed + dt;
      applyFrame(d, d.elapsed);
      if (d.elapsed >= (d.frames.length - 1) * step) {
        d.rest = [...d.mesh.position.toArray(), ...d.mesh.quaternion.toArray()];
        if (--d.batch.remaining === 0) { showTags(d.batch); d.batch.resolve(); }
      }
    });
    tags.forEach(({ tag, dice }) => {
      projected.set(0, 0, 0);
      dice.forEach((d) => projected.add(d.mesh.position));
      if (dice.length) projected.divideScalar(dice.length);
      projected.y += 1.25;
      projected.project(camera);
      tag.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
      tag.style.top = `${(-projected.y * 0.5 + 0.5) * height}px`;
    });
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    clear();
    solids.forEach((data) => { data.geometry.dispose(); data.edges.dispose(); });
    floor.geometry.dispose();
    floor.material.dispose();
    sun.shadow.map?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    layer.remove();
  }
  return { throwGroup, clear, destroy };
}
