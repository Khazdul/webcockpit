// The bundled key manager (stage 12): enabled from the input line, it
// opens the Keys pane; a locate over the mocked MUME WebSocket stores the
// key (rows gagged), a pane letter casts with it, Ctrl+S teleports to the
// safe key without the browser's save dialog, and a target locate opens
// the pick list, where a click stores the hit and closes it.
import { type Page, expect, test } from '@playwright/test';
import type { WebSocketRoute } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;
const ID = 'keymanager/keys';
const PICK = 'keymanager/~pick';

const bytes = (...parts: (number[] | string)[]): Buffer =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));
const gmcp = (payload: string) => bytes([IAC, SB, GMCP], payload, [IAC, SE]);

const pane = (page: Page, id = ID) => page.locator(`.wc-pane[data-pane="${id}"]`);
const prows = (page: Page, id = ID) => pane(page, id).locator('.wc-pane-content .wc-prow');

async function command(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** The centre of cell (row, col) of a pane's content, 0-based. */
async function cellAt(page: Page, row: number, col: number, id = ID): Promise<{ x: number; y: number }> {
  const cell = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return { w: parseFloat(s.getPropertyValue('--cell-w')), h: parseFloat(s.getPropertyValue('--cell-h')) };
  });
  const box = (await pane(page, id).locator('.wc-pane-content').boundingBox())!;
  return { x: box.x + (col + 0.5) * cell.w, y: box.y + (row + 0.5) * cell.h };
}

test('keymanager: enable, locate stores a key, a letter casts, Ctrl+S, the pick list', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const received: Buffer[] = [];
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => received.push(typeof m === 'string' ? Buffer.from(m) : m));
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  const sentText = () => Buffer.concat(received).toString('latin1');
  const count = (s: string) => sentText().split(s).length - 1;

  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.keyboard.press('Enter');
  await expect.poll(() => server !== null).toBe(true);
  server!.send(gmcp('Char.Name {"name":"Gittan","fullname":"Gittan the Tester"}'));

  await command(page, '#script enable keymanager');
  await expect(pane(page)).toBeVisible();
  await expect(pane(page).locator('.wc-pane-frame')).toContainText('Keys');
  await expect(prows(page).nth(0)).toHaveText(/^ Gittan\s+0 keys\s+\?\s*$/);
  await expect(prows(page).nth(2)).toHaveText(/^ No keys yet\.\s*$/);

  // locatel home: the cast, then the block; the row is gagged.
  await command(page, 'locatel home');
  await expect.poll(sentText).toContain("cast n 'locate life'\r\n");
  server!.send(bytes("You start to concentrate...\r\n\r\nGittan - On a hill  Very near  key: 'uxevjobve'\r\n\r\n"));
  const key = prows(page).nth(1);
  await expect(key).toHaveText(/^ ★ \$home\s.*12h t p s w x\s*$/);
  await expect(page.locator('.wc-output')).toContainText('Stored $home');
  await expect(page.locator('.wc-output')).not.toContainText("key: 'uxevjobve'");

  // Hover t: the tooltip names the command; a click sends it.
  const text = (await key.textContent())!;
  const at = await cellAt(page, 1, text.lastIndexOf(' t') + 1);
  await page.mouse.move(at.x, at.y);
  const tip = page.locator('.wc-spane-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("cast n 'teleport' uxevjobve");
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => count("cast n 'teleport' uxevjobve\r\n")).toBe(1);

  // Ctrl+S teleports to the safe key; the keydown is consumed (no save dialog).
  await page.evaluate(() => {
    const w = window as unknown as { __keys: string[] };
    w.__keys = [];
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyS') w.__keys.push(`${e.code}:${e.defaultPrevented}`); });
  });
  await page.keyboard.press('Control+s');
  await expect.poll(() => count("cast n 'teleport' uxevjobve\r\n")).toBe(2);
  await page.keyboard.press('Alt+s');
  await expect.poll(() => count("cast q 'teleport' uxevjobve\r\n")).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __keys: string[] }).__keys)).toEqual(['KeyS:true', 'KeyS:true']);

  // A target locate with two hits: the pick list; a click stores and closes it.
  await command(page, 'locatel troll cave');
  await expect.poll(sentText).toContain("cast n 'locate life' troll\r\n");
  server!.send(
    bytes(
      "You start to concentrate...\r\n\r\nA troll - Inside  Far away  key: 'abcdefghi'\r\nA hungry warg - In a forest  Near  key: 'qwertyuio'\r\n\r\n",
    ),
  );
  await expect(pane(page, PICK)).toBeVisible();
  await expect(pane(page, PICK).locator('.wc-pane-frame')).toContainText('Pick key for $cave');
  await expect(prows(page, PICK).nth(2)).toContainText('A hungry warg');
  const hit = await cellAt(page, 2, 6, PICK);
  await page.mouse.click(hit.x, hit.y);
  await expect(pane(page, PICK)).toHaveCount(0);
  await expect(prows(page).nth(1)).toHaveText(/^ ☆ \$cave\s.*t p s w x\s*$/);

  // keys hides and shows the pane.
  await command(page, 'keys');
  await expect(pane(page)).toBeHidden();
  await command(page, 'keys');
  await expect(pane(page)).toBeVisible();
  expect(errors).toEqual([]);
});
