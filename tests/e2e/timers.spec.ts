// The Timers pane (stage 39c, ADR 0122) and its settings: the gear popup
// and Options → Panes → Timers. The offline GMCP demo makes the panes
// active (they keep their picture after the replay); the debug hooks on
// `game.timers` put the cells in.
import { type Page, expect, test } from '@playwright/test';
import { menuFrame, openEscOptions } from './esc-options';

const DEMO = '/?fixture=gmcp-demo.log&speed=0';

test.use({ viewport: { width: 1400, height: 1100 } });

const rows = (page: Page) => page.locator('.wc-rows .wc-row');
const pane = (page: Page) => page.locator('.wc-pane[data-pane="timers"] .wc-pane-content');
const groups = (page: Page) => pane(page).locator('.wc-tm-g');
const group = (page: Page, id: string) => pane(page).locator(`.wc-tm-g[data-group="${id}"]`);
const groupIds = (page: Page) => groups(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.group));
const item = (page: Page, id: string) => pane(page).locator(`.wc-tm-list [data-id="${id}"]:not(button)`);

async function demoDone(page: Page): Promise<void> {
  await page.goto(DEMO);
  await expect(rows(page).filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
  await expect(page.locator('.wc-pane[data-pane="timers"]')).toHaveAttribute('data-active', '');
  // The Timers pane tall enough for everything below.
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      for (const p of d.layout.docks.right.lanes[0]!.panes) if (p.id === 'timers') p.desired = 24;
    }),
  );
}

/** Puts debug cells in: a spell ending soon, a full spell, a buff, three blinds and a charm. */
async function populate(page: Page): Promise<void> {
  await page.evaluate(() => {
    const t = window.__wc!.app.game.timers;
    const now = Date.now();
    const c = (id: string, name: string, group: string, left: number, total: number) => ({
      id,
      name,
      group,
      startedAt: now - (total - left),
      expiresAt: now + left,
      expected: total,
      tracked: true,
    });
    t.debugAdd(c('s1', 'bless', 'spell', 15_000, 360_000) as never);
    t.debugAdd(c('s2', 'armour', 'spell', 600_000, 600_000) as never);
    t.debugAdd(c('b1', 'miruvor', 'buff', 300_000, 600_000) as never);
    t.debugAdd(c('x1', 'the captain of the guard of Fornost', 'blind', 40_000, 90_000) as never);
    t.debugAdd(c('x2', 'a warg', 'blind', 70_000, 90_000) as never);
    t.debugAdd(c('x3', 'a huge black-scaled warg', 'blind', 80_000, 90_000) as never);
    t.debugAdd(c('c1', 'huge stone troll', 'charm', 3_000_000, 3_600_000) as never);
  });
}

async function openGear(page: Page) {
  await page.locator('.wc-pane-timers').hover();
  await page.locator('.wc-pane-timers > .wc-pane-btn-gear').click();
  return page.locator('.wc-sp-gear-timers');
}

const timersSettings = (page: Page) => page.evaluate(() => window.__wc!.settings.get().timers);

test('the Timers pane draws groups of bars, soonest first; ending soon in red; × drops a charm', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await demoDone(page);
  await populate(page);
  // Herblore is there while enabled, even empty (its header holds the +).
  await expect.poll(() => groupIds(page)).toEqual(['herb', 'spell', 'buff', 'blind', 'charm']);
  // Headers: the name only, no count.
  await expect(group(page, 'spell').locator('.wc-tm-h')).toHaveText('Spells');
  await expect(group(page, 'blind').locator('.wc-tm-h')).toHaveText('Blinds');
  // Soonest first, and the names as written (blinds without the article).
  await expect(group(page, 'spell').locator('.wc-tm-n')).toHaveText(['Bless', 'Armour']);
  // A long blind name is shortened in the middle only as much as the pane needs.
  await expect(group(page, 'blind').locator('.wc-tm-n')).toHaveText([/^captain of the.*Fornost$/, 'warg', 'huge black-scaled warg']);
  // A pill in the group colour (Auto on black: #66b2ff), its fill drained.
  const armour = item(page, 's2');
  await expect(armour).toHaveClass(/wc-tm-chip/);
  const colourOf = (g: string) => group(page, g).evaluate((e) => (e as HTMLElement).style.getPropertyValue('--c'));
  expect(await colourOf('spell')).toBe('#66b2ff');
  const blessFill = await item(page, 's1').locator('.wc-tm-fill').evaluate((e) => parseFloat((e as HTMLElement).style.width));
  expect(blessFill).toBeLessThan(10);
  // Ending soon (15 s ≤ 20 s): the time in red and bold, the colour kept.
  const blessTime = item(page, 's1').locator('.wc-tm-t');
  await expect(blessTime).toHaveText(/^1[0-5]s$/);
  await expect(blessTime).toHaveCSS('color', 'rgb(255, 59, 59)');
  await expect(blessTime).toHaveCSS('font-weight', '700');
  await expect(item(page, 's1')).toHaveClass(/is-text/);
  expect(await colourOf('spell')).toBe('#66b2ff');
  // A tooltip on hover: the full name and the exact time.
  await item(page, 'x1').hover();
  const tip = page.locator('.wc-ptip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('the captain of the guard of Fornost');
  await expect(tip).toContainText('left');
  // The charm × forgets the charmie.
  await pane(page).locator('.wc-tm-x').click();
  await expect.poll(() => groupIds(page)).toEqual(['herb', 'spell', 'buff', 'blind']);
  expect(await page.evaluate(() => window.__wc!.app.game.timers.view().cells.charm.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('Herblore: + opens the menu, a pick starts the herb; × on hover stops it; the group can be turned off', async ({ page }) => {
  await demoDone(page);
  await populate(page);
  await expect.poll(() => groupIds(page)).toHaveLength(5);
  const herb = group(page, 'herb');
  // The old corner + and add-view are gone.
  await expect(pane(page).locator('.wc-tm-corner, .wc-tm-herbs')).toHaveCount(0);
  // The + beside the header's name opens the catalogue.
  const add = herb.locator('.wc-tm-add');
  await expect(herb.locator('.wc-tm-h')).toContainText('Herblores');
  await add.click();
  const menu = page.locator('.wc-tm-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.wc-tm-mi')).toHaveText(['+Healing', '+Travelling', '+Clearthought', '+Walking', '+Haste', '+Dark aura']);
  await menu.locator('.wc-tm-mi[data-key="Healing"]').click();
  await expect(menu).toBeHidden();
  expect(await page.evaluate(() => window.__wc!.app.game.timers.view().herbs.find((h) => h.key === 'Healing')?.active)).toBe(true);
  const healing = item(page, 'herb:Healing');
  await expect(healing).toBeVisible();
  // Running: checked in the menu; Esc closes it, so does a click outside.
  await add.click();
  await expect(menu.locator('.wc-tm-mi[data-key="Healing"]')).toHaveText('✓Healing');
  await expect(menu.locator('.wc-tm-mi[data-key="Healing"]')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await add.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(menu).toBeHidden();
  // The × shows on hover, in place of the time, and stops the herb.
  const x = healing.locator('.wc-tm-x');
  await expect(x).toBeHidden();
  await healing.hover();
  await expect(x).toBeVisible();
  await x.click();
  await expect(healing).toHaveCount(0);
  expect(await page.evaluate(() => window.__wc!.app.game.timers.view().herbs.find((h) => h.key === 'Healing')?.active)).toBe(false);
  // Headers off: Herblore keeps its header (and its +).
  await page.evaluate(() => window.__wc!.settings.update({ timers: { headers: false } }));
  await expect(pane(page).locator('.wc-tm-h:visible')).toHaveCount(1);
  await expect(herb.locator('.wc-tm-add')).toBeVisible();
  // The group off: gone.
  await page.evaluate(() => window.__wc!.settings.update({ timers: { groups: { herb: { enabled: false } } } }));
  await expect(herb).toHaveCount(0);
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('the Timers gear: circles, grid, headers off, time text off, a custom colour, all live', async ({ page }) => {
  await demoDone(page);
  await populate(page);
  await expect.poll(() => groupIds(page)).toHaveLength(5);
  const pop = await openGear(page);
  // No style switch in the pane itself.
  await expect(pane(page).locator('[aria-label="Style"]')).toHaveCount(0);
  // Circles: ring rows.
  await pop.locator('[aria-label="Style"] [data-value="circles"]').click();
  await expect(pane(page).locator('.wc-tm-rc')).toHaveCount(7);
  await expect(pane(page).locator('.wc-tm-chip')).toHaveCount(0);
  await expect(item(page, 's2').locator('.wc-ring-arc')).toHaveCSS('stroke', 'rgb(102, 178, 255)');
  // Grid: the blinds in columns; flow wraps by width.
  const blinds = group(page, 'blind').locator('.wc-tm-items');
  await expect(blinds).toHaveClass(/is-flow/);
  await pop.locator('[aria-label="Layout"] [data-value="grid"]').click();
  await expect(blinds).toHaveClass(/is-grid/);
  await expect(blinds).toHaveCSS('grid-template-columns', /^\S+ \S+/);
  // A group's own layout overrides the global one.
  await pop.locator('[aria-label="Blinds layout"] [data-value="flow"]').click();
  await expect(blinds).toHaveClass(/is-flow/);
  // Headers off: only Herblore's stays (it holds the +).
  await pop.locator('[aria-label="Group headers"]').click();
  await expect(pane(page).locator('.wc-tm-h:visible')).toHaveCount(1);
  // Time text off: bars and rings only.
  await pop.locator('[aria-label="Time text"]').click();
  await expect(pane(page).locator('.wc-tm-t:visible')).toHaveCount(0);
  // A custom colour for Spells from the picker; Auto brings the default back.
  await pop.locator('.wc-cp-btn[aria-label^="Spells colour"]').click();
  await page.locator('.wc-cp-sw[aria-label="Amber"]').click();
  await expect(item(page, 's2').locator('.wc-ring-arc')).toHaveCSS('stroke', 'rgb(217, 165, 63)');
  const s = await timersSettings(page);
  expect(s).toMatchObject({ style: 'circles', layout: 'grid', headers: false, timeText: false });
  expect(s.groups.spell.color).toBe('#d9a53f');
  expect(s.groups.blind.layout).toBe('flow');
  await pop.locator('.wc-cp-btn[aria-label^="Spells colour"]').click();
  await page.locator('.wc-cp-auto').click();
  await expect(item(page, 's2').locator('.wc-ring-arc')).toHaveCSS('stroke', 'rgb(102, 178, 255)');
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('ending soon: a pulse instead of the red time, and nothing with None', async ({ page }) => {
  await demoDone(page);
  await populate(page);
  const bless = item(page, 's1');
  await expect(bless).toHaveClass(/is-text/);
  await page.evaluate(() => window.__wc!.settings.update({ timers: { signal: 'pulse' } }));
  await expect(bless).toHaveClass(/is-pulse/);
  await expect(bless.locator('.wc-tm-fill')).toHaveCSS('animation-name', 'wc-tm-pulse');
  await page.evaluate(() => window.__wc!.settings.update({ timers: { signal: 'none' } }));
  await expect(bless).not.toHaveClass(/is-(text|pulse)/);
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('sanctuary on another group member shows in the Sanctuary group (untimed without your cast)', async ({ page }) => {
  await demoDone(page);
  await page.evaluate(() =>
    window.__wc!.app.bus.emit('gmcp', {
      pkg: 'Group.Set',
      data: [{ id: 7, type: 'ally', name: 'Gibur', label: 0, sanctuary: true, hp: 100, maxhp: 100 }],
    } as never),
  );
  const sanct = pane(page).locator('.wc-tm-g[data-group="sanct"]');
  await expect(sanct).toBeVisible();
  await expect(sanct.locator('.wc-tm-n')).toContainText(['Gibur']);
  const gibur = sanct.locator('.wc-tm-chip', { hasText: 'Gibur' });
  await expect(gibur).toHaveClass(/is-untimed/);
  await expect(gibur.locator('.wc-tm-t')).toHaveText('?');
  // The flag off: gone.
  await page.evaluate(() => window.__wc!.app.bus.emit('gmcp', { pkg: 'Group.Update', data: { id: 7, sanctuary: false } } as never));
  await expect(sanct.locator('.wc-tm-chip', { hasText: 'Gibur' })).toHaveCount(0);
});

test('Options → Panes → Timers works in the phone\'s ESC menu', async ({ page }) => {
  // The start page's Options went in stage 32; the phone's ESC menu keeps it.
  await openEscOptions(page);
  await menuFrame(page).locator('.wc-mrow[data-key="panes"] .wc-label').click();
  await menuFrame(page).locator('.wc-mrow[data-key="timers"] .wc-label').click();
  const frame = menuFrame(page);
  await expect(frame.locator('.wc-title-row')).toHaveText('─── Timers ───');
  const s = () => page.evaluate(() => window.__wc!.settings.get().timers);
  // Style: Bars → Circles with →.
  await frame.locator('.wc-mrow[data-key="style"] .wc-label').click();
  await expect(frame.locator('.wc-mrow[data-key="style"]')).toContainText('Style: Circles');
  expect((await s()).style).toBe('circles');
  // A group: Enter hides it; → steps its colour from Auto to the first picker colour.
  await frame.locator('.wc-mrow[data-key="g-blind"] .wc-label').click();
  expect((await s()).groups.blind.enabled).toBe(false);
  await page.keyboard.press('ArrowRight');
  expect((await s()).groups.blind.color).toBe('#e0566a');
  await expect(frame.locator('.wc-mrow[data-key="g-blind"]')).toContainText('colour: Rose');
  // Time text.
  const was = (await s()).timeText;
  await frame.locator('.wc-mrow[data-key="timetext"] .wc-label').click();
  expect((await s()).timeText).toBe(!was);
  await page.evaluate(() => window.__wc!.settings.reset());
});
