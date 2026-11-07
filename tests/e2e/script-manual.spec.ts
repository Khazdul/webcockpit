// Stage 44c: the script manual in the lantern look (round 7 manual A
// "Boken"), from the Scripts page's Manual button: the contents and the
// text on the start page, their keys, the narrow layout (the contents
// behind a Contents button, as an overlay), and the in-game Scripts window
// (the title "Scripts" with the note "Manual", the small Back in the head,
// Esc, dark and Paper). The F1 targets and find are in lua-help,
// script-editor and manual-find. Nothing reaches the real server.
import { type Page, expect, test } from '@playwright/test';
import { win, winNote, winTitle } from './look';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const manual = (page: Page) => page.locator('.wc-frame:not([hidden]) .wc-sman');
const reader = (page: Page) => manual(page).locator('.wc-lk-manual');
const toc = (page: Page) => manual(page).locator('.wc-lk-mtoc');
const current = (page: Page) => toc(page).locator('li.is-on');
/** The heading of the section at the top of the manual's text. */
const manualTop = (page: Page) =>
  manual(page)
    .locator('.wc-lk-mtext')
    .evaluate((el) => {
      const top = el.getBoundingClientRect().top;
      const s = [...el.querySelectorAll('section[data-i]')].find((c) => c.getBoundingClientRect().bottom > top + 24);
      return s?.getAttribute('aria-label') ?? '';
    });
const scrollTop = (page: Page) => manual(page).locator('.wc-lk-mtext').evaluate((el) => el.scrollTop);

/** Start page → Scripts → Manual (the page's button). */
async function openManual(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(() => window.__wc!.shell.scripts!.init());
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Scripts');
  await page.keyboard.press('Enter');
  await startFrame(page).locator('[data-btn="MANUAL"]').click();
  await expect(manual(page)).toBeVisible();
  await expect(current(page)).toHaveText('Getting started');
}

test('the start page: a large box, the contents beside the text; the keys move through both', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openManual(page);
  await expect(manual(page)).toHaveClass(/wc-lk-box-large/);
  await expect(manual(page).locator(':scope > .wc-lk-hood')).toContainText('Script Manual');
  await expect(toc(page)).toBeVisible();
  await expect(manual(page).locator('[data-btn="contents"]')).toBeHidden();
  // The find is in the head with its toggles.
  await expect(manual(page).locator('.wc-lk-mfind [data-opt="case"]')).toBeVisible();

  // Text: ↓ and PgDn scroll, Home goes to the top, n / p by section.
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(0);
  const s1 = await scrollTop(page);
  await page.keyboard.press('PageDown');
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(s1 + 200);
  await page.keyboard.press('Home');
  await expect.poll(() => scrollTop(page)).toBe(0);
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  await expect.poll(() => manualTop(page)).toBe('Lua patterns');
  await expect(current(page)).toHaveText('Lua patterns');
  await page.keyboard.press('p');
  await expect.poll(() => manualTop(page)).toBe('Lua basics');

  // ← to the contents: ↓ picks the next section, → back to the text.
  await page.keyboard.press('ArrowLeft');
  await expect(reader(page)).toHaveAttribute('data-zone', 'toc');
  await page.keyboard.press('ArrowDown');
  await expect(current(page)).toHaveText('Lua patterns');
  await expect.poll(() => manualTop(page)).toBe('Lua patterns');
  await page.keyboard.press('ArrowRight');
  await expect(reader(page)).toHaveAttribute('data-zone', 'text');

  // A click on a folded group's head unfolds it; a click on an entry goes there.
  const api = toc(page).locator('.wc-lk-mgrp', { hasText: 'API reference' });
  await api.click();
  await expect(api).toHaveAttribute('aria-expanded', 'true');
  await toc(page).locator('li', { hasText: /^tempTimer$/ }).click();
  await expect.poll(() => manualTop(page)).toBe('tempTimer');
  await expect(current(page)).toHaveText('tempTimer');

  // The scroll moves the current section (the contents follow).
  await manual(page).locator('.wc-lk-mtext').hover();
  for (let i = 0; i < 6 && (await current(page).textContent()) === 'tempTimer'; i++) await page.mouse.wheel(0, 600);
  await expect(current(page)).not.toHaveText('tempTimer');

  // Esc goes back to the Scripts page.
  await page.keyboard.press('Escape');
  await expect(manual(page)).toHaveCount(0);
  await expect(startFrame(page).locator('[data-btn="MANUAL"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('narrow: the text alone; Contents opens the list over it, a choice or Esc closes it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openManual(page);
  await page.setViewportSize({ width: 600, height: 800 });
  const contents = manual(page).locator('[data-btn="contents"]');
  await expect(contents).toBeVisible();
  await expect(toc(page)).toBeHidden();
  // The find's toggles hide; Alt+C still works.
  await expect(manual(page).locator('.wc-lk-mfind [data-opt="case"]')).toBeHidden();
  // The head stays inside the box.
  const box = (await manual(page).locator('.wc-lk-win').boundingBox())!;
  for (const el of await manual(page).locator('.wc-lk-mhead .wc-lk-btn, .wc-lk-mhead input').all()) {
    if (!(await el.isVisible())) continue;
    const b = (await el.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
  }

  await contents.click();
  await expect(reader(page)).toHaveClass(/is-toc-open/);
  await expect(toc(page)).toBeVisible();
  await toc(page).locator('li', { hasText: /^Timers$/ }).click();
  await expect(toc(page)).toBeHidden();
  await expect.poll(() => manualTop(page)).toBe('Timers');

  // Tab opens it too; Esc closes it first, then leaves the manual.
  await page.keyboard.press('Tab');
  await expect(toc(page)).toBeVisible();
  await expect(current(page)).toHaveText('Timers');
  await page.keyboard.press('ArrowDown');
  await expect(current(page)).toHaveText('Game time');
  await page.keyboard.press('Escape');
  await expect(toc(page)).toBeHidden();
  await expect(manual(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(manual(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

/** The offline cockpit, then the Scripts window (bar icon) and its Manual. */
async function windowManual(page: Page): Promise<void> {
  await page.goto('/?replay');
  await expect(page.locator('.wc-mb-bar')).toBeVisible();
  await page.locator('.wc-mb[data-mb="scripts"]').click();
  await expect(win(page, 'scripts')).toHaveAttribute('data-focused', '');
  await win(page, 'scripts').locator('[data-btn="MANUAL"]').click();
  await expect(win(page, 'scripts').locator('.wc-sman')).toBeVisible();
}

for (const paper of [false, true]) {
  test(`the Scripts window${paper ? ' on Paper' : ''}: title Scripts, note Manual, a small Back; Esc goes back`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await windowManual(page);
    const w = win(page, 'scripts');
    if (paper) {
      await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } }));
      await expect(page.locator('.wc-windows')).toHaveAttribute('data-light', /.*/);
    }
    await expect(winTitle(page, 'scripts')).toHaveText('Scripts');
    await expect(winNote(page, 'scripts')).toHaveText('Manual');
    // The window frame is the box: no hood of the box's own.
    await expect(w.locator('.wc-sman > .wc-lk-hood')).toHaveCount(0);
    const back = w.locator('.wc-sman-iback .wc-lk-iback');
    await expect(back).toBeVisible();
    // The Back sits in the head's row, left of the find, without covering it.
    const b = (await back.boundingBox())!;
    const field = (await w.locator('.wc-lk-mfind input').boundingBox())!;
    expect(b.x + b.width).toBeLessThan(field.x);
    expect(Math.abs(b.y + b.height / 2 - (field.y + field.height / 2))).toBeLessThan(6);
    // The reader's text is lit (not the dim of an unfocused window).
    await expect(w.locator('.wc-lk-mtext section[aria-label="Getting started"]')).toBeVisible();

    await back.click();
    await expect(w.locator('.wc-sman')).toHaveCount(0);
    await expect(winNote(page, 'scripts')).toHaveCount(0);
    await expect(winTitle(page, 'scripts')).toHaveText('Scripts');

    // Again, and Esc: the window stays, back on its page.
    await w.locator('[data-btn="MANUAL"]').click();
    await expect(winNote(page, 'scripts')).toHaveText('Manual');
    await page.keyboard.press('Escape');
    await expect(w.locator('.wc-sman')).toHaveCount(0);
    await expect(w).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('a small Scripts window: the head wraps inside it with Back and Contents', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 560, height: 520 });
  await windowManual(page);
  const w = win(page, 'scripts');
  const back = w.locator('.wc-sman-iback .wc-lk-iback');
  const contents = w.locator('.wc-sman [data-btn="contents"]');
  await expect(back).toBeVisible();
  await expect(contents).toBeVisible();
  const b = (await back.boundingBox())!;
  const c = (await contents.boundingBox())!;
  expect(b.x + b.width).toBeLessThan(c.x);
  const body = (await w.locator('.wc-lk-win').boundingBox())!;
  for (const el of await w.locator('.wc-lk-mhead .wc-lk-btn, .wc-lk-mhead input').all()) {
    if (!(await el.isVisible())) continue;
    const r = (await el.boundingBox())!;
    expect(r.x + r.width).toBeLessThanOrEqual(body.x + body.width + 0.5);
  }
  await contents.click();
  await expect(w.locator('.wc-lk-mtoc')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(w.locator('.wc-lk-mtoc')).toBeHidden();
  await expect(w.locator('.wc-sman')).toBeVisible();
  expect(errors).toEqual([]);
});
