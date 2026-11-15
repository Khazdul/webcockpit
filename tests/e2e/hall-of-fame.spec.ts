// Stage 65 C3 (ADR 0155; round 13's pick 4 "as drawn"): Hall of Fame, the
// export editor's fourth format, and the share dialog's listed form, on a
// desktop, against the account fake with the flags `accounts`, `share` and
// `gallery` (cloud-account-fake.ts, `?cloudtest`). The phone:
// phone-hall-of-fame.spec.ts. Link itself: share-link.spec.ts.
//
// - A guest sees Hall of Fame greyed: a press, F and a pointer say "Log in
//   to publish". With `gallery` off there is no Hall of Fame.
// - The first publication: the rules' tick (as stage 64), "Publish to the
//   Hall of Fame", "Everyone can find this in the Community.", Publish; the
//   POST's meta says `listed: true`; the result "Published" with the link,
//   Copy, Open Community and Done. Open Community goes back to the start
//   menu and opens its Community row (start-request.ts).
// - The keyboard's ring reaches it after Link.
// - The 10-a-day refusal (429 too_many): Link now, listing later; Publish
//   stays off; Link still works.
import { gunzipSync } from 'node:zlib';
import { type Page, expect, test } from '@playwright/test';
import { DESKTOP, NAME, btn, dialog, dialogError, frame, watchErrors } from './account-pages';
import { DAY, apiLog, exp, openEditor, opt, server, startPage } from './community-pub';

test.use({ viewport: DESKTOP });

const share = (page: Page) => dialog(page, 'share');
const done = (page: Page) => dialog(page, 'share-done');
const flash = (page: Page) => frame(page).locator('.wc-exp-flash');

test('a guest sees Hall of Fame greyed after Link: a press, F and a pointer say "Log in to publish"', async ({ page }) => {
  const errors = watchErrors(page);
  await startPage(page, await server(), { login: false });
  await openEditor(page);
  await expect(frame(page).locator('.wc-exp-outs .wc-lk-opt')).toHaveText(['HTML replay', 'Plain text', 'Link', 'Hall of Fame']);
  await expect(opt(page, 'HOF')).toHaveAttribute('aria-disabled', 'true');
  await expect(opt(page, 'HOF')).toHaveAttribute('aria-keyshortcuts', 'F');
  await expect(opt(page, 'LINK')).toHaveAttribute('aria-disabled', 'true');
  await opt(page, 'HOF').hover();
  await expect(frame(page).locator('.wc-exp-tip')).toHaveText('Log in to publish');
  await opt(page, 'LINK').hover();
  await expect(frame(page).locator('.wc-exp-tip')).toHaveText('Log in to share');
  await opt(page, 'HOF').click({ force: true });
  await expect(flash(page)).toContainText('Log in to publish. Account is on the start page.');
  await expect(opt(page, 'HTML')).toHaveAttribute('aria-checked', 'true');
  await page.mouse.move(1, 1);
  await page.keyboard.press('l');
  await expect(flash(page)).toContainText('Log in to share');
  await page.keyboard.press('f');
  await expect(flash(page)).toContainText('Log in to publish');
  await expect(exp(page)).toHaveAttribute('data-format', 'html');
  expect(errors).toEqual([]);
});

test('with gallery off there is no Hall of Fame (Link stays)', async ({ page }) => {
  await startPage(page, await server({ gallery: false }));
  await openEditor(page);
  await expect(frame(page).locator('.wc-exp-outs .wc-lk-opt')).toHaveText(['HTML replay', 'Plain text', 'Link']);
  await page.keyboard.press('f');
  await expect(exp(page)).toHaveAttribute('data-format', 'html');
});

test('the first publication: the rules, the listed form, listed: true in the POST, Published with Open Community', async ({ page, context, browserName }) => {
  const errors = watchErrors(page);
  const s = await server();
  await startPage(page, s);
  await openEditor(page);
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.keyboard.press('f');
  await expect(opt(page, 'HOF')).toHaveAttribute('aria-checked', 'true');
  await expect(opt(page, 'HTML')).toHaveAttribute('aria-checked', 'false');
  await expect(exp(page)).toHaveAttribute('data-format', 'hof');
  await expect(frame(page).locator('.wc-exp-flabel')).toHaveText('Title');
  await expect(frame(page).locator('.wc-exp-title')).toHaveText('Rasta · 26 September 2026');

  const log = apiLog(page);
  await btn(page, 'EXPORT').click();
  await expect(share(page)).toBeVisible();
  await expect(share(page).locator('.wc-lk-hood-t')).toHaveText('Publish to the Hall of Fame');
  await expect(share(page).locator('.wc-sh-anyone')).toHaveText('Everyone can find this in the Community.');
  await expect(share(page).locator('.wc-sh-listnote')).toHaveText('Listed under New at once. You can unlist it later under Published runs.');
  await expect(share(page).locator('.wc-sh-rules-l li')).toHaveCount(5);
  await expect(btn(page, 'CREATE')).toHaveCount(0);
  await expect(btn(page, 'PUBLISH')).toHaveText('Publish');
  await expect(btn(page, 'PUBLISH')).toHaveAttribute('aria-disabled', 'true');
  await share(page).locator('[data-field="title"] input').fill('Clearing the ranger camp');
  await share(page).locator('[data-field="rules"]').click();
  await expect(btn(page, 'PUBLISH')).not.toHaveAttribute('aria-disabled', 'true');
  await btn(page, 'PUBLISH').click();

  await expect(done(page)).toBeVisible();
  await expect(done(page).locator('.wc-lk-hood-t')).toHaveText('Published');
  await expect(done(page).locator('[data-pub-title]')).toHaveText('Clearing the ranger camp');
  const made = s.pubsOf(NAME)[0]!;
  const origin = new URL(page.url()).origin;
  await expect(done(page).locator('[data-field="link"] input')).toHaveValue(`${origin}/r/${made.id}`);
  await expect(done(page).locator('.wc-sh-note')).toHaveText(
    'It is in the Community now, first under New. Stars and comments show under Published runs on the Account page.',
  );
  await expect(done(page).locator('[data-btn]')).toHaveText(['Copy', 'Open Community', 'Done']);
  await btn(page, 'COPY').click();
  if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/r/${made.id}`);

  // The server lists it; the POST said listed: true (and nothing else changed of stage 64's body).
  expect(made).toMatchObject({ title: 'Clearing the ranger camp', listed: true });
  expect(made.listedAt).toBeGreaterThan(0);
  expect(log.filter((r) => r.method !== 'GET').map((r) => `${r.method} ${r.path}`)).toEqual(['PATCH /api/u/account/prefs', 'POST /api/u/pub']);
  expect(s.pubUploads).toHaveLength(1);
  const meta = s.pubUploads[0]!.meta as Record<string, unknown>;
  expect(Object.keys(meta).sort()).toEqual(['character', 'description', 'key', 'lengthS', 'level', 'listed', 'title']);
  expect(meta.listed).toBe(true);
  expect(JSON.parse(gunzipSync(Buffer.from(s.pubUploads[0]!.payload)).toString('utf8'))).toMatchObject({ schema: 1 });

  // Open Community: back to the start menu, its Community row asked for, and so the Community page (stage 65 C1).
  await btn(page, 'COMMUNITY').click();
  await expect(done(page)).toHaveCount(0);
  await expect(exp(page)).toHaveCount(0);
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-cy')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Open Community opens the Community row on the start menu, and so the Community page', async ({ page }) => {
  const s = await server();
  s.addPub(NAME, { title: 'Before' });
  s.stored(NAME)!.prefs.rulesAccepted = true;
  await startPage(page, s);
  // The row comes with the flag `gallery` (stage 65 C1).
  await expect(page.locator('.wc-start .wc-sm-item[data-key="community"]')).toBeVisible();
  await openEditor(page);
  await page.keyboard.press('f');
  await btn(page, 'EXPORT').click();
  await expect(btn(page, 'PUBLISH')).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await expect(done(page)).toBeVisible();
  await btn(page, 'COMMUNITY').click();
  await expect(done(page)).toHaveCount(0);
  await expect(page.locator('.wc-start .wc-sm-item[data-key="community"]')).toHaveClass(/is-sel/);
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-cy')).toBeVisible();
});

test('the keyboard: the ring reaches Hall of Fame after Link; Enter chooses it', async ({ page }) => {
  await startPage(page, await server());
  await openEditor(page);
  const sel = () => frame(page).locator('.wc-exp .is-sel');
  await page.keyboard.press('Tab');
  await expect(sel()).toHaveAttribute('data-btn', 'EXCLUDE');
  for (const want of ['COMMENT', 'TITLE']) {
    await page.keyboard.press('ArrowRight');
    await expect(sel()).toHaveAttribute('data-btn', want);
  }
  for (const want of ['HTML', 'TEXT', 'LINK', 'HOF']) {
    await page.keyboard.press('ArrowRight');
    await expect(sel()).toHaveAttribute('data-opt', want);
  }
  await page.keyboard.press('Enter');
  await expect(opt(page, 'HOF')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(sel()).toHaveAttribute('data-btn', 'EXPORT');
  // H goes back to a file; the choice of Hall of Fame was this visit's only.
  await page.keyboard.press('h');
  await expect(exp(page)).toHaveAttribute('data-format', 'html');
});

test('10 listings a day: the refusal offers Link now and listing later; Publish stays off; Link still works', async ({ page }) => {
  const errors = watchErrors(page);
  const s = await server();
  s.stored(NAME)!.prefs.rulesAccepted = true;
  for (let i = 0; i < 10; i++) s.addPub(NAME, { title: `Run ${i}`, listed: true, listedAt: s.now() - i * 1000 });
  // Yesterday's listings do not count.
  s.addPub(NAME, { title: 'Old', listed: true, listedAt: s.now() - 2 * DAY });
  await startPage(page, s);
  await openEditor(page);
  await page.keyboard.press('f');
  await btn(page, 'EXPORT').click();
  await expect(share(page).locator('[data-rules]')).toHaveCount(0);
  await btn(page, 'PUBLISH').click();
  await expect(dialogError(page)).toHaveText('You have listed 10 runs today, the most a day. Choose Link now, and list it tomorrow under Published runs.');
  await expect(btn(page, 'PUBLISH')).toHaveAttribute('aria-disabled', 'true');
  expect(s.pubsOf(NAME)).toHaveLength(11);
  await page.keyboard.press('Escape');
  await expect(share(page)).toHaveCount(0);

  // Link now.
  await page.keyboard.press('l');
  await btn(page, 'EXPORT').click();
  await expect(share(page).locator('.wc-lk-hood-t')).toHaveText('Share as a link');
  await btn(page, 'CREATE').click();
  await expect(done(page).locator('.wc-lk-hood-t')).toHaveText('Link created');
  expect(s.pubsOf(NAME).filter((p) => !p.listed)).toHaveLength(1);
  expect(errors).toEqual([]);
});
