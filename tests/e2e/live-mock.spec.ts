// The live connection path (`/` → Enter MUME) against a mocked MUME
// WebSocket: Playwright intercepts wss://mume.org/ws-play/, so nothing
// reaches the real server.
import { type Locator, type Page, expect, test } from '@playwright/test';

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

/**
 * The computed colour of `el`, the colour `color-mix(in oklab, fg p%, tint)`
 * resolves to against its `--term-fg`, and the plain fg, all as the browser
 * computes them.
 */
function mixColours(el: Locator, p: number, tint: string): Promise<{ got: string; want: string; plain: string }> {
  return el.evaluate(
    (e, [pct, t]) => {
      const probe = e.ownerDocument.createElement('span');
      const fg = getComputedStyle(e).getPropertyValue('--term-fg').trim();
      probe.style.color = `color-mix(in oklab, ${fg} ${pct}%, ${t})`;
      e.ownerDocument.body.appendChild(probe);
      const want = getComputedStyle(probe).color;
      probe.style.color = fg;
      const plain = getComputedStyle(probe).color;
      probe.remove();
      return { got: getComputedStyle(e).color, want, plain };
    },
    [p, tint] as const,
  );
}

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

  // The command echo and the input line are steel by default (ADR 0034,
  // 0035): the fg mixed with a light blue.
  await page.keyboard.type('look');
  await page.keyboard.press('Enter');
  await expect.poll(sentText).toContain('look\r\n');
  const echo = page.locator('.wc-rows .wc-echo').filter({ hasText: 'look' }).last();
  const field = page.locator('.wc-input-field');
  const prompt = page.locator('.wc-input-prompt');
  await expect(prompt).toHaveText('> ');
  const steel = await mixColours(echo, 55, '#7fb2e6');
  expect(steel.got).toBe(steel.want);
  expect(steel.got).not.toBe(steel.plain);
  for (const el of [field, prompt]) expect((await mixColours(el, 55, '#7fb2e6')).got).toBe(steel.want);

  // Appearance → Input color: Amber, then None (the plain fg).
  const menuSel = page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-mrow.is-sel');
  await page.keyboard.press('Escape');
  await page.locator('.wc-overlay .wc-mrow[data-key="options"] .wc-label').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown'); // past Mapper
  await page.keyboard.press('Enter'); // Appearance
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowDown');
  await expect(menuSel).toHaveText('<< Input color: Steel >>');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(menuSel).toHaveText('<< Input color: Amber >>');
  // The preview's echo line follows it.
  const amberPreview = await mixColours(page.locator('.wc-overlay .wc-preview-echo'), 15, '#ffaf00');
  expect(amberPreview.got).toBe(amberPreview.want);
  const amber = await mixColours(echo, 15, '#ffaf00');
  expect(amber.got).toBe(amber.want);
  expect(amber.got).not.toBe(steel.got);
  for (const el of [field, prompt]) expect((await mixColours(el, 15, '#ffaf00')).got).toBe(amber.want);
  await page.keyboard.press('ArrowRight'); // wraps
  await expect(menuSel).toHaveText('<< Input color: None >>');
  for (const el of [echo, field, prompt]) {
    const c = await mixColours(el, 55, '#7fb2e6');
    expect(c.got).toBe(c.plain);
  }
  // Back to the default for the rest of the test.
  await page.keyboard.press('ArrowRight');
  await expect(menuSel).toHaveText('<< Input color: Steel >>');
  await expect.poll(() => page.evaluate(() => window.__wc!.settings.get().appearance.inputColor)).toBe('steel');
  while (await page.locator('.wc-overlay').isVisible()) await page.keyboard.press('Escape');
  await expect(field).toBeFocused();

  await page.keyboard.type('#disconnect');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(page.locator('.wc-rows .wc-row').last()).toHaveText('[SYSTEM] Press Enter to reconnect.');
});
