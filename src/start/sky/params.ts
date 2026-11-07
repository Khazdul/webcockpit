// Dev and test URL parameters of the start page sky (ADR 0124). They work
// in production builds too (the owner tests on branch previews); none of
// them collides with the app's own (`safe`, `bench*`, `fixture`, `replay`,
// `speed`, `weather`, `player`, `session`, `replayhtml`).
//
//   skyHour=13.5        start the clock at this hour (0–24, fraction ok)
//   skyMonth=0          … in this month (0–11 or a Westron/Sindarin name)
//   skyDay=15           … on this day of the month (1–30: moves the moon)
//   skyFast[=600]       game time runs this many times faster (bare: 600)
//   skyFreeze           the clock stands still and the sky paints one still frame
//   skyWeather=snow     pin the weather (clear fair clouds rain storm fog snow; auto)
//   skyQuality=low      pin the quality tier (high medium low; auto)
//   skyMotion=reduce    as prefers-reduced-motion (or `full` to ignore it)
//   skyStats            a small frame-time readout in the corner

import { monthIndex } from '../../gmcp/clock';
import { SKY_WEATHER_STATES, type SkyWeatherState } from './weather';

export type SkyQuality = 'high' | 'medium' | 'low';
export const SKY_QUALITIES: readonly SkyQuality[] = ['high', 'medium', 'low'];

export interface SkyParams {
  hour?: number;
  month?: number;
  day?: number;
  speed?: number;
  freeze?: boolean;
  weather?: SkyWeatherState;
  quality?: SkyQuality;
  motion?: 'reduce' | 'full';
  stats?: boolean;
}

const num = (v: string | null, lo: number, hi: number): number | undefined => {
  if (v === null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
};

/** The sky parameters in a query string (`location.search`). Unknown or bad values are ignored. */
export function parseSkyParams(search: string): SkyParams {
  const q = new URLSearchParams(search);
  const out: SkyParams = {};
  const hour = num(q.get('skyHour'), 0, 24);
  if (hour !== undefined) out.hour = hour % 24;
  const m = q.get('skyMonth');
  if (m !== null) {
    const n = num(m, 0, 11);
    const i = n !== undefined ? Math.floor(n) : monthIndex(m);
    if (i >= 0) out.month = i;
  }
  const day = num(q.get('skyDay'), 1, 30);
  if (day !== undefined) out.day = Math.floor(day);
  if (q.has('skyFast')) out.speed = num(q.get('skyFast'), 0, 1e6) ?? 600;
  if (q.has('skyFreeze')) out.freeze = true;
  const w = q.get('skyWeather') as SkyWeatherState | null;
  if (w && SKY_WEATHER_STATES.includes(w)) out.weather = w;
  const ql = q.get('skyQuality') as SkyQuality | null;
  if (ql && SKY_QUALITIES.includes(ql)) out.quality = ql;
  const mo = q.get('skyMotion');
  if (mo === 'reduce' || mo === 'full') out.motion = mo;
  if (q.has('skyStats')) out.stats = true;
  return out;
}

let cached: SkyParams | null = null;
/** The page's sky parameters (read once). */
export function pageSkyParams(): SkyParams {
  if (!cached) {
    let search = '';
    try {
      search = globalThis.location?.search ?? '';
    } catch {
      search = '';
    }
    cached = parseSkyParams(search);
  }
  return cached;
}

/** Tests: forget the cached page parameters. */
export function resetSkyParams(): void {
  cached = null;
}
