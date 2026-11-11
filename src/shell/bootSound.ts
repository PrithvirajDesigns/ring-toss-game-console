/**
 * The logo score for the power-on sequence: a small mixed synth "studio" in Web Audio
 * (compressor bus, generated stereo reverb, unison pads, kick/snare, FM bells), locked to
 * the boot's beats. Everything is synthesized; nothing is sampled.
 */
interface Beats { barsR: number; w1: number; barsL: number; w2: number; tag: number; }

let cached: { ctx: AudioContext; comp: DynamicsCompressorNode; verbIn: GainNode; noise: AudioBuffer } | null = null;

function studio(ctx: AudioContext) {
  if (cached && cached.ctx === ctx) return cached;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.18;
  const master = ctx.createGain(); master.gain.value = 0.8;
  comp.connect(master); master.connect(ctx.destination);
  const len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch); let lp = 0;
    for (let i = 0; i < len; i++) { const n = Math.random() * 2 - 1; lp = lp * 0.55 + n * 0.45; d[i] = lp * Math.pow(1 - i / len, 2.6) * (i < 220 ? i / 220 : 1); }
  }
  const verb = ctx.createConvolver(); verb.buffer = ir;
  const verbIn = ctx.createGain(), verbOut = ctx.createGain(); verbOut.gain.value = 0.34;
  verbIn.connect(verb); verb.connect(verbOut); verbOut.connect(comp);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  cached = { ctx, comp, verbIn, noise };
  return cached;
}

export function playLogoScore(ctx: AudioContext, B: Beats, short: boolean): void {
  if (ctx.state !== 'running') return;
  const S = studio(ctx);
  const T0 = ctx.currentTime + 0.03;
  const at = (x: number) => T0 + x;
  const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

  const strip = (vol: number, pan = 0, send = 0.2) => {
    const g = ctx.createGain(); g.gain.value = vol;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; g.connect(p); p.connect(S.comp); } else g.connect(S.comp);
    const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg); sg.connect(S.verbIn);
    return g;
  };
  const env = (param: AudioParam, t: number, a: number, peak: number, d: number, sus: number, rel: number, len: number) => {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + d);
    param.setValueAtTime(Math.max(0.0001, peak * sus), t + len);
    param.exponentialRampToValueAtTime(0.0001, t + len + rel);
  };
  const noise = (dest: AudioNode, t: number, len: number) => { const n = ctx.createBufferSource(); n.buffer = S.noise; n.loop = true; n.connect(dest); n.start(t, Math.random()); n.stop(t + len + 0.1); };

  const kick = (t: number, vol = 0.9) => {
    const ch = strip(vol, 0, 0.04), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g); g.connect(ch); o.start(t); o.stop(t + 0.45);
  };
  const snare = (t: number, vol = 0.42) => {
    const ch = strip(vol, 0.05, 0.9);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    const g = ctx.createGain(); env(g.gain, t, 0.002, 1, 0.08, 0.25, 0.12, 0.05);
    noise(hp, t, 0.25); hp.connect(g); g.connect(ch);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle';
    o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.1);
    env(og.gain, t, 0.002, 0.6, 0.06, 0.1, 0.06, 0.04); o.connect(og); og.connect(ch); o.start(t); o.stop(t + 0.2);
  };
  const bass = (m: number, t: number, len: number, vol = 0.32) => {
    const ch = strip(1, 0, 0.05);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'sine'; o.frequency.value = hz(m); o2.frequency.value = hz(m - 12);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(220, t + len);
    env(g.gain, t, 0.006, vol, 0.12, 0.5, 0.08, len);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(ch);
    o.start(t); o2.start(t); o.stop(t + len + 0.2); o2.stop(t + len + 0.2);
  };
  const pad = (notes: number[], t: number, len: number, vol = 0.07) => {
    const ch = strip(1, 0, 0.45);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7; lp.connect(ch);
    lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(2600, t + 0.6); lp.frequency.exponentialRampToValueAtTime(1200, t + len);
    for (const m of notes) for (const det of [-9, 0, 9]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det;
      env(g.gain, t, 0.25, vol / notes.length, 0.4, 0.75, 0.9, len);
      o.connect(g); g.connect(lp); o.start(t); o.stop(t + len + 1);
    }
  };
  const tick = (m: number, t: number, pan: number) => {
    const ch = strip(1, pan, 0.35);
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = hz(m);
    env(g.gain, t, 0.004, 0.035, 0.03, 0.5, 0.04, 0.03); o.connect(g); g.connect(ch); o.start(t); o.stop(t + 0.12);
  };
  const bell = (m: number, t: number, vol = 0.1, pan = 0) => {
    const ch = strip(1, pan, 0.6);
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = hz(m); mod.frequency.value = hz(m) * 3.5;
    mg.gain.setValueAtTime(hz(m) * 2.2, t); mg.gain.exponentialRampToValueAtTime(hz(m) * 0.1, t + 1.4);
    mod.connect(mg); mg.connect(car.frequency);
    env(g.gain, t, 0.004, vol, 0.3, 0.35, 1.6, 0.4);
    car.connect(g); g.connect(ch); car.start(t); mod.start(t); car.stop(t + 2.6); mod.stop(t + 2.6);
  };
  const riser = (t: number, len: number) => {
    const ch = strip(1, 0, 0.4), o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(hz(36), t); o.frequency.exponentialRampToValueAtTime(hz(60), t + len);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(4000, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + len); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.08);
    o.connect(lp); lp.connect(g); g.connect(ch); o.start(t); o.stop(t + len + 0.1);
  };
  const crt = (t: number) => {
    const ch = strip(0.6, 0, 0.2), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const g = ctx.createGain(); env(g.gain, t, 0.002, 1, 0.08, 0.1, 0.1, 0.02);
    noise(lp, t, 0.2); lp.connect(g); g.connect(ch);
  };

  if (short) {
    // a compact sting: one hit, the chord and a single bell
    crt(at(0.02));
    kick(at(B.barsR), 0.8); pad([57, 64, 69, 72, 76], at(B.barsR), 1.4, 0.06); bass(33, at(B.barsR), 1.1, 0.3);
    bell(88, at(B.w2), 0.09);
    return;
  }
  crt(at(0.05));
  riser(at(0.25), 0.62);
  kick(at(B.barsR), 0.9); snare(at(B.barsR), 0.45); bass(33, at(B.barsR), 0.5, 0.3);
  [88, 91, 93, 96, 98].forEach((m, i) => tick(m, at(B.barsR + i * 0.06), 0.45));
  bell(81, at(B.w1), 0.1, -0.35);
  kick(at(B.barsL), 0.8);
  [98, 96, 93, 91, 88].forEach((m, i) => tick(m, at(B.barsL + i * 0.06), -0.45));
  bell(88, at(B.w2), 0.1, 0.35);
  kick(at(B.w2 + 0.25), 1); snare(at(B.w2 + 0.25), 0.55);
  pad([57, 64, 69, 72, 76], at(B.w2 + 0.25), 2.6, 0.075);
  bass(33, at(B.w2 + 0.25), 2.2, 0.36);
  bell(93, at(B.w2 + 0.45), 0.11);
  ([[100, B.tag], [105, B.tag + 0.1], [108, B.tag + 0.2]] as const).forEach(([m, x], i) => bell(m, at(x), 0.05, [-0.3, 0.3, 0][i]));
}
