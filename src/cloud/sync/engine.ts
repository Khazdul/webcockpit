// The sync engine (spec §7.4 steps 1–7, ADR 0146, ADR 0151). Pure: it
// reaches the local stores, the server, the clock, the game and the Web
// Lock only through the ports of types.ts.
//
// One sync, under the lock, is up to three rounds of
//
//   pull     `changes?since=<cursor>` page by page; every item newer than
//            what the `sync` store knows is decrypted and kept in its
//            record as `remote`; the cursor is stored after each page.
//   scan     every local item is hashed and matched with its record by
//            server id: new (no record), edited (hash differs), deleted
//            (a record, no item).
//   resolve  per item: take the remote version, keep the local one, an
//            edit beats a delete, keep both (profile, script), last
//            writer, or merge (comm, ADR 0152); an item in use during
//            play is left alone (`held`).
//   names    two items may not share a name: a pulled one keeps it, a
//            local new or renamed one gets `_2`.
//   apply    one batch per kind to the local stores, then the records.
//   push     every item whose planned body differs from the server
//            version it is based on, with that version's rev; a `409`
//            keeps the current item as `remote` and makes another round.
//
// Every write is ordered so that a sync cut off anywhere loses nothing and
// duplicates nothing: the local batch before the records, the records
// before the pushes, and a keep-both copy's key made from what it copies.
//
// The engine yields to the game (a macrotask) between kinds and between
// pushes (ADR 0152), so a sync during play never holds the page for long.

import type { AccountLimits, SyncItem, SyncKind, SyncUsage } from '../../../shared/cloud/api.ts';
import { ItemCodec } from './codec';
import { ITEM_SPECS, type KindSpec, copyKey, freeName, itemHashes, keepBothName } from './items';
import { noLock } from './lock';
import { listUnsynced } from './unsynced';
import { INITIAL_STATUS, Observable, backoffMs } from './status';
import {
  type Body,
  type Clock,
  type EventSink,
  type InUse,
  type LocalItems,
  type Remote,
  type RemoteVersion,
  type SyncEvent,
  type SyncKeys,
  type SyncLock,
  type SyncMeta,
  type SyncOutcome,
  type SyncRecord,
  type SyncRecords,
  type SyncStatus,
  type Unsynced,
  RemoteError,
} from './types';

export interface SyncEngineOptions {
  local: LocalItems;
  records: SyncRecords;
  remote: Remote;
  keys: SyncKeys;
  clock?: Clock;
  /** Nothing in use by default. */
  inUse?: InUse;
  events?: EventSink;
  /** `noLock` by default; the page passes `webSyncLock()`. */
  lock?: SyncLock;
  /**
   * The kinds to sync, in order. Default: profile, script (the kinds the
   * space's adapters store so far); `SYNC_SPECS` is every kind.
   */
  specs?: readonly KindSpec[];
  /** `limit` of a pull (default: the server's, 500). */
  pageSize?: number;
  /** Rounds of 409 before backing off (default 3). */
  maxRounds?: number;
  /** For the back-off's jitter. */
  random?: () => number;
  /** Lets the page run between kinds and between pushes. Default: `setTimeout(0)`. */
  yieldToGame?: () => Promise<void>;
}

/** A macrotask's pause: the game's frames and keys run before the sync goes on. */
export const yieldMacrotask = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** The server version a local copy is (or will be) based on. */
interface Base {
  rev: number;
  hash: string | null;
  bare: string | null;
  deleted: boolean;
  name: string | null;
}

/** One item in a round: its local copy, its record and what is decided. */
interface Entry {
  spec: KindSpec;
  sid: string;
  key: string | null;
  local: { body: Body; hash: string; bare: string } | null;
  rec: SyncRecord | null;
  /** Left alone this round: in use (`held`) or unreadable (`newer`, `unreadable`). */
  fixed: boolean;
  /** In use by a game: never written, never renamed by the names pass. */
  used: boolean;
  /** The planned local record; null = absent. */
  target: Body | null;
  targetHash: string | null;
  targetBare: string | null;
  /** The server version the local copy is based on once the round's local batch is written. */
  base: Base;
  /** A keep-both copy made this round, and the item it was copied from. */
  copyOf?: Entry;
  /** The name before the names pass (for its event). */
  renamedFrom?: string;
  restored?: boolean;
  /** Held because it is in use (its record is marked `waited`). */
  waits?: boolean;
  /** Its local body cannot be encoded (not JSON): left alone this round, record and all. */
  skipped?: boolean;
}

const NO_BASE: Base = { rev: 0, hash: null, bare: null, deleted: false, name: null };
const recId = (kind: SyncKind, serverId: string): string => `${kind}\n${serverId}`;

export class SyncEngine {
  /** The state for the UI. */
  readonly status = new Observable<SyncStatus>({ ...INITIAL_STATUS });

  private readonly local: LocalItems;
  private readonly records: SyncRecords;
  private readonly remote: Remote;
  private readonly codec: ItemCodec;
  private readonly clock: Clock;
  private readonly inUse: InUse;
  private readonly events: EventSink;
  private readonly lock: SyncLock;
  private readonly specs: readonly KindSpec[];
  private readonly specByKind: Map<SyncKind, KindSpec>;
  private readonly pageSize: number | undefined;
  private readonly maxRounds: number;
  private readonly random: () => number;
  private readonly yieldToGame: () => Promise<void>;

  private failures = 0;
  private usage: SyncUsage | null = null;
  private limits: AccountLimits | null = null;
  private running: Promise<SyncOutcome> | null = null;
  private again = false;

  constructor(o: SyncEngineOptions) {
    this.local = o.local;
    this.records = o.records;
    this.remote = o.remote;
    this.codec = new ItemCodec(o.keys);
    this.clock = o.clock ?? { now: () => Date.now() };
    this.inUse = o.inUse ?? { keys: () => new Set() };
    this.events = o.events ?? { emit: () => {} };
    this.lock = o.lock ?? noLock;
    this.specs = o.specs ?? [ITEM_SPECS.profile, ITEM_SPECS.script];
    this.specByKind = new Map(this.specs.map((s) => [s.kind, s]));
    this.pageSize = o.pageSize;
    this.maxRounds = o.maxRounds ?? 3;
    this.random = o.random ?? Math.random;
    this.yieldToGame = o.yieldToGame ?? yieldMacrotask;
  }

  /**
   * Syncs. A call while a sync runs in this tab makes that sync run once
   * more when it ends (a change made meanwhile is not missed) and answers
   * with the last run's outcome. Rejects only on a fault of a local port.
   */
  sync(): Promise<SyncOutcome> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    const run = async (): Promise<SyncOutcome> => {
      let out: SyncOutcome;
      do {
        this.again = false;
        out = await this.lock.run(() => this.syncLocked());
      } while (this.again && out.type === 'synced');
      return out;
    };
    this.running = run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /**
   * The local changes not in the account, from the stores alone (no
   * network): what Log out lists and what decides a locked copy.
   */
  async unsynced(): Promise<Unsynced[]> {
    return listUnsynced(this.specs, this.local, await this.records.list(), {
      item: (spec, key) => this.codec.serverId(spec.kind, key),
      record: (rec) => rec.serverId,
    });
  }

  // --- One sync ---

  private async syncLocked(): Promise<SyncOutcome> {
    this.setStatus({ state: 'syncing' });
    try {
      const meta = await this.records.meta();
      for (let round = 1; round <= this.maxRounds; round++) {
        await this.pull(meta);
        const r = await this.round(meta);
        if (r.conflicts === 0) {
          this.failures = 0;
          const now = this.clock.now();
          await this.records.setMeta({ lastSynced: now });
          this.setStatus({
            state: r.full ? 'full' : r.newer ? 'update' : 'synced',
            waiting: r.waiting,
            held: r.held,
            lastSynced: now,
            retryAt: null,
            full: r.full,
          });
          return { type: 'synced' };
        }
        if (round === this.maxRounds) {
          const retryAt = this.retryAt();
          this.setStatus({ state: 'syncing', waiting: r.waiting, held: r.held, retryAt });
          return { type: 'busy', retryAt };
        }
      }
      throw new Error('unreachable');
    } catch (e) {
      if (!(e instanceof RemoteError)) {
        this.setStatus({ state: 'offline', retryAt: this.retryAt() });
        throw e;
      }
      if (e.kind === 'session_ended' || e.kind === 'not_logged_in') {
        this.setStatus({ state: 'offline', retryAt: null });
        return { type: 'session_ended', reason: e.reason };
      }
      const retryAt = this.retryAt();
      this.setStatus({ state: 'offline', retryAt });
      return { type: e.kind, retryAt };
    }
  }

  private retryAt(): number {
    this.failures++;
    return this.clock.now() + backoffMs(this.failures, this.random);
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    this.status.set({ ...this.status.get(), usage: this.usage, limits: this.limits, ...patch });
  }

  // --- Pull (steps 2 and 7) ---

  private async pull(meta: SyncMeta): Promise<void> {
    const recs = new Map<string, SyncRecord>();
    for (const r of await this.records.list()) recs.set(recId(r.kind, r.serverId), r);

    // Versions left unread before: a newer client of this page may read them now.
    const retried: SyncRecord[] = [];
    for (const rec of recs.values()) {
      if ((rec.state !== 'newer' && rec.state !== 'unreadable') || !rec.remote?.blob) continue;
      const spec = this.specByKind.get(rec.kind);
      if (!spec) continue;
      const d = await this.codec.open(spec, rec.serverId, rec.remote.blob);
      if (!d.ok) continue;
      const next: SyncRecord = {
        ...rec,
        key: spec.key(d.body),
        state: 'held',
        remote: { rev: rec.remote.rev, deleted: false, body: d.body, ...(await itemHashes(spec, d.body)) },
      };
      recs.set(recId(rec.kind, rec.serverId), next);
      retried.push(next);
    }
    if (retried.length) await this.records.write({ put: retried, remove: [] });

    let since = meta.cursor;
    for (;;) {
      const ch = await this.remote.changes(since, this.pageSize);
      const put: SyncRecord[] = [];
      for (const item of ch.items) {
        const rec = await this.take(item, recs.get(recId(item.kind, item.id)) ?? null);
        if (rec) {
          recs.set(recId(rec.kind, rec.serverId), rec);
          put.push(rec);
        }
      }
      if (put.length) await this.records.write({ put, remove: [] });
      this.usage = ch.usage;
      this.limits = ch.limits;
      if (ch.cursor !== since) {
        if (ch.cursor < since) throw new RemoteError('refused', { message: 'the cursor went back' });
        since = ch.cursor;
        await this.records.setMeta({ cursor: since });
        meta.cursor = since;
      }
      if (!ch.more) break;
      if (ch.items.length === 0) throw new RemoteError('refused', { message: '`more` without items' });
    }
  }

  /** The record after pulling `item`, or null when nothing changes (an echo of this device's own write, an old version). */
  private async take(item: SyncItem, rec: SyncRecord | null, force = false): Promise<SyncRecord | null> {
    const known = Math.max(rec?.rev ?? 0, rec?.remote?.rev ?? 0);
    if (!force && item.rev <= known) return null;
    if (item.deleted && !rec) return null;
    const { remote, state } = await this.readRemote(item);
    const key = remote.body ? this.specByKind.get(item.kind)!.key(remote.body) : (rec?.key ?? null);
    if (state !== 'held') this.events.emit({ type: state, kind: item.kind, serverId: item.id });
    const base = rec ?? { kind: item.kind, serverId: item.id, key, name: null, rev: 0, hash: null, bare: null, state };
    return { ...base, key, state, remote };
  }

  /** A pulled item as a remote version: readable (`held`), or kept as its blob. A kind this client has no format for is `newer`. */
  private async readRemote(item: SyncItem): Promise<{ remote: RemoteVersion; state: 'held' | 'newer' | 'unreadable' }> {
    if (item.deleted) return { remote: { rev: item.rev, deleted: true }, state: 'held' };
    const spec = this.specByKind.get(item.kind);
    const blob = item.blob ?? '';
    if (!spec) return { remote: { rev: item.rev, deleted: false, blob }, state: 'newer' };
    const d = await this.codec.open(spec, item.id, blob);
    if (!d.ok) return { remote: { rev: item.rev, deleted: false, blob }, state: d.why };
    return { remote: { rev: item.rev, deleted: false, body: d.body, ...(await itemHashes(spec, d.body)) }, state: 'held' };
  }

  // --- A round (steps 3–6) ---

  private async round(meta: SyncMeta): Promise<{ conflicts: number; waiting: number; held: number; full: SyncRecord['full'] | null; newer: boolean }> {
    const recs = await this.records.list();
    const result = { conflicts: 0, waiting: 0, held: 0, full: null as SyncRecord['full'] | null, newer: false };
    for (const [i, spec] of this.specs.entries()) {
      if (i > 0) await this.yieldToGame();
      const r = await this.roundKind(spec, meta, recs.filter((x) => x.kind === spec.kind));
      result.conflicts += r.conflicts;
      result.waiting += r.waiting;
      result.held += r.held;
      result.full ??= r.full;
      result.newer ||= r.newer;
    }
    return result;
  }

  private async roundKind(spec: KindSpec, meta: SyncMeta, recs: SyncRecord[]) {
    const kind = spec.kind;
    const inUse = await this.inUse.keys(kind);
    const entries = new Map<string, Entry>();
    for (const li of await this.local.list(kind, { scan: true })) {
      const sid = await this.codec.serverId(kind, li.key);
      let hashes: { hash: string; bare: string };
      try {
        hashes = await itemHashes(spec, li.body);
      } catch {
        // A body that is not JSON (a number that is not finite …): this item is left alone, the rest goes on.
        const e = this.entry(spec, sid, li.key, null, null);
        e.fixed = e.skipped = true;
        entries.set(sid, e);
        this.events.emit({ type: 'unencodable', kind, key: li.key });
        continue;
      }
      entries.set(sid, this.entry(spec, sid, li.key, { body: li.body, ...hashes }, null));
    }
    for (const rec of recs) {
      const e = entries.get(rec.serverId);
      if (e) e.rec = rec;
      else entries.set(rec.serverId, this.entry(spec, rec.serverId, rec.key, null, rec));
    }

    // Resolve.
    const copies: Entry[] = [];
    for (const e of [...entries.values()]) {
      if (e.skipped) continue;
      // (Also an item that is not listed: an untouched seed in use is not replaced during play.)
      e.used = e.key !== null && inUse.has(e.key);
      const copy = await this.decide(e, e.used, meta);
      if (copy && !entries.has(copy.sid)) {
        entries.set(copy.sid, copy);
        copies.push(copy);
      }
    }
    for (const e of entries.values()) await this.hashTarget(e);
    if (spec.names) await this.uniqueNames(spec, [...entries.values()]);

    // Apply: the local batch, then the records.
    const put: Body[] = [];
    const remove: string[] = [];
    const waited: string[] = [];
    for (const e of entries.values()) {
      if (e.fixed) continue;
      if (e.target && e.targetHash !== e.local?.hash) {
        put.push(e.target);
        if (e.rec?.waited && e.key !== null) waited.push(e.key);
      } else if (!e.target && e.local) remove.push(e.key!);
    }
    if (put.length || remove.length) await this.local.write(kind, { put, remove, ...(waited.length ? { held: waited } : {}) });
    const recPut: SyncRecord[] = [];
    const recRemove: { kind: SyncKind; serverId: string }[] = [];
    for (const e of entries.values()) {
      if (e.fixed) {
        // Held for a game: its write, when it comes, says it waited.
        if (e.waits && e.rec && !e.rec.waited) recPut.push((e.rec = { ...e.rec, waited: true }));
        continue;
      }
      const next = this.recordAt(e);
      if (next) recPut.push(next);
      else if (e.rec) recRemove.push({ kind, serverId: e.sid });
      e.rec = next;
    }
    if (recPut.length || recRemove.length) await this.records.write({ put: recPut, remove: recRemove });
    for (const e of entries.values()) this.announce(e);

    // Push.
    let conflicts = 0;
    const pushed: SyncRecord[] = [];
    const dropped: { kind: SyncKind; serverId: string }[] = [];
    try {
      let first = true;
      for (const e of entries.values()) {
        if (e.fixed) continue;
        if (!first) await this.yieldToGame();
        const r = await this.push(e);
        if (r !== 'none') first = false;
        if (r === 'conflict') conflicts++;
        if (r !== 'none') {
          if (e.rec) pushed.push(e.rec);
          else dropped.push({ kind, serverId: e.sid });
        }
      }
    } finally {
      if (pushed.length || dropped.length) await this.records.write({ put: pushed, remove: dropped });
    }

    let waiting = 0;
    let held = 0;
    let full: SyncRecord['full'] | null = null;
    let newer = false;
    for (const e of entries.values()) {
      if (e.skipped) {
        waiting++;
        continue;
      }
      if (e.rec?.state === 'full') full ??= e.rec.full ?? 'storage_full';
      if (e.rec?.state === 'newer') newer = true;
      if (e.fixed && e.rec?.state === 'held') held++;
      const localHash = e.fixed ? (e.local?.hash ?? null) : e.targetHash;
      const rec = e.rec;
      const unsynced = localHash !== null ? !rec || rec.rev === 0 || rec.hash !== localHash : !!rec && rec.rev > 0 && rec.hash !== null;
      if (unsynced) waiting++;
    }
    return { conflicts, waiting, held, full, newer };
  }

  private async hashTarget(e: Entry): Promise<void> {
    const h = e.target ? await itemHashes(e.spec, e.target) : null;
    e.targetHash = h?.hash ?? null;
    e.targetBare = h?.bare ?? null;
  }

  private entry(spec: KindSpec, sid: string, key: string | null, local: Entry['local'], rec: SyncRecord | null): Entry {
    return { spec, sid, key, local, rec, fixed: false, used: false, target: local?.body ?? null, targetHash: null, targetBare: null, base: NO_BASE };
  }

  /** Step 4 for one item. Returns a keep-both copy to add. */
  private async decide(e: Entry, used: boolean, meta: SyncMeta): Promise<Entry | null> {
    const { rec, local: L, spec } = e;
    const R = rec?.remote;
    e.target = L?.body ?? null;
    e.base = rec ? { rev: rec.rev, hash: rec.hash, bare: rec.bare, deleted: false, name: rec.name } : NO_BASE;
    if (rec && (rec.state === 'newer' || rec.state === 'unreadable')) {
      e.fixed = true;
      return null;
    }
    if (!R) return null;
    const recBase = e.base;
    const names = spec.names;
    const theirs: Base = { rev: R.rev, hash: R.hash ?? null, bare: R.bare ?? null, deleted: R.deleted, name: R.body && names ? names.get(R.body) : null };
    const dirty = L !== null && L.hash !== (rec?.hash ?? null);
    // An edit changes more than the name. A player's rename moves the
    // times too (the stores set `modified`/`updated`); a rename of the
    // names pass does not, so it never counts as an edit: it gives way to
    // a pulled edit or delete instead of making a copy or a revival.
    const sameBare = (bare: string | null | undefined): boolean => rec?.bare != null && bare === rec.bare;
    const edited = dirty && !sameBare(L!.bare);
    const theirEdit = !R.deleted && !sameBare(R.bare);
    const take = (target: Body | null): null => {
      e.target = target;
      e.base = theirs;
      return null;
    };
    const decided = ((): 'copy' | null => {
      if (R.deleted) return take(edited ? L!.body : null); // an edit beats a delete
      const body = R.body!;
      if (!L) {
        // Deleted here: an edit there brings it back; a rename there does not.
        if (rec && rec.rev > 0 && rec.hash !== null && !theirEdit) return take(null);
        e.restored = !!rec && rec.rev > 0 && rec.hash !== null;
        return take(body);
      }
      if (!dirty) return take(body);
      if (L.hash === R.hash) return take(L.body);
      if (!edited) return take(theirEdit && names && theirs.name === rec?.name ? names.set(body, names.get(L.body)) : body);
      if (!theirEdit) return take(names && theirs.name !== rec?.name ? names.set(L.body, theirs.name!) : L.body);
      // Edited on both sides: per kind.
      if (spec.policy === 'merge' && spec.merge) return take(spec.merge(L.body, body));
      if (spec.policy === 'lastWriter' || !spec.copy) return take(L.body);
      return 'copy';
    })();
    // Nothing is written into an item in use: the whole decision waits.
    if (used && (decided === 'copy' || e.target !== L?.body)) {
      e.fixed = e.waits = true;
      e.target = L?.body ?? null;
      e.base = recBase;
      e.restored = false;
      return null;
    }
    if (decided !== 'copy') return null;
    // Edited on both sides: keep both.
    if (!L || !spec.copy) return null;
    e.target = R.body!;
    e.base = theirs;
    const key = await copyKey(spec.kind, e.key!, R.rev, L.hash);
    const name = spec.names ? spec.names.get(L.body) : '';
    const copyName = spec.names ? keepBothName(name, meta.deviceLabel, this.clock.now(), new Set(), spec.names.rules) : '';
    const copyBody = spec.copy(L.body, key, copyName);
    const copy = this.entry(spec, await this.codec.serverId(spec.kind, key), key, null, null);
    copy.target = copyBody;
    copy.copyOf = e;
    return copy;
  }

  /**
   * No two items of the kind may share a name. Who keeps it: an item left
   * alone this round (in use, unreadable), then one equal to its server
   * version (a pulled name wins over a local new or renamed one), then by
   * server id, so every device that sees the same collision settles it
   * the same way. The others get the first free `_2`, `_3` ….
   */
  private async uniqueNames(spec: KindSpec, entries: Entry[]): Promise<void> {
    const names = spec.names!;
    const planned = (e: Entry): Body | null => (e.fixed ? (e.local?.body ?? null) : e.target);
    const taken = new Set<string>();
    const groups = new Map<string, Entry[]>();
    for (const e of entries) {
      const b = planned(e);
      if (!b) continue;
      const n = names.get(b);
      taken.add(n);
      const g = groups.get(n);
      if (g) g.push(e);
      else groups.set(n, [e]);
    }
    const rank = (e: Entry): number => (e.fixed || e.used ? 0 : e.targetHash === e.base.hash ? 1 : 2);
    for (const [name, group] of groups) {
      if (group.length < 2) continue;
      group.sort((a, b) => rank(a) - rank(b) || (a.sid < b.sid ? -1 : a.sid > b.sid ? 1 : 0));
      for (const e of group.slice(1)) {
        if (e.fixed || e.used) continue;
        const to = freeName(name, taken, names.rules);
        taken.add(to);
        e.renamedFrom ??= name;
        e.target = names.set(e.target!, to);
        await this.hashTarget(e);
      }
    }
  }

  /** The record once the round's local batch is written: based on `base`, or none. */
  private recordAt(e: Entry): SyncRecord | null {
    if (!e.target && (e.base.deleted || e.base.rev === 0)) return null;
    if (e.base.rev === 0 && !e.rec) return null;
    return {
      kind: e.spec.kind,
      serverId: e.sid,
      key: e.key,
      name: e.base.name,
      rev: e.base.rev,
      hash: e.base.hash,
      bare: e.base.bare,
      state: e.rec?.state === 'full' ? 'full' : 'synced',
      ...(e.rec?.state === 'full' && e.rec.full ? { full: e.rec.full } : {}),
    };
  }

  private announce(e: Entry): void {
    const names = e.spec.names;
    const nameOf = (b: Body | null | undefined): string => (b && names ? names.get(b) : '');
    const kind = e.spec.kind;
    let ev: SyncEvent | null = null;
    if (e.copyOf) {
      ev = { type: 'keptBoth', kind, key: e.copyOf.key!, name: nameOf(e.copyOf.target), copyKey: e.key!, copyName: nameOf(e.target) };
    } else if (e.renamedFrom !== undefined) {
      ev = { type: 'renamed', kind, key: e.key!, from: e.renamedFrom, to: nameOf(e.target) };
    } else if (e.restored) {
      ev = { type: 'restored', kind, key: e.key!, name: nameOf(e.target) };
    }
    if (ev) this.events.emit(ev);
  }

  /** Step 6 for one item; updates `e.rec`. */
  private async push(e: Entry): Promise<'none' | 'ok' | 'conflict' | 'full'> {
    const { spec, base } = e;
    let res;
    if (e.target) {
      if (!base.deleted && e.targetHash === base.hash) return 'none';
      res = await this.remote.put(spec.kind, e.sid, base.rev, await this.codec.seal(spec, e.sid, e.target));
    } else {
      if (base.deleted || base.rev === 0) return 'none';
      res = await this.remote.remove(spec.kind, e.sid, base.rev);
    }
    const name = e.target && spec.names ? spec.names.get(e.target) : null;
    if (res.status === 'ok') {
      this.usage = res.written.usage;
      e.rec = e.target
        ? { kind: spec.kind, serverId: e.sid, key: e.key, name, rev: res.written.rev, hash: e.targetHash, bare: e.targetBare, state: 'synced' }
        : null;
      return 'ok';
    }
    if (res.status === 'full') {
      if (e.rec?.state !== 'full') this.events.emit({ type: 'full', kind: spec.kind, key: e.key!, name, error: res.error });
      e.rec = { ...(e.rec ?? { kind: spec.kind, serverId: e.sid, key: e.key, name: null, rev: 0, hash: null, bare: null }), state: 'full', full: res.error };
      return 'full';
    }
    // 409: the current item becomes the remote version; the next round resolves it.
    const current = res.current;
    const rec = e.rec ?? { kind: spec.kind, serverId: e.sid, key: e.key, name: null, rev: 0, hash: null, bare: null, state: 'synced' as const };
    e.rec = (await this.take(current, rec, true)) ?? rec;
    return 'conflict';
  }
}
