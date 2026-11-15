// Helpers of the stage 65 C3 specs (Hall of Fame in the export editor,
// Published runs as a view, the owner row's reactions mark): the fake
// account server with the flags `accounts`, `share` and `gallery`, the demo
// runs, a login through the pages, the export editor on the Rasta session
// (desktop and phone), and a second account that votes and comments.
import { type Locator, type Page, expect } from '@playwright/test';
import { NAME, PASSWORD, PHONE_Q, accountRow, btn, field, frame, openAccount, openStart, pageOf } from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { pinDemoClock } from './demo-clock';

export const exp = (page: Page): Locator => frame(page).locator('.wc-exp');
export const opt = (page: Page, id: string): Locator => frame(page).locator(`.wc-exp-outs [data-opt="${id}"]`);
export const pubRows = (page: Page): Locator => frame(page).locator('.wc-ac-pub');
export const MB = 1024 * 1024;
export const DAY = 86_400_000;

/** The account fake with the community on (`gallery`) unless asked otherwise. */
export async function server(o: { gallery?: boolean } = {}): Promise<FakeAccountServer> {
  const s = new FakeAccountServer();
  s.flags = { accounts: true, share: true, gallery: o.gallery ?? true };
  await seedAccount(s, NAME, PASSWORD);
  return s;
}

/** Another account (no crypto: it never logs in from a page), a month old, so its votes rank. */
export function voter(s: FakeAccountServer, name: string): void {
  const fields = { salt: 's', kdf: { name: 'pbkdf2-sha256' as const, rounds: 600_000 }, authKey: 'a', recoveryAuth: 'r', wrapPw: 'w', wrapRc: 'c' };
  s.seed(name, fields, { created: s.now() - 30 * DAY });
}

/** The demo runs restored (before any page of the app asks for them). */
export async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__wc !== undefined);
  await page.evaluate(async () => {
    const lib = await window.__wc!.runs();
    await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
}

/** Logs in from the start page; leaves the Account page open. */
export async function logInToAccount(page: Page, query = ''): Promise<void> {
  await openAccount(page, query);
  await field(page, 'name').fill(NAME);
  await field(page, 'password').fill(PASSWORD);
  await btn(page, 'LOGIN').click();
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(frame(page).locator('.wc-ac-head-since')).toContainText('Account since');
}

/** The fake on the page, the start page, the demo runs; logged in (back on the start menu) unless `login: false`. */
export async function startPage(page: Page, s: FakeAccountServer, o: { login?: boolean; phone?: boolean } = {}): Promise<void> {
  await pinDemoClock(page);
  await fakeAccountApi(page, { server: s });
  const q = o.phone ? PHONE_Q : '';
  if (o.login === false) {
    await openStart(page, q);
    await restoreDemo(page);
    return;
  }
  await logInToAccount(page, q);
  await restoreDemo(page);
  await page.keyboard.press('Escape');
  await expect(accountRow(page)).toContainText(NAME);
}

/** Start menu → History → Export on the Rasta session (desktop). */
export async function openEditor(page: Page): Promise<void> {
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').click();
  const hist = frame(page).locator('.wc-hist');
  await expect(hist.locator('.wc-lk-tr')).toHaveCount(3);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(hist.locator('.wc-lk-tr.is-on')).toContainText('Rasta');
  await hist.locator('[data-btn="EXPORT"]').click();
  await expect(exp(page)).toBeVisible();
  await expect(frame(page).locator('.wc-exp-row').first()).toBeVisible();
}

/** The same by taps (phone). */
export async function openEditorPhone(page: Page): Promise<void> {
  await frame(page).locator('.wc-sm-item[data-key="history"]').tap();
  const hist = frame(page).locator('.wc-hist');
  await expect(hist.locator('.wc-lk-tr')).toHaveCount(3);
  await hist.locator('.wc-lk-tr').nth(1).tap();
  await expect(hist.locator('.wc-lk-tr.is-on .wc-hist-char')).toHaveText('Rasta');
  await hist.locator('.wc-hist-card [data-btn="EXPORT"]').tap();
  await expect(exp(page)).toBeVisible();
  await expect(frame(page).locator('.wc-exp-row').first()).toBeVisible();
}

/** The box lies inside the viewport's width. */
export async function inView(page: Page, l: Locator): Promise<void> {
  const b = (await l.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(-0.5);
  expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
}

/** Every request to the API from now on (method, path, the body as text). */
export function apiLog(page: Page): { method: string; path: string; body: string | null }[] {
  const log: { method: string; path: string; body: string | null }[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/')) log.push({ method: r.method(), path: u.pathname, body: r.method() === 'POST' && u.pathname === '/api/u/pub' ? null : r.postData() });
  });
  return log;
}
