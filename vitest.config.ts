import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: { __WC_VERSION__: JSON.stringify(pkg.version), __WC_COMMIT__: JSON.stringify('dev') },
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Removes the run's transform directory from the temp directory (tests/setup/clean-tmp.ts).
    globalSetup: ['tests/setup/clean-tmp.ts'],
    // UI tests opt in per file with: // @vitest-environment happy-dom
  },
});
