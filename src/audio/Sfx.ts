type Wave = OscillatorType;

/** Tiny WebAudio synth. No asset files; everything is generated. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  /** Set while the app is in the background: nothing may wake the audio then. */
  private hidden = false;
  /**
   * The context went through a background trip or an OS interruption. iOS
   * WebKit often leaves such a context dead (it may even report 'running'
   * while staying silent), so the next tap replaces it with a fresh one.
   */
  private stale = false;

  /**
   * Must be called from a user gesture (mobile Safari). Creates the context on
   * the first tap, wakes a suspended one, and rebuilds one left dead by iOS.
   */
  unlock(): void {
    if (this.hidden) return;
    if (this.ctx && this.stale) this.replaceContext();
    if (this.ctx) {
      if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => { /* retried on the next tap */ });
      return;
    }
    this.createContext();
  }

  private createContext(): void {
    try {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(ctx.destination);
      this.stale = false;
      // An OS interruption (call, Siri, another app's audio) can kill the context too.
      ctx.onstatechange = () => {
        if ((ctx.state as string) === 'interrupted' || (ctx.state === 'suspended' && !this.hidden && !this.selfSuspended)) this.stale = true;
      };
      // Playing a silent sample inside the tap is what fully unlocks iOS audio.
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      if (ctx.state !== 'running') void ctx.resume().catch(() => { /* ignore */ });
      this.generation++;
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  private replaceContext(): void {
    const old = this.ctx;
    this.ctx = null;
    this.master = null;
    if (old) {
      old.onstatechange = null;
      void old.close().catch(() => { /* ignore */ });
    }
    this.createContext();
  }

  /** Bumps whenever a new context is created (music rebuilds its graph on change). */
  generation = 0;
  private selfSuspended = false;

  /** App went to the background: silence everything (music included). */
  suspend(): void {
    this.hidden = true;
    this.stale = true;
    this.selfSuspended = true;
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => { /* ignore */ });
  }

  /** App is back in front. The audio itself comes back on the next tap (see unlock()). */
  wake(): void {
    this.hidden = false;
    this.selfSuspended = false;
  }

  /** The shared audio context and master bus, once unlocked (music plays through them too). */
  context(): { ctx: AudioContext; master: GainNode } | null {
    return this.ctx && this.master ? { ctx: this.ctx, master: this.master } : null;
  }

  tone(freq: number, dur: number, type: Wave = 'square', gain = 0.15, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  descend(): void { this.tone(520, 0.35, 'triangle', 0.12, 220); }
  grab(): void { this.tone(440, 0.12, 'sawtooth', 0.1, 660); this.tone(660, 0.1, 'square', 0.08, 880, 0.1); }
  miss(): void { this.tone(300, 0.18, 'triangle', 0.1, 180); }
  slip(): void { this.tone(500, 0.25, 'sawtooth', 0.1, 200); }
  /** Metallic rattle: the grip is failing. */
  rattle(): void {
    for (let i = 0; i < 7; i++) this.tone(1400 + (i % 2) * 300, 0.035, 'square', 0.05, 900, i * 0.055);
  }
  release(): void { this.tone(380, 0.08, 'triangle', 0.08, 300); }
  buttonPress(): void { this.tone(180, 0.2, 'square', 0.14, 90); this.tone(120, 0.3, 'sine', 0.16, 60, 0.1); }
  trapdoor(): void {
    this.tone(160, 0.4, 'sawtooth', 0.12, 50);
    this.tone(90, 0.5, 'triangle', 0.14, 40, 0.2);
  }
  deliver(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => this.tone(n, 0.16, 'square', 0.09, undefined, i * 0.07));
  }
  wrong(): void { this.tone(220, 0.15, 'square', 0.1, 150); this.tone(150, 0.25, 'square', 0.1, 100, 0.12); }
  returned(): void { this.tone(700, 0.08, 'sine', 0.08); this.tone(900, 0.08, 'sine', 0.08, undefined, 0.1); }
  fanfare(): void {
    const seq = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    seq.forEach((n, i) => this.tone(n, 0.2, 'square', 0.09, undefined, i * 0.11));
  }
  cluck(): void { this.tone(900, 0.06, 'square', 0.05, 1300); this.tone(700, 0.08, 'square', 0.05, 500, 0.08); }
  squawk(): void {
    this.tone(1200, 0.12, 'sawtooth', 0.09, 1800);
    this.tone(1600, 0.18, 'sawtooth', 0.09, 700, 0.1);
    this.tone(1100, 0.1, 'square', 0.06, 600, 0.26);
  }
  /** Rails locking together. */
  clank(): void { this.tone(220, 0.08, 'square', 0.12, 160); this.tone(330, 0.12, 'square', 0.1, 240, 0.09); }
  /** Short motor hum, repeated while the crane travels. */
  hum(): void { this.tone(95, 0.32, 'triangle', 0.07, 100); }
  arrive(): void { this.tone(520, 0.1, 'square', 0.08, 780); this.tone(780, 0.14, 'square', 0.08, 1040, 0.1); }
  star(): void { this.tone(880, 0.12, 'triangle', 0.12, 1320); }
  tick(): void { this.tone(1200, 0.03, 'sine', 0.04); }
}
