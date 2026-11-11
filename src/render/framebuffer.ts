import { PALETTE_U32 } from './palette';

/**
 * Screen pixels per world unit. The physics works on a 160x144 world; the screen draws it
 * at DETAIL x that, so pixels are finer while every tuning value keeps its meaning.
 * 2 → 320x288 (default). The aspect ratio stays 160x144 for the phase-2 console shell.
 */
export const DETAIL = 2;
export const WORLD_W = 160;
export const WORLD_H = 144;
export const SCREEN_W = WORLD_W * DETAIL;
export const SCREEN_H = WORLD_H * DETAIL;

/**
 * An indexed-colour framebuffer (SCREEN_W x SCREEN_H). Everything is drawn as whole pixels with
 * palette indices, so the final frame is pixel-perfect by construction (no
 * anti-aliasing, no sub-pixel positions). It is blitted to an offscreen canvas,
 * then upscaled by an integer factor with smoothing disabled.
 */
export class FrameBuffer {
  readonly w = SCREEN_W;
  readonly h = SCREEN_H;
  readonly px = new Uint8Array(SCREEN_W * SCREEN_H);
  private readonly image: ImageData;
  private readonly rgba: Uint32Array;

  constructor() {
    this.image = new ImageData(SCREEN_W, SCREEN_H);
    this.rgba = new Uint32Array(this.image.data.buffer);
  }

  clear(c: number): void { this.px.fill(c); }

  set(x: number, y: number, c: number): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= SCREEN_W || y >= SCREEN_H) return;
    this.px[y * SCREEN_W + x] = c;
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= SCREEN_W || y >= SCREEN_H) return 0;
    return this.px[y * SCREEN_W + x];
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
    const x1 = Math.min(SCREEN_W, (x + w) | 0), y1 = Math.min(SCREEN_H, (y + h) | 0);
    for (let j = y0; j < y1; j++) this.px.fill(c, j * SCREEN_W + x0, j * SCREEN_W + x1);
  }

  hline(x0: number, x1: number, y: number, c: number): void { this.rect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, c); }
  vline(x: number, y0: number, y1: number, c: number): void { this.rect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, c); }

  /** Bresenham line between integer-rounded endpoints. */
  line(ax: number, ay: number, bx: number, by: number, c: number): void {
    let x0 = Math.round(ax), y0 = Math.round(ay);
    const x1 = Math.round(bx), y1 = Math.round(by);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 512; guard++) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Filled circle outline helper for debug drawing. */
  circle(cx: number, cy: number, r: number, c: number): void {
    const n = Math.max(8, Math.ceil(r * 6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.set(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), c);
    }
  }

  /** 4x4 Bayer-dithered rect between two colours; t in [0,1] is the share of colour b. */
  dither(x: number, y: number, w: number, h: number, a: number, b: number, t: number): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      this.set(i, j, BAYER4[(j & 3) * 4 + (i & 3)] < t * 16 ? b : a);
    }
  }

  /** Remap the pixel already there through a lookup table (tints, glass, shadows). */
  remap(x: number, y: number, table: Uint8Array): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= SCREEN_W || y >= SCREEN_H) return;
    const i = y * SCREEN_W + x;
    this.px[i] = table[this.px[i]];
  }

  remapRect(x: number, y: number, w: number, h: number, table: Uint8Array): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.remap(i, j, table);
  }

  /** Copy into the RGBA canvas. */
  present(ctx: CanvasRenderingContext2D): void {
    const px = this.px, out = this.rgba;
    for (let i = 0; i < px.length; i++) out[i] = PALETTE_U32[px[i]];
    ctx.putImageData(this.image, 0, 0);
  }
}

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
