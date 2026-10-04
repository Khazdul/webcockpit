// The bundled almanac script (stage 18 part C): enabled from the input line
// with the clock synced by a `time` line over the mocked MUME WebSocket,
// its pane shows the game date and COMING UP on NOW; the tabs switch to the
// PLAN calendar and the LORE list; the LORE form adds an event, which then
// shows in LORE and on NOW.
import { type Page, expect, test } from '@playwright/test';
import type { WebSocketRoute } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;
const ID = 'almanac/main';

const pane = (page: Page) => page.locator(`.wc-pane[data-pane="${ID}"]`);
const prows = (page: Page) => pane(page).locator('.wc-pane-content .wc-prow');

async function command(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** The centre of cell (row, col) of the pane's content, 0-based. */
async function cellAt(page: Page, row: number, col: number): Promise<{ x: number; y: number }> {
  const cell = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return { w: parseFloat(s.getPropertyValue('--cell-w')), h: parseFloat(s.getPropertyValue('--cell-h')) };
  });
  const box = (await pane(page).locator('.wc-pane-content').boundingBox())!;
  return { x: box.x + (col + 0.5) * cell.w, y: box.y + (row + 0.5) * cell.h };
}

/** Clicks the first cell of `text` on pane row `row`. */
async function clickText(page: Page, row: number, text: string): Promise<void> {
  const s = (await prows(page).nth(row).textContent())!;
  const col = s.indexOf(text);
  expect(col, `"${text}" in "${s}"`).toBeGreaterThanOrEqual(0);
  const at = await cellAt(page, row, col);
  await page.mouse.click(at.x, at.y);
}

test('almanac: synced clock, NOW, PLAN and LORE tabs, an event added with the form', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });

  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.keyboard.press('Enter');
  await expect.poll(() => server !== null).toBe(true);
  // The `time` command's answer sets the clock to the hour.
  server!.send(Buffer.from('12 pm on Sterday, the 19th of Wedmath, year 2855 of the Third Age.\r\n'));

  await command(page, '#script enable almanac');
  await expect(pane(page)).toBeVisible();
  await expect(pane(page).locator('.wc-pane-frame')).toContainText('Almanac');
  await expect(prows(page).nth(0)).toHaveText(/^ {2}NOW {3}PLAN {3}LORE/);
  await expect(prows(page).nth(2)).toHaveText(/19 Wedmath 2855\s*$/);
  await expect(prows(page).nth(10)).toHaveText(/DAYLIGHT\s+dawn 04 · dusk 22 · 18h light/);
  await expect(prows(page).nth(19)).toHaveText(/COMING UP/);
  await expect(pane(page).locator('.wc-pane-content')).toContainText('Dead Knight slab');

  // PLAN: the month grid, Monday first.
  await clickText(page, 0, 'PLAN');
  await expect(prows(page).nth(3)).toHaveText(/^\s+Mo\s+Tu\s+We\s+Th\s+Fr\s+Sa\s+Su\s*$/);
  await expect(prows(page).nth(10)).toHaveText(/❄ Ingrove pack {2}◆ season starts {2}• today/);
  const title = (await prows(page).nth(2).textContent())!;
  await clickText(page, 2, '▸');
  await expect(prows(page).nth(2)).not.toHaveText(title);

  // LORE, and the form.
  await clickText(page, 0, 'LORE');
  await expect(pane(page).locator('.wc-pane-content')).toContainText('moonrise waxing gibbous|full');
  await clickText(page, 0, '[+ add]');
  const fields = pane(page).locator('input.wc-spane-field');
  await expect(fields).toHaveCount(4);
  await expect(fields.nth(0)).toBeFocused();
  await page.keyboard.type('Troll bridge');
  await page.keyboard.press('Tab');
  await expect(fields.nth(1)).toBeFocused();
  await page.keyboard.type('night not winter');
  await expect(prows(page).nth(6)).toHaveText(/→ not winter night/);
  await page.keyboard.press('Tab');
  await page.keyboard.type('Bree, west gate');
  await page.keyboard.press('Enter');
  await expect(fields).toHaveCount(0);
  await expect(page.locator('.wc-output')).toContainText('ALMANAC Added Troll bridge: not winter night.');
  await expect(pane(page).locator('.wc-pane-content')).toContainText('Troll bridge');
  await expect(pane(page).locator('.wc-pane-content')).toContainText('Bree, west gate');

  // Back on NOW, the new event is in COMING UP.
  await clickText(page, 0, 'NOW');
  await expect(pane(page).locator('.wc-pane-content')).toContainText('Troll bridge');

  // almanac hides and shows the pane.
  await command(page, 'almanac');
  await expect(pane(page)).toBeHidden();
  await command(page, 'almanac');
  await expect(pane(page)).toBeVisible();
  expect(errors).toEqual([]);
});
