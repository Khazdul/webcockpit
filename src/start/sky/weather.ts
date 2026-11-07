// The start page's calm weather director (stage 41, ADR 0124): a pure,
// seeded function of game time, so every reload (and the first paint)
// sees the same weather at the same game minute.
//
// Game time is cut into slots of SLOT game minutes (4 real minutes). Each
// slot gets ONE state from a seeded hash of its index, weighted by season:
//
//   winter (Afteryule, Solmath, Rethe)  always snow, drifting between light and steady
//   spring   clear, fair, sometimes clouds, rare light rain
//   summer   clear or fair, never rain
//   autumn   like spring with a little more cloud and rain, a rare short storm
//
// Rain never follows rain (the second wet slot turns to clouds). Inside a
// wet slot the clouds come first, the rain falls for 45–100 s in the
// middle and stops well before the slot ends; a storm is a 25–45 s core
// inside a longer rain. Slots blend into each other over FADE minutes
// centred on the boundary, so nothing jumps, winter keeps snowing to its
// last minute and rain never leaks across a boundary (into summer).
//
// Fog is not a slot state: on about one morning in four (never in winter,
// never on a wet morning) a fog rises before the dawn hour and lifts
// about two hours later.

import { DAWN, DAY_S, MONTH_S } from '../../gmcp/clock';
import { type Season, seasonOf } from '../../gmcp/gametime';
import { clamp, hash01, lerp, mod, sstep, vnoise } from './color';

export type SkyWeatherState = 'clear' | 'fair' | 'clouds' | 'rain' | 'storm' | 'fog' | 'snow';
export const SKY_WEATHER_STATES: readonly SkyWeatherState[] = ['clear', 'fair', 'clouds', 'rain', 'storm', 'fog', 'snow'];

/** The weather mix at a moment; every amount 0..1. */
export interface SkyWeather {
  /** The state that dominates now. */
  state: SkyWeatherState;
  cloud: number;
  rain: number;
  snow: number;
  storm: number;
  fog: number;
  /** Wind strength (it always blows from the west: clouds drift right). */
  wind: number;
}

type Mix = Omit<SkyWeather, 'state'>;

const T: Readonly<Record<SkyWeatherState, Mix>> = {
  clear: { cloud: 0.03, rain: 0, snow: 0, storm: 0, fog: 0.03, wind: 0.16 },
  fair: { cloud: 0.3, rain: 0, snow: 0, storm: 0, fog: 0.05, wind: 0.26 },
  clouds: { cloud: 0.64, rain: 0, snow: 0, storm: 0, fog: 0.1, wind: 0.36 },
  rain: { cloud: 0.76, rain: 0.45, snow: 0, storm: 0, fog: 0.16, wind: 0.4 },
  storm: { cloud: 0.96, rain: 0.85, snow: 0, storm: 1, fog: 0.14, wind: 0.85 },
  fog: { cloud: 0.12, rain: 0, snow: 0, storm: 0, fog: 0.85, wind: 0.04 },
  snow: { cloud: 0.55, rain: 0, snow: 0.55, storm: 0, fog: 0.08, wind: 0.3 },
};

/** Slot length and the cross-fade between slots, in game minutes (= real seconds). */
export const SLOT = 240;
export const FADE = 60;

/** Slot weights per season (winter is always snow). */
const WEIGHTS: Readonly<Record<Exclude<Season, 'winter'>, readonly (readonly [SkyWeatherState, number])[]>> = {
  spring: [['clear', 4], ['fair', 4], ['clouds', 1.6], ['rain', 1.5]],
  summer: [['clear', 5], ['fair', 3.5]],
  autumn: [['clear', 3], ['fair', 3], ['clouds', 2], ['rain', 1.7], ['storm', 0.3]],
};

const SEED = 0x5ea7;
const wet = (s: SkyWeatherState): boolean => s === 'rain' || s === 'storm';
const seasonAt = (g: number): Season => seasonOf(mod(Math.floor(g / MONTH_S), 12));

function rawPick(n: number): SkyWeatherState {
  const season = seasonAt(n * SLOT);
  if (season === 'winter') return 'snow';
  const w = WEIGHTS[season];
  let sum = 0;
  for (const [, k] of w) sum += k;
  let r = hash01(n, SEED) * sum;
  for (const [s, k] of w) {
    r -= k;
    if (r < 0) return s;
  }
  return 'clear';
}

/** The state of slot `n` (rain never follows rain). */
export function slotState(n: number): SkyWeatherState {
  const s = rawPick(n);
  return wet(s) && wet(rawPick(n - 1)) ? 'clouds' : s;
}

/** Snow intensity 0..1 drifting over a minute or two (light ↔ steady). */
function snowMix(g: number): Mix {
  const x = g / 90;
  const v = sstep(0.3, 0.7, (vnoise(x, SEED + 1) * 2 + vnoise(x * 2.07 + 31.7, SEED + 1)) / 3);
  return { ...T.snow, snow: 0.3 + 0.5 * v, cloud: 0.42 + 0.32 * v, wind: 0.16 + 0.3 * v };
}

const blend = (a: Mix, b: Mix, k: number): Mix => ({
  cloud: lerp(a.cloud, b.cloud, k),
  rain: lerp(a.rain, b.rain, k),
  snow: lerp(a.snow, b.snow, k),
  storm: lerp(a.storm, b.storm, k),
  fog: lerp(a.fog, b.fog, k),
  wind: lerp(a.wind, b.wind, k),
});

/** Slot `n`'s own mix at `u` minutes into it (clamped to the slot), at game minute `g`. */
function slotMix(n: number, u: number, g: number): Mix {
  const s = slotState(n);
  u = clamp(u, 0, SLOT);
  if (s === 'snow') return snowMix(g);
  if (!wet(s)) return T[s];
  // a wet slot: clouds, then the rain in the middle, then clouds again
  const a = 30 + 50 * hash01(n, SEED + 2);
  const d = s === 'storm' ? 70 + 40 * hash01(n, SEED + 3) : 45 + 55 * hash01(n, SEED + 3);
  const kr = sstep(a, a + 20, u) * (1 - sstep(a + d - 20, a + d, u));
  let m = blend(T.clouds, T.rain, kr);
  if (s === 'storm') {
    const c0 = a + 20;
    const cd = 25 + 20 * hash01(n, SEED + 4);
    m = blend(m, T.storm, sstep(c0, c0 + 10, u) * (1 - sstep(c0 + cd - 10, c0 + cd, u)));
  }
  return m;
}

const nameOf = (m: Mix): SkyWeatherState =>
  m.snow > 0.05 ? 'snow' : m.storm > 0.5 ? 'storm' : m.rain > 0.1 ? 'rain' : m.fog > 0.45 ? 'fog' : m.cloud > 0.5 ? 'clouds' : m.cloud > 0.15 ? 'fair' : 'clear';

/** How thick the dawn fog is at `g` (0 most mornings). */
export function dawnFogAt(g: number): number {
  const d = Math.floor(g / DAY_S);
  const month = mod(Math.floor(g / MONTH_S), 12);
  if (seasonOf(month) === 'winter' || hash01(d, SEED + 5) >= 0.27) return 0;
  const rise = DAWN[month]! * 60;
  const local = g - d * DAY_S;
  const k = sstep(rise - 90, rise - 30, local) * (1 - sstep(rise + 60, rise + 120, local));
  if (k <= 0) return 0;
  // never on a wet morning
  const g0 = d * DAY_S + rise;
  for (const t of [g0 - 90, g0 + 120]) if (wet(slotState(Math.floor(t / SLOT)))) return 0;
  return k;
}

/** The weather at game minute `g`; `force` pins one state (dev and tests). */
export function skyWeatherAt(g: number, force?: SkyWeatherState | null): SkyWeather {
  if (force) {
    const m = force === 'snow' ? snowMix(g) : T[force];
    return { state: force, ...m };
  }
  const n = Math.floor(g / SLOT);
  const u = g - n * SLOT;
  let m: Mix;
  if (u < FADE / 2) m = blend(slotMix(n - 1, SLOT, g), slotMix(n, u, g), sstep(-FADE / 2, FADE / 2, u));
  else if (u > SLOT - FADE / 2) m = blend(slotMix(n, u, g), slotMix(n + 1, 0, g), sstep(SLOT - FADE / 2, SLOT + FADE / 2, u));
  else m = slotMix(n, u, g);
  const fog = dawnFogAt(g);
  if (fog > 0) {
    m = { ...m, fog: Math.max(m.fog, 0.85 * fog), cloud: lerp(m.cloud, 0.12, fog), wind: lerp(m.wind, 0.04, fog) };
  }
  return { state: nameOf(m), ...m };
}
