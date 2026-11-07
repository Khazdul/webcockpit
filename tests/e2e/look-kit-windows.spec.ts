// Stage 42d (ADR 0127): the one in-game window frame (Lykta) on dark and
// Paper, its title and note (defaults and `useWindowChrome`), the opaque
// body without blur, the focus dimming, look frames on the free body
// (Scripts, stage 44), old-look frames on a whole-cell grid, and the kit gallery's Windows section (a look
// frame in the place `window` setting the title, a sub-page and back, a
// resize in whole cells).
import { type Page, expect, test } from '@playwright/test';
import { kitSection, openKit, openWin, win, winNote, winTitle, winTop } from './look';

const field = (page: Page) => page.locator('.wc-input-field');

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function offline(page: Page): Promise<void> {
  await page.goto('/?replay');
  await expect(field(page)).toBeFocused();
  await expect(page.locator('.wc-mb-bar')).toBeVisible();
}

test('the Lykta frame in the game: hood, title and note, opaque body, a look frame on the free body', async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  await openWin(page, 'scripts');
  await openWin(page, 'profile');
  await expect(winTitle(page, 'profile')).toHaveText('Profile');
  await expect(winNote(page, 'profile')).toHaveText('default');
  await expect(winTitle(page, 'scripts')).toHaveText('Scripts');
  await expect(winNote(page, 'scripts')).toHaveCount(0);
  const w = win(page, 'profile');
  await expect(w.locator('.wc-win-br')).toHaveCount(4);
  await expect(w).not.toHaveAttribute('data-look', /.*/);
  const look = await w.evaluate((el) => {
    const cs = getComputedStyle(el);
    const body = getComputedStyle(el.querySelector('.wc-win-body')!);
    const hood = el.querySelector('.wc-win-hood')!.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return {
      iron: cs.backgroundImage.includes('gradient'),
      blur: body.backdropFilter,
      bodyBg: body.backgroundColor,
      // The hood is centred on the window.
      hoodOff: Math.abs(hood.left + hood.width / 2 - (box.left + box.width / 2)),
      titleFont: getComputedStyle(el.querySelector('.wc-win-t')!).fontFamily,
    };
  });
  expect(look.iron).toBe(true);
  expect(['none', '']).toContain(look.blur);
  expect(look.hoodOff).toBeLessThan(1.5);
  expect(look.titleFont).toContain('Cinzel');
  // Scripts is a look frame since stage 44: the free body, filling the content box
  // (the old-look grid on whole cells is the gallery's `kit-grid` window, below).
  const s = await win(page, 'scripts').evaluate((el) => {
    const f = el.querySelector('.wc-frame:not([hidden])')!.getBoundingClientRect();
    const c = el.querySelector('.wc-win-content')!.getBoundingClientRect();
    return {
      dw: Math.abs(f.width - c.width),
      dh: Math.abs(f.height - c.height),
      inside: f.left >= c.left - 0.5 && f.top >= c.top - 0.5 && f.right <= c.right + 0.5 && f.bottom <= c.bottom + 0.5,
    };
  });
  expect(s.dw).toBeLessThan(1);
  expect(s.dh).toBeLessThan(1);
  expect(s.inside).toBe(true);
  await expect(winTop(page, 'scripts')).toHaveClass(/wc-win-look/);
  await expect(winTop(page, 'scripts')).not.toHaveClass(/wc-win-grid/);
  // Without the focus the content goes to 55 %.
  await expect(win(page, 'scripts')).not.toHaveAttribute('data-focused', '');
  await expect
    .poll(() => win(page, 'scripts').locator('.wc-win-content').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('0.55');
  expect(errors).toEqual([]);
});

test('Paper: a light game background gives the bronze frame and a dark title', async ({ page }) => {
  await offline(page);
  await openWin(page, 'scripts');
  const dark = await winTitle(page, 'scripts').evaluate((el) => getComputedStyle(el).color);
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8' } }));
  await expect(page.locator('.wc-windows')).toHaveAttribute('data-light', '');
  // A dark, engraved title on bronze: low luminance (after the title's colour transition).
  const luma = async (): Promise<number> => {
    const c = await winTitle(page, 'scripts').evaluate((el) => getComputedStyle(el).color);
    const [r, g, b] = c.match(/\d+/g)!.map(Number);
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  await expect.poll(luma).toBeLessThan(80);
  expect(await winTitle(page, 'scripts').evaluate((el) => getComputedStyle(el).color)).not.toBe(dark);
});

test('the gallery: a look frame in a window sets the title; a sub-page and back; resize in whole cells', async ({ page }) => {
  const errors = watchErrors(page);
  await openKit(page, 'windows');
  const sec = kitSection(page, 'windows');
  const look = sec.locator('.wc-kitwin-stage[data-bg="dark"] .wc-win[data-win="kit-look"]');
  await expect(look).toHaveAttribute('data-focused', '');
  await expect(look.locator('.wc-win-t')).toHaveText('Kit');
  await expect(look.locator('.wc-win-n')).toHaveText('a look frame');
  await expect(look.locator('[data-place]')).toHaveText('window');
  await expect(look.locator('.wc-win-content .wc-frame:not([hidden])')).toHaveClass(/wc-look/);
  // The old-look window beside it: its grid frame and the defaults.
  const old = sec.locator('.wc-kitwin-stage[data-bg="dark"] .wc-win[data-win="kit-grid"]');
  await expect(old.locator('.wc-win-content .wc-frame')).toHaveClass(/wc-win-grid/);
  await expect(old).not.toHaveAttribute('data-focused', '');
  // A sub-page sets its own chrome; Back reverts it; the frame stays the same element.
  const handle = await look.elementHandle();
  await look.locator('[data-btn="SUB"]').click();
  await expect(look.locator('.wc-win-t')).toHaveText('Sub-page');
  await expect(look.locator('.wc-win-n')).toHaveText('pushed');
  expect(await handle!.evaluate((el) => el.isConnected)).toBe(true);
  await look.locator('.wc-lk-iback').click();
  await expect(look.locator('.wc-win-t')).toHaveText('Kit');
  // A press on the other window focuses it.
  await old.locator('.wc-win-bar').click({ position: { x: 30, y: 10 } });
  await expect(old).toHaveAttribute('data-focused', '');
  await expect(look).not.toHaveAttribute('data-focused', '');
  // The grip: two cells narrower, one shorter.
  const cell = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { w: parseFloat(cs.getPropertyValue('--cell-w')), h: parseFloat(cs.getPropertyValue('--cell-h')) };
  });
  const before = (await look.boundingBox())!;
  const g = (await look.locator('.wc-win-grip').boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 - cell.w * 2, g.y + g.height / 2 - cell.h, { steps: 3 });
  await page.mouse.up();
  const after = (await look.boundingBox())!;
  expect(Math.round((before.width - after.width) / cell.w)).toBe(2);
  expect(Math.round((before.height - after.height) / cell.h)).toBe(1);
  // The Paper stage: bronze.
  await expect(sec.locator('.wc-kitwin-stage[data-bg="paper"] .wc-windows')).toHaveAttribute('data-light', '');
  expect(errors).toEqual([]);
});
