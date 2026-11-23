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
  await expect(word(page, 'mood')).toHaveText(/^(aggressive|aggres\.|agg\.)$/);
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
  await expect(word(page, 'mood')).toHaveText(/^(aggressive|aggres\.|agg\.)$/);
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
  await expect(card(page).locator('.wc-cc-sv')).toHaveText(['81', '13', '85', '70']);
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

test('fight mode: Status, band bars, the swords; back to the tab afterwards', async ({ page }) => {
  const game = await play(page);
  await tab(page, 'lore').click();
  await expect(selected(page)).toHaveText('LORE');
  const left = await card(page).locator('.wc-cc-left').boundingBox();
  const bar = card(page).locator('.wc-cc-vital[data-kind="hp"] .wc-cc-trk');
  const before = (await bar.boundingBox())!;
  game.play(gmcp('Char.Vitals', { opponent: 'a troll', 'hp-string': 'Hurt' }));
  await expect(selected(page)).toHaveText('STATUS');
  await expect(card(page)).toHaveAttribute('data-fight', '');
  await expect(card(page).locator('[data-click="position"]')).toHaveAttribute('data-fight', '');
  await expect(card(page).locator('.wc-cc-vital[data-kind="hp"] .wc-cc-vn')).toHaveText('');
  await expect(card(page).locator('.wc-cc-vital[data-kind="hp"] .wc-cc-span')).toBeVisible();
  await expect(card(page)).not.toContainText(/hurt/i);
  expect((await bar.boundingBox())!.height).toBeGreaterThan(before.height);
  expect(await card(page).locator('.wc-cc-left').boundingBox()).toEqual(left);
  await tab(page, 'stats').click();
  await expect(selected(page)).toHaveText('STATS');
  game.play(gmcp('Char.Vitals', { opponent: null, hp: 150 }));
  await expect(selected(page)).toHaveText('LORE');
  await expect(card(page).locator('.wc-cc-vital[data-kind="hp"] .wc-cc-vn')).toHaveText('150');
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

// --------------------------------------------------------------- the sizes

/** Content boxes in cells: the minimum, a lane, the new player's, the phone's strip, wide and tall. */
const SIZES: readonly (readonly [number, number])[] = [
  [8, 3], [8, 18], [14, 5], [18, 3], [22, 20], [26, 10], [31, 3], [31, 9], [31, 26], [34, 5], [45, 9], [48, 9], [52, 3], [62, 11], [80, 4], [84, 22], [110, 14],
];

/** Whatever of the card is outside its box, over another part, or cut through. */
async function faults(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.wc-cc')!;
    const bad = new Set<string>();
    const shown = (e: Element): boolean => e.getClientRects().length > 0;
    const outer = root.getBoundingClientRect();
    const parts = [...root.children].filter(shown);
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
    await page.evaluate(({ font, size }) => window.__wc!.settings.update({ appearance: { font, size } }), { font, size });
    await page.evaluate(() => document.fonts.ready);
    const bad: string[] = [];
    for (const [cols, rows] of SIZES) {
      await place(page, cols, rows);
      for (const id of ['status', 'stats', 'lore'] as const) {
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
      for (const [cols, rows] of [[18, 3], [31, 3], [31, 9], [48, 9], [80, 4]] as const) {
        await place(page, cols, rows);
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
