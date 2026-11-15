// Runs in the cloud (ADR 0153): the `runCloud` row, and the ports of the
// upload queue and the fetch (queue.ts). Like the sync engine's (ADR 0151),
// the queue is pure and reaches IndexedDB, the body's worker, the network,
// the game, the clock and the Web Lock only through these interfaces.

import type { AccountLimits, RunBodyList, RunBodyWritten, SessionEndReason, SyncUsage } from '../../../shared/cloud/api.ts';
import type { RunMeta } from '../../capture/store';
import type { RunRows } from '../../runs/backup-format';

export type { RunRows } from '../../runs/backup-format';

/**
 * Where a run stands with the cloud (ADR 0153, "Local state"):
 *
 * - `queued`   saved and sealed here, not uploaded yet
 * - `up`       uploaded; the body is in R2 and here
 * - `full`     refused for room (`413 quota`); retried when there is room
 * - `tooLarge` over `runMaxBytes`; never tried again
 * - `remote`   in the account, not on this device (the row holds the item's meta)
 * - `fetching` being fetched (then `up`, or back to `remote`)
 */
export type RunCloudState = 'queued' | 'up' | 'full' | 'tooLarge' | 'remote' | 'fetching';

export const RUN_CLOUD_STATES: readonly RunCloudState[] = ['queued', 'up', 'full', 'tooLarge', 'remote', 'fetching'];

/** One row of the `runCloud` store (database version 10), keyed by `runId`. */
export interface RunCloudRow {
  runId: string;
  state: RunCloudState;
  /** `opaqueId(idKey, "run", runId)`: the item's id and the body's. */
  serverId: string;
  /** The stored body's bytes; 0 while it was never sealed. */
  size: number;
  /** Failed uploads in a row (reset when one goes up). */
  tries: number;
  /** When the row last changed state, ms. */
  at: number;
  /** The run's `startedUs`: the queue goes newest first without reading `runs`. */
  startedUs: number;
  /** `remote` and `fetching`: the item's meta (the run is not in `runs`). */
  meta?: RunMeta;
}

// --- Ports ---

/** The `runCloud` store and what the queue reads of `runs`. */
export interface RunCloudStore {
  list(): Promise<RunCloudRow[]>;
  get(runId: string): Promise<RunCloudRow | undefined>;
  put(row: RunCloudRow): Promise<void>;
  /** The run's rows for its body: null when the run is not on this device (deleted meanwhile). */
  rows(runId: string): Promise<RunRows | null>;
  /**
   * A fetched run, in one transaction: its meta, events and chunks as
   * `restore()` writes them, and `row` (state `up`).
   */
  putFetched(rows: RunRows, row: RunCloudRow): Promise<void>;
}

/** A run's body: sealed and opened in the worker (body-client.ts), the keys bound by the adapter. */
export interface RunBodyPort {
  encode(serverId: string, rows: RunRows): Promise<Blob>;
  /** Rejects with a `RunBodyError` when the body is not this run's, newer, cut, or too large opened. */
  decode(serverId: string, runId: string, body: Blob): Promise<RunRows>;
}

/** The answer to a `PUT /api/u/runs/<id>`. */
export type RunPutResult =
  | { status: 'ok'; written: RunBodyWritten }
  /** `413 quota`: `used` and `limit` are the account's run bytes and its `runBytes`; `size` the refused body's. */
  | { status: 'quota'; used: number; limit: number; size: number }
  /** `413 run_too_large`: over `runMaxBytes`. */
  | { status: 'tooLarge'; limit: number };

/**
 * The run endpoints of shared/cloud/api.ts ("Runs in the cloud"). Like
 * the sync's `Remote`, anything that is not a result throws a
 * `RemoteError` (src/cloud/sync/types.ts); a `GET` of a body that is not
 * there is `RemoteError('refused', {status: 404})`.
 */
export interface RunRemote {
  put(id: string, body: Blob): Promise<RunPutResult>;
  /** The body; `onBytes(n)` as each piece arrives (n = the piece's bytes). `size`: what is expected (for the timeout). */
  get(id: string, o?: { size?: number; onBytes?: (n: number) => void }): Promise<Blob>;
  remove(id: string): Promise<RunBodyWritten>;
  list(): Promise<RunBodyList>;
}

// --- What comes out ---

export type RunQueueEvent =
  /** A body did not fit (`413 quota`): the run stays here as `full`. Once per run. */
  | { type: 'full'; runId: string; used: number; limit: number; size: number }
  /** Over `runMaxBytes`: never uploaded. */
  | { type: 'tooLarge'; runId: string; size: number; limit: number }
  | { type: 'uploaded'; runId: string; size: number };

export interface RunQueueEvents {
  emit(event: RunQueueEvent): void;
}

/** What one `run()` of the queue came to. */
export type RunQueueOutcome =
  /** Nothing left that can go now (`full` rows wait for room). */
  | { type: 'done'; uploaded: number }
  /** A game started: stopped before the next run. */
  | { type: 'playing'; uploaded: number }
  /** No answer, a server error, a refusal: retry at `retryAt` (back-off). */
  | { type: 'offline' | 'server' | 'refused'; retryAt: number; uploaded: number }
  /** The session is gone (`reason` null for `not_logged_in`). */
  | { type: 'session_ended'; reason: SessionEndReason | null; uploaded: number };

/** The room the account has for run bodies, as last heard. */
export interface RunRoom {
  usage: SyncUsage;
  limits: AccountLimits;
}

/** Why a run was not fetched. */
export type FetchFailure = 'offline' | 'server' | 'session_ended' | 'missing' | 'unreadable' | 'newer' | 'not_remote';

export interface FetchResult {
  /** Fetched and written (or already on this device). */
  fetched: string[];
  failed: { runId: string; why: FetchFailure }[];
}
