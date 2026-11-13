// Picture tokens, as in GeezSheets: a coin with the token's picture on its face (what you see from above),
// and the same picture in a floating circle that faces you when the camera is low (about eye level).
// Pictures come from tokens/<name>.png (GeezSheets' folder; tokens/index.json lists them): the token's
// own img, else its name, its monster, its role, its race. No picture: the token's colour and initials.
import * as THREE from 'three';

const BASE = './tokens/';
let INDEX = null; const waiting = [];
export const slug = s => String(s || '').toLowerCase().replace(/\s+\d+$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
fetch(BASE + 'index.json').then(r => r.ok ? r.json() : []).catch(() => []).then(list => {
  INDEX = new Set((Array.isArray(list) ? list : []).map(f => String(f).replace(/^tokens\//, '')));
  for (const f of waiting.splice(0)) f();
});
// Called when the picture list arrives (tokens built before it get their pictures then).
export const onPictures = f => { if (INDEX) f(); else waiting.push(f); };

export function pictureFor(t) {
  if (t.img) return t.img.includes('/') ? t.img : BASE + t.img;
  if (!INDEX) return null;
  for (const c of [slug(t.name), t.mon && t.mon.replace(/-/g, '_'), t.role && slug(t.role), t.look?.race && slug(t.look.race)]) if (c && INDEX.has(c + '.png')) return BASE + c + '.png';
  return null;
}
export const SIZE = { Tiny: .7, Small: 1, Medium: 1, Large: 2, Huge: 3, Gargantuan: 4 };

// One round picture per (picture, colour): a canvas with a coloured rim, filled in when the image loads.
const textures = new Map();
let ready = () => {};
export const onTextureReady = f => { ready = f; };
function face(src, col, name) {
  const key = `${src}|${col}|${src ? '' : name}`;
  if (textures.has(key)) return textures.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const draw = img => {
    const g = cv.getContext('2d'); g.clearRect(0, 0, 256, 256);
    g.save(); g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.clip();
    if (img) { g.fillStyle = '#2a2622'; g.fillRect(0, 0, 256, 256); g.drawImage(img, 0, 0, 256, 256); }
    else {
      g.fillStyle = col; g.fillRect(0, 0, 256, 256);
      const ini = String(name || '?').replace(/\s+\d+$/, '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
      g.fillStyle = 'rgba(255,255,255,.88)'; g.font = 'bold 104px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ini, 128, 136);
    }
    g.restore();
    g.lineWidth = 14; g.strokeStyle = col; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.stroke();
    tex.needsUpdate = true;
  };
  draw(null);
  if (src) { const img = new Image(); img.onload = () => { draw(img); ready(); }; img.src = src; }
  textures.set(key, tex);
  return tex;
}

const COIN = new THREE.CylinderGeometry(1, 1, 1, 32).translate(0, .5, 0);
const DISC = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
const coinMat = new Map();
const rimOf = col => { if (!coinMat.has(col)) coinMat.set(col, new THREE.MeshLambertMaterial({ color: col, depthTest: false })); return coinMat.get(col); };

// The token: a coin (r ~ 0.68 m a square, more for big creatures) with the picture on top,
// and a camera-facing picture above it (shown when the camera is low; see fadeStanding).
export function tokenCoin(t) {
  const k = SIZE[t.size] || 1, r = .68 * k, col = t.color || '#c9c1ae', tex = face(pictureFor(t), col, t.name);
  // drawn over the land, roads and rivers (no depth test, after them), like tokens on a table
  const coin = new THREE.Mesh(COIN, rimOf(col)); coin.scale.set(r, .14, r); coin.renderOrder = 4;
  coin.userData.token = t.id;
  const top = new THREE.Mesh(DISC, new THREE.MeshLambertMaterial({ map: tex, depthTest: false })); top.renderOrder = 4.5;
  top.scale.set(r * .96 / r, 1 / .14, r * .96 / r); top.position.y = 1.02; coin.add(top);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 5; sp.scale.set(1.25 * k / r, 1.25 * k / .14, 1); sp.position.y = (1.35 + .6 * k) / .14; coin.add(sp);
  coin.userData.sprite = sp;
  return coin;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// The standing picture fades in as the camera comes down toward eye level (below ~45 degrees).
export function fadeStanding(coin, camera) {
  const sp = coin.userData.sprite; if (!sp) return;
  const p = coin.position, c = camera.position, el = Math.atan2(c.y - p.y, Math.hypot(c.x - p.x, c.z - p.z));
  const o = 1 - smooth(.62, .95, el);
  sp.material.opacity = o; sp.visible = o > .02;
}
export function disposeToken(coin) { for (const c of coin.children) c.material.dispose(); }
