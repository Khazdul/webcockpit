// Where a logged-in account lives on the device (stage 60, ADR 0145 "As
// built (stage 60 part B)"): a small IndexedDB database of its own.
//
// Database `webcockpit-account`, version 1:
//
//   account   out-of-line keys; one record under key 'self':
//             { name, created, label, savedAt, dataKey, idKey }
//
// `dataKey` (AES-256-GCM) and `idKey` (HMAC-SHA-256) are the two
// non-extractable `CryptoKey`s of src/cloud/crypto/root.ts, stored as
// objects (structured clone): the browser keeps the key material and no
// script can read it out, here or after a reopen. Nothing else secret is
// stored: no password, no recovery code, no root, no wrap (`GET
// /api/u/account` hands the password wrap out when a password question
// needs it), and the session is a cookie the page cannot read.
//
// Why not the main database (src/core/db.ts): its next version, 9, is
// stage 61's (the sync state). Stage 60 must not migrate anybody's main
// database, and with the flag off nothing on a device may change. A
// database of its own also makes "remove the account from this device"
// one operation: the database is deleted.
//
// No connection is kept: every operation opens, does its one transaction
// and closes, so a delete (here or in another tab) is never blocked for
// long. A read never makes a database where there was none: its open
// aborts the upgrade that would create one, which is one atomic step for
// the browser (nothing is created and then deleted, so a read cannot take
// away what another tab is writing; stage 60 review).

import { NAME_PATTERN } from '../../../shared/cloud/api.ts';
import { DB_NAME } from '../../core/db';

export const ACCOUNT_DB_NAME = `${DB_NAME}-account`;
export const ACCOUNT_DB_VERSION = 1;
const STORE = 'account';
const KEY = 'self';

/** The account of this device. */
export interface StoredAccount {
  /** As the server spells it (as typed at registration). */
  name: string;
  /** When the account was made (the server's `created`, ms). */
  created: number;
  /** What this device called itself when it logged in ("Firefox on Linux"). */
  label: string;
  /** When this device logged in (ms). */
  savedAt: number;
  /** AES-256-GCM, non-extractable: items and run bodies (stage 61 on). */
  dataKey: CryptoKey;
  /** HMAC-SHA-256, non-extractable: opaque ids. */
  idKey: CryptoKey;
}

/** The store as the flows use it (tests pass their own). */
export interface AccountStore {
  /**
   * The stored account, or null: there is none (no database, no record, or
   * a record this file did not write). REJECTS when the database could not
   * be read (blocked, a browser error): that is not "nobody is logged in".
   */
  read(): Promise<StoredAccount | null>;
  /** Stores the account, replacing any other. Rejects when the device cannot keep it. */
  write(account: StoredAccount): Promise<void>;
  /** Removes the account and its keys from this device (deletes the database). True when it is gone. Never rejects. */
  remove(): Promise<boolean>;
  /** True when this device can keep non-extractable keys in IndexedDB (asked before an account is made). Never rejects. */
  works(): Promise<boolean>;
}

function isKey(v: unknown, algorithm: string, usage: KeyUsage): v is CryptoKey {
  if (typeof CryptoKey === 'undefined' || !(v instanceof CryptoKey)) return false;
  return v.type === 'secret' && v.extractable === false && v.algorithm.name === algorithm && v.usages.includes(usage);
}

/** True for a record this file wrote: the names, the times and two non-extractable keys of the right kinds. */
export function isStoredAccount(v: unknown): v is StoredAccount {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.name === 'string' &&
    NAME_PATTERN.test(r.name) &&
    typeof r.created === 'number' &&
    typeof r.label === 'string' &&
    typeof r.savedAt === 'number' &&
    isKey(r.dataKey, 'AES-GCM', 'encrypt') &&
    isKey(r.idKey, 'HMAC', 'sign')
  );
}

/**
 * Opens the database. `create` false (a read): where there is no database
 * the upgrade is aborted, so none is made, and the answer is null.
 */
function open(factory: IDBFactory, create: boolean): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let absent = false;
    const r = factory.open(ACCOUNT_DB_NAME, ACCOUNT_DB_VERSION);
    r.onupgradeneeded = (ev) => {
      if (ev.oldVersion >= 1) return;
      if (create) {
        r.result.createObjectStore(STORE);
        return;
      }
      absent = true;
      try {
        r.transaction?.abort();
      } catch {
        /* the open fails all the same */
      }
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => db.close();
      if (absent) {
        // (Not reached in a browser that follows the standard: an aborted upgrade fails the open.)
        db.close();
        resolve(null);
      } else resolve(db);
    };
    r.onerror = (ev) => {
      if (absent) {
        ev.preventDefault();
        resolve(null);
      } else reject(r.error ?? new Error('the account database could not be opened'));
    };
    r.onblocked = () => reject(new Error('the account database is blocked by another tab'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('the transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('the transaction was aborted'));
  });
}

function drop(factory: IDBFactory): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const r = factory.deleteDatabase(ACCOUNT_DB_NAME);
      r.onsuccess = () => resolve(true);
      r.onerror = () => resolve(false);
      // Blocked by a connection of another tab: it closes on `versionchange`
      // (above), and the delete then goes through; `onsuccess` follows.
    } catch {
      resolve(false);
    }
  });
}

export function createAccountStore(factory: IDBFactory | undefined = globalThis.indexedDB): AccountStore {
  async function read(): Promise<StoredAccount | null> {
    if (!factory) return null;
    const db = await open(factory, false);
    if (!db) return null;
    try {
      // A database without the store is not one this file made.
      if (!db.objectStoreNames.contains(STORE)) return null;
      const tx = db.transaction(STORE, 'readonly');
      const record = await new Promise<unknown>((resolve, reject) => {
        const r = tx.objectStore(STORE).get(KEY);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error ?? new Error('the account could not be read'));
      });
      return isStoredAccount(record) ? record : null;
    } finally {
      db.close();
    }
  }

  async function write(account: StoredAccount): Promise<void> {
    if (!factory) throw new Error('IndexedDB unavailable');
    if (!isStoredAccount(account)) throw new Error('not an account record');
    const db = await open(factory, true);
    if (!db) throw new Error('the account database could not be made');
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const { name, created, label, savedAt, dataKey, idKey } = account;
      tx.objectStore(STORE).put({ name, created, label, savedAt, dataKey, idKey } satisfies StoredAccount, KEY);
      await done(tx);
    } finally {
      db.close();
    }
  }

  async function remove(): Promise<boolean> {
    return factory ? drop(factory) : true;
  }

  /**
   * Stores a throwaway non-extractable key and reads it back, in a
   * database of another name that is deleted again. (Private windows of
   * some browsers have no IndexedDB, or one that refuses keys.)
   */
  async function works(): Promise<boolean> {
    if (!factory) return false;
    const probe = `${ACCOUNT_DB_NAME}-probe`;
    try {
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = factory.open(probe, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.onblocked = () => reject(new Error('blocked'));
      });
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(key, KEY);
        const got = await new Promise<unknown>((resolve, reject) => {
          const r = tx.objectStore(STORE).get(KEY);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        await done(tx);
        return isKey(got, 'AES-GCM', 'encrypt');
      } finally {
        db.close();
        await new Promise<void>((resolve) => {
          const r = factory.deleteDatabase(probe);
          r.onsuccess = r.onerror = r.onblocked = () => resolve();
        });
      }
    } catch {
      return false;
    }
  }

  return { read, write, remove, works };
}
