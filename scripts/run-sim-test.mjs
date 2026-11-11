// Bundles scripts/sim-test.ts with esbuild (ships with Vite) and runs it in Node.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'node_modules', '.cache', 'sim-test.mjs');
await build({ entryPoints: [path.join(root, 'scripts', 'sim-test.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
try { execFileSync('node', [out], { stdio: 'inherit' }); } catch { process.exit(1); }
