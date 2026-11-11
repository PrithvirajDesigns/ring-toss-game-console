// Pixel-art app icons → public/icons. Run: npm run icons
import { writeFileSync, mkdirSync } from 'node:fs';
import { encodePNG } from './png';
import { PALETTE_HEX, P } from '../src/render/palette';
import { drawRing } from '../src/render/rings';
import { BAYER4 } from '../src/render/framebuffer';
import type { FrameBuffer } from '../src/render/framebuffer';

const N = 32; // icon pixel grid
function art(safe: boolean): Uint8Array {
  const px = new Uint8Array(N * N);
  const set = (x: number, y: number, c: number) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < N && y < N) px[y * N + x] = c; };
  const ramp = [P.SHALLOW, P.TEAL, P.BLUE, P.MID, P.DEEP];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const f = (y / N) * (ramp.length - 1), i = Math.floor(f);
    px[y * N + x] = BAYER4[(y & 3) * 4 + (x & 3)] < (f - i) * 16 ? ramp[Math.min(4, i + 1)] : ramp[i];
  }
  const m = safe ? 4 : 0; // maskable icons keep the art inside the safe zone
  // coral tufts
  for (const [cx, col] of [[5 + m / 2, P.PINK], [26 - m / 2, P.MAGENTA]] as const) for (let k = 0; k < 7; k++) { set(cx, N - 1 - k - m / 2, col); if (k > 3) { set(cx - 1, N - 2 - k - m / 2, col); set(cx + 1, N - 2 - k - m / 2, col); } }
  // peg
  for (let y = 9 + m; y < 26 - m / 2; y++) { set(16, y, P.WHITE); set(15, y, P.LIGHT); }
  for (let x = 13; x <= 19; x++) set(x, 26 - m / 2, P.PLASTIC);
  const fb = { set } as unknown as FrameBuffer;
  drawRing(fb, 16, 23 - m / 2, 6.5, 4, 1.05, 'red', 1);
  drawRing(fb, 16, 17.5 - m / 2, 6.5, 4, 1.05, 'yellow', 1);
  drawRing(fb, 16, 23 - m / 2, 6.5, 4, 1.05, 'red', 2);
  drawRing(fb, 16, 17.5 - m / 2, 6.5, 4, 1.05, 'yellow', 2);
  drawRing(fb, 23 - m / 2, 8 + m, 5.5, 3.2, 0.2, 'blue');
  set(7 + m, 9 + m, P.WHITE); set(9 + m, 6 + m, P.LIGHT); set(6 + m, 4 + m, P.LIGHT);
  return px;
}
const rgb = PALETTE_HEX.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
function write(file: string, size: number, safe: boolean) {
  const px = art(safe), z = size / N, out = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out.set(rgb[px[Math.floor(y / z) * N + Math.floor(x / z)]], (y * size + x) * 3);
  writeFileSync(file, encodePNG(size, size, out));
}
mkdirSync('public/icons', { recursive: true });
write('public/icons/icon-192.png', 192, false);
write('public/icons/icon-512.png', 512, false);
write('public/icons/maskable-512.png', 512, true);
write('public/icons/apple-touch-icon.png', 192, false);
console.log('icons written to public/icons');
