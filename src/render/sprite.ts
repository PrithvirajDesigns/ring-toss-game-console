import type { FrameBuffer } from './framebuffer';

/** An indexed-colour image. 255 = transparent. */
export interface Sprite { w: number; h: number; px: Uint8Array; }

export const CLEAR = 255;

export function makeSprite(w: number, h: number): Sprite {
  const px = new Uint8Array(w * h);
  px.fill(CLEAR);
  return { w, h, px };
}

/**
 * Draw a sprite. `flip` mirrors it horizontally; `table` remaps its colours (depth fog,
 * flashes); `rowShift(y)` offsets each row by whole pixels (water shimmer).
 */
export interface Clip { x0: number; y0: number; x1: number; y1: number; }

export function blit(
  fb: FrameBuffer, s: Sprite, x: number, y: number,
  flip = false, table?: Uint8Array, rowShift?: (sy: number) => number, clip?: Clip,
): void {
  x = Math.round(x); y = Math.round(y);
  const cx0 = clip ? clip.x0 : 0, cx1 = clip ? clip.x1 : fb.w, cy0 = clip ? clip.y0 : 0, cy1 = clip ? clip.y1 : fb.h;
  for (let j = 0; j < s.h; j++) {
    const sy = y + j;
    if (sy < cy0 || sy >= cy1 || sy < 0 || sy >= fb.h) continue;
    const ox = x + (rowShift ? rowShift(sy) : 0);
    const row = j * s.w;
    for (let i = 0; i < s.w; i++) {
      const c = s.px[row + (flip ? s.w - 1 - i : i)];
      if (c === CLEAR) continue;
      const sx = ox + i;
      if (sx < cx0 || sx >= cx1 || sx < 0 || sx >= fb.w) continue;
      fb.px[sy * fb.w + sx] = table ? table[c] : c;
    }
  }
}

/** Tiny raster toolkit for building sprites in code. */
export class Canvas8 implements Sprite {
  readonly px: Uint8Array;
  constructor(readonly w: number, readonly h: number) { this.px = new Uint8Array(w * h).fill(CLEAR); }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return CLEAR;
    return this.px[y * this.w + x];
  }
  set(x: number, y: number, c: number): void {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }
  filled(x: number, y: number): boolean { return this.get(x, y) !== CLEAR; }

  /** Fill an ellipse; colour may depend on the pixel (for shading and patterns). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number | ((x: number, y: number) => number)): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) { const v = typeof c === 'number' ? c : c(x, y); if (v !== CLEAR) this.set(x, y, v); }
      }
  }

  /** Fill a polygon (even-odd rule). */
  poly(pts: [number, number][], c: number | ((x: number, y: number) => number)): void {
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const [x, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++)
      for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
        const px = x + 0.5, py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) { const v = typeof c === 'number' ? c : c(x, y); if (v !== CLEAR) this.set(x, y, v); }
      }
  }

  /** Thick line made of discs. */
  stroke(ax: number, ay: number, bx: number, by: number, r: number, c: number): void {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      if (r <= 0.6) this.set(x, y, c);
      else this.ellipse(x, y, r, r, c);
    }
  }

  /** 1 px outline around everything filled (only into transparent pixels). */
  outline(c: number, diagonal = false): void {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.filled(x, y)) continue;
      const n = this.filled(x - 1, y) || this.filled(x + 1, y) || this.filled(x, y - 1) || this.filled(x, y + 1) ||
        (diagonal && (this.filled(x - 1, y - 1) || this.filled(x + 1, y - 1) || this.filled(x - 1, y + 1) || this.filled(x + 1, y + 1)));
      if (n) add.push(y * this.w + x);
    }
    for (const i of add) this.px[i] = c;
  }

  /**
   * Edge lighting for a shape of colour `base` only: pixels whose upper-left neighbour is
   * empty (or another colour) get `hi`, lower-right get `shade`. Light from the upper left.
   */
  shade(base: number, hi: number, shade: number): void {
    const out = this.px.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y) !== base) continue;
      const up = this.get(x, y - 1) !== base, left = this.get(x - 1, y) !== base;
      const down = this.get(x, y + 1) !== base, right = this.get(x + 1, y) !== base;
      if (up || (left && !down)) out[y * this.w + x] = hi;
      else if (down || right) out[y * this.w + x] = shade;
    }
    this.px.set(out);
  }

  /** Composite another canvas on top. */
  draw(src: Sprite, x: number, y: number): void {
    for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) {
      const c = src.px[j * src.w + i];
      if (c !== CLEAR) this.set(x + i, y + j, c);
    }
  }
}
