// Inlines the built JS into dist-single/index.html: one file, no server needed.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
const dist = 'dist-single-tmp', out = 'dist-single';
let html = readFileSync(path.join(dist, 'index.html'), 'utf8');
html = html.replace(/<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/, (_, f) => {
  const js = readFileSync(path.join(dist, 'assets', f), 'utf8').replace(/<\/script/g, '<\\/script');
  return `<script type="module">${js}</script>`;
});
if (/src="\.\/assets\//.test(html)) throw new Error('unexpected asset reference left: ' + readdirSync(path.join(dist, 'assets')));
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'index.html'), html);
rmSync(dist, { recursive: true, force: true });
console.log(`dist-single/index.html (${(html.length / 1024).toFixed(1)} kB)`);
