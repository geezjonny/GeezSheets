// GM soundboard for gm-companion.html. Writes the same /test/audio the table VTT uses, so either one can drive the sound.
import { AUDIO_CATALOG } from './rodeo/audio-catalog.js';
const BASE = 'https://geezsheets-default-rtdb.firebaseio.com/test/audio';
const $ = (s) => document.querySelector(s), esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let state = {}, toast = (m) => console.warn(m);
const send = (path, value) => fetch(`${BASE}${path}.json`, { method: value === undefined ? 'DELETE' : 'PUT', body: JSON.stringify(value) }).then((r) => { if (!r.ok) throw Error('HTTP ' + r.status); });
async function pull() { try { state = (await (await fetch(BASE + '.json')).json()) || {}; } catch {} paint(); }
function paint() {
  const music = AUDIO_CATALOG.music, amb = AUDIO_CATALOG.ambience, fx = AUDIO_CATALOG.sfx;
  $('#audio-music').innerHTML = music.map((x) => `<button data-music="${x.id}" aria-pressed="${state.music?.src === x.src}">${esc(x.name)}</button>`).join('');
  $('#audio-amb').innerHTML = amb.map((x) => `<button data-amb="${x.id}" aria-pressed="${!!state.ambience?.[x.id]}">${esc(x.name)}</button>`).join('');
  $('#audio-sfx').innerHTML = fx.map((x) => `<button data-sfx="${x.id}">${esc(x.name)}</button>`).join('');
}
export function initGmAudio(toastFn) {
  if (toastFn) toast = toastFn;
  $('#audio-board').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return; const now = Date.now();
    try {
      if (b.dataset.music) { const x = AUDIO_CATALOG.music.find((m) => m.id === b.dataset.music); await send('/music', state.music?.src === x.src ? undefined : { src: x.src, name: x.name, vol: 1, at: now }); }
      else if (b.dataset.amb) { const x = AUDIO_CATALOG.ambience.find((m) => m.id === b.dataset.amb); await send('/ambience/' + x.id, state.ambience?.[x.id] ? undefined : { src: x.src, vol: 1, at: now }); }
      else if (b.dataset.sfx) { const x = AUDIO_CATALOG.sfx.find((m) => m.id === b.dataset.sfx); await send('/sfx/' + x.id, { src: x.src, at: now }); }
      else if (b.id === 'audio-stop') await send('', { music: null, ambience: {}, sfx: {} });
      await pull();
    } catch (err) { toast('Sound not sent: ' + err.message); }
  });
  pull(); try { const es = new EventSource(BASE + '.json'); es.addEventListener('put', pull); es.addEventListener('patch', pull); } catch {}
}
