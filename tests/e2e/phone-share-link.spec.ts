// Stage 64 C1 (spec §7.7, ADR 0154; round 12's picks 1a, 2a, 4a) on a
// phone: the guest's greyed Link (a tap says why), the first share with the
// rules by taps, the second without, a refusal, and Published runs on the
// Account page (the rows stacked, Edit and Remove by taps). The desktop and
// the upload's contents: share-link.spec.ts. `?cloudtest&phone=1`.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { NAME, PASSWORD, PHONE, PHONE_Q, accountRow, btn, dialog, dialogError, field, frame, openStart, pageOf, watchErrors } from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { pinDemoClock } from './demo-clock';

test.use({ viewport: PHONE });

const exp = (page: Page) => frame(page).locator('.wc-exp');
const opt = (page: Page, id: string) => frame(page).locator(`.wc-exp-outs [data-opt="${id}"]`);
const share = (page: Page) => dialog(page, 'share');
const done = (page: Page) => dialog(page, 'share-done');
const pubRows = (page: Page) => frame(page).locator('.wc-ac-pub');

/** The box lies inside the viewport's width. */
async function inView(page: Page, l: Locator): Promise<void> {
  const b = (await l.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(-0.5);
  expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
}

async function server(): Promise<FakeAccountServer> {
  const s = new FakeAccountServer();
  s.flags = { accounts: true, share: true };
  await seedAccount(s, NAME, PASSWORD);
  return s;
}

async function logIn(page: Page): Promise<void> {
  await expect(accountRow(page)).toBeVisible();
  await accountRow(page).tap();
  await expect(pageOf(page, 'login')).toBeVisible();
  await field(page, 'name').fill(NAME);
  await field(page, 'password').fill(PASSWORD);
  await btn(page, 'LOGIN').tap();
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(frame(page).locator('.wc-ac-head-since')).toContainText('Account since');
}

async function start(page: Page, s: FakeAccountServer, o: { login?: boolean } = {}): Promise<void> {
  await pinDemoClock(page);
  await fakeAccountApi(page, { server: s });
  await openStart(page, PHONE_Q);
  await page.waitForFunction(() => window.__wc !== undefined);
  await page.evaluate(async () => {
    const lib = await window.__wc!.runs();
    await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  if (o.login !== false) {
    await logIn(page);
    await frame(page).locator('.wc-lk-back').first().tap();
    await expect(accountRow(page)).toHaveText(NAME);
  }
  await frame(page).locator('.wc-sm-item[data-key="history"]').tap();
  const hist = frame(page).locator('.wc-hist');
  await expect(hist.locator('.wc-lk-tr')).toHaveCount(3);
  await hist.locator('.wc-lk-tr').nth(1).tap();
  await expect(hist.locator('.wc-lk-tr.is-on .wc-hist-char')).toHaveText('Rasta');
  await hist.locator('.wc-hist-card [data-btn="EXPORT"]').tap();
  await expect(exp(page)).toBeVisible();
  await expect(frame(page).locator('.wc-exp-row').first()).toBeVisible();
}

test('phone: a guest taps the greyed Link and is told to log in; the three options fit', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page, await server(), { login: false });
  for (const id of ['HTML', 'TEXT', 'LINK']) await inView(page, opt(page, id));
  await inView(page, btn(page, 'EXPORT'));
  await expect(opt(page, 'LINK')).toHaveAttribute('aria-disabled', 'true');
  await opt(page, 'LINK').tap({ force: true });
  await expect(frame(page).locator('.wc-exp-flash')).toContainText('Log in to share. Account is on the start page.');
  await expect(opt(page, 'HTML')).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('phone: the first share with the rules by taps, then the second without', async ({ page }) => {
  const errors = watchErrors(page);
  const s = await server();
  await start(page, s);
  await opt(page, 'LINK').tap();
  await expect(exp(page)).toHaveAttribute('data-format', 'link');
  await expect(frame(page).locator('.wc-exp-flabel')).toHaveText('Title');
  await btn(page, 'EXPORT').tap();
  await expect(share(page)).toBeVisible();
  await inView(page, share(page));
  await expect(share(page).locator('[data-field="title"] input')).toHaveValue('Rasta · 26 September 2026');
  await expect(share(page).locator('[data-rules]')).toBeVisible();
  await expect(btn(page, 'CREATE')).toHaveAttribute('aria-disabled', 'true');
  await share(page).locator('[data-field="rules"]').tap();
  await inView(page, btn(page, 'CREATE'));
  await btn(page, 'CREATE').tap();
  await expect(done(page)).toBeVisible();
  await inView(page, done(page));
  const id = s.pubsOf(NAME)[0]!.id;
  await expect(done(page).locator('[data-field="link"] input')).toHaveValue(`${new URL(page.url()).origin}/r/${id}`);
  await inView(page, btn(page, 'COPY'));
  await btn(page, 'DONE').tap();
  await expect(done(page)).toHaveCount(0);

  // The second time: the form alone.
  await btn(page, 'EXPORT').tap();
  await expect(share(page)).toBeVisible();
  await expect(share(page).locator('[data-rules]')).toHaveCount(0);
  await btn(page, 'CREATE').tap();
  await expect(done(page)).toBeVisible();
  expect(s.pubsOf(NAME)).toHaveLength(2);
  expect(s.requests('PATCH /api/u/account/prefs')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('phone: offline, then Try again', async ({ page }) => {
  const s = await server();
  await start(page, s);
  await opt(page, 'LINK').tap();
  s.pubOffline = true;
  await btn(page, 'EXPORT').tap();
  await share(page).locator('[data-field="rules"]').tap();
  await btn(page, 'CREATE').tap();
  await expect(dialogError(page)).toHaveText('Offline: the link could not be made. Try again when you are online.');
  await expect(btn(page, 'CREATE')).toHaveText('Try again');
  s.pubOffline = false;
  await btn(page, 'CREATE').tap();
  await expect(done(page)).toBeVisible();
});

test('phone: Published runs stacked in the column; Edit and Remove by taps', async ({ page }) => {
  const errors = watchErrors(page);
  const s = await server();
  s.addPub(NAME, { id: 'Zp6Wd3Fg5uNa', title: 'Trollshaws hoard run', state: 'hidden', created: 1_762_000_000_000 });
  s.addPub(NAME, { id: 'Ab3dE5fG7hJk', title: 'Gibur and the Witch-king’s lieutenant, a long title that wraps', views: 112, created: 1_763_000_000_000 });
  await pinDemoClock(page);
  await fakeAccountApi(page, { server: s });
  await openStart(page, PHONE_Q);
  await logIn(page);
  await expect(pubRows(page)).toHaveCount(2);
  const body = frame(page).locator('.wc-ac-body');
  expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const first = pubRows(page).first();
  // Two lines on a phone: the title over its figures; the link over its buttons.
  const t = (await first.locator('.wc-ac-pub-t').boundingBox())!;
  const f = (await first.locator('.wc-ac-pub-fig').boundingBox())!;
  expect(f.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
  for (const id of ['COPY', 'EDIT', 'REMOVE']) {
    await first.locator(`[data-btn="${id}"]`).scrollIntoViewIfNeeded();
    await inView(page, first.locator(`[data-btn="${id}"]`));
  }
  await expect(pubRows(page).nth(1).locator('[data-pub-hidden]')).toBeVisible();

  await first.locator('[data-btn="EDIT"]').tap();
  const edit = dialog(page, 'pub-edit');
  await expect(edit).toBeVisible();
  await edit.locator('[data-field="title"] input').fill('Carn Dûm');
  await btn(page, 'SAVE').tap();
  await expect(edit).toHaveCount(0);
  await expect(first.locator('[data-pub-title]')).toHaveText('Carn Dûm');

  await first.locator('[data-btn="REMOVE"]').tap();
  await expect(dialog(page, 'pub-remove')).toBeVisible();
  await inView(page, dialog(page, 'pub-remove').locator('[data-btn="REMOVE"]'));
  await dialog(page, 'pub-remove').locator('[data-btn="REMOVE"]').tap();
  await expect(pubRows(page)).toHaveCount(1);
  expect(s.pubsOf(NAME).map((p) => p.id)).toEqual(['Zp6Wd3Fg5uNa']);
  expect(errors).toEqual([]);
});
