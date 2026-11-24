// The Character gear fits its popup: no scroll sideways (stage 77 F1b, the
// owner had to scroll it a little). Uses the dev-only `window.__wc`.
import { type Page, expect, test } from '@playwright/test';

const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');

async function openGear(page: Page, o: { width: number; height: number; font?: number }): Promise<void> {
  await page.setViewportSize({ width: o.width, height: o.height });
  await page.goto('/?replay');
  await expect(field(page)).toBeFocused();
  await page.evaluate(
    (font) => window.__wc!.settings.update({ panes: { character: { on: true } }, character: { height: 'medium' }, ...(font ? { appearance: { size: font } } : {}) }),
    o.font ?? null,
  );
  const pane = page.locator('.wc-pane-character');
  await pane.hover();
  await pane.locator('> .wc-pane-btn-gear').click();
  await expect(page.locator('.wc-sp-gear-character')).toBeVisible();
}

/** Every element in the popup that is wider than its box, or sticks out of the popup. */
const overflow = (page: Page) =>
  page.evaluate(() => {
    const pop = document.querySelector<HTMLElement>('.wc-sp-gear-character')!;
    const box = pop.getBoundingClientRect();
    const out: string[] = [];
    for (const el of [pop, ...pop.querySelectorAll<HTMLElement>('*')]) {
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'hidden' && el.clientWidth > 0) out.push(`scroll ${el.className} ${el.scrollWidth}>${el.clientWidth}`);
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > box.right + 0.5 || r.left < box.left - 0.5)) out.push(`out ${el.className} ${Math.round(r.left)}..${Math.round(r.right)} of ${Math.round(box.left)}..${Math.round(box.right)}`);
    }
    return out;
  });

for (const v of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'large font', width: 1280, height: 900, font: 20 },
  { name: 'narrow window', width: 700, height: 700 },
  { name: 'short window', width: 1280, height: 520 },
  { name: 'short narrow window', width: 700, height: 420 },
]) {
  test(`the Character gear fits with no sideways scroll (${v.name})`, async ({ page, browserName }) => {
    // Firefox shows no hover gear on the narrow window's pane: Chromium measures that layout.
    test.skip(browserName === 'firefox' && v.width < 1000, 'no hover gear in Firefox at this width');
    await openGear(page, v);
    expect(await overflow(page)).toEqual([]);
  });
}
