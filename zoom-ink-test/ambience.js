// Local listening preferences. No AudioContext, nodes, or timer until the speaker is tapped.
import { T } from './world.js';
import { timeOf } from './clock.js';

export class Ambience {
  constructor(app) {
    this.app = app; this.enabled = false; this.volume = .35; this.context = null; this.layers = {};
    this.button = document.createElement('button'); this.button.id = 'soundBtn'; this.button.title = 'Ambient sound'; this.button.setAttribute('aria-label', 'Ambient sound'); this.button.setAttribute('aria-pressed', 'false'); this.button.textContent = '🔇'; document.getElementById('top').append(this.button);
    this.pop = document.createElement('div'); this.pop.id = 'soundPop'; this.pop.className = 'panel'; this.pop.hidden = true;
    const label = document.createElement('label'); label.textContent = 'Ambience volume ';
    this.slider = document.createElement('input'); this.slider.type = 'range'; this.slider.min = 0; this.slider.max = 1; this.slider.step = .01; this.slider.value = this.volume; this.slider.setAttribute('aria-label', 'Ambience volume');
    this.slider.oninput = () => { this.volume = Number(this.slider.value); this.mix(); };
    label.append(this.slider); this.pop.append(label); document.body.append(this.pop);
    this.pop.addEventListener('pointerdown', e => e.stopPropagation());
    this.button.onclick = () => { this.pop.hidden = this.enabled; this.toggle(!this.enabled).catch(() => { this.enabled = false; this.button.textContent = '🔇'; this.button.setAttribute('aria-pressed', 'false'); this.pop.hidden = true; clearInterval(this.timer); app.ui.toast('Sound is unavailable in this browser'); }); };
    document.addEventListener('visibilitychange', () => { if (!this.context || !this.enabled) return; if (document.hidden) this.context.suspend(); else this.context.resume().then(() => this.mix()); });
  }
  create() {
    const C = window.AudioContext || window.webkitAudioContext;
    this.context = new C(); const c = this.context;
    this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(c.destination);
    // Six short synthesized beds. The audio thread handles all playback and smoothing.
    for (const [name, cutoff, type] of [['wind', 420, 'lowpass'], ['rain', 2600, 'lowpass'], ['surf', 650, 'lowpass'], ['birds', 2200, 'highpass'], ['crickets', 3400, 'highpass'], ['town', 700, 'lowpass']]) {
      const duration = 12, buffer = c.createBuffer(1, c.sampleRate * duration, c.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / c.sampleRate, noise = Math.random() * 2 - 1;
        if (name === 'birds') data[i] = Math.sin(2 * Math.PI * 2400 * t + 12 * Math.sin(t * Math.PI * 8)) * Math.max(0, Math.sin(t * Math.PI * 2 / 3)) ** 24 * .28;
        else if (name === 'crickets') data[i] = Math.sin(2 * Math.PI * 4200 * t) * Math.max(0, Math.sin(t * Math.PI * 24)) ** 8 * (.5 + .5 * Math.sin(t * Math.PI / 2)) * .18;
        else if (name === 'town') data[i] = (noise * .3 + Math.sin(t * Math.PI * 240 + Math.sin(t * Math.PI * 2)) * .25) * (.55 + .45 * Math.sin(t * Math.PI * 4 / 3));
        else data[i] = noise * (name === 'rain' ? .65 : .45 + .3 * Math.sin(t * Math.PI / 3));
        data[i] *= Math.min(1, t * 20, (duration - t) * 20);
      }
      const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
      source.buffer = buffer; source.loop = true; filter.type = type; filter.frequency.value = cutoff; gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(this.master); source.start(); this.layers[name] = gain;
    }
  }
  async toggle(on) {
    const version = this.version = (this.version || 0) + 1;
    this.enabled = on; this.button.textContent = on ? '🔊' : '🔇'; this.button.setAttribute('aria-pressed', String(on));
    clearInterval(this.timer); this.timer = null;
    if (on) {
      if (!this.context) this.create();
      await this.context.resume();
      if (version !== this.version || !this.enabled) return;
      this.mix(); this.timer = setInterval(() => this.mix(), 750);
    } else if (this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime); this.master.gain.value = 0;
      await this.context.suspend();
    }
  }
  mix() {
    if (!this.enabled || !this.context || document.hidden) return;
    const a = this.app, p = a.controls.target, w = a.world, close = 1 / (1 + (a.camDist() / 1300) ** 2);
    let coast = 0, forest = 0, high = 0;
    for (let k = 0; k < 9; k++) {
      const angle = k * 2.4, r = k ? 100 + k * 35 : 0, type = w.typeAt(p.x + Math.cos(angle) * r, p.z + Math.sin(angle) * r);
      if (type <= T.BEACH) coast++;
      if (type === T.FOREST) forest++;
      if (type === T.HILLS || type === T.MOUNTAIN || type === T.SNOW) high++;
    }
    const { hour } = timeOf(w), day = hour >= 7 && hour < 19, weather = a.weather.weatherAt(p.x, p.z).goal;
    let town = 0;
    for (const s of w.data.settlements) if (['city', 'town', 'village', 'hamlet', 'farm', 'crossing'].includes(s.kind)) town = Math.max(town, Math.max(0, 1 - Math.hypot(p.x - s.x, p.z - s.z) / (s.r + 180)));
    const levels = { wind: .08 + high / 9 * .16 + weather.rain * .1, rain: weather.rain * .22, surf: coast / 9 * .3 * close, birds: day ? forest / 9 * .35 * close / (1 + weather.rain) : 0, crickets: day ? 0 : .17 * close / (1 + weather.rain * 2), town: day ? town * .12 * close : 0 };
    this.levels = levels;
    const now = this.context.currentTime; this.master.gain.setTargetAtTime(this.volume, now, .1);
    for (const [name, level] of Object.entries(levels)) this.layers[name].gain.setTargetAtTime(level, now, .6);
  }
}
