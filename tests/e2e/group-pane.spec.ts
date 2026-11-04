// Stage 39b (ADR 0122): the Group pane's modern look, driven by the GMCP
// demo and then by GMCP emitted on the app bus: the fight zone comes and
// goes, away members show the room or are only dimmed, the bars carry
// tooltips, crowded panes switch to one line, a bar colour applies live.
import { type Page, expect, test } from '@playwright/test';

const DEMO = '/?fixture=gmcp-demo.log&speed=0';
const pane = (page: Page) => page.locator('.wc-pane[data-pane="group"] .wc-pane-content');

async function demoDone(page: Page): Promise<void> {
  await page.goto(DEMO);
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
}

const emit = (page: Page, pkg: string, data: unknown) =>
  page.evaluate(([p, d]) => window.__wc!.app.bus.emit('gmcp', { pkg: p as string, key: (p as string).toLowerCase(), data: d }), [pkg, data] as const);

const MEMBERS = [
  { id: 2, type: 'ally', name: 'Gibur', hp: 132, maxhp: 160, mana: 40, maxmana: 100, mp: 72, maxmp: 110, position: 'standing', ride: true, mapid: 100 },
  { id: 3, type: 'ally', name: 'Taube', hp: 37, maxhp: 158, mana: 88, maxmana: 95, mp: 31, maxmp: 100, position: 'fighting', sanctuary: true, poison: true, mapid: 100 },
  { id: 4, type: 'ally', name: 'Kvällulv', hp: 140, maxhp: 140, position: 'sleeping', hungry: true, thirsty: true, mapid: 7, room: 'Prancing Pony' },
];

/** Group floats, wide and tall enough for two-line rows and the fight zone. */
const tall = (page: Page) =>
  page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      const R = d.layout.docks.right;
      for (const l of [R.head, ...R.lanes.map((x) => x.panes), R.tail]) {
        const i = l.findIndex((p) => p.id === 'group');
        if (i >= 0) l.splice(i, 1);
      }
      d.layout.floating = [...d.layout.floating.filter((f) => f.id !== 'group'), { id: 'group', x: 4, y: 2, w: 48, h: 16 }];
      d.panes.group.on = true;
    }),
  );

async function group(page: Page): Promise<void> {
  await demoDone(page);
  await tall(page);
  await emit(page, 'Room.Info', { id: 100 });
  await emit(page, 'Group.Set', MEMBERS);
  await expect(pane(page).locator('.wc-gp-row[data-name]')).toHaveCount(3);
}

test('the fight zone comes and goes; the tank is marked in the list', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await group(page);
  await expect(pane(page).locator('.wc-gp-fight, .wc-gp-fstrip')).toHaveCount(0);
  await emit(page, 'Char.Vitals', { buffer: 'Gibur', opponent: 'a black-robed orc', 'opponent-hits': 'hurt' });
  const fight = pane(page).locator('.wc-gp-fight, .wc-gp-fstrip');
  await expect(fight).toHaveCount(1);
  await expect(pane(page).locator('[data-key="m2"] [data-tip-title="Tanking"]')).toHaveCount(1);
  await emit(page, 'Char.Vitals', { opponent: null });
  await expect(fight).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('you tank (buffer Nobody): the opponent fills the card; the Fight card toggle hides it; bars are solid', async ({ page }) => {
  await group(page);
  await emit(page, 'Char.Vitals', { buffer: 'Nobody', opponent: 'a large bat', 'opponent-hits': 'healthy' });
  const card = pane(page).locator('.wc-gp-fight');
  await expect(card).toHaveClass(/is-solo/);
  await expect(card).not.toContainText('Nobody');
  await expect(card.locator('.wc-gp-fn')).toHaveText(['a large bat']);
  await expect(card.locator('.wc-gp-vs')).toHaveCount(0);
  // No "Group" divider under the card.
  await expect(pane(page).locator('.wc-gp-sep')).toHaveCount(0);
  // Solid bars: no stripes on a band-word bar.
  const fill = card.locator('.wc-gp-fill').first();
  await expect(fill).toHaveCSS('background-image', 'none');
  // The gear's Fight card toggle.
  await page.locator('.wc-pane-group').hover();
  await page.locator('.wc-pane-group > .wc-pane-btn-gear').click();
  await page.locator('.wc-sp-gear-group [aria-label="Fight card"]').click();
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(() => window.__wc!.settings.get().group.fight)).toBe(false);
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('away members: the room name, or dimmed only from the gear', async ({ page }) => {
  await group(page);
  const kv = pane(page).locator('[data-key="m4"]');
  await expect(kv).toHaveClass(/is-away/);
  await expect(kv.locator('.wc-gp-where')).toHaveText('Prancing Pony');
  await page.locator('.wc-pane-group').hover();
  await page.locator('.wc-pane-group > .wc-pane-btn-gear').click();
  const pop = page.locator('.wc-sp-gear-group');
  await pop.locator('[aria-label="Away members"] [data-value="dim"]').click();
  await expect(kv.locator('.wc-gp-where')).toHaveCount(0);
  await expect(kv).toHaveClass(/is-away/);
  expect(await page.evaluate(() => window.__wc!.settings.get().group.away)).toBe('dim');
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('hovering the HP bar shows its numbers; an icon shows its meaning', async ({ page }) => {
  await group(page);
  const tip = page.locator('.wc-ptip');
  await expect(pane(page).locator('.wc-gp-m2')).toHaveCount(3);
  await pane(page).locator('[data-key="m3"] .wc-gp-bar[data-kind="hp"]').hover();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('HP 37/158 · 23%');
  await pane(page).locator('[data-key="m3"] [data-tip-title="Poisoned"]').hover();
  await expect(tip).toContainText('Poisoned');
  await page.mouse.move(2, 2);
  await expect(tip).toBeHidden();
});

test('a crowded pane draws one line per member and the more row', async ({ page }) => {
  await group(page);
  const many = Array.from({ length: 30 }, (_, i) => ({ id: 10 + i, type: 'ally', name: `Ally${i}`, hp: 50, maxhp: 100 }));
  await emit(page, 'Group.Set', many);
  await expect(pane(page).locator('.wc-gp-m1').first()).toBeVisible();
  await expect(pane(page).locator('.wc-gp-m2')).toHaveCount(0);
  await expect(pane(page).locator('.wc-gp-over')).toHaveText(/^↓ \d+ more members$/);
});

test('a bar colour from the gear applies live', async ({ page }) => {
  await group(page);
  const fill = pane(page).locator('[data-key="m2"] .wc-gp-bar[data-kind="hp"] .wc-gp-fill');
  const before = await fill.evaluate((e) => getComputedStyle(e).backgroundColor);
  await page.locator('.wc-pane-group').hover();
  await page.locator('.wc-pane-group > .wc-pane-btn-gear').click();
  const pop = page.locator('.wc-sp-gear-group');
  await pop.locator('.wc-cp-btn[aria-label^="HP colour"]').click();
  await page.locator('.wc-cp-pop .wc-cp-sw[aria-label="Rose"]').click();
  expect(await page.evaluate(() => window.__wc!.settings.get().group.colors.hp)).toBe('#e0566a');
  await expect.poll(() => fill.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(224, 86, 106)');
  expect(before).not.toBe('rgb(224, 86, 106)');
  await page.evaluate(() => window.__wc!.settings.reset());
});
