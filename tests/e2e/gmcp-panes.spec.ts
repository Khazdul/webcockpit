// Stage 4 P1: the Character and Group panes, the Group options and the
// input-line clock, driven by the offline GMCP demo
// (tests/fixtures/gmcp-demo.log) and, for the live disconnect, a mocked
// MUME WebSocket.
import { type Page, expect, test } from '@playwright/test';
import { menuSel, menuTitle, openEscOptions } from './esc-options';

const DEMO = '/?fixture=gmcp-demo.log&speed=0';

const rows = (page: Page) => page.locator('.wc-rows .wc-row');
const content = (page: Page, id: string) => page.locator(`.wc-pane[data-pane="${id}"] .wc-pane-content`);
const prows = (page: Page, id: string) => content(page, id).locator('.wc-prow');

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

test('the clock is day from the dawn hour, counting down to the night, and the room clock', async ({ page }) => {
  await demoDone(page);
  const clock = page.locator('.wc-mb-clock');
  // 7:03 am in Astron: the sun rose at the dawn hour, 7:00 (ADR 0093, addendum
  // 2026-11-01); the night begins at 20:00, the hour after the dusk hour.
  // In the menu bar (stage 31a) the clock is a sun in a time-left ring; the countdown is its tooltip.
  await expect(clock).toHaveAttribute('data-sync', 'minute');
  await expect(clock).toHaveAttribute('data-period', 'day');
  const arc = page.locator('.wc-mb-ring-arc');
  const first = await arc.getAttribute('d');
  await expect.poll(() => arc.getAttribute('d'), { timeout: 3000 }).not.toBe(first);
  await clock.hover();
  await expect(page.locator('.wc-mb-tip')).toHaveText(/^Night in 12:5\d$/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wc.clock') ?? 'null'));
  expect(saved).toMatchObject({ precision: 'minute', reason: 'room_clock' });
});

test('the Group gear applies live (ADR 0107)', async ({ page }) => {
  await demoDone(page);
  // The pane's buttons show on hover (ADR 0095).
  await page.locator('.wc-pane-group').hover();
  await page.locator('.wc-pane-group > .wc-pane-btn-gear').click();
  const pop = page.locator('.wc-sp-gear-group');
  const players = pop.locator('.wc-ck-tg[aria-label="Show players"]');
  await expect(players).toHaveAttribute('aria-checked', 'true');
  await players.click();
  await expect(players).toHaveAttribute('aria-checked', 'false');
  await expect.poll(() => groupNames(page)).toEqual(['a citizen mercenary (MERC)', 'a large dog (DOG)']);
  const npc = (v: string) => pop.locator(`[aria-label="NPC visibility"] [data-value="${v}"]`);
  await npc('all').click();
  await expect.poll(() => groupNames(page)).toEqual(['a citizen mercenary (MERC)', 'a large dog (DOG)', 'a sturdy pony']);
  await npc('off').click();
  await expect.poll(() => groupNames(page)).toEqual([]);
  const s = await page.evaluate(() => window.__wc!.settings.get().group);
  expect(s).toMatchObject({ showPlayers: false, npcMode: 'off' });
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('Options → Panes → Group in the phone\'s ESC menu writes the settings', async ({ page }) => {
  // The start page's Options went in stage 32; the phone's ESC menu keeps it.
  await openEscOptions(page);
  const sel = menuSel(page);
  const title = menuTitle(page);
  await page.keyboard.press('Enter'); // Panes
  await expect(title).toHaveText('─── Panes ───');
  // The phone's pane Appearance page first, then Timers (ADR 0107).
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(sel).toHaveText('<< Group >>');
  await page.keyboard.press('Enter');
  await expect(title).toHaveText('─── Group ───');
  await expect(sel).toContainText('[X] Show players');
  await page.keyboard.press('Enter');
  await expect(sel).toContainText('[ ] Show players');
  await page.keyboard.press('ArrowDown');
  await expect(sel).toHaveText('<< NPC visibility: Labeled >>');
  await page.keyboard.press('ArrowRight');
  await expect(sel).toHaveText('<< NPC visibility: All >>');
  await page.keyboard.press('ArrowRight');
  await expect(sel).toHaveText('<< NPC visibility: Off >>');
  const s = await page.evaluate(() => window.__wc!.settings.get().group);
  expect(s).toMatchObject({ showPlayers: false, npcMode: 'off' });
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
