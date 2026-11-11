import type { FrameBuffer } from './framebuffer';
import { BAYER4, SCREEN_W, SCREEN_H, DETAIL as S } from './framebuffer';
import { P, LIGHTEN, DARKEN, RING_COLORS } from './palette';
import { drawRing, HALF_ALL, HALF_BACK, HALF_FRONT } from './rings';
import { drawText, textWidth } from './font';
import type { World, Ring } from '../physics/world';
import type { Bubbles } from './particles';

/**
 * Prototype scene: placeholder shapes, drawn in *screen* pixels (world units × DETAIL)
 * so outlines, highlights and dithering use the fine grid. The full art pass
 * (milestone 5) replaces drawBackground / drawTankFrame without touching the rest.
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** world → screen, snapped to the pixel grid */
const px = (v: number) => Math.round(v * S);

export const HUD_H = 9 * S;

/** Water gradient: light at the top, deep at the bottom, ordered-dither transitions. */
const WATER_RAMP = [P.SHALLOW, P.TEAL, P.BLUE, P.MID, P.DEEP];

export function drawBackground(fb: FrameBuffer, w: World): void {
  const t = w.tank;
  fb.clear(P.ABYSS);
  const top = px(t.top) - 2 * S, bottom = px(t.floor) + 4 * S;
  const h = bottom - px(t.top);
  for (let y = top; y < bottom; y++) {
    const f = Math.max(0, Math.min(0.999, (y - px(t.top)) / h)) * (WATER_RAMP.length - 1);
    const i = Math.floor(f), frac = f - i;
    const a = WATER_RAMP[i], b = WATER_RAMP[Math.min(WATER_RAMP.length - 1, i + 1)];
    for (let x = px(t.left) - 2 * S; x < px(t.right) + 2 * S; x++) fb.set(x, y, BAYER4[(y & 3) * 4 + (x & 3)] < frac * 16 ? b : a);
  }
}

export function drawTankFrame(fb: FrameBuffer, w: World, pressure: number[]): void {
  const t = w.tank;
  const L = px(t.left), Rr = px(t.right), T = px(t.top), F = px(t.floor);
  // sloped floor ledge (a V into each nozzle) with the pump housing below it
  for (let x = L - 2 * S; x < Rr + 2 * S; x++) {
    const wx = Math.min(t.right, Math.max(t.left, x / S));
    const fy = px(w.floorAt(wx));
    fb.set(x, fy, P.WHITE);
    fb.set(x, fy + 1, P.PLASTIC);
    fb.set(x, fy + 2, P.PLASTIC_SH);
    // the ledge is clear plastic: tint what's behind it rather than hiding it
    for (let y = fy + 3; y < F + 2 * S; y++) { fb.remap(x, y, DARKEN); if (BAYER4[(y & 3) * 4 + (x & 3)] < 4) fb.remap(x, y, DARKEN); }
    if ((x & 15) === 0) fb.set(x, fy + 3, P.PLASTIC_SH);
  }
  fb.rect(L - 2 * S, F + 2 * S, Rr - L + 4 * S, SCREEN_H - F - 2 * S, P.SLATE);
  fb.dither(L - 2 * S, F + 2 * S, Rr - L + 4 * S, 4, P.SLATE, P.INK, 0.6);
  // nozzles
  w.fluid.nozzles.forEach((n, i) => {
    const x = px(n.x);
    fb.rect(x - 8, F - 1, 17, 4, P.PLASTIC);
    fb.hline(x - 8, x + 8, F - 1, P.WHITE);
    fb.rect(x - 4, F - 1, 9, 2, P.INK);
    fb.hline(x - 8, x + 8, F + 3, P.PLASTIC_SH);
    // pressure gauge under each nozzle: the "how hard am I pushing" feedback
    const gw = 48, gx = x - gw / 2, gy = F + 15;
    fb.rect(gx - 2, gy - 2, gw + 4, 9, P.INK);
    fb.rect(gx - 1, gy - 1, gw + 2, 7, P.DEEP);
    const fill = Math.round(Math.max(0, pressure[i] ?? 0) * gw);
    const col = fill > gw * 0.8 ? P.CORAL : fill > gw * 0.4 ? P.ORANGE : P.SHALLOW;
    fb.rect(gx, gy, fill, 5, col);
    if (fill > 0) { fb.hline(gx, gx + fill - 1, gy, P.WHITE); fb.hline(gx, gx + fill - 1, gy + 4, DARKEN[col]); }
    for (let k = 1; k < 4; k++) fb.vline(gx + (gw * k) / 4, gy + 3, gy + 4, P.INK); // ticks
  });
  // clear plastic walls: a tinted strip with a bright edge line
  for (let y = T - 2 * S; y < F; y++) {
    for (let k = 1; k <= 2 * S; k++) { fb.remap(L - k, y, LIGHTEN); fb.remap(Rr + k - 1, y, LIGHTEN); }
  }
  fb.vline(L - 2 * S - 1, T - 2 * S - 1, SCREEN_H - 1, P.PLASTIC);
  fb.vline(L - 2 * S - 2, T - 2 * S - 1, SCREEN_H - 1, P.PLASTIC_SH);
  fb.vline(Rr + 2 * S, T - 2 * S - 1, SCREEN_H - 1, P.PLASTIC_SH);
  fb.vline(Rr + 2 * S + 1, T - 2 * S - 1, SCREEN_H - 1, P.SLATE);
  fb.hline(L - 2 * S - 2, Rr + 2 * S + 1, T - 2 * S - 1, P.PLASTIC);
  fb.hline(L - 2 * S - 2, Rr + 2 * S + 1, T - 2 * S - 2, P.WHITE);
  for (let y = T - 2 * S; y < T; y++) for (let x = L - 2 * S; x < Rr + 2 * S; x++) fb.remap(x, y, DARKEN);
  // glass glints: a long thin streak and a short one
  fb.vline(L + 5, T + 18, T + 46, P.LIGHT);
  fb.vline(L + 6, T + 20, T + 30, P.WHITE);
  fb.vline(L + 5, T + 52, T + 56, P.LIGHT);
  fb.vline(Rr - 6, F - 60, F - 40, P.LIGHT);
}

function drawPeg(fb: FrameBuffer, w: World, p: number): void {
  const peg = w.pegs[p];
  const x = px(peg.x), tip = px(peg.tipY), base = px(peg.baseY);
  // rounded tip
  fb.set(x, tip, P.WHITE);
  fb.remap(x - 1, tip + 1, LIGHTEN); fb.set(x, tip + 1, P.WHITE); fb.remap(x + 1, tip + 1, LIGHTEN);
  // clear shaft: tinted body, a 1 px specular line, a faint shade edge
  for (let y = tip + 2; y <= base; y++) {
    fb.remap(x - 1, y, LIGHTEN); fb.remap(x - 1, y, LIGHTEN);
    fb.set(x, y, (y & 7) === 0 ? P.LIGHT : P.WHITE);
    fb.remap(x + 1, y, LIGHTEN);
    fb.remap(x + 2, y, DARKEN);
  }
  // colour band below the tip on colour-matched pegs
  if (peg.color) {
    const rc = RING_COLORS[peg.color];
    for (let y = tip + 3; y < tip + 9; y++) { fb.set(x - 1, y, rc.base); fb.set(x, y, y === tip + 3 ? rc.hi : rc.base); fb.set(x + 1, y, rc.shade); }
    fb.set(x - 2, tip + 5, rc.base); fb.set(x + 2, tip + 5, rc.shade);
  }
  // flange (tinted when the peg wants a colour) + mount
  const fc = peg.color ? RING_COLORS[peg.color].base : P.PLASTIC;
  const fw = 7;
  fb.rect(x - fw, base + 1, fw * 2 + 1, 4, fc);
  fb.hline(x - fw, x + fw, base + 1, P.WHITE);
  fb.hline(x - fw, x + fw, base + 4, peg.color ? RING_COLORS[peg.color].shade : P.PLASTIC_SH);
  fb.set(x - fw, base + 1, fc); fb.set(x + fw, base + 1, fc);
  for (let y = base + 5; y < base + 12; y++) for (let k = -2; k <= 2; k++) fb.remap(x + k, y, LIGHTEN);
  fb.vline(x - 2, base + 5, base + 11, P.PLASTIC);
  fb.rect(x - 5, base + 12, 11, 2, P.PLASTIC_SH);
  fb.hline(x - 5, x + 5, base + 12, P.PLASTIC);
}

function ringPos(r: Ring, a: number) {
  return { x: lerp(r.px, r.x, a), y: lerp(r.py, r.y, a), tilt: lerp(r.ptilt, r.tilt, a) };
}

export function drawPlayfield(fb: FrameBuffer, w: World, bubbles: Bubbles, alpha: number): void {
  const R = w.cfg.ringOuterRadius * S, ri = w.cfg.ringInnerRadius * S;
  // Wrapped tilt can jump by π between steps; only interpolate small changes.
  const tiltOf = (r: Ring) => (Math.abs(r.tilt - r.ptilt) < 1 ? ringPos(r, alpha).tilt : r.tilt);

  for (let p = 0; p < w.pegs.length; p++) {
    const on = w.rings.filter((r) => r.state === 'threaded' && r.peg === p).sort((a, b) => b.y - a.y); // lower rings first
    for (const r of on) { const q = ringPos(r, alpha); drawRing(fb, q.x * S, q.y * S, R, ri, tiltOf(r), r.color, HALF_BACK); }
    drawPeg(fb, w, p);
    for (const r of on) { const q = ringPos(r, alpha); drawRing(fb, q.x * S, q.y * S, R, ri, tiltOf(r), r.color, HALF_FRONT); }
  }
  for (const r of w.rings) {
    if (r.state !== 'free') continue;
    const q = ringPos(r, alpha);
    drawRing(fb, q.x * S, q.y * S, R, ri, tiltOf(r), r.color, HALF_ALL);
  }
  bubbles.draw(fb, alpha, S);
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60), sec = s - m * 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(1)}`;
}

export function drawHud(fb: FrameBuffer, w: World, time: number | null, label: string): void {
  fb.rect(0, 0, SCREEN_W, HUD_H, P.INK);
  fb.hline(0, SCREEN_W - 1, HUD_H - 1, P.DEEP);
  fb.hline(0, SCREEN_W - 1, HUD_H - 2, P.ABYSS);
  drawText(fb, time !== null ? fmtTime(time) : label, 6, 5, P.LIGHT);
  const s = `${w.threadedCount}/${w.rings.length}`;
  const x = SCREEN_W - 6 - textWidth(s);
  drawText(fb, s, x, 5, P.YELLOW);
  drawRing(fb, x - 9, 8.5, 5, 3, 0.2, 'red');
}

/** Debug overlay: flow vectors, vortices, collision shapes, threading zones, gravity. */
export function drawDebug(fb: FrameBuffer, w: World, fps: number): void {
  const c = w.cfg, t = w.tank;
  const s = { u: 0, v: 0 };
  for (let y = t.top + 4; y < t.floor; y += 6) for (let x = t.left + 4; x < t.right; x += 6) {
    w.fluid.sample(x, y, s);
    const m = Math.hypot(s.u, s.v);
    const sx = px(x), sy = px(y);
    if (m < 0.5) { fb.set(sx, sy, P.MID); continue; }
    const len = Math.min(11, 2 + m * 0.07);
    const col = m > 120 ? P.CORAL : m > 40 ? P.ORANGE : m > 10 ? P.YELLOW : P.LIGHT;
    fb.line(sx, sy, sx + (s.u / m) * len, sy + (s.v / m) * len, col);
    fb.set(sx, sy, P.WHITE);
  }
  for (const v of w.fluid.vortices) {
    const col = v.gamma0 > 0 ? P.PINK : P.LGREEN;
    const x = px(v.x), y = px(v.y);
    fb.hline(x - 2, x + 2, y, col); fb.vline(x, y - 2, y + 2, col);
  }
  const hole = c.ringInnerRadius - c.pegHalfWidth + c.threadTolerance;
  for (const peg of w.pegs) {
    // threading zone: the window the ring centre must drop through
    const x0 = px(peg.x - hole), x1 = px(peg.x + hole), ty = px(peg.tipY);
    fb.hline(x0, x1, ty, P.YELLOW);
    fb.vline(x0, ty - 8, ty, P.YELLOW);
    fb.vline(x1, ty - 8, ty, P.YELLOW);
    // peg capsule
    fb.vline(px(peg.x - c.pegHalfWidth) - 2, ty, px(peg.baseY), P.MAGENTA);
    fb.vline(px(peg.x + c.pegHalfWidth) + 2, ty, px(peg.baseY), P.MAGENTA);
  }
  for (const r of w.rings) {
    if (r.state === 'free') {
      const aligned = Math.abs(Math.sin(r.tilt)) >= c.threadMinAlign;
      fb.circle(r.x * S, r.y * S, c.ringOuterRadius * S, aligned ? P.LGREEN : P.CORAL);
      fb.line(px(r.x), px(r.y), px(r.x + r.vx * 0.1), px(r.y + r.vy * 0.1), P.WHITE);
    } else {
      fb.hline(px(r.x - c.ringOuterRadius), px(r.x + c.ringOuterRadius), px(r.y), r.resting ? P.LGREEN : P.YELLOW);
    }
  }
  // gravity arrow
  const gx = SCREEN_W / 2, gy = HUD_H + 10;
  fb.line(gx, gy, gx + w.gdx * 16, gy + w.gdy * 16, P.WHITE);
  const label = `${fps.toFixed(0)} FPS  V${w.fluid.vortices.length}`;
  fb.rect(0, SCREEN_H - 11, textWidth(label) + 6, 11, P.INK);
  drawText(fb, label, 3, SCREEN_H - 9, P.LGREEN);
}
