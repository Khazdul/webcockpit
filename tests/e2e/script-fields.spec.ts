// Script pane text fields (ADR 0055): a script's temporary pane with a
// field takes the keyboard, typing replaces the selected value, Up/Down
// reach the script, Enter and Esc report and give the keyboard back to the
// input line, and no key typed in the field reaches the game or a macro
// (Ctrl+S is the script's own tempKey and must not fire there).
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;
const ID = 'fields/~ask';

const SCRIPT = `-- @name fields
-- @api 1
local box
local function open()
  box = createPane{id = "ask", title = "Ask", temporary = true, rows = 2, cols = 30}
  box:setLine(1, " Name: ")
  box:setLine(2, " <ansi_light_black>Enter ok, Esc cancel")
  local f = box:setInput(1, 8, 16, {
    value = "home", placeholder = "name",
    onSubmit = function(t) send("got " .. t) box:close() end,
    onCancel = function() send("cancelled") box:close() end,
    onKey = function(k) send("key " .. k) end,
  })
  f:select()
end
tempAlias("^ask$", open)
tempKey("Ctrl+S", function() send("ctrl s fired") end)
echo("fields ready")
`;

/** Stores an enabled user script before the cockpit (and its library) starts. */
async function putScript(page: Page, source: string, name: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise((r) => {
            const q = indexedDB.open('webcockpit');
            q.onsuccess = () => {
              const ok = q.result.objectStoreNames.contains('scripts');
              q.result.close();
              r(ok);
            };
            q.onerror = () => r(false);
          }),
      ),
    )
    .toBe(true);
  await page.evaluate(
    ({ source, name }) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('webcockpit');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction('scripts', 'readwrite');
          tx.objectStore('scripts').put({ id: `${name}-1`, name, source, enabled: true, created: 1, updated: 1 });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { source, name },
  );
}

async function command(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

const focused = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.className ?? '');

test('a script pane text field takes the keyboard and gives it back; its keys never leak', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const received: Buffer[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.onMessage((m) => received.push(typeof m === 'string' ? Buffer.from(m) : m));
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  const sentText = () => Buffer.concat(received).toString('latin1');
  const pane = page.locator(`.wc-pane[data-pane="${ID}"]`);
  const field = pane.locator('input.wc-spane-field');

  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await putScript(page, SCRIPT, 'fields');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-output')).toContainText('fields ready');
  await page.evaluate(() => {
    const w = window as unknown as { __keys: string[] };
    w.__keys = [];
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyS' && e.ctrlKey) w.__keys.push(String(e.defaultPrevented));
    });
  });

  // Opened and focused with its value selected: typing replaces it.
  await command(page, 'ask');
  await expect(pane).toBeVisible();
  await expect(field).toHaveValue('home');
  await expect.poll(() => focused(page)).toBe('wc-spane-field');
  await page.keyboard.type('cave');
  await expect(field).toHaveValue('cave');
  // Up and Down reach the script; Ctrl+S neither fires the macro nor saves the page.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await expect.poll(sentText).toContain('key ArrowDown\r\nkey ArrowUp\r\n');
  await page.keyboard.press('Control+s');
  // Enter submits; the keyboard is back on the input line.
  await page.keyboard.press('Enter');
  await expect.poll(sentText).toContain('got cave\r\n');
  await expect(pane).toHaveCount(0);
  expect(sentText()).not.toContain('ctrl s fired');
  expect(sentText()).not.toContain('cave\r\n'.replace('cave', 'cavecave'));
  expect(await focused(page)).toBe('wc-input-field');
  await command(page, 'look');
  await expect.poll(sentText).toContain('look\r\n');

  // Esc cancels and gives the keyboard back (the menu does not open).
  await command(page, 'ask');
  await expect.poll(() => focused(page)).toBe('wc-spane-field');
  await page.keyboard.press('Escape');
  await expect.poll(sentText).toContain('cancelled\r\n');
  expect(await focused(page)).toBe('wc-input-field');
  await expect(page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-mrow.is-sel')).toHaveCount(0);

  // A click elsewhere gives the keyboard back; a click on the field takes it.
  await command(page, 'ask');
  await expect.poll(() => focused(page)).toBe('wc-spane-field');
  const out = (await page.locator('.wc-output').boundingBox())!;
  await page.mouse.click(out.x + 20, out.y + out.height - 20);
  await expect.poll(() => focused(page)).toBe('wc-input-field');
  await field.click();
  await expect.poll(() => focused(page)).toBe('wc-spane-field');
  await page.keyboard.press('End');
  await page.keyboard.type('x');
  await expect(field).toHaveValue('homex');
  await page.keyboard.press('Enter');
  await expect.poll(sentText).toContain('got homex\r\n');

  // Outside a field the macro fires.
  await page.keyboard.press('Control+s');
  await expect.poll(sentText).toContain('ctrl s fired\r\n');
  expect(await page.evaluate(() => (window as unknown as { __keys: string[] }).__keys)).toEqual(['true', 'true']);
  // Nothing typed in the field went to the game.
  expect(sentText()).not.toMatch(/(^|\n)(cave|homex|x)\r\n/);
  expect(errors).toEqual([]);
});
