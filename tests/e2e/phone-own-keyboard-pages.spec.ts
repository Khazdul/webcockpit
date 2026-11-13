// Stage 53f (ADR 0139 §1–§4, one-line fields): our own keyboard on the
// phone's pages outside the game layout: the start menu's pages before any
// game exists, and the pages opened from the game's menu over the cockpit.
//
// - Each kind of one-line field asks the device for no keyboard, a tap (or
//   the focus a tapped dialog gives it) opens ours, the keys type through
//   the field's adapter and Enter does what a real Enter does there: new
//   and rename profile, new and rename script (the look kit's `Field`), the export
//   title, Lite's pattern, the manual's find, a script setting's value (a
//   number: the digit row is up), the editors' Find row.
// - The page ends above the keyboard (a fixed reserve): the field and the
//   dialog's buttons stay visible and reachable.
// - (The multi-line fields: phone-own-keyboard-multiline.spec.ts; the code
//   editors: phone-own-keyboard-editors.spec.ts.)
// - A page over the game: the page's keyboard, not the game's; closing the
//   page returns to the game with no reserve left and no extra window size,
//   and the game's keyboard still works.
// - A desktop-size and a tablet-size window: nothing of this.
//
// `phone` project; most cases name the layout (`?kbd=en`) so they do not
// depend on the browser's language. Nothing reaches MUME.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';

const S21 = { width: 360, height: 800 };
const S21_LAND = { width: 800, height: 360 };

const html = (page: Page) => page.locator('html');
const host = (page: Page) => page.locator('.wc-okb-page');
const okb = (page: Page) => host(page).locator('.wc-ph-okb');
const key = (page: Page, k: string) => okb(page).locator([...k].length === 1 ? `.wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-ph-okb-k[data-act="${k}"]`);
const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const menuFrame = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden])');
const gameOkb = (page: Page) => page.locator('.wc-cockpit .wc-ph-okb');
const gameKey = (page: Page, k: string) => gameOkb(page).locator([...k].length === 1 ? `.wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-ph-okb-k[data-act="${k}"]`);
const command = (page: Page) => page.locator('.wc-input-slot .wc-input-field');

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

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));

/** The start page on a phone (before any game), with our keyboard in the English layout unless `query` says otherwise. */
async function openStart(page: Page, query = '&kbd=en'): Promise<void> {
  await page.goto(`/?phone=1${query}`);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
}

/** The keyboard is up on the page: shown, the reserve set, and the page ends at its top edge. */
async function expectUp(page: Page): Promise<Box> {
  await expect(okb(page)).toBeVisible();
  await expect(html(page)).toHaveClass(/\bwc-okb-pg\b/);
  // Never the game's keyboard state, and never the device's.
  await expect(html(page)).not.toHaveClass(/(^|\s)wc-okb(\s|$)/);
  await frames(page);
  const k = await box(host(page));
  const view = page.viewportSize()!;
  expect(Math.round(k.y + k.height)).toBe(view.height);
  expect(k.width).toBe(view.width);
  return k;
}

async function expectDown(page: Page): Promise<void> {
  await expect(host(page)).toBeHidden();
  await expect(html(page)).not.toHaveClass(/\bwc-okb-pg\b/);
  expect(await page.locator('#app').evaluate((el) => el.style.getPropertyValue('--wc-okb-page-h'))).toBe('');
}

/** `l` lies whole above the keyboard and inside the screen. */
async function expectAbove(page: Page, l: Locator): Promise<void> {
  await expect(l).toBeVisible();
  const k = await box(host(page));
  await expect
    .poll(async () => {
      const b = await box(l);
      return b.y >= 0 && b.y + b.height <= k.y + 0.5;
    })
    .toBe(true);
}

/** The field asks the device for no keyboard. */
async function expectMarked(f: Locator): Promise<void> {
  await expect(f).toHaveAttribute('inputmode', 'none');
  await expect(f).toHaveAttribute('virtualkeyboardpolicy', 'manual');
}

/** Every keydown the page sees from now on, with whether it was a real one (`isTrusted`). */
async function watchKeys(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const log: string[] = ((window as unknown as { __keys: string[] }).__keys = []);
    window.addEventListener('keydown', (e) => log.push(`${e.key}:${e.isTrusted ? 'real' : 'made'}`), true);
  });
  return () => page.evaluate(() => (window as unknown as { __keys: string[] }).__keys);
}

async function addProfile(page: Page, name: string): Promise<void> {
  await page.evaluate(async (n) => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.create(n, '');
  }, name);
}

async function addScript(page: Page, name: string, source?: string): Promise<void> {
  await page.evaluate(
    async ({ n, src }) => {
      const l = window.__wc!.shell.scripts!;
      await l.init();
      if (src === undefined) await l.create(n);
      else await l.create(n, src);
    },
    { n: name, src: source },
  );
}

const profileNames = (page: Page) => page.evaluate(async () => (await window.__wc!.shell.profiles.list()).map((r) => r.name).sort());
const scriptNames = (page: Page) => page.evaluate(() => window.__wc!.shell.scripts!.list().map((s) => s.name).sort());

// ------------------------------------------------------------ before the game

test.describe('portrait 360 × 800, before the game', () => {
  test.use({ viewport: S21 });

  test('rename a profile (the look kit\'s dialog): typed on our keys, Enter confirms, the keyboard goes with the field', async ({ page }) => {
    const errors = watchErrors(page);
    await openStart(page);
    await addProfile(page, 'hero');
    const keys = await watchKeys(page);
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="profile"]').tap();
    const row = f.locator('.wc-pl-row[data-name="hero"]');
    await row.tap();
    await expectDown(page);
    await row.locator('[data-btn="RENAME"]').tap();
    const dlg = page.locator('.wc-lk-dialog[data-dlg="rename"]');
    await expect(dlg.locator('.wc-lk-hood-t')).toHaveText('Rename Profile');
    const field = dlg.locator('input');
    await expectMarked(field);
    // The tap that opened the prompt focused its field: the keyboard is up for it.
    await expect(field).toBeFocused();
    await expectUp(page);
    await expectAbove(page, field);
    for (const b of ['CANCEL', 'OK']) await expectAbove(page, dlg.locator(`[data-btn="${b}"]`));
    await expect(field).toHaveValue('hero');
    // The whole name is selected (a rename): the first key replaces it.
    // No history here: the keyboard has no history arrows (round 53g).
    for (const a of ['older', 'newer']) await expect(key(page, a)).toHaveCount(0);
    await type(page, 'shift', 'b', 'i', 'l', 'b', 'x', 'back', 'o');
    await expect(field).toHaveValue('Bilbo');
    // Text made no key event; Enter is one made-up keydown, taken by the frame as a real one.
    expect(await keys()).toEqual([]);
    await key(page, 'enter').tap();
    await expect(dlg).toHaveCount(0);
    await expect(f.locator('.wc-lk-hood-t')).toHaveText('Profiles');
    await expect(f.locator('.wc-lk-flash')).toHaveText('Renamed to "Bilbo".');
    await expect.poll(async () => (await profileNames(page)).filter((n) => n === 'Bilbo' || n === 'hero')).toEqual(['Bilbo']);
    expect(await keys()).toEqual(['Enter:made']);
    // The field is gone: so is the keyboard, at once, with its reserve.
    await expectDown(page);
    expect(errors).toEqual([]);
  });

  test('a new profile: the name typed on our keys, one Enter goes one step (nothing fires twice)', async ({ page }) => {
    const errors = watchErrors(page);
    await openStart(page);
    await page.evaluate(() => window.__wc!.shell.profiles.init());
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="profile"]').tap();
    await f.locator('[data-btn="NEW"]').tap();
    const dlg = page.locator('.wc-lk-dialog[data-dlg="new"]');
    const field = dlg.locator('input');
    await expectMarked(field);
    await expect(field).toBeFocused();
    await expectUp(page);
    await expectAbove(page, field);
    for (const b of ['CANCEL', 'OK']) await expectAbove(page, dlg.locator(`[data-btn="${b}"]`));
    // A bad name: the message stands above the keys too, and the keyboard stays.
    await type(page, 'sym', '9', 'sym', 'o');
    await expect(field).toHaveValue('9o');
    await key(page, 'enter').tap();
    await expectAbove(page, dlg.locator('[role="alert"]'));
    await expect(dlg.locator('[role="alert"]')).toHaveText('The name must start with a letter.');
    await expectUp(page);
    await type(page, 'back', 'back', 'o', 'r', 'c');
    await expect(field).toHaveValue('orc');
    await key(page, 'enter').tap();
    // One step on: how the profile starts (blank, or a copy). A second Enter would have gone on from there.
    const how = page.locator('.wc-lk-dialog[data-dlg="new-how"]');
    await expect(how.getByText('Blank profile')).toBeVisible();
    await expect(field).toHaveCount(0);
    await expectDown(page);
    await frames(page);
    await expect(how.getByText('Blank profile')).toBeVisible();
    expect(await profileNames(page)).not.toContain('orc');
    // Back: the name again, kept, with the keyboard up for it; then on, and Blank by tap.
    await how.locator('[data-btn="BACK"]').tap();
    await expect(field).toHaveValue('orc');
    await expectUp(page);
    await key(page, 'enter').tap();
    await how.locator('.wc-lk-row[data-k="blank"]').tap();
    await expect(page.locator('.wc-lk-dialog')).toHaveCount(0);
    await expect(f.locator('.wc-lk-flash')).toHaveText('Created "orc".');
    expect(await profileNames(page)).toContain('orc');
    await expectDown(page);
    expect(errors).toEqual([]);
  });

  test('a new script (the look kit\'s dialog): the field and its buttons stand above the keyboard; fold, tap again, Enter creates', async ({ page }) => {
    const errors = watchErrors(page);
    await openStart(page);
    await page.evaluate(() => window.__wc!.shell.scripts!.init());
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="scripts"]').tap();
    await f.locator('[data-btn="NEW"]').tap();
    const dlg = page.locator('.wc-lk-dialog[data-dlg="new"]');
    const field = dlg.locator('input');
    await expectMarked(field);
    await expect(field).toBeFocused();
    await expectUp(page);
    await expectAbove(page, field);
    for (const b of ['CANCEL', 'OK']) await expectAbove(page, dlg.locator(`[data-btn="${b}"]`));
    await type(page, 'm', 'y');
    await expect(field).toHaveValue('my');
    // The fold key closes and blurs; the dialog stays, and has the page's full height again.
    await key(page, 'fold').tap();
    await expectDown(page);
    await expect(field).not.toBeFocused();
    await expect(dlg).toBeVisible();
    // A tap on the field opens it again; the symbols page and the digits type too.
    await field.tap();
    await expectUp(page);
    await type(page, 'sym', '_', '1', 'sym', 'a');
    await expect(field).toHaveValue('my_1a');
    await key(page, 'enter').tap();
    await expect(page.locator('.wc-frame:not([hidden]) .wc-sed')).toHaveAttribute('data-script', 'my_1a');
    expect(await scriptNames(page)).toContain('my_1a');
    // The editor opens with its code to be read: our keyboard is down until a tap in the text.
    await expectDown(page);
    expect(errors).toEqual([]);
  });

  test('rename a script: the name is selected, typing replaces it; Cancel is reachable and closes the keyboard with the dialog', async ({ page }) => {
    const errors = watchErrors(page);
    await openStart(page);
    await addScript(page, 'oldname');
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="scripts"]').tap();
    await f.locator('.wc-scr-row[data-name="oldname"] .wc-scr-name').tap();
    await f.locator('[data-btn="RENAME"]:visible').first().tap();
    const dlg = page.locator('.wc-lk-dialog[data-dlg="rename"]');
    const field = dlg.locator('input');
    await expect(field).toBeFocused();
    await expectUp(page);
    await expectAbove(page, field);
    // Cancel by a tap, with the keyboard up: reachable, and everything goes.
    const cancel = dlg.locator('[data-btn="CANCEL"]');
    await expectAbove(page, cancel);
    await cancel.tap();
    await expect(dlg).toHaveCount(0);
    await expectDown(page);
    expect(await scriptNames(page)).toContain('oldname');
    // Again: the selected name is replaced by the first key; the dialog's own button confirms.
    await f.locator('[data-btn="RENAME"]:visible').first().tap();
    await expect(field).toBeFocused();
    await expectUp(page);
    await type(page, 'n', 'e', 'w');
    await expect(field).toHaveValue('new');
    await dlg.locator('[data-btn="OK"]').tap();
    await expect(dlg).toHaveCount(0);
    await expect.poll(() => scriptNames(page)).toContain('new');
    await expectDown(page);
    expect(errors).toEqual([]);
  });

  const TYPED = `-- @name     phonetyped
-- @version  1
-- @summary  A script with two settings.
-- @api      1
-- @setting  warn number 5 0..30 unit min "Warn before the end"
-- @setting  word string hello "What to say"
`;

  test('a script setting: a number opens with the digit row up; Enter keeps the value; a string field has the stored rows', async ({ page }) => {
    const errors = watchErrors(page);
    await openStart(page);
    await addScript(page, 'phonetyped', TYPED);
    const settings = () => page.evaluate(() => window.__wc!.shell.scripts!.settingsOf('phonetyped'));
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="scripts"]').tap();
    await f.locator('.wc-scr-row[data-name="phonetyped"] .wc-scr-name').tap();
    const warn = f.locator('.wc-scr-set[data-set="warn"]');
    await warn.locator('.wc-scr-val').tap();
    const num = warn.locator('input.wc-scr-input');
    await expect(num).toBeFocused();
    await expectMarked(num);
    await expect(num).toHaveAttribute('data-okb-kind', 'digits');
    await expectUp(page);
    await expectAbove(page, num);
    // The digit row is up for the number, though the stored state is folded.
    expect(await page.evaluate(() => window.__wc!.settings.get().phone.keyboard.digits)).toBe(false);
    await expect(okb(page).locator('.wc-ph-okb-row:not(.is-nav)')).toHaveCount(5);
    await type(page, '1', '2');
    await expect(num).toHaveValue('12');
    await key(page, 'enter').tap();
    await expect.poll(settings).toMatchObject({ warn: 12 });
    await expect(f.locator('input.wc-scr-input')).toHaveCount(0);
    await expectDown(page);
    // The string: four rows (the stored state), typed at the end.
    const word = f.locator('.wc-scr-set[data-set="word"]');
    await word.locator('.wc-scr-str').tap();
    const str = word.locator('input.wc-scr-input');
    await expect(str).toBeFocused();
    await expectUp(page);
    await expect(okb(page).locator('.wc-ph-okb-row:not(.is-nav)')).toHaveCount(4);
    await type(page, 'space', 'y', 'o', 'u');
    await expect(str).toHaveValue('hello you');
    // Left by a tap elsewhere: the typed text is kept (the tile's own rule) and the keyboard goes.
    await f.locator('.wc-scr-panel .wc-scr-summary').tap();
    await expect.poll(settings).toMatchObject({ word: 'hello you' });
    await expectDown(page);
    expect(errors).toEqual([]);
  });

  test('the manual\'s find: typed on our keys, the hits follow; Enter goes to the next', async ({ page }) => {
    const errors = watchErrors(page);
    await openStart(page);
    await page.evaluate(() => window.__wc!.shell.scripts!.init());
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="scripts"]').tap();
    await f.locator('[data-btn="MANUAL"]').tap();
    const m = page.locator('.wc-frame:not([hidden]) .wc-sman');
    const field = m.locator('.wc-lk-mfind input');
    await expectMarked(field);
    // Opening the manual focuses no field: no keyboard until the field is tapped.
    await expectDown(page);
    await field.tap();
    await expectUp(page);
    await expectAbove(page, field);
    await type(page, 't', 'i', 'm', 'e', 'r');
    await expect(field).toHaveValue('timer');
    const count = m.locator('.wc-lk-mfind .wc-search-count, .wc-lk-mfind [aria-live]').first();
    await expect(count).toContainText(/\d/);
    const first = await count.textContent();
    await key(page, 'enter').tap();
    await expect(count).not.toHaveText(first!);
    await expect(field).toBeFocused();
    await expectUp(page);
    // Back leaves the manual: the field is gone, and the keyboard with it.
    await m.locator(':scope > .wc-lk-back').tap();
    await expect(m).toHaveCount(0);
    await expectDown(page);
    expect(errors).toEqual([]);
  });

  test('the script editor: its Find row is ours, and so is the buffer since round 53h (the keyboard stays up between them)', async ({ page }) => {
    const errors = watchErrors(page);
    await openStart(page);
    await addScript(page, 'phoneed', 'local alpha = 1\nlocal beta = alpha\n');
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="scripts"]').tap();
    await f.locator('.wc-scr-row[data-name="phoneed"] .wc-scr-name').tap();
    await f.locator('[data-btn="EDIT"]:visible').first().tap();
    const ed = page.locator('.wc-frame:not([hidden]) .wc-sed');
    await expect(ed).toHaveAttribute('data-script', 'phoneed');
    const content = ed.locator('.cm-content');
    // The buffer is marked too (round 53h; its own flows are in phone-own-keyboard-editors.spec.ts).
    await expectMarked(content);
    await ed.locator('.wc-sed-tools [data-btn="FIND"], [data-btn="FIND"]').first().tap();
    const find = ed.locator('.wc-lk-search');
    const field = find.locator('input').first();
    await expect(field).toBeFocused();
    await expectMarked(field);
    await expectUp(page);
    await expectAbove(page, field);
    await type(page, 'a', 'l', 'p', 'h', 'a');
    await expect(field).toHaveValue('alpha');
    await expect(find.locator('.wc-search-count')).toContainText('2');
    const sel = () => page.evaluate(() => document.querySelector('.wc-sed .cm-content')!.ownerDocument.getSelection()!.toString());
    await key(page, 'enter').tap();
    await expect.poll(sel).toBe('alpha');
    await expect(field).toBeFocused();
    // A tap in the buffer: it takes the focus, and our keyboard stays up for it.
    await content.tap();
    await expect(content).toBeFocused();
    await expectUp(page);
    // Back in the find field: still ours.
    await field.tap();
    await expectUp(page);
    expect(errors).toEqual([]);
  });

  test('Lite: the pattern is ours and typed on our keys; so is the body (round 53g), and a physical keyboard still types in it', async ({ page }) => {
    const errors = watchErrors(page);
    await openStart(page);
    await page.evaluate(async () => {
      await window.__wc!.shell.profiles.init();
      await window.__wc!.shell.profiles.save('default', '#alias {k} {kill}\n');
    });
    const stored = () => page.evaluate(() => window.__wc!.shell.profiles.get('default').then((r) => r?.text ?? ''));
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="profile"]').tap();
    await f.locator('[data-btn="EDIT"]').tap();
    const pe = page.locator('.wc-frame:not([hidden]) .wc-pe');
    await expect(pe).toHaveAttribute('data-view', 'lite');
    await pe.locator('[data-rail="alias"]').tap();
    await pe.locator('[data-btn="NEW"]').tap();
    const pattern = pe.locator('[data-field="pattern"] input');
    await expect(pattern).toBeFocused();
    await expectMarked(pattern);
    await expectUp(page);
    await expectAbove(page, pattern);
    await type(page, 'z', 'z');
    await expect(pattern).toHaveValue('zz');
    // The body is a multi-line field: ours since round 53g (phone-own-keyboard-multiline.spec.ts);
    // the keyboard stays up for it, and a physical keyboard types in it as ever.
    const body = pe.locator('[data-field="body"] textarea');
    await expectMarked(body);
    await body.tap();
    await expect(body).toBeFocused();
    await expectUp(page);
    await page.keyboard.type('sleep');
    await expect(body).toHaveValue('sleep');
    // And back.
    await pattern.tap();
    await expectUp(page);
    await type(page, 'z');
    await expect(pattern).toHaveValue('zzz');
    await key(page, 'fold').tap();
    await expectDown(page);
    await pe.locator('[data-btn="SHEET"]').tap();
    await expect.poll(stored).toContain('#alias {zzz} {sleep}');
    expect(errors).toEqual([]);
  });

  test('the export title: typed on our keys in the foot, Enter saves it; the comment is ours too (round 53g)', async ({ page }) => {
    const errors = watchErrors(page);
    await pinDemoClock(page);
    await openStart(page);
    await page.evaluate(async () => {
      const lib = await window.__wc!.runs();
      await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
    });
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="history"]').tap();
    const hist = f.locator('.wc-hist');
    await expect(hist.locator('.wc-lk-tr')).toHaveCount(3);
    await hist.locator('.wc-lk-tr').nth(1).tap();
    await hist.locator('.wc-hist-card [data-btn="EXPORT"]').tap();
    await expect(f.locator('.wc-exp')).toBeVisible();
    await f.locator('[data-btn="TITLE"]').tap();
    const field = f.locator('.wc-exp-file.is-edit input');
    await expect(field).toBeFocused();
    await expectMarked(field);
    await expectUp(page);
    await expectAbove(page, field);
    for (const b of ['SAVE', 'CANCEL']) await expectAbove(page, f.locator(`.wc-exp-file.is-edit [data-btn="${b}"]`));
    // The old title is selected: the first key replaces it.
    await type(page, 'shift', 'm', 'o', 'r', 'i', 'a');
    await expect(field).toHaveValue('Moria');
    await expect(f.locator('.wc-exp-thint b')).toContainText('Moria.');
    await key(page, 'enter').tap();
    await expect(f.locator('.wc-exp-file.is-edit')).toHaveCount(0);
    await expect(f.locator('.wc-exp-file')).toContainText('Moria');
    await expectDown(page);
    // The comment's composer: ours since round 53g (phone-own-keyboard-multiline.spec.ts).
    await f.locator('[data-btn="COMMENT"]').tap();
    const area = f.locator('.wc-exp-comp textarea');
    await expect(area).toBeFocused();
    await expectMarked(area);
    await expectUp(page);
    expect(errors).toEqual([]);
  });

  test('a physical keyboard types as before, and its focus alone opens nothing', async ({ page }) => {
    await openStart(page);
    await page.evaluate(() => window.__wc!.shell.scripts!.init());
    const f = startFrame(page);
    // By keys alone: no pointer has been down.
    await f.locator('.wc-sm-item[data-key="scripts"]').evaluate((el) => (el as HTMLElement).click());
    await expect(f.locator('.wc-scr')).toBeVisible();
    await page.keyboard.press('n');
    const field = page.locator('.wc-lk-dialog[data-dlg="new"] input');
    await expect(field).toBeFocused();
    await expectDown(page);
    await page.keyboard.type('bykeys');
    await expect(field).toHaveValue('bykeys');
    await page.keyboard.press('Enter');
    await expect(page.locator('.wc-frame:not([hidden]) .wc-sed')).toHaveAttribute('data-script', 'bykeys');
    await expectDown(page);
  });

  test('the layout setting and the digit row\'s stored state apply here as in the game', async ({ page }) => {
    await openStart(page, '');
    await page.evaluate(async () => {
      await window.__wc!.shell.scripts!.init();
      window.__wc!.settings.update({ phone: { keyboard: { layout: 'sv', digits: true } } });
    });
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="scripts"]').tap();
    await f.locator('[data-btn="NEW"]').tap();
    const field = page.locator('.wc-lk-dialog[data-dlg="new"] input');
    await expectUp(page);
    await expect(okb(page)).toHaveAttribute('data-layout', 'sv');
    await expect(okb(page).locator('.wc-ph-okb-row:not(.is-nav)')).toHaveCount(5);
    await type(page, 'å', '1');
    await expect(field).toHaveValue('å1');
    // The row's key folds it away and stores that: the reserve follows, the dialog stays above.
    const before = (await box(host(page))).height;
    await key(page, 'digits').tap();
    await expect(okb(page).locator('.wc-ph-okb-row:not(.is-nav)')).toHaveCount(4);
    expect(await page.evaluate(() => window.__wc!.settings.get().phone.keyboard.digits)).toBe(false);
    await expect.poll(async () => (await box(host(page))).height).toBeLessThan(before);
    await expectAbove(page, page.locator('.wc-lk-dialog[data-dlg="new"] [data-btn="OK"]'));
  });

});

// ------------------------------------------------------------------ landscape

test.describe('landscape 800 × 360, before the game', () => {
  test.use({ viewport: S21_LAND });

  test('a new script: the keyboard stands in the middle, the field and the buttons above it, Enter creates', async ({ page }) => {
    const errors = watchErrors(page);
    await openStart(page);
    await page.evaluate(() => window.__wc!.shell.scripts!.init());
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="scripts"]').tap();
    await f.locator('[data-btn="NEW"]').tap();
    const dlg = page.locator('.wc-lk-dialog[data-dlg="new"]');
    const field = dlg.locator('input');
    await expect(field).toBeFocused();
    const k = await expectUp(page);
    // Low rows, and the block compressed towards the middle.
    expect(k.height).toBeLessThanOrEqual(160);
    const block = await box(okb(page).locator('.wc-ph-okb-block'));
    expect(block.width).toBeLessThan(800);
    expect(Math.abs(block.x + block.width / 2 - 400)).toBeLessThanOrEqual(1);
    // The page is not "too small" under our keyboard.
    await expect(page.locator('.wc-start')).not.toHaveClass(/is-tiny/);
    await expectAbove(page, field);
    for (const b of ['CANCEL', 'OK']) await expectAbove(page, dlg.locator(`[data-btn="${b}"]`));
    await type(page, 'l', 'a', 'n', 'd');
    await expect(field).toHaveValue('land');
    await key(page, 'enter').tap();
    await expect(page.locator('.wc-frame:not([hidden]) .wc-sed')).toHaveAttribute('data-script', 'land');
    await expectDown(page);
    expect(errors).toEqual([]);
  });

  test('rename a profile: the dialog, its field and its buttons fit above the keyboard', async ({ page }) => {
    await openStart(page);
    await addProfile(page, 'hero');
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="profile"]').tap();
    const row = f.locator('.wc-pl-row[data-name="hero"]');
    await row.tap();
    await row.locator('[data-btn="RENAME"]').tap();
    const dlg = page.locator('.wc-lk-dialog[data-dlg="rename"]');
    const field = dlg.locator('input');
    await expect(field).toBeFocused();
    await expectUp(page);
    await expectAbove(page, dlg);
    await expectAbove(page, field);
    for (const b of ['CANCEL', 'OK']) await expectAbove(page, dlg.locator(`[data-btn="${b}"]`));
    // (The digit row is folded: the symbols' page has the digits as its first row.)
    // The name is selected: End of the text first (a tap on the field's end would do the same).
    await field.evaluate((el: HTMLInputElement) => el.setSelectionRange(el.value.length, el.value.length));
    await type(page, 'sym', '2');
    await expect(field).toHaveValue('hero2');
    await key(page, 'enter').tap();
    await expect.poll(() => profileNames(page)).toContain('hero2');
    await expectDown(page);
  });
});

// --------------------------------------------------------------- over the game

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
  return () => page.evaluate(() => (window as unknown as { __sizes: string[] }).__sizes);
}

async function openGame(page: Page, query = '&kbd=en'): Promise<void> {
  await page.goto(`/?replay&phone=1${query}`);
  await expect(html(page)).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
}

test.describe('portrait 360 × 800, a page over the game', () => {
  test.use({ viewport: S21 });

  test('Scripts from the menu: the page\'s keyboard, not the game\'s; closing returns to the game cleanly and its keyboard still works', async ({ page }) => {
    const errors = watchErrors(page);
    await openGame(page);
    await page.evaluate(() => window.__wc!.shell.scripts!.init());
    // The game's own keyboard first, open and typed in.
    await command(page).tap();
    await expect(gameOkb(page)).toBeVisible();
    await gameKey(page, 'l').tap();
    await expect(command(page)).toHaveValue('l');
    const sizes = await watchSizes(page);
    const rows = () => page.evaluate(() => window.__wc!.app.cockpit.phoneGameLayout!.rows);
    // The menu closes the game's keyboard (one window size, as before this round).
    await page.locator('.wc-ph-menu').tap();
    await expect(gameOkb(page)).toBeHidden();
    await expect(html(page)).not.toHaveClass(/(^|\s)wc-okb(\s|$)/);
    const closed = await sizes();
    expect(closed.length).toBeLessThanOrEqual(1);
    const fullRows = await rows();
    await page.locator('.wc-ph-sheet [data-row="scripts"]').tap();
    const f = menuFrame(page);
    await expect(f.locator('.wc-scr')).toBeVisible();
    await f.locator('[data-btn="NEW"]').tap();
    const dlg = page.locator('.wc-lk-dialog[data-dlg="new"]');
    const field = dlg.locator('input');
    await expect(field).toBeFocused();
    await expectMarked(field);
    // The page's keyboard is up; the game's stays closed under it and the cockpit is not laid out anew.
    await expectUp(page);
    await expect(gameOkb(page)).toBeHidden();
    await expectAbove(page, field);
    for (const b of ['CANCEL', 'OK']) await expectAbove(page, dlg.locator(`[data-btn="${b}"]`));
    await type(page, 'o', 'v', 'e', 'r');
    await expect(field).toHaveValue('over');
    // Nothing typed here reached the command line.
    await expect(command(page)).toHaveValue('l');
    expect(await rows()).toBe(fullRows);
    // Cancel the dialog, leave the page: back in the game.
    await dlg.locator('[data-btn="CANCEL"]').tap();
    await expectDown(page);
    await f.locator('.wc-lk-back').first().tap();
    await expect(page.locator('.wc-overlay')).toBeHidden();
    await expectDown(page);
    await frames(page);
    // No window size was sent for the page's keyboard, opening or closing.
    expect(await sizes()).toEqual(closed);
    expect(await rows()).toBe(fullRows);
    // The game's keyboard still works: one size when it opens, the keys type in the command line.
    await command(page).tap();
    await expect(gameOkb(page)).toBeVisible();
    await expect(html(page)).toHaveClass(/(^|\s)wc-okb(\s|$)/);
    await expect(host(page)).toBeHidden();
    await gameKey(page, 'o').tap();
    await expect(command(page)).toHaveValue('lo');
    await expect.poll(async () => (await sizes()).length).toBe(closed.length + 1);
    expect(errors).toEqual([]);
  });

  test('a page closed with the keyboard up (the dialog confirmed into the editor, then Back): no reserve is left', async ({ page }) => {
    const errors = watchErrors(page);
    await openGame(page);
    await page.evaluate(() => window.__wc!.shell.scripts!.init());
    const sizes = await watchSizes(page);
    await page.locator('.wc-ph-menu').tap();
    await page.locator('.wc-ph-sheet [data-row="profile"]').tap();
    const f = menuFrame(page);
    const pe = f.locator('.wc-pe');
    await expect(pe).toHaveAttribute('data-view', 'lite');
    await pe.locator('[data-rail="alias"]').tap();
    await pe.locator('[data-btn="NEW"]').tap();
    const pattern = pe.locator('[data-field="pattern"] input');
    await expect(pattern).toBeFocused();
    await expectUp(page);
    await expectAbove(page, pattern);
    await type(page, 'g', 'o');
    await expect(pattern).toHaveValue('go');
    // The whole menu is closed under the keyboard (as a dropped link's sheet or `#menu` would).
    await page.evaluate(() => (window.__wc!.shell as unknown as { closeMenu(): void }).closeMenu());
    await expect(page.locator('.wc-overlay')).toBeHidden();
    await expectDown(page);
    await frames(page);
    expect(await sizes()).toEqual([]);
    const app = await box(page.locator('#app'));
    const cockpit = await box(page.locator('.wc-cockpit'));
    expect(Math.round(cockpit.y + cockpit.height)).toBeLessThanOrEqual(Math.round(app.y + app.height));
    await command(page).tap();
    await expect(gameOkb(page)).toBeVisible();
    await gameKey(page, 'n').tap();
    await expect(command(page)).toHaveValue('n');
    expect(errors).toEqual([]);
  });
});

// ------------------------------------------------------- desktop and tablet

test.describe('a desktop-size window with the phone flag forced', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('gets nothing of this: no mount, no mark, no reserve', async ({ page }) => {
    await page.goto('/?phone=1&kbd=en&tablet=desktop');
    await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
    await page.evaluate(() => window.__wc!.shell.scripts!.init());
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="scripts"]').tap();
    await f.locator('[data-btn="NEW"]').tap();
    const field = page.locator('.wc-lk-dialog[data-dlg="new"] input');
    await expect(field).toBeFocused();
    expect(await field.getAttribute('inputmode')).toBeNull();
    await field.tap();
    await frames(page);
    await expect(page.locator('.wc-okb-page')).toHaveCount(0);
    await expect(html(page)).not.toHaveClass(/\bwc-okb-pg\b/);
    await page.keyboard.type('desk');
    await expect(field).toHaveValue('desk');
  });
});

test.describe('a tablet sent back to the desktop cockpit (`?tablet=desktop`: touch, no phone flag)', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test('gets nothing of this: no mount, no mark, no reserve', async ({ page }) => {
    await page.goto('/?tablet=desktop');
    await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
    await expect(html(page)).not.toHaveClass(/\bwc-phone\b/);
    await page.evaluate(() => window.__wc!.shell.scripts!.init());
    const f = startFrame(page);
    await f.locator('.wc-sm-item[data-key="scripts"]').tap();
    await f.locator('[data-btn="NEW"]').tap();
    const field = page.locator('.wc-lk-dialog[data-dlg="new"] input');
    await expect(field).toBeFocused();
    expect(await field.getAttribute('inputmode')).toBeNull();
    await field.tap();
    await frames(page);
    await expect(page.locator('.wc-okb-page')).toHaveCount(0);
    await expect(html(page)).not.toHaveClass(/\bwc-okb-pg\b/);
    await page.keyboard.type('tab');
    await expect(field).toHaveValue('tab');
  });
});
