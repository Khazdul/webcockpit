import { readFileSync } from 'node:fs';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Two projects (`npm test` runs both; `vitest run --project unit` one):
//   unit    the client and the scripts, in Node
//   worker  worker/ in the Workers runtime (workerd), through
//           @cloudflare/vitest-plugin (ADR 0144)
export default defineConfig({
  test: {
    // Removes the run's transform directory from the temp directory (tests/setup/clean-tmp.ts).
    globalSetup: ['tests/setup/clean-tmp.ts'],
    projects: [
      {
        define: { __WC_VERSION__: JSON.stringify(pkg.version), __WC_COMMIT__: JSON.stringify('dev') },
        oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
          environment: 'node',
          // UI tests opt in per file with: // @vitest-environment happy-dom
        },
      },
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: './worker/test/wrangler.jsonc' },
            // The D1 migrations, applied to the test database by worker/test/setup.ts.
            miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations('./worker/migrations') } },
          })),
        ],
        test: {
          name: 'worker',
          include: ['worker/test/**/*.test.ts'],
          setupFiles: ['worker/test/setup.ts'],
        },
      },
    ],
  },
});
