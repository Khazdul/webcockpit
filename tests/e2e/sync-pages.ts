// What the specs of the sync's flows share (stage 61 part C): the
// account's database, IndexedDB from the page, the owner row, log in, the
// Account page's Sync now. Not a spec. Used by sync-flows.spec.ts (the fake
// account API) and tests/e2e-worker/sync-worker.spec.ts (a real local
// Worker).

import { type Locator, type Page, expect } from '@playwright/test';
import { NAME, PASSWORD, accountRow, btn, field, frame, openStart, pageOf } from './account-pages';

/**
 * Moves the pointer off the menu, so the owner row may come in (it waits
 * while a pointer rests on the rows under it, start-main.tsx). A real move
 * every time: after a reload the pointer may still be where it was, and a
 * move to the same place sends no event.
 */
export async function awayFromMenu(page: Page): Promise<void> {
  // Two devices are two windows: the one in the back may not draw (Firefox), and a move waits for it.
  await page.bringToFront();
  await page.mouse.move(6, 6);
  await page.mouse.move(1, 1);
}

/** An account's space's database. */
export const spaceDbOf = (name: string): string => `webcockpit-u-${name.toLowerCase()}`;

export const menuFlash = (page: Page): Locator => page.locator('.wc-start .wc-sm-flash');

export type Row = Record<string, unknown>;

/** Puts records into a store of a database the page has already made. */
export async function putIdb(page: Page, db: string, store: string, recs: Row[]): Promise<void> {
  await page.evaluate(
    async ({ db, store, recs }) => {
      const conn = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open(db);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      await new Promise<void>((res, rej) => {
        const t = conn.transaction(store, 'readwrite');
        for (const r of recs) t.objectStore(store).put(r);
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error);
      });
      conn.close();
    },
    { db, store, recs },
  );
}

export async function getIdb(page: Page, db: string, store: string): Promise<Row[]> {
  return page.evaluate(
    async ({ db, store }) => {
      const conn = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open(db);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      if (!conn.objectStoreNames.contains(store)) {
        conn.close();
        return [];
      }
      const rows = await new Promise<Row[]>((res, rej) => {
        const r = conn.transaction(store, 'readonly').objectStore(store).getAll();
        r.onsuccess = () => res(r.result as Row[]);
        r.onerror = () => rej(r.error);
      });
      conn.close();
      return rows;
    },
    { db, store },
  );
}

export const names = async (page: Page, db: string, store = 'profiles'): Promise<string[]> => (await getIdb(page, db, store)).map((r) => r.name as string).sort();
export const profile = (id: string, name: string, text = `#nop ${name}`, t = 1000): Row => ({ id, name, text, created: t, modified: t });

/**
 * The owner row's text once the start menu is there (after a change of
 * space). No pointer moves while the page may be loading: in Firefox a
 * move during a navigation can hang. The helpers below move the pointer
 * off the menu before every action that reloads the page, so the row is
 * not held back by a pointer resting on the rows (start-main.tsx).
 */
export async function owner(page: Page): Promise<string> {
  try {
    await accountRow(page).waitFor({ state: 'visible', timeout: 3000 });
    return (await accountRow(page).textContent({ timeout: 2000 })) ?? '';
  } catch {
    return '';
  }
}

/** Log in from the start menu: the page reloads into the account's space and syncs. */
export async function logIn(page: Page, name = NAME, password = PASSWORD): Promise<void> {
  await openStart(page);
  await awayFromMenu(page);
  // (The owner row comes in once the flags are there, on idle time: a loaded machine may take a while.)
  await expect(accountRow(page)).toBeVisible({ timeout: 15_000 });
  await accountRow(page).click();
  await expect(pageOf(page, 'login')).toBeVisible();
  await submitLogin(page, name, password);
}

/** On the Log in page: the name and the password, Enter (the pointer off the menu first); then the account's space, synced. */
export async function submitLogin(page: Page, name = NAME, password = PASSWORD): Promise<void> {
  await awayFromMenu(page);
  await field(page, 'name').fill(name);
  await field(page, 'password').fill(password);
  await field(page, 'password').press('Enter');
  await expect.poll(() => owner(page), { timeout: 30_000 }).toMatch(new RegExp(`${name}.*synced`, 'i'));
}

/** The Account page from the start menu (logged in). */
export async function account(page: Page): Promise<void> {
  await awayFromMenu(page);
  await accountRow(page).click();
  await expect(pageOf(page, 'account')).toBeVisible();
}

/** Sync now on the Account page, and wait until that sync has ended (its time is a new one). */
export async function syncNow(page: Page): Promise<void> {
  const section = frame(page).locator('[data-sync]');
  await expect(section).toBeVisible();
  await expect(section).not.toHaveAttribute('data-sync', 'syncing', { timeout: 10_000 });
  const before = await section.getAttribute('data-synced-at');
  await btn(page, 'SYNCNOW').click();
  await expect.poll(() => section.getAttribute('data-synced-at'), { timeout: 10_000 }).not.toBe(before);
  await expect(frame(page).locator('[data-sync="synced"]')).toBeVisible({ timeout: 10_000 });
}
