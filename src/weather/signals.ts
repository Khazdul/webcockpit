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
//                  derives day / night from it)
//   Event.Moon     rise | set → 'moon.<what>'
//   Event.Darkness start | grow | shrink | end-soon | end → 'darkness.<what>'
//   almanac        the game clock (src/gmcp/clock.ts, gametime.ts): the
//                  moon phase always; sun and moon up at start and at each
//                  change the almanac predicts (an event in between wins
//                  until the next predicted change)
//   text lines     lightning flash messages → 'strike'; a wind message in
//                  a weather tag → 'gust' (see `lightningLine`)

import { type ClockState, isDay, momentAt } from '../gmcp/clock';
import { moonAt } from '../gmcp/gametime';
import type { Line } from '../core/types';
import type { FogSym, WeatherEvent, WeatherState, WeatherSym } from './protocol';

export interface WeatherSink {
  setState(partial: Partial<WeatherState>, opts?: { instant?: boolean }): void;
  emit(event: WeatherEvent, data?: unknown): void;
}

/** The vitals part of the state. */
export type VitalsState = Pick<WeatherState, 'weather' | 'fog' | 'light' | 'position'>;
/** The almanac part of the state. */
export type SkyState = Pick<WeatherState, 'clock' | 'moonUp' | 'moonPhase'>;

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
export function almanacState(clock: Readonly<ClockState>, nowMs: number): { sky: Omit<SkyState, 'moonPhase'> | null; moonPhase: number } {
  const nowS = Math.floor(nowMs / 1000);
  const g = nowS - clock.epoch;
  const moon = moonAt(g);
  const moonPhase = moon.level / 12;
  if (clock.precision === 'unset') return { sky: null, moonPhase };
  const m = momentAt(clock.epoch, nowS);
  return { sky: { clock: isDay(m.month, m.hour) ? 'day' : 'night', moonUp: moon.position !== 'below' }, moonPhase };
}

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
  private almanacSky: Omit<SkyState, 'moonPhase'> | null = null;
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
    this.sky = { clock: a.sky?.clock ?? 'day', moonUp: a.sky?.moonUp ?? false, moonPhase: a.moonPhase };
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
    if (ev === 'sun.rise' || ev === 'sun.light') this.sky.clock = 'day';
    else if (ev === 'sun.set' || ev === 'sun.dark') this.sky.clock = 'night';
    else if (ev === 'moon.rise') this.sky.moonUp = true;
    else if (ev === 'moon.set') this.sky.moonUp = false;
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
    this.almanacSky = a.sky;
    if (Object.keys(out).length) this.push(out);
  }

  /** Bench / dev: these values win over the game's until `pin(null)`; applied at once. */
  pin(p: Partial<WeatherState> | null): void {
    this.pinned = p && Object.keys(p).length ? { ...p } : null;
    this.sink.setState(this.state(), { instant: true });
  }

  private push(out: Partial<WeatherState>): void {
    const pin = this.pinned;
    if (pin) for (const k of Object.keys(pin) as (keyof WeatherState)[]) delete out[k];
    if (Object.keys(out).length) this.sink.setState(out);
  }
}
