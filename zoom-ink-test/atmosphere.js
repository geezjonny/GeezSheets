// Sky, light and weather. One look per weather (clear, overcast, rain, storm, snow, fog): sky gradient,
// sun and ambient light, haze. Rain and snow are drawn around the view, animated on the GPU (no per-frame
// CPU work), sized to the zoom so they read at a battlemap and at a town. The GM sets the weather; it is
// stored in the world (data.weather) so players see it too.
import * as THREE from 'three';
import { WX, MAT } from './style.js';
import { timeOf, onTime, setTime, advance } from './clock.js';
import { T } from './world.js';
import { hash } from './noise.js';

export const WEATHERS = {
  clear:    { label: 'Clear',    icon: '☀', top: '#56718a', hor: '#aab3b6', sun: 2.1, sunCol: '#ffd2a0', hemi: 1.7, sky: '#c4ccd2', gnd: '#4a3f33', fog: 1,   glow: .55, exp: 1.24 },
  overcast: { label: 'Overcast', icon: '☁', top: '#6f7980', hor: '#9da3a5', sun: .75, sunCol: '#e6dccd', hemi: 1.75, sky: '#b8bec2', gnd: '#4a4339', fog: .7,  glow: .05, exp: 1.26 },
  rain:     { label: 'Rain',     icon: '🌧', top: '#525b62', hor: '#7f878a', sun: .45, sunCol: '#d8d6d0', hemi: 1.55, sky: '#a3abb0', gnd: '#3f3a33', fog: .45, glow: 0,   exp: 1.21, rain: 1 },
  storm:    { label: 'Storm',    icon: '⛈', top: '#2f353b', hor: '#5a6164', sun: .25, sunCol: '#c7cad0', hemi: 1.2,  sky: '#8a939a', gnd: '#35312c', fog: .35, glow: 0,   exp: 1.16, rain: 2, lightning: true },
  snow:     { label: 'Snow',     icon: '❄', top: '#8a949b', hor: '#bfc5c8', sun: .8,  sunCol: '#eef0f2', hemi: 1.8,  sky: '#d4dade', gnd: '#6a6862', fog: .5,  glow: .05, exp: 1.21, snow: 1 },
  fog:      { label: 'Fog',      icon: '🌫', top: '#8f989c', hor: '#a3aaad', sun: .55, sunCol: '#e8e2d6', hemi: 1.7,  sky: '#bcc2c5', gnd: '#4d4840', fog: .12, glow: 0,   exp: 1.21 },
};
for(const W of Object.values(WEATHERS)){W.top='#927652';W.hor='#bfa27b';W.sky='#ccb58f';W.gnd='#8e7250';W.sunCol='#ead2aa';W.exp=1;W.glow*=.25;}
const KEYS = ['top', 'hor', 'sunCol', 'sky', 'gnd'], NUMS = ['sun', 'hemi', 'fog', 'glow', 'exp', 'rain', 'snow'];
const SUN_DIR = new THREE.Vector3(-.8, .58, .55).normalize();
const CLOUD = { overcast: '#a7adb1', rain: '#7f868c', storm: '#454a4f', snow: '#e4e7ea', fog: '#c6cacc' };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const fmtKm = m => m >= 1609 ? `${(m / 1609).toFixed(m >= 16090 ? 0 : 1)} mi` : `${Math.round(m)} m`;

const skyVert = `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const skyFrag = `uniform vec3 uTop, uHor, uSun; uniform float uGlow, uFlash, uStars; uniform vec3 uSunDir; varying vec3 vW;
void main() {
  vec3 d = normalize(vW - cameraPosition); float h = d.y;
  vec3 c = mix(uHor, uTop, smoothstep(0.0, 0.55, h));
  float s = max(dot(d, uSunDir), 0.0); c += uSun * (pow(s, 48.0) * 0.6 + pow(s, 6.0) * 0.18) * uGlow;
  c += vec3(0.75, 0.8, 0.9) * uFlash * (0.4 + 0.6 * smoothstep(-0.1, 0.6, h));
  vec2 uv = vec2(atan(d.z, d.x), asin(d.y)) * 100.0;
  vec2 cell = floor(uv); float rnd = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float star = (1.0 - smoothstep(.04, .14, length(fract(uv) - .5))) * step(.985, rnd);
  c += vec3(star * uStars * smoothstep(.05, .3, h));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
// precipitation: each particle wraps inside a box that follows the view (world-anchored, so panning
// doesn't drag the rain along). Rain is a streak (two vertices), snow a point.
const precipVert = `attribute vec3 seed; attribute float tip; uniform vec3 uC; uniform float uB, uT, uSpeed, uLen, uWind, uSnow, uPx;
varying float vA;
void main() {
  vec3 v = vec3(uWind, -uSpeed, uWind * 0.35);
  vec3 o = seed * uB + v * uT;
  if (uSnow > 0.5) o.xz += vec2(sin(uT * 0.9 + seed.y * 40.0), cos(uT * 0.7 + seed.x * 40.0)) * uB * 0.01;
  vec3 p = uC + mod(o - uC, uB) - uB * 0.5; p.y += uB * 0.2;
  if (uSnow < 0.5) p -= normalize(v) * uLen * tip;
  vA = 1.0 - smoothstep(0.3, 0.5, length((p - uC) / uB));
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = uSnow > 0.5 ? clamp(uPx * 0.12 / -mv.z * uB / 60.0, 1.5, 7.0) : 1.0;
}`;
const precipFrag = `uniform vec3 uCol; uniform float uAlpha, uSnow; varying float vA;
void main() { if (uSnow > 0.5 && length(gl_PointCoord - 0.5) > 0.5) discard; gl_FragColor = vec4(uCol, uAlpha * vA); }`;

export class Atmosphere {
  constructor(app, { scene, renderer, sun, hemi }) {
    this.app = app; this.scene = scene; this.renderer = renderer; this.sun = sun; this.hemi = hemi;
    sun.position.copy(SUN_DIR).multiplyScalar(1000);
    renderer.toneMapping = THREE.NoToneMapping;
    this.cur = this.target(WEATHERS.clear); this.kind = 'clear'; this.lastFronts = null; this.flash = 0; this.nextBolt = 0; this.t0 = performance.now();
    this.fogCol = new THREE.Color();
    // sky dome around the camera
    this.skyU = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uGlow: { value: 0 }, uFlash: { value: 0 }, uStars: { value: 0 }, uSunDir: { value: SUN_DIR.clone() } };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }));
    this.sky.renderOrder = -10; this.sky.frustumCulled = false; scene.add(this.sky); scene.background = null;
    this.rain = this.precip(false); this.snow = this.precip(true);
    this.clouds = new THREE.Group(); scene.add(this.clouds); this.cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: .7, depthWrite: false });
    this.arm = null; this.sel = null; this.climate = { x: 1e9, z: 1e9, kind: 'clear', w: 0 };
    this.apply(); this.ui(); this.buildClouds();
    onTime(() => { this.sync(); app.request(); });
  }
  // ☁ in the top bar (GM): the weather everywhere (Auto = from the land), and weather fronts
  ui() {
    const top = document.getElementById('top');
    this.btn = document.createElement('button'); this.btn.id = 'wxBtn'; this.btn.title = 'Weather'; this.btn.setAttribute('aria-label', 'Weather');
    this.pop = document.createElement('div'); this.pop.id = 'wxPop'; this.pop.className = 'panel'; this.pop.hidden = true;
    this.pop.addEventListener('pointerdown', e => e.stopPropagation()); this.pop.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
    this.btn.onclick = () => { this.pop.hidden = !this.pop.hidden; this.sync(); };
    top.insertBefore(this.btn, document.getElementById('rollBtn')?.nextSibling || top.children[1] || null); document.body.append(this.pop);
    this.timeLabel = document.createElement('span'); this.timeLabel.id = 'worldTime'; this.timeLabel.setAttribute('aria-live', 'polite'); this.btn.after(this.timeLabel);
    this.sync();
  }
  get fronts() { const d = this.app.world.data; return d.fronts ||= []; }
  sync() {
    const gm = this.app.role === 'gm';
    const { day, hour } = timeOf(this.app.world);
    this.timeLabel.textContent = `Day ${day}, ${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
    this.btn.hidden = !gm; if (!gm) { this.pop.hidden = true; this.arm = null; }
    this.btn.textContent = WEATHERS[this.kind]?.icon || '☁';
    if (!this.pop.hidden) this.renderPop();
  }
  renderPop() {
    const P = this.pop, mode = this.mode, el = (tag, cls, txt, on) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (on) e.onclick = on; return e; };
    P.replaceChildren();
    if (this.app.role !== 'gm') return;
    P.append(el('div', 'wxh', 'Time'));
    const times = el('div', 'wxrow'); P.append(times);
    for (const [name, hour] of [['Dawn', 6], ['Day', 12], ['Dusk', 19], ['Night', 22]]) {
      const b = el('button', 'chip', name, () => this.changeTime({ hour })); b.dataset.hour = hour; times.append(b);
    }
    for (const [label, hours] of [['+1 hour', 1], ['+8 hours (rest)', 8]]) times.append(el('button', 'chip', label, () => { if (this.app.role === 'gm') advance(this.app, hours); }));
    P.append(el('div', 'wxh', 'Everywhere'));
    const row = el('div', 'wxrow'); P.append(row);
    const auto = el('button', 'chip' + (mode === 'auto' ? ' on' : ''), '🌍 Auto', () => this.set('auto')); auto.dataset.k = 'auto'; auto.title = 'Weather from the land: snow on snowfields and peaks, mist over marshes'; row.append(auto);
    for (const [k, W] of Object.entries(WEATHERS)) { const b = el('button', 'chip' + (mode === k ? ' on' : ''), `${W.icon} ${W.label}`, () => this.set(k)); b.dataset.k = k; row.append(b); }
    P.append(el('div', 'wxh', this.arm ? `Tap the map to place the ${WEATHERS[this.arm].label.toLowerCase()}` : 'Add a front (then tap the map)'));
    const add = el('div', 'wxrow'); P.append(add);
    for (const k of ['rain', 'storm', 'snow', 'fog', 'overcast']) { const W = WEATHERS[k], b = el('button', 'chip' + (this.arm === k ? ' on' : ''), `${W.icon} ${W.label}`, () => { this.arm = this.arm === k ? null : k; this.renderPop(); }); b.dataset.front = k; add.append(b); }
    if (this.fronts.length) P.append(el('div', 'wxh', 'Fronts'));
    for (const f of this.fronts) {
      const r = el('div', 'wxrow wxfront' + (this.sel === f.id ? ' sel' : '')); r.dataset.id = f.id;
      r.append(el('span', 'wxname', `${WEATHERS[f.kind].icon} ${WEATHERS[f.kind].label} · ${fmtKm(f.r * 2)}`),
        el('button', 'chip', '−', () => this.patchFront(f.id, { r: Math.max(150, Math.round(f.r / 1.4)) })),
        el('button', 'chip', '+', () => this.patchFront(f.id, { r: Math.min(20000, Math.round(f.r * 1.4)) })),
        el('button', 'chip', 'Go', () => { this.sel = f.id; this.app.flyTo(f.x, f.z, Math.max(1500, f.r * 2.4), .8); this.renderPop(); }),
        el('button', 'chip', 'Move here', () => { const t = this.app.controls.target; this.patchFront(f.id, { x: Math.round(t.x), z: Math.round(t.z) }); }),
        el('button', 'chip danger', '✕', () => this.removeFront(f.id)));
      P.append(r);
    }
  }
  target(W) { const o = {}; for (const k of KEYS) o[k] = new THREE.Color(W[k]); for (const k of NUMS) o[k] = W[k] || 0; o.lightning = !!W.lightning; return o; }
  changeTime(patch) { if (this.app.role === 'gm') setTime(this.app, patch); }
  // Daylight and twilight remain separate from weather, so a storm also dims a moonlit night.
  timeLook(c) {
    const { hour } = timeOf(this.app.world), day = smooth(5, 7, hour) * (1 - smooth(18, 20, hour));
    const twilight = Math.max(0, 1 - Math.abs(hour - 6), 1 - Math.abs(hour - 19));
    this.night = 1 - day;
    for (const [key, col] of [['top', '#060d20'], ['hor', '#15213a'], ['sky', '#8ca2c9'], ['gnd', '#394056']]) c[key].lerp(new THREE.Color(col), this.night * .96);
    c.hor.lerp(new THREE.Color('#a46143'), twilight * .6); c.top.lerp(new THREE.Color('#454461'), twilight * .3);
    c.sunCol.lerp(new THREE.Color('#ff9655'), twilight * .85).lerp(new THREE.Color('#799edc'), this.night * (1 - twilight));
    c.sun *= .012 + .988 * day; c.hemi *= .025 + .975 * day; c.exp *= .8 + .2 * day; c.glow *= day;
    const angle = (hour - 6) / 12 * Math.PI;
    this.skyU.uSunDir.value.set(-Math.cos(angle), Math.max(.12, Math.sin(angle)), .4).normalize();
    this.sun.position.copy(this.skyU.uSunDir.value).multiplyScalar(1000);
    this.skyU.uStars.value = this.night * (this.kind === 'clear' ? .7 : this.kind === 'overcast' ? .06 : 0);
    return c;
  }
  precip(snow) {
    const n = (this.app.quality?.name === 'low' ? 1 : 2.4) * (snow ? 2600 : 3400) | 0, g = new THREE.BufferGeometry();
    const seed = new Float32Array(n * (snow ? 3 : 6)), tip = new Float32Array(n * (snow ? 1 : 2)), pos = new Float32Array(n * (snow ? 3 : 6));
    for (let k = 0; k < n; k++) {
      const s = [Math.random(), Math.random(), Math.random()];
      if (snow) seed.set(s, k * 3); else { seed.set(s, k * 6); seed.set(s, k * 6 + 3); tip[k * 2 + 1] = 1; }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 3)); g.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
    const u = { uC: { value: new THREE.Vector3() }, uB: { value: 100 }, uT: { value: 0 }, uSpeed: { value: 10 }, uLen: { value: 1 }, uWind: { value: 2 }, uSnow: { value: snow ? 1 : 0 }, uPx: { value: 800 }, uCol: { value: new THREE.Color(snow ? '#f4f6f8' : '#b9c3cb') }, uAlpha: { value: snow ? .9 : .42 } };
    const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: precipVert, fragmentShader: precipFrag, transparent: true, depthWrite: false, fog: false });
    const obj = snow ? new THREE.Points(g, mat) : new THREE.LineSegments(g, mat);
    obj.frustumCulled = false; obj.visible = false; obj.renderOrder = 8; this.scene.add(obj);
    return obj;
  }
  // the weather everywhere (the GM's choice, saved with the world): 'auto' or one weather
  set(kind) { if (kind !== 'auto' && !WEATHERS[kind]) return; this.app.world.data.weather = kind; this.app.save?.(); this.sync(); this.app.request(); }
  get mode() { const k = this.app.world.data.weather; return WEATHERS[k] ? k : 'auto'; }
  // ---------- fronts: soft circles of weather, undoable ----------
  editFronts(fn) { this.fronts; this.app.tools.edit('fronts', fn, () => { this.buildClouds(); this.app.save(); this.sync(); this.app.request(); }); }
  placeAt(g) {
    const kind = this.arm; this.arm = null; if (!kind || !g) return;
    const f = { id: 'wf_' + Math.random().toString(36).slice(2, 8), kind, x: Math.round(g.x), z: Math.round(g.z), r: Math.round(Math.min(8000, Math.max(250, this.app.camDist() * .5))) };
    this.sel = f.id; this.editFronts(l => l.push(f)); this.app.ui.toast(`${WEATHERS[kind].label} placed`);
  }
  patchFront(id, patch) { this.editFronts(l => Object.assign(l.find(f => f.id === id), patch)); }
  removeFront(id) { this.editFronts(l => { const i = l.findIndex(f => f.id === id); if (i >= 0) l.splice(i, 1); }); }
  openFront(id) { this.sel = id; this.pop.hidden = false; this.sync(); }
  // the land's own weather around a point: snow on snowfields and peaks, mist over marshes
  climateAt(x, z) {
    const c = this.climate; if (Math.hypot(c.x - x, c.z - z) < 60) return c;
    const w = this.app.world; let snow = 0, marsh = 0, n = 0;
    for (let k = 0; k < 9; k++) { const a = k * 2.4, d = k ? 180 + (k % 3) * 160 : 0, t = w.typeAt(x + Math.sin(a) * d, z + Math.cos(a) * d); n++; if (t === T.SNOW) snow++; else if (t === T.MOUNTAIN) snow += .45; else if (t === T.MARSH) marsh++; }
    snow /= n; marsh /= n;
    const isSnow = snow >= marsh, w2 = isSnow ? smooth(.3, .7, snow) : smooth(.25, .6, marsh) * .75;
    return this.climate = { x, z, kind: w2 > .01 ? (isSnow ? 'snow' : 'fog') : 'clear', w: w2 };
  }
  // what the weather is at a point: everywhere (or the land's), then the strongest front over it
  weatherAt(x, z) {
    const mode = this.mode, base = mode === 'auto' ? this.climateAt(x, z) : { kind: mode, w: 1 };
    let goal = this.blend(this.target(WEATHERS.clear), this.target(WEATHERS[base.kind]), base.w), top = base.w > .5 ? base.kind : 'clear', best = 0, bf = null;
    for (const f of this.fronts) { const d = Math.hypot(f.x - x, f.z - z), w = 1 - smooth(f.r * .6, f.r, d); if (w > best) { best = w; bf = f; } }
    if (bf) { goal = this.blend(goal, this.target(WEATHERS[bf.kind]), best); if (best > .5) top = bf.kind; }
    return { goal, kind: top };
  }
  blend(A, B, t) {
    if (t <= 0) return A; const o = {};
    for (const k of KEYS) o[k] = A[k].clone().lerp(B[k], t);
    for (const k of NUMS) o[k] = A[k] + (B[k] - A[k]) * t;
    o.lightning = t > .5 ? B.lightning : A.lightning; return o;
  }
  // cloud banks over each front, seen from afar (soft blobs, one mesh for all)
  buildClouds() {
    for (const m of this.clouds.children) m.geometry.dispose(); this.clouds.clear();
    const w = this.app.world, pos = [], col = [], c = new THREE.Color(), blob = new THREE.IcosahedronGeometry(1, 1).toNonIndexed(), bp = blob.attributes.position;
    for (const f of this.fronts) {
      const fog = f.kind === 'fog', n = Math.min(40, 10 + Math.round(f.r / 300)), seed = [...f.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) | 0;
      for (let k = 0; k < n; k++) {
        const a = hash(seed, k, 1) * 6.283, d = Math.sqrt(hash(seed, k, 2)) * f.r * .8, x = f.x + Math.sin(a) * d, z = f.z + Math.cos(a) * d;
        const s = f.r * (.18 + hash(seed, k, 3) * .16), y = Math.max(0, w.height(x, z)) + (fog ? s * .15 : 650 + f.r * .05 + hash(seed, k, 4) * 120);
        c.set(CLOUD[f.kind] || '#cccccc').multiplyScalar(.9 + hash(seed, k, 5) * .2);
        for (let v = 0; v < bp.count; v++) { pos.push(x + bp.getX(v) * s, y + bp.getY(v) * s * (fog ? .12 : .32), z + bp.getZ(v) * s); col.push(c.r, c.g, c.b); }
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.cloudMat); m.renderOrder = 6; m.frustumCulled = false; this.clouds.add(m);
  }
  // is anything moving (so the app keeps drawing)?
  animating(dist) { return this.moving || ((this.cur.rain > .02 || this.cur.snow > .02) && dist < 1400) || this.flash > 0 || this.cur.lightning; }
  apply() {
    const c = this.cur, flash = this.flash;
    this.skyU.uTop.value.copy(c.top); this.skyU.uHor.value.copy(c.hor); this.skyU.uSun.value.copy(c.sunCol); this.skyU.uGlow.value = c.glow; this.skyU.uFlash.value = flash;
    this.sun.color.copy(c.sunCol); this.sun.intensity = c.sun + flash * 1.5;
    this.hemi.color.copy(c.sky); this.hemi.groundColor.copy(c.gnd); this.hemi.intensity = c.hemi + flash * 2.5;
    this.renderer.toneMappingExposure = c.exp;
    for (const m of [MAT.window, MAT.windowCut]) m.emissiveIntensity = (this.night || 0) * 1.8;
    for (const m of [MAT.glow, MAT.glowCut]) m.color.setScalar(1 + (this.night || 0) * .7);
    for (const m of [MAT.halo, MAT.haloCut]) m.opacity = .06 + (this.night || 0) * .12;
    WX.snow.value = Math.min(1, c.snow); WX.wet.value = Math.min(1, c.rain);
    this.fogCol.copy(c.hor); if (this.scene.fog) this.scene.fog.color.copy(this.fogCol);
  }
  // fog distances for this weather: weather haze matters close up, the world view stays readable
  fog(near, far, dist) {
    const t = Math.min(1, Math.max(0, (dist - 1500) / 12000)), f = this.cur.fog + (1 - this.cur.fog) * t;
    return [Math.max(4, near * f * (f < .3 ? .3 : 1)), Math.max(60, far * f)];
  }
  frame(dt, dist, center) {
    if (this.fronts !== this.lastFronts) { this.lastFronts = this.fronts; this.buildClouds(); } // a loaded world or an undo
    // local weather fades as you zoom out: from the world view the map stays readable and the cloud banks show where it rains
    const here = this.weatherAt(center.x, center.z), out = smooth(2500, 9000, dist), goal = this.timeLook(out > 0 ? this.blend(here.goal, this.target(WEATHERS.clear), out * .85) : here.goal);
    const timeKey = JSON.stringify(timeOf(this.app.world));
    if (timeKey !== this.timeKey) { this.timeKey = timeKey; this.sync(); }
    if (this.kind !== here.kind) { this.kind = here.kind; this.sync(); }
    // cloud banks fade in as you zoom out
    this.cloudMat.opacity = .72 * smooth(900, 2600, dist); this.clouds.visible = this.cloudMat.opacity > .01;
    // ease towards the wanted weather over ~2 s
    const a = Math.min(1, dt * 1.6); let moving = false;
    for (const k of KEYS) { const d = Math.abs(this.cur[k].r - goal[k].r) + Math.abs(this.cur[k].g - goal[k].g) + Math.abs(this.cur[k].b - goal[k].b); if (d > .002) { this.cur[k].lerp(goal[k], a); moving = true; } else this.cur[k].copy(goal[k]); }
    for (const k of NUMS) { const d = goal[k] - this.cur[k]; if (Math.abs(d) > .002) { this.cur[k] += d * a; moving = true; } else this.cur[k] = goal[k]; }
    this.cur.lightning = goal.lightning; this.moving = moving;
    // lightning: a double flash every 5-14 s
    const now = performance.now();
    if (this.cur.lightning) {
      if (!this.nextBolt) this.nextBolt = now + 3000 + Math.random() * 6000;
      if (now > this.nextBolt) { this.bolt = now; this.nextBolt = now + 5000 + Math.random() * 9000; }
      const e = now - (this.bolt || -1e9); this.flash = e < 90 ? 1 : e < 170 ? .15 : e < 260 ? .75 : e < 600 ? .75 * (1 - (e - 260) / 340) : 0;
    } else this.flash = 0;
    this.apply();
    // sky dome follows the camera, inside the far plane
    const cam = this.app.camera; this.sky.position.copy(cam.position); this.sky.scale.setScalar(cam.far * .9);
    // precipitation around the view
    const B = Math.min(900, Math.max(36, dist * 1.3)), t = (now - this.t0) / 1000, show = dist < 1400, far = 1 - Math.min(1, Math.max(0, (dist - 600) / 800));
    for (const [obj, amt] of [[this.rain, this.cur.rain], [this.snow, this.cur.snow]]) {
      obj.visible = show && amt > .02; if (!obj.visible) continue;
      const u = obj.material.uniforms, snow = obj === this.snow;
      u.uC.value.set(center.x, center.y, center.z); u.uB.value = B; u.uT.value = t; u.uPx.value = innerHeight;
      u.uSpeed.value = snow ? Math.max(1.4, B * .02) : Math.max(11, B * .55) * (amt > 1.5 ? 1.25 : 1);
      u.uWind.value = (snow ? .6 : 2.5) * Math.max(1, B / 60) * (amt > 1.5 ? 2.2 : 1);
      u.uLen.value = Math.min(14, Math.max(.7, B * .022));
      u.uAlpha.value = (snow ? .9 : .38) * Math.min(1, amt) * (amt > 1.5 ? 1.25 : 1) * far;
      obj.geometry.setDrawRange(0, Math.floor(obj.geometry.attributes.seed.count * Math.min(1, amt / (snow ? 1 : 2) + (snow ? 0 : .35))));
    }
  }
}
