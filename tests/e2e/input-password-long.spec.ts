// Stage 53, round 53k: a password longer than the command line. The bullets
// are drawn in an element over the field (src/ui/input-pane.ts, "Password
// mode"); they stay in the field's box when the line scrolls, the last ones
// at the caret, on a computer as on the phone
// (tests/e2e/phone-round-53k-input.spec.ts). Against a mocked MUME
// WebSocket: nothing reaches the real server.
import { type Locator, type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;
const ECHO = 1;

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

test('desktop: a password longer than the line scrolls its bullets inside the field; the last ones show at the caret', async ({ page }) => {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP, IAC, WILL, ECHO]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.setViewportSize({ width: 700, height: 600 });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.keyboard.press('Enter');
  const field = page.locator('.wc-input-field');
  const mask = page.locator('.wc-input-mask');
  await expect(field).toHaveClass(/wc-masked/);
  await expect(field).toBeFocused();
  // A short one first: the bullets start at the field's start.
  await page.keyboard.type('abc');
  await expect(mask).toHaveText('•••');
  await frames(page);
  const f = await box(field);
  const glyph = (at: number) =>
    mask.evaluate((el, at) => {
      const r = document.createRange();
      r.setStart(el.firstChild!, at);
      r.setEnd(el.firstChild!, at + 1);
      const b = r.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    }, at);
  expect(Math.abs((await glyph(0)).x - f.x)).toBeLessThanOrEqual(0.5);
  // Far longer than the line.
  const n = 3 + 240;
  await page.keyboard.insertText('x'.repeat(240));
  await expect(mask).toHaveText('•'.repeat(n));
  await frames(page);
  expect(await field.evaluate((el: HTMLInputElement) => el.scrollLeft)).toBeGreaterThan(0);
  // The bullets' element has not moved off the field (it clips them to it) ...
  const mk = await box(mask);
  expect(Math.abs(mk.x - f.x)).toBeLessThanOrEqual(0.5);
  expect(mk.x + mk.width).toBeLessThanOrEqual(f.x + f.width + 0.5);
  expect(await mask.evaluate((el) => getComputedStyle(el).overflowX)).toBe('hidden');
  // ... the first are scrolled out of it, and the last stands in it with the caret after it.
  const first = await glyph(0);
  const last = await glyph(n - 1);
  expect(first.x + first.width).toBeLessThanOrEqual(f.x + 0.5);
  expect(last.x).toBeGreaterThanOrEqual(f.x);
  expect(last.x + last.width).toBeLessThanOrEqual(f.x + f.width + 0.5);
  const caret = await box(page.locator('.wc-input .wc-caret'));
  expect(Math.abs(caret.x - (last.x + last.width))).toBeLessThanOrEqual(0.75);
  // Home: back at the start, the bullets with it.
  await page.keyboard.press('Home');
  await expect.poll(() => field.evaluate((el: HTMLInputElement) => el.scrollLeft)).toBe(0);
  await frames(page);
  expect(Math.abs((await glyph(0)).x - f.x)).toBeLessThanOrEqual(0.5);
});
