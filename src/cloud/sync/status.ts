// The sync's state for the start menu's owner row and the Account page
// (spec §7.4 "State"), and the back-off after a failure (ADR 0151).

import type { SyncStatus } from './types';

/** A value with listeners: the owner row and the Account page subscribe. */
export class Observable<T> {
  private value: T;
  private readonly listeners = new Set<(value: T) => void>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(value: T): void {
    this.value = value;
    for (const fn of [...this.listeners]) fn(value);
  }

  /** Calls `fn` with every new value; returns the unsubscribe. */
  subscribe(fn: (value: T) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

export const INITIAL_STATUS: SyncStatus = {
  state: 'syncing',
  waiting: 0,
  held: 0,
  lastSynced: null,
  retryAt: null,
  full: null,
  usage: null,
  limits: null,
};

/** Seconds before the n-th retry in a row (the last repeats). */
export const BACKOFF_SECONDS: readonly number[] = [5, 15, 30, 60, 120, 300];

/**
 * The wait before retry number `failures` (1 for the first), in ms, with
 * ±20 % jitter from `random` (0 ≤ r < 1) so tabs and devices that failed
 * together do not come back together.
 */
export function backoffMs(failures: number, random: () => number = Math.random): number {
  const i = Math.min(Math.max(failures, 1), BACKOFF_SECONDS.length) - 1;
  const base = BACKOFF_SECONDS[i]! * 1000;
  return Math.round(base * (0.8 + 0.4 * random()));
}
