// Stage 16: the bundled readability script over the mocked MUME
// WebSocket rewrites a mob line, and its adaptive colours (ADR 0068)
// follow a background change in the scrollback, with no re-render.
import { type Page, expect, test } from '@playwright/test';
import type { WebSocketRoute } from '@playwright/test';
import { adaptFg } from '../../src/theme/adaptive';
import { hexToRgb } from '../../src/theme/color';
import { PAPER_PALETTE } from '../../src/theme/presets';

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;

const bytes = (...parts: (number[] | string)[]): Buffer =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));
const gmcp = (payload: string) => bytes([IAC, SB, GMCP], payload, [IAC, SE]);

const css = (hex: string): string => {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
};

async function command(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** Each span's text and computed colour in the output row with `text`. */
const spans = (page: Page, text: string) =>
  page.locator('.wc-rows .wc-row', { hasText: text }).last().evaluate((row) =>
    [...row.querySelectorAll('span')].map((s) => [s.textContent, getComputedStyle(s).color]),
  );

test('readability: a mob line is rewritten, and its colours adapt to a new background', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage(() => {});
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.keyboard.press('Enter');
  await expect.poll(() => server !== null).toBe(true);
  server!.send(gmcp('Char.Name {"name":"Rasta","fullname":"Rasta the Orc"}'));

  await command(page, '#script enable readability');
  await expect(page.locator('.wc-rows')).toContainText('Script readability turned on.');
  server!.send(bytes('A huge, black bear is here, proud heir to the great and ancient mountain bears.\r\n'));
  server!.send(bytes('A young troll leaves north.\r\n'));
  server!.send(bytes('Exits: (north), east.\r\n'));

  const rows = page.locator('.wc-rows');
  await expect(rows).toContainText('The huge, black bear is here.');
  await expect(rows).not.toContainText('proud heir');
  await expect(rows).toContainText('A young troll leaves north ▲');

  // On black Cockpit's colours are kept as they are.
  await expect.poll(() => spans(page, 'The huge, black bear')).toEqual([
    ['The huge, black bear', css('#f0c850')],
    [' is here.', css(adaptFg('#6e6e6e', '#000000'))],
  ]);
  expect((await spans(page, 'Exits:')).filter(([t]) => t === 'north' || t === 'east')).toEqual([
    ['north', css('#3fb0a0')],
    ['east', css('#3fb0a0')],
  ]);

  // Paper: the same rows, darkened to read at 4.5:1.
  await page.evaluate(
    (ansi) => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000', ansi } }),
    [...PAPER_PALETTE],
  );
  await expect.poll(() => spans(page, 'The huge, black bear')).toEqual([
    ['The huge, black bear', css(adaptFg('#f0c850', '#f4ecd8'))],
    [' is here.', css(adaptFg('#6e6e6e', '#f4ecd8'))],
  ]);
  expect(css(adaptFg('#f0c850', '#f4ecd8'))).not.toBe(css('#f0c850'));
  expect((await spans(page, 'leaves north')).find(([t]) => t === 'north ▲')).toEqual(['north ▲', css(adaptFg('#3fb0a0', '#f4ecd8'))]);

  // Teal on the teal theme: lifted from the base.
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#002b36' } }));
  await expect
    .poll(async () => (await spans(page, 'leaves north')).find(([t]) => t === 'north ▲')?.[1])
    .toBe(css(adaptFg('#3fb0a0', '#002b36')));

  // Short names off: MUME's own text, the name still gold.
  await command(page, '#script set readability shortnames off');
  await expect(rows).toContainText('readability: shortnames = false');
  server!.send(bytes('A huge, black bear is here, proud heir to the great and ancient mountain bears.\r\n'));
  await expect(rows).toContainText('A huge, black bear is here, proud heir');
  expect((await spans(page, 'proud heir'))[0]).toEqual(['A huge, black bear', css(adaptFg('#f0c850', '#002b36'))]);
  expect(errors).toEqual([]);
});
