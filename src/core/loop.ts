/**
 * Fixed-timestep loop with an accumulator. Simulation runs at `hz` regardless of display
 * rate; render receives alpha ∈ [0,1) to interpolate between the last two sim states.
 */
export class FixedLoop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  fps = 60;
  readonly dt: number;

  constructor(hz: number, private step: (dt: number) => void, private render: (alpha: number) => void, private maxSteps = 12) {
    this.dt = 1 / hz;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    const tick = (now: number) => {
      if (!this.running) return;
      const frame = Math.min(0.1, Math.max(0, (now - this.last) / 1000)); // clamp after tab switches
      this.last = now;
      if (frame > 0) this.fps += (1 / frame - this.fps) * 0.05;
      this.acc += frame;
      let n = 0;
      while (this.acc >= this.dt && n < this.maxSteps) { this.step(this.dt); this.acc -= this.dt; n++; }
      if (n === this.maxSteps) this.acc = 0; // spiral-of-death guard
      this.render(this.acc / this.dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  get isRunning(): boolean { return this.running; }
}
