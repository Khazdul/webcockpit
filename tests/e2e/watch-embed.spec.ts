// Stage 74 A (ADR 0163; the owner's report of 2026-11-18: opening a posted
// log from the Community page blinked, and so did Back): a run opened from
// the Community page is the watch page pushed as a frame on the start
// surface. No document is loaded (a mark on `window` survives), the
// surface's morph runs (large box to large box: `swap`), the address and
// the title are the run's while it shows, the replay plays in its sandboxed
// frame and a view is counted. Back (the button, B, Esc, the browser's)
// pops the frame: the Community as it was left (its page and cursor), the
// address and the title put back, no frame left. The browser's Forward
// after it does nothing. The Report dialog over the run goes with it on the
// browser's Back. A reload on the run's address is the standalone page, as
// a bare link is. The embedded page is laid out exactly as the standalone
// one (the same rectangles at three widths), and the frame's fill (a
// browser without element fullscreen) covers the whole surface.
//
// Desktop (Chromium and Firefox); the phone: phone-watch-embed.spec.ts.
// Published runs: published-runs.spec.ts.
import { type Page, expect, test } from '@playwright/test';
import { type CommunitySetup, btnIn, cm, dialog, openCommunity, pager, rows, setUp } from './community';
import { noFrameFullscreen } from './watch-page';
import { docMark, embBox, embBtn, embGone, embPlaying, embReplay, embedded, fillsWindowOnTop, givePayload, mark, morphs, partRects } from './watch-embed';

test.describe.configure({ timeout: 60_000 });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

const runUrl = (id: string): RegExp => new RegExp(`/r/${id}\\?from=community&cloudtest$`);
const START = /\/\?cloudtest&skyHour[^/]*$/;
const cursorId = (page: Page): Promise<string | null> => cm(page).locator('.wc-cy-row.is-cur').getAttribute('data-id');

interface Was {
  title: string;
  mark: number;
  /** The cursor's run. */
  id: string;
  /** The page's runs, in order. */
  ids: string[];
}

/** The Community on page 2 with the cursor moved down twice; the document marked; the cursor's run given a payload that plays. */
async function onPageTwo(page: Page, s: CommunitySetup): Promise<Was> {
  await openCommunity(page);
  await btnIn(cm(page), 'NEXT').click();
  await expect(pager(page)).toHaveText('Page 2 of 3');
  // The page's rows are there before the cursor moves (a new page puts it on its first row).
  await expect(rows(page).first()).toHaveAttribute('data-id', s.runs[10]!);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(rows(page).nth(2)).toHaveClass(/is-cur/);
  await mark(page);
  const id = (await cursorId(page))!;
  const ids = await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-id')!));
  givePayload(s.server, id);
  return { title: await page.title(), mark: (await docMark(page))!, id, ids };
}

/** Back on the Community as it was left: page 2, the cursor's row, the start page's address and title, nothing of the run left, the same document. */
async function backOnCommunity(page: Page, was: Was): Promise<void> {
  await expect(cm(page)).toBeVisible();
  await expect(pager(page)).toHaveText('Page 2 of 3');
  expect(await cursorId(page)).toBe(was.id);
  await expect(page).toHaveURL(START);
  await embGone(page, was.title);
  expect(await docMark(page)).toBe(was.mark);
  await expect(page.locator('.wc-start')).toHaveAttribute('data-lk-box', 'large');
}

test('a run opens over the Community with no page load: the morph, the run’s address and title, the replay, one view; Back returns to the page as it was', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = await setUp(page);
  const was = await onPageTwo(page, s);
  const id = was.id;

  // Enter on the cursor's run.
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(runUrl(id));
  await embPlaying(page);
  expect(await docMark(page), 'no document was loaded').toBe(was.mark);
  expect(await morphs(page), 'the surface morphed from the Community’s box to the run’s').toEqual(['swap']);
  await expect(page).toHaveTitle(`${s.server.pubs.get(id)!.pub.title} · WebCockpit`);
  await expect(embedded(page).locator('[data-watch="title"]')).toHaveText(s.server.pubs.get(id)!.pub.title);
  await expect(embBox(page).locator('.wc-lk-hood-t')).toHaveText('Shared log');
  // The box is a large box's: the surface's margin from the window's edges.
  const box = (await embBox(page).boundingBox())!;
  expect(box.x).toBeGreaterThan(8);
  expect(box.x).toBeLessThan(30);
  expect(Math.abs(box.x + box.width - (1440 - box.x))).toBeLessThan(1);
  expect(Math.abs(box.y + box.height - (900 - box.y))).toBeLessThan(1);
  // The app's root has the watch page's class while the run shows.
  await expect(page.locator('#app')).toHaveClass(/wc-watch-app/);
  // The view, once.
  await expect.poll(() => s.pubs.viewRequests.length).toBe(1);
  expect(s.pubs.viewRequests[0]!.id).toBe(id);

  // Back, the button.
  await embBtn(page, 'BACK').click();
  await backOnCommunity(page, was);
  expect(await morphs(page), 'the morph back').toEqual(['swap']);
  // The page's keys are its own again.
  await page.keyboard.press('ArrowUp');
  expect(await cursorId(page)).toBe(was.ids[was.ids.indexOf(id) - 1]);
  await page.keyboard.press('ArrowDown');

  // A press on the row; then B (outside the replay, which has the keys once it plays).
  await rows(page).nth(was.ids.indexOf(id)).locator('.wc-cy-name').click();
  await expect(page).toHaveURL(runUrl(id));
  await embPlaying(page);
  await embedded(page).locator('[data-watch="title"]').click();
  await page.keyboard.press('b');
  await backOnCommunity(page, was);
  // The view was asked for again (once per mount of the page).
  await expect.poll(() => s.pubs.viewRequests.length).toBe(2);

  // Esc is Back too, as on every sub-page of the start surface.
  await page.keyboard.press('Enter');
  await embPlaying(page);
  await embedded(page).locator('[data-watch="title"]').click();
  await page.keyboard.press('Escape');
  await backOnCommunity(page, was);
  expect(errors).toEqual([]);
});

test('the browser’s Back pops the run (the Report dialog with it); Forward after it does nothing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = await setUp(page);
  const was = await onPageTwo(page, s);
  const id = was.id;
  await page.keyboard.press('Enter');
  await embPlaying(page);
  await page.goBack();
  await backOnCommunity(page, was);
  // Forward: the run's entry has no frame any more; the page steps back to its own address.
  await page.goForward();
  await expect(page).toHaveURL(START);
  await expect(cm(page)).toBeVisible();
  await expect(page.locator('.wc-watch-page')).toHaveCount(0);
  expect(await docMark(page)).toBe(was.mark);

  // The Report dialog (a guest's) over the run: its own Close keeps the run; the browser's Back takes both.
  await page.keyboard.press('Enter');
  await embPlaying(page);
  await embBtn(page, 'REPORT').click();
  await expect(dialog(page, 'report-guest')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page, 'report-guest')).toHaveCount(0);
  await expect(embedded(page)).toBeVisible();
  await expect(page).toHaveURL(runUrl(id));
  await embBtn(page, 'REPORT').click();
  await expect(dialog(page, 'report-guest')).toBeVisible();
  await page.goBack();
  await backOnCommunity(page, was);
  await expect(page.locator('.wc-start [data-dlg]')).toHaveCount(0);
  await page.keyboard.press('ArrowUp');
  expect(await cursorId(page)).toBe(was.ids[was.ids.indexOf(id) - 1]);
  expect(errors).toEqual([]);
});

test('a reload on the run’s address is the standalone page; its Back is the page load to ?community', async ({ page }) => {
  const s = await setUp(page);
  await onPageTwo(page, s);
  await page.keyboard.press('Enter');
  await embPlaying(page);
  await page.reload();
  await expect(page.locator('.wc-watch-page[data-watch="playing"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.wc-start')).toHaveCount(0);
  await expect(page.locator('.wc-chrome.wc-watch')).toHaveCount(1);
  await expect(page.locator('.wc-watch-emb')).toHaveCount(0);
  expect(await docMark(page)).toBeUndefined();
  await page.locator('.wc-watch [data-btn="BACK"]').click();
  await expect(page).toHaveURL(/\/\?community&cloudtest$/);
  // The Community again, on the page it was left on (the kept view).
  await expect(cm(page)).toBeVisible();
  await expect(pager(page)).toHaveText('Page 2 of 3');
});

test('a run that is gone: its words in the frame; Back returns to the Community', async ({ page }) => {
  const s = await setUp(page);
  const was = await onPageTwo(page, s);
  const id = was.id;
  s.pubs.setState(id, 'removed');
  await page.keyboard.press('Enter');
  const end = embedded(page).locator('[data-watch="end"]');
  await expect(end.locator('.wc-lk-q')).toHaveText('This log was removed by its sender.');
  await expect(page).toHaveURL(runUrl(id));
  expect(await docMark(page)).toBe(was.mark);
  await end.locator('[data-btn="BACK"]').click();
  await expect(cm(page)).toBeVisible();
  await expect(page).toHaveURL(START);
  await embGone(page, was.title);
  expect(await docMark(page)).toBe(was.mark);
});

test('Log in from the embedded run: the start page’s Log in, the way back the run’s address', async ({ page }) => {
  const s = await setUp(page);
  const id = s.runs[0]!;
  givePayload(s.server, id);
  await openCommunity(page);
  await rows(page).first().locator('.wc-cy-name').click();
  await embPlaying(page);
  await embedded(page).locator('[data-btn="LOGIN-COMMENT"]').click();
  await expect(page.locator('.wc-start [data-page="login"]')).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/\?cloudtest$/);
  const note = await page.evaluate(() => JSON.parse(sessionStorage.getItem('wc.watch.back') ?? 'null') as { back: string } | null);
  expect(note?.back).toBe(`/r/${id}?from=community&cloudtest`);
});

for (const size of [
  { width: 1440, height: 900 },
  { width: 1100, height: 700 },
  { width: 820, height: 1180 },
]) {
  test(`${size.width} × ${size.height}: the embedded page is laid out as the standalone page`, async ({ page }) => {
    await page.setViewportSize(size);
    const s = await setUp(page);
    // The newest run: votes and comments on it, a description.
    const id = s.runs[0]!;
    givePayload(s.server, id);
    s.server.addComment('brego', id, 'I was the one at the ford.');
    await openCommunity(page);
    await rows(page).first().locator('.wc-cy-name').click();
    await embPlaying(page);
    await expect(embedded(page).locator('[data-watch="comments"] .wc-watch-cm').first()).toBeVisible();
    const emb = await partRects(page);
    expect(emb.box, 'the box').not.toBeNull();
    expect(emb.comments, 'the comments').not.toBeNull();
    expect(emb.stars, 'the stars').not.toBeNull();

    await page.goto(`/r/${id}?from=community&cloudtest`);
    await expect(page.locator('.wc-watch-page[data-watch="playing"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.wc-start')).toHaveCount(0);
    await expect(page.locator('[data-watch="comments"] .wc-watch-cm').first()).toBeVisible();
    expect(await partRects(page)).toEqual(emb);
    // From 1000 px the band and the replay lie on the window's grid through a subgrid (so the
    // morph can fade them); the same rectangles as with `display: contents`, as before stage 74.
    const wide = await page.locator('.wc-watch-screen').evaluate((e) => getComputedStyle(e).display);
    expect(wide).toBe(size.width >= 1000 ? 'grid' : 'flex');
    await page.addStyleTag({ content: '@media (min-width: 1000px) { .wc-watch-screen { display: contents !important; } }' });
    expect(await partRects(page)).toEqual(emb);
  });
}

test('a narrow window (the dashboard): Back finds the page where it was scrolled to', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 700 });
  const s = await setUp(page);
  const id = s.runs[4]!;
  givePayload(s.server, id);
  await openCommunity(page);
  const body = cm(page).locator('.wc-lk-bbody');
  const run = cm(page).locator(`[data-box="newest"] .wc-cy-drow[data-id="${id}"] button`);
  await expect(run).toBeVisible();
  await body.evaluate((e) => e.scrollTo({ top: 120 }));
  const scrolled = await body.evaluate((e) => e.scrollTop);
  expect(scrolled).toBeGreaterThan(60);
  await mark(page);
  const doc = await docMark(page);
  await run.click();
  await embPlaying(page);
  await page.goBack();
  await expect(cm(page)).toBeVisible();
  await expect(page.locator('.wc-watch-page')).toHaveCount(0);
  expect(await body.evaluate((e) => e.scrollTop)).toBe(scrolled);
  expect(await docMark(page)).toBe(doc);
});

test('the fill (a browser without element fullscreen) covers the whole start surface, and ends', async ({ page }) => {
  const s = await setUp(page);
  const was = await onPageTwo(page, s);
  const id = was.id;
  await page.keyboard.press('Enter');
  await embPlaying(page);
  const poster = embReplay(page).locator('.wc-poster');
  await expect(poster).toBeVisible({ timeout: 20_000 });
  await poster.click();
  await expect(poster).toHaveCount(0);
  await noFrameFullscreen(page);
  await embReplay(page).locator('.wc-player').click();
  await page.keyboard.press('f');
  const slot = page.locator('.wc-start .wc-watch-slot');
  await expect(slot).toHaveClass(/is-filled/);
  await expect.poll(() => fillsWindowOnTop(page)).toBe(true);
  await page.keyboard.press('f');
  await expect(slot).not.toHaveClass(/is-filled/);
  await expect(embedded(page).locator('.wc-watch-band')).toBeVisible();
  // The browser's Back while filled: the frame goes, nothing is left filled.
  await page.keyboard.press('f');
  await expect(slot).toHaveClass(/is-filled/);
  await page.goBack();
  await backOnCommunity(page, was);
  await expect(page.locator('.is-filled')).toHaveCount(0);
});
