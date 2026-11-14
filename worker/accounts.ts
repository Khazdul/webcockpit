// The account row and what its owner is shown of it (spec §7.2, §7.11,
// ADR 0145), and the checks on what a browser sends for one. Table
// `account`: worker/migrations/0002_accounts.sql.
import {
  AUTH_KEY_BYTES,
  type Account,
  type AccountLimits,
  type AccountPrefs,
  type AccountSession,
  DEFAULT_ACCOUNT_LIMITS,
  KDF_MAX_ROUNDS,
  KDF_MIN_ROUNDS,
  KDF_NAME,
  type Kdf,
  LABEL_MAX_LENGTH,
  NAME_PATTERN,
  SALT_MAX_BYTES,
  SALT_MIN_BYTES,
  WRAP_MAX_BYTES,
  WRAP_MIN_BYTES,
} from '../shared/cloud/api.ts';
import { fromB64url, sha256, toB64url } from './bytes.ts';
import type { D1 } from './runtime.ts';

/** A row of `account`, as far as the Worker reads it. */
export interface AccountRow {
  id: string;
  name: string;
  name_key: string;
  created: number;
  state: string;
  salt: string;
  kdf: string;
  auth_hash: string;
  recovery_hash: string;
  wrap_pw: string;
  wrap_rc: string;
  limits: string | null;
  prefs: string;
}

export const ACCOUNT_COLUMNS = 'id, name, name_key, created, state, salt, kdf, auth_hash, recovery_hash, wrap_pw, wrap_rc, limits, prefs';

/**
 * Names nobody can register, besides those of deleted accounts
 * (`reserved_name`): they would read as the site speaking.
 */
export const BUILTIN_RESERVED: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'moderator',
  'mod',
  'webcockpit',
  'cockpit',
  'mume',
  'abuse',
  'support',
  'system',
  'root',
  'staff',
  'owner',
  'official',
  'anonymous',
  'deleted',
]);

// --- What a browser sends ---

/** A user name as typed and its key (lowercase), or null. */
export function nameOf(v: unknown): { name: string; key: string } | null {
  return typeof v === 'string' && NAME_PATTERN.test(v) ? { name: v, key: v.toLowerCase() } : null;
}

/** The bytes of a base64url value of `min`–`max` bytes, or null. */
export function bytesOf(v: unknown, min: number, max: number): Uint8Array<ArrayBuffer> | null {
  if (typeof v !== 'string' || v.length > Math.ceil((max * 4) / 3)) return null;
  const bytes = fromB64url(v);
  return bytes && bytes.length >= min && bytes.length <= max ? bytes : null;
}

/** A base64url value of `min`–`max` bytes as it came (one value has one spelling), or null. */
function textOf(v: unknown, min: number, max: number): string | null {
  return bytesOf(v, min, max) ? (v as string) : null;
}

export const saltOf = (v: unknown): string | null => textOf(v, SALT_MIN_BYTES, SALT_MAX_BYTES);
export const wrapOf = (v: unknown): string | null => textOf(v, WRAP_MIN_BYTES, WRAP_MAX_BYTES);

/** What is stored of `authKey` or `recoveryAuth`: SHA-256 of its 32 bytes, base64url. Null when it is not 32 bytes. */
export async function keyHashOf(v: unknown): Promise<string | null> {
  const bytes = bytesOf(v, AUTH_KEY_BYTES, AUTH_KEY_BYTES);
  return bytes ? toB64url(await sha256(bytes)) : null;
}

/** True when `o` is a plain object with exactly the keys `required`, and perhaps some of `optional`. */
export function hasKeys(o: unknown, required: readonly string[], optional: readonly string[] = []): o is Record<string, unknown> {
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return false;
  const keys = Object.keys(o);
  return required.every((k) => Object.hasOwn(o, k)) && keys.every((k) => required.includes(k) || optional.includes(k));
}

export function kdfOf(v: unknown): Kdf | null {
  if (!hasKeys(v, ['name', 'rounds'])) return null;
  const { name, rounds } = v;
  if (name !== KDF_NAME || typeof rounds !== 'number' || !Number.isInteger(rounds)) return null;
  return rounds >= KDF_MIN_ROUNDS && rounds <= KDF_MAX_ROUNDS ? { name: KDF_NAME, rounds } : null;
}

/** A session's label: what is printable ASCII of it, trimmed and cut. Null when it is not a string (or absurdly long). */
export function labelOf(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 400) return null;
  return v
    .replace(/[^\x20-\x7e]/g, '')
    .trim()
    .slice(0, LABEL_MAX_LENGTH)
    .trim();
}

/** The password's side of an account, checked and as it is stored. */
export interface StoredPassword {
  salt: string;
  kdf: string;
  authHash: string;
  wrapPw: string;
}

/** From an object that has `salt`, `kdf`, `authKey` and `wrapPw` (its other keys are the caller's). */
export async function passwordOf(o: Record<string, unknown>): Promise<StoredPassword | null> {
  const salt = saltOf(o.salt);
  const kdf = kdfOf(o.kdf);
  const authHash = await keyHashOf(o.authKey);
  const wrapPw = wrapOf(o.wrapPw);
  return salt && kdf && authHash && wrapPw ? { salt, kdf: JSON.stringify(kdf), authHash, wrapPw } : null;
}

export const PASSWORD_KEYS = ['salt', 'kdf', 'authKey', 'wrapPw'] as const;

// --- What the owner is shown ---

function parsed(text: string | null): Record<string, unknown> {
  if (!text) return {};
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The defaults with what the account's `limits` column overrides (whole numbers ≥ 0 of known names). */
export function limitsOf(row: Pick<AccountRow, 'limits'>): AccountLimits {
  const out = { ...DEFAULT_ACCOUNT_LIMITS };
  const own = parsed(row.limits);
  for (const k of Object.keys(out) as (keyof AccountLimits)[]) {
    const v = own[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) out[k] = v;
  }
  return out;
}

export function prefsOf(row: Pick<AccountRow, 'prefs'>): AccountPrefs {
  return { galleryNotice: parsed(row.prefs).galleryNotice !== false };
}

/** The stored KDF parameters of an account. */
export function storedKdf(row: Pick<AccountRow, 'kdf'>): Kdf {
  const rounds = parsed(row.kdf).rounds;
  return { name: KDF_NAME, rounds: typeof rounds === 'number' ? rounds : KDF_MIN_ROUNDS };
}

export async function accountByKey(db: D1, nameKey: string): Promise<AccountRow | null> {
  return db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM account WHERE name_key = ?1`).bind(nameKey).first<AccountRow>();
}

/** The account as its owner sees it, with its live sessions; `idHash` is the asking session's. */
export async function accountView(db: D1, row: AccountRow, idHash: string, now: number): Promise<Account> {
  const { results } = await db
    .prepare('SELECT id, id_hash, label, created, last_used FROM session WHERE account = ?1 AND expires > ?2 ORDER BY last_used DESC, created DESC, id')
    .bind(row.id, now)
    .all<{ id: string; id_hash: string; label: string; created: number; last_used: number }>();
  const sessions: AccountSession[] = results.map((s) => ({
    id: s.id,
    label: s.label,
    created: s.created,
    lastUsed: s.last_used,
    current: s.id_hash === idHash,
  }));
  return {
    name: row.name,
    created: row.created,
    state: row.state === 'suspended' ? 'suspended' : 'active',
    // The tables these count come with their stages (61: items, 63: run bodies).
    usage: { items: 0, itemBytes: 0, runBytes: 0 },
    limits: limitsOf(row),
    sessions,
    prefs: prefsOf(row),
  };
}
