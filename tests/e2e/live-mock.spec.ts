// The live connection path (`/` → Enter MUME) against a mocked MUME
// WebSocket: Playwright intercepts wss://mume.org/ws-play/, so nothing
// reaches the real server.
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const DO = 253;
const SB = 250;
const SE = 240;
const GMCP = 201;
const ECHO = 1;

const bytes = (...parts: (number[] | string)[]): Buffer =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));
const gmcp = (payload: string) => bytes([IAC, SB, GMCP], payload, [IAC, SE]);

/** Opens the start page and enters MUME (Enter MUME is pre-selected). */
async function enterMume(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.keyboard.press('Enter');
}

test('connects, logs in, and masks the password', async ({ page }) => {
  const received: Buffer[] = [];
  let protocols: string[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    protocols = ws.protocols();
    ws.onMessage((m) => received.push(typeof m === 'string' ? Buffer.from(m) : m));
    ws.send(bytes([IAC, WILL, GMCP, IAC, WILL, ECHO], '\r\nBy what name do you wish to be known? '));
  });
  const sentText = () => Buffer.concat(received).toString('latin1');

  await enterMume(page);
  const status = page.locator('.wc-app');
  const rows = page.locator('.wc-rows .wc-row');
  await expect(status).toHaveAttribute('data-status', /^login/);
  await expect(rows.filter({ hasText: '[SYSTEM] Connected.' })).toHaveCount(1);
  await expect(page.locator('.wc-partial')).toHaveText(/By what name/);
  expect(protocols).toEqual(['binary']);

  // DO GMCP and the handshake went out.
  await expect.poll(sentText).toContain(Buffer.from([IAC, DO, GMCP]).toString('latin1'));
  await expect.poll(sentText).toContain('Core.Supports.Set');
  await expect.poll(sentText).toContain('MUME.Client.XML {"enable":true,"silent":true}');

  // WILL ECHO arrived: the input is masked, the secret is sent but not shown.
  await expect(page.locator('.wc-input-field')).toHaveClass(/wc-masked/);
  await page.keyboard.type('hunter2');
  await expect(page.locator('.wc-input-mask')).toHaveText('•••••••');
  await page.keyboard.press('Enter');
  await expect.poll(sentText).toContain('hunter2\r\n');
  await expect(page.locator('.wc-output')).not.toContainText('hunter2');
});

test('reaches playing on Char.Name and sends the width commands', async ({ page }) => {
  const received: Buffer[] = [];
  let server: { send(b: Buffer): void; close(): Promise<void> } | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => received.push(typeof m === 'string' ? Buffer.from(m) : m));
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  const sentText = () => Buffer.concat(received).toString('latin1');
  await enterMume(page);
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect.poll(sentText).toContain('Core.Hello');
  server!.send(gmcp('Char.Name {"name":"Tester","fullname":"Tester the Mock"}'));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing · Tester/);
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Tester logged in.' })).toHaveCount(1);
  await expect.poll(sentText).toContain('change width all 500\r\n');

  // The command echo is steel (ADR 0034): the fg mixed with a light blue.
  await page.keyboard.type('look');
  await page.keyboard.press('Enter');
  await expect.poll(sentText).toContain('look\r\n');
  const echo = page.locator('.wc-rows .wc-echo').filter({ hasText: 'look' }).last();
  const c = await echo.evaluate((el) => {
    const probe = el.ownerDocument.createElement('span');
    const fg = getComputedStyle(el).getPropertyValue('--term-fg').trim();
    probe.style.color = `color-mix(in oklab, ${fg} 55%, #7fb2e6)`;
    el.parentElement!.appendChild(probe);
    const want = getComputedStyle(probe).color;
    probe.style.color = fg;
    const plain = getComputedStyle(probe).color;
    probe.remove();
    return { got: getComputedStyle(el).color, want, plain };
  });
  expect(c.got).toBe(c.want);
  expect(c.got).not.toBe(c.plain);

  await page.keyboard.type('#disconnect');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(page.locator('.wc-rows .wc-row').last()).toHaveText('[SYSTEM] Press Enter to reconnect.');
});
