// The upload queue and the fetch of runs in the cloud (ADR 0153, "The
// upload queue", "Fetching on open"). Pure, like the sync engine (ADR
// 0151): it reaches the `runCloud` store, the body's worker, the network,
// the game, the clock and the Web Lock only through the ports of types.ts.
//
// `run()`, under the lock (`webcockpit-runs@<space id>`, one tab), uploads
// one body at a time:
//
//   - every `queued` row, and every `full` row while the account has room
//     for it (`limits.runBytes − usage.runBytes ≥ size`), newest first; a
//     row refused as an item for its size (`item_too_large`) is never
//     tried again, as `tooLarge`;
//   - never while a game plays: `isPlaying()` is asked before each upload,
//     and the queue stops (an upload in flight finishes);
//   - a body over `runMaxBytes`, or one the room known cannot hold, is
//     settled here without sending it; the server's `413` says the same.
//     The room known is only ever the server's (a sync's `usage` and
//     `limits`, the list's): without it the server decides. A queued row
//     that had a body up before (its `size`) counts only what it grows,
//     as the server does for a replace;
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
// `checkBodies(liveIds)` compares the account's bodies with what this
// device knows (under the lock, so no upload of another tab is half seen):
// orphans go, an own `up` row whose body is gone is queued again.
//
// `fetchRuns(runIds, onProgress)` fetches `remote` rows: per run a GET, the
// body opened in the worker, written in one transaction with its row `up`;
// back to `remote` on any failure. Progress is bytes over the rows' sizes.
// A run this tab is fetching already is waited for, not fetched twice; a
// row found `up` meanwhile (another tab fetched it) counts as fetched.
// `recover()` at load puts back only `fetching` rows older than
// `FETCH_STALE_MS` (another tab's fetch may be going on).

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

/**
 * A `fetching` row this old is left over by a page that closed mid-fetch
 * (`recover`); younger, another tab may be fetching it. Longer than the
 * longest transfer the fetch adapter allows (20 s plus 20 MB at 50 kB/s).
 */
export const FETCH_STALE_MS = 15 * 60_000;

export interface RunQueueOptions {
  store: RunCloudStore;
  body: RunBodyPort;
  remote: RunRemote;
  /** A game plays in this space (here, or the game lock held elsewhere); asked before each upload. */
  isPlaying(): boolean | Promise<boolean>;
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
  private readonly isPlaying: () => boolean | Promise<boolean>;
  private readonly requestSync: () => void;
  private readonly clock: Clock;
  private readonly lock: SyncLock;
  private readonly events: RunQueueEvents;
  private readonly random: () => number;

  private failures = 0;
  private roomNow: RunRoom | null = null;
  private running: Promise<RunQueueOutcome> | null = null;
  private again = false;
  /** The fetches going on in this tab, by run id. */
  private readonly fetching = new Map<string, Promise<FetchFailure | null>>();
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

  /**
   * The room as last heard (a sync's answer or the list's, then an
   * upload's, a delete's, a `quota`), or null: the limits are only ever
   * the server's, never assumed.
   */
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
    // Refused as an item for its size: more room does not help (as `tooLarge`).
    if (row.full === 'item_too_large') return false;
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

  /**
   * Rows left `fetching` by a page that closed mid-fetch go back to
   * `remote` (at load): those older than `FETCH_STALE_MS`, as another tab
   * may be fetching a younger one (a `fetching` row is fetched again when
   * asked for anyway).
   */
  async recover(): Promise<number> {
    let n = 0;
    const now = this.clock.now();
    for (const row of await this.store.list()) {
      if (row.state !== 'fetching' || now - row.at < FETCH_STALE_MS || this.fetching.has(row.runId)) continue;
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
      if (await this.isPlaying()) return { type: 'playing', uploaded };
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
    // A queued row with a size had its body up before (put back after an
    // edit beat a delete, or its body found gone): the server counts only
    // what a replace grows, so the check here does too (and lets the server
    // decide when that body is gone after all).
    const grow = Math.max(size - (row.state === 'queued' ? row.size : 0), 0);
    let res: RunPutResult;
    if (room && size > room.limits.runMaxBytes) res = { status: 'tooLarge', limit: room.limits.runMaxBytes };
    else if (room && room.usage.runBytes !== undefined && grow > 0 && room.usage.runBytes + grow > room.limits.runBytes)
      res = { status: 'quota', used: room.usage.runBytes, limit: room.limits.runBytes, size };
    else res = await this.remote.put(row.serverId, blob);

    const now = this.clock.now();
    const cur = await this.store.get(row.runId);
    if (res.status === 'ok') {
      this.noteUsage(res.written.usage);
      if (!cur || (cur.state !== 'queued' && cur.state !== 'full')) {
        // Deleted (or settled) while it went up: the body is nobody's.
        await this.removeBody(row.serverId);
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
    await this.removeBody(row.serverId);
  }

  /**
   * Deletes a body, best effort: false when the request failed (an orphan
   * check finds what is left). The space deletes a deleted run's body
   * only once a sync has pushed its tombstone and the run did not come
   * back (an edit elsewhere beats the delete, and then the body is still
   * needed).
   */
  async removeBody(serverId: string): Promise<boolean> {
    try {
      this.noteUsage((await this.remote.remove(serverId)).usage);
      return true;
    } catch {
      return false;
    }
  }

  /** An answer's usage, into the room known (nothing while the limits are not known: they are never assumed). */
  private noteUsage(usage: SyncUsage): void {
    if (usage.runBytes === undefined || !this.roomNow) return;
    this.roomNow = { usage: { ...usage }, limits: this.roomNow.limits };
  }

  /** A `quota` answer's numbers, into the room known (as `noteUsage`). */
  private noteRunBytes(used: number, limit: number): void {
    const r = this.roomNow;
    if (r) this.roomNow = { usage: { ...r.usage, runBytes: used }, limits: { ...r.limits, runBytes: limit } };
  }

  /**
   * The bodies against what this device knows (at load, and now and then
   * after a sync; one list request): a body older than a day that neither
   * a live `run` item (`liveIds`, the server ids of the sync records) nor
   * an own `up` row names is deleted (an orphan: a body whose item push
   * never came, a delete made offline); an own `up` row whose body is not
   * there goes back to `queued` (its body was deleted while an edit here
   * brought the run back), so the queue puts it back. Also takes the room
   * from the list's answer. Under the queue's lock: an upload of another
   * tab is never seen half done (its row `up` after the list was made
   * without its body). Throws the `RemoteError` of a failed list.
   */
  checkBodies(liveIds: ReadonlySet<string>): Promise<{ orphans: number; requeued: number }> {
    return this.lock.run(() => this.checkBodiesLocked(liveIds));
  }

  private async checkBodiesLocked(liveIds: ReadonlySet<string>): Promise<{ orphans: number; requeued: number }> {
    const list = await this.remote.list();
    this.setRoom(list.usage, list.limits);
    const there = new Set(list.bodies.map((b) => b.id));
    const keep = new Set(liveIds);
    let requeued = 0;
    for (const row of await this.store.list()) {
      if (row.state !== 'up') continue;
      keep.add(row.serverId);
      if (there.has(row.serverId)) continue;
      await this.store.put({ ...row, state: 'queued', at: this.clock.now() });
      requeued++;
    }
    let orphans = 0;
    for (const id of orphanBodies(list.bodies, keep, this.clock.now())) if (await this.removeBody(id)) orphans++;
    return { orphans, requeued };
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
      const start = done;
      // A fetch of this run going on in this tab (Fetch all, then the open of one of its sessions): its outcome.
      let one = this.fetching.get(row.runId);
      if (!one) {
        one = this.fetchOne(row, (n) => {
          done = Math.min(done + n, start + row.size);
          onProgress?.(done, total);
        }).finally(() => this.fetching.delete(row.runId));
        this.fetching.set(row.runId, one);
      }
      const why = await one;
      done = start + row.size;
      onProgress?.(done, total);
      if (why === null) {
        fetched.push(row.runId);
        continue;
      }
      failed.push({ runId: row.runId, why });
      if (why === 'offline' || why === 'server' || why === 'session_ended') {
        for (const rest of todo.slice(i + 1)) failed.push({ runId: rest.runId, why });
        break;
      }
    }
    return { fetched, failed };
  }

  /** One run's fetch: null when it is here now; else why not (its row back to `remote`). Rethrows a local fault. */
  private async fetchOne(row: RunCloudRow, onBytes: (n: number) => void): Promise<FetchFailure | null> {
    await this.store.put({ ...row, state: 'fetching', at: this.clock.now() });
    let why: FetchFailure | null = null;
    try {
      const blob = await this.remote.get(row.serverId, { size: row.size, onBytes });
      const rows = await this.body.decode(row.serverId, row.runId, blob);
      const cur = await this.store.get(row.runId);
      if (!cur) {
        // Deleted meanwhile (a tombstone pulled).
        why = 'not_remote';
      } else if (cur.state === 'remote' || cur.state === 'fetching') {
        // The item's meta wins: a rating changed after the body went up is in it.
        const meta = cur.meta && cur.meta.runId === row.runId ? cur.meta : rows.meta;
        const { meta: _m, full: _f, ...rest } = cur;
        await this.store.putFetched({ ...rows, meta }, { ...rest, state: 'up', size: blob.size, tries: 0, at: this.clock.now() });
      }
      // Any other state: the run is here already (another tab fetched it, a restore): fetched.
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
    if (why !== null) await this.backToRemote(row.runId);
    return why;
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
