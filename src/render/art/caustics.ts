/**
 * Caustic light network: a small tileable 64x64 bitmask per frame. The formula uses only
 * integer multiples of 2π/64, so the tile repeats seamlessly. Precomputed, cheap to apply.
 */
export const CAUSTIC_SIZE = 64;
export const CAUSTIC_FRAMES = 16;

let frames: Uint8Array[] | null = null;

export function causticFrames(): Uint8Array[] {
  if (frames) return frames;
  frames = [];
  const N = CAUSTIC_SIZE, k = (2 * Math.PI) / N;
  for (let f = 0; f < CAUSTIC_FRAMES; f++) {
    const t = (f / CAUSTIC_FRAMES) * Math.PI * 2;
    const m = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v =
        Math.sin(k * (2 * x + y) + t) +
        Math.sin(k * (x - 2 * y) - t) +
        Math.sin(k * (3 * x + 2 * y) + 2 * t) * 0.6 +
        Math.sin(k * (-x + 3 * y) + t) * 0.6;
      const a = Math.abs(v);
      m[y * N + x] = a < 0.16 ? 2 : a < 0.38 ? 1 : 0; // 2 = bright core, 1 = soft edge
    }
    frames.push(m);
  }
  return frames;
}
