// Headless physics checks. Run: npm run test:sim
import { World } from '../src/physics/world';
import { DEFAULT_PHYSICS } from '../src/physics/config';
import { CLASSIC, CHALLENGE } from '../src/levels/index';

const DT = 1 / 120;
let failures = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) failures++;
};
const cfg = () => ({ ...DEFAULT_PHYSICS, ambientStrength: 0 });
const run = (w: World, s: number, each?: (t: number) => void) => { for (let i = 0; i < s / DT; i++) { each?.(i * DT); w.step(DT); } };

// 1. Terminal sink speed in still water
{
  const w = new World(cfg(), { ...CLASSIC, rings: ['red'] }, 1);
  const r = w.rings[0]; r.x = 30; r.y = 20; r.vx = r.vy = 0;
  run(w, 2);
  const terminal = DEFAULT_PHYSICS.gravity / DEFAULT_PHYSICS.linearDrag;
  check('sink speed ≈ gravity/drag (floaty)', Math.abs(r.vy - terminal) < 3, `vy=${r.vy.toFixed(1)} px/s, target ${terminal.toFixed(1)}; tank height ~108 px → ~${(108 / r.vy).toFixed(1)} s to fall`);
}

// 2. Aligned ring dropped onto peg threads and lands on the flange
{
  const w = new World(cfg(), { ...CLASSIC, rings: ['red'] }, 2);
  const r = w.rings[0], peg = w.pegs[0];
  r.x = peg.x + 1; r.y = peg.tipY - 15; r.tilt = 1.2; r.spin = 0; r.vx = 0; r.vy = 0;
  const ev: string[] = [];
  run(w, 4, () => { for (const e of w.events) ev.push(e.type); w.events.length = 0; });
  check('aligned ring threads', r.state === 'threaded', `events: ${ev.join(',')}`);
  check('lands on flange', Math.abs(r.y - (peg.baseY - 1)) < 0.6 && r.resting, `y=${r.y.toFixed(2)}`);
  check('land event fired', ev.includes('land'));
}

// 3. Face-on ring dropped onto peg tip deflects and does not thread
{
  const w = new World({ ...cfg(), faceOnRestore: 6 }, { ...CLASSIC, rings: ['red'] }, 3);
  const r = w.rings[0], peg = w.pegs[0];
  r.x = peg.x + 0.5; r.y = peg.tipY - 15; r.tilt = 0; r.vx = 0; r.vy = 0;
  run(w, 5);
  check('face-on ring deflects off tip', r.state === 'free' && Math.abs(r.x - peg.x) >= DEFAULT_PHYSICS.ringOuterRadius * 0.9, `x off by ${(r.x - peg.x).toFixed(1)}, y=${r.y.toFixed(1)}`);
}

// 4. Stacking: three rings on one peg
{
  const w = new World({ ...cfg(), faceOnRestore: 0 }, { ...CLASSIC, rings: ['red', 'blue', 'green'] }, 4);
  const peg = w.pegs[1];
  w.rings.forEach((r, i) => { r.x = peg.x; r.y = peg.tipY - 10 - i * 14; r.tilt = 1.25; r.vx = r.vy = 0; });
  run(w, 8);
  const ys = w.rings.map((r) => r.y).sort((a, b) => b - a);
  const gaps = [ys[0] - ys[1], ys[1] - ys[2]];
  check('three rings stack on peg', w.rings.every((r) => r.state === 'threaded'), `states ${w.rings.map((r) => r.state)}`);
  check('stack spacing', gaps.every((g) => Math.abs(g - DEFAULT_PHYSICS.stackSpacing) < 0.2), `gaps ${gaps.map((g) => g.toFixed(2))}`);
}

// 4b. Knock-off: a quick tap leaves threaded rings alone, a long hard burst can lift them off
{
  const knocked = (hold: number) => {
    let total = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const w = new World(DEFAULT_PHYSICS, { ...CLASSIC, rings: ['red', 'blue', 'green', 'yellow'] }, 40 + seed);
      w.rings.forEach((r, i) => { const peg = w.pegs[i % 2]; r.state = 'threaded'; r.peg = i % 2; r.x = peg.x; r.y = peg.baseY - 1 - Math.floor(i / 2) * 3; r.tilt = 0.95; });
      run(w, 1);
      for (let i = 0; i < 4 / DT; i++) { const t = i * DT; if (i === 0) w.press(0); if (Math.abs(t - hold) < DT / 2) w.release(0); w.step(DT); }
      total += w.rings.filter((r) => r.state === 'free').length;
    }
    return total;
  };
  const tap = knocked(0.05), full = knocked(0.9);
  check('tap never knocks rings off', tap === 0, `${tap}/20 off`);
  console.log(`INFO  full 0.9 s burst knocked ${full}/20 settled rings off (5 trials); freshly threaded rings near the tip are easier to blast off (see bot stats). Tune with threadedFlowCoupling.`);
}

// 5. Burst strength: tap vs hold
for (const hold of [0.05, 0.3, 0.9]) {
  const w = new World(DEFAULT_PHYSICS, CLASSIC, 5);
  run(w, 3); // settle on the floor
  let minY = 999, maxV = 0;
  const startY = w.rings.map((r) => r.y), best = startY.slice();
  run(w, 3, (t) => {
    w.rings.forEach((r, i) => (best[i] = Math.min(best[i], r.y)));
    if (t === 0) w.press(0);
    if (Math.abs(t - hold) < DT / 2) w.release(0);
    for (const r of w.rings) { minY = Math.min(minY, r.y); maxV = Math.max(maxV, Math.hypot(r.vx, r.vy)); }
  });
  const liftedCount = best.filter((b, i) => startY[i] - b > 15).length;
  console.log(`INFO  hold ${hold}s → highest ring y=${minY.toFixed(1)} (top=${w.tank.top}), max speed ${maxV.toFixed(0)} px/s, rings lifted >15px: ${liftedCount}/${w.rings.length}`);
}

// 6. Stability under random mashing + random tilt
{
  const w = new World(DEFAULT_PHYSICS, CLASSIC, 6);
  let bad = 0, next = 0.5, releaseAt = -1;
  run(w, 600, (t) => {
    if (t >= next) { w.press(0); releaseAt = t + w.rng.range(0.04, 0.9); next = t + w.rng.range(0.3, 2.5); }
    if (releaseAt > 0 && t >= releaseAt) { w.release(0); releaseAt = -1; }
    w.setGravity({ x: Math.sin(t * 0.31) * 1.5, y: Math.cos(t * 0.17) });
    if (Math.floor(t * 120) % 1200 === 0) w.shake(1.5);
    w.events.length = 0;
    for (const r of w.rings) {
      if (!Number.isFinite(r.x + r.y + r.vx + r.vy + r.tilt)) bad++;
      if (r.x < w.tank.left - 1 || r.x > w.tank.right + 1 || r.y < w.tank.top - 1 || r.y > w.tank.floor + 1) bad++;
    }
  });
  check('random mashing + tilt + shakes stays finite and inside the tank', bad === 0, `${bad} bad samples`);
}

// 6b. Playability: a crude "aim the highest ring at the nearest peg" bot
{
  const results: string[] = [];
  let totalOn = 0, wins = 0, offs = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const w = new World(DEFAULT_PHYSICS, CLASSIC, seed);
    let next = 1, rel = -1, winAt = -1;
    for (let i = 0; i < 300 / DT; i++) {
      const t = i * DT;
      const free = w.rings.filter((r) => r.state === 'free');
      if (t >= next && free.length && free.every((r) => r.y > 85)) { w.press(0); rel = t + 0.25 + 0.25 * w.rng.next(); next = t + 1.5; }
      if (rel > 0 && t >= rel) { w.release(0); rel = -1; }
      const hi = free.slice().sort((a, b) => a.y - b.y)[0];
      let gx = 0;
      if (hi && hi.y < 90) {
        const peg = w.pegs.slice().sort((a, b) => Math.abs(a.x - hi.x) - Math.abs(b.x - hi.x))[0];
        gx = Math.max(-1, Math.min(1, (peg.x - hi.x) * 0.08 - hi.vx * 0.05));
      }
      w.setGravity({ x: gx, y: 1 });
      w.step(DT);
      for (const e of w.events) if (e.type === 'unthread') offs++;
      w.events.length = 0;
      if (w.isWon) { winAt = t; break; }
    }
    totalOn += w.threadedCount;
    if (winAt >= 0) wins++;
    results.push(winAt >= 0 ? `win@${winAt.toFixed(0)}s` : `${w.threadedCount}/10`);
  }
  check('aiming bot threads most rings within 5 min', totalOn >= 40, `${results.join(' ')}; ${wins} full clears, ${offs} knocked off`);
}

// 6c. Every challenge level is buildable: pegs clear the floor, enough room on pegs, colours covered
{
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const lvl of CHALLENGE) {
    if (ids.has(lvl.id)) problems.push(`duplicate id ${lvl.id}`);
    ids.add(lvl.id);
    const w = new World(DEFAULT_PHYSICS, lvl, 1);
    for (const p of w.pegs) {
      if (p.baseY + 8 > w.floorAt(p.x)) problems.push(`${lvl.id}: peg at ${p.x} too close to the floor`);
      if (p.x - 7 < w.tank.left || p.x + 7 > w.tank.right) problems.push(`${lvl.id}: peg at ${p.x} too close to a wall`);
    }
    const coloured = w.pegs.filter((p) => p.color), plain = w.pegs.filter((p) => !p.color);
    for (const c of new Set(lvl.rings)) if (coloured.length && !plain.length && !coloured.some((p) => p.color === c)) problems.push(`${lvl.id}: no peg for ${c} rings`);
    const cap = w.pegs.reduce((a, p) => a + Math.floor((p.baseY - p.tipY) / DEFAULT_PHYSICS.stackSpacing), 0);
    if (cap < lvl.rings.length) problems.push(`${lvl.id}: pegs hold ${cap} < ${lvl.rings.length} rings`);
    run(w, 2);
    if (w.rings.some((r) => !Number.isFinite(r.x + r.y))) problems.push(`${lvl.id}: unstable at spawn`);
  }
  check(`all ${CHALLENGE.length} challenge levels are valid`, problems.length === 0, problems.join('; '));
}

// 7. Perf: steps per ms
{
  const w = new World(DEFAULT_PHYSICS, { ...CLASSIC }, 7);
  w.press(0);
  const t0 = performance.now();
  run(w, 10);
  const ms = performance.now() - t0;
  console.log(`INFO  1200 steps in ${ms.toFixed(0)} ms → ${(ms / 1200 * 1000).toFixed(1)} µs/step (budget at 120 Hz: ~2000 µs/step on a phone is fine)`);
}

console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
(globalThis as unknown as { process: { exit(c: number): void } }).process.exit(failures ? 1 : 0);
