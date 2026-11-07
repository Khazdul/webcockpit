// ADR 0106: every `░█` scrollbar drags its thumb. A press on the thumb and
// a drag moves the content in proportion (under pointer capture, so the
// drag goes on outside the bar), and a press on the track still pages.
// Against a mocked MUME WebSocket; nothing reaches the real server.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';

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
const ped = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-ped');
const lib = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(
    ([fn, args]) => {
      const l = window.__wc!.shell.scripts as unknown as Record<string, (...a: unknown[]) => unknown>;
      return Promise.resolve(l[fn as string]!(...(args as unknown[]))) as Promise<unknown>;
    },
    [fn, args] as const,
  );

const scrollTop = (scroller: Locator) => scroller.evaluate((el) => el.scrollTop);

/**
 * Presses the first thumb cell of `bar`, drags it down `cells` bar cells and
 * expects `scroller` to follow in proportion: the thumb's free travel maps
 * onto the content's. Then drags far below the bar (and off to the side):
 * the capture keeps the drag going to the end. Returns the bar's cell height.
 */
async function dragThumb(page: Page, bar: Locator, scroller: Locator, cells = 2): Promise<number> {
  const thumb = bar.locator('.wc-scroll-thumb').first();
  await expect(thumb).toBeVisible();
  const box = (await thumb.boundingBox())!;
  const n = await bar.locator('.wc-scroll-thumb, .wc-scroll-track').count();
  const size = await bar.locator('.wc-scroll-thumb').count();
  const m0 = await scroller.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
  expect(m0.max).toBeGreaterThan(0);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const dy = cells * box.height;
  await page.mouse.move(x, y + dy / 2, { steps: 3 });
  await page.mouse.move(x, y + dy, { steps: 3 });
  const want = Math.min(m0.max, m0.top + (dy * m0.max) / ((n - size) * box.height));
  await expect.poll(() => scrollTop(scroller)).toBeGreaterThan(m0.top);
  const got = await scrollTop(scroller);
  // In proportion, within a row or so (CodeMirror measures lines as they come in).
  expect(Math.abs(got - want)).toBeLessThanOrEqual(Math.max(box.height * 1.5, m0.max * 0.03));
  // Outside the bar, below it and off to the side (inside the page): still dragging, to the end.
  const barBox = (await bar.boundingBox())!;
  const below = Math.min(page.viewportSize()!.height - 2, barBox.y + barBox.height + 3 * box.height);
  await page.mouse.move(x - 200, below, { steps: 4 });
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThanOrEqual(2);
  await page.mouse.up();
  // The button is up: moving no longer scrolls.
  const end = await scrollTop(scroller);
  await page.mouse.move(x, y);
  await page.waitForTimeout(50);
  expect(await scrollTop(scroller)).toBe(end);
  return box.height;
}

/** A click on the track above the thumb pages up by about a view. */
async function expectTrackPagesUp(bar: Locator, scroller: Locator): Promise<void> {
  const before = await scrollTop(scroller);
  await bar.locator('.wc-scroll-track').first().click();
  await expect.poll(() => scrollTop(scroller)).toBeLessThan(before);
  const client = await scroller.evaluate((el) => el.clientHeight);
  const after = await scrollTop(scroller);
  // One page, not a run of them (no auto-repeat on a short click).
  expect(before - after).toBeLessThanOrEqual(client + 1);
  expect(before - after).toBeGreaterThan(client / 3);
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
  await expect(ped(page)).toHaveAttribute('data-mode', 'lite');
}

const LONG = Array.from({ length: 120 }, (_, i) => `#alias {a${i}} {say ${i}}`).join('\n') + '\n';

test('profile EDITOR: the buffer scrollbar drags its thumb and the track pages', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 700 });
  await openProfile(page, LONG);
  await ped(page).locator('[data-btn="EDITOR"]').click();
  await expect(ped(page)).toHaveAttribute('data-mode', 'editor');
  const content = ped(page).locator('.cm-content');
  await content.click();
  await expect(content).toBeFocused();
  const bar = ped(page).locator('.wc-ped-bufbar');
  const scroller = ped(page).locator('.cm-scroller');
  await dragThumb(page, bar, scroller);
  await expectTrackPagesUp(bar, scroller);
  // The buffer kept the focus, and the zone is still the buffer.
  await expect(content).toBeFocused();
  await expect(ped(page)).toHaveAttribute('data-zone', 'buffer');
  expect(errors).toEqual([]);
});

test('profile LITE: the body box scrollbar drags its thumb', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 700 });
  const body = Array.from({ length: 400 }, (_, i) => `say line ${i}`).join(';');
  await openProfile(page, `#alias {long} {${body}}\n`);
  await ped(page).locator('[data-kind="alias"]').first().click();
  await page.keyboard.press('ArrowDown');
  await expect(ped(page)).toHaveAttribute('data-zone', 'list');
  const bar = ped(page).locator('.wc-ped-vbar');
  const scroller = ped(page).locator('.wc-ped-textarea');
  await dragThumb(page, bar, scroller, 1);
  expect(errors).toEqual([]);
});

test('script editor: the buffer scrollbar drags its thumb', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 600 });
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await lib(page, 'init');
  const src = '-- @name longscript\n-- @api 1\n\n' + Array.from({ length: 150 }, (_, i) => `echo("${i}")`).join('\n') + '\n';
  await lib(page, 'create', 'longscript', src);
  // Scripts, under Profile on the start page (stage 32).
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Scripts');
  await page.keyboard.press('Enter');
  await startFrame(page).locator('.wc-scr-row[data-name="longscript"] .wc-scr-name').click();
  await startFrame(page).locator('.wc-scr-panel [data-btn="EDIT"]').click();
  const editor = page.locator('.wc-frame:not([hidden]) > .wc-sed');
  const content = editor.locator('.cm-content');
  await expect(content).toBeFocused();
  const bar = editor.locator('.wc-ped-bufbar');
  const scroller = editor.locator('.cm-scroller');
  await dragThumb(page, bar, scroller);
  await expectTrackPagesUp(bar, scroller);
  await expect(content).toBeFocused();
  expect(errors).toEqual([]);
});

// Stage 44a: the Scripts page has no TUI scrollbars any more; its help
// scrolls natively (the kit's thin iron scrollbar), checked here by the wheel.
test('the Scripts window: the help scrolls natively; the game input keeps away', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 600 });
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await lib(page, 'init');
  const help = Array.from({ length: 60 }, (_, i) => `-- @help     Help line ${i} for the drag test.`).join('\n');
  await lib(page, 'create', 'aaahelp', `-- @name aaahelp\n-- @summary Long help\n-- @api 1\n${help}\n\necho("x")\n`);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await page.locator('.wc-mb[data-mb="scripts"]').click();
  const win = page.locator('.wc-win[data-win="scripts"] .wc-frame:not([hidden])');
  await win.locator('.wc-scr-row[data-name="aaahelp"] .wc-scr-name').first().click();
  const scroller = win.locator('.wc-scr-help');
  await expect(scroller).toContainText('Help line 0');
  await expect(win.locator('.wc-tui-bar')).toHaveCount(0);
  expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'auto')).toBe(true);
  await scroller.hover();
  await page.mouse.wheel(0, 300);
  await expect.poll(() => scrollTop(scroller)).toBeGreaterThan(0);
  // A press in the help stays in the window: the game input does not take the focus.
  await scroller.click();
  await expect(page.locator('.wc-input-field')).not.toBeFocused();
  expect(errors).toEqual([]);
});

test('About (start page): the TuiScrollbar drags its thumb; holding the track pages to the pointer', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1100, height: 500 });
  await mockMume(page);
  await page.goto('/');
  await page.locator('.wc-start .wc-sm-item[data-key="about"]').click();
  await expect(startFrame(page).locator('.wc-title-row')).toContainText('─── About ───');
  const bar = startFrame(page).locator('.wc-tui-bar');
  const scroller = startFrame(page).locator('.wc-about-text');
  await dragThumb(page, bar, scroller, 1);
  await expectTrackPagesUp(bar, scroller);

  // Back to the top, then hold the last track cell: the paging repeats until the thumb is there.
  await page.keyboard.press('Home');
  await expect.poll(() => scrollTop(scroller)).toBe(0);
  const last = (await bar.locator('.wc-scroll-track').last().boundingBox())!;
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2);
  await page.mouse.down();
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop), { timeout: 5000 })
    .toBeLessThanOrEqual(2);
  await page.mouse.up();
  expect(errors).toEqual([]);
});

test('Export editor: the overview strip thumb drags the log; the press that ends the drag does not jump', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1400, height: 820 });
  await pinDemoClock(page);
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').click();
  const f = startFrame(page);
  await expect(f.locator('.wc-tr:not(.is-empty)')).toHaveCount(3);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await f.locator('[data-btn="EXPORT"]').click();
  await expect(f.locator('.wc-exp')).toBeVisible();
  const log = f.locator('.wc-exp-log');
  const thumb = f.locator('.wc-exp-thumb');
  await expect(thumb).toBeVisible();
  const box = (await thumb.boundingBox())!;
  const strip = (await f.locator('.wc-exp-map').boundingBox())!;
  const m0 = await log.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight, h: el.scrollHeight }));
  expect(m0.max).toBeGreaterThan(0);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 60, { steps: 4 });
  // 60 px of a strip of `strip.height` px cover about 60 / strip.height of the log.
  const want = (60 / strip.height) * m0.h;
  await expect.poll(() => scrollTop(log)).toBeGreaterThan(want * 0.8);
  expect(await scrollTop(log)).toBeLessThan(want * 1.2);
  const before = await scrollTop(log);
  await page.mouse.up();
  await page.waitForTimeout(100);
  expect(await scrollTop(log)).toBe(before);
  // A press on the strip below the thumb jumps there.
  await page.mouse.click(strip.x + strip.width / 2, strip.y + strip.height - 4);
  await expect.poll(() => scrollTop(log)).toBeGreaterThan(m0.max * 0.8);
  expect(errors).toEqual([]);
});
