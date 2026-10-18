// The weather signal bridge (stage 28 C, ADR 0091): game signals → the
// engine's `setState` / `emit`. Pure: no DOM, no bus; the controller
// (controller.ts) feeds it and hands it the engine as its sink.
//
//   Char.Vitals weather / fog / light / position
//                  read from the character model (src/gmcp/char.ts), which
//                  already merges the deltas (absent keys keep their value)
//                  and clears on a new connection or character; only keys
//                  whose value changed are forwarded. Absent = indoors,
//                  no fog, normal light, standing.
//   Event.Sun      rise | light | set | dark → 'sun.<what>' (the engine
//                  derives day / night from it: day from `light`, night
//                  from `dark`; `rise` / `set` open the dawn / dusk hour,
//                  still night / day, and start the sunrise / sunset when
//                  the clock cannot time it, ADR 0093)
//   Event.Moon     rise | set → 'moon.<what>'
//   Event.Darkness start | grow | shrink | end-soon | end → 'darkness.<what>'
//   almanac        the game clock (src/gmcp/clock.ts, gametime.ts): the
//                  moon phase always; sun and moon up at start and at each
//                  change the almanac predicts (an event in between wins
//                  until the next predicted change); how far the sun is
//                  through the day (`sunU`, for the sun glimpses); at
//                  minute precision the seconds the day and the night
//                  begin (`dayAt`, `nightAt`), which time sunrise and sunset
//   text lines     lightning flash messages → 'strike'; a wind message in
//                  a weather tag → 'gust' (see `lineEvent`)
//
// Magical darkness is a spell someone casts: only its Event.Darkness events
// give an effect (owner feedback 26); no room text or light value does.

import { type ClockState, dayBeginsAt, dayHour, isDay, momentAt, nightBeginsAt, nightHour } from '../gmcp/clock';
import { moonAt, moonUpFraction } from '../gmcp/gametime';
import type { Line } from '../core/types';
import type { FogSym, WeatherEvent, WeatherState, WeatherSym } from './protocol';

export interface WeatherSink {
  setState(partial: Partial<WeatherState>, opts?: { instant?: boolean; settle?: boolean }): void;
  emit(event: WeatherEvent, data?: unknown): void;
}

/** The vitals part of the state. */
export type VitalsState = Pick<WeatherState, 'weather' | 'fog' | 'light' | 'position'>;
/** The almanac part of the state. */
export type SkyState = Pick<WeatherState, 'clock' | 'moonUp' | 'moonPhase' | 'moonU' | 'sunU' | 'dayAt' | 'nightAt'>;

const WEATHER_SYMS: readonly string[] = [' ', '~', "'", '"', '*'];

/** The weather part of `Char.Vitals` (a merged map, or a raw object). */
export function vitalsState(get: (key: string) => unknown): VitalsState {
  const w = get('weather');
  const f = get('fog');
  const l = get('light');
  const p = get('position');
  return {
    weather: typeof w === 'string' && WEATHER_SYMS.includes(w) ? (w as WeatherSym) : null,
    fog: f === '-' || f === '=' ? (f as FogSym) : '',
    light: typeof l === 'string' ? l : '',
    position: typeof p === 'string' && p.trim() ? p.trim().toLowerCase() : 'standing',
  };
}

/**
 * Sun and moon from the almanac at `nowMs`. Null for the sun and moon
 * while the clock has never synced (`unset`); the phase is given anyway.
 */
export function almanacState(
  clock: Readonly<ClockState>,
  nowMs: number,
): { sky: Omit<SkyState, 'moonPhase' | 'moonU' | 'sunU' | 'dayAt' | 'nightAt'> | null; moonPhase: number; moonU: number; sunU: number; dayAt: number; nightAt: number } {
  const nowS = Math.floor(nowMs / 1000);
  const g = nowS - clock.epoch;
  const moon = moonAt(g);
  const moonPhase = moon.level / 12;
  if (clock.precision === 'unset') return { sky: null, moonPhase, moonU: -1, sunU: -1, dayAt: -1, nightAt: -1 };
  const m = momentAt(clock.epoch, nowS);
  const day = isDay(m.month, m.hour);
  return {
    sky: { clock: day ? 'day' : 'night', moonUp: moon.position !== 'below' },
    moonPhase,
    moonU: moonUpFraction(g),
    sunU: day ? sunUpFraction(m.month, m.hour, m.minute) : -1,
    dayAt: dayBeginsAt(clock, nowMs) ?? -1,
    nightAt: nightBeginsAt(clock, nowMs) ?? -1,
  };
}

/** How far the sun is through the day at `hour:minute` of `month`: 0 when the day begins (the hour after the dawn hour), → 1 when the night begins (the hour after the dusk hour). */
export function sunUpFraction(month: number, hour: number, minute: number): number {
  const d0 = dayHour(month) * 60, d1 = nightHour(month) * 60;
  return Math.min(1, Math.max(0, (hour * 60 + minute - d0) / (d1 - d0)));
}

/** `sunU` is sent again once it has moved on this much (~30–40 game minutes; the glimpses need no finer step). */
export const SUN_U_STEP = 0.05;

/** How often the almanac is re-read (real ms; one game minute is one second). */
export const ALMANAC_MS = 30_000;

// ---------------------------------------------------------------- text

/**
 * A lightning flash: "A bright streak of lightning flashes over the wet
 * mountains." Not the `weather` command's "… lit by some flashes of
 * lightning", nor "The lightning has stopped."
 */
const FLASH_RE = /\b(?:streak|bolt|fork|flash) of lightning\b|\blightning (?:flashes|strikes|splits|forks|cracks)\b/i;
const NOT_FLASH_RE = /\blit by\b|\bhas stopped\b|\bstops\b/i;
/** Fallback without a `weather` tag (the tag is unverified live, ADR 0091). */
const FLASH_FALLBACK_RE = /^A bright streak of lightning flashes\b/;
/** A gust: "You can feel a tempestuous wind coming from the north." (only inside a weather tag, or this exact form). */
const GUST_RE = /\bwind (?:coming|blowing) from\b/i;
const GUST_FALLBACK_RE = /^You can feel an? [a-z-]+ wind coming from\b/;

/** What a text line means for the weather: a strike, a gust, or nothing. */
export function lineEvent(line: Readonly<Pick<Line, 'text' | 'tags' | 'prompt'>>): 'strike' | 'gust' | null {
  if (line.prompt) return null;
  const tags = line.tags;
  let tagged = false;
  for (let i = 0; i < tags.length; i++) {
    const t = tags[i]!;
    if (t.tag !== 'weather') continue;
    tagged = true;
    const s = line.text.slice(t.start, t.end < 0 ? undefined : t.end);
    if (FLASH_RE.test(s) && !NOT_FLASH_RE.test(s)) return 'strike';
    if (GUST_RE.test(s)) return 'gust';
  }
  if (tagged) return null;
  const text = line.text;
  // One char test first: most lines start with neither 'A' nor 'Y'.
  const c = text.charCodeAt(0);
  if (c === 65 && FLASH_FALLBACK_RE.test(text)) return 'strike';
  if (c === 89 && GUST_FALLBACK_RE.test(text)) return 'gust';
  return null;
}

// ------------------------------------------------------------- bridge

const SUN = new Set(['rise', 'light', 'set', 'dark']);
const MOON = new Set(['rise', 'set']);
const DARKNESS = new Set(['start', 'grow', 'shrink', 'end-soon', 'end']);

/** GMCP event package (lower case) + payload → the engine event, or null. */
export function gmcpEvent(key: string, data: unknown): WeatherEvent | null {
  const what = (data as { what?: unknown } | null | undefined)?.what;
  if (typeof what !== 'string') return null;
  if (key === 'event.sun') return SUN.has(what) ? (`sun.${what}` as WeatherEvent) : null;
  if (key === 'event.moon') return MOON.has(what) ? (`moon.${what}` as WeatherEvent) : null;
  if (key === 'event.darkness') return DARKNESS.has(what) ? (`darkness.${what}` as WeatherEvent) : null;
  return null;
}

export class WeatherSignals {
  private vit: VitalsState;
  private sky: SkyState;
  /** The almanac's last sun / moon (a predicted change applies once). */
  private almanacSky: Omit<SkyState, 'moonPhase' | 'moonU' | 'sunU' | 'dayAt' | 'nightAt'> | null = null;
  /** Bench / dev: values that win over the game's. */
  private pinned: Partial<WeatherState> | null = null;

  constructor(
    private readonly sink: WeatherSink,
    vitals: VitalsState,
    clock: Readonly<ClockState>,
    nowMs: number,
  ) {
    this.vit = vitals;
    const a = almanacState(clock, nowMs);
    this.almanacSky = a.sky;
    this.sky = { clock: a.sky?.clock ?? 'day', moonUp: a.sky?.moonUp ?? false, moonPhase: a.moonPhase, moonU: a.moonU, sunU: a.sunU, dayAt: a.dayAt, nightAt: a.nightAt };
  }

  /** The state to start the engine with. */
  state(): WeatherState {
    return { ...this.vit, ...this.sky, ...this.pinned };
  }

  /** The current vitals (after a `Char.*` change); forwards the keys that changed. */
  vitals(v: VitalsState): void {
    const prev = this.vit;
    let out: Partial<WeatherState> | null = null;
    for (const k of ['weather', 'fog', 'light', 'position'] as const) {
      if (v[k] === prev[k]) continue;
      (out ??= {})[k] = v[k] as never;
    }
    this.vit = v;
    if (out) this.push(out);
  }

  /** A GMCP message (`key` in lower case). Only Event.Sun / Moon / Darkness matter here. */
  gmcp(key: string, data: unknown): void {
    const ev = gmcpEvent(key, data);
    if (!ev) return;
    // (the engine sets sunU 0 / -1 from the event itself, director `eventState`)
    // `rise` / `set` open the dawn / dusk hour: the day comes with `light`, the night with `dark` (items 59, 61).
    if (ev === 'sun.light') {
      this.sky.clock = 'day';
      if (this.sky.sunU < 0) this.sky.sunU = 0;
    } else if (ev === 'sun.dark') {
      this.sky.clock = 'night';
      this.sky.sunU = -1;
    }
    else if (ev === 'moon.rise') {
      this.sky.moonUp = true;
      this.sky.moonU = 0;
    } else if (ev === 'moon.set') {
      this.sky.moonUp = false;
      this.sky.moonU = -1;
    }
    this.sink.emit(ev);
  }

  /** A text line: lightning or a gust. */
  line(line: Readonly<Pick<Line, 'text' | 'tags' | 'prompt'>>): void {
    const ev = lineEvent(line);
    if (ev) this.sink.emit(ev);
  }

  /**
   * The almanac at `nowMs`: the moon phase always; sun / moon when the
   * almanac's own value changed since the last call (a predicted rise or
   * set), or always with `force` (the clock was just synced).
   */
  almanac(clock: Readonly<ClockState>, nowMs: number, force = false): void {
    const a = almanacState(clock, nowMs);
    const out: Partial<WeatherState> = {};
    const moonWas = this.sky.moonUp;
    if (Math.abs(a.moonPhase - this.sky.moonPhase) > 1e-6) out.moonPhase = this.sky.moonPhase = a.moonPhase;
    const prev = this.almanacSky;
    if (a.sky) {
      if (force || !prev || prev.clock !== a.sky.clock) {
        if (this.sky.clock !== a.sky.clock) out.clock = this.sky.clock = a.sky.clock;
      }
      if (force || !prev || prev.moonUp !== a.sky.moonUp) {
        if (this.sky.moonUp !== a.sky.moonUp) out.moonUp = this.sky.moonUp = a.sky.moonUp;
      }
    }
    // Where the moon is on its way: at a clock sync, or when the almanac moves it up or down.
    if (a.sky && (force || out.moonUp !== undefined || (this.sky.moonUp && !moonWas))) out.moonU = this.sky.moonU = this.sky.moonUp ? Math.max(0, a.moonU) : -1;
    // How far the sun is through the day: at a sync, at a predicted rise or set, and every SUN_U_STEP.
    const su = this.sky.sunU;
    if (force || out.clock !== undefined || (a.sunU < 0) !== (su < 0) || Math.abs(a.sunU - su) >= SUN_U_STEP) {
      if (a.sunU !== su) out.sunU = this.sky.sunU = a.sunU;
    }
    // The seconds the day and the night begin (minute precision): change at a sync, at nightfall and daybreak.
    if (a.dayAt !== this.sky.dayAt) out.dayAt = this.sky.dayAt = a.dayAt;
    if (a.nightAt !== this.sky.nightAt) out.nightAt = this.sky.nightAt = a.nightAt;
    this.almanacSky = a.sky;
    if (Object.keys(out).length) this.push(out);
  }

  /**
   * Bench / dev / the demo: these values win over the game's until
   * `pin(null)`. Applied at once (`jump`), or with `smooth` settled at once
   * but eased with the normal transitions (the demo, and its release back to
   * the game's values).
   */
  pin(p: Partial<WeatherState> | null, smooth = false): void {
    this.pinned = p && Object.keys(p).length ? { ...p } : null;
    this.sink.setState(this.state(), smooth ? { settle: true } : { instant: true });
  }

  private push(out: Partial<WeatherState>): void {
    const pin = this.pinned;
    if (pin) for (const k of Object.keys(pin) as (keyof WeatherState)[]) delete out[k];
    if (Object.keys(out).length) this.sink.setState(out);
  }
}
