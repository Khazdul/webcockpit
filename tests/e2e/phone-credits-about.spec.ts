// Stage 47 (ADR 0132) on a phone (touch): Credits one page at a time,
// turned by a touch swipe (real touch events through CDP), the pills and
// the buttons by tap; About's contents rail as a strip of section pills;
// both fit at 390 and 360 wide (no sideways page scroll), Back by tap.
import { type Page, expect, test } from '@playwright/test';
import { restoreChronicle } from './chronicle';
import { pinDemoClock } from './demo-clock';
import { lookBox, morphDone } from './look';

const menuRow = (page: Page, key: string) => page.locator(`.wc-start .wc-frame:not([hidden]) .wc-sm-item[data-key="${key}"]`);
const book = (page: Page) => lookBox(page).locator('.wc-cred-book');
const lit = (page: Page) => lookBox(page).locator('.wc-lk-seg[aria-label="Chapters"] .wc-lk-opt[aria-checked="true"]');
const fitsWidth = (page: Page): Promise<boolean> => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** A one-finger swipe across the book's middle, `dx` px sideways, as real touch events. */
async function swipe(page: Page, dx: number): Promise<void> {
  const b = (await book(page).boundingBox())!;
  const y = Math.round(b.y + b.height / 2);
  const x0 = Math.round(b.x + b.width / 2 - dx / 2);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 6; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x0 + (dx * i) / 6), y: y + i }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

for (const width of [390, 360]) {
  test(`Credits on a phone, ${width} wide: one page, a swipe turns, taps on the pills and buttons, Back`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await pinDemoClock(page);
    await page.goto('/');
    await expect(menuRow(page, 'credits')).toBeVisible();
    await restoreChronicle(page, ['Aragorn', 'Boromir', 'Celeborn'], 12);
    await menuRow(page, 'credits').tap();
    await expect(lookBox(page).locator('.wc-lk-hood-t')).toHaveText('Credits');
    await morphDone(page);
    await expect(book(page)).toHaveAttribute('data-ready', 'true');
    await expect(book(page)).toHaveClass(/is-one/);
    await expect(book(page).locator('.wc-cred-folio')).toHaveText(['— 1 —']);
    expect(await fitsWidth(page)).toBe(true);
    await expect(book(page).locator('.wc-cred-open')).toBeInViewport();

    // A swipe to the left turns forward, to the right back; a short one does nothing.
    await swipe(page, -160);
    await expect(book(page)).toHaveAttribute('data-spread', '1');
    await expect(book(page).locator('.wc-cred-folio')).toHaveText(['— 2 —']);
    await swipe(page, -160);
    await expect(book(page)).toHaveAttribute('data-spread', '2');
    await swipe(page, 160);
    await expect(book(page)).toHaveAttribute('data-spread', '1');
    await swipe(page, -20);
    await page.waitForTimeout(400);
    await expect(book(page)).toHaveAttribute('data-spread', '1');

    // Next and Previous by tap; a pill by tap.
    await lookBox(page).locator('.wc-lk-btn[data-btn="next"]').tap();
    await expect(book(page)).toHaveAttribute('data-spread', '2');
    await lookBox(page).locator('.wc-lk-btn[data-btn="prev"]').tap();
    await expect(book(page)).toHaveAttribute('data-spread', '1');
    await lookBox(page).locator('.wc-lk-opt[data-opt="Celeborn"]').tap();
    await expect(lit(page)).toHaveText('Celeborn');
    await expect(book(page).locator('.wc-cred-ch[data-ch="Celeborn"] .wc-cred-title')).toBeInViewport();
    // The pills and the foot fit inside the screen.
    for (const sel of ['.wc-cred-head', '.wc-cred-foot', '.wc-cred-book']) {
      const r = (await lookBox(page).locator(sel).boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(width + 0.5);
    }
    expect(await fitsWidth(page)).toBe(true);

    // Back by tap.
    await lookBox(page).locator('.wc-lk-back').tap();
    await expect(menuRow(page, 'credits')).toBeVisible();
  });

  test(`About on a phone, ${width} wide: the strip of section pills, a tap jumps, Back`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await menuRow(page, 'about').tap();
    await expect(lookBox(page).locator('.wc-lk-hood-t')).toHaveText('About');
    await morphDone(page);
    const strip = lookBox(page).locator('.wc-lk-seg[aria-label="Contents"]');
    await expect(lookBox(page).locator('.wc-about-rail')).toBeHidden();
    await expect(strip).toBeVisible();
    await expect(strip.locator('.wc-lk-opt')).toHaveCount(9);
    await expect(strip.locator('.wc-lk-opt[aria-checked="true"]')).toHaveAttribute('data-opt', 'intro');
    await expect(lookBox(page).locator('.wc-about-ver')).toBeVisible();
    expect(await fitsWidth(page)).toBe(true);
    // The strip clears Back.
    const back = (await lookBox(page).locator('.wc-lk-back').boundingBox())!;
    const s = (await strip.boundingBox())!;
    expect(s.y).toBeGreaterThanOrEqual(back.y + back.height - 1);

    // A tap on a pill jumps; the chosen pill is kept in view in the strip.
    await strip.locator('.wc-lk-opt[data-opt="licence"]').tap();
    await expect(strip.locator('.wc-lk-opt[aria-checked="true"]')).toHaveAttribute('data-opt', 'licence');
    await expect(lookBox(page).locator('[data-sec="licence"] .wc-about-h')).toBeInViewport();
    await expect(strip.locator('.wc-lk-opt[data-opt="licence"]')).toBeInViewport();
    await strip.locator('.wc-lk-opt[data-opt="credits"]').tap();
    await expect(strip.locator('.wc-lk-opt[aria-checked="true"]')).toHaveAttribute('data-opt', 'credits');
    await expect(lookBox(page).locator('[data-sec="credits"] .wc-about-h')).toBeInViewport();
    expect(await fitsWidth(page)).toBe(true);

    await lookBox(page).locator('.wc-lk-back').tap();
    await expect(menuRow(page, 'about')).toBeVisible();
  });
}
