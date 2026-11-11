import { Canvas8, CLEAR, type Sprite } from '../sprite';
import { P } from '../palette';

/**
 * Original tropical fish, built from shapes in code so they stay easy to edit.
 * Every fish faces right; the renderer mirrors it when swimming left.
 * Swim cycles: 4 frames made by bending the rear of the body and the tail through a
 * sine wave (head stays still), the way a real fish swims.
 */

export type FishKind = 'tang' | 'angel' | 'chromis';

export interface FishSprites { frames: Sprite[]; w: number; h: number; /** x of the tail end (for the wave) */ headX: number; }

/** Round yellow tang-like fish: a golden disc with a pointed snout and a pale tail spine. */
function buildTang(): Canvas8 {
  const c = new Canvas8(28, 24);
  const fin = (x: number, y: number) => ((x + y) % 3 === 0 ? P.DORANGE : P.ORANGE);
  // dorsal and anal fins, swept back
  c.poly([[7, 7], [11, 2], [17, 1], [22, 4], [20, 8]], fin);
  c.poly([[7, 16], [11, 21], [17, 22], [21, 19], [19, 15]], fin);
  // tail (slightly forked)
  c.poly([[1, 5], [7, 10], [7, 14], [1, 19], [3, 12]], fin);
  // body: yellow with a lit top and warm underside, dithered
  c.ellipse(15, 12, 9, 8.5, (x, y) => {
    const t = (y - 3.5) / 17;
    if (t < 0.16) return (x * 3 + y) % 5 === 0 ? P.WHITE : P.YELLOW;
    if (t < 0.62) return P.YELLOW;
    if (t < 0.78) return (x + y) % 2 ? P.YELLOW : P.ORANGE;
    return P.ORANGE;
  });
  // snout
  c.poly([[22, 11], [26, 12.5], [22, 15]], P.YELLOW);
  c.set(25, 12, P.ORANGE);
  // faint body lines
  for (let x = 10; x < 21; x += 3) for (let y = 7; y < 18; y++) if (c.get(x, y) === P.YELLOW && y % 2 === 0) c.set(x, y, P.ORANGE);
  // pale tail spine
  c.set(8, 12, P.WHITE); c.set(9, 12, P.WHITE);
  // eye
  c.ellipse(20.5, 9.5, 1.6, 1.6, P.INK);
  c.set(20, 9, P.WHITE);
  // gill line
  c.set(17, 9, P.ORANGE); c.set(17, 10, P.ORANGE); c.set(17, 11, P.ORANGE);
  c.outline(P.BROWN);
  return c;
}

/** Striped angelfish-like fish: tall silver body, bold dark bands, long trailing fins. */
function buildAngel(): Canvas8 {
  const c = new Canvas8(26, 34);
  const finCol = (_x: number, y: number) => (y % 4 === 0 ? P.ORANGE : P.YELLOW);
  // long swept dorsal and anal fins
  c.poly([[17, 10], [11, 6], [2, 0], [6, 7], [8, 13]], finCol);
  c.poly([[17, 23], [11, 27], [2, 33], [6, 26], [8, 20]], finCol);
  // tail fan
  c.poly([[0, 12], [5, 15], [5, 19], [0, 22], [2, 17]], P.YELLOW);
  // body: diamond-ish disc
  c.poly([[5, 16.5], [12, 8], [20, 12], [23, 16.5], [20, 21], [12, 25]], (x, y) => {
    // three dark bands, tilted slightly
    const b = (x + (y - 16) * 0.15);
    if ((b > 8 && b < 10.5) || (b > 13.5 && b < 15.5)) return P.INK;
    if (b > 18 && b < 19.5) return P.SLATE;
    return y < 13 ? P.WHITE : y > 21 ? P.PLASTIC_SH : P.PLASTIC;
  });
  // yellow face wash and snout
  c.poly([[21, 13], [24.5, 16], [21, 19]], P.YELLOW);
  c.set(24, 16, P.ORANGE);
  // eye inside the front band area
  c.ellipse(20, 15, 1.4, 1.4, P.INK);
  c.set(20, 14, P.WHITE);
  c.outline(P.INK);
  return c;
}

/** Small blue-green schooling fish. */
function buildChromis(): Canvas8 {
  const c = new Canvas8(12, 7);
  c.poly([[0, 1], [3, 3], [0, 5.5], [1, 3]], P.SHALLOW);
  c.ellipse(6.5, 3.5, 4.5, 2.4, (_x, y) => (y < 3 ? P.LIGHT : y < 4 ? P.SHALLOW : P.TEAL));
  c.set(9, 3, P.INK);
  c.outline(P.DEEP);
  return c;
}

/** Bend the rear half through a sine wave to make 4 swim frames. */
function swimFrames(base: Canvas8, headX: number, amp: number): Sprite[] {
  const frames: Sprite[] = [];
  for (let f = 0; f < 4; f++) {
    const ph = (f / 4) * Math.PI * 2;
    const out = new Canvas8(base.w, base.h);
    for (let x = 0; x < base.w; x++) {
      const t = Math.max(0, Math.min(1, (headX - x) / headX)); // 0 at head, 1 at tail tip
      const dy = Math.round(Math.sin(ph - t * 2.2) * amp * t * t);
      for (let y = 0; y < base.h; y++) {
        const v = base.get(x, y - dy);
        if (v !== CLEAR) out.set(x, y, v);
      }
    }
    frames.push(out);
  }
  return frames;
}

const cache = new Map<FishKind, FishSprites>();

export function fishSprites(kind: FishKind): FishSprites {
  const hit = cache.get(kind);
  if (hit) return hit;
  let base: Canvas8, headX: number, amp: number;
  if (kind === 'tang') { base = buildTang(); headX = 18; amp = 2.2; }
  else if (kind === 'angel') { base = buildAngel(); headX = 17; amp = 2; }
  else { base = buildChromis(); headX = 8; amp = 1.2; }
  const s = { frames: swimFrames(base, headX, amp), w: base.w, h: base.h, headX };
  cache.set(kind, s);
  return s;
}
