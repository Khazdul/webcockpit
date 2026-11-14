// What the start menu and the Account page know of the sync (stage 61 part
// C, ADR 0151): the engine's status, the locked copy's notice, the move's
// lasting line, and the messages for the start menu's message line. Small
// on purpose: the start menu (the chrome chunk) imports it statically; the
// sync itself (src/cloud/space/, the engine, the crypto) is loaded with
// `import()` by `startSync`, only when an account is logged in here, the
// flag `sync` is on and the page is in the account's space (or a locked
// copy waits). Nothing here is on the game path (spec §7.0 rule 1).

import { spaceStorageKey } from '../core/space';
import type { SyncOutcome, SyncStatus, Unsynced } from './sync/types';

/** The locked copy's notice (ADR 0146 addendum, the owner's pick 2a). */
export interface LockedNotice {
  nameKey: string;
  /** The account's name as the server spells it (nameKey when not known). */
  name: string;
  /** "3 changes" / "3 changes and 1 saved run": what is kept. */
  what: string;
  /** Remove's list: one line each ("the profile warrior", "the scripts autoloot and hunt", "1 saved run"). */
  lost: string[];
}

export interface SyncView {
  /** The engine's status; null: no sync in this page. */
  status: SyncStatus | null;
  /** A locked copy kept on this device (the device's space). */
  locked: LockedNotice | null;
  /** The Account page's lasting line about the move ("4 profiles, 2 scripts"), or null. */
  moved: string | null;
  /** Items in the account's space now. */
  counts: { profiles: number; scripts: number } | null;
}

const EMPTY: SyncView = { status: null, locked: null, moved: null, counts: null };
let view: SyncView = EMPTY;
const viewFns = new Set<(v: SyncView) => void>();

export function syncView(): SyncView {
  return view;
}

/** Calls `fn` on every change; returns the unsubscribe. */
export function onSyncView(fn: (v: SyncView) => void): () => void {
  viewFns.add(fn);
  return () => void viewFns.delete(fn);
}

/** The runtime's: a part of the view changed. */
export function patchSyncView(patch: Partial<SyncView>): void {
  view = { ...view, ...patch };
  for (const fn of [...viewFns]) {
    try {
      fn(view);
    } catch {
      /* a listener's problem */
    }
  }
}

// ------------------------------------------------------------ messages

/** A message for the start menu's line (it may take two or three lines). */
export interface SyncMessage {
  text: string;
  /** How long it stays (ms). */
  ms: number;
  /** Replaces a message of the same `tag` (the move's progress). */
  tag?: string;
}

const queue: SyncMessage[] = [];
const msgFns = new Set<() => void>();

/** Posts a message; the start menu shows it when it is shown (at once when it is). */
export function postSyncMessage(m: SyncMessage): void {
  const i = m.tag ? queue.findIndex((q) => q.tag === m.tag) : -1;
  if (i >= 0) queue[i] = m;
  else queue.push(m);
  for (const fn of [...msgFns]) fn();
}

/** The next waiting message, taken. */
export function takeSyncMessage(): SyncMessage | null {
  return queue.shift() ?? null;
}

export function onSyncMessage(fn: () => void): () => void {
  msgFns.add(fn);
  return () => void msgFns.delete(fn);
}

// ------------------------------------------------------------ the page's state

let playing = false;
const playFns = new Set<(on: boolean) => void>();

/** The start page's: a game is the view (true) or the start page is shown again (false). */
export function setPlaying(on: boolean): void {
  if (on === playing) return;
  playing = on;
  for (const fn of [...playFns]) fn(on);
}

export function isPlaying(): boolean {
  return playing;
}

export function onPlaying(fn: (on: boolean) => void): () => void {
  playFns.add(fn);
  return () => void playFns.delete(fn);
}

// ------------------------------------------------------------ the runtime, lazily

/** What the runtime needs of the page (the chrome's services, kept loose here). */
export interface SyncHost {
  profiles: unknown;
  scripts?: unknown;
  settings: unknown;
}

interface Runtime {
  syncNow(): Promise<SyncOutcome | null>;
  /** The engine's `unsynced()`; null without an engine in this page. */
  unsynced(): Promise<Unsynced[] | null>;
}

let runtime: Promise<Runtime | null> | null = null;

/**
 * Starts the sync for this page once (idempotent): loads src/cloud/space
 * and lets it decide whether there is anything to do (an account's space
 * with the flag `sync`, a locked copy, a login to put in its space).
 */
export function startSync(host: SyncHost): void {
  runtime ??= import('./space/runtime').then((m) => m.startRuntime(host)).catch(() => null);
}

/** "Sync now" (the Account page, Log out). Null without a sync in this page. */
export async function syncNow(): Promise<SyncOutcome | null> {
  return (await runtime)?.syncNow() ?? null;
}

/** The local changes not in the account (the engine's `unsynced()`); null without a sync in this page. */
export async function unsyncedNow(): Promise<Unsynced[] | null> {
  return (await runtime)?.unsynced() ?? null;
}

/** Tests: forget everything. */
export function resetSyncViewForTests(): void {
  view = EMPTY;
  viewFns.clear();
  queue.length = 0;
  msgFns.clear();
  playing = false;
  playFns.clear();
  runtime = null;
}

// ------------------------------------------------------------ the "kept both" mark

/** localStorage (per space): profile ids with the "kept both" mark, until opened or renamed (the owner's pick 5b). */
export const KEPT_BOTH_KEY = 'wc.keptBoth';

function keptKey(): string {
  return spaceStorageKey(KEPT_BOTH_KEY);
}

/** The profile ids marked "kept both" in this space. */
export function keptBothIds(): string[] {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(keptKey()) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeKept(ids: string[]): void {
  try {
    if (ids.length) globalThis.localStorage?.setItem(keptKey(), JSON.stringify(ids.slice(-50)));
    else globalThis.localStorage?.removeItem(keptKey());
  } catch {
    /* the mark is a convenience */
  }
}

/** A keep-both copy was made: its row carries the mark. */
export function markKeptBoth(id: string): void {
  writeKept([...new Set([...keptBothIds(), id])]);
}

/** The copy was opened or renamed: the mark goes. */
export function clearKeptBoth(id: string): void {
  const ids = keptBothIds();
  if (ids.includes(id)) writeKept(ids.filter((x) => x !== id));
}
