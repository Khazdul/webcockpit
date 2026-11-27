// Stage 61 (spec §7.4, ADR 0151; stage 62, ADR 0152): an in-memory model of the sync API of
// shared/cloud/api.ts ("// --- Sync"), and in-memory local ports, for the
// engine's tests. Stage 63 (ADR 0153) adds the run bodies in R2 ("Runs in
// the cloud": the reservation of room, `quota`, `run_too_large`, the
// list) and the in-memory side of runs in the cloud (`MemoryRunSpace`,
// `RunDevice`). The server answers as HTTP would (status + body); the
// `remoteFor` adapter maps that onto the engine's `Remote` port the way
// the fetch adapter of part C must.

import {
  type AccountLimits,
  DEFAULT_ACCOUNT_LIMITS,
  SYNC_ID_PATTERN,
  SYNC_KINDS,
  SYNC_KINDS_OPEN,
  type SessionEndReason,
  type SyncChanges,
  type SyncItem,
  type SyncKind,
  type SyncUsage,
} from '../../shared/cloud/api.ts';
import type { RunBodyList } from '../../shared/cloud/api.ts';
import { toBase64Url } from '../../src/cloud/crypto/base64url';
import type { NameRules } from '../../src/cloud/sync/items';
import { ITEM_SPECS, SYNC_SPECS, commIdentity } from '../../src/cloud/sync/items';
import { SyncEngine, type SyncEngineOptions } from '../../src/cloud/sync/engine';
import type { RunBodyWritten } from '../../shared/cloud/api.ts';
import type { RunMeta } from '../../src/capture/store';
import type { RunCloudRow, RunCloudStore, RunPutResult, RunRemote, RunRows } from '../../src/cloud/runs/types';
import type { ExportDoc } from '../../src/share/edits';
import {
  type Body,
  type CommItem,
  type CommPieceRecord,
  type ItemKind,
  type Clock,
  type FullReason,
  type LocalItem,
  type LocalItems,
  type Remote,
  type RunItem,
  RemoteError,
  type SyncEvent,
  type SyncKeys,
  type SyncMeta,
  type SyncOutcome,
  type SyncRecord,
  type SyncRecords,
  type WriteResult,
} from '../../src/cloud/sync/types';

export interface Answer {
  status: number;
  body: unknown;
}

/** The server's side of one account. */
export class ServerModel {
  private readonly items = new Map<string, SyncItem>();
  seq = 0;
  limits: AccountLimits = { ...DEFAULT_ACCOUNT_LIMITS };
  /** Set: every request answers 401 session_ended with it. */
  ended: SessionEndReason | null = null;
  time = 1_700_000_000_000;
  /** Requests answered (for tests that count). */
  requests = 0;
  /** The kinds open (stage 63: `enableRuns()` opens run and exportDoc). */
  open: SyncKind[] = [...SYNC_KINDS_OPEN];
  /** The flag `runs`: off, the run endpoints answer 404. */
  runsFlag = false;
  /** The R2 bucket of the account: run bodies by id. */
  readonly bodies = new Map<string, { bytes: Uint8Array; size: number; created: number }>();
  /** The account's run bytes as D1 counts them: stored bodies plus reservations in flight. */
  runBytes = 0;
  /** The next n R2 writes fail (after the reservation: it is given back). */
  r2Fail = 0;
  /** The most `runBytes` ever was (the limit must hold at every moment). */
  peakOverLimit = 0;

  /** Flag `runs` on: the run endpoints answer, run and exportDoc open. */
  enableRuns(): this {
    this.runsFlag = true;
    for (const k of ['run', 'exportDoc'] as const) if (!this.open.includes(k)) this.open.push(k);
    return this;
  }

  private key(kind: string, id: string): string {
    return `${kind}/${id}`;
  }

  usage(): SyncUsage {
    let items = 0;
    let itemBytes = 0;
    for (const it of this.items.values()) {
      if (it.deleted || it.kind === 'lookImage') continue;
      items++;
      itemBytes += it.size;
    }
    return this.runsFlag ? { items, itemBytes, runBytes: this.runBytes } : { items, itemBytes };
  }

  /** Stage 80 (ADR 0172): the own images' count and bytes, apart from the small items'. */
  lookUsage(): { lookImages: number; lookBytes: number } {
    let lookImages = 0;
    let lookBytes = 0;
    for (const it of this.items.values()) {
      if (it.deleted || it.kind !== 'lookImage') continue;
      lookImages++;
      lookBytes += it.size;
    }
    return { lookImages, lookBytes };
  }

  /** The bytes of the bodies stored (tests: equals `runBytes` when nothing is in flight). */
  storedRunBytes(): number {
    let n = 0;
    for (const b of this.bodies.values()) n += b.size;
    return n;
  }

  private runGate(id?: string): Answer | null {
    this.requests++;
    if (this.ended) return { status: 401, body: { error: 'session_ended', reason: this.ended } };
    if (!this.runsFlag) return { status: 404, body: { error: 'not_found' } };
    if (id !== undefined && !SYNC_ID_PATTERN.test(id)) return { status: 400, body: { error: 'bad_request' } };
    return null;
  }

  /**
   * `PUT /api/u/runs/<id>`: the room is reserved first (one conditional
   * update), then the body is stored (`between` runs in the gap, where a
   * parallel PUT may come), then it counts; an R2 failure gives it back.
   */
  async putBody(id: string, bytes: Uint8Array, between?: () => Promise<void>): Promise<Answer> {
    const g = this.runGate(id);
    if (g) return g;
    if (bytes.length > this.limits.runMaxBytes) return { status: 413, body: { error: 'run_too_large', limit: this.limits.runMaxBytes } };
    const old = this.bodies.get(id)?.size ?? 0;
    const delta = bytes.length - old;
    if (delta > 0 && this.runBytes + delta > this.limits.runBytes) {
      return { status: 413, body: { error: 'quota', used: this.runBytes, limit: this.limits.runBytes, size: bytes.length } };
    }
    this.runBytes += delta;
    this.peakOverLimit = Math.max(this.peakOverLimit, this.runBytes - this.limits.runBytes);
    await between?.();
    if (this.r2Fail > 0) {
      this.r2Fail--;
      this.runBytes -= delta;
      return { status: 500, body: { error: 'unavailable' } };
    }
    // A replace counts what is stored then (a parallel replace of the same id).
    const now = this.bodies.get(id)?.size ?? 0;
    this.runBytes += now - old;
    this.bodies.set(id, { bytes: bytes.slice(), size: bytes.length, created: this.time++ });
    return { status: 200, body: { size: bytes.length, usage: this.usage() } };
  }

  /** `GET /api/u/runs/<id>` */
  getBody(id: string): Answer {
    const g = this.runGate(id);
    if (g) return g;
    const b = this.bodies.get(id);
    if (!b) return { status: 404, body: { error: 'not_found' } };
    return { status: 200, body: b.bytes.slice() };
  }

  /** `DELETE /api/u/runs/<id>` */
  removeBody(id: string): Answer {
    const g = this.runGate(id);
    if (g) return g;
    const b = this.bodies.get(id);
    if (b) {
      this.bodies.delete(id);
      this.runBytes -= b.size;
    }
    return { status: 200, body: { size: 0, usage: this.usage() } };
  }

  /** `GET /api/u/runs` */
  listBodies(): Answer {
    const g = this.runGate();
    if (g) return g;
    const body: RunBodyList = {
      bodies: [...this.bodies].map(([id, b]) => ({ id, size: b.size, created: b.created })),
      usage: this.usage(),
      limits: { ...this.limits },
    };
    return { status: 200, body };
  }

  /** Every item, tombstones too (tests). */
  all(): SyncItem[] {
    return [...this.items.values()].map((x) => ({ ...x }));
  }

  private gate(kind?: string, id?: string): Answer | null {
    this.requests++;
    if (this.ended) return { status: 401, body: { error: 'session_ended', reason: this.ended } };
    if (kind !== undefined && !(SYNC_KINDS as readonly string[]).includes(kind)) return { status: 404, body: { error: 'not_found' } };
    if (kind !== undefined && !this.open.includes(kind as SyncKind)) return { status: 400, body: { error: 'kind_closed' } };
    if (id !== undefined && !SYNC_ID_PATTERN.test(id)) return { status: 400, body: { error: 'bad_id' } };
    return null;
  }

  /** `GET /api/u/sync/changes?since=&limit=` */
  changes(since: number, limit = 500): Answer {
    const g = this.gate();
    if (g) return g;
    if (!Number.isInteger(since) || since < 0) return { status: 400, body: { error: 'bad_since' } };
    const n = Math.min(Math.max(1, Math.floor(limit)), 500);
    const after = [...this.items.values()].filter((x) => x.seq > since).sort((a, b) => a.seq - b.seq);
    const items = after.slice(0, n).map((x) => ({ ...x }));
    const body: SyncChanges = {
      items,
      cursor: items.length ? items[items.length - 1]!.seq : since,
      more: after.length > n,
      usage: this.usage(),
      limits: { ...this.limits },
    };
    return { status: 200, body };
  }

  private tombstone0(kind: SyncKind, id: string): SyncItem {
    return { kind, id, rev: 0, seq: 0, deleted: true, size: 0, updated: 0 };
  }

  /** `PUT /api/u/sync/items/<kind>/<id>`, `If-Match: <rev>` */
  put(kind: string, id: string, ifMatch: number, blob: Uint8Array): Answer {
    const g = this.gate(kind, id);
    if (g) return g;
    const k = kind as SyncKind;
    const cur = this.items.get(this.key(k, id));
    const rev = cur?.rev ?? 0;
    if (ifMatch !== rev) return { status: 409, body: { error: 'conflict', current: cur ? { ...cur } : this.tombstone0(k, id) } };
    const live = cur && !cur.deleted;
    if (k === 'lookImage') {
      // The own images' budget of their own (worker/sync.ts `budgetOf`).
      if (blob.length > this.limits.lookImageMaxBytes) return { status: 413, body: { error: 'item_too_large' } };
      const l = this.lookUsage();
      if (!live && l.lookImages + 1 > this.limits.lookImages) return { status: 413, body: { error: 'too_many_items' } };
      if (l.lookBytes - (live ? cur.size : 0) + blob.length > this.limits.lookBytes) return { status: 413, body: { error: 'storage_full' } };
    } else {
      if (blob.length > this.limits.itemMaxBytes) return { status: 413, body: { error: 'item_too_large' } };
      const u = this.usage();
      if (!live && u.items + 1 > this.limits.items) return { status: 413, body: { error: 'too_many_items' } };
      if (u.itemBytes - (live ? cur.size : 0) + blob.length > this.limits.itemBytes) return { status: 413, body: { error: 'storage_full' } };
    }
    const item: SyncItem = { kind: k, id, rev: rev + 1, seq: ++this.seq, deleted: false, size: blob.length, updated: this.time++, blob: toBase64Url(blob) };
    this.items.set(this.key(k, id), item);
    return { status: 200, body: { rev: item.rev, seq: item.seq, usage: this.usage() } };
  }

  /** `DELETE /api/u/sync/items/<kind>/<id>`, `If-Match: <rev>` */
  remove(kind: string, id: string, ifMatch: number): Answer {
    const g = this.gate(kind, id);
    if (g) return g;
    const k = kind as SyncKind;
    const cur = this.items.get(this.key(k, id));
    const rev = cur?.rev ?? 0;
    if (!cur || ifMatch !== rev) return { status: 409, body: { error: 'conflict', current: cur ? { ...cur } : this.tombstone0(k, id) } };
    const item: SyncItem = { kind: k, id, rev: rev + 1, seq: ++this.seq, deleted: true, size: 0, updated: this.time++ };
    this.items.set(this.key(k, id), item);
    return { status: 200, body: { rev: item.rev, seq: item.seq, usage: this.usage() } };
  }
}

/** What the network does to a device's requests. */
export interface Link {
  online: boolean;
  /** Answer the next n requests with 503. */
  fail5xx: number;
  /** Called before a write reaches the server (tests interleave another device here). */
  beforeWrite?: () => Promise<void>;
}

export const newLink = (): Link => ({ online: true, fail5xx: 0 });

/** The `Remote` port over the model, mapping answers as the fetch adapter must. */
export function remoteFor(server: ServerModel, link: Link): Remote {
  const send = (call: () => Answer): Answer => {
    if (!link.online) throw new RemoteError('offline');
    if (link.fail5xx > 0) {
      link.fail5xx--;
      throw new RemoteError('server', { status: 503 });
    }
    const a = call();
    if (a.status === 401) {
      const b = a.body as { error: string; reason?: SessionEndReason };
      if (b.error === 'session_ended') throw new RemoteError('session_ended', b.reason ? { reason: b.reason, status: 401 } : { status: 401 });
      throw new RemoteError('not_logged_in', { status: 401 });
    }
    if (a.status >= 500) throw new RemoteError('server', { status: a.status });
    return a;
  };
  const write = (a: Answer): WriteResult => {
    if (a.status === 200) return { status: 'ok', written: a.body as never };
    if (a.status === 409) return { status: 'conflict', current: (a.body as { current: SyncItem }).current };
    if (a.status === 413) return { status: 'full', error: (a.body as { error: FullReason }).error };
    throw new RemoteError('refused', { status: a.status });
  };
  return {
    async changes(since, limit) {
      const a = send(() => server.changes(since, limit));
      if (a.status !== 200) throw new RemoteError('refused', { status: a.status });
      return structuredClone(a.body as SyncChanges);
    },
    async put(kind, id, rev, blob) {
      await link.beforeWrite?.();
      return write(send(() => server.put(kind, id, rev, blob)));
    },
    async remove(kind, id, rev) {
      await link.beforeWrite?.();
      return write(send(() => server.remove(kind, id, rev)));
    },
  };
}

const NAME_RULES: Record<string, NameRules | undefined> = {
  profile: ITEM_SPECS.profile.names?.rules,
  script: ITEM_SPECS.script.names?.rules,
};

/** Whether `name` follows the kind's rules. */
export function validName(kind: string, name: string): boolean {
  const r = NAME_RULES[kind];
  if (!r) return true;
  if (name.length === 0 || name.length > r.max || !/^[A-Za-z]/.test(name)) return false;
  for (const ch of name) if (!r.allowed.test(ch)) return false;
  return true;
}

const DAY_MS = 24 * 3600_000;
/** How long the device keeps Comm history (the archive's seven days). */
export const COMM_KEEP_MS = 7 * DAY_MS;

/**
 * How long a Comm day is listed (stage 62 review, F9; `COMM_LIST_MS` of
 * src/cloud/space/local.ts): its start within 8 days and 6 hours, so it
 * is given up only once all its records are past the seven days, with a
 * margin for clocks that differ.
 */
export const COMM_LIST_MS = COMM_KEEP_MS + DAY_MS + 6 * 3600_000;

/**
 * Whether a Comm piece's day is kept at `now` (ADR 0152 as built, as
 * amended by the review): a day whose start (00:00 UTC) is within
 * `COMM_LIST_MS`. Whole days only.
 */
export function commDayKept(day: string, now: number): boolean {
  return Date.parse(`${day.slice(0, 10)}T00:00:00Z`) >= now - COMM_LIST_MS;
}

/** The local key of a record of `kind`. */
export const keyOf = (kind: string, b: Body): string => (ITEM_SPECS[kind as ItemKind]?.key ?? ((x: Body) => x.id as string))(b);

/** Records sorted as a piece is (by `ts`, then identity), duplicates kept (so a test can see them). */
function sortedPiece(records: readonly CommPieceRecord[]): CommPieceRecord[] {
  return records
    .map((r) => [commIdentity(r), r] as const)
    .sort(([ia, a], [ib, b]) => a.ts - b.ts || (ia < ib ? -1 : ia > ib ? 1 : 0))
    .map(([, r]) => structuredClone(r));
}

/**
 * The local stores in memory. A batch whose result breaks a store's rule
 * (two names alike, a bad name) throws, as a store would.
 *
 * `comm` behaves as the IndexedDB adapter must (ADR 0152): `list` gives
 * the kept days only, each day's records sorted; a `put` adds the records
 * the day does not have (by identity) and removes none; a `remove`
 * deletes the day; a day not kept is not stored (a put of it is dropped).
 */
export class MemoryLocal implements LocalItems {
  readonly kinds = new Map<string, Map<string, Body>>();
  /** Throw on the next write (a cut-off sync). */
  failNext = false;
  writes = 0;
  /** Called at the start of every write, before the batch is applied (the game writing meanwhile). */
  beforeWrite?: (kind: SyncKind) => void;

  constructor(private readonly clock: Clock = { now: () => Date.now() }) {}

  private of(kind: string): Map<string, Body> {
    let m = this.kinds.get(kind);
    if (!m) this.kinds.set(kind, (m = new Map()));
    return m;
  }

  get(kind: string, key: string): Body | undefined {
    const b = this.of(kind).get(key);
    return b && structuredClone(b);
  }

  /** What `list` gives, as bodies. */
  items(kind: string): Body[] {
    return this.listed(kind).map(([, b]) => b);
  }

  private listed(kind: string): [string, Body][] {
    const all = [...this.of(kind)];
    if (kind !== 'comm') return all.map(([k, b]) => [k, structuredClone(b)]);
    const now = this.clock.now();
    return all
      .filter(([day]) => commDayKept(day, now))
      .map(([k, b]) => [k, { day: k, records: sortedPiece((b as unknown as CommItem).records) } as unknown as Body]);
  }

  /** The stored Comm records of a day as they are, duplicates and all (tests). */
  rawComm(day: string): CommPieceRecord[] {
    const b = this.of('comm').get(day) as unknown as CommItem | undefined;
    return b ? structuredClone(b.records) : [];
  }

  /** A user's edit, outside the engine. */
  set(kind: string, body: Body): void {
    const key = keyOf(kind, body);
    this.checkNames(kind, new Map([...this.of(kind), [key, body]]));
    this.of(kind).set(key, structuredClone(body));
  }

  /** The game appends a Comm message to the piece `day` (outside the engine). */
  append(day: string, rec: CommPieceRecord): void {
    const m = this.of('comm');
    const cur = m.get(day) as unknown as CommItem | undefined;
    m.set(day, { day, records: [...(cur?.records ?? []), structuredClone(rec)] } as unknown as Body);
  }

  del(kind: string, key: string): void {
    this.of(kind).delete(key);
  }

  async list(kind: SyncKind): Promise<LocalItem[]> {
    return this.listed(kind).map(([key, body]) => ({ key, body }));
  }

  async write(kind: SyncKind, batch: { put: Body[]; remove: string[] }): Promise<void> {
    this.writes++;
    this.beforeWrite?.(kind);
    if (this.failNext) {
      this.failNext = false;
      throw new Error('local write failed');
    }
    const next = new Map(this.of(kind));
    for (const k of batch.remove) next.delete(k);
    for (const b of batch.put) {
      const key = keyOf(kind, b);
      if (kind === 'comm') {
        if (!commDayKept(key, this.clock.now())) continue;
        const cur = (next.get(key) as unknown as CommItem | undefined)?.records ?? [];
        const have = new Set(cur.map(commIdentity));
        const add = (b as unknown as CommItem).records.filter((r) => !have.has(commIdentity(r)));
        next.set(key, { day: key, records: [...cur, ...structuredClone(add)] } as unknown as Body);
      } else next.set(key, structuredClone(b));
    }
    this.checkNames(kind, next);
    this.kinds.set(kind, next);
  }

  private checkNames(kind: string, m: Map<string, Body>): void {
    if (!NAME_RULES[kind]) return;
    const seen = new Set<string>();
    for (const b of m.values()) {
      const n = b.name as string;
      if (!validName(kind, n)) throw new Error(`bad ${kind} name ${JSON.stringify(n)}`);
      if (seen.has(n)) throw new Error(`two ${kind}s named ${n}`);
      seen.add(n);
    }
  }
}

export class MemoryRecords implements SyncRecords {
  readonly recs = new Map<string, SyncRecord>();
  m: SyncMeta;
  /** Throw on the next write. */
  failNext = false;

  constructor(deviceLabel = 'desktop, Firefox') {
    this.m = { cursor: 0, deviceLabel, lastSynced: null };
  }

  async list(): Promise<SyncRecord[]> {
    return [...this.recs.values()].map((r) => structuredClone(r));
  }

  async write(batch: { put: SyncRecord[]; remove: { kind: SyncKind; serverId: string }[] }): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('records write failed');
    }
    for (const r of batch.remove) this.recs.delete(`${r.kind}/${r.serverId}`);
    for (const r of batch.put) this.recs.set(`${r.kind}/${r.serverId}`, structuredClone(r));
  }

  async meta(): Promise<SyncMeta> {
    return { ...this.m };
  }

  async setMeta(patch: Partial<Pick<SyncMeta, 'cursor' | 'lastSynced'>>): Promise<void> {
    this.m = { ...this.m, ...patch };
  }
}

/** A seeded PRNG (mulberry32): the same seed, the same run. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One device of the account: its stores, its link and its engine. */
export class Device {
  readonly local: MemoryLocal;
  readonly records: MemoryRecords;
  readonly link = newLink();
  /** kind → local keys in use (a game playing). */
  readonly using = new Map<string, Set<string>>();
  readonly events: SyncEvent[] = [];
  readonly engine: SyncEngine;

  constructor(
    readonly server: ServerModel,
    keys: SyncKeys,
    readonly label: string,
    clock: Clock,
    opts: Partial<SyncEngineOptions> = {},
  ) {
    this.local = new MemoryLocal(clock);
    this.records = new MemoryRecords(label);
    this.engine = new SyncEngine({
      specs: SYNC_SPECS,
      // A microtask, not the page's macrotask: the generated runs make thousands of syncs.
      yieldToGame: () => Promise.resolve(),
      local: this.local,
      records: this.records,
      remote: remoteFor(server, this.link),
      keys,
      clock,
      inUse: { keys: (kind) => this.using.get(kind) ?? new Set() },
      events: { emit: (e) => this.events.push(e) },
      random: () => 0.5,
      ...opts,
    });
  }

  sync(): Promise<SyncOutcome> {
    return this.engine.sync();
  }

  /** Items of `kind` sorted by name (by key for a kind without names). */
  list(kind = 'profile'): Body[] {
    const by = (b: Body): string => (NAME_RULES[kind] ? (b.name as string) : keyOf(kind, b));
    return this.local.items(kind).sort((a, b) => (by(a) < by(b) ? -1 : 1));
  }

  names(kind = 'profile'): string[] {
    return this.list(kind).map((b) => b.name as string);
  }

  byName(name: string, kind = 'profile'): Body | undefined {
    return this.list(kind).find((b) => b.name === name);
  }
}

// --- Runs in the cloud (stage 63, ADR 0153) ---

/** What the network does to a device's run requests, besides `Link`. */
export interface RunLink {
  /** Runs between a PUT's reservation and its body being stored (a parallel PUT comes here). */
  betweenReserveAndStore?: () => Promise<void>;
}

/** The queue's `RunRemote` over the model, mapping answers as `fetchRunRemote` must. */
export function runRemoteFor(server: ServerModel, link: Link, runLink: RunLink = {}): RunRemote {
  const check = (): void => {
    if (!link.online) throw new RemoteError('offline');
    if (link.fail5xx > 0) {
      link.fail5xx--;
      throw new RemoteError('server', { status: 503 });
    }
  };
  const gate = (a: Answer): Answer => {
    if (a.status === 401) {
      const b = a.body as { error: string; reason?: SessionEndReason };
      if (b.error === 'session_ended') throw new RemoteError('session_ended', b.reason ? { reason: b.reason, status: 401 } : { status: 401 });
      throw new RemoteError('not_logged_in', { status: 401 });
    }
    if (a.status >= 500 || a.status === 429) throw new RemoteError('server', { status: a.status });
    return a;
  };
  return {
    async put(id, body): Promise<RunPutResult> {
      check();
      const bytes = new Uint8Array(await body.arrayBuffer());
      const a = gate(await server.putBody(id, bytes, runLink.betweenReserveAndStore));
      if (a.status === 200) return { status: 'ok', written: a.body as RunBodyWritten };
      const b = a.body as { error?: string; used?: number; limit?: number; size?: number };
      if (a.status === 413 && b.error === 'quota') return { status: 'quota', used: b.used!, limit: b.limit!, size: b.size! };
      if (a.status === 413 && b.error === 'run_too_large') return { status: 'tooLarge', limit: b.limit! };
      throw new RemoteError('refused', { status: a.status });
    },
    async get(id, o = {}) {
      check();
      const a = gate(server.getBody(id));
      if (a.status !== 200) throw new RemoteError('refused', { status: a.status });
      const bytes = a.body as Uint8Array;
      // In pieces, as a stream comes.
      for (let at = 0; at < bytes.length; at += 4096) o.onBytes?.(Math.min(4096, bytes.length - at));
      return new Blob([bytes as Uint8Array<ArrayBuffer>]);
    },
    async remove(id) {
      check();
      const a = gate(server.removeBody(id));
      if (a.status !== 200) throw new RemoteError('refused', { status: a.status });
      return a.body as RunBodyWritten;
    },
    async list() {
      check();
      const a = gate(server.listBodies());
      if (a.status !== 200) throw new RemoteError('refused', { status: a.status });
      return structuredClone(a.body as RunBodyList);
    },
  };
}

const clone = <T>(x: T): T => structuredClone(x);

/**
 * A space's runs in memory: the `runs`, `runChunks` and `runEvents` of its
 * saved runs (`RunRows` by run id), the `runCloud` rows, the export docs;
 * the queue's `RunCloudStore` over them, and the `run` and `exportDoc`
 * kinds' side of `LocalItems` as the IndexedDB adapter must keep them
 * (ADR 0153, stage 63 C1):
 *
 * - `run`: a run here is listed once its row is `up`, and, whatever its
 *   row's state, while the account already has its item (a live sync
 *   record: a run put back in the queue after an edit beat a delete or
 *   after its body was found gone; should that upload end `full` or
 *   `tooLarge`, the item stays: leaving it out would push its delete to
 *   every device, stage 63 review); a `remote` or `fetching` row is listed
 *   with its meta. `put` of a run here takes the meta (and an
 *   `up` row the item's size); of one not here makes a `remote` row. `remove` deletes the run, its row and
 *   the export doc of its session (one run per session in the model).
 * - `exportDoc`: listed for a session with a run (here or `remote`), or
 *   while the account has it.
 */
export class MemoryRunSpace implements RunCloudStore {
  readonly runs = new Map<string, RunRows>();
  readonly cloud = new Map<string, RunCloudRow>();
  readonly docs = new Map<string, ExportDoc>();
  /** Runs the player deleted whose body is to go once the tombstone is pushed: run id → server id. */
  readonly bodyDeletes = new Map<string, string>();

  constructor(
    private readonly records: MemoryRecords,
    private readonly serverIdOf: (runId: string) => Promise<string>,
    private readonly clock: Clock,
  ) {}

  // RunCloudStore
  async list(): Promise<RunCloudRow[]> {
    return [...this.cloud.values()].map(clone);
  }
  async get(runId: string): Promise<RunCloudRow | undefined> {
    const r = this.cloud.get(runId);
    return r && clone(r);
  }
  async put(row: RunCloudRow): Promise<void> {
    this.cloud.set(row.runId, clone(row));
  }
  async remove(runId: string): Promise<void> {
    this.cloud.delete(runId);
  }
  async rows(runId: string): Promise<RunRows | null> {
    const r = this.runs.get(runId);
    return r ? clone(r) : null;
  }
  async putFetched(rows: RunRows, row: RunCloudRow): Promise<void> {
    this.runs.set(rows.meta.runId, clone(rows));
    this.cloud.set(row.runId, clone(row));
  }

  /** Whether the account has the item `kind`/`key` as this device last agreed (a live record). */
  private agreed(kind: SyncKind, key: string): boolean {
    for (const r of this.records.recs.values()) if (r.kind === kind && r.key === key && r.rev > 0 && r.hash !== null) return true;
    return false;
  }

  /** The runs of the account as this device has them: run id → meta (here, or a `remote` row's). */
  savedRuns(): Map<string, RunMeta> {
    const out = new Map<string, RunMeta>();
    for (const [id, r] of this.runs) out.set(id, r.meta);
    for (const row of this.cloud.values()) if ((row.state === 'remote' || row.state === 'fetching') && row.meta && !out.has(row.runId)) out.set(row.runId, row.meta);
    return out;
  }

  list_(kind: 'run' | 'exportDoc'): LocalItem[] {
    if (kind === 'run') {
      const out: LocalItem[] = [];
      for (const [id, r] of this.runs) {
        const row = this.cloud.get(id);
        if (row && (row.state === 'up' || this.agreed('run', id))) out.push({ key: id, body: { runId: id, meta: clone(r.meta), size: row.size } as unknown as Body });
      }
      for (const row of this.cloud.values()) {
        if (this.runs.has(row.runId) || (row.state !== 'remote' && row.state !== 'fetching') || !row.meta) continue;
        out.push({ key: row.runId, body: { runId: row.runId, meta: clone(row.meta), size: row.size } as unknown as Body });
      }
      return out;
    }
    const sessions = this.savedRuns();
    return [...this.docs.values()]
      .filter((d) => sessions.has(d.sessionId) || this.agreed('exportDoc', d.sessionId))
      .map((d) => ({ key: d.sessionId, body: clone(d) as unknown as Body }));
  }

  async write_(kind: 'run' | 'exportDoc', batch: { put: Body[]; remove: string[] }): Promise<void> {
    if (kind === 'exportDoc') {
      for (const k of batch.remove) this.docs.delete(k);
      for (const b of batch.put) this.docs.set((b as unknown as ExportDoc).sessionId, clone(b as unknown as ExportDoc));
      return;
    }
    for (const k of batch.remove) this.deleteRun(k);
    for (const b of batch.put) {
      const it = b as unknown as RunItem;
      const here = this.runs.get(it.runId);
      const row = this.cloud.get(it.runId);
      if (here) {
        here.meta = clone(it.meta);
        // The item's size is the account's (a body sealed again elsewhere may differ by a byte).
        if (row && row.state === 'up') this.cloud.set(it.runId, { ...row, size: it.size });
        if (!row) this.cloud.set(it.runId, { runId: it.runId, state: 'up', serverId: await this.serverIdOf(it.runId), size: it.size, tries: 0, at: this.clock.now(), startedUs: it.meta.startedUs });
      } else {
        this.cloud.set(it.runId, {
          ...(row ?? { tries: 0 }),
          runId: it.runId,
          state: row?.state === 'fetching' ? 'fetching' : 'remote',
          serverId: await this.serverIdOf(it.runId),
          size: it.size,
          at: this.clock.now(),
          startedUs: it.meta.startedUs,
          meta: clone(it.meta),
        });
      }
    }
  }

  /** The player's Delete: as a tombstone's, and its body to go after the next sync (`bodyDeletes`). */
  deleteByPlayer(runId: string, serverId: string): void {
    this.deleteRun(runId);
    this.bodyDeletes.set(runId, serverId);
  }

  /**
   * After a sync that ended `synced`: the bodies of deleted runs whose
   * tombstone went through go; a run that came back (an edit elsewhere
   * beat the delete) keeps its body.
   */
  async afterSync(removeBody: (serverId: string) => Promise<boolean>): Promise<void> {
    const listed = this.savedRuns();
    for (const [runId, sid] of [...this.bodyDeletes]) {
      if (listed.has(runId) || (await removeBody(sid))) this.bodyDeletes.delete(runId);
    }
  }

  /** Delete (a tombstone, or the player's Delete): the run, its row, its session's doc. */
  deleteRun(runId: string): void {
    this.runs.delete(runId);
    this.cloud.delete(runId);
    this.docs.delete(runId);
  }
}

/** `MemoryLocal` with the run kinds kept by a `MemoryRunSpace`. */
export class RunLocal implements LocalItems {
  constructor(
    readonly base: MemoryLocal,
    readonly space: MemoryRunSpace,
  ) {}
  async list(kind: SyncKind): Promise<LocalItem[]> {
    if (kind === 'run' || kind === 'exportDoc') return this.space.list_(kind);
    return this.base.list(kind);
  }
  async write(kind: SyncKind, batch: { put: Body[]; remove: string[] }): Promise<void> {
    if (kind === 'run' || kind === 'exportDoc') return this.space.write_(kind, batch);
    return this.base.write(kind, batch);
  }
}
