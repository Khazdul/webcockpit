// The time-driven sunrise and sunset (stage 28 items 60, 61; ADR 0093).
// Pure: no DOM, no canvas; the director (director.ts) and the sky
// (worker/sky.ts) share it.
//
// MUME's rooms follow `Event.Sun light` and `dark`: the day begins at the
// hour after the dawn hour ("The day has begun."), the night at the hour
// after the dusk hour ("The night has begun."; clock.ts `dayBeginsAt`,
// `nightBeginsAt`). A sunrise fills the last game hour of the night, a
// sunset the last game hour of the day: the 60 real seconds before that
// second. Both follow the same curves of `s`, the seconds relative to the
// turn's second (-60 at the dawn or dusk hour, 0 when the day or night
// begins):
//
//   intensity     rays, beams, glints, the sky tint: just perceptible for
//                 the first 40 s (≤ TURN_FAINT), builds up over the last
//                 20 s, peaks ~7.5 s before the turn and is gone at 0
//   palette       how much of the cloud palette the warm sunrise or sunset
//                 palette takes: slowly from -50 s, gone at 0
//   progress      0..1 along the colours and the sun's path (worker/sky.ts
//                 RISE_C / SET_C, RISE_K / SET_K, sunPos, beams): slow
//                 first, so the colours of the old moments' strong middle
//                 (p ≈ 0.15 … 0.6) fall in the last 20 s, p ≈ 0.5 at the
//                 intensity's peak
//   weight        the new sky's share (day after a sunrise, night after a
//                 sunset): from -28 s, 0.74 at the turn (more than the old
//                 sky's), complete at +14 s

/** Which way the sky turns: night → day, day → night. */
export type TurnKind = 'rise' | 'set';

/** A turn's length: the last game hour before it, s (1 game minute = 1 s). */
export const TURN_S = 60;
/** The new sky is complete this long after the turn, s. */
export const FULL_S = 14;
/** A turn is followed this long after its second (the almanac turns the clock within its 30 s re-read), s. */
export const LATE_S = 60;
/** The intensity's ceiling over the first 40 s. */
export const TURN_FAINT = 0.06;

const sst = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The turn's strength at `s`: rays, beams, glints, the sky's tint (0 outside -60 … 0). */
export function turnIntensity(s: number): number {
  if (!(s > -TURN_S && s < 0)) return 0;
  return (TURN_FAINT * sst(-60, -20, s) + (1 - TURN_FAINT) * sst(-20, -7, s)) * (1 - sst(-8, 0, s));
}

/** How much of the cloud palette the turn's palette takes at `s` (0 outside -60 … 0). */
export function turnPalette(s: number): number {
  if (!(s > -TURN_S && s < 0)) return 0;
  return sst(-50, -14, s) * (1 - sst(-7, 0, s));
}

/** How far along its colours and the sun's path the turn is at `s`, 0..1. */
export function turnProgress(s: number): number {
  const u = Math.min(1, Math.max(0, (s + TURN_S) / TURN_S));
  return Math.pow(u, 5);
}

/** The new sky's share at `s` (0 before -28 s, 1 from FULL_S on). */
export function turnWeight(s: number): number {
  return sst(-28, FULL_S, s);
}
