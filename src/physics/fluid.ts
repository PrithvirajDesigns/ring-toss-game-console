import type { PhysicsConfig } from './config';
import type { Rng } from './rng';

/**
 * The water. Not a grid solver: an analytic velocity field built from
 *  - one jet cone per nozzle (pressure-driven, with build-up, decay and a backflow pulse),
 *  - short-lived vortices shed by the jet (they drift up, weaken and make rings tumble),
 *  - divergence-free ambient "curl noise" so nothing ever sits perfectly still.
 * Cheap to sample anywhere, which is all the rings and bubbles need.
 */

export interface Nozzle {
  x: number; y: number;
  held: boolean;
  holdTime: number;
  /** 0..1 jet pressure */
  pressure: number;
  /** remaining backflow time and amount */
  backflowT: number;
  backflowAmt: number;
  /** signed output in -1..1 (negative = suction) */
  output: number;
  vortexAcc: number;
}

export interface Vortex { x: number; y: number; gamma0: number; age: number; life: number; core: number; }

export interface FlowSample { u: number; v: number; }

const MAX_VORTICES = 48;

export class FluidField {
  readonly nozzles: Nozzle[] = [];
  readonly vortices: Vortex[] = [];
  time = 0;
  /** Multiplier on ambient currents (levels can make the water rougher). */
  currentScale = 1;

  constructor(private cfg: PhysicsConfig, private rng: Rng) {}

  addNozzle(x: number, y: number): void {
    this.nozzles.push({ x, y, held: false, holdTime: 0, pressure: 0, backflowT: 0, backflowAmt: 0, output: 0, vortexAcc: 0 });
  }

  press(i: number): void {
    const n = this.nozzles[i];
    if (!n || n.held) return;
    n.held = true;
    n.holdTime = 0;
    n.backflowT = 0;
    n.pressure = Math.max(n.pressure, this.cfg.jetTapPressure);
  }

  release(i: number): void {
    const n = this.nozzles[i];
    if (!n || !n.held) return;
    n.held = false;
    n.backflowT = this.cfg.jetBackflowTime;
    n.backflowAmt = n.pressure * this.cfg.jetBackflow;
  }

  reset(): void {
    this.vortices.length = 0;
    for (const n of this.nozzles) { n.held = false; n.pressure = 0; n.output = 0; n.backflowT = 0; n.holdTime = 0; }
  }

  update(dt: number): void {
    const c = this.cfg;
    this.time += dt;
    for (const n of this.nozzles) {
      if (n.held) {
        n.holdTime += dt;
        if (n.holdTime < c.jetMaxHold) n.pressure += (1 - n.pressure) * (1 - Math.exp(-c.jetBuildRate * dt));
        else n.pressure *= Math.exp(-dt / c.jetDecay); // chamber empty: flow dies even while held
      } else {
        n.pressure *= Math.exp(-dt / c.jetDecay);
      }
      if (n.backflowT > 0) {
        n.backflowT -= dt;
        n.output = -n.backflowAmt;
      } else {
        n.output = n.pressure < 0.003 ? 0 : n.pressure;
      }

      // Shed vortices along the jet's edges while it is pushing.
      if (n.output > 0.05) {
        n.vortexAcc += c.vortexRate * n.output * dt;
        while (n.vortexAcc >= 1) {
          n.vortexAcc -= 1;
          this.spawnVortex(n);
        }
      }
    }

    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const vx = this.vortices[i];
      vx.age += dt;
      if (vx.age >= vx.life) { this.vortices.splice(i, 1); continue; }
      // Vortices ride the jet and ambient flow (not each other: keeps it stable and cheap).
      const s = this.sampleBase(vx.x, vx.y);
      vx.x += s.u * 0.55 * dt;
      vx.y += s.v * 0.55 * dt;
    }
  }

  private spawnVortex(n: Nozzle): void {
    const c = this.cfg, r = this.rng;
    if (this.vortices.length >= MAX_VORTICES) this.vortices.shift();
    const dist = r.range(6, c.jetReach * 1.3);
    const side = r.sign();
    const lateral = Math.tan(c.jetConeAngle) * dist * r.range(0.5, 1.1) * side;
    // Shear on an upward jet: left edge spins one way, right edge the other. Mostly, not always.
    const spin = (r.next() < 0.8 ? side : -side);
    this.vortices.push({
      x: n.x + lateral,
      y: n.y - dist,
      gamma0: c.vortexStrength * n.output * r.range(0.4, 1) * spin,
      age: 0,
      life: c.vortexLife * r.range(0.6, 1.3),
      core: c.vortexCore * r.range(0.7, 1.3),
    });
  }

  /** Jet + ambient only (no vortices). */
  private sampleBase(x: number, y: number): FlowSample {
    const out = { u: 0, v: 0 };
    this.addJets(x, y, out);
    this.addAmbient(x, y, out);
    return out;
  }

  private addJets(x: number, y: number, out: FlowSample): void {
    const c = this.cfg;
    for (const n of this.nozzles) {
      if (n.output === 0) continue;
      if (n.output > 0) {
        if (y > n.y + 1) continue; // nothing below the nozzle mouth
        // Angles and spread are measured from a virtual source below the mouth: a wide nozzle.
        const dx = x - n.x, dy = y - (n.y + c.jetSourceDepth);
        const r = Math.hypot(x - n.x, y - n.y);
        const rr = Math.max(Math.hypot(dx, dy), 2);
        const cosA = -dy / rr;
        const ang = Math.acos(Math.min(1, Math.max(-1, cosA)));
        const q = ang / c.jetConeAngle, q2 = ang / 1.35;
        const radial = Math.exp(-r / c.jetReach);
        const base = c.jetMaxSpeed * n.output * radial;
        // Core: the narrow cone, spreading radially from the virtual source.
        const core = base * Math.exp(-q * q);
        const ux = (dx / rr) * 0.8, uy = (dy / rr) * 0.8 - 0.2;
        const len = Math.hypot(ux, uy) || 1;
        out.u += (ux / len) * core;
        out.v += (uy / len) * core;
        // Broad lobe: the whole sealed tank gets shoved upward a little.
        const broad = base * c.jetBroad * Math.exp(-q2 * q2);
        out.u += (dx / rr) * 0.25 * broad;
        out.v -= broad;
        // Entrainment: near the floor, water is drawn sideways into the base of the jet.
        const h = n.y - y;
        if (h < 22) {
          const adx = Math.abs(x - n.x);
          const e = c.jetMaxSpeed * n.output * c.jetEntrain * Math.exp(-adx / 55) * (1 - h / 22) * Math.min(1, adx / 6);
          out.u -= Math.sign(x - n.x) * e;
        }
      } else {
        // Backflow: short-range pull toward the nozzle.
        const dx = x - n.x, dy = y - n.y;
        const r = Math.hypot(dx, dy);
        const reach = c.jetReach * 0.35;
        const rr = Math.max(r, 2);
        const speed = c.jetMaxSpeed * n.output * Math.exp(-r / reach);
        out.u += (dx / rr) * speed;
        out.v += (dy / rr) * speed;
      }
    }
  }

  private addAmbient(x: number, y: number, out: FlowSample): void {
    const c = this.cfg;
    const A = c.ambientStrength * this.currentScale;
    if (A === 0) return;
    const L = c.ambientScale, t = this.time * c.ambientSpeed;
    // Stream function psi; velocity = (dpsi/dy, -dpsi/dx) is divergence-free.
    // psi = A L [ sin(x/L + t) cos(0.8y/L - 1.3t) + 0.5 sin((x + y)/(0.6L) + 0.7t) ]
    const a1 = x / L + t, b1 = (0.8 * y) / L - 1.3 * t;
    const a2 = (x + y) / (0.6 * L) + 0.7 * t;
    const dpsidx = A * (Math.cos(a1) * Math.cos(b1) + (0.5 / 0.6) * Math.cos(a2));
    const dpsidy = A * (-0.8 * Math.sin(a1) * Math.sin(b1) + (0.5 / 0.6) * Math.cos(a2));
    out.u += dpsidy;
    out.v += -dpsidx;
  }

  private addVortices(x: number, y: number, out: FlowSample): void {
    for (const vx of this.vortices) {
      const dx = x - vx.x, dy = y - vx.y;
      const r2 = dx * dx + dy * dy;
      if (r2 > 2500) continue;
      const fade = 1 - vx.age / vx.life;
      const gamma = vx.gamma0 * fade * fade;
      const fac = (gamma / (2 * Math.PI * Math.max(r2, 1e-3))) * (1 - Math.exp(-r2 / (vx.core * vx.core)));
      out.u += -dy * fac;
      out.v += dx * fac;
    }
  }

  /** Full fluid velocity at a point. */
  sample(x: number, y: number, out: FlowSample = { u: 0, v: 0 }): FlowSample {
    out.u = 0; out.v = 0;
    this.addJets(x, y, out);
    this.addAmbient(x, y, out);
    this.addVortices(x, y, out);
    return out;
  }

  /** Vorticity (curl, 1/s) by central differences. */
  curl(x: number, y: number): number {
    const h = 1.5;
    const a = this.sample(x + h, y), b = this.sample(x - h, y);
    const c = this.sample(x, y + h), d = this.sample(x, y - h);
    return (a.v - b.v) / (2 * h) - (c.u - d.u) / (2 * h);
  }
}
