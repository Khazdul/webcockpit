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

// ------------------------------------------------------------ 42c (overlays, cursors, letters, the stack)

// ------------------------------------------------------------ 42d (window frame, ESC menu host)

/** Window `id`'s title in its hood (`.wc-win-t`). */
export const winTitle = (page: Page, id: string): Locator => win(page, id).locator('.wc-win-hood .wc-win-t');

/** Window `id`'s dim note after the title (`.wc-win-n`; absent without a note). */
export const winNote = (page: Page, id: string): Locator => win(page, id).locator('.wc-win-hood .wc-win-n');

/** Window `id`'s visible frame (the top of its stack). */
export const winTop = (page: Page, id: string): Locator => win(page, id).locator('.wc-win-content .wc-frame:not([hidden])');

/** Opens window `id` (`profile`, `scripts`) from the menu bar and waits for it to have the focus. */
export async function openWin(page: Page, id: string): Promise<Locator> {
  await page.locator(`.wc-mb[data-mb="${id}"]`).click();
  await expect(win(page, id)).toHaveAttribute('data-focused', '');
  return win(page, id);
}

/** The phone ESC menu's visible look frame (full screen, place `menu`). */
export const menuLook = (page: Page): Locator => page.locator('.wc-overlay .wc-frame.wc-menu-look:not([hidden])');

// ------------------------------------------------------------ 42e (code look, find panel, LookManual)

// ------------------------------------------------------------ 42f (player core)

/** The player's Back (the run log player's; none in the HTML replay). */
export const playerBack = (page: Page): Locator => page.locator('.wc-player-chrome .wc-pv-back');

/** The player's clock readout (`<b>pos</b> / dur`). */
export const playerClock = (page: Page): Locator => page.locator('.wc-player-chrome .wc-player-clock');

/**
 * A capture log of one run: an inbound line every `step` s from 0 to
 * `secs` (gaps over 10 s would collapse, so the length plays as written),
 * and the last line at exactly `secs`. `baseUs`: the run's start.
 */
export function longLogText(secs: number, step = 5, baseUs = Date.UTC(2026, 8, 27, 20, 0, 0) * 1000): string {
  const ts = (s: number): string => String(baseUs + Math.round(s * 1e6)).padStart(16, '0');
  let text = '';
  let i = 0;
  for (let s = 0; s < secs; s += step) text += `${ts(s)} Line ${++i}: the road runs on.\n`;
  return text + `${ts(secs)} The end.\n`;
}

/**
 * Opens the run log player (`__wc.shell.openPlayerChain`, as History's Run
 * log: Back and `h:mm:ss`) on a log `secs` long, from the start page.
 * Open the start page with `openStart` first: a player opened before its
 * first show would be covered by it. Resolves to the shell's
 * `PlayerOpenResult`.
 */
export async function openLongPlayer(page: Page, secs: number, character = 'Long'): Promise<{ ok: boolean; error?: string }> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  const text = longLogText(secs);
  return page.evaluate(
    ([text, character]) => {
      const w = window as unknown as {
        __wc: { shell: { openPlayerChain(c: unknown[], e: unknown[], i: { character: string }): Promise<{ ok: boolean; error?: string }> } };
      };
      const meta = { runId: `${character}/1`, character, startedUs: Number(text.slice(0, 16)), endedUs: null, sealed: true, bytes: text.length, lines: 0 };
      return w.__wc.shell.openPlayerChain([{ meta, text }], [], { character });
    },
    [text, character] as const,
  );
}
