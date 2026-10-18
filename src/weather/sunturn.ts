// The time-driven sunrise and sunset (stage 28 items 60, 61; ADR 0093).
// Pure: no DOM, no canvas; the director (director.ts) and the sky
// (worker/sky.ts) share it.
//
// MUME's rooms follow `Event.Sun light` and `dark`: the day begins at the
// hour after the dawn hour ("The day has begun."), the night at the hour
// after the dusk hour ("The night has begun."; clock.ts `dayBeginsAt`,
// `nightBeginsAt`). A sunrise fills the last game hour of the night, a
// sunset the last game hour of the day, and runs on until the new sky is
// complete: `s` is the time relative to the turn's second (-60 at the dawn
// or dusk hour, 0 when the day or night begins, FULL_S when its sky is
// complete). Both follow the same curves, steady all through (owner items
// 71, 72: no "little for long, then much at once"):
//
//   weight        the new sky's share (day after a sunrise, night after a
//                 sunset): from -32 s, 0.70 at the turn (more than the old
//                 sky's), complete at FULL_S
//   rays          the rays' and beams' strength: a few rays from the first
//                 seconds (the kind's `early`), rising evenly to full by
//                 -3 s; they fade out evenly as the new sky comes (from
//                 RAYS_FADE_S, its share 0.4) and are gone when it is complete
//   ray / beam on more rays fade in one by one (`turnRayOn`): three from the
//                 start, the other five from -54 s, 6 s apart; the three
//                 beams from -42 s, 8 s apart
//   intensity     the sky tint, the moment's glow, the day life held back:
//                 rising evenly, fading with the rays
//   palette       the cloud palette's share of the warm turn palette: the same
//   progress      0..1 along the colours and the sun's path (worker/sky.ts
//                 RISE_C / SET_C, sunPsi): even over the whole turn

/** Which way the sky turns: night → day, day → night. */
export type TurnKind = 'rise' | 'set';

/** A turn's length before its second: the last game hour (1 game minute = 1 s). */
export const TURN_S = 60;
/** The new sky is complete this long after the turn's second, s: the turn's rays are gone then (owner item 71). */
export const FULL_S = 18;
/** A turn is followed this long after its second (the almanac turns the clock within its 30 s re-read), s. */
export const LATE_S = 60;
/** The rays start to fade here (s), as the new sky becomes perceptible (its share 0.4), and fade evenly until it is complete at FULL_S. */
export const RAYS_FADE_S = -10;

const sst = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lin = (a: number, b: number, x: number): number => Math.min(1, Math.max(0, (x - a) / (b - a)));

/** The new sky's share at `s` (0 before -32 s, 1 from FULL_S on). */
export function turnWeight(s: number): number {
  return sst(-32, FULL_S, s);
}

/** Whether a turn's effects are on at `s` (from its first second until its new sky is complete). */
export function turnOn(s: number): boolean {
  return s > -TURN_S && s < FULL_S;
}

/** The rays' fade as the new sky comes: 1 until RAYS_FADE_S (the new sky perceptible), 0 when it is complete (FULL_S). */
export function turnFade(s: number): number {
  // nearly linear (a soft start), so it is slow and even to the end, not bunched in the middle
  return 1 - lin(RAYS_FADE_S, FULL_S, s) ** 1.2;
}

/** The rays' strength from the first second (a few rays, vague but visible; by eye, owner items 62, 71). */
export const TURN_RAYS: Readonly<Record<TurnKind, { early: number }>> = {
  rise: { early: 0.45 },
  set: { early: 0.5 },
};

/** The ray and beam strength at `s` (0 outside the turn): the kind's early strength rising evenly to 1 by -3 s, fading as the new sky comes. */
export function turnRays(kind: TurnKind, s: number): number {
  if (!turnOn(s)) return 0;
  const e = TURN_RAYS[kind].early;
  return sst(-60, -57.5, s) * (e + (1 - e) * lin(-60, -3, s)) * turnFade(s);
}

/** The turn's strength for the sky's tint, its glow and the day life held back (0 outside the turn). */
export function turnIntensity(s: number): number {
  if (!turnOn(s)) return 0;
  return lin(-60, -3, s) ** 1.3 * turnFade(s);
}

/** How much of the cloud palette the turn's palette takes at `s` (0 outside the turn). */
export function turnPalette(s: number): number {
  if (!turnOn(s)) return 0;
  return lin(-55, -5, s) * turnFade(s);
}

/** How far along its colours and the sun's path the turn is at `s`, 0..1: even from its first second until its sky is complete. */
export function turnProgress(s: number): number {
  return lin(-TURN_S, FULL_S, s);
}

/** Thin rays in a turn (worker/sky.ts) and the order they come in: the first TURN_RAYS_FIRST from the start. */
export const TURN_RAY_N = 8;
const RAY_RANK: readonly number[] = [3, 5, 1, 6, 0, 4, 2, 7];
const TURN_RAYS_FIRST = 3;

/** How much of thin ray `i` (0 … TURN_RAY_N − 1) is there at `s`: three from the start, the others one by one from -54 s, 6 s apart, each fading in over 8 s. */
export function turnRayOn(i: number, s: number): number {
  const r = RAY_RANK[i % TURN_RAY_N]!;
  if (r < TURN_RAYS_FIRST) return 1;
  const t0 = -54 + (r - TURN_RAYS_FIRST) * 6;
  return sst(t0, t0 + 8, s);
}

/** How much of beam `i` (0 … 2; 1 the middle) is there at `s`: the middle one from -42 s, the others 8 s apart, each over 10 s. */
export function turnBeamOn(i: number, s: number): number {
  const t0 = i === 1 ? -42 : i === 0 ? -34 : -26;
  return sst(t0, t0 + 10, s);
}

/** A day glimpse must not run into a turn: none starts this long (s) before a turn's way in begins (the longest glimpse is 16 s). */
export const GLIMPSE_LEAD_S = 18;

/**
 * Whether the day's sun glimpses are held back (owner item 64): while a
 * sunrise or sunset runs (`riseS` / `setS` in -60 … FULL_S, NaN without), or
 * when the clock says one begins within GLIMPSE_LEAD_S (`dayAt` / `nightAt`,
 * unix ms, -1 unknown).
 */
export function glimpseBlocked(nowMs: number, rise: number, set: number, dayAt: number, nightAt: number): boolean {
  if (turnOn(rise) || turnOn(set)) return true;
  const soon = (at: number): boolean => at >= 0 && nowMs >= at - (TURN_S + GLIMPSE_LEAD_S) * 1000 && nowMs < at;
  return soon(dayAt) || soon(nightAt);
}

