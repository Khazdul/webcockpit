// What the specs of the account pages share (stage 60): locators, the way
// in, and the screenshots for the comparison with the mockups. Not a spec
// (no tests). Used by account-pages.spec.ts (desktop) and
// phone-account-pages.spec.ts; the next part's specs (the Account page and
// its dialogs) can build on it.
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
  await page.locator('.wc-start .wc-frame:not([hidden]) .wc-lk-box').first().waitFor();
  // The morph (about half a second), the content's fade and the fields' focus ring.
  await page.waitForTimeout(1000);
}

/** A screenshot for the comparison with the mockups (only with `WC_ACCOUNT_SHOTS=1`). */
export async function shot(page: Page, state: string, view: 'desktop' | 'phone'): Promise<void> {
  if (process.env.WC_ACCOUNT_SHOTS !== '1') return;
  await settled(page);
  mkdirSync(BUILT, { recursive: true });
  await page.screenshot({ path: join(BUILT, `${state}.${view}.jpg`), type: 'jpeg', quality: 70 });
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
