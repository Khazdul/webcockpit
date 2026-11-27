// Group tokens and the scaling rows (stage 80 part C, ADR 0122 addendum
// stage 80): the rows follow the pane's height (one line, two, three with
// the numbers, held at 4.5 cells), a vitals update moves nothing, a click
// on a member's token opens the look picker for that name and the choice
// shows in the row and goes to the map, an NPC gets the library picture
// its name matches, and the switch brings the marker icons back with the
// rows still scaled. Against the GMCP demo (the dev feed through the live
// app, where looks are drawn) with Group GMCP emitted on the app bus.
// Screenshots go to the test's output folder.
import { type Page, type TestInfo, expect, test } from '@playwright/test';

const DEMO = '/?fixture=gmcp-demo.log&speed=0';
const CONTENT = '.wc-pane[data-pane="group"] .wc-pane-content';
const pane = (page: Page) => page.locator(CONTENT);
const row = (page: Page, id: number) => pane(page).locator(`.wc-gp-row[data-key="m${id}"]`);
const token = (page: Page, id: number) => row(page, id).locator('.wc-gp-tk');
const dlg = (page: Page) => page.locator('[data-dlg="look"]');
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');

const emit = (page: Page, pkg: string, data: unknown) =>
  page.evaluate(([p, d]) => window.__wc!.app.bus.emit('gmcp', { pkg: p as string, key: (p as string).toLowerCase(), data: d }), [pkg, data] as const);

const v = (hp: number) => ({ hp, maxhp: 160, mana: 70, maxmana: 100, mp: 90, maxmp: 110 });
const MEMBERS = [
  { id: 2, type: 'ally', name: 'Glorfindel', ...v(70), position: 'standing', mapid: 100 },
  { id: 3, type: 'ally', name: 'Thorin', ...v(160), position: 'standing', sanctuary: true, mapid: 100 },
  { id: 4, type: 'npc', name: 'a trained horse', label: 'HORSE', 'hp-string': 'wounded', 'mp-string': 'rested', position: 'standing', mapid: 100 },
];

/** Records what the main thread sends the map worker (the `tokens` messages). */
async function spyMap(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Base = window.Worker;
    const sent: unknown[] = [];
    (window as unknown as { __tokensSent: unknown[] }).__tokensSent = sent;
    window.Worker = class extends Base {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        if (opts?.name !== 'map') return;
        const post = this.postMessage.bind(this);
        this.postMessage = ((m: unknown, t?: Transferable[]) => {
          if (m && typeof m === 'object' && (m as { t?: string }).t === 'tokens') sent.push(JSON.parse(JSON.stringify(m)));
          return t ? post(m, t) : post(m);
        }) as Worker['postMessage'];
      }
    };
  });
}

/** Group floats `rows` cells of content high (2 more for the frame). */
const size = (page: Page, rows: number, cols = 44) =>
  page.evaluate(
    ([r, c]) =>
      window.__wc!.settings.update((d) => {
        const R = d.layout.docks.right;
        for (const l of [R.head, ...R.lanes.map((x) => x.panes), R.tail]) {
          const i = l.findIndex((p) => p.id === 'group');
          if (i >= 0) l.splice(i, 1);
        }
        d.layout.floating = [...d.layout.floating.filter((f) => f.id !== 'group'), { id: 'group', x: 4, y: 2, w: c, h: r + 2 }];
        d.panes.group.on = true;
      }),
    [rows, cols] as const,
  );

async function group(page: Page, rows: number, members: unknown[] = MEMBERS): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto(DEMO);
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
  await size(page, rows);
  await emit(page, 'Room.Info', { id: 100 });
  await emit(page, 'Group.Set', members);
  await expect(pane(page).locator('.wc-gp-row[data-name]')).toHaveCount(Math.min(members.length, 99));
}

/** The pane's cell height and content height (px). */
const cell = (page: Page) =>
  pane(page).evaluate((c) => ({ c: parseFloat(getComputedStyle(c).getPropertyValue('--cell-h')), H: c.getBoundingClientRect().height }));

const heights = (page: Page) => pane(page).locator('.wc-gp-row[data-name]').evaluateAll((rs) => rs.map((r) => r.getBoundingClientRect().height));

const boxes = (page: Page) =>
  pane(page)
    .locator('.wc-gp-row[data-name], .wc-gp-tk, .wc-gp-trk, .wc-gp-num')
    .evaluateAll((es) => es.map((e) => (({ x, y, width, height }) => [x, y, width, height].map((n) => Math.round(n * 10) / 10).join(','))(e.getBoundingClientRect())));

const snap = async (page: Page, info: TestInfo, name: string) => {
  const path = info.outputPath(`${name}.png`);
  await page.locator('.wc-pane[data-pane="group"]').screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });
};

test('the rows follow the height: one line, two, three with the numbers, held at 4.5 cells', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Content rows → the step for 3 members (free height / 3 against 2c, 3.3c, 4.5c).
  const cases: [number, string, string][] = [
    [4, 'one', '.wc-gp-m1'],
    [6, 'two', '.wc-gp-m2'],
    [10, 'three', '.wc-gp-m3'],
    [16, 'top', '.wc-gp-m3'],
  ];
  await group(page, cases[0]![0]);
  for (const [rows, step, cls] of cases) {
    await size(page, rows);
    await expect(pane(page)).toHaveAttribute('data-step', step);
    await expect(pane(page).locator(cls)).toHaveCount(3);
    const { c, H } = await cell(page);
    const want = Math.min(Math.floor(4.5 * c + 1e-6), Math.floor(H / 3 + 1e-6));
    for (const h of await heights(page)) expect(Math.abs(h - want)).toBeLessThan(0.6);
    // The token: h − 4 on one line, h − 8 from two, at most 68.
    const d = await token(page, 2).evaluate((e) => e.getBoundingClientRect().width);
    expect(Math.round(d)).toBe(Math.min(68, want - (step === 'one' ? 4 : 8)));
    await page.waitForTimeout(300); // the pictures
    await snap(page, info, `group-3-${step}`);
  }
  // Three lines: the numbers when known, the band word in the same place for the NPC.
  await expect(row(page, 2).locator('.wc-gp-num')).toHaveText(['70/160', '70/100', '90/110']);
  await expect(row(page, 4).locator('.wc-gp-bar[data-kind="hp"] .wc-gp-num')).toHaveText('wounded');
  // The NPC tag where two lines or more show, not on one line.
  await expect(row(page, 4).locator('.wc-gp-tag')).toHaveText('HORSE');
  await size(page, 4);
  await expect(pane(page)).toHaveAttribute('data-step', 'one');
  await expect(row(page, 4).locator('.wc-gp-tag')).toHaveCount(0);
  // Crowded: rows of a cell and the more row.
  const many = Array.from({ length: 20 }, (_, i) => ({ id: 10 + i, type: 'ally', name: `Ally${i}`, ...v(100) }));
  await emit(page, 'Group.Set', many);
  await expect(pane(page)).toHaveAttribute('data-step', 'crowded');
  await expect(pane(page).locator('.wc-gp-over')).toHaveText('↓ 17 more members');
  await snap(page, info, 'group-20-crowded');
  expect(errors).toEqual([]);
});

test('a vitals update changes no row height and moves nothing', async ({ page }) => {
  for (const rows of [5, 7, 11]) {
    await group(page, rows);
    await page.waitForTimeout(200);
    const before = await boxes(page);
    await emit(page, 'Group.Update', { id: 2, hp: 20, mana: 3, mp: 110 });
    // A word-only update clears the value (the max stays): the word takes the numbers' place.
    await emit(page, 'Group.Update', { id: 3, 'hp-string': 'hurt', 'mana-string': 'cold' });
    await emit(page, 'Group.Update', { id: 4, 'hp-string': 'awful' });
    await expect(token(page, 3)).toHaveAttribute('data-arc', '');
    await page.waitForTimeout(500); // the fills' transition
    expect(await boxes(page)).toEqual(before);
  }
});

test('a click on a token opens the picker for that member; the choice shows in the row and goes to the map', async ({ page }) => {
  await spyMap(page);
  await group(page, 8);
  // The map on, so the token feed sends.
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  // A player without a shared look: the neutral drawing; the hurt one has an arc, the healthy one none.
  await expect(token(page, 2).locator('.wc-gp-tkd')).toHaveAttribute('data-look', 'drawn:neutral:-');
  await expect(token(page, 2)).toHaveAttribute('data-arc', '');
  await expect(token(page, 3)).not.toHaveAttribute('data-arc', '');
  await expect(token(page, 2)).toHaveAttribute('aria-label', 'Look for Glorfindel');
  // The ring is the member's hue from the GroupTable, muted 25 % toward grey.
  const ring = await token(page, 2).evaluate((e) => (e as HTMLElement).style.getPropertyValue('--c'));
  const hue = await page.evaluate(() => window.__wc!.app.game.groupTable.colorOf(2)!);
  const mute = (x: number) => Math.round(x * 0.75 + 140 * 0.25);
  expect(ring).toBe(`rgb(${mute((hue >> 16) & 255)} ${mute((hue >> 8) & 255)} ${mute(hue & 255)})`);
  // Nothing else in the row is a button.
  await expect(row(page, 2).locator('button')).toHaveCount(1);

  await token(page, 2).click();
  await expect(dlg(page)).toBeVisible();
  await expect(dlg(page)).toContainText('Look for Glorfindel');
  await dlg(page).locator('[role="tab"][data-tab="lib"]').click();
  await dlg(page).locator('.wc-looks-search').fill('elf f noldor');
  await dlg(page).locator('.wc-looks-it[data-id="elf-f-noldor"]').click();
  // Live in the row while the picker is open.
  await expect(token(page, 2).locator('.wc-gp-tkd')).toHaveAttribute('data-look', 'lib:elf-f-noldor');
  await dlg(page).locator('[data-btn="USE"]').click();
  await expect(dlg(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  await expect(token(page, 2).locator('img')).toHaveAttribute('src', /\/tokens\/t\/elf-f-noldor\.webp$/);
  expect(await page.evaluate(() => window.__wc!.app.looks!.stored('glorfindel'))).toEqual({ src: 'lib', id: 'elf-f-noldor' });
  // The map worker is told the member's new look.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const sent = (window as unknown as { __tokensSent: { members: { id: number; look: unknown }[] }[] }).__tokensSent;
        return sent.at(-1)?.members.find((m) => m.id === 2)?.look ?? null;
      }),
    )
    .toEqual({ k: 'lib', id: 'elf-f-noldor' });
  // A member who is not you: the choice is not your own look.
  expect(await page.evaluate(() => window.__wc!.app.looks!.get().names['glorfindel']?.own)).toBeUndefined();
});

test('"a trained horse" gets the horse; the keyboard opens the picker; Esc gives the input its focus', async ({ page }) => {
  await group(page, 8);
  await expect(token(page, 4).locator('.wc-gp-tkd')).toHaveAttribute('data-look', 'lib:mount-trained-horse');
  await expect(token(page, 4).locator('img')).toHaveAttribute('src', /\/tokens\/t\/mount-trained-horse\.webp$/);
  await expect(token(page, 4)).toHaveAttribute('data-arc', '');
  await token(page, 4).focus();
  await page.keyboard.press('Enter');
  await expect(dlg(page)).toBeVisible();
  await expect(dlg(page)).toContainText('a trained horse');
  await page.keyboard.press('Escape');
  await expect(dlg(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
});

test('the Tokens switch: marker icons, the rows still scale', async ({ page }, info) => {
  await group(page, 10);
  await expect(pane(page)).toHaveAttribute('data-step', 'three');
  await expect(pane(page).locator('.wc-gp-tk')).toHaveCount(3);
  await page.locator('.wc-pane-group').hover();
  await page.locator('.wc-pane-group > .wc-pane-btn-gear').click();
  await page.locator('.wc-sp-gear-group [aria-label="Tokens"]').click();
  expect(await page.evaluate(() => window.__wc!.settings.get().group.tokens)).toBe(false);
  await page.keyboard.press('Escape');
  await expect(pane(page).locator('.wc-gp-tk')).toHaveCount(0);
  await expect(pane(page).locator('.wc-gp-l1 > .wc-gp-mk')).toHaveCount(3);
  await expect(pane(page)).toHaveAttribute('data-step', 'three');
  await expect(pane(page).locator('.wc-gp-m3')).toHaveCount(3);
  await snap(page, info, 'group-3-three-off');
  await size(page, 4);
  await expect(pane(page)).toHaveAttribute('data-step', 'one');
  await expect(pane(page).locator('.wc-gp-m1 > .wc-gp-mk:not(.has-tk)')).toHaveCount(3);
  await snap(page, info, 'group-3-one-off');
  await page.evaluate(() => window.__wc!.settings.reset());
});
