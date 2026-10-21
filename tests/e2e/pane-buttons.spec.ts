// Stage 29 (ADR 0095): the pane hover buttons (Colour, Border, Background)
// left of the close cross, and the clear background. Uses the dev-only
// `window.__wc`.
import { type Page, expect, test } from '@playwright/test';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function open(page: Page): Promise<{ cw: number; ch: number }> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-pane-timers')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return { cw: parseFloat(s.getPropertyValue('--cell-w')), ch: parseFloat(s.getPropertyValue('--cell-h')) };
  });
}

async function box(page: Page, sel: string): Promise<Box> {
  const b = await page.locator(sel).boundingBox();
  if (!b) throw new Error(`no box for ${sel}`);
  return b;
}

/** Moves the pointer into the middle of pane `id`. */
async function hover(page: Page, id: string): Promise<void> {
  const b = await box(page, `.wc-pane-${id}`);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
}

const panes = (page: Page) => page.evaluate(() => window.__wc!.settings.get().panes);

test('hovering a pane shows Colour, Border and Background left of the cross; clicks change the pane, keep the focus, start no drag', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { cw } = await open(page);
  const btns = page.locator('.wc-pane-timers > .wc-pane-btn');
  await expect(btns).toHaveCount(3);
  await expect(btns.first()).toBeHidden();
  await hover(page, 'timers');
  for (const b of await btns.all()) await expect(b).toBeVisible();
  // Two cells each, side by side, ending where the cross begins, in its row.
  const cross = await box(page, '.wc-pane-timers > .wc-pane-close');
  const boxes = await Promise.all((await btns.all()).map((b) => b.boundingBox()));
  boxes.forEach((b, i) => {
    expect(b!.width).toBeCloseTo(2 * cw, 1);
    expect(b!.x + b!.width).toBeCloseTo(cross.x - (2 - i) * 2 * cw, 1);
    expect(b!.y).toBeCloseTo(cross.y, 1);
    expect(b!.height).toBeCloseTo(cross.height, 1);
  });
  expect(await btns.evaluateAll((els) => els.map((e) => e.getAttribute('title')))).toEqual(['Colour: Plain', 'Border: on', 'Background: glass']);
  expect(await btns.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Colour: Plain', 'Border: on', 'Background: glass']);
  // Other panes' buttons stay hidden.
  await expect(page.locator('.wc-pane-group > .wc-pane-btn').first()).toBeHidden();

  const colour = page.locator('.wc-pane-timers > .wc-pane-btn-color');
  await colour.click();
  expect((await panes(page)).timers.color).toBe('red');
  await expect(colour).toHaveAttribute('title', 'Colour: Red');
  await expect(page.locator('.wc-input-field')).toBeFocused();
  for (let i = 0; i < 6; i++) await colour.click();
  expect((await panes(page)).timers.color).toBe('black');
  // No drag started: still docked.
  expect(await page.evaluate(() => window.__wc!.settings.get().layout.floating.map((f) => f.id))).not.toContain('timers');

  const border = page.locator('.wc-pane-timers > .wc-pane-btn-border');
  await border.click();
  await expect(page.locator('.wc-pane-timers')).not.toHaveAttribute('data-framed', '');
  await expect(border).toHaveAttribute('aria-label', 'Border: off');
  await hover(page, 'timers');
  await border.click();
  await expect(page.locator('.wc-pane-timers')).toHaveAttribute('data-framed', '');

  const glass = page.locator('.wc-pane-timers > .wc-pane-btn-glass');
  await glass.click();
  await expect(page.locator('.wc-pane-timers')).toHaveAttribute('data-clear', '');
  await expect(glass).toHaveAttribute('title', 'Background: clear');
  expect((await panes(page)).timers).toEqual({ on: true, color: 'black', border: true, glass: false });
  await expect(page.locator('.wc-input-field')).toBeFocused();
  expect(errors).toEqual([]);
});

test('the look buttons hide while a pane is dragged, and a narrow pane drops them from the left', async ({ page }) => {
  const { cw, ch } = await open(page);
  // Drag Timers by its title row: the buttons go with the cross.
  const t = await box(page, '.wc-pane-timers');
  await page.mouse.move(t.x + 2 * cw, t.y + ch / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + 2 * cw - 80, t.y + ch / 2 + 40, { steps: 4 });
  await expect(page.locator('.wc-drag-shield')).toBeVisible();
  await expect(page.locator('.wc-pane > .wc-pane-btn:visible')).toHaveCount(0);
  // Back where it started: the drop is no move.
  await page.mouse.move(t.x + 2 * cw, t.y + ch / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.wc-drag-shield')).toBeHidden();

  // A narrow lane of its own: Colour goes first, the cross stays.
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      const R = d.layout.docks.right;
      const all = [...R.head, ...R.lanes.flatMap((l) => l.panes), ...R.tail];
      R.head = [];
      R.tail = [];
      R.lanes = [
        { size: 30, panes: all.filter((p) => p.id !== 'timers') },
        { size: 17, panes: all.filter((p) => p.id === 'timers') },
      ];
    }),
  );
  await page.mouse.move(2, 2);
  await hover(page, 'timers');
  await expect(page.locator('.wc-pane-timers > .wc-pane-close')).toBeVisible();
  await expect(page.locator('.wc-pane-timers > .wc-pane-btn-color')).toBeHidden();
  // What stays is the buttons next to the cross.
  const drops = await page.locator('.wc-pane-timers > .wc-pane-btn').evaluateAll((els) => els.map((e) => e.hasAttribute('data-drop')));
  expect(drops[0]).toBe(true);
  expect(drops).toEqual([...drops].sort().reverse());
  // Never over the nameplate.
  const plate = await box(page, '.wc-pane-timers .wc-pane-title');
  const shown = page.locator('.wc-pane-timers > .wc-pane-btn:visible');
  for (const b of await shown.all()) expect((await b.boundingBox())!.x).toBeGreaterThanOrEqual(plate.x + plate.width);
});

test('a script pane made without a cross has no look buttons; the built-in panes have them', async ({ page }) => {
  await open(page);
  // The pane bar (`cross = false`): none shown.
  const bar = page.locator('.wc-pane[data-pane="panebar/bar"]');
  if (await bar.count()) {
    await bar.hover();
    await expect(bar.locator('> .wc-pane-btn:visible')).toHaveCount(0);
  }
  // Built-in panes all have them.
  for (const id of ['timers', 'group', 'comm']) await expect(page.locator(`.wc-pane-${id} > .wc-pane-btn`)).toHaveCount(3);
});

test('a clear pane has no fill and no blur, weather off and on; a clear float cuts no hole in the game text', async ({ page }) => {
  await open(page);
  // Group floats over the game text.
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      const R = d.layout.docks.right;
      for (const l of [R.head, ...R.lanes.map((x) => x.panes), R.tail]) {
        const i = l.findIndex((p) => p.id === 'group');
        if (i >= 0) l.splice(i, 1);
      }
      d.layout.floating = [...d.layout.floating, { id: 'group', x: 5, y: 8, w: 36, h: 12 }];
      d.panes.group.on = true;
      d.panes.group.color = 'red';
      d.panes.comm.color = 'blue';
    }),
  );
  const look = (id: string) =>
    page.locator(`.wc-pane-${id}`).evaluate((el) => {
      const cs = getComputedStyle(el);
      const fill = getComputedStyle(el.querySelector('.wc-pane-frame')!, '::before');
      return {
        own: cs.backgroundColor,
        fill: fill.display === 'none' ? 'none' : fill.backgroundColor,
        blur: getComputedStyle(el.querySelector('.wc-pane-blur')!).display,
        rim: getComputedStyle(el.querySelector('.wc-pane-rim')!).display,
      };
    });
  const gameClip = () => page.evaluate(() => document.querySelector<HTMLElement>('.wc-game')!.style.clipPath);

  // Weather off: glass is the opaque tint; clear has none, and the float's ring goes too.
  expect((await look('comm')).fill).not.toBe('none');
  await page.evaluate(() => window.__wc!.settings.update({ panes: { comm: { glass: false }, group: { glass: false } } }));
  await expect(page.locator('.wc-pane-comm')).toHaveAttribute('data-clear', '');
  expect(await look('comm')).toMatchObject({ own: 'rgba(0, 0, 0, 0)', fill: 'none', blur: 'none', rim: 'block' });
  expect(await look('group')).toMatchObject({ own: 'rgba(0, 0, 0, 0)', fill: 'none' });

  // Weather on.
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true } }));
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  await expect(page.locator('.wc-pane-group')).toHaveAttribute('data-weather-see', '');
  expect(await look('comm')).toMatchObject({ own: 'rgba(0, 0, 0, 0)', fill: 'none', blur: 'none', rim: 'block' });
  expect(await look('group')).toMatchObject({ own: 'rgba(0, 0, 0, 0)', fill: 'none', blur: 'none' });
  // The rim keeps the unblurred glass mix.
  expect(await page.locator('.wc-pane-comm').evaluate((el) => getComputedStyle(el).getPropertyValue('--glass-mix').trim())).toBe('60%');
  // The clear float cuts no hole: the game's clip is what it is with Group off.
  const clear = await gameClip();
  await page.evaluate(() => window.__wc!.settings.update({ panes: { group: { glass: true } } }));
  await expect.poll(gameClip).not.toBe(clear);
  await page.evaluate(() => window.__wc!.settings.update({ panes: { group: { on: false } } }));
  await expect.poll(gameClip).toBe(clear);

  // Back to glass: the fill comes back.
  await page.evaluate(() => window.__wc!.settings.update({ panes: { comm: { glass: true } } }));
  await expect(page.locator('.wc-pane-comm')).not.toHaveAttribute('data-clear', '');
  expect((await look('comm')).fill).not.toBe('none');
});

test('a borderless clear pane has no background, the buttons no box', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__wc!.settings.update({ panes: { comm: { border: false, color: 'blue' } } }));
  await hover(page, 'comm');
  const bg = (sel: string) => page.locator(sel).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await bg('.wc-pane-comm')).not.toBe('rgba(0, 0, 0, 0)');
  await page.locator('.wc-pane-comm > .wc-pane-btn-glass').click();
  await hover(page, 'comm');
  expect(await bg('.wc-pane-comm')).toBe('rgba(0, 0, 0, 0)');
  expect(await bg('.wc-pane-comm > .wc-pane-btn-border')).toBe('rgba(0, 0, 0, 0)');
  expect(await bg('.wc-pane-comm > .wc-pane-close')).toBe('rgba(0, 0, 0, 0)');
});

test('the look is kept over a reload', async ({ page }) => {
  await open(page);
  await hover(page, 'group');
  await page.locator('.wc-pane-group > .wc-pane-btn-color').click();
  await page.locator('.wc-pane-group > .wc-pane-btn-glass').click();
  await expect(page.locator('.wc-pane-group')).toHaveAttribute('data-clear', '');
  // The settings store saves 200 ms after a change (and on pagehide).
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator('.wc-pane-group')).toHaveAttribute('data-clear', '');
  expect((await panes(page)).group).toMatchObject({ color: 'red', glass: false });
});
