// The time-driven sunrise (stage 28 item 60, ADR 0093). Pure: no DOM, no
// canvas; the director (director.ts) and the sky (worker/sky.ts) share it.
//
// MUME's day begins at the hour after the dawn hour (`Event.Sun light`,
// "The day has begun."; clock.ts `dayBeginsAt`). The sunrise fills the last
// game hour of the night, the 60 real seconds before that second. Every
// curve here is a function of `s`, the seconds relative to the day's first
// second (-60 at the dawn hour, 0 when the day begins):
//
//   intensity     rays, beams, glints, the sky tint: just perceptible for
//                 the first 40 s (≤ RISE_FAINT), builds up over the last
//                 20 s, peaks ~7.5 s before the day and is gone at 0
//   palette       how much of the cloud palette the warm sunrise palette
//                 takes: slowly from -50 s, gone at 0
//   progress      0..1 along the sunrise's colours and the sun's path
//                 (worker/sky.ts RISE_C / RISE_K, sunPos, beams): slow first,
//                 so the warm colours fall in the last 20 s
//   day weight    the day sky's share of the sky: from -28 s, 0.74 when the
//                 day begins (more than the night's), complete at +14 s

/** The sunrise's length: the last game hour of the night, s (1 game minute = 1 s). */
export const RISE_S = 60;
/** The day sky is complete this long after the day begins, s. */
export const DAY_FULL_S = 14;
/** The rise is followed this long after the day begins (the almanac turns the clock to day within its 30 s re-read), s. */
export const RISE_LATE_S = 60;
/** The intensity's ceiling over the first 40 s. */
export const RISE_FAINT = 0.06;

const sst = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The sunrise's strength at `s`: rays, beams, glints, the sky's tint (0 outside -60 … 0). */
export function riseIntensity(s: number): number {
  if (!(s > -RISE_S && s < 0)) return 0;
  return (RISE_FAINT * sst(-60, -20, s) + (1 - RISE_FAINT) * sst(-20, -7, s)) * (1 - sst(-8, 0, s));
}

/** How much of the cloud palette the sunrise palette takes at `s` (0 outside -60 … 0). */
export function risePalette(s: number): number {
  if (!(s > -RISE_S && s < 0)) return 0;
  return sst(-50, -14, s) * (1 - sst(-7, 0, s));
}

/** How far along its colours and the sun's path the sunrise is at `s`, 0..1. */
export function riseProgress(s: number): number {
  const u = Math.min(1, Math.max(0, (s + RISE_S) / RISE_S));
  return Math.pow(u, 2.5);
}

/** The day sky's share at `s` (0 before -28 s, 1 from DAY_FULL_S on). */
export function riseDayWeight(s: number): number {
  return sst(-28, DAY_FULL_S, s);
}
