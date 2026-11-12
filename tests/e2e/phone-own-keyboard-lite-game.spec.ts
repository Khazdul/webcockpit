// Stage 53g, after the owner's test of 53f on his S21: in the game (entered
// from the start page, connected), the menu → Profile → Lite: the Pattern
// field of every kind that has one, and the Commands body, get our keyboard
// on a tap, on a tap again after the fold key, and when going between the
// two fields; portrait and landscape; with the default gate (no `?kbd=`).
//
// `phone` project. The game plays against a `page.routeWebSocket` mock;
// nothing reaches MUME.
import { type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const S21 = { width: 360, height: 800 };
const S21_LAND = { width: 800, height: 360 };

const html = (page: Page) => page.locator('html');
const host = (page: Page) => page.locator('.wc-okb-page');
const okb = (page: Page) => host(page).locator('.wc-ph-okb');
const key = (page: Page, k: string) => okb(page).locator([...k].length === 1 ? `.wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-ph-okb-k[data-act="${k}"]`);
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;
const gmcp = (pkg: string, data: unknown): Buffer => Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(`${pkg} ${JSON.stringify(data)}`, 'utf8'), Buffer.from([IAC, SE])]);

const PROFILE = '#alias {k} {kill %1}\n#action {^You are hungry} {eat bread}\n#highlight {orc} {light red}\n#substitute {Gandalf} {Mithrandir}\n';

/** Enters MUME from the start page against a mock and logs in, with `PROFILE` as the profile. */
async function play(page: Page, query = ''): Promise<() => WebSocketRoute> {
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  await page.goto(`/?phone=1${query}`);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async (text) => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', text);
  }, PROFILE);
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  server!.send(gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Mock' }));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
  return () => server!;
}

async function expectUp(page: Page): Promise<void> {
  await expect(okb(page)).toBeVisible();
  await expect(html(page)).toHaveClass(/\bwc-okb-pg\b/);
  await frames(page);
  // The game's own keyboard is not the one.
  await expect(page.locator('.wc-cockpit .wc-ph-okb')).toBeHidden();
}

async function expectDown(page: Page): Promise<void> {
  await expect(host(page)).toBeHidden();
  await expect(html(page)).not.toHaveClass(/\bwc-okb-pg\b/);
}

/** `l` is marked, has the focus, lies above the keyboard and under nothing. */
async function expectTyping(page: Page, l: Locator): Promise<void> {
  await expect(l).toHaveAttribute('inputmode', 'none');
  await expect(l).toBeFocused();
  await expectUp(page);
  await expect
    .poll(() =>
      l.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const k = document.querySelector('.wc-okb-page')!.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 12));
        return r.top >= 0 && r.top + Math.min(r.height, 24) <= k.top + 0.5 && at === el;
      }),
    )
    .toBe(true);
}

/** The menu → Profile: the profile editor's Lite over the game. */
async function openProfile(page: Page): Promise<Locator> {
  await page.locator('.wc-ph-menu').tap();
  await page.locator('.wc-ph-sheet [data-row="profile"]').tap();
  const pe = page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-pe');
  await expect(pe).toHaveAttribute('data-view', 'lite');
  return pe;
}

for (const [name, viewport] of [
  ['portrait 360 × 800', S21],
  ['landscape 800 × 360', S21_LAND],
] as const) {
  test.describe(`in the game, ${name}`, () => {
    test.use({ viewport });

    for (const [kind, first, typed] of [
      ['alias', 'k', 'kx'],
      ['action', '^You are hungry', '^You are hungryx'],
      ['highlight', 'orc', 'orcx'],
      ['substitute', 'Gandalf', 'Gandalfx'],
    ] as const) {
      test(`an existing ${kind}: a tap on its row, then on Pattern, gives our keyboard, and it types`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await play(page);
        const pe = await openProfile(page);
        await pe.locator(`[data-rail="${kind}"]`).tap();
        const row = pe.locator('.wc-pe-row:not(.wc-pe-new)').first();
        await expect(row).toContainText(first);
        await row.tap();
        const pattern = pe.locator('[data-field="pattern"] input');
        await expect(pattern).toBeVisible();
        await expect(pattern).toHaveValue(first);
        // Some time passes before the finger comes back (no pointer is "recent" any more).
        await page.waitForTimeout(900);
        await pattern.tap();
        await expectTyping(page, pattern);
        await key(page, 'x').tap();
        await expect(pattern).toHaveValue(typed);
        // The fold key, and a tap on the field again (it may still be the focused one).
        await key(page, 'fold').tap();
        await expectDown(page);
        await page.waitForTimeout(900);
        await pattern.tap();
        await expectTyping(page, pattern);
        await key(page, 'back').tap();
        await expect(pattern).toHaveValue(first);
        expect(errors).toEqual([]);
      });
    }

    test('game text, prompts and GMCP arriving while Pattern is typed in take neither the focus nor the keyboard', async ({ page }) => {
      const server = await play(page);
      const pe = await openProfile(page);
      await pe.locator('[data-rail="alias"]').tap();
      await pe.locator('.wc-pe-row:not(.wc-pe-new)').first().tap();
      const pattern = pe.locator('[data-field="pattern"] input');
      await page.waitForTimeout(900);
      await pattern.tap();
      await expectTyping(page, pattern);
      for (let i = 0; i < 5; i++) {
        server().send(Buffer.from(`An orc scout arrives from the east. (${i})\r\n\r\n* HP:Fine>`, 'latin1'));
        server().send(Buffer.from([IAC, 249]));
        server().send(gmcp('Char.Vitals', { hp: 100 - i, maxhp: 120 }));
        server().send(gmcp('Comm.Channel.Text', { channel: 'tells', talker: 'Gibur', 'talker-type': 'player', text: `Gibur tells you 'hello ${i}'` }));
        await page.waitForTimeout(120);
      }
      await expectTyping(page, pattern);
      await key(page, 'x').tap();
      await expect(pattern).toHaveValue('kx');
    });

    test('an alias: Commands, then back to Pattern, and again: the keyboard follows each tap; a new alias too', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await play(page);
      const pe = await openProfile(page);
      await pe.locator('[data-rail="alias"]').tap();
      await pe.locator('.wc-pe-row:not(.wc-pe-new)').first().tap();
      const pattern = pe.locator('[data-field="pattern"] input');
      const body = pe.locator('[data-field="body"] textarea');
      await expect(pattern).toBeVisible();
      await page.waitForTimeout(900);
      // (The body may lie under the keyboard once it is up: scrolled to by the tap itself.)
      await body.tap();
      await expectTyping(page, body);
      await key(page, 'z').tap();
      await expect(body).toHaveValue('kill %1z');
      for (let i = 0; i < 2; i++) {
        await pattern.tap();
        await expectTyping(page, pattern);
        await key(page, 'q').tap();
        await body.tap();
        await expectTyping(page, body);
      }
      await expect(pattern).toHaveValue('kqq');
      // The fold key in the body, some time, then Pattern.
      await key(page, 'fold').tap();
      await expectDown(page);
      await page.waitForTimeout(900);
      await pattern.tap();
      await expectTyping(page, pattern);
      // Esc: back to the list (the sheet closes on a narrow page); then a new alias.
      await key(page, 'esc').tap();
      await expectDown(page);
      await pe.locator('[data-row="new"]').tap();
      await expect(pattern).toHaveValue('');
      await page.waitForTimeout(900);
      await pattern.tap();
      await expectTyping(page, pattern);
      await key(page, 'n').tap();
      await expect(pattern).toHaveValue('n');
      expect(errors).toEqual([]);
    });
  });
}

// Round 53i (a test gap of the 53h review): a code editor opened from the game's menu.
test.describe('in the game, a script edited from the menu (360 × 800)', () => {
  test.use({ viewport: S21 });

  test('menu → Scripts → Edit: the page\'s keyboard types in the code, nothing reaches MUME, and the game\'s keyboard works after', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const server = await play(page);
    const got: string[] = [];
    server().onMessage((m) => got.push(typeof m === 'string' ? m : m.toString('latin1')));
    await page.evaluate(async () => {
      const l = window.__wc!.shell.scripts!;
      await l.init();
      await l.create('gameed', '-- @name     gameed\n-- @version  1\n-- @api      1\n');
    });
    // The game's own keyboard is up when the menu is opened: the menu folds it.
    const line = page.locator('.wc-input-slot .wc-input-field');
    await line.tap();
    await expect(page.locator('.wc-cockpit .wc-ph-okb')).toBeVisible();
    const sizes: string[] = [];
    await page.exposeFunction('__size', (v: string) => void sizes.push(v));
    await page.locator('.wc-ph-menu').tap();
    await expect(page.locator('.wc-cockpit .wc-ph-okb')).toBeHidden();
    // (The game's keyboard closing is one window size, told a frame or two later: counted from after it.)
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const s = window.__wc!.app.session;
      const set = s.setWindowSize.bind(s);
      s.setWindowSize = (c: number, r: number) => {
        void (window as unknown as { __size(v: string): void }).__size(`${c}x${r}`);
        set(c, r);
      };
    });
    await page.locator('.wc-ph-sheet [data-row="scripts"]').tap();
    const f = page.locator('.wc-overlay .wc-frame:not([hidden])');
    await f.locator('.wc-scr-row[data-name="gameed"] .wc-scr-name').tap();
    await f.locator('[data-btn="EDIT"]:visible').first().tap();
    const sed = page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-sed');
    await expect(sed).toHaveAttribute('data-script', 'gameed');
    const content = sed.locator('.cm-content');
    await expect(content).toHaveAttribute('inputmode', 'none');
    // Opened: no keyboard yet. A tap in the code brings the page's.
    await expectDown(page);
    const last = await sed.locator('.cm-content .cm-line').last().boundingBox();
    await page.touchscreen.tap(last!.x + last!.width - 4, last!.y + last!.height / 2);
    await expectUp(page);
    await expect(content).toBeFocused();
    for (const k of ['enter', 'l', 'o', 'o', 'k', 'enter']) await key(page, k).tap();
    await expect(sed.locator('.cm-content .cm-line', { hasText: /^look$/ })).toHaveCount(1);
    // Enter in the code is a line break, not a command: nothing went to MUME, the line is empty.
    await page.waitForTimeout(300);
    expect(got.join('')).not.toContain('look');
    await expect(line).toHaveValue('');
    // The caret's line is above the keyboard.
    const k = (await host(page).boundingBox())!;
    const a = (await sed.locator('.cm-activeLine').boundingBox())!;
    expect(a.y + a.height).toBeLessThanOrEqual(k.y + 0.5);
    // Save, then Esc on our keys: back to the list (no changes left), the keyboard gone with the buffer.
    await sed.locator('.wc-sed-tools [data-btn="SAVE"]').tap();
    await expect.poll(() => page.evaluate(() => window.__wc!.shell.scripts!.get('gameed')!.source)).toContain('look');
    await key(page, 'esc').tap();
    await expect(sed).toHaveCount(0);
    await expectDown(page);
    // No window size was sent for the page's keyboard.
    expect(sizes).toEqual([]);
    // Back in the game: its own keyboard opens and sends.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('.wc-overlay .wc-frame:not([hidden])')).toHaveCount(0);
    if (await page.locator('.wc-ph-sheet').isVisible()) await page.keyboard.press('Escape');
    await line.tap();
    const own = page.locator('.wc-cockpit .wc-ph-okb');
    await expect(own).toBeVisible();
    await own.locator('.wc-ph-okb-k[data-ch="l"]').tap();
    await own.locator('.wc-ph-okb-k[data-act="enter"]').tap();
    await expect.poll(() => got.join('')).toContain('l\r\n');
    expect(errors).toEqual([]);
  });
});
