import type { Game } from '../game';

/**
 * Vibration feedback from game events (Android Chrome; iOS Safari has no vibrate API, so
 * this silently does nothing there). Kept outside the game so a console shell can swap in
 * its own rumble.
 */
export function attachHaptics(game: Game): () => void {
  const can = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  const buzz = (p: number | number[]) => {
    if (!can || !game.settings.vibration) return;
    try { navigator.vibrate(p); } catch { /* blocked: ignore */ }
  };
  let lastLand = 0;
  return game.onEvent((e) => {
    if (e.type === 'burst') buzz(18);
    else if (e.type === 'land') {
      const now = performance.now();
      if (now - lastLand > 80) { lastLand = now; buzz(Math.min(45, 15 + e.speed)); }
    } else if (e.type === 'win') buzz([40, 60, 40, 60, 120]);
    else if (e.type === 'shake') buzz(30);
  });
}
