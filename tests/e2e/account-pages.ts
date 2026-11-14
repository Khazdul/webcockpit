// What the specs of the account pages share (stage 60): locators, the way
// in, and the screenshots for the comparison with the mockups. Not a spec
// (no tests). Used by account-pages.spec.ts (desktop) and
// phone-account-pages.spec.ts, and by the Account page's own specs
// (account-page.spec.ts, phone-account-page.spec.ts).
//
// The pages talk to the fake of the account API (cloud-account-fake.ts:
// `fakeAccountApi(page)` before the page is opened) and to the fake
// Turnstile (turnstile-stub.ts: `stubTurnstile(page)`), on the dev server
// with `?cloudtest` (src/cloud/config.ts).
//
// Screenshots: `WC_ACCOUNT_SHOTS=1` writes each page's states as small
// JPEGs under notes/research/account-mockups/built/ (desktop 1440 × 900,
// phone 390 × 844), named after the mockups' states in `shots/`. Without
// it `shot` does nothing, so a normal run writes no files.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Locator, type Page, expect } from '@playwright/test';
import type { FakeAccountServer } from './cloud-account-fake';

/** The mockups' sky: a fixed dusk that stands still. */
export const SKY = 'skyHour=19.1&skyMonth=0&skyDay=21&skyYear=3040&skyFreeze';

export const NAME = 'Olev';
export const PASSWORD = 'correct horse battery';
export const PASSWORD_2 = 'a new long password';

export const DESKTOP = { width: 1440, height: 900 };
export const PHONE = { width: 390, height: 844 };
export const LANDSCAPE = { width: 844, height: 390 };
export const TABLET = { width: 820, height: 1180 };
/** The phone's start page with our own keyboard in English (`openStart`'s query). */
export const PHONE_Q = '&phone=1&kbd=en';

const BUILT = join(dirname(fileURLToPath(import.meta.url)), '../../notes/research/account-mockups/built');

/** The frame that is shown on the start page. */
export const frame = (page: Page): Locator => page.locator('.wc-start .wc-frame:not([hidden])');
/** An account page's content (`login`, `create`, `code`, `recover`, `account`). */
export const pageOf = (page: Page, name: string): Locator => frame(page).locator(`[data-page="${name}"]`);
export const field = (page: Page, id: string): Locator => frame(page).locator(`[data-field="${id}"] input`);
export const fieldNote = (page: Page, id: string): Locator => frame(page).locator(`[data-field="${id}"] :is(.wc-lk-ferr, .wc-lk-fhint)`);
export const btn = (page: Page, id: string): Locator => frame(page).locator(`[data-btn="${id}"]`);
export const link = (page: Page, id: string): Locator => frame(page).locator(`[data-link="${id}"]`);
export const formError = (page: Page): Locator => frame(page).locator('.wc-ac-err');
/** A dialog over the Account page (`ac-logout`, `ac-end`, `ac-endall`, `ac-password`, `ac-newcode`, `ac-newcode-shown`, `ac-delete`). */
export const dialog = (page: Page, dlg: string): Locator => frame(page).locator(`[data-dlg="${dlg}"]`);
/** A dialog's error line (over its buttons). */
export const dialogError = (page: Page): Locator => frame(page).locator('.wc-lk-dialog-err');
/** The Account page's content whether or not a dialog lies over it. */
export const accountUnder = (page: Page): Locator => page.locator('.wc-start [data-page="account"]');
/** The start menu's rows, and the Account row. */
export const menuRows = (page: Page): Locator => page.locator('.wc-start .wc-sm-item');
export const accountRow = (page: Page): Locator => page.locator('.wc-start .wc-sm-item[data-key="account"]');
export const selectedRow = (page: Page): Locator => page.locator('.wc-start .wc-sm-item.is-sel');

export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** The start page with the cloud test hook (`?cloudtest`), on the mockups' sky. `query` starts with `&`. */
export async function openStart(page: Page, query = ''): Promise<void> {
  await page.goto(`/?cloudtest&${SKY}${query}`);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
}

/** The start page, then the Account row (which opens Log in, or the Account page when somebody is logged in). */
export async function openAccount(page: Page, query = ''): Promise<void> {
  await openStart(page, query);
  await expect(accountRow(page)).toBeVisible();
  await accountRow(page).click();
  await expect(frame(page).locator('[data-page]')).toBeVisible();
}

/** Waits until the page's box has landed and its content has faded in (the start surface's morph). */
export async function settled(page: Page): Promise<void> {
  // (A dialog's frame has no box of its own: the dialog is what lands.)
  await page.locator('.wc-start .wc-frame:not([hidden]) :is(.wc-lk-box, .wc-lk-dialog)').first().waitFor();
  // The morph (about half a second), the content's fade and the fields' focus ring.
  await page.waitForTimeout(1000);
}

/** A screenshot for the comparison with the mockups (only with `WC_ACCOUNT_SHOTS=1`). */
export async function shot(page: Page, state: string, view: 'desktop' | 'phone', o: { now?: boolean } = {}): Promise<void> {
  if (process.env.WC_ACCOUNT_SHOTS !== '1') return;
  // (`now`: a state that passes, such as Working…: no waiting for the page to settle.)
  if (!o.now) await settled(page);
  mkdirSync(BUILT, { recursive: true });
  // (`css`: a phone's picture at 390 px wide, not at its screen's 2.6×: small files.)
  await page.screenshot({ path: join(BUILT, `${state}.${view}.jpg`), type: 'jpeg', quality: 70, scale: 'css' });
}

/** `n` wrong tries for `name`, straight at the fake server (another device), each with a token of its own. */
export function wrongLogins(server: FakeAccountServer, name: string, n: number, origin: string): void {
  const other = server.browser();
  for (let i = 0; i < n; i++) {
    other.request({
      method: 'POST',
      path: '/api/auth/login',
      search: '',
      headers: { 'x-wc': '1', origin, 'content-type': 'application/json' },
      body: JSON.stringify({ name, authKey: 'A'.repeat(43), label: 'Other device', turnstile: `other-${Date.now()}-${i}-${Math.random()}` }),
      origin,
    });
  }
}

/** Fills Create account with a usable name and password (the Turnstile is the caller's). */
export async function fillCreate(page: Page, name = NAME, password = PASSWORD): Promise<void> {
  await field(page, 'name').fill(name);
  await field(page, 'password').fill(password);
  await field(page, 'again').fill(password);
}

/** The recovery code as the page shows it (canonical: `XXXX-XXXX-…`). */
export async function shownCode(page: Page): Promise<string> {
  const groups = await frame(page).locator('.wc-ac-code-p > span').allTextContents();
  return groups.join('-');
}

/** Log out from the Account page: the button, then the dialog's own. */
export async function logOut(page: Page): Promise<void> {
  await btn(page, 'LOGOUT').click();
  await expect(dialog(page, 'ac-logout')).toBeVisible();
  await btn(page, 'OUT').click();
}

// ------------------------------------------------------------ the phone: our own keyboard

/** Our keyboard's host on a page, the keyboard, and one of its keys (a character, or an action: `tab`, `enter`, `esc`, `fold`, `space`). */
export const okbHost = (page: Page): Locator => page.locator('.wc-okb-page');
export const okb = (page: Page): Locator => okbHost(page).locator('.wc-ph-okb');
export const okbKey = (page: Page, k: string): Locator =>
  okb(page).locator([...k].length === 1 ? `.wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-ph-okb-k[data-act="${k}"]`);
/** Two frames and a task: the layout after a keyboard came up or the window turned. */
export const frames = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));

export type Rect = { x: number; y: number; width: number; height: number };
export const box = async (l: Locator): Promise<Rect> => (await l.boundingBox())!;

/** Types `text` on our keyboard (lower-case letters, digits where the row is up, and spaces). */
export async function okbType(page: Page, text: string): Promise<void> {
  for (const ch of text) await okbKey(page, ch === ' ' ? 'space' : ch).tap();
}

/** `l` lies whole above our keyboard and inside the screen. */
export async function expectAbove(page: Page, l: Locator): Promise<void> {
  await expect(l).toBeVisible();
  await expect
    .poll(async () => {
      const k = await box(okbHost(page));
      const b = await box(l);
      return b.y >= 0 && b.y + b.height <= k.y + 0.5;
    })
    .toBe(true);
}
