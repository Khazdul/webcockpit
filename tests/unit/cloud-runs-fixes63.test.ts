// Stage 63's review (ADR 0153, "As built (stage 63, review fixes)"): one
// `describe` per finding, each test failing before its fix. The numbers
// are the independent review's (1–9) and /code-review's (CR1–CR9) in the
// review's findings; CR1 is finding 3 and CR3 covers finding 8. The
// Worker's (7, CR5) are in worker/test/runs.test.ts; CR8 and CR9 change
// no behaviour.

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ACCOUNT_LIMITS } from '../../shared/cloud/api.ts';
import { deriveKeys, makeRoot, opaqueId } from '../../src/cloud/crypto';
import { inlineRunBodyCodec, runBodyPort } from '../../src/cloud/runs/body-client';
import { FETCH_STALE_MS, RunQueue } from '../../src/cloud/runs/queue';
import type { RunBodyPort, RunCloudRow, RunRemote, RunRows } from '../../src/cloud/runs/types';
import { sessionCloud } from '../../src/cloud/runs-view';
import { type OpenDb, idbLocalItems, idbRunCloudStore, idbSyncRecords, readMeta, writeMeta } from '../../src/cloud/space/local';
import { beginMove, continueMove, moveRuns, moveState } from '../../src/cloud/space/move';
import { PageRuns } from '../../src/cloud/space/runtime';
import { deviceDb, prepareAccountSpace, resetSpaceConnsForTests, runCounts } from '../../src/cloud/space/spaces';
import { ItemCodec } from '../../src/cloud/sync/codec';
import { noLock } from '../../src/cloud/sync/lock';
import type { Body, SyncKeys, SyncLock } from '../../src/cloud/sync/types';
import { STORE, idbDone, idbRequest } from '../../src/core/db';
import { currentSpace, gameLockName, resetSpaceForTests } from '../../src/core/space';
import { setRunCloudHook } from '../../src/runs/cloud-hook';
import { RunLibrary } from '../../src/runs/library';
import { RUN_BODY_DELETES, RunStore } from '../../src/runs/store';
import { MemoryRecords, MemoryRunSpace, ServerModel, newLink, runRemoteFor } from './cloud-sync-model';

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

let keys: SyncKeys;
beforeEach(async () => {
  vi.stubGlobal('localStorage', memStorage());
  vi.stubGlobal('sessionStorage', memStorage());
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  resetSpaceForTests();
  resetSpaceConnsForTests();
  setRunCloudHook(null);
  keys ??= await deriveKeys(makeRoot());
});
afterEach(() => {
  setRunCloudHook(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const sid = (kind: string, id: string): Promise<string> => opaqueId(keys.idKey, kind as never, id);
const sidOf = (runId: string): Promise<string> => sid('run', runId);

async function put(open: OpenDb, store: string, ...recs: unknown[]): Promise<void> {
  const t = (await open()).transaction(store, 'readwrite');
  const d = idbDone(t);
  for (const r of recs) t.objectStore(store).put(r);
  await d;
}
async function del(open: OpenDb, store: string, key: string): Promise<void> {
  const t = (await open()).transaction(store, 'readwrite');
  const d = idbDone(t);
  t.objectStore(store).delete(key);
  await d;
}
async function all<T>(open: OpenDb, store: string): Promise<T[]> {
  const t = (await open()).transaction(store, 'readonly');
  const d = idbDone(t);
  const r = (await idbRequest(t.objectStore(store).getAll())) as T[];
  await d;
  return r;
}

function runRows(runId: string, startedUs: number, o: { sealed?: boolean; saved?: boolean; n?: number; rating?: number } = {}): RunRows {
  const n = o.n ?? 3;
  return {
    meta: { runId, character: 'Gandalf', startedUs, endedUs: startedUs + 10, sealed: o.sealed ?? true, bytes: n * 10, lines: n, saved: o.saved ?? true, rating: o.rating ?? 0, savedUs: startedUs + 10, summary: null },
    events: [{ runId, seq: 0, event: { type: 'run_start', us: startedUs } as never }],
    chunks: Array.from({ length: n }, (_, i) => ({ runId, seq: i, firstUs: startedUs + i, lastUs: startedUs + i, text: `${runId} line ${i}\n` })),
  };
}
async function putRun(open: OpenDb, r: RunRows): Promise<void> {
  const t = (await open()).transaction([STORE.runs, STORE.runChunks, STORE.runEvents], 'readwrite');
  const d = idbDone(t);
  t.objectStore(STORE.runs).put(r.meta);
  for (const c of r.chunks) t.objectStore(STORE.runChunks).put(c);
  for (const e of r.events) t.objectStore(STORE.runEvents).put(e);
  await d;
}
const row = async (runId: string, state: RunCloudRow['state'], extra: Partial<RunCloudRow> = {}): Promise<RunCloudRow> => ({
  runId,
  state,
  serverId: await sidOf(runId),
  size: 100,
  tries: 0,
  at: 1,
  startedUs: 1,
  ...extra,
});
/** An agreed `sync` record of `kind`/`key` (the account has the item). */
const agreed = async (kind: string, key: string) => ({ kind, key: await sid(kind, key), rec: { kind, key, serverId: await sid(kind, key), rev: 2, hash: 'h', state: 'synced' } });

/** A queue over the model (as cloud-runs-queue.test.ts). */
function queueOn(server: ServerModel, space: MemoryRunSpace, o: { lock?: SyncLock; remote?: RunRemote; clock?: { t: number; now(): number } } = {}): RunQueue {
  return new RunQueue({
    store: space,
    body: runBodyPort(keys.dataKey, inlineRunBodyCodec()),
    remote: o.remote ?? runRemoteFor(server, newLink()),
    isPlaying: () => false,
    requestSync: () => {},
    ...(o.clock ? { clock: o.clock } : {}),
    ...(o.lock ? { lock: o.lock } : {}),
    random: () => 0.5,
  });
}
const memClock = () => ({ t: 1_700_000_000_000, now() { return this.t; } });
async function memSave(space: MemoryRunSpace, runId: string, startedUs: number, n = 3): Promise<void> {
  space.runs.set(runId, runRows(runId, startedUs, { n }));
  await space.put({ runId, state: 'queued', serverId: await sidOf(runId), size: 0, tries: 0, at: 0, startedUs });
}

/** A `PageRuns` on a space over the model (the page's side of runs in the cloud). */
function pageRuns(open: OpenDb, server: ServerModel, o: { remote?: RunRemote; body?: RunBodyPort } = {}): PageRuns {
  const codec = new ItemCodec(keys);
  return new PageRuns({
    open,
    local: idbLocalItems(open, {}, { runServerId: (id) => codec.serverId('run', id) }),
    records: idbSyncRecords(open, () => 'x'),
    codec,
    dataKey: keys.dataKey,
    remote: o.remote ?? runRemoteFor(server, newLink()),
    body: o.body ?? runBodyPort(keys.dataKey, inlineRunBodyCodec()),
    lock: noLock,
    requestSync: () => {},
    sessionLost: () => {},
    blocked: () => false,
    room: () => ({ usage: server.usage(), limits: server.limits }),
  });
}
/** PageRuns' private steps, for the tests. */
type Inner = { runQueue(): Promise<void>; deleteBodies(): Promise<void> };
const inner = (p: PageRuns): Inner => p as unknown as Inner;

describe('finding 1: an export doc whose session is not in the account yet', () => {
  it('a device that pulled it keeps it at the sweep (no delete pushed to every device)', async () => {
    // A: the session's run is saved but full (not in the account); its doc is listed and pushed.
    const A = await prepareAccountSpace('olea', { fresh: true, deviceLabel: 'a' });
    await putRun(A, runRows('S', 10));
    await put(A, STORE.runCloud, await row('S', 'full', { full: 'quota' }));
    await put(A, STORE.exports, { sessionId: 'S', schema: 1, cuts: [], comments: [{ x: 1 }], title: 'my cuts' });
    const la = idbLocalItems(A, {}, { runServerId: sidOf });
    const docs = await la.list('exportDoc');
    expect(docs.map((i) => i.key)).toEqual(['S']);
    // B pulls the doc (and agrees on it), but has neither the run nor a row.
    const B = await prepareAccountSpace('oleb', { fresh: true, deviceLabel: 'b' });
    const lb = idbLocalItems(B, {}, { runServerId: sidOf });
    await lb.write('exportDoc', { put: [docs[0]!.body as Body], remove: [] });
    await put(B, STORE.sync, await agreed('exportDoc', 'S'));
    await new RunLibrary(new RunStore(await B()), { locks: null, storage: null }).sweep(Date.now() * 1000);
    // Still listed: the engine pushes no delete.
    expect((await lb.list('exportDoc')).map((i) => i.key)).toEqual(['S']);
  });

  it('a doc with no session, no row and no record still goes at the sweep', async () => {
    const B = await prepareAccountSpace('oleb', { fresh: true, deviceLabel: 'b' });
    await put(B, STORE.exports, { sessionId: 'gone', schema: 1, cuts: [], comments: [] });
    await new RunLibrary(new RunStore(await B()), { locks: null, storage: null }).sweep(Date.now() * 1000);
    expect(await all(B, STORE.exports)).toEqual([]);
  });
});

describe('finding 2: a restore of a run this device has only in the cloud', () => {
  it('keeps it the account’s item: listed, its row up, the item’s meta kept', async () => {
    const B = await prepareAccountSpace('oleb', { fresh: true, deviceLabel: 'b' });
    const lb = idbLocalItems(B, {}, { runServerId: sidOf });
    const item = { ...runRows('R', 10).meta, rating: 5 };
    await lb.write('run', { put: [{ runId: 'R', meta: item, size: 50 } as unknown as Body], remove: [] });
    await put(B, STORE.sync, await agreed('run', 'R'));
    expect((await lb.list('run')).map((i) => i.key)).toEqual(['R']);
    // A backup of the run (rated 2 then) is restored here.
    const lib = new RunLibrary(new RunStore(await B()), { locks: null, storage: null });
    const src = await prepareAccountSpace('olec', { fresh: true, deviceLabel: 'c' });
    await putRun(src, runRows('R', 10, { rating: 2 }));
    const backup = await new RunLibrary(new RunStore(await src()), { locks: null, storage: null }).backup(1);
    expect(await lib.restore(backup)).toEqual({ added: 1, skipped: 0 });
    // Listed still (the engine pushes no delete), here with the item's meta, its row up (not "only in the cloud").
    const listed = await lb.list('run');
    expect(listed.map((i) => i.key)).toEqual(['R']);
    expect((listed[0]!.body as unknown as { meta: { rating: number } }).meta.rating).toBe(5);
    const rows = await lib.cloudRows();
    expect(rows.get('R')).toMatchObject({ state: 'up', size: 50 });
    expect(rows.get('R')!.meta).toBeUndefined();
    expect((await lib.chainLog(['R']))[0]!.text).toBe('R line 0\nR line 1\nR line 2\n');
    expect(await runCounts(B)).toMatchObject({ saved: 0 });
    setRunCloudHook({ fetch: async () => ({ ok: true }), saved: () => {}, removed: () => {} });
    const [s] = await lib.listSessions(1_000, { remote: true });
    expect(sessionCloud(s!, rows).cloudOnly).toBe(false);
  });
});

describe('finding 3 (CR1): a run of the account whose upload again ends full or too large', () => {
  it('stays listed (an agreed record), whatever its row’s state', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const local = idbLocalItems(open, {}, { runServerId: sidOf });
    for (const [id, st] of [['f', 'full'], ['t', 'tooLarge'], ['q', 'queued'], ['fn', 'full']] as const) {
      await putRun(open, runRows(id, 10));
      await put(open, STORE.runCloud, await row(id, st));
    }
    for (const id of ['f', 't', 'q']) await put(open, STORE.sync, await agreed('run', id));
    // `fn` was never in the account: not listed.
    expect((await local.list('run')).map((i) => i.key).sort()).toEqual(['f', 'q', 't']);
  });

  it('the check before the upload counts only what a replace grows (a body up before)', async () => {
    const server = new ServerModel().enableRuns();
    const space = new MemoryRunSpace(new MemoryRecords(), sidOf, memClock());
    const q = queueOn(server, space);
    q.setRoom(server.usage(), server.limits);
    await memSave(space, 'a', 100);
    expect(await q.run()).toEqual({ type: 'done', uploaded: 1 });
    // The account is full to the byte; the run is put back in the queue (as after `revived`).
    server.limits = { ...server.limits, runBytes: server.runBytes };
    q.setRoom(server.usage(), server.limits);
    await space.put({ ...space.cloud.get('a')!, state: 'queued' });
    expect(await q.run()).toEqual({ type: 'done', uploaded: 1 });
    expect(space.cloud.get('a')!.state).toBe('up');
  });
});

describe('finding 4: the move goes on after a sync', () => {
  it('keeps the runs’ part of the move state', async () => {
    await put(deviceDb, STORE.profiles, { id: 'p1', name: 'mine', text: 'x', created: 1, modified: 2 });
    await putRun(deviceDb, runRows('s1', 10));
    const { open } = await beginMove('Ole', 'x', Date.now(), { runs: true });
    expect(await moveRuns(open)).toBe(1);
    // The player deletes the moved profile in the account before it was pushed: the entry is dropped.
    await del(open, STORE.profiles, 'mine');
    const p = await continueMove(open);
    expect(p).toMatchObject({ done: true, justDone: true, total: { runs: 1 } });
    expect(await moveState(open)).toMatchObject({ total: { runs: 1 }, runs: { saved: ['s1'], pending: false } });
  });
});

describe('finding 5: a game started in another tab during the uploads', () => {
  it('stops the queue before the next upload', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const server = new ServerModel().enableRuns();
    await putRun(open, runRows('a', 100));
    await putRun(open, runRows('b', 200));
    let elsewhere = false;
    const name = gameLockName(currentSpace());
    vi.stubGlobal('navigator', { locks: { query: async () => ({ held: elsewhere ? [{ name }] : [], pending: [] }), request: async () => {} } });
    const codec = runBodyPort(keys.dataKey, inlineRunBodyCodec());
    const body: RunBodyPort = {
      // The first body is made while the other tab starts its game.
      encode: async (id, rows) => {
        elsewhere = true;
        return codec.encode(id, rows);
      },
      decode: (id, runId, b) => codec.decode(id, runId, b),
    };
    const pr = pageRuns(open, server, { body });
    await inner(pr).runQueue();
    expect(server.bodies.size).toBe(1);
    const rows = await idbRunCloudStore(open).list();
    expect(rows.map((r) => r.state).sort()).toEqual(['queued', 'up']);
    pr.stop();
  });
});

describe('finding 6: the move of a run not sealed', () => {
  it('leaves it on the device (a guest game in another tab may record it)', async () => {
    await putRun(deviceDb, runRows('live', 30, { sealed: false }));
    await putRun(deviceDb, runRows('done', 10));
    const { open } = await beginMove('Ole', 'x', Date.now(), { runs: true });
    expect(await moveRuns(open)).toBe(1);
    expect((await all<{ runId: string }>(deviceDb, STORE.runs)).map((r) => r.runId)).toEqual(['live']);
    expect((await all<{ runId: string }>(deviceDb, STORE.runChunks)).length).toBe(3);
    expect((await all<{ runId: string }>(open, STORE.runs)).map((r) => r.runId)).toEqual(['done']);
    expect(await moveState(open)).toMatchObject({ total: { runs: 1 }, runs: { saved: ['done'] } });
  });
});

describe('finding 8 (CR3): fetches and the check of the bodies beside the uploads', () => {
  it('the check of the bodies waits for an upload of another tab (no body re-uploaded for nothing)', async () => {
    const server = new ServerModel().enableRuns();
    const space = new MemoryRunSpace(new MemoryRecords(), sidOf, memClock());
    // One Web Lock for the two tabs.
    let tail: Promise<unknown> = Promise.resolve();
    const lock: SyncLock = {
      run: (fn) => {
        const p = tail.then(fn);
        tail = p.catch(() => {});
        return p;
      },
    };
    let aDone!: () => void;
    const aFinished = new Promise<void>((r) => (aDone = r));
    const base = runRemoteFor(server, newLink(), {});
    const link = { betweenReserveAndStore: undefined as undefined | (() => Promise<void>) };
    const aRemote = runRemoteFor(server, newLink(), link);
    // Tab B's list answer is read after tab A's upload ended (as a slow network would).
    const bRemote: RunRemote = { ...base, list: async () => {
      const l = await base.list();
      await aFinished;
      return l;
    } };
    const a = queueOn(server, space, { lock, remote: aRemote });
    const b = queueOn(server, space, { lock, remote: bRemote });
    await memSave(space, 'x', 100);
    let check: Promise<{ orphans: number; requeued: number }> | null = null;
    link.betweenReserveAndStore = async () => {
      link.betweenReserveAndStore = undefined;
      check = b.checkBodies(new Set());
    };
    expect(await a.run()).toEqual({ type: 'done', uploaded: 1 });
    aDone();
    expect(await check!).toEqual({ orphans: 0, requeued: 0 });
    expect(space.cloud.get('x')!.state).toBe('up');
  });

  it('a run fetched twice at once in one tab (Fetch all, then its open) is fetched once, and both say so', async () => {
    const server = new ServerModel().enableRuns();
    const a = new MemoryRunSpace(new MemoryRecords(), sidOf, memClock());
    await memSave(a, 'r1', 100, 30);
    await queueOn(server, a).run();
    const b = new MemoryRunSpace(new MemoryRecords(), sidOf, memClock());
    await b.write_('run', { put: [{ runId: 'r1', meta: a.runs.get('r1')!.meta, size: a.cloud.get('r1')!.size } as unknown as Body], remove: [] });
    const gets = vi.spyOn(server, 'getBody');
    const q = queueOn(server, b);
    const [one, two] = await Promise.all([q.fetchRuns(['r1']), q.fetchRuns(['r1'])]);
    expect(one).toEqual({ fetched: ['r1'], failed: [] });
    expect(two).toEqual({ fetched: ['r1'], failed: [] });
    expect(gets).toHaveBeenCalledTimes(1);
    expect(b.cloud.get('r1')!.state).toBe('up');
  });

  it('a run another tab fetched meanwhile (its row up) counts as fetched', async () => {
    const server = new ServerModel().enableRuns();
    const a = new MemoryRunSpace(new MemoryRecords(), sidOf, memClock());
    await memSave(a, 'r1', 100, 30);
    await queueOn(server, a).run();
    const b = new MemoryRunSpace(new MemoryRecords(), sidOf, memClock());
    await b.write_('run', { put: [{ runId: 'r1', meta: a.runs.get('r1')!.meta, size: a.cloud.get('r1')!.size } as unknown as Body], remove: [] });
    const base = runRemoteFor(server, newLink());
    const other = queueOn(server, b);
    const q = queueOn(server, b, { remote: { ...base, get: async (id, o) => {
      const blob = await base.get(id, o);
      // The other tab's fetch of the same run ends first.
      expect(await other.fetchRuns(['r1'])).toEqual({ fetched: ['r1'], failed: [] });
      return blob;
    } } });
    expect(await q.fetchRuns(['r1'])).toEqual({ fetched: ['r1'], failed: [] });
    expect(b.cloud.get('r1')!.state).toBe('up');
  });

  it('recover at load leaves a young fetching row (another tab’s fetch) and puts back a stale one', async () => {
    const clock = memClock();
    const space = new MemoryRunSpace(new MemoryRecords(), sidOf, clock);
    await space.put(await row('young', 'fetching', { at: clock.t - 1000, meta: runRows('young', 1).meta }));
    await space.put(await row('old', 'fetching', { at: clock.t - FETCH_STALE_MS - 1, meta: runRows('old', 2).meta }));
    expect(await queueOn(new ServerModel().enableRuns(), space, { clock }).recover()).toBe(1);
    expect([space.cloud.get('young')!.state, space.cloud.get('old')!.state]).toEqual(['fetching', 'remote']);
  });
});

describe('finding 9: runs in the cloud turned off after rows were made', () => {
  it('History lists no session only in the cloud (it could not be opened)', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    await putRun(open, runRows('loc', 1_000));
    await put(open, STORE.runCloud, await row('loc', 'up'), await row('rem', 'remote', { meta: runRows('rem', 2_000).meta }));
    const lib = new RunLibrary(new RunStore(await open()), { locks: null, storage: null });
    expect((await lib.listSessions(5_000, { remote: true })).map((s) => s.id)).toEqual(['loc']);
    setRunCloudHook({ fetch: async () => ({ ok: true }), saved: () => {}, removed: () => {} });
    expect((await lib.listSessions(5_000, { remote: true })).map((s) => s.id)).toEqual(['rem', 'loc']);
  });
});

describe('CR2: the room is only ever the server’s', () => {
  it('an upload’s answer gives no room with limits assumed: a server limit above the default is not refused here', async () => {
    const server = new ServerModel().enableRuns();
    server.limits = { ...DEFAULT_ACCOUNT_LIMITS, runBytes: DEFAULT_ACCOUNT_LIMITS.runBytes * 4 };
    // The account holds more than the default limit already (counted, not stored, in the model).
    server.runBytes = DEFAULT_ACCOUNT_LIMITS.runBytes + 1000;
    const space = new MemoryRunSpace(new MemoryRecords(), sidOf, memClock());
    const q = queueOn(server, space);
    await memSave(space, 'a', 100);
    await memSave(space, 'b', 200);
    expect(await q.run()).toEqual({ type: 'done', uploaded: 2 });
    expect(q.room).toBeNull();
    expect([space.cloud.get('a')!.state, space.cloud.get('b')!.state]).toEqual(['up', 'up']);
  });
});

describe('CR4: a run item refused as too large', () => {
  it('is not uploaded again when there is room (more room does not make its item fit)', async () => {
    const server = new ServerModel().enableRuns();
    const space = new MemoryRunSpace(new MemoryRecords(), sidOf, memClock());
    const q = queueOn(server, space);
    q.setRoom(server.usage(), server.limits);
    await memSave(space, 'a', 100);
    await q.run();
    await q.itemRefused('a', 'item_too_large');
    expect(space.cloud.get('a')).toMatchObject({ state: 'full', full: 'item_too_large' });
    const before = server.requests;
    q.setRoom({ items: 0, itemBytes: 0, runBytes: 0 }, DEFAULT_ACCOUNT_LIMITS);
    expect(await q.run()).toEqual({ type: 'done', uploaded: 0 });
    expect(server.requests).toBe(before);
    expect(server.bodies.size).toBe(0);
  });
});

describe('CR6: the bodies of deleted runs, deleted after the sync', () => {
  it('a Delete stored while they were deleted is kept for the next time', async () => {
    const real = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const server = new ServerModel().enableRuns();
    await writeMeta(real, { [RUN_BODY_DELETES]: { a: await sidOf('a') } });
    await putRun(real, runRows('b', 10));
    await put(real, STORE.runCloud, await row('b', 'up'));
    const store = new RunStore(await real());
    const playerDeletes = () => store.deleteSavedRuns(['b'], 'b');
    // The player's Delete of b lands just before the space's next transaction after a's body went.
    let removed = false;
    let opens = 0;
    let deleted = false;
    const open: OpenDb = async () => {
      if (removed && ++opens === 2 && !deleted) {
        deleted = true;
        await playerDeletes();
      }
      return real();
    };
    const base = runRemoteFor(server, newLink());
    const pr = pageRuns(open, server, { remote: { ...base, remove: async (id) => {
      const r = await base.remove(id);
      removed = true;
      return r;
    } } });
    await inner(pr).deleteBodies();
    if (!deleted) await playerDeletes();
    expect((await readMeta(real, [RUN_BODY_DELETES]))[RUN_BODY_DELETES]).toEqual({ b: await sidOf('b') });
    pr.stop();
  });
});

describe('CR7: what the sync’s caller awaits', () => {
  it('makes no request: the bodies’ deletes and the check wait behind it; the revived runs are queued before', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const server = new ServerModel().enableRuns();
    await putRun(open, runRows('r', 10));
    await put(open, STORE.runCloud, await row('r', 'up'));
    await writeMeta(open, { [RUN_BODY_DELETES]: { gone: await sidOf('gone') } });
    const base = runRemoteFor(server, newLink());
    const hang = new Promise<never>(() => {});
    const calls: string[] = [];
    const pr = pageRuns(open, server, { remote: { ...base, remove: () => (calls.push('remove'), hang), list: () => (calls.push('list'), hang), put: () => (calls.push('put'), hang) } });
    pr.engineEvent({ type: 'revived', kind: 'run', key: 'r' } as never);
    const out = await Promise.race([
      pr.afterSync({ type: 'synced' }, { usage: server.usage(), limits: server.limits } as never).then(() => 'returned'),
      new Promise((r) => setTimeout(() => r('waited on the network'), 1000)),
    ]);
    expect(out).toBe('returned');
    expect((await idbRunCloudStore(open).get('r'))!.state).toBe('queued');
    // The network's part went on behind it.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toContain('remove');
    pr.stop();
  });
});
