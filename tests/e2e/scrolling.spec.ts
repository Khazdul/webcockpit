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

test('Export editor log scrolls by pixels; the rows near the view are rendered', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 600 });
  await page.goto('/');
  await restoreRuns(page);
  await page.locator('.wc-start .wc-mrow[data-key="history"] .wc-label').click();
  const f = startFrame(page);
  await expect(f.locator('.wc-tr:not(.is-empty)')).toHaveCount(3);
  await page.keyboard.press('ArrowDown');
  await expect(f.locator('.wc-tr.is-cur-focus')).toContainText('Rasta');
  await f.locator('[data-btn="EXPORT"]').click();
  await expect(f.locator('.wc-title-row')).toHaveText('─── Export Editor ───');
  const log = f.locator('.wc-exp-log');
  await expect(log.locator('.wc-exp-row').first()).toBeVisible();
  await expectPixelWheel(page, log);
  // A long swipe: the rows in view are rendered (no blanks).
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 300);
  await expect.poll(() => log.evaluate((el) => el.scrollTop)).toBeGreaterThan(2000);
  const rowAt = (y: number) =>
    log.evaluate((el, y) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 40, r.top + r.height * y)?.closest('.wc-exp-row');
      return hit ? hit.getAttribute('data-kind') : null;
    }, y);
  for (const y of [0.02, 0.5, 0.98]) expect(await rowAt(y)).not.toBeNull();
  // End: the cursor on the end row, in view.
  await page.keyboard.press('End');
  await expect(f.locator('.wc-exp-row.is-cur')).toHaveAttribute('data-kind', 'end');
  await expect(f.locator('.wc-exp-row.is-cur')).toBeInViewport();
});

// ------------------------------------------------------------------ panes
// The Comm, UI and Timers panes scroll natively too (ADR 0052, owner
// decision 2026-10-02): no stepping by message or row.

const DEMO = '/?fixture=gmcp-demo.log&speed=0';
const pane = (page: Page, id: string) => page.locator(`.wc-pane[data-pane="${id}"]`);
const twoFrames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const scrollTop = (box: Locator) => box.evaluate((el) => el.scrollTop);
const atBottom = (box: Locator) => box.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2);

/** Runs the demo to its end; the panes stay active. */
async function demoDone(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto(DEMO);
  await expect(pane(page, 'ui').locator('.wc-ui-row').filter({ hasText: 'Replay finished.' })).toHaveCount(1);
  await expect(pane(page, 'comm')).toHaveAttribute('data-active', '');
}

async function addComm(page: Page, n: number, from = 0): Promise<void> {
  await page.evaluate(
    ({ n, from }) => {
      for (let i = from; i < from + n; i++) {
        window.__wc!.app.bus.emit('gmcp', {
          pkg: 'Comm.Channel.Text',
          data: { channel: 'says', talker: 'Dori', text: `Dori says 'line ${i}'` },
        } as never);
      }
    },
    { n, from },
  );
}

async function addUi(page: Page, n: number, from = 0): Promise<void> {
  await page.evaluate(
    ({ n, from }) => {
      for (let i = from; i < from + n; i++) window.__wc!.app.bus.emit('ui.message', { kind: 'system', parts: [`note ${i}.`] });
    },
    { n, from },
  );
}

/**
 * Two small wheel moves over `box`: the second (scrolled back already, at
 * rest) moves it by a few pixels, more than 0 and less than a row.
 */
async function expectPaneWheel(page: Page, box: Locator, dy: number): Promise<void> {
  const row = await box.evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--cell-h')) || 16);
  await box.hover();
  const t0 = await scrollTop(box);
  await page.mouse.wheel(0, dy);
  await expect.poll(() => scrollTop(box)).not.toBe(t0);
  // Let the scroll come to rest (the Comm timestamps come in then, ADR 0052).
  await page.waitForTimeout(400);
  const t1 = await scrollTop(box);
  await page.mouse.wheel(0, dy);
  await expect.poll(() => scrollTop(box)).not.toBe(t1);
  await twoFrames(page);
  const moved = Math.abs((await scrollTop(box)) - t1);
  expect(moved).toBeGreaterThan(0);
  expect(moved).toBeLessThan(row);
}

test('Comm pane: the wheel scrolls by pixels; new messages follow only at the bottom', async ({ page }) => {
  await demoDone(page);
  await addComm(page, 40);
  const list = pane(page, 'comm').locator('.wc-alist');
  const rows = pane(page, 'comm').locator('.wc-comm-msg');
  await expect(rows.last()).toHaveText("Dori says 'line 39'");
  await expect.poll(() => atBottom(list)).toBe(true);
  // At the bottom a burst follows.
  await addComm(page, 5, 40);
  await expect(rows.last()).toHaveText("Dori says 'line 44'");
  await expect.poll(() => atBottom(list)).toBe(true);
  await expect(rows.last()).toBeInViewport();
  // A few pixels up: scrolled back, by pixels.
  await expectPaneWheel(page, list, -5);
  const more = pane(page, 'comm').locator('.wc-alist-more');
  await expect(more).toBeVisible();
  // Scrolled back: new messages land below, the view stays.
  await page.mouse.wheel(0, -200);
  await expect(pane(page, 'comm').locator('.wc-comm-time').first()).toBeAttached();
  await page.waitForTimeout(400);
  const top = await scrollTop(list);
  const before = await more.textContent();
  await addComm(page, 3, 45);
  await expect(more).not.toHaveText(before!);
  expect(await scrollTop(list)).toBe(top);
  await expect(rows.last()).not.toBeInViewport();
  // Back to the bottom with the wheel: live again, and it follows.
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 1000);
  await expect(more).toBeHidden();
  await expect(pane(page, 'comm').locator('.wc-comm-time')).toHaveCount(0);
  await addComm(page, 2, 48);
  await expect(rows.last()).toHaveText("Dori says 'line 49'");
  await expect.poll(() => atBottom(list)).toBe(true);
  await expect(rows.last()).toBeInViewport();
});

test('UI pane: the wheel scrolls by pixels; new lines follow only at the bottom', async ({ page }) => {
  await demoDone(page);
  await addUi(page, 40);
  const list = pane(page, 'ui').locator('.wc-alist');
  const rows = pane(page, 'ui').locator('.wc-ui-row');
  await expect(rows.last()).toHaveText('● SYSTEM: note 39.');
  await expect.poll(() => atBottom(list)).toBe(true);
  await expectPaneWheel(page, list, -5);
  const more = pane(page, 'ui').locator('.wc-alist-more');
  await expect(more).toBeVisible();
  const top = await scrollTop(list);
  await addUi(page, 3, 40);
  await expect(rows.last()).toHaveText('● SYSTEM: note 42.');
  await twoFrames(page);
  expect(await scrollTop(list)).toBe(top);
  await expect(rows.last()).not.toBeInViewport();
  // The indicator returns to live.
  await more.dispatchEvent('mousedown', { button: 0 });
  await expect(more).toBeHidden();
  await expect.poll(() => atBottom(list)).toBe(true);
  await addUi(page, 1, 43);
  await expect(rows.last()).toHaveText('● SYSTEM: note 43.');
  await expect.poll(() => atBottom(list)).toBe(true);
  await expect(rows.last()).toBeInViewport();
});

test('Timers pane: the wheel scrolls by pixels; the indicator follows and returns to the top', async ({ page }) => {
  await demoDone(page);
  await page.evaluate(() => {
    window.__wc!.settings.update((d) => void (d.timers.groups.spell.cols = 1));
    const t = window.__wc!.app.game.timers;
    const now = Date.now();
    for (let i = 0; i < 30; i++) {
      t.debugAdd({ id: `s${i}`, name: `spell${i}`, group: 'spell', startedAt: now, expiresAt: now + 600_000, expected: 600_000, tracked: true } as never);
    }
  });
  const box = pane(page, 'timers').locator('.wc-timers-scroll');
  const more = pane(page, 'timers').locator('.wc-timers-more');
  await expect(more).toHaveText(/^↓ \d+ more rows\s*$/);
  await expectPaneWheel(page, box, 5);
  await expect(more).toHaveText(/^↑ 1 row above\s*$/);
  await page.mouse.wheel(0, 100);
  await expect(more).toHaveText(/^↑ \d+ rows above\s*$/);
  // A press on the indicator goes back to the top.
  await more.dispatchEvent('mousedown', { button: 0 });
  await expect.poll(() => scrollTop(box)).toBe(0);
  await expect(more).toHaveText(/^↓ \d+ more rows\s*$/);
  await page.evaluate(() => window.__wc!.settings.reset());
});
