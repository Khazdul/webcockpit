// Stage 4 P2: the Comm and UI message panes (Inv §2.4, §2.7, ADR 0016);
// the Comm pane's chats, search, fold and gear since stage 49 (ADR 0134).
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
const entry = (page: Page, key: string) => comm(page).locator(`.wc-cm-ent[data-key="${key}"]`);
const bubbles = (page: Page) => comm(page).locator('.wc-cm-bb .wc-cm-bt');
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

test('Comm: Public without tells, questions and socials, a chat per person, and never archives a replay', async ({ page }) => {
  const errors = watchErrors(page);
  await demo(page);
  const rows = await commRows(page).allTextContents();
  // Tells, questions and socials are off in Public by default (ADR 0134,
  // owner's feedback): they live in the chats.
  expect(rows.filter((r) => / (tells?|asks?) /.test(r) || r === 'Dori nods solemnly.')).toEqual([]);
  expect(rows.slice(-4)).toEqual([
    "You narrate 'scout down at the ford'",
    "Dori prays 'Mahal, mend my wounds'",
    "Lindir sings 'A Elbereth Gilthoniel'",
    "You say 'ready when you are'",
  ]);
  // Public, Group, Gibur, Dori and Ecthel (a question opens a chat).
  await expect(comm(page).locator('.wc-cm-ent')).toHaveCount(5);
  await expect(entry(page, 'ecthel')).toBeVisible();
  await expect(entry(page, 'gibur')).toBeVisible();
  await expect(entry(page, 'dori')).toBeVisible();
  // A replay has no reply line.
  await expect(comm(page).locator('.wc-cm-reply')).toBeHidden();
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

test('a chat: bubbles for talk between you two, yours on the right, the unread count cleared', async ({ page }) => {
  await demo(page);
  await expect(entry(page, 'gibur').locator('.wc-cm-badge')).toBeVisible();
  await entry(page, 'gibur').click();
  await expect(entry(page, 'gibur')).toHaveAttribute('aria-pressed', 'true');
  await expect(entry(page, 'gibur').locator('.wc-cm-badge')).toBeHidden();
  await expect(bubbles(page)).toContainText(['on my way', 'hurry, bring the merc', 'more coming, 2 trolls']);
  await expect(comm(page).locator('.wc-cm-bb.is-me .wc-cm-bt')).toContainText(['on my way']);
  // The channel and time: beside the bubble, shown on hover only, no height of its own.
  const meta = comm(page).locator('.wc-cm-bb.is-me .wc-cm-bm').first();
  await expect(meta).toHaveText(/^tell · \d\d:\d\d$/);
  await expect(meta).toHaveCSS('opacity', '0');
  await expect(meta).toHaveCSS('position', 'absolute');
  await comm(page).locator('.wc-cm-bb.is-me').first().hover();
  await expect(meta).toHaveCSS('opacity', '1');
  // His narrate is in his chat as in Public: left-aligned and whole, no bubble.
  await expect(comm(page).locator('.wc-cm-oh').first()).toHaveText("Gibur narrates 'orcs gathering at the ford'");
  // So is his emote: only talk to you is a bubble (ADR 0134 addendum "Bubbles only for talk to you").
  await expect(comm(page).locator('.wc-cm-oh[data-channel="emotes"]')).toHaveText('Gibur grins at the scout wickedly.');
  await expect(comm(page).locator('.wc-cm-bb[data-channel="emotes"]')).toHaveCount(0);
  // Text is selectable (no mousedown is taken).
  const sel = await comm(page)
    .locator('.wc-cm-bb .wc-cm-bt')
    .first()
    .evaluate((el) => getComputedStyle(el).userSelect);
  expect(sel).not.toBe('none');
});

test('search finds messages on every channel and people; Open chat; Esc closes', async ({ page }) => {
  await demo(page);
  await comm(page).hover();
  await page.keyboard.press('Control+f');
  await expect(comm(page).locator('.wc-comm')).toHaveAttribute('data-search', '');
  await expect(comm(page).locator('.wc-cm-sinput')).toBeFocused();
  await page.keyboard.type('troll');
  await expect(comm(page).locator('.wc-cm-rm .wc-cm-rmt')).toContainText(["Gibur tells you 'more coming, 2 trolls'"]);
  await expect(comm(page).locator('.wc-cm-rm mark').first()).toHaveText('troll');
  await page.keyboard.press('Escape');
  await expect(comm(page).locator('.wc-comm')).not.toHaveAttribute('data-search', '');
  await comm(page).locator('.wc-cm-sbtn').click();
  await page.keyboard.type('dor');
  const person = comm(page).locator('.wc-cm-rp[data-key="dori"]');
  await expect(person).toContainText('Open chat →');
  await person.click();
  await expect(entry(page, 'dori')).toHaveAttribute('aria-pressed', 'true');
  await expect(comm(page).locator('.wc-cm-results')).toBeHidden();
});

test('the spine folds the chat list; folded, the chip names the open chat and unfold brings it back', async ({ page }) => {
  await demo(page);
  await entry(page, 'dori').click();
  const handle = comm(page).locator('.wc-cm-handle');
  await handle.hover();
  await expect(handle).toHaveCSS('opacity', '1');
  await handle.click();
  await expect.poll(async () => (await settings(page)).comm.folded).toBe(true);
  await expect(comm(page).locator('.wc-comm')).toHaveAttribute('data-mode', 'folded');
  await expect(comm(page).locator('.wc-cm-col')).toBeHidden();
  await expect(comm(page).locator('.wc-cm-chip')).toHaveText('DDori');
  await comm(page).locator('.wc-cm-unfold').click();
  await expect.poll(async () => (await settings(page)).comm.folded).toBe(false);
  await expect(comm(page).locator('.wc-cm-col')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('the spine is a fold button: a chevron on hover, a click folds at once, a double-click does nothing more', async ({ page }) => {
  await demo(page);
  const handle = comm(page).locator('.wc-cm-handle');
  await expect(handle).toHaveCSS('opacity', '0');
  await handle.hover();
  await expect(handle).toHaveCSS('opacity', '1');
  await expect(handle.locator('svg')).toBeVisible();
  await handle.dblclick();
  // Folded by the first click, no waiting; the second lands on the thread.
  await expect.poll(async () => (await settings(page)).comm.folded).toBe(true);
  expect((await settings(page)).comm.listWidth).toBeNull();
  await comm(page).locator('.wc-cm-unfold').click();
  await expect.poll(async () => (await settings(page)).comm.folded).toBe(false);
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('the Comm gear sets the Public channels and the chat window live (ADR 0107, 0134)', async ({ page }) => {
  await demo(page);
  await expect(commRows(page).filter({ hasText: 'narrate' }).first()).toBeVisible();
  // The pane's buttons show on hover (ADR 0095).
  await page.locator('.wc-pane-comm').hover();
  await page.locator('.wc-pane-comm > .wc-pane-btn-gear').click();
  const pop = page.locator('.wc-sp-gear-comm');
  await expect(pop.locator('.wc-sp-chan[data-channel]')).toHaveCount(10);
  const tales = pop.locator('.wc-sp-chan[data-channel="tales"] [role=switch]');
  await tales.click();
  await expect.poll(async () => (await settings(page)).comm.filters).toEqual({ tales: false, tells: false, questions: false, socials: false });
  await expect(commRows(page).filter({ hasText: 'narrate' })).toHaveCount(0);
  await tales.click();
  await expect(commRows(page).filter({ hasText: 'narrate' }).first()).toBeVisible();
  await pop.locator('[aria-label="Public shows NPCs"]').click();
  await expect.poll(async () => (await settings(page)).comm.npcs).toBe(true);
  await pop.locator('[aria-label="Show chats active in the last"] [data-value="all"]').click();
  await expect.poll(async () => (await settings(page)).comm.chatWindow).toBe('all');
  await page.evaluate(() => window.__wc!.settings.reset());
});

// ------------------------------------------------------------ live archive

const gmcp = (pkg: string, data: unknown): Buffer =>
  Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(`${pkg} ${JSON.stringify(data)}`), Buffer.from([IAC, SE])]);

async function live(page: Page, received: string[] = []): Promise<() => WebSocketRoute> {
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => received.push(typeof m === 'string' ? m : m.toString('latin1')));
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  return () => server!;
}

test('live comm is archived per character and seeded after a reload', async ({ page }) => {
  const errors = watchErrors(page);
  const server = await live(page);
  const login = async () => {
    await page.goto('/');
    await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
    await page.keyboard.press('Enter');
    await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
    server().send(gmcp('Char.Name', { name: 'Testchar', fullname: 'Testchar the Tester' }));
    await expect(comm(page)).toHaveAttribute('data-active', '');
  };
  await login();
  await page.evaluate(() => window.__wc!.app.bus.emit('ui.message', { kind: 'system', parts: ['marker.'] }));
  server().send(gmcp('Comm.Channel.Text', { channel: 'tells', talker: 'Gibur', 'talker-type': 'player', text: "Gibur tells you 'first'" }));
  // A tell opens Gibur's chat (not in Public by default, ADR 0134).
  await expect(commRows(page)).toHaveCount(0);
  await expect(entry(page, 'gibur').locator('.wc-cm-badge')).toHaveText('1');
  await expect(uiRows(page).filter({ hasText: 'Testchar logged in.' })).toHaveCount(1);
  await expect(uiRows(page).filter({ hasText: 'Connecting to MUME...' })).toHaveCount(1);
  // Let the archive write land, then reload and log in again.
  await page.waitForTimeout(200);
  await login();
  // Seeded quietly: the chat is there, with no unread.
  await expect(entry(page, 'gibur')).toBeVisible();
  await expect(entry(page, 'gibur').locator('.wc-cm-badge')).toBeHidden();
  server().send(gmcp('Comm.Channel.Text', { channel: 'tales', talker: 'you', text: 'second' }));
  await expect(commRows(page)).toHaveText(["You narrate 'second'"]);
  await entry(page, 'gibur').click();
  await expect(bubbles(page)).toHaveText(['first']);
  expect(errors).toEqual([]);
});

test('the reply line: none in Public; a click focuses it, typing stays there, Enter sends a tell (or a tell to the group), Esc gives the keys back', async ({ page }) => {
  const received: string[] = [];
  const server = await live(page, received);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  server().send(gmcp('Char.Name', { name: 'Testchar', fullname: 'Testchar the Tester' }));
  await expect(comm(page)).toHaveAttribute('data-active', '');
  server().send(gmcp('Comm.Channel.Text', { channel: 'tells', talker: 'Lindir', 'talker-type': 'player', text: "Lindir tells you 'there?'" }));
  const input = comm(page).locator('.wc-cm-rinput');
  await expect(comm(page).locator('.wc-cm-reply')).toBeHidden();
  await entry(page, 'lindir').click();
  await expect(input).toHaveAttribute('placeholder', 'Reply to Lindir…');
  // A real click (press and release): the field keeps the focus.
  await input.click();
  await page.waitForTimeout(100);
  await expect(input).toBeFocused();
  await page.keyboard.type('yes');
  await expect(input).toHaveValue('yes');
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await page.keyboard.type('again');
  await page.keyboard.press('Enter');
  await entry(page, 'group').click();
  await input.click();
  await page.keyboard.type('wait');
  await page.keyboard.press('Enter');
  await expect.poll(() => received.join('')).toContain('tell group wait');
  const all = received.join('');
  expect(all).toContain('tell Lindir yes');
  expect(all).toContain('tell Lindir again');
  expect(all).not.toContain('say ');
  // Esc: the keys go back to the game's input line.
  await input.click();
  await page.keyboard.press('Escape');
  await expect(input).not.toBeFocused();
  await expect(page.locator('.wc-input-slot textarea, .wc-input-slot input').first()).toBeFocused();
});
