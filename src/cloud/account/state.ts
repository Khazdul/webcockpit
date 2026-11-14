// The account as the start page needs to know it (stage 60, ADR 0145 "As
// built (stage 60 part B)"): is the feature on, and who is logged in on
// this device. Small on purpose: this is the ONE file of src/cloud/account
// that the start menu may import statically. It imports no crypto, no
// IndexedDB and no API client; everything else of the account is loaded
// with `import()` when an account page is opened (spec §7.0 rules 1–2).
//
// Where the answer comes from: a hint in localStorage, written by the
// account's flows (flows.ts) right after the keys were stored in, or
// removed from, the account's own database (store.ts):
//
//   wc.account       {"name":"Olev"} while an account is logged in here
//   wc.account.last  the last name logged in here (the Log in page's prefill)
//
// The hint is read synchronously, so the start page knows the name on its
// first frame, and the browser's `storage` event keeps the other tabs in
// step for free. It is a hint, not the truth: the keys live in IndexedDB
// and the session in a cookie the page cannot read. The flows reconcile
// (a hint without stored keys, or a session the server no longer knows,
// ends as "logged out on this device"; keys without a hint put the hint
// back). The name is public; nothing secret is ever written here.
//
// Where localStorage cannot be written (full, blocked) the flows' word is
// kept in memory instead (`held`), so the account works in this tab and
// the start page's row follows it; after a reload the account pages find
// the keys and say so again (stage 60 review, finding 4).
//
// Nothing here makes a request by itself: `watchAccountState` asks for the
// flags (`/api/config`, fetched once per page load and shared with the
// rest of the cloud client), and only when the page may call the API.

import { apiAllowed, flagOn } from '../config';

export const ACCOUNT_HINT_KEY = 'wc.account';
export const ACCOUNT_LAST_KEY = 'wc.account.last';

export interface AccountState {
  /**
   * The feature: null until `watchAccountState` has the server's flags,
   * then true when the flag `accounts` is on and this page may call the
   * API. While it is not true, nothing of accounts may show.
   */
  enabled: boolean | null;
  /** The account logged in on this device, spelled as the server spells it; null: nobody. */
  name: string | null;
  /** The last name logged in here, for the Log in page's prefill; null: none. */
  lastName: string | null;
}

type Listener = (state: AccountState) => void;

const listeners = new Set<Listener>();
let enabled: boolean | null = null;
let watching: Promise<AccountState> | null = null;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // storage blocked
  }
}

/**
 * A user name: `NAME_PATTERN` of shared/cloud/api.ts, written out so that
 * the start page does not load that file for one expression (a unit test
 * holds the two together).
 */
export const HINT_NAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;

const nameOf = (v: unknown): string | null => (typeof v === 'string' && HINT_NAME_PATTERN.test(v) ? v : null);

function readHint(): string | null {
  try {
    const raw = storage()?.getItem(ACCOUNT_HINT_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' ? nameOf((v as { name?: unknown }).name) : null;
  } catch {
    return null;
  }
}

function readLast(): string | null {
  try {
    return nameOf(storage()?.getItem(ACCOUNT_LAST_KEY));
  } catch {
    return null;
  }
}

/** What the flows said when localStorage would not take it: `[name]`; null: localStorage is right. */
let held: [string | null] | null = null;

/** The state now. Cheap and synchronous (two localStorage reads). */
export function accountState(): AccountState {
  return { enabled, name: held ? held[0] : readHint(), lastName: readLast() };
}

/** What the listeners were last told, so that a change of nothing (two storage events of one login) is not told twice. */
let told: string | null = null;

function emit(): void {
  const state = accountState();
  const now = JSON.stringify(state);
  if (now === told) return;
  told = now;
  for (const fn of [...listeners]) {
    try {
      fn(state);
    } catch {
      /* a listener's problem */
    }
  }
}

/**
 * Calls `fn` with the new state whenever it changes: a flow of this tab
 * logged in or out, another tab did, or the flags arrived. Not called at
 * once: read `accountState()` for the first value. One change can come
 * as two calls (another tab's login sets `lastName`, then `name`).
 * Returns the unsubscribe function.
 */
export function onAccountState(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when accounts are on for this page: it may call the API and the server has the flag `accounts` on. Never rejects. */
export async function accountsEnabled(): Promise<boolean> {
  try {
    return apiAllowed() && (await flagOn('accounts'));
  } catch {
    return false;
  }
}

/**
 * Starts the state for this page (idempotent): listens for the other
 * tabs' changes and asks for the flag. Resolves to the state once
 * `enabled` is known. Call it on idle time (the start menu does); never
 * rejects.
 */
export function watchAccountState(): Promise<AccountState> {
  watching ??= (async () => {
    try {
      globalThis.addEventListener?.('storage', (e) => {
        const key = (e as StorageEvent).key;
        // null: the whole storage was cleared.
        if (key !== null && key !== ACCOUNT_HINT_KEY && key !== ACCOUNT_LAST_KEY) return;
        // Another tab wrote: localStorage speaks again.
        held = null;
        emit();
      });
    } catch {
      /* no window */
    }
    enabled = await accountsEnabled();
    emit();
    return accountState();
  })();
  return watching;
}

/** The flows': an account is now logged in on this device. */
export function noteLoggedIn(name: string): void {
  try {
    const s = storage();
    // The prefill first: another tab hears of each write by itself.
    s?.setItem(ACCOUNT_LAST_KEY, name);
    s?.setItem(ACCOUNT_HINT_KEY, JSON.stringify({ name }));
  } catch {
    /* storage full or blocked: kept in memory below */
  }
  held = readHint() === name ? null : [name];
  emit();
}

/**
 * The flows': nobody is logged in on this device any more. The last name
 * stays for the Log in page unless `forgetName` (the account was deleted).
 */
export function noteLoggedOut(o: { forgetName?: boolean } = {}): void {
  try {
    const s = storage();
    s?.removeItem(ACCOUNT_HINT_KEY);
    if (o.forgetName) s?.removeItem(ACCOUNT_LAST_KEY);
  } catch {
    /* storage blocked: kept in memory below */
  }
  held = readHint() === null ? null : [null];
  emit();
}

/** Tests: forget the flag and the listeners. */
export function resetAccountStateForTest(): void {
  listeners.clear();
  held = null;
  told = null;
  enabled = null;
  watching = null;
}
