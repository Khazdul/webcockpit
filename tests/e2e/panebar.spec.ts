// The bundled pane bar (stage 14, ADR 0065): enabled from the input line it
// is a borderless one-row lane at the very bottom with one button per pane;
// a click toggles that pane; the title is the tooltip; dragged by a button
// it stacks in a side dock and wraps as a float; a user script's pane gets
// a button while the script runs; reload and Reset layout keep it in its
// own bottom lane. Uses the dev-only `window.__wc`.
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;
const BAR = 'panebar/bar';

const bar = (page: Page) => page.locator(`.wc-pane[data-pane="${BAR}"]`);
const prows = (page: Page) => bar(page).locator('.wc-pane-content .wc-prow');
const menuTitle = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-title-row .wc-c-section');

async function command(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

async function cellSize(page: Page): Promise<{ w: number; h: number }> {
  return page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return { w: parseFloat(s.getPropertyValue('--cell-w')), h: parseFloat(s.getPropertyValue('--cell-h')) };
  });
}

/** The centre of the bar's content cell (row, col), 0-based. */
async function cellAt(page: Page, row: number, col: number): Promise<{ x: number; y: number }> {
  const cell = await cellSize(page);
  const box = (await bar(page).locator('.wc-pane-content').boundingBox())!;
  return { x: box.x + (col + 0.5) * cell.w, y: box.y + (row + 0.5) * cell.h };
}

/** Row and column of the button `label` in the bar. */
async function find(page: Page, label: string): Promise<{ row: number; col: number }> {
  const rows = await prows(page).allTextContents();
  for (let r = 0; r < rows.length; r++) {
    const at = ` ${rows[r]} `.indexOf(` ${label} `);
    if (at >= 0) return { row: r, col: at };
  }
  throw new Error(`no ${label} in ${rows.join(' / ')}`);
}

/** The text and fill colours of button `label` (its span's computed style, read in one go). */
async function colours(page: Page, label: string): Promise<{ fg: string; bg: string }> {
  return page.evaluate(
    ({ id, label }) => {
      const spans = document.querySelectorAll<HTMLElement>(`.wc-pane[data-pane="${id}"] .wc-prow span`);
      const el = [...spans].find((s) => s.textContent === label)!;
      const st = getComputedStyle(el);
      return { fg: st.color, bg: st.backgroundColor };
    },
    { id: BAR, label },
  );
}

/** WCAG contrast of two `rgb(…)` colours. */
function contrast(a: string, b: string): number {
  const lum = (c: string): number => {
    const [r, g, bl] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number).map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const dockOf = (page: Page) =>
  page.evaluate((id) => {
    const l = window.__wc!.settings.get().layout;
    for (const [d, s] of Object.entries(l.docks)) {
      const lane = s.lanes.findIndex((x) => x.panes.some((p) => p.id === id));
      if (lane >= 0) return { dock: d, lane, lanes: s.lanes.map((x) => [x.size, x.panes.map((p) => p.id)]) };
    }
    return l.floating.some((f) => f.id === id) ? { dock: 'float', lane: 0, lanes: [] } : null;
  }, BAR);

async function start(page: Page): Promise<void> {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
}

async function enter(page: Page): Promise<void> {
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
}

/** The bar is one borderless row at the very bottom of the cockpit, under the input line. */
async function expectBottomRow(page: Page): Promise<void> {
  const cell = await cellSize(page);
  await expect(bar(page)).toBeVisible();
  await expect(bar(page)).not.toHaveAttribute('data-framed', '');
  await expect.poll(async () => Math.round((await bar(page).boundingBox())!.height)).toBe(Math.round(cell.h));
  const cockpit = (await page.locator('.wc-cockpit').boundingBox())!;
  const b = (await bar(page).boundingBox())!;
  const rows = Math.floor(cockpit.height / cell.h + 1e-6);
  expect(Math.round(b.y - cockpit.y)).toBe(Math.round((rows - 1) * cell.h));
  const input = (await page.locator('.wc-input-slot').boundingBox())!;
  expect(input.y).toBeLessThan(b.y);
  expect(await dockOf(page)).toMatchObject({ dock: 'bottom', lane: 0 });
}

test('panebar: a one-row bottom lane, clicks toggle panes, tooltips, paper, reload and Reset layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  await enter(page);
  await command(page, '#script enable panebar');
  await expectBottomRow(page);
  await expect(prows(page).nth(0)).toHaveText(/^CHAR TIME GRP COMM UI MAP\s*$/);

  // Tooltip: the full title and what a click does.
  const comm = await find(page, 'COMM');
  const at = await cellAt(page, comm.row, comm.col + 1);
  await page.mouse.move(at.x, at.y);
  const tip = page.locator('.wc-spane-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText(/Comm: on \(click to hide\)/);

  // A click hides Comm and darkens its button; again shows it.
  await page.mouse.move(at.x, at.y - 200);
  const on = await colours(page, 'COMM');
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('.wc-pane[data-pane="comm"]')).toBeHidden();
  await expect.poll(() => colours(page, 'COMM')).not.toEqual(on);
  await page.mouse.move(at.x, at.y - 200);
  const off = await colours(page, 'COMM');
  expect(contrast(on.fg, on.bg)).toBeGreaterThanOrEqual(3);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('.wc-pane[data-pane="comm"]')).toBeVisible();
  // On is the lighter of the two on the dark theme.
  const L = (c: string) => c.match(/\d+/g)!.slice(0, 3).map(Number).reduce((a, b) => a + b, 0);
  expect(L(on.bg)).toBeGreaterThan(L(off.bg));
  expect(L(on.fg)).toBeGreaterThan(L(off.fg));

  // Paper: on and off still read and differ.
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } }));
  await page.evaluate(() => window.__wc!.settings.update({ panes: { ui: { on: false } } }));
  await expect.poll(async () => (await colours(page, 'UI')).bg).not.toBe((await colours(page, 'CHAR')).bg);
  const pOn = await colours(page, 'CHAR');
  const pOff = await colours(page, 'UI');
  expect(contrast(pOn.fg, pOn.bg)).toBeGreaterThanOrEqual(3);
  // Off is meant to look faded; it still reads.
  expect(contrast(pOff.fg, pOff.bg)).toBeGreaterThanOrEqual(2.5);
  await page.evaluate(() => window.__wc!.settings.update({ panes: { ui: { on: true } } }));

  // Reload: still enabled, still in its own bottom lane.
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await enter(page);
  await expectBottomRow(page);

  // Reset layout after a move: back in its own bottom lane.
  await page.evaluate((id) => {
    window.__wc!.settings.update((d) => {
      d.layout.docks.bottom.lanes = [];
      d.layout.docks.left.lanes = [{ size: 20, panes: [{ id: id as 'comm', desired: 6 }] }];
    });
  }, BAR);
  await expect.poll(async () => (await dockOf(page))?.dock).toBe('left');
  await page.keyboard.press('Escape');
  await page.locator('.wc-overlay .wc-mrow[data-key="options"] .wc-label').click();
  await expect(menuTitle(page)).toHaveText('─── Options ───');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(menuTitle(page)).toHaveText('─── General ───');
  await expect(page.locator(`.wc-overlay [data-pane-row="${BAR}"]`)).toContainText('Pane bar (panebar)');
  await page.locator('.wc-overlay').getByText('Reset layout').click();
  await expect(page.locator('.wc-overlay')).toContainText('Layout reset.');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Escape');
  await expect(page.locator('.wc-overlay')).toBeHidden();
  await expectBottomRow(page);
  expect(errors).toEqual([]);
});

test('panebar: dragged by a button it stacks in the right dock, floats over the game and rewraps on resize', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await start(page);
  await enter(page);
  await command(page, '#script enable panebar');
  await expectBottomRow(page);
  const cell = await cellSize(page);

  // Press on CHAR and move into the middle of the right dock.
  const from = await cellAt(page, 0, 1);
  const right = (await page.locator('.wc-pane[data-pane="timers"]').boundingBox())!;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y - 10, { steps: 3 });
  await page.mouse.move(right.x + right.width / 2, right.y + right.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await dockOf(page))?.dock).toBe('right');
  // No link fired on the drop: every pane is still on.
  expect(await page.evaluate(() => ['character', 'timers', 'group', 'comm', 'ui'].map((id) => window.__wc!.settings.get().panes[id as 'comm'].on))).toEqual([true, true, true, true, true]);
  await expect(prows(page)).toHaveCount(6);
  await expect(prows(page).nth(0)).toHaveText(/^ CHAR\s*$/);
  await expect(prows(page).nth(5)).toHaveText(/^ MAP\s*$/);
  await expect.poll(async () => Math.round((await bar(page).boundingBox())!.height / cell.h)).toBe(6);

  // Drag it by a button over the game: it floats, buttons in one row.
  const game = (await page.locator('.wc-game').boundingBox())!;
  const grip = await cellAt(page, 0, 2);
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x - 10, grip.y + 10, { steps: 3 });
  await page.mouse.move(game.x + game.width / 3, game.y + game.height / 3, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await dockOf(page))?.dock).toBe('float');
  await expect(bar(page)).toHaveAttribute('data-floating', '');
  await expect(prows(page).nth(0)).toHaveText(/^ CHAR TIME GRP COMM UI MAP\s*$/);

  // Narrow it from the right edge: the buttons wrap.
  const b = (await bar(page).boundingBox())!;
  await page.mouse.move(b.x + b.width - 1, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 1 - 20 * cell.w, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await bar(page).boundingBox())!.width / cell.w)).toBe(Math.round(b.width / cell.w) - 20);
  await expect(prows(page).nth(0)).toHaveText(/^ CHAR TIME\s*$/);
  await expect(prows(page).nth(1)).toHaveText(/^ GRP COMM UI\s*$/);
  expect(errors).toEqual([]);
});

/** Stores an enabled user script before the cockpit (and its library) starts. */
async function putScript(page: Page, name: string, source: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise((r) => {
            const q = indexedDB.open('webcockpit');
            q.onsuccess = () => {
              const ok = q.result.objectStoreNames.contains('scripts');
              q.result.close();
              r(ok);
            };
            q.onerror = () => r(false);
          }),
      ),
    )
    .toBe(true);
  await page.evaluate(
    ({ source, name }) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('webcockpit');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction('scripts', 'readwrite');
          tx.objectStore('scripts').put({ id: `${name}-1`, name, source, enabled: true, created: 1, updated: 1 });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { source, name },
  );
}

test('panebar: a user script pane gets a button while the script runs', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  await putScript(page, 'loot', '-- @name loot\n-- @api 1\nlocal p = createPane{id = "main", title = "Loot log", short = "LOOT", dock = "left", rows = 4, cols = 20}\np:setLine(1, "nothing yet")\n');
  await enter(page);
  await command(page, '#script enable panebar');
  await expectBottomRow(page);
  await expect(prows(page).nth(0)).toHaveText(/^CHAR TIME GRP COMM UI MAP LOOT\s*$/);
  // Its button hides it like the others.
  const loot = await find(page, 'LOOT');
  const at = await cellAt(page, loot.row, loot.col + 1);
  await page.mouse.move(at.x, at.y);
  await expect(page.locator('.wc-spane-tip')).toHaveText(/Loot log: on \(click to hide\)/);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('.wc-pane[data-pane="loot/main"]')).toBeHidden();
  await command(page, '#script disable loot');
  await expect(prows(page).nth(0)).toHaveText(/^CHAR TIME GRP COMM UI MAP\s*$/);
  expect(errors).toEqual([]);
});
