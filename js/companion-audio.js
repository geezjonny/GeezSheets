// Plays the table soundboard in the companion. Same data as the table VTT (js/rodeo/audio.js):
// Firebase /test/audio = { music:{src,name,vol,at}, ambience:{id:{src,vol,at}}, sfx:{id:{src,at}} }.
// Plain REST + server-sent events, because the Gaia layer used by the companion has no /test paths.
const BASE = 'https://geezsheets-default-rtdb.firebaseio.com/test/audio';
const MUTE = 'companion.audio.mute', VOL = 'companion.audio.volume';
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

let mute = read(MUTE, 'false') === 'true', master = Math.min(1, Math.max(0, Number(read(VOL, '0.8')) || 0));
let state = {}, unlocked = false, btn, panel;
const loops = new Map(), played = new Set(), seeded = { done: false };
const level = () => (mute ? 0 : master);

function playLoop(key, d) {
  if (!d?.src) return;
  const old = loops.get(key), v = (d.vol ?? 1) * level();
  if (old && old.src === d.src) { old.volume = v; if (old.paused) old.play().catch(blocked); return; }
  stopLoop(key);
  const a = new Audio(d.src); a.loop = true; a.volume = v; a.play().catch(blocked); loops.set(key, a);
}
function stopLoop(key) { const a = loops.get(key); if (!a) return; a.pause(); a.removeAttribute('src'); a.load(); loops.delete(key); }
function blocked() { if (!unlocked) btn?.classList.add('needs-tap'); }
function unlock() {
  if (unlocked) return; unlocked = true; btn?.classList.remove('needs-tap');
  loops.forEach((a) => a.paused && a.play().catch(() => {}));
}
function apply(v) {
  state = v || {};
  if (state.music) playLoop('music', state.music); else stopLoop('music');
  const amb = state.ambience || {};
  for (const [id, d] of Object.entries(amb)) playLoop('amb:' + id, d);
  for (const k of [...loops.keys()]) if (k.startsWith('amb:') && !amb[k.slice(4)]) stopLoop(k);
  for (const [id, d] of Object.entries(state.sfx || {})) {
    const key = id + ':' + d.at; if (played.has(key)) continue; played.add(key);
    if (!seeded.done || !d.at || Date.now() - d.at > 6000) continue;   // never replay old sounds on load
    const a = new Audio(d.src); a.volume = level(); a.play().catch(blocked);
  }
  seeded.done = true; refresh();
}
function setLevel() { loops.forEach((a, k) => { const d = k === 'music' ? state.music : state.ambience?.[k.slice(4)]; a.volume = (d?.vol ?? 1) * level(); }); refresh(); }
function refresh() {
  if (!btn) return;
  const on = !!state.music || Object.keys(state.ambience || {}).length > 0;
  btn.textContent = mute || !master ? '🔇' : '🔊';
  btn.title = on ? 'Sound: ' + [state.music?.name, ...Object.keys(state.ambience || {})].filter(Boolean).length + ' playing' : 'Sound';
  btn.classList.toggle('playing', on && !mute);
  if (panel) { panel.querySelector('input').value = master; panel.querySelector('[data-mute]').textContent = mute ? 'Unmute' : 'Mute'; panel.querySelector('[data-now]').textContent = on ? 'Now playing: ' + [state.music?.name, ...Object.keys(state.ambience || {}).map((i) => i.replace(/^rec_/, '').replace(/_/g, ' '))].filter(Boolean).join(', ') : 'Nothing playing.'; }
}
async function pull() {
  try { const r = await fetch(BASE + '.json'); if (r.ok) apply(await r.json()); } catch {}
}
function ui() {
  const css = document.createElement('style');
  css.textContent = `.snd{position:fixed;z-index:6;left:max(12px,calc(50% - 268px));bottom:calc(84px + env(safe-area-inset-bottom));width:52px;height:52px;border-radius:50%;border:2px solid #8b6f35;background:#241e17;font-size:22px;padding:0;min-height:0}
.snd.playing{border-color:#c9a24b;box-shadow:0 0 12px #c9a24b66}.snd.needs-tap{animation:sndpulse 1.2s infinite}@keyframes sndpulse{50%{box-shadow:0 0 0 6px #c9a24b44}}
.sndp{position:fixed;z-index:7;left:max(12px,calc(50% - 268px));bottom:calc(144px + env(safe-area-inset-bottom));background:#241e17;border:1px solid #8b6f35;border-radius:12px;padding:12px;width:240px;display:grid;gap:8px;box-shadow:0 10px 30px #000a}.sndp[hidden]{display:none}.sndp small{color:#a39a85}.sndp input{width:100%;accent-color:#c9a24b}`;
  document.head.append(css);
  btn = document.createElement('button'); btn.className = 'snd'; btn.setAttribute('aria-label', 'Sound');
  panel = document.createElement('div'); panel.className = 'sndp'; panel.hidden = true;
  panel.innerHTML = '<small data-now></small><label>Volume<input type="range" min="0" max="1" step="0.05"></label><button data-mute></button>';
  document.body.append(btn, panel);
  btn.onclick = () => { unlock(); panel.hidden = !panel.hidden; refresh(); };
  panel.querySelector('input').oninput = (e) => { master = Number(e.target.value); write(VOL, master); setLevel(); };
  panel.querySelector('[data-mute]').onclick = () => { mute = !mute; write(MUTE, mute); setLevel(); };
  document.addEventListener('pointerdown', unlock, { once: true }); document.addEventListener('keydown', unlock, { once: true });
  refresh();
}
export function initCompanionAudio() {
  if (btn) return; ui(); pull();
  try { const es = new EventSource(BASE + '.json'); es.addEventListener('put', pull); es.addEventListener('patch', pull); } catch {}
  setInterval(pull, 20000);   // safety net if the stream drops
}
