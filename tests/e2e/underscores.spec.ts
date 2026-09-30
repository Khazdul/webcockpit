// ADR 0042: every underscore shows outside the profile editor too. The cell
// is lower than the font's ascent + descent, so the lowest descender row,
// where DejaVu Sans Mono draws `_`, can fall outside a one-cell line box
// and be clipped. The tests screenshot the cells and count the lit pixels,
// as tests/e2e/editor.spec.ts does for the editor (ADR 0037).
import { type Locator, type Page, expect, test } from '@playwright/test';

const DEMO = '/?fixture=gmcp-demo.log&speed=0';
/** Underscores in cells 1 and 3; cell 2 (`h`, no descender) is the background sample. */
const NAME = 'x_h_two';
const ABOVE = 'x_h_one';
const BELOW = 'x_h_zed';

/** DejaVu 15 is the default; Firefox lost the underscores at all four DejaVu sizes before the fix. */
const LOOKS = [
  ['dejavu', 15],
  ['dejavu', 10],
  ['dejavu', 13],
  ['dejavu', 20],
  ['jetbrains', 15],
] as const;

async function look(page: Page, font: string, size: number): Promise<void> {
  await page.evaluate(([f, s]) => window.__wc!.settings.update({ appearance: { font: f as 'dejavu', size: s as number } }), [font, size] as const);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

/**
 * How much of the two underscores of `needle` shows (its cells 1 and 3;
 * cell 2 must be a letter without a descender), where `needle` is in
 * the text of `loc` (a row or a field whose text starts at its left edge):
 * lit pixels in the lower part of the cell, plus two pixels below it, where
 * a neighbour of the same background would still show them, as a fraction
 * of the cell width. About 1 for a DejaVu `_`, 0 when it is clipped or
 * painted over.
 */
async function underscoreInk(page: Page, loc: Locator, needle = 'x_h_'): Promise<number> {
  const cell = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { w: parseFloat(cs.getPropertyValue('--cell-w')), h: parseFloat(cs.getPropertyValue('--cell-h')) };
  });
  // Text and box in one step: a pane may redraw its rows at any time.
  const { text, x, y } = await loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { text: el instanceof HTMLInputElement ? el.value : (el.textContent ?? ''), x: r.left, y: r.top };
  });
  const at = text.toLowerCase().indexOf(needle);
  expect(at, `"${needle}" in "${text}"`).toBeGreaterThanOrEqual(0);
  const n = 5;
  const png = await page.screenshot({ clip: { x: x + at * cell.w, y, width: cell.w * n, height: cell.h + 2 } });
  const ink = await page.evaluate(
    async ({ b64, n, frac }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const cv = document.createElement('canvas');
      cv.width = bmp.width;
      cv.height = bmp.height;
      const g = cv.getContext('2d')!;
      g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      const px = (x: number, y: number): number[] => [d[(y * cv.width + x) * 4]!, d[(y * cv.width + x) * 4 + 1]!, d[(y * cv.width + x) * 4 + 2]!];
      const diff = (p: number[], q: number[]): number => Math.abs(p[0]! - q[0]!) + Math.abs(p[1]! - q[1]!) + Math.abs(p[2]! - q[2]!);
      const cw = cv.width / n;
      const ch = cv.height * frac;
      const refX = Math.floor(2.5 * cw);
      const rowBg = px(refX, Math.floor(ch * 0.97) - 1);
      return [1, 3].map((col) => {
        let lit = 0;
        for (let y = Math.floor(ch * 0.6); y < cv.height; y++) {
          const bg = px(refX, y);
          // A pixel row that belongs to a neighbour with another background hides the glyph.
          if (diff(bg, rowBg) > 60) continue;
          for (let x = Math.floor(col * cw); x < Math.min(cv.width, Math.floor((col + 1) * cw)); x++) if (diff(px(x, y), bg) > 60) lit++;
        }
        return lit / cw;
      });
    },
    { b64: png.toString('base64'), n, frac: cell.h / (cell.h + 2) },
  );
  return Math.min(...ink);
}

async function expectInk(page: Page, targets: Array<[string, Locator]>, where: string): Promise<void> {
  for (const [name, loc] of targets) {
    const ink = await underscoreInk(page, loc);
    expect(ink, `${name}, ${where}: underscore ink ${ink.toFixed(2)}`).toBeGreaterThan(0.5);
  }
}

async function openProfiles(page: Page): Promise<void> {
  await page.routeWebSocket('wss://mume.org/ws-play/', () => {});
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.evaluate(
    async ([a, b, c]) => {
      const p = window.__wc!.shell.profiles;
      await p.init();
      for (const n of [a, b, c]) await p.create(n!, '');
      window.__wc!.settings.update({ profile: b! });
    },
    [ABOVE, NAME, BELOW],
  );
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-title-row .wc-c-section')).toHaveText('─── Profile ───');
}

for (const dpr of [1, 1.5]) {
  test.describe(`underscores at device pixel ratio ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });

    test('a profile name keeps its underscores in the Profiles list and the name field', async ({ page }) => {
      await openProfiles(page);
      const table = page.locator('.wc-start .wc-frame:not([hidden]) .wc-table');
      const row = (name: string): Locator => table.locator('.wc-tr', { hasText: name });
      await expect(table.locator('.wc-tr.is-cur-focus')).toContainText(NAME);
      for (const [font, size] of LOOKS) {
        await look(page, font, size);
        await expectInk(
          page,
          [
            ['row above the cursor band', row(ABOVE)],
            ['cursor row', row(NAME)],
            ['row below the cursor band', row(BELOW)],
          ],
          `${font} ${size}`,
        );
      }
      // Rows are still exactly one cell high.
      const cellH = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-h')));
      expect(await row(NAME).evaluate((el) => el.parentElement!.getBoundingClientRect().height)).toBe(cellH);
      expect(await row(NAME).evaluate((el) => el.getBoundingClientRect().height)).toBe(cellH);

      // RENAME: the name in the text field and in the line above it.
      await page.locator('.wc-start [data-btn="RENAME"]').click();
      const frame = page.locator('.wc-start .wc-frame:not([hidden])');
      const field = frame.locator('input.wc-field');
      await expect(field).toHaveValue(NAME);
      const prompt = frame.locator('.wc-line > span', { hasText: `Rename "${NAME}" to:` });
      for (const [font, size] of LOOKS) {
        await look(page, font, size);
        await expectInk(
          page,
          [
            ['name field', field],
            ['rename prompt', prompt],
          ],
          `${font} ${size}`,
        );
      }
      expect(await field.evaluate((el) => el.getBoundingClientRect().height)).toBe(
        await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-h'))),
      );
    });

    test('the cockpit keeps underscores: last output row, input line, pane rows, ESC header', async ({ page }) => {
      await page.goto(DEMO);
      const rows = page.locator('.wc-output .wc-row:not(.wc-partial)');
      await expect(rows.filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
      await expect(page.locator('.wc-pane[data-pane="timers"]')).toHaveAttribute('data-active', '');
      await page.evaluate(async (name) => {
        const wc = window.__wc!;
        await wc.shell.profiles.init();
        await wc.shell.profiles.create(name, '');
        wc.settings.update({ profile: name });
        const now = Date.now();
        wc.app.game.timers.debugAdd({ id: 'c1', name, group: 'charm', startedAt: now, expiresAt: now + 3_000_000, expected: 3_600_000, tracked: true } as never);
        wc.app.bus.emit('ui.message', { kind: 'system', parts: [{ value: name }, ' logged in.'] });
        // Enough lines that the last one sits on the pane's bottom edge.
        for (let i = 0; i < 120; i++) wc.app.bus.emit('sys.message', { text: `${name} ${i}` });
      }, NAME);
      await expect(rows.last()).toHaveText(`[SYSTEM] ${NAME} 119`);
      const input = page.locator('.wc-input-field');
      await input.click();
      await page.keyboard.type(NAME);
      await expect(input).toHaveValue(NAME);
      const targets: Array<[string, Locator]> = [
        ['last output row', rows.last()],
        ['output row above a row', rows.nth(-3)],
        ['input line', input],
        ['Timers pane row', page.locator('.wc-pane[data-pane="timers"] .wc-prow', { hasText: /x_h_two/i })],
        ['UI pane, last message', page.locator('.wc-pane[data-pane="ui"] .wc-ui-row').last()],
      ];
      for (const [font, size] of LOOKS) {
        await look(page, font, size);
        await expect(rows.last()).toHaveText(`[SYSTEM] ${NAME} 119`);
        await expectInk(page, targets, `${font} ${size}`);
      }
      const cellH = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-h')));
      expect(await rows.last().evaluate((el) => el.getBoundingClientRect().height)).toBe(cellH);
      expect(await input.evaluate((el) => el.getBoundingClientRect().height)).toBe(cellH);

      // The ESC menu header names the profile.
      await page.keyboard.press('Escape');
      const header = page.locator('.wc-overlay .wc-esc-header span', { hasText: NAME });
      await expect(header).toHaveCount(1);
      for (const [font, size] of LOOKS) {
        await look(page, font, size);
        await expectInk(page, [['ESC menu header', header]], `${font} ${size}`);
      }
    });
  });
}
