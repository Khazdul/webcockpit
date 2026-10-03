// The bundled pane bar (stage 14, ADR 0065 and its round 1): enabled from
// the input line it is a borderless pane at the bottom of the right dock
// with a grip and one equally wide button per pane, flowing left to right
// and wrapping; a click toggles that pane; the title is the tooltip;
// dragged by its grip it moves between docks and floats; a user script's
// pane gets a button while the script runs; reload and Reset layout put it
// back at the bottom of the right dock. Uses the dev-only `window.__wc`.
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

/** Waits until the bar's box is the same over a few frames (a relayout has settled). */
async function steady(page: Page): Promise<void> {
  const box = () =>
    page.evaluate(
      (id) =>
        new Promise<string>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r(JSON.stringify(document.querySelector(`.wc-pane[data-pane="${id}"]`)!.getBoundingClientRect())))),
        ),
      BAR,
    );
  await expect.poll(async () => (await box()) === (await box())).toBe(true);
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
      const el = [...spans].find((s) => s.textContent!.trim() === label)!;
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

/** Relative luminance of an `rgb(…)` colour. */
function lum(c: string): number {
  const [r, g, b] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** `hovered` is lighter than `rest` in both text and fill, and only a little (ADR 0065 round 2). */
function expectLighter(hovered: { fg: string; bg: string }, rest: { fg: string; bg: string }): void {
  expect(lum(hovered.fg)).toBeGreaterThan(lum(rest.fg));
  expect(lum(hovered.bg)).toBeGreaterThan(lum(rest.bg));
  // Subtle: neither colour moves far (contrast between rest and hover under 1.6:1).
  expect(contrast(hovered.fg, rest.fg)).toBeLessThan(1.6);
  expect(contrast(hovered.bg, rest.bg)).toBeLessThan(1.6);
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

/** The bar is borderless, the last pane of the right dock's outer lane, nothing under it. */
async function expectRightBottom(page: Page): Promise<void> {
  await expect(bar(page)).toBeVisible();
  await expect(bar(page)).not.toHaveAttribute('data-framed', '');
  await expect.poll(async () => (await dockOf(page))?.dock).toBe('right');
  const d = (await dockOf(page))!;
  expect(d.lane).toBe(0);
  expect((d.lanes[0]![1] as string[]).at(-1)).toBe(BAR);
  const b = (await bar(page).boundingBox())!;
  const below = await page.evaluate((y) => {
    return [...document.querySelectorAll<HTMLElement>('.wc-pane:not([data-floating])')].filter((el) => {
      const r = el.getBoundingClientRect();
      return el.offsetParent !== null && r.width > 0 && r.left > window.innerWidth / 2 && r.top > y + 1;
    }).length;
  }, b.y);
  expect(below).toBe(0);
}

/** Moves the bar into a 1-row lane of its own at the bottom edge (the stage 14 place). */
async function toBottomLane(page: Page): Promise<void> {
  await page.evaluate((id) => {
    window.__wc!.settings.update((d) => {
      for (const dock of Object.values(d.layout.docks)) {
        for (const l of dock.lanes) l.panes = l.panes.filter((p) => p.id !== id);
        dock.lanes = dock.lanes.filter((l) => l.panes.length > 0);
      }
      d.layout.floating = d.layout.floating.filter((f) => f.id !== id);
      d.layout.docks.bottom.lanes.unshift({ size: 1, panes: [{ id: id as 'comm', desired: 80 }] });
    });
  }, BAR);
  await expect.poll(async () => (await dockOf(page))?.dock).toBe('bottom');
  const cell = await cellSize(page);
  await expect.poll(async () => Math.round((await bar(page).boundingBox())!.height)).toBe(Math.round(cell.h));
}

/** The buttons (filled spans) of every bar row: their text. */
const buttons = (page: Page) =>
  page.evaluate((id) => {
    const out: string[] = [];
    for (const s of document.querySelectorAll<HTMLElement>(`.wc-pane[data-pane="${id}"] .wc-prow span`)) {
      const bg = getComputedStyle(s).backgroundColor;
      if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && s.textContent!.trim() !== '') out.push(s.textContent!);
    }
    return out;
  }, BAR);

/** The column of each bar row's first button (its first filled span). */
const firstColumns = (page: Page) =>
  page.evaluate((id) =>
    [...document.querySelectorAll<HTMLElement>(`.wc-pane[data-pane="${id}"] .wc-prow`)].map((row) => {
      let col = 0;
      for (const s of row.querySelectorAll<HTMLElement>('span')) {
        const bg = getComputedStyle(s).backgroundColor;
        if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return col;
        col += s.textContent!.length;
      }
      return -1;
    }),
  BAR);

/** Every button is as wide as the longest name plus a cell on each side, the name centred. */
async function expectEqualWidths(page: Page, names: string[]): Promise<void> {
  const w = Math.max(...names.map((n) => n.length)) + 2;
  await expect.poll(() => buttons(page)).toEqual(
    names.map((n) => {
      const left = Math.floor((w - n.length) / 2);
      return ' '.repeat(left) + n + ' '.repeat(w - n.length - left);
    }),
  );
}

/** Drags the bar by its grip (row 1, column 1) to (x, y). */
async function dragByGrip(page: Page, x: number, y: number): Promise<void> {
  const g = await cellAt(page, 0, 0);
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x + 10, g.y - 10, { steps: 3 });
  await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.up();
}

const ALL = ['CHAR', 'TIME', 'GRP', 'COMM', 'UI', 'MAP'];

test('panebar: the bottom of the right dock, clicks toggle panes, tooltips, colours, paper, reload and Reset layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await start(page);
  await enter(page);
  await command(page, '#script enable panebar');
  await expectRightBottom(page);
  await expectEqualWidths(page, ALL);
  // The grip leads row 1; its cell shows the grab cursor.
  await expect(prows(page).nth(0)).toHaveText(/^\u2237  CHAR /);
  const g = await cellAt(page, 0, 0);
  await page.mouse.move(g.x, g.y);
  await expect(bar(page).locator('.wc-pane-content')).toHaveCSS('cursor', 'grab');

  // Tooltip: the full title and what a click does.
  const comm = await find(page, 'COMM');
  const at = await cellAt(page, comm.row, comm.col + 1);
  await page.mouse.move(at.x, at.y);
  const tip = page.locator('.wc-spane-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText(/Comm: on \(click to hide\)/);
  // Hovered, a lit button is a step lighter, text and fill (round 2).
  const hovered = await colours(page, 'COMM');

  // A click hides Comm and darkens its button; again shows it.
  await page.mouse.move(10, 10);
  const on = await colours(page, 'COMM');
  expectLighter(hovered, on);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('.wc-pane[data-pane="comm"]')).toBeHidden();
  await page.mouse.move(10, 10);
  await expect.poll(() => colours(page, 'COMM')).not.toEqual(on);
  const off = await colours(page, 'COMM');
  // The dock relaid out without Comm: wait until the bar holds still.
  await steady(page);
  const back = await find(page, 'COMM');
  const at2 = await cellAt(page, back.row, back.col + 1);
  await page.mouse.click(at2.x, at2.y);
  await expect(page.locator('.wc-pane[data-pane="comm"]')).toBeVisible();
  // On: the Character pane's lit box, the pane background shade on glow.
  // Off: the mid shade on track, faded but readable at about 3:1 (round 2).
  const L = (c: string) => c.match(/\d+/g)!.slice(0, 3).map(Number).reduce((a, b) => a + b, 0);
  expect(L(on.bg)).toBeGreaterThan(L(off.bg));
  expect(contrast(on.fg, on.bg)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(off.fg, off.bg)).toBeGreaterThanOrEqual(2.6);
  expect(contrast(off.fg, off.bg)).toBeLessThanOrEqual(3.5);
  expect(L(off.fg)).toBeGreaterThan(L(off.bg));
  expect(contrast(on.bg, off.bg)).toBeGreaterThanOrEqual(3);
  // A hovered off button is a step lighter too.
  await page.evaluate(() => window.__wc!.settings.update({ panes: { ui: { on: false } } }));
  await steady(page);
  await expect.poll(() => colours(page, 'UI')).toEqual(off);
  const ui = await find(page, 'UI');
  const atu = await cellAt(page, ui.row, ui.col + 1);
  await page.mouse.move(atu.x, atu.y);
  await expect.poll(() => colours(page, 'UI')).not.toEqual(off);
  expectLighter(await colours(page, 'UI'), off);
  await page.mouse.move(10, 10);
  await page.evaluate(() => window.__wc!.settings.update({ panes: { ui: { on: true } } }));

  // Paper: on and off still read and differ.
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } }));
  await page.evaluate(() => window.__wc!.settings.update({ panes: { ui: { on: false } } }));
  // Wait for the paper colours (the lit fill changes) and the off button.
  await expect.poll(async () => (await colours(page, 'CHAR')).bg).not.toBe(on.bg);
  await expect.poll(async () => (await colours(page, 'UI')).bg).not.toBe((await colours(page, 'CHAR')).bg);
  const pOn = await colours(page, 'CHAR');
  const pOff = await colours(page, 'UI');
  expect(contrast(pOn.fg, pOn.bg)).toBeGreaterThanOrEqual(2);
  expect(contrast(pOff.fg, pOff.bg)).toBeGreaterThanOrEqual(2.6);
  expect(contrast(pOff.fg, pOff.bg)).toBeLessThanOrEqual(3.5);
  // As the Character pane's boxes on paper: the fills are close, the text tells them apart.
  expect(contrast(pOn.bg, pOff.bg)).toBeGreaterThanOrEqual(1.3);
  // Hover on paper, on and off: a step lighter, text and fill.
  for (const [name, rest] of [['CHAR', pOn], ['UI', pOff]] as const) {
    const b = await find(page, name);
    const p = await cellAt(page, b.row, b.col + 1);
    await page.mouse.move(p.x, p.y);
    await expect.poll(() => colours(page, name)).not.toEqual(rest);
    expectLighter(await colours(page, name), rest);
    await page.mouse.move(10, 10);
    await expect.poll(() => colours(page, name)).toEqual(rest);
  }
  await page.evaluate(() => window.__wc!.settings.update({ panes: { ui: { on: true } } }));

  // Reload: still enabled, still at the bottom of the right dock.
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await enter(page);
  await expectRightBottom(page);

  // Reset layout after a move: back at the bottom of the right dock.
  await toBottomLane(page);
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
  await expectRightBottom(page);
  expect(errors).toEqual([]);
});

test('panebar: dragged by its grip from a 1-row bottom bar to the right dock and to a float; wraps in a narrow side dock', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await start(page);
  await enter(page);
  await command(page, '#script enable panebar');
  await expectRightBottom(page);
  const cell = await cellSize(page);

  // A 1-row bar at the bottom edge: all buttons on one row after the grip.
  await toBottomLane(page);
  await expect(prows(page)).toHaveCount(1);
  await expectEqualWidths(page, ALL);

  // By the grip into the middle of the right dock: no link fires.
  const timers = (await page.locator('.wc-pane[data-pane="timers"]').boundingBox())!;
  await dragByGrip(page, timers.x + timers.width / 2, timers.y + timers.height / 2);
  await expect.poll(async () => (await dockOf(page))?.dock).toBe('right');
  expect(await page.evaluate(() => ['character', 'timers', 'group', 'comm', 'ui', 'map'].map((id) => window.__wc!.settings.get().panes[id as 'comm'].on))).toEqual([
    true, true, true, true, true, true,
  ]);
  // Buttons flow left to right and wrap; the height follows the rows.
  await expect.poll(() => prows(page).count()).toBeGreaterThan(1);
  const rows = await prows(page).count();
  await expect.poll(async () => Math.round((await bar(page).boundingBox())!.height / cell.h)).toBe(rows);
  await expectEqualWidths(page, ALL);
  // Every row's first button starts in the column after the grip and its blank.
  expect(new Set(await firstColumns(page))).toEqual(new Set([2]));

  // Back to the bottom edge, then by the grip over the game: it floats.
  await toBottomLane(page);
  const game = (await page.locator('.wc-game').boundingBox())!;
  await dragByGrip(page, game.x + game.width / 3, game.y + game.height / 3);
  await expect.poll(async () => (await dockOf(page))?.dock).toBe('float');
  await expect(bar(page)).toHaveAttribute('data-floating', '');
  expect(await page.evaluate(() => ['character', 'timers', 'group', 'comm', 'ui', 'map'].every((id) => window.__wc!.settings.get().panes[id as 'comm'].on))).toBe(true);

  // A narrow left dock (above Comm): one button per row, the rows asked for.
  await page.evaluate((id) => {
    window.__wc!.settings.update((d) => {
      d.layout.floating = d.layout.floating.filter((f) => f.id !== id);
      for (const dock of Object.values(d.layout.docks)) {
        for (const l of dock.lanes) l.panes = l.panes.filter((p) => p.id !== 'comm');
        dock.lanes = dock.lanes.filter((l) => l.panes.length > 0);
      }
      d.layout.docks.left.lanes = [{ size: 12, panes: [{ id: id as 'comm', desired: 1 }, { id: 'comm', desired: 6 }] }];
    });
  }, BAR);
  await expect.poll(async () => (await dockOf(page))?.dock).toBe('left');
  await expect(prows(page)).toHaveCount(6);
  await expect(prows(page).nth(0)).toHaveText(/^\u2237  CHAR\s*$/);
  await expect(prows(page).nth(5)).toHaveText(/^   MAP\s*$/);
  await expect.poll(async () => Math.round((await bar(page).boundingBox())!.height / cell.h)).toBe(6);
  await expectEqualWidths(page, ALL);
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
  await expectRightBottom(page);
  await expectEqualWidths(page, [...ALL, 'LOOT']);
  // Its button hides it like the others.
  const loot = await find(page, 'LOOT');
  const at = await cellAt(page, loot.row, loot.col + 1);
  await page.mouse.move(at.x, at.y);
  await expect(page.locator('.wc-spane-tip')).toHaveText(/Loot log: on \(click to hide\)/);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('.wc-pane[data-pane="loot/main"]')).toBeHidden();
  await command(page, '#script disable loot');
  await expectEqualWidths(page, ALL);
  expect(errors).toEqual([]);
});

test('panebar: a button in the last column is clickable, no close cross; the hover ends when the pointer leaves over a float handle (round 2)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await start(page);
  await enter(page);
  await command(page, '#script enable panebar');
  await expectRightBottom(page);
  // A float exactly 29 cells wide: buttons at 3-8, 10-15, 17-22, 24-29, so COMM ends in the last column.
  await page.evaluate((id) => {
    window.__wc!.settings.update((d) => {
      for (const dock of Object.values(d.layout.docks)) {
        for (const l of dock.lanes) l.panes = l.panes.filter((p) => p.id !== id);
        dock.lanes = dock.lanes.filter((l) => l.panes.length > 0);
      }
      d.layout.floating = [...d.layout.floating.filter((f) => f.id !== id), { id: id as 'comm', x: 20, y: 10, w: 29, h: 2 }];
    });
  }, BAR);
  await expect.poll(async () => (await dockOf(page))?.dock).toBe('float');
  await steady(page);
  await expect(prows(page).nth(0)).toHaveText(/^\u2237  CHAR {3}TIME {3}GRP {4}COMM $/);
  expect((await prows(page).nth(0).textContent())!.length).toBe(29);
  await page.mouse.move(10, 10);
  const rest = await colours(page, 'COMM');
  // Hovered at its last cell: lighter, the tooltip, no close cross over it.
  const end = await cellAt(page, 0, 28);
  await page.mouse.move(end.x, end.y);
  await expect.poll(() => colours(page, 'COMM')).not.toEqual(rest);
  await expect(page.locator('.wc-spane-tip')).toHaveText(/Comm: on/);
  await expect(bar(page).locator('.wc-pane-close')).toBeHidden();
  // Out through the right edge handle (on top of the content): the hover ends.
  const cell = await cellSize(page);
  await page.mouse.move(end.x + 0.45 * cell.w, end.y, { steps: 2 });
  await page.mouse.move(end.x + 3 * cell.w, end.y, { steps: 4 });
  await expect.poll(() => colours(page, 'COMM')).toEqual(rest);
  await expect(page.locator('.wc-spane-tip')).toBeHidden();
  // The last cell clicks.
  await page.mouse.click(end.x, end.y);
  await expect(page.locator('.wc-pane[data-pane="comm"]')).toBeHidden();
  expect(errors).toEqual([]);
});
