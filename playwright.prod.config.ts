import { defineConfig, devices } from '@playwright/test';

// Smoke test of a production build (ADR 0028, ADR 0029): the built
// directory served by a plain static file server with GitHub Pages'
// headers (scripts/static-server.ts), no Vite and no /__fixtures.
//   WC_PROD_DIR      the directory to serve (default dist; build:pages uses dist-pages)
//   WC_PROD_PORT     the port (default 4180)
//   WC_PROD_BASE     the base path the build was made for (default /)
//   WC_PROD_URL      test a deployed site instead (no local server), e.g.
//                    https://mumecockpit.com
//                    (its path is the base; WC_PROD_BASE is then ignored)
//   WC_PROD_BROWSERS comma-separated projects to run (default chromium,firefox);
//                    CI runs chromium only: its runners have no GPU, so
//                    Firefox's worker gets no WebGL and the map is unsupported
// The tests use paths relative to the base (`./release.json`, never
// `/release.json`), so baseURL always ends with the base and a slash.
const browsers = (process.env.WC_PROD_BROWSERS ?? 'chromium,firefox').split(',').map((b) => b.trim());
const port = Number(process.env.WC_PROD_PORT ?? 4180);
const dir = process.env.WC_PROD_DIR ?? 'dist';
const base = `/${(process.env.WC_PROD_BASE ?? '/').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
const remote = process.env.WC_PROD_URL ? `${process.env.WC_PROD_URL.replace(/\/+$/, '')}/` : undefined;

export default defineConfig({
  testDir: 'tests/e2e-prod',
  reporter: 'list',
  use: { baseURL: remote ?? `http://127.0.0.1:${port}${base}` },
  ...(remote
    ? {}
    : {
        webServer: {
          command: `node scripts/static-server.ts ${JSON.stringify(dir)} --port ${port} --base ${base}`,
          url: `http://127.0.0.1:${port}${base}`,
          reuseExistingServer: false,
        },
      }),
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ].filter((p) => browsers.includes(p.name)),
});
