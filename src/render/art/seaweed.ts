import type { FrameBuffer } from '../framebuffer';
import { P } from '../palette';

/**
 * Swaying seaweed strands, drawn every frame. Each strand sways on its own sine, more
 * at the tip than the root, and bends with the real water flow at its tip (so a burst
 * from the nozzle visibly pushes nearby weed).
 */
export interface Strand {
  x: number; base: number; height: number;
  phase: number; amp: number; width: number;
  kind: 'kelp' | 'grass';
  /** smoothed flow bend at the tip (px) */
  bend: number;
  dark: boolean;
}

export function drawStrand(fb: FrameBuffer, s: Strand, t: number, ox: number): void {
  const seg = 3, n = Math.max(2, Math.floor(s.height / seg));
  const stem = s.dark ? P.WEED : P.SEAGREEN, hi = s.dark ? P.SEAGREEN : P.GREEN, leaf = s.dark ? P.SEAGREEN : P.GREEN, leafHi = s.dark ? P.GREEN : P.LGREEN;
  let px = s.x + ox, py = s.base;
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    const sway = Math.sin(t * 1.1 + s.phase + i * 0.28) * s.amp * Math.pow(f, 1.4) + s.bend * f * f;
    const nx = s.x + ox + sway, ny = s.base - i * seg;
    // stem segment
    const steps = 3;
    for (let k = 1; k <= steps; k++) {
      const x = Math.round(px + ((nx - px) * k) / steps), y = Math.round(py + ((ny - py) * k) / steps);
      for (let w = 0; w < s.width; w++) fb.set(x + w, y, w === 0 ? hi : stem);
    }
    // leaves
    if (s.kind === 'kelp' && i % 3 === 0 && i < n) {
      const side = (i / 3) % 2 ? 1 : -1;
      const lx = Math.round(nx) + (side > 0 ? s.width : -1), ly = Math.round(ny);
      const flick = Math.round(Math.sin(t * 2 + s.phase + i) * 0.8);
      for (let k = 0; k < 5; k++) fb.set(lx + side * k, ly - Math.round(k * 0.6) + (k > 2 ? flick : 0), k === 0 ? leaf : k < 4 ? leafHi : leaf);
      for (let k = 1; k < 4; k++) fb.set(lx + side * k, ly - Math.round(k * 0.6) + 1, leaf);
    }
    if (s.kind === 'grass' && i === n) fb.set(Math.round(nx), Math.round(ny) - 1, leafHi);
    px = nx; py = ny;
  }
}
