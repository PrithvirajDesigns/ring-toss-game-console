import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';

/**
 * Emits sw.js with a precache list of every built file, versioned by content hash, so a new
 * deploy replaces the old cache and the game works fully offline after the first visit.
 */
function serviceWorker(): Plugin {
  return {
    name: 'rtt-service-worker',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const extra = ['./', 'dev.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
      const list = [...new Set([...extra, ...files.map((f) => f)])];
      const version = createHash('sha1').update(list.join('|') + Object.values(bundle).map((c) => ('code' in c ? c.code : '')).join('')).digest('hex').slice(0, 10);
      const sw = `// generated at build time — do not edit
const CACHE = 'rtt-${version}';
const ASSETS = ${JSON.stringify(list)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // network first for the page (fresh deploys), cache when offline
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); return r; }).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    },
  };
}

// `npm run dev:phone` exposes the dev server on your LAN. Motion sensors need HTTPS:
// use an HTTPS tunnel (ngrok, cloudflared) or @vitejs/plugin-basic-ssl.
// Two pages: index.html (the Tide Pocket handheld) and dev.html (bare screen + tuning panel).
// SINGLE=1 builds only the handheld as one chunk, for the single-file build.
const single = process.env.SINGLE === '1';
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2020',
    assetsInlineLimit: 100_000,
    outDir: single ? 'dist-single-tmp' : 'dist',
    rollupOptions: { input: single ? { index: 'index.html' } : { index: 'index.html', dev: 'dev.html' } },
  },
  plugins: single ? [] : [serviceWorker()],
});
