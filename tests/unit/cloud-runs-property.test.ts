// Stage 63 (ADR 0153, "Tests"): generated runs of runs in the cloud. Two
// or three devices of one account save runs, rate them, delete them (here
// or cloud-only), edit their export docs, fetch cloud-only runs, upload
// (sometimes two devices at once at the limit), sync (sometimes with
// another device's sync slipped in), go offline, meet 5xx, a lost R2
// write, a full account (run bytes or items) and a body over the limit,
// and play (no uploads); a run in the account whose body is lost (found
// gone by the check of the bodies) or put back in the queue (as after
// `revived`) is uploaded again into a full account. The devices keep the
// `run` and `exportDoc` kinds
// as the IndexedDB adapter must (`MemoryRunSpace` in cloud-sync-model.ts):
// a run is listed only when up; a pulled run item becomes a remote row; a
// tombstone deletes; an edit that beats a delete puts the body back in the
// queue (`revived`). Then everything back to normal: every device syncs
// and uploads until nothing moves, a day passes, the orphans are dropped,
// and:
//
//   - every device has the same saved runs (here or remote), with the same
//     meta, and the same export docs; so has the server's item log;
//   - every run nobody deleted is there; nothing that is there was never saved;
//   - every live `run` item's body is in R2, of the item's size, and opens
//     to that run; no body is there that no live item names;
//   - the account's run bytes are the bodies' sizes and never passed the limit.
//
// And at every step: no run is deleted in the account (a tombstone) that
// no player deleted (stage 63 review: a run whose upload again ended
// `full` or `tooLarge` was left out of the list, and so deleted on every
// device).
//
// Seeded (mulberry32): a failure names its seed; `RUNS_SEED=<n>` runs one.

import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCOUNT_LIMITS } from '../../shared/cloud/api.ts';
import { deriveKeys, makeRoot } from '../../src/cloud/crypto';
import { decodeRunBody } from '../../src/cloud/runs/body';
import { inlineRunBodyCodec, runBodyPort } from '../../src/cloud/runs/body-client';
import { RunQueue } from '../../src/cloud/runs/queue';
import type { RunQueueEvent, RunRows } from '../../src/cloud/runs/types';
import { ItemCodec } from '../../src/cloud/sync/codec';
import { SyncEngine } from '../../src/cloud/sync/engine';
import { RUN_SPECS, canonicalJson, exportDocSpec, runSpec } from '../../src/cloud/sync/items';
import type { Clock, RunItem, SyncEvent, SyncKeys, SyncOutcome } from '../../src/cloud/sync/types';
import { defaultExportDoc } from '../../src/share/edits';
import { MemoryLocal, MemoryRecords, MemoryRunSpace, RunLocal, ServerModel, newLink, prng, remoteFor, runRemoteFor, type RunLink } from './cloud-sync-model';

const LABELS = ['desktop, Firefox', 'phone', 'tablet'];

class RunDevice {
  readonly records: MemoryRecords;
  readonly space: MemoryRunSpace;
  readonly link = newLink();
  readonly runLink: RunLink = {};
  readonly engine: SyncEngine;
  readonly queue: RunQueue;
  readonly events: SyncEvent[] = [];
  readonly queueEvents: RunQueueEvent[] = [];
  playing = false;
  /** The queue asked for a sync. */
  wantSync = false;
  revived = 0;
  refused = 0;
  /** The run's log (what the space did with the engine's events). */
  note: (s: string) => void = () => {};
  private seen = 0;

  constructor(
    readonly server: ServerModel,
    keys: SyncKeys,
    readonly label: string,
    clock: Clock,
    readonly codec: ItemCodec,
    pageSize?: number,
  ) {
    this.records = new MemoryRecords(label);
    this.space = new MemoryRunSpace(this.records, (id) => codec.serverId('run', id), clock);
    this.engine = new SyncEngine({
      specs: RUN_SPECS,
      yieldToGame: () => Promise.resolve(),
      local: new RunLocal(new MemoryLocal(clock), this.space),
      records: this.records,
      remote: remoteFor(server, this.link),
      keys,
      clock,
      events: { emit: (e) => this.events.push(e) },
      random: () => 0.5,
      ...(pageSize ? { pageSize } : {}),
    });
    this.queue = new RunQueue({
      store: this.space,
      body: runBodyPort(keys.dataKey, inlineRunBodyCodec()),
      remote: runRemoteFor(server, this.link, this.runLink),
      isPlaying: () => this.playing,
      requestSync: () => {
        this.wantSync = true;
      },
      clock,
      events: { emit: (e) => this.queueEvents.push(e) },
      random: () => 0.5,
    });
  }

  /** A sync, then what the space does with its events (as C1's runtime must). */
  async sync(): Promise<SyncOutcome> {
    this.wantSync = false;
    const out = await this.engine.sync();
    for (const e of this.events.slice(this.seen)) {
      if (e.kind === 'run' && e.type !== 'revived' && e.type !== 'full') this.note(`${this.label} ${e.type} ${'key' in e ? e.key : ''}`);
      if (e.type === 'revived' && e.kind === 'run') {
        // An edit here beat a delete elsewhere: the body is put back in the queue (or the item goes again).
        this.revived++;
        this.note(`${this.label} revived ${e.key}`);
        const row = this.space.cloud.get(e.key);
        if (this.space.runs.has(e.key) && row) this.space.cloud.set(e.key, { ...row, state: 'queued' });
        else this.space.cloud.delete(e.key);
      }
      if (e.type === 'full' && e.kind === 'run') {
        // Only a run item new to the account gives its body back.
        const rec = [...this.records.recs.values()].find((r) => r.kind === 'run' && r.key === e.key);
        if (!rec || rec.rev === 0) {
          this.refused++;
          this.note(`${this.label} item refused ${e.key}`);
          await this.queue.itemRefused(e.key, e.error);
        }
      }
    }
    this.seen = this.events.length;
    const st = this.engine.status.get();
    if (out.type === 'synced' && st.usage && st.limits) this.queue.setRoom(st.usage, st.limits);
    if (out.type === 'synced') await this.space.afterSync((sid) => this.queue.removeBody(sid));
    return out;
  }

  /** The queue's check of the bodies, with the live run items this device knows. */
  checkBodies(): Promise<{ orphans: number; requeued: number }> {
    const live = new Set<string>();
    for (const rec of this.records.recs.values()) if (rec.kind === 'run' && rec.rev > 0 && rec.hash !== null) live.add(rec.serverId);
    return this.queue.checkBodies(live);
  }

  /** Saved runs here or remote, by id: the meta (but those of `except`, and those too large here). */
  saved(except: ReadonlySet<string> = new Set()): Map<string, string> {
    const out = new Map<string, string>();
    for (const [id, meta] of this.space.savedRuns()) {
      if (except.has(id) || this.space.cloud.get(id)?.state === 'tooLarge') continue;
      out.set(id, canonicalJson(meta));
    }
    return out;
  }
}

interface Totals {
  steps: number;
  uploads: number;
  fetches: number;
  fulls: number;
  tooLarge: number;
  revived: number;
  refused: number;
  deletes: number;
  orphans: number;
  /** Runs of the account re-uploaded into a full account (a lost body, or put back in the queue). */
  reuploads: number;
}

function rowsOf(runId: string, startedUs: number, n: number, rnd: () => number): RunRows {
  return {
    meta: { runId, character: 'Gandalf', startedUs, endedUs: startedUs + 5, sealed: true, bytes: n * 20, lines: n, saved: true, rating: 0, savedUs: startedUs + 5, summary: null },
    events: [{ runId, seq: 0, event: { type: 'run_start', us: startedUs } as never }],
    chunks: Array.from({ length: n }, (_, i) => ({ runId, seq: i, firstUs: startedUs + i, lastUs: startedUs + i, text: `${runId}:${i}:${rnd().toString(36)}\n` })),
  };
}

async function simulate(seed: number, nDevices: number, steps: number, keys: SyncKeys, codec: ItemCodec): Promise<Totals> {
  const rnd = prng(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)]!;
  const server = new ServerModel().enableRuns();
  const clock = { t: Date.UTC(2026, 10, 14, 12), now() { return this.t; } };
  // The server's clock is the devices' (a body's `created` against the orphan check's day).
  const devices = Array.from({ length: nDevices }, (_, i) => new RunDevice(server, keys, LABELS[i]!, clock, codec, rnd() < 0.5 ? 2 + int(3) : undefined));
  const savedEver = new Set<string>();
  const deletedEver = new Set<string>();
  const log: string[] = [];
  for (const d of devices) d.note = (x) => log.push(`  ${x}`);
  const t: Totals = { steps, uploads: 0, fetches: 0, fulls: 0, tooLarge: 0, revived: 0, refused: 0, deletes: 0, orphans: 0, reuploads: 0 };
  /** Server id → run id of every run saved. */
  const runOf = new Map<string, string>();
  const noUnaskedDelete = (what: string) => {
    for (const it of server.all()) {
      if (it.kind !== 'run' || !it.deleted) continue;
      const id = runOf.get(it.id);
      expect(id !== undefined && deletedEver.has(id), `run ${id} deleted in the account, never by a player (${what}); seed ${seed}\n${log.slice(-40).join('\n')}`).toBe(true);
    }
  };
  let ids = 0;
  let tick = 1;

  const runQueue = async (d: RunDevice, interleave: boolean) => {
    if (interleave) {
      const other = pick(devices.filter((x) => x !== d));
      let once = true;
      d.runLink.betweenReserveAndStore = async () => {
        if (!once) return;
        once = false;
        if (!other.playing) await other.queue.run();
      };
    }
    try {
      await d.queue.run();
    } finally {
      d.runLink.betweenReserveAndStore = undefined;
    }
    expect(server.peakOverLimit, `run bytes passed the limit; seed ${seed}`).toBe(0);
  };
  const syncOne = async (d: RunDevice, interleave: boolean) => {
    if (interleave) {
      const other = pick(devices.filter((x) => x !== d));
      let once = true;
      d.link.beforeWrite = async () => {
        if (!once) return;
        once = false;
        await other.sync();
      };
    }
    try {
      const out = await d.sync();
      // The trigger "after every sync that ends synced".
      if (out.type === 'synced' && !d.playing) await runQueue(d, false);
    } finally {
      d.link.beforeWrite = undefined;
    }
  };

  for (let step = 0; step < steps; step++) {
    clock.t += int(3600_000);
    server.time = Math.max(server.time, clock.t);
    const d = pick(devices);
    const di = devices.indexOf(d);
    const here = [...d.space.runs.keys()];
    const saved = [...d.space.savedRuns().keys()];
    const remote = [...d.space.cloud.values()].filter((r) => r.state === 'remote').map((r) => r.runId);
    const r = rnd();
    if (r < 0.16) {
      const id = `run-${seed}-${++ids}`;
      const rows = rowsOf(id, tick++, 1 + int(40), rnd);
      d.space.runs.set(id, rows);
      d.space.cloud.set(id, { runId: id, state: 'queued', serverId: await codec.serverId('run', id), size: 0, tries: 0, at: clock.t, startedUs: rows.meta.startedUs });
      savedEver.add(id);
      runOf.set(await codec.serverId('run', id), id);
      log.push(`${di} save ${id}`);
      // The trigger "after a save".
      if (!d.playing && rnd() < 0.5) await runQueue(d, nDevices > 1 && rnd() < 0.3);
    } else if (r < 0.28) {
      if (!here.length) continue;
      const id = pick(here);
      const rows = d.space.runs.get(id)!;
      rows.meta = { ...rows.meta, rating: (((rows.meta.rating ?? 0) + 1 + int(4)) % 6) };
      log.push(`${di} rate ${id} ${rows.meta.rating}`);
    } else if (r < 0.34) {
      if (!saved.length) continue;
      const id = pick(saved);
      d.space.deleteByPlayer(id, await codec.serverId('run', id));
      deletedEver.add(id);
      t.deletes++;
      log.push(`${di} delete ${id}`);
    } else if (r < 0.42) {
      if (!saved.length) continue;
      const id = pick(saved);
      d.space.docs.set(id, { ...defaultExportDoc(id), title: `t${tick++}`, excludes: rnd() < 0.5 ? [[1, 2 + int(5)]] : [] });
      log.push(`${di} doc ${id}`);
    } else if (r < 0.5 || (r < 0.6 && remote.length && rnd() < 0.5)) {
      if (!remote.length) continue;
      const id = pick(remote);
      const res = await d.queue.fetchRuns([id]);
      if (res.fetched.length) t.fetches++;
      log.push(`${di} fetch ${id} ${res.failed.map((f) => f.why).join(',') || 'ok'}`);
    } else if (r < 0.6) {
      if (d.playing) continue;
      if (rnd() < 0.2) {
        const c = await d.checkBodies().catch(() => null);
        log.push(`${di} check ${c ? `${c.orphans} orphans, ${c.requeued} requeued` : 'failed'}`);
      }
      await runQueue(d, nDevices > 1 && rnd() < 0.3);
      log.push(`${di} upload`);
    } else if (r < 0.84) {
      const interleave = nDevices > 1 && rnd() < 0.25;
      await syncOne(d, interleave);
      log.push(`${di} sync${interleave ? ' (interleaved)' : ''}`);
    } else if (r < 0.88) {
      d.link.online = !d.link.online;
      log.push(`${di} ${d.link.online ? 'online' : 'offline'}`);
    } else if (r < 0.92) {
      d.playing = !d.playing;
      log.push(`${di} ${d.playing ? 'plays' : 'stops'}`);
    } else if (r < 0.94) {
      if (rnd() < 0.5) d.link.fail5xx = 1 + int(2);
      else server.r2Fail = 1;
      log.push(`${di} 5xx`);
    } else if (r < 0.96) {
      // A run of the account here goes up again into a full account: its body lost (the
      // check of the bodies queues it again) or its row put back in the queue (as after
      // `revived`, the body still there). Neither may delete it anywhere.
      if (d.playing || !d.link.online) continue;
      const mine = [...d.space.runs.keys()].filter((id) => {
        const row = d.space.cloud.get(id);
        const rec = [...d.records.recs.values()].find((x) => x.kind === 'run' && x.key === id);
        return row?.state === 'up' && !!rec && rec.rev > 0 && rec.hash !== null;
      });
      if (!mine.length) continue;
      const id = pick(mine);
      const row = d.space.cloud.get(id)!;
      const lost = rnd() < 0.5;
      if (lost) server.removeBody(row.serverId);
      server.limits = { ...server.limits, runBytes: server.runBytes };
      if (lost) {
        const c = await d.checkBodies().catch(() => null);
        if (!c) continue;
      } else d.space.cloud.set(id, { ...row, state: 'queued' });
      t.reuploads++;
      log.push(`${di} ${lost ? 'body lost' : 'queued again'} ${id}, run limit ${server.limits.runBytes}`);
      await runQueue(d, false);
      await syncOne(d, false);
    } else {
      const which = rnd();
      if (which < 0.5) {
        const tight = server.limits.runBytes === DEFAULT_ACCOUNT_LIMITS.runBytes;
        server.limits = { ...server.limits, runBytes: tight ? server.runBytes + int(3000) : DEFAULT_ACCOUNT_LIMITS.runBytes };
        log.push(`run limit ${server.limits.runBytes}`);
      } else if (which < 0.8) {
        const tight = server.limits.items === DEFAULT_ACCOUNT_LIMITS.items;
        server.limits = { ...server.limits, items: tight ? Math.max(1, server.usage().items) : DEFAULT_ACCOUNT_LIMITS.items };
        log.push(`item limit ${server.limits.items}`);
      } else {
        const tight = server.limits.runMaxBytes === DEFAULT_ACCOUNT_LIMITS.runMaxBytes;
        server.limits = { ...server.limits, runMaxBytes: tight ? 500 : DEFAULT_ACCOUNT_LIMITS.runMaxBytes };
        log.push(`body limit ${server.limits.runMaxBytes}`);
      }
    }
    noUnaskedDelete(`step ${step}`);
  }

  // Everything back to normal; every device syncs and uploads until nothing moves.
  server.limits = { ...DEFAULT_ACCOUNT_LIMITS };
  server.r2Fail = 0;
  for (const d of devices) {
    d.link.online = true;
    d.link.fail5xx = 0;
    d.playing = false;
  }
  const context = () => `seed ${seed}, ${nDevices} devices\n${log.slice(ONE === null ? -40 : 0).join('\n')}`;
  for (let pass = 0; pass < 3; pass++) {
    log.push(`final pass ${pass}`);
    for (const d of devices) {
      expect(await d.sync(), context()).toEqual({ type: 'synced' });
      expect((await d.queue.run()).type, context()).toBe('done');
      if (d.wantSync) expect(await d.sync(), context()).toEqual({ type: 'synced' });
    }
  }
  // A day later the orphans go (a body uploaded whose item never came, a delete made offline).
  clock.t += 2 * 24 * 3600_000;
  server.time = clock.t;
  for (const d of devices) {
    const r = await d.checkBodies();
    t.orphans += r.orphans;
    expect(await d.queue.run(), context()).toMatchObject({ type: 'done' });
  }
  for (let pass = 0; pass < 2; pass++) {
    log.push(`after the orphans, pass ${pass}`);
    for (const d of devices) {
      expect(await d.sync(), context()).toEqual({ type: 'synced' });
      expect(await d.queue.run(), context()).toEqual({ type: 'done', uploaded: 0 });
    }
  }
  noUnaskedDelete('the end');
  const seq = server.seq;
  const bodies = server.bodies.size;
  log.push('last pass');
  for (const d of devices) await d.sync();
  if (process.env.RUNS_DEBUG) console.log('late writes', JSON.stringify(server.all().filter((x) => x.seq > seq).map((x) => [x.kind, x.rev, x.deleted])));
  expect(server.seq, `a last pass still wrote; ${context()}`).toBe(seq);
  expect(server.bodies.size, context()).toBe(bodies);

  if (process.env.RUNS_DEBUG) {
    for (const d of devices) console.log(d.label, JSON.stringify([...d.space.cloud.values()].map((r) => [r.runId, r.state])), JSON.stringify([...d.records.recs.values()].filter((r) => r.kind === 'run').map((r) => [r.key, r.rev, r.hash !== null, r.state])));
    console.log(JSON.stringify(server.all().filter((x) => x.kind === 'run').map((x) => [x.rev, x.deleted])));
  }
  // Every device: the same saved runs with the same meta, the same docs; and the server's log.
  // A run of the account whose body could not go up again (the body limit lowered meanwhile) stays
  // the account's item (deleting it would delete it on every device) and here on the device that
  // has it too large; others may have it only as a remote row whose body is gone.
  const tooLargeHere = new Set<string>();
  for (const d of devices) for (const row of d.space.cloud.values()) if (row.state === 'tooLarge' && d.space.runs.has(row.runId)) tooLargeHere.add(row.runId);
  const first = devices[0]!.saved(tooLargeHere);
  const docs = (d: RunDevice) => [...d.space.docs.values()].filter((x) => d.saved(tooLargeHere).has(x.sessionId)).map((x) => canonicalJson(x)).sort();
  for (const d of devices.slice(1)) {
    expect([...d.saved(tooLargeHere)].sort(), `saved runs differ; ${context()}`).toEqual([...first].sort());
    expect(docs(d), `docs differ; ${context()}`).toEqual(docs(devices[0]!));
  }
  const named = new Set<string>();
  const live = server.all().filter((x) => {
    if (x.kind !== 'run' || x.deleted) return false;
    if (!tooLargeHere.has(runOf.get(x.id) ?? '')) return true;
    if (server.bodies.has(x.id)) named.add(x.id);
    return false;
  });
  expect(live.length, `run items on the server; ${context()}`).toBe(first.size);
  for (const id of savedEver) {
    if (deletedEver.has(id)) continue;
    const tooLarge = devices.some((d) => d.space.cloud.get(id)?.state === 'tooLarge');
    if (!tooLarge) expect(first.has(id), `run ${id} lost; ${context()}`).toBe(true);
  }
  for (const id of first.keys()) expect(savedEver.has(id)).toBe(true);
  // Every live item's body is in R2, of its size, and opens to its run; nothing else is there.
  for (const it of live) {
    const d = await codec.open(runSpec, it.id, it.blob!);
    expect(d.ok, context()).toBe(true);
    const item = (d as unknown as { body: RunItem }).body;
    expect(canonicalJson(item.meta), context()).toBe(first.get(item.runId));
    const body = server.bodies.get(it.id);
    expect(body, `the body of ${item.runId} is missing; ${context()}`).toBeDefined();
    expect(body!.size, context()).toBe(item.size);
    const rows = await decodeRunBody(keys.dataKey, it.id, item.runId, new Blob([body!.bytes as Uint8Array<ArrayBuffer>]));
    expect(rows.meta.runId).toBe(item.runId);
    named.add(it.id);
  }
  expect([...server.bodies.keys()].filter((id) => !named.has(id)), `orphans left; ${context()}`).toEqual([]);
  expect(server.runBytes, context()).toBe(server.storedRunBytes());
  expect(server.peakOverLimit, context()).toBe(0);
  // A local run here is whole: what the device that saved it had (the meta aside).
  for (const d of devices) {
    for (const [id, rows] of d.space.runs) {
      const row = d.space.cloud.get(id);
      expect(row && ['up', 'tooLarge'].includes(row.state), `run ${id} on ${d.label} is ${row?.state}; ${context()}`).toBe(true);
      expect(rows.chunks.every((c) => c.runId === id)).toBe(true);
    }
  }
  const docLive = server.all().filter((x) => x.kind === 'exportDoc' && !x.deleted);
  for (const it of docLive) expect((await codec.open(exportDocSpec, it.id, it.blob!)).ok, context()).toBe(true);

  for (const d of devices) {
    t.uploads += d.queueEvents.filter((e) => e.type === 'uploaded').length;
    t.fulls += d.queueEvents.filter((e) => e.type === 'full').length;
    t.tooLarge += d.queueEvents.filter((e) => e.type === 'tooLarge').length;
    t.revived += d.revived;
    t.refused += d.refused;
  }
  return t;
}

const ONE = process.env.RUNS_SEED ? Number(process.env.RUNS_SEED) : null;
/** `RUNS_SCALE=<n>`: n times the seeds (a longer hunt). */
const SCALE = Number(process.env.RUNS_SCALE ?? 1);

describe('generated runs of runs in the cloud', async () => {
  const keys = await deriveKeys(makeRoot());
  const codec = new ItemCodec(keys);

  for (const [nDevices, base, steps] of [
    [2, 60, 80],
    [3, 30, 150],
  ] as const) {
    const seeds = base * SCALE;
    it(`${nDevices} devices, ${ONE === null ? seeds : 1} seeds of ${steps} steps`, { timeout: 120_000 * SCALE }, async () => {
      const total: Totals = { steps: 0, uploads: 0, fetches: 0, fulls: 0, tooLarge: 0, revived: 0, refused: 0, deletes: 0, orphans: 0, reuploads: 0 };
      const list = ONE !== null ? [ONE] : Array.from({ length: seeds }, (_, i) => 7_000_000 * nDevices + i);
      for (const seed of list) {
        const r = await simulate(seed, nDevices, steps, keys, codec);
        for (const k of Object.keys(total) as (keyof Totals)[]) total[k] += r[k];
      }
      // The runs must meet the cases they are for.
      if (ONE === null) {
        expect(total.fetches).toBeGreaterThan(seeds / 4);
        expect(total.fulls).toBeGreaterThan(seeds / 8);
        expect(total.deletes).toBeGreaterThan(seeds / 4);
        expect(total.tooLarge).toBeGreaterThan(0);
        expect(total.refused).toBeGreaterThan(0);
        expect(total.revived).toBeGreaterThan(0);
        expect(total.reuploads).toBeGreaterThan(seeds / 8);
      }
      console.log(
        `runs property: ${nDevices} devices, ${list.length} seeds, ${total.steps} steps, ${total.uploads} uploads, ${total.fetches} fetches, ${total.fulls} full, ${total.tooLarge} too large, ${total.refused} items refused, ${total.revived} revived, ${total.deletes} deletes, ${total.orphans} orphans, ${total.reuploads} re-uploads into a full account`,
      );
    });
  }
});
