// Stage 63 C1 (ADR 0153): runs in the cloud on IndexedDB. The adapters of
// src/cloud/space/local.ts for `run` and `exportDoc` (as `MemoryRunSpace`
// of cloud-sync-model.ts keeps them), the queue's store, the library's
// side (listSessions with remote rows, ensureLocal, remove, the sweep),
// the runs not in the cloud (runCounts, the locked copy), the move of
// runs at Create account, and the page's runtime with the flag `runs` on
// two devices: save on A, see and fetch on B, delete everywhere, a run
// that does not fit. IndexedDB is fake-indexeddb; the server is the model.

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveKeys, makeRoot, opaqueId } from '../../src/cloud/crypto';
import { inlineRunBodyCodec, runBodyPort } from '../../src/cloud/runs/body-client';
import type { RunCloudRow, RunRows } from '../../src/cloud/runs/types';
import { type DoesNotFit, onDoesNotFit, resetRunsViewForTests, runsView, sessionCloud } from '../../src/cloud/runs-view';
import { META, type OpenDb, idbLocalItems, idbRunCloudStore, readMeta } from '../../src/cloud/space/local';
import { beginMove, moveRuns, moveState } from '../../src/cloud/space/move';
import { type SyncFetch, fetchRemote } from '../../src/cloud/space/remote';
import { PageSync } from '../../src/cloud/space/runtime';
import { deviceDb, prepareAccountSpace, resetSpaceConnsForTests, runCounts } from '../../src/cloud/space/spaces';
import { noLock } from '../../src/cloud/sync/lock';
import type { Body, RunItem, SyncKeys } from '../../src/cloud/sync/types';
import { resetSyncViewForTests, setPlaying } from '../../src/cloud/sync-view';
import { STORE, idbDone, idbRequest } from '../../src/core/db';
import { resetSpaceForTests, writeSpaceRecord } from '../../src/core/space';
import { setRunCloudHook } from '../../src/runs/cloud-hook';
import { RunLibrary } from '../../src/runs/library';
import { RUN_BODY_DELETES, RunStore } from '../../src/runs/store';
import { type Answer, ServerModel, newLink, runRemoteFor } from './cloud-sync-model';

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

function modelFetch(server: ServerModel): SyncFetch {
  return async (url, init) => {
    const u = new URL(url, 'https://wc.test');
    const method = init.method ?? 'GET';
    const h = (init.headers ?? {}) as Record<string, string>;
    let a: Answer;
    if (u.pathname === '/api/u/sync/changes') {
      const limit = u.searchParams.get('limit');
      a = server.changes(Number(u.searchParams.get('since')), limit === null ? undefined : Number(limit));
    } else {
      const [kind, id] = u.pathname.slice('/api/u/sync/items/'.length).split('/').map(decodeURIComponent);
      if (method === 'PUT') a = server.put(kind!, id!, Number(h['If-Match']), init.body as Uint8Array);
      else a = server.remove(kind!, id!, Number(h['If-Match']));
    }
    return { status: a.status, json: async () => (a.body === undefined ? Promise.reject(new SyntaxError('none')) : structuredClone(a.body)) };
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
  resetSyncViewForTests();
  resetRunsViewForTests();
  setRunCloudHook(null);
  keys ??= await deriveKeys(makeRoot());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const sidOf = (runId: string): Promise<string> => opaqueId(keys.idKey, 'run', runId);

function runRows(runId: string, startedUs: number, o: { saved?: boolean; sealed?: boolean; n?: number; character?: string } = {}): RunRows {
  const n = o.n ?? 3;
  return {
    meta: {
      runId,
      character: o.character ?? 'Gandalf',
      startedUs,
      endedUs: startedUs + 10,
      sealed: o.sealed ?? true,
      bytes: n * 10,
      lines: n,
      saved: o.saved ?? true,
      rating: 0,
      savedUs: startedUs + 10,
      summary: null,
    },
    events: [{ runId, seq: 0, event: { type: 'run_start', us: startedUs } as never }],
    chunks: Array.from({ length: n }, (_, i) => ({ runId, seq: i, firstUs: startedUs + i, lastUs: startedUs + i, text: `${runId} line ${i}\n` })),
  };
}

async function putRun(open: OpenDb, r: RunRows): Promise<void> {
  const db = await open();
  const t = db.transaction([STORE.runs, STORE.runChunks, STORE.runEvents], 'readwrite');
  const done = idbDone(t);
  t.objectStore(STORE.runs).put(r.meta);
  for (const c of r.chunks) t.objectStore(STORE.runChunks).put(c);
  for (const e of r.events) t.objectStore(STORE.runEvents).put(e);
  await done;
}

async function all(open: OpenDb, store: string): Promise<unknown[]> {
  const db = await open();
  const t = db.transaction(store, 'readonly');
  const done = idbDone(t);
  const r = await idbRequest(t.objectStore(store).getAll());
  await done;
  return r;
}

async function put(open: OpenDb, store: string, ...recs: unknown[]): Promise<void> {
  const db = await open();
  const t = db.transaction(store, 'readwrite');
  const done = idbDone(t);
  for (const r of recs) t.objectStore(store).put(r);
  await done;
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

const doc = (sessionId: string, title = 't') => ({ sessionId, schema: 1, cuts: [], comments: [], title });

async function until(what: () => Promise<boolean> | boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await what())) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('the run and exportDoc adapters', () => {
  it('a run is an item once up (or queued with an agreed record); remote rows with their meta', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const local = idbLocalItems(open, {}, { runServerId: sidOf });
    for (const [id, st] of [['up1', 'up'], ['q1', 'queued'], ['q2', 'queued'], ['f1', 'full'], ['t1', 'tooLarge']] as const) {
      await putRun(open, runRows(id, 10));
      await put(open, STORE.runCloud, await row(id, st, { size: 7 }));
    }
    await putRun(open, runRows('none', 10)); // saved, no row yet
    await put(open, STORE.runCloud, await row('rem', 'remote', { meta: runRows('rem', 20).meta, size: 9 }));
    // q2 is agreed with the account (put back in the queue after an edit beat a delete).
    await put(open, STORE.sync, { kind: 'run', key: await sidOf('q2'), rec: { kind: 'run', key: 'q2', serverId: await sidOf('q2'), rev: 3, hash: 'h', state: 'synced' } });
    const items = await local.list('run');
    expect(items.map((i) => i.key).sort()).toEqual(['q2', 'rem', 'up1']);
    expect((items.find((i) => i.key === 'up1')!.body as unknown as RunItem).size).toBe(7);
    expect((items.find((i) => i.key === 'rem')!.body as unknown as RunItem).meta.runId).toBe('rem');
  });

  it('a pulled item: a remote row, or the meta of a run here; a tombstone deletes the run, its row and its doc', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const local = idbLocalItems(open, {}, { runServerId: sidOf });
    await putRun(open, runRows('here', 10));
    await put(open, STORE.exports, doc('here'));
    const far = runRows('far', 20).meta;
    await local.write('run', {
      put: [
        { runId: 'far', meta: far, size: 55 },
        { runId: 'here', meta: { ...runRows('here', 10).meta, rating: 4 }, size: 44 },
      ] as unknown as Body[],
      remove: [],
    });
    const rows = new Map(((await all(open, STORE.runCloud)) as RunCloudRow[]).map((r) => [r.runId, r]));
    expect(rows.get('far')).toMatchObject({ state: 'remote', size: 55, serverId: await sidOf('far'), meta: far });
    expect(rows.get('here')).toMatchObject({ state: 'up', size: 44 });
    expect(((await all(open, STORE.runs)) as { runId: string; rating: number }[]).find((r) => r.runId === 'here')!.rating).toBe(4);
    // The doc of a session with a saved run here is an item; one with nothing is not.
    await put(open, STORE.exports, doc('far'), doc('gone'));
    expect((await local.list('exportDoc')).map((i) => i.key).sort()).toEqual(['far', 'here']);
    await local.write('run', { put: [], remove: ['here', 'far'] });
    expect(await all(open, STORE.runs)).toEqual([]);
    expect(await all(open, STORE.runChunks)).toEqual([]);
    expect(await all(open, STORE.runEvents)).toEqual([]);
    expect(await all(open, STORE.runCloud)).toEqual([]);
    expect(((await all(open, STORE.exports)) as { sessionId: string }[]).map((d) => d.sessionId)).toEqual(['gone']);
  });

  it('the queue store: rows, a run’s rows, a fetched run written with its row (not after a tombstone)', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const store = idbRunCloudStore(open);
    const r = runRows('a', 10);
    await putRun(open, r);
    expect(await store.rows('a')).toEqual(r);
    expect(await store.rows('nope')).toBeNull();
    await store.put(await row('b', 'fetching'));
    await store.putFetched(runRows('b', 20), await row('b', 'up'));
    expect((await store.get('b'))!.state).toBe('up');
    expect((await store.rows('b'))!.chunks).toHaveLength(3);
    await store.putFetched(runRows('c', 30), await row('c', 'up'));
    expect(await store.rows('c')).toBeNull();
    await store.remove('b');
    expect((await store.list()).map((x) => x.runId)).toEqual([]);
  });
});

describe('the library with runs in the cloud', () => {
  it('lists remote sessions, marks them, fetches before reading, deletes with its body kept for later, keeps cloud docs in the sweep', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const lib = new RunLibrary(new RunStore(await open()), { locks: null, storage: null });
    await putRun(open, runRows('loc', 1_000));
    await put(open, STORE.runCloud, await row('loc', 'up'), await row('rem', 'remote', { meta: runRows('rem', 2_000).meta, size: 30 }));
    await put(open, STORE.exports, doc('rem'), doc('orphan'));
    expect((await lib.listSessions(5_000)).map((s) => s.id)).toEqual(['loc']);
    const sessions = await lib.listSessions(5_000, { remote: true });
    expect(sessions.map((s) => s.id)).toEqual(['rem', 'loc']);
    const rows = await lib.cloudRows();
    expect(sessionCloud(sessions[0]!, rows)).toMatchObject({ state: 'remote', remote: 1, cloudBytes: 30, cloudOnly: true });
    expect(sessionCloud(sessions[1]!, rows)).toMatchObject({ state: 'up', cloudOnly: false });
    // No hook (the flag off): a remote session cannot be fetched; a local one needs nothing.
    expect(await lib.ensureLocal(sessions[0]!)).toEqual({ ok: false, why: 'unavailable' });
    expect(await lib.ensureLocal(sessions[1]!)).toEqual({ ok: true });
    const fetch = vi.fn(async () => ({ ok: true as const }));
    const saved = vi.fn();
    const removed = vi.fn();
    setRunCloudHook({ fetch, saved, removed });
    expect(await lib.ensureLocal(sessions[0]!)).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(['rem'], undefined);
    await lib.save(sessions[1]!, 3);
    expect(saved).toHaveBeenCalledWith(['loc'], 'history');
    // Rating a session only in the cloud rates its row's meta (its item follows).
    await lib.save(sessions[0]!, 5);
    expect((await lib.cloudRows()).get('rem')!.meta!.rating).toBe(5);
    // The sweep keeps the doc of a session in the cloud.
    await lib.sweep(5_000);
    expect(((await all(open, STORE.exports)) as { sessionId: string }[]).map((d) => d.sessionId)).toEqual(['rem']);
    // Delete: the runs and rows go, their server ids wait for the sync.
    await lib.remove(sessions[1]!);
    await lib.remove(sessions[0]!);
    expect(removed).toHaveBeenCalledTimes(2);
    expect(await all(open, STORE.runs)).toEqual([]);
    expect(await all(open, STORE.runCloud)).toEqual([]);
    expect(await all(open, STORE.exports)).toEqual([]);
    expect((await readMeta(open, [RUN_BODY_DELETES]))[RUN_BODY_DELETES]).toEqual({ loc: await sidOf('loc'), rem: await sidOf('rem') });
  });

  it('runCounts: a saved run is in the cloud only when up with an agreed item; the backup of some runs', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const now = Date.now();
    await putRun(open, runRows('up-agreed', now * 1000));
    await putRun(open, runRows('up-new', now * 1000));
    await putRun(open, runRows('full', now * 1000));
    await putRun(open, runRows('unsaved', now * 1000, { saved: false }));
    await put(open, STORE.runCloud, await row('up-agreed', 'up'), await row('up-new', 'up'), await row('full', 'full'));
    await put(open, STORE.sync, { kind: 'run', key: await sidOf('up-agreed'), rec: { kind: 'run', key: 'up-agreed', serverId: await sidOf('up-agreed'), rev: 1, hash: 'h', state: 'synced' } });
    const c = await runCounts(open, now);
    expect(c).toMatchObject({ saved: 2, unsaved: 1, unsavedIds: ['unsaved'] });
    expect(c.savedIds.sort()).toEqual(['full', 'up-new']);
    const lib = new RunLibrary(new RunStore(await open()), { locks: null, storage: null });
    const blob = await lib.backup(1, { only: new Set(['full']) });
    const text = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    expect(text.split('\n').filter((l) => l.includes('"type":"run"'))).toHaveLength(1);
    expect(text).toContain('"runId":"full"');
  });
});

describe('the move of runs at Create account', () => {
  it('every run with its chunks, events and docs moves; a run changed on the device after the copy stays the device’s', async () => {
    await putRun(deviceDb, runRows('s1', 10));
    await putRun(deviceDb, runRows('u1', 20, { saved: false }));
    await putRun(deviceDb, runRows('busy', 30, { sealed: false, saved: false }));
    await put(deviceDb, STORE.exports, doc('s1'));
    const { open } = await beginMove('Ole', 'x', Date.now(), { runs: true });
    // A guest game in another tab writes to `busy` between its copy and its removal.
    const n = await moveRuns(open, deviceDb, {
      afterCopy: async (id) => {
        if (id === 'busy') await put(deviceDb, STORE.runs, { ...runRows('busy', 30, { sealed: false, saved: false }).meta, bytes: 999 });
      },
    });
    expect(n).toBe(2);
    expect(((await all(open, STORE.runs)) as { runId: string }[]).map((r) => r.runId).sort()).toEqual(['s1', 'u1']);
    expect(((await all(open, STORE.runChunks)) as unknown[]).length).toBe(6);
    expect(((await all(open, STORE.exports)) as { sessionId: string }[]).map((d) => d.sessionId)).toEqual(['s1']);
    expect(((await all(deviceDb, STORE.runs)) as { runId: string }[]).map((r) => r.runId)).toEqual(['busy']);
    expect(await all(deviceDb, STORE.exports)).toEqual([]);
    const m = await moveState(open);
    expect(m).toMatchObject({ total: { runs: 2 }, runs: { saved: ['s1'], pending: false } });
    // Again (a reload): nothing more.
    expect(await moveRuns(open)).toBe(2);
  });

  it('without the flag `runs` the runs stay on the device', async () => {
    await putRun(deviceDb, runRows('s1', 10));
    const { open } = await beginMove('Ole', 'x');
    expect(await moveRuns(open)).toBe(0);
    expect(((await all(deviceDb, STORE.runs)) as unknown[]).length).toBe(1);
  });
});

describe('the page with the flag `runs` on two devices', () => {
  const host = { profiles: { get: async () => null }, settings: { get: () => ({ profile: 'default' }), reload: async () => 'same' } };

  const pageSync = (nameKey: string, server: ServerModel): PageSync =>
    new PageSync(host as never, nameKey, 'Ole', keys, {
      runs: true,
      remote: fetchRemote(modelFetch(server)),
      runRemote: runRemoteFor(server, newLink()),
      body: runBodyPort(keys.dataKey, inlineRunBodyCodec()),
      runsLock: noLock,
    });

  async function page(nameKey: string, server: ServerModel): Promise<{ open: OpenDb; ps: PageSync; lib: RunLibrary }> {
    const open = await prepareAccountSpace(nameKey, { fresh: true, deviceLabel: nameKey });
    const lib = new RunLibrary(new RunStore(await open()), { locks: null, storage: null });
    return { open, ps: pageSync(nameKey, server), lib };
  }

  it('save on A uploads; B lists it remote, fetches it and reads it; a delete on A goes everywhere', async () => {
    writeSpaceRecord({ nameKey: 'ole', state: 'open' });
    resetSpaceForTests();
    const server = new ServerModel().enableRuns();
    // Two devices' spaces in one test: two local names of one account on the server.
    const a = await page('ole', server);
    const b = await page('olb', server);
    const rows = runRows('r1', 1_000_000, { saved: false, n: 5 });
    await putRun(a.open, rows);
    await put(a.open, STORE.exports, doc('r1', 'cut'));
    a.ps.start();
    await until(async () => runsView().on);
    const [s] = await a.lib.listSessions(2_000_000);
    await a.lib.save(s!, 4);
    await until(() => server.bodies.size === 1 && server.all().some((i) => i.kind === 'run' && !i.deleted) && server.all().some((i) => i.kind === 'exportDoc'));
    a.ps.stop();

    b.ps.start();
    await until(async () => ((await all(b.open, STORE.runCloud)) as RunCloudRow[]).some((r) => r.state === 'remote'));
    const [remote] = await b.lib.listSessions(2_000_000, { remote: true });
    expect(remote).toMatchObject({ id: 'r1', saved: true, rating: 4 });
    expect(sessionCloud(remote!, await b.lib.cloudRows()).state).toBe('remote');
    const progress: number[] = [];
    expect(await b.lib.ensureLocal(remote!, (d) => progress.push(d))).toEqual({ ok: true });
    expect(progress.at(-1)).toBeGreaterThan(0);
    const log = await b.lib.chainLog(['r1']);
    expect(log[0]!.text).toBe(rows.chunks.map((c) => c.text).join(''));
    expect(log[0]!.meta.rating).toBe(4);
    expect(((await all(b.open, STORE.exports)) as { title: string }[])[0]!.title).toBe('cut');
    expect((await b.lib.cloudRows()).get('r1')!.state).toBe('up');
    b.ps.stop();

    // Delete on A: the tombstone, then the body.
    a.ps = pageSync('ole', server);
    a.ps.start();
    await until(async () => runsView().on);
    const [sa] = await a.lib.listSessions(2_000_000);
    await a.lib.remove(sa!);
    await until(() => server.bodies.size === 0 && server.all().some((i) => i.kind === 'run' && i.deleted));
    expect((await readMeta(a.open, [RUN_BODY_DELETES]))[RUN_BODY_DELETES]).toBeUndefined();
    a.ps.stop();
    b.ps = pageSync('olb', server);
    b.ps.start();
    await until(async () => ((await all(b.open, STORE.runs)) as unknown[]).length === 0);
    expect(await all(b.open, STORE.runCloud)).toEqual([]);
    expect(await all(b.open, STORE.exports)).toEqual([]);
    b.ps.stop();
  });

  it('a run over the limit stays here as full and says so once, where its save was asked; Log out counts it', async () => {
    writeSpaceRecord({ nameKey: 'ole', state: 'open' });
    resetSpaceForTests();
    const server = new ServerModel().enableRuns();
    server.limits.runBytes = 50;
    const a = await page('ole', server);
    const fits: DoesNotFit[] = [];
    onDoesNotFit((e) => fits.push(e));
    await putRun(a.open, runRows('big', 1_000_000, { saved: false, n: 20 }));
    a.ps.start();
    await until(async () => runsView().on);
    // Saved in play (an Exit): nothing goes until the game is left; then "does not fit" for the start page.
    setPlaying(true);
    const [s] = await a.lib.listSessions(2_000_000);
    await a.lib.save(s!, 2, undefined, { where: 'exit' });
    await until(async () => (await a.lib.cloudRows()).get('big')?.state === 'queued');
    await new Promise((r) => setTimeout(r, 200));
    expect((await a.lib.cloudRows()).get('big')?.state).toBe('queued');
    expect(fits).toEqual([]);
    setPlaying(false);
    await until(() => fits.length === 1);
    expect(fits[0]).toMatchObject({ runId: 'big', sessionId: 'big', limit: 50, reason: 'quota', where: 'start' });
    expect(fits[0]!.size).toBeGreaterThan(50);
    expect((await a.lib.cloudRows()).get('big')!.state).toBe('full');
    expect(server.bodies.size).toBe(0);
    expect(await runCounts(a.open)).toMatchObject({ saved: 1, savedIds: ['big'] });
    expect((await a.ps.unsynced())!.filter((u) => u.kind === 'run')).toEqual([{ kind: 'run', key: 'big', name: null, change: 'new' }]);
    // More room: it goes, without a second dialog.
    server.limits.runBytes = 1_000_000;
    await a.ps.syncNow();
    await until(() => server.bodies.size === 1);
    await until(async () => (await runCounts(a.open)).saved === 0);
    expect(fits).toHaveLength(1);
    a.ps.stop();
  });

  it('a saved run sealed after the game’s sync (the Exit popup’s) goes up at once, not at the next sync (stage 63 C2)', async () => {
    writeSpaceRecord({ nameKey: 'ole', state: 'open' });
    resetSpaceForTests();
    const server = new ServerModel().enableRuns();
    const a = await page('ole', server);
    // The Exit popup saved the live run; the game's end synced before the recorder sealed it.
    await putRun(a.open, runRows('live', 1_000_000, { saved: true, sealed: false }));
    a.ps.start();
    await until(async () => runsView().on);
    await a.ps.syncNow();
    await new Promise((r) => setTimeout(r, 200));
    expect(server.bodies.size).toBe(0);
    // The recorder seals it: the queue takes it now.
    await new RunStore(await a.open()).sealRun('live', 1_000_100);
    await until(() => server.bodies.size === 1);
    expect((await idbRunCloudStore(a.open).get('live'))?.state).toBe('up');
    a.ps.stop();
  });

  it('runs moved at Create account are queued and go up newest first; one that does not fit is counted, not told', async () => {
    writeSpaceRecord({ nameKey: 'ole', state: 'open' });
    resetSpaceForTests();
    const server = new ServerModel().enableRuns();
    await putRun(deviceDb, runRows('old', 1_000, { n: 2 }));
    await putRun(deviceDb, runRows('new', 2_000, { n: 2 }));
    await putRun(deviceDb, runRows('huge', 500, { n: 40 }));
    const { open } = await beginMove('Ole', 'x', Date.now(), { runs: true });
    expect(await moveRuns(open)).toBe(3);
    const order: string[] = [];
    const put0 = server.putBody.bind(server);
    vi.spyOn(server, 'putBody').mockImplementation(async (id, bytes, between) => {
      order.push(id);
      return put0(id, bytes, between);
    });
    const fits: DoesNotFit[] = [];
    onDoesNotFit((e) => fits.push(e));
    const ps = new PageSync(host as never, 'ole', 'Ole', keys, {
      runs: true,
      remote: fetchRemote(modelFetch(server)),
      runRemote: runRemoteFor(server, newLink()),
      body: runBodyPort(keys.dataKey, inlineRunBodyCodec()),
      runsLock: noLock,
    });
    // Room for the two small ones only.
    server.limits.runBytes = 1;
    const sizes = await Promise.all(['old', 'new'].map(async (id) => (await runBodyPort(keys.dataKey, inlineRunBodyCodec()).encode(await sidOf(id), (await idbRunCloudStore(open).rows(id))!)).size));
    server.limits.runBytes = sizes[0]! + sizes[1]! + 10;
    ps.start();
    await until(async () => server.bodies.size === 2 && runsView().notInCloudAfterMove === 1);
    expect(order.slice(0, 2)).toEqual([await sidOf('new'), await sidOf('old')]);
    expect(fits).toEqual([]);
    expect((await readMeta(open, [META.move]))[META.move]).toMatchObject({ total: { runs: 3 } });
    ps.stop();
  });
});
