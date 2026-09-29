import { defineConfig, devices } from '@playwright/test';

// Smoke test of a production build (ADR 0022, ADR 0028): the built
// directory served by a plain static file server (scripts/static-server.ts)
// with a host's headers, no Vite and no /__fixtures.
//   WC_PROD_DIR      the directory to serve (default dist; publish uses its staging dir)
//   WC_PROD_PORT     the port (default 4180)
//   WC_PROD_BASE     the base path the build was made for (default /; Pages: /webcockpit/)
//   WC_PROD_PROFILE  the host's headers: site (Tailscale/Caddy, default) or pages (GitHub Pages)
//   WC_PROD_URL      test a deployed site instead (no local server), e.g.
//                    https://example.ts.net:8443 or https://khazdul.github.io/webcockpit
//                    (its path is the base; WC_PROD_BASE is then ignored)
// The tests use paths relative to the base (`./release.json`, never
// `/release.json`), so baseURL always ends with the base and a slash.
const port = Number(process.env.WC_PROD_PORT ?? 4180);
const dir = process.env.WC_PROD_DIR ?? 'dist';
const profile = process.env.WC_PROD_PROFILE ?? 'site';
if (profile !== 'site' && profile !== 'pages') throw new Error(`WC_PROD_PROFILE: unknown profile ${profile}`);
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
          command: `node scripts/static-server.ts ${JSON.stringify(dir)} --port ${port} --base ${base} --profile ${profile}`,
          url: `http://127.0.0.1:${port}${base}`,
          reuseExistingServer: false,
        },
      }),
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
