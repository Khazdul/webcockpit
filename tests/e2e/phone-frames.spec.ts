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
const SCRIPT_BUTTONS = ['NEW', 'IMPORT', 'EXPORT', 'RENAME', 'DELETE', 'MANUAL'];

async function tapRow(page: Page, key: string): Promise<void> {
  await startFrame(page).locator(`.wc-mrow[data-key="${key}"]`).tap();
}

/** Start page → Options → Scripts by taps, with one own script `phonetest`. */
async function openScripts(page: Page): Promise<Locator> {
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.evaluate(async () => {
    const l = window.__wc!.shell.scripts!;
    await l.init();
    if (!l.list().some((s) => s.name === 'phonetest')) await l.create('phonetest');
  });
  await tapRow(page, 'options');
  await tapRow(page, 'scripts');
  const f = startFrame(page);
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  return f;
}

/** The box lies inside the viewport. */
async function inView(page: Page, l: Locator): Promise<void> {
  const b = (await l.boundingBox())!;
  const w = page.viewportSize()!.width;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(w + 0.5);
}

for (const width of [412, 360]) {
  test.describe(`${width} wide`, () => {
    test.use({ viewport: { width, height: 800 } });

    test('Scripts: every button and EDIT in reach, the footer whole', async ({ page }) => {
      const f = await openScripts(page);
      for (const b of SCRIPT_BUTTONS) await inView(page, f.locator(`.wc-scr-buttons [data-btn="${b}"]`));
      const row = f.locator('.wc-scr-row[data-script="phonetest"]');
      await inView(page, row.locator('.wc-check'));
      await inView(page, row.locator('[data-btn="EDIT"]'));
      // The footer wraps instead of ending in `…`, and ESC Back is tappable.
      const footer = f.locator('.wc-footer');
      await expect(footer).not.toContainText('…');
      await expect(footer).toContainText('PgUp/PgDn Help');
      await inView(page, footer.locator('.wc-esc-btn', { hasText: 'ESC Back' }));
      for (const l of await footer.locator('.wc-line').all()) await inView(page, l);
      // A button far right on desktop works by tap: MANUAL opens the manual.
      await f.locator('[data-btn="MANUAL"]').tap();
      await expect(page.locator('.wc-frame:not([hidden])').last()).toContainText('Script Manual');
    });
  });
}

test('Scripts: a tap on [ ] toggles, a tap on the selected name opens the editor', async ({ page }) => {
  const f = await openScripts(page);
  const row = f.locator('.wc-scr-row[data-script="phonetest"]');
  const enabled = () =>
    page.evaluate(() => window.__wc!.shell.scripts!.list().find((s) => s.name === 'phonetest')!.enabled);
  expect(await enabled()).toBe(false);
  await row.locator('.wc-check').tap();
  await expect.poll(enabled).toBe(true);
  await row.locator('.wc-check').tap();
  await expect.poll(enabled).toBe(false);
  // First tap selects (the editor stays closed), the second opens it.
  await row.locator('.wc-scr-name').tap();
  await expect(row.locator('.wc-scr-name')).toHaveClass(/is-cur/);
  await expect(page.locator('.wc-sed')).toHaveCount(0);
  await row.locator('.wc-scr-name').tap();
  await expect(page.locator('.wc-frame:not([hidden]) > .wc-sed')).toHaveAttribute('data-script', 'phonetest');
  // Ctrl+S has a tap path on touch.
  await expect(page.locator('.wc-sed .wc-act-btn[data-act="Ctrl+S Save"]')).toBeVisible();
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
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
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

test('a name prompt in a menu is a one-row textarea; Enter confirms', async ({ page }) => {
  const f = await openScripts(page);
  await f.locator('[data-btn="NEW"]').tap();
  const field = startFrame(page).locator('.wc-field');
  expect(await field.evaluate((e) => e.tagName)).toBe('TEXTAREA');
  await expect(field).toBeFocused();
  await page.keyboard.type('phonenew');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-frame:not([hidden]) > .wc-sed')).toHaveAttribute('data-script', 'phonenew');
});

test('Statistics stack their sides; History swipes sideways to every column', async ({ page }) => {
  await page.goto('/?phone=1');
  await page.waitForFunction(() => window.__wc !== undefined);
  await page.evaluate(async () => {
    const lib = await window.__wc!.runs();
    await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  await tapRow(page, 'history');
  const f = startFrame(page);
  await expect(f.locator('.wc-title-row')).toHaveText('─── History ───');
  // The last column is wider than the screen; the body scrolls to it.
  const body = f.locator('.wc-body');
  const [sw, cw] = await body.evaluate((b) => [b.scrollWidth, b.clientWidth]);
  expect(sw).toBeGreaterThan(cw);
  await body.evaluate((b) => (b.scrollLeft = b.scrollWidth));
  await inView(page, f.locator('.wc-th', { hasText: 'Rating' }));
  await body.evaluate((b) => (b.scrollLeft = 0));
  await f.locator('[data-btn="STATS"]').tap();
  const stats = f.locator('.wc-stats');
  await expect(stats).toContainText('KILLS');
  // KILLS and PvPs one above the other, each inside the screen.
  const kills = (await stats.locator('[data-sort="name"]').first().boundingBox())!;
  const pvps = (await stats.locator('[data-sort="name"]').nth(1).boundingBox())!;
  expect(pvps.y).toBeGreaterThan(kills.y);
  await inView(page, stats.locator('[data-sort="xpTotal"]'));
  await expect(stats.locator('.wc-footer')).not.toContainText('…');
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
      await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
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
