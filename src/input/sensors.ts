import type { InputListener, InputMessage, InputSource, Vec2 } from './actions';

/**
 * Motion sensors → screen-space gravity direction (+y = down the screen).
 *
 * - DeviceMotionEvent.accelerationIncludingGravity is the primary source;
 *   DeviceOrientationEvent (beta/gamma) is the fallback when motion gives no data.
 * - Accounts for screen orientation (screen.orientation.angle / window.orientation).
 * - iOS needs DeviceMotionEvent.requestPermission() from a user gesture: call
 *   `requestPermission()` from your "tap to start" handler. Denied → getGravity() stays
 *   null, and the game falls back to straight-down gravity.
 * - Low-pass filtered, with a dead zone, a sensitivity multiplier and a clamp.
 * - recenter(): the current hold angle becomes "level" (people hold phones tilted).
 * - Shakes (acceleration spikes) are emitted as { type: 'shake' }.
 */

export type MotionPermission = 'granted' | 'denied' | 'unsupported';

export interface MotionSourceOptions {
  /** 1 = natural; >1 exaggerates tilt. */
  sensitivity?: number;
  /** Ignore tilts smaller than this (radians). */
  deadZone?: number;
  /** Max tilt angle reported (radians). The world clamps again with tiltMaxInfluence. */
  maxAngle?: number;
  /** Low-pass factor per event (0-1, lower = smoother). */
  smoothing?: number;
  /** Net acceleration (m/s², gravity removed) that counts as a shake. */
  shakeThreshold?: number;
  /** Seconds between shakes. */
  shakeCooldown?: number;
}

export interface MotionSource extends InputSource {
  requestPermission(): Promise<MotionPermission>;
  readonly permission: MotionPermission | 'unknown';
  /** True once real sensor data has arrived. */
  readonly active: boolean;
  setSensitivity(s: number): void;
}

/** iOS 13+ (and some newer Chromes) gate sensors behind requestPermission(). */
const needsPermission = () =>
  typeof DeviceMotionEvent !== 'undefined' &&
  typeof (DeviceMotionEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function';

/** iOS/iPadOS Safari reports accelerationIncludingGravity with the opposite sign to Android. */
const isAppleTouch = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

function screenAngle(): number {
  const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
  if (so && typeof so.angle === 'number') return (so.angle * Math.PI) / 180;
  const wo = (window as unknown as { orientation?: number }).orientation;
  return typeof wo === 'number' ? (wo * Math.PI) / 180 : 0;
}

export function createMotionSource(opts: MotionSourceOptions = {}): MotionSource {
  let sensitivity = opts.sensitivity ?? 1;
  const deadZone = opts.deadZone ?? 0.05;
  const maxAngle = opts.maxAngle ?? 1.1;
  const smoothing = opts.smoothing ?? 0.18;
  const shakeThreshold = opts.shakeThreshold ?? 13;
  const shakeCooldown = opts.shakeCooldown ?? 0.45;

  const listeners = new Set<InputListener>();
  const emit = (m: InputMessage) => { for (const l of listeners) l(m); };

  let permission: MotionPermission | 'unknown' = 'unknown';
  let active = false;
  let attached = false;
  // filtered screen-space gravity (unnormalised, m/s²)
  let fx = 0, fy = 9.8;
  let haveMotion = false;
  let neutral = 0; // recentred angle offset
  let lastShake = 0;
  const gated = needsPermission();
  // Axis sign: platform default, then confirmed from the first readings (people start
  // with the phone upright, so gravity should point down the screen).
  let sign = isAppleTouch() ? -1 : 1;
  let signVotes = 0, signLocked = false;

  /** device-frame (x right, y up) reaction acceleration → screen gravity, then rotate for orientation. */
  const feed = (sx: number, sy: number) => {
    const a = screenAngle();
    // rotate by the screen angle so "down" stays down when the UI rotates
    const c = Math.cos(a), s = Math.sin(a);
    const rx = sx * c - sy * s, ry = sx * s + sy * c;
    if (!active) { fx = rx; fy = ry; }
    fx += (rx - fx) * smoothing;
    fy += (ry - fy) * smoothing;
    active = true;
  };

  const onMotion = (e: DeviceMotionEvent) => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null || g.y == null) return;
    haveMotion = true;
    if (!signLocked && Math.abs(g.y) > 4) {
      signVotes += Math.sign(g.y * sign);
      if (signVotes <= -6) { sign = -sign; signVotes = 0; active = false; }
      if (Math.abs(signVotes) >= 6 || signVotes >= 6) signLocked = true;
    }
    const ax = g.x * sign, ay = g.y * sign, az = (g.z ?? 0) * sign;
    // Reaction acceleration points up; gravity points the other way. Screen x = device x, screen y = -device y.
    feed(-ax, ay);

    // Shake: net acceleration without gravity.
    const now = performance.now() / 1000;
    let net: number;
    const lin = e.acceleration;
    if (lin && lin.x != null && lin.y != null) net = Math.hypot(lin.x, lin.y, lin.z ?? 0);
    else net = Math.abs(Math.hypot(ax, ay, az) - 9.81);
    if (net > shakeThreshold && now - lastShake > shakeCooldown) {
      lastShake = now;
      emit({ type: 'shake', strength: Math.min(2, 0.6 + (net - shakeThreshold) / 10) });
    }
  };

  const onOrientation = (e: DeviceOrientationEvent) => {
    if (haveMotion || e.beta == null || e.gamma == null) return; // motion wins when present
    const b = (e.beta * Math.PI) / 180, gm = (e.gamma * Math.PI) / 180;
    feed(Math.sin(gm) * 9.8, Math.sin(b) * Math.cos(gm) * 9.8);
  };

  const attach = () => {
    if (attached || typeof window === 'undefined') return;
    attached = true;
    window.addEventListener('devicemotion', onMotion);
    window.addEventListener('deviceorientation', onOrientation);
  };

  // Browsers without a permission gate: start listening right away.
  if (!gated && typeof window !== 'undefined' && ('DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window)) attach();

  const rawAngle = () => Math.atan2(fx, fy); // 0 = straight down the screen

  return {
    get permission() { return permission; },
    get active() { return active; },
    setSensitivity(s: number) { sensitivity = s; },
    async requestPermission(): Promise<MotionPermission> {
      if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
        permission = 'unsupported';
        return permission;
      }
      if (!gated) { attach(); permission = 'granted'; return permission; }
      try {
        const DM = DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> };
        const res = await DM.requestPermission();
        const DO = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
        if (typeof DO.requestPermission === 'function') { try { await DO.requestPermission(); } catch { /* optional */ } }
        permission = res === 'granted' ? 'granted' : 'denied';
      } catch {
        permission = 'denied';
      }
      if (permission === 'granted') attach();
      return permission;
    },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
    getGravity(): Vec2 | null {
      if (!active) return null;
      const planar = Math.hypot(fx, fy);
      // Phone lying flat: the direction is noise. Blend toward straight down.
      const confidence = Math.min(1, Math.max(0, (planar - 1.5) / 3));
      let ang = rawAngle() - neutral;
      ang = Math.atan2(Math.sin(ang), Math.cos(ang)); // wrap
      const mag = Math.abs(ang);
      ang = mag < deadZone ? 0 : Math.sign(ang) * (mag - deadZone); // dead zone without a jump
      ang = Math.max(-maxAngle, Math.min(maxAngle, ang * sensitivity * confidence));
      return { x: Math.sin(ang), y: Math.cos(ang) };
    },
    recenter() { if (active) neutral = rawAngle(); },
    destroy() {
      window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('deviceorientation', onOrientation);
      listeners.clear();
    },
  };
}
