// The bundled key manager (stage 12): enabled from the input line, it
// opens the Keys pane; a locate over the mocked MUME WebSocket stores the
// key (rows gagged), a pane letter casts with it, Ctrl+S teleports to the
// safe key without the browser's save dialog, and a target locate opens
// the pick window, where the name is typed and Enter or a double click stores it.
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

test('keymanager: enable, locate stores a key, a letter casts, Ctrl+S, the pick window', async ({ page }) => {
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
  await expect(pane(page).locator('.wc-pane-frame')).toContainText('Port keys');
  await expect(prows(page).nth(0)).toHaveText(/^ 0 keys\s+\?\s*$/);
  await expect(prows(page).nth(2)).toHaveText(/^ No keys yet\.\s*$/);

  // locatel home: the cast, then the block; the row is gagged.
  await command(page, 'locatel home');
  await expect.poll(sentText).toContain("cast n 'locate life'\r\n");
  server!.send(bytes("You start to concentrate...\r\n\r\nGittan - On a hill  Very near  key: 'uxevjobve'\r\n\r\n"));
  const key = prows(page).nth(1);
  await expect(key).toHaveText(/^ ★ \$home\s.*12h t p s w x\s*$/);
  await expect(page.locator('.wc-pane[data-pane="ui"]')).toContainText('Stored $home');
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
  await page.evaluate(() => ((window as unknown as { __keys: string[] }).__keys = []));

  // A target locate with two hits: the pick window, the name field focused
  // with the locatel name; Down selects the second hit, Enter stores it.
  await command(page, 'locatel troll cave');
  await expect.poll(sentText).toContain("cast n 'locate life' troll\r\n");
  server!.send(
    bytes(
      "You start to concentrate...\r\n\r\nA troll - Inside  Far away  key: 'abcdefghi'\r\nA hungry warg - In a forest  Near  key: 'qwertyuio'\r\n\r\n",
    ),
  );
  const field = pane(page, PICK).locator('input.wc-spane-field');
  await expect(pane(page, PICK)).toBeVisible();
  await expect(pane(page, PICK).locator('.wc-pane-frame')).toContainText('Pick a key');
  await expect(field).toHaveValue('cave');
  await expect(field).toBeFocused();
  await expect(prows(page, PICK).nth(4)).toContainText('A hungry warg');
  await page.keyboard.press('ArrowDown');
  await expect(prows(page, PICK).nth(4)).toHaveText(/^ ▶ 2 /);
  await page.keyboard.press('Enter');
  await expect(pane(page, PICK)).toHaveCount(0);
  await expect(prows(page).nth(1)).toHaveText(/^ ☆ \$cave\s.*t p s w x\s*$/);
  await expect(page.locator('.wc-input-field')).toBeFocused();

  // A locate cast by hand: the window suggests a name; typing replaces it;
  // a click on a row selects it and a second click stores it.
  await command(page, "cast n 'locate life' warg");
  server!.send(bytes("You start to concentrate...\r\n\r\nA hungry warg - In a forest  Near  key: 'zzzzzzzzz'\r\n\r\n"));
  await expect(field).toHaveValue('warg');
  await expect(field).toBeFocused();
  await page.keyboard.type('den');
  await expect(field).toHaveValue('den');
  // Ctrl+S in the field does not teleport.
  const before = count("cast n 'teleport' uxevjobve\r\n");
  await page.keyboard.press('Control+s');
  const hit = await cellAt(page, 3, 6, PICK);
  await page.mouse.click(hit.x, hit.y);
  await expect(field).toBeFocused();
  await page.mouse.click(hit.x, hit.y);
  await expect(pane(page, PICK)).toHaveCount(0);
  await expect(prows(page).nth(2)).toHaveText(/^ ☆ \$den\s.*t p s w x\s*$/);
  expect(count("cast n 'teleport' uxevjobve\r\n")).toBe(before);
  expect(sentText()).not.toContain('den\r\n');

  // A click on a name renames it inline: type, Enter.
  const den = prows(page).nth(2);
  const dtext = (await den.textContent())!;
  const at2 = await cellAt(page, 2, dtext.indexOf('$den') + 1);
  await page.mouse.click(at2.x, at2.y);
  const rename = pane(page).locator('input.wc-spane-field');
  await expect(rename).toBeFocused();
  await expect(rename).toHaveValue('den');
  await page.keyboard.type('lair');
  await page.keyboard.press('Enter');
  await expect(rename).toHaveCount(0);
  await expect(prows(page).nth(3)).toHaveText(/^ ☆ \$lair\s/);
  await expect(page.locator('.wc-pane[data-pane="ui"]')).toContainText('Renamed $den to $lair');
  await expect(page.locator('.wc-input-field')).toBeFocused();
  expect(sentText()).not.toContain('lair\r\n');

  // The field is opaque: the name's cells under it are blank.
  const lairText = (await prows(page).nth(3).textContent())!;
  const at3 = await cellAt(page, 3, lairText.indexOf('$lair') + 1);
  await page.mouse.click(at3.x, at3.y);
  await expect(rename).toBeFocused();
  await expect(prows(page).nth(3)).not.toContainText('lair');
  expect(await rename.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  // A click elsewhere cancels the rename: the row is whole again, and x deletes.
  const out = (await page.locator('.wc-output').boundingBox())!;
  await page.mouse.click(out.x + 20, out.y + out.height - 20);
  await expect(rename).toHaveCount(0);
  await expect(prows(page).nth(3)).toHaveText(/^ ☆ \$lair\s.*t p s w x\s*$/);
  const x = await cellAt(page, 3, lairText.lastIndexOf(' x') + 1);
  await page.mouse.click(x.x, x.y);
  await expect(prows(page).nth(3)).toHaveText(/delete\? x\s*$/);
  await page.mouse.click(x.x, x.y);
  await expect(page.locator('.wc-pane[data-pane="ui"]')).toContainText('Deleted $lair');
  await expect(prows(page)).toHaveCount(3);

  // keys hides and shows the pane.
  await command(page, 'keys');
  await expect(pane(page)).toBeHidden();
  await command(page, 'keys');
  await expect(pane(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('keymanager TV: a watch opens a TV pane from MUME lines, fills it, ends and closes', async ({ page }) => {
  test.setTimeout(60_000);
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
  server!.send(gmcp('Char.Name {"name":"Gittan","fullname":"Gittan the Tester"}'));
  await command(page, '#script enable keymanager');
  await expect(pane(page)).toBeVisible();
  await command(page, '#script set keymanager tvclose 5');
  await command(page, 'nkey home uxevjobve');
  await expect(prows(page).nth(1)).toHaveText(/\$home/);

  // The watch: the cast, MUME's answer, then the room's lines.
  await command(page, 'watchr home');
  await expect.poll(sentText).toContain("cast n 'watch room' uxevjobve home\r\n");
  server!.send(bytes('You feel aware of this place.\r\n'));
  const tv = pane(page, 'keymanager/~tv_home');
  await expect(tv).toBeVisible();
  await expect(tv.locator('.wc-pane-frame')).toContainText('TV $home');
  // MUME's packet: the line (a green room name), a blank line, a prompt with GA.
  server!.send(bytes('[home] \x1b[32mThe Dark Cave\x1b[0m\r\n\r\n*+ W Mana:Hot>', [IAC, 249]));
  server!.send(bytes('[home] \x1b[31mA troll\x1b[0m arrives from the north.\r\n'));
  await expect(prows(page, 'keymanager/~tv_home').nth(1)).toHaveText(/^The Dark Cave\s*$/);
  await expect(prows(page, 'keymanager/~tv_home').nth(2)).toHaveText(/^A troll arrives from the north\.\s*$/);
  // The room name is green in the TV.
  const green = () =>
    prows(page, 'keymanager/~tv_home')
      .nth(1)
      .locator('span')
      .first()
      .evaluate((e) => getComputedStyle(e).color);
  const g = await green();
  const [r0, g0, b0] = g.match(/\d+/g)!.map(Number);
  expect(g0).toBeGreaterThan(r0! + 40);
  expect(g0).toBeGreaterThan(b0! + 40);
  // The blank line and the prompt after the watch line are not in the game text.
  await expect(page.locator('.wc-output')).not.toContainText('Mana:Hot>');
  // Hidden from the game text; a short KEYS line instead of the activation.
  await expect(page.locator('.wc-output')).toContainText('TV $home: watching.');
  await expect(page.locator('.wc-output')).not.toContainText('[home] A troll');
  // The Port keys pane shows the running watch; its countdown's tooltip
  // stays open across the ticks (ADR 0056) and its text follows them.
  await expect(prows(page).nth(1)).toHaveText(/ \d:\d\d t p s w ◻ x\s*$/);
  const rowText = (await prows(page).nth(1).textContent())!;
  const m = /\d:\d\d/.exec(rowText)!;
  const at = await cellAt(page, 1, m.index + 1);
  await page.mouse.move(at.x, at.y);
  const tip = page.locator('.wc-spane-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Watch room on $home');
  const first = (await tip.textContent())!;
  await expect.poll(async () => (await tip.textContent()) !== first, { timeout: 4000 }).toBe(true);
  // Several ticks, the pointer still: the tooltip never closes.
  for (let i = 0; i < 6; i++) {
    expect(await tip.isVisible()).toBe(true);
    await page.waitForTimeout(400);
  }
  await expect(tip).toContainText('estimate: 200 s');
  // The same for a clickable link (the name): band and tooltip stay.
  const nameAt = await cellAt(page, 1, rowText.indexOf('$home') + 1);
  await page.mouse.move(nameAt.x, nameAt.y);
  await expect(tip).toContainText('Click to rename');
  for (let i = 0; i < 6; i++) {
    expect(await tip.isVisible()).toBe(true);
    await page.waitForTimeout(400);
  }
  await page.mouse.move(5, 5);
  // Another key's TV, opened by the player, stays open while the watch ticks.
  await command(page, 'nkey cave abcdefghi');
  server!.send(bytes('[home] Wind blows.\r\n'));
  await command(page, 'scry cave');
  server!.send(bytes("You let your inner eye find the area... and you see:\r\nThe Dark Cave\r\n\r\nOk.\r\n"));
  const tv2 = pane(page, 'keymanager/~tv_cave');
  await expect(tv2).toBeVisible();
  await command(page, 'tv cave');
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(700);
    await expect(tv2).toBeVisible();
  }
  // The ◻ of the watched key blinks (cyan / red, a second each) …
  const texts = await prows(page).allTextContents();
  const hr = texts.findIndex((x) => x.includes('$home'));
  const homeRow = texts[hr]!;
  const colour = () =>
    prows(page)
      .nth(hr)
      .evaluate((el, col) => {
        let x = 0;
        for (const sp of el.querySelectorAll('span')) {
          const n = (sp.textContent ?? '').length;
          if (x <= col && col < x + n) return getComputedStyle(sp).color;
          x += n;
        }
        return '';
      }, homeRow.indexOf('◻'));
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    seen.add(await colour());
    await page.waitForTimeout(400);
  }
  expect(seen.size).toBeGreaterThanOrEqual(2);
  // … and while it is hovered, its tooltip stays open through the blinks.
  const box = await cellAt(page, hr, homeRow.indexOf('◻'));
  await page.mouse.move(box.x, box.y);
  const tip2 = page.locator('.wc-spane-tip');
  await expect(tip2).toContainText('the TV of $home');
  for (let i = 0; i < 6; i++) {
    expect(await tip2.isVisible()).toBe(true);
    await page.waitForTimeout(400);
  }
  await page.mouse.move(5, 5);
  await command(page, 'tv cave');

  // The end: noted, and the TV closes by itself (tvclose 5 s).
  server!.send(bytes('[home] Your awareness decreases.\r\n'));
  await expect(tv.locator('.wc-pane-frame')).toContainText('ended');
  await expect(page.locator('.wc-output')).toContainText('TV $home: watch ended.');
  await expect(tv).toHaveCount(0, { timeout: 10_000 });
  // tv home opens it again with its lines.
  await command(page, 'tv home');
  await expect(prows(page, 'keymanager/~tv_home').nth(2)).toHaveText(/^A troll arrives/);
  // Dimmed now, the room name still green.
  const g2 = (await green()).match(/\d+/g)!.map(Number);
  expect(g2[1]).toBeGreaterThan(g2[0]! + 40);
  expect(errors).toEqual([]);
});

test('keymanager TVs tile from the top left in opening order, close gaps, and move as a group (remembered)', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1700, height: 950 });
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage(() => {});
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  const login = async () => {
    await page.goto('/');
    await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
    server = null;
    await page.keyboard.press('Enter');
    await expect.poll(() => server !== null).toBe(true);
    // The map pane would cover the game text's top right: off for this test.
    await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: false } } }));
    server!.send(gmcp('Char.Name {"name":"Gittan","fullname":"Gittan the Tester"}'));
    await command(page, '#script enable keymanager');
    await expect(pane(page)).toBeVisible();
  };
  const watch = async (name: string) => {
    await command(page, `watchr ${name}`);
    server!.send(bytes('You feel aware of this place.\r\n'));
    await expect(pane(page, `keymanager/~tv_${name}`)).toBeVisible();
  };
  const box = async (name: string) => (await pane(page, `keymanager/~tv_${name}`).boundingBox())!;
  const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(2);

  await login();
  for (const n of ['aa', 'bb', 'cc', 'dd']) await command(page, `nkey ${n} key${n}`);
  for (const n of ['aa', 'bb', 'cc', 'dd']) await watch(n);
  const game = (await page.locator('.wc-game').boundingBox())!;
  const [a, b, c, d] = [await box('aa'), await box('bb'), await box('cc'), await box('dd')];
  // 1 at the top left; 2 right of it; 3 below 1; 4 below 2.
  near(a.x, game.x);
  near(a.y, game.y);
  near(b.x, a.x + a.width);
  near(b.y, a.y);
  near(c.x, a.x);
  near(c.y, a.y + a.height);
  near(d.x, b.x);
  near(d.y, c.y);

  // The second's watch ends: its TV closes, the others close the gap in order.
  server!.send(bytes('[bb] Your awareness decreases.\r\n'));
  await expect(pane(page, 'keymanager/~tv_bb')).toHaveCount(0);
  await expect.poll(async () => Math.round((await box('cc')).x)).toBe(Math.round(b.x));
  near((await box('cc')).y, a.y);
  near((await box('dd')).x, a.x);
  near((await box('dd')).y, a.y + a.height);

  // Drag the first by its title row: the whole group follows.
  const grip = pane(page, 'keymanager/~tv_aa').locator('.wc-pane-grip');
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + 30, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + 130, g.y + g.height / 2 + 100, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await box('aa')).x - a.x).toBeGreaterThan(60);
  const a2 = await box('aa');
  near((await box('cc')).x, a2.x + a2.width);
  near((await box('cc')).y, a2.y);
  near((await box('dd')).y, a2.y + a2.height);
  expect(await page.evaluate(() => localStorage.getItem('webcockpit.tempPanes'))).toContain('group:keymanager/tv');

  // After a reload the group opens where it was put.
  await login();
  await command(page, 'nkey aa keyaa');
  await watch('aa');
  const a3 = await box('aa');
  near(a3.x, a2.x);
  near(a3.y, a2.y);
  expect(errors).toEqual([]);
});

test('keymanager: the ◻ goes back to its normal colour when its TV closes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage(() => {});
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.keyboard.press('Enter');
  await expect.poll(() => server !== null).toBe(true);
  server!.send(gmcp('Char.Name {"name":"Gittan","fullname":"Gittan the Tester"}'));
  await command(page, '#script enable keymanager');
  await expect(pane(page)).toBeVisible();
  await command(page, 'nkey cave abcdefghi');
  await command(page, 'scry cave');
  server!.send(bytes("You let your inner eye find the area... and you see:\r\nThe Dark Cave\r\n\r\nOk.\r\n"));
  const tv = pane(page, 'keymanager/~tv_cave');
  await expect(tv).toBeVisible();
  const colour = () =>
    prows(page)
      .nth(1)
      .evaluate((el) => {
        const text = el.textContent ?? '';
        const col = text.indexOf('◻');
        let x = 0;
        for (const sp of el.querySelectorAll('span')) {
          const n = (sp.textContent ?? '').length;
          if (x <= col && col < x + n) return getComputedStyle(sp).color;
          x += n;
        }
        return '';
      });
  await expect(prows(page).nth(1)).toContainText('◻');
  const open = await colour();
  // Light green while the TV is open, cyan when closed.
  const rgb = (c: string) => c.match(/\d+/g)!.map(Number);
  const [r1, g1, b1] = rgb(open);
  expect(g1).toBeGreaterThan(r1! + 40);
  expect(g1).toBeGreaterThan(b1! + 20);
  // Closed by the player (its close cross): the ◻ changes back at once.
  await tv.hover();
  await tv.locator('.wc-pane-close').click();
  await expect(tv).toHaveCount(0);
  await expect.poll(colour).not.toBe(open);
  const closed = await colour();
  const [r2, g2, b2] = rgb(closed);
  expect(b2).toBeGreaterThan(r2! + 40);
  expect(g2).toBeGreaterThan(r2! + 40);
  // Open again with tv cave: the "open" colour; then by itself? A scry TV
  // the player opened stays; close it with ◻ and check again.
  await command(page, 'tv cave');
  await expect(tv).toBeVisible();
  await expect.poll(colour).toBe(open);
  const text = (await prows(page).nth(1).textContent())!;
  const at = await cellAt(page, 1, text.indexOf('◻'));
  await page.mouse.click(at.x, at.y);
  await expect(tv).toHaveCount(0);
  await page.mouse.move(5, 5);
  await expect.poll(colour).toBe(closed);
  expect(errors).toEqual([]);
});
