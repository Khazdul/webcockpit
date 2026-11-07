// The start page's offline game clock (stage 41): the saved `wc.clock`
// anchor, else the cold-start seed epoch (src/gmcp/clock.ts), read once
// per call. Game time `g` is in game minutes since MUME year 0 began
// (1 real second = 1 game minute), as src/gmcp/gametime.ts takes it.
//
// Dev and test overrides (ADR 0124, src/start/sky/params.ts): `?skyHour=`,
// `?skyMonth=`, `?skyDay=` move the clock to that moment of the current
// year when it is first read, `?skyFast=` runs it faster, `?skyFreeze`
// stops it. The sky and the almanac both read this clock, so they agree.

import { CLOCK_KEY, DAY_S, MONTH_S, YEAR_S, loadClockState } from '../gmcp/clock';
import { type SkyParams, pageSkyParams } from './sky/params';

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The clock anchor (unix s) the start page uses. */
export function startEpoch(nowMs: number = Date.now(), store: Storage | null = storage()): number {
  let saved: string | null = null;
  try {
    saved = store?.getItem(CLOCK_KEY) ?? null;
  } catch {
    saved = null;
  }
  return loadClockState(saved, nowMs).epoch;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** The clock overrides of `p` in force (hour, month, day, speed, freeze), or null. */
export const clockShift = (p: SkyParams): SkyParams | null =>
  p.hour !== undefined || p.month !== undefined || p.day !== undefined || p.speed !== undefined || p.freeze ? p : null;

/**
 * Game minutes with the overrides of `p`: `real` (the true game minute
 * now) is moved by the shift chosen at `real0` (the first reading): the
 * same year, the given month, day and hour, then running at `speed`
 * (0 when frozen) from there.
 */
export function shiftedMinutes(real: number, real0: number, p: SkyParams): number {
  let g0 = real0;
  if (p.hour !== undefined || p.month !== undefined || p.day !== undefined) {
    const year = Math.floor(real0 / YEAR_S);
    const month = p.month ?? mod(Math.floor(real0 / MONTH_S), 12);
    const day = p.day !== undefined ? p.day - 1 : mod(Math.floor(real0 / DAY_S), 30);
    const minute = p.hour !== undefined ? p.hour * 60 : mod(real0, DAY_S);
    g0 = year * YEAR_S + month * MONTH_S + day * DAY_S + minute;
  }
  const speed = p.freeze ? 0 : (p.speed ?? 1);
  return g0 + (real - real0) * speed;
}

let first: number | null = null;

/** Game minutes now, by the start page's anchor (and the page's `sky*` overrides). */
export function startGameMinutes(nowMs: number = Date.now(), epoch: number = startEpoch(nowMs)): number {
  const real = Math.max(0, nowMs / 1000 - epoch);
  const shift = clockShift(pageSkyParams());
  if (!shift) return real;
  first ??= real;
  return shiftedMinutes(real, first, shift);
}
