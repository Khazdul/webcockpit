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
//   owner feedback 27); the sky selection at SKY_RATE (12 s day ↔ night when
//   the clock turns without a sunrise or sunset, a moon rising or setting).
// - Sunrise and sunset are timed by the clock, not by events (ADR 0093):
//   over the 60 s before the day begins (`dayAt`) or the night begins
//   (`nightAt`), the almanac's seconds at minute precision, the turn's `s`
//   runs from -60 to 0 and the sky selection follows sunturn.ts
//   `turnWeight` (a sunrise's day complete at the turn, a sunset's night with
//   its stars too, owner items 76, 77, 81); from 0 the settled clock is
//   the new one. A resync glides `s` toward the clock's time (a big one
//   snaps, never back over the turn); a page load or sync mid-turn joins at
//   its place. Without minute precision `Event.Sun rise` / `set` starts it
//   at -60 and it runs on its own; `light` / `dark` without one fades over
//   12 s. One turn of a kind at a time and none twice in one dawn or dusk:
//   none starts within TURN_GUARD_MS after one of its kind reached its
//   second (reset by `jump` and a speed change; the demo's turns never count).
// - A game flash line (ADR 0094; the 'strike' event with `{ storm: true }`)
//   opens a STORM_WINDOW_S window with STORM_EXTRA more strikes at random
//   times, none in its first STORM_QUIET_S, spread over the rest. They fall
//   only while the raw weather (no dwell) is rain or snow and Lightning is
//   on: a room without rain or snow ends the window at once; a new flash
//   opens a new one. The engine asks `stormStrike` once per tick (also while
//   idle, at 4 Hz) and emits 'strike'.
// - A category that is off has its targets at 0, so it fades out.
// - `speed` (a dev time scale, `__weather.setSpeed`; 1 otherwise) runs the slow paces
//   faster: the sky selection, sunrise and sunset, and fog. The worker's
//   modules read the same factor for cloud cover, the rain's and snow's
//   build-up and the blood's drying (`Env.speed`).

import { ALL_CATEGORIES, type Categories, DEFAULT_STATE, type WeatherEvent, type WeatherState } from './protocol';
import { FULL_S, LATE_S, TURN_S, type TurnKind, turnWeight } from './sunturn';

export const DWELL_MS = 3000;
/** Mix easing time constant, seconds. */
export const MIX_TAU = 0.9;
/** Fog mix change per second: none → light (0.5) or light → dense takes 20 s, none → dense 40 s; the same going away. */
export const FOG_RATE = 1 / 40;
/** Outdoors mix change per second: going in or out crossfades the whole sky over 5 s (owner feedback 27). */
export const OUT_RATE = 1 / 5;
/** Sky selection change per second: day ↔ night over 12 s, moon up ↔ down too (owner feedback 29). */
export const SKY_RATE = 1 / 12;
/** A clock correction during a sunrise or sunset glides out with this time constant, s. */
export const TURN_GLIDE_TAU = 2;
/** A correction larger than this (s) snaps instead. */
export const TURN_SNAP_S = 15;
/** A turn started mid-way glides onto its sky curve at this rate (share/s; above the curves' steepest 0.05/s, so once on it it follows it). */
export const TURN_JOIN_RATE = 0.1;
/** A page load or sync joins a turn the clock is in up to this long after its second (s): its sky is complete then, but the turn gives the new clock before the almanac re-reads it. */
export const TURN_JOIN_S = 14;
/** No new turn of a kind starts this long (wall ms) after one reached its second: never two in one dawn or dusk (a game day is 24 min). */
export const TURN_GUARD_MS = 20 * 60_000;
/** After a game flash line, more strikes come for this long, s (owner item 90). */
export const STORM_WINDOW_S = 30;
/** None of them in the first this long after the flash, s. */
export const STORM_QUIET_S = 5;
/** How many more strikes a flash brings (random in the range, inclusive). */
export const STORM_EXTRA: readonly [number, number] = [2, 3];
/** The weather is not checked this long after the flash, ms: the room's Char.Vitals may come just after its text. */
export const STORM_GRACE_MS = 1500;
/** Weather in which the window's strikes fall (rain, heavy rain, snow). */
const STORM_WEATHER: ReadonlySet<string | null> = new Set(["'", '"', '*']);

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

/**
 * Cloud cover by weather (owner item 92): `~` partly cloudy (gaps), light
 * rain mostly cloudy, heavy rain and snow fully overcast (the sky's deck
 * closes at 1). GMCP has no other cloud levels.
 */
export const CLOUD_COVER: Readonly<Record<string, number>> = { '~': 0.6, "'": 0.88, '"': 1, '*': 1 };

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
    // The day or night begins (the almanac's sunU, when synced, follows within
    // a step). `sun.rise` / `sun.set` open the dawn / dusk hour, still night /
    // day: they start the sunrise / sunset (`turnEvent`).
    case 'sun.light':
      return { clock: 'day', sunU: 0 };
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
  cats: Categories;
  private speedK = 1;
  /**
   * The sunrise or sunset now: its kind, `s` (seconds relative to the second
   * the day or night begins, -60 … LATE_S) and the new sky's share when it
   * started (a turn never takes back a sky that had already turned); null
   * without one (sunturn.ts, ADR 0093).
   */
  turn: { kind: TurnKind; s: number; base: number; demo?: boolean } | null = null;
  /** Wall ms when the last turn of each kind reached its second (TURN_GUARD_MS). */
  private readonly turnDone: Record<TurnKind, number> = { rise: -Infinity, set: -Infinity };
  /** The wall clock, unix ms (the worker's; tests set their own). */
  wall: () => number = Date.now;
  /** Random 0..1 for the storm's strikes (tests set their own). */
  rand: () => number = Math.random;
  /** The storm window's strikes still to come (the engine's ms, ascending); empty without one. */
  stormAt: number[] = [];
  /** When the storm window opened (the engine's ms). */
  private stormFrom = 0;

  /** Dev time scale for the slow paces (sky selection, fog, sunrise and sunset; `__weather.setSpeed`); 1 = the game's pace. */
  get speed(): number {
    return this.speedK;
  }
  set speed(v: number) {
    this.speedK = v;
    // a change of pace starts afresh: no earlier turn holds back the next
    this.turnDone.rise = this.turnDone.set = -Infinity;
  }

  /** The sunrise's `s`, or null. */
  get riseS(): number | null {
    return this.turn?.kind === 'rise' ? this.turn.s : null;
  }
  /** The sunset's `s`, or null. */
  get setS(): number | null {
    return this.turn?.kind === 'set' ? this.turn.s : null;
  }

  constructor(state: Partial<WeatherState> = {}, cats: Categories = { ...ALL_CATEGORIES }) {
    this.raw = { ...DEFAULT_STATE, ...state };
    this.settled = { ...this.raw };
    this.cats = { ...cats };
    this.snap();
    this.joinTurn();
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
    this.snap();
    this.turn = null;
    this.turnDone.rise = this.turnDone.set = -Infinity;
    this.joinTurn();
    return ch;
  }

  /** At once (start, `jump`): a sunrise or sunset the clock is in joins at its place, and the mix with it. */
  private joinTurn(): void {
    this.advance(0);
    if (!this.turn) return;
    this.settle(0);
    this.snap();
    this.step(0);
  }

  /** The clock's time relative to the `kind` turn's second (from `dayAt` / `nightAt`), s; NaN when unknown. */
  private clockS(kind: TurnKind, wall: number): number {
    const at = kind === 'rise' ? this.raw.dayAt : this.raw.nightAt;
    return at >= 0 ? (wall - at) / 1000 : NaN;
  }

  /**
   * Advances the sunrise or sunset by `dt` s: starts one when the clock's
   * time lies in it, glides toward that time, ends it LATE_S after its
   * second.
   */
  advance(dt: number): void {
    const wall = this.wall();
    const inside = (x: number): boolean => x >= -TURN_S && x < LATE_S;
    const T = this.turn;
    if (!T) {
      for (const kind of ['rise', 'set'] as const) {
        const tg = this.clockS(kind, wall);
        if (inside(tg) && tg < TURN_JOIN_S && this.start(kind, tg, wall)) return;
      }
      return;
    }
    const was = T.s;
    let s = was + dt * this.speedK;
    const tg = this.clockS(T.kind, wall);
    if (inside(tg)) {
      const err = tg - s;
      // a big correction snaps, but never back over the turn once it came
      if (Math.abs(err) > TURN_SNAP_S) {
        if (!(s >= 0 && err < 0)) s = tg;
      } else s += err * (1 - Math.exp(-dt / TURN_GLIDE_TAU));
    }
    if (was < 0 && s >= 0 && !T.demo) this.turnDone[T.kind] = wall;
    // done: LATE_S after its second, or once its sky is complete when the clock says another time (a one-turn demo released)
    if (s > LATE_S || (tg === tg && !inside(tg) && s >= FULL_S)) this.turn = null;
    else T.s = s;
  }

  /**
   * `Event.Sun rise` / `set` (the dawn or dusk hour begins): the sunrise or
   * sunset from its start (or `from` s before its second: the demo, whose
   * turns never hold back the game's), unless one of that kind runs or ran
   * this dawn or dusk.
   */
  turnEvent(kind: TurnKind, from?: unknown): void {
    const demo = typeof from === 'number' && from >= -TURN_S && from < 0;
    if (this.turn?.kind !== kind && this.start(kind, demo ? from : -TURN_S, this.wall()) && demo) this.turn!.demo = true;
  }

  /** Starts a turn (it ends one of the other kind); false when its guard holds. */
  private start(kind: TurnKind, s: number, wall: number): boolean {
    if (wall - this.turnDone[kind] < TURN_GUARD_MS) return false;
    this.turn = { kind, s, base: kind === 'rise' ? this.mix.sun : 1 - this.mix.sun };
    if (s >= 0) this.turnDone[kind] = wall;
    return true;
  }

  /**
   * A game flash line at `now` (the engine's ms): a new storm window with
   * STORM_EXTRA strikes, one in each equal part of STORM_QUIET_S …
   * STORM_WINDOW_S (spread, at random within its part).
   */
  stormFlash(now: number): void {
    const [lo, hi] = STORM_EXTRA, n = lo + Math.min(hi - lo, Math.floor(this.rand() * (hi - lo + 1)));
    const span = (STORM_WINDOW_S - STORM_QUIET_S) / n;
    this.stormAt = [];
    this.stormFrom = now;
    for (let i = 0; i < n; i++) this.stormAt.push(now + (STORM_QUIET_S + span * (i + this.rand())) * 1000);
  }

  /** Ends the storm window (a new connection or character, a pin). */
  stormOff(): void {
    this.stormAt = [];
  }

  /**
   * True when one of the storm window's strikes is due at `now`. The window
   * ends at once when the raw weather is not rain or snow (no dwell; from
   * STORM_GRACE_MS after the flash).
   */
  stormStrike(now: number): boolean {
    const at = this.stormAt;
    if (!at.length) return false;
    if (!STORM_WEATHER.has(this.raw.weather) && now - this.stormFrom >= STORM_GRACE_MS) {
      this.stormAt = [];
      return false;
    }
    if (now < at[0]!) return false;
    // one per tick; any others overdue (a hidden tab) are dropped
    while (at.length && at[0]! <= now) at.shift();
    return this.cats.lightning;
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
    // the day or night begins with its turn's second (the clock's own change may come up to an almanac re-read later)
    const T = this.turn;
    settled.clock = T && T.s >= 0 ? (T.kind === 'rise' ? 'day' : 'night') : raw.clock;
    settled.dayAt = raw.dayAt;
    settled.nightAt = raw.nightAt;
    settled.moonRiseAt = raw.moonRiseAt;
    settled.moonSetAt = raw.moonSetAt;
    settled.moonPhase = raw.moonPhase;
    settled.moonUp = raw.moonUp;
    settled.moonU = raw.moonU;
    settled.sunU = raw.sunU;
  }

  /** Eases the mix values toward their targets over `dt` seconds. */
  step(dt: number): void {
    const t = mixTargets(this.settled, this.cats, this.tgt);
    const k = 1 - Math.exp(-dt / MIX_TAU), m = this.mix;
    const fog0 = m.fog, sun0 = m.sun;
    const sdt = dt * this.speed;
    const sky = sdt * SKY_RATE;
    for (const key of MIX_KEYS) {
      if (SKY_KEYS.has(key)) m[key] = toward(m[key], t[key], sky);
      else if (key === 'outdoors') m[key] = toward(m[key], t[key], dt * OUT_RATE);
      else m[key] += (t[key] - m[key]) * k;
    }
    const T = this.turn;
    if (T && T.s <= FULL_S) {
      // A sunrise or sunset sets the sky selection itself: the new sky's
      // share by its curve; the night's split between moon and dark moves at
      // SKY_RATE.
      const nw = Math.max(T.base, turnWeight(T.kind, T.s));
      // a turn started mid-way by an event (the demo's `from`) glides onto its curve; joining at once (dt 0) sets it
      const w = dt > 0 ? toward(sun0, T.kind === 'rise' ? nw : 1 - nw, sdt * TURN_JOIN_RATE) : T.kind === 'rise' ? nw : 1 - nw;
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
    this.advance(dt);
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
   * show; the dwell before one is not).
   */
  moving(eps = 0.002): boolean {
    const t = mixTargets(this.settled, this.cats, this.tgt);
    for (const key of MIX_KEYS) {
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
