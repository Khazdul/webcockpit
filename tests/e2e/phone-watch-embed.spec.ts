// Stage 74 A on a phone (Pixel 7; ADR 0163): a run tapped on the Community
// page's dashboard opens as a frame on the start surface. No document is
// loaded, the surface's morph runs, the address is the run's, the replay
// plays; Back (the button, the browser's) returns to the dashboard where it
// was scrolled to, with nothing of the run left. The embedded page is laid
// out as the standalone page (upright and turned), follows a turn of the
// window as it does standalone (`--wc-watch-vh`, src/watch/turn.ts) and its
// fill covers the whole surface. The desktop: watch-embed.spec.ts.
import { type Page, expect, test } from '@playwright/test';
import { PHONE_Q } from './account-pages';
import { box, cm, openCommunity, rows, setUp } from './community';
import { noFrameFullscreen } from './watch-page';
import { docMark, embBtn, embGone, embPlaying, embReplay, embedded, fillsWindowOnTop, givePayload, mark, morphs, partRects } from './watch-embed';

test.describe.configure({ timeout: 60_000 });

const dash = (page: Page) => cm(page).locator('.wc-cy-dash');
const newest = (page: Page) => box(page, 'newest').locator('.wc-cy-drow');
const body = (page: Page) => cm(page).locator('.wc-lk-bbody');
const START = /\/\?cloudtest&skyHour[^/]*$/;

test.describe('390 × 844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a tap on a run opens it with no page load; Back and the browser’s Back return to the dashboard where it was', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const s = await setUp(page);
    const id = s.runs[3]!;
    givePayload(s.server, id);
    await openCommunity(page, PHONE_Q);
    await expect(page.locator('html')).toHaveClass(/wc-phone/);
    await expect(newest(page)).toHaveCount(5);
    // Scrolled a little: the fourth run is still in view.
    await body(page).evaluate((e) => e.scrollTo({ top: 90 }));
    const scrolled = await body(page).evaluate((e) => e.scrollTop);
    expect(scrolled).toBeGreaterThan(40);
    const title = await page.title();
    await mark(page);
    const doc = await docMark(page);

    await newest(page).nth(3).locator('button').tap();
    await expect(page).toHaveURL(new RegExp(`/r/${id}\\?from=community&cloudtest$`));
    await embPlaying(page);
    expect(await docMark(page), 'no document was loaded').toBe(doc);
    expect(await morphs(page), 'the surface morphed').toEqual(['swap']);
    await expect(page).toHaveTitle(`${s.server.pubs.get(id)!.pub.title} · WebCockpit`);
    await expect.poll(() => s.pubs.viewRequests.length).toBe(1);
    // The phone's fullscreen button steps aside for the large box, as for any other.
    const fs = page.locator('.wc-fs-btn');
    if ((await fs.count()) > 0) await expect(fs).toBeHidden();
    // The app's root fills the window by CSS while the run shows (watch.css), as the standalone page's.
    const app = await page.locator('#app').evaluate((e) => {
      const r = e.getBoundingClientRect();
      return [e.classList.contains('wc-watch-app'), r.top, Math.round(r.height), innerHeight];
    });
    expect(app).toEqual([true, 0, 844, 844]);

    await embBtn(page, 'BACK').tap();
    await expect(dash(page)).toBeVisible();
    await expect(page).toHaveURL(START);
    await embGone(page, title);
    expect(await docMark(page)).toBe(doc);
    expect(await morphs(page), 'the morph back').toEqual(['swap']);
    expect(await body(page).evaluate((e) => e.scrollTop), 'the dashboard where it was scrolled to').toBe(scrolled);

    // Again, and the browser's Back.
    await newest(page).nth(3).locator('button').tap();
    await embPlaying(page);
    await page.goBack();
    await expect(dash(page)).toBeVisible();
    await expect(page).toHaveURL(START);
    await embGone(page, title);
    expect(await docMark(page)).toBe(doc);
    expect(await body(page).evaluate((e) => e.scrollTop)).toBe(scrolled);
    expect(errors).toEqual([]);
  });

  test('the fill covers the whole start surface, and ends', async ({ page }) => {
    const s = await setUp(page);
    const id = s.runs[1]!;
    givePayload(s.server, id);
    await openCommunity(page, PHONE_Q);
    await newest(page).nth(1).locator('button').tap();
    await embPlaying(page);
    const poster = embReplay(page).locator('.wc-poster');
    await expect(poster).toBeVisible({ timeout: 20_000 });
    await poster.tap();
    await expect(poster).toHaveCount(0);
    await noFrameFullscreen(page);
    const fsButton = embReplay(page).locator('.wc-ph-lens .wc-ph-sat[data-sat="fullscreen"]');
    await fsButton.tap();
    const slot = page.locator('.wc-start .wc-watch-slot');
    await expect(slot).toHaveClass(/is-filled/);
    await expect.poll(() => fillsWindowOnTop(page)).toBe(true);
    await fsButton.tap();
    await expect(slot).not.toHaveClass(/is-filled/);
    await expect(embedded(page).locator('.wc-watch-band')).toBeVisible();
  });

  test('a turn: the embedded page follows the window, and so does the dashboard after Back', async ({ page }) => {
    const s = await setUp(page);
    const id = s.runs[1]!;
    givePayload(s.server, id);
    await openCommunity(page, PHONE_Q);
    await newest(page).nth(1).locator('button').tap();
    await embPlaying(page);
    const vh = (): Promise<string> => embedded(page).evaluate((e) => (e as HTMLElement).style.getPropertyValue('--wc-watch-vh'));
    await expect.poll(vh).toBe('844px');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(vh).toBe('390px');
    const slot = (await page.locator('.wc-watch-slot').boundingBox())!;
    expect(slot.width).toBeGreaterThan(760);
    await embBtn(page, 'BACK').tap();
    await expect(cm(page)).toBeVisible();
    await expect(page.locator('.wc-watch-page')).toHaveCount(0);
    const b = (await cm(page).boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(844);
    expect(b.width).toBeGreaterThan(760);
    expect(b.y + b.height).toBeLessThanOrEqual(390);
  });
});

for (const size of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`${size.width} × ${size.height}: the embedded page is laid out as the standalone page`, async ({ page }) => {
    await page.setViewportSize(size);
    const s = await setUp(page);
    const id = s.runs[1]!;
    givePayload(s.server, id);
    s.server.addComment('brego', id, 'I was the one at the ford.');
    await openCommunity(page, PHONE_Q);
    // Upright: the dashboard's newest runs; turned (a wide page): the list's rows.
    if (size.width < 700) await newest(page).nth(1).locator('button').tap();
    else await rows(page).nth(1).locator('.wc-cy-name').tap();
    await embPlaying(page);
    await expect(embedded(page).locator('[data-watch="comments"] .wc-watch-cm').first()).toBeVisible();
    const emb = await partRects(page);
    expect(emb.box, 'the box').not.toBeNull();
    expect(emb.comments, 'the comments').not.toBeNull();

    await page.goto(`/r/${id}?from=community&cloudtest${PHONE_Q}`);
    await expect(page.locator('.wc-watch-page[data-watch="playing"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.wc-start')).toHaveCount(0);
    await expect(page.locator('[data-watch="comments"] .wc-watch-cm').first()).toBeVisible();
    expect(await partRects(page)).toEqual(emb);
  });
}
