// Stage 30c part 2 (ADR 0095 addendum, ADR 0107): the Gear on the Map,
// Comm, Timers and Group panes opens the pane's settings popup beside the
// pane: live changes, one popup at a time with Settings and Panes, Esc,
// closed when the pane is hidden, and placed inside the viewport beside a
// right-docked, a left-docked and a floating pane. Uses the dev-only
// `window.__wc`.
import { type Page, expect, test } from '@playwright/test';

const field = (page: Page) => page.locator('.wc-input-field');
const gear = (page: Page, id: string) => page.locator(`.wc-pane-${id} > .wc-pane-btn-gear`);
const gearPop = (page: Page, id: string) => page.locator(`.wc-sp-gear-${id}`);
const anyPop = (page: Page) => page.locator('.wc-pop');
const icon = (page: Page, id: string) => page.locator(`.wc-mb[data-mb="${id}"]`);
const settings = (page: Page) => page.evaluate(() => window.__wc!.settings.get());

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function open(page: Page): Promise<{ cw: number; ch: number }> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?replay');
  await expect(field(page)).toBeFocused();
  await expect(page.locator('.wc-mb-bar')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return { cw: parseFloat(s.getPropertyValue('--cell-w')), ch: parseFloat(s.getPropertyValue('--cell-h')) };
  });
}

async function box(page: Page, sel: string) {
  const b = await page.locator(sel).boundingBox();
  if (!b) throw new Error(`no box for ${sel}`);
  return b;
}

/** Hovers pane `id` and clicks its Gear. */
async function clickGear(page: Page, id: string): Promise<void> {
  const b = await box(page, `.wc-pane-${id}`);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await gear(page, id).click();
}

/** The popup lies inside the viewport. */
async function insideViewport(page: Page, id: string): Promise<{ x: number; y: number; width: number; height: number }> {
  const p = await box(page, `.wc-sp-gear-${id}`);
  const vw = page.viewportSize()!.width;
  const vh = page.viewportSize()!.height;
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.y).toBeGreaterThanOrEqual(0);
  expect(p.x + p.width).toBeLessThanOrEqual(vw);
  expect(p.y + p.height).toBeLessThanOrEqual(vh);
  return p;
}

/** Moves Comm out of the right dock to `place` (`left`: a left dock lane; else a float). */
async function moveComm(page: Page, place: 'left' | 'float'): Promise<void> {
  await page.evaluate((place) =>
    window.__wc!.settings.update((d) => {
      for (const R of Object.values(d.layout.docks)) {
        for (const l of [R.head, ...R.lanes.map((x) => x.panes), R.tail]) {
          const i = l.findIndex((p) => p.id === 'comm');
          if (i >= 0) l.splice(i, 1);
        }
        R.lanes = R.lanes.filter((x) => x.panes.length > 0);
      }
      if (place === 'left') d.layout.docks.left.lanes = [{ size: 40, panes: [{ id: 'comm', desired: 10 }] }];
      else d.layout.floating = [...d.layout.floating, { id: 'comm', x: 30, y: 6, w: 40, h: 16 }];
      d.panes.comm.on = true;
    }), place);
  // The relayout runs in the next frame; hover the pane where it is then.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test('the Gear: leftmost, named after the pane; opens Comm settings beside the pane; channels change live; it toggles', async ({ page }) => {
  const errors = watchErrors(page);
  const { cw } = await open(page);
  const g = gear(page, 'comm');
  await expect(g).toHaveCount(1);
  await expect(g).toBeHidden();
  const pane = await box(page, '.wc-pane-comm');
  await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
  await expect(g).toBeVisible();
  await expect(g).toHaveAttribute('title', 'Comm settings');
  await expect(g).toHaveAttribute('aria-label', 'Comm settings');
  // Two cells, right next to Colour, in the cross's row.
  const gb = (await g.boundingBox())!;
  const colour = await box(page, '.wc-pane-comm > .wc-pane-btn-color');
  expect(gb.width).toBeCloseTo(2 * cw, 1);
  expect(gb.x + gb.width).toBeCloseTo(colour.x, 1);
  expect(gb.y).toBeCloseTo(colour.y, 1);
  // Character and UI have none.
  await expect(gear(page, 'character')).toHaveCount(0);
  await expect(gear(page, 'ui')).toHaveCount(0);

  await g.click();
  const pop = gearPop(page, 'comm');
  await expect(pop).toBeVisible();
  await expect(pop).toHaveAttribute('aria-label', 'Comm settings');
  await expect(pop.locator('.wc-pop-title')).toHaveText('Comm');
  await expect(pop.locator('.wc-ck-sub')).toHaveText('Channels');
  await expect(pop.locator('.wc-sp-chan[data-channel]')).toHaveCount(10);
  await expect(g).toHaveAttribute('data-open', '');
  // It takes the keys, on its first control (ADR 0108).
  await expect(pop.locator('.wc-sp-body :focus')).toHaveCount(1);
  // Beside the pane, toward the game (Comm is docked right), top-aligned unless kept inside the viewport.
  const p = await insideViewport(page, 'comm');
  expect(p.x + p.width).toBeLessThanOrEqual(pane.x);
  expect(Math.abs(p.y - pane.y) < 1 || p.y + p.height >= page.viewportSize()!.height - 6).toBe(true);
  // A channel off, live; the pane's filters follow; on again.
  const tells = pop.locator('.wc-sp-chan[data-channel="tells"]');
  await tells.locator('[role=switch]').click();
  await expect(tells.locator('[role=switch]')).toHaveAttribute('aria-checked', 'false');
  expect((await settings(page)).comm.filters).toEqual({ tells: false });
  await tells.click();
  expect((await settings(page)).comm.filters).toEqual({});
  await pop.locator('[data-key="show-header"] [role=switch]').click();
  expect((await settings(page)).comm.showHeader).toBe(false);
  // The Gear toggles it.
  await clickGear(page, 'comm');
  await expect(anyPop(page)).toHaveCount(0);
  await expect(g).not.toHaveAttribute('data-open', '');
  expect(errors).toEqual([]);
});

test('one popup at a time with Settings and Panes; Esc closes it', async ({ page }) => {
  await open(page);
  await clickGear(page, 'timers');
  await expect(gearPop(page, 'timers')).toBeVisible();
  // Settings replaces it.
  await icon(page, 'settings').click();
  await expect(page.locator('.wc-sp-settings')).toBeVisible();
  await expect(gearPop(page, 'timers')).toHaveCount(0);
  await expect(gear(page, 'timers')).not.toHaveAttribute('data-open', '');
  // A Gear replaces Settings.
  await clickGear(page, 'group');
  await expect(gearPop(page, 'group')).toBeVisible();
  await expect(page.locator('.wc-sp-settings')).toHaveCount(0);
  await expect(icon(page, 'settings')).not.toHaveClass(/is-open/);
  // Panes replaces it.
  await icon(page, 'panes').click();
  await expect(page.locator('.wc-pop-panes')).toBeVisible();
  await expect(gearPop(page, 'group')).toHaveCount(0);
  await icon(page, 'panes').click();
  await expect(anyPop(page)).toHaveCount(0);
  // Esc in the input closes it (and only it).
  await clickGear(page, 'group');
  await expect(gearPop(page, 'group')).toBeVisible();
  await field(page).focus();
  await page.keyboard.press('Escape');
  await expect(anyPop(page)).toHaveCount(0);
  await expect(page.locator('.wc-overlay')).toBeHidden();
  // Esc inside it closes it and gives the keys back (it took them when it opened).
  await clickGear(page, 'group');
  await expect(gearPop(page, 'group').locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(anyPop(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
});

test('Timers and Group controls write the settings live', async ({ page }) => {
  await open(page);
  await clickGear(page, 'timers');
  const pop = gearPop(page, 'timers');
  await pop.locator('[aria-label="Spells colour"]').click();
  await pop.locator('.wc-ck-opt[data-value="off"]').click();
  expect((await settings(page)).timers.groups.spell.enabled).toBe(false);
  await pop.locator('[aria-label="Time text"]').click();
  expect((await settings(page)).timers.timeText).toBe(false);
  await clickGear(page, 'group');
  const g = gearPop(page, 'group');
  await g.locator('[aria-label="NPC visibility"] [data-value="all"]').click();
  expect((await settings(page)).group.npcMode).toBe('all');
});

test('hiding the pane closes its popup: its cross, a setting', async ({ page }) => {
  await open(page);
  await clickGear(page, 'comm');
  await expect(gearPop(page, 'comm')).toBeVisible();
  // The pane's cross (still hovered).
  await page.locator('.wc-pane-comm > .wc-pane-close').click();
  await expect(page.locator('.wc-pane-comm')).toBeHidden();
  await expect(anyPop(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  // A setting (as Reset layout or a script would).
  await page.evaluate(() => window.__wc!.settings.update({ panes: { comm: { on: true } } }));
  await clickGear(page, 'map');
  await expect(gearPop(page, 'map')).toBeVisible();
  // The Map popup's own Show map pane.
  await gearPop(page, 'map').locator('[aria-label="Show map pane"]').click();
  await expect(anyPop(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  await clickGear(page, 'group');
  await page.evaluate(() => window.__wc!.settings.update({ panes: { group: { on: false } } }));
  await expect(anyPop(page)).toHaveCount(0);
});

test('placed beside a left-docked and a floating pane, inside the viewport, and following the pane', async ({ page }) => {
  await open(page);
  await moveComm(page, 'left');
  await expect(page.locator('.wc-pane-comm')).toBeVisible();
  await clickGear(page, 'comm');
  const pane = await box(page, '.wc-pane-comm');
  expect(pane.x).toBeLessThan(10);
  const p = await insideViewport(page, 'comm');
  // To its right (toward the game), top-aligned (at the top: the viewport margin, 4 px).
  expect(p.x).toBeGreaterThanOrEqual(pane.x + pane.width);
  expect(p.y).toBeCloseTo(Math.max(pane.y, 4), 0);
  // A floating pane: beside it; moved, the popup follows.
  await page.keyboard.press('Escape');
  await moveComm(page, 'float');
  await clickGear(page, 'comm');
  const f = await box(page, '.wc-pane-comm');
  const q = await insideViewport(page, 'comm');
  expect(q.x + q.width <= f.x + 0.5 || q.x >= f.x + f.width - 0.5).toBe(true);
  expect(q.y).toBeCloseTo(Math.max(f.y, 4), 0);
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      d.layout.floating = d.layout.floating.map((x) => (x.id === 'comm' ? { ...x, y: 12 } : x));
    }),
  );
  await expect.poll(async () => Math.round((await box(page, '.wc-sp-gear-comm')).y - (await box(page, '.wc-pane-comm')).y)).toBe(0);
  await insideViewport(page, 'comm');
});
