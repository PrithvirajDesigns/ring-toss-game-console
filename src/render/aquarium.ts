import type { FrameBuffer } from './framebuffer';
import { BAYER4, DETAIL as S, SCREEN_W, SCREEN_H } from './framebuffer';
import { P, LIGHTEN } from './palette';
import { blit, type Canvas8 } from './sprite';
import { buildFarReef, buildCoralBed, fog } from './art/reef';
import { fishSprites, type FishKind } from './art/fish';
import { causticFrames, CAUSTIC_SIZE, CAUSTIC_FRAMES } from './art/caustics';
import { drawStrand, type Strand } from './art/seaweed';
import { Rng } from '../physics/rng';
import type { World } from '../physics/world';

/**
 * The reef behind the play layer, back to front:
 *   water gradient → light rays → far reef (parallax 0.25) → dark kelp → coral bed
 *   (parallax 0.55) → caustics → fish → bright seaweed (parallax 0.9)
 * Parallax follows tilt, the far layers shimmer, and fish and weed react to the jet.
 * Everything is in screen pixels. Physics state is read, never written.
 */

interface Fish {
  kind: FishKind; x: number; y: number; vx: number; vy: number;
  dir: number; speed: number; phase: number; targetY: number; retarget: number;
  flee: number; orbit: number;
  /** school members follow a leader */
  leader?: Fish; offX: number; offY: number;
}

const BAYER = BAYER4;
const FAR_M = 10, BED_M = 16;

export class Aquarium {
  private water = new Uint8Array(SCREEN_W * SCREEN_H);
  private far: Canvas8;
  private bed: Canvas8;
  private farY: number;
  private bedY: number;
  private fish: Fish[] = [];
  private midWeed: Strand[] = [];
  private frontWeed: Strand[] = [];
  private t = 0;
  private parallax = 0;
  private celebrateT = 0;
  private rng: Rng;
  private L: number; private R: number; private T: number; private F: number;

  constructor(private world: World, seed = 5) {
    this.rng = new Rng(seed);
    const tk = world.tank;
    this.L = Math.round(tk.left * S); this.R = Math.round(tk.right * S);
    this.T = Math.round(tk.top * S); this.F = Math.round(tk.floor * S);
    this.buildWater();

    const farH = 120, bedH = 140;
    this.farY = this.F + 6 - farH;
    this.bedY = this.F + 12 - bedH;
    this.far = buildFarReef(this.R - this.L + FAR_M * 2, farH, seed + 1);
    fog(this.far, 0.25);
    const bedFloor = (lx: number) => {
      const sx = lx + this.L - BED_M;
      const wx = Math.min(tk.right, Math.max(tk.left, sx / S));
      return world.floorAt(wx) * S - this.bedY;
    };
    this.bed = buildCoralBed(this.R - this.L + BED_M * 2, bedH, bedFloor, seed + 2);
    fog(this.bed, 0.22);

    this.spawnWeed();
    this.spawnFish();
  }

  private buildWater(): void {
    const ramp = [P.SHALLOW, P.TEAL, P.BLUE, P.MID, P.DEEP];
    const top = this.T - 2 * S, bottom = this.F + 4 * S;
    this.water.fill(P.ABYSS);
    for (let y = top; y < bottom; y++) {
      const f = Math.max(0, Math.min(0.999, (y - this.T) / (bottom - this.T))) * (ramp.length - 1);
      const i = Math.floor(f), frac = f - i;
      const a = ramp[i], b = ramp[Math.min(ramp.length - 1, i + 1)];
      for (let x = this.L - 2 * S; x < this.R + 2 * S; x++) this.water[y * SCREEN_W + x] = BAYER[(y & 3) * 4 + (x & 3)] < frac * 16 ? b : a;
    }
  }

  private floorY(sx: number): number {
    const tk = this.world.tank;
    return this.world.floorAt(Math.min(tk.right, Math.max(tk.left, sx / S))) * S;
  }

  private spawnWeed(): void {
    const r = this.rng;
    const mk = (x: number, h: number, kind: Strand['kind'], dark: boolean): Strand => ({
      x, base: this.floorY(x) + 1, height: h, phase: r.range(0, 6.28), amp: kind === 'kelp' ? r.range(3, 6) : r.range(1, 2.5),
      width: kind === 'kelp' ? 2 : 1, kind, bend: 0, dark,
    });
    // dark kelp far back, spread across
    for (let x = this.L + 20; x < this.R - 10; x += r.range(28, 48)) this.midWeed.push(mk(x, r.range(50, 110), 'kelp', true));
    // bright weed hugging the side walls, plus grass tufts along the ledge
    for (const x of [this.L + 5, this.L + 12, this.L + 19, this.R - 8, this.R - 15, this.R - 24]) this.frontWeed.push(mk(x, r.range(45, 95), 'kelp', false));
    for (let x = this.L + 30; x < this.R - 30; x += r.range(14, 26)) {
      if (Math.abs(x - SCREEN_W / 2) < 22) continue; // keep the nozzle clear
      for (let k = 0; k < 3; k++) this.frontWeed.push(mk(x + k * 2 - 2, r.range(6, 14), 'grass', false));
    }
  }

  private spawnFish(): void {
    const r = this.rng;
    const mk = (kind: FishKind, speed: number): Fish => {
      const y = r.range(this.T + 30, this.F - 90);
      return { kind, x: r.range(this.L + 20, this.R - 40), y, vx: 0, vy: 0, dir: r.sign(), speed, phase: r.range(0, 4), targetY: y, retarget: r.range(2, 6), flee: 0, orbit: r.range(0, 6.28), offX: 0, offY: 0 };
    };
    const leader = mk('chromis', 16);
    leader.y = this.T + 40;
    this.fish.push(leader);
    for (let i = 0; i < 5; i++) {
      const f = mk('chromis', 16);
      f.leader = leader; f.offX = r.range(-22, 22); f.offY = r.range(-10, 10);
      f.x = leader.x + f.offX; f.y = leader.y + f.offY;
      this.fish.push(f);
    }
    this.fish.push(mk('angel', 11));
    this.fish.push(mk('tang', 14));
  }

  /** A burst started: fish near that nozzle bolt sideways. */
  onBurst(nozzleWorldX: number): void {
    const nx = nozzleWorldX * S;
    for (const f of this.fish) {
      const fx = f.x + fishSprites(f.kind).w / 2;
      if (Math.abs(fx - nx) < 110) { f.flee = 1; f.dir = fx < nx ? -1 : 1; f.vy += this.rng.range(-20, 20); }
    }
  }

  celebrate(): void { this.celebrateT = 3.5; }

  update(dt: number): void {
    this.t += dt;
    this.parallax += (-this.world.gdx - this.parallax) * Math.min(1, dt * 3);
    if (this.celebrateT > 0) this.celebrateT -= dt;
    const flow = { u: 0, v: 0 };
    const r = this.rng;

    for (const f of this.fish) {
      const spr = fishSprites(f.kind);
      const cx = f.x + spr.w / 2, cy = f.y + spr.h / 2;
      // feel the water: strong flow nearby = startle
      this.world.fluid.sample(cx / S, cy / S, flow);
      const fs = Math.hypot(flow.u, flow.v);
      if (fs > 30 && f.flee < 0.5) { f.flee = 1; let near = this.world.fluid.nozzles[0]?.x ?? 80; for (const n of this.world.fluid.nozzles) if (Math.abs(n.x * S - cx) < Math.abs(near * S - cx)) near = n.x; f.dir = cx < near * S ? -1 : 1; }
      f.flee *= Math.exp(-1.4 * dt);

      if (this.celebrateT > 0) {
        // victory swirl around the middle of the tank
        f.orbit += dt * (1.6 + (f.kind === 'chromis' ? 0.6 : 0));
        const rad = f.kind === 'chromis' ? 50 : f.kind === 'angel' ? 72 : 90;
        const tx = SCREEN_W / 2 + Math.cos(f.orbit) * rad - spr.w / 2, ty = (this.T + this.F) / 2 - 20 + Math.sin(f.orbit) * rad * 0.45;
        f.vx += ((tx - f.x) * 4 - f.vx) * Math.min(1, dt * 4);
        f.vy += ((ty - f.y) * 4 - f.vy) * Math.min(1, dt * 4);
        if (Math.abs(f.vx) > 4) f.dir = Math.sign(f.vx);
      } else if (f.leader) {
        const L = f.leader;
        const tx = L.x + f.offX * L.dir + Math.sin(this.t * 1.3 + f.offY) * 3, ty = L.y + f.offY + Math.sin(this.t * 2 + f.offX) * 2;
        f.vx += ((tx - f.x) * 2.5 - f.vx) * Math.min(1, dt * 3);
        f.vy += ((ty - f.y) * 2.5 - f.vy) * Math.min(1, dt * 3);
        f.dir = L.dir;
      } else {
        f.retarget -= dt;
        if (f.retarget <= 0) { f.retarget = r.range(3, 7); f.targetY = r.range(this.T + 26, this.F - 80); if (r.next() < 0.25) f.dir = -f.dir; }
        const want = f.dir * f.speed * (1 + f.flee * 4);
        f.vx += (want - f.vx) * Math.min(1, dt * (1.5 + f.flee * 6));
        f.vy += ((f.targetY - f.y) * 0.6 - f.vy) * Math.min(1, dt * 1.5);
        // turn at the glass
        if (f.x < this.L + 4 && f.dir < 0) f.dir = 1;
        if (f.x + spr.w > this.R - 4 && f.dir > 0) f.dir = -1;
      }
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.x = Math.max(this.L - 4, Math.min(this.R - spr.w + 4, f.x));
      f.y = Math.max(this.T + 6, Math.min(this.F - 50, f.y));
      f.phase += dt * (5 + Math.abs(f.vx) * 0.25);
    }

    // seaweed leans with the water at its tip
    for (const s of [...this.midWeed, ...this.frontWeed]) {
      if (s.kind === 'grass') continue;
      this.world.fluid.sample(s.x / S, (s.base - s.height) / S, flow);
      const target = Math.max(-16, Math.min(16, flow.u * 0.18));
      s.bend += (target - s.bend) * Math.min(1, dt * 2.5);
    }
  }

  /** Everything behind the rings. */
  drawBack(fb: FrameBuffer): void {
    const t = this.t;
    fb.px.set(this.water);
    this.drawRays(fb);
    // gentle water shimmer: rows of the far layers wobble by a pixel
    const shimmer = (y: number) => Math.round(Math.sin(y * 0.11 + t * 1.7) * 0.6);
    const clip = { x0: this.L - 2 * S, y0: this.T - 2 * S, x1: this.R + 2 * S, y1: this.F + 4 * S };
    blit(fb, this.far, this.L - FAR_M + Math.round(this.parallax * 4), this.farY, false, undefined, shimmer, clip);
    for (const s of this.midWeed) drawStrand(fb, s, t, Math.round(this.parallax * 6));
    blit(fb, this.bed, this.L - BED_M + Math.round(this.parallax * 9), this.bedY, false, undefined, (y) => (y < this.F - 40 ? shimmer(y) : 0), clip);
    this.drawCaustics(fb);
    // fish: the school first (farthest), then the big two
    for (const f of this.fish) {
      const spr = fishSprites(f.kind);
      blit(fb, spr.frames[Math.floor(f.phase) & 3], f.x + this.parallax * 12, f.y, f.dir < 0);
    }
    for (const s of this.frontWeed) drawStrand(fb, s, t, Math.round(this.parallax * 14));
  }

  private drawRays(fb: FrameBuffer): void {
    const t = this.t, T = this.T, F = this.F;
    const depth = (F - T) * 0.85;
    for (let k = 0; k < 3; k++) {
      const cx0 = this.L + (k + 0.7) * ((this.R - this.L) / 3.2) + Math.sin(t * 0.13 + k * 2.1) * 24;
      for (let y = T; y < T + depth; y++) {
        const d = (y - T) / depth;
        const cx = cx0 + (y - T) * 0.32, hw = 9 + (y - T) * 0.06 + k * 2;
        const x0 = Math.max(this.L, Math.floor(cx - hw)), x1 = Math.min(this.R - 1, Math.ceil(cx + hw));
        for (let x = x0; x <= x1; x++) {
          const a = (1 - Math.abs(x - cx) / hw) * (1 - d) * 0.32;
          if (BAYER[(y & 3) * 4 + (x & 3)] < a * 16) fb.remap(x, y, LIGHTEN);
        }
      }
    }
  }

  private drawCaustics(fb: FrameBuffer): void {
    const frames = causticFrames();
    const m = frames[Math.floor(this.t * 7.5) % CAUSTIC_FRAMES]; // a new frame every ~8 display frames
    const N = CAUSTIC_SIZE, T = this.T, F = this.F;
    const ox = Math.floor(this.t * 3), oy = Math.floor(this.t * 1.2);
    const W = fb.w, px = fb.px;
    for (let y = T; y < F; y++) {
      const w = 1 - ((y - T) / (F - T)) * 1.15;
      if (w <= 0) break;
      const hiT = w * 11, loT = w * 3;
      const row = ((y + oy) & (N - 1)) * N, brow = (y & 3) * 4;
      for (let x = this.L; x < this.R; x++) {
        const v = m[row + ((x + ox) & (N - 1))];
        if (v === 0) continue;
        const th = BAYER[brow + (x & 3)];
        if ((v === 2 && th < hiT) || (v === 1 && th < loT)) { const i = y * W + x; px[i] = LIGHTEN[px[i]]; }
      }
    }
  }
}
