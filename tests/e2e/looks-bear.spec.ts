// Bear form (stage 80 part A, ADR 0169): the three Char.StatusVars messages
// of the owner's run with Dubb, a Beorning (2026-11-26), and the portrait
// that follows them. Part B adds the token on the map to this file (the
// token changes with the form as the portrait does). Uses the dev-only
// `window.__wc` and the GMCP demo.
import { type Page, expect, test } from '@playwright/test';

const disc = (page: Page) => page.locator('.wc-pane-character .wc-cc-disc');
const emit = (page: Page, pkg: string, data: unknown) =>
  page.evaluate(([p, d]) => window.__wc!.app.bus.emit('gmcp', { pkg: p as string, key: (p as string).toLowerCase(), data: d }), [pkg, data] as const);
const photo = (page: Page) => disc(page).locator('img.wc-cc-photo').getAttribute('src');

test('the Beorning becomes the bear and the Beorning again', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 960 });
  await page.goto('/?fixture=gmcp-demo.log&speed=0');
  await page.waitForFunction(() => window.__wc?.app !== undefined);
  await page.evaluate(() => window.__wc!.settings.update({ panes: { character: { on: true } }, character: { height: 'auto' } }));
  await expect.poll(() => page.evaluate(() => window.__wc!.app.game.char.view().name)).toBe('Rasta');
  await emit(page, 'Char.StatusVars', { race: 'Man', subrace: 'Beorning' });
  await expect(disc(page)).toHaveAttribute('data-portrait', 'beorning');
  await expect(disc(page)).toHaveAttribute('data-art', 'drawn');
  const man = await photo(page);
  await emit(page, 'Char.StatusVars', { race: 'Bear', subrace: null });
  await expect(disc(page)).toHaveAttribute('data-portrait', 'bear');
  await expect.poll(() => photo(page)).not.toBe(man);
  // The race line says what MUME says; the sex is kept.
  await expect(disc(page)).toHaveAttribute('data-sex', 'male');
  await emit(page, 'Char.StatusVars', { race: 'Man', subrace: 'Beorning' });
  await expect(disc(page)).toHaveAttribute('data-portrait', 'beorning');
  await expect.poll(() => photo(page)).toBe(man);
});
