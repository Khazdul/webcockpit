// "N online" on the start page (spec §7.6, ADR 0147): `GET
// /api/stats/public` when the flag `stats` is on. Loaded on idle time by
// the almanac (src/chrome/start-online.ts); null whenever there is nothing
// to show (the flag off, no API, a failed or malformed answer).

import type { PublicStats } from '../../shared/cloud/api.ts';
import { type FetchLike, flagOn, getJson } from './config';

const count = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** `GET /api/stats/public`'s body, or null when it is not the contract's. */
export function parsePublicStats(data: unknown): PublicStats | null {
  if (!data || typeof data !== 'object') return null;
  const { online, playing } = data as { online?: unknown; playing?: unknown };
  return count(online) && count(playing) ? { online, playing } : null;
}

/** The public numbers (never rejects; null on any failure). */
export async function fetchPublicStats(fetchFn?: FetchLike, url = '/api/stats/public'): Promise<PublicStats | null> {
  return parsePublicStats(await getJson(url, fetchFn));
}

/** The start page's line: the number online when the flag is on and the server answers, else null. */
export async function onlineNow(): Promise<number | null> {
  if (!(await flagOn('stats'))) return null;
  const s = await fetchPublicStats();
  return s && s.online > 0 ? s.online : null;
}

/** The line's text. */
export const onlineText = (n: number): string => `${n} online`;
