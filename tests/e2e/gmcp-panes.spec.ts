// Stage 4 P1: the Character and Group panes, the Group options and the
// input-line clock, driven by the offline GMCP demo
// (tests/fixtures/gmcp-demo.log) and, for the live disconnect, a mocked
// MUME WebSocket.
import { type Page, expect, test } from '@playwright/test';

const DEMO = '/?fixture=gmcp-demo.log&speed=0';

const rows = (page: Page) => page.locator('.wc-rows .wc-row');
const content = (page: Page, id: string) => page.locator(`.wc-pane[data-pane="${id}"] .wc-pane-content`);
const prows = (page: Page, id: string) => content(page, id).locator('.wc-prow');
const menuSel = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-mrow.is-sel');
const menuTitle = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-title-row .wc-c-section');

async function demoDone(page: Page): Promise<void> {
  await page.goto(DEMO);
  await expect(rows(page).filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
}

const groupNames = async (page: Page): Promise<string[]> =>
  (await prows(page, 'group').allTextContents()).map((t) => t.replace(/\s+$/, ''));

test('the demo fills Character and Group, and they stay after the replay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await demoDone(page);
  await expect(page.locator('.wc-pane[data-pane="character"]')).toHaveAttribute('data-active', '');
  // Nine rows: name + level (26 from XP), TP, toggles, the 2×2 gauges.
  await expect(prows(page, 'character')).toHaveCount(9);
  const ch = await prows(page, 'character').allTextContents();
  expect(ch[0]).toMatch(/^\s+Rasta\s+L26$/);
  expect(ch[2]).toMatch(/SNEAK\s+RIDE\s+CLIMB\s+SWIM/);
  expect(ch[4]).toMatch(/aggressive\s+careful/);
  expect(ch[7]).toMatch(/standing\s+50/);
  expect(ch[8]).toContain('^');
  // Room-scoped group by id: Dori 3, the merc 4, the dog 6 (labeled late),
  // Gibur back as 7; the unlabeled pony only in npcMode all.
  await expect.poll(() => groupNames(page)).toEqual(['Dori', 'a citizen mercenary (MERC)', 'a large dog (DOG)', 'Gibur']);
  expect(errors).toEqual([]);
});

test('the game output keeps MUME’s blank lines', async ({ page }) => {
  await demoDone(page);
  const texts = await rows(page).allTextContents();
  const blanks = texts.filter((t) => t.trim() === '').length;
  expect(blanks).toBeGreaterThan(20);
  const i = texts.findIndex((t) => t.includes("Gibur tells you 'hurry, bring the merc'"));
  expect(texts[i - 1]!.trim()).toBe('');
  expect(texts[i + 1]!.trim()).toBe('');
  expect(texts[i + 2]).toBe('*=>');
});

test('the clock strip counts down to dusk after sunrise and the room clock', async ({ page }) => {
  await demoDone(page);
  const clock = page.locator('.wc-input-clock');
  // 7:03 am in Astron: dusk at 19:00, just under 12 game hours away.
  await expect(clock).toHaveText(/^ 11:5\d ☼$/);
  const first = await clock.textContent();
  await expect.poll(() => clock.textContent(), { timeout: 3000 }).not.toBe(first);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wc.clock') ?? 'null'));
  expect(saved).toMatchObject({ precision: 'minute', reason: 'room_clock' });
});

test('Options → Panes → Group applies live from the ESC menu', async ({ page }) => {
  await demoDone(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-overlay')).toBeVisible();
  await page.locator('.wc-overlay .wc-mrow[data-key="options"] .wc-label').click();
  await expect(menuTitle(page)).toHaveText('─── Options ───');
  await page.keyboard.press('Enter'); // Panes
  await expect(menuTitle(page)).toHaveText('─── Panes ───');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(menuSel(page)).toHaveText('<< Group >>');
  await page.keyboard.press('Enter');
  await expect(menuTitle(page)).toHaveText('─── Group ───');
  await expect(menuSel(page)).toContainText('[X] Show players');
  await page.keyboard.press('Enter');
  await expect(menuSel(page)).toContainText('[ ] Show players');
  await expect.poll(() => groupNames(page)).toEqual(['a citizen mercenary (MERC)', 'a large dog (DOG)']);
  await page.keyboard.press('ArrowDown');
  await expect(menuSel(page)).toHaveText('<< NPC visibility: Labeled >>');
  await page.keyboard.press('ArrowRight');
  await expect(menuSel(page)).toHaveText('<< NPC visibility: All >>');
  await expect.poll(() => groupNames(page)).toEqual(['a citizen mercenary (MERC)', 'a large dog (DOG)', 'a sturdy pony']);
  await page.keyboard.press('ArrowRight');
  await expect(menuSel(page)).toHaveText('<< NPC visibility: Off >>');
  await expect.poll(() => groupNames(page)).toEqual([]);
  const s = await page.evaluate(() => window.__wc!.settings.get().group);
  expect(s).toEqual({ showPlayers: false, npcMode: 'off' });
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('a live disconnect blanks Character and Group', async ({ page }) => {
  const IAC = 255;
  const SB = 250;
  const SE = 240;
  const WILL = 251;
  const GMCP = 201;
  const bytes = (...parts: (number[] | string)[]): Buffer =>
    Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));
  const gmcp = (payload: string) => bytes([IAC, SB, GMCP], payload, [IAC, SE]);
  let server: { send(b: Buffer): void; close(): Promise<void> } | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(bytes([IAC, WILL, GMCP], '\r\nBy what name do you wish to be known? '));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  server!.send(gmcp('Char.Name {"name":"Rasta","fullname":"Rasta Fari"}'));
  server!.send(gmcp('Char.Vitals {"mood":"brave","xp":5770000}'));
  server!.send(gmcp('Group.Set [{"id":2,"type":"ally","name":"Gibur","hp":10,"maxhp":100}]'));
  await expect(prows(page, 'character').first()).toContainText('Rasta');
  await expect.poll(() => groupNames(page)).toEqual(['Gibur']);
  await server!.close();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(prows(page, 'character')).toHaveCount(0);
  await expect(prows(page, 'group')).toHaveCount(0);
});
