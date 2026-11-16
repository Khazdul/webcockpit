// Stage 65, owner feedback rounds 2 and 3 (ADR 0155, "As built — feedback
// round 3, Back everywhere and the community's alignment"): a box's Back
// is drawn inside the lit window's inner border with air, never on the
// iron frame, in every mode; on a touch screen its finger-sized target is
// an invisible ::before grown upward over the frame only; it covers none
// of the page's own content (its text, its controls, the hood's title).
//
// The matrix: every start-menu page with a Back (Profile, Import, the
// profile editor, Scripts, the Script Manual, the script editor, History's
// three tabs, a session's Stats and Share, About, /privacy, Log in, Create
// account, Recovery, the Account page, Published logs, Community and the
// phone's All logs and Hall of Fame) and the watch page, in each mode:
//
//   desktop       a mouse (no touch), 1440 × 900 and 1280 × 800
//   desktop site  a phone in the browser's "Desktop site" mode: touch, a
//                 phone's screen, a ~980 px wide window; upright no phone
//                 flag (src/core/device.ts `desktopSite`), on its side
//                 (under 600 px high) the phone flag after all
//   phone         390 × 844 and 844 × 390, the phone flag
//   tablet        820 × 1180 and 1180 × 820 (the phone flag, 44 px targets)
//   tablet, desktop
//                 `?tablet=desktop`: touch only, the desktop cockpit
//
// Chromium only (Firefox has no mobile emulation). Nothing reaches MUME;
// the cloud is the account fake (cloud-account-fake.ts, `?cloudtest`).
// `WC_BACK_SHOTS=<dir>` writes a picture of each page's top left corner.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { NAME, PASSWORD, SKY } from './account-pages';
import { seedAccount } from './cloud-account-fake';
import { btnIn, columnsAligned, box as cyBox, logIn as cyLogIn, setUp as cySetUp } from './community';
import { pinDemoClock } from './demo-clock';
import { openWatch, setUp as watchSetUp, watchBox } from './watch-page';

const AIR = 4;

interface Mode {
  name: string;
  slug: string;
  viewport: { width: number; height: number };
  screen?: { width: number; height: number };
  touch: boolean;
  mobile: boolean;
  /** The query's flags (starts with `&`). */
  q: string;
  /** The touch target's height (0: a mouse, no target to check). */
  target: number;
  /** The phone flag is on (`html.wc-phone`): the phone's pages (Community's dashboard). */
  phone: boolean;
}

const MODES: Mode[] = [
  { name: 'desktop 1440 × 900', slug: 'desk-1440', viewport: { width: 1440, height: 900 }, touch: false, mobile: false, q: '', target: 0, phone: false },
  { name: 'desktop 1280 × 800', slug: 'desk-1280', viewport: { width: 1280, height: 800 }, touch: false, mobile: false, q: '', target: 0, phone: false },
  { name: 'desktop site on a phone, portrait', slug: 'dsite-port', viewport: { width: 980, height: 2120 }, screen: { width: 412, height: 915 }, touch: true, mobile: false, q: '', target: 40, phone: false },
  { name: 'desktop site on a phone, landscape', slug: 'dsite-land', viewport: { width: 980, height: 440 }, screen: { width: 915, height: 412 }, touch: true, mobile: false, q: '', target: 40, phone: true },
  { name: 'phone portrait', slug: 'phone-port', viewport: { width: 390, height: 844 }, touch: true, mobile: true, q: '&kbd=en', target: 40, phone: true },
  { name: 'phone landscape', slug: 'phone-land', viewport: { width: 844, height: 390 }, touch: true, mobile: true, q: '&kbd=en', target: 40, phone: true },
  { name: 'tablet portrait', slug: 'tab-port', viewport: { width: 820, height: 1180 }, touch: true, mobile: true, q: '&kbd=en', target: 44, phone: true },
  { name: 'tablet landscape', slug: 'tab-land', viewport: { width: 1180, height: 820 }, touch: true, mobile: true, q: '&kbd=en', target: 44, phone: true },
  { name: 'tablet on the desktop cockpit, portrait', slug: 'tabdesk-port', viewport: { width: 820, height: 1180 }, touch: true, mobile: false, q: '&tablet=desktop', target: 40, phone: false },
  { name: 'tablet on the desktop cockpit, landscape', slug: 'tabdesk-land', viewport: { width: 1180, height: 820 }, touch: true, mobile: false, q: '&tablet=desktop', target: 40, phone: false },
];

const PROFILE = '#alias {dr} {drink %1}\n#action {^You are hungry} {eat bread}\n';
const SCRIPT = '-- @name     varning\n-- @version  1\n-- @api      1\n\nlocal seen = 0\n';

const top = (page: Page): Locator => page.locator('.wc-start .wc-frame:not([hidden])').last();
/** The shown page's box (the one with a Back of its own). */
const pageBox = (page: Page): Locator => top(page).locator('.wc-lk-box:has(> .wc-lk-back)').last();
const backOf = (b: Locator): Locator => b.locator(':scope > .wc-lk-back');
const menuRow = (page: Page, key: string): Locator => page.locator(`.wc-start .wc-sm-item[data-key="${key}"]`);
const btn = (scope: Locator, id: string): Locator => scope.locator(`[data-btn="${id}"]:visible`).first();

async function settle(page: Page): Promise<void> {
  await expect(page.locator('.wc-start')).not.toHaveAttribute('data-lk-morph', /./, { timeout: 5000 });
  // The content's fade and the hood's cross-fade.
  await page.waitForTimeout(450);
}

async function shoot(page: Page, b: Locator, mode: Mode, name: string): Promise<void> {
  const dir = process.env.WC_BACK_SHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const r = (await b.boundingBox())!;
  const clip = { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, 640), height: Math.min(r.height, 170) };
  await page.screenshot({ path: join(dir, `${mode.slug}.${name}.png`), clip, scale: 'css' });
}

/**
 * Back's place in `b` (a `.wc-lk-box`): inside the window's inner border
 * with `AIR` px on the top, left and right; drawn no taller than 30 px (the
 * target is not drawn); clear of the window's content and the hood's title;
 * on a touch screen a tap `mode.target` px above its bottom edge lands on it.
 */
async function backPlaced(page: Page, b: Locator, mode: Mode, name: string): Promise<void> {
  await expect(backOf(b)).toBeVisible();
  const g = await b.evaluate((el) => {
    const back = el.querySelector<HTMLElement>(':scope > .wc-lk-back')!;
    const win = el.querySelector<HTMLElement>(':scope > .wc-lk-win')!;
    const hood = el.querySelector<HTMLElement>(':scope > .wc-lk-hood');
    const r = back.getBoundingClientRect();
    const w = win.getBoundingClientRect();
    const cs = getComputedStyle(win);
    const inner = { left: w.left + parseFloat(cs.borderLeftWidth), top: w.top + parseFloat(cs.borderTopWidth), right: w.right - parseFloat(cs.borderRightWidth) };
    type R = { l: number; t: number; r: number; b: number };
    const cut = (a: R, c: DOMRect): R => ({ l: Math.max(a.l, c.left), t: Math.max(a.t, c.top), r: Math.min(a.r, c.right), b: Math.min(a.b, c.bottom) });
    const shown = (e: Element): boolean => {
      for (let a: Element | null = e; a && a !== el; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
      }
      return true;
    };
    /** The part of `rect` its scrolling or clipping ancestors (up to the box) let through. */
    const clipped = (e: Element, rect: DOMRect): R => {
      let o: R = { l: rect.left, t: rect.top, r: rect.right, b: rect.bottom };
      for (let a = e.parentElement; a && a !== el; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX !== 'visible' || s.overflowY !== 'visible') o = cut(o, a.getBoundingClientRect());
      }
      return o;
    };
    const B: R = { l: r.left + 0.5, t: r.top + 0.5, r: r.right - 0.5, b: r.bottom - 0.5 };
    const hits: string[] = [];
    const meet = (o: R): boolean => o.r > o.l && o.b > o.t && o.l < B.r && o.r > B.l && o.t < B.b && o.b > B.t;
    const what = (e: Element): string => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`;
    for (const root of [win, hood]) {
      if (!root) continue;
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const e = n.parentElement!;
        if (!n.textContent!.trim() || !shown(e)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const rr of range.getClientRects()) if (meet(clipped(e, rr))) hits.push(`${what(e)} "${n.textContent!.trim().slice(0, 30)}"`);
      }
      for (const e of root.querySelectorAll('input, textarea, select, img, svg, canvas, button, .wc-lk-btn, .wc-lk-opt, .wc-lk-tab, .cm-editor')) {
        if (!shown(e)) continue;
        if (meet(clipped(e, e.getBoundingClientRect()))) hits.push(what(e));
      }
    }
    return { b: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, h: r.height }, inner, hits: [...new Set(hits)] };
  });
  await shoot(page, b, mode, name);
  expect(g.b.top - g.inner.top, `${name}: air above Back`).toBeGreaterThanOrEqual(AIR);
  expect(g.b.left - g.inner.left, `${name}: air left of Back`).toBeGreaterThanOrEqual(AIR);
  expect(g.inner.right - g.b.right, `${name}: air right of Back`).toBeGreaterThanOrEqual(AIR);
  expect(g.b.h, `${name}: Back drawn ≤ 30 px high`).toBeLessThanOrEqual(30.5);
  expect(g.hits, `${name}: content under Back`).toEqual([]);
  if (mode.target) {
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.wc-lk-back') !== null, [g.b.left + 10, g.b.bottom - mode.target + 1]);
    expect(hit, `${name}: touch target ${mode.target} px high`).toBe(true);
  }
}

/**
 * The run log player's Back (`.wc-pv-back`): inside the window's inner
 * border (the run log's window, which the player fills) with `AIR` px above
 * and to the left; drawn no taller than 30 px; clear of the header's
 * chips; on a touch screen its target spans `mode.target` px from the
 * window's inner edge down (the window clips the player).
 */
async function playerBackPlaced(page: Page, mode: Mode): Promise<void> {
  const b = top(page).locator('.wc-rl-box');
  const pv = b.locator('.wc-pv-back');
  await page.mouse.move(400, 400);
  await expect(pv).toBeVisible();
  const g = await b.evaluate((el) => {
    const back = el.querySelector<HTMLElement>('.wc-pv-back')!.getBoundingClientRect();
    const win = el.querySelector<HTMLElement>(':scope > .wc-lk-win')!;
    const w = win.getBoundingClientRect();
    const cs = getComputedStyle(win);
    const chips = [...el.querySelectorAll<HTMLElement>('.wc-player-head-left, .wc-player-hints')]
      .filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none')
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.left < back.right - 0.5 && r.right > back.left + 0.5 && r.top < back.bottom - 0.5 && r.bottom > back.top + 0.5);
    return { winTop: w.top + parseFloat(cs.borderTopWidth), top: back.top - (w.top + parseFloat(cs.borderTopWidth)), left: back.left - (w.left + parseFloat(cs.borderLeftWidth)), h: back.height, x: back.left, bottom: back.bottom, meets: chips.length };
  });
  await shoot(page, b, mode, 'run-log');
  expect(g.top, 'run log: air above Back').toBeGreaterThanOrEqual(AIR);
  expect(g.left, 'run log: air left of Back').toBeGreaterThanOrEqual(AIR);
  expect(g.h, 'run log: Back drawn ≤ 30 px high').toBeLessThanOrEqual(30.5);
  expect(g.meets, 'run log: Back clear of the header').toBe(0);
  if (mode.target) {
    // The window clips the player: the target reaches from the window's inner edge down.
    for (const y of [g.winTop + 1, g.winTop + mode.target - 1]) {
      const hit = await page.evaluate(([x, yy]) => document.elementFromPoint(x!, yy!)?.closest('.wc-pv-back') !== null, [g.x + 10, y]);
      expect(hit, `run log: touch target ${mode.target} px high (at ${y - g.winTop})`).toBe(true);
    }
  }
}

/** The shown start-menu page's Back, checked once it has landed. */
async function here(page: Page, mode: Mode, name: string): Promise<void> {
  await settle(page);
  await backPlaced(page, pageBox(page), mode, name);
}

/** Back on the shown page (a click: the same on every mode). */
async function back(page: Page): Promise<void> {
  await backOf(pageBox(page)).click();
  await settle(page);
}

async function openStart(page: Page, mode: Mode, query = ''): Promise<void> {
  await page.goto(`/?${SKY}${mode.q}${query}`);
  await expect(menuRow(page, 'enter')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(mode.phone ? /\bwc-phone\b/ : /^(?!.*\bwc-phone\b)/);
  if (mode.touch) await expect(page.locator('html')).toHaveClass(/\bwc-touch\b/);
}

async function seed(page: Page): Promise<void> {
  await page.evaluate(
    async ([profile, script]) => {
      const w = window.__wc!;
      await w.shell.profiles.init();
      await w.shell.profiles.create('gimli', profile!);
      await w.shell.scripts!.init();
      await w.shell.scripts!.create('varning', script!);
      const lib = await (w as unknown as { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> }).runs();
      await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
    },
    [PROFILE, SCRIPT],
  );
}

for (const mode of MODES) {
  test.describe(mode.name, () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium only (mobile emulation)');
    test.use({ viewport: mode.viewport, hasTouch: mode.touch, isMobile: mode.mobile });
    // The screen of a phone in Desktop-site mode (the context's `screen` option does not reach
    // `window.screen` here): what src/core/device.ts reads to tell it from a tablet.
    test.beforeEach(async ({ page }) => {
      if (!mode.screen) return;
      await page.addInitScript((sc) => {
        Object.defineProperty(screen, 'width', { configurable: true, get: () => sc.width });
        Object.defineProperty(screen, 'height', { configurable: true, get: () => sc.height });
      }, mode.screen);
    });

    test('the start menu\'s own pages', async ({ page }) => {
      test.slow();
      await pinDemoClock(page);
      await openStart(page, mode);
      await seed(page);

      // Profile, Import, the profile editor.
      await menuRow(page, 'profile').click();
      await here(page, mode, 'profile');
      await btn(top(page), 'IMPORT').click();
      await here(page, mode, 'import');
      await back(page);
      const row = top(page).locator('.wc-pl-row[data-name="gimli"]');
      // (A click on the row opens the editor on a desktop; a touch screen shows the row's buttons.)
      await row.click();
      const pe = top(page).locator('.wc-pe');
      await page.waitForTimeout(300);
      await settle(page);
      if (!(await pe.isVisible())) await btn(row, 'EDIT').click();
      await expect(pe).toBeVisible();
      await here(page, mode, 'profile-editor');
      await back(page);
      await back(page);

      // Scripts, the Script Manual, the script editor.
      await menuRow(page, 'scripts').click();
      await here(page, mode, 'scripts');
      await btn(top(page), 'MANUAL').click();
      await here(page, mode, 'script-manual');
      await back(page);
      await top(page).locator('.wc-scr-name', { hasText: 'varning' }).first().click();
      await btn(top(page), 'EDIT').click();
      await expect(top(page).locator('.cm-editor')).toBeVisible();
      await here(page, mode, 'script-editor');
      await back(page);
      await back(page);

      // History: its three tabs, a session's Stats and Share.
      await menuRow(page, 'history').click();
      await here(page, mode, 'history-sessions');
      for (const t of ['spotlights', 'diary']) {
        await top(page).locator(`.wc-htab[data-tab="${t}"]`).click();
        await here(page, mode, `history-${t}`);
      }
      await top(page).locator('.wc-htab[data-tab="sessions"]').click();
      await settle(page);
      await top(page).locator('.wc-lk-tr').nth(1).click();
      await btn(top(page).locator('.wc-hist-card'), 'STATS').click();
      await here(page, mode, 'history-stats');
      await back(page);
      if (!(await top(page).locator('.wc-hist-card').isVisible())) await top(page).locator('.wc-lk-tr').nth(1).click();
      await btn(top(page).locator('.wc-hist-card'), 'EXPORT').click();
      await here(page, mode, 'export-editor');
      await back(page);
      await back(page);

      // About, and /privacy (the same leaf over the start menu).
      await menuRow(page, 'about').click();
      await here(page, mode, 'about');
      await back(page);
      await page.goto(`/privacy?${SKY}${mode.q}`);
      await here(page, mode, 'privacy');
    });

    test('History\'s players: the run log and the Spotlights viewer', async ({ page }) => {
      test.slow();
      await pinDemoClock(page);
      await openStart(page, mode);
      await seed(page);
      await menuRow(page, 'history').click();
      await settle(page);
      await top(page).locator('.wc-lk-tr').nth(1).click();
      // The run log: the player fills the window; its own Back (not on a phone or tablet,
      // where it is the first key of the docked bar).
      await btn(top(page).locator('.wc-hist-card'), 'RUN LOG').click();
      const player = top(page).locator('.wc-rl-box .wc-rl-slot > .wc-player');
      await expect(player).toHaveCount(1, { timeout: 20_000 });
      await settle(page);
      if (!mode.phone) {
        await playerBackPlaced(page, mode);
        await player.locator('.wc-pv-back').click();
        await expect(top(page).locator('.wc-hist-card')).toBeVisible();
        await settle(page);
      } else await page.keyboard.press('Escape');
      await expect(top(page).locator('.wc-htab[data-tab="spotlights"]')).toBeVisible();
      await settle(page);
      // The Spotlights viewer (a card grown into the window): the box's Back stays.
      // (A click chooses the card on a desktop, a tap plays it; Enter plays the chosen one.)
      await top(page).locator('.wc-htab[data-tab="spotlights"]').click();
      await settle(page);
      await top(page).locator('.wc-spw-card').first().click();
      await page.waitForTimeout(300);
      if (!(await page.locator('.wc-spv').isVisible())) await page.keyboard.press('Enter');
      await expect(page.locator('.wc-spv')).toBeVisible();
      await here(page, mode, 'spotlights-viewer');
      await btn(page.locator('.wc-spv'), 'wall').click();

    });

    test('the account\'s pages and the Community', async ({ page }) => {
      test.slow();
      const s = await cySetUp(page);
      await cyLogIn(page, s);
      await openStart(page, mode, '&cloudtest');
      // With news on one's logs the owner row opens Published logs; then (the news read) the Account page.
      await menuRow(page, 'owner').click();
      await expect(top(page).locator('.wc-ac-pubview')).toBeVisible();
      await here(page, mode, 'published-logs');
      await back(page);

      await menuRow(page, 'community').click();
      await expect(top(page).locator('.wc-cy')).toBeVisible();
      await expect(top(page).locator('.wc-cy .wc-cy-list, .wc-cy [data-box="newest"]').first()).not.toHaveAttribute('data-state', 'loading');
      await here(page, mode, 'community');
      // The wide page: its two columns' top edges on one line (columnsAligned, community.ts).
      if (!(await cyBox(page, 'newest').isVisible())) await columnsAligned(page);
      else {
        // The phone's dashboard: All logs and Hall of Fame are sub-pages with Back.
        for (const id of ['ALL', 'HOF']) {
          await btnIn(cyBox(page, 'newest'), id).click();
          await here(page, mode, `community-${id.toLowerCase()}`);
          await back(page);
        }
      }
    });

    test('the guest\'s account pages: Log in, Create account, Recovery; then the Account page', async ({ page }) => {
      const s = await cySetUp(page);
      await seedAccount(s.server, NAME, PASSWORD);
      await openStart(page, mode, '&cloudtest');
      await menuRow(page, 'owner').click();
      await expect(top(page).locator('[data-page="login"]')).toBeVisible();
      await here(page, mode, 'login');
      await top(page).locator('[data-link="create"]').click();
      await expect(top(page).locator('[data-page="create"]')).toBeVisible();
      await here(page, mode, 'create');
      await back(page);
      await top(page).locator('[data-link="recover"]').click();
      await expect(top(page).locator('[data-page="recover"]')).toBeVisible();
      await here(page, mode, 'recover');
      await back(page);
      // Logged in with the password: the Account page (the session alone would ask for it).
      await top(page).locator('[data-field="name"] input').fill(NAME);
      await top(page).locator('[data-field="password"] input').fill(PASSWORD);
      await btn(top(page), 'LOGIN').click();
      await expect(top(page).locator('[data-page="account"]')).toBeVisible();
      await here(page, mode, 'account');
    });

    test('the watch page', async ({ page }) => {
      await watchSetUp(page);
      await openWatch(page, undefined, mode.q);
      await expect(backOf(watchBox(page))).toBeVisible();
      await page.waitForTimeout(450);
      await backPlaced(page, watchBox(page), mode, 'watch');
    });
  });
}
