// Stage 54, round 54a (ADR 0140): a tablet gets the phone's game layout and
// our own keyboard by default.
//
// - A touch browser whose screen's short side is 600 CSS px or more is a
//   tablet (`device().tablet`): with NO flag in the address it gets the
//   phone flag, the phone's game layout and our keyboard, in the game and on
//   the menu pages, at 820 × 1180 and at 1180 × 820 (an iPad, 10th
//   generation).
// - The keyboard uses the width there: letter keys of 72 px and rows of
//   56 px in both shapes (a phone: at most 48 × 46 and 46 × 36), across the
//   screen with a margin in portrait, between the hot keys and the compass in
//   landscape. The page keyboard has the same sizes.
// - `?tablet=desktop` is the way back: the desktop cockpit, no phone flag,
//   the device's keyboard. `?tablet=phone` still forces the tablet.
// - Settings stored on the tablet are kept as they are: the phone's one-time
//   defaults (src/phone/phone-defaults.ts) are not applied.
//
// `phone` project (Pixel 7: a touch browser; the viewport set here is its
// screen too). The offline cockpit and the start page; nothing reaches MUME.
// What a phone gets is every other phone-*.spec.ts, unchanged.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { morphDone } from './look';

const html = (page: Page) => page.locator('html');
const pad = (page: Page) => page.locator('.wc-ph-pad');
const okb = (page: Page) => page.locator('.wc-cockpit .wc-ph-okb');
const block = (page: Page) => page.locator('.wc-cockpit .wc-ph-okb-block');
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const key = (root: Locator, k: string) => root.locator([...k].length === 1 ? `.wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-ph-okb-k[data-act="${k}"]`);
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const flags = (page: Page) => page.evaluate(() => ({ cls: document.documentElement.className.split(/\s+/).filter((c) => /^wc-(touch|phone)$/.test(c)).sort().join(' '), w: screen.width, h: screen.height }));

/**
 * A row's height in a block `h` px high with `n` rows. The model asks for 56 px rows on a tablet
 * (46 on a phone upright); the allocator then keeps whole rows of game text free, so the block
 * it gets is that within a part of a text row.
 */
const rowOf = (h: number, n: number): number => (h - 4) / n;

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const PORTRAIT = { width: 820, height: 1180 };
const LANDSCAPE = { width: 1180, height: 820 };

for (const [name, viewport] of [
  ['portrait 820 × 1180', PORTRAIT],
  ['landscape 1180 × 820', LANDSCAPE],
] as const) {
  test.describe(`a tablet, ${name}`, () => {
    test.use({ viewport });
    const land = viewport.width > viewport.height;

    test('with no flag: the phone flag, the phone\'s game layout, no menu bar', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/?replay');
      expect(await flags(page)).toEqual({ cls: 'wc-phone wc-touch', w: viewport.width, h: viewport.height });
      await expect(page.locator('.wc-cockpit[data-phone-game]')).toHaveCount(1);
      await expect(pad(page)).toBeVisible();
      await expect(html(page)).toHaveClass(/\bwc-phone-game\b/);
      await expect(page.locator('.wc-ph-menu')).toBeVisible();
      await expect(page.locator('.wc-mb-bar')).toHaveCount(0);
      await expect(page.locator('.wc-phone-tabs')).toHaveCount(0);
      expect(await page.evaluate(() => window.__wc!.app.cockpit.phoneGameLayout!.landscape)).toBe(land);
      // The compass and the hot keys keep the phone's sizes (ADR 0137): 36 px upright, 44 px on the side.
      expect(Math.round((await box(pad(page).locator('.wc-ph-key').first())).width)).toBe(land ? 44 : 36);
      expect(errors).toEqual([]);
    });

    test('the keyboard opens on a tap, types and sends; its keys use the tablet\'s width', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/?replay&kbd=sv');
      await expect(pad(page)).toBeVisible();
      await expect(field(page)).toHaveAttribute('inputmode', 'none');
      await field(page).tap();
      await expect(okb(page)).toBeVisible();
      await expect(html(page)).toHaveClass(/\bwc-okb\b/);
      await expect(okb(page)).toHaveAttribute('data-tablet', '');
      for (const k of ['k', 'i', 'l', 'l', 'space', 'shift', 'o', 'r', 'c']) await key(okb(page), k).tap();
      await expect(field(page)).toHaveValue('kill Orc');
      await frames(page);

      // Letter keys of 72 px in rows of 56 px (as the text rows fall), both shapes.
      const k = await box(key(okb(page), 'k'));
      expect(k.width).toBeCloseTo(72, 0);
      const b = await box(block(page));
      expect(b.width).toBeCloseTo(11 * 72 + 4, 0);
      expect(rowOf(b.height, 4)).toBeGreaterThanOrEqual(54);
      expect(rowOf(b.height, 4)).toBeLessThanOrEqual(59);
      expect(k.height).toBeCloseTo(rowOf(b.height, 4), 0);
      // The band ends at the bottom edge and the command field stands on it.
      const band = await box(okb(page));
      expect(band.y + band.height).toBeCloseTo(viewport.height, 0);
      const f = await box(field(page));
      expect(f.y + f.height).toBeLessThanOrEqual(band.y + 0.5);
      const compass = await box(pad(page));
      if (land) {
        // Between the hot key column and the compass, all in the band.
        const hk = await box(page.locator('.wc-ph-hk').first());
        expect(hk.x + hk.width).toBeLessThanOrEqual(b.x + 0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(compass.x + 0.5);
        expect(compass.y).toBeGreaterThanOrEqual(band.y - 0.5);
      } else {
        // Across the screen, a 12 px margin at each side; the compass above it.
        expect(b.x).toBeCloseTo(12, 0);
        expect(b.x + b.width).toBeCloseTo(viewport.width - 12, 0);
        expect(compass.y + compass.height).toBeLessThanOrEqual(band.y + 0.5);
      }

      // The digit row adds one row of the same height; the arrows stand on it.
      await key(okb(page), 'digits').tap();
      await frames(page);
      const five = (await box(block(page))).height;
      expect(rowOf(five, 5)).toBeGreaterThanOrEqual(54);
      expect(rowOf(five, 5)).toBeLessThanOrEqual(59);
      await expect(okb(page).locator('.wc-ph-okb-row').first().locator('.wc-ph-okb-k[data-act="older"]')).toHaveCount(1);
      await key(okb(page), '7').tap();
      await expect(field(page)).toHaveValue('kill Orc7');
      // The symbols page keeps the block's size.
      await key(okb(page), 'sym').tap();
      await frames(page);
      expect((await box(block(page))).height).toBeCloseTo(five, 0);
      await key(okb(page), '!').tap();
      await expect(field(page)).toHaveValue('kill Orc7!');
      await key(okb(page), 'sym').tap();
      await key(okb(page), 'digits').tap();

      // Enter sends as the Enter key does (the history has it); the keyboard stays. The fold key closes it.
      await key(okb(page), 'enter').tap();
      expect(await page.evaluate(() => window.__wc!.app.input.getHistory())).toContain('kill Orc7!');
      await expect(okb(page)).toBeVisible();
      await key(okb(page), 'fold').tap();
      await expect(okb(page)).toBeHidden();
      await expect(html(page)).not.toHaveClass(/\bwc-okb\b/);
      expect(errors).toEqual([]);
    });

    test('a start-menu page: the page keyboard with the same keys', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/?kbd=sv');
      await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
      await page.evaluate(() => window.__wc!.shell.scripts!.init());
      const f = page.locator('.wc-start .wc-frame:not([hidden])');
      await f.locator('.wc-sm-item[data-key="scripts"]').tap();
      await f.locator('[data-btn="NEW"]').tap();
      const name = page.locator('.wc-lk-dialog[data-dlg="new"] input');
      await expect(name).toHaveAttribute('inputmode', 'none');
      await name.tap();
      const pg = page.locator('.wc-okb-page .wc-ph-okb');
      await expect(pg).toBeVisible();
      await expect(pg).toHaveAttribute('data-tablet', '');
      for (const k of ['v', 'a', 'r', 'n']) await key(pg, k).tap();
      await expect(name).toHaveValue('varn');
      await frames(page);
      const k = await box(key(pg, 'k'));
      expect(k.width).toBeCloseTo(72, 0);
      expect(k.height).toBeCloseTo(56, 0);
      // Portrait: Esc, Tab and the caret keys are a row of the block. Landscape: a column at each side of it.
      const rows = await pg.locator('.wc-ph-okb-block .wc-ph-okb-row').count();
      expect(rows).toBe(land ? 4 : 5);
      const esc = await box(key(pg, 'esc'));
      const b = await box(pg.locator('.wc-ph-okb-block'));
      if (land) expect(esc.x + esc.width).toBeLessThanOrEqual(b.x + 0.5);
      else expect(b.x).toBeCloseTo(12, 0);
      // The dialog's field is above the keyboard.
      const nb = await box(name);
      expect(nb.y + nb.height).toBeLessThanOrEqual((await box(pg)).y + 0.5);
      expect(errors).toEqual([]);
    });

    test('the code editors: a tap in the script editor\'s buffer, and in the profile editor\'s, opens the page keyboard, also after its fold key', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/?kbd=en');
      await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
      await page.evaluate(async () => {
        const l = window.__wc!.shell.scripts!;
        await l.init();
        await l.create('tableted', '-- @name     tableted\n-- @version  1\n-- @api      1\n');
        await window.__wc!.shell.profiles.init();
        await window.__wc!.shell.profiles.save('default', '#alias {k} {kill %1}\n');
      });
      const pg = page.locator('.wc-okb-page .wc-ph-okb');
      const up = () => expect(page.locator('html')).toHaveClass(/\bwc-okb-pg\b/);
      const down = () => expect(page.locator('html')).not.toHaveClass(/\bwc-okb-pg\b/);
      /** A tap in the buffer of `scope`: in its second line's text, then (folded) in the empty room under its last line. */
      const taps = async (scope: Locator): Promise<void> => {
        const content = scope.locator('.cm-content');
        await expect(content).toHaveAttribute('inputmode', 'none');
        await down();
        const line = await box(scope.locator('.cm-content .cm-line').first());
        await page.touchscreen.tap(line.x + 30, line.y + line.height / 2);
        await up();
        await expect(pg).toHaveAttribute('data-tablet', '');
        await expect(content).toBeFocused();
        await key(pg, 'x').tap();
        await expect(scope.locator('.cm-content')).toContainText('x');
        await key(pg, 'back').tap();
        await key(pg, 'fold').tap();
        await down();
        const sc = await box(scope.locator('.cm-scroller'));
        const last = await box(scope.locator('.cm-content .cm-line').last());
        await page.touchscreen.tap(sc.x + sc.width / 2, Math.min(sc.y + sc.height - 20, last.y + last.height + 80));
        await up();
        await key(pg, 'fold').tap();
        await down();
      };
      const f = page.locator('.wc-start .wc-frame:not([hidden])');
      await f.locator('.wc-sm-item[data-key="scripts"]').tap();
      await f.locator('.wc-scr-row[data-name="tableted"] .wc-scr-name').tap();
      await f.locator('[data-btn="EDIT"]:visible').first().tap();
      const sed = page.locator('.wc-frame:not([hidden]) > .wc-sed');
      await expect(sed).toHaveAttribute('data-script', 'tableted');
      await morphDone(page);
      await taps(sed);

      await page.goto('/?kbd=en');
      await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
      await f.locator('.wc-sm-item[data-key="profile"]').tap();
      await f.locator('[data-btn="EDIT"]').tap();
      const pe = page.locator('.wc-frame:not([hidden]) .wc-pe');
      await expect(pe).toHaveAttribute('data-view', 'lite');
      await morphDone(page);
      await pe.locator('.wc-pe-views [data-opt="editor"]').tap();
      await expect(pe).toHaveAttribute('data-view', 'editor');
      await taps(pe);
      expect(errors).toEqual([]);
    });

    test('?tablet=desktop: the desktop cockpit, no phone flag, no keyboard of ours', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/?replay&tablet=desktop');
      await expect(page.locator('.wc-cockpit')).toBeVisible();
      expect((await flags(page)).cls).toBe('wc-touch');
      await expect(page.locator('.wc-mb-bar')).toBeVisible();
      await expect(page.locator('.wc-cockpit[data-phone-game]')).toHaveCount(0);
      await expect(page.locator('.wc-ph-layer, .wc-ph-menu, .wc-ph-pad, .wc-ph-okb, .wc-okb-page')).toHaveCount(0);
      await expect(html(page)).not.toHaveClass(/\bwc-phone-game\b/);
      await expect(page.locator('.wc-input-field')).not.toHaveAttribute('inputmode');
      await page.locator('.wc-input-field').tap();
      await frames(page);
      await expect(html(page)).not.toHaveClass(/\bwc-okb\b/);
      expect(await page.evaluate(() => document.querySelectorAll('[inputmode="none"]').length)).toBe(0);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('a tablet: the flags and the stored settings', () => {
  test.use({ viewport: PORTRAIT });

  test('?tablet=phone is the same as no flag; ?phone=1 is too on a tablet', async ({ page }) => {
    for (const q of ['tablet=phone', 'phone=1', 'touch=1']) {
      await page.goto(`/?replay&${q}`);
      await expect(page.locator('.wc-cockpit[data-phone-game]')).toHaveCount(1);
      await expect(pad(page)).toBeVisible();
    }
  });

  test('settings stored on the tablet are kept: the phone\'s one-time defaults are not applied', async ({ page }) => {
    // (Every spec starts as an existing install: tests/e2e/legacy-state.ts.)
    await page.goto('/?replay');
    await expect(pad(page)).toBeVisible();
    await page.evaluate(() => window.__wc!.settings.load());
    await frames(page);
    const got = await page.evaluate(() => {
      const s = window.__wc!.settings.get();
      return { mark: s.phone.defaults, herb: s.timers.groups.herb.enabled, timeText: s.timers.timeText, signal: s.timers.signal };
    });
    expect(got).toEqual({ mark: 0, herb: true, timeText: true, signal: 'text' });
  });
});

test.describe('a phone (the control: the same checks at a phone\'s size)', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('its keys keep the phone\'s sizes and the one-time defaults are applied', async ({ page }) => {
    await page.goto('/?replay&kbd=sv');
    await expect(pad(page)).toBeVisible();
    await field(page).tap();
    await expect(okb(page)).toBeVisible();
    await expect(okb(page)).not.toHaveAttribute('data-tablet');
    await frames(page);
    const b = await box(block(page));
    expect(b.width).toBeCloseTo(360, 0);
    expect(rowOf(b.height, 4)).toBeGreaterThanOrEqual(44);
    expect(rowOf(b.height, 4)).toBeLessThanOrEqual(49);
    expect((await box(key(okb(page), 'k'))).width).toBeCloseTo(356 / 11, 0);
    await expect.poll(() => page.evaluate(() => window.__wc!.settings.get().phone.defaults)).toBe(1);
    expect(await page.evaluate(() => window.__wc!.settings.get().timers.groups.herb.enabled)).toBe(false);
  });
});
