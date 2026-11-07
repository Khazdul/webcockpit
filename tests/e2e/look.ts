// E2E helpers for the new look (stage 42, ADR 0127): open the kit gallery,
// walk the start menu, find the top look box, its dialogs and the in-game
// windows, so the page stages' specs stay short. Not a spec (no tests).
//
// The shell (42-0) holds the shared helpers; each stage 42 package adds its
// own in its marked block below, and only there, so the parallel packages
// never touch the same lines.

import { type Locator, type Page, expect } from '@playwright/test';

// ------------------------------------------------------------ shell (42-0)

/** The start surface's visible frame (the top of its stack). */
export const startTop = (page: Page): Locator => page.locator('.wc-start .wc-frame:not([hidden])');

/** The top look box on the start page (the visible frame's `.wc-lk-box`). */
export const lookBox = (page: Page): Locator => startTop(page).locator('.wc-lk-box').first();

/** The start menu's chosen item's label. */
const menuSel = (page: Page): Locator => startTop(page).locator('.wc-sm-item.is-sel .wc-sm-label');

/** Opens the start page and waits for the menu (Enter MUME chosen). */
export async function openStart(page: Page, query = ''): Promise<void> {
  await page.goto('/' + query);
  await expect(menuSel(page)).toHaveText('Enter MUME');
}

/**
 * Opens the kit gallery (`?kit`, or `?kit=<section>`) and waits for its
 * box; with `section`, also for that section's tab to be the chosen one.
 */
export async function openKit(page: Page, section?: string): Promise<Locator> {
  await page.goto(section ? `/?kit=${encodeURIComponent(section)}` : '/?kit');
  const box = startTop(page).locator('.wc-lk-box.wc-kit');
  await expect(box.locator('.wc-lk-hood-t')).toHaveText('Kit');
  if (section) await expect(box.locator(`.wc-lk-tab[data-tab="${section}"]`)).toHaveAttribute('aria-selected', 'true');
  return box;
}

/** The kit gallery's shown section (`[data-section]`). */
export const kitSection = (page: Page, section: string): Locator =>
  startTop(page).locator(`.wc-kit-section[data-section="${section}"]`);

/** Opens a start-menu item by its key (`profile`, `scripts`, `history`, …) with a click. */
export async function openFromMenu(page: Page, key: string): Promise<void> {
  const row = startTop(page).locator(`.wc-sm-item[data-key="${key}"]`);
  await expect(row).toBeVisible();
  await row.click();
  await expect(row).toBeHidden();
}

/** Leaves the top look page with its Back button (or Esc with `key`), and waits for the frame below. */
export async function backTo(page: Page, opts: { key?: boolean } = {}): Promise<void> {
  const before = await page.locator('.wc-start .wc-frame').count();
  if (opts.key) await page.keyboard.press('Escape');
  else await startTop(page).locator('.wc-lk-back').first().click();
  await expect(page.locator('.wc-start .wc-frame')).toHaveCount(Math.max(1, before - 1));
}

/** A kit dialog by its `data-dlg` (42c: `.wc-lk-dialog[data-dlg]`). */
export const dialog = (page: Page, dlg: string): Locator => page.locator(`.wc-lk-dialog[data-dlg="${dlg}"]`);

/** An in-game window by its id (`profile`, `scripts`). */
export const win = (page: Page, id: string): Locator => page.locator(`.wc-win[data-win="${id}"]`);

/** Emulates `prefers-reduced-motion: reduce` from now on. */
export async function reducedMotion(page: Page, on = true): Promise<void> {
  await page.emulateMedia({ reducedMotion: on ? 'reduce' : 'no-preference' });
}

// ------------------------------------------------------------ 42a (box, layout B, places)

// ------------------------------------------------------------ 42b (controls, widgets, icons, tokens)

/**
 * Opens the gallery's Controls section on a surface (`sky` over the start
 * page's sky, `window` a dark window body, `paper` a Paper one) and returns
 * the surface's element (`.wc-kitc-surface`).
 */
export async function openControls(page: Page, surface: 'sky' | 'window' | 'paper' = 'sky'): Promise<Locator> {
  await page.goto(`/?kit=controls&surface=${surface}`);
  const box = startTop(page).locator('.wc-lk-box.wc-kit');
  await expect(box.locator('.wc-lk-tab[data-tab="controls"]')).toHaveAttribute('aria-selected', 'true');
  const s = kitSection(page, 'controls').locator('.wc-kitc-surface');
  await expect(s).toHaveAttribute('data-surface', surface);
  return s;
}

/** A kit glass button by its `data-btn`. */
export const glassButton = (scope: Page | Locator, id: string): Locator => scope.locator(`.wc-lk-btn[data-btn="${id}"]`);

/** A kit field (`Field`, `TextArea`, `Select`, `Check`, `Toggle`) by its `data-field`. */
export const kitField = (scope: Page | Locator, id: string): Locator => scope.locator(`[data-field="${id}"]`);

/** A `Seg` (by its label) option by its `data-opt`. */
export const segOption = (scope: Page | Locator, label: string, opt: string): Locator =>
  scope.locator(`.wc-lk-seg[aria-label="${label}"] .wc-lk-opt[data-opt="${opt}"]`);

// ------------------------------------------------------------ 42c (overlays, cursors, letters, the stack)

// ------------------------------------------------------------ 42d (window frame, ESC menu host)

// ------------------------------------------------------------ 42e (code look, find panel, LookManual)

// ------------------------------------------------------------ 42f (player core)
