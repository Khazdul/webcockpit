// The profile editor remembers its place (stage 57, ADR 0143): the chosen
// kind, the marked row and the list's scroll offset come back on the next
// open, in the Profile window and on the start page (a phone:
// phone-profile-editor.spec.ts); an entry that is gone falls back quietly;
// a reload forgets. The Editor view comes back with its scroll and cursor,
// Help and the script manual where they were scrolled to, the script editor
// at each script's scroll and cursor. Against a mocked MUME WebSocket.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { morphDone } from './look';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const icon = (page: Page, id: string) => page.locator(`.wc-mb[data-mb="${id}"]`);
const win = (page: Page) => page.locator('.wc-win[data-win="profile"]');
const pe = (page: Page) => page.locator('.wc-frame:not([hidden]) .wc-pe');
const list = (page: Page) => pe(page).locator('.wc-pe-list');
const curRow = (page: Page) => list(page).locator('.wc-pe-row.is-on');
const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const hood = (page: Page) => startFrame(page).locator('.wc-lk-box > .wc-lk-hood .wc-lk-hood-t');
const stored = (page: Page) => page.evaluate(() => window.__wc!.shell.profiles.get('default').then((r) => r?.text ?? null));
const save = (page: Page, text: string) =>
  page.evaluate(async (t) => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', t);
  }, text);
const scrollTop = (page: Page) => list(page).evaluate((el) => el.scrollTop);

/** 52 macros (more than a window shows) between a few entries of the other kinds. */
const MACROS =
  '#alias {k} {kill}\n#action {You are hungry.} {eat bread}\n' +
  [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c, i) => `#macro {Alt+${c}} {say alt ${i}}\n#macro {Ctrl+Alt+${c}} {say both ${i}}\n`).join('') +
  '#highlight {orc} {red}\n';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** The row is wholly inside the list's own view. */
async function expectInList(page: Page, row: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const l = (await list(page).boundingBox())!;
      const r = (await row.boundingBox())!;
      return r.y >= l.y - 1 && r.y + r.height <= l.y + l.height + 1;
    })
    .toBe(true);
}

async function enterMume(page: Page, profile: string): Promise<void> {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await save(page, profile);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
}

async function openWindow(page: Page): Promise<void> {
  await icon(page, 'profile').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  await expect(win(page)).toHaveAttribute('data-focused', '');
}

/** Start page → Profile (its list is up or comes up) → Edit. */
async function editFromStart(page: Page): Promise<void> {
  if ((await hood(page).count()) === 0 || (await hood(page).textContent()) !== 'Profiles') {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
  }
  await expect(hood(page)).toHaveText('Profiles');
  await startFrame(page).locator('[data-btn="EDIT"]').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  await morphDone(page);
}

test('the Profile window: closed and opened again, the kind, the marked row and the scroll are back', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page, MACROS);
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'action');
  await page.keyboard.press('m');
  await expect(pe(page)).toHaveAttribute('data-kind', 'macro');
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown');
  await expect(curRow(page)).toHaveAttribute('data-i', '30');
  const body = (await curRow(page).locator('.wc-pe-bod').textContent())!;
  const key = (await curRow(page).locator('.wc-pe-kc').textContent())!;
  expect(await scrollTop(page)).toBeGreaterThan(0);

  // Edit its commands, leave the field (applies), close with Esc.
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  const field = pe(page).locator('[data-field="body"] textarea');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(body);
  await page.keyboard.press('End');
  await page.keyboard.type(' now');
  await page.keyboard.press('Escape');
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');
  await expect.poll(() => stored(page)).toContain(`{${body} now}`);
  const top = await scrollTop(page);
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);

  // Open again: Lite, the keyboard in the list, Macros, the same row marked and in view.
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'macro');
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');
  await expect(curRow(page)).toHaveAttribute('data-i', '30');
  await expect(curRow(page).locator('.wc-pe-kc')).toHaveText(key);
  await expect(curRow(page).locator('.wc-pe-bod')).toHaveText(`${body} now`);
  await expectInList(page, curRow(page));
  // The offset is back (a fractional offset may round by a pixel).
  expect(Math.abs((await scrollTop(page)) - top)).toBeLessThanOrEqual(1);
  // Wide: the detail beside the list shows that entry.
  if ((await pe(page).getAttribute('data-layout')) !== 'narrow') await expect(field).toHaveValue(`${body} now`);

  // Another kind and row, left by X from Help: the last Lite place stands.
  await page.keyboard.press('i');
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  await page.keyboard.press('h');
  await expect(pe(page)).toHaveAttribute('data-view', 'help');
  await win(page).locator('.wc-win-x').click();
  await expect(win(page)).toHaveCount(0);
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  // Macros kept its own row meanwhile.
  await page.keyboard.press('m');
  await expect(curRow(page).locator('.wc-pe-kc')).toHaveText(key);

  // Left from Editor with unapplied text, discarded: the next open is Editor
  // (nothing unapplied), and back in Lite the kind before Editor stands.
  await page.keyboard.press('e');
  await expect(pe(page).locator('.cm-content')).toBeFocused();
  await page.keyboard.type('#alias {zz} {zz}\n');
  await win(page).locator('.wc-win-x').click();
  await win(page).locator('.wc-lk-dialog[data-dlg="apply"] [data-btn="NO"]').click();
  await expect(win(page)).toHaveCount(0);
  await icon(page, 'profile').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'editor');
  await expect(pe(page)).toHaveAttribute('data-unapplied', 'false');
  expect(await stored(page)).not.toContain('{zz}');
  await pe(page).locator('.wc-pe-views [data-opt="lite"]').click();
  await expect(pe(page)).toHaveAttribute('data-kind', 'macro');
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a new entry is found again where the next open sorts it; the New row is not remembered', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page, '#alias {b} {2}\n#alias {d} {4}\n#alias {c} {3}\n');
  await openWindow(page);
  await page.keyboard.press('i');
  await page.keyboard.press('n');
  await page.keyboard.type('a');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1');
  await page.keyboard.press('Escape');
  // Pinned last while this visit lasts.
  await expect(curRow(page)).toHaveAttribute('data-i', '3');
  await expect.poll(() => stored(page)).toContain('#alias {a} {1}');
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  await expect(curRow(page)).toHaveAttribute('data-i', '0');
  await expect(curRow(page).locator('.wc-pe-pat')).toHaveText('a');

  // The New row: the next open marks the first row, as an open always did.
  await page.keyboard.press('End');
  await expect(curRow(page)).toHaveAttribute('data-row', 'new');
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  await expect(curRow(page)).toHaveAttribute('data-i', '0');
  expect(errors).toEqual([]);
});

test('a profile changed between the opens falls back quietly: the pattern, the row, an empty kind', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page, '#alias {a} {1}\n#alias {b} {2}\n#alias {c} {3}\n#alias {d} {4}\n');
  await openWindow(page);
  await page.keyboard.press('i');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(curRow(page).locator('.wc-pe-pat')).toHaveText('c');
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);

  // Moved in the text: found by its pattern.
  await save(page, '#alias {c} {3}\n#alias {x} {0}\n#alias {a} {1}\n');
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  await expect(curRow(page).locator('.wc-pe-pat')).toHaveText('c');
  await expect(curRow(page)).toHaveAttribute('data-i', '1');
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);

  // Gone: the row it was on, clamped to the list.
  await save(page, '#alias {a} {1}\n');
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  await expect(list(page).locator('.wc-pe-row.is-on')).toHaveCount(1);
  await expect(curRow(page).locator('.wc-pe-pat')).toHaveText('a');
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);

  // The kind is empty: still the kind, nothing marked but the New row.
  await save(page, '#action {x} {y}\n');
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  await expect(list(page).locator('.wc-pe-row')).toHaveCount(1);
  await expect(curRow(page)).toHaveAttribute('data-row', 'new');
  expect(errors).toEqual([]);
});

test('the start page: Edit comes back to the kind and the row; a reload forgets', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1100, height: 600 });
  await page.routeWebSocket('wss://mume.org/ws-play/', () => {});
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await save(page, MACROS);
  await editFromStart(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'action');
  await page.keyboard.press('m');
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowDown');
  const key = (await curRow(page).locator('.wc-pe-kc').textContent())!;
  const top = await scrollTop(page);
  expect(top).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(hood(page)).toHaveText('Profiles');

  await editFromStart(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'macro');
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');
  await expect(curRow(page)).toHaveAttribute('data-i', '40');
  await expect(curRow(page).locator('.wc-pe-kc')).toHaveText(key);
  await expectInList(page, curRow(page));
  expect(Math.abs((await scrollTop(page)) - top)).toBeLessThanOrEqual(1);

  await page.reload();
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await editFromStart(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'action');
  await expect(curRow(page)).toHaveAttribute('data-i', '0');
  expect(errors).toEqual([]);
});

/** A profile long enough to scroll in Editor: 300 aliases. */
const LONG = Array.from({ length: 300 }, (_, i) => `#alias {a${String(i).padStart(3, '0')}} {say ${i}}`).join('\n') + '\n';
const scroller = (page: Page) => pe(page).locator('.cm-scroller');
const lnCol = (page: Page) => pe(page).locator('.wc-pe-pos');
/** The number of the first line whose top is at or under the scroller's top, and its distance from it. */
const topLine = (page: Page) =>
  scroller(page).evaluate((el) => {
    const top = el.getBoundingClientRect().top;
    for (const g of el.querySelectorAll<HTMLElement>('.cm-lineNumbers .cm-gutterElement')) {
      const r = g.getBoundingClientRect();
      if (r.height > 0 && r.bottom > top + 1 && g.textContent) return { line: Number(g.textContent), past: Math.round(top - r.top) };
    }
    return { line: -1, past: 0 };
  });

test('Editor: the next open is Editor, at the same scroll and cursor; a flip inside one open too', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page, LONG);
  await openWindow(page);
  await page.keyboard.press('e');
  await expect(pe(page)).toHaveAttribute('data-view', 'editor');
  await expect(pe(page).locator('.cm-content')).toBeFocused();
  await scroller(page).evaluate((el) => (el.scrollTop = 3210));
  await expect.poll(async () => (await topLine(page)).line).toBeGreaterThan(100);
  // The cursor on a line in view, a few columns in.
  const at = await topLine(page);
  await pe(page)
    .locator('.cm-line', {
      hasText: `{a${String(at.line + 4).padStart(3, '0')}}`,
    })
    .click();
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(lnCol(page)).toHaveText(/^Ln 1\d\d, Col 6$/);
  const pos = (await lnCol(page).textContent())!;
  const left = await topLine(page);
  expect(left.line).toBe(at.line);

  // Esc: the buffer, the views, out. Nothing was changed, so nothing is asked.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);
  expect(await stored(page)).toBe(LONG);

  await icon(page, 'profile').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'editor');
  await expect(pe(page)).toHaveAttribute('data-zone', 'buffer');
  await expect(pe(page).locator('.cm-content')).toBeFocused();
  await expect(pe(page)).toHaveAttribute('data-unapplied', 'false');
  await expect(pe(page).locator('.wc-pe-mod')).toHaveCount(0);
  await expect(lnCol(page)).toHaveText(pos);
  await expect.poll(async () => (await topLine(page)).line).toBe(left.line);
  expect(Math.abs((await topLine(page)).past - left.past)).toBeLessThanOrEqual(2);

  // Lite and back to Editor in the same open: a new buffer, the same place.
  await pe(page).locator('.wc-pe-views [data-opt="lite"]').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  await pe(page).locator('.wc-pe-views [data-opt="editor"]').click();
  await expect(pe(page).locator('.cm-content')).toBeVisible();
  await expect(lnCol(page)).toHaveText(pos);
  await expect.poll(async () => (await topLine(page)).line).toBe(left.line);

  // The text got shorter meanwhile: the place is clamped to it, quietly.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);
  await save(page, '#alias {a} {b}\n');
  await icon(page, 'profile').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'editor');
  await expect(pe(page).locator('.cm-line').first()).toHaveText('#alias {a} {b}');
  await expect(lnCol(page)).toHaveText('Ln 2, Col 1');
  await expect(pe(page)).toHaveAttribute('data-unapplied', 'false');
  // Left in Lite, the next open is Lite.
  await pe(page).locator('.wc-pe-views [data-opt="lite"]').click();
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);
  await openWindow(page);
  expect(errors).toEqual([]);
});

/** The section at the top of a manual's text and the px scrolled past its top. */
const manualAt = (text: Locator) =>
  text.evaluate((el) => {
    const top = el.getBoundingClientRect().top;
    const s = [...el.querySelectorAll('section[data-i]')].find((c) => c.getBoundingClientRect().bottom > top + 1);
    return s
      ? {
          section: s.getAttribute('aria-label') ?? '',
          past: Math.round(top - s.getBoundingClientRect().top),
        }
      : { section: '', past: 0 };
  });

/** Scrolls a manual's text far down, by hand (the wheel ends a jump's settling), and waits until it rests. */
async function scrollManual(page: Page, text: Locator, to: number): Promise<{ section: string; past: number }> {
  await text.hover();
  await page.mouse.wheel(0, 10);
  await text.evaluate((el, y) => (el.scrollTop = y), to);
  let last = '';
  await expect
    .poll(async () => {
      const now = JSON.stringify(await manualAt(text));
      const rest = now === last;
      last = now;
      return rest;
    })
    .toBe(true);
  // The place is read on the frame after the scroll.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return manualAt(text);
}

async function expectManualAt(text: Locator, want: { section: string; past: number }): Promise<void> {
  await expect.poll(async () => (await manualAt(text)).section).toBe(want.section);
  await expect.poll(async () => Math.abs((await manualAt(text)).past - want.past)).toBeLessThanOrEqual(2);
}

test('Help: the manual comes back where it was scrolled to, after a close and inside one open', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page, '#alias {a} {b}\n');
  await openWindow(page);
  await page.keyboard.press('h');
  await expect(pe(page)).toHaveAttribute('data-view', 'help');
  const text = pe(page).locator('.wc-lk-mtext');
  const left = await scrollManual(page, text, 7000);
  expect(left.section).not.toBe('');
  expect(left.past).toBeGreaterThan(0);
  await win(page).locator('.wc-win-x').click();
  await expect(win(page)).toHaveCount(0);

  // The next open is Lite (Help is not opened by itself); H shows the manual where it was.
  await openWindow(page);
  await page.keyboard.press('h');
  await expect(pe(page)).toHaveAttribute('data-view', 'help');
  await expectManualAt(text, left);

  // Lite and Help again in the same open.
  await page.keyboard.press('l');
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  await page.keyboard.press('h');
  await expectManualAt(text, left);
  expect(errors).toEqual([]);
});

test('the script manual comes back where it was scrolled to; a reload forgets', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const manual = page.locator('.wc-frame:not([hidden]) .wc-sman');
  const text = manual.locator('.wc-lk-mtext');
  const toScripts = async (): Promise<void> => {
    await page.goto('/');
    await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
    await page.evaluate(() => window.__wc!.shell.scripts!.init());
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Scripts');
    await page.keyboard.press('Enter');
  };
  const openManual = async (): Promise<void> => {
    await startFrame(page).locator('[data-btn="MANUAL"]').click();
    await expect(manual).toBeVisible();
    await morphDone(page);
  };
  await toScripts();
  await openManual();
  await expect(manual.locator('.wc-lk-mtoc li.is-on')).toHaveText('Getting started');
  const left = await scrollManual(page, text, 9000);
  expect(left.past).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(manual).toHaveCount(0);

  await openManual();
  await expectManualAt(text, left);
  await page.keyboard.press('Escape');
  await expect(manual).toHaveCount(0);

  await toScripts();
  await openManual();
  await expect(manual.locator('.wc-lk-mtoc li.is-on')).toHaveText('Getting started');
  expect(await text.evaluate((el) => el.scrollTop)).toBe(0);
  expect(errors).toEqual([]);
});

/** A script long enough to scroll: a header and 400 lines. */
const script = (name: string): string =>
  `-- @name     ${name}\n-- @api      1\n\n` + Array.from({ length: 400 }, (_, i) => `local ${name}_${String(i).padStart(3, '0')} = ${i}`).join('\n') + '\n';

test('the script editor comes back at its scroll and cursor, each script at its own', async ({ page }) => {
  const errors = watchErrors(page);
  const sed = page.locator('.wc-frame:not([hidden]) > .wc-sed');
  const sc = sed.locator('.cm-scroller');
  const pos = sed.locator('.wc-sed-pos');
  const top = () =>
    sc.evaluate((el) => {
      const t = el.getBoundingClientRect().top;
      for (const g of el.querySelectorAll<HTMLElement>('.cm-lineNumbers .cm-gutterElement')) {
        const r = g.getBoundingClientRect();
        if (r.height > 0 && r.bottom > t + 1 && g.textContent) return { line: Number(g.textContent), past: Math.round(t - r.top) };
      }
      return { line: -1, past: 0 };
    });
  await page.routeWebSocket('wss://mume.org/ws-play/', () => {});
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(
    async ([a, b]) => {
      const lib = window.__wc!.shell.scripts!;
      await lib.init();
      await lib.create('alpha', a!);
      await lib.create('beta', b!);
    },
    [script('alpha'), script('beta')],
  );
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Scripts');
  await page.keyboard.press('Enter');
  const f = startFrame(page);
  const open = async (name: string): Promise<void> => {
    await f.locator(`.wc-scr-row[data-name="${name}"] .wc-scr-name`).click();
    await f.locator('.wc-scr-panel [data-btn="EDIT"]').click();
    await expect(sed).toHaveAttribute('data-script', name);
    await morphDone(page);
    await expect(sed.locator('.cm-content')).toBeFocused();
  };
  /** Scrolls to `y`, puts the cursor `cols` into a line in view; returns what is at the top and the position's text. */
  const leaveAt = async (name: string, y: number, cols: number) => {
    await sc.evaluate((el, to) => (el.scrollTop = to), y);
    await expect.poll(async () => (await top()).line).toBeGreaterThan(20);
    const at = await top();
    await sed.locator('.cm-line', { hasText: `${name}_${String(at.line + 3).padStart(3, '0')} ` }).click();
    await page.keyboard.press('Home');
    for (let i = 0; i < cols; i++) await page.keyboard.press('ArrowRight');
    await expect(pos).toContainText(`Col ${cols + 1}`);
    const left = { top: await top(), pos: (await pos.textContent())! };
    await page.keyboard.press('Escape');
    await expect(sed).toHaveCount(0);
    return left;
  };

  await open('alpha');
  await expect(pos).toContainText('Ln 1, Col 1');
  const a = await leaveAt('alpha', 2400, 4);
  await open('beta');
  // Another script: its own place, the top the first time.
  await expect(pos).toContainText('Ln 1, Col 1');
  expect(await sc.evaluate((el) => el.scrollTop)).toBe(0);
  const b = await leaveAt('beta', 5100, 7);
  expect(b.top.line).not.toBe(a.top.line);

  for (const [name, left] of [
    ['alpha', a],
    ['beta', b],
  ] as const) {
    await open(name);
    await expect(pos).toHaveText(left.pos);
    await expect.poll(async () => (await top()).line).toBe(left.top.line);
    expect(Math.abs((await top()).past - left.top.past)).toBeLessThanOrEqual(2);
    // Nothing was changed by the open.
    await page.keyboard.press('Escape');
    await expect(sed).toHaveCount(0);
  }

  // The script got shorter meanwhile: the place is clamped to it.
  await page.evaluate(() => window.__wc!.shell.scripts!.save('alpha', '-- @name     alpha\n-- @api      1\n\nlocal x = 1\n'));
  await open('alpha');
  await expect(pos).toContainText('Ln 5, Col 1');
  expect(errors).toEqual([]);
});
