// Stage 2 package B: docking layout, pane frames, drag, resize, toggles,
// narrow collapse and the too-small screen. Uses the dev-only `window.__wc`.
import { type Page, expect, test } from '@playwright/test';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function open(page: Page, width = 1280, height = 900): Promise<{ cw: number; ch: number; cols: number; rows: number }> {
  await page.setViewportSize({ width, height });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return metrics(page);
}

/** Pins the right dock to Cockpit's fixed heights 9/8/6/10/5 (the default shares them out, ADR 0023). */
async function cockpitHeights(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      const want: Record<string, number> = { character: 9, timers: 8, group: 6, comm: 10, ui: 5 };
      for (const p of d.layout.docks.right.panes) p.desired = want[p.id] ?? p.desired;
    }),
  );
}

async function metrics(page: Page): Promise<{ cw: number; ch: number; cols: number; rows: number }> {
  // Wait for the layout that follows the font load.
  await page.waitForFunction(() => {
    const s = getComputedStyle(document.documentElement);
    const cw = parseFloat(s.getPropertyValue('--cell-w'));
    const el = document.querySelector<HTMLElement>('.wc-cockpit')!;
    return el.dataset.cells === `${Math.floor(el.clientWidth / cw + 1e-6)}x${Math.floor(el.clientHeight / parseFloat(s.getPropertyValue('--cell-h')) + 1e-6)}`;
  });
  return page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const [cols, rows] = document.querySelector<HTMLElement>('.wc-cockpit')!.dataset.cells!.split('x').map(Number);
    return { cw: parseFloat(s.getPropertyValue('--cell-w')), ch: parseFloat(s.getPropertyValue('--cell-h')), cols: cols!, rows: rows! };
  });
}

/** Box of `sel` relative to the cockpit. */
async function box(page: Page, sel: string): Promise<Box> {
  return page.evaluate((s) => {
    const c = document.querySelector('.wc-cockpit')!.getBoundingClientRect();
    const r = document.querySelector(s)!.getBoundingClientRect();
    return { x: r.left - c.left, y: r.top - c.top, width: r.width, height: r.height };
  }, sel);
}

async function origin(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const c = document.querySelector('.wc-cockpit')!.getBoundingClientRect();
    return { x: c.left, y: c.top };
  });
}

const ORDER = ['character', 'timers', 'group', 'comm', 'ui'];

test('default layout: game left, input under it as wide as the game, full-height right column', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { cw, ch, cols, rows } = await open(page);
  const game = await box(page, '.wc-game');
  expect(game).toEqual({ x: 0, y: 0, width: (cols - 34) * cw, height: (rows - 1) * ch });
  const input = await box(page, '.wc-input-slot');
  expect(input).toEqual({ x: 0, y: (rows - 1) * ch, width: (cols - 34) * cw, height: ch });
  // The clock strip sits at the right end of the input line, under the game pane.
  const clock = await box(page, '.wc-input-clock');
  expect(clock.x + clock.width).toBeLessThanOrEqual(game.width + 0.5);

  let y = 0;
  const heights: number[] = [];
  for (const id of ORDER) {
    const b = await box(page, `.wc-pane-${id}`);
    expect(b.x).toBe((cols - 33) * cw);
    expect(b.width).toBe(33 * cw);
    expect(b.y).toBe(y);
    heights.push(Math.round(b.height / ch) - 2);
    y += b.height;
  }
  expect(y).toBe(rows * ch); // the right column reaches the bottom of the window
  // Character keeps 9 content rows; the other four share the rest evenly (ADR 0023).
  expect(heights[0]).toBe(9);
  expect(heights.reduce((a, b) => a + b, 0)).toBe(rows - 2 * ORDER.length);
  expect(Math.max(...heights.slice(1)) - Math.min(...heights.slice(1))).toBeLessThanOrEqual(1);

  const frame = await page.locator('.wc-pane-character .wc-pane-frame').textContent();
  const lines = frame!.split('\n');
  expect(lines[0]).toBe('▛▀▀ Character ' + '▀'.repeat(33 - 2 - 13) + '▜');
  expect(lines[1]).toBe('▌' + ' '.repeat(31) + '▐');
  expect(lines.at(-1)).toBe('▙' + '▄'.repeat(31) + '▟');
  expect(lines.length).toBe(11);
  // Frame glyphs in the pane's border colour over its fill.
  const colors = await page.locator('.wc-pane-timers').evaluate((el) => ({
    bg: getComputedStyle(el).backgroundColor,
    fg: getComputedStyle(el.querySelector('.wc-pane-frame')!).color,
  }));
  expect(colors).toEqual({ bg: 'rgb(0, 0, 0)', fg: 'rgb(41, 41, 41)' }); // None: the terminal background
  await expect(page.locator('.wc-input-field')).toBeFocused();
  expect(errors).toEqual([]);
});

test('toggles, colours and borders apply live; corners are always quadrant', async ({ page }) => {
  const { ch } = await open(page);
  await cockpitHeights(page);
  const set = (patch: object) => page.evaluate((p) => window.__wc!.settings.update(p), patch);
  await set({ panes: { group: { on: false } } });
  await expect(page.locator('.wc-pane-group')).toBeHidden();
  expect((await box(page, '.wc-pane-comm')).y).toBe((11 + 10) * ch);
  await set({ panes: { group: { on: true, color: 'purple', border: false } } });
  await expect(page.locator('.wc-pane-group')).toBeVisible();
  await expect(page.locator('.wc-pane-group .wc-pane-frame')).toHaveText('');
  expect((await box(page, '.wc-pane-group')).height).toBe(6 * ch);
  expect(await page.locator('.wc-pane-group').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(22, 16, 28)');
  expect((await page.locator('.wc-pane-ui .wc-pane-frame').textContent())!.startsWith('▛▀▀ UI ▀')).toBe(true);
});

test('drag a pane by its title row to the left dock', async ({ page }) => {
  const { cw, ch, cols, rows } = await open(page);
  const o = await origin(page);
  const comm = await box(page, '.wc-pane-comm');
  await page.mouse.move(o.x + comm.x + 6 * cw, o.y + comm.y + ch / 2);
  await page.mouse.down();
  await page.mouse.move(o.x + 300, o.y + 300, { steps: 5 });
  await expect(page.locator('.wc-drop-bar')).toBeHidden(); // over the game pane: no target
  await page.mouse.move(o.x + cw / 2, o.y + 300, { steps: 5 });
  await expect(page.locator('.wc-drop-bar')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.wc-drop-bar')).toBeHidden();

  await expect.poll(() => box(page, '.wc-pane-comm')).toMatchObject({ x: 0, y: 0, width: 33 * cw });
  expect(await box(page, '.wc-game')).toMatchObject({ x: 34 * cw, width: (cols - 68) * cw });
  // The left dock runs the full height, beside the input line.
  expect(await box(page, '.wc-pane-comm')).toMatchObject({ height: rows * ch });
  expect(await box(page, '.wc-input-slot')).toEqual({ x: 34 * cw, y: (rows - 1) * ch, width: (cols - 68) * cw, height: ch });
  const left = await page.evaluate(() => window.__wc!.settings.get().layout.docks.left.panes.map((p) => p.id));
  expect(left).toEqual(['comm']);
  await expect(page.locator('.wc-input-field')).toBeFocused();

  // Reorder within the right dock: UI above Character.
  const ui = await box(page, '.wc-pane-ui');
  await page.mouse.move(o.x + ui.x + 6 * cw, o.y + ui.y + ch / 2);
  await page.mouse.down();
  await page.mouse.move(o.x + ui.x + 6 * cw, o.y + 2 * ch, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.__wc!.settings.get().layout.docks.right.panes.map((p) => p.id)))
    .toEqual(['ui', 'character', 'timers', 'group']);
});

test('drag a pane to the top screen edge opens the top dock', async ({ page }) => {
  const { cw, ch, cols, rows } = await open(page);
  const o = await origin(page);
  const comm = await box(page, '.wc-pane-comm');
  await page.mouse.move(o.x + comm.x + 6 * cw, o.y + comm.y + ch / 2);
  await page.mouse.down();
  await page.mouse.move(o.x + 300, o.y + ch / 2, { steps: 8 });
  await expect(page.locator('.wc-drop-bar')).toBeVisible();
  await expect(page.locator('.wc-drop-bar')).toHaveAttribute('data-dock', 'top');
  await page.mouse.up();

  await expect.poll(() => box(page, '.wc-pane-comm')).toEqual({ x: 0, y: 0, width: (cols - 34) * cw, height: 10 * ch });
  expect(await box(page, '.wc-game')).toEqual({ x: 0, y: 11 * ch, width: (cols - 34) * cw, height: (rows - 12) * ch });
  expect(await box(page, '.wc-input-slot')).toEqual({ x: 0, y: (rows - 1) * ch, width: (cols - 34) * cw, height: ch });
  const top = await page.evaluate(() => window.__wc!.settings.get().layout.docks.top);
  expect(top).toEqual({ size: 10, panes: [{ id: 'comm', desired: 30 }] });

  // The gap row under the top dock resizes it.
  const gapY = o.y + 10 * ch + ch / 2;
  await page.mouse.move(o.x + 300, gapY);
  await page.mouse.down();
  await page.mouse.move(o.x + 300, gapY + 4 * ch, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => box(page, '.wc-pane-comm')).toMatchObject({ height: 14 * ch });
  await expect(page.locator('.wc-input-field')).toBeFocused();
});

test('drag a pane to the bottom screen edge docks it under the input line', async ({ page }) => {
  const { cw, ch, cols, rows } = await open(page);
  const o = await origin(page);
  const comm = await box(page, '.wc-pane-comm');
  await page.mouse.move(o.x + comm.x + 6 * cw, o.y + comm.y + ch / 2);
  await page.mouse.down();
  await page.mouse.move(o.x + 300, o.y + rows * ch - ch / 2, { steps: 8 });
  await expect(page.locator('.wc-drop-bar')).toHaveAttribute('data-dock', 'bottom');
  await page.mouse.up();

  const gw = (cols - 34) * cw;
  // Game, input line, gap row, bottom dock (10 rows); the right column still runs to the bottom.
  await expect.poll(() => box(page, '.wc-pane-comm')).toEqual({ x: 0, y: (rows - 10) * ch, width: gw, height: 10 * ch });
  expect(await box(page, '.wc-game')).toEqual({ x: 0, y: 0, width: gw, height: (rows - 12) * ch });
  expect(await box(page, '.wc-input-slot')).toEqual({ x: 0, y: (rows - 12) * ch, width: gw, height: ch });
  const ui = await box(page, '.wc-pane-ui');
  expect(ui.y + ui.height).toBe(rows * ch);

  // The gap row between the input line and the bottom dock resizes it.
  const gapY = o.y + (rows - 11) * ch + ch / 2;
  await page.mouse.move(o.x + 300, gapY);
  await page.mouse.down();
  await page.mouse.move(o.x + 300, gapY - 3 * ch, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => box(page, '.wc-pane-comm')).toMatchObject({ y: (rows - 13) * ch, height: 13 * ch });
  expect(await box(page, '.wc-input-slot')).toMatchObject({ y: (rows - 15) * ch });
  await expect(page.locator('.wc-input-field')).toBeFocused();
});

test('dock and pane resize persist across a reload', async ({ page }) => {
  const { cw, ch, cols } = await open(page);
  const o = await origin(page);
  // The gap column between the game pane and the right dock.
  const gapX = o.x + (cols - 34) * cw + cw / 2;
  await page.mouse.move(gapX, o.y + 200);
  expect(await page.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x!, y!)!).cursor, [gapX, o.y + 200])).toBe('col-resize');
  await page.mouse.down();
  await page.mouse.move(gapX - 5 * cw, o.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => box(page, '.wc-pane-character')).toMatchObject({ width: 38 * cw });

  // The boundary between Character and Timers (bottom of Character's frame).
  const by = o.y + 11 * ch - 2;
  await page.mouse.move(o.x + (cols - 20) * cw, by);
  await page.mouse.down();
  await page.mouse.move(o.x + (cols - 20) * cw, by + 2 * ch, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => box(page, '.wc-pane-character')).toMatchObject({ height: 13 * ch });
  await expect(page.locator('.wc-input-field')).toBeFocused();

  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await metrics(page);
  await expect.poll(() => box(page, '.wc-pane-character')).toMatchObject({ width: 38 * cw, height: 13 * ch });
  expect((await box(page, '.wc-pane-timers')).height).toBe(8 * ch);
});

test('a drag shows its cursor on a shield over the cockpit, gone after the drop', async ({ page }) => {
  const { cw, ch, cols } = await open(page);
  const o = await origin(page);
  /** The topmost element at (x, y), whether it is the shield, and its cursor. */
  const at = (x: number, y: number) =>
    page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(px!, py!)!;
      return { shield: el.classList.contains('wc-drag-shield'), cursor: getComputedStyle(el).cursor };
    }, [x, y]);
  const shield = page.locator('.wc-drag-shield');
  await expect(shield).toBeHidden();

  // Dock resize: the shield carries col-resize over the gap and over the output text.
  const gapX = o.x + (cols - 34) * cw + cw / 2;
  await page.mouse.move(gapX, o.y + 200);
  await page.mouse.down();
  await page.mouse.move(gapX - 3 * cw, o.y + 200, { steps: 3 });
  await expect(shield).toBeVisible();
  expect(await at(gapX - 3 * cw, o.y + 200)).toEqual({ shield: true, cursor: 'col-resize' });
  expect(await at(o.x + 100, o.y + 100)).toEqual({ shield: true, cursor: 'col-resize' });
  await page.mouse.up();
  await expect(shield).toBeHidden();
  await expect.poll(() => box(page, '.wc-pane-character')).toMatchObject({ width: 36 * cw });
  expect((await at(o.x + 100, o.y + 100)).shield).toBe(false);

  // Boundary between two panes: row-resize.
  const by = o.y + 11 * ch - 2;
  await page.mouse.move(o.x + (cols - 20) * cw, by);
  await page.mouse.down();
  await page.mouse.move(o.x + (cols - 20) * cw, by + ch, { steps: 3 });
  expect(await at(o.x + (cols - 20) * cw, by + ch)).toEqual({ shield: true, cursor: 'row-resize' });
  await page.mouse.up();
  await expect(shield).toBeHidden();

  // Moving a pane: no shield before the drag threshold, grabbing once it moves.
  const comm = await box(page, '.wc-pane-comm');
  const gx = o.x + comm.x + 6 * cw;
  const gy = o.y + comm.y + ch / 2;
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await expect(shield).toBeHidden();
  await page.mouse.move(o.x + 300, o.y + 300, { steps: 5 });
  expect(await at(o.x + 300, o.y + 300)).toEqual({ shield: true, cursor: 'grabbing' });
  // Drop it over the game: it floats, so the drop reached the drag logic.
  await page.mouse.up();
  await expect(shield).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.__wc!.settings.get().layout.floating.map((f) => f.id)))
    .toContain('comm');

  // Floating pane edges and corners: their own resize cursors.
  for (const [edge, cursor] of [
    ['se', 'nwse-resize'],
    ['w', 'ew-resize'],
    ['n', 'ns-resize'],
    ['ne', 'nesw-resize'],
  ] as const) {
    const h = await box(page, `.wc-pane-comm .wc-float-handle[data-edge="${edge}"]`);
    const hx = o.x + h.x + h.width / 2;
    const hy = o.y + h.y + h.height / 2;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    expect(await at(hx, hy), edge).toEqual({ shield: true, cursor });
    await page.mouse.up();
    await expect(shield).toBeHidden();
  }
});

test('too-small window shows a notice and recovers', async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 400, height: 250 });
  await expect(page.locator('.wc-too-small')).toBeVisible();
  await expect(page.locator('.wc-too-small')).toContainText('Window too small');
  await expect(page.locator('.wc-input-slot')).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.wc-too-small')).toBeHidden();
  await expect(page.locator('.wc-input-field')).toBeFocused();
});

test('narrow window collapses the side dock and restores it when widened', async ({ page }) => {
  const { cw } = await open(page);
  // 62 columns: 62 − 34 < 30.
  await page.setViewportSize({ width: Math.ceil(62.5 * cw), height: 900 });
  await expect(page.locator('.wc-cockpit')).toHaveAttribute('data-collapsed', 'right');
  for (const id of ORDER) await expect(page.locator(`.wc-pane-${id}`)).toBeHidden();
  const { cols } = await metrics(page);
  expect((await box(page, '.wc-game')).width).toBe(cols * cw);
  // The side panes stay on (the map too: on by default).
  expect(await page.evaluate(() => Object.values(window.__wc!.settings.get().panes).every((p) => p.on))).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.wc-cockpit')).toHaveAttribute('data-collapsed', '');
  for (const id of ORDER) await expect(page.locator(`.wc-pane-${id}`)).toBeVisible();
});

/** Floating panes other than the map (whose default entry stays backmost, ADR 0020). */
const floating = (page: Page) =>
  page.evaluate(() => window.__wc!.settings.get().layout.floating.filter((f) => f.id !== 'map'));

test('floating pane: drop over the game, move, resize, reload, dock again', async ({ page }) => {
  const { cw, ch, cols, rows } = await open(page);
  const o = await origin(page);
  const grip = async (id: string, dx = 6): Promise<{ x: number; y: number }> => {
    const b = await box(page, `.wc-pane-${id}`);
    return { x: o.x + b.x + dx * cw + cw / 2, y: o.y + b.y + ch / 2 };
  };

  // Drag Comm out of the right dock over the game pane: an outline shows where.
  let g = await grip('comm');
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(o.x + 300, o.y + 300, { steps: 6 });
  await expect(page.locator('.wc-drop-ghost')).toBeVisible();
  await expect(page.locator('.wc-drop-bar')).toBeHidden();
  await page.mouse.up();
  await expect(page.locator('.wc-drop-ghost')).toBeHidden();
  let x = Math.floor(300 / cw) - 6;
  let y = Math.floor(300 / ch);
  // A docked pane floats at the standard size, 36 × 14 cells.
  await expect.poll(() => floating(page)).toEqual([{ id: 'comm', x, y, w: 36, h: 14 }]);
  await expect.poll(() => box(page, '.wc-pane-comm')).toEqual({ x: x * cw, y: y * ch, width: 36 * cw, height: 14 * ch });
  await expect(page.locator('.wc-pane-comm')).toHaveAttribute('data-floating', '');
  // The docks and the game pane keep their places; Comm lies over the game.
  expect(await box(page, '.wc-game')).toEqual({ x: 0, y: 0, width: (cols - 34) * cw, height: (rows - 1) * ch });
  const style = await page.locator('.wc-pane-comm').evaluate((el) => ({
    z: getComputedStyle(el).zIndex,
    bg: getComputedStyle(el).backgroundColor,
  }));
  expect(style).toEqual({ z: '11', bg: 'rgb(0, 0, 0)' }); // opaque None: the terminal background (z 10: the map's slot)
  await expect(page.locator('.wc-input-field')).toBeFocused();

  // Move it by its title row.
  g = await grip('comm', 3);
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x + 5 * cw, g.y + 3 * ch, { steps: 5 });
  await page.mouse.up();
  x += 5;
  y += 3;
  await expect.poll(() => floating(page)).toEqual([{ id: 'comm', x, y, w: 36, h: 14 }]);
  await expect.poll(() => box(page, '.wc-pane-comm')).toMatchObject({ x: x * cw, y: y * ch });

  // Resize from the bottom-right corner, then from the left edge.
  let b = await box(page, '.wc-pane-comm');
  const se = { x: o.x + b.x + b.width - cw / 2, y: o.y + b.y + b.height - ch / 2 };
  await page.mouse.move(se.x, se.y);
  expect(await page.evaluate(([px, py]) => getComputedStyle(document.elementFromPoint(px!, py!)!).cursor, [se.x, se.y])).toBe('nwse-resize');
  await page.mouse.down();
  await page.mouse.move(se.x + 4 * cw, se.y + 2 * ch, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => floating(page)).toEqual([{ id: 'comm', x, y, w: 40, h: 16 }]);
  await expect.poll(() => box(page, '.wc-pane-comm')).toMatchObject({ width: 40 * cw, height: 16 * ch });
  b = await box(page, '.wc-pane-comm');
  const w = { x: o.x + b.x + 2, y: o.y + b.y + b.height / 2 };
  await page.mouse.move(w.x, w.y);
  await page.mouse.down();
  await page.mouse.move(w.x - 3 * cw, w.y, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => floating(page)).toEqual([{ id: 'comm', x: x - 3, y, w: 43, h: 16 }]);
  x -= 3;
  await expect.poll(() => box(page, '.wc-pane-comm')).toEqual({ x: x * cw, y: y * ch, width: 43 * cw, height: 16 * ch });
  const frame = (await page.locator('.wc-pane-comm .wc-pane-frame').textContent())!.split('\n');
  expect(frame[0]).toBe('▛▀▀ Comm ' + '▀'.repeat(43 - 2 - 8) + '▜');
  expect(frame).toHaveLength(16);
  await expect(page.locator('.wc-input-field')).toBeFocused();

  // A reload keeps it.
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await metrics(page);
  await expect.poll(() => box(page, '.wc-pane-comm')).toEqual({ x: x * cw, y: y * ch, width: 43 * cw, height: 16 * ch });

  // Over the right dock (not at the edge) it stays floating; at the right
  // screen edge it docks into the right column where the bar shows.
  g = await grip('comm', 3);
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(o.x + (cols - 20) * cw, o.y + 3 * ch, { steps: 6 });
  await expect(page.locator('.wc-drop-ghost')).toBeVisible();
  await expect(page.locator('.wc-drop-bar')).toBeHidden();
  await page.mouse.move(o.x + cols * cw - cw / 2, o.y + 3 * ch, { steps: 4 });
  await expect(page.locator('.wc-drop-bar')).toBeVisible();
  await expect(page.locator('.wc-drop-bar')).toHaveAttribute('data-dock', 'right');
  await page.mouse.up();
  await expect.poll(() => floating(page)).toEqual([]);
  await expect
    .poll(() => page.evaluate(() => window.__wc!.settings.get().layout.docks.right.panes.map((p) => p.id)))
    .toEqual(['comm', 'character', 'timers', 'group', 'ui']);
  await expect(page.locator('.wc-pane-comm')).not.toHaveAttribute('data-floating');
  expect(await box(page, '.wc-pane-comm')).toMatchObject({ x: (cols - 33) * cw, y: 0, width: 33 * cw });
});

test('floating panes come to front on a press and stay inside a smaller window', async ({ page }) => {
  const { cw, ch } = await open(page);
  const o = await origin(page);
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      d.layout.docks.right.panes = d.layout.docks.right.panes.filter((p) => p.id !== 'comm' && p.id !== 'ui');
      d.layout.floating = [
        { id: 'comm', x: 60, y: 30, w: 30, h: 12 },
        { id: 'ui', x: 70, y: 35, w: 30, h: 12 },
      ];
    }),
  );
  // z 10 is the map's slot (off).
  await expect(page.locator('.wc-pane-ui')).toHaveCSS('z-index', '12');
  // A click on Comm's content (where UI does not cover it) brings it to front
  // and returns the focus to the input.
  await page.mouse.click(o.x + 62 * cw, o.y + 33 * ch);
  await expect.poll(() => floating(page).then((f) => f.map((p) => p.id))).toEqual(['ui', 'comm']);
  await expect(page.locator('.wc-pane-comm')).toHaveCSS('z-index', '12');
  await expect(page.locator('.wc-input-field')).toBeFocused();

  // A smaller window: both are moved inside it; the stored places are kept.
  await page.setViewportSize({ width: 800, height: 500 });
  const m = await metrics(page);
  for (const id of ['comm', 'ui']) {
    const b = await box(page, `.wc-pane-${id}`);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(m.cols * cw);
    expect(b.y + b.height).toBeLessThanOrEqual(m.rows * ch);
    expect(b.width).toBe(30 * cw);
  }
  expect((await box(page, '.wc-pane-ui')).x).toBe((m.cols - 30) * cw);
  // Too small: the notice, as for docked panes.
  await page.setViewportSize({ width: 400, height: 250 });
  await expect(page.locator('.wc-too-small')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.wc-too-small')).toBeHidden();
  await expect.poll(() => box(page, '.wc-pane-comm')).toMatchObject({ x: 60 * cw, y: 30 * ch });
  expect(await floating(page)).toEqual([
    { id: 'ui', x: 70, y: 35, w: 30, h: 12 },
    { id: 'comm', x: 60, y: 30, w: 30, h: 12 },
  ]);
});

test('a tall docked pane dragged out floats at the standard 36 × 14 size', async ({ page }) => {
  const { cw, ch, rows } = await open(page);
  const o = await origin(page);
  // Comm alone in the right column: it is the full window height.
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      d.layout.docks.left.panes = d.layout.docks.right.panes.filter((p) => p.id !== 'comm');
      d.layout.docks.right.panes = d.layout.docks.right.panes.filter((p) => p.id === 'comm');
    }),
  );
  await expect.poll(() => box(page, '.wc-pane-comm')).toMatchObject({ y: 0, height: rows * ch });
  const comm = await box(page, '.wc-pane-comm');
  await page.mouse.move(o.x + comm.x + 4 * cw + cw / 2, o.y + ch / 2);
  await page.mouse.down();
  const px = 45 * cw + cw / 2;
  const py = 12 * ch + ch / 2;
  await page.mouse.move(o.x + px, o.y + py, { steps: 6 });
  // The outline already shows the standard size.
  await expect.poll(() => box(page, '.wc-drop-ghost')).toEqual({ x: 41 * cw, y: 12 * ch, width: 36 * cw, height: 14 * ch });
  await page.mouse.up();
  await expect.poll(() => floating(page)).toEqual([{ id: 'comm', x: 41, y: 12, w: 36, h: 14 }]);
  await expect.poll(() => box(page, '.wc-pane-comm')).toEqual({ x: 41 * cw, y: 12 * ch, width: 36 * cw, height: 14 * ch });
  await expect(page.locator('.wc-input-field')).toBeFocused();
});
