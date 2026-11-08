// Renders a composition to out/<kebab-name>.mp4 (settings in remotion.config.ts):
//
//   npm run render -- TestBree          out/test-bree.mp4
//   npm run render -- TestBree --concurrency 8   (other flags go to `remotion render`)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [id, ...rest] = process.argv.slice(2);
if (!id) throw new Error('usage: npm run render -- <composition> [remotion render flags]');
const name = id.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const cwd = fileURLToPath(new URL('..', import.meta.url));
const t = Date.now();
const r = spawnSync('npx', ['remotion', 'render', 'src/index.ts', id, `out/${name}.mp4`, ...rest], { cwd, stdio: 'inherit' });
console.log(`render took ${((Date.now() - t) / 1000).toFixed(1)} s`);
process.exitCode = r.status ?? 1;
