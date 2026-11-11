// Bundle a TS script with esbuild (ships with Vite) and run it: node scripts/run-ts.mjs scripts/x.ts
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const entry = process.argv[2];
const out = path.join('node_modules', '.cache', path.basename(entry, '.ts') + '.mjs');
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
try { execFileSync('node', [out], { stdio: 'inherit' }); } catch { process.exit(1); }
