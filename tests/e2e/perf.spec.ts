// `#perf`, the latency monitor (ADR 0047), on the live path against a
// mocked MUME WebSocket (as live-mock.spec.ts): keys that send, output
// frames, then the report, the worst moments and a reset; the live
// overlay (`#perf` alone, ADR 0135): on, its figures, kept over a reload,
// off.
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;

const bytes = (...parts: (number[] | string)[]): Buffer =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));
const gmcp = (payload: string) => bytes([IAC, SB, GMCP], payload, [IAC, SE]);

async function enterMume(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.keyboard.press('Enter');
}

test('#perf report summarises key -> send and output frames; worst; reset', async ({ page, browserName }) => {
  const received: Buffer[] = [];
  let server: { send(b: Buffer): void } | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => received.push(typeof m === 'string' ? Buffer.from(m) : m));
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  const sentText = () => Buffer.concat(received).toString('latin1');
  const rows = page.locator('.wc-rows .wc-row');
  const field = page.locator('.wc-input-field');
  const type = async (text: string): Promise<void> => {
    await field.fill(text);
    await page.keyboard.press('Enter');
  };
  await enterMume(page);
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  server!.send(gmcp('Char.Name {"name":"Tester","fullname":"Tester the Mock"}'));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing · Tester/);
  // The session's profile load would replace the macro defined below.
  await expect(rows.filter({ hasText: '[SYSTEM] Profile default loaded.' })).toHaveCount(1);

  // A rule that would match the summary must not fire on it.
  await type('#action {key} {#showme FIRED};#macro {F2} {say hi}');
  for (const c of ['look', 'score', 'inventory']) {
    await type(c);
    await expect.poll(sentText).toContain(`${c}\r\n`);
    server!.send(bytes(`You ${c}.\r\n`));
    await expect(rows.filter({ hasText: `You ${c}.` })).toHaveCount(1);
  }
  await page.keyboard.press('F2');
  await expect.poll(sentText).toContain('say hi\r\n');

  await type('#perf report');
  const head = rows.filter({ hasText: /^#perf last \d+s, (firefox|chrome) \d+, pixel ratio [\d.]+$/ });
  await expect(head).toHaveCount(1);
  await expect(head).toHaveClass(/wc-msg/);
  await expect(rows.filter({ hasText: /^ {2}measure +count +median +p95 +p99 +max$/ })).toHaveCount(1);
  // Three typed lines and a macro, each sent from its keydown.
  await expect(rows.filter({ hasText: /^ {2}key -> send +4( +[\d.]+){4} ms$/ })).toHaveCount(1);
  await expect(rows.filter({ hasText: /^ {2}frame script +[1-9]\d* / })).toHaveCount(1);
  await expect(rows.filter({ hasText: /^ {2}received -> shown +[1-9]\d* / })).toHaveCount(1);
  await expect(rows.filter({ hasText: /^ {2}socket buffer +[1-9]\d* .* B$/ })).toHaveCount(1);
  const loaf = rows.filter({ hasText: /^ {2}long frames / });
  if (browserName === 'firefox') await expect(loaf).toContainText('chromium only');
  else await expect(loaf).not.toContainText('chromium only');
  await expect(rows.filter({ hasText: /^FIRED$/ })).toHaveCount(0);

  await type('#perf worst');
  await expect(rows.filter({ hasText: '#perf worst, slowest first' })).toHaveCount(1);
  const moment = /^ {2}\d\d:\d\d:\d\d +\d+s ago {2}(key -> send|frame script|received -> shown|input delay|long frame) +[\d.]+ ms/;
  await expect(rows.filter({ hasText: moment }).first()).toBeVisible();

  await type('#perf reset');
  await expect(rows.filter({ hasText: /^#perf cleared$/ })).toHaveCount(1);
  await type('#perf rep');
  await expect(rows.filter({ hasText: /^#perf last/ })).toHaveCount(2);
  await expect(rows.filter({ hasText: /^ {2}key -> send +0 / })).toHaveCount(1);
  await type('#perf bogus');
  await expect(rows.filter({ hasText: '[SYSTEM] Usage: #perf [report | worst | reset]' })).toHaveCount(1);
  expect(sentText()).not.toContain('#perf');
});

test('#perf alone turns the live overlay on and off; it stays on in the tab', async ({ page }) => {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.onMessage(() => undefined);
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  const rows = page.locator('.wc-rows .wc-row');
  const field = page.locator('.wc-input-field');
  const overlay = page.locator('.wc-perf-overlay');
  const type = async (text: string): Promise<void> => {
    await field.fill(text);
    await page.keyboard.press('Enter');
  };
  await enterMume(page);
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(overlay).toHaveCount(0);

  await type('#perf');
  await expect(rows.filter({ hasText: /^#perf overlay on$/ })).toHaveCount(1);
  await expect(overlay).toBeVisible();
  // Live figures within a few updates: the frame rate is a number.
  await expect(overlay).toContainText(/^fps +\d+$/m);
  await expect(overlay).toContainText(/^worst frame 5 s +[\d.]+ ms$/m);
  await expect(overlay).toContainText(/^received -> shown /m);
  await expect(overlay).toContainText(/^key -> send /m);
  // It takes no pointer, focus or keys: the input keeps them.
  await expect(overlay).toHaveCSS('pointer-events', 'none');
  await expect(overlay).toHaveAttribute('aria-hidden', 'true');
  await expect(field).toBeFocused();

  // Remembered for the tab's session.
  await page.reload();
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(overlay).toBeVisible();

  await type('#perf');
  await expect(rows.filter({ hasText: /^#perf overlay off$/ })).toHaveCount(1);
  await expect(overlay).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('wc.perfOverlay'))).toBeNull();
});
