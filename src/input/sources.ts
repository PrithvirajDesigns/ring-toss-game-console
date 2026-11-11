import type { Action, InputListener, InputMessage, InputSource, Vec2 } from './actions';

/** Fan-out helper shared by the sources. */
class Emitter {
  private ls = new Set<InputListener>();
  subscribe(l: InputListener): () => void { this.ls.add(l); return () => this.ls.delete(l); }
  emit(m: InputMessage): void { for (const l of this.ls) l(m); }
}

export interface KeyboardSourceOptions {
  target?: Window;
  /** Element whose mouse position simulates tilt when mouse-tilt is on (toggle with M). */
  tiltElement?: HTMLElement;
}

/**
 * Desktop testing: Space/Z = PUMP_A, X = PUMP_B, Enter = START, Shift/Backspace = SELECT,
 * R = RECENTER, arrows = D-pad actions + tilt, M = toggle mouse-position tilt, K = shake.
 */
export function createKeyboardSource(opts: KeyboardSourceOptions = {}): InputSource {
  const target = opts.target ?? window;
  const em = new Emitter();
  const keymap: Record<string, Action> = {
    Space: 'PUMP_A', KeyZ: 'PUMP_A', KeyX: 'PUMP_B', Enter: 'START',
    ShiftLeft: 'SELECT', ShiftRight: 'SELECT', Backspace: 'SELECT', KeyR: 'RECENTER',
  };
  const arrows = { left: false, right: false, up: false, down: false };
  let tilt: Vec2 = { x: 0, y: 1 };
  let mouseTilt = false;
  let mouseX = 0;
  let any = false;

  const dirs: Record<string, Action> = { ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN' };
  const onKey = (e: KeyboardEvent, down: boolean) => {
    if (dirs[e.code] && !e.repeat) em.emit({ type: 'action', action: dirs[e.code], down });
    if (e.code === 'ArrowLeft') arrows.left = down;
    else if (e.code === 'ArrowRight') arrows.right = down;
    else if (e.code === 'ArrowUp') arrows.up = down;
    else if (e.code === 'ArrowDown') arrows.down = down;
    else if (e.code === 'KeyM' && down && !e.repeat) mouseTilt = !mouseTilt;
    else if (e.code === 'KeyK' && down && !e.repeat) em.emit({ type: 'shake', strength: 1 });
    else {
      const a = keymap[e.code];
      if (!a) return;
      if (!e.repeat) em.emit({ type: 'action', action: a, down });
    }
    any = true;
    e.preventDefault();
  };
  const kd = (e: KeyboardEvent) => onKey(e, true);
  const ku = (e: KeyboardEvent) => onKey(e, false);
  const mm = (e: MouseEvent) => {
    if (!opts.tiltElement) return;
    const r = opts.tiltElement.getBoundingClientRect();
    mouseX = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
  };
  const blur = () => { arrows.left = arrows.right = arrows.up = arrows.down = false; };
  target.addEventListener('keydown', kd);
  target.addEventListener('keyup', ku);
  target.addEventListener('mousemove', mm);
  target.addEventListener('blur', blur);

  return {
    subscribe: (l) => em.subscribe(l),
    getGravity() {
      let x = (arrows.right ? 1 : 0) - (arrows.left ? 1 : 0);
      let y = 1 + (arrows.down ? 0.3 : 0) - (arrows.up ? 0.5 : 0);
      if (mouseTilt) x = mouseX;
      // ease toward the target so keyboard tilt feels like a hand, not a switch
      tilt = { x: tilt.x + (x * 0.8 - tilt.x) * 0.15, y: tilt.y + (y - tilt.y) * 0.15 };
      return any || mouseTilt ? tilt : null;
    },
    destroy() {
      target.removeEventListener('keydown', kd);
      target.removeEventListener('keyup', ku);
      target.removeEventListener('mousemove', mm);
      target.removeEventListener('blur', blur);
    },
  };
}

/**
 * Binds an element as a button for one action using pointer events: fires on touch-down
 * and touch-up immediately (no click delay), and is multi-touch safe (tracks pointer ids,
 * so a second finger on another button doesn't release this one).
 */
export function createPointerButtonSource(el: HTMLElement, action: Action): InputSource {
  const em = new Emitter();
  const active = new Set<number>();
  const set = (down: boolean) => {
    el.classList.toggle('down', down);
    em.emit({ type: 'action', action, down });
  };
  const pd = (e: PointerEvent) => {
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { /* not supported: fine */ }
    const was = active.size > 0;
    active.add(e.pointerId);
    if (!was) set(true);
  };
  const pu = (e: PointerEvent) => {
    if (!active.delete(e.pointerId)) return;
    if (active.size === 0) set(false);
  };
  const block = (e: Event) => e.preventDefault();
  el.addEventListener('pointerdown', pd);
  el.addEventListener('pointerup', pu);
  el.addEventListener('pointercancel', pu);
  el.addEventListener('lostpointercapture', pu);
  el.addEventListener('contextmenu', block);
  el.addEventListener('touchstart', block, { passive: false });
  return {
    subscribe: (l) => em.subscribe(l),
    getGravity: () => null,
    destroy() {
      el.removeEventListener('pointerdown', pd);
      el.removeEventListener('pointerup', pu);
      el.removeEventListener('pointercancel', pu);
      el.removeEventListener('lostpointercapture', pu);
      el.removeEventListener('contextmenu', block);
      el.removeEventListener('touchstart', block);
    },
  };
}

/** Merge sources. Gravity comes from the first source that reports one. */
export function createCompositeSource(...sources: InputSource[]): InputSource {
  return {
    subscribe(l) {
      const offs = sources.map((s) => s.subscribe(l));
      return () => offs.forEach((o) => o());
    },
    getGravity() {
      for (const s of sources) { const g = s.getGravity(); if (g) return g; }
      return null;
    },
    recenter() { sources.forEach((s) => s.recenter?.()); },
    destroy() { sources.forEach((s) => s.destroy?.()); },
  };
}

/**
 * A D-pad on one element: the pressed direction comes from where the finger is relative to
 * the pad's centre, so sliding a thumb around rolls between directions like the real thing.
 * Emits UP/DOWN/LEFT/RIGHT edges, and while LEFT/RIGHT is held reports a sideways gravity
 * (manual tilt for players without motion sensors). Sets data-dir on the element for styling.
 */
export function createDpadSource(el: HTMLElement): InputSource {
  const em = new Emitter();
  let dir: Action | null = null;
  let pointer = -1;
  let tilt = 0;
  const setDir = (d: Action | null) => {
    if (d === dir) return;
    if (dir) em.emit({ type: 'action', action: dir, down: false });
    dir = d;
    if (dir) em.emit({ type: 'action', action: dir, down: true });
    el.dataset.dir = dir ? dir.toLowerCase() : '';
  };
  const fromEvent = (e: PointerEvent): Action | null => {
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.12) return dir; // dead centre: keep what you had
    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'LEFT' : 'RIGHT') : dy < 0 ? 'UP' : 'DOWN';
  };
  const pd = (e: PointerEvent) => {
    e.preventDefault();
    pointer = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
    setDir(fromEvent(e));
  };
  const pm = (e: PointerEvent) => { if (e.pointerId === pointer) setDir(fromEvent(e)); };
  const pu = (e: PointerEvent) => { if (e.pointerId === pointer) { pointer = -1; setDir(null); } };
  const block = (e: Event) => e.preventDefault();
  el.addEventListener('pointerdown', pd);
  el.addEventListener('pointermove', pm);
  el.addEventListener('pointerup', pu);
  el.addEventListener('pointercancel', pu);
  el.addEventListener('contextmenu', block);
  el.addEventListener('touchstart', block, { passive: false });
  return {
    subscribe: (l) => em.subscribe(l),
    getGravity() {
      const target = dir === 'LEFT' ? -0.8 : dir === 'RIGHT' ? 0.8 : 0;
      tilt += (target - tilt) * 0.12;
      if (Math.abs(tilt) < 0.01 && target === 0) { tilt = 0; return null; }
      return { x: tilt, y: 1 };
    },
    destroy() {
      el.removeEventListener('pointerdown', pd); el.removeEventListener('pointermove', pm);
      el.removeEventListener('pointerup', pu); el.removeEventListener('pointercancel', pu);
      el.removeEventListener('contextmenu', block); el.removeEventListener('touchstart', block);
    },
  };
}
