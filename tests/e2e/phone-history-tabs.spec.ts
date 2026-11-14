// Stage 67 (ADR 0149 and its addendum) on a phone (touch): History's tab
// strip is a row of three equal tabs under Back, no key caps, 44 px
// touch targets; a tap changes tab; the Diary's book lays itself out for
// the lower page (its last line and folio inside the book); no sideways
// scroll; Back by tap. Portrait at 390 and 360 wide, and landscape.
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';
import { lookBox, morphDone } from './look';

const menuRow = (page: Page, key: string) => page.locator(`.wc-start .wc-frame:not([hidden]) .wc-sm-item[data-key="${key}"]`);
const tab = (page: Page, t: string) => lookBox(page).locator(`.wc-htab[data-tab="${t}"]`);
const onTab = (page: Page) => lookBox(page).locator('.wc-htab.is-on');
const fitsWidth = (page: Page): Promise<boolean> => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
}

for (const width of [390, 360]) {
  test(`portrait ${width} wide: three equal tabs under Back, taps change tab, the Diary fits the lower page, Back`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 844 });
    await pinDemoClock(page);
    await page.goto('/');
    await restoreDemo(page);
    await menuRow(page, 'history').tap();
    await expect(lookBox(page).locator('.wc-lk-hood-t')).toHaveText('History');
    await morphDone(page);
    await expect(onTab(page)).toHaveAttribute('data-tab', 'sessions');

    // Three equal tabs in one row under Back, no key caps, touch targets.
    await expect(lookBox(page).locator('.wc-htab .wc-htab-l')).toHaveText(['Sessions', 'Spotlights', 'Diary']);
    await expect(lookBox(page).locator('.wc-htab-k').first()).toBeHidden();
    const back = (await lookBox(page).locator('.wc-lk-back').boundingBox())!;
    const boxes = await Promise.all(['sessions', 'spotlights', 'diary'].map(async (t) => (await tab(page, t).boundingBox())!));
    for (const b of boxes) {
      expect(b.y).toBeGreaterThanOrEqual(back.y + back.height - 1);
      expect(Math.abs(b.y - boxes[0]!.y)).toBeLessThan(1);
      expect(Math.abs(b.width - boxes[0]!.width)).toBeLessThan(1.5);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    expect(await fitsWidth(page)).toBe(true);

    // Taps.
    await tab(page, 'spotlights').tap();
    await expect(onTab(page)).toHaveAttribute('data-tab', 'spotlights');
    await expect(lookBox(page).locator('.wc-spw-card')).toHaveCount(5);
    expect(await fitsWidth(page)).toBe(true);
    await tab(page, 'diary').tap();
    await expect(onTab(page)).toHaveAttribute('data-tab', 'diary');
    const book = lookBox(page).locator('.wc-cred-book');
    await expect(book).toHaveAttribute('data-ready', 'true');
    await expect(book).toHaveClass(/is-one/);
    // The book laid out for its height: the page's folio and the last line of the page inside the book.
    const bk = (await book.boundingBox())!;
    const folio = (await book.locator('.wc-cred-folio').first().boundingBox())!;
    expect(folio.y + folio.height).toBeLessThanOrEqual(bk.y + bk.height + 0.5);
    const lowest = await book.evaluate((el) => {
      const b = el.getBoundingClientRect();
      let max = 0;
      for (const p of el.querySelectorAll('.wc-cred-p, .wc-cred-open, .wc-cred-title')) {
        for (const r of p.getClientRects()) if (r.right > b.left && r.left < b.right && r.width > 0) max = Math.max(max, r.bottom);
      }
      return max - b.bottom;
    });
    expect(lowest).toBeLessThanOrEqual(0.5);
    expect(await fitsWidth(page)).toBe(true);

    await tab(page, 'sessions').tap();
    await expect(onTab(page)).toHaveAttribute('data-tab', 'sessions');
    await lookBox(page).locator('.wc-lk-back').tap();
    await expect(menuRow(page, 'history')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('landscape: the strip in Back\'s band, the three tabs reachable by tap', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await menuRow(page, 'history').tap();
  await morphDone(page);
  for (const t of ['spotlights', 'diary', 'sessions']) {
    await tab(page, t).tap();
    await expect(onTab(page)).toHaveAttribute('data-tab', t);
    const b = (await tab(page, t).boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
  expect(await fitsWidth(page)).toBe(true);
});
