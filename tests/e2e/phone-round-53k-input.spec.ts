// Stage 53, round 53k, the input findings of the review of 53j:
//
// 1. A long password: the bullets stay in the command field (they slid out
//    over the menu key and off the screen's edge with the field's scroll).
// 2. Comm's open search and its query are there again when Comm comes back
//    from the hot key box's temporary hiding.
// 5. The kept line does not survive a disconnect: Enter at the next login
//    prompt sends nothing of the last session.
//
// (3 and 4, the kept line with a hardware keyboard and the history's Down,
// are unit tested: tests/unit/input-pane-own-keyboard.test.ts.)
//
// `phone` project. The sessions play against a `page.routeWebSocket` mock;
// nothing reaches MUME. The harness is round 53j's (phone-round-53j.spec.ts).
import { type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const pad = (page: Page) => page.locator('.wc-ph-pad');
const okb = (page: Page) => page.locator('.wc-ph-okb');
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const rb = (page: Page) => page.locator('.wc-ph-rb');
const command = (page: Page) => rb(page).locator('#wc-ph-rb-command');
const key = (page: Page, k: string) => okb(page).locator([...k].length === 1 ? `.wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-ph-okb-k[data-act="${k}"]`);
const hk = (page: Page, n: number) => page.locator(`.wc-ph-hk[data-hk="${n - 1}"]`);
const layout = (page: Page) => page.evaluate(() => window.__wc!.app.cockpit.phoneGameLayout!);
const comm = (page: Page) => page.locator('.wc-cockpit > .wc-pane[data-pane="comm"]');
const sat = (page: Page, name: 'panes' | 'comm') => page.locator(`.wc-ph-sat[data-sat="${name}"]:visible`);
const NONE = { strip: false, comm: false };

const S21 = { width: 360, height: 800 };

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function type(page: Page, ...keys: string[]): Promise<void> {
  for (const k of keys) await key(page, k).tap();
}

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function setScreen(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await expect.poll(async () => (await box(page.locator('#app'))).height).toBe(size.height);
  await expect.poll(async () => (await layout(page)).landscape).toBe(size.width > size.height);
  await frames(page);
}

/** A hold on `l` through CDP (a real touch): the finger stays down until the box is open, then lifts. */
async function hold(page: Page, l: Locator): Promise<void> {
  const b = await box(l);
  const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 0 };
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await expect(rb(page)).toBeVisible();
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }
}

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;
const ECHO = 1;
const gmcp = (pkg: string, data: unknown): Buffer => Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(`${pkg} ${JSON.stringify(data)}`, 'utf8'), Buffer.from([IAC, SE])]);

interface Mock {
  sent: string[];
  server: () => WebSocketRoute;
}

/** Enters MUME on `?phone=1` against a mock and logs in. */
async function play(page: Page, query = '&kbd=en'): Promise<Mock> {
  let server: WebSocketRoute | null = null;
  const sent: string[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => {
      const t = (typeof m === 'string' ? Buffer.from(m) : m).toString('latin1');
      if (!t.startsWith('\xff')) sent.push(...t.split(/\r?\n/).filter((l) => l !== '' && !l.startsWith('change width')));
    });
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  await page.goto(`/?phone=1${query}`);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(pad(page)).toBeVisible();
  server!.send(gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Mock' }));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
  return { sent, server: () => server! };
}

const kept = (page: Page) => page.evaluate(() => window.__wc!.app.input.isKept());
const inside = (a: Box, b: Box, slack = 0.5): boolean => a.x >= b.x - slack && a.y >= b.y - slack && a.x + a.width <= b.x + b.width + slack && a.y + a.height <= b.y + b.height + slack;
const apart = (a: Box, b: Box): boolean => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

// ------------------------------------------------------- 1. a long password

test('a 30 character password at 360x800: the bullets stay in the field, the last ones at the caret, none over the menu key', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await play(page);
  await setScreen(page, S21);
  m.server().send(Buffer.concat([Buffer.from('Password: '), Buffer.from([IAC, WILL, ECHO])]));
  await expect(field(page)).toHaveClass(/\bwc-masked\b/);
  await field(page).tap();
  await expect(okb(page)).toBeVisible();
  const mask = page.locator('.wc-input-slot .wc-input-mask');
  const menu = page.locator('.wc-input-slot .wc-ph-menu');
  await expect(menu).toBeVisible();
  const pw = 'abcdefghijklmnopqrstuvwxyzabcd';
  for (const [n, ch] of [...pw].entries()) {
    await key(page, ch).tap();
    // At every length from the one that fills the field: what is painted of the bullets is in it.
    if (n < 12 && n !== 2) continue;
    await expect(mask).toHaveText('•'.repeat(n + 1));
    await frames(page);
    const f = await box(field(page));
    const mk = await box(mask);
    expect(inside(mk, f), `the mask in the field at ${n + 1} characters: ${JSON.stringify([mk, f])}`).toBe(true);
    expect(apart(mk, await box(menu))).toBe(true);
    expect(await mask.evaluate((el) => getComputedStyle(el).overflowX)).toBe('hidden');
  }
  await expect(field(page)).toHaveValue(pw);
  // The line is longer than the field: scrolled, the first bullets are out of the mask's box (it
  // clips them), the last one is in it, and the caret stands after it.
  const scroll = await field(page).evaluate((el: HTMLTextAreaElement) => el.scrollLeft);
  expect(scroll).toBeGreaterThan(0);
  const f = await box(field(page));
  const glyph = (at: number) =>
    mask.evaluate((el, at) => {
      const r = document.createRange();
      r.setStart(el.firstChild!, at);
      r.setEnd(el.firstChild!, at + 1);
      const b = r.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    }, at);
  const first = await glyph(0);
  const last = await glyph(pw.length - 1);
  expect(first.x + first.width).toBeLessThanOrEqual(f.x + 0.5);
  expect(last.x).toBeGreaterThanOrEqual(f.x);
  expect(last.x + last.width).toBeLessThanOrEqual(f.x + f.width + 0.5);
  const caret = await box(page.locator('.wc-input-slot .wc-caret'));
  expect(Math.abs(caret.x - (last.x + last.width))).toBeLessThanOrEqual(0.75);
  // Sent: nothing of it stays in the line, and nothing is kept.
  await type(page, 'enter');
  await expect(field(page)).toHaveValue('');
  await expect(mask).toHaveText('');
  expect(await kept(page)).toBe(false);
  expect(errors).toEqual([]);
});

// ------------------------------------------------------- 2. Comm's search

test('Comm\'s search is open with its query when Comm comes back from the hot key box\'s hiding; the Comm key\'s close ends it', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await play(page);
  await setScreen(page, S21);
  m.server().send(gmcp('Comm.Channel.Text', { channel: 'tells', talker: 'Gibur', 'talker-type': 'player', text: "Gibur tells you 'you at the ford?'" }));
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  const search = comm(page).locator('.wc-cm-sinput');
  const root = comm(page).locator('.wc-comm');
  await comm(page).locator('.wc-cm-sbtn').tap();
  await expect(okb(page)).toBeVisible();
  await expect(search).toBeFocused();
  await type(page, 'f', 'o', 'r', 'd');
  await expect(search).toHaveValue('ford');
  await expect(comm(page).locator('.wc-cm-results')).toContainText('ford');
  await key(page, 'fold').tap();
  await expect(okb(page)).toBeHidden();
  await expect(search).toHaveValue('ford');
  // The box takes Comm out for its room; typed in and saved, Comm is back with the search as it was.
  await hold(page, hk(page, 2));
  await frames(page);
  expect((await layout(page)).hidden.comm).toBe(true);
  await expect(comm(page)).toBeHidden();
  await command(page).tap();
  await expect(okb(page)).toBeVisible();
  await command(page).evaluate((el: HTMLInputElement) => el.setSelectionRange(el.value.length, el.value.length));
  await type(page, ';', 'k');
  await key(page, 'enter').tap();
  await expect(rb(page)).toBeHidden();
  await expect.poll(async () => (await layout(page)).hidden).toEqual(NONE);
  await expect(comm(page)).toBeVisible();
  await expect(search).toHaveValue('ford');
  await expect(root).toHaveAttribute('data-search', '');
  await expect(comm(page).locator('.wc-cm-results')).toContainText('ford');
  // The user's own close (the Comm key) ends the search, as before.
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeHidden();
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  await expect(search).toHaveValue('');
  await expect(root).not.toHaveAttribute('data-search');
  expect(errors).toEqual([]);
});

// ------------------------------------------- 5. the kept line, disconnected

test('the kept line is emptied by a disconnect: Enter at the next login prompt sends nothing of the last session', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await play(page);
  await setScreen(page, S21);
  await field(page).tap();
  await expect(okb(page)).toBeVisible();
  await type(page, 'l', 'o', 'o', 'k', 'enter');
  await expect.poll(() => m.sent).toEqual(['look']);
  await key(page, 'fold').tap();
  await expect(okb(page)).toBeHidden();
  expect(await kept(page)).toBe(true);
  await expect(field(page)).toHaveValue('look');
  // The link drops.
  const first = m.server();
  await first.close();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(field(page)).toHaveValue('');
  expect(await kept(page)).toBe(false);
  await expect(field(page)).not.toHaveClass(/\bwc-input-kept\b/);
  // Connected again, at the login prompt: Enter sends an empty line, not the last command (what
  // is typed next is the first line MUME gets after it).
  await page.locator('.wc-ph-sheet [data-row="reconnect"]').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect.poll(() => m.server() !== first).toBe(true);
  await field(page).tap();
  await expect(okb(page)).toBeVisible();
  await expect(field(page)).toHaveValue('');
  await type(page, 'enter');
  await type(page, 'r', 'a', 's', 't', 'a', 'enter');
  await expect.poll(() => m.sent).toEqual(['look', 'rasta']);
  // The history still has the line of before.
  await type(page, 'older', 'older');
  await expect(field(page)).toHaveValue('look');
  expect(errors).toEqual([]);
});
