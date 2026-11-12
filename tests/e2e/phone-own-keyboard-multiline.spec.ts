// Stage 53g (ADR 0139 §4–§5 and the multi-line part of §1): our own keyboard
// on the phone's pages, the multi-line fields and the page keys.
//
// - Lite's body is ours: Enter is a line break (its key says so), backspace
//   deletes back across a break, the caret keys move the caret, and the
//   caret's line stays above the keyboard as the text grows.
// - The export comment is ours: one paragraph, Enter saves; its composer
//   stands whole above the keyboard.
// - Esc closes a dialog with one press and leaves a field as a real Esc
//   does; Tab cycles the profile editor's zones (Shift and Tab the other
//   way); nothing leaves a reserve behind.
// - The backtick is on the symbols page.
// - Landscape: the page keys stand beside the block (the keyboard is no
//   higher), and the field typed in is hittable above it (53f review).
// - A rotation with the keyboard up keeps it up and the field in view; a
//   field focused before the phone chunk came gets the keyboard when it
//   comes.
// - `?kbd=0`, a desktop-size and a tablet-size window: nothing of this.
//
// `phone` project. Nothing reaches MUME.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';

const S21 = { width: 360, height: 800 };
const S21_LAND = { width: 800, height: 360 };

const html = (page: Page) => page.locator('html');
const host = (page: Page) => page.locator('.wc-okb-page');
const okb = (page: Page) => host(page).locator('.wc-ph-okb');
const key = (page: Page, k: string) => okb(page).locator([...k].length === 1 ? `.wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-ph-okb-k[data-act="${k}"]`);
const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const menuFrame = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden])');

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function type(page: Page, ...keys: string[]): Promise<void> {
  for (const k of keys) await key(page, k).tap();
}

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));

async function openStart(page: Page, query = '&kbd=en'): Promise<void> {
  await page.goto(`/?phone=1${query}`);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
}

async function openGame(page: Page, query = '&kbd=en'): Promise<void> {
  await page.goto(`/?replay&phone=1${query}`);
  await expect(html(page)).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
}

async function expectUp(page: Page): Promise<Box> {
  await expect(okb(page)).toBeVisible();
  await expect(html(page)).toHaveClass(/\bwc-okb-pg\b/);
  await expect(html(page)).not.toHaveClass(/(^|\s)wc-okb(\s|$)/);
  await frames(page);
  const view = page.viewportSize()!;
  // (After a rotation the app box follows the window a moment later.)
  await expect.poll(async () => Math.round((await box(host(page))).y + (await box(host(page))).height)).toBe(view.height);
  const k = await box(host(page));
  expect(k.width).toBe(view.width);
  return k;
}

async function expectDown(page: Page): Promise<void> {
  await expect(host(page)).toBeHidden();
  await expect(html(page)).not.toHaveClass(/\bwc-okb-pg\b/);
  expect(await page.locator('#app').evaluate((el) => el.style.getPropertyValue('--wc-okb-page-h'))).toBe('');
}

async function expectAbove(page: Page, l: Locator): Promise<void> {
  await expect(l).toBeVisible();
  const k = await box(host(page));
  await expect
    .poll(async () => {
      const b = await box(l);
      return b.y >= 0 && b.y + b.height <= k.y + 0.5;
    })
    .toBe(true);
}

async function expectMarked(f: Locator): Promise<void> {
  await expect(f).toHaveAttribute('inputmode', 'none');
  await expect(f).toHaveAttribute('virtualkeyboardpolicy', 'manual');
}

/** The point of `l` at `fx`, `fy` of its box is `l` itself (or inside it): nothing lies over it. */
const hittable = (l: Locator, fx = 0.5, fy = 0.5): Promise<boolean> =>
  l.evaluate(
    (el, [x, y]) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width * x!, r.top + r.height * y!);
      return !!at && (at === el || el.contains(at));
    },
    [fx, fy],
  );

/**
 * Where the caret's line of a textarea lies on screen (its top and bottom),
 * for text whose lines do not wrap: from the field's own line height.
 */
const caretLine = (area: Locator): Promise<{ top: number; bottom: number; line: number }> =>
  area.evaluate((el: HTMLTextAreaElement) => {
    const st = getComputedStyle(el);
    const lh = parseFloat(st.lineHeight);
    const line = el.value.slice(0, el.selectionEnd).split('\n').length - 1;
    const top = el.getBoundingClientRect().top + el.clientTop + parseFloat(st.paddingTop) + line * lh - el.scrollTop;
    return { top, bottom: top + lh, line };
  });

/** The caret's line is whole above the keyboard, inside the field's own box and under nothing. */
async function expectCaretLineShown(page: Page, area: Locator): Promise<void> {
  const k = await box(host(page));
  await expect
    .poll(async () => {
      const c = await caretLine(area);
      const b = await box(area);
      if (!(c.top >= b.y - 0.5 && c.bottom <= b.y + b.height + 0.5 && c.bottom <= k.y + 0.5 && c.top >= 0)) return `caret line ${c.top}..${c.bottom}, field ${b.y}..${b.y + b.height}, keyboard ${k.y}`;
      return area.evaluate((el, y) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, y);
        return at === el ? 'shown' : `covered by ${at?.tagName}.${at?.className} at ${y}`;
      }, (c.top + c.bottom) / 2);
    })
    .toBe('shown');
}

async function addScript(page: Page, name: string, source?: string): Promise<void> {
  await page.evaluate(
    async ({ n, src }) => {
      const l = window.__wc!.shell.scripts!;
      await l.init();
      if (src === undefined) await l.create(n);
      else await l.create(n, src);
    },
    { n: name, src: source },
  );
}

const TYPED = '-- @name     phonetyped\n-- @version  1\n-- @api      1\n-- @setting  warn number 5 0..30 unit min "Warn before the end"\n-- @setting  word string hello "What to say"\n';

/** Profiles → Edit (Lite) → Aliases → New: the pattern has the focus and the keyboard is up. */
async function openLiteNew(page: Page, f: Locator): Promise<Locator> {
  const pe = f.locator('.wc-pe');
  await expect(pe).toHaveAttribute('data-view', 'lite');
  await pe.locator('[data-rail="alias"]').tap();
  await pe.locator('[data-btn="NEW"]').tap();
  await expect(pe.locator('[data-field="pattern"] input')).toBeFocused();
  await expectUp(page);
  return pe;
}

async function liteFromStart(page: Page): Promise<Locator> {
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', '#alias {k} {kill}\n');
  });
  const f = startFrame(page);
  await f.locator('.wc-sm-item[data-key="profile"]').tap();
  await f.locator('[data-btn="EDIT"]').tap();
  return openLiteNew(page, page.locator('.wc-frame:not([hidden])'));
}

const stored = (page: Page) => page.evaluate(() => window.__wc!.shell.profiles.get('default').then((r) => r?.text ?? ''));

async function openExport(page: Page): Promise<Locator> {
  await page.evaluate(async () => {
    const lib = await window.__wc!.runs();
    await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  const f = startFrame(page);
  await f.locator('.wc-sm-item[data-key="history"]').tap();
  const hist = f.locator('.wc-hist');
  await expect(hist.locator('.wc-lk-tr')).toHaveCount(3);
  await hist.locator('.wc-lk-tr').nth(1).tap();
  await hist.locator('.wc-hist-card [data-btn="EXPORT"]').tap();
  await expect(f.locator('.wc-exp')).toBeVisible();
  return f;
}

// ------------------------------------------------------------------ portrait

test.describe('portrait 360 × 800', () => {
  test.use({ viewport: S21 });

  test('Lite\'s body: three lines on our keys, Enter is a line break, backspace joins lines, the caret keys move the caret', async ({ page }) => {
    const errors = watchErrors(page);
    await openStart(page);
    const pe = await liteFromStart(page);
    await type(page, 'z', 'z');
    const body = pe.locator('[data-field="body"] textarea');
    await expectMarked(body);
    await expect(body).toHaveAttribute('data-okb-kind', 'lines');
    await body.tap();
    await expect(body).toBeFocused();
    // The same keyboard stays up, now for the body: Enter is a line break and looks like one.
    await expectUp(page);
    await expect(key(page, 'enter')).toHaveAttribute('data-enter', 'newline');
    await expect(key(page, 'enter')).toHaveAttribute('aria-label', 'New line');
    // The page keys: a row of six at the top of the block; no history arrows on a page.
    await expect(okb(page).locator('.wc-ph-okb-row').first()).toHaveClass(/is-nav/);
    await expect(okb(page).locator('.wc-ph-okb-row.is-nav .wc-ph-okb-k')).toHaveCount(6);
    await expect(key(page, 'older')).toHaveCount(0);
    for (const a of ['up', 'down', 'left', 'right', 'esc', 'tab']) await expect(key(page, a)).not.toHaveAttribute('aria-disabled', 'true');
    // Thumb-size at 360 px: no page key narrower than a letter key.
    const letter = await box(key(page, 'q'));
    for (const a of ['esc', 'tab', 'left', 'right', 'up', 'down']) expect((await box(key(page, a))).width).toBeGreaterThanOrEqual(letter.width);

    await type(page, 'e', 'a', 't', 'enter', 'r', 'e', 's', 't', 'enter', 's', 'l', 'e', 'e', 'p');
    await expect(body).toHaveValue('eat\nrest\nsleep');
    // Backspace across a break: "sleep" goes, then the break itself.
    await type(page, 'back', 'back', 'back', 'back', 'back');
    await expect(body).toHaveValue('eat\nrest\n');
    await type(page, 'back');
    await expect(body).toHaveValue('eat\nrest');
    await type(page, 'enter', 'n', 'a', 'p');
    await expect(body).toHaveValue('eat\nrest\nnap');
    // Caret keys: up keeps the column, left and right go a character, down from the last line goes to the end.
    const caret = () => body.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]);
    await type(page, 'up');
    expect(await caret()).toEqual([7, 7]);
    await type(page, 'up');
    expect(await caret()).toEqual([3, 3]);
    await type(page, 'left');
    expect(await caret()).toEqual([2, 2]);
    await type(page, 'x');
    await expect(body).toHaveValue('eaxt\nrest\nnap');
    await type(page, 'right', 'right');
    expect(await caret()).toEqual([5, 5]);
    await type(page, 'down', 'down');
    expect(await caret()).toEqual([13, 13]);
    await type(page, 'up', 'up', 'up');
    expect(await caret()).toEqual([0, 0]);
    // No text key made a key event; the body kept the focus all along.
    await expect(body).toBeFocused();
    await key(page, 'fold').tap();
    await expectDown(page);
    await pe.locator('[data-btn="SHEET"]').tap();
    await expect.poll(() => stored(page)).toContain('#alias {zz} {\n    eaxt\n    rest\n    nap\n}');
    expect(errors).toEqual([]);
  });

  test('Lite\'s body: the caret\'s line stays above the keyboard as lines are added, and when the caret goes back up', async ({ page }) => {
    const errors = watchErrors(page);
    await openStart(page);
    const pe = await liteFromStart(page);
    const body = pe.locator('[data-field="body"] textarea');
    await body.tap();
    await expect(body).toBeFocused();
    await expectUp(page);
    for (let i = 0; i < 16; i++) {
      await type(page, 'l', 'enter');
      if (i % 5 === 4) await expectCaretLineShown(page, body);
    }
    expect((await caretLine(body)).line).toBe(16);
    await expectCaretLineShown(page, body);
    for (let i = 0; i < 16; i++) await key(page, 'up').tap();
    expect((await caretLine(body)).line).toBe(0);
    await expectCaretLineShown(page, body);
    await type(page, 'down', 'down', 'down', 'down', 'down', 'down', 'down', 'down', 'down', 'down', 'down', 'down');
    await expectCaretLineShown(page, body);
    expect(errors).toEqual([]);
  });

  test('Tab in the profile editor cycles its zones from our key: pattern to body with the keyboard up, Shift and Tab back; Esc leaves the field', async ({ page }) => {
    const errors = watchErrors(page);
    await openStart(page);
    const pe = await liteFromStart(page);
    const pattern = pe.locator('[data-field="pattern"] input');
    const body = pe.locator('[data-field="body"] textarea');
    await type(page, 'q');
    // In a one-line field up and down have nothing to do.
    for (const a of ['up', 'down']) await expect(key(page, a)).toHaveAttribute('aria-disabled', 'true');
    await expect(key(page, 'enter')).toHaveAttribute('data-enter', 'submit');
    await key(page, 'tab').tap();
    await expect(body).toBeFocused();
    await expectUp(page);
    await expect(key(page, 'enter')).toHaveAttribute('data-enter', 'newline');
    await type(page, 'h', 'i');
    await expect(body).toHaveValue('hi');
    // Shift and Tab: back to the pattern.
    await type(page, 'shift', 'tab');
    await expect(pattern).toBeFocused();
    await expectUp(page);
    await expect(okb(page)).toHaveAttribute('data-shift', 'off');
    await type(page, 'q');
    await expect(pattern).toHaveValue('qq');
    await key(page, 'tab').tap();
    await expect(body).toBeFocused();
    // Tab out of the last field: the views; no field of ours has the focus, the keyboard goes.
    await key(page, 'tab').tap();
    await expect(pe.locator('.wc-pe-views')).toHaveClass(/is-cur/);
    await expectDown(page);
    // Esc in the body: back to the list, as a real Esc there; the keyboard goes and leaves no reserve.
    await body.tap();
    await expectUp(page);
    await key(page, 'esc').tap();
    await expect(body).not.toBeFocused();
    await expectDown(page);
    await expect(pe).toBeVisible();
    await expect(pe.locator('.wc-pe-row', { hasText: 'qq' })).toBeVisible();
    await expect.poll(() => stored(page)).toContain('#alias {qq} {hi}');
    expect(errors).toEqual([]);
  });

  test('the export comment: typed on our keys, the composer whole above the keyboard, Enter saves', async ({ page }) => {
    const errors = watchErrors(page);
    await pinDemoClock(page);
    await openStart(page);
    const f = await openExport(page);
    await f.locator('[data-btn="COMMENT"]').tap();
    const comp = f.locator('.wc-exp-comp');
    const area = comp.locator('textarea');
    await expect(area).toBeFocused();
    await expectMarked(area);
    // One paragraph: Enter is the composer's (it saves), not a line break.
    expect(await area.getAttribute('data-okb-kind')).toBeNull();
    const k = await expectUp(page);
    await expect(key(page, 'enter')).toHaveAttribute('data-enter', 'submit');
    for (const a of ['up', 'down']) await expect(key(page, a)).toHaveAttribute('aria-disabled', 'true');
    // The page steps aside as for the device's keyboard, and the composer stands whole above ours.
    await expect(f.locator('.wc-exp')).toHaveClass(/\bis-kbd\b/);
    await expectAbove(page, comp.locator('.wc-exp-comp-in'));
    for (const b of ['SAVE', 'CANCEL']) {
      await expectAbove(page, comp.locator(`[data-btn="${b}"]`));
      expect(await hittable(comp.locator(`[data-btn="${b}"]`))).toBe(true);
    }
    expect(await hittable(area)).toBe(true);
    // No padding is added for our keyboard: the page already ends at its top edge.
    const exp = await box(f.locator('.wc-exp'));
    expect(exp.y + exp.height).toBeLessThanOrEqual(k.y + 0.5);
    expect(await f.locator('.wc-exp').evaluate((el) => (el as HTMLElement).style.paddingBottom)).toBe('');
    await type(page, 'shift', 'o', 'r', 'c', 'space', 'd', 'i', 'e', 'd');
    await expect(area).toHaveValue('Orc died');
    await expect(comp.locator('.wc-exp-preview')).toContainText('Orc died');
    await type(page, 'left', 'left', 'left', 'left', 'back', 'sym', 'alt', '`', 'sym');
    await expect(area).toHaveValue('Orc`died');
    await key(page, 'enter').tap();
    await expect(comp).toHaveCount(0);
    await expectDown(page);
    await expect(f.locator('.wc-exp-counts')).toContainText('1 comment');
    await expect(f.locator('.wc-exp')).not.toHaveClass(/\bis-kbd\b/);
    // Again, and Esc cancels the composer with one press.
    await f.locator('[data-btn="COMMENT"]').tap();
    await expect(area).toBeFocused();
    await expectUp(page);
    await type(page, 'n', 'o');
    await key(page, 'esc').tap();
    await expect(comp).toHaveCount(0);
    await expectDown(page);
    await expect(f.locator('.wc-exp')).toBeVisible();
    await expect(f.locator('.wc-exp-counts')).toContainText('1 comment');
    expect(errors).toEqual([]);
  });

  test('Esc from our key in each kind of field: one press closes a dialog or leaves the field, as a real Esc, and no reserve is left', async ({ page }) => {
    const errors = watchErrors(page);
    await pinDemoClock(page);
    await openStart(page);
    await addScript(page, 'phonetyped', TYPED);
    await page.evaluate(async () => {
      await window.__wc!.shell.profiles.init();
      await window.__wc!.shell.profiles.create('hero', '');
    });
    const f = startFrame(page);
    // The look kit's dialog (a new script).
    await f.locator('.wc-sm-item[data-key="scripts"]').tap();
    await f.locator('[data-btn="NEW"]').tap();
    const dlg = page.locator('.wc-lk-dialog[data-dlg="new"]');
    await expect(dlg.locator('input')).toBeFocused();
    await expectUp(page);
    await type(page, 'a');
    await key(page, 'esc').tap();
    await expect(dlg).toHaveCount(0);
    await expectDown(page);
    await expect(f.locator('.wc-scr')).toBeVisible();
    // A script setting's value: Esc leaves it unchanged.
    await f.locator('.wc-scr-row[data-name="phonetyped"] .wc-scr-name').tap();
    const word = f.locator('.wc-scr-set[data-set="word"]');
    await word.locator('.wc-scr-str').tap();
    await expect(word.locator('input.wc-scr-input')).toBeFocused();
    await expectUp(page);
    await type(page, 'x');
    await key(page, 'esc').tap();
    await expect(word.locator('input.wc-scr-input')).toHaveCount(0);
    await expectDown(page);
    expect(await page.evaluate(() => window.__wc!.shell.scripts!.settingsOf('phonetyped'))).toMatchObject({ word: 'hello' });
    await expect(f.locator('.wc-scr')).toBeVisible();
    // The manual's find: the field lets go; the manual stays.
    await f.locator('[data-btn="MANUAL"]').tap();
    const m = page.locator('.wc-frame:not([hidden]) .wc-sman');
    const find = m.locator('.wc-lk-mfind input');
    await find.tap();
    await expectUp(page);
    await key(page, 'esc').tap();
    await expect(find).not.toBeFocused();
    await expectDown(page);
    await expect(m).toBeVisible();
    await m.locator(':scope > .wc-lk-back').tap();
    await page.locator('.wc-frame:not([hidden]) .wc-lk-back').first().tap();
    // The rename prompt of a profile (the look kit's dialog since 2026-11-12).
    await startFrame(page).locator('.wc-sm-item[data-key="profile"]').tap();
    const row = startFrame(page).locator('.wc-pl-row[data-name="hero"]');
    await row.tap();
    await row.locator('[data-btn="RENAME"]').tap();
    const old = page.locator('.wc-lk-dialog[data-dlg="rename"] input');
    await expect(old).toBeFocused();
    await expectUp(page);
    await key(page, 'esc').tap();
    await expect(old).toHaveCount(0);
    await expectDown(page);
    await expect(startFrame(page).locator('.wc-lk-hood-t')).toHaveText('Profiles');
    expect(errors).toEqual([]);
  });

  test('the export title: Esc cancels it with one press; the caret keys edit in the middle of a one-line field', async ({ page }) => {
    const errors = watchErrors(page);
    await pinDemoClock(page);
    await openStart(page);
    const f = await openExport(page);
    await f.locator('[data-btn="TITLE"]').tap();
    const field = f.locator('.wc-exp-file.is-edit input');
    await expect(field).toBeFocused();
    await expectUp(page);
    await type(page, 'a', 'b', 'c', 'left', 'x', 'left', 'left', 'left', 'y', 'right', 'right', 'right', 'right', 'z');
    await expect(field).toHaveValue('yabxcz');
    await key(page, 'esc').tap();
    await expect(f.locator('.wc-exp-file.is-edit')).toHaveCount(0);
    await expectDown(page);
    await expect(f.locator('.wc-exp')).toBeVisible();
    await expect(f.locator('.wc-exp-file')).not.toContainText('yabxcz');
    expect(errors).toEqual([]);
  });

  test('a rotation with the keyboard up: it stays up and the field stays in view, both ways (a setting\'s number, Lite\'s pattern)', async ({ page }) => {
    const errors = watchErrors(page);
    await openStart(page);
    await addScript(page, 'phonetyped', TYPED);
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="scripts"]').tap();
    await f.locator('.wc-scr-row[data-name="phonetyped"] .wc-scr-name').tap();
    const warn = f.locator('.wc-scr-set[data-set="warn"]');
    await warn.locator('.wc-scr-val').tap();
    const num = warn.locator('input.wc-scr-input');
    await expect(num).toBeFocused();
    await expectUp(page);
    // On its side and upright again, twice: the keyboard is placed anew each time and the field
    // brought back above it. (The Scripts page changes its columns on the way: the field is hidden
    // for a moment, and the keyboard stays up through that.)
    for (const size of [S21_LAND, S21, S21_LAND, S21]) {
      await page.setViewportSize(size);
      await frames(page);
      await expect(num).toBeFocused();
      await expectUp(page);
      await expectAbove(page, num);
      expect(await hittable(num)).toBe(true);
    }
    // (The value was selected when the field opened: the digit replaces it.)
    await type(page, '7');
    await expect(num).toHaveValue('7');
    await key(page, 'enter').tap();
    await expectDown(page);
    await expect.poll(() => page.evaluate(() => window.__wc!.shell.scripts!.settingsOf('phonetyped'))).toMatchObject({ warn: 7 });
    await page.locator('.wc-frame:not([hidden]) .wc-lk-back').first().tap();
    // Lite's pattern: the same field in both layouts (two columns, a sheet); the keyboard stays up both ways.
    const pe = await liteFromStart(page);
    const pattern = pe.locator('[data-field="pattern"] input');
    for (const size of [S21_LAND, S21, S21_LAND, S21]) {
      await page.setViewportSize(size);
      await frames(page);
      await expect(pattern).toBeFocused();
      await expectUp(page);
      await expectAbove(page, pattern);
      expect(await hittable(pattern)).toBe(true);
    }
    expect(errors).toEqual([]);
  });

  test('a dialog opened before the phone chunk came: its field gets the keyboard when the chunk comes, without a second tap', async ({ page }) => {
    const errors = watchErrors(page);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(/\/src\/phone\/index\.ts/, async (route) => {
      await held;
      await route.continue();
    });
    await openStart(page);
    await page.evaluate(() => window.__wc!.shell.scripts!.init());
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="scripts"]').tap();
    await f.locator('[data-btn="NEW"]').tap();
    const field = page.locator('.wc-lk-dialog[data-dlg="new"] input');
    await expect(field).toBeFocused();
    await expectMarked(field);
    await expect(host(page)).toHaveCount(0);
    // (Well past the time a focus counts as a pointer's.)
    await page.waitForTimeout(900);
    release();
    await expectUp(page);
    await type(page, 'l', 'a', 't', 'e');
    await expect(field).toHaveValue('late');
    expect(errors).toEqual([]);
  });

  test('`?kbd=0`: the multi-line fields are not marked and ours never opens', async ({ page }) => {
    await openStart(page, '&kbd=0');
    await page.evaluate(async () => {
      await window.__wc!.shell.profiles.init();
      await window.__wc!.shell.profiles.save('default', '#alias {k} {kill}\n');
    });
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="profile"]').tap();
    await f.locator('[data-btn="EDIT"]').tap();
    const pe = page.locator('.wc-frame:not([hidden]) .wc-pe');
    await pe.locator('[data-rail="alias"]').tap();
    await pe.locator('[data-btn="NEW"]').tap();
    const body = pe.locator('[data-field="body"] textarea');
    expect(await body.getAttribute('inputmode')).toBeNull();
    expect(await body.getAttribute('data-okb-kind')).toBeNull();
    await body.tap();
    await frames(page);
    await expect(page.locator('.wc-okb-page')).toHaveCount(0);
    await page.keyboard.type('a');
    await page.keyboard.press('Enter');
    await page.keyboard.type('b');
    await expect(body).toHaveValue('a\nb');
  });
});

// ------------------------------------------------------------------ landscape

test.describe('landscape 800 × 360', () => {
  test.use({ viewport: S21_LAND });

  test('Lite: the page keys stand beside the block, the keyboard is no higher, and the pattern and the body\'s caret line are hittable above it', async ({ page }) => {
    const errors = watchErrors(page);
    await openStart(page);
    const pe = await liteFromStart(page);
    const pattern = pe.locator('[data-field="pattern"] input');
    const k = await expectUp(page);
    // Four low rows, as the game's keyboard in landscape: the page keys cost no height.
    expect(k.height).toBeLessThanOrEqual(160);
    await expect(okb(page).locator('.wc-ph-okb-row')).toHaveCount(4);
    await expect(okb(page).locator('.wc-ph-okb-row.is-nav')).toHaveCount(0);
    const block = await box(okb(page).locator('.wc-ph-okb-block'));
    expect(Math.abs(block.x + block.width / 2 - 400)).toBeLessThanOrEqual(1);
    for (const a of ['esc', 'tab', 'left']) {
      const b = await box(key(page, a));
      expect(b.x + b.width).toBeLessThanOrEqual(block.x + 0.5);
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    for (const a of ['up', 'down', 'right']) {
      const b = await box(key(page, a));
      expect(b.x).toBeGreaterThanOrEqual(block.x + block.width - 0.5);
      expect(b.x + b.width).toBeLessThanOrEqual(800);
    }
    // A letter key is not narrower than in the game layout's landscape block.
    expect((await box(key(page, 'q'))).width).toBeGreaterThanOrEqual(36);
    // The pattern is in view: above the keyboard, and nothing of the page lies over it.
    await expectAbove(page, pattern);
    expect(await hittable(pattern)).toBe(true);
    expect(await hittable(pattern, 0.5, 0.9)).toBe(true);
    await type(page, 'z');
    await expect(pattern).toHaveValue('z');
    // Tab to the body, and three lines: the caret's line shows after each.
    await key(page, 'tab').tap();
    const body = pe.locator('[data-field="body"] textarea');
    await expect(body).toBeFocused();
    await expectUp(page);
    await expectCaretLineShown(page, body);
    for (const w of ['a', 'b', 'c', 'd', 'e', 'f']) {
      await type(page, w, 'enter');
      await expectCaretLineShown(page, body);
    }
    await expect(body).toHaveValue('a\nb\nc\nd\ne\nf\n');
    for (let i = 0; i < 6; i++) await key(page, 'up').tap();
    await expectCaretLineShown(page, body);
    await key(page, 'esc').tap();
    await expectDown(page);
    expect(errors).toEqual([]);
  });

  test('the export comment: the composer\'s field, Cancel and Save stand above the keyboard; Enter saves', async ({ page }) => {
    const errors = watchErrors(page);
    await pinDemoClock(page);
    await openStart(page);
    const f = await openExport(page);
    await f.locator('[data-btn="COMMENT"]').tap();
    const comp = f.locator('.wc-exp-comp');
    const area = comp.locator('textarea');
    await expect(area).toBeFocused();
    await expectUp(page);
    await type(page, 'h', 'i');
    await expectAbove(page, area);
    expect(await hittable(area)).toBe(true);
    for (const b of ['SAVE', 'CANCEL']) {
      await expectAbove(page, comp.locator(`[data-btn="${b}"]`));
      expect(await hittable(comp.locator(`[data-btn="${b}"]`))).toBe(true);
    }
    await key(page, 'enter').tap();
    await expect(comp).toHaveCount(0);
    await expectDown(page);
    await expect(f.locator('.wc-exp-counts')).toContainText('1 comment');
    expect(errors).toEqual([]);
  });
});

test.describe('landscape 640 × 360', () => {
  test.use({ viewport: { width: 640, height: 360 } });

  test('Lite\'s pattern is hittable above the keyboard, with the page keys beside the block', async ({ page }) => {
    await openStart(page);
    const pe = await liteFromStart(page);
    const pattern = pe.locator('[data-field="pattern"] input');
    await expectUp(page);
    await expectAbove(page, pattern);
    expect(await hittable(pattern)).toBe(true);
    for (const a of ['esc', 'tab', 'left', 'up', 'down', 'right']) await expect(key(page, a)).toBeVisible();
    expect((await box(key(page, 'q'))).width).toBeGreaterThanOrEqual(36);
  });
});

test.describe('a narrow phone 320 × 568', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('Lite\'s body over the game: reached with Tab, the caret\'s line shows above the keyboard', async ({ page }) => {
    const errors = watchErrors(page);
    await openGame(page);
    await page.locator('.wc-ph-menu').tap();
    await page.locator('.wc-ph-sheet [data-row="profile"]').tap();
    const pe = await openLiteNew(page, menuFrame(page));
    const body = pe.locator('[data-field="body"] textarea');
    await key(page, 'tab').tap();
    await expect(body).toBeFocused();
    await expectUp(page);
    for (const w of ['a', 'b', 'c', 'd']) {
      await type(page, w, 'enter');
      await expectCaretLineShown(page, body);
    }
    await type(page, 'up', 'up');
    await expectCaretLineShown(page, body);
    // The game's own keyboard never came up under the page.
    await expect(page.locator('.wc-cockpit .wc-ph-okb')).toBeHidden();
    expect(errors).toEqual([]);
  });
});

// ------------------------------------------------------- the game layout

test.describe('the game layout 360 × 800', () => {
  test.use({ viewport: S21 });

  test('has none of the page keys: no Esc, Tab or caret keys, the history arrows as before, Enter lit', async ({ page }) => {
    await openGame(page);
    await page.locator('.wc-input-slot .wc-input-field').tap();
    const g = page.locator('.wc-cockpit .wc-ph-okb');
    await expect(g).toBeVisible();
    for (const a of ['esc', 'tab', 'left', 'right', 'up', 'down']) await expect(g.locator(`.wc-ph-okb-k[data-act="${a}"]`)).toHaveCount(0);
    await expect(g.locator('.wc-ph-okb-side')).toHaveCount(0);
    await expect(g.locator('.wc-ph-okb-row')).toHaveCount(4);
    for (const a of ['older', 'newer']) await expect(g.locator(`.wc-ph-okb-k[data-act="${a}"]`)).toHaveCount(1);
    await expect(g.locator('.wc-ph-okb-k[data-act="enter"]')).toHaveAttribute('data-enter', 'submit');
    // The backtick is on the symbols' last page here too.
    await g.locator('.wc-ph-okb-k[data-act="sym"]').tap();
    await g.locator('.wc-ph-okb-k[data-act="alt"]').tap();
    await g.locator('.wc-ph-okb-k[data-ch="`"]').tap();
    await expect(page.locator('.wc-input-slot .wc-input-field')).toHaveValue('`');
  });
});

// ------------------------------------------------------- desktop and tablet

for (const [name, viewport, url] of [
  ['a desktop-size window with the phone flag forced', { width: 1280, height: 800 }, '/?phone=1&kbd=en'],
  ['a tablet-size window (touch, no phone flag)', { width: 820, height: 1180 }, '/?touch=1'],
] as const) {
  test.describe(name, () => {
    test.use({ viewport });

    test('gets nothing of this: Lite\'s body is not marked and types as before', async ({ page }) => {
      await page.goto(url);
      await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
      await page.evaluate(async () => {
        await window.__wc!.shell.profiles.init();
        await window.__wc!.shell.profiles.save('default', '#alias {k} {kill}\n');
      });
      const f = startFrame(page);
      await f.locator('.wc-sm-item[data-key="profile"]').tap();
      await f.locator('[data-btn="EDIT"]').tap();
      const pe = page.locator('.wc-frame:not([hidden]) .wc-pe');
      await pe.locator('[data-rail="alias"]').tap();
      await pe.locator('[data-btn="NEW"]').tap();
      const body = pe.locator('[data-field="body"] textarea');
      expect(await body.getAttribute('inputmode')).toBeNull();
      expect(await body.getAttribute('data-okb-kind')).toBeNull();
      await body.tap();
      await frames(page);
      await expect(page.locator('.wc-okb-page')).toHaveCount(0);
      await expect(html(page)).not.toHaveClass(/\bwc-okb-pg\b/);
      await page.keyboard.type('a');
      await page.keyboard.press('Enter');
      await page.keyboard.type('b');
      await expect(body).toHaveValue('a\nb');
    });
  });
}
