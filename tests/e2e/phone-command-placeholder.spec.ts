// The command field's "Command" after the line was typed in and erased (0.16.0, the owner on an
// iPad in landscape: only "Co" showed, the rest cut off on the right).
//
// iPad Safari laid out the one-row textarea's own placeholder wrongly once the line had held
// text; Chromium and Firefox do not, so this spec cannot show Safari's fault itself. What it
// holds is the fix: the text on screen is our own span (`.wc-input-ph`, src/phone/index.ts
// `placeholder`), which lies on the field from its left edge, is never narrower than its text and
// is clipped by nothing but the field; the native placeholder stays (the accessible name) but is
// not painted. Tablet in landscape and upright, and a phone; a line short of the field's width and
// one longer than it (scrolled sideways, then erased).
//
// `phone` project; the offline cockpit (`?replay`), nothing reaches MUME.
import { type Locator, type Page, expect, test } from '@playwright/test';

const okb = (page: Page) => page.locator('.wc-cockpit .wc-ph-okb');
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const ph = (page: Page) => page.locator('.wc-input-slot .wc-input-ph');
const key = (root: Locator, k: string) => root.locator([...k].length === 1 ? `.wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-ph-okb-k[data-act="${k}"]`);
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

const SHORT = 'look';
const LONG = 'killthebigorcandlootallitscoinsandthegoldandthesilverbeforeitwakesupagain'.repeat(2);

/** Where the drawn placeholder is against the field, and whether anything of its text is cut off. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const f = document.querySelector<HTMLTextAreaElement>('.wc-input-slot .wc-input-field')!;
    const p = document.querySelector<HTMLElement>('.wc-input-slot .wc-input-ph');
    const fr = f.getBoundingClientRect();
    if (!p) return null;
    const pr = p.getBoundingClientRect();
    // The text's own width, measured apart from the box it is drawn in.
    const probe = document.createElement('span');
    probe.textContent = p.textContent;
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;';
    p.parentElement!.append(probe);
    const textW = probe.getBoundingClientRect().width;
    probe.remove();
    return {
      text: p.textContent,
      display: getComputedStyle(p).display,
      native: getComputedStyle(f, '::placeholder').color,
      left: pr.left - fr.left,
      right: fr.right - pr.right,
      top: pr.top - fr.top,
      boxW: pr.width,
      clientW: p.clientWidth,
      scrollW: p.scrollWidth,
      textW,
      fieldW: fr.width,
    };
  });

async function expectWhole(page: Page): Promise<void> {
  await frames(page);
  await expect(field(page)).toHaveValue('');
  await expect(field(page)).toHaveAttribute('placeholder', 'Command');
  const m = await measure(page);
  expect(m, 'the placeholder is drawn by the page').not.toBeNull();
  expect(m!.text).toBe('Command');
  expect(m!.display).not.toBe('none');
  // The native one is not painted (Safari's own was the one cut off).
  expect(m!.native).toBe('rgba(0, 0, 0, 0)');
  // From the field's left edge, across its width, and nothing of the text clipped.
  expect(Math.abs(m!.left)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(m!.top)).toBeLessThanOrEqual(0.5);
  expect(m!.right).toBeGreaterThanOrEqual(-0.5);
  expect(m!.boxW).toBeGreaterThan(m!.fieldW - 1);
  expect(m!.textW).toBeLessThanOrEqual(m!.boxW);
  expect(m!.scrollW).toBeLessThanOrEqual(m!.clientW);
  await expect(ph(page)).toBeVisible();
}

async function typeOn(page: Page, text: string): Promise<void> {
  for (const k of text) await key(okb(page), k).tap();
  await expect(field(page)).toHaveValue(text);
  await frames(page);
  // While the line holds text the drawn placeholder is gone.
  await expect(ph(page)).toBeHidden();
}

async function erase(page: Page, n: number): Promise<void> {
  for (let i = 0; i < n; i++) await key(okb(page), 'back').tap();
}

for (const [name, viewport] of [
  ['a tablet in landscape', { width: 1180, height: 820 }],
  ['a tablet upright', { width: 820, height: 1180 }],
  ['a phone', { width: 412, height: 839 }],
] as const) {
  test.describe(name, () => {
    test.use({ viewport });

    test('"Command" comes back whole after a line is typed and erased, short or longer than the field', async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/?replay&kbd=sv');
      await expect(page.locator('.wc-ph-pad')).toBeVisible();
      await expectWhole(page);
      await field(page).tap();
      await expect(okb(page)).toBeVisible();
      await expectWhole(page);

      await typeOn(page, SHORT);
      await erase(page, SHORT.length);
      await expectWhole(page);

      // Longer than the field: the line scrolls sideways (a leftover scrollLeft must not matter).
      await typeOn(page, LONG);
      expect(await field(page).evaluate((f) => f.scrollLeft)).toBeGreaterThan(0);
      await erase(page, LONG.length);
      await frames(page);
      await page.locator('.wc-input-slot').screenshot({ path: info.outputPath(`erased-${viewport.width}x${viewport.height}.png`) });
      await expectWhole(page);

      // Folded: the same.
      await key(okb(page), 'fold').tap();
      await expect(okb(page)).toBeHidden();
      await expectWhole(page);
      expect(errors).toEqual([]);
    });
  });
}
