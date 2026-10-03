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
      for (const p of d.layout.docks.right.lanes[0]!.panes) p.desired = want[p.id] ?? p.desired;
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
  const left = await page.evaluate(() => window.__wc!.settings.get().layout.docks.left.lanes.flatMap((l) => l.panes).map((p) => p.id));
  expect(left).toEqual(['comm']);
  await expect(page.locator('.wc-input-field')).toBeFocused();

  // Reorder within the right dock: UI above Character.
  const ui = await box(page, '.wc-pane-ui');
  await page.mouse.move(o.x + ui.x + 6 * cw, o.y + ui.y + ch / 2);
  await page.mouse.down();
  await page.mouse.move(o.x + ui.x + 6 * cw, o.y + 2 * ch, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.__wc!.settings.get().layout.docks.right.lanes.flatMap((l) => l.panes).map((p) => p.id)))
    .toEqual(['ui', 'character', 'timers', 'group']);
});

test('drag a pane to the top screen edge opens the top dock', async ({ page }) => {
  const { cw, ch, cols, rows } = await open(page);
  const o = await origin(page);
  const comm = await box(page, '.wc-pane-comm');
  await page.mouse.move(o.x + comm.x + 6 * cw, o.y + comm.y + ch / 2);
  await page.mouse.down();
  // The lower half of the top row floats the pane at row 0; only the upper
  // half is the dock zone.
  await page.mouse.move(o.x + 300, o.y + (ch * 3) / 4, { steps: 8 });
  await expect(page.locator('.wc-drop-bar')).toBeHidden();
  await expect(page.locator('.wc-drop-ghost')).toBeVisible();
  expect((await box(page, '.wc-drop-ghost')).y).toBe(0);
  await page.mouse.move(o.x + 300, o.y + ch / 4, { steps: 2 });
  await expect(page.locator('.wc-drop-bar')).toBeVisible();
  await expect(page.locator('.wc-drop-bar')).toHaveAttribute('data-dock', 'top');
  await page.mouse.up();

  await expect.poll(() => box(page, '.wc-pane-comm')).toEqual({ x: 0, y: 0, width: (cols - 34) * cw, height: 10 * ch });
  expect(await box(page, '.wc-game')).toEqual({ x: 0, y: 11 * ch, width: (cols - 34) * cw, height: (rows - 12) * ch });
  expect(await box(page, '.wc-input-slot')).toEqual({ x: 0, y: (rows - 1) * ch, width: (cols - 34) * cw, height: ch });
  const top = await page.evaluate(() => window.__wc!.settings.get().layout.docks.top);
  expect(top).toEqual({ lanes: [{ size: 10, panes: [{ id: 'comm', desired: 30 }] }], head: [], tail: [] });

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

test('dock lanes: a second column by drag, lane boundary resize, reload, empty lane removed', async ({ page }) => {
  const { cw, ch, cols, rows } = await open(page);
  const o = await origin(page);
  const lanes = () =>
    page.evaluate(() =>
      window.__wc!.settings.get().layout.docks.right.lanes.map((l) => [l.size, l.panes.map((p) => p.id)] as const),
    );

  // Drag Comm to the inner (left) edge band of the right column: a full-height
  // vertical bar along the column edge, and a new column inside it.
  const comm = await box(page, '.wc-pane-comm');
  await page.mouse.move(o.x + comm.x + 6 * cw, o.y + comm.y + ch / 2);
  await page.mouse.down();
  await page.mouse.move(o.x + (cols - 33) * cw + cw / 2, o.y + 300, { steps: 8 });
  await expect(page.locator('.wc-drop-bar')).toBeVisible();
  const bar = await box(page, '.wc-drop-bar');
  expect(bar.height).toBe(rows * ch);
  expect(Math.abs(bar.x + bar.width / 2 - (cols - 33) * cw)).toBeLessThanOrEqual(1);
  await page.mouse.up();
  await expect.poll(lanes).toEqual([
    [33, ['character', 'timers', 'group', 'ui']],
    [33, ['comm']],
  ]);
  await expect.poll(() => box(page, '.wc-pane-comm')).toEqual({ x: (cols - 66) * cw, y: 0, width: 33 * cw, height: rows * ch });
  const gameW = (cols - 67) * cw;
  expect(await box(page, '.wc-game')).toMatchObject({ x: 0, width: gameW });
  await expect(page.locator('.wc-input-field')).toBeFocused();

  // The boundary between the columns (the right part of the inner column's
  // last column) moves cells between them; the game pane keeps its width.
  const bx = o.x + (cols - 33) * cw - 2;
  await page.mouse.move(bx, o.y + 300);
  expect(await page.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x!, y!)!).cursor, [bx, o.y + 300])).toBe('col-resize');
  await page.mouse.down();
  await page.mouse.move(bx - 5 * cw, o.y + 300, { steps: 5 });
  await page.mouse.up();
  await expect.poll(lanes).toEqual([
    [38, ['character', 'timers', 'group', 'ui']],
    [28, ['comm']],
  ]);
  await expect.poll(() => box(page, '.wc-pane-character')).toMatchObject({ x: (cols - 38) * cw, width: 38 * cw });
  expect(await box(page, '.wc-pane-comm')).toMatchObject({ x: (cols - 66) * cw, width: 28 * cw });
  expect(await box(page, '.wc-game')).toMatchObject({ width: gameW });

  // The gap next to the game pane resizes the inner column only.
  const gapX = o.x + (cols - 67) * cw + cw / 2;
  await page.mouse.move(gapX, o.y + 300);
  await page.mouse.down();
  await page.mouse.move(gapX + 3 * cw, o.y + 300, { steps: 3 });
  await page.mouse.up();
  await expect.poll(lanes).toEqual([
    [38, ['character', 'timers', 'group', 'ui']],
    [25, ['comm']],
  ]);
  await expect.poll(() => box(page, '.wc-game')).toMatchObject({ width: (cols - 64) * cw });

  // A reload keeps both columns.
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await metrics(page);
  await expect.poll(() => box(page, '.wc-pane-comm')).toEqual({ x: (cols - 63) * cw, y: 0, width: 25 * cw, height: rows * ch });
  expect(await box(page, '.wc-pane-character')).toMatchObject({ x: (cols - 38) * cw, width: 38 * cw });

  // Moving the last pane out of the inner column removes it; the game pane
  // gets the space back.
  const c2 = await box(page, '.wc-pane-comm');
  await page.mouse.move(o.x + c2.x + 6 * cw, o.y + c2.y + ch / 2);
  await page.mouse.down();
  await page.mouse.move(o.x + (cols - 20) * cw, o.y + 2 * ch, { steps: 8 });
  await expect(page.locator('.wc-drop-bar')).toBeVisible();
  await page.mouse.up();
  await expect.poll(lanes).toEqual([[38, ['comm', 'character', 'timers', 'group', 'ui']]]);
  await expect.poll(() => box(page, '.wc-game')).toMatchObject({ width: (cols - 39) * cw });
  expect(await box(page, '.wc-pane-comm')).toMatchObject({ x: (cols - 38) * cw, y: 0, width: 38 * cw });
});

test('dock lanes: a second row in the bottom dock from the upper edge band', async ({ page }) => {
  const { cw, ch, cols, rows } = await open(page);
  const o = await origin(page);
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      const lane = d.layout.docks.right.lanes[0]!;
      d.layout.docks.bottom.lanes = [{ size: 10, panes: lane.panes.filter((p) => p.id === 'comm') }];
      lane.panes = lane.panes.filter((p) => p.id !== 'comm');
    }),
  );
  await expect.poll(() => box(page, '.wc-pane-comm')).toMatchObject({ y: (rows - 10) * ch, height: 10 * ch });
  // UI to the upper band of the bottom row: a horizontal bar, a new row above it.
  const ui = await box(page, '.wc-pane-ui');
  await page.mouse.move(o.x + ui.x + 6 * cw, o.y + ui.y + ch / 2);
  await page.mouse.down();
  await page.mouse.move(o.x + 300, o.y + (rows - 10) * ch + ch / 2, { steps: 8 });
  await expect(page.locator('.wc-drop-bar')).toBeVisible();
  expect((await box(page, '.wc-drop-bar')).width).toBe((cols - 34) * cw);
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.__wc!.settings.get().layout.docks.bottom.lanes.map((l) => [l.size, l.panes.map((p) => p.id)])))
    .toEqual([
      [10, ['comm']],
      [10, ['ui']],
    ]);
  await expect.poll(() => box(page, '.wc-pane-ui')).toEqual({ x: 0, y: (rows - 20) * ch, width: (cols - 34) * cw, height: 10 * ch });
  expect(await box(page, '.wc-input-slot')).toMatchObject({ y: (rows - 22) * ch });
});

/** The right dock's spans and lanes as pane ids (ADR 0067). */
const rightShape = (page: Page) =>
  page.evaluate(() => {
    const d = window.__wc!.settings.get().layout.docks.right;
    const ids = (l: { id: string }[]) => l.map((p) => p.id);
    return { head: ids(d.head), lanes: d.lanes.map((l) => ids(l.panes)), tail: ids(d.tail) };
  });

/** Presses at (x, y) cockpit px, moves to (x2, y2) in steps (the drop is the caller's). */
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const o = await origin(page);
  await page.mouse.move(o.x + from.x, o.y + from.y);
  await page.mouse.down();
  await page.mouse.move(o.x + to.x, o.y + to.y, { steps: 8 });
}

test('spanning panes: the map across two right columns, a pane under it, resize, dissolve, fold, reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { cw, ch, cols } = await open(page);
  // Two right columns of 33: lane 0 (outer) = Character, Timers, Group, UI; lane 1 = Comm, Map.
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      const lane = d.layout.docks.right.lanes[0]!;
      const take = (ids: string[]) => lane.panes.filter((p) => ids.includes(p.id));
      d.layout.docks.right.lanes = [
        { size: 33, panes: take(['character', 'timers', 'group', 'ui']) },
        { size: 33, panes: [...take(['comm']), { id: 'map', desired: 20 }] },
      ];
      d.layout.floating = d.layout.floating.filter((f) => f.id !== 'map');
      d.panes.map.on = true;
    }),
  );
  const dockX = (cols - 66) * cw;
  await expect.poll(() => box(page, '.wc-pane-map')).toMatchObject({ x: dockX, width: 33 * cw });

  // Map by its title row to the region's first row over the outer column:
  // a dock-wide bar and a dashed outline of the box it gets.
  let map = await box(page, '.wc-pane-map');
  await dragTo(page, { x: map.x + 6 * cw, y: map.y + ch / 2 }, { x: (cols - 20) * cw, y: ch / 2 });
  await expect(page.locator('.wc-drop-bar')).toBeVisible();
  await expect(page.locator('.wc-drop-bar')).toHaveAttribute('data-span', '');
  expect(await box(page, '.wc-drop-bar')).toMatchObject({ x: dockX, width: 66 * cw });
  await expect(page.locator('.wc-drop-ghost')).toBeVisible();
  await expect(page.locator('.wc-drop-ghost')).toHaveAttribute('data-span', '');
  const ghost = await box(page, '.wc-drop-ghost');
  expect(ghost).toMatchObject({ x: dockX, y: 0, width: 66 * cw });
  await page.mouse.up();
  await expect(page.locator('.wc-drop-ghost')).toBeHidden();
  await expect.poll(() => rightShape(page)).toEqual({
    head: ['map'],
    lanes: [['character', 'timers', 'group', 'ui'], ['comm']],
    tail: [],
  });
  await expect.poll(() => box(page, '.wc-pane-map')).toEqual(ghost);
  map = await box(page, '.wc-pane-map');
  // The columns below it.
  expect(await box(page, '.wc-pane-character')).toMatchObject({ x: (cols - 33) * cw, y: map.height, width: 33 * cw });
  expect(await box(page, '.wc-pane-comm')).toMatchObject({ x: dockX, y: map.height, width: 33 * cw });
  await expect(page.locator('.wc-input-field')).toBeFocused();

  // UI into the span stack, under the map (the lower half of the map).
  let ui = await box(page, '.wc-pane-ui');
  await dragTo(page, { x: ui.x + 6 * cw, y: ui.y + ch / 2 }, { x: dockX + 40 * cw, y: map.y + map.height - 1.5 * ch });
  await expect(page.locator('.wc-drop-bar')).toHaveAttribute('data-span', '');
  await expect(page.locator('.wc-drop-ghost')).toBeVisible();
  await page.mouse.up();
  await expect.poll(() => rightShape(page)).toEqual({
    head: ['map', 'ui'],
    lanes: [['character', 'timers', 'group'], ['comm']],
    tail: [],
  });
  await expect.poll(() => box(page, '.wc-pane-ui')).toMatchObject({ x: dockX, y: map.height, width: 66 * cw });

  // The boundary between the spans and the columns (the lower part of
  // UI's last row): UI grows, the first pane of each column shrinks.
  ui = await box(page, '.wc-pane-ui');
  const char0 = await box(page, '.wc-pane-character');
  const comm0 = await box(page, '.wc-pane-comm');
  const hy = ui.y + ui.height - 2;
  const hx = (await origin(page)).x + dockX + 20 * cw;
  const oy = (await origin(page)).y;
  expect(await page.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x!, y!)!).cursor, [hx, oy + hy])).toBe('row-resize');
  await page.mouse.move(hx, oy + hy);
  await page.mouse.down();
  await page.mouse.move(hx, oy + hy + 3 * ch, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => box(page, '.wc-pane-ui')).toMatchObject({ y: ui.y, height: ui.height + 3 * ch });
  expect(await box(page, '.wc-pane-character')).toMatchObject({ y: char0.y + 3 * ch, height: char0.height - 3 * ch });
  expect(await box(page, '.wc-pane-comm')).toMatchObject({ y: comm0.y + 3 * ch, height: comm0.height - 3 * ch });
  expect(await box(page, '.wc-pane-map')).toEqual(map);

  // A reload keeps it.
  ui = await box(page, '.wc-pane-ui');
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await metrics(page);
  await expect.poll(() => box(page, '.wc-pane-ui')).toEqual(ui);
  expect(await box(page, '.wc-pane-map')).toEqual(map);

  // The upper half of the outer column's first pane, below its title row:
  // into that column, no span.
  const char1 = await box(page, '.wc-pane-character');
  await dragTo(page, { x: ui.x + 6 * cw, y: ui.y + ch / 2 }, { x: char1.x + 10 * cw, y: char1.y + 1.5 * ch });
  await expect(page.locator('.wc-drop-bar')).toBeVisible();
  await expect(page.locator('.wc-drop-bar')).not.toHaveAttribute('data-span');
  await expect(page.locator('.wc-drop-ghost')).toBeHidden();
  await page.mouse.up();
  await expect.poll(() => rightShape(page)).toEqual({
    head: ['map'],
    lanes: [['ui', 'character', 'timers', 'group'], ['comm']],
    tail: [],
  });

  // The map back into the inner column: the span is gone.
  map = await box(page, '.wc-pane-map');
  const comm = await box(page, '.wc-pane-comm');
  await dragTo(page, { x: map.x + 6 * cw, y: map.y + ch / 2 }, { x: comm.x + 10 * cw, y: comm.y + comm.height - 2 * ch });
  await page.mouse.up();
  await expect.poll(() => rightShape(page)).toEqual({
    head: [],
    lanes: [['ui', 'character', 'timers', 'group'], ['comm', 'map']],
    tail: [],
  });
  await expect.poll(() => box(page, '.wc-pane-map')).toMatchObject({ x: dockX, width: 33 * cw });

  // With the map spanning again, emptying the inner column folds the span
  // into the one column left.
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      const r = d.layout.docks.right;
      r.head = r.lanes[1]!.panes.filter((p) => p.id === 'map');
      r.lanes[1]!.panes = r.lanes[1]!.panes.filter((p) => p.id !== 'map');
    }),
  );
  await expect.poll(() => rightShape(page)).toMatchObject({ head: ['map'] });
  await expect.poll(() => box(page, '.wc-pane-map')).toMatchObject({ x: dockX, y: 0, width: 66 * cw });
  const comm2 = await box(page, '.wc-pane-comm');
  const group = await box(page, '.wc-pane-group');
  await dragTo(page, { x: comm2.x + 6 * cw, y: comm2.y + ch / 2 }, { x: group.x + 10 * cw, y: group.y + group.height - 2 * ch });
  await page.mouse.up();
  await expect.poll(() => rightShape(page)).toEqual({
    head: [],
    lanes: [['map', 'ui', 'character', 'timers', 'group', 'comm']],
    tail: [],
  });
  await expect.poll(() => box(page, '.wc-pane-map')).toMatchObject({ x: (cols - 33) * cw, y: 0, width: 33 * cw });
  expect(errors).toEqual([]);
});

test('spanning panes: a bottom-dock span covers both rows; a float joins a span from the edge zone', async ({ page }) => {
  const { cw, ch, cols, rows } = await open(page);
  // Bottom dock: two rows, Comm (outer) and UI.
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      const lane = d.layout.docks.right.lanes[0]!;
      const take = (id: 'comm' | 'ui') => ({ id, desired: 30 });
      d.layout.docks.bottom.lanes = [
        { size: 10, panes: [take('comm')] },
        { size: 10, panes: [take('ui')] },
      ];
      lane.panes = lane.panes.filter((p) => p.id !== 'comm' && p.id !== 'ui');
    }),
  );
  const gameW = cols - 34;
  await expect.poll(() => box(page, '.wc-pane-ui')).toMatchObject({ y: (rows - 20) * ch, height: 10 * ch });
  // Group to the left end of the rows (the region's first columns): a
  // vertical bar the whole dock high, an outline of the box.
  const group = await box(page, '.wc-pane-group');
  await dragTo(page, { x: group.x + 6 * cw, y: group.y + ch / 2 }, { x: 1.5 * cw, y: (rows - 5) * ch });
  await expect(page.locator('.wc-drop-bar')).toHaveAttribute('data-span', '');
  expect(await box(page, '.wc-drop-bar')).toMatchObject({ height: 20 * ch });
  await expect(page.locator('.wc-drop-ghost')).toBeVisible();
  const ghost = await box(page, '.wc-drop-ghost');
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.__wc!.settings.get().layout.docks.bottom.head.map((p) => p.id)))
    .toEqual(['group']);
  // The span covers both rows at the left end; the rows are to its right.
  await expect.poll(() => box(page, '.wc-pane-group')).toEqual(ghost);
  const g = await box(page, '.wc-pane-group');
  expect(g).toMatchObject({ x: 0, y: (rows - 20) * ch, height: 20 * ch });
  expect(await box(page, '.wc-pane-ui')).toMatchObject({ x: g.width, y: (rows - 20) * ch, width: gameW * cw - g.width });
  expect(await box(page, '.wc-pane-comm')).toMatchObject({ x: g.width, y: (rows - 10) * ch });

  // Right dock: two columns with UI spanning at the top; Comm floats.
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      d.layout.docks.bottom = { lanes: [], head: [], tail: [] };
      d.layout.docks.right = {
        head: [{ id: 'ui', desired: 6 }],
        lanes: [
          { size: 33, panes: [{ id: 'character', desired: 9 }, { id: 'timers', desired: 8 }] },
          { size: 30, panes: [{ id: 'group', desired: 6 }] },
        ],
        tail: [],
      };
      d.layout.floating = [...d.layout.floating, { id: 'comm', x: 5, y: 5, w: 30, h: 10 }];
    }),
  );
  await expect.poll(() => box(page, '.wc-pane-ui')).toMatchObject({ x: (cols - 63) * cw, y: 0, width: 63 * cw });
  const ui = await box(page, '.wc-pane-ui');
  // Over the span stack the float stays a float; at the right screen edge
  // at the span's height it joins the span (upper half: before UI).
  const comm = await box(page, '.wc-pane-comm');
  await dragTo(page, { x: comm.x + 4 * cw, y: comm.y + ch / 2 }, { x: (cols - 30) * cw, y: ui.y + ch * 1.5 });
  await expect(page.locator('.wc-drop-bar')).toBeHidden();
  const o = await origin(page);
  await page.mouse.move(o.x + cols * cw - cw / 2, o.y + ui.y + ch * 1.5, { steps: 4 });
  await expect(page.locator('.wc-drop-bar')).toHaveAttribute('data-span', '');
  await page.mouse.up();
  await expect.poll(() => rightShape(page)).toEqual({ head: ['comm', 'ui'], lanes: [['character', 'timers'], ['group']], tail: [] });
  await expect.poll(() => box(page, '.wc-pane-comm')).toMatchObject({ x: (cols - 63) * cw, y: 0, width: 63 * cw });
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
  expect(await page.evaluate(() => Object.values(window.__wc!.settings.get().panes).every((p) => p?.on))).toBe(true);
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
    .poll(() => page.evaluate(() => window.__wc!.settings.get().layout.docks.right.lanes.flatMap((l) => l.panes).map((p) => p.id)))
    .toEqual(['comm', 'character', 'timers', 'group', 'ui']);
  await expect(page.locator('.wc-pane-comm')).not.toHaveAttribute('data-floating');
  expect(await box(page, '.wc-pane-comm')).toMatchObject({ x: (cols - 33) * cw, y: 0, width: 33 * cw });
});

test('floating panes come to front on a press and stay inside a smaller window', async ({ page }) => {
  const { cw, ch } = await open(page);
  const o = await origin(page);
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      const lane = d.layout.docks.right.lanes[0]!;
      lane.panes = lane.panes.filter((p) => p.id !== 'comm' && p.id !== 'ui');
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
      const lane = d.layout.docks.right.lanes[0]!;
      d.layout.docks.left.lanes = [{ size: 33, panes: lane.panes.filter((p) => p.id !== 'comm') }];
      lane.panes = lane.panes.filter((p) => p.id === 'comm');
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

test('hovering a pane shows a close cross in its title row; clicking it hides the pane', async ({ page }) => {
  const { cw, ch } = await open(page);
  const o = await origin(page);
  const close = page.locator('.wc-pane-timers .wc-pane-close');
  await expect(close).toBeHidden();
  const timers = await box(page, '.wc-pane-timers');
  await page.mouse.move(o.x + timers.x + 4 * cw, o.y + timers.y + 3 * ch);
  await expect(close).toBeVisible();
  // " × " in the title row, one cell in from the right edge.
  expect(await box(page, '.wc-pane-timers .wc-pane-close')).toEqual({
    x: timers.x + timers.width - 4 * cw,
    y: timers.y,
    width: 3 * cw,
    height: ch,
  });
  await expect(page.locator('.wc-pane-character .wc-pane-close')).toBeHidden();

  await close.click();
  await expect(page.locator('.wc-pane-timers')).toBeHidden();
  expect(await page.evaluate(() => window.__wc!.settings.get().panes.timers.on)).toBe(false);
  // No drag started, and the focus is back in the input.
  expect(await page.evaluate(() => window.__wc!.settings.get().layout.floating.map((f) => f.id))).not.toContain('timers');
  await expect(page.locator('.wc-input-field')).toBeFocused();
});
