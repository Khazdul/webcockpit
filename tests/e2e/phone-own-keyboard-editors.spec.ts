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
    // The digit row is up for code (portrait), whatever the stored state.
    await expect(okb(page).locator('.wc-ph-okb-row.is-digits')).toBeVisible();
    expect(await page.evaluate(() => window.__wc!.settings.get().phone.keyboard.digits)).toBe(false);
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

  test('thirty lines: the caret\'s line stays above the keyboard, and the page does not slide away', async ({ page }) => {
    const errors = watchErrors(page);
    const ed = await openScript(page);
    await tapEnd(page, ed);
    await expectUp(page);
    const win = ed.locator('.wc-lk-win').first();
    const winTop = (await box(win)).y;
    for (let i = 1; i <= 30; i++) {
      await typeOn(page, `x${i % 10}`);
      await press(page, 'enter');
      if (i % 5 === 0) await expectCaretLineShown(page, ed);
    }
    await expect(sed(page).locator('.wc-sed-pos')).toContainText('Ln 34,');
    await expectCaretLineShown(page, ed);
    // Up through the text and down again, held as a finger holds the key: the line follows.
    for (let i = 0; i < 25; i++) await key(page, 'up').tap();
    await expect(sed(page).locator('.wc-sed-pos')).toContainText('Ln 9,');
    await expectCaretLineShown(page, ed);
    for (let i = 0; i < 25; i++) await key(page, 'down').tap();
    await expectCaretLineShown(page, ed);
    // Nothing but the buffer's own scroller moved: the box stands where it stood, whole above the keys.
    expect((await box(win)).y).toBe(winTop);
    await expectAbove(page, win);
    expect(await page.evaluate(() => [document.scrollingElement!.scrollTop, document.querySelector('#app')!.scrollTop])).toEqual([0, 0]);
    expect(errors).toEqual([]);
  });

  test('Find and Replace and back: our keyboard stays up all the way, and Esc in Find returns to the buffer', async ({ page }) => {
    const errors = watchErrors(page);
    const ed = await openScript(page, '&kbd=en', `${HEADER}local orc = 1\nlocal orcs = orc + orc\n`);
    const content = ed.locator('.cm-content');
    await tapEnd(page, ed);
    await expectUp(page);
    await watchUps(page);
    // The Find tool: the find row opens with the focus in its field, a field of ours.
    await tool(page, 'FIND').tap();
    const panel = ed.locator('.wc-lk-search');
    const find = panel.locator('[data-field="find"] input');
    const replace = panel.locator('[data-field="replace"] input');
    await expect(find).toBeFocused();
    await expectMarked(find);
    await expectMarked(replace);
    await expectUp(page);
    await expectAbove(page, panel);
    // Enter is the field's there (next match), not a line break.
    await expect(key(page, 'enter')).toHaveAttribute('data-enter', 'submit');
    await typeOn(page, 'orc');
    await expect(find).toHaveValue('orc');
    await expect(panel.locator('.wc-search-count')).toHaveText('1 of 4');
    await press(page, 'enter');
    await expect(panel.locator('.wc-search-count')).toHaveText('2 of 4');
    // Tab goes to Replace; Enter there replaces the match.
    await press(page, 'tab');
    await expect(replace).toBeFocused();
    await typeOn(page, 'elf');
    await press(page, 'enter');
    await expect.poll(() => text(ed)).toBe(`${HEADER}local orc = 1\nlocal elfs = orc + orc\n`);
    await expect(panel.locator('.wc-search-count')).toContainText('of 3');
    // Some code shows under the find row, above the keys.
    await expectAbove(page, ed.locator('.cm-scroller'));
    expect((await box(ed.locator('.cm-scroller'))).height).toBeGreaterThan(60);
    // Esc: the row closes, the buffer has the focus, and the keyboard never went.
    await press(page, 'esc');
    await expect(panel).toHaveCount(0);
    await expect(content).toBeFocused();
    await expectUp(page);
    await expect(key(page, 'enter')).toHaveAttribute('data-enter', 'newline');
    await typeOn(page, 'z');
    await expect.poll(() => text(ed)).toContain('z');
    // A tap in the Find field from the buffer, and the row's Close: the same.
    await tool(page, 'FIND').tap();
    await expect(find).toBeFocused();
    await content.locator('.cm-line').first().tap();
    await expect(content).toBeFocused();
    await find.tap();
    await expect(find).toBeFocused();
    await panel.locator('[data-btn="close"]').tap();
    await expect(panel).toHaveCount(0);
    await expect(content).toBeFocused();
    await expectUp(page);
    // Not one flicker: the keyboard's class on the page never changed.
    expect(await ups(page)).toEqual([]);
    // And no field met on the way was one the device's keyboard would rise for.
    expect(await page.evaluate(() => document.activeElement?.getAttribute('inputmode'))).toBe('none');
    expect(errors).toEqual([]);
  });

  test('the profile editor\'s Editor view: an alias typed on our keys, braces close once, Find and back', async ({ page }) => {
    const errors = watchErrors(page);
    const p = await openProfile(page);
    const content = p.locator('.cm-content');
    await expectMarked(content);
    await expect(content).toHaveAttribute('data-okb-kind', 'editor');
    // The view's tab gave the buffer the focus: no keyboard until a tap in the text.
    await expectDown(page);
    await tapEnd(page, p);
    await expectUp(page);
    await expect(key(page, 'enter')).toHaveAttribute('data-enter', 'newline');
    // The digit row is up for code, and the symbols stand in the code order.
    await expect(okb(page).locator('.wc-ph-okb-row.is-digits')).toBeVisible();
    await typeOn(page, '#alias {dr');
    expect((await lines(p)).at(-1)).toBe('#alias {dr}');
    // The closer typed steps over the one put in.
    await typeOn(page, '} {');
    expect((await lines(p)).at(-1)).toBe('#alias {dr} {}');
    // Backspace right after the pair deletes both (`pairDelete`).
    await press(page, 'back');
    expect((await lines(p)).at(-1)).toBe('#alias {dr} ');
    await typeOn(page, '{drink %1}');
    expect((await lines(p)).at(-1)).toBe('#alias {dr} {drink %1}');
    await press(page, 'enter');
    await typeOn(page, 'x');
    await press(page, 'left', 'back', 'up', 'right');
    await expect(p.locator('.wc-pe-pos')).toContainText('Ln 2, Col 2');
    expect(await text(p)).toBe('#alias {k} {kill %1}\n#alias {dr} {drink %1}\nx');
    // Find (the foot's button) and back with Esc: the keyboard stays.
    await watchUps(page);
    await p.locator('.wc-pe-foot [data-btn="FIND"]').tap();
    const find = p.locator('.wc-lk-search [data-field="find"] input');
    await expect(find).toBeFocused();
    await typeOn(page, 'dr');
    await expect(p.locator('.wc-lk-search .wc-search-count')).toContainText('of 2');
    await press(page, 'esc');
    await expect(p.locator('.wc-lk-search')).toHaveCount(0);
    await expect(content).toBeFocused();
    await expectUp(page);
    expect(await ups(page)).toEqual([]);
    // Save's tap keeps the keyboard; the text is stored.
    await p.locator('.wc-pe-foot [data-btn="SAVE"]').tap();
    await expect.poll(() => page.evaluate(() => window.__wc!.shell.profiles.get('default').then((r) => r?.text ?? ''))).toContain('#alias {dr} {drink %1}');
    // Tab leaves the buffer for the editor's other zones, as a physical Tab does there: the keyboard goes with the focus.
    await press(page, 'tab');
    await expectDown(page);
    expect(errors).toEqual([]);
  });

  test('a drag in the code scrolls it and opens or closes nothing; a tap opens', async ({ page }) => {
    const errors = watchErrors(page);
    const long = Array.from({ length: 80 }, (_, i) => `local v${i} = ${i}`).join('\n');
    const ed = await openScript(page, '&kbd=en', `${HEADER}${long}\n`);
    const sc = ed.locator('.cm-scroller');
    const b = await box(sc);
    const cdp = await page.context().newCDPSession(page);
    const drag = (dy: number) =>
      cdp.send('Input.synthesizeScrollGesture', { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), yDistance: dy, gestureSourceType: 'touch', speed: 1200 });
    // Keyboard down: a drag scrolls the code and brings no keyboard.
    await drag(-300);
    await expect.poll(() => sc.evaluate((el) => el.scrollTop)).toBeGreaterThan(200);
    await page.waitForTimeout(200);
    await expectDown(page);
    // A tap on a line: the keyboard, and the caret where the finger was.
    const mid = await box(sc);
    await page.touchscreen.tap(mid.x + mid.width / 2, mid.y + 100);
    await expectUp(page);
    await expect(ed.locator('.cm-content')).toBeFocused();
    await expectCaretLineShown(page, ed);
    // Keyboard up: a drag scrolls and the keyboard stays, the focus too.
    await watchUps(page);
    const before = await sc.evaluate((el) => el.scrollTop);
    const now = await box(sc);
    await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(now.x + now.width / 2), y: Math.round(now.y + now.height / 2), yDistance: -150, gestureSourceType: 'touch', speed: 1200 });
    await expect.poll(() => sc.evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 80);
    await page.waitForTimeout(200);
    await expectUp(page);
    await expect(ed.locator('.cm-content')).toBeFocused();
    expect(await ups(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a bundled script (read-only): marked, and a tap opens nothing; its Find row is ours', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/?phone=1&kbd=en');
    await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
    const name = await page.evaluate(async () => {
      const l = window.__wc!.shell.scripts!;
      await l.init();
      return l.list().find((s) => s.readonly)?.name ?? null;
    });
    test.skip(name === null, 'no bundled script in this build');
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="scripts"]').tap();
    await row(f, name!).locator('.wc-scr-name').tap();
    await f.locator('[data-btn="VIEW"]:visible, [data-btn="EDIT"]:visible').first().tap();
    const ed = sed(page);
    await expect(ed).toHaveAttribute('data-readonly', 'true');
    await morphDone(page);
    const content = ed.locator('.cm-content');
    await expectMarked(content);
    const line = await box(content.locator('.cm-line').nth(2));
    await page.touchscreen.tap(line.x + 40, line.y + line.height / 2);
    await frames(page);
    await page.waitForTimeout(150);
    await expectDown(page);
    await tool(page, 'FIND').tap();
    const find = ed.locator('.wc-lk-search [data-field="find"] input');
    await expect(find).toBeFocused();
    await expectUp(page);
    await press(page, 'esc');
    await expect(ed.locator('.wc-lk-search')).toHaveCount(0);
    await expectDown(page);
    expect(errors).toEqual([]);
  });

  test('a rotation with the keyboard up: it stays up, the buffer keeps the focus and the caret\'s line shows, both ways', async ({ page }) => {
    const errors = watchErrors(page);
    const long = Array.from({ length: 40 }, (_, i) => `local v${i} = ${i}`).join('\n');
    const ed = await openScript(page, '&kbd=en', `${HEADER}${long}\n`);
    const content = ed.locator('.cm-content');
    await tapEnd(page, ed);
    await expectUp(page);
    await page.keyboard.press('ControlOrMeta+End');
    await typeOn(page, 'x');
    for (const size of [S21_LAND, S21, S21_LAND, S21]) {
      await page.setViewportSize(size);
      await frames(page);
      await expect(content).toBeFocused();
      await expectUp(page);
      await expectCaretLineShown(page, ed);
      // The digit row is the editors' in portrait only.
      await expect(okb(page).locator('.wc-ph-okb-row.is-digits')).toHaveCount(size.width > size.height ? 0 : 1);
    }
    await typeOn(page, 'y');
    expect((await lines(ed)).at(-1)).toBe('xy');
    expect(errors).toEqual([]);
  });

  test('`?kbd=0`: the buffers are not marked and ours never opens', async ({ page }) => {
    const ed = await openScript(page, '&kbd=0');
    const content = ed.locator('.cm-content');
    expect(await content.getAttribute('inputmode')).toBeNull();
    expect(await content.getAttribute('virtualkeyboardpolicy')).toBeNull();
    expect(await content.getAttribute('data-okb-kind')).toBeNull();
    await tapEnd(page, ed);
    await frames(page);
    await expect(page.locator('.wc-okb-page')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await page.keyboard.type('x = (');
    expect((await lines(ed)).at(-1)).toBe('x = ()');
  });
});

// ------------------------------------------------------------ a narrow phone

test.describe('a narrow phone 320 × 568', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('the script editor: code above the keys, the list on screen, the find row leaves code in view', async ({ page }) => {
    const errors = watchErrors(page);
    const ed = await openScript(page);
    await tapEnd(page, ed);
    await expectUp(page);
    await expectCaretLineShown(page, ed);
    await typeOn(page, '\nse');
    const list = page.locator('.cm-tooltip-autocomplete');
    await expect(list).toBeVisible();
    await expectAbove(page, list);
    await press(page, 'tab');
    expect((await lines(ed)).at(-1)).toBe('send');
    await expectCaretLineShown(page, ed);
    await tool(page, 'FIND').tap();
    const panel = ed.locator('.wc-lk-search');
    await expect(panel.locator('[data-field="find"] input')).toBeFocused();
    await expectUp(page);
    await expectAbove(page, panel);
    for (const f of ['find', 'replace']) expect(await hittable(panel.locator(`[data-field="${f}"] input`))).toBe(true);
    for (const b of ['prev', 'next', 'close', 'replace', 'all']) expect(await hittable(panel.locator(`[data-btn="${b}"]`))).toBe(true);
    // A line of code or more still shows under it.
    expect((await box(ed.locator('.cm-scroller'))).height).toBeGreaterThanOrEqual(20);
    expect(errors).toEqual([]);
  });
});

// ------------------------------------------------------------------ landscape

for (const [name, viewport] of [
  ['landscape 800 × 360', S21_LAND],
  ['landscape 640 × 360', { width: 640, height: 360 }],
] as const) {
  test.describe(name, () => {
    test.use({ viewport });

    test('the script editor: head and status step aside, several code lines show and can be hit, the pop-ups fit', async ({ page }) => {
      const errors = watchErrors(page);
      const long = Array.from({ length: 12 }, (_, i) => `local v${i} = ${i}`).join('\n');
      const ed = await openScript(page, '&kbd=en', `${HEADER}${long}\n`);
      const hood = ed.locator('.wc-lk-box > .wc-lk-hood');
      await expect(hood).toBeVisible();
      await expect(ed.locator('.wc-sed-line')).toBeVisible();
      const sc = ed.locator('.cm-scroller');
      const b = await box(sc);
      await page.touchscreen.tap(b.x + b.width / 2, b.y + 30);
      const k = await expectUp(page);
      // No row was added for the page keys or the digits: the keyboard is as high as in the game.
      await expect(okb(page).locator('.wc-ph-okb-row.is-digits')).toHaveCount(0);
      await expect(okb(page).locator('.wc-ph-okb-side')).toHaveCount(2);
      await expect(hood).toBeHidden();
      await expect(ed.locator('.wc-lk-box > .wc-lk-back')).toBeHidden();
      await expect(ed.locator('.wc-sed-line')).toBeHidden();
      // Several lines of code above the keys, each one under nothing.
      await expectAbove(page, sc);
      const shown = await ed.locator('.cm-content .cm-line').evaluateAll(
        (ls, kTop) =>
          ls.filter((l) => {
            const r = l.getBoundingClientRect();
            if (r.top < 0 || r.bottom > kTop) return false;
            const at = document.elementFromPoint(r.left + 6, (r.top + r.bottom) / 2);
            return !!at && (at === l || l.contains(at) || !!at.closest('.cm-content'));
          }).length,
        k.y,
      );
      expect(shown).toBeGreaterThanOrEqual(6);
      await expectCaretLineShown(page, ed);
      // Typing: the list fits on screen above the keys wherever the caret's line is.
      await page.keyboard.press('ControlOrMeta+End');
      await typeOn(page, 'se');
      const list = page.locator('.cm-tooltip-autocomplete');
      await expect(list).toBeVisible();
      await expectAbove(page, list);
      await expect(page.locator('.cm-completionInfo')).toBeHidden();
      await press(page, 'esc');
      await expect(list).toHaveCount(0);
      await press(page, 'back', 'back');
      for (let i = 0; i < 6; i++) await key(page, 'up').tap();
      await typeOn(page, 'se');
      await expect(list).toBeVisible();
      await expectAbove(page, list);
      await press(page, 'tab');
      await expect(list).toHaveCount(0);
      await expectCaretLineShown(page, ed);
      // The find row: its fields and buttons above the keys and hittable, code under it; Esc returns.
      await watchUps(page);
      await tool(page, 'FIND').tap();
      const panel = ed.locator('.wc-lk-search');
      await expect(panel.locator('[data-field="find"] input')).toBeFocused();
      await expectUp(page);
      await expectAbove(page, panel);
      for (const f of ['find', 'replace']) expect(await hittable(panel.locator(`[data-field="${f}"] input`))).toBe(true);
      for (const btn of ['prev', 'next', 'close', 'replace', 'all']) expect(await hittable(panel.locator(`[data-btn="${btn}"]`))).toBe(true);
      expect((await box(sc)).height).toBeGreaterThanOrEqual(36);
      await typeOn(page, 'v1');
      await expect(panel.locator('.wc-search-count')).toContainText('of 3');
      await press(page, 'esc');
      await expect(panel).toHaveCount(0);
      await expect(ed.locator('.cm-content')).toBeFocused();
      await expectUp(page);
      expect(await ups(page)).toEqual([]);
      // The fold key: the head and the status line are back.
      await press(page, 'fold');
      await expectDown(page);
      await expect(hood).toBeVisible();
      await expect(ed.locator('.wc-sed-line')).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('the profile editor\'s Editor view: the views and the foot step aside, the code shows and types', async ({ page }) => {
      const errors = watchErrors(page);
      const long = Array.from({ length: 12 }, (_, i) => `#alias {a${i}} {b${i}}`).join('\n');
      const p = await openProfile(page, '&kbd=en', `${long}\n`);
      const sc = p.locator('.cm-scroller');
      const b = await box(sc);
      await page.touchscreen.tap(b.x + b.width / 2, b.y + Math.min(20, b.height / 2));
      const k = await expectUp(page);
      await expect(p.locator('.wc-pe-head')).toBeHidden();
      await expect(p.locator('.wc-pe-foot')).toBeHidden();
      await expectAbove(page, sc);
      expect((await box(sc)).height).toBeGreaterThanOrEqual(120);
      expect((await box(sc)).y + (await box(sc)).height).toBeLessThanOrEqual(k.y);
      await expectCaretLineShown(page, p);
      await page.keyboard.press('ControlOrMeta+End');
      await typeOn(page, '#alias {x');
      expect((await lines(p)).at(-1)).toBe('#alias {x}');
      await expectCaretLineShown(page, p);
      await press(page, 'fold');
      await expectDown(page);
      await expect(p.locator('.wc-pe-head')).toBeVisible();
      await expect(p.locator('.wc-pe-foot')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

// ------------------------------------------------------- desktop and tablet

for (const [name, viewport, url] of [
  ['a desktop-size window with the phone flag forced', { width: 1280, height: 800 }, '/?phone=1&kbd=en'],
  ['a tablet-size window (touch, no phone flag)', { width: 820, height: 1180 }, '/?touch=1'],
] as const) {
  test.describe(name, () => {
    test.use({ viewport });

    test('gets nothing of this: the buffers are not marked and type as before', async ({ page }) => {
      await page.goto(url);
      await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
      await page.evaluate(async (src) => {
        const l = window.__wc!.shell.scripts!;
        await l.init();
        await l.create('phoneed', src);
        await window.__wc!.shell.profiles.init();
        await window.__wc!.shell.profiles.save('default', '#alias {k} {kill}\n');
      }, HEADER);
      const f = startFrame(page);
      await f.locator('.wc-sm-item[data-key="scripts"]').tap();
      await row(f, 'phoneed').locator('.wc-scr-name').tap();
      await f.locator('[data-btn="EDIT"]:visible').first().tap();
      const ed = sed(page);
      await expect(ed).toHaveAttribute('data-script', 'phoneed');
      const content = ed.locator('.cm-content');
      for (const a of ['inputmode', 'virtualkeyboardpolicy', 'data-okb-kind']) expect(await content.getAttribute(a)).toBeNull();
      await content.tap();
      await frames(page);
      await expect(page.locator('.wc-okb-page')).toHaveCount(0);
      await expect(html(page)).not.toHaveClass(/\bwc-okb-pg\b/);
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.type('x = (');
      expect((await lines(ed)).at(-1)).toBe('x = ()');
      // The find row's fields are plain too.
      await page.keyboard.press('ControlOrMeta+f');
      const find = ed.locator('.wc-lk-search [data-field="find"] input');
      await expect(find).toBeFocused();
      expect(await find.getAttribute('inputmode')).toBeNull();
      await page.keyboard.press('Escape');
      await expect(content).toBeFocused();
    });
  });
}
