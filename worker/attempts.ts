// The attempt counters (spec §7.10, ADR 0145): login and recovery
// failures per name, registrations per address. Table `attempt`
// (worker/migrations/0002_accounts.sql): one row per key with the start of
// its window, the tries in it and the end of a lock.
//
// No name and no address is a key. A name's key is an HMAC of its
// lowercase form under AUTH_PEPPER (people type passwords into name
// fields). An address's key is an HMAC under a pepper that is itself
// derived from AUTH_PEPPER and the UTC day, so yesterday's rows cannot be
// tied to an address even by us, and the daily cron removes them.
//
// A window is fixed: it starts with its first try and lasts its length;
// the first try after it starts a new one.
import { LOGIN_LOCK_AFTER, LOGIN_WINDOW_SECONDS } from '../shared/cloud/api.ts';
import { hmac, toB64url } from './bytes.ts';
import { DAY_MS, type D1, type D1Statement, utcDay } from './runtime.ts';

type Bytes = Uint8Array<ArrayBuffer>;

/** The window of login and recovery failures, and the length of the lock after the tenth. */
export const GUESS_WINDOW_MS = LOGIN_WINDOW_SECONDS * 1000;
export const LOCK_MS = LOGIN_WINDOW_SECONDS * 1000;
export const HOUR_MS = 3_600_000;

export type GuessKind = 'login' | 'recover';

/** The counter key of a name's login or recovery failures. */
export async function nameCounter(pepper: Bytes, kind: GuessKind, nameKey: string): Promise<string> {
  return `${kind}|${toB64url(await hmac(pepper, `wc-name|${nameKey}`))}`;
}

/** The counter keys (hour, day) of an address's (address.ts: its key's) registrations on the UTC day of `now`. */
export async function addressCounters(pepper: Bytes, address: string, now: number): Promise<{ hour: string; day: string }> {
  const daily = await hmac(pepper, `wc-addr|${utcDay(now)}`);
  const who = toB64url(await hmac(daily, address));
  return { hour: `reg-h|${who}`, day: `reg-d|${who}` };
}

export interface Counter {
  /** Tries in the running window (0 when there is none). */
  count: number;
  /** Seconds left of a lock, rounded up (0: not locked). */
  lockedFor: number;
}

function counterOf(row: { start: number; count: number; until: number } | null | undefined, now: number, windowMs: number): Counter {
  if (!row) return { count: 0, lockedFor: 0 };
  return {
    count: now - row.start >= windowMs ? 0 : row.count,
    lockedFor: row.until > now ? Math.ceil((row.until - now) / 1000) : 0,
  };
}

/** Reads counters without changing them. */
export async function peek(db: D1, keys: string[], now: number, windowMs: number): Promise<Counter[]> {
  const marks = keys.map((_, i) => `?${i + 1}`).join(', ');
  const { results } = await db
    .prepare(`SELECT key, start, count, until FROM attempt WHERE key IN (${marks})`)
    .bind(...keys)
    .all<{ key: string; start: number; count: number; until: number }>();
  return keys.map((k) => counterOf(results.find((r) => r.key === k), now, windowMs));
}

/**
 * Counts one guess (a login or a recovery try) before it is looked at, in
 * one statement, so guesses racing each other cannot all slip under the
 * limit: the caller evaluates the guess only when the count it gets back
 * is within LOGIN_LOCK_AFTER. The try that makes the count reach it (or
 * finds it past it with no lock running) sets the lock. A success takes
 * its own try back (`takeBack`); nothing else lowers a counter, so what an
 * outsider sees of it does not tell when the owner logged in.
 */
export async function reserveGuess(db: D1, key: string, now: number): Promise<Counter> {
  const row = await db
    .prepare(
      `INSERT INTO attempt (key, start, count, until) VALUES (?1, ?2, 1, 0)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN ?2 - start >= ?3 THEN 1 ELSE count + 1 END,
         until = CASE WHEN ?2 - start >= ?3 THEN 0 WHEN count + 1 >= ?4 AND until <= ?2 THEN ?2 + ?5 ELSE until END,
         start = CASE WHEN ?2 - start >= ?3 THEN ?2 ELSE start END
       RETURNING start, count, until`,
    )
    .bind(key, now, GUESS_WINDOW_MS, LOGIN_LOCK_AFTER, LOCK_MS)
    .first<{ start: number; count: number; until: number }>();
  return counterOf(row, now, GUESS_WINDOW_MS);
}

/**
 * After a success: takes back the try that `reserveGuess` counted for it,
 * `count` being what that call returned. The lock is undone only when this
 * very try had set it (it was the one that reached LOGIN_LOCK_AFTER).
 * Failures stay counted until their window ends; the cron removes the row.
 */
export function takeBack(db: D1, key: string, count: number): D1Statement {
  return db
    .prepare('UPDATE attempt SET count = count - 1, until = CASE WHEN ?2 = 1 THEN 0 ELSE until END WHERE key = ?1 AND count > 0')
    .bind(key, count === LOGIN_LOCK_AFTER ? 1 : 0);
}

/**
 * Counts one registration of an address, for the batch that makes the
 * account: nothing is counted unless the account `accountId` exists by
 * then (a name that was taken costs the address nothing).
 */
export function countRegistration(db: D1, key: string, now: number, windowMs: number, accountId: string): D1Statement {
  return db
    .prepare(
      `INSERT INTO attempt (key, start, count, until)
       SELECT ?1, ?2, 1, 0 WHERE EXISTS (SELECT 1 FROM account WHERE id = ?4)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN ?2 - start >= ?3 THEN 1 ELSE count + 1 END,
         start = CASE WHEN ?2 - start >= ?3 THEN ?2 ELSE start END`,
    )
    .bind(key, now, windowMs, accountId);
}

/**
 * The daily cron's part: counters whose window began more than a day ago
 * and that hold no running lock. (The longest window is a day, and the
 * address keys of a past day can no longer be made.)
 */
export async function pruneAttempts(db: D1, now: number): Promise<void> {
  await db
    .prepare('DELETE FROM attempt WHERE start < ?1 AND until < ?2')
    .bind(now - DAY_MS, now)
    .run();
}
