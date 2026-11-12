// Stage 53, round 53j (the owner's four points from his S21 after 53i; ADR
// 0137's addendum of that round, ADR 0138's and 0139's):
//
// 1. A field of the hot key box typed in with panes open at the top
//    (portrait): the box stays, our keyboard opens, and Comm and the strip's
//    pane are out of the layout meanwhile, in one layout (one window size);
//    they come back, as they were, when the box closes or the keyboard folds.
// 2. The sent line stays to be sent again, without a native selection once
//    the keyboard has folded (a tapped field that holds a range brings
//    Android's selection pop-up, which emulation cannot show: the selection
//    state and the behaviours are asserted).
// 3. The fields' text is 16 px at every font size setting.
// 4. No pane has a hood on a row of its own: the names are on the bands
//    (phone-game-panes, phone-game-landscape, phone-game-small and
//    phone-own-keyboard-fields have the layout; here the plate follows the
//    strip's page, the band is dragged from its plate, and the contrast).
//
// `phone` project. The sessions play against a `page.routeWebSocket` mock;
// nothing reaches MUME.
import { type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const pad = (page: Page) => page.locator('.wc-ph-pad');
const okb = (page: Page) => page.locator('.wc-ph-okb');
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const rb = (page: Page) => page.locator('.wc-ph-rb');
const command = (page: Page) => rb(page).locator('#wc-ph-rb-command');
const label = (page: Page) => rb(page).locator('#wc-ph-rb-label');
const key = (page: Page, k: string) => okb(page).locator([...k].length === 1 ? `.wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-ph-okb-k[data-act="${k}"]`);
const hk = (page: Page, n: number) => page.locator(`.wc-ph-hk[data-hk="${n - 1}"]`);
const layout = (page: Page) => page.evaluate(() => window.__wc!.app.cockpit.phoneGameLayout!);
const comm = (page: Page) => page.locator('.wc-cockpit > .wc-pane[data-pane="comm"]');
const reply = (page: Page) => comm(page).locator('.wc-cm-rinput');
const stripPane = (page: Page) => page.locator('.wc-cockpit > .wc-pane[data-phone-strip]');
const sat = (page: Page, name: 'panes' | 'comm') => page.locator(`.wc-ph-sat[data-sat="${name}"]:visible`);
const NONE = { strip: false, comm: false };

const S21 = { width: 360, height: 800 };
const S21_LAND = { width: 800, height: 360 };

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

/** Every window size told to the session (what becomes NAWS) from now on. */
async function watchSizes(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const s = window.__wc!.app.session;
    const log: string[] = ((window as unknown as { __sizes: string[] }).__sizes = []);
    const set = s.setWindowSize.bind(s);
    s.setWindowSize = (cols: number, rows: number) => {
      log.push(`${cols}x${rows}`);
      set(cols, rows);
    };
  });
  return () => page.evaluate(() => (window as unknown as { __sizes: string[] }).__sizes.slice());
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
const WONT = 252;
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

/** The strip on its second page (Group) and Comm on Gibur's chat, both open. */
async function openBoth(page: Page, m: Mock): Promise<void> {
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  await page.keyboard.press('Control+2');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'group');
  m.server().send(gmcp('Comm.Channel.Text', { channel: 'tells', talker: 'Gibur', 'talker-type': 'player', text: "Gibur tells you 'you at the ford?'" }));
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  await comm(page).locator('.wc-cm-ent[aria-label^="Gibur"]').tap();
  await expect(reply(page)).toBeVisible();
  await frames(page);
}

// ------------------------------------------------- 1. the hot key box's fields

test('portrait, the strip and Comm open: Custom in the hot key box opens our keyboard, the box stays, and the panes are out of the layout meanwhile; one window size each way', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await play(page);
  await setScreen(page, S21);
  await openBoth(page, m);
  const was = await layout(page);
  expect(was.strip.h).toBeGreaterThan(0);
  expect(was.comm.h).toBeGreaterThan(0);
  // A hold: the box opens (Comm, the first to go, is out for it).
  await hold(page, hk(page, 2));
  await expect(rb(page)).toBeVisible();
  await frames(page);
  expect((await layout(page)).hidden.comm).toBe(true);
  // Custom: the keyboard opens for the Command field, the box stays, and both panes are out, in
  // the one layout that opens the keyboard.
  const sizes = await watchSizes(page);
  await rb(page).locator('.wc-ph-chip[data-pick="custom"]').tap();
  await expect(okb(page)).toBeVisible();
  await expect(command(page)).toBeFocused();
  await frames(page);
  await frames(page);
  await expect(rb(page)).toBeVisible();
  let g = await layout(page);
  expect(g.bottom).toBeGreaterThan(0);
  expect(g.hidden).toEqual({ strip: true, comm: true });
  expect([g.strip.h, g.comm.h]).toEqual([0, 0]);
  expect(await sizes()).toHaveLength(1);
  await expect(stripPane(page)).toHaveCount(0);
  await expect(comm(page)).toBeHidden();
  // The box is whole on screen above the keys, and its field takes what is typed.
  const b = await box(rb(page));
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height).toBeLessThanOrEqual((await box(okb(page))).y + 0.5);
  await command(page).evaluate((el: HTMLInputElement) => el.setSelectionRange(el.value.length, el.value.length));
  await type(page, ';', 'k', 'i', 'c', 'k');
  await expect(command(page)).toHaveValue('bash;kick');
  // The Label field too: the keyboard stays, nothing is laid out again.
  await label(page).tap();
  await expect(label(page)).toBeFocused();
  await frames(page);
  expect(await sizes()).toHaveLength(1);
  // The keyboard folds: the box stays, and what it leaves room for is back (the strip here).
  await key(page, 'fold').tap();
  await expect(okb(page)).toBeHidden();
  await frames(page);
  await frames(page);
  await expect(rb(page)).toBeVisible();
  g = await layout(page);
  expect(g.bottom).toBe(0);
  expect(g.hidden).toEqual({ strip: false, comm: true });
  expect(g.strip).toEqual(was.strip);
  expect(await sizes()).toHaveLength(2);
  // Cancel: everything as it was before the box, the strip on its page and Comm on its chat.
  await rb(page).locator('.wc-ph-bt', { hasText: 'Cancel' }).tap();
  await expect(rb(page)).toBeHidden();
  await expect.poll(async () => (await layout(page)).hidden).toEqual(NONE);
  g = await layout(page);
  expect([g.strip, g.comm, g.game]).toEqual([was.strip, was.comm, was.game]);
  expect(await sizes()).toHaveLength(3);
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'group');
  await expect(page.locator('.wc-ph-strip-band .wc-ph-plate')).toHaveText('Group');
  await expect(comm(page)).toBeVisible();
  await expect(reply(page)).toBeVisible();
  await expect(comm(page).locator('.wc-cm-ent[aria-label^="Gibur"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(sat(page, 'panes')).toHaveAttribute('aria-pressed', 'true');
  await expect(sat(page, 'comm')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('portrait: Enter in the box saves; the box, the keyboard and the hiding end in one layout; what came to Comm meanwhile is unread', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await play(page);
  await setScreen(page, S21);
  await openBoth(page, m);
  const was = await layout(page);
  await hold(page, hk(page, 2));
  await command(page).tap();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  await frames(page);
  await expect(rb(page)).toBeVisible();
  expect((await layout(page)).hidden).toEqual({ strip: true, comm: true });
  // A tell while Comm is out: it is counted, as for a closed Comm (nothing is read behind the box).
  m.server().send(gmcp('Comm.Channel.Text', { channel: 'tells', talker: 'Dori', 'talker-type': 'player', text: "Dori tells you 'wait for me'" }));
  await expect.poll(() => page.evaluate(() => (window.__wc!.app.cockpit.pane('comm') as unknown as { unreadCounts(): { private: number } }).unreadCounts().private)).toBeGreaterThanOrEqual(1);
  await command(page).evaluate((el: HTMLInputElement) => el.setSelectionRange(el.value.length, el.value.length));
  await type(page, ';', 'k');
  const sizes = await watchSizes(page);
  await key(page, 'enter').tap();
  await expect(rb(page)).toBeHidden();
  await expect(okb(page)).toBeHidden();
  await expect.poll(async () => (await layout(page)).hidden).toEqual(NONE);
  await frames(page);
  expect(await sizes()).toHaveLength(1);
  const g = await layout(page);
  expect([g.strip, g.comm, g.game, g.bottom]).toEqual([was.strip, was.comm, was.game, 0]);
  expect((await page.evaluate(() => window.__wc!.settings.get().phone.hotkeys))[1]!.command).toBe('bash;k');
  // Comm is back on Gibur's chat, and Dori's tell waits unread on the rail.
  await expect(reply(page)).toBeVisible();
  await expect(comm(page).locator('.wc-cm-ent[aria-label^="Dori"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('portrait in a fight: the fight card and the game text stay while the box is typed in', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await play(page);
  await setScreen(page, S21);
  await openBoth(page, m);
  m.server().send(gmcp('Char.Vitals', { hp: 150, maxhp: 172, opponent: 'an orc scout', buffer: 'Rasta', 'opponent-hits': 'hurt' }));
  await expect(page.locator('.wc-ph-fight')).toBeVisible();
  await frames(page);
  await hold(page, hk(page, 2));
  await command(page).tap();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  await frames(page);
  await expect(rb(page)).toBeVisible();
  const g = await layout(page);
  expect(g.hidden).toEqual({ strip: true, comm: true });
  expect(g.fight.h).toBe(2);
  expect(g.game.h).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.wc-ph-fight')).toBeVisible();
  // The box ends under the card.
  const card = await box(page.locator('.wc-ph-fight'));
  expect((await box(rb(page))).y).toBeGreaterThanOrEqual(card.y + card.height - 0.5);
  expect(errors).toEqual([]);
});

test('landscape: the box stands right of the column, so nothing is taken out for it; Custom opens our keyboard and the box stays', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await play(page);
  await setScreen(page, S21_LAND);
  await openBoth(page, m);
  const was = await layout(page);
  expect(was.side.w).toBeGreaterThan(0);
  await hold(page, hk(page, 2));
  await expect(rb(page)).toBeVisible();
  expect((await layout(page)).hidden).toEqual(NONE);
  await rb(page).locator('.wc-ph-chip[data-pick="custom"]').tap();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  await frames(page);
  await expect(rb(page)).toBeVisible();
  const g = await layout(page);
  expect(g.hidden).toEqual(NONE);
  expect(g.side.w).toBe(was.side.w);
  expect((await box(rb(page))).x).toBeGreaterThanOrEqual(g.side.w * (await page.evaluate(() => window.__wc!.cells.get().w)) - 0.5);
  await type(page, 'x');
  await expect(command(page)).toHaveValue(/x/);
  expect(errors).toEqual([]);
});

// ------------------------------------------------------- 2. the sent line

const selection = (page: Page) => field(page).evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]);
const kept = (page: Page) => page.evaluate(() => window.__wc!.app.input.isKept());

test('the sent line stays, selected while the keyboard is up; folded it is kept with no selection, and a tap opens the keyboard on it without one', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await play(page);
  await setScreen(page, S21);
  await field(page).tap();
  await expect(okb(page)).toBeVisible();
  await type(page, 'l', 'o', 'o', 'k', 'enter');
  await expect.poll(() => m.sent).toEqual(['look']);
  // As before: the line stays, selected natively, while the field has the focus.
  await expect(field(page)).toHaveValue('look');
  expect(await selection(page)).toEqual([0, 4]);
  expect(await kept(page)).toBe(false);
  const lit = await field(page).evaluate((el) => getComputedStyle(el).color);
  // Folded: nothing selected, the line kept and dimmed.
  await key(page, 'fold').tap();
  await expect(okb(page)).toBeHidden();
  await expect(field(page)).toHaveValue('look');
  expect(await selection(page)).toEqual([4, 4]);
  expect(await kept(page)).toBe(true);
  await expect(field(page)).toHaveClass(/\bwc-input-kept\b/);
  expect(await field(page).evaluate((el) => getComputedStyle(el).color)).not.toBe(lit);
  // A tap opens the keyboard: still no selection (no pop-up), the line still there and kept.
  await field(page).tap();
  await expect(okb(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
  const sel = await selection(page);
  expect(sel[0]).toBe(sel[1]);
  expect(sel).toEqual([4, 4]);
  expect(await kept(page)).toBe(true);
  await expect(field(page)).toHaveValue('look');
  // Enter sends it again.
  await type(page, 'enter');
  await expect.poll(() => m.sent).toEqual(['look', 'look']);
  await expect(field(page)).toHaveValue('look');
  // Folded and opened again: a letter replaces it.
  await key(page, 'fold').tap();
  await field(page).tap();
  await expect(okb(page)).toBeVisible();
  expect(await kept(page)).toBe(true);
  await type(page, 'n');
  await expect(field(page)).toHaveValue('n');
  expect(await kept(page)).toBe(false);
  await expect(field(page)).not.toHaveClass(/\bwc-input-kept\b/);
  expect(await field(page).evaluate((el) => getComputedStyle(el).color)).toBe(lit);
  // Sent, folded, opened: Backspace clears it.
  await type(page, 'enter');
  await expect.poll(() => m.sent).toEqual(['look', 'look', 'n']);
  await key(page, 'fold').tap();
  await field(page).tap();
  await expect(okb(page)).toBeVisible();
  await type(page, 'back');
  await expect(field(page)).toHaveValue('');
  // Sent, folded, opened, and a second tap in the text: ordinary text, typed into.
  await type(page, 'w', 'e', 's', 't', 'enter');
  await key(page, 'fold').tap();
  await field(page).tap();
  await expect(okb(page)).toBeVisible();
  expect(await kept(page)).toBe(true);
  await field(page).tap();
  expect(await kept(page)).toBe(false);
  await field(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
  await type(page, 's');
  await expect(field(page)).toHaveValue('wests');
  // The history's arrow from a kept line goes one further back, as from the selected one.
  await type(page, 'enter');
  await key(page, 'fold').tap();
  await field(page).tap();
  await type(page, 'older');
  await expect(field(page)).toHaveValue('west');
  expect(await kept(page)).toBe(false);
  expect(errors).toEqual([]);
});

test('a selection the user makes in a kept line (a long press) is theirs: the line is ordinary text and the selection stays', async ({ page }) => {
  const m = await play(page);
  await setScreen(page, S21);
  await field(page).tap();
  await type(page, 'l', 'o', 'o', 'k', 'enter');
  await expect.poll(() => m.sent).toEqual(['look']);
  await key(page, 'fold').tap();
  expect(await kept(page)).toBe(true);
  // (Emulation has no long press menu: the range it would select is made, and its `select` event told.)
  await field(page).tap();
  await field(page).evaluate((el: HTMLTextAreaElement) => {
    el.setSelectionRange(0, 4);
    el.dispatchEvent(new Event('select', { bubbles: true }));
  });
  expect(await kept(page)).toBe(false);
  expect(await selection(page)).toEqual([0, 4]);
  await expect(field(page)).not.toHaveClass(/\bwc-input-kept\b/);
});

test('nothing is kept at a password prompt', async ({ page }) => {
  const m = await play(page);
  await setScreen(page, S21);
  await field(page).tap();
  await type(page, 'l', 'o', 'o', 'k', 'enter');
  await key(page, 'fold').tap();
  expect(await kept(page)).toBe(true);
  // MUME asks for a password: the kept line goes, and what is typed there is never kept.
  m.server().send(Buffer.concat([Buffer.from('Password: '), Buffer.from([IAC, WILL, ECHO])]));
  await expect(field(page)).toHaveClass(/\bwc-masked\b/);
  expect(await kept(page)).toBe(false);
  await expect(field(page)).toHaveValue('');
  await field(page).tap();
  await expect(okb(page)).toBeVisible();
  await type(page, 'a', 'b', 'c', 'enter');
  await expect(field(page)).toHaveValue('');
  await key(page, 'fold').tap();
  expect(await kept(page)).toBe(false);
  await expect(field(page)).not.toHaveClass(/\bwc-input-kept\b/);
  m.server().send(Buffer.from([IAC, WONT, ECHO]));
  await expect(field(page)).not.toHaveClass(/\bwc-masked\b/);
  await expect(field(page)).toHaveValue('');
});

// ------------------------------------------------------ 3. the fields' text

/** The advance of one character in `l`'s font, measured in the page. */
const advance = (l: Locator) =>
  l.evaluate((el) => {
    const st = getComputedStyle(el);
    const s = document.createElement('span');
    s.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-family:${st.fontFamily};font-size:${st.fontSize};font-weight:${st.fontWeight};letter-spacing:${st.letterSpacing}`;
    s.textContent = 'M'.repeat(40);
    document.body.append(s);
    const w = s.getBoundingClientRect().width / 40;
    s.remove();
    return w;
  });

test('the command field, Comm\'s reply line and search, and the hot key box\'s fields have 16 px text at a small and at a large font size setting; the caret and the password\'s bullets follow', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await play(page);
  await setScreen(page, S21);
  const px = (l: Locator) => l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  for (const size of [8, 18]) {
    await page.evaluate((n) => window.__wc!.settings.update({ appearance: { size: n } }), size);
    await frames(page);
    await frames(page);
    expect((await layout(page)).tooSmall).toBe(false);
    // The game text follows the setting; the field does not, and keeps its height.
    const cell = await page.evaluate(() => window.__wc!.cells.get());
    expect(Math.abs(cell.px - size)).toBeLessThan(1.5);
    expect(await px(field(page))).toBe(16);
    expect((await box(page.locator('.wc-input-slot > .wc-input'))).height).toBe(44);
    // The caret stands after what is typed, by the field's own font (not the cockpit's cell).
    await field(page).tap();
    await expect(okb(page)).toBeVisible();
    await type(page, 'k', 'i', 'l', 'l');
    await frames(page);
    const adv = await advance(field(page));
    expect(Math.abs(adv - cell.w)).toBeGreaterThan(0.5);
    const caret = page.locator('.wc-input-slot .wc-caret');
    const f = await box(field(page));
    expect(Math.abs((await box(caret)).x - (f.x + 4 * adv))).toBeLessThanOrEqual(0.75);
    expect(await px(caret)).toBe(16);
    await type(page, 'back', 'back', 'back', 'back');
    await key(page, 'fold').tap();
    await expect(okb(page)).toBeHidden();
  }
  // Comm's two fields and the box's two (the same family: 16 px).
  m.server().send(gmcp('Comm.Channel.Text', { channel: 'tells', talker: 'Gibur', 'talker-type': 'player', text: "Gibur tells you 'you at the ford?'" }));
  await sat(page, 'comm').tap();
  await comm(page).locator('.wc-cm-ent[aria-label^="Gibur"]').tap();
  for (const size of [8, 18]) {
    await page.evaluate((n) => window.__wc!.settings.update({ appearance: { size: n } }), size);
    await frames(page);
    expect(await px(reply(page))).toBe(16);
    expect(await px(comm(page).locator('.wc-cm-sinput'))).toBe(16);
  }
  await sat(page, 'comm').tap();
  await hold(page, hk(page, 2));
  expect(await px(command(page))).toBe(16);
  expect(await px(label(page))).toBe(16);
  await rb(page).locator('.wc-ph-bt', { hasText: 'Cancel' }).tap();
  // The password prompt at the large size: the bullets lie on the field's line, a bullet per character.
  m.server().send(Buffer.concat([Buffer.from('Password: '), Buffer.from([IAC, WILL, ECHO])]));
  await expect(field(page)).toHaveClass(/\bwc-masked\b/);
  await field(page).tap();
  await expect(okb(page)).toBeVisible();
  await type(page, 'a', 'b', 'c');
  await frames(page);
  const mask = page.locator('.wc-input-slot .wc-input-mask');
  await expect(mask).toHaveText('•••');
  expect(await px(mask)).toBe(16);
  const f = await box(field(page));
  const mk = await box(mask);
  expect(Math.abs(mk.x - f.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(mk.y - f.y)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(mk.height - f.height)).toBeLessThanOrEqual(0.5);
  const adv = await advance(field(page));
  expect(Math.abs((await advance(mask)) - adv)).toBeLessThan(0.01);
  expect(Math.abs((await box(page.locator('.wc-input-slot .wc-caret'))).x - (f.x + 3 * adv))).toBeLessThanOrEqual(0.75);
  expect(errors).toEqual([]);
});

// ----------------------------------------------- 4. the names on the bands

/** WCAG contrast of `l`'s text colour against the worst stop of the ground of `ground`. */
async function contrast(l: Locator, ground: Locator): Promise<number> {
  const fg = await l.evaluate((el) => getComputedStyle(el).color);
  const bg = await ground.evaluate((el) => {
    const st = getComputedStyle(el);
    return [st.backgroundColor, ...(st.backgroundImage.match(/rgba?\([^)]*\)/g) ?? [])];
  });
  const rgb = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).map(Number);
  const lum = (c: string): number => {
    const [r, g, b] = rgb(c).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  // (A transparent colour is no ground: the gradient's stops are.)
  const grounds = bg.filter((c) => rgb(c).length === 3 || rgb(c)[3] === 1);
  expect(grounds.length).toBeGreaterThan(0);
  const f = lum(fg);
  return Math.min(...grounds.map((c) => (Math.max(f, lum(c)) + 0.05) / (Math.min(f, lum(c)) + 0.05)));
}

for (const theme of ['dark', 'paper'] as const) {
  test(`${theme}: no hood anywhere; the strip's plate follows its page; a band is dragged from its plate; the names have their contrast, in portrait and in landscape`, async ({ page }) => {
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, S21);
    if (theme === 'paper') {
      await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } }));
      await expect(page.locator('html')).toHaveAttribute('data-light', '');
    }
    await openBoth(page, m);
    await expect(page.locator('.wc-ph-strip-hood, .wc-ph-comm-hood, .wc-ph-comm-head')).toHaveCount(0);
    const stripPlate = page.locator('.wc-ph-strip-band .wc-ph-plate');
    const commPlate = page.locator('.wc-ph-comm-band .wc-ph-plate');
    await expect(stripPlate).toHaveText('Group');
    await expect(commPlate).toHaveText('Comm');
    // The panes have every row of their parts but the band's.
    const cell = await page.evaluate(() => window.__wc!.cells.get());
    let g = await layout(page);
    expect(Math.abs((await box(stripPane(page).locator('.wc-pane-content'))).height - (g.strip.h - 1) * cell.h)).toBeLessThanOrEqual(1);
    expect(Math.abs((await box(comm(page).locator('.wc-pane-content'))).height - (g.comm.h - 1) * cell.h)).toBeLessThanOrEqual(1);
    // The page changes: so does the name.
    await page.evaluate(() => window.__wc!.app.cockpit.selectTabAt(0));
    await expect(stripPlate).toHaveText('Timers');
    await page.evaluate(() => window.__wc!.app.cockpit.selectTabAt(1));
    await expect(stripPlate).toHaveText('Group');
    // Legible: at least 4.5 : 1 on the plate's ground.
    expect(await contrast(stripPlate, stripPlate)).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(commPlate, commPlate)).toBeGreaterThanOrEqual(4.5);
    // The band is dragged from its plate: a finger down on the name, three rows down.
    const rows0 = g.strip.h;
    const p = await box(stripPlate);
    const at = { x: p.x + p.width / 2, y: p.y + p.height / 2 };
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className ?? '', at)).toContain('wc-ph-strip-grip');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...at, id: 0 }] });
    for (let i = 1; i <= 3; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: at.x, y: at.y + i * cell.h, id: 0 }] });
    await expect.poll(async () => (await layout(page)).strip.h).toBe(rows0 + 3);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    expect(await page.evaluate(() => window.__wc!.settings.get().phone.stripRows)).toBe(rows0 + 3);
    await expect(stripPlate).toHaveText('Group');
    // With our keyboard up the names are still on their bands.
    await reply(page).tap();
    await expect(okb(page)).toBeVisible();
    await frames(page);
    await expect(commPlate).toBeVisible();
    await expect(commPlate).toHaveText('Comm');
    await key(page, 'fold').tap();
    // Landscape: both names on the column's band, each on its pane's stretch; no hood, no row taken.
    await setScreen(page, S21_LAND);
    await expect(page.locator('.wc-ph-strip-hood, .wc-ph-comm-hood, .wc-ph-comm-head')).toHaveCount(0);
    const side = page.locator('.wc-ph-side-band');
    await expect(side.locator('.wc-ph-plate:visible')).toHaveText(['Group', 'Comm']);
    g = await layout(page);
    expect(Math.abs((await box(stripPane(page).locator('.wc-pane-content'))).height - g.strip.h * cell.h)).toBeLessThanOrEqual(1);
    expect(Math.abs((await box(comm(page).locator('.wc-pane-content'))).height - g.comm.h * cell.h)).toBeLessThanOrEqual(1);
    for (const id of ['strip', 'comm']) {
      const plate = side.locator(`.wc-ph-plate-run[data-plate="${id}"] .wc-ph-plate`);
      expect(await contrast(plate, plate), id).toBeGreaterThanOrEqual(4.5);
    }
    // The column is dragged from a plate too.
    const sp = await box(side.locator('.wc-ph-plate-run[data-plate="comm"] .wc-ph-plate'));
    const sat2 = { x: sp.x + sp.width / 2, y: sp.y + sp.height / 2 };
    const cols0 = g.side.w;
    const cdp2 = await page.context().newCDPSession(page);
    await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...sat2, id: 0 }] });
    for (let i = 1; i <= 3; i++) await cdp2.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sat2.x - i * cell.w, y: sat2.y, id: 0 }] });
    await expect.poll(async () => (await layout(page)).side.w).toBe(cols0 - 3);
    await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp2.detach();
    expect(errors).toEqual([]);
  });
}
