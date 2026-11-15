import { rmSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Stage 61 part C: the sync's flows on two browser contexts against a real
// local Worker (`npm run test:sync-worker`). The dev server and `wrangler
// dev` are started together by scripts/dev-cloud.ts, with the flags
// `accounts`, `sync` and `runs` (stage 63; R2 is wrangler's local one) on and a local D1 of their own (made empty for every
// run, the migrations applied). Turnstile is Cloudflare's always-pass test
// pair (the Worker asks siteverify, so the run needs the network); the page
// gets the widget's stub. Not part of `npm run test:e2e`.
//
// Ports: WC_E2E_PORT (default 5424) for Vite, WC_API_PORT (default 8794)
// for the Worker; never 5173 or 8787, which are the owner's.

const port = Number(process.env.WC_E2E_PORT ?? 5424);
const apiPort = Number(process.env.WC_API_PORT ?? 8794);
const persist = '.wrangler/sync-worker-e2e';
// Once, before the servers start (the test workers load this file again: not there).
if (process.env.TEST_WORKER_INDEX === undefined) rmSync(persist, { recursive: true, force: true });

export default defineConfig({
  testDir: 'tests/e2e-worker',
  reporter: 'list',
  workers: 1,
  timeout: 180_000,
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `npm run dev:cloud -- --port ${port} --strictPort`,
    env: { WC_API_PORT: String(apiPort), WC_DEV_FLAGS: 'accounts,sync,runs', WC_DEV_PERSIST: persist },
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
