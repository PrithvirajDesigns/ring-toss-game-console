// The single source of truth for colour. 32 entries, referenced by index everywhere.
// Change a hex here and every sprite, effect and UI element follows.

export const PALETTE_HEX = [
  // 0-7: water, deep -> light
  '#050b1a', // 0  ink / outline
  '#0b1a33', // 1  abyss
  '#0f2a4f', // 2  deep blue
  '#143e6e', // 3  mid blue
  '#1b5a8c', // 4  blue
  '#2479a8', // 5  teal-blue
  '#3aa0c4', // 6  shallow teal
  '#7fd3e6', // 7  surface light / caustics
  // 8-11: neutrals / plastic
  '#e8f6ff', // 8  white highlight
  '#a9c4d8', // 9  clear plastic
  '#6a879e', // 10 plastic shadow
  '#34465a', // 11 dark slate
  // 12-15: fish warms
  '#ffe066', // 12 yellow
  '#ffb52e', // 13 orange
  '#f27a1a', // 14 deep orange
  '#9c4a12', // 15 brown
  // 16-19: coral
  '#ff7aa8', // 16 pink
  '#c94f9e', // 17 magenta
  '#7d3c98', // 18 purple
  '#d6334a', // 19 coral red
  // 20-23: greens
  '#9fe36b', // 20 light green
  '#3fae4f', // 21 green
  '#1f6e45', // 22 sea green
  '#143f34', // 23 deep weed
  // 24-31: ring hues (base/shade pairs)
  '#ff4b4b', // 24 ring red
  '#a8202e', // 25 ring red shade
  '#ffd23a', // 26 ring yellow
  '#c48a12', // 27 ring yellow shade
  '#47d96a', // 28 ring green
  '#4a8fff', // 29 ring blue
  '#ff8c2e', // 30 ring orange
  '#1e46b0', // 31 ring blue shade
] as const;

export const P = {
  INK: 0, ABYSS: 1, DEEP: 2, MID: 3, BLUE: 4, TEAL: 5, SHALLOW: 6, LIGHT: 7,
  WHITE: 8, PLASTIC: 9, PLASTIC_SH: 10, SLATE: 11,
  YELLOW: 12, ORANGE: 13, DORANGE: 14, BROWN: 15,
  PINK: 16, MAGENTA: 17, PURPLE: 18, CORAL: 19,
  LGREEN: 20, GREEN: 21, SEAGREEN: 22, WEED: 23,
} as const;

export type RingColor = 'red' | 'yellow' | 'green' | 'blue' | 'orange';

/** base, shade, highlight palette indices for each ring colour */
export const RING_COLORS: Record<RingColor, { base: number; shade: number; hi: number }> = {
  red: { base: 24, shade: 25, hi: 16 },
  yellow: { base: 26, shade: 27, hi: 8 },
  green: { base: 28, shade: 22, hi: 20 },
  blue: { base: 29, shade: 31, hi: 7 },
  orange: { base: 30, shade: 14, hi: 12 },
};

export const RING_COLOR_ORDER: RingColor[] = ['red', 'yellow', 'green', 'blue', 'orange'];

/** Palette as packed ABGR (little-endian RGBA in a Uint32Array over ImageData). */
export const PALETTE_U32: Uint32Array = (() => {
  const out = new Uint32Array(PALETTE_HEX.length);
  PALETTE_HEX.forEach((hex, i) => {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    out[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  });
  return out;
})();

/**
 * "See-through plastic" tint: maps a colour to a slightly lighter neighbour so clear
 * parts (pegs, tank walls) can be drawn as a tint over whatever is behind them.
 */
export const LIGHTEN: Uint8Array = (() => {
  const t = new Uint8Array(PALETTE_HEX.length);
  for (let i = 0; i < t.length; i++) t[i] = i;
  // water ramp brightens one step
  [[0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 6], [6, 7], [7, 8]].forEach(([a, b]) => (t[a] = b));
  t[10] = 9; t[9] = 8; t[11] = 10;
  t[23] = 22; t[22] = 21; t[21] = 20;
  t[18] = 17; t[17] = 16; t[19] = 16; t[15] = 14; t[14] = 13; t[13] = 12;
  return t;
})();

/** The opposite: one step darker, used for depth fog and shadows. */
export const DARKEN: Uint8Array = (() => {
  const t = new Uint8Array(PALETTE_HEX.length);
  for (let i = 0; i < t.length; i++) t[i] = i;
  [[8, 7], [7, 6], [6, 5], [5, 4], [4, 3], [3, 2], [2, 1], [1, 0]].forEach(([a, b]) => (t[a] = b));
  t[9] = 10; t[10] = 11; t[11] = 0;
  return t;
})();
