/**
 * Phase 2: the "Tide Pocket" handheld shell: an original handheld in translucent ocean blue (default)
 * with tidy see-through internals, around the game
 * screen. The game is the same self-contained module as in phase 1: it only gets a
 * canvas and an InputSource. The shell maps its physical-looking controls to actions:
 *   D-pad → UP/DOWN/LEFT/RIGHT (menus; LEFT/RIGHT also tilt when held)
 *   A → PUMP_A, B → PUMP_B, START, SELECT, LEVEL → RECENTER
 * Tapping anything while the device is off powers it on. That gesture is what lets us
 * start audio and ask iOS for motion permission.
 */
import { createGame, TILT_STEPS } from '../game';
import { createCompositeSource, createDpadSource, createKeyboardSource, createPointerButtonSource } from '../input/sources';
import { createMotionSource } from '../input/sensors';
import { attachHaptics } from '../input/haptics';
import { registerServiceWorker } from '../pwa';
import { buildTuningPanel, loadTuning } from '../dev/tuning';
import { SCREEN_W, SCREEN_H } from '../render/framebuffer';
import { renderInternals } from './internals';
import { playBoot } from './boot';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const device = $('device');
const canvas = $('screen') as HTMLCanvasElement;
const shell = device.querySelector('.shell') as HTMLElement;
const well = device.querySelector('.well') as HTMLElement;
const toast = $('toast');

// ---------- themes (tap the brand to cycle) ----------
const THEMES = ['ocean', 'clear', 'lagoon', 'coral', 'smoke'] as const;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
let theme = Math.max(0, THEMES.indexOf((store.get('rtt.shell4') ?? 'ocean') as (typeof THEMES)[number]));
const applyTheme = () => { device.className = `theme-${THEMES[theme]}${powered ? ' on' : ''}`; };

// ---------- integer-scaled screen that fits inside the bezel ----------
function fit(): void {
  const dpr = window.devicePixelRatio || 1;
  // Width: what the bezel leaves for the screen. Height: the viewport minus the rest of the shell.
  const bezel = well.parentElement as HTMLElement;
  const cs = getComputedStyle(bezel);
  const availW = bezel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 4;
  const rest = shell.offsetHeight - well.offsetHeight;
  const availH = window.innerHeight - rest - 12;
  const k = Math.max(1, Math.floor(Math.min((availW * dpr) / SCREEN_W, (availH * dpr) / SCREEN_H)));
  canvas.width = SCREEN_W * k;
  canvas.height = SCREEN_H * k;
  canvas.style.width = `${(SCREEN_W * k) / dpr}px`;
  canvas.style.height = `${(SCREEN_H * k) / dpr}px`;
  // the LCD grid lines up with game pixels: k device pixels each, with a one-device-pixel gap line
  const lcd = $('lcd');
  lcd.style.setProperty('--px', `${k / dpr}px`);
  lcd.style.setProperty('--line', `${k >= 3 ? 1 / dpr : 0.5 / dpr}px`);
  lcd.style.opacity = k >= 2 ? '1' : '0.5';
  // internals follow the real control positions, so redraw after layout settles
  requestAnimationFrame(() => renderInternals(shell, $('internals')));
}

// ---------- input ----------
const motion = createMotionSource();
const input = createCompositeSource(
  createDpadSource($('dpad')), // a held D-pad direction overrides sensor tilt
  motion,
  createKeyboardSource({ tiltElement: canvas }),
  createPointerButtonSource($('btn-a'), 'PUMP_A'),
  createPointerButtonSource($('btn-b'), 'PUMP_B'),
  createPointerButtonSource($('btn-start'), 'START'),
  createPointerButtonSource($('btn-select'), 'SELECT'),
  createPointerButtonSource($('btn-recenter'), 'RECENTER'),
);

const game = createGame({ canvas, inputSource: input, physics: loadTuning() });
attachHaptics(game);
game.onEvent((e) => {
  if (e.type === 'settings') motion.setSensitivity(TILT_STEPS[e.settings.tilt - 1] ?? 1);
  if (e.type === 'recenter') say('Tilt level set to how you are holding it.');
});

// a tiny click on every shell button press, like real rubber domes
shell.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('button, .dpad') && powered && game.settings.vibration) {
    try { navigator.vibrate?.(6); } catch { /* ignore */ }
  }
}, { capture: true });

function say(s: string, ms = 3500): void {
  toast.textContent = s;
  toast.style.opacity = '1';
  clearTimeout((say as unknown as { t?: number }).t);
  (say as unknown as { t?: number }).t = window.setTimeout(() => (toast.style.opacity = '0'), ms);
}

// ---------- boot sequence (the handheld's own start-up, before the game takes over) ----------
let audioCtx: AudioContext | null = null;
let booting: { skip(): void; cancel(): void } | null = null;
let bootSeq = 0;
function boot(short: boolean): Promise<void> {
  const my = ++bootSeq;
  const b = playBoot({ canvas, audio: game.settings.sound ? audioCtx : null, short });
  booting = b;
  return b.done.then(() => { if (bootSeq === my) booting = null; });
}
// A / START / any key skips the intro
for (const id of ['btn-a', 'btn-start']) $(id).addEventListener('pointerdown', () => booting?.skip());
window.addEventListener('keydown', (e) => { if (booting && e.code !== 'Tab') booting.skip(); });

// ---------- power on: the user gesture for audio + motion permission ----------
let powered = false;
function powerOn(): void {
  if (powered) return;
  powered = true;
  everOn = true;
  document.getElementById('btn-power')?.setAttribute('aria-pressed', 'true');
  applyTheme();
  // Ask for motion first, synchronously inside the gesture (iOS requires it).
  const perm = motion.requestPermission();
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) { audioCtx = new AC(); audioCtx.resume().catch(() => undefined); game.setAudioContext(audioCtx); }
  } catch { /* silent */ }
  boot(false).then(() => { if (powered) game.start(); });
  perm.then((res) => {
    if (res === 'denied') say('Tilt is off (motion permission denied). Hold ◀ ▶ on the D-pad to steer instead.', 6000);
    else if (res === 'unsupported') say('No motion sensors here: hold ◀ ▶ on the D-pad (or arrow keys) to steer.', 6000);
    else setTimeout(() => {
      if (motion.active) { input.recenter?.(); say('Tilt to steer. Press LEVEL to recentre on your grip.'); }
      else say(location.protocol !== 'https:' && location.hostname !== 'localhost'
        ? 'Tilt needs HTTPS. Hold ◀ ▶ on the D-pad to steer.'
        : 'No tilt data here: hold ◀ ▶ on the D-pad to steer.', 6000);
    }, 900);
  });
}
// The very first touch or key anywhere powers on (that gesture unlocks audio and sensors).
// After that, the power switch is the only way on or off.
let firstGesture = true;
const firstPowerOn = (e: Event) => {
  if (!firstGesture) return;
  if ((e.target as HTMLElement | null)?.closest?.('#btn-power')) return; // the switch handles itself
  firstGesture = false;
  powerOn();
};
window.addEventListener('pointerdown', firstPowerOn, { capture: true });
window.addEventListener('keydown', firstPowerOn, { capture: true });

const powerBtn = $('btn-power');
function powerOff(): void {
  if (!powered) return;
  powered = false;
  bootSeq++; booting?.cancel(); booting = null; // abandon a boot that is still playing
  game.pause();
  ($('screen-off-msg')).innerHTML = 'SLIDE THE SWITCH<br />TO POWER ON';
  powerBtn.setAttribute('aria-pressed', 'false');
  applyTheme();
}
let everOn = false;
powerBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  firstGesture = false;
  if (powered) powerOff();
  else if (!everOn) powerOn();
  else {
    powered = true; applyTheme(); powerBtn.setAttribute('aria-pressed', 'true');
    // switched back on: a short boot, then pick the game up where it was (at its pause menu)
    boot(true).then(() => { if (powered) game.resume(); });
  }
});

// ---------- brand: tap = next colour, long-press = dev tuning panel ----------
const brand = $('brand');
let pressT = 0, longFired = false;
brand.addEventListener('pointerdown', () => {
  longFired = false;
  pressT = window.setTimeout(() => {
    longFired = true;
    const tune = $('tune');
    if (!tune.childElementCount) buildTuningPanel(tune, game);
    tune.classList.toggle('open');
  }, 800);
});
brand.addEventListener('pointerup', () => {
  clearTimeout(pressT);
  if (!longFired && powered) { theme = (theme + 1) % THEMES.length; store.set('rtt.shell4', THEMES[theme]); applyTheme(); }
});
brand.addEventListener('pointerleave', () => clearTimeout(pressT));

// ---------- lifecycle ----------
applyTheme();
new ResizeObserver(fit).observe(document.body);
window.addEventListener('orientationchange', () => setTimeout(fit, 200));
fit();
document.addEventListener('visibilitychange', () => { if (!powered || booting) return; if (document.hidden) game.pause(); else game.resume(); });
registerServiceWorker();
(window as unknown as { game: typeof game; motion: typeof motion }).game = game;
(window as unknown as { motion: typeof motion }).motion = motion;
