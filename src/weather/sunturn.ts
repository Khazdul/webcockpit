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
//   rays          the rays and beams only (owner item 62): glimpsed from
//                 the first second (TURN_RAYS early, faded in over 2.5 s),
//                 a little more from -30 s (late), then the intensity's
//                 build-up; gone at 0. Per kind: a sunset's rays are drawn
//                 about half as strong (worker/sky.ts), so its floor is
//                 higher. The sky tint, the palette and the rest still
//                 follow the intensity
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

/** The rays' floor from a turn's first second (vague but visible), and from -30 s (a little more); by eye, owner item 62. */
export const TURN_RAYS: Readonly<Record<TurnKind, { early: number; late: number }>> = {
  rise: { early: 0.2, late: 0.3 },
  set: { early: 0.35, late: 0.5 },
};

/** The ray and beam strength at `s`: at least the kind's floor, else the intensity (0 outside -60 … 0). */
export function turnRays(kind: TurnKind, s: number): number {
  if (!(s > -TURN_S && s < 0)) return 0;
  const f = TURN_RAYS[kind];
  const floor = (f.early * sst(-60, -57.5, s) + (f.late - f.early) * sst(-34, -26, s)) * (1 - sst(-8, 0, s));
  return Math.max(floor, turnIntensity(s));
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

/** A day glimpse must not run into a turn: none starts this long (s) before a turn's way in begins (the longest glimpse is 16 s). */
export const GLIMPSE_LEAD_S = 18;

/**
 * Whether the day's sun glimpses are held back (owner item 64): while a
 * sunrise or sunset runs (`riseS` / `setS` in -60 … 0, NaN without), or
 * when the clock says one begins within GLIMPSE_LEAD_S (`dayAt` / `nightAt`,
 * unix ms, -1 unknown).
 */
export function glimpseBlocked(nowMs: number, rise: number, set: number, dayAt: number, nightAt: number): boolean {
  if ((rise > -TURN_S && rise < 0) || (set > -TURN_S && set < 0)) return true;
  const soon = (at: number): boolean => at >= 0 && nowMs >= at - (TURN_S + GLIMPSE_LEAD_S) * 1000 && nowMs < at;
  return soon(dayAt) || soon(nightAt);
}

/** The new sky's share at `s` (0 before -28 s, 1 from FULL_S on). */
export function turnWeight(s: number): number {
  return sst(-28, FULL_S, s);
}
