// The README screenshots (docs/img/), reproducible:
//
//   npm run screenshots                 every shot
//   npm run screenshots -- hero map     only these
//
// WC_SHOT_OUT=<dir> writes the PNGs there instead of docs/img/.
//
// Starts the dev server on WC_SHOT_PORT (default 5188) unless one answers
// there already, and drives Chromium at 1600×900 CSS px, device scale 2
// (3200×1800 PNG). Every shot starts from an empty browser profile (the
// new-player defaults, ADR 0092). The gameplay shots log in through a
// mocked MUME WebSocket (as tests/e2e/live-mock.spec.ts does: nothing
// reaches the real server) that plays a feed built from the repository's
// fixtures (tests/fixtures/*.log, invented names); the weather is pinned
// with the dev hook `__weather` (src/weather/dev.ts). `exporteditor` also
// writes htmlplayer.png: it records a run through the mocked connection,
// edits it in the Export Editor (ADR 0115, stage 43d), exports the HTML
// replay (H, then O) and opens the file. The start-menu pages are driven as
// tests/e2e does (look.ts, history-page, scripts-page). The snow shots run in Firefox (see there). The
// `discord-*` shots are for the 0.2.0 release post (WC_SHOT_OUT them
// elsewhere); some restore the demo runs (tests/fixtures/runs-demo.jsonl.gz)
// with the page's clock pinned, as tests/e2e/demo-clock.ts does. The feed,
// the mocked login and the weather helpers live in scripts/lib/mume-feed.ts
// (shared with the presentation film, video/).
import { devServer } from './lib/dev-server.ts';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Browser, type BrowserContext, type Locator, type Page, chromium, firefox as firefoxType } from '@playwright/test';
import { DAY, type Fight, NIGHT, type Pin, SCENE, gameFeed, jump, live, pinGameMoment, sleep, startMenu, weather } from './lib/mume-feed.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** Output directory (WC_SHOT_OUT, default docs/img/), with a trailing slash. */
const OUT = process.env.WC_SHOT_OUT ? `${process.env.WC_SHOT_OUT.replace(/\/+$/, '')}/` : `${ROOT}docs/img/`;
const PORT = Number(process.env.WC_SHOT_PORT ?? 5188);
const BASE = `http://localhost:${PORT}`;
const VIEWPORT = { width: 1600, height: 900 };
const SCALE = 2;
/** Where the exported replay is saved for the htmlplayer shot. */
const TMP = `${mkdtempSync(`${tmpdir()}/wc-shots-`)}/`;

/** The scripts shot's user script: a trigger, a timer and a small pane. */
const KILL_COUNTER = `-- @name     killcounter
-- @summary  Counts your kills, in a small pane
-- @api      1
-- @setting  every number 10 "Minutes between the summaries in the game text (0: none)"
-- @help     Counts the monsters you and your group kill, shows the count and
-- @help     the last one in a pane, and sums up now and then.

local pane = createPane{id = "main", title = "Kills", dock = "right", rows = 3, cols = 30}
local kills, last = 0, "nothing yet"

local function draw()
  pane:clear()
  pane:setLine(1, " Kills: <yellow>" .. kills .. "<reset>")
  pane:setLine(2, " Last:  " .. last)
end

-- "An orc is dead! R.I.P." -- players show as *Name* and are skipped.
tempRegexTrigger("^([^*].*) is dead! R\\\\.I\\\\.P\\\\.$", function()
  kills = kills + 1
  last = matches[2]
  draw()
end)

-- A summary in the game text every few minutes.
if settings.every > 0 then
  tempTimer(settings.every * 60, function()
    cecho("<green>Kills so far: " .. kills .. "<reset>")
  end, true)
end

draw()
`;

/**
 * Firefox, launched on first use. It drops a context's deviceScaleFactor on
 * the cross-origin isolated app page, so the ratio comes from a pref
 * (as tests/e2e/dpr.ts does).
 */
let ff: Promise<Browser> | null = null;
const firefox = (): Promise<Browser> => (ff ??= firefoxType.launch({ firefoxUserPrefs: { 'layout.css.devPixelsPerPx': String(SCALE) } }));

// ------------------------------------------------------------ pages

/** The start surface's visible frame (the top of its stack). */
const startTop = (page: Page): Locator => page.locator('.wc-start .wc-frame:not([hidden])');

/** Waits until no layout B morph runs on the start surface (as tests/e2e/look.ts `morphDone`). */
async function morphDone(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector('.wc-start')?.hasAttribute('data-lk-morph'));
  await page.locator('.wc-lk-morph').waitFor({ state: 'hidden' });
}

async function newPage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, baseURL: BASE });
  await pinGameMoment(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn(`  page error: ${e.message}`));
  return { ctx, page };
}

async function shot(page: Page, name: string, png?: Buffer): Promise<void> {
  const file = `${OUT}${name}.png`;
  if (png) writeFileSync(file, png);
  else await page.screenshot({ path: file });
  console.log(`  ${name}.png  ${(statSync(file).size / 1024 / 1024).toFixed(2)} MB`);
}

// ------------------------------------------------------------ shots

type Shot = (browser: Browser) => Promise<void>;

/**
 * The gameplay feed in the default layout, the weather pinned to `pin`
 * (called with now, for the clock-driven values), then `then` before the
 * screenshot (which may return the screenshot it took).
 */
async function gameplay(
  browser: Browser,
  name: string,
  pin: (now: number) => Pin,
  then: (page: Page) => Promise<void | Buffer>,
  o: { prepare?: (page: Page) => Promise<void>; fight?: Fight; clock?: number } = {},
): Promise<void> {
  const { ctx, page } = await newPage(browser);
  if (o.clock !== undefined) await page.clock.setSystemTime(o.clock);
  await live(page, gameFeed(o.fight), o.prepare);
  await weather(page);
  await jump(page, { ...SCENE, ...pin(Date.now()) });
  const png = await then(page);
  await shot(page, name, png ?? undefined);
  await ctx.close();
}

/** The share of near-white pixels in the open sky between the text and the dock (a lightning bolt there), measured in the page. */
async function brightShare(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const x = Math.round(img.width * 0.5), w = Math.round(img.width * 0.25), h = Math.round(img.height * 0.6);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.drawImage(img, x, 0, w, h, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i]! > 225 && d[i + 1]! > 225 && d[i + 2]! > 225) n++;
    return n / (w * h);
  }, png.toString('base64'));
}

// ------------------------------------------------------------ helpers

/** The demo backup's runs (tests/fixtures/runs-demo.jsonl.gz) restored into the library. */
async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__wc !== undefined);
  await page.evaluate(async () => {
    const lib = await window.__wc!.runs();
    await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
}

/**
 * The day after the demo backup (as tests/e2e/demo-clock.ts): its unsaved
 * runs are past the 14-day retention by the real date.
 */
const DEMO_NOW = new Date(2026, 8, 28, 12, 0, 0).getTime();
/**
 * Ten minutes after the demo's Rasta session ended (its last run's
 * `endedUs`): a run of Rasta started then joins that session's chain.
 */
const AFTER_RASTA = 1_790_454_872_856 + 10 * 60_000;

/** The start page of a fresh profile with the demo runs restored, the page's clock at `clock`. */
async function demoStart(browser: Browser, clock = DEMO_NOW): Promise<{ ctx: BrowserContext; page: Page }> {
  const { ctx, page } = await newPage(browser);
  await page.clock.setSystemTime(clock);
  await page.goto('/');
  await startMenu(page);
  await restoreDemo(page);
  return { ctx, page };
}

/** Clicks a start-menu item and waits for its page to land. */
async function menuRow(page: Page, key: string): Promise<void> {
  await page.locator(`.wc-start .wc-sm-item[data-key="${key}"]`).click();
  await morphDone(page);
}

/** History (stage 45, ADR 0130): its page, once its sessions have loaded. */
async function history(page: Page): Promise<Locator> {
  await menuRow(page, 'history');
  const h = startTop(page).locator('.wc-hist');
  await h.locator('.wc-lk-tr').first().waitFor();
  return h;
}

/** The best of `tries` lightning strikes (the most near-white sky), `gap` ms apart. */
async function brightestStrike(page: Page, tries: number, gap = 3000): Promise<Buffer> {
  let best: { png: Buffer; lit: number } | null = null;
  for (let i = 0; i < tries; i++) {
    await page.evaluate(() => window.__weather!.emit('strike'));
    await sleep(120);
    const png = await page.screenshot();
    const lit = await brightShare(page, png);
    if (!best || lit > best.lit) best = { png, lit };
    await sleep(gap);
  }
  return best!.png;
}

/** Opens a menu-bar popup or window (`panes`, `settings`, `scripts`, …), then rests the pointer away from the bar. */
async function barOpen(page: Page, id: string): Promise<void> {
  await page.locator(`.wc-mb[data-mb="${id}"]`).click();
  await page.mouse.move(VIEWPORT.width * 0.3, VIEWPORT.height * 0.3);
}

/** The menu bar's Settings popup on its Weather effects tab. */
async function weatherTab(page: Page): Promise<void> {
  await barOpen(page, 'settings');
  await page.locator('.wc-ck-tab[data-tab="weather"]').click();
  await page.locator('.wc-sp-page[data-page="weather"]').waitFor();
  await page.mouse.move(VIEWPORT.width * 0.3, VIEWPORT.height * 0.3);
}

/**
 * A run recorded in this session (the gameplay feed with the whole fight,
 * through the mocked connection), History → EXPORT: a stretch of channel
 * talk excluded, a comment where the ruffian arrives and a selection in the
 * fight below it, the panel beside the log. With `player`, H exports the
 * HTML replay and the file is opened from disk for that shot too.
 */
async function exportEditor(browser: Browser, name: string, player?: string): Promise<void> {
  const { ctx, page } = await newPage(browser);
  const server = await live(page, gameFeed('full'));
  await weather(page);
  await jump(page, { ...SCENE, ...DAY, weather: ' ' });
  // The server ends the connection: the run is sealed when the session leaves `playing`.
  await sleep(1000);
  await server.close();
  await page.waitForFunction(() => !/^playing/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''));
  await sleep(1500);
  await page.goto('/');
  await startMenu(page);
  const h = await history(page);
  await page.keyboard.press('Home');
  await h.locator('.wc-lk-btn[data-btn="EXPORT"]').click();
  await morphDone(page);
  const f = startTop(page);
  await f.locator('.wc-exp-row').first().waitFor();
  const cur = (text: string) => f.locator('.wc-exp-row.is-cur', { hasText: text });
  const downTo = async (text: string): Promise<void> => {
    for (let i = 0; i < 600 && !(await cur(text).count()); i++) await page.keyboard.press('ArrowDown');
    if (!(await cur(text).count())) throw new Error(`export editor: no line "${text}"`);
  };
  // Gibur's last tell excluded with its prompts (Shift+↓ selects, X excludes).
  await downTo("Gibur tells you 'more coming, 2 trolls'");
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('x');
  // A comment before the ruffian's arrival.
  await downTo('A half-orc ruffian arrives');
  await page.keyboard.press('c');
  await page.keyboard.type('The ruffian shows up: watch the merc rescue Dori.');
  await page.keyboard.press('Enter');
  // A selection in the fight below it, scrolled up to the middle of the log.
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowDown');
  const log = (await f.locator('.wc-exp-log').boundingBox())!;
  await page.mouse.move(log.x + log.width / 2, log.y + log.height / 2);
  await page.mouse.wheel(0, log.height * 0.3);
  await sleep(300);
  // On a whole row, so no line is cut at the top.
  await f.locator('.wc-exp-log').evaluate((el) => {
    // The first line the top edge cuts, moved down to the edge (rows sit below an 8 px pad, comments are taller).
    const top = el.getBoundingClientRect().top + el.clientTop;
    const cut = [...el.querySelectorAll('.wc-exp-ln')].find((l) => {
      const r = l.getBoundingClientRect();
      return r.top < top - 0.5 && r.bottom > top + 0.5;
    });
    if (cut) el.scrollTop -= top - cut.getBoundingClientRect().top;
  });
  await page.mouse.move(5, VIEWPORT.height - 5);
  await sleep(800);
  await shot(page, name);
  if (!player) return ctx.close();

  // H chooses the HTML replay (the default), O exports it; the file is opened from disk.
  await page.keyboard.press('Escape'); // the selection goes; the export takes the whole log either way
  await page.keyboard.press('h');
  const download = page.waitForEvent('download');
  await page.keyboard.press('o');
  const file = `${TMP}replay.html`;
  await (await download).saveAs(file);
  await ctx.close();

  const { ctx: c2, page: p2 } = await newPage(browser);
  await p2.goto(pathToFileURL(file).href);
  // Seek to the fight (src/replay/main.ts exposes `__wcReplay`), then play on a little.
  const engine = 'window.__wcReplay.host.engine';
  await p2.waitForFunction(`!!${engine} && ${engine}.duration > 0`);
  await p2.evaluate(`${engine}.seek(${engine}.duration * 0.93)`);
  await p2.waitForFunction(`!${engine}.seeking`);
  await p2.evaluate(`${engine}.play()`);
  await sleep(2500);
  await shot(p2, player);
  await c2.close();
}

const SHOTS: Record<string, Shot> = {
  // A sunset by the clock under a clear sky: the shot 20 s before the night begins (the turn runs over the
  // 60 s before it), when the warm glow and its rays are strongest. Tried: -52 … -3 s, sunrises, light clouds.
  hero: (b) => gameplay(b, 'hero', (now) => ({ ...DAY, weather: ' ', sunU: 0.97, nightAt: now + 23_000 }), () => sleep(3000)),
  // A clear night, the full moon past the middle of its way (by the clock).
  'weather-night': (b) =>
    gameplay(b, 'weather-night', (now) => ({ ...NIGHT, weather: ' ', moonUp: true, moonPhase: 1, moonRiseAt: now - 450_000, moonSetAt: now + 295_000 }), () => sleep(5000)),
  // Heavy rain by day during a fight, caught during a lightning strike: the brightest of a few tries.
  'weather-rain': (b) =>
    gameplay(b, 'weather-rain', () => ({ ...DAY, weather: '"' }), async (page) => {
      await sleep(8000);
      return brightestStrike(page, 4);
    }, { fight: 'mid' }),
  // Snow by day, built up on the pane tops (at the game's pace). Firefox: its worker canvases draw the
  // far snow layers as dots; headless Chromium's pattern fills showed few of them.
  'weather-snow': async () => gameplay(await firefox(), 'weather-snow', () => ({ ...DAY, weather: '*' }), () => sleep(90_000)),
  // Dense fog by day.
  'weather-fog': (b) => gameplay(b, 'weather-fog', () => ({ ...DAY, weather: '~', fog: '=' }), () => sleep(20_000)),

  // The start page of a new install.
  async startpage(browser) {
    const { ctx, page } = await newPage(browser);
    await page.goto('/');
    await startMenu(page);
    await sleep(2500);
    await shot(page, 'startpage');
    await ctx.close();
  },

  // The menu bar's Settings popup (Appearance tab) over the game, on a starry night.
  appearance: (b) =>
    gameplay(b, 'appearance', () => ({ ...NIGHT, weather: ' ', moonUp: false }), async (page) => {
      await sleep(2000);
      await page.locator('.wc-mb[data-mb="settings"]').click();
      await page.locator('.wc-sp-settings .wc-sp-page[data-page="appearance"]').waitFor();
      // No hover glow on the icon in the picture.
      await page.mouse.move(10, 10);
      await sleep(800);
    }),

  // A wider right dock (the game text keeps its 80 columns) with a taller map, the mouse resting on a room: the hover box.
  map: (b) =>
    gameplay(
      b,
      'map',
      () => ({ ...DAY, weather: ' ' }),
      async (page) => {
        await sleep(1500);
        const box = (await page.locator('.wc-pane[data-pane="map"]').boundingBox())!;
        // A room west of the player (the map is centred on him); the box shows after the pointer rests 3 s.
        const hover = page.locator('.wc-map-hover');
        for (let i = 0; i < 4 && !(await hover.isVisible()); i++) {
          await page.mouse.move(box.x + box.width / 2 - 70 - i * 3, box.y + box.height / 2 + 4, { steps: 5 });
          await hover.waitFor({ timeout: 6000 }).catch(() => {});
        }
        await hover.waitFor({ timeout: 1000 });
        await sleep(500);
      },
      {
        prepare: (page) =>
          page.evaluate(() => {
            const s = window.__wc!.settings;
            const layout = structuredClone(s.get().layout);
            for (const lane of layout.docks.right.lanes) lane.size = 38;
            for (const p of layout.docks.right.head) if (p.id === 'map') p.desired = 400;
            s.update({ layout });
          }),
      },
    ),

  // A new user script (KILL_COUNTER) in the editor, a call being typed: the completion list and its help.
  async scripts(browser) {
    const { ctx, page } = await newPage(browser);
    await page.goto('/');
    await startMenu(page);
    await page.evaluate(async (src) => {
      const lib = window.__wc!.shell.scripts as unknown as {
        init(): Promise<void>;
        create(n: string, s: string): Promise<unknown>;
        setEnabled(n: string, on: boolean): Promise<unknown>;
      };
      await lib.init();
      await lib.create('killcounter', src);
      // On: the editor's state line reads "● on · runs when you enter MUME", not "○ off".
      await lib.setEnabled('killcounter', true);
    }, KILL_COUNTER);
    await menuRow(page, 'scripts');
    const f = startTop(page);
    // Select it in the list, then EDIT in its panel (the Scripts page, stage 44).
    await f.locator('.wc-scr-row[data-name="killcounter"] .wc-scr-name').click();
    await f.locator('.wc-scr-panel [data-btn="EDIT"]').click();
    const ed = page.locator('.wc-frame:not([hidden]) > .wc-sed');
    await ed.locator('.cm-content').waitFor();
    await morphDone(page);
    // A new line after the trigger, a call being typed (high enough for the help panel to fit).
    await ed.locator('.cm-line', { hasText: /^end\)$/ }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('tempT', { delay: 60 });
    await page.locator('.cm-tooltip-autocomplete').waitFor();
    await sleep(800);
    await shot(page, 'scripts');
    await ctx.close();
  },

  exporteditor: (b) => exportEditor(b, 'exporteditor', 'htmlplayer'),

  // ---------------------------------------------------- the 0.2.0 release post (`discord-*`)

  // A thunderstorm at night during the fight: heavy rain, the brightest of several strikes.
  'discord-storm': (b) =>
    gameplay(b, 'discord-storm', () => ({ ...NIGHT, weather: '"', moonUp: false }), async (page) => {
      await sleep(8000);
      return brightestStrike(page, 8);
    }, { fight: 'mid' }),

  // Snow by day, well built up on the pane tops (Firefox, as weather-snow), the Panes popup open.
  'discord-snow-panes': async () =>
    gameplay(await firefox(), 'discord-snow-panes', () => ({ ...DAY, weather: '*' }), async (page) => {
      // The build-ups 4× faster: 90 s show about six minutes of snow on the pane tops.
      await page.evaluate(() => window.__weather!.setSpeed(4));
      await sleep(90_000);
      await barOpen(page, 'panes');
      await page.locator('.wc-pop-row').first().waitFor();
      await sleep(800);
    }),

  // The Settings popup on its Weather effects tab over a sunset (20 s before the night, as hero).
  'discord-settings': (b) => {
    let nightAt = 0;
    return gameplay(b, 'discord-settings', (now) => ({ ...DAY, weather: ' ', sunU: 0.97, nightAt: (nightAt = now + 26_000) }), async (page) => {
      await sleep(1500);
      await weatherTab(page);
      await sleep(Math.max(500, nightAt - 20_000 - Date.now()));
    });
  },
  // The same over a clear night, the full moon up (as weather-night).
  'discord-settings-night': (b) =>
    gameplay(
      b,
      'discord-settings-night',
      (now) => ({ ...NIGHT, weather: ' ', moonUp: true, moonPhase: 1, moonRiseAt: now - 450_000, moonSetAt: now + 295_000 }),
      async (page) => {
        await sleep(3000);
        await weatherTab(page);
        await sleep(2000);
      },
    ),

  // The Statistics pane over the game in light rain: Rasta's run joins his demo session (restored
  // first, the page's clock ten minutes after it), so the chain has its kills, PvP and achievements.
  // The fight stops before the feed's own level-up (level 26 beside the demo's 42 reads oddly).
  'discord-statistics': (b) =>
    gameplay(b, 'discord-statistics', () => ({ ...DAY, weather: "'", fog: '-' }), async (page) => {
      await barOpen(page, 'panes');
      await page.locator('.wc-pop-row[data-pane="statistics"]').click();
      await page.keyboard.press('Escape');
      await page.locator('.wc-pane[data-pane="statistics"] .wc-stats-pane[data-layout="wide"]').waitFor();
      await page.mouse.move(5, VIEWPORT.height * 0.5);
      await sleep(6000);
    }, { fight: 'mid', clock: AFTER_RASTA, prepare: restoreDemo }),

  // Start page → Spotlights (stage 46, ADR 0131): the wall's first card, Rasta's death, plays in the
  // viewer; the shot when the death line is in.
  async 'discord-spotlights'(browser) {
    const { ctx, page } = await demoStart(browser);
    await menuRow(page, 'spotlights');
    await startTop(page).locator('.wc-spw .wc-spw-card.is-on').waitFor();
    await page.keyboard.press('Enter');
    await page.locator('.wc-spv .wc-output', { hasText: 'You are dead!' }).waitFor({ timeout: 30_000 });
    await sleep(1500);
    await page.mouse.move(VIEWPORT.width * 0.3, VIEWPORT.height * 0.4, { steps: 4 });
    await sleep(700);
    await shot(page, 'discord-spotlights');
    await ctx.close();
  },

  // History → the Rasta session → RUN LOG, at the level-up of run 1; the box with its Panes popup,
  // where Timers (empty in the demo) has just been switched off.
  async 'discord-runlog'(browser) {
    const { ctx, page } = await demoStart(browser);
    const h = await history(page);
    await h.locator('.wc-lk-tr').nth(2).waitFor();
    await page.keyboard.press('ArrowDown');
    await h.locator('.wc-lk-tr.is-on', { hasText: 'Rasta' }).waitFor();
    await h.locator('.wc-lk-btn[data-btn="RUN LOG"]').click();
    // The in-app player's engine (as tests/e2e/player.spec.ts reads it).
    const engine = 'window.__wc.shell.playerHost.engine';
    await page.waitForFunction('window.__wc.shell.playerHost?.engine?.duration > 0');
    await page.evaluate(`${engine}.seek(${engine}.duration * 0.6)`);
    await page.waitForFunction(`!${engine}.seeking`);
    await sleep(3000);
    const box = page.locator('.wc-player-chrome .wc-player-box');
    await page.mouse.move(VIEWPORT.width * 0.4, VIEWPORT.height * 0.5, { steps: 4 });
    await box.locator('[data-act="panes"]').click();
    await box.locator('.wc-pc-pop[data-pop="panes"] [data-pane="timers"]').click();
    await page.mouse.move(VIEWPORT.width * 0.4, VIEWPORT.height * 0.5, { steps: 4 });
    await sleep(1000);
    // Played on until the top line is short (the header line sits over it).
    await page
      .waitForFunction(
        () => {
          const out = document.querySelector('.wc-player .wc-output');
          if (!out) return false;
          const top = out.getBoundingClientRect().top;
          const row = [...out.querySelectorAll('.wc-row')].find((r) => r.getBoundingClientRect().bottom > top + 2);
          return (row?.textContent ?? '').trim().length < 12;
        },
        undefined,
        { timeout: 10_000, polling: 50 },
      )
      .catch(() => {});
    await shot(page, 'discord-runlog');
    await ctx.close();
  },

  'discord-export-editor': (b) => exportEditor(b, 'discord-export-editor'),

  // The pointer on the Group pane in fog and light rain: its Colour, Border and Background buttons.
  'discord-pane-hover': (b) =>
    gameplay(b, 'discord-pane-hover', () => ({ ...DAY, weather: "'", fog: '=' }), async (page) => {
      await sleep(15_000);
      const g = (await page.locator('.wc-pane[data-pane="group"]').boundingBox())!;
      await page.mouse.move(g.x + g.width * 0.6, g.y + g.height * 0.6, { steps: 5 });
      await page.locator('.wc-pane[data-pane="group"] .wc-pane-btn').first().waitFor();
      await sleep(800);
    }),

  // The Scripts window over a moonlit night, left of the dock: the kill counter script (on) in the
  // list with its help, its Kills pane in the dock.
  'discord-scripts-window': (b) =>
    gameplay(
      b,
      'discord-scripts-window',
      (now) => ({ ...NIGHT, weather: ' ', moonUp: true, moonPhase: 1, moonRiseAt: now - 450_000, moonSetAt: now + 295_000 }),
      async (page) => {
        await sleep(3000);
        await barOpen(page, 'scripts');
        const row = page.locator('.wc-win[data-win="scripts"] .wc-scr-row[data-name="killcounter"]').first();
        await row.waitFor();
        for (let i = 0; i < 8 && !(await row.evaluate((el) => el.classList.contains('is-on'))); i++) {
          await page.keyboard.press('ArrowDown');
        }
        await page.mouse.move(VIEWPORT.width * 0.3, VIEWPORT.height * 0.03);
        await sleep(1500);
      },
      {
        fight: 'full',
        prepare: (page) =>
          page.evaluate(async (src) => {
            const wc = window.__wc!;
            // A place left of the dock, in cells.
            wc.settings.update({ windows: { profile: null, scripts: { x: 3, y: 3, w: 104, h: 30 } } });
            const lib = wc.shell.scripts as unknown as {
              init(): Promise<void>;
              create(n: string, s: string): Promise<unknown>;
              setEnabled(n: string, on: boolean): Promise<unknown>;
            };
            await lib.init();
            await lib.create('killcounter', src);
            await lib.setEnabled('killcounter', true);
          }, KILL_COUNTER),
      },
    ),
};

// ------------------------------------------------------------ main

const wanted = process.argv.slice(2);
for (const w of wanted) if (!(w in SHOTS)) throw new Error(`unknown shot ${w}; known: ${Object.keys(SHOTS).join(' ')}`);
mkdirSync(OUT, { recursive: true });
const server = await devServer(PORT);
const browser = await chromium.launch();
const failed: string[] = [];
try {
  for (const [name, run] of Object.entries(SHOTS)) {
    if (wanted.length && !wanted.includes(name)) continue;
    console.log(name);
    try {
      await run(browser);
    } catch (err) {
      failed.push(name);
      console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
} finally {
  await browser.close();
  rmSync(TMP, { recursive: true, force: true });
  const f = ff as Promise<Browser> | null;
  if (f) await (await f).close();
  server?.kill();
}
if (failed.length) {
  console.error(`failed: ${failed.join(' ')}`);
  process.exitCode = 1;
}
