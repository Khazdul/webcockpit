import { defineConfig, devices } from '@playwright/test';

// WC_E2E_PORT: another dev server port (parallel worktrees each run their own).
const port = Number(process.env.WC_E2E_PORT ?? 5173);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /phone.*\.spec\.ts$/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /phone.*\.spec\.ts$/ },
    // Stage 19 (ADR 0075): a phone (touch, mobile viewport) runs only the phone specs.
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /phone.*\.spec\.ts$/ },
  ],
});
