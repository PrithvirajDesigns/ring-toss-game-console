import { Canvas8, CLEAR } from '../sprite';
import { P, DARKEN } from '../palette';
import { BAYER4 } from '../framebuffer';
import { Rng } from '../../physics/rng';

/**
 * Procedural reef layers, generated once from a seed. Each function draws one kind of
 * coral into its own canvas, lights it from the upper left, then composites it, so any
 * piece can be tweaked in isolation.
 */

/** Distant reef: low-contrast silhouette with a lit rim, fogged into the water colour. */
export function buildFarReef(w: number, h: number, seed = 11): Canvas8 {
  const c = new Canvas8(w, h), r = new Rng(seed);
  const ph = [r.range(0, 6), r.range(0, 6), r.range(0, 6)];
  const top = (x: number) => h * 0.45 + Math.sin(x * 0.021 + ph[0]) * 14 + Math.sin(x * 0.067 + ph[1]) * 6 + Math.sin(x * 0.19 + ph[2]) * 2;
  for (let x = 0; x < w; x++) {
    const t = Math.round(top(x));
    for (let y = t; y < h; y++) c.set(x, y, BAYER4[(y & 3) * 4 + (x & 3)] < 4 ? P.DEEP : P.MID);
  }
  // a few silhouetted coral trees and fans standing on the ridge
  for (let k = 0; k < 7; k++) {
    const x = r.range(10, w - 10), y = top(x) + 2;
    if (r.next() < 0.5) {
      const branch = (bx: number, by: number, len: number, a: number, d: number) => {
        const ex = bx + Math.sin(a) * len, ey = by - Math.cos(a) * len;
        c.stroke(bx, by, ex, ey, d > 1 ? 1 : 0.5, P.MID);
        if (d > 0) { branch(ex, ey, len * 0.72, a - r.range(0.3, 0.6), d - 1); branch(ex, ey, len * 0.72, a + r.range(0.3, 0.6), d - 1); }
      };
      branch(x, y, r.range(7, 12), r.range(-0.2, 0.2), 3);
    } else {
      const R = r.range(10, 18);
      for (let a = -1.1; a <= 1.1; a += 0.22) c.stroke(x, y, x + Math.sin(a) * R, y - Math.cos(a) * R, 0.5, P.MID);
      for (let rr = 4; rr < R; rr += 4) for (let a = -1.1; a <= 1.1; a += 0.04) c.set(x + Math.sin(a) * rr, y - Math.cos(a) * rr, P.MID);
    }
  }
  // lit rim along the top edge
  for (let x = 0; x < w; x++) for (let y = 1; y < h; y++) if (c.filled(x, y) && !c.filled(x, y - 1)) { c.set(x, y, P.BLUE); break; }
  return c;
}

const ORANGE_TUBE = { base: P.ORANGE, hi: P.YELLOW, shade: P.DORANGE };

function branchCoral(c: Canvas8, r: Rng, x: number, y: number, size: number, col: { base: number; hi: number; shade: number; tip: number }): void {
  const tmp = new Canvas8(c.w, c.h);
  const branch = (bx: number, by: number, len: number, a: number, d: number, th: number) => {
    const ex = bx + Math.sin(a) * len, ey = by - Math.cos(a) * len;
    tmp.stroke(bx, by, ex, ey, th, col.base);
    if (d > 0) {
      const n = r.next() < 0.3 ? 3 : 2;
      for (let i = 0; i < n; i++) branch(ex, ey, len * r.range(0.62, 0.82), a + (i - (n - 1) / 2) * r.range(0.45, 0.75), d - 1, Math.max(0.9, th * 0.78));
    } else {
      tmp.ellipse(ex, ey, th + 0.6, th + 0.6, col.base);
    }
  };
  branch(x, y, size, r.range(-0.15, 0.15), 3, 2.2);
  tmp.shade(col.base, col.hi, col.shade);
  // pale polyp tips
  for (let yy = 1; yy < tmp.h; yy++) for (let xx = 0; xx < tmp.w; xx++)
    if (tmp.filled(xx, yy) && !tmp.filled(xx, yy - 1) && !tmp.filled(xx, yy - 2) && r.next() < 0.5) tmp.set(xx, yy, col.tip);
  c.draw(tmp, 0, 0);
}

function brainCoral(c: Canvas8, r: Rng, x: number, y: number, rx: number, ry: number): void {
  const tmp = new Canvas8(c.w, c.h);
  const ph = r.range(0, 6);
  tmp.ellipse(x, y, rx, ry, (px, py) => {
    if (py > y + 1) return CLEAR; // dome: top half only (plus a lip)
    const g = Math.sin(px * 0.55 + Math.sin(py * 0.45 + ph) * 2.4 + py * 0.2);
    return g > 0.72 ? P.MAGENTA : P.PURPLE;
  });
  tmp.shade(P.PURPLE, P.PINK, P.MAGENTA);
  c.draw(tmp, 0, 0);
}

function seaFan(c: Canvas8, r: Rng, x: number, y: number, R: number, base: number, hi: number): void {
  const tmp = new Canvas8(c.w, c.h);
  const spread = r.range(0.8, 1.15), tilt = r.range(-0.2, 0.2);
  // radiating ribs
  for (let a = -spread; a <= spread + 1e-6; a += spread / 6) {
    const len = R * r.range(0.82, 1);
    const ex = x + Math.sin(a + tilt) * len, ey = y - Math.cos(a + tilt) * len;
    tmp.stroke(x, y, (x + ex) / 2 + r.range(-1, 1), (y + ey) / 2, 0.5, base);
    tmp.stroke((x + ex) / 2, (y + ey) / 2, ex, ey, 0.5, base);
  }
  // cross lattice arcs
  for (let rr = 5; rr < R; rr += r.range(3.2, 4.4))
    for (let a = -spread; a <= spread; a += 0.5 / rr) tmp.set(x + Math.sin(a + tilt) * rr, y - Math.cos(a + tilt) * rr, base);
  // highlight the upper-left side of the lattice
  for (let yy = 0; yy < tmp.h; yy++) for (let xx = 0; xx < tmp.w; xx++)
    if (tmp.get(xx, yy) === base && xx < x + (y - yy) * Math.sin(tilt) - 2 && (xx + yy) % 3 === 0) tmp.set(xx, yy, hi);
  // stem
  tmp.stroke(x, y + 3, x, y - 2, 1, P.DORANGE);
  c.draw(tmp, 0, 0);
}

function tubeSponge(c: Canvas8, r: Rng, x: number, y: number, n: number): void {
  const tmp = new Canvas8(c.w, c.h);
  const tops: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const tw = r.range(2.5, 3.6), th = r.range(12, 26), tx = x + (i - (n - 1) / 2) * 7 + r.range(-1, 1);
    const lean = r.range(-0.15, 0.15);
    for (let k = 0; k <= th; k++) tmp.ellipse(tx + lean * k, y - k, tw, 1.2, ORANGE_TUBE.base);
    tops.push([tx + lean * th, y - th, tw]);
  }
  tmp.shade(ORANGE_TUBE.base, ORANGE_TUBE.hi, ORANGE_TUBE.shade);
  for (const [tx, ty, tw] of tops) { tmp.ellipse(tx, ty, tw, 1.6, P.YELLOW); tmp.ellipse(tx, ty + 0.3, tw - 1.2, 0.9, P.BROWN); }
  c.draw(tmp, 0, 0);
}

function rock(c: Canvas8, r: Rng, x: number, y: number, rx: number, ry: number): void {
  const tmp = new Canvas8(c.w, c.h);
  tmp.ellipse(x, y, rx, ry, (px, py) => (BAYER4[(py & 3) * 4 + (px & 3)] < 3 ? P.PLASTIC_SH : P.SLATE));
  tmp.ellipse(x + rx * 0.35, y - ry * 0.2, rx * 0.6, ry * 0.7, P.SLATE);
  tmp.shade(P.SLATE, P.PLASTIC_SH, P.INK);
  // speckles of encrusting algae
  for (let i = 0; i < rx * 2; i++) { const px = x + r.range(-rx, rx) * 0.8, py = y - r.range(0, ry) * 0.9; if (tmp.filled(Math.round(px), Math.round(py))) tmp.set(px, py, r.next() < 0.5 ? P.SEAGREEN : P.MAGENTA); }
  c.draw(tmp, 0, 0);
}

function anemone(c: Canvas8, r: Rng, x: number, y: number): void {
  const tmp = new Canvas8(c.w, c.h);
  for (let a = -1.2; a <= 1.2; a += 0.2) {
    const len = r.range(5, 9);
    const ex = x + Math.sin(a) * len, ey = y - Math.cos(a) * len * 0.9;
    tmp.stroke(x, y, ex, ey, 0.5, P.PINK);
    tmp.set(ex, ey, P.WHITE);
  }
  tmp.ellipse(x, y + 1, 3, 1.6, P.MAGENTA);
  c.draw(tmp, 0, 0);
}

function starfish(c: Canvas8, x: number, y: number, R: number): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? R * 0.42 : R;
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8]);
  }
  const tmp = new Canvas8(c.w, c.h);
  tmp.poly(pts, P.DORANGE);
  tmp.shade(P.DORANGE, P.ORANGE, P.BROWN);
  tmp.set(x, y, P.YELLOW);
  c.draw(tmp, 0, 0);
}

/**
 * Mid-ground coral bed. `floorAt(x)` (layer x → layer y) is where the tank ledge is, so
 * the bed hugs the V-shaped floor and the pieces stand where they'd be visible.
 */
export function buildCoralBed(w: number, h: number, floorAt: (x: number) => number, seed = 23): Canvas8 {
  const c = new Canvas8(w, h), r = new Rng(seed);
  const pink = { base: P.PINK, hi: P.WHITE, shade: P.MAGENTA, tip: P.WHITE };
  const red = { base: P.CORAL, hi: P.PINK, shade: 25 /* ring-red shade doubles as deep coral red */, tip: P.PINK };
  const purple = { base: P.MAGENTA, hi: P.PINK, shade: P.PURPLE, tip: P.PINK };

  // back row: sea fans and tall branching coral, standing on a low rubble ridge
  const ridge = (x: number) => floorAt(x) - 7 - Math.sin(x * 0.09) * 3 - Math.sin(x * 0.23 + 1) * 2;
  const fanCols = [[P.CORAL, P.PINK], [P.MAGENTA, P.PINK], [P.PURPLE, P.MAGENTA]] as const;
  for (let x = 8; x < w - 6; x += r.range(22, 34)) {
    const [b, hi] = fanCols[(r.next() * 3) | 0];
    seaFan(c, r, x, ridge(x), r.range(18, 34), b, hi);
  }
  for (let x = 18; x < w - 6; x += r.range(26, 40)) branchCoral(c, r, x, ridge(x) + 2, r.range(8, 14), r.next() < 0.5 ? pink : purple);
  // rubble base: rocks and old coral fill the ground so nothing floats
  for (let x = 0; x < w; x++) {
    const top = Math.round(ridge(x));
    for (let y = top; y < h; y++) {
      if (c.filled(x, y)) continue;
      const b = BAYER4[(y & 3) * 4 + (x & 3)];
      const n = Math.sin(x * 0.7 + y * 1.3) + Math.sin(x * 0.31 - y * 0.9);
      c.set(x, y, y === top ? P.PLASTIC_SH : n > 1.55 ? P.SEAGREEN : n < -1.7 ? P.PURPLE : b < 6 ? P.INK : P.SLATE);
    }
  }
  // middle row: brain corals, sponges, rocks
  for (let x = 4; x < w; x += r.range(16, 26)) {
    const k = r.next();
    const g = ridge(x) + 4;
    if (k < 0.32) brainCoral(c, r, x, g, r.range(7, 12), r.range(5, 8));
    else if (k < 0.55) tubeSponge(c, r, x, g + 1, 2 + ((r.next() * 2) | 0));
    else if (k < 0.78) rock(c, r, x, g + 2, r.range(7, 12), r.range(4, 7));
    else branchCoral(c, r, x, g, r.range(6, 9), red);
  }
  // front details
  for (let x = 14; x < w; x += r.range(34, 60)) anemone(c, r, x, ridge(x) + 5);
  starfish(c, w * 0.16, ridge(w * 0.16) + 3, 5);
  starfish(c, w * 0.83, ridge(w * 0.83) + 2, 4);
  return c;
}

/** Light depth fog: darken a dithered share of a layer's pixels in place. */
export function fog(c: Canvas8, amount: number): void {
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const i = y * c.w + x;
    if (c.px[i] !== CLEAR && BAYER4[(y & 3) * 4 + (x & 3)] < amount * 16) c.px[i] = DARKEN[c.px[i]];
  }
}
