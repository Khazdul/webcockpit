// Stage 55 (owner feedback 2026-11-13): the hot key box is low, so it stands
// above our keyboard with its Save in sight.
//
// - Custom empties both fields and puts the cursor in the Label, with our
//   keyboard up on it; Enter there goes on to the Command, and Enter in the
//   Command saves.
// - With our keyboard up after Custom, both fields and the Save row are in
//   sight without scrolling: at 360 × 800 with nothing open, with the strip
//   open and with Comm open; at 800 × 360; on a tablet.
// - The foot (what the key would send, Shown, Cancel, Save) never scrolls.
//   The part above it shows a mark on the side where it has more, and only
//   there: none when all of it fits.
//
// `phone` project (Pixel 7), the offline cockpit. Nothing reaches MUME.
import { type Locator, type Page, expect, test } from '@playwright/test';

const pad = (page: Page) => page.locator('.wc-ph-pad');
const hk = (page: Page, n: number) => page.locator(`.wc-ph-hk[data-hk="${n - 1}"]`);
const rb = (page: Page) => page.locator('.wc-ph-rb');
const okb = (page: Page) => page.locator('.wc-ph-okb');
const label = (page: Page) => rb(page).locator('#wc-ph-rb-label');
const command = (page: Page) => rb(page).locator('#wc-ph-rb-command');
const custom = (page: Page) => rb(page).locator('.wc-ph-chip[data-pick="custom"]');
const save = (page: Page) => rb(page).locator('.wc-ph-bt.is-go');
const cancel = (page: Page) => rb(page).locator('.wc-ph-bt', { hasText: 'Cancel' });
const scroller = (page: Page) => rb(page).locator('.wc-ph-rb-in');
const frame = (page: Page) => rb(page).locator('.wc-ph-rb-sc');
const key = (page: Page, k: string) => okb(page).locator([...k].length === 1 ? `.wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-ph-okb-k[data-act="${k}"]`);
const hotkeys = (page: Page) => page.evaluate(() => window.__wc!.settings.get().phone.hotkeys);
const layout = (page: Page) => page.evaluate(() => window.__wc!.app.cockpit.phoneGameLayout!);
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openPhone(page: Page, query = ''): Promise<void> {
  await page.goto(`/?replay&phone=1&kbd=en${query}`);
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(pad(page)).toBeVisible();
}

/** A hold on `l` through CDP (a real touch): the finger stays down until the box is open, then lifts. */
async function hold(page: Page, l: Locator): Promise<void> {
  const b = await box(l);
  const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 0 };
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await expect(rb(page)).toBeVisible();
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }
}

async function type(page: Page, ...keys: string[]): Promise<void> {
  for (const k of keys) await key(page, k).tap();
}

/** The marks of more on the scrolling part: `U` above, `D` below. */
const more = (page: Page) => frame(page).evaluate((el) => `${el.hasAttribute('data-more-up') ? 'U' : ''}${el.hasAttribute('data-more-down') ? 'D' : ''}`);

/** `l` is whole inside the box, inside the window and, with our keyboard up, above its keys. */
async function expectInSight(page: Page, l: Locator, what: string): Promise<void> {
  const b = await box(l);
  const r = await box(rb(page));
  const view = page.viewportSize()!;
  expect(b.y, `${what}: under the box's top`).toBeGreaterThanOrEqual(r.y - 0.5);
  expect(b.y + b.height, `${what}: over the box's foot`).toBeLessThanOrEqual(r.y + r.height + 0.5);
  expect(b.y, `${what}: on the screen`).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height, `${what}: on the screen`).toBeLessThanOrEqual(view.height);
  if (await okb(page).isVisible()) expect(b.y + b.height, `${what}: above our keyboard`).toBeLessThanOrEqual((await box(okb(page))).y + 0.5);
  // Nothing lies over its middle (the scrolling part has not cut it).
  const hit = await l.evaluate((el) => {
    const q = el.getBoundingClientRect();
    const at = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
    return at !== null && (el === at || el.contains(at));
  });
  expect(hit, `${what}: not covered`).toBe(true);
}

/** Custom was tapped: the keyboard is up on an empty Label, and both fields and Save are in sight with nothing to scroll. */
async function expectCustomWhole(page: Page): Promise<void> {
  await expect(okb(page)).toBeVisible();
  await expect(label(page)).toBeFocused();
  await expect(label(page)).toHaveValue('');
  await expect(command(page)).toHaveValue('');
  await frames(page);
  await frames(page);
  await expect(rb(page)).toBeVisible();
  await expectInSight(page, label(page), 'Label');
  await expectInSight(page, command(page), 'Command');
  await expectInSight(page, save(page), 'Save');
  await expectInSight(page, cancel(page), 'Cancel');
}

test.describe('360 × 800 (the S21), portrait', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  for (const [what, open] of [
    ['nothing open', async () => {}],
    ['the strip open', async (page: Page) => page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap()],
    ['Comm open', async (page: Page) => page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap()],
    [
      'the strip and Comm open',
      async (page: Page) => {
        await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
        await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
      },
    ],
  ] as const) {
    test(`${what}: Custom empties both fields, the cursor is in the Label, and the fields and Save are in sight above our keyboard with nothing to scroll`, async ({ page }) => {
      const errors = watchErrors(page);
      await openPhone(page);
      await open(page);
      await frames(page);
      await hold(page, hk(page, 2));
      await expect(label(page)).toHaveValue('bash');
      await expect(command(page)).toHaveValue('bash');
      // The whole box shows with the keyboard down: nothing to scroll, no mark.
      expect(await more(page)).toBe('');
      await expectInSight(page, save(page), 'Save (keyboard down)');
      await custom(page).tap();
      await expectCustomWhole(page);
      expect(await more(page)).toBe('');
      expect(await scroller(page).evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
      await expect(custom(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(rb(page).locator('.wc-ph-rb-say')).toHaveText('Would send nothing: no command yet');
      expect(errors).toEqual([]);
    });
  }

  test('Custom, then our keyboard: the Label, Enter goes on to the Command, Enter there saves; one window size for the keyboard', async ({ page }) => {
    const errors = watchErrors(page);
    await openPhone(page);
    await hold(page, hk(page, 2));
    await custom(page).tap();
    await expectCustomWhole(page);
    const rows = (await layout(page)).bottom;
    await type(page, 'k', 'o');
    await expect(label(page)).toHaveValue('ko');
    await expect(command(page)).toHaveValue('');
    // Enter in the Label with no command yet: on to the Command; the box and the keyboard stay as they are.
    await key(page, 'enter').tap();
    await expect(command(page)).toBeFocused();
    await expect(rb(page)).toBeVisible();
    await expect(okb(page)).toBeVisible();
    expect((await layout(page)).bottom).toBe(rows);
    expect((await hotkeys(page))[1]!.command).toBe('bash');
    await type(page, 'k', 'i', 'c', 'k', ';', 'f', 'l', 'e', 'e');
    await expect(command(page)).toHaveValue('kick;flee');
    await expect(label(page)).toHaveValue('ko');
    await expect(rb(page).locator('.wc-ph-rb-say')).toHaveText('Would send now: kick;flee');
    await expectInSight(page, save(page), 'Save');
    // Enter in the Command saves; the box and the keyboard go.
    await key(page, 'enter').tap();
    await expect(rb(page)).toBeHidden();
    await expect(okb(page)).toBeHidden();
    expect((await hotkeys(page))[1]).toEqual({ label: 'ko', command: 'kick;flee', special: null, shown: true });
    await expect(hk(page, 2)).toHaveText('ko');
    expect(errors).toEqual([]);
  });

  test('Custom on a key that has a special: the token gives way, both fields are empty; Enter in the Label of a key with a command saves', async ({ page }) => {
    const errors = watchErrors(page);
    await openPhone(page);
    await hold(page, hk(page, 3));
    await expect(rb(page).locator('.wc-ph-rb-tok')).toBeVisible();
    await expect(rb(page).locator('.wc-ph-rb-tok')).toHaveText(/wimpy 50\s% HP/);
    await expect(rb(page).locator('.wc-ph-rb-tok')).toHaveAttribute('aria-label', /wimpy 50\s% of current\sHP/);
    await custom(page).tap();
    await expectCustomWhole(page);
    await expect(rb(page).locator('.wc-ph-rb-tok')).toBeHidden();
    // Custom again after something was written: emptied again (it starts a key from nothing).
    await type(page, 'a');
    await key(page, 'enter').tap();
    await type(page, 'b');
    await expect(command(page)).toHaveValue('b');
    await custom(page).tap();
    await expect(label(page)).toBeFocused();
    await expect(label(page)).toHaveValue('');
    await expect(command(page)).toHaveValue('');
    await cancel(page).tap();
    await expect(rb(page)).toBeHidden();
    expect((await hotkeys(page))[2]!.special).toBe('wimpy50');
    // A key that has its command: Enter in the Label saves (the Command needs no visit).
    await hold(page, hk(page, 2));
    await label(page).tap();
    await expect(okb(page)).toBeVisible();
    await label(page).evaluate((el: HTMLInputElement) => {
      el.value = 'ba';
      el.setSelectionRange(2, 2);
    });
    await type(page, 'x');
    await expect(label(page)).toHaveValue('bax');
    await key(page, 'enter').tap();
    await expect(rb(page)).toBeHidden();
    await expect(okb(page)).toBeHidden();
    expect((await hotkeys(page))[1]).toEqual({ label: 'bax', command: 'bash', special: null, shown: true });
    expect(errors).toEqual([]);
  });

  test('the mark of more shows only where the box has more than fits, on that side; Save never scrolls away', async ({ page }) => {
    const errors = watchErrors(page);
    await openPhone(page);
    await hold(page, hk(page, 2));
    expect(await more(page)).toBe('');
    await expect(rb(page).locator('.wc-ph-rb-mo.is-up')).toBeHidden();
    await expect(rb(page).locator('.wc-ph-rb-mo.is-down')).toBeHidden();
    // A lower window: the box is cut to its room, and the part above the foot scrolls.
    await page.setViewportSize({ width: 360, height: 370 });
    await expect.poll(() => more(page)).toBe('D');
    const over = await scroller(page).evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(over).toBeGreaterThan(8);
    await expect(rb(page).locator('.wc-ph-rb-mo.is-down')).toBeVisible();
    await expect(rb(page).locator('.wc-ph-rb-mo.is-up')).toBeHidden();
    await expectInSight(page, save(page), 'Save');
    await expectInSight(page, label(page), 'Label');
    // Scrolled a little: more both ways. To the end: more above only. Save stays where it is.
    const was = await box(save(page));
    await scroller(page).evaluate((el) => (el.scrollTop = 4));
    await expect.poll(() => more(page)).toBe('UD');
    await scroller(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect.poll(() => more(page)).toBe('U');
    await expect(rb(page).locator('.wc-ph-rb-mo.is-up')).toBeVisible();
    await expect(rb(page).locator('.wc-ph-rb-mo.is-down')).toBeHidden();
    expect(await box(save(page))).toEqual(was);
    await expectInSight(page, save(page), 'Save');
    await expectInSight(page, rb(page).locator('.wc-ph-chip[data-special="wimpy25"]'), 'the last chip');
    // The window as it was: all of it fits again, and no mark.
    await page.setViewportSize({ width: 360, height: 800 });
    await expect.poll(() => more(page)).toBe('');
    expect(errors).toEqual([]);
  });

  test('the box is low: at most 280 px with one column of keys, with its name on a plate on its top edge', async ({ page }) => {
    await openPhone(page);
    await hold(page, hk(page, 2));
    const b = await box(rb(page));
    expect(b.height).toBeLessThanOrEqual(280);
    await expect(rb(page).locator('.wc-ph-rb-k')).toHaveText('K2');
    const plate = await box(rb(page).locator('.wc-ph-rb-k'));
    expect(plate.y).toBeLessThan(b.y);
    expect(plate.y + plate.height).toBeGreaterThan(b.y);
    // The two fields stand side by side, each named.
    const [l, c] = [await box(label(page)), await box(command(page))];
    expect(l.y).toBe(c.y);
    expect(l.x + l.width).toBeLessThan(c.x);
    await expect(rb(page).locator('label[for="wc-ph-rb-label"]')).toHaveText('Label');
    await expect(rb(page).locator('label[for="wc-ph-rb-command"]')).toHaveText('Command');
    // The foot: Shown at the left, Cancel and Save at the right, under the line of what it would send.
    const [sw, ca, sa, say] = [await box(rb(page).locator('.wc-ph-sw')), await box(cancel(page)), await box(save(page)), await box(rb(page).locator('.wc-ph-rb-say'))];
    expect(sw.x).toBeLessThan(ca.x);
    expect(ca.x + ca.width).toBeLessThanOrEqual(sa.x);
    expect(sa.x + sa.width).toBeGreaterThan(b.x + b.width - 16);
    expect(say.y + say.height).toBeLessThanOrEqual(sa.y + 0.5);
  });
});

test.describe('800 × 360 (the S21 on its side)', () => {
  test.use({ viewport: { width: 800, height: 360 } });

  for (const [what, open] of [
    ['nothing open', async () => {}],
    ['the side column open', async (page: Page) => page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap()],
  ] as const) {
    test(`${what}: the whole box shows with the keyboard down and up; Custom's fields and Save are in sight above our keyboard`, async ({ page }) => {
      const errors = watchErrors(page);
      await openPhone(page);
      await open(page);
      await frames(page);
      await hold(page, hk(page, 2));
      expect(await more(page)).toBe('');
      await expectInSight(page, save(page), 'Save (keyboard down)');
      await custom(page).tap();
      await expectCustomWhole(page);
      expect(await more(page)).toBe('');
      // What it would send stands in the foot's one row, between Shown and the actions.
      const [say, sa] = [await box(rb(page).locator('.wc-ph-rb-say')), await box(save(page))];
      expect(say.y).toBeGreaterThanOrEqual(sa.y - 0.5);
      expect(say.y + say.height).toBeLessThanOrEqual(sa.y + sa.height + 0.5);
      await type(page, 'k');
      await key(page, 'enter').tap();
      await expect(command(page)).toBeFocused();
      await type(page, 'k');
      await key(page, 'enter').tap();
      await expect(rb(page)).toBeHidden();
      expect((await hotkeys(page))[1]).toEqual({ label: 'k', command: 'k', special: null, shown: true });
      expect(errors).toEqual([]);
    });
  }

  test('a lower window (a phone outside fullscreen): the fields and Save stay in sight above our keyboard, and the chips under them are marked as more', async ({ page }) => {
    await openPhone(page);
    await page.setViewportSize({ width: 800, height: 300 });
    await expect.poll(async () => (await box(page.locator('#app'))).height).toBe(300);
    await frames(page);
    await hold(page, hk(page, 2));
    await custom(page).tap();
    await expectCustomWhole(page);
    expect(await more(page)).toBe('D');
  });
});

test.describe('a tablet upright (820 × 1180, ?tablet=phone)', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test('the box is whole, with no mark of more; Custom empties both fields with the cursor in the Label, Save in sight', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/?replay&tablet=phone&kbd=en');
    await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
    await expect(pad(page)).toBeVisible();
    await hold(page, hk(page, 2));
    expect(await more(page)).toBe('');
    await expectInSight(page, save(page), 'Save (keyboard down)');
    await custom(page).tap();
    await expectCustomWhole(page);
    expect(await more(page)).toBe('');
    expect(errors).toEqual([]);
  });
});
