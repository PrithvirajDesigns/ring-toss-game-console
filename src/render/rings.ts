import type { FrameBuffer } from './framebuffer';
import { RING_COLORS, P, type RingColor } from './palette';

export const HALF_ALL = 0, HALF_BACK = 1, HALF_FRONT = 2;

/**
 * Pseudo-3D ring in screen pixels: an elliptical annulus whose vertical radius is
 * R·|cos(tilt)|, from a full circle (face-on) to a 1 px line (edge-on). Rasterised per
 * pixel on integer offsets from a snapped centre, so it is symmetric and never sub-pixel.
 * Lighting comes from the upper left: 1 px highlight on every upward-facing edge, 1 px shade
 * on every downward-facing one, a darker lower band and a small specular glint.
 * `half` lets threaded rings draw their far half behind the peg and near half in front.
 */
export function drawRing(
  fb: FrameBuffer, x: number, y: number, R: number, r: number, tilt: number, color: RingColor, half = HALF_ALL,
): void {
  const cx = Math.round(x), cy = Math.round(y);
  const k = Math.abs(Math.cos(tilt));
  const ry = Math.max(0.6, R * k);
  const iry = r * k;
  const hasHole = iry >= 0.7;
  const pal = RING_COLORS[color];
  const R2 = R * R, ry2 = ry * ry, r2 = r * r, iry2 = iry * iry;
  const mid = (R + r) / 2;

  const inOuter = (dx: number, dy: number) => (dx * dx) / R2 + (dy * dy) / ry2 <= 1;
  const inHole = (dx: number, dy: number) => hasHole && (dx * dx) / r2 + (dy * dy) / iry2 < 1;
  const solid = (dx: number, dy: number) => inOuter(dx, dy) && !inHole(dx, dy);

  const X = Math.ceil(R), Y = Math.ceil(ry);
  // 1 px dark outline so rings read against busy coral (skipped for tiny icons)
  if (R >= 6) {
    for (let dy = -Y - 1; dy <= Y + 1; dy++) {
      if (half === HALF_BACK && dy >= 0) continue;
      if (half === HALF_FRONT && dy < 0) continue;
      for (let dx = -X - 1; dx <= X + 1; dx++) {
        if (solid(dx, dy)) continue;
        if (solid(dx - 1, dy) || solid(dx + 1, dy) || solid(dx, dy - 1) || solid(dx, dy + 1)) fb.set(cx + dx, cy + dy, P.INK);
      }
    }
  }
  for (let dy = -Y; dy <= Y; dy++) {
    if (half === HALF_BACK && dy >= 0) continue;
    if (half === HALF_FRONT && dy < 0) continue;
    for (let dx = -X; dx <= X; dx++) {
      if (!solid(dx, dy)) continue;
      let c = pal.base;
      if (ry < 1.5) {
        // edge-on: shade along the length
        c = dx < -R * 0.45 ? pal.hi : dx > R * 0.5 ? pal.shade : pal.base;
      } else {
        // where in the band (0 = inner edge, 1 = outer) and which way it faces
        const ex = dx, ey = dy * (R / ry);
        const rad = Math.hypot(ex, ey);
        const ang = Math.atan2(ey, ex); // -π/2 = top
        if (ey > 0 && Math.cos(ang - Math.PI * 0.6) > 0.55) c = pal.shade; // lower-right band in shadow
        if (!solid(dx, dy - 1)) c = pal.hi;
        else if (!solid(dx, dy + 1)) c = pal.shade;
        // specular glint on the upper-left of the band
        if (R >= 6 && Math.abs(rad - mid) < 0.9 && ang < -1.9 && ang > -2.5) c = P.WHITE;
      }
      fb.set(cx + dx, cy + dy, c);
    }
  }
}
