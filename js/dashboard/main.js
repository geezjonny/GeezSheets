import { floatWindow } from './core.js';
const MODULES = ['hp', 'conditions', 'initiative', 'time', 'weather', 'music', 'soundfx', 'rollcall', 'party', 'scenes', 'handouts', 'notes', 'dice'];
// Default layout: tile the windows in a 4-column grid (a saved position from a previous visit wins).
let slot = 0;
for (const name of MODULES) try { const m = (await import(`./modules/${name}.js`)).default, i = slot++, pos = { x: 12 + (i % 4) * 322, y: 48 + Math.floor(i / 4) * 290, w: 310, h: 276 }; floatWindow(m.title, m.id, pos, m.build); } catch (e) { console.warn('module', name, e); }
