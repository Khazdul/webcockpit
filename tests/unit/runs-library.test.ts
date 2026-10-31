import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { RunMeta } from '../../src/capture/store';
import { type LockManagerLike, Recorder } from '../../src/capture/recorder';
import { type RunEvent, RunEventDeriver } from '../../src/runs/events';
import { BadBackupError, RunLibrary, SWEEP_LOCK, backupFileName } from '../../src/runs/library';
import { LiveRuns } from '../../src/runs/live';
import { DAY_US } from '../../src/runs/stitch';
import { RunStore } from '../../src/runs/store';
import { FakeScheduler } from '../../src/script/engine/timers';

class FakeLocks implements LockManagerLike {
  held = new Set<string>();
  request(name: string, _o: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void> | void) {
    if (this.held.has(name)) return Promise.resolve(cb(null));
    this.held.add(name);
    return Promise.resolve(cb({ name })).finally(() => this.held.delete(name));
  }
}

const H = 3600e6;
const T = 1_790_000_000_000_000;

function meta(id: string, startedUs: number, over: Partial<RunMeta> = {}): RunMeta {
  return {
    runId: id,
    character: id.split('/')[0]!,
    startedUs,
    endedUs: startedUs + H,
    sealed: true,
    bytes: 6,
    lines: 1,
    summary: { startUs: startedUs, lastEventUs: startedUs + H, kills: 1, pkills: 0, deaths: 0 },
    ...over,
  };
}

async function seed(store: RunStore, m: RunMeta, events: RunEvent[] = [], text = '1 hi\n'): Promise<void> {
  await store.putWholeRun(
    m,
    events.map((event, seq) => ({ runId: m.runId, seq, event })),
    text ? [{ runId: m.runId, seq: 0, firstUs: m.startedUs, lastUs: m.startedUs, text }] : [],
  );
}

async function lib(factory = new IDBFactory(), locks: LockManagerLike | null = new FakeLocks()) {
  const l = await RunLibrary.open(factory, { locks, storage: { estimate: async () => ({ usage: 10, quota: 100 }) } });
  return { l, store: l.store, factory, locks };
}

describe('RunLibrary', () => {
  it('lists sealed sessions newest first, characters, events and the chain log', async () => {
    const { l, store } = await lib();
    const e1: RunEvent[] = [
      { type: 'run_start', us: T, character: 'Rasta', schema: 1 },
      { type: 'kill', us: T + 5, logUs: T + 4, mobName: 'a', xpDelta: 1 },
    ];
    await seed(store, meta('Rasta/1', T), e1, 'a\n');
    await seed(store, meta('Rasta/2', T + H + 60e6, { summary: { startUs: T + H + 60e6, lastEventUs: T + 2 * H, kills: 0, pkills: 0, deaths: 0, previousRunId: 'Rasta/1' } }), [
      { type: 'run_start', us: T + H + 60e6, character: 'Rasta', schema: 1 },
    ], 'b\n');
    await seed(store, meta('Gittan/1', T + 3 * H));
    await seed(store, meta('Melker/1', T + 4 * H, { sealed: false, endedUs: null })); // live elsewhere
    const s = await l.listSessions(T + 5 * H);
    expect(s.map((x) => [x.id, x.runs.length])).toEqual([
      ['Gittan/1', 1],
      ['Rasta/1', 2],
    ]);
    expect(await l.characters()).toEqual(['Gittan', 'Rasta']);
    expect((await l.events(['Rasta/1', 'Rasta/2'])).map((e) => e.type)).toEqual(['run_start', 'kill', 'run_start']);
    expect((await l.chainLog(['Rasta/1', 'Rasta/2'])).map((x) => x.text)).toEqual(['a\n', 'b\n']);
    expect(await l.chainOf('Melker/1', T)).toMatchObject({ id: 'Melker/1' });
    expect(await l.chainOf('Rasta/2', T)).toMatchObject({ id: 'Rasta/1' });
    expect(await l.estimate()).toEqual({ usage: 10, quota: 100 });
    expect(backupFileName(new Date(2026, 8, 27, 23, 1))).toBe('webcockpit-runs-2026-09-27.jsonl.gz');
  });

  it('saves and rates whole chains and removes them with their events and chunks', async () => {
    const { l, store } = await lib();
    await seed(store, meta('Rasta/1', T, { rating: 2, saved: true }));
    await seed(store, meta('Rasta/2', T + H, { summary: { startUs: T + H, lastEventUs: T + 2 * H, kills: 0, pkills: 0, deaths: 0, previousRunId: 'Rasta/1' } }), [
      { type: 'run_start', us: T + H, character: 'Rasta', schema: 1 },
    ]);
    let [s] = await l.listSessions(T);
    expect(s).toMatchObject({ saved: true, rating: 2, runs: [{}, {}] });
    await l.save(s!, undefined, T + 1);
    let runs = await store.listRuns();
    expect(runs.map((r) => [r.saved, r.rating, r.savedUs])).toEqual([
      [true, 2, T + 1],
      [true, 0, T + 1],
    ]);
    [s] = await l.listSessions(T);
    await l.save(s!, 5);
    [s] = await l.listSessions(T);
    expect(s).toMatchObject({ saved: true, rating: 5, expiresDays: null });
    await l.remove(s!);
    expect(await store.listRuns()).toEqual([]);
    expect(await store.getEvents('Rasta/2')).toEqual([]);
    expect(await store.getChunks('Rasta/1')).toEqual([]);
  });

  it('sweeps: seals free orphans, deletes old unsaved runs, keeps saved and recent ones', async () => {
    const { l, store, locks } = await lib();
    const now = T + 20 * DAY_US;
    await seed(store, meta('A/old', T));
    await seed(store, meta('A/saved', T + H, { saved: true, rating: 0 }));
    await seed(store, meta('A/recent', now - 2 * DAY_US));
    await seed(store, meta('B/orphan', now - DAY_US, { sealed: false, endedUs: null }), [
      { type: 'run_start', us: now - DAY_US, character: 'B', schema: 1 },
    ]);
    await seed(store, meta('C/short', now - DAY_US, { sealed: false, endedUs: null, summary: null }));
    await seed(store, meta('D/busy', now - DAY_US, { sealed: false, endedUs: null }));
    (locks as FakeLocks).held.add('webcockpit-run-D');
    expect(await l.sweep(now)).toBe(2); // A/old and C/short
    const runs = await store.listRuns();
    expect(runs.map((r) => r.runId).sort()).toEqual(['A/recent', 'A/saved', 'B/orphan', 'D/busy']);
    const orphan = runs.find((r) => r.runId === 'B/orphan')!;
    expect(orphan).toMatchObject({ sealed: true, endedUs: now - DAY_US });
    expect((await store.getEvents('B/orphan')).map((e) => e.event)).toEqual([
      { type: 'run_start', us: now - DAY_US, character: 'B', schema: 1 },
      { type: 'orphan_close', us: now },
    ]);
    expect(runs.find((r) => r.runId === 'D/busy')!.sealed).toBe(false);
    // Another tab sweeping: nothing happens here.
    (locks as FakeLocks).held.add(SWEEP_LOCK);
    await seed(store, meta('A/old2', T));
    expect(await l.sweep(now)).toBe(0);
    expect((await store.listRuns()).some((r) => r.runId === 'A/old2')).toBe(true);
  });

  it('backs up all sealed runs and restores them, skipping ones already present', async () => {
    const { l, store } = await lib();
    const ev: RunEvent[] = [
      { type: 'run_start', us: T, character: 'Rasta', xp: 5, schema: 1 },
      { type: 'pkill', us: T + 2, logUs: T + 1, name: 'Ibuki', race: 'the Half-Elf', xpDelta: 3 },
    ];
    await seed(store, meta('Rasta/1', T, { saved: true, rating: 4, savedUs: T }), ev, '1790000000000000 \x1b[31m*Ibuki*\x1b[0m\n1790000000000001 > kill\n');
    await seed(store, meta('Gittan/1', T + H));
    await seed(store, meta('Live/1', T + H, { sealed: false, endedUs: null }));
    const blob = await l.backup(T + 5);
    const text = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const lines = text.trim().split('\n').map((x) => JSON.parse(x) as { type: string });
    expect(lines[0]).toEqual({ type: 'webcockpit-runs', schema: 1, exportedUs: T + 5 });
    expect(lines.map((x) => x.type)).toEqual(['webcockpit-runs', 'run', 'event', 'event', 'chunk', 'run', 'chunk']);

    const other = await lib();
    expect(await other.l.restore(blob)).toEqual({ added: 2, skipped: 0 });
    for (const id of ['Rasta/1', 'Gittan/1']) {
      expect(await other.store.getRun(id)).toEqual(await store.getRun(id));
      expect(await other.store.getChunks(id)).toEqual(await store.getChunks(id));
      expect(await other.store.getEvents(id)).toEqual(await store.getEvents(id));
    }
    expect(await other.l.restore(blob)).toEqual({ added: 0, skipped: 2 });
    const [s] = await other.l.listSessions(T);
    expect(s).toMatchObject({ saved: false });
  });

  it('rejects a bad file before writing anything', async () => {
    const { l, store } = await lib();
    const gz = (s: string) => new Blob([gzipSync(Buffer.from(s))]);
    const head = JSON.stringify({ type: 'webcockpit-runs', schema: 1, exportedUs: 1 }) + '\n';
    const good = JSON.stringify({ type: 'run', run: meta('X/1', T) }) + '\n';
    const bad = [
      new Blob(['not gzip at all']),
      gz('{"hello":1}\n'),
      gz(head + good + '{broken\n'),
      gz(head + good + JSON.stringify({ type: 'event', runId: 'Y/1', seq: 0, event: { type: 'kill', us: 1 } }) + '\n'),
      gz(head + good + JSON.stringify({ type: 'chunk', runId: 'X/1', seq: 0, firstUs: 1, lastUs: 2 }) + '\n'),
      gz(head + JSON.stringify({ type: 'run', run: { runId: 'Z/1' } }) + '\n'),
      gz(head + good + JSON.stringify({ type: 'surprise' }) + '\n'),
      gz(''),
    ];
    for (const b of bad) await expect(l.restore(b)).rejects.toBeInstanceOf(BadBackupError);
    expect(await store.listRuns()).toEqual([]);
    expect(await l.restore(gz(head + good))).toEqual({ added: 1, skipped: 0 });
  });
});

// ------------------------------------------------------------- recorder

function recorderSetup(factory = new IDBFactory(), locks = new FakeLocks()) {
  const bus = new Bus();
  const sched = new FakeScheduler();
  let ms = T / 1000;
  const deriver = new RunEventDeriver({ now: () => ms, scheduler: sched }).attach(bus);
  const rec = new Recorder(bus, {
    openStore: () => RunStore.open(factory),
    locks,
    flushMs: 60000,
    win: null,
    now: () => ms * 1000,
    events: deriver,
  });
  const runs = new LiveRuns({ deriver, recorder: rec, nowUs: () => ms * 1000 });
  const gmcp = (pkg: string, data: unknown) => {
    bus.emit('gmcp.raw', { pkg, json: JSON.stringify(data), ts: ms * 1000 });
    bus.emit('gmcp', { pkg, data });
  };
  const play = (name = 'Rasta') => {
    bus.emit('conn.state', { state: 'connecting', prev: 'idle' });
    bus.emit('conn.state', { state: 'login', prev: 'connecting' });
    gmcp('Char.Name', { name });
    bus.emit('conn.state', { state: 'playing', prev: 'login' });
  };
  const line = (text: string) => deriver.onLine(text, ms * 1000);
  const quit = () => bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
  const advance = (m: number) => {
    ms += m;
    sched.advance(m);
  };
  return { bus, rec, deriver, runs, gmcp, play, line, quit, advance, factory, locks };
}

describe('Recorder with run events', () => {
  it('deletes a run that never reached Char.Vitals', async () => {
    const t = recorderSetup();
    t.play();
    t.bus.emit('text.line', { text: 'hi', raw: 'hi', runs: [], tags: [], prompt: false, ts: T });
    await t.rec.idle();
    expect(t.rec.runId).not.toBeNull();
    t.quit();
    await t.rec.idle();
    const store = (await t.rec.getStore())!;
    expect(await store.listRuns()).toEqual([]);
    expect(t.rec.lastRun).toBeNull();
  });

  it('writes events with a summary, run_end at the seal, and links the next run', async () => {
    const t = recorderSetup();
    t.play();
    t.gmcp('Char.Vitals', { xp: 1000, tp: 10 });
    expect(t.runs.current()).toMatchObject({ events: [{ type: 'run_start' }] });
    t.gmcp('Char.Vitals', { xp: 1100 });
    t.line('A guard is dead! R.I.P.');
    t.advance(500);
    await t.rec.flush();
    const store = (await t.rec.getStore())!;
    const id1 = t.rec.runId!;
    expect(t.runs.current()!.runId).toBe(id1);
    expect((await store.getRun(id1))!.summary).toMatchObject({ kills: 1, xp: 1100, tp: 10 });
    t.advance(60_000);
    t.quit();
    await t.rec.idle();
    expect(t.runs.current()).toBeNull();
    const m1 = (await store.getRun(id1))!;
    expect(m1.sealed).toBe(true);
    expect((await store.getEvents(id1)).map((r) => [r.seq, r.event.type])).toEqual([
      [0, 'run_start'],
      [1, 'kill'],
      [2, 'run_end'],
    ]);
    expect(m1.summary!.lastEventUs).toBe(T + 60_500_000);
    expect(t.rec.lastRun).toBe(id1);

    t.advance(5 * 60_000);
    t.play();
    t.gmcp('Char.Vitals', { xp: 1100 });
    await t.rec.flush();
    const id2 = t.rec.runId!;
    expect((await store.getEvents(id2))[0]!.event).toMatchObject({ type: 'run_start', previousRunId: id1 });
    const chain = await t.runs.chain();
    expect(chain!.runs.map((r) => r.runId)).toEqual([id1, id2]);
    expect((await t.runs.chainEvents()).map((e) => e.type)).toEqual(['run_start', 'kill', 'run_end', 'run_start']);
  });

  it('closes an orphan with orphan_close and deletes an orphan that never started', async () => {
    const factory = new IDBFactory();
    const locks = new FakeLocks();
    const a = recorderSetup(factory, locks);
    a.play('Rasta');
    a.gmcp('Char.Vitals', { xp: 1 });
    await a.rec.flush();
    const orphan = a.rec.runId!;
    const b = recorderSetup(factory, locks);
    b.play('Gittan');
    await b.rec.flush();
    const short = b.rec.runId!;
    // Both tabs crash: their locks are free, nothing was sealed.
    locks.held.clear();
    const c = recorderSetup(factory, locks);
    await c.rec.idle();
    const store = (await c.rec.getStore())!;
    const runs = await store.listRuns();
    expect(runs.map((r) => r.runId)).toEqual([orphan]);
    expect(runs[0]!.sealed).toBe(true);
    expect((await store.getEvents(orphan)).map((r) => r.event.type)).toEqual(['run_start', 'orphan_close']);
    expect(await store.getRun(short)).toBeUndefined();
  });

  it('Exit rating: > 0 saves the chain, 0 only re-saves a saved chain', async () => {
    const t = recorderSetup();
    t.play();
    t.gmcp('Char.Vitals', { xp: 1 });
    await t.rec.flush();
    await t.runs.saveChain(0);
    const store = (await t.rec.getStore())!;
    expect((await store.getRun(t.rec.runId!))!.saved).toBeFalsy();
    await t.runs.saveChain(3);
    const id1 = t.rec.runId!;
    expect((await store.getRun(id1))!).toMatchObject({ saved: true, rating: 3 });
    t.quit();
    await t.rec.idle();
    t.advance(60_000);
    t.play();
    t.gmcp('Char.Vitals', { xp: 1 });
    await t.runs.saveChain(0);
    const id2 = t.rec.runId!;
    expect((await store.getRun(id2))!).toMatchObject({ saved: true, rating: 0 });
    expect((await t.runs.chain())!).toMatchObject({ saved: true, rating: 3 });
    // Disconnected: the anchor is the latest run of this tab.
    t.quit();
    await t.rec.idle();
    await t.runs.saveChain(5);
    expect((await store.getRun(id1))!.rating).toBe(5);
    expect((await store.getRun(id2))!.rating).toBe(5);
  });

  it('latest(): the run in progress or the one that ended, with its id; null before any run (ADR 0109)', async () => {
    const t = recorderSetup();
    expect(t.runs.latest()).toBeNull();
    t.play();
    t.gmcp('Char.Vitals', { xp: 1000 });
    t.line('A guard is dead! R.I.P.');
    t.advance(500);
    await t.rec.flush();
    const id = t.rec.runId!;
    expect(t.runs.latest()).toMatchObject({ runId: id, ended: false });
    t.quit();
    await t.rec.idle();
    const l = t.runs.latest()!;
    expect(l).toMatchObject({ runId: id, ended: true });
    expect(l.events.map((e) => e.type)).toEqual(['run_start', 'kill', 'run_end']);
    expect(t.runs.anchor()).toBe(id);
  });
});
