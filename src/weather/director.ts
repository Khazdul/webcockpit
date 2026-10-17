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
//   the clock (sunrise, sunset) only once SKY_HOLD_S has passed, so the day
//   sky stays through most of the sunset and the night through most of the
//   sunrise (owner feedback 29).
// - A category that is off has its targets at 0, so it fades out.
// - `speed` (the demo, `#weather demo`; 1 otherwise) runs the slow paces
//   faster: the sky selection and its hold, and fog. The worker's modules
//   read the same factor for sun moments, cloud cover, the rain's and snow's
//   build-up and the blood's drying (`Env.speed`).

import { ALL_CATEGORIES, type Categories, DEFAULT_STATE, type WeatherEvent, type WeatherState } from './protocol';

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
 * After the clock changes (Event.Sun, the almanac), the sky selection waits
 * this long before it moves: with SKY_RATE, the day sky goes from 11 s to
 * 23 s into the 26 s sunset (worker/sky.ts SET_S), the night from 11 s to
 * 23 s into the 24 s sunrise (RISE_S).
 */
export const SKY_HOLD_S = 11;

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
    case 'sun.rise':
    case 'sun.light':
      // the day starts (the almanac's sunU, when synced, follows within a step)
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
  /** Demo time scale for the slow paces (sky selection, its hold, fog); 1 = the game's pace. */
  speed = 1;

  constructor(state: Partial<WeatherState> = {}, cats: Categories = { ...ALL_CATEGORIES }) {
    this.raw = { ...DEFAULT_STATE, ...state };
    this.settled = { ...this.raw };
    this.cats = { ...cats };
    this.snap();
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
    return ch;
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
    if (settled.clock !== raw.clock) this.skyHold = SKY_HOLD_S;
    settled.clock = raw.clock;
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
    // fog: a constant rate (switching the category off still fades at MIX_TAU)
    if (this.cats.fog) m.fog = toward(fog0, t.fog, sdt * FOG_RATE);
  }

  /** Settles and eases in one go (one frame). */
  tick(now: number, dt: number): void {
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
