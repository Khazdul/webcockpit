// Stage 63 (ADR 0153, "The upload queue", "Fetching on open"): the queue
// and the fetch against the in-memory model grown with R2.

import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCOUNT_LIMITS } from '../../shared/cloud/api.ts';
import { deriveKeys, makeRoot, opaqueId } from '../../src/cloud/crypto';
import { inlineRunBodyCodec, runBodyPort } from '../../src/cloud/runs/body-client';
import { ORPHAN_AGE_MS, RunQueue, orphanBodies, runsLockName } from '../../src/cloud/runs/queue';
import type { RunCloudRow, RunQueueEvent, RunRows } from '../../src/cloud/runs/types';
import { RemoteError } from '../../src/cloud/sync/types';
import { MemoryRecords, MemoryRunSpace, ServerModel, newLink, runRemoteFor, type Link, type RunLink } from './cloud-sync-model';

const keys = await deriveKeys(makeRoot());
const sidOf = (runId: string) => opaqueId(keys.idKey, 'run', runId);

function runRows(runId: string, startedUs: number, n = 3): RunRows {
  return {
    meta: { runId, character: 'Gandalf', startedUs, endedUs: startedUs + 10, sealed: true, bytes: n * 10, lines: n, saved: true, rating: 0, savedUs: startedUs + 10, summary: null },
    events: [{ runId, seq: 0, event: { type: 'run_start', us: startedUs } as never }],
    chunks: Array.from({ length: n }, (_, i) => ({ runId, seq: i, firstUs: startedUs + i, lastUs: startedUs + i, text: `${runId} line ${i} ${Math.random()}\n` })),
  };
}

interface Fixture {
  server: ServerModel;
  space: MemoryRunSpace;
  queue: RunQueue;
  link: Link;
  runLink: RunLink;
  events: RunQueueEvent[];
  syncs: { n: number };
  playing: { on: boolean };
  clock: { t: number; now(): number };
  save(runId: string, startedUs: number, n?: number): Promise<void>;
}

async function fixture(server = new ServerModel().enableRuns()): Promise<Fixture> {
  const clock = { t: 1_700_000_000_000, now() { return this.t; } };
  const space = new MemoryRunSpace(new MemoryRecords(), sidOf, clock);
  const link = newLink();
  const runLink: RunLink = {};
  const events: RunQueueEvent[] = [];
  const syncs = { n: 0 };
  const playing = { on: false };
  const queue = new RunQueue({
    store: space,
    body: runBodyPort(keys.dataKey, inlineRunBodyCodec()),
    remote: runRemoteFor(server, link, runLink),
    isPlaying: () => playing.on,
    requestSync: () => void syncs.n++,
    clock,
    events: { emit: (e) => events.push(e) },
    random: () => 0.5,
  });
  const save = async (runId: string, startedUs: number, n = 3) => {
    space.runs.set(runId, runRows(runId, startedUs, n));
    await space.put({ runId, state: 'queued', serverId: await sidOf(runId), size: 0, tries: 0, at: clock.now(), startedUs });
  };
  return { server, space, queue, link, runLink, events, syncs, playing, clock, save };
}

const state = (f: Fixture, id: string): RunCloudRow['state'] | undefined => f.space.cloud.get(id)?.state;

describe('the upload queue', () => {
  it('uploads queued runs newest first, marks them up with their size, and asks for a sync', async () => {
    const f = await fixture();
    await f.save('a', 100);
    await f.save('b', 300);
    await f.save('c', 200);
    const out = await f.queue.run();
    expect(out).toEqual({ type: 'done', uploaded: 3 });
    expect(f.events.filter((e) => e.type === 'uploaded').map((e) => e.runId)).toEqual(['b', 'c', 'a']);
    for (const id of ['a', 'b', 'c']) {
      const row = f.space.cloud.get(id)!;
      expect(row.state).toBe('up');
      expect(row.size).toBe(f.server.bodies.get(row.serverId)!.size);
      expect(row.size).toBeGreaterThan(0);
    }
    expect(f.syncs.n).toBe(3);
    expect(f.server.runBytes).toBe(f.server.storedRunBytes());
    expect(f.queue.room?.usage.runBytes).toBe(f.server.runBytes);
    // Nothing left: a second run sends nothing.
    const before = f.server.requests;
    expect(await f.queue.run()).toEqual({ type: 'done', uploaded: 0 });
    expect(f.server.requests).toBe(before);
    expect(runsLockName('u-olev')).toBe('webcockpit-runs@u-olev');
  });

  it('stops before the next run when a game starts; the upload in flight finishes', async () => {
    const f = await fixture();
    await f.save('a', 100);
    await f.save('b', 200);
    f.runLink.betweenReserveAndStore = async () => {
      f.playing.on = true;
    };
    expect(await f.queue.run()).toEqual({ type: 'playing', uploaded: 1 });
    expect(state(f, 'b')).toBe('up');
    expect(state(f, 'a')).toBe('queued');
    f.runLink.betweenReserveAndStore = undefined;
    expect(await f.queue.run()).toEqual({ type: 'playing', uploaded: 0 });
    f.playing.on = false;
    expect(await f.queue.run()).toEqual({ type: 'done', uploaded: 1 });
  });

  it('413 quota: the run is full, reported once with the numbers, and retried only when there is room', async () => {
    const f = await fixture();
    await f.save('a', 100);
    await f.queue.run();
    const used = f.server.runBytes;
    f.server.limits = { ...DEFAULT_ACCOUNT_LIMITS, runBytes: used + 10 };
    await f.save('b', 200, 20);
    expect(await f.queue.run()).toEqual({ type: 'done', uploaded: 0 });
    const full = f.events.filter((e) => e.type === 'full');
    const row = f.space.cloud.get('b')!;
    expect(row).toMatchObject({ state: 'full', full: 'quota' });
    expect(full).toEqual([{ type: 'full', runId: 'b', used, limit: used + 10, size: row.size, reason: 'quota' }]);
    expect(f.server.runBytes).toBe(used);
    // No room known: it waits; the room known too small: it waits without a request.
    const before = f.server.requests;
    await f.queue.run();
    f.queue.setRoom({ items: 1, itemBytes: 100, runBytes: used }, f.server.limits);
    await f.queue.run();
    expect(f.server.requests).toBe(before);
    expect(f.events.filter((e) => e.type === 'full')).toHaveLength(1);
    // Room (a delete, a higher limit): it goes up.
    f.server.limits = { ...DEFAULT_ACCOUNT_LIMITS };
    f.queue.setRoom({ items: 1, itemBytes: 100, runBytes: used }, f.server.limits);
    expect(await f.queue.run()).toEqual({ type: 'done', uploaded: 1 });
    expect(state(f, 'b')).toBe('up');
    expect(f.space.cloud.get('b')!.full).toBeUndefined();
  });

  it('a quota the room known already says is settled without a request; a full run refused again is not reported again', async () => {
    const f = await fixture();
    f.queue.setRoom({ items: 0, itemBytes: 0, runBytes: 0 }, { ...DEFAULT_ACCOUNT_LIMITS, runBytes: 50 });
    await f.save('a', 100);
    const before = f.server.requests;
    await f.queue.run();
    expect(f.server.requests).toBe(before);
    expect(f.events).toMatchObject([{ type: 'full', runId: 'a', used: 0, limit: 50, reason: 'quota' }]);
    // The room said there is space, the server says not: still one event.
    f.queue.setRoom({ items: 0, itemBytes: 0, runBytes: 0 }, DEFAULT_ACCOUNT_LIMITS);
    f.server.limits = { ...DEFAULT_ACCOUNT_LIMITS, runBytes: 50 };
    await f.queue.run();
    expect(f.events.filter((e) => e.type === 'full')).toHaveLength(1);
    expect(state(f, 'a')).toBe('full');
  });

  it('413 run_too_large: tooLarge, never tried again', async () => {
    const f = await fixture();
    f.server.limits = { ...DEFAULT_ACCOUNT_LIMITS, runMaxBytes: 100 };
    await f.save('a', 100);
    await f.queue.run();
    expect(state(f, 'a')).toBe('tooLarge');
    expect(f.events).toMatchObject([{ type: 'tooLarge', runId: 'a', limit: 100 }]);
    const before = f.server.requests;
    f.server.limits = { ...DEFAULT_ACCOUNT_LIMITS };
    await f.queue.run();
    expect(f.server.requests).toBe(before);
  });

  it('offline, 5xx and a lost PUT back off; 401 ends as a lost session', async () => {
    const f = await fixture();
    await f.save('a', 100);
    f.link.online = false;
    const o1 = await f.queue.run();
    expect(o1).toMatchObject({ type: 'offline', uploaded: 0 });
    expect(o1.type === 'offline' && o1.retryAt).toBe(f.clock.t + 5000);
    expect(f.space.cloud.get('a')).toMatchObject({ state: 'queued', tries: 1 });
    f.link.online = true;
    f.link.fail5xx = 1;
    const o2 = await f.queue.run();
    expect(o2.type === 'server' && o2.retryAt).toBe(f.clock.t + 15000);
    // R2 fails after the reservation: the room is given back.
    f.server.r2Fail = 1;
    expect(await f.queue.run()).toMatchObject({ type: 'server' });
    expect(f.server.runBytes).toBe(0);
    expect(f.space.cloud.get('a')).toMatchObject({ state: 'queued', tries: 3 });
    f.server.ended = 'password';
    expect(await f.queue.run()).toEqual({ type: 'session_ended', reason: 'password', uploaded: 0 });
    f.server.ended = null;
    expect(await f.queue.run()).toEqual({ type: 'done', uploaded: 1 });
    expect(f.space.cloud.get('a')).toMatchObject({ state: 'up', tries: 0 });
    expect(f.queue.retryAt).toBeNull();
  });

  it('two devices uploading at the limit together never pass it', async () => {
    const server = new ServerModel().enableRuns();
    const a = await fixture(server);
    const b = await fixture(server);
    await a.save('a1', 100, 30);
    await b.save('b1', 100, 30);
    // Room for about one of them.
    const probe = await fixture(new ServerModel().enableRuns());
    await probe.save('a1', 100, 30);
    await probe.queue.run();
    server.limits = { ...DEFAULT_ACCOUNT_LIMITS, runBytes: Math.floor(probe.server.runBytes * 1.5) };
    // a's PUT waits between its reservation and its store while b's runs.
    a.runLink.betweenReserveAndStore = async () => {
      a.runLink.betweenReserveAndStore = undefined;
      await b.queue.run();
    };
    await a.queue.run();
    expect([state(a, 'a1'), state(b, 'b1')]).toEqual(['up', 'full']);
    expect(server.peakOverLimit).toBe(0);
    expect(server.runBytes).toBe(server.storedRunBytes());
  });

  it('a run deleted while it went up: its body is deleted again', async () => {
    const f = await fixture();
    await f.save('a', 100);
    f.runLink.betweenReserveAndStore = async () => {
      f.space.deleteRun('a');
    };
    expect(await f.queue.run()).toEqual({ type: 'done', uploaded: 0 });
    expect(f.server.bodies.size).toBe(0);
    expect(f.server.runBytes).toBe(0);
    expect(f.syncs.n).toBe(0);
  });

  it('a row whose run is gone is dropped', async () => {
    const f = await fixture();
    await f.space.put({ runId: 'x', state: 'queued', serverId: await sidOf('x'), size: 0, tries: 0, at: 0, startedUs: 1 });
    expect(await f.queue.run()).toEqual({ type: 'done', uploaded: 0 });
    expect(f.space.cloud.has('x')).toBe(false);
  });

  it('the item refused after the body is up: full with the event, the body deleted, retried when items have room', async () => {
    const f = await fixture();
    await f.save('a', 100);
    await f.queue.run();
    const size = f.space.cloud.get('a')!.size;
    await f.queue.itemRefused('a', 'too_many_items');
    expect(f.space.cloud.get('a')).toMatchObject({ state: 'full', full: 'too_many_items', size });
    expect(f.events.at(-1)).toEqual({ type: 'full', runId: 'a', used: size, limit: DEFAULT_ACCOUNT_LIMITS.runBytes, size, reason: 'too_many_items' });
    expect(f.server.bodies.size).toBe(0);
    expect(f.server.runBytes).toBe(0);
    expect(f.queue.room?.usage.runBytes).toBe(0);
    // Not for a row that is not up.
    await f.queue.itemRefused('a', 'too_many_items');
    expect(f.events.filter((e) => e.type === 'full')).toHaveLength(1);
    // The items full: it waits; room for an item: it goes up again.
    f.queue.setRoom({ items: 2000, itemBytes: 0, runBytes: 0 }, DEFAULT_ACCOUNT_LIMITS);
    expect(await f.queue.run()).toEqual({ type: 'done', uploaded: 0 });
    f.queue.setRoom({ items: 10, itemBytes: 0, runBytes: 0 }, DEFAULT_ACCOUNT_LIMITS);
    expect(await f.queue.run()).toEqual({ type: 'done', uploaded: 1 });
    expect(f.server.bodies.size).toBe(1);
  });

  it('a run while one goes on runs once more after it', async () => {
    const f = await fixture();
    await f.save('a', 100);
    let second: Promise<unknown> | null = null;
    f.runLink.betweenReserveAndStore = async () => {
      f.runLink.betweenReserveAndStore = undefined;
      await f.save('b', 50);
      second = f.queue.run();
    };
    const out = await f.queue.run();
    expect(out).toEqual({ type: 'done', uploaded: 2 });
    expect(await second).toEqual(out);
  });
});

describe('fetching runs', () => {
  /** Device a uploads; device b has the items as remote rows. */
  async function twoDevices() {
    const server = new ServerModel().enableRuns();
    const a = await fixture(server);
    const b = await fixture(server);
    for (const [id, t] of [['r1', 100], ['r2', 200], ['r3', 300]] as const) await a.save(id, t, 40);
    await a.queue.run();
    for (const row of a.space.cloud.values()) {
      const meta = { ...a.space.runs.get(row.runId)!.meta, rating: 5 };
      await b.space.write_('run', { put: [{ runId: row.runId, meta, size: row.size }], remove: [] });
    }
    return { server, a, b };
  }

  it('fetches remote runs with progress, writes them as restore does, the item meta winning', async () => {
    const { a, b } = await twoDevices();
    expect(state(b, 'r1')).toBe('remote');
    const total = ['r1', 'r2'].reduce((n, id) => n + b.space.cloud.get(id)!.size, 0);
    const seen: [number, number][] = [];
    const res = await b.queue.fetchRuns(['r1', 'r2'], (d, t) => seen.push([d, t]));
    expect(res).toEqual({ fetched: ['r1', 'r2'], failed: [] });
    expect(seen[0]).toEqual([0, total]);
    expect(seen.at(-1)).toEqual([total, total]);
    for (let i = 1; i < seen.length; i++) expect(seen[i]![0]).toBeGreaterThanOrEqual(seen[i - 1]![0]);
    for (const id of ['r1', 'r2']) {
      const want = a.space.runs.get(id)!;
      expect(b.space.runs.get(id)).toEqual({ ...want, meta: { ...want.meta, rating: 5 } });
      const row = b.space.cloud.get(id)!;
      expect(row.state).toBe('up');
      expect(row.meta).toBeUndefined();
    }
    expect(state(b, 'r3')).toBe('remote');
    // A run already here is fetched; an unknown one is not remote.
    expect(await b.queue.fetchRuns(['r1', 'zz'])).toEqual({ fetched: ['r1'], failed: [{ runId: 'zz', why: 'not_remote' }] });
  });

  it('a missing or unreadable body leaves its row remote and goes on; offline stops the rest', async () => {
    const { server, b } = await twoDevices();
    const sid1 = b.space.cloud.get('r1')!.serverId;
    const sid2 = b.space.cloud.get('r2')!.serverId;
    server.bodies.delete(sid1);
    // r2's id holds r3's body.
    server.bodies.set(sid2, server.bodies.get(b.space.cloud.get('r3')!.serverId)!);
    const res = await b.queue.fetchRuns(['r1', 'r2', 'r3']);
    expect(res).toEqual({ fetched: ['r3'], failed: [{ runId: 'r1', why: 'missing' }, { runId: 'r2', why: 'unreadable' }] });
    expect([state(b, 'r1'), state(b, 'r2'), state(b, 'r3')]).toEqual(['remote', 'remote', 'up']);
    b.link.online = false;
    await b.space.write_('run', { put: [{ runId: 'r3', meta: b.space.runs.get('r3')!.meta, size: 1 }], remove: [] });
    expect(await b.queue.fetchRuns(['r1', 'r2'])).toEqual({ fetched: [], failed: [{ runId: 'r1', why: 'offline' }, { runId: 'r2', why: 'offline' }] });
    expect([state(b, 'r1'), state(b, 'r2')]).toEqual(['remote', 'remote']);
  });

  it('a run deleted during its fetch is not written; a stale fetching row goes back to remote', async () => {
    const { b } = await twoDevices();
    const remote = runRemoteFor(b.server, b.link);
    const q = new RunQueue({
      store: b.space,
      body: runBodyPort(keys.dataKey, inlineRunBodyCodec()),
      remote: { ...remote, get: async (id, o) => {
        const blob = await remote.get(id, o);
        b.space.deleteRun('r1');
        return blob;
      } },
      isPlaying: () => false,
      requestSync: () => {},
    });
    expect(await q.fetchRuns(['r1'])).toEqual({ fetched: [], failed: [{ runId: 'r1', why: 'not_remote' }] });
    expect(b.space.runs.has('r1')).toBe(false);
    expect(b.space.cloud.has('r1')).toBe(false);
    await b.space.put({ ...b.space.cloud.get('r2')!, state: 'fetching' });
    expect(await b.queue.recover()).toBe(1);
    expect(state(b, 'r2')).toBe('remote');
  });

  it('rethrows a fault of a local port after putting the row back', async () => {
    const { b } = await twoDevices();
    b.space.putFetched = async () => {
      throw new Error('disk');
    };
    await expect(b.queue.fetchRuns(['r1'])).rejects.toThrow('disk');
    expect(state(b, 'r1')).toBe('remote');
  });
});

describe('the check of the bodies', () => {
  it('drops old orphans, keeps young bodies and named ones, and queues an up row whose body is gone', async () => {
    const f = await fixture();
    await f.save('a', 100);
    await f.save('b', 200);
    await f.queue.run();
    const sa = f.space.cloud.get('a')!.serverId;
    const sb = f.space.cloud.get('b')!.serverId;
    // An orphan made long ago, a young one, and b's body gone.
    f.server.bodies.set('O'.repeat(22), { bytes: new Uint8Array(5), size: 5, created: f.clock.t - ORPHAN_AGE_MS - 1 });
    f.server.bodies.set('Y'.repeat(22), { bytes: new Uint8Array(5), size: 5, created: f.clock.t - 1000 });
    f.server.runBytes += 10;
    f.server.removeBody(sb);
    // a is a live item; its body is old, and kept.
    f.server.bodies.get(sa)!.created = 0;
    expect(await f.queue.checkBodies(new Set([sa]))).toEqual({ orphans: 1, requeued: 1 });
    expect([...f.server.bodies.keys()].sort()).toEqual([sa, 'Y'.repeat(22)].sort());
    expect(state(f, 'b')).toBe('queued');
    expect(f.queue.room?.usage.runBytes).toBe(f.server.runBytes);
    expect(await f.queue.run()).toEqual({ type: 'done', uploaded: 1 });
    expect(f.server.bodies.has(sb)).toBe(true);
  });
});

describe('orphans', () => {
  it('are bodies older than a day that no live item or own up row names', () => {
    const now = 10 * ORPHAN_AGE_MS;
    const bodies = [
      { id: 'old', size: 1, created: now - ORPHAN_AGE_MS - 1 },
      { id: 'young', size: 1, created: now - 1000 },
      { id: 'live', size: 1, created: 0 },
    ];
    expect(orphanBodies(bodies, new Set(['live']), now)).toEqual(['old']);
    expect(orphanBodies(bodies, new Set(['live', 'old']), now)).toEqual([]);
  });

  it('the model maps errors as the fetch adapter must', async () => {
    const f = await fixture(new ServerModel());
    await f.save('a', 1);
    // The flag off: 404, a refusal that backs off.
    expect(await f.queue.run()).toMatchObject({ type: 'refused' });
    await expect(runRemoteFor(f.server, f.link).list()).rejects.toBeInstanceOf(RemoteError);
  });
});
