// Synthesised sound effects (WebAudio, no asset files). The AudioContext is
// only created after a user gesture, so nothing plays before interaction.

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  enabled = true;

  /** Call from a user gesture (click/keypress). */
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.stopEngine();
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
  }

  private ready(): AudioContext | null {
    return this.enabled && this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, delay = 0, slideTo?: number) {
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.3, freq = 800) {
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter).connect(g).connect(this.master);
    src.start();
  }

  light() {
    this.tone(660, 0.18, 'square', 0.12);
  }
  lightsOut() {
    this.tone(990, 0.25, 'square', 0.14);
    this.noise(0.5, 0.15, 1400);
  }
  mistake() {
    this.tone(140, 0.09, 'triangle', 0.18);
  }
  crash() {
    this.noise(0.7, 0.45, 600);
    this.tone(90, 0.5, 'sawtooth', 0.15, 0, 40);
  }
  overtake() {
    this.tone(500, 0.18, 'sine', 0.12, 0, 900);
  }
  finish() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.18, i * 0.13));
  }
  falseStart() {
    this.tone(220, 0.4, 'sawtooth', 0.15, 0, 110);
  }

  /** Continuous engine note following the player's speed (chars/second). */
  setEngine(speedCps: number) {
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    if (!this.engine) {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc2.type = 'square';
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      gain.gain.value = 0;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(this.master);
      osc.start();
      osc2.start();
      this.engine = { osc, osc2, gain, filter };
    }
    const t = ctx.currentTime;
    const f = 55 + Math.min(12, speedCps) * 16;
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.15);
    this.engine.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.15);
    this.engine.filter.frequency.setTargetAtTime(400 + speedCps * 120, t, 0.2);
    this.engine.gain.gain.setTargetAtTime(speedCps > 0.1 ? 0.035 : 0.012, t, 0.3);
  }

  stopEngine() {
    if (!this.engine || !this.ctx) return;
    const e = this.engine;
    this.engine = null;
    e.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    setTimeout(() => {
      try {
        e.osc.stop();
        e.osc2.stop();
      } catch {
        /* already stopped */
      }
    }, 500);
  }
}

export const sound = new SoundEngine();
