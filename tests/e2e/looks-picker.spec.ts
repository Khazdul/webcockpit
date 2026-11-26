// The look picker (stage 80 part A, ADR 0169): open from the portrait,
// filter, search, pick, cancel, keys, the focus back in the input, a look
// kept over a reload, the compact card's way in through the gear, and no
// token file loaded on a normal start. Against the GMCP demo (the dev feed
// through the live app, where looks are drawn). Uses the dev-only `window.__wc`.
import { type Page, expect, test } from '@playwright/test';

const DEMO = '/?fixture=gmcp-demo.log&speed=0';
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const disc = (page: Page) => page.locator('.wc-pane-character .wc-cc-disc');
const dlg = (page: Page) => page.locator('[data-dlg="look"]');
const tab = (page: Page, id: string) => dlg(page).locator(`[role="tab"][data-tab="${id}"]`);
const item = (page: Page, id: string) => dlg(page).locator(`.wc-looks-it[data-id="${id}"]`);
const items = (page: Page) => dlg(page).locator('.wc-looks-it');
const active = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.id ?? document.activeElement?.className ?? '');

/** The demo with the Character pane on, once the character is known. */
async function demo(page: Page, o: { height?: 'auto' | 'large' | 'medium' } = {}): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 960 });
  await page.goto(DEMO);
  await page.waitForFunction(() => window.__wc?.app !== undefined);
  await page.evaluate((height) => window.__wc!.settings.update({ panes: { character: { on: true } }, character: { height } }), o.height ?? 'auto');
  await expect.poll(() => page.evaluate(() => window.__wc!.app.game.char.view().name)).toBe('Rasta');
}

async function openPicker(page: Page): Promise<void> {
  await expect(disc(page)).toHaveAttribute('data-lookable', '');
  await disc(page).click();
  await expect(dlg(page)).toBeVisible();
}

test('a normal start loads nothing from /tokens/', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/tokens/')) asked.push(r.url());
  });
  await demo(page);
  await expect(disc(page)).toHaveAttribute('data-look', 'auto');
  await page.waitForTimeout(500);
  expect(asked).toEqual([]);
  // The picker asks for the manifest; the pictures only when shown.
  await openPicker(page);
  await tab(page, 'lib').click();
  await expect(item(page, 'elf-f-noldor')).toBeVisible();
  expect(asked.some((u) => u.includes('/tokens/tokens.json?v='))).toBe(true);
});

test('the portrait opens the picker: filter, search, pick live, cancel puts the old look back', async ({ page }) => {
  await demo(page);
  await expect(disc(page)).toHaveAttribute('data-tip', 'Click to choose a look');
  expect(await disc(page).evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
  await openPicker(page);
  await expect(dlg(page)).toHaveAttribute('aria-label', 'Look for Rasta');
  await expect(tab(page, 'auto')).toHaveAttribute('aria-selected', 'true');
  await expect(dlg(page).locator('.wc-looks-auto')).toContainText('Follows your race and sex (Dunadan man, male)');
  await expect(dlg(page).locator('.wc-looks-share')).toContainText('Show my look to other MUME Cockpit players');
  await expect(dlg(page)).not.toContainText('WebCockpit');

  await tab(page, 'lib').click();
  await expect(dlg(page).locator('.wc-looks-chip[data-chip="all"]')).toHaveText('All125');
  await dlg(page).locator('.wc-looks-chip[data-chip="dwarf"]').click();
  await expect(items(page)).toHaveCount(4);
  await dlg(page).locator('.wc-looks-chip[data-chip="female"]').click();
  await expect(items(page)).toHaveCount(2);
  await dlg(page).locator('.wc-looks-chip[data-chip="mount"]').click();
  await expect(items(page)).toHaveCount(15);
  await dlg(page).locator('.wc-looks-chip[data-chip="all"]').click();
  await dlg(page).locator('.wc-looks-search').fill('noldor');
  await expect(items(page)).toHaveCount(2);
  await dlg(page).locator('.wc-looks-search').fill('zzzz');
  await expect(dlg(page).locator('.wc-looks-empty')).toBeVisible();
  await dlg(page).locator('.wc-looks-search').fill('elf f noldor');
  await expect(items(page)).toHaveCount(1);

  // A pick shows at once in the pane and in the preview.
  await item(page, 'elf-f-noldor').click();
  await expect(item(page, 'elf-f-noldor')).toHaveAttribute('aria-pressed', 'true');
  await expect(disc(page)).toHaveAttribute('data-look', 'lib:elf-f-noldor');
  await expect(disc(page)).toHaveAttribute('data-art', 'lib');
  await expect(dlg(page).locator('.wc-looks-frame')).toHaveClass(/is-lib/);
  await expect(dlg(page).locator('.wc-looks-share')).toContainText('Others see the library token Elf-F-Noldor.');

  // Cancel puts back the look the dialog opened with; the input has the focus.
  await dlg(page).locator('[data-btn="CANCEL"]').click();
  await expect(dlg(page)).toHaveCount(0);
  await expect(disc(page)).toHaveAttribute('data-look', 'auto');
  await expect(field(page)).toBeFocused();
  expect(await page.evaluate(() => window.__wc!.app.looks!.stored('rasta'))).toBeNull();
});

test('"Use this look" keeps it, also after a reload; the share switch is the setting', async ({ page }) => {
  await demo(page);
  await openPicker(page);
  await tab(page, 'lib').click();
  await item(page, 'hobbit-m-scout').click();
  await dlg(page).locator('.wc-looks-sw').click();
  expect(await page.evaluate(() => window.__wc!.settings.get().character.shareLook)).toBe(false);
  await dlg(page).locator('.wc-looks-sw').click();
  await dlg(page).locator('[data-btn="USE"]').click();
  await expect(dlg(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  await expect(disc(page)).toHaveAttribute('data-look', 'lib:hobbit-m-scout');
  await expect(disc(page).locator('img.wc-cc-photo')).toHaveAttribute('src', /\/tokens\/p\/hobbit-m-scout\.webp$/);
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => window.__wc?.app !== undefined);
  await expect(disc(page)).toHaveAttribute('data-look', 'lib:hobbit-m-scout');
  // Opening again starts on the Library tab, the choice selected; Automatic puts the drawing back.
  await openPicker(page);
  await expect(tab(page, 'lib')).toHaveAttribute('aria-selected', 'true');
  await expect(item(page, 'hobbit-m-scout')).toHaveAttribute('aria-pressed', 'true');
  await tab(page, 'auto').click();
  await dlg(page).locator('.wc-looks-auto').click();
  await dlg(page).locator('[data-btn="USE"]').click();
  await expect(disc(page)).toHaveAttribute('data-look', 'auto');
});

test('keys: tabs by arrows, the grid by arrows, Enter picks and uses, Esc cancels; the focus goes back to the input', async ({ page }) => {
  await demo(page);
  await openPicker(page);
  // The focus starts on the Automatic card; Shift+Tab walks back to the tabs.
  await expect.poll(() => active(page)).toContain('wc-looks-auto');
  await page.keyboard.press('Shift+Tab');
  await expect(tab(page, 'mine')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tab(page, 'lib')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'lib')).toBeFocused();
  // Into the chips, the search, the grid.
  await dlg(page).locator('.wc-looks-search').focus();
  await page.keyboard.type('elf');
  await expect(items(page).first()).toBeVisible();
  const n = await items(page).count();
  expect(n).toBeGreaterThan(6);
  await page.keyboard.press('ArrowDown');
  const first = await items(page).nth(0).getAttribute('data-id');
  await expect.poll(() => active(page)).toBe(first);
  await page.keyboard.press('ArrowRight');
  const second = await items(page).nth(1).getAttribute('data-id');
  await expect.poll(() => active(page)).toBe(second);
  // Down moves by the grid's columns.
  const cols = await page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLElement>('[data-dlg="look"] .wc-looks-it')];
    return els.findIndex((e) => e.offsetTop !== els[0]!.offsetTop);
  });
  await page.keyboard.press('ArrowDown');
  const below = await items(page).nth(1 + cols).getAttribute('data-id');
  await expect.poll(() => active(page)).toBe(below);
  await page.keyboard.press('Enter');
  await expect(item(page, below!)).toHaveAttribute('aria-pressed', 'true');
  await expect(disc(page)).toHaveAttribute('data-look', `lib:${below}`);
  // Esc cancels.
  await page.keyboard.press('Escape');
  await expect(dlg(page)).toHaveCount(0);
  await expect(disc(page)).toHaveAttribute('data-look', 'auto');
  await expect(field(page)).toBeFocused();
  // Enter on the chosen picture uses it.
  await openPicker(page);
  await tab(page, 'lib').click();
  await item(page, 'orc-m-shaman').click();
  await item(page, 'orc-m-shaman').focus();
  await page.keyboard.press('Enter');
  await expect(dlg(page)).toHaveCount(0);
  await expect(disc(page)).toHaveAttribute('data-look', 'lib:orc-m-shaman');
  await expect(field(page)).toBeFocused();
});

test('My images says it needs an account (own images come later)', async ({ page }) => {
  await demo(page);
  await openPicker(page);
  await tab(page, 'mine').click();
  await expect(dlg(page).locator('.wc-looks-out')).toContainText('Your own images need an account.');
});

test('the compact card reaches the picker through the gear', async ({ page }) => {
  await demo(page);
  // The compact card (a Character pane 62 × 4 floating): no portrait to click.
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      const R = d.layout.docks.right;
      for (const l of [R.head, ...R.lanes.map((x) => x.panes), R.tail]) {
        const i = l.findIndex((p) => p.id === 'character');
        if (i >= 0) l.splice(i, 1);
      }
      R.lanes = R.lanes.filter((l) => l.panes.length > 0);
      const f = d.panes.character.border ? 2 : 0;
      d.layout.floating = [...d.layout.floating.filter((x) => x.id !== 'character'), { id: 'character', x: 1, y: 1, w: 62 + f, h: 4 + f }];
    }),
  );
  await expect(page.locator('.wc-pane-character .wc-cc')).toHaveAttribute('data-step', 'compact');
  await expect(disc(page)).toBeHidden();
  const pane = page.locator('.wc-pane-character');
  // Over the title row: Playwright's Firefox drops :hover over the card's buttons (character-card.spec.ts).
  await pane.hover({ position: { x: 16, y: 6 } });
  await pane.locator('> .wc-pane-btn-gear').click();
  const gear = page.locator('.wc-sp-gear-character');
  await expect(gear).toBeVisible();
  await gear.locator('.wc-sp-look').click();
  await expect(gear).toHaveCount(0);
  await expect(dlg(page)).toBeVisible();
  await expect(dlg(page)).toHaveAttribute('aria-label', 'Look for Rasta');
  await dlg(page).locator('[data-btn="CANCEL"]').click();
  await expect(field(page)).toBeFocused();
});
