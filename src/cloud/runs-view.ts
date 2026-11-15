// What the views know of runs in the cloud (stage 63 C1, ADR 0153): the
// one module History, the start menu, the "does not fit" dialog, Log out
// and the counts of Statistics, Spotlights and Diary (stage 63 C2) build
// on. Small and with no dependencies but types: the runtime
// (src/cloud/space/runtime.ts, loaded lazily in an account's space with
// the flag `runs` on) patches the view, fires the events and provides the
// fetches; without it everything here answers "off".
//
// API
//
//   runsView(): RunsView               the page's state (below)
//   onRunsView(fn): () => void         called on every change
//
//   sessionCloud(session, rows): SessionCloud
//       a session's cloud state, from `RunLibrary.cloudRows()`; History's
//       list is `RunLibrary.listSessions(now, { remote: true })`
//   storageFigures(lib): Promise<StorageFigures>
//       the storage line's numbers: the device's estimate and the cloud's
//       use and limit (null when not known)
//   cloudOnlySessions(lib): Promise<number>
//       sessions of the account that are only in the cloud (not counted
//       by Statistics, Spotlights and Diary)
//
//   fetchSession(sessionId, onProgress?): Promise<FetchOutcome>
//       fetches a session's cloud-only runs (opening it does this too:
//       `RunLibrary.ensureLocal`); `onProgress(done, total)` in bytes
//   fetchAll(onProgress?): Promise<FetchOutcome>
//       fetches every cloud-only run (Fetch all, desktop)
//
//   onDoesNotFit(fn): () => void       a saved run did not fit (below);
//   takeDoesNotFit(): DoesNotFit | null  the next one not shown yet (an
//                                        event fired before the view was up)
//
// "Does not fit" (`DoesNotFit`): `{runId, sessionId, used, limit, size,
// reason, where}`. `reason` `quota` (the body passed the account's run
// storage), `too_many_items` / `storage_full` (its item did not fit), or
// `tooLarge` (over the 20 MB of one body); `where` the place the save was
// asked (`history`), or `start` after an Exit (the upload waits for the
// game to end). A run moved at Create account fires none: it is counted in
// `notInCloudAfterMove` (one line on the start menu). A run fires once.

import type { AccountLimits, SyncUsage } from '../../shared/cloud/api.ts';
import type { FullReason } from './sync/types';
import type { FetchFailure, RunCloudRow, RunCloudState } from './runs/types';
import type { SaveWhere } from '../runs/cloud-hook';
import type { Session } from '../runs/stitch';

export interface RunsView {
  /** Runs in the cloud work in this page (an account's space with the flag `runs`). */
  on: boolean;
  /** The account's run storage as last heard (bytes), or null. */
  cloud: { used: number; limit: number } | null;
  /** Saved runs moved at Create account that are not in the cloud (full, too large). */
  notInCloudAfterMove: number;
  /** Runs saved here that wait for the upload (queued). */
  queued: number;
}

const OFF: RunsView = { on: false, cloud: null, notInCloudAfterMove: 0, queued: 0 };
let view: RunsView = OFF;
const viewFns = new Set<(v: RunsView) => void>();

export function runsView(): RunsView {
  return view;
}

export function onRunsView(fn: (v: RunsView) => void): () => void {
  viewFns.add(fn);
  return () => void viewFns.delete(fn);
}

/** The runtime's: a part of the view changed. */
export function patchRunsView(patch: Partial<RunsView>): void {
  view = { ...view, ...patch };
  for (const fn of [...viewFns]) {
    try {
      fn(view);
    } catch {
      /* a listener's problem */
    }
  }
}

/** The room of a sync's or an upload's answer as the view's figures. */
export function cloudFigures(usage: SyncUsage | null | undefined, limits: AccountLimits | null | undefined): RunsView['cloud'] {
  if (!usage || !limits || usage.runBytes === undefined) return null;
  return { used: usage.runBytes, limit: limits.runBytes };
}

// ------------------------------------------------------------ a session

/** Where one run is: `local` (here, the cloud has no row for it) or its `runCloud` state. */
export type RunPlace = 'local' | RunCloudState;

/**
 * A session's state in one word, the strongest first: `fetching`,
 * `remote` (some run only in the cloud: opening fetches), `tooLarge`,
 * `full` (some saved run not in the cloud: "not in the cloud"), `queued`
 * (waiting for the upload), `up` (all in the cloud and here), `local`
 * (none in the cloud: a guest, the flag off, an unsaved session).
 */
export type SessionCloudState = 'fetching' | 'remote' | 'tooLarge' | 'full' | 'queued' | 'up' | 'local';

export interface SessionCloud {
  state: SessionCloudState;
  /** Every run of the session, oldest first, and where it is. */
  runs: { runId: string; place: RunPlace }[];
  /** Runs only in the cloud (`remote` or `fetching`). */
  remote: number;
  /** The bytes of its runs' bodies in the cloud (or to fetch). */
  cloudBytes: number;
  /** Only in the cloud: every run is `remote` or `fetching`. */
  cloudOnly: boolean;
}

const STRONGEST: RunCloudState[] = ['fetching', 'remote', 'tooLarge', 'full', 'queued'];

export function sessionCloud(session: Pick<Session, 'runs'>, rows: ReadonlyMap<string, RunCloudRow>): SessionCloud {
  const runs = session.runs.map((m) => ({ runId: m.runId, place: (rows.get(m.runId)?.state ?? 'local') as RunPlace }));
  const places = new Set(runs.map((r) => r.place));
  let remote = 0;
  let cloudBytes = 0;
  for (const r of runs) {
    const row = rows.get(r.runId);
    if (r.place === 'remote' || r.place === 'fetching') remote++;
    if (row && (row.state === 'up' || row.state === 'remote' || row.state === 'fetching')) cloudBytes += row.size;
  }
  const strong = STRONGEST.find((st) => places.has(st));
  const state: SessionCloudState = strong ?? (places.size === 1 && places.has('up') ? 'up' : 'local');
  return { state, runs, remote, cloudBytes, cloudOnly: runs.length > 0 && remote === runs.length };
}

/** What the views read of the run library (`RunLibrary` fits). */
export interface RunsLibraryLike {
  listSessions(nowUs: number, o?: { remote?: boolean }): Promise<Session[]>;
  cloudRows(): Promise<Map<string, RunCloudRow>>;
  estimate(): Promise<{ usage: number; quota: number } | null>;
}

export interface StorageFigures {
  /** The browser's estimate for this site (all of it, not only runs), or null. */
  device: { usage: number; quota: number } | null;
  /** The account's run storage, or null (a guest, the flag off, not heard yet). */
  cloud: { used: number; limit: number } | null;
}

export async function storageFigures(lib: Pick<RunsLibraryLike, 'estimate'>): Promise<StorageFigures> {
  return { device: await lib.estimate().catch(() => null), cloud: view.on ? view.cloud : null };
}

/** Sessions of the account that are only in the cloud (Statistics, Spotlights and Diary do not count them). */
export async function cloudOnlySessions(lib: Pick<RunsLibraryLike, 'listSessions' | 'cloudRows'>, nowUs: number = Date.now() * 1000): Promise<number> {
  const rows = await lib.cloudRows();
  if (rows.size === 0) return 0;
  let n = 0;
  for (const s of await lib.listSessions(nowUs, { remote: true })) if (sessionCloud(s, rows).cloudOnly) n++;
  return n;
}

// ------------------------------------------------------------ fetching

export interface FetchOutcome {
  /** Every run asked for is on this device now. */
  ok: boolean;
  fetched: number;
  failed: number;
  /** The first failure's reason; `unavailable`: no runs in the cloud in this page. */
  why: FetchFailure | 'unavailable' | null;
}

export type FetchProgress = (done: number, total: number) => void;

/** The runtime's fetches. */
export interface RunsFetcher {
  fetchSession(sessionId: string, onProgress?: FetchProgress): Promise<FetchOutcome>;
  fetchAll(onProgress?: FetchProgress): Promise<FetchOutcome>;
}

const UNAVAILABLE: FetchOutcome = { ok: false, fetched: 0, failed: 0, why: 'unavailable' };
let fetcher: RunsFetcher | null = null;

/** The runtime's: the fetches (null when it stops). */
export function setRunsFetcher(f: RunsFetcher | null): void {
  fetcher = f;
}

export function fetchSession(sessionId: string, onProgress?: FetchProgress): Promise<FetchOutcome> {
  return fetcher ? fetcher.fetchSession(sessionId, onProgress) : Promise.resolve(UNAVAILABLE);
}

export function fetchAll(onProgress?: FetchProgress): Promise<FetchOutcome> {
  return fetcher ? fetcher.fetchAll(onProgress) : Promise.resolve(UNAVAILABLE);
}

// ------------------------------------------------------------ does not fit

export interface DoesNotFit {
  runId: string;
  /** The session the run is in (its first run's id). */
  sessionId: string;
  /** The account's run bytes and its limit, as the server said. */
  used: number;
  limit: number;
  /** The run's body. */
  size: number;
  reason: 'quota' | FullReason | 'tooLarge';
  where: SaveWhere;
}

const notFits: DoesNotFit[] = [];
const fitFns = new Set<(e: DoesNotFit) => void>();

/** The runtime's: a saved run did not fit. */
export function emitDoesNotFit(e: DoesNotFit): void {
  notFits.push(e);
  for (const fn of [...fitFns]) {
    try {
      fn(e);
    } catch {
      /* a listener's problem */
    }
  }
}

export function onDoesNotFit(fn: (e: DoesNotFit) => void): () => void {
  fitFns.add(fn);
  return () => void fitFns.delete(fn);
}

/** The next "does not fit" not taken yet (the view that shows it takes it). */
export function takeDoesNotFit(): DoesNotFit | null {
  return notFits.shift() ?? null;
}

/** Tests: forget everything. */
export function resetRunsViewForTests(): void {
  view = OFF;
  viewFns.clear();
  fetcher = null;
  notFits.length = 0;
  fitFns.clear();
}
