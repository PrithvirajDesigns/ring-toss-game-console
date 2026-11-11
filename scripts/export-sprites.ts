// Renders every generated sprite to assets/sprite-sheet.png (4x zoom) for review.
// Run: npm run sprites
import { writeFileSync, mkdirSync } from 'node:fs';
import { encodePNG } from './png';
import { fishSprites, type FishKind } from '../src/render/art/fish';
import { buildCoralBed, buildFarReef } from '../src/render/art/reef';
import { PALETTE_HEX } from '../src/render/palette';
import { CLEAR, type Sprite } from '../src/render/sprite';

const Z = 4, BG = [11, 26, 51];
const items: { s: Sprite; z: number }[] = [];
for (const k of ['tang', 'angel', 'chromis'] as FishKind[]) for (const f of fishSprites(k).frames) items.push({ s: f, z: Z });
const bed = buildCoralBed(324, 140, (x) => 118 - Math.max(0, Math.min(36, (Math.abs(x - 162) - 6) * 0.2)), 23);
const far = buildFarReef(312, 120, 6);
const W = Math.max(items.reduce((a, it) => a + it.s.w * it.z + 8, 8), 324 * 2 + 16);
const H = 34 * Z + 16 + 140 * 2 + 8 + 120 * 2 + 8;
const img = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) img.set(BG, i * 3);
const rgb = PALETTE_HEX.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const put = (s: Sprite, ox: number, oy: number, z: number) => {
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const c = s.px[y * s.w + x]; if (c === CLEAR) continue;
    for (let j = 0; j < z; j++) for (let i = 0; i < z; i++) img.set(rgb[c], ((oy + y * z + j) * W + ox + x * z + i) * 3);
  }
};
let x = 8;
for (const it of items) { put(it.s, x, 8, it.z); x += it.s.w * it.z + 8; }
put(bed, 8, 34 * Z + 16, 2);
put(far, 8, 34 * Z + 16 + 280 + 8, 2);

const png = encodePNG(W, H, img);
mkdirSync('assets', { recursive: true });
writeFileSync('assets/sprite-sheet.png', png);
console.log(`assets/sprite-sheet.png ${W}x${H}`);
