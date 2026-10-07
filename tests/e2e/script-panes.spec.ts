// Script panes (stage 11 P0, ADR 0053): a user script creates a pane that
// floats, docks and toggles like the built-in panes; a link click runs Lua
// and sends; the hint shows as a tooltip; Options → Panes lists the pane;
// disabling the script removes it and enabling it again restores its place.
// A temporary pane (feedback round 1) floats centred over the game, is not
// in Options or the settings, and closes with its cross and pane:close().
// pane:onWheel (ADR 0072) hears the wheel in cells and takes it only on true.
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;
const ID = 'panes/main';

const SCRIPT = `-- @name panes
-- @api 1
local p = createPane{id = "main", title = "Merc Pane", dock = "float", rows = 4, cols = 24}
p:setLine(1, "<yellow>[order]<reset> other")
p:setLink(1, 1, 7, function() send("order merc") end, "Order the merc")
p:gauge(2, {value = 30, max = 60, label = "half"})
p:onResize(function(rows, cols) p:setLine(3, "size " .. rows .. "x" .. cols) end)
tempAlias("^pt$", function() if p:visible() then p:hide() else p:show() end end)
`;

/** Stores an enabled user script before the cockpit (and its library) starts. */
async function putScript(page: Page, source = SCRIPT, name = 'panes'): Promise<void> {
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

const pane = (page: Page) => page.locator(`.wc-pane[data-pane="${ID}"]`);
const prows = (page: Page) => pane(page).locator('.wc-pane-content .wc-prow');
const menuTitle = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-title-row .wc-c-section');

async function command(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('a script pane floats, docks, toggles, takes clicks and comes back where it was', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const received: Buffer[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.onMessage((m) => received.push(typeof m === 'string' ? Buffer.from(m) : m));
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  const sentText = () => Buffer.concat(received).toString('latin1');

  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await putScript(page);
  await page.keyboard.press('Enter');

  // Shown as an automatic float, framed with its title, drawn on the cell grid.
  await expect(pane(page)).toBeVisible();
  await expect(pane(page)).toHaveAttribute('data-floating', '');
  await expect(pane(page).locator('.wc-pane-frame')).toContainText('Merc Pane');
  await expect(prows(page).nth(0)).toHaveText(/^\[order\] other\s*$/);
  await expect(prows(page).nth(1)).toHaveText(/^\s+half\s+$/);
  await expect(prows(page).nth(2)).toHaveText(/^size 4x24\s*$/);

  // Hover the link: pointer, tooltip; click: Lua sends.
  const cell = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return { w: parseFloat(s.getPropertyValue('--cell-w')), h: parseFloat(s.getPropertyValue('--cell-h')) };
  });
  const content = await pane(page).locator('.wc-pane-content').boundingBox();
  const at = { x: content!.x + 2.5 * cell.w, y: content!.y + 0.5 * cell.h };
  await page.mouse.move(at.x, at.y);
  const tip = page.locator('.wc-spane-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText(/Order the merc/);
  await expect(pane(page).locator('.wc-pane-content')).toHaveCSS('cursor', 'pointer');
  await page.mouse.click(at.x, at.y);
  await expect.poll(sentText).toContain('order merc\r\n');
  await page.mouse.move(content!.x + 15.5 * cell.w, at.y);
  await expect(tip).toBeHidden();

  // Options → Panes → Appearance lists it under the built-ins; its None box switches it off and on.
  await page.keyboard.press('Escape');
  await page.locator('.wc-overlay .wc-mrow[data-key="options"] .wc-label').click();
  await expect(menuTitle(page)).toHaveText('─── Options ───');
  await page.keyboard.press('Enter'); // Panes
  await expect(menuTitle(page)).toHaveText('─── Panes ───');
  await page.keyboard.press('Enter'); // Appearance
  await expect(menuTitle(page)).toHaveText('─── Pane appearance ───');
  const row = page.locator(`.wc-grid-row:has([data-pane-row="${ID}"])`);
  await expect(row).toContainText('Merc Pane (panes)');
  await row.locator('.wc-check').first().click();
  await expect(pane(page)).toBeHidden();
  expect(await page.evaluate((id) => window.__wc!.settings.get().panes[id as 'a/b'], ID)).toEqual({ on: false, color: 'black', border: true });
  await row.locator('.wc-check').nth(1).click(); // Red: on again, tinted
  await expect(pane(page)).toBeVisible();
  for (let i = 0; i < 4; i++) await page.keyboard.press('Escape');
  await expect(page.locator('.wc-overlay')).toBeHidden();

  // The alias toggles it through pane:hide() / pane:show().
  await command(page, 'pt');
  await expect(pane(page)).toBeHidden();
  await command(page, 'pt');
  await expect(pane(page)).toBeVisible();

  // Dock it to the left (as a drag to the left edge would).
  await page.evaluate((id) =>
    window.__wc!.settings.update((d) => {
      d.layout.floating = d.layout.floating.filter((f) => f.id !== id);
      d.layout.docks.left.lanes = [{ size: 33, panes: [{ id: id as 'a/b', desired: 6 }] }];
    }),
  ID);
  await expect(pane(page)).not.toHaveAttribute('data-floating', '');
  const docked = await pane(page).boundingBox();
  const cockpit = await page.locator('.wc-cockpit').boundingBox();
  expect(docked!.x).toBe(cockpit!.x);
  // Alone in the left dock it takes the whole height, the dock width minus the frame.
  await expect(prows(page).nth(2)).toHaveText(/^size \d+x31\s*$/);

  // Disabling the script removes the pane; its place and colour stay.
  await command(page, '#script disable panes');
  await expect(pane(page)).toHaveCount(0);
  const kept = await page.evaluate((id) => {
    const s = window.__wc!.settings.get();
    return { left: s.layout.docks.left.lanes.flatMap((l) => l.panes).map((p) => p.id), color: s.panes[id as 'a/b']?.color };
  }, ID);
  expect(kept).toEqual({ left: [ID], color: 'red' });

  // Enabling it again restores it docked on the left.
  await command(page, '#script enable panes');
  await expect(pane(page)).toBeVisible();
  await expect(pane(page)).not.toHaveAttribute('data-floating', '');
  expect((await pane(page).boundingBox())!.x).toBe(cockpit!.x);
  await expect(prows(page).nth(0)).toHaveText(/^\[order\] other/);
  expect(errors).toEqual([]);
});

const TEMP = `-- @name temps
-- @api 1
local function open()
  local t = createPane{id = "pick", title = "Pick", temporary = true, rows = 3, cols = 20, dock = "left"}
  t:setLine(1, "<yellow>[a]<reset> [b]")
  t:setLink(1, 1, 3, function() send("chose a"); t:close() end, "Choose a")
  t:onClose(function() send("closed by cross") end)
end
tempAlias("^tp$", open)
tempAlias("^tpc$", function() createPane{id = "pick", temporary = true}:close() end)
echo("temps ready")
`;
const TID = 'temps/~pick';

test('a temporary pane floats centred, stays out of Options and the settings, and closes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const received: Buffer[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.onMessage((m) => received.push(typeof m === 'string' ? Buffer.from(m) : m));
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  const sentText = () => Buffer.concat(received).toString('latin1');
  const temp = page.locator(`.wc-pane[data-pane="${TID}"]`);
  const inSettings = () => page.evaluate((id) => JSON.stringify(window.__wc!.settings.get()).includes(id), TID);

  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await putScript(page, TEMP, 'temps');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-output')).toContainText('temps ready');
  await command(page, 'tp');

  // Centred over the game pane, framed, floating above the map.
  await expect(temp).toBeVisible();
  await expect(temp).toHaveAttribute('data-floating', '');
  await expect(temp.locator('.wc-pane-frame')).toContainText('Pick');
  await expect(temp.locator('.wc-pane-content .wc-prow').nth(0)).toHaveText(/^\[a\] \[b\]\s*$/);
  const cell = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return { w: parseFloat(s.getPropertyValue('--cell-w')), h: parseFloat(s.getPropertyValue('--cell-h')) };
  });
  const box = (await temp.boundingBox())!;
  const game = (await page.locator('.wc-game').boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - (game.x + game.width / 2))).toBeLessThanOrEqual(cell.w);
  expect(Math.abs(box.y + box.height / 2 - (game.y + game.height / 2))).toBeLessThanOrEqual(cell.h);
  expect(Math.round(box.width / cell.w)).toBe(22);
  expect(Math.round(box.height / cell.h)).toBe(5);
  const z = await temp.evaluate((el) => Number(el.style.zIndex));
  const map = await page.locator('.wc-pane[data-pane="map"]').evaluate((el) => Number(el.style.zIndex || 0));
  expect(z).toBeGreaterThan(map);
  expect(await inSettings()).toBe(false);

  // Drag it by its title row: it moves, stays floating, and nothing is saved.
  const grip = (await temp.locator('.wc-pane-grip').boundingBox())!;
  await page.mouse.move(grip.x + 3 * cell.w, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 3 * cell.w - 10 * cell.w, grip.y + grip.height / 2 - 3 * cell.h, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Math.round(((await temp.boundingBox())!.x - box.x) / cell.w)).toBe(-10);
  await expect(temp).toHaveAttribute('data-floating', '');
  expect(await inSettings()).toBe(false);

  // Options → Panes → Appearance does not list it.
  await page.keyboard.press('Escape');
  await page.locator('.wc-overlay .wc-mrow[data-key="options"] .wc-label').click();
  await expect(menuTitle(page)).toHaveText('─── Options ───');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(menuTitle(page)).toHaveText('─── Pane appearance ───');
  await expect(page.locator('.wc-overlay')).not.toContainText('Pick (temps)');
  await expect(page.locator(`[data-pane-row="${TID}"]`)).toHaveCount(0);
  for (let i = 0; i < 4; i++) await page.keyboard.press('Escape');
  await expect(page.locator('.wc-overlay')).toBeHidden();

  // Its close cross closes it (not hide) and calls onClose.
  await temp.hover();
  await expect(temp.locator('.wc-pane-close')).toHaveAttribute('title', 'Close Pick');
  await temp.locator('.wc-pane-close').click();
  await expect(temp).toHaveCount(0);
  await expect.poll(sentText).toContain('closed by cross\r\n');

  // Again: where the player moved it (kept per device, ADR 0053 addendum);
  // a link that calls pane:close().
  await command(page, 'tp');
  await expect(temp).toBeVisible();
  expect(Math.round(((await temp.boundingBox())!.x - box.x) / cell.w)).toBe(-10);
  expect(await page.evaluate(() => localStorage.getItem('webcockpit.tempPanes'))).toContain('temps/~pick');
  expect(await inSettings()).toBe(false);
  const content = (await temp.locator('.wc-pane-content').boundingBox())!;
  await page.mouse.click(content.x + 1.5 * cell.w, content.y + 0.5 * cell.h);
  await expect.poll(sentText).toContain('chose a\r\n');
  await expect(temp).toHaveCount(0);

  // Options → Panes → Reset layout forgets the place: centred again.
  await page.keyboard.press('Escape');
  await page.locator('.wc-overlay .wc-mrow[data-key="options"] .wc-label').click();
  await expect(menuTitle(page)).toHaveText('─── Options ───');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(menuTitle(page)).toHaveText('─── Pane appearance ───');
  await page.locator('.wc-overlay').getByText('Reset layout').click();
  await expect(page.locator('.wc-overlay')).toContainText('Layout reset.');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Escape');
  await expect(page.locator('.wc-overlay')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('webcockpit.tempPanes'))).toBeNull();
  await command(page, 'tp');
  await expect(temp).toBeVisible();
  // Centred over the game pane of the default layout (ADR 0078: a wider dock than the stored one).
  const game2 = (await page.locator('.wc-game').boundingBox())!;
  const again = (await temp.boundingBox())!;
  expect(Math.abs(again.x + again.width / 2 - (game2.x + game2.width / 2))).toBeLessThanOrEqual(cell.w);
  await command(page, 'tpc');
  await expect(temp).toHaveCount(0);

  // And closed by the script from an alias: no onClose.
  await command(page, 'tp');
  await expect(temp).toBeVisible();
  await command(page, 'tpc');
  await expect(temp).toHaveCount(0);
  expect(sentText().split('closed by cross').length - 1).toBe(1);
  expect(await inSettings()).toBe(false);
  expect(errors).toEqual([]);
});

const LONG = `-- @name longs
-- @api 1
local list = createPane{id = "list", title = "List", dock = "float", rows = 6, cols = 24, anchor = "top"}
local con = createPane{id = "con", title = "Con", dock = "float", rows = 6, cols = 24}
for i = 1, 30 do
  list:setLine(i, "item " .. i)
  con:cecho("line " .. i .. "\\n")
end
list:setLink(20, 1, 7, function() send("item twenty") end, "Twenty")
tempAlias("^more$", function() con:cecho("line new\\n") end)
echo("longs ready")
`;

test('an overflowing script pane scrolls by pixels; a list stays at the top, a console follows its end', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const received: Buffer[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.onMessage((m) => received.push(typeof m === 'string' ? Buffer.from(m) : m));
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  const sentText = () => Buffer.concat(received).toString('latin1');
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await putScript(page, LONG, 'longs');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-output')).toContainText('longs ready');
  const list = page.locator('.wc-pane[data-pane="longs/list"]');
  const con = page.locator('.wc-pane[data-pane="longs/con"]');
  await expect(list).toBeVisible();
  const scrollTop = (l: typeof list) => l.locator('.wc-spane-scroll').evaluate((e) => e.scrollTop);
  const more = (l: typeof list) => l.locator('.wc-spane-more');

  // The list starts at the top; the console at its end.
  await expect(list.locator('.wc-spane-rows .wc-prow').first()).toHaveText(/^item 1\s*$/);
  expect(await scrollTop(list)).toBe(0);
  await expect(more(list)).toHaveText(/↓ \d+ more rows/);
  await expect.poll(() => scrollTop(con)).toBeGreaterThan(0);
  await expect(more(con)).toHaveText(/↑ \d+ more rows/);

  // A small wheel moves the list by pixels.
  const box = (await list.locator('.wc-spane-scroll').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.wheel(0, 30);
  await expect.poll(() => scrollTop(list)).toBeGreaterThan(0);
  await expect(more(list)).toHaveText(/↑ \d+ rows? above/);
  // Further down, a link in a scrolled row works.
  await list.locator('.wc-spane-scroll').evaluate((e) => {
    e.scrollTop = 19 * parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-h'));
  });
  await expect(more(list)).toHaveText(/↑ 19 rows above/);
  const row20 = list.locator('.wc-spane-rows .wc-prow').nth(19);
  const r = (await row20.boundingBox())!;
  await page.mouse.click(r.x + 10, r.y + r.height / 2);
  await expect.poll(sentText).toContain('item twenty\r\n');
  // A click on the indicator goes back to the top.
  await more(list).click();
  await expect.poll(() => scrollTop(list)).toBe(0);

  // The console follows a new line at its end; scrolled back, it stays.
  const end = await scrollTop(con);
  await command(page, 'more');
  await expect.poll(() => scrollTop(con)).toBeGreaterThan(end);
  // (The two auto floats overlap: scroll the console directly.)
  await con.locator('.wc-spane-scroll').evaluate((e) => {
    e.scrollTop -= 100;
  });
  await expect(more(con)).toHaveText(/↓ \d+ rows? below/);
  const back = await scrollTop(con);
  await command(page, 'more');
  await expect(con.locator('.wc-spane-rows .wc-prow')).toHaveCount(32);
  expect(await scrollTop(con)).toBe(back);
  expect(errors).toEqual([]);
});

const WHEEL = `-- @name wheels
-- @api 1
local list = createPane{id = "list", title = "List", dock = "float", rows = 6, cols = 24, anchor = "top"}
for i = 1, 30 do list:setLine(i, "item " .. i) end
local take = false
list:onWheel(function(dx, dy)
  send("wheel " .. dx .. " " .. dy)
  return take
end)
tempAlias("^take$", function() take = true end)
echo("wheels ready")
`;

test('pane:onWheel gets whole cells; true takes the scroll, otherwise the pane scrolls as before (ADR 0072)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const received: Buffer[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.onMessage((m) => received.push(typeof m === 'string' ? Buffer.from(m) : m));
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  const sentText = () => Buffer.concat(received).toString('latin1');
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await putScript(page, WHEEL, 'wheels');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-output')).toContainText('wheels ready');
  const list = page.locator('.wc-pane[data-pane="wheels/list"]');
  await expect(list).toBeVisible();
  const scrollTop = () => list.locator('.wc-spane-scroll').evaluate((e) => e.scrollTop);
  const cellH = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-h')));
  const box = (await list.locator('.wc-spane-scroll').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 10);

  // Not taken: the script hears it in rows, the list scrolls natively.
  await page.mouse.wheel(0, 4 * cellH);
  await expect.poll(sentText).toMatch(/wheel 0 [1-9]\d*\r\n/);
  await expect.poll(scrollTop).toBeGreaterThan(0);
  const at = await scrollTop();

  // Taken: the script hears it, the list stays.
  await command(page, 'take');
  const before = (sentText().match(/wheel /g) ?? []).length;
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.wheel(0, 4 * cellH);
  await expect.poll(() => (sentText().match(/wheel /g) ?? []).length).toBeGreaterThan(before);
  await page.waitForTimeout(200);
  expect(await scrollTop()).toBe(at);
  // Sideways: dx.
  await page.mouse.wheel(60, 0);
  await expect.poll(sentText).toMatch(/wheel [1-9]\d* 0\r\n/);
  expect(errors).toEqual([]);
});

// Stage 25 A (ADR 0084): a script pane shows the grab cursor on its top
// row and the close cross on hover like a built-in pane, framed or not;
// hovering a borderless pane outlines it (an inset shadow in the main
// background a step lighter, no layout shift); a framed pane gets no
// outline. Round 2: the cross shows over a link too.
const HOVER = `-- @name hovers
-- @api 1
local p = createPane{id = "main", title = "Hover Pane", dock = "right", lane = "own", rows = 4, cols = 30, anchor = "top", border = false}
for i = 1, 4 do p:setLine(i, "line " .. i) end
p:setLine(1, "[go] top" .. string.rep(" ", 17) .. "[x]")
p:setLink(1, 1, 4, function() send("go") end, "Go")
-- A link under the cross: the cross still shows (ADR 0084 addendum).
p:setLink(1, 26, 3, function() send("x") end, "X")
`;

test('a script pane has a grab cursor on its top row and a close cross on hover; a borderless one an outline', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => ws.send(Buffer.from([IAC, WILL, GMCP])));
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await putScript(page, HOVER, 'hovers');
  await page.keyboard.press('Enter');
  const id = 'hovers/main';
  const sp = page.locator(`.wc-pane[data-pane="${id}"]`);
  await expect(sp).toBeVisible();
  await expect(sp).not.toHaveAttribute('data-framed', '');
  const cell = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return { w: parseFloat(s.getPropertyValue('--cell-w')), h: parseFloat(s.getPropertyValue('--cell-h')) };
  });
  const outline = () => sp.evaluate((e) => getComputedStyle(e, '::after').boxShadow);
  const close = sp.locator('.wc-pane-close');
  const content = sp.locator('.wc-pane-content');
  const before = (await sp.boundingBox())!;

  // Not hovered: no cross, no outline.
  await page.mouse.move(5, 5);
  await expect(close).toBeHidden();
  expect(await outline()).toBe('none');

  // Borderless: the top row (off the link) is a grab hand, the link a pointer,
  // the next row plain; the cross shows; the pane is outlined, not moved.
  const c = (await content.boundingBox())!;
  await page.mouse.move(c.x + 12.5 * cell.w, c.y + 0.5 * cell.h);
  await expect(content).toHaveCSS('cursor', 'grab');
  await expect(close).toBeVisible();
  await expect.poll(outline).toContain('inset');
  // The outline follows the main background (ADR 0084 addendum): the
  // discreet grey on black, a lighter blue on a blue background.
  await expect(sp).not.toHaveAttribute('data-no-cross', '');
  expect(await outline()).toContain('rgb(41, 41, 41)');
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#0e141c' } }));
  await expect.poll(outline).not.toContain('rgb(41, 41, 41)');
  const [r, g, b] = (await outline()).match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number) as [number, number, number];
  expect(b).toBeGreaterThan(r);
  expect(r).toBeGreaterThan(0x0e);
  expect(g).toBeGreaterThan(0x14);
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#000000' } }));
  await expect.poll(outline).toContain('rgb(41, 41, 41)');
  expect(await sp.boundingBox()).toEqual(before);
  await page.mouse.move(c.x + 1.5 * cell.w, c.y + 0.5 * cell.h);
  await expect(content).toHaveCSS('cursor', 'pointer');
  await page.mouse.move(c.x + 12.5 * cell.w, c.y + 1.5 * cell.h);
  await expect(content).toHaveCSS('cursor', 'auto');

  // Framed: the title row is the grip (grab), the cross shows, no outline.
  await page.evaluate((id) => window.__wc!.settings.update((d) => {
    d.panes[id as 'a/b'] = { ...d.panes[id as 'a/b']!, border: true };
  }), id);
  await expect(sp).toHaveAttribute('data-framed', '');
  const f = (await sp.boundingBox())!;
  await page.mouse.move(f.x + f.width / 2, f.y + 0.3 * cell.h);
  await expect(close).toBeVisible();
  const top = await page.evaluate(({ x, y }) => {
    const t = document.elementFromPoint(x, y)!;
    return { cls: t.className, cursor: getComputedStyle(t).cursor };
  }, { x: f.x + f.width / 2, y: f.y + 0.3 * cell.h });
  expect(top).toEqual({ cls: 'wc-pane-grip', cursor: 'grab' });
  expect(await outline()).toBe('none');

  // The cross hides the pane, as on a built-in pane.
  await close.click();
  await expect(sp).toBeHidden();
  expect(await page.evaluate((id) => window.__wc!.settings.get().panes[id as 'a/b']!.on, id)).toBe(false);
  expect(errors).toEqual([]);
});
