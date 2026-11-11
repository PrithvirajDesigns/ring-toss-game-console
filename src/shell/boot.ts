/**
 * Tide Pocket power-on: the logo reveal, drawn as pixel art on the game screen before the
 * game takes over (it belongs to the shell, so any game could boot behind it).
 *
 *   CRT    a tiny dot stretches sideways into a line, which fades as the picture appears
 *   Tide   its block of lines draws out to the right, then the word wipes in and warms red → yellow
 *   Pocket its block of lines draws out to the left, then the word wipes in and warms
 *   tag    "8-BIT REEF", a hold, then a dithered fade to black
 *   load   a short loading spinner, then the game starts
 *
 * Full version on first power-on (~3.9 s + 1.5 s loading), short one (~1.5 s) after a power cycle. Skippable.
 * Sound: the logo score, synthesized in Web Audio and locked to the same beats.
 */
import { FrameBuffer, SCREEN_W, SCREEN_H } from '../render/framebuffer';
import { P, DARKEN } from '../render/palette';

/** Darken the whole frame by n palette steps (a clean fade, no dither dots). */
function darken(fb: FrameBuffer, n: number): void {
  for (let k = 0; k < n; k++) for (let i = 0; i < fb.px.length; i++) fb.px[i] = DARKEN[fb.px[i]];
  if (n >= 6) fb.clear(P.INK);
}
import { drawTextCentered } from '../render/font';
import { rasterWord, CAP, ST } from './wordmark';
import { playLogoScore } from './bootSound';

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export interface BootOptions { canvas: HTMLCanvasElement; audio: AudioContext | null; short?: boolean; }

export function playBoot(opts: BootOptions): { done: Promise<void>; skip(): void; cancel(): void } {
  const fb = new FrameBuffer();
  const ctx = opts.canvas.getContext('2d', { alpha: false })!;
  const off = document.createElement('canvas'); off.width = SCREEN_W; off.height = SCREEN_H;
  const octx = off.getContext('2d')!;

  const short = !!opts.short;
  // beats (seconds) — the score uses the same numbers
  const B = short
    ? { on: 0.3, barsR: 0.15, w1: 0.2, barsL: 0.25, w2: 0.3, tag: 0.55, fade: 1.15, end: 1.5 }
    : { on: 0.75, barsR: 0.9, w1: 1.1, barsL: 1.3, w2: 1.5, tag: 2.6, fade: 3.5, end: 3.9 };
  // loading buffer after the reveal (full boot only)
  const LOAD = short ? 0 : 1.5;
  const END = B.end + LOAD;
  const wipeDur = short ? 0.3 : 0.55, warmDur = short ? 0.35 : 0.9, barDur = short ? 0.25 : 0.5, barStep = short ? 0.02 : 0.06;

  // ---- layout: two rows of equal width, like a stacked wordmark ----
  const tide = rasterWord('Tide', 1), pocket = rasterWord('Pocket', 1);
  const gap = 5, barsMin = 52;
  const W = Math.max(tide.w + gap + barsMin, pocket.w + gap + barsMin);
  const x0 = Math.round((SCREEN_W - W) / 2);
  const y1 = 100, y2 = y1 + CAP + 4;
  const barsRx = x0 + tide.w + gap, barsRw = W - tide.w - gap;
  const barsLw = W - pocket.w - gap, pocketX = x0 + barsLw + gap;
  // five lines filling the x-height band of each row
  const lineYs = (rowY: number) => Array.from({ length: 5 }, (_, i) => rowY + (CAP - 21) + i * 4 + 1);

  // phosphor "warm-up" ramp: dark red → red → orange → yellow
  const RAMP = [P.BROWN, 25, P.CORAL, P.DORANGE, P.ORANGE, P.YELLOW];
  const warmCol = (k: number) => RAMP[Math.min(RAMP.length - 1, Math.floor(clamp01(k) * (RAMP.length - 1) + 0.001))];

  const drawWord = (bm: ReturnType<typeof rasterWord>, x: number, y: number, t: number, start: number) => {
    const wipe = ease((t - start) / wipeDur), warm = clamp01((t - start) / warmDur);
    if (wipe <= 0) return;
    const showTo = Math.round(bm.w * wipe);
    const col = warmCol(warm);
    // soft glow: a dithered halo one pixel out, once the word is warm
    if (warm > 0.6) for (let j = -1; j <= bm.h; j++) for (let i = -1; i <= showTo; i++) {
      if (bm.px[j * bm.w + i] && j >= 0 && i >= 0 && i < bm.w) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const ii = i + a, jj = j + b; return ii >= 0 && jj >= 0 && ii < showTo && jj < bm.h && bm.px[jj * bm.w + ii]; });
      if (near) fb.set(x + i, y + j, P.BROWN);
    }
    for (let j = 0; j < bm.h; j++) for (let i = 0; i < showTo; i++) if (bm.px[j * bm.w + i]) fb.set(x + i, y + j, col);
    // the wipe's leading edge flares bright for a moment
    if (wipe < 1) for (let j = 0; j < bm.h; j++) if (bm.px[j * bm.w + showTo - 1]) fb.set(x + showTo - 1, y + j, P.WHITE);
  };
  const drawBars = (x: number, w: number, rowY: number, t: number, start: number, fromRight: boolean) => {
    lineYs(rowY).forEach((ly, i) => {
      const k = ease((t - start - i * barStep) / barDur);
      if (k <= 0) return;
      const len = Math.round(w * k);
      const lx = fromRight ? x + w - len : x;
      fb.rect(lx, ly, len, 2, P.YELLOW);
      fb.hline(lx, lx + len - 1, ly + 2, P.DORANGE); // a darker phosphor trail under each line
    });
  };

  let start = 0, raf = 0, skipped = false, resolveDone: () => void = () => {};
  const done = new Promise<void>((r) => (resolveDone = r));
  let scored = false;

  const frame = (now: number) => {
    if (!start) start = now;
    let t = (now - start) / 1000;
    if (skipped && t < B.fade) { start = now - B.fade * 1000; t = B.fade; }
    if (skipped && t > B.end) { resolveDone(); return; }
    if (!scored) { scored = true; if (opts.audio) playLogoScore(opts.audio, B, short); }

    fb.clear(P.INK);
    drawBars(barsRx, barsRw, y1, t, B.barsR, false);
    drawWord(tide, x0, y1, t, B.w1);
    drawBars(x0, barsLw, y2, t, B.barsL, true);
    drawWord(pocket, pocketX, y2, t, B.w2);
    if (t >= B.tag) {
      const k = clamp01((t - B.tag) / 0.35);
      const tag = '8-BIT REEF';
      drawTextCentered(fb, tag.slice(0, Math.ceil(tag.length * k)).padEnd(tag.length, ' '), SCREEN_W / 2, y2 + CAP + 18, P.LIGHT);
    }
    void ST;

    // ---- CRT switch-on: a tiny dot stretches sideways into a line, then the line fades and the picture is there.
    // Fades use whole-palette darkening steps (no dither), so nothing looks dotted.
    const u = t / B.on;
    const sp = 0.18, ln = 0.7;                 // dot → line → line fades (fractions of B.on)
    const fade = clamp01((t - B.fade) / (B.end - B.fade));
    const cxs = SCREEN_W / 2, cys = Math.floor(SCREEN_H / 2);
    if (u < 1) {
      fb.clear(P.INK);
      if (u < sp) {
        const r = Math.round(ease(u / sp) * 1.5);
        fb.rect(cxs - r, cys - r, r * 2 + 1, r * 2 + 1, P.WHITE);
      } else {
        const half = Math.round(ease((u - sp) / (ln - sp)) * (SCREEN_W / 2));
        const dim = clamp01((u - ln) / (1 - ln));         // the finished line fades out
        const core = dim < 0.35 ? P.WHITE : dim < 0.7 ? P.LIGHT : P.SHALLOW;
        const edge = dim < 0.35 ? P.LIGHT : dim < 0.7 ? P.SHALLOW : P.TEAL;
        if (dim < 1) {
          fb.hline(cxs - half, cxs + half, cys, core);
          if (dim < 0.7) { fb.hline(cxs - Math.round(half * 0.92), cxs + Math.round(half * 0.92), cys - 1, edge); fb.hline(cxs - Math.round(half * 0.92), cxs + Math.round(half * 0.92), cys + 1, edge); }
        }
      }
    } else if (fade > 0) {
      darken(fb, Math.round(fade * 6));
    }

    // ---- loading buffer: a simple circular spinner (a ring of dots with a bright head and a fading tail) ----
    if (t >= B.end && LOAD > 0) {
      fb.clear(P.INK);
      const k = clamp01((t - B.end) / LOAD);
      const vis = Math.min(clamp01(k / 0.12), clamp01((1 - k) / 0.12));
      if (vis > 0) {
        const cx = SCREEN_W / 2, cy = SCREEN_H / 2, r = 12, N = 12;
        const head = Math.floor((t - B.end) * 14) % N;          // steps around the ring
        const tail = [P.WHITE, P.LIGHT, P.SHALLOW, P.TEAL, P.BLUE];
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2 - Math.PI / 2;
          const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
          const behind = (head - i + N) % N;
          const c = behind < tail.length ? tail[behind] : P.MID;
          fb.rect(x - 1, y - 1, 3, 3, c);
          if (behind === 0) { fb.set(x - 2, y, c); fb.set(x + 2, y, c); fb.set(x, y - 2, c); fb.set(x, y + 2, c); }
        }
        if (vis < 1) darken(fb, Math.round((1 - vis) * 6));
      }
    }

    fb.present(octx);
    const cw = opts.canvas.width, ch = opts.canvas.height;
    const kx = Math.max(1, Math.floor(Math.min(cw / SCREEN_W, ch / SCREEN_H)));
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(off, 0, 0, SCREEN_W, SCREEN_H, Math.floor((cw - SCREEN_W * kx) / 2), Math.floor((ch - SCREEN_H * kx) / 2), SCREEN_W * kx, SCREEN_H * kx);

    if (t >= END) { resolveDone(); return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { done, skip() { skipped = true; }, cancel() { cancelAnimationFrame(raf); resolveDone(); } };
}
