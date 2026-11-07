// Stage 19 owner feedback round 1 (ADR 0075 §3.2): on a phone nothing in a
// chrome frame is out of reach, key-only actions have a tap path, and the
// command line is a one-row <textarea> (no autofill bar on Android).
import { type Locator, type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const WONT = 252;
const GMCP = 201;
const ECHO = 1;

const bytes = (codes: number[], text = '') => Buffer.concat([Buffer.from(codes), Buffer.from(text, 'latin1')]);
const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
/** The page's own buttons, in its foot (stage 44a). */
const FOOT_BUTTONS = ['NEW', 'IMPORT', 'MANUAL'];
/** The script's buttons, in its panel (two by two on a phone). */
const PANEL_BUTTONS = ['EDIT', 'EXPORT', 'RENAME', 'DELETE'];

async function tapRow(page: Page, key: string): Promise<void> {
  await startFrame(page).locator(`.wc-sm-item[data-key="${key}"]`).tap();
}

/** Start page → Scripts by a tap, with one own script `phonetest`: the index alone (stage 44a). */
async function openScripts(page: Page): Promise<Locator> {
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async () => {
    const l = window.__wc!.shell.scripts!;
    await l.init();
    if (!l.list().some((s) => s.name === 'phonetest')) await l.create('phonetest');
  });
  await tapRow(page, 'scripts');
  const f = startFrame(page);
  await expect(f.locator('.wc-scr')).toHaveAttribute('data-w', 'narrow');
  await expect(f.locator('.wc-lk-hood-t')).toHaveText('Scripts');
  return f;
}

/** The box lies inside the viewport. */
async function inView(page: Page, l: Locator): Promise<void> {
  const b = (await l.boundingBox())!;
  const w = page.viewportSize()!.width;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(w + 0.5);
}

/** At least 40 px high: a touch target. */
async function tappable(l: Locator): Promise<void> {
  expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(40);
}

for (const width of [412, 360]) {
  test.describe(`${width} wide`, () => {
    test.use({ viewport: { width, height: 800 } });

    test('Scripts: every button in reach and big enough to tap', async ({ page }) => {
      const f = await openScripts(page);
      for (const b of FOOT_BUTTONS) {
        await inView(page, f.locator(`.wc-scr-foot [data-btn="${b}"]`));
        await tappable(f.locator(`.wc-scr-foot [data-btn="${b}"]`));
      }
      const row = f.locator('.wc-scr-row[data-name="phonetest"]');
      await inView(page, row.locator('.wc-scr-tog [role="switch"]'));
      await inView(page, row.locator('.wc-scr-name'));
      await tappable(row);
      // A tap on the row: its panel, the script's buttons two by two, All scripts back.
      await row.tap();
      await expect(f.locator('.wc-scr-panel .wc-scr-title')).toHaveText('phonetest');
      for (const b of [...PANEL_BUTTONS, 'LIST']) {
        await inView(page, f.locator(`.wc-scr-panel [data-btn="${b}"]`));
        await tappable(f.locator(`.wc-scr-panel [data-btn="${b}"]`));
      }
      await f.locator('[data-btn="LIST"]').tap();
      await expect(f.locator('.wc-scr-idx')).toBeVisible();
      // Manual works by tap.
      await f.locator('[data-btn="MANUAL"]').tap();
      await expect(page.locator('.wc-frame:not([hidden])').last()).toContainText('Script Manual');
    });
  });
}

test('Scripts: a tap on the switch toggles, a tap on a row opens its panel, its settings change by tap', async ({ page }) => {
  const f = await openScripts(page);
  const row = f.locator('.wc-scr-row[data-name="phonetest"]');
  const enabled = () =>
    page.evaluate(() => window.__wc!.shell.scripts!.list().find((s) => s.name === 'phonetest')!.enabled);
  expect(await enabled()).toBe(false);
  await row.locator('.wc-scr-tog [role="switch"]').tap();
  await expect.poll(enabled).toBe(true);
  await row.locator('.wc-scr-tog [role="switch"]').tap();
  await expect.poll(enabled).toBe(false);
  // The switch keeps the index; the editor stays closed.
  await expect(f.locator('.wc-scr-panel')).toBeHidden();
  await expect(page.locator('.wc-sed')).toHaveCount(0);
  // A tap on mercenaries: its panel with its settings (owner default 2, round 7).
  await f.locator('.wc-scr-row[data-name="mercenaries"]').tap();
  const cost = f.locator('.wc-scr-set[data-set="cost"]');
  await cost.locator('[role="radio"]', { hasText: '20' }).tap();
  const settings = () => page.evaluate(() => window.__wc!.shell.scripts!.settingsOf('mercenaries'));
  await expect.poll(settings).toMatchObject({ cost: 20 });
  await f.locator('.wc-scr-set[data-set="minutes"] [aria-label="More"]').tap();
  await expect.poll(settings).toMatchObject({ minutes: 30 });
  await tappable(f.locator('.wc-scr-set[data-set="minutes"] [aria-label="More"]'));
  // No soft keyboard by mistake: the taps never focused a text field.
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
});

test('Scripts on a phone: the index alone, a tap opens the panel, Edit opens the selected script', async ({ page }) => {
  const f = await openScripts(page);
  // No room for the panel beside the index: one step at a time.
  await expect(f.locator('.wc-scr-panel')).toBeHidden();
  const row = f.locator('.wc-scr-row[data-name="phonetest"]');
  await row.locator('.wc-scr-name').tap();
  await expect(row).toHaveClass(/is-on/);
  await expect(f.locator('.wc-scr-idx')).toBeHidden();
  await f.locator('.wc-scr-panel [data-btn="EDIT"]').tap();
  await expect(page.locator('.wc-frame:not([hidden]) .wc-sed')).toHaveAttribute('data-script', 'phonetest');
});

test('Profile: a tap highlights a profile and shows its buttons; they fit and are big enough to tap', async ({ page }) => {
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.create('phoneprof', '');
  });
  await tapRow(page, 'profile');
  const f = startFrame(page);
  await expect(f.locator('.wc-lk-hood-t')).toHaveText('Profiles');
  const row = f.locator('.wc-pl-row[data-name="phoneprof"]');
  const profile = () => page.evaluate(() => window.__wc!.settings.get().profile);
  await expect(row.locator('.wc-lk-btn')).toHaveCount(0);
  // The first tap only highlights.
  await row.tap();
  await expect(row).toHaveClass(/is-on/);
  expect(await profile()).toBe('default');
  const btns = row.locator('.wc-lk-btn');
  await expect(btns).toHaveText([/Select/, /Edit/, /Rename/, /Delete/]);
  await expect(f.locator('.wc-pl-acts')).toHaveCount(1);
  // All four inside the row, on one line, at least 40 px high.
  const rb = (await row.boundingBox())!;
  const boxes = await btns.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  for (const b of boxes) {
    expect(b.height).toBeGreaterThanOrEqual(40);
    expect(b.left).toBeGreaterThanOrEqual(rb.x);
    expect(b.right).toBeLessThanOrEqual(rb.x + rb.width);
    expect(b.top).toBe(boxes[0]!.top);
  }
  // Select, then Rename: the old-look prompt; Esc back with the row still highlighted.
  await row.locator('[data-btn="SELECT"]').tap();
  await expect.poll(profile).toBe('phoneprof');
  await expect(btns).toHaveText([/Edit/, /Rename/, /Delete/]);
  await row.locator('[data-btn="RENAME"]').tap();
  await expect(f.locator('.wc-title-row')).toContainText('Rename Profile');
  await page.keyboard.press('Escape');
  await expect(f.locator('.wc-lk-hood-t')).toHaveText('Profiles');
  await expect(row).toHaveClass(/is-on/);
});

test('Profile: a tap on the highlighted profile selects it, a tap on the selected profile opens the editor', async ({ page }) => {
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.create('phoneprof', '');
  });
  await tapRow(page, 'profile');
  const f = startFrame(page);
  await expect(f.locator('.wc-lk-hood-t')).toHaveText('Profiles');
  const row = f.locator('.wc-pl-row[data-name="phoneprof"]');
  const profile = () => page.evaluate(() => window.__wc!.settings.get().profile);
  // The first tap highlights, the second selects, the third edits (on the name: the buttons fill the row's lower half).
  const name = row.locator('.wc-pl-n');
  await name.tap();
  await expect(row).toHaveClass(/is-on/);
  expect(await profile()).toBe('default');
  await name.tap();
  await expect.poll(profile).toBe('phoneprof');
  await expect(f.locator('.wc-lk-hood-t')).toHaveText('Profiles');
  await expect(page.locator('.wc-pe')).toHaveCount(0);
  await name.tap();
  // The editor opens in the large box (ADR 0128), one column on the phone.
  const pe = page.locator('.wc-frame:not([hidden]) .wc-pe');
  await expect(pe.locator('.wc-pe-name')).toHaveText(/^phoneprof/);
  await expect(pe).toHaveAttribute('data-layout', 'narrow');
});

test('the command line is a textarea: Enter sends, no newline; the password prompt is masked', async ({ page }) => {
  const received: Buffer[] = [];
  let server: { send(b: Buffer): void } | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => received.push(typeof m === 'string' ? Buffer.from(m) : m));
    ws.send(bytes([IAC, WILL, GMCP], '\r\nBy what name do you wish to be known? '));
  });
  const sentText = () => Buffer.concat(received).toString('latin1');
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await tapRow(page, 'enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);

  const field = page.locator('.wc-input-field');
  await expect(field).toHaveCount(1);
  expect(await field.evaluate((e) => e.tagName)).toBe('TEXTAREA');
  await expect(field).toHaveAttribute('enterkeyhint', 'send');
  await expect(field).toHaveAttribute('autocomplete', 'off');
  await expect(field).toHaveAttribute('autocorrect', 'off');
  await expect(field).toHaveAttribute('autocapitalize', 'off');
  await expect(field).toHaveAttribute('spellcheck', 'false');
  await field.tap();
  await page.keyboard.type('Tester');
  await page.keyboard.press('Enter');
  await expect.poll(sentText).toContain('Tester\r\n');
  expect(await field.inputValue()).not.toContain('\n');
  // A multi-line paste becomes one line, as on desktop.
  await field.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'say one\r\ntwo\n');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(field).toHaveValue(/say one two$/);

  // The password prompt: an <input type=password>, masked, sent on Enter.
  server!.send(bytes([IAC, WILL, ECHO], 'Password: '));
  await expect(field).toHaveClass(/wc-masked/);
  expect(await field.evaluate((e) => `${e.tagName}:${(e as HTMLInputElement).type}`)).toBe('INPUT:password');
  await expect(field).toBeFocused();
  await page.keyboard.type('hunter2');
  await expect(page.locator('.wc-input-mask')).toHaveText('•••••••');
  await page.keyboard.press('Enter');
  await expect.poll(sentText).toContain('hunter2\r\n');
  await expect(page.locator('.wc-output')).not.toContainText('hunter2');
  // Echo back on: the textarea returns, empty.
  server!.send(bytes([IAC, WONT, ECHO], '\r\nWelcome.\r\n'));
  await expect(field).not.toHaveClass(/wc-masked/);
  expect(await field.evaluate((e) => e.tagName)).toBe('TEXTAREA');
  await expect(field).toHaveValue('');
});

test('the Scripts name dialog: its field has the focus; Enter confirms', async ({ page }) => {
  const f = await openScripts(page);
  await f.locator('[data-btn="NEW"]').tap();
  const field = page.locator('.wc-lk-dialog[data-dlg="new"] input');
  await expect(field).toBeFocused();
  await page.keyboard.type('phonenew');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-frame:not([hidden]) .wc-sed')).toHaveAttribute('data-script', 'phonenew');
});

for (const [width, dpr] of [
  [412, 3.5],
  [384, 2.625],
  [360, 3],
] as const) {
  test.describe(`banner at ${width} wide, DPR ${dpr}`, () => {
    test.use({ viewport: { width, height: 900 }, deviceScaleFactor: dpr });

    test('is whole and centred, or not shown', async ({ page }) => {
      await page.goto('/?phone=1');
      await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
      const spans = page.locator('.wc-banner .wc-banner-word, .wc-banner .wc-banner-word-dim');
      if ((await spans.count()) === 0) return;
      let left = Infinity;
      let right = 0;
      for (const s of await spans.all()) {
        const b = (await s.boundingBox())!;
        left = Math.min(left, b.x);
        right = Math.max(right, b.x + b.width);
      }
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(width + 0.5);
      // The wordmark sits in the middle (within a cell or so).
      expect(Math.abs(left - (width - right))).toBeLessThan(16);
    });
  });
}
