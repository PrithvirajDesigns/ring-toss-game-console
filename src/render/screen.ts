import { FrameBuffer, SCREEN_W, SCREEN_H } from './framebuffer';

/**
 * Owns the 160x144 offscreen canvas and blits it into the host-provided canvas at the
 * largest integer scale that fits, nearest-neighbour, centred and letterboxed.
 * The host decides how big the canvas is; this never touches the page.
 */
export class Screen {
  readonly fb = new FrameBuffer();
  private off: HTMLCanvasElement | OffscreenCanvas;
  private offCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    if (typeof OffscreenCanvas !== 'undefined') this.off = new OffscreenCanvas(SCREEN_W, SCREEN_H);
    else { const c = canvas.ownerDocument.createElement('canvas'); c.width = SCREEN_W; c.height = SCREEN_H; this.off = c; }
    const oc = this.off.getContext('2d');
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!oc || !ctx) throw new Error('Canvas 2D not available');
    this.offCtx = oc as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    this.ctx = ctx;
  }

  /** Integer scale currently used (≥1). */
  get scale(): number {
    return Math.max(1, Math.floor(Math.min(this.canvas.width / SCREEN_W, this.canvas.height / SCREEN_H)));
  }

  present(): void {
    this.fb.present(this.offCtx as CanvasRenderingContext2D);
    const { width: cw, height: ch } = this.canvas;
    if (cw === SCREEN_W && ch === SCREEN_H) { this.ctx.drawImage(this.off as CanvasImageSource, 0, 0); return; }
    const k = this.scale;
    const w = SCREEN_W * k, h = SCREEN_H * k;
    const ox = Math.floor((cw - w) / 2), oy = Math.floor((ch - h) / 2);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    if (ox > 0 || oy > 0) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch); }
    ctx.drawImage(this.off as CanvasImageSource, 0, 0, SCREEN_W, SCREEN_H, ox, oy, w, h);
  }
}
