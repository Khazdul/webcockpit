// The run log player and the Spotlights viewer on a phone and a tablet,
// for stage 55 (docs/stages/55-scrap-old-phone-layout.md, round 55c):
//
//   node scripts/player-shots.ts            every state
//   node scripts/player-shots.ts strip comm only these states
//
// Writes docs/stages/img/55-player-<state>.png (WC_SHOT_OUT=<dir> writes
// them elsewhere), with a 256-colour palette as scripts/phone-shots.ts.
//
// Starts the dev server on WC_SHOT_PORT (default 5188) unless one answers
// there already, and drives Chromium as a phone (device scale 2, mobile and
// touch, `?phone=1`) or as a tablet (`?tablet=phone`). Every shot starts
// from an empty browser profile. Nothing connects to MUME: the run log
// player is opened on the walk of tests/fixtures/map-demo.log followed by
// tests/fixtures/gmcp-demo.log (`__wc.openPlayerLogs`, two runs), and the
// Spotlights viewer on the demo backup's runs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, type Page, chromium } from '@playwright/test';
import { devServer } from './lib/dev-server.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.env.WC_SHOT_OUT ? `${process.env.WC_SHOT_OUT.replace(/\/+$/, '')}/` : `${ROOT}docs/stages/img/`;
const PORT = Number(process.env.WC_SHOT_PORT ?? 5188);
const BASE = `http://localhost:${PORT}`;
const SCALE = 2;

/** The owner's phone (Samsung S21), CSS px; and an iPad Air upright. */
const S21 = { width: 360, height: 800 };
const S21_LAND = { width: 800, height: 360 };
const TABLET = { width: 820, height: 1180 };

interface State {
  name: string;
  viewport: { width: number; height: number };
  /** The page's query (default `phone=1`). */
  query?: string;
  /** The viewer's own settings are Paper before the player opens (a log with no VIEW plays in them). */
  paper?: boolean;
  /** Brings the page (on the start page) to the state. */
  run(page: Page): Promise<void>;
}

/** Two frames: a relayout and what follows it. */
const settle = (page: Page): Promise<void> => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/** The run log player on the two fixtures, played to the end and paused there, the lens drawn. */
async function player(page: Page): Promise<void> {
  await page.evaluate(() => window.__wc!.openPlayerLogs(['map-demo.log', 'gmcp-demo.log'], 'Rasta'));
  await page.locator('.wc-player .wc-ph-layer').waitFor();
  await page.evaluate(() => {
    const e = (window.__wc as unknown as { shell: { playerHost: { engine: { pause(): void; seek(ms: number): void; duration: number } } } }).shell.playerHost.engine;
    e.pause();
    e.seek(e.duration);
  });
  await page.locator('.wc-player .wc-rows .wc-row').filter({ hasText: 'A crow caws somewhere to the north.' }).waitFor();
  const lens = page.locator('.wc-player .wc-ph-lens');
  if (await lens.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)) {
    await page
      .locator('.wc-player .wc-pane-map .wc-pane-content')
      .and(page.locator('[data-map-state="loaded"][data-map-located="1"][data-map-drawn-ms]'))
      .waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
  }
  await settle(page);
}

/** The demo backup's runs, restored into the page's run library. */
const demoRuns = (page: Page): Promise<void> =>
  page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });

/** The player at rest: the header, the rail and the markers have hidden after their delay; the bar stays. */
const rest = (page: Page): Promise<void> => page.locator('.wc-player-chrome[data-hidden]').waitFor({ timeout: 12_000 });

const sat = (page: Page, key: string) => page.locator(`.wc-player .wc-ph-sat[data-sat="${key}"]:visible`);

const STATES: State[] = [
  { name: 'closed', viewport: S21, run: player },
  {
    name: 'strip',
    viewport: S21,
    run: async (page) => {
      await player(page);
      await sat(page, 'panes').tap();
      await page.locator('.wc-player .wc-pane[data-phone-strip]').first().waitFor();
      await rest(page);
    },
  },
  {
    name: 'comm',
    viewport: S21,
    run: async (page) => {
      await player(page);
      await sat(page, 'comm').tap();
      await page.locator('.wc-player .wc-pane[data-pane="comm"]').waitFor();
      await rest(page);
    },
  },
  {
    name: 'display',
    viewport: S21,
    run: async (page) => {
      await player(page);
      await page.locator('.wc-player-box [data-act="display"]').tap();
      await page.locator('.wc-pc-pop[data-pop="display"]').waitFor();
    },
  },
  {
    name: 'land',
    viewport: S21_LAND,
    run: async (page) => {
      await player(page);
      await sat(page, 'panes').tap();
      await sat(page, 'comm').tap();
      await page.locator('.wc-player .wc-pane[data-pane="comm"]').waitFor();
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'tablet',
    viewport: TABLET,
    query: 'tablet=phone',
    run: async (page) => {
      await player(page);
      await sat(page, 'panes').tap();
      await sat(page, 'comm').tap();
      await page.locator('.wc-player .wc-pane[data-pane="comm"]').waitFor();
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'paper',
    viewport: S21,
    paper: true,
    run: async (page) => {
      await player(page);
      await sat(page, 'panes').tap();
      await page.locator('.wc-player .wc-pane[data-phone-strip]').first().waitFor();
      await rest(page);
    },
  },
  {
    // The owner's own way in: History, a run's card, Run log; the player in History's box.
    name: 'history',
    viewport: S21,
    run: async (page) => {
      await demoRuns(page);
      await page.locator('.wc-start .wc-sm-item[data-key="history"]').tap();
      const rows = page.locator('.wc-start .wc-frame:not([hidden]) .wc-hist .wc-lk-tr');
      await rows.nth(1).tap();
      await page.locator('.wc-start .wc-frame:not([hidden]) .wc-hist .wc-hist-card [data-btn="RUN LOG"]').tap();
      await page.locator('.wc-player .wc-ph-layer').waitFor();
      await page.waitForTimeout(2500);
      await page.locator('.wc-player-box [data-act="play"]').tap();
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'spotlights',
    viewport: S21,
    run: async (page) => {
      await demoRuns(page);
      await page.locator('.wc-start .wc-sm-item[data-key="spotlights"]').tap();
      await page.locator('.wc-start .wc-frame:not([hidden]) .wc-spw .wc-spw-card').nth(1).tap();
      await page.locator('.wc-spv .wc-output').filter({ hasText: 'Achievement unlocked' }).waitFor({ timeout: 20_000 });
      await page.locator('.wc-spv .wc-spv-ctl [data-act="play"]').tap();
      await page.waitForTimeout(600);
    },
  },
];

function shrink(file: string): void {
  try {
    // No dither: the flat grounds (black, paper) keep their exact colour; a dither tints them.
    execFileSync('magick', [file, '-dither', 'None', '-colors', '256', '-define', 'png:compression-level=9', `PNG8:${file}`], { stdio: 'ignore' });
  } catch {
    // No ImageMagick here: the full-colour file is kept.
  }
}

async function shoot(browser: Browser, state: State): Promise<void> {
  const file = `${OUT}55-player-${state.name}.png`;
  const ctx = await browser.newContext({ viewport: state.viewport, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, baseURL: BASE });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn(`  page error: ${e.message}`));
  try {
    // The demo backup's runs are kept only near their own dates (tests/e2e/demo-clock.ts).
    await page.clock.setSystemTime(new Date(2026, 8, 28, 12, 0, 0));
    await page.goto(`/?${state.query ?? 'phone=1'}`);
    await page.locator('.wc-start .wc-sm-item.is-sel').waitFor();
    if (state.paper) {
      const { PAPER_PALETTE } = await import('../src/theme/presets.ts');
      await page.evaluate((ansi) => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000', ansi } }), [...PAPER_PALETTE]);
    }
    await state.run(page);
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    await page.screenshot({ path: file });
    shrink(file);
    console.log(`  ${file.slice(OUT.length)}  ${(statSync(file).size / 1024).toFixed(0)} kB`);
  } finally {
    await ctx.close();
  }
}

/**
 * A fresh dev server optimises its dependencies on the first page load and
 * then reloads the page: load once and let it settle before any shot.
 */
async function warmUp(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: S21, isMobile: true, hasTouch: true, baseURL: BASE });
  const page = await ctx.newPage();
  try {
    await page.goto('/?phone=1');
    await page.locator('.wc-start .wc-sm-item.is-sel').waitFor();
    await page.waitForTimeout(3000);
  } finally {
    await ctx.close();
  }
}

const want = process.argv.slice(2);
const states = want.length > 0 ? STATES.filter((s) => want.includes(s.name)) : STATES;
if (states.length === 0) throw new Error(`no such state; known: ${STATES.map((s) => s.name).join(', ')}`);
mkdirSync(OUT, { recursive: true });
const server = await devServer(PORT);
const browser = await chromium.launch();
try {
  await warmUp(browser);
  for (const s of states) await shoot(browser, s);
} finally {
  await browser.close();
  server?.kill();
}
