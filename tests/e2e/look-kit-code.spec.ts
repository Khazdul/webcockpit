// Stage 42e (ADR 0127): the lantern code look and the manual reader, in
// the kit gallery's Code section. A lantern buffer: Ctrl+F opens the
// lantern find panel at the top, `n of m`, Replace / All, Esc closes it.
// The manual (LookManual): n / p, find with marks, the narrow contents
// overlay, the find bar, the Lua index's links.
import { expect, test } from '@playwright/test';
import { lanternFind, lookManual, manualMarks, manualSection, openKitCode } from './look';

test('a lantern buffer finds and replaces in the lantern panel at the top', async ({ page }) => {
  const sec = await openKitCode(page);
  const editor = sec.locator('.wc-kit-code-buf .cm-editor');
  await expect(editor).toHaveClass(/wc-code/);
  await editor.locator('.cm-line').first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Control+f');
  const panel = lanternFind(sec);
  await expect(panel).toBeVisible();
  // At the top of the buffer, above the code.
  await expect(editor.locator('.cm-panels-top .wc-lk-search')).toHaveCount(1);
  const find = panel.locator('[data-field=find] input');
  await expect(find).toBeFocused();
  await page.keyboard.type('orc');
  await expect(panel.locator('.wc-search-count')).toHaveText('1 of 5');
  await page.keyboard.press('Enter');
  await expect(panel.locator('.wc-search-count')).toHaveText('2 of 5');
  await page.keyboard.press('Shift+Enter');
  await expect(panel.locator('.wc-search-count')).toHaveText('1 of 5');
  await panel.locator('[data-btn=next]').click();
  await expect(panel.locator('.wc-search-count')).toHaveText('2 of 5');
  await expect(find).toBeFocused();
  // The toggles: Alt+W (whole words) keeps 5, a bad regex says so.
  await page.keyboard.press('Alt+w');
  await expect(panel.locator('[data-opt=word]')).toHaveAttribute('aria-checked', 'true');
  await expect(panel.locator('.wc-search-count')).toHaveText(/of 5$/);
  await page.keyboard.press('Alt+w');
  await page.keyboard.press('Alt+r');
  // A step selects the field's text (CodeMirror's own rule): type after it.
  await page.keyboard.press('End');
  await page.keyboard.type('(');
  await expect(panel.locator('.wc-search-count')).toHaveText('Bad regex');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Alt+r');
  await expect(panel.locator('.wc-search-count')).toHaveText(/of 5$/);
  // Replace: Ctrl+H goes to the Replace field; Replace one, then All.
  await page.keyboard.press('Control+h');
  const replace = panel.locator('[data-field=replace] input');
  await expect(replace).toBeFocused();
  await page.keyboard.type('goblin');
  await panel.locator('[data-btn=replace]').click();
  await expect(panel.locator('.wc-search-count')).toHaveText(/(of 4|4 matches)$/);
  await panel.locator('[data-btn=all]').click();
  await expect(panel.locator('.wc-search-count')).toHaveText('No matches');
  await expect(editor.locator('.cm-content')).not.toContainText('orc');
  await expect(editor.locator('.cm-content')).toContainText('#nop goblin goblin goblin');
  // Esc closes the panel; the buffer has the focus again.
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(editor.locator('.cm-content')).toBeFocused();
});

test('the lantern panel of an editable buffer has its Replace row and closes with its X', async ({ page }) => {
  const sec = await openKitCode(page);
  const editor = sec.locator('.wc-kit-code-buf .cm-editor');
  await editor.locator('.cm-line').nth(2).click();
  await page.keyboard.press('Control+f');
  const panel = lanternFind(sec);
  await expect(panel.locator('[data-field=replace]')).toHaveCount(1);
  await panel.locator('[data-btn=close]').click();
  await expect(panel).toHaveCount(0);
});

test('the script manual: n / p, find with marks, Esc clears the find', async ({ page }) => {
  await openKitCode(page, { show: 'script' });
  const man = lookManual(page);
  expect(await manualSection(page)).toBe(0);
  await page.keyboard.press('n');
  await expect.poll(() => manualSection(page)).toBe(1);
  await page.keyboard.press('n');
  await expect.poll(() => manualSection(page)).toBe(2);
  await page.keyboard.press('p');
  await expect.poll(() => manualSection(page)).toBe(1);
  // Find is always in the head (Ctrl+F focuses it).
  await page.keyboard.press('Control+f');
  const input = man.locator('.wc-lk-mfind input');
  await expect(input).toBeFocused();
  await page.keyboard.type('timer');
  const count = man.locator('.wc-search-count');
  await expect(count).toHaveText(/^\d+ of \d+$/);
  const total = Number((await count.textContent())!.split(' of ')[1]);
  expect(total).toBeGreaterThan(10);
  await expect.poll(() => manualMarks(page)).toBe(total);
  const at = Number((await count.textContent())!.split(' of ')[0]);
  await page.keyboard.press('Enter');
  await expect(count).toHaveText(`${(at % total) + 1} of ${total}`);
  // The current match's section is the current section.
  await page.keyboard.press('Escape');
  await expect(count).toHaveText('');
  await expect.poll(() => manualMarks(page)).toBe(0);
  await expect(input).not.toBeFocused();
  // The next Esc is the host's: back to the menu.
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-kit')).toHaveCount(0);
});

test('the manual links the Lua index to its entries', async ({ page }) => {
  await openKitCode(page, { show: 'script' });
  const man = lookManual(page);
  await man.locator('.wc-lk-mgrp', { hasText: 'Lua reference' }).click();
  await man.locator('.wc-lk-mtoc li', { hasText: /^Lua library$/ }).click();
  const index = Number(await man.locator('.wc-lk-mtoc li.is-on').getAttribute('data-i'));
  const link = man.locator(`section[data-i="${index}"] a.wc-lk-mlink`).first();
  const name = (await link.textContent())!;
  await link.click();
  await expect(man.locator('.wc-lk-mtoc li.is-on')).toHaveText(name);
  await expect(man.locator(`.wc-lk-mtext section[data-i] h3`, { hasText: new RegExp(`^${name.replace('.', '\\.')}$`) })).toBeInViewport();
});

test('a narrow manual opens its contents over the text', async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 800 });
  await openKitCode(page, { show: 'script' });
  const man = lookManual(page);
  const toc = man.locator('.wc-lk-mtoc');
  await expect(toc).toBeHidden();
  const btn = man.locator('[data-btn=contents]');
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(toc).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toc).toBeHidden();
  // Tab gives the contents the keys (and opens it); ↓ moves; Enter goes back to the text.
  await page.keyboard.press('Tab');
  await expect(toc).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => manualSection(page)).toBe(1);
  await page.keyboard.press('Enter');
  await expect(toc).toBeHidden();
  await expect(man.locator('.wc-lk-mtext section[data-i="1"] h3')).toBeInViewport();
});

test('the profile manual with a host rail and the find bar', async ({ page }) => {
  await openKitCode(page, { show: 'profile', contents: 'none', find: 'bar' });
  const man = lookManual(page);
  await expect(man.locator('.wc-lk-mtoc')).toHaveCount(0);
  // The host's rail (ManualContents) follows the reader.
  await page.keyboard.press('n');
  await expect.poll(() => manualSection(page)).toBe(1);
  await expect(man.locator('.wc-lk-mfind')).toHaveCount(0);
  await page.keyboard.press('Control+f');
  const input = man.locator('.wc-lk-mfind input');
  await expect(input).toBeFocused();
  await page.keyboard.type('alias');
  await expect(man.locator('.wc-search-count')).toHaveText(/^\d+ of \d+$/);
  expect(await manualMarks(page)).toBeGreaterThan(5);
  await page.keyboard.press('Escape');
  await expect(man.locator('.wc-lk-mfind')).toHaveCount(0);
  await expect.poll(() => manualMarks(page)).toBe(0);
  // The rail goes to a section.
  await page.locator('.wc-kit-code-rail li', { hasText: '#alias' }).click();
  await expect(man.locator('.wc-lk-mtext section[data-i] h3', { hasText: /^#alias$/ })).toBeInViewport();
});

test('Paper: the code well and the manual turn light', async ({ page }) => {
  const sec = await openKitCode(page, { paper: true });
  const bg = await sec
    .locator('.wc-kit-code-buf .cm-editor')
    .evaluate((el) => getComputedStyle(el).backgroundColor.match(/\d+/g)!.slice(0, 3).map(Number));
  expect(Math.min(...bg)).toBeGreaterThan(200);
  await sec.locator('[data-kit=show] [data-opt=script]').click();
  const code = lookManual(page).locator('pre.wc-lk-mcode').first();
  await code.scrollIntoViewIfNeeded();
  const pre = await code.evaluate((el) => getComputedStyle(el).backgroundColor.match(/\d+/g)!.slice(0, 3).map(Number));
  expect(Math.min(...pre)).toBeGreaterThan(200);
});
