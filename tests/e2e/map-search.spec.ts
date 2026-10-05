// Map search for scripts (ADR 0077 §B): a user script's pane with radio
// buttons and a checkbox searches the bundled map from the located player,
// shows the nearest result with its path, and marks the results until the
// next search; the marks go when the script stops.
import { type Page, expect, test } from '@playwright/test';

const ID = 'msearch/~find';

const SCRIPT = `-- @name msearch
-- @api 1
local pane = createPane{id = "find", title = "Find", temporary = true, at = "top-left", rows = 4, cols = 60}
local field, cs, mark = "name", false, nil
pane:setRadio(1, 1, {group = "f", value = "name", label = "Name", checked = true, onChange = function(v) field = v end})
pane:setRadio(1, 10, {group = "f", value = "note", label = "Notes", onChange = function(v) field = v end})
pane:setCheckbox(2, 1, {label = "Case sensitive", hint = "Match case", onChange = function(on) cs = on end})
tempAlias("^find (.+)$", function()
  local ok, why = mapSearch({text = matches[2], field = field, case = cs, max = 3}, function(results, total, here)
    local r = results[1]
    local first = r and (r.name .. " steps=" .. tostring(r.steps)) or "none"
    pane:setLine(3, field .. " " .. tostring(cs) .. " " .. total .. " here=" .. tostring(here) .. " " .. first)
    pane:setLine(4, "[" .. (r and tostring(r.dirs) or "") .. "]")
    if mark then mapUnmark(mark) end
    local ids = {}
    for i, x in ipairs(results) do ids[i] = x.id end
    mark = #ids > 0 and mapMark(ids, {duration = 0, focus = "move"}) or nil
  end)
  if not ok then pane:setLine(3, "no: " .. why) end
end)
echo("msearch ready")
`;

async function command(page: Page, text: string): Promise<void> {
  const input = page.locator('.wc-input-field');
  await input.focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('map search: radio, checkbox, results with paths, marks until the next search (ADR 0077)', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  const content = page.locator('.wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  // Locate the player: the map-demo walk ends on Hill Road.
  await page.evaluate(async () => {
    const text = await (await fetch('/__fixtures/map-demo.log')).text();
    window.__wc!.app.startReplay(text, 'map-demo.log', 0);
  });
  await expect(content).toHaveAttribute('data-map-room', '26971', { timeout: 15_000 });

  await page.evaluate(async (src) => {
    const lib = window.__wc!.shell.scripts;
    await lib.create('msearch', src);
    await lib.setEnabled('msearch', true);
  }, SCRIPT);
  await expect(page.locator('.wc-output')).toContainText('msearch ready');
  const pane = page.locator(`.wc-pane[data-pane="${ID}"]`);
  const rows = pane.locator('.wc-pane-content .wc-prow');
  await expect(rows.nth(0)).toHaveText(/^\(•\) Name \( \) Notes\s*$/);
  await expect(rows.nth(1)).toHaveText(/^\[ \] Case sensitive\s*$/);

  // By name: the player's own room first, no steps to walk.
  await command(page, 'find hill road');
  await expect(rows.nth(2)).toHaveText(/^name false \d+ here=26971 Hill Road steps=0\s*$/);
  await expect(rows.nth(3)).toHaveText(/^\[\]/);
  await expect(content).toHaveAttribute('data-map-marks', '1');

  // Click the checkbox and the Notes radio (cells: col 2 of row 2, col 12 of row 1).
  const cell = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return { w: parseFloat(s.getPropertyValue('--cell-w')), h: parseFloat(s.getPropertyValue('--cell-h')) };
  });
  const box = (await pane.locator('.wc-pane-content').boundingBox())!;
  await page.mouse.click(box.x + 1.5 * cell.w, box.y + 1.5 * cell.h);
  await expect(rows.nth(1)).toHaveText(/^\[x\] Case sensitive/);
  await page.mouse.click(box.x + 11.5 * cell.w, box.y + 0.5 * cell.h);
  await expect(rows.nth(0)).toHaveText(/^\( \) Name \(•\) Notes/);
  await command(page, 'find Herb');
  await expect(rows.nth(2)).toHaveText(/^note true \d+ here=26971 .+ steps=\d+\s*$/);
  await expect(rows.nth(3)).toHaveText(/^\[\d*[nsewud]( \d*[nsewud])*/);
  // The new search replaced the mark; it lasts (duration 0).
  await expect(content).toHaveAttribute('data-map-marks', '1');
  await page.waitForTimeout(1500);
  await expect(content).toHaveAttribute('data-map-marks', '1');

  // Case sensitive: "HERB:" finds no note (they say "Herb:").
  await command(page, 'find HERB:');
  await expect(rows.nth(2)).toHaveText(/^note true 0 here=26971 none/);
  await expect(content).toHaveAttribute('data-map-marks', '0');
  await command(page, 'find Herb');
  await expect(content).toHaveAttribute('data-map-marks', '1');

  // The script stops: its marks go.
  await page.evaluate(() => window.__wc!.shell.scripts.setEnabled('msearch', false));
  await expect(content).toHaveAttribute('data-map-marks', '0');
  expect(errors).toEqual([]);
});
