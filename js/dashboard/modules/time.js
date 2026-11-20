import { $, db, ref, onValue, update, dragSource } from '../core.js';

export default { id: 'time', title: 'Time', pos: { x: 380, y: 390, w: 260 }, build({ body }) {
  let hours = 12, input, clock, handle;
  const fmt = h => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h - Math.floor(h)) * 60) % 60).padStart(2, '0')}`;
  const render = () => { if (!input) return; input.value = hours; clock.textContent = fmt(hours); dragSource(handle, { type: 'time', time: hours }); };
  const write = v => { hours = Math.max(0, Math.min(24, +v || 0)); update(ref(db, 'test/atmosphere'), { time: hours }); render(); };
  clock = $('div', { className: 'lbl' }); input = $('input', { type: 'range', min: 0, max: 24, step: .25, oninput: () => write(input.value) });
  handle = $('button', { textContent: 'Drag to a scene', title: 'Drag this time onto a scene' }); body.append(clock, input, $('div', { className: 'chips' }, ...[[6, 'Dawn'], [12, 'Noon'], [18, 'Dusk'], [22, 'Night']].map(([v, l]) => $('button', { textContent: l, onclick: () => write(v) }))), handle);
  onValue(ref(db, 'test/atmosphere'), s => { hours = Math.max(0, Math.min(24, Number.isFinite(+s.val()?.time) ? +s.val().time : 12)); render(); }); render();
} };
