// The bundled Map search script (ADR 0077 §C): enabled with the bundled map
// loaded and the player located by the map-demo walk, its pane searches
// the notes for herbs (Enter in the query field), lists the rooms nearest
// first with their steps (no way text, round 1), marks a clicked row until
// Clear, keeps the marks over a new search, ignores diacritics, and the
// pane's close cross clears them.
import { type Page, expect, test } from '@playwright/test';

const ID = 'mapsearch/main';

const pane = (page: Page) => page.locator(`.wc-pane[data-pane="${ID}"]`);
const prows = (page: Page) => pane(page).locator('.wc-pane-content .wc-prow');

/** Clicks the first cell of `text` on pane row `row` (0-based). */
async function clickText(page: Page, row: number, text: string): Promise<void> {
  const s = (await prows(page).nth(row).textContent())!;
  const col = s.indexOf(text);
  expect(col, `"${text}" in "${s}"`).toBeGreaterThanOrEqual(0);
  const cell = await page.evaluate(() => {
    const st = getComputedStyle(document.documentElement);
    return { w: parseFloat(st.getPropertyValue('--cell-w')), h: parseFloat(st.getPropertyValue('--cell-h')) };
  });
  const box = (await pane(page).locator('.wc-pane-content').boundingBox())!;
  await page.mouse.click(box.x + (col + 0.5) * cell.w, box.y + (row + 0.5) * cell.h);
}

test('map search pane: Notes search, results with steps, marks until Clear, diacritics, close cross clears (ADR 0077 §C)', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  const map = page.locator('.wc-pane-map .wc-pane-content');
  await expect(map).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  await page.evaluate(async () => {
    const text = await (await fetch('/__fixtures/map-demo.log')).text();
    window.__wc!.app.startReplay(text, 'map-demo.log', 0);
  });
  await expect(map).toHaveAttribute('data-map-room', '26971', { timeout: 15_000 });

  await page.evaluate(() => window.__wc!.shell.scripts.setEnabled('mapsearch', true));
  await expect(pane(page)).toBeVisible();
  await expect(pane(page).locator('.wc-pane-frame')).toContainText('Map search');
  await expect(prows(page).nth(0)).toHaveText(/^ Query: +\[Find\] \[Close\]\s*$/);
  await expect(prows(page).nth(1)).toHaveText(/^ Search\s*$/);
  await expect(prows(page).nth(2)).toHaveText(/^ \(•\) Name +\( \) Exits\s*$/);
  await expect(pane(page)).not.toContainText('Case sensitive');
  await expect(pane(page)).not.toContainText('Regular expression');
  await expect(prows(page).nth(5)).toHaveText(/^ \( \) Area +\( \) All\s*$/);
  await expect(prows(page).nth(6)).toHaveText(/Type a query and press Enter\./);

  // Notes, then type Herb and press Enter in the field.
  await clickText(page, 3, 'Notes');
  await expect(prows(page).nth(3)).toHaveText(/\(•\) Notes/);
  const field = pane(page).locator('.wc-spane-field');
  await field.click();
  await page.keyboard.type('Herb');
  await page.keyboard.press('Enter');
  await expect(prows(page).nth(6)).toHaveText(/^ (\d+ of )?\d+ rooms +\[Mark all\]\s*$/);
  await expect(prows(page).nth(8)).toHaveText(/^ {3}Steps {2}Room name( +Area)?\s*$/);
  // Nearest first, with steps; no way text, in the row or its tooltip.
  await expect(prows(page).nth(9)).toHaveText(/^ {3} *\d+ {2}\S/);
  await expect(prows(page).nth(9)).not.toHaveText(/ \d*[nsewud]( \d*[nsewud])+\s*$/);
  await prows(page).nth(9).hover();
  const tip = page.locator('.wc-spane-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(/\d+ steps? away\.|You are here\./);
  await expect(tip).not.toContainText(/steps:/);
  const snapshot = await prows(page).allTextContents();
  console.log(`Map search pane:\n${snapshot.slice(0, 16).map((r) => `|${r.trimEnd()}`).join('\n')}`);

  // Click the first result: one lasting mark, the row marked.
  await clickText(page, 9, snapshot[9]!.slice(10, 16).trim());
  await expect(prows(page).nth(9)).toHaveText(/^ ● /);
  await expect(prows(page).nth(6)).toHaveText(/· 1 marked +\[Mark all\] \[Clear\]/);
  await expect(map).toHaveAttribute('data-map-marks', '1');
  await clickText(page, 10, snapshot[10]!.slice(10, 16).trim());
  await expect(prows(page).nth(6)).toHaveText(/· 2 marked/);
  await expect(map).toHaveAttribute('data-map-marks', '1');
  console.log(`Marked:\n${(await prows(page).allTextContents()).slice(6, 12).map((r) => `|${r.trimEnd()}`).join('\n')}`);

  // A new search (Flags: rent) keeps the marks.
  await clickText(page, 4, 'Flags');
  await field.click();
  await field.fill('');
  await page.keyboard.type('rent');
  await page.keyboard.press('Enter');
  await expect(prows(page).nth(6)).toHaveText(/^ \d+ rooms? · 2 marked/);
  await expect(prows(page).nth(9)).toHaveText(/^ {3} *\d+ {2}\S/);
  await expect(map).toHaveAttribute('data-map-marks', '1');

  // Clear: the marks go.
  await clickText(page, 6, '[Clear]');
  await expect(map).toHaveAttribute('data-map-marks', '0');
  await expect(prows(page).nth(6)).not.toHaveText(/marked/);

  // Mark one again, then the close cross hides the pane and clears it.
  await clickText(page, 9, (await prows(page).nth(9).textContent())!.slice(10, 16).trim());
  await expect(map).toHaveAttribute('data-map-marks', '1');
  await pane(page).hover();
  await pane(page).locator('.wc-pane-close').click();
  await expect(pane(page)).toBeHidden();
  await expect(map).toHaveAttribute('data-map-marks', '0');

  // Diacritics do not count: "Círdan" finds the map's "Cirdan's …" rooms
  // (the map's text is ASCII), as "cirdan" does.
  await page.locator('.wc-input-field').focus();
  await page.keyboard.type('mapsearch Círdan');
  await page.keyboard.press('Enter');
  await expect(pane(page)).toBeVisible();
  await clickText(page, 2, 'Name'); // searches again (it was Flags)
  await expect(prows(page).nth(2)).toHaveText(/\(•\) Name/);
  await expect(prows(page).nth(6)).toHaveText(/^ \d+ rooms? /);
  const accented = await prows(page).nth(6).textContent();
  await expect(prows(page).nth(9)).toContainText('Cirdan');
  await page.locator('.wc-input-field').focus();
  await page.keyboard.type('mapsearch cirdan');
  await page.keyboard.press('Enter');
  await expect(prows(page).nth(6)).toHaveText(accented!);
  await clickText(page, 0, '[Close]');
  await expect(pane(page)).toBeHidden();

  // The alias brings it back with the field focused.
  await page.locator('.wc-input-field').focus();
  await page.keyboard.type('mapsearch');
  await page.keyboard.press('Enter');
  await expect(pane(page)).toBeVisible();
  await expect(field).toBeFocused();
  expect(errors).toEqual([]);
});
