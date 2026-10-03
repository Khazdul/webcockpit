// Stage 2 package A: theme tokens, bundled fonts, cell grid, custom caret,
// live appearance and ?safe. Uses the dev-only `window.__wc` handles.
import { type Page, expect, test } from '@playwright/test';

const rootVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

async function open(page: Page, query = '?replay'): Promise<void> {
  await page.goto('/' + query);
  await expect(page.locator('.wc-app')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test('bundled font loads and the cell grid is whole pixels high', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  expect(await page.evaluate(() => document.fonts.check('15px "DejaVu Sans Mono"', '█'))).toBe(true);
  expect(await rootVar(page, '--term-bg')).toBe('#000000');
  expect(await rootVar(page, '--ansi-9')).toBe('#ff0000');
  expect(await rootVar(page, '--c-title')).toBe('#00d7d7');
  const h = parseFloat(await rootVar(page, '--cell-h'));
  const w = parseFloat(await rootVar(page, '--cell-w'));
  expect(Number.isInteger(h)).toBe(true);
  expect(h).toBeGreaterThanOrEqual(15);
  expect(w).toBeGreaterThan(8);
  const row = page.locator('.wc-rows .wc-row').first();
  expect(await row.evaluate((el) => el.getBoundingClientRect().height)).toBe(h);
  expect(await page.locator('.wc-input').evaluate((el) => el.getBoundingClientRect().height)).toBe(h);
  expect(await page.locator('.wc-status').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('custom caret follows the text column and restyles live', async ({ page }) => {
  await open(page);
  const caret = page.locator('.wc-caret');
  const field = page.locator('.wc-input-field');
  await expect(field).toBeFocused();
  await expect(caret).toBeVisible();
  expect(await field.evaluate((el) => getComputedStyle(el).caretColor)).toBe('rgba(0, 0, 0, 0)');
  const w = parseFloat(await rootVar(page, '--cell-w'));
  const x0 = await caret.evaluate((el) => el.getBoundingClientRect().left);
  await page.keyboard.type('look');
  await expect.poll(() => caret.evaluate((el) => el.getBoundingClientRect().left)).toBeCloseTo(x0 + 4 * w, 1);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => caret.evaluate((el) => el.getBoundingClientRect().left)).toBeCloseTo(x0 + 3 * w, 1);

  // Default: beam, blinking.
  expect(await page.evaluate(() => document.documentElement.dataset.cursor)).toBe('beam');
  expect(await caret.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(w);

  // The blink is a timer toggling a class (ADR 0044 rule 1): no animation
  // runs anywhere on the page, on the caret or elsewhere.
  const off = /wc-caret-off/;
  await expect(caret).toHaveClass(off);
  await expect(caret).not.toHaveClass(off);
  await expect(caret).toHaveClass(off);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(await caret.evaluate((el) => el.getAnimations().length)).toBe(0);
  expect(await caret.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  expect(await caret.evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
  // A caret move shows it at once: in the off phase, press a key and read
  // the class in the same task that moves the caret (load cannot race it).
  await caret.evaluate(
    (el) =>
      new Promise<void>((done) => {
        const w = window as unknown as { caretOffAtMove?: boolean };
        const moved = new MutationObserver(() => {
          moved.disconnect();
          w.caretOffAtMove = el.classList.contains('wc-caret-off');
        });
        const offPhase = new MutationObserver(() => {
          if (!el.classList.contains('wc-caret-off')) return;
          offPhase.disconnect();
          moved.observe(el, { attributes: true, attributeFilter: ['style'] });
          done();
        });
        offPhase.observe(el, { attributes: true, attributeFilter: ['class'] });
      }),
  );
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { caretOffAtMove?: boolean }).caretOffAtMove))
    .toBe(false);

  await page.evaluate(() => window.__wc!.settings.update({ appearance: { cursorStyle: 'block', cursorBlink: false } }));
  await expect.poll(() => caret.evaluate((el) => el.getBoundingClientRect().width)).toBeCloseTo(w, 1);
  await expect(caret).toHaveText(' ');
  // Off: steady, without a caret move or a reload.
  await page.waitForTimeout(1200);
  await expect(caret).not.toHaveClass(off);
  // On again: blinks again, still without a caret move.
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { cursorBlink: true } }));
  await expect(caret).toHaveClass(off);
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { cursorBlink: false } }));
  await expect(caret).not.toHaveClass(off);
  await page.keyboard.press('ArrowLeft');
  await expect(caret).toHaveText('k');

  // A selection hides the caret, as the native one would be.
  await page.keyboard.press('Control+a');
  await expect(caret).toBeHidden();
  await page.keyboard.press('End');
  await expect(caret).toBeVisible();

  // Blurred: a hollow block.
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await expect(caret).toHaveClass(/wc-blurred/);
  expect(await caret.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
});

test('appearance applies live and persists; ?safe starts with defaults', async ({ page }) => {
  await open(page);
  const h15 = parseFloat(await rootVar(page, '--cell-h'));
  const fs15 = await rootVar(page, '--font-size');
  await page.evaluate(async () => {
    const s = window.__wc!.settings;
    s.update({ appearance: { size: 20, bg: '#0e141c', padding: 4, font: 'jetbrains' } });
    await s.flush();
  });
  // JetBrains Mono 20 → 12 px cells → 20 px exactly (ADR 0011).
  await expect.poll(() => rootVar(page, '--font-size')).toBe('20px');
  await expect.poll(() => rootVar(page, '--cell-w')).toBe('12px');
  expect(await rootVar(page, '--term-bg')).toBe('#0e141c');
  expect(await page.evaluate(() => getComputedStyle(document.body).paddingTop)).toBe('4px');
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('20px "JetBrains Mono"', '█')))
    .toBe(true);
  await expect.poll(async () => parseFloat(await rootVar(page, '--cell-h'))).toBeGreaterThan(h15);

  await page.reload();
  await expect(page.locator('.wc-app')).toBeVisible();
  expect(await rootVar(page, '--font-size')).toBe('20px');
  expect(await rootVar(page, '--font-mono')).toContain('JetBrains Mono');
  expect(await page.locator('link[rel=preload][href*="JetBrainsMono"]').count()).toBe(2);
  expect(await page.locator('link[rel=preload][href*="DejaVu"]').count()).toBe(0);

  await open(page, '?replay&safe');
  expect(await rootVar(page, '--font-size')).toBe(fs15);
  expect(await rootVar(page, '--term-bg')).toBe('#000000');

  // Safe mode did not overwrite the stored settings.
  await open(page);
  expect(await rootVar(page, '--font-size')).toBe('20px');
  await page.evaluate(async () => {
    window.__wc!.settings.reset();
    await window.__wc!.settings.flush();
  });
});

test('Bold brightens colours: off keeps the Cockpit look, on brightens live (ADR 0060)', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const text = 'Mob Red Inv Hi';
    window.__wc!.app.bus.emit('text.line', {
      text,
      runs: [
        { start: 0, end: 3, bold: true },
        { start: 4, end: 7, fg: 1, bold: true },
        { start: 8, end: 11, fg: 1, bold: true, inverse: true },
        { start: 12, end: 14, fg: 9, bold: true },
      ],
      tags: [],
      prompt: false,
      raw: text,
      ts: 0,
    });
  });
  const row = page.locator('.wc-rows .wc-row').filter({ hasText: 'Mob Red Inv Hi' });
  await expect(row).toHaveCount(1);
  const colours = () =>
    row.evaluate((el) =>
      [...el.querySelectorAll('span')].map((s) => [getComputedStyle(s).color, getComputedStyle(s).fontWeight]),
    );
  const W = 'rgb(255, 255, 255)';
  const SILVER = 'rgb(192, 192, 192)';
  // Off (default): bold is weight only.
  expect(await colours()).toEqual([
    [SILVER, '700'],
    ['rgb(128, 0, 0)', '700'],
    ['rgb(0, 0, 0)', '700'],
    ['rgb(255, 0, 0)', '700'],
  ]);

  // On, from Options → Appearance: the drawn rows change at once.
  const menuSel = page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-mrow.is-sel');
  await page.keyboard.press('Escape');
  await page.locator('.wc-overlay .wc-mrow[data-key="options"] .wc-label').click();
  await page.locator('.wc-overlay .wc-mrow[data-key="appearance"] .wc-label').click();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
  await expect(menuSel).toHaveText('<< Bold brightens colours: Off >>');
  await page.keyboard.press('Enter');
  await expect(menuSel).toHaveText('<< Bold brightens colours: On >>');
  expect(await page.evaluate(() => window.__wc!.settings.get().appearance.boldBright)).toBe(true);
  // Default fg (silver) → bright white; red → bright red; inverse untouched.
  await expect.poll(colours).toEqual([
    [W, '700'],
    ['rgb(255, 0, 0)', '700'],
    ['rgb(0, 0, 0)', '700'],
    ['rgb(255, 0, 0)', '700'],
  ]);

  // Paper: ink is already black, so the default fg stays black; red
  // takes the paper palette's bright red.
  await page.evaluate(() =>
    window.__wc!.settings.update({
      appearance: {
        bg: '#f4ecd8',
        fg: '#000000',
        ansi: ['#000000', '#a01c1c', '#2a6e1a', '#7a5c00', '#1c3c9a', '#8a2a8a', '#106a72', '#4a4538',
          '#6e6858', '#c42020', '#2f7a14', '#846400', '#2a56c8', '#a828a8', '#00737e', '#000000'],
      },
    }),
  );
  await expect.poll(async () => (await colours()).slice(0, 2)).toEqual([
    ['rgb(0, 0, 0)', '700'],
    ['rgb(196, 32, 32)', '700'],
  ]);

  // Off again; persisted across a reload while on.
  await page.keyboard.press('Enter');
  await expect(menuSel).toHaveText('<< Bold brightens colours: Off >>');
  await expect.poll(async () => (await colours())[1]).toEqual(['rgb(160, 28, 28)', '700']);
  await page.evaluate(async () => {
    window.__wc!.settings.update({ appearance: { boldBright: true } });
    await window.__wc!.settings.flush();
  });
  await page.reload();
  await expect(page.locator('.wc-app')).toBeVisible();
  expect(await page.evaluate(() => window.__wc!.settings.get().appearance.boldBright)).toBe(true);
  expect(await rootVar(page, '--bold-1')).toBe('#c42020');
  await page.evaluate(async () => {
    window.__wc!.settings.reset();
    await window.__wc!.settings.flush();
  });
});
