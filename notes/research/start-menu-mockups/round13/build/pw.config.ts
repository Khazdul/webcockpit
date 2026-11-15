// The capture's own Playwright config (round 13 mockups): the dev server on
// port 5471 (never 5173), started by hand; one worker; chromium only.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /capture\.spec\.ts$/,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5471', browserName: 'chromium' },
});
