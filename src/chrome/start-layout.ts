// The start page's pure text helpers: `almanacLines`, the almanac's text
// at the bottom right (stage 41, ADR 0125). The old cell-grid layout
// (`startLayout`) went with the first paint's redesign (ADR 0083,
// addendum 2026-11-07).

import type { GameTimeInfo } from '../gmcp/gametime';

/** `1st`, `2nd`, `3rd`, `4th`, … `11th`, `12th`, `13th`, `21st`. */
export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return n + (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
}

/**
 * The almanac (owner, 2026-11-07): "Mersday, the 29th of Afterlithe" and
 * "1:05pm · day · T.A. 3038" (no moon text). The version line is the
 * caller's.
 */
export function almanacLines(t: Pick<GameTimeInfo, 'weekday' | 'day' | 'monthName' | 'hour' | 'minute' | 'period' | 'year'>): {
  date: string;
  time: string;
} {
  const h12 = t.hour % 12 || 12;
  const mm = String(t.minute).padStart(2, '0');
  return {
    date: `${t.weekday}, the ${ordinal(t.day)} of ${t.monthName}`,
    time: `${h12}:${mm}${t.hour < 12 ? 'am' : 'pm'} · ${t.period} · T.A. ${t.year}`,
  };
}
