// Output pane with a full scrollback (stage 8 part C, ADR 0044). The rows
// come straight from the bus (`sys.message`), so no fixture is needed.
// Offline page only: never open `/` without a parameter here.
import { type Page, expect, test } from '@playwright/test';

const scroller = (page: Page) => page.locator('.wc-output .wc-scroller');
/** The divider of the split scrollback (ADR 0117), which carries the old tail bar's text. */
const divider = (page: Page) => page.locator('.wc-output .wc-split-bar');
const splitTail = (page: Page) => page.locator('.wc-output .wc-split-tail');

/**
 * Opens the offline page and fills the scrollback with `n` rows `row 0` …
 * `row n-1`, in one burst. `varied`: rows of mixed length, some of which
 * wrap (inside a word, or at spaces, which can take more lines than the
 * length alone says).
 */
async function fill(page: Page, n: number, varied = false): Promise<void> {
  await page.goto('/?replay');
  await expect(page.locator('.wc-rows .wc-row').first()).toHaveText(/Offline replay mode/);
  await push(page, 0, n, varied);
}

/** Emits rows `row from` … `row to-1` and waits until the last is built. */
async function push(page: Page, from: number, to: number, varied = false): Promise<void> {
  await page.evaluate(
    ([from, to, varied]) => {
      const bus = window.__wc!.app.bus;
      const tail = (i: number): string =>
        i % 13 === 0 ? ' ' + 'x'.repeat(150 + (i % 200)) : i % 17 === 0 ? ' word'.repeat(30 + (i % 40)) : ' .'.repeat(i % 30);
      for (let i = from; i < to; i++) bus.emit('sys.message', { text: `row ${i}` + (varied ? tail(i) : '') });
    },
    [from, to, varied] as const,
  );
  await expect(page.locator('.wc-rows .wc-row').last()).toHaveText(new RegExp(`^\\[SYSTEM\\] row ${to - 1}\\b`));
}

/** Waits for two animation frames (content-visibility and scroll anchoring settle in a frame). */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

/** The row at the top edge of the view: its number and its top relative to the view (px, ≤ 0). */
async function topRow(page: Page): Promise<{ n: number; top: number }> {
  return scroller(page).evaluate((s) => {
    const r = s.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + 4, r.top + 1)?.closest('.wc-row');
    const m = /row (\d+)/.exec(el?.textContent ?? '');
    if (!el || !m) throw new Error(`no row at the top: ${el?.textContent}`);
    return { n: Number(m[1]), top: el.getBoundingClientRect().top - r.top };
  });
}

/** The numbers of the first and the last row on screen. */
async function shownRows(page: Page): Promise<[number, number]> {
  return scroller(page).evaluate((s) => {
    const r = s.getBoundingClientRect();
    const at = (y: number): number => {
      const el = document.elementFromPoint(r.left + 4, y)?.closest('.wc-row');
      const m = /row (\d+)/.exec(el?.textContent ?? '');
      if (!m) throw new Error(`no row at ${y}: ${el?.textContent}`);
      return Number(m[1]);
    };
    return [at(r.top + 1), at(r.top + s.clientHeight - 2)];
  });
}

/** The current top of row `n` relative to the view (px), or null when it is gone. */
async function rowTop(page: Page, n: number): Promise<number | null> {
  return scroller(page).evaluate((s, n) => {
    const re = new RegExp(`^\\[SYSTEM\\] row ${n}\\b`);
    const el = Array.from(s.querySelectorAll('.wc-row')).find((e) => re.test(e.textContent ?? ''));
    return el ? el.getBoundingClientRect().top - s.getBoundingClientRect().top : null;
  }, n);
}

/** One PgUp/PgDn step in px: the view height less one line. */
function pageStep(page: Page): Promise<number> {
  return scroller(page).evaluate(
    (s) => s.clientHeight - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-h')),
  );
}

/** True when the view shows the live tail. */
function atTail(page: Page): Promise<boolean> {
  return scroller(page).evaluate((s) => s.scrollTop + s.clientHeight >= s.scrollHeight - 2);
}

test('PgUp and Esc enter and leave scroll mode with 20 000 rows of scrollback', async ({ page }) => {
  await fill(page, 20_500);
  expect(await page.evaluate(() => window.__wc!.app.output.rows)).toBeGreaterThanOrEqual(20_000);
  await expect.poll(() => atTail(page)).toBe(true);
  await expect(divider(page)).toBeHidden();

  // Rule 2 of ADR 0044: the scroll-mode class must not change an inherited
  // property of the rows, so they keep their own scrollbar-color.
  const rowColour = () => page.locator('.wc-rows .wc-row').last().evaluate((el) => getComputedStyle(el).scrollbarColor);
  const atTailColour = await rowColour();

  await page.locator('.wc-input-field').focus();
  await page.keyboard.press('PageUp');
  await expect(scroller(page)).toHaveClass(/wc-scrolled/);
  await expect(divider(page)).toBeVisible();
  expect(await atTail(page)).toBe(false);
  expect(await rowColour()).toBe(atTailColour);

  // New rows while scrolled back do not pull the view down.
  await page.evaluate(() => window.__wc!.app.bus.emit('sys.message', { text: 'while scrolled' }));
  await expect(divider(page)).toContainText('1 new line');
  expect(await atTail(page)).toBe(false);

  await page.keyboard.press('Escape');
  await expect(scroller(page)).not.toHaveClass(/wc-scrolled/);
  await expect(divider(page)).toBeHidden();
  await expect.poll(() => atTail(page)).toBe(true);
  await expect(page.locator('.wc-rows .wc-row').last()).toHaveText('[SYSTEM] while scrolled');
  expect(await rowColour()).toBe(atTailColour);
});

// ------------------------------------------------ background rows (review #3)

/** A pixel sampler for `clip`: decodes a screenshot in the page. */
async function pixels(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
): Promise<(x: number, y: number) => number[]> {
  const png = await page.screenshot({ clip }).catch(async () => {
    // Chromium under load now and then cannot capture a clip.
    await page.waitForTimeout(200);
    return page.screenshot({ clip });
  });
  const { w, h, data } = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const cv = document.createElement('canvas');
    cv.width = bmp.width;
    cv.height = bmp.height;
    const g = cv.getContext('2d')!;
    g.drawImage(bmp, 0, 0);
    return { w: cv.width, h: cv.height, data: Array.from(g.getImageData(0, 0, cv.width, cv.height).data) };
  }, png.toString('base64'));
  const sx = w / clip.width;
  const sy = h / clip.height;
  return (x, y) => {
    const i = (Math.floor(y * sy) * w + Math.floor(x * sx)) * 4;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
}

/**
 * Puts two rows of the same line into a box `cols` cells wide over the
 * page: one as a background row, one as spans (the fallback), and returns
 * per row the colour in the middle of each of the line's `n` cells (the
 * text is `.`, which leaves the middle of a cell empty).
 */
async function twinColours(page: Page, cols: number, n: number): Promise<{ bg: number[][]; spans: number[][]; isBgRow: boolean }> {
  const geo = await page.evaluate(
    async ({ cols, n }) => {
      const path = '/src/ui/output-pane.ts';
      const { renderLine } = (await import(/* @vite-ignore */ path)) as typeof import('../../src/ui/output-pane');
      const runs = [];
      // Truecolor backgrounds of 1–3 cells, one palette colour, white text.
      for (let i = 0, k = 0; i < n; k++) {
        const len = 1 + (k % 3);
        const bg = k === 5 ? 4 : 0x1000000 + (((k * 53) % 256) << 16) + (((k * 97) % 256) << 8) + ((k * 31) % 256);
        runs.push({ start: i, end: Math.min(n, i + len), bg, fg: 0x1ffffff });
        i += len;
      }
      const line = { text: '.'.repeat(n), runs, tags: [], prompt: false, raw: '', ts: 0 };
      const box = document.createElement('div');
      box.id = 'wc-twins';
      box.className = 'wc-output';
      box.style.cssText = `position:fixed;left:0;top:0;z-index:2147483647;background:#000;width:calc(var(--cell-w) * ${cols})`;
      const a = renderLine(document, line, 1000);
      const b = renderLine(document, line, 0);
      box.append(a, b);
      document.body.append(box);
      const cs = getComputedStyle(document.documentElement);
      return {
        w: parseFloat(cs.getPropertyValue('--cell-w')),
        h: parseFloat(cs.getPropertyValue('--cell-h')),
        aTop: a.getBoundingClientRect().top,
        bTop: b.getBoundingClientRect().top,
        height: box.getBoundingClientRect().height,
        isBgRow: a.querySelector('.wc-bgrow') !== null && b.querySelector('.wc-bgrow') === null,
      };
    },
    { cols, n },
  );
  const px = await pixels(page, { x: 0, y: 0, width: Math.ceil(geo.w * cols), height: Math.ceil(geo.height) });
  const sample = (top: number): number[][] =>
    Array.from({ length: n }, (_, i) => px(((i % cols) + 0.5) * geo.w, top + Math.floor(i / cols) * geo.h + geo.h / 2));
  const out = { bg: sample(geo.aTop), spans: sample(geo.bTop), isBgRow: geo.isBgRow };
  await page.evaluate(() => document.getElementById('wc-twins')?.remove());
  return out;
}

function expectSameColours(a: number[][], b: number[][], where: string): void {
  const off = a
    .map((p, i) => [i, Math.max(...p.map((v, k) => Math.abs(v - b[i]![k]!)))] as const)
    .filter(([, d]) => d > 8);
  expect(off, `${where}: cells whose background differs from the span rendering`).toEqual([]);
}

test.describe('background rows', () => {
  // The owner's geometry: the game pane is wider than MUME's 95-cell chart rows.
  test.use({ viewport: { width: 1728, height: 1000 } });

  test('the colour charts render as background rows with the same text', async ({ page }) => {
    await page.goto('/?fixture=colour-chart.log&speed=0');
    const rows = page.locator('.wc-rows .wc-row');
    await expect(rows.filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
    const r = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll<HTMLElement>('.wc-rows .wc-row'));
      const chart = all.filter((el) => /^#[0-9a-f]{6} #/.test(el.textContent ?? ''));
      const bg = chart.filter((el) => el.querySelector('.wc-bgrow'));
      // Copy: a selection over two chart rows gives their text.
      const sel = getSelection()!;
      const range = document.createRange();
      range.setStartBefore(chart[0]!);
      range.setEndAfter(chart[1]!);
      sel.removeAllRanges();
      sel.addRange(range);
      const copied = sel.toString();
      sel.removeAllRanges();
      const first = bg[0]!.querySelector('.wc-bgrow')!;
      return {
        chart: chart.length,
        bg: bg.length,
        elements: chart.reduce((n, el) => n + el.querySelectorAll('*').length, 0),
        copied: copied.replace(/\r/g, '').split('\n').filter(Boolean),
        texts: [chart[0]!.textContent, chart[1]!.textContent],
        width: first.getBoundingClientRect().width,
        n: first.textContent!.length,
        cellW: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-w')),
      };
    });
    // Two 95-cell rows per block, 37 blocks, in both charts.
    expect(r.chart).toBe(4 * 37);
    expect(r.bg).toBe(r.chart);
    expect(r.elements).toBeLessThan(r.chart * 4);
    expect(r.copied).toEqual(r.texts);
    expect(r.width).toBeCloseTo(r.n * r.cellW, 0);
  });

  test('a background row shows the colours spans show, after a font change and when wrapped', async ({ page }) => {
    await page.goto('/?replay');
    await expect(page.locator('.wc-rows .wc-row').first()).toHaveText(/Offline replay mode/);
    for (const size of [15, 20]) {
      await page.evaluate((s) => window.__wc!.settings.update({ appearance: { size: s } }), size);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(100);
      // On one line, and wrapped onto three lines by a narrower pane.
      for (const cols of [60, 17]) {
        const c = await twinColours(page, cols, 48);
        expect(c.isBgRow).toBe(true);
        expectSameColours(c.bg, c.spans, `font ${size}, ${cols} cols`);
      }
    }
  });
});

// ------------------------------------- off-screen chunks and anchoring (ADR 0045)

test.describe('scrolling a full scrollback', () => {
  /** Presses `key` and checks that the row at the top moved by exactly `dy` px (no jump). */
  async function step(page: Page, key: 'PageUp' | 'PageDown', dy: number): Promise<void> {
    const before = await topRow(page);
    await page.keyboard.press(key);
    await settle(page);
    const after = await rowTop(page, before.n);
    // Twice more: a chunk that took its real height late would move it now.
    await settle(page);
    const later = await rowTop(page, before.n);
    expect(after, `${key} from row ${before.n}`).not.toBeNull();
    expect(Math.abs(after! - (before.top + dy)), `${key} from row ${before.n} at ${before.top}: now at ${after}, expected ${before.top + dy}`).toBeLessThanOrEqual(1.5);
    expect(later, `row ${before.n} moved after the step`).toBeCloseTo(after!, 0);
  }

  test('PgUp and PgDn move by one page through chunks never laid out', async ({ page }) => {
    test.setTimeout(120_000);
    await fill(page, 20_500, true);
    await page.locator('.wc-input-field').focus();
    // The first PgUp opens the split (ADR 0117); the steps after it move by
    // the upper half's page.
    await page.keyboard.press('PageUp');
    await settle(page);
    await expect(divider(page)).toBeVisible();
    const dy = await pageStep(page);
    // Back through ~1 500 rows: most chunks there were built and passed in
    // one frame of the burst, so they start at their estimated height.
    for (let i = 0; i < 40; i++) await step(page, 'PageUp', dy);
    for (let i = 0; i < 20; i++) await step(page, 'PageDown', -dy);
    for (let i = 0; i < 10; i++) await step(page, 'PageUp', dy);
    // Esc returns to the tail.
    await page.keyboard.press('Escape');
    await settle(page);
    expect(await atTail(page)).toBe(true);
  });

  test('PgUp pressed faster than the frames lands near where single steps land, and stays', async ({ page }) => {
    const land = async (fast: boolean): Promise<{ n: number; top: number }> => {
      await fill(page, 20_500, true);
      await page.locator('.wc-input-field').focus();
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press('PageUp');
        if (!fast) await settle(page);
      }
      await settle(page);
      await settle(page);
      const at = await topRow(page);
      // Nothing moves once the view has been rendered.
      await settle(page);
      await settle(page);
      expect(await topRow(page)).toEqual(at);
      return at;
    };
    const slow = await land(false);
    const fast = await land(true);
    // Unrendered pages are skipped at their estimated height, so the two can
    // differ by the estimate's error over 25 pages (a few rows).
    expect(Math.abs(fast.n - slow.n), `fast ${fast.n}, slow ${slow.n}`).toBeLessThanOrEqual(40);
  });

  test('trims while scrolled back keep the rows on screen in place', async ({ page }) => {
    await fill(page, 20_500, true);
    await page.locator('.wc-input-field').focus();
    for (let i = 0; i < 30; i++) await page.keyboard.press('PageUp');
    await settle(page);
    const before = await topRow(page);
    const rowsBefore = await page.evaluate(() => window.__wc!.app.output.rows);
    // 3 000 rows: about 15 chunks are dropped at the top, over several frames.
    await push(page, 20_500, 23_500, true);
    await settle(page);
    expect(await page.evaluate(() => window.__wc!.app.output.rows)).toBeLessThan(rowsBefore + 3_000);
    const after = await rowTop(page, before.n);
    expect(after, `row ${before.n}`).not.toBeNull();
    expect(Math.abs(after! - before.top), `row ${before.n} moved from ${before.top} to ${after}`).toBeLessThanOrEqual(1.5);
    await expect(divider(page)).toContainText('3000 new lines');
    // The tail shows the newest rows meanwhile.
    await expect(splitTail(page).locator('.wc-row').last()).toHaveText(/^\[SYSTEM\] row 23499\b/);
  });

  test('a width change keeps the tail at the tail, and a scrolled view near its rows', async ({ page }) => {
    await fill(page, 20_500, true);
    const last = page.locator('.wc-rows .wc-row').last();
    for (const width of [900, 1280]) {
      await page.setViewportSize({ width, height: 720 });
      await settle(page);
      await expect.poll(() => atTail(page)).toBe(true);
      await expect(last).toBeInViewport();
    }
    await page.locator('.wc-input-field').focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press('PageUp');
    // Steps faster than frames settle on a row in view two frames later.
    await settle(page);
    await settle(page);
    // The width changes below happen with the split open (ADR 0117).
    await expect(divider(page)).toBeVisible();
    const before = await shownRows(page);
    for (const width of [900, 1280]) {
      await page.setViewportSize({ width, height: 720 });
      await settle(page);
      await settle(page);
      expect(await atTail(page)).toBe(false);
      // Rows re-wrap, so fewer or more of them fit, but the view still
      // shows rows it showed before.
      const now = await shownRows(page);
      expect(Math.max(now[0], before[0]), `rows ${now} at width ${width}, before ${before}`).toBeLessThanOrEqual(Math.min(now[1], before[1]));
    }
  });

  test('a selection across off-screen chunks copies every row', async ({ page }) => {
    await fill(page, 20_500, false);
    const r = await page.evaluate(() => {
      const rows = document.querySelectorAll('.wc-rows .wc-row');
      const a = rows[rows.length - 1001]!;
      const b = rows[rows.length - 1]!;
      const range = document.createRange();
      range.setStartBefore(a);
      range.setEndAfter(b);
      const sel = getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      return null;
    });
    expect(r).toBeNull();
    // As with a mouse selection, the copy comes a frame or more later: by
    // then the browser renders the selected chunks (Firefox leaves chunks it
    // skips out of the selection's text).
    await settle(page);
    const copied = await page.evaluate(() => {
      const sel = getSelection()!;
      const lines = sel.toString().replace(/\r/g, '').split('\n').filter(Boolean);
      sel.removeAllRanges();
      return { n: lines.length, first: lines[0], last: lines.at(-1) };
    });
    expect(copied).toEqual({ n: 1001, first: '[SYSTEM] row 19499', last: '[SYSTEM] row 20499' });
  });
});

// ------------------------------------------------ split scrollback (ADR 0117)

test.describe('split scrollback', () => {
  /** Records every window size the game window reports for NAWS from now on. */
  async function watchNaws(page: Page): Promise<() => Promise<Array<[number, number]>>> {
    await page.evaluate(() => {
      const w = window as unknown as { __naws: Array<[number, number]> };
      w.__naws = [];
      const s = window.__wc!.app.session;
      const orig = s.setWindowSize.bind(s);
      s.setWindowSize = (c: number, r: number) => {
        w.__naws.push([c, r]);
        orig(c, r);
      };
    });
    return () => page.evaluate(() => (window as unknown as { __naws: Array<[number, number]> }).__naws);
  }

  const cellH = (page: Page) =>
    page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-h')));

  /** The tail's height in cell rows. */
  async function tailRows(page: Page): Promise<number> {
    const h = await cellH(page);
    return Math.round((await splitTail(page).evaluate((el) => el.getBoundingClientRect().height)) / h);
  }

  test('PgUp opens it with the old top row above the divider; the tail is live; sending keeps it; Esc closes', async ({ page }) => {
    await fill(page, 2_000);
    const naws = await watchNaws(page);
    const size = await page.evaluate(() => window.__wc!.app.output.measureCells());
    await page.locator('.wc-input-field').focus();
    await expect(splitTail(page)).toBeHidden();
    const full = await scroller(page).evaluate((s) => s.clientHeight);
    const first = await topRow(page);
    await page.keyboard.press('PageUp');
    await settle(page);
    await expect(divider(page)).toBeVisible();
    await expect(splitTail(page)).toBeVisible();
    await expect(divider(page)).toHaveText(/^━━ scrolled ━━ PgDn \/ Esc to return ━━━━/);
    // The scroller shrank to the share above the divider; the old top row
    // is now its last row.
    const h = await cellH(page);
    const upper = await scroller(page).evaluate((s) => s.clientHeight);
    const total = Math.floor(full / h + 1e-6);
    expect(await tailRows(page)).toBe(Math.round(total * 0.3));
    expect(upper).toBeLessThan(full - h * 2);
    const top = await rowTop(page, first.n);
    expect(Math.abs(top! - (upper - h)), `row ${first.n} at ${top}, the upper half ${upper} px high`).toBeLessThanOrEqual(1.5);
    const dividerTop = await divider(page).evaluate((el) => el.getBoundingClientRect().top);
    const scrollerTop = await scroller(page).evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(scrollerTop + upper - dividerTop)).toBeLessThanOrEqual(1);
    // The tail ends with the newest row, and new rows show in it at once.
    await expect(splitTail(page).locator('.wc-row').last()).toHaveText('[SYSTEM] row 1999');
    await push(page, 2_000, 2_003);
    await expect(splitTail(page).locator('.wc-row').last()).toHaveText('[SYSTEM] row 2002');
    await expect(divider(page)).toContainText('3 new lines');
    const still = await topRow(page);
    // A command (also an empty one) leaves the view where it is.
    await page.keyboard.type('look');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await settle(page);
    await expect(divider(page)).toBeVisible();
    expect(await page.evaluate(() => window.__wc!.app.output.isScrolled())).toBe(true);
    expect(await topRow(page)).toEqual(still);
    // The size MUME sees never changed.
    expect(await page.evaluate(() => window.__wc!.app.output.measureCells())).toEqual(size);
    expect(await naws()).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(divider(page)).toBeHidden();
    await expect(splitTail(page)).toBeHidden();
    await expect.poll(() => atTail(page)).toBe(true);
    expect(await scroller(page).evaluate((s) => s.clientHeight)).toBe(full);
    await expect(page.locator('.wc-rows .wc-row').last()).toBeInViewport();
    expect(await naws()).toEqual([]);
  });

  test('the wheel opens it without moving the text, and closes it at the bottom', async ({ page }) => {
    await fill(page, 2_000);
    const naws = await watchNaws(page);
    const box = (await scroller(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
    const before = await topRow(page);
    const s0 = await scroller(page).evaluate((s) => s.scrollTop);
    await page.mouse.wheel(0, -200);
    await expect(divider(page)).toBeVisible();
    await settle(page);
    await settle(page);
    // The row moved by the wheel's scroll only: opening the split did not move it.
    const s1 = await scroller(page).evaluate((s) => s.scrollTop);
    expect(s1).toBeLessThan(s0);
    const at = await rowTop(page, before.n);
    expect(Math.abs(at! - (before.top + s0 - s1)), `row ${before.n} at ${at}, expected ${before.top + s0 - s1}`).toBeLessThanOrEqual(1.5);
    // Down to the upper half's bottom: the split goes and the tail is pinned.
    for (let i = 0; i < 20 && (await divider(page).isVisible()); i++) await page.mouse.wheel(0, 400);
    await expect(divider(page)).toBeHidden();
    await expect.poll(() => atTail(page)).toBe(true);
    await expect(page.locator('.wc-rows .wc-row').last()).toBeInViewport();
    await push(page, 2_000, 2_005);
    await expect.poll(() => atTail(page)).toBe(true);
    expect(await naws()).toEqual([]);
  });

  test('the divider drags in whole rows, keeps the text above in place, and the share is saved', async ({ page }) => {
    await fill(page, 2_000);
    const naws = await watchNaws(page);
    await page.locator('.wc-input-field').focus();
    await page.keyboard.press('PageUp');
    await settle(page);
    const h = await cellH(page);
    const rows0 = await tailRows(page);
    const before = await topRow(page);
    const bar = (await divider(page).boundingBox())!;
    // Hover: the resize cursor and a brighter rule.
    const rule = divider(page).locator('.wc-split-rule').last();
    const restColour = await rule.evaluate((el) => getComputedStyle(el).color);
    await page.mouse.move(bar.x + 300, bar.y + bar.height / 2);
    await expect.poll(() => rule.evaluate((el) => getComputedStyle(el).color)).not.toBe(restColour);
    expect(await divider(page).evaluate((el) => getComputedStyle(el).cursor)).toBe('row-resize');
    await page.mouse.down();
    await page.mouse.move(bar.x + 300, bar.y + bar.height / 2 - 4.4 * h, { steps: 5 });
    await settle(page);
    expect(await tailRows(page)).toBe(rows0 + 4);
    await page.mouse.up();
    await settle(page);
    // The input kept the focus; the top row did not move.
    expect(await page.evaluate(() => document.activeElement?.classList.contains('wc-input-field'))).toBe(true);
    expect(await topRow(page)).toEqual(before);
    const total = await page.evaluate(() => window.__wc!.app.output.measureCells().rows);
    await expect.poll(() => page.evaluate(() => window.__wc!.settings.get().output.splitShare)).toBeCloseTo((rows0 + 4) / total, 6);
    expect(await naws()).toEqual([]);
    // The share outlives a reload.
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(page.locator('.wc-rows .wc-row').first()).toHaveText(/Offline replay mode/);
    await push(page, 0, 500);
    await page.locator('.wc-input-field').focus();
    await page.keyboard.press('PageUp');
    await expect(divider(page)).toBeVisible();
    expect(await tailRows(page)).toBe(rows0 + 4);
    // A window resize keeps the share.
    await page.setViewportSize({ width: 1280, height: 900 });
    await settle(page);
    await settle(page);
    const total2 = await page.evaluate(() => window.__wc!.app.output.measureCells().rows);
    expect(await tailRows(page)).toBe(Math.round(((rows0 + 4) / total) * total2));
    await page.evaluate(() => window.__wc!.settings.reset());
  });

  test('a mouse selection copies only the half it starts in', async ({ page }) => {
    await fill(page, 2_000);
    // The pane copies a mouse selection on mouseup (then the input takes the focus back).
    await page.evaluate(() => {
      const w = window as unknown as { __copied: string[] };
      w.__copied = [];
      navigator.clipboard.writeText = async (t: string) => void w.__copied.push(t);
    });
    const copied = async (): Promise<string[]> => {
      const all = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied.splice(0));
      expect(all).toHaveLength(1);
      return all[0]!.replace(/\r/g, '').split('\n').filter(Boolean);
    };
    await page.locator('.wc-input-field').focus();
    await page.keyboard.press('PageUp');
    await settle(page);
    await expect(splitTail(page)).toBeVisible();
    const s = (await scroller(page).boundingBox())!;
    const t = (await splitTail(page).boundingBox())!;
    // From the upper half down into the tail: no row twice.
    await page.mouse.move(s.x + 20, s.y + s.height / 2);
    await page.mouse.down();
    await page.mouse.move(s.x + 40, t.y + t.height / 2, { steps: 8 });
    await page.mouse.up();
    const down = await copied();
    expect(down.length).toBeGreaterThan(1);
    expect(new Set(down).size).toBe(down.length);
    // It ends at the last row in view above the divider (one that shows only a pixel or so counts).
    const n = (line: string): number => Number(/row (\d+)/.exec(line)?.[1] ?? NaN);
    const lastAbove = (await shownRows(page))[1];
    expect(n(down.at(-1)!) - lastAbove).toBeGreaterThanOrEqual(0);
    expect(n(down.at(-1)!) - lastAbove).toBeLessThanOrEqual(1);
    // From the tail up into the upper half: only tail rows, ending at the newest.
    await page.keyboard.press('Escape');
    await page.keyboard.press('PageUp');
    await settle(page);
    const t2 = (await splitTail(page).boundingBox())!;
    await page.mouse.move(t2.x + 300, t2.y + t2.height - 4);
    await page.mouse.down();
    await page.mouse.move(t2.x + 20, s.y + 20, { steps: 8 });
    await page.mouse.up();
    const up = await copied();
    expect(up.length).toBeGreaterThan(1);
    expect(up.length).toBeLessThanOrEqual(await tailRows(page));
    expect(up.at(-1)).toBe('[SYSTEM] row 1999');
  });

  test('a touch device keeps the tail bar and the snap on send', async ({ page }) => {
    await page.goto('/?replay&touch=1');
    await expect(page.locator('.wc-rows .wc-row').first()).toHaveText(/Offline replay mode/);
    await push(page, 0, 1_000);
    const full = await scroller(page).evaluate((s) => s.clientHeight);
    await page.locator('.wc-input-field').focus();
    await page.keyboard.press('PageUp');
    await expect(page.locator('.wc-output .wc-tail-bar')).toBeVisible();
    await expect(page.locator('.wc-output .wc-tail-bar')).toContainText('── scrolled ── PgDn / Esc to return ──');
    await expect(divider(page)).toHaveCount(0);
    expect(await scroller(page).evaluate((s) => s.clientHeight)).toBe(full);
    await page.keyboard.press('Enter');
    await expect(page.locator('.wc-output .wc-tail-bar')).toBeHidden();
    await expect.poll(() => atTail(page)).toBe(true);
  });
});

// ------------------------------------------------- scrollback depth (ADR 0046)

test('Settings → Appearance → Scrollback changes the depth live', async ({ page }) => {
  await fill(page, 20_500);
  const rows = () => page.evaluate(() => window.__wc!.app.output.rows);
  // The Settings popup (ADR 0107); the TUI row on the start page is the same setting.
  await page.locator('.wc-mb[data-mb="settings"]').click();
  const dd = page.locator('.wc-sp-settings .wc-ck-dd[aria-label="Scrollback"]');
  const pick = async (n: number) => {
    await dd.click();
    await page.locator(`.wc-ck-list .wc-ck-opt[data-value="${n}"]`).click();
  };
  await expect(dd).toContainText('20 000');
  await pick(5000);
  await expect(dd).toContainText('5 000');
  // Lowered: the oldest rows go at once, without a reload or new output.
  await expect.poll(rows).toBeLessThan(5_200);
  expect(await rows()).toBeGreaterThanOrEqual(5_000);
  expect(await page.evaluate(() => window.__wc!.settings.get().output.scrollback)).toBe(5000);
  // Raised: the pane keeps more from now on.
  await pick(50000);
  await expect(dd).toContainText('50 000');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-pop')).toHaveCount(0);
  await push(page, 20_500, 30_500);
  expect(await rows()).toBeGreaterThan(14_000);
  await expect.poll(() => atTail(page)).toBe(true);
  await expect(page.locator('.wc-rows .wc-row').last()).toBeInViewport();
  await page.evaluate(() => window.__wc!.settings.reset());
});
