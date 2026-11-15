// Stage 65 C1 (spec §7.8, ADR 0155; round 13's picks 1b with the owner's
// changes, 2 and 5): the Community page on a desktop, against the fake of
// the account API with the flags `accounts`, `share`, `gallery` and
// `runes` (cloud-account-fake.ts, `?cloudtest`). The phone:
// phone-community-page.spec.ts.
//
// - The page: ten runs, New first, the pager inside the list, the column
//   (Run of the day, Hall of Fame, Warlords with the players' line, no
//   source or time) all in view at 1440 × 900; no Published runs button.
// - Sorting by a press on a heading and by its letter; paging; a sender's
//   runs and Back; a run opens `/r/<id>?from=community`, and
//   `<base>?community` brings the page back on its view.
// - Random Runes: writing (the field grows, the count), one's own note in
//   gold with Remove, Report on another's, the day's limit, a guest; text
//   is never a link; `runes` off: no board.
// - The counter: a guest's from the public listed times, an account's from
//   the news; opening the page clears both. `gallery` off: no row.
// - Loading failed (offline, Try again) and empty.
import { type Page, expect, test } from '@playwright/test';
import { DESKTOP, frame, pageOf } from './account-pages';
import {
  ME,
  box,
  btnIn,
  cm,
  communityRow,
  dialog,
  head,
  logIn,
  noteField,
  notes,
  openCommunity,
  openStart,
  pager,
  rows,
  runes,
  setUp,
  shot,
} from './community';

test.use({ viewport: DESKTOP });

const numbers = async (page: Page, col: number): Promise<number[]> =>
  (await rows(page).locator(`.wc-lk-td:nth-child(${col})`).allTextContents()).map((t) => Number(t.replace(/[^0-9.]/g, '')));

test('the page: ten runs, New first, the pager in the list, the column in view; no Published runs, no source line', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = await setUp(page);
  await logIn(page, s);
  await openCommunity(page);
  await expect(rows(page)).toHaveCount(10);
  // New: the newest listed first.
  await expect(head(page, 'new')).toHaveClass(/is-cur/);
  await expect(head(page, 'new')).toHaveAttribute('aria-sort', 'descending');
  expect(await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))).toEqual(s.runs.slice(0, 10));
  await expect(pager(page)).toHaveText('Page 1 of 3');
  // The pager inside the list, at its bottom right.
  const list = (await cm(page).locator('.wc-cy-list').boundingBox())!;
  const pg = (await cm(page).locator('.wc-cy-pager').boundingBox())!;
  expect(pg.y).toBeGreaterThan(list.y);
  expect(pg.x + pg.width).toBeGreaterThan(list.x + list.width - 40);
  // The column: Run of the day (today only), Hall of Fame (8), Warlords (5 a side, the players).
  await expect(box(page, 'day').locator('.wc-cy-day-t')).not.toBeEmpty();
  await expect(box(page, 'day')).not.toContainText('Yesterday');
  await expect(box(page, 'hof').locator('li')).toHaveCount(8);
  await expect(box(page, 'war').locator('.is-west li')).toHaveCount(5);
  await expect(box(page, 'war').locator('.is-dark li')).toHaveCount(5);
  await expect(box(page, 'war')).toContainText('38 players on MUME');
  await expect(box(page, 'war')).not.toContainText(/mume\.org|source|\bago\b|updated/i);
  // All of it in view without scrolling at 1440 × 900.
  const col = cm(page).locator('.wc-cy-col');
  expect(await col.evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
  const war = (await box(page, 'war').boundingBox())!;
  expect(war.y + war.height).toBeLessThan(900);
  // Not on this page (the owner's picks).
  await expect(cm(page)).not.toContainText('Published runs');
  await expect(cm(page)).not.toContainText('History → Export');
  await expect(cm(page)).not.toContainText('Top posters');
  await shot(page, 'in.desktop');
  // Back to the menu.
  await page.keyboard.press('Escape');
  await expect(cm(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('sorting by a press on a heading and by its letter; paging by the pager and the arrows', async ({ page }) => {
  const s = await setUp(page);
  await openCommunity(page);
  await head(page, 'watched').click();
  await expect(head(page, 'watched')).toHaveClass(/is-cur/);
  await expect(head(page, 'new')).not.toHaveClass(/is-cur/);
  await expect(cm(page).locator('.wc-cy-list')).toHaveAttribute('data-sort', 'watched');
  const top = Math.max(...[...s.server.pubs.values()].map((p) => p.pub.views));
  await expect.poll(async () => (await numbers(page, 5))[0]).toBe(top);
  const views = await numbers(page, 5);
  expect(views).toEqual([...views].sort((a, b) => b - a));
  // Stars by S: the ranks show under Top.
  await page.keyboard.press('s');
  await expect(head(page, 'top')).toHaveClass(/is-cur/);
  await expect(rows(page).first().locator('.wc-cy-rank')).toHaveText('1');
  // Length by E, comments by M, back to Listed by L.
  await page.keyboard.press('e');
  await expect(head(page, 'length')).toHaveClass(/is-cur/);
  await page.keyboard.press('m');
  await expect(head(page, 'comments')).toHaveClass(/is-cur/);
  await page.keyboard.press('l');
  await expect(head(page, 'new')).toHaveClass(/is-cur/);
  await expect(rows(page).first()).toHaveAttribute('data-id', s.runs[0]!);
  // Pages.
  await btnIn(cm(page), 'NEXT').click();
  await expect(pager(page)).toHaveText('Page 2 of 3');
  await expect(rows(page).first()).toHaveAttribute('data-id', s.runs[10]!);
  await page.keyboard.press('ArrowRight');
  await expect(pager(page)).toHaveText('Page 3 of 3');
  await expect(rows(page)).toHaveCount(3);
  await expect(btnIn(cm(page), 'NEXT')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(pager(page)).toHaveText('Page 2 of 3');
  // A new sort starts on page 1.
  await page.keyboard.press('v');
  await expect(pager(page)).toHaveText('Page 1 of 3');
});

test('a sender’s runs: a press on the name, R on the cursor’s run; Back returns to the whole list', async ({ page }) => {
  const s = await setUp(page);
  await openCommunity(page);
  const first = rows(page).first();
  const sender = (await first.locator('.wc-cy-sender').textContent())!;
  await first.locator('.wc-cy-sender').click();
  await expect(cm(page).locator('.wc-cy-by-t')).toHaveText(`Runs by ${sender}`);
  const theirs = [...s.server.pubs.values()].filter((p) => p.account === sender.toLowerCase()).length;
  await expect(rows(page)).toHaveCount(theirs);
  expect(new Set(await rows(page).locator('.wc-cy-sender').allTextContents())).toEqual(new Set([sender]));
  await expect(page).not.toHaveURL(/\/r\//);
  // Back (Esc): the whole list again, then the menu.
  await page.keyboard.press('Escape');
  await expect(cm(page).locator('.wc-cy-by')).toHaveCount(0);
  await expect(rows(page)).toHaveCount(10);
  // R: the cursor's run's sender (the second row).
  await page.keyboard.press('ArrowDown');
  const second = (await rows(page).nth(1).locator('.wc-cy-sender').textContent())!;
  await page.keyboard.press('r');
  await expect(cm(page).locator('.wc-cy-by-t')).toHaveText(`Runs by ${second}`);
  await btnIn(cm(page), 'ALL-RUNS').click();
  await expect(rows(page)).toHaveCount(10);
  await page.keyboard.press('Escape');
  await expect(cm(page)).toHaveCount(0);
});

test('a run opens its watch page with from=community; <base>?community brings the page back on its view', async ({ page }) => {
  const s = await setUp(page);
  await openCommunity(page);
  await btnIn(cm(page), 'NEXT').click();
  await expect(pager(page)).toHaveText('Page 2 of 3');
  await rows(page).nth(1).locator('.wc-cy-name').click();
  await expect(page).toHaveURL(new RegExp(`/r/${s.runs[11]}\\?from=community&cloudtest$`));
  // The watch page's Back goes to `<base>?community` (part C2): the page again, on page 2.
  await page.goto('/?cloudtest&community');
  await expect(cm(page)).toBeVisible();
  await expect(pager(page)).toHaveText('Page 2 of 3');
  await expect(page).not.toHaveURL(/community/);
  // Enter on the cursor's run opens it too.
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/r/${s.runs[10]}\\?from=community`));
});

test('Random Runes: write (the field grows, the count), one’s own note in gold with Remove; never a link', async ({ page }) => {
  const s = await setUp(page);
  s.server.addNote('brego', 'see https://evil.example/x and <b>bold</b>', { ago: 60_000 });
  await logIn(page, s);
  await openCommunity(page);
  await expect(notes(page)).toHaveCount(4);
  await expect(runes(page).locator('a')).toHaveCount(0);
  await expect(notes(page).first()).toContainText('<b>bold</b>');
  // W puts the keyboard in the field; it grows while used.
  await page.keyboard.press('w');
  await expect(noteField(page)).toBeFocused();
  const one = (await noteField(page).boundingBox())!.height;
  const text = 'Selling a dwarven axe in Bree, ask Gittan. '.repeat(4).trim();
  await page.keyboard.type(text);
  await expect(runes(page).locator('.wc-cy-count')).toHaveText(`${[...text].length} / 250 · 5 left today`);
  expect((await noteField(page).boundingBox())!.height).toBeGreaterThan(one + 10);
  await shot(page, 'runes-write.desktop');
  await page.keyboard.press('Enter');
  await expect(notes(page)).toHaveCount(5);
  const own = notes(page).first();
  await expect(own).toHaveClass(/is-own/);
  await expect(own).toContainText(text);
  await expect(noteField(page)).toHaveValue('');
  expect([...s.server.notes.values()].some((n) => n.account === ME && n.text === text)).toBe(true);
  // The field takes at most 250 characters, one line.
  await noteField(page).click();
  await page.keyboard.type('x'.repeat(260));
  await expect(noteField(page)).toHaveValue('x'.repeat(250));
  await noteField(page).fill('');
  await page.keyboard.press('Escape');
  await expect(noteField(page)).not.toBeFocused();
  await expect(cm(page)).toBeVisible();
  // Remove (on the pointer).
  await own.hover();
  await expect(btnIn(own, 'REPORT')).toHaveCount(0);
  await btnIn(own, 'REMOVE').click();
  await expect(notes(page)).toHaveCount(4);
  expect([...s.server.notes.values()].some((n) => n.text === text)).toBe(false);
});

test('Random Runes: Report on another’s note (the report dialog for a note); the day’s limit', async ({ page }) => {
  const s = await setUp(page);
  for (let i = 0; i < 5; i++) s.server.addNote(ME, `note ${i}`, { ago: 1000 * (i + 1) });
  await logIn(page, s);
  await openCommunity(page);
  // Five today: the field is off and says when it opens.
  await expect(noteField(page)).toBeDisabled();
  await expect(noteField(page)).toHaveAttribute('placeholder', /Five notes today.*midnight \(UTC\)/);
  await shot(page, 'runes-limit.desktop');
  // Report on brego's note.
  const brego = notes(page).filter({ hasText: 'brego:' });
  await brego.hover();
  await expect(btnIn(brego, 'REMOVE')).toHaveCount(0);
  await btnIn(brego, 'REPORT').click();
  const d = dialog(page, 'report');
  await expect(d).toBeVisible();
  await expect(d).toContainText('this note by brego');
  await expect(d.locator('.wc-cy-quote')).toHaveText('the Fords of Isen log is up: two hours, three fights');
  await shot(page, 'runes-report.desktop');
  await d.locator('[data-reason="rules"]').click();
  await btnIn(d, 'SEND').click();
  await expect(dialog(page, 'report-thanks')).toBeVisible();
  expect(s.pubs.reports.map((r) => [r.kind, r.reason, r.account])).toEqual([['note', 'rules', ME]]);
  await btnIn(dialog(page, 'report-thanks'), 'CLOSE').click();
  await expect(dialog(page, 'report-thanks')).toHaveCount(0);
  // Again: already reported.
  await brego.hover();
  await btnIn(brego, 'REPORT').click();
  await dialog(page, 'report').locator('[data-reason="other"]').click();
  await btnIn(dialog(page, 'report'), 'SEND').click();
  await expect(dialog(page, 'report-already')).toBeVisible();
});

test('Random Runes for a guest: reads, no Remove or Report, Log in to write opens Log in; runes off: no board', async ({ page }) => {
  const s = await setUp(page);
  await openCommunity(page);
  await expect(notes(page)).toHaveCount(3);
  await notes(page).first().hover();
  await expect(runes(page).locator('[data-btn="REPORT"], [data-btn="REMOVE"]')).toHaveCount(0);
  await expect(noteField(page)).toHaveCount(0);
  await expect(runes(page)).toContainText('Notes come from accounts.');
  await shot(page, 'runes-guest.desktop');
  await btnIn(runes(page), 'LOGIN').click();
  await expect(pageOf(page, 'login')).toBeVisible();
  // Runes off: the board is gone, the rest stays.
  s.server.flags = { ...s.server.flags, runes: false };
  await openCommunity(page);
  await expect(rows(page)).toHaveCount(10);
  await expect(box(page, 'hof')).toBeVisible();
  await expect(runes(page)).toHaveCount(0);
});

test('the counter: a guest’s from the public listed times; opening the page clears it, after a reload too', async ({ page }) => {
  const s = await setUp(page);
  await openStart(page);
  await expect(communityRow(page).locator('.wc-sm-count')).toHaveText('23 new');
  await shot(page, 'menu-guest.desktop');
  await page.keyboard.press('c');
  await expect(rows(page)).toHaveCount(10);
  const newest = Math.max(...[...s.server.pubs.values()].map((p) => p.pub.listedAt ?? 0));
  await expect.poll(() => page.evaluate(() => localStorage.getItem('wc.communitySeen'))).toBe(String(newest));
  await page.keyboard.press('Escape');
  await expect(communityRow(page).locator('.wc-sm-count')).toHaveCount(0);
  // A run listed since: one new.
  s.server.addPub('brego', { listed: true, listedAt: s.server.now() });
  await page.reload();
  await expect(communityRow(page).locator('.wc-sm-count')).toHaveText('1 new');
});

test('the counter logged in: the news’ runs (not one’s own), 99+ at the cap; opening the page tells the server', async ({ page }) => {
  const s = await setUp(page, { runs: 120 });
  await logIn(page, s);
  await openStart(page);
  // 120 runs, every sixth ME's: 100 of others, "99+ new" at the cap.
  await expect(communityRow(page).locator('.wc-sm-count')).toHaveText('99+ new');
  await page.keyboard.press('c');
  await expect(rows(page)).toHaveCount(10);
  const newest = Math.max(...[...s.server.pubs.values()].map((p) => p.pub.listedAt ?? 0));
  await expect.poll(() => s.server.seenTimes.get(ME)?.gallery).toBe(newest);
  await page.keyboard.press('Escape');
  await expect(communityRow(page).locator('.wc-sm-count')).toHaveCount(0);
  // After a reload (another device would ask the same): still none.
  await page.reload();
  await expect(communityRow(page)).toBeVisible();
  await page.waitForTimeout(500);
  await expect(communityRow(page).locator('.wc-sm-count')).toHaveCount(0);
});

test('gallery off: no Community row, C does nothing', async ({ page }) => {
  await setUp(page, { flags: { gallery: false } });
  await openStart(page);
  await expect(page.locator('.wc-start .wc-sm-item[data-key="owner"]')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(communityRow(page)).toHaveCount(0);
  await page.keyboard.press('c');
  await page.waitForTimeout(300);
  await expect(cm(page)).toHaveCount(0);
  await expect(frame(page).locator('.wc-sm')).toBeVisible();
});

test('loading failed: offline with Try again; nothing listed: the empty page', async ({ page }) => {
  const s = await setUp(page, { runs: 0, mume: false, notes: false });
  await openCommunity(page);
  await expect(cm(page).locator('.wc-cy-list')).toHaveAttribute('data-state', 'empty');
  await expect(cm(page)).toContainText('Nothing in the Hall of Fame yet.');
  // Boxes only when there is something in them.
  await expect(box(page, 'day')).toHaveCount(0);
  await expect(box(page, 'hof')).toHaveCount(0);
  await expect(box(page, 'war')).toHaveCount(0);
  await expect(runes(page)).toContainText('The board is empty.');
  await shot(page, 'empty.desktop');
  await page.keyboard.press('Escape');
  await expect(cm(page)).toHaveCount(0);
  s.server.communityOffline = true;
  s.server.addPub('brego', { listed: true });
  await page.keyboard.press('c');
  await expect(cm(page).locator('[data-state="offline"]')).toContainText('Offline: the Community could not be loaded.');
  await shot(page, 'offline.desktop');
  s.server.communityOffline = false;
  await btnIn(cm(page), 'RETRY').click();
  await expect(rows(page)).toHaveCount(1);
});

test('a note’s text is clipped to its row: a stored tower of marks paints over nothing (review fix S1)', async ({ page }) => {
  const s = await setUp(page);
  // An old row from before the rule (the fake stores what it is given).
  s.server.addNote('brego', `x${'\u0310\u0311\u0312\u200d'.repeat(60)}`, { ago: 60_000 });
  await openCommunity(page);
  const text = notes(page).first().locator('.wc-cy-note-t');
  expect(await text.evaluate((el) => getComputedStyle(el).overflow)).toBe('hidden');
  const row = (await notes(page).first().boundingBox())!;
  const next = (await notes(page).nth(1).boundingBox())!;
  expect(row.y + row.height).toBeLessThanOrEqual(next.y + 1);
});
