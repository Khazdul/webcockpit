// The upload queue and the fetch of runs in the cloud (ADR 0153, "The
// upload queue", "Fetching on open"). Pure, like the sync engine (ADR
// 0151): it reaches the `runCloud` store, the body's worker, the network,
// the game, the clock and the Web Lock only through the ports of types.ts.
//
// `run()`, under the lock (`webcockpit-runs@<space id>`, one tab), uploads
// one body at a time:
//
//   - every `queued` row, and every `full` row while the account has room
//     for it (`limits.runBytes − usage.runBytes ≥ size`), newest first;
//   - never while a game plays: `isPlaying()` is asked before each run, and
//     the queue stops (an upload in flight finishes);
//   - a body over `runMaxBytes`, or one the room known cannot hold, is
//     settled here without sending it; the server's `413` says the same;
//   - after a body is up, the row is `up` with its size and the queue asks
//     for a sync (`requestSync`), which pushes the `run` item;
//   - errors as the engine's table: offline, `5xx`, a refusal back off
//     (`backoffMs`); `401` ends the run as a lost session; `413 quota`
//     makes the row `full` and reports the numbers once (`full` event);
//     `413 run_too_large` makes it `tooLarge`.
//
// When the `run` item's push is then refused for room (`413
// too_many_items` / `storage_full`, ADR 0153 addendum), the space calls
// `itemRefused`: the row goes `full` with the same event, and the stored
// body is deleted at once rather than left as an orphan.
//
// `fetchRuns(runIds, onProgress)` fetches `remote` rows: per run a GET, the
// body opened in the worker, written in one transaction with its row `up`;
// back to `remote` on any failure. Progress is bytes over the rows' sizes.

import { type AccountLimits, DEFAULT_ACCOUNT_LIMITS, type RunBodyList, type SyncUsage } from '../../../shared/cloud/api.ts';
import { noLock } from '../sync/lock';
import { backoffMs } from '../sync/status';
import { type Clock, type FullReason, RemoteError, type SyncLock } from '../sync/types';
import { isRunBodyError } from './body';
import type {
  FetchFailure,
  FetchResult,
  RunBodyPort,
  RunCloudRow,
  RunCloudStore,
  RunPutResult,
  RunQueueEvent,
  RunQueueEvents,
  RunQueueOutcome,
  RunRemote,
  RunRoom,
} from './types';

/** The Web Lock of the queue in a space (one tab uploads). */
export const runsLockName = (spaceId: string): string => `webcockpit-runs@${spaceId}`;

/** A body is dropped as an orphan once it is this old with no live item naming it (ms). */
export const ORPHAN_AGE_MS = 24 * 3600_000;

/** About what a `run` item takes of the item storage (its meta; the measurement says under 2 KB). */
const RUN_ITEM_BYTES = 2048;

export interface RunQueueOptions {
  store: RunCloudStore;
  body: RunBodyPort;
  remote: RunRemote;
  /** A game plays in this space (here, or the game lock held elsewhere). */
  isPlaying(): boolean;
  /** Asked after a body is up: the sync pushes its item. */
  requestSync(): void;
  clock?: Clock;
  /** `noLock` by default; the page passes the Web Lock `runsLockName(space)`. */
  lock?: SyncLock;
  events?: RunQueueEvents;
  /** For the back-off's jitter. */
  random?: () => number;
}

/** `(done, total)` bytes of a fetch. */
export type FetchProgress = (done: number, total: number) => void;

export class RunQueue {
  private readonly store: RunCloudStore;
  private readonly body: RunBodyPort;
  private readonly remote: RunRemote;
  private readonly isPlaying: () => boolean;
  private readonly requestSync: () => void;
  private readonly clock: Clock;
  private readonly lock: SyncLock;
  private readonly events: RunQueueEvents;
  private readonly random: () => number;

  private failures = 0;
  private roomNow: RunRoom | null = null;
  private running: Promise<RunQueueOutcome> | null = null;
  private again = false;
  /** When the queue wants to be run again after a failure, or null. */
  retryAt: number | null = null;

  constructor(o: RunQueueOptions) {
    this.store = o.store;
    this.body = o.body;
    this.remote = o.remote;
    this.isPlaying = o.isPlaying;
    this.requestSync = o.requestSync;
    this.clock = o.clock ?? { now: () => Date.now() };
    this.lock = o.lock ?? noLock;
    this.events = o.events ?? { emit: () => {} };
    this.random = o.random ?? Math.random;
  }

  /** The room as last heard (a sync's answer, an upload's, a `quota`), or null. */
  get room(): RunRoom | null {
    return this.roomNow;
  }

  /**
   * What the account has (the sync's `usage` and `limits` after a sync, or
   * the list's). `usage.runBytes` absent (a Worker before stage 63): the
   * room is not known, and `full` rows wait.
   */
  setRoom(usage: SyncUsage, limits: AccountLimits): void {
    this.roomNow = usage.runBytes === undefined ? null : { usage: { ...usage }, limits: { ...limits } };
  }

  /** Whether the room known holds `row` (a `full` row is retried only then). */
  fits(row: RunCloudRow): boolean {
    const r = this.roomNow;
    if (!r || r.usage.runBytes === undefined) return false;
    if (r.limits.runBytes - r.usage.runBytes < row.size) return false;
    if (row.full && row.full !== 'quota') {
      // Refused as an item: room for one more item too.
      if (r.usage.items + 1 > r.limits.items || r.usage.itemBytes + RUN_ITEM_BYTES > r.limits.itemBytes) return false;
    }
    return true;
  }

  /**
   * Uploads what can go now. A call while a run goes on in this tab makes
   * it run once more when it ends, and answers with that outcome. Rejects
   * only on a fault of a local port or of the body's worker.
   */
  run(): Promise<RunQueueOutcome> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    const go = async (): Promise<RunQueueOutcome> => {
      let out: RunQueueOutcome;
      let uploaded = 0;
      do {
        this.again = false;
        out = await this.lock.run(() => this.runLocked());
        uploaded += out.uploaded;
      } while (this.again && out.type === 'done');
      return { ...out, uploaded };
    };
    this.running = go().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Rows left `fetching` by a page that closed mid-fetch go back to `remote` (at load). */
  async recover(): Promise<number> {
    let n = 0;
    for (const row of await this.store.list()) {
      if (row.state !== 'fetching') continue;
      await this.store.put({ ...row, state: 'remote', at: this.clock.now() });
      n++;
    }
    return n;
  }

  private emit(e: RunQueueEvent): void {
    this.events.emit(e);
  }

  private backOff(): number {
    this.failures++;
    const at = this.clock.now() + backoffMs(this.failures, this.random);
    this.retryAt = at;
    return at;
  }

  private async runLocked(): Promise<RunQueueOutcome> {
    let uploaded = 0;
    // A row is tried once per run (a `full` one refused again waits for the next).
    const tried = new Set<string>();
    for (;;) {
      const rows = await this.store.list();
      const next = rows
        .filter((r) => !tried.has(r.runId) && (r.state === 'queued' || (r.state === 'full' && this.fits(r))))
        .sort((a, b) => b.startedUs - a.startedUs || (a.runId < b.runId ? -1 : 1))[0];
      if (!next) {
        this.failures = 0;
        this.retryAt = null;
        return { type: 'done', uploaded };
      }
      if (this.isPlaying()) return { type: 'playing', uploaded };
      tried.add(next.runId);
      try {
        if (await this.upload(next)) uploaded++;
      } catch (e) {
        if (!(e instanceof RemoteError)) throw e;
        if (e.kind === 'session_ended' || e.kind === 'not_logged_in') {
          this.retryAt = null;
          return { type: 'session_ended', reason: e.reason, uploaded };
        }
        const cur = await this.store.get(next.runId);
        if (cur && (cur.state === 'queued' || cur.state === 'full')) await this.store.put({ ...cur, tries: cur.tries + 1 });
        return { type: e.kind, retryAt: this.backOff(), uploaded };
      }
    }
  }

  /** One run: true when its body went up. Throws the `RemoteError` of a failed request. */
  private async upload(row: RunCloudRow): Promise<boolean> {
    const rows = await this.store.rows(row.runId);
    if (!rows) {
      // Not on this device any more (deleted meanwhile): nothing to upload.
      await this.store.remove(row.runId);
      return false;
    }
    const blob = await this.body.encode(row.serverId, rows);
    const size = blob.size;
    const room = this.roomNow;
    let res: RunPutResult;
    if (room && size > room.limits.runMaxBytes) res = { status: 'tooLarge', limit: room.limits.runMaxBytes };
    else if (room && room.usage.runBytes !== undefined && room.usage.runBytes + size > room.limits.runBytes)
      res = { status: 'quota', used: room.usage.runBytes, limit: room.limits.runBytes, size };
    else res = await this.remote.put(row.serverId, blob);

    const now = this.clock.now();
    const cur = await this.store.get(row.runId);
    if (res.status === 'ok') {
      this.noteUsage(res.written.usage);
      if (!cur || (cur.state !== 'queued' && cur.state !== 'full')) {
        // Deleted (or settled) while it went up: the body is nobody's.
        await this.dropBody(row.serverId);
        return false;
      }
      const { full: _f, ...rest } = cur;
      await this.store.put({ ...rest, state: 'up', size, tries: 0, at: now });
      this.emit({ type: 'uploaded', runId: row.runId, size });
      this.requestSync();
      return true;
    }
    if (!cur) return false;
    if (res.status === 'quota') {
      this.noteRunBytes(res.used, res.limit);
      if (cur.state !== 'full') this.emit({ type: 'full', runId: row.runId, used: res.used, limit: res.limit, size: res.size, reason: 'quota' });
      await this.store.put({ ...cur, state: 'full', full: 'quota', size, at: cur.state === 'full' ? cur.at : now });
      return false;
    }
    this.emit({ type: 'tooLarge', runId: row.runId, size, limit: res.limit });
    await this.store.put({ ...cur, state: 'tooLarge', size, at: now });
    return false;
  }

  /**
   * The `run` item of an uploaded run was refused for room (`413
   * too_many_items` or `storage_full`), and it was new (never in the
   * account: the space checks its sync record). The row goes `full` (the
   * same event as `quota`), and the body already stored is deleted.
   */
  async itemRefused(runId: string, error: FullReason): Promise<void> {
    const row = await this.store.get(runId);
    if (!row || row.state !== 'up') return;
    const r = this.roomNow;
    await this.store.put({ ...row, state: 'full', full: error, at: this.clock.now() });
    this.emit({
      type: 'full',
      runId,
      used: r?.usage.runBytes ?? 0,
      limit: r?.limits.runBytes ?? DEFAULT_ACCOUNT_LIMITS.runBytes,
      size: row.size,
      reason: error,
    });
    await this.dropBody(row.serverId);
  }

  /** Deletes a body, best effort (an orphan check finds what is left). */
  private async dropBody(serverId: string): Promise<void> {
    try {
      this.noteUsage((await this.remote.remove(serverId)).usage);
    } catch {
      /* left for the orphan check */
    }
  }

  private noteUsage(usage: SyncUsage): void {
    if (usage.runBytes === undefined) return;
    const limits = this.roomNow?.limits ?? DEFAULT_ACCOUNT_LIMITS;
    this.roomNow = { usage: { ...usage }, limits };
  }

  private noteRunBytes(used: number, limit: number): void {
    const r = this.roomNow;
    this.roomNow = r
      ? { usage: { ...r.usage, runBytes: used }, limits: { ...r.limits, runBytes: limit } }
      : { usage: { items: 0, itemBytes: 0, runBytes: used }, limits: { ...DEFAULT_ACCOUNT_LIMITS, runBytes: limit } };
  }

  /**
   * Fetches runs of the account that are not on this device (`remote`
   * rows), one after the other. A run already here counts as fetched; a
   * failure leaves its row `remote`. Offline, a server error or a lost
   * session stops the rest (they fail with the same reason). Progress:
   * `(bytes so far, the rows' sizes together)`.
   */
  async fetchRuns(runIds: readonly string[], onProgress?: FetchProgress): Promise<FetchResult> {
    const fetched: string[] = [];
    const failed: FetchResult['failed'] = [];
    const todo: RunCloudRow[] = [];
    for (const id of runIds) {
      const row = await this.store.get(id);
      if (!row) failed.push({ runId: id, why: 'not_remote' });
      else if (row.state === 'remote' || row.state === 'fetching') todo.push(row);
      else fetched.push(id);
    }
    const total = todo.reduce((n, r) => n + r.size, 0);
    let done = 0;
    onProgress?.(0, total);
    for (let i = 0; i < todo.length; i++) {
      const row = todo[i]!;
      await this.store.put({ ...row, state: 'fetching', at: this.clock.now() });
      const start = done;
      let why: FetchFailure | null = null;
      try {
        const blob = await this.remote.get(row.serverId, {
          size: row.size,
          onBytes: (n) => {
            done = Math.min(done + n, start + row.size);
            onProgress?.(done, total);
          },
        });
        const rows = await this.body.decode(row.serverId, row.runId, blob);
        const cur = await this.store.get(row.runId);
        if (!cur || cur.state !== 'fetching') {
          // Deleted meanwhile (a tombstone pulled).
          why = 'not_remote';
        } else {
          // The item's meta wins: a rating changed after the body went up is in it.
          const meta = cur.meta && cur.meta.runId === row.runId ? cur.meta : rows.meta;
          const { meta: _m, full: _f, ...rest } = cur;
          await this.store.putFetched({ ...rows, meta }, { ...rest, state: 'up', size: blob.size, tries: 0, at: this.clock.now() });
          fetched.push(row.runId);
        }
      } catch (e) {
        if (e instanceof RemoteError) {
          why = e.kind === 'offline' ? 'offline' : e.kind === 'server' ? 'server' : e.kind === 'refused' ? (e.status === 404 ? 'missing' : 'server') : 'session_ended';
        } else if (isRunBodyError(e)) {
          why = e.code === 'newer' ? 'newer' : 'unreadable';
        } else {
          await this.backToRemote(row.runId);
          throw e;
        }
      }
      done = start + row.size;
      onProgress?.(done, total);
      if (why === null) continue;
      failed.push({ runId: row.runId, why });
      await this.backToRemote(row.runId);
      if (why === 'offline' || why === 'server' || why === 'session_ended') {
        for (const rest of todo.slice(i + 1)) failed.push({ runId: rest.runId, why });
        break;
      }
    }
    return { fetched, failed };
  }

  private async backToRemote(runId: string): Promise<void> {
    const cur = await this.store.get(runId);
    if (cur && cur.state === 'fetching') await this.store.put({ ...cur, state: 'remote', at: this.clock.now() });
  }
}

/**
 * The bodies to delete as orphans: older than `ORPHAN_AGE_MS` and named by
 * nothing in `keep` (the server ids of the live `run` items, and of this
 * device's own `up` rows whose item may not be pushed yet).
 */
export function orphanBodies(bodies: RunBodyList['bodies'], keep: ReadonlySet<string>, now: number, minAgeMs = ORPHAN_AGE_MS): string[] {
  return bodies.filter((b) => !keep.has(b.id) && now - b.created > minAgeMs).map((b) => b.id);
}
