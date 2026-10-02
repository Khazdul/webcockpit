// Script panes (stage 11 P0, ADR 0053): a user script creates a pane that
// floats, docks and toggles like the built-in panes; a link click runs Lua
// and sends; the hint shows as a tooltip; Options → Panes lists the pane;
// disabling the script removes it and enabling it again restores its place.
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
async function putScript(page: Page): Promise<void> {
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
    (source) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('webcockpit');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction('scripts', 'readwrite');
          tx.objectStore('scripts').put({ id: 'panes-1', name: 'panes', source, enabled: true, created: 1, updated: 1 });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    SCRIPT,
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

  // Options → Panes → General lists it under the built-ins; its None box switches it off and on.
  await page.keyboard.press('Escape');
  await page.locator('.wc-overlay .wc-mrow[data-key="options"] .wc-label').click();
  await expect(menuTitle(page)).toHaveText('─── Options ───');
  await page.keyboard.press('Enter'); // Panes
  await expect(menuTitle(page)).toHaveText('─── Panes ───');
  await page.keyboard.press('Enter'); // General
  await expect(menuTitle(page)).toHaveText('─── General ───');
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
      d.layout.docks.left.panes.push({ id: id as 'a/b', desired: 6 });
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
    return { left: s.layout.docks.left.panes.map((p) => p.id), color: s.panes[id as 'a/b']?.color };
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
