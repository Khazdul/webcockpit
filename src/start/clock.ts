// The start page's offline game clock (stage 41): the saved `wc.clock`
// anchor, else the cold-start seed epoch (src/gmcp/clock.ts), read once
// per call. Game time `g` is in game minutes since MUME year 0 began
// (1 real second = 1 game minute), as src/gmcp/gametime.ts takes it.
//
// `?hour=`, `?month=` (dev/test overrides) may be added by the sky engine.

import { CLOCK_KEY, loadClockState } from '../gmcp/clock';

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

/** Game minutes now, by the start page's anchor. */
export function startGameMinutes(nowMs: number = Date.now(), epoch: number = startEpoch(nowMs)): number {
  return Math.max(0, nowMs / 1000 - epoch);
}
