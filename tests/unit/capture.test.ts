import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { Line } from '../../src/core/types';
import {
  formatInbound,
  formatOutbound,
  formatTs,
  localStamp,
  makeRunId,
  runFileName,
  utf8Length,
} from '../../src/capture/format';
import { buildRunBlob } from '../../src/capture/download';
import { CHUNK_BYTES, type LockManagerLike, Recorder, STATUS, runLockName } from '../../src/capture/recorder';
import { RunStore as CaptureStore } from '../../src/runs/store';
import { Session } from '../../src/net/session';
import { OPT_GMCP, WILL } from '../../src/net/telnet';
import { LineAssembler } from '../../src/text/assembler';
import type { RunEvent } from '../../src/runs/events';
import { FakeSocket, IAC, concat, sb, utf8 } from './net-helpers';

class FakeLocks implements LockManagerLike {
  held = new Set<string>();
  request(name: string, _o: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void> | void) {
    if (this.held.has(name)) return Promise.resolve(cb(null));
    this.held.add(name);
    return Promise.resolve(cb({ name })).finally(() => this.held.delete(name));
  }
}

function line(raw: string, ts: number, prompt = false): Line {
  return { text: raw, runs: [], tags: [], prompt, raw, ts };
}

describe('capture format', () => {
  it('matches the Cockpit line format exactly', () => {
    expect(formatTs(1790449245424814)).toBe('1790449245424814');
    expect(formatTs(42)).toBe('0000000000000042');
    expect(formatTs(1790449245424814.7)).toBe('1790449245424814');
    // The one-entry cache: repeats and alternations give the right text.
    expect(formatTs(42)).toBe('0000000000000042');
    expect(formatTs(42)).toBe('0000000000000042');
    expect(formatTs(43)).toBe('0000000000000043');
    expect(formatTs(42)).toBe('0000000000000042');
    expect(formatTs(0)).toBe('0000000000000000');
    expect(formatTs(-0)).toBe('0000000000000000');
    expect(formatOutbound(1790449245424814, 'who')).toBe('1790449245424814 > who\n');
    expect(formatOutbound(1790449245424814, '')).toBe('1790449245424814 > \n');
    expect(formatInbound(1790449247842113, '\x1b[35mA wall.\x1b[0m')).toBe(
      '1790449247842113 \x1b[35mA wall.\x1b[0m\n',
    );
    expect(formatInbound(1790449247842391, 'oO Mana:Hot>')).toBe('1790449247842391 oO Mana:Hot>\n');
    expect(formatInbound(1790449247842391, '')).toBe('1790449247842391 \n');
  });

  it('counts UTF-8 bytes the way TextEncoder encodes them', () => {
    const enc = new TextEncoder();
    for (const str of [
      '',
      'plain ascii',
      'Välkommen — 🐉 till Arda',
      'Åke the Ω ÿ\u00a0\u07ff\u0800\uffff',
      '🐉🐉 \u{10ffff}',
      'lone \ud800 high, lone \udc00 low, swapped \udc00\ud800, end \ud83d',
    ]) {
      expect(utf8Length(str), JSON.stringify(str)).toBe(enc.encode(str).byteLength);
    }
  });

  it('builds run ids and file names', () => {
    const d = new Date(2026, 8, 19, 21, 35, 58);
    expect(localStamp(d)).toBe('2026-09-19T21-35-58');
    expect(makeRunId('Rasta', d)).toBe('Rasta/2026-09-19T21-35-58');
    expect(runFileName('Rasta/2026-09-19T21-35-58')).toBe('Rasta-2026-09-19T21-35-58.log');
  });
});

function setup(
  opts: { factory?: IDBFactory; locks?: LockManagerLike | null; flushMs?: number; chunkBytes?: number } = {},
) {
  const factory = opts.factory ?? new IDBFactory();
  const bus = new Bus();
  const statuses: string[] = [];
  let clock = 1790449245000000;
  const rec = new Recorder(bus, {
    openStore: () => CaptureStore.open(factory),
    locks: opts.locks === undefined ? new FakeLocks() : opts.locks,
    onStatus: (s) => statuses.push(s),
    flushMs: opts.flushMs ?? 60000,
    ...(opts.chunkBytes !== undefined ? { chunkBytes: opts.chunkBytes } : {}),
    win: null,
    now: () => (clock += 1000),
  });
  const play = (name = 'Rasta') => {
    bus.emit('conn.state', { state: 'login', prev: 'connecting' });
    bus.emit('gmcp', { pkg: 'Char.Name', data: { name, fullname: name + ' X' } });
    bus.emit('conn.state', { state: 'playing', prev: 'login' });
  };
  return { factory, bus, rec, statuses, play };
}

describe('Recorder', () => {
  it('writes a burst as several chunks of at most CHUNK_BYTES, in order', async () => {
    const t = setup();
    t.play();
    await t.rec.idle();
    const runId = t.rec.runId!;
    const T = 1790449245000000;
    const body = 'x'.repeat(1000);
    let expected = '';
    for (let k = 0; k < 1300; k++) {
      // ~1.3 MB in one task, as a max-speed burst would arrive.
      t.bus.emit('text.line', line(body + k, T + k));
      expected += formatInbound(T + k, body + k);
    }
    // The size limit wrote the full chunks without a flush or the timer.
    await t.rec.idle();
    const store = (await t.rec.getStore())!;
    const early = await store.chunksFrom(runId, 0, () => true);
    expect(early.length).toBe(5);
    await t.rec.flush();
    const chunks = await store.chunksFrom(runId, 0, () => true);
    expect(chunks.length).toBe(6);
    const enc = new TextEncoder();
    chunks.forEach((c, k) => {
      expect(c.seq).toBe(k);
      expect(enc.encode(c.text).byteLength).toBeLessThanOrEqual(CHUNK_BYTES);
      expect(c.text.endsWith('\n')).toBe(true);
      expect(c.firstUs).toBe(Number(c.text.slice(0, 16)));
      if (k > 0) expect(c.firstUs).toBeGreaterThan(chunks[k - 1]!.lastUs);
    });
    expect(chunks.map((c) => c.text).join('')).toBe(expected);
    expect(await (await buildRunBlob(store, runId)).text()).toBe(expected);
    const meta = (await store.getRun(runId))!;
    expect(meta.lines).toBe(1300);
    expect(meta.bytes).toBe(enc.encode(expected).byteLength);
  });

  it('counts non-ASCII text in UTF-8 bytes, for the meta and the chunk limit', async () => {
    const t = setup({ chunkBytes: 100 });
    t.play();
    await t.rec.idle();
    const runId = t.rec.runId!;
    const T = 1790449245000000;
    const texts = ['Välkommen — 🐉 till Arda', 'Åke the Ω', 'ÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿ', 'ascii', '🐉'.repeat(30)];
    let expected = '';
    texts.forEach((x, k) => {
      t.bus.emit('text.line', line(x, T + k));
      expected += formatInbound(T + k, x);
    });
    t.bus.emit('cmd.sent', { text: 'say hej då', ts: T + 9 });
    expected += formatOutbound(T + 9, 'say hej då');
    await t.rec.flush();
    const store = (await t.rec.getStore())!;
    const chunks = await store.chunksFrom(runId, 0, () => true);
    const enc = new TextEncoder();
    // Lines of 41, 29, 93, 23, 138 and 29 bytes: cut by bytes, not characters;
    // the 138-byte line is a chunk of its own.
    expect(chunks.map((c) => c.text.split('\n').length - 1)).toEqual([2, 1, 1, 1, 1]);
    for (const c of chunks) {
      const n = enc.encode(c.text).byteLength;
      if (c.text.split('\n').length > 2) expect(n).toBeLessThanOrEqual(100);
    }
    expect(chunks.map((c) => c.text).join('')).toBe(expected);
    const meta = (await store.getRun(runId))!;
    expect(meta.bytes).toBe(enc.encode(expected).byteLength);
    expect(meta.lines).toBe(6);
  });

  it('records lines and commands in order, skipping secrets, replayed commands and partials', async () => {
    const t = setup();
    t.play();
    t.bus.emit('text.line', line('oO>', 1790449245424000, true));
    t.bus.emit('cmd.sent', { text: 'who', ts: 1790449245424814 });
    t.bus.emit('cmd.sent', { text: '', ts: 1790449245424815, secret: true });
    t.bus.emit('cmd.sent', { text: 'change width all 500', ts: 1790449245424816, echo: false } as never);
    t.bus.emit('text.partial', line('partial', 1790449245424817));
    t.bus.emit('text.line', line('\x1b[33mAllies\x1b[0m', 1790449245596613));
    t.bus.emit('cmd.sent', { text: 'replayed', ts: 1790449245596650, replay: true });
    t.bus.emit('cmd.sent', { text: '', ts: 1790449245596700 });
    await t.rec.idle();
    const runId = t.rec.runId!;
    expect(runId).toMatch(/^Rasta\/\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d$/);
    expect(t.statuses).toContain(STATUS.recording);
    await t.rec.flush();
    const store = (await t.rec.getStore())!;
    const text = await (await buildRunBlob(store, runId)).text();
    expect(text).toBe(
      '1790449245424000 oO>\n' +
        '1790449245424814 > who\n' +
        '1790449245424816 > change width all 500\n' +
        '1790449245596613 \x1b[33mAllies\x1b[0m\n' +
        '1790449245596700 > \n',
    );
    const meta = (await store.getRun(runId))!;
    expect(meta.lines).toBe(5);
    expect(meta.bytes).toBe(new TextEncoder().encode(text).byteLength);
    expect(meta.sealed).toBe(false);
  });

  it('records inbound GMCP as ESC GMCP records, with the pre-run messages first', async () => {
    const t = setup();
    const T = 1790449245000000;
    t.bus.emit('conn.state', { state: 'connecting', prev: 'idle' });
    t.bus.emit('conn.state', { state: 'login', prev: 'connecting' });
    t.bus.emit('gmcp.raw', { pkg: 'Comm.Channel.List', json: '[{"name":"tells"}]', ts: T + 1 });
    t.bus.emit('gmcp.raw', { pkg: 'Char.Name', json: '{"name":"Rasta"}', ts: T + 2 });
    t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
    t.bus.emit('conn.state', { state: 'playing', prev: 'login' });
    t.bus.emit('gmcp.raw', { pkg: 'Core.Ping', json: '', ts: T + 3 });
    t.bus.emit('gmcp.raw', { pkg: 'Group.Remove', json: '3', ts: T + 4 });
    t.bus.emit('gmcp.raw', { pkg: 'Event.Moved', json: '', ts: T + 5 });
    t.bus.emit('gmcp.raw', { pkg: 'Char.Vitals', json: '{\n"hp":1}', ts: T + 6 });
    await t.rec.flush();
    const text = await (await buildRunBlob((await t.rec.getStore())!, t.rec.runId!)).text();
    expect(text).toBe(
      '1790449245000001 \x1bGMCP Comm.Channel.List [{"name":"tells"}]\n' +
        '1790449245000002 \x1bGMCP Char.Name {"name":"Rasta"}\n' +
        '1790449245000004 \x1bGMCP Group.Remove 3\n' +
        '1790449245000005 \x1bGMCP Event.Moved\n' +
        '1790449245000006 \x1bGMCP Char.Vitals { "hp":1}\n',
    );
  });

  it('records the view (settings, size) at start and debounced changes', async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      t.bus.emit('view.settings', { json: '{"v":1}' });
      t.bus.emit('view.size', { cols: 100, rows: 40 });
      t.bus.emit('view.size', { cols: 120, rows: 40 });
      t.bus.emit('conn.state', { state: 'login', prev: 'connecting' });
      t.bus.emit('gmcp.raw', { pkg: 'Char.Name', json: '{"name":"Rasta"}', ts: 1790449245000002 });
      t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
      t.bus.emit('conn.state', { state: 'playing', prev: 'login' });
      // Changes during the run: only the last one of a burst is written.
      t.bus.emit('view.size', { cols: 90, rows: 30 });
      t.bus.emit('view.size', { cols: 91, rows: 30 });
      vi.advanceTimersByTime(600);
      t.bus.emit('view.settings', { json: '{"v":2}' });
      t.bus.emit('view.settings', { json: '{"v":1}' }); // back to what was written: nothing new
      vi.advanceTimersByTime(600);
      t.bus.emit('view.settings', { json: '{"v":3}' });
      // Leaving playing writes the pending change before sealing.
      t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
      vi.useRealTimers();
      await t.rec.idle();
      const store = (await t.rec.getStore())!;
      const runs = await store.listRuns();
      const text = await (await buildRunBlob(store, runs[0]!.runId)).text();
      const bodies = text
        .trimEnd()
        .split('\n')
        .map((r) => r.slice(17));
      expect(bodies).toEqual([
        '\x1bGMCP Char.Name {"name":"Rasta"}',
        '\x1bVIEW {"v":1}',
        '\x1bSIZE {"cols":120,"rows":40}',
        '\x1bSIZE {"cols":91,"rows":30}',
        '\x1bVIEW {"v":3}',
      ]);
      expect(text.split('\n')[1]!.slice(0, 16)).toBe('1790449245000002');
    } finally {
      vi.useRealTimers();
    }
  });

  it('never records a replay, even when it reaches playing', async () => {
    const t = setup();
    t.bus.emit('conn.state', { state: 'connecting', prev: 'idle', replay: true });
    t.bus.emit('conn.state', { state: 'login', prev: 'connecting', replay: true });
    t.bus.emit('gmcp.raw', { pkg: 'Char.Name', json: '{"name":"Rasta"}', ts: 5 });
    t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
    t.bus.emit('conn.state', { state: 'playing', prev: 'login', replay: true });
    t.bus.emit('text.line', line('replayed', 10));
    await t.rec.idle();
    expect(t.rec.runId).toBeNull();
    expect(await (await t.rec.getStore())!.listRuns()).toEqual([]);
    // A live connection afterwards records, without the replay's GMCP.
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing', replay: true });
    t.bus.emit('conn.state', { state: 'connecting', prev: 'disconnected' });
    t.play();
    t.bus.emit('text.line', line('live', 20));
    await t.rec.flush();
    const text = await (await buildRunBlob((await t.rec.getStore())!, t.rec.runId!)).text();
    expect(text).toBe('0000000000000020 live\n');
  });

  it('does not record before playing', async () => {
    const t = setup();
    t.bus.emit('conn.state', { state: 'login', prev: 'connecting' });
    t.bus.emit('text.line', line('By what name?', 1));
    await t.rec.flush();
    expect(t.rec.runId).toBeNull();
    const store = (await t.rec.getStore())!;
    expect(await store.listRuns()).toEqual([]);
  });

  it('writes chunks with increasing seq on each flush', async () => {
    const t = setup();
    t.play();
    t.bus.emit('text.line', line('a', 10));
    await t.rec.flush();
    t.bus.emit('text.line', line('b', 20));
    t.bus.emit('text.line', line('c', 30));
    await t.rec.flush();
    await t.rec.flush(); // empty buffer: no chunk
    const store = (await t.rec.getStore())!;
    const chunks = await store.getChunks(t.rec.runId!);
    expect(chunks.map((c) => [c.seq, c.firstUs, c.lastUs])).toEqual([
      [0, 10, 10],
      [1, 20, 30],
    ]);
  });

  it('flushes on the timer', async () => {
    const t = setup({ flushMs: 20 });
    t.play();
    t.bus.emit('text.line', line('tick', 10));
    await t.rec.idle();
    const runId = t.rec.runId!;
    await new Promise((r) => setTimeout(r, 80));
    await t.rec.idle();
    const store = (await t.rec.getStore())!;
    expect((await store.getChunks(runId)).length).toBe(1);
    t.rec.dispose();
  });

  it('seals the run on leaving playing and releases the lock', async () => {
    const locks = new FakeLocks();
    const t = setup({ locks });
    t.play();
    t.bus.emit('text.line', line('bye', 10));
    await t.rec.idle();
    const runId = t.rec.runId!;
    expect(locks.held.has(runLockName('Rasta'))).toBe(true);
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing', reason: 'x' });
    await t.rec.idle();
    const store = (await t.rec.getStore())!;
    const meta = (await store.getRun(runId))!;
    expect(meta.sealed).toBe(true);
    expect(meta.endedUs).toBeGreaterThan(meta.startedUs);
    expect((await store.getChunks(runId)).map((c) => c.text)).toEqual(['0000000000000010 bye\n']);
    expect(t.rec.runId).toBeNull();
    expect(locks.held.size).toBe(0);
    t.bus.emit('text.line', line('after', 20));
    await t.rec.flush();
    expect((await store.getChunks(runId)).length).toBe(1);
  });

  it('starts a new run on the next playing', async () => {
    const t = setup();
    t.play();
    await t.rec.idle();
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
    await t.rec.idle();
    const first = (await (await t.rec.getStore())!.listRuns())[0]!.runId;
    t.play();
    await t.rec.idle();
    // Same character within the same second gets a distinct id.
    expect(t.rec.runId).toBe(first + '-2');
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
    t.play('Other');
    await t.rec.idle();
    expect(t.rec.runId).toMatch(/^Other\//);
  });

  it('keeps the lines and events of a run apart from a run that starts before its seal task ran', async () => {
    const listeners = new Set<(e: RunEvent) => void>();
    const emit = (e: RunEvent) => listeners.forEach((fn) => fn(e));
    const factory = new IDBFactory();
    const bus = new Bus();
    let clock = 1790449245000000;
    const rec = new Recorder(bus, {
      openStore: () => CaptureStore.open(factory),
      locks: new FakeLocks(),
      events: { subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)) },
      flushMs: 60000,
      win: null,
      now: () => (clock += 1000),
    });
    const play = () => {
      bus.emit('conn.state', { state: 'login', prev: 'connecting' });
      bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta', fullname: 'Rasta X' } });
      bus.emit('conn.state', { state: 'playing', prev: 'login' });
    };
    play();
    emit({ type: 'run_start', us: 1, character: 'Rasta', schema: 1 });
    bus.emit('text.line', line('first run', 10));
    await rec.idle();
    const first = rec.runId!;
    // Unflushed lines and events, then leave and re-enter playing in the
    // same tick: the second run starts before the first one's seal task.
    bus.emit('text.line', line('first run, late', 20));
    bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
    emit({ type: 'run_end', us: 21 });
    play();
    emit({ type: 'run_start', us: 30, character: 'Rasta', schema: 1 });
    bus.emit('text.line', line('second run', 31));
    await rec.flush();
    const second = rec.runId!;
    expect(second).toBe(first + '-2');
    const store = (await rec.getStore())!;
    const text = async (id: string) => (await store.getChunks(id)).map((c) => c.text).join('');
    expect(await text(first)).toBe('0000000000000010 first run\n0000000000000020 first run, late\n');
    expect(await text(second)).toBe('0000000000000031 second run\n');
    expect((await store.getEvents(first)).map((r) => r.event.type)).toEqual(['run_start', 'run_end']);
    expect((await store.getEvents(second)).map((r) => r.event.type)).toEqual(['run_start']);
    expect((await store.getRun(first))!.sealed).toBe(true);
    expect((await store.getRun(second))!.sealed).toBe(false);
    rec.dispose();
  });

  it('does not record when another tab holds the character lock', async () => {
    const locks = new FakeLocks();
    locks.held.add(runLockName('Rasta'));
    const t = setup({ locks });
    t.play();
    t.bus.emit('text.line', line('x', 1));
    await t.rec.flush();
    expect(t.rec.runId).toBeNull();
    expect(t.rec.status).toBe(STATUS.anotherTab);
    const store = (await t.rec.getStore())!;
    expect(await store.listRuns()).toEqual([]);
  });

  it('reports missing Web Locks and IndexedDB', async () => {
    const t = setup({ locks: null });
    t.play();
    await t.rec.idle();
    expect(t.rec.runId).toBeNull();
    expect(t.rec.status).toBe(STATUS.noLocks);

    const bus = new Bus();
    const rec = new Recorder(bus, {
      openStore: () => Promise.reject(new Error('no idb')),
      locks: new FakeLocks(),
      win: null,
    });
    await rec.idle();
    expect(rec.status).toBe(STATUS.noDb);
  });

  it('seals orphaned runs at their last chunk on start, but not locked ones', async () => {
    const factory = new IDBFactory();
    const store = await CaptureStore.open(factory);
    const base = { endedUs: null, sealed: false, bytes: 0, lines: 0 };
    await store.putRun({ runId: 'A/1', character: 'A', startedUs: 100, ...base });
    await store.appendChunk({ runId: 'A/1', seq: 0, firstUs: 150, lastUs: 180, text: 'x\n' }, 2, 1);
    await store.appendChunk({ runId: 'A/1', seq: 1, firstUs: 190, lastUs: 250, text: 'y\n' }, 2, 1);
    await store.putRun({ runId: 'B/1', character: 'B', startedUs: 300, ...base });
    await store.putRun({ runId: 'C/1', character: 'C', startedUs: 400, ...base });
    const locks = new FakeLocks();
    locks.held.add(runLockName('C'));
    const t = setup({ factory, locks });
    await t.rec.idle();
    const a = (await store.getRun('A/1'))!;
    expect([a.sealed, a.endedUs, a.lines, a.bytes]).toEqual([true, 250, 2, 4]);
    const b = (await store.getRun('B/1'))!;
    expect([b.sealed, b.endedUs]).toEqual([true, 300]);
    expect((await store.getRun('C/1'))!.sealed).toBe(false);
    expect((await store.latestRun())!.runId).toBe('C/1');
  });
});

describe('capture timestamps (live path)', () => {
  it('never go backwards when Char.Name and a prompt share a frame', async () => {
    // Each clock read advances 1 ms, as time passes while a frame is parsed.
    let ms = 1_000;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => (ms += 1));
    try {
      const bus = new Bus();
      const sink = new LineAssembler(bus);
      const sock = new FakeSocket();
      const session = new Session({ bus, sink, socketFactory: () => sock });
      const rec = new Recorder(bus, {
        openStore: () => CaptureStore.open(new IDBFactory()),
        locks: new FakeLocks(),
        flushMs: 60000,
        win: null,
      });
      session.connect();
      sock.open();
      sock.data([IAC, WILL, OPT_GMCP]);
      const GA = 249;
      // One frame: GMCP Char.Name (→ playing → two width commands sent
      // synchronously), then prompt text ending in GA.
      sock.data(
        concat(sb(OPT_GMCP, utf8('Char.Name {"name":"Rasta","fullname":"Rasta X"}')), utf8('oO>'), [IAC, GA]),
      );
      await rec.idle();
      await rec.flush();
      const store = (await rec.getStore())!;
      const text = await (await buildRunBlob(store, rec.runId!)).text();
      const rows = text.trimEnd().split('\n');
      expect(rows.map((r) => r.slice(r.indexOf(' ') + 1))).toEqual([
        '\x1bGMCP Char.Name {"name":"Rasta","fullname":"Rasta X"}',
        '> change width all 500',
        '> change width table terminal',
        'oO>',
      ]);
      const ts = rows.map((r) => Number(r.slice(0, r.indexOf(' '))));
      for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1]!);
      // All four events came from the one frame and carry its time.
      expect(new Set(ts).size).toBe(1);
      rec.dispose();
    } finally {
      spy.mockRestore();
    }
  });
});
