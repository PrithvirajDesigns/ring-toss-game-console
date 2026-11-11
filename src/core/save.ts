/** Versioned save data in localStorage. Every read/write is guarded (private mode, frames). */

export interface Settings {
  sound: boolean;
  music: boolean;
  vibration: boolean;
  /** tilt sensitivity step 1..5 (3 = natural) */
  tilt: number;
  debug: boolean;
}

export interface SaveData {
  v: 1;
  settings: Settings;
  /** best clear time (s) per level id */
  best: Record<string, number>;
  /** best star rating per level id */
  stars: Record<string, number>;
  /** challenge levels unlocked (count) */
  unlocked: number;
}

export const TILT_STEPS = [0.6, 0.8, 1, 1.25, 1.55];

const KEY = 'rtt.save';

export const defaultSave = (): SaveData => ({
  v: 1,
  settings: { sound: true, music: true, vibration: true, tilt: 3, debug: false },
  best: {},
  stars: {},
  unlocked: 1,
});

export function loadSave(persist: boolean): SaveData {
  const d = defaultSave();
  if (!persist) return d;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<SaveData>;
      if (s && s.v === 1) {
        return { ...d, ...s, settings: { ...d.settings, ...s.settings }, best: { ...s.best }, stars: { ...s.stars } };
      }
    }
    // migrate phase-1 prototype keys
    const oldBest = Number(localStorage.getItem('rtt.best.classic'));
    if (oldBest > 0) d.best.classic = oldBest;
    if (localStorage.getItem('rtt.debug') === '1') d.settings.debug = true;
  } catch { /* unavailable: defaults */ }
  return d;
}

export function writeSave(persist: boolean, s: SaveData): void {
  if (!persist) return;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
