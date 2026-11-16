// The three.js side of the creator: renders a built character, handles camera views, blinking, snapshots.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { hash, shade, mix } from './voxels.js';

const S = 0.1;                                   // world units per voxel
const BG = 0x0c1218;

export function createView(stage, { reduceMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG); scene.fog = new THREE.Fog(BG, 16, 34);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  // ---- floor
  const tex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      const v = 34 + Math.floor(hash(tx, ty, 3) * 14); g.fillStyle = `rgb(${v},${v + 4},${v + 12})`; g.fillRect(tx * 64, ty * 64, 64, 64);
      for (let i = 0; i < 30; i++) { const a = Math.floor(hash(tx, ty, i) * 60), b = Math.floor(hash(ty, tx, i + 9) * 60), w = 3 + Math.floor(hash(i, tx, ty) * 6); g.fillStyle = `rgba(255,255,255,${0.02 + hash(i, ty, tx) * 0.03})`; g.fillRect(tx * 64 + a, ty * 64 + b, w, w); }
    }
    g.strokeStyle = '#0d1016'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 7); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.5 * S; floor.receiveShadow = true; scene.add(floor);

  // ---- lights: warm key with shadows, soft front fill, cool rim, cyan staff light
  const hemi = new THREE.HemisphereLight(0xc4d6ff, 0x30283a, 1.25); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffe0b0, 2.6); key.position.set(3.5, 9, 9); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 9, bottom: -2, near: 1, far: 30 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025; scene.add(key);
  const fill = new THREE.DirectionalLight(0xbdd0ff, 0.8); fill.position.set(-5, 3, 9); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x7a9dff, 1.1); rim.position.set(-6, 5, -6); scene.add(rim);
  const orbLight = new THREE.PointLight(0x5be7ff, 14, 9, 2); orbLight.visible = false; scene.add(orbLight);
  const sprTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,.95)'); r.addColorStop(0.25, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); halo.visible = false; scene.add(halo);
  const motes = Array.from({ length: 16 }, (_, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.userData = { a: i * 2.4, r: 0.35 + (i % 4) * 0.1, s: 0.5 + (i % 5) * 0.12, h: (i * 0.37) % 1 }; m.visible = false; scene.add(m); return m; });

  // ---- cozy diorama: a small grass island with flowers and stones, under a sunny sky (the sky is CSS behind the transparent canvas)
  const island = new THREE.Group(); island.visible = false; scene.add(island);
  {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const greens = ['#86d66a', '#7acb60', '#8fdc72', '#74c25c'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = greens[Math.floor(hash(x, y, 5) * greens.length)]; g.fillRect(x * 8, y * 8, 8, 8); }
    for (let i = 0; i < 40; i++) { g.fillStyle = hash(i, 1, 2) > 0.5 ? '#a6e88a' : '#62b04e'; g.fillRect(Math.floor(hash(i, 2, 3) * 15) * 8 + 2, Math.floor(hash(i, 3, 4) * 15) * 8 + 2, 4, 4); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    const top = new THREE.MeshStandardMaterial({ map: t, roughness: 1 }), dirt = new THREE.MeshStandardMaterial({ color: 0xb9854f, roughness: 1 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.2, 0.6, 48), [dirt, top, dirt]); base.position.y = -0.05 - 0.3; base.receiveShadow = true; island.add(base);
    const flowers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 46), m4 = new THREE.Matrix4(), col = new THREE.Color();
    const petals = ['#ffffff', '#ffd84a', '#ff9eb8', '#b9d8ff', '#ffb36b'];
    for (let i = 0; i < 46; i++) { const a = hash(i, 7, 1) * Math.PI * 2, r = 1.9 + hash(i, 8, 2) * 1.8; m4.makeTranslation(Math.cos(a) * r, -0.05 + 0.05, Math.sin(a) * r); flowers.setMatrixAt(i, m4); flowers.setColorAt(i, col.set(petals[i % petals.length])); }
    island.add(flowers);
    for (let i = 0; i < 6; i++) { const a = hash(i, 3, 9) * Math.PI * 2, r = 2.6 + hash(i, 4, 9) * 1.1, s2 = 0.18 + hash(i, 5, 9) * 0.16; const rock = new THREE.Mesh(new THREE.BoxGeometry(s2 * 1.4, s2, s2 * 1.1), new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 1 })); rock.position.set(Math.cos(a) * r, -0.05 + s2 / 2, Math.sin(a) * r); rock.rotation.y = a; rock.castShadow = rock.receiveShadow = true; island.add(rock); }
  }
  let look = 'classic';
  function setLook(next) {
    if (next === look) return; look = next; const cozy = look === 'cozy';
    scene.background = cozy ? null : new THREE.Color(BG); scene.fog = cozy ? null : new THREE.Fog(BG, 16, 34); renderer.setClearColor(0x000000, 0);
    floor.visible = !cozy; island.visible = cozy;
    hemi.color.set(cozy ? 0xe4f4ff : 0xc4d6ff); hemi.groundColor.set(cozy ? 0xa9d58c : 0x30283a); hemi.intensity = cozy ? 1.7 : 1.25;
    key.color.set(cozy ? 0xfff0d0 : 0xffe0b0); key.intensity = cozy ? 2.3 : 2.6; fill.intensity = cozy ? 0.55 : 0.8; rim.intensity = cozy ? 0.35 : 1.1; renderer.toneMappingExposure = cozy ? 1.12 : 1.05;
  }
  const tone = (c) => (look === 'cozy' ? mix(c, '#fff6e4', 0.1) : c);         // cozy colours sit a little softer and warmer
  let hopAt = -1e9, first = true;

  const clock = new THREE.Clock();

  // ---- the character
  const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 }), glowMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const mage = new THREE.Group(); mage.position.set(0.5 * S, 0, 0.5 * S); scene.add(mage);
  let body = null, glow = null, eyeIdx = [], eyeOrig = [], orb = null, info = { height: 7, headY0: 34, count: 0 };

  function setCharacter({ voxels, meta }) {
    setLook(meta.look || 'classic');
    if (body) { mage.remove(body); body.dispose(); } if (glow) { mage.remove(glow); glow.dispose(); }
    const has = (x, y, z) => voxels.has(x + ',' + y + ',' + z), vis = [], glo = [];
    for (const [k, v] of voxels) {
      const [x, y, z] = k.split(',').map(Number);
      if (!(has(x + 1, y, z) && has(x - 1, y, z) && has(x, y + 1, z) && has(x, y - 1, z) && has(x, y, z + 1) && has(x, y, z - 1))) (v.glow ? glo : vis).push({ x, y, z, ...v });
    }
    body = new THREE.InstancedMesh(cubeGeo, bodyMat, Math.max(1, vis.length)); glow = new THREE.InstancedMesh(cubeGeo, glowMat, Math.max(1, glo.length));
    const m4 = new THREE.Matrix4(), col = new THREE.Color(), SC = 0.985;
    eyeIdx = []; eyeOrig = [];
    vis.forEach((v, i) => { m4.makeScale(SC, SC, SC).setPosition(v.x, v.y, v.z); body.setMatrixAt(i, m4); body.setColorAt(i, col.set(shade(tone(v.c), 1 + (hash(v.x, v.y, v.z) - 0.5) * 0.07))); if (v.tag === 'eye') { eyeIdx.push(i); eyeOrig.push(col.clone()); } });
    glo.forEach((v, i) => { m4.makeScale(SC, SC, SC).setPosition(v.x, v.y, v.z); glow.setMatrixAt(i, m4); glow.setColorAt(i, col.set(v.c)); });
    if (!vis.length) body.count = 0; if (!glo.length) glow.count = 0;
    body.castShadow = body.receiveShadow = true;
    const grp = new THREE.Group(); grp.scale.setScalar(S); grp.add(body, glow); mage.clear(); mage.add(grp);
    body = body; info = { height: meta.height * S, headY0: meta.headY0, count: vis.length + glo.length };
    orb = meta.orb ? new THREE.Vector3(meta.orb.x * S + 0.5 * S, meta.orb.y * S, meta.orb.z * S + 0.5 * S) : null;
    const on = !!orb; orbLight.visible = halo.visible = on; motes.forEach((m) => { m.visible = on; });
    if (on) { const c = new THREE.Color(meta.orb.color); orbLight.color.copy(c); halo.material.color.copy(c); motes.forEach((m) => m.material.color.copy(c).lerp(new THREE.Color(0xffffff), 0.4)); orbLight.position.copy(orb); halo.position.copy(orb); }
    resize();
    if (!first) hopAt = clock.getElapsedTime(); first = false;
    return info;
  }

  // ---- camera and views (distances scale with the character's height so every race frames well)
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false; controls.minDistance = 1.6; controls.maxDistance = 26;
  controls.maxPolarAngle = Math.PI / 2 - 0.03; controls.autoRotateSpeed = 1.1;
  const spec = (name) => {
    const h = Math.max(4.2, info.height), head = (info.headY0 + 8) * S, mid = Math.min(h * 0.47, 3.7), d = Math.max(9.5, h * 2.05);
    return {
      front: [[0, mid + 0.8, d], [0, mid, 0]], three: [[-d * 0.56, mid + 2.4, d * 0.8], [0, mid, 0]], side: [[d, mid + 0.8, 0.4], [0, mid, 0]], back: [[0, mid + 1.2, -d], [0, mid, 0]],
      face: [[-2.6, head + 0.35, 8.4], [0, head, 0.6]], bust: [[0, head + 0.1, 6.6], [0, head - 0.15, 0.5]],
    }[name];
  };
  let tween = null, current = 'three';
  const reduce = reduceMotion;
  function goView(name, instant) {
    current = name; const [p, t] = spec(name);
    if (instant || reduce) { tween = null; camera.position.set(...p); controls.target.set(...t); controls.update(); return; }
    tween = { t0: performance.now(), d: 700, p0: camera.position.clone(), q0: controls.target.clone(), p1: new THREE.Vector3(...p), q1: new THREE.Vector3(...t) };
  }
  function resize() {
    const w = stage.clientWidth || window.innerWidth, h = stage.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1 ? 46 : 32; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); resize();

  // ---- loop
  const lid = new THREE.Color('#a8765a'); let blinkAt = 2.5, blinkUntil = 0, frozen = false;
  const setEyes = (closed) => { if (!body || !body.instanceColor) return; eyeIdx.forEach((i, k) => body.setColorAt(i, closed ? lid : eyeOrig[k])); body.instanceColor.needsUpdate = true; };
  (function frame() {
    requestAnimationFrame(frame);
    const t = frozen ? 0 : clock.getElapsedTime();
    if (tween) { const k = Math.min(1, (performance.now() - tween.t0) / tween.d), e = k * k * (3 - 2 * k); camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.q0, tween.q1, e); if (k >= 1) tween = null; }
    if (!reduce && !frozen) {
      const hop = Math.max(0, 1 - (t - hopAt) / 0.5), hopY = hop > 0 ? Math.sin((1 - hop) * Math.PI) * 0.28 : 0;
      if (look === 'cozy') { mage.position.y = Math.abs(Math.sin(t * 2.2)) * 0.03 + hopY; mage.rotation.z = Math.sin(t * 1.1) * 0.025; mage.scale.y = 1 + Math.sin(t * 4.4) * 0.012; }
      else { mage.position.y = Math.sin(t * 1.7) * 0.012; mage.rotation.z = 0; mage.scale.y = 1; }
      if (orb) {
        const pulse = 1 + Math.sin(t * 3.1) * 0.08 + Math.sin(t * 7.3) * 0.03;
        orbLight.intensity = 14 * pulse; halo.scale.setScalar(1.7 * pulse); halo.position.y = orb.y + mage.position.y; orbLight.position.y = halo.position.y;
        motes.forEach((m) => { const u = m.userData, a = u.a + t * u.s, h = (u.h + t * 0.08 * u.s) % 1; m.position.set(orb.x + Math.cos(a) * u.r, orb.y - 0.3 + h, orb.z + Math.sin(a) * u.r); m.scale.setScalar(1 - Math.abs(h - 0.5) * 1.4); });
      }
      if (t > blinkAt) { setEyes(true); blinkUntil = t + 0.13; blinkAt = t + 2.8 + Math.random() * 3; }
      if (blinkUntil && t > blinkUntil) { setEyes(false); blinkUntil = 0; }
    }
    controls.update(); renderer.render(scene, camera);
  })();

  /** Render the current character as a square PNG token on a transparent background (bust framing). */
  function snapshot({ size = 512, view = 'bust' } = {}) {
    const keep = { w: stage.clientWidth, h: stage.clientHeight, pr: renderer.getPixelRatio(), pos: camera.position.clone(), tgt: controls.target.clone(), bg: scene.background, fog: scene.fog, aspect: camera.aspect, fov: camera.fov };
    const [p, t] = spec(view);
    renderer.setPixelRatio(1); renderer.setSize(size, size, false); camera.aspect = 1; camera.fov = view === 'bust' ? 26 : 32; camera.position.set(...p); camera.lookAt(new THREE.Vector3(...t)); camera.updateProjectionMatrix();
    keep.floor = floor.visible; keep.island = island.visible; scene.background = null; scene.fog = null; floor.visible = false; island.visible = false; renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    return new Promise((res) => renderer.domElement.toBlob((b) => {
      scene.background = keep.bg; scene.fog = keep.fog; floor.visible = keep.floor; island.visible = keep.island; renderer.setPixelRatio(keep.pr); camera.fov = keep.fov; camera.aspect = keep.aspect;
      camera.position.copy(keep.pos); controls.target.copy(keep.tgt); resize(); res(b);
    }, 'image/png'));
  }

  return {
    setCharacter, goView, resize, snapshot, get view() { return current; },
    spin: (on) => { controls.autoRotate = !!on; }, get spinning() { return controls.autoRotate; },
    freeze: () => { frozen = true; mage.position.y = 0; mage.rotation.z = 0; mage.scale.y = 1; }, renderer, camera, controls,
  };
}
