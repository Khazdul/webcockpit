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
// - Mix values ease exponentially (tau 0.9 s) toward their targets; fog
//   instead moves at a constant FOG_RATE (a step between none, light and
//   dense takes 20 s, owner feedback 8), so it grows and thins gradually.
// - A category that is off has its targets at 0, so it fades out.

import { ALL_CATEGORIES, type Categories, DEFAULT_STATE, type WeatherEvent, type WeatherState } from './protocol';

export const DWELL_MS = 3000;
/** Mix easing time constant, seconds. */
export const MIX_TAU = 0.9;
/** Fog mix change per second: none → light (0.5) or light → dense takes 20 s, none → dense 40 s; the same going away. */
export const FOG_RATE = 1 / 40;

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
  out.sun = outd && day ? 1 : 0;
  out.moon = outd && !day && s.moonUp ? 1 : 0;
  out.torch = s.light === '!' ? 1 : 0;
  out.night = day ? 0 : 1;
  out.dark = outd && !day && !s.moonUp ? 1 : 0;
  out.clouds = cats.sky ? outd * (CLOUD_COVER[s.weather ?? ''] ?? 0) : 0;
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
      return { clock: 'day' };
    case 'sun.set':
    case 'sun.dark':
      return { clock: 'night' };
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

  constructor(state: Partial<WeatherState> = {}, cats: Categories = { ...ALL_CATEGORIES }) {
    this.raw = { ...DEFAULT_STATE, ...state };
    this.settled = { ...this.raw };
    this.cats = { ...cats };
    this.snap();
  }

  /**
   * Sets raw values. Returns the position change, if any (the 'position'
   * event for the effects). `now` is the clock the dwell runs on (ms).
   */
  set(partial: Partial<WeatherState>): { from: string; to: string } | null {
    const prev = this.raw.position;
    for (const k of Object.keys(partial) as (keyof WeatherState)[]) {
      const v = partial[k];
      if (v !== undefined) (this.raw as unknown as Record<string, unknown>)[k] = v;
    }
    return this.raw.position !== prev ? { from: prev, to: this.raw.position } : null;
  }

  /** Sets raw values and makes them settled and mixed at once (tests, page load, dev jumps). */
  jump(partial: Partial<WeatherState>): { from: string; to: string } | null {
    const ch = this.set(partial);
    Object.assign(this.settled, this.raw);
    for (const k of DWELLED) this.pendingSince[k] = 0;
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
    settled.clock = raw.clock;
    settled.moonPhase = raw.moonPhase;
    settled.moonUp = raw.moonUp;
    settled.moonU = raw.moonU;
  }

  /** Eases the mix values toward their targets over `dt` seconds. */
  step(dt: number): void {
    const t = mixTargets(this.settled, this.cats, this.tgt);
    const k = 1 - Math.exp(-dt / MIX_TAU);
    const fog0 = this.mix.fog;
    for (const key of MIX_KEYS) this.mix[key] += (t[key] - this.mix[key]) * k;
    if (this.cats.fog) {
      // fog: a constant rate instead (switching the category off still fades at MIX_TAU)
      const s = dt * FOG_RATE, d = t.fog - fog0;
      this.mix.fog = fog0 + (d > s ? s : d < -s ? -s : d);
    }
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
      if (key === 'night' || key === 'torch') continue; // tints only: draw nothing by themselves
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

  /** True while a dwelled value waits to settle. */
  pending(): boolean {
    return DWELLED.some((k) => this.pendingSince[k] !== 0);
  }
}
