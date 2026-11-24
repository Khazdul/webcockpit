// The hidden info poll (stage 77 part C, ADR 0166) against the login mock:
// nothing reaches MUME. Uses the dev-only `window.__wc`.
import { type Page, expect, test } from '@playwright/test';
import { GA, XML_PROMPT, answerPulse, pollNonce, wire } from '../fixtures/info-poll-answer';
import { type LoginMock, loginMock } from './mume-login-mock';

const PROMPT = XML_PROMPT + GA;
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const rows = (page: Page) => page.locator('.wc-rows .wc-row');
const output = (page: Page) => page.locator('.wc-output');
/** The game's side: one frame. */
const play = (m: LoginMock, ...parts: (string | number[])[]): void =>
  void m.server().send(Buffer.from(parts.flatMap((p) => (typeof p === 'string' ? wire(p) : p))));
const gmcp = (pkg: string, data: unknown): number[] => [255, 250, 201, ...wire(`${pkg} ${JSON.stringify(data)}`), 255, 240];
const polls = (m: LoginMock): string[] => m.sent[0]!.filter((l) => pollNonce(l) !== null);
/** The wimpy as the card shows it: the arrow and the HP bar's tooltip. */
async function expectWimpy(page: Page, n: number): Promise<void> {
  await expect(page.locator('.wc-pane-character .wc-cc-vital[data-kind="hp"]')).toHaveAttribute('data-tip', new RegExp(`Wimpy ${n}:`));
  await expect(page.locator('.wc-pane-character .wc-cc-wimpy')).toBeVisible();
}

/** Logs in by hand and gets the game's first vitals and XML prompt. */
async function login(page: Page, opts: { fetchInfo?: boolean } = {}): Promise<LoginMock> {
  const m = await loginMock(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate((fetchInfo) => window.__wc!.settings.update({ character: { fetchInfo }, panes: { character: { on: true } } }), opts.fetchInfo ?? true);
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
  play(m, gmcp('Char.Vitals', { hp: 250, maxhp: 270, position: 'standing' }), `Welcome back.\r\n\r\n${PROMPT}`);
  await expect(rows(page).filter({ hasText: 'Welcome back.' })).toHaveCount(1);
  return m;
}

const runLog = (page: Page): Promise<string> =>
  page.evaluate(async () => {
    const r = window.__wc!.app.recorder;
    await r.flush();
    const store = (await r.getStore())!;
    return (await store.getChunks(r.runId!)).map((c) => c.text).join('');
  });

for (const queued of [false, true]) {
  test(`the login poll is sent and leaves no trace${queued ? ' (queued)' : ''}; the wimpy shows in the pane`, async ({ page }) => {
    const m = await login(page);
    await expect.poll(() => polls(m).length, { timeout: 10_000 }).toBe(1);
    const n = pollNonce(polls(m)[0]!)!;
    const before = await rows(page).count();
    play(m, answerPulse(n, { queued }));
    await expectWimpy(page, 120);
    // Nothing of the pulse: no blank line and no second prompt either.
    await expect(rows(page)).toHaveCount(before);
    await expect(page.locator('.wc-partial')).toBeHidden();
    play(m, `A troll arrives.\r\n\r\n${PROMPT}`);
    await expect(rows(page).filter({ hasText: 'A troll arrives.' })).toHaveCount(1);
    const log = await runLog(page);
    expect(log).toContain('A troll arrives.');
    const history = await page.evaluate(() => window.__wc!.app.input.getHistory().join('\n'));
    // Every row, the scrollback's too (they stay in the DOM).
    const shown = (await output(page).textContent())!;
    for (const trace of [n, 'GoblinTown', 'info ']) {
      expect(shown).not.toContain(trace);
      expect(log).not.toContain(trace);
      expect(history).not.toContain(trace);
    }
    expect(polls(m)).toHaveLength(1);
  });
}

test('a typed info shows', async ({ page }) => {
  const m = await login(page);
  await expect.poll(() => polls(m).length, { timeout: 10_000 }).toBe(1);
  await page.keyboard.type('info');
  await page.keyboard.press('Enter');
  await expect.poll(() => m.sent[0]).toContain('info');
  // The hidden answer, then the typed one's in the same pulse.
  play(m, answerPulse(pollNonce(polls(m)[0]!)!).split(XML_PROMPT)[0]!, `You are 57 years old.\r\n\r\n${PROMPT}`);
  await expect(rows(page).filter({ hasText: 'You are 57 years old.' })).toHaveCount(1);
  await expect(rows(page).last()).toHaveText('o>');
  await expect(output(page)).not.toContainText('GoblinTown');
  await expectWimpy(page, 120);
  expect(await page.evaluate(() => window.__wc!.app.input.getHistory())).toContain('info');
});

test('off sends nothing', async ({ page }) => {
  const m = await login(page, { fetchInfo: false });
  // Past the settle time, with another prompt to send at.
  await page.waitForTimeout(3000);
  play(m, `The sun rises.\r\n\r\n${PROMPT}`);
  await expect(rows(page).filter({ hasText: 'The sun rises.' })).toHaveCount(1);
  await page.waitForTimeout(500);
  expect(polls(m)).toEqual([]);
});

test('the Character gear has the switch', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?replay');
  await expect(field(page)).toBeFocused();
  await page.evaluate(() => window.__wc!.settings.update({ panes: { character: { on: true } } }));
  const pane = page.locator('.wc-pane-character');
  await pane.hover();
  await pane.locator('> .wc-pane-btn-gear').click();
  const pop = page.locator('.wc-sp-gear-character');
  await expect(pop.locator('.wc-pop-title')).toHaveText('Character');
  await expect(pop).toContainText('Also fetches your wimpy at login');
  const on = (): Promise<boolean> => page.evaluate(() => window.__wc!.settings.get().character.fetchInfo);
  expect(await on()).toBe(true);
  await pop.locator('[aria-label="Fetch Stats and Lore from the game"]').click();
  await expect.poll(on).toBe(false);
});

test('the Character gear has the repeat and the event switches (stage 77 F1)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?replay');
  await expect(field(page)).toBeFocused();
  await page.evaluate(() => window.__wc!.settings.update({ panes: { character: { on: true } } }));
  const pane = page.locator('.wc-pane-character');
  await pane.hover();
  await pane.locator('> .wc-pane-btn-gear').click();
  const pop = page.locator('.wc-sp-gear-character');
  const character = () => page.evaluate(() => window.__wc!.settings.get().character);
  expect((await character()).pollEvery).toBe(20);
  await pop.locator('[aria-label="Fetch every"] [data-value="30"]').click();
  await expect.poll(async () => (await character()).pollEvery).toBe(30);
  for (const label of ['Mood changes', 'Wear or remove', 'Affects start or end', 'Herblore started']) {
    await expect(pop.locator(`[aria-label="${label}"]`)).toBeVisible();
  }
  await pop.locator('[aria-label="Wear or remove"]').click();
  await expect.poll(async () => (await character()).pollOn).toEqual({ mood: true, equipment: false, affects: true, herblore: true });
});

test("a typed stat updates the card's shields and shows; a wear line polls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const m = await login(page);
  await expect.poll(() => polls(m).length, { timeout: 10_000 }).toBe(1);
  play(m, answerPulse(pollNonce(polls(m)[0]!)!));
  await expectWimpy(page, 120);
  const card = page.locator('.wc-pane-character .wc-cc');
  await card.locator('.wc-cc-tab[data-tab="stats"]').click();
  const shield = (key: string) => card.locator(`.wc-cc-shield[data-key="${key}"] .wc-cc-sv`);
  await expect(shield('ob')).toHaveText('81');
  await field(page).focus();
  await page.keyboard.type('stat');
  await page.keyboard.press('Enter');
  await expect.poll(() => m.sent[0]).toContain('stat');
  const G = (n: number): string => `\x1b[32m${n}\x1b[0m`;
  play(
    m,
    `OB: ${G(50)}%, DB: ${G(18)}%, PB: ${G(60)}%, Armour: ${G(38)}%. Wimpy: ${G(204)}. Mood: wimpy.\r\n` +
      `Needed: ${G(159510)} xp, ${G(0)} tp. Gold: ${G(82)}. Alert: normal.\r\n\r\n${PROMPT}`,
  );
  await expect(rows(page).filter({ hasText: 'Alert: normal.' })).toHaveCount(1);
  await expect(shield('ob')).toHaveText('50');
  await expect(shield('pb')).toHaveText('60');
  await expectWimpy(page, 204);
  expect(polls(m)).toHaveLength(1);
  // MUME's own line for a wear: a poll once the quiet after the command is over.
  play(m, `You wear a black pair of padded boots on your feet.\r\n\r\n${PROMPT}`);
  await expect.poll(() => polls(m).length, { timeout: 15_000 }).toBe(2);
});
