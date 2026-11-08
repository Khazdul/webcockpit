// Renders a composition (settings in remotion.config.ts) to a ProRes 4444
// master, then makes the films from it (record/master.ts):
//
//   npm run render -- Part1             out/part1-master.mov → out/part1.mp4, part1-4k.mp4, part1-h264.mp4
//   npm run render -- Part1 --no-4k     without the 4K variant
//   npm run render -- Film --out webcockpit-demo   out/webcockpit-demo-master.mov → webcockpit-demo.mp4, …
//   npm run render -- Part1 --concurrency 8   (other flags go to `remotion render`)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [id, ...rest] = process.argv.slice(2);
if (!id) throw new Error('usage: npm run render -- <composition> [--no-4k] [remotion render flags]');
const cwd = fileURLToPath(new URL('..', import.meta.url));
const no4k = rest.includes('--no-4k');
// --out <name>: the files' name (default: the composition's, in kebab case)
const oi = rest.indexOf('--out');
const name = oi >= 0 ? rest[oi + 1]! : id.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const flags = rest.filter((f, i) => f !== '--no-4k' && i !== oi && i !== oi + 1);
const t = Date.now();
const r = spawnSync('npx', ['remotion', 'render', 'src/index.ts', id, `out/${name}-master.mov`, ...flags], { cwd, stdio: 'inherit' });
console.log(`render took ${((Date.now() - t) / 1000).toFixed(1)} s`);
if (r.status !== 0) process.exit(r.status ?? 1);
const m = spawnSync('node', ['record/master.ts', `out/${name}-master.mov`, `out/${name}`, ...(no4k ? ['--no-4k'] : [])], { cwd, stdio: 'inherit' });
console.log(`render and masters took ${((Date.now() - t) / 1000).toFixed(1)} s`);
process.exitCode = m.status ?? 1;
