// Stage 10 feedback round 3: help for plain Lua in the script editor.
// Completion of library members with descriptions, signature help with
// the current parameter, keyword snippets with tab stops, hover on Lua
// names, and the Lua basics and Lua reference in the MANUAL. Nothing
// reaches the real server.
import { type Locator, type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

/** Screenshots for the owner and for review (WC_SHOTS overrides the folder). */
const SHOTS = process.env.WC_SHOTS ?? '';

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

const SOURCE = `-- @name     luahelp
-- @summary  Lua help test
-- @api      1

local mobs = { "orc", "troll" }
for i, mob in ipairs(mobs) do
  echo(i .. ". " .. mob)
end
`;

const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const editor = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-sed');
const manual = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-sman');
const row = (f: Locator, name: string) => f.locator(`.wc-scr-row[data-script="${name}"]`);
const list = (page: Page) => page.locator('.cm-tooltip-autocomplete');
const sig = (page: Page) => page.locator('.cm-tooltip.wc-lua-sig');
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
const selectionText = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? '');
/** The text of the manual's top row (it scrolls natively). */
const manualTop = (page: Page) =>
  manual(page)
    .locator('.wc-ped-manual-rows')
    .evaluate((el) => {
      const t = el.scrollTop;
      return ([...el.children] as HTMLElement[]).find((c) => c.offsetTop >= t - 1)?.textContent ?? '';
    });

/** Start page → Scripts → EDIT on a user script holding SOURCE; the cursor on a new last line. */
async function openEditor(page: Page): Promise<void> {
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await lib(page, 'init');
  await lib(page, 'create', 'luahelp', SOURCE);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const f = startFrame(page);
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  await row(f, 'luahelp').locator('[data-btn="EDIT"]').click();
  await expect(editor(page)).toHaveAttribute('data-script', 'luahelp');
  await expect(editor(page).locator('.cm-content')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+End');
}

test('string. lists the library with signatures and descriptions', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await page.keyboard.type('local s = string.');
  await expect(list(page)).toBeVisible();
  const format = list(page).locator('li', { hasText: 'string.format' });
  await expect(format).toContainText('(fmt, ...)');
  await expect(list(page).locator('li', { hasText: 'string.dump' })).toHaveCount(0);
  await page.keyboard.type('fo');
  await expect(list(page).locator('li[aria-selected]')).toContainText('string.format');
  const panel = page.locator('.cm-completionInfo');
  await expect(panel).toContainText('Builds a string from a template');
  await expect(panel.locator('.wc-lua-doc-params')).toContainText('fmt (string)');
  await expect(panel.locator('.wc-lua-doc-returns')).toContainText('Returns');
  await expect(panel.locator('.wc-lua-doc-example')).toContainText('string.format("HP %d/%d');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/completion-dark-${info.project.name}.png` });

  // Methods after `x:`, without the `s` parameter.
  await page.keyboard.press('Escape');
  await expect(list(page)).toHaveCount(0);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('local a = line:ma');
  await expect(list(page).locator('li[aria-selected]')).toContainText('match');
  await expect(list(page).locator('li[aria-selected]')).toContainText('(pattern, [init])');
  expect(errors).toEqual([]);
});

test('signature help marks the current parameter and follows the commas; ESC closes it first', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await page.keyboard.type('echo(string.format(');
  await expect(sig(page)).toBeVisible();
  await expect(sig(page).locator('.wc-lua-doc-sig')).toHaveText('string.format(fmt, ...) → string');
  await expect(sig(page).locator('.wc-lua-sig-active')).toHaveText('fmt');
  await page.keyboard.type('"%d", ');
  await expect(sig(page).locator('.wc-lua-sig-active')).toHaveText('...');
  await expect(sig(page).locator('.wc-lua-doc-text')).toContainText('One value per % item');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/signature-dark-${info.project.name}.png` });

  // `)` steps out of string.format: back in echo's argument list.
  await page.keyboard.type('42)');
  await expect(sig(page).locator('.wc-lua-doc-sig')).toContainText('echo(');
  // ESC closes the pop-up, not the editor.
  await page.keyboard.press('Escape');
  await expect(sig(page)).toHaveCount(0);
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).locator('.wc-ped-overlay')).toHaveCount(0);

  // A method call: s:find without its `s`.
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('local a = line:find("x", ');
  await expect(sig(page).locator('.wc-lua-doc-sig')).toHaveText('s:find(pattern, [init], [plain]) → start, end, …');
  await expect(sig(page).locator('.wc-lua-sig-active')).toHaveText('[init]');
  expect(errors).toEqual([]);
});

test('the for snippet expands with tab stops; after the last one Tab indents', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await page.keyboard.type('fo');
  await expect(list(page).locator('li[aria-selected]')).toContainText('for i = 1, n do … end');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  expect(await bufferText(page)).toMatch(/for i = 1, 10 do\n  \nend$/);
  await expect.poll(() => selectionText(page)).toBe('i');
  await page.keyboard.press('Tab');
  await expect.poll(() => selectionText(page)).toBe('1');
  await page.keyboard.type('2');
  await page.keyboard.press('Tab');
  await expect.poll(() => selectionText(page)).toBe('10');
  await page.keyboard.type('5');
  await expect(editor(page)).toHaveAttribute('data-zone', 'buffer');
  // The last Tab goes to the body; the snippet ends, so the next Tab indents.
  await page.keyboard.press('Tab');
  await page.keyboard.type('send("kick")');
  expect(await bufferText(page)).toMatch(/for i = 2, 5 do\n  send\("kick"\)\nend$/);
  await expect(editor(page)).toHaveAttribute('data-zone', 'buffer');
  await page.keyboard.press('Home');
  await page.keyboard.press('Tab');
  await expect(editor(page)).toHaveAttribute('data-zone', 'buffer');
  expect(await bufferText(page)).toMatch(/for i = 2, 5 do\n    send\("kick"\)\nend$/);
  expect(errors).toEqual([]);
});

test('hover on ipairs shows the Lua docs; F1 opens its Lua reference entry', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  const word = editor(page).locator('.cm-line', { hasText: 'ipairs' });
  const box = await word.boundingBox();
  // `for i, mob in ipairs(mobs) do`: ipairs starts at column 14.
  const cell = await editor(page).locator('.cm-content').evaluate((el) => {
    const r = document.createRange();
    const t = [...el.querySelectorAll('.cm-line')].find((l) => l.textContent?.includes('ipairs'))!;
    const walker = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent!.indexOf('ipairs');
      if (i >= 0) {
        r.setStart(n, i + 2);
        r.setEnd(n, i + 3);
        const b = r.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }
    }
    return null;
  });
  expect(box && cell).toBeTruthy();
  await page.mouse.move(cell!.x, cell!.y);
  const hover = page.locator('.cm-tooltip-hover');
  await expect(hover).toContainText('ipairs(t) → iterator');
  await expect(hover).toContainText('Walks a list in order');
  // No F1 hint in the pop-ups (round 5): the footer says F1.
  await expect(hover).not.toContainText('F1');

  // F1 with the cursor on ipairs: its entry in the Lua reference.
  await page.mouse.click(cell!.x, cell!.y);
  await page.keyboard.press('F1');
  await expect(manual(page)).toBeVisible();
  await expect(manual(page).locator('.wc-ped-menu .wc-tr.is-cur')).toHaveText(/^ ipairs\s*$/);
  await expect(manual(page).locator('.wc-ped-manual')).toContainText('ipairs(t) → iterator');
  expect(errors).toEqual([]);
});

test('MANUAL: Lua basics in the guide, the Lua reference with a linked index', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await page.keyboard.press('F1');
  await expect(manual(page)).toBeVisible();
  await expect(manual(page).locator('.wc-ped-menu-label').filter({ hasText: /\S/ })).toHaveText([/Guide/, /API reference/, /Lua reference/]);
  await manual(page).locator('.wc-ped-menu [data-section="Lua basics"]').click();
  await expect.poll(() => manualTop(page)).toBe('Lua basics');
  await expect(manual(page).locator('.wc-ped-manual')).toContainText('Not equal is ~=, not !=.');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/manual-lua-basics-dark-${info.project.name}.png` });

  await manual(page).locator('.wc-ped-menu [data-section="Lua patterns"]').click();
  await expect.poll(() => manualTop(page)).toBe('Lua patterns');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/manual-lua-patterns-dark-${info.project.name}.png` });

  await manual(page).locator('.wc-ped-menu [data-section="Lua library"]').click();
  await expect.poll(() => manualTop(page)).toBe('Lua library');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/manual-lua-index-dark-${info.project.name}.png` });
  await manual(page).locator('.wc-ped-manual a', { hasText: /^string\.format$/ }).click();
  await expect.poll(() => manualTop(page)).toBe('string.format');
  await expect(manual(page).locator('.wc-ped-menu .wc-tr.is-cur')).toHaveText(/^ string\.format\s*$/);
  expect(errors).toEqual([]);
});
