// "N online" on the start page (spec §7.6, ADR 0147): `GET
// /api/stats/public` when the flag `stats` is on. Loaded on idle time by
// the almanac (src/chrome/start-online.ts); null whenever there is nothing
// to show (the flag off, no API, a failed or malformed answer).
//
// Stage 65 (ADR 0155, the guests' counter): the same answer carries
// `listed` with the flag `gallery` on, and the start menu's Community row
// counts from it (src/cloud/community/counter.ts). The two readers share
// one request: an answer is kept `PUBLIC_STATS_KEEP_MS` (under the
// server's own `max-age`), so the almanac and the counter never ask twice.

import type { PublicStats } from '../../shared/cloud/api.ts';
import { type FetchLike, apiAllowed, flagOn, getJson } from './config';

const count = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** `COUNTER_RUNS` of shared/cloud/api.ts, written out (the start page does not load that module). */
const LISTED_MAX = 99;

/** `GET /api/stats/public`'s body, or null when it is not the contract's (`listed` kept only when it is a list of times). */
export function parsePublicStats(data: unknown): PublicStats | null {
  if (!data || typeof data !== 'object') return null;
  const { online, playing, listed } = data as { online?: unknown; playing?: unknown; listed?: unknown };
  if (!count(online) || !count(playing)) return null;
  const out: PublicStats = { online, playing };
  if (Array.isArray(listed) && listed.length <= LISTED_MAX && listed.every(count)) out.listed = listed;
  return out;
}

/** The public numbers (never rejects; null on any failure). */
export async function fetchPublicStats(fetchFn?: FetchLike, url = '/api/stats/public'): Promise<PublicStats | null> {
  return parsePublicStats(await getJson(url, fetchFn));
}

/** An answer is reused this long (ms): the server caches it 60 s. */
export const PUBLIC_STATS_KEEP_MS = 55_000;

let kept: { at: number; got: Promise<PublicStats | null> } | null = null;

/**
 * The public numbers when `stats` is on, or `share` and `gallery` (the
 * Worker answers with either), one request per `PUBLIC_STATS_KEEP_MS` for
 * every reader; null otherwise or on any failure. Never rejects.
 */
export async function publicStats(now = Date.now()): Promise<PublicStats | null> {
  if (!apiAllowed()) return null;
  if (!(await flagOn('stats')) && !((await flagOn('gallery')) && (await flagOn('share')))) return null;
  if (!kept || now - kept.at >= PUBLIC_STATS_KEEP_MS || now < kept.at) kept = { at: now, got: fetchPublicStats() };
  const got = kept.got;
  const s = await got;
  // A failure is not kept: the next reader asks again.
  if (s === null && kept?.got === got) kept = null;
  return s;
}

/** The start page's line: the number online when the flag is on and the server answers, else null. */
export async function onlineNow(): Promise<number | null> {
  if (!(await flagOn('stats'))) return null;
  const s = await publicStats();
  return s && s.online > 0 ? s.online : null;
}

/** The guests' counter: the newest listed times, or null (the flags off, a failure, an older Worker). */
export async function listedNow(): Promise<number[] | null> {
  return (await publicStats())?.listed ?? null;
}

/** The line's text. */
export const onlineText = (n: number): string => `${n} online`;

/** Tests: forget the kept answer. */
export function resetPublicStatsForTest(): void {
  kept = null;
}
