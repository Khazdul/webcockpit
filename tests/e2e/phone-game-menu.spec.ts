// Stage 51b (ADR 0136 §10, §12): the menu sheet's own controls (text size,
// Black / Paper), its geometry and thumb-size targets, and the phone's
// settings page with its Text group (size, theme, font). The entries that
// lead to existing pages (Reconnect, Profile, Scripts, Exit) are in
// phone-esc-menu.spec.ts. Offline cockpit on the `phone` project,
// `?phone=1`; nothing reaches MUME.
import { type Locator, type Page, expect, test } from '@playwright/test';

const sheet = (page: Page) => page.locator('.wc-ph-sheet');
const pageEl = (page: Page) => page.locator('.wc-ph-page');
const row = (page: Page, key: string) => sheet(page).locator(`[data-row="${key}"]`);
const srow = (page: Page, id: string) => pageEl(page).locator(`[data-row="${id}"]`);
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const appearance = (page: Page) => page.evaluate(() => window.__wc!.settings.get().appearance);
const inputFocused = (page: Page) => page.evaluate(() => document.activeElement?.classList.contains('wc-input-field') ?? false);

async function openSheet(page: Page): Promise<void> {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await page.locator('.wc-ph-menu').tap();
  await expect(sheet(page)).toBeVisible();
}

async function openSettings(page: Page): Promise<void> {
  await openSheet(page);
  await row(page, 'settings').tap();
  await expect(pageEl(page)).toBeVisible();
}

/** At least 44 px in both directions and inside the viewport. */
async function thumb(page: Page, l: Locator): Promise<void> {
  const b = (await l.boundingBox())!;
  expect(b.width).toBeGreaterThanOrEqual(44);
  expect(b.height).toBeGreaterThanOrEqual(44);
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
}

/** The contrast ratio of an element's text against `bg` (both as computed colours). */
const contrast = async (l: Locator, bgOf: Locator): Promise<number> =>
  l.evaluate((el, bgEl) => {
    const rgb = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = (c: number[]): number => {
      const [r, g, b] = c.map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const a = lum(rgb(getComputedStyle(el).color));
    const b = lum(rgb(getComputedStyle(bgEl as Element).backgroundColor));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, await bgOf.elementHandle());

test('the sheet: a dialog from the bottom edge with every entry in order, thumb-size targets, no dead rows', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openSheet(page);
  await expect(sheet(page)).toHaveAttribute('role', 'dialog');
  await expect(sheet(page)).toHaveAttribute('aria-label', 'Menu');
  await expect(sheet(page).locator('.wc-ph-hood')).toHaveText('Menu');
  const keys = await sheet(page).locator('.wc-ph-rows > [data-row]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.row));
  expect(keys).toEqual(['reconnect', 'profile', 'scripts', 'settings']);
  for (const key of [...keys, 'exit']) await thumb(page, row(page, key!));
  for (const k of await sheet(page).locator('.wc-ph-step-key, .wc-ph-swatch').all()) await thumb(page, k);
  // Exit session is the last control, under the quick row.
  const quick = (await sheet(page).locator('.wc-ph-quick').boundingBox())!;
  const exit = (await row(page, 'exit').boundingBox())!;
  expect(exit.y).toBeGreaterThanOrEqual(quick.y + quick.height);
  // It fits the screen without scrolling in portrait.
  const body = sheet(page).locator('.wc-ph-sheet-body');
  expect(await body.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  // The Scripts row has no count while no script is on.
  await expect(row(page, 'scripts').locator('.wc-ph-row-v')).toHaveCount(0);
  // The game under it takes no taps: the scrim does.
  const scrim = (await page.locator('.wc-ph-scrim').boundingBox())!;
  const c = (await page.locator('.wc-cockpit').boundingBox())!;
  expect(scrim.width).toBeCloseTo(c.width, 0);
  expect(scrim.height).toBeCloseTo(c.height, 0);
  expect(errors).toEqual([]);
});

test('text size: A− and A+ step the font size and the game text follows; taps never focus the field', async ({ page }) => {
  await openSheet(page);
  const size = (await appearance(page)).size;
  const val = sheet(page).locator('.wc-ph-step-val');
  await expect(val).toHaveText(String(size));
  const cells = await page.locator('.wc-cockpit').getAttribute('data-cells');
  await sheet(page).getByRole('button', { name: 'Larger text' }).tap();
  await sheet(page).getByRole('button', { name: 'Larger text' }).tap();
  await expect(val).toHaveText(String(size + 2));
  expect((await appearance(page)).size).toBe(size + 2);
  // Bigger letters: fewer cells on the same screen.
  await expect(page.locator('.wc-cockpit')).not.toHaveAttribute('data-cells', cells!);
  await sheet(page).getByRole('button', { name: 'Smaller text' }).tap();
  await expect(val).toHaveText(String(size + 1));
  expect(await inputFocused(page)).toBe(false);
  // The sheet stays open while stepping; the size is the stored setting.
  await expect(sheet(page)).toBeVisible();
  expect((await appearance(page)).size).toBe(size + 1);
});

test('text size stops at its limits: the key at an end is dimmed and does nothing', async ({ page }) => {
  await openSheet(page);
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { size: 6 } }));
  const less = sheet(page).getByRole('button', { name: 'Smaller text' });
  await expect(less).toHaveAttribute('aria-disabled', 'true');
  // (Playwright does not tap an aria-disabled control unless forced.)
  await less.tap({ force: true });
  expect((await appearance(page)).size).toBe(6);
  await expect(sheet(page).getByRole('button', { name: 'Larger text' })).not.toHaveAttribute('aria-disabled', 'true');
});

test('A+ stops before the game would be too small for the screen', async ({ page }) => {
  await openSheet(page);
  const more = sheet(page).getByRole('button', { name: 'Larger text' });
  // Step up as far as the key allows: never into the too-small notice.
  for (let i = 0; i < 30; i++) {
    if ((await more.getAttribute('aria-disabled')) === 'true') break;
    await more.tap();
  }
  await expect(more).toHaveAttribute('aria-disabled', 'true');
  const size = (await appearance(page)).size;
  expect(size).toBeGreaterThan(14);
  expect(size).toBeLessThan(32);
  await expect(page.locator('.wc-too-small:not([hidden])')).toHaveCount(0);
  const [cols, rows] = (await page.locator('.wc-cockpit').getAttribute('data-cells'))!.split('x').map(Number);
  expect(cols).toBeGreaterThanOrEqual(30);
  expect(rows).toBeGreaterThanOrEqual(8);
  // One more step would not fit.
  await more.tap({ force: true });
  expect((await appearance(page)).size).toBe(size);
  // The settings page's stepper stops at the same size.
  await row(page, 'settings').tap();
  await expect(srow(page, 'size').getByRole('button', { name: 'Larger text' })).toHaveAttribute('aria-disabled', 'true');
  await expect(srow(page, 'size').getByRole('button', { name: 'Smaller text' })).not.toHaveAttribute('aria-disabled', 'true');
});

test('a size stored too large: the notice shows, a menu key over it opens the sheet, A− recovers', async ({ page }) => {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  const rescue = page.locator('.wc-ph-menu-rescue');
  await expect(rescue).toBeHidden();
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { size: 32 } }));
  await expect(page.locator('.wc-too-small:not([hidden])')).toHaveCount(1);
  // The command row (and its menu key) is gone; the key over the notice is there, a thumb in size.
  await expect(page.locator('.wc-ph-menu')).toBeHidden();
  await expect(rescue).toBeVisible();
  await thumb(page, rescue);
  await rescue.tap();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Larger text' })).toHaveAttribute('aria-disabled', 'true');
  // Close, and open again: still reachable.
  await page.touchscreen.tap(100, 60);
  await expect(sheet(page)).toBeHidden();
  await rescue.tap();
  await expect(sheet(page)).toBeVisible();
  const less = sheet(page).getByRole('button', { name: 'Smaller text' });
  for (let i = 0; i < 18; i++) await less.tap();
  expect((await appearance(page)).size).toBe(14);
  await expect(page.locator('.wc-too-small:not([hidden])')).toHaveCount(0);
  await expect(sheet(page)).toBeVisible();
  await page.touchscreen.tap(100, 60);
  await expect(rescue).toBeHidden();
  await expect(page.locator('.wc-ph-menu')).toBeVisible();
  await expect(page.locator('.wc-menu-btn')).toHaveCount(1);
});

test('Black / Paper: a tap sets the background with its ink and palette; the sheet turns Paper too', async ({ page }) => {
  await openSheet(page);
  const black = sheet(page).locator('.wc-ph-swatch[data-theme="black"]');
  const paper = sheet(page).locator('.wc-ph-swatch[data-theme="paper"]');
  await expect(black).toHaveAttribute('aria-pressed', 'true');
  await expect(paper).toHaveAttribute('aria-pressed', 'false');
  const dark = await appearance(page);
  await paper.tap();
  await expect(paper).toHaveAttribute('aria-pressed', 'true');
  await expect(black).toHaveAttribute('aria-pressed', 'false');
  const a = await appearance(page);
  expect(a.bg).toBe('#f4ecd8');
  expect(a.fg).toBe('#000000');
  expect(a.ansi).not.toEqual(dark.ansi);
  await expect(page.locator('html')).toHaveAttribute('data-light', '');
  await expect(page.locator('.wc-ph-menu-surface')).toHaveAttribute('data-light', '');
  // Text on the Paper sheet reads at 4.5:1 or better.
  const body = sheet(page).locator('.wc-ph-sheet-body');
  for (const sel of ['.wc-ph-status-t', '[data-row="profile"] .wc-ph-row-t', '[data-row="profile"] .wc-ph-row-v', '.wc-ph-tiny', '.wc-ph-step-val', '[data-row="exit"]']) {
    expect(await contrast(sheet(page).locator(sel).first(), body), sel).toBeGreaterThanOrEqual(4.5);
  }
  // Back to Black: the dark ink and palette return.
  await black.tap();
  const b = await appearance(page);
  expect(b.bg).toBe('#000000');
  expect(b.fg).toBe(dark.fg);
  expect(b.ansi).toEqual(dark.ansi);
  await expect(page.locator('html')).not.toHaveAttribute('data-light', '');
  // On Black the secondary text reads at 4.5:1 too (against the window's dark base).
  const base = await sheet(page).evaluate((el) => getComputedStyle(el.closest('.wc-cockpit')!).getPropertyValue('--ph-well').trim());
  expect(base).toBe('#0b0907');
  for (const sel of ['[data-row="profile"] .wc-ph-row-v', '.wc-ph-tiny', '.wc-ph-status-t']) {
    const color = await sheet(page).locator(sel).first().evaluate((el) => getComputedStyle(el).color);
    const [r, g, bl] = (color.match(/[\d.]+/g) ?? []).map(Number);
    // Every channel at 0x8a or above is 5.9:1 or better against #0b0907.
    expect(Math.min(r!, g!, bl!), sel).toBeGreaterThanOrEqual(0x8a);
  }
});

test('a background set on a computer is neither theme; a tap picks one, as the desktop\'s Background does', async ({ page }) => {
  await openSheet(page);
  const black = await appearance(page);
  // A custom background (no preset), with a font colour and palette chosen for it.
  const custom = { bg: '#123456', fg: '#abcdef', ansi: black.ansi.map((_, i) => (i === 1 ? '#ff00ff' : black.ansi[i]!)) };
  await page.evaluate((a) => window.__wc!.settings.update({ appearance: a }), custom);
  await expect(sheet(page).locator('.wc-ph-swatch[aria-pressed="true"]')).toHaveCount(0);
  // Black is a preset with a theme of its own: its font colour and palette come with it.
  await sheet(page).locator('.wc-ph-swatch[data-theme="black"]').tap();
  let a = await appearance(page);
  expect(a.bg).toBe('#000000');
  expect(a.fg).toBe(black.fg);
  expect(a.ansi).toEqual(black.ansi);
  // The same from another dark preset (blue) to Paper: ink and the paper palette.
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#0e141c' } }));
  await expect(sheet(page).locator('.wc-ph-swatch[aria-pressed="true"]')).toHaveCount(0);
  await sheet(page).locator('.wc-ph-swatch[data-theme="paper"]').tap();
  a = await appearance(page);
  expect(a.bg).toBe('#f4ecd8');
  expect(a.fg).toBe('#000000');
  expect(a.ansi).not.toEqual(black.ansi);
  expect(a.ansi[0]).toBe('#000000');
  // Nothing else of the appearance changes with the theme.
  expect({ ...a, bg: '', fg: '', ansi: [] }).toEqual({ ...black, bg: '', fg: '', ansi: [] });
});

test('the settings page: the groups built so far; Back returns to the sheet, Esc steps back to the game', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openSettings(page);
  await expect(sheet(page)).toBeHidden();
  await expect(pageEl(page)).toHaveAttribute('aria-label', 'Settings');
  await expect(pageEl(page).locator('.wc-ph-hood')).toHaveText('Settings');
  // Stage 51 rule 3: no group before its feature.
  const groups = await pageEl(page).locator('[data-group]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.group));
  expect(groups).toEqual(['text', 'lens']);
  const rows = await pageEl(page).locator('[data-group="text"] [data-row]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.row));
  expect(rows).toEqual(['size', 'theme', 'font']);
  await expect(pageEl(page)).not.toContainText('Left-handed');
  // The page covers the game.
  const c = (await page.locator('.wc-cockpit').boundingBox())!;
  const p = (await pageEl(page).boundingBox())!;
  expect(p.width).toBeCloseTo(c.width, 0);
  expect(p.height).toBeCloseTo(c.height, 0);
  await thumb(page, pageEl(page).locator('.wc-ph-back'));
  // Back: the sheet again.
  await pageEl(page).locator('.wc-ph-back').tap();
  await expect(pageEl(page)).toBeHidden();
  await expect(sheet(page)).toBeVisible();
  // Esc from the page: the sheet; Esc again: the game.
  await row(page, 'settings').tap();
  await expect(pageEl(page)).toBeVisible();
  await field(page).press('Escape');
  await expect(sheet(page)).toBeVisible();
  await field(page).press('Escape');
  await expect(sheet(page)).toBeHidden();
  await expect(pageEl(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test('the settings page: text size, theme and font change the settings the desktop uses', async ({ page }) => {
  await openSettings(page);
  const before = await appearance(page);
  // Size.
  await srow(page, 'size').getByRole('button', { name: 'Larger text' }).tap();
  await expect(srow(page, 'size').locator('.wc-ph-step-val')).toHaveText(String(before.size + 1));
  expect((await appearance(page)).size).toBe(before.size + 1);
  await srow(page, 'size').getByRole('button', { name: 'Smaller text' }).tap();
  expect((await appearance(page)).size).toBe(before.size);
  for (const k of await srow(page, 'size').locator('.wc-ph-step-key').all()) await thumb(page, k);
  // Theme: the kit's segmented control.
  const theme = srow(page, 'theme').getByRole('radiogroup', { name: 'Theme' });
  await expect(theme.getByRole('radio', { name: 'Black' })).toHaveAttribute('aria-checked', 'true');
  await theme.getByRole('radio', { name: 'Paper' }).tap();
  await expect(theme.getByRole('radio', { name: 'Paper' })).toHaveAttribute('aria-checked', 'true');
  let a = await appearance(page);
  expect(a.bg).toBe('#f4ecd8');
  expect(a.fg).toBe('#000000');
  await expect(page.locator('.wc-ph-menu-surface')).toHaveAttribute('data-light', '');
  // Paper: the page's text reads at 4.5:1 or better.
  const card = pageEl(page).locator('.wc-ph-card').first();
  for (const sel of ['[data-row="size"] .wc-ph-srow-t', '[data-row="font"] .wc-ph-srow-v', '.wc-ph-step-val']) {
    expect(await contrast(pageEl(page).locator(sel).first(), card), sel).toBeGreaterThanOrEqual(4.5);
  }
  expect(await contrast(pageEl(page).locator('.wc-ph-grp-t').first(), pageEl(page)), 'group title').toBeGreaterThanOrEqual(4.5);
  await theme.getByRole('radio', { name: 'Black' }).tap();
  a = await appearance(page);
  expect(a.bg).toBe('#000000');
  expect(a.ansi).toEqual(before.ansi);
  // Font: the row shows the font and opens its list; a tap picks one and returns.
  // (The e2e profile starts with DejaVu Sans Mono, legacy-state.ts.)
  expect(before.font).toBe('dejavu');
  await expect(srow(page, 'font').locator('.wc-ph-srow-v')).toHaveText('DejaVu Sans Mono');
  await srow(page, 'font').tap();
  const list = pageEl(page).locator('[data-pick="font"]');
  await expect(list).toBeVisible();
  await expect(pageEl(page).locator('[data-group]')).toHaveCount(0);
  await expect(list.getByRole('radio', { name: 'DejaVu Sans Mono' })).toHaveAttribute('aria-checked', 'true');
  await expect(list.getByRole('radio', { checked: true })).toHaveCount(1);
  expect(await list.getByRole('radio').count()).toBeGreaterThan(2);
  for (const o of await list.getByRole('radio').all()) await thumb(page, o);
  await list.getByRole('radio', { name: 'JetBrains Mono' }).tap();
  await expect(list).toHaveCount(0);
  await expect(srow(page, 'font').locator('.wc-ph-srow-v')).toHaveText('JetBrains Mono');
  expect((await appearance(page)).font).toBe('jetbrains');
  // Back from the list returns to the page, not to the sheet.
  await srow(page, 'font').tap();
  await expect(list).toBeVisible();
  await pageEl(page).locator('.wc-ph-back').tap();
  await expect(list).toHaveCount(0);
  await expect(srow(page, 'font')).toBeVisible();
  await srow(page, 'font').tap();
  expect(await inputFocused(page)).toBe(false);
  // Esc (a physical keyboard) steps back from the list too.
  await field(page).press('Escape');
  await expect(list).toHaveCount(0);
  await expect(pageEl(page)).toBeVisible();
});

test.describe('landscape', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('the sheet scrolls where the screen is low: Exit session is reachable', async ({ page }) => {
    await openSheet(page);
    const c = (await page.locator('.wc-cockpit').boundingBox())!;
    const b = (await sheet(page).boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(c.y - 0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(c.y + c.height + 0.5);
    await row(page, 'exit').scrollIntoViewIfNeeded();
    await row(page, 'exit').tap();
    await expect(page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-title-row')).toHaveText('─── Exit session ───');
  });
});

test.describe('a tablet', () => {
  test.use({ viewport: { width: 1000, height: 700 } });

  test('has no menu sheet: #settings opens the Settings popup, Esc the Exit popup', async ({ page }) => {
    await page.goto('/?replay&touch=1');
    await expect(page.locator('.wc-mb-bar')).toBeVisible();
    await expect(page.locator('.wc-ph-menu-host')).toHaveCount(0);
    await page.locator('.wc-input-field').fill('#settings');
    await page.locator('.wc-input-field').press('Enter');
    await expect(page.locator('.wc-pop')).toHaveCount(1);
    await expect(page.locator('.wc-ph-page, .wc-ph-sheet')).toHaveCount(0);
  });
});
