import type { FrameBuffer } from './framebuffer';
import type { FluidField } from '../physics/fluid';
import type { Rng } from '../physics/rng';
import { P, LIGHTEN } from './palette';

/** Bubbles: 1-3 px, advected by the water, wobble as they rise, pop at the surface. */
const MAX = 220;

export class Bubbles {
  private n = 0;
  private x = new Float32Array(MAX);
  private y = new Float32Array(MAX);
  private px = new Float32Array(MAX);
  private py = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private size = new Uint8Array(MAX);
  private phase = new Float32Array(MAX);
  private flow = { u: 0, v: 0 };

  constructor(private rng: Rng) {}

  spawn(x: number, y: number, size = 1): void {
    if (this.n >= MAX) return;
    const i = this.n++;
    this.x[i] = this.px[i] = x; this.y[i] = this.py[i] = y;
    this.life[i] = this.rng.range(1.5, 4);
    this.size[i] = size;
    this.phase[i] = this.rng.range(0, 6.28);
  }

  clear(): void { this.n = 0; }

  /** Returns how many bubbles popped at the surface this step (for sound). */
  update(dt: number, fluid: FluidField, top: number, left: number, right: number): number {
    let pops = 0;
    for (let i = 0; i < this.n; i++) {
      this.px[i] = this.x[i]; this.py[i] = this.y[i];
      fluid.sample(this.x[i], this.y[i], this.flow);
      const rise = 14 + this.size[i] * 6;
      this.phase[i] += dt * (5 + this.size[i]);
      this.x[i] += (this.flow.u * 0.7 + Math.sin(this.phase[i]) * 6) * dt;
      this.y[i] += (this.flow.v * 0.7 - rise) * dt;
      this.life[i] -= dt;
      if (this.x[i] < left + 1) this.x[i] = left + 1;
      if (this.x[i] > right - 2) this.x[i] = right - 2;
      if (this.life[i] <= 0 || this.y[i] < top + 1) {
        if (this.y[i] < top + 1 && this.size[i] > 1) pops++;
        const j = --this.n; // swap-remove
        this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.px[i] = this.px[j]; this.py[i] = this.py[j];
        this.life[i] = this.life[j]; this.size[i] = this.size[j]; this.phase[i] = this.phase[j];
        i--;
      }
    }
    return pops;
  }

  /** Sizes are screen pixels (1-4), so bubbles stay tiny at any DETAIL. */
  draw(fb: FrameBuffer, alpha: number, scale = 1): void {
    for (let i = 0; i < this.n; i++) {
      const x = Math.round((this.px[i] + (this.x[i] - this.px[i]) * alpha) * scale);
      const y = Math.round((this.py[i] + (this.y[i] - this.py[i]) * alpha) * scale);
      const s = this.size[i];
      if (s === 1) { fb.remap(x, y, LIGHTEN); fb.remap(x, y, LIGHTEN); }
      else if (s === 2) {
        fb.remapRect(x, y, 2, 2, LIGHTEN);
        fb.set(x, y, P.WHITE);
      } else if (s === 3) {
        // hollow ring with a glint
        fb.remap(x + 1, y, LIGHTEN); fb.remap(x, y + 1, LIGHTEN); fb.remap(x + 2, y + 1, LIGHTEN); fb.remap(x + 1, y + 2, LIGHTEN);
        fb.set(x, y, P.WHITE);
      } else {
        // 4 px: round outline, tinted centre, glint
        fb.remap(x + 1, y, LIGHTEN); fb.remap(x + 2, y, LIGHTEN);
        fb.remap(x, y + 1, LIGHTEN); fb.remap(x + 3, y + 1, LIGHTEN);
        fb.remap(x, y + 2, LIGHTEN); fb.remap(x + 3, y + 2, LIGHTEN);
        fb.remap(x + 1, y + 3, LIGHTEN); fb.remap(x + 2, y + 3, LIGHTEN);
        fb.remapRect(x + 1, y + 1, 2, 2, LIGHTEN);
        fb.set(x + 1, y + 1, P.WHITE);
      }
    }
  }
}

/** Splash sparks: tiny bright pixels flung out when a ring lands, fading as they slow. */
export class Sparks {
  private items: { x: number; y: number; vx: number; vy: number; life: number; max: number }[] = [];
  constructor(private rng: Rng) {}

  burst(x: number, y: number, n = 10, speed = 30): void {
    for (let i = 0; i < n && this.items.length < 120; i++) {
      const a = this.rng.range(Math.PI * 1.05, Math.PI * 1.95); // upward fan
      const s = speed * this.rng.range(0.4, 1);
      const max = this.rng.range(0.25, 0.5);
      this.items.push({ x, y, vx: Math.cos(a) * s * 1.6, vy: Math.sin(a) * s, life: max, max });
    }
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) { this.items.splice(i, 1); continue; }
      const k = Math.exp(-5 * dt);
      p.vx *= k; p.vy = p.vy * k + 20 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  draw(fb: FrameBuffer, scale = 1): void {
    for (const p of this.items) {
      const f = p.life / p.max;
      const c = f > 0.6 ? P.WHITE : f > 0.3 ? P.LIGHT : P.SHALLOW;
      fb.set(Math.round(p.x * scale), Math.round(p.y * scale), c);
    }
  }

  clear(): void { this.items.length = 0; }
}
