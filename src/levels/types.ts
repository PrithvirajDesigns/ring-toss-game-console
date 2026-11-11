import type { RingColor } from '../render/palette';

export interface PegDef {
  x: number;
  /** y of the peg tip (smaller = higher) */
  tipY: number;
  /** y of the flange rings stack on */
  baseY: number;
  /** if set, only rings of this colour count when threaded here */
  color?: RingColor;
}

export interface TankDef { left: number; right: number; top: number; floor: number; }

export interface LevelDef {
  id: string;
  name: string;
  /** ring colours, one entry per ring */
  rings: RingColor[];
  pegs: PegDef[];
  /** nozzle x positions (1 or 2); they sit just below the floor ledge */
  nozzles: number[];
  /** ambient current multiplier (1 = normal) */
  current?: number;
  tank?: Partial<TankDef>;
  /** star thresholds in seconds: [3 stars if ≤, 2 stars if ≤] */
  starTimes?: [number, number];
}

export const DEFAULT_TANK: TankDef = { left: 7, right: 153, top: 13, floor: 121 };
