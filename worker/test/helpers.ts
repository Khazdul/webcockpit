// Shared by the worker tests: the real test Worker's env as the router's
// Env, a fixed clock, and an empty database before each test.
import { env } from 'cloudflare:workers';
import { forgetFlags } from '../flags.ts';
import type { D1, Deps, Env } from '../runtime.ts';

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
  await db.batch(['presence', 'device_day', 'stat_sample', 'stat_daily', 'flag'].map((t) => db.prepare(`DELETE FROM ${t}`)));
  forgetFlags(db);
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
