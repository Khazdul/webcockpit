// The phone's and the tablet's screenshots of stage 80 part F (looks:
// the picker page, the crop step, tokens in the lens and in Group, the
// Character settings' Look group), for the owner to judge
// (docs/stages/80-character-tokens.md, the test guide):
//
//   node scripts/looks-shots.ts                 every state
//   node scripts/looks-shots.ts lib crop        only these states
//
// Writes docs/stages/img/80-f-<device>-<state>[-land][-paper].png, where
// <device> is `phone` (390 × 844, `?phone=1`, as scripts/phone-shots.ts)
// or `tablet` (820 × 1180, an iPad with no flag, as scripts/tablet-shots.ts),
// each upright and on its side. Device scale 2 (the tablet 1, to keep the
// files small), mobile and touch, a
// 256-colour palette. Starts the dev server on WC_SHOT_PORT (default 5190)
// unless one answers there. Nothing connects to MUME: the map walk and the
// GMCP demo are replayed in the offline cockpit.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, type Page, chromium } from '@playwright/test';
import { devServer } from './lib/dev-server.ts';
import { PAPER_PALETTE } from '../src/theme/presets.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}docs/stages/img/`;
const FACE = `${ROOT}tests/fixtures/looks/face.png`;
const PORT = Number(process.env.WC_SHOT_PORT ?? 5190);
const BASE = `http://localhost:${PORT}`;
const DEVICES = {
  phone: { portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 }, query: '&phone=1' },
  tablet: { portrait: { width: 820, height: 1180 }, landscape: { width: 1180, height: 820 }, query: '' },
} as const;
type Device = keyof typeof DEVICES;
type Orient = 'portrait' | 'landscape';

interface State {
  name: string;
  /** The orientations taken (both by default). */
  orients?: readonly Orient[];
  devices?: readonly Device[];
  /** Also a Paper file (upright only). */
  paper?: boolean;
  /** The page in an account's space (the record only: My images' shelf). */
  account?: boolean;
  /** The strip's one page. */
  strip?: 'character' | 'group';
  /** Looks chosen for you and two members first (the Group and map states). */
  assign?: boolean;
  run(page: Page): Promise<void>;
}

const look = (page: Page) => page.locator('.wc-ph-menu-surface [data-page="look"]');
const settle = (page: Page): Promise<void> => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/** Your look and two members' (what a player would have chosen), so the tokens differ. */
async function assign(page: Page): Promise<void> {
  await page.evaluate(() => {
    const l = window.__wc!.app.looks!;
    l.choose('Rasta', { src: 'lib', id: 'human-m-rohirrim' }, true);
    l.choose('Dori', { src: 'lib', id: 'dwarf-m-warrior' });
    l.choose('Gibur', { src: 'lib', id: 'elf-m-noldor' });
  });
}

async function openStrip(page: Page): Promise<void> {
  await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
  await page.waitForTimeout(400);
}

async function openPicker(page: Page): Promise<void> {
  await openStrip(page);
  await page.locator('.wc-cockpit > .wc-pane-character[data-phone-strip] .wc-cc-disc').tap();
  await look(page).waitFor();
  await page.waitForTimeout(300);
}

const tab = (page: Page, id: string) => look(page).locator(`[role="tab"][data-tab="${id}"]`).tap();

/** Waits for the grid's pictures that are in view. */
async function pictures(page: Page): Promise<void> {
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('[data-page="look"] img')].every((i) => i.complete || i.getBoundingClientRect().top > innerHeight));
  await page.waitForTimeout(300);
}

const STATES: State[] = [
  {
    name: 'auto',
    paper: true,
    strip: 'character',
    async run(page) {
      await openPicker(page);
      await pictures(page);
    },
  },
  {
    name: 'lib',
    paper: true,
    strip: 'character',
    async run(page) {
      await openPicker(page);
      await tab(page, 'lib');
      await look(page).locator('.wc-looks-chip[data-chip="human"]').tap();
      await look(page).locator('.wc-looks-it[data-id="human-m-knight"]').tap();
      await look(page).locator('.wc-ph-col').evaluate((c) => (c.scrollTop = 0));
      await pictures(page);
    },
  },
  {
    name: 'lib-search',
    orients: ['portrait'],
    strip: 'character',
    async run(page) {
      await openPicker(page);
      await tab(page, 'lib');
      await look(page).locator('.wc-looks-chip[data-chip="elf"]').tap();
      await look(page).locator('.wc-looks-chip[data-chip="female"]').tap();
      // The search opens our keyboard.
      await look(page).locator('.wc-looks-search').tap();
      await page.waitForTimeout(400);
      for (const ch of 'mage') await page.locator(`.wc-okb-page .wc-ph-okb-k[data-ch="${ch}"]`).first().tap();
      await page.waitForTimeout(300);
      await pictures(page);
    },
  },
  {
    name: 'mine-login',
    orients: ['portrait'],
    strip: 'character',
    async run(page) {
      await openPicker(page);
      await tab(page, 'mine');
    },
  },
  {
    name: 'mine-shelf',
    account: true,
    orients: ['portrait'],
    strip: 'character',
    async run(page) {
      await openPicker(page);
      await tab(page, 'mine');
      await look(page).locator('.wc-looks-file').setInputFiles(FACE);
      await look(page).locator('[data-btn="CROP-SAVE"]').tap();
      await look(page).locator('.wc-looks-slot.is-full').waitFor();
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'crop',
    account: true,
    strip: 'character',
    async run(page) {
      await openPicker(page);
      await tab(page, 'mine');
      await look(page).locator('.wc-looks-file').setInputFiles(FACE);
      await look(page).locator('.wc-looks-croparea').waitFor();
      await look(page).locator('.wc-looks-zoomr').evaluate((el) => {
        (el as HTMLInputElement).value = '160';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await look(page).locator('.wc-looks-croparea').scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'member',
    assign: true,
    orients: ['portrait'],
    strip: 'group',
    async run(page) {
      await openStrip(page);
      await page.locator('.wc-cockpit > .wc-pane-group[data-phone-strip] .wc-gp-row[data-name="Dori"] button.wc-gp-tk').tap();
      await look(page).waitFor();
      // The Automatic tab: what Dori would be without your choice, the hint, Reset to automatic.
      await tab(page, 'auto');
      await pictures(page);
    },
  },
  {
    name: 'group',
    assign: true,
    paper: true,
    strip: 'group',
    async run(page) {
      await openStrip(page);
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'lens',
    assign: true,
    strip: 'group',
    async run(page) {
      // The closest level (the default): your token (the demo's members carry no map room, so
      // the fan and the arc are the desktop's map tests' to show).
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'settings-look',
    orients: ['portrait'],
    paper: true,
    strip: 'character',
    async run(page) {
      await page.evaluate(() => window.__wc!.app.onCommand('#settings'));
      const row = page.locator('.wc-ph-menu-surface [data-row="character-fetch"]');
      await row.scrollIntoViewIfNeeded();
      await row.tap();
      const g = page.locator('.wc-ph-page[data-page="sub:character"] [data-group="character-look"]');
      await g.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
    },
  },
];

async function play(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const walk = await (await fetch('/__fixtures/map-demo.log')).text();
    const text = await (await fetch('/__fixtures/gmcp-demo.log')).text();
    window.__wc!.app.startReplay(walk.replace(/\n?$/, '\n') + text, 'gmcp-demo.log', 0);
  });
  await page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' }).waitFor();
  await page
    .locator('.wc-pane-map .wc-pane-content')
    .and(page.locator('[data-map-state="loaded"][data-map-located="1"][data-map-drawn-ms]'))
    .waitFor({ timeout: 30_000 })
    .catch(() => console.warn('  the map was not drawn'));
  await page.waitForTimeout(1500);
}

function shrink(file: string): void {
  try {
    execFileSync('magick', [file, '-dither', 'None', '-colors', '256', '-define', 'png:compression-level=9', `PNG8:${file}`], { stdio: 'ignore' });
  } catch {
    // No ImageMagick here: the full-colour file is kept.
  }
}

async function shoot(browser: Browser, state: State, device: Device, orient: Orient, paper: boolean): Promise<void> {
  const d = DEVICES[device];
  const ctx = await browser.newContext({ viewport: d[orient], deviceScaleFactor: device === 'tablet' ? 1 : 2, isMobile: true, hasTouch: true, baseURL: BASE });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn(`  page error: ${e.message}`));
  try {
    if (state.account) await page.addInitScript(() => localStorage.setItem('wc.space', JSON.stringify({ nameKey: 'looksshots', state: 'open' })));
    await page.goto(`/?replay${d.query}`);
    await page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad').waitFor();
    await page.evaluate(
      ([strip, light, palette]) => {
        const s = window.__wc!.settings;
        s.update({ phone: { strip: { panes: s.get().phone.strip.panes.map((e) => ({ ...e, on: e.id === strip })) } } });
        if (light) s.update({ appearance: { bg: '#f4ecd8', fg: '#000000', ansi: [...palette] as never } });
      },
      [state.strip ?? 'character', paper, PAPER_PALETTE] as const,
    );
    if (state.assign) await assign(page);
    await play(page);
    await state.run(page);
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    const name = `80-f-${device}-${state.name}${orient === 'landscape' ? '-land' : ''}${paper ? '-paper' : ''}.png`;
    const file = `${OUT}${name}`;
    await page.screenshot({ path: file });
    shrink(file);
    console.log(`  ${name}`);
  } finally {
    await ctx.close();
  }
}

/** A fresh dev server optimises its dependencies on the first load and then reloads the page: load once first. */
async function warmUp(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: DEVICES.phone.portrait, isMobile: true, hasTouch: true, baseURL: BASE });
  const page = await ctx.newPage();
  try {
    await page.goto('/?replay&phone=1');
    await page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad').waitFor();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
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
const failed: string[] = [];
try {
  await warmUp(browser);
  for (const state of states) {
    for (const device of state.devices ?? (['phone', 'tablet'] as const)) {
      for (const orient of state.orients ?? (['portrait', 'landscape'] as const)) {
        for (const paper of state.paper && orient === 'portrait' && device === 'phone' ? [false, true] : [false]) {
          try {
            await shoot(browser, state, device, orient, paper);
          } catch (err) {
            failed.push(`${device}-${state.name}-${orient}${paper ? '-paper' : ''}`);
            console.warn(`  ${device} ${state.name} ${orient} failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
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
