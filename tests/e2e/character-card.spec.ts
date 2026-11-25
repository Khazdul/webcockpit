// The Character card (stage 77 part D, ADR 0166 addendum 6), against the
// GMCP demo and a mocked MUME socket: nothing reaches MUME. Uses the
// dev-only `window.__wc`.
import { type Page, type WebSocketRoute, expect, test } from '@playwright/test';
import { GA, XML_PROMPT, answerPulse, answerText, pollNonce, probeNonce, probeText, wire } from '../fixtures/info-poll-answer';

const DEMO = '/?fixture=gmcp-demo.log&speed=0';
const PROMPT = XML_PROMPT + GA;
const pane = (page: Page) => page.locator('.wc-pane-character');
const card = (page: Page) => pane(page).locator('.wc-cc');
const tab = (page: Page, id: string) => card(page).locator(`.wc-cc-tab[data-tab="${id}"]`);
const word = (page: Page, key: string) => card(page).locator(`.wc-cc-f[data-key="${key}"] .wc-cc-word`);
const selected = (page: Page) => card(page).locator('.wc-cc-tab[aria-selected="true"]');
const inputFocused = (page: Page) => page.evaluate(() => document.activeElement?.classList.contains('wc-input-field') ?? false);
const frames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const gmcp = (pkg: string, data: unknown): number[] => [255, 250, 201, ...wire(`${pkg} ${JSON.stringify(data)}`), 255, 240];

const VITALS = {
  xp: 81_500_000,
  tp: 205_300,
  hp: 187,
  maxhp: 270,
  mana: 93,
  maxmana: 111,
  mp: 98,
  maxmp: 122,
  mood: 'brave',
  'spell-effort': 'normal',
  alertness: 'normal',
  carrying: 'really heavy',
  position: 'standing',
  sneak: 's',
  ride: null,
};

interface Game {
  /** The game's side: one frame. */
  play(...parts: (string | number[])[]): void;
  /** The lines MUME got, the width commands left out. */
  sent: string[];
}

/** In the game on a mocked socket, Character floating `cols` × `rows` of content (default 62 × 11). */
async function play(page: Page, o: { cols?: number; rows?: number; fetchInfo?: boolean; name?: string } = {}): Promise<Game> {
  let server: WebSocketRoute | null = null;
  const sent: string[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((raw) => {
      const text = (typeof raw === 'string' ? Buffer.from(raw) : raw).toString('latin1');
      if (text.startsWith('\xff') || text.includes('Core.Ping')) return;
      for (const line of text.split(/\r?\n/).slice(0, -1)) if (!line.startsWith('change width')) sent.push(line);
    });
    ws.send(Buffer.from([255, 251, 201]));
  });
  await page.setViewportSize({ width: 1500, height: 960 });
  await page.goto('/?replay');
  await page.waitForFunction(() => window.__wc?.app !== undefined);
  await page.evaluate(
    ({ fetchInfo }) =>
      window.__wc!.settings.update((d) => {
        d.character.fetchInfo = fetchInfo;
        for (const id of ['timers', 'group', 'comm', 'ui', 'map'] as const) d.panes[id].on = false;
        d.panes.character.on = true;
      }),
    { fetchInfo: o.fetchInfo ?? false },
  );
  await place(page, o.cols ?? 62, o.rows ?? 11);
  await page.evaluate(() => window.__wc!.app.connectLive());
  await expect.poll(() => server !== null).toBe(true);
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  const game: Game = { sent, play: (...parts) => void server!.send(Buffer.from(parts.flatMap((p) => (typeof p === 'string' ? wire(p) : p)))) };
  game.play(gmcp('Char.Name', { name: o.name ?? 'Rasta', fullname: 'Rasta the Mock' }));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  game.play(gmcp('Char.StatusVars', { race: 'Orc', subrace: 'Tarkhnarb Orc' }), gmcp('Char.Vitals', VITALS), `Welcome back.\r\n\r\n${PROMPT}`);
  await expect(word(page, 'mood')).toHaveText('brave');
  return game;
}

/** Floats the pane with `cols` × `rows` of content. */
async function place(page: Page, cols: number, rows: number): Promise<void> {
  await page.evaluate(
    ({ cols, rows }) =>
      window.__wc!.settings.update((d) => {
        const R = d.layout.docks.right;
        for (const l of [R.head, ...R.lanes.map((x) => x.panes), R.tail]) {
          const i = l.findIndex((p) => p.id === 'character');
          if (i >= 0) l.splice(i, 1);
        }
        R.lanes = R.lanes.filter((l) => l.panes.length > 0);
        const f = d.panes.character.border ? 2 : 0;
        d.layout.floating = [...d.layout.floating.filter((x) => x.id !== 'character'), { id: 'character', x: 1, y: 1, w: cols + f, h: rows + f }];
      }),
    { cols, rows },
  );
  await expect(pane(page)).toHaveAttribute('data-floating', '');
  await frames(page);
}

test('the card from the GMCP demo; a replay sends nothing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(DEMO);
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
  await expect(card(page).locator('.wc-cc-name')).toHaveText('Rasta');
  await expect(card(page).locator('.wc-cc-level')).toHaveText('26');
  // Part E and the portrait pass: the demo's Dúnadan man has the Dúnadan portrait, drawn (no raster file today).
  await expect(card(page).locator('.wc-cc-disc')).toHaveAttribute('data-portrait', 'dunadan');
  await expect(card(page).locator('.wc-cc-disc')).toHaveAttribute('data-sex', 'male');
  await expect(card(page).locator('.wc-cc-disc')).toHaveAttribute('data-art', 'drawn');
  await expect(card(page).locator('[data-click="climb"]')).toHaveAttribute('data-on', '');
  await expect(card(page).locator('.wc-cc-vital[data-kind="mp"] .wc-cc-vn')).toHaveText('131');
  await expect(word(page, 'mood')).toHaveText(/^(aggressive|aggr)$/);
  await expect(card(page).locator('.wc-cc-f[data-key="mood"]')).toHaveAttribute('aria-disabled', 'true');
  await page.evaluate(() => {
    const w = window as unknown as { sentCmds: string[] };
    w.sentCmds = [];
    window.__wc!.app.bus.on('cmd.sent', (c) => w.sentCmds.push(c.text));
  });
  for (const id of ['mood', 'casts', 'alertness', 'sneak', 'position']) await card(page).locator(`[data-click="${id}"]`).click({ force: true });
  await tab(page, 'stats').click();
  await expect(card(page).locator('.wc-cc-quiet')).toHaveText('A replay has no Stats and Lore.');
  expect(await page.evaluate(() => (window as unknown as { sentCmds: string[] }).sentCmds)).toEqual([]);
  expect(errors).toEqual([]);
});

test('the portrait: drawn once into an image at the disc\'s pixels, kept over prompts, a new one for a new race', async ({ page }) => {
  const game = await play(page, { cols: 70, rows: 13 });
  const disc = card(page).locator('.wc-cc-disc');
  await expect(disc).toHaveAttribute('data-portrait', 'tarkhnarb');
  game.play(gmcp('Char.StatusVars', { race: 'Dwarf', subrace: 'Longbeard Dwarf' }), PROMPT);
  await expect(disc).toHaveAttribute('data-portrait', 'longbeard');
  await expect(disc).toHaveAttribute('data-art', 'drawn');
  const img = disc.locator('img.wc-cc-photo');
  await expect(img).toHaveCount(1);
  // The disc's laid-out width (under load Firefox can report 0 for a moment right after the swap).
  await expect.poll(() => disc.evaluate((d) => d.getBoundingClientRect().width)).toBeGreaterThan(0);
  const shot = await img.evaluate((i: HTMLImageElement) => ({ src: i.src.slice(0, 22), w: i.naturalWidth, css: i.closest('.wc-cc-disc')!.getBoundingClientRect().width, dpr: devicePixelRatio }));
  expect(shot.src).toBe('data:image/png;base64,');
  // Baked at the disc's device pixels or a little more (a bucket), never less.
  expect(shot.w).toBeGreaterThanOrEqual(Math.floor(shot.css * shot.dpr));
  expect(shot.w).toBeLessThanOrEqual(Math.ceil(shot.css * shot.dpr * 1.3) + 8);
  // Prompts and vitals repaint the card: the same image element stays, nothing is rebaked.
  await img.evaluate((i) => ((i as HTMLImageElement & { mark?: number }).mark = 1));
  for (let k = 0; k < 5; k++) game.play(gmcp('Char.Vitals', { ...VITALS, hp: 180 - k }), PROMPT);
  await expect(card(page).locator('.wc-cc-vital[data-kind="hp"] .wc-cc-vn')).toHaveText('176');
  expect(await disc.locator('img').evaluate((i) => (i as HTMLImageElement & { mark?: number }).mark)).toBe(1);
  // No neutral silhouette left behind, no animation on the portrait.
  await expect(disc.locator('.wc-cc-fig')).toHaveCount(0);
  expect(await img.evaluate((i) => getComputedStyle(i).transitionDuration + '|' + getComputedStyle(i).animationName)).toBe('0s|none');
});

test('a click sends as typed; the value changes only on GMCP', async ({ page }) => {
  const game = await play(page);
  await page.evaluate(() => window.__wc!.app.input.focus());
  const mood = card(page).locator('.wc-cc-f[data-click="mood"]');
  await mood.click();
  await expect.poll(() => game.sent).toEqual(['change mood aggressive']);
  await expect(mood).toHaveAttribute('data-pending', '');
  await expect(word(page, 'mood')).toHaveText('brave');
  await expect(page.locator('.wc-rows')).toContainText('change mood aggressive');
  expect(await inputFocused(page)).toBe(true);
  await mood.click({ force: true });
  game.play(gmcp('Char.Vitals', { hp: 180 }));
  await expect(card(page).locator('.wc-cc-vital[data-kind="hp"] .wc-cc-vn')).toHaveText('180');
  await expect(mood).toHaveAttribute('data-pending', '');
  game.play(gmcp('Char.Vitals', { mood: 'aggressive' }));
  await expect(word(page, 'mood')).toHaveText(/^(aggressive|aggr)$/);
  await expect(mood).not.toHaveAttribute('data-pending', '');
  expect(game.sent).toEqual(['change mood aggressive']);

  // Without an answer the mark ends by itself.
  const ride = card(page).locator('[data-click="ride"]');
  await ride.click();
  await expect.poll(() => game.sent.at(-1)).toBe('ride');
  await expect(ride).toHaveAttribute('data-pending', '');
  await expect(ride).not.toHaveAttribute('data-pending', '', { timeout: 6000 });
  expect(await inputFocused(page)).toBe(true);
});

test('no click into the line editor (the sequence seen live)', async ({ page }) => {
  const game = await play(page);
  const editor = `Write your message for the Mages' board\r\nType %e on an empty line to save and exit, %q to abandon and %h for help.\r\n==&gt;\r\n<prompt>: </prompt>${GA}`;
  game.play(editor);
  await expect(page.locator('.wc-rows')).toContainText('to abandon');
  await frames(page);
  const mood = card(page).locator('.wc-cc-f[data-click="mood"]');
  await mood.click();
  game.play("A hobbit tells you 'hello'\r\n");
  await expect(page.locator('.wc-rows')).toContainText('hello');
  await mood.click();
  await expect(mood).not.toHaveAttribute('data-pending', '');
  game.play(`Cancelled.\r\n\r\n${PROMPT}`);
  await expect(page.locator('.wc-rows')).toContainText('Cancelled.');
  await frames(page);
  await mood.click();
  await expect.poll(() => game.sent).toEqual(['change mood aggressive']);
});

test('Stats and Lore from the poll; the tabs keep the focus in the input', async ({ page }) => {
  const game = await play(page, { rows: 22, fetchInfo: true });
  await page.evaluate(() => window.__wc!.app.input.focus());
  await tab(page, 'stats').click();
  await expect(card(page).locator('.wc-cc-quiet')).toHaveText('No data yet. It comes when the game is quiet.');
  const polls = (): string[] => game.sent.filter((l) => pollNonce(l) !== null);
  await expect.poll(() => polls().length, { timeout: 10_000 }).toBe(1);
  game.play(answerPulse(pollNonce(polls()[0]!)!));
  // The shields are on Status since F2b (ADR 0166 point 87); Stats has none.
  await expect(card(page).locator('.wc-cc-stats .wc-cc-sv')).toHaveCount(0);
  await expect(card(page).locator('.wc-cc-ab .wc-cc-bv')).toHaveText(['16', '16', '16', '11', '12', '16', '8']);
  await expect(card(page).locator('.wc-cc-age-name')).toHaveText('2nd age');
  await expect(card(page).locator('.wc-cc-next')).toHaveText('3rd at 64');
  await expect(card(page).locator('.wc-cc-mod')).toHaveText(['+14', '−1', '+7', '+1.4', '+2.2', '+2.4']);
  await expect(card(page).locator('.wc-cc-data-age')).toHaveText(/^info \d+ s ago$/);
  await tab(page, 'lore').click();
  const field = (key: string) => card(page).locator(`.wc-cc-lore [data-key="${key}"] .wc-cc-bv`);
  await expect(field('race')).toHaveText('Tarkhnarb orc');
  await expect(card(page).locator('.wc-cc-disc')).toHaveAttribute('data-portrait', 'tarkhnarb');
  await expect(field('alignment')).toHaveText('totally corrupted by the Evilness of Morgoth');
  await expect(field('citizen')).toHaveText('GoblinTown');
  await expect(field('height')).toHaveText('4′11″');
  // A box for War fame and one for War points (ADR 0166 point 123); the purse stays.
  await expect(field('warFame')).toHaveText('warlord');
  await expect(field('warPoints')).toHaveText('19');
  await expect(card(page).locator('.wc-cc-lore .wc-cc-coin')).toHaveText(['380', '5', '49']);
  // Fresh data: the tab change sends no second poll.
  expect(polls()).toHaveLength(1);
  await expect(page.locator('.wc-output')).not.toContainText('GoblinTown');
  expect(await inputFocused(page)).toBe(true);
});

test("the player's sex: probed with the login poll, hidden, remembered", async ({ page }) => {
  const game = await play(page, { fetchInfo: true });
  const disc = card(page).locator('.wc-cc-disc');
  await expect(disc).toHaveAttribute('data-sex', 'male');
  const polls = (): string[] => game.sent.filter((l) => pollNonce(l) !== null);
  const probes = (): string[] => game.sent.filter((l) => probeNonce(l) !== null);
  await expect.poll(() => polls().length, { timeout: 10_000 }).toBe(1);
  expect(probes()).toHaveLength(1);
  expect(game.sent).toContain('info');
  game.play(answerText(pollNonce(polls()[0]!)!) + probeText(probeNonce(probes()[0]!)!, { sex: 'female' }) + PROMPT);
  await expect(disc).toHaveAttribute('data-sex', 'female');
  await expect(disc).toHaveAttribute('data-art', 'drawn');
  await expect(page.locator('.wc-output')).not.toContainText('You are a female');
  await expect(page.locator('.wc-output')).not.toContainText('WC');
  expect(await page.evaluate(() => localStorage.getItem('wc.charSex.v1'))).toBe('{"rasta":"female"}');
});

test('a remembered sex shows at once, and no probe is sent', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wc.charSex.v1', '{"rasta":"female"}'));
  const game = await play(page, { fetchInfo: true });
  await expect(card(page).locator('.wc-cc-disc')).toHaveAttribute('data-sex', 'female');
  await expect.poll(() => game.sent.filter((l) => pollNonce(l) !== null).length, { timeout: 10_000 }).toBe(1);
  expect(game.sent.filter((l) => probeNonce(l) !== null)).toEqual([]);
  expect(game.sent).not.toContain('info');
});

test("a plain info the player types tells the sex", async ({ page }) => {
  const game = await play(page);
  const disc = card(page).locator('.wc-cc-disc');
  await expect(disc).toHaveAttribute('data-sex', 'male');
  game.play(`You are a female Tarkhnarb Orc.\r\nYou are 82 years, 4 months, and 2 days old.\r\n\r\n${PROMPT}`);
  await expect(disc).toHaveAttribute('data-sex', 'female');
  await expect(page.locator('.wc-output')).toContainText('You are a female Tarkhnarb Orc.');
});

test('a fight: only the swords; the tab, the bars and the boxes stay (round 12 decision 8)', async ({ page }) => {
  const game = await play(page);
  await tab(page, 'lore').click();
  await expect(selected(page).locator('.wc-cc-tab-t')).toHaveText('LORE');
  const left = await card(page).locator('.wc-cc-left').boundingBox();
  const bar = card(page).locator('.wc-cc-vital[data-kind="hp"] .wc-cc-trk');
  const before = (await bar.boundingBox())!;
  const position = card(page).locator('[data-click="position"]');
  await expect(position).not.toHaveAttribute('data-fight', '');
  game.play(gmcp('Char.Vitals', { opponent: 'a troll', 'hp-string': 'Hurt' }));
  await expect(position).toHaveAttribute('data-fight', '');
  await expect(position).toHaveAttribute('aria-label', 'Fighting');
  // The red swords, nothing else.
  expect(await position.evaluate((b) => getComputedStyle(b).color)).toMatch(/^rgb\((2[0-9]{2}), /);
  await expect(selected(page).locator('.wc-cc-tab-t')).toHaveText('LORE');
  await expect(card(page).locator('.wc-cc-vital[data-kind="hp"] .wc-cc-vn')).toHaveText('');
  await expect(card(page).locator('.wc-cc-vital[data-kind="hp"] .wc-cc-span')).toBeVisible();
  await expect(card(page)).not.toContainText(/hurt/i);
  expect(await bar.boundingBox()).toEqual(before);
  expect(await card(page).locator('.wc-cc-left').boundingBox()).toEqual(left);
  expect(await card(page).locator('.wc-cc-tab[aria-selected="false"]').first().evaluate((b) => getComputedStyle(b).opacity)).toBe('1');
  await tab(page, 'stats').click();
  await expect(selected(page).locator('.wc-cc-tab-t')).toHaveText('STATS');
  game.play(gmcp('Char.Vitals', { opponent: null, hp: 150 }));
  await expect(position).not.toHaveAttribute('data-fight', '');
  await expect(selected(page).locator('.wc-cc-tab-t')).toHaveText('STATS');
  await expect(card(page).locator('.wc-cc-vital[data-kind="hp"] .wc-cc-vn')).toHaveText('150');
});

// ------------------------------------------------- the round 12–14 look (F2b)

/** Puts `n` buffs in as debug cells (`left` ms of `total`), and returns their ids. */
async function buffs(page: Page, n: number, left = 300_000, total = 600_000): Promise<string[]> {
  return page.evaluate(
    ({ n, left, total }) => {
      const t = window.__wc!.app.game.timers;
      const now = Date.now();
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        const id = `e2e-b${String(i).padStart(2, '0')}`;
        ids.push(id);
        t.debugAdd({ id, name: `buff ${i}`, group: 'buff', startedAt: now - (total - left), expiresAt: now + left + i * 1000, expected: total, tracked: true });
      }
      return ids;
    },
    { n, left, total },
  );
}

const stone = (page: Page, id: string) => card(page).locator(`.wc-cc-st[data-id="${id}"]`);
const shown = (page: Page) => card(page).locator('.wc-cc-st:not([hidden])');

test('Status: the cells, the shields `⋯` until the poll answers, the purse in the stones’ row', async ({ page }) => {
  const game = await play(page, { fetchInfo: true });
  const sv = card(page).locator('.wc-cc-status .wc-cc-sv');
  await expect(card(page).locator('.wc-cc-status')).toHaveAttribute('data-form', 'cells');
  await expect(sv).toHaveText(['⋯', '⋯', '⋯', '⋯']);
  await expect(card(page).locator('.wc-cc-purse')).toBeHidden();
  // The heat track (round 16 C) fills to the current step: brave is mood's fourth, the three below at half.
  const segs = card(page).locator('.wc-cc-f[data-key="mood"] .wc-cc-ht > .wc-cc-hs');
  await expect(segs).toHaveCount(6);
  expect(await segs.evaluateAll((ls) => ls.map((l) => (l.hasAttribute('data-on') ? 'on' : l.hasAttribute('data-past') ? 'past' : '')))).toEqual(['past', 'past', 'past', 'on', '', '']);
  await expect(card(page).locator('.wc-cc-f[data-key="mood"]')).toHaveAttribute('data-heat', '3');
  const polls = (): string[] => game.sent.filter((l) => pollNonce(l) !== null);
  await expect.poll(() => polls().length, { timeout: 10_000 }).toBe(1);
  game.play(answerPulse(pollNonce(polls()[0]!)!));
  await expect(sv).toHaveText(['81', '13', '85', '70']);
  // The shield's full name alone (T12).
  await expect(card(page).locator('.wc-cc-shield[data-key="ob"]')).toHaveAttribute('data-tip', 'Offensive bonus');
  await expect(card(page).locator('.wc-cc-shield[data-key="ob"]')).not.toHaveAttribute('data-tip-title', /./);
  // The purse, right-aligned in the stones' one row, all of it in a wide pane.
  const purse = card(page).locator('.wc-cc-purse');
  await expect(purse.locator('.wc-cc-coin:not([hidden])')).toHaveText(['380', '5', '49']);
  // All three coins show: nothing hidden, no tooltip (T39).
  await expect(purse).not.toHaveAttribute('data-tip', /./);
  const row = (await card(page).locator('.wc-cc-stones').boundingBox())!;
  const p = (await purse.boundingBox())!;
  expect(Math.abs(p.x + p.width - (row.x + row.width))).toBeLessThan(1);
  // Stats: the same stones, never the purse (from 62 × 12 at this font: the sheet and the strip of H10 take 25 px).
  await place(page, 62, 12);
  await tab(page, 'stats').click();
  await expect(card(page).locator('.wc-cc-stones')).toBeVisible();
  await expect(purse).toBeHidden();
  expect((await card(page).locator('.wc-cc-stones').boundingBox())!.height).toBeCloseTo(row.height, 0);
});

/** A computed colour as `#rrggbb` (an opaque `rgb()`). */
const hexOf = (rgb: string): string => `#${(rgb.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
const heat = (page: Page, key: string) => card(page).locator(`.wc-cc-f[data-key="${key}"]`);

test('H2: heat, the cells coloured by step on the Lykta and on Paper, in every form; the corner mark on the clickable three (round 16 C)', async ({ page }) => {
  const game = await play(page, { rows: 11 });
  const colors = async (): Promise<string[]> =>
    Promise.all(['mood', 'casts', 'alertness', 'weight'].map(async (k) => hexOf(await word(page, k).evaluate((e) => getComputedStyle(e).color))));
  // brave, normal, normal, really heavy: Mood's fourth, Casts' parchment middle, Alertness' calm grey (normal
  // is its first step), Weight today's orange signal.
  await expect.poll(colors).toEqual(['#eab35e', '#d9cfb4', '#a9a491', '#ff8c2a']);
  await expect(heat(page, 'weight')).toHaveAttribute('data-signal', 'low');
  // The corner mark on Mood, Casts and Alertness, not on Weight.
  for (const k of ['mood', 'casts', 'alertness']) await expect(heat(page, k).locator('.wc-cc-cm')).toBeVisible();
  await expect(heat(page, 'weight').locator('.wc-cc-cm')).toHaveCount(0);
  // The ground warms with the step: its foot is not the plain cell's.
  const foot = await heat(page, 'mood').evaluate((e) => getComputedStyle(e).backgroundImage);
  expect(foot).toMatch(/linear-gradient/);
  // Hot: berserk, thorough, paranoid, torture; written once per change, the track full to the end.
  game.play(gmcp('Char.Vitals', { mood: 'berserk', 'spell-effort': 'thorough', alertness: 'paranoid', carrying: 'torture' }));
  await expect.poll(colors).toEqual(['#ff4d4d', '#7db7da', '#ee7d5c', '#ff4d4d']);
  const last = card(page).locator('.wc-cc-f[data-key="casts"] .wc-cc-hs');
  expect(await last.evaluateAll((ls) => ls.map((l) => (l.hasAttribute('data-on') ? 'on' : l.hasAttribute('data-past') ? 'past' : '')))).toEqual(['past', 'past', 'past', 'past', 'on']);
  expect(hexOf(await last.last().evaluate((e) => getComputedStyle(e).backgroundColor))).toBe('#7db7da');
  // An unknown word: no heat, the plain colour, no step lit.
  game.play(gmcp('Char.Vitals', { alertness: 'sleepy' }));
  await expect(heat(page, 'alertness')).not.toHaveAttribute('data-heat', /./);
  expect(await card(page).locator('.wc-cc-f[data-key="alertness"] .wc-cc-hs[data-on]').count()).toBe(0);
  // Every form keeps the value's colour: the line (62 × 6), the plain values and the compact card (62 × 4).
  for (const rows of [6, 5, 4]) {
    await place(page, 62, rows);
    expect(hexOf(await word(page, 'mood').evaluate((e) => getComputedStyle(e).color))).toBe('#ff4d4d');
  }
  await expect(card(page)).toHaveAttribute('data-step', 'compact');
  // Paper: its own table, 4.5 : 1 against the cell's warmed ground.
  await place(page, 62, 11);
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } }));
  await expect(card(page)).toHaveAttribute('data-light', '');
  game.play(gmcp('Char.Vitals', { alertness: 'paranoid', carrying: 'really heavy' }));
  await expect.poll(colors).toEqual(['#b3261e', '#25608a', '#a84716', '#a04a00']);
  const ratio = (a: string, b: string): number => {
    const lum = (h: string): number => {
      const [r, g, bl] = [1, 3, 5].map((i) => {
        const x = parseInt(h.slice(i, i + 2), 16) / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };
  for (const k of ['mood', 'casts', 'alertness', 'weight']) {
    // The ground's foot as drawn: the gradient's last stop, resolved by the browser.
    const ground = await heat(page, k).evaluate((e) => {
      const img = getComputedStyle(e).backgroundImage;
      const stops = img.match(/(?:rgba?|color)\([^()]*(?:\([^()]*\)[^()]*)*\)/g) ?? [];
      if (stops.length < 2) return `no stops: ${img}`;
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const g = c.getContext('2d')!;
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 1, 1);
      g.fillStyle = stops[stops.length - 1]!;
      g.fillRect(0, 0, 1, 1);
      const d = g.getImageData(0, 0, 1, 1).data;
      return `#${[d[0]!, d[1]!, d[2]!].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    });
    expect(ground).toMatch(/^#[0-9a-f]{6}$/);
    const value = hexOf(await word(page, k).evaluate((e) => getComputedStyle(e).color));
    expect(ratio(value, ground), `${k} ${value} on ${ground}`).toBeGreaterThanOrEqual(4.5);
  }
});

test('H: the tabs’ numerals in a low pane (H10), the short forms, and Stats’ stones only where Stats fits (ADR 0166 points 168–171)', async ({ page }) => {
  const game = await play(page, { rows: 7, fetchInfo: true });
  await buffs(page, 3);
  const tabs = card(page).locator('.wc-cc-tabs');
  const stones = card(page).locator('.wc-cc-stones');
  // H10 (round 20 G8): low, the tabs on the sheet's right edge; under 8 px the words go, I, II, III come; the word is the tooltip and the name.
  await expect(tabs).toHaveAttribute('data-side', 'right');
  await expect(tabs).toHaveAttribute('data-form', 'numerals');
  for (const [id, name, n] of [['status', 'Status', 'I'], ['stats', 'Stats', 'II'], ['lore', 'Lore', 'III']] as const) {
    await expect(tab(page, id)).toHaveAttribute('data-tip', name);
    await expect(tab(page, id)).toHaveAccessibleName(name);
    await expect(tab(page, id).locator('.wc-cc-tab-n')).toHaveText(n);
    await expect(tab(page, id).locator('.wc-cc-tab-t')).toBeHidden();
  }
  // H4: the hand-made short forms, never `…`.
  game.play(gmcp('Char.Vitals', { mood: 'aggressive', alertness: 'vigilant' }));
  await expect(word(page, 'mood')).toHaveText(/^(aggressive|aggr)$/);
  for (const key of ['mood', 'casts', 'alertness', 'weight']) await expect(word(page, key)).not.toHaveText(/…/);
  // H1: at 62 × 7 Stats does not fit above the stones' row, so the row goes from Stats; Status keeps it.
  const polls = (): string[] => game.sent.filter((l) => pollNonce(l) !== null);
  await expect.poll(() => polls().length, { timeout: 10_000 }).toBe(1);
  game.play(answerPulse(pollNonce(polls()[0]!)!));
  await expect(stones).toBeVisible();
  await tab(page, 'stats').click();
  await expect(card(page).locator('.wc-cc-ab .wc-cc-bv')).toHaveText(['16', '16', '16', '11', '12', '16', '8']);
  await expect(stones).toBeHidden();
  await expect(card(page).locator('.wc-cc-main')).toHaveAttribute('data-stats-stones', 'off');
  // The age line stays clear of where the row was: the last thing in the area.
  const main = (await card(page).locator('.wc-cc-main').boundingBox())!;
  const age = (await card(page).locator('.wc-cc-data-age').boundingBox())!;
  expect(age.y + age.height).toBeLessThanOrEqual(main.y + main.height + 0.5);
  await tab(page, 'status').click();
  await expect(stones).toBeVisible();
  // Tall: Stats fits, the row stays; the tabs are words again.
  await place(page, 62, 22);
  await tab(page, 'stats').click();
  await expect(stones).toBeVisible();
  await expect(card(page).locator('.wc-cc-main')).not.toHaveAttribute('data-stats-stones', 'off');
  await expect(tabs).toHaveAttribute('data-form', 'words');
  await expect(tabs).toHaveAttribute('data-side', 'top');
  await expect(tab(page, 'stats')).not.toHaveAttribute('data-tip', /./);
});

test('H10: the folder tabs of round 20 G8: one sheet with the chosen tab, the others behind, the stones under it; keys and Paper', async ({ page }) => {
  await play(page, { rows: 11 });
  await buffs(page, 3);
  const tabs = card(page).locator('.wc-cc-tabs');
  const folio = card(page).locator('.wc-cc-folio');
  await expect(tabs).toHaveAttribute('data-side', 'top');
  await expect(tabs).toHaveAttribute('data-form', 'words');
  await expect(tabs).toHaveAttribute('aria-orientation', 'horizontal');
  await expect(folio).toBeVisible();
  // The words in Cinzel, at least 8 px; the chosen one lit.
  const font = await tab(page, 'status').locator('.wc-cc-tab-t').evaluate((e) => ({ family: getComputedStyle(e).fontFamily, px: parseFloat(getComputedStyle(e).fontSize) }));
  expect(font.family).toMatch(/Cinzel/);
  expect(font.px).toBeGreaterThanOrEqual(8);
  // The strip under the hood: the three tabs side by side over the sheet, each over the next a little.
  const bs = await Promise.all(['status', 'stats', 'lore'].map(async (id) => (await tab(page, id).boundingBox())!));
  const main = (await card(page).locator('.wc-cc-main').boundingBox())!;
  for (const b of bs) expect(b.y + b.height).toBeCloseTo(main.y, 0);
  expect(bs[1]!.x).toBeLessThan(bs[0]!.x + bs[0]!.width);
  // The sheet's ground: one outline with the chosen tab; a change of tab redraws it, the boxes stay.
  const ground = () => card(page).locator('.wc-cc-fg').evaluate((e) => getComputedStyle(e).clipPath);
  const atStatus = await ground();
  expect(atStatus).toMatch(/^path\(/);
  // The stones' row is outside the sheet: below its foot.
  const stones = (await card(page).locator('.wc-cc-stones').boundingBox())!;
  const folioBox = (await folio.boundingBox())!;
  expect(stones.y + stones.height).toBeLessThanOrEqual(folioBox.y + folioBox.height + 0.5);
  await tab(page, 'lore').click();
  await expect(card(page)).toHaveAttribute('data-tab', 'lore');
  expect(await ground()).not.toBe(atStatus);
  // The keyboard: Tab reaches a tab, Enter and Space choose.
  await tab(page, 'stats').focus();
  await page.keyboard.press('Enter');
  await expect(card(page)).toHaveAttribute('data-tab', 'stats');
  await tab(page, 'status').focus();
  await page.keyboard.press('Space');
  await expect(card(page)).toHaveAttribute('data-tab', 'status');
  expect(await ground()).toBe(atStatus);
  // Paper: the sheet lighter than the pane, its edge dark.
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } }));
  await expect(card(page)).toHaveAttribute('data-light', '');
  const paper = await card(page).locator('.wc-cc-fg').evaluate((e) => getComputedStyle(e).backgroundImage);
  expect(paper).toMatch(/linear-gradient/);
  const edge = await card(page).locator('.wc-cc-fo').evaluate((e) => getComputedStyle(e).stroke);
  expect(edge).not.toBe('none');
  // Low (below 110 px of content): the tabs on the sheet's right edge.
  await place(page, 62, 7);
  await expect(tabs).toHaveAttribute('data-side', 'right');
  const col = (await tabs.boundingBox())!;
  const m2 = (await card(page).locator('.wc-cc-main').boundingBox())!;
  expect(col.x).toBeCloseTo(m2.x + m2.width, 0);
});

test('the stones: `+n` and its list; the herblore `+` menu and ×', async ({ page }) => {
  await play(page, { cols: 40, rows: 9 });
  const ids = await buffs(page, 80);
  await expect.poll(() => shown(page).count()).toBeGreaterThan(5);
  const more = card(page).locator('.wc-cc-st[data-k="more"]');
  await expect(more).toBeVisible();
  const n = Number((await more.textContent())!.slice(1));
  expect(n).toBeGreaterThan(0);
  expect(await card(page).locator('.wc-cc-st[data-k="stone"]:not([hidden])').count()).toBe(ids.length - n);
  await expect(more).toHaveAttribute('data-tip', 'live');
  // Its tooltip (T32): the hidden stones' rows alone, no title, no header.
  await more.hover();
  const tip = page.locator('.wc-ptip');
  await expect(tip).toBeVisible();
  await expect(tip.locator('b')).toBeHidden();
  await expect(tip).not.toContainText('no room');
  expect((await tip.locator('span').textContent())!.split('\n')).toHaveLength(n);
  // The list: a press opens it, Esc closes it, and a press outside.
  await more.click();
  const list = page.locator('.wc-cc-list');
  await expect(list).toBeVisible();
  await expect(list.locator('.wc-cc-lr')).toHaveCount(n);
  await expect(list).toContainText(`${n} more (no room)`);
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  await more.click();
  await expect(list).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(list).toHaveCount(0);

  // The herblore `+` opens the Timers pane's menu; a pick starts it, its × stops it.
  await page.evaluate(() => window.__wc!.app.game.timers.debugClear());
  await expect(shown(page)).toHaveCount(1);
  await card(page).locator('.wc-cc-st[data-k="add"]').click();
  const menu = page.locator('.wc-tm-menu[aria-label="Herblores"]');
  await expect(menu).toBeVisible();
  const key = (await menu.locator('.wc-tm-mi').first().getAttribute('data-key'))!;
  await menu.locator('.wc-tm-mi').first().click();
  await expect(menu).toHaveCount(0);
  const herb = card(page).locator('.wc-cc-st[data-k="stone"][data-tone="herb"]');
  await expect(herb).toHaveCount(1);
  // Its own icon (stage 77 H8): the first herblore, Healing, its cross in a circle (healing 5).
  expect(key).toBe('Healing');
  await expect(herb.locator('.wc-cc-sti path')).toHaveAttribute('d', 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 8v8 M8 12h8');
  await herb.hover();
  const x = herb.locator('.wc-cc-stx');
  await expect(x).toHaveAttribute('data-key', key);
  await x.click();
  await expect(herb).toHaveCount(0);
  expect(await page.evaluate((k) => window.__wc!.app.game.timers.view().herbs.find((h) => h.key === k)?.active, key)).toBe(false);
});

test('a stone’s bar drains on the second and the list of stones does not rebuild', async ({ page }) => {
  await play(page);
  const [id] = await buffs(page, 1, 30_000, 60_000);
  const fill = stone(page, id!).locator('.wc-cc-stf');
  await expect(fill).toHaveAttribute('style', /--f: 0\.(4|5)/);
  await stone(page, id!).evaluate((e) => ((e as HTMLElement & { mark?: number }).mark = 1));
  const first = await fill.evaluate((e) => (e as HTMLElement).style.getPropertyValue('--f'));
  await expect.poll(() => fill.evaluate((e) => (e as HTMLElement).style.getPropertyValue('--f')), { timeout: 5000 }).not.toBe(first);
  expect(await stone(page, id!).evaluate((e) => (e as HTMLElement & { mark?: number }).mark)).toBe(1);
});

test('border off: the top row clicks, and the name still drags the pane', async ({ page }) => {
  await play(page);
  await page.evaluate(() => window.__wc!.settings.update({ panes: { character: { border: false } } }));
  await expect(pane(page)).not.toHaveAttribute('data-framed', '');
  await frames(page);
  const hits = await page.evaluate(() => {
    const at = (sel: string, dy: number): string => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      const e = document.elementFromPoint(r.left + r.width / 2, r.top + dy) as HTMLElement;
      return e.closest('button') ? 'button' : e.className;
    };
    return { tab: at('.wc-cc-tab[data-tab="status"]', 4), name: at('.wc-cc-name', 6) };
  });
  expect(hits.tab).toBe('button');
  expect(hits.name).toBe('wc-pane-grip');
});

test('the gear locks the height', async ({ page }) => {
  await play(page);
  await expect(card(page)).toHaveAttribute('data-mode', 'large');
  // Over the title row: Playwright's Firefox drops :hover over the card's buttons (as group-pane.spec.ts notes of icons).
  await pane(page).hover({ position: { x: 16, y: 6 } });
  await pane(page).locator('> .wc-pane-btn-gear').click();
  const height = page.locator('.wc-sp-gear-character [aria-label="Height"]');
  await height.locator('[data-value="medium"]').click();
  await expect(card(page)).toHaveAttribute('data-mode', 'medium');
});

// ---------------------------------------------------------- low panes (F2c)

test('a low pane steps down; no tabs under 80 px; the compact card (ADR 0166 points 124–126)', async ({ page }) => {
  const game = await play(page, { fetchInfo: true });
  await place(page, 33, 9);
  const polls = (): string[] => game.sent.filter((l) => pollNonce(l) !== null);
  await expect.poll(() => polls().length, { timeout: 10_000 }).toBe(1);
  game.play(answerPulse(pollNonce(polls()[0]!)!));
  await expect(card(page).locator('.wc-cc-status .wc-cc-sv')).toHaveText(['81', '13', '85', '70']);
  await buffs(page, 8);
  await tab(page, 'lore').click();
  await expect(card(page)).toHaveAttribute('data-tab', 'lore');
  await expect(card(page)).toHaveAttribute('data-step', '0');

  // Medium's height lock a little lower: the portrait stays, a step down (the cells on one line), no tabs, Status shows.
  await page.evaluate(() => window.__wc!.settings.update({ character: { height: 'medium' } }));
  let step = '';
  for (const rows of [6, 5]) {
    await place(page, 33, rows);
    step = (await card(page).getAttribute('data-step'))!;
    if (['1', '2', '3', '4'].includes(step)) break;
  }
  expect(['1', '2', '3', '4']).toContain(step);
  await expect(card(page).locator('.wc-cc-left')).toHaveAttribute('data-form', 'portrait');
  await expect(card(page).locator('.wc-cc-status')).toHaveAttribute('data-form', step === '1' ? 'cells' : step === '4' ? 'plain' : 'line');
  await expect(card(page).locator('.wc-cc-tabs')).toBeHidden();
  await expect(card(page)).toHaveAttribute('data-tab', 'status');
  expect(await faults(page)).toEqual([]);

  // Auto at 4 rows: the compact card.
  await page.evaluate(() => window.__wc!.settings.update({ character: { height: 'auto' } }));
  await place(page, 33, 4);
  await expect(card(page)).toHaveAttribute('data-step', 'compact');
  await expect(card(page).locator('.wc-cc-left')).toBeHidden();
  await expect(card(page).locator('.wc-cc-tabs')).toBeHidden();
  const status = card(page).locator('.wc-cc-status');
  await expect(status).toHaveAttribute('data-form', 'compact');
  // Line 1: M, C, A, W and the short forms, the whole word in the tooltip; the shields as icon and value.
  await expect(status.locator('.wc-cc-lt')).toHaveText(['M', 'C', 'A', 'W']);
  await expect(word(page, 'mood')).toHaveText(/^(brave|brav)$/);
  await expect(word(page, 'weight')).toHaveText(/^(rhvy|r\.hvy|r\.heavy)$/);
  await expect(card(page).locator('.wc-cc-f[data-key="weight"]')).toHaveAttribute('data-tip', 'Weight: really heavy');
  await expect(status).toHaveAttribute('data-chips', 'icon');
  await expect(status.locator('.wc-cc-sv')).toHaveText(['81', '13', '85', '70']);
  await expect(status.locator('.wc-cc-shield .wc-cc-i').first()).toBeVisible();
  await expect(status.locator('.wc-cc-sk').first()).toBeHidden();
  // Line 2: the five icons first, then the stones and the purse.
  const line2 = card(page).locator('.wc-cc-stones');
  await expect(line2.locator('.wc-cc-icons .wc-cc-ib')).toHaveCount(5);
  await expect.poll(() => shown(page).count()).toBeGreaterThan(5);
  const icons = (await line2.locator('.wc-cc-icons').boundingBox())!;
  const first = (await shown(page).first().boundingBox())!;
  expect(first.x).toBeGreaterThan(icons.x + icons.width);
  const line1 = (await status.boundingBox())!;
  expect(icons.y).toBeGreaterThanOrEqual(line1.y + line1.height - 0.5);
  await expect(card(page).locator('.wc-cc-purse')).toBeVisible();
  expect(await faults(page)).toEqual([]);

  // The small icons name themselves on hover (T7).
  await card(page).locator('.wc-cc-ib[data-click="sneak"]').hover();
  await expect(page.locator('.wc-ptip')).toHaveText('Sneak');
  // A click on Mood works as on the full card.
  await card(page).locator('.wc-cc-f[data-click="mood"]').click();
  await expect.poll(() => game.sent.at(-1)).toBe('change mood aggressive');
  game.play(gmcp('Char.Vitals', { mood: 'aggressive' }));
  await expect(word(page, 'mood')).toHaveText('aggr');
  await expect(card(page).locator('.wc-cc-f[data-key="mood"]')).toHaveAttribute('data-tip-title', 'Mood: aggressive');
  await expect(card(page).locator('.wc-cc-f[data-key="mood"]')).toHaveAttribute('data-tip', 'Click: wimpy');

  // Many stones: `+n` and its list.
  await buffs(page, 40);
  const more = card(page).locator('.wc-cc-st[data-k="more"]');
  await expect(more).toBeVisible();
  await more.click();
  const list = page.locator('.wc-cc-list');
  await expect(list).toBeVisible();
  await expect(list.locator('.wc-cc-lr')).toHaveCount(Number((await more.textContent())!.slice(1)));
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  expect(await faults(page)).toEqual([]);

  // Tall again: the tabs and the chosen tab come back.
  await place(page, 33, 9);
  await expect(card(page).locator('.wc-cc-tabs')).toBeVisible();
  await expect(card(page)).toHaveAttribute('data-tab', 'lore');
});

// --------------------------------------------------------------- the sizes

/** Content boxes in cells: the minimum, a lane, the new player's, the phone's strip, wide and tall. */
const SIZES: readonly (readonly [number, number])[] = [
  [8, 3], [8, 18], [14, 5], [18, 3], [18, 4], [22, 20], [26, 10], [31, 3], [31, 9], [31, 26], [33, 4], [33, 5], [34, 5], [34, 6], [45, 9], [48, 9], [52, 3], [52, 5], [62, 11], [80, 4], [84, 22], [110, 14],
];

/** Whatever of the card is outside its box, over another part, or cut through. */
async function faults(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.wc-cc')!;
    const bad = new Set<string>();
    const shown = (e: Element): boolean => e.getClientRects().length > 0;
    const outer = root.getBoundingClientRect();
    // The sheet (round 20 G8) is drawn under the area and the tabs: no box of its own.
    const parts = [...root.children].filter((e) => shown(e) && !e.classList.contains('wc-cc-folio'));
    const boxes = parts.map((e) => e.getBoundingClientRect());
    parts.forEach((e, i) => {
      const r = boxes[i]!;
      if (r.left < outer.left - 0.6 || r.top < outer.top - 0.6 || r.right > outer.right + 0.6 || r.bottom > outer.bottom + 0.6) bad.add(`${e.className} is outside`);
      for (let j = i + 1; j < parts.length; j++) {
        const b = boxes[j]!;
        if (Math.min(r.right, b.right) - Math.max(r.left, b.left) > 0.6 && Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > 0.6) bad.add(`${e.className} is on ${parts[j]!.className}`);
      }
    });
    // Every text inside the boxes that clip it; a scrolling area only clips sideways.
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const at = n.parentElement!;
      // A name of any length may end in an ellipsis.
      if (!n.textContent!.trim() || !shown(at) || at.classList.contains('wc-cc-name')) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        for (let e: HTMLElement | null = at; e && e !== root.parentElement; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.overflowX === 'visible' && !/strict|paint/.test(cs.contain)) continue;
          const b = e.getBoundingClientRect();
          const scrolls = e.classList.contains('wc-cc-scroll');
          const air = r.height * 0.2; // a line box is higher than its glyphs
          if (r.left < b.left - 0.7 || r.right > b.right + 0.7 || (!scrolls && (r.top + air < b.top - 0.7 || r.bottom - air > b.bottom + 0.7))) {
            bad.add(`"${n.textContent}" is cut by ${e.className}`);
            break;
          }
          if (scrolls) break;
        }
      }
    }
    return [...bad];
  });
}

for (const [font, size] of [
  ['dejavu', 15],
  ['hack', 17],
  ['dejavu', 9],
  ['dejavu', 23],
] as const) {
  test(`nothing overflows or overlaps at any size (${font} ${size})`, async ({ page }) => {
    test.setTimeout(120_000);
    const game = await play(page, { fetchInfo: true });
    const polls = (): string[] => game.sent.filter((l) => pollNonce(l) !== null);
    await expect.poll(() => polls().length, { timeout: 10_000 }).toBe(1);
    game.play(answerPulse(pollNonce(polls()[0]!)!));
    await expect.poll(() => page.evaluate(() => window.__wc!.app.game.info.answer !== null)).toBe(true);
    // Stones too (F2b): eight buffs and a flag; the `+` and, where they do not fit, the `+n`.
    await buffs(page, 8);
    game.play(gmcp('Group.Set', [{ id: 1, type: 'you', name: 'Rasta', poison: true }]));
    await page.evaluate(({ font, size }) => window.__wc!.settings.update({ appearance: { font, size } }), { font, size });
    await page.evaluate(() => document.fonts.ready);
    const bad: string[] = [];
    for (const [cols, rows] of SIZES) {
      await place(page, cols, rows);
      // A low pane has no tabs (point 125): Status only.
      const low = await card(page).locator('.wc-cc-tabs').isHidden();
      for (const id of low ? (['status'] as const) : (['status', 'stats', 'lore'] as const)) {
        // Through the element: a mark of a few px is no target for the mouse.
        await tab(page, id).evaluate((b) => (b as HTMLButtonElement).click());
        await expect(card(page)).toHaveAttribute('data-tab', id);
        await frames(page);
        for (const f of await faults(page)) bad.push(`${cols}x${rows} ${id}: ${f}`);
      }
    }
    expect(bad).toEqual([]);
  });
}

// The pane's cross lies over the top right on hover: a framed one's glyph
// reaches a few px into the content (Firefox), a borderless one's row is
// the content's top row.
for (const border of [true, false]) {
  test(`no tab is under the pane's cross (border ${border ? 'on' : 'off'})`, async ({ page }) => {
    test.setTimeout(90_000);
    await play(page);
    for (const [font, size] of [
      ['dejavu', 15],
      ['hack', 17],
      ['dejavu', 9],
    ] as const) {
      await page.evaluate(({ font, size, border }) => window.__wc!.settings.update({ appearance: { font, size }, panes: { character: { border } } }), { font, size, border });
      await page.evaluate(() => document.fonts.ready);
      for (const [cols, rows] of [[18, 7], [31, 7], [31, 9], [48, 9], [80, 7], [80, 12]] as const) {
        await place(page, cols, rows);
        // A low pane has no tabs (point 125).
        if (await card(page).locator('.wc-cc-tabs').isHidden()) {
          expect((await card(page).boundingBox())!.height, `${font}${size} ${cols}x${rows}`).toBeLessThan(120);
          continue;
        }
        for (const id of ['stats', 'lore', 'status'] as const) {
          const b = (await tab(page, id).boundingBox())!;
          for (const dy of [1.5, b.height / 2]) {
            const x = b.x + b.width / 2;
            const y = b.y + Math.min(dy, b.height - 1);
            // Two steps onto it, so that the hover set is out when it is pressed.
            await page.mouse.move(x - 3, y + 2);
            await page.mouse.move(x, y);
            await page.mouse.click(x, y);
            const at = `${font}${size} ${cols}x${rows} ${id} +${dy}`;
            expect(await page.evaluate(() => window.__wc!.settings.get().panes.character.on), `closed at ${at}`).toBe(true);
            await expect(tab(page, id), at).toHaveAttribute('aria-selected', 'true');
          }
        }
      }
    }
  });
}

// ------------------------------------------------------------ stage 77 G

/** The shown stones (not the `+` or `+n`). */
const stones = (page: Page) => card(page).locator('.wc-cc-st[data-k="stone"]:not([hidden])');
const ids = (page: Page): Promise<string[]> => stones(page).evaluateAll((es) => es.map((e) => e.getAttribute('data-id')!));

test('G1: your GMCP flags are stones; a member’s are not; blind and the blindness debuff are one stone', async ({ page }) => {
  const game = await play(page);
  await expect(stones(page)).toHaveCount(0);
  game.play(
    gmcp('Group.Set', [
      { id: 1, type: 'you', name: 'Rasta', poison: true },
      { id: 2, type: 'ally', name: 'Gibur', poison: true, blind: true },
    ]),
  );
  await expect.poll(() => ids(page)).toEqual(['flag:poison']);
  await expect(stones(page).first()).toHaveAttribute('data-tone', 'debuff');
  await expect(stones(page).first()).toHaveAttribute('data-state', 'untimed');
  game.play(gmcp('Group.Update', { id: 1, poison: false }));
  await expect(stones(page)).toHaveCount(0);
  // A member's change gives none either.
  game.play(gmcp('Group.Update', { id: 2, snared: true }));
  game.play(gmcp('Group.Update', { id: 1, blind: true }));
  await expect.poll(() => ids(page)).toEqual(['flag:blind']);
  // MUME's line for the blindness: the timed debuff takes the flag's place.
  game.play(`You have been blinded!\r\n\r\n${PROMPT}`);
  await expect.poll(() => ids(page)).toEqual(['affect:blindness']);
  await expect(stones(page).first()).toHaveAttribute('data-tone', 'debuff');
  await expect(stones(page).first()).toHaveAttribute('data-state', 'timed');
});

test('G2: an affect’s start line shows its stone, its end line takes it away', async ({ page }) => {
  const game = await play(page);
  await expect(stones(page)).toHaveCount(0);
  game.play(`The draught burns down your throat, and a fiery feeling fills your limbs.\r\n\r\n${PROMPT}`);
  await expect.poll(() => ids(page)).toEqual(['affect:Orkish draught']);
  const st = stones(page).first();
  await expect(st).toHaveAttribute('data-tone', 'buff');
  await expect(st).toHaveAttribute('data-state', 'timed');
  await expect(st).toHaveAttribute('data-tip-title', 'Orkish draught');
  game.play(`As the warmth of the draught recedes from your limbs, you feel less energetic.\r\n\r\n${PROMPT}`);
  await expect(stones(page)).toHaveCount(0);
});

test('G3: the gear’s Stones switches: Buffs off hides the buff stones live, Flags off the flag stone', async ({ page }) => {
  const game = await play(page);
  const [a, b] = await buffs(page, 2);
  game.play(gmcp('Group.Set', [{ id: 1, type: 'you', name: 'Rasta', poison: true }]));
  await expect.poll(() => ids(page)).toEqual([a, b, 'flag:poison']);
  // Over the title row: Playwright's Firefox drops :hover over the card's buttons.
  await pane(page).hover({ position: { x: 16, y: 6 } });
  await pane(page).locator('> .wc-pane-btn-gear').click();
  const pop = page.locator('.wc-sp-gear-character');
  await expect(pop.locator('.wc-pop-title')).toHaveText('Character');
  const shownGroups = () => page.evaluate(() => window.__wc!.settings.get().character.stones);
  await pop.locator('[aria-label="Buffs"]').click();
  await expect.poll(async () => (await shownGroups()).buffs).toBe(false);
  await expect.poll(() => ids(page)).toEqual(['flag:poison']);
  await pop.locator('[aria-label="Buffs"]').click();
  await expect.poll(() => ids(page)).toEqual([a, b, 'flag:poison']);
  await pop.locator('[aria-label="Flags"]').click();
  await expect.poll(async () => (await shownGroups()).flags).toBe(false);
  await expect.poll(() => ids(page)).toEqual([a, b]);
  await expect(pop).toBeVisible();
});

test('G4: every click sends its exact command; berserk and the fight have none', async ({ page }) => {
  const game = await play(page);
  const el = (id: string) => card(page).locator(`[data-click="${id}"]`);
  const click = async (id: string, command: string): Promise<void> => {
    const n = game.sent.length;
    await el(id).click();
    await expect.poll(() => game.sent.slice(n)).toEqual([command]);
  };
  // VITALS: brave, normal casts, normal alertness, sneaking, no ride, standing.
  await click('mood', 'change mood aggressive');
  await click('casts', 'change spellcasting careful');
  await click('alertness', 'change alertness careful');
  await click('sneak', 'sneak');
  await click('climb', 'climb');
  await click('swim', 'swim');
  await click('ride', 'ride');
  await click('position', 'rest');
  // The game's answers end the pending marks.
  game.play(gmcp('Char.Vitals', { mood: 'wimpy', 'spell-effort': 'thorough', alertness: 'paranoid', ride: 'a pony', position: 'resting' }), PROMPT);
  for (const id of ['mood', 'casts', 'alertness', 'ride', 'position']) await expect(el(id)).not.toHaveAttribute('data-pending', '');
  // The cycles wrap: wimpy → prudent, thorough → quick, paranoid → normal; a mount → lead.
  await click('mood', 'change mood prudent');
  await click('casts', 'change spellcasting quick');
  await click('alertness', 'change alertness normal');
  await click('ride', 'lead');
  await click('position', 'stand');
  game.play(gmcp('Char.Vitals', { position: 'sleeping' }), PROMPT);
  await expect(el('position')).not.toHaveAttribute('data-pending', '');
  await click('position', 'wake');
  game.play(gmcp('Char.Vitals', { position: 'sitting' }), PROMPT);
  await expect(el('position')).not.toHaveAttribute('data-pending', '');
  await click('position', 'stand');

  // Berserk: no click, nothing sent.
  game.play(gmcp('Char.Vitals', { mood: 'berserk', position: 'standing' }), PROMPT);
  await expect(word(page, 'mood')).toHaveText(/^(berserk|bers\.)$/);
  await expect(card(page).locator('.wc-cc-f[data-key="mood"]')).toHaveAttribute('aria-disabled', 'true');
  // A fight: the position is the swords, no click.
  game.play(gmcp('Char.Vitals', { opponent: 'a troll' }), PROMPT);
  await expect(el('position')).toHaveAttribute('data-fight', '');
  const n = game.sent.length;
  await card(page).locator('.wc-cc-f[data-key="mood"]').click({ force: true });
  await el('position').click({ force: true });
  await page.waitForTimeout(300);
  expect(game.sent.slice(n)).toEqual([]);
});

test('G5: a mood change by GMCP and an affect line each give one hidden poll after the quiet', async ({ page }) => {
  test.setTimeout(60_000);
  const game = await play(page, { fetchInfo: true });
  // The repeat out of the way: only the events poll here.
  await page.evaluate(() => window.__wc!.settings.update({ character: { pollEvery: 300 } }));
  const polls = (): string[] => game.sent.filter((l) => pollNonce(l) !== null);
  await expect.poll(() => polls().length, { timeout: 10_000 }).toBe(1);
  game.play(answerPulse(pollNonce(polls()[0]!)!));
  await expect(card(page).locator('.wc-cc-status .wc-cc-sv')).toHaveText(['81', '13', '85', '70']);
  // The width commands at login are a burst (10 s of quiet for the events,
  // until the next command): a typed command, answered, ends it.
  await page.evaluate(() => window.__wc!.app.input.focus());
  await page.keyboard.type('look');
  await page.keyboard.press('Enter');
  await expect.poll(() => game.sent.at(-1)).toBe('look');
  game.play(`A dark room.\r\n\r\n${PROMPT}`);
  // Past the 2 s gap, and nothing comes by itself.
  await page.waitForTimeout(2500);
  expect(polls()).toHaveLength(1);

  // A mood change in Char.Vitals.
  game.play(gmcp('Char.Vitals', { mood: 'aggressive' }), PROMPT);
  await expect.poll(() => polls().length, { timeout: 6000 }).toBe(2);
  game.play(answerPulse(pollNonce(polls()[1]!)!));
  await page.waitForTimeout(2500);
  expect(polls()).toHaveLength(2);

  // An affect's start line (the Timers hub's effect).
  game.play(`The draught burns down your throat, and a fiery feeling fills your limbs.\r\n\r\n${PROMPT}`);
  await expect.poll(() => polls().length, { timeout: 6000 }).toBe(3);
  game.play(answerPulse(pollNonce(polls()[2]!)!));
  await page.waitForTimeout(2500);
  expect(polls()).toHaveLength(3);
  // Hidden: no answer and no poll command in the game pane.
  await expect(page.locator('.wc-output')).not.toContainText('GoblinTown');
  await expect(page.locator('.wc-output')).not.toContainText(pollNonce(polls()[2]!)!);
  await expect(page.locator('.wc-output')).toContainText('The draught burns down your throat');
});
