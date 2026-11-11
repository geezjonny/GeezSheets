// GeezTT world VTT: one page, one world, GM and players, phone to desktop.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { PAL, INK_STYLE } from './style.js';
import { InkRenderer } from './ink.js';
import { AtlasShadows } from './shadows.js';
import { MicroDetail } from './micro-detail.js';
import {WorldMotion} from './motion.js';
import {DD2VTTImports} from './dd2vtt.js';
import { paperShader } from './paper.js';
import { World, Terrain, HALF, VALLEY } from './world.js';
import { Props } from './props.js';
import { Lines, setPixelScale, uLod } from './lines.js';
import { Towns } from './towns.js';
import { Bridges } from './bridges.js';
import { Maps } from './maps.js';
import { onPictures, onTextureReady } from './tokens.js';
import { bindRelicNames } from './relics.js';
import { Blueprints } from './blueprints.js';
import { Detail } from './detail.js';
import { starterWorld } from './starter.js';
import { Tools } from './tools.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Card, ensureLore } from './card.js';
import { RollUI } from './rollui.js';
import { WorldCanon } from './world-canon.js';
import { Interiors } from './interiors.js';
import { Underground } from './underground.js';
import { PropInspector } from './prop-inspector.js';
import { Buildings } from './buildings.js';
import { Ruler, Combat } from './combat.js';
import { Atmosphere } from './atmosphere.js';
import { Ambience } from './ambience.js';
import { clamp, smoothstep } from './noise.js';

const KEY = 'geeztt-ink-world-v1', PREFS = 'geeztt-ink-prefs-v1';
const coarse = matchMedia('(pointer: coarse)').matches;
const prefs = Object.assign({ role: 'gm', quality: 'auto', stats: false }, JSON.parse(localStorage.getItem(PREFS) || '{}'));
INK_STYLE.fineDetail.value=prefs.fineDetail===false?0:1;
const QUALITY = {
  high: { name: 'high', pr: 2, k: .03, cap: 80, range: 1500, canopy: 6000, lights: 6, cellCap: 2500, blobCap: 30000, caps: [40000, 40000, 16000, 12000, 16000, 4000, 5000, 8000] },
  low: { name: 'low', pr: 1.5, k: .05, cap: 40, range: 800, canopy: 3500, lights: 3, cellCap: 1200, blobCap: 12000, caps: [12000, 12000, 6000, 5000, 6000, 1500, 2000, 3000] },
};
const pickQuality = () => prefs.quality === 'auto' ? (coarse ? QUALITY.low : QUALITY.high) : QUALITY[prefs.quality];
let Q = pickQuality();

// ---------- renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: !coarse, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('view').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.fog);
scene.fog = new THREE.Fog(PAL.fog, 1000, 5000);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 300000);
const hemi = new THREE.HemisphereLight('#c9d3dc', '#4a4136', 1.35); scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffd7a8', 2.3); sun.position.set(-.8, 1, .55).multiplyScalar(1000); scene.add(sun);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(2e6, 2e6).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: PAL.sea, transparent: true, opacity: .84 }));
sea.material.onBeforeCompile=s=>{paperShader(s);s.uniforms.uInkWater.value=1;}; sea.material.customProgramCacheKey=()=> 'ink-sea-v1';
sea.renderOrder = 1; scene.add(sea);
const lights = [];
function makeLights() {
  while (lights.length < Q.lights) { const l = new THREE.PointLight(PAL.halo, 0, 24, 2); scene.add(l); lights.push(l); }
}
makeLights();

const controls = new MapControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: .14, zoomToCursor: true, screenSpacePanning: false, maxPolarAngle: 1.32, minDistance: 6, maxDistance: 70000, zoomSpeed: 1.3 });

// ---------- world ----------
let data;
try { data = JSON.parse(localStorage.getItem(KEY)); } catch { data = null; }
if (!data || !data.terrain) data = starterWorld();
const world = new World(data);
bindRelicNames(() => world.data.relics);
ensureLore(world);
const terrain = new Terrain(world, scene); terrain.quality = { k: Q.k, cap: Q.cap };
const detail = new Detail(world, scene);
const blueprints = new Blueprints(world, scene, null); // .dd2vtt maps rebuilt in the world's style
const props = new Props(world, scene, Q);
const lines = new Lines(world, scene);
const towns = new Towns(world, scene);
const bridges = new Bridges(world, scene);
const maps = new Maps(world, scene, towns);
onPictures(() => maps.refreshTokens()); // token pictures (tokens/index.json) arrive after the first build

const app = {
  world, terrain, get detail(){return app.underground?.active?app.underground.detail:detail;}, blueprints, props, lines, towns, bridges, get maps(){return app.underground?.active?app.underground.maps:maps;}, get scene(){return app.underground?.active?app.underground.scene:scene;}, camera, controls, renderer, cutaway: false, showGrid: false,
  detailLevel: 0, role: prefs.role, tool: 'look', coarse, prefs,
  get quality() { return Q; },
  dirty: true, request() { app.dirty = true; },
  camDist() { return camera.position.distanceTo(controls.target); },
  save: debounce(() => { try { localStorage.setItem(KEY, JSON.stringify(world.toJSON())); } catch (e) { console.warn('save failed', e); } }, 600),
  savePrefs() { localStorage.setItem(PREFS, JSON.stringify(prefs)); },
  // Something changed the ground in this rectangle (metres).
  regionChanged(x0, z0, x1, z1, { lines: relines = false } = {}) {
    app.microDetail?.invalidate();
    world.computeFields(...world.cellAt(x0, z0), ...world.cellAt(x1, z1));
    const before = world.data.settlements.map(p => p.h);
    world.updateSettlements();
    world.data.settlements.forEach((p, k) => {
      if (p.x + p.r + 260 > x0 && p.x - p.r - 260 < x1 && p.z + p.r + 260 > z0 && p.z - p.r - 260 < z1) towns.free(p.id); // houses and fields stand on this ground
      if (Math.abs(p.h - before[k]) > .01) terrain.invalidate(p.x - 130, p.z - 130, p.x + 130, p.z + 130);
    });
    for (const m of world.data.battlemaps) if (m.x + 250 > x0 && m.x - 250 < x1 && m.z + 250 > z0 && m.z - 250 < z1) maps.free(m.id);
    terrain.invalidate(x0, z0, x1, z1); props.invalidate(x0, z0, x1, z1);
    bridges.rebuild(); detail.freeAll(); maps.invalidateGrid();
    if (relines) lines.rebuild();
    app.request(); app.save();
  },
  detailChanged(box) {
    if(app.underground?.active){app.underground.maps.invalidateGrid();app.save();app.request();return;}
    app.microDetail?.invalidate();
    maps.invalidateGrid();
    if (box) {
      props.invalidate(...box);
      for (const p of world.data.settlements) if (p.x+p.r+260>box[0] && p.x-p.r-260<box[2] && p.z+p.r+260>box[1] && p.z-p.r-260<box[3]) towns.free(p.id);
    }
    app.request(); app.save();
  },
  // Lines a (before) -> b (after): rebuild ground only around lines that changed.
  linesChanged(a = [], b = []) {
    app.microDetail?.invalidate();
    world.indexLines(); lines.rebuild(); detail.freeAll();
    world.updateSettlements(); towns.freeAll(); maps.freeAll(); bridges.rebuild(); // streets follow the roads; rebuilt next frames
    // Moving a road can relocate plots on every approach, beyond the edited road's own bounds.
    for (const p of world.data.settlements) {
      const R = p.r + 260;
      props.invalidate(p.x - R, p.z - R, p.x + R, p.z + R);
    }
    const ka = new Set(a.map(l => JSON.stringify(l))), kb = new Set(b.map(l => JSON.stringify(l)));
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const l of [...a.filter(l => !kb.has(JSON.stringify(l))), ...b.filter(l => !ka.has(JSON.stringify(l)))]) for (const [x, z] of l.pts) { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], z); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], z); }
    if (box[0] < Infinity) { const P = Math.max(VALLEY.river, VALLEY.road) + 60; terrain.invalidate(box[0] - P, box[1] - P, box[2] + P, box[3] + P); props.invalidate(box[0] - P, box[1] - P, box[2] + P, box[3] + P); } // valleys and passes reach this far
    app.request(); app.save();
  },
  loadData(d) {
    app.propInspector?.close();
    app.underground?.reset(); world.load(d); app.interiors?.reset(); app.canon?.reset(); app.ddImports?.refresh(); ensureLore(world); app.card?.close(); towns.freeAll(); maps.freeAll(); bridges.rebuild();
    terrain.invalidate(-HALF, -HALF, HALF, HALF); props.invalidateAll(); lines.rebuild(); app.tools.clearHistory(); app.ui.refresh(); app.request(); app.save(); queueMicrotask(()=>app.underground?.resume());
  },
  setRole(r) { app.role = prefs.role = r; app.savePrefs(); if (app.card?.ref) app.card.render(); app.rolls?.sync(); if(app.interiors?.focus&&!app.interiors.el.hidden)app.interiors.show(app.interiors.focus); if(r==='player'&&app.canon)app.canon.el.hidden=true; app.weather?.sync(); if (r === 'player' && !['look', 'play'].includes(app.tool)) app.setTool('look'); app.ui.refresh(); app.request(); },
  setTool(t) { if(app.underground?.active&&!['look','play','detail'].includes(t)){app.ui.toast('Return to the surface to use that tool.');return;} if (app.role !== 'gm' && !['look', 'play'].includes(t)) return; app.tools?.cancel(); app.tool = t; app.tools.toolChanged(); app.ui.refresh(); app.request(); },
  setFineDetail(on){prefs.fineDetail=!!on;INK_STYLE.fineDetail.value=on?1:0;app.microDetail.enabled=!!on;app.microDetail.signature='';app.savePrefs();app.ui.refresh();app.request();},
  setQuality(name) {
    prefs.quality = name; app.savePrefs(); Q = pickQuality(); applyQuality(); app.ui.refresh();
  },
  flyTo, flyOut, toggleTopDown, orbitCamera, zoomCamera, pickGround, project,
  level: 'World',
};
function applyQuality() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr)); renderer.setSize(innerWidth, innerHeight);
  terrain.quality = { k: Q.k, cap: Q.cap }; props.setQuality(Q); makeLights();
  lights.forEach(l => { l.intensity = 0; });
  app.request();
}
window.__VTT = app;
const ink=new InkRenderer(renderer);app.ink=ink;
const shadows=new AtlasShadows(renderer,sun,scene);app.shadows=shadows;

// ---------- camera helpers ----------
let flight = null;
app.stopFlight=()=>{flight=null;};
function flyTo(x, z, dist, tilt = null) {
  const off = camera.position.clone().sub(controls.target);
  const sph = new THREE.Spherical().setFromVector3(off);
  flight = { t: 0, from: controls.target.clone(), to: new THREE.Vector3(x, app.underground?.active ? .22 : world.height(x, z), z), d0: sph.radius, d1: dist, phi0: sph.phi, phi1: tilt ?? sph.phi, theta: sph.theta };
  app.request();
}
// Button flights share the same centre and easing as Go; compass drags move immediately.
function orbitCamera(turn = 0, tilt = 0, animated = false, north = false) {
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const theta = north ? sph.theta + Math.atan2(Math.sin(-sph.theta), Math.cos(-sph.theta)) : sph.theta + turn;
  const phi = clamp(north ? .9 : sph.phi + tilt, .001, controls.maxPolarAngle);
  const wasTopDown = topDown;
  topDown = phi < .01;
  if (wasTopDown !== topDown) app.ui?.refresh();
  flight = null;
  if (animated) {
    flyTo(controls.target.x, controls.target.z, sph.radius, phi);
    flight.theta1 = theta;
  } else {
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSphericalCoords(sph.radius, phi, theta));
    controls.update(); app.request();
  }
}
function zoomCamera(factor) {
  flyTo(controls.target.x, controls.target.z, clamp(app.camDist() * factor, controls.minDistance, controls.maxDistance));
}
const LEVELS = [['Battlemap', 250], ['Area', 1800], ['Region', 9000], ['World', Infinity]];
function flyOut() {
  if(app.underground?.active){app.underground.leave();return;}
  const d = app.camDist(), next = d < 250 ? 1200 : d < 1800 ? 6000 : 52000;
  if (next > 40000) flyTo(0, 0, next, .25); else flyTo(controls.target.x, controls.target.z, next);
}
let topDown = false;
function toggleTopDown() {
  topDown = !topDown;
  const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
  flight = { t: 0, from: controls.target.clone(), to: controls.target.clone(), d0: sph.radius, d1: sph.radius, phi0: sph.phi, phi1: topDown ? .001 : .9, theta: sph.theta };
  app.request(); app.ui?.refresh();
}
app.isTopDown = () => topDown;

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
// Where a screen point hits the ground, by marching the height function (always exact, any zoom).
function pickGround(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if(app.underground?.active){const p=new THREE.Vector3(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.22);if(!ray.ray.intersectPlane(plane,p))return null;p.water=false;return p;}
  const o = ray.ray.origin, d = ray.ray.direction;
  let t = 0;
  if (o.y > 2600) { if (d.y >= 0) return null; t = (o.y - 2600) / -d.y; }
  let step = Math.max(.25, t * .004);
  const above = tt => o.y + d.y * tt - Math.max(0, world.height(o.x + d.x * tt, o.z + d.z * tt));
  for (let k = 0; k < 900; k++) {
    const tt = t + step;
    if (above(tt) < 0) {
      let a = t, b = tt; for (let s = 0; s < 18; s++) { const m = (a + b) / 2; if (above(m) < 0) b = m; else a = m; }
      const p = o.clone().addScaledVector(d, b); const h = world.height(p.x, p.z); p.y = Math.max(0, h); p.water = h < 0; return p;
    }
    t = tt; step = Math.max(.25, t * .012);
    if (t > camera.far * 1.5) break;
  }
  return null;
}
const _p = new THREE.Vector3();
function project(x, y, z) { _p.set(x, y, z).project(camera); return { x: (_p.x + 1) / 2 * innerWidth, y: (1 - _p.y) / 2 * innerHeight, behind: _p.z > 1 }; }

// ---------- start view ----------
{
  const p = world.data.settlements.find(q => q.kind === 'town') || { x: 0, z: 0 };
  controls.target.set(0, 0, 0); camera.position.set(0, 52000 * Math.cos(.25), 52000 * Math.sin(.25));
  if (new URLSearchParams(location.search).has('close')) { controls.target.set(p.x, world.height(p.x, p.z), p.z); camera.position.set(p.x, controls.target.y + 60, p.z + 70); }
  controls.update();
}

app.microDetail=new MicroDetail(app);app.microDetail.enabled=prefs.fineDetail!==false;
app.ddImports=new DD2VTTImports(app);
app.tools = new Tools(app);
app.input = new Input(app);
app.ui = new UI(app);
app.buildings = new Buildings(app);
app.interiors = new Interiors(app);
app.ruler = new Ruler(app);
app.weather = new Atmosphere(app, { scene, renderer, sun, hemi });
app.ambience = new Ambience(app);
app.motion=new WorldMotion(app);
onTextureReady(() => app.request()); // a token picture finished loading
app.combat = new Combat(app);
app.card = new Card(app);
app.canon = new WorldCanon(app);
app.rolls = new RollUI(app);
app.underground = new Underground(app);
app.propInspector = new PropInspector(app);
queueMicrotask(()=>app.underground.resume());
controls.addEventListener('change', () => app.request());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); app.request(); });

// ---------- loop ----------
let last = performance.now(), fpsT = last, frames = 0, fps = 60, slow = 0, busyUntil = 0;
const clock = new THREE.Clock();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.1, clock.getDelta());
  app.motion.advance(dt);
  if (flight) {
    flight.t = Math.min(1, flight.t + dt / 1.3);
    const e = flight.t < .5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
    controls.target.lerpVectors(flight.from, flight.to, e);
    const d = Math.exp(Math.log(flight.d0) + (Math.log(flight.d1) - Math.log(flight.d0)) * e), phi = flight.phi0 + (flight.phi1 - flight.phi0) * e;
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSphericalCoords(d, Math.max(.001, phi), flight.theta + ((flight.theta1 ?? flight.theta) - flight.theta) * e));
    if (flight.t >= 1) flight = null;
    app.dirty = true;
  }
  app.input.travel(dt);
  const moved = controls.update();
  if(app.underground?.active){app.underground.frame(now,dt,ink,fps);last=now;return;}
  // keep the orbit point on the ground, and the camera above it
  const gh = Math.max(0, world.height(controls.target.x, controls.target.z));
  const dy = (gh - controls.target.y) * (flight ? 1 : .25);
  if (Math.abs(dy) > .01) { controls.target.y += dy; camera.position.y += dy; app.dirty = true; }
  const ch = Math.max(0, world.height(camera.position.x, camera.position.z)) + 2;
  if (camera.position.y < ch) { camera.position.y = ch; app.dirty = true; }
  const dist = app.camDist();
  const animating = app.tools.animating(now) || app.weather.animating(dist) || app.motion.wantsFrame(now,dist);
  const work = now < busyUntil;
  if (!app.dirty && !moved && !animating && !work) { last = now; return; }
  app.dirty = false;

  // fog, clip planes, prop range follow the zoom
  const [fogNear, fogFar] = app.weather.fog(dist * 1.5 + 150, dist * 7 + 900, dist);
  scene.fog.near = fogNear; scene.fog.far = fogFar;
  camera.near = clamp(dist * .004, .1, 200); camera.far = Math.max(dist * 7 + 900, 2000) * 1.1; camera.updateProjectionMatrix();
  app.weather.frame(dt, dist, controls.target);
  setPixelScale(camera, innerHeight);
  props.groundY = gh; props.camDist = dist;

  let pending = terrain.update(camera, 5) > 0;
  terrain.chunks.forEach((c, k) => { uLod.value[k] = c.shown; }); // lines follow the shown ground
  pending = props.update(camera, fogFar, 4) || pending;
  pending = towns.update(camera, app.role) || pending;
  pending = bridges.update(camera) || pending;
  pending = detail.update(camera, app.detailLevel) || pending;
  blueprints.update();
  app.ddImports.update();
  pending=app.interiors.update()||pending;
  app.underground.updateSurface();
  pending = maps.update(camera, app.role, dist, controls.target, app.cutaway, app.showGrid) || pending;
  if (pending) busyUntil = now + 250;

  // The nearest fires illuminate the paper; pause flicker with world motion.
  const flickerClock=app.motion.time*1000;
  if (Q.lights > 0) {
    const near=[];
    if(dist<1600){
      const candidates=[...app.ddImports.lightsNear(controls.target,Q.lights*3),...towns.torchesNear(controls.target,Q.lights*3),...detail.torchesNear(controls.target,Q.lights*3)].sort((a,b)=>a.distanceToSquared(controls.target)-b.distanceToSquared(controls.target));
      for(const p of candidates){if(near.every(q=>p.distanceToSquared(q)>.75*.75))near.push(p);if(near.length>=Q.lights)break;}
    }
    lights.forEach((l, k) => {
      if (k < near.length) {
        const meta=near[k].ddLight;l.position.copy(near[k]);l.color.set(meta?.color||PAL.halo);l.distance=meta?meta.range*1.5:24;
        l.castShadow=!!meta?.shadows;
        if(l.castShadow&&!l.userData.importShadow){l.shadow.mapSize.set(512,512);l.shadow.camera.near=.1;l.shadow.normalBias=.04;l.shadow.bias=-.0002;l.userData.importShadow=true;}
        l.intensity = (24 + Math.sin(flickerClock * .009 + k * 1.7) * .9 + Math.sin(flickerClock * .021 + k) * .4) * (1 - smoothstep(1000, 1600, dist)) * (.25 + app.weather.night * 1.75)*(meta?meta.intensity*meta.alpha:1); }
      else {l.intensity = 0;l.castShadow=false;}
    });
  }
  app.tools.frame(now);
  app.microDetail.update();
  app.motion.update(lights);
  shadows.update(app);
  if(lights.some(l=>l.castShadow))renderer.shadowMap.needsUpdate=true;
  ink.render(scene, camera, app);
  app.motion.rendered(now);
  app.ui.frame(now, dist, fps);
  app.card.frame();
  app.ruler.frame();

  frames++;
  if (now - fpsT > 500) {
    fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now;
    // auto quality: drop to low if we can't keep up
    if (prefs.quality === 'auto' && Q === QUALITY.high && now - last < 60) { slow = fps < 40 ? slow + .5 : 0; if (slow >= 3) { Q = QUALITY.low; applyQuality(); slow = 0; } }
  }
  last = now;
}
requestAnimationFrame(frame);

function debounce(f, ms) { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => f(...a), ms); }; }
blueprints.app = app;
app.setRelicName = (key, v) => { world.data.relics[key] = v; app.save(); };
app.saveNow = () => localStorage.setItem(KEY, JSON.stringify(world.toJSON()));
app.idle = () => new Promise(res => { const tick = () => (terrain.pending || detail.pending || props.building || performance.now() < busyUntil || flight) ? setTimeout(tick, 50) : res(); tick(); });
app.stats = () => ({ fps: Math.round(fps), calls: ink.last.calls, tris: ink.last.tris, inkPassCalls: ink.last.totalCalls, pebbles: app.microDetail?.count||0, chunks: terrain.stats(), props: props.drawn, canopy: props.blobCount || 0, towns: towns.nearCount, townsFar: towns.loaded.size - towns.nearCount, maps: maps.loaded.size, detail: detail.loaded.size, bridges: bridges.loaded.size, dist: Math.round(app.camDist()), quality: Q.name });
