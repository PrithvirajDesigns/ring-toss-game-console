import type { LevelDef, PegDef } from './types';
import type { RingColor } from '../render/palette';
import { RING_COLOR_ORDER } from '../render/palette';

/**
 * Level data. World units: the tank interior is x 7..153, top 13, floor 121 at the
 * nozzle (the floor slopes up toward the walls). Peg tips are smaller y = higher.
 * Capacity check: (baseY - tipY) / stackSpacing must be ≥ the rings that go on a peg.
 */

const cycle = (n: number, colors: RingColor[] = RING_COLOR_ORDER): RingColor[] =>
  Array.from({ length: n }, (_, i) => colors[i % colors.length]);
const peg = (x: number, tipY = 66, baseY = 104, color?: RingColor): PegDef => ({ x, tipY, baseY, color });

export const CLASSIC: LevelDef = {
  id: 'classic', name: 'CLASSIC',
  rings: cycle(10),
  pegs: [peg(56), peg(104)],
  nozzles: [80],
  starTimes: [90, 180],
};

export const ZEN: LevelDef = { ...CLASSIC, id: 'zen', name: 'ZEN' };

/** Ordered by measured difficulty (aiming-bot clear rates). Ids are stable slugs so saves survive reordering. */
export const CHALLENGE: LevelDef[] = [
  { id: 'first-drop', name: 'FIRST DROP', rings: cycle(3), pegs: [peg(56), peg(104)], nozzles: [80], starTimes: [25, 60] },
  { id: 'high-five', name: 'HIGH FIVE', rings: cycle(5), pegs: [peg(56), peg(104)], nozzles: [80], starTimes: [45, 100] },
  { id: 'short-stack', name: 'SHORT STACK', rings: cycle(6), pegs: [peg(40, 82, 102), peg(120, 82, 102)], nozzles: [80], starTimes: [70, 150] },
  { id: 'lone-peg', name: 'LONE PEG', rings: cycle(5), pegs: [peg(110, 62, 104)], nozzles: [80], starTimes: [60, 130] },
  { id: 'match-up', name: 'MATCH UP', rings: cycle(6, ['red', 'blue']), pegs: [peg(56, 66, 104, 'red'), peg(104, 66, 104, 'blue')], nozzles: [80], starTimes: [90, 180] },
  { id: 'tall-order', name: 'TALL ORDER', rings: cycle(6), pegs: [peg(52, 50, 104), peg(108, 50, 104)], nozzles: [80], starTimes: [60, 130] },
  { id: 'twin-jets', name: 'TWIN JETS', rings: cycle(8), pegs: [peg(32, 68, 100), peg(128, 68, 100)], nozzles: [60, 100], starTimes: [90, 180] },
  { id: 'trident', name: 'TRIDENT', rings: cycle(9), pegs: [peg(36, 64, 100), peg(80, 74, 98), peg(124, 64, 100)], nozzles: [80], starTimes: [120, 240] },
  { id: 'undertow', name: 'UNDERTOW', rings: cycle(8), pegs: [peg(56), peg(104)], nozzles: [80], current: 3, starTimes: [100, 200] },
  { id: 'crossfire', name: 'CROSSFIRE', rings: cycle(10, ['blue', 'orange']), pegs: [peg(40, 66, 102, 'blue'), peg(120, 66, 102, 'orange')], nozzles: [64, 96], current: 1.5, starTimes: [150, 300] },
  { id: 'rainbow', name: 'RAINBOW', rings: cycle(9, ['red', 'yellow', 'green']), pegs: [peg(36, 62, 100, 'red'), peg(80, 72, 98, 'yellow'), peg(124, 62, 100, 'green')], nozzles: [80], starTimes: [150, 300] },
  { id: 'grand-reef', name: 'GRAND REEF', rings: cycle(12), pegs: [peg(34, 60, 100), peg(80, 70, 98), peg(126, 60, 100)], nozzles: [80], current: 2, starTimes: [180, 360] },
];

export const LEVELS = { classic: CLASSIC, zen: ZEN };
