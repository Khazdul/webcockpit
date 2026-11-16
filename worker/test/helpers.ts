// Shared by the worker tests: the real test Worker's env as the router's
// Env, a fixed clock, and an empty database before each test.
import { env } from 'cloudflare:workers';
import { forgetFlags } from '../flags.ts';
import { forgetLimitDefaults } from '../limits.ts';
import type { D1, Deps, Env, R2 } from '../runtime.ts';

export const realEnv = env as unknown as Env;
export const db = realEnv.DB as D1;

/** The router's env with some bindings or vars replaced (undefined removes one). */
export function envWith(over: Partial<Record<keyof Env, unknown>>): Env {
  const out = { ...realEnv } as Record<string, unknown>;
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out as unknown as Env;
}

/** Deps with a fixed clock (and no network unless given). */
export function at(now: number, fetch?: Deps['fetch']): Deps {
  return {
    now: () => now,
    fetch: fetch ?? (async () => new Response('no network in tests', { status: 599 })),
  };
}

export const T = (iso: string): number => Date.parse(iso);

export async function emptyTables(): Promise<void> {
  await db.batch(['presence', 'device_day', 'stat_sample', 'stat_daily', 'flag', 'account', 'reserved_name', 'session', 'attempt', 'item', 'session_end', 'run_body', 'r2_sweep', 'publication', 'pub_view', 'report', 'vote', 'comment', 'note', 'mume_cache', 'limit_default'].map((t) => db.prepare(`DELETE FROM ${t}`)));
  await emptyAdminLog();
  forgetFlags(db);
  forgetLimitDefaults(db);
  await emptyBucket();
}

/**
 * Empties `admin_log`, which the database refuses (migration 0007's
 * triggers): the tests only, by dropping the triggers for the moment, as
 * someone with the D1 console could. The triggers come back as they were.
 */
export async function emptyAdminLog(): Promise<void> {
  await withoutLogTriggers(async () => {
    await db.batch([db.prepare('DELETE FROM admin_log'), db.prepare('DELETE FROM admin_log_meta'), db.prepare('INSERT INTO admin_log_meta (legacy_max) VALUES (0)')]);
  });
}

/**
 * Sets where the chain starts (`admin_log_meta.legacy_max`, which
 * migration 0007 writes once and the database then keeps): entries up to
 * `id` count as written before stage 66.
 */
export async function setLegacyMax(id: number): Promise<void> {
  await withoutLogTriggers(async () => {
    await db.prepare('UPDATE admin_log_meta SET legacy_max = ?1').bind(id).run();
  });
}

/** Runs `f` with admin_log's and admin_log_meta's triggers dropped (as the D1 console could), then puts them back. */
export async function withoutLogTriggers(f: () => Promise<void>): Promise<void> {
  const { results } = await db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN ('admin_log', 'admin_log_meta')")
    .all<{ name: string; sql: string }>();
  if (results.length) await db.batch(results.map((t) => db.prepare(`DROP TRIGGER ${t.name}`)));
  try {
    await f();
  } finally {
    if (results.length) await db.batch(results.map((t) => db.prepare(t.sql)));
  }
}

export const bucket = realEnv.FILES as R2;

/** Every key in the test bucket (under `prefix`). */
export async function r2Keys(prefix = ''): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await bucket.list(cursor ? { prefix, cursor } : { prefix });
    out.push(...page.objects.map((o) => o.key));
    if (!page.truncated || !page.cursor) return out;
    cursor = page.cursor;
  }
}

async function emptyBucket(): Promise<void> {
  const keys = await r2Keys();
  for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
}

/**
 * The test bucket with faults: `fail` names the methods that throw (as R2
 * does when it is down), `calls` counts what was asked of it, and
 * `putSize` makes a put report a stored size other than the real one.
 */
export function faultyBucket(o: { fail?: (keyof R2)[]; putSize?: number; failListAfter?: number } = {}): R2 & { calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const count = (m: string): number => (calls[m] = (calls[m] ?? 0) + 1);
  const guard = (m: keyof R2): void => {
    const n = count(m);
    if (o.fail?.includes(m)) throw new Error(`R2 ${m} failed`);
    if (m === 'list' && o.failListAfter !== undefined && n > o.failListAfter) throw new Error('R2 list failed');
  };
  return {
    calls,
    async put(key, value, options) {
      guard('put');
      const head = await bucket.put(key, value, options);
      return head && o.putSize !== undefined ? { key: head.key, size: o.putSize } : head;
    },
    async get(key) {
      guard('get');
      return bucket.get(key);
    },
    async head(key) {
      guard('head');
      return bucket.head(key);
    },
    async delete(keys) {
      guard('delete');
      return bucket.delete(keys);
    },
    async list(options) {
      guard('list');
      return bucket.list(options);
    },
  };
}

export async function count(table: string): Promise<number> {
  return ((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? 0);
}

let n = 0;
/** A fresh device id (a v4-shaped UUID, lowercase). */
export function device(): string {
  n++;
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}
