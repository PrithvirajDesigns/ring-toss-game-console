/**
 * The Tide Pocket wordmark as pixel art: a tight geometric bold drawn from circles and
 * bars (round bowls, single-storey shapes, flat terminals), rasterised to a bitmap so it
 * stays crisp on the 320x288 screen. Each glyph is a tiny "is this pixel ink?" function,
 * so letters are easy to tweak. Cap height CAP, x-height XH, stroke ST.
 */
export const CAP = 30, XH = 21, ST = 7;

type Ink = (x: number, y: number) => boolean; // x from the glyph's left, y up from the baseline
interface Glyph { w: number; ink: Ink; }

const R = XH / 2;                                    // bowl radius (outer)
const ring = (cx: number, cy: number) => (x: number, y: number) => {
  const d = Math.hypot(x - cx, y - cy);
  return d <= R + 0.01 && d >= R - ST;
};
const bar = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
const or = (...f: Ink[]): Ink => (x, y) => f.some((g) => g(x, y));
/** a straight stroke of width w between two points (flat-ish ends) */
const stroke = (ax: number, ay: number, bx: number, by: number, w: number): Ink => (x, y) => {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t)) <= w / 2;
};

const G: Record<string, Glyph> = {
  T: { w: 24, ink: or(bar(0, CAP - ST, 24, CAP), bar(8.5, 0, 15.5, CAP)) },
  i: { w: 7, ink: or(bar(0, 0, ST, XH), bar(0, XH + 3, ST, XH + 3 + ST)) },
  d: { w: 2 * R, ink: or(ring(R, R), bar(2 * R - ST, 0, 2 * R, CAP)) },
  e: { w: 2 * R, ink: (x, y) => {
      if (!(ring(R, R)(x, y) || bar(R - ST + 2, R - 2.5, 2 * R - 1, R + 2.5)(x, y))) return false;
      // the open lower-right of the bowl
      return !(x > R + 1 && y < R - 2.5 && y > 1.5 && Math.atan2(y - R, x - R) > -1.15);
    } },
  P: { w: 20, ink: (x, y) => {
      // stem + a D-shaped bowl over the top 2/3 of the cap height
      const rb = 10, cy = CAP - rb, bx = 20 - rb;
      const d = Math.hypot(x - bx, y - cy);
      const bowl = x >= bx && d <= rb && d >= rb - ST;
      return bar(0, 0, ST, CAP)(x, y) || bar(0, CAP - ST, bx + 0.5, CAP)(x, y) || bar(0, CAP - 2 * rb, bx + 0.5, CAP - 2 * rb + ST)(x, y) || bowl;
    } },
  o: { w: 2 * R, ink: ring(R, R) },
  c: { w: 2 * R - 1, ink: (x, y) => ring(R, R)(x, y) && !(x > R + 1 && Math.abs(Math.atan2(y - R, x - R)) < 0.62) },
  k: { w: 20, ink: or(bar(0, 0, ST, CAP), stroke(ST - 1, XH * 0.38, 18.5, XH - 1.5, ST + 0.6), stroke(ST + 3, XH * 0.52, 18.5, 1.8, ST + 0.6)) },
  t: { w: 15, ink: or(bar(4, 0, 4 + ST, CAP - 4), bar(0, XH - ST + 1, 15, XH + 1)) },
};

export interface WordBitmap { w: number; h: number; px: Uint8Array; /** column of each pixel's first appearance, for the wipe */ }

/** Rasterise a word. Letters are spaced tight (tracking can be negative, like the reference). */
export function rasterWord(word: string, tracking = 1): WordBitmap {
  const glyphs = [...word].map((ch) => G[ch]);
  const w = Math.ceil(glyphs.reduce((a, g) => a + g.w + tracking, -tracking)) + 2;
  const h = CAP + 1;
  const px = new Uint8Array(w * h);
  let ox = 1;
  for (const g of glyphs) {
    for (let y = 0; y < h; y++) for (let x = 0; x < Math.ceil(g.w) + 1; x++) {
      // sample the pixel centre; y measured up from the baseline
      const yy = CAP - 1 - y + 0.5;
      if (yy >= 0 && g.ink(x + 0.5, yy)) {
        const X = Math.round(ox + x);
        if (X >= 0 && X < w) px[y * w + X] = 1;
      }
    }
    ox += g.w + tracking;
  }
  return { w, h, px };
}
