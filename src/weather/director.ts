// The director (prototype harness, v4): turns raw game state into a
// settled state (dwell) and smooth 0..1 mix values, so the effects never
// see room-by-room flicker. Pure: no DOM, no canvas; runs in the worker.
//
// - weather, fog and light change only after the raw value was stable for
//   DWELL_MS (running through rooms does not flicker); position, clock and
//   moon are immediate.
// - The sky comes from the latest Event.Sun / Event.Moon (clock, moonUp),
//   outdoors only. No room or light value gives a darkness sky: magical
//   darkness shows only as the bleed and the lift on its Event.Darkness
//   events (owner feedback 26).
// - The sky's selection (sun, moon, dark, night) is the time of day alone;
//   `outdoors` gates it. The sky draws all of it (gradient, clouds, stars,
//   moon, day life) times `outdoors`, so going in or out is one even
//   crossfade of the whole sky.
// - Mix values ease exponentially (tau 0.9 s) toward their targets, except:
//   fog moves at a constant FOG_RATE (a step between none, light and dense
//   takes 20 s, owner feedback 8); `outdoors` at OUT_RATE (5 s in or out,
//   owner feedback 27); the sky selection at SKY_RATE, and after a change of
//   the clock to night (sunset) only once SKY_HOLD_S has passed, so the day
//   sky stays through most of the sunset (owner feedback 29).
// - The sunrise is timed by the clock, not by an event (ADR 0093): over the
//   60 s before the day begins (`dayAt`, the almanac's second at minute
//   precision) `riseS` runs from -60 to 0 and the sky selection follows
//   sunrise.ts `riseDayWeight` (night → day, complete 14 s into the day);
//   from 0 the settled clock is day. A resync glides `riseS` toward the
//   clock's time (a big one snaps, never back over the day's start); a page
//   load or sync mid-rise joins at its place. Without minute precision
//   `Event.Sun rise` starts it at -60 and it runs on its own; `light`
//   without one fades to day over 12 s. One rise per dawn: none starts
//   within RISE_GUARD_MS after one reached the day (reset by `jump` and a
//   speed change, the demo's).
// - A category that is off has its targets at 0, so it fades out.
// - `speed` (the demo, `#weather demo`; 1 otherwise) runs the slow paces
//   faster: the sky selection and its hold, and fog. The worker's modules
//   read the same factor for sun moments, cloud cover, the rain's and snow's
//   build-up and the blood's drying (`Env.speed`).

import { ALL_CATEGORIES, type Categories, DEFAULT_STATE, type WeatherEvent, type WeatherState } from './protocol';
import { DAY_FULL_S, RISE_LATE_S, RISE_S, riseDayWeight } from './sunrise';

export const DWELL_MS = 3000;
/** Mix easing time constant, seconds. */
export const MIX_TAU = 0.9;
/** Fog mix change per second: none → light (0.5) or light → dense takes 20 s, none → dense 40 s; the same going away. */
export const FOG_RATE = 1 / 40;
/** Outdoors mix change per second: going in or out crossfades the whole sky over 5 s (owner feedback 27). */
export const OUT_RATE = 1 / 5;
/** Sky selection change per second: day ↔ night over 12 s, moon up ↔ down too (owner feedback 29). */
export const SKY_RATE = 1 / 12;
/**
 * After the clock changes to night (Event.Sun, the almanac), the sky
 * selection waits this long before it moves: with SKY_RATE, the day sky goes
 * from 11 s to 23 s into the 26 s sunset (worker/sky.ts SET_S).
 */
export const SKY_HOLD_S = 11;
/** A clock correction during the sunrise glides out with this time constant, s. */
export const RISE_GLIDE_TAU = 2;
/** A correction larger than this (s) snaps instead. */
export const RISE_SNAP_S = 15;
/** No new sunrise starts this long (wall ms) after one reached the day: never two in one dawn (a game day is 24 min). */
export const RISE_GUARD_MS = 20 * 60_000;

export const MIX_KEYS = [
  'outdoors',
  'sun',
  'moon',
  'torch',
  'night',
  'dark',
  'clouds',
  'rain',
  'heavy',
  'snow',
  'fog',
  'resting',
  'sleeping',
  'down',
] as const;
export type MixKey = (typeof MIX_KEYS)[number];
export type Mix = Record<MixKey, number>;
/** The sky selection: the time of day, gated by `outdoors` where it is drawn. */
const SKY_KEYS: ReadonlySet<MixKey> = new Set(['sun', 'moon', 'dark', 'night']);

const DWELLED = ['weather', 'fog', 'light'] as const;
type Dwelled = (typeof DWELLED)[number];

const CLOUD_COVER: Record<string, number> = { '~': 0.6, "'": 0.85, '"': 1, '*': 0.8 };

export function zeroMix(): Mix {
  const m = {} as Mix;
  for (const k of MIX_KEYS) m[k] = 0;
  return m;
}

/** Mix targets for a settled state under `cats`. Writes into `out`. */
export function mixTargets(s: Readonly<WeatherState>, cats: Readonly<Categories>, out: Mix = zeroMix()): Mix {
  const outd = s.weather !== null ? 1 : 0;
  const day = s.clock === 'day';
  out.outdoors = outd;
  // the time of day, indoors too (the sky multiplies it by `outdoors`)
  out.sun = day ? 1 : 0;
  out.moon = !day && s.moonUp ? 1 : 0;
  out.torch = s.light === '!' ? 1 : 0;
  out.night = day ? 0 : 1;
  out.dark = !day && !s.moonUp ? 1 : 0;
  out.clouds = cats.sky ? CLOUD_COVER[s.weather ?? ''] ?? 0 : 0;
  const p = cats.precipitation ? outd : 0;
  out.rain = p * (s.weather === "'" || s.weather === '"' ? 1 : 0);
  out.heavy = p * (s.weather === '"' ? 1 : 0);
  out.snow = p * (s.weather === '*' ? 1 : 0);
  out.fog = cats.fog ? (s.fog === '-' ? 0.5 : s.fog === '=' ? 1 : 0) : 0;
  const b = cats.body;
  out.resting = b && s.position === 'resting' ? 1 : 0;
  out.sleeping = b && s.position === 'sleeping' ? 1 : 0;
  out.down = !b ? 0 : s.position === 'dying' ? 1 : s.position === 'incapacitated' ? 0.6 : 0;
  return out;
}

/** The raw state change an event implies (sun / moon), or null. */
export function eventState(name: WeatherEvent): Partial<WeatherState> | null {
  switch (name) {
    case 'sun.light':
      // the day starts (the almanac's sunU, when synced, follows within a step);
      // `sun.rise` opens the dawn hour, still night: it starts the sunrise (`riseEvent`)
      return { clock: 'day', sunU: 0 };
    case 'sun.set':
    case 'sun.dark':
      return { clock: 'night', sunU: -1 };
    case 'moon.rise':
      return { moonUp: true };
    case 'moon.set':
      return { moonUp: false };
    default:
      return null;
  }
}

export class Director {
  readonly raw: WeatherState;
  readonly settled: WeatherState;
  readonly mix: Mix = zeroMix();
  private readonly tgt: Mix = zeroMix();
  private readonly pendingSince: Record<Dwelled, number> = { weather: 0, fog: 0, light: 0 };
  /** Seconds the sky selection still waits after a clock change (SKY_HOLD_S). */
  private skyHold = 0;
  cats: Categories;
  private speedK = 1;
  /**
   * The sunrise now: seconds relative to the second the day begins (-60 …
   * RISE_LATE_S), or null without one (sunrise.ts, ADR 0093).
   */
  riseS: number | null = null;
  /** The day sky's share when the rise started (a rise never darkens a sky that was already day). */
  private riseBase = 0;
  /** Wall ms when the last rise reached the day (RISE_GUARD_MS). */
  private riseDone = -Infinity;
  /** The wall clock, unix ms (the worker's; tests set their own). */
  wall: () => number = Date.now;

  /** Demo time scale for the slow paces (sky selection, its hold, fog, the sunrise); 1 = the game's pace. */
  get speed(): number {
    return this.speedK;
  }
  set speed(v: number) {
    this.speedK = v;
    // the demo starts or ends: its own sunrise does not block the game's
    this.riseDone = -Infinity;
  }

  constructor(state: Partial<WeatherState> = {}, cats: Categories = { ...ALL_CATEGORIES }) {
    this.raw = { ...DEFAULT_STATE, ...state };
    this.settled = { ...this.raw };
    this.cats = { ...cats };
    this.snap();
    this.joinRise();
  }

  /**
   * Sets raw values. Returns the position change, if any (the 'position'
   * event for the effects). With `settle` the dwelled values in `partial`
   * are settled at once (the demo's pins), but still eased.
   */
  set(partial: Partial<WeatherState>, settle = false): { from: string; to: string } | null {
    const prev = this.raw.position;
    for (const k of Object.keys(partial) as (keyof WeatherState)[]) {
      const v = partial[k];
      if (v !== undefined) (this.raw as unknown as Record<string, unknown>)[k] = v;
    }
    if (settle) {
      for (const k of DWELLED) {
        if (partial[k] === undefined) continue;
        (this.settled as unknown as Record<string, unknown>)[k] = this.raw[k];
        this.pendingSince[k] = 0;
      }
    }
    return this.raw.position !== prev ? { from: prev, to: this.raw.position } : null;
  }

  /** Sets raw values and makes them settled and mixed at once (tests, page load, dev jumps). */
  jump(partial: Partial<WeatherState>): { from: string; to: string } | null {
    const ch = this.set(partial);
    Object.assign(this.settled, this.raw);
    for (const k of DWELLED) this.pendingSince[k] = 0;
    this.skyHold = 0;
    this.snap();
    this.riseS = null;
    this.riseDone = -Infinity;
    this.joinRise();
    return ch;
  }

  /** At once (start, `jump`): a sunrise the clock is in joins at its place, and the mix with it. */
  private joinRise(): void {
    this.rise(0);
    if (this.riseS === null) return;
    this.settle(0);
    this.skyHold = 0;
    this.snap();
    this.step(0);
  }

  /**
   * Advances the sunrise by `dt` s: starts it when the clock's time (from
   * `dayAt`) lies in it, glides toward that time, ends it RISE_LATE_S into
   * the day.
   */
  rise(dt: number): void {
    const wall = this.wall();
    const dayAt = this.raw.dayAt;
    const tg = dayAt >= 0 ? (wall - dayAt) / 1000 : NaN;
    const inside = tg >= -RISE_S && tg < RISE_LATE_S;
    let s = this.riseS;
    if (s === null) {
      if (inside && tg < DAY_FULL_S) this.startRise(tg, wall);
      return;
    }
    const was = s;
    s += dt * this.speedK;
    if (inside) {
      const err = tg - s;
      // a big correction snaps, but never back over the day's start once it came
      if (Math.abs(err) > RISE_SNAP_S) {
        if (!(s >= 0 && err < 0)) s = tg;
      } else s += err * (1 - Math.exp(-dt / RISE_GLIDE_TAU));
    }
    if (was < 0 && s >= 0) this.riseDone = wall;
    this.riseS = s > RISE_LATE_S ? null : s;
  }

  /**
   * `Event.Sun rise` (the dawn hour begins): the sunrise from its start (or
   * `from` s before the day, the demo), unless one runs or ran this dawn.
   */
  riseEvent(from?: unknown): void {
    const s = typeof from === 'number' && from >= -RISE_S && from < 0 ? from : -RISE_S;
    if (this.riseS === null) this.startRise(s, this.wall());
  }

  private startRise(s: number, wall: number): void {
    if (wall - this.riseDone < RISE_GUARD_MS) return;
    this.riseS = s;
    this.riseBase = this.mix.sun;
    if (s >= 0) this.riseDone = wall;
  }

  /** Mix values straight to their targets. */
  snap(): void {
    mixTargets(this.settled, this.cats, this.mix);
  }

  /** Dwell filter; `now` in ms. */
  settle(now: number): void {
    const { raw, settled, pendingSince } = this;
    for (const k of DWELLED) {
      if (raw[k] === settled[k]) {
        pendingSince[k] = 0;
        continue;
      }
      if (!pendingSince[k]) pendingSince[k] = now || 1e-6;
      if (now - pendingSince[k] >= DWELL_MS) {
        (settled as unknown as Record<string, unknown>)[k] = raw[k];
        pendingSince[k] = 0;
      }
    }
    settled.position = raw.position;
    // the day begins with the sunrise's second (the clock's own change may come up to an almanac re-read later)
    const clock = this.riseS !== null && this.riseS >= 0 ? 'day' : raw.clock;
    if (settled.clock !== clock && clock === 'night') this.skyHold = SKY_HOLD_S;
    settled.clock = clock;
    settled.dayAt = raw.dayAt;
    settled.moonPhase = raw.moonPhase;
    settled.moonUp = raw.moonUp;
    settled.moonU = raw.moonU;
    settled.sunU = raw.sunU;
  }

  /** Eases the mix values toward their targets over `dt` seconds. */
  step(dt: number): void {
    const t = mixTargets(this.settled, this.cats, this.tgt);
    const k = 1 - Math.exp(-dt / MIX_TAU), m = this.mix;
    const fog0 = m.fog;
    const sdt = dt * this.speed;
    const sky = this.skyHold <= 0 ? sdt * SKY_RATE : 0;
    this.skyHold = Math.max(0, this.skyHold - sdt);
    for (const key of MIX_KEYS) {
      if (SKY_KEYS.has(key)) m[key] = toward(m[key], t[key], sky);
      else if (key === 'outdoors') m[key] = toward(m[key], t[key], dt * OUT_RATE);
      else m[key] += (t[key] - m[key]) * k;
    }
    const rs = this.riseS;
    if (rs !== null && rs <= DAY_FULL_S) {
      // The sunrise sets the sky selection itself: the day's share by its
      // curve; the night's split between moon and dark moves at SKY_RATE.
      const w = Math.max(this.riseBase, riseDayWeight(rs));
      const n = m.moon + m.dark;
      const ms = toward(n > 1e-6 ? m.moon / n : this.settled.moonUp ? 1 : 0, this.settled.moonUp ? 1 : 0, sdt * SKY_RATE);
      m.sun = w;
      m.night = 1 - w;
      m.moon = (1 - w) * ms;
      m.dark = (1 - w) * (1 - ms);
    }
    // fog: a constant rate (switching the category off still fades at MIX_TAU)
    if (this.cats.fog) m.fog = toward(fog0, t.fog, sdt * FOG_RATE);
  }

  /** Settles and eases in one go (one frame). */
  tick(now: number, dt: number): void {
    this.rise(dt);
    this.settle(now);
    this.step(dt);
  }

  /** True when every mix value and target is (nearly) zero. */
  quiet(eps = 0.003): boolean {
    const t = mixTargets(this.settled, this.cats, this.tgt);
    for (const key of MIX_KEYS) {
      // tints and the time of day: draw nothing by themselves (the sky needs `outdoors`)
      if (key === 'night' || key === 'torch' || key === 'sun' || key === 'moon' || key === 'dark') continue;
      if (this.mix[key] > eps || t[key] > eps) return false;
    }
    return true;
  }

  /** True when every mix value sits at its target and nothing waits to settle (the effects' inputs are still). */
  resting(eps = 0.002): boolean {
    if (this.pending()) return false;
    const t = mixTargets(this.settled, this.cats, this.tgt);
    for (const key of MIX_KEYS) if (Math.abs(this.mix[key] - t[key]) > eps) return false;
    return true;
  }

  /**
   * True while a mix value moves toward its target (a transition the effects
   * show; the dwell before one is not). The sky selection does not move while
   * it holds after a clock change.
   */
  moving(eps = 0.002): boolean {
    const t = mixTargets(this.settled, this.cats, this.tgt);
    const hold = this.skyHold > 0;
    for (const key of MIX_KEYS) {
      if (hold && SKY_KEYS.has(key)) continue;
      if (Math.abs(this.mix[key] - t[key]) > eps) return true;
    }
    return false;
  }

  /** True while a dwelled value waits to settle. */
  pending(): boolean {
    return DWELLED.some((k) => this.pendingSince[k] !== 0);
  }
}

/** `v` moved toward `t` by at most `s`. */
function toward(v: number, t: number, s: number): number {
  const d = t - v;
  return v + (d > s ? s : d < -s ? -s : d);
}
