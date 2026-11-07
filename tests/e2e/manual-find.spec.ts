// Find in the manuals (ADR 0070): Ctrl+F in the Script
// Manual opens the find panel under the manual; in the profile editor's
// Help view (the new look, ADR 0128) it opens LookManual's find bar. Lite
// has no find: Ctrl+F / Ctrl+H do nothing there (ADR 0119). Nothing
// reaches the real server.
import { type Page, expect, test } from '@playwright/test';
import { morphDone } from './look';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

async function mockMume(page: Page): Promise<void> {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.onMessage(() => {});
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const editor = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-sed');
const manual = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-sman');
const ped = (page: Page) => page.locator('.wc-frame:not([hidden]) .wc-pe');
const lib = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(
    ([fn, args]) => {
      const l = window.__wc!.shell.scripts as unknown as Record<string, (...a: unknown[]) => unknown>;
      return Promise.resolve(l[fn as string]!(...(args as unknown[]))) as Promise<unknown>;
    },
    [fn, args] as const,
  );

/** True when the current match is inside the visible part of the manual's text column. */
const currentInView = (page: Page, root: ReturnType<typeof manual>) =>
  root.locator('.wc-ped-manual-rows').evaluate((box) => {
    const cur = box.querySelector('.wc-msearch-cur');
    if (!cur) return false;
    const a = box.getBoundingClientRect();
    const b = cur.getBoundingClientRect();
    return b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
  });

/** Start page → Scripts → EDIT on a user script, then F1: the Script Manual. */
async function openManual(page: Page): Promise<void> {
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await lib(page, 'init');
  await lib(page, 'create', 'findme', '-- @name     findme\n-- @summary  find test\n-- @api      1\n\nlocal x = 1\n');
  // Scripts, under Profile on the start page (stage 32).
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Scripts');
  await page.keyboard.press('Enter');
  const f = startFrame(page);
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  await f.locator('.wc-scr-row[data-script="findme"] .wc-scr-name').click();
  await f.locator('.wc-scr-frame [data-btn="EDIT"]').click();
  await expect(editor(page).locator('.cm-content')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('F1');
  await expect(manual(page)).toBeVisible();
}

/** Start page → Profile → EDIT on `default` holding `text`. */
async function openProfile(page: Page, text: string): Promise<void> {
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async (t) => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', t);
  }, text);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.locator('.wc-start [data-btn="EDIT"]').click();
  await expect(ped(page)).toHaveAttribute('data-view', 'lite');
  await morphDone(page);
}

test('Script Manual: Ctrl+F finds and scrolls to the match; ESC closes the panel, then the manual', async ({ page }) => {
  const errors = watchErrors(page);
  await openManual(page);
  const m = manual(page);
  const rowsH = await m.locator('.wc-ped-manual').evaluate((el) => el.getBoundingClientRect().height);

  await page.keyboard.press('Control+f');
  const panel = m.locator('.wc-search');
  const field = panel.getByRole('textbox', { name: 'Find' });
  await expect(field).toBeFocused();
  // The manual gives the panel its three rows.
  const cellH = await m.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  await expect.poll(() => m.locator('.wc-ped-manual').evaluate((el) => el.getBoundingClientRect().height)).toBeCloseTo(rowsH - 3 * cellH, 0);

  // n and p type into the field (not heading jumps).
  await page.keyboard.type('walks a list in order');
  await expect(field).toHaveValue('walks a list in order');
  await expect(panel.locator('.wc-search-count')).toHaveText(/1 of \d+/);
  await expect(m.locator('.wc-msearch-cur')).toHaveText(/^walks a list in order$/i);
  await expect.poll(() => currentInView(page, m)).toBe(true);
  // The menu's current section follows the match: Enter until it is ipairs's entry.
  const cur = m.locator('.wc-ped-menu .wc-tr.is-cur');
  for (let i = 0; i < 5 && !/^ ipairs\s*$/.test((await cur.textContent()) ?? ''); i++) {
    await page.keyboard.press('Enter');
    await expect.poll(() => currentInView(page, m)).toBe(true);
  }
  await expect(cur).toHaveText(/^ ipairs\s*$/);
  await expect(m.locator('.wc-msearch-cur')).toHaveText('Walks a list in order');

  // A broader query: Enter steps on, Shift+Enter back, wrapping around.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('iterator');
  await expect(panel.locator('.wc-search-count')).toHaveText(/^\s*\d+ of (\d+)\s*$/);
  const total = Number((await panel.locator('.wc-search-count').textContent())!.match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThan(2);
  const at = () => panel.locator('.wc-search-count').textContent().then((t) => Number(t!.match(/(\d+) of/)![1]));
  const a = await at();
  await page.keyboard.press('Enter');
  await expect.poll(at).toBe((a % total) + 1);
  await page.keyboard.press('Shift+Enter');
  await expect.poll(at).toBe(a);
  await expect(m.locator('.wc-msearch-hit, .wc-msearch-cur').first()).toBeVisible();
  await expect.poll(() => currentInView(page, m)).toBe(true);

  // Alt+C: case; a bad regex says so.
  await page.keyboard.press('Alt+c');
  await expect(panel.locator('[data-toggle="caseSensitive"]')).toHaveClass(/is-on/);
  await page.keyboard.press('Alt+c');
  await page.keyboard.press('Alt+r');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('(');
  await expect(panel.locator('.wc-search-count')).toHaveText(/Bad regex/);
  await page.keyboard.press('Alt+r');

  // ESC closes the panel (the manual stays, its height back); ESC again goes back.
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(m).toBeVisible();
  await expect(m.locator('.wc-msearch-hit, .wc-msearch-cur')).toHaveCount(0);
  await expect.poll(() => m.locator('.wc-ped-manual').evaluate((el) => el.getBoundingClientRect().height)).toBeCloseTo(rowsH, 0);

  // Ctrl+F again: the last query is back, selected.
  await page.keyboard.press('Control+f');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('(');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(manual(page)).toHaveCount(0);
  await expect(editor(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('profile Help: Ctrl+F finds in the manual; Esc closes the find, then saves and goes back', async ({ page }) => {
  const errors = watchErrors(page);
  await openProfile(page, '#alias {b} {bee}\n');
  await ped(page).locator('.wc-pe-views [data-opt="help"]').click();
  await expect(ped(page)).toHaveAttribute('data-view', 'help');
  await expect(ped(page).locator('[data-btn="FIND"]')).toBeVisible();
  await page.keyboard.press('Control+f');
  const bar = ped(page).locator('.wc-lk-mfind');
  const field = bar.locator('input');
  await expect(field).toBeFocused();
  await page.keyboard.type('#highlight');
  await expect(bar.locator('.wc-search-count')).toHaveText(/1 of \d+/);
  await page.keyboard.press('F3');
  await expect(bar.locator('.wc-search-count')).toHaveText(/2 of \d+/);
  // The previous button steps back; the field keeps the keys.
  await bar.locator('[data-btn="prev"]').click();
  await expect(bar.locator('.wc-search-count')).toHaveText(/1 of \d+/);
  await expect(field).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(field).toBeHidden();
  await expect(ped(page)).toHaveAttribute('data-view', 'help');
  await expect(ped(page)).toHaveAttribute('data-zone', 'help');
  // The Find button opens it again, with the last query.
  await ped(page).locator('[data-btn="FIND"]').click();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('#highlight');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(ped(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Lite: Ctrl+F and Ctrl+H do nothing (ADR 0119); Editor keeps both', async ({ page }) => {
  const errors = watchErrors(page);
  await openProfile(page, '#alias {k} {kill orc}\n#action {An orc arrives.} {kill orc}\n');
  // Lite's foot has no Find.
  await expect(ped(page).locator('[data-btn="FIND"]')).toHaveCount(0);

  // In the rail and in the list: Lite stays, no search panel, the zone is kept.
  const panel = ped(page).locator('.wc-search');
  await ped(page).locator('[data-rail="action"]').click();
  await expect(ped(page)).toHaveAttribute('data-zone', 'rail');
  for (const zone of ['rail', 'list']) {
    if (zone === 'list') await page.keyboard.press('ArrowRight');
    await expect(ped(page)).toHaveAttribute('data-zone', zone);
    for (const key of ['Control+f', 'Control+h']) {
      await page.keyboard.press(key);
      await expect(ped(page)).toHaveAttribute('data-view', 'lite');
      await expect(ped(page)).toHaveAttribute('data-zone', zone);
      await expect(panel).toHaveCount(0);
    }
  }
  // In the Pattern field too; the text is untouched.
  await page.keyboard.press('ArrowRight');
  const pattern = ped(page).locator('[data-field="pattern"] input');
  await expect(pattern).toBeFocused();
  await page.keyboard.press('Control+f');
  await page.keyboard.press('Control+h');
  await expect(ped(page)).toHaveAttribute('data-view', 'lite');
  await expect(pattern).toBeFocused();
  await expect(pattern).toHaveValue('An orc arrives.');
  await expect(panel).toHaveCount(0);

  // Editor: Ctrl+H opens Replace, Ctrl+F Find.
  await ped(page).locator('.wc-pe-views [data-opt="editor"]').click();
  await expect(ped(page)).toHaveAttribute('data-view', 'editor');
  await ped(page).locator('.cm-content').click();
  await page.keyboard.press('Control+h');
  await expect(panel.locator('[data-field=replace] input')).toBeFocused();
  await page.keyboard.press('Control+f');
  await expect(panel.locator('[data-field=find] input')).toBeFocused();
  await page.keyboard.type('orc');
  await expect(panel.locator('.wc-search-count')).toHaveText(/of 3/);
  expect(errors).toEqual([]);
});
