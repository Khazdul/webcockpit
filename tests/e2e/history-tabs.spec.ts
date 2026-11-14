// Stage 67 (ADR 0149 and its addendum, spec §2.5): History with the tab
// strip Sessions · Spotlights · Diary (placement P1: a row under the hood,
// in Back's band, a rule under it). H opens Sessions; 1 2 3 and the mouse
// change tab; the hood says History on every tab; the digits are small key
// caps in the tabs; the page's own letters still work beside the digits;
// the run log and the Spotlights viewer return to the tab they left; Esc
// and Back leave History. The phone: phone-history-tabs.spec.ts.
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';
import { lookBox, morphDone, openStart } from './look';

const top = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const tab = (page: Page, t: string) => lookBox(page).locator(`.wc-htab[data-tab="${t}"]`);
const onTab = (page: Page) => lookBox(page).locator('.wc-htab.is-on');
const hood = (page: Page) => lookBox(page).locator('.wc-lk-hood-t');
const menuSel = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-sm-item.is-sel .wc-sm-label');
const cards = (page: Page) => lookBox(page).locator('.wc-spw-card');
const viewer = (page: Page) => page.locator('.wc-spv');

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
}

async function openHistory(page: Page): Promise<void> {
  await page.keyboard.press('h');
  await expect(hood(page)).toHaveText('History');
  await morphDone(page);
}

test('H opens Sessions; 1 2 3 change tab, the hood stays History; the strip stands under the hood with a rule under it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinDemoClock(page);
  await openStart(page);
  await restoreDemo(page);
  await openHistory(page);

  // Sessions first, the three tabs in order, each with its digit; the active one marked.
  await expect(lookBox(page).locator('.wc-htab')).toHaveText(['1Sessions', '2Spotlights', '3Diary']);
  await expect(onTab(page)).toHaveAttribute('data-tab', 'sessions');
  await expect(onTab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(lookBox(page).locator('.wc-htab-k').first()).toBeVisible();
  await expect(lookBox(page).locator('.wc-hist-head')).toBeVisible();

  // Placement P1: the strip under the hood (centred, below its bottom), level with Back, above the page's head.
  const box = (await lookBox(page).boundingBox())!;
  const strip = (await lookBox(page).locator('.wc-htabs').boundingBox())!;
  const hoodBox = (await lookBox(page).locator('.wc-lk-hood').boundingBox())!;
  const back = (await lookBox(page).locator('.wc-lk-back').boundingBox())!;
  const head = (await lookBox(page).locator('.wc-hist-head').boundingBox())!;
  const tabs = (await tab(page, 'sessions').boundingBox())!;
  const tabsEnd = (await tab(page, 'diary').boundingBox())!;
  expect(Math.abs((tabs.x + tabsEnd.x + tabsEnd.width) / 2 - (box.x + box.width / 2))).toBeLessThan(4);
  expect(tabs.y).toBeGreaterThanOrEqual(hoodBox.y + hoodBox.height - 2);
  expect(tabs.y).toBeLessThan(back.y + back.height);
  expect(head.y).toBeGreaterThanOrEqual(strip.y + strip.height);
  // The rule: the strip's bottom border, across the window.
  const rule = await lookBox(page).locator('.wc-htabs').evaluate((el) => getComputedStyle(el).borderBottomStyle);
  expect(rule).toBe('solid');
  // The active tab is marked more clearly than the kit's tabs: a 2 px underline.
  const underline = await onTab(page).evaluate((el) => getComputedStyle(el, '::after').height);
  expect(underline).toBe('2px');

  // 2: Spotlights, its wall under the strip.
  await page.keyboard.press('2');
  await expect(onTab(page)).toHaveAttribute('data-tab', 'spotlights');
  await expect(cards(page)).toHaveCount(5);
  await expect(hood(page)).toHaveText('History');
  // 3: the Diary.
  await page.keyboard.press('3');
  await expect(onTab(page)).toHaveAttribute('data-tab', 'diary');
  await expect(lookBox(page).locator('.wc-cred-book')).toHaveAttribute('data-ready', 'true');
  await expect(hood(page)).toHaveText('History');
  // 1: Sessions again. The tab strip stands at the same place on every tab.
  const at3 = (await tab(page, 'sessions').boundingBox())!;
  await page.keyboard.press('1');
  await expect(onTab(page)).toHaveAttribute('data-tab', 'sessions');
  await expect(lookBox(page).locator('.wc-hist-head')).toBeVisible();
  const at1 = (await tab(page, 'sessions').boundingBox())!;
  expect(Math.abs(at1.x - at3.x)).toBeLessThan(1);
  expect(Math.abs(at1.y - at3.y)).toBeLessThan(1);
  // A modifier makes the digit no tab key.
  await page.keyboard.press('Alt+2');
  await expect(onTab(page)).toHaveAttribute('data-tab', 'sessions');

  // Esc: the menu, its cursor on History.
  await page.keyboard.press('Escape');
  await expect(menuSel(page)).toHaveText('History');
  // H always opens Sessions.
  await openHistory(page);
  await page.keyboard.press('3');
  await expect(onTab(page)).toHaveAttribute('data-tab', 'diary');
  await page.keyboard.press('Escape');
  await expect(menuSel(page)).toHaveText('History');
  await openHistory(page);
  await expect(onTab(page)).toHaveAttribute('data-tab', 'sessions');
  expect(errors).toEqual([]);
});

test('the mouse changes tab; the pages keep their own letters beside the digits', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinDemoClock(page);
  await openStart(page);
  await restoreDemo(page);
  await openHistory(page);

  await tab(page, 'diary').click();
  await expect(onTab(page)).toHaveAttribute('data-tab', 'diary');
  // The Diary's N turns the page.
  await expect(lookBox(page).locator('.wc-cred-book')).toHaveAttribute('data-ready', 'true');
  const spreads = Number(await lookBox(page).locator('.wc-cred-book').getAttribute('data-spreads'));
  if (spreads > 1) {
    await page.keyboard.press('n');
    await expect(lookBox(page).locator('.wc-cred-book')).toHaveAttribute('data-spread', '1');
  }
  // A click on the active tab does nothing.
  await tab(page, 'diary').click();
  await expect(onTab(page)).toHaveAttribute('data-tab', 'diary');

  await tab(page, 'spotlights').click();
  await expect(cards(page)).toHaveCount(5);
  // Spotlights' F moves into the filter row; a digit there still changes tab.
  await page.keyboard.press('f');
  await expect(lookBox(page).locator('.wc-spw-head')).toHaveClass(/is-cur/);
  await page.keyboard.press('1');
  await expect(onTab(page)).toHaveAttribute('data-tab', 'sessions');

  // Sessions' ? opens its keys box, which lists the digits.
  await page.keyboard.press('?');
  const keys = page.locator('.wc-lk-dialog[data-dlg="keys"]');
  await expect(keys).toContainText('1 2 3');
  await expect(keys).toContainText('Sessions, Spotlights, Diary');
  // A digit closes the keys box (any key does) and changes nothing else.
  await page.keyboard.press('2');
  await expect(keys).toHaveCount(0);
  await expect(onTab(page)).toHaveAttribute('data-tab', 'sessions');

  // Back leaves History from any tab.
  await tab(page, 'spotlights').click();
  await expect(cards(page)).toHaveCount(5);
  await top(page).locator('.wc-lk-back').first().click();
  await expect(menuSel(page)).toHaveText('History');
  expect(errors).toEqual([]);
});

test('the run log and the Spotlights viewer return to the tab they left', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinDemoClock(page);
  await openStart(page);
  await restoreDemo(page);
  await openHistory(page);

  // Sessions → Run log (Enter) → Esc: Sessions.
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-player')).toBeVisible();
  await expect(hood(page)).toHaveText('Run log');
  // The player owns the digits while it shows.
  await page.keyboard.press('2');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-player')).toHaveCount(0);
  await expect(hood(page)).toHaveText('History');
  await expect(onTab(page)).toHaveAttribute('data-tab', 'sessions');

  // Spotlights → a card plays → the digits are the player's → Esc: the wall on the Spotlights tab.
  await page.keyboard.press('2');
  await expect(cards(page)).toHaveCount(5);
  await page.keyboard.press('Enter');
  await expect(viewer(page)).toBeVisible();
  await page.keyboard.press('3');
  await expect(viewer(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer(page)).toHaveCount(0);
  await expect(onTab(page)).toHaveAttribute('data-tab', 'spotlights');
  // The box's Back leaves the viewer the same way.
  await page.keyboard.press('Enter');
  await expect(viewer(page)).toBeVisible();
  await top(page).locator('.wc-lk-back').first().click();
  await expect(viewer(page)).toHaveCount(0);
  await expect(onTab(page)).toHaveAttribute('data-tab', 'spotlights');
  await page.keyboard.press('3');
  await expect(onTab(page)).toHaveAttribute('data-tab', 'diary');
  expect(errors).toEqual([]);
});
