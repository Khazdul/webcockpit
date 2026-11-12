// Stage 51g (ADR 0136 "To verify in the build"): the phone's layout in the
// live game on small and odd screens: landscape (844 × 390), a 360 px wide
// phone (360 × 740), and 320 × 568 as a stress case.
//
// With real bounding boxes, on each screen:
// - every control of the main screen is inside the viewport and at least
//   36 px in its smaller dimension;
// - the compass keys, the K key, the hot keys, the menu key and the command
//   field do not overlap each other;
// - the lens's keys (on the lens, or as a row) do not overlap the compass,
//   the hot key column or the fight card; the same with the strip open and
//   with Comm open (landscape, stage 52c: both open as a column from the
//   left, tests/e2e/phone-game-landscape.spec.ts);
// - the menu sheet and the settings page scroll to their last row;
// - the hot key box fits or scrolls, and Save can be reached;
// - with the keyboard up (a shrunken visible area) the command field is
//   visible and takes the full width.
//
// Stage 52: the same with six hot keys in two columns (the second left of
// the first), the box left of both, the Exit session confirmation, and the
// Timers and Group sub-page.
//
// What a screen cannot hold is stated in its case (LIMITS), not forced.
//
// `phone` project. Offline cockpit; nothing reaches MUME.
import { type Page, expect, test } from '@playwright/test';

type Box = { x: number; y: number; w: number; h: number; name: string };

/** The on-screen boxes of every visible element matching each selector, named `name#i`. */
async function boxes(page: Page, sels: Record<string, string>): Promise<Box[]> {
  return page.evaluate((sels) => {
    const out: Box[] = [];
    for (const [name, sel] of Object.entries(sels)) {
      let i = 0;
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width < 1 || r.height < 1 || cs.visibility !== 'visible' || el.closest('[hidden]')) continue;
        out.push({ x: r.x, y: r.y, w: r.width, h: r.height, name: `${name}#${i++}` });
      }
    }
    return out;
  }, sels);
}

/** The main screen's controls. */
const CONTROLS = {
  compass: '.wc-ph-key[data-cmd]',
  K: '.wc-ph-key.is-tog',
  hot: '.wc-ph-hk',
  menu: '.wc-ph-menu',
  field: '.wc-cockpit > .wc-input-slot > .wc-input',
} as const;
/** The lens's keys: on its corners, or in the row (whichever shows). */
const SATS = { sat: '.wc-ph-sat' } as const;

const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

/** The pairs of `list` that overlap, as text. */
function overlaps(list: Box[], against: Box[] = list): string[] {
  const out: string[] = [];
  for (const a of list) for (const b of against) if (a !== b && a.name < b.name && overlap(a, b)) out.push(`${a.name} overlaps ${b.name}`);
  return out;
}

const inside = (b: Box, vw: number, vh: number): boolean => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= vw + 0.5 && b.y + b.h <= vh + 0.5;

async function openPhone(page: Page, query = ''): Promise<void> {
  await page.goto(`/?replay&phone=1${query}`);
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad')).toBeVisible();
}

/** Replays the GMCP demo up to a line inside its fight (you tank). */
async function playFight(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const lines = (await (await fetch('/__fixtures/gmcp-demo.log')).text()).split('\n');
    const text = lines.slice(0, lines.findIndex((l) => l.includes('Group.Update {"id":3,"hp":61}'))).join('\n') + '\n';
    window.__wc!.app.startReplay(text, 'gmcp-demo.log', 0);
  });
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
  await expect(page.locator('.wc-ph-fight')).toBeVisible();
}

/**
 * The main screen's checks as it stands now (plain, the strip open, Comm
 * open): everything on screen and thumb-size, nothing overlapping.
 */
async function checkMain(page: Page, what: string, hotKeys = 3): Promise<void> {
  const { width: vw, height: vh } = page.viewportSize()!;
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const controls = await boxes(page, CONTROLS);
  const sats = await boxes(page, SATS);
  const fight = await boxes(page, { fight: '.wc-ph-fight' });
  // All of them are there: eight directions, K, the hot keys, the menu key, the field, and the lens's keys.
  const count = (n: string): number => controls.filter((b) => b.name.startsWith(`${n}#`)).length;
  expect([count('compass'), count('K'), count('hot'), count('menu'), count('field')], `${what}: the controls shown`).toEqual([8, 1, hotKeys, 1, 1]);
  expect(sats.length, `${what}: the lens's keys`).toBeGreaterThanOrEqual(2);
  const off = [...controls, ...sats].filter((b) => !inside(b, vw, vh)).map((b) => `${b.name} at ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}`);
  expect(off, `${what}: outside the ${vw} × ${vh} screen`).toEqual([]);
  const small = [...controls, ...sats].filter((b) => Math.min(b.w, b.h) < 36 - 0.5).map((b) => `${b.name} ${Math.round(b.w)}×${Math.round(b.h)}`);
  expect(small, `${what}: under 36 px`).toEqual([]);
  expect(overlaps(controls), `${what}: the keys and the field`).toEqual([]);
  expect(overlaps(sats), `${what}: the lens's keys among themselves`).toEqual([]);
  const pad = controls.filter((b) => /^(compass|K|hot)#/.test(b.name));
  expect(overlaps(sats, [...pad, ...fight]).concat(overlaps([...pad, ...fight], sats)), `${what}: the lens's keys against the compass, the column and the fight card`).toEqual([]);
  // The fight card is clear of the keys too.
  expect(overlaps(fight, pad).concat(overlaps(pad, fight)), `${what}: the fight card against the keys`).toEqual([]);
}

interface Screen {
  name: string;
  viewport: { width: number; height: number };
  /** The visible height left with the keyboard up. */
  keyboard: number;
  /** What this screen cannot hold, stated (see the report of stage 51g). */
  limits: { strip: boolean; comm: boolean };
}

const SCREENS: Screen[] = [
  { name: 'landscape 844 × 390', viewport: { width: 844, height: 390 }, keyboard: 170, limits: { strip: true, comm: true } },
  { name: 'a 360 px wide phone, 360 × 740', viewport: { width: 360, height: 740 }, keyboard: 440, limits: { strip: true, comm: true } },
  { name: 'stress: 320 × 568', viewport: { width: 320, height: 568 }, keyboard: 300, limits: { strip: true, comm: true } },
];

for (const sc of SCREENS) {
  test.describe(sc.name, () => {
    test.use({ viewport: sc.viewport });

    test('the main screen: every control on screen, thumb-size, nothing overlapping; also with the strip and with Comm open', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await openPhone(page);
      await playFight(page);
      await expect(page.locator('.wc-too-small:not([hidden])')).toHaveCount(0);
      await checkMain(page, 'main');
      const { width: vw, height: vh } = sc.viewport;
      // The strip.
      const panes = page.locator('.wc-ph-sat[data-sat="panes"]:visible');
      await panes.tap();
      const strip = page.locator('.wc-cockpit > .wc-pane[data-phone-strip]');
      if (sc.limits.strip) {
        await expect(strip).toHaveCount(1);
        await expect(panes).toHaveAttribute('aria-pressed', 'true');
        await checkMain(page, 'strip open');
        // The strip's chrome does not cover its pane's lines: the hood ends above them, the dots start below.
        const g = await page.evaluate(() => {
          const r = (sel: string): DOMRect => document.querySelector(sel)!.getBoundingClientRect();
          const c = r('.wc-pane[data-phone-strip] .wc-pane-content');
          const d = r('.wc-ph-strip-dots');
          return { top: c.top, bottom: c.bottom, hood: r('.wc-ph-strip-hood').bottom, dotsTop: d.top, dotsBottom: d.bottom };
        });
        expect(g.hood).toBeLessThanOrEqual(g.top + 0.5);
        // (Portrait: on the band under the pane. Landscape: in the hood's row above it.)
        if (vw > vh) expect(g.dotsBottom).toBeLessThanOrEqual(g.top + 0.5);
        else expect(g.dotsTop).toBeGreaterThanOrEqual(g.bottom - 0.5);
      } else {
        await expect(strip).toHaveCount(0);
        await expect(panes).toHaveAttribute('aria-pressed', 'false');
      }
      await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
      await expect(strip).toHaveCount(0);
      // Comm.
      const commKey = page.locator('.wc-ph-sat[data-sat="comm"]:visible');
      await commKey.tap();
      const comm = page.locator('.wc-cockpit > .wc-pane[data-pane="comm"]');
      if (sc.limits.comm) {
        await expect(comm).toBeVisible();
        await checkMain(page, 'Comm open');
        // The resize band's grip is on screen and does not lie on a key.
        // (Landscape, stage 52c: Comm is a column from the left, and the band is its right edge.)
        const landscape = vw > vh;
        const band = await boxes(page, { band: landscape ? '.wc-ph-side-band' : '.wc-ph-comm-band' });
        expect(band).toHaveLength(1);
        const keys = (await boxes(page, CONTROLS)).filter((b) => !b.name.startsWith('field'));
        // It lies on no key: not on the hot keys, the compass or the menu key.
        expect(overlaps(band, keys).concat(overlaps(keys, band))).toEqual([]);
        const b0 = band[0]!;
        const free = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.wc-ph-rband') !== null, [b0.x + b0.w / 2, b0.y + b0.h / 2]);
        expect(free, 'the band can be grabbed at its middle').toBe(true);
      } else {
        await expect(comm).toBeHidden();
        await expect(commKey).toHaveAttribute('aria-pressed', 'false');
      }
      await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
      await expect(comm).toBeHidden();
      await checkMain(page, 'main again');
      expect(errors).toEqual([]);
    });

    test('the menu sheet and the settings page reach their last row; the font list too', async ({ page }) => {
      const { width: vw, height: vh } = sc.viewport;
      await openPhone(page);
      await page.locator('.wc-ph-menu').tap();
      const sheet = page.locator('.wc-ph-sheet');
      await expect(sheet).toBeVisible();
      // Every row of the sheet can be brought on screen and tapped.
      for (const sel of ['[data-row="reconnect"]', '[data-row="profile"]', '[data-row="scripts"]', '[data-row="settings"]', '.wc-ph-step', '.wc-ph-swatch.is-paper', '.wc-ph-fold', '.wc-ph-exit']) {
        const el = sheet.locator(sel).first();
        await el.scrollIntoViewIfNeeded();
        const b = (await el.boundingBox())!;
        expect(b.y, `${sel} on screen`).toBeGreaterThanOrEqual(-0.5);
        expect(b.y + b.height, `${sel} on screen`).toBeLessThanOrEqual(vh + 0.5);
        expect(b.x).toBeGreaterThanOrEqual(-0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(vw + 0.5);
      }
      await sheet.locator('[data-row="settings"]').scrollIntoViewIfNeeded();
      await sheet.locator('[data-row="settings"]').tap();
      const pg = page.locator('.wc-ph-page');
      await expect(pg).toBeVisible();
      // Back stays on screen whatever is scrolled.
      const back = (await pg.locator('.wc-ph-back').boundingBox())!;
      expect(back.y).toBeGreaterThanOrEqual(0);
      expect(back.y + back.height).toBeLessThanOrEqual(vh);
      const rows = await pg.locator('[data-row]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.row!));
      expect(rows.at(-1)).toBe('weather');
      for (const id of new Set(rows)) {
        const el = pg.locator(`[data-row="${id}"]`).first();
        await el.scrollIntoViewIfNeeded();
        const b = (await el.boundingBox())!;
        expect(b.y, `${id} on screen`).toBeGreaterThanOrEqual(back.y + back.height - 0.5);
        expect(b.y + b.height, `${id} on screen`).toBeLessThanOrEqual(vh + 0.5);
        // Nothing of a row is cut off sideways (a segmented control fits its row).
        const kids = await el.evaluate((e) => [...e.querySelectorAll('*')].map((k) => k.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => [r.left, r.right]));
        for (const [l, r] of kids) {
          expect(l, `${id}: a part left of the screen`).toBeGreaterThanOrEqual(-0.5);
          expect(r, `${id}: a part right of the screen`).toBeLessThanOrEqual(vw + 0.5);
        }
      }
      // The last thing on the page, the Connection group's caption, can be read whole.
      const cap = pg.locator('[data-group="connection"] .wc-ph-cap');
      await cap.scrollIntoViewIfNeeded();
      const cb = (await cap.boundingBox())!;
      expect(cb.y + cb.height).toBeLessThanOrEqual(vh + 0.5);
      // The last control works where it is.
      const sw = pg.locator('[data-row="weather"]').getByRole('switch');
      await sw.tap();
      await expect(sw).toHaveAttribute('aria-checked', 'true');
      await sw.tap();
      // The font list: its last font can be reached and chosen.
      await pg.locator('[data-row="font"]').scrollIntoViewIfNeeded();
      await pg.locator('[data-row="font"]').tap();
      await expect(page.locator('.wc-ph-page[data-page="pick:font"]')).toBeVisible();
      const last = page.locator('.wc-ph-page [role="radio"]').last();
      await last.scrollIntoViewIfNeeded();
      const lb = (await last.boundingBox())!;
      expect(lb.y + lb.height).toBeLessThanOrEqual(vh + 0.5);
      await last.tap();
      await expect(page.locator('.wc-ph-page[data-page="settings"]')).toBeVisible();
    });

    test('six hot keys: two columns of three, nothing overlapping, also with the strip and with Comm open; the box stands left of both', async ({ page }) => {
      const { width: vw, height: vh } = sc.viewport;
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await openPhone(page);
      await page.evaluate(() => window.__wc!.settings.update({ phone: { hotkeyCount: 6 } }));
      await expect(page.locator('.wc-ph-hk')).toHaveCount(6);
      const at = async (n: number) => (await page.locator(`.wc-ph-hk[data-hk="${n - 1}"]`).boundingBox())!;
      // Before the fight (a fight card may take the box's place on a low screen, as with three keys).
      // The box for a key of the second column: left of both columns, on the screen, usable.
      const key = page.locator('.wc-ph-hk[data-hk="4"]');
      const kb = (await key.boundingBox())!;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: kb.x + kb.width / 2, y: kb.y + kb.height / 2, id: 0 }] });
      const rb = page.locator('.wc-ph-rb');
      await expect(rb).toBeVisible();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await expect(rb.locator('.wc-ph-rb-k')).toHaveText('K5');
      const r = (await rb.boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(-0.5);
      expect(r.y).toBeGreaterThanOrEqual(-0.5);
      expect(r.y + r.height).toBeLessThanOrEqual(vh + 0.5);
      expect(r.x + r.width).toBeLessThanOrEqual(vw + 0.5);
      for (let n = 1; n <= 6; n++) expect(r.x + r.width, `the box ends left of K${n}`).toBeLessThanOrEqual((await at(n)).x + 0.5);
      expect(r.width).toBeGreaterThanOrEqual(200);
      for (const sel of ['.wc-ph-sw', '#wc-ph-rb-label', '#wc-ph-rb-command', '.wc-ph-chip[data-pick="assist"]', '.wc-ph-chip[data-pick="custom"]', '.wc-ph-chip[data-special="wimpy25"]', '.wc-ph-bt', '.wc-ph-bt.is-go']) {
        const el = rb.locator(sel).first();
        await el.scrollIntoViewIfNeeded();
        const e = (await el.boundingBox())!;
        expect(e.x, `${sel} inside the box`).toBeGreaterThanOrEqual(r.x - 0.5);
        expect(e.x + e.width, `${sel} inside the box`).toBeLessThanOrEqual(r.x + r.width + 0.5);
        expect(e.y, `${sel} on screen`).toBeGreaterThanOrEqual(r.y - 0.5);
        expect(e.y + e.height, `${sel} on screen`).toBeLessThanOrEqual(r.y + r.height + 0.5);
      }
      await rb.locator('.wc-ph-bt.is-go').tap();
      await expect(rb).toBeHidden();
      await playFight(page);
      await checkMain(page, 'six keys', 6);
      // Two columns: K4 to K6 directly left of K1 to K3, one gap apart, row by row level with them.
      for (const [right, left] of [[1, 4], [2, 5], [3, 6]] as const) {
        const a = await at(right);
        const b = await at(left);
        expect(b.y).toBeCloseTo(a.y, 0);
        expect(b.width).toBeCloseTo(a.width, 0);
        expect(b.height).toBeCloseTo(a.height, 0);
        expect(a.x - (b.x + b.width)).toBeCloseTo(3, 0);
      }
      expect((await at(4)).y).toBeGreaterThan((await at(5)).y);
      expect((await at(5)).y).toBeGreaterThan((await at(6)).y);
      const panes = page.locator('.wc-ph-sat[data-sat="panes"]:visible');
      await panes.tap();
      await expect(page.locator('.wc-cockpit > .wc-pane[data-phone-strip]')).toHaveCount(1);
      await checkMain(page, 'six keys, strip open', 6);
      await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
      await expect(page.locator('.wc-cockpit > .wc-pane[data-phone-strip]')).toHaveCount(0);
      await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
      await expect(page.locator('.wc-cockpit > .wc-pane[data-pane="comm"]')).toBeVisible();
      await checkMain(page, 'six keys, Comm open', 6);
      await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
      expect(errors).toEqual([]);
    });

    test('the Exit session confirmation and the Timers and Group sub-page fit: every control on screen, nothing cut off sideways', async ({ page }) => {
      const { width: vw, height: vh } = sc.viewport;
      await openPhone(page);
      await page.locator('.wc-ph-menu').tap();
      const sheet = page.locator('.wc-ph-sheet');
      await sheet.locator('.wc-ph-exit').scrollIntoViewIfNeeded();
      await sheet.locator('.wc-ph-exit').tap();
      const ex = page.locator('.wc-ph-exitsheet');
      await expect(ex).toBeVisible();
      for (const sel of ['.wc-ph-hood', '.wc-ph-exit-warn', '[data-act="cancel"]', '[data-act="exit"]']) {
        const el = ex.locator(sel);
        await el.scrollIntoViewIfNeeded();
        const b = (await el.boundingBox())!;
        expect(b.y, `${sel} on screen`).toBeGreaterThanOrEqual(-0.5);
        expect(b.y + b.height, `${sel} on screen`).toBeLessThanOrEqual(vh + 0.5);
        expect(b.x).toBeGreaterThanOrEqual(-0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(vw + 0.5);
      }
      for (const act of ['cancel', 'exit']) expect((await ex.locator(`[data-act="${act}"]`).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await ex.locator('[data-act="cancel"]').tap();
      await expect(ex).toHaveCount(0);
      await sheet.locator('[data-row="settings"]').scrollIntoViewIfNeeded();
      await sheet.locator('[data-row="settings"]').tap();
      const pg = page.locator('.wc-ph-page');
      await pg.locator('[data-row="timers-group"]').scrollIntoViewIfNeeded();
      await pg.locator('[data-row="timers-group"]').tap();
      await expect(pg).toHaveAttribute('data-page', 'sub:timers-group');
      const back = (await pg.locator('.wc-ph-back').boundingBox())!;
      const rows = await pg.locator('[data-row]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.row!));
      expect(rows.at(-1)).toBe('group-fight');
      for (const id of rows) {
        const el = pg.locator(`[data-row="${id}"]`);
        await el.scrollIntoViewIfNeeded();
        const b = (await el.boundingBox())!;
        expect(b.y, `${id} on screen`).toBeGreaterThanOrEqual(back.y + back.height - 0.5);
        expect(b.y + b.height, `${id} on screen`).toBeLessThanOrEqual(vh + 0.5);
        const kids = await el.evaluate((e) => [...e.querySelectorAll('*')].map((k) => k.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => [r.left, r.right]));
        for (const [l, r] of kids) {
          expect(l, `${id}: a part left of the screen`).toBeGreaterThanOrEqual(-0.5);
          expect(r, `${id}: a part right of the screen`).toBeLessThanOrEqual(vw + 0.5);
        }
      }
      // The hood's title fits between the screen's edges.
      const hood = (await pg.locator('.wc-ph-hood').boundingBox())!;
      expect(hood.x).toBeGreaterThanOrEqual(0);
      expect(hood.x + hood.width).toBeLessThanOrEqual(vw);
    });

    test('the hot key box fits or scrolls, and Save can be reached', async ({ page }) => {
      const { width: vw, height: vh } = sc.viewport;
      await openPhone(page);
      const key = page.locator('.wc-ph-hk[data-hk="2"]');
      const b = (await key.boundingBox())!;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 0 }] });
      const rb = page.locator('.wc-ph-rb');
      await expect(rb).toBeVisible();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      const r = (await rb.boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(-0.5);
      expect(r.y).toBeGreaterThanOrEqual(-0.5);
      expect(r.x + r.width).toBeLessThanOrEqual(vw + 0.5);
      expect(r.y + r.height).toBeLessThanOrEqual(vh + 0.5);
      // Wide enough to use: the two fields and the chips are inside it.
      expect(r.width).toBeGreaterThanOrEqual(220);
      for (const sel of ['.wc-ph-sw', '#wc-ph-rb-label', '.wc-ph-chip[data-pick="assist"]', '.wc-ph-chip[data-pick="custom"]', '.wc-ph-chip[data-special="wimpy25"]', '.wc-ph-bt.is-go']) {
        const el = rb.locator(sel);
        await el.scrollIntoViewIfNeeded();
        const e = (await el.boundingBox())!;
        expect(e.x, `${sel} inside the box`).toBeGreaterThanOrEqual(r.x - 0.5);
        expect(e.x + e.width, `${sel} inside the box`).toBeLessThanOrEqual(r.x + r.width + 0.5);
        expect(e.y, `${sel} on screen`).toBeGreaterThanOrEqual(r.y - 0.5);
        expect(e.y + e.height, `${sel} on screen`).toBeLessThanOrEqual(r.y + r.height + 0.5);
      }
      await rb.locator('.wc-ph-chip[data-pick="rescue"]').scrollIntoViewIfNeeded();
      await rb.locator('.wc-ph-chip[data-pick="rescue"]').tap();
      await rb.locator('.wc-ph-bt.is-go').scrollIntoViewIfNeeded();
      await rb.locator('.wc-ph-bt.is-go').tap();
      await expect(rb).toBeHidden();
      await expect(key).toHaveText('resc');
    });

    test('the keyboard up: the command field is visible and takes the full width', async ({ page }) => {
      // The device's keyboard (the old path, `?kbd=0`; ADR 0138 §9: it stays until the release decision).
      await openPhone(page, '&kbd=0');
      await playFight(page);
      await page.locator('.wc-input-slot .wc-input-field').tap();
      await page.setViewportSize({ width: sc.viewport.width, height: sc.keyboard });
      await expect(page.locator('html')).toHaveClass(/\bwc-kbd\b/);
      await expect(page.locator('.wc-ph-pad')).toBeHidden();
      await expect(page.locator('.wc-ph-hot')).toBeHidden();
      await expect(page.locator('.wc-too-small:not([hidden])')).toHaveCount(0);
      const vw = sc.viewport.width;
      await expect
        .poll(async () => {
          const f = (await page.locator('.wc-cockpit > .wc-input-slot > .wc-input').boundingBox())!;
          return f.y >= 0 && f.y + f.height <= sc.keyboard + 0.5 && f.x + f.width >= vw - 8 - 12;
        })
        .toBe(true);
      const f = (await page.locator('.wc-cockpit > .wc-input-slot > .wc-input').boundingBox())!;
      const m = (await page.locator('.wc-ph-menu').boundingBox())!;
      // From the menu key to the right edge (less the row's 8 px and a cell's slack).
      expect(f.x).toBeGreaterThanOrEqual(m.x + m.width + 7);
      expect(f.height).toBeGreaterThanOrEqual(36);
      expect(m.y + m.height).toBeLessThanOrEqual(sc.keyboard + 0.5);
      // What is typed shows in it.
      await page.keyboard.type('kill scout');
      await expect(page.locator('.wc-input-slot .wc-input-field')).toHaveValue('kill scout');
      // The game text keeps rows above the field.
      const game = (await page.locator('.wc-cockpit > .wc-game').boundingBox())!;
      expect(game.height).toBeGreaterThan(30);
      expect(game.y + game.height).toBeLessThanOrEqual(f.y + 1);
    });
  });
}
