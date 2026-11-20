import { $, db, ref, set } from '../core.js';
import { AUDIO_CATALOG } from '../../vtt/audio-catalog.js';

export default { id: 'soundfx', title: 'Soundfx', pos: { x: 360, y: 670, w: 300 }, build({ body }) {
  const search = $('input', { placeholder: 'Search effects…' }), grid = $('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:4px';
  const render = () => { const q = search.value.toLowerCase(); grid.replaceChildren(...AUDIO_CATALOG.sfx.filter(x => x.name.toLowerCase().includes(q)).map(x => { const b = $('button', { textContent: x.name, title: x.id, onclick: () => { set(ref(db, `test/audio/sfx/${x.id}`), { src: x.src, at: Date.now() }); b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 250); } }); return b; })); };
  search.oninput = render; body.append(search, grid); render();
} };
