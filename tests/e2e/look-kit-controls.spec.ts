// Stage 42b (ADR 0127): the kit's controls in the gallery's Controls
// section: clicks and keys, the focus kept by the stack, the pills kept in
// view, the table's sort and two-line rows, Paper (the tokens switched by
// `data-light`), and on a touch phone (coarse pointer) taps and the 40 px
// targets.
import { type Page, devices, expect, test } from '@playwright/test';
import { glassButton, kitField, kitSection, openControls, segOption } from './look';

const flash = (page: Page) => kitSection(page, 'controls').locator('.wc-kitc-flash');

/** The focused element is no control (the frame stack keeps the focus). */
async function focusKept(page: Page): Promise<void> {
  const tag = await page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return a?.closest('.wc-lk-btn, .wc-lk-opt, .wc-lk-tab, .wc-lk-check, .wc-lk-toggle') ? a.className : '';
  });
  expect(tag).toBe('');
}

test('buttons press on a click (not when disabled) and never take the focus', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = await openControls(page);
  await glassButton(s, 'NEW').click();
  await expect(flash(page)).toHaveText('New pressed.');
  await focusKept(page);
  await glassButton(s, 'FIND').click();
  await expect(flash(page)).toHaveText('Find pressed.');
  await expect(glassButton(s, 'FIND')).toHaveAttribute('aria-label', 'Find');
  await expect(glassButton(s, 'EXPORT')).toHaveAttribute('aria-disabled', 'true');
  await glassButton(s, 'EXPORT').click({ force: true });
  await expect(flash(page)).toHaveText('Find pressed.');
  expect(errors).toEqual([]);
});

test('keys walk the keyboard button and press it; letters choose the surface', async ({ page }) => {
  const s = await openControls(page);
  await expect(s.locator('.wc-lk-btn.is-sel')).toHaveAttribute('data-btn', 'NEW');
  await page.keyboard.press('ArrowRight');
  await expect(s.locator('.wc-lk-btn.is-sel')).toHaveAttribute('data-btn', 'DELETE');
  await page.keyboard.press('Enter');
  await expect(flash(page)).toHaveText('Delete pressed.');
  await page.keyboard.press('p');
  await expect(s).toHaveAttribute('data-surface', 'paper');
  await expect(s).toHaveAttribute('data-light', '');
  await page.keyboard.press('s');
  await expect(s).toHaveAttribute('data-surface', 'sky');
});

test('segmented, pills and chips: aria-checked follows clicks; the chosen pill stays in view', async ({ page }) => {
  const s = await openControls(page);
  const editor = segOption(s, 'View', 'editor');
  await editor.click();
  await expect(editor).toHaveAttribute('aria-checked', 'true');
  await expect(segOption(s, 'View', 'lite')).toHaveAttribute('aria-checked', 'false');
  await segOption(s, 'View', 'off').click({ force: true });
  await expect(segOption(s, 'View', 'off')).toHaveAttribute('aria-checked', 'false');
  // Chips: several at once.
  const kills = segOption(s, 'Kinds', 'pkill');
  await expect(kills).toHaveAttribute('role', 'checkbox');
  await kills.click();
  await expect(kills).toHaveAttribute('aria-checked', 'true');
  await expect(segOption(s, 'Kinds', 'death')).toHaveAttribute('aria-checked', 'true');
  // Pills: choosing one far right (scrolled to it) keeps it inside the row.
  const pills = s.locator('.wc-lk-seg[aria-label="Character"]');
  const last = segOption(s, 'Character', 'glorfindel');
  await last.click();
  await expect(last).toHaveAttribute('aria-checked', 'true');
  const first = segOption(s, 'Character', 'all');
  await first.click();
  const inView = await pills.evaluate((box) => {
    const on = box.querySelector('.is-on')!.getBoundingClientRect();
    const r = box.getBoundingClientRect();
    return on.left >= r.left - 1 && on.right <= r.right + 1;
  });
  expect(inView).toBe(true);
  await focusKept(page);
});

test('fields take text and show their error; checks and toggles flip', async ({ page }) => {
  const s = await openControls(page);
  const name = kitField(s, 'name').locator('input');
  await name.fill('Taube');
  await expect(name).toHaveValue('Taube');
  const bad = kitField(s, 'bad');
  await expect(bad.locator('.wc-lk-ferr')).toHaveText('A name cannot hold / or \\.');
  await bad.locator('input').fill('gibur');
  await expect(bad.locator('.wc-lk-ferr')).toHaveCount(0);
  await expect(bad.locator('input')).not.toHaveAttribute('aria-invalid', 'true');
  // A field's text is selectable.
  expect(await name.evaluate((e) => getComputedStyle(e).userSelect)).toBe('text');
  await kitField(s, 'font').locator('select').selectOption('lucida');
  await expect(kitField(s, 'font').locator('select')).toHaveValue('lucida');
  const record = kitField(s, 'record');
  await expect(record).toHaveAttribute('aria-checked', 'false');
  await record.click();
  await expect(record).toHaveAttribute('aria-checked', 'true');
  const bold = kitField(s, 'bold');
  await bold.click();
  await expect(bold).toHaveAttribute('aria-checked', 'true');
  await expect(bold.locator('.wc-lk-tstate')).toHaveText('On');
});

test('the table sorts by its heads, scrolls under them and stacks when narrow', async ({ page }) => {
  const s = await openControls(page);
  const tbl = s.locator('.wc-lk-tbl');
  const date = tbl.locator('.wc-lk-th[data-key="date"]');
  await expect(date).toHaveAttribute('data-dir', '-1');
  await date.click();
  await expect(date).toHaveAttribute('data-dir', '1');
  await expect(date).toHaveAttribute('aria-sort', 'ascending');
  await expect(tbl.locator('.wc-lk-tr').first()).toHaveAttribute('data-id', 'r5');
  await tbl.locator('.wc-lk-th[data-key="char"]').click();
  await expect(tbl.locator('.wc-lk-tr').first()).toHaveAttribute('data-id', 'r1');
  await tbl.locator('.wc-lk-tr[data-id="r3"]').click();
  await expect(tbl.locator('.wc-lk-tr.is-on')).toHaveAttribute('data-id', 'r3');
  // The rows scroll inside the table; the heads stay.
  const body = tbl.locator('.wc-lk-tbody');
  expect(await body.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  await expect(tbl).not.toHaveClass(/is-stacked/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(tbl).toHaveClass(/is-stacked/);
  await expect(tbl.locator('.wc-lk-throw')).toBeHidden();
});

test('Paper turns the tokens light; the dark window and the sky keep them dark', async ({ page }) => {
  const ink = (sel: string) =>
    page.locator(`.wc-kitc-surface ${sel}`).first().evaluate((e) => getComputedStyle(e).color);
  let s = await openControls(page, 'paper');
  await expect(s).toHaveAttribute('data-light', '');
  expect(await ink('.wc-lk-txt')).toBe('rgb(42, 33, 22)');
  expect(await s.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(247, 240, 222)');
  expect(await ink('.wc-lk-ferr')).toBe('rgb(154, 46, 28)');
  s = await openControls(page, 'window');
  await expect(s).not.toHaveAttribute('data-light', '');
  expect(await ink('.wc-lk-txt')).toBe('rgb(234, 220, 195)');
  s = await openControls(page, 'sky');
  expect(await ink('.wc-lk-txt')).toBe('rgb(234, 220, 195)');
  // The icon set is complete (no empty drawing).
  const empty = await page.locator('.wc-kitc-icons svg').evaluateAll((l) => l.filter((s) => s.childElementCount === 0).length);
  expect(empty).toBe(0);
});

test.describe('on a touch phone (coarse pointer)', () => {
  // Pixel 7 emulation (Chromium only: Firefox has no mobile emulation).
  const { defaultBrowserType: _, ...pixel } = devices['Pixel 7'];
  test.use(pixel);
  test.skip(({ browserName }) => browserName !== 'chromium', 'mobile emulation is Chromium only');

  test('every target is at least 40 px high, and taps work', async ({ page }) => {
    const s = await openControls(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const small = await s.evaluate((root) => {
      const sel = '.wc-lk-btn, .wc-lk-opt, .wc-lk-tab, .wc-lk-check, .wc-lk-toggle, .wc-lk-input, .wc-lk-fold-h, .wc-lk-row, .wc-lk-tr';
      return [...root.querySelectorAll<HTMLElement>(sel)]
        .filter((e) => e.offsetParent !== null)
        .map((e) => [e.className, Math.round(e.getBoundingClientRect().height)] as const)
        .filter(([, h]) => h < 40);
    });
    expect(small).toEqual([]);
    const weather = kitField(s, 'weather');
    await weather.tap();
    await expect(weather).toHaveAttribute('aria-checked', 'false');
    await segOption(s, 'View', 'help').tap();
    await expect(segOption(s, 'View', 'help')).toHaveAttribute('aria-checked', 'true');
    await glassButton(s, 'NEW').tap();
    await expect(flash(page)).toHaveText('New pressed.');
    await focusKept(page);
  });
});
