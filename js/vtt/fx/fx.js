// Sound effects. Drop files into this folder named after the effect (e.g. click.mp3, door-open.mp3; .ogg/.wav also work).
// If a file is missing, a short synthesized sound plays instead so the app is never silent or broken.
const NAMES = { click: [880, 0.04], "door-open": [140, 0.25], "door-close": [100, 0.2], "dice-roll": [520, 0.08] };   // fallback synth: [frequency Hz, seconds]
const EXTS = ["mp3", "ogg", "wav"];
const cache = {};   // name -> Audio | null (null = no file, use synth)
let ctx = null;
export let muted = false;
try { muted = localStorage.getItem("vtt-muted") === "1"; } catch {}
export const setMuted = (m) => { muted = m; try { localStorage.setItem("vtt-muted", m ? "1" : "0"); } catch {} };

function synth(name) {
  const [f, d] = NAMES[name] || [440, 0.05];
  try {
    ctx ||= new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = name === "door-open" ? "sawtooth" : "square"; o.frequency.setValueAtTime(f, t);
    if (name === "door-open") o.frequency.exponentialRampToValueAtTime(f * 0.6, t + d);
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + d);
  } catch {}
}
function load(name, i = 0) {
  if (i >= EXTS.length) return (cache[name] = null);
  const a = new Audio(`${new URL(".", import.meta.url).href}${name}.${EXTS[i]}`);
  a.preload = "auto"; a.addEventListener("error", () => load(name, i + 1), { once: true });
  cache[name] = a; return a;
}
export function play(name, volume = 1) {
  if (muted) return;
  const a = name in cache ? cache[name] : load(name);
  if (!a) return synth(name);
  if (a.error) return synth(name);
  const c = a.cloneNode(); c.volume = volume; c.play().catch(() => synth(name));
}
