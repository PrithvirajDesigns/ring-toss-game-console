import type { Game } from '../game';
import { DEFAULT_PHYSICS, TUNING_META, type PhysicsConfig } from '../physics/config';

/** Live physics sliders, generated from TUNING_META. Saved per device under rtt.tune. */
export const TUNE_KEY = 'rtt.tune';

export function loadTuning(): Partial<PhysicsConfig> {
  try { return JSON.parse(localStorage.getItem(TUNE_KEY) || '{}'); } catch { return {}; }
}

export function buildTuningPanel(tune: HTMLElement, game: Game): void {
  const cfg = game.dev.config;
  const save = () => {
    const diff: Partial<Record<keyof PhysicsConfig, number>> = {};
    for (const k of Object.keys(DEFAULT_PHYSICS) as (keyof PhysicsConfig)[]) if (cfg[k] !== DEFAULT_PHYSICS[k]) diff[k] = cfg[k];
    try { localStorage.setItem(TUNE_KEY, JSON.stringify(diff)); } catch { /* ignore */ }
    (tune.querySelector('textarea') as HTMLTextAreaElement).value = JSON.stringify(diff, null, 1);
  };
  tune.innerHTML = `<div class="row"><button data-act="close">CLOSE</button><button data-act="reset">RESET ALL</button>
    <button data-act="debug">DEBUG OVERLAY</button></div>
    <div style="font-size:10px;color:#9fd0ff">Changes apply live and are saved on this device. Copy the JSON below to share your tuning.</div>`;
  let group = '';
  for (const m of TUNING_META) {
    if (m.group !== group) { group = m.group; tune.insertAdjacentHTML('beforeend', `<h3>${group}</h3>`); }
    const label = document.createElement('label');
    label.innerHTML = `<span>${m.key}</span><span class="val"></span><input type="range" min="${m.min}" max="${m.max}" step="${m.step}">`;
    const range = label.querySelector('input') as HTMLInputElement;
    const val = label.querySelector('.val') as HTMLElement;
    const sync = () => { range.value = String(cfg[m.key]); val.textContent = String(+cfg[m.key].toFixed(3)); val.style.color = cfg[m.key] !== DEFAULT_PHYSICS[m.key] ? '#ffd36b' : ''; };
    range.addEventListener('input', () => { cfg[m.key] = Number(range.value); sync(); save(); });
    sync();
    tune.appendChild(label);
  }
  tune.insertAdjacentHTML('beforeend', '<h3>Changed values</h3><textarea readonly></textarea>');
  tune.querySelector('[data-act=close]')!.addEventListener('click', () => tune.classList.remove('open'));
  tune.querySelector('[data-act=reset]')!.addEventListener('click', () => { game.dev.resetConfig(); save(); buildTuningPanel(tune, game); });
  tune.querySelector('[data-act=debug]')!.addEventListener('click', () => (game.dev.overlay = !game.dev.overlay));
  save();
}
