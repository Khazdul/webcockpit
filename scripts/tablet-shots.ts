// The tablet trial's screenshots (stage 54, notes/research/tablet/trial.md):
// the phone's game layout with our own keyboard, unchanged, on a tablet-size
// screen (`?tablet=phone`, src/core/device.ts), and today's tablet (the
// desktop cockpit, `?touch=1`) beside it.
//
//   node scripts/tablet-trial-shots.ts              every state, both orientations
//   node scripts/tablet-trial-shots.ts rest menu    only these states
//
// Writes notes/research/tablet/trial-shots/<state>-<portrait|landscape>.png
// and measures.json (the px sizes of the main parts in each shot). Starts the
// dev server on WC_SHOT_PORT (default 5189) unless one answers there, and
// drives Chromium as an iPad (10th generation): 820 × 1180 CSS px, device
// scale 2, mobile and touch. Nothing connects to MUME (the fixtures are
// replayed, or sent down a mocked socket). A throwaway of the trial, as the
// flag is.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, type Page, chromium } from '@playwright/test';
import { devServer } from './lib/dev-server.ts';
import { GMCP, IAC, WILL, fixture, gmcpBytes, toSteps } from './lib/mume-feed.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}notes/research/tablet/trial-shots/`;
const PORT = Number(process.env.WC_SHOT_PORT ?? 5189);
const BASE = `http://localhost:${PORT}`;
const SIZES = { portrait: { width: 820, height: 1180 }, landscape: { width: 1180, height: 820 } } as const;
const FIXTURE = 'gmcp-demo.log';
const WALK = 'map-demo.log';
const TRIAL = 'tablet=phone';

interface State {
  name: string;
  /** How the page opens: the offline cockpit (default), the start page, or a mocked connection. */
  open?: 'start' | 'live';
  /** The page's query in place of the trial flag (today's tablet). */
  query?: string;
  run(page: Page): Promise<void>;
}

const settle = (page: Page): Promise<void> => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/** Replays the walk and the GMCP demo in the offline cockpit, and waits for the map where there is a lens. */
async function play(page: Page, lens = true): Promise<void> {
  await page.evaluate(
    async ({ rel, walk }) => {
      const text = await (await fetch(`/__fixtures/${rel}`)).text();
      const before = await (await fetch(`/__fixtures/${walk}`)).text();
      window.__wc!.app.startReplay(before.replace(/\n?$/, '\n') + text, rel, 0);
    },
    { rel: FIXTURE, walk: WALK },
  );
  await page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' }).waitFor();
  if (lens) {
    await page
      .locator('.wc-ph-lens')
      .waitFor({ state: 'visible', timeout: 2500 })
      .catch(() => {});
  }
  await page
    .locator('.wc-pane-map .wc-pane-content')
    .and(page.locator('[data-map-state="loaded"][data-map-located="1"][data-map-drawn-ms]'))
    .waitFor({ timeout: 30_000 })
    .catch(() => console.warn('  the map was not drawn'));
  await page.waitForTimeout(2500);
}

/** A mocked MUME: the walk, the demo and a fight sent down the socket at once (Comm has chats and a reply line). */
async function live(page: Page): Promise<void> {
  const feed = Buffer.concat([
    ...toSteps(fixture(WALK)).flatMap((st) => ('out' in st ? [st.out] : [])),
    ...toSteps(fixture(FIXTURE)).flatMap((st) => ('out' in st ? [st.out] : [])),
    gmcpBytes('Char.Vitals {"position":"fighting","opponent":"an orc scout","buffer":"Rasta","opponent-hits":"wounded","buffer-hits":"fine"}'),
  ]);
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.onMessage((m) => {
      if (Buffer.from(m).includes('Core.Ping')) ws.send(gmcpBytes('Core.Ping'));
    });
    ws.send(Buffer.from([IAC, WILL, GMCP]));
    ws.send(feed);
  });
  await page.goto(`/?${TRIAL}`);
  await page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label').waitFor();
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad').waitFor();
  await page.locator('.wc-rows .wc-row').filter({ hasText: 'A crow caws somewhere to the north.' }).waitFor();
  await page.locator('.wc-start').waitFor({ state: 'hidden', timeout: 20_000 });
  await page.waitForTimeout(2500);
}

const okbKey = (page: Page, k: string) => page.locator(k.length === 1 ? `.wc-ph-okb-k[data-ch="${k}"]` : `.wc-ph-okb-k[data-act="${k}"]`);

const STATES: State[] = [
  { name: 'rest', run: (page) => play(page) },
  {
    name: 'keyboard',
    run: async (page) => {
      await play(page);
      await page.locator('.wc-input-slot .wc-input-field').tap();
      await page.locator('.wc-ph-okb').waitFor();
      for (const k of ['k', 'i', 'l', 'l', 'space', 'o', 'r', 'c']) await okbKey(page, k).tap();
      await page.waitForTimeout(2500);
    },
  },
  {
    name: 'strip',
    run: async (page) => {
      await play(page);
      await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
      await page.locator('.wc-pane[data-phone-strip]').first().waitFor();
      await page.waitForTimeout(2500);
    },
  },
  {
    // The strip's second page (Group), by a swipe to the left.
    name: 'strip-group',
    run: async (page) => {
      await play(page);
      await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
      await page.locator('.wc-pane[data-pane="timers"][data-phone-strip]').waitFor();
      const box = (await page.locator('.wc-ph-strip').boundingBox())!;
      const y = box.y + box.height / 2;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y, id: 0 }] });
      for (const x of [250, 200, 150]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 0 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.locator('.wc-pane[data-pane="group"][data-phone-strip]').waitFor();
      await page.waitForTimeout(2500);
    },
  },
  {
    name: 'comm',
    open: 'live',
    run: async (page) => {
      await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
      await page.locator('.wc-pane[data-pane="comm"]').waitFor();
      await page.locator('.wc-pane[data-pane="comm"] .wc-cm-ent[aria-label^="Gibur"]').tap();
      await page.locator('.wc-pane[data-pane="comm"] .wc-cm-rinput').waitFor();
      await page.waitForTimeout(2500);
    },
  },
  {
    name: 'comm-keyboard',
    open: 'live',
    run: async (page) => {
      await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
      await page.locator('.wc-pane[data-pane="comm"] .wc-cm-ent[aria-label^="Gibur"]').tap();
      await page.locator('.wc-pane[data-pane="comm"] .wc-cm-rinput').tap();
      await page.locator('.wc-ph-okb').waitFor();
      for (const k of ['h', 'e', 'j']) await okbKey(page, k).tap();
      await page.waitForTimeout(2500);
    },
  },
  {
    name: 'menu',
    run: async (page) => {
      await play(page);
      await page.locator('.wc-ph-menu').tap();
      await page.locator('.wc-ph-sheet').waitFor();
      await page.waitForTimeout(1200);
    },
  },
  {
    name: 'settings',
    run: async (page) => {
      await play(page);
      await page.locator('.wc-ph-menu').tap();
      await page.locator('.wc-ph-sheet .wc-ph-row[data-row="settings"]').tap();
      await page.locator('.wc-ph-page').waitFor();
      await page.waitForTimeout(1200);
    },
  },
  { name: 'start', open: 'start', run: (page) => page.waitForTimeout(2500) },
  {
    // Profile → a profile → Rename: a field of a start-menu page with the page keyboard up.
    name: 'start-profile-keyboard',
    open: 'start',
    run: async (page) => {
      await page.evaluate(async () => {
        await window.__wc!.shell.profiles.init();
        await window.__wc!.shell.profiles.create('gimli', '');
      });
      const f = page.locator('.wc-start .wc-frame:not([hidden])');
      await f.locator('.wc-sm-item[data-key="profile"]').tap();
      const row = f.locator('.wc-pl-row[data-name="gimli"]');
      await row.tap();
      await row.locator('[data-btn="RENAME"]').tap();
      await page.locator('.wc-okb-page .wc-ph-okb').waitFor();
      for (const k of ['back', 'back', 'back', 'back', 'back', 'shift', 'g', 'l', 'o', 'i', 'n']) {
        await page.locator(k.length === 1 ? `.wc-okb-page .wc-ph-okb-k[data-ch="${k}"]` : `.wc-okb-page .wc-ph-okb-k[data-act="${k}"]`).tap();
      }
      await page.waitForTimeout(2500);
    },
  },
  {
    // Scripts → New: the look kit's name dialog with the page keyboard up.
    name: 'start-script-keyboard',
    open: 'start',
    run: async (page) => {
      await page.evaluate(() => window.__wc!.shell.scripts!.init());
      const f = page.locator('.wc-start .wc-frame:not([hidden])');
      await f.locator('.wc-sm-item[data-key="scripts"]').tap();
      await f.locator('[data-btn="NEW"]').tap();
      await page.locator('.wc-lk-dialog[data-dlg="new"] input').waitFor();
      await page.locator('.wc-okb-page .wc-ph-okb').waitFor();
      for (const k of ['v', 'a', 'r', 'n']) await page.locator(`.wc-okb-page .wc-ph-okb-k[data-ch="${k}"]`).tap();
      await page.waitForTimeout(2500);
    },
  },
  // Today's tablet, for comparison: touch but not phone, the desktop cockpit.
  { name: 'today-rest', query: 'touch=1', run: (page) => play(page, false) },
];

/** The px boxes of the main parts on the page (null: not there or not shown). */
async function measure(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const box = (sel: string): { x: number; y: number; w: number; h: number } | null => {
      const els = [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => e.getClientRects().length > 0);
      const el = els[0];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const cockpit = window.__wc?.app?.cockpit as unknown as { phoneGameLayout?: Record<string, unknown> | null } | undefined;
    const g = cockpit?.phoneGameLayout ?? null;
    const row = document.querySelector<HTMLElement>('.wc-rows .wc-row');
    return {
      window: { w: innerWidth, h: innerHeight },
      classes: document.documentElement.className,
      phoneGame: document.querySelector('.wc-cockpit[data-phone-game]') !== null,
      layout: g && { cols: g.cols, rows: g.rows, landscape: g.landscape, game: g.game, input: g.input, strip: g.strip, comm: g.comm, side: g.side, lens: g.lens, lensPx: g.lensPx, lensHidden: g.lensHidden, bottom: g.bottom, tooSmall: g.tooSmall },
      rowHeight: row ? Math.round(row.getBoundingClientRect().height * 100) / 100 : null,
      fontSize: row ? getComputedStyle(row).fontSize : null,
      text: box('.wc-rows'),
      input: box('.wc-input-slot .wc-input-field'),
      lens: box('.wc-ph-lens'),
      lensGlass: box('.wc-ph-lens-glass'),
      compass: box('.wc-ph-pad'),
      compassKey: box('.wc-ph-pad button'),
      hotkeys: box('.wc-ph-hks') ?? box('.wc-ph-hk'),
      hotkey: box('.wc-ph-hk'),
      menuButton: box('.wc-ph-menu'),
      sat: box('.wc-ph-sat'),
      keyboard: box('.wc-ph-okb'),
      key: box('.wc-ph-okb-k[data-ch="k"]'),
      space: box('.wc-ph-okb-k[data-act="space"]'),
      strip: box('.wc-pane[data-phone-strip]'),
      comm: box('.wc-pane[data-pane="comm"]'),
      sheet: box('.wc-ph-sheet'),
      page: box('.wc-ph-page'),
      startFrame: box('.wc-start .wc-frame:not([hidden])'),
      startMenuItem: box('.wc-start .wc-sm-item'),
    };
  });
}

/** The PNG with a 256-colour palette (ImageMagick, where it is installed), as scripts/phone-shots.ts. */
function shrink(file: string): void {
  try {
    execFileSync('magick', [file, '-dither', 'None', '-colors', '256', '-define', 'png:compression-level=9', `PNG8:${file}`], { stdio: 'ignore' });
  } catch {
    // No ImageMagick here: the full-colour file is kept.
  }
}

async function shoot(browser: Browser, state: State, orient: keyof typeof SIZES): Promise<Record<string, unknown>> {
  const ctx = await browser.newContext({ viewport: SIZES[orient], deviceScaleFactor: 2, isMobile: true, hasTouch: true, baseURL: BASE });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const query = state.query ?? TRIAL;
    if (state.open === 'live') await live(page);
    else if (state.open === 'start') {
      await page.goto(`/?${query}`);
      await page.locator('.wc-start .wc-sm-item.is-sel').waitFor();
    } else {
      await page.goto(`/?replay&${query}`);
      await page.locator(state.query ? '.wc-cockpit' : '.wc-cockpit[data-phone-game] .wc-ph-pad').waitFor();
    }
    await state.run(page);
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    const file = `${OUT}${state.name}-${orient}.png`;
    await page.screenshot({ path: file });
    shrink(file);
    console.log(`  ${state.name}-${orient}.png`);
    return { ...(await measure(page)), pageErrors: errors };
  } finally {
    await ctx.close();
  }
}

/** A fresh dev server optimises its dependencies on the first load and then reloads the page: load once first. */
async function warmUp(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: SIZES.portrait, isMobile: true, hasTouch: true, baseURL: BASE });
  const page = await ctx.newPage();
  try {
    await page.goto(`/?replay&${TRIAL}`);
    await page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad').waitFor();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad').waitFor();
  } finally {
    await ctx.close();
  }
}

const wanted = process.argv.slice(2);
for (const w of wanted) if (!STATES.some((s) => s.name === w)) throw new Error(`unknown state ${w}; known: ${STATES.map((s) => s.name).join(' ')}`);
const states = STATES.filter((s) => wanted.length === 0 || wanted.includes(s.name));

mkdirSync(OUT, { recursive: true });
const server = await devServer(PORT);
const browser = await chromium.launch();
const measures: Record<string, unknown> = {};
const failed: string[] = [];
try {
  await warmUp(browser);
  for (const state of states) {
    for (const orient of ['portrait', 'landscape'] as const) {
      try {
        measures[`${state.name}-${orient}`] = await shoot(browser, state, orient);
      } catch (err) {
        failed.push(`${state.name}-${orient}`);
        console.warn(`  ${state.name}-${orient} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
} finally {
  await browser.close();
  server?.kill();
}
// A run of some states keeps the other states' numbers.
const file = `${OUT}measures.json`;
const before: Record<string, unknown> = wanted.length > 0 && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
writeFileSync(file, `${JSON.stringify({ ...before, ...measures }, null, 1)}\n`);
if (failed.length) {
  console.error(`failed: ${failed.join(', ')}`);
  process.exit(1);
}
