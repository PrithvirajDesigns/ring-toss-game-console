import type { PhysicsConfig } from './config';
import { FluidField, type FlowSample } from './fluid';
import { Rng } from './rng';
import type { LevelDef, PegDef, TankDef } from '../levels/types';
import { DEFAULT_TANK } from '../levels/types';
import type { RingColor } from '../render/palette';

/**
 * Ring orientation model
 * ----------------------
 * The tank is thin, so each ring is a 2D body plus one rotation, `tilt`, about the
 * screen's horizontal axis:
 *   tilt = 0      ring lies in the screen plane: drawn as a full circle (face-on to you)
 *   tilt = ±π/2   ring lies flat, hole pointing up: drawn as a thin line (edge-on to you)
 * A ring can only slip over a vertical peg when its hole faces the peg, i.e. when
 * |sin(tilt)| ≥ threadMinAlign. Physically, the hole's depth extent (inner·|sin tilt|)
 * must clear the peg. Threaded rings settle to pegRestTilt, so stacks read as squashed ellipses.
 */

export type RingState = 'free' | 'threaded';

export interface Ring {
  id: number;
  color: RingColor;
  x: number; y: number; vx: number; vy: number;
  tilt: number; spin: number;
  /** previous step, for render interpolation */
  px: number; py: number; ptilt: number;
  state: RingState;
  /** peg index when threaded, else -1 */
  peg: number;
  /** resting on the stack / flange (threaded) or floor (free) */
  resting: boolean;
  /** horizontal sway on the peg (px) */
  wobble: number; wobbleV: number;
  phase: number;
}

export type WorldEvent =
  | { type: 'thread'; ring: Ring; peg: number }
  | { type: 'unthread'; ring: Ring; peg: number }
  | { type: 'land'; ring: Ring; peg: number; speed: number }
  | { type: 'hit'; ring: Ring; kind: 'ring' | 'wall' | 'peg'; speed: number };

const TAU = Math.PI * 2;

function wrapTilt(t: number): number {
  // tilt and tilt+π look and behave identically, so keep it in [-π/2, π/2)
  t = ((t + Math.PI / 2) % Math.PI + Math.PI) % Math.PI;
  return t - Math.PI / 2;
}

export class World {
  readonly rings: Ring[] = [];
  readonly pegs: PegDef[];
  readonly tank: TankDef;
  readonly fluid: FluidField;
  readonly rng: Rng;
  readonly events: WorldEvent[] = [];
  /** gravity direction (unit), from tilt */
  gdx = 0; gdy = 1;
  time = 0;
  winTimer = 0;
  private tmp: FlowSample = { u: 0, v: 0 };
  private dt = 1 / 120;

  constructor(public cfg: PhysicsConfig, public level: LevelDef, seed = 1) {
    this.rng = new Rng(seed);
    this.tank = { ...DEFAULT_TANK, ...level.tank };
    this.pegs = level.pegs.map((p) => ({ ...p }));
    this.fluid = new FluidField(cfg, this.rng);
    this.fluid.currentScale = level.current ?? 1;
    for (const x of level.nozzles) this.fluid.addNozzle(x, this.tank.floor + 2);
    this.spawnRings();
  }

  spawnRings(): void {
    this.rings.length = 0;
    const R = this.cfg.ringOuterRadius, t = this.tank, r = this.rng;
    const cols = Math.floor((t.right - t.left - 2) / (2 * R + 1));
    const order = this.level.rings.map((c, i) => ({ c, k: r.next() + i * 0 }));
    order.sort((a, b) => a.k - b.k);
    order.forEach(({ c }, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = t.left + R + 1 + col * (2 * R + 1) + r.range(-0.5, 0.5) + (row % 2) * R;
      const y = t.floor - R - 0.5 - row * (2 * R) - r.range(0, 3);
      const tilt = r.range(-0.3, 0.3);
      this.rings.push({
        id: i, color: c, x, y, vx: 0, vy: 0, tilt, spin: 0, px: x, py: y, ptilt: tilt,
        state: 'free', peg: -1, resting: false, wobble: 0, wobbleV: 0, phase: r.range(0, TAU),
      });
    });
    this.winTimer = 0;
  }

  /** Gravity direction from device tilt, in screen space (y down). null → straight down. */
  setGravity(dir: { x: number; y: number } | null): void {
    if (!dir) { this.gdx = 0; this.gdy = 1; return; }
    const len = Math.hypot(dir.x, dir.y);
    if (len < 1e-4) { this.gdx = 0; this.gdy = 1; return; }
    // Clamp the angle from straight-down so the rings stay controllable.
    const maxAng = Math.asin(Math.min(1, Math.max(0, this.cfg.tiltMaxInfluence)));
    let ang = Math.atan2(dir.x / len, dir.y / len);
    ang = Math.max(-maxAng, Math.min(maxAng, ang));
    this.gdx = Math.sin(ang);
    this.gdy = Math.cos(ang);
  }

  /** Floor height at x: a V (or W, with two nozzles) sloping down to each nozzle mouth. */
  floorAt(x: number): number {
    const t = this.tank;
    let d = Infinity;
    for (const n of this.fluid.nozzles) d = Math.min(d, Math.abs(x - n.x));
    if (!Number.isFinite(d)) d = 0;
    return t.floor - Math.min(18, Math.max(0, d - 3) * this.cfg.floorSlope);
  }

  press(nozzle: number): void { this.fluid.press(nozzle); }
  release(nozzle: number): void { this.fluid.release(nozzle); }

  shake(strength = 1): void {
    const k = this.cfg.shakeImpulse * strength;
    for (const r of this.rings) {
      const a = this.rng.range(0, TAU);
      if (r.state === 'free') { r.vx += Math.cos(a) * k; r.vy += Math.sin(a) * k - k * 0.3; }
      else r.vy -= this.rng.range(0.2, 0.8) * k;
      r.spin += this.rng.range(-8, 8) * strength;
    }
  }

  get threadedCount(): number {
    let n = 0;
    for (const r of this.rings) if (r.state === 'threaded' && this.ringScores(r)) n++;
    return n;
  }

  ringScores(r: Ring): boolean {
    if (r.state !== 'threaded') return false;
    const want = this.pegs[r.peg].color;
    return !want || want === r.color;
  }

  get isWon(): boolean { return this.winTimer >= this.cfg.winSettleTime; }

  step(dt: number): void {
    const c = this.cfg;
    this.dt = dt;
    this.time += dt;
    this.fluid.update(dt);

    const gX = this.gdx * c.gravity, gY = this.gdy * c.gravity;
    const dragK = Math.exp(-c.linearDrag * dt);
    const angK = Math.exp(-c.angularDrag * dt);
    const f = this.tmp;

    for (const r of this.rings) { r.px = r.x; r.py = r.y; r.ptilt = r.tilt; }

    for (const r of this.rings) {
      this.fluid.sample(r.x, r.y, f);
      const flowSpeed = Math.hypot(f.u, f.v);
      if (r.state === 'free') {
        // Drag relaxes the ring toward the local water velocity; gravity (minus buoyancy) pulls it.
        r.vx = f.u + (r.vx - f.u) * dragK + gX * dt;
        r.vy = f.v + (r.vy - f.v) * dragK + gY * dt;
        if (r.resting) r.vx *= Math.exp(-3 * dt); // floor friction

        const rel = Math.hypot(f.u - r.vx, f.v - r.vy);
        const curl = flowSpeed > 6 ? this.fluid.curl(r.x, r.y) : 0;
        const n1 = Math.sin(r.phase + this.time * 2.3);
        const n2 = Math.sin(r.phase * 1.7 + this.time * 5.1);
        const spinAcc =
          c.spinFromVorticity * curl +
          c.spinFromFlow * rel * n1 +
          c.tumbleNoise * n2 * Math.min(1, flowSpeed / 30) -
          c.faceOnRestore * (r.resting ? c.floorRestoreBoost : 1) * Math.sin(2 * r.tilt);
        r.spin = r.spin * angK + spinAcc * dt;
        r.tilt = wrapTilt(r.tilt + r.spin * dt);

        r.x += r.vx * dt;
        r.y += r.vy * dt;
      } else {
        const peg = this.pegs[r.peg];
        // On the peg only the along-peg component of the forces acts.
        r.vx = 0;
        const k = Math.exp(-c.linearDrag * c.threadedFlowCoupling * dt);
        // Gravity still pulls at full strength (minus the same buoyancy), water grips less.
        r.vy = f.v + (r.vy - f.v) * k + gY * dt;
        r.vy *= Math.exp(-c.linearDrag * (1 - c.threadedFlowCoupling) * dt); // peg friction
        r.y += r.vy * dt;

        // Sway around the peg, driven by sideways flow and sideways gravity.
        const swayMax = Math.max(0, c.ringInnerRadius - c.pegHalfWidth);
        r.wobbleV += (-160 * r.wobble - 9 * r.wobbleV + f.u * 1.2 + gX * 0.6) * dt;
        r.wobble += r.wobbleV * dt;
        if (Math.abs(r.wobble) > swayMax) { r.wobble = Math.sign(r.wobble) * swayMax; r.wobbleV *= -0.3; }
        r.x = peg.x + r.wobble;

        // The peg holds the ring nearly flat; flow can rock it.
        const target = (r.tilt >= 0 ? 1 : -1) * c.pegRestTilt;
        const rock = Math.sin(r.phase + this.time * 7) * Math.min(1, flowSpeed / 40) * 6;
        r.spin = r.spin * angK * Math.exp(-5 * dt) + (-c.pegTiltStiffness * (r.tilt - target) + rock) * dt;
        r.tilt = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, r.tilt + r.spin * dt));

        // Pushed back up past the tip: off the peg again.
        if (r.y < peg.tipY - 2) { // hysteresis: no on/off flicker right at the tip
          r.state = 'free';
          r.peg = -1;
          r.resting = false;
          r.vx = f.u * 0.4 + r.wobbleV * 0.5;
          r.spin += this.rng.range(-3, 3);
          this.events.push({ type: 'unthread', ring: r, peg: this.pegs.indexOf(peg) });
        }
      }
    }

    this.resolveStacks();
    for (let iter = 0; iter < 3; iter++) {
      this.collideRings(iter === 0);
      for (const r of this.rings) if (r.state === 'free') { this.collidePegs(r, iter === 0); this.collideWalls(r, iter === 0); }
    }
    this.updateWin(dt);
  }

  private resolveStacks(): void {
    const c = this.cfg;
    for (let p = 0; p < this.pegs.length; p++) {
      const peg = this.pegs[p];
      const list = this.rings.filter((r) => r.state === 'threaded' && r.peg === p).sort((a, b) => b.y - a.y);
      let limit = peg.baseY - 1;
      for (const r of list) {
        if (r.y >= limit) {
          if (r.vy > 0) {
            if (!r.resting && r.vy > 6) {
              this.events.push({ type: 'land', ring: r, peg: p, speed: r.vy });
              r.wobbleV += this.rng.sign() * Math.min(40, r.vy * 0.8);
              r.spin += this.rng.sign() * c.landWobble * Math.min(1, r.vy / 30) * 20;
            }
            r.vy = -r.vy * 0.12;
          }
          r.y = limit;
          r.resting = true;
        } else {
          r.resting = limit - r.y < 0.35 && Math.abs(r.vy) < 4;
        }
        limit = r.y - c.stackSpacing;
      }
    }
  }

  private collideRings(report: boolean): void {
    const c = this.cfg, R = c.ringOuterRadius, rings = this.rings;
    for (let i = 0; i < rings.length; i++) {
      const a = rings[i];
      for (let j = i + 1; j < rings.length; j++) {
        const b = rings[j];
        if (a.state === 'threaded' && b.state === 'threaded') continue; // stacks handled separately
        if (a.state === 'free' && b.state === 'free') {
          let dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= 4 * R * R) continue;
          let d = Math.sqrt(d2);
          if (d < 1e-4) { dx = this.rng.range(-1, 1); dy = -1; d = Math.hypot(dx, dy); }
          const nx = dx / d, ny = dy / d, overlap = 2 * R - d;
          a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
          const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (vn < 0) {
            const jn = (-(1 + c.ringRestitution) * vn) / 2;
            a.vx -= jn * nx; a.vy -= jn * ny; b.vx += jn * nx; b.vy += jn * ny;
            // tangential friction + a little spin from glancing contact
            const tx = -ny, ty = nx;
            const vt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
            const jt = Math.min(Math.abs(vt) / 2, c.contactFriction * jn) * Math.sign(vt);
            a.vx += jt * tx; a.vy += jt * ty; b.vx -= jt * tx; b.vy -= jt * ty;
            a.spin += vt * 0.05; b.spin -= vt * 0.05;
            if (report && -vn > 12) this.events.push({ type: 'hit', ring: a, kind: 'ring', speed: -vn });
          }
        } else {
          // free ring vs threaded ring: the threaded one is a thin horizontal bar (it is nearly flat)
          const fr = a.state === 'free' ? a : b, tr = a.state === 'free' ? b : a;
          const half = Math.max(1, R * Math.abs(Math.cos(tr.tilt)));
          const hit = this.circleVsSegment(fr, tr.x - R + half, tr.y, tr.x + R - half, tr.y, R + half, c.wallRestitution);
          if (hit > 0) {
            tr.vy += Math.sign(tr.y - fr.y) * hit * 0.15; // nudge the stack a little
            if (report && hit > 12) this.events.push({ type: 'hit', ring: fr, kind: 'ring', speed: hit });
          }
        }
      }
    }
  }

  /** Push a free ring (circle) out of a capsule; returns impact speed (0 if no contact). */
  private circleVsSegment(r: Ring, ax: number, ay: number, bx: number, by: number, rad: number, e: number): number {
    const abx = bx - ax, aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((r.x - ax) * abx + (r.y - ay) * aby) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + abx * t, qy = ay + aby * t;
    let dx = r.x - qx, dy = r.y - qy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rad * rad) return 0;
    let d = Math.sqrt(d2);
    if (d < 1e-4) { dx = 0; dy = -1; d = 1; }
    const nx = dx / d, ny = dy / d;
    r.x = qx + nx * rad; r.y = qy + ny * rad;
    const vn = r.vx * nx + r.vy * ny;
    if (vn < 0) {
      const jn = -(1 + e) * vn;
      r.vx += jn * nx; r.vy += jn * ny;
      // Coulomb friction: tangential change bounded by mu * normal impulse.
      const tx = -ny, ty = nx, vt = r.vx * tx + r.vy * ty;
      const jt = Math.min(Math.abs(vt), this.cfg.contactFriction * jn) * Math.sign(vt);
      r.vx -= jt * tx; r.vy -= jt * ty;
      r.spin += vt * 0.08 + this.rng.range(-1, 1) * -vn * 0.06;
      return -vn;
    }
    return 0;
  }

  private collidePegs(r: Ring, report: boolean): void {
    const c = this.cfg, R = c.ringOuterRadius, hw = c.pegHalfWidth;
    for (let p = 0; p < this.pegs.length; p++) {
      const peg = this.pegs[p];
      const dx = r.x - peg.x;
      if (Math.abs(dx) > R + hw + 4) continue;
      if (r.y + R < peg.tipY - 1 || r.y - R > peg.baseY + 3) continue;

      const aligned = Math.abs(Math.sin(r.tilt)) >= c.threadMinAlign;
      const holeClear = c.ringInnerRadius - hw + c.threadTolerance;
      const adx = Math.abs(dx);

      // Threading: centre crosses the tip downward, hole facing the peg, peg inside the hole.
      if (aligned && adx < holeClear && r.py < peg.tipY && r.y >= peg.tipY && r.vy > -c.threadMaxUpSpeed) {
        r.state = 'threaded';
        r.peg = p;
        r.resting = false;
        r.wobble = dx;
        r.wobbleV = r.vx * 0.5;
        r.vx = 0;
        this.events.push({ type: 'thread', ring: r, peg: p });
        return;
      }

      // Flange the rings stack on (a short horizontal bar).
      let hit = this.circleVsSegment(r, peg.x - 3, peg.baseY + 1, peg.x + 3, peg.baseY + 1, R + 0.5, c.wallRestitution);

      if (aligned && r.y < peg.tipY) {
        // Hole faces the peg. Centred: the tip is inside the hole, no contact; thread on crossing.
        if (adx < holeClear) {
          // threading test happens below
        } else if (adx < R + hw) {
          const ry = Math.max(0.75, R * Math.abs(Math.cos(r.tilt)));
          if (r.y + ry + hw > peg.tipY) {
            // The rim is on the tip. Inner half of the rim funnels toward the hole, outer half slides off.
            const mid = (c.ringInnerRadius + R) / 2;
            const s = Math.sign(dx) || 1;
            if (adx < mid) {
              r.vx -= s * 4;
              if (r.vy > 0) r.vy *= 0.6;
            } else {
              r.x = peg.x + s * (R + hw);
              if (r.vx * s < 0) { hit = Math.max(hit, Math.abs(r.vx)); r.vx = -r.vx * c.wallRestitution; }
              if (r.vy > 0) r.vy *= 0.8;
            }
            r.spin += this.rng.range(-1, 1) * 0.8;
          }
        }
      } else {
        // Hole not facing the peg (or already below the tip): the peg is a solid capsule.
        const h = this.circleVsSegment(r, peg.x, peg.tipY, peg.x, peg.baseY, R + hw, c.wallRestitution);
        hit = Math.max(hit, h);
        // Perched on the tip: a face-on ring can't balance there, it rolls off to one side.
        if (r.y < peg.tipY && Math.abs(r.x - peg.x) < R + hw + 0.01 && Math.hypot(r.x - peg.x, r.y - peg.tipY) <= R + hw + 0.05) {
          const s = Math.sign(r.x - peg.x) || this.rng.sign();
          r.vx += s * c.tipRollOff * this.dt;
        }
      }

      if (report && hit > 10) this.events.push({ type: 'hit', ring: r, kind: 'peg', speed: hit });
    }
  }

  private collideWalls(r: Ring, report: boolean): void {
    const c = this.cfg, t = this.tank, R = c.ringOuterRadius, e = c.wallRestitution;
    const hy = Math.max(1.2, R * Math.abs(Math.cos(r.tilt))); // vertical half-extent of the drawn ring
    let hit = 0;
    if (r.x < t.left + R) { r.x = t.left + R; if (r.vx < 0) { hit = -r.vx; r.vx = -r.vx * e; } }
    if (r.x > t.right - R) { r.x = t.right - R; if (r.vx > 0) { hit = r.vx; r.vx = -r.vx * e; } }
    if (r.y < t.top + hy) { r.y = t.top + hy; if (r.vy < 0) { hit = -r.vy; r.vy = -r.vy * e; } }
    r.resting = false;
    // Sloped floor: sample under the ring's lowest point, push out along the slope normal.
    const fy = this.floorAt(r.x);
    if (r.y > fy - hy) {
      const slope = (this.floorAt(r.x + 1) - this.floorAt(r.x - 1)) / 2;
      let nx = slope, ny = -1;
      const l = Math.hypot(nx, ny); nx /= l; ny /= l;
      r.y = fy - hy;
      const vn = r.vx * nx + r.vy * ny;
      if (vn < 0) { hit = Math.max(hit, -vn); r.vx -= (1 + e) * vn * nx; r.vy -= (1 + e) * vn * ny; }
      r.resting = true;
    }
    if (report && hit > 12) this.events.push({ type: 'hit', ring: r, kind: 'wall', speed: hit });
  }

  private updateWin(dt: number): void {
    let ok = this.rings.length > 0;
    for (const r of this.rings) {
      if (!this.ringScores(r) || !r.resting || Math.abs(r.vy) > 4) { ok = false; break; }
    }
    this.winTimer = ok ? this.winTimer + dt : 0;
  }
}
