// The time-driven sunrise and sunset (stage 28 items 60, 61; ADR 0093).
// Pure: no DOM, no canvas; the director (director.ts) and the sky
// (worker/sky.ts) share it.
//
// MUME's rooms follow `Event.Sun light` and `dark`: the day begins at the
// hour after the dawn hour ("The day has begun."), the night at the hour
// after the dusk hour ("The night has begun."; clock.ts `dayBeginsAt`,
// `nightBeginsAt`). A sunrise fills the last game hour of the night, a
// sunset the last game hour of the day: `s` is the time relative to the
// turn's second (-60 at the dawn or dusk hour, 0 when the day or night
// begins). The sun, its rays and its glow are gone at 0 for both (owner
// items 76, 77); the new sky is complete then too: a sunrise's blue, a
// sunset's stars, which come out over its last 7 s (owner item 81).
// Steady all through (owner items 71, 72: no "little for long, then much at
// once"):
//
//   weight        the new sky's colours (blue after a sunrise, the dark
//                 dusk after a sunset): a sunrise's blue over its last 30 s,
//                 a sunset's blue fading from -50 s into the warm dusk
//   stars         the stars' share: a sunrise's fade 50 % by -50 s, barely
//                 there by -30; a sunset's come over its last 7 s
//   glow          the sun's hazy light: a sunrise's slow (25 s to what came
//                 in 3), growing to -14 s; fading as the turn ends
//   rays          the rays' and beams' strength: a sunrise's in step with
//                 its glow (barely there at first, owner item 80), a
//                 sunset's a few from the first seconds; full by
//                 RAYS_FADE_S, then fading softly, gone at 0
//   glint         the frame glints: by the rays' strength (a little faster
//                 down, so they fade with them, item 81), a sunrise's held
//                 back over its first 18 s (item 80)
//   ray / beam on a sunset's rays fade in one by one (`turnRayOn`): three
//                 from the start, the other nine from -54 s, 2.5 s apart;
//                 its three beams from -48 s, 6 s apart; a sunrise's all
//                 come with its glow
//   intensity     the sky tint, the day life held back: rising evenly,
//                 fading from GLOW_FADE_S
//   palette       the cloud palette's share of the warm turn palette: the same
//   progress      0..1 along the colours and the sun's path (worker/sky.ts
//                 RISE_C / SET_C, sunPsi): even from -60 to 0

/** Which way the sky turns: night → day, day → night. */
export type TurnKind = 'rise' | 'set';

/** A turn's length before its second: the last game hour (1 game minute = 1 s). */
export const TURN_S = 60;
/** The new sky is complete this long after the turn's second, s: a sunrise's blue at the second itself (owner item 77), a sunset's stars too (item 81; was 14 s after). */
export const TURN_FULL: Readonly<Record<TurnKind, number>> = { rise: 0, set: 0 };
/** The longest of TURN_FULL, s. */
export const FULL_S = Math.max(TURN_FULL.rise, TURN_FULL.set);
/** A turn is followed this long after its second (the almanac turns the clock within its 30 s re-read), s. */
export const LATE_S = 60;
/** The rays are at their full strength here (s) and fade softly from here to 0, as the new sky comes. */
export const RAYS_FADE_S = -24;
/** The glow, the tint and the warm palette fade from here (s) to 0. */
export const GLOW_FADE_S = -14;

const sst = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lin = (a: number, b: number, x: number): number => Math.min(1, Math.max(0, (x - a) / (b - a)));
/** Linear through the points `P` ([s, value], ascending), held at the ends. */
const pw = (P: ReadonlyArray<readonly [number, number]>, x: number): number => {
  if (x <= P[0]![0]) return P[0]![1];
  for (let i = 1; i < P.length; i++) {
    const [b, vb] = P[i]!;
    if (x < b) {
      const [a, va] = P[i - 1]!;
      return va + ((vb - va) * (x - a)) / (b - a);
    }
  }
  return P[P.length - 1]![1];
};

/** When `kind`'s new sky is complete (s). */
export function turnFull(kind: TurnKind): number {
  return TURN_FULL[kind];
}

/** The new sky's share at `s`: a sunrise's blue from -30 s, complete at the day's second; a sunset's blue fading into the dusk from -50 s (owner items 76, 77). */
export function turnWeight(kind: TurnKind, s: number): number {
  return kind === 'rise' ? sst(-30, 0, s) : sst(-50, 0, s);
}

/** A sunrise's stars: half gone 10 s in, barely there 20 s later, gone before the blue is strong (owner item 77). */
const RISE_STARS: ReadonlyArray<readonly [number, number]> = [[-60, 1], [-57, 0.88], [-50, 0.5], [-40, 0.24], [-30, 0.1], [-18, 0.04], [-6, 0]];

/** A sunset's stars start to show this long before the night begins (s; owner item 81, was -5 … +14). */
export const SET_STARS_S = -7;

/**
 * How much of the stars the night part of the sky shows (1 outside a turn):
 * in a sunrise they fade as the sun's light comes (`rise` its `s`); in a
 * sunset they come as the last rays go, from SET_STARS_S, complete when the
 * night begins (`set` its `s`; NaN without).
 */
export function turnStars(rise: number, set: number): number {
  if (rise > -TURN_S && rise < LATE_S) return pw(RISE_STARS, rise);
  if (set > -TURN_S && set < TURN_FULL.set) return sst(SET_STARS_S, TURN_FULL.set, set);
  return 1;
}

/** Whether a turn's sun is on at `s` (its rays, glow and colours): from its first second until its second. */
export function turnOn(s: number): boolean {
  return s > -TURN_S && s < 0;
}

/** The rays' fade: 1 until RAYS_FADE_S, then down softly to 0 at the turn's second (barely there from -5 s). */
export function turnFade(s: number): number {
  return (1 - lin(RAYS_FADE_S, 0, s)) ** 1.5;
}

/** The glow's, tint's and palette's fade: 1 until GLOW_FADE_S, 0 at the turn's second. */
function glowFade(s: number): number {
  return (1 - lin(GLOW_FADE_S, 0, s)) ** 1.3;
}

/** A sunset's rays' strength from the first second (a few rays, vague but visible; by eye, owner items 62, 71). */
export const SET_RAYS_EARLY = 0.5;
/** A sunrise's rays come in step with its glow (owner item 80: barely there at first, not a few rays early; was 0.6 from the first seconds). */
const RISE_RAYS: ReadonlyArray<readonly [number, number]> = [[-60, 0], [-35, 0.6], [RAYS_FADE_S, 1]];

/** The ray and beam strength at `s` (0 outside the turn): a sunrise's with its glow, a sunset's from its early strength, both 1 at RAYS_FADE_S, then fading. */
export function turnRays(kind: TurnKind, s: number): number {
  if (!turnOn(s)) return 0;
  const e = SET_RAYS_EARLY;
  const up = kind === 'rise' ? pw(RISE_RAYS, s) : sst(-60, -57.5, s) * (e + (1 - e) * lin(-60, RAYS_FADE_S, s));
  return up * turnFade(s);
}

/** A sunrise's frame glints are held back over its first seconds (owner item 80: not so marked at first). */
const RISE_GLINT_IN: readonly [number, number] = [-60, -42];

/**
 * The frame glints' strength at `s` (0 outside the turn): the rays' to the
 * power 1.5, so a glint, bright on its line, fades as visibly as its faint
 * ray does (owner item 81: they stayed while the rays faded); a sunrise's
 * held back over its first 18 s (item 80).
 */
export function turnGlint(kind: TurnKind, s: number): number {
  const r = turnRays(kind, s) ** 1.5;
  return kind === 'rise' ? r * sst(RISE_GLINT_IN[0], RISE_GLINT_IN[1], s) : r;
}

/** The sun's hazy light (its glow, not the rays): a sunrise's comes in over 25 s to what used to come in 3, then grows to GLOW_FADE_S (owner item 77); a sunset's sun is up from the start and sinks with its rays. */
const GLOW: Readonly<Record<TurnKind, ReadonlyArray<readonly [number, number]>>> = {
  rise: [[-60, 0], [-35, 0.6], [GLOW_FADE_S, 1]],
  set: [[-60, 0], [-52, 0.6], [RAYS_FADE_S, 1]],
};

/** The glow's strength at `s` (0 outside the turn). */
export function turnGlow(kind: TurnKind, s: number): number {
  if (!turnOn(s)) return 0;
  return pw(GLOW[kind], s) * (kind === 'rise' ? glowFade(s) : turnFade(s));
}

/** The turn's strength for the sky's tint and the day life held back (0 outside the turn). */
export function turnIntensity(s: number): number {
  if (!turnOn(s)) return 0;
  return lin(-60, GLOW_FADE_S, s) ** 1.3 * glowFade(s);
}

/** How much of the cloud palette the turn's palette takes at `s` (0 outside the turn). */
export function turnPalette(s: number): number {
  if (!turnOn(s)) return 0;
  return lin(-55, GLOW_FADE_S, s) * glowFade(s);
}

/** How far along its colours and the sun's path the turn is at `s`, 0..1: even from its first second to its second. */
export function turnProgress(s: number): number {
  return lin(-TURN_S, 0, s);
}

/** Thin rays in a turn (worker/sky.ts; beams.ts `RAY_SLOTS` their places and tiers) and the order a sunset's come in: the first TURN_RAYS_FIRST from the start. */
export const TURN_RAY_N = 12;
const RAY_RANK: readonly number[] = [6, 2, 4, 9, 0, 7, 11, 3, 5, 10, 1, 8];
const TURN_RAYS_FIRST = 3;

/** How much of thin ray `i` (0 … TURN_RAY_N − 1) is there at `s`: a sunrise's all (they come with its glow, owner item 80); a sunset's three from the start, the others one by one from -54 s, 2.5 s apart, each fading in over 8 s. */
export function turnRayOn(kind: TurnKind, i: number, s: number): number {
  const r = RAY_RANK[i % TURN_RAY_N]!;
  if (kind === 'rise' || r < TURN_RAYS_FIRST) return 1;
  const t0 = -54 + (r - TURN_RAYS_FIRST) * 2.5;
  return sst(t0, t0 + 8, s);
}

/** How much of beam `i` (0 … 2; 1 the middle) is there at `s`: a sunrise's all (with its glow); a sunset's middle one from -48 s, the others 6 s apart, each over 10 s. */
export function turnBeamOn(kind: TurnKind, i: number, s: number): number {
  if (kind === 'rise') return 1;
  const t0 = i === 1 ? -48 : i === 0 ? -42 : -36;
  return sst(t0, t0 + 10, s);
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
  if (turnOn(rise) || turnOn(set)) return true;
  const soon = (at: number): boolean => at >= 0 && nowMs >= at - (TURN_S + GLIMPSE_LEAD_S) * 1000 && nowMs < at;
  return soon(dayAt) || soon(nightAt);
}
