// Builds the Node perf harnesses (perf/*.ts) with Vite in SSR mode into
// perf/out/*.mjs, using the project's vite.config.ts (defines, ?raw), not
// minified, with source maps. node_modules stay external.
//
//   node perf/build-node.mjs node-ingest [node-profile …]

import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const names = process.argv.slice(2);
if (names.length === 0) names.push('node-ingest');
const input = Object.fromEntries(names.map((n) => [n, resolve(root, 'perf', `${n}.ts`)]));

await build({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  logLevel: 'warn',
  build: {
    ssr: true,
    outDir: resolve(root, 'perf/out'),
    emptyOutDir: false,
    minify: false,
    sourcemap: true,
    target: 'es2022',
    rollupOptions: { input, output: { format: 'es', entryFileNames: '[name].mjs' } },
  },
});
