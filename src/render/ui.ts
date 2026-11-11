import type { FrameBuffer } from './framebuffer';
import { SCREEN_W, DETAIL as S } from './framebuffer';
import { P, DARKEN } from './palette';
import { drawText, drawTextCentered } from './font';

/** In-screen pixel UI: panels, menus, stars. Everything stays on the 160x144 grid. */

export function dim(fb: FrameBuffer, times = 1): void {
  for (let n = 0; n < times; n++) for (let i = 0; i < fb.px.length; i++) fb.px[i] = DARKEN[fb.px[i]];
}

/** Layout values below are in screen pixels (320x288 at DETAIL 2). */

export function panel(fb: FrameBuffer, x: number, y: number, w: number, h: number): void {
  fb.rect(x + 3, y + 3, w, h, P.INK); // drop shadow
  fb.rect(x, y, w, h, P.ABYSS);
  fb.rect(x + 2, y + 2, w - 4, h - 4, P.ABYSS);
  fb.hline(x + 1, x + w - 2, y, P.WHITE);
  fb.hline(x + 1, x + w - 2, y + 1, P.PLASTIC);
  fb.hline(x + 1, x + w - 2, y + h - 1, P.PLASTIC_SH);
  fb.vline(x, y + 1, y + h - 2, P.PLASTIC);
  fb.vline(x + w - 1, y + 1, y + h - 2, P.PLASTIC_SH);
  fb.hline(x + 3, x + w - 4, y + 3, P.DEEP); // inner bevel
}

export function menu(fb: FrameBuffer, title: string, items: string[], cursor: number, y: number, blink: boolean, footer?: string): void {
  const row = 14;
  const w = 190, h = 30 + items.length * row + (footer ? 16 : 0);
  const x = Math.round((SCREEN_W - w) / 2);
  panel(fb, x, y, w, h);
  drawTextCentered(fb, title, SCREEN_W / 2, y + 9, P.YELLOW, P.INK);
  fb.hline(x + 12, x + w - 13, y + 21, P.MID);
  items.forEach((it, i) => {
    const iy = y + 28 + i * row;
    const sel = i === cursor;
    if (sel) { fb.rect(x + 8, iy - 3, w - 16, 13, P.DEEP); fb.hline(x + 8, x + w - 9, iy - 3, P.MID); }
    drawText(fb, it, x + 28, iy, sel ? P.WHITE : P.PLASTIC);
    if (sel && blink) drawText(fb, '>', x + 15, iy, P.ORANGE);
  });
  if (footer) drawTextCentered(fb, footer, SCREEN_W / 2, y + h - 14, P.PLASTIC_SH);
}

const STAR = [
  '.....#.....',
  '....###....',
  '....###....',
  '###########',
  '.#########.',
  '..#######..',
  '..#######..',
  '.####.####.',
  '.##.....##.',
];

export function star(fb: FrameBuffer, x: number, y: number, filled: boolean): void {
  STAR.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== '#') return;
    let c: number = filled ? P.YELLOW : P.SLATE;
    if (filled && (j < 3 || (j === 3 && i < 5))) c = P.WHITE;
    else if (filled && j > 5) c = P.ORANGE;
    fb.set(x + i, y + j, c);
  }));
}

export function titleLogo(fb: FrameBuffer, t: number): void {
  const bob = Math.round(Math.sin(t * 2) * 2);
  drawTextCentered(fb, 'RING TOSS', SCREEN_W / 2, 24 * S + bob, P.YELLOW, P.INK, 3);
  drawTextCentered(fb, 'TANK', SCREEN_W / 2, 24 * S + 28 + bob, P.CORAL, P.INK, 3);
}

export function footerHint(fb: FrameBuffer, s: string, blink: boolean): void {
  if (blink) drawTextCentered(fb, s, SCREEN_W / 2, 56 * S, P.WHITE, P.INK);
}

/** Tiny padlock for locked levels. */
function lock(fb: FrameBuffer, x: number, y: number): void {
  fb.rect(x + 1, y, 5, 1, P.PLASTIC_SH); fb.set(x, y + 1, P.PLASTIC_SH); fb.set(x + 6, y + 1, P.PLASTIC_SH);
  fb.set(x, y + 2, P.PLASTIC_SH); fb.set(x + 6, y + 2, P.PLASTIC_SH);
  fb.rect(x - 1, y + 3, 9, 6, P.PLASTIC_SH); fb.hline(x - 1, x + 7, y + 3, P.PLASTIC); fb.set(x + 3, y + 5, P.INK); fb.set(x + 3, y + 6, P.INK);
}

export interface LevelTile { n: number; stars: number; locked: boolean; }

/** Level select: a 4x3 grid of tiles plus a BACK row. */
export function levelGrid(fb: FrameBuffer, tiles: LevelTile[], cursor: number, blink: boolean, name: string, info: string): void {
  const x0 = 30, y0 = 50, tw = 60, th = 40, gap = 6;
  panel(fb, 18, 22, SCREEN_W - 36, 248);
  drawTextCentered(fb, 'CHALLENGE', SCREEN_W / 2, 32, P.YELLOW, P.INK);
  tiles.forEach((t, i) => {
    const x = x0 + (i % 4) * (tw + gap), y = y0 + Math.floor(i / 4) * (th + gap);
    const sel = i === cursor;
    fb.rect(x, y, tw, th, sel ? P.MID : P.DEEP);
    fb.hline(x, x + tw - 1, y, sel ? P.LIGHT : P.BLUE);
    fb.hline(x, x + tw - 1, y + th - 1, P.ABYSS);
    if (sel && blink) { fb.hline(x - 1, x + tw, y - 1, P.YELLOW); fb.hline(x - 1, x + tw, y + th, P.YELLOW); fb.vline(x - 1, y - 1, y + th, P.YELLOW); fb.vline(x + tw, y - 1, y + th, P.YELLOW); }
    if (t.locked) lock(fb, x + tw / 2 - 3, y + 10);
    else drawTextCentered(fb, String(t.n), x + tw / 2, y + 8, sel ? P.WHITE : P.PLASTIC, P.INK, 2);
    for (let k = 0; k < 3; k++) star(fb, x + 8 + k * 16, y + th - 13, !t.locked && k < t.stars);
  });
  const by = y0 + 3 * (th + gap) + 4;
  const selBack = cursor === tiles.length;
  if (selBack) fb.rect(SCREEN_W / 2 - 30, by - 3, 60, 13, P.DEEP);
  drawTextCentered(fb, (selBack && blink ? '> ' : '  ') + 'BACK', SCREEN_W / 2 - 4, by, selBack ? P.WHITE : P.PLASTIC);
  drawTextCentered(fb, name, SCREEN_W / 2, by + 20, P.LIGHT);
  drawTextCentered(fb, info, SCREEN_W / 2, by + 32, P.PLASTIC_SH);
  drawTextCentered(fb, 'MOVE: D-PAD   GO: A', SCREEN_W / 2, by + 48, P.PLASTIC_SH);
}
