// Stage 65 C1 (round 13's pick 1b, the phone's form), changed by the
// owner's feedback (W2, point 8): the Community page on a phone opens on a
// dashboard, not tabs: the search field and the players' figure, the
// newest five logs with All logs and Hall of Fame (sub-pages with Back),
// Log of the day, Random Runes (the latest notes, the field), the
// Warlords. All runs shows New only, with the search field and the pager.
// Against the fake of the account API (community.ts), at 390 × 844 and
// 320 × 568. The desktop: community-page.spec.ts.
import { type Page, expect, test } from '@playwright/test';
import { ME, box, btnIn, cm, columnsAligned, communityRow, logIn, noteField, notes, openCommunity, openStart, pager, rows, runes, setUp, shot } from './community';

const PHONE_Q = '&phone=1&kbd=en';
const dash = (page: Page) => cm(page).locator('.wc-cy-dash');
const newest = (page: Page) => box(page, 'newest').locator('.wc-cy-drow');
const search = (page: Page) => cm(page).locator('.wc-cy-search-in');
const title = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-lk-hood');
const noSideways = (page: Page): Promise<boolean> => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe('390 × 844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the dashboard: no tabs; players, the newest five, Run of the day, Random Runes, Warlords; nothing sideways', async ({ page }) => {
    const s = await setUp(page);
    await logIn(page, s);
    await openCommunity(page, PHONE_Q);
    await expect(dash(page)).toBeVisible();
    await expect(cm(page).locator('[role="tab"]')).toHaveCount(0);
    await expect(title(page)).toContainText('Community');
    // The players' figure at the top right, no box.
    await expect(box(page, 'players').locator('.wc-cy-players-n')).toHaveText('38');
    const pl = (await box(page, 'players').boundingBox())!;
    const sf = (await search(page).boundingBox())!;
    expect(pl.x).toBeGreaterThan(sf.x + sf.width - 2);
    // The newest five: "Title (Char)", no level; a tap opens.
    await expect(newest(page)).toHaveCount(5);
    expect(await newest(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))).toEqual(s.runs.slice(0, 5));
    await expect(newest(page).first().locator('.wc-cy-drow-t')).toHaveText(/^Gibur and the Witch-king’s lieutenant \(Gibur\)$/);
    // The rest of the dashboard, in its order.
    const order = await dash(page).locator(':scope > *').evaluateAll((els) => els.map((e) => e.getAttribute('data-box') ?? e.className));
    expect(order).toEqual(['wc-cy-dtop', 'newest', 'day', 'runes', 'war']);
    await expect(box(page, 'war').locator('.is-west li')).toHaveCount(10);
    await expect(box(page, 'war')).not.toContainText('players');
    await expect(notes(page)).toHaveCount(3);
    await expect(noteField(page)).toHaveAttribute('placeholder', 'Write a message…');
    expect(await noSideways(page)).toBe(true);
    await shot(page, 'dash.phone');
    await cm(page).locator('.wc-lk-bbody').evaluate((e) => e.scrollTo({ top: e.scrollHeight }));
    await shot(page, 'dash-end.phone');
    // Write a note from the dashboard.
    await noteField(page).tap();
    await noteField(page).fill('Orcs at the ford, bring light');
    await btnIn(runes(page), 'POST').tap();
    await expect(notes(page).first()).toHaveClass(/is-own/);
    expect([...s.server.notes.values()].some((n) => n.account === ME && n.text === 'Orcs at the ford, bring light')).toBe(true);
    // A tap opens a note's actions.
    await notes(page).nth(1).tap();
    await expect(btnIn(notes(page).nth(1), 'REPORT')).toBeVisible();
    // A tap on a newest run opens it.
    await newest(page).nth(1).locator('button').tap();
    await expect(page).toHaveURL(new RegExp(`/r/${s.runs[1]}\\?from=community`));
  });

  test('All runs: the whole list (New), the pager, a sender’s runs; Back returns step by step to the dashboard', async ({ page }) => {
    const s = await setUp(page);
    await openCommunity(page, PHONE_Q);
    await btnIn(box(page, 'newest'), 'ALL').tap();
    await expect(title(page)).toContainText('All logs');
    await expect(dash(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(10);
    await expect(cm(page).locator('.wc-cy-th')).toHaveCount(0);
    await expect(cm(page).locator('.wc-cy-list')).toHaveAttribute('data-sort', 'new');
    await expect(rows(page).first().locator('.wc-cy-p1')).not.toContainText(/L\d/);
    await expect(search(page)).toBeVisible();
    expect(await noSideways(page)).toBe(true);
    await shot(page, 'all.phone');
    await btnIn(cm(page), 'NEXT').tap();
    await expect(pager(page)).toHaveText('Page 2 of 3');
    await expect(rows(page).first()).toHaveAttribute('data-id', s.runs[10]!);
    // A sender's runs, then Back: the whole list, then the dashboard.
    const sender = (await rows(page).first().locator('.wc-cy-sender').textContent())!;
    await rows(page).first().locator('.wc-cy-sender').tap();
    await expect(cm(page).locator('.wc-cy-by-t')).toHaveText(`Logs by ${sender}`);
    await cm(page).locator('.wc-lk-back').tap();
    await expect(cm(page).locator('.wc-cy-by')).toHaveCount(0);
    await expect(rows(page)).toHaveCount(10);
    await cm(page).locator('.wc-lk-back').tap();
    await expect(dash(page)).toBeVisible();
    await expect(newest(page)).toHaveCount(5);
    await cm(page).locator('.wc-lk-back').tap();
    await expect(cm(page)).toHaveCount(0);
  });

  test('search from the dashboard opens All runs on it; the field there searches as typed; ✕ clears; kept across a run', async ({ page }) => {
    const s = await setUp(page);
    await openCommunity(page, PHONE_Q);
    await search(page).tap();
    await search(page).fill('ford');
    await page.waitForTimeout(500);
    // Still the dashboard until Enter (or the go mark).
    await expect(dash(page)).toBeVisible();
    await btnIn(cm(page), 'SEARCH').tap();
    await expect(title(page)).toContainText('All logs');
    const fords = [...s.server.pubs.values()].filter((p) => /ford/i.test(p.pub.title)).length;
    await expect(cm(page).locator('.wc-cy-q')).toHaveText(`Search: “ford” — ${fords} logs`);
    await expect(rows(page)).toHaveCount(fords);
    await expect(search(page)).toHaveValue('ford');
    await shot(page, 'search.phone');
    // As typed on the sub-page.
    await search(page).fill('hollin');
    const hollins = [...s.server.pubs.values()].filter((p) => p.account === 'hollin').length;
    await expect(cm(page).locator('.wc-cy-q')).toHaveText(`Search: “hollin” — ${hollins} logs`);
    // Kept across a run.
    await rows(page).first().locator('.wc-cy-p1').tap();
    await expect(page).toHaveURL(/\/r\/.*from=community/);
    await page.goto(`/?cloudtest${PHONE_Q}&community`);
    await expect(cm(page).locator('.wc-cy-q')).toContainText('hollin');
    await expect(title(page)).toContainText('All logs');
    // ✕ clears: the whole list; Back: the dashboard with an empty field.
    await btnIn(cm(page), 'CLEAR').tap();
    await expect(rows(page)).toHaveCount(10);
    await cm(page).locator('.wc-lk-back').tap();
    await expect(dash(page)).toBeVisible();
    await expect(search(page)).toHaveValue('');
  });

  test('Hall of Fame on its own sub-page: the best eight with their rank; Back', async ({ page }) => {
    await setUp(page);
    await openCommunity(page, PHONE_Q);
    await btnIn(box(page, 'newest'), 'HOF').tap();
    await expect(title(page)).toContainText('Hall of Fame');
    await expect(box(page, 'hof').locator('.wc-cy-row')).toHaveCount(8);
    await expect(box(page, 'hof').locator('.wc-cy-row').first().locator('.wc-cy-rank')).toHaveText('1');
    expect(await noSideways(page)).toBe(true);
    await shot(page, 'hof.phone');
    await cm(page).locator('.wc-lk-back').tap();
    await expect(dash(page)).toBeVisible();
  });

  test('All runs from the dashboard carries its field: the search, or an empty field; also after a restored view (review fix 2 CR1)', async ({ page }) => {
    const s = await setUp(page);
    const fords = [...s.server.pubs.values()].filter((p) => /ford/i.test(p.pub.title)).length;
    await openCommunity(page, PHONE_Q);
    await search(page).tap();
    await search(page).fill('ford');
    await page.waitForTimeout(500);
    await btnIn(box(page, 'newest'), 'ALL').tap();
    await expect(title(page)).toContainText('All logs');
    await expect(search(page)).toHaveValue('ford');
    await expect(cm(page).locator('.wc-cy-q')).toHaveText(`Search: “ford” — ${fords} logs`);
    // Back (the dashboard, the field emptied); one letter is no search: All runs empties the field.
    await cm(page).locator('.wc-lk-back').tap();
    await search(page).fill('f');
    await btnIn(box(page, 'newest'), 'ALL').tap();
    await expect(search(page)).toHaveValue('');
    await expect(cm(page).locator('.wc-cy-q')).toHaveCount(0);
    await expect(rows(page)).toHaveCount(10);
    // A view kept with a search but no sub-page (as the desktop keeps it): the dashboard's field shows it, All runs searches it.
    await page.evaluate(() => sessionStorage.setItem('wc.community.view', JSON.stringify({ sort: 'new', page: 1, q: 'ford' })));
    await page.goto(`/?cloudtest${PHONE_Q}&community`);
    await expect(dash(page)).toBeVisible();
    await expect(search(page)).toHaveValue('ford');
    await btnIn(box(page, 'newest'), 'ALL').tap();
    await expect(search(page)).toHaveValue('ford');
    await expect(cm(page).locator('.wc-cy-q')).toHaveText(`Search: “ford” — ${fords} logs`);
  });

  test('the search field takes 60 characters; a longer text says so instead of a silent whole list (review fix 2 CR2)', async ({ page }) => {
    await setUp(page);
    await openCommunity(page, PHONE_Q);
    await btnIn(box(page, 'newest'), 'ALL').tap();
    await expect(search(page)).toHaveAttribute('maxlength', '60');
    await search(page).fill('x'.repeat(70));
    await expect(search(page)).toHaveValue('x'.repeat(60));
    // A text longer than a search takes (set by script, past the attribute): the line says so.
    await search(page).evaluate((el: HTMLInputElement) => {
      el.value = 'y'.repeat(61);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(cm(page).locator('.wc-cy-by[data-state="too-long"]')).toHaveText('A search takes at most 60 characters.');
    await btnIn(cm(page), 'CLEAR').tap();
    await expect(search(page)).toHaveValue('');
    await expect(cm(page).locator('.wc-cy-by')).toHaveCount(0);
  });

  test('Hall of Fame → a sender’s runs → Back returns to the Hall of Fame (review fix 2 CR3)', async ({ page }) => {
    await setUp(page);
    await openCommunity(page, PHONE_Q);
    await btnIn(box(page, 'newest'), 'HOF').tap();
    await expect(title(page)).toContainText('Hall of Fame');
    const sender = (await box(page, 'hof').locator('.wc-cy-row').first().locator('.wc-cy-sender').textContent())!;
    await box(page, 'hof').locator('.wc-cy-row').first().locator('.wc-cy-sender').tap();
    await expect(title(page)).toContainText('All logs');
    await expect(cm(page).locator('.wc-cy-by-t')).toHaveText(`Logs by ${sender}`);
    await cm(page).locator('.wc-lk-back').tap();
    await expect(title(page)).toContainText('Hall of Fame');
    await expect(box(page, 'hof').locator('.wc-cy-row')).toHaveCount(8);
    await cm(page).locator('.wc-lk-back').tap();
    await expect(dash(page)).toBeVisible();
  });

  test('runes off: no board on the dashboard; the guest’s counter on the menu clears when the page is opened', async ({ page }) => {
    await setUp(page, { flags: { runes: false } });
    await openStart(page, PHONE_Q);
    await expect(communityRow(page).locator('.wc-sm-count')).toHaveText('23 new');
    await communityRow(page).tap();
    await expect(newest(page)).toHaveCount(5);
    await expect(runes(page)).toHaveCount(0);
    await cm(page).locator('.wc-lk-back').tap();
    await expect(communityRow(page).locator('.wc-sm-count')).toHaveCount(0);
  });

  test('a kept view sorted by Top asks the list once, as New, on a phone (review fix CR7)', async ({ page }) => {
    await setUp(page);
    const asked: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.pathname === '/api/gallery') asked.push(u.search);
    });
    await page.addInitScript(() => sessionStorage.setItem('wc.community.view', JSON.stringify({ sort: 'top', page: 1, sub: 'runs' })));
    await openStart(page, `${PHONE_Q}&community`);
    await expect(cm(page).locator('.wc-cy-list')).toHaveAttribute('data-state', 'list');
    await expect(cm(page).locator('.wc-cy-list')).toHaveAttribute('data-sort', 'new');
    await page.waitForTimeout(300);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('sort=new');
  });
});

test.describe('320 × 568', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('the dashboard and its sub-pages fit a small phone: nothing sideways, the figure beside the search', async ({ page }) => {
    const s = await setUp(page);
    await logIn(page, s);
    await openCommunity(page, PHONE_Q);
    await expect(newest(page)).toHaveCount(5);
    expect(await noSideways(page)).toBe(true);
    const pl = (await box(page, 'players').boundingBox())!;
    const sf = (await search(page).boundingBox())!;
    expect(sf.width).toBeGreaterThan(140);
    expect(Math.abs(pl.y + pl.height / 2 - (sf.y + sf.height / 2))).toBeLessThan(20);
    // Every dashboard box inside the window's width.
    const win = (await cm(page).locator('.wc-lk-win').boundingBox())!;
    for (const b of await dash(page).locator(':scope > *').all()) {
      const r = (await b.boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(win.x - 1);
      expect(r.x + r.width).toBeLessThanOrEqual(win.x + win.width + 1);
    }
    await shot(page, 'dash.phone320');
    await cm(page).locator('.wc-lk-bbody').evaluate((e) => e.scrollTo({ top: e.scrollHeight }));
    await shot(page, 'dash-end.phone320');
    await btnIn(box(page, 'newest'), 'ALL').tap();
    await expect(rows(page)).toHaveCount(10);
    expect(await noSideways(page)).toBe(true);
    await shot(page, 'all.phone320');
  });
});

test.describe('a tablet on its side, 1180 × 820', () => {
  test.use({ viewport: { width: 1180, height: 820 } });

  test('the wide page: the list’s rule and Log of the day on one line; the figure under the window’s top; Back clear (owner’s feedback round 3)', async ({ page }) => {
    const s = await setUp(page);
    await logIn(page, s);
    await openCommunity(page, '&kbd=en');
    await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
    await expect(rows(page)).toHaveCount(10);
    await columnsAligned(page);
  });
});
