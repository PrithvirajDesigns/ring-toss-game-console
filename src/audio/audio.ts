/**
 * Procedural chiptune audio, Web Audio only (no sample files).
 *  - pump whoosh: filtered noise that opens up and gets louder with jet pressure
 *  - backflow "gulp" on release, bubble pops, plastic ticks on collisions
 *  - ring landing: a crisp "clack" + a rising chime (pitch climbs with your progress)
 *  - win jingle, and a gentle looping reef tune with a look-ahead scheduler
 * The host owns the AudioContext and resumes it on a user gesture; if it's missing or
 * suspended, every call is a cheap no-op.
 */

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface PumpVoice { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode; }

export class GameAudio {
  private master: GainNode;
  private sfx: GainNode;
  private musicBus: GainNode;
  private noise: AudioBuffer;
  private pumps: (PumpVoice | null)[] = [null, null];
  private lastTick = 0;
  private lastPop = 0;
  private soundOn = true;
  private musicOn = true;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private duck = 1;

  constructor(private ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.22;
    // soften the music: a gentle low-pass so square waves sound like a toy, not a buzzer
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    this.musicBus.connect(lp); lp.connect(this.master);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private get live(): boolean { return this.ctx.state === 'running'; }
  private get now(): number { return this.ctx.currentTime; }

  setEnabled(sound: boolean, music: boolean): void {
    this.soundOn = sound;
    this.musicOn = music;
    this.sfx.gain.setTargetAtTime(sound ? 1 : 0, this.now, 0.02);
    this.musicBus.gain.setTargetAtTime(sound && music ? 0.22 * this.duck : 0, this.now, 0.1);
    if (!sound) for (let i = 0; i < this.pumps.length; i++) this.stopPump(i, 0);
  }

  /** Quieter music while paused / on results. */
  setDuck(d: number): void {
    this.duck = d;
    if (this.soundOn && this.musicOn) this.musicBus.gain.setTargetAtTime(0.22 * d, this.now, 0.15);
  }

  // ---------- pump ----------
  startPump(i: number): void {
    if (!this.live || !this.soundOn) return;
    this.stopPump(i, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.Q.value = 0.9; filter.frequency.value = 500;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.18, this.now, 0.01);
    src.connect(filter); filter.connect(gain); gain.connect(this.sfx);
    src.start();
    this.pumps[i] = { src, filter, gain };
    this.bubble(1.3);
  }

  /** Per frame: whoosh follows the jet pressure of each nozzle. */
  updatePumps(pressure: number[]): void {
    if (!this.live) return;
    pressure.forEach((p, i) => {
      const v = this.pumps[i];
      if (!v) return;
      v.filter.frequency.setTargetAtTime(350 + Math.max(0, p) * 2600, this.now, 0.03);
      v.gain.gain.setTargetAtTime(0.04 + Math.max(0, p) * 0.32, this.now, 0.03);
    });
  }

  stopPump(i: number, pressure: number): void {
    const v = this.pumps[i];
    if (v) {
      v.gain.gain.setTargetAtTime(0, this.now, 0.12);
      v.src.stop(this.now + 0.6);
      this.pumps[i] = null;
    }
    if (pressure > 0.1 && this.live && this.soundOn) {
      // backflow gulp
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(190, this.now);
      o.frequency.exponentialRampToValueAtTime(70, this.now + 0.14);
      g.gain.setValueAtTime(0.0001, this.now);
      g.gain.exponentialRampToValueAtTime(0.25 * pressure, this.now + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, this.now + 0.16);
      o.connect(g); g.connect(this.sfx);
      o.start(); o.stop(this.now + 0.2);
    }
  }

  // ---------- one-shots ----------
  private blip(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, when = this.now): void {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(this.sfx);
    o.start(when); o.stop(when + dur + 0.02);
  }

  private noiseHit(freq: number, q: number, dur: number, vol: number, when = this.now): void {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(when, Math.random() * 0.5); s.stop(when + dur + 0.02);
  }

  bubble(intensity = 1): void {
    if (!this.live || !this.soundOn) return;
    const t = this.now;
    if (t - this.lastPop < 0.05) return;
    this.lastPop = t;
    const f = 500 + Math.random() * 900;
    this.blip('sine', f, f * 2.2, 0.06, 0.05 * intensity);
  }

  /** Soft plastic tick on collisions (rate-limited). */
  tick(speed: number): void {
    if (!this.live || !this.soundOn) return;
    const t = this.now;
    if (t - this.lastTick < 0.045) return;
    this.lastTick = t;
    const v = Math.min(0.16, speed / 400);
    this.noiseHit(3200 + Math.random() * 1200, 4, 0.025, v);
    this.blip('triangle', 2100 + Math.random() * 400, 1700, 0.02, v * 0.6);
  }

  /** The satisfying one: a ring drops onto its stack. */
  clack(speed: number): void {
    if (!this.live || !this.soundOn) return;
    const v = Math.min(0.4, 0.18 + speed / 150);
    this.noiseHit(1900, 2.5, 0.05, v);
    this.blip('square', 880, 520, 0.05, v * 0.35);
    this.blip('triangle', 330, 180, 0.08, v * 0.6);
  }

  /** Rising chime; `progress` (rings scored) pushes it up the scale. */
  chime(progress: number): void {
    if (!this.live || !this.soundOn) return;
    const t = this.now + 0.03;
    for (let k = 0; k < 3; k++) {
      const idx = progress + k;
      const note = 72 + PENTA[idx % 5] + 12 * Math.floor(idx / 5);
      this.blip('triangle', midi(Math.min(note, 100)), midi(Math.min(note, 100)) * 1.002, 0.35, 0.12, t + k * 0.06);
      this.blip('sine', midi(Math.min(note + 12, 108)), midi(Math.min(note + 12, 108)), 0.25, 0.04, t + k * 0.06);
    }
  }

  jingle(): void {
    if (!this.live || !this.soundOn) return;
    const t = this.now + 0.05;
    const mel = [72, 76, 79, 84, 79, 84, 88];
    const dur = [0.1, 0.1, 0.1, 0.2, 0.1, 0.12, 0.5];
    let at = t;
    mel.forEach((n, i) => {
      this.blip('square', midi(n), midi(n), dur[i] + 0.05, 0.08, at);
      this.blip('triangle', midi(n - 24), midi(n - 24), dur[i] + 0.05, 0.12, at);
      at += dur[i];
    });
  }

  // ---------- music: 8 bars, I–vi–IV–V in C, looped ----------
  private static readonly BPM = 92;
  private static readonly CHORDS = [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 53]];
  private static readonly MELODY = [ // one per 8th note over 8 bars (64 slots); -1 = rest
    76, -1, 79, -1, 81, 79, 76, -1, 74, -1, 76, -1, 72, -1, -1, -1,
    72, -1, 76, -1, 79, 81, 79, -1, 77, -1, 76, -1, 74, -1, -1, -1,
    76, -1, 79, -1, 84, -1, 83, 81, 79, -1, 76, -1, 74, 76, 72, -1,
    69, -1, 72, -1, 74, 76, 74, -1, 72, -1, -1, -1, 67, -1, -1, -1,
  ];

  startMusic(): void {
    if (this.musicTimer || !this.live) return;
    this.nextNoteTime = this.now + 0.1;
    this.step = 0;
    this.musicTimer = setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private note(type: OscillatorType, n: number, when: number, dur: number, vol: number): void {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = midi(n);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(this.musicBus);
    o.start(when); o.stop(when + dur + 0.02);
  }

  private schedule(): void {
    if (!this.live) return;
    const eighth = 60 / GameAudio.BPM / 2;
    while (this.nextNoteTime < this.now + 0.15) {
      const s = this.step % 64, bar = Math.floor(s / 8) % 4;
      const chord = GameAudio.CHORDS[bar], t = this.nextNoteTime;
      if (s % 4 === 0) this.note('triangle', chord[0] - 12, t, eighth * 3.6, 0.5); // bass on beats
      if (s % 4 === 2) this.note('triangle', chord[0] - 5, t, eighth * 1.6, 0.25);
      // shimmering arpeggio
      this.note('square', chord[(s * 3) % 4] + 12, t, eighth * 0.8, 0.07);
      const m = GameAudio.MELODY[s];
      if (m > 0) this.note('triangle', m, t, eighth * 1.8, 0.22);
      if (s % 16 === 13 && Math.random() < 0.5) this.note('sine', 96 + PENTA[(Math.random() * 5) | 0], t, 0.08, 0.05); // bubble sparkle
      this.nextNoteTime += eighth;
      this.step++;
    }
  }

  destroy(): void {
    this.stopMusic();
    for (let i = 0; i < this.pumps.length; i++) this.stopPump(i, 0);
    try { this.master.disconnect(); } catch { /* ignore */ }
  }
}
