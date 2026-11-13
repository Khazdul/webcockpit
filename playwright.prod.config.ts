import { defineConfig, devices } from '@playwright/test';

// Smoke test of a production build (ADR 0028, ADR 0029, ADR 0144): the
// built directory served by a plain static file server that stands in for
// the host (scripts/static-server.ts), no Vite and no /__fixtures.
//   WC_PROD_PROFILE  the host: `cloudflare` (default; the Worker with static
//                    assets, its headers and /api) or `pages` (GitHub Pages).
//                    Chooses the local server's behaviour and what the tests
//                    expect. With WC_PROD_URL it says what the deployed site
//                    is: a workers.dev address is `cloudflare`, and
//                    https://mumecockpit.com is still `pages` until the
//                    switch of stage 58 (then `cloudflare`).
//   WC_PROD_DIR      the directory to serve (default dist; build:site uses
//                    dist-site, build:pages dist-pages)
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
const profile = process.env.WC_PROD_PROFILE || 'cloudflare';
if (profile !== 'cloudflare' && profile !== 'pages') throw new Error(`WC_PROD_PROFILE is cloudflare or pages, not ${profile}`);
// The tests read it (tests/e2e-prod/profile.ts); the workers inherit the environment.
process.env.WC_PROD_PROFILE = profile;
const remote = process.env.WC_PROD_URL ? `${process.env.WC_PROD_URL.replace(/\/+$/, '')}/` : undefined;

export default defineConfig({
  testDir: 'tests/e2e-prod',
  reporter: 'list',
  use: { baseURL: remote ?? `http://127.0.0.1:${port}${base}` },
  ...(remote
    ? {}
    : {
        webServer: {
          command: `node scripts/static-server.ts ${JSON.stringify(dir)} --port ${port} --base ${base} --profile ${profile}`,
          url: `http://127.0.0.1:${port}${base}`,
          reuseExistingServer: false,
        },
      }),
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ].filter((p) => browsers.includes(p.name)),
});
