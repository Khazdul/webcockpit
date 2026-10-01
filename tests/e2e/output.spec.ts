// Output pane with a full scrollback (stage 8 part C, ADR 0044). The rows
// come straight from the bus (`sys.message`), so no fixture is needed.
// Offline page only: never open `/` without a parameter here.
import { type Page, expect, test } from '@playwright/test';

const scroller = (page: Page) => page.locator('.wc-output .wc-scroller');
const tailBar = (page: Page) => page.locator('.wc-output .wc-tail-bar');

/** Opens the offline page and fills the scrollback with `n` rows `row 0` … `row n-1`. */
async function fill(page: Page, n: number): Promise<void> {
  await page.goto('/?replay');
  await expect(page.locator('.wc-rows .wc-row').first()).toHaveText(/Offline replay mode/);
  await page.evaluate((n) => {
    const bus = window.__wc!.app.bus;
    for (let i = 0; i < n; i++) bus.emit('sys.message', { text: `row ${i}` });
  }, n);
  await expect(page.locator('.wc-rows .wc-row').last()).toHaveText(`[SYSTEM] row ${n - 1}`);
}

/** True when the view shows the live tail. */
function atTail(page: Page): Promise<boolean> {
  return scroller(page).evaluate((s) => s.scrollTop + s.clientHeight >= s.scrollHeight - 2);
}

test('PgUp and Esc enter and leave scroll mode with 20 000 rows of scrollback', async ({ page }) => {
  await fill(page, 20_500);
  expect(await page.evaluate(() => window.__wc!.app.output.rows)).toBeGreaterThanOrEqual(20_000);
  await expect.poll(() => atTail(page)).toBe(true);
  await expect(tailBar(page)).toBeHidden();

  // Rule 2 of ADR 0044: the scroll-mode class must not change an inherited
  // property of the rows, so they keep their own scrollbar-color.
  const rowColour = () => page.locator('.wc-rows .wc-row').last().evaluate((el) => getComputedStyle(el).scrollbarColor);
  const atTailColour = await rowColour();

  await page.locator('.wc-input-field').focus();
  await page.keyboard.press('PageUp');
  await expect(scroller(page)).toHaveClass(/wc-scrolled/);
  await expect(tailBar(page)).toBeVisible();
  expect(await atTail(page)).toBe(false);
  expect(await rowColour()).toBe(atTailColour);

  // New rows while scrolled back do not pull the view down.
  await page.evaluate(() => window.__wc!.app.bus.emit('sys.message', { text: 'while scrolled' }));
  await expect(tailBar(page)).toContainText('1 new line');
  expect(await atTail(page)).toBe(false);

  await page.keyboard.press('Escape');
  await expect(scroller(page)).not.toHaveClass(/wc-scrolled/);
  await expect(tailBar(page)).toBeHidden();
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
