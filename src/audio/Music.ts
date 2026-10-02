import type { Sfx } from './Sfx';

/**
 * Spooky Night's music: one little waltz in D minor ("the Monster Waltz"),
 * re-orchestrated for every island. Everything is synthesized with WebAudio
 * and scheduled ahead of time by a small lookahead sequencer.
 */

// --------------------------------------------------------------- the score
// 3/4 time, written in eighth notes: 6 steps per bar. Tokens are NOTE:steps,
// "-" is a rest.
const MELODY_A1 = [
  'A4:2 D5:2 F5:2', 'E5:2 D5:2 A4:2', 'Bb4:2 D5:2 G5:2', 'F5:4 E5:2',
  'C#5:2 E5:2 A5:2', 'G5:2 F5:2 E5:2', 'F5:3 E5:1 D5:2', 'D5:6',
];
const MELODY_A2 = [
  'F5:2 Bb5:2 A5:2', 'G5:2 F5:2 D5:2', 'G5:2 Bb5:2 D6:2', 'C6:4 Bb5:2',
  'Bb5:2 G5:2 E5:2', 'C#5:2 E5:2 G5:2', 'F5:2 E5:2 C#5:2', 'D5:4 -:2',
];
// The bridge lifts toward F major, then a flattened-ninth A7 pulls it home.
const MELODY_B = [
  'C5:2 F5:2 A5:2', 'C6:3 A5:1 F5:2', 'E5:2 G5:2 C6:2', 'Bb5:4 G5:2',
  'A5:2 F5:2 D5:2', 'F5:2 A5:2 D6:2', 'C#6:3 Bb5:1 G5:2', 'E5:2 C#5:2 A4:2',
];
const CHORDS_A1 = ['Dm', 'Dm', 'Gm', 'Gm', 'A7', 'A7', 'Dm', 'Dm'];
const CHORDS_A2 = ['Bb', 'Bb', 'Gm', 'Gm', 'Edim', 'A7', 'Dm', 'Dm'];
const CHORDS_B = ['F', 'F', 'C', 'C', 'Dm', 'Dm', 'A7', 'A7'];

/** Form: A1 A2 B A2, 32 bars, then round again. */
const FORM: { melody: string; chord: string }[] = [
  ...MELODY_A1.map((m, i) => ({ melody: m, chord: CHORDS_A1[i] })),
  ...MELODY_A2.map((m, i) => ({ melody: m, chord: CHORDS_A2[i] })),
  ...MELODY_B.map((m, i) => ({ melody: m, chord: CHORDS_B[i] })),
  ...MELODY_A2.map((m, i) => ({ melody: m, chord: CHORDS_A2[i] })),
];

/** Chord tones as MIDI notes around octave 3 (root first). */
const CHORD_TONES: Record<string, number[]> = {
  Dm: [50, 53, 57], Gm: [55, 58, 62], A7: [57, 61, 64, 67], Bb: [58, 62, 65],
  Edim: [52, 55, 58], F: [53, 57, 60], C: [48, 52, 55],
};

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function midiOf(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) return 60;
  return 12 * (Number(m[3]) + 1) + NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

interface Note { step: number; midi: number | null; len: number }

function parseBar(bar: string): Note[] {
  const out: Note[] = [];
  let step = 0;
  for (const tok of bar.trim().split(/\s+/)) {
    const [n, l] = tok.split(':');
    const len = Number(l);
    out.push({ step, midi: n === '-' ? null : midiOf(n), len });
    step += len;
  }
  return out;
}

const BARS = FORM.map((b) => ({ notes: parseBar(b.melody), chord: b.chord }));

// ---------------------------------------------------------- arrangements
type Inst = 'musicbox' | 'celesta' | 'harpsichord' | 'pizz' | 'theremin' | 'organ' | 'xylo' | 'bubble';

export interface Arrangement {
  bpm: number;
  transpose: number;
  lead: Inst | null;
  /** Octave shift for the lead. */
  leadOctave?: number;
  /** Second voice doubling the melody an octave up, every other bar. */
  counter?: Inst;
  bass: Inst | null;
  /** Off-beat chord voice ("oom-pah-pah"), or an eighth-note arpeggio. */
  chords: Inst | null;
  arp?: boolean;
  /** A held pad under each bar. */
  pad?: Inst;
  perc?: 'tick' | 'xylo';
  /** Shortens every melody note (bouncy). */
  staccato?: boolean;
  /** Only play the melody on alternate phrases (cold, empty places). */
  sparse?: boolean;
  /** Phrygian-dominant colour: E becomes E flat. */
  exotic?: boolean;
  reverb: number;
  volume?: number;
}

/** Title screen, then one per Spooky Night island (index = island). */
export const TITLE_ARRANGEMENT: Arrangement = { bpm: 96, transpose: 0, lead: 'musicbox', bass: null, chords: 'celesta', arp: true, reverb: 0.55 };
export const ARRANGEMENTS: Arrangement[] = [
  // 1 Pumpkin Patch: music box over plucked strings.
  { bpm: 112, transpose: 0, lead: 'musicbox', bass: 'pizz', chords: 'pizz', reverb: 0.3 },
  // 2 Graveyard: bone xylophone and a low organ.
  { bpm: 92, transpose: 0, lead: 'xylo', bass: 'organ', chords: null, pad: 'organ', perc: 'tick', reverb: 0.45 },
  // 3 Trick-or-Treat: up a fourth, quick and bouncy.
  { bpm: 132, transpose: 5, lead: 'harpsichord', bass: 'pizz', chords: 'musicbox', staccato: true, perc: 'xylo', reverb: 0.2 },
  // 4 Frozen Crypt: a lonely celesta in a big cold room.
  { bpm: 88, transpose: 0, lead: 'celesta', leadOctave: 1, bass: 'pizz', chords: null, pad: 'organ', sparse: true, reverb: 0.75 },
  // 5 Witch's Brewery: bubbling bass and a wobbly theremin.
  { bpm: 108, transpose: -2, lead: 'theremin', bass: 'bubble', chords: 'harpsichord', reverb: 0.35 },
  // 6 Mummy Tomb: phrygian colour and a dry woodblock.
  { bpm: 100, transpose: 0, lead: 'harpsichord', bass: 'pizz', chords: null, arp: false, perc: 'tick', exotic: true, reverb: 0.3 },
  // 7 Haunted Mansion: harpsichord waltz, theremin on top.
  { bpm: 104, transpose: 0, lead: 'theremin', counter: 'harpsichord', bass: 'pizz', chords: 'harpsichord', reverb: 0.5 },
  // 8 Vampire Castle: slow, grand, organ.
  { bpm: 84, transpose: -3, lead: 'organ', bass: 'organ', chords: null, pad: 'organ', reverb: 0.6 },
  // 9 Mad Scientist Lab: racing harpsichord arpeggios.
  { bpm: 128, transpose: 2, lead: 'theremin', bass: 'pizz', chords: 'harpsichord', arp: true, perc: 'tick', reverb: 0.25 },
  // 10 Witch's Sky: airy music box with a celesta counter-melody.
  { bpm: 100, transpose: 3, lead: 'musicbox', counter: 'celesta', bass: 'pizz', chords: 'celesta', arp: true, reverb: 0.6 },
];

const MUSIC_KEY = 'clawisland.music';
const STEPS_PER_BAR = 6;
const LOOKAHEAD = 0.12;

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// ---------------------------------------------------------------- engine
export class Music {
  enabled = true;
  private arr: Arrangement = TITLE_ARRANGEMENT;
  private nextArr: Arrangement | null = null;
  private playing = false;
  private bar = 0;
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  private lastLead = 0;
  private ducked = 0;
  /** Silences the loop for a moment while a cue plays. */
  private holdUntil = 0;
  private nodes: {
    ctx: AudioContext;
    input: GainNode;
    wet: GainNode;
    tone: BiquadFilterNode;
    out: GainNode;
    noise: AudioBuffer;
  } | null = null;

  constructor(private sfx: Sfx) {
    try { this.enabled = localStorage.getItem(MUSIC_KEY) !== 'off'; } catch { /* ignore */ }
  }

  /** Start (or switch to) an arrangement. Safe to call before audio is unlocked. */
  play(arr: Arrangement): void {
    if (this.playing && arr !== this.arr) this.nextArr = arr;
    else this.arr = arr;
    this.playing = true;
    this.kick();
  }

  playIsland(index: number): void {
    this.play(ARRANGEMENTS[index % ARRANGEMENTS.length]);
  }

  stop(): void {
    this.playing = false;
  }

  /** Lower the music (pause menu, results). */
  duck(level: 0 | 1 | 2): void {
    this.ducked = level;
    this.applyLevel(0.25);
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    try { localStorage.setItem(MUSIC_KEY, this.enabled ? 'on' : 'off'); } catch { /* ignore */ }
    this.applyLevel(0.15);
    return this.enabled;
  }

  /** Call after the first user gesture (the audio context exists from then on). */
  kick(): void {
    if (!this.ensureNodes() || this.timer) return;
    this.nextTime = this.nodes!.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.tick(), 25);
    this.applyLevel(0.4);
  }

  // ------------------------------------------------------------- cues
  /** Island cleared: a rising arpeggio and a bell chord. */
  cueClear(): void {
    const n = this.ensureNodes() ? this.nodes! : null;
    if (!n || !this.enabled) return;
    const t = n.ctx.currentTime + 0.05;
    this.holdUntil = t + 1.6;
    [62, 65, 69, 74].forEach((m, i) => this.voice('harpsichord', t + i * 0.11, m, 0.3, 0.5));
    for (const m of [74, 77, 81]) this.voice('musicbox', t + 0.5, m, 1.2, 0.35);
    this.voice('pizz', t + 0.5, 50, 0.6, 0.6);
  }

  /** "It's alive!": the minor waltz finally resolves to D major. */
  cueAlive(): void {
    const n = this.ensureNodes() ? this.nodes! : null;
    if (!n || !this.enabled) return;
    const t = n.ctx.currentTime + 0.05;
    this.holdUntil = t + 3.4;
    [57, 61, 64, 67].forEach((m, i) => this.voice('organ', t + i * 0.18, m, 0.5, 0.4));
    for (const m of [50, 54, 57, 62, 66]) this.voice('organ', t + 0.9, m, 2.2, 0.35);
    [74, 78, 81, 86, 90].forEach((m, i) => this.voice('musicbox', t + 0.9 + i * 0.12, m, 1.4, 0.4));
    this.voice('pizz', t + 0.9, 38, 1.0, 0.7);
  }

  // ---------------------------------------------------------- internals
  private ensureNodes(): boolean {
    if (this.nodes) return true;
    const c = this.sfx.context();
    if (!c) return false;
    const { ctx, master } = c;
    const input = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 12000;
    const out = ctx.createGain();
    out.gain.value = 0;
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(ctx, 2.6);
    input.connect(dry).connect(tone);
    input.connect(verb).connect(wet).connect(tone);
    tone.connect(out).connect(master);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nodes = { ctx, input, wet, tone, out, noise };
    return true;
  }

  /** A soft stereo hall: decaying noise. */
  private impulse(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  private applyLevel(time: number): void {
    if (!this.nodes) return;
    const { ctx, out, tone, wet } = this.nodes;
    const vol = !this.enabled || this.sfx.muted || !this.playing ? 0 : (this.arr.volume ?? 0.55) * (this.ducked === 2 ? 0.35 : this.ducked === 1 ? 0.6 : 1);
    out.gain.setTargetAtTime(vol, ctx.currentTime, time);
    tone.frequency.setTargetAtTime(this.ducked === 2 ? 900 : 12000, ctx.currentTime, 0.2);
    wet.gain.setTargetAtTime(this.arr.reverb, ctx.currentTime, 0.5);
  }

  private tick(): void {
    if (!this.nodes) return;
    const { ctx } = this.nodes;
    this.applyLevel(0.3);
    if (!this.playing) return;
    // Throttled background tabs: skip ahead instead of bursting old notes.
    if (this.nextTime < ctx.currentTime - 0.05) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      if (this.step === 0 && this.nextArr) {
        this.arr = this.nextArr;
        this.nextArr = null;
      }
      if (this.nextTime >= this.holdUntil) this.scheduleStep(this.nextTime);
      const eighth = 60 / this.arr.bpm / 2;
      this.nextTime += eighth;
      this.step++;
      if (this.step >= STEPS_PER_BAR) {
        this.step = 0;
        this.bar = (this.bar + 1) % BARS.length;
      }
    }
  }

  private scheduleStep(t: number): void {
    const a = this.arr;
    const bar = BARS[this.bar];
    const eighth = 60 / a.bpm / 2;
    const tr = a.transpose;
    const chord = CHORD_TONES[bar.chord];
    // Melody.
    const phrase = Math.floor(this.bar / 4);
    const melodyOn = !a.sparse || phrase % 2 === 0;
    for (const n of bar.notes) {
      if (n.step !== this.step || n.midi === null) continue;
      let m = n.midi;
      if (a.exotic && m % 12 === 4) m -= 1;
      const dur = n.len * eighth * (a.staccato ? 0.45 : 0.95);
      if (melodyOn && a.lead) this.voice(a.lead, t, m + tr + 12 * (a.leadOctave ?? 0), dur, 0.55);
      if (a.counter && this.bar % 2 === 1) this.voice(a.counter, t + eighth * 0.02, m + tr + 12, dur * 0.8, 0.28);
    }
    // Bass on the downbeat.
    if (this.step === 0 && a.bass) this.voice(a.bass, t, chord[0] + tr - 12, eighth * 2.2, 0.6);
    // Pad: the whole chord held for the bar.
    if (this.step === 0 && a.pad) for (const m of chord.slice(0, 3)) this.voice(a.pad, t, m + tr, eighth * 5.8, 0.16);
    // Chords: "pah-pah" on beats two and three, or a rolling arpeggio.
    if (a.chords) {
      if (a.arp) {
        const m = chord[[0, 1, 2, 1, 2, 1][this.step] % chord.length] + 12;
        this.voice(a.chords, t, m + tr, eighth * 0.9, 0.22);
      } else if (this.step === 2 || this.step === 4) {
        for (const m of chord.slice(1)) this.voice(a.chords, t, m + tr + 12, eighth * 0.8, 0.18);
      }
    }
    // Percussion.
    if (a.perc === 'tick' && this.step % 2 === 0) this.noiseHit(t, this.step === 0 ? 0.35 : 0.18, this.step === 0 ? 1400 : 2600);
    if (a.perc === 'xylo' && this.step === 5) this.voice('xylo', t, chord[0] + tr + 24, eighth, 0.18);
  }

  /** One synthesized note. */
  private voice(inst: Inst, t: number, midi: number, dur: number, vel: number): void {
    if (!this.nodes) return;
    const { ctx, input } = this.nodes;
    const f = freq(midi);
    const env = ctx.createGain();
    env.connect(input);
    const osc = (type: OscillatorType, hz: number, gain = 1, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(hz, t);
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(env);
      return o;
    };
    const pluck = (peak: number, decay: number, total: number) => {
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(peak, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, Math.min(total, decay)));
    };
    let stopAt = t + dur + 0.1;
    const oscs: OscillatorNode[] = [];
    switch (inst) {
      case 'musicbox': {
        // Bright tine: fundamental plus inharmonic partials, long ring.
        oscs.push(osc('sine', f, 1), osc('sine', f * 2.76, 0.18), osc('sine', f * 5.4, 0.05));
        pluck(0.32 * vel, 1.4, 1.4);
        stopAt = t + 1.5;
        break;
      }
      case 'celesta': {
        oscs.push(osc('sine', f, 1), osc('sine', f * 2, 0.12), osc('triangle', f * 4, 0.04));
        pluck(0.3 * vel, 0.9, 0.9);
        stopAt = t + 1.0;
        break;
      }
      case 'harpsichord': {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(3200, t);
        lp.frequency.exponentialRampToValueAtTime(900, t + 0.3);
        env.disconnect();
        env.connect(lp).connect(input);
        oscs.push(osc('sawtooth', f, 0.6), osc('square', f * 2, 0.15, 4));
        pluck(0.16 * vel, Math.min(0.6, dur + 0.15), dur + 0.15);
        stopAt = t + Math.min(0.7, dur + 0.2);
        break;
      }
      case 'pizz': {
        oscs.push(osc('triangle', f, 1), osc('sine', f * 2, 0.25));
        pluck(0.42 * vel, 0.32, 0.32);
        stopAt = t + 0.4;
        break;
      }
      case 'bubble': {
        const o = osc('sine', f * 0.7, 1);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
        oscs.push(o, osc('triangle', f * 2, 0.15));
        pluck(0.45 * vel, 0.28, 0.28);
        stopAt = t + 0.35;
        break;
      }
      case 'xylo': {
        oscs.push(osc('square', f, 0.35), osc('triangle', f * 3, 0.5), osc('sine', f * 6.2, 0.1));
        pluck(0.22 * vel, 0.14, 0.14);
        stopAt = t + 0.2;
        break;
      }
      case 'theremin': {
        // Gliding sine with a slow, wide vibrato.
        const o = osc('sine', this.lastLead || f, 1);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.2;
        const depth = ctx.createGain();
        depth.gain.value = f * 0.014;
        lfo.connect(depth).connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + dur + 0.35);
        oscs.push(o, osc('triangle', f * 2, 0.06));
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(0.2 * vel, t + 0.07);
        env.gain.setValueAtTime(0.2 * vel, t + Math.max(0.08, dur));
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
        stopAt = t + dur + 0.35;
        this.lastLead = f;
        break;
      }
      case 'organ': {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1500;
        env.disconnect();
        env.connect(lp).connect(input);
        oscs.push(osc('square', f, 0.3, -6), osc('square', f, 0.3, 6), osc('sine', f / 2, 0.5));
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(0.14 * vel, t + 0.06);
        env.gain.setValueAtTime(0.14 * vel, t + Math.max(0.07, dur));
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
        stopAt = t + dur + 0.25;
        break;
      }
    }
    for (const o of oscs) {
      o.start(t);
      o.stop(stopAt);
    }
    oscs[0].onended = () => env.disconnect();
  }

  /** Woodblock-ish click: a short band-passed noise burst. */
  private noiseHit(t: number, vel: number, hz: number): void {
    if (!this.nodes) return;
    const { ctx, input, noise } = this.nodes;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = hz;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.connect(bp).connect(g).connect(input);
    src.start(t);
    src.stop(t + 0.08);
  }
}
