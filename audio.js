"use strict";

const MEL = [
  0, null, 3, null, 5, null, 7, null,
  5, null, 3, null, 0, null, null, null,
  7, null, 10, null, 12, null, 10, null,
  7, null, 5, null, 3, null, 0, null
];
const BASSF = [110, 130.81, 98, 82.41];

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this._mt = null;
    this._step = 0;
    this._next = 0;
  }

  ensure() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
      this.sfxBus.connect(this.master);
      this.musBus = this.ctx.createGain();
      this.musBus.gain.value = this.musicOn ? 0.3 : 0;
      this.musBus.connect(this.master);
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      this._nb = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._nb.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.sfxBus) this.sfxBus.gain.value = on ? 1 : 0;
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.musBus) this.musBus.gain.value = on ? 0.3 : 0;
  }

  tone(o) {
    if (!this.ctx) return;
    const bus = o.bus || this.sfxBus;
    if (bus === this.sfxBus && !this.sfxOn) return;
    const f = o.f || 440, f2 = o.f2 || 0, type = o.type || "square";
    const dur = o.dur || 0.1, vol = o.vol || 0.15, at = o.at || 0;
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(f, 1), t);
    if (f2) osc.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  noise(o) {
    if (!this.ctx) return;
    const bus = o.bus || this.sfxBus;
    if (bus === this.sfxBus && !this.sfxOn) return;
    const dur = o.dur || 0.2, vol = o.vol || 0.2, at = o.at || 0;
    const t = this.ctx.currentTime + at;
    const s = this.ctx.createBufferSource();
    s.buffer = this._nb; s.loop = true;
    const fl = this.ctx.createBiquadFilter();
    fl.type = o.type || "lowpass";
    fl.frequency.value = o.freq || 1200;
    fl.Q.value = o.q || 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(bus);
    s.start(t); s.stop(t + dur + 0.05);
  }

  click() { this.tone({ f: 700, f2: 520, type: "triangle", dur: 0.06, vol: 0.12 }); }

  eat(c) {
    const base = 380 * Math.pow(1.09, Math.min(c, 10));
    this.tone({ f: base, f2: base * 1.6, type: "square", dur: 0.09, vol: 0.16 });
    this.tone({ f: base * 2, f2: base * 2.4, type: "sine", dur: 0.07, vol: 0.08, at: 0.02 });
  }

  bonus() {
    [660, 880, 1188].forEach((f, i) => this.tone({ f, type: "triangle", dur: 0.12, vol: 0.14, at: i * 0.07 }));
    this.noise({ dur: 0.25, vol: 0.06, type: "highpass", freq: 5000 });
  }

  power() {
    this.tone({ f: 220, f2: 880, type: "sawtooth", dur: 0.28, vol: 0.11 });
    this.tone({ f: 330, type: "triangle", dur: 0.3, vol: 0.1, at: 0.05 });
  }

  expire() { this.tone({ f: 520, f2: 260, type: "sine", dur: 0.18, vol: 0.12 }); }

  level() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone({ f, type: "square", dur: 0.12, vol: 0.11, at: i * 0.08 }));
  }

  die() {
    this.noise({ dur: 0.5, vol: 0.28, freq: 900 });
    this.tone({ f: 280, f2: 52, type: "sawtooth", dur: 0.6, vol: 0.22 });
    this.tone({ f: 140, f2: 40, type: "square", dur: 0.5, vol: 0.13, at: 0.05 });
  }

  over() {
    [392, 311, 262, 196].forEach((f, i) => this.tone({ f, type: "triangle", dur: 0.22, vol: 0.14, at: i * 0.16 }));
  }

  pauseBlip(on) {
    if (on) this.tone({ f: 520, f2: 760, type: "sine", dur: 0.1, vol: 0.1 });
    else this.tone({ f: 760, f2: 420, type: "sine", dur: 0.1, vol: 0.1 });
  }

  musicStart() {
    if (!this.ctx || !this.musicOn || this._mt) return;
    this._step = 0;
    this._next = this.ctx.currentTime + 0.06;
    this._mt = setInterval(() => this._sched(), 40);
  }

  musicStop() {
    if (this._mt) { clearInterval(this._mt); this._mt = null; }
  }

  _sched() {
    if (!this.ctx) return;
    const ahead = this.ctx.currentTime + 0.16;
    while (this._next < ahead) {
      this._play(this._step, this._next);
      this._next += 0.21;
      this._step = (this._step + 1) % 32;
    }
  }

  _play(i, t) {
    const at = Math.max(0, t - this.ctx.currentTime);
    const m = MEL[i];
    if (m !== null && m !== undefined) {
      this.tone({ f: 220 * Math.pow(2, m / 12), type: "triangle", dur: 0.17, vol: 0.38, at, bus: this.musBus });
    }
    if (i % 8 === 0) {
      const bf = BASSF[(i >> 3) & 3];
      this.tone({ f: bf, type: "sine", dur: 0.42, vol: 0.5, at, bus: this.musBus });
      this.tone({ f: 120, f2: 45, type: "sine", dur: 0.12, vol: 0.45, at, bus: this.musBus });
    }
    if (i % 2 === 1) {
      this.noise({ dur: 0.03, vol: 0.05, type: "highpass", freq: 6500, at, bus: this.musBus });
    }
  }
}

window.sound = new SoundEngine();
