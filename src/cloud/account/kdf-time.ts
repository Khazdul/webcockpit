// How long the password's slow step takes on this device, for the
// "Working…" bar (spec §7.3). The last measured derivation is remembered
// in localStorage (`wc.kdfMs`, as milliseconds per 600 000 rounds); before
// the first one a guess by device type is used. The dev machine does
// 600 000 rounds in 60–180 ms (ADR 0145 "The KDF worker"); a phone takes
// several times longer, and the guesses lean high so the bar is early
// rather than stuck at its end.

import { DEFAULT_KDF, type DeviceType } from '../../../shared/cloud/api.ts';
import { device } from '../../core/device';
import { deviceType } from '../device-info';

export const KDF_TIME_KEY = 'wc.kdfMs';

/** The first guess (ms per 600 000 rounds). */
export const KDF_GUESS_MS: Record<DeviceType, number> = { desktop: 400, tablet: 1200, phone: 1800 };

/** Measurements outside this are not believed (a clock jump, a tab asleep). */
const MIN_MS = 5;
const MAX_MS = 120_000;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function guess(): number {
  try {
    return KDF_GUESS_MS[deviceType(device())];
  } catch {
    return KDF_GUESS_MS.desktop; // the device is not decided (tests)
  }
}

/**
 * The expected time (ms) of one password derivation at `rounds` on this
 * device: the last measured one scaled to `rounds`, or the guess.
 */
export function estimateKdfMs(rounds: number = DEFAULT_KDF.rounds): number {
  let per = guess();
  try {
    const stored = Number(storage()?.getItem(KDF_TIME_KEY));
    if (Number.isFinite(stored) && stored >= MIN_MS && stored <= MAX_MS) per = stored;
  } catch {
    /* storage blocked */
  }
  return Math.round((per * rounds) / DEFAULT_KDF.rounds);
}

/** Remembers a measured derivation of `rounds` that took `ms`. */
export function noteKdfMs(ms: number, rounds: number): void {
  if (!Number.isFinite(ms) || !(rounds > 0)) return;
  const per = (ms * DEFAULT_KDF.rounds) / rounds;
  if (per < MIN_MS || per > MAX_MS) return;
  try {
    storage()?.setItem(KDF_TIME_KEY, String(Math.round(per)));
  } catch {
    /* storage full or blocked */
  }
}
