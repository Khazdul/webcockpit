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
// there already, and drives Chromium as a phone: 390 × 844 CSS px, device
// scale 3, mobile and touch, `?phone=1`. Every shot starts from an empty
// browser profile (a new phone's defaults, ADR 0081). Nothing connects to
// MUME: the states are played from tests/fixtures/gmcp-demo.log in the
// offline cockpit (`?replay`), cut where the state is (a fight is shown by
// replaying the log up to a line inside its fight, never by faking DOM).
//
// A later step adds its states to STATES with its own letter; a run for a
// step takes every state built by then.
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, type Page, chromium } from '@playwright/test';
import { devServer } from './lib/dev-server.ts';
import { PAPER_PALETTE } from '../src/theme/presets.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.env.WC_SHOT_OUT ? `${process.env.WC_SHOT_OUT.replace(/\/+$/, '')}/` : `${ROOT}docs/stages/img/`;
const PORT = Number(process.env.WC_SHOT_PORT ?? 5188);
const BASE = `http://localhost:${PORT}`;
const VIEWPORT = { width: 390, height: 844 };
const SCALE = 3;
/** The on-screen keyboard's height in the mockup (P6). */
const KEYBOARD_PX = 300;
const FIXTURE = 'gmcp-demo.log';

/** Lines of the fixture a state is cut before (the first line holding the text). */
const CUT = {
  /** Mid-fight, you tank: just before the mercenary's rescue. */
  fight: 'Group.Update {"id":3,"hp":61}',
} as const;

interface State {
  name: string;
  /** The step that built it (`a` … `g`). */
  step: string;
  /** Brings the opened cockpit to the state. */
  run(page: Page): Promise<void>;
}

/** Replays the fixture in the offline cockpit, whole or up to the line before `cut`. */
async function play(page: Page, cut?: string): Promise<void> {
  await page.evaluate(
    async ({ rel, cut }) => {
      let text = await (await fetch(`/__fixtures/${rel}`)).text();
      if (cut !== undefined) {
        const lines = text.split('\n');
        const at = lines.findIndex((l) => l.includes(cut));
        if (at < 0) throw new Error(`the fixture has no line with ${cut}`);
        text = lines.slice(0, at).join('\n') + '\n';
      }
      window.__wc!.app.startReplay(text, rel, 0);
    },
    { rel: FIXTURE, cut },
  );
  await page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' }).waitFor();
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
];

/** Paper: the background, ink and its palette, as the Appearance settings set them. */
const paper = (page: Page): Promise<void> =>
  page.evaluate((ansi) => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000', ansi } }), [...PAPER_PALETTE]);

async function shoot(browser: Browser, state: State, file: string, light: boolean): Promise<void> {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, baseURL: BASE });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn(`  page error: ${e.message}`));
  try {
    await page.goto('/?replay&phone=1');
    await page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad').waitFor();
    if (light) await paper(page);
    await state.run(page);
    await page.evaluate(() => document.fonts.ready);
    // Two frames: the cockpit's relayout, then its paint.
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    // The page must still be the one the state was built on (no reload in between).
    if ((await page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad').count()) !== 1) throw new Error('the page reloaded');
    await page.screenshot({ path: file });
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
