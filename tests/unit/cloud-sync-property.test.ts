// Stage 61 (spec §7.4 "Tests", ADR 0151): generated runs of the sync
// engine. Two or three devices of one account do random creates, edits,
// renames, deletes and script toggles, go offline, play (items in use),
// meet 5xx and a storage limit, and sync at random, sometimes with another
// device's sync slipped in between a pull and a push. Then everybody syncs
// twice with nothing else going on, and:
//
//   - every sync of the last pass ends `synced`, and the last pass changes nothing;
//   - all devices hold the same items (key, name, every field), and so does the server;
//   - no edit is lost: every version a player wrote that nobody overwrote
//     or deleted after seeing it is on every device (keep-both copies count);
//   - nothing is there twice, and nothing that was overwritten or deleted
//     by a player who saw it comes back (a delete wins over an unedited item);
//   - names are unique and valid (MemoryLocal refuses anything else).
//
// Stage 62 (ADR 0152) adds the small kinds: settings, scriptData and
// timers (last writer: everybody ends with the same version, one some
// player wrote) and comm (merge): devices append messages to the day's
// piece (or a `.2` piece), sometimes while the engine is writing, and in
// the end every message of a kept day is on every device and the server
// exactly once, and every day past `commDayKept` (8 days 6 hours) is on none of them.
//
// Seeded (mulberry32): a failure names its seed; `SYNC_SEED=<n>` runs one.

import { describe, expect, it } from 'vitest';
import { deriveKeys, makeRoot } from '../../src/cloud/crypto';
import { ItemCodec } from '../../src/cloud/sync/codec';
import { ITEM_SPECS, SYNC_SPECS, canonicalJson, commIdentity, utcDay } from '../../src/cloud/sync/items';
import type { Body, CommItem, CommPieceRecord, SyncKeys } from '../../src/cloud/sync/types';
import { DEFAULT_ACCOUNT_LIMITS } from '../../shared/cloud/api.ts';
import { Device, ServerModel, commDayKept, keyOf, prng, validName } from './cloud-sync-model';

const KINDS = ['profile', 'script'] as const;
type Kind = (typeof KINDS)[number];
/** The last-writer kinds and the local keys the runs use. */
const SMALL = {
  settings: ['desktop', 'tablet', 'phone'],
  scriptData: ['finder', 'mapper', 'looter'],
  timers: ['Gandalf', 'Frodo'],
} as const;
type Small = keyof typeof SMALL;
const SMALL_KINDS = Object.keys(SMALL) as Small[];

function smallBody(kind: Small, key: string, t: number, label: string): Body {
  if (kind === 'settings') return { type: key, record: { version: 6, look: `l${t}` }, from: label };
  if (kind === 'scriptData') return { name: key, settings: { n: t }, store: { s: `x${t}` }, ...(t % 2 ? { enabled: t % 4 === 1 } : {}) };
  return { character: key, savedAt: t, state: { v: 1, n: t } };
}

/** A small kind's version as a player wrote it (settings' `from` is not part of it, as it is not hashed). */
const smallPrint = (kind: Small, b: Body): string => `${kind}:${canonicalJson(kind === 'settings' ? { ...b, from: undefined } : b)}`;
const NAMES = ['warrior', 'mage', 'healer', 'thief', 'ranger', 'bard'];
const LABELS = ['desktop, Firefox', 'phone', 'tablet'];

/** A version's identity: everything but the key and the name (a keep-both copy and a renamed item keep it). */
function fingerprint(kind: Kind, b: Body): string {
  const { id: _i, name: _n, ...rest } = b;
  return `${kind}:${canonicalJson(rest)}`;
}

interface Run {
  steps: number;
  syncs: number;
  conflicts: number;
  /** Comm messages written, and days that aged out. */
  comm: number;
  oldDays: number;
  merges: number;
}

async function simulate(seed: number, nDevices: number, steps: number, keys: SyncKeys): Promise<Run> {
  const rnd = prng(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)]!;
  const server = new ServerModel();
  const clock = { t: new Date(2026, 10, 14, 12).getTime(), now() { return this.t; } };
  // Comm's merges are counted (the runs must meet them).
  let merges = 0;
  const specs = SYNC_SPECS.map((sp) =>
    sp.merge
      ? {
          ...sp,
          merge: (l: Body, r: Body) => {
            merges++;
            return sp.merge!(l, r);
          },
        }
      : sp,
  );
  // Half the devices pull in pages of 2–5, so `more` and the cursor are walked.
  const devices = Array.from({ length: nDevices }, (_, i) => new Device(server, keys, LABELS[i]!, clock, rnd() < 0.5 ? { specs, pageSize: 2 + int(4) } : { specs }));
  const written = new Set<string>();
  const superseded = new Set<string>();
  const smallWritten = new Set<string>();
  /** Every Comm message a device wrote: its piece and identity. */
  const comms: { day: string; id: string }[] = [];
  let msgs = 0;
  let tick = 1;
  let ids = 0;
  let syncs = 0;
  const log: string[] = [];

  const freeName = (d: Device, kind: Kind): string | null => {
    const taken = new Set(d.names(kind));
    const free = NAMES.filter((n) => !taken.has(n));
    return free.length ? pick(free) : null;
  };
  const write = (d: Device, kind: Kind, b: Body, old?: Body) => {
    if (old) superseded.add(fingerprint(kind, old));
    written.add(fingerprint(kind, b));
    d.local.set(kind, b);
  };
  const say = (d: Device) => {
    const t = clock.t + ++msgs;
    const day = utcDay(t) + (rnd() < 0.2 ? '.2' : '');
    const rec: CommPieceRecord = { character: d.label, ts: t, channel: 'tell', talker: pick(NAMES), talkerType: rnd() < 0.5 ? null : 'player', destination: null, text: `m${msgs}` };
    d.local.append(day, rec);
    comms.push({ day, id: commIdentity(rec) });
  };
  const syncOne = async (d: Device, interleave: boolean) => {
    syncs++;
    // Sometimes the game writes a message while the engine writes the stores.
    if (rnd() < 0.2) {
      let once = true;
      d.local.beforeWrite = () => {
        if (!once) return;
        once = false;
        say(d);
      };
    }
    if (interleave) {
      const other = pick(devices.filter((x) => x !== d));
      let once = true;
      d.link.beforeWrite = async () => {
        if (!once) return;
        once = false;
        syncs++;
        await other.sync();
      };
    }
    try {
      await d.sync();
    } finally {
      d.link.beforeWrite = undefined;
      d.local.beforeWrite = undefined;
    }
  };

  for (let step = 0; step < steps; step++) {
    clock.t += int(8 * 3600_000); // 4 h on average: a run spans some ten days, past the 8 d 6 h a Comm day is listed
    const d = pick(devices);
    const di = devices.indexOf(d);
    if (rnd() < 0.3) {
      // The small kinds.
      const r = rnd();
      if (r < 0.4) {
        say(d);
        log.push(`${di} says`);
      } else {
        const kind = pick(SMALL_KINDS);
        const key = pick(SMALL[kind]);
        if (r < 0.92) {
          const b = smallBody(kind, key, tick++, d.label);
          smallWritten.add(smallPrint(kind, b));
          d.local.set(kind, b);
          log.push(`${di} write ${kind} ${key}`);
        } else {
          d.local.del(kind, key);
          log.push(`${di} delete ${kind} ${key}`);
        }
      }
      continue;
    }
    const kind = pick(KINDS);
    const items = d.list(kind);
    const r = rnd();
    if (r < 0.14) {
      const name = freeName(d, kind);
      if (!name) continue;
      const t = tick++;
      const id = `${kind[0]}-${seed}-${++ids}`;
      const b: Body =
        kind === 'profile' ? { id, name, text: `t${t}`, created: t, modified: t } : { id, name, source: `s${t}`, enabled: rnd() < 0.5, created: t, updated: t };
      write(d, kind, b);
      log.push(`${di} create ${kind} ${name} t${t}`);
    } else if (r < 0.36) {
      if (!items.length) continue;
      const old = pick(items);
      const t = tick++;
      write(d, kind, kind === 'profile' ? { ...old, text: `t${t}`, modified: t } : { ...old, source: `s${t}`, updated: t }, old);
      log.push(`${di} edit ${kind} ${old.name as string} t${t}`);
    } else if (r < 0.46) {
      if (!items.length) continue;
      const old = pick(items);
      const name = freeName(d, kind);
      if (!name) continue;
      const t = tick++;
      write(d, kind, kind === 'profile' ? { ...old, name, modified: t } : { ...old, name, updated: t }, old);
      log.push(`${di} rename ${kind} ${old.name as string} → ${name} t${t}`);
    } else if (r < 0.54) {
      if (!items.length) continue;
      const old = pick(items);
      superseded.add(fingerprint(kind, old));
      d.local.del(kind, old.id as string);
      log.push(`${di} delete ${kind} ${old.name as string}`);
    } else if (r < 0.58) {
      const scripts = d.list('script');
      if (!scripts.length) continue;
      const old = pick(scripts);
      write(d, 'script', { ...old, enabled: !old.enabled, updated: tick++ }, old);
      log.push(`${di} toggle ${old.name as string}`);
    } else if (r < 0.86) {
      const interleave = nDevices > 1 && rnd() < 0.25;
      await syncOne(d, interleave);
      log.push(`${di} sync${interleave ? ' (interleaved)' : ''}`);
    } else if (r < 0.91) {
      d.link.online = !d.link.online;
      log.push(`${di} ${d.link.online ? 'online' : 'offline'}`);
    } else if (r < 0.96) {
      if (d.using.size) d.using.clear();
      else for (const k of [...KINDS, ...SMALL_KINDS]) d.using.set(k, new Set(d.list(k).filter(() => rnd() < 0.4).map((b) => keyOf(k, b))));
      log.push(`${di} ${d.using.size ? 'plays' : 'stops playing'}`);
    } else if (r < 0.98) {
      d.link.fail5xx = 1 + int(2);
      log.push(`${di} 5xx`);
    } else {
      const tight = server.limits.items === DEFAULT_ACCOUNT_LIMITS.items;
      server.limits = { ...DEFAULT_ACCOUNT_LIMITS, items: tight ? Math.max(1, server.usage().items) : DEFAULT_ACCOUNT_LIMITS.items };
      log.push(`limit ${server.limits.items}`);
    }
  }

  // Everything back to normal; everybody syncs twice.
  server.limits = { ...DEFAULT_ACCOUNT_LIMITS };
  for (const d of devices) {
    d.link.online = true;
    d.link.fail5xx = 0;
    d.using.clear();
  }
  const context = () => `seed ${seed}, ${nDevices} devices\n${log.slice(ONE === null ? -40 : 0).join('\n')}`;
  for (let pass = 0; pass < 2; pass++) {
    for (const d of devices) {
      syncs++;
      expect(await d.sync(), context()).toEqual({ type: 'synced' });
    }
  }
  const seq = server.seq;
  for (const d of devices) await d.sync();
  expect(server.seq, `a third pass still wrote; ${context()}`).toBe(seq);

  // All equal, and equal to the server.
  const state = (d: Device) => KINDS.map((k) => d.local.items(k).sort((a, b) => ((a.id as string) < (b.id as string) ? -1 : 1)));
  const first = state(devices[0]!);
  for (const d of devices.slice(1)) expect(state(d), context()).toEqual(first);
  const codec = new ItemCodec(keys);
  for (const [ki, kind] of KINDS.entries()) {
    const live = server.all().filter((x) => x.kind === kind && !x.deleted);
    expect(live.length, context()).toBe(first[ki]!.length);
    for (const b of first[ki]!) {
      const sid = await codec.serverId(kind, b.id as string);
      const item = live.find((x) => x.id === sid);
      expect(item, context()).toBeDefined();
      expect(await codec.open(ITEM_SPECS[kind], sid, item!.blob!), context()).toEqual({ ok: true, body: b });
    }
    for (const d of devices) {
      expect(d.engine.status.get(), context()).toMatchObject({ state: 'synced', waiting: 0, held: 0 });
      for (const b of d.local.items(kind)) expect(validName(kind, b.name as string)).toBe(true);
    }
  }

  // No edit lost, nothing twice, nothing overwritten back.
  const finals = KINDS.flatMap((k, ki) => first[ki]!.map((b) => fingerprint(k, b)));
  expect(new Set(finals).size, `a version is there twice; ${context()}`).toBe(finals.length);
  const expected = [...written].filter((f) => !superseded.has(f)).sort();
  expect([...finals].sort(), context()).toEqual(expected);

  // The last-writer kinds: the same everywhere (checked below with comm), and a version a player wrote.
  for (const kind of SMALL_KINDS) {
    for (const b of devices[0]!.local.items(kind)) expect(smallWritten.has(smallPrint(kind, b)), `${kind} ${canonicalJson(b)} nobody wrote; ${context()}`).toBe(true);
  }
  const smallState = (d: Device) =>
    [...SMALL_KINDS, 'comm' as const].map((k) =>
      d.local
        .items(k)
        .map((b) => (k === 'settings' ? { ...b, from: undefined } : b))
        .sort((a, b) => (keyOf(k, a) < keyOf(k, b) ? -1 : 1)),
    );
  const small0 = smallState(devices[0]!);
  for (const d of devices.slice(1)) expect(smallState(d), context()).toEqual(small0);
  for (const [ki, kind] of [...SMALL_KINDS, 'comm' as const].entries()) {
    const live = server.all().filter((x) => x.kind === kind && !x.deleted);
    expect(live.length, `${kind} on the server; ${context()}`).toBe(small0[ki]!.length);
    for (const b of small0[ki]!) {
      const sid = await codec.serverId(kind, keyOf(kind, b));
      const item = live.find((x) => x.id === sid);
      expect(item, context()).toBeDefined();
      const d = await codec.open(ITEM_SPECS[kind], sid, item!.blob!);
      expect(d.ok && (kind === 'settings' ? { ...d.body, from: undefined } : d.body), context()).toEqual(b);
    }
  }

  // Comm: every message of a kept day on every device exactly once; no day past `commDayKept` anywhere.
  const now = clock.t;
  const want = new Map<string, string[]>();
  for (const c of comms) if (commDayKept(c.day, now)) want.set(c.day, [...(want.get(c.day) ?? []), c.id]);
  for (const d of devices) {
    const have = new Map((d.local.items('comm') as unknown as CommItem[]).map((p) => [p.day, p.records.map(commIdentity)]));
    expect([...have.keys()].sort(), `comm days; ${context()}`).toEqual([...want.keys()].sort());
    for (const [day, ids] of want) {
      expect(d.local.rawComm(day).map(commIdentity).sort(), `comm ${day} on ${d.label}; ${context()}`).toEqual([...ids].sort());
      expect(have.get(day), `comm ${day} sorted; ${context()}`).toEqual((have.get(day) ?? []).slice().sort((a, b) => {
        const ta = (JSON.parse(a) as CommPieceRecord).ts;
        const tb = (JSON.parse(b) as CommPieceRecord).ts;
        return ta - tb || (a < b ? -1 : 1);
      }));
    }
  }
  const comm = comms.length;
  const oldDays = new Set(comms.filter((c) => !commDayKept(c.day, now)).map((c) => c.day)).size;

  const conflicts = devices.reduce((n, d) => n + d.events.filter((e) => e.type === 'keptBoth').length, 0);
  return { steps, syncs, conflicts, comm, oldDays, merges };
}

const ONE = process.env.SYNC_SEED ? Number(process.env.SYNC_SEED) : null;
/** `SYNC_SCALE=<n>`: n times the seeds (a longer hunt). */
const SCALE = Number(process.env.SYNC_SCALE ?? 1);

describe('generated runs', async () => {
  const keys = await deriveKeys(makeRoot());

  for (const [nDevices, base, steps] of [
    [2, 200, 60],
    [3, 200, 80],
    [3, 20, 400],
  ] as const) {
    const seeds = base * SCALE;
    it(`${nDevices} devices, ${ONE === null ? seeds : 1} seeds of ${steps} steps`, { timeout: 120_000 * SCALE }, async () => {
      const total: Run = { steps: 0, syncs: 0, conflicts: 0, comm: 0, oldDays: 0, merges: 0 };
      const list = ONE !== null ? [ONE] : Array.from({ length: seeds }, (_, i) => 1_000_000 * nDevices + i);
      for (const seed of list) {
        const r = await simulate(seed, nDevices, steps, keys);
        total.steps += r.steps;
        total.syncs += r.syncs;
        total.conflicts += r.conflicts;
        total.comm += r.comm;
        total.oldDays += r.oldDays;
        total.merges += r.merges;
      }
      // The runs must meet the cases they are for.
      if (ONE === null) {
        expect(total.conflicts).toBeGreaterThan(seeds / 4);
        expect(total.oldDays).toBeGreaterThan(seeds / 4);
        expect(total.merges).toBeGreaterThan(seeds / 4);
      }
      console.log(
        `sync property: ${nDevices} devices, ${list.length} seeds, ${total.steps} steps, ${total.syncs} syncs, ${total.conflicts} keep-both, ${total.comm} comm messages, ${total.merges} merges, ${total.oldDays} days aged out`,
      );
    });
  }
});
