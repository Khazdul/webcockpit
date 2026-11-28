// The map's group on the live path (stage 80 part G, ADR 0171 addendum),
// against the login mock (the telnet, the GMCP, the hidden poll), the
// player located in the bundled arda.mm2:
// - the HP arcs follow every source of HP: yours from the hidden info poll
//   and `Char.Vitals`, a member's from `Group.Update` (a number, an NPC's
//   band word) and from the fight card's `buffer-hits`, each without a
//   `group` command in between;
// - `mapper.npcMode` hides grouped NPCs (none, the unlabeled, or none
//   hidden), and the fan's `+n` counts only what is shown.
// The worker reports what it drew in `data-map-tokens` (tokens/plus/arcs)
// and the arcs' HP fractions summed in thousandths in `data-map-token-hp`.
import { type Page, expect, test } from '@playwright/test';
import { GA, XML_PROMPT, answerPulse, pollNonce, wire } from '../fixtures/info-poll-answer';
import { type LoginMock, loginMock } from './mume-login-mock';

const CONTENT = '.wc-pane-map .wc-pane-content';
const PROMPT = XML_PROMPT + GA;
/** "Old East Road" in Bree (tests/fixtures/map-tokens.log), and a room a step north. */
const ROOM = 10599315;
const play = (m: LoginMock, ...parts: (string | number[])[]): void =>
  void m.server().send(Buffer.from(parts.flatMap((p) => (typeof p === 'string' ? wire(p) : p))));
const gmcp = (pkg: string, data: unknown): number[] => [255, 250, 201, ...wire(`${pkg} ${JSON.stringify(data)}`), 255, 240];
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const drawn = (page: Page) => page.locator(CONTENT).getAttribute('data-map-tokens');
const hp = (page: Page) => page.locator(CONTENT).getAttribute('data-map-token-hp');

async function login(page: Page): Promise<LoginMock> {
  const m = await loginMock(page);
  await page.setViewportSize({ width: 1600, height: 1250 });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(() => window.__wc!.settings.update({ character: { fetchInfo: true }, panes: { map: { on: true } }, mapper: { tokens: true, tokenHp: true } }));
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('rasta');
  await page.keyboard.press('Enter');
  await expect(field(page)).toHaveClass(/\bwc-masked\b/);
  await page.keyboard.type(m.password);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  await expect(page.locator(CONTENT)).toHaveAttribute('data-map-state', 'loaded', { timeout: 30_000 });
  return m;
}

const ally = (id: number, name: string, hp: number) => ({ id, type: 'ally', name, label: 0, mapid: ROOM, room: 'Old East Road', hp, maxhp: 100, 'hp-string': 'healthy' });
/** An NPC as MUME sends it: no numbers, only the band words. */
const horse = { id: 3, type: 'npc', name: 'trained horse', label: 'HORSE', mapid: ROOM, room: 'Old East Road', 'hp-string': 'healthy', 'mana-string': 0, 'mp-string': 'unwearied' };

test('the arcs follow the poll, Char.Vitals, Group.Update and buffer-hits without a group command', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const m = await login(page);
  play(
    m,
    gmcp('Char.StatusVars', { name: 'Rasta', race: 'Man', subrace: 'Dunadan' }),
    gmcp('Char.Vitals', { hp: 200, maxhp: 200, 'hp-string': 'healthy', mana: 50, maxmana: 50, mp: 100, maxmp: 100, position: 'standing' }),
    gmcp('Group.Set', [{ id: 1, type: 'you', waiting: false }, ally(2, 'Thorin', 100), horse]),
    gmcp('Room.Info', { id: ROOM, area: 'Bree', name: 'Old East Road', exits: {} }),
    `\x1b[32mOld East Road\x1b[0m\r\nExits: north, south, east, west.\r\n\r\n${PROMPT}`,
  );
  // You, Thorin and the horse in one room (the fan): three tokens, nobody hurt.
  await expect.poll(() => drawn(page), { timeout: 20_000 }).toBe('3/0/0');

  // The hidden poll's exact vitals (`%z %Z …`): 150 of 200, 75 %.
  await expect.poll(() => m.sent[0]!.filter((l) => pollNonce(l) !== null).length, { timeout: 15_000 }).toBe(1);
  const n = pollNonce(m.sent[0]!.filter((l) => pollNonce(l) !== null)[0]!)!;
  play(m, answerPulse(n, { vitals: ['150', '200', '50', '50', '100', '100'] }));
  await expect.poll(() => hp(page)).toBe('750');
  await expect.poll(() => drawn(page)).toBe('3/0/1');

  // Char.Vitals with only the number (MUME's usual form): 50 %.
  play(m, gmcp('Char.Vitals', { hp: 100 }), PROMPT);
  await expect.poll(() => hp(page)).toBe('500');
  // Your own `waiting` flag (Group.Update for the `you` id) in between: nothing moves.
  play(m, gmcp('Group.Update', { id: 1, waiting: true }), gmcp('Group.Update', { id: 1, waiting: false }), gmcp('Char.Vitals', { hp: 60 }), PROMPT);
  await expect.poll(() => hp(page)).toBe('300');

  // A player's number (Group.Update, value only): Thorin at 40 %.
  play(m, gmcp('Group.Update', { id: 2, hp: 40 }), PROMPT);
  await expect.poll(() => hp(page)).toBe('700');
  await expect.poll(() => drawn(page)).toBe('3/0/2');
  // An NPC's band word (no number): the horse is "fine", the band's middle (85 %).
  play(m, gmcp('Group.Update', { id: 3, 'hp-string': 'fine' }), PROMPT);
  await expect.poll(() => hp(page)).toBe('1550');
  await expect.poll(() => drawn(page)).toBe('3/0/3');

  // The fight card: the horse tanks; `buffer-hits` moves its arc (hurt: 58 %), then alone (bad: 18 %).
  play(m, gmcp('Char.Vitals', { position: 'fighting', opponent: 'an orc', buffer: 'HORSE', 'opponent-hits': 'healthy', 'buffer-hits': 'hurt' }), PROMPT);
  await expect.poll(() => hp(page)).toBe('1280');
  play(m, gmcp('Char.Vitals', { 'buffer-hits': 'bad' }), PROMPT);
  await expect.poll(() => hp(page)).toBe('880');
  // Thorin's number while the fight goes on.
  play(m, gmcp('Group.Update', { id: 2, hp: 90, 'hp-string': 'fine' }), PROMPT);
  await expect.poll(() => hp(page)).toBe('1380');
  expect(errors).toEqual([]);
});

const pony = (id: number) => ({ id, type: 'npc', name: 'pony', label: 0, mapid: ROOM, room: 'Old East Road', 'hp-string': 'healthy', 'mana-string': 0, 'mp-string': 'unwearied' });

test('NPC visibility on the map: labeled by default, all, off, and the +n of the fan', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const m = await login(page);
  const npcMode = (mode: string) => page.evaluate((v) => window.__wc!.settings.update({ mapper: { npcMode: v as 'off' | 'labeled' | 'all' } }), mode);
  expect(await page.evaluate(() => window.__wc!.settings.get().mapper.npcMode)).toBe('labeled');
  // You, Thorin, the labeled horse and three unlabeled ponies in one room.
  play(
    m,
    gmcp('Char.StatusVars', { name: 'Rasta', race: 'Man', subrace: 'Dunadan' }),
    gmcp('Char.Vitals', { hp: 200, maxhp: 200, 'hp-string': 'healthy', position: 'standing' }),
    gmcp('Group.Set', [{ id: 1, type: 'you', waiting: false }, ally(2, 'Thorin', 100), horse, pony(4), pony(5), pony(6)]),
    gmcp('Room.Info', { id: ROOM, area: 'Bree', name: 'Old East Road', exits: {} }),
    `\x1b[32mOld East Road\x1b[0m\r\nExits: north, south, east, west.\r\n\r\n${PROMPT}`,
  );
  // Labeled (the default): you whole, Thorin and the horse small; no ponies.
  await expect.poll(() => drawn(page), { timeout: 20_000 }).toBe('3/0/0');
  // All: you, three small ones and a +2 disc.
  await npcMode('all');
  await expect.poll(() => drawn(page)).toBe('4/1/0');
  // Off: you and Thorin.
  await npcMode('off');
  await expect.poll(() => drawn(page)).toBe('2/0/0');
  // The Group pane's choice is its own.
  expect(await page.evaluate(() => window.__wc!.settings.get().group.npcMode)).toBe('labeled');
  // A label given to a pony shows it again (Labeled).
  await npcMode('labeled');
  await expect.poll(() => drawn(page)).toBe('3/0/0');
  play(m, gmcp('Group.Update', { id: 4, label: 'PO' }), PROMPT);
  await expect.poll(() => drawn(page)).toBe('4/0/0');
  expect(errors).toEqual([]);
});
