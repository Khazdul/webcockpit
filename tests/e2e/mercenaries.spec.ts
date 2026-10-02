// The bundled mercenaries script (stage 11 P2): enabled from the input
// line, it opens its pane on the right; a hire over the mocked MUME
// WebSocket labels and groups the mercenary, the pane shows its row with a
// time gauge, and clicking an order sends it. The header's Cost toggles
// 10 silver / 1 gold; the PAY DUE bar pays (feedback round 1).
import { type Page, expect, test } from '@playwright/test';
import type { WebSocketRoute } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;
const ID = 'mercenaries/main';

const bytes = (...parts: (number[] | string)[]): Buffer =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));
const gmcp = (payload: string) => bytes([IAC, SB, GMCP], payload, [IAC, SE]);

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

test('mercenaries: enable, hire, the pane row and gauge, orders, cost toggle, pay click, autopay toggle', async ({ page }) => {
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

  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.keyboard.press('Enter');
  await expect.poll(() => server !== null).toBe(true);
  server!.send(gmcp('Char.Name {"name":"Rasta","fullname":"Rasta the Orc"}'));

  await command(page, '#script enable mercenaries');
  await expect(pane(page)).toBeVisible();
  await expect(pane(page).locator('.wc-pane-frame')).toContainText('Mercenaries');
  await expect(prows(page).nth(0)).toHaveText(/^ Autopay \[off\]  Cost \[10s\]\s*$/);
  await expect(prows(page).nth(2)).toHaveText(/^ No mercenaries hired\.\s*$/);

  // The hire: label, then group once MUME answers the label.
  server!.send(bytes('A citizen mercenary starts following you.\r\n'));
  await expect.poll(sentText).toMatch(/label mercenary [A-Z][a-z]+\r\n/);
  const name = /label mercenary ([A-Z][a-z]+)\r\n/.exec(sentText())![1]!;
  server!.send(bytes('Ok.\r\n'));
  await expect.poll(sentText).toContain(`group ${name}\r\n`);
  server!.send(gmcp(`Group.Add {"id":7,"type":"npc","name":"a citizen mercenary","label":"${name}","hp":140,"maxhp":140}`));

  const merc = prows(page).nth(1);
  await expect(merc).toHaveText(new RegExp(`^ ${name}\\s+● here\\s+l r f\\s*$`));
  await expect(prows(page).nth(2)).toHaveText(/^\s+2[45]:\d\d left\s+$/);
  await expect(prows(page).nth(0)).toHaveText(/^ Autopay \[off\]  Cost \[10s\](?:\s+1 hired)?\s*$/);

  // Hover each order: its tooltip names the command; a click sends it.
  const text = (await merc.textContent())!;
  const tip = page.locator('.wc-spane-tip');
  for (const [ch, what] of [['l', 'lead'], ['r', 'ride'], ['f', 'flee']] as const) {
    const at = await cellAt(page, 1, text.lastIndexOf(` ${ch}`) + 1);
    await page.mouse.move(at.x, at.y);
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(`ask ${name} ${what}`);
    await page.mouse.click(at.x, at.y);
    await expect.poll(sentText).toContain(`ask ${name} ${what}\r\n`);
  }

  // The cost toggle in the header: 10 silver → 1 gold.
  const header = (await prows(page).nth(0).textContent())!;
  const cost = await cellAt(page, 0, header.indexOf('[10s]') + 1);
  await page.mouse.click(cost.x, cost.y);
  await expect(prows(page).nth(0)).toHaveText(/^ Autopay \[off\]  Cost \[1g\](?:\s+1 hired)?\s*$/);

  // A tap: the PAY DUE bar pays 1 gold.
  server!.send(bytes(`A citizen mercenary (${name}) taps you on the shoulder.\r\n`));
  await expect(prows(page).nth(2)).toHaveText(/PAY DUE 1:00|PAY DUE 0:5\d/);
  const bar = await cellAt(page, 2, 30);
  await page.mouse.click(bar.x, bar.y);
  await expect.poll(sentText).toContain(`give 1 gold ${name}\r\n`);
  server!.send(bytes(`A citizen mercenary (${name}) says 'Thank you. I am at your service.'\r\n`));
  await expect(prows(page).nth(2)).toHaveText(/^\s+2[45]:\d\d left\s+$/);

  // The autopay toggle in the header.
  const toggle = await cellAt(page, 0, 10);
  await page.mouse.click(toggle.x, toggle.y);
  await expect(prows(page).nth(0)).toHaveText(/^ Autopay \[on\]  Cost \[1g\](?:\s+1 hired)?\s*$/);

  // merc hides and shows the pane.
  await command(page, 'merc');
  await expect(pane(page)).toBeHidden();
  await command(page, 'merc');
  await expect(pane(page)).toBeVisible();
  expect(errors).toEqual([]);
});
