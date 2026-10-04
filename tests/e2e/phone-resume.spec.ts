// Stage 19 (ADR 0075 §3.4): back from the background on a phone, the app
// checks the MUME link at once. A link that does not answer a Core.Ping
// within 3 s is dropped, and the ESC menu opens with Reconnect selected.
// The background is simulated by dispatching `visibilitychange`.
import { type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;

const bytes = (...parts: (number[] | string)[]): Buffer =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));
const gmcp = (payload: string) => bytes([IAC, SB, GMCP], payload, [IAC, SE]);

/** Enters MUME on `?phone=1` against a mock that answers pings while `answer()`. */
async function play(page: Page, answer: () => boolean): Promise<{ pings: () => number; server: () => WebSocketRoute }> {
  let server: WebSocketRoute | null = null;
  let pings = 0;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => {
      const text = (typeof m === 'string' ? Buffer.from(m) : m).toString('latin1');
      if (!text.includes('Core.Ping')) return;
      pings++;
      if (answer()) ws.send(gmcp('Core.Ping'));
    });
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.locator('.wc-start .wc-mrow[data-key="enter"] .wc-label').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  server!.send(gmcp('Char.Name {"name":"Tester","fullname":"Tester the Mock"}'));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  return { pings: () => pings, server: () => server! };
}

const resume = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const menuSel = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-mrow.is-sel');

test('a dead link on resume: dropped within seconds, menu with Reconnect selected', async ({ page }) => {
  const m = await play(page, () => false);
  await resume(page);
  await expect.poll(m.pings).toBe(1);
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: 'Connection closed: connection lost while in the background' })).toHaveCount(1, { timeout: 6_000 });
  await expect(page.locator('.wc-overlay')).toBeVisible();
  await expect(menuSel(page)).toHaveText('<< Reconnect >>');
});

test('a live link on resume is kept', async ({ page }) => {
  const m = await play(page, () => true);
  await resume(page);
  await expect.poll(m.pings).toBe(1);
  await page.waitForTimeout(4_000);
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  await expect(page.locator('.wc-overlay')).toBeHidden();
});
