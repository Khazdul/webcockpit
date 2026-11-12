// Stage 53h (ADR 0139 §6): our own keyboard in the two code editors on a
// phone, the script editor (Lua) and the profile editor's Editor view.
//
// - The content element is marked, and a tap in the text brings our
//   keyboard; opening the editor does not (the code is read first).
// - Text goes through the editor's own input path: a bracket closes once,
//   the completion list opens while typing.
// - Enter, Backspace, Tab, Esc and the caret keys act as a physical key
//   does: Enter indents and closes a block, Tab indents or takes a
//   completion, Esc dismisses the list, Backspace deletes a pair.
// - The caret's line stays above the keyboard as the text grows; the
//   pop-ups stand above the keyboard and on screen.
// - Find and Replace: the focus moves between the buffer and the find row
//   with our keyboard up all the way; Esc in Find returns to the buffer.
// - Landscape: the editor's head and foot step aside, the code is hittable.
// - A rotation keeps the keyboard and the caret's line.
// - A read-only (bundled) script is marked and opens nothing.
// - `?kbd=0`, a desktop-size and a tablet-size window: nothing of this.
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
const pe = (page: Page) => page.locator('.wc-frame:not([hidden]) .wc-pe');
const tool = (page: Page, id: string) => sed(page).locator(`.wc-sed-tools [data-btn="${id}"]`);
const row = (f: Locator, name: string) => f.locator(`.wc-scr-row[data-name="${name}"]`);

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));

/** Taps the keys named (a character, or an act: `enter`, `back`, `tab`, `esc`, `left`, …). */
async function press(page: Page, ...keys: string[]): Promise<void> {
  for (const k of keys) await key(page, k).tap();
}

/**
 * Types `text` on our keys, as a user would: a capital with shift, a
 * character that is not on the page shown by going to the symbols (and on
 * through their pages), then back to the letters. `\n` is Enter.
 */
async function typeOn(page: Page, text: string): Promise<void> {
  for (const ch of text) {
    if (ch === ' ') {
      await key(page, 'space').tap();
      continue;
    }
    if (ch === '\n') {
      await key(page, 'enter').tap();
      continue;
    }
    const lower = ch.toLowerCase();
    const upper = lower !== ch;
    const k = key(page, lower);
    let moved = false;
    if ((await k.count()) === 0) {
      moved = true;
      await key(page, 'sym').tap();
      for (let i = 0; i < 3 && (await k.count()) === 0; i++) await key(page, 'alt').tap();
    }
    if (upper) await key(page, 'shift').tap();
    await k.tap();
    if (moved) await key(page, 'sym').tap();
  }
}

async function expectUp(page: Page): Promise<Box> {
  await expect(okb(page)).toBeVisible();
  await expect(html(page)).toHaveClass(/\bwc-okb-pg\b/);
  await frames(page);
  const view = page.viewportSize()!;
  await expect.poll(async () => Math.round((await box(host(page))).y + (await box(host(page))).height)).toBe(view.height);
  return box(host(page));
}

async function expectDown(page: Page): Promise<void> {
  await expect(host(page)).toBeHidden();
  await expect(html(page)).not.toHaveClass(/\bwc-okb-pg\b/);
  expect(await page.locator('#app').evaluate((el) => el.style.getPropertyValue('--wc-okb-page-h'))).toBe('');
}

async function expectMarked(f: Locator): Promise<void> {
  await expect(f).toHaveAttribute('inputmode', 'none');
  await expect(f).toHaveAttribute('virtualkeyboardpolicy', 'manual');
}

/** The lines of a buffer (a short one: every line is drawn). */
const lines = (scope: Locator): Promise<string[]> => scope.locator('.cm-content .cm-line').allTextContents();
const text = async (scope: Locator): Promise<string> => (await lines(scope)).join('\n');

/** The caret's line (CodeMirror's active line) lies whole inside the scroller and above the keyboard, under nothing. */
async function expectCaretLineShown(page: Page, scope: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const k = await box(host(page));
      return scope.evaluate((el, kTop) => {
        const line = el.querySelector('.cm-activeLine');
        const sc = el.querySelector('.cm-scroller');
        if (!line || !sc) return 'no active line';
        const r = line.getBoundingClientRect();
        const s = sc.getBoundingClientRect();
        if (r.top < s.top - 0.5 || r.bottom > s.bottom + 0.5) return `line ${r.top}..${r.bottom} outside the scroller ${s.top}..${s.bottom}`;
        if (r.bottom > kTop + 0.5 || r.top < 0) return `line ${r.top}..${r.bottom} under the keyboard at ${kTop}`;
        const at = document.elementFromPoint(r.left + r.width / 2, (r.top + r.bottom) / 2);
        return at && (at === line || line.contains(at) || at.closest('.cm-content')) ? 'shown' : `covered by ${at?.tagName}.${at?.className}`;
      }, k.y);
    })
    .toBe('shown');
}

/** `l` lies whole on screen and above the keyboard. */
async function expectAbove(page: Page, l: Locator): Promise<void> {
  await expect(l).toBeVisible();
  const view = page.viewportSize()!;
  await expect
    .poll(async () => {
      const k = await box(host(page));
      const b = await box(l);
      return b.y >= -0.5 && b.x >= -0.5 && b.x + b.width <= view.width + 0.5 && b.y + b.height <= k.y + 0.5 ? 'above' : `box ${JSON.stringify(b)}, keyboard at ${k.y}`;
    })
    .toBe('above');
}

const hittable = (l: Locator, fx = 0.5, fy = 0.5): Promise<boolean> =>
  l.evaluate(
    (el, [x, y]) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width * x!, r.top + r.height * y!);
      return !!at && (at === el || el.contains(at));
    },
    [fx, fy],
  );

/** How many times our keyboard came up and went on the page since `watchUps` (a flicker is a pair). */
const watchUps = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __ups?: number[] };
    w.__ups = [];
    new MutationObserver(() => w.__ups!.push(document.documentElement.classList.contains('wc-okb-pg') ? 1 : 0)).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });
const ups = (page: Page) =>
  page.evaluate(() => {
    const all = (window as unknown as { __ups: number[] }).__ups;
    // (Other classes change too: only the changes of ours.)
    return all.filter((v, i) => i === 0 || v !== all[i - 1]);
  });

const HEADER = '-- @name     phoneed\n-- @version  1\n-- @api      1\n';

/** Start page → Scripts → the script `phoneed` → Edit, all by taps. */
async function openScript(page: Page, query = '&kbd=en', source = HEADER): Promise<Locator> {
  await page.goto(`/?phone=1${query}`);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async (src) => {
    const l = window.__wc!.shell.scripts!;
    await l.init();
    if (!l.list().some((s) => s.name === 'phoneed')) await l.create('phoneed', src);
  }, source);
  await startFrame(page).locator('.wc-sm-item[data-key="scripts"]').tap();
  const f = startFrame(page);
  await row(f, 'phoneed').locator('.wc-scr-name').tap();
  await f.locator('[data-btn="EDIT"]:visible').first().tap();
  await expect(sed(page)).toHaveAttribute('data-script', 'phoneed');
  await morphDone(page);
  return sed(page);
}

/** Start page → Profile → Edit → the Editor view. */
async function openProfile(page: Page, query = '&kbd=en', profile = '#alias {k} {kill %1}\n'): Promise<Locator> {
  await page.goto(`/?phone=1${query}`);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async (t) => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', t);
  }, profile);
  await startFrame(page).locator('.wc-sm-item[data-key="profile"]').tap();
  await startFrame(page).locator('[data-btn="EDIT"]').tap();
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  await morphDone(page);
  await pe(page).locator('.wc-pe-views [data-opt="editor"]').tap();
  await expect(pe(page)).toHaveAttribute('data-view', 'editor');
  return pe(page);
}

/** A tap at the end of the buffer's last line: the caret goes there and the keyboard comes. */
async function tapEnd(page: Page, scope: Locator): Promise<void> {
  const last = scope.locator('.cm-content .cm-line').last();
  const b = await box(last);
  await page.touchscreen.tap(b.x + b.width - 4, b.y + b.height / 2);
  await expect(scope.locator('.cm-content')).toBeFocused();
}

// ------------------------------------------------------------------ portrait

test.describe('portrait 360 × 800', () => {
  test.use({ viewport: S21 });

  test('the script editor: a Lua function typed on our keys (brackets, Enter, Tab, Esc, backspace, the caret keys)', async ({ page }) => {
    const errors = watchErrors(page);
    const ed = await openScript(page);
    const content = ed.locator('.cm-content');
    await expectMarked(content);
    await expect(content).toHaveAttribute('data-okb-kind', 'editor');
    // Opening the editor gives its buffer the focus, and no keyboard: the code is read first.
    await expect(content).toBeFocused();
    await expectDown(page);

    await tapEnd(page, ed);
    await expectUp(page);
    // Enter's key is a line break here, and the caret keys are lit.
    await expect(key(page, 'enter')).toHaveAttribute('data-enter', 'newline');
    for (const k of ['up', 'down', 'left', 'right', 'esc', 'tab']) await expect(key(page, k)).not.toHaveAttribute('aria-disabled', 'true');

    // `function f(` : the list opens while typing, Esc dismisses it; the bracket closes once.
    await typeOn(page, '\nlocal function hi');
    await typeOn(page, '(');
    expect((await lines(ed)).at(-1)).toBe('local function hi()');
    await typeOn(page, 'who');
    // Typing the closer steps over the one that was put in.
    await typeOn(page, ')');
    expect((await lines(ed)).at(-1)).toBe('local function hi(who)');
    // Enter after a block header: the body line, indented, and the closer (`closeBlock`).
    await press(page, 'enter');
    expect((await lines(ed)).slice(-3)).toEqual(['local function hi(who)', '  ', 'end']);
    await expect(sed(page).locator('.wc-sed-pos')).toContainText('Col 3');

    // A completion: `se` lists `send`, Tab takes it.
    await typeOn(page, 'se');
    const list = page.locator('.cm-tooltip-autocomplete');
    await expect(list).toBeVisible();
    await expectAbove(page, list);
    await expect(list.locator('li[aria-selected="true"]')).toContainText('send');
    await press(page, 'tab');
    await expect(list).toHaveCount(0);
    expect((await lines(ed)).at(-2)).toBe('  send');
    // A quote pair, and backspace right after it deletes both.
    await typeOn(page, '("');
    expect((await lines(ed)).at(-2)).toBe('  send("")');
    await press(page, 'back');
    expect((await lines(ed)).at(-2)).toBe('  send()');
    await typeOn(page, '"hi "');
    // The caret keys: left twice and a character lands inside the string.
    expect((await lines(ed)).at(-2)).toBe('  send("hi ")');
    await press(page, 'left', 'left');
    await typeOn(page, '!');
    expect((await lines(ed)).at(-2)).toBe('  send("hi! ")');
    await press(page, 'right', 'right');
    await typeOn(page, ' .. who');
    // Down to the closer's line, Enter after it, Tab indents, Shift and Tab takes it back.
    await press(page, 'down');
    await expect(sed(page).locator('.wc-sed-pos')).toContainText(`Ln ${(await lines(ed)).length},`);
    await press(page, 'enter', 'tab');
    expect((await lines(ed)).at(-1)).toBe('  ');
    await press(page, 'shift', 'tab');
    expect((await lines(ed)).at(-1)).toBe('');
    // Esc dismisses the list that typing a name opened, and nothing else: the editor stays.
    await typeOn(page, 'ma');
    await expect(list).toBeVisible();
    await expectAbove(page, list);
    await press(page, 'esc');
    await expect(list).toHaveCount(0);
    await expect(sed(page)).toBeVisible();
    await expectUp(page);
    await press(page, 'back', 'back');
    expect((await lines(ed)).at(-1)).toBe('');
    await press(page, 'up', 'up');
    await expect(sed(page).locator('.wc-sed-pos')).toContainText(`Ln ${(await lines(ed)).length - 2},`);

    expect(await text(ed)).toBe(`${HEADER}\nlocal function hi(who)\n  send("hi! " .. who)\nend\n`);
    // Save's tap keeps the keyboard and the focus.
    await tool(page, 'SAVE').tap();
    await expect.poll(() => page.evaluate(() => window.__wc!.shell.scripts!.get('phoneed')!.source)).toContain('send("hi! " .. who)');
    await expect(content).toBeFocused();
    await expectUp(page);
    // The fold key puts it away; a tap in the text brings it back.
    await press(page, 'fold');
    await expectDown(page);
    await tapEnd(page, ed);
    await expectUp(page);
    expect(errors).toEqual([]);
  });
});
