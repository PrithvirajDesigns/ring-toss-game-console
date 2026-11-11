import type { RingColor } from '../render/palette';
import type { Settings } from './save';

export type GameState = 'boot' | 'title' | 'menu' | 'levels' | 'settings' | 'play' | 'pause' | 'results';

/** Everything the host (and later the console shell, audio and haptics) can react to. */
export type GameEvent =
  | { type: 'state'; state: GameState; prev: GameState }
  | { type: 'burst'; nozzle: number }
  | { type: 'release'; nozzle: number; pressure: number }
  | { type: 'thread'; peg: number; color: RingColor }
  | { type: 'unthread'; peg: number; color: RingColor }
  | { type: 'land'; peg: number; color: RingColor; speed: number }
  | { type: 'hit'; kind: 'ring' | 'wall' | 'peg'; speed: number }
  | { type: 'win'; mode: string; level: string; time: number; bursts: number; stars: number; best: number | null }
  | { type: 'settings'; settings: Settings }
  | { type: 'recenter' }
  | { type: 'shake' };

export type GameEventListener = (e: GameEvent) => void;
