/**
 * Developer host page (dev.html): the phase-1 page with a tuning panel. Everything page-specific lives here: sizing the canvas, the
 * temporary on-screen buttons, keyboard, the tuning panel. The game itself only gets a
 * canvas and an InputSource. The player-facing page is the console shell (index.html, src/shell).
 */
import { createGame, TILT_STEPS } from './game';
import { attachHaptics } from './input/haptics';
import { registerServiceWorker } from './pwa';
import { buildTuningPanel, loadTuning } from './dev/tuning';
import { createCompositeSource, createKeyboardSource, createPointerButtonSource } from './input/sources';
import { createMotionSource } from './input/sensors';
import { SCREEN_W, SCREEN_H } from './render/framebuffer';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const wrap = document.getElementById('screen-wrap') as HTMLElement;
const $ = (id: string) => document.getElementById(id) as HTMLElement;

// --- integer scaling in *device* pixels, so every game pixel is an exact square block ---
function fit(): void {
  const dpr = window.devicePixelRatio || 1;
  const availW = wrap.clientWidth * dpr, availH = wrap.clientHeight * dpr;
  const k = Math.max(1, Math.floor(Math.min(availW / SCREEN_W, availH / SCREEN_H)));
  canvas.width = SCREEN_W * k;
  canvas.height = SCREEN_H * k;
  canvas.style.width = `${(SCREEN_W * k) / dpr}px`;
  canvas.style.height = `${(SCREEN_H * k) / dpr}px`;
}
new ResizeObserver(fit).observe(wrap);
window.addEventListener('orientationchange', () => setTimeout(fit, 200));
fit();

// --- input ---
const motion = createMotionSource();
const input = createCompositeSource(
  motion, // tilt from the phone wins when it has data; keyboard tilt otherwise
  createKeyboardSource({ tiltElement: canvas }),
  createPointerButtonSource($('btn-pump-a'), 'PUMP_A'),
  createPointerButtonSource($('btn-pump-b'), 'PUMP_B'),
  createPointerButtonSource($('btn-start'), 'START'),
  createPointerButtonSource($('btn-select'), 'SELECT'),
  createPointerButtonSource($('btn-recenter'), 'RECENTER'),
);

const saved = loadTuning();

const game = createGame({ canvas, inputSource: input, physics: saved });

game.onEvent((e) => {
  if (e.type === 'state') document.body.classList.toggle('two-nozzles', game.dev.world.fluid.nozzles.length > 1 && (e.state === 'play' || e.state === 'pause'));
  if (e.type === 'settings') motion.setSensitivity(TILT_STEPS[e.settings.tilt - 1] ?? 1);
});
attachHaptics(game);

document.addEventListener('visibilitychange', () => (document.hidden ? game.pause() : game.resume()));
$('btn-debug').addEventListener('click', () => (game.dev.overlay = !game.dev.overlay));
// Tilt sensitivity can also be overridden from the tuning panel's console: motion.setSensitivity(x)

// --- tuning panel ---
const tune = $('tune');
$('btn-tune').addEventListener('click', () => tune.classList.toggle('open'));
buildTuningPanel(tune, game);

game.start();

// --- "Tap to start": the user gesture iOS needs for motion permission (and, later, audio) ---
const note = $('tilt-note');
$('btn-gate').addEventListener('click', async () => {
  // Audio must be created/resumed inside a user gesture (iOS especially).
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) { const ctx = new AC(); await ctx.resume().catch(() => undefined); game.setAudioContext(ctx); }
  } catch { /* no audio: play silently */ }
  const res = await motion.requestPermission();
  $('gate').classList.add('hidden');
  const say = (s: string) => (note.textContent = s);
  if (res === 'denied') say('Tilt is off (motion permission denied). Rings fall straight down.');
  else if (res === 'unsupported') say('No motion sensors here: use arrow keys to tilt.');
  else {
    say(location.protocol === 'https:' || location.hostname === 'localhost' ? 'Tilt on. Waiting for sensor…' : 'Tilt needs HTTPS: open this page over https.');
    // Recenter once the first readings settle, so "how you hold it" is level.
    setTimeout(() => {
      if (motion.active) { input.recenter?.(); say('Tilt on. RECENTER sets your hold angle as level.'); }
      else if (!note.textContent?.startsWith('Tilt needs')) say('No tilt data (this browser or frame may block sensors).');
    }, 900);
  }
});

registerServiceWorker();

// Expose for console poking during development.
(window as unknown as { game: typeof game; motion: typeof motion }).game = game;
(window as unknown as { motion: typeof motion }).motion = motion;
