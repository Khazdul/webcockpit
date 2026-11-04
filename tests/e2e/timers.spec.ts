// Stage 5 P2: the Timers pane and Options → Panes → Timers. The offline
// GMCP demo makes the panes active (they keep their picture after the
// replay); the debug hooks on `game.timers` put the cells in.
import { type Page, expect, test } from '@playwright/test';
import { menuFrame, openEscOptions } from './esc-options';

const DEMO = '/?fixture=gmcp-demo.log&speed=0';

// Tall enough for the Timers pane to show all eight rows of `populate`.
test.use({ viewport: { width: 1400, height: 1100 } });

const rows = (page: Page) => page.locator('.wc-rows .wc-row');
const content = (page: Page) => page.locator('.wc-pane[data-pane="timers"] .wc-pane-content');
const prows = (page: Page) => content(page).locator('.wc-prow');
const hit = (page: Page, sel: string) => content(page).locator(`.wc-timers-hit${sel}`);

const texts = async (page: Page): Promise<string[]> => (await prows(page).allTextContents()).map((t) => t.trimEnd());

/** Pins the right dock to Cockpit's fixed heights 9/8/6/10/5 (the default shares them out, ADR 0023). */
async function cockpitHeights(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      const want: Record<string, number> = { character: 9, timers: 8, group: 6, comm: 10, ui: 5 };
      for (const p of d.layout.docks.right.lanes[0]!.panes) p.desired = want[p.id] ?? p.desired;
    }),
  );
}

async function demoDone(page: Page): Promise<void> {
  await page.goto(DEMO);
  await expect(rows(page).filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
  await expect(page.locator('.wc-pane[data-pane="timers"]')).toHaveAttribute('data-active', '');
  await cockpitHeights(page); // the Timers pane at eight rows
  // The interim cell-grid pane (stage 39a): no time text, as these rows were written.
  await page.evaluate(() => window.__wc!.settings.update((d) => void (d.timers.timeText = false)));
}

/** Puts debug cells in: a full spell, a half-drained buff, a blind and a charm. */
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
    t.debugAdd(c('s1', 'sanctuary', 'spell', 600_000, 600_000) as never);
    t.debugAdd(c('s2', 'armour', 'spell', 600_000, 600_000) as never);
    t.debugAdd(c('b1', 'bless', 'buff', 300_000, 600_000) as never);
    t.debugAdd(c('x1', '2.orc', 'blind', 90_000, 90_000) as never);
    t.debugAdd(c('c1', 'huge stone troll', 'charm', 3_000_000, 3_600_000) as never);
  });
}

test('the Timers pane draws groups, bars and charm rows; × drops a charm', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await demoDone(page);
  await populate(page);
  await expect.poll(() => texts(page)).toHaveLength(8);
  const t = await texts(page);
  expect(t[0]).toMatch(/^Spells:\s+\+$/);
  expect(t[1]).toMatch(/^ARMOUR\s+▌SANCTUARY\s+▌$/);
  expect(t[2]).toBe('Buffs:');
  expect(t[3]).toMatch(/^BLESS\s*$/);
  expect(t[5]).toMatch(/^2\.ORC\s+▌$/);
  expect(t[7]).toMatch(/^Huge stone troll\s+10m ×$/);
  // The full spell bar: black on the group blue.
  const bar = prows(page).nth(1).locator('span').first();
  await expect(bar).toHaveCSS('background-color', 'rgb(102, 178, 255)');
  await expect(bar).toHaveCSS('color', 'rgb(0, 0, 0)');
  // The charm ×: hover brightens, click forgets the charm.
  const x = hit(page, '[data-hit="charm"]');
  await expect(x).toHaveCount(1);
  await x.hover();
  await expect(prows(page).nth(7).locator('span').last()).toHaveCSS('color', 'rgb(232, 136, 136)');
  await x.click();
  await expect.poll(() => texts(page)).toHaveLength(6);
  expect(await page.evaluate(() => window.__wc!.app.game.timers.view().cells.charm.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('the corner + opens the herblore add-view; [+] Healing starts it', async ({ page }) => {
  await demoDone(page);
  await populate(page);
  await expect.poll(() => texts(page)).toHaveLength(8);
  await hit(page, '[data-hit="corner"]').click();
  await expect(content(page)).toHaveAttribute('data-mode', 'add');
  const catalogue = ['[+] Travelling', '[+] Clearthought', '[+] Walking', '[+] Haste', '[+] Dark aura'];
  await expect.poll(() => texts(page)).toEqual([expect.stringMatching(/^\[\+\] Healing\s+×$/), ...catalogue]);
  await hit(page, '[data-key="Healing"]').click();
  await expect.poll(() => texts(page)).toEqual([expect.stringMatching(/^\[-\] Healing\s+×$/), ...catalogue]);
  expect(await page.evaluate(() => window.__wc!.app.game.timers.view().herbs.find((h) => h.key === 'Healing')?.active)).toBe(true);
  // The corner × goes back to the grid.
  await hit(page, '[data-hit="corner"]').click();
  await expect(content(page)).toHaveAttribute('data-mode', 'grid');
  await expect.poll(async () => (await texts(page))[0]).toMatch(/^Spells:\s+\+$/);
});

test('the Timers gear changes colours and headers live (ADR 0107)', async ({ page }) => {
  await demoDone(page);
  await populate(page);
  await expect.poll(() => texts(page)).toHaveLength(8);
  // The pane's buttons show on hover (ADR 0095).
  await page.locator('.wc-pane-timers').hover();
  await page.locator('.wc-pane-timers > .wc-pane-btn-gear').click();
  const pop = page.locator('.wc-sp-gear-timers');
  const colour = pop.locator('[aria-label="Spells colour"]');
  await expect(colour).toContainText('Blue');
  const pick = async (v: string) => {
    await colour.click();
    await page.locator(`.wc-ck-list .wc-ck-opt[data-value="${v}"]`).click();
  };
  // Spells off → the group hides.
  await pick('off');
  await expect.poll(() => texts(page)).toHaveLength(6);
  expect((await texts(page))[0]).toMatch(/^Buffs:/);
  // Green: shown again in green.
  await pick('green');
  await expect.poll(() => texts(page)).toHaveLength(8);
  await expect(prows(page).nth(1).locator('span').first()).toHaveCSS('background-color', 'rgb(0, 217, 0)');
  // Display headers off.
  const headers = pop.locator('.wc-ck-tg[aria-label="Display headers"]');
  await expect(headers).toHaveAttribute('aria-checked', 'true');
  await headers.click();
  await expect(headers).toHaveAttribute('aria-checked', 'false');
  await expect.poll(() => texts(page)).toHaveLength(4);
  const s = await page.evaluate(() => window.__wc!.settings.get().timers);
  expect(s.groups.spell).toEqual({ enabled: true, color: '#00d900', layout: 'default' });
  expect(s.headers).toBe(false);
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('Options → Panes → Timers works in the phone\'s ESC menu', async ({ page }) => {
  // The start page's Options went in stage 32; the phone's ESC menu keeps it.
  await openEscOptions(page);
  await menuFrame(page).locator('.wc-mrow[data-key="panes"] .wc-label').click();
  await menuFrame(page).locator('.wc-mrow[data-key="timers"] .wc-label').click();
  const frame = menuFrame(page);
  await expect(frame.locator('.wc-title-row')).toHaveText('─── Timers ───');
  // Blinds → Red (click); its default swatch Cyan → Auto.
  const blinds = frame.locator('.wc-grid-row').nth(5);
  await blinds.locator('.wc-check[title="Blinds: Red"]').click();
  await expect(blinds.locator('.wc-check[title="Blinds: Red"] .wc-check-box')).toHaveText('[X]');
  expect(await page.evaluate(() => window.__wc!.settings.get().timers.groups.blind.color)).toBe('#d90000');
  await blinds.locator('.wc-check[title="Blinds: Cyan"]').click();
  expect(await page.evaluate(() => window.__wc!.settings.get().timers.groups.blind.color)).toBe('auto');
  // Time text.
  const was = await page.evaluate(() => window.__wc!.settings.get().timers.timeText);
  await frame.locator('.wc-mrow[data-key="timetext"] .wc-label').click();
  expect(await page.evaluate(() => window.__wc!.settings.get().timers.timeText)).toBe(!was);
  await page.evaluate(() => window.__wc!.settings.reset());
});
