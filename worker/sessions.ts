// Sessions (spec §7.2, ADR 0145): a random 256-bit token in the cookie
// `__Secure-wc_s`, whose path `/api/u` is where everything that needs a
// login lives (the heartbeat, the public endpoints and `/api/auth/*` never
// receive it). The database keeps SHA-256 of the token, so a read of the
// table gives no session away. Table `session`:
// worker/migrations/0002_accounts.sql.
//
// A session lasts 180 days from its last renewal, and is renewed (its
// `last_used` and `expires`, the account's `last_seen`, and the cookie) at
// most once in 24 hours: an ordinary authenticated request writes nothing.
import { SESSION_COOKIE, SESSION_SECONDS } from '../shared/cloud/api.ts';
import { ACCOUNT_COLUMNS, type AccountRow } from './accounts.ts';
import { randomBytes, sha256, toB64url, utf8 } from './bytes.ts';
import { DAY_MS, type D1, type D1Statement } from './runtime.ts';

export const SESSION_MS = SESSION_SECONDS * 1000;
/** A session is renewed when its last renewal is at least this old. */
export const RENEW_MS = DAY_MS;

const ATTRIBUTES = 'HttpOnly; Secure; SameSite=Strict; Path=/api/u';
/** 32 bytes as base64url. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** A session's public id: 12 bytes as base64url. */
export const SESSION_ID = /^[A-Za-z0-9_-]{16}$/;

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; ${ATTRIBUTES}; Max-Age=${SESSION_SECONDS}`;
}

/** Removes the cookie: the same name, path and attributes, no age. */
export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; ${ATTRIBUTES}; Max-Age=0`;
}

/** The session token a request carries (the first cookie of our name), or null when there is none of the right shape. */
export function sessionToken(request: Request): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return TOKEN.test(value) ? value : null;
  }
  return null;
}

/** What the database knows a token by. */
export async function tokenHash(token: string): Promise<string> {
  return toB64url(await sha256(utf8(token)));
}

export interface NewSession {
  idHash: string;
  /** The `Set-Cookie` value that hands the token to the browser. */
  cookie: string;
  /** The insert, for the caller's batch. It adds nothing when the account does not exist (any more). */
  insert: D1Statement;
}

export async function newSession(db: D1, accountId: string, label: string, now: number): Promise<NewSession> {
  const token = toB64url(randomBytes(32));
  const idHash = await tokenHash(token);
  const insert = db
    .prepare(
      `INSERT INTO session (id_hash, id, account, label, created, last_used, expires)
       SELECT ?1, ?2, ?3, ?4, ?5, ?5, ?6 WHERE EXISTS (SELECT 1 FROM account WHERE id = ?3)`,
    )
    .bind(idHash, toB64url(randomBytes(12)), accountId, label, now, now + SESSION_MS);
  return { idHash, cookie: sessionCookie(token), insert };
}

export interface Authed {
  account: AccountRow;
  idHash: string;
  /** Set when this request renewed the session: the cookie to send again. */
  renewed: string | null;
}

/**
 * The session and account of a token, or null when the session is unknown
 * or expired. Renews the session when its last renewal is a day old.
 */
export async function authenticate(db: D1, token: string, now: number): Promise<Authed | null> {
  const idHash = await tokenHash(token);
  const columns = ACCOUNT_COLUMNS.split(', ')
    .map((c) => `a.${c}`)
    .join(', ');
  const row = await db
    .prepare(`SELECT s.last_used AS s_last_used, s.expires AS s_expires, ${columns} FROM session s JOIN account a ON a.id = s.account WHERE s.id_hash = ?1`)
    .bind(idHash)
    .first<AccountRow & { s_last_used: number; s_expires: number }>();
  if (!row || row.s_expires <= now) return null;
  const { s_last_used: lastUsed, s_expires: _expires, ...account } = row;
  let renewed: string | null = null;
  if (now - lastUsed >= RENEW_MS) {
    await db.batch([
      db.prepare('UPDATE session SET last_used = ?2, expires = ?3 WHERE id_hash = ?1').bind(idHash, now, now + SESSION_MS),
      db.prepare('UPDATE account SET last_seen = ?2 WHERE id = ?1').bind(account.id, now),
    ]);
    renewed = sessionCookie(token);
  }
  return { account, idHash, renewed };
}

/** The daily cron's part: sessions past their end. */
export async function pruneSessions(db: D1, now: number): Promise<void> {
  await db.prepare('DELETE FROM session WHERE expires <= ?1').bind(now).run();
}
