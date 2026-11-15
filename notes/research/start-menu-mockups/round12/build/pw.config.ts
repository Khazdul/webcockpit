// The capture's own Playwright config (round 12 mockups): the dev server on
// port 5461 (never 5173), started by hand; one worker; chromium only.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /capture\.spec\.ts$/,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5461', browserName: 'chromium' },
});
