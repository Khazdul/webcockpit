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
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
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
  // Desktop keeps the one <input type="text">, masked by the overlay (ADR 0075 §3.2 is phone only).
  expect(await page.locator('.wc-input-field').evaluate((e) => `${e.tagName}:${(e as HTMLInputElement).type}`)).toBe('INPUT:text');
  await page.keyboard.type('hunter2');
  await expect(page.locator('.wc-input-mask')).toHaveText('•••••••');
  // Selected (Ctrl+A), the password is still not painted (stage 53e): the selection of the masked
  // line has no text colour, and a tinted ground the bullets stay readable on.
  await page.keyboard.press('ControlOrMeta+a');
  const paint = await page.locator('.wc-input-field').evaluate((e: HTMLInputElement) => {
    const sel = getComputedStyle(e, '::selection');
    return { selected: e.selectionEnd! - e.selectionStart!, text: getComputedStyle(e).color, color: sel.color, background: sel.backgroundColor };
  });
  expect(paint.selected).toBe(7);
  expect(paint.text).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(paint.color).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(paint.background).not.toMatch(/^rgb\(/);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect.poll(sentText).toContain('hunter2\r\n');
  await expect(page.locator('.wc-output')).not.toContainText('hunter2');
});

test.describe('forced colours (a high contrast mode)', () => {
  test.use({ forcedColors: 'active' });

  test('the masked password line paints no password, selected or not', async ({ page }) => {
    await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
      ws.send(bytes([IAC, WILL, GMCP, IAC, WILL, ECHO], '\r\nBy what name do you wish to be known? '));
    });
    await enterMume(page);
    const field = page.locator('.wc-input-field');
    await expect(field).toHaveClass(/wc-masked/);
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    // What is painted of the line itself: the bullets' overlay and our caret are taken away, so
    // only the field's own text and selection are left. Two passwords of one length must then
    // give the same picture, or the text can be read.
    await page.addStyleTag({ content: '.wc-input-mask, .wc-caret { visibility: hidden !important; }' });
    const shot = () => page.locator('.wc-input-wrap').screenshot({ animations: 'disabled', caret: 'hide' });
    const shots: Record<string, Buffer> = {};
    for (const word of ['hunter2', 'WWWWWWW']) {
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type(word);
      await expect(field).toHaveValue(word);
      shots[`${word} plain`] = await shot();
      await page.keyboard.press('ControlOrMeta+a');
      expect(await field.evaluate((e: HTMLInputElement) => e.selectionEnd! - e.selectionStart!)).toBe(7);
      shots[`${word} selected`] = await shot();
    }
    expect(shots['hunter2 plain']!.equals(shots['WWWWWWW plain']!)).toBe(true);
    expect(shots['hunter2 selected']!.equals(shots['WWWWWWW selected']!)).toBe(true);
    // (The selection itself is painted: the two states differ, so the pictures do show the line.)
    expect(shots['hunter2 plain']!.equals(shots['hunter2 selected']!)).toBe(false);
    // The bullets are still what the player sees, in a colour the mode gives or keeps.
    await page.addStyleTag({ content: '.wc-input-mask { visibility: visible !important; }' });
    await expect(page.locator('.wc-input-mask')).toHaveText('•••••••');
    await expect(page.locator('.wc-input-mask')).toBeVisible();
    expect(await page.locator('.wc-input-mask').evaluate((e) => getComputedStyle(e).color)).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  });
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

  // The command echo and the input line are steel in the suite's stored
  // settings (Steel kept at today's settings version, ADR 0034, 0035; a new
  // install has Amber: input-color-default.spec.ts): the fg mixed with a light blue.
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

  // Settings → Appearance → Input colour (ADR 0107): Amber, then None (the plain fg).
  const dd = page.locator('.wc-sp-settings .wc-ck-dd[aria-label="Input colour"]');
  const pick = async (label: string) => {
    await dd.click();
    await page.locator('.wc-ck-list .wc-ck-opt', { hasText: label }).click();
  };
  await page.locator('.wc-mb[data-mb="settings"]').click();
  await expect(dd).toContainText('Steel');
  await pick('Amber');
  await expect(dd).toContainText('Amber');
  const amber = await mixColours(echo, 15, '#ffaf00');
  expect(amber.got).toBe(amber.want);
  expect(amber.got).not.toBe(steel.got);
  for (const el of [field, prompt]) expect((await mixColours(el, 15, '#ffaf00')).got).toBe(amber.want);
  // The preview's echo line follows it.
  const previewEcho = page.locator('.wc-sp-preview span', { hasText: /^north$/ }).first();
  expect(await previewEcho.evaluate((e) => getComputedStyle(e).color)).toBe(amber.want);
  await pick('None');
  await expect(dd).toContainText('None');
  for (const el of [echo, field, prompt]) {
    const c = await mixColours(el, 55, '#7fb2e6');
    expect(c.got).toBe(c.plain);
  }
  // Back to the default for the rest of the test.
  await pick('Steel');
  await expect.poll(() => page.evaluate(() => window.__wc!.settings.get().appearance.inputColor)).toBe('steel');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-pop')).toHaveCount(0);
  await expect(field).toBeFocused();

  await page.keyboard.type('#disconnect');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(page.locator('.wc-rows .wc-row').last()).toHaveText('[SYSTEM] Press Enter to reconnect.');
});
