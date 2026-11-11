/**
 * Offline support. The service worker (generated at build time by the Vite plugin in
 * vite.config.ts, with the exact list of built files) precaches the whole game.
 * Skipped in dev, in embedded frames and on insecure origins, where it would fail or mislead.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  if (window.top !== window.self) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline mode unavailable */ });
  });
}
