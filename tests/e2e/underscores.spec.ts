// ADR 0042 / 0043: every underscore shows, in the chrome, the panes, the
// output and the input line. The cell is lower than the font's ascent +
// descent, so the lowest descender row, where DejaVu Sans Mono draws `_`,
// falls outside a one-cell line box at many settings. The fix is a one-glyph
// face ("WebCockpit Underscore") whose `_` ends inside the cell; text is not
// moved, so accented capitals keep the marks they had (tested below). The
// tests screenshot the cells and count the lit pixels inside the cell, as
// tests/e2e/editor.spec.ts does for the editor (ADR 0037).
//
// Pixel ratios come from tests/e2e/dpr.ts (Firefox needs a pref for them).
import { type Locator, type Page, expect, test } from '@playwright/test';
import { dprTest, expectDpr } from './dpr';

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

const it = dprTest;

function useDpr(dpr: number): void {
  it.use({ dpr });
}

/**
 * `page.screenshot` with one retry: Chromium under load now and then answers
 * "Unable to capture screenshot" for a clip.
 */
async function shoot(page: Page, clip: { x: number; y: number; width: number; height: number }): Promise<Buffer> {
  try {
    return await page.screenshot({ clip });
  } catch {
    await page.waitForTimeout(200);
    return page.screenshot({ clip });
  }
}

async function cellSize(page: Page): Promise<{ w: number; h: number }> {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { w: parseFloat(cs.getPropertyValue('--cell-w')), h: parseFloat(cs.getPropertyValue('--cell-h')) };
  });
}

async function look(page: Page, font: string, size: number): Promise<void> {
  await page.evaluate(([f, s]) => window.__wc!.settings.update({ appearance: { font: f as 'dejavu', size: s as number } }), [font, size] as const);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

/**
 * How much of the two underscores of `needle` shows (its cells 1 and 3;
 * cell 2 must be a letter without a descender), where `needle` is in
 * the text of `loc` (a row or a field whose text starts at its left edge):
 * lit pixels in the lower part of the cell, as a fraction of the cell
 * width. Only pixels inside the cell count (ADR 0043: the glyph ends there).
 * About 1 for a DejaVu `_`, 0 when it is clipped or painted over.
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
  const png = await shoot(page, { x: x + at * cell.w, y, width: cell.w * n, height: cell.h + 2 });
  const ink = await page.evaluate(
    async ({ b64, n, cellDev }) => {
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
      const ch = cellDev;
      // The row's background: between the stems of `h` (cell 2), above the baseline.
      const refX = Math.floor(2.5 * cw);
      const rowBg = px(refX, Math.floor(ch * 0.7));
      // The cell's last device-pixel row (the clip may start half a pixel off at fractional ratios).
      const end = Math.min(cv.height, Math.ceil(ch - 1e-6));
      return [1, 3].map((col) => {
        let lit = 0;
        for (let y = Math.floor(ch * 0.6); y < end; y++) {
          const bg = px(refX, y);
          // A pixel row that belongs to a neighbour with another background hides the glyph.
          if (diff(bg, rowBg) > 60) continue;
          for (let x = Math.floor(col * cw); x < Math.min(cv.width, Math.floor((col + 1) * cw)); x++) if (diff(px(x, y), bg) > 60) lit++;
        }
        return lit / cw;
      });
    },
    { b64: png.toString('base64'), n, cellDev: cell.h * (await page.evaluate(() => devicePixelRatio)) },
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
  it.describe(`underscores at device pixel ratio ${dpr}`, () => {
    useDpr(dpr);

    it('a profile name keeps its underscores in the Profiles list and the name field', async ({ dprPage: page }) => {
      await openProfiles(page);
      await expectDpr(page, dpr);
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
      const cellH = (await cellSize(page)).h;
      expect(await row(NAME).evaluate((el) => el.parentElement!.getBoundingClientRect().height)).toBe(cellH);

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

    it('the cockpit keeps underscores: last output row, input line, pane rows, ESC header', async ({ dprPage: page }) => {
      await page.goto(DEMO);
      await expectDpr(page, dpr);
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

// ------------------------------------------------ ADR 0043: the underscore face

/** Output rows through the script engine: the line with `_`, then a row with a background colour. */
async function showRows(page: Page, lines: string[]): Promise<void> {
  const input = page.locator('.wc-input-field');
  for (const l of lines) {
    await input.fill(`#showme {${l}}`);
    await input.press('Enter');
  }
}

/**
 * Ink of the accent marks of `ÅÄÖÉ` at the start of `loc`'s text: the
 * pixels that differ between `ÅÄÖÉ` and `AAOE` in the four cells and the
 * cell above them (device pixels, summed channel difference). `set` puts a
 * text into the element.
 */
async function marksInk(page: Page, loc: Locator, set: (t: string) => Promise<void>): Promise<{ px: number; ink: number }> {
  const cell = await cellSize(page);
  const shot = async (t: string): Promise<string> => {
    await set(t);
    await page.waitForTimeout(50);
    const r = await loc.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      // The row box: the element or its nearest ancestor one cell high.
      const h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-h'));
      let row: Element = el;
      while (row.parentElement && Math.abs(row.getBoundingClientRect().height - h) > 0.01) row = row.parentElement;
      return { x: b.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), y: row.getBoundingClientRect().top };
    });
    const clip = { x: r.x, y: Math.max(0, r.y - cell.h), width: cell.w * 4, height: cell.h * 3 };
    const png = await shoot(page, clip);
    return png.toString('base64');
  };
  const a = await shot('ÅÄÖÉ');
  const b = await shot('AAOE');
  return page.evaluate(
    async ({ a, b }) => {
      const dec = async (b64: string): Promise<Uint8ClampedArray> => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const cv = document.createElement('canvas');
        cv.width = bmp.width;
        cv.height = bmp.height;
        const g = cv.getContext('2d')!;
        g.drawImage(bmp, 0, 0);
        return g.getImageData(0, 0, cv.width, cv.height).data;
      };
      const [A, B] = [await dec(a), await dec(b)];
      let px = 0;
      let ink = 0;
      for (let i = 0; i < A.length; i += 4) {
        const d = Math.max(Math.abs(A[i]! - B[i]!), Math.abs(A[i + 1]! - B[i + 1]!), Math.abs(A[i + 2]! - B[i + 2]!));
        if (d >= 16) px++;
        ink += d;
      }
      return { px, ink };
    },
    { a, b },
  );
}

/**
 * The same text drawn the way every row was before ADR 0042's lift: a
 * one-cell box with `line-height: var(--cell-h)`, at `loc`'s place, in its
 * colours, clipped like the row (`clip`). Returns the element's id.
 */
async function preLiftTwin(page: Page, loc: Locator, clip: boolean): Promise<Locator> {
  await loc.evaluate((el, clip) => {
    document.getElementById('wc-twin')?.remove();
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    let bg = 'transparent';
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor;
      if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
        bg = c;
        break;
      }
    }
    // The row box: the nearest ancestor (or the element) one cell high.
    const h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-h'));
    let row: Element = el;
    while (row.parentElement && Math.abs(row.getBoundingClientRect().height - h) > 0.01) row = row.parentElement;
    const top = row.getBoundingClientRect().top;
    const t = document.createElement('div');
    t.id = 'wc-twin';
    t.style.cssText =
      `position:fixed;z-index:2147483647;left:${b.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth)}px;top:${top}px;` +
      'width:calc(var(--cell-w) * 4);height:var(--cell-h);line-height:var(--cell-h);white-space:pre;' +
      'font-family:var(--font-mono);font-size:var(--font-size);letter-spacing:var(--cell-ls);' +
      `color:${cs.color};font-weight:${cs.fontWeight};background:${bg};overflow:${clip ? 'hidden' : 'visible'}`;
    document.body.append(t);
  }, clip);
  return page.locator('#wc-twin');
}

for (const dpr of [1, 1.5]) {
  it.describe(`the underscore face at device pixel ratio ${dpr}`, () => {
    useDpr(dpr);

    it('an output row directly above a row with a background colour keeps its underscores', async ({ dprPage: page }) => {
      await page.goto(DEMO);
      await expectDpr(page, dpr);
      const rows = page.locator('.wc-output .wc-row:not(.wc-partial)');
      await expect(rows.filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
      await page.locator('.wc-input-field').click();
      // Twice: a row above an ANSI background (class) and above a 24-bit one (inline style).
      await showRows(page, [`${NAME} ansi`, '<004>bg row below', `${NAME} rgb`, '<B3060a0>bg row below', 'last']);
      const above = (tag: string): Locator => rows.filter({ hasText: `${NAME} ${tag}` });
      await expect(above('rgb')).toHaveCount(1);
      for (const [font, size] of LOOKS) {
        await look(page, font, size);
        await expectInk(
          page,
          [
            ['row above an ANSI background row', above('ansi')],
            ['row above a 24-bit background row', above('rgb')],
          ],
          `${font} ${size}`,
        );
      }
    });

    it('accented capitals keep the marks they had before the lift: kit row, input line, output row', async ({ dprPage: page }) => {
      await openProfiles(page);
      await expectDpr(page, dpr);
      const table = page.locator('.wc-start .wc-frame:not([hidden]) .wc-table');
      // Marked: the tests write the text straight into the element.
      await table.locator('.wc-tr', { hasText: ABOVE }).evaluate((el) => el.setAttribute('data-acc', ''));
      const kitRow = table.locator('[data-acc]');
      const setSpan = (loc: Locator) => (t: string) => loc.evaluate((el, t) => void (el.textContent = t + 'xxx'), t);
      const check = async (name: string, loc: Locator, set: (t: string) => Promise<void>, clip: boolean, where: string): Promise<void> => {
        const real = await marksInk(page, loc, set);
        const twin = await preLiftTwin(page, loc, clip);
        const ref = await marksInk(page, twin, setSpan(twin));
        await twin.evaluate((el) => el.remove());
        // No worse than the plain one-cell line: equal at pixel ratio 1; at
        // 1.5 the twin can sit a fraction of a device pixel off (and Chromium
        // may clip a fixed box's overflow at its layer's edge), which changes
        // a few edge pixels. Text raised one CSS pixel (ADR 0042) cuts a whole
        // row of every mark: far outside this.
        expect(real.px, `${name}, ${where}: accent pixels ${real.px} vs ${ref.px} (plain one-cell line)`).toBeGreaterThanOrEqual(ref.px - (dpr === 1 ? 0 : 2));
        expect(real.ink, `${name}, ${where}: accent ink ${real.ink} vs ${ref.ink}`).toBeGreaterThanOrEqual(ref.ink * (dpr === 1 ? 0.98 : 0.8));
      };
      for (const [font, size] of LOOKS) {
        await look(page, font, size);
        await check('kit list row', kitRow, setSpan(kitRow), true, `${font} ${size}`);
      }

      // The cockpit: the input line and an output row (rows are not clipped one by one).
      await page.goto(DEMO);
      await expectDpr(page, dpr);
      const rows = page.locator('.wc-output .wc-row:not(.wc-partial)');
      await expect(rows.filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
      const input = page.locator('.wc-input-field');
      await input.click();
      await showRows(page, ['Accents here', 'last']);
      await rows.filter({ hasText: /^Accents here$/ }).evaluate((el) => {
        const span = document.createElement('span');
        span.setAttribute('data-acc', '');
        span.textContent = el.textContent;
        el.replaceChildren(span);
      });
      const out = page.locator('.wc-output [data-acc]');
      for (const [font, size] of LOOKS) {
        await look(page, font, size);
        await check('input line', input, (t) => input.fill(t + 'xxx'), true, `${font} ${size}`);
        await check('output row', out, setSpan(out), false, `${font} ${size}`);
      }
    });
  });
}

test('the underscore face changes no cell size, font size or row height', async ({ browser }) => {
  const settings = [
    ['dejavu', 10],
    ['dejavu', 15],
    ['dejavu', 20],
    ['dejavu', 25],
    ['jetbrains', 15],
  ] as const;
  const measure = async (blockFace: boolean): Promise<string[]> => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    if (blockFace) await page.route('**/fonts/WebCockpitUnderscore*', (r) => r.abort());
    const faces: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('WebCockpitUnderscore')) faces.push(r.url());
    });
    await page.goto(DEMO);
    await expect(page.locator('.wc-output .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
    const out: string[] = [];
    for (const [font, size] of settings) {
      await look(page, font, size);
      out.push(
        await page.evaluate(
          ([f, s]) => {
            const cs = getComputedStyle(document.documentElement);
            const row = document.querySelector('.wc-output .wc-row')!.getBoundingClientRect().height;
            const face = document.fonts.check(`${cs.getPropertyValue('--font-size')} "WebCockpit Underscore"`, '_');
            return `${f} ${s}: cell ${cs.getPropertyValue('--cell-w')} x ${cs.getPropertyValue('--cell-h')}, font ${cs.getPropertyValue('--font-size')}, ls ${cs.getPropertyValue('--cell-ls')}, row ${row}` + (f === 'dejavu' ? `, face ${face}` : '');
          },
          [font, size] as const,
        ),
      );
    }
    // The face is preloaded with DejaVu (the default family).
    expect(faces.length, 'underscore face requested').toBeGreaterThan(0);
    await ctx.close();
    return out;
  };
  const withFace = await measure(false);
  const without = await measure(true);
  for (const l of withFace) if (l.startsWith('dejavu')) expect(l).toContain('face true');
  expect(withFace.map((l) => l.replace(/, face \w+$/, ''))).toEqual(without.map((l) => l.replace(/, face \w+$/, '')));
});
