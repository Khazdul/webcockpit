// The look picker on a phone (stage 80 part F): a page of the phone's menu,
// opened by a tap on the Character card's portrait, on a Group token (a
// one-line row's leading area) and from the Character settings' "Look…"
// row. The tabs, the chips and the search, a pick by tap that shows live,
// Cancel and the band's Back putting the old look back, "Use this look"
// keeping it; My images logged out (the login card) and in an account's
// space (the record only: no API call under webdriver) with the crop by
// touch (a drag and a two-finger pinch, as touch pointer events); tokens in
// the lens at its closest level. `phone` project (Pixel 7); the offline
// cockpit with the demo replayed, nothing reaches MUME.
import { type Page, expect, test } from '@playwright/test';

const FACE = 'tests/fixtures/looks/face.png';
const lookPage = (page: Page) => page.locator('.wc-ph-menu-surface [data-page="look"]');
const tab = (page: Page, id: string) => lookPage(page).locator(`[role="tab"][data-tab="${id}"]`);
const chip = (page: Page, id: string) => lookPage(page).locator(`.wc-looks-chip[data-chip="${id}"]`);
const item = (page: Page, id: string) => lookPage(page).locator(`.wc-looks-it[data-id="${id}"]`);
const items = (page: Page) => lookPage(page).locator('.wc-looks-grid .wc-looks-it');
const btn = (page: Page, id: string) => lookPage(page).locator(`[data-btn="${id}"]`);
const character = (page: Page) => page.locator('.wc-cockpit > .wc-pane-character[data-phone-strip]');
const disc = (page: Page) => character(page).locator('.wc-cc-disc');
const groupPane = (page: Page) => page.locator('.wc-cockpit > .wc-pane-group[data-phone-strip]');

const emit = (page: Page, pkg: string, data: unknown) =>
  page.evaluate(([p, d]) => window.__wc!.app.bus.emit('gmcp', { pkg: p as string, key: (p as string).toLowerCase(), data: d }), [pkg, data] as const);

/** The demo replayed (after the map walk, for the lens), the strip open on `pane`. */
async function open(page: Page, pane: 'character' | 'group', o: { account?: boolean } = {}): Promise<void> {
  if (o.account) await page.addInitScript(() => localStorage.setItem('wc.space', JSON.stringify({ nameKey: 'phonelooks', state: 'open' })));
  await page.goto('/?replay&phone=1');
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await page.evaluate((id) => {
    const s = window.__wc!.settings;
    s.update({ phone: { strip: { panes: s.get().phone.strip.panes.map((e) => ({ ...e, on: e.id === id })) } } });
  }, pane);
  await page.evaluate(async () => {
    const walk = await (await fetch('/__fixtures/map-demo.log')).text();
    const text = await (await fetch('/__fixtures/gmcp-demo.log')).text();
    window.__wc!.app.startReplay(walk.replace(/\n?$/, '\n') + text, 'gmcp-demo.log', 0);
  });
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
  await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
  if (pane === 'character') await expect(character(page).locator('.wc-cc-name')).toHaveText('Rasta');
  else await expect(groupPane(page).locator('.wc-gp-row[data-name]').first()).toBeVisible();
}

/** Every key of the page that is shown takes a finger (44 CSS px both ways; a chip with its margin). */
async function fingerSized(page: Page): Promise<void> {
  const small = await lookPage(page)
    .locator('button:visible, input:visible')
    .evaluateAll((els) =>
      els
        .map((el) => {
          const r = el.getBoundingClientRect();
          // A chip's ::after takes 4 px round it.
          const pad = el.classList.contains('wc-looks-chip') ? 8 : 0;
          return { what: (el as HTMLElement).dataset.btn ?? (el as HTMLElement).dataset.chip ?? (el as HTMLElement).dataset.tab ?? (el as HTMLElement).dataset.id ?? el.className, w: r.width + pad, h: r.height + pad };
        })
        .filter((b) => b.w < 44 || b.h < 44),
    );
  // (The share switch is the kit's, in a 48 px row that is not itself the key: the row's own rule.)
  expect(small.filter((b) => !String(b.what).includes('wc-lk-toggle'))).toEqual([]);
}

test('the portrait opens the page: tabs, chips, search, a pick by tap shows live, Cancel puts the old look back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, 'character');
  await expect(disc(page)).toHaveAttribute('data-lookable', '');
  await expect(disc(page)).toHaveAttribute('data-look', 'auto');
  await disc(page).tap();
  await expect(lookPage(page)).toBeVisible();
  await expect(lookPage(page)).toHaveAttribute('aria-label', 'Look for Rasta');
  await expect(lookPage(page).locator('.wc-ph-hood')).toHaveText('Look for Rasta');
  await expect(tab(page, 'auto')).toHaveAttribute('aria-selected', 'true');
  await expect(lookPage(page).locator('.wc-looks-auto')).toContainText('Follows your race and sex');
  await expect(lookPage(page)).toContainText('Show my look to other MUME Cockpit players');
  await expect(lookPage(page)).not.toContainText('WebCockpit');
  // No keyboard came up: nothing of the page has the focus.
  expect(await page.evaluate(() => document.activeElement?.tagName ?? '')).not.toBe('INPUT');
  await fingerSized(page);

  await tab(page, 'lib').tap();
  await expect(tab(page, 'lib')).toHaveAttribute('aria-selected', 'true');
  await expect(chip(page, 'all')).toHaveText('All125');
  await expect(items(page)).toHaveCount(125);
  await chip(page, 'dwarf').tap();
  await expect(items(page)).toHaveCount(4);
  await chip(page, 'female').tap();
  await expect(items(page)).toHaveCount(2);
  await chip(page, 'mount').tap();
  await expect(items(page)).toHaveCount(15);
  await chip(page, 'all').tap();
  await fingerSized(page);
  // The search: our keyboard (the field asks the device for none).
  const search = lookPage(page).locator('.wc-looks-search');
  await expect(search).toHaveAttribute('inputmode', 'none');
  await search.fill('noldor');
  await expect(items(page)).toHaveCount(2);
  // The grid is laid out in columns and scrolls with the page.
  const grid = await lookPage(page).locator('.wc-looks-grid').evaluate((g) => ({ cols: getComputedStyle(g).gridTemplateColumns.split(' ').length, over: getComputedStyle(g).overflowY }));
  expect(grid.cols).toBeGreaterThanOrEqual(4);
  expect(grid.over).toBe('visible');

  await item(page, 'elf-f-noldor').tap();
  await expect(item(page, 'elf-f-noldor')).toHaveAttribute('aria-pressed', 'true');
  // Live in the card under the page.
  await expect(disc(page)).toHaveAttribute('data-look', 'lib:elf-f-noldor');
  await expect(lookPage(page).locator('.wc-looks-ph-prev .wc-looks-pimg img')).toHaveAttribute('src', /elf-f-noldor/);
  await btn(page, 'CANCEL').tap();
  await expect(lookPage(page)).toHaveCount(0);
  await expect(disc(page)).toHaveAttribute('data-look', 'auto');
  expect(await page.evaluate(() => window.__wc!.app.looks!.stored('rasta'))).toBeNull();
  // The band's Back cancels too.
  await disc(page).tap();
  await tab(page, 'lib').tap();
  await item(page, 'hobbit-m-scout').tap();
  await expect(disc(page)).toHaveAttribute('data-look', 'lib:hobbit-m-scout');
  await btn(page, 'BACK').tap();
  await expect(lookPage(page)).toHaveCount(0);
  await expect(disc(page)).toHaveAttribute('data-look', 'auto');
  expect(errors).toEqual([]);
});

test('Use this look keeps the pick; Esc from a hardware keyboard cancels', async ({ page }) => {
  await open(page, 'character');
  await disc(page).tap();
  await tab(page, 'lib').tap();
  await item(page, 'hobbit-m-scout').tap();
  await btn(page, 'USE').tap();
  await expect(lookPage(page)).toHaveCount(0);
  await expect(disc(page)).toHaveAttribute('data-look', 'lib:hobbit-m-scout');
  await expect.poll(() => page.evaluate(() => window.__wc!.app.looks!.stored('rasta'))).toEqual({ src: 'lib', id: 'hobbit-m-scout' });
  // Opened again it starts on the Library with the pick selected.
  await disc(page).tap();
  await expect(tab(page, 'lib')).toHaveAttribute('aria-selected', 'true');
  await expect(item(page, 'hobbit-m-scout')).toHaveAttribute('aria-pressed', 'true');
  // Esc (a hardware keyboard) cancels, as the back gesture does.
  await page.keyboard.press('Escape');
  await expect(lookPage(page)).toHaveCount(0);
  await expect(disc(page)).toHaveAttribute('data-look', 'lib:hobbit-m-scout');
});

test('a Group token opens the page for that member; the row’s leading area takes the tap', async ({ page }) => {
  await open(page, 'group');
  const row = groupPane(page).locator('.wc-gp-row[data-name="Dori"]');
  await expect(row.locator('button.wc-gp-tk')).toHaveCount(1);
  await row.locator('button.wc-gp-tk').tap();
  await expect(lookPage(page)).toHaveAttribute('aria-label', 'Look for Dori');
  await expect(lookPage(page).locator('.wc-looks-auto')).toBeVisible();
  // A member: Reset to automatic and no share switch.
  await expect(btn(page, 'RESET')).toBeVisible();
  await expect(lookPage(page)).not.toContainText('Show my look');
  await tab(page, 'lib').tap();
  await chip(page, 'dwarf').tap();
  const first = items(page).first();
  const id = (await first.getAttribute('data-id'))!;
  await first.tap();
  await expect(row.locator('.wc-gp-tkd')).toHaveAttribute('data-look', `lib:${id}`);
  await btn(page, 'USE').tap();
  await expect(lookPage(page)).toHaveCount(0);
  await expect(row.locator('.wc-gp-tkd')).toHaveAttribute('data-look', `lib:${id}`);

  // One-line rows (many members in the strip): a tap left of the small token, on the row's start, opens it.
  const many = Array.from({ length: 14 }, (_, i) => ({ id: i + 2, type: 'ally', name: `Member${String.fromCharCode(97 + i)}`, hp: 100, maxhp: 100, position: 'standing' }));
  await emit(page, 'Group.Set', many);
  const r = groupPane(page).locator('.wc-gp-row[data-name="Memberb"]');
  await expect(r).toHaveClass(/\bwc-gp-m1\b/);
  const tk = (await r.locator('button.wc-gp-tk').boundingBox())!;
  const rb = (await r.boundingBox())!;
  expect(tk.width).toBeLessThan(44);
  await page.touchscreen.tap(Math.max(rb.x + 2, tk.x - 3), tk.y + tk.height / 2);
  await expect(lookPage(page)).toHaveAttribute('aria-label', 'Look for Memberb');
  await btn(page, 'CANCEL').tap();
});

test('the Character settings: the Look group’s “Look…” row opens the page, Back returns to the settings', async ({ page }) => {
  await open(page, 'character');
  await page.evaluate(() => window.__wc!.app.onCommand('#settings'));
  const settings = page.locator('.wc-ph-menu-surface .wc-ph-page[data-page="settings"]');
  await expect(settings).toBeVisible();
  await settings.locator('[data-row="character-fetch"]').scrollIntoViewIfNeeded();
  await settings.locator('[data-row="character-fetch"]').tap();
  const sub = page.locator('.wc-ph-page[data-page="sub:character"]');
  await expect(sub).toBeVisible();
  const row = sub.locator('[data-row="character-look-open"]');
  await row.scrollIntoViewIfNeeded();
  await expect(row).toHaveText(/Look…/);
  await expect(sub.locator('[data-row="character-share-look"]')).toBeVisible();
  await row.tap();
  await expect(lookPage(page)).toHaveAttribute('aria-label', 'Look for Rasta');
  await tab(page, 'lib').tap();
  await item(page, 'elf-f-noldor').tap();
  await btn(page, 'CANCEL').tap();
  await expect(sub).toBeVisible();
  await expect(disc(page)).toHaveAttribute('data-look', 'auto');
  await row.tap();
  await tab(page, 'lib').tap();
  await item(page, 'elf-f-noldor').tap();
  await btn(page, 'USE').tap();
  await expect(sub).toBeVisible();
  await expect(disc(page)).toHaveAttribute('data-look', 'lib:elf-f-noldor');
});

test('My images: the login card logged out', async ({ page }) => {
  await open(page, 'character');
  await disc(page).tap();
  await tab(page, 'mine').tap();
  const card = lookPage(page).locator('[data-mine="login"]');
  await expect(card).toContainText('Log in to use your own images.');
  await expect(card.locator('[data-btn="LOGIN"]')).toBeVisible();
  await fingerSized(page);
});

test('My images in an account: the crop by touch (drag and pinch), Save, the image as the portrait', async ({ page }) => {
  await open(page, 'character', { account: true });
  await disc(page).tap();
  await tab(page, 'mine').tap();
  await expect(lookPage(page).locator('.wc-looks-shelf')).toBeVisible();
  await lookPage(page).locator('.wc-looks-file').setInputFiles(FACE);
  const area = lookPage(page).locator('.wc-looks-croparea');
  await expect(area).toBeVisible();
  const b = (await area.boundingBox())!;
  expect(b.width).toBeGreaterThanOrEqual(280);
  await fingerSized(page);
  const zoom = () => lookPage(page).locator('.wc-looks-zoomr').evaluate((el) => Number((el as HTMLInputElement).value));
  expect(await zoom()).toBe(100);
  // Touch pointers, as a finger's (Playwright's touchscreen has taps only).
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await area.evaluate(
    (el, [x, y]) => {
      const ev = (type: string, id: number, px: number, py: number) =>
        el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 11, clientX: px, clientY: py, bubbles: true, cancelable: true }));
      // Pinch out: two fingers 40 px apart to 120 px apart.
      ev('pointerdown', 11, x! - 20, y!);
      ev('pointerdown', 12, x! + 20, y!);
      for (let i = 1; i <= 8; i++) {
        ev('pointermove', 11, x! - 20 - i * 5, y!);
        ev('pointermove', 12, x! + 20 + i * 5, y!);
      }
      ev('pointerup', 12, x! + 60, y!);
      ev('pointerup', 11, x! - 60, y!);
    },
    [cx, cy] as const,
  );
  await expect.poll(zoom).toBeGreaterThanOrEqual(280);
  // A drag moves the picture (the zoom stays).
  const before = await area.locator('canvas').screenshot();
  await area.evaluate(
    (el, [x, y]) => {
      const ev = (type: string, px: number, py: number) =>
        el.dispatchEvent(new PointerEvent(type, { pointerId: 21, pointerType: 'touch', isPrimary: true, clientX: px, clientY: py, bubbles: true, cancelable: true }));
      ev('pointerdown', x!, y!);
      for (let i = 1; i <= 6; i++) ev('pointermove', x! + i * 6, y! + i * 4);
      ev('pointerup', x! + 36, y! + 24);
    },
    [cx, cy] as const,
  );
  await expect.poll(async () => Buffer.compare(before, await area.locator('canvas').screenshot()) !== 0).toBe(true);
  expect(await zoom()).toBeGreaterThanOrEqual(280);
  await btn(page, 'CROP-SAVE').tap();
  await expect(lookPage(page).locator('.wc-looks-slot.is-full')).toHaveCount(1);
  await expect(lookPage(page).locator('.wc-looks-slot.is-full')).toHaveAttribute('aria-pressed', 'true');
  await btn(page, 'USE').tap();
  await expect(disc(page)).toHaveAttribute('data-look', /^own:/);
});

test('the lens at its closest level draws tokens', async ({ page }) => {
  await open(page, 'character');
  const content = page.locator('.wc-pane-map .wc-pane-content');
  // The lens opens at its closest level (z1, near: some 34 px a room on this phone).
  await expect(page.locator('.wc-ph-lens')).toHaveAttribute('data-level', 'z1');
  await expect(content).toHaveAttribute('data-map-tokens', /^[1-9]/, { timeout: 15_000 });
  // One step out (z2, some 17 px a room): under the 20 px rule, the boxes again.
  await page.locator('.wc-ph-lens-glass').tap();
  await expect(page.locator('.wc-ph-lens')).toHaveAttribute('data-level', 'z2');
  await expect(content).toHaveAttribute('data-map-tokens', /^0\//, { timeout: 15_000 });
});

test('the search takes our keyboard: typed keys filter, its Esc folds it and the page stays', async ({ page }) => {
  await open(page, 'character');
  await disc(page).tap();
  await tab(page, 'lib').tap();
  await lookPage(page).locator('.wc-looks-search').tap();
  const okb = page.locator('.wc-okb-page');
  await expect(okb).toBeVisible();
  // Above the page, and the page ends above it (its foot gives way).
  for (const ch of 'noldor') await okb.locator(`.wc-ph-okb-k[data-ch="${ch}"]`).first().tap();
  await expect(lookPage(page).locator('.wc-looks-search')).toHaveValue('noldor');
  await expect(items(page)).toHaveCount(2);
  const page_ = (await lookPage(page).boundingBox())!;
  const kb = (await okb.boundingBox())!;
  expect(page_.y + page_.height).toBeLessThanOrEqual(kb.y + 1);
  await okb.locator('.wc-ph-okb-k[data-act="esc"]').first().tap();
  await expect(okb).toBeHidden();
  await expect(lookPage(page)).toBeVisible();
  await expect(btn(page, 'USE')).toBeVisible();
});
