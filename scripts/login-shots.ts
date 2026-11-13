// The screenshots of round 54c (ADR 0141): the automatic login's question
// and its notices, on the phone's game layout at a phone's and a tablet's
// size, both ways up.
//
//   node scripts/login-shots.ts
//
// Writes docs/stages/img/54-c-<size>-<state>.png. Starts the dev server on
// WC_SHOT_PORT (default 5189) unless one answers there. MUME is the mocked
// login of the e2e specs (tests/e2e/mume-login-mock.ts): nothing connects
// to the live game.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Page, chromium } from '@playwright/test';
import { PAPER_PALETTE } from '../src/theme/presets.ts';
import { loginMock } from '../tests/e2e/mume-login-mock.ts';
import { devServer } from './lib/dev-server.ts';

const OUT = fileURLToPath(new URL('../docs/stages/img/', import.meta.url));
const PORT = Number(process.env.WC_SHOT_PORT ?? 5189);
const SIZES = {
  phone: { width: 390, height: 844 },
  'phone-land': { width: 844, height: 390 },
  tablet: { width: 820, height: 1180 },
  'tablet-land': { width: 1180, height: 820 },
} as const;
const PASSWORD = 'correct-horse-9';

const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const status = (page: Page, re: string) => page.locator(`.wc-app[data-status^="${re}"]`).waitFor();

async function visibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

mkdirSync(OUT, { recursive: true });
const server = await devServer(PORT);
const browser = await chromium.launch();
try {
  for (const [size, viewport] of Object.entries(SIZES)) {
    for (const light of size === 'phone' || size === 'tablet' ? [false, true] : [false]) {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, baseURL: `http://localhost:${PORT}` });
      const page = await ctx.newPage();
      const shot = async (state: string): Promise<void> => {
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${OUT}54-c-${size}-${state}${light ? '-paper' : ''}.png` });
        console.log(`54-c-${size}-${state}${light ? '-paper' : ''}.png`);
      };
      const m = await loginMock(page);
      await page.goto(size.startsWith('phone') ? '/?phone=1' : '/');
      await page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label').waitFor();
      if (light) await page.evaluate((ansi) => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000', ansi } }), [...PAPER_PALETTE]);
      await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
      await status(page, 'login');
      await page.locator('.wc-start').waitFor({ state: 'hidden', timeout: 20_000 });
      await field(page).tap();
      await page.keyboard.type('rasta');
      await page.keyboard.press('Enter');
      await page.locator('.wc-input-slot .wc-input-field.wc-masked').waitFor();
      await page.keyboard.type(PASSWORD);
      await page.keyboard.press('Enter');
      await page.locator('.wc-ph-ask').waitFor();
      // With our keyboard up (the login was typed with it), then with it folded.
      await shot('ask-keyboard');
      await page.locator('.wc-ph-okb-k[data-act="fold"]').tap();
      await shot('ask');
      if (!light) {
        await page.locator('.wc-ph-ask [data-act="yes"]').tap();
        await shot('armed');
        await visibility(page, 'hidden');
        void m.server().close();
        await status(page, 'disconnected');
        await visibility(page, 'visible');
        await status(page, 'playing');
        await shot('logged-in');
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server?.kill();
}
