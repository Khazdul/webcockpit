// Stage 65 C1 (spec §7.8, ADR 0155; round 13's picks 1b with the owner's
// changes, 2 and 5): the Community page on a desktop, against the fake of
// the account API with the flags `accounts`, `share`, `gallery` and
// `runes` (cloud-account-fake.ts, `?cloudtest`). The phone:
// phone-community-page.spec.ts.
//
// - The page: ten runs, New first, the pager inside the list, the column
//   (the players' figure, Log of the day, Hall of Fame, Warlords, no
//   source or time) all in view at 1440 × 900; no Published runs button;
//   the short headings, "Title (Char)", Random Runes ≤ 45 % at the bottom.
// - Search: as typed, with the sorts and pages, ✕ and Back clear it, kept
//   across a run (the owner's feedback W2).
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
  SENDERS,
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
  // The column: Log of the day (today only), Hall of Fame (8), Warlords (up to ten a side: 10 of the 11 White lords, the 9 minions).
  await expect(box(page, 'day').locator('.wc-cy-bh')).toHaveText('Log of the day');
  await expect(box(page, 'day').locator('.wc-cy-day-t')).not.toBeEmpty();
  await expect(box(page, 'day')).not.toContainText('Yesterday');
  await expect(box(page, 'hof').locator('li')).toHaveCount(8);
  await expect(box(page, 'war').locator('.is-west li')).toHaveCount(10);
  await expect(box(page, 'war').locator('.is-dark li')).toHaveCount(9);
  await expect(box(page, 'war')).not.toContainText(/players|mume\.org|source|\bago\b|updated/i);
  // The players online: a free-standing figure at the top right, out of the Warlords box (owner's feedback 7).
  const players = box(page, 'players');
  await expect(players.locator('.wc-cy-players-n')).toHaveText('38');
  await expect(players).toContainText('players online');
  expect(await players.evaluate((e) => e.classList.contains('wc-cy-box'))).toBe(false);
  const pl = (await players.boundingBox())!;
  const day = (await box(page, 'day').boundingBox())!;
  expect(pl.y + pl.height).toBeLessThanOrEqual(day.y + 1);
  expect(pl.x + pl.width).toBeGreaterThan(day.x + day.width - 12);
  // Short headings (owner's feedback 10); rows "Title (Char)" without the level (11).
  await expect(cm(page).locator('.wc-cy-th')).toHaveText(['Log', 'Stars', 'Com.', 'Views']);
  await expect(rows(page).first().locator('.wc-cy-l1')).toHaveText(/^\S.* \((Gibur|Ugluk|Eothain|Saelind|Rasta|Pip)\)$/);
  await expect(cm(page).locator('.wc-cy-row')).not.toContainText([/\bL\d+\)/]);
  // Random Runes at the bottom of the left side, at most about 40 % of it (owner's feedback 5).
  const main = (await cm(page).locator('.wc-cy-main').boundingBox())!;
  const rb = (await runes(page).boundingBox())!;
  expect(rb.height).toBeLessThanOrEqual(main.height * 0.45);
  expect(main.y + main.height - (rb.y + rb.height)).toBeLessThan(2);
  // All of it in view without scrolling at 1440 × 900.
  const col = cm(page).locator('.wc-cy-col');
  expect(await col.evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
  const war = (await box(page, 'war').boundingBox())!;
  expect(war.y + war.height).toBeLessThan(900);
  // Not on this page (the owner's picks).
  await expect(cm(page)).not.toContainText('Published logs');
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
  // Comments by M, back to Log (New) by L; no Length heading any more (E does nothing).
  await page.keyboard.press('m');
  await expect(head(page, 'comments')).toHaveClass(/is-cur/);
  await expect(head(page, 'length')).toHaveCount(0);
  await page.keyboard.press('e');
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
  await expect(cm(page).locator('.wc-cy-by-t')).toHaveText(`Logs by ${sender}`);
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
  await expect(cm(page).locator('.wc-cy-by-t')).toHaveText(`Logs by ${second}`);
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

test('Random Runes: write (the field grows, the count), one’s own note with Remove, each writer in a colour of their own, no gold bar; never a link', async ({ page }) => {
  const s = await setUp(page);
  s.server.addNote('brego', 'see https://evil.example/x and <b>bold</b>', { ago: 60_000 });
  await logIn(page, s);
  await openCommunity(page);
  await expect(notes(page)).toHaveCount(4);
  await expect(runes(page).locator('a')).toHaveCount(0);
  await expect(notes(page).first()).toContainText('<b>bold</b>');
  // A sparse hint, no sentence (owner's feedback 12).
  await expect(noteField(page)).toHaveAttribute('placeholder', 'Write a message…');
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
  // No gold bar on one's own note; each writer's name in the colour of its hue, the same for a name (owner's feedback round 2).
  expect(await own.evaluate((e) => getComputedStyle(e).boxShadow)).toBe('none');
  const hues = await notes(page).evaluateAll((els) =>
    els.map((e) => {
      const b = e.querySelector<HTMLElement>('.wc-cy-writer')!;
      return { name: b.textContent, hue: b.dataset['hue'], color: getComputedStyle(b).color };
    }),
  );
  expect(new Set(hues.map((h) => h.name)).size).toBeGreaterThan(1);
  for (const h of hues) {
    expect(hues.filter((x) => x.hue === h.hue).every((x) => x.color === h.color)).toBe(true);
    expect(hues.filter((x) => x.name === h.name).every((x) => x.hue === h.hue)).toBe(true);
  }
  expect(new Set(hues.map((h) => h.color)).size).toBe(new Set(hues.map((h) => h.hue)).size);
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

test('Random Runes with many notes keeps to the bottom and at most ~40 % of the left side; its notes scroll inside', async ({ page }) => {
  const s = await setUp(page);
  for (let i = 0; i < 40; i++) s.server.addNote(SENDERS[i % SENDERS.length]!, `note number ${i}: ${'the ford is quiet tonight, '.repeat(1 + (i % 3))}`, { ago: 60_000 * (i + 5) });
  await logIn(page, s);
  await openCommunity(page);
  await expect(notes(page)).toHaveCount(43);
  const main = (await cm(page).locator('.wc-cy-main').boundingBox())!;
  const rb = (await runes(page).boundingBox())!;
  expect(rb.height).toBeLessThanOrEqual(main.height * 0.42);
  expect(rb.height).toBeGreaterThan(main.height * 0.3);
  expect(main.y + main.height - (rb.y + rb.height)).toBeLessThan(2);
  const list = runes(page).locator('.wc-cy-notes');
  expect(await list.evaluate((e) => e.scrollHeight > e.clientHeight + 20)).toBe(true);
  // The list keeps the rest: its ten rows (scrolling inside when short) and the pager in view.
  await expect(pager(page)).toBeInViewport();
  expect((await pager(page).boundingBox())!.y).toBeLessThan(rb.y);
  // Writing grows the field inside the box; the box stays within its share.
  await page.keyboard.press('w');
  await page.keyboard.type('A long note about the ford and the orcs and the night. '.repeat(4).trim());
  const rb2 = (await runes(page).boundingBox())!;
  expect(rb2.height).toBeLessThanOrEqual(main.height * 0.42);
  await expect(noteField(page)).toBeInViewport();
  await shot(page, 'runes-many.desktop');
});

test('search: as typed (two characters at least), with the sorts and pages; ✕ and Back clear it; kept across a run', async ({ page }) => {
  const s = await setUp(page);
  const asked: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/api/gallery') asked.push(u.search);
  });
  await openCommunity(page);
  const field = cm(page).locator('.wc-cy-search-in');
  // In the list's head; / puts the keyboard there.
  expect(await field.evaluate((e) => !!e.closest('.wc-cy-throw'))).toBe(true);
  await page.keyboard.press('/');
  await expect(field).toBeFocused();
  // One character searches nothing.
  await page.keyboard.type('f');
  await page.waitForTimeout(600);
  expect(asked.some((q) => q.includes('q='))).toBe(false);
  await expect(rows(page)).toHaveCount(10);
  // "ford": the titles with Ford (Holding the Fords of Isen, twice).
  await page.keyboard.type('ord');
  const fords = [...s.server.pubs.values()].filter((p) => /ford/i.test(p.pub.title)).length;
  await expect(cm(page).locator('.wc-cy-q')).toHaveText(`Search: “ford” — ${fords} ${fords === 1 ? 'log' : 'logs'}`);
  await expect(rows(page)).toHaveCount(fords);
  for (const t of await rows(page).locator('.wc-cy-name').allTextContents()) expect(t.toLowerCase()).toContain('ford');
  await expect.poll(() => asked.filter((q) => q.includes('q=')).length).toBe(1);
  await shot(page, 'search.desktop');
  // Enter lets go of the field; a heading sorts the search.
  await page.keyboard.press('Enter');
  await expect(field).not.toBeFocused();
  await head(page, 'watched').click();
  await expect(head(page, 'watched')).toHaveClass(/is-cur/);
  await expect(cm(page).locator('.wc-cy-q')).toContainText('ford');
  await expect.poll(() => asked[asked.length - 1]).toMatch(/sort=watched.*q=ford/);
  // A sender's name: brego's runs (more than one page).
  await field.fill('BREGO');
  const bregos = [...s.server.pubs.values()].filter((p) => p.account === 'brego').length;
  await expect(cm(page).locator('.wc-cy-q')).toHaveText(`Search: “BREGO” — ${bregos} logs`);
  expect(new Set(await rows(page).locator('.wc-cy-sender').allTextContents())).toEqual(new Set(['brego']));
  // Nothing found.
  await field.fill('zzz-nothing');
  await expect(cm(page).locator('.wc-cy-list')).toHaveAttribute('data-state', 'empty');
  await expect(cm(page)).toContainText('No logs found.');
  // ✕ in the field clears it: the whole list.
  await cm(page).locator('[data-btn="CLEAR-SEARCH"]').click();
  await expect(field).toHaveValue('');
  await expect(cm(page).locator('.wc-cy-q')).toHaveCount(0);
  await expect(rows(page)).toHaveCount(10);
  // Back (Esc) clears a search before it leaves the page.
  await field.click();
  await page.keyboard.type('isen');
  await expect(cm(page).locator('.wc-cy-q')).toContainText('isen');
  await page.keyboard.press('Escape');
  await expect(field).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(cm(page).locator('.wc-cy-q')).toHaveCount(0);
  await expect(field).toHaveValue('');
  await expect(cm(page)).toBeVisible();
  // Kept across a run: the search is there again on the way back.
  await field.click();
  await page.keyboard.type('weathertop');
  await expect(cm(page).locator('.wc-cy-q')).toContainText('weathertop');
  await page.keyboard.press('Enter');
  await rows(page).first().locator('.wc-cy-name').click();
  await expect(page).toHaveURL(/\/r\/.*from=community/);
  await page.goto('/?cloudtest&community');
  await expect(cm(page).locator('.wc-cy-q')).toContainText('weathertop');
  await expect(field).toHaveValue('weathertop');
  await expect(rows(page)).toHaveCount([...s.server.pubs.values()].filter((p) => /weathertop/i.test(p.pub.title)).length);
  // The ✕ of the search's line clears it too.
  await btnIn(cm(page), 'CLEAR').click();
  await expect(rows(page)).toHaveCount(10);
});

test.describe('a tablet window', () => {
  test.use({ viewport: { width: 900, height: 700 } });

  test('the narrower desktop form: the search field beside Run, the column, Random Runes under the list', async ({ page }) => {
    const s = await setUp(page);
    await logIn(page, s);
    await openCommunity(page);
    await expect(cm(page).locator('.wc-cy-dash')).toHaveCount(0);
    const run = (await head(page, 'new').boundingBox())!;
    const field = (await cm(page).locator('.wc-cy-search').boundingBox())!;
    const stars = (await head(page, 'top').boundingBox())!;
    expect(field.width).toBeGreaterThan(110);
    expect(field.x).toBeGreaterThan(run.x + run.width);
    expect(field.x + field.width).toBeLessThan(stars.x);
    await expect(box(page, 'players')).toBeVisible();
    const main = (await cm(page).locator('.wc-cy-main').boundingBox())!;
    expect((await runes(page).boundingBox())!.height).toBeLessThanOrEqual(main.height * 0.45);
    await expect(pager(page)).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(page, 'in.tablet');
  });
});
