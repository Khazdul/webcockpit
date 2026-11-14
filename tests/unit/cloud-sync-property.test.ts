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
// Seeded (mulberry32): a failure names its seed; `SYNC_SEED=<n>` runs one.

import { describe, expect, it } from 'vitest';
import { deriveKeys, makeRoot } from '../../src/cloud/crypto';
import { ItemCodec } from '../../src/cloud/sync/codec';
import { ITEM_SPECS, canonicalJson } from '../../src/cloud/sync/items';
import type { Body, SyncKeys } from '../../src/cloud/sync/types';
import { DEFAULT_ACCOUNT_LIMITS } from '../../shared/cloud/api.ts';
import { Device, ServerModel, prng, validName } from './cloud-sync-model';

const KINDS = ['profile', 'script'] as const;
type Kind = (typeof KINDS)[number];
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
}

async function simulate(seed: number, nDevices: number, steps: number, keys: SyncKeys): Promise<Run> {
  const rnd = prng(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)]!;
  const server = new ServerModel();
  const clock = { t: new Date(2026, 10, 14, 12).getTime(), now() { return this.t; } };
  // Half the devices pull in pages of 2–5, so `more` and the cursor are walked.
  const devices = Array.from({ length: nDevices }, (_, i) => new Device(server, keys, LABELS[i]!, clock, rnd() < 0.5 ? { pageSize: 2 + int(4) } : {}));
  const written = new Set<string>();
  const superseded = new Set<string>();
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
  const syncOne = async (d: Device, interleave: boolean) => {
    syncs++;
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
    }
  };

  for (let step = 0; step < steps; step++) {
    clock.t += int(6 * 3600_000);
    const d = pick(devices);
    const di = devices.indexOf(d);
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
      else for (const k of KINDS) d.using.set(k, new Set(d.list(k).filter(() => rnd() < 0.4).map((b) => b.id as string)));
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

  const conflicts = devices.reduce((n, d) => n + d.events.filter((e) => e.type === 'keptBoth').length, 0);
  return { steps, syncs, conflicts };
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
      const total: Run = { steps: 0, syncs: 0, conflicts: 0 };
      const list = ONE !== null ? [ONE] : Array.from({ length: seeds }, (_, i) => 1_000_000 * nDevices + i);
      for (const seed of list) {
        const r = await simulate(seed, nDevices, steps, keys);
        total.steps += r.steps;
        total.syncs += r.syncs;
        total.conflicts += r.conflicts;
      }
      // The runs must meet the cases they are for.
      if (ONE === null) expect(total.conflicts).toBeGreaterThan(seeds / 4);
      console.log(`sync property: ${nDevices} devices, ${list.length} seeds, ${total.steps} steps, ${total.syncs} syncs, ${total.conflicts} keep-both`);
    });
  }
});
