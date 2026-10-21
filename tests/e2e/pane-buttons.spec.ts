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

test('a clear pane has no fill and no blur, weather off and on; a clear float hides only the game text under it', async ({ page }) => {
  const { cw, ch } = await open(page);
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
  // The clear float hides the game text under it (a hole in the game pane at its box), weather on …
  const g = await box(page, '.wc-pane-group');
  const game = await box(page, '.wc-game');
  // (Browsers write the path back spaced: "M 45 136 H".)
  const at = (v: number) => String(Math.round(v * 100) / 100);
  const hole = new RegExp(`M ?${at(g.x - game.x)} ${at(g.y - game.y)} ?H`);
  await expect.poll(gameClip).toMatch(hole);
  // … and off (the page shows there then).
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: false } }));
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(0);
  await expect.poll(gameClip).toMatch(hole);
  await expect(page.locator('.wc-pane-group')).not.toHaveAttribute('data-weather-see', '');
  // Glass, weather off: opaque, no hole.
  await page.evaluate(() => window.__wc!.settings.update({ panes: { group: { glass: true } } }));
  await expect.poll(gameClip).toBe('');
  await page.evaluate(() => window.__wc!.settings.update({ panes: { group: { glass: false } } }));
  await expect.poll(gameClip).toMatch(hole);

  // Over a docked pane: no hole in it, weather on or off; a glass float cuts one with weather on.
  const right = await box(page, '.wc-pane-comm');
  const paneClip = () => page.evaluate(() => document.querySelector<HTMLElement>('.wc-pane-comm')!.style.clipPath);
  const cockpit = await box(page, '.wc-cockpit');
  const at2 = { x: Math.floor((right.x - cockpit.x) / cw) - 10, y: Math.floor((right.y - cockpit.y) / ch) + 1 };
  await page.evaluate((p) => window.__wc!.settings.update((d) => {
    d.layout.floating = d.layout.floating.map((f) => (f.id === 'group' ? { ...f, ...p } : f));
  }), at2);
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true } }));
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  await expect.poll(gameClip).not.toBe('');
  expect(await paneClip()).toBe('');
  await page.evaluate(() => window.__wc!.settings.update({ panes: { group: { glass: true } } }));
  await expect.poll(paneClip).not.toBe('');
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: false }, panes: { group: { glass: false } } }));
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(0);
  await expect.poll(paneClip).toBe('');

  // Back to glass: the fill comes back.
  await page.evaluate(() => window.__wc!.settings.update({ panes: { comm: { glass: true } } }));
  await expect(page.locator('.wc-pane-comm')).not.toHaveAttribute('data-clear', '');
  expect((await look('comm')).fill).not.toBe('none');
});

test('a borderless pane on hover: the cross at the right edge with the buttons, no background, no name tag', async ({ page }) => {
  const { cw } = await open(page);
  await page.evaluate(() => window.__wc!.settings.update({ panes: { comm: { border: false, color: 'blue' } } }));
  await expect(page.locator('.wc-pane-comm')).not.toHaveAttribute('data-framed', '');
  await hover(page, 'comm');
  const pane = await box(page, '.wc-pane-comm');
  const cross = await box(page, '.wc-pane-comm > .wc-pane-close');
  expect(cross.x + cross.width).toBeCloseTo(pane.x + pane.width, 1);
  expect(cross.y).toBeCloseTo(pane.y, 1);
  const btns = await Promise.all((await page.locator('.wc-pane-comm > .wc-pane-btn').all()).map((b) => b.boundingBox()));
  btns.forEach((b, i) => expect(b!.x + b!.width).toBeCloseTo(cross.x - (2 - i) * 2 * cw, 1));
  // No name tag (ADR 0087 withdrawn), no title bar, no boxes: only the ink.
  await expect(page.locator('.wc-pane-name')).toHaveCount(0);
  const look = () =>
    page.locator('.wc-pane-comm').evaluate((el) => {
      const cs = (s: string) => getComputedStyle(el.querySelector(s)!);
      return {
        bar: getComputedStyle(el, '::before').content,
        btn: cs('.wc-pane-btn-border').backgroundColor,
        cross: cs('.wc-pane-close').backgroundColor,
        ink: cs('.wc-pane-close').color,
        label: el.style.getPropertyValue('--pane-shade-label'),
      };
    });
  const l = await look();
  expect(l).toMatchObject({ bar: 'none', btn: 'rgba(0, 0, 0, 0)', cross: 'rgba(0, 0, 0, 0)' });
  // The ink is the pane's label shade.
  const hex = l.label.trim();
  const rgb = `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  expect(l.ink).toBe(rgb);
  // A framed pane keeps the cross one cell in.
  await hover(page, 'timers');
  const t = await box(page, '.wc-pane-timers');
  expect((await box(page, '.wc-pane-timers > .wc-pane-close')).x).toBeCloseTo(t.x + t.width - 4 * cw, 1);
});

test('a borderless glass pane gets the glass with weather on; weather off it is opaque, clear it is clear', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__wc!.settings.update({ panes: { comm: { border: false, color: 'blue' } } }));
  const look = () =>
    page.locator('.wc-pane-comm').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, blur: cs.backdropFilter, flat: el.parentElement!.hasAttribute('data-weather-flat') };
    });
  await expect.poll(async () => (await look()).bg).toBe('rgb(14, 20, 28)'); // the blue tint, opaque
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true } }));
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  const g = await look();
  expect(g.flat).toBe(test.info().project.name === 'firefox');
  const alpha = (a: string) => new RegExp(`^(rgba\\(14, 20, 28, ${a}\\)|color\\(srgb [0-9. ]+ \\/ ${a}\\))$`);
  if (g.flat) {
    expect(g.bg).toMatch(alpha('0\\.64'));
    expect(g.blur).toBe('none');
  } else {
    expect(g.bg).toMatch(alpha('0\\.55'));
    expect(g.blur).toContain('blur(2.5px)');
  }
  await page.evaluate(() => window.__wc!.settings.update({ panes: { comm: { glass: false } } }));
  await expect(page.locator('.wc-pane-comm')).toHaveAttribute('data-clear', '');
  await expect.poll(look).toMatchObject({ bg: 'rgba(0, 0, 0, 0)', blur: 'none' });
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

test('the weather knows which panes are clear, at once, and follows a clear float that moves (round 2)', async ({ page }) => {
  await open(page);
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      const R = d.layout.docks.right;
      for (const l of [R.head, ...R.lanes.map((x) => x.panes), R.tail]) {
        const i = l.findIndex((p) => p.id === 'group');
        if (i >= 0) l.splice(i, 1);
      }
      d.layout.floating = [...d.layout.floating, { id: 'group', x: 20, y: 4, w: 36, h: 12 }];
      d.panes.group.on = true;
      d.panes.group.glass = false;
      d.weather.enabled = true;
    }),
  );
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  const pane = (id: string) =>
    page.evaluate((i) => {
      const p = window.__wc!.app.weather!.controller!.engine.geometry().panes.find((q) => q.id === i);
      return p ? { clear: p.clear, x: p.box.x } : null;
    }, id);
  await expect.poll(() => pane('group')).toMatchObject({ clear: true });
  await expect.poll(() => pane('comm')).toMatchObject({ clear: false });
  const x0 = (await pane('group'))!.x;
  // Glass, then clear again: the weather follows each switch.
  await page.evaluate(() => window.__wc!.settings.update({ panes: { group: { glass: true }, comm: { glass: false } } }));
  await expect.poll(() => pane('group')).toMatchObject({ clear: false });
  await expect.poll(() => pane('comm')).toMatchObject({ clear: true });
  await page.evaluate(() => window.__wc!.settings.update({ panes: { group: { glass: false } } }));
  await expect.poll(() => pane('group')).toMatchObject({ clear: true });
  // The float moves: its place follows.
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      d.layout.floating = d.layout.floating.map((f) => (f.id === 'group' ? { ...f, x: 30 } : f));
    }),
  );
  await expect.poll(async () => (await pane('group'))!.x).toBeGreaterThan(x0);
});
