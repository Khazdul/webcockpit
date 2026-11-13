// Stage 56, round 56b: the menu pages at tablet width (ADR 0140: a tablet
// has the phone flag, so the pages are the desktop-width arrangement with
// the phone's behaviours and our own keyboard).
//
// - A general guard per page at 820 × 1180 and 1180 × 820: the page does
//   not scroll sideways, its main controls lie inside the screen (above our
//   keyboard when it is up), and its buttons are at least 44 px high.
// - The fixes of the round: on a tablet-size window the kit's glass buttons
//   are drawn as a desktop draws them (12 px type, their icons) and every
//   target of the kit is 44 px; a phone-size window keeps the phone's
//   compact buttons (10 px type, no icons, 40 px targets).
// - Round 56c (at the end of the file): six layout fixes, one group each.
//
// `phone` project (Pixel 7: a touch browser; the viewport set here is its
// screen too, so it is a tablet with no flag). Nothing reaches MUME.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';
import { checkHandOver } from './first-paint';

const PORTRAIT = { width: 820, height: 1180 };
const LANDSCAPE = { width: 1180, height: 820 };
const TARGET = 44;

const start = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const over = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden])');
const okb = (page: Page) => page.locator('.wc-okb-page .wc-ph-okb');
const okbKey = (page: Page, k: string) => page.locator([...k].length === 1 ? `.wc-okb-page .wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-okb-page .wc-ph-okb-k[data-act="${k}"]`);
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

const PROFILE = '#alias {dr} {drink %1}\n#alias {ff} {flee;flee}\n#action {^You are hungry} {eat bread}\n#highlight {orc} {light red}\n';
const SCRIPT = '-- @name     varning\n-- @version  1\n-- @api      1\n-- @setting  warn number 5 0..30 unit min "Warn before the end"\n-- @setting  word string hello "What to say"\n\nlocal seen = 0\n';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openStart(page: Page): Promise<void> {
  await pinDemoClock(page);
  await page.goto('/?kbd=en');
  await expect(start(page).locator('.wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
}

async function seed(page: Page): Promise<void> {
  await page.evaluate(
    async ([profile, script]) => {
      const w = window.__wc!;
      await w.shell.profiles.init();
      await w.shell.profiles.create('gimli', profile!);
      await w.shell.scripts!.init();
      await w.shell.scripts!.create('varning', script!);
      const lib = await (w as unknown as { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> }).runs();
      await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
    },
    [PROFILE, SCRIPT],
  );
}

const menu = (page: Page, key: string) => start(page).locator(`.wc-sm-item[data-key="${key}"]`).tap();

/** The bottom of the room: our keyboard's top edge when it is up, else the screen's. */
async function floor(page: Page): Promise<number> {
  return (await okb(page).isVisible()) ? (await okb(page).boundingBox())!.y : page.viewportSize()!.height;
}

/**
 * The guard of a page: no sideways scroll; each of `main` visible and whole
 * inside the screen, above the keyboard; every glass button, Back and kit
 * option shown in `scope` at least 44 px high (icon buttons as wide). The
 * sizes are the layout's (a dialog is drawn a little smaller while it comes in).
 */
async function guard(page: Page, scope: Locator, main: Locator[]): Promise<void> {
  await frames(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'no sideways scroll').toBeLessThanOrEqual(0);
  const v = page.viewportSize()!;
  const bottom = await floor(page);
  for (const l of main) {
    await expect(l).toBeVisible();
    const b = (await l.boundingBox())!;
    const what = await l.evaluate((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}[${el.getAttribute('data-btn') ?? ''}]`);
    expect(b.x, `${what} left`).toBeGreaterThanOrEqual(-0.5);
    expect(b.x + b.width, `${what} right`).toBeLessThanOrEqual(v.width + 0.5);
    expect(b.y, `${what} top`).toBeGreaterThanOrEqual(-0.5);
    expect(b.y + b.height, `${what} bottom`).toBeLessThanOrEqual(bottom + 0.5);
  }
  const low = await scope.evaluate(
    (root, min) =>
      [...root.querySelectorAll<HTMLElement>('.wc-lk-btn, .wc-lk-back, .wc-lk-opt, .wc-lk-tab')]
        .filter((el) => !el.closest('[hidden]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
        .map((el) => ({ id: `${el.className.split(' ')[0]}[${el.getAttribute('data-btn') ?? el.getAttribute('data-opt') ?? el.textContent}]`, w: el.offsetWidth, h: el.offsetHeight, icon: el.classList.contains('is-icon') }))
        .filter((e) => e.h < min || (e.icon && e.w < min))
        .map((e) => `${e.id} ${e.w}x${e.h}`),
    TARGET,
  );
  expect(low, 'targets under 44 px').toEqual([]);
}

/** An element's layout height (not what a running transform draws). */
const high = (l: Locator): Promise<number> => l.evaluate((el) => (el as HTMLElement).offsetHeight);

const btn = (scope: Locator, id: string) => scope.locator(`.wc-lk-btn[data-btn="${id}"]:visible`).first();

for (const [name, viewport] of [
  ['portrait 820 × 1180', PORTRAIT],
  ['landscape 1180 × 820', LANDSCAPE],
] as const) {
  test.describe(`the menu pages on a tablet, ${name}`, () => {
    test.use({ viewport });

    test('the start page and Profile: the list, its dialogs with our keyboard, Import', async ({ page }) => {
      const errors = watchErrors(page);
      await openStart(page);
      await seed(page);
      const f = start(page);
      await guard(page, f, [f.locator('.wc-sm-item[data-key="enter"]'), f.locator('.wc-sm-item[data-key="about"]')]);

      await menu(page, 'profile');
      const row = f.locator('.wc-pl-row[data-name="gimli"]');
      await row.tap();
      await guard(page, f, [f.locator('.wc-lk-back'), btn(row, 'SELECT'), btn(row, 'EDIT'), btn(row, 'RENAME'), btn(row, 'DELETE'), btn(f, 'NEW'), btn(f, 'IMPORT'), btn(f, 'EXPORT')]);

      // The fix: a tablet's glass buttons are the desktop's (12 px type; 10.5 px the small ones), 44 px high.
      const imp = btn(f, 'IMPORT');
      const size = await imp.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size).toBeGreaterThanOrEqual(10.5);
      expect((await imp.boundingBox())!.height).toBeGreaterThanOrEqual(TARGET);
      expect((await f.locator('.wc-lk-back').boundingBox())!.height).toBeGreaterThanOrEqual(TARGET);

      // New: the name dialog with our keyboard up; the field and its buttons stay above it.
      await btn(f, 'NEW').tap();
      const dlg = page.locator('.wc-lk-dialog').first();
      await expect(dlg.locator('input')).toBeFocused();
      await expect(okb(page)).toBeVisible();
      for (const k of ['f', 'r', 'o']) await okbKey(page, k).tap();
      await expect(dlg.locator('input')).toHaveValue('fro');
      await guard(page, dlg, [dlg.locator('input'), btn(dlg, 'OK'), btn(dlg, 'CANCEL')]);
      await btn(dlg, 'OK').tap();
      const how = page.locator('.wc-lk-dialog[data-dlg="new-how"]');
      await guard(page, how, [how.locator('.wc-lk-row[data-k="blank"]'), how.locator('.wc-lk-row[data-k="copy"]'), btn(how, 'BACK')]);
      expect(await high(how.locator('.wc-lk-row[data-k="copy"]'))).toBeGreaterThanOrEqual(TARGET);
      await how.locator('.wc-lk-row[data-k="copy"]').tap();
      await guard(page, page.locator('.wc-lk-dialog').last(), [btn(page.locator('.wc-lk-dialog').last(), 'BACK')]);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(page.locator('.wc-lk-dialog')).toHaveCount(0);

      // Rename and Delete (the row is still the chosen one, with its buttons).
      await expect(row).toBeVisible();
      if (!(await btn(row, 'RENAME').isVisible())) await row.tap();
      await btn(row, 'RENAME').tap();
      const ren = page.locator('.wc-lk-dialog').first();
      await guard(page, ren, [ren.locator('input'), btn(ren, 'OK'), btn(ren, 'CANCEL')]);
      await btn(ren, 'CANCEL').tap();
      await btn(row, 'DELETE').tap();
      const del = page.locator('.wc-lk-dialog').first();
      await guard(page, del, [btn(del, 'YES'), btn(del, 'CANCEL')]);
      await btn(del, 'CANCEL').tap();

      // Import: the page with its drop zone and the formats.
      await btn(f, 'IMPORT').tap();
      await guard(page, f, [f.locator('.wc-lk-back'), btn(f, 'CHOOSE'), f.locator('.wc-imp-fmts > li').last()]);
      expect(errors).toEqual([]);
    });

    test('the profile editor: Lite, a field with our keyboard, the Editor, Help', async ({ page }) => {
      const errors = watchErrors(page);
      await openStart(page);
      await seed(page);
      const f = start(page);
      await menu(page, 'profile');
      const row = f.locator('.wc-pl-row[data-name="gimli"]');
      await row.tap();
      await btn(row, 'EDIT').tap();
      const pe = page.locator('.wc-frame:not([hidden]) .wc-pe').first();
      await expect(pe).toHaveAttribute('data-view', 'lite');
      const views = pe.locator('.wc-pe-views');
      await pe.locator('[data-rail="alias"]').tap();
      await guard(page, pe, [views.locator('[data-opt="lite"]'), views.locator('[data-opt="help"]'), pe.locator('[data-rail="action"]'), pe.locator('[data-rail="substitute"]'), pe.locator('.wc-pe-row').first(), btn(pe, 'NEW'), btn(pe, 'DELETE')]);
      // The kinds (a rail or a tab row) are 44 px targets.
      expect((await pe.locator('[data-rail="alias"]').boundingBox())!.height).toBeGreaterThanOrEqual(TARGET);
      // The entry's fields beside the list (two columns at least), and the body with our keyboard up.
      await pe.locator('.wc-pe-row').first().tap();
      const body = pe.locator('[data-field="body"] textarea');
      const list = (await pe.locator('.wc-pe-row').first().boundingBox())!;
      expect((await body.boundingBox())!.x).toBeGreaterThan(list.x + list.width - 1);
      await body.tap();
      await expect(okb(page)).toBeVisible();
      await okbKey(page, 'x').tap();
      await expect(body).toHaveValue('drink %1x');
      await guard(page, pe, [body, pe.locator('[data-field="pattern"] input'), btn(pe, 'NEW')]);
      await okbKey(page, 'fold').tap();
      await expect(okb(page)).toBeHidden();

      // The Editor: our keyboard up, the caret's line and Save above it.
      await views.locator('[data-opt="editor"]').tap();
      await expect(pe.locator('.cm-content')).toBeVisible();
      const sc = (await pe.locator('.cm-scroller').boundingBox())!;
      await page.touchscreen.tap(sc.x + sc.width / 2, sc.y + 40);
      await expect(okb(page)).toBeVisible();
      await okbKey(page, 'k').tap();
      await guard(page, pe, [pe.locator('.cm-activeLine').first(), btn(pe, 'SAVE'), btn(pe, 'FIND'), views.locator('[data-opt="editor"]')]);
      await okbKey(page, 'back').tap();
      await okbKey(page, 'fold').tap();

      // Help.
      await views.locator('[data-opt="help"]').tap();
      await expect(pe).toHaveAttribute('data-view', 'help');
      await guard(page, pe, [views.locator('[data-opt="help"]'), btn(pe, 'FIND')]);
      expect(errors).toEqual([]);
    });

    test('Scripts: the page with a script and its settings, the editor with our keyboard, the manual', async ({ page }) => {
      const errors = watchErrors(page);
      await openStart(page);
      await seed(page);
      const f = start(page);
      await menu(page, 'scripts');
      await f.locator('.wc-scr-row[data-name="varning"] .wc-scr-name').tap();
      // The list and the panel side by side (the desktop's arrangement fits).
      const idx = (await f.locator('.wc-scr-row[data-name="varning"]').boundingBox())!;
      const panel = f.locator('.wc-scr-panel');
      expect((await panel.boundingBox())!.x).toBeGreaterThan(idx.x + idx.width - 1);
      await guard(page, f, [f.locator('.wc-lk-back'), btn(panel, 'EDIT'), btn(panel, 'EXPORT'), btn(panel, 'RENAME'), btn(panel, 'DELETE'), f.locator('.wc-scr-set[data-set="warn"]'), btn(f, 'NEW'), btn(f, 'IMPORT'), btn(f, 'MANUAL')]);
      // A number setting typed on our keys: the field stays above the keyboard.
      const warn = f.locator('.wc-scr-set[data-set="warn"]');
      expect((await warn.locator('.wc-scr-val').boundingBox())!.height).toBeGreaterThanOrEqual(TARGET);
      await warn.locator('.wc-scr-val').tap();
      const input = warn.locator('input.wc-scr-input');
      await expect(input).toBeFocused();
      await expect(okb(page)).toBeVisible();
      await guard(page, f, [input]);
      await okbKey(page, 'esc').tap();

      // The editor: a tap in the code brings our keyboard; the caret's line and the tools stay in view.
      await btn(panel, 'EDIT').tap();
      const ed = page.locator('.wc-frame:not([hidden]) > .wc-sed');
      await expect(ed.locator('.cm-content')).toBeVisible();
      const sc = (await ed.locator('.cm-scroller').boundingBox())!;
      await page.touchscreen.tap(sc.x + sc.width / 2, sc.y + 40);
      await expect(okb(page)).toBeVisible();
      await okbKey(page, 'x').tap();
      await guard(page, ed, [ed.locator('.cm-activeLine').first(), btn(ed.locator('.wc-sed-tools'), 'SAVE'), btn(ed.locator('.wc-sed-tools'), 'FIND'), btn(ed.locator('.wc-sed-tools'), 'MANUAL')]);
      await okbKey(page, 'back').tap();
      await okbKey(page, 'fold').tap();
      await expect(okb(page)).toBeHidden();

      // The manual: the contents beside the text.
      await btn(ed.locator('.wc-sed-tools'), 'MANUAL').tap();
      const man = page.locator('.wc-frame:not([hidden]) .wc-sman').first();
      await expect(man.locator('.wc-lk-mtext')).toBeVisible();
      const toc = man.locator('.wc-lk-mtoc li').first();
      await expect(toc).toBeVisible();
      expect((await toc.boundingBox())!.height).toBeGreaterThanOrEqual(TARGET);
      expect((await man.locator('.wc-lk-mtext').boundingBox())!.x).toBeGreaterThan((await toc.boundingBox())!.x + 100);
      await guard(page, man, [toc, man.locator('.wc-lk-mfind input')]);
      expect(errors).toEqual([]);
    });

    test('History: the table and the card, Stats, Rate, Delete, the run log, Export with our keyboard', async ({ page }) => {
      const errors = watchErrors(page);
      await openStart(page);
      await seed(page);
      const f = start(page);
      await menu(page, 'history');
      const hist = f.locator('.wc-hist');
      await expect(hist.locator('.wc-lk-tr')).toHaveCount(3);
      await hist.locator('.wc-lk-tr').nth(1).tap();
      const card = hist.locator('.wc-hist-card');
      // The card beside the table (the desktop's arrangement), every action a 44 px target.
      const tr = (await hist.locator('.wc-lk-tr').nth(1).boundingBox())!;
      expect((await card.boundingBox())!.x).toBeGreaterThan(tr.x + tr.width - 1);
      expect(tr.height).toBeGreaterThanOrEqual(TARGET - 3.5);
      await guard(page, hist, [hist.locator('.wc-lk-back'), ...['RUN LOG', 'STATS', 'RATE', 'EXPORT', 'DELETE'].map((id) => btn(card, id)), btn(hist, 'BACKUP'), btn(hist, 'RESTORE')]);

      await btn(card, 'RATE').tap();
      const rate = page.locator('.wc-lk-dialog[data-dlg="rate"]');
      await guard(page, rate, [rate.locator('.wc-hd-stars > button[data-v="1"]'), rate.locator('.wc-hd-stars > button[data-v="5"]'), btn(rate, 'SAVE'), btn(rate, 'CANCEL')]);
      await btn(rate, 'CANCEL').tap();
      await btn(card, 'DELETE').tap();
      const del = page.locator('.wc-lk-dialog[data-dlg="delete"]');
      await guard(page, del, [btn(del, 'DELETE'), btn(del, 'CANCEL')]);
      await btn(del, 'CANCEL').tap();

      await btn(card, 'STATS').tap();
      const stats = f.locator('.wc-hs');
      await expect(stats).toBeVisible();
      await guard(page, f, [f.locator('.wc-lk-back'), stats.locator('.wc-lk-tbl').first(), stats.locator('.wc-lk-tbl').nth(1)]);
      await f.locator('.wc-lk-back').first().tap();

      // The run log plays in its box (the phone's player).
      await btn(card, 'RUN LOG').tap();
      const player = page.locator('.wc-player');
      await expect(player.locator('.wc-ph-layer')).toBeVisible();
      await guard(page, player, [page.locator('.wc-player-box [data-act="play"]'), page.locator('.wc-player-box [data-act="display"]')]);
      for (const act of ['play', 'display']) {
        const b = (await page.locator(`.wc-player-box [data-act="${act}"]`).boundingBox())!;
        expect(b.height, act).toBeGreaterThanOrEqual(TARGET);
      }
      await page.keyboard.press('Escape');
      await expect(player).toHaveCount(0);

      // Export: the head's actions, the foot, and a comment typed above our keyboard.
      await btn(card, 'EXPORT').tap();
      const exp = f.locator('.wc-exp');
      await expect(exp).toBeVisible();
      await guard(page, f, [f.locator('.wc-lk-back'), btn(f, 'EXCLUDE'), btn(f, 'COMMENT'), btn(f, 'TITLE'), btn(f, 'EXPORT')]);
      await btn(f, 'TITLE').tap();
      const title = f.locator('.wc-exp-file.is-edit input');
      await expect(title).toBeFocused();
      await expect(okb(page)).toBeVisible();
      expect((await title.boundingBox())!.height).toBeGreaterThanOrEqual(TARGET);
      await guard(page, f, [title, btn(f.locator('.wc-exp-file'), 'SAVE'), btn(f.locator('.wc-exp-file'), 'CANCEL')]);
      await btn(f.locator('.wc-exp-file'), 'CANCEL').tap();
      await btn(f, 'COMMENT').tap();
      const comment = f.locator('.wc-exp-comp textarea');
      await expect(comment).toBeFocused();
      await okbKey(page, 'h').tap();
      await guard(page, f, [comment, btn(f.locator('.wc-exp-comp'), 'SAVE'), btn(f.locator('.wc-exp-comp'), 'CANCEL')]);
      expect(errors).toEqual([]);
    });

    test('Spotlights, Credits and About', async ({ page }) => {
      const errors = watchErrors(page);
      await openStart(page);
      await seed(page);
      const f = start(page);
      await menu(page, 'spotlights');
      const wall = f.locator('.wc-spw');
      const cards = wall.locator('.wc-spw-card');
      await expect(cards).toHaveCount(5);
      // More than one column of cards.
      const c0 = (await cards.nth(0).boundingBox())!;
      const c1 = (await cards.nth(1).boundingBox())!;
      expect(c1.x).toBeGreaterThan(c0.x + c0.width - 1);
      await guard(page, f, [f.locator('.wc-lk-back'), cards.nth(0), cards.nth(4), wall.locator('.wc-spw-kinds [data-opt="pkill"]'), btn(f, 'PLAY')]);

      await cards.nth(1).tap();
      const viewer = page.locator('.wc-spv');
      await expect(viewer.locator('.wc-output')).toContainText('Achievement unlocked', { timeout: 15000 });
      const ctl = viewer.locator('.wc-spv-ctl');
      await guard(page, viewer, [ctl.locator('[data-act="play"]'), ctl.locator('[data-act="start"]'), ctl.locator('[data-act="faster"]'), ctl.locator('[data-btn="display"]'), viewer.locator('.wc-spv-nav [data-btn="next"]')]);
      for (const act of ['play', 'start', 'back', 'fwd']) {
        const b = (await ctl.locator(`[data-act="${act}"]`).boundingBox())!;
        expect(Math.min(b.width, b.height), act).toBeGreaterThanOrEqual(TARGET);
      }
      await page.locator('.wc-start .wc-frame:not([hidden]) .wc-lk-back').first().tap();
      await expect(viewer).toHaveCount(0);
      await page.locator('.wc-start .wc-frame:not([hidden]) .wc-lk-back').first().tap();
      await expect(f.locator('.wc-sm-item.is-sel .wc-sm-label')).toHaveText('Spotlights');

      await menu(page, 'credits');
      const cred = f.locator('.wc-cred');
      await expect(cred.locator('.wc-cred-ch').first()).toBeVisible();
      await guard(page, f, [f.locator('.wc-lk-back'), cred.locator('.wc-cred-pills .wc-lk-opt').first(), cred.locator('.wc-cred-pages')]);
      // An open book: two pages side by side.
      await expect(cred.locator('.wc-cred-folio.is-r')).toBeVisible();
      await f.locator('.wc-lk-back').tap();

      await menu(page, 'about');
      const rail = f.locator('.wc-about-rail .wc-about-row');
      await expect(rail.first()).toBeVisible();
      for (const r of [rail.first(), rail.last()]) expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(TARGET);
      await guard(page, f, [f.locator('.wc-lk-back'), rail.first(), rail.last()]);
      await rail.last().tap();
      await expect(rail.last()).toHaveClass(/\bis-on\b/);
      expect(errors).toEqual([]);
    });

    test('from the game: the menu sheet, Settings and its sub-pages, Exit session, Profile and Scripts', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/?replay&kbd=en');
      await expect(page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad')).toBeVisible();
      await seed(page);
      const v = page.viewportSize()!;
      const inside = async (l: Locator, min = TARGET): Promise<void> => {
        await expect(l).toBeVisible();
        const b = (await l.boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(-0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(v.width + 0.5);
        expect(b.y).toBeGreaterThanOrEqual(-0.5);
        expect(b.y + b.height).toBeLessThanOrEqual(v.height + 0.5);
        expect(b.height).toBeGreaterThanOrEqual(min);
      };
      const noSide = async (): Promise<void> => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

      await page.locator('.wc-ph-menu').tap();
      const sheet = page.locator('.wc-ph-sheet');
      for (const r of ['reconnect', 'profile', 'scripts', 'settings', 'exit', 'close']) await inside(sheet.locator(`[data-row="${r}"]`));
      await noSide();

      // Exit session: the confirmation, Cancel and Exit.
      await sheet.locator('[data-row="exit"]').tap();
      const exit = page.locator('.wc-ph-exitsheet');
      for (const b of await exit.locator('button:visible').all()) {
        if ((await b.getAttribute('class'))?.includes('wc-ph-rate-clear')) continue;
        await inside(b, 40);
      }
      await noSide();
      await exit.getByRole('button', { name: 'Cancel' }).tap();
      await expect(exit).toHaveCount(0);

      // Settings: the page scrolls by touch to its last group; a sub-page and a list open and go back.
      if (!(await sheet.isVisible())) await page.locator('.wc-ph-menu').tap();
      await sheet.locator('[data-row="settings"]').tap();
      const sp = page.locator('.wc-ph-page');
      await expect(sp).toHaveAttribute('data-page', 'settings');
      await inside(sp.locator('[data-row="font"]'));
      await noSide();
      await sp.locator('[data-group="connection"]').scrollIntoViewIfNeeded();
      await inside(sp.locator('[data-group="connection"] .wc-ph-srow').last(), 40);
      await sp.locator('[data-row="timers-group"]').scrollIntoViewIfNeeded();
      await sp.locator('[data-row="timers-group"]').tap();
      await expect(sp).toHaveAttribute('data-page', 'sub:timers-group');
      await noSide();
      await sp.locator('[data-row="group-npcs"]').scrollIntoViewIfNeeded();
      await sp.locator('[data-row="group-npcs"]').tap();
      await expect(sp).toHaveAttribute('data-page', 'pick:group-npcs');
      await noSide();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(sp).toHaveCount(0);

      // Profile from the sheet: the editor in the menu's box, its buttons 44 px.
      if (!(await sheet.isVisible())) await page.locator('.wc-ph-menu').tap();
      await sheet.locator('[data-row="profile"]').tap();
      const pe = over(page).locator('.wc-pe');
      await expect(pe).toBeVisible();
      await guard(page, over(page), [over(page).locator('.wc-lk-back'), pe.locator('.wc-pe-views [data-opt="editor"]'), btn(pe, 'NEW')]);
      await over(page).locator('.wc-lk-back').tap();
      await expect(page.locator('.wc-overlay')).toBeHidden();

      // Scripts from the sheet.
      await page.locator('.wc-ph-menu').tap();
      await sheet.locator('[data-row="scripts"]').tap();
      const scr = over(page);
      await scr.locator('.wc-scr-row[data-name="varning"] .wc-scr-name').tap();
      await guard(page, scr, [scr.locator('.wc-lk-back'), btn(scr.locator('.wc-scr-panel'), 'EDIT'), btn(scr, 'NEW'), btn(scr, 'MANUAL')]);
      expect(errors).toEqual([]);
    });
  });
}

test('a phone-size window keeps the phone\'s compact buttons (10 px type, no icons, 40 px targets)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStart(page);
  await seed(page);
  const f = start(page);
  await menu(page, 'history');
  const hist = f.locator('.wc-hist');
  await hist.locator('.wc-lk-tr').nth(1).tap();
  const b = btn(hist.locator('.wc-hist-card'), 'STATS');
  expect(await b.evaluate((el) => getComputedStyle(el).fontSize)).toBe('10px');
  expect((await b.boundingBox())!.height).toBe(40);
  await expect(b.locator('.wc-lk-ic')).toBeHidden();
  expect((await hist.locator('.wc-lk-back').boundingBox())!.height).toBe(40);
});

test.describe('a tablet\'s buttons', () => {
  test.use({ viewport: PORTRAIT });
  test('are the desktop\'s with their icons, 44 px high', async ({ page }) => {
    await openStart(page);
    await seed(page);
    const f = start(page);
    await menu(page, 'history');
    const hist = f.locator('.wc-hist');
    await hist.locator('.wc-lk-tr').nth(1).tap();
    const b = btn(hist.locator('.wc-hist-card'), 'STATS');
    expect(parseFloat(await b.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThan(10);
    expect((await b.boundingBox())!.height).toBe(TARGET);
    await expect(b.locator('.wc-lk-ic')).toBeVisible();
    expect((await hist.locator('.wc-lk-back').boundingBox())!.height).toBe(TARGET);
  });
});

// ------------------------------------------------------------ round 56c
//
// Six layout fixes of a tablet-size window (stage 56c): the start menu in
// the middle of a tall window with the desktop's rows (T1), Help's rail and
// the manual's text column in the middle of its room (T2), the script
// editor's named tools row and its completion list under the caret's line
// (T3), the run log's header left of the hood plate (T4, a phone too), the
// game's menu sheet and settings in a 720 px column (T5), and a dialog in
// the middle of the room above our keyboard (T6).

const box = async (l: Locator) => (await l.boundingBox())!;
const COLUMN = 720;

/**
 * The text column of a manual reader stands in the middle of its room: as
 * much room left of its widest paragraph in view as right of it (within the
 * reader's own padding and scrollbar), and the paragraph keeps its measure.
 */
async function centred(text: Locator): Promise<void> {
  await expect(text.locator('p').first()).toBeVisible();
  const m = await text.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const p = [...el.querySelectorAll('p')].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && b.bottom > r.top && b.top < r.bottom);
    const widest = p.reduce((a, b) => (b.width > a.width ? b : a), p[0]!);
    return { left: widest.left - r.left, right: r.right - widest.right, width: widest.width };
  });
  expect(m.width).toBeLessThanOrEqual(COLUMN);
  expect(Math.abs(m.left - m.right), `left ${m.left}, right ${m.right}`).toBeLessThanOrEqual(40);
}

/** History's run log in its box: the header's chip ends left of the box's hood plate, cut with an ellipsis. */
async function headerClearOfHood(page: Page): Promise<void> {
  const f = start(page);
  await menu(page, 'history');
  const hist = f.locator('.wc-hist');
  await hist.locator('.wc-lk-tr').nth(1).tap();
  await btn(hist.locator('.wc-hist-card'), 'RUN LOG').tap();
  const player = page.locator('.wc-player');
  await expect(player.locator('.wc-ph-layer')).toBeVisible();
  const chip = player.locator('.wc-player-head-left');
  await expect(chip).toBeVisible();
  const hood = page.locator('.wc-lk-box:has(.wc-player) > .wc-lk-hood');
  await expect(hood).toBeVisible();
  await expect
    .poll(async () => {
      const c = await box(chip);
      const h = await box(hood);
      return c.x + c.width <= h.x && c.width > 40;
    })
    .toBe(true);
  expect(await chip.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');
  await expect(chip.locator('.wc-player-name')).toBeVisible();
}

for (const [name, viewport] of [
  ['portrait 820 × 1180', PORTRAIT],
  ['landscape 1180 × 820', LANDSCAPE],
] as const) {
  const upright = viewport.height > viewport.width;
  test.describe(`round 56c on a tablet, ${name}`, () => {
    test.use({ viewport });

    test('T1: the start menu stands in the middle, with the desktop\'s rows, where the first paint drew it', async ({ page }) => {
      await pinDemoClock(page);
      // The first paint's wordmark and panel are where the start page's are (within 1 px).
      await checkHandOver(page, '?kbd=en');
      await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
      const f = start(page);
      await expect(f.locator('.wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
      // The desktop's rows and panel.
      expect((await box(f.locator('.wc-sm-item[data-key="about"]'))).height).toBe(42);
      expect((await box(f.locator('.wc-sm-item[data-key="enter"]'))).height).toBe(56);
      expect((await box(f.locator('.wc-sm-panel'))).height).toBeCloseTo(399, 0);
      // What is seen (the mark, the panel, the quote) is inside the window, and upright it is
      // in the middle: the sky above and below differ by 80 px at most (a quote is two or three lines).
      const mark = page.locator('.wc-start .wc-start-brand [data-wcw="iron"]');
      const m = await box(mark);
      const quote = await box(f.locator('.wc-sm-quote'));
      const above = m.y;
      const below = viewport.height - (quote.y + quote.height);
      expect(above).toBeGreaterThan(0);
      expect(below).toBeGreaterThan(0);
      if (upright) expect(Math.abs(above - below), `above ${above}, below ${below}`).toBeLessThanOrEqual(80);
      // A page opens from the menu, and the menu and the wordmark come back to the same place.
      const panel = await box(f.locator('.wc-sm-panel'));
      await menu(page, 'about');
      await expect(f.locator('.wc-about-rail .wc-about-row').first()).toBeVisible();
      await f.locator('.wc-lk-back').tap();
      await expect(f.locator('.wc-sm-item.is-sel .wc-sm-label')).toHaveText('About');
      await expect.poll(async () => Math.abs((await box(f.locator('.wc-sm-panel'))).y - panel.y)).toBeLessThanOrEqual(0.5);
      await expect.poll(async () => Math.abs((await box(mark)).y - m.y)).toBeLessThanOrEqual(0.5);
    });

    test('T2: Help has its contents rail beside the text, and the text column stands in the middle of its room', async ({ page }) => {
      const errors = watchErrors(page);
      await openStart(page);
      await seed(page);
      const f = start(page);
      await menu(page, 'profile');
      const row = f.locator('.wc-pl-row[data-name="gimli"]');
      await row.tap();
      await btn(row, 'EDIT').tap();
      const pe = page.locator('.wc-frame:not([hidden]) .wc-pe').first();
      await pe.locator('.wc-pe-views [data-opt="help"]').tap();
      await expect(pe).toHaveAttribute('data-view', 'help');
      const text = pe.locator('.wc-lk-mtext');
      // The rail with the headings, not the dropdown.
      const items = pe.locator('.wc-pe-hcont .wc-lk-mtoc li');
      await expect(items.first()).toBeVisible();
      await expect(pe.locator('.wc-pe-hsel')).toBeHidden();
      const it = await box(items.first());
      expect(it.height).toBeGreaterThanOrEqual(TARGET);
      expect((await box(text)).x).toBeGreaterThan(it.x + 100);
      await centred(text);
      // A heading of the rail takes the text there.
      await items.nth(3).tap();
      await expect(items.nth(3)).toHaveClass(/\bis-on\b/);
      await centred(text);
      expect(errors).toEqual([]);
    });

    test('T2: the script manual\'s text column stands in the middle of its room', async ({ page }) => {
      await openStart(page);
      const f = start(page);
      await menu(page, 'scripts');
      await btn(f, 'MANUAL').tap();
      const man = page.locator('.wc-frame:not([hidden]) .wc-sman').first();
      await expect(man.locator('.wc-lk-mtoc li').first()).toBeVisible();
      await centred(man.locator('.wc-lk-mtext'));
    });

    test('T3: the script editor has a row of named tools above the code; the completion list does not cover the line typed', async ({ page }) => {
      const errors = watchErrors(page);
      await openStart(page);
      await seed(page);
      const f = start(page);
      await menu(page, 'scripts');
      await f.locator('.wc-scr-row[data-name="varning"] .wc-scr-name').tap();
      await btn(f.locator('.wc-scr-panel'), 'EDIT').tap();
      const ed = page.locator('.wc-frame:not([hidden]) > .wc-sed');
      await expect(ed.locator('.cm-content')).toBeVisible();
      const tools = ed.locator('.wc-sed-tools');
      await expect(tools).toHaveClass(/\bis-row\b/);
      for (const [id, label] of [
        ['SAVE', 'Save'],
        ['FIND', 'Find'],
        ['MANUAL', 'Manual'],
      ] as const) {
        await expect(btn(tools, id)).toHaveText(label);
        await expect(btn(tools, id).locator('.wc-lk-ic')).toBeVisible();
        expect((await box(btn(tools, id))).height).toBeGreaterThanOrEqual(TARGET);
      }
      // The row is above the code, inside the box's window, clear of the hood plate.
      const buf = ed.locator('.wc-sed-buf');
      const t = await box(tools);
      const well = await box(buf);
      expect(t.y + t.height).toBeLessThanOrEqual(well.y + 0.5);
      expect(t.x + t.width).toBeLessThanOrEqual(well.x + well.width + 0.5);
      const hood = await box(ed.locator('.wc-lk-box > .wc-lk-hood'));
      // (Upright it has a strip of its own under the head: a long name on the plate would reach it.)
      expect(t.x > hood.x + hood.width || t.y >= hood.y + hood.height).toBe(true);
      if (!upright) expect(t.x).toBeGreaterThan(hood.x + hood.width);
      expect(t.y).toBeGreaterThanOrEqual((await box(ed.locator('.wc-sed-win'))).y);

      // Typed on our keyboard at the end of the script: the list opens under the caret's line, above the keys.
      const sc = await box(ed.locator('.cm-scroller'));
      await page.touchscreen.tap(sc.x + sc.width / 2, sc.y + 40);
      await expect(okb(page)).toBeVisible();
      await page.keyboard.press('ControlOrMeta+End');
      for (const k of ['enter', 's', 'e']) await okbKey(page, k).tap();
      const list = page.locator('.cm-tooltip-autocomplete');
      await expect(list).toBeVisible();
      await frames(page);
      const line = await box(ed.locator('.cm-activeLine').first());
      const l = await box(list);
      const kb = await box(okb(page));
      expect(l.y + l.height).toBeLessThanOrEqual(kb.y + 0.5);
      // (It hangs from the glyphs, a few px inside the line box's leading.)
      expect(l.y).toBeGreaterThanOrEqual(line.y + line.height - 4);
      // The tools are still whole above the code, and Save is lit.
      await expect(btn(tools, 'SAVE')).not.toHaveClass(/\bis-disabled\b/);
      const t2 = await box(tools);
      expect(t2.y + t2.height).toBeLessThanOrEqual((await box(buf)).y + 0.5);
      expect(errors).toEqual([]);
    });

    test('T4: the run log\'s header ends left of the hood plate', async ({ page }) => {
      await openStart(page);
      await seed(page);
      await headerClearOfHood(page);
    });

    test('T5: the game\'s menu sheet, Exit session and the settings pages are a centred column of 720 px', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/?replay&kbd=en');
      await expect(page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad')).toBeVisible();
      const column = async (l: Locator): Promise<void> => {
        await expect(l).toBeVisible();
        const b = await box(l);
        expect(b.width).toBeLessThanOrEqual(COLUMN + 0.5);
        expect(b.width).toBeGreaterThanOrEqual(COLUMN - 40);
        expect(Math.abs(b.x - (viewport.width - (b.x + b.width)))).toBeLessThanOrEqual(1);
      };
      await page.locator('.wc-ph-menu').tap();
      const sheet = page.locator('.wc-ph-sheet:not(.wc-ph-exitsheet)');
      await column(sheet.locator('.wc-ph-rows'));
      await column(sheet.locator('.wc-ph-status'));
      // The sheet's ground is still the screen's whole bottom edge.
      expect((await box(sheet)).width).toBe(viewport.width);
      const exitRow = await box(sheet.locator('[data-row="exit"]'));
      const closeRow = await box(sheet.locator('[data-row="close"]'));
      expect(Math.max(exitRow.x + exitRow.width, closeRow.x + closeRow.width) - Math.min(exitRow.x, closeRow.x)).toBeLessThanOrEqual(COLUMN + 0.5);

      await sheet.locator('[data-row="exit"]').tap();
      const exit = page.locator('.wc-ph-exitsheet');
      await column(exit.locator('.wc-ph-exit-card'));
      await exit.getByRole('button', { name: 'Cancel' }).tap();
      await expect(exit).toHaveCount(0);

      if (!(await sheet.isVisible())) await page.locator('.wc-ph-menu').tap();
      await sheet.locator('[data-row="settings"]').tap();
      const sp = page.locator('.wc-ph-page');
      await expect(sp).toHaveAttribute('data-page', 'settings');
      await column(sp.locator('.wc-ph-grp').first());
      await sp.locator('[data-row="font"]').tap();
      await expect(sp).toHaveAttribute('data-page', 'pick:font');
      await column(sp.locator('.wc-ph-col > *').first());
      await page.keyboard.press('Escape');
      await expect(sp).toHaveAttribute('data-page', 'settings');
      await sp.locator('[data-row="timers-group"]').scrollIntoViewIfNeeded();
      await sp.locator('[data-row="timers-group"]').tap();
      await expect(sp).toHaveAttribute('data-page', 'sub:timers-group');
      await column(sp.locator('.wc-ph-grp').first());
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });

    test('T6: a dialog with our keyboard up stands in the middle of the room above it; without it, over its page', async ({ page }) => {
      const errors = watchErrors(page);
      await openStart(page);
      await seed(page);
      const f = start(page);
      await menu(page, 'profile');
      const row = f.locator('.wc-pl-row[data-name="gimli"]');
      await row.tap();
      await btn(f, 'NEW').tap();
      const dlg = page.locator('.wc-lk-dialog').first();
      await expect(dlg.locator('input')).toBeFocused();
      await expect(okb(page)).toBeVisible();
      for (const k of ['f', 'r', 'o']) await okbKey(page, k).tap();
      await expect(dlg.locator('input')).toHaveValue('fro');
      const kb = await box(okb(page));
      const middle = async (l: Locator): Promise<number> => {
        const b = await box(l);
        return b.y + b.height / 2;
      };
      // (Polled: the dialog comes in a little smaller.)
      await expect.poll(async () => Math.abs((await middle(dlg)) - kb.y / 2)).toBeLessThanOrEqual(4);
      const d = await box(dlg);
      expect(Math.abs(d.x + d.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(4);
      const field = await box(dlg.locator('input'));
      expect(field.y + field.height).toBeLessThanOrEqual(kb.y);
      const ok = await box(btn(dlg, 'OK'));
      expect(ok.y + ok.height).toBeLessThanOrEqual(kb.y + 0.5);
      await btn(dlg, 'CANCEL').tap();
      await expect(page.locator('.wc-lk-dialog')).toHaveCount(0);

      // Delete has no field: no keyboard, and the dialog is centred over its page's box as before.
      if (!(await btn(row, 'DELETE').isVisible())) await row.tap();
      await btn(row, 'DELETE').tap();
      const del = page.locator('.wc-lk-dialog').first();
      await expect(btn(del, 'YES')).toBeVisible();
      await expect(okb(page)).toBeHidden();
      const under = await middle(page.locator(".wc-start .wc-lk-box:has(.wc-pl-row)").first());
      await expect.poll(async () => Math.abs((await middle(del)) - under)).toBeLessThanOrEqual(4);
      expect(errors).toEqual([]);
    });
  });
}

test('T4 on a phone: the run log\'s header ends left of the hood plate there too', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStart(page);
  await seed(page);
  await headerClearOfHood(page);
});

test('round 56c leaves a phone-size window\'s start menu as it was: at the top, 38 px rows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await pinDemoClock(page);
  await checkHandOver(page, '?kbd=en');
  const f = start(page);
  expect((await box(f.locator('.wc-sm-item[data-key="about"]'))).height).toBe(38);
  expect((await box(f.locator('.wc-sm-panel'))).height).toBeCloseTo(357, 0);
  expect(await page.locator('.wc-start').evaluate((el) => getComputedStyle(el).getPropertyValue('--wc-start-drop').trim())).toBe('0px');
});
