// Native scrolling (stage 10 feedback round 1): the wheel and the touchpad
// scroll every chrome list by pixels, as CodeMirror does in EDITOR, never
// by whole rows. A small wheel delta moves a scroll box by less than a row.
import { type Locator, type Page, expect, test } from '@playwright/test';

const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');

/** A wheel of 5 px over `box` scrolls it by a few pixels: more than 0, less than a row. */
async function expectPixelWheel(page: Page, box: Locator): Promise<void> {
  await expect(box).toBeVisible();
  const m = await box.evaluate((el) => ({
    top: el.scrollTop,
    over: el.scrollHeight - el.clientHeight,
    row: (el.querySelector('.wc-line') as HTMLElement | null)?.getBoundingClientRect().height ?? 0,
  }));
  expect(m.over, 'the box overflows').toBeGreaterThan(5);
  expect(m.row).toBeGreaterThan(0);
  await box.hover();
  await page.mouse.wheel(0, 5);
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(m.top);
  const moved = (await box.evaluate((el) => el.scrollTop)) - m.top;
  expect(moved).toBeLessThan(m.row);
}

/** Restores the demo runs backup, plus `copies` shifted copies of it (a long History). */
async function restoreRuns(page: Page, copies = 0): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async (copies) => {
    const w = window as unknown as {
      __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> };
    };
    const lib = await w.__wc.runs();
    const gz = await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob();
    await lib.restore(gz);
    if (copies === 0) return;
    const text = await new Response(gz.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const lines = text.split('\n').filter((l) => l);
    const out = [lines[0]!];
    for (let k = 1; k <= copies; k++) {
      // Each copy a day later, with its own run ids.
      const shift = k * 86_400_000_000;
      for (const l of lines.slice(1)) {
        if (!l.includes('"runId"')) continue;
        out.push(
          l
            .replace(/("runId":"[^"]+)"/g, `$1~${k}"`)
            .replace(/("\w*Us":)(\d{13,})/g, (_m, key: string, n: string) => key + String(Number(n) + shift)),
        );
      }
    }
    const blob = new Blob([out.join('\n') + '\n']);
    const z = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
    await lib.restore(z);
  }, copies);
}

test('About scrolls by pixels; the keys by rows', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 500 });
  await page.goto('/');
  await page.locator('.wc-start .wc-mrow[data-key="about"] .wc-label').click();
  await expect(startFrame(page).locator('.wc-title-row')).toContainText('─── About ───');
  const box = startFrame(page).locator('.wc-about-text');
  await expectPixelWheel(page, box);
  // The keys: Home to the top, ↓ one row, End to the end.
  await page.keyboard.press('Home');
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBe(0);
  await page.keyboard.press('ArrowDown');
  const row = await box.locator('.wc-line').first().evaluate((el) => el.getBoundingClientRect().height);
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeCloseTo(row, 0);
  await page.keyboard.press('End');
  await expect(box.locator('.wc-line').last()).toBeInViewport();
  await expect(startFrame(page).locator('.wc-tui-bar .wc-scroll-thumb').first()).toBeVisible();
});

test('History table scrolls by pixels; the cursor stays in view', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 600 });
  await page.goto('/');
  await restoreRuns(page, 8);
  await page.locator('.wc-start .wc-mrow[data-key="history"] .wc-label').click();
  await expect(startFrame(page).locator('.wc-title-row')).toHaveText('─── History ───');
  const box = startFrame(page).locator('.wc-table-rows');
  await expect(box.locator('.wc-tr:not(.is-empty)')).toHaveCount(35);
  await expectPixelWheel(page, box);
  // End moves the cursor to the last row and pulls the view along.
  await page.keyboard.press('End');
  await expect(box.locator('.wc-tr.is-cur-focus')).toContainText('Gittan 2026-09-25');
  await expect(box.locator('.wc-tr.is-cur-focus')).toBeInViewport({ ratio: 0.9 });
  await page.keyboard.press('Home');
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBe(0);
});

test('Statistics tables scroll by pixels', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 520 });
  await page.goto('/');
  await restoreRuns(page);
  await page.locator('.wc-start .wc-mrow[data-key="history"] .wc-label').click();
  await expect(startFrame(page).locator('.wc-title-row')).toHaveText('─── History ───');
  await page.keyboard.press('ArrowDown');
  await expect(startFrame(page).locator('.wc-tr.is-cur-focus')).toContainText('Rasta');
  await startFrame(page).locator('[data-btn="STATS"]').click();
  const stats = startFrame(page).locator('.wc-stats');
  await expect(stats).toContainText('*Ibuki the Half-Elf*');
  const kills = stats.locator('.wc-stat-col[data-table="2"] .wc-scrollbox');
  await expectPixelWheel(page, kills);
  // The wheel focused KILLS: its title is gold; ↓ scrolls it by a row.
  await expect(stats.locator('.wc-c-accent.wc-stat-sort').first()).toHaveText('KILLS');
  await page.keyboard.press('Home');
  await expect.poll(() => kills.evaluate((el) => el.scrollTop)).toBe(0);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => kills.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test('Scripts list and help scroll by pixels; the cursor stays in view', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 500 });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { shell: { scripts: { create(name: string): Promise<unknown> } } } };
    for (let i = 0; i < 30; i++) await w.__wc.shell.scripts.create(`s${String(i).padStart(2, '0')}`);
  });
  await page.locator('.wc-start .wc-mrow[data-key="scripts"] .wc-label').click();
  const f = startFrame(page);
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  const list = f.locator('.wc-scr-list');
  await expectPixelWheel(page, list);
  // End moves the cursor to the last script and pulls the list along; Home back.
  await page.keyboard.press('End');
  await expect(f.locator('.wc-scr-name.is-cur')).toHaveText(/^s29\s*$/);
  await expect(f.locator('.wc-scr-name.is-cur')).toBeInViewport({ ratio: 0.9 });
  await page.keyboard.press('Home');
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(0);
  // The help of the bundled coin looter is longer than the panel at this height.
  await f.locator('.wc-scr-row[data-script="coinlooter"] .wc-scr-name').click();
  await expect(f.locator('.wc-scr-help')).toContainText('bundled · read-only');
  await expectPixelWheel(page, f.locator('.wc-scr-help-rows'));
});

test('Scripts → IMPORT code view scrolls by pixels', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 500 });
  await page.goto('/');
  await page.locator('.wc-start .wc-mrow[data-key="scripts"] .wc-label').click();
  const f = startFrame(page);
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  const chooser = page.waitForEvent('filechooser');
  await f.locator('[data-btn="IMPORT"]').click();
  const code = Array.from({ length: 60 }, (_, i) => `echo("line ${i + 1}")`).join('\n');
  await (await chooser).setFiles({ name: 'long.lua', mimeType: 'text/plain', buffer: Buffer.from(code) });
  await expect(f.locator('.wc-title-row')).toHaveText('─── Import Script ───');
  const box = f.locator('.wc-scr-import-code');
  await expectPixelWheel(page, box);
  await page.keyboard.press('End');
  await expect(box.locator('.wc-line').last()).toContainText('line 60');
  await expect(box.locator('.wc-line').last()).toBeInViewport({ ratio: 0.9 });
});
