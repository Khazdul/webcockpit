// Stage 10 feedback round 4: the script editor as a code editor. No
// buttons (Ctrl+S, F1), Tab indents and accepts completions, Enter closes
// blocks, live errors are held back while typing valid code, and known
// names are corrected to their case. Nothing reaches the real server.
import { type Locator, type Page, expect, test } from '@playwright/test';

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

const SOURCE = `-- @name     coder
-- @summary  Code editor test
-- @api      1

function a()
  echo("1")
  echo("2")
end
`;

const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const editor = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-sed');
const manual = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-sman');
const row = (f: Locator, name: string) => f.locator(`.wc-scr-row[data-script="${name}"]`);
const list = (page: Page) => page.locator('.cm-tooltip-autocomplete');
const marker = (page: Page) => editor(page).locator('.cm-gutter-lint .cm-lint-marker-error');
const lib = <T,>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(
    ([fn, args]) => {
      const l = window.__wc!.shell.scripts as unknown as Record<string, (...a: unknown[]) => unknown>;
      return Promise.resolve(l[fn as string]!(...(args as unknown[]))) as Promise<unknown>;
    },
    [fn, args] as const,
  ) as Promise<T>;

const bufferText = (page: Page) =>
  editor(page)
    .locator('.cm-content')
    .evaluate((el) => [...el.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'));

/** Start page → Scripts → EDIT on a user script holding SOURCE; the cursor on the empty last line. */
async function openEditor(page: Page): Promise<Locator> {
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await lib(page, 'init');
  await lib(page, 'create', 'coder', SOURCE);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const f = startFrame(page);
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  await row(f, 'coder').locator('[data-btn="EDIT"]').click();
  await expect(editor(page)).toHaveAttribute('data-script', 'coder');
  await expect(editor(page).locator('.cm-content')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+End');
  return f;
}

/**
 * Types `text` one key at a time (`\n` is Enter) and samples the error
 * marks every 50 ms while typing and for `quietMs` after: the count seen.
 */
async function typeWatching(page: Page, text: string, quietMs: number): Promise<number> {
  await page.evaluate(() => {
    const w = window as unknown as { seen: number; stopWatch: () => void };
    w.seen = 0;
    const t = setInterval(() => {
      const n = document.querySelectorAll('.wc-sed .cm-lint-marker-error, .wc-sed .wc-diag-line, .wc-sed .wc-sed-problem').length;
      w.seen = Math.max(w.seen, n);
    }, 50);
    w.stopWatch = () => clearInterval(t);
  });
  for (const ch of text) {
    if (ch === '\n') await page.keyboard.press('Enter');
    else await page.keyboard.type(ch);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(quietMs);
  return page.evaluate(() => {
    const w = window as unknown as { seen: number; stopWatch: () => void };
    w.stopWatch();
    return w.seen;
  });
}

test('no buttons: Ctrl+S saves, F1 opens the manual', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await expect(editor(page).locator('[data-btn="SAVE"]')).toHaveCount(0);
  await expect(editor(page).locator('[data-btn="MANUAL"]')).toHaveCount(0);
  await expect(editor(page).locator('.wc-ped-footer')).toContainText('Ctrl+S Save');
  await expect(editor(page).locator('.wc-ped-footer')).toContainText('F1 Manual');
  await page.keyboard.type('x = 1');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(editor(page).locator('.wc-ped-footer')).toContainText('Saved.');
  await expect.poll(() => lib<{ source: string }>(page, 'get', 'coder').then((s) => s.source)).toContain('x = 1');
  await page.keyboard.press('F1');
  await expect(manual(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('Tab indents and dedents, indents a selection, and accepts a completion', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await page.keyboard.press('Tab');
  await page.keyboard.type('x');
  expect(await bufferText(page)).toMatch(/\n {2}x$/);
  await page.keyboard.press('Shift+Tab');
  expect(await bufferText(page)).toMatch(/\nx$/);
  await expect(editor(page)).toHaveAttribute('data-zone', 'buffer');
  // A selection: its lines one level deeper.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Tab');
  expect(await bufferText(page)).toContain('\n    echo("1")\n    echo("2")\nend');
  await page.keyboard.press('Shift+Tab');
  expect(await bufferText(page)).toContain('\n  echo("1")\n  echo("2")\nend');
  // Completion: Tab accepts.
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('tempTi');
  await expect(list(page).locator('li[aria-selected]')).toContainText('tempTimer');
  await page.waitForTimeout(150);
  await page.keyboard.press('Tab');
  await expect(list(page)).toHaveCount(0);
  expect(await bufferText(page)).toMatch(/\ntempTimer$/);
  expect(errors).toEqual([]);
});

test('Enter after function test() gives a body line and end; no error flashes on the way', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  const seen = await typeWatching(page, 'function test()\necho("hi")', 1000);
  expect(await bufferText(page)).toMatch(/\nfunction test\(\)\n {2}echo\("hi"\)\nend$/);
  expect(seen).toBe(0);
  // Above other code too, and a function argument closes its call.
  await page.keyboard.press('ControlOrMeta+Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  const seen2 = await typeWatching(page, 'tempTrigger("x", function()\nsend("y")\n', 1000);
  expect(await bufferText(page)).toContain('\ntempTrigger("x", function()\n  send("y")\n  \nend)\nfunction a()');
  expect(seen2).toBe(0);
  // Enter in a block that is closed already: a plain new line.
  await editor(page).locator('.cm-line', { hasText: 'function a()' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  expect(await bufferText(page)).toContain('function a()\n  \n  echo("1")\n  echo("2")\nend\n');
  await expect(marker(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an error on another line shows quickly; one being typed shows after a pause', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  // A stray `end` after echo("1"): the function's own `end`, two lines below, is the error.
  await editor(page).locator('.cm-line', { hasText: 'echo("1")' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  const t0 = Date.now();
  await page.keyboard.type('end');
  await expect(marker(page)).toHaveCount(1, { timeout: 1200 });
  expect(Date.now() - t0).toBeLessThan(1400);
  await expect(editor(page).locator('.wc-sed-problem')).toContainText("Ln 9: Syntax error: <eof> expected near 'end'");
  // Fixed: gone at once.
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(marker(page)).toHaveCount(0);

  // An unfinished line: held while typing, shown after the pause.
  await page.keyboard.type('if x');
  await page.waitForTimeout(700);
  await expect(marker(page)).toHaveCount(0);
  await expect(marker(page)).toHaveCount(1, { timeout: 3000 });
  await expect(editor(page).locator('.wc-sed-problem')).toContainText("'then' expected");
  expect(errors).toEqual([]);
});

test('a name in the wrong case is corrected; Ctrl+Z or typing it back keeps the user\'s spelling', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await page.keyboard.type('temptrigger(');
  await expect.poll(() => bufferText(page)).toMatch(/\ntempTrigger\(\)$/);
  // One Ctrl+Z undoes the correction only.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => bufferText(page)).toMatch(/\ntemptrigger\(\)$/);
  // That spelling is never corrected again in this editor.
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('temptrigger(');
  await page.waitForTimeout(100);
  expect(await bufferText(page)).toMatch(/\ntemptrigger\(\)\ntemptrigger\(\)$/);
  // Others still are: a library name, and a correction typed back over.
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('String.format(');
  await expect.poll(() => bufferText(page)).toMatch(/\nstring\.format\(\)$/);
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Send ');
  await expect.poll(() => bufferText(page)).toMatch(/\nsend $/);
  await page.keyboard.press('Backspace');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('Send ');
  await page.waitForTimeout(100);
  expect(await bufferText(page)).toMatch(/\nSend $/);
  // Not in strings, not a name the script defines.
  await page.keyboard.press('Enter');
  await page.keyboard.type('local Echo = 1\nEcho(');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('x = "temptimer(');
  await page.waitForTimeout(100);
  const text = await bufferText(page);
  expect(text).toContain('Echo(');
  expect(text).toContain('"temptimer(');
  expect(errors).toEqual([]);
});

// Round 5: a dot or colon opens the members at once; the list is ten rows
// high and scrolls; no F1 hint in the pop-ups.

test('math. lists every member at once, ten rows high, scrolled by wheel and keys', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await page.keyboard.type('x = math.');
  const ul = list(page).locator('ul');
  await expect(ul.locator('li')).toHaveCount(27);
  await expect(list(page).locator('li[aria-selected]')).toContainText('math.abs');
  // Height-limited: about ten rows, the rest below the fold.
  const m = await ul.evaluate((el) => {
    const li = el.querySelector('li')!;
    return { client: el.clientHeight, scroll: el.scrollHeight, row: li.getBoundingClientRect().height };
  });
  expect(m.client).toBeLessThanOrEqual(m.row * 10 + 4);
  expect(m.client).toBeGreaterThanOrEqual(m.row * 8);
  expect(m.scroll).toBeGreaterThan(m.client + m.row * 10);
  // The info panel beside it: no F1 hint, inside the window.
  const info = page.locator('.cm-completionInfo');
  await expect(info).toContainText('math.abs');
  await expect(info).not.toContainText('F1');
  const vp = page.viewportSize()!;
  const ib = (await info.boundingBox())!;
  expect(ib.x).toBeGreaterThanOrEqual(0);
  expect(ib.y).toBeGreaterThanOrEqual(0);
  expect(ib.x + ib.width).toBeLessThanOrEqual(vp.width);
  expect(ib.y + ib.height).toBeLessThanOrEqual(vp.height);
  // The wheel scrolls the list in pixels, down to the last member.
  const lb = (await ul.boundingBox())!;
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
  // (Firefox scrolls at most a few rows per wheel event: wheel until the end.)
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, 400);
      return ul.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
    })
    .toBe(true);
  const inView = (name: string) =>
    ul.evaluate((el, name) => {
      const li = [...el.querySelectorAll('li')].find((l) => l.textContent?.startsWith(name))!;
      const a = li.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
    }, name);
  expect(await inView('math.ult')).toBe(true);
  // Keys: PgDn moves the selection to the last member and keeps it in view.
  for (let i = 0; i < 4; i++) await page.keyboard.press('PageDown');
  await expect(list(page).locator('li[aria-selected]')).toContainText('math.ult');
  await expect.poll(() => inView('math.ult')).toBe(true);
  await page.keyboard.press('PageUp');
  await page.keyboard.press('PageUp');
  await page.keyboard.press('PageUp');
  await page.keyboard.press('PageUp');
  await expect(list(page).locator('li[aria-selected]')).toContainText('math.abs');
  await expect.poll(() => inView('math.abs')).toBe(true);
  // Typing filters as before; Tab accepts.
  await page.keyboard.type('fl');
  await expect(ul.locator('li')).toHaveCount(1);
  await page.keyboard.press('Tab');
  expect(await bufferText(page)).toMatch(/\nx = math\.floor$/);
  // The signature help has no F1 hint either.
  await page.keyboard.type('(');
  await expect(page.locator('.wc-lua-sig')).toBeVisible();
  await expect(page.locator('.wc-lua-sig')).not.toContainText('F1');
  expect(errors).toEqual([]);
});

test('a colon opens the string methods; gmcp. and state. list their levels', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await page.keyboard.type('s = line:');
  await expect(list(page).locator('li', { hasText: /^upper/ })).toHaveCount(1);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('v = gmcp.');
  await expect(list(page).locator('li')).toHaveText([/^gmcp\.Char/, /^gmcp\.Comm/, /^gmcp\.Event/, /^gmcp\.Group/, /^gmcp\.Room/]);
  await page.keyboard.type('Char.');
  await expect(list(page).locator('li')).toHaveText([/^gmcp\.Char\.Name/, /^gmcp\.Char\.StatusVars/, /^gmcp\.Char\.Vitals/]);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('g = state.');
  await expect(list(page).locator('li')).toHaveText([/^state\.char/, /^state\.group/, /^state\.room/]);
  expect(errors).toEqual([]);
});

test('no list after a dot in a number, in a string, or after ..', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  for (const text of ['x = 1.', 'send("a.', 'y = x..', '-- see math.']) {
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(text);
    await page.waitForTimeout(300);
    await expect(list(page), text).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
