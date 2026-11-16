// The default limits (ADR 0157, owner's pick 4b): the Worker's built-in
// DEFAULT_ACCOUNT_LIMITS (with the var RUN_BYTES_LIMIT for `runBytes`),
// overridden field by field by the table `limit_default` that the admin
// edits from /admin (migration 0007). The rows are read like the flags
// (worker/flags.ts): kept LIMITS_CACHE_MS per isolate, loaded by the router
// before any handler that checks a limit (`loadLimitDefaults`), so
// `defaultLimits` and `limitsOf` (worker/accounts.ts) stay synchronous.
// Without a database, or with a failing one, the built-in values hold.
import { type AccountLimits, DEFAULT_ACCOUNT_LIMITS } from '../shared/cloud/api.ts';
import type { D1, Env } from './runtime.ts';

export const LIMITS_CACHE_MS = 30_000;
/** A limit may be set from 0 to this many times its built-in value (a typo of a zero cannot hand out 50 GB). */
export const LIMIT_FACTOR = 20;
/** The limits counted in bytes (the log's notes show them as KB / MB / GB). */
export const BYTE_LIMITS: ReadonlySet<keyof AccountLimits> = new Set(['itemBytes', 'itemMaxBytes', 'runBytes', 'runMaxBytes', 'payloadMaxBytes']);
export const LIMIT_NAMES = Object.keys(DEFAULT_ACCOUNT_LIMITS) as (keyof AccountLimits)[];

const cache = new WeakMap<D1, { at: number; rows: Partial<AccountLimits> }>();

/** Drops the cached rows (after a change, and in tests). */
export function forgetLimitDefaults(db?: D1): void {
  if (db) cache.delete(db);
}

/** A whole number ≥ 0 from a var (a number or its digits), or null. */
function wholeVar(v: unknown): number | null {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? v : null;
  return typeof v === 'string' && /^\d{1,15}$/.test(v.trim()) ? Number(v.trim()) : null;
}

/** The limits built into the Worker: DEFAULT_ACCOUNT_LIMITS with `runBytes` from the var RUN_BYTES_LIMIT when it is set (ADR 0153). */
export function builtInLimits(env: Pick<Env, 'RUN_BYTES_LIMIT'>): AccountLimits {
  const runBytes = wholeVar(env.RUN_BYTES_LIMIT);
  return runBytes === null ? { ...DEFAULT_ACCOUNT_LIMITS } : { ...DEFAULT_ACCOUNT_LIMITS, runBytes };
}

function isLimitName(k: string): k is keyof AccountLimits {
  return (LIMIT_NAMES as string[]).includes(k);
}

/** Reads the override rows into the isolate's cache when they are older than LIMITS_CACHE_MS. Never throws. */
export async function loadLimitDefaults(env: Pick<Env, 'DB'>, now: number): Promise<Partial<AccountLimits>> {
  const db = env.DB;
  if (!db) return {};
  const hit = cache.get(db);
  if (hit && now - hit.at < LIMITS_CACHE_MS && now >= hit.at) return hit.rows;
  try {
    const { results } = await db.prepare('SELECT name, value FROM limit_default').all<{ name: string; value: number }>();
    const rows: Partial<AccountLimits> = {};
    for (const r of results) if (isLimitName(r.name) && Number.isSafeInteger(r.value) && r.value >= 0) rows[r.name] = r.value;
    cache.set(db, { at: now, rows });
    return rows;
  } catch {
    // A failing database (or one without migration 0007): what was cached, else the built-in values.
    return hit?.rows ?? {};
  }
}

/** The overrides as last loaded (none before the first load). */
export function cachedDefaults(env: Pick<Env, 'DB'>): Partial<AccountLimits> {
  return (env.DB && cache.get(env.DB)?.rows) || {};
}

/** The defaults now: built-in with the admin's overrides as last loaded. */
export function currentDefaults(env: Pick<Env, 'RUN_BYTES_LIMIT' | 'DB'>): AccountLimits {
  return { ...builtInLimits(env), ...cachedDefaults(env) };
}

/**
 * Some fields of AccountLimits as the admin sent them: a plain object of
 * known names, each a whole number from 0 to LIMIT_FACTOR × its built-in
 * value; null for anything else (`400 bad_request`, nothing written).
 */
export function limitsInput(v: unknown, builtIn: AccountLimits): Partial<AccountLimits> | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const out: Partial<AccountLimits> = {};
  for (const [k, n] of Object.entries(v)) {
    if (!isLimitName(k)) return null;
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0 || n > LIMIT_FACTOR * builtIn[k]) return null;
    out[k] = n;
  }
  return out;
}

/** The fields of `values` that differ from `base` (what is stored). */
export function differing(values: Partial<AccountLimits>, base: AccountLimits): Partial<AccountLimits> {
  const out: Partial<AccountLimits> = {};
  for (const k of LIMIT_NAMES) if (values[k] !== undefined && values[k] !== base[k]) out[k] = values[k];
  return out;
}

/** A limit's value as the log's note shows it: bytes as B / KB / MB / GB (of 1024), counts as they are. */
export function limitText(name: keyof AccountLimits, v: number): string {
  if (!BYTE_LIMITS.has(name)) return String(v);
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = v;
  let u = 0;
  while (n >= 1024 && u < units.length - 1 && (n / 1024) * 10 === Math.round((n / 1024) * 10)) {
    n /= 1024;
    u++;
  }
  return `${n} ${units[u]}`;
}

/** The changes from `before` to `after` as the log's note: `runBytes 50 MB → 200 MB, items 2000 → 3000`; 'no change' when none. */
export function changeNote(before: AccountLimits, after: AccountLimits): string {
  const parts = LIMIT_NAMES.filter((k) => before[k] !== after[k]).map((k) => `${k} ${limitText(k, before[k])} → ${limitText(k, after[k])}`);
  return parts.length ? parts.join(', ') : 'no change';
}
