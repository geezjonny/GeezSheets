// Sound effects. Drop files into this folder named after the effect (e.g. click.mp3, door-open.mp3; .ogg/.wav also work).
// If a file is missing, a short synthesized sound plays instead so the app is never silent or broken.
const NAMES = { click: [880, 0.04], "door-open": [140, 0.25], "door-close": [100, 0.2], "dice-roll": [520, 0.08] };   // fallback synth: [frequency Hz, seconds]
const EXTS = ["mp3", "ogg", "wav"];
const cache = {};   // name -> Audio | null (null = no file, use synth)
let ctx = null;
export let muted = false;
try { muted = localStorage.getItem("vtt-muted") === "1"; } catch {}
export const setMuted = (m) => { muted = m; try { localStorage.setItem("vtt-muted", m ? "1" : "0"); } catch {} };

// Hand-made fanfares (no audio files): nat20 = rising arpeggio + sparkle, nat1 = sad descending "wah-wah" + thud.
function tone(type, f0, f1, t, d, vol, filter) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  let n = o; if (filter) { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = filter; o.connect(lp); n = lp; }
  n.connect(g).connect(ctx.destination); o.start(t); o.stop(t + d + 0.02);
}
const SPECIAL = {
  nat20(t) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone("triangle", f, f, t + i * 0.085, 0.35, 0.09));
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f) => tone("sine", f, f, t + 0.36, 1.1, 0.05));
    for (let i = 0; i < 9; i++) tone("sine", 2000 + Math.random() * 2500, 0, t + 0.4 + i * 0.07, 0.18, 0.025);
  },
  nat1(t) {
    [[311.1, 0], [293.7, 0.32], [277.2, 0.64]].forEach(([f, o]) => tone("sawtooth", f, f * 0.98, t + o, 0.3, 0.07, 900));
    tone("sawtooth", 261.6, 130, t + 0.96, 0.9, 0.08, 700);
    tone("sine", 90, 38, t, 0.5, 0.2);
  },
};
function synth(name) {
  if (SPECIAL[name]) { try { ctx ||= new AudioContext(); if (ctx.state === "suspended") ctx.resume(); SPECIAL[name](ctx.currentTime + 0.01); } catch {} return; }
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
