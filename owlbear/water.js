import OBR, { buildEffect } from 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm';

export const WATER = 'com.geezsheets/water';
export const PRESETS = {
  sea:          { c0: '#2f6f86', c1: '#4f97a8', c2: '#d9f1f0', speed: 1, cells: 5, rip: 0.10, foam: 0.03, warp: 0.12, dur: 6 },
  'deep ocean': { c0: '#163f5c', c1: '#2a6585', c2: '#bfe3ee', speed: 1, cells: 5, rip: 0.08, foam: 0.025, warp: 0.15, dur: 8 },
  stormy:       { c0: '#2c3d3f', c1: '#4b6062', c2: '#c9d3cf', speed: 2, cells: 7, rip: 0.14, foam: 0.05, warp: 0.2, dur: 6 },
  river:        { c0: '#3b7a80', c1: '#5c9c9c', c2: '#e3f2ea', speed: 3, cells: 8, rip: 0.12, foam: 0.03, warp: 0.08, dur: 4 },
  swamp:        { c0: '#3d4a2c', c1: '#56653a', c2: '#a3ad74', speed: 0, cells: 6, rip: 0.10, foam: 0.02, warp: 0.1, dur: 8 },
  lava:         { c0: '#5a1508', c1: '#c2410c', c2: '#fcd34d', speed: 1, cells: 5, rip: 0.16, foam: 0.05, warp: 0.15, dur: 8 },
};

// Built-in clock: https://docs.owlbear.rodeo/extensions/reference/effects/
export const WATER_SHADER = `
uniform float time, seconds, cells, rip, foam, warp; uniform float2 tileSize; uniform float2 flow; uniform float3 c0, c1, c2;
const float TAU = 6.2831853;
float2 hash(float2 p) { p = float2(dot(p, float2(127.1, 311.7)), dot(p, float2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
// periodic value noise; moving the sample point on a circle keeps both the tile and the loop seamless
float vnoise(float2 p, float per) {
  float2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash(mod(i, per)).x, b = hash(mod(i + float2(1, 0), per)).x;
  float c = hash(mod(i + float2(0, 1), per)).x, d = hash(mod(i + float2(1, 1), per)).x;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float2 swirl(float2 uv, float per, float phase, float t) {
  float2 o = 0.6 * float2(cos(TAU * (t + phase)), sin(TAU * (t + phase)));
  float2 p = uv * per;
  return float2(vnoise(p + o, per), vnoise(p + o.yx + 7.3, per)) - 0.5;
}
// periodic voronoi: returns F2 - F1 (0 on cell borders)
float edges(float2 p, float period, float spin, float t) {
  float2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    float2 n = float2(x, y), h = hash(mod(i + n, period));
    float2 o = 0.5 + 0.35 * float2(cos(TAU * (t * spin + h.x)), sin(TAU * (t * spin + h.y)));
    float d = length(n + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}
half4 main(float2 coord) {
  float t = fract(time / seconds);
  float2 uv = coord / tileSize;
  float2 m = fract(uv - flow * t);
  float2 w = warp * (swirl(m, 4.0, 0.0, t) * 2.0 + swirl(m, 8.0, 0.37, t)) * 2.0 / cells * 3.0;
  float2 a = (fract(uv - flow * t + w)) * cells;               // big ripples, follow the flow
  float r = edges(a, cells, 1.0, t);
  // big slow patches: darker deep water and thinner, broken ripples
  float2 dq = fract(uv - flow * t) * 6.0 + w * cells + 0.5 * float2(cos(TAU * t), sin(TAU * t));
  float deep = 0.65 * vnoise(dq, 6.0) + 0.35 * vnoise(dq * 2.0, 12.0);
  float width = rip * mix(0.15, 1.4, vnoise(fract(uv - flow * t) * 5.0 + w * cells, 5.0));
  float3 col = mix(c0, c0 * 0.8, smoothstep(0.6, 0.605, deep));
  // toon shadow: the same ripple sampled a little up-left, drawn darker underneath
  float rs = edges(a - float2(0.06, 0.06), cells, 1.0, t);
  col = mix(col, col * 0.82, 1.0 - smoothstep(width, width + 0.006, rs));
  float band = 1.0 - smoothstep(width, width + 0.006, r);
  col = mix(col, c1, band);
  // foam: a broken rim on the lit (lower-right) edge of each ripple, plus specks from the small layer
  float o = foam * 0.8;
  float lit = 1.0 - smoothstep(width, width + 0.006, edges(a + float2(o, o), cells, 1.0, t));
  float rim = band * (1.0 - lit);
  float breakup = smoothstep(0.4, 0.45, vnoise(fract(uv - flow * t) * 14.0 + w * cells * 2.0, 14.0));
  col = mix(col, c2, rim * breakup);
  return half4(col, 1.0);
}`;

const rgb = (hex) => Object.fromEntries(['x', 'y', 'z'].map((axis, n) => [axis, parseInt(hex.slice(1 + n * 2, 3 + n * 2), 16) / 255]));

// Effect items are local-only; the shared map metadata is the durable source.
export async function buildWaterEffect(item, preset = item.metadata[WATER]?.preset || 'sea') {
  const name = Object.hasOwn(PRESETS, preset) ? preset : 'sea', p = PRESETS[name];
  const dpi = await OBR.scene.grid.getDpi(), k = dpi / item.grid.dpi;
  const angle = item.rotation * Math.PI / 180;
  const x = -item.grid.offset.x * k * item.scale.x, y = -item.grid.offset.y * k * item.scale.y;
  return buildEffect().effectType('STANDALONE').sksl(WATER_SHADER)
    .width(item.image.width * k).height(item.image.height * k)
    .position({ x: item.position.x + x * Math.cos(angle) - y * Math.sin(angle), y: item.position.y + x * Math.sin(angle) + y * Math.cos(angle) })
    .scale(item.scale).rotation(item.rotation).visible(item.visible)
    .layer('MAP').zIndex(item.zIndex + 0.001).disableAutoZIndex(true).locked(true).disableHit(true).name('Water')
    .metadata({ [WATER]: { map: item.id, preset: name } })
    .uniforms([
      { name: 'tileSize', value: { x: 5 * dpi / Math.abs(item.scale.x), y: 5 * dpi / Math.abs(item.scale.y) } },
      { name: 'seconds', value: p.dur }, { name: 'flow', value: { x: p.speed, y: 0 } },
      ...['cells', 'rip', 'foam', 'warp'].map((name) => ({ name, value: p[name] })),
      ...['c0', 'c1', 'c2'].map((name) => ({ name, value: rgb(p[name]) })),
    ]).build();
}
