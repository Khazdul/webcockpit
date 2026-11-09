// ADR 0106: every `░█` scrollbar drags its thumb. A press on the thumb and
// a drag moves the content in proportion (under pointer capture, so the
// drag goes on outside the bar), and a press on the track still pages.
// The desktop's last `░█` bars have gone to native scrollers (the notes
// below); what is left checks those and the Export editor's strip.
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
const lib = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(
    ([fn, args]) => {
      const l = window.__wc!.shell.scripts as unknown as Record<string, (...a: unknown[]) => unknown>;
      return Promise.resolve(l[fn as string]!(...(args as unknown[]))) as Promise<unknown>;
    },
    [fn, args] as const,
  );

const scrollTop = (scroller: Locator) => scroller.evaluate((el) => el.scrollTop);

// The profile editor's TUI scrollbars (EDITOR's buffer bar, LITE's body box
// bar) are gone with its new look (stage 43a, ADR 0128): the buffer and
// the fields scroll natively with the lantern kit's thin scrollbars.

// Stage 44b: the script editor's TUI buffer bar is gone too; the buffer
// (CodeMirror's own scroller) scrolls natively, and the wheel and a drag
// of the native scrollbar keep the buffer's focus.
test('script editor: the buffer scrolls natively and keeps its focus', async ({ page }) => {
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
  await expect(editor.locator('.wc-ped-bufbar, .wc-tui-bar')).toHaveCount(0);
  const scroller = editor.locator('.cm-scroller');
  expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY))).toBe(true);
  await scroller.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => scrollTop(scroller)).toBeGreaterThan(0);
  // A press on the native scrollbar (the scroller's right edge) leaves the focus in the buffer.
  const r = (await scroller.boundingBox())!;
  await page.mouse.click(r.x + r.width - 3, r.y + r.height - 20);
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

// About's TuiScrollbar went with its new look (stage 47, ADR 0132), the
// Statistics pane's with its (stage 49, ADR 0134: a native scroller): the
// `░█` bar is left on the phone's ESC → Statistics only.

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
  // History in the new look (stage 45): the Rasta session is the second row.
  await expect(f.locator('.wc-hist .wc-lk-tr')).toHaveCount(3);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(f.locator('.wc-hist .wc-lk-tr.is-on .wc-hist-char')).toHaveText('Rasta');
  await f.locator('.wc-hist [data-btn="EXPORT"]').click();
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
