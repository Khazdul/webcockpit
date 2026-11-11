// The phone layout's screenshots for stage 51 (docs/stages/51-phone-layout.md):
//
//   node scripts/phone-shots.ts 51a              every state built by step 51a
//   node scripts/phone-shots.ts 51a fighting     only these states
//
// Writes docs/stages/img/51-<step>-<state>.png (dark) and
// docs/stages/img/51-<step>-<state>-paper.png (Paper), where <step> is the
// step's letter (`51a` → `a`). WC_SHOT_OUT=<dir> writes them elsewhere.
//
// Starts the dev server on WC_SHOT_PORT (default 5188) unless one answers
// there already, and drives Chromium as a phone: 390 × 844 CSS px (a state
// may name another size), device scale 2, mobile and touch, `?phone=1`.
// The files are written with a 256-colour palette (`shrink`) to keep the
// set small. Every shot starts from an empty
// browser profile (a new phone's defaults, ADR 0081). Nothing connects to
// MUME: the states are played from tests/fixtures/gmcp-demo.log in the
// offline cockpit (`?replay`), cut where the state is (a fight is shown by
// replaying the log up to a line inside its fight, never by faking DOM).
//
// A later step adds its states to STATES with its own letter; a run for a
// step takes every state built by then.
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, type Page, chromium } from '@playwright/test';
import { devServer } from './lib/dev-server.ts';
import { GMCP, IAC, WILL, fixture, gmcpBytes, toSteps } from './lib/mume-feed.ts';
import { PAPER_PALETTE } from '../src/theme/presets.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.env.WC_SHOT_OUT ? `${process.env.WC_SHOT_OUT.replace(/\/+$/, '')}/` : `${ROOT}docs/stages/img/`;
const PORT = Number(process.env.WC_SHOT_PORT ?? 5188);
const BASE = `http://localhost:${PORT}`;
const VIEWPORT = { width: 390, height: 844 };
/**
 * Device scale 2: at 3 the set was some 15 MB a step; at 2 the text and the
 * 1 px hairlines are still sharp and the files are less than half the size.
 */
const SCALE = 2;
/** The on-screen keyboard's height in the mockup (P6). */
const KEYBOARD_PX = 300;
const FIXTURE = 'gmcp-demo.log';
/** A walk with map positions, played before the fixture (see `play`). */
const WALK = 'map-demo.log';

/** Lines of the fixture a state is cut before (the first line holding the text). */
const CUT = {
  /** Mid-fight, you tank: just before the mercenary's rescue. */
  fight: 'Group.Update {"id":3,"hp":61}',
} as const;

interface State {
  name: string;
  /**
   * The state needs a connection (Comm's reply line is not shown in a
   * replay): the page enters MUME against a mocked WebSocket that plays the
   * fixtures (`live`), instead of the offline cockpit.
   */
  live?: boolean;
  /** The step that built it (`a` … `g`). */
  step: string;
  /** Another screen than 390 × 844 (landscape, a narrow phone). */
  viewport?: { width: number; height: number };
  /** Brings the opened cockpit to the state. */
  run(page: Page): Promise<void>;
}

/**
 * Replays the fixture in the offline cockpit, whole or up to the line
 * before `cut`. The walk of tests/fixtures/map-demo.log (Bree to Hill Road,
 * with its Room.Info) is played first in the same replay, so the map lens
 * has a place to show; then the lens is waited for (the map loaded, the
 * player's room found, the frame drawn).
 */
async function play(page: Page, cut?: string): Promise<void> {
  await page.evaluate(
    async ({ rel, walk, cut }) => {
      let text = await (await fetch(`/__fixtures/${rel}`)).text();
      if (cut !== undefined) {
        const lines = text.split('\n');
        const at = lines.findIndex((l) => l.includes(cut));
        if (at < 0) throw new Error(`the fixture has no line with ${cut}`);
        text = lines.slice(0, at).join('\n') + '\n';
      }
      const before = await (await fetch(`/__fixtures/${walk}`)).text();
      window.__wc!.app.startReplay(before.replace(/\n?$/, '\n') + text, rel, 0);
    },
    { rel: FIXTURE, walk: WALK, cut },
  );
  await page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' }).waitFor();
  // (Not where the lens has no room, landscape: the map is not drawn there.)
  if (!(await page.evaluate(() => window.__wc!.settings.get().phone.lens.show))) return;
  const shown = await page.locator('.wc-ph-lens').waitFor({ state: 'visible', timeout: 2500 }).then(
    () => true,
    () => false,
  );
  if (shown) await lensDrawn(page);
}

/** The lens shows the player's room: the map loaded, the room located, the frame with its tiles drawn. */
async function lensDrawn(page: Page): Promise<void> {
  const map = page.locator('.wc-pane-map .wc-pane-content');
  await map.and(page.locator('[data-map-state="loaded"][data-map-located="1"][data-map-drawn-ms]')).waitFor({ timeout: 30_000 });
  // The tiles come in over a few frames after the first drawn one.
  await page.waitForTimeout(1500);
}

/**
 * A mocked MUME for the `live` states: the walk and the GMCP demo sent
 * down the socket at once (nothing reaches the real server), then a fight
 * (the demo's own ends before its tells), so Comm has chats and the fight
 * card shows. Returns once the last line is on screen.
 */
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
  await page.goto('/?phone=1');
  await page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label').waitFor();
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad').waitFor();
  await page.locator('.wc-rows .wc-row').filter({ hasText: 'A crow caws somewhere to the north.' }).waitFor();
  await page.locator('.wc-ph-fight').waitFor();
  // The start page has left (it fades away over the cockpit).
  await page.locator('.wc-start').waitFor({ state: 'hidden', timeout: 20_000 });
}

/** Opens Comm on the chat with `name` (the rail's entry). */
async function openChat(page: Page, name: string): Promise<void> {
  await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
  await page.locator('.wc-pane[data-pane="comm"]').waitFor();
  await page.locator(`.wc-pane[data-pane="comm"] .wc-cm-ent[aria-label^="${name}"]`).tap();
  await page.locator('.wc-pane[data-pane="comm"] .wc-cm-rinput').waitFor();
}

/** The on-screen keyboard comes up: the visible area shrinks, as the app detects it (phone-viewport.ts). */
async function keyboardUp(page: Page): Promise<void> {
  await page.setViewportSize({ width: VIEWPORT.width, height: VIEWPORT.height - KEYBOARD_PX });
  await page.locator('html.wc-kbd').waitFor();
}

const STATES: State[] = [
  {
    name: 'fighting',
    step: 'a',
    run: async (page) => {
      await play(page, CUT.fight);
      await page.locator('.wc-ph-fight').waitFor();
    },
  },
  { name: 'walking', step: 'a', run: (page) => play(page) },
  {
    name: 'keyboard',
    step: 'a',
    run: async (page) => {
      await play(page, CUT.fight);
      await page.locator('.wc-ph-fight').waitFor();
      await page.locator('.wc-input-field').tap();
      await keyboardUp(page);
      await page.keyboard.type('kill scout');
    },
  },
  {
    name: 'menu',
    step: 'b',
    run: async (page) => {
      await play(page, CUT.fight);
      await page.locator('.wc-ph-fight').waitFor();
      await page.locator('.wc-ph-menu').tap();
      await page.locator('.wc-ph-sheet').waitFor();
    },
  },
  {
    name: 'lens-near',
    step: 'c',
    run: async (page) => {
      await play(page);
      // Middle → far → near.
      await page.locator('.wc-ph-lens-glass').tap();
      await page.locator('.wc-ph-lens-glass').tap();
      await page.locator('.wc-ph-lens[data-level="near"]').waitFor();
      // Headless Chromium draws the map in software: the frame of the new zoom can be seconds late.
      await page.waitForTimeout(4000);
    },
  },
  {
    name: 'lens-far',
    step: 'c',
    run: async (page) => {
      await play(page);
      await page.locator('.wc-ph-lens-glass').tap();
      await page.locator('.wc-ph-lens[data-level="far"]').waitFor();
      await page.waitForTimeout(4000);
    },
  },
  {
    name: 'lens-off',
    step: 'c',
    run: async (page) => {
      await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { show: false } } }));
      await play(page, CUT.fight);
      await page.locator('.wc-ph-fight').waitFor();
      await page.locator('.wc-ph-lens').waitFor({ state: 'hidden' });
    },
  },
  {
    name: 'strip',
    step: 'd',
    run: async (page) => {
      await play(page, CUT.fight);
      await page.locator('.wc-ph-fight').waitFor();
      await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
      await page.locator('.wc-pane[data-pane="timers"][data-phone-strip]').waitFor();
      await page.waitForTimeout(1500);
    },
  },
  {
    name: 'strip-group',
    step: 'd',
    run: async (page) => {
      await play(page, CUT.fight);
      await page.locator('.wc-ph-fight').waitFor();
      await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
      await page.locator('.wc-pane[data-pane="timers"][data-phone-strip]').waitFor();
      // A swipe to the left: the next page.
      const box = (await page.locator('.wc-ph-strip').boundingBox())!;
      const y = box.y + box.height / 2;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y, id: 0 }] });
      for (const x of [250, 200, 150]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 0 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.locator('.wc-pane[data-pane="group"][data-phone-strip]').waitFor();
      await page.waitForTimeout(1500);
    },
  },
  {
    name: 'comm',
    step: 'd',
    live: true,
    run: async (page) => {
      await openChat(page, 'Gibur');
      await page.waitForTimeout(500);
    },
  },
  {
    name: 'comm-keyboard',
    step: 'd',
    live: true,
    run: async (page) => {
      await openChat(page, 'Gibur');
      await page.locator('.wc-pane[data-pane="comm"] .wc-cm-rinput').tap();
      await keyboardUp(page);
      await page.keyboard.type('on my way');
      await page.waitForTimeout(500);
    },
  },
  {
    // The hot key box, open on K3 (the mockup's P5): a hold on the key.
    name: 'rebind',
    step: 'e',
    run: async (page) => {
      await play(page, CUT.fight);
      const key = page.locator('.wc-ph-hk[data-hk="2"]');
      await key.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', button: 0, clientX: 0, clientY: 0, bubbles: true });
      await page.locator('.wc-ph-rb').waitFor();
    },
  },
  {
    name: 'settings',
    step: 'b',
    run: async (page) => {
      await play(page);
      await page.locator('.wc-ph-menu').tap();
      await page.locator('.wc-ph-sheet .wc-ph-row[data-row="settings"]').tap();
      await page.locator('.wc-ph-page').waitFor();
    },
  },
  {
    // The strip's other two built-in pages (Timers and Group are `strip` and `strip-group`).
    name: 'strip-character',
    step: 'g',
    run: async (page) => {
      await play(page, CUT.fight);
      await page.keyboard.press('Control+3');
      await page.locator('.wc-pane[data-pane="character"][data-phone-strip]').waitFor();
      await page.waitForTimeout(1000);
    },
  },
  {
    name: 'strip-statistics',
    step: 'g',
    run: async (page) => {
      await play(page);
      await page.keyboard.press('Control+4');
      await page.locator('.wc-pane[data-pane="statistics"][data-phone-strip]').waitFor();
      await page.waitForTimeout(1000);
    },
  },
  {
    // The settings page's font list (a pick row's own page).
    name: 'settings-font',
    step: 'g',
    run: async (page) => {
      await play(page);
      await page.locator('.wc-ph-menu').tap();
      await page.locator('.wc-ph-sheet .wc-ph-row[data-row="settings"]').tap();
      await page.locator('.wc-ph-page [data-row="font"]').tap();
      await page.locator('.wc-ph-page[data-page="pick:font"]').waitFor();
    },
  },
  {
    // The link dropped: the sheet with Reconnect lit (the status line says so).
    name: 'menu-dropped',
    step: 'g',
    live: true,
    run: async (page) => {
      await page.evaluate(() => window.__wc!.app.session.disconnect('connection lost'));
      await page.locator('.wc-ph-sheet [data-row="reconnect"].is-lit').waitFor();
    },
  },
  {
    // Comm at a password prompt: the reply line disabled.
    name: 'comm-disabled',
    step: 'g',
    live: true,
    run: async (page) => {
      await openChat(page, 'Gibur');
      await page.evaluate(() => window.__wc!.app.bus.emit('telnet.echo', { serverEchoes: true }));
      await page.locator('.wc-pane[data-pane="comm"] .wc-cm-rinput:disabled').waitFor();
    },
  },
  {
    // The hot key box refusing a line of two commands.
    name: 'rebind-error',
    step: 'g',
    run: async (page) => {
      await play(page, CUT.fight);
      const key = page.locator('.wc-ph-hk[data-hk="1"]');
      await key.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', button: 0, clientX: 0, clientY: 0, bubbles: true });
      await page.locator('.wc-ph-rb').waitFor();
      await page.locator('#wc-ph-rb-command').fill('stand;bash');
      await page.locator('.wc-ph-rb .wc-ph-bt.is-go').tap();
      await page.locator('.wc-ph-rb-err').waitFor();
    },
  },
  {
    // Letters too large for the screen: the notice, and the second menu key over it.
    name: 'too-small',
    step: 'g',
    run: async (page) => {
      await play(page);
      await page.evaluate(() => window.__wc!.settings.update({ appearance: { size: 32 } }));
      await page.locator('.wc-cockpit[data-too-small] > .wc-ph-menu-rescue').waitFor();
    },
  },
  {
    name: 'landscape',
    step: 'g',
    viewport: { width: 844, height: 390 },
    run: async (page) => {
      await play(page, CUT.fight);
      await page.locator('.wc-ph-fight').waitFor();
    },
  },
  {
    name: 'w360',
    step: 'g',
    viewport: { width: 360, height: 740 },
    run: async (page) => {
      await play(page, CUT.fight);
      await page.locator('.wc-ph-fight').waitFor();
      // (The map's frame can be late in headless Chromium, as in the lens states.)
      await page.waitForTimeout(3000);
    },
  },
  {
    // The settings page scrolled to its end: Comm and Connection (the page no longer fits one screen).
    name: 'settings-end',
    step: 'f',
    run: async (page) => {
      await play(page);
      await page.locator('.wc-ph-menu').tap();
      await page.locator('.wc-ph-sheet .wc-ph-row[data-row="settings"]').tap();
      await page.locator('.wc-ph-page').waitFor();
      await page.locator('.wc-ph-page [data-group="connection"]').evaluate((el) => el.scrollIntoView({ block: 'end' }));
    },
  },
  {
    // Weather on (ADR 0136 §11): rain by day with a little fog, pinned as the weather specs pin a
    // state, the build-up run fast; the effects reach the left edge (no left band here).
    name: 'weather',
    step: 'f',
    run: async (page) => {
      await play(page, CUT.fight);
      await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true } }));
      await page.locator('.wc-cockpit[data-weather]').waitFor();
      await page.waitForFunction(() => !!window.__wc!.app.weather?.controller);
      await page.evaluate(async () => {
        const c = window.__wc!.app.weather!.controller!;
        await c.engine.ready;
        c.engine.setSpeed(40);
        c.pin({ weather: '"', fog: '-', clock: 'day', sunU: 0.5 });
      });
      await page.waitForTimeout(6000);
    },
  },
];

/** Paper: the background, ink and its palette, as the Appearance settings set them. */
const paper = (page: Page): Promise<void> =>
  page.evaluate((ansi) => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000', ansi } }), [...PAPER_PALETTE]);

/**
 * The PNG with a 256-colour palette (ImageMagick, where it is installed):
 * about 40 % of the size, the text as sharp; only the soft gradients (the
 * lens's glow, the weather) show a little banding. Without ImageMagick the
 * file stays as Chromium wrote it.
 */
function shrink(file: string): void {
  try {
    // No dither: the flat grounds (black, paper) keep their exact colour; a dither tints them.
    execFileSync('magick', [file, '-dither', 'None', '-colors', '256', '-define', 'png:compression-level=9', `PNG8:${file}`], { stdio: 'ignore' });
  } catch {
    // No ImageMagick here: the full-colour file is kept.
  }
}

async function shoot(browser: Browser, state: State, file: string, light: boolean): Promise<void> {
  const ctx = await browser.newContext({ viewport: state.viewport ?? VIEWPORT, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, baseURL: BASE });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn(`  page error: ${e.message}`));
  try {
    if (state.live) await live(page);
    else {
      await page.goto('/?replay&phone=1');
      await page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad').waitFor();
    }
    if (light) await paper(page);
    await state.run(page);
    await page.evaluate(() => document.fonts.ready);
    // Two frames: the cockpit's relayout, then its paint.
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    // The page must still be the one the state was built on (no reload in between).
    if ((await page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad').count()) !== 1) throw new Error('the page reloaded');
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
  const ctx = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true, baseURL: BASE });
  const page = await ctx.newPage();
  try {
    await page.goto('/?replay&phone=1');
    await page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad').waitFor();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad').waitFor();
  } finally {
    await ctx.close();
  }
}

const [stepArg, ...wanted] = process.argv.slice(2);
const step = /^(?:51)?([a-g])$/.exec(stepArg ?? '')?.[1];
if (!step) throw new Error('usage: node scripts/phone-shots.ts <step, e.g. 51a> [state …]');
for (const w of wanted) if (!STATES.some((s) => s.name === w)) throw new Error(`unknown state ${w}; known: ${STATES.map((s) => s.name).join(' ')}`);
const states = STATES.filter((s) => s.step <= step && (wanted.length === 0 || wanted.includes(s.name)));

mkdirSync(OUT, { recursive: true });
const server = await devServer(PORT);
const browser = await chromium.launch();
const failed: string[] = [];
try {
  await warmUp(browser);
  for (const state of states) {
    console.log(state.name);
    for (const light of [false, true]) {
      const file = `${OUT}51-${step}-${state.name}${light ? '-paper' : ''}.png`;
      try {
        await shoot(browser, state, file, light);
      } catch (err) {
        failed.push(`${state.name}${light ? ' (paper)' : ''}`);
        console.warn(`  failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
} finally {
  await browser.close();
  server?.kill();
}
if (failed.length) {
  console.error(`failed: ${failed.join(', ')}`);
  process.exit(1);
}
