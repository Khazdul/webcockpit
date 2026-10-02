// Stage 4 P2: the Comm and UI message panes (Inv §2.4, §2.7, ADR 0016).
// Most tests use the offline GMCP demo (tests/fixtures/gmcp-demo.log) at
// max speed; the archive test uses a mocked MUME WebSocket.
import { type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const DEMO = '/?fixture=gmcp-demo.log&speed=0';
const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;

const comm = (page: Page) => page.locator('.wc-pane[data-pane="comm"]');
const commRows = (page: Page) => comm(page).locator('.wc-comm-msg');
const commCell = (page: Page, ch: string) => comm(page).locator(`.wc-comm-cell[data-channel="${ch}"]`);
const uiRows = (page: Page) => page.locator('.wc-pane[data-pane="ui"] .wc-ui-row');
const settings = (page: Page) => page.evaluate(() => window.__wc!.settings.get());

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Runs the demo to its end; a finished replay keeps the panes showing. */
async function demo(page: Page): Promise<void> {
  await page.goto(DEMO);
  await expect(uiRows(page).filter({ hasText: 'Replay finished.' })).toHaveCount(1);
  await expect(comm(page)).toHaveAttribute('data-active', '');
}

test('the UI pane shows the demo lines and keeps them over a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(DEMO);
  await expect(uiRows(page).filter({ hasText: 'Replay finished.' })).toHaveCount(1);
  const lines = await uiRows(page).allTextContents();
  expect(lines).toEqual(
    expect.arrayContaining([
      '● SYSTEM: Replay started.',
      '● SYSTEM: Rasta logged in.',
      '▶ ACHIEVEMENT: Unlocked.',
      '● SYSTEM: Rasta logged out.',
      '● SYSTEM: Replay finished.',
    ]),
  );
  for (const l of lines) expect(l.endsWith('.')).toBe(true);
  // Value parts are bold yellow, the prefix blue.
  const login = uiRows(page).filter({ hasText: 'Rasta logged in.' });
  await expect(login.locator('.wc-ui-value')).toHaveCSS('color', 'rgb(255, 238, 88)');
  await expect(login.locator('.wc-ui-prefix')).toHaveCSS('color', 'rgb(66, 165, 245)');
  // A finished replay keeps the panes active until the next connection
  // (the UI pane never blanks anyway; unit tested in panes.test.ts).
  await expect(page.locator('.wc-pane[data-pane="ui"]')).toHaveAttribute('data-active', '');
  // A reload of the tab keeps the lines (sessionStorage); the demo runs again.
  await page.reload();
  // The pane builds only the lines on screen; the ring holds both runs.
  const stored = () =>
    page.evaluate(() => JSON.parse(sessionStorage.getItem('wc.ui.messages') ?? '[]') as { kind: string; name?: string }[]);
  await expect.poll(async () => (await stored()).filter((m) => m.name === 'ACHIEVEMENT').length).toBe(2);
  await expect(uiRows(page).last()).toHaveText('● SYSTEM: Replay finished.');
  expect(errors).toEqual([]);
});

test('Comm formats the demo messages and never archives a replay', async ({ page }) => {
  const errors = watchErrors(page);
  await demo(page);
  const rows = await commRows(page).allTextContents();
  expect(rows.slice(-6)).toEqual([
    "You narrate 'scout down at the ford'",
    "Dori prays 'Mahal, mend my wounds'",
    "Ecthel asks 'anyone near Rivendell?'",
    "Lindir sings 'A Elbereth Gilthoniel'",
    "Gibur tells you 'more coming, 2 trolls'",
    "You say 'ready when you are'",
  ]);
  // Every message is in the list (it scrolls natively, ADR 0052).
  const seen = rows;
  expect(seen).toHaveLength(14);
  expect(seen.slice(0, 7)).toEqual([
    "Gibur narrates 'orcs gathering at the ford'",
    "You tell Gibur 'on my way'",
    "Gibur tells you 'hurry, bring the merc'",
    "Dori says 'I can smell them'",
    "You whisper to Dori 'stay behind me'",
    'Dori nods solemnly.',
    "*Throzghul* yells 'kill them all'",
  ]);
  // Live view: no timestamps, no indicator.
  await expect(comm(page).locator('.wc-comm-time')).toHaveCount(0);
  await expect(comm(page).locator('.wc-alist-more')).toBeHidden();
  // Header in channel colours; the enemy's red is kept in the message.
  await expect(commCell(page, 'tells')).toHaveCSS('color', 'rgb(0, 128, 0)');
  // The replay wrote nothing to the comm archive.
  const stored = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('webcockpit');
        req.onsuccess = () => {
          const db = req.result;
          const c = db.transaction('comm').objectStore('comm').count();
          c.onsuccess = () => resolve(c.result);
          c.onerror = () => reject(c.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
  expect(stored).toBe(0);
  expect(errors).toEqual([]);
});

test('header: mouse down toggles, right click solos and restores', async ({ page }) => {
  await demo(page);
  const tells = commRows(page).filter({ hasText: /tells? / });
  await expect(tells).not.toHaveCount(0);
  await commCell(page, 'tells').dispatchEvent('mousedown', { button: 0 });
  await expect.poll(async () => (await settings(page)).comm.filters).toEqual({ tells: false });
  await expect(tells).toHaveCount(0);
  await expect(commCell(page, 'tells')).toHaveCSS('color', 'rgb(58, 58, 58)');
  await commCell(page, 'tells').click();
  await expect.poll(async () => (await settings(page)).comm.filters).toEqual({});
  // Right click: solo Says, again: back.
  await commCell(page, 'says').click({ button: 'right' });
  await expect(commRows(page)).toHaveText(["Dori says 'I can smell them'", "You say 'ready when you are'"]);
  await commCell(page, 'says').click({ button: 'right' });
  await expect.poll(async () => (await settings(page)).comm.filters).toEqual({});
  await expect(tells).not.toHaveCount(0);
});

test('the wheel scrolls back with timestamps; the indicator returns to live', async ({ page }) => {
  await demo(page);
  const last = "You say 'ready when you are'";
  await expect(commRows(page).last()).toHaveText(last);
  await comm(page).locator('.wc-alist').hover();
  await page.mouse.wheel(0, -100);
  const more = comm(page).locator('.wc-alist-more');
  await expect(more).toHaveText(/^↓ \d+ newer messages?$/);
  await expect(commRows(page).last()).toHaveText(new RegExp(`^\\d\\d:\\d\\d ${last}`));
  // Scroll all the way: the oldest message at the top, no blank above.
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -1000);
  await expect.poll(() => comm(page).locator('.wc-alist').evaluate((el) => el.scrollTop)).toBe(0);
  const listBox = (await comm(page).locator('.wc-alist').boundingBox())!;
  const firstBox = (await commRows(page).first().boundingBox())!;
  await expect(commRows(page).first()).toHaveText(/^\d\d:\d\d Gibur narrates/);
  expect(Math.abs(firstBox.y - listBox.y)).toBeLessThanOrEqual(1);
  await more.dispatchEvent('mousedown', { button: 0 });
  await expect(more).toBeHidden();
  await expect(commRows(page).last()).toHaveText(last);
  await expect(commRows(page).last()).toBeInViewport();
  await expect(comm(page).locator('.wc-comm-time')).toHaveCount(0);
});

test('Options → Panes → Communication toggles channels and the header live', async ({ page }) => {
  await demo(page);
  await page.locator('.wc-input-field').focus();
  await page.keyboard.press('Escape');
  const menuSel = page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-mrow.is-sel');
  await expect(menuSel).toBeVisible();
  await page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-mrow[data-key="options"]').click();
  await page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-mrow[data-key="panes"]').click();
  await page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-mrow[data-key="comm"]').click();
  const frame = page.locator('.wc-overlay .wc-frame:not([hidden])');
  await expect(frame.locator('.wc-title-row')).toContainText('Communication');
  await expect(frame.locator('[data-channel]')).toHaveText([
    'Narrates', 'Tells', 'Says', 'Yells', 'Prayers', 'Emotes', 'Whispers', 'Questions', 'Songs', 'Socials',
  ]);
  // Enter on the first row turns Narrates off, live (the mouse moved away:
  // hovering a row moves the cursor).
  await page.mouse.move(0, 0);
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await settings(page)).comm.filters).toEqual({ tales: false });
  await expect(commRows(page).filter({ hasText: 'narrate' })).toHaveCount(0);
  await frame.locator('[data-channel="tales"]').click();
  await expect.poll(async () => (await settings(page)).comm.filters).toEqual({});
  // Show channel header off: the header row goes.
  await frame.locator('[data-key="show-header"]').click();
  await expect.poll(async () => (await settings(page)).comm.showHeader).toBe(false);
  await expect(comm(page).locator('.wc-comm-header')).toBeHidden();
  await frame.locator('[data-key="show-header"]').click();
  await expect(comm(page).locator('.wc-comm-header')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.reset());
});

// ------------------------------------------------------------ live archive

const gmcp = (pkg: string, data: unknown): Buffer =>
  Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(`${pkg} ${JSON.stringify(data)}`), Buffer.from([IAC, SE])]);

async function live(page: Page): Promise<() => WebSocketRoute> {
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  return () => server!;
}

test('live comm is archived per character and seeded after a reload', async ({ page }) => {
  const errors = watchErrors(page);
  const server = await live(page);
  const login = async () => {
    await page.goto('/');
    await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
    await page.keyboard.press('Enter');
    await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
    server().send(gmcp('Char.Name', { name: 'Testchar', fullname: 'Testchar the Tester' }));
    await expect(comm(page)).toHaveAttribute('data-active', '');
  };
  await login();
  await page.evaluate(() => window.__wc!.app.bus.emit('ui.message', { kind: 'system', parts: ['marker.'] }));
  server().send(gmcp('Comm.Channel.Text', { channel: 'tells', talker: 'Gibur', 'talker-type': 'player', text: "Gibur tells you 'first'" }));
  await expect(commRows(page)).toHaveText(["Gibur tells you 'first'"]);
  await expect(uiRows(page).filter({ hasText: 'Testchar logged in.' })).toHaveCount(1);
  await expect(uiRows(page).filter({ hasText: 'Connecting to MUME...' })).toHaveCount(1);
  // Let the archive write land, then reload and log in again.
  await page.waitForTimeout(200);
  await login();
  await expect(commRows(page)).toHaveText(["Gibur tells you 'first'"]);
  server().send(gmcp('Comm.Channel.Text', { channel: 'says', talker: 'you', text: 'second' }));
  await expect(commRows(page)).toHaveText(["Gibur tells you 'first'", "You say 'second'"]);
  expect(errors).toEqual([]);
});
