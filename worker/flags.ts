// Server flags (spec §7.0 rule 5; ADR 0147, addendum of 2026-11-14). A
// flag's default is the Worker's var `FLAG_<NAME>` (wrangler.jsonc: staging
// on, production off); a row of the D1 table `flag` overrides it, set from
// the admin page. A missing var is off, and without a database (or with a
// failing one) the defaults hold.
//
// The rows are kept for FLAG_CACHE_MS per isolate, so a beat does not read
// D1 for its flag every time; a change from the admin page reaches every
// isolate within that time (and the clients within the 60 s cache of
// /api/config on top).
import { FLAG_NAMES, type FlagName } from '../shared/cloud/api.ts';
import type { AdminFlag } from '../shared/cloud/api.ts';
import { type D1, type Env, truthy } from './runtime.ts';

export const FLAG_CACHE_MS = 30_000;

type Overrides = Partial<Record<FlagName, boolean>>;

const cache = new WeakMap<D1, { at: number; rows: Overrides }>();

/** Drops the cached rows (after a change, and in tests). */
export function forgetFlags(db?: D1): void {
  if (db) cache.delete(db);
}

export function isFlagName(name: string): name is FlagName {
  return (FLAG_NAMES as readonly string[]).includes(name);
}

function flagDefault(env: Env, name: FlagName): boolean {
  const vars: Record<FlagName, unknown> = { stats: env.FLAG_STATS };
  return truthy(vars[name]);
}

async function overrides(env: Env, now: number): Promise<Overrides> {
  const db = env.DB;
  if (!db) return {};
  const hit = cache.get(db);
  if (hit && now - hit.at < FLAG_CACHE_MS && now >= hit.at) return hit.rows;
  try {
    const { results } = await db.prepare('SELECT name, value FROM flag').all<{ name: string; value: number }>();
    const rows: Overrides = {};
    for (const r of results) if (isFlagName(r.name)) rows[r.name] = r.value !== 0;
    cache.set(db, { at: now, rows });
    return rows;
  } catch {
    // A failing database: the defaults hold (and the beat will fail on its own).
    return {};
  }
}

/** Every flag with its value, default and override. */
export async function adminFlags(env: Env, now: number): Promise<Record<FlagName, AdminFlag>> {
  const rows = await overrides(env, now);
  const out = {} as Record<FlagName, AdminFlag>;
  for (const name of FLAG_NAMES) {
    const def = flagDefault(env, name);
    const override = rows[name] ?? null;
    out[name] = { value: override ?? def, default: def, override };
  }
  return out;
}

/** Every flag's effective value. */
export async function flags(env: Env, now: number): Promise<Record<FlagName, boolean>> {
  const all = await adminFlags(env, now);
  const out = {} as Record<FlagName, boolean>;
  for (const name of FLAG_NAMES) out[name] = all[name].value;
  return out;
}

/** Sets a flag's override row. */
export async function setFlag(db: D1, name: FlagName, value: boolean): Promise<void> {
  await db
    .prepare('INSERT INTO flag (name, value) VALUES (?1, ?2) ON CONFLICT (name) DO UPDATE SET value = excluded.value')
    .bind(name, value ? 1 : 0)
    .run();
  forgetFlags(db);
}
