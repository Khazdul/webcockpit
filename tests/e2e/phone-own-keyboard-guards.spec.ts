// Stage 53h: the findings of the review of round 53g, each with the check
// that fails without its fix (ADR 0139, "as built in round 53h").
//
// - The keyboard never comes before the tap's click, with a finger's real
//   timing (touch start, 90 ms, touch end; the browser then makes up the
//   mouse press, the release and the click): the made-up events are
//   hit-tested on the page as it was, and the click lands on the field. For
//   a plain field (an editor's Find) and for CodeMirror's text.
// - A look page of the game's menu ends at the keyboard's top edge (the
//   `.wc-menu-look` rule): nothing of it lies under the keys.
// - Lite with the Pattern focused and the keyboard folded: a tap on New
//   brings the keyboard back for the (reused) field.
// - The caret back on the first line of Lite's body: its scroll is 0.
// - A dialog's error line on a phone on its side stands clear of the
//   buttons (the script name dialog; the profile one is in
//   phone-profile-dialogs.spec.ts).
//
// `phone` project. Nothing reaches MUME.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { morphDone } from './look';

const S21 = { width: 360, height: 800 };
const S21_LAND = { width: 800, height: 360 };

const html = (page: Page) => page.locator('html');
const host = (page: Page) => page.locator('.wc-okb-page');
const okb = (page: Page) => host(page).locator('.wc-ph-okb');
const key = (page: Page, k: string) => okb(page).locator([...k].length === 1 ? `.wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-ph-okb-k[data-act="${k}"]`);
const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const sed = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-sed');

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));

async function expectUp(page: Page): Promise<Box> {
  await expect(okb(page)).toBeVisible();
  await expect(html(page)).toHaveClass(/\bwc-okb-pg\b/);
  await frames(page);
  return box(host(page));
}

async function expectDown(page: Page): Promise<void> {
  await expect(host(page)).toBeHidden();
  await expect(html(page)).not.toHaveClass(/\bwc-okb-pg\b/);
}

async function openStart(page: Page): Promise<void> {
  await page.goto('/?phone=1&kbd=en');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
}

async function openGame(page: Page): Promise<void> {
  await page.goto('/?replay&phone=1&kbd=en');
  await expect(html(page)).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
}

async function openScript(page: Page, source: string): Promise<Locator> {
  await openStart(page);
  await page.evaluate(async (src) => {
    const l = window.__wc!.shell.scripts!;
    await l.init();
    await l.create('phoneed', src);
  }, source);
  const f = startFrame(page);
  await f.locator('.wc-sm-item[data-key="scripts"]').tap();
  await f.locator('.wc-scr-row[data-name="phoneed"] .wc-scr-name').tap();
  await f.locator('[data-btn="EDIT"]:visible').first().tap();
  await expect(sed(page)).toHaveAttribute('data-script', 'phoneed');
  await morphDone(page);
  return sed(page);
}

/**
 * Records, ahead of every listener of the page, what the mouse events a
 * touch makes up and its click hit, and whether our keyboard was up then.
 */
const watchTap = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __tap?: Array<{ type: string; target: string; up: boolean }> };
    w.__tap = [];
    for (const type of ['mousedown', 'mouseup', 'click']) {
      window.addEventListener(
        type,
        (e) => {
          const t = e.target as Element | null;
          const name = !t ? '' : t.closest('.wc-okb-page') ? 'keyboard' : t.closest('.cm-content') ? 'code' : t.tagName === 'INPUT' ? `input:${t.closest('[data-field]')?.getAttribute('data-field') ?? ''}` : t.tagName.toLowerCase();
          w.__tap!.push({ type, target: name, up: document.documentElement.classList.contains('wc-okb-pg') });
        },
        true,
      );
    }
  });
const tapLog = (page: Page) => page.evaluate(() => (window as unknown as { __tap: Array<{ type: string; target: string; up: boolean }> }).__tap);

/** A finger's tap with its real timing: touch start, 90 ms, touch end (the browser makes up the rest). */
async function fingerTap(page: Page, x: number, y: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y) }] });
  await page.waitForTimeout(90);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

const SRC = '-- @name     phoneed\n-- @version  1\n-- @api      1\nlocal a = 1\nlocal b = 2\n';

for (const [name, viewport] of [
  ['portrait 360 × 800', S21],
  ['landscape 800 × 360', S21_LAND],
] as const) {
  test.describe(name, () => {
    test.use({ viewport });

    test('a finger\'s real tap: the keyboard comes with the click, never before it (a Find field, the code)', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const ed = await openScript(page, SRC);
      // The find row open and the keyboard folded: a plain field of ours, shown, without the focus.
      await ed.locator('.wc-sed-tools [data-btn="FIND"]').tap();
      const find = ed.locator('.wc-lk-search [data-field="find"] input');
      await expect(find).toBeFocused();
      await expectUp(page);
      await key(page, 'fold').tap();
      await expectDown(page);
      await expect(find).not.toBeFocused();
      await page.waitForTimeout(900);
      await watchTap(page);
      const f = await box(find);
      await fingerTap(page, f.x + f.width / 2, f.y + f.height / 2);
      await expect(find).toBeFocused();
      await expectUp(page);
      let log = await tapLog(page);
      // The made-up mouse press, release and click all hit the field, on the page as it was.
      expect(log.map((e) => e.type)).toEqual(['mousedown', 'mouseup', 'click']);
      expect(log.map((e) => e.target)).toEqual(['input:find', 'input:find', 'input:find']);
      expect(log.map((e) => e.up)).toEqual([false, false, false]);
      await key(page, 'a').tap();
      await expect(find).toHaveValue('a');

      // The same for CodeMirror's text: the keyboard folded, a finger on a line of code.
      await key(page, 'fold').tap();
      await expectDown(page);
      await page.waitForTimeout(900);
      await page.evaluate(() => ((window as unknown as { __tap: unknown[] }).__tap.length = 0));
      const line = await box(ed.locator('.cm-content .cm-line').first());
      await fingerTap(page, line.x + 60, line.y + line.height / 2);
      await expect(ed.locator('.cm-content')).toBeFocused();
      await expectUp(page);
      log = await tapLog(page);
      expect(log.map((e) => e.type)).toEqual(['mousedown', 'mouseup', 'click']);
      expect(log.map((e) => e.target)).toEqual(['code', 'code', 'code']);
      expect(log.map((e) => e.up)).toEqual([false, false, false]);
      expect(errors).toEqual([]);
    });

    test('a look page of the game\'s menu ends at the keyboard: nothing of the profile editor lies under the keys', async ({ page }) => {
      await openGame(page);
      await page.locator('.wc-ph-menu').tap();
      await page.locator('.wc-ph-sheet [data-row="profile"]').tap();
      const pe = page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-pe');
      await expect(pe).toHaveAttribute('data-view', 'lite');
      await pe.locator('[data-rail="alias"]').tap();
      await pe.locator('[data-btn="NEW"]').tap();
      await expect(pe.locator('[data-field="pattern"] input')).toBeFocused();
      const k = await expectUp(page);
      const look = page.locator('.wc-overlay > .wc-overlay-box .wc-frame.wc-menu-look:not([hidden])');
      await expect(look).toBeVisible();
      await expect.poll(async () => Math.round((await box(look)).y + (await box(look)).height)).toBeLessThanOrEqual(Math.round(k.y));
      // The box drawn in it ends there too, whole.
      const win = look.locator('.wc-lk-box').first();
      expect((await box(win)).y + (await box(win)).height).toBeLessThanOrEqual(k.y + 0.5);
    });
  });
}

test.describe('Lite, portrait 360 × 800', () => {
  test.use({ viewport: S21 });

  async function lite(page: Page): Promise<Locator> {
    await openStart(page);
    await page.evaluate(async () => {
      await window.__wc!.shell.profiles.init();
      await window.__wc!.shell.profiles.save('default', '#alias {k} {kill}\n');
    });
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="profile"]').tap();
    await f.locator('[data-btn="EDIT"]').tap();
    const pe = page.locator('.wc-frame:not([hidden]) .wc-pe');
    await expect(pe).toHaveAttribute('data-view', 'lite');
    await pe.locator('[data-rail="alias"]').tap();
    await pe.locator('[data-btn="NEW"]').tap();
    await expect(pe.locator('[data-field="pattern"] input')).toBeFocused();
    await expectUp(page);
    return pe;
  }

  test('the Pattern focused and the keyboard folded: a tap on New brings the keyboard back for the new entry', async ({ page }) => {
    const pe = await lite(page);
    const pattern = pe.locator('[data-field="pattern"] input');
    await key(page, 'a').tap();
    await key(page, 'fold').tap();
    await expectDown(page);
    // The editor takes the focus back into the Pattern on its next drawing: no keyboard for that.
    await page.waitForTimeout(900);
    await expectDown(page);
    const newBtn = pe.locator('[data-btn="NEW"]:visible').first();
    await newBtn.tap();
    await expect(pattern).toBeFocused();
    await expect(pattern).toHaveValue('');
    await expectUp(page);
    await key(page, 'b').tap();
    await expect(pattern).toHaveValue('b');
  });

  test('the caret back on the first line of a long body: the field\'s scroll is 0, its own air above the line showing', async ({ page }) => {
    const pe = await lite(page);
    await key(page, 'z').tap();
    const body = pe.locator('[data-field="body"] textarea');
    await body.tap();
    await expect(body).toBeFocused();
    await expectUp(page);
    for (let i = 0; i < 14; i++) {
      await key(page, 'x').tap();
      await key(page, 'enter').tap();
    }
    await expect.poll(() => body.evaluate((el: HTMLTextAreaElement) => el.scrollTop)).toBeGreaterThan(20);
    for (let i = 0; i < 16; i++) await key(page, 'up').tap();
    expect(await body.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(0);
    await expect.poll(() => body.evaluate((el: HTMLTextAreaElement) => el.scrollTop)).toBe(0);
  });
});

test.describe('a dialog\'s error on a phone on its side, 800 × 360', () => {
  test.use({ viewport: S21_LAND });

  test('the script name dialog: the error line stands whole, clear of the buttons, above the keys', async ({ page }) => {
    await openStart(page);
    await page.evaluate(async () => {
      const l = window.__wc!.shell.scripts!;
      await l.init();
      await l.create('taken');
    });
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="scripts"]').tap();
    await f.locator('[data-btn="NEW"]').tap();
    const dlg = page.locator('.wc-lk-dialog[data-dlg="new"]');
    await expect(dlg.locator('input')).toBeFocused();
    const k = await expectUp(page);
    for (const ch of 'taken') await key(page, ch).tap();
    await key(page, 'enter').tap();
    const err = dlg.locator('.wc-lk-dialog-err');
    await expect(err).not.toHaveText('');
    await expectUp(page);
    await expect
      .poll(async () => {
        const e = await box(err);
        const field = await box(dlg.locator('input'));
        const whole = await err.evaluate((el) => el.scrollHeight <= el.clientHeight + 0.5);
        const btns = await dlg.locator('.wc-lk-dialog-btns .wc-lk-btn').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect()).map((r) => ({ y: r.top, bottom: r.bottom })));
        const clear = btns.length > 0 && btns.every((b) => b.y >= e.y + e.height + 3 && b.bottom <= k.y + 0.5);
        return whole && clear && e.height >= 18 && e.y >= field.y + field.height ? 'clear' : `error ${e.y}..${e.y + e.height} whole ${whole}, field ends ${field.y + field.height}, buttons ${JSON.stringify(btns)}, keyboard ${k.y}`;
      })
      .toBe('clear');
  });
});
