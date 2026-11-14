// The sync lock (spec §7.4 step 1): one tab of the browser syncs at a
// time. The engine takes a `SyncLock`; the page passes `webSyncLock()`,
// the tests `noLock`.

import type { SyncLock } from './types';

export const SYNC_LOCK_NAME = 'webcockpit-sync';

/** No lock (tests, and a browser without Web Locks, where one tab is assumed to sync). */
export const noLock: SyncLock = { run: (fn) => fn() };

/**
 * The Web Lock `webcockpit-sync`, exclusive, waited for: a second tab's
 * sync runs after the first and then finds little to do. `noLock`
 * without `navigator.locks`.
 */
export function webSyncLock(locks: LockManager | undefined = globalThis.navigator?.locks): SyncLock {
  if (!locks) return noLock;
  return { run: (fn) => locks.request(SYNC_LOCK_NAME, { mode: 'exclusive' }, fn) };
}
