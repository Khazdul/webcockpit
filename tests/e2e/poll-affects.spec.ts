// The poll pass (stage 77 H9, ADR 0166 addendum 31) against the login mock:
// `%f` hidden from the output and giving stones, the polled vitals on the
// bars, a troll's card without the mana bar and the Casts cell. Uses the
// dev-only `window.__wc`.
import { type Page, expect, test } from '@playwright/test';
import { GA, XML_PROMPT, answerPulse, pollNonce, wire } from '../fixtures/info-poll-answer';
import { type LoginMock, loginMock } from './mume-login-mock';

const PROMPT = XML_PROMPT + GA;
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const rows = (page: Page) => page.locator('.wc-rows .wc-row');
const card = (page: Page) => page.locator('.wc-pane-character');
const play = (m: LoginMock, ...parts: (string | number[])[]): void =>
  void m.server().send(Buffer.from(parts.flatMap((p) => (typeof p === 'string' ? wire(p) : p))));
const gmcp = (pkg: string, data: unknown): number[] => [255, 250, 201, ...wire(`${pkg} ${JSON.stringify(data)}`), 255, 240];
const polls = (m: LoginMock): string[] => m.sent[0]!.filter((l) => pollNonce(l) !== null);

async function login(page: Page, vitals: Record<string, unknown>, status?: Record<string, unknown>): Promise<LoginMock> {
  const m = await loginMock(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(() => window.__wc!.settings.update({ character: { fetchInfo: true }, panes: { character: { on: true } } }));
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('rasta');
  await page.keyboard.press('Enter');
  await expect(field(page)).toHaveClass(/\bwc-masked\b/);
  await page.keyboard.type(m.password);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  await expect(rows(page).filter({ hasText: 'oO>' })).toHaveCount(1);
  play(m, ...(status ? [gmcp('Char.StatusVars', status)] : []), gmcp('Char.Vitals', vitals), `Welcome back.\r\n\r\n${PROMPT}`);
  await expect(rows(page).filter({ hasText: 'Welcome back.' })).toHaveCount(1);
  return m;
}

/** The next poll's nonce, asked at once where the login poll has gone. */
async function nextPoll(page: Page, m: LoginMock, n: number): Promise<string> {
  if (n > 1) await expect.poll(() => page.evaluate(() => window.__wc!.app.infoPoll!.request()), { timeout: 10_000 }).toBeNull();
  await expect.poll(() => polls(m).length, { timeout: 10_000 }).toBe(n);
  return pollNonce(polls(m)[n - 1]!)!;
}

test('%f: hidden from the output, an untimed stone while listed, gone with the list; the polled vitals on the bars', async ({ page }) => {
  const m = await login(page, { hp: 250, maxhp: 270, mana: 10, maxmana: 121, mp: 30, maxmp: 112, position: 'standing' }, { race: 'Orc', subrace: 'Tarkhnarb Orc' });
  const n = await nextPoll(page, m, 1);
  const before = await rows(page).count();
  play(m, answerPulse(n, { queued: true, affects: ['potion', 'unable to quit', 'armour', 'hunger'] }));
  const quit = card(page).locator('.wc-cc-st[data-id="affect:unable to quit"]');
  await expect(quit).toBeVisible();
  await expect(quit).toHaveAttribute('data-state', 'untimed');
  await expect(card(page).locator('.wc-cc-st[data-id="affect:potion"]')).toBeVisible();
  // A spell is no stone.
  await expect(card(page).locator('.wc-cc-st[data-id="affect:armour"]')).toHaveCount(0);
  // The poll's numbers on the bars (GMCP said 250 before it was sent).
  await expect(card(page).locator('.wc-cc-vital[data-kind="hp"] .wc-cc-vn')).toHaveText('357');
  await expect(card(page).locator('.wc-cc-vital[data-kind="mana"] .wc-cc-vn')).toHaveText('88');
  await expect(rows(page)).toHaveCount(before);
  const shown = (await page.locator('.wc-output').textContent())!;
  for (const trace of [n, 'Affected by', '- potion', 'unable to quit']) expect(shown).not.toContain(trace);

  // The next answer has none: the stones go.
  const n2 = await nextPoll(page, m, 2);
  play(m, answerPulse(n2, { queued: true }));
  await expect(quit).toHaveCount(0);
  await expect(card(page).locator('.wc-cc-st[data-id="affect:potion"]')).toHaveCount(0);
  play(m, `A troll arrives.\r\n\r\n${PROMPT}`);
  await expect(rows(page).filter({ hasText: 'A troll arrives.' })).toHaveCount(1);
});

test('a troll: no mana bar and no Casts cell; HP and moves take the width', async ({ page }) => {
  // The owner's troll (Stewash): no mana key in Char.Vitals, no spell-effort.
  const m = await login(page, { hp: 121, maxhp: 121, mp: 112, maxmp: 112, mood: 'normal', alertness: 'normal', position: 'standing' }, { race: 'Troll', subrace: 'Hill Troll' });
  const n = await nextPoll(page, m, 1);
  play(m, answerPulse(n, { queued: true, vitals: ['121', '121', '0', '0', '100', '112'] }));
  await expect(card(page).locator('.wc-cc-vital[data-kind="mp"] .wc-cc-vn')).toHaveText('100');
  await expect(card(page).locator('.wc-cc-vital[data-kind="mana"]')).toBeHidden();
  await expect(card(page).locator('.wc-cc-f[data-key="casts"]')).toBeHidden();
  await expect(card(page).locator('.wc-cc-f[data-key="mood"]')).toBeVisible();
  const foot = (await card(page).locator('.wc-cc-foot').boundingBox())!;
  const hp = (await card(page).locator('.wc-cc-vital[data-kind="hp"]').boundingBox())!;
  const mp = (await card(page).locator('.wc-cc-vital[data-kind="mp"]').boundingBox())!;
  // Two columns: each about half the foot.
  expect(hp.width).toBeGreaterThan(foot.width * 0.4);
  expect(mp.x).toBeGreaterThan(hp.x + hp.width);
  // Mood, Alertness and Weight share the row.
  const cells = card(page).locator('.wc-cc-f:visible');
  await expect(cells).toHaveCount(3);
});
