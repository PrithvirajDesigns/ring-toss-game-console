/**
 * The game only ever sees these abstract actions plus a gravity vector. UP/DOWN/LEFT/RIGHT
 * (a D-pad) navigate menus; during play the D-pad's tilt comes through getGravity(). Where they come
 * from (keyboard, on-screen buttons, phase-2 console shell, motion sensors) is the
 * host's business: it hands the game an InputSource.
 */
export type Action = 'PUMP_A' | 'PUMP_B' | 'START' | 'SELECT' | 'RECENTER' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export const ACTIONS: Action[] = ['PUMP_A', 'PUMP_B', 'START', 'SELECT', 'RECENTER', 'UP', 'DOWN', 'LEFT', 'RIGHT'];

export type InputMessage =
  | { type: 'action'; action: Action; down: boolean }
  | { type: 'shake'; strength: number };

export type InputListener = (msg: InputMessage) => void;

export interface Vec2 { x: number; y: number; }

export interface InputSource {
  /** Subscribe to action edges and shakes. Returns an unsubscribe function. */
  subscribe(listener: InputListener): () => void;
  /** Current gravity direction in screen space (+y = down), or null for "no tilt available". */
  getGravity(): Vec2 | null;
  /** Called by the game for RECENTER (sources that support calibration override it). */
  recenter?(): void;
  destroy?(): void;
}

/**
 * Latches input edges between fixed steps so a tap shorter than one step still counts
 * as a press *and* a release.
 */
export class ActionState {
  private down = new Set<Action>();
  private pressedQ: Action[] = [];
  private releasedQ: Action[] = [];
  shakeQ: number[] = [];

  handle = (msg: InputMessage): void => {
    if (msg.type === 'shake') { this.shakeQ.push(msg.strength); return; }
    if (msg.down) {
      if (this.down.has(msg.action)) return;
      this.down.add(msg.action);
      this.pressedQ.push(msg.action);
    } else {
      if (!this.down.has(msg.action)) return;
      this.down.delete(msg.action);
      this.releasedQ.push(msg.action);
    }
  };

  isDown(a: Action): boolean { return this.down.has(a); }

  /** Drain edges in arrival order. */
  drain(): { pressed: Action[]; released: Action[]; shakes: number[] } {
    const out = { pressed: this.pressedQ, released: this.releasedQ, shakes: this.shakeQ };
    this.pressedQ = []; this.releasedQ = []; this.shakeQ = [];
    return out;
  }

  releaseAll(): void {
    for (const a of this.down) this.releasedQ.push(a);
    this.down.clear();
  }
}
